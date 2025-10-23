// Query matching function type
export type QueryMatcher<T> = (doc: T) => boolean

// Storage Strategy Interface - enables pluggable storage backends
export interface StorageStrategy<T extends object = Record<string, unknown>> {
  // Initialize the storage (load from disk, connect to DB, etc.)
  initialize(): Promise<void>

  // Retrieve all documents
  getAll(): Promise<T[]>

  // Add a single document
  add(doc: T): Promise<void>

  // Add multiple documents
  addMany(docs: T[]): Promise<void>

  // Update a document (oldDoc reference -> newDoc values)
  update(oldDoc: T, newDoc: T): Promise<void>

  // Remove a single document
  remove(doc: T): Promise<void>

  // Remove multiple documents
  removeMany(docs: T[]): Promise<void>

  // Clear all documents
  clear(): Promise<void>

  // Index management
  createIndex(fields: keyof T | Array<keyof T>, options?: { unique?: boolean }): Promise<void>
  rebuildIndexes(): Promise<void>
  updateIndexForDocument(oldDoc: T | null, newDoc: T | null): void

  // Unique constraint checking
  checkUniqueConstraints(doc: Partial<T>, excludeDoc?: T): void

  // Efficient querying using indexes
  findDocuments(
    matcher: QueryMatcher<T>,
    indexHint?: {
      fields: Array<keyof T>
      values: Record<string, unknown>
    }
  ): T[]
}
