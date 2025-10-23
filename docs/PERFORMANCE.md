# Performance Guide

Complete guide to optimizing memgoose performance.

## Table of Contents

- [Index Performance](#index-performance)
- [Query Optimization](#query-optimization)
- [Storage Performance](#storage-performance)
- [Lean Queries](#lean-queries)
- [Batch Operations](#batch-operations)
- [Benchmarks](#benchmarks)
- [Best Practices](#best-practices)
- [Profiling](#profiling)

---

## Index Performance

Indexes provide the biggest performance gains in memgoose.

### Without Indexes

Without indexes, queries scan all documents (O(n)):

```typescript
const userSchema = new Schema({
  email: String,
  name: String
})

const User = model('User', userSchema)

// Insert 100,000 users
await User.insertMany(generate100kUsers())

// Query without index - scans all 100k documents!
console.time('no-index')
const user = await User.findOne({ email: 'alice@example.com' })
console.timeEnd('no-index')
// no-index: 40ms
```

### With Indexes

With indexes, queries are instant (O(1)):

```typescript
const userSchema = new Schema({
  email: String,
  name: String
})

// Add index
userSchema.index('email')

const User = model('User', userSchema)

await User.insertMany(generate100kUsers())

// Query with index - instant lookup!
console.time('indexed')
const user = await User.findOne({ email: 'alice@example.com' })
console.timeEnd('indexed')
// indexed: 0.2ms
```

**Result: 200x faster!**

### Compound Indexes

Compound indexes are even faster for multi-field queries:

```typescript
userSchema.index(['city', 'age'])

// Ultra-fast compound query
console.time('compound')
const user = await User.findOne({ city: 'NYC', age: 25 })
console.timeEnd('compound')
// compound: 0.03ms

// 1,333x faster than no index!
```

### Index Performance Comparison

_Benchmarked on Apple M4 Max (16 cores, 128GB RAM)_

| Dataset Size | No Index | Single Index | Compound Index |
| ------------ | -------- | ------------ | -------------- |
| 1,000        | 0.39ms   | 0.05ms       | 0.02ms         |
| 10,000       | 2.02ms   | 0.06ms       | 0.02ms         |
| 100,000      | 4.65ms   | 0.07ms       | 0.02ms         |

**Speedup:** 97-1,157x faster with indexes!

### When to Use Indexes

✅ **Use indexes for:**

- Frequently queried fields
- Equality queries (`{ email: 'alice@example.com' }`)
- Range queries (`{ age: { $gte: 18 } }`)
- Unique constraints
- Sort operations

❌ **Skip indexes for:**

- Rarely queried fields
- Write-heavy fields (indexes slow down writes)
- Small datasets (<100 docs)

### Multiple Index Strategy

```typescript
// Common queries:
// - Find by email (most common)
// - Find by status + createdAt (dashboard)
// - Find by city + age (search)

userSchema.index('email') // Most common
userSchema.index(['status', 'createdAt']) // Dashboard
userSchema.index(['city', 'age']) // Search

// Now all common queries are O(1)!
```

---

## Query Optimization

### Partial Index Matching

Even if a query has extra fields, indexes are still used:

```typescript
userSchema.index('status')

// Uses 'status' index, then filters remaining
const users = await User.find({
  status: 'active', // Uses index
  age: { $gte: 18 } // Filters indexed results
})

// Instead of scanning 100k docs, scans only ~33k active users
// 40% faster than no index!
```

### Select Only Needed Fields

Don't fetch fields you don't need:

```typescript
// Bad - fetches all fields
const users = await User.find({ status: 'active' })

// Good - fetches only needed fields
const users = await User.find(
  { status: 'active' },
  {
    select: ['name', 'email']
  }
)

// Smaller result set = faster transmission
```

### Use Limit

Always limit results for large datasets:

```typescript
// Bad - fetches all matching docs
const users = await User.find({ status: 'active' })

// Good - limits to 20 results
const users = await User.find(
  { status: 'active' },
  {
    limit: 20
  }
)

// Much faster for large result sets!
```

### Avoid $regex on Large Datasets

Regex requires full scan (can't use indexes):

```typescript
// Slow - full scan required
const users = await User.find({ name: { $regex: /alice/i } })

// Fast - uses index
userSchema.index('name')
const user = await User.findOne({ name: 'Alice' })
```

If you need regex, consider:

- Full-text search library
- Separate search index
- Limiting result set first

### Query Optimization Checklist

✅ Index frequently queried fields  
✅ Use `select` to limit fields  
✅ Use `limit` for large result sets  
✅ Use equality over regex when possible  
✅ Use compound indexes for multi-field queries  
✅ Use lean queries when virtuals not needed

---

## Storage Performance

Different storage backends have different performance characteristics.

### Performance Comparison

**Insert 10,000 documents:**

| Storage    | Time  | Throughput       |
| ---------- | ----- | ---------------- |
| Memory     | 28ms  | 366,667 docs/sec |
| WiredTiger | 66ms  | 151,515 docs/sec |
| SQLite     | 87ms  | 114,943 docs/sec |
| File       | 454ms | 22,026 docs/sec  |

**Indexed Query (1 of 100k):**

| Storage    | Time   |
| ---------- | ------ |
| Memory     | 0.07ms |
| File       | 0.16ms |
| SQLite     | 0.23ms |
| WiredTiger | 0.16ms |

All storage backends benefit equally from indexes!

**Bulk Insert (100,000 documents):**

| Storage    | Time  | Throughput       |
| ---------- | ----- | ---------------- |
| Memory     | 256ms | 390,625 docs/sec |
| WiredTiger | 501ms | 199,601 docs/sec |
| SQLite     | 759ms | 131,752 docs/sec |

### Storage Selection

**Memory** - Fastest, no persistence:

```typescript
// Use for: Testing, caching, temporary data
const db = connect({ storage: 'memory' })
```

**WiredTiger** - High write throughput:

```typescript
// Use for: Production, high writes, large datasets
const db = connect({
  storage: 'wiredtiger',
  wiredtiger: {
    dataPath: './data',
    cacheSize: '1G' // Increase for better performance
  }
})
```

**SQLite** - Balanced performance:

```typescript
// Use for: Production, small-medium datasets
const db = connect({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})
```

**File** - Simple persistence:

```typescript
// Use for: Simple apps, small datasets
const db = connect({
  storage: 'file',
  file: {
    dataPath: './data',
    persistMode: 'debounced' // Better performance
  }
})
```

### WiredTiger Optimization

Increase cache size for better performance:

```typescript
connect({
  storage: 'wiredtiger',
  wiredtiger: {
    dataPath: './data',
    cacheSize: '2G', // 2GB cache (default: 500M)
    compressor: 'lz4' // Fast compression
  }
})
```

**Cache size recommendations:**

- Development: 500M
- Production (small): 1G
- Production (medium): 2G
- Production (large): 4G+

### File Storage Optimization

Use debounced mode for better write performance:

```typescript
connect({
  storage: 'file',
  file: {
    dataPath: './data',
    persistMode: 'debounced', // Batches writes
    debounceMs: 200 // Wait 200ms
  }
})
```

---

## Lean Queries

Lean queries skip virtuals and methods for better performance.

### Regular vs Lean

```typescript
userSchema.virtual('fullName').get(doc => {
  return `${doc.firstName} ${doc.lastName}`
})

// Regular query - includes virtuals
console.time('regular')
const user = await User.findOne({ email: 'alice@example.com' })
console.log(user.fullName) // Available
console.timeEnd('regular')
// regular: 0.2ms

// Lean query - skips virtuals
console.time('lean')
const leanUser = await User.findOne({ email: 'alice@example.com' }, { lean: true })
console.log(leanUser.fullName) // undefined
console.timeEnd('lean')
// lean: 0.035ms

// 5-10x faster!
```

### Performance Gain

| Operation   | Regular | Lean    | Speedup |
| ----------- | ------- | ------- | ------- |
| findOne     | 0.06ms  | 0.014ms | 4.1x    |
| find (100)  | 0.12ms  | 0.02ms  | 4.7x    |
| find (1000) | 0.58ms  | 0.01ms  | 46.2x   |

### When to Use Lean

✅ **Use lean when:**

- Building APIs (returning JSON)
- Reading large datasets
- Performance is critical
- Don't need virtuals
- Don't need `save()` method

❌ **Avoid lean when:**

- Need virtual properties
- Need to call `save()`
- Need document methods
- Want computed properties

### Lean Example

```typescript
// API endpoint - perfect for lean
app.get('/users', async (req, res) => {
  const users = await User.find(
    { status: 'active' },
    {
      lean: true, // Fast!
      select: ['name', 'email'],
      limit: 20
    }
  )

  res.json(users)
})
```

---

## Batch Operations

Use batch operations instead of loops.

### Insert Operations

```typescript
// Bad - 1,000 individual inserts
console.time('loop-insert')
for (let i = 0; i < 1000; i++) {
  await User.create({ name: `User ${i}` })
}
console.timeEnd('loop-insert')
// loop-insert: 500ms

// Good - single batch insert
console.time('batch-insert')
const users = Array.from({ length: 1000 }, (_, i) => ({
  name: `User ${i}`
}))
await User.insertMany(users)
console.timeEnd('batch-insert')
// batch-insert: 50ms

// 10x faster!
```

### Update Operations

```typescript
// Bad - 1,000 individual updates
console.time('loop-update')
for (let i = 0; i < 1000; i++) {
  await User.updateOne({ name: `User ${i}` }, { $set: { updated: true } })
}
console.timeEnd('loop-update')
// loop-update: 300ms

// Good - single batch update
console.time('batch-update')
await User.updateMany({}, { $set: { updated: true } })
console.timeEnd('batch-update')
// batch-update: 30ms

// 10x faster!
```

### Delete Operations

```typescript
// Bad - loop with deleteOne
for (const user of inactiveUsers) {
  await User.deleteOne({ _id: user._id })
}

// Good - single deleteMany
const ids = inactiveUsers.map(u => u._id)
await User.deleteMany({ _id: { $in: ids } })
```

### Batch Size

For very large batches, split into chunks:

```typescript
async function insertInChunks(docs: any[], chunkSize = 1000) {
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize)
    await User.insertMany(chunk)
    console.log(`Inserted ${i + chunk.length} / ${docs.length}`)
  }
}

// Insert 100k documents in chunks
await insertInChunks(generate100kUsers(), 1000)
```

---

## Benchmarks

Comprehensive benchmarks from the performance example.

### Test Setup

- Dataset: 100,000 documents
- Machine: Apple M4 Max (16 cores, 128GB RAM)
- Node.js: v24.8.0

### Indexed vs Non-Indexed

_Benchmarked on Apple M4 Max with 100,000 documents_

| Operation      | Indexed | Non-Indexed | Speedup    |
| -------------- | ------- | ----------- | ---------- |
| Equality query | <0.01ms | 2.01ms      | **431x**   |
| Compound query | <0.01ms | 2.01ms      | **1147x**  |
| count()        | 11.60ms | 24.42ms     | **2x**     |
| update()       | 0.02ms  | 2.09ms      | **83x**    |
| delete()       | 0.12ms  | -           | Ultra-fast |
| Lean query     | 0.70ms  | -           | **17.5x**  |

### Storage Benchmark

**10,000 documents:**

| Storage    | Insert | Query  | Update | Delete |
| ---------- | ------ | ------ | ------ | ------ |
| File       | 454ms  | 0.01ms | 0.42ms | 0.11ms |
| SQLite     | 87ms   | 0.01ms | 0.29ms | 0.14ms |
| WiredTiger | 66ms   | 0.01ms | 1.23ms | 0.33ms |
| Memory     | 28ms   | 0.07ms | 0.50ms | 0.50ms |

### Operation Benchmarks

**100,000 documents, indexed:**

| Operation              | Time     |
| ---------------------- | -------- |
| `findOne()`            | 0.06ms   |
| `find()` (10 results)  | 0.07ms   |
| `find()` (100 results) | 0.06ms   |
| `countDocuments()`     | 11.76ms  |
| `distinct()`           | 1.47ms   |
| `updateOne()`          | 0.09ms   |
| `updateMany()` (1000)  | 109.00ms |
| `deleteOne()`          | 0.14ms   |
| `insertMany()` (1000)  | 42.57ms  |

### Run Benchmarks

Run the performance example to see benchmarks on your system:

```bash
npm run example:perf
```

---

## Best Practices

### 1. Always Index Queried Fields

```typescript
// Identify frequently queried fields
userSchema.index('email')
userSchema.index('status')
userSchema.index(['city', 'age'])
```

### 2. Use Lean for Read-Heavy Operations

```typescript
// API responses
const users = await User.find({}, { lean: true, limit: 20 })
```

### 3. Batch Operations

```typescript
// Use insertMany, updateMany, deleteMany
await User.insertMany(arrayOfUsers)
await User.updateMany({}, { $set: { updated: true } })
```

### 4. Limit Results

```typescript
// Always paginate large result sets
const users = await User.find({}, { limit: 20, skip: page * 20 })
```

### 5. Select Only Needed Fields

```typescript
// Don't fetch unused fields
const users = await User.find({}, { select: 'name email' })
```

### 6. Choose Right Storage

```typescript
// Memory for testing
// SQLite for production (small-medium)
// WiredTiger for production (large/high-write)
```

### 7. Use Compound Indexes

```typescript
// For multi-field queries
userSchema.index(['status', 'createdAt'])

// Much faster than two separate indexes!
const users = await User.find({ status: 'active', createdAt: { $gte: date } })
```

### 8. Avoid $regex on Large Datasets

```typescript
// Slow
const users = await User.find({ name: { $regex: /alice/i } })

// Fast
const user = await User.findOne({ name: 'Alice' })
```

### 9. Profile Your Queries

```typescript
console.time('query')
const result = await User.find(complexQuery)
console.timeEnd('query')
```

### 10. Monitor Memory Usage

```typescript
console.log('Memory:', process.memoryUsage().heapUsed / 1024 / 1024, 'MB')
```

---

## Profiling

### Timing Queries

```typescript
console.time('findUser')
const user = await User.findOne({ email: 'alice@example.com' })
console.timeEnd('findUser')
// findUser: 0.2ms
```

### Timing with Labels

```typescript
async function profileQuery(label: string, fn: () => Promise<any>) {
  console.time(label)
  const result = await fn()
  console.timeEnd(label)
  return result
}

await profileQuery('find-active', () => User.find({ status: 'active' }))
await profileQuery('find-by-email', () => User.findOne({ email: 'alice@example.com' }))
```

### Memory Profiling

```typescript
function getMemoryUsage() {
  const used = process.memoryUsage()
  return {
    rss: Math.round(used.rss / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024)
  }
}

console.log('Before:', getMemoryUsage())
await User.insertMany(generate100kUsers())
console.log('After:', getMemoryUsage())
```

### Operation Counts

```typescript
let queryCount = 0

userSchema.post('find', () => {
  queryCount++
})
userSchema.post('findOne', () => {
  queryCount++
})

// ... run your operations ...

console.log(`Total queries: ${queryCount}`)
```

### Custom Profiler

```typescript
class QueryProfiler {
  private stats = new Map<string, { count: number; totalTime: number }>()

  async profile<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    const result = await fn()
    const duration = performance.now() - start

    const stat = this.stats.get(operation) || { count: 0, totalTime: 0 }
    stat.count++
    stat.totalTime += duration
    this.stats.set(operation, stat)

    return result
  }

  report() {
    console.log('\nQuery Profile:')
    for (const [operation, stat] of this.stats) {
      const avg = stat.totalTime / stat.count
      console.log(`  ${operation}:`)
      console.log(`    Count: ${stat.count}`)
      console.log(`    Total: ${stat.totalTime.toFixed(2)}ms`)
      console.log(`    Avg: ${avg.toFixed(2)}ms`)
    }
  }
}

// Usage
const profiler = new QueryProfiler()

await profiler.profile('find-active', () => User.find({ status: 'active' }))

await profiler.profile('find-by-email', () => User.findOne({ email: 'alice@example.com' }))

profiler.report()
```

---

## Performance Checklist

Before deploying to production, ensure:

✅ All frequently queried fields are indexed  
✅ Compound indexes for multi-field queries  
✅ Using lean queries for API responses  
✅ Batch operations instead of loops  
✅ Results limited with `limit`  
✅ Only selecting needed fields  
✅ Using appropriate storage backend  
✅ WiredTiger cache sized appropriately  
✅ Queries profiled and optimized  
✅ No $regex on large datasets

---

## Additional Resources

- [API Reference](API.md)
- [Query Guide](QUERIES.md)
- [Storage Guide](STORAGE.md)
- [Examples](../examples)

Run performance benchmarks:

```bash
npm run example:perf
```
