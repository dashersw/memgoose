import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, createDatabase } from '../index'
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
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
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
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
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
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
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
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
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
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
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
      }
    ])

    assert.strictEqual(results.length, 2)
    const resultA = results.find(r => r._id === 'A')
    const resultB = results.find(r => r._id === 'B')
    assert.ok(resultA)
    assert.ok(resultB)
    assert.strictEqual(resultA.total, 60) // 25 + 35
    assert.strictEqual(resultA.count, 2)
    assert.strictEqual(resultB.total, 70) // 30 + 40
    assert.strictEqual(resultB.count, 2)
  })

  it('should support complex query operators in native SQL', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
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

  it('should execute $avg aggregation natively in SQLite', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeAvg', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 20, category: 'A' },
      { name: 'Bob', age: 30, category: 'A' },
      { name: 'Charlie', age: 40, category: 'B' },
      { name: 'David', age: 50, category: 'B' }
    ])

    const results = await TestModel.aggregate<{ _id: string; avgAge: number }>([
      {
        $group: {
          _id: '$category',
          avgAge: { $avg: '$age' }
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    const resultA = results.find(r => r._id === 'A')
    const resultB = results.find(r => r._id === 'B')
    assert.ok(resultA)
    assert.ok(resultB)
    assert.strictEqual(resultA.avgAge, 25) // (20 + 30) / 2
    assert.strictEqual(resultB.avgAge, 45) // (40 + 50) / 2
  })

  it('should execute $min and $max aggregation natively in SQLite', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeMinMax', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 20, category: 'A' },
      { name: 'Bob', age: 30, category: 'A' },
      { name: 'Charlie', age: 40, category: 'B' },
      { name: 'David', age: 50, category: 'B' }
    ])

    const results = await TestModel.aggregate<{
      _id: string
      minAge: number
      maxAge: number
    }>([
      {
        $group: {
          _id: '$category',
          minAge: { $min: '$age' },
          maxAge: { $max: '$age' }
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    const resultA = results.find(r => r._id === 'A')
    const resultB = results.find(r => r._id === 'B')
    assert.ok(resultA)
    assert.ok(resultB)
    assert.strictEqual(resultA.minAge, 20)
    assert.strictEqual(resultA.maxAge, 30)
    assert.strictEqual(resultB.minAge, 40)
    assert.strictEqual(resultB.maxAge, 50)
  })

  it('should execute $push aggregation natively in SQLite', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativePush', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'A' }
    ])

    const results = await TestModel.aggregate<{ _id: string; names: string[] | string }>([
      {
        $group: {
          _id: '$category',
          names: { $push: '$name' }
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    const resultA = results.find(r => r._id === 'A')
    const resultB = results.find(r => r._id === 'B')
    assert.ok(resultA)
    assert.ok(resultB)
    // SQLite returns JSON array string, need to parse if string
    const namesA = typeof resultA.names === 'string' ? JSON.parse(resultA.names) : resultA.names
    const namesB = typeof resultB.names === 'string' ? JSON.parse(resultB.names) : resultB.names
    assert.deepStrictEqual(namesA.sort(), ['Alice', 'Charlie'])
    assert.deepStrictEqual(namesB, ['Bob'])
  })

  it('should execute $addToSet aggregation natively in SQLite', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeAddToSet', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'A' },
      { name: 'Charlie', age: 35, category: 'B' }
    ])

    const results = await TestModel.aggregate<{ _id: string; categories: string[] | string }>([
      {
        $group: {
          _id: '$category',
          categories: { $addToSet: '$category' }
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    const resultA = results.find(r => r._id === 'A')
    assert.ok(resultA)
    // $addToSet with DISTINCT should return unique values
    // SQLite returns JSON array string, need to parse if string
    const categories =
      typeof resultA.categories === 'string' ? JSON.parse(resultA.categories) : resultA.categories
    assert.ok(Array.isArray(categories))
    assert.strictEqual(categories.length, 1)
  })

  it('should execute $group with _id: null (group all) in SQLite', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeGroupAll', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 20, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 40, category: 'A' }
    ])

    const results = await TestModel.aggregate<{ _id: null; totalAge: number; count: number }>([
      {
        $group: {
          _id: null,
          totalAge: { $sum: '$age' },
          count: { $sum: 1 }
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0]._id, null)
    assert.strictEqual(results[0].totalAge, 90) // 20 + 30 + 40
    assert.strictEqual(results[0].count, 3)
  })

  it('should execute compound grouping with multiple fields in SQLite', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    interface ExtendedDoc {
      name: string
      age: number
      category: string
      status: string
    }

    const schema = new Schema<ExtendedDoc>({
      name: String,
      age: Number,
      category: String,
      status: String
    })

    const TestModel = db.model('NativeCompoundGroup', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A', status: 'active' },
      { name: 'Bob', age: 30, category: 'A', status: 'active' },
      { name: 'Charlie', age: 35, category: 'A', status: 'inactive' },
      { name: 'David', age: 40, category: 'B', status: 'active' }
    ])

    const results = await TestModel.aggregate<{
      _id: { category: string; status: string } | string
      count: number
    }>([
      {
        $group: {
          _id: { category: '$category', status: '$status' },
          count: { $sum: 1 }
        }
      }
    ])

    assert.strictEqual(results.length, 3)
    // Results should be grouped by category+status combinations
    // SQLite may return _id as JSON string, need to parse
    const parsedResults = results.map(r => ({
      _id: typeof r._id === 'string' ? JSON.parse(r._id) : r._id,
      count: r.count
    }))
    const aActive = parsedResults.find(r => r._id.category === 'A' && r._id.status === 'active')
    assert.ok(aActive)
    assert.strictEqual(aActive.count, 2)
  })

  it('should execute $project stage in SQLite aggregation', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeProject', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' }
    ])

    // Test projection with inclusion
    const results = await TestModel.aggregate<{ name: string; age: number }>([
      { $project: { name: 1, age: 1 } }
    ])

    assert.strictEqual(results.length, 2)
    assert.ok(results[0].name)
    assert.ok(results[0].age)
  })

  it('should execute $project with field reference in SQLite', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeProjectRef', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' }
    ])

    // Test projection with field reference
    const results = await TestModel.aggregate<{ personName: string }>([
      { $project: { personName: '$name' } }
    ])

    assert.strictEqual(results.length, 2)
    const names = results.map(r => r.personName).sort()
    assert.deepStrictEqual(names, ['Alice', 'Bob'])
  })

  it('should execute $rename update operator natively in SQLite', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    interface RenameDoc {
      oldName: string
      newName?: string
      age: number
    }

    const schema = new Schema<RenameDoc>({
      oldName: String,
      newName: String,
      age: Number
    })

    const TestModel = db.model('NativeRename', schema)

    await TestModel.create({ oldName: 'Alice', age: 25 })

    // Update using $rename operator
    const result = await TestModel.updateOne({}, { $rename: { oldName: 'newName' } })

    assert.strictEqual(result.modifiedCount, 1)

    // Verify the rename
    const docs = await TestModel.find({})
    assert.strictEqual(docs.length, 1)
    assert.strictEqual(docs[0].newName, 'Alice')
    assert.strictEqual(docs[0].oldName, undefined)
  })

  it('should handle null values in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    interface NullableDoc {
      name: string
      value: number | null
    }

    const schema = new Schema<NullableDoc>({
      name: String,
      value: Number
    })

    const TestModel = db.model('NativeNull', schema)

    await TestModel.insertMany([
      { name: 'Alice', value: 10 },
      { name: 'Bob', value: null as any }
    ])

    // Query for null value
    const results = await TestModel.find({ value: null as any })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Bob')
  })

  it('should match undefined/missing fields when querying { field: null } (MongoDB compat)', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    const schema = new Schema({
      name: String,
      city: String
    })

    const TestModel = db.model('NullUndefined', schema)

    await TestModel.insertMany([
      { name: 'Alice', city: 'NYC' },
      { name: 'Bob', city: null as any },
      { name: 'Charlie' } // city is undefined/missing
    ])

    // Query for null - should match both explicit null and missing field
    const results = await TestModel.find({ city: null as any })
    assert.strictEqual(results.length, 2)
    const names = results.map((r: any) => r.name).sort()
    assert.deepStrictEqual(names, ['Bob', 'Charlie'])
  })

  it('should match undefined/missing fields with $eq: null (MongoDB compat)', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    const schema = new Schema({
      name: String,
      city: String
    })

    const TestModel = db.model('EqNull', schema)

    await TestModel.insertMany([
      { name: 'Alice', city: 'NYC' },
      { name: 'Bob', city: null as any },
      { name: 'Charlie' } // city is undefined/missing
    ])

    const results = await TestModel.find({ city: { $eq: null } })
    assert.strictEqual(results.length, 2)
    const names = results.map((r: any) => r.name).sort()
    assert.deepStrictEqual(names, ['Bob', 'Charlie'])
  })

  it('should exclude undefined/missing fields with $ne: null (MongoDB compat)', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    const schema = new Schema({
      name: String,
      city: String
    })

    const TestModel = db.model('NeNull', schema)

    await TestModel.insertMany([
      { name: 'Alice', city: 'NYC' },
      { name: 'Bob', city: null as any },
      { name: 'Charlie' } // city is undefined/missing
    ])

    const results = await TestModel.find({ city: { $ne: null } })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  it('should match undefined/missing fields with $in: [null] (MongoDB compat)', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    const schema = new Schema({
      name: String,
      city: String
    })

    const TestModel = db.model('InNull', schema)

    await TestModel.insertMany([
      { name: 'Alice', city: 'NYC' },
      { name: 'Bob', city: null as any },
      { name: 'Charlie' }, // city is undefined/missing
      { name: 'Dave', city: 'LA' }
    ])

    // $in: [null, 'NYC'] should match Bob (null), Charlie (missing), and Alice (NYC)
    const results = await TestModel.find({ city: { $in: [null, 'NYC'] } })
    assert.strictEqual(results.length, 3)
    const names = results.map((r: any) => r.name).sort()
    assert.deepStrictEqual(names, ['Alice', 'Bob', 'Charlie'])
  })

  it('should exclude undefined/missing fields with $nin: [null] (MongoDB compat)', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    const schema = new Schema({
      name: String,
      city: String
    })

    const TestModel = db.model('NinNull', schema)

    await TestModel.insertMany([
      { name: 'Alice', city: 'NYC' },
      { name: 'Bob', city: null as any },
      { name: 'Charlie' }, // city is undefined/missing
      { name: 'Dave', city: 'LA' }
    ])

    // $nin: [null, 'NYC'] should exclude Bob (null), Charlie (missing), and Alice (NYC)
    const results = await TestModel.find({ city: { $nin: [null, 'NYC'] } })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Dave')
  })

  it('should serialize Date values in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    interface DateDoc {
      name: string
      createdAt: Date
    }

    const schema = new Schema<DateDoc>({
      name: String,
      createdAt: Date
    })

    const TestModel = db.model('NativeDate', schema)

    const date1 = new Date('2024-01-01')
    const date2 = new Date('2024-06-15')

    await TestModel.insertMany([
      { name: 'Doc1', createdAt: date1 },
      { name: 'Doc2', createdAt: date2 }
    ])

    // Query with Date comparison
    const results = await TestModel.find({ createdAt: { $gte: new Date('2024-03-01') } })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Doc2')
  })

  it('should handle ObjectId values in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    interface RefDoc {
      name: string
      refId: string
    }

    const schema = new Schema<RefDoc>({
      name: String,
      refId: String
    })

    const TestModel = db.model('NativeObjectId', schema)

    const { ObjectId } = await import('../src/objectid.js')
    const oid = new ObjectId()

    await TestModel.insertMany([
      { name: 'Alice', refId: oid.toString() },
      { name: 'Bob', refId: new ObjectId().toString() }
    ])

    // Query using ObjectId - should serialize to string
    const results = await TestModel.find({ refId: oid as unknown as string })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  it('should handle $project with exclusion fields', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeProjectExclude', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' }
    ])

    // Test projection with exclusion (should skip exclusion fields)
    const results = await TestModel.aggregate<{ name: string }>([
      { $project: { name: 1, category: 0 } }
    ])

    assert.strictEqual(results.length, 2)
    assert.ok(results[0].name)
  })

  it('should return full data when no specific fields in aggregation', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeFullData', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' }
    ])

    // Simple aggregation with only $match - should return full documents
    const results = await TestModel.aggregate<TestDoc | { data: string }>([
      { $match: { category: 'A' } }
    ])

    assert.strictEqual(results.length, 1)
    // SQLite native aggregation may return data as JSON string
    const doc =
      'data' in results[0] && typeof results[0].data === 'string'
        ? JSON.parse(results[0].data)
        : results[0]
    assert.strictEqual(doc.name, 'Alice')
    assert.strictEqual(doc.age, 25)
    assert.strictEqual(doc.category, 'A')
  })

  it('should fall back to JS engine for unsupported aggregation stage', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeUnsupported', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' }
    ])

    // $unwind is not supported by SqlAggregationBuilder - should fall back to JS engine
    // Use $addFields which is not in the SQL builder
    const results = await TestModel.aggregate<any>([
      { $match: { category: 'A' } },
      { $addFields: { processed: true } }
    ])

    // Should work via JS engine fallback
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
    assert.strictEqual(results[0].processed, true)
  })

  it('should handle $or logical operator in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeOr', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'C' }
    ])

    const results = await TestModel.find({
      $or: [{ category: 'A' }, { category: 'B' }]
    })

    assert.strictEqual(results.length, 2)
    const names = results.map(r => r.name).sort()
    assert.deepStrictEqual(names, ['Alice', 'Bob'])
  })

  it('should handle $and logical operator in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeAnd', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'A' },
      { name: 'Charlie', age: 35, category: 'B' }
    ])

    const results = await TestModel.find({
      $and: [{ category: 'A' }, { age: { $gte: 30 } }]
    })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Bob')
  })

  it('should handle $nor logical operator in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeNor', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'C' }
    ])

    // Neither A nor B
    const results = await TestModel.find({
      $nor: [{ category: 'A' }, { category: 'B' }]
    })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Charlie')
  })

  it('should handle $nin operator in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeNin', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'C' }
    ])

    const results = await TestModel.find({
      category: { $nin: ['A', 'B'] }
    })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Charlie')
  })

  it('should handle $exists operator in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    interface OptionalDoc {
      name: string
      value?: number
    }

    const schema = new Schema<OptionalDoc>({
      name: String,
      value: Number
    })

    const TestModel = db.model('NativeExists', schema)

    await TestModel.insertMany([
      { name: 'Alice', value: 10 },
      { name: 'Bob' } // no value field
    ])

    // Find documents where value exists
    const withValue = await TestModel.find({ value: { $exists: true } })
    assert.strictEqual(withValue.length, 1)
    assert.strictEqual(withValue[0].name, 'Alice')

    // Find documents where value does not exist
    const withoutValue = await TestModel.find({ value: { $exists: false } })
    assert.strictEqual(withoutValue.length, 1)
    assert.strictEqual(withoutValue[0].name, 'Bob')
  })

  it('should handle $size operator for arrays', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String,
      tags: [String]
    })

    const TestModel = db.model('NativeSize', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A', tags: ['a', 'b'] },
      { name: 'Bob', age: 30, category: 'B', tags: ['x'] },
      { name: 'Charlie', age: 35, category: 'C', tags: ['p', 'q', 'r'] }
    ])

    const results = await TestModel.find({ tags: { $size: 2 } })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  it('should handle $not operator in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeNot', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'A' }
    ])

    // Find documents where age is NOT greater than 30
    const results = await TestModel.find({
      age: { $not: { $gt: 30 } }
    })

    assert.strictEqual(results.length, 2)
    const names = results.map(r => r.name).sort()
    assert.deepStrictEqual(names, ['Alice', 'Bob'])
  })

  it('should handle $ne operator in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeNe', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'A' }
    ])

    const results = await TestModel.find({ category: { $ne: 'A' } })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Bob')
  })

  it('should handle $lt and $lte operators in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeLt', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' },
      { name: 'Charlie', age: 35, category: 'C' }
    ])

    // $lt
    const ltResults = await TestModel.find({ age: { $lt: 30 } })
    assert.strictEqual(ltResults.length, 1)
    assert.strictEqual(ltResults[0].name, 'Alice')

    // $lte
    const lteResults = await TestModel.find({ age: { $lte: 30 } })
    assert.strictEqual(lteResults.length, 2)
  })

  it('should handle $eq operator explicitly in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeEq', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' }
    ])

    const results = await TestModel.find({ age: { $eq: 25 } })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  it('should handle array direct equality in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String,
      tags: [String]
    })

    const TestModel = db.model('NativeArrayEq', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A', tags: ['dev', 'senior'] },
      { name: 'Bob', age: 30, category: 'B', tags: ['ops'] }
    ])

    // Exact array match
    const results = await TestModel.find({ tags: ['dev', 'senior'] })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  it('should handle empty $in array', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeEmptyIn', schema)

    await TestModel.insertMany([{ name: 'Alice', age: 25, category: 'A' }])

    // Empty $in should return no results
    const results = await TestModel.find({ category: { $in: [] } })
    assert.strictEqual(results.length, 0)
  })

  it('should handle empty $nin array', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeEmptyNin', schema)

    await TestModel.insertMany([
      { name: 'Alice', age: 25, category: 'A' },
      { name: 'Bob', age: 30, category: 'B' }
    ])

    // Empty $nin should return all results
    const results = await TestModel.find({ category: { $nin: [] } })
    assert.strictEqual(results.length, 2)
  })

  it('should handle $set and $unset update operators', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeSetUnset', schema)

    await TestModel.create({ name: 'Alice', age: 25, category: 'A' })

    // Update with $set and $unset
    await TestModel.updateOne({}, { $set: { name: 'Alicia' }, $unset: { category: 1 } })

    const doc = await TestModel.findOne({})
    assert.strictEqual(doc?.name, 'Alicia')
    assert.strictEqual(doc?.category, undefined)
  })

  it('should handle $dec update operator', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeDec', schema)

    await TestModel.create({ name: 'Alice', age: 30, category: 'A' })

    await TestModel.updateOne({}, { $dec: { age: 5 } })

    const doc = await TestModel.findOne({})
    assert.strictEqual(doc?.age, 25)
  })

  it('should handle $push update operator', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String,
      tags: [String]
    })

    const TestModel = db.model('NativePushUpdate', schema)

    await TestModel.create({ name: 'Alice', age: 25, category: 'A', tags: ['dev'] })

    await TestModel.updateOne({}, { $push: { tags: 'senior' } })

    const doc = await TestModel.findOne({})
    assert.deepStrictEqual(doc?.tags, ['dev', 'senior'])
  })

  it('should handle $pop update operator', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String,
      tags: [String]
    })

    const TestModel = db.model('NativePopUpdate', schema)

    await TestModel.create({ name: 'Alice', age: 25, category: 'A', tags: ['a', 'b', 'c'] })

    // Pop last element
    await TestModel.updateOne({}, { $pop: { tags: 1 } })
    let doc = await TestModel.findOne({})
    assert.deepStrictEqual(doc?.tags, ['a', 'b'])

    // Pop first element
    await TestModel.updateOne({}, { $pop: { tags: -1 } })
    doc = await TestModel.findOne({})
    assert.deepStrictEqual(doc?.tags, ['b'])
  })

  it('should handle direct field update without operators', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })
    const schema = new Schema<TestDoc>({
      name: String,
      age: Number,
      category: String
    })

    const TestModel = db.model('NativeDirectUpdate', schema)

    await TestModel.create({ name: 'Alice', age: 25, category: 'A' })

    // Direct field update (no operators)
    await TestModel.updateOne({}, { name: 'Alicia', age: 26 })

    const doc = await TestModel.findOne({})
    assert.strictEqual(doc?.name, 'Alicia')
    assert.strictEqual(doc?.age, 26)
  })

  it('should handle boolean values in queries', async () => {
    const db = createDatabase({ storage: 'sqlite', sqlite: { dataPath: testDir } })

    interface BoolDoc {
      name: string
      active: boolean
    }

    const schema = new Schema<BoolDoc>({
      name: String,
      active: Boolean
    })

    const TestModel = db.model('NativeBool', schema)

    await TestModel.insertMany([
      { name: 'Alice', active: true },
      { name: 'Bob', active: false }
    ])

    const activeResults = await TestModel.find({ active: true })
    assert.strictEqual(activeResults.length, 1)
    assert.strictEqual(activeResults[0].name, 'Alice')

    const inactiveResults = await TestModel.find({ active: false })
    assert.strictEqual(inactiveResults.length, 1)
    assert.strictEqual(inactiveResults[0].name, 'Bob')
  })
})
