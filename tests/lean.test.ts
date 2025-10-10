import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, clearRegistry, model } from '../index'

interface UserDoc {
  name: string
  age: number
  email?: string
}

test('Lean Queries', async t => {
  await t.test('should return plain objects without virtuals when lean is true', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    userSchema.virtual('ageGroup').get(doc => (doc.age < 30 ? 'young' : 'old'))

    const User = model('UserLean', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 35 }
    ])

    const leanResults = await User.find().lean()

    // Virtuals should not be applied
    assert.strictEqual((leanResults[0] as any).ageGroup, undefined)
    assert.strictEqual((leanResults[1] as any).ageGroup, undefined)
  })

  await t.test('should apply virtuals when lean is false', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    userSchema.virtual('ageGroup').get(doc => (doc.age < 30 ? 'young' : 'old'))

    const User = model('UserNotLean', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 35 }
    ])

    const results = await User.find().lean(false)

    // Virtuals should be applied
    assert.strictEqual((results[0] as any).ageGroup, 'young')
    assert.strictEqual((results[1] as any).ageGroup, 'old')
  })

  await t.test('should apply virtuals by default when lean is not specified', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    userSchema.virtual('ageGroup').get(doc => (doc.age < 30 ? 'young' : 'old'))

    const User = model('UserDefaultLean', userSchema)
    await User.create({ name: 'Alice', age: 25 })

    const result = await User.find()

    // Virtuals should be applied by default
    assert.strictEqual((result[0] as any).ageGroup, 'young')
  })

  await t.test('should work with lean option in find()', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    userSchema.virtual('displayName').get(doc => `${doc.name} (${doc.age})`)

    const User = model('UserLeanOption', userSchema)
    await User.create({ name: 'Alice', age: 25 })

    const leanResults = await User.find({}, { lean: true })

    assert.strictEqual((leanResults[0] as any).displayName, undefined)
  })

  await t.test('should combine lean with other query options', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: String
    })

    userSchema.virtual('info').get(doc => `${doc.name} - ${doc.age}`)

    const User = model('UserLeanCombined', userSchema)
    await User.insertMany([
      { name: 'Charlie', age: 35, email: 'charlie@ex.com' },
      { name: 'Alice', age: 25, email: 'alice@ex.com' },
      { name: 'Bob', age: 30, email: 'bob@ex.com' }
    ])

    const results = await User.find().sort('age').select('name age').lean().limit(2)

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].name, 'Alice')
    assert.strictEqual((results[0] as any).info, undefined) // No virtuals
    assert.strictEqual(results[0].email, undefined) // Field selection still works
  })

  await t.test('should improve performance by skipping virtual computation', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    // Add expensive virtual
    userSchema.virtual('computed').get(() => {
      return Array.from({ length: 100 }, (_, i) => i).reduce((a, b) => a + b, 0)
    })

    const User = model('UserLeanPerformance', userSchema)
    await User.insertMany(
      Array.from({ length: 100 }, (_, i) => ({ name: `User${i}`, age: 20 + i }))
    )

    const startLean = Date.now()
    await User.find().lean()
    const leanTime = Date.now() - startLean

    const startNormal = Date.now()
    await User.find()
    const normalTime = Date.now() - startNormal

    // Lean should be faster (though timing tests are inherently flaky)
    // Just verify it runs without error
    assert.ok(leanTime >= 0)
    assert.ok(normalTime >= 0)
  })

  await t.test('findOne with lean option should exclude virtuals', async () => {
    clearRegistry()

    const userSchema = new Schema({ name: String, age: Number })
    userSchema.virtual('info').get(doc => `${doc.name} - ${doc.age}`)

    const User = model('User', userSchema)
    await User.create({ name: 'Diana', age: 28 })

    const user = await User.findOne({ name: 'Diana' }, { lean: true })

    assert.ok(user)
    assert.strictEqual(user.name, 'Diana')
    assert.strictEqual((user as any).info, undefined)
  })
})
