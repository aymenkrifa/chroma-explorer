import { ChromaClient, IEmbeddingFunction } from 'chromadb'
import { CollectionInfo } from './types'

// Custom error preserved so call sites that catch it still compile, but the
// stripped-down v1 build doesn't currently throw it from anywhere.
export class EmbeddingCredentialsError extends Error {
  constructor(
    public provider: string,
    public envVar: string,
    message?: string
  ) {
    super(message || `${provider} API key not configured. Set the ${envVar} in the connection settings.`)
    this.name = 'EmbeddingCredentialsError'
  }
}

type EFConfig = CollectionInfo['embeddingFunction']

/**
 * v1-build stub. The original factory pulled a per-provider EF from
 * @chroma-core/* packages; those are v2-only. Here every collection just
 * uses the SDK's built-in default (DefaultEmbeddingFunction is applied
 * by chromadb internally when no EF is passed), so we always return
 * undefined and let the SDK pick.
 *
 * Server-side queries that don't involve client-side text embedding
 * (get-by-id, get-by-where, raw-vector queryEmbeddings) work unchanged.
 */
export class EmbeddingFunctionFactory {
  private client: ChromaClient

  constructor(client: ChromaClient) {
    this.client = client
  }

  async getEmbeddingFunction(
    _collectionName: string,
    _efConfig?: EFConfig | null
  ): Promise<IEmbeddingFunction | undefined> {
    return undefined
  }

  clearCache(): void {
    // no-op
  }
}
