import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, clearRegistry } from '../index'

interface TestDoc {
  name: string
  age: number
  tags?: string[]
  city?: string
  count?: number
}

test('Update Operations', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should update with $set operator', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.updateOne({ name: 'Alice' }, { $set: { age: 26 } })
    assert.strictEqual(result.modifiedCount, 1)

    const updated = await User.findOne({ name: 'Alice' })
    assert.strictEqual(updated?.age, 26)
  })

  await t.test('should update with direct field assignment', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Bob', age: 30 })

    const result = await User.updateOne({ name: 'Bob' }, { age: 31 })
    assert.strictEqual(result.modifiedCount, 1)

    const updated = await User.findOne({ name: 'Bob' })
    assert.strictEqual(updated?.age, 31)
  })

  await t.test('should update with $unset operator', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Alice', age: 25, city: 'NYC' })

    await User.updateOne({ name: 'Alice' }, { $unset: { city: 1 } })

    const updated = await User.findOne({ name: 'Alice' })
    assert.strictEqual(updated?.city, undefined)
    assert.strictEqual(updated?.age, 25)
  })

  await t.test('should update with $inc operator', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Alice', age: 25, count: 10 })

    await User.updateOne({ name: 'Alice' }, { $inc: { age: 1, count: 5 } })

    const updated = await User.findOne({ name: 'Alice' })
    assert.strictEqual(updated?.age, 26)
    assert.strictEqual(updated?.count, 15)
  })

  await t.test('should update with $dec operator', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Bob', age: 30, count: 20 })

    await User.updateOne({ name: 'Bob' }, { $dec: { age: 2, count: 3 } })

    const updated = await User.findOne({ name: 'Bob' })
    assert.strictEqual(updated?.age, 28)
    assert.strictEqual(updated?.count, 17)
  })

  await t.test('should update with $push operator', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Alice', age: 25, tags: ['developer'] })

    await User.updateOne({ name: 'Alice' }, { $push: { tags: 'nodejs' } })

    const updated = await User.findOne({ name: 'Alice' })
    assert.deepStrictEqual(updated?.tags, ['developer', 'nodejs'])
  })

  await t.test('should update with $pull operator', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Bob', age: 30, tags: ['developer', 'nodejs', 'python'] })

    await User.updateOne({ name: 'Bob' }, { $pull: { tags: 'nodejs' } })

    const updated = await User.findOne({ name: 'Bob' })
    assert.deepStrictEqual(updated?.tags, ['developer', 'python'])
  })

  await t.test('should update with $addToSet operator', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Charlie', age: 35, tags: ['developer'] })

    await User.updateOne({ name: 'Charlie' }, { $addToSet: { tags: 'nodejs' } })
    await User.updateOne({ name: 'Charlie' }, { $addToSet: { tags: 'nodejs' } }) // Duplicate

    const updated = await User.findOne({ name: 'Charlie' })
    assert.deepStrictEqual(updated?.tags, ['developer', 'nodejs']) // No duplicate
  })

  await t.test('should update with $pop operator (remove last)', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Diana', age: 28, tags: ['a', 'b', 'c'] })

    await User.updateOne({ name: 'Diana' }, { $pop: { tags: 1 } })

    const updated = await User.findOne({ name: 'Diana' })
    assert.deepStrictEqual(updated?.tags, ['a', 'b'])
  })

  await t.test('should update with $pop operator (remove first)', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Eve', age: 32, tags: ['a', 'b', 'c'] })

    await User.updateOne({ name: 'Eve' }, { $pop: { tags: -1 } })

    const updated = await User.findOne({ name: 'Eve' })
    assert.deepStrictEqual(updated?.tags, ['b', 'c'])
  })

  await t.test('should update with $rename operator', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Frank', age: 40, city: 'Paris' })

    await User.updateOne({ name: 'Frank' }, { $rename: { city: 'location' } })

    const updated = await User.findOne({ name: 'Frank' })
    assert.strictEqual((updated as any)?.location, 'Paris')
    assert.strictEqual(updated?.city, undefined)
  })

  await t.test('should updateMany multiple documents', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35 }
    ])

    const result = await User.updateMany({ age: { $gte: 30 } }, { $inc: { age: 1 } })
    assert.strictEqual(result.modifiedCount, 2) // Bob and Charlie

    const bob = await User.findOne({ name: 'Bob' })
    const charlie = await User.findOne({ name: 'Charlie' })
    assert.strictEqual(bob?.age, 31)
    assert.strictEqual(charlie?.age, 36)
  })

  await t.test('should return 0 when no documents match', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.updateOne({ name: 'Zack' }, { $set: { age: 30 } })
    assert.strictEqual(result.modifiedCount, 0)
  })

  await t.test('should rebuild indexes after update', async () => {
    const User = model('User', new Schema<TestDoc>({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])
    await User.createIndex('age')

    await User.updateOne({ name: 'Alice' }, { $set: { age: 35 } })

    // Verify index was rebuilt
    let findCallCount = 0
    const originalFind = Array.prototype.find
    Array.prototype.find = function (...args) {
      findCallCount++
      return originalFind.apply(this, args)
    }

    const result = await User.findOne({ age: 35 })
    assert.strictEqual(result?.name, 'Alice')
    assert.strictEqual(findCallCount, 0, 'Index should be rebuilt')

    Array.prototype.find = originalFind
  })
})
