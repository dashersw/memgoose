import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model, clearRegistry } from '../index'

interface UserDoc {
  name: string
  age: number
  email: string
  password: string
  status: string
  score?: number
  tags?: string[]
}

test('Validation', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should validate required fields', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: true },
      age: { type: Number },
      email: String,
      password: String,
      status: String
    })

    const User = model('UserRequired', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          age: 25,
          email: 'test@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /name is required/
      }
    )
  })

  await t.test('should pass validation when required field is present', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: true },
      age: Number,
      email: String,
      password: String,
      status: String
    })

    const User = model('UserRequiredPass', userSchema)

    const user = await User.create({
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
      password: 'pass',
      status: 'active'
    })

    assert.strictEqual(user.name, 'Alice')
  })

  await t.test('should validate required with custom error message', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: [true, 'User name is mandatory'] },
      age: Number,
      email: String,
      password: String,
      status: String
    })

    const User = model('UserRequiredCustom', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          age: 25,
          email: 'test@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /User name is mandatory/
      }
    )
  })

  await t.test('should validate min value for numbers', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: { type: Number, min: 18 },
      email: String,
      password: String,
      status: String
    })

    const User = model('UserMinAge', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 15,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /age must be at least 18/
      }
    )
  })

  await t.test('should validate max value for numbers', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: { type: Number, max: 120 },
      email: String,
      password: String,
      status: String
    })

    const User = model('UserMaxAge', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 150,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /age must be at most 120/
      }
    )
  })

  await t.test('should validate min with custom error message', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: { type: Number, min: [18, 'Must be 18 or older'] },
      email: String,
      password: String,
      status: String
    })

    const User = model('UserMinCustom', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 15,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /Must be 18 or older/
      }
    )
  })

  await t.test('should validate minLength for strings', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, minLength: 3 },
      age: Number,
      email: String,
      password: { type: String, minLength: 8 },
      status: String
    })

    const User = model('UserMinLength', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Al',
          age: 25,
          email: 'al@example.com',
          password: 'short',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /password must be at least 8 characters/
      }
    )
  })

  await t.test('should validate maxLength for strings', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, maxLength: 50 },
      age: Number,
      email: String,
      password: String,
      status: String
    })

    const User = model('UserMaxLength', userSchema)

    const longName = 'A'.repeat(51)

    await assert.rejects(
      async () => {
        await User.create({
          name: longName,
          age: 25,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /name must be at most 50 characters/
      }
    )
  })

  await t.test('should validate maxLength for arrays', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: String,
      password: String,
      status: String,
      tags: { type: Array, maxLength: 3 }
    })

    const User = model('UserArrayMaxLength', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active',
          tags: ['one', 'two', 'three', 'four']
        })
      },
      {
        name: 'ValidationError',
        message: /tags must be at most 3 characters/
      }
    )

    // Should pass with 3 or fewer
    const user = await User.create({
      name: 'Bob',
      age: 30,
      email: 'bob@example.com',
      password: 'pass',
      status: 'active',
      tags: ['one', 'two', 'three']
    })
    assert.strictEqual(user.tags?.length, 3)
  })

  await t.test('should validate enum values', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: String,
      password: String,
      status: { type: String, enum: ['active', 'inactive', 'pending'] }
    })

    const User = model('UserEnum', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'alice@example.com',
          password: 'pass',
          status: 'deleted'
        })
      },
      {
        name: 'ValidationError',
        message: /status must be one of: active, inactive, pending/
      }
    )
  })

  await t.test('should validate enum with custom message', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: String,
      password: String,
      status: {
        type: String,
        enum: { values: ['active', 'inactive'], message: 'Invalid status value' }
      }
    })

    const User = model('UserEnumCustom', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'alice@example.com',
          password: 'pass',
          status: 'deleted'
        })
      },
      {
        name: 'ValidationError',
        message: /Invalid status value/
      }
    )
  })

  await t.test('should validate regex match for strings', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: { type: String, match: /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/ },
      password: String,
      status: String
    })

    const User = model('UserMatch', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'invalid-email',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /email does not match the required pattern/
      }
    )
  })

  await t.test('should validate regex match with custom message', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: {
        type: String,
        match: [/^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please provide a valid email']
      },
      password: String,
      status: String
    })

    const User = model('UserMatchCustom', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'invalid',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /Please provide a valid email/
      }
    )
  })

  await t.test('should validate with custom validator function', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: { type: Number, validate: (v: number) => v % 2 === 0 }, // Must be even
      email: String,
      password: String,
      status: String
    })

    const User = model('UserCustomValidator', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /age validation failed/
      }
    )

    // Should pass with even number
    const user = await User.create({
      name: 'Bob',
      age: 30,
      email: 'bob@example.com',
      password: 'pass',
      status: 'active'
    })
    assert.strictEqual(user.age, 30)
  })

  await t.test('should validate with custom validator object', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: String,
      password: {
        type: String,
        validate: {
          validator: (v: string) => v.length >= 8 && /[A-Z]/.test(v) && /[0-9]/.test(v),
          message: 'Password must be at least 8 characters with uppercase and number'
        }
      },
      status: String
    })

    const User = model('UserPasswordValidator', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'alice@example.com',
          password: 'weak',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /Password must be at least 8 characters with uppercase and number/
      }
    )

    const user = await User.create({
      name: 'Bob',
      age: 30,
      email: 'bob@example.com',
      password: 'Strong123',
      status: 'active'
    })
    assert.strictEqual(user.password, 'Strong123')
  })

  await t.test('should validate async custom validator', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: {
        type: String,
        validate: async (v: string) => {
          // Simulate async validation (e.g., checking uniqueness in DB)
          await new Promise(resolve => setTimeout(resolve, 1))
          return v.includes('@')
        }
      },
      password: String,
      status: String
    })

    const User = model('UserAsyncValidator', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'invalid',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /email validation failed/
      }
    )
  })

  await t.test('should validate multiple fields and collect all errors', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: true },
      age: { type: Number, min: 18, max: 100 },
      email: { type: String, match: /@/ },
      password: { type: String, minLength: 8 },
      status: { type: String, enum: ['active', 'inactive'] }
    })

    const User = model('UserMultipleErrors', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          age: 15, // Below min
          email: 'invalid', // Doesn't match
          password: 'short', // Too short
          status: 'deleted' // Not in enum
        })
      },
      {
        name: 'ValidationError',
        message:
          /name is required.*age must be at least 18.*email does not match.*password must be at least 8.*status must be one of/
      }
    )
  })

  await t.test('should validate on insertMany', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: true },
      age: Number,
      email: String,
      password: String,
      status: String
    })

    const User = model('UserInsertManyValidation', userSchema)

    await assert.rejects(
      async () => {
        await User.insertMany([
          {
            name: 'Alice',
            age: 25,
            email: 'alice@example.com',
            password: 'pass',
            status: 'active'
          },
          { age: 30, email: 'bob@example.com', password: 'pass', status: 'active' } // Missing name
        ])
      },
      {
        name: 'ValidationError',
        message: /name is required/
      }
    )

    // First doc should not be inserted (atomic behavior)
    const count = await User.countDocuments()
    assert.strictEqual(count, 0)
  })

  await t.test('should validate on updateOne', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: { type: Number, min: 18 },
      email: String,
      password: String,
      status: String
    })

    const User = model('UserUpdateValidation', userSchema)
    await User.create({
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
      password: 'pass',
      status: 'active'
    })

    await assert.rejects(
      async () => {
        await User.updateOne({ name: 'Alice' }, { $set: { age: 10 } })
      },
      {
        name: 'ValidationError',
        message: /age must be at least 18/
      }
    )

    // Should not have updated
    const user = await User.findOne({ name: 'Alice' })
    assert.strictEqual(user?.age, 25)
  })

  await t.test('should validate on updateMany', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: { type: Number, max: 100 },
      email: String,
      password: String,
      status: String
    })

    const User = model('UserUpdateManyValidation', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25, email: 'alice@example.com', password: 'pass', status: 'active' },
      { name: 'Bob', age: 30, email: 'bob@example.com', password: 'pass', status: 'active' }
    ])

    await assert.rejects(
      async () => {
        await User.updateMany({ status: 'active' }, { $set: { age: 150 } })
      },
      {
        name: 'ValidationError',
        message: /age must be at most 100/
      }
    )
  })

  await t.test('should validate minLength for arrays', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: String,
      password: String,
      status: String,
      tags: { type: Array, minLength: 2 }
    })

    const User = model('UserArrayMinLength', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active',
          tags: ['one']
        })
      },
      {
        name: 'ValidationError',
        message: /tags must be at least 2 characters/
      }
    )

    // Should pass with 2+ elements
    const user = await User.create({
      name: 'Bob',
      age: 30,
      email: 'bob@example.com',
      password: 'pass',
      status: 'active',
      tags: ['one', 'two']
    })
    assert.strictEqual(user.tags?.length, 2)
  })

  await t.test('should allow optional fields to be undefined', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: true },
      age: Number,
      email: String,
      password: String,
      status: String,
      score: { type: Number, min: 0 } // Optional but if provided must be >= 0
    })

    const User = model('UserOptionalFields', userSchema)

    // Should pass without score
    const user = await User.create({
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
      password: 'pass',
      status: 'active'
    })
    assert.strictEqual(user.score, undefined)
  })

  await t.test('should work with simple schema syntax (backward compatible)', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String, // Simple syntax
      age: Number,
      email: String,
      password: String,
      status: String
    })

    const User = model('UserSimpleSyntax', userSchema)

    // Should work without validation errors
    const user = await User.create({
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
      password: 'pass',
      status: 'active'
    })
    assert.strictEqual(user.name, 'Alice')
  })

  await t.test('should validate with multiple validations on same field', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: true, minLength: 3, maxLength: 50 },
      age: { type: Number, min: 18, max: 100 },
      email: { type: String, required: true, match: /@/ },
      password: { type: String, required: true, minLength: 8 },
      status: { type: String, enum: ['active', 'inactive'] }
    })

    const User = model('UserMultipleValidations', userSchema)

    // Should pass all validations
    const user = await User.create({
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
      password: 'SecurePass123',
      status: 'active'
    })

    assert.strictEqual(user.name, 'Alice')
    assert.strictEqual(user.age, 25)
  })

  await t.test('should validate min for dates', async () => {
    interface DateDoc {
      name: string
      birthdate: Date
    }

    const schema = new Schema<DateDoc>({
      name: String,
      birthdate: { type: Date, min: new Date('2000-01-01').getTime() }
    })

    const Model1 = model('DateMinValidation', schema)

    await assert.rejects(
      async () => {
        await Model1.create({ name: 'Alice', birthdate: new Date('1999-12-31') })
      },
      {
        name: 'ValidationError',
        message: /birthdate must be at least/
      }
    )

    // Should pass with valid date
    const doc = await Model1.create({ name: 'Bob', birthdate: new Date('2000-01-02') })
    assert.ok(doc.birthdate)
  })

  await t.test('should validate max for dates', async () => {
    interface DateDoc {
      name: string
      expiresAt: Date
    }

    const schema = new Schema<DateDoc>({
      name: String,
      expiresAt: { type: Date, max: new Date('2030-12-31').getTime() }
    })

    const Model1 = model('DateMaxValidation', schema)

    await assert.rejects(
      async () => {
        await Model1.create({ name: 'Alice', expiresAt: new Date('2031-01-01') })
      },
      {
        name: 'ValidationError',
        message: /expiresAt must be at most/
      }
    )
  })

  await t.test('should expose field options via getFieldOptions', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: true, minLength: 3 },
      age: { type: Number, min: 18 },
      email: String,
      password: String,
      status: String
    })

    const nameOptions = userSchema.getFieldOptions('name' as keyof UserDoc)
    assert.strictEqual(nameOptions?.required, true)
    assert.strictEqual(nameOptions?.minLength, 3)

    const ageOptions = userSchema.getFieldOptions('age' as keyof UserDoc)
    assert.strictEqual(ageOptions?.min, 18)
  })

  await t.test('should expose all field options via getAllFieldOptions', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, required: true },
      age: { type: Number, min: 18 },
      email: String,
      password: String,
      status: String
    })

    const allOptions = userSchema.getAllFieldOptions()
    assert.ok(allOptions.has('name' as keyof UserDoc))
    assert.ok(allOptions.has('age' as keyof UserDoc))
    assert.strictEqual(allOptions.size, 5)
  })

  await t.test('should validate max with custom error message', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: { type: Number, max: [100, 'Age cannot exceed 100 years'] },
      email: String,
      password: String,
      status: String
    })

    const User = model('UserMaxCustom', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 150,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /Age cannot exceed 100 years/
      }
    )
  })

  await t.test('should validate minLength with custom error message', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, minLength: [3, 'Name too short'] },
      age: Number,
      email: String,
      password: String,
      status: String
    })

    const User = model('UserMinLengthCustom', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Al',
          age: 25,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /Name too short/
      }
    )
  })

  await t.test('should validate maxLength with custom error message', async () => {
    const userSchema = new Schema<UserDoc>({
      name: { type: String, maxLength: [10, 'Name is too long'] },
      age: Number,
      email: String,
      password: String,
      status: String
    })

    const User = model('UserMaxLengthCustom', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'VeryLongName123',
          age: 25,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /Name is too long/
      }
    )
  })

  await t.test('should use default enum error message', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number,
      email: String,
      password: String,
      status: { type: String, enum: { values: ['active', 'inactive'] } } // No custom message
    })

    const User = model('UserEnumDefaultMsg', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: 25,
          email: 'alice@example.com',
          password: 'pass',
          status: 'deleted'
        })
      },
      {
        name: 'ValidationError',
        message: /status must be one of: active, inactive/
      }
    )
  })

  await t.test('should use default validator error message', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: {
        type: Number,
        validate: { validator: (v: number) => v > 0 } // No custom message
      },
      email: String,
      password: String,
      status: String
    })

    const User = model('UserValidatorDefaultMsg', userSchema)

    await assert.rejects(
      async () => {
        await User.create({
          name: 'Alice',
          age: -5,
          email: 'alice@example.com',
          password: 'pass',
          status: 'active'
        })
      },
      {
        name: 'ValidationError',
        message: /age validation failed/
      }
    )
  })
})
