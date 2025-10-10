import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema } from '../index'
import { testUsers } from './fixtures'

test('Query Chaining', async t => {
  await t.test('should sort results in ascending order', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const results = await User.find({}, { sort: { age: 1 } })

    assert.strictEqual(results.length, 5)
    assert.strictEqual(results[0].age, 25) // Alice
    assert.strictEqual(results[1].age, 28) // Diana
    assert.strictEqual(results[2].age, 32) // Bob
    assert.strictEqual(results[3].age, 35) // Eve
    assert.strictEqual(results[4].age, 40) // Charlie
  })

  await t.test('should sort results in descending order', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const results = await User.find({}, { sort: { age: -1 } })

    assert.strictEqual(results[0].age, 40) // Charlie
    assert.strictEqual(results[4].age, 25) // Alice
  })

  await t.test('should limit results', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const results = await User.find({}, { limit: 2 })

    assert.strictEqual(results.length, 2)
  })

  await t.test('should skip results', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const results = await User.find({}, { sort: { age: 1 }, skip: 2 })

    assert.strictEqual(results.length, 3)
    assert.strictEqual(results[0].age, 32) // Bob (skipped Alice and Diana)
  })

  await t.test('should combine sort, skip, and limit', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const results = await User.find(
      {},
      {
        sort: { age: 1 },
        skip: 1,
        limit: 2
      }
    )

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].age, 28) // Diana (2nd youngest)
    assert.strictEqual(results[1].age, 32) // Bob (3rd youngest)
  })

  await t.test('should support chainable query builder', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const results = await User.find({}).sort({ age: 1 }).skip(1).limit(2).exec()

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].age, 28)
    assert.strictEqual(results[1].age, 32)
  })

  await t.test('should support chaining with query', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const results = await User.find({ age: { $gte: 30 } })
      .sort({ age: -1 })
      .limit(2)
      .exec()

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].age, 40) // Charlie
    assert.strictEqual(results[1].age, 35) // Eve
  })

  await t.test('should sort by multiple fields', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 30, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' },
      { name: 'Charlie', age: 25, city: 'NYC' }
    ])

    const results = await User.find({}, { sort: { age: 1, name: 1 } })

    assert.strictEqual(results[0].name, 'Charlie') // age 25
    assert.strictEqual(results[1].name, 'Alice') // age 30, 'Alice' < 'Bob'
    assert.strictEqual(results[2].name, 'Bob') // age 30
  })

  await t.test('options and chaining should produce identical results', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const withOptions = await User.find(
      { age: { $gte: 30 } },
      {
        sort: { age: -1 },
        limit: 2
      }
    )

    const User2 = model('User2', new Schema({}))
    await User2.insertMany(testUsers.map(u => ({ ...u })))

    const withChaining = await User2.find({ age: { $gte: 30 } })
      .sort({ age: -1 })
      .limit(2)
      .exec()

    assert.strictEqual(withOptions.length, withChaining.length)
    assert.strictEqual(withOptions[0].name, withChaining[0].name)
    assert.strictEqual(withOptions[1].name, withChaining[1].name)
  })

  await t.test('should handle sort with equal values (return 0 in comparator)', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 25, city: 'LA' },
      { name: 'Charlie', age: 25, city: 'Chicago' }
    ])

    // Sort by age where all values are equal - should hit return 0 in comparator
    const results = await User.find({ age: { $gte: 20 } }, { sort: { age: 1 } })

    assert.strictEqual(results.length, 3)
    // All have same age, so order should be preserved (stable sort returns 0)
  })

  await t.test('should handle sort with multiple equal comparisons', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 25, city: 'NYC' },
      { name: 'Charlie', age: 25, city: 'NYC' },
      { name: 'Diana', age: 25, city: 'NYC' }
    ])

    // Sort by age and city where all values are exactly equal
    const results = await User.find({}, { sort: { age: 1, city: 1 } })

    assert.strictEqual(results.length, 4)
    // All have same age and city, so comparator returns 0
  })

  await t.test('should support string notation for sort ascending', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Charlie', age: 35 },
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    const results = await User.find().sort('age')

    assert.strictEqual(results.length, 3)
    assert.strictEqual(results[0].name, 'Alice')
    assert.strictEqual(results[1].name, 'Bob')
    assert.strictEqual(results[2].name, 'Charlie')
  })

  await t.test('should support string notation for sort descending', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Charlie', age: 35 },
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    const results = await User.find().sort('-age')

    assert.strictEqual(results.length, 3)
    assert.strictEqual(results[0].name, 'Charlie')
    assert.strictEqual(results[1].name, 'Bob')
    assert.strictEqual(results[2].name, 'Alice')
  })

  await t.test('should support multi-field string notation for sort', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Charlie', age: 30, city: 'NYC' },
      { name: 'Alice', age: 30, city: 'LA' },
      { name: 'Bob', age: 25, city: 'NYC' },
      { name: 'Diana', age: 30, city: 'Chicago' }
    ])

    // Sort by age ascending, then name descending
    const results = await User.find().sort('age -name')

    assert.strictEqual(results.length, 4)
    assert.strictEqual(results[0].name, 'Bob') // age 25
    assert.strictEqual(results[1].name, 'Diana') // age 30, name D
    assert.strictEqual(results[2].name, 'Charlie') // age 30, name C
    assert.strictEqual(results[3].name, 'Alice') // age 30, name A
  })

  await t.test('should support plus prefix for explicit ascending sort', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Charlie', age: 35 },
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    const results = await User.find().sort('+age')

    assert.strictEqual(results.length, 3)
    assert.strictEqual(results[0].name, 'Alice')
    assert.strictEqual(results[1].name, 'Bob')
    assert.strictEqual(results[2].name, 'Charlie')
  })

  await t.test('should combine string sort with select and limit', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Charlie', age: 35, email: 'charlie@example.com' },
      { name: 'Alice', age: 25, email: 'alice@example.com' },
      { name: 'Bob', age: 30, email: 'bob@example.com' },
      { name: 'Diana', age: 40, email: 'diana@example.com' }
    ])

    const results = await User.find().sort('-age').select('name age').limit(2)

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].name, 'Diana')
    assert.strictEqual(results[0].age, 40)
    assert.strictEqual(results[0].email, undefined)

    assert.strictEqual(results[1].name, 'Charlie')
    assert.strictEqual(results[1].age, 35)
  })

  await t.test('should handle populate when _populate is undefined (defensive code)', async () => {
    const User = model('User', new Schema({}))
    const builder = User.find()

    // Manually set _populate to undefined to test the || [] branch
    ;(builder as any)._populate = undefined

    // Now call populate - should handle undefined gracefully
    builder.populate('someField')

    // Verify it works
    assert.ok((builder as any)._populate)
    assert.ok(Array.isArray((builder as any)._populate))
  })
})
