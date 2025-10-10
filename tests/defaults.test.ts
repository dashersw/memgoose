import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

interface UserDoc {
  name: string
  age?: number
  status?: string | null
  createdAt?: Date
  isActive?: boolean
  role?: string
  score?: number
}

test('Default Values', async t => {
  await t.test('should apply static default value', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      status: { type: String, default: 'pending' }
    })

    const User = model('UserStaticDefault', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.strictEqual(user.status, 'pending')
  })

  await t.test('should apply function default value', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      status: String,
      createdAt: { type: Date, default: () => new Date() }
    })

    const User = model('UserFunctionDefault', userSchema)
    const beforeCreate = Date.now()
    const user = await User.create({ name: 'Alice', age: 25, status: 'active' })
    const afterCreate = Date.now()

    assert.ok(user.createdAt instanceof Date)
    assert.ok(user.createdAt.getTime() >= beforeCreate)
    assert.ok(user.createdAt.getTime() <= afterCreate)
  })

  await t.test('should not override provided values with defaults', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      status: { type: String, default: 'pending' }
    })

    const User = model('UserNoOverride', userSchema)
    const user = await User.create({ name: 'Alice', age: 25, status: 'active' })

    assert.strictEqual(user.status, 'active') // Not 'pending'
  })

  await t.test('should apply multiple defaults', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      status: { type: String, default: 'pending' },
      isActive: { type: Boolean, default: true },
      role: { type: String, default: 'user' }
    })

    const User = model('UserMultipleDefaults', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.strictEqual(user.status, 'pending')
    assert.strictEqual(user.isActive, true)
    assert.strictEqual(user.role, 'user')
  })

  await t.test('should apply defaults with insertMany', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      status: { type: String, default: 'pending' }
    })

    const User = model('UserInsertManyDefaults', userSchema)
    const users = await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    assert.strictEqual(users[0].status, 'pending')
    assert.strictEqual(users[1].status, 'pending')
  })

  await t.test('should apply defaults before validation', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      status: { type: String, default: 'pending', required: true }
    })

    const User = model('UserDefaultBeforeValidation', userSchema)

    // Should pass because default is applied before validation
    const user = await User.create({ name: 'Alice', age: 25 })
    assert.strictEqual(user.status, 'pending')
  })

  await t.test('should apply default with function that generates unique values', async () => {
    let counter = 0
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      status: String,
      score: { type: Number, default: () => ++counter }
    })

    const User = model('UserDefaultFunction', userSchema)
    const user1 = await User.create({ name: 'Alice', age: 25, status: 'active' })
    const user2 = await User.create({ name: 'Bob', age: 30, status: 'active' })

    assert.strictEqual(user1.score, 1)
    assert.strictEqual(user2.score, 2)
  })

  await t.test('should apply default of 0 and false', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      status: String,
      score: { type: Number, default: 0 },
      isActive: { type: Boolean, default: false }
    })

    const User = model('UserDefaultFalsy', userSchema)
    const user = await User.create({ name: 'Alice', age: 25, status: 'active' })

    assert.strictEqual(user.score, 0)
    assert.strictEqual(user.isActive, false)
  })

  await t.test('should not apply defaults to null values', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      status: { type: String, default: 'pending' }
    })

    const User = model('UserNullNotDefault', userSchema)
    const user = await User.create({ name: 'Alice', age: 25, status: null })

    // Null should be preserved, not replaced with default
    assert.strictEqual(user.status, null)
  })

  await t.test('should work with both defaults and validation', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: true },
      age: { type: Number, min: 0, default: 0 },
      status: { type: String, enum: ['active', 'inactive'], default: 'inactive' }
    })

    const User = model('UserDefaultsWithValidation', userSchema)
    const user = await User.create({ name: 'Alice' })

    assert.strictEqual(user.age, 0)
    assert.strictEqual(user.status, 'inactive')
  })
})
