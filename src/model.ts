import { Schema } from './schema'
import { registerModel, getModel } from './registry'
import { ObjectId } from './objectid'
import { QueryBuilder } from './query-builder'
import { DocumentQueryBuilder } from './document-query-builder'
import { FindQueryBuilder } from './find-query-builder'
import { QueryableKeys } from './type-utils'

// Symbols for internal document properties (non-enumerable)
const ORIGINAL_DOC = Symbol('originalDoc')
const MODEL_REF = Symbol('modelRef')

// Base Document type that all documents extend (like Mongoose)
export interface Document {
  _id: ObjectId // Always present on retrieved documents (auto-generated ObjectId if not provided)
  toJSON?(options?: any): any
  toObject?(options?: any): any
  save(): Promise<any>
}

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

// Index metadata structure
type IndexMetadata<T> = {
  fields: Array<keyof T>
  map: Map<string, T[]>
  unique: boolean
}

export class Model<T extends Record<string, any>> {
  private _data: T[]
  private _indexes: Map<string, IndexMetadata<T>>
  private _schema?: Schema<T>
  private _discriminatorKey?: string
  private _discriminatorValue?: string

  constructor(schema?: Schema<T>, discriminatorValue?: string) {
    this._schema = schema
    this._data = []
    this._indexes = new Map()
    this._discriminatorValue = discriminatorValue

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

  private _applyVirtuals(doc: T): T {
    if (!this._schema) return doc

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

      // Check if original document still exists in _data
      if (!model._data.includes(originalDoc)) {
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

    return withVirtuals
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
    for (const indexMeta of this._indexes.values()) {
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

  async _applyPopulate(docs: T[], fields: string[]): Promise<T[]> {
    if (!this._schema || fields.length === 0) return docs

    const populated: T[] = []

    for (const doc of docs) {
      const populatedDoc: Record<string, any> = { ...doc }

      for (const fieldName of fields) {
        const fieldOptions = this._schema.getFieldOptions(fieldName as keyof T)
        if (!fieldOptions?.ref) continue

        const refModelName = fieldOptions.ref
        const refModel = getModel(refModelName)
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
  createIndex(fields: keyof T | Array<keyof T>, options?: { unique?: boolean }): void {
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
    this._indexes.set(indexKey, {
      fields: sortedFields as Array<keyof T>,
      map,
      unique: options?.unique || false
    })
  }

  private _updateIndexes(doc: T): void {
    for (const indexMeta of this._indexes.values()) {
      const compositeKey = indexMeta.fields.map(f => String(doc[f])).join(':')
      if (!indexMeta.map.has(compositeKey)) indexMeta.map.set(compositeKey, [])
      indexMeta.map.get(compositeKey)!.push(doc)
    }
  }

  // Helper to efficiently find documents using indexes when possible
  private _findDocumentsUsingIndexes(query: Query<T>): T[] {
    const keys = Object.keys(query)
    const queryRecord = query as Record<string, any>

    // Return copy of all documents if no query (to avoid mutation during iteration)
    if (keys.length === 0) return [...this._data]

    // Check if we can use an index (all fields must be simple equality)
    const allSimpleEquality = keys.every(k => typeof queryRecord[k] !== 'object')

    if (allSimpleEquality && keys.length > 0) {
      const sortedKeys = keys.sort()
      const indexKey = sortedKeys.join(',')

      // Try exact index match first
      const exactIndex = this._indexes.get(indexKey)
      if (exactIndex) {
        const compositeKey = sortedKeys
          .map(k => String((queryRecord as Record<string, unknown>)[k]))
          .join(':')
        return exactIndex.map.get(compositeKey) || []
      }

      // Try partial index match
      for (const indexMeta of this._indexes.values()) {
        const idxFieldStrs = indexMeta.fields.map(String)

        const allIndexFieldsInQuery = idxFieldStrs.every(
          f => keys.includes(f) && typeof queryRecord[f] !== 'object'
        )

        if (allIndexFieldsInQuery) {
          const compositeKey = (indexMeta.fields as Array<string>)
            .map(field => String((queryRecord as Record<string, unknown>)[field]))
            .join(':')
          const candidates = indexMeta.map.get(compositeKey) || []
          return candidates.filter(doc => this._matches(doc, query))
        }
      }
    }

    // Fallback: linear scan
    return this._data.filter(doc => this._matches(doc, query))
  }

  // --- Query Matching ---
  private _matches(doc: T, query: Query<T>): boolean {
    return Object.entries(query).every(([key, value]) => {
      const field = doc[key as keyof T]

      // Special handling for ObjectId comparison
      const compareValues = (a: any, b: any): boolean => {
        if (a instanceof ObjectId || b instanceof ObjectId) {
          const aStr = a instanceof ObjectId ? a.toString() : String(a)
          const bStr = b instanceof ObjectId ? b.toString() : String(b)
          return aStr === bStr
        }
        return a === b
      }

      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof ObjectId)
      ) {
        return Object.entries(value).every(([op, v]) => {
          switch (op) {
            case '$eq':
              return compareValues(field, v)
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
      return compareValues(field, value)
    })
  }

  // --- Query API ---
  findOne(query: Query<T>, options?: QueryOptions<T>): DocumentQueryBuilder<T> {
    const operation = async (): Promise<T | null> => {
      await this._executePreHooks('findOne', { query })

      const keys = Object.keys(query)
      const queryRecord = query as Record<string, any>

      // Check if we can use an index (all fields must be simple equality)
      const allSimpleEquality = keys.every(k => typeof queryRecord[k] !== 'object')

      let doc: T | null = null

      if (allSimpleEquality && keys.length > 0) {
        const sortedKeys = keys.sort()
        const indexKey = sortedKeys.join(',')

        // Try exact index match first
        const exactIndex = this._indexes.get(indexKey)
        if (exactIndex) {
          const compositeKey = sortedKeys
            .map(k => String((queryRecord as Record<string, unknown>)[k]))
            .join(':')
          const indexedDocs = exactIndex.map.get(compositeKey) || []
          doc = indexedDocs.length ? indexedDocs[0] : null
        } else {
          // Try partial index match - find an index that's a subset of the query
          for (const indexMeta of this._indexes.values()) {
            const idxFieldStrs = indexMeta.fields.map(String)

            // Check if all index fields are in the query (with simple equality)
            const allIndexFieldsInQuery = idxFieldStrs.every(
              f =>
                keys.includes(f) && typeof (queryRecord as Record<string, unknown>)[f] !== 'object'
            )

            if (allIndexFieldsInQuery) {
              // Use this partial index
              const compositeKey = (indexMeta.fields as Array<string>)
                .map(field => String((queryRecord as Record<string, unknown>)[field]))
                .join(':')
              const candidates = indexMeta.map.get(compositeKey) || []

              // Filter candidates with remaining query conditions
              doc = candidates.find(doc => this._matches(doc, query)) || null
              break
            }
          }
        }
      }

      // fallback: linear scan if not found via index
      if (doc === null) {
        doc = this._data.find(doc => this._matches(doc, query)) || null
      }

      // Return raw doc - builder will apply virtuals if needed
      await this._executePostHooks('findOne', { query, result: doc })
      return doc
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

  async _executeFindWithOptions(query: Query<T>, options: QueryOptions<T> = {}): Promise<T[]> {
    await this._executePreHooks('find', { query })

    // Add discriminator filter if this is a discriminator model
    if (this._discriminatorKey && this._discriminatorValue) {
      query = { ...query, [this._discriminatorKey]: this._discriminatorValue } as Query<T>
    }

    const keys = Object.keys(query)
    const queryRecord = query as Record<string, any>

    // Get base results
    let results: T[] = []

    // Return all documents if no query
    if (keys.length === 0) {
      results = [...this._data]
    } else {
      // Check if we can use an index (all fields must be simple equality)
      const allSimpleEquality = keys.every(k => typeof queryRecord[k] !== 'object')

      if (allSimpleEquality) {
        // Use the optimized helper method
        results = this._findDocumentsUsingIndexes(query)
      } else {
        results = this._data.filter(doc => this._matches(doc, query))
      }
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
    let finalResults = options.lean ? results : results.map(doc => this._applyVirtuals(doc))

    // Apply field selection if specified
    if (options.select) {
      finalResults = finalResults.map(doc => this._applyFieldSelection(doc, options.select) as T)
    }

    await this._executePostHooks('find', { query, results: finalResults })
    return finalResults
  }

  async create(doc: DeepPartial<T>): Promise<T> {
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
    this._data.push(fullDoc)
    this._updateIndexes(fullDoc)

    await this._executePostHooks('save', { doc: fullDoc })
    return this._applyVirtuals(fullDoc)
  }

  async insertMany(docs: DeepPartial<T>[]): Promise<T[]> {
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
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      // Check against existing documents
      this._checkUniqueConstraints(doc as T)

      // Check against other documents in this batch
      for (const indexMeta of this._indexes.values()) {
        if (!indexMeta.unique) continue

        const docAsRecord = doc as Record<string, any>
        const compositeKey = indexMeta.fields.map(f => String(docAsRecord[f as string])).join(':')

        // Check if any previous doc in batch has the same key
        for (let j = 0; j < i; j++) {
          const prevDoc = docs[j]
          const prevDocAsRecord = prevDoc as Record<string, any>
          const prevKey = indexMeta.fields.map(f => String(prevDocAsRecord[f as string])).join(':')
          if (compositeKey === prevKey) {
            const fieldNames = indexMeta.fields.join(', ')
            throw new Error(`E11000 duplicate key error: ${fieldNames} must be unique`)
          }
        }
      }
    }

    // If all validations pass, proceed with insertion
    const fullDocs = docs as T[]
    for (const doc of fullDocs) {
      await this._executePreHooks('save', { doc })
      this._data.push(doc)
      this._updateIndexes(doc)
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
    await this._executePreHooks('delete', { query })

    // Use indexes for efficient lookup
    const candidates = this._findDocumentsUsingIndexes(query)
    const docToDelete = candidates[0]

    if (!docToDelete) {
      await this._executePostHooks('delete', { query, deletedCount: 0 })
      return { deletedCount: 0 }
    }

    const index = this._data.indexOf(docToDelete)
    if (index > -1) {
      this._data.splice(index, 1)
      // Efficiently update indexes for deleted document
      this._updateIndexForDocument(docToDelete, null)
      await this._executePostHooks('delete', { query, deletedCount: 1, doc: docToDelete })
      return { deletedCount: 1 }
    }

    await this._executePostHooks('delete', { query, deletedCount: 0 })
    return { deletedCount: 0 }
  }

  deleteMany(query: Query<T>): QueryBuilder<{ deletedCount: number }> {
    const operation = async () => {
      return this._executeDeleteMany(query)
    }
    return new QueryBuilder(operation)
  }

  private async _executeDeleteMany(query: Query<T>): Promise<{ deletedCount: number }> {
    await this._executePreHooks('delete', { query })

    // Use indexes for efficient lookup
    const docsToDelete = this._findDocumentsUsingIndexes(query)
    if (docsToDelete.length === 0) {
      await this._executePostHooks('delete', { query, deletedCount: 0 })
      return { deletedCount: 0 }
    }

    for (const doc of docsToDelete) {
      const index = this._data.indexOf(doc)
      if (index > -1) {
        this._data.splice(index, 1)
      }
    }

    this._rebuildIndexes()
    await this._executePostHooks('delete', {
      query,
      deletedCount: docsToDelete.length,
      docs: docsToDelete
    })
    return { deletedCount: docsToDelete.length }
  }

  private _rebuildIndexes(): void {
    // Rebuild all indexes from scratch
    for (const indexMeta of this._indexes.values()) {
      indexMeta.map.clear()

      for (const doc of this._data) {
        const compositeKey = indexMeta.fields.map(f => String(doc[f])).join(':')
        if (!indexMeta.map.has(compositeKey)) indexMeta.map.set(compositeKey, [])
        indexMeta.map.get(compositeKey)!.push(doc)
      }
    }
  }

  private _updateIndexForDocument(oldDoc: T | null, newDoc: T | null): void {
    // Efficiently update indexes for a single document change
    // oldDoc: document before change (or null if adding)
    // newDoc: document after change (or null if deleting)

    for (const indexMeta of this._indexes.values()) {
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
    await this._executePreHooks('update', { query, update })

    // Use indexes for efficient lookup
    const candidates = this._findDocumentsUsingIndexes(query)
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
    await this._executePreHooks('update', { query, update })

    // Use indexes for efficient lookup
    const docsToUpdate = this._findDocumentsUsingIndexes(query)
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
        modifiedCount++
      }
    }

    if (modifiedCount > 0) {
      this._rebuildIndexes()
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
    const operation = async () => {
      return this._executeFindOneAndUpdate(query, update, options)
    }
    return new DocumentQueryBuilder<T>(this, operation)
  }

  private async _executeFindOneAndUpdate(
    query: Query<T>,
    update: Update<T>,
    options: { returnDocument?: 'before' | 'after'; new?: boolean; upsert?: boolean } = {}
  ): Promise<T | null> {
    // Support 'new' as alias for returnDocument
    // new: true -> returnDocument: 'after'
    // new: false -> returnDocument: 'before'
    // Default (no new, no returnDocument) -> 'after'
    const returnBefore = options.new === false || options.returnDocument === 'before'

    // Use indexes for efficient lookup
    const candidates = this._findDocumentsUsingIndexes(query)
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
      return original // Return raw doc - builder will apply virtuals
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
    return docToUpdate // Return raw doc - builder will apply virtuals
  }

  findOneAndDelete(query: Query<T>): DocumentQueryBuilder<T> {
    const operation = async () => {
      return this._executeFindOneAndDelete(query)
    }
    return new DocumentQueryBuilder<T>(this, operation)
  }

  private async _executeFindOneAndDelete(query: Query<T>): Promise<T | null> {
    // Use indexes for efficient lookup
    const candidates = this._findDocumentsUsingIndexes(query)
    const docToDelete = candidates[0]

    if (!docToDelete) {
      return null
    }

    const original = { ...docToDelete }
    const index = this._data.indexOf(docToDelete)
    if (index > -1) {
      this._data.splice(index, 1)
      // Efficiently update indexes for deleted document
      this._updateIndexForDocument(docToDelete, null)
    }

    return original // Return raw doc - builder will apply virtuals
  }

  // --- Utility Operations ---
  async distinct<K extends keyof T>(field: K, query?: Query<T>): Promise<Array<T[K]>> {
    const docs = query ? await this.find(query) : this._data
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

    // Create discriminator model that shares data with base model
    const discriminatorModel = new Model<T & D>(mergedSchema, name)
    discriminatorModel._data = this._data as (T & D)[]
    discriminatorModel._indexes = this._indexes as Map<string, IndexMetadata<T & D>>

    // Register the discriminator model
    registerModel(name, discriminatorModel)

    return discriminatorModel
  }
}

// Factory function for creating models (mongoose-style)
export function model<T extends Record<string, any>>(name: string, schema: Schema<T>): Model<T> {
  const modelInstance = new Model<T>(schema)
  registerModel(name, modelInstance)
  return modelInstance
}
