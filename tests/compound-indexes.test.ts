import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema } from '../index'
import { testUsers } from './fixtures'

test('Compound Indexes', async t => {
  await t.test('should create compound index manually', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    await User.createIndex(['city', 'age'])

    const result = await User.findOne({ city: 'New York', age: 25 })
    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Alice')
  })

  await t.test('should use compound index for O(1) lookup', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    await User.createIndex(['city', 'age'])

    // Spy on Array.prototype.find to verify index is used
    let findCallCount = 0
    const originalFind = Array.prototype.find
    Array.prototype.find = function (...args) {
      findCallCount++
      return originalFind.apply(this, args)
    }

    const result = await User.findOne({ city: 'New York', age: 25 })
    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Alice')

    // Verify Array.find was NOT called (compound index was used)
    assert.strictEqual(
      findCallCount,
      0,
      'Array.find should not be called for compound indexed queries'
    )

    Array.prototype.find = originalFind
  })

  await t.test('should create compound index from schema', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number,
      city: String
    })

    userSchema.index(['city', 'age'])

    const User = model('User', userSchema)
    await User.insertMany(testUsers)

    const result = await User.findOne({ city: 'New York', age: 25 })
    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Alice')
  })

  await t.test('should find all documents with compound index', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    await User.createIndex(['city', 'age'])

    const results = await User.find({ city: 'New York', age: 25 })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test('should update compound indexes when inserting documents', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    await User.createIndex(['city', 'age'])

    await User.create({ name: 'Frank', age: 25, city: 'New York' })

    const results = await User.find({ city: 'New York', age: 25 })
    assert.strictEqual(results.length, 2) // Alice and Frank
    assert.ok(results.some(r => r.name === 'Alice'))
    assert.ok(results.some(r => r.name === 'Frank'))
  })

  await t.test('should fall back to linear scan for partial compound index query', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    await User.createIndex(['city', 'age'])

    // Query only city (not both city and age)
    const results = await User.find({ city: 'New York' })
    assert.strictEqual(results.length, 2) // Alice and Eve
  })

  await t.test('should support mixed single and compound indexes', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number,
      city: String
    })

    userSchema.index('name').index(['city', 'age'])

    const User = model('User', userSchema)
    await User.insertMany(testUsers)

    // Single index query
    const byName = await User.findOne({ name: 'Bob' })
    assert.strictEqual(byName?.name, 'Bob')

    // Compound index query
    const byCityAge = await User.findOne({ city: 'New York', age: 25 })
    assert.strictEqual(byCityAge?.name, 'Alice')
  })

  await t.test('should return null when compound index value does not exist', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' }
    ])

    User.createIndex(['name', 'age'])

    // Query that doesn't exist but has exact compound index
    const result = await User.findOne({ name: 'Charlie', age: 40 })

    assert.strictEqual(result, null)
  })

  await t.test('should use exact compound index match in find()', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'New York' },
      { name: 'Bob', age: 30, city: 'Los Angeles' },
      { name: 'Charlie', age: 35, city: 'Chicago' },
      { name: 'Diana', age: 25, city: 'New York' }
    ])

    // Create compound index
    await User.createIndex(['city', 'age'])

    // Query with exact compound index match (all fields simple equality)
    const results = await User.find({ city: 'New York', age: 25 })

    assert.strictEqual(results.length, 2)
    assert.ok(results.some(r => r.name === 'Alice'))
    assert.ok(results.some(r => r.name === 'Diana'))
  })

  await t.test('should use partial compound index match in find()', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'New York' },
      { name: 'Bob', age: 30, city: 'Los Angeles' },
      { name: 'Charlie', age: 35, city: 'Chicago' },
      { name: 'Diana', age: 40, city: 'New York' }
    ])

    // Create compound index on city and age
    await User.createIndex(['city', 'age'])

    // Query with city + additional condition on age (partial index usage)
    const results = await User.find({ city: 'New York', age: { $gte: 30 } })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Diana')
  })

  await t.test('should use partial compound index in find() with extra query fields', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'New York', status: 'active' },
      { name: 'Bob', age: 30, city: 'Los Angeles', status: 'active' },
      { name: 'Charlie', age: 25, city: 'New York', status: 'inactive' }
    ])

    // Create compound index on city and age
    await User.createIndex(['city', 'age'])

    // Query with indexed fields (city, age) plus non-indexed field (status)
    const results = await User.find({ city: 'New York', age: 25, status: 'active' })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test('should handle query with three indexed fields using compound index', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'New York', status: 'active' },
      { name: 'Bob', age: 30, city: 'Los Angeles', status: 'inactive' },
      { name: 'Charlie', age: 25, city: 'New York', status: 'active' }
    ])

    // Create three-field compound index
    await User.createIndex(['city', 'age', 'status'])

    // Query with all three fields (exact match)
    const results = await User.find({ city: 'New York', age: 25, status: 'active' })

    assert.strictEqual(results.length, 2)
    assert.ok(results.some(r => r.name === 'Alice'))
    assert.ok(results.some(r => r.name === 'Charlie'))
  })

  await t.test(
    'should use partial index when query has subset of compound index fields',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([
        { name: 'Alice', age: 25, city: 'New York', status: 'active' },
        { name: 'Bob', age: 30, city: 'Los Angeles', status: 'active' },
        { name: 'Charlie', age: 35, city: 'New York', status: 'active' }
      ])

      // Create compound index with two fields
      await User.createIndex(['city', 'status'])

      // Query with three fields where two are indexed
      const results = await User.find({ city: 'New York', status: 'active', age: { $gte: 30 } })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Charlie')
    }
  )
})
