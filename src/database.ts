import {
  StorageStrategy,
  MemoryStorageStrategy,
  FileStorageStrategy,
  SqliteStorageStrategy,
  WiredTigerStorageStrategy
} from './storage'
import { Model } from './model'
import { Schema } from './schema'

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
  private _storage: StorageStrategy<any>
  private _modelRegistry: Map<string, Model<any>>
  private _config: DatabaseConfig

  constructor(config: DatabaseConfig = {}) {
    this._config = config
    this._modelRegistry = new Map()
    // Note: storage is created per-model, not per-database
    this._storage = null as any // Placeholder
  }

  /**
   * Create a model in this database
   * @param name Model name
   * @param schema Schema definition
   * @returns Model instance
   */
  model<T extends Record<string, any>>(name: string, schema: Schema<T>): Model<T> {
    // Check if model already exists
    const existing = this._modelRegistry.get(name)
    if (existing) {
      return existing as Model<T>
    }

    // Create storage strategy for this model
    // Each model gets its own storage instance
    let storage: StorageStrategy<T>

    if (this._config.storage === 'file' && this._config.file) {
      storage = new FileStorageStrategy<T>({
        dataPath: this._config.file.dataPath,
        modelName: name,
        persistMode: this._config.file.persistMode,
        debounceMs: this._config.file.debounceMs
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
    const initPromise = storage.initialize().catch(err => {
      console.error(`Error initializing storage for model ${name}:`, err)
      throw err
    })
    model._setStorageInitPromise(initPromise)

    // Register model
    this._modelRegistry.set(name, model)

    return model
  }

  /**
   * Get a model from this database's registry
   * @param name Model name
   * @returns Model instance or undefined
   */
  getModel(name: string): Model<any> | undefined {
    return this._modelRegistry.get(name)
  }

  /**
   * Clear all models in this database and their storage
   */
  async clearModels(): Promise<void> {
    // Clear storage for each model
    for (const model of this._modelRegistry.values()) {
      const storage = (model as any)._storage
      if (storage && typeof storage.clear === 'function') {
        await storage.clear()
      }
    }
    // Clear model registry
    this._modelRegistry.clear()
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    // Flush any pending writes in file storage
    for (const model of this._modelRegistry.values()) {
      const storage = (model as any)._storage
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
