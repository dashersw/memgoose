import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, DocumentQueryBuilder, clearRegistry } from '../index'
import { testUsers } from './fixtures'

test('Model - find() method', async t => {
  await t.test('should find all documents with empty query', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const results = await User.find()

    assert.strictEqual(results.length, 5)
  })

  await t.test('should find all documents matching a simple query', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const results = await User.find({ city: 'New York' })

    assert.strictEqual(results.length, 2)
    assert.ok(results.every(r => r.city === 'New York'))
  })

  await t.test('should return empty array when no documents match', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const results = await User.find({ name: 'Zack' })

    assert.strictEqual(results.length, 0)
    assert.ok(Array.isArray(results))
  })

  await t.test('should support query operators', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const results = await User.find({ age: { $gte: 35 } })

    assert.strictEqual(results.length, 2) // Charlie (40) and Eve (35)
    assert.ok(results.every(r => r.age >= 35))
  })

  await t.test('should use index for O(1) lookup with equality query', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    User.createIndex('city')

    // Spy on Array.prototype.filter
    let filterCallCount = 0
    const originalFilter = Array.prototype.filter
    Array.prototype.filter = function (...args) {
      filterCallCount++
      return originalFilter.apply(this, args)
    }

    const results = await User.find({ city: 'New York' })

    assert.strictEqual(results.length, 2)
    assert.ok(results.every(r => r.city === 'New York'))

    // Verify Array.filter was NOT called (index was used)
    assert.strictEqual(filterCallCount, 0, 'Array.filter should not be called for indexed queries')

    Array.prototype.filter = originalFilter
  })

  await t.test('should fall back to linear scan for non-indexed fields', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    User.createIndex('name') // Only index name, not age

    // Spy on Array.prototype.filter
    let filterCallCount = 0
    const originalFilter = Array.prototype.filter
    Array.prototype.filter = function (...args) {
      filterCallCount++
      return originalFilter.apply(this, args)
    }

    const results = await User.find({ age: { $gte: 30 } })

    assert.ok(results.length > 0)
    assert.ok(results.every(r => r.age >= 30))

    // Verify Array.filter WAS called (linear scan was used)
    assert.ok(filterCallCount > 0, 'Array.filter should be called for non-indexed queries')

    Array.prototype.filter = originalFilter
  })

  await t.test('should support multi-field queries', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const results = await User.find({ city: 'New York', age: { $lt: 30 } })

    assert.strictEqual(results.length, 1) // Only Alice
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test('should return empty array when indexed value does not exist', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    User.createIndex('name')

    // Exact index match in find(), but empty result
    const results = await User.find({ name: 'NonExistent' })

    assert.strictEqual(results.length, 0)
  })

  await t.test('DocumentQueryBuilder should handle array results', async () => {
    clearRegistry()

    const User = model('User', new Schema({ name: String }))
    await User.create({ name: 'Test' })

    // Access internal _executeFindWithOptions which returns array
    const operation = async () => {
      return (User as any)._executeFindWithOptions({}, {})
    }

    const builder = new DocumentQueryBuilder(User, operation)

    // Call exec - should handle array result
    const result = await builder.exec()

    assert.ok(Array.isArray(result))
    assert.strictEqual(result.length, 1)
  })
})
