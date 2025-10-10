import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema } from '../index'

test('Model - Edge Cases', async t => {
  await t.test('should work with empty initial data', async () => {
    const User = model('User', new Schema({}))
    const result = await User.findOne({ name: 'Alice' })

    assert.strictEqual(result, null)
  })

  await t.test('should work when no initial data is provided', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.findOne({ name: 'Alice' })
    assert.strictEqual(result?.name, 'Alice')
  })

  await t.test('should handle index on empty model', async () => {
    const User = model('User', new Schema({}))
    await User.createIndex('name')

    await User.create({ name: 'Alice', age: 25 })
    const result = await User.findOne({ name: 'Alice' })

    assert.strictEqual(result?.name, 'Alice')
  })

  await t.test('should handle nested field matching that returns false', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, profile: { verified: true } },
      { name: 'Bob', age: 30, profile: { verified: false } },
      { name: 'Charlie', age: 35, profile: { verified: true } }
    ])

    // Query that doesn't match
    const results = await User.find({ 'profile.verified': false, age: { $lt: 30 } })

    // Bob has verified: false but age is 30, not less than 30
    assert.strictEqual(results.length, 0)
  })
})
