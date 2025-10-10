# memgoose

An in-memory mongoose impersonator—a lightweight, high-performance in-memory database with MongoDB-like query operators.

## Quick Start

```typescript
import { Schema, model } from 'memgoose'

// Define schema with indexes, virtuals, and hooks
const userSchema = new Schema({ firstName: String, lastName: String, age: Number })

userSchema.index('firstName')
userSchema.virtual('fullName').get(doc => `${doc.firstName} ${doc.lastName}`)
userSchema.pre('save', ({ doc }) => {
  doc.createdAt = new Date()
})

// Create model
const User = model('User', userSchema)

// Insert and query
await User.create({ firstName: 'Alice', lastName: 'Smith', age: 25 })
const user = await User.findOne({ firstName: 'Alice' }) // O(1) with index!
console.log(user.fullName) // "Alice Smith" (virtual property)

// Update, delete, count
await User.updateOne({ firstName: 'Alice' }, { $inc: { age: 1 } })
await User.deleteMany({ age: { $lt: 18 } })
const count = await User.countDocuments({ age: { $gte: 18 } })
```

## Features

- 🚀 **Fast**: O(1) lookups with indexing support (10-300x faster than linear scan)
- 🎯 **Type-safe**: Written in TypeScript with full type definitions
- 🔍 **Rich Queries**: MongoDB-like query operators ($eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $regex)
- 📊 **Smart Indexing**: Single-field, compound, and partial index matching
- 🏗️ **Mongoose-Compatible**: Schema, Model, and model() factory pattern
- 📦 **Zero Runtime Dependencies**: No external dependencies required
- 🎣 **Hooks**: Pre/post hooks for save, update, delete, and find operations
- 🔮 **Virtuals**: Computed properties with getter functions
- 🧪 **Well Tested**: Comprehensive test suite with excellent code coverage

## Why memgoose?

**Use Cases:**

- 🧪 **Testing**: Mock MongoDB in unit/integration tests without spinning up a database
- 🚀 **Prototyping**: Quickly build features before implementing real database
- 💾 **Caching**: In-memory cache with familiar mongoose-like API
- 📊 **Development**: Fast local development without database setup
- 🎯 **Learning**: Learn MongoDB query patterns without installing MongoDB

## Installation

```bash
npm install memgoose
```

## Usage

```typescript
import { Schema, model } from 'memgoose'

// Define your document interface
interface UserDoc {
  name: string
  age: number
}

// Define schema (mongoose-style)
const userSchema = new Schema<UserDoc>({
  name: String,
  age: Number
})

// Add indexes to schema
userSchema.index('name')

// Create model from schema
const User = model('User', userSchema)

// Seed initial data
User.insertMany([
  { name: 'Alice', age: 25 },
  { name: 'Bob', age: 32 },
  { name: 'Charlie', age: 40 }
])

// Query documents
const user = await User.findOne({ name: 'Bob' })
console.log(user) // { name: 'Bob', age: 32 }

// Find all matching documents
const users = await User.find({ age: { $gt: 30 } })
console.log(users) // [{ name: 'Bob', age: 32 }, { name: 'Charlie', age: 40 }]

// Find all documents
const allUsers = await User.find()
console.log(allUsers.length) // 3

// Insert new documents (mongoose-style)
await User.create({ name: 'Diana', age: 29 })

// Insert multiple documents
await User.insertMany([
  { name: 'Eve', age: 35 },
  { name: 'Frank', age: 40 }
])

// Delete documents
await User.deleteOne({ name: 'Diana' })
await User.deleteMany({ age: { $lt: 30 } })

// Update documents
await User.updateOne({ name: 'Bob' }, { $set: { age: 33 } })
await User.updateMany({}, { $inc: { age: 1 } })

// Save documents after modification (like Mongoose)
const user = await User.findOne({ name: 'Bob' })
user.age = 34
user.city = 'London'
await user.save()

// Count documents
const count = await User.countDocuments({ age: { $gte: 30 } })
```

## Document Save Method

memgoose supports Mongoose-style document saving. After fetching a document, you can modify its properties and save it back to the database:

```typescript
// Fetch a document
const user = await User.findOne({ name: 'Bob' })

// Modify properties
user.age = 33
user.city = 'London'

// Save changes back to database
await user.save()
```

The `save()` method:

- Validates the document before saving
- Executes pre/post save hooks
- Updates timestamps (if enabled)
- Checks unique constraints
- Rebuilds indexes if needed
- Returns the updated document with virtuals

**Note**: Lean queries (`{ lean: true }`) return plain objects without the `save()` method.

## Update Operators

memgoose supports comprehensive MongoDB-like update operators:

- `$set`: Set field values
- `$unset`: Remove fields
- `$inc`: Increment numeric values
- `$dec`: Decrement numeric values
- `$push`: Add element to array
- `$pull`: Remove element from array
- `$addToSet`: Add to array if not already present
- `$pop`: Remove first (-1) or last (1) array element
- `$rename`: Rename a field

### Examples

```typescript
// Set fields
await User.updateOne({ name: 'Bob' }, { $set: { age: 33, city: 'NYC' } })

// Increment/decrement
await User.updateMany({}, { $inc: { age: 1 } })
await User.updateOne({ name: 'Alice' }, { $dec: { score: 5 } })

// Array operations
await User.updateOne({ name: 'Bob' }, { $push: { tags: 'nodejs' } })
await User.updateOne({ name: 'Bob' }, { $pull: { tags: 'old-tag' } })
await User.updateOne({ name: 'Bob' }, { $addToSet: { tags: 'unique' } })
await User.updateOne({ name: 'Bob' }, { $pop: { tags: 1 } }) // Remove last

// Rename field
await User.updateOne({ name: 'Alice' }, { $rename: { city: 'location' } })

// Direct update (without operators)
await User.updateOne({ name: 'Bob' }, { age: 35, city: 'London' })
```

## Query Operators

memgoose supports the following MongoDB-like query operators:

- `$eq`: Equal to
- `$ne`: Not equal to
- `$in`: Value is in array
- `$nin`: Value is not in array
- `$gt`: Greater than
- `$gte`: Greater than or equal to
- `$lt`: Less than
- `$lte`: Less than or equal to
- `$regex`: Regular expression match (supports string or RegExp)

### Examples

```typescript
// Equality
await User.findOne({ name: 'Alice' })
await User.find({ name: { $eq: 'Alice' } })

// Comparison
await User.find({ age: { $gt: 30 } })
await User.find({ age: { $gte: 25, $lt: 40 } })

// Array operators
await User.find({ name: { $in: ['Alice', 'Bob'] } })
await User.find({ age: { $nin: [25, 30] } })

// Regular expressions
await User.find({ name: { $regex: '^A' } })
await User.find({ name: { $regex: /alice/i } })
```

## Indexing

Create indexes on frequently queried fields for O(1) lookup performance:

```typescript
// Single-field indexes
User.createIndex('name')
User.createIndex('age')

// Compound indexes (multiple fields)
User.createIndex(['city', 'age'])

// In schema
userSchema.index('name') // Single field
userSchema.index(['city', 'age']) // Compound index

// Unique indexes are auto-created when unique: true is specified
const userSchema = new Schema({
  email: { type: String, unique: true } // Automatically creates unique index!
})

// Single-field equality queries on indexed fields are O(1)
await User.findOne({ name: 'Bob' }) // O(1) with index

// Multi-field queries with compound index are O(1)
await User.findOne({ city: 'New York', age: 25 }) // O(1) with compound index

// Partial index matching - uses index even if query has extra fields
User.createIndex('name')
await User.findOne({ name: 'Bob', age: 32 }) // Uses 'name' index, filters 1 doc instead of all
```

## Query Chaining

memgoose supports both options-based and chainable query patterns:

```typescript
// Options pattern
const users = await User.find(
  { age: { $gte: 25 } },
  {
    sort: { age: -1 },
    limit: 10,
    skip: 5
  }
)

// Chainable pattern (mongoose-style)
const users2 = await User.find({ age: { $gte: 25 } })
  .sort({ age: -1 })
  .limit(10)
  .skip(5)
  .exec()

// Sort by multiple fields
await User.find({}, { sort: { age: 1, name: 1 } })

// Pagination
await User.find().skip(20).limit(10) // Page 3, 10 per page
```

## Virtuals

Define computed properties that don't get stored in the database:

```typescript
const userSchema = new Schema({
  firstName: String,
  lastName: String,
  age: Number
})

// Add virtual properties
userSchema.virtual('fullName').get(doc => {
  return `${doc.firstName} ${doc.lastName}`
})

userSchema.virtual('isAdult').get(doc => {
  return doc.age >= 18
})

const User = model('User', userSchema)
await User.create({ firstName: 'John', lastName: 'Doe', age: 30 })

const user = await User.findOne({ firstName: 'John' })
console.log(user.fullName) // "John Doe" (computed, not stored)
console.log(user.isAdult) // true
```

## Hooks

Execute custom logic before or after operations:

```typescript
const userSchema = new Schema({ name: String, age: Number })

// Pre-save: Add timestamp
userSchema.pre('save', ({ doc }) => {
  doc.createdAt = new Date()
})

// Post-save: Log
userSchema.post('save', ({ doc }) => {
  console.log(`Saved: ${doc.name}`)
})

// Pre-delete: Validate
userSchema.pre('delete', async ({ query }) => {
  // Async validation logic
  await validateDeletion(query)
})

// Post-update: Notify
userSchema.post('update', ({ modifiedCount }) => {
  console.log(`Updated ${modifiedCount} documents`)
})

// Supported events: 'save', 'delete', 'update', 'find', 'findOne'
```

## API

### Schema

#### `new Schema<T>(definition: Record<string, any>)`

Creates a new schema definition. The definition object describes the shape of your documents (mongoose-compatible).

```typescript
const userSchema = new Schema<UserDoc>({
  name: String,
  age: Number,
  email: String
})
```

#### `schema.index(fields: keyof T | Array<keyof T>): Schema<T>`

Adds a single-field or compound index to the schema. Returns the schema for chaining.

```typescript
// Single-field indexes
userSchema.index('name').index('email')

// Compound index (multiple fields)
userSchema.index(['city', 'age'])
```

#### `schema.virtual(name: string): VirtualType`

Defines a virtual (computed) property that is not stored in the database.

```typescript
userSchema.virtual('fullName').get(doc => {
  return `${doc.firstName} ${doc.lastName}`
})
```

#### `schema.pre(event: string, fn: HookFunction): Schema<T>`

Registers a pre-hook that executes before an operation. Returns the schema for chaining.

```typescript
userSchema.pre('save', ({ doc }) => {
  doc.createdAt = new Date()
})
```

#### `schema.post(event: string, fn: HookFunction): Schema<T>`

Registers a post-hook that executes after an operation. Returns the schema for chaining.

```typescript
userSchema.post('delete', ({ deletedCount }) => {
  console.log(`Deleted ${deletedCount} docs`)
})
```

**Supported Events**: `'save'`, `'delete'`, `'update'`, `'find'`, `'findOne'`

**Hook Context**: Each hook receives a context object with relevant information (doc, query, result, counts, etc.)

### Model Factory

#### `model<T>(name: string, schema: Schema<T>): Model<T>`

Creates a model from a schema (mongoose-compatible pattern).

```typescript
const User = model('User', userSchema)
```

### Model Instance

#### `new Model<T>(schema?: Schema<T>)`

Creates a new model instance directly. When using the recommended pattern, use the `model()` factory function instead.

#### `createIndex(fields: keyof T | Array<keyof T>): void`

Manually creates a single-field or compound index. When using Schema, indexes are auto-created from schema definitions.

```typescript
// Single-field index
User.createIndex('name')

// Compound index
User.createIndex(['city', 'age'])
```

**Partial Index Matching**: If a query includes indexed fields plus additional fields, the index will still be used to narrow down candidates before filtering. For example, if you have an index on `'name'` and query `{ name: 'Bob', age: 32 }`, it will use the index to get all documents with `name='Bob'`, then filter those for `age=32` (much faster than scanning all documents).

Example with 100,000 documents:

- Index on `'status'`, query `{ status: 'active', age: { $gte: 30 } }`
- Gets ~33k documents via index (instant)
- Filters those 33k for age condition (~29ms)
- vs. Full scan: ~40ms on all 100k documents (40% faster with partial index)

### Query Methods

#### `async findOne(query: Query<T>): Promise<T | null>`

Finds the first document matching the query. Returns `null` if no match is found.

#### `async find(query?: Query<T>): Promise<T[]>`

Finds all documents matching the query. Returns an empty array if no matches found. If no query is provided, returns all documents.

### Mutation Methods

#### `async create(doc: T): Promise<T>`

Creates and inserts a new document into the model (mongoose-compatible). Returns the created document. Updates indexes automatically. Executes pre/post save hooks.

#### `async insertMany(docs: T[]): Promise<T[]>`

Inserts multiple documents into the model at once. Returns the inserted documents. Updates indexes automatically. Executes save hooks for each document.

#### `async deleteOne(query: Query<T>): Promise<{ deletedCount: number }>`

Deletes the first document matching the query. Returns the count of deleted documents. Executes pre/post delete hooks.

#### `async deleteMany(query: Query<T>): Promise<{ deletedCount: number }>`

Deletes all documents matching the query. Returns the count of deleted documents. Executes pre/post delete hooks.

#### `async updateOne(query: Query<T>, update: Update<T>): Promise<{ modifiedCount: number }>`

Updates the first document matching the query. Supports update operators ($set, $unset, $inc, $dec, $push, $pull, $addToSet, $pop, $rename). Returns the count of modified documents. Executes pre/post update hooks.

#### `async updateMany(query: Query<T>, update: Update<T>): Promise<{ modifiedCount: number }>`

Updates all documents matching the query. Supports all update operators. Returns the count of modified documents. Executes pre/post update hooks.

### Atomic Operations

#### `async findOneAndUpdate(query, update, options?): Promise<T | null>`

Atomically finds and updates a document. Options: `{ returnDocument: 'before' | 'after' }` (default: 'after').

#### `async findOneAndDelete(query): Promise<T | null>`

Atomically finds and deletes a document. Returns the deleted document.

### Utility Methods

#### `async countDocuments(query?): Promise<number>`

Returns the count of documents matching the query. Uses indexes when possible.

#### `async distinct<K>(field: K, query?): Promise<Array<T[K]>>`

Returns an array of unique values for the specified field, optionally filtered by query.

#### `async findById(id): Promise<T | null>`

Shorthand for `findOne({ _id: id })`. Useful when documents have an `_id` field.

## Development

### Building

Build the project for distribution:

```bash
npm run build
```

Clean build artifacts:

```bash
npm run clean
```

### Testing

memgoose uses Node.js's built-in test runner with TypeScript support via `tsx`. Tests are written in TypeScript and run directly on the source files without needing compilation.

Run all tests:

```bash
npm test
```

Watch mode (automatically re-run tests on file changes):

```bash
npm run test:watch
```

Run tests with coverage:

```bash
npm run test:coverage
```

Run a specific test file:

```bash
npm run test:file tests/indexing.test.ts
```

## Examples

Check out the [examples](./examples) folder for more usage examples.

**Run the basic example:**

```bash
npm run example
```

**Run the performance benchmark** (100,000 documents):

```bash
npm run example:perf
```

**Run the virtuals & hooks example**:

```bash
npm run example:virtuals
```

**Run the complete features demo**:

```bash
npm run example:showcase
```

### Performance Benchmark Results

The performance example demonstrates the dramatic speedup from indexing on 100,000 documents (20 comprehensive tests):

| Operation Type           | Indexed  | Non-Indexed | Speedup         |
| ------------------------ | -------- | ----------- | --------------- |
| Equality query           | ~0.2ms   | ~11.8ms     | **59x faster**  |
| Compound index query     | ~0.03ms  | ~11.8ms     | **393x faster** |
| find() many results      | ~10.8ms  | ~36.5ms     | **3.4x faster** |
| count() operation        | ~8.2ms   | ~33ms       | **4x faster**   |
| update() operation       | ~0.31ms  | ~20.2ms     | **65x faster**  |
| delete() operation       | ~0.14ms  | -           | **Ultra-fast**  |
| Lean query (no virtuals) | ~0.035ms | -           | **309x faster** |
| Pagination (skip/limit)  | ~0.19ms  | -           | Efficient       |
| Partial index + filter   | ~28.6ms  | ~33ms       | **1.2x faster** |

**Key Performance Insights:**

- **Indexed equality queries**: Sub-millisecond (~0.2ms)
- **Compound indexes**: Ultra-fast at 0.03ms (7x faster than single-field!)
- **Updates with indexes**: Blazing fast at 0.31ms (65x faster than non-indexed!)
- **Deletes with indexes**: Lightning fast at 0.14ms
- **Lean queries**: Up to 309x faster by skipping virtual computation
- **Overall**: Indexes provide **10-393x speedup** for equality queries

See [examples/README.md](./examples/README.md) for detailed benchmark results with all 20 tests.

## Project Structure

```
memgoose/
├── index.ts           # Main entry point
├── src/               # Source code
│   ├── model.ts       # Model with full query engine
│   ├── schema.ts      # Schema with virtuals & hooks
│   ├── registry.ts    # Model registry
│   └── objectid.ts    # ObjectId implementation
├── examples/          # Usage examples
│   ├── schema-indexes-queries.ts  # Basic usage
│   ├── performance.ts             # Performance benchmark (100k docs)
│   ├── virtuals-and-hooks.ts      # Virtuals & hooks demo
│   ├── complete-features-demo.ts  # Complete features showcase
│   └── README.md
├── tests/             # Comprehensive test suite
│   ├── *.test.ts      # Test files
│   └── fixtures.ts    # Test data
└── dist/              # Compiled output
```

### Implemented Features

**Query Operations:**

- `find()`, `findOne()`, `findById()`
- Query chaining with sort, limit, skip
- Both options and builder patterns
- Partial index matching

**Mutation Operations:**

- `create()`, `insertMany()`
- `deleteOne()`, `deleteMany()`
- `updateOne()`, `updateMany()`
- `findOneAndUpdate()`, `findOneAndDelete()`

**Operators:**

- Query: $eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $regex
- Update: $set, $unset, $inc, $dec, $push, $pull, $addToSet, $pop, $rename

**Advanced Features:**

- Single-field & compound indexes
- Virtual properties (computed fields)
- Pre/post hooks for all operations
- Async hook support
- `countDocuments()`, `distinct()`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Workflow

1. Clone the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Run tests in watch mode: `npm run test:watch`
5. Check coverage: `npm run test:coverage`
6. Build: `npm run build`

## License

MIT
