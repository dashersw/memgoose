import { test } from 'node:test'
import assert from 'node:assert'
import {
  Model,
  model,
  QueryBuilder,
  FindQueryBuilder,
  Schema,
  ValidationError,
  VirtualType
} from '../index'

// Test that all exports from index.ts are accessible and functional
test('Module Exports', async t => {
  await t.test('should export Model class', async () => {
    const User = new Model()
    await User.create({ name: 'Test' })
    assert.ok(User)
  })

  await t.test('should export QueryBuilder class', async () => {
    assert.ok(QueryBuilder)
    // QueryBuilder is used internally by model.find()
    const User = model('UserQB', new Schema({}))
    await User.create({ name: 'Test' })
    const results = await User.find()
    assert.ok(results)
  })

  await t.test('should export FindQueryBuilder class', async () => {
    assert.ok(FindQueryBuilder)
    // FindQueryBuilder is used internally by model.find()
    const User = model('UserFQB', new Schema({}))
    await User.create({ name: 'Test' })
    const queryBuilder = User.find()
    assert.ok(queryBuilder instanceof FindQueryBuilder)
  })

  await t.test('should export VirtualType class', async () => {
    const vt = new VirtualType()
    vt.get(doc => doc.test)
    assert.ok(vt)
  })

  await t.test('should export ValidationError class', async () => {
    const error = new ValidationError('Test error')
    assert.strictEqual(error.name, 'ValidationError')
    assert.strictEqual(error.message, 'Test error')
  })
})
