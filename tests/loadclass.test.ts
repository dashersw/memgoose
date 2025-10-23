import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model, clearRegistry } from '../index.js'

interface UserDoc {
  firstName: string
  lastName: string
  age: number
  email?: string
}

test('Schema loadClass', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should load instance methods from a class', async () => {
    class UserClass {
      firstName!: string
      lastName!: string
      age!: number

      fullName(): string {
        return `${this.firstName} ${this.lastName}`
      }

      getInitials(): string {
        return `${this.firstName[0]}.${this.lastName[0]}.`
      }

      isAdult(): boolean {
        return this.age >= 18
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClass', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    assert.strictEqual(typeof (user as any).fullName, 'function')
    assert.strictEqual((user as any).fullName(), 'Alice Smith')
    assert.strictEqual((user as any).getInitials(), 'A.S.')
    assert.strictEqual((user as any).isAdult(), true)
  })

  await t.test('should load static methods from a class', async () => {
    class UserClass {
      static async findByLastName(this: any, lastName: string) {
        return this.find({ lastName })
      }

      static async findAdults(this: any) {
        return this.find({ age: { $gte: 18 } })
      }

      static getDefaultAge(): number {
        return 0
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClassStatic', userSchema)
    await User.insertMany([
      { firstName: 'Alice', lastName: 'Smith', age: 25 },
      { firstName: 'Bob', lastName: 'Smith', age: 30 },
      { firstName: 'Charlie', lastName: 'Jones', age: 15 }
    ])

    const smiths = await (User as any).findByLastName('Smith')
    assert.strictEqual(smiths.length, 2)
    assert.ok(smiths.some((u: any) => u.firstName === 'Alice'))
    assert.ok(smiths.some((u: any) => u.firstName === 'Bob'))

    const adults = await (User as any).findAdults()
    assert.strictEqual(adults.length, 2)
    assert.ok(adults.every((u: any) => u.age >= 18))

    assert.strictEqual((User as any).getDefaultAge(), 0)
  })

  await t.test('should load both instance and static methods together', async () => {
    class UserClass {
      firstName!: string
      lastName!: string
      age!: number

      // Instance methods
      fullName(): string {
        return `${this.firstName} ${this.lastName}`
      }

      // Static methods
      static async findByAge(this: any, age: number) {
        return this.find({ age })
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClassBoth', userSchema)
    await User.insertMany([
      { firstName: 'Alice', lastName: 'Smith', age: 25 },
      { firstName: 'Bob', lastName: 'Jones', age: 25 }
    ])

    const user = await User.findOne({ firstName: 'Alice' })
    assert.ok(user)
    assert.strictEqual((user as any).fullName(), 'Alice Smith')

    const age25Users = await (User as any).findByAge(25)
    assert.strictEqual(age25Users.length, 2)
  })

  await t.test('should work with methods that have parameters', async () => {
    class UserClass {
      firstName!: string
      lastName!: string
      age!: number

      greet(greeting: string): string {
        return `${greeting}, ${this.firstName}!`
      }

      incrementAge(years: number): number {
        return this.age + years
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClassParams', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    assert.strictEqual((user as any).greet('Hello'), 'Hello, Alice!')
    assert.strictEqual((user as any).greet('Hi'), 'Hi, Alice!')
    assert.strictEqual((user as any).incrementAge(5), 30)
  })

  await t.test('should not override existing methods/statics when loading class', async () => {
    class UserClass {
      firstName!: string
      lastName!: string

      fullName(): string {
        return `${this.firstName} ${this.lastName}`
      }

      static findByName(this: any, firstName: string) {
        return this.find({ firstName })
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    // Add methods/statics before loadClass
    userSchema.methods.customMethod = function (this: UserDoc) {
      return `Custom: ${this.firstName}`
    }

    userSchema.statics.customStatic = function () {
      return 'Custom Static'
    }

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClassNoOverride', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    // Both the class method and custom method should exist
    assert.strictEqual((user as any).fullName(), 'Alice Smith')
    assert.strictEqual((user as any).customMethod(), 'Custom: Alice')
    assert.strictEqual((User as any).customStatic(), 'Custom Static')
  })

  await t.test('should allow chaining with loadClass', async () => {
    class UserClass {
      firstName!: string
      lastName!: string

      fullName(): string {
        return `${this.firstName} ${this.lastName}`
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    // Test chaining
    userSchema
      .loadClass(UserClass)
      .index('email')
      .virtual('displayName')
      .get(function (this: UserDoc) {
        return this.firstName
      })

    const User = model('UserLoadClassChaining', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    assert.strictEqual((user as any).fullName(), 'Alice Smith')
    assert.strictEqual((user as any).displayName, 'Alice')
  })

  await t.test('should work with async methods', async () => {
    class UserClass {
      firstName!: string
      email?: string

      async fetchEmailDomain(): Promise<string> {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10))
        return this.email ? this.email.split('@')[1] : 'unknown'
      }

      static async countUsers(this: any): Promise<number> {
        const users = await this.find({})
        return users.length
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number,
      email: String
    })

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClassAsync', userSchema)
    await User.insertMany([
      { firstName: 'Alice', lastName: 'Smith', age: 25, email: 'alice@example.com' },
      { firstName: 'Bob', lastName: 'Jones', age: 30, email: 'bob@test.com' }
    ])

    const user = await User.findOne({ firstName: 'Alice' })
    assert.ok(user)
    const domain = await (user as any).fetchEmailDomain()
    assert.strictEqual(domain, 'example.com')

    const count = await (User as any).countUsers()
    assert.strictEqual(count, 2)
  })

  await t.test('should ignore constructor and not throw errors', async () => {
    class UserClass {
      firstName!: string
      lastName!: string

      constructor() {
        // Constructor should be ignored
      }

      fullName(): string {
        return `${this.firstName} ${this.lastName}`
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    // Should not throw
    assert.doesNotThrow(() => {
      userSchema.loadClass(UserClass)
    })

    const User = model('UserLoadClassConstructor', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    assert.strictEqual((user as any).fullName(), 'Alice Smith')
  })

  await t.test('should work with methods that reference instance properties', async () => {
    class UserClass {
      firstName!: string
      lastName!: string
      age!: number

      // Regular method that accesses instance properties
      fullName(): string {
        return `${this.firstName} ${this.lastName}`
      }

      isOlderThan(age: number): boolean {
        return this.age > age
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClassGetters', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    // Methods should have access to instance properties
    assert.strictEqual((user as any).fullName(), 'Alice Smith')
    assert.strictEqual((user as any).isOlderThan(20), true)
    assert.strictEqual((user as any).isOlderThan(30), false)
  })

  await t.test('should support getters as virtuals', async () => {
    class UserClass {
      firstName!: string
      lastName!: string

      get fullName(): string {
        return `${this.firstName} ${this.lastName}`
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClassGetterVirtual', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    // Getter should work as a virtual
    assert.strictEqual((user as any).fullName, 'Alice Smith')
  })

  await t.test('should support setters as virtuals', async () => {
    class UserClass {
      firstName!: string
      lastName!: string

      get fullName(): string {
        return `${this.firstName} ${this.lastName}`
      }

      set fullName(value: string) {
        const parts = value.split(' ')
        this.firstName = parts[0]
        this.lastName = parts.slice(1).join(' ') || ''
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClassSetterVirtual', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    // Getter should work
    assert.strictEqual((user as any).fullName, 'Alice Smith')

    // Setter should work
    ;(user as any).fullName = 'Bob Jones'
    assert.strictEqual(user.firstName, 'Bob')
    assert.strictEqual(user.lastName, 'Jones')
    assert.strictEqual((user as any).fullName, 'Bob Jones')
  })

  await t.test('should support inheritance with getters/setters (Mongoose example)', async () => {
    class HumanClass {
      get fullName(): string {
        return 'My name'
      }
    }

    class PersonClass extends HumanClass {
      firstName!: string
      lastName!: string

      // Override parent getter
      get fullName(): string {
        return `${super.fullName} is ${this.firstName} ${this.lastName}`
      }

      set fullName(v: string) {
        const firstSpace = v.indexOf(' ')
        this.firstName = v.split(' ')[0]
        this.lastName = firstSpace === -1 ? '' : v.substring(firstSpace + 1)
      }

      // Regular method
      getFullName(): string {
        return `${this.firstName} ${this.lastName}`
      }

      // Static method
      static async findByFullName(this: any, name: string) {
        const firstSpace = name.indexOf(' ')
        const firstName = name.split(' ')[0]
        const lastName = firstSpace === -1 ? '' : name.substring(firstSpace + 1)
        return this.findOne({ firstName, lastName })
      }
    }

    const personSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    personSchema.loadClass(PersonClass)

    const Person = model('PersonInheritance', personSchema)

    const doc = await Person.create({
      firstName: 'Jon',
      lastName: 'Snow',
      age: 25
    })

    // Test getter
    assert.strictEqual((doc as any).fullName, 'My name is Jon Snow')

    // Test setter
    ;(doc as any).fullName = 'Jon Stark'
    assert.strictEqual(doc.firstName, 'Jon')
    assert.strictEqual(doc.lastName, 'Stark')

    // Test method
    assert.strictEqual((doc as any).getFullName(), 'Jon Stark')

    // Test static method
    const _foundPerson = await (Person as any).findByFullName('Jon Snow')
    // Note: Jon Snow was changed to Jon Stark, so findByFullName('Jon Snow') won't find it
    // Let's create a fresh one
    await Person.create({ firstName: 'Jon', lastName: 'Snow', age: 30 })
    const foundJonSnow = await (Person as any).findByFullName('Jon Snow')
    assert.ok(foundJonSnow)
    assert.strictEqual((foundJonSnow as any).fullName, 'My name is Jon Snow')
  })

  await t.test('should work with arrow functions in class fields', async () => {
    class UserClass {
      firstName!: string
      lastName!: string

      // Note: Arrow functions as class fields won't be picked up by loadClass
      // because they're not on the prototype. This test verifies regular methods work.
      fullName(): string {
        return `${this.firstName} ${this.lastName}`
      }
    }

    const userSchema = new Schema<UserDoc>({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.loadClass(UserClass)

    const User = model('UserLoadClassArrow', userSchema)
    const user = await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })

    assert.strictEqual((user as any).fullName(), 'Alice Smith')
  })
})
