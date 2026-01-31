import { StorageStrategy, QueryMatcher, SchemaRecord } from './storage-strategy'
import { DuplicateKeyError } from '../schema'

// Index metadata structure
type IndexMetadata<T> = {
  fields: Array<keyof T>
  map: Map<string, T[]>
  unique: boolean
}

// In-memory storage strategy with efficient indexing
export class MemoryStorageStrategy<T extends object> implements StorageStrategy<T> {
  private _data: T[] = []
  private _indexes: Map<string, IndexMetadata<T>> = new Map()

  async initialize(): Promise<void> {
    // No initialization needed for memory storage
  }

  async getAll(): Promise<T[]> {
    return [...this._data] // Return copy to prevent external mutation
  }

  async add(doc: T): Promise<void> {
    this._data.push(doc)
    this._updateIndexes(doc)
  }

  async addMany(docs: T[]): Promise<void> {
    this._data.push(...docs)
    for (const doc of docs) {
      this._updateIndexes(doc)
    }
  }

  async update(_oldDoc: T, _newDoc: T): Promise<void> {
    // Update happens in-place, no action needed
    // (The oldDoc reference is already in _data and was mutated)
  }

  async remove(doc: T): Promise<void> {
    const index = this._data.indexOf(doc)
    if (index > -1) {
      this._data.splice(index, 1)
    }
  }

  async removeMany(docs: T[]): Promise<void> {
    for (const doc of docs) {
      const index = this._data.indexOf(doc)
      if (index > -1) {
        this._data.splice(index, 1)
      }
    }
  }

  async clear(): Promise<void> {
    this._data = []
    this._indexes.clear()
  }

  async drop(): Promise<void> {
    // For memory storage, drop is the same as clear
    await this.clear()
  }

  // Index management
  async createIndex(
    fields: keyof T | Array<keyof T>,
    options?: { unique?: boolean }
  ): Promise<void> {
    const normalizedFields = Array.isArray(fields) ? fields : [fields]
    const sortedFields = [...normalizedFields].sort()
    const indexKey = sortedFields.join(',')

    // Build the index map
    const map = new Map<string, T[]>()
    for (const doc of this._data) {
      const compositeKey = sortedFields.map(f => String(doc[f])).join(':')
      if (!map.has(compositeKey)) map.set(compositeKey, [])
      map.get(compositeKey)!.push(doc)
    }

    // Store index with metadata
    this._indexes.set(indexKey, {
      fields: sortedFields as Array<keyof T>,
      map,
      unique: options?.unique || false
    })
  }

  async rebuildIndexes(): Promise<void> {
    // Rebuild all indexes from scratch
    for (const indexMeta of this._indexes.values()) {
      indexMeta.map.clear()

      for (const doc of this._data) {
        const compositeKey = indexMeta.fields.map(f => String(doc[f])).join(':')
        if (!indexMeta.map.has(compositeKey)) indexMeta.map.set(compositeKey, [])
        indexMeta.map.get(compositeKey)!.push(doc)
      }
    }
  }

  updateIndexForDocument(oldDoc: T | null, newDoc: T | null): void {
    // Efficiently update indexes for a single document change
    for (const indexMeta of this._indexes.values()) {
      // Remove old index entry if document existed before
      if (oldDoc) {
        const oldKey = indexMeta.fields.map(f => String(oldDoc[f])).join(':')
        const oldBucket = indexMeta.map.get(oldKey)
        if (oldBucket) {
          const idx = oldBucket.indexOf(oldDoc)
          if (idx > -1) {
            oldBucket.splice(idx, 1)
            if (oldBucket.length === 0) {
              indexMeta.map.delete(oldKey)
            }
          }
        }
      }

      // Add new index entry if document exists after
      if (newDoc) {
        const newKey = indexMeta.fields.map(f => String(newDoc[f])).join(':')
        if (!indexMeta.map.has(newKey)) {
          indexMeta.map.set(newKey, [])
        }
        indexMeta.map.get(newKey)!.push(newDoc)
      }
    }
  }

  private _updateIndexes(doc: T): void {
    for (const indexMeta of this._indexes.values()) {
      const compositeKey = indexMeta.fields.map(f => String(doc[f])).join(':')
      if (!indexMeta.map.has(compositeKey)) indexMeta.map.set(compositeKey, [])
      indexMeta.map.get(compositeKey)!.push(doc)
    }
  }

  // Unique constraint checking
  checkUniqueConstraints(doc: Partial<T>, excludeDoc?: T): void {
    for (const indexMeta of this._indexes.values()) {
      if (!indexMeta.unique) continue

      // Build composite key from document values
      const compositeKey = indexMeta.fields.map(f => String(doc[f])).join(':')

      // Check if this combination already exists in the index
      const existingDocs = indexMeta.map.get(compositeKey) || []

      // Filter out the document being updated (if any)
      const duplicates = excludeDoc ? existingDocs.filter(d => d !== excludeDoc) : existingDocs

      if (duplicates.length > 0) {
        throw new DuplicateKeyError(indexMeta.fields as string[])
      }
    }
  }

  // Efficient querying using indexes (now async for consistency)
  async findDocuments(
    matcher: QueryMatcher<T>,
    indexHint?: {
      fields: Array<keyof T>
      values: Record<string, unknown>
    }
  ): Promise<T[]> {
    // If no index hint, use linear scan (filter directly, no copy needed)
    if (!indexHint) {
      return this._data.filter(matcher)
    }

    const sortedFields = [...indexHint.fields].sort()
    const indexKey = sortedFields.join(',')

    // Try exact index match first
    const exactIndex = this._indexes.get(indexKey)
    if (exactIndex) {
      const compositeKey = sortedFields.map(f => String(indexHint.values[f as string])).join(':')
      // For exact index match, return directly (no need to filter)
      return exactIndex.map.get(compositeKey) || []
    }

    // Try partial index match
    for (const indexMeta of this._indexes.values()) {
      const idxFieldStrs = indexMeta.fields.map(String)

      // Check if all index fields are in the hint
      const allIndexFieldsInHint = idxFieldStrs.every(f => indexHint.fields.map(String).includes(f))

      if (allIndexFieldsInHint) {
        const compositeKey = (indexMeta.fields as Array<string>)
          .map(field => String(indexHint.values[field]))
          .join(':')
        const candidates = indexMeta.map.get(compositeKey) || []
        return candidates.filter(matcher)
      }
    }

    // Fallback: linear scan
    return this._data.filter(matcher)
  }

  // ============================================================================
  // SCHEMA TRACKING METHODS (Stubs - memory storage is not persistent)
  // ============================================================================

  /**
   * Memory storage doesn't persist schemas, so this is a no-op
   */
  async recordSchema(_schemaData: {
    modelName: string
    version: string
    definition: Record<string, unknown>
    indexes: Array<{ fields: string[]; unique: boolean }>
    options: Record<string, unknown>
  }): Promise<void> {
    // No-op: memory storage is not persistent
  }

  /**
   * Memory storage doesn't persist schemas, so this always returns null
   */
  async getSchema(_modelName: string): Promise<SchemaRecord | null> {
    return null
  }
}
