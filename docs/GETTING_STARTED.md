# Getting Started with memgoose

Quick start guide to get up and running with memgoose.

## Table of Contents

- [Installation](#installation)
- [Your First Model](#your-first-model)
- [Basic Operations](#basic-operations)
- [Adding Indexes](#adding-indexes)
- [Adding Validation](#adding-validation)
- [Adding Persistence](#adding-persistence)
- [Next Steps](#next-steps)

---

## Installation

Install memgoose via npm:

```bash
npm install memgoose
```

**For SQLite storage (optional):**

```bash
npm install better-sqlite3
```

**For WiredTiger storage (optional):**

WiredTiger bindings are built automatically during `npm install`. Requires build tools (see [WIREDTIGER.md](WIREDTIGER.md) for details).

---

## Your First Model

Let's create a simple User model:

```typescript
import { Schema, model } from 'memgoose'

// 1. Define your document interface
interface User {
  name: string
  email: string
  age: number
}

// 2. Create a schema
const userSchema = new Schema<User>({
  name: String,
  email: String,
  age: Number
})

// 3. Create a model
const User = model('User', userSchema)

// 4. Use the model!
const user = await User.create({
  name: 'Alice',
  email: 'alice@example.com',
  age: 25
})

console.log(user)
// { name: 'Alice', email: 'alice@example.com', age: 25, _id: '...' }
```

That's it! You now have a working in-memory database.

---

## Basic Operations

### Create Documents

```typescript
// Create single document
const alice = await User.create({
  name: 'Alice',
  email: 'alice@example.com',
  age: 25
})

// Create multiple documents
const users = await User.insertMany([
  { name: 'Bob', email: 'bob@example.com', age: 30 },
  { name: 'Charlie', email: 'charlie@example.com', age: 35 }
])
```

### Find Documents

```typescript
// Find all
const allUsers = await User.find()

// Find with filter
const adults = await User.find({ age: { $gte: 18 } })

// Find one
const alice = await User.findOne({ name: 'Alice' })

// Find by ID
const user = await User.findById('507f1f77bcf86cd799439011')
```

### Update Documents

```typescript
// Update one
await User.updateOne({ name: 'Alice' }, { $set: { age: 26 } })

// Update many
await User.updateMany({ age: { $lt: 18 } }, { $set: { status: 'minor' } })

// Increment
await User.updateOne({ name: 'Bob' }, { $inc: { loginCount: 1 } })
```

### Delete Documents

```typescript
// Delete one
await User.deleteOne({ name: 'Alice' })

// Delete many
await User.deleteMany({ status: 'inactive' })
```

### Count Documents

```typescript
// Count all
const total = await User.countDocuments()

// Count matching
const adultCount = await User.countDocuments({ age: { $gte: 18 } })
```

---

## Adding Indexes

Indexes dramatically improve query performance. Add them to your schema:

```typescript
const userSchema = new Schema<User>({
  name: String,
  email: String,
  age: Number
})

// Add indexes
userSchema.index('email') // Single-field index
userSchema.index(['city', 'age']) // Compound index

const User = model('User', userSchema)

// Now queries on indexed fields are much faster!
const user = await User.findOne({ email: 'alice@example.com' })
// O(1) instead of O(n) - instant lookup!
```

### Performance Improvement

On 100,000 documents:

```typescript
// Without index: ~40ms (scans all documents)
// With index: ~0.2ms (instant lookup!)
const user = await User.findOne({ email: 'alice@example.com' })
```

See [PERFORMANCE.md](PERFORMANCE.md) for detailed benchmarks.

---

## Adding Validation

Add validation rules to ensure data integrity:

```typescript
const userSchema = new Schema<User>({
  name: {
    type: String,
    required: true,
    minLength: 2,
    maxLength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  age: {
    type: Number,
    required: true,
    min: [0, 'Age cannot be negative'],
    max: [120, 'Age cannot exceed 120']
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }
})

const User = model('User', userSchema)

// Validation happens automatically
try {
  await User.create({
    name: 'A', // Too short!
    email: 'invalid-email',
    age: -5 // Negative!
  })
} catch (err) {
  console.error(err.message)
  // "name must be at least 2 characters; email does not match pattern; age cannot be negative"
}
```

See [SCHEMAS.md](SCHEMAS.md) for all validation options.

---

## Adding Persistence

By default, memgoose stores data in memory. Add persistence with storage backends:

### File Storage (NDJSON + WAL)

Simple file-based persistence:

```typescript
import { connect } from 'memgoose'

// Connect with file storage
const db = connect({
  storage: 'file',
  file: {
    dataPath: './data',
    persistMode: 'debounced' // or 'immediate'
  }
})

// Create models on this database
const User = db.model('User', userSchema)

// Data persists to ./data/User.data.ndjson
await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })

// Don't forget to disconnect when done!
process.on('SIGINT', async () => {
  await db.disconnect()
  process.exit(0)
})
```

### SQLite Storage

Production-ready persistence with ACID guarantees:

```bash
# Install SQLite peer dependency
npm install better-sqlite3
```

```typescript
import { connect } from 'memgoose'

const db = connect({
  storage: 'sqlite',
  sqlite: {
    dataPath: './data'
  }
})

const User = db.model('User', userSchema)

// Data persists to ./data/User.db
await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })
```

### WiredTiger Storage

High-performance storage (powers MongoDB):

```typescript
import { connect } from 'memgoose'

const db = connect({
  storage: 'wiredtiger',
  wiredtiger: {
    dataPath: './data/wiredtiger',
    cacheSize: '500M'
  }
})

const User = db.model('User', userSchema)

// High-performance persistent storage
await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })
```

See [STORAGE.md](STORAGE.md) for detailed storage documentation.

---

## Next Steps

### Learn More

- **[API Reference](API.md)** - Complete API documentation
- **[Schemas](SCHEMAS.md)** - Field types, validation, timestamps
- **[Queries](QUERIES.md)** - Query and update operators
- **[Storage](STORAGE.md)** - Storage backends (memory, file, SQLite, WiredTiger)
- **[Advanced Features](ADVANCED.md)** - Hooks, virtuals, populate, discriminators
- **[Performance](PERFORMANCE.md)** - Optimization and benchmarks
- **[WiredTiger](WIREDTIGER.md)** - WiredTiger storage details

### Examples

Check out the [examples](../examples) folder for more usage patterns:

```bash
# Basic example
npm run example

# Performance benchmark (100k documents)
npm run example:perf

# Virtuals and hooks
npm run example:virtuals

# Complete features demo
npm run example:showcase

# Storage demos
npm run example:file
npm run example:sqlite
npm run example:wiredtiger
```

### Common Patterns

#### RESTful API

```typescript
import express from 'express'
import { connect, Schema, model } from 'memgoose'

const app = express()
app.use(express.json())

// Connect with persistence
const db = connect({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})

// Define schema
const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: Number
})

userSchema.index('email')

const User = db.model('User', userSchema)

// Routes
app.get('/users', async (req, res) => {
  const users = await User.find()
  res.json(users)
})

app.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id)
  if (!user) return res.status(404).json({ error: 'Not found' })
  res.json(user)
})

app.post('/users', async (req, res) => {
  try {
    const user = await User.create(req.body)
    res.status(201).json(user)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.patch('/users/:id', async (req, res) => {
  await User.updateOne({ _id: req.params.id }, { $set: req.body })
  const user = await User.findById(req.params.id)
  res.json(user)
})

app.delete('/users/:id', async (req, res) => {
  await User.deleteOne({ _id: req.params.id })
  res.status(204).send()
})

app.listen(3000, () => console.log('Server running on port 3000'))
```

#### Testing

```typescript
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from 'memgoose'

describe('User model', () => {
  const userSchema = new Schema({
    name: String,
    email: String
  })

  const User = model('User', userSchema)

  beforeEach(async () => {
    // Clear database before each test
    await User.deleteMany({})
  })

  it('should create a user', async () => {
    const user = await User.create({
      name: 'Alice',
      email: 'alice@example.com'
    })

    assert.strictEqual(user.name, 'Alice')
    assert.strictEqual(user.email, 'alice@example.com')
  })

  it('should find a user', async () => {
    await User.create({ name: 'Alice', email: 'alice@example.com' })

    const user = await User.findOne({ name: 'Alice' })
    assert(user)
    assert.strictEqual(user.email, 'alice@example.com')
  })

  it('should update a user', async () => {
    await User.create({ name: 'Alice', email: 'alice@example.com' })

    await User.updateOne({ name: 'Alice' }, { $set: { email: 'new@example.com' } })

    const user = await User.findOne({ name: 'Alice' })
    assert.strictEqual(user.email, 'new@example.com')
  })

  it('should delete a user', async () => {
    await User.create({ name: 'Alice', email: 'alice@example.com' })

    await User.deleteOne({ name: 'Alice' })

    const user = await User.findOne({ name: 'Alice' })
    assert.strictEqual(user, null)
  })
})
```

#### Caching

```typescript
import { createDatabase } from 'memgoose'

// In-memory cache
const cacheDb = createDatabase({ storage: 'memory' })
const Cache = cacheDb.model('Cache', cacheSchema)

// Persistent storage
const mainDb = createDatabase({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})
const User = mainDb.model('User', userSchema)

// Get user with caching
async function getUser(id: string) {
  // Check cache first
  let user = await Cache.findOne({ _id: id })

  if (!user) {
    // Cache miss - fetch from database
    user = await User.findById(id)

    if (user) {
      // Store in cache
      await Cache.create(user)
    }
  }

  return user
}

// Invalidate cache on update
async function updateUser(id: string, data: any) {
  await User.updateOne({ _id: id }, { $set: data })
  await Cache.deleteOne({ _id: id }) // Invalidate cache
}
```

### Migration from Mongoose

memgoose is designed to be Mongoose-compatible for easy migration:

```typescript
// Mongoose code
import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: String,
  email: String
})

const User = mongoose.model('User', userSchema)

// memgoose equivalent (mostly the same!)
import { Schema, model } from 'memgoose'

const userSchema = new Schema({
  name: String,
  email: String
})

const User = model('User', userSchema)
```

Key differences:

- Add storage configuration for persistence
- Some advanced Mongoose features not implemented yet
- Better TypeScript support in memgoose

### Need Help?

- **Issues**: [GitHub Issues](https://github.com/dashersw/memgoose/issues)
- **Examples**: [examples/](../examples)
- **Tests**: [tests/](../tests) - comprehensive test suite showing all features

---

## Quick Reference

### Common Query Operators

```typescript
// Equality
{ name: 'Alice' }
{ name: { $eq: 'Alice' } }

// Comparison
{ age: { $gt: 18 } }
{ age: { $gte: 18, $lt: 65 } }

// Arrays
{ name: { $in: ['Alice', 'Bob'] } }
{ status: { $nin: ['deleted', 'suspended'] } }

// Regex
{ name: { $regex: /^A/i } }
```

### Common Update Operators

```typescript
// Set fields
{ $set: { age: 26, city: 'NYC' } }

// Increment
{ $inc: { loginCount: 1 } }

// Array operations
{ $push: { tags: 'verified' } }
{ $pull: { tags: 'temporary' } }
{ $addToSet: { tags: 'unique' } }
```

### Common Schema Options

```typescript
const schema = new Schema(
  {
    // Required
    name: { type: String, required: true },

    // With validation
    age: { type: Number, min: 0, max: 120 },

    // With default
    status: { type: String, default: 'active' },

    // Enum
    role: { type: String, enum: ['user', 'admin'] },

    // Unique index
    email: { type: String, unique: true },

    // Pattern matching
    zipCode: { type: String, match: /^\d{5}$/ }
  },
  { timestamps: true }
)
```

Happy coding with memgoose! 🎉
