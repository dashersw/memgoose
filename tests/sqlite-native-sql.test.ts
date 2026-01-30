import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, Model, createDatabase } from '../index'
import * as fs from 'fs'
import * as path from 'path'

describe('SQLite Native SQL Execution', () => {
  const testDir = path.join('data', 'test-sqlite-native')

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  interface TestDoc {
    name: string
    age: number
    category: string
    tags?: string[]
  }

  it('should execute find queries natively in SQLite', async () => {
    const db = createDatabase({ dataPath: testDir, storage: 'sqlite' })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String,
      tags: [String]
    })

    const TestModel = db.model('NativeQuery', schema)

    // Insert test data
    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A', tags: ['dev', 'senior'] },
      { name: 'Bob', age: 30, category: 'B', tags: ['ops'] },
      { name: 'Charlie', age: 35, category: 'A', tags: ['dev', 'junior'] },
      { name: 'David', age: 28, category: 'B', tags: ['qa'] }
    ])

    // Test complex query with sorting and limiting - all executed in SQL
    const results = await TestModel.find({ category: 'A', age: { $gte: 25 } })
      .sort({ age: -1 })
      .limit(1)

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Charlie')
    assert.strictEqual(results[0].age, 35)
  })

  it('should execute update operations natively in SQLite', async () => {
    const db = createDatabase({ dataPath: testDir, storage: 'sqlite' })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeUpdate', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'A' }
    ])

    // Update using native SQL with $inc operator
    const result = await TestModel.updateMany({ category: 'A' }, { $inc: { age: 5 } })

    assert.strictEqual(result.modifiedCount, 2)

    // Verify the updates
    const updated = await TestModel.find({ category: 'A' }).sort({ name: 1 })
    assert.strictEqual(updated[0].name, 'Alice')
    assert.strictEqual(updated[0].age, 30)
    assert.strictEqual(updated[1].name, 'Charlie')
    assert.strictEqual(updated[1].age, 40)
  })

  it('should execute delete operations natively in SQLite', async () => {
    const db = createDatabase({ dataPath: testDir, storage: 'sqlite' })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeDelete', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'A' }
    ])

    // Delete using native SQL
    const result = await TestModel.deleteMany({ category: 'A' })

    assert.strictEqual(result.deletedCount, 2)

    // Verify deletions
    const remaining = await TestModel.find({})
    assert.strictEqual(remaining.length, 1)
    assert.strictEqual(remaining[0].name, 'Bob')
  })

  it('should execute count operations natively in SQLite', async () => {
    const db = createDatabase({ dataPath: testDir, storage: 'sqlite' })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeCount', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'A' }
    ])

    // Count using native SQL
    const count = await TestModel.countDocuments({ category: 'A' })

    assert.strictEqual(count, 2)
  })

  it('should execute aggregation natively in SQLite', async () => {
    const db = createDatabase({ dataPath: testDir, storage: 'sqlite' })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeAggregate', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'A' },
      { name: 'David', age: 40, category: 'B' }
    ])

    // Execute aggregation natively in SQL
    const results = await TestModel.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { age: { $gte: 25 } } },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$age' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ])

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0]._id, 'A')
    assert.strictEqual(results[0].total, 60) // 25 + 35
    assert.strictEqual(results[0].count, 2)
    assert.strictEqual(results[1]._id, 'B')
    assert.strictEqual(results[1].total, 70) // 30 + 40
    assert.strictEqual(results[1].count, 2)
  })

  it('should support complex query operators in native SQL', async () => {
    const db = createDatabase({ dataPath: testDir, storage: 'sqlite' })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String,
      tags: [String]
    })

    const TestModel = db.model('NativeOperators', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A', tags: ['dev', 'senior'] },
      { name: 'Bob', age: 30, category: 'B', tags: ['ops'] },
      { name: 'Charlie', age: 35, category: 'A', tags: ['dev', 'junior'] },
      { name: 'David', age: 28, category: 'B', tags: ['qa'] }
    ])

    // Test $in operator
    const results1 = await TestModel.find({ category: { $in: ['A', 'B'] } })
    assert.strictEqual(results1.length, 4)

    // Test $gt operator
    const results2 = await TestModel.find({ age: { $gt: 28 } })
    assert.strictEqual(results2.length, 2)

    // Test $regex operator
    const results3 = await TestModel.find({ name: { $regex: '^A' } })
    assert.strictEqual(results3.length, 1)
    assert.strictEqual(results3[0].name, 'Alice')

    // Test logical operators
    const results4 = await TestModel.find({
      $or: [{ category: 'A' }, { age: { $lte: 28 } }]
    })
    assert.strictEqual(results4.length, 3) // Alice, Charlie, David
  })
})

