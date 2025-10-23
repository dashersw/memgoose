import { DocumentQueryBuilder, QueryOptions, PopulateOptions } from './document-query-builder'
import { QueryableKeys } from './type-utils'

// Type imports needed for Model reference
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

// FindQueryBuilder - for find() operations that return arrays
// Extends DocumentQueryBuilder and adds sort(), limit(), skip()
export class FindQueryBuilder<
  T extends object = Record<string, unknown>
> extends DocumentQueryBuilder<T, Array<T & Document>> {
  protected _sort?: Partial<Record<keyof T, 1 | -1>>
  protected _limit?: number
  protected _skip?: number
  protected _query: Query<T>

  constructor(model: any, query: Query<T> = {}) {
    // Create a dummy operation for the parent
    super(model, async () => [] as Array<T & Document>)
    this._model = model
    this._query = query
    this._populate = []
  }

  sort(fields: Partial<Record<keyof T, 1 | -1>> | string): this {
    if (typeof fields === 'string') {
      // Convert space-separated string to object format
      // 'age -createdAt' -> { age: 1, createdAt: -1 }
      const sortObj: Partial<Record<keyof T, 1 | -1>> = {}
      fields
        .split(/\s+/)
        .filter(Boolean)
        .forEach(field => {
          if (field.startsWith('-')) {
            sortObj[field.slice(1) as keyof T] = -1
          } else if (field.startsWith('+')) {
            sortObj[field.slice(1) as keyof T] = 1
          } else {
            sortObj[field as keyof T] = 1
          }
        })
      this._sort = sortObj
    } else {
      this._sort = fields
    }
    return this
  }

  limit(n: number): this {
    this._limit = n
    return this
  }

  skip(n: number): this {
    this._skip = n
    return this
  }

  // Override populate to return FindQueryBuilder (maintains sort/limit/skip methods)
  // Supports string, string[], or PopulateOptions for advanced population
  // @ts-expect-error - Intentional covariant return type override
  populate<TPopulated extends object = T>(
    field: string | string[] | PopulateOptions
  ): FindQueryBuilder<TPopulated> {
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

  // Override exec to execute find with all accumulated options
  async exec(): Promise<Array<T & Document>> {
    const options: QueryOptions<T> = {
      sort: this._sort,
      limit: this._limit,
      skip: this._skip,
      select: this._select,
      lean: this._lean
    }

    let results = await this._model._executeFindWithOptions(this._query, options)

    // Apply populate if specified
    if (this._populate) {
      const hasPopulate = Array.isArray(this._populate) ? this._populate.length > 0 : true // Single PopulateOptions object
      if (hasPopulate) {
        results = await this._model._applyPopulate(results, this._populate)
      }
    }

    return results
  }
}
