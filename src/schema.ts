// Virtual type for getter-only virtuals
export class VirtualType<T = any> {
  private _getter?: ((this: any) => T) | ((doc: any) => T)

  get(fn: ((this: any) => T) | ((doc: any) => T)): this {
    this._getter = fn
    return this
  }

  applyGetter(doc: any): T | undefined {
    if (!this._getter) return undefined
    // Support both syntaxes: function(doc) and function(this)
    // If function has 1 parameter, pass doc; otherwise use call(doc)
    const getter = this._getter as (doc: any) => T
    return getter.length === 1 ? getter(doc) : getter.call(doc, doc)
  }
}

// Hook context types for different events
export type SaveHookContext<T> = { doc: T }

// Pre-delete context
export type PreDeleteHookContext<T = any> = {
  query: any
  _?: T // Phantom to avoid unused warning
}

// Post-delete context (has results)
export type PostDeleteHookContext<T> = {
  query: any
  deletedCount: number
  docs?: T[]
}

export type DeleteHookContext<T> = PreDeleteHookContext<T> | PostDeleteHookContext<T>

// Pre-update context
export type PreUpdateHookContext<T> = {
  query: any
  update?: any
  doc?: T
}

// Post-update context (has results)
export type PostUpdateHookContext<T> = {
  query: any
  update?: any
  modifiedCount: number
  docs?: T[]
}

export type UpdateHookContext<T> = PreUpdateHookContext<T> | PostUpdateHookContext<T>

// Pre-find context
export type PreFindHookContext<T = any> = {
  query: any
  _?: T // Phantom to avoid unused warning
}

// Post-find context (has results)
export type PostFindHookContext<T> = {
  query: any
  result?: T | null
  results?: T[]
}

export type FindHookContext<T> = PreFindHookContext<T> | PostFindHookContext<T>

// Generic hook function
export type HookFunction = (context: any) => void | Promise<void>

// Validation types
export type ValidatorFunction = (value: any) => boolean | Promise<boolean>

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
export class Schema<T extends Record<string, any> = Record<string, any>> {
  private _definition: Record<string, any>
  private _fieldOptions: Map<keyof T, FieldOptions>
  private _indexes: Array<Array<keyof T>>
  private _uniqueIndexes?: Set<string>
  private _virtuals: Map<string, VirtualType>
  private _preHooks: Map<string, HookFunction[]>
  private _postHooks: Map<string, HookFunction[]>
  private _options: SchemaOptions
  public methods: Record<string, (this: T, ...args: any[]) => any>
  public statics: Record<string, (...args: any[]) => any>

  constructor(definition: Record<string, any>, options: SchemaOptions = {}) {
    this._definition = definition
    this._fieldOptions = new Map()
    this._indexes = []
    this._virtuals = new Map()
    this._preHooks = new Map()
    this._postHooks = new Map()
    this._options = options
    this.methods = {}
    this.statics = {}

    // Parse field definitions to extract options
    this._parseFieldDefinitions(definition)
  }

  private _parseFieldDefinitions(definition: Record<string, any>): void {
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
        if (fieldDef.type instanceof Schema) {
          this._fieldOptions.set(fieldName as keyof T, fieldDef as FieldOptions)
        } else {
          // Detailed syntax: { type: String, required: true, ... }
          this._fieldOptions.set(fieldName as keyof T, fieldDef as FieldOptions)

          // Auto-create index if unique: true is specified
          if (fieldDef.unique === true) {
            this.index(fieldName as keyof T, { unique: true })
          }
        }
      } else {
        // Simple syntax: String or Number
        this._fieldOptions.set(fieldName as keyof T, { type: fieldDef })
      }
    }
  }

  index(fields: keyof T | Array<keyof T>, options?: { unique?: boolean }): this {
    // Normalize to array - single field becomes array with one element
    const normalizedFields = Array.isArray(fields) ? fields : [fields]
    this._indexes.push(normalizedFields)

    // Track unique constraint
    if (options?.unique) {
      const indexKey = normalizedFields.join(',')
      if (!this._uniqueIndexes) {
        this._uniqueIndexes = new Set()
      }
      this._uniqueIndexes.add(indexKey)
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

  getVirtuals(): Map<string, VirtualType> {
    return this._virtuals
  }

  pre(event: 'save', fn: (context: SaveHookContext<T>) => void | Promise<void>): this
  pre(event: 'delete', fn: (context: PreDeleteHookContext<T>) => void | Promise<void>): this
  pre(event: 'update', fn: (context: PreUpdateHookContext<T>) => void | Promise<void>): this
  pre(event: 'find' | 'findOne', fn: (context: PreFindHookContext<T>) => void | Promise<void>): this
  pre(event: string, fn: HookFunction): this {
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
  post(event: string, fn: HookFunction): this {
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
}
