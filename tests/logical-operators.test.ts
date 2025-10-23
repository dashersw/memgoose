import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

describe('Logical Query Operators', () => {
  interface UserInterface {
    name: string
    age: number
    status: string
    city?: string
    role?: string
  }

  const userSchema = new Schema<UserInterface>({
    name: String,
    age: Number,
    status: String,
    city: String,
    role: String
  })

  const User = model('User', userSchema)

  beforeEach(async () => {
    await User.deleteMany({})
  })

  describe('$or operator', () => {
    it('should match documents where any condition is true', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const results = await User.find({
        $or: [{ age: { $lt: 30 } }, { status: 'inactive' }]
      })

      assert.strictEqual(results.length, 2)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Alice', 'Bob'])
    })

    it('should work with multiple OR conditions', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'pending' },
        { name: 'Diana', age: 55, status: 'active' }
      ])

      const results = await User.find({
        $or: [{ age: { $lt: 30 } }, { age: { $gt: 50 } }, { status: 'inactive' }]
      })

      assert.strictEqual(results.length, 3)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Alice', 'Bob', 'Diana'])
    })

    it('should work with complex field conditions', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active', city: 'NYC' },
        { name: 'Bob', age: 35, status: 'inactive', city: 'LA' },
        { name: 'Charlie', age: 45, status: 'active', city: 'SF' }
      ])

      const results = await User.find({
        $or: [{ city: 'NYC' }, { status: 'inactive', age: { $gte: 30 } }]
      })

      assert.strictEqual(results.length, 2)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Alice', 'Bob'])
    })

    it('should return empty array when no conditions match', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'active' }
      ])

      const results = await User.find({
        $or: [{ age: { $gt: 50 } }, { status: 'deleted' }]
      })

      assert.strictEqual(results.length, 0)
    })

    it('should handle single condition in $or', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' }
      ])

      const results = await User.find({
        $or: [{ age: 25 }]
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Alice')
    })

    it('should work with $in operator inside $or', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'pending' }
      ])

      const results = await User.find({
        $or: [{ name: { $in: ['Alice', 'Bob'] } }, { status: 'pending' }]
      })

      assert.strictEqual(results.length, 3)
    })
  })

  describe('$and operator', () => {
    it('should match documents where all conditions are true', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const results = await User.find({
        $and: [{ age: { $gte: 30 } }, { status: 'active' }]
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Charlie')
    })

    it('should work with multiple AND conditions', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active', city: 'NYC' },
        { name: 'Bob', age: 35, status: 'active', city: 'NYC' },
        { name: 'Charlie', age: 45, status: 'active', city: 'LA' }
      ])

      const results = await User.find({
        $and: [{ age: { $gte: 30 } }, { status: 'active' }, { city: 'NYC' }]
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Bob')
    })

    it('should return empty array when any condition fails', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' }
      ])

      const results = await User.find({
        $and: [{ age: { $gte: 30 } }, { status: 'active' }]
      })

      assert.strictEqual(results.length, 0)
    })

    it('should handle single condition in $and', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' }
      ])

      const results = await User.find({
        $and: [{ age: 25 }]
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Alice')
    })

    it('should work with range queries', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'active' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const results = await User.find({
        $and: [{ age: { $gte: 30 } }, { age: { $lte: 40 } }]
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Bob')
    })
  })

  describe('$nor operator', () => {
    it('should match documents where none of the conditions are true', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'pending' }
      ])

      const results = await User.find({
        $nor: [{ age: { $lt: 30 } }, { status: 'inactive' }]
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Charlie')
    })

    it('should return all documents when $nor conditions all fail', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'active' }
      ])

      const results = await User.find({
        $nor: [{ status: 'deleted' }, { age: { $gt: 100 } }]
      })

      assert.strictEqual(results.length, 2)
    })

    it('should return empty array when any $nor condition matches', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' }
      ])

      const results = await User.find({
        $nor: [{ status: 'active' }, { status: 'inactive' }]
      })

      assert.strictEqual(results.length, 0)
    })

    it('should work with complex conditions', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active', city: 'NYC' },
        { name: 'Bob', age: 35, status: 'inactive', city: 'LA' },
        { name: 'Charlie', age: 45, status: 'pending', city: 'SF' }
      ])

      const results = await User.find({
        $nor: [{ city: 'NYC' }, { age: { $gte: 40 } }]
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Bob')
    })
  })

  describe('$not operator', () => {
    it('should negate equality operator', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const results = await User.find({
        status: { $not: { $eq: 'active' } }
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Bob')
    })

    it('should negate comparison operators', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'active' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const results = await User.find({
        age: { $not: { $gte: 30 } }
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Alice')
    })

    it('should negate $in operator', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'pending' }
      ])

      const results = await User.find({
        status: { $not: { $in: ['active', 'inactive'] } }
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Charlie')
    })

    it('should negate regex operator', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'active' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const results = await User.find({
        name: { $not: { $regex: '^A' } }
      })

      assert.strictEqual(results.length, 2)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Bob', 'Charlie'])
    })

    it('should negate $exists operator', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active', city: 'NYC' },
        { name: 'Bob', age: 35, status: 'active' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const results = await User.find({
        city: { $not: { $exists: true } }
      })

      assert.strictEqual(results.length, 2)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Bob', 'Charlie'])
    })

    it('should negate $ne operator', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'active' },
        { name: 'Charlie', age: 45, status: 'inactive' }
      ])

      const results = await User.find({
        status: { $not: { $ne: 'active' } }
      })

      assert.strictEqual(results.length, 2)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Alice', 'Bob'])
    })

    it('should negate $nin operator', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'pending' }
      ])

      const results = await User.find({
        status: { $not: { $nin: ['active', 'inactive'] } }
      })

      assert.strictEqual(results.length, 2)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Alice', 'Bob'])
    })

    it('should negate $gt operator', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'active' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const results = await User.find({
        age: { $not: { $gt: 30 } }
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Alice')
    })

    it('should negate $lte operator', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'active' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const results = await User.find({
        age: { $not: { $lte: 30 } }
      })

      assert.strictEqual(results.length, 2)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Bob', 'Charlie'])
    })

    it('should negate non-operator value (primitive)', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' }
      ])

      const results = await User.find({
        status: { $not: 'active' } as any
      })

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'Bob')
    })

    it('should handle $not with unknown operator (returns false)', async () => {
      await User.insertMany([{ name: 'Alice', age: 25, status: 'active' }])

      const results = await User.find({
        age: { $not: { $unknownOp: 25 } as any }
      })

      // Unknown operator in $not should default to false, negating it gives true for all docs
      assert.strictEqual(results.length, 1)
    })
  })

  describe('Combined logical operators', () => {
    it('should combine $or and $and', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active', city: 'NYC' },
        { name: 'Bob', age: 35, status: 'inactive', city: 'LA' },
        { name: 'Charlie', age: 45, status: 'active', city: 'SF' },
        { name: 'Diana', age: 55, status: 'inactive', city: 'NYC' }
      ])

      const results = await User.find({
        $and: [
          { age: { $gte: 30 } },
          {
            $or: [{ city: 'NYC' }, { status: 'active' }]
          }
        ]
      })

      assert.strictEqual(results.length, 2)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Charlie', 'Diana'])
    })

    it('should nest $or inside another $or', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'pending' }
      ])

      const results = await User.find({
        $or: [{ $or: [{ age: 25 }, { age: 35 }] }, { status: 'pending' }]
      })

      assert.strictEqual(results.length, 3)
    })

    it('should combine $nor with field conditions', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active', city: 'NYC' },
        { name: 'Bob', age: 35, status: 'inactive', city: 'LA' },
        { name: 'Charlie', age: 45, status: 'active', city: 'SF' }
      ])

      const results = await User.find({
        $and: [{ status: 'active' }, { $nor: [{ city: 'NYC' }, { age: { $gt: 40 } }] }]
      })

      assert.strictEqual(results.length, 0)
    })

    it('should use $not with $or', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'pending' }
      ])

      const results = await User.find({
        $or: [{ age: { $not: { $lt: 30 } } }, { status: 'pending' }]
      })

      // Alice (age 25): $not {$lt: 30} = false, status 'pending' = false -> no match
      // Bob (age 35): $not {$lt: 30} = true, status 'pending' = false -> match
      // Charlie (age 45): $not {$lt: 30} = true, status 'pending' = true -> match
      assert.strictEqual(results.length, 2)
      const names = results.map(r => r.name).sort()
      assert.deepStrictEqual(names, ['Bob', 'Charlie'])
    })
  })

  describe('Edge cases', () => {
    it('should handle empty $or array gracefully', async () => {
      await User.insertMany([{ name: 'Alice', age: 25, status: 'active' }])

      const results = await User.find({
        $or: []
      })

      assert.strictEqual(results.length, 0)
    })

    it('should handle empty $and array gracefully', async () => {
      await User.insertMany([{ name: 'Alice', age: 25, status: 'active' }])

      const results = await User.find({
        $and: []
      })

      assert.strictEqual(results.length, 1)
    })

    it('should handle empty $nor array gracefully', async () => {
      await User.insertMany([{ name: 'Alice', age: 25, status: 'active' }])

      const results = await User.find({
        $nor: []
      })

      assert.strictEqual(results.length, 1)
    })

    it('should work with findOne and logical operators', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' }
      ])

      const result = await User.findOne({
        $or: [{ age: 35 }, { name: 'Alice' }]
      })

      assert(result !== null)
      assert(['Alice', 'Bob'].includes(result.name))
    })

    it('should work with countDocuments and logical operators', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const count = await User.countDocuments({
        $or: [{ age: { $lt: 30 } }, { status: 'inactive' }]
      })

      assert.strictEqual(count, 2)
    })

    it('should work with updateMany and logical operators', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const result = await User.updateMany(
        { $or: [{ age: { $lt: 30 } }, { status: 'inactive' }] },
        { $set: { role: 'user' } }
      )

      assert.strictEqual(result.modifiedCount, 2)

      const updated = await User.find({ role: 'user' })
      assert.strictEqual(updated.length, 2)
    })

    it('should work with deleteMany and logical operators', async () => {
      await User.insertMany([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 35, status: 'inactive' },
        { name: 'Charlie', age: 45, status: 'active' }
      ])

      const result = await User.deleteMany({
        $or: [{ age: { $lt: 30 } }, { status: 'inactive' }]
      })

      assert.strictEqual(result.deletedCount, 2)

      const remaining = await User.find()
      assert.strictEqual(remaining.length, 1)
      assert.strictEqual(remaining[0].name, 'Charlie')
    })
  })
})
