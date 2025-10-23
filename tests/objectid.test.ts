import { test } from 'node:test'
import assert from 'node:assert'
import { ObjectId, Schema, model, clearRegistry } from '../index'

test('ObjectId', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should generate valid ObjectId', () => {
    const id = new ObjectId()
    const idStr = id.toString()

    assert.strictEqual(idStr.length, 24)
    assert.ok(/^[0-9a-f]{24}$/.test(idStr))
  })

  await t.test('should create ObjectId from string', () => {
    const idStr = '507f1f77bcf86cd799439011'
    const id = new ObjectId(idStr)

    assert.strictEqual(id.toString(), idStr)
  })

  await t.test('should create ObjectId from uppercase string', () => {
    const idStr = '507F1F77BCF86CD799439011'
    const id = new ObjectId(idStr)

    assert.strictEqual(id.toString(), idStr.toLowerCase())
  })

  await t.test('should throw error for invalid ObjectId string', () => {
    assert.throws(() => {
      new ObjectId('invalid')
    }, /Invalid ObjectId/)

    assert.throws(() => {
      new ObjectId('507f1f77bcf86cd79943901') // Too short
    }, /Invalid ObjectId/)

    assert.throws(() => {
      new ObjectId('507f1f77bcf86cd799439011z') // Invalid character
    }, /Invalid ObjectId/)
  })

  await t.test('should generate unique ObjectIds', () => {
    const id1 = new ObjectId()
    const id2 = new ObjectId()
    const id3 = new ObjectId()

    assert.notStrictEqual(id1.toString(), id2.toString())
    assert.notStrictEqual(id2.toString(), id3.toString())
    assert.notStrictEqual(id1.toString(), id3.toString())
  })

  await t.test('should convert to JSON', () => {
    const id = new ObjectId()
    const json = id.toJSON()

    assert.strictEqual(typeof json, 'string')
    assert.strictEqual(json, id.toString())
  })

  await t.test('should compare ObjectIds with equals', () => {
    const idStr = '507f1f77bcf86cd799439011'
    const id1 = new ObjectId(idStr)
    const id2 = new ObjectId(idStr)
    const id3 = new ObjectId()

    assert.strictEqual(id1.equals(id2), true)
    assert.strictEqual(id1.equals(id3), false)
  })

  await t.test('should compare ObjectId with string', () => {
    const idStr = '507f1f77bcf86cd799439011'
    const id = new ObjectId(idStr)

    assert.strictEqual(id.equals(idStr), true)
    assert.strictEqual(id.equals('different'), false)
  })

  await t.test('should handle null/undefined in equals', () => {
    const id = new ObjectId()

    assert.strictEqual(id.equals(null), false)
    assert.strictEqual(id.equals(undefined), false)
  })

  await t.test('should extract timestamp from ObjectId', () => {
    const beforeCreate = Date.now()
    const id = new ObjectId()
    const afterCreate = Date.now()

    const timestamp = id.getTimestamp()

    assert.ok(timestamp instanceof Date)
    assert.ok(timestamp.getTime() >= beforeCreate - 1000) // Allow 1s tolerance
    assert.ok(timestamp.getTime() <= afterCreate + 1000)
  })

  await t.test('should validate ObjectId with isValid static method', () => {
    assert.strictEqual(ObjectId.isValid('507f1f77bcf86cd799439011'), true)
    assert.strictEqual(ObjectId.isValid('507F1F77BCF86CD799439011'), true)
    assert.strictEqual(ObjectId.isValid('invalid'), false)
    assert.strictEqual(ObjectId.isValid('507f1f77bcf86cd79943901'), false) // Too short
    assert.strictEqual(ObjectId.isValid(null), false)
    assert.strictEqual(ObjectId.isValid(undefined), false)
    assert.strictEqual(ObjectId.isValid(123), false)
  })

  await t.test('should validate ObjectId instance with isValid', () => {
    const id = new ObjectId()
    assert.strictEqual(ObjectId.isValid(id), true)
  })

  await t.test('should auto-generate _id in create', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.ok(user._id)
    assert.ok(user._id instanceof ObjectId)
  })

  await t.test('should preserve provided _id in create', async () => {
    const User = model('User', new Schema({}))
    const customId = new ObjectId()
    const user = await User.create({ _id: customId, name: 'Bob', age: 30 })

    assert.ok(user._id)
    assert.strictEqual(user._id.toString(), customId.toString())
  })

  await t.test('should auto-generate _id for each document in insertMany', async () => {
    const User = model('User', new Schema({}))
    const users = await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35 }
    ])

    assert.ok(users[0]._id instanceof ObjectId)
    assert.ok(users[1]._id instanceof ObjectId)
    assert.ok(users[2]._id instanceof ObjectId)

    // All should be unique
    assert.notStrictEqual(users[0]._id.toString(), users[1]._id.toString())
    assert.notStrictEqual(users[1]._id.toString(), users[2]._id.toString())
  })

  await t.test('should work with findById using ObjectId', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })
    const userId = user._id

    const found = await User.findById(userId)

    assert.ok(found)
    assert.strictEqual(found.name, 'Alice')
    assert.strictEqual(found._id.toString(), userId.toString())
  })

  await t.test('should work with findById using string ID', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Bob', age: 30 })
    const userIdStr = user._id.toString()

    const found = await User.findById(userIdStr)

    assert.ok(found)
    assert.strictEqual(found.name, 'Bob')
  })

  await t.test('should work with findOne using _id', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Charlie', age: 35 })
    const userId = user._id

    const found = await User.findOne({ _id: userId })

    assert.ok(found)
    assert.strictEqual(found.name, 'Charlie')
  })

  await t.test('should serialize ObjectId in JSON', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })

    const json = JSON.stringify(user)
    const parsed = JSON.parse(json)

    assert.ok(parsed._id)
    assert.strictEqual(typeof parsed._id, 'string')
    assert.strictEqual(parsed._id.length, 24)
  })

  await t.test('should work with toJSON method', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number
    })

    const User = model('UserObjectIdJSON', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.ok(user.toJSON)
    const json = user.toJSON()

    assert.ok(json._id)
    assert.strictEqual(typeof json._id, 'string')
  })

  await t.test('should respect _id in schema with validation', async () => {
    const userSchema = new Schema({
      _id: ObjectId,
      name: { type: String, required: true },
      age: Number
    })

    const User = model('UserWithIdField', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.ok(user._id instanceof ObjectId)
  })

  await t.test('should work with findByIdAndUpdate', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })
    const userId = user._id

    const updated = await User.findByIdAndUpdate(userId, { $set: { age: 26 } })

    assert.ok(updated)
    assert.strictEqual(updated.age, 26)
    assert.strictEqual(updated._id.toString(), userId.toString())
  })

  await t.test('should work with findByIdAndDelete', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Bob', age: 30 })
    const userId = user._id

    const deleted = await User.findByIdAndDelete(userId)

    assert.ok(deleted)
    assert.strictEqual(deleted.name, 'Bob')

    const found = await User.findById(userId)
    assert.strictEqual(found, null)
  })

  await t.test('should compare ObjectId with non-ObjectId string in queries', async () => {
    const User = model('User', new Schema({}))
    const id = new ObjectId()
    await User.create({ _id: id, name: 'Alice', age: 25 })

    // Query with string representation
    const found = await User.findOne({ _id: id.toString() })

    assert.ok(found)
    assert.strictEqual(found.name, 'Alice')
  })

  await t.test('should compare non-ObjectId with ObjectId in queries', async () => {
    const User = model('User', new Schema({}))
    const idStr = new ObjectId().toString()
    await User.create({ _id: idStr, name: 'Bob', age: 30 })

    // Query with ObjectId instance (field is string, value is ObjectId)
    const found = await User.findOne({ _id: new ObjectId(idStr) })

    assert.ok(found)
    assert.strictEqual(found.name, 'Bob')
  })
})
