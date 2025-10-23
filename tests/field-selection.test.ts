import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, clearRegistry } from '../index'

interface TestUser {
  name: string
  age: number
  email: string
  password: string
  city: string
}

test('Field Selection', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should select specific fields using object notation', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' },
      { name: 'Bob', age: 30, email: 'bob@example.com', password: 'pass456', city: 'LA' }
    ])

    const result = await User.findOne({ name: 'Alice' }, { select: { name: 1, age: 1 } })

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
    assert.strictEqual(result.age, 25)
    assert.strictEqual(result.email, undefined)
    assert.strictEqual(result.password, undefined)
    assert.strictEqual(result.city, undefined)
  })

  await t.test('should exclude specific fields using object notation', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' }
    ])

    const result = await User.findOne({ name: 'Alice' }, { select: { password: 0 } })

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
    assert.strictEqual(result.age, 25)
    assert.strictEqual(result.email, 'alice@example.com')
    assert.strictEqual(result.city, 'NYC')
    assert.strictEqual(result.password, undefined)
  })

  await t.test('should select fields using string notation', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' }
    ])

    const results = await User.find({ name: 'Alice' }).select('name email')

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
    assert.strictEqual(results[0].email, 'alice@example.com')
    assert.strictEqual(results[0].age, undefined)
    assert.strictEqual(results[0].password, undefined)
  })

  await t.test('should exclude fields using string notation with minus', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' }
    ])

    const results = await User.find({ name: 'Alice' }).select('-password -email')

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'Alice')
    assert.strictEqual(results[0].age, 25)
    assert.strictEqual(results[0].city, 'NYC')
    assert.strictEqual(results[0].password, undefined)
    assert.strictEqual(results[0].email, undefined)
  })

  await t.test('should work with find() and select multiple documents', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' },
      { name: 'Bob', age: 30, email: 'bob@example.com', password: 'pass456', city: 'LA' },
      { name: 'Charlie', age: 35, email: 'charlie@example.com', password: 'test789', city: 'NYC' }
    ])

    const results = await User.find({ city: 'NYC' }, { select: { name: 1, city: 1 } })

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].name, 'Alice')
    assert.strictEqual(results[0].city, 'NYC')
    assert.strictEqual(results[0].email, undefined)

    assert.strictEqual(results[1].name, 'Charlie')
    assert.strictEqual(results[1].city, 'NYC')
    assert.strictEqual(results[1].age, undefined)
  })

  await t.test('should combine select with sort and limit', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' },
      { name: 'Bob', age: 30, email: 'bob@example.com', password: 'pass456', city: 'LA' },
      { name: 'Charlie', age: 35, email: 'charlie@example.com', password: 'test789', city: 'NYC' }
    ])

    const results = await User.find().select('name age').sort({ age: -1 }).limit(2)

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].name, 'Charlie')
    assert.strictEqual(results[0].age, 35)
    assert.strictEqual(results[0].email, undefined)

    assert.strictEqual(results[1].name, 'Bob')
    assert.strictEqual(results[1].age, 30)
  })

  await t.test('should work with indexed queries', async () => {
    const User = model('User', new Schema<TestUser>({}))
    User.createIndex('name')

    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' },
      { name: 'Bob', age: 30, email: 'bob@example.com', password: 'pass456', city: 'LA' }
    ])

    const result = await User.findOne({ name: 'Alice' }, { select: { name: 1, age: 1 } })

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
    assert.strictEqual(result.age, 25)
    assert.strictEqual(result.email, undefined)
  })

  await t.test('should throw error when mixing inclusion and exclusion', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' }
    ])

    await assert.rejects(async () => {
      await User.findOne({ name: 'Alice' }, { select: { name: 1, password: 0 } })
    }, /Cannot mix inclusion and exclusion/)
  })

  await t.test('should return only _id when no other fields match inclusion', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' }
    ])

    const result = await User.findOne({ name: 'Alice' }, { select: { nonexistent: 1 } as any })

    assert.ok(result)
    // MongoDB behavior: _id is always included unless explicitly excluded
    assert.strictEqual(Object.keys(result).length, 1)
    assert.ok(result._id)
  })

  await t.test('should handle empty select object', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' }
    ])

    const result = await User.findOne({ name: 'Alice' }, { select: {} })

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
    assert.strictEqual(result.age, 25)
    assert.strictEqual(result.email, 'alice@example.com')
  })

  await t.test('should work with partial index and field selection', async () => {
    const User = model('User', new Schema<TestUser>({}))
    User.createIndex(['city', 'age'])

    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' },
      { name: 'Bob', age: 30, email: 'bob@example.com', password: 'pass456', city: 'LA' },
      { name: 'Charlie', age: 25, email: 'charlie@example.com', password: 'test789', city: 'NYC' }
    ])

    // Query using partial index (city, age) with extra field and selection
    const result = await User.findOne(
      { city: 'NYC', age: 25, name: 'Alice' },
      { select: { name: 1, city: 1 } }
    )

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
    assert.strictEqual(result.city, 'NYC')
    assert.strictEqual(result.age, undefined)
    assert.strictEqual(result.email, undefined)
  })

  await t.test('should select fields using string notation on findOne()', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' }
    ])

    const result = await User.findOne({ name: 'Alice' }).select('name email city')

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
    assert.strictEqual(result.email, 'alice@example.com')
    assert.strictEqual(result.city, 'NYC')
    assert.strictEqual(result.age, undefined)
    assert.strictEqual(result.password, undefined)
  })

  await t.test('should exclude fields using string notation with minus on findOne()', async () => {
    const User = model('User', new Schema<TestUser>({}))
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'secret123', city: 'NYC' }
    ])

    const result = await User.findOne({ name: 'Alice' }).select('-password -email')

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
    assert.strictEqual(result.age, 25)
    assert.strictEqual(result.city, 'NYC')
    assert.strictEqual(result.password, undefined)
    assert.strictEqual(result.email, undefined)
  })

  await t.test('should select fields using string notation on findById()', async () => {
    const User = model('User', new Schema<TestUser>({}))
    const user = await User.create({
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
      password: 'secret123',
      city: 'NYC'
    })

    const result = await User.findById(user._id).select('name age')

    assert.ok(result)
    assert.strictEqual(result.name, 'Alice')
    assert.strictEqual(result.age, 25)
    assert.strictEqual(result.email, undefined)
    assert.strictEqual(result.password, undefined)
    assert.strictEqual(result.city, undefined)
  })

  await t.test('should exclude fields using string notation with minus on findById()', async () => {
    const User = model('User', new Schema<TestUser>({}))
    const user = await User.create({
      name: 'Bob',
      age: 30,
      email: 'bob@example.com',
      password: 'pass456',
      city: 'LA'
    })

    const result = await User.findById(user._id).select('-password -city')

    assert.ok(result)
    assert.strictEqual(result.name, 'Bob')
    assert.strictEqual(result.age, 30)
    assert.strictEqual(result.email, 'bob@example.com')
    assert.strictEqual(result.password, undefined)
    assert.strictEqual(result.city, undefined)
  })
})
