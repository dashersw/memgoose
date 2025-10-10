import { test } from 'node:test'
import assert from 'node:assert'
import { Model, Schema } from '../index'

// Test edge case: save() with schema but no virtuals (covers line 271 in model.ts)
test('Save with Schema but No Virtuals', async t => {
  await t.test('should handle save() with schema but no virtuals (line 271)', async () => {
    // Create schema with NO virtuals - this tests the defensive || [] in line 271
    const userSchema = new Schema({
      name: String,
      age: Number
    })
    // Explicitly verify no virtuals
    assert.strictEqual(userSchema.getVirtuals().size, 0)

    const User = new Model(userSchema)

    // Create document
    await User.create({ name: 'Frank', age: 40 })

    // Fetch and modify
    const user = await User.findOne({ name: 'Frank' })
    assert.ok(user)
    assert.strictEqual(user.age, 40)

    // Modify and save - this exercises line 271 where getVirtuals() returns empty Map
    user.age = 41
    user.city = 'Paris'
    await user.save()

    // Verify changes persisted
    const updated = await User.findOne({ name: 'Frank' })
    assert.ok(updated)
    assert.strictEqual(updated.age, 41)
    assert.strictEqual(updated.city, 'Paris')
  })
})
