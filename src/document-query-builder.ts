import { QueryBuilder } from './query-builder'

// Type definitions needed from model.ts
export type QueryOptions<T = any> = {
  sort?: Partial<Record<keyof T, 1 | -1>>
  limit?: number
  skip?: number
  select?: Partial<Record<keyof T, 0 | 1>>
  lean?: boolean
}

export type Query<T extends Record<string, any> = Record<string, any>> = {
  [K in keyof T]?: any
}

// DocumentQueryBuilder - for operations that return documents
// Adds select(), lean(), populate() to base QueryBuilder
// TResult is the final result type (T | null for single docs, T[] for arrays)
export class DocumentQueryBuilder<
  T extends Record<string, any>,
  TResult = T | null
> extends QueryBuilder<TResult> {
  protected _select?: Partial<Record<keyof T, 0 | 1>>
  protected _lean?: boolean
  protected _populate?: string[]
  protected _model: any
  protected _executeInternal: () => Promise<TResult>

  constructor(model: any, operation: () => Promise<TResult>) {
    super(operation)
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

  populate<TPopulated extends Record<string, any> = T>(
    field: string | string[]
  ): DocumentQueryBuilder<TPopulated, TResult> {
    const fields = Array.isArray(field) ? field : [field]
    this._populate = [...(this._populate || []), ...fields]
    return this as any
  }

  // Override exec to apply options
  async exec(): Promise<TResult> {
    let result = await this._executeInternal()

    if (!result) return result

    // Handle single document (T | null) case
    if (!Array.isArray(result)) {
      let doc = result as T

      // Apply virtuals unless lean mode is enabled
      if (!this._lean) {
        doc = this._model._applyVirtuals(doc)
      }

      // Apply field selection
      if (this._select) {
        doc = this._model._applyFieldSelection(doc, this._select) as T
      }

      // Apply populate
      if (this._populate && this._populate.length > 0) {
        const results = await this._model._applyPopulate([doc], this._populate)
        doc = results[0] || null
      }

      return doc as unknown as TResult
    }

    // If it's an array, return as-is (handled by FindQueryBuilder override)
    return result
  }
}
