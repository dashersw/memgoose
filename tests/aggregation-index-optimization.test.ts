import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

describe('Aggregation $match Index Optimization', () => {
  interface SaleInterface {
    item: string
    category: string
    amount: number
    date: Date
  }

  const saleSchema = new Schema<SaleInterface>({
    item: String,
    category: String,
    amount: Number,
    date: Date
  })

  // Create an index on category to test optimization
  saleSchema.index('category')

  const Sale = model<SaleInterface>('Sale', saleSchema)

  beforeEach(async () => {
    await Sale.deleteMany({})
  })

  it('should use indexes when $match is the first stage', async () => {
    // Insert test data
    await Sale.insertMany([
      { item: 'Apple', category: 'fruit', amount: 5, date: new Date('2024-01-01') },
      { item: 'Banana', category: 'fruit', amount: 3, date: new Date('2024-01-02') },
      { item: 'Carrot', category: 'vegetable', amount: 4, date: new Date('2024-01-03') },
      { item: 'Lettuce', category: 'vegetable', amount: 2, date: new Date('2024-01-04') }
    ])

    // $match as first stage - should use index on 'category'
    const results = await Sale.aggregate([
      { $match: { category: 'fruit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].total, 8) // 5 + 3
  })

  it('should work with complex $match queries using indexes', async () => {
    await Sale.insertMany([
      { item: 'Apple', category: 'fruit', amount: 5, date: new Date('2024-01-01') },
      { item: 'Banana', category: 'fruit', amount: 3, date: new Date('2024-01-02') },
      { item: 'Cherry', category: 'fruit', amount: 7, date: new Date('2024-01-03') },
      { item: 'Carrot', category: 'vegetable', amount: 4, date: new Date('2024-01-04') }
    ])

    // Complex $match with indexed field and range operator
    const results = await Sale.aggregate([
      { $match: { category: 'fruit', amount: { $gte: 5 } } },
      { $project: { item: 1, amount: 1 } }
    ])

    assert.strictEqual(results.length, 2)
    const items = results.map(r => r.item).sort()
    assert.deepStrictEqual(items, ['Apple', 'Cherry'])
  })

  it('should handle $match with logical operators and indexes', async () => {
    await Sale.insertMany([
      { item: 'Apple', category: 'fruit', amount: 5, date: new Date('2024-01-01') },
      { item: 'Banana', category: 'fruit', amount: 3, date: new Date('2024-01-02') },
      { item: 'Carrot', category: 'vegetable', amount: 4, date: new Date('2024-01-03') },
      { item: 'Lettuce', category: 'vegetable', amount: 2, date: new Date('2024-01-04') }
    ])

    // $match with $or should still benefit from index
    const results = await Sale.aggregate([
      { $match: { $or: [{ category: 'fruit' }, { amount: { $gte: 4 } }] } },
      { $sort: { item: 1 } }
    ])

    assert.strictEqual(results.length, 3)
    const items = results.map(r => r.item)
    assert.deepStrictEqual(items, ['Apple', 'Banana', 'Carrot'])
  })

  it('should still work when $match is not the first stage', async () => {
    await Sale.insertMany([
      { item: 'Apple', category: 'fruit', amount: 5, date: new Date('2024-01-01') },
      { item: 'Banana', category: 'fruit', amount: 3, date: new Date('2024-01-02') },
      { item: 'Carrot', category: 'vegetable', amount: 4, date: new Date('2024-01-03') }
    ])

    // $match after $project - can't use index but should still filter correctly
    const results = await Sale.aggregate([
      { $project: { item: 1, category: 1, amount: 1 } },
      { $match: { category: 'fruit' } }
    ])

    assert.strictEqual(results.length, 2)
  })

  it('should optimize multiple $match stages - first one uses index', async () => {
    await Sale.insertMany([
      { item: 'Apple', category: 'fruit', amount: 5, date: new Date('2024-01-01') },
      { item: 'Banana', category: 'fruit', amount: 3, date: new Date('2024-01-02') },
      { item: 'Cherry', category: 'fruit', amount: 7, date: new Date('2024-01-03') },
      { item: 'Carrot', category: 'vegetable', amount: 4, date: new Date('2024-01-04') }
    ])

    // First $match uses index, second $match filters in-memory
    const results = await Sale.aggregate([
      { $match: { category: 'fruit' } }, // Uses index
      { $match: { amount: { $gte: 5 } } } // In-memory filter
    ])

    assert.strictEqual(results.length, 2)
    const items = results.map(r => r.item).sort()
    assert.deepStrictEqual(items, ['Apple', 'Cherry'])
  })
})
