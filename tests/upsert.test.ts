import { test } from 'node:test'
import assert from 'node:assert'
import { model, ObjectId, Schema, clearRegistry } from '../index'

test('Upsert and New Options', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test(
    'should create document when upsert is true and document does not exist',
    async () => {
      const User = model('User', new Schema({}))
      await User.insertMany([
        { name: 'Alice', age: 25, email: 'alice@example.com' },
        { name: 'Bob', age: 30, email: 'bob@example.com' }
      ])

      const result = await User.updateOne(
        { name: 'Charlie' },
        { $set: { age: 35, email: 'charlie@example.com' } },
        { upsert: true }
      )

      assert.strictEqual(result.modifiedCount, 1)
      assert.strictEqual(result.upsertedCount, 1)

      const charlie = await User.findOne({ name: 'Charlie' })
      assert.ok(charlie)
      assert.strictEqual(charlie.name, 'Charlie')
      assert.strictEqual(charlie.age, 35)
      assert.strictEqual(charlie.email, 'charlie@example.com')
    }
  )

  await t.test(
    'should update existing document when upsert is true and document exists',
    async () => {
      const User = model('User', new Schema({}))
      await User.create({ name: 'Alice', age: 25, email: 'alice@example.com' })

      const result = await User.updateOne(
        { name: 'Alice' },
        { $set: { age: 26 } },
        { upsert: true }
      )

      assert.strictEqual(result.modifiedCount, 1)
      assert.strictEqual(result.upsertedCount, undefined)

      const alice = await User.findOne({ name: 'Alice' })
      assert.strictEqual(alice?.age, 26)
    }
  )

  await t.test('should work without upsert option (default behavior)', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.updateOne({ name: 'Nobody' }, { $set: { age: 100 } })

    assert.strictEqual(result.modifiedCount, 0)
    assert.strictEqual(result.upsertedCount, undefined)

    const count = await User.countDocuments()
    assert.strictEqual(count, 1) // No document created
  })

  await t.test('should apply query fields to upserted document', async () => {
    const User = model('User', new Schema({}))

    await User.updateOne(
      { name: 'Diana', email: 'diana@example.com' },
      { $set: { age: 28 } },
      { upsert: true }
    )

    const diana = await User.findOne({ name: 'Diana' })
    assert.ok(diana)
    assert.strictEqual(diana.name, 'Diana')
    assert.strictEqual(diana.email, 'diana@example.com')
    assert.strictEqual(diana.age, 28)
  })

  await t.test('findOneAndUpdate with upsert should create document', async () => {
    const User = model('User', new Schema({}))

    const result = await User.findOneAndUpdate(
      { name: 'Eve' },
      { $set: { age: 40, email: 'eve@example.com' } },
      { upsert: true }
    )

    assert.ok(result)
    assert.strictEqual(result.name, 'Eve')
    assert.strictEqual(result.age, 40)

    const eve = await User.findOne({ name: 'Eve' })
    assert.ok(eve)
  })

  await t.test(
    'findOneAndUpdate with upsert and returnDocument before should return null',
    async () => {
      const User = model('User', new Schema({}))

      const result = await User.findOneAndUpdate(
        { name: 'Frank' },
        { $set: { age: 45 } },
        { upsert: true, returnDocument: 'before' }
      )

      assert.strictEqual(result, null) // No document existed before

      const frank = await User.findOne({ name: 'Frank' })
      assert.ok(frank) // But document was created
      assert.strictEqual(frank.age, 45)
    }
  )

  await t.test(
    'findOneAndUpdate with upsert and new: true should return new document',
    async () => {
      const User = model('User', new Schema({}))

      const result = await User.findOneAndUpdate(
        { name: 'Grace' },
        { $set: { age: 50, email: 'grace@example.com' } },
        { upsert: true, new: true }
      )

      assert.ok(result)
      assert.strictEqual(result.name, 'Grace')
      assert.strictEqual(result.age, 50)
    }
  )

  await t.test(
    'new: true should return updated document (alias for returnDocument: after)',
    async () => {
      const User = model('User', new Schema({}))
      await User.create({ name: 'Alice', age: 25 })

      const result = await User.findOneAndUpdate(
        { name: 'Alice' },
        { $set: { age: 26 } },
        { new: true }
      )

      assert.ok(result)
      assert.strictEqual(result.age, 26) // Updated value
    }
  )

  await t.test('new: false should return original document', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Bob', age: 30 })

    const result = await User.findOneAndUpdate(
      { name: 'Bob' },
      { $set: { age: 31 } },
      { new: false }
    )

    assert.ok(result)
    assert.strictEqual(result.age, 30) // Original value

    const updated = await User.findOne({ name: 'Bob' })
    assert.strictEqual(updated?.age, 31) // But it was updated
  })

  await t.test('default should return updated document when new is not specified', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Charlie', age: 35 })

    const result = await User.findOneAndUpdate({ name: 'Charlie' }, { $set: { age: 36 } })

    assert.ok(result)
    assert.strictEqual(result.age, 36) // Default is to return after
  })

  await t.test('findByIdAndUpdate should support upsert', async () => {
    const User = model('User', new Schema({}))
    const customId = new ObjectId()

    const result = await User.findByIdAndUpdate(
      customId,
      { $set: { name: 'Henry', age: 55 } },
      { upsert: true, new: true }
    )

    assert.ok(result)
    assert.strictEqual(result.name, 'Henry')
    assert.strictEqual(result._id.toString(), customId.toString())
  })

  await t.test('findByIdAndUpdate should support new option', async () => {
    const User = model('User', new Schema({}))
    const doc = await User.create({ name: 'Isaac', age: 60 })
    const docId = doc._id

    const result = await User.findByIdAndUpdate(docId, { $set: { age: 61 } }, { new: true })

    assert.ok(result)
    assert.strictEqual(result.age, 61) // Updated value
  })

  await t.test('upsert should work with direct field assignment', async () => {
    const User = model('User', new Schema({}))

    await User.updateOne(
      { name: 'Julia' },
      { age: 42, email: 'julia@example.com' },
      {
        upsert: true
      }
    )

    const julia = await User.findOne({ name: 'Julia' })
    assert.ok(julia)
    assert.strictEqual(julia.age, 42)
  })

  await t.test('upsert should validate before creating', async () => {
    const userSchema = new Schema({
      name: { type: String, required: true },
      age: { type: Number, min: 0 }
    })

    const User = model('UserUpsertValidation', userSchema)

    await assert.rejects(
      async () => {
        await User.updateOne({ name: 'Invalid' }, { $set: { age: -5 } }, { upsert: true })
      },
      {
        name: 'ValidationError',
        message: /age must be at least 0/
      }
    )
  })

  await t.test('upsert should apply defaults to new document', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number,
      status: { type: String, default: 'pending' }
    })

    const User = model('UserUpsertDefaults', userSchema)

    await User.updateOne({ name: 'Kate' }, { $set: { age: 48 } }, { upsert: true })

    const kate = await User.findOne({ name: 'Kate' })
    assert.strictEqual(kate?.status, 'pending') // Default applied
  })

  await t.test('upsert should apply timestamps to new document', async () => {
    const userSchema = new Schema(
      {
        name: String,
        age: Number
      },
      { timestamps: true }
    )

    const User = model('UserUpsertTimestamps', userSchema)

    await User.updateOne({ name: 'Leo' }, { $set: { age: 52 } }, { upsert: true })

    const leo = await User.findOne({ name: 'Leo' })
    assert.ok(leo?.createdAt instanceof Date)
    assert.ok(leo.updatedAt instanceof Date)
  })

  await t.test('upsert should handle ObjectId values in query', async () => {
    const User = model('User', new Schema({}))
    const customId = new ObjectId()

    await User.updateOne({ _id: customId }, { $set: { name: 'Mike', age: 58 } }, { upsert: true })

    const mike = await User.findById(customId)
    assert.ok(mike)
    assert.strictEqual(mike.name, 'Mike')
    assert.strictEqual(mike._id.toString(), customId.toString())
  })

  await t.test('upsert should handle null values in query', async () => {
    const User = model('User', new Schema({}))

    await User.updateOne(
      { name: 'Null Test', status: null },
      { $set: { age: 60 } },
      { upsert: true }
    )

    const doc = await User.findOne({ name: 'Null Test' })
    assert.ok(doc)
    assert.strictEqual(doc.status, null)
    assert.strictEqual(doc.age, 60)
  })
})
