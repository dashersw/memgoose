import type { AggregationPipeline, AggregationStage } from '../aggregation'
import { SqlQueryBuilder } from './sql-query-builder'

/**
 * Builds SQL queries from MongoDB-style aggregation pipelines for SQLite
 * Supports basic aggregation stages that can be translated to SQL
 */
export class SqlAggregationBuilder<T extends object> {
  private queryBuilder: SqlQueryBuilder<T>

  constructor(
    private tableName: string,
    private db: any
  ) {
    this.queryBuilder = new SqlQueryBuilder<T>(tableName)
  }

  /**
   * Build aggregation query from pipeline
   * Note: Complex pipelines may not be fully supported and will throw errors
   */
  buildAggregationQuery(pipeline: AggregationPipeline<T>): { sql: string; params: unknown[] } {
    // For now, we'll support basic pipelines that can be translated to simple SQL
    // More complex aggregations will fall back to JavaScript engine

    const params: unknown[] = []
    let sql = `SELECT`
    let from = ` FROM ${this.tableName}`
    let where = ''
    let groupBy = ''
    let orderBy = ''
    let limit = ''
    let offset = ''

    // Track if we need to project fields or use data
    let selectFields: string[] = []
    let hasGroup = false

    for (const stage of pipeline) {
      if ('$match' in stage) {
        // Build WHERE clause
        const { clause, params: matchParams } = this.queryBuilder['buildWhereClause'](stage.$match)
        if (clause) {
          where = ` WHERE ${clause}`
          params.push(...matchParams)
        }
      } else if ('$sort' in stage) {
        // Build ORDER BY clause
        const sortClauses = Object.entries(stage.$sort).map(([field, direction]) => {
          const dir = direction === 1 ? 'ASC' : 'DESC'
          return `json_extract(data, '$.${field}') ${dir}`
        })
        orderBy = ` ORDER BY ${sortClauses.join(', ')}`
      } else if ('$limit' in stage) {
        limit = ` LIMIT ${stage.$limit}`
      } else if ('$skip' in stage) {
        offset = ` OFFSET ${stage.$skip}`
      } else if ('$count' in stage) {
        // Return count as single field
        sql = `SELECT COUNT(*) as ${stage.$count}`
        selectFields = [] // Override any projections
      } else if ('$group' in stage) {
        hasGroup = true
        // Basic $group support
        const groupStage = stage.$group

        // Build GROUP BY fields
        if (groupStage._id && groupStage._id !== null) {
          if (typeof groupStage._id === 'string') {
            // Simple field grouping: { $group: { _id: "$field" } }
            const field = groupStage._id.startsWith('$') ? groupStage._id.slice(1) : groupStage._id
            groupBy = ` GROUP BY json_extract(data, '$.${field}')`
            selectFields.push(`json_extract(data, '$.${field}') as _id`)
          } else {
            // Compound grouping: { $group: { _id: { field1: "$field1", field2: "$field2" } } }
            const groupFields: string[] = []
            const idFields: string[] = []
            for (const [key, value] of Object.entries(groupStage._id)) {
              if (typeof value === 'string' && value.startsWith('$')) {
                const field = value.slice(1)
                groupFields.push(`json_extract(data, '$.${field}')`)
                idFields.push(`'${key}', json_extract(data, '$.${field}')`)
              }
            }
            groupBy = ` GROUP BY ${groupFields.join(', ')}`
            selectFields.push(`json_object(${idFields.join(', ')}) as _id`)
          }
        } else {
          // Group all: { $group: { _id: null } }
          selectFields.push('NULL as _id')
        }

        // Build aggregation functions
        for (const [field, accumulator] of Object.entries(groupStage)) {
          if (field === '_id') continue

          if (typeof accumulator === 'object' && accumulator !== null) {
            if ('$sum' in accumulator) {
              const sumValue = accumulator.$sum
              if (sumValue === 1) {
                selectFields.push(`COUNT(*) as ${field}`)
              } else if (typeof sumValue === 'string' && sumValue.startsWith('$')) {
                const sumField = sumValue.slice(1)
                selectFields.push(`SUM(json_extract(data, '$.${sumField}')) as ${field}`)
              }
            } else if ('$avg' in accumulator) {
              const avgField = typeof accumulator.$avg === 'string' ? accumulator.$avg.slice(1) : ''
              selectFields.push(`AVG(json_extract(data, '$.${avgField}')) as ${field}`)
            } else if ('$min' in accumulator) {
              const minField = typeof accumulator.$min === 'string' ? accumulator.$min.slice(1) : ''
              selectFields.push(`MIN(json_extract(data, '$.${minField}')) as ${field}`)
            } else if ('$max' in accumulator) {
              const maxField = typeof accumulator.$max === 'string' ? accumulator.$max.slice(1) : ''
              selectFields.push(`MAX(json_extract(data, '$.${maxField}')) as ${field}`)
            } else if ('$push' in accumulator) {
              // Use json_group_array
              const pushValue = accumulator.$push
              if (typeof pushValue === 'string' && pushValue.startsWith('$')) {
                const pushField = pushValue.slice(1)
                selectFields.push(
                  `json_group_array(json_extract(data, '$.${pushField}')) as ${field}`
                )
              }
            } else if ('$addToSet' in accumulator) {
              // Use json_group_array with DISTINCT
              const addField =
                typeof accumulator.$addToSet === 'string' ? accumulator.$addToSet.slice(1) : ''
              selectFields.push(
                `json_group_array(DISTINCT json_extract(data, '$.${addField}')) as ${field}`
              )
            }
          }
        }
      } else if ('$project' in stage) {
        // Basic projection support
        if (!hasGroup) {
          const projFields: string[] = []
          for (const [field, spec] of Object.entries(stage.$project)) {
            if (spec === 1) {
              projFields.push(`json_extract(data, '$.${field}') as ${field}`)
            } else if (spec === 0) {
              // Exclusion - harder to handle, skip for now
              continue
            } else if (typeof spec === 'string' && (spec as string).startsWith('$')) {
              // Field reference
              const refField = (spec as string).slice(1)
              projFields.push(`json_extract(data, '$.${refField}') as ${field}`)
            }
          }
          if (projFields.length > 0) {
            selectFields = projFields
          }
        }
      } else {
        // Unsupported stage - throw error to fall back to JS engine
        const stageName = Object.keys(stage)[0]
        throw new Error(
          `Unsupported aggregation stage for SQL: ${stageName}. Falling back to JavaScript engine.`
        )
      }
    }

    // Build final SQL
    if (selectFields.length > 0) {
      sql += ' ' + selectFields.join(', ')
    } else {
      // No specific fields, return full data
      sql += ' data'
    }

    sql += from + where + groupBy + orderBy + limit + offset

    return { sql, params }
  }
}
