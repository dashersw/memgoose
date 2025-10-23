import { StorageStrategy, QueryMatcher } from './storage-strategy'
import * as path from 'path'
import * as fs from 'fs'

// Dynamically import better-sqlite3 to handle when it's not installed
let Database: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Database = require('better-sqlite3')
} catch {
  // Will throw a better error message in constructor if user tries to use SQLite without installing it
  Database = null
}

export interface SqliteStorageOptions {
  dataPath: string
  modelName: string
}

// Query index metadata structure
type QueryIndexMetadata<T> = {
  fields: Array<keyof T>
  map: Map<string, T[]>
  unique: boolean
}

// Type definitions for better-sqlite3 (when installed)
type DatabaseInstance = any // Will be Database.Database when installed
type StatementInstance = any // Will be Database.Statement when installed

// SQLite storage strategy with efficient indexing
export class SqliteStorageStrategy<T extends object> implements StorageStrategy<T> {
  private _data: T[] = []
  private _db: DatabaseInstance | null = null
  private _dataPath: string
  private _modelName: string
  private _dbFilePath: string
  private _tableName: string
  private _getDocId: (doc: T) => string
  private _queryIndexes: Map<string, QueryIndexMetadata<T>> = new Map()
  private _initialized: boolean = false
  private _pendingIndexes: Array<{
    fields: keyof T | Array<keyof T>
    options?: { unique?: boolean }
  }> = []

  // Prepared statements for performance
  private _insertStmt?: StatementInstance
  private _updateStmt?: StatementInstance
  private _deleteStmt?: StatementInstance
  private _selectAllStmt?: StatementInstance
  private _selectByIdStmt?: StatementInstance

  constructor(options: SqliteStorageOptions) {
    // Check if better-sqlite3 is installed
    if (!Database) {
      throw new Error(
        'SQLite storage requires the "better-sqlite3" package to be installed.\n' +
          'Install it with: npm install better-sqlite3\n' +
          'Or use a different storage strategy (memory or file).'
      )
    }

    this._dataPath = options.dataPath
    this._modelName = options.modelName
    this._dbFilePath = path.join(this._dataPath, `${this._modelName}.db`)
    this._tableName = `${this._modelName}_docs`

    // Function to extract document ID (assumes _id field)
    this._getDocId = (doc: T) => {
      const docRecord = doc as Record<string, unknown>
      if (docRecord._id) return String(docRecord._id)
      // Fallback: use entire document as key (not ideal, but works)
      return JSON.stringify(doc)
    }
  }

  async initialize(): Promise<void> {
    // Ensure data directory exists
    if (!fs.existsSync(this._dataPath)) {
      fs.mkdirSync(this._dataPath, { recursive: true })
    }

    // Open database
    this._db = new Database(this._dbFilePath)

    // Enable WAL mode for better concurrency
    this._db.pragma('journal_mode = WAL')
    // Set reasonable busy timeout (5 seconds)
    this._db.pragma('busy_timeout = 5000')

    // Create table if not exists
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS ${this._tableName} (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `)

    // Prepare statements
    this._insertStmt = this._db.prepare(
      `INSERT OR REPLACE INTO ${this._tableName} (id, data) VALUES (?, ?)`
    )
    this._updateStmt = this._db.prepare(`UPDATE ${this._tableName} SET data = ? WHERE id = ?`)
    this._deleteStmt = this._db.prepare(`DELETE FROM ${this._tableName} WHERE id = ?`)
    this._selectAllStmt = this._db.prepare(`SELECT data FROM ${this._tableName}`)
    this._selectByIdStmt = this._db.prepare(`SELECT data FROM ${this._tableName} WHERE id = ?`)

    // Load all documents into memory
    await this._loadAllDocuments()

    // Mark as initialized
    this._initialized = true

    // Create any pending indexes
    for (const { fields, options } of this._pendingIndexes) {
      await this.createIndex(fields, options)
    }
    this._pendingIndexes = []
  }

  private async _loadAllDocuments(): Promise<void> {
    if (!this._db || !this._selectAllStmt) return

    this._data = []
    const rows = this._selectAllStmt.all() as Array<{ data: string }>

    for (const row of rows) {
      try {
        const doc = JSON.parse(row.data) as T
        this._data.push(doc)
      } catch (error) {
        console.warn(`Warning: Could not parse document:`, error)
      }
    }
  }

  async getAll(): Promise<T[]> {
    return [...this._data]
  }

  async add(doc: T): Promise<void> {
    if (!this._db || !this._insertStmt) {
      throw new Error('Database not initialized')
    }

    // Check unique constraints before inserting
    this.checkUniqueConstraints(doc)

    const id = this._getDocId(doc)
    const data = JSON.stringify(doc)

    this._insertStmt.run(id, data)
    this._data.push(doc)
    this._updateQueryIndexes(doc)
  }

  async addMany(docs: T[]): Promise<void> {
    if (!this._db || !this._insertStmt) {
      throw new Error('Database not initialized')
    }

    // Check unique constraints for all documents before inserting
    for (const doc of docs) {
      this.checkUniqueConstraints(doc)
    }

    // Use transaction for batch insert
    const insert = this._db.transaction((documents: T[]) => {
      for (const doc of documents) {
        const id = this._getDocId(doc)
        const data = JSON.stringify(doc)
        this._insertStmt!.run(id, data)
      }
    })

    insert(docs)
    this._data.push(...docs)

    for (const doc of docs) {
      this._updateQueryIndexes(doc)
    }
  }

  async update(oldDoc: T, newDoc: T): Promise<void> {
    if (!this._db || !this._insertStmt) {
      throw new Error('Database not initialized')
    }

    // Check unique constraints before updating (excluding the old doc)
    this.checkUniqueConstraints(newDoc, oldDoc)

    // Update in-memory array (oldDoc is already a reference in _data)
    Object.assign(oldDoc, newDoc)

    const id = this._getDocId(oldDoc)
    const data = JSON.stringify(oldDoc)

    // Use INSERT OR REPLACE to update the document
    this._insertStmt.run(id, data)
  }

  async remove(doc: T): Promise<void> {
    if (!this._db || !this._deleteStmt) {
      throw new Error('Database not initialized')
    }

    const id = this._getDocId(doc)

    // Find by ID instead of reference equality
    const index = this._data.findIndex(d => this._getDocId(d) === id)
    if (index > -1) {
      this._data.splice(index, 1)
      this._deleteStmt.run(id)
    }
  }

  async removeMany(docs: T[]): Promise<void> {
    if (!this._db || !this._deleteStmt) {
      throw new Error('Database not initialized')
    }

    // Get IDs first
    const idsToDelete = docs.map(doc => this._getDocId(doc))

    // Remove from in-memory array by ID
    this._data = this._data.filter(d => !idsToDelete.includes(this._getDocId(d)))

    // Use transaction for batch delete from SQLite
    const deleteMany = this._db.transaction((ids: string[]) => {
      for (const id of ids) {
        this._deleteStmt!.run(id)
      }
    })

    deleteMany(idsToDelete)
  }

  async clear(): Promise<void> {
    if (!this._db) {
      throw new Error('Database not initialized')
    }

    this._data = []
    this._queryIndexes.clear()

    // Clear all rows from table
    this._db.exec(`DELETE FROM ${this._tableName}`)
  }

  // Index management
  async createIndex(
    fields: keyof T | Array<keyof T>,
    options?: { unique?: boolean }
  ): Promise<void> {
    // If not initialized yet, queue the index creation
    if (!this._initialized) {
      this._pendingIndexes.push({ fields, options })
      return
    }

    if (!this._db) {
      throw new Error('Database not initialized')
    }

    const normalizedFields = Array.isArray(fields) ? fields : [fields]
    const sortedFields = [...normalizedFields].sort()
    const indexKey = sortedFields.join(',')

    // Create SQLite index
    const indexName = `idx_${this._tableName}_${sortedFields.map(f => String(f)).join('_')}`
    const uniqueKeyword = options?.unique ? 'UNIQUE' : ''

    // For JSON fields, we need to use json_extract
    const columnExpressions = sortedFields.map(field => `json_extract(data, '$.${String(field)}')`)

    try {
      this._db.exec(`
        CREATE ${uniqueKeyword} INDEX IF NOT EXISTS ${indexName}
        ON ${this._tableName} (${columnExpressions.join(', ')})
      `)
    } catch (error) {
      console.warn(`Warning: Could not create index ${indexName}:`, error)
    }

    // Build in-memory query index map for faster lookups
    const map = new Map<string, T[]>()
    for (const doc of this._data) {
      const compositeKey = sortedFields.map(f => String(doc[f])).join(':')
      if (!map.has(compositeKey)) map.set(compositeKey, [])
      map.get(compositeKey)!.push(doc)
    }

    // Store index with metadata
    this._queryIndexes.set(indexKey, {
      fields: sortedFields as Array<keyof T>,
      map,
      unique: options?.unique || false
    })
  }

  async rebuildIndexes(): Promise<void> {
    // Rebuild all query indexes from scratch
    for (const indexMeta of this._queryIndexes.values()) {
      indexMeta.map.clear()

      for (const doc of this._data) {
        const compositeKey = indexMeta.fields.map(f => String(doc[f])).join(':')
        if (!indexMeta.map.has(compositeKey)) indexMeta.map.set(compositeKey, [])
        indexMeta.map.get(compositeKey)!.push(doc)
      }
    }
  }

  updateIndexForDocument(oldDoc: T | null, newDoc: T | null): void {
    // Efficiently update query indexes for a single document change
    for (const indexMeta of this._queryIndexes.values()) {
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

  private _updateQueryIndexes(doc: T): void {
    for (const indexMeta of this._queryIndexes.values()) {
      const compositeKey = indexMeta.fields.map(f => String(doc[f])).join(':')
      if (!indexMeta.map.has(compositeKey)) indexMeta.map.set(compositeKey, [])
      indexMeta.map.get(compositeKey)!.push(doc)
    }
  }

  // Unique constraint checking
  checkUniqueConstraints(doc: Partial<T>, excludeDoc?: T): void {
    for (const indexMeta of this._queryIndexes.values()) {
      if (!indexMeta.unique) continue

      // Build composite key from document values
      const compositeKey = indexMeta.fields.map(f => String(doc[f])).join(':')

      // Check if this combination already exists in the index
      const existingDocs = indexMeta.map.get(compositeKey) || []

      // Filter out the document being updated (if any)
      const duplicates = excludeDoc ? existingDocs.filter(d => d !== excludeDoc) : existingDocs

      if (duplicates.length > 0) {
        const fieldNames = indexMeta.fields.join(', ')
        throw new Error(`E11000 duplicate key error: ${fieldNames} must be unique`)
      }
    }
  }

  // Efficient querying using indexes
  findDocuments(
    matcher: QueryMatcher<T>,
    indexHint?: {
      fields: Array<keyof T>
      values: Record<string, unknown>
    }
  ): T[] {
    // If no index hint, use in-memory linear scan
    if (!indexHint) {
      return this._data.filter(matcher)
    }

    const sortedFields = [...indexHint.fields].sort()
    const indexKey = sortedFields.join(',')

    // Try exact index match first (in-memory)
    const exactIndex = this._queryIndexes.get(indexKey)
    if (exactIndex) {
      const compositeKey = sortedFields.map(f => String(indexHint.values[f as string])).join(':')
      return exactIndex.map.get(compositeKey) || []
    }

    // Try partial index match (in-memory)
    for (const indexMeta of this._queryIndexes.values()) {
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

    // Fallback: Try SQLite query if we have a database connection
    if (this._db && indexHint.fields.length > 0) {
      try {
        const whereConditions: string[] = []
        const params: unknown[] = []

        for (const field of indexHint.fields) {
          const value = indexHint.values[field as string]
          // Serialize the value to match JSON storage format
          // SQLite can only bind: numbers, strings, bigints, buffers, and null
          let sqlValue: unknown

          if (value === null || value === undefined) {
            sqlValue = null
          } else if (typeof value === 'boolean') {
            // SQLite json_extract returns 0 for false, 1 for true
            sqlValue = value ? 1 : 0
          } else if (typeof value === 'object') {
            // For objects, try different serialization strategies
            const valueObj = value as Record<string, unknown>
            if (typeof valueObj.toJSON === 'function') {
              // ObjectId and Date have toJSON() - use it to get primitive value
              sqlValue = (valueObj.toJSON as () => unknown)()
            } else if (
              typeof value.toString === 'function' &&
              value.constructor.name === 'ObjectId'
            ) {
              // Fallback for ObjectId without toJSON
              sqlValue = value.toString()
            } else {
              // For other objects, we need to skip - can't bind to SQLite
              // This will cause the query to fall back to linear scan
              throw new TypeError(
                'SQLite3 can only bind numbers, strings, bigints, buffers, and null'
              )
            }
          } else {
            // Primitive types: string, number, bigint
            sqlValue = value
          }

          whereConditions.push(`json_extract(data, '$.${String(field)}') = ?`)
          params.push(sqlValue)
        }

        const query = `SELECT data FROM ${this._tableName} WHERE ${whereConditions.join(' AND ')}`
        const stmt = this._db.prepare(query)
        const rows = stmt.all(...params) as Array<{ data: string }>

        const results: T[] = []
        for (const row of rows) {
          try {
            const doc = JSON.parse(row.data) as T
            if (matcher(doc)) {
              results.push(doc)
            }
          } catch (error) {
            console.warn(`Warning: Could not parse document:`, error)
          }
        }

        return results
      } catch (error) {
        console.warn('Warning: SQLite query failed, falling back to linear scan:', error)
      }
    }

    // Ultimate fallback: linear scan
    return this._data.filter(matcher)
  }

  // Cleanup method to close database connection
  close(): void {
    if (this._db) {
      this._db.close()
      this._db = null
    }
  }
}
