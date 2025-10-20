import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, clearRegistry } from '../index'

test('exec() functionality', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('find() should support .exec()', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    // Test with .exec()
    const results = await User.find({ age: { $gte: 25 } }).exec()
    assert.strictEqual(results.length, 2)
  })

  await t.test('find() should work without .exec() (thenable)', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    // Test without .exec() - should still work (thenable)
    const results = await User.find({ age: { $gte: 25 } })
    assert.strictEqual(results.length, 2)
  })

  await t.test('find() with chaining and exec()', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35 }
    ])

    const results = await User.find().sort('-age').limit(2).select('name age').exec()

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].name, 'Charlie')
    assert.strictEqual(results[1].name, 'Bob')
  })

  await t.test('findOne() should support .exec()', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    const result = await User.findOne({ name: 'Alice' }).exec()
    assert.strictEqual(result?.name, 'Alice')
  })

  await t.test('findOne() should work without .exec() (thenable)', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    const result = await User.findOne({ name: 'Alice' })
    assert.strictEqual(result?.name, 'Alice')
  })

  await t.test('findOne() with chaining and exec()', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com' },
      { name: 'Bob', age: 30, email: 'bob@example.com' }
    ])

    const result = await User.findOne({ name: 'Alice' }).select('name age').exec()
    assert.strictEqual(result?.name, 'Alice')
    assert.strictEqual(result?.age, 25)
    assert.strictEqual(result?.email, undefined)
  })

  await t.test('findOne() with lean() should return plain object', async () => {
    const userSchema = new Schema({ name: String, age: Number })
    userSchema.virtual('info').get(doc => `${doc.name} is ${doc.age}`)

    const User = model('User', userSchema)
    await User.create({ name: 'Alice', age: 25 })

    const resultWithVirtuals = await User.findOne({ name: 'Alice' }).exec()
    assert.strictEqual(resultWithVirtuals?.info, 'Alice is 25')

    const resultLean = await User.findOne({ name: 'Alice' }).lean().exec()
    assert.strictEqual(resultLean?.info, undefined)
  })

  await t.test('updateOne() should support .exec()', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.updateOne({ name: 'Alice' }, { $set: { age: 26 } }).exec()
    assert.strictEqual(result.modifiedCount, 1)
  })

  await t.test('updateOne() should work without .exec() (thenable)', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.updateOne({ name: 'Alice' }, { $set: { age: 26 } })
    assert.strictEqual(result.modifiedCount, 1)
  })

  await t.test('deleteOne() should support .exec()', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.deleteOne({ name: 'Alice' }).exec()
    assert.strictEqual(result.deletedCount, 1)
  })

  await t.test('deleteOne() should work without .exec() (thenable)', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.deleteOne({ name: 'Alice' })
    assert.strictEqual(result.deletedCount, 1)
  })

  await t.test('findOneAndUpdate() should support .exec()', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.findOneAndUpdate({ name: 'Alice' }, { $set: { age: 26 } }).exec()
    assert.strictEqual(result?.name, 'Alice')
    assert.strictEqual(result?.age, 26)
  })

  await t.test('findOneAndUpdate() with select() and exec()', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25, email: 'alice@example.com' })

    const result = await User.findOneAndUpdate({ name: 'Alice' }, { $set: { age: 26 } })
      .select('name age')
      .exec()

    assert.strictEqual(result?.name, 'Alice')
    assert.strictEqual(result?.age, 26)
    assert.strictEqual(result?.email, undefined)
  })

  await t.test('findOneAndDelete() should support .exec()', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.findOneAndDelete({ name: 'Alice' }).exec()
    assert.strictEqual(result?.name, 'Alice')
  })

  await t.test('findById() should support .exec()', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })

    const result = await User.findById(user._id).exec()
    assert.strictEqual(result?.name, 'Alice')
  })

  await t.test('findByIdAndUpdate() should support .exec()', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })

    const result = await User.findByIdAndUpdate(user._id, { $set: { age: 26 } }).exec()
    assert.strictEqual(result?.name, 'Alice')
    assert.strictEqual(result?.age, 26)
  })

  await t.test('findByIdAndDelete() should support .exec()', async () => {
    const User = model('User', new Schema({}))
    const user = await User.create({ name: 'Alice', age: 25 })

    const result = await User.findByIdAndDelete(user._id).exec()
    assert.strictEqual(result?.name, 'Alice')
  })
})
