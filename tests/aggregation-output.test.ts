import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model as _model, Database } from '../index'

describe('Aggregation $out and $merge Stages', () => {
  interface SaleInterface {
    product: string
    amount: number
    date: Date
  }

  interface SummaryInterface {
    product: string
    total: number
  }

  const saleSchema = new Schema<SaleInterface>({
    product: String,
    amount: Number,
    date: Date
  })

  const summarySchema = new Schema<SummaryInterface>({
    product: String,
    total: Number
  })

  const db = new Database()
  const Sale = db.model<SaleInterface>('Sale', saleSchema)
  const Summary = db.model<SummaryInterface>('Summary', summarySchema)

  beforeEach(async () => {
    await Sale.deleteMany({})
    await Summary.deleteMany({})
  })

  describe('$out stage', () => {
    it('should write aggregation results to target collection', async () => {
      await Sale.insertMany([
        { product: 'Widget A', amount: 100, date: new Date() },
        { product: 'Widget A', amount: 200, date: new Date() },
        { product: 'Widget B', amount: 150, date: new Date() }
      ])

      // Aggregate and output to Summary
      const results = await Sale.aggregate([
        {
          $group: {
            _id: '$product',
            total: { $sum: '$amount' }
          }
        },
        {
          $project: {
            product: '$_id',
            total: 1,
            _id: 0
          }
        },
        { $out: 'Summary' }
      ])

      // $out returns empty array
      assert.strictEqual(results.length, 0)

      // Check that data was written to Summary
      const summaries = await Summary.find({})
      assert.strictEqual(summaries.length, 2)

      const widgetA = summaries.find(s => s.product === 'Widget A')
      assert.ok(widgetA)
      assert.strictEqual(widgetA.total, 300)
    })

    it('should replace existing collection contents', async () => {
      // Pre-populate Summary
      await Summary.insertMany([{ product: 'Old Product', total: 999 }])

      await Sale.insertMany([{ product: 'New Product', amount: 100, date: new Date() }])

      await Sale.aggregate([
        {
          $group: {
            _id: '$product',
            total: { $sum: '$amount' }
          }
        },
        {
          $project: {
            product: '$_id',
            total: 1,
            _id: 0
          }
        },
        { $out: 'Summary' }
      ])

      const summaries = await Summary.find({})
      assert.strictEqual(summaries.length, 1)
      assert.strictEqual(summaries[0].product, 'New Product')
    })

    it('should handle empty results', async () => {
      await Sale.insertMany([{ product: 'Widget A', amount: 100, date: new Date() }])

      await Sale.aggregate([{ $match: { product: 'Nonexistent' } }, { $out: 'Summary' }])

      const summaries = await Summary.find({})
      assert.strictEqual(summaries.length, 0)
    })
  })

  describe('$merge stage', () => {
    it('should insert new documents by default', async () => {
      await Sale.insertMany([
        { product: 'Widget A', amount: 100, date: new Date() },
        { product: 'Widget B', amount: 200, date: new Date() }
      ])

      await Sale.aggregate([
        {
          $group: {
            _id: '$product',
            total: { $sum: '$amount' }
          }
        },
        {
          $project: {
            product: '$_id',
            total: 1,
            _id: 0
          }
        },
        {
          $merge: {
            into: 'Summary',
            on: 'product',
            whenMatched: 'replace',
            whenNotMatched: 'insert'
          }
        }
      ])

      const summaries = await Summary.find({})
      assert.strictEqual(summaries.length, 2)
    })

    it('should merge with existing documents', async () => {
      // Pre-populate with existing data
      await Summary.insertMany([{ product: 'Widget A', total: 100 }])

      await Sale.insertMany([
        { product: 'Widget A', amount: 200, date: new Date() },
        { product: 'Widget B', amount: 150, date: new Date() }
      ])

      await Sale.aggregate([
        {
          $group: {
            _id: '$product',
            total: { $sum: '$amount' }
          }
        },
        {
          $project: {
            product: '$_id',
            total: 1,
            _id: 0
          }
        },
        {
          $merge: {
            into: 'Summary',
            on: 'product',
            whenMatched: 'replace',
            whenNotMatched: 'insert'
          }
        }
      ])

      const summaries = await Summary.find({})
      assert.strictEqual(summaries.length, 2)

      const widgetA = summaries.find(s => s.product === 'Widget A')
      assert.ok(widgetA)
      assert.strictEqual(widgetA.total, 200) // Replaced, not added
    })

    it('should keep existing documents when whenMatched is keepExisting', async () => {
      await Summary.insertMany([{ product: 'Widget A', total: 100 }])

      await Sale.insertMany([{ product: 'Widget A', amount: 200, date: new Date() }])

      await Sale.aggregate([
        {
          $group: {
            _id: '$product',
            total: { $sum: '$amount' }
          }
        },
        {
          $project: {
            product: '$_id',
            total: 1,
            _id: 0
          }
        },
        {
          $merge: {
            into: 'Summary',
            on: 'product',
            whenMatched: 'keepExisting',
            whenNotMatched: 'insert'
          }
        }
      ])

      const summaries = await Summary.find({})
      const widgetA = summaries.find(s => s.product === 'Widget A')
      assert.ok(widgetA)
      assert.strictEqual(widgetA.total, 100) // Kept existing value
    })

    it('should discard non-matched documents when whenNotMatched is discard', async () => {
      await Summary.insertMany([{ product: 'Widget A', total: 100 }])

      await Sale.insertMany([
        { product: 'Widget A', amount: 200, date: new Date() },
        { product: 'Widget B', amount: 300, date: new Date() }
      ])

      await Sale.aggregate([
        {
          $group: {
            _id: '$product',
            total: { $sum: '$amount' }
          }
        },
        {
          $project: {
            product: '$_id',
            total: 1,
            _id: 0
          }
        },
        {
          $merge: {
            into: 'Summary',
            on: 'product',
            whenMatched: 'replace',
            whenNotMatched: 'discard'
          }
        }
      ])

      const summaries = await Summary.find({})
      assert.strictEqual(summaries.length, 1) // Only Widget A updated, Widget B discarded
      assert.strictEqual(summaries[0].product, 'Widget A')
    })

    it('should fail when whenMatched is fail and document exists', async () => {
      await Summary.insertMany([{ product: 'Widget A', total: 100 }])

      await Sale.insertMany([{ product: 'Widget A', amount: 200, date: new Date() }])

      try {
        await Sale.aggregate([
          {
            $group: {
              _id: '$product',
              total: { $sum: '$amount' }
            }
          },
          {
            $project: {
              product: '$_id',
              total: 1,
              _id: 0
            }
          },
          {
            $merge: {
              into: 'Summary',
              on: 'product',
              whenMatched: 'fail',
              whenNotMatched: 'insert'
            }
          }
        ])
        assert.fail('Should have thrown an error')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('already exists'))
      }
    })

    it('should merge on custom fields', async () => {
      interface CustomDoc {
        code: string
        name: string
        value: number
      }

      const customSchema = new Schema<CustomDoc>({
        code: String,
        name: String,
        value: Number
      })

      const Source = db.model<CustomDoc>('Source', customSchema)
      const Target = db.model<CustomDoc>('Target', customSchema)

      await Source.deleteMany({})
      await Target.deleteMany({})

      await Target.insertMany([{ code: 'A001', name: 'Old Name', value: 100 }])

      await Source.insertMany([
        { code: 'A001', name: 'New Name', value: 200 },
        { code: 'B002', name: 'Another', value: 300 }
      ])

      await Source.aggregate([
        {
          $merge: {
            into: 'Target',
            on: 'code', // Merge on 'code' field instead of _id
            whenMatched: 'replace',
            whenNotMatched: 'insert'
          }
        }
      ])

      const targets = await Target.find({})
      assert.strictEqual(targets.length, 2)

      const a001 = targets.find(t => t.code === 'A001')
      assert.ok(a001)
      assert.strictEqual(a001.name, 'New Name')
      assert.strictEqual(a001.value, 200)
    })

    it('should throw error when target collection does not exist', async () => {
      await Sale.insertMany([{ product: 'Widget A', amount: 100, date: new Date() }])

      try {
        await Sale.aggregate([
          {
            $merge: {
              into: 'NonExistentCollection',
              whenMatched: 'merge',
              whenNotMatched: 'insert'
            }
          }
        ])
        assert.fail('Should have thrown an error')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('Collection NonExistentCollection not found'))
      }
    })

    it('should throw error for whenMatched pipeline (not implemented)', async () => {
      await Summary.insertMany([{ product: 'Widget A', total: 100 }])
      await Sale.insertMany([{ product: 'Widget A', amount: 200, date: new Date() }])

      try {
        await Sale.aggregate([
          {
            $group: {
              _id: '$product',
              total: { $sum: '$amount' }
            }
          },
          {
            $project: {
              product: '$_id',
              total: 1,
              _id: 0
            }
          },
          {
            $merge: {
              into: 'Summary',
              on: 'product',
              whenMatched: 'pipeline',
              whenNotMatched: 'insert'
            }
          }
        ])
        assert.fail('Should have thrown an error')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('pipeline not yet implemented'))
      }
    })

    it('should throw error when whenNotMatched is fail and document not found', async () => {
      // No pre-existing documents in Summary
      await Summary.deleteMany({})

      await Sale.insertMany([{ product: 'Widget A', amount: 200, date: new Date() }])

      try {
        await Sale.aggregate([
          {
            $group: {
              _id: '$product',
              total: { $sum: '$amount' }
            }
          },
          {
            $project: {
              product: '$_id',
              total: 1,
              _id: 0
            }
          },
          {
            $merge: {
              into: 'Summary',
              on: 'product',
              whenMatched: 'merge',
              whenNotMatched: 'fail'
            }
          }
        ])
        assert.fail('Should have thrown an error')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.ok(error.message.includes('not found'))
      }
    })
  })

  describe('Real-world scenarios', () => {
    it('should create daily summaries with $out', async () => {
      const today = new Date('2024-01-15')
      await Sale.insertMany([
        { product: 'Widget A', amount: 100, date: today },
        { product: 'Widget A', amount: 150, date: today },
        { product: 'Widget B', amount: 200, date: today }
      ])

      await Sale.aggregate([
        {
          $group: {
            _id: '$product',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            product: '$_id',
            total: 1,
            _id: 0
          }
        },
        { $out: 'Summary' }
      ])

      const summaries = await Summary.find({})
      assert.strictEqual(summaries.length, 2)

      const totalRevenue = summaries.reduce((sum, s) => sum + s.total, 0)
      assert.strictEqual(totalRevenue, 450)
    })

    it('should incrementally update analytics with $merge', async () => {
      // Initial analytics
      await Summary.insertMany([{ product: 'Widget A', total: 500 }])

      // New sales come in
      await Sale.insertMany([
        { product: 'Widget A', amount: 100, date: new Date() },
        { product: 'Widget B', amount: 200, date: new Date() }
      ])

      // Update analytics incrementally
      await Sale.aggregate([
        {
          $group: {
            _id: '$product',
            newTotal: { $sum: '$amount' }
          }
        },
        {
          $project: {
            product: '$_id',
            total: '$newTotal',
            _id: 0
          }
        },
        {
          $merge: {
            into: 'Summary',
            on: 'product',
            whenMatched: 'merge', // Merge keeps other fields, updates total
            whenNotMatched: 'insert'
          }
        }
      ])

      const summaries = await Summary.find({})
      assert.strictEqual(summaries.length, 2)

      // Widget A exists, Widget B is new
      const widgetA = summaries.find(s => s.product === 'Widget A')
      const widgetB = summaries.find(s => s.product === 'Widget B')
      assert.ok(widgetA)
      assert.ok(widgetB)
      assert.strictEqual(widgetB.total, 200)
    })
  })
})
