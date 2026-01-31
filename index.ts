// Schema and related exports
import { Schema as _Schema, VirtualType, ValidationError, DuplicateKeyError } from './src/schema'
export { VirtualType, ValidationError, DuplicateKeyError }
export const Schema = _Schema
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

// Model and Document exports
import { Model as _Model, Document as _Document } from './src/model'
export const Model = _Model
export const Document = _Document
export type {
  Query,
  QueryValue,
  QueryOperator,
  Update,
  UpdateOperator,
  QueryOptions,
  PopulateOptions,
  IDocument
} from './src/model'

// Query builders
export { QueryBuilder } from './src/query-builder'
export { DocumentQueryBuilder } from './src/document-query-builder'
export { FindQueryBuilder } from './src/find-query-builder'

// ObjectId
import { ObjectId as _ObjectId } from './src/objectid'
export const ObjectId = _ObjectId

// Types namespace (Mongoose-compatible)
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
import { Database as _Database } from './src/database'
export const Database = _Database
export type { DatabaseConfig } from './src/database'
export { TTLManager } from './src/ttl-manager'
import {
  connect as _connect,
  createDatabase as _createDatabase,
  model as _model,
  getModel as _getModel,
  clearRegistry as _clearRegistry,
  disconnect as _disconnect,
  dropDatabase as _dropDatabase,
  getDefaultDatabase as _getDefaultDatabase
} from './src/connection'
export const connect = _connect
export const createDatabase = _createDatabase
export const model = _model
export const getModel = _getModel
export const clearRegistry = _clearRegistry
export const disconnect = _disconnect
export const dropDatabase = _dropDatabase
export const getDefaultDatabase = _getDefaultDatabase

// Storage strategies (for custom implementations)
export {
  StorageStrategy,
  MemoryStorageStrategy,
  FileStorageStrategy,
  SqliteStorageStrategy
} from './src/storage'
export type { FileStorageOptions, SqliteStorageOptions } from './src/storage'

// Default export - mongoose-compatible structure
// Allows: import mongoose from 'memgoose'
// Then: mongoose.Schema, mongoose.Schema.Types.ObjectId, mongoose.model(), etc.
const memgoose = {
  Schema: _Schema,
  Model: _Model,
  Document: _Document,
  ObjectId: _ObjectId,
  Types: {
    ObjectId: _ObjectId
  },
  Database: _Database,
  connect: _connect,
  createDatabase: _createDatabase,
  model: _model,
  getModel: _getModel,
  clearRegistry: _clearRegistry,
  disconnect: _disconnect,
  dropDatabase: _dropDatabase,
  getDefaultDatabase: _getDefaultDatabase,
  VirtualType,
  ValidationError,
  DuplicateKeyError
}

export default memgoose
