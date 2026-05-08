import {
  ChromaClient,
  Collection,
  IEmbeddingFunction,
} from 'chromadb'
import {
  ConnectionProfile,
  CollectionInfo,
  DocumentRecord,
  SearchDocumentsParams,
  UpdateDocumentParams,
  CreateDocumentParams,
  DeleteDocumentsParams,
  CreateDocumentsBatchParams,
  CreateCollectionParams,
  CopyCollectionParams,
  CopyCollectionResult,
  CopyProgress,
  EmbeddingFunctionOverride,
} from './types'
import { EmbeddingFunctionFactory } from './embedding-function-factory'

type Metadata = Record<string, string | number | boolean>

class ChromaDBService {
  private client: ChromaClient | null = null
  private efFactory: EmbeddingFunctionFactory | null = null
  private profile: ConnectionProfile | null = null
  private collectionsCache: CollectionInfo[] = []

  getProfile(): ConnectionProfile | null {
    return this.profile
  }

  async connect(profile: ConnectionProfile): Promise<void> {
    let resolvedTarget = profile.url
    let isCloud = false

    try {
      let parsedUrl: URL | null = null
      try {
        parsedUrl = new URL(profile.url)
      } catch {
        parsedUrl = null
      }

      isCloud = profile.connectionType
        ? profile.connectionType === 'cloud'
        : (parsedUrl?.hostname.endsWith('trychroma.com') ?? false)

      if (!parsedUrl) {
        throw new Error(`Invalid URL: "${profile.url}"`)
      }

      // chromadb v1 has no CloudClient — for "cloud" profiles we route everything
      // through ChromaClient with the cloud host as path + tenant/database/apiKey.
      const path = `${parsedUrl.protocol}//${parsedUrl.host}`

      const clientArgs: ConstructorParameters<typeof ChromaClient>[0] = {
        path,
      }

      if (profile.tenant) clientArgs.tenant = profile.tenant
      if (profile.database) clientArgs.database = profile.database

      if (isCloud && profile.apiKey) {
        clientArgs.auth = {
          provider: 'token',
          credentials: profile.apiKey,
          providerOptions: { headerType: 'X_CHROMA_TOKEN' },
        }
      } else if (profile.authType === 'token' && profile.authToken) {
        clientArgs.auth = {
          provider: 'token',
          credentials: profile.authToken,
          providerOptions: {
            headerType: profile.authTokenHeader === 'x-chroma-token'
              ? 'X_CHROMA_TOKEN'
              : 'AUTHORIZATION',
          },
        }
      } else if (profile.authType === 'basic' && profile.authCredentials) {
        clientArgs.auth = {
          provider: 'basic',
          credentials: profile.authCredentials,
        }
      }

      resolvedTarget = isCloud ? `Chroma Cloud (${parsedUrl.host})` : path
      this.client = new ChromaClient(clientArgs)

      await this.client.heartbeat()

      this.efFactory = new EmbeddingFunctionFactory(this.client)
      this.profile = profile
    } catch (error) {
      this.client = null
      this.efFactory = null
      this.profile = null
      throw this.mapConnectError(error, profile, resolvedTarget, isCloud)
    }
  }

  private mapConnectError(
    error: unknown,
    profile: ConnectionProfile,
    resolvedTarget: string,
    isCloud: boolean
  ): Error {
    const authMode = isCloud
      ? (profile.apiKey ? 'Chroma Cloud API key' : 'no API key')
      : profile.authType === 'token'
        ? `token auth via ${profile.authTokenHeader === 'x-chroma-token' ? 'X-Chroma-Token' : 'Authorization: Bearer'}`
        : profile.authType === 'basic'
          ? 'basic auth'
          : 'no auth'

    const tenantPart = profile.tenant ? `, tenant="${profile.tenant}"` : ''
    const dbPart = profile.database ? `, database="${profile.database}"` : ''
    const ctx = `(${resolvedTarget}${tenantPart}${dbPart}, ${authMode})`

    const message = error instanceof Error ? error.message : 'Unknown error'
    const lower = message.toLowerCase()

    if (lower.includes('401') || lower.includes('unauthor')) {
      const credName = isCloud
        ? 'API key'
        : profile.authType === 'basic'
          ? 'username/password'
          : 'token'
      return new Error(
        `Authentication failed: the server rejected the ${credName}. ` +
        `Verify the credential is correct and matches the server's auth provider. ${ctx}`
      )
    }
    if (lower.includes('403') || lower.includes('forbidden')) {
      return new Error(
        `Authenticated, but not authorized to access this tenant/database. ` +
        `Check that the tenant and database names exist and your credential has access. ${ctx}`
      )
    }
    if (lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('failed to fetch') || lower.includes('network')) {
      return new Error(
        `Could not reach the Chroma server. Check that it is running and the URL is correct. ${ctx}`
      )
    }

    return new Error(`${message} ${ctx}`)
  }

  disconnect(): void {
    this.efFactory?.clearCache()
    this.efFactory = null
    this.client = null
    this.profile = null
    this.collectionsCache = []
  }

  async listCollections(): Promise<CollectionInfo[]> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    // chromadb v1 listCollections returns CollectionParams[] (just metadata, not Collection instances).
    // Cast to any for cross-version safety.
    const raw = (await (this.client as any).listCollections()) as Array<any>

    const collectionsWithCounts = await Promise.all(
      raw.map(async (item) => {
        const name: string = item.name
        const id: string = item.id ?? ''
        const rawMeta = item.metadata ?? null

        // Server 0.5.5 doesn't return a `configuration` block; embedding-function info,
        // if present at all, lives in metadata under hnsw:* / chroma:* keys. We surface
        // nothing here and let the UI/factory treat it as null.
        let count = 0
        try {
          const collection = await this.client!.getCollection({
            name,
            // No EF — count() doesn't need one.
            embeddingFunction: undefined as unknown as IEmbeddingFunction,
          })
          count = await collection.count()
        } catch (err) {
          console.warn(`[ChromaDB Service] Failed to count collection "${name}":`, err)
        }

        const info: CollectionInfo = {
          name,
          id,
          metadata: rawMeta,
          count,
          embeddingFunction: null,
        }
        return info
      })
    )

    this.collectionsCache = collectionsWithCounts
    return collectionsWithCounts
  }

  private async getCollectionWithEf(
    collectionName: string,
    embeddingFunction?: IEmbeddingFunction
  ): Promise<Collection> {
    return this.client!.getCollection({
      name: collectionName,
      embeddingFunction: embeddingFunction as unknown as IEmbeddingFunction,
    })
  }

  async getCollectionDocuments(collectionName: string): Promise<DocumentRecord[]> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    const collection = await this.getCollectionWithEf(collectionName)
    const results = await collection.get()

    const documents: DocumentRecord[] = []
    const count = results.ids.length

    for (let i = 0; i < count; i++) {
      documents.push({
        id: results.ids[i],
        document: results.documents?.[i] || null,
        metadata: (results.metadatas?.[i] as Record<string, unknown> | null) || null,
        embedding: (results.embeddings?.[i] as number[] | undefined) ?? null,
      })
    }

    return documents
  }

  async searchDocuments(
    params: SearchDocumentsParams,
    _embeddingOverride?: EmbeddingFunctionOverride | null
  ): Promise<DocumentRecord[]> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    if (params.queryText && params.queryText.trim() !== '') {
      // No client-side embedding providers in this build. We hand the raw text to
      // the SDK's default embedder; if the server collection uses a different
      // EF (OpenAI etc.), distances won't be comparable and results will be junk.
      // Use ID/metadata filtering instead for those collections.
      const ef = await this.efFactory?.getEmbeddingFunction(params.collectionName, null)
      const collection = await this.getCollectionWithEf(params.collectionName, ef)

      const queryOptions: any = {
        queryTexts: [params.queryText],
        where: params.metadataFilter,
        include: ['documents', 'metadatas', 'embeddings', 'distances'],
      }
      if (params.nResults !== 0) {
        queryOptions.nResults = params.nResults || 10
      }

      const queryResults = await collection.query(queryOptions)

      const documents: DocumentRecord[] = (queryResults.ids?.[0] || []).map((_id: string, i: number) => ({
        id: queryResults.ids?.[0]?.[i] || '',
        document: queryResults.documents?.[0]?.[i] || null,
        metadata: (queryResults.metadatas?.[0]?.[i] as Record<string, unknown> | null) || null,
        embedding: (queryResults.embeddings?.[0]?.[i] as number[] | undefined) ?? null,
        distance: queryResults.distances?.[0]?.[i] ?? null,
      }))

      return documents
    }

    const collection = await this.getCollectionWithEf(params.collectionName)

    const getOptions: any = {
      where: params.metadataFilter,
      offset: params.offset || 0,
      include: ['documents', 'metadatas', 'embeddings'],
    }

    if (params.ids && params.ids.length > 0) {
      getOptions.ids = params.ids
    }

    // Honor the UI's "Limit" dropdown for browse / metadata / ID filters too.
    // nResults === 0 means "no limit"; otherwise prefer the explicit limit if
    // the caller set one, then nResults, then a 300 safety cap.
    if (params.nResults !== 0) {
      getOptions.limit = params.limit ?? params.nResults ?? 300
    }
    const getResults = await collection.get(getOptions)

    const documents: DocumentRecord[] = (getResults.ids || []).map((id: string, i: number) => ({
      id,
      document: getResults.documents?.[i] || null,
      metadata: (getResults.metadatas?.[i] as Record<string, unknown> | null) || null,
      embedding: (getResults.embeddings?.[i] as number[] | undefined) ?? null,
    }))

    return documents
  }

  async updateDocument(
    params: UpdateDocumentParams,
    _embeddingOverride?: EmbeddingFunctionOverride | null
  ): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    const ef = params.regenerateEmbedding
      ? await this.efFactory?.getEmbeddingFunction(params.collectionName, null)
      : undefined

    const collection = await this.getCollectionWithEf(params.collectionName, ef)

    const updatePayload: any = {
      ids: [params.documentId],
    }

    if (params.document !== undefined) {
      updatePayload.documents = [params.document]
    }
    if (params.metadata !== undefined) {
      updatePayload.metadatas = [params.metadata as Metadata]
    }
    if (params.embedding !== undefined && !params.regenerateEmbedding) {
      updatePayload.embeddings = [params.embedding]
    }

    await collection.update(updatePayload)
  }

  async createDocument(
    params: CreateDocumentParams,
    _embeddingOverride?: EmbeddingFunctionOverride | null
  ): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    const ef = params.generateEmbedding
      ? await this.efFactory?.getEmbeddingFunction(params.collectionName, null)
      : undefined

    const collection = await this.getCollectionWithEf(params.collectionName, ef)

    const addPayload: any = {
      ids: [params.id],
    }

    if (params.document !== undefined) {
      addPayload.documents = [params.document]
    }
    if (params.metadata !== undefined) {
      addPayload.metadatas = [params.metadata as Metadata]
    }
    if (params.embedding !== undefined && !params.generateEmbedding) {
      addPayload.embeddings = [params.embedding]
    }

    await collection.add(addPayload)
  }

  async deleteDocuments(params: DeleteDocumentsParams): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    const collection = await this.getCollectionWithEf(params.collectionName)

    await collection.delete({
      ids: params.ids,
    })
  }

  async createDocumentsBatch(
    params: CreateDocumentsBatchParams,
    _embeddingOverride?: EmbeddingFunctionOverride | null
  ): Promise<{ createdIds: string[]; errors: string[] }> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    const BATCH_SIZE = 100

    const ef = params.generateEmbeddings
      ? await this.efFactory?.getEmbeddingFunction(params.collectionName, null)
      : undefined

    const collection = await this.getCollectionWithEf(params.collectionName, ef)

    const createdIds: string[] = []
    const errors: string[] = []

    const totalDocs = params.documents.length
    const totalBatches = Math.ceil(totalDocs / BATCH_SIZE)

    for (let i = 0; i < totalBatches; i++) {
      const start = i * BATCH_SIZE
      const end = Math.min(start + BATCH_SIZE, totalDocs)
      const batch = params.documents.slice(start, end)

      try {
        const addPayload: any = {
          ids: batch.map(d => d.id),
        }

        const documents = batch.map(d => d.document).filter((d): d is string => d !== undefined)
        if (documents.length > 0) {
          addPayload.documents = batch.map(d => d.document || '')
        }

        const metadatas = batch.map(d => d.metadata).filter((m): m is Record<string, unknown> => m !== undefined)
        if (metadatas.length > 0) {
          addPayload.metadatas = batch.map(d => (d.metadata || {}) as Metadata)
        }

        await collection.add(addPayload)
        createdIds.push(...batch.map(d => d.id))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Batch ${i + 1}: ${message}`)
      }
    }

    return { createdIds, errors }
  }

  async createCollection(params: CreateCollectionParams): Promise<CollectionInfo> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    const ef = await this.efFactory?.getEmbeddingFunction(params.name, null)

    const collectionMetadata: Record<string, unknown> = { ...params.metadata }

    if (params.hnsw) {
      if (params.hnsw.space) collectionMetadata['hnsw:space'] = params.hnsw.space
      if (params.hnsw.efConstruction !== undefined) collectionMetadata['hnsw:construction_ef'] = params.hnsw.efConstruction
      if (params.hnsw.efSearch !== undefined) collectionMetadata['hnsw:search_ef'] = params.hnsw.efSearch
      if (params.hnsw.maxNeighbors !== undefined) collectionMetadata['hnsw:M'] = params.hnsw.maxNeighbors
      if (params.hnsw.numThreads !== undefined) collectionMetadata['hnsw:num_threads'] = params.hnsw.numThreads
      if (params.hnsw.batchSize !== undefined) collectionMetadata['hnsw:batch_size'] = params.hnsw.batchSize
      if (params.hnsw.syncThreshold !== undefined) collectionMetadata['hnsw:sync_threshold'] = params.hnsw.syncThreshold
      if (params.hnsw.resizeFactor !== undefined) collectionMetadata['hnsw:resize_factor'] = params.hnsw.resizeFactor
    }

    const collection = await this.client.createCollection({
      name: params.name,
      embeddingFunction: ef as unknown as IEmbeddingFunction,
      metadata: Object.keys(collectionMetadata).length > 0 ? collectionMetadata as Metadata : undefined,
    })

    if (params.firstDocument) {
      const addPayload: any = {
        ids: [params.firstDocument.id],
      }

      if (params.firstDocument.document !== undefined && params.firstDocument.document !== null) {
        addPayload.documents = [params.firstDocument.document]
      }
      if (params.firstDocument.metadata && Object.keys(params.firstDocument.metadata).length > 0) {
        addPayload.metadatas = [params.firstDocument.metadata as Metadata]
      }

      if (addPayload.documents && addPayload.documents.length > 0 && addPayload.documents[0]) {
        await collection.add(addPayload)
      } else {
        console.warn('[ChromaDB Service] Skipping first document - no document text provided')
      }
    }

    const count = await collection.count()
    return {
      name: collection.name,
      id: collection.id,
      metadata: (collection.metadata as Record<string, unknown> | null) ?? null,
      count,
      embeddingFunction: null,
    }
  }

  async copyCollection(
    params: CopyCollectionParams,
    _embeddingOverride: EmbeddingFunctionOverride | null,
    onProgress: (progress: CopyProgress) => void,
    signal?: AbortSignal
  ): Promise<CopyCollectionResult> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    const BATCH_SIZE = 50

    try {
      onProgress({
        phase: 'creating',
        totalDocuments: 0,
        processedDocuments: 0,
        message: 'Creating collection...',
      })

      if (signal?.aborted) {
        return {
          success: false,
          totalDocuments: 0,
          copiedDocuments: 0,
          error: 'Operation cancelled',
        }
      }

      const ef = await this.efFactory?.getEmbeddingFunction(params.targetName, null)

      const collectionMetadata: Record<string, unknown> = { ...params.metadata }
      if (params.hnsw) {
        if (params.hnsw.space) collectionMetadata['hnsw:space'] = params.hnsw.space
        if (params.hnsw.efConstruction !== undefined) collectionMetadata['hnsw:construction_ef'] = params.hnsw.efConstruction
        if (params.hnsw.efSearch !== undefined) collectionMetadata['hnsw:search_ef'] = params.hnsw.efSearch
        if (params.hnsw.maxNeighbors !== undefined) collectionMetadata['hnsw:M'] = params.hnsw.maxNeighbors
        if (params.hnsw.numThreads !== undefined) collectionMetadata['hnsw:num_threads'] = params.hnsw.numThreads
        if (params.hnsw.batchSize !== undefined) collectionMetadata['hnsw:batch_size'] = params.hnsw.batchSize
        if (params.hnsw.syncThreshold !== undefined) collectionMetadata['hnsw:sync_threshold'] = params.hnsw.syncThreshold
        if (params.hnsw.resizeFactor !== undefined) collectionMetadata['hnsw:resize_factor'] = params.hnsw.resizeFactor
      }

      const targetCollection = await this.client.createCollection({
        name: params.targetName,
        embeddingFunction: ef as unknown as IEmbeddingFunction,
        metadata: Object.keys(collectionMetadata).length > 0 ? collectionMetadata as Metadata : undefined,
      })

      const sourceCollection = await this.getCollectionWithEf(params.sourceCollectionName)

      const allDocs = await sourceCollection.get({
        include: ['documents', 'metadatas', 'embeddings'] as any,
      })

      const totalDocuments = allDocs.ids.length

      if (totalDocuments === 0) {
        onProgress({
          phase: 'complete',
          totalDocuments: 0,
          processedDocuments: 0,
          message: 'Collection copied (empty)',
        })

        return {
          success: true,
          collectionInfo: {
            name: targetCollection.name,
            id: targetCollection.id,
            metadata: (targetCollection.metadata as Record<string, unknown> | null) ?? null,
            count: 0,
            embeddingFunction: null,
          },
          totalDocuments: 0,
          copiedDocuments: 0,
        }
      }

      const totalBatches = Math.ceil(totalDocuments / BATCH_SIZE)
      let copiedDocuments = 0

      for (let i = 0; i < totalBatches; i++) {
        if (signal?.aborted) {
          try {
            await this.client.deleteCollection({ name: params.targetName })
          } catch {}

          return {
            success: false,
            totalDocuments,
            copiedDocuments,
            error: 'Operation cancelled',
          }
        }

        const start = i * BATCH_SIZE
        const end = Math.min(start + BATCH_SIZE, totalDocuments)

        onProgress({
          phase: 'copying',
          totalDocuments,
          processedDocuments: copiedDocuments,
          message: `Copying documents... ${copiedDocuments}/${totalDocuments}`,
        })

        const batchPayload: any = {
          ids: allDocs.ids.slice(start, end),
        }

        if (allDocs.documents) {
          batchPayload.documents = allDocs.documents.slice(start, end)
        }
        if (allDocs.metadatas) {
          batchPayload.metadatas = allDocs.metadatas.slice(start, end)
        }
        if (!params.regenerateEmbeddings && allDocs.embeddings) {
          batchPayload.embeddings = allDocs.embeddings.slice(start, end) as number[][]
        }

        await targetCollection.add(batchPayload)
        copiedDocuments = end
      }

      onProgress({
        phase: 'complete',
        totalDocuments,
        processedDocuments: copiedDocuments,
        message: `Copied ${copiedDocuments} documents`,
      })

      const finalCount = await targetCollection.count()

      return {
        success: true,
        collectionInfo: {
          name: targetCollection.name,
          id: targetCollection.id,
          metadata: (targetCollection.metadata as Record<string, unknown> | null) ?? null,
          count: finalCount,
          embeddingFunction: null,
        },
        totalDocuments,
        copiedDocuments,
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy collection'

      onProgress({
        phase: 'error',
        totalDocuments: 0,
        processedDocuments: 0,
        message,
      })

      return {
        success: false,
        totalDocuments: 0,
        copiedDocuments: 0,
        error: message,
      }
    }
  }

  async deleteCollection(collectionName: string): Promise<void> {
    if (!this.client) {
      throw new Error('ChromaDB client not connected. Please connect first.')
    }

    await this.client.deleteCollection({ name: collectionName })
  }

  isConnected(): boolean {
    return this.client !== null
  }
}

class ChromaDBConnectionPool {
  private connections: Map<string, { service: ChromaDBService; refCount: number }> = new Map()

  async connect(profileId: string, profile: ConnectionProfile): Promise<ChromaDBService> {
    const existing = this.connections.get(profileId)

    if (existing) {
      existing.refCount++
      console.log(`[ChromaDB Pool] Reusing connection for profile ${profileId} (refCount: ${existing.refCount})`)
      return existing.service
    }

    const service = new ChromaDBService()
    await service.connect(profile)

    this.connections.set(profileId, {
      service,
      refCount: 1,
    })

    console.log(`[ChromaDB Pool] Created new connection for profile ${profileId}`)
    return service
  }

  disconnect(profileId: string): void {
    const connection = this.connections.get(profileId)

    if (!connection) {
      console.warn(`[ChromaDB Pool] Attempted to disconnect unknown profile ${profileId}`)
      return
    }

    connection.refCount--
    console.log(`[ChromaDB Pool] Decremented refCount for profile ${profileId} (refCount: ${connection.refCount})`)

    if (connection.refCount <= 0) {
      connection.service.disconnect()
      this.connections.delete(profileId)
      console.log(`[ChromaDB Pool] Disconnected and removed profile ${profileId}`)
    }
  }

  getConnection(profileId: string): ChromaDBService | null {
    return this.connections.get(profileId)?.service || null
  }

  isConnected(profileId: string): boolean {
    return this.connections.has(profileId)
  }

  getRefCount(profileId: string): number {
    return this.connections.get(profileId)?.refCount || 0
  }
}

export const chromaDBConnectionPool = new ChromaDBConnectionPool()
export const chromaDBService = new ChromaDBService()
