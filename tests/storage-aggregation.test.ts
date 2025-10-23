import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Schema, Model } from '../index'
import { MemoryStorageStrategy } from '../src/storage/memory-strategy'

describe('Storage with Native Aggregation Support', () => {
  interface TestDoc {
    name: string
    value: number
    category: string
  }

  it('should use storage aggregation when available', async () => {
    // Create a custom storage strategy that implements native aggregation
    class CustomStorageWithAggregation<T extends object> extends MemoryStorageStrategy<T> {
      // Track if native aggregation was called
      aggregationCalled = false

      // Implement native aggregation method
      async aggregate(pipeline: unknown[]): Promise<unknown[]> {
        this.aggregationCalled = true

        // Simple implementation: just return documents matching $match stage
        if (pipeline.length > 0) {
          const stage = pipeline[0] as any
          if ('$match' in stage) {
            const all = await this.getAll()
            return all.filter((doc: any) => {
              return Object.entries(stage.$match).every(([key, value]) => {
                return (doc as any)[key] === value
              })
            })
          }
        }

        return await this.getAll()
      }
    }

    // Create schema and model with custom storage
    const testSchema = new Schema<TestDoc>({
      name: String,
      value: Number,
      category: String
    })

    const storage = new CustomStorageWithAggregation<TestDoc>()
    const TestModel = new Model(testSchema, undefined, storage)

    // Insert test data
    await TestModel.create({ name: 'Doc1', value: 10, category: 'A' })
    await TestModel.create({ name: 'Doc2', value: 20, category: 'B' })
    await TestModel.create({ name: 'Doc3', value: 30, category: 'A' })

    // Run aggregation - should use native storage aggregation
    const results = await TestModel.aggregate([{ $match: { category: 'A' } }])

    // Verify native aggregation was called
    assert.strictEqual(storage.aggregationCalled, true)

    // Verify results
    assert.strictEqual(results.length, 2)
    const names = results.map((r: any) => r.name).sort()
    assert.deepStrictEqual(names, ['Doc1', 'Doc3'])
  })

  it('should fall back to JS aggregation engine when storage does not support it', async () => {
    // Use regular memory storage without native aggregation
    const testSchema = new Schema<TestDoc>({
      name: String,
      value: Number,
      category: String
    })

    const storage = new MemoryStorageStrategy<TestDoc>()
    const TestModel = new Model(testSchema, undefined, storage)

    // Insert test data
    await TestModel.create({ name: 'Doc1', value: 10, category: 'A' })
    await TestModel.create({ name: 'Doc2', value: 20, category: 'B' })
    await TestModel.create({ name: 'Doc3', value: 30, category: 'A' })

    // Run aggregation - should fall back to JS aggregation engine
    const results = await TestModel.aggregate([
      { $match: { category: 'A' } },
      { $group: { _id: '$category', total: { $sum: '$value' } } }
    ])

    // Verify it worked using JS engine
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0]._id, 'A')
    assert.strictEqual(results[0].total, 40)
  })
})
