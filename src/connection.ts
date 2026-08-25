import { EventEmitter } from 'node:events'
import { Database, DatabaseConfig } from './database'
import { Schema } from './schema'
import { Model } from './model'

// Default database instance (auto-created in-memory)
let defaultDatabase: Database = new Database()

// Mongoose-compatible connection state: 0 = disconnected, 1 = connected.
// The default database is usable without an explicit connect(), so this
// tracks the explicit lifecycle only — applications that gate optional
// database work on `connection.readyState === 1` behave as with mongoose.
let readyState = 0

/**
 * Mongoose-compatible readyState values (like mongoose.STATES).
 * memgoose connects synchronously, so 'connecting' is never reported;
 * 'disconnecting' is observable while disconnect() awaits storage flushes.
 */
export const STATES = Object.freeze({
  disconnected: 0,
  connected: 1,
  connecting: 2,
  disconnecting: 3,
  uninitialized: 99
})

/**
 * Mongoose-compatible connection handle (like mongoose.connection).
 * An EventEmitter exposing the lifecycle state, the default database under
 * `db`, and a close() alias for disconnect(). Emits 'connected'/'open' on
 * connect() and 'disconnected'/'close' on disconnect(), so bootstrap code
 * registering listeners behaves as with mongoose.
 */
class Connection extends EventEmitter {
  get readyState(): number {
    return readyState
  }

  /** The active default Database instance (mongoose exposes the driver Db here). */
  get db(): Database {
    return defaultDatabase
  }

  async close(): Promise<void> {
    await disconnect()
  }
}

export const connection = new Connection()

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
  readyState = 1
  connection.emit('connected')
  connection.emit('open')
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
  const database = defaultDatabase
  const wasConnected = readyState === STATES.connected
  // Storage flushes make disconnect genuinely asynchronous — report the
  // 'disconnecting' state while they are in flight.
  if (wasConnected) readyState = STATES.disconnecting
  try {
    await database.disconnect()
  } finally {
    // Only reset when no newer connect() replaced the database while this
    // disconnect was in flight; a failed disconnect still ends disconnected
    // (mongoose reaches 'disconnected' even on forced close). Events fire
    // only on a genuine connected → disconnected transition.
    if (defaultDatabase === database && readyState !== STATES.disconnected) {
      readyState = STATES.disconnected
      if (wasConnected) {
        connection.emit('disconnected')
        connection.emit('close')
      }
    }
  }
}

/**
 * Drop the default database - deletes all physical storage files
 * This is a destructive operation that cannot be undone
 * After dropping, a fresh database instance is created
 */
export async function dropDatabase(): Promise<void> {
  await defaultDatabase.dropDatabase()
  // Recreate default database to ensure fresh instance
  defaultDatabase = new Database()
}

/**
 * Get the default database instance
 * @returns Default Database instance
 */
export function getDefaultDatabase(): Database {
  return defaultDatabase
}
