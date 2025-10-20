import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model, clearRegistry } from '../index'

interface AddressDoc {
  street: string
  city: string
  zipCode?: string
}

interface UserDoc {
  name: string
  age: number
  address: AddressDoc
  tags?: string[]
}

interface UserWithAddressesDoc {
  name: string
  addresses: AddressDoc[]
}

test('Subdocuments', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should support nested schema (single subdocument)', async () => {
    const addressSchema = new Schema<AddressDoc>({
      street: String,
      city: String,
      zipCode: String
    })

    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      address: addressSchema
    })

    const User = model('UserWithAddress', userSchema)
    const user = await User.create({
      name: 'Alice',
      age: 25,
      address: {
        street: '123 Main St',
        city: 'NYC',
        zipCode: '10001'
      }
    })

    assert.strictEqual(user.name, 'Alice')
    assert.strictEqual(user.address.street, '123 Main St')
    assert.strictEqual(user.address.city, 'NYC')
  })

  await t.test('should support array of subdocuments', async () => {
    const addressSchema = new Schema<AddressDoc>({
      street: String,
      city: String,
      zipCode: String
    })

    const userSchema = new Schema<UserWithAddressesDoc>({
      name: String,
      addresses: addressSchema
    })

    const User = model('UserWithAddresses', userSchema)
    const user = await User.create({
      name: 'Bob',
      addresses: [
        { street: '123 Main St', city: 'NYC', zipCode: '10001' },
        { street: '456 Oak Ave', city: 'LA', zipCode: '90001' }
      ]
    })

    assert.strictEqual(user.addresses.length, 2)
    assert.strictEqual(user.addresses[0].street, '123 Main St')
    assert.strictEqual(user.addresses[1].city, 'LA')
  })

  await t.test('should validate subdocuments', async () => {
    const addressSchema = new Schema<AddressDoc>({
      street: { type: String, required: true },
      city: { type: String, required: true },
      zipCode: String
    })

    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      address: addressSchema
    })

    const User = model('UserSubdocValidation', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          address: {
            street: '123 Main St'
            // Missing required city
          }
        })
      },
      {
        name: 'ValidationError',
        message: /address:.*city is required/
      }
    )
  })

  await t.test('should validate array of subdocuments', async () => {
    const addressSchema = new Schema<AddressDoc>({
      street: String,
      city: { type: String, minLength: 2 },
      zipCode: String
    })

    const userSchema = new Schema<UserWithAddressesDoc>({
      name: String,
      addresses: addressSchema
    })

    const User = model('UserSubdocArrayValidation', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Bob',
          addresses: [
            { street: '123 Main St', city: 'NYC', zipCode: '10001' },
            { street: '456 Oak Ave', city: 'L', zipCode: '90001' } // City too short
          ]
        })
      },
      {
        name: 'ValidationError',
        message: /addresses:.*city must be at least 2 characters/
      }
    )
  })

  await t.test('should apply defaults to subdocuments', async () => {
    const addressSchema = new Schema<AddressDoc>({
      street: String,
      city: String,
      zipCode: { type: String, default: '00000' }
    })

    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      address: addressSchema
    })

    const User = model('UserSubdocDefaults', userSchema)
    const user = await User.create({
      name: 'Alice',
      age: 25,
      address: {
        street: '123 Main St',
        city: 'NYC'
        // zipCode should default to '00000'
      }
    })

    assert.strictEqual(user.address.zipCode, '00000')
  })

  await t.test('should apply defaults to array of subdocuments', async () => {
    const addressSchema = new Schema<AddressDoc>({
      street: String,
      city: String,
      zipCode: { type: String, default: 'NONE' }
    })

    const userSchema = new Schema<UserWithAddressesDoc>({
      name: String,
      addresses: addressSchema
    })

    const User = model('UserSubdocArrayDefaults', userSchema)
    const user = await User.create({
      name: 'Bob',
      addresses: [
        { street: '123 Main St', city: 'NYC' },
        { street: '456 Oak Ave', city: 'LA' }
      ]
    })

    assert.strictEqual(user.addresses[0].zipCode, 'NONE')
    assert.strictEqual(user.addresses[1].zipCode, 'NONE')
  })

  await t.test('should apply getters/setters to subdocuments', async () => {
    const addressSchema = new Schema<AddressDoc>({
      street: String,
      city: {
        type: String,
        set: (v: string) => v.toUpperCase(),
        get: (v: string) => v.toLowerCase()
      },
      zipCode: String
    })

    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      address: addressSchema
    })

    const User = model('UserSubdocGettersSetters', userSchema)
    const user = await User.create({
      name: 'Alice',
      age: 25,
      address: {
        street: '123 Main St',
        city: 'nyc', // Will be uppercased by setter
        zipCode: '10001'
      }
    })

    // Getter applies lowercase
    assert.strictEqual(user.address.city, 'nyc')
  })

  await t.test('should support nested schemas with type syntax', async () => {
    const addressSchema = new Schema<AddressDoc>({
      street: String,
      city: String,
      zipCode: String
    })

    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      address: { type: addressSchema }
    })

    const User = model('UserNestedTypeSyntax', userSchema)
    const user = await User.create({
      name: 'Charlie',
      age: 30,
      address: {
        street: '789 Elm St',
        city: 'Chicago',
        zipCode: '60601'
      }
    })

    assert.strictEqual(user.address.city, 'Chicago')
  })

  await t.test('should store and retrieve nested documents', async () => {
    const addressSchema = new Schema<AddressDoc>({
      street: String,
      city: String,
      zipCode: String
    })

    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      address: addressSchema
    })

    const User = model('UserNestedQuery', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25, address: { street: '123 Main St', city: 'NYC', zipCode: '10001' } },
      { name: 'Bob', age: 30, address: { street: '456 Oak Ave', city: 'LA', zipCode: '90001' } }
    ])

    const users = await User.find()

    assert.strictEqual(users.length, 2)
    assert.strictEqual(users[0].address.city, 'NYC')
    assert.strictEqual(users[1].address.city, 'LA')
  })

  await t.test('should support deeply nested schemas', async () => {
    interface ContactDoc {
      phone: string
      email: string
    }

    interface AddressWithContactDoc {
      street: string
      city: string
      contact: ContactDoc
    }

    const contactSchema = new Schema<ContactDoc>({
      phone: String,
      email: String
    })

    const addressSchema = new Schema<AddressWithContactDoc>({
      street: String,
      city: String,
      contact: contactSchema
    })

    const userSchema = new Schema({
      name: String,
      address: addressSchema
    })

    const User = model('UserDeeplyNested', userSchema)
    const user = await User.create({
      name: 'Alice',
      address: {
        street: '123 Main St',
        city: 'NYC',
        contact: {
          phone: '555-1234',
          email: 'alice@example.com'
        }
      }
    })

    assert.strictEqual(user.address.contact.email, 'alice@example.com')
  })

  await t.test('should validate deeply nested schemas', async () => {
    interface ContactDoc {
      phone: string
      email: string
    }

    const contactSchema = new Schema<ContactDoc>({
      phone: String,
      email: { type: String, required: true, match: /@/ }
    })

    const addressSchema = new Schema({
      street: String,
      contact: contactSchema
    })

    const userSchema = new Schema({
      name: String,
      address: addressSchema
    })

    const User = model('UserDeeplyNestedValidation', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          address: {
            street: '123 Main St',
            contact: {
              phone: '555-1234',
              email: 'invalid' // Doesn't match pattern
            }
          }
        })
      },
      {
        name: 'ValidationError',
        message: /address:.*contact:.*email does not match/
      }
    )
  })
})
