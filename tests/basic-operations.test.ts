import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, clearRegistry } from '../index'
import { testUsers } from './fixtures'

test('Model - Basic Operations', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should find document with simple equality query', async () => {
    const User = model('User1', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ name: 'Bob' })

    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Bob')
    assert.strictEqual(result.age, 32)
  })

  await t.test('should return null when no document matches', async () => {
    const User = model('User2', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ name: 'Zack' })

    assert.strictEqual(result, null)
  })

  await t.test('should insert a new document with create', async () => {
    const User = model('User3', new Schema({}))
    await User.insertMany([...testUsers])
    await User.create({ name: 'Frank', age: 45, city: 'Berlin' })

    const result = await User.findOne({ name: 'Frank' })

    assert.ok(result?.name)
    assert.ok(result?.age)
    assert.strictEqual(result.name, 'Frank')
    assert.strictEqual(result.age, 45)
  })

  await t.test('should insert multiple documents with insertMany', async () => {
    const User = model('User4', new Schema({}))
    await User.insertMany([...testUsers])
    await User.insertMany([
      { name: 'Frank', age: 45, city: 'Berlin' },
      { name: 'George', age: 50, city: 'Sydney' }
    ])

    const frank = await User.findOne({ name: 'Frank' })
    const george = await User.findOne({ name: 'George' })

    assert.ok(frank?.name)
    assert.strictEqual(frank.name, 'Frank')
    assert.ok(george?.name)
    assert.strictEqual(george.name, 'George')
  })

  await t.test('should save a document using create method', async () => {
    const User = model('User5', new Schema({}))
    await User.insertMany([...testUsers])
    await User.create({ name: 'Helen', age: 33, city: 'Madrid' })

    const result = await User.findOne({ name: 'Helen' })

    assert.ok(result?.name)
    assert.strictEqual(result.name, 'Helen')
    assert.strictEqual(result.age, 33)
  })
})
