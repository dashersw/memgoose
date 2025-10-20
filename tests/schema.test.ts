import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model, clearRegistry } from '../index'

test('Schema and Model Factory', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should create model from schema', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number
    })

    const User = model('User', userSchema)
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.findOne({ name: 'Alice' })
    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Alice')
  })

  await t.test('should auto-create indexes from schema', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number
    })

    userSchema.index('name')

    const User = model('User', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 32 }
    ])

    // Spy to verify index is used
    let findCallCount = 0
    const originalFind = Array.prototype.find
    Array.prototype.find = function (...args) {
      findCallCount++
      return originalFind.apply(this, args)
    }

    const result = await User.findOne({ name: 'Bob' })
    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Bob')

    // Verify Array.find was NOT called (index from schema was used)
    assert.strictEqual(findCallCount, 0, 'Index from schema should be used')

    Array.prototype.find = originalFind
  })

  await t.test('should support chained index definitions', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number,
      email: String
    })

    userSchema.index('name').index('email')

    const User = model('User', userSchema)
    await User.create({ name: 'Alice', age: 25, email: 'alice@example.com' })

    const result = await User.findOne({ email: 'alice@example.com' })
    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Alice')
  })

  await t.test('should auto-create multiple indexes from schema', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number,
      city: String,
      status: String
    })

    // Add multiple indexes to ensure loop executes multiple times
    userSchema.index('name')
    userSchema.index('age')
    userSchema.index(['city', 'age'])
    userSchema.index(['name', 'status'])

    const User = model('UserMultipleIndexes', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC', status: 'active' },
      { name: 'Bob', age: 30, city: 'LA', status: 'inactive' }
    ])

    // Verify indexes work
    const result1 = await User.findOne({ name: 'Alice' })
    assert.ok(result1)
    assert.strictEqual(result1.name, 'Alice')

    const result2 = await User.findOne({ city: 'NYC', age: 25 })
    assert.ok(result2)
    assert.strictEqual(result2.name, 'Alice')

    const result3 = await User.findOne({ name: 'Bob', status: 'inactive' })
    assert.ok(result3)
    assert.strictEqual(result3.name, 'Bob')
  })

  await t.test('should auto-create indexes in Model constructor from schema', async () => {
    // Create schema with indexes
    const userSchema = new Schema({
      name: String,
      age: Number,
      city: String
    })

    // Add indexes to schema
    userSchema.index('name')
    userSchema.index(['city', 'age'])

    // Create Model with schema via factory - triggers auto-index creation
    const User = model('UserAutoIndex1', userSchema)

    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' }
    ])

    // Verify indexes were created and work
    const result = await User.findOne({ name: 'Alice' })
    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')

    const result2 = await User.findOne({ city: 'NYC', age: 25 })
    assert.ok(result2)
    assert.strictEqual(result2.name, 'Alice')
  })

  await t.test('should handle schema with multiple indexes in constructor', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number,
      city: String
    })

    // Add multiple indexes to ensure loop executes multiple times
    userSchema.index('name')
    userSchema.index('age')
    userSchema.index('city')
    userSchema.index(['name', 'age'])
    userSchema.index(['city', 'age'])

    // Create Model with schema - should auto-create all indexes
    const User = model('UserAutoIndex2', userSchema)

    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' },
      { name: 'Charlie', age: 25, city: 'Chicago' }
    ])

    // Test each index works
    const byName = await User.findOne({ name: 'Bob' })
    assert.strictEqual(byName?.name, 'Bob')

    const byAge = await User.find({ age: 25 })
    assert.strictEqual(byAge.length, 2)

    const byCity = await User.findOne({ city: 'LA' })
    assert.strictEqual(byCity?.name, 'Bob')

    const byCompound = await User.findOne({ name: 'Alice', age: 25 })
    assert.strictEqual(byCompound?.name, 'Alice')
  })
})
