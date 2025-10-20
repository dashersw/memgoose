import { Schema } from './schema'
import { ObjectId } from './objectid'
import { QueryBuilder } from './query-builder'
import { DocumentQueryBuilder } from './document-query-builder'
import { FindQueryBuilder } from './find-query-builder'
import { QueryableKeys } from './type-utils'
import { StorageStrategy, MemoryStorageStrategy } from './storage'
import type { Document } from './document'

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
export type QueryOperator<T = any> = {
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
  $elemMatch?: Record<string, any>
  $all?: T extends any[] ? T : never
}

// Query can be a simple value or an operator object
export type QueryValue<T = any> = T | QueryOperator<T>

// Query object with field names as keys
export type Query<T extends Record<string, any> = Record<string, any>> = {
  [K in QueryableKeys<T>]?: QueryValue<T[K]>
}

// Update operators
export type UpdateOperator<T = any> = {
  $set?: Partial<T>
  $unset?: Partial<Record<keyof T, any>>
  $inc?: Partial<Record<keyof T, number>>
  $dec?: Partial<Record<keyof T, number>>
  $push?: Partial<Record<keyof T, any>>
  $pull?: Partial<Record<keyof T, any>>
  $addToSet?: Partial<Record<keyof T, any>>
  $pop?: Partial<Record<keyof T, 1 | -1>>
  $rename?: Partial<Record<keyof T, string>>
}

// Update can be direct field updates or operator-based
export type Update<T extends Record<string, any> = Record<string, any>> =
  | Partial<T>
  | UpdateOperator<T>

// Query options
export type QueryOptions<T = any> = {
  sort?: Partial<Record<keyof T, 1 | -1>>
  limit?: number
  skip?: number
  select?: Partial<Record<keyof T, 0 | 1>>
  lean?: boolean
}

export class Model<T extends Record<string, any>> {
  private _storage: StorageStrategy<T>
  private _schema?: Schema<T>
  private _discriminatorKey?: string
  private _discriminatorValue?: string
  private _database?: any // Database reference for getModel
  private _storageInitPromise: Promise<void> | null = null

  constructor(
    schema?: Schema<T>,
    discriminatorValue?: string,
    storage?: StorageStrategy<T>,
    database?: any
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
      const modelWithStatics = this as Record<string, any>
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
    let withVirtuals: any = { ...doc }

    // Apply field getters first
    withVirtuals = this._schema.applyGetters(withVirtuals)

    // Apply virtuals if any
    if (virtuals.size > 0) {
      for (const [name, virtual] of virtuals.entries()) {
        const value = virtual.applyGetter(doc)
        if (value !== undefined) {
          withVirtuals[name] = value
        }
      }
    }

    // Add instance methods from schema
    if (this._schema) {
      for (const [methodName, methodFn] of Object.entries(this._schema.methods)) {
        withVirtuals[methodName] = methodFn.bind(withVirtuals)
      }
    }

    // Store reference to original document and model for save functionality using Symbols
    // This makes them non-enumerable and won't show up in iteration
    withVirtuals[ORIGINAL_DOC] = doc
    withVirtuals[MODEL_REF] = this

    // Add save method
    withVirtuals.save = async () => {
      const originalDoc = withVirtuals[ORIGINAL_DOC]
      const model = withVirtuals[MODEL_REF]

      await model._ensureStorageReady()

      // Check if original document still exists in storage (by _id or reference)
      const allDocs = await model._storage.getAll()
      const docExists = allDocs.some(
        (d: T) =>
          d === originalDoc ||
          (d._id && originalDoc._id && d._id.toString() === originalDoc._id.toString())
      )
      if (!docExists) {
        throw new Error('Document has been deleted and cannot be saved')
      }

      // Get list of virtual property names to exclude from saving
      const virtualNames = new Set(model._schema?.getVirtuals().keys())

      // Create a test copy to validate before modifying the original
      const testCopy = JSON.parse(JSON.stringify(originalDoc)) as T

      // Copy modified fields to test copy (skip virtuals and methods)
      for (const key in withVirtuals) {
        if (
          typeof withVirtuals[key] === 'function' || // Skip methods
          virtualNames.has(key) // Skip virtuals
        ) {
          continue
        }

        // Copy the value to the test copy
        testCopy[key as keyof T] = withVirtuals[key]
      }

      // Remove fields that were deleted from the document
      for (const key in testCopy) {
        if (!virtualNames.has(key) && !(key in withVirtuals)) {
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
    withVirtuals.toJSON = (options?: {
      virtuals?: boolean
      getters?: boolean
      transform?: (doc: any) => any
    }) => {
      return this._serializeDocument(withVirtuals, options || {})
    }

    withVirtuals.toObject = (options?: {
      virtuals?: boolean
      getters?: boolean
      transform?: (doc: any) => any
    }) => {
      return this._serializeDocument(withVirtuals, options || {})
    }

    return withVirtuals as T & Document
  }

  private _serializeDocument(
    doc: any,
    options: { virtuals?: boolean; getters?: boolean; transform?: (doc: any) => any }
  ): any {
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
    if (isInclusion && isExclusion) {
      throw new Error('Cannot mix inclusion and exclusion in field selection')
    }

    const result: any = {}

    if (isInclusion) {
      // Include only specified fields
      for (const field of fields) {
        if (select[field] === 1 && field in doc) {
          result[field] = doc[field]
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

    return result
  }

  private async _executePreHooks(event: string, context: any): Promise<void> {
    if (!this._schema) return

    const hooks = this._schema.getPreHooks(event)
    for (const hook of hooks) {
      await hook(context)
    }
  }

  private async _executePostHooks(event: string, context: any): Promise<void> {
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
    const docWithTimestamps = doc as Record<string, any>

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

  async _applyPopulate(docs: T[], fields: string[]): Promise<T[]> {
    if (!this._schema || fields.length === 0) return docs

    const populated: T[] = []

    for (const doc of docs) {
      const populatedDoc: Record<string, any> = { ...doc }

      for (const fieldName of fields) {
        const fieldOptions = this._schema.getFieldOptions(fieldName as keyof T)
        if (!fieldOptions?.ref) continue

        const refModelName = fieldOptions.ref
        // Get model from database registry
        const refModel = this._database?.getModel(refModelName)
        if (!refModel) continue

        const docAsRecord = doc as Record<string, any>
        const refId = docAsRecord[fieldName]
        if (refId !== undefined && refId !== null) {
          // Fetch the referenced document
          const refDoc = await refModel.findById(refId)
          if (refDoc) {
            populatedDoc[fieldName] = refDoc
          }
        }
      }

      populated.push(populatedDoc as T)
    }

    return populated
  }

  // --- Indexing ---
  async createIndex(
    fields: keyof T | Array<keyof T>,
    options?: { unique?: boolean }
  ): Promise<void> {
    // Delegate to storage strategy
    await this._storage.createIndex(fields, options)
  }

  // Helper to efficiently find documents using indexes when possible
  private async _findDocumentsUsingIndexes(query: Query<T>): Promise<T[]> {
    const keys = Object.keys(query)
    const queryRecord = query as Record<string, any>

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
      return this._storage.findDocuments(matcher, indexHint)
    }

    // No index hint - storage will use efficient linear scan
    return this._storage.findDocuments(matcher)
  }

  // --- Query Matching ---
  // Helper for ObjectId comparison (defined once, not per document)
  private _compareValues(a: any, b: any): boolean {
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
    return Object.entries(query).every(([key, value]) => {
      const field = doc[key as keyof T]

      // Fast path: simple equality for non-object values (most common case)
      if (typeof value !== 'object' || value === null) {
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
        !(value instanceof ObjectId)
      ) {
        return Object.entries(value).every(([op, v]) => {
          switch (op) {
            case '$eq':
              return this._compareValues(field, v)
            case '$ne':
              return field !== v
            case '$in':
              return Array.isArray(v) && v.includes(field)
            case '$nin':
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
            case '$elemMatch':
              if (!Array.isArray(field)) return false
              return field.some((item: any) => {
                if (typeof item !== 'object' || item === null) return false
                return Object.entries(v as Record<string, any>).every(([subKey, subValue]) => {
                  const subField = item[subKey]
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

    // Apply options
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
      const docWithDiscriminator = doc as Record<string, any>
      docWithDiscriminator[this._discriminatorKey] = this._discriminatorValue
    }

    this._ensureId(doc)
    this._applyDefaults(doc)
    this._applyTimestamps(doc, 'create')
    await this._validateDocument(doc as T)
    this._checkUniqueConstraints(doc as T)
    await this._executePreHooks('save', { doc })

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
        const docWithDiscriminator = doc as Record<string, any>
        docWithDiscriminator[this._discriminatorKey] = this._discriminatorValue
      }

      this._ensureId(doc)
      this._applyDefaults(doc)
      this._applyTimestamps(doc, 'create')
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
        const docAsRecord = doc as Record<string, any>
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
        const docAsRecord = doc as Record<string, any>
        for (const [key, value] of Object.entries(updateOp.$inc)) {
          const currentVal = docAsRecord[key]
          docAsRecord[key] = Number(currentVal) + Number(value)
          modified = true
        }
      }

      // $dec
      if (updateOp.$dec) {
        const docAsRecord = doc as Record<string, any>
        for (const [key, value] of Object.entries(updateOp.$dec)) {
          const currentVal = docAsRecord[key]
          docAsRecord[key] = Number(currentVal) - Number(value)
          modified = true
        }
      }

      // $push
      if (updateOp.$push) {
        const docAsRecord = doc as Record<string, any>
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
        const docAsRecord = doc as Record<string, any>
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
        const docAsRecord = doc as Record<string, any>
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
        const docAsRecord = doc as Record<string, any>
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
      const docAsRecord = doc as Record<string, any>
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

    // Use indexes for efficient lookup
    const candidates = await this._findDocumentsUsingIndexes(query)
    let docToUpdate = candidates[0]

    if (!docToUpdate) {
      // Handle upsert: create document if it doesn't exist
      if (options?.upsert) {
        const newDoc: any = {}

        // Apply query fields as initial values
        for (const [key, value] of Object.entries(query)) {
          if (typeof value !== 'object' || value === null || value instanceof ObjectId) {
            newDoc[key] = value
          }
        }

        // Apply the update
        this._applyUpdate(newDoc, update)

        // Create the document
        await this.create(newDoc)

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

  private async _executeUpdateMany(
    query: Query<T>,
    update: Update<T>
  ): Promise<{ modifiedCount: number }> {
    await this._ensureStorageReady()
    await this._executePreHooks('update', { query, update })

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
    // Can optimize using indexes for simple queries
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
        const newDoc: any = {}

        // Apply query fields as initial values
        for (const [key, value] of Object.entries(query)) {
          if (typeof value !== 'object' || value === null || value instanceof ObjectId) {
            newDoc[key] = value
          }
        }

        // Apply the update
        this._applyUpdate(newDoc, update)

        // Create the document
        const created = await this.create(newDoc)
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

  findById(id: any): DocumentQueryBuilder<T> {
    return this.findOne({ _id: id } as Query<T>)
  }

  findByIdAndUpdate(
    id: any,
    update: Update<T>,
    options?: { returnDocument?: 'before' | 'after'; new?: boolean; upsert?: boolean }
  ): DocumentQueryBuilder<T> {
    return this.findOneAndUpdate({ _id: id } as Query<T>, update, options)
  }

  findByIdAndDelete(id: any): DocumentQueryBuilder<T> {
    return this.findOneAndDelete({ _id: id } as Query<T>)
  }

  discriminator<D extends Record<string, any>>(name: string, schema: Schema<D>): Model<T & D> {
    if (!this._schema) {
      throw new Error('Cannot create discriminator without base schema')
    }

    // Merge base schema fields with discriminator schema fields
    const baseFields = this._schema.getAllFieldOptions()
    const discriminatorFields = schema.getAllFieldOptions()

    // Create merged definition
    const mergedDefinition: Record<string, any> = {}

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
