import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

interface UserDoc {
  name: string
  age: number
  password?: string
}

test('Serialization (toJSON / toObject)', async t => {
  await t.test('should have toJSON method on documents', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    const User = model('UserToJSON', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.strictEqual(typeof (user as any).toJSON, 'function')
  })

  await t.test('should have toObject method on documents', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    const User = model('UserToObject', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    assert.strictEqual(typeof (user as any).toObject, 'function')
  })

  await t.test('should serialize document with toJSON', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    userSchema.virtual('ageGroup').get(doc => (doc.age < 30 ? 'young' : 'old'))

    const User = model('UserSerialize', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    const json = (user as any).toJSON()

    assert.strictEqual(json.name, 'Alice')
    assert.strictEqual(json.age, 25)
    assert.strictEqual(json.ageGroup, 'young') // Virtual included by default
    assert.strictEqual(typeof json.toJSON, 'undefined') // Methods removed
    assert.strictEqual(typeof json.toObject, 'undefined')
  })

  await t.test('should serialize with transform function', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      password: String
    })

    const User = model('UserTransform', userSchema)
    const user = await User.create({ name: 'Alice', age: 25, password: 'secret123' })

    const json = (user as any).toJSON({
      transform: (doc: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...rest } = doc
        return rest
      }
    })

    assert.strictEqual(json.name, 'Alice')
    assert.strictEqual(json.password, undefined)
  })

  await t.test('should serialize from find results', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    userSchema.virtual('displayName').get(doc => `${doc.name} (${doc.age})`)

    const User = model('UserFindSerialize', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    const users = await User.find()
    const jsonUsers = users.map((u: any) => u.toJSON())

    assert.strictEqual(jsonUsers.length, 2)
    assert.strictEqual(jsonUsers[0].displayName, 'Alice (25)')
    assert.strictEqual(typeof jsonUsers[0].toJSON, 'undefined')
  })

  await t.test('should work with JSON.stringify', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    userSchema.virtual('info').get(doc => `${doc.name} is ${doc.age}`)

    const User = model('UserJSONStringify', userSchema)
    const user = await User.create({ name: 'Alice', age: 25 })

    const jsonString = JSON.stringify(user)
    const parsed = JSON.parse(jsonString)

    assert.strictEqual(parsed.name, 'Alice')
    assert.strictEqual(parsed.age, 25)
    assert.strictEqual(parsed.info, 'Alice is 25')
  })

  await t.test('should not have toJSON/toObject on lean documents', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    const User = model('UserLeanNoMethods', userSchema)
    await User.create({ name: 'Alice', age: 25 })

    const leanUsers = await User.find().lean()

    assert.strictEqual(typeof (leanUsers[0] as any).toJSON, 'undefined')
    assert.strictEqual(typeof (leanUsers[0] as any).toObject, 'undefined')
  })

  await t.test('toObject should work same as toJSON', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      password: String
    })

    const User = model('UserToObjectSame', userSchema)
    const user = await User.create({ name: 'Alice', age: 25, password: 'secret' })

    const json = (user as any).toJSON()
    const obj = (user as any).toObject()

    assert.deepStrictEqual(json, obj)
  })
})
