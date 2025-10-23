import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

describe('Aggregation $bucket and $bucketAuto', () => {
  interface SaleInterface {
    item: string
    price: number
    quantity: number
    category: string
  }

  const saleSchema = new Schema<SaleInterface>({
    item: String,
    price: Number,
    quantity: Number,
    category: String
  })

  const Sale = model<SaleInterface>('Sale', saleSchema)

  beforeEach(async () => {
    await Sale.deleteMany({})
  })

  describe('$bucket stage', () => {
    it('should categorize documents into numeric buckets', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 5, quantity: 10, category: 'widgets' },
        { item: 'Widget B', price: 15, quantity: 20, category: 'widgets' },
        { item: 'Widget C', price: 25, quantity: 30, category: 'widgets' },
        { item: 'Widget D', price: 35, quantity: 40, category: 'widgets' },
        { item: 'Widget E', price: 45, quantity: 50, category: 'widgets' }
      ])

      const results = await Sale.aggregate([
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 20, 40, 60],
            output: {
              count: { $sum: 1 },
              items: { $push: '$item' }
            }
          }
        }
      ])

      assert.strictEqual(results.length, 3)

      // First bucket [0, 20)
      assert.strictEqual(results[0]._id, 0)
      assert.strictEqual(results[0].count, 2) // price 5 and 15

      // Second bucket [20, 40)
      assert.strictEqual(results[1]._id, 20)
      assert.strictEqual(results[1].count, 2) // price 25 and 35

      // Third bucket [40, 60)
      assert.strictEqual(results[2]._id, 40)
      assert.strictEqual(results[2].count, 1) // price 45
    })

    it('should handle default bucket for out-of-range values', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 5, quantity: 10, category: 'widgets' },
        { item: 'Widget B', price: 75, quantity: 20, category: 'widgets' },
        { item: 'Widget C', price: 25, quantity: 30, category: 'widgets' },
        { item: 'Widget D', price: 100, quantity: 40, category: 'widgets' }
      ])

      const results = await Sale.aggregate([
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 20, 40, 60],
            default: 'Other',
            output: {
              count: { $sum: 1 }
            }
          }
        }
      ])

      assert.strictEqual(results.length, 4)

      // Default bucket
      const defaultBucket = results.find(r => r._id === 'Other')
      assert.ok(defaultBucket)
      assert.strictEqual(defaultBucket.count, 2) // price 75 and 100
    })

    it('should apply accumulator expressions in output', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 5, quantity: 10, category: 'widgets' },
        { item: 'Widget B', price: 15, quantity: 20, category: 'widgets' },
        { item: 'Widget C', price: 25, quantity: 30, category: 'widgets' }
      ])

      const results = await Sale.aggregate([
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 20, 40],
            output: {
              count: { $sum: 1 },
              totalQuantity: { $sum: '$quantity' },
              avgPrice: { $avg: '$price' },
              maxQuantity: { $max: '$quantity' }
            }
          }
        }
      ])

      // First bucket
      assert.strictEqual(results[0].count, 2)
      assert.strictEqual(results[0].totalQuantity, 30) // 10 + 20
      assert.strictEqual(results[0].avgPrice, 10) // (5 + 15) / 2
      assert.strictEqual(results[0].maxQuantity, 20)

      // Second bucket
      assert.strictEqual(results[1].count, 1)
      assert.strictEqual(results[1].totalQuantity, 30)
    })

    it('should handle empty buckets', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 5, quantity: 10, category: 'widgets' },
        { item: 'Widget B', price: 45, quantity: 20, category: 'widgets' }
      ])

      const results = await Sale.aggregate([
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 20, 40, 60]
          }
        }
      ])

      assert.strictEqual(results.length, 3)

      // Middle bucket should be empty but still present
      assert.strictEqual(results[1]._id, 20)
      assert.strictEqual(results[1].count, 0)
    })

    it('should handle $avg accumulator with empty buckets (returns null)', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 5, quantity: 10, category: 'widgets' },
        { item: 'Widget B', price: 45, quantity: 20, category: 'widgets' }
      ])

      const results = await Sale.aggregate([
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 20, 40, 60],
            output: {
              count: { $sum: 1 },
              avgPrice: { $avg: '$price' },
              avgQuantity: { $avg: '$quantity' }
            }
          }
        }
      ])

      assert.strictEqual(results.length, 3)

      // First bucket has items
      assert.strictEqual(results[0].count, 1)
      assert.strictEqual(results[0].avgPrice, 5)
      assert.strictEqual(results[0].avgQuantity, 10)

      // Middle bucket is empty - avg should be null
      assert.strictEqual(results[1]._id, 20)
      assert.strictEqual(results[1].count, 0)
      assert.strictEqual(results[1].avgPrice, null)
      assert.strictEqual(results[1].avgQuantity, null)

      // Last bucket has items
      assert.strictEqual(results[2].count, 1)
      assert.strictEqual(results[2].avgPrice, 45)
      assert.strictEqual(results[2].avgQuantity, 20)
    })
  })

  describe('$bucketAuto stage', () => {
    it('should automatically create evenly distributed buckets', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 10, quantity: 1, category: 'widgets' },
        { item: 'Widget B', price: 20, quantity: 2, category: 'widgets' },
        { item: 'Widget C', price: 30, quantity: 3, category: 'widgets' },
        { item: 'Widget D', price: 40, quantity: 4, category: 'widgets' },
        { item: 'Widget E', price: 50, quantity: 5, category: 'widgets' },
        { item: 'Widget F', price: 60, quantity: 6, category: 'widgets' }
      ])

      const results = await Sale.aggregate([
        {
          $bucketAuto: {
            groupBy: '$price',
            buckets: 3,
            output: {
              count: { $sum: 1 },
              items: { $push: '$item' }
            }
          }
        }
      ])

      assert.strictEqual(results.length, 3)

      // Each bucket should have roughly equal count (2 items each)
      assert.strictEqual(results[0].count, 2)
      assert.strictEqual(results[1].count, 2)
      assert.strictEqual(results[2].count, 2)

      // Check that _id has min and max
      assert.ok((results[0]._id as any).min !== undefined)
      assert.ok((results[0]._id as any).max !== undefined)
    })

    it('should handle fewer documents than buckets', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 10, quantity: 1, category: 'widgets' },
        { item: 'Widget B', price: 20, quantity: 2, category: 'widgets' }
      ])

      const results = await Sale.aggregate([
        {
          $bucketAuto: {
            groupBy: '$price',
            buckets: 5
          }
        }
      ])

      // Should create buckets but some may be empty
      assert.ok(results.length > 0)
      assert.ok(results.length <= 5)
    })

    it('should apply output accumulators', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 10, quantity: 5, category: 'widgets' },
        { item: 'Widget B', price: 20, quantity: 10, category: 'widgets' },
        { item: 'Widget C', price: 30, quantity: 15, category: 'widgets' },
        { item: 'Widget D', price: 40, quantity: 20, category: 'widgets' }
      ])

      const results = await Sale.aggregate([
        {
          $bucketAuto: {
            groupBy: '$price',
            buckets: 2,
            output: {
              count: { $sum: 1 },
              totalQuantity: { $sum: '$quantity' },
              avgPrice: { $avg: '$price' }
            }
          }
        }
      ])

      assert.strictEqual(results.length, 2)

      // Verify accumulators are applied
      assert.ok(results[0].totalQuantity !== undefined)
      assert.ok(results[0].avgPrice !== undefined)
      assert.strictEqual(results[0].count, 2)
    })

    it('should handle granularity option', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 1.2, quantity: 1, category: 'widgets' },
        { item: 'Widget B', price: 2.5, quantity: 2, category: 'widgets' },
        { item: 'Widget C', price: 3.8, quantity: 3, category: 'widgets' },
        { item: 'Widget D', price: 5.1, quantity: 4, category: 'widgets' }
      ])

      const results = await Sale.aggregate([
        {
          $bucketAuto: {
            groupBy: '$price',
            buckets: 2,
            granularity: 'E12'
          }
        }
      ])

      // Should create buckets aligned to granularity series
      assert.ok(results.length > 0)
      assert.ok((results[0]._id as any).min !== undefined)
    })
  })

  describe('Combined $bucket operations', () => {
    it('should work in pipeline with other stages', async () => {
      await Sale.insertMany([
        { item: 'Widget A', price: 5, quantity: 10, category: 'widgets' },
        { item: 'Gadget A', price: 15, quantity: 20, category: 'gadgets' },
        { item: 'Widget B', price: 25, quantity: 30, category: 'widgets' },
        { item: 'Gadget B', price: 35, quantity: 40, category: 'gadgets' }
      ])

      const results = await Sale.aggregate([
        { $match: { category: 'widgets' } },
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 20, 40],
            output: {
              count: { $sum: 1 },
              items: { $push: '$item' }
            }
          }
        }
      ])

      assert.strictEqual(results.length, 2)

      // Only widgets should be bucketed
      const allItems = results.flatMap(r => r.items as string[])
      assert.ok(allItems.every(item => item.startsWith('Widget')))
    })
  })
})
