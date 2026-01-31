import { StorageStrategy, QueryMatcher } from './storage-strategy'
import type { Query, QueryOptions, Update } from '../model'
import type { AggregationPipeline } from '../aggregation'
import { SqlQueryBuilder } from './sql-query-builder'
import { SqlAggregationBuilder } from './sql-aggregation-builder'
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

// Unique index metadata for constraint checking
type UniqueIndexMetadata = {
  fields: Array<keyof any>
}

// Type definitions for better-sqlite3 (when installed)
type DatabaseInstance = any // Will be Database.Database when installed
type StatementInstance = any // Will be Database.Statement when installed

/**
 * SQLite storage strategy with native SQL query execution
 * All queries, updates, and aggregations execute directly in SQLite
 * No in-memory data array - everything stored and queried in database
 */
export class SqliteStorageStrategy<T extends object> implements StorageStrategy<T> {
  private _db: DatabaseInstance | null = null
  private _dataPath: string
  private _modelName: string
  private _dbFilePath: string
  private _tableName: string
  private _getDocId: (doc: T) => string
  private _initialized: boolean = false
  private _pendingIndexes: Array<{
    fields: keyof T | Array<keyof T>
    options?: { unique?: boolean }
  }> = []

  // Query builder for SQL generation
  private _queryBuilder!: SqlQueryBuilder<T>
  private _aggregationBuilder!: SqlAggregationBuilder<T>

  // Track unique indexes for constraint checking
  private _uniqueIndexes: Map<string, UniqueIndexMetadata> = new Map()

  // Prepared statements for performance
  private _insertStmt?: StatementInstance
  private _deleteStmt?: StatementInstance
  private _selectAllStmt?: StatementInstance

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

    // Create schema tracking table
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS _schema (
        modelName TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        definition TEXT NOT NULL,
        indexes TEXT NOT NULL,
        options TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)

    // Register custom SQLite functions
    this._registerCustomFunctions()

    // Initialize query builders
    this._queryBuilder = new SqlQueryBuilder<T>(this._tableName)
    this._aggregationBuilder = new SqlAggregationBuilder<T>(this._tableName, this._db)

    // Prepare statements
    this._insertStmt = this._db.prepare(
      `INSERT OR REPLACE INTO ${this._tableName} (id, data) VALUES (?, ?)`
    )
    this._deleteStmt = this._db.prepare(`DELETE FROM ${this._tableName} WHERE id = ?`)
    this._selectAllStmt = this._db.prepare(`SELECT data FROM ${this._tableName}`)

    // Mark as initialized
    this._initialized = true

    // Create any pending indexes
    for (const { fields, options } of this._pendingIndexes) {
      await this.createIndex(fields, options)
    }
    this._pendingIndexes = []
  }

  /**
   * Register custom SQLite functions for query operators
   */
  private _registerCustomFunctions(): void {
    if (!this._db) return

    // REGEXP function for $regex operator
    this._db.function('regexp', (pattern: string, text: string | null) => {
      if (text === null) return 0
      try {
        return new RegExp(pattern).test(text) ? 1 : 0
      } catch {
        return 0
      }
    })

    // JSON array contains helper for $all operator
    this._db.function('json_array_contains', (arrayJson: string | null, valueJson: string) => {
      if (arrayJson === null) return 0
      try {
        const arr = JSON.parse(arrayJson)
        const val = JSON.parse(valueJson)
        return Array.isArray(arr) && arr.includes(val) ? 1 : 0
      } catch {
        return 0
      }
    })
  }

  // ============================================================================
  // NATIVE SQL QUERY METHODS (New!)
  // ============================================================================

  /**
   * Execute query natively in SQLite - returns documents matching query
   */
  async queryNative(query: Query<T>, options?: QueryOptions<T>): Promise<T[]> {
    if (!this._db) {
      throw new Error('Database not initialized')
    }

    const { sql, params } = this._queryBuilder.buildSelectQuery(query, options)
    const stmt = this._db.prepare(sql)
    const rows = stmt.all(...params) as Array<{ data: string }>
    return rows.map(r => JSON.parse(r.data) as T)
  }

  /**
   * Execute update natively in SQLite - returns modified count
   */
  async updateNative(query: Query<T>, update: Update<T>): Promise<{ modifiedCount: number }> {
    if (!this._db) {
      throw new Error('Database not initialized')
    }

    const { sql, params } = this._queryBuilder.buildUpdateQuery(query, update)
    const result = this._db.prepare(sql).run(...params)
    return { modifiedCount: result.changes || 0 }
  }

  /**
   * Execute delete natively in SQLite - returns deleted count
   */
  async deleteNative(query: Query<T>): Promise<{ deletedCount: number }> {
    if (!this._db) {
      throw new Error('Database not initialized')
    }

    const { sql, params } = this._queryBuilder.buildDeleteQuery(query)
    const result = this._db.prepare(sql).run(...params)
    return { deletedCount: result.changes || 0 }
  }

  /**
   * Execute count natively in SQLite
   */
  async countNative(query: Query<T>): Promise<number> {
    if (!this._db) {
      throw new Error('Database not initialized')
    }

    const { sql, params } = this._queryBuilder.buildCountQuery(query)
    const result = this._db.prepare(sql).get(...params) as { count: number }
    return result.count
  }

  /**
   * Execute aggregation natively in SQLite
   */
  async aggregateNative<R = Record<string, unknown>>(
    pipeline: AggregationPipeline<T>
  ): Promise<R[]> {
    if (!this._db) {
      throw new Error('Database not initialized')
    }

    const { sql, params } = this._aggregationBuilder.buildAggregationQuery(pipeline)
    const stmt = this._db.prepare(sql)
    const rows = stmt.all(...params)
    return rows as R[]
  }

  // ============================================================================
  // LEGACY STORAGE METHODS (for compatibility with other operations)
  // ============================================================================

  async getAll(): Promise<T[]> {
    if (!this._db || !this._selectAllStmt) {
      throw new Error('Database not initialized')
    }

    const rows = this._selectAllStmt.all() as Array<{ data: string }>
    return rows.map(r => JSON.parse(r.data) as T)
  }

  async add(doc: T): Promise<void> {
    if (!this._db || !this._insertStmt) {
      throw new Error('Database not initialized')
    }

    // Check unique constraints before inserting
    await this._checkUniqueConstraintsSQL(doc)

    const id = this._getDocId(doc)
    const data = JSON.stringify(doc)

    this._insertStmt.run(id, data)
  }

  async addMany(docs: T[]): Promise<void> {
    if (!this._db || !this._insertStmt) {
      throw new Error('Database not initialized')
    }

    // Check unique constraints for all documents before inserting
    for (const doc of docs) {
      await this._checkUniqueConstraintsSQL(doc)
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
  }

  async update(oldDoc: T, newDoc: T): Promise<void> {
    if (!this._db || !this._insertStmt) {
      throw new Error('Database not initialized')
    }

    // Check unique constraints before updating (excluding the old doc)
    const id = this._getDocId(oldDoc)
    await this._checkUniqueConstraintsSQL(newDoc, id)

    // Update by replacing the document
    const data = JSON.stringify(newDoc)
    this._insertStmt.run(id, data)
  }

  async remove(doc: T): Promise<void> {
    if (!this._db || !this._deleteStmt) {
      throw new Error('Database not initialized')
    }

    const id = this._getDocId(doc)
    this._deleteStmt.run(id)
  }

  async removeMany(docs: T[]): Promise<void> {
    if (!this._db || !this._deleteStmt) {
      throw new Error('Database not initialized')
    }

    // Get IDs first
    const idsToDelete = docs.map(doc => this._getDocId(doc))

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

    this._uniqueIndexes.clear()

    // Clear all rows from table
    this._db.exec(`DELETE FROM ${this._tableName}`)
  }

  async drop(): Promise<void> {
    // Close the database connection first
    this.close()

    // Clear in-memory data
    this._uniqueIndexes.clear()

    // Delete the database file
    try {
      await fs.promises.unlink(this._dbFilePath)
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to delete database file: ${error.message}`)
      }
      // File doesn't exist - that's fine
    }

    // Also delete WAL and SHM files if they exist (SQLite WAL mode creates these)
    const walPath = `${this._dbFilePath}-wal`
    const shmPath = `${this._dbFilePath}-shm`

    try {
      await fs.promises.unlink(walPath)
    } catch {
      // Ignore if file doesn't exist
    }

    try {
      await fs.promises.unlink(shmPath)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /**
   * SQL-based unique constraint checking
   */
  private async _checkUniqueConstraintsSQL(doc: Partial<T>, excludeId?: string): Promise<void> {
    if (!this._db) return

    // For each unique index, build a query to check if value exists
    for (const [indexKey, indexMeta] of this._uniqueIndexes.entries()) {
      const conditions: string[] = []
      const params: unknown[] = []

      for (const field of indexMeta.fields) {
        const value = (doc as any)[field]

        // Serialize value for SQL query
        let sqlValue: unknown
        if (value === null || value === undefined) {
          sqlValue = null
        } else if (typeof value === 'object') {
          const valueObj = value as Record<string, unknown>
          if (typeof valueObj.toJSON === 'function') {
            sqlValue = (valueObj.toJSON as () => unknown)()
          } else if (typeof value.toString === 'function') {
            sqlValue = value.toString()
          } else {
            sqlValue = JSON.stringify(value)
          }
        } else {
          sqlValue = value
        }

        conditions.push(`json_extract(data, '$.${String(field)}') = ?`)
        params.push(sqlValue)
      }

      let whereClauses = conditions.join(' AND ')
      if (excludeId) {
        whereClauses += ' AND id != ?'
        params.push(excludeId)
      }

      const sql = `SELECT COUNT(*) as count FROM ${this._tableName} WHERE ${whereClauses}`
      const result = this._db.prepare(sql).get(...params) as { count: number }

      if (result.count > 0) {
        throw new Error(`E11000 duplicate key error: ${indexKey} must be unique`)
      }
    }
  }

  // ============================================================================
  // INDEX MANAGEMENT (Pure SQLite indexes, no in-memory)
  // ============================================================================

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

    // Track unique indexes for constraint checking
    if (options?.unique) {
      this._uniqueIndexes.set(indexKey, { fields: sortedFields as Array<keyof any> })
    }
  }

  async rebuildIndexes(): Promise<void> {
    // SQLite maintains indexes automatically - no action needed
    return Promise.resolve()
  }

  updateIndexForDocument(_oldDoc: T | null, _newDoc: T | null): void {
    // No-op: SQLite handles index updates automatically
  }

  checkUniqueConstraints(_doc: Partial<T>, _excludeDoc?: T): void {
    // Sync method for interface compatibility
    // Actual checking is done async in _checkUniqueConstraintsSQL
    // This will be called from async contexts, so the real check happens there
  }

  // ============================================================================
  // FALLBACK METHOD (for non-SQL strategies)
  // ============================================================================

  /**
   * Fallback method for findDocuments - only used if queryNative is not called
   * In practice, Model will detect queryNative and use that instead
   */
  async findDocuments(
    matcher: QueryMatcher<T>,
    _indexHint?: {
      fields: Array<keyof T>
      values: Record<string, unknown>
    }
  ): Promise<T[]> {
    // Simple fallback: load all documents and filter in JavaScript
    // This should rarely be called since Model will use queryNative
    const allDocs = await this.getAll()
    return allDocs.filter(matcher)
  }

  // ============================================================================
  // SCHEMA TRACKING METHODS
  // ============================================================================

  /**
   * Record schema information in the _schema table
   * This is called automatically when a model is initialized
   */
  async recordSchema(schemaData: {
    modelName: string
    version: string
    definition: Record<string, unknown>
    indexes: Array<{ fields: string[]; unique: boolean }>
    options: Record<string, unknown>
  }): Promise<void> {
    if (!this._db) {
      throw new Error('Database not initialized')
    }

    const now = new Date().toISOString()

    // Check if schema exists
    const existing = this._db
      .prepare('SELECT version FROM _schema WHERE modelName = ?')
      .get(this._modelName) as { version: string } | undefined

    if (existing) {
      // Update if version changed
      if (existing.version !== schemaData.version) {
        this._db
          .prepare(
            `UPDATE _schema 
             SET version = ?, definition = ?, indexes = ?, options = ?, updatedAt = ?
             WHERE modelName = ?`
          )
          .run(
            schemaData.version,
            JSON.stringify(schemaData.definition),
            JSON.stringify(schemaData.indexes),
            JSON.stringify(schemaData.options),
            now,
            this._modelName
          )
      }
    } else {
      // Insert new schema record
      this._db
        .prepare(
          `INSERT INTO _schema (modelName, version, definition, indexes, options, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          this._modelName,
          schemaData.version,
          JSON.stringify(schemaData.definition),
          JSON.stringify(schemaData.indexes),
          JSON.stringify(schemaData.options),
          now,
          now
        )
    }
  }

  /**
   * Retrieve schema information for a model
   */
  async getSchema(modelName: string): Promise<{
    modelName: string
    version: string
    definition: Record<string, unknown>
    indexes: Array<{ fields: string[]; unique: boolean }>
    options: Record<string, unknown>
    createdAt: Date
    updatedAt: Date
  } | null> {
    if (!this._db) {
      throw new Error('Database not initialized')
    }

    const row = this._db.prepare('SELECT * FROM _schema WHERE modelName = ?').get(modelName) as
      | {
          modelName: string
          version: string
          definition: string
          indexes: string
          options: string
          createdAt: string
          updatedAt: string
        }
      | undefined

    if (!row) return null

    return {
      modelName: row.modelName,
      version: row.version,
      definition: JSON.parse(row.definition),
      indexes: JSON.parse(row.indexes),
      options: JSON.parse(row.options),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }
  }

  // Cleanup method to close database connection
  close(): void {
    if (this._db) {
      this._db.close()
      this._db = null
    }
  }
}
