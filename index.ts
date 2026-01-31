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
  PopulateOptions,
  Document
} from './src/model'
export { QueryBuilder } from './src/query-builder'
export { DocumentQueryBuilder } from './src/document-query-builder'
export { FindQueryBuilder } from './src/find-query-builder'
export { ObjectId } from './src/objectid'

// Types namespace (Mongoose-compatible)
import { ObjectId as _ObjectId } from './src/objectid'
export const Types = {
  ObjectId: _ObjectId
}

// Aggregation pipeline
export type {
  AggregationPipeline,
  AggregationStage,
  GroupStage,
  AccumulatorExpression,
  ProjectStage,
  ProjectionExpression,
  LookupStage,
  UnwindStage,
  SortStage,
  ReplaceRootStage
} from './src/aggregation'

// Database and connection management (Mongoose-like API)
export { Database } from './src/database'
export type { DatabaseConfig } from './src/database'
export { TTLManager } from './src/ttl-manager'
export {
  connect,
  createDatabase,
  model,
  getModel,
  clearRegistry,
  disconnect,
  dropDatabase,
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
