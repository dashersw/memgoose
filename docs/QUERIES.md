# Query Guide

Complete guide to querying documents in memgoose.

## Table of Contents

- [Basic Queries](#basic-queries)
- [Query Operators](#query-operators)
  - [Equality Operators](#equality-operators)
  - [Array Operators](#array-operators)
  - [Comparison Operators](#comparison-operators)
  - [String Operators](#string-operators)
  - [Field Existence Operators](#field-existence-operators)
  - [Array Query Operators](#array-operators-1)
- [Logical Operators](#logical-operators)
- [Update Operators](#update-operators)
- [Query Options](#query-options)
- [Query Chaining](#query-chaining)
- [Field Selection](#field-selection)
- [Sorting](#sorting)
- [Pagination](#pagination)
- [Lean Queries](#lean-queries)
- [Populate (References)](#populate-references)
- [Atomic Operations](#atomic-operations)
- [Performance Tips](#performance-tips)

---

## Basic Queries

### Find All Documents

```typescript
// Get all documents
const users = await User.find()

// Get all with query
const activeUsers = await User.find({ status: 'active' })
```

### Find One Document

```typescript
// Find first matching document
const user = await User.findOne({ email: 'alice@example.com' })

// Returns null if not found
if (user === null) {
  console.log('User not found')
}
```

### Find by ID

```typescript
const user = await User.findById('507f1f77bcf86cd799439011')
```

### Count Documents

```typescript
// Count all
const total = await User.countDocuments()

// Count matching
const adultCount = await User.countDocuments({ age: { $gte: 18 } })
```

### Distinct Values

```typescript
// Get unique values for a field
const ages = await User.distinct('age')

// With filter
const activeCities = await User.distinct('city', { status: 'active' })
```

---

## Query Operators

memgoose supports MongoDB-like query operators for flexible filtering.

### Equality Operators

#### `$eq` - Equal To

```typescript
// Implicit equality
await User.find({ name: 'Alice' })

// Explicit $eq
await User.find({ name: { $eq: 'Alice' } })
```

#### `$ne` - Not Equal To

```typescript
// Find users not named Alice
await User.find({ name: { $ne: 'Alice' } })

// Multiple conditions
await User.find({
  status: { $ne: 'deleted' },
  age: { $ne: null }
})
```

### Array Operators

#### `$in` - In Array

```typescript
// Find users with specific names
await User.find({
  name: { $in: ['Alice', 'Bob', 'Charlie'] }
})

// Find users with specific ages
await User.find({
  age: { $in: [25, 30, 35] }
})
```

#### `$nin` - Not In Array

```typescript
// Exclude specific values
await User.find({
  status: { $nin: ['deleted', 'suspended'] }
})

// Exclude null and specific ages
await User.find({
  age: { $nin: [null, 0] }
})
```

### Comparison Operators

#### `$gt` - Greater Than

```typescript
// Users older than 30
await User.find({ age: { $gt: 30 } })

// Posts after a date
await Post.find({
  publishedAt: { $gt: new Date('2025-01-01') }
})
```

#### `$gte` - Greater Than or Equal To

```typescript
// Users 18 or older
await User.find({ age: { $gte: 18 } })

// Scores 90 or above
await Test.find({ score: { $gte: 90 } })
```

#### `$lt` - Less Than

```typescript
// Users younger than 18
await User.find({ age: { $lt: 18 } })
```

#### `$lte` - Less Than or Equal To

```typescript
// Scores 50 or below
await Test.find({ score: { $lte: 50 } })
```

### Range Queries

Combine comparison operators:

```typescript
// Age between 18 and 65
await User.find({
  age: { $gte: 18, $lte: 65 }
})

// Score between 70 and 100
await Test.find({
  score: { $gt: 70, $lt: 100 }
})

// Date range
await Post.find({
  publishedAt: {
    $gte: new Date('2025-01-01'),
    $lt: new Date('2025-12-31')
  }
})
```

### String Operators

#### `$regex` - Regular Expression Match

```typescript
// Case-sensitive regex (string)
await User.find({
  name: { $regex: '^A' } // Names starting with 'A'
})

// Case-insensitive regex (RegExp)
await User.find({
  name: { $regex: /alice/i } // Contains 'alice' (case-insensitive)
})

// Email domain filter
await User.find({
  email: { $regex: /@example\.com$/ }
})

// Multiple patterns
await User.find({
  name: { $regex: /^(Alice|Bob|Charlie)/ }
})
```

### Field Existence Operators

#### `$exists` - Check Field Existence

Tests whether a field exists in a document:

```typescript
// Find users with phone number
await User.find({
  phoneNumber: { $exists: true }
})

// Find users without optional field
await User.find({
  middleName: { $exists: false }
})

// Combine with other conditions
await User.find({
  email: { $exists: true },
  emailVerified: true
})
```

**Use Cases:**

- Schema evolution (finding documents with/without new fields)
- Optional fields handling
- Data quality checks

### Array Operators

#### `$size` - Array Length Match

Matches arrays with a specific number of elements:

```typescript
// Find users with exactly 3 tags
await User.find({
  tags: { $size: 3 }
})

// Find orders with no items (empty array)
await Order.find({
  items: { $size: 0 }
})
```

**Note:** `$size` only accepts exact values, not ranges. For range queries on array length, use other methods:

```typescript
// For ranges, fetch and filter:
const users = await User.find()
const usersWithManyTags = users.filter(u => u.tags.length > 3)
```

#### `$all` - Array Contains All Elements

Matches arrays that contain all specified elements (order doesn't matter):

```typescript
// Find users with all these tags (and possibly more)
await User.find({
  tags: { $all: ['javascript', 'typescript'] }
})

// Empty array matches all documents
await User.find({
  tags: { $all: [] }
})

// Combine with other operators
await User.find({
  tags: { $all: ['verified', 'active'] },
  status: 'premium'
})
```

**Difference from `$in`:**

- `$all`: Array must contain ALL specified values
- `$in`: Field must match ANY of the specified values

```typescript
// $all - both tags required
await User.find({ tags: { $all: ['tag1', 'tag2'] } })
// Matches: ['tag1', 'tag2', 'tag3'] ✅
// Doesn't match: ['tag1', 'tag3'] ❌

// $in - any tag matches
await User.find({ status: { $in: ['active', 'pending'] } })
// Matches: 'active' ✅ or 'pending' ✅
```

#### `$elemMatch` - Array Element Match

Matches documents where at least one array element matches all specified conditions:

```typescript
interface User {
  name: string
  scores: Array<{ subject: string; score: number }>
}

// Find users with at least one math score above 90
await User.find({
  scores: {
    $elemMatch: {
      subject: 'math',
      score: { $gte: 90 }
    }
  }
})

// Multiple conditions on array element
await User.find({
  scores: {
    $elemMatch: {
      score: { $gte: 80, $lte: 100 },
      subject: { $in: ['math', 'physics'] }
    }
  }
})
```

**Why use `$elemMatch`?**

Without `$elemMatch`, conditions might match different array elements:

```typescript
// WITHOUT $elemMatch - conditions can match different elements
await User.find({
  'scores.subject': 'math',
  'scores.score': { $gte: 90 }
})
// Matches user with: [{ subject: 'math', score: 50 }, { subject: 'english', score: 95 }]
// ❌ Different elements satisfy the conditions!

// WITH $elemMatch - all conditions must match same element
await User.find({
  scores: {
    $elemMatch: {
      subject: 'math',
      score: { $gte: 90 }
    }
  }
})
// Only matches if SAME element has subject='math' AND score>=90
// ✅ Ensures conditions match the same array element
```

### Complex Queries

Combine multiple operators:

```typescript
// Find active users aged 18-65 named Alice or Bob
await User.find({
  status: 'active',
  age: { $gte: 18, $lte: 65 },
  name: { $in: ['Alice', 'Bob'] }
})

// Find posts published this year with high scores
await Post.find({
  publishedAt: {
    $gte: new Date('2025-01-01'),
    $lt: new Date('2026-01-01')
  },
  score: { $gte: 90 },
  status: { $ne: 'draft' }
})

// Complex filter with regex
await User.find({
  email: { $regex: /@(gmail|yahoo)\.com$/ },
  age: { $gte: 18 },
  status: { $nin: ['deleted', 'suspended'] }
})
```

---

## Logical Operators

Logical operators allow you to combine multiple query conditions with boolean logic.

### `$or` - Match Any Condition

Returns documents that match **at least one** of the conditions.

```typescript
// Find users who are either under 18 OR have premium status
await User.find({
  $or: [{ age: { $lt: 18 } }, { status: 'premium' }]
})

// Multiple OR conditions
await Product.find({
  $or: [{ price: { $lt: 10 } }, { onSale: true }, { category: 'clearance' }]
})
```

**Use Cases:**

- Multiple alternative filters
- "Either/or" queries
- Complex filtering logic

### `$and` - Match All Conditions

Returns documents that match **all** of the conditions. Useful for queries that can't be expressed with implicit AND.

```typescript
// Explicit AND (useful for same field with different operators)
await User.find({
  $and: [{ age: { $gte: 18 } }, { age: { $lte: 65 } }]
})

// Multiple conditions
await Product.find({
  $and: [{ price: { $gte: 100 } }, { inStock: true }, { rating: { $gte: 4.0 } }]
})
```

**Note:** Most queries use implicit AND, so explicit `$and` is only needed for:

- Multiple operators on the same field
- Complex nested logical conditions
- Clarity in complex queries

### `$nor` - Match None of the Conditions

Returns documents that **fail all** of the conditions (opposite of `$or`).

```typescript
// Find users who are NOT (young OR inactive)
await User.find({
  $nor: [{ age: { $lt: 18 } }, { status: 'inactive' }]
})

// Exclude multiple categories
await Product.find({
  $nor: [{ category: 'discontinued' }, { category: 'recalled' }, { price: 0 }]
})
```

**Use Cases:**

- Exclusion filters
- "Neither/nor" queries
- Blacklist patterns

### `$not` - Negate Operator

Negates the effect of a query operator on a specific field.

```typescript
// Find users whose age is NOT greater than or equal to 30
await User.find({
  age: { $not: { $gte: 30 } }
})
// Equivalent to: { age: { $lt: 30 } }

// Negate $in operator
await User.find({
  status: { $not: { $in: ['deleted', 'banned', 'suspended'] } }
})

// Negate regex
await User.find({
  email: { $not: { $regex: '@temporary\\.com$' } }
})

// Negate $exists
await User.find({
  optionalField: { $not: { $exists: true } }
})
```

**Use Cases:**

- Inverting complex operators
- Simplifying negation logic
- Readable query expressions

### Combining Logical Operators

Logical operators can be nested for complex queries.

```typescript
// Complex nested logic
await User.find({
  $and: [
    { age: { $gte: 18 } },
    {
      $or: [{ city: 'NYC' }, { city: 'LA' }, { status: 'premium' }]
    },
    {
      $nor: [{ banned: true }, { suspended: true }]
    }
  ]
})

// Nested OR within OR
await Product.find({
  $or: [
    {
      $or: [{ category: 'electronics' }, { category: 'gadgets' }]
    },
    { featured: true }
  ]
})
```

### Real-World Examples

**Access Control:**

```typescript
// Find posts user can view: owned by user OR public
await Post.find({
  $or: [{ authorId: currentUserId }, { visibility: 'public' }]
})
```

**Content Filtering:**

```typescript
// Active content not in draft or deleted state
await Article.find({
  $and: [
    { status: 'active' },
    {
      $nor: [{ draft: true }, { deleted: true }]
    }
  ]
})
```

**Complex Search:**

```typescript
// Search across multiple fields with different criteria
await Product.find({
  $or: [
    { name: { $regex: searchTerm, $options: 'i' } },
    { description: { $regex: searchTerm, $options: 'i' } },
    { tags: { $in: [searchTerm] } }
  ],
  $and: [{ inStock: true }, { price: { $gte: minPrice, $lte: maxPrice } }]
})
```

**Age Range with Exclusions:**

```typescript
// Adults (18-65) who are not in restricted list
await User.find({
  $and: [
    { age: { $gte: 18 } },
    { age: { $lte: 65 } },
    { userId: { $not: { $in: restrictedUserIds } } }
  ]
})
```

---

## Update Operators

Update operators modify documents in various ways.

### Field Update Operators

#### `$set` - Set Field Values

```typescript
// Set single field
await User.updateOne({ name: 'Alice' }, { $set: { age: 26 } })

// Set multiple fields
await User.updateOne({ name: 'Bob' }, { $set: { age: 31, city: 'NYC', status: 'active' } })
```

#### `$unset` - Remove Fields

```typescript
// Remove single field
await User.updateOne({ name: 'Alice' }, { $unset: { temporaryField: '' } })

// Remove multiple fields
await User.updateOne({ name: 'Bob' }, { $unset: { field1: 1, field2: true } })
```

### Numeric Operators

#### `$inc` - Increment

```typescript
// Increment by 1
await User.updateOne({ name: 'Alice' }, { $inc: { loginCount: 1 } })

// Increment by custom amount
await User.updateOne({ name: 'Bob' }, { $inc: { points: 100, level: 1 } })

// Decrement (negative increment)
await User.updateOne({ name: 'Charlie' }, { $inc: { credits: -50 } })
```

#### `$dec` - Decrement

```typescript
// Decrement by 1
await User.updateOne({ name: 'Alice' }, { $dec: { retries: 1 } })

// Decrement by custom amount
await User.updateOne({ name: 'Bob' }, { $dec: { balance: 25.5 } })
```

### Array Operators

#### `$push` - Add to Array

```typescript
// Add single element
await User.updateOne({ name: 'Alice' }, { $push: { tags: 'verified' } })

// Add to multiple arrays
await User.updateOne({ name: 'Bob' }, { $push: { tags: 'premium', roles: 'admin' } })
```

#### `$pull` - Remove from Array

```typescript
// Remove matching element
await User.updateOne({ name: 'Alice' }, { $pull: { tags: 'temporary' } })

// Remove from multiple arrays
await User.updateOne({ name: 'Bob' }, { $pull: { tags: 'trial', roles: 'guest' } })
```

#### `$addToSet` - Add Unique to Array

Only adds if element doesn't already exist:

```typescript
// Add if not present
await User.updateOne({ name: 'Alice' }, { $addToSet: { tags: 'verified' } })

// Won't create duplicates
await User.updateMany({}, { $addToSet: { tags: 'active' } })
```

#### `$pop` - Remove First or Last Element

```typescript
// Remove last element (1)
await User.updateOne({ name: 'Alice' }, { $pop: { messages: 1 } })

// Remove first element (-1)
await User.updateOne({ name: 'Bob' }, { $pop: { history: -1 } })
```

### Field Rename

#### `$rename` - Rename Field

```typescript
// Rename single field
await User.updateOne({ name: 'Alice' }, { $rename: { city: 'location' } })

// Rename multiple fields
await User.updateMany({}, { $rename: { old_field: 'new_field', temp: 'permanent' } })
```

### Direct Updates

Update without operators (replaces matching fields):

```typescript
// Direct field replacement
await User.updateOne({ name: 'Alice' }, { age: 26, city: 'NYC', status: 'active' })

// Equivalent to $set
await User.updateOne({ name: 'Alice' }, { $set: { age: 26, city: 'NYC', status: 'active' } })
```

### Combining Operators

```typescript
// Multiple operations at once
await User.updateOne(
  { name: 'Alice' },
  {
    $set: { status: 'active', lastLogin: new Date() },
    $inc: { loginCount: 1 },
    $push: { loginHistory: new Date() },
    $unset: { tempToken: '' }
  }
)
```

---

## Query Options

Customize query behavior with options.

### Available Options

```typescript
interface QueryOptions {
  sort?: Record<string, 1 | -1> // Sort order
  limit?: number // Max results
  skip?: number // Skip first N results
  lean?: boolean // Return plain objects
  select?: string[] | string // Field selection
  populate?: string | string[] // Populate references
}
```

### Using Options

```typescript
// Options pattern
const users = await User.find(
  { status: 'active' },
  {
    sort: { age: -1 },
    limit: 10,
    skip: 0,
    lean: true,
    select: ['name', 'email']
  }
)

// Query chaining pattern (alternative)
const users2 = await User.find({ status: 'active' })
  .sort({ age: -1 })
  .limit(10)
  .skip(0)
  .lean()
  .select('name email')
  .exec()
```

---

## Query Chaining

Build queries step by step with a fluent API.

### Find Query Chaining

```typescript
const users = await User.find({ status: 'active' })
  .sort({ age: -1, name: 1 })
  .limit(10)
  .skip(20)
  .select('name email age')
  .lean()
  .exec()
```

### FindOne Query Chaining

```typescript
const user = await User.findOne({ email: 'alice@example.com' })
  .populate('posts')
  .select('name email')
  .exec()
```

### Available Chain Methods

#### `sort(fields)`

```typescript
// Single field descending
.sort({ age: -1 })

// Multiple fields
.sort({ age: -1, name: 1 })

// Alternative string syntax
.sort('-age name')
```

#### `limit(n)`

```typescript
// Limit to 10 results
.limit(10)
```

#### `skip(n)`

```typescript
// Skip first 20 results
.skip(20)
```

#### `lean()`

```typescript
// Return plain objects (no virtuals, no save() method)
.lean()
```

#### `select(fields)`

```typescript
// Array syntax
.select(['name', 'email'])

// String syntax
.select('name email')

// Exclude fields (prefix with -)
.select('-password -privateField')
```

#### `populate(path)`

```typescript
// Single reference
.populate('author')

// Multiple references
.populate('author').populate('comments')

// Alternative array syntax
.populate(['author', 'comments'])
```

#### `exec()`

Executes the query (returns Promise):

```typescript
const result = await User.find({ status: 'active' }).sort({ age: -1 }).limit(10).exec()
```

---

## Field Selection

Control which fields are returned in query results.

### Include Fields

```typescript
// Array syntax
const users = await User.find({}, { select: ['name', 'email'] })

// String syntax
const users2 = await User.find({}, { select: 'name email' })

// Query chaining
const users3 = await User.find().select('name email').exec()
```

### Exclude Fields

```typescript
// Exclude password and private fields
const users = await User.find({}, { select: ['-password', '-privateKey'] })

// String syntax
const users2 = await User.find().select('-password -privateKey').exec()
```

### Mixed Include/Exclude

```typescript
// Include name and email, exclude password
const users = await User.find().select('name email -password').exec()
```

**Note:** Selected fields affect both the returned data and virtuals.

---

## Sorting

Order results by one or more fields.

### Single Field Sort

```typescript
// Ascending (1)
const users = await User.find({}, { sort: { age: 1 } })

// Descending (-1)
const users2 = await User.find({}, { sort: { age: -1 } })
```

### Multi-Field Sort

```typescript
// Sort by age descending, then name ascending
const users = await User.find(
  {},
  {
    sort: { age: -1, name: 1 }
  }
)
```

### Sort with Query Chaining

```typescript
// Object syntax
const users = await User.find().sort({ age: -1, name: 1 }).exec()

// String syntax
const users2 = await User.find().sort('-age name').exec()
```

### Sort Examples

```typescript
// Newest first
await Post.find().sort({ createdAt: -1 }).exec()

// Alphabetical by name
await User.find().sort({ name: 1 }).exec()

// By score descending, then date ascending
await Test.find().sort({ score: -1, date: 1 }).exec()
```

---

## Pagination

Implement pagination with `skip()` and `limit()`.

### Basic Pagination

```typescript
const page = 2 // Page number (1-indexed)
const perPage = 10

const users = await User.find(
  {},
  {
    skip: (page - 1) * perPage,
    limit: perPage,
    sort: { createdAt: -1 }
  }
)

// Get total for pagination UI
const total = await User.countDocuments()
const totalPages = Math.ceil(total / perPage)
```

### Pagination Helper Function

```typescript
async function paginate<T>(model: Model<T>, query: Query<T>, page: number, perPage: number) {
  const skip = (page - 1) * perPage

  const [results, total] = await Promise.all([
    model.find(query, { skip, limit: perPage, sort: { createdAt: -1 } }),
    model.countDocuments(query)
  ])

  return {
    results,
    page,
    perPage,
    total,
    totalPages: Math.ceil(total / perPage)
  }
}

// Usage
const pagination = await paginate(User, { status: 'active' }, 2, 10)
console.log(pagination.results)
console.log(`Page ${pagination.page} of ${pagination.totalPages}`)
```

### Query Chaining for Pagination

```typescript
const users = await User.find({ status: 'active' })
  .sort({ createdAt: -1 })
  .skip(20)
  .limit(10)
  .exec()
```

---

## Lean Queries

Lean queries return plain JavaScript objects instead of documents with virtuals and methods.

### Basic Lean Query

```typescript
// Regular query (with virtuals and save() method)
const user = await User.findOne({ name: 'Alice' })
console.log(user.fullName) // Virtual property works
await user.save() // save() method available

// Lean query (plain object)
const leanUser = await User.findOne({ name: 'Alice' }, { lean: true })
console.log(leanUser.fullName) // undefined (no virtuals)
// leanUser.save()  // Error: not a function
```

### Performance Benefits

Lean queries are faster because they skip:

- Virtual property computation
- Method attachment
- Document hydration

```typescript
// Performance comparison (100k documents)
// Regular: ~0.2ms
const user = await User.findOne({ email: 'alice@example.com' })

// Lean: ~0.035ms (5-10x faster!)
const leanUser = await User.findOne({ email: 'alice@example.com' }, { lean: true })
```

### Query Chaining with Lean

```typescript
const users = await User.find({ status: 'active' }).lean().limit(100).exec()
```

### When to Use Lean

**Use lean when:**

- Reading large datasets
- Performance is critical
- You don't need virtuals or methods
- Building APIs (returning JSON)

**Avoid lean when:**

- You need virtual properties
- You need to call `save()`
- You need document methods

---

## Populate (References)

Populate replaces document references with actual documents.

### Define References

```typescript
import { ObjectId, Schema } from 'memgoose'

// Post schema with author reference
const postSchema = new Schema({
  title: String,
  content: String,
  authorId: { type: ObjectId, ref: 'User' }
})

const Post = model('Post', postSchema)
```

### Basic Populate

```typescript
// Without populate
const post = await Post.findOne({ title: 'Hello World' })
console.log(post.authorId) // ObjectId("507f1f77bcf86cd799439011")

// With populate
const post = await Post.findOne(
  { title: 'Hello World' },
  {
    populate: 'authorId'
  }
)
console.log(post.authorId) // { _id: "...", name: "Alice", email: "..." }
```

### Multiple Populates

```typescript
const postSchema = new Schema({
  title: String,
  authorId: { type: ObjectId, ref: 'User' },
  categoryId: { type: ObjectId, ref: 'Category' }
})

// Populate multiple fields
const post = await Post.findOne(
  { title: 'Hello' },
  {
    populate: ['authorId', 'categoryId']
  }
)

// Query chaining
const post2 = await Post.findOne({ title: 'Hello' })
  .populate('authorId')
  .populate('categoryId')
  .exec()
```

### Populate Arrays

```typescript
const postSchema = new Schema({
  title: String,
  commentIds: [{ type: ObjectId, ref: 'Comment' }]
})

const post = await Post.findOne(
  { title: 'Hello' },
  {
    populate: 'commentIds'
  }
)

console.log(post.commentIds) // Array of Comment documents
```

### Populate with Find

```typescript
// Populate all results
const posts = await Post.find(
  { status: 'published' },
  {
    populate: 'authorId'
  }
)

posts.forEach(post => {
  console.log(`${post.title} by ${post.authorId.name}`)
})
```

---

## Atomic Operations

Atomically find and modify documents in a single operation.

### findOneAndUpdate

Find and update a document atomically:

```typescript
// Get updated document (default)
const user = await User.findOneAndUpdate(
  { email: 'alice@example.com' },
  { $inc: { loginCount: 1 }, $set: { lastLogin: new Date() } }
)

console.log(user) // Updated document
```

### Return Original Document

```typescript
// Get original document before update
const original = await User.findOneAndUpdate(
  { email: 'alice@example.com' },
  { $set: { status: 'inactive' } },
  { returnDocument: 'before' }
)

console.log(original.status) // 'active' (original value)
```

### findOneAndDelete

Find and delete a document atomically:

```typescript
const deletedUser = await User.findOneAndDelete({
  email: 'alice@example.com'
})

if (deletedUser) {
  console.log(`Deleted user: ${deletedUser.name}`)
} else {
  console.log('User not found')
}
```

### Use Cases

**Counters:**

```typescript
// Atomic increment with retrieval
const user = await User.findOneAndUpdate({ _id: userId }, { $inc: { postCount: 1 } })
```

**Soft Delete:**

```typescript
// Mark as deleted and get final state
const user = await User.findOneAndUpdate(
  { _id: userId },
  { $set: { deleted: true, deletedAt: new Date() } }
)
```

**Queue Processing:**

```typescript
// Atomically claim next job
const job = await Job.findOneAndUpdate(
  { status: 'pending' },
  { $set: { status: 'processing', workerId: processId } }
)

if (job) {
  await processJob(job)
}
```

---

## Performance Tips

### 1. Use Indexes

Indexes provide massive performance gains:

```typescript
// Without index: O(n) - scans all documents
// With index: O(1) - instant lookup

userSchema.index('email')
userSchema.index(['city', 'age'])

// 10-393x faster on 100k documents!
const user = await User.findOne({ email: 'alice@example.com' })
```

### 2. Use Lean for Large Datasets

```typescript
// 5-10x faster for reads
const users = await User.find({ status: 'active' }, { lean: true })
```

### 3. Select Only Needed Fields

```typescript
// Don't fetch unused fields
const users = await User.find({}, { select: 'name email' })
```

### 4. Use CountDocuments with Indexes

```typescript
// Faster with indexed fields
userSchema.index('status')
const count = await User.countDocuments({ status: 'active' })
```

### 5. Batch Operations

```typescript
// Use insertMany instead of multiple create()
await User.insertMany(arrayOfUsers)

// Use updateMany instead of loop
await User.updateMany({ status: 'pending' }, { $set: { status: 'active' } })

// Use deleteMany instead of loop
await User.deleteMany({ status: 'deleted' })
```

### 6. Leverage Compound Indexes

```typescript
// Compound index for common queries
userSchema.index(['city', 'age'])

// Ultra-fast compound query
const users = await User.find({ city: 'NYC', age: 25 })
```

### 7. Pagination Best Practices

```typescript
// Always use limit to avoid fetching too much
const users = await User.find().sort({ createdAt: -1 }).limit(20).exec()
```

### 8. Avoid $regex on Large Datasets

```typescript
// Slow on large datasets (full scan)
await User.find({ name: { $regex: /alice/i } })

// Better: use indexed equality when possible
userSchema.index('name')
await User.findOne({ name: 'Alice' })
```

### 9. Use Partial Index Matching

```typescript
// Index on most selective field
userSchema.index('status')

// Uses index, then filters remaining
// Faster than full scan!
await User.find({ status: 'active', age: { $gte: 18 } })
```

### 10. Benchmark Your Queries

```typescript
console.time('query')
const result = await User.find({ complex: 'query' })
console.timeEnd('query')
```

See [PERFORMANCE.md](PERFORMANCE.md) for detailed benchmarks and optimization strategies.
