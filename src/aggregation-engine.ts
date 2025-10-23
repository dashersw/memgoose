import type { Model, Query } from './model'
import type {
  AggregationPipeline,
  AggregationStage,
  GroupStage,
  ProjectStage,
  LookupStage,
  UnwindStage,
  SortStage,
  AccumulatorExpression,
  ProjectionExpression,
  ReplaceRootStage,
  BucketStage,
  BucketAutoStage,
  FacetStage,
  MergeStage
} from './aggregation'
import type { Database } from './database'
import { ObjectId } from './objectid'

// Type for aggregation results which can be dynamically shaped
type AggregationResult = Record<string, unknown>

export class AggregationEngine<T extends object = Record<string, unknown>> {
  constructor(
    private model: Model<T>,
    private database?: Database
  ) {}

  async execute(pipeline: AggregationPipeline<T>): Promise<AggregationResult[]> {
    // Optimization: if first stage is $match, use it as the initial query to leverage indexes
    let results: AggregationResult[]
    let startIndex = 0

    if (pipeline.length > 0 && '$match' in pipeline[0]) {
      // Use $match query with indexes via model.find()
      const matchQuery = pipeline[0].$match
      results = (await this.model.find(matchQuery)) as AggregationResult[]
      startIndex = 1 // Skip the first $match stage since we already applied it
    } else {
      // Start with all documents if first stage is not $match
      results = (await this.model.find({} as Query<T>)) as AggregationResult[]
    }

    // Apply remaining stages sequentially
    for (let i = startIndex; i < pipeline.length; i++) {
      results = await this.executeStage(results, pipeline[i])
    }

    return results
  }

  private async executeStage(
    data: AggregationResult[],
    stage: AggregationStage<T>
  ): Promise<AggregationResult[]> {
    if ('$match' in stage) return this.match(data, stage.$match)
    if ('$group' in stage) return this.group(data, stage.$group)
    if ('$project' in stage) return this.project(data, stage.$project)
    if ('$lookup' in stage) return await this.lookup(data, stage.$lookup)
    if ('$unwind' in stage) return this.unwind(data, stage.$unwind)
    if ('$sort' in stage) return this.sort(data, stage.$sort)
    if ('$limit' in stage) return data.slice(0, stage.$limit)
    if ('$skip' in stage) return data.slice(stage.$skip)
    if ('$count' in stage) return [{ [stage.$count]: data.length }]
    if ('$addFields' in stage) return this.addFields(data, stage.$addFields)
    if ('$replaceRoot' in stage) return this.replaceRoot(data, stage.$replaceRoot)
    if ('$sample' in stage) return this.sample(data, stage.$sample.size)
    if ('$bucket' in stage) return this.bucket(data, stage.$bucket)
    if ('$bucketAuto' in stage) return this.bucketAuto(data, stage.$bucketAuto)
    if ('$facet' in stage) return await this.facet(data, stage.$facet)
    if ('$out' in stage) return await this.out(data, stage.$out)
    if ('$merge' in stage) return await this.merge(data, stage.$merge)

    throw new Error(`Unknown aggregation stage: ${Object.keys(stage)[0]}`)
  }

  private match(data: AggregationResult[], query: Query<T>): AggregationResult[] {
    // Use model's internal _matches method
    return data.filter(doc =>
      (this.model as unknown as { _matches: (doc: unknown, query: Query<T>) => boolean })._matches(
        doc,
        query
      )
    )
  }

  private group(data: AggregationResult[], groupStage: GroupStage<T>): AggregationResult[] {
    const { _id: groupKey, ...accumulators } = groupStage
    const groups = new Map<string, AggregationResult>()

    // Group documents
    for (const doc of data) {
      // Compute group key
      let key: string
      if (groupKey === null) {
        key = '__all__' // Group all documents together
      } else if (typeof groupKey === 'string') {
        // Simple field reference like "$city"
        key = String(this.resolveFieldPath(doc, groupKey))
      } else {
        // Compound key like { city: "$city", status: "$status" }
        const keyParts: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(groupKey)) {
          keyParts[k] = this.resolveFieldPath(doc, v)
        }
        key = JSON.stringify(keyParts)
      }

      // Initialize group if needed
      if (!groups.has(key)) {
        const groupDoc: AggregationResult = {}

        // Set _id field
        if (groupKey === null) {
          groupDoc._id = null
        } else if (typeof groupKey === 'string') {
          groupDoc._id = this.resolveFieldPath(doc, groupKey)
        } else {
          groupDoc._id = {} as Record<string, unknown>
          for (const [k, v] of Object.entries(groupKey)) {
            ;(groupDoc._id as Record<string, unknown>)[k] = this.resolveFieldPath(doc, v)
          }
        }

        // Initialize accumulators
        for (const [field, accumulator] of Object.entries(accumulators)) {
          if (accumulator !== null && field !== '_id') {
            groupDoc[field] = this.initAccumulator(accumulator)
          }
        }

        groups.set(key, groupDoc)
      }

      // Apply accumulators
      const groupDoc = groups.get(key)!
      for (const [field, accumulator] of Object.entries(accumulators)) {
        if (accumulator !== null && field !== '_id') {
          groupDoc[field] = this.applyAccumulator(groupDoc[field], accumulator, doc)
        }
      }
    }

    // Finalize accumulators (e.g., compute average, standard deviation)
    const results = Array.from(groups.values())
    return results.map(doc => {
      const finalized = { ...doc }
      for (const [field, accumulator] of Object.entries(accumulators)) {
        if (accumulator !== null && typeof accumulator === 'object') {
          if ('$avg' in accumulator) {
            const avgData = finalized[field] as { sum: number; count: number }
            finalized[field] = avgData.count > 0 ? avgData.sum / avgData.count : null
          } else if ('$stdDevPop' in accumulator) {
            const values = (finalized[field] as { values: number[] }).values
            finalized[field] = this.calculateStdDev(values, false)
          } else if ('$stdDevSamp' in accumulator) {
            const values = (finalized[field] as { values: number[] }).values
            finalized[field] = this.calculateStdDev(values, true)
          }
        }
      }
      return finalized
    })
  }

  private initAccumulator(accumulator: AccumulatorExpression | string): unknown {
    if (typeof accumulator === 'string') return undefined

    if ('$sum' in accumulator) return 0
    if ('$avg' in accumulator) return { sum: 0, count: 0 }
    if ('$min' in accumulator) return Infinity
    if ('$max' in accumulator) return -Infinity
    if ('$first' in accumulator) return undefined
    if ('$last' in accumulator) return undefined
    if ('$push' in accumulator) return []
    if ('$addToSet' in accumulator) return []
    if ('$count' in accumulator) return 0
    if ('$stdDevPop' in accumulator) return { values: [] }
    if ('$stdDevSamp' in accumulator) return { values: [] }
    if ('$mergeObjects' in accumulator) return {}

    return undefined
  }

  private applyAccumulator(
    current: unknown,
    accumulator: AccumulatorExpression | string,
    doc: AggregationResult
  ): unknown {
    if (typeof accumulator === 'string') {
      return this.resolveFieldPath(doc, accumulator)
    }

    if ('$sum' in accumulator) {
      const value = accumulator.$sum
      if (value === 1 || typeof value === 'number') {
        return (current as number) + value
      }
      if (typeof value === 'string') {
        const fieldValue = this.resolveFieldPath(doc, value)
        return (current as number) + (typeof fieldValue === 'number' ? fieldValue : 0)
      }
      // Handle expression objects like { $multiply: ['$price', '$quantity'] }
      if (typeof value === 'object' && value !== null) {
        const evaluated = this.evaluateExpression(value, doc)
        return (current as number) + (typeof evaluated === 'number' ? evaluated : 0)
      }
    }

    if ('$avg' in accumulator) {
      const fieldValue = this.resolveFieldPath(doc, accumulator.$avg)
      if (typeof fieldValue === 'number') {
        const avgCurrent = current as { sum: number; count: number }
        return { sum: avgCurrent.sum + fieldValue, count: avgCurrent.count + 1 }
      }
      return current
    }

    if ('$min' in accumulator) {
      const fieldValue = this.resolveFieldPath(doc, accumulator.$min)
      return (fieldValue as number) < (current as number) ? fieldValue : current
    }

    if ('$max' in accumulator) {
      const fieldValue = this.resolveFieldPath(doc, accumulator.$max)
      return (fieldValue as number) > (current as number) ? fieldValue : current
    }

    if ('$first' in accumulator) {
      if (current === undefined) {
        return this.resolveFieldPath(doc, accumulator.$first)
      }
      return current
    }

    if ('$last' in accumulator) {
      return this.resolveFieldPath(doc, accumulator.$last)
    }

    if ('$push' in accumulator) {
      const value = accumulator.$push
      if (typeof value === 'string') {
        ;(current as unknown[]).push(this.resolveFieldPath(doc, value))
      } else {
        // Object expression
        const obj: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value)) {
          obj[k] = typeof v === 'string' ? this.resolveFieldPath(doc, v) : v
        }
        ;(current as unknown[]).push(obj)
      }
      return current
    }

    if ('$addToSet' in accumulator) {
      const value = this.resolveFieldPath(doc, accumulator.$addToSet)
      const arr = current as unknown[]
      if (!arr.includes(value)) {
        arr.push(value)
      }
      return current
    }

    if ('$count' in accumulator) {
      return (current as number) + 1
    }

    if ('$stdDevPop' in accumulator || '$stdDevSamp' in accumulator) {
      const field = '$stdDevPop' in accumulator ? accumulator.$stdDevPop : accumulator.$stdDevSamp
      const fieldValue = this.resolveFieldPath(doc, field)
      if (typeof fieldValue === 'number') {
        const values = (current as { values: number[] }).values
        return { values: [...values, fieldValue] }
      }
      return current
    }

    if ('$mergeObjects' in accumulator) {
      const field = accumulator.$mergeObjects
      const fieldValue = this.resolveFieldPath(doc, field)
      if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
        return {
          ...(current as Record<string, unknown>),
          ...(fieldValue as Record<string, unknown>)
        }
      }
      return current
    }

    return current
  }

  private calculateStdDev(values: number[], isSample: boolean): number {
    if (values.length === 0) return 0
    if (isSample && values.length === 1) return 0

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2))
    const variance =
      squaredDiffs.reduce((sum, val) => sum + val, 0) /
      (isSample ? values.length - 1 : values.length)
    return Math.sqrt(variance)
  }

  private project(data: AggregationResult[], projectStage: ProjectStage<T>): AggregationResult[] {
    return data.map(doc => {
      const projected: AggregationResult = {}
      const hasInclusions = Object.values(projectStage).some(v => v === 1)
      const hasExclusions = Object.values(projectStage).some(v => v === 0)

      // Handle _id specially (included by default unless explicitly excluded)
      const includeId = projectStage._id !== 0

      for (const [field, spec] of Object.entries(projectStage)) {
        if (field === '_id') continue // Handle separately

        if (spec === 1) {
          // Include field
          projected[field] = doc[field]
        } else if (spec === 0) {
          // Exclude field (will be handled below)
        } else {
          // Expression
          projected[field] = this.evaluateExpression(spec, doc)
        }
      }

      // Handle _id
      if (includeId && !hasExclusions) {
        projected._id = doc._id
      }

      // If only exclusions, include all other fields
      if (hasExclusions && !hasInclusions) {
        for (const key of Object.keys(doc)) {
          if (!(key in projectStage) || projectStage[key] !== 0) {
            projected[key] = doc[key]
          }
        }
      }

      return projected
    })
  }

  private evaluateExpression(expr: ProjectionExpression, doc: AggregationResult): unknown {
    if (typeof expr === 'string') {
      // Field reference like "$field"
      return this.resolveFieldPath(doc, expr)
    }

    if (typeof expr === 'number' || typeof expr === 'boolean') {
      return expr
    }

    if (typeof expr === 'object' && expr !== null) {
      if ('$concat' in expr) {
        return expr.$concat
          .map(part => this.evaluateExpression(part as ProjectionExpression, doc))
          .join('')
      }

      if ('$toUpper' in expr) {
        const value = this.resolveFieldPath(doc, expr.$toUpper)
        return typeof value === 'string' ? value.toUpperCase() : value
      }

      if ('$toLower' in expr) {
        const value = this.resolveFieldPath(doc, expr.$toLower)
        return typeof value === 'string' ? value.toLowerCase() : value
      }

      if ('$substr' in expr) {
        const [field, start, length] = expr.$substr
        const value = this.resolveFieldPath(doc, field)
        return typeof value === 'string' ? value.substr(start, length) : value
      }

      if ('$cond' in expr) {
        const [condition, trueValue, falseValue] = expr.$cond
        const condResult = this.evaluateCondition(condition, doc)
        return condResult
          ? this.evaluateExpression(trueValue as ProjectionExpression, doc)
          : this.evaluateExpression(falseValue as ProjectionExpression, doc)
      }

      if ('$add' in expr) {
        return expr.$add.reduce((sum: number, operand) => {
          const value = typeof operand === 'string' ? this.resolveFieldPath(doc, operand) : operand
          return sum + (typeof value === 'number' ? value : 0)
        }, 0)
      }

      if ('$subtract' in expr) {
        const [a, b] = expr.$subtract
        const valueA = typeof a === 'string' ? this.resolveFieldPath(doc, a) : a
        const valueB = typeof b === 'string' ? this.resolveFieldPath(doc, b) : b
        return (typeof valueA === 'number' ? valueA : 0) - (typeof valueB === 'number' ? valueB : 0)
      }

      if ('$multiply' in expr) {
        return expr.$multiply.reduce((product: number, operand) => {
          const value = typeof operand === 'string' ? this.resolveFieldPath(doc, operand) : operand
          return product * (typeof value === 'number' ? value : 1)
        }, 1)
      }

      if ('$divide' in expr) {
        const [a, b] = expr.$divide
        const valueA = typeof a === 'string' ? this.resolveFieldPath(doc, a) : a
        const valueB = typeof b === 'string' ? this.resolveFieldPath(doc, b) : b
        if (typeof valueA === 'number' && typeof valueB === 'number' && valueB !== 0) {
          return valueA / valueB
        }
        return null
      }

      if ('$ifNull' in expr) {
        const [field, defaultValue] = expr.$ifNull
        const value = this.resolveFieldPath(doc, field)
        return value !== null && value !== undefined ? value : defaultValue
      }

      if ('$arrayElemAt' in expr) {
        const [field, index] = expr.$arrayElemAt
        // Field might be an expression that evaluates to an array
        const array =
          typeof field === 'string'
            ? this.resolveFieldPath(doc, field)
            : this.evaluateExpression(field as ProjectionExpression, doc)
        if (Array.isArray(array)) {
          const idx = index < 0 ? array.length + index : index
          return array[idx]
        }
        return null
      }

      if ('$size' in expr) {
        // $size might receive an expression that evaluates to an array
        const value =
          typeof expr.$size === 'string'
            ? this.resolveFieldPath(doc, expr.$size)
            : this.evaluateExpression(expr.$size as ProjectionExpression, doc)
        return Array.isArray(value) ? value.length : 0
      }

      // Date extraction operators (using UTC to match MongoDB behavior)
      if ('$year' in expr) {
        const value =
          typeof expr.$year === 'string'
            ? this.resolveFieldPath(doc, expr.$year)
            : typeof expr.$year === 'object'
              ? this.evaluateExpression(expr.$year as ProjectionExpression, doc)
              : expr.$year
        const date = value as Date
        return date instanceof Date ? date.getUTCFullYear() : null
      }

      if ('$month' in expr) {
        const date = this.resolveFieldPath(doc, expr.$month) as Date
        return date instanceof Date ? date.getUTCMonth() + 1 : null // MongoDB months are 1-based
      }

      if ('$dayOfMonth' in expr) {
        const date = this.resolveFieldPath(doc, expr.$dayOfMonth) as Date
        return date instanceof Date ? date.getUTCDate() : null
      }

      if ('$dayOfWeek' in expr) {
        const date = this.resolveFieldPath(doc, expr.$dayOfWeek) as Date
        return date instanceof Date ? date.getUTCDay() + 1 : null // MongoDB: 1=Sunday, 7=Saturday
      }

      if ('$dayOfYear' in expr) {
        const date = this.resolveFieldPath(doc, expr.$dayOfYear) as Date
        if (!(date instanceof Date)) return null
        const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0))
        const diff = date.getTime() - start.getTime()
        const oneDay = 1000 * 60 * 60 * 24
        return Math.floor(diff / oneDay)
      }

      if ('$hour' in expr) {
        const date = this.resolveFieldPath(doc, expr.$hour) as Date
        return date instanceof Date ? date.getUTCHours() : null
      }

      if ('$minute' in expr) {
        const date = this.resolveFieldPath(doc, expr.$minute) as Date
        return date instanceof Date ? date.getUTCMinutes() : null
      }

      if ('$second' in expr) {
        const date = this.resolveFieldPath(doc, expr.$second) as Date
        return date instanceof Date ? date.getUTCSeconds() : null
      }

      if ('$millisecond' in expr) {
        const date = this.resolveFieldPath(doc, expr.$millisecond) as Date
        return date instanceof Date ? date.getUTCMilliseconds() : null
      }

      if ('$week' in expr) {
        const date = this.resolveFieldPath(doc, expr.$week) as Date
        if (!(date instanceof Date)) return null
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
        const days = Math.floor((date.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000))
        return Math.ceil((days + firstDayOfYear.getDay() + 1) / 7)
      }

      if ('$isoWeek' in expr) {
        const date = this.resolveFieldPath(doc, expr.$isoWeek) as Date
        if (!(date instanceof Date)) return null
        return this.getISOWeek(date)
      }

      if ('$isoWeekYear' in expr) {
        const date = this.resolveFieldPath(doc, expr.$isoWeekYear) as Date
        if (!(date instanceof Date)) return null
        return this.getISOWeekYear(date)
      }

      // Date formatting
      if ('$dateToString' in expr) {
        const { date: dateField, format, timezone: _timezone } = expr.$dateToString
        const date = this.resolveFieldPath(doc, dateField) as Date
        if (!(date instanceof Date)) return null

        if (format) {
          return this.formatDate(date, format)
        }
        return date.toISOString()
      }

      // Date parsing
      if ('$dateFromString' in expr) {
        const { dateString } = expr.$dateFromString
        if (typeof dateString === 'string') {
          return new Date(dateString)
        }
        return null
      }

      // Date arithmetic
      if ('$dateAdd' in expr) {
        const { startDate, unit, amount } = expr.$dateAdd
        const date = this.resolveFieldPath(doc, startDate) as Date
        if (!(date instanceof Date)) return null
        return this.addToDate(new Date(date), unit, amount)
      }

      if ('$dateSubtract' in expr) {
        const { startDate, unit, amount } = expr.$dateSubtract
        const date = this.resolveFieldPath(doc, startDate) as Date
        if (!(date instanceof Date)) return null
        return this.addToDate(new Date(date), unit, -amount)
      }

      if ('$dateDiff' in expr) {
        const { startDate: startField, endDate: endField, unit } = expr.$dateDiff
        const start = this.resolveFieldPath(doc, startField) as Date
        const end = this.resolveFieldPath(doc, endField) as Date
        if (!(start instanceof Date) || !(end instanceof Date)) return null
        return this.dateDiff(start, end, unit)
      }

      if ('$dateTrunc' in expr) {
        const { date: dateField, unit, binSize } = expr.$dateTrunc
        const date = this.resolveFieldPath(doc, dateField) as Date
        if (!(date instanceof Date)) return null
        return this.truncateDate(date, unit, binSize)
      }

      // String operators
      if ('$split' in expr) {
        const [input, delimiter] = expr.$split
        // Input might be an expression or a field reference
        const str =
          typeof input === 'string'
            ? this.resolveFieldPath(doc, input)
            : this.evaluateExpression(input as ProjectionExpression, doc)
        if (typeof str !== 'string') return null
        return str.split(delimiter)
      }

      if ('$trim' in expr) {
        const { input, chars } = expr.$trim
        const str = this.resolveFieldPath(doc, input)
        if (typeof str !== 'string') return null
        if (chars) {
          const charsRegex = new RegExp(`^[${chars}]+|[${chars}]+$`, 'g')
          return str.replace(charsRegex, '')
        }
        return str.trim()
      }

      if ('$ltrim' in expr) {
        const { input, chars } = expr.$ltrim
        const str = this.resolveFieldPath(doc, input)
        if (typeof str !== 'string') return null
        if (chars) {
          const charsRegex = new RegExp(`^[${chars}]+`, 'g')
          return str.replace(charsRegex, '')
        }
        return str.trimStart()
      }

      if ('$rtrim' in expr) {
        const { input, chars } = expr.$rtrim
        const str = this.resolveFieldPath(doc, input)
        if (typeof str !== 'string') return null
        if (chars) {
          const charsRegex = new RegExp(`[${chars}]+$`, 'g')
          return str.replace(charsRegex, '')
        }
        return str.trimEnd()
      }

      if ('$replaceOne' in expr) {
        const { input, find, replacement } = expr.$replaceOne
        const str = this.resolveFieldPath(doc, input)
        if (typeof str !== 'string') return null
        return str.replace(find, replacement)
      }

      if ('$replaceAll' in expr) {
        const { input, find, replacement } = expr.$replaceAll
        const str = this.resolveFieldPath(doc, input)
        if (typeof str !== 'string') return null
        return str.replaceAll(find, replacement)
      }

      if ('$strLenCP' in expr) {
        const str = this.resolveFieldPath(doc, expr.$strLenCP)
        if (typeof str !== 'string') return null
        // Use spread operator to count Unicode code points properly
        return [...str].length
      }

      if ('$indexOfCP' in expr) {
        const [input, search, start, end] = expr.$indexOfCP
        const str = this.resolveFieldPath(doc, input)
        if (typeof str !== 'string') return null
        const searchStr =
          typeof search === 'string' ? search : (this.resolveFieldPath(doc, search) as string)
        const startPos = start ?? 0
        const endPos = end ?? str.length
        const index = str.substring(startPos, endPos).indexOf(searchStr)
        return index === -1 ? -1 : startPos + index
      }

      if ('$strcasecmp' in expr) {
        const [str1Field, str2Field] = expr.$strcasecmp
        const str1 = this.resolveFieldPath(doc, str1Field)
        const str2 = this.resolveFieldPath(doc, str2Field)
        if (typeof str1 !== 'string' || typeof str2 !== 'string') return null
        const lower1 = str1.toLowerCase()
        const lower2 = str2.toLowerCase()
        return lower1 < lower2 ? -1 : lower1 > lower2 ? 1 : 0
      }

      // Array operators
      if ('$filter' in expr) {
        const { input, as, cond } = expr.$filter
        const array =
          typeof input === 'string'
            ? this.resolveFieldPath(doc, input)
            : this.evaluateExpression(input as ProjectionExpression, doc)
        if (!Array.isArray(array)) return []

        const varName = as || 'this'
        return array.filter(item => {
          // Create a context with the variable binding
          const itemDoc = { ...doc, [varName]: item }
          return this.evaluateCondition(cond, itemDoc)
        })
      }

      if ('$map' in expr) {
        const { input, as, in: expression } = expr.$map
        const array =
          typeof input === 'string'
            ? this.resolveFieldPath(doc, input)
            : this.evaluateExpression(input as ProjectionExpression, doc)
        if (!Array.isArray(array)) return []

        const varName = as || 'this'
        return array.map(item => {
          // Create a context with the variable binding
          const itemDoc = { ...doc, [varName]: item }
          return typeof expression === 'string'
            ? this.resolveFieldPath(itemDoc, expression)
            : this.evaluateExpression(expression as ProjectionExpression, itemDoc)
        })
      }

      if ('$reduce' in expr) {
        const { input, initialValue, in: expression } = expr.$reduce
        const array =
          typeof input === 'string'
            ? this.resolveFieldPath(doc, input)
            : this.evaluateExpression(input as ProjectionExpression, doc)
        if (!Array.isArray(array)) return initialValue

        return array.reduce((accumulator, item) => {
          // Create a context with $$value (accumulator) and $$this (current item)
          const reduceDoc = { ...doc, $$value: accumulator, $$this: item }
          return typeof expression === 'string'
            ? this.resolveFieldPath(reduceDoc, expression)
            : this.evaluateExpression(expression as ProjectionExpression, reduceDoc)
        }, initialValue)
      }

      if ('$concatArrays' in expr) {
        const arrays = expr.$concatArrays.map(input => {
          const value =
            typeof input === 'string'
              ? this.resolveFieldPath(doc, input)
              : this.evaluateExpression(input as ProjectionExpression, doc)
          return Array.isArray(value) ? value : []
        })
        return arrays.flat()
      }

      if ('$slice' in expr) {
        const [input, ...params] = expr.$slice
        const array =
          typeof input === 'string'
            ? this.resolveFieldPath(doc, input)
            : this.evaluateExpression(input as ProjectionExpression, doc)
        if (!Array.isArray(array)) return []

        if (params.length === 1) {
          const [n] = params
          return n >= 0 ? array.slice(0, n) : array.slice(n)
        } else {
          const [position, n] = params
          return array.slice(position, position + n)
        }
      }

      if ('$zip' in expr) {
        const { inputs, useLongestLength, defaults } = expr.$zip
        const arrays = inputs.map(input => {
          const value =
            typeof input === 'string'
              ? this.resolveFieldPath(doc, input)
              : this.evaluateExpression(input as ProjectionExpression, doc)
          return Array.isArray(value) ? value : []
        })

        const maxLength = Math.max(...arrays.map(arr => arr.length))
        const result: unknown[][] = []

        const length = useLongestLength ? maxLength : Math.min(...arrays.map(arr => arr.length))
        for (let i = 0; i < length; i++) {
          const tuple: unknown[] = []
          for (let j = 0; j < arrays.length; j++) {
            if (i < arrays[j].length) {
              tuple.push(arrays[j][i])
            } else if (defaults && defaults[j] !== undefined) {
              tuple.push(defaults[j])
            } else {
              tuple.push(null)
            }
          }
          result.push(tuple)
        }
        return result
      }

      if ('$reverseArray' in expr) {
        const value =
          typeof expr.$reverseArray === 'string'
            ? this.resolveFieldPath(doc, expr.$reverseArray)
            : this.evaluateExpression(expr.$reverseArray as ProjectionExpression, doc)
        return Array.isArray(value) ? [...value].reverse() : null
      }

      if ('$sortArray' in expr) {
        const { input, sortBy } = expr.$sortArray
        const array =
          typeof input === 'string'
            ? this.resolveFieldPath(doc, input)
            : this.evaluateExpression(input as ProjectionExpression, doc)
        if (!Array.isArray(array)) return []

        const sortedArray = [...array]
        const sortFields = Object.entries(sortBy)
        sortedArray.sort((a, b) => {
          for (const [field, direction] of sortFields) {
            const aVal = (a as Record<string, unknown>)[field] as number | string
            const bVal = (b as Record<string, unknown>)[field] as number | string
            if (aVal < bVal) return direction === 1 ? -1 : 1
            if (aVal > bVal) return direction === 1 ? 1 : -1
          }
          return 0
        })
        return sortedArray
      }

      if ('$in' in expr) {
        const [value, arrayField] = expr.$in
        const array =
          typeof arrayField === 'string'
            ? this.resolveFieldPath(doc, arrayField)
            : this.evaluateExpression(arrayField as ProjectionExpression, doc)
        if (!Array.isArray(array)) return false
        return array.includes(value)
      }

      if ('$indexOfArray' in expr) {
        const [arrayField, searchValue, start, end] = expr.$indexOfArray
        const array =
          typeof arrayField === 'string'
            ? this.resolveFieldPath(doc, arrayField)
            : this.evaluateExpression(arrayField as ProjectionExpression, doc)
        if (!Array.isArray(array)) return null

        const startIdx = start ?? 0
        const endIdx = end ?? array.length
        const sliced = array.slice(startIdx, endIdx)
        const index = sliced.indexOf(searchValue)
        return index === -1 ? -1 : startIdx + index
      }

      // Type conversion operators
      if ('$toString' in expr) {
        const value =
          typeof expr.$toString === 'string'
            ? this.resolveFieldPath(doc, expr.$toString)
            : typeof expr.$toString === 'object'
              ? this.evaluateExpression(expr.$toString as ProjectionExpression, doc)
              : expr.$toString
        if (value === null || value === undefined) return null
        return String(value)
      }

      if ('$toInt' in expr) {
        const value =
          typeof expr.$toInt === 'string'
            ? this.resolveFieldPath(doc, expr.$toInt)
            : typeof expr.$toInt === 'object'
              ? this.evaluateExpression(expr.$toInt as ProjectionExpression, doc)
              : expr.$toInt
        if (value === null || value === undefined) return null
        const num = Number(value)
        return isNaN(num) ? null : Math.trunc(num)
      }

      if ('$toLong' in expr) {
        const value =
          typeof expr.$toLong === 'string'
            ? this.resolveFieldPath(doc, expr.$toLong)
            : typeof expr.$toLong === 'object'
              ? this.evaluateExpression(expr.$toLong as ProjectionExpression, doc)
              : expr.$toLong
        if (value === null || value === undefined) return null
        const num = Number(value)
        return isNaN(num) ? null : Math.trunc(num)
      }

      if ('$toDouble' in expr) {
        const value =
          typeof expr.$toDouble === 'string'
            ? this.resolveFieldPath(doc, expr.$toDouble)
            : typeof expr.$toDouble === 'object'
              ? this.evaluateExpression(expr.$toDouble as ProjectionExpression, doc)
              : expr.$toDouble
        if (value === null || value === undefined) return null
        const num = Number(value)
        return isNaN(num) ? null : num
      }

      if ('$toDecimal' in expr) {
        const value =
          typeof expr.$toDecimal === 'string'
            ? this.resolveFieldPath(doc, expr.$toDecimal)
            : typeof expr.$toDecimal === 'object'
              ? this.evaluateExpression(expr.$toDecimal as ProjectionExpression, doc)
              : expr.$toDecimal
        if (value === null || value === undefined) return null
        const num = Number(value)
        return isNaN(num) ? null : num
      }

      if ('$toDate' in expr) {
        const value =
          typeof expr.$toDate === 'string'
            ? this.resolveFieldPath(doc, expr.$toDate)
            : typeof expr.$toDate === 'object'
              ? this.evaluateExpression(expr.$toDate as ProjectionExpression, doc)
              : expr.$toDate
        if (value === null || value === undefined) return null

        if (value instanceof Date) return value
        if (typeof value === 'number') return new Date(value)
        if (typeof value === 'string') {
          const date = new Date(value)
          return isNaN(date.getTime()) ? null : date
        }
        return null
      }

      if ('$toBool' in expr) {
        const value =
          typeof expr.$toBool === 'string'
            ? this.resolveFieldPath(doc, expr.$toBool)
            : typeof expr.$toBool === 'object'
              ? this.evaluateExpression(expr.$toBool as ProjectionExpression, doc)
              : expr.$toBool
        if (value === null || value === undefined) return null
        return Boolean(value)
      }

      if ('$toObjectId' in expr) {
        const value =
          typeof expr.$toObjectId === 'string'
            ? this.resolveFieldPath(doc, expr.$toObjectId)
            : typeof expr.$toObjectId === 'object'
              ? this.evaluateExpression(expr.$toObjectId as ProjectionExpression, doc)
              : expr.$toObjectId
        if (value === null || value === undefined) return null

        try {
          return new ObjectId(String(value))
        } catch {
          return null
        }
      }

      if ('$convert' in expr) {
        const { input, to, onError, onNull } = expr.$convert
        const value = typeof input === 'string' ? this.resolveFieldPath(doc, input) : input

        if (value === null || value === undefined) {
          return onNull !== undefined ? onNull : null
        }

        try {
          switch (to) {
            case 'string':
              return String(value)
            case 'int':
            case 'long': {
              const intVal = Number(value)
              return isNaN(intVal) ? (onError ?? null) : Math.trunc(intVal)
            }
            case 'double':
            case 'decimal': {
              const doubleVal = Number(value)
              return isNaN(doubleVal) ? (onError ?? null) : doubleVal
            }
            case 'bool':
              return Boolean(value)
            case 'date':
              if (value instanceof Date) return value
              if (typeof value === 'number') return new Date(value)
              if (typeof value === 'string') {
                const date = new Date(value)
                return isNaN(date.getTime()) ? (onError ?? null) : date
              }
              return onError ?? null
            case 'objectId':
              return new ObjectId(String(value))
            default:
              return onError ?? null
          }
        } catch {
          return onError ?? null
        }
      }

      if ('$type' in expr) {
        const value = this.resolveFieldPath(doc, expr.$type)
        if (value === null) return 'null'
        if (value === undefined) return 'undefined'
        if (Array.isArray(value)) return 'array'
        if (value instanceof Date) return 'date'
        if (value instanceof ObjectId) return 'objectId'
        if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double'
        if (typeof value === 'boolean') return 'bool'
        if (typeof value === 'string') return 'string'
        if (typeof value === 'object') return 'object'
        return 'unknown'
      }

      // Conditional operators
      if ('$switch' in expr) {
        const { branches, default: defaultValue } = expr.$switch
        for (const branch of branches) {
          const caseResult = this.evaluateCondition(branch.case, doc)
          if (caseResult) {
            return typeof branch.then === 'string'
              ? this.resolveFieldPath(doc, branch.then)
              : branch.then
          }
        }
        return defaultValue !== undefined ? defaultValue : null
      }

      // Object operators
      if ('$mergeObjects' in expr) {
        const objects = expr.$mergeObjects.map(input => {
          const value =
            typeof input === 'string'
              ? this.resolveFieldPath(doc, input)
              : typeof input === 'object'
                ? this.evaluateExpression(input as ProjectionExpression, doc)
                : input
          return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
        })
        return Object.assign({}, ...objects)
      }

      if ('$objectToArray' in expr) {
        const value =
          typeof expr.$objectToArray === 'string'
            ? this.resolveFieldPath(doc, expr.$objectToArray)
            : this.evaluateExpression(expr.$objectToArray as ProjectionExpression, doc)
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return Object.entries(value).map(([k, v]) => ({ k, v }))
        }
        return []
      }

      if ('$arrayToObject' in expr) {
        const value =
          typeof expr.$arrayToObject === 'string'
            ? this.resolveFieldPath(doc, expr.$arrayToObject)
            : this.evaluateExpression(expr.$arrayToObject as ProjectionExpression, doc)
        if (Array.isArray(value)) {
          const result: Record<string, unknown> = {}
          for (const item of value) {
            if (typeof item === 'object' && item !== null) {
              // Support both {k: key, v: value} and [key, value] formats
              if ('k' in item && 'v' in item) {
                const obj = item as Record<string, unknown>
                result[String(obj.k)] = obj.v
              } else if (Array.isArray(item) && item.length === 2) {
                result[String(item[0])] = item[1]
              }
            }
          }
          return result
        }
        return {}
      }
    }

    return expr
  }

  // Helper methods for date operations
  private getISOWeek(date: Date): number {
    const target = new Date(date.valueOf())
    const dayNr = (date.getDay() + 6) % 7
    target.setDate(target.getDate() - dayNr + 3)
    const firstThursday = target.valueOf()
    target.setMonth(0, 1)
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7))
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
  }

  private getISOWeekYear(date: Date): number {
    const target = new Date(date.valueOf())
    target.setDate(target.getDate() + 3 - ((date.getDay() + 6) % 7))
    return target.getFullYear()
  }

  private formatDate(date: Date, format: string): string {
    // MongoDB date format specifiers (using UTC)
    const replacements: Record<string, string> = {
      '%Y': date.getUTCFullYear().toString(),
      '%m': String(date.getUTCMonth() + 1).padStart(2, '0'),
      '%d': String(date.getUTCDate()).padStart(2, '0'),
      '%H': String(date.getUTCHours()).padStart(2, '0'),
      '%M': String(date.getUTCMinutes()).padStart(2, '0'),
      '%S': String(date.getUTCSeconds()).padStart(2, '0'),
      '%L': String(date.getUTCMilliseconds()).padStart(3, '0')
    }

    let result = format
    for (const [spec, value] of Object.entries(replacements)) {
      result = result.replace(spec, value)
    }
    return result
  }

  private addToDate(date: Date, unit: string, amount: number): Date {
    const result = new Date(date)
    switch (unit) {
      case 'year':
        result.setUTCFullYear(result.getUTCFullYear() + amount)
        break
      case 'month':
        result.setUTCMonth(result.getUTCMonth() + amount)
        break
      case 'day':
        result.setUTCDate(result.getUTCDate() + amount)
        break
      case 'hour':
        result.setUTCHours(result.getUTCHours() + amount)
        break
      case 'minute':
        result.setUTCMinutes(result.getUTCMinutes() + amount)
        break
      case 'second':
        result.setUTCSeconds(result.getUTCSeconds() + amount)
        break
      case 'millisecond':
        result.setUTCMilliseconds(result.getUTCMilliseconds() + amount)
        break
    }
    return result
  }

  private dateDiff(start: Date, end: Date, unit: string): number {
    const diffMs = end.getTime() - start.getTime()
    switch (unit) {
      case 'year':
        return end.getUTCFullYear() - start.getUTCFullYear()
      case 'month':
        return (
          (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
          (end.getUTCMonth() - start.getUTCMonth())
        )
      case 'day':
        return Math.floor(diffMs / (1000 * 60 * 60 * 24))
      case 'hour':
        return Math.floor(diffMs / (1000 * 60 * 60))
      case 'minute':
        return Math.floor(diffMs / (1000 * 60))
      case 'second':
        return Math.floor(diffMs / 1000)
      case 'millisecond':
        return diffMs
      default:
        return 0
    }
  }

  private truncateDate(date: Date, unit: string, _binSize: number = 1): Date {
    const result = new Date(date)
    switch (unit) {
      case 'year':
        result.setUTCMonth(0)
        result.setUTCDate(1)
        result.setUTCHours(0, 0, 0, 0)
        break
      case 'month':
        result.setUTCDate(1)
        result.setUTCHours(0, 0, 0, 0)
        break
      case 'day':
        result.setUTCHours(0, 0, 0, 0)
        break
      case 'hour':
        result.setUTCMinutes(0, 0, 0)
        break
      case 'minute':
        result.setUTCSeconds(0, 0)
        break
      case 'second':
        result.setUTCMilliseconds(0)
        break
    }
    return result
  }

  private evaluateCondition(condition: unknown, doc: AggregationResult): boolean {
    if (typeof condition === 'boolean') return condition
    if (typeof condition === 'string') {
      return !!this.resolveFieldPath(doc, condition)
    }
    // Could extend this to support more complex conditions
    return !!condition
  }

  private async lookup(
    data: AggregationResult[],
    lookupStage: LookupStage
  ): Promise<AggregationResult[]> {
    const { from, localField, foreignField, as } = lookupStage

    // Get referenced model
    if (!this.database) {
      throw new Error('Database reference required for $lookup operation')
    }

    const foreignModel = this.database.getModel(from)
    if (!foreignModel) {
      throw new Error(`Model ${from} not found for $lookup`)
    }

    // Get all foreign documents
    const foreignDocs = await foreignModel.find({})

    // Build index for foreign documents
    const foreignIndex = new Map<string, AggregationResult[]>()
    for (const foreignDoc of foreignDocs) {
      let key = foreignDoc[foreignField]
      if (key !== undefined && key !== null) {
        // Convert ObjectId to string for consistent comparison
        const keyStr = typeof key === 'object' && key.toString ? key.toString() : String(key)
        if (!foreignIndex.has(keyStr)) {
          foreignIndex.set(keyStr, [])
        }
        foreignIndex.get(keyStr)!.push(foreignDoc)
      }
    }

    // Perform lookup for each document
    return data.map(doc => {
      let localValue = doc[localField]
      let localValueStr: string | undefined
      if (localValue !== undefined && localValue !== null) {
        // Convert ObjectId to string for consistent comparison
        localValueStr =
          typeof localValue === 'object' && (localValue as { toString?: () => string }).toString
            ? (localValue as { toString: () => string }).toString()
            : String(localValue)
      }
      const matches = localValueStr ? foreignIndex.get(localValueStr) || [] : []
      return { ...doc, [as]: matches }
    })
  }

  private unwind(data: AggregationResult[], unwindStage: UnwindStage): AggregationResult[] {
    const path = typeof unwindStage === 'string' ? unwindStage : unwindStage.path
    const preserveNullAndEmptyArrays =
      typeof unwindStage === 'object' ? unwindStage.preserveNullAndEmptyArrays : false
    const includeArrayIndex =
      typeof unwindStage === 'object' ? unwindStage.includeArrayIndex : undefined

    // Remove $ prefix from path
    const fieldPath = path.startsWith('$') ? path.slice(1) : String(path)

    const result: AggregationResult[] = []

    for (const doc of data) {
      const array = this.resolveFieldPath(doc, path) as unknown[]

      if (Array.isArray(array) && array.length > 0) {
        // Unwind array
        array.forEach((item, index) => {
          const unwound = { ...doc, [fieldPath]: item }
          if (includeArrayIndex) {
            unwound[includeArrayIndex] = index
          }
          result.push(unwound)
        })
      } else if (preserveNullAndEmptyArrays) {
        // Keep document with null/empty array
        const unwound = { ...doc, [fieldPath]: null }
        if (includeArrayIndex) {
          unwound[includeArrayIndex] = null
        }
        result.push(unwound)
      }
      // Otherwise skip document
    }

    return result
  }

  private sort(data: AggregationResult[], sortStage: SortStage): AggregationResult[] {
    const sortKeys = Object.entries(sortStage)

    return [...data].sort((a, b) => {
      for (const [field, order] of sortKeys) {
        const aVal = a[field] as number | string
        const bVal = b[field] as number | string

        let comparison = 0
        if (aVal < bVal) comparison = -1
        else if (aVal > bVal) comparison = 1

        if (comparison !== 0) {
          return order === 1 ? comparison : -comparison
        }
      }
      return 0
    })
  }

  private addFields(
    data: AggregationResult[],
    fields: Record<string, unknown>
  ): AggregationResult[] {
    return data.map(doc => {
      const added = { ...doc }
      for (const [field, expr] of Object.entries(fields)) {
        // Support both simple field refs and complex expressions
        if (typeof expr === 'object' && expr !== null && !Array.isArray(expr)) {
          added[field] = this.evaluateExpression(expr as ProjectionExpression, doc)
        } else {
          added[field] = expr
        }
      }
      return added
    })
  }

  private replaceRoot(
    data: AggregationResult[],
    replaceStage: ReplaceRootStage
  ): AggregationResult[] {
    const { newRoot } = replaceStage

    return data.map(doc => {
      if (typeof newRoot === 'string') {
        // Field reference
        return (
          (this.resolveFieldPath(doc, newRoot) as AggregationResult) || ({} as AggregationResult)
        )
      } else {
        // Object expression
        const result: AggregationResult = {}
        for (const [key, value] of Object.entries(newRoot)) {
          result[key] = this.evaluateExpression(value as ProjectionExpression, doc)
        }
        return result
      }
    })
  }

  private sample(data: AggregationResult[], size: number): AggregationResult[] {
    if (size >= data.length) return [...data]

    const result: AggregationResult[] = []
    const indices = new Set<number>()

    while (indices.size < size) {
      const index = Math.floor(Math.random() * data.length)
      if (!indices.has(index)) {
        indices.add(index)
        result.push(data[index])
      }
    }

    return result
  }

  // Helper to resolve field paths like "$field" or "$nested.field" or "$$variable"
  private resolveFieldPath(doc: AggregationResult, path: string): unknown {
    if (!path.startsWith('$')) return path

    // Handle $$variable references (like $$value, $$this)
    if (path.startsWith('$$')) {
      const varName = path.slice(2)
      return (doc as Record<string, unknown>)[`$$${varName}`] ?? doc[varName]
    }

    const fieldPath = path.slice(1) // Remove $
    const parts = fieldPath.split('.')

    let value: unknown = doc
    for (const part of parts) {
      if (value === null || value === undefined) return undefined
      value = (value as Record<string, unknown>)[part]
    }

    return value
  }

  private bucket(data: AggregationResult[], bucketStage: BucketStage): AggregationResult[] {
    const { groupBy, boundaries, default: defaultBucket, output } = bucketStage

    // Initialize buckets
    const buckets = new Map<string, AggregationResult[]>()
    for (let i = 0; i < boundaries.length - 1; i++) {
      const key = JSON.stringify({ min: boundaries[i], max: boundaries[i + 1] })
      buckets.set(key, [])
    }
    if (defaultBucket) {
      buckets.set(defaultBucket, [])
    }

    // Categorize documents into buckets
    for (const doc of data) {
      const value = this.resolveFieldPath(doc, groupBy)
      let assigned = false

      // Find appropriate bucket
      for (let i = 0; i < boundaries.length - 1; i++) {
        const min = boundaries[i] as number
        const max = boundaries[i + 1] as number

        if ((value as number) >= min && (value as number) < max) {
          const key = JSON.stringify({ min, max })
          buckets.get(key)!.push(doc)
          assigned = true
          break
        }
      }

      // Assign to default bucket if not assigned
      if (!assigned && defaultBucket) {
        buckets.get(defaultBucket)!.push(doc)
      }
    }

    // Build result documents
    const results: AggregationResult[] = []
    for (let i = 0; i < boundaries.length - 1; i++) {
      const min = boundaries[i]
      const max = boundaries[i + 1]
      const key = JSON.stringify({ min, max })
      const bucketDocs = buckets.get(key)!

      const resultDoc: AggregationResult = {
        _id: min,
        count: bucketDocs.length
      }

      // Apply output accumulators
      if (output) {
        for (const [field, accumulator] of Object.entries(output)) {
          let accValue = this.initAccumulator(accumulator as AccumulatorExpression)
          for (const doc of bucketDocs) {
            accValue = this.applyAccumulator(accValue, accumulator as AccumulatorExpression, doc)
          }

          // Finalize $avg accumulator
          if (typeof accumulator === 'object' && accumulator !== null && '$avg' in accumulator) {
            const avgData = accValue as { sum: number; count: number }
            resultDoc[field] = avgData.count > 0 ? avgData.sum / avgData.count : null
          } else {
            resultDoc[field] = accValue
          }
        }
      }

      results.push(resultDoc)
    }

    // Add default bucket if it has documents
    if (defaultBucket && buckets.get(defaultBucket)!.length > 0) {
      const bucketDocs = buckets.get(defaultBucket)!
      const resultDoc: AggregationResult = {
        _id: defaultBucket,
        count: bucketDocs.length
      }

      if (output) {
        for (const [field, accumulator] of Object.entries(output)) {
          let accValue = this.initAccumulator(accumulator as AccumulatorExpression)
          for (const doc of bucketDocs) {
            accValue = this.applyAccumulator(accValue, accumulator as AccumulatorExpression, doc)
          }

          // Finalize $avg accumulator
          if (typeof accumulator === 'object' && accumulator !== null && '$avg' in accumulator) {
            const avgData = accValue as { sum: number; count: number }
            resultDoc[field] = avgData.count > 0 ? avgData.sum / avgData.count : null
          } else {
            resultDoc[field] = accValue
          }
        }
      }

      results.push(resultDoc)
    }

    return results
  }

  private bucketAuto(data: AggregationResult[], bucketStage: BucketAutoStage): AggregationResult[] {
    const { groupBy, buckets: numBuckets, output, granularity } = bucketStage

    // Extract and sort values
    const values = data
      .map(doc => ({
        value: this.resolveFieldPath(doc, groupBy) as number,
        doc
      }))
      .filter(item => item.value !== null && item.value !== undefined)

    if (values.length === 0) return []

    values.sort((a, b) => (a.value as number) - (b.value as number))

    // Calculate bucket boundaries
    const boundaries: number[] = []
    if (granularity) {
      // Use granularity to determine boundaries
      boundaries.push(
        ...this.calculateGranularBoundaries(
          values.map(v => v.value as number),
          numBuckets,
          granularity
        )
      )
    } else {
      // Even distribution
      const bucketSize = Math.ceil(values.length / numBuckets)
      for (let i = 0; i < numBuckets; i++) {
        const index = Math.min(i * bucketSize, values.length - 1)
        boundaries.push(values[index].value as number)
      }
      boundaries.push((values[values.length - 1].value as number) + 0.000001) // Add upper bound
    }

    // Create buckets
    const bucketResults: AggregationResult[] = []
    for (let i = 0; i < boundaries.length - 1; i++) {
      const min = boundaries[i]
      const max = boundaries[i + 1]

      const bucketDocs = values
        .filter(item => (item.value as number) >= min && (item.value as number) < max)
        .map(item => item.doc)

      const resultDoc: AggregationResult = {
        _id: { min, max },
        count: bucketDocs.length
      }

      // Apply output accumulators
      if (output) {
        for (const [field, accumulator] of Object.entries(output)) {
          let accValue = this.initAccumulator(accumulator as AccumulatorExpression)
          for (const doc of bucketDocs) {
            accValue = this.applyAccumulator(accValue, accumulator as AccumulatorExpression, doc)
          }

          // Finalize $avg accumulator
          if (typeof accumulator === 'object' && accumulator !== null && '$avg' in accumulator) {
            const avgData = accValue as { sum: number; count: number }
            resultDoc[field] = avgData.count > 0 ? avgData.sum / avgData.count : null
          } else {
            resultDoc[field] = accValue
          }
        }
      }

      bucketResults.push(resultDoc)
    }

    return bucketResults
  }

  private calculateGranularBoundaries(
    values: number[],
    numBuckets: number,
    _granularity: string
  ): number[] {
    // Simplified granularity calculation - in production this would follow Renard series
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min
    const step = range / numBuckets

    const boundaries: number[] = []
    for (let i = 0; i <= numBuckets; i++) {
      boundaries.push(min + step * i)
    }
    return boundaries
  }

  private async facet(
    data: AggregationResult[],
    facetStage: FacetStage
  ): Promise<AggregationResult[]> {
    const result: AggregationResult = {}

    // Execute each facet pipeline in parallel
    const facetPromises = Object.entries(facetStage).map(async ([facetName, pipeline]) => {
      // Clone the data for each facet
      const facetData = [...data]

      // Execute the sub-pipeline
      let facetResults = facetData
      for (const stage of pipeline) {
        facetResults = await this.executeStage(facetResults, stage as AggregationStage<T>)
      }

      return { facetName, results: facetResults }
    })

    const facetResultsArray = await Promise.all(facetPromises)

    // Combine results
    for (const { facetName, results } of facetResultsArray) {
      result[facetName] = results
    }

    return [result]
  }

  private async out(
    data: AggregationResult[],
    outSpec: string | { db?: string; coll: string }
  ): Promise<AggregationResult[]> {
    if (!this.database) {
      throw new Error('Database reference required for $out operation')
    }

    const collName = typeof outSpec === 'string' ? outSpec : outSpec.coll
    const targetModel = this.database.getModel(collName)

    if (!targetModel) {
      throw new Error(`Collection ${collName} not found for $out`)
    }

    // $out replaces the entire collection
    await targetModel.deleteMany({})
    if (data.length > 0) {
      await targetModel.insertMany(data as T[])
    }

    // Per MongoDB spec, $out returns empty array
    return []
  }

  private async merge(
    data: AggregationResult[],
    mergeSpec: MergeStage
  ): Promise<AggregationResult[]> {
    if (!this.database) {
      throw new Error('Database reference required for $merge operation')
    }

    const collName = typeof mergeSpec.into === 'string' ? mergeSpec.into : mergeSpec.into.coll
    const targetModel = this.database.getModel(collName)

    if (!targetModel) {
      throw new Error(`Collection ${collName} not found for $merge`)
    }

    const onFields = Array.isArray(mergeSpec.on) ? mergeSpec.on : [mergeSpec.on || '_id']
    const whenMatched = mergeSpec.whenMatched || 'merge'
    const whenNotMatched = mergeSpec.whenNotMatched || 'insert'

    for (const doc of data) {
      // Build match query based on 'on' fields
      const matchQuery: Record<string, unknown> = {}
      for (const field of onFields) {
        matchQuery[field] = doc[field]
      }

      // Find existing document
      const existing = await targetModel.findOne(matchQuery as Query<T>)

      if (existing) {
        // Handle whenMatched
        switch (whenMatched) {
          case 'replace':
            await targetModel.updateOne(matchQuery as Query<T>, doc as Partial<T>)
            break
          case 'merge':
            // Merge new fields into existing
            await targetModel.updateOne(matchQuery as Query<T>, { ...existing, ...doc } as any)
            break
          case 'keepExisting':
            // Do nothing
            break
          case 'fail':
            throw new Error(`Document with ${onFields.join(', ')} already exists`)
          case 'pipeline':
            // TODO: Execute pipeline on matched document
            throw new Error('$merge with whenMatched:pipeline not yet implemented')
        }
      } else {
        // Handle whenNotMatched
        switch (whenNotMatched) {
          case 'insert':
            await targetModel.create(doc as T)
            break
          case 'discard':
            // Do nothing
            break
          case 'fail':
            throw new Error(`Document with ${onFields.join(', ')} not found`)
        }
      }
    }

    // Per MongoDB spec, $merge returns empty array
    return []
  }
}
