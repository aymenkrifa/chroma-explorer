export type MetadataOperator =
  | '$eq'
  | '$ne'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'

export interface MetadataFilter {
  id: string // UUID for React keys
  key: string
  operator: MetadataOperator
  value: string
}

export interface DocumentFilters {
  queryText: string
  nResults: number // Max results for semantic search
  metadataFilters: MetadataFilter[]
}

// New filter row types
export type FilterRowType = 'search' | 'metadata' | 'select' | 'date'

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last-7-days'
  | 'last-30-days'
  | 'this-month'
  | 'custom'

export interface FilterRow {
  id: string
  type: FilterRowType
  // For search type
  searchValue?: string
  // For metadata type
  metadataKey?: string
  operator?: MetadataOperator
  metadataValue?: string
  // For select type
  selectField?: 'id'
  selectValue?: string
  // For date type. Stored as YYYY-MM-DD; converted to Unix-seconds
  // bounds at query time. Either side may be empty for open-ended ranges.
  dateField?: string // metadata field name, defaults to 'timestamp'
  dateFrom?: string
  dateTo?: string
  datePreset?: DatePreset
}
