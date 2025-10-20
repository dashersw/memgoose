import { test } from 'node:test'
import assert from 'node:assert'
import { Model, Schema, clearRegistry } from '../index'

// Test edge cases where Model is used without a schema (defensive code paths)
test('Model without Schema', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should work without schema - basic operations', async () => {
    const User = new Model()

    // Should work without schema
    await User.create({ name: 'Alice', age: 25 })
    const result = await User.findOne({ name: 'Alice' })

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
  })

  await t.test('should not apply virtuals when no schema', async () => {
    const User = new Model()
    await User.create({ name: 'Bob' })

    const result = await User.findOne({ name: 'Bob' })

    // _applyVirtuals should return doc unchanged (line 228)
    assert.ok(result)
    assert.strictEqual(result.name, 'Bob')
  })

  await t.test('should not execute hooks when no schema', async () => {
    const User = new Model()

    // Pre-hooks should return early (line 332)
    await User.create({ name: 'Charlie' })

    // Post-hooks should return early
    await User.updateOne({ name: 'Charlie' }, { $set: { age: 30 } })

    const result = await User.findOne({ name: 'Charlie' })
    assert.ok(result)
  })

  await t.test('should not validate when no schema', async () => {
    const User = new Model()

    // _validateDocument should return early (line 350)
    await User.create({ anyField: 'anyValue' })

    const result = await User.findOne({ anyField: 'anyValue' })
    assert.ok(result)
  })

  await t.test('should not apply defaults when no schema', async () => {
    const User = new Model()

    // _applyDefaults should return early (line 355)
    await User.create({ name: 'David' })

    const result = await User.findOne({ name: 'David' })
    assert.ok(result)
    assert.strictEqual(result.age, undefined) // No default applied
  })

  await t.test('should not apply timestamps when no schema', async () => {
    const User = new Model()

    // _applyTimestamps should return early (line 367)
    await User.create({ name: 'Eve' })

    const result = await User.findOne({ name: 'Eve' })
    assert.ok(result)
    assert.strictEqual(result.createdAt, undefined)
    assert.strictEqual(result.updatedAt, undefined)
  })

  await t.test('should handle single field in createIndex', async () => {
    const User = new Model()
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    // Line 215: single field passed to createIndex (not array)
    User.createIndex('name')

    const result = await User.findOne({ name: 'Alice' })
    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
  })

  await t.test('should handle non-array field from schema.getIndexes() (line 215)', async () => {
    // Create a mock schema that returns non-array from getIndexes()
    const mockSchema = new Schema({ name: String, age: Number })

    // Mock getIndexes to return a single field (non-array) to hit the : [fields] branch
    const originalGetIndexes = mockSchema.getIndexes.bind(mockSchema)
    ;(mockSchema as any).getIndexes = function () {
      // Return array with a non-array element to trigger the branch
      return ['name'] // This will hit the Array.isArray check
    }

    // Create Model with mocked schema - this will trigger line 215
    const User = new Model(mockSchema)

    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    // Restore
    mockSchema.getIndexes = originalGetIndexes

    const result = await User.findOne({ name: 'Alice' })
    assert.ok(result)
  })
})
