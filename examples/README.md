# Examples

This folder contains examples demonstrating memgoose features.

## Schema Indexes and Queries

**File**: `schema-indexes-queries.ts`

Shows basic usage including:

- Schema definition with indexes
- Model creation with `model()` factory
- Query operations (`findOne`, `find`)
- CRUD operations (`create`, `insertMany`, `save`)
- Compound indexes

Run it:

```bash
npm run example
```

## Performance Benchmark

**File**: `performance.ts`

Demonstrates the performance benefits of indexing with 100,000 documents:

- Indexed vs non-indexed query comparison
- Single-field indexes
- Compound indexes
- Partial index matching
- Performance metrics with `console.time()`

Run it:

```bash
npm run example:perf
```

## Virtuals and Lifecycle Hooks

**File**: `virtuals-and-hooks.ts`

Demonstrates advanced features:

- Virtual properties (computed fields)
- Pre/post hooks for operations
- Async hooks
- Timestamps via hooks
- Logging and validation patterns

Run it:

```bash
npm run example:virtuals
```

## Complete Features Demo

**File**: `complete-features-demo.ts`

Comprehensive showcase of all memgoose features:

- Validation, defaults, and timestamps
- Query operators ($exists, $size, $elemMatch)
- Lean queries for performance
- Field selection
- Populate (references between models)
- Subdocuments (nested schemas)
- Discriminators (schema inheritance)
- Instance methods and more

Run it:

```bash
npm run example:showcase
```

## Document Save Method

**File**: `document-save.ts`

Demonstrates Mongoose-style document saving:

- Fetch and modify documents
- Save changes with `.save()`
- Validation on save
- Pre/post save hooks
- Timestamp updates
- Unique constraint checking
- Multiple saves on the same document
- Field deletion

Run it:

```bash
npm run example:save
```

### Performance Benchmark Results

Results on a typical machine with 100,000 documents (20 comprehensive tests):

#### Query Operations

| Test | Operation                       | Time    | Index Used | Speedup     |
| ---- | ------------------------------- | ------- | ---------- | ----------- |
| 1    | Indexed equality (email)        | ~0.15ms | ✅         | Baseline    |
| 2    | Non-indexed equality (id)       | ~14.8ms | ❌         | 99x slower  |
| 3    | Compound index (city + age)     | ~0.02ms | ✅         | 8x faster   |
| 4    | find() with index (status)      | ~7.6ms  | ✅         | Fast        |
| 5    | find() without index (age < 25) | ~25.4ms | ❌         | 169x slower |
| 8    | find() all documents            | ~31.2ms | N/A        | Full scan   |

#### Count Operations

| Test | Operation                  | Time    | Index Used |
| ---- | -------------------------- | ------- | ---------- |
| 9    | count() with indexed field | ~4.5ms  | ✅         |
| 10   | count() without index      | ~37.0ms | ❌         |

#### Update Operations

| Test | Operation                 | Time    | Index Used |
| ---- | ------------------------- | ------- | ---------- |
| 11   | updateOne() with index    | ~32.2ms | ✅         |
| 12   | updateOne() without index | ~46.6ms | ❌         |
| 13   | updateMany() with index   | ~71.1ms | ✅         |

#### Delete Operations

| Test | Operation              | Time    | Index Used |
| ---- | ---------------------- | ------- | ---------- |
| 14   | deleteOne() with index | ~31.5ms | ✅         |

#### Advanced Operations

| Test | Operation                     | Time    | Notes                       |
| ---- | ----------------------------- | ------- | --------------------------- |
| 6    | Partial index + filter        | ~29.1ms | Index narrows, then filters |
| 7    | Compound index + extra field  | ~1.9ms  | Efficient multi-condition   |
| 15   | find() with sort + limit      | ~7.1ms  | Sorted top-10               |
| 16   | find() with skip + limit      | ~0.23ms | Pagination                  |
| 17   | distinct()                    | ~1.4ms  | Unique values               |
| 18   | find() lean query             | ~0.05ms | 150x+ faster (no virtuals)  |
| 19   | find() with select            | ~20.3ms | Field projection            |
| 20   | Complex multi-condition query | ~29.1ms | 3+ conditions               |

#### Key Performance Insights

- **Indexed equality queries**: ~0.15ms (optimal)
- **Non-indexed equality**: ~14.8ms (99x slower)
- **Compound indexes**: ~0.02ms (8x faster than single-field)
- **Range queries without index**: ~25ms (169x slower)
- **Partial index matching**: ~29ms (still faster than full scan)
- **Lean queries**: ~0.05ms (up to 150x faster for large result sets)
- **Pagination (skip/limit)**: ~0.23ms (very efficient)

**💡 Key Takeaway**: Indexes provide 10-300x speedup for equality queries! Always index fields used in WHERE clauses.
