export { Schema, VirtualType, ValidationError } from './src/schema'
export type {
  FieldOptions,
  ValidatorFunction,
  SchemaOptions,
  SaveHookContext,
  PreDeleteHookContext,
  PostDeleteHookContext,
  DeleteHookContext,
  PreUpdateHookContext,
  PostUpdateHookContext,
  UpdateHookContext,
  PreFindHookContext,
  PostFindHookContext,
  FindHookContext
} from './src/schema'
export { Model } from './src/model'
export type {
  Query,
  QueryValue,
  QueryOperator,
  Update,
  UpdateOperator,
  QueryOptions,
  Document
} from './src/model'
export { QueryBuilder } from './src/query-builder'
export { DocumentQueryBuilder } from './src/document-query-builder'
export { FindQueryBuilder } from './src/find-query-builder'
export { ObjectId } from './src/objectid'

// Database and connection management (Mongoose-like API)
export { Database } from './src/database'
export type { DatabaseConfig } from './src/database'
export {
  connect,
  createDatabase,
  model,
  getModel,
  clearRegistry,
  disconnect,
  getDefaultDatabase
} from './src/connection'

// Storage strategies (for custom implementations)
export {
  StorageStrategy,
  MemoryStorageStrategy,
  FileStorageStrategy,
  SqliteStorageStrategy
} from './src/storage'
export type { FileStorageOptions, SqliteStorageOptions } from './src/storage'
