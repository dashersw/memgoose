import { StorageStrategy, QueryMatcher } from './storage-strategy'
import * as path from 'path'
import * as fs from 'fs'

// Try to load WiredTiger bindings from optional peer dependency
let WiredTigerConnectionClass: any
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const wt = require('memgoose-wiredtiger')
  WiredTigerConnectionClass = wt.WiredTigerConnection
} catch {
  // WiredTiger not installed - will throw error if user tries to use it
}

type WiredTigerConnection = any
type WiredTigerSession = any

export interface WiredTigerStorageOptions {
  dataPath: string
  modelName: string
  cacheSize?: string // e.g., "500M", "1G"
  compressor?: 'snappy' | 'lz4' | 'zstd' | 'zlib' | 'none' // Compression algorithm
}

// Query index metadata structure
type QueryIndexMetadata<T> = {
  fields: Array<keyof T>
  map: Map<string, T[]>
  unique: boolean
}

// WiredTiger storage strategy with efficient indexing
// Uses WiredTiger's high-performance B-tree storage engine with ACID transactions
// and crash recovery through write-ahead logging (WAL).
export class WiredTigerStorageStrategy<T extends object> implements StorageStrategy<T> {
  private _data: T[] = []
  private _connection: WiredTigerConnection | null = null
  private _session: WiredTigerSession | null = null
  private _cursor: any = null // Reusable cursor for operations
  private _dataPath: string
  private _modelName: string
  private _tableName: string
  private _cacheSize: string
  private _compressor: string
  private _getDocId: (doc: T) => string
  private _queryIndexes: Map<string, QueryIndexMetadata<T>> = new Map()
  private _initialized: boolean = false
  private _initPromise: Promise<void> | null = null
  private _pendingIndexes: Array<{
    fields: keyof T | Array<keyof T>
    options?: { unique?: boolean }
  }> = []

  private _computeIndexKey(doc: Partial<T>, fields: Array<keyof T>): string | null {
    const record = doc as Record<string, unknown>
    const values: Array<unknown> = []

    for (const field of fields) {
      const value = record[field as string]
      if (value === undefined || value === null) {
        return null
      }
      values.push(value)
    }

    return values.map(value => String(value)).join(':')
  }

  constructor(options: WiredTigerStorageOptions) {
    this._dataPath = options.dataPath
    this._modelName = options.modelName
    this._tableName = `${this._modelName}_docs`
    this._cacheSize = options.cacheSize || '1G' // Increased default for better performance
    this._compressor = options.compressor || 'snappy' // Default to snappy (fast and efficient)

    // Function to extract document ID (assumes _id field)
    this._getDocId = (doc: T) => {
      const docRecord = doc as Record<string, unknown>
      if (docRecord._id) {
        const id = docRecord._id
        // Handle ObjectId and other objects
        if (typeof id === 'object' && id !== null) {
          return String(id)
        }
        return String(id)
      }
      // Fallback: use entire document as key (not ideal, but works)
      return JSON.stringify(doc)
    }
  }

  async initialize(): Promise<void> {
    // Return immediately if already initialized
    if (this._initialized) return

    // Return existing init promise if initialization is in progress
    if (this._initPromise) return this._initPromise

    this._initPromise = (async () => {
      try {
        // Ensure data directory exists
        if (!fs.existsSync(this._dataPath)) {
          fs.mkdirSync(this._dataPath, { recursive: true })
        }

        const wtPath = path.join(this._dataPath, this._modelName)
        if (!fs.existsSync(wtPath)) {
          fs.mkdirSync(wtPath, { recursive: true })
        }

        // Open WiredTiger connection with compression extensions
        if (!WiredTigerConnectionClass) {
          throw new Error(
            'WiredTiger storage requires the memgoose-wiredtiger package. ' +
              'Install it with: npm install memgoose-wiredtiger'
          )
        }

        this._connection = new WiredTigerConnectionClass()

        // Load compression extensions for better performance
        // Try both .dylib (macOS) and .so (Linux) extensions
        // Extensions are provided by the memgoose-wiredtiger package
        const wiredtigerPackagePath = require.resolve('memgoose-wiredtiger')
        const wiredtigerRoot = path.join(path.dirname(wiredtigerPackagePath), '..')
        const extensionsPath = path.join(wiredtigerRoot, 'lib/wiredtiger/build/ext/compressors')
        const compressors = ['snappy', 'lz4', 'zstd', 'zlib']
        const extensions: string[] = []

        for (const comp of compressors) {
          const dylibPath = `${extensionsPath}/${comp}/libwiredtiger_${comp}.dylib`
          const soPath = `${extensionsPath}/${comp}/libwiredtiger_${comp}.so`

          if (fs.existsSync(dylibPath)) {
            extensions.push(dylibPath)
          } else if (fs.existsSync(soPath)) {
            extensions.push(soPath)
          }
        }

        const extensionConfig =
          extensions.length > 0 ? `extensions=[${extensions.map(e => `"${e}"`).join(',')}],` : ''

        this._connection.open(
          wtPath,
          `create,cache_size=${this._cacheSize},log=(enabled=true),${extensionConfig}`
        )

        // Open a session
        this._session = this._connection.openSession()

        // Create table with optimized configuration
        // Using format 'u' (raw bytes) instead of 'S' (null-terminated strings) provides:
        // - Better performance by avoiding null-termination overhead
        // - More efficient storage for binary JSON data
        // - Avoids string length scanning

        const baseConfig =
          'key_format=u,value_format=u,' +
          'internal_page_max=16KB,' + // Optimized for typical document sizes
          'leaf_page_max=32KB,' + // Larger leaf pages for better sequential scan
          'leaf_value_max=64KB' // Support larger documents

        if (this._compressor !== 'none') {
          try {
            // Try with selected compression algorithm
            this._session.createTable(
              this._tableName,
              `${baseConfig},block_compressor=${this._compressor}`
            )
          } catch (error) {
            // Fallback without compression if compressor not available
            console.warn(
              `Warning: ${this._compressor} compressor not available ${error}, using no compression`
            )
            this._session.createTable(this._tableName, baseConfig)
          }
        } else {
          // No compression requested
          this._session.createTable(this._tableName, baseConfig)
        }

        // Open a reusable cursor for better performance
        this._cursor = this._session.openCursor(this._tableName)

        if (!this._cursor) {
          throw new Error('Failed to create cursor')
        }

        // Create schema tracking table
        this._session.createTable(
          '_schema',
          'key_format=S,value_format=S,' + 'internal_page_max=16KB,' + 'leaf_page_max=32KB'
        )

        // Load all documents into memory
        await this._loadAllDocuments()

        // Mark as initialized
        this._initialized = true

        // Create any pending indexes
        for (const { fields, options } of this._pendingIndexes) {
          await this.createIndex(fields, options)
        }
        this._pendingIndexes = []
      } catch (error) {
        // Reset init promise on error so it can be retried
        this._initPromise = null
        throw new Error(`Failed to initialize WiredTiger storage: ${error}`)
      }
    })()

    return this._initPromise
  }

  private async _loadAllDocuments(): Promise<void> {
    if (!this._cursor) return

    this._data = []

    try {
      // Reset cursor to start from beginning
      this._cursor.reset()

      let result = this._cursor.next()

      while (result !== null) {
        try {
          const doc = JSON.parse(result.value) as T
          this._data.push(doc)
        } catch (error) {
          // Skip corrupted documents silently - they may be from incompatible format
          // This can happen if table format changed between runs
          console.warn(`Warning: Failed to parse document: ${error}`)
        }
        result = this._cursor.next()
      }
    } catch (error) {
      // Table might be empty or not exist yet, which is fine
      console.warn(`Warning: Failed to load documents: ${error}`)
    }
  }

  async getAll(): Promise<T[]> {
    return [...this._data]
  }

  async add(doc: T): Promise<void> {
    if (!this._session || !this._cursor) {
      throw new Error('Storage not initialized')
    }

    // Check unique constraints before inserting
    this.checkUniqueConstraints(doc)

    const id = this._getDocId(doc)
    const data = JSON.stringify(doc)

    try {
      // Use reusable cursor for better performance
      this._cursor.set(id, data)
      this._cursor.insert()

      this._data.push(doc)
      this.updateIndexForDocument(null, doc)
    } catch (error) {
      throw new Error(`Failed to add document: ${error}`)
    }
  }

  async addMany(docs: T[]): Promise<void> {
    if (!this._session || !this._cursor) {
      throw new Error('Storage not initialized')
    }

    // Check unique constraints for all documents before inserting
    for (const doc of docs) {
      this.checkUniqueConstraints(doc)
    }

    try {
      // Use transaction for batch insert
      this._session.beginTransaction()

      for (const doc of docs) {
        const id = this._getDocId(doc)
        const data = JSON.stringify(doc)
        this._cursor.set(id, data)
        this._cursor.insert()
      }

      this._session.commitTransaction()

      this._data.push(...docs)

      for (const doc of docs) {
        this.updateIndexForDocument(null, doc)
      }
    } catch (error) {
      if (this._session) {
        try {
          this._session.rollbackTransaction()
        } catch {
          // Ignore rollback errors
        }
      }
      throw new Error(`Failed to add documents: ${error}`)
    }
  }

  async update(oldDoc: T, newDoc: T): Promise<void> {
    if (!this._session || !this._cursor) {
      throw new Error('Storage not initialized')
    }

    // Check unique constraints before updating (excluding the old doc)
    this.checkUniqueConstraints(newDoc, oldDoc)

    const previousValues = { ...(oldDoc as Record<string, unknown>) } as Partial<T>

    // Update in-memory array (oldDoc is already a reference in _data)
    Object.assign(oldDoc, newDoc)

    const id = this._getDocId(oldDoc)
    const data = JSON.stringify(oldDoc)

    try {
      // Use reusable cursor for better performance
      this._cursor.set(id, data)
      this._cursor.update()
      this.updateIndexForDocument(oldDoc, oldDoc, {
        old: previousValues
      })
    } catch (error) {
      throw new Error(`Failed to update document: ${error}`)
    }
  }

  async remove(doc: T): Promise<void> {
    if (!this._session || !this._cursor) {
      throw new Error('Storage not initialized')
    }

    const id = this._getDocId(doc)

    // Find by ID instead of reference equality
    const index = this._data.findIndex(d => this._getDocId(d) === id)
    if (index > -1) {
      this._data.splice(index, 1)

      try {
        // Use reusable cursor: search to position, then remove
        const found = this._cursor.search(id)
        if (found !== null) {
          // Cursor is now positioned, we can remove
          this._cursor.remove()
        }
        this.updateIndexForDocument(doc, null)
      } catch (error) {
        throw new Error(`Failed to remove document: ${error}`)
      }
    }
  }

  async removeMany(docs: T[]): Promise<void> {
    if (!this._session || !this._cursor) {
      throw new Error('Storage not initialized')
    }

    // Get IDs first
    const idsToDelete = docs.map(doc => this._getDocId(doc))

    // Remove from in-memory array by ID
    this._data = this._data.filter(d => !idsToDelete.includes(this._getDocId(d)))

    try {
      // Use transaction for batch delete
      this._session.beginTransaction()

      for (const id of idsToDelete) {
        // Search for the document first to position the cursor
        const found = this._cursor.search(id)
        if (found !== null) {
          // Cursor is now positioned, we can remove
          this._cursor.remove()
        }
      }

      this._session.commitTransaction()

      for (const doc of docs) {
        this.updateIndexForDocument(doc, null)
      }
    } catch (error) {
      if (this._session) {
        try {
          this._session.rollbackTransaction()
        } catch {
          // Ignore rollback errors
        }
      }
      throw new Error(`Failed to remove documents: ${error}`)
    }
  }

  async clear(): Promise<void> {
    if (!this._session || !this._connection || !this._cursor) {
      throw new Error('Storage not initialized')
    }

    this._data = []
    this._queryIndexes.clear()

    try {
      // Reset cursor to position at the beginning
      this._cursor.reset()

      // Delete all records
      let result = this._cursor.next()
      while (result !== null) {
        this._cursor.remove()
        result = this._cursor.next()
      }
    } catch (error) {
      throw new Error(`Failed to clear storage: ${error}`)
    }
  }

  async drop(): Promise<void> {
    // Close connections first
    this.close()

    // Clear in-memory data
    this._data = []
    this._queryIndexes.clear()

    // Delete the entire WiredTiger data directory
    const wtPath = path.join(this._dataPath, this._modelName)

    try {
      // Recursively delete the directory
      if (fs.existsSync(wtPath)) {
        await fs.promises.rm(wtPath, { recursive: true, force: true })
      }
    } catch (error: any) {
      throw new Error(`Failed to delete WiredTiger directory: ${error.message}`)
    }
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

    if (!this._session) {
      throw new Error('Storage not initialized')
    }

    const normalizedFields = Array.isArray(fields) ? fields : [fields]
    const sortedFields = [...normalizedFields].sort()
    const indexKey = sortedFields.join(',')

    // Build in-memory query index map for faster lookups
    const map = new Map<string, T[]>()
    for (const doc of this._data) {
      const compositeKey = this._computeIndexKey(doc, sortedFields as Array<keyof T>)
      if (compositeKey === null) continue
      if (!map.has(compositeKey)) map.set(compositeKey, [])
      map.get(compositeKey)!.push(doc)
    }

    // Store index with metadata
    this._queryIndexes.set(indexKey, {
      fields: sortedFields as Array<keyof T>,
      map,
      unique: options?.unique || false
    })

    // Note: WiredTiger doesn't support secondary indexes directly on string values
    // We rely on in-memory indexes for query optimization
  }

  async rebuildIndexes(): Promise<void> {
    // Rebuild all query indexes from scratch
    for (const indexMeta of this._queryIndexes.values()) {
      indexMeta.map.clear()

      for (const doc of this._data) {
        const compositeKey = this._computeIndexKey(doc, indexMeta.fields)
        if (compositeKey === null) continue
        if (!indexMeta.map.has(compositeKey)) indexMeta.map.set(compositeKey, [])
        indexMeta.map.get(compositeKey)!.push(doc)
      }
    }
  }

  updateIndexForDocument(
    oldDoc: T | null,
    newDoc: T | null,
    keySources?: {
      old?: Partial<T>
      new?: Partial<T>
    }
  ): void {
    // Efficiently update query indexes for a single document change
    for (const indexMeta of this._queryIndexes.values()) {
      // Remove old index entry if document existed before
      if (oldDoc) {
        const removalKeySource = keySources?.old ?? oldDoc
        const oldKey = this._computeIndexKey(removalKeySource, indexMeta.fields)
        let removed = false

        if (oldKey !== null) {
          const oldBucket = indexMeta.map.get(oldKey)
          if (oldBucket) {
            const idx = oldBucket.indexOf(oldDoc)
            if (idx > -1) {
              oldBucket.splice(idx, 1)
              if (oldBucket.length === 0) {
                indexMeta.map.delete(oldKey)
              }
              removed = true
            }
          }
        }

        if (!removed) {
          for (const [key, bucket] of indexMeta.map.entries()) {
            const idx = bucket.indexOf(oldDoc)
            if (idx > -1) {
              bucket.splice(idx, 1)
              if (bucket.length === 0) {
                indexMeta.map.delete(key)
              }
              break
            }
          }
        }
      }

      // Add new index entry if document exists after
      if (newDoc) {
        const insertionKeySource = keySources?.new ?? newDoc
        const newKey = this._computeIndexKey(insertionKeySource, indexMeta.fields)
        if (newKey !== null) {
          if (!indexMeta.map.has(newKey)) {
            indexMeta.map.set(newKey, [])
          }
          indexMeta.map.get(newKey)!.push(newDoc)
        }
      }
    }
  }

  // Unique constraint checking
  checkUniqueConstraints(doc: Partial<T>, excludeDoc?: T): void {
    for (const indexMeta of this._queryIndexes.values()) {
      if (!indexMeta.unique) continue

      // Build composite key from document values
      const compositeKey = this._computeIndexKey(doc, indexMeta.fields)
      if (compositeKey === null) continue

      // Check if this combination already exists in the index
      const existingDocs = indexMeta.map.get(compositeKey) || []

      // Filter out the document being updated (if any)
      const duplicates = excludeDoc ? existingDocs.filter(d => d !== excludeDoc) : existingDocs

      if (duplicates.length > 0) {
        const fieldNames = indexMeta.fields.map(f => String(f)).join(', ')
        throw new Error(`E11000 duplicate key error: ${fieldNames} must be unique`)
      }
    }
  }

  // Efficient querying using indexes
  async findDocuments(
    matcher: QueryMatcher<T>,
    indexHint?: {
      fields: Array<keyof T>
      values: Record<string, unknown>
    }
  ): Promise<T[]> {
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

    // Fallback: linear scan
    return this._data.filter(matcher)
  }

  // Flush triggers a checkpoint to ensure data is visible to new sessions
  async flush(): Promise<void> {
    if (this._connection) {
      try {
        this._connection.checkpoint()
      } catch (error) {
        console.warn('Warning: Checkpoint failed:', error)
      }
    }
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
    if (!this._session || !this._connection) {
      throw new Error('Storage not initialized')
    }

    const now = new Date().toISOString()

    try {
      // Open cursor for schema table
      const schemaCursor = this._session.openCursor('_schema')

      // Check if schema exists
      const found = schemaCursor.search(this._modelName)
      let shouldUpdate = false

      if (found !== null) {
        const existingData = JSON.parse(found.value)
        if (existingData.version !== schemaData.version) {
          shouldUpdate = true
        }
      }

      if (found !== null && shouldUpdate) {
        // Update existing schema
        const updatedRecord = {
          ...schemaData,
          updatedAt: now,
          createdAt: JSON.parse(found.value).createdAt
        }
        schemaCursor.set(this._modelName, JSON.stringify(updatedRecord))
        schemaCursor.update()
      } else if (found === null) {
        // Insert new schema record
        const newRecord = {
          ...schemaData,
          createdAt: now,
          updatedAt: now
        }
        schemaCursor.set(this._modelName, JSON.stringify(newRecord))
        schemaCursor.insert()
      }

      schemaCursor.close()
    } catch (error) {
      console.warn('Warning: Failed to record schema:', error)
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
    if (!this._session || !this._connection) {
      throw new Error('Storage not initialized')
    }

    try {
      // Open cursor for schema table
      const schemaCursor = this._session.openCursor('_schema')

      const found = schemaCursor.search(modelName)
      schemaCursor.close()

      if (found === null) return null

      const data = JSON.parse(found.value)
      return {
        modelName,
        version: data.version,
        definition: data.definition,
        indexes: data.indexes,
        options: data.options,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt)
      }
    } catch (error) {
      console.warn('Warning: Failed to get schema:', error)
      return null
    }
  }

  // Cleanup method to close connections
  close(): void {
    if (this._cursor) {
      try {
        this._cursor.close()
      } catch (error) {
        console.warn('Warning: Failed to close WiredTiger cursor:', error)
      }
      this._cursor = null
    }

    if (this._session) {
      try {
        this._session.close()
      } catch (error) {
        console.warn('Warning: Failed to close WiredTiger session:', error)
      }
      this._session = null
    }

    if (this._connection) {
      try {
        this._connection.close()
      } catch (error) {
        console.warn('Warning: Failed to close WiredTiger connection:', error)
      }
      this._connection = null
    }

    // Reset initialization state
    this._initialized = false
    this._initPromise = null
  }
}
