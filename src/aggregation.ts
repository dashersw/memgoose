import type { Query } from './model'

// Aggregation pipeline is an array of stages
export type AggregationPipeline<T extends object = Record<string, unknown>> = AggregationStage<T>[]

// All supported aggregation stages
export type AggregationStage<T extends object = Record<string, unknown>> =
  | { $match: Query<T> }
  | { $group: GroupStage<T> }
  | { $project: ProjectStage<T> }
  | { $lookup: LookupStage }
  | { $unwind: UnwindStage }
  | { $sort: SortStage }
  | { $limit: number }
  | { $skip: number }
  | { $count: string }
  | { $addFields: Record<string, unknown> }
  | { $replaceRoot: ReplaceRootStage }
  | { $sample: { size: number } }
  | { $bucket: BucketStage }
  | { $bucketAuto: BucketAutoStage }
  | { $facet: FacetStage<T> }
  | { $out: string | { db?: string; coll: string } }
  | { $merge: MergeStage }

// Group stage configuration
export type GroupStage<_T = Record<string, unknown>> = {
  _id: string | Record<string, string> | null
} & {
  [field: string]: AccumulatorExpression | string
}

// Accumulator expressions for $group
export type AccumulatorExpression =
  | { $sum: number | string | 1 }
  | { $avg: string }
  | { $min: string }
  | { $max: string }
  | { $first: string }
  | { $last: string }
  | { $push: string | Record<string, unknown> }
  | { $addToSet: string }
  | { $count: Record<string, never> }
  | { $stdDevPop: string }
  | { $stdDevSamp: string }
  | { $mergeObjects: string }

// Project stage for field selection and transformation
export type ProjectStage<T = Record<string, unknown>> = {
  [K in keyof T]?: 0 | 1 | ProjectionExpression
} & {
  [field: string]: 0 | 1 | ProjectionExpression
}

// Projection expressions for computed fields
export type ProjectionExpression =
  | { $concat: (string | ProjectionExpression)[] }
  | { $toUpper: string }
  | { $toLower: string }
  | { $substr: [string, number, number] }
  | { $cond: [unknown, unknown, unknown] }
  | { $add: (number | string)[] }
  | { $subtract: [number | string, number | string] }
  | { $multiply: (number | string)[] }
  | { $divide: [number | string, number | string] }
  | { $ifNull: [string, unknown] }
  | { $arrayElemAt: [string | ProjectionExpression, number] }
  | { $size: string | ProjectionExpression }
  // Date extraction operators
  | { $year: string }
  | { $month: string }
  | { $dayOfMonth: string }
  | { $dayOfWeek: string }
  | { $dayOfYear: string }
  | { $hour: string }
  | { $minute: string }
  | { $second: string }
  | { $millisecond: string }
  | { $week: string }
  | { $isoWeek: string }
  | { $isoWeekYear: string }
  // Date formatting and parsing
  | { $dateToString: { date: string; format?: string; timezone?: string } }
  | { $dateFromString: { dateString: string; format?: string; timezone?: string } }
  // Date arithmetic
  | { $dateAdd: { startDate: string; unit: string; amount: number } }
  | { $dateSubtract: { startDate: string; unit: string; amount: number } }
  | { $dateDiff: { startDate: string; endDate: string; unit: string } }
  | { $dateTrunc: { date: string; unit: string; binSize?: number } }
  // String operators
  | { $split: [string | ProjectionExpression, string] }
  | { $trim: { input: string; chars?: string } }
  | { $ltrim: { input: string; chars?: string } }
  | { $rtrim: { input: string; chars?: string } }
  | { $replaceOne: { input: string; find: string; replacement: string } }
  | { $replaceAll: { input: string; find: string; replacement: string } }
  | { $strLenCP: string }
  | { $indexOfCP: [string, string, number?, number?] }
  | { $strcasecmp: [string, string] }
  // Array operators
  | { $filter: { input: string | ProjectionExpression; as?: string; cond: unknown } }
  | { $map: { input: string | ProjectionExpression; as?: string; in: unknown } }
  | { $reduce: { input: string | ProjectionExpression; initialValue: unknown; in: unknown } }
  | { $concatArrays: (string | ProjectionExpression)[] }
  | {
      $slice:
        | [string | ProjectionExpression, number]
        | [string | ProjectionExpression, number, number]
    }
  | {
      $zip: {
        inputs: (string | ProjectionExpression)[]
        useLongestLength?: boolean
        defaults?: unknown[]
      }
    }
  | { $reverseArray: string | ProjectionExpression }
  | { $sortArray: { input: string | ProjectionExpression; sortBy: Record<string, 1 | -1> } }
  | { $in: [unknown, string | ProjectionExpression] }
  | { $indexOfArray: [string | ProjectionExpression, unknown, number?, number?] }
  // Type conversion operators
  | { $toString: unknown }
  | { $toInt: unknown }
  | { $toLong: unknown }
  | { $toDouble: unknown }
  | { $toDecimal: unknown }
  | { $toDate: unknown }
  | { $toBool: unknown }
  | { $toObjectId: unknown }
  | { $convert: { input: unknown; to: string; onError?: unknown; onNull?: unknown } }
  | { $type: string }
  // Conditional operators
  | { $switch: { branches: Array<{ case: unknown; then: unknown }>; default?: unknown } }
  // Object operators
  | { $mergeObjects: (string | ProjectionExpression)[] }
  | { $objectToArray: string | ProjectionExpression }
  | { $arrayToObject: string | ProjectionExpression }
  | string
  | number
  | boolean

// Lookup stage for joins
export type LookupStage = {
  from: string
  localField: string
  foreignField: string
  as: string
}

// Unwind stage for array flattening
export type UnwindStage =
  | string // Simple path like "$items"
  | {
      path: string
      preserveNullAndEmptyArrays?: boolean
      includeArrayIndex?: string
    }

// Sort stage
export type SortStage = Record<string, 1 | -1>

// Replace root stage
export type ReplaceRootStage = {
  newRoot: string | Record<string, unknown>
}

// Bucket stage for categorization
export type BucketStage = {
  groupBy: string
  boundaries: unknown[]
  default?: string
  output?: Record<string, AccumulatorExpression>
}

// Bucket auto stage for automatic bucketing
export type BucketAutoStage = {
  groupBy: string
  buckets: number
  output?: Record<string, AccumulatorExpression>
  granularity?:
    | 'R5'
    | 'R10'
    | 'R20'
    | 'R40'
    | 'R80'
    | '1-2-5'
    | 'E6'
    | 'E12'
    | 'E24'
    | 'E48'
    | 'E96'
    | 'E192'
    | 'POWERSOF2'
}

// Facet stage for multi-pipeline aggregation
export type FacetStage<T extends object = Record<string, unknown>> = Record<
  string,
  AggregationStage<T>[]
>

// Merge stage for upserting results into a collection
export type MergeStage = {
  into: string | { db?: string; coll: string }
  on?: string | string[]
  whenMatched?: 'replace' | 'keepExisting' | 'merge' | 'fail' | 'pipeline'
  whenNotMatched?: 'insert' | 'discard' | 'fail'
  let?: Record<string, unknown>
  pipeline?: AggregationStage[]
}
