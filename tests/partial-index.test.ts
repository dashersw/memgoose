import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, clearRegistry } from '../index'
import { testUsers } from './fixtures'

test('Partial Index Matching', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should use single-field index for multi-field query', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    User.createIndex('name') // Only index name

    // Query with name + age - should use name index then filter
    let findCallCount = 0
    const originalFind = Array.prototype.find
    Array.prototype.find = function (...args) {
      findCallCount++
      return originalFind.apply(this, args)
    }

    const result = await User.findOne({ name: 'Bob', age: 32 })
    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Bob')
    assert.strictEqual(result.age, 32)

    // Should use index to get candidates, then filter - NOT scan all data
    // So Array.find should be called on indexed subset, not full data
    assert.ok(findCallCount <= 1, 'Should use index to narrow down search')

    Array.prototype.find = originalFind
  })

  await t.test('should use partial index with find()', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    User.createIndex('city') // Only index city

    let filterCallCount = 0
    const originalFilter = Array.prototype.filter
    Array.prototype.filter = function (...args) {
      filterCallCount++
      return originalFilter.apply(this, args)
    }

    // Query city + age - should use city index then filter
    const results = await User.find({ city: 'New York', age: 25 })
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')

    // Should filter indexed subset, not full data
    assert.ok(filterCallCount <= 1, 'Should use index to narrow down search')

    Array.prototype.filter = originalFilter
  })

  await t.test('should prefer more specific index', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)

    // Create both single and compound indexes
    User.createIndex('name')
    User.createIndex(['name', 'age'])

    // Query with name + age should use compound index (exact match)
    let findCallCount = 0
    const originalFind = Array.prototype.find
    Array.prototype.find = function (...args) {
      findCallCount++
      return originalFind.apply(this, args)
    }

    const result = await User.findOne({ name: 'Bob', age: 32 })
    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Bob')

    // Should use exact compound index match - no filtering needed
    assert.strictEqual(findCallCount, 0, 'Should use exact index match')

    Array.prototype.find = originalFind
  })

  await t.test('should handle partial index with operators on non-indexed fields', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    User.createIndex('city')

    // Query: city='New York' (indexed) AND age > 26 (operator, non-indexed)
    const results = await User.find({ city: 'New York', age: { $gt: 26 } })

    // Should return only Eve (age 35), not Alice (age 25)
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Eve')
  })

  await t.test('should not use partial index when indexed field has operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    User.createIndex('name')

    let filterCallCount = 0
    const originalFilter = Array.prototype.filter
    Array.prototype.filter = function (...args) {
      filterCallCount++
      return originalFilter.apply(this, args)
    }

    // name has operator - can't use the index
    const results = await User.find({ name: { $regex: '^B' }, age: 32 })
    assert.strictEqual(results.length, 1)

    // Should fall back to full linear scan
    assert.ok(filterCallCount > 0, 'Should use linear scan when indexed field has operator')

    Array.prototype.filter = originalFilter
  })

  await t.test('should use partial index with find() options and multiple fields', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { id: 1, name: 'Alice', city: 'NYC' },
      { id: 2, name: 'Bob', city: 'NYC' },
      { id: 3, name: 'Charlie', city: 'LA' }
    ])

    User.createIndex('city')

    // Query with city (indexed) + id (not indexed), with options
    // This should trigger the partial index path
    const results = await User.find({ city: 'NYC', id: 1 }, { limit: 10 })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test(
    'should handle partial index when composite key does not exist in index map',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([
        { name: 'Alice', age: 25, city: 'NYC' },
        { name: 'Bob', age: 30, city: 'LA' },
        { name: 'Charlie', age: 35, city: 'Chicago' }
      ])

      // Create compound index
      await User.createIndex(['city', 'age'])

      // Query with a city+age combination that doesn't exist in the data
      // This will trigger the || [] fallback when idxMap.get(compositeKey) returns undefined
      const results = await User.find({ city: 'Boston', age: 40 })

      assert.strictEqual(results.length, 0)
    }
  )

  await t.test(
    'should handle findOne with partial index when composite key does not exist',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([
        { name: 'Alice', age: 25, city: 'NYC' },
        { name: 'Bob', age: 30, city: 'LA' }
      ])

      // Create compound index
      await User.createIndex(['city', 'age'])

      // Query with non-existent composite key - triggers the || [] branch in findOne
      const result = await User.findOne({ city: 'Seattle', age: 50 })

      assert.strictEqual(result, null)
    }
  )

  await t.test(
    'should handle partial index with additional filter when composite key missing',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([
        { name: 'Alice', age: 25, city: 'NYC', status: 'active' },
        { name: 'Bob', age: 30, city: 'LA', status: 'active' },
        { name: 'Charlie', age: 35, city: 'NYC', status: 'inactive' }
      ])

      // Create partial index on city
      await User.createIndex(['city'])

      // Query for non-existent city with additional filters
      // This tests the || [] branch when the index key doesn't exist
      const results = await User.find({ city: 'Miami', status: 'active' })

      assert.strictEqual(results.length, 0)
    }
  )

  await t.test(
    'should handle findOne with partial index when candidates exist but none match',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([
        { name: 'Alice', age: 25, city: 'NYC', status: 'active' },
        { name: 'Bob', age: 25, city: 'NYC', status: 'active' },
        { name: 'Charlie', age: 25, city: 'NYC', status: 'inactive' }
      ])

      // Create compound index on city and age
      await User.createIndex(['city', 'age'])

      // Query where the composite key (NYC, 25) exists in index and has candidates,
      // but none of those candidates match the additional filter (status: 'deleted')
      // This tests the case where candidates.find() returns undefined
      const result = await User.findOne({ city: 'NYC', age: 25, status: 'deleted' })

      assert.strictEqual(result, null)
    }
  )

  await t.test(
    'should handle findOne with partial index using non-existent composite key',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([
        { name: 'Alice', age: 25, city: 'NYC', dept: 'Engineering' },
        { name: 'Bob', age: 30, city: 'LA', dept: 'Sales' },
        { name: 'Charlie', age: 35, city: 'Chicago', dept: 'Marketing' }
      ])

      // Create compound index
      await User.createIndex(['city', 'dept'])

      // Query with city and dept that form a composite key that was never inserted
      // This specifically tests the || [] branch when idxMap.get(compositeKey) returns undefined
      const result = await User.findOne({ city: 'Boston', dept: 'HR', age: 40 })

      assert.strictEqual(result, null)
    }
  )

  await t.test('should use partial index in deleteMany with extra conditions', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC', status: 'active' },
      { name: 'Bob', age: 30, city: 'NYC', status: 'inactive' },
      { name: 'Charlie', age: 35, city: 'NYC', status: 'active' },
      { name: 'Diana', age: 40, city: 'LA', status: 'active' }
    ])

    // Create partial index on city
    await User.createIndex(['city'])

    // Delete with indexed field + extra condition (uses partial index)
    const result = await User.deleteMany({ city: 'NYC', status: 'active' })

    assert.strictEqual(result.deletedCount, 2) // Alice and Charlie

    const remaining = await User.find()
    assert.strictEqual(remaining.length, 2)
  })

  await t.test('should use partial index in updateMany with extra conditions', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC', status: 'pending' },
      { name: 'Bob', age: 30, city: 'NYC', status: 'pending' },
      { name: 'Charlie', age: 35, city: 'LA', status: 'pending' }
    ])

    // Create index on city
    await User.createIndex(['city'])

    // Update with indexed field + extra condition (uses partial index)
    const result = await User.updateMany(
      { city: 'NYC', status: 'pending' },
      { $set: { status: 'active' } }
    )

    assert.strictEqual(result.modifiedCount, 2) // Alice and Bob

    const active = await User.find({ status: 'active' })
    assert.strictEqual(active.length, 2)
  })

  await t.test('should handle exact index match with non-existent key (|| [] branch)', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' }
    ])

    // Create exact index
    await User.createIndex(['city', 'age'])

    // Query with exact match but key doesn't exist in map
    const results = await User.find({ city: 'Chicago', age: 40 })

    assert.strictEqual(results.length, 0)
  })

  await t.test(
    'should handle partial index match with non-existent key (|| [] branch)',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([
        { name: 'Alice', age: 25, city: 'NYC', dept: 'Engineering' },
        { name: 'Bob', age: 30, city: 'LA', dept: 'Sales' }
      ])

      // Create compound index
      await User.createIndex(['city', 'dept'])

      // Query that would use partial index but composite key doesn't exist
      const results = await User.find({ city: 'Seattle', dept: 'HR', status: 'active' })

      assert.strictEqual(results.length, 0)
    }
  )

  // Note: This test was removed because indexes are now internal to storage strategies
  // and not exposed on the Model. The behavior (returning empty results when index keys
  // don't exist) is already tested by other tests like "should handle exact index match
  // with non-existent key".

  // Note: This test was removed because indexes are now internal to storage strategies
  // and not exposed on the Model. The behavior (returning empty results for partial index
  // matches when keys don't exist) is already tested by other tests.
})
