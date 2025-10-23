import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model, ObjectId } from '../index'

describe('Aggregation Type Conversion Operators', () => {
  interface DataDocInterface {
    stringValue: string
    numberValue: number
    boolValue: boolean
    dateValue: Date
    objectIdValue: ObjectId
    nullValue: null
  }

  const dataSchema = new Schema<DataDocInterface>({
    stringValue: String,
    numberValue: Number,
    boolValue: Boolean,
    dateValue: Date,
    objectIdValue: ObjectId,
    nullValue: null
  })

  const DataDoc = model<DataDocInterface>('DataDoc', dataSchema)

  beforeEach(async () => {
    await DataDoc.deleteMany({})
  })

  describe('$toString operator', () => {
    it('should convert various types to string', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'hello',
          numberValue: 42,
          boolValue: true,
          dateValue: new Date('2024-01-01'),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            fromNumber: { $toString: '$numberValue' },
            fromBool: { $toString: '$boolValue' },
            fromString: { $toString: '$stringValue' }
          }
        }
      ])

      assert.strictEqual(results[0].fromNumber, '42')
      assert.strictEqual(results[0].fromBool, 'true')
      assert.strictEqual(results[0].fromString, 'hello')
    })

    it('should return null for null values', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            fromNull: { $toString: '$nullValue' }
          }
        }
      ])

      assert.strictEqual(results[0].fromNull, null)
    })
  })

  describe('$toInt and $toLong operators', () => {
    it('should convert strings to integers', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '123',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            intValue: { $toInt: '$stringValue' },
            longValue: { $toLong: '$stringValue' }
          }
        }
      ])

      assert.strictEqual(results[0].intValue, 123)
      assert.strictEqual(results[0].longValue, 123)
    })

    it('should truncate decimals', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '123.456',
          numberValue: 78.9,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            fromString: { $toInt: '$stringValue' },
            fromNumber: { $toInt: '$numberValue' }
          }
        }
      ])

      assert.strictEqual(results[0].fromString, 123)
      assert.strictEqual(results[0].fromNumber, 78)
    })

    it('should return null for invalid conversions', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'not a number',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            invalid: { $toInt: '$stringValue' }
          }
        }
      ])

      assert.strictEqual(results[0].invalid, null)
    })
  })

  describe('$toDouble and $toDecimal operators', () => {
    it('should convert to floating point numbers', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '123.456',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            doubleValue: { $toDouble: '$stringValue' },
            decimalValue: { $toDecimal: '$stringValue' }
          }
        }
      ])

      assert.strictEqual(results[0].doubleValue, 123.456)
      assert.strictEqual(results[0].decimalValue, 123.456)
    })
  })

  describe('$toDate operator', () => {
    it('should convert timestamp to date', async () => {
      const timestamp = 1704067200000 // 2024-01-01 00:00:00 UTC
      await DataDoc.insertMany([
        {
          stringValue: '',
          numberValue: timestamp,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            dateFromNumber: { $toDate: '$numberValue' }
          }
        }
      ])

      assert.ok(results[0].dateFromNumber instanceof Date)
      assert.strictEqual((results[0].dateFromNumber as Date).getTime(), timestamp)
    })

    it('should convert string to date', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '2024-01-01T00:00:00.000Z',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            dateFromString: { $toDate: '$stringValue' }
          }
        }
      ])

      assert.ok(results[0].dateFromString instanceof Date)
    })

    it('should return null for invalid date strings', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'not a date',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            invalid: { $toDate: '$stringValue' }
          }
        }
      ])

      assert.strictEqual(results[0].invalid, null)
    })
  })

  describe('$toBool operator', () => {
    it('should convert values to boolean', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'hello',
          numberValue: 1,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        },
        {
          stringValue: '',
          numberValue: 0,
          boolValue: true,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            fromString: { $toBool: '$stringValue' },
            fromNumber: { $toBool: '$numberValue' }
          }
        }
      ])

      assert.strictEqual(results[0].fromString, true) // non-empty string
      assert.strictEqual(results[0].fromNumber, true) // 1
      assert.strictEqual(results[1].fromString, false) // empty string
      assert.strictEqual(results[1].fromNumber, false) // 0
    })
  })

  describe('$toObjectId operator', () => {
    it('should convert string to ObjectId', async () => {
      const oid = new ObjectId()
      await DataDoc.insertMany([
        {
          stringValue: oid.toString(),
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            converted: { $toObjectId: '$stringValue' }
          }
        }
      ])

      assert.ok(results[0].converted instanceof ObjectId)
      assert.strictEqual(results[0].converted.toString(), oid.toString())
    })

    it('should return null for invalid ObjectId strings', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'not an objectid',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            invalid: { $toObjectId: '$stringValue' }
          }
        }
      ])

      assert.strictEqual(results[0].invalid, null)
    })
  })

  describe('$convert operator', () => {
    it('should convert with explicit type', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '42',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            toInt: { $convert: { input: '$stringValue', to: 'int' } },
            toString: { $convert: { input: '$stringValue', to: 'string' } }
          }
        }
      ])

      assert.strictEqual(results[0].toInt, 42)
      assert.strictEqual(results[0].toString, '42')
    })

    it('should use onError fallback', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'not a number',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            withError: { $convert: { input: '$stringValue', to: 'int', onError: -1 } }
          }
        }
      ])

      assert.strictEqual(results[0].withError, -1)
    })

    it('should use onNull fallback', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            withNull: { $convert: { input: '$nullValue', to: 'int', onNull: 0 } }
          }
        }
      ])

      assert.strictEqual(results[0].withNull, 0)
    })

    it('should convert to double and decimal', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '123.456',
          numberValue: 78,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            toDouble: { $convert: { input: '$stringValue', to: 'double' } },
            toDecimal: { $convert: { input: '$numberValue', to: 'decimal' } }
          }
        }
      ])

      assert.strictEqual(results[0].toDouble, 123.456)
      assert.strictEqual(results[0].toDecimal, 78)
    })

    it('should convert to bool', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'true',
          numberValue: 1,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            fromString: { $convert: { input: '$stringValue', to: 'bool' } },
            fromNumber: { $convert: { input: '$numberValue', to: 'bool' } }
          }
        }
      ])

      assert.strictEqual(results[0].fromString, true)
      assert.strictEqual(results[0].fromNumber, true)
    })

    it('should convert to date', async () => {
      const timestamp = 1704067200000 // 2024-01-01
      await DataDoc.insertMany([
        {
          stringValue: '2024-06-15',
          numberValue: timestamp,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            fromString: { $convert: { input: '$stringValue', to: 'date' } },
            fromNumber: { $convert: { input: '$numberValue', to: 'date' } }
          }
        }
      ])

      assert.ok(results[0].fromString instanceof Date)
      assert.ok(results[0].fromNumber instanceof Date)
      assert.strictEqual((results[0].fromNumber as Date).getTime(), timestamp)
    })

    it('should convert to objectId', async () => {
      const oid = new ObjectId()
      await DataDoc.insertMany([
        {
          stringValue: oid.toString(),
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            converted: { $convert: { input: '$stringValue', to: 'objectId' } }
          }
        }
      ])

      assert.ok(results[0].converted instanceof ObjectId)
      assert.strictEqual(results[0].converted.toString(), oid.toString())
    })

    it('should handle invalid type conversion with onError', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'invalid',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            withFallback: {
              $convert: { input: '$stringValue', to: 'invalidType', onError: 'error' }
            }
          }
        }
      ])

      assert.strictEqual(results[0].withFallback, 'error')
    })

    it('should handle default case for unknown types', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'test',
          numberValue: 42,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            unknown: { $convert: { input: '$stringValue', to: 'unknownType' } }
          }
        }
      ])

      // Should return null for unknown types
      assert.strictEqual(results[0].unknown, null)
    })
  })

  describe('$type operator', () => {
    it('should return type name for various types', async () => {
      await DataDoc.insertMany([
        {
          stringValue: 'hello',
          numberValue: 42,
          boolValue: true,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        },
        {
          stringValue: '',
          numberValue: 3.14,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            typeString: { $type: '$stringValue' },
            typeNumber: { $type: '$numberValue' },
            typeBool: { $type: '$boolValue' },
            typeDate: { $type: '$dateValue' },
            typeObjectId: { $type: '$objectIdValue' },
            typeNull: { $type: '$nullValue' }
          }
        }
      ])

      assert.strictEqual(results[0].typeString, 'string')
      assert.strictEqual(results[0].typeNumber, 'int')
      assert.strictEqual(results[0].typeBool, 'bool')
      assert.strictEqual(results[0].typeDate, 'date')
      assert.strictEqual(results[0].typeObjectId, 'objectId')
      assert.strictEqual(results[0].typeNull, 'null')

      // Second document has decimal
      assert.strictEqual(results[1].typeNumber, 'double')
    })
  })

  describe('Real-world type conversion scenarios', () => {
    it('should clean and convert user input', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '  123  ',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            cleaned: {
              $toInt: {
                $trim: { input: '$stringValue' }
              }
            }
          }
        }
      ])

      assert.strictEqual(results[0].cleaned, 123)
    })

    it('should handle mixed type data', async () => {
      await DataDoc.insertMany([
        {
          stringValue: '100',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        },
        {
          stringValue: '200',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        },
        {
          stringValue: 'invalid',
          numberValue: 0,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            value: { $convert: { input: '$stringValue', to: 'int', onError: 0 } }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$value' }
          }
        }
      ])

      assert.strictEqual(results[0].total, 300) // 100 + 200 + 0 (invalid)
    })

    it('should format dates from timestamps', async () => {
      const timestamp = 1704067200000 // 2024-01-01
      await DataDoc.insertMany([
        {
          stringValue: '',
          numberValue: timestamp,
          boolValue: false,
          dateValue: new Date(),
          objectIdValue: new ObjectId(),
          nullValue: null
        }
      ])

      const results = await DataDoc.aggregate([
        {
          $project: {
            date: { $toDate: '$numberValue' },
            year: { $year: { $toDate: '$numberValue' } }
          }
        }
      ])

      assert.ok(results[0].date instanceof Date)
      assert.strictEqual(results[0].year, 2024)
    })
  })
})
