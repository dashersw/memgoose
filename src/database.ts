import {
  StorageStrategy,
  MemoryStorageStrategy,
  FileStorageStrategy,
  SqliteStorageStrategy,
  WiredTigerStorageStrategy
} from './storage'
import { Model } from './model'
import { Schema } from './schema'
import { TTLManager } from './ttl-manager'

// Database configuration
export interface DatabaseConfig {
  storage?: 'memory' | 'file' | 'sqlite' | 'wiredtiger'
  file?: {
    dataPath: string
    persistMode?: 'immediate' | 'debounced'
    debounceMs?: number
  }
  sqlite?: {
    dataPath: string
  }
  wiredtiger?: {
    dataPath: string
    cacheSize?: string // e.g., "500M", "1G"
    compressor?: 'snappy' | 'lz4' | 'zstd' | 'zlib' | 'none'
  }
}

// Database class - manages storage and models
export class Database {
  // Internal storage uses flexible typing since models can be different types
  // Using Record<string, unknown> as the common supertype for all models
  private _storage: StorageStrategy<Record<string, unknown>>
  private _modelRegistry: Map<string, Model<Record<string, unknown>>>
  private _config: DatabaseConfig
  private _ttlManager: TTLManager

  constructor(config: DatabaseConfig = {}) {
    this._config = config
    this._modelRegistry = new Map()
    this._ttlManager = new TTLManager()
    // Note: storage is created per-model, not per-database
    this._storage = null as unknown as StorageStrategy<Record<string, unknown>>
  }

  /**
   * Create a model in this database
   * @param name Model name
   * @param schema Schema definition
   * @returns Model instance
   */
  model<T extends object>(name: string, schema: Schema<T>): Model<T> {
    // Check if model already exists
    const existing = this._modelRegistry.get(name)
    if (existing) {
      return existing as unknown as Model<T>
    }

    // Create storage strategy for this model
    // Each model gets its own storage instance
    let storage: StorageStrategy<T>

    if (this._config.storage === 'file' && this._config.file) {
      storage = new FileStorageStrategy<T>({
        dataPath: this._config.file.dataPath,
        modelName: name,
        persistMode: this._config.file.persistMode,
        debounceMs: this._config.file.debounceMs,
        compaction: this._config.file.compaction
      })
    } else if (this._config.storage === 'sqlite' && this._config.sqlite) {
      storage = new SqliteStorageStrategy<T>({
        dataPath: this._config.sqlite.dataPath,
        modelName: name
      })
    } else if (this._config.storage === 'wiredtiger' && this._config.wiredtiger) {
      storage = new WiredTigerStorageStrategy<T>({
        dataPath: this._config.wiredtiger.dataPath,
        modelName: name,
        cacheSize: this._config.wiredtiger.cacheSize,
        compressor: this._config.wiredtiger.compressor
      })
    } else {
      // Memory storage - create new instance for each model
      storage = new MemoryStorageStrategy<T>()
    }

    // Create model with storage
    const model = new Model<T>(schema, undefined, storage, this)

    // Initialize storage asynchronously and pass promise to model
    // Model will automatically wait for this on first operation
    const initPromise = storage
      .initialize()
      .then(async () => {
        // Record schema in storage after initialization
        if (typeof storage.recordSchema === 'function') {
          const schemaJSON = schema.toJSON()
          await storage.recordSchema({
            modelName: name,
            version: schemaJSON.version,
            definition: schemaJSON.definition,
            indexes: schemaJSON.indexes,
            options: schemaJSON.options
          })
        }
      })
      .catch(err => {
        console.error(`Error initializing storage for model ${name}:`, err)
        throw err
      })
    model._setStorageInitPromise(initPromise)

    // Register TTL indexes from schema
    const ttlIndexes = schema.getTTLIndexes()
    for (const [field, ttlSeconds] of ttlIndexes) {
      this._ttlManager.registerTTLIndex(model, field, ttlSeconds)
    }

    // Register model with type-safe cast to common supertype
    this._modelRegistry.set(name, model as Model<Record<string, unknown>>)

    return model
  }

  /**
   * Get a model from this database's registry
   * @param name Model name
   * @returns Model instance or undefined
   */
  getModel<T extends object = Record<string, unknown>>(name: string): Model<T> | undefined {
    return this._modelRegistry.get(name) as any
  }

  /**
   * Clear all models in this database and their storage
   */
  async clearModels(): Promise<void> {
    // Clear storage for each model
    for (const model of this._modelRegistry.values()) {
      const storage = (model as unknown as { _storage: StorageStrategy<Record<string, unknown>> })
        ._storage
      if (storage && typeof storage.clear === 'function') {
        await storage.clear()
      }
    }
    // Clear model registry
    this._modelRegistry.clear()
  }

  /**
   * Drop the entire database - deletes all physical storage files and clears all models
   * This is a destructive operation that cannot be undone
   */
  async dropDatabase(): Promise<void> {
    // Clean up TTL intervals
    this._ttlManager.cleanup()

    // Drop storage for each model (deletes physical files)
    for (const model of this._modelRegistry.values()) {
      const storage = (model as unknown as { _storage: StorageStrategy<Record<string, unknown>> })
        ._storage

      // Flush any pending writes first
      if (storage && typeof storage.flush === 'function') {
        try {
          await storage.flush()
        } catch (error) {
          console.warn('Warning: Failed to flush storage during drop:', error)
        }
      }

      // Close connections
      if (storage && typeof storage.close === 'function') {
        try {
          storage.close()
        } catch (error) {
          console.warn('Warning: Failed to close storage during drop:', error)
        }
      }

      // Drop the storage (delete files)
      if (storage && typeof storage.drop === 'function') {
        await storage.drop()
      }
    }

    // Clear model registry
    this._modelRegistry.clear()
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    // Clean up TTL intervals
    this._ttlManager.cleanup()

    // Flush any pending writes in file storage
    for (const model of this._modelRegistry.values()) {
      const storage = (
        model as unknown as { _storage: { flush?: () => Promise<void>; close?: () => void } }
      )._storage
      if (storage && typeof storage.flush === 'function') {
        await storage.flush()
      }
      // Close database connections (SQLite, WiredTiger, etc.)
      if (storage && typeof storage.close === 'function') {
        storage.close()
      }
    }
    // Clear model registry so new models can be created after reconnect
    this._modelRegistry.clear()
  }
}
