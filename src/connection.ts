import { Database, DatabaseConfig } from './database'
import { Schema } from './schema'
import { Model } from './model'

// Default database instance (auto-created in-memory)
let defaultDatabase: Database = new Database()

/**
 * Configure and connect to the default database (like mongoose.connect())
 * Must be called before creating models with model()
 *
 * @param config Database configuration
 * @returns Database instance
 * @example
 * ```typescript
 * const db = connect({
 *   storage: 'file',
 *   file: { dataPath: './data', persistMode: 'debounced' }
 * })
 *
 * const User = model('User', userSchema) // Uses configured database
 * ```
 */
export function connect(config: DatabaseConfig = {}): Database {
  defaultDatabase = new Database(config)
  return defaultDatabase
}

/**
 * Create a new database instance (like mongoose.createConnection())
 * Use for multiple databases with different storage configurations
 *
 * @param config Database configuration
 * @returns Database instance
 * @example
 * ```typescript
 * const mainDb = createDatabase({
 *   storage: 'file',
 *   file: { dataPath: './data' }
 * })
 *
 * const User = mainDb.model('User', userSchema)
 * ```
 */
export function createDatabase(config: DatabaseConfig = {}): Database {
  return new Database(config)
}

/**
 * Create a model using the default database (like mongoose.model())
 * If connect() was never called, uses an in-memory database
 *
 * @param name Model name
 * @param schema Schema definition
 * @returns Model instance
 * @example
 * ```typescript
 * const User = model('User', userSchema)
 * ```
 */
export function model<T extends object>(name: string, schema: Schema<T>): Model<T> {
  return defaultDatabase.model(name, schema)
}

/**
 * Get a model from the default database
 * @param name Model name
 * @returns Model instance or undefined
 */
export function getModel<T extends object = Record<string, unknown>>(
  name: string
): Model<T> | undefined {
  return defaultDatabase.getModel(name)
}

/**
 * Clear all models in the default database and their storage
 * Useful for testing - recreates the default database with fresh storage
 */
export async function clearRegistry(): Promise<void> {
  await defaultDatabase.clearModels()
  // Recreate default database to ensure fresh storage instance
  defaultDatabase = new Database()
}

/**
 * Disconnect from the default database
 */
export async function disconnect(): Promise<void> {
  await defaultDatabase.disconnect()
}

/**
 * Get the default database instance
 * @returns Default Database instance
 */
export function getDefaultDatabase(): Database {
  return defaultDatabase
}
