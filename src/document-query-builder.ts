import { QueryBuilder } from './query-builder'
import { QueryableKeys } from './type-utils'

// Type definitions needed from model.ts
export type QueryOptions<T = any> = {
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
  match?: Record<string, any> // Query filter for populated documents
  populate?: PopulateOptions | PopulateOptions[]
  model?: string
}

type LogicalQueryOperators<T extends object> = {
  $or?: Query<T>[]
  $and?: Query<T>[]
  $nor?: Query<T>[]
}

export type Query<T extends object = Record<string, unknown>> = {
  [K in QueryableKeys<T>]?: any
} & LogicalQueryOperators<T>

// Import Document type for proper typing
import type { Document } from './document'

// DocumentQueryBuilder - for operations that return documents
// Adds select(), lean(), populate() to base QueryBuilder
// TResult is the final result type (T | null for single docs, T[] for arrays)
export class DocumentQueryBuilder<
  T extends object = Record<string, unknown>,
  TResult = (T & Document) | null
> extends QueryBuilder<TResult> {
  protected _select?: Partial<Record<keyof T, 0 | 1>>
  protected _lean?: boolean
  protected _populate?: string[] | PopulateOptions | PopulateOptions[]
  protected _model: any
  protected _executeInternal: (options?: QueryOptions<T>) => Promise<TResult>

  constructor(model: any, operation: (options?: QueryOptions<T>) => Promise<TResult>) {
    // Pass a wrapper that ignores options for base QueryBuilder compatibility
    super(() => operation())
    this._model = model
    this._executeInternal = operation
    this._populate = []
  }

  select(fields: Partial<Record<keyof T, 0 | 1>> | string): this {
    if (typeof fields === 'string') {
      // Convert space-separated string to object format
      // 'name age' -> { name: 1, age: 1 }
      // '-password -secret' -> { password: 0, secret: 0 }
      const selectObj: Partial<Record<keyof T, 0 | 1>> = {}
      fields
        .split(/\s+/)
        .filter(Boolean)
        .forEach(field => {
          if (field.startsWith('-')) {
            selectObj[field.slice(1) as keyof T] = 0
          } else {
            selectObj[field as keyof T] = 1
          }
        })
      this._select = selectObj
    } else {
      this._select = fields
    }
    return this
  }

  lean(value: boolean = true): this {
    this._lean = value
    return this
  }

  populate<TPopulated extends object = T>(
    field: string | string[] | PopulateOptions
  ): DocumentQueryBuilder<TPopulated, TResult> {
    // Handle different input formats
    if (!this._populate || Array.isArray(this._populate)) {
      // Currently an array or undefined, need to append
      const existing = (this._populate || []) as string[]
      if (typeof field === 'string') {
        this._populate = [...existing, field] as string[]
      } else if (Array.isArray(field)) {
        this._populate = [...existing, ...field] as string[]
      } else {
        // PopulateOptions object - convert existing array to options and add new one
        if (existing.length === 0) {
          this._populate = field
        } else {
          this._populate = [...existing.map(path => ({ path })), field] as PopulateOptions[]
        }
      }
    } else {
      // Currently a PopulateOptions or array of PopulateOptions
      const current = this._populate as PopulateOptions | PopulateOptions[]
      const currentArray = Array.isArray(current) ? current : [current]

      if (typeof field === 'string') {
        this._populate = [...currentArray, { path: field }] as PopulateOptions[]
      } else if (Array.isArray(field)) {
        this._populate = [...currentArray, ...field.map(path => ({ path }))] as PopulateOptions[]
      } else {
        this._populate = [...currentArray, field] as PopulateOptions[]
      }
    }
    return this as any
  }

  // Override exec to apply options
  async exec(): Promise<TResult> {
    // Build options object from builder state
    const options: QueryOptions<T> = {
      select: this._select,
      lean: this._lean
    }

    // Pass options to the operation
    let result = await this._executeInternal(options)

    if (!result) return result

    // Handle single document (T | null) case
    if (!Array.isArray(result)) {
      let doc = result as T

      // Apply populate if specified (model handled virtuals and selection)
      if (this._populate) {
        const hasPopulate = Array.isArray(this._populate) ? this._populate.length > 0 : true // Single PopulateOptions object
        if (hasPopulate) {
          const results = await this._model._applyPopulate([doc], this._populate)
          doc = results[0] || null
        }
      }

      return doc as unknown as TResult
    }

    // If it's an array, return as-is (handled by FindQueryBuilder override)
    return result
  }
}
