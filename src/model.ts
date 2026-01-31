import { Schema } from './schema'
import { ObjectId } from './objectid'
import { QueryBuilder } from './query-builder'
import { DocumentQueryBuilder } from './document-query-builder'
import { FindQueryBuilder } from './find-query-builder'
import { QueryableKeys } from './type-utils'
import { StorageStrategy, MemoryStorageStrategy } from './storage'
import type { Document } from './document'
import type { Database } from './database'
import type { AggregationPipeline } from './aggregation'

// Symbols for internal document properties (non-enumerable)
const ORIGINAL_DOC = Symbol('originalDoc')
const MODEL_REF = Symbol('modelRef')

// Re-export Document for backwards compatibility
export type { Document }

// Deep partial type for nested objects
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

// Type definitions for query operators
export type QueryOperator<T = unknown> = {
  $eq?: T
  $ne?: T
  $in?: T[]
  $nin?: T[]
  $gt?: T
  $gte?: T
  $lt?: T
  $lte?: T
  $regex?: string | RegExp
  $exists?: boolean
  $size?: number
  $elemMatch?: Record<string, unknown>
  $all?: T extends unknown[] ? T : never
  $not?: QueryOperator<T>
}

// Query can be a simple value or an operator object
export type QueryValue<T = unknown> = T | QueryOperator<T>

// Logical operators type
type LogicalQueryOperators<T extends object> = {
  $or?: Query<T>[]
  $and?: Query<T>[]
  $nor?: Query<T>[]
}

// Query object with field names as keys and optional logical operators
export type Query<T extends object = Record<string, unknown>> = {
  [K in QueryableKeys<T>]?: QueryValue<T[K]>
} & LogicalQueryOperators<T>

// Update operators
export type UpdateOperator<T extends object = Record<string, unknown>> = {
  $set?: Partial<T>
  $unset?: Partial<Record<keyof T, unknown>>
  $inc?: Partial<Record<keyof T, number>>
  $dec?: Partial<Record<keyof T, number>>
  $push?: Partial<Record<keyof T, unknown>>
  $pull?: Partial<Record<keyof T, unknown>>
  $addToSet?: Partial<Record<keyof T, unknown>>
  $pop?: Partial<Record<keyof T, 1 | -1>>
  $rename?: Partial<Record<keyof T, string>>
}

// Update can be direct field updates or operator-based
export type Update<T extends object = Record<string, unknown>> = Partial<T> | UpdateOperator<T>

// Query options
export type QueryOptions<T extends object = Record<string, unknown>> = {
  sort?: Partial<Record<keyof T, 1 | -1>>
  limit?: number
  skip?: number
  select?: Partial<Record<keyof T, 0 | 1>>
  lean?: boolean
}

// Populate options for advanced population
export type PopulateOptions = {
  path: string
  select?: string | string[] | Record<string, 0 | 1>
  match?: Query<object>
  populate?: PopulateOptions | PopulateOptions[]
  model?: string
}

export class Model<T extends object = Record<string, unknown>> {
  private _storage: StorageStrategy<T>
  private _schema?: Schema<T>
  private _discriminatorKey?: string
  private _discriminatorValue?: string
  private _database?: Database // Database reference for getModel
  private _storageInitPromise: Promise<void> | null = null

  constructor(
    schema?: Schema<T>,
    discriminatorValue?: string,
    storage?: StorageStrategy<T>,
    database?: Database
  ) {
    this._schema = schema
    this._storage = storage || new MemoryStorageStrategy<T>()
    this._discriminatorValue = discriminatorValue
    this._database = database

    // Auto-create indexes from schema
    if (schema) {
      // Set discriminator key from schema options
      const schemaOptions = schema.getOptions()
      this._discriminatorKey = schemaOptions.discriminatorKey || '__t'

      // Get unique indexes from schema
      const uniqueIndexes = new Set(schema.getUniqueIndexes())

      for (const fields of schema.getIndexes()) {
        const indexKey = (Array.isArray(fields) ? fields : [fields]).join(',')
        const isUnique = uniqueIndexes.has(indexKey)
        this.createIndex(fields, { unique: isUnique })
      }

      // Add static methods from schema
      const modelWithStatics = this as Record<string, unknown>
      for (const [methodName, methodFn] of Object.entries(schema.statics)) {
        modelWithStatics[methodName] = methodFn.bind(this)
      }
    }
  }

  // Set the storage initialization promise (called by Database)
  _setStorageInitPromise(promise: Promise<void>): void {
    this._storageInitPromise = promise
  }

  // Helper to ensure storage is initialized before any operation
  private async _ensureStorageReady(): Promise<void> {
    if (this._storageInitPromise) {
      await this._storageInitPromise
      this._storageInitPromise = null // Clear after first wait
    }
  }

  private _applyVirtuals(doc: T): T & Document {
    if (!this._schema) return doc as T & Document

    const virtuals = this._schema.getVirtuals()

    // Always create a copy to add methods, even if no virtuals
    // Need to use intermediate variable to allow dynamic property assignment
    const intermediate = { ...doc }

    // Apply field getters first
    const withGetters = this._schema.applyGetters(intermediate as T)

    // Create a mutable result object for adding properties dynamically
    const result = withGetters as T & Document

    // Apply virtuals if any
    if (virtuals.size > 0) {
      for (const [name, virtual] of virtuals.entries()) {
        // Define property with getter and optionally setter
        const propertyDescriptor: PropertyDescriptor = {
          enumerable: true,
          configurable: true
        }

        // Add getter
        propertyDescriptor.get = function (this: T & Document) {
          return virtual.applyGetter(this)
        }

        // Add setter if available, otherwise add no-op setter to allow assignment without error
        if (virtual.hasSetter()) {
          propertyDescriptor.set = function (this: T & Document, value: unknown) {
            // Apply setter to this object (which modifies the document properties)
            virtual.applySetter(this, value)
          }
        } else {
          // No-op setter for getter-only virtuals (silently ignore assignments)
          propertyDescriptor.set = function () {
            // Intentionally empty - assignments are silently ignored
          }
        }

        Object.defineProperty(result, name, propertyDescriptor)
      }
    }

    // Add instance methods from schema
    if (this._schema) {
      for (const [methodName, methodFn] of Object.entries(this._schema.methods)) {
        const boundMethod = methodFn.bind(result) as unknown
        ;(result as Record<string, unknown>)[methodName] = boundMethod
      }
    }

    // Store reference to original document and model for save functionality using Symbols
    // This makes them non-enumerable and won't show up in iteration
    ;(result as unknown as Record<symbol, unknown>)[ORIGINAL_DOC] = doc
    ;(result as unknown as Record<symbol, unknown>)[MODEL_REF] = this

    // Add save method
    result.save = async () => {
      const originalDoc = (result as unknown as Record<symbol, unknown>)[ORIGINAL_DOC] as T
      const model = (result as unknown as Record<symbol, unknown>)[MODEL_REF] as Model<T>

      await model._ensureStorageReady()

      // Check if original document still exists in storage (by _id or reference)
      const allDocs = await model._storage.getAll()
      const docExists = allDocs.some((d: T) => {
        const dRecord = d as unknown as Record<string, unknown>
        const origRecord = originalDoc as unknown as Record<string, unknown>
        return (
          d === originalDoc ||
          (dRecord._id && origRecord._id && String(dRecord._id) === String(origRecord._id))
        )
      })
      if (!docExists) {
        throw new Error('Document has been deleted and cannot be saved')
      }

      // Get list of virtual property names to exclude from saving
      const virtualNames = new Set(model._schema?.getVirtuals().keys())

      // Create a test copy to validate before modifying the original
      const testCopy = JSON.parse(JSON.stringify(originalDoc)) as T

      // Copy modified fields to test copy (skip virtuals and methods)
      for (const key in result) {
        if (
          typeof (result as unknown as Record<string, unknown>)[key] === 'function' || // Skip methods
          virtualNames.has(key) // Skip virtuals
        ) {
          continue
        }

        // Copy the value to the test copy
        ;(testCopy as unknown as Record<string, unknown>)[key] = (
          result as unknown as Record<string, unknown>
        )[key]
      }

      // Remove fields that were deleted from the document
      for (const key in testCopy) {
        if (!virtualNames.has(key) && !(key in result)) {
          delete testCopy[key as keyof T]
        }
      }

      // Apply setters to test copy
      if (model._schema) {
        model._schema.applySetters(testCopy)
      }

      // Apply timestamps to test copy (update operation)
      model._applyTimestamps(testCopy, 'update')

      // Validate the test copy
      await model._validateDocument(testCopy)

      // Check unique constraints on test copy (excluding the original doc)
      model._checkUniqueConstraints(testCopy, originalDoc)

      // If validation passed, copy all fields from test copy to original
      for (const key in testCopy) {
        originalDoc[key as keyof T] = testCopy[key as keyof T]
      }

      // Remove fields from original that don't exist in test copy
      for (const key in originalDoc) {
        if (!(key in testCopy)) {
          delete originalDoc[key as keyof T]
        }
      }

      // Execute pre-save hooks
      await model._executePreHooks('save', { doc: originalDoc })

      // Persist changes to storage
      await model._storage.update(originalDoc, originalDoc)

      // Rebuild indexes (in case indexed fields changed)
      model._rebuildIndexes()

      // Execute post-save hooks
      await model._executePostHooks('save', { doc: originalDoc })

      // Re-apply virtuals and return the updated document
      return model._applyVirtuals(originalDoc)
    }

    // Add toJSON and toObject methods
    withGetters.toJSON = (options?: {
      virtuals?: boolean
      getters?: boolean
      transform?: (doc: Record<string, unknown>) => Record<string, unknown>
    }) => {
      return this._serializeDocument(
        withGetters as unknown as Record<string, unknown>,
        options || {}
      )
    }

    withGetters.toObject = (options?: {
      virtuals?: boolean
      getters?: boolean
      transform?: (doc: Record<string, unknown>) => Record<string, unknown>
    }) => {
      return this._serializeDocument(
        withGetters as unknown as Record<string, unknown>,
        options || {}
      )
    }

    return withGetters
  }

  private _serializeDocument(
    doc: Record<string, unknown>,
    options: {
      virtuals?: boolean
      getters?: boolean
      transform?: (doc: Record<string, unknown>) => Record<string, unknown>
    }
  ): Record<string, unknown> {
    let result = { ...doc }

    // Remove all function properties (methods) and convert ObjectIds to strings
    for (const key in result) {
      if (typeof result[key] === 'function') {
        delete result[key]
      } else if (result[key] instanceof ObjectId) {
        result[key] = result[key].toString()
      }
    }

    // Apply transform if provided
    if (options.transform) {
      result = options.transform(result)
    }

    return result
  }

  private _applyFieldSelection(doc: T, select?: Partial<Record<keyof T, 0 | 1>>): Partial<T> {
    if (!select || Object.keys(select).length === 0) return doc

    const fields = Object.keys(select) as Array<keyof T>
    const isInclusion = fields.some(f => select[f] === 1)
    const isExclusion = fields.some(f => select[f] === 0)

    // Can't mix inclusion and exclusion (except for _id)
    if (isInclusion && isExclusion && !('_id' in select)) {
      throw new Error('Cannot mix inclusion and exclusion in field selection')
    }

    const result: Record<string, unknown> = {}

    if (isInclusion) {
      // Include only specified fields
      for (const field of fields) {
        if (select[field] === 1 && field in doc) {
          result[field as string] = doc[field]
        }
      }

      // Always include _id unless explicitly excluded
      if (!('_id' in select) || select['_id' as keyof T] !== 0) {
        if ('_id' in doc) {
          result._id = (doc as Record<string, unknown>)._id
        }
      }
    } else {
      // Exclude specified fields (include everything else)
      for (const key in doc) {
        if (!(key in select) || select[key as keyof T] !== 0) {
          result[key] = doc[key]
        }
      }
    }

    return result as Partial<T>
  }

  private async _executePreHooks(event: string, context: Record<string, unknown>): Promise<void> {
    if (!this._schema) return

    const hooks = this._schema.getPreHooks(event)
    for (const hook of hooks) {
      await hook(context)
    }
  }

  private async _executePostHooks(event: string, context: Record<string, unknown>): Promise<void> {
    if (!this._schema) return

    const hooks = this._schema.getPostHooks(event)
    for (const hook of hooks) {
      await hook(context)
    }
  }

  private async _validateDocument(doc: Partial<T>): Promise<void> {
    if (!this._schema) return
    await this._schema.validate(doc)
  }

  private _applyDefaults(doc: Partial<T>): void {
    if (!this._schema) return
    this._schema.applyDefaults(doc)
  }

  private _ensureId(doc: Partial<T>): void {
    // Auto-generate _id if not provided
    const docWithId = doc as Partial<T> & { _id?: ObjectId }
    if (docWithId._id === undefined) {
      docWithId._id = new ObjectId()
    }
  }

  private _applyTimestamps(doc: Partial<T>, operation: 'create' | 'update'): void {
    if (!this._schema) return

    const timestampConfig = this._schema.getTimestampConfig()
    if (!timestampConfig) return

    const now = new Date()
    const docWithTimestamps = doc as unknown as Record<string, unknown>

    if (operation === 'create' && timestampConfig.createdAt) {
      docWithTimestamps[timestampConfig.createdAt] = now
    }

    if (timestampConfig.updatedAt) {
      docWithTimestamps[timestampConfig.updatedAt] = now
    }
  }

  private _checkUniqueConstraints(doc: Partial<T>, excludeDoc?: T): void {
    // Delegate to storage strategy
    this._storage.checkUniqueConstraints(doc, excludeDoc)
  }

  async _applyPopulate(
    docs: T[],
    options: string[] | PopulateOptions | PopulateOptions[]
  ): Promise<T[]> {
    if (!this._schema) return docs

    // Normalize options to array of PopulateOptions
    const normalizedOptions = this._normalizePopulateOptions(options)
    if (normalizedOptions.length === 0) return docs

    let populated = [...docs]

    // Apply each populate option
    for (const option of normalizedOptions) {
      populated = await this._populatePath(populated, option)
    }

    return populated
  }

  private _normalizePopulateOptions(
    options: string[] | PopulateOptions | PopulateOptions[]
  ): PopulateOptions[] {
    if (!options) return []

    if (Array.isArray(options)) {
      // Check if it's string[] or PopulateOptions[]
      if (options.length === 0) return []
      if (typeof options[0] === 'string') {
        return (options as string[]).map(path => ({ path }))
      }
      return options as PopulateOptions[]
    }

    // Single PopulateOptions object
    if (typeof options === 'object' && 'path' in options) {
      return [options as PopulateOptions]
    }

    // Single string
    if (typeof options === 'string') {
      return [{ path: options }]
    }

    return []
  }

  private async _populatePath(docs: T[], option: PopulateOptions): Promise<T[]> {
    if (!this._schema) return docs

    const { path, select, match, populate: nestedPopulate, model: modelOverride } = option

    const fieldOptions = this._schema.getFieldOptions(path as keyof T)
    if (!fieldOptions?.ref && !modelOverride) return docs

    const refModelName = modelOverride || fieldOptions?.ref
    if (!refModelName) return docs

    // Get model from database registry
    const refModel = this._database?.getModel(refModelName)
    if (!refModel) {
      console.warn(`Referenced model ${refModelName} not found for populate`)
      return docs
    }

    // Collect all IDs to populate (batch fetch optimization)
    const idsToPopulate = new Set<unknown>()
    for (const doc of docs) {
      const docAsRecord = doc as unknown as Record<string, unknown>
      const value = docAsRecord[path]
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(id => idsToPopulate.add(id))
        } else {
          idsToPopulate.add(value)
        }
      }
    }

    if (idsToPopulate.size === 0) return docs

    // Build query with match filter
    let populateQuery: Query<Record<string, unknown>> | undefined

    if (match) {
      // Combine ID filter with match conditions using $and
      populateQuery = {
        $and: [{ _id: { $in: Array.from(idsToPopulate) } }, match]
      }
    } else {
      populateQuery = {
        _id: { $in: Array.from(idsToPopulate) }
      }
    }

    // Fetch referenced documents
    let refDocs = await refModel.find(populateQuery)

    // Apply field selection
    if (select) {
      refDocs = refDocs.map((doc: Record<string, unknown>) =>
        this._applyPopulateSelect(doc, select)
      ) as (Record<string, unknown> & Document)[]
    }

    // Handle nested populate
    if (nestedPopulate) {
      refDocs = (await refModel._applyPopulate(
        refDocs as unknown as any[],
        nestedPopulate
      )) as unknown as (Record<string, unknown> & Document)[]
    }

    // Create lookup map
    const refMap = new Map(refDocs.map((doc: Record<string, unknown>) => [doc._id, doc]))

    // Replace IDs with documents
    const populated = docs.map((doc: T) => {
      const docAsRecord = doc as unknown as Record<string, unknown>
      const populatedDoc = { ...docAsRecord }
      const value = populatedDoc[path]

      if (Array.isArray(value)) {
        // Populate array of references
        populatedDoc[path] = value.map((id: unknown) => refMap.get(id)).filter(Boolean)
      } else if (value !== undefined && value !== null) {
        // Populate single reference
        const refDoc = refMap.get(value)
        if (refDoc) {
          populatedDoc[path] = refDoc
        }
      }

      return populatedDoc as T
    })

    return populated
  }

  private _applyPopulateSelect(
    doc: Record<string, unknown>,
    select: string | string[] | Record<string, 0 | 1>
  ): Record<string, unknown> {
    let selectObj: Partial<Record<keyof T, 0 | 1>>

    if (typeof select === 'string') {
      // Convert space-separated string to object
      selectObj = {}
      select.split(/\s+/).forEach(field => {
        if (field.startsWith('-')) {
          selectObj[field.slice(1) as keyof T] = 0
        } else if (field.startsWith('+')) {
          selectObj[field.slice(1) as keyof T] = 1
        } else {
          selectObj[field as keyof T] = 1
        }
      })
    } else if (Array.isArray(select)) {
      // Convert array to object
      selectObj = {}
      select.forEach(field => {
        selectObj[field as keyof T] = 1
      })
    } else {
      selectObj = select as Partial<Record<keyof T, 0 | 1>>
    }

    return this._applyFieldSelection(doc as T, selectObj)
  }

  // --- Indexing ---
  async createIndex(
    fields: keyof T | Array<keyof T>,
    options?: { unique?: boolean }
  ): Promise<void> {
    // Delegate to storage strategy
    await this._storage.createIndex(fields, options)
  }

  // Helper to check if storage supports native SQL operations
  private _hasNativeQuery(): boolean {
    return typeof (this._storage as any).queryNative === 'function'
  }

  // Helper to efficiently find documents using indexes when possible
  private async _findDocumentsUsingIndexes(
    query: Query<T>,
    options?: QueryOptions<T>
  ): Promise<T[]> {
    // NEW: Check if storage supports native queries
    if (this._hasNativeQuery()) {
      return await (this._storage as any).queryNative(query, options)
    }

    // EXISTING: Fall back to JavaScript-based querying
    const keys = Object.keys(query)
    const queryRecord = query as unknown as Record<string, unknown>

    // Return copy of all documents if no query (to avoid mutation during iteration)
    if (keys.length === 0) return await this._storage.getAll()

    // Create a matcher function for the storage
    const matcher = (doc: T) => this._matches(doc, query)

    // Check if we can use an index (all fields must be simple equality, not operators)
    const allSimpleEquality = keys.every(k => typeof queryRecord[k] !== 'object')

    if (allSimpleEquality && keys.length > 0) {
      // Provide index hint to storage - it will use index if available
      const indexHint = {
        fields: keys as Array<keyof T>,
        values: queryRecord
      }
      return await this._storage.findDocuments(matcher, indexHint)
    }

    // No index hint - storage will use efficient linear scan
    return await this._storage.findDocuments(matcher)
  }

  // --- Query Matching ---
  // Helper for ObjectId comparison (defined once, not per document)
  private _compareValues(a: unknown, b: unknown): boolean {
    // Fast path for primitives (most common case)
    if (typeof a !== 'object' && typeof b !== 'object') {
      return a === b
    }

    // Handle ObjectId comparison
    if (a instanceof ObjectId || b instanceof ObjectId) {
      const aStr = a instanceof ObjectId ? a.toString() : String(a)
      const bStr = b instanceof ObjectId ? b.toString() : String(b)
      return aStr === bStr
    }
    return a === b
  }

  private _matches(doc: T, query: Query<T>): boolean {
    // Check for top-level logical operators first
    if ('$or' in query) {
      const conditions = (query as { $or: Query<T>[] }).$or
      if (!Array.isArray(conditions)) return false
      return conditions.some(condition => this._matches(doc, condition))
    }

    if ('$and' in query) {
      const conditions = (query as { $and: Query<T>[] }).$and
      if (!Array.isArray(conditions)) return false
      return conditions.every(condition => this._matches(doc, condition))
    }

    if ('$nor' in query) {
      const conditions = (query as { $nor: Query<T>[] }).$nor
      if (!Array.isArray(conditions)) return false
      return !conditions.some(condition => this._matches(doc, condition))
    }

    return Object.entries(query).every(([key, value]) => {
      const field = doc[key as keyof T]

      // Fast path: simple equality for non-object values (most common case)
      if (typeof value !== 'object' || value === null) {
        // MongoDB behavior: querying { field: null } matches both null and undefined (missing fields)
        if (value === null) {
          return field === null || field === undefined
        }
        return this._compareValues(field, value)
      }

      // Handle ObjectId equality
      if (value instanceof ObjectId) {
        return this._compareValues(field, value)
      }

      // Skip operator checking for arrays
      if (Array.isArray(value)) {
        return this._compareValues(field, value)
      }

      // Handle query operators
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !((value as any) instanceof ObjectId)
      ) {
        return Object.entries(value).every(([op, v]) => {
          switch (op) {
            case '$eq':
              // MongoDB behavior: $eq: null matches both null and undefined
              if (v === null) {
                return field === null || field === undefined
              }
              return this._compareValues(field, v)
            case '$ne':
              // MongoDB behavior: $ne: null excludes both null and undefined
              if (v === null) {
                return field !== null && field !== undefined
              }
              return field !== v
            case '$in':
              // MongoDB behavior: $in: [null] matches both null and undefined
              if (Array.isArray(v) && v.includes(null) && (field === null || field === undefined)) {
                return true
              }
              return Array.isArray(v) && v.includes(field)
            case '$nin':
              // MongoDB behavior: $nin: [null] excludes both null and undefined
              if (Array.isArray(v) && v.includes(null) && (field === null || field === undefined)) {
                return false
              }
              return Array.isArray(v) && !v.includes(field)
            case '$gt':
              return (field as unknown as number | Date) > (v as unknown as number | Date)
            case '$gte':
              return (field as unknown as number | Date) >= (v as unknown as number | Date)
            case '$lt':
              return (field as unknown as number | Date) < (v as unknown as number | Date)
            case '$lte':
              return (field as unknown as number | Date) <= (v as unknown as number | Date)
            case '$regex':
              return new RegExp(v as string).test(String(field))
            case '$exists':
              return v === true ? field !== undefined : field === undefined
            case '$size':
              return Array.isArray(field) && field.length === v
            case '$not':
              // Handle $not operator - negates the nested operators
              if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                return !Object.entries(v).every(([notOp, notV]) => {
                  switch (notOp) {
                    case '$eq':
                      return this._compareValues(field, notV)
                    case '$ne':
                      return field !== notV
                    case '$in':
                      return Array.isArray(notV) && notV.includes(field)
                    case '$nin':
                      return Array.isArray(notV) && !notV.includes(field)
                    case '$gt':
                      return (
                        (field as unknown as number | Date) > (notV as unknown as number | Date)
                      )
                    case '$gte':
                      return (
                        (field as unknown as number | Date) >= (notV as unknown as number | Date)
                      )
                    case '$lt':
                      return (
                        (field as unknown as number | Date) < (notV as unknown as number | Date)
                      )
                    case '$lte':
                      return (
                        (field as unknown as number | Date) <= (notV as unknown as number | Date)
                      )
                    case '$regex':
                      return new RegExp(notV as string).test(String(field))
                    case '$exists':
                      return notV === true ? field !== undefined : field === undefined
                    default:
                      return false
                  }
                })
              }
              return !this._compareValues(field, v)
            case '$elemMatch':
              if (!Array.isArray(field)) return false
              return field.some((item: unknown) => {
                if (typeof item !== 'object' || item === null) return false
                return Object.entries(v as Record<string, unknown>).every(([subKey, subValue]) => {
                  const subField = (item as Record<string, unknown>)[subKey]
                  // Support operators in elemMatch
                  if (
                    typeof subValue === 'object' &&
                    subValue !== null &&
                    !Array.isArray(subValue)
                  ) {
                    return Object.entries(subValue).every(([subOp, subOpValue]) => {
                      switch (subOp) {
                        case '$eq':
                          return subField === subOpValue
                        case '$ne':
                          return subField !== subOpValue
                        case '$gt':
                          return (
                            (subField as unknown as number | Date) >
                            (subOpValue as unknown as number | Date)
                          )
                        case '$gte':
                          return (
                            (subField as unknown as number | Date) >=
                            (subOpValue as unknown as number | Date)
                          )
                        case '$lt':
                          return (
                            (subField as unknown as number | Date) <
                            (subOpValue as unknown as number | Date)
                          )
                        case '$lte':
                          return (
                            (subField as unknown as number | Date) <=
                            (subOpValue as unknown as number | Date)
                          )
                        default:
                          return false
                      }
                    })
                  }
                  return subField === subValue
                })
              })
            case '$all':
              if (!Array.isArray(field) || !Array.isArray(v)) return false
              return (v as unknown[]).every(item => field.includes(item))
            default:
              return false
          }
        })
      }
      // This path should never be reached due to fast paths above, but keep for safety
      return this._compareValues(field, value)
    })
  }

  // --- Query API ---
  findOne(query: Query<T>, options?: QueryOptions<T>): DocumentQueryBuilder<T> {
    const operation = async (internalOptions?: QueryOptions<T>): Promise<(T & Document) | null> => {
      await this._ensureStorageReady()

      // Merge options from both sources (builder options take precedence)
      const mergedOptions = { ...options, ...internalOptions }

      await this._executePreHooks('findOne', { query })

      // Use storage's efficient findDocuments and get first result
      const results = await this._findDocumentsUsingIndexes(query)
      const doc = results.length > 0 ? results[0] : null

      if (!doc) {
        await this._executePostHooks('findOne', { query, result: null })
        return null
      }

      // Apply virtuals unless lean mode
      let result: T & Document = mergedOptions?.lean
        ? (doc as T & Document)
        : this._applyVirtuals(doc)

      // Apply field selection if specified
      if (mergedOptions?.select) {
        result = this._applyFieldSelection(result, mergedOptions.select) as T & Document
      }

      await this._executePostHooks('findOne', { query, result })
      return result
    }

    const builder = new DocumentQueryBuilder<T>(this, operation)

    // If options provided, apply them to builder
    if (options) {
      if (options.select) builder.select(options.select)
      if (options.lean !== undefined) builder.lean(options.lean)
    }

    return builder
  }

  find(query: Query<T> = {}, options?: QueryOptions<T>): FindQueryBuilder<T> {
    const builder = new FindQueryBuilder<T>(this, query)

    // If options provided, apply them to builder
    if (options) {
      if (options.sort) builder.sort(options.sort)
      if (options.limit) builder.limit(options.limit)
      if (options.skip) builder.skip(options.skip)
      if (options.select) builder.select(options.select)
      if (options.lean !== undefined) builder.lean(options.lean)
    }

    return builder
  }

  async _executeFindWithOptions(
    query: Query<T>,
    options: QueryOptions<T> = {}
  ): Promise<Array<T & Document>> {
    await this._ensureStorageReady()
    await this._executePreHooks('find', { query })

    // Add discriminator filter if this is a discriminator model
    if (this._discriminatorKey && this._discriminatorValue) {
      query = { ...query, [this._discriminatorKey]: this._discriminatorValue } as Query<T>
    }

    // NEW: If storage has native query support, use it with options directly
    if (this._hasNativeQuery()) {
      const results = await this._findDocumentsUsingIndexes(query, options)

      // Apply virtuals unless lean mode
      let finalResults: Array<T & Document> = options.lean
        ? results.map(r => r as T & Document)
        : results.map(doc => this._applyVirtuals(doc))

      // Apply field selection if specified
      if (options.select) {
        finalResults = finalResults.map(
          doc => this._applyFieldSelection(doc, options.select) as T & Document
        )
      }

      await this._executePostHooks('find', { query, results: finalResults })
      return finalResults
    }

    // EXISTING: JavaScript-based query execution
    const keys = Object.keys(query)

    // Get base results
    let results: T[] = []

    // Return all documents if no query
    if (keys.length === 0) {
      results = await this._storage.getAll()
    } else {
      // Always use _findDocumentsUsingIndexes - it will use indexes if available,
      // otherwise do efficient linear scan without copying
      results = await this._findDocumentsUsingIndexes(query)
    }

    // Apply options in JavaScript
    if (options.sort) {
      const sortEntries = Object.entries(options.sort)
      results.sort((a, b) => {
        for (const [field, direction] of sortEntries) {
          const aVal = a[field as keyof T]
          const bVal = b[field as keyof T]

          if (aVal < bVal) return direction === 1 ? -1 : 1
          if (aVal > bVal) return direction === 1 ? 1 : -1
        }
        return 0
      })
    }

    if (options.skip) {
      results = results.slice(options.skip)
    }

    if (options.limit) {
      results = results.slice(0, options.limit)
    }

    // Apply virtuals unless lean mode
    let finalResults: Array<T & Document> = options.lean
      ? results.map(r => r as T & Document)
      : results.map(doc => this._applyVirtuals(doc))

    // Apply field selection if specified
    if (options.select) {
      finalResults = finalResults.map(
        doc => this._applyFieldSelection(doc, options.select) as T & Document
      )
    }

    await this._executePostHooks('find', { query, results: finalResults })
    return finalResults
  }

  async create(doc: DeepPartial<T>): Promise<T & Document> {
    await this._ensureStorageReady()

    // Apply setters first (before defaults, validation, etc.)
    if (this._schema) {
      this._schema.applySetters(doc)
    }

    // Add discriminator key if this is a discriminator model
    if (this._discriminatorKey && this._discriminatorValue) {
      const docWithDiscriminator = doc as unknown as Record<string, unknown>
      docWithDiscriminator[this._discriminatorKey] = this._discriminatorValue
    }

    this._ensureId(doc as T)
    this._applyDefaults(doc as T)
    this._applyTimestamps(doc as T, 'create')
    await this._validateDocument(doc as T)
    this._checkUniqueConstraints(doc as T)
    await this._executePreHooks('save', { doc: doc as T })

    const fullDoc = doc as T
    await this._storage.add(fullDoc)

    await this._executePostHooks('save', { doc: fullDoc })
    return this._applyVirtuals(fullDoc)
  }

  async insertMany(docs: DeepPartial<T>[]): Promise<Array<T & Document>> {
    await this._ensureStorageReady()

    // Apply setters, defaults, timestamps, validate and check unique constraints (atomic - fail fast)
    for (const doc of docs) {
      if (this._schema) {
        this._schema.applySetters(doc)
      }

      // Add discriminator key if this is a discriminator model
      if (this._discriminatorKey && this._discriminatorValue) {
        const docWithDiscriminator = doc as unknown as Record<string, unknown>
        docWithDiscriminator[this._discriminatorKey] = this._discriminatorValue
      }

      this._ensureId(doc as T)
      this._applyDefaults(doc as T)
      this._applyTimestamps(doc as T, 'create')
      await this._validateDocument(doc as T)
    }

    // Check unique constraints - both against existing data and within the batch
    const fullDocs = docs as T[]

    // First check all docs against existing storage
    for (const doc of fullDocs) {
      this._checkUniqueConstraints(doc)
    }

    // Then check for duplicates within the batch itself
    // We'll temporarily add each doc to storage's indexes one by one, checking constraints each time
    for (let i = 0; i < fullDocs.length; i++) {
      const doc = fullDocs[i]

      // Check against previously processed docs in batch (which are now in indexes)
      if (i > 0) {
        this._checkUniqueConstraints(doc)
      }

      // Temporarily add this doc to indexes so next doc can be checked against it
      this._storage.updateIndexForDocument(null, doc)
    }

    // Rollback the temporary index updates (rebuild from actual storage)
    await this._rebuildIndexes()

    // If all validations pass, proceed with insertion
    for (const doc of fullDocs) {
      await this._executePreHooks('save', { doc })
    }
    await this._storage.addMany(fullDocs)
    for (const doc of fullDocs) {
      await this._executePostHooks('save', { doc })
    }
    return fullDocs.map(doc => this._applyVirtuals(doc))
  }

  // --- Delete Operations ---
  deleteOne(query: Query<T>): QueryBuilder<{ deletedCount: number }> {
    const operation = async () => {
      return this._executeDeleteOne(query)
    }
    return new QueryBuilder(operation)
  }

  private async _executeDeleteOne(query: Query<T>): Promise<{ deletedCount: number }> {
    await this._ensureStorageReady()
    await this._executePreHooks('delete', { query })

    // NEW: Use native delete if available
    if (typeof (this._storage as any).deleteNative === 'function') {
      try {
        // For single delete, add LIMIT 1 to query (SQLite will handle this via UPDATE/DELETE)
        const result = await (this._storage as any).deleteNative(query)
        // Limit to 1 for deleteOne semantics
        const deletedCount = Math.min(result.deletedCount, 1)
        await this._executePostHooks('delete', { query, deletedCount })
        return { deletedCount }
      } catch (error) {
        console.warn('Native delete failed, falling back to JavaScript:', error)
      }
    }

    // EXISTING: JavaScript-based delete logic
    // Use indexes for efficient lookup
    const candidates = await this._findDocumentsUsingIndexes(query)
    const docToDelete = candidates[0]

    if (!docToDelete) {
      await this._executePostHooks('delete', { query, deletedCount: 0 })
      return { deletedCount: 0 }
    }

    await this._storage.remove(docToDelete)
    // Efficiently update indexes for deleted document
    this._updateIndexForDocument(docToDelete, null)
    await this._executePostHooks('delete', { query, deletedCount: 1, doc: docToDelete })
    return { deletedCount: 1 }
  }

  deleteMany(query: Query<T>): QueryBuilder<{ deletedCount: number }> {
    const operation = async () => {
      return this._executeDeleteMany(query)
    }
    return new QueryBuilder(operation)
  }

  private async _executeDeleteMany(query: Query<T>): Promise<{ deletedCount: number }> {
    await this._ensureStorageReady()
    await this._executePreHooks('delete', { query })

    // NEW: Use native delete if available
    if (typeof (this._storage as any).deleteNative === 'function') {
      try {
        const result = await (this._storage as any).deleteNative(query)
        await this._executePostHooks('delete', { query, deletedCount: result.deletedCount })
        return result
      } catch (error) {
        console.warn('Native deleteMany failed, falling back to JavaScript:', error)
      }
    }

    // EXISTING: JavaScript-based delete logic
    // Use indexes for efficient lookup
    const docsToDelete = await this._findDocumentsUsingIndexes(query)
    if (docsToDelete.length === 0) {
      await this._executePostHooks('delete', { query, deletedCount: 0 })
      return { deletedCount: 0 }
    }

    await this._storage.removeMany(docsToDelete)

    await this._rebuildIndexes()
    await this._executePostHooks('delete', {
      query,
      deletedCount: docsToDelete.length,
      docs: docsToDelete
    })
    return { deletedCount: docsToDelete.length }
  }

  private async _rebuildIndexes(): Promise<void> {
    // Delegate to storage strategy
    await this._storage.rebuildIndexes()
  }

  private _updateIndexForDocument(oldDoc: T | null, newDoc: T | null): void {
    // Delegate to storage strategy
    this._storage.updateIndexForDocument(oldDoc, newDoc)
  }

  // --- Update Operations ---
  private _applyUpdate(doc: T, update: Update<T>): boolean {
    let modified = false

    // Check if update contains operators
    const hasOperators = Object.keys(update).some(k => k.startsWith('$'))

    if (hasOperators) {
      const updateOp = update as UpdateOperator<T>

      // $set
      if (updateOp.$set) {
        const docAsRecord = doc as unknown as Record<string, unknown>
        for (const [key, value] of Object.entries(updateOp.$set)) {
          docAsRecord[key] = value
          modified = true
        }
      }

      // $unset
      if (updateOp.$unset) {
        for (const key of Object.keys(updateOp.$unset)) {
          delete doc[key as keyof T]
          modified = true
        }
      }

      // $inc
      if (updateOp.$inc) {
        const docAsRecord = doc as unknown as Record<string, unknown>
        for (const [key, value] of Object.entries(updateOp.$inc)) {
          const currentVal = docAsRecord[key]
          docAsRecord[key] = Number(currentVal) + Number(value)
          modified = true
        }
      }

      // $dec
      if (updateOp.$dec) {
        const docAsRecord = doc as unknown as Record<string, unknown>
        for (const [key, value] of Object.entries(updateOp.$dec)) {
          const currentVal = docAsRecord[key]
          docAsRecord[key] = Number(currentVal) - Number(value)
          modified = true
        }
      }

      // $push
      if (updateOp.$push) {
        const docAsRecord = doc as unknown as Record<string, unknown>
        for (const [key, value] of Object.entries(updateOp.$push)) {
          const arr = docAsRecord[key]
          if (Array.isArray(arr)) {
            arr.push(value)
            modified = true
          }
        }
      }

      // $pull
      if (updateOp.$pull) {
        const docAsRecord = doc as unknown as Record<string, unknown>
        for (const [key, value] of Object.entries(updateOp.$pull)) {
          const arr = docAsRecord[key]
          if (Array.isArray(arr)) {
            const index = arr.indexOf(value)
            if (index > -1) {
              arr.splice(index, 1)
              modified = true
            }
          }
        }
      }

      // $addToSet
      if (updateOp.$addToSet) {
        const docAsRecord = doc as unknown as Record<string, unknown>
        for (const [key, value] of Object.entries(updateOp.$addToSet)) {
          const arr = docAsRecord[key]
          if (Array.isArray(arr)) {
            if (!arr.includes(value)) {
              arr.push(value)
              modified = true
            }
          }
        }
      }

      // $pop
      if (updateOp.$pop) {
        const docAsRecord = doc as unknown as Record<string, unknown>
        for (const [key, direction] of Object.entries(updateOp.$pop)) {
          const arr = docAsRecord[key]
          if (Array.isArray(arr) && arr.length > 0) {
            if (direction === 1) {
              arr.pop()
            } else {
              arr.shift()
            }
            modified = true
          }
        }
      }

      // $rename
      if (updateOp.$rename) {
        for (const [oldKey, newKey] of Object.entries(updateOp.$rename)) {
          if (oldKey in doc) {
            doc[newKey as keyof T] = doc[oldKey as keyof T]
            delete doc[oldKey as keyof T]
            modified = true
          }
        }
      }
    } else {
      // Direct field updates
      const docAsRecord = doc as Record<string, unknown>
      for (const [key, value] of Object.entries(update)) {
        docAsRecord[key] = value
        modified = true
      }
    }

    return modified
  }

  updateOne(
    query: Query<T>,
    update: Update<T>,
    options?: { upsert?: boolean }
  ): QueryBuilder<{ modifiedCount: number; upsertedCount?: number }> {
    const operation = async () => {
      return this._executeUpdateOne(query, update, options)
    }
    return new QueryBuilder(operation)
  }

  private async _executeUpdateOne(
    query: Query<T>,
    update: Update<T>,
    options?: { upsert?: boolean }
  ): Promise<{ modifiedCount: number; upsertedCount?: number }> {
    await this._ensureStorageReady()
    await this._executePreHooks('update', { query, update })

    // NEW: Use native update if available
    if (typeof (this._storage as any).updateNative === 'function') {
      try {
        const result = await (this._storage as any).updateNative(query, update)

        // Handle upsert if no docs were modified
        if (result.modifiedCount === 0 && options?.upsert) {
          const newDoc = this._buildUpsertDocument(query, update)
          await this.create(newDoc as DeepPartial<T>)
          await this._executePostHooks('update', {
            query,
            update,
            modifiedCount: 1,
            upsertedCount: 1
          })
          return { modifiedCount: 1, upsertedCount: 1 }
        }

        await this._executePostHooks('update', {
          query,
          update,
          modifiedCount: result.modifiedCount
        })
        return result
      } catch (error) {
        // If SQL update fails, fall back to JS (safety net)
        console.warn('Native update failed, falling back to JavaScript:', error)
      }
    }

    // EXISTING: JavaScript-based update logic
    // Use indexes for efficient lookup
    const candidates = await this._findDocumentsUsingIndexes(query)
    let docToUpdate = candidates[0]

    if (!docToUpdate) {
      // Handle upsert: create document if it doesn't exist
      if (options?.upsert) {
        const newDoc = this._buildUpsertDocument(query, update)
        await this.create(newDoc as DeepPartial<T>)

        await this._executePostHooks('update', {
          query,
          update,
          modifiedCount: 1,
          upsertedCount: 1
        })
        return { modifiedCount: 1, upsertedCount: 1 }
      }

      await this._executePostHooks('update', { query, update, modifiedCount: 0 })
      return { modifiedCount: 0 }
    }

    // Save old state for index update
    const oldState = { ...docToUpdate }

    // Create a deep copy to validate before modifying the original
    const docCopy = JSON.parse(JSON.stringify(docToUpdate)) as T
    const modified = this._applyUpdate(docCopy, update)

    if (modified) {
      // Apply timestamps to the copy for validation
      this._applyTimestamps(docCopy, 'update')
      // Validate the updated copy first
      await this._validateDocument(docCopy)
      // Check unique constraints (exclude the document being updated)
      this._checkUniqueConstraints(docCopy, docToUpdate)

      // If validation passes, apply the same update to the original
      this._applyUpdate(docToUpdate, update)
      this._applyTimestamps(docToUpdate, 'update')

      // Persist changes to storage
      await this._storage.update(docToUpdate, docToUpdate)

      // Efficiently update indexes for this single document
      this._updateIndexForDocument(oldState, docToUpdate)

      await this._executePostHooks('update', { query, update, modifiedCount: 1, doc: docToUpdate })
      return { modifiedCount: 1 }
    }

    await this._executePostHooks('update', { query, update, modifiedCount: 0 })
    return { modifiedCount: 0 }
  }

  updateMany(query: Query<T>, update: Update<T>): QueryBuilder<{ modifiedCount: number }> {
    const operation = async () => {
      return this._executeUpdateMany(query, update)
    }
    return new QueryBuilder(operation)
  }

  // Helper to build document for upsert
  private _buildUpsertDocument(query: Query<T>, update: Update<T>): Record<string, unknown> {
    const newDoc = {} as Record<string, unknown>

    // Apply query fields as initial values
    for (const [key, value] of Object.entries(query)) {
      if (typeof value !== 'object' || value === null || value instanceof ObjectId) {
        newDoc[key] = value
      }
    }

    // Apply the update
    this._applyUpdate(newDoc as T, update)

    return newDoc
  }

  private async _executeUpdateMany(
    query: Query<T>,
    update: Update<T>
  ): Promise<{ modifiedCount: number }> {
    await this._ensureStorageReady()
    await this._executePreHooks('update', { query, update })

    // NEW: Use native update if available
    if (typeof (this._storage as any).updateNative === 'function') {
      try {
        const result = await (this._storage as any).updateNative(query, update)
        await this._executePostHooks('update', {
          query,
          update,
          modifiedCount: result.modifiedCount
        })
        return result
      } catch (error) {
        console.warn('Native updateMany failed, falling back to JavaScript:', error)
      }
    }

    // EXISTING: JavaScript-based update logic
    // Use indexes for efficient lookup
    const docsToUpdate = await this._findDocumentsUsingIndexes(query)
    if (docsToUpdate.length === 0) {
      await this._executePostHooks('update', { query, update, modifiedCount: 0 })
      return { modifiedCount: 0 }
    }

    // Validate all updates first (atomic - fail fast)
    for (let i = 0; i < docsToUpdate.length; i++) {
      const doc = docsToUpdate[i]
      const docCopy = JSON.parse(JSON.stringify(doc)) as T
      if (this._applyUpdate(docCopy, update)) {
        this._applyTimestamps(docCopy, 'update')
        await this._validateDocument(docCopy)
        this._checkUniqueConstraints(docCopy, doc)
      }
    }

    // If all validations pass, apply updates to originals
    let modifiedCount = 0
    for (const doc of docsToUpdate) {
      if (this._applyUpdate(doc, update)) {
        this._applyTimestamps(doc, 'update')
        // Persist changes to storage
        await this._storage.update(doc, doc)
        modifiedCount++
      }
    }

    if (modifiedCount > 0) {
      await this._rebuildIndexes()
    }

    await this._executePostHooks('update', { query, update, modifiedCount, docs: docsToUpdate })
    return { modifiedCount }
  }

  // --- Count Operations ---
  async countDocuments(query: Query<T> = {}): Promise<number> {
    // NEW: Use native count if available
    if (typeof (this._storage as any).countNative === 'function') {
      return await (this._storage as any).countNative(query)
    }

    // EXISTING: Count via find
    const docs = await this.find(query)
    return docs.length
  }

  // --- Atomic Operations ---
  findOneAndUpdate(
    query: Query<T>,
    update: Update<T>,
    options: { returnDocument?: 'before' | 'after'; new?: boolean; upsert?: boolean } = {}
  ): DocumentQueryBuilder<T> {
    const operation = async (queryOptions?: QueryOptions<T>): Promise<(T & Document) | null> => {
      return this._executeFindOneAndUpdate(query, update, {
        ...options,
        lean: queryOptions?.lean,
        select: queryOptions?.select
      })
    }
    return new DocumentQueryBuilder<T>(this, operation)
  }

  private async _executeFindOneAndUpdate(
    query: Query<T>,
    update: Update<T>,
    options: {
      returnDocument?: 'before' | 'after'
      new?: boolean
      upsert?: boolean
      lean?: boolean
      select?: Partial<Record<keyof T, 0 | 1>>
    } = {}
  ): Promise<(T & Document) | null> {
    await this._ensureStorageReady()

    // Support 'new' as alias for returnDocument
    // new: true -> returnDocument: 'after'
    // new: false -> returnDocument: 'before'
    // Default (no new, no returnDocument) -> 'after'
    const returnBefore = options.new === false || options.returnDocument === 'before'
    const isLean = options.lean || false

    // Use indexes for efficient lookup
    const candidates = await this._findDocumentsUsingIndexes(query)
    let docToUpdate = candidates[0]

    if (!docToUpdate) {
      // Handle upsert: create document if it doesn't exist
      if (options.upsert) {
        const newDoc = {} as Record<string, unknown>

        // Apply query fields as initial values
        for (const [key, value] of Object.entries(query)) {
          if (typeof value !== 'object' || value === null || value instanceof ObjectId) {
            newDoc[key] = value
          }
        }

        // Apply the update
        this._applyUpdate(newDoc as T, update)

        // Create the document
        const created = await this.create(newDoc as DeepPartial<T>)
        return returnBefore ? null : created
      }

      return null
    }

    // Save old state for index update
    const oldState = { ...docToUpdate }

    if (returnBefore) {
      const original = JSON.parse(JSON.stringify(docToUpdate)) as T
      // Validate on a copy first
      const testCopy = JSON.parse(JSON.stringify(docToUpdate)) as T
      this._applyUpdate(testCopy, update)
      this._applyTimestamps(testCopy, 'update')
      await this._validateDocument(testCopy)
      this._checkUniqueConstraints(testCopy, docToUpdate)
      // If valid, apply to original
      this._applyUpdate(docToUpdate, update)
      this._applyTimestamps(docToUpdate, 'update')
      // Efficiently update indexes for this single document
      this._updateIndexForDocument(oldState, docToUpdate)
      // Apply virtuals unless lean mode
      let result: T & Document = isLean ? (original as T & Document) : this._applyVirtuals(original)
      // Apply field selection if specified
      if (options.select) {
        result = this._applyFieldSelection(result, options.select) as T & Document
      }
      return result
    }

    // Return after (default or when new: true)
    // Validate on a copy first
    const testCopy = JSON.parse(JSON.stringify(docToUpdate)) as T
    this._applyUpdate(testCopy, update)
    this._applyTimestamps(testCopy, 'update')
    await this._validateDocument(testCopy)
    this._checkUniqueConstraints(testCopy, docToUpdate)
    // If valid, apply to original
    this._applyUpdate(docToUpdate, update)
    this._applyTimestamps(docToUpdate, 'update')
    // Efficiently update indexes for this single document
    this._updateIndexForDocument(oldState, docToUpdate)
    // Apply virtuals unless lean mode
    let result: T & Document = isLean
      ? (docToUpdate as T & Document)
      : this._applyVirtuals(docToUpdate)
    // Apply field selection if specified
    if (options.select) {
      result = this._applyFieldSelection(result, options.select) as T & Document
    }
    return result
  }

  findOneAndDelete(query: Query<T>): DocumentQueryBuilder<T> {
    const operation = async (queryOptions?: QueryOptions<T>): Promise<(T & Document) | null> => {
      return this._executeFindOneAndDelete(query, {
        lean: queryOptions?.lean,
        select: queryOptions?.select
      })
    }
    return new DocumentQueryBuilder<T>(this, operation)
  }

  private async _executeFindOneAndDelete(
    query: Query<T>,
    options?: { lean?: boolean; select?: Partial<Record<keyof T, 0 | 1>> }
  ): Promise<(T & Document) | null> {
    await this._ensureStorageReady()

    // Use indexes for efficient lookup
    const candidates = await this._findDocumentsUsingIndexes(query)
    const docToDelete = candidates[0]

    if (!docToDelete) {
      return null
    }

    const original = { ...docToDelete }
    await this._storage.remove(docToDelete)
    // Efficiently update indexes for deleted document
    this._updateIndexForDocument(docToDelete, null)

    // Apply virtuals unless lean mode
    let result: T & Document = options?.lean
      ? (original as T & Document)
      : this._applyVirtuals(original)
    // Apply field selection if specified
    if (options?.select) {
      result = this._applyFieldSelection(result, options.select) as T & Document
    }
    return result
  }

  // --- Utility Operations ---
  async distinct<K extends keyof T>(field: K, query?: Query<T>): Promise<Array<T[K]>> {
    await this._ensureStorageReady()

    const docs = query ? await this.find(query) : await this._storage.getAll()
    const uniqueValues = new Set<T[K]>()

    for (const doc of docs) {
      if (doc[field] !== undefined) {
        uniqueValues.add(doc[field])
      }
    }

    return Array.from(uniqueValues)
  }

  findById(id: string | ObjectId): DocumentQueryBuilder<T> {
    return this.findOne({ _id: id } as Query<T>)
  }

  findByIdAndUpdate(
    id: string | ObjectId,
    update: Update<T>,
    options?: { returnDocument?: 'before' | 'after'; new?: boolean; upsert?: boolean }
  ): DocumentQueryBuilder<T> {
    return this.findOneAndUpdate({ _id: id } as Query<T>, update, options)
  }

  findByIdAndDelete(id: string | ObjectId): DocumentQueryBuilder<T> {
    return this.findOneAndDelete({ _id: id } as Query<T>)
  }

  async aggregate<R = Record<string, unknown>>(pipeline: unknown[]): Promise<R[]> {
    await this._ensureStorageReady()

    // NEW: Check for native aggregation support first (new interface)
    if (typeof (this._storage as any).aggregateNative === 'function') {
      try {
        return await (this._storage as any).aggregateNative(pipeline)
      } catch (error) {
        console.warn('Native aggregation failed, falling back to JavaScript:', error)
      }
    }

    // Check for legacy aggregate method (backward compatibility)
    if (typeof (this._storage as any).aggregate === 'function') {
      return await (this._storage as any).aggregate(pipeline)
    }

    // EXISTING: Fall back to JS aggregation engine
    const { AggregationEngine } = await import('./aggregation-engine.js')
    const engine = new AggregationEngine(this, this._database)
    const results = await engine.execute(pipeline as unknown as AggregationPipeline<T>)
    return results as R[]
  }

  discriminator<D extends object>(name: string, schema: Schema<D>): Model<T & D> {
    if (!this._schema) {
      throw new Error('Cannot create discriminator without base schema')
    }

    // Merge base schema fields with discriminator schema fields
    const baseFields = this._schema.getAllFieldOptions()
    const discriminatorFields = schema.getAllFieldOptions()

    // Create merged definition
    const mergedDefinition: Record<string, unknown> = {}

    // Copy base fields
    for (const [fieldName, options] of baseFields.entries()) {
      mergedDefinition[fieldName as string] = options
    }

    // Add discriminator fields
    for (const [fieldName, options] of discriminatorFields.entries()) {
      mergedDefinition[fieldName as string] = options
    }

    // Create merged schema with same options as base
    const mergedSchema = new Schema<T & D>(mergedDefinition, this._schema.getOptions())

    // Copy indexes from both schemas
    for (const fields of this._schema.getIndexes()) {
      mergedSchema.index(fields)
    }
    for (const fields of schema.getIndexes()) {
      mergedSchema.index(fields as keyof (T & D) | Array<keyof (T & D)>)
    }

    // Copy methods and statics
    Object.assign(mergedSchema.methods, this._schema.methods, schema.methods)
    Object.assign(mergedSchema.statics, this._schema.statics, schema.statics)

    // Create discriminator model that shares storage with base model
    const discriminatorModel = new Model<T & D>(
      mergedSchema,
      name,
      this._storage as StorageStrategy<T & D>,
      this._database
    )

    // Register the discriminator model in database
    if (this._database) {
      ;(this._database as any)._modelRegistry.set(name, discriminatorModel)
    }

    return discriminatorModel
  }
}
