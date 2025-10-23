# memgoose

A **lightweight, type-safe, in-memory database** with MongoDB-like API and pluggable persistence. Built for testing, caching, and rapid development with familiar Mongoose-style schemas.

[![npm version](https://badge.fury.io/js/memgoose.svg)](https://badge.fury.io/js/memgoose)
[![npm downloads](https://img.shields.io/npm/dm/memgoose.svg)](https://www.npmjs.com/package/memgoose)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-800%2B%20passing-brightgreen.svg)]()

## At a Glance

```typescript
// Define schema with validation, indexes, and hooks
const userSchema = new Schema({
  email: { type: String, unique: true },
  age: { type: Number, min: 0 }
}, { timestamps: true })

userSchema.index('email') // O(1) lookups

// Choose your storage
connect({ storage: 'memory' })           // Testing: 0 setup, fastest
connect({ storage: 'sqlite', ... })      // Production: ACID, persistent
connect({ storage: 'wiredtiger', ... })  // Enterprise: MongoDB-grade performance
```

| **Metric**        | **Value**                         |
| ----------------- | --------------------------------- |
| Query Speed       | **431-1147x** faster with indexes |
| Storage Options   | Memory, SQLite, WiredTiger, File  |
| Test Coverage     | 800+ passing tests                |
| Dependencies      | Zero (core library)               |
| TypeScript        | Full support with IntelliSense    |
| API Compatibility | Mongoose-like (easy migration)    |

## Quick Start

```typescript
import { Schema, model } from 'memgoose'

// Define schema with indexes, virtuals, and hooks
const userSchema = new Schema({ firstName: String, lastName: String, email: String, age: Number })

userSchema.index('email')
userSchema.virtual('fullName').get(doc => `${doc.firstName} ${doc.lastName}`)
userSchema.pre('save', ({ doc }) => {
  doc.email = doc.email.toLowerCase() // Normalize email
})

// Create model
const User = model('User', userSchema)

// Insert and query
await User.create({ firstName: 'Alice', lastName: 'Smith', email: 'ALICE@EXAMPLE.COM', age: 25 })
const user = await User.findOne({ email: 'alice@example.com' }) // O(1) with index!
console.log(user.fullName) // "Alice Smith" (virtual property)

// Update, delete, count
await User.updateOne({ firstName: 'Alice' }, { $inc: { age: 1 } })
await User.deleteMany({ age: { $lt: 18 } })
const count = await User.countDocuments({ age: { $gte: 18 } })
```

## Why memgoose?

- 🚀 **Blazing Fast**: O(1) lookups with indexing (83-1147x faster than linear scans)
- 🎯 **Type-Safe**: Full TypeScript support with IntelliSense
- 🏗️ **Mongoose-Compatible**: Drop-in replacement for mongoose in many cases
- 💾 **Pluggable Storage**: Memory, SQLite, WiredTiger, or file-based (NDJSON + WAL) persistence
- 📦 **Zero Dependencies**: No runtime dependencies (optional peer dependencies for storage backends)
- 🧪 **Well Tested**: 800+ passing tests with comprehensive coverage

## Use Cases

- 🧪 **Testing**: Mock MongoDB in unit/integration tests without spinning up a database
- 🚀 **Prototyping**: Quickly build features before implementing real database
- 💾 **Caching**: In-memory cache with familiar mongoose-like API
- 📊 **Development**: Fast local development without database setup
- 🎯 **Learning**: Learn MongoDB query patterns without installing MongoDB
- 🗄️ **Persistence**: Use SQLite or WiredTiger for lightweight persistent applications

## Features

- 🔍 **Rich Queries**: MongoDB-like operators (`$eq`, `$ne`, `$in`, `$nin`, `$gt`, `$gte`, `$lt`, `$lte`, `$regex`, `$exists`, `$size`, `$elemMatch`, `$all`)
- 🧮 **Logical Operators**: `$or`, `$and`, `$nor`, `$not` for complex query logic
- ✏️ **Update Operators**: `$set`, `$unset`, `$inc`, `$dec`, `$push`, `$pull`, `$addToSet`, `$pop`, `$rename`
- 📈 **Smart Indexing**: Single-field, compound, unique, and TTL indexes with partial matching
- 📊 **Aggregation Pipeline**: Full pipeline with `$match`, `$group`, `$project`, `$lookup`, `$unwind`, and more
- 🔗 **Advanced Populate**: Nested populate with select, match filtering, and field projection
- ⏱️ **TTL Indexes**: Automatic document expiration for sessions, caches, and temporary data
- 🎣 **Hooks**: Pre/post hooks for save, update, delete, and find operations
- 🔮 **Virtuals**: Computed properties with getter functions
- ⚡ **Atomic Operations**: `findOneAndUpdate()`, `findOneAndDelete()`
- 🚄 **Lean Queries**: 17.5x faster by skipping virtual computation

## Installation

```bash
npm install memgoose
```

For persistent storage (optional):

```bash
# SQLite storage
npm install better-sqlite3

# WiredTiger storage (requires build tools)
npm install memgoose-wiredtiger
```

## Examples

```bash
# Basic usage
npm run example

# Performance benchmark
npm run example:perf

# Memory usage demo
npm run example:memory

# Complete features showcase
npm run example:showcase
```

See the [`examples/`](./examples/) folder for complete, runnable code samples demonstrating all features.

## Documentation

📚 **[Complete Documentation](./docs/README.md)**

- **[Getting Started](./docs/GETTING_STARTED.md)** - Installation and basic usage
- **[API Reference](./docs/API.md)** - Complete API documentation
- **[Schemas](./docs/SCHEMAS.md)** - Schema definition and validation
- **[Queries](./docs/QUERIES.md)** - Query operators and patterns
- **[Aggregation](./docs/AGGREGATION.md)** - Aggregation pipeline guide
- **[Storage](./docs/STORAGE.md)** - Storage backends comparison
- **[Performance](./docs/PERFORMANCE.md)** - Optimization and benchmarks
- **[Advanced Features](./docs/ADVANCED.md)** - Hooks, virtuals, populate

## Storage Options

```typescript
import { connect } from 'memgoose'

// Memory (default, fastest)
connect({ storage: 'memory' })

// SQLite (persistent, ACID)
connect({ storage: 'sqlite', sqlite: { dataPath: './data' } })

// WiredTiger (enterprise-grade)
connect({ storage: 'wiredtiger', wiredtiger: { dataPath: './data' } })

// File (NDJSON + WAL)
connect({ storage: 'file', file: { dataPath: './data' } })
```

## Performance

memgoose delivers **exceptional performance** through intelligent indexing and optimized query execution.

### Benchmark Results

**Dataset:** 100,000 documents  
**Hardware:** Apple M4 Max (16 cores, 128GB RAM)  
**Node.js:** v24.8.0

| Operation                     | Without Index | With Index | Speedup      |
| ----------------------------- | ------------- | ---------- | ------------ |
| Equality query (`findOne`)    | 2.01ms        | <0.01ms    | **431x** ⚡  |
| Compound query (`city + age`) | 2.01ms        | <0.01ms    | **1147x** 🚀 |
| Count documents               | 24.42ms       | 11.60ms    | **2x**       |
| Update one document           | 2.09ms        | 0.02ms     | **83x**      |
| Lean queries (no virtuals)    | 12.00ms       | 0.70ms     | **17.5x**    |

### Key Takeaways

- **Index your queries**: Add `.index('fieldName')` to your schema for O(1) lookups
- **Use lean queries**: Skip virtual computation for read-heavy operations (17.5x faster)
- **Choose the right storage**: Memory for testing, SQLite/WiredTiger for production

See [Performance Guide](./docs/PERFORMANCE.md) for optimization strategies and detailed benchmarks.

## Migration from Mongoose

memgoose is designed to be Mongoose-compatible:

```typescript
// Mongoose
import mongoose from 'mongoose'
const User = mongoose.model('User', userSchema)

// memgoose (mostly the same!)
import { model } from 'memgoose'
const User = model('User', userSchema)
```

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## License

MIT

---

**Need help?** Check out the [examples](./examples/) or [open an issue](https://github.com/dashersw/memgoose/issues).
