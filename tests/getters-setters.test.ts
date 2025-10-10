import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, clearRegistry, model } from '../index'

interface UserDoc {
  name: string
  email: string
  age: number
  password?: string
}

test('Field Getters and Setters', async t => {
  await t.test('should apply setter when creating document', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      email: {
        type: String,
        set: (v: string) => v.toLowerCase() // Normalize to lowercase
      },
      age: Number
    })

    const User = model('UserSetter', userSchema)
    await User.create({ name: 'Alice', email: 'ALICE@EXAMPLE.COM', age: 25 })

    // Email should be stored in lowercase
    const found = await User.findOne({ name: 'Alice' })
    assert.strictEqual(found?.email, 'alice@example.com')
  })

  await t.test('should apply getter when reading document', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      email: String,
      age: {
        type: Number,
        get: (v: number) => v * 2 // Double the age on read
      }
    })

    const User = model('UserGetter', userSchema)
    await User.create({ name: 'Bob', email: 'bob@example.com', age: 30 })

    const user = await User.findOne({ name: 'Bob' })

    // Stored value is 30, but getter returns 60
    assert.strictEqual(user?.age, 60)
  })

  await t.test('should apply both getter and setter', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      email: String,
      age: Number,
      password: {
        type: String,
        set: (v: string) => v.split('').reverse().join(''), // Reverse on save
        get: (v: string) => v.split('').reverse().join('') // Reverse on read (gets original)
      }
    })

    const User = model('UserGetterSetter', userSchema)
    await User.create({ name: 'Alice', email: 'alice@example.com', age: 25, password: 'secret' })

    const user = await User.findOne({ name: 'Alice' })

    // Password is reversed in storage but reversed back on read
    assert.strictEqual(user?.password, 'secret')
  })

  await t.test('should apply setter in insertMany', async () => {
    const userSchema = new Schema<UserDoc>({
      name: {
        type: String,
        set: (v: string) => v.trim().toUpperCase()
      },
      email: String,
      age: Number
    })

    const User = model('UserSetterInsertMany', userSchema)
    await User.insertMany([
      { name: '  alice  ', email: 'alice@example.com', age: 25 },
      { name: '  bob  ', email: 'bob@example.com', age: 30 }
    ])

    const users = await User.find()

    assert.strictEqual(users[0].name, 'ALICE')
    assert.strictEqual(users[1].name, 'BOB')
  })

  await t.test('setters should run before validation', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      email: {
        type: String,
        set: (v: string) => v.toLowerCase(),
        match: /^[a-z]+@[a-z]+\.[a-z]+$/ // Must be lowercase
      },
      age: Number
    })

    const User = model('UserSetterBeforeValidation', userSchema)

    // Uppercase email would fail validation, but setter makes it lowercase first
    const user = await User.create({ name: 'Alice', email: 'ALICE@EXAMPLE.COM', age: 25 })

    assert.strictEqual(user.email, 'alice@example.com')
  })

  await t.test('getters should work with find results', async () => {
    const userSchema = new Schema<UserDoc>({
      name: {
        type: String,
        get: (v: string) => `Mr./Ms. ${v}`
      },
      email: String,
      age: Number
    })

    const User = model('UserGetterFind', userSchema)
    await User.insertMany([
      { name: 'Alice', email: 'alice@example.com', age: 25 },
      { name: 'Bob', email: 'bob@example.com', age: 30 }
    ])

    const users = await User.find()

    assert.strictEqual(users[0].name, 'Mr./Ms. Alice')
    assert.strictEqual(users[1].name, 'Mr./Ms. Bob')
  })

  await t.test('getters should not affect stored values', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      email: String,
      age: {
        type: Number,
        get: (v: number) => v + 10
      }
    })

    const User = model('UserGetterNoAffect', userSchema)
    await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })

    const user1 = await User.findOne({ name: 'Alice' })
    assert.strictEqual(user1?.age, 35) // Getter applied

    const user2 = await User.findOne({ name: 'Alice' })
    assert.strictEqual(user2?.age, 35) // Still 35, stored value is still 25
  })

  await t.test('setters should transform empty strings', async () => {
    const userSchema = new Schema<UserDoc>({
      name: {
        type: String,
        set: (v: string) => v.trim() || 'Anonymous'
      },
      email: String,
      age: Number
    })

    const User = model('UserSetterEmpty', userSchema)
    const user = await User.create({ name: '  ', email: 'test@example.com', age: 25 })

    assert.strictEqual(user.name, 'Anonymous')
  })

  await t.test('getters should work with field selection', async () => {
    const userSchema = new Schema<UserDoc>({
      name: {
        type: String,
        get: (v: string) => v.toUpperCase()
      },
      email: String,
      age: Number
    })

    const User = model('UserGetterSelect', userSchema)
    await User.create({ name: 'alice', email: 'alice@example.com', age: 25 })

    const user = await User.findOne({ email: 'alice@example.com' }, { select: { name: 1, age: 1 } })

    assert.ok(user)
    assert.strictEqual(user.name, 'ALICE') // Getter applied
    assert.strictEqual(user.email, undefined) // Not selected
  })

  await t.test('should apply getters to nested object', async () => {
    clearRegistry()

    const addressSchema = new Schema({
      street: { type: String, get: (v: string) => v.toUpperCase() },
      city: String
    })

    const userSchema = new Schema({
      name: String,
      address: addressSchema
    })

    const User = model('User', userSchema)
    await User.create({ name: 'George', address: { street: 'main st', city: 'NYC' } })

    const user = await User.findOne({ name: 'George' })

    assert.strictEqual((user as any).address.street, 'MAIN ST')
    assert.strictEqual((user as any).address.city, 'NYC')
  })
})
