import type { Query, QueryOptions, Update } from '../model'
import { ObjectId } from '../objectid'

/**
 * Builds SQL queries from MongoDB-style query objects for SQLite
 * Uses json_extract to query JSON document fields
 */
export class SqlQueryBuilder<T extends object> {
  constructor(private tableName: string) {}

  /**
   * Build a SELECT query with WHERE, ORDER BY, LIMIT, OFFSET
   */
  buildSelectQuery(query: Query<T>, options?: QueryOptions<T>): { sql: string; params: unknown[] } {
    const { clause: whereClause, params } = this.buildWhereClause(query)

    let sql = `SELECT data FROM ${this.tableName}`

    if (whereClause) {
      sql += ` WHERE ${whereClause}`
    }

    // Add ORDER BY if sort is specified
    if (options?.sort) {
      const sortClauses = Object.entries(options.sort).map(([field, direction]) => {
        const dir = direction === 1 ? 'ASC' : 'DESC'
        return `json_extract(data, '$.${field}') ${dir}`
      })
      sql += ` ORDER BY ${sortClauses.join(', ')}`
    }

    // Add LIMIT and OFFSET
    if (options?.limit !== undefined) {
      sql += ` LIMIT ${options.limit}`
    }

    if (options?.skip !== undefined) {
      sql += ` OFFSET ${options.skip}`
    }

    return { sql, params }
  }

  /**
   * Build an UPDATE query with json_set/json_remove for update operators
   */
  buildUpdateQuery(query: Query<T>, update: Update<T>): { sql: string; params: unknown[] } {
    const { clause: whereClause, params: whereParams } = this.buildWhereClause(query)

    // Check if update contains operators
    const hasOperators = Object.keys(update).some(k => k.startsWith('$'))

    let updateExpression: string
    const updateParams: unknown[] = []

    if (hasOperators) {
      // Build json_set/json_remove chain for operators
      updateExpression = this.buildUpdateOperators(update as Record<string, unknown>, updateParams)
    } else {
      // Direct field updates - wrap entire document with updates
      updateExpression = this.buildDirectUpdate(update as Partial<T>, updateParams)
    }

    const sql = `UPDATE ${this.tableName} SET data = ${updateExpression}${whereClause ? ` WHERE ${whereClause}` : ''}`

    return { sql, params: [...updateParams, ...whereParams] }
  }

  /**
   * Build a DELETE query
   */
  buildDeleteQuery(query: Query<T>): { sql: string; params: unknown[] } {
    const { clause: whereClause, params } = this.buildWhereClause(query)

    const sql = `DELETE FROM ${this.tableName}${whereClause ? ` WHERE ${whereClause}` : ''}`

    return { sql, params }
  }

  /**
   * Build a COUNT query
   */
  buildCountQuery(query: Query<T>): { sql: string; params: unknown[] } {
    const { clause: whereClause, params } = this.buildWhereClause(query)

    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}${whereClause ? ` WHERE ${whereClause}` : ''}`

    return { sql, params }
  }

  /**
   * Build WHERE clause from MongoDB-style query
   */
  private buildWhereClause(query: Query<T>): { clause: string; params: unknown[] } {
    const params: unknown[] = []

    // Handle empty query
    if (!query || Object.keys(query).length === 0) {
      return { clause: '', params: [] }
    }

    // Handle logical operators at top level
    if ('$or' in query) {
      const orConditions = (query as { $or: Query<T>[] }).$or
      const clauses = orConditions.map(cond => {
        const { clause, params: condParams } = this.buildWhereClause(cond)
        params.push(...condParams)
        return `(${clause})`
      })
      return { clause: clauses.join(' OR '), params }
    }

    if ('$and' in query) {
      const andConditions = (query as { $and: Query<T>[] }).$and
      const clauses = andConditions.map(cond => {
        const { clause, params: condParams } = this.buildWhereClause(cond)
        params.push(...condParams)
        return `(${clause})`
      })
      return { clause: clauses.join(' AND '), params }
    }

    if ('$nor' in query) {
      const norConditions = (query as { $nor: Query<T>[] }).$nor
      const clauses = norConditions.map(cond => {
        const { clause, params: condParams } = this.buildWhereClause(cond)
        params.push(...condParams)
        return `(${clause})`
      })
      return { clause: `NOT (${clauses.join(' OR ')})`, params }
    }

    // Build conditions for each field
    const conditions: string[] = []

    for (const [field, value] of Object.entries(query)) {
      // Skip logical operators (already handled above)
      if (field.startsWith('$')) continue

      const { sql, params: fieldParams } = this.buildFieldCondition(field, value)
      conditions.push(sql)
      params.push(...fieldParams)
    }

    return { clause: conditions.join(' AND '), params }
  }

  /**
   * Build condition for a single field
   */
  private buildFieldCondition(field: string, value: unknown): { sql: string; params: unknown[] } {
    const params: unknown[] = []

    // Simple equality (non-object, non-array)
    if (value === null || value === undefined) {
      return { sql: `json_extract(data, '$.${field}') IS NULL`, params: [] }
    }

    if (typeof value !== 'object' || value instanceof ObjectId || value instanceof Date) {
      const serialized = this.serializeValue(value)
      params.push(serialized)
      return { sql: `json_extract(data, '$.${field}') = ?`, params }
    }

    // Array direct equality
    if (Array.isArray(value)) {
      const serialized = JSON.stringify(value)
      params.push(serialized)
      return { sql: `json_extract(data, '$.${field}') = json(?)`, params }
    }

    // Query operators
    const conditions: string[] = []

    for (const [operator, opValue] of Object.entries(value)) {
      const { sql, params: opParams } = this.translateOperator(field, operator, opValue)
      conditions.push(sql)
      params.push(...opParams)
    }

    return { sql: conditions.join(' AND '), params }
  }

  /**
   * Translate MongoDB query operator to SQL
   */
  private translateOperator(
    field: string,
    operator: string,
    value: unknown
  ): { sql: string; params: unknown[] } {
    const fieldExpr = `json_extract(data, '$.${field}')`
    const params: unknown[] = []

    switch (operator) {
      case '$eq': {
        // MongoDB behavior: $eq: null matches both null and undefined (missing fields)
        if (value === null || value === undefined) {
          return { sql: `${fieldExpr} IS NULL`, params: [] }
        }
        const serialized = this.serializeValue(value)
        params.push(serialized)
        return { sql: `${fieldExpr} = ?`, params }
      }

      case '$ne': {
        // MongoDB behavior: $ne: null excludes both null and undefined (missing fields)
        if (value === null || value === undefined) {
          return { sql: `${fieldExpr} IS NOT NULL`, params: [] }
        }
        const serialized = this.serializeValue(value)
        params.push(serialized)
        // Handle NULL: field != value OR field IS NULL
        return { sql: `(${fieldExpr} != ? OR ${fieldExpr} IS NULL)`, params }
      }

      case '$gt': {
        const serialized = this.serializeValue(value)
        params.push(serialized)
        return { sql: `${fieldExpr} > ?`, params }
      }

      case '$gte': {
        const serialized = this.serializeValue(value)
        params.push(serialized)
        return { sql: `${fieldExpr} >= ?`, params }
      }

      case '$lt': {
        const serialized = this.serializeValue(value)
        params.push(serialized)
        return { sql: `${fieldExpr} < ?`, params }
      }

      case '$lte': {
        const serialized = this.serializeValue(value)
        params.push(serialized)
        return { sql: `${fieldExpr} <= ?`, params }
      }

      case '$in': {
        if (!Array.isArray(value) || value.length === 0) {
          return { sql: '0', params: [] } // Always false
        }
        // MongoDB behavior: $in: [null] matches both null and undefined (missing fields)
        const hasNull = value.some(v => v === null || v === undefined)
        const nonNullValues = value.filter(v => v !== null && v !== undefined)

        if (hasNull && nonNullValues.length === 0) {
          // Only null in array
          return { sql: `${fieldExpr} IS NULL`, params: [] }
        } else if (hasNull) {
          // Mix of null and other values
          const placeholders = nonNullValues.map(() => '?').join(', ')
          params.push(...nonNullValues.map(v => this.serializeValue(v)))
          return { sql: `(${fieldExpr} IS NULL OR ${fieldExpr} IN (${placeholders}))`, params }
        } else {
          // No null values
          const placeholders = value.map(() => '?').join(', ')
          params.push(...value.map(v => this.serializeValue(v)))
          return { sql: `${fieldExpr} IN (${placeholders})`, params }
        }
      }

      case '$nin': {
        if (!Array.isArray(value) || value.length === 0) {
          return { sql: '1', params: [] } // Always true
        }
        // MongoDB behavior: $nin: [null] excludes both null and undefined (missing fields)
        const hasNull = value.some(v => v === null || v === undefined)
        const nonNullValues = value.filter(v => v !== null && v !== undefined)

        if (hasNull && nonNullValues.length === 0) {
          // Only null in array - exclude null/undefined
          return { sql: `${fieldExpr} IS NOT NULL`, params: [] }
        } else if (hasNull) {
          // Mix of null and other values - must be NOT NULL AND NOT IN (...)
          const placeholders = nonNullValues.map(() => '?').join(', ')
          params.push(...nonNullValues.map(v => this.serializeValue(v)))
          return {
            sql: `(${fieldExpr} IS NOT NULL AND ${fieldExpr} NOT IN (${placeholders}))`,
            params
          }
        } else {
          // No null values - original behavior
          const placeholders = value.map(() => '?').join(', ')
          params.push(...value.map(v => this.serializeValue(v)))
          return { sql: `(${fieldExpr} NOT IN (${placeholders}) OR ${fieldExpr} IS NULL)`, params }
        }
      }

      case '$regex': {
        const pattern = value instanceof RegExp ? value.source : String(value)
        params.push(pattern)
        return { sql: `regexp(?, ${fieldExpr})`, params }
      }

      case '$exists': {
        if (value === true) {
          return { sql: `${fieldExpr} IS NOT NULL`, params: [] }
        } else {
          return { sql: `${fieldExpr} IS NULL`, params: [] }
        }
      }

      case '$size': {
        params.push(value)
        return { sql: `json_array_length(${fieldExpr}) = ?`, params }
      }

      case '$all': {
        if (!Array.isArray(value)) {
          return { sql: '0', params: [] }
        }
        // Each element must be in the array
        const conditions = value.map(val => {
          const serialized = JSON.stringify(val)
          params.push(serialized)
          return `json_array_contains(${fieldExpr}, ?)`
        })
        return { sql: conditions.join(' AND '), params }
      }

      case '$elemMatch': {
        // EXISTS (SELECT 1 FROM json_each(field) WHERE conditions)
        const elemConditions: string[] = []
        for (const [subField, subValue] of Object.entries(value as Record<string, unknown>)) {
          if (typeof subValue === 'object' && subValue !== null && !Array.isArray(subValue)) {
            // Has operators
            for (const [op, opVal] of Object.entries(subValue)) {
              const { sql } = this.translateOperator(`value.${subField}`, op, opVal)
              elemConditions.push(
                sql.replace(
                  `json_extract(data, '$.value.${subField}')`,
                  `json_extract(value, '$.${subField}')`
                )
              )
              params.push(this.serializeValue(opVal))
            }
          } else {
            params.push(this.serializeValue(subValue))
            elemConditions.push(`json_extract(value, '$.${subField}') = ?`)
          }
        }
        return {
          sql: `EXISTS (SELECT 1 FROM json_each(${fieldExpr}) WHERE ${elemConditions.join(' AND ')})`,
          params
        }
      }

      case '$not': {
        // Negate the inner condition
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const innerConditions: string[] = []
          for (const [innerOp, innerValue] of Object.entries(value)) {
            const { sql, params: innerParams } = this.translateOperator(field, innerOp, innerValue)
            innerConditions.push(sql)
            params.push(...innerParams)
          }
          return { sql: `NOT (${innerConditions.join(' AND ')})`, params }
        } else {
          const serialized = this.serializeValue(value)
          params.push(serialized)
          return { sql: `${fieldExpr} != ?`, params }
        }
      }

      default:
        throw new Error(`Unsupported query operator: ${operator}`)
    }
  }

  /**
   * Build update expression using json_set/json_remove for operators
   */
  private buildUpdateOperators(update: Record<string, unknown>, params: unknown[]): string {
    let expression = 'data'

    // Process $set operator
    if (update.$set) {
      for (const [field, value] of Object.entries(update.$set as Record<string, unknown>)) {
        params.push(JSON.stringify(value))
        expression = `json_set(${expression}, '$.${field}', json(?))`
      }
    }

    // Process $unset operator
    if (update.$unset) {
      for (const field of Object.keys(update.$unset as Record<string, unknown>)) {
        expression = `json_remove(${expression}, '$.${field}')`
      }
    }

    // Process $inc operator
    if (update.$inc) {
      for (const [field, value] of Object.entries(update.$inc as Record<string, number>)) {
        params.push(value)
        expression = `json_set(${expression}, '$.${field}', CAST(json_extract(${expression}, '$.${field}') AS REAL) + ?)`
      }
    }

    // Process $dec operator (same as $inc but subtract)
    if (update.$dec) {
      for (const [field, value] of Object.entries(update.$dec as Record<string, number>)) {
        params.push(value)
        expression = `json_set(${expression}, '$.${field}', CAST(json_extract(${expression}, '$.${field}') AS REAL) - ?)`
      }
    }

    // Process $push operator
    if (update.$push) {
      for (const [field, value] of Object.entries(update.$push as Record<string, unknown>)) {
        params.push(JSON.stringify(value))
        expression = `json_insert(${expression}, '$.${field}[#]', json(?))`
      }
    }

    // Process $pop operator
    if (update.$pop) {
      for (const [field, direction] of Object.entries(update.$pop as Record<string, 1 | -1>)) {
        if (direction === 1) {
          // Remove last element
          expression = `json_remove(${expression}, '$.${field}[#-1]')`
        } else {
          // Remove first element
          expression = `json_remove(${expression}, '$.${field}[0]')`
        }
      }
    }

    // Process $rename operator
    if (update.$rename) {
      for (const [oldField, newField] of Object.entries(update.$rename as Record<string, string>)) {
        expression = `json_set(json_remove(${expression}, '$.${oldField}'), '$.${newField}', json_extract(${expression}, '$.${oldField}'))`
      }
    }

    // TODO: $pull, $addToSet require more complex logic with CTEs

    return expression
  }

  /**
   * Build direct update (no operators) - merge fields into document
   */
  private buildDirectUpdate(update: Partial<T>, params: unknown[]): string {
    let expression = 'data'

    for (const [field, value] of Object.entries(update)) {
      params.push(JSON.stringify(value))
      expression = `json_set(${expression}, '$.${field}', json(?))`
    }

    return expression
  }

  /**
   * Serialize a value for SQL parameter binding
   * Handles ObjectId, Date, and other special types
   */
  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null
    }

    if (value instanceof ObjectId) {
      return value.toString()
    }

    if (value instanceof Date) {
      return value.toISOString()
    }

    if (typeof value === 'boolean') {
      // SQLite stores booleans as 0/1
      return value ? 1 : 0
    }

    if (typeof value === 'object' && 'toJSON' in value && typeof value.toJSON === 'function') {
      return (value.toJSON as () => unknown)()
    }

    return value
  }
}
