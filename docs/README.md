# memgoose Documentation

Complete documentation for memgoose - a lightweight, high-performance in-memory database with MongoDB-like query operators.

## Quick Links

- **[Getting Started](GETTING_STARTED.md)** - Start here! Quick introduction and basic usage
- **[API Reference](API.md)** - Complete API documentation
- **[Examples](../examples)** - Usage examples and demos

## Documentation Index

### Core Concepts

1. **[Getting Started Guide](GETTING_STARTED.md)**
   - Installation
   - Your first model
   - Basic CRUD operations
   - Adding persistence
   - Common patterns

2. **[Schemas](SCHEMAS.md)**
   - Field types and definitions
   - Validation (required, min/max, enum, regex, custom)
   - Defaults
   - Getters and setters
   - Indexes (single-field, compound, unique, TTL)
   - Timestamps
   - Subdocuments
   - Methods and statics

3. **[Queries](QUERIES.md)**
   - Query operators ($eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $regex, $exists, $size, $elemMatch, $all)
   - Logical operators ($or, $and, $nor, $not)
   - Update operators ($set, $unset, $inc, $dec, $push, $pull, $addToSet, $pop, $rename)
   - Query options (sort, limit, skip, lean, select, populate)
   - Query chaining
   - Field selection
   - Sorting and pagination
   - Lean queries
   - Populate (references)
   - Atomic operations (findOneAndUpdate, findOneAndDelete)

4. **[Aggregation](AGGREGATION.md)** 🆕
   - Complete aggregation pipeline
   - Pipeline stages ($match, $group, $project, $lookup, $unwind, $sort, $limit, $skip, $count, $addFields, $replaceRoot, $sample)
   - Advanced stages ($bucket, $bucketAuto, $facet, $out, $merge)
   - Expression operators (date, string, array, type conversion, conditional, object)
   - Accumulator operators ($sum, $avg, $min, $max, $first, $last, $push, $addToSet)
   - Real-world examples and performance tips

5. **[Storage Backends](STORAGE.md)**
   - Memory storage (default, fastest)
   - File storage (NDJSON + WAL)
   - SQLite storage (ACID, production-ready)
   - WiredTiger storage (high-performance, powers MongoDB)
   - Mixed storage (different backends per model)
   - Comparison and decision guide

### Advanced Features

6. **[Advanced Features](ADVANCED.md)**
   - Virtuals (computed properties)
   - Hooks/middleware (pre/post save, update, delete, find)
   - Populate (document references)
   - Discriminators (schema inheritance)
   - Instance methods
   - Static methods
   - Document save method
   - Getters and setters
   - Subdocuments (nested schemas)
   - Timestamps

7. **[Performance Guide](PERFORMANCE.md)**
   - Index performance (83-1147x speedup!)
   - Query optimization
   - Storage performance comparison
   - Lean queries (17.5x faster)
   - Batch operations
   - Comprehensive benchmarks
   - Best practices
   - Profiling techniques

8. **[WiredTiger Storage](WIREDTIGER.md)**
   - Architecture and features
   - Installation and build requirements
   - Configuration options
   - Performance characteristics
   - Troubleshooting
   - Advanced usage

### Reference

9. **[API Reference](API.md)**
   - Schema class and methods
   - Model class and methods
   - Database and connection management
   - Query builders (FindQueryBuilder, DocumentQueryBuilder)
   - Aggregation engine
   - ObjectId
   - Storage strategies
   - Type definitions
   - Error types

## Quick Start

### Installation

```bash
npm install memgoose

# For SQLite storage (optional)
npm install better-sqlite3

# For WiredTiger storage (optional)
npm install memgoose-wiredtiger
```

### Basic Usage

```typescript
import { Schema, model } from 'memgoose'

// Define schema
const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: { type: Number, min: 0, max: 120 }
})

// Add index for fast queries
userSchema.index('email')

// Create model
const User = model('User', userSchema)

// Create document
const user = await User.create({
  name: 'Alice',
  email: 'alice@example.com',
  age: 25
})

// Query documents
const alice = await User.findOne({ email: 'alice@example.com' })

// Update documents
await User.updateOne({ name: 'Alice' }, { $set: { age: 26 } })

// Delete documents
await User.deleteOne({ name: 'Alice' })
```

### With Persistence

```typescript
import { connect } from 'memgoose'

// Connect with SQLite storage
const db = connect({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})

const User = db.model('User', userSchema)

// Data persists to ./data/User.db
await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })

// Disconnect when done
process.on('SIGINT', async () => {
  await db.disconnect()
  process.exit(0)
})
```

## Features Overview

### 🚀 Performance

- **O(1) lookups** with indexing (83-1147x faster!)
- **Compound indexes** for multi-field queries
- **Lean queries** for 17.5x faster reads
- **Batch operations** for bulk inserts/updates
- **Partial index matching** for complex queries
- **TTL indexes** for automatic document expiration

### 🎯 MongoDB-like API

- **Query operators**: $eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $regex, $exists, $size, $elemMatch, $all
- **Logical operators**: $or, $and, $nor, $not
- **Update operators**: $set, $unset, $inc, $dec, $push, $pull, $addToSet, $pop, $rename
- **Aggregation pipeline**: Complete pipeline with 20+ stages
- **Atomic operations**: findOneAndUpdate, findOneAndDelete

### 📊 Schema Features

- **Validation**: required, min/max, minLength/maxLength, enum, regex, custom
- **Defaults**: static values or functions
- **Getters/setters**: Transform values on read/write
- **Indexes**: Single-field, compound, unique, TTL
- **Timestamps**: Auto-managed createdAt/updatedAt
- **Subdocuments**: Nested schemas

### 🏗️ Advanced Features

- **Virtuals**: Computed properties
- **Hooks**: Pre/post middleware for save, update, delete, find
- **Populate**: Document references
- **Discriminators**: Schema inheritance
- **Methods**: Instance and static methods
- **Document save**: Mongoose-style document.save()

### 💾 Storage Backends

- **Memory**: Fastest, no persistence (default)
- **File**: NDJSON + WAL, human-readable
- **SQLite**: ACID, production-ready
- **WiredTiger**: High-performance, powers MongoDB

### 🧪 Developer Experience

- **TypeScript-first**: Full type definitions
- **Zero dependencies**: Core has no runtime dependencies
- **Well-tested**: Comprehensive test suite
- **Mongoose-compatible**: Easy migration

## Performance Benchmarks

**100,000 documents, indexed queries (Apple M4 Max):**

| Operation      | Indexed | Non-Indexed | Speedup   |
| -------------- | ------- | ----------- | --------- |
| Equality query | <0.01ms | 2.01ms      | **431x**  |
| Compound query | <0.01ms | 2.01ms      | **1147x** |
| count()        | 11.60ms | 24.42ms     | **2x**    |
| update()       | 0.02ms  | 2.09ms      | **83x**   |
| Lean query     | 0.70ms  | 12.00ms     | **17.5x** |

See [PERFORMANCE.md](PERFORMANCE.md) for detailed benchmarks.

## Use Cases

### 🧪 Testing

Perfect for mocking MongoDB in unit/integration tests:

```typescript
import { describe, it } from 'node:test'
import { model, Schema } from 'memgoose'

describe('User service', () => {
  const User = model('User', userSchema)

  it('creates a user', async () => {
    const user = await User.create({ name: 'Alice' })
    assert(user.name === 'Alice')
  })
})
```

### 🚀 Prototyping

Build features quickly before implementing real database:

```typescript
// Start with memgoose
const User = model('User', userSchema)

// Later, switch to MongoDB
// const User = mongoose.model('User', userSchema)
```

### 💾 Caching

In-memory cache with familiar API:

```typescript
const cacheDb = createDatabase({ storage: 'memory' })
const Cache = cacheDb.model('Cache', cacheSchema)

async function getCachedUser(id: string) {
  let user = await Cache.findOne({ _id: id })
  if (!user) {
    user = await fetchFromDatabase(id)
    await Cache.create(user)
  }
  return user
}
```

### 🗄️ Lightweight Apps

SQLite or file storage for simple persistent applications:

```typescript
const db = connect({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})

const User = db.model('User', userSchema)
```

### 📊 Analytics

WiredTiger for high write throughput:

```typescript
const db = connect({
  storage: 'wiredtiger',
  wiredtiger: {
    dataPath: './data',
    cacheSize: '2G'
  }
})

const Event = db.model('Event', eventSchema)

// High-performance event logging
await Event.insertMany(events)
```

## Architecture

```
memgoose/
├── Schema          # Schema definition with validation, indexes, hooks
├── Model           # Query engine with CRUD operations
├── Database        # Database management and model registry
├── Connection      # Connection and configuration
├── Aggregation     # Aggregation pipeline engine 🆕
├── Storage         # Pluggable storage strategies
│   ├── Memory      # In-memory (default)
│   ├── File        # NDJSON + WAL
│   ├── SQLite      # SQLite database
│   └── WiredTiger  # WiredTiger engine
└── Query Builders  # Chainable query API
```

## Storage Decision Tree

```
Need persistence?
├─ No  → Memory
└─ Yes → ACID required?
    ├─ No  → File (simple) or Memory (testing)
    └─ Yes → Dataset size?
        ├─ Small (<10k docs)    → SQLite
        ├─ Medium (<100k docs)  → SQLite or WiredTiger
        └─ Large (>100k docs)   → WiredTiger

High write throughput?
└─ Yes → WiredTiger

Simple deployment?
└─ Yes → SQLite or File
```

## Common Patterns

### RESTful API

```typescript
app.get('/users', async (req, res) => {
  const users = await User.find({}, { lean: true, limit: 20 })
  res.json(users)
})

app.post('/users', async (req, res) => {
  const user = await User.create(req.body)
  res.status(201).json(user)
})
```

### Pagination

```typescript
async function paginate(page: number, perPage: number) {
  const [results, total] = await Promise.all([
    User.find({}, { skip: (page - 1) * perPage, limit: perPage }),
    User.countDocuments()
  ])

  return {
    results,
    page,
    totalPages: Math.ceil(total / perPage)
  }
}
```

### Aggregation Analytics

```typescript
// Sales analytics with aggregation pipeline
const salesByCategory = await Sale.aggregate([
  { $match: { date: { $gte: startDate } } },
  { $group: { _id: '$category', total: { $sum: '$amount' } } },
  { $sort: { total: -1 } },
  { $limit: 10 }
])
```

### Caching

```typescript
const cacheDb = createDatabase({ storage: 'memory' })
const mainDb = createDatabase({ storage: 'sqlite', sqlite: { dataPath: './data' } })

const Cache = cacheDb.model('Cache', cacheSchema)
const User = mainDb.model('User', userSchema)

async function getUser(id: string) {
  let user = await Cache.findOne({ _id: id })
  if (!user) {
    user = await User.findById(id)
    if (user) await Cache.create(user)
  }
  return user
}
```

## Migration from Mongoose

memgoose is designed for easy migration from Mongoose:

```typescript
// Mongoose
import mongoose from 'mongoose'
const userSchema = new mongoose.Schema({ name: String })
const User = mongoose.model('User', userSchema)

// memgoose (similar API!)
import { Schema, model } from 'memgoose'
const userSchema = new Schema({ name: String })
const User = model('User', userSchema)
```

**Key differences:**

- Add storage configuration for persistence
- Some advanced features not yet implemented
- Better TypeScript support
- No MongoDB connection needed
- Full aggregation pipeline support

## Examples

Check out the [examples](../examples) folder:

```bash
npm run example              # Basic usage
npm run example:perf         # Performance benchmarks
npm run example:virtuals     # Virtuals and hooks
npm run example:showcase     # Complete features
npm run example:memory       # Memory usage with 100k docs
npm run example:file         # File storage
npm run example:sqlite       # SQLite storage
npm run example:wiredtiger   # WiredTiger storage
npm run example:aggregation  # Aggregation pipeline demo 🆕
```

## Contributing

Contributions welcome! Please see the main [README](../README.md) for development workflow.

## License

MIT

---

**Happy coding with memgoose!** 🎉

For questions or issues, visit the [GitHub repository](https://github.com/dashersw/memgoose).
