import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema } from '../index'
import { testUsers } from './fixtures'

test('Model - Query Operators', async t => {
  await t.test('should support $eq operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ age: { $eq: 32 } })

    assert.strictEqual(result?.name, 'Bob')
  })

  await t.test('should support $ne operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ name: { $ne: 'Alice' } })

    assert.notStrictEqual(result?.name, 'Alice')
  })

  await t.test('should support $in operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ name: { $in: ['Bob', 'Charlie'] } })

    assert.ok(result?.name)
    assert.ok(['Bob', 'Charlie'].includes(result?.name))
  })

  await t.test('should support $nin operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ name: { $nin: ['Alice', 'Bob'] } })

    assert.ok(result?.name)
    assert.ok(result && !['Alice', 'Bob'].includes(result.name))
  })

  await t.test('should support $gt operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ age: { $gt: 35 } })

    assert.ok(result?.age)
    assert.ok(result?.age > 35)
  })

  await t.test('should support $gte operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ age: { $gte: 35 } })

    assert.ok(result?.age)
    assert.ok(result?.age >= 35)
  })

  await t.test('should support $lt operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ age: { $lt: 30 } })

    assert.ok(result?.age)
    assert.ok(result?.age < 30)
  })

  await t.test('should support $lte operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ age: { $lte: 28 } })

    assert.ok(result?.age)
    assert.ok(result?.age <= 28)
  })

  await t.test('should support $regex operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ name: { $regex: '^C' } })

    assert.strictEqual(result?.name, 'Charlie')
  })

  await t.test('should support $regex with RegExp object', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers)
    const result = await User.findOne({ city: { $regex: /^New/ } })

    assert.ok(result?.city.startsWith('New'))
  })

  await t.test('should handle array matching with $all operator where no match', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, tags: ['developer', 'javascript'] },
      { name: 'Bob', age: 30, tags: ['manager', 'python'] },
      { name: 'Charlie', age: 35, tags: ['designer'] }
    ])

    // Query with $all operator where doc doesn't match
    const results = await User.find({ tags: { $all: ['developer', 'python'] } })

    // Should not find any matches (no document has both tags)
    assert.strictEqual(results.length, 0)
  })

  await t.test('should support $exists operator (field exists)', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35, city: 'LA' }
    ])

    const results = await User.find({ city: { $exists: true } })

    assert.strictEqual(results.length, 2)
    assert.ok(results.some(r => r.name === 'Alice'))
    assert.ok(results.some(r => r.name === 'Charlie'))
  })

  await t.test('should support $exists operator (field does not exist)', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35 }
    ])

    const results = await User.find({ city: { $exists: false } })

    assert.strictEqual(results.length, 2)
    assert.ok(results.some(r => r.name === 'Bob'))
    assert.ok(results.some(r => r.name === 'Charlie'))
  })

  await t.test('should support $size operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, tags: ['developer', 'javascript'] },
      { name: 'Bob', age: 30, tags: ['manager'] },
      { name: 'Charlie', age: 35, tags: ['designer', 'ui', 'ux'] }
    ])

    const results = await User.find({ tags: { $size: 2 } })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test('should support $elemMatch with simple equality', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      {
        name: 'Alice',
        age: 25,
        orders: [
          { id: 1, amount: 100 },
          { id: 2, amount: 200 }
        ]
      },
      { name: 'Bob', age: 30, orders: [{ id: 3, amount: 50 }] },
      {
        name: 'Charlie',
        age: 35,
        orders: [
          { id: 4, amount: 300 },
          { id: 5, amount: 150 }
        ]
      }
    ])

    const results = await User.find({ orders: { $elemMatch: { amount: 200 } } })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test('should support $elemMatch with operators', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      {
        name: 'Alice',
        age: 25,
        orders: [
          { id: 1, amount: 100 },
          { id: 2, amount: 200 }
        ]
      },
      { name: 'Bob', age: 30, orders: [{ id: 3, amount: 50 }] },
      {
        name: 'Charlie',
        age: 35,
        orders: [
          { id: 4, amount: 300 },
          { id: 5, amount: 150 }
        ]
      }
    ])

    const results = await User.find({ orders: { $elemMatch: { amount: { $gte: 250 } } } })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Charlie')
  })

  await t.test('should support $elemMatch with multiple conditions', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      {
        name: 'Alice',
        age: 25,
        orders: [
          { id: 1, amount: 100, status: 'completed' },
          { id: 2, amount: 200, status: 'pending' }
        ]
      },
      { name: 'Bob', age: 30, orders: [{ id: 3, amount: 250, status: 'completed' }] },
      { name: 'Charlie', age: 35, orders: [{ id: 4, amount: 300, status: 'pending' }] }
    ])

    const results = await User.find({
      orders: {
        $elemMatch: { amount: { $gte: 200 }, status: 'completed' }
      }
    })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Bob')
  })

  await t.test('should support $all operator with multiple values', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, tags: ['developer', 'javascript', 'typescript'] },
      { name: 'Bob', age: 30, tags: ['developer', 'python'] },
      { name: 'Charlie', age: 35, tags: ['javascript', 'designer'] }
    ])

    const results = await User.find({ tags: { $all: ['developer', 'javascript'] } })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test('should return empty for $elemMatch on non-array field', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' }
    ])

    const results = await User.find({ city: { $elemMatch: { status: 'active' } } })

    assert.strictEqual(results.length, 0)
  })

  await t.test('should return empty for $size on non-array field', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' }
    ])

    const results = await User.find({ city: { $size: 3 } })

    assert.strictEqual(results.length, 0)
  })

  await t.test('should support $elemMatch with $lte operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      {
        name: 'Alice',
        age: 25,
        orders: [
          { id: 1, amount: 100 },
          { id: 2, amount: 200 }
        ]
      },
      { name: 'Bob', age: 30, orders: [{ id: 3, amount: 150 }] },
      { name: 'Charlie', age: 35, orders: [{ id: 4, amount: 300 }] }
    ])

    const results = await User.find({
      orders: {
        $elemMatch: { amount: { $lte: 150 } }
      }
    })

    assert.strictEqual(results.length, 2)
    assert.ok(results.some(r => r.name === 'Alice'))
    assert.ok(results.some(r => r.name === 'Bob'))
  })

  await t.test('should support $elemMatch with $lt operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, orders: [{ id: 1, amount: 100 }] },
      { name: 'Bob', age: 30, orders: [{ id: 2, amount: 200 }] }
    ])

    const results = await User.find({
      orders: {
        $elemMatch: { amount: { $lt: 150 } }
      }
    })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test('should support $elemMatch with $ne operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, orders: [{ id: 1, status: 'completed' }] },
      { name: 'Bob', age: 30, orders: [{ id: 2, status: 'pending' }] }
    ])

    const results = await User.find({
      orders: {
        $elemMatch: { status: { $ne: 'pending' } }
      }
    })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test('should return false for unsupported operator in $elemMatch', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, orders: [{ id: 1, amount: 100 }] },
      { name: 'Bob', age: 30, orders: [{ id: 2, amount: 200 }] }
    ])

    // Using an unsupported operator in elemMatch should return no results
    const results = await User.find({
      orders: {
        $elemMatch: { amount: { $unknownOp: 100 } }
      }
    })

    assert.strictEqual(results.length, 0)
  })

  await t.test('should return false for unsupported top-level operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    // Using an unsupported operator should return no results
    const results = await User.find({
      age: { $unknownOperator: 25 }
    })

    assert.strictEqual(results.length, 0)
  })

  await t.test('should support $elemMatch with $eq operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, orders: [{ id: 1, status: 'completed' }] },
      { name: 'Bob', age: 30, orders: [{ id: 2, status: 'pending' }] }
    ])

    const results = await User.find({
      orders: {
        $elemMatch: { status: { $eq: 'completed' } }
      }
    })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
  })

  await t.test('should support $elemMatch with $gt operator', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, orders: [{ id: 1, amount: 100 }] },
      { name: 'Bob', age: 30, orders: [{ id: 2, amount: 200 }] }
    ])

    const results = await User.find({
      orders: {
        $elemMatch: { amount: { $gt: 150 } }
      }
    })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Bob')
  })

  await t.test('should handle $elemMatch with null items in array', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, orders: [null, { id: 1, amount: 100 }] },
      { name: 'Bob', age: 30, orders: [{ id: 2, amount: 200 }] }
    ])

    // $elemMatch should skip null items
    const results = await User.find({
      orders: {
        $elemMatch: { amount: { $gte: 100 } }
      }
    })

    assert.strictEqual(results.length, 2)
  })

  await t.test('should handle $elemMatch with non-object items', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, tags: ['javascript', 'python', 'ruby'] },
      { name: 'Bob', age: 30, tags: [{ skill: 'javascript' }] }
    ])

    // $elemMatch on array of primitives should return no match
    const results = await User.find({
      tags: {
        $elemMatch: { skill: 'javascript' }
      }
    })

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Bob')
  })

  await t.test('should handle $all when field is not an array', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC' },
      { name: 'Bob', age: 30, city: 'LA' }
    ])

    // $all on non-array field should return no results
    const results = await User.find({
      city: { $all: ['NYC', 'LA'] }
    })

    assert.strictEqual(results.length, 0)
  })

  await t.test('should handle $all when value is not an array', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany([{ name: 'Alice', age: 25, tags: ['javascript', 'python'] }])

    // $all with non-array value should return no results
    const results = await User.find({
      tags: { $all: 'javascript' }
    })

    assert.strictEqual(results.length, 0)
  })
})
