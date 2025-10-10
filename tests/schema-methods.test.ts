import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

interface UserDoc {
  firstName: string
  lastName: string
  age: number
  password?: string
}

test('Schema Methods', async t => {
  await t.test('should support instance methods', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.methods.fullName = function (this: UserDoc) {
      return `${this.firstName} ${this.lastName}`
    }

    const User = model('UserInstanceMethod', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    assert.strictEqual(typeof (user as any).fullName, 'function')
    assert.strictEqual((user as any).fullName(), 'Alice Smith')
  })

  await t.test('should support instance methods with parameters', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.methods.greet = function (this: UserDoc, greeting: string) {
      return `${greeting}, ${this.firstName}!`
    }

    const User = model('UserMethodWithParams', userSchema)
    const user = await User.create({ firstName: 'Bob', lastName: 'Jones', age: 30 })

    assert.strictEqual((user as any).greet('Hello'), 'Hello, Bob!')
    assert.strictEqual((user as any).greet('Hi'), 'Hi, Bob!')
  })

  await t.test('should support static methods on Model', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.statics.findByLastName = async function (lastName: string) {
      return this.find({ lastName })
    }

    const User = model('UserStaticMethod', userSchema)
    await User.insertMany([
      { firstName: 'Alice', lastName: 'Smith', age: 25 },
      { firstName: 'Bob', lastName: 'Smith', age: 30 },
      { firstName: 'Charlie', lastName: 'Jones', age: 35 }
    ])

    const smiths = await (User as any).findByLastName('Smith')

    assert.strictEqual(smiths.length, 2)
    assert.ok(smiths.some((u: any) => u.firstName === 'Alice'))
    assert.ok(smiths.some((u: any) => u.firstName === 'Bob'))
  })

  await t.test('should support multiple instance methods', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.methods.getInitials = function (this: UserDoc) {
      return `${this.firstName[0]}.${this.lastName[0]}.`
    }

    userSchema.methods.isAdult = function (this: UserDoc) {
      return this.age >= 18
    }

    const User = model('UserMultipleMethods', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    assert.strictEqual((user as any).getInitials(), 'A.S.')
    assert.strictEqual((user as any).isAdult(), true)
  })

  await t.test('instance methods should work with find results', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.methods.displayInfo = function (this: UserDoc) {
      return `${this.firstName} ${this.lastName}, ${this.age} years old`
    }

    const User = model('UserMethodsFind', userSchema)
    await User.insertMany([
      { firstName: 'Alice', lastName: 'Smith', age: 25 },
      { firstName: 'Bob', lastName: 'Jones', age: 30 }
    ])

    const users = await User.find()

    assert.strictEqual((users[0] as any).displayInfo(), 'Alice Smith, 25 years old')
    assert.strictEqual((users[1] as any).displayInfo(), 'Bob Jones, 30 years old')
  })

  await t.test('static methods should have access to Model this context', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.statics.findAdults = async function () {
      return this.find({ age: { $gte: 18 } })
    }

    userSchema.statics.countAll = async function () {
      return this.countDocuments()
    }

    const User = model('UserStaticContext', userSchema)
    await User.insertMany([
      { firstName: 'Alice', lastName: 'Smith', age: 25 },
      { firstName: 'Bob', lastName: 'Jones', age: 30 },
      { firstName: 'Charlie', lastName: 'Brown', age: 15 }
    ])

    const adults = await (User as any).findAdults()
    assert.strictEqual(adults.length, 2)

    const count = await (User as any).countAll()
    assert.strictEqual(count, 3)
  })

  await t.test('instance method can access other instance methods and virtuals', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.virtual('fullName').get(doc => `${doc.firstName} ${doc.lastName}`)

    userSchema.methods.introduce = function (this: any) {
      return `Hi, I'm ${this.fullName} and I'm ${this.age} years old`
    }

    const User = model('UserMethodsWithVirtuals', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    assert.strictEqual((user as any).introduce(), "Hi, I'm Alice Smith and I'm 25 years old")
  })

  await t.test('instance methods should not be serialized', async () => {
    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.methods.greet = function (this: UserDoc) {
      return `Hello, ${this.firstName}!`
    }

    const User = model('UserMethodsSerialize', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    const json = (user as any).toJSON()

    assert.strictEqual(typeof json.greet, 'undefined')
    assert.strictEqual(json.firstName, 'Alice')
  })
})
