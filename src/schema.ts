// Virtual type for getter/setter virtuals
export class VirtualType<T = unknown> {
  private _getter?: ((this: any) => T) | ((doc: any) => T)
  private _setter?: ((this: any, value: T) => void) | ((doc: any, value: T) => void)

  get(fn: ((this: any) => T) | ((doc: any) => T)): this {
    this._getter = fn
    return this
  }

  set(fn: ((this: any, value: T) => void) | ((doc: any, value: T) => void)): this {
    this._setter = fn
    return this
  }

  applyGetter(doc: any): T | undefined {
    if (!this._getter) return undefined
    // Support both syntaxes: function(doc) and function(this)
    // If function has 1 parameter, pass doc; otherwise use call(doc)
    const getter = this._getter as (doc: any) => T
    return getter.length === 1 ? getter(doc) : getter.call(doc, doc)
  }

  applySetter(doc: any, value: T): void {
    if (!this._setter) return
    // Support both syntaxes: function(doc, value) and function(this, value)
    // When using .call(), the first arg is the 'this' context, second is the value
    const setter = this._setter as any
    if (setter.length === 2) {
      // Two-parameter function: (doc, value) => void
      setter(doc, value)
    } else {
      // Single-parameter function with 'this' context: function(value) or (this: any, value: T) => void
      setter.call(doc, value)
    }
  }

  hasSetter(): boolean {
    return !!this._setter
  }
}

// Hook context types for different events
export type SaveHookContext<T> = { doc: T }

// Pre-delete context
export type PreDeleteHookContext<T = Record<string, unknown>> = {
  query: Record<string, unknown>
  _?: T // Phantom to avoid unused warning
}

// Post-delete context (has results)
export type PostDeleteHookContext<T> = {
  query: Record<string, unknown>
  deletedCount: number
  docs?: T[]
}

export type DeleteHookContext<T> = PreDeleteHookContext<T> | PostDeleteHookContext<T>

// Pre-update context
export type PreUpdateHookContext<T> = {
  query: Record<string, unknown>
  update?: Record<string, unknown>
  doc?: T
}

// Post-update context (has results)
export type PostUpdateHookContext<T> = {
  query: Record<string, unknown>
  update?: Record<string, unknown>
  modifiedCount: number
  docs?: T[]
}

export type UpdateHookContext<T> = PreUpdateHookContext<T> | PostUpdateHookContext<T>

// Pre-find context
export type PreFindHookContext<T = Record<string, unknown>> = {
  query: Record<string, unknown>
  _?: T // Phantom to avoid unused warning
}

// Post-find context (has results)
export type PostFindHookContext<T> = {
  query: Record<string, unknown>
  result?: T | null
  results?: T[]
}

export type FindHookContext<T> = PreFindHookContext<T> | PostFindHookContext<T>

// Generic hook function
export type HookFunction = (context: Record<string, unknown>) => void | Promise<void>

// Validation types
export type ValidatorFunction = (value: unknown) => boolean | Promise<boolean>

export type FieldOptions = {
  type?: any
  required?: boolean | [boolean, string] // true or [true, 'Custom error message']
  default?: any | (() => any)
  min?: number | [number, string] // For numbers and dates
  max?: number | [number, string]
  minLength?: number | [number, string] // For strings and arrays
  maxLength?: number | [number, string]
  enum?: any[] | { values: any[]; message?: string }
  match?: RegExp | [RegExp, string] // For strings
  validate?: ValidatorFunction | { validator: ValidatorFunction; message?: string }
  ref?: string // For populate support
  get?: (value: any) => any // Getter function
  set?: (value: any) => any // Setter function
  unique?: boolean // For unique indexes
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// Schema options
export type SchemaOptions = {
  timestamps?: boolean | { createdAt?: string | boolean; updatedAt?: string | boolean }
  discriminatorKey?: string
}

// Schema definition (simplified - just for type info and indexes)
export class Schema<T extends object = Record<string, unknown>> {
  private _definition: Record<string, unknown>
  private _fieldOptions: Map<keyof T, FieldOptions>
  private _indexes: Array<Array<keyof T>>
  private _uniqueIndexes?: Set<string>
  private _ttlIndexes: Map<string, number> // field -> ttl in seconds
  private _virtuals: Map<string, VirtualType>
  private _preHooks: Map<string, HookFunction[]>
  private _postHooks: Map<string, HookFunction[]>
  private _options: SchemaOptions
  // Methods and statics need `any` for maximum flexibility with different `this` types
  public methods: Record<string, (this: any, ...args: any[]) => any>
  public statics: Record<string, (...args: any[]) => any>

  constructor(definition: Record<string, unknown>, options: SchemaOptions = {}) {
    this._definition = definition
    this._fieldOptions = new Map()
    this._indexes = []
    this._ttlIndexes = new Map()
    this._virtuals = new Map()
    this._preHooks = new Map()
    this._postHooks = new Map()
    this._options = options
    this.methods = {}
    this.statics = {}

    // Parse field definitions to extract options
    this._parseFieldDefinitions(definition)
  }

  private _parseFieldDefinitions(definition: Record<string, unknown>): void {
    for (const [fieldName, fieldDef] of Object.entries(definition)) {
      if (fieldDef instanceof Schema) {
        // Nested schema (subdocument)
        this._fieldOptions.set(fieldName as keyof T, { type: fieldDef })
      } else if (
        fieldDef &&
        typeof fieldDef === 'object' &&
        !Array.isArray(fieldDef) &&
        fieldDef.constructor === Object
      ) {
        // Check if it's a nested schema in detailed syntax
        const fieldDefObj = fieldDef as Record<string, unknown>
        if (fieldDefObj.type instanceof Schema) {
          this._fieldOptions.set(fieldName as keyof T, fieldDef as FieldOptions)
        } else {
          // Detailed syntax: { type: String, required: true, ... }
          this._fieldOptions.set(fieldName as keyof T, fieldDef as FieldOptions)

          // Auto-create index if unique: true is specified
          if (fieldDefObj.unique === true) {
            this.index(fieldName as keyof T, { unique: true })
          }
        }
      } else {
        // Simple syntax: String or Number
        this._fieldOptions.set(fieldName as keyof T, { type: fieldDef })
      }
    }
  }

  index(
    fields: keyof T | Array<keyof T> | Record<string, 1 | -1>,
    options?: { unique?: boolean; ttl?: number }
  ): this {
    // Normalize to array - single field becomes array with one element
    let normalizedFields: Array<keyof T>

    if (Array.isArray(fields)) {
      normalizedFields = fields
    } else if (typeof fields === 'object' && fields !== null) {
      // Handle Mongoose-style object format: { author: 1, year: -1 }
      normalizedFields = Object.keys(fields) as Array<keyof T>
    } else {
      normalizedFields = [fields as keyof T]
    }

    this._indexes.push(normalizedFields)

    // Track unique constraint
    if (options?.unique) {
      const indexKey = normalizedFields.join(',')
      if (!this._uniqueIndexes) {
        this._uniqueIndexes = new Set()
      }
      this._uniqueIndexes.add(indexKey)
    }

    // Track TTL index (only for single-field indexes)
    if (options?.ttl !== undefined && normalizedFields.length === 1) {
      const field = String(normalizedFields[0])
      this._ttlIndexes.set(field, options.ttl)
    }

    return this
  }

  virtual(name: string): VirtualType {
    const virtualType = new VirtualType()
    this._virtuals.set(name, virtualType)
    return virtualType
  }

  getIndexes(): Array<Array<keyof T>> {
    return this._indexes
  }

  getUniqueIndexes(): Set<string> {
    return this._uniqueIndexes || new Set()
  }

  getTTLIndexes(): Map<string, number> {
    return this._ttlIndexes
  }

  getVirtuals(): Map<string, VirtualType> {
    return this._virtuals
  }

  pre(event: 'save', fn: (context: SaveHookContext<T>) => void | Promise<void>): this
  pre(event: 'delete', fn: (context: PreDeleteHookContext<T>) => void | Promise<void>): this
  pre(event: 'update', fn: (context: PreUpdateHookContext<T>) => void | Promise<void>): this
  pre(event: 'find' | 'findOne', fn: (context: PreFindHookContext<T>) => void | Promise<void>): this
  pre(event: string, fn: any): this {
    if (!this._preHooks.has(event)) {
      this._preHooks.set(event, [])
    }
    this._preHooks.get(event)!.push(fn)
    return this
  }

  post(event: 'save', fn: (context: SaveHookContext<T>) => void | Promise<void>): this
  post(event: 'delete', fn: (context: PostDeleteHookContext<T>) => void | Promise<void>): this
  post(event: 'update', fn: (context: PostUpdateHookContext<T>) => void | Promise<void>): this
  post(
    event: 'find' | 'findOne',
    fn: (context: PostFindHookContext<T>) => void | Promise<void>
  ): this
  post(event: string, fn: any): this {
    if (!this._postHooks.has(event)) {
      this._postHooks.set(event, [])
    }
    this._postHooks.get(event)!.push(fn)
    return this
  }

  getPreHooks(event: string): HookFunction[] {
    return this._preHooks.get(event) || []
  }

  getPostHooks(event: string): HookFunction[] {
    return this._postHooks.get(event) || []
  }

  getFieldOptions(fieldName: keyof T): FieldOptions | undefined {
    return this._fieldOptions.get(fieldName)
  }

  getAllFieldOptions(): Map<keyof T, FieldOptions> {
    return this._fieldOptions
  }

  applyGetters(doc: any): any {
    const result = { ...doc }
    for (const [fieldName, options] of this._fieldOptions.entries()) {
      if (result[fieldName] === undefined) continue

      // Apply getters for nested schemas
      if (options.type instanceof Schema) {
        if (Array.isArray(result[fieldName])) {
          result[fieldName] = result[fieldName].map((subDoc: any) =>
            options.type.applyGetters(subDoc)
          )
        } else if (typeof result[fieldName] === 'object') {
          result[fieldName] = options.type.applyGetters(result[fieldName])
        }
      } else if (options.get) {
        result[fieldName] = options.get(result[fieldName])
      }
    }
    return result
  }

  applySetters(doc: any): void {
    for (const [fieldName, options] of this._fieldOptions.entries()) {
      if (doc[fieldName] === undefined) continue

      // Apply setters for nested schemas
      if (options.type instanceof Schema) {
        if (Array.isArray(doc[fieldName])) {
          doc[fieldName].forEach((subDoc: any) => options.type.applySetters(subDoc))
        } else if (typeof doc[fieldName] === 'object') {
          options.type.applySetters(doc[fieldName])
        }
      } else if (options.set) {
        doc[fieldName] = options.set(doc[fieldName])
      }
    }
  }

  applyDefaults(doc: any): void {
    for (const [fieldName, options] of this._fieldOptions.entries()) {
      // Apply default if field is undefined
      if (doc[fieldName] === undefined && options.default !== undefined) {
        const defaultValue =
          typeof options.default === 'function' ? options.default() : options.default
        doc[fieldName] = defaultValue
      }

      // Apply defaults for nested schemas
      if (doc[fieldName] !== undefined && options.type instanceof Schema) {
        if (Array.isArray(doc[fieldName])) {
          doc[fieldName].forEach((subDoc: any) => options.type.applyDefaults(subDoc))
        } else if (typeof doc[fieldName] === 'object') {
          options.type.applyDefaults(doc[fieldName])
        }
      }
    }
  }

  getOptions(): SchemaOptions {
    return this._options
  }

  getTimestampConfig(): { createdAt: string; updatedAt: string } | null {
    if (!this._options.timestamps) return null

    if (this._options.timestamps === true) {
      return { createdAt: 'createdAt', updatedAt: 'updatedAt' }
    }

    // Custom field names
    const createdAt =
      this._options.timestamps.createdAt === false
        ? null
        : typeof this._options.timestamps.createdAt === 'string'
          ? this._options.timestamps.createdAt
          : 'createdAt'

    const updatedAt =
      this._options.timestamps.updatedAt === false
        ? null
        : typeof this._options.timestamps.updatedAt === 'string'
          ? this._options.timestamps.updatedAt
          : 'updatedAt'

    if (!createdAt && !updatedAt) return null

    return {
      createdAt: createdAt || '',
      updatedAt: updatedAt || ''
    }
  }

  /**
   * Load methods, statics, and virtuals from a class into the schema.
   * Instance methods (non-static methods) are added to schema.methods
   * Static methods are added to schema.statics
   * Getters and setters are added as virtuals
   *
   * @param classConstructor - The class to load methods from
   * @returns this for chaining
   */
  loadClass(classConstructor: new (...args: any[]) => any): this {
    const prototype = classConstructor.prototype

    // Walk up the prototype chain to include inherited methods and getters/setters
    const prototypeChain: any[] = []
    let currentProto = prototype
    while (currentProto && currentProto !== Object.prototype) {
      prototypeChain.push(currentProto)
      currentProto = Object.getPrototypeOf(currentProto)
    }

    // Process each prototype in the chain (child first, then parents)
    // Only add methods/getters/setters if they don't already exist (child takes precedence)
    const processedVirtuals = new Set<string>()
    const processedMethods = new Set<string>()

    for (const proto of prototypeChain) {
      const descriptors = Object.getOwnPropertyDescriptors(proto)

      for (const [name, descriptor] of Object.entries(descriptors)) {
        if (name === 'constructor') continue

        // Handle getters/setters as virtuals (child takes precedence)
        if (descriptor.get || descriptor.set) {
          if (!processedVirtuals.has(name)) {
            processedVirtuals.add(name)
            const virtual = this.virtual(name)
            if (descriptor.get) {
              virtual.get(descriptor.get)
            }
            if (descriptor.set) {
              virtual.set(descriptor.set)
            }
          }
          continue
        }

        // Handle regular methods (child takes precedence)
        if (typeof descriptor.value === 'function') {
          if (!processedMethods.has(name)) {
            processedMethods.add(name)
            this.methods[name] = descriptor.value
          }
        }
      }
    }

    // Get static methods from the class itself
    const staticMethodNames = Object.getOwnPropertyNames(classConstructor).filter(
      name =>
        name !== 'length' &&
        name !== 'name' &&
        name !== 'prototype' &&
        typeof (classConstructor as any)[name] === 'function'
    )

    for (const methodName of staticMethodNames) {
      this.statics[methodName] = (classConstructor as any)[methodName]
    }

    return this
  }

  async validate(doc: Partial<T>): Promise<void> {
    const errors: string[] = []

    for (const [fieldName, options] of this._fieldOptions.entries()) {
      const value = doc[fieldName]
      const fieldStr = String(fieldName)

      // Required validation
      if (options.required) {
        const [isRequired, errorMsg] = Array.isArray(options.required)
          ? options.required
          : [options.required, `${fieldStr} is required`]

        if (isRequired && (value === undefined || value === null)) {
          errors.push(errorMsg)
          continue
        }
      }

      // Skip further validation if value is undefined/null
      if (value === undefined || value === null) continue

      // Validate nested schema (subdocument)
      if (options.type instanceof Schema) {
        try {
          if (Array.isArray(value)) {
            // Array of subdocuments
            for (const subDoc of value as Partial<any>[]) {
              await options.type.validate(subDoc)
            }
          } else if (typeof value === 'object') {
            // Single subdocument
            await options.type.validate(value)
          }
        } catch (err: any) {
          errors.push(`${fieldStr}: ${err.message}`)
        }
        continue
      }

      // Min validation (numbers and dates)
      if (options.min !== undefined) {
        const [minValue, errorMsg] = Array.isArray(options.min)
          ? options.min
          : [options.min, `${fieldStr} must be at least ${options.min}`]

        if (typeof value === 'number' && value < minValue) {
          errors.push(errorMsg)
        } else {
          const dateValue = value as unknown
          if (dateValue instanceof Date && dateValue < new Date(minValue)) {
            errors.push(errorMsg)
          }
        }
      }

      // Max validation (numbers and dates)
      if (options.max !== undefined) {
        const [maxValue, errorMsg] = Array.isArray(options.max)
          ? options.max
          : [options.max, `${fieldStr} must be at most ${options.max}`]

        if (typeof value === 'number' && value > maxValue) {
          errors.push(errorMsg)
        } else {
          const dateValue = value as unknown
          if (dateValue instanceof Date && dateValue > new Date(maxValue)) {
            errors.push(errorMsg)
          }
        }
      }

      // MinLength validation (strings and arrays)
      if (options.minLength !== undefined) {
        const [minLen, errorMsg] = Array.isArray(options.minLength)
          ? options.minLength
          : [options.minLength, `${fieldStr} must be at least ${options.minLength} characters`]

        if (
          (typeof value === 'string' || Array.isArray(value)) &&
          (value as string | unknown[]).length < minLen
        ) {
          errors.push(errorMsg)
        }
      }

      // MaxLength validation (strings and arrays)
      if (options.maxLength !== undefined) {
        const [maxLen, errorMsg] = Array.isArray(options.maxLength)
          ? options.maxLength
          : [options.maxLength, `${fieldStr} must be at most ${options.maxLength} characters`]

        if (
          (typeof value === 'string' || Array.isArray(value)) &&
          (value as string | unknown[]).length > maxLen
        ) {
          errors.push(errorMsg)
        }
      }

      // Enum validation
      if (options.enum) {
        const enumConfig = Array.isArray(options.enum)
          ? {
              values: options.enum,
              message: `${fieldStr} must be one of: ${options.enum.join(', ')}`
            }
          : options.enum

        if (!enumConfig.values.includes(value)) {
          errors.push(
            enumConfig.message || `${fieldStr} must be one of: ${enumConfig.values.join(', ')}`
          )
        }
      }

      // Match validation (regex for strings)
      if (options.match && typeof value === 'string') {
        const [pattern, errorMsg] = Array.isArray(options.match)
          ? options.match
          : [options.match, `${fieldStr} does not match the required pattern`]

        if (!pattern.test(value)) {
          errors.push(errorMsg)
        }
      }

      // Custom validation
      if (options.validate) {
        const validator =
          typeof options.validate === 'function'
            ? { validator: options.validate, message: `${fieldStr} validation failed` }
            : options.validate

        const isValid = await validator.validator(value)
        if (!isValid) {
          errors.push(validator.message || `${fieldStr} validation failed`)
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(errors.join('; '))
    }
  }

  /**
   * Serialize schema to a JSON-compatible format for storage tracking
   * This allows schema versions to be recorded and compared
   */
  toJSON(): {
    definition: Record<string, unknown>
    indexes: Array<{ fields: string[]; unique: boolean }>
    options: SchemaOptions
    version: string
  } {
    // Serialize field definitions
    const definition: Record<string, unknown> = {}
    for (const [field, options] of this._fieldOptions.entries()) {
      definition[field as string] = { ...options }
    }

    // Serialize indexes
    const indexes = this._indexes.map(fields => {
      const fieldNames = (Array.isArray(fields) ? fields : [fields]).map(String)
      const indexKey = [...fieldNames].sort().join(',')
      const isUnique = this._uniqueIndexes?.has(indexKey) || false
      return { fields: fieldNames, unique: isUnique }
    })

    // Generate schema version hash based on definition and indexes
    const schemaString = JSON.stringify({ definition, indexes, options: this._options })
    let hash = 0
    for (let i = 0; i < schemaString.length; i++) {
      const char = schemaString.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    const version = Math.abs(hash).toString(36)

    return {
      definition,
      indexes,
      options: this._options,
      version
    }
  }
}
