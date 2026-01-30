// Query matching function type
export type QueryMatcher<T> = (doc: T) => boolean

// Import types for native SQL methods
import type { Query, QueryOptions, Update } from '../model'
import type { AggregationPipeline } from '../aggregation'

// Schema record type for tracking
export type SchemaRecord = {
  modelName: string
  version: string
  definition: Record<string, unknown>
  indexes: Array<{ fields: string[]; unique: boolean }>
  options: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

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

  // Efficient querying using indexes (now async for consistency)
  findDocuments(
    matcher: QueryMatcher<T>,
    indexHint?: {
      fields: Array<keyof T>
      values: Record<string, unknown>
    }
  ): Promise<T[]>

  // Optional SQL-native methods (for SQL-capable storage strategies like SQLite)
  // These methods allow direct SQL execution, bypassing JavaScript query matching
  queryNative?(query: Query<T>, options?: QueryOptions<T>): Promise<T[]>
  updateNative?(query: Query<T>, update: Update<T>): Promise<{ modifiedCount: number }>
  deleteNative?(query: Query<T>): Promise<{ deletedCount: number }>
  countNative?(query: Query<T>): Promise<number>
  aggregateNative?<R = Record<string, unknown>>(pipeline: AggregationPipeline<T>): Promise<R[]>

  // Optional schema tracking methods (for persistent storage strategies)
  recordSchema?(schemaData: SchemaRecord): Promise<void>
  getSchema?(modelName: string): Promise<SchemaRecord | null>
}
