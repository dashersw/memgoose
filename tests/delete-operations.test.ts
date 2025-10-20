import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, clearRegistry } from '../index'
import { testUsers } from './fixtures'

test('Delete Operations', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should delete one document', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])

    const result = await User.deleteOne({ name: 'Bob' })
    assert.strictEqual(result.deletedCount, 1)

    const remaining = await User.find()
    assert.strictEqual(remaining.length, 4)
    assert.ok(!remaining.some(u => u.name === 'Bob'))
  })

  await t.test('should return 0 when deleteOne finds no match', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])

    const result = await User.deleteOne({ name: 'Zack' })
    assert.strictEqual(result.deletedCount, 0)

    const remaining = await User.find()
    assert.strictEqual(remaining.length, 5)
  })

  await t.test('should delete many documents', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])

    const result = await User.deleteMany({ city: 'New York' })
    assert.strictEqual(result.deletedCount, 2) // Alice and Eve

    const remaining = await User.find()
    assert.strictEqual(remaining.length, 3)
    assert.ok(!remaining.some(u => u.city === 'New York'))
  })

  await t.test('should delete all with empty query', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])

    const result = await User.deleteMany({})
    assert.strictEqual(result.deletedCount, 5)

    const remaining = await User.find()
    assert.strictEqual(remaining.length, 0)
  })

  await t.test('should rebuild indexes after deletion', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])
    User.createIndex('name')

    await User.deleteOne({ name: 'Bob' })

    // Spy to verify index still works
    let findCallCount = 0
    const originalFind = Array.prototype.find
    Array.prototype.find = function (...args) {
      findCallCount++
      return originalFind.apply(this, args)
    }

    const result = await User.findOne({ name: 'Alice' })
    assert.strictEqual(result?.name, 'Alice')
    assert.strictEqual(findCallCount, 0, 'Index should still work after deletion')

    Array.prototype.find = originalFind
  })

  await t.test('should delete with query operators', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])

    const result = await User.deleteMany({ age: { $gte: 35 } })
    assert.strictEqual(result.deletedCount, 2) // Charlie (40) and Eve (35)

    const remaining = await User.find()
    assert.ok(remaining.every(u => u.age < 35))
  })

  await t.test('should delete using indexed query', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([...testUsers])
    User.createIndex('city')

    const result = await User.deleteMany({ city: 'London' })
    assert.strictEqual(result.deletedCount, 1) // Bob

    const remaining = await User.find()
    assert.strictEqual(remaining.length, 4)
  })

  await t.test(
    'should handle deleteOne with storage inconsistency (phantom document)',
    async () => {
      const userSchema = new Schema({
        name: String,
        age: Number
      })

      let postHookDeleteCount = -1
      userSchema.post('delete', ({ deletedCount }) => {
        postHookDeleteCount = deletedCount
      })

      const User = model('UserDelete', userSchema)
      await User.insertMany([
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 }
      ])

      // Create a phantom document (not in storage)
      const phantomDoc = { name: 'Ghost', age: 999 }

      // Mock _findDocumentsUsingIndexes to return phantom doc
      const originalFind = (User as any)._findDocumentsUsingIndexes.bind(User)
      ;(User as any)._findDocumentsUsingIndexes = async function () {
        // Return phantom document that won't be in storage
        return [phantomDoc]
      }

      // Now call deleteOne - with storage strategy, it will attempt to remove phantom
      // but the storage won't have it, so it succeeds trivially
      const result = await User.deleteOne({ name: 'Ghost' })

      // With storage strategy, remove is called regardless
      // The storage handles the actual deletion - memory strategy won't find it
      assert.strictEqual(result.deletedCount, 1)
      assert.strictEqual(postHookDeleteCount, 1)

      // Restore original method
      ;(User as any)._findDocumentsUsingIndexes = originalFind

      // Verify original data is intact
      const allDocs = await User.find()
      assert.strictEqual(allDocs.length, 2)
    }
  )

  await t.test(
    'should delete document directly from _data (not affected by findOne mocking)',
    async () => {
      const userSchema = new Schema({
        name: String,
        age: Number
      })

      const User = model('UserDelete', userSchema)
      await User.insertMany([
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 }
      ])

      // Even if we mock findOne, deleteOne should still work because it uses _data.find directly
      const originalFindOne = User.findOne.bind(User)
      ;(User as any).findOne = function () {
        // Return a builder that returns null (wrong result)
        return {
          exec: async () => null,
          then: (resolve: any) => Promise.resolve(null).then(resolve),
          select: function () {
            return this
          },
          lean: function () {
            return this
          },
          populate: function () {
            return this
          }
        }
      }

      // Call deleteOne - should still work because it doesn't use findOne
      const result = await User.deleteOne({ name: 'Alice' })

      // Should delete successfully
      assert.strictEqual(result.deletedCount, 1)

      // Restore
      ;(User as any).findOne = originalFindOne

      // Verify Alice was actually deleted
      const alice = await User.findOne({ name: 'Alice' })
      assert.strictEqual(alice, null)
    }
  )
})
