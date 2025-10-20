# API Reference

Complete API reference for memgoose.

## Table of Contents

- [Schema](#schema)
- [Model](#model)
- [Database & Connection](#database--connection)
- [Query Builders](#query-builders)
- [ObjectId](#objectid)
- [Storage Strategies](#storage-strategies)

---

## Schema

### `new Schema<T>(definition, options?)`

Creates a new schema definition that describes the structure and validation rules for documents.

**Parameters:**

- `definition`: `Record<string, any>` - Schema field definitions
- `options?`: `SchemaOptions` - Optional schema configuration

**Returns:** `Schema<T>`

**Example:**

```typescript
interface User {
  name: string
  email: string
  age: number
}

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    age: { type: Number, min: 0, max: 120 }
  },
  { timestamps: true }
)
```

### Schema Methods

#### `schema.index(fields, options?)`

Adds an index to the schema. Indexes are automatically created when the model is initialized.

**Parameters:**

- `fields`: `keyof T | Array<keyof T> | Record<string, 1 | -1>` - Field(s) to index
- `options?`: `{ unique?: boolean }` - Index options

**Returns:** `this` (chainable)

**Examples:**

```typescript
// Single-field index
userSchema.index('email')

// Compound index (multiple fields)
userSchema.index(['city', 'age'])

// Mongoose-style object format
userSchema.index({ author: 1, year: -1 })

// Unique index
userSchema.index('username', { unique: true })
```

#### `schema.virtual(name)`

Defines a computed property that doesn't get stored in the database.

**Parameters:**

- `name`: `string` - Virtual property name

**Returns:** `VirtualType` - Virtual type builder

**Example:**

```typescript
userSchema.virtual('fullName').get(doc => {
  return `${doc.firstName} ${doc.lastName}`
})

userSchema.virtual('isAdult').get(function () {
  // 'this' syntax also supported
  return this.age >= 18
})
```

#### `schema.pre(event, hookFn)`

Registers a hook function to execute **before** an operation.

**Parameters:**

- `event`: `'save' | 'delete' | 'update' | 'find' | 'findOne'`
- `hookFn`: `(context) => void | Promise<void>` - Hook function

**Returns:** `this` (chainable)

**Examples:**

```typescript
// Pre-save hook
userSchema.pre('save', ({ doc }) => {
  doc.createdAt = new Date()
})

// Async pre-hook
userSchema.pre('delete', async ({ query }) => {
  await notifyAdmins(query)
})

// Pre-update hook
userSchema.pre('update', ({ query, update }) => {
  console.log('Updating documents matching:', query)
})
```

#### `schema.post(event, hookFn)`

Registers a hook function to execute **after** an operation.

**Parameters:**

- `event`: `'save' | 'delete' | 'update' | 'find' | 'findOne'`
- `hookFn`: `(context) => void | Promise<void>` - Hook function

**Returns:** `this` (chainable)

**Examples:**

```typescript
// Post-save hook
userSchema.post('save', ({ doc }) => {
  console.log(`Saved document with ID: ${doc._id}`)
})

// Post-delete hook
userSchema.post('delete', ({ deletedCount, docs }) => {
  console.log(`Deleted ${deletedCount} documents`)
})

// Post-update hook
userSchema.post('update', ({ modifiedCount }) => {
  console.log(`Modified ${modifiedCount} documents`)
})

// Post-find hook
userSchema.post('find', ({ results }) => {
  console.log(`Found ${results.length} documents`)
})
```

#### `schema.validate(doc)`

Validates a document against the schema's validation rules.

**Parameters:**

- `doc`: `Partial<T>` - Document to validate

**Returns:** `Promise<void>` - Throws `ValidationError` if validation fails

**Example:**

```typescript
try {
  await userSchema.validate({ name: 'Alice', email: 'invalid', age: -5 })
} catch (err) {
  console.error(err.message) // "email does not match pattern; age must be at least 0"
}
```

### Schema Properties

#### `schema.methods`

Define instance methods available on documents.

**Example:**

```typescript
userSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`
}

const user = await User.findOne({ email: 'alice@example.com' })
console.log(user.getFullName())
```

#### `schema.statics`

Define static methods available on the model.

**Example:**

```typescript
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email })
}

const user = await User.findByEmail('alice@example.com')
```

---

## Model

### `new Model<T>(schema?, initialData?, storage?, database?)`

Creates a new model instance. **Recommended:** Use the `model()` factory function instead.

**Parameters:**

- `schema?`: `Schema<T>` - Schema definition
- `initialData?`: `T[]` - Initial documents to insert
- `storage?`: `StorageStrategy<T>` - Storage implementation
- `database?`: `Database` - Parent database instance

### Model Factory

#### `model<T>(name, schema)`

Creates a model from a schema (recommended pattern).

**Parameters:**

- `name`: `string` - Model name
- `schema`: `Schema<T>` - Schema definition

**Returns:** `Model<T>`

**Example:**

```typescript
import { model, Schema } from 'memgoose'

const userSchema = new Schema({ name: String, age: Number })
const User = model('User', userSchema)
```

### Query Methods

#### `async find(query?, options?)`

Finds all documents matching the query.

**Parameters:**

- `query?`: `Query<T>` - Query filter (omit to return all documents)
- `options?`: `QueryOptions` - Query options (sort, limit, skip, lean, select, populate)

**Returns:** `Promise<T[]>` or `FindQueryBuilder<T>` (if no options provided)

**Examples:**

```typescript
// Find all
const allUsers = await User.find()

// Find with query
const adults = await User.find({ age: { $gte: 18 } })

// With options
const users = await User.find(
  { status: 'active' },
  {
    sort: { age: -1 },
    limit: 10,
    skip: 20,
    lean: true,
    select: ['name', 'email']
  }
)

// Query chaining
const users2 = await User.find({ status: 'active' })
  .sort({ age: -1 })
  .limit(10)
  .skip(20)
  .lean()
  .select('name email')
  .exec()
```

#### `async findOne(query?, options?)`

Finds the first document matching the query.

**Parameters:**

- `query?`: `Query<T>` - Query filter
- `options?`: `QueryOptions` - Query options

**Returns:** `Promise<T | null>` or `DocumentQueryBuilder<T>` (if no options)

**Examples:**

```typescript
// Find first user named Alice
const user = await User.findOne({ name: 'Alice' })

// With options
const user2 = await User.findOne(
  { status: 'active' },
  {
    sort: { createdAt: -1 },
    populate: 'author'
  }
)

// Query chaining
const user3 = await User.findOne({ name: 'Bob' }).populate('posts').exec()
```

#### `async findById(id)`

Finds a document by its `_id` field.

**Parameters:**

- `id`: `any` - Document ID

**Returns:** `Promise<T | null>`

**Example:**

```typescript
const user = await User.findById('507f1f77bcf86cd799439011')
```

#### `async countDocuments(query?)`

Counts documents matching the query.

**Parameters:**

- `query?`: `Query<T>` - Query filter (omit to count all)

**Returns:** `Promise<number>`

**Examples:**

```typescript
// Count all documents
const total = await User.countDocuments()

// Count matching documents
const adultCount = await User.countDocuments({ age: { $gte: 18 } })
```

#### `async distinct(field, query?)`

Returns unique values for a field.

**Parameters:**

- `field`: `keyof T` - Field name
- `query?`: `Query<T>` - Optional filter

**Returns:** `Promise<Array<T[field]>>`

**Examples:**

```typescript
// Get all unique ages
const ages = await User.distinct('age')

// Get unique cities for active users
const cities = await User.distinct('city', { status: 'active' })
```

### Mutation Methods

#### `async create(doc)`

Creates and inserts a new document.

**Parameters:**

- `doc`: `T` - Document to create

**Returns:** `Promise<T>` - Created document with virtuals

**Example:**

```typescript
const user = await User.create({
  name: 'Alice',
  email: 'alice@example.com',
  age: 25
})
console.log(user._id) // Generated ID
```

#### `async insertMany(docs)`

Inserts multiple documents at once.

**Parameters:**

- `docs`: `T[]` - Documents to insert

**Returns:** `Promise<T[]>` - Inserted documents

**Example:**

```typescript
const users = await User.insertMany([
  { name: 'Alice', age: 25 },
  { name: 'Bob', age: 30 },
  { name: 'Charlie', age: 35 }
])
```

#### `async updateOne(query, update)`

Updates the first document matching the query.

**Parameters:**

- `query`: `Query<T>` - Query filter
- `update`: `Update<T>` - Update operations

**Returns:** `Promise<{ modifiedCount: number }>`

**Examples:**

```typescript
// Using update operators
await User.updateOne({ name: 'Alice' }, { $set: { age: 26 }, $push: { tags: 'verified' } })

// Direct update (replaces matching fields)
await User.updateOne({ name: 'Bob' }, { age: 31, city: 'NYC' })
```

#### `async updateMany(query, update)`

Updates all documents matching the query.

**Parameters:**

- `query`: `Query<T>` - Query filter
- `update`: `Update<T>` - Update operations

**Returns:** `Promise<{ modifiedCount: number }>`

**Example:**

```typescript
// Increment all users' age by 1
const result = await User.updateMany({}, { $inc: { age: 1 } })
console.log(`Updated ${result.modifiedCount} documents`)
```

#### `async deleteOne(query)`

Deletes the first document matching the query.

**Parameters:**

- `query`: `Query<T>` - Query filter

**Returns:** `Promise<{ deletedCount: number }>`

**Example:**

```typescript
await User.deleteOne({ name: 'Alice' })
```

#### `async deleteMany(query)`

Deletes all documents matching the query.

**Parameters:**

- `query`: `Query<T>` - Query filter

**Returns:** `Promise<{ deletedCount: number }>`

**Example:**

```typescript
// Delete all inactive users
const result = await User.deleteMany({ status: 'inactive' })
console.log(`Deleted ${result.deletedCount} users`)
```

### Atomic Operations

#### `async findOneAndUpdate(query, update, options?)`

Atomically finds and updates a document.

**Parameters:**

- `query`: `Query<T>` - Query filter
- `update`: `Update<T>` - Update operations
- `options?`: `{ returnDocument?: 'before' | 'after' }` - Return value options

**Returns:** `Promise<T | null>` - Updated document (or original if returnDocument='before')

**Examples:**

```typescript
// Get updated document (default)
const user = await User.findOneAndUpdate({ name: 'Alice' }, { $inc: { loginCount: 1 } })

// Get original document before update
const original = await User.findOneAndUpdate(
  { name: 'Bob' },
  { $set: { lastLogin: new Date() } },
  { returnDocument: 'before' }
)
```

#### `async findOneAndDelete(query)`

Atomically finds and deletes a document.

**Parameters:**

- `query`: `Query<T>` - Query filter

**Returns:** `Promise<T | null>` - Deleted document

**Example:**

```typescript
const deletedUser = await User.findOneAndDelete({ name: 'Alice' })
console.log('Deleted:', deletedUser)
```

### Document Methods

#### `async document.save()`

Saves changes made to a document back to the database.

**Returns:** `Promise<T>` - Updated document with virtuals

**Example:**

```typescript
const user = await User.findOne({ name: 'Alice' })
user.age = 26
user.city = 'NYC'
await user.save() // Persists changes
```

**Note:** Not available on lean documents.

### Index Management

#### `Model.createIndex(fields)`

Manually creates an index. Normally indexes are auto-created from schema definitions.

**Parameters:**

- `fields`: `keyof T | Array<keyof T>` - Field(s) to index

**Returns:** `void`

**Examples:**

```typescript
// Single-field index
User.createIndex('email')

// Compound index
User.createIndex(['city', 'age'])
```

---

## Database & Connection

### `connect(config?)`

Creates and connects to the default database.

**Parameters:**

- `config?`: `DatabaseConfig` - Database configuration

**Returns:** `Database`

**Example:**

```typescript
import { connect } from 'memgoose'

const db = connect({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})
```

### `createDatabase(config?)`

Creates a new database instance (for multiple databases).

**Parameters:**

- `config?`: `DatabaseConfig` - Database configuration

**Returns:** `Database`

**Example:**

```typescript
import { createDatabase } from 'memgoose'

const cacheDb = createDatabase({ storage: 'memory' })
const persistDb = createDatabase({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})

const Cache = cacheDb.model('Cache', cacheSchema)
const User = persistDb.model('User', userSchema)
```

### `model(name, schema)`

Creates a model in the default database.

**Parameters:**

- `name`: `string` - Model name
- `schema`: `Schema<T>` - Schema definition

**Returns:** `Model<T>`

**Example:**

```typescript
import { model, Schema } from 'memgoose'

const User = model('User', new Schema({ name: String }))
```

### `getModel(name)`

Gets a model from the default database registry.

**Parameters:**

- `name`: `string` - Model name

**Returns:** `Model<any> | undefined`

**Example:**

```typescript
const User = getModel('User')
```

### `async disconnect()`

Disconnects the default database and flushes pending writes.

**Returns:** `Promise<void>`

**Example:**

```typescript
await disconnect()
```

### `clearRegistry()`

Clears the default database's model registry.

**Returns:** `void`

### Database Class

#### `database.model(name, schema)`

Creates a model in this database.

**Parameters:**

- `name`: `string` - Model name
- `schema`: `Schema<T>` - Schema definition

**Returns:** `Model<T>`

#### `database.getModel(name)`

Gets a model from this database's registry.

**Parameters:**

- `name`: `string` - Model name

**Returns:** `Model<any> | undefined`

#### `async database.disconnect()`

Disconnects this database and flushes pending writes.

**Returns:** `Promise<void>`

#### `async database.clearModels()`

Clears all models and their data in this database.

**Returns:** `Promise<void>`

---

## Query Builders

### FindQueryBuilder

Chainable query builder for `find()` operations.

**Methods:**

- `sort(fields)` - Sort results
- `limit(n)` - Limit number of results
- `skip(n)` - Skip first n results
- `lean()` - Return plain objects without virtuals
- `select(fields)` - Select specific fields
- `populate(path)` - Populate references
- `exec()` - Execute query and return results

**Example:**

```typescript
const users = await User.find({ status: 'active' })
  .sort({ age: -1, name: 1 })
  .limit(10)
  .skip(20)
  .lean()
  .select('name email')
  .exec()
```

### DocumentQueryBuilder

Chainable query builder for `findOne()` operations.

**Methods:**

- `sort(fields)` - Sort results
- `lean()` - Return plain object without virtuals
- `select(fields)` - Select specific fields
- `populate(path)` - Populate references
- `exec()` - Execute query and return result

**Example:**

```typescript
const user = await User.findOne({ email: 'alice@example.com' })
  .populate('posts')
  .select('name email')
  .exec()
```

---

## ObjectId

MongoDB-like ObjectId implementation.

### `new ObjectId(id?)`

Creates a new ObjectId.

**Parameters:**

- `id?`: `string | number` - Optional ID value

**Returns:** `ObjectId`

**Examples:**

```typescript
import { ObjectId } from 'memgoose'

// Generate new ObjectId
const id = new ObjectId()
console.log(id.toString()) // "507f1f77bcf86cd799439011"

// From string
const id2 = new ObjectId('507f1f77bcf86cd799439011')

// From number
const id3 = new ObjectId(12345)
```

### ObjectId Methods

#### `toString()`

Converts ObjectId to string.

**Returns:** `string`

#### `equals(other)`

Checks if two ObjectIds are equal.

**Parameters:**

- `other`: `ObjectId | string` - ObjectId to compare

**Returns:** `boolean`

**Example:**

```typescript
const id1 = new ObjectId('507f1f77bcf86cd799439011')
const id2 = new ObjectId('507f1f77bcf86cd799439011')
console.log(id1.equals(id2)) // true
```

---

## Storage Strategies

### StorageStrategy Interface

All storage backends implement this interface:

```typescript
interface StorageStrategy<T> {
  initialize(): Promise<void>
  getAll(): Promise<T[]>
  insert(doc: T): Promise<void>
  insertMany(docs: T[]): Promise<void>
  update(id: any, doc: T): Promise<void>
  delete(id: any): Promise<void>
  deleteMany(ids: any[]): Promise<void>
  clear(): Promise<void>
  flush?(): Promise<void>
  close?(): void
}
```

### MemoryStorageStrategy

In-memory storage (default).

**Features:**

- Fastest performance
- Data lost when process exits
- No configuration needed

**Example:**

```typescript
import { MemoryStorageStrategy } from 'memgoose'

const storage = new MemoryStorageStrategy<User>()
```

### FileStorageStrategy

File-based storage with NDJSON + WAL.

**Constructor Options:**

- `dataPath`: `string` - Directory for data files
- `modelName`: `string` - Model name
- `persistMode?`: `'immediate' | 'debounced'` - Write mode (default: 'debounced')
- `debounceMs?`: `number` - Debounce delay in ms (default: 100)

**Example:**

```typescript
import { FileStorageStrategy } from 'memgoose'

const storage = new FileStorageStrategy<User>({
  dataPath: './data',
  modelName: 'User',
  persistMode: 'immediate'
})
```

### SqliteStorageStrategy

SQLite-based persistent storage.

**Constructor Options:**

- `dataPath`: `string` - Directory for SQLite database files
- `modelName`: `string` - Model name

**Requires:** `better-sqlite3` peer dependency

**Example:**

```typescript
import { SqliteStorageStrategy } from 'memgoose'

const storage = new SqliteStorageStrategy<User>({
  dataPath: './data',
  modelName: 'User'
})
```

### WiredTigerStorageStrategy

WiredTiger embedded database storage.

**Constructor Options:**

- `dataPath`: `string` - Directory for WiredTiger data
- `modelName`: `string` - Model name
- `cacheSize?`: `string` - Cache size (e.g., "500M", default: "500M")
- `compressor?`: `'snappy' | 'lz4' | 'zstd' | 'zlib' | 'none'` - Compression algorithm

**Requires:** Native bindings (built during installation)

**Example:**

```typescript
import { WiredTigerStorageStrategy } from 'memgoose'

const storage = new WiredTigerStorageStrategy<User>({
  dataPath: './data',
  modelName: 'User',
  cacheSize: '1G',
  compressor: 'zstd'
})
```

---

## Type Definitions

### Query<T>

Query filter object with MongoDB-like operators.

```typescript
type Query<T> = {
  [K in keyof T]?: T[K] | QueryOperator<T[K]>
}

type QueryOperator<T> = {
  $eq?: T
  $ne?: T
  $in?: T[]
  $nin?: T[]
  $gt?: T
  $gte?: T
  $lt?: T
  $lte?: T
  $regex?: string | RegExp
}
```

### Update<T>

Update operations object with MongoDB-like operators.

```typescript
type Update<T> = UpdateOperators<T> | Partial<T>

type UpdateOperators<T> = {
  $set?: Partial<T>
  $unset?: { [K in keyof T]?: '' | 1 | true }
  $inc?: { [K in keyof T]?: number }
  $dec?: { [K in keyof T]?: number }
  $push?: { [K in keyof T]?: any }
  $pull?: { [K in keyof T]?: any }
  $addToSet?: { [K in keyof T]?: any }
  $pop?: { [K in keyof T]?: 1 | -1 }
  $rename?: { [K in keyof T]?: string }
}
```

### QueryOptions

Options for query operations.

```typescript
type QueryOptions = {
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
  lean?: boolean
  select?: string[] | string
  populate?: string | string[]
}
```

### Document<T>

Document type with virtuals and methods.

```typescript
type Document<T> = T & {
  save(): Promise<T>
  [virtualName: string]: any
}
```

---

## Error Types

### ValidationError

Thrown when document validation fails.

```typescript
class ValidationError extends Error {
  name: 'ValidationError'
  message: string
}
```

**Example:**

```typescript
try {
  await User.create({ age: -5 }) // min: 0
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(err.message) // "age must be at least 0"
  }
}
```
