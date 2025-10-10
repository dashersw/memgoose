import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, VirtualType, model } from '../index'

interface UserDoc {
  firstName: string
  lastName: string
  age: number
  email: string
}

test('Virtuals', async t => {
  await t.test('should add virtual property to schema', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number,
      email: String
    })

    userSchema.virtual('fullName').get(function (doc) {
      return `${doc.firstName} ${doc.lastName}`
    })

    const User = model('User', userSchema)
    await User.create({ firstName: 'John', lastName: 'Doe', age: 30, email: 'john@example.com' })

    const result = await User.findOne({ firstName: 'John' })

    assert.ok(result)
    assert.strictEqual(result.firstName, 'John')
    assert.strictEqual(result.lastName, 'Doe')
    assert.strictEqual((result as any).fullName, 'John Doe') // Virtual property
  })

  await t.test('should apply virtuals in find()', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number,
      email: String
    })

    userSchema.virtual('displayName').get(doc => {
      return `${doc.firstName} (${doc.age})`
    })

    const User = model('User', userSchema)
    await User.insertMany([
      { firstName: 'Alice', lastName: 'Smith', age: 25, email: 'alice@example.com' },
      { firstName: 'Bob', lastName: 'Jones', age: 30, email: 'bob@example.com' }
    ])

    const results = await User.find()

    assert.strictEqual(results.length, 2)
    assert.strictEqual((results[0] as any).displayName, 'Alice (25)')
    assert.strictEqual((results[1] as any).displayName, 'Bob (30)')
  })

  await t.test('should support multiple virtuals', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number,
      email: String
    })

    userSchema.virtual('fullName').get(doc => `${doc.firstName} ${doc.lastName}`)
    userSchema.virtual('initials').get(doc => `${doc.firstName[0]}.${doc.lastName[0]}.`)
    userSchema.virtual('isAdult').get(doc => doc.age >= 18)

    const User = model('User', userSchema)
    await User.create({ firstName: 'Jane', lastName: 'Doe', age: 25, email: 'jane@example.com' })

    const result = await User.findOne({ firstName: 'Jane' })

    assert.strictEqual((result as any).fullName, 'Jane Doe')
    assert.strictEqual((result as any).initials, 'J.D.')
    assert.strictEqual((result as any).isAdult, true)
  })

  await t.test('virtuals should work with query chaining', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number,
      email: String
    })

    userSchema.virtual('fullName').get(doc => `${doc.firstName} ${doc.lastName}`)

    const User = model('User', userSchema)
    await User.insertMany([
      { firstName: 'Alice', lastName: 'Smith', age: 25, email: 'a@example.com' },
      { firstName: 'Bob', lastName: 'Jones', age: 30, email: 'b@example.com' },
      { firstName: 'Charlie', lastName: 'Brown', age: 35, email: 'c@example.com' }
    ])

    const results = await User.find().sort({ age: -1 }).limit(2)

    assert.strictEqual(results.length, 2)
    assert.strictEqual((results[0] as any).fullName, 'Charlie Brown')
    assert.strictEqual((results[1] as any).fullName, 'Bob Jones')
  })

  await t.test('virtuals should not be stored in data', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number,
      email: String
    })

    userSchema.virtual('fullName').get(doc => `${doc.firstName} ${doc.lastName}`)

    const User = model('User', userSchema)
    await User.create({ firstName: 'Test', lastName: 'User', age: 20, email: 'test@example.com' })

    // Access internal data (not through query)
    const internalData = (User as any)._data[0]
    assert.strictEqual((internalData as any).fullName, undefined) // Virtual not in raw data
    assert.strictEqual(internalData.firstName, 'Test') // Real field exists
  })

  await t.test('should handle virtual without getter (returns undefined)', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number,
      email: String
    })

    // Create a virtual without a getter function
    const virtualWithoutGetter = new VirtualType()

    // Manually add to virtuals Map (simulating edge case where virtual has no getter)
    const schema = userSchema
    ;(schema as any)._virtuals.set('testField', virtualWithoutGetter)

    const User = model('UserVirtualNoGetter', userSchema)
    await User.create({ firstName: 'Test', lastName: 'User', age: 20, email: 'test@example.com' })

    const result = await User.findOne({ firstName: 'Test' })

    // Should return undefined when getter is not defined, so field should not be added
    assert.strictEqual((result as any).testField, undefined)
    // But real fields should still exist
    assert.strictEqual(result?.firstName, 'Test')
  })
})
