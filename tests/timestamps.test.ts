import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

interface UserDoc {
  name: string
  age: number
  createdAt?: Date
  updatedAt?: Date
}

interface CustomTimestampDoc {
  name: string
  age: number
  created_at?: Date
  updated_at?: Date
  modified_at?: Date
}

test('Timestamps', async t => {
  await t.test('should auto-add createdAt and updatedAt with timestamps: true', async () => {
    const userSchema = new Schema<UserDoc>(
      {
        name: String,
        age: Number
      },
      { timestamps: true }
    )

    const User = model('UserTimestamps', userSchema)
    const beforeCreate = Date.now()
    const user = await User.create({ name: 'Alice', age: 25 })
    const afterCreate = Date.now()

    assert.ok((user as any).createdAt instanceof Date)
    assert.ok((user as any).updatedAt instanceof Date)
    assert.ok((user as any).createdAt.getTime() >= beforeCreate)
    assert.ok((user as any).createdAt.getTime() <= afterCreate)
    assert.ok((user as any).updatedAt.getTime() >= beforeCreate)
    assert.ok((user as any).updatedAt.getTime() <= afterCreate)
  })

  await t.test('should update updatedAt on document update', async () => {
    const userSchema = new Schema<UserDoc>(
      {
        name: String,
        age: Number
      },
      { timestamps: true }
    )

    const User = model('UserTimestampsUpdate', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    const originalCreatedAt = (user as any).createdAt
    const originalUpdatedAt = (user as any).updatedAt

    // Wait a bit to ensure timestamp changes
    await new Promise(resolve => setTimeout(resolve, 10))

    await User.updateOne({ name: 'Alice' }, { $set: { age: 26 } })

    const updated = await User.findOne({ name: 'Alice' })

    assert.ok(updated)
    assert.strictEqual(updated.age, 26)
    // createdAt should not change
    assert.strictEqual(updated.createdAt?.getTime(), originalCreatedAt?.getTime())
    // updatedAt should be newer
    assert.ok(updated.updatedAt)
    assert.ok(updated.updatedAt.getTime() > originalUpdatedAt!.getTime())
  })

  await t.test('should add timestamps to all documents in insertMany', async () => {
    const userSchema = new Schema<UserDoc>(
      {
        name: String,
        age: Number
      },
      { timestamps: true }
    )

    const User = model('UserTimestampsInsertMany', userSchema)
    const users = await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    assert.ok(users[0].createdAt instanceof Date)
    assert.ok(users[0].updatedAt instanceof Date)
    assert.ok(users[1].createdAt instanceof Date)
    assert.ok(users[1].updatedAt instanceof Date)
  })

  await t.test('should update timestamps for all documents in updateMany', async () => {
    const userSchema = new Schema<UserDoc>(
      {
        name: String,
        age: Number
      },
      { timestamps: true }
    )

    const User = model('UserTimestampsUpdateMany', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    await new Promise(resolve => setTimeout(resolve, 10))

    await User.updateMany({ age: { $gte: 25 } }, { $inc: { age: 1 } })

    const users = await User.find()
    users.forEach(user => {
      assert.ok((user as any).updatedAt)
      assert.ok((user as any).createdAt)
    })
  })

  await t.test('should use custom field names for timestamps', async () => {
    const userSchema = new Schema<CustomTimestampDoc>(
      {
        name: String,
        age: Number
      },
      {
        timestamps: {
          createdAt: 'created_at',
          updatedAt: 'updated_at'
        }
      }
    )

    const User = model('UserCustomTimestamps', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.ok(user.created_at instanceof Date)
    assert.ok(user.updated_at instanceof Date)
    assert.strictEqual((user as any).createdAt, undefined)
    assert.strictEqual((user as any).updatedAt, undefined)
  })

  await t.test('should only add createdAt when updatedAt is disabled', async () => {
    const userSchema = new Schema<CustomTimestampDoc>(
      {
        name: String,
        age: Number
      },
      {
        timestamps: {
          createdAt: true,
          updatedAt: false
        }
      }
    )

    const User = model('UserOnlyCreatedAt', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.ok((user as any).createdAt instanceof Date)
    assert.strictEqual((user as any).updatedAt, undefined)
  })

  await t.test('should only add updatedAt when createdAt is disabled', async () => {
    const userSchema = new Schema<CustomTimestampDoc>(
      {
        name: String,
        age: Number
      },
      {
        timestamps: {
          createdAt: false,
          updatedAt: true
        }
      }
    )

    const User = model('UserOnlyUpdatedAt', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.strictEqual((user as any).createdAt, undefined)
    assert.ok((user as any).updatedAt instanceof Date)
  })

  await t.test('should work with findOneAndUpdate', async () => {
    const userSchema = new Schema<UserDoc>(
      {
        name: String,
        age: Number
      },
      { timestamps: true }
    )

    const User = model('UserTimestampsFindOneUpdate', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    const originalCreatedAt = (user as any).createdAt

    await new Promise(resolve => setTimeout(resolve, 10))

    const updated = await User.findOneAndUpdate({ name: 'Alice' }, { $set: { age: 26 } })

    assert.ok(updated)
    assert.strictEqual(updated.age, 26)
    assert.strictEqual(updated.createdAt?.getTime(), originalCreatedAt?.getTime())
    assert.ok(updated.updatedAt)
    assert.ok(updated.updatedAt.getTime() > originalCreatedAt!.getTime())
  })

  await t.test('should not add timestamps when option is false', async () => {
    const userSchema = new Schema<UserDoc>(
      {
        name: String,
        age: Number
      },
      { timestamps: false }
    )

    const User = model('UserNoTimestamps', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.strictEqual((user as any).createdAt, undefined)
    assert.strictEqual((user as any).updatedAt, undefined)
  })

  await t.test('should not add timestamps when option is not specified', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    const User = model('UserNoTimestampsDefault', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.strictEqual((user as any).createdAt, undefined)
    assert.strictEqual((user as any).updatedAt, undefined)
  })

  await t.test('should not add timestamps when both are disabled', async () => {
    const userSchema = new Schema<UserDoc>(
      {
        name: String,
        age: Number
      },
      { timestamps: { createdAt: false, updatedAt: false } }
    )

    const User = model('UserBothTimestampsDisabled', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.strictEqual((user as any).createdAt, undefined)
    assert.strictEqual((user as any).updatedAt, undefined)
  })
})
