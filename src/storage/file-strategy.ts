import { StorageStrategy, QueryMatcher } from './storage-strategy'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'

const writeFile = promisify(fs.writeFile)
const readFile = promisify(fs.readFile)
const rename = promisify(fs.rename)
const mkdir = promisify(fs.mkdir)
const unlink = promisify(fs.unlink)
const open = promisify(fs.open)
const read = promisify(fs.read)
const close = promisify(fs.close)

export interface FileStorageOptions {
  dataPath: string
  modelName: string
  persistMode?: 'immediate' | 'debounced'
  debounceMs?: number

  // Compaction configuration
  compaction?: {
    // Debounced triggers (normal operation)
    operationThreshold?: number // Default: 50000 operations
    intervalMs?: number // Default: 300000 (5 minutes)
    sizeThresholdBytes?: number // Default: 50MB
    walDataRatio?: number // Default: 2.0 (WAL 2x data size)

    // Emergency triggers (immediate, no debounce)
    emergencyOperations?: number // Default: 100000
    emergencySizeBytes?: number // Default: 100MB
    emergencyRatio?: number // Default: 5.0

    // Compaction behavior
    debounceMs?: number // Default: 5000ms
    useWorkerThread?: boolean // Default: auto (based on doc count)
    workerThreshold?: number // Default: 50000 docs
  }

  // Legacy support
  compactionThreshold?: number // Deprecated: use compaction.operationThreshold
}

interface IndexEntry {
  file: 'data' | 'wal'
  offset: number
  length: number
  deleted?: boolean
}

interface PersistedIndex {
  version: string
  modelName: string
  index: Record<string, Omit<IndexEntry, 'file'>> // Only store data file entries
  metadata: {
    totalDocuments: number
    lastCompaction: string
    fileSize: number
  }
}

// Query index metadata structure (separate from file offset index)
type QueryIndexMetadata<T> = {
  fields: Array<keyof T>
  map: Map<string, T[]>
  unique: boolean
}

// File-based storage strategy with NDJSON + WAL for efficient updates
export class FileStorageStrategy<T extends object> implements StorageStrategy<T> {
  private _data: T[] = []
  private _dataPath: string
  private _modelName: string
  private _persistMode: 'immediate' | 'debounced'
  private _debounceMs: number
  private _dataFilePath: string
  private _walFilePath: string
  private _indexFilePath: string
  private _debounceTimer?: NodeJS.Timeout
  private _writeQueue: Promise<void> = Promise.resolve()
  private _pendingWrite = false

  // NDJSON + WAL specific (byte offset index for file I/O)
  private _index: Map<string, IndexEntry> = new Map()
  private _walOperationCount = 0
  private _walOffset = 0 // Track current WAL file offset
  private _getDocId: (doc: T) => string

  // Query indexes for efficient lookups (separate from file offset index)
  private _queryIndexes: Map<string, QueryIndexMetadata<T>> = new Map()

  // Compaction configuration and state
  private _compactionDebounceMs: number
  private _compactionTimer?: NodeJS.Timeout
  private _compacting = false

  // Initialization state
  private _initialized = false
  private _initPromise?: Promise<void>

  constructor(options: FileStorageOptions) {
    this._dataPath = options.dataPath
    this._modelName = options.modelName
    this._persistMode = options.persistMode || 'debounced'
    this._debounceMs = options.debounceMs || 100
    this._dataFilePath = path.join(this._dataPath, `${this._modelName}.data.ndjson`)
    this._walFilePath = path.join(this._dataPath, `${this._modelName}.wal.ndjson`)
    this._indexFilePath = path.join(this._dataPath, `${this._modelName}.index.json`)

    // Initialize compaction configuration with defaults
    const compaction = options.compaction || {}
    this._compactionDebounceMs = compaction.debounceMs ?? 5000 // Default: 5 seconds

    // Function to extract document ID (assumes _id field)
    this._getDocId = (doc: T) => {
      const docRecord = doc as Record<string, unknown>
      if (docRecord._id) return String(docRecord._id)
      // Fallback: use entire document as key (not ideal, but works)
      return JSON.stringify(doc)
    }
  }

  async initialize(): Promise<void> {
    if (this._initialized) return
    if (this._initPromise) return this._initPromise

    this._initPromise = (async () => {
      // Ensure data directory exists
      await mkdir(this._dataPath, { recursive: true })

      // Load persisted index for data file
      await this._loadDataIndex()

      // Rebuild WAL index by scanning WAL file
      await this._rebuildWalIndex()

      // Rebuild in-memory data array from index
      await this._rebuildDataArray()

      // Rebuild query indexes after data is loaded
      await this.rebuildIndexes()

      this._initialized = true
    })()

    return this._initPromise
  }

  private async _ensureInitialized(): Promise<void> {
    if (!this._initialized) {
      await this.initialize()
    }
  }

  private async _loadDataIndex(): Promise<void> {
    try {
      const content = await readFile(this._indexFilePath, 'utf-8')
      const persisted: PersistedIndex = JSON.parse(content)

      // Load data file index entries
      for (const [id, entry] of Object.entries(persisted.index)) {
        if (!entry.deleted) {
          this._index.set(id, {
            file: 'data',
            offset: entry.offset,
            length: entry.length
          })
        }
      }
    } catch (error: unknown) {
      // Index doesn't exist or is corrupted - will rebuild from data file
      const err = error as { code?: string; message?: string }
      if (err.code !== 'ENOENT') {
        console.warn(`Warning: Could not load index ${this._indexFilePath}:`, err.message)
      }

      // Try to rebuild from data file
      await this._rebuildDataFileIndex()
    }
  }

  private async _rebuildDataFileIndex(): Promise<void> {
    try {
      const content = await readFile(this._dataFilePath, 'utf-8')
      const lines = content.split('\n').filter(line => line.trim())

      let offset = 0
      for (const line of lines) {
        const doc: T = JSON.parse(line)
        const id = this._getDocId(doc)
        const length = Buffer.byteLength(line, 'utf-8')

        this._index.set(id, {
          file: 'data',
          offset,
          length
        })

        offset += length + 1 // +1 for newline
      }
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string }
      if (err.code !== 'ENOENT') {
        console.warn(`Warning: Could not rebuild from ${this._dataFilePath}:`, err.message || '')
      }
      // No data file yet - start fresh
    }
  }

  private async _rebuildWalIndex(): Promise<void> {
    try {
      const content = await readFile(this._walFilePath, 'utf-8')
      const lines = content.split('\n').filter(line => line.trim())

      let offset = 0
      for (const line of lines) {
        const doc: T = JSON.parse(line)
        const id = this._getDocId(doc)
        const length = Buffer.byteLength(line, 'utf-8')

        // WAL entries override data file entries
        this._index.set(id, {
          file: 'wal',
          offset,
          length
        })

        offset += length + 1
        this._walOperationCount++
      }
      // Update WAL offset to end of file
      this._walOffset = offset
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string }
      if (err.code !== 'ENOENT') {
        console.warn(`Warning: Could not load WAL ${this._walFilePath}:`, err.message || '')
      }
      // No WAL file yet - that's fine
      this._walOffset = 0
    }
  }

  private async _rebuildDataArray(): Promise<void> {
    this._data = []

    for (const [id, entry] of this._index.entries()) {
      if (entry.deleted) continue

      try {
        const doc = await this._readDocumentAtOffset(entry)
        this._data.push(doc)
      } catch (error) {
        console.warn(`Warning: Could not read document ${id}:`, error)
      }
    }
  }

  private async _readDocumentAtOffset(entry: IndexEntry): Promise<T> {
    const filePath = entry.file === 'data' ? this._dataFilePath : this._walFilePath

    const fd = await open(filePath, 'r')
    try {
      const buffer = Buffer.allocUnsafe(entry.length)
      await read(fd, buffer, 0, entry.length, entry.offset)
      const line = buffer.toString('utf-8')
      return JSON.parse(line)
    } finally {
      await close(fd)
    }
  }

  async getAll(): Promise<T[]> {
    return [...this._data]
  }

  // Helper to wait for any ongoing compaction
  private async _waitForCompaction(): Promise<void> {
    while (this._compacting) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  async add(doc: T): Promise<void> {
    await this._ensureInitialized()
    await this._waitForCompaction()
    this._data.push(doc)
    this._updateQueryIndexes(doc)
    await this._appendToWal(doc)
    this._scheduleCompaction() // Debounced
  }

  async addMany(docs: T[]): Promise<void> {
    await this._ensureInitialized()
    await this._waitForCompaction()
    this._data.push(...docs)
    for (const doc of docs) {
      this._updateQueryIndexes(doc)
      await this._appendToWal(doc)
    }
    this._scheduleCompaction() // Debounced
  }

  async update(oldDoc: T, newDoc: T): Promise<void> {
    await this._ensureInitialized()
    await this._waitForCompaction()
    // Update in-memory array (oldDoc is already a reference in _data)
    Object.assign(oldDoc, newDoc)

    // Append updated document (with all fields) to WAL
    await this._appendToWal(oldDoc)
    this._scheduleCompaction() // Debounced
  }

  async remove(doc: T): Promise<void> {
    await this._ensureInitialized()
    await this._waitForCompaction()
    const index = this._data.indexOf(doc)
    if (index > -1) {
      this._data.splice(index, 1)

      // Mark as deleted in index
      const id = this._getDocId(doc)
      const entry = this._index.get(id)
      if (entry) {
        entry.deleted = true
        this._walOperationCount++
      }

      await this._schedulePersist()
      this._scheduleCompaction() // Debounced
    }
  }

  async removeMany(docs: T[]): Promise<void> {
    await this._ensureInitialized()
    await this._waitForCompaction()
    for (const doc of docs) {
      const index = this._data.indexOf(doc)
      if (index > -1) {
        this._data.splice(index, 1)

        const id = this._getDocId(doc)
        const entry = this._index.get(id)
        if (entry) {
          entry.deleted = true
          this._walOperationCount++
        }
      }
    }

    await this._schedulePersist()
    this._scheduleCompaction() // Debounced
  }

  async clear(): Promise<void> {
    this._data = []
    this._index.clear()
    this._queryIndexes.clear()
    this._walOperationCount = 0
    this._walOffset = 0

    // Delete all files
    try {
      await unlink(this._dataFilePath)
    } catch {
      // Ignore if file doesn't exist
    }
    try {
      await unlink(this._walFilePath)
    } catch {
      // Ignore if file doesn't exist
    }
    try {
      await unlink(this._indexFilePath)
    } catch {
      // Ignore if file doesn't exist
    }
  }

  private async _appendToWal(doc: T): Promise<void> {
    const id = this._getDocId(doc)
    const line = JSON.stringify(doc) + '\n'
    const length = Buffer.byteLength(line, 'utf-8') - 1 // Exclude newline
    const offset = this._walOffset

    // Chain the write to the queue and update the queue reference
    this._writeQueue = this._writeQueue.then(async () => {
      await fs.promises.appendFile(this._walFilePath, line, 'utf-8')
    })
    await this._writeQueue

    // Update index
    this._index.set(id, {
      file: 'wal',
      offset,
      length
    })

    // Update offset for next write
    this._walOffset += length + 1

    this._walOperationCount++
    await this._schedulePersist()
  }

  private async _schedulePersist(): Promise<void> {
    if (this._persistMode === 'immediate') {
      await this._persist()
    } else {
      // Debounced mode
      this._pendingWrite = true

      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer)
      }

      this._debounceTimer = setTimeout(async () => {
        if (this._pendingWrite) {
          await this._persist()
          this._pendingWrite = false
        }
      }, this._debounceMs)
    }
  }

  private async _persist(): Promise<void> {
    // For NDJSON + WAL, persist is mostly handled by WAL appends
    // This method is kept for compatibility but does minimal work
    this._writeQueue = this._writeQueue.then(async () => {
      // Nothing to do - WAL already persisted
    })
    return this._writeQueue
  }

  // ===== Compaction Scheduling System =====

  private _scheduleCompaction(): void {
    // Clear existing debounce timer (resets the countdown)
    if (this._compactionTimer) {
      clearTimeout(this._compactionTimer)
    }

    // Schedule compaction after debounce period
    this._compactionTimer = setTimeout(() => {
      if (this._walOperationCount > 0) {
        this._compact().catch(err => {
          console.error('Compaction error:', err)
        })
      }
    }, this._compactionDebounceMs)
  }

  private async _compact(): Promise<void> {
    // Prevent concurrent compaction
    if (this._compacting) return

    // Lock to prevent writes during compaction
    this._compacting = true

    try {
      console.log(`Compacting ${this._modelName}: ${this._walOperationCount} WAL operations`)

      const tempDataFile = `${this._dataFilePath}.tmp`
      const newIndex: Record<string, Omit<IndexEntry, 'file'>> = {}

      // Batch serialize all documents (data is already in memory)
      const lines: string[] = []
      let offset = 0

      for (const doc of this._data) {
        const id = this._getDocId(doc)
        const line = JSON.stringify(doc) + '\n'
        const length = Buffer.byteLength(line, 'utf-8') - 1

        lines.push(line)
        newIndex[id] = {
          offset,
          length
        }

        offset += length + 1
      }

      // Single batched write operation
      const ndjsonContent = lines.join('')
      await writeFile(tempDataFile, ndjsonContent, 'utf-8')

      // Persist the new index
      const persistedIndex: PersistedIndex = {
        version: '1.0',
        modelName: this._modelName,
        index: newIndex,
        metadata: {
          totalDocuments: this._data.length,
          lastCompaction: new Date().toISOString(),
          fileSize: offset
        }
      }

      await writeFile(this._indexFilePath, JSON.stringify(persistedIndex, null, 2), 'utf-8')

      // Atomically replace data file
      try {
        await rename(tempDataFile, this._dataFilePath)
      } catch (error) {
        await unlink(tempDataFile).catch(() => {})
        throw error
      }

      // Clear WAL
      try {
        await unlink(this._walFilePath)
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(`Warning: Could not clear WAL:`, error)
        }
      }

      // Update in-memory index to point to data file
      this._index.clear()
      for (const [id, entry] of Object.entries(newIndex)) {
        this._index.set(id, {
          file: 'data',
          offset: entry.offset,
          length: entry.length
        })
      }

      // Reset WAL counters
      this._walOperationCount = 0
      this._walOffset = 0

      console.log(`Compaction complete: ${this._data.length} documents, ${offset} bytes`)
    } finally {
      // Release lock
      this._compacting = false
    }
  }

  // Flush any pending writes (useful for graceful shutdown)
  async flush(): Promise<void> {
    // Clear all timers
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
      this._debounceTimer = undefined
    }
    if (this._compactionTimer) {
      clearTimeout(this._compactionTimer)
      this._compactionTimer = undefined
    }

    // Flush pending writes
    if (this._pendingWrite) {
      await this._persist()
      this._pendingWrite = false
    }
    await this._writeQueue

    // Force compaction if there are pending WAL operations
    if (this._walOperationCount > 0) {
      await this._compact()
    }
  }

  // Query index management (separate from byte offset index)
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

  // Efficient querying using query indexes
  findDocuments(
    matcher: QueryMatcher<T>,
    indexHint?: {
      fields: Array<keyof T>
      values: Record<string, unknown>
    }
  ): T[] {
    // If no index hint, use linear scan
    if (!indexHint) {
      return this._data.filter(matcher)
    }

    const sortedFields = [...indexHint.fields].sort()
    const indexKey = sortedFields.join(',')

    // Try exact index match first
    const exactIndex = this._queryIndexes.get(indexKey)
    if (exactIndex) {
      const compositeKey = sortedFields.map(f => String(indexHint.values[f as string])).join(':')
      // For exact index match, return directly (no need to filter)
      return exactIndex.map.get(compositeKey) || []
    }

    // Try partial index match
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
}
