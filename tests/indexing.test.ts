import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, clearRegistry } from '../index'
import { testUsers } from './fixtures'

test('Model - Indexing', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should create an index on a field', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])
    await User.createIndex('name')

    const result = await User.findOne({ name: 'Bob' })
    assert.strictEqual(result?.name, 'Bob')
  })

  await t.test('should use index for O(1) lookup - verify Array.find is NOT called', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])
    await User.createIndex('name')

    // Manually spy on Array.prototype.find
    let findCallCount = 0
    const originalFind = Array.prototype.find
    Array.prototype.find = function (...args) {
      findCallCount++
      return originalFind.apply(this, args)
    }

    const result = await User.findOne({ name: 'Bob' })

    // Verify the result is correct
    assert.strictEqual(result?.name, 'Bob')
    assert.strictEqual(result.age, 32)

    // Verify Array.find was NOT called (meaning index was used)
    assert.strictEqual(findCallCount, 0, 'Array.find should not be called for indexed queries')

    // Restore original
    Array.prototype.find = originalFind
  })

  await t.test('should fall back to linear scan for non-indexed fields', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])
    await User.createIndex('name') // Only index 'name', not 'age'

    // Manually spy on Array.prototype.filter (storage strategies use filter for linear scan)
    let filterCallCount = 0
    const originalFilter = Array.prototype.filter
    Array.prototype.filter = function (...args) {
      filterCallCount++
      return originalFilter.apply(this, args)
    }

    const result = await User.findOne({ age: 32 })

    // Verify the result is correct
    assert.strictEqual(result?.name, 'Bob')
    assert.strictEqual(result.age, 32)

    // Verify Array.filter WAS called (meaning linear scan was used)
    assert.ok(filterCallCount > 0, 'Array.filter should be called for non-indexed queries')

    // Restore original
    Array.prototype.filter = originalFilter
  })

  await t.test(
    'should fall back to linear scan for operator queries on indexed fields',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([...testUsers])
      await User.createIndex('age') // Index age field

      // Manually spy on Array.prototype.filter (storage strategies use filter for linear scan)
      let filterCallCount = 0
      const originalFilter = Array.prototype.filter
      Array.prototype.filter = function (...args) {
        filterCallCount++
        return originalFilter.apply(this, args)
      }

      // Query with operator - should not use index
      const result = await User.findOne({ age: { $gt: 30 } })

      // Verify the result is correct
      assert.ok(result?.age)
      assert.ok(result?.age > 30)

      // Verify Array.filter WAS called (operator queries don't use index)
      assert.ok(filterCallCount > 0, 'Array.filter should be called for operator queries')

      // Restore original
      Array.prototype.filter = originalFilter
    }
  )

  await t.test('should fall back to linear scan for multi-field queries', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])
    await User.createIndex('name')
    await User.createIndex('age')

    // Manually spy on Array.prototype.filter (storage strategies use filter for linear scan)
    let filterCallCount = 0
    const originalFilter = Array.prototype.filter
    Array.prototype.filter = function (...args) {
      filterCallCount++
      return originalFilter.apply(this, args)
    }

    // Multi-field query - should not use index
    const result = await User.findOne({ name: 'Bob', age: 32 })

    // Verify the result is correct
    assert.strictEqual(result?.name, 'Bob')

    // Verify Array.filter WAS called (multi-field queries don't use index)
    assert.ok(filterCallCount > 0, 'Array.filter should be called for multi-field queries')

    // Restore original
    Array.prototype.filter = originalFilter
  })

  await t.test('should update indexes when inserting new documents', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])
    await User.createIndex('name')

    await User.create({ name: 'George', age: 50, city: 'Sydney' })

    // Manually spy on Array.prototype.find
    let findCallCount = 0
    const originalFind = Array.prototype.find
    Array.prototype.find = function (...args) {
      findCallCount++
      return originalFind.apply(this, args)
    }

    const result = await User.findOne({ name: 'George' })
    assert.strictEqual(result?.name, 'George')
    assert.strictEqual(result.age, 50)

    // Verify Array.find was NOT called (index was used)
    assert.strictEqual(findCallCount, 0, 'Array.find should not be called after index update')

    // Restore original
    Array.prototype.find = originalFind
  })

  await t.test(
    'should handle indexed queries with multiple documents with same value',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([...testUsers])
      await User.createIndex('city')

      // Manually spy on Array.prototype.find
      let findCallCount = 0
      const originalFind = Array.prototype.find
      Array.prototype.find = function (...args) {
        findCallCount++
        return originalFind.apply(this, args)
      }

      // Should return the first matching document
      const result = await User.findOne({ city: 'New York' })
      assert.strictEqual(result?.city, 'New York')
      assert.ok(['Alice', 'Eve'].includes(result.name))

      // Verify Array.find was NOT called
      assert.strictEqual(findCallCount, 0, 'Array.find should not be called for indexed queries')

      // Restore original
      Array.prototype.find = originalFind
    }
  )

  await t.test('should return null when indexed value does not exist', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ])

    User.createIndex('name')

    // Query with indexed field but value doesn't exist in the index map
    const result = await User.findOne({ name: 'Zack' })

    assert.strictEqual(result, null)
  })

  await t.test('should rebuild indexes from schema after delete operation', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number,
      city: String
    })

    // Add indexes - these will be recreated during _rebuildIndexes
    userSchema.index('name')
    userSchema.index(['city', 'age'])

    const User = model('UserIndex', userSchema)

    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' },
      { name: 'Charlie', age: 35, city: 'Chicago' }
    ])

    // Delete a document - this triggers _rebuildIndexes which should recreate schema indexes
    await User.deleteOne({ name: 'Bob' })

    // Verify indexes still work after rebuild
    const result = await User.findOne({ name: 'Alice' })
    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')

    const result2 = await User.findOne({ city: 'NYC', age: 25 })
    assert.ok(result2)
    assert.strictEqual(result2.name, 'Alice')

    // Verify Bob was deleted
    const bobResult = await User.findOne({ name: 'Bob' })
    assert.strictEqual(bobResult, null)
  })

  await t.test('should rebuild indexes from schema after update operation', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number,
      city: String
    })

    // Add multiple indexes to trigger the rebuild loop
    userSchema.index('name')
    userSchema.index('age')
    userSchema.index(['city', 'age'])

    const User = model('UserIndex', userSchema)

    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' }
    ])

    // Update triggers _rebuildIndexes
    await User.updateOne({ name: 'Alice' }, { $set: { age: 26 } })

    // Verify indexes were rebuilt and still work
    const result = await User.findOne({ name: 'Alice' })
    assert.ok(result)
    assert.strictEqual(result.age, 26)

    const result2 = await User.findOne({ city: 'NYC', age: 26 })
    assert.ok(result2)
    assert.strictEqual(result2.name, 'Alice')
  })

  await t.test('should enforce unique constraint on single field index', async () => {
    const User = model('User', new Schema({}))
    User.createIndex('email', { unique: true })

    await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })

    await assert.rejects(
      async () => {
        await User.create({ name: 'Bob', email: 'alice@example.com', age: 30 })
      },
      {
        message: /E11000 duplicate key error: email must be unique/
      }
    )
  })

  await t.test('should enforce unique constraint from schema', async () => {
    const userSchema = new Schema({
      name: String,
      email: String,
      age: Number
    })

    userSchema.index('email', { unique: true })

    const User = model('UserIndex', userSchema)
    await User.create({ name: 'Alice', email: 'unique@example.com', age: 25 })

    await assert.rejects(
      async () => {
        await User.create({ name: 'Bob', email: 'unique@example.com', age: 30 })
      },
      {
        message: /E11000 duplicate key error: email must be unique/
      }
    )
  })

  await t.test('should enforce unique constraint on compound index', async () => {
    const User = model('User', new Schema({}))
    User.createIndex(['city', 'email'], { unique: true })

    await User.create({ name: 'Alice', city: 'NYC', email: 'alice@example.com', age: 25 })

    // Same email in different city - should pass
    const bob = await User.create({ name: 'Bob', city: 'LA', email: 'alice@example.com', age: 30 })
    assert.strictEqual(bob.name, 'Bob')

    // Same city AND email - should fail
    await assert.rejects(
      async () => {
        await User.create({ name: 'Charlie', city: 'NYC', email: 'alice@example.com', age: 35 })
      },
      {
        message: /E11000 duplicate key error: city, email must be unique/
      }
    )
  })

  await t.test('should check unique constraints on insertMany', async () => {
    const User = model('User', new Schema({}))
    User.createIndex('email', { unique: true })

    await assert.rejects(
      async () => {
        await User.insertMany([
          { name: 'Alice', email: 'same@example.com', age: 25 },
          { name: 'Bob', email: 'same@example.com', age: 30 }
        ])
      },
      {
        message: /E11000 duplicate key error: email must be unique/
      }
    )

    // Should not have inserted any documents (atomic)
    const count = await User.countDocuments()
    assert.strictEqual(count, 0)
  })

  await t.test('should check unique constraints on updateOne', async () => {
    const User = model('User', new Schema({}))
    User.createIndex('email', { unique: true })

    await User.insertMany([
      { name: 'Alice', email: 'alice@example.com', age: 25 },
      { name: 'Bob', email: 'bob@example.com', age: 30 }
    ])

    await assert.rejects(
      async () => {
        await User.updateOne({ name: 'Bob' }, { $set: { email: 'alice@example.com' } })
      },
      {
        message: /E11000 duplicate key error: email must be unique/
      }
    )

    // Bob's email should not have changed
    const bob = await User.findOne({ name: 'Bob' })
    assert.strictEqual(bob?.email, 'bob@example.com')
  })

  await t.test('should allow updating document to same unique value (self-update)', async () => {
    const User = model('User', new Schema({}))
    User.createIndex('email', { unique: true })

    await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })

    // Updating Alice's age while keeping the same email should work
    const result = await User.updateOne({ email: 'alice@example.com' }, { $set: { age: 26 } })
    assert.strictEqual(result.modifiedCount, 1)

    const alice = await User.findOne({ email: 'alice@example.com' })
    assert.strictEqual(alice?.age, 26)
  })

  await t.test('should check unique constraints in findOneAndUpdate', async () => {
    const User = model('User', new Schema({}))
    User.createIndex('email', { unique: true })

    await User.insertMany([
      { name: 'Alice', email: 'alice@example.com', age: 25 },
      { name: 'Bob', email: 'bob@example.com', age: 30 }
    ])

    await assert.rejects(
      async () => {
        await User.findOneAndUpdate({ name: 'Bob' }, { $set: { email: 'alice@example.com' } })
      },
      {
        message: /E11000 duplicate key error: email must be unique/
      }
    )
  })

  await t.test('should auto-create unique index from field definition', async () => {
    const userSchema = new Schema({
      email: { type: String, unique: true },
      name: String
    })
    const User = model('UserAutoIndex', userSchema)

    // Index should be auto-created, so unique constraint should work
    await User.create({ email: 'alice@example.com', name: 'Alice' })

    await assert.rejects(
      async () => await User.create({ email: 'alice@example.com', name: 'Bob' }),
      {
        message: /E11000 duplicate key error: email must be unique/
      }
    )
  })
})
