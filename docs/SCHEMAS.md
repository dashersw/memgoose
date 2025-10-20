# Schema Guide

Complete guide to defining schemas in memgoose.

## Table of Contents

- [Basic Schema Definition](#basic-schema-definition)
- [Field Types](#field-types)
- [Field Options](#field-options)
- [Validation](#validation)
- [Defaults](#defaults)
- [Getters and Setters](#getters-and-setters)
- [Indexes](#indexes)
- [Timestamps](#timestamps)
- [Subdocuments](#subdocuments)
- [Schema Options](#schema-options)
- [Methods and Statics](#methods-and-statics)

---

## Basic Schema Definition

Schemas define the structure of your documents, similar to Mongoose.

```typescript
import { Schema, model } from 'memgoose'

interface User {
  name: string
  email: string
  age: number
}

// Simple syntax
const userSchema = new Schema<User>({
  name: String,
  email: String,
  age: Number
})

// Detailed syntax with options
const userSchema2 = new Schema<User>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: { type: Number, min: 0, max: 120 }
})

const User = model('User', userSchema)
```

---

## Field Types

memgoose supports the following field types:

### String

```typescript
const schema = new Schema({
  name: String,
  // or
  name: { type: String }
})
```

### Number

```typescript
const schema = new Schema({
  age: Number,
  // or
  age: { type: Number }
})
```

### Boolean

```typescript
const schema = new Schema({
  active: Boolean,
  // or
  active: { type: Boolean }
})
```

### Date

```typescript
const schema = new Schema({
  createdAt: Date,
  // or
  createdAt: { type: Date }
})
```

### Array

```typescript
const schema = new Schema({
  tags: [String],
  scores: [Number],
  // or
  tags: { type: [String] }
})
```

### Object / Mixed

```typescript
const schema = new Schema({
  metadata: Object,
  settings: { type: Object }
})
```

### ObjectId

```typescript
import { ObjectId, Schema } from 'memgoose'

const schema = new Schema({
  _id: ObjectId,
  authorId: { type: ObjectId }
})
```

### Nested Schema (Subdocuments)

```typescript
const addressSchema = new Schema({
  street: String,
  city: String,
  zipCode: String
})

const userSchema = new Schema({
  name: String,
  address: addressSchema,
  // Array of subdocuments
  addresses: [addressSchema]
})
```

---

## Field Options

Field options provide validation, defaults, and behavior customization.

### Complete FieldOptions Interface

```typescript
interface FieldOptions {
  type?: any // Field type
  required?: boolean | [boolean, string] // Required with optional custom error
  default?: any | (() => any) // Default value or function
  min?: number | [number, string] // Min value (numbers/dates)
  max?: number | [number, string] // Max value (numbers/dates)
  minLength?: number | [number, string] // Min length (strings/arrays)
  maxLength?: number | [number, string] // Max length (strings/arrays)
  enum?: any[] | { values: any[]; message?: string } // Enumerated values
  match?: RegExp | [RegExp, string] // Regex pattern (strings)
  validate?: ValidatorFunction | { validator: ValidatorFunction; message?: string }
  ref?: string // Reference to another model (for populate)
  get?: (value: any) => any // Getter function
  set?: (value: any) => any // Setter function
  unique?: boolean // Unique constraint (auto-creates index)
}
```

### Examples

```typescript
const userSchema = new Schema({
  // Required field
  email: { type: String, required: true },

  // Required with custom error
  username: { type: String, required: [true, 'Username is mandatory'] },

  // Default value
  status: { type: String, default: 'active' },

  // Default from function
  createdAt: { type: Date, default: () => new Date() },

  // Min/max for numbers
  age: { type: Number, min: 0, max: 120 },

  // Min/max with custom errors
  score: {
    type: Number,
    min: [0, 'Score cannot be negative'],
    max: [100, 'Score cannot exceed 100']
  },

  // String length validation
  name: { type: String, minLength: 2, maxLength: 50 },

  // Array length validation
  tags: { type: [String], maxLength: [10, 'Cannot have more than 10 tags'] },

  // Enum values
  role: { type: String, enum: ['user', 'admin', 'moderator'] },

  // Enum with custom error
  status: {
    type: String,
    enum: {
      values: ['pending', 'active', 'suspended'],
      message: 'Invalid status value'
    }
  },

  // Regex pattern matching
  phoneNumber: { type: String, match: /^\d{10}$/ },

  // Pattern with custom error
  zipCode: { type: String, match: [/^\d{5}$/, 'Invalid ZIP code format'] },

  // Unique constraint (auto-creates unique index)
  email: { type: String, unique: true },

  // Reference to another model
  authorId: { type: ObjectId, ref: 'User' }
})
```

---

## Validation

memgoose provides comprehensive validation similar to Mongoose.

### Built-in Validators

#### Required

```typescript
const schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: [true, 'Email is required'] }
})
```

#### Type Validation

Types are automatically validated:

```typescript
await User.create({ age: 'invalid' }) // Will work but type checking helps prevent this
```

#### Range Validation (min/max)

For numbers and dates:

```typescript
const schema = new Schema({
  age: { type: Number, min: 18, max: 100 },
  birthDate: { type: Date, min: new Date('1900-01-01') }
})
```

#### Length Validation (minLength/maxLength)

For strings and arrays:

```typescript
const schema = new Schema({
  username: { type: String, minLength: 3, maxLength: 20 },
  tags: { type: [String], maxLength: 10 }
})
```

#### Enum Validation

Restrict to specific values:

```typescript
const schema = new Schema({
  status: { type: String, enum: ['draft', 'published', 'archived'] }
})
```

#### Pattern Matching

Use regex for string validation:

```typescript
const schema = new Schema({
  email: { type: String, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  slug: { type: String, match: [/^[a-z0-9-]+$/, 'Invalid slug format'] }
})
```

### Custom Validators

#### Simple Validator Function

```typescript
const schema = new Schema({
  age: {
    type: Number,
    validate: value => value >= 18
  }
})
```

#### Validator with Custom Message

```typescript
const schema = new Schema({
  age: {
    type: Number,
    validate: {
      validator: value => value >= 18,
      message: 'Must be 18 or older'
    }
  }
})
```

#### Async Validator

```typescript
const schema = new Schema({
  username: {
    type: String,
    validate: {
      validator: async value => {
        const exists = await checkUsernameExists(value)
        return !exists
      },
      message: 'Username already taken'
    }
  }
})
```

### Validation Errors

Validation errors are thrown as `ValidationError`:

```typescript
import { ValidationError } from 'memgoose'

try {
  await User.create({
    name: 'A', // Too short (minLength: 2)
    age: -5, // Too low (min: 0)
    email: 'invalid' // Doesn't match pattern
  })
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(err.message)
    // "name must be at least 2 characters; age must be at least 0; email does not match pattern"
  }
}
```

### Manual Validation

You can manually validate a document:

```typescript
const doc = { name: 'Alice', age: -5 }

try {
  await userSchema.validate(doc)
} catch (err) {
  console.error('Validation failed:', err.message)
}
```

---

## Defaults

Default values are automatically applied when a field is undefined.

### Static Defaults

```typescript
const schema = new Schema({
  status: { type: String, default: 'pending' },
  score: { type: Number, default: 0 },
  tags: { type: [String], default: [] }
})

const user = await User.create({ name: 'Alice' })
console.log(user.status) // 'pending'
console.log(user.score) // 0
console.log(user.tags) // []
```

### Function Defaults

Useful for generating dynamic values:

```typescript
const schema = new Schema({
  createdAt: { type: Date, default: () => new Date() },
  id: { type: String, default: () => Math.random().toString(36) },
  sessionToken: { type: String, default: () => crypto.randomUUID() }
})

const user1 = await User.create({ name: 'Alice' })
const user2 = await User.create({ name: 'Bob' })

console.log(user1.createdAt !== user2.createdAt) // true (different timestamps)
```

### Default with Subdocuments

Defaults work with nested schemas:

```typescript
const addressSchema = new Schema({
  country: { type: String, default: 'USA' }
})

const userSchema = new Schema({
  address: { type: addressSchema, default: {} }
})

const user = await User.create({ name: 'Alice' })
console.log(user.address.country) // 'USA'
```

---

## Getters and Setters

Transform field values when reading or writing.

### Getters

Applied when reading a field:

```typescript
const schema = new Schema({
  priceInCents: {
    type: Number,
    get: value => value / 100 // Convert cents to dollars
  },
  email: {
    type: String,
    get: value => value.toLowerCase()
  }
})

const product = await Product.create({ priceInCents: 1999 })
console.log(product.priceInCents) // 19.99
```

### Setters

Applied when writing a field:

```typescript
const schema = new Schema({
  email: {
    type: String,
    set: value => value.toLowerCase().trim()
  },
  name: {
    type: String,
    set: value => value.trim()
  }
})

const user = await User.create({
  email: '  ALICE@EXAMPLE.COM  ',
  name: '  Alice Smith  '
})
console.log(user.email) // 'alice@example.com'
console.log(user.name) // 'Alice Smith'
```

### Getter and Setter Together

```typescript
const schema = new Schema({
  password: {
    type: String,
    set: value => hashPassword(value), // Hash on write
    get: value => '***HIDDEN***' // Hide on read
  }
})
```

### Getters with Subdocuments

Getters/setters work recursively with nested schemas:

```typescript
const addressSchema = new Schema({
  zipCode: {
    type: String,
    set: value => value.replace(/\D/g, '') // Remove non-digits
  }
})

const userSchema = new Schema({
  address: addressSchema
})

const user = await User.create({
  address: { zipCode: '12-345' }
})
console.log(user.address.zipCode) // '12345'
```

---

## Indexes

Indexes dramatically improve query performance.

### Single-Field Indexes

```typescript
const schema = new Schema({
  email: String,
  name: String
})

// Add indexes to schema
schema.index('email')
schema.index('name')

const User = model('User', schema)
```

### Compound Indexes

Index multiple fields together:

```typescript
const schema = new Schema({
  city: String,
  age: Number,
  status: String
})

// Compound index
schema.index(['city', 'age'])

// Mongoose-style object format
schema.index({ author: 1, year: -1 })
```

### Unique Indexes

Enforce uniqueness:

```typescript
// Method 1: Via schema field options (recommended)
const schema = new Schema({
  email: { type: String, unique: true }
})

// Method 2: Via schema.index()
const schema2 = new Schema({
  username: String
})
schema2.index('username', { unique: true })

// Compound unique index
schema.index(['email', 'provider'], { unique: true })
```

### Programmatic Index Creation

```typescript
const User = model('User', userSchema)

// Create index after model creation
User.createIndex('email')
User.createIndex(['city', 'status'])
```

### Index Performance

With indexes, queries are O(1) instead of O(n):

```typescript
// 100,000 documents
User.createIndex('email')

// Without index: ~40ms (scans all docs)
// With index: ~0.2ms (instant lookup)
await User.findOne({ email: 'alice@example.com' })
```

See [PERFORMANCE.md](PERFORMANCE.md) for detailed benchmarks.

---

## Timestamps

Automatically add `createdAt` and `updatedAt` fields.

### Enable Timestamps

```typescript
const schema = new Schema(
  {
    name: String,
    email: String
  },
  { timestamps: true }
)

const User = model('User', schema)

const user = await User.create({ name: 'Alice' })
console.log(user.createdAt) // 2025-10-20T10:30:00.000Z
console.log(user.updatedAt) // 2025-10-20T10:30:00.000Z

// Update the user
await User.updateOne({ name: 'Alice' }, { $set: { email: 'alice@example.com' } })

const updated = await User.findOne({ name: 'Alice' })
console.log(updated.createdAt) // 2025-10-20T10:30:00.000Z (unchanged)
console.log(updated.updatedAt) // 2025-10-20T10:35:00.000Z (updated)
```

### Custom Timestamp Field Names

```typescript
const schema = new Schema(
  {
    name: String
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
)
```

### Disable Specific Timestamps

```typescript
// Only createdAt, no updatedAt
const schema = new Schema(
  {
    name: String
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false
    }
  }
)

// Only updatedAt, no createdAt
const schema2 = new Schema(
  {
    name: String
  },
  {
    timestamps: {
      createdAt: false,
      updatedAt: true
    }
  }
)
```

---

## Subdocuments

Subdocuments are nested schemas within a parent schema.

### Define Subdocument Schema

```typescript
const addressSchema = new Schema({
  street: String,
  city: String,
  state: String,
  zipCode: { type: String, match: /^\d{5}$/ }
})

const userSchema = new Schema({
  name: String,
  address: addressSchema // Single subdocument
})

const User = model('User', userSchema)

const user = await User.create({
  name: 'Alice',
  address: {
    street: '123 Main St',
    city: 'New York',
    state: 'NY',
    zipCode: '10001'
  }
})

console.log(user.address.city) // 'New York'
```

### Array of Subdocuments

```typescript
const phoneSchema = new Schema({
  type: { type: String, enum: ['home', 'work', 'mobile'] },
  number: String
})

const userSchema = new Schema({
  name: String,
  phones: [phoneSchema] // Array of subdocuments
})

const user = await User.create({
  name: 'Alice',
  phones: [
    { type: 'home', number: '555-1234' },
    { type: 'mobile', number: '555-5678' }
  ]
})

console.log(user.phones[0].type) // 'home'
```

### Nested Subdocuments

```typescript
const addressSchema = new Schema({
  street: String,
  city: String,
  coordinates: new Schema({
    lat: Number,
    lng: Number
  })
})

const userSchema = new Schema({
  name: String,
  address: addressSchema
})

const user = await User.create({
  name: 'Alice',
  address: {
    street: '123 Main St',
    city: 'NYC',
    coordinates: { lat: 40.7128, lng: -74.006 }
  }
})

console.log(user.address.coordinates.lat) // 40.7128
```

### Subdocument Validation

Validation rules in subdocuments work automatically:

```typescript
const addressSchema = new Schema({
  street: { type: String, required: true },
  zipCode: { type: String, match: /^\d{5}$/ }
})

const userSchema = new Schema({
  name: String,
  address: { type: addressSchema, required: true }
})

// Validation error: missing required field in subdocument
await User.create({
  name: 'Alice',
  address: { zipCode: '10001' } // Missing 'street'
})
```

### Subdocument Defaults

Defaults apply to subdocuments:

```typescript
const settingsSchema = new Schema({
  theme: { type: String, default: 'light' },
  notifications: { type: Boolean, default: true }
})

const userSchema = new Schema({
  name: String,
  settings: { type: settingsSchema, default: {} }
})

const user = await User.create({ name: 'Alice' })
console.log(user.settings.theme) // 'light'
console.log(user.settings.notifications) // true
```

---

## Schema Options

Configure schema-level behavior.

### Available Options

```typescript
interface SchemaOptions {
  timestamps?:
    | boolean
    | {
        createdAt?: string | boolean
        updatedAt?: string | boolean
      }
  discriminatorKey?: string
}
```

### Timestamps

See [Timestamps](#timestamps) section above.

### Discriminator Key

Used for schema inheritance (discriminators):

```typescript
const eventSchema = new Schema(
  {
    title: String,
    date: Date
  },
  { discriminatorKey: 'type' }
)

// All documents will have a 'type' field
const Event = model('Event', eventSchema)
```

See [ADVANCED.md](ADVANCED.md#discriminators) for discriminator patterns.

---

## Methods and Statics

Add custom functions to schemas.

### Instance Methods

Methods available on document instances:

```typescript
interface User {
  firstName: string
  lastName: string
  email: string
}

const userSchema = new Schema<User>({
  firstName: String,
  lastName: String,
  email: String
})

// Add instance method
userSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`
}

userSchema.methods.sendEmail = async function (subject: string, body: string) {
  await emailService.send(this.email, subject, body)
}

const User = model('User', userSchema)

const user = await User.findOne({ email: 'alice@example.com' })
console.log(user.getFullName()) // 'Alice Smith'
await user.sendEmail('Hello', 'Welcome!')
```

### Static Methods

Methods available on the model itself:

```typescript
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email })
}

userSchema.statics.findAdults = function () {
  return this.find({ age: { $gte: 18 } })
}

const User = model('User', userSchema)

// Use static methods
const user = await User.findByEmail('alice@example.com')
const adults = await User.findAdults()
```

### Type-Safe Methods (TypeScript)

For proper TypeScript support, extend the interface:

```typescript
interface UserDocument extends User {
  getFullName(): string
  sendEmail(subject: string, body: string): Promise<void>
}

interface UserModel extends Model<UserDocument> {
  findByEmail(email: string): Promise<UserDocument | null>
  findAdults(): Promise<UserDocument[]>
}

const userSchema = new Schema<UserDocument>({
  /* ... */
})

userSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`
}

userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email })
}

const User = model('User', userSchema) as UserModel
```

---

## Best Practices

### 1. Define TypeScript Interfaces

```typescript
interface User {
  name: string
  email: string
  age: number
}

const userSchema = new Schema<User>({
  /* ... */
})
```

### 2. Use Validation

Always validate user input:

```typescript
const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  age: { type: Number, min: 0, max: 120 }
})
```

### 3. Index Frequently Queried Fields

```typescript
userSchema.index('email')
userSchema.index(['city', 'status'])
```

### 4. Use Timestamps

```typescript
const schema = new Schema(
  {
    /* ... */
  },
  { timestamps: true }
)
```

### 5. Leverage Subdocuments

Break complex schemas into reusable subdocuments:

```typescript
const addressSchema = new Schema({
  /* ... */
})
const phoneSchema = new Schema({
  /* ... */
})

const userSchema = new Schema({
  address: addressSchema,
  phones: [phoneSchema]
})
```

### 6. Use Defaults Wisely

Provide sensible defaults:

```typescript
const schema = new Schema({
  status: { type: String, default: 'active' },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: () => new Date() }
})
```

### 7. Custom Validation for Business Logic

```typescript
const schema = new Schema({
  age: {
    type: Number,
    validate: {
      validator: v => v >= 18,
      message: 'Must be 18 or older to register'
    }
  }
})
```
