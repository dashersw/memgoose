import { DocumentQueryBuilder, QueryOptions } from './document-query-builder'
import { QueryableKeys } from './type-utils'

// Type imports needed for Model reference
export type Query<T extends Record<string, any> = Record<string, any>> = {
  [K in QueryableKeys<T>]?: any
}

// Import Document type for proper typing
import type { Document } from './document'

// FindQueryBuilder - for find() operations that return arrays
// Extends DocumentQueryBuilder and adds sort(), limit(), skip()
export class FindQueryBuilder<T extends Record<string, any>> extends DocumentQueryBuilder<
  T,
  Array<T & Document>
> {
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
  // 5-line duplication necessary for proper type safety - same pattern as Mongoose
  // @ts-expect-error - Intentional covariant return type override
  populate<TPopulated extends Record<string, any> = T>(
    field: string | string[]
  ): FindQueryBuilder<TPopulated> {
    const fields = Array.isArray(field) ? field : [field]
    this._populate = [...(this._populate || []), ...fields]
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
    if (this._populate && this._populate.length > 0) {
      results = await this._model._applyPopulate(results, this._populate)
    }

    return results
  }
}
