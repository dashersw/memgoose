import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, clearRegistry } from '../index'
import { testUsers, type TestUser } from './fixtures'

test('Model - Complex Queries', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should handle multi-field queries', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ name: 'Alice', age: 25 })

    assert.strictEqual(result?.name, 'Alice')
    assert.strictEqual(result.age, 25)
  })

  await t.test('should return null when multi-field query does not match', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ name: 'Alice', age: 30 })

    assert.strictEqual(result, null)
  })

  await t.test('should handle combination of operators', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({
      age: { $gte: 30, $lt: 40 }
    })

    assert.ok(result)
    assert.ok(result.age >= 30 && result.age < 40)
  })
})
