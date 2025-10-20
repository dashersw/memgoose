import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, ObjectId, clearRegistry } from '../index'
import { testUsers } from './fixtures'

test('Count and Atomic Operations', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should count all documents', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)

    const count = await User.countDocuments()
    assert.strictEqual(count, 5)
  })

  await t.test('should count documents matching query', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)

    const count = await User.countDocuments({ city: 'New York' })
    assert.strictEqual(count, 2) // Alice and Eve
  })

  await t.test('should count with query operators', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)

    const count = await User.countDocuments({ age: { $gte: 35 } })
    assert.strictEqual(count, 2) // Charlie (40) and Eve (35)
  })

  await t.test('should return 0 for no matches', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)

    const count = await User.countDocuments({ name: 'Zack' })
    assert.strictEqual(count, 0)
  })

  await t.test('findOneAndUpdate should return document after update by default', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const result = await User.findOneAndUpdate({ name: 'Bob' }, { $set: { age: 33 } })

    assert.ok(result)
    assert.strictEqual(result.name, 'Bob')
    assert.strictEqual(result.age, 33) // Updated value
  })

  await t.test('findOneAndUpdate should return document before update when specified', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const result = await User.findOneAndUpdate(
      { name: 'Bob' },
      { $set: { age: 33 } },
      { returnDocument: 'before' }
    )

    assert.ok(result)
    assert.strictEqual(result.name, 'Bob')
    assert.strictEqual(result.age, 32) // Original value

    // Verify document was actually updated
    const updated = await User.findOne({ name: 'Bob' })
    assert.strictEqual(updated?.age, 33)
  })

  await t.test('findOneAndUpdate should return null when no match', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const result = await User.findOneAndUpdate({ name: 'Zack' }, { $set: { age: 50 } })

    assert.strictEqual(result, null)
  })

  await t.test('findOneAndDelete should return deleted document', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const result = await User.findOneAndDelete({ name: 'Bob' })

    assert.ok(result)
    assert.strictEqual(result.name, 'Bob')
    assert.strictEqual(result.age, 32)

    // Verify document was deleted
    const remaining = await User.find()
    assert.strictEqual(remaining.length, 4)
    assert.ok(!remaining.some(u => u.name === 'Bob'))
  })

  await t.test('findOneAndDelete should return null when no match', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const result = await User.findOneAndDelete({ name: 'Zack' })
    assert.strictEqual(result, null)

    const remaining = await User.find()
    assert.strictEqual(remaining.length, 5)
  })

  await t.test('atomic operations should work with indexed queries', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))
    User.createIndex('name')

    const result = await User.findOneAndUpdate({ name: 'Alice' }, { $inc: { age: 1 } })

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
    assert.strictEqual(result.age, 26)
  })

  await t.test('should use partial index in countDocuments()', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'New York' },
      { name: 'Bob', age: 30, city: 'Los Angeles' },
      { name: 'Charlie', age: 35, city: 'Chicago' },
      { name: 'Diana', age: 40, city: 'New York' }
    ])

    // Create compound index
    await User.createIndex(['city', 'age'])

    // Count with partial index match (city matches index but age has operator)
    const count = await User.countDocuments({ city: 'New York', age: { $gte: 30 } })

    assert.strictEqual(count, 1) // Only Diana
  })

  await t.test('should use exact compound index in countDocuments()', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'New York' },
      { name: 'Bob', age: 30, city: 'Los Angeles' },
      { name: 'Charlie', age: 25, city: 'New York' },
      { name: 'Diana', age: 40, city: 'New York' }
    ])

    // Create compound index
    await User.createIndex(['city', 'age'])

    // Count with exact compound index match
    const count = await User.countDocuments({ city: 'New York', age: 25 })

    assert.strictEqual(count, 2) // Alice and Charlie
  })

  await t.test('should handle countDocuments with multiple indexes and partial match', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'New York' },
      { name: 'Bob', age: 30, city: 'New York' },
      { name: 'Charlie', age: 35, city: 'New York' },
      { name: 'Diana', age: 40, city: 'Los Angeles' }
    ])

    // Create multiple indexes
    await User.createIndex(['city'])
    await User.createIndex(['city', 'age'])

    // This should use the compound index for partial matching
    const count = await User.countDocuments({ city: 'New York', age: { $lte: 30 } })

    assert.strictEqual(count, 2) // Alice and Bob
  })

  await t.test('should findByIdAndUpdate and return updated document', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })

    const updated = await User.findByIdAndUpdate(user._id, { $set: { age: 26 } })

    assert.ok(updated)
    assert.ok(updated._id.equals(user._id))
    assert.strictEqual(updated.age, 26)
  })

  await t.test('should findByIdAndUpdate with returnDocument before', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Bob', age: 30 })

    const result = await User.findByIdAndUpdate(
      user._id,
      { $set: { age: 31 } },
      { returnDocument: 'before' }
    )

    assert.ok(result)
    assert.strictEqual(result.age, 30) // Original value

    // Verify it was actually updated
    const updated = await User.findById(user._id)
    assert.strictEqual(updated?.age, 31)
  })

  await t.test('should findByIdAndUpdate return null when id not found', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const fakeId = new ObjectId()
    const result = await User.findByIdAndUpdate(fakeId, { $set: { age: 100 } })

    assert.strictEqual(result, null)
  })

  await t.test('should findByIdAndDelete and return deleted document', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })

    const deleted = await User.findByIdAndDelete(user._id)

    assert.ok(deleted)
    assert.ok(deleted._id.equals(user._id))
    assert.strictEqual(deleted.name, 'Alice')

    // Verify it was deleted
    const found = await User.findById(user._id)
    assert.strictEqual(found, null)
  })

  await t.test('should findByIdAndDelete return null when id not found', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })

    const fakeId = new ObjectId()
    const result = await User.findByIdAndDelete(fakeId)

    assert.strictEqual(result, null)

    // Original should still exist
    const found = await User.findById(user._id)
    assert.ok(found)
  })
})
