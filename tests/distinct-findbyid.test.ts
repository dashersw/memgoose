import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema } from '../index'
import { testUsers } from './fixtures'

test('Distinct and FindById', async t => {
  await t.test('should get distinct values for a field', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const cities = await User.distinct('city')

    assert.strictEqual(cities.length, 4) // New York, London, Paris, Tokyo
    assert.ok(cities.includes('New York'))
    assert.ok(cities.includes('London'))
    assert.ok(cities.includes('Paris'))
    assert.ok(cities.includes('Tokyo'))
  })

  await t.test('should get distinct values with query filter', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const cities = await User.distinct('city', { age: { $gte: 35 } })

    assert.strictEqual(cities.length, 2) // Paris (Charlie), New York (Eve)
    assert.ok(cities.includes('Paris'))
    assert.ok(cities.includes('New York'))
  })

  await t.test('should handle distinct on numeric fields', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const ages = await User.distinct('age')

    assert.strictEqual(ages.length, 5)
    assert.ok(ages.includes(25))
    assert.ok(ages.includes(32))
    assert.ok(ages.includes(40))
    assert.ok(ages.includes(28))
    assert.ok(ages.includes(35))
  })

  await t.test('should handle distinct with no matches', async () => {
    const User = model('User', new Schema({}))
    await User.insertMany(testUsers.map(u => ({ ...u })))

    const names = await User.distinct('name', { age: { $gt: 100 } })

    assert.strictEqual(names.length, 0)
  })

  await t.test('should findById when _id field exists', async () => {
    interface UserWithId {
      _id: string
      name: string
      age: number
    }

    const User = model('User', new Schema<UserWithId>({}))
    await User.insertMany([
      { _id: '1', name: 'Alice', age: 25 },
      { _id: '2', name: 'Bob', age: 30 },
      { _id: '3', name: 'Charlie', age: 35 }
    ])

    const result = await User.findById('2')

    assert.ok(result)
    assert.strictEqual(result._id, '2')
    assert.strictEqual(result.name, 'Bob')
  })

  await t.test('should return null when findById does not match', async () => {
    interface UserWithId {
      _id: string
      name: string
    }

    const User = model('User', new Schema<UserWithId>({}))
    await User.create({ _id: '1', name: 'Alice' })

    const result = await User.findById('999')
    assert.strictEqual(result, null)
  })

  await t.test('findById should use index if _id is indexed', async () => {
    interface UserWithId {
      _id: string
      name: string
    }

    const User = model('User', new Schema<UserWithId>({}))
    await User.insertMany([
      { _id: '1', name: 'Alice' },
      { _id: '2', name: 'Bob' },
      { _id: '3', name: 'Charlie' }
    ])
    await User.createIndex('_id')

    let findCallCount = 0
    const originalFind = Array.prototype.find
    Array.prototype.find = function (...args) {
      findCallCount++
      return originalFind.apply(this, args)
    }

    const result = await User.findById('2')
    assert.strictEqual(result?.name, 'Bob')
    assert.strictEqual(findCallCount, 0, '_id index should be used')

    Array.prototype.find = originalFind
  })
})
