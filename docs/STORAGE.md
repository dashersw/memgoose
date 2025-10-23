# Storage Backends Guide

Complete guide to storage strategies in memgoose.

## Table of Contents

- [Overview](#overview)
- [Memory Storage](#memory-storage)
- [File Storage](#file-storage)
- [SQLite Storage](#sqlite-storage)
- [WiredTiger Storage](#wiredtiger-storage)
- [Mixed Storage](#mixed-storage)
- [Switching Storage Backends](#switching-storage-backends)
- [Custom Storage Strategies](#custom-storage-strategies)
- [Comparison](#comparison)

---

## Overview

memgoose supports pluggable storage backends, allowing you to choose the right storage for your use case:

- **Memory** - Fast, ephemeral (default)
- **File** - Lightweight persistence with NDJSON + WAL
- **SQLite** - ACID-compliant relational database
- **WiredTiger** - High-performance embedded database (powers MongoDB)

### Storage Strategy Interface

All storage backends implement the same interface:

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

This means you can switch storage backends without changing your application code!

---

## Memory Storage

In-memory storage with no persistence. Data is lost when the process exits.

### Features

- ✅ Fastest performance
- ✅ Zero configuration
- ✅ No dependencies
- ✅ Perfect for testing
- ❌ No persistence

### Usage

Memory storage is the default—no configuration needed:

```typescript
import { model, Schema } from 'memgoose'

const User = model('User', userSchema)
```

Or explicitly configure:

```typescript
import { connect } from 'memgoose'

const db = connect({ storage: 'memory' })
const User = db.model('User', userSchema)
```

### Use Cases

- Unit and integration tests
- In-memory caching
- Temporary data
- Development without persistence
- Maximum performance scenarios

### Performance

Memory storage is the fastest option:

| Operation | Time (100k docs) |
| --------- | ---------------- |
| Insert    | ~50ms            |
| Find      | <1ms (indexed)   |
| Update    | <1ms (indexed)   |
| Delete    | <1ms (indexed)   |

---

## File Storage

File-based persistence using NDJSON (newline-delimited JSON) with write-ahead logging.

### Features

- ✅ Lightweight persistence
- ✅ Human-readable format
- ✅ Write-ahead log (WAL)
- ✅ Automatic compaction
- ✅ No dependencies
- ✅ Configurable write mode

### Architecture

```
data/
├── User.data.ndjson    # Main data file
└── User.wal.ndjson     # Write-ahead log
```

**Write-Ahead Log (WAL):**

1. New operations append to WAL
2. Periodically, WAL is compacted into main file
3. On startup, WAL is replayed to restore state

### Configuration

```typescript
import { connect } from 'memgoose'

const db = connect({
  storage: 'file',
  file: {
    dataPath: './data', // Directory for data files
    persistMode: 'debounced', // or 'immediate'
    debounceMs: 100 // Debounce delay (default: 100ms)
  }
})

const User = db.model('User', userSchema)
```

### Options

#### `dataPath` (required)

Directory where data files are stored:

```typescript
file: {
  dataPath: './data' // Creates User.data.ndjson and User.wal.ndjson in ./data/
}
```

#### `persistMode`

Controls when data is written to disk:

**`'debounced'` (default)** - Writes are debounced to reduce I/O:

```typescript
file: {
  dataPath: './data',
  persistMode: 'debounced',
  debounceMs: 100  // Wait 100ms after last write
}
```

Best for: High write frequency, batch operations

**`'immediate'`** - Every change is immediately persisted:

```typescript
file: {
  dataPath: './data',
  persistMode: 'immediate'
}
```

Best for: Critical data requiring immediate durability

#### `debounceMs`

Debounce delay in milliseconds (only for `persistMode: 'debounced'`):

```typescript
file: {
  dataPath: './data',
  persistMode: 'debounced',
  debounceMs: 500  // Wait 500ms after last write
}
```

### Compaction

WAL entries accumulate over time. When the WAL grows too large, it's automatically compacted:

```typescript
// Happens automatically when WAL exceeds threshold
// Old WAL entries are merged into main data file
```

### Manual Flush

Force pending writes to disk:

```typescript
await db.disconnect() // Flushes all pending writes
```

### Use Cases

- Simple persistence needs
- Configuration files
- Small to medium datasets
- Human-readable storage
- No external dependencies

### Performance

File storage is suitable for most applications:

| Operation | Time (10k docs) |
| --------- | --------------- |
| Insert    | ~500ms          |
| Find      | <1ms (indexed)  |
| Update    | ~50ms           |
| Delete    | ~10ms           |

### Examples

See [examples/file-storage-demo.ts](../examples/file-storage-demo.ts)

```bash
npm run example:file
```

---

## SQLite Storage

Persistent storage using SQLite with WAL mode for better concurrency.

### Features

- ✅ ACID transactions
- ✅ Persistent storage
- ✅ Native indexes
- ✅ Unique constraints at DB level
- ✅ WAL mode for concurrency
- ⚠️ Requires `better-sqlite3` peer dependency

### Installation

SQLite storage requires the `better-sqlite3` package:

```bash
npm install better-sqlite3
```

### Configuration

```typescript
import { connect } from 'memgoose'

const db = connect({
  storage: 'sqlite',
  sqlite: {
    dataPath: './data' // Directory for SQLite database files
  }
})

const User = db.model('User', userSchema)
// Data persists to ./data/User.db
```

### Architecture

Each model gets its own SQLite database file:

```
data/
├── User.db      # SQLite database for User model
├── Post.db      # SQLite database for Post model
└── Comment.db   # SQLite database for Comment model
```

**Database Schema:**

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE INDEX idx_field1 ON documents(json_extract(data, '$.field1'));
CREATE UNIQUE INDEX idx_unique_email ON documents(json_extract(data, '$.email'));
```

### Features in Detail

#### ACID Guarantees

SQLite provides full ACID compliance:

- **Atomicity**: All-or-nothing transactions
- **Consistency**: Data integrity maintained
- **Isolation**: Concurrent operations don't interfere
- **Durability**: Committed data survives crashes

#### Write-Ahead Logging (WAL)

WAL mode is automatically enabled for better concurrency:

```typescript
// Configured automatically
PRAGMA journal_mode = WAL;
```

Benefits:

- Readers don't block writers
- Writers don't block readers
- Better concurrency than rollback journal

#### Native Indexes

Indexes from your schema are translated to SQLite indexes:

```typescript
const userSchema = new Schema({
  email: { type: String, unique: true },
  name: String
})

userSchema.index('name')
userSchema.index(['city', 'age'])

// Creates SQLite indexes:
// CREATE UNIQUE INDEX ON documents(json_extract(data, '$.email'))
// CREATE INDEX ON documents(json_extract(data, '$.name'))
// CREATE INDEX ON documents(json_extract(data, '$.city'), json_extract(data, '$.age'))
```

#### Unique Constraints

Unique constraints are enforced at the database level:

```typescript
const userSchema = new Schema({
  email: { type: String, unique: true }
})

// Second insert with same email will fail
await User.create({ email: 'alice@example.com' })
await User.create({ email: 'alice@example.com' }) // Error!
```

### Transactions (Future)

While memgoose doesn't currently expose transactions in its API, SQLite operations are internally transactional.

### Backup

To backup your data:

```bash
# Stop application first
await db.disconnect()

# Copy database files
cp data/User.db backups/User.db
```

Online backup (without stopping application):

```bash
sqlite3 data/User.db ".backup backups/User.db"
```

### Use Cases

- Production applications
- Data requiring ACID guarantees
- Applications needing SQL queries (via better-sqlite3 directly)
- Small to medium datasets (<1GB)
- Single-server deployments

### Performance

SQLite provides excellent performance for most applications:

| Operation | Time (10k docs) |
| --------- | --------------- |
| Insert    | ~200ms          |
| Find      | <1ms (indexed)  |
| Update    | ~30ms           |
| Delete    | ~10ms           |

### Examples

See [examples/sqlite-storage-demo.ts](../examples/sqlite-storage-demo.ts)

```bash
npm run example:sqlite
```

---

## WiredTiger Storage

High-performance embedded database engine that powers MongoDB.

### Features

- ✅ ACID transactions
- ✅ High write throughput
- ✅ MVCC (Multi-Version Concurrency Control)
- ✅ Built-in compression
- ✅ WAL for crash recovery
- ✅ Production-ready (battle-tested in MongoDB)
- ⚠️ Requires separate package installation (`memgoose-wiredtiger`)
- ⚠️ Package includes native bindings (requires build tools)

### Installation

WiredTiger support is provided as a separate package:

```bash
npm install memgoose-wiredtiger
```

**Build Requirements:**

The `memgoose-wiredtiger` package includes native bindings that require build tools on your system:

- **Node.js**: 16+ with N-API support
- **C++ compiler**: gcc, clang, or MSVC
- **Python**: 3.x (for node-gyp)
- **Build tools**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential`, `autoconf`, `libtool`
  - **Windows**: Visual Studio Build Tools

The native bindings are built automatically during package installation. If the build fails, you can use other storage backends (memory, file, sqlite) instead.

### Configuration

```typescript
import { connect } from 'memgoose'

const db = connect({
  storage: 'wiredtiger',
  wiredtiger: {
    dataPath: './data/wiredtiger',
    cacheSize: '500M', // Optional: default is 500M
    compressor: 'zstd' // Optional: compression algorithm
  }
})

const User = db.model('User', userSchema)
```

### Options

#### `dataPath` (required)

Directory where WiredTiger stores data:

```typescript
wiredtiger: {
  dataPath: './data/wiredtiger'
}
```

Creates directory structure:

```
data/wiredtiger/
├── User/
│   ├── WiredTiger
│   ├── WiredTiger.basecfg
│   ├── WiredTiger.lock
│   ├── WiredTiger.turtle
│   ├── WiredTiger.wt
│   └── User_docs.wt
└── Post/
    └── ...
```

#### `cacheSize`

Memory allocated for WiredTiger cache:

```typescript
wiredtiger: {
  dataPath: './data',
  cacheSize: '1G'  // 1 gigabyte cache
}
```

**Formats:**

- `'500M'` - 500 megabytes (default)
- `'1G'` - 1 gigabyte
- `'2G'` - 2 gigabytes

**Recommendations:**

- Development: 500M
- Production (small): 1G
- Production (large): 2G+

#### `compressor`

Compression algorithm for data storage:

```typescript
wiredtiger: {
  dataPath: './data',
  compressor: 'zstd'  // zstd, lz4, snappy, zlib, or none
}
```

**Options:**

- `'snappy'` - Fast, moderate compression (recommended default)
- `'zstd'` - Best compression ratio (15.4% space saved)
- `'lz4'` - Fastest read performance
- `'zlib'` - Good compression, similar to zstd
- `'none'` - No compression (use only if CPU is bottleneck)

**Compression Comparison (100,000 documents):**

| Algorithm | Compression Ratio | Insert Speed | Read Speed  | Space Saved |
| --------- | ----------------- | ------------ | ----------- | ----------- |
| zstd      | 1.18x             | 5,444 docs/s | 4,166,667/s | 15.4%       |
| lz4       | 1.18x             | 5,190 docs/s | 5,882,353/s | 14.9%       |
| snappy    | 1.10x             | 5,249 docs/s | 3,571,429/s | 9.3%        |
| zlib      | 1.18x             | 5,202 docs/s | 4,545,455/s | 15.3%       |
| none      | 0.55x             | 5,697 docs/s | 5,555,556/s | -82.5%      |

_Benchmarked on Apple M4 Max with 100,000 documents. Compression ratios vary with data characteristics._

**Recommendations:**

- **SNAPPY**: Best balance of speed and compression (recommended for most use cases)
- **LZ4**: Maximum read throughput when performance is critical
- **ZSTD**: Best compression ratio when storage space is limited
- **ZLIB**: Similar compression to ZSTD with slightly different performance trade-offs
- **NONE**: WiredTiger metadata overhead can increase storage; only use if CPU is the bottleneck

**Run the compression comparison:**

```bash
npm run example:compression
```

See [examples/compression-comparison.ts](../examples/compression-comparison.ts) for the complete benchmark code.

### Architecture

WiredTiger uses:

- **MVCC** - Multiple concurrent readers without blocking
- **WAL** - Write-ahead logging for durability
- **Checkpoints** - Periodic snapshots for recovery
- **Compression** - Transparent data compression
- **Lock-free** - Optimistic concurrency control

### Advanced Configuration

For advanced WiredTiger configuration, see [WIREDTIGER.md](WIREDTIGER.md).

### Backup

**Cold backup** (database stopped):

```bash
await db.disconnect()
cp -r data/wiredtiger/User backups/
```

**Hot backup** (database running):

WiredTiger supports online backups via its API (advanced usage).

### Troubleshooting

#### Build fails during installation

Make sure you have the required build tools installed:

```bash
# macOS
xcode-select --install

# Linux (Debian/Ubuntu)
sudo apt-get install build-essential autoconf libtool

# Then retry
npm install memgoose-wiredtiger
```

#### Runtime error: "WiredTiger native bindings not available"

The `memgoose-wiredtiger` package is not installed or wasn't built successfully. Either:

1. Install the package: `npm install memgoose-wiredtiger`
2. Use a different storage backend: `storage: 'sqlite'` or `storage: 'file'`

#### Database won't open: "Resource busy"

Another process has the database open. WiredTiger uses file locks.

```typescript
// Make sure to disconnect
await db.disconnect()
```

### Use Cases

- Production applications
- High write throughput requirements
- Large datasets (>1GB)
- Concurrent read/write access
- Need for ACID guarantees
- MongoDB-compatible storage

### Performance

WiredTiger excels with large datasets and high write throughput:

| Operation | Time (10k docs) |
| --------- | --------------- |
| Insert    | ~150ms          |
| Find      | <1ms (indexed)  |
| Update    | ~20ms           |
| Delete    | <1ms            |

**Bulk insert (100k docs):** ~1.5 seconds

### Examples

See [examples/wiredtiger-storage-demo.ts](../examples/wiredtiger-storage-demo.ts)

```bash
npm run example:wiredtiger
```

For detailed WiredTiger documentation, see [WIREDTIGER.md](WIREDTIGER.md).

---

## Mixed Storage

Different models can use different storage backends.

### Per-Database Storage

```typescript
import { createDatabase } from 'memgoose'

// In-memory cache
const cacheDb = createDatabase({ storage: 'memory' })
const Cache = cacheDb.model('Cache', cacheSchema)

// Persistent user data
const userDb = createDatabase({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})
const User = userDb.model('User', userSchema)

// High-performance analytics
const analyticsDb = createDatabase({
  storage: 'wiredtiger',
  wiredtiger: { dataPath: './data/wt', cacheSize: '2G' }
})
const Event = analyticsDb.model('Event', eventSchema)
```

### Use Cases

**Example 1: Cache + Persistent Storage**

```typescript
// Hot cache in memory
const cacheDb = createDatabase({ storage: 'memory' })
const SessionCache = cacheDb.model('Session', sessionSchema)

// User data in SQLite
const mainDb = createDatabase({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})
const User = mainDb.model('User', userSchema)
const Post = mainDb.model('Post', postSchema)
```

**Example 2: Different Performance Profiles**

```typescript
// Read-heavy: WiredTiger
const wtDb = createDatabase({
  storage: 'wiredtiger',
  wiredtiger: { dataPath: './data/wt' }
})
const Product = wtDb.model('Product', productSchema)

// Write-heavy logs: File
const logDb = createDatabase({
  storage: 'file',
  file: { dataPath: './logs', persistMode: 'debounced' }
})
const AuditLog = logDb.model('AuditLog', auditSchema)

// Temp data: Memory
const tempDb = createDatabase({ storage: 'memory' })
const TempData = tempDb.model('TempData', tempSchema)
```

### Examples

See [examples/mixed-storage-demo.ts](../examples/mixed-storage-demo.ts)

---

## Switching Storage Backends

Changing storage backends is straightforward:

### From Memory to File

```typescript
// Before (memory)
const User = model('User', userSchema)

// After (file)
const db = connect({
  storage: 'file',
  file: { dataPath: './data' }
})
const User = db.model('User', userSchema)
```

### From File to SQLite

```typescript
// Before (file)
connect({
  storage: 'file',
  file: { dataPath: './data' }
})

// After (SQLite)
connect({
  storage: 'sqlite',
  sqlite: { dataPath: './data' }
})
```

### Migration Script

```typescript
// migration.ts
import { createDatabase } from 'memgoose'

async function migrate() {
  // Source database (file)
  const sourceDb = createDatabase({
    storage: 'file',
    file: { dataPath: './data-old' }
  })
  const SourceUser = sourceDb.model('User', userSchema)

  // Target database (SQLite)
  const targetDb = createDatabase({
    storage: 'sqlite',
    sqlite: { dataPath: './data-new' }
  })
  const TargetUser = targetDb.model('User', userSchema)

  // Migrate data
  const users = await SourceUser.find()
  await TargetUser.insertMany(users)

  console.log(`Migrated ${users.length} users`)

  // Cleanup
  await sourceDb.disconnect()
  await targetDb.disconnect()
}

migrate()
```

---

## Custom Storage Strategies

Implement your own storage backend.

### Create Custom Strategy

```typescript
import { StorageStrategy } from 'memgoose'

class RedisStorageStrategy<T> implements StorageStrategy<T> {
  private client: RedisClient

  constructor(
    private redisUrl: string,
    private keyPrefix: string
  ) {}

  async initialize(): Promise<void> {
    this.client = await createRedisClient(this.redisUrl)
  }

  async getAll(): Promise<T[]> {
    const keys = await this.client.keys(`${this.keyPrefix}:*`)
    const values = await Promise.all(keys.map(key => this.client.get(key)))
    return values.map(v => JSON.parse(v))
  }

  async insert(doc: T): Promise<void> {
    const id = (doc as any)._id
    await this.client.set(`${this.keyPrefix}:${id}`, JSON.stringify(doc))
  }

  async update(id: any, doc: T): Promise<void> {
    await this.client.set(`${this.keyPrefix}:${id}`, JSON.stringify(doc))
  }

  async delete(id: any): Promise<void> {
    await this.client.del(`${this.keyPrefix}:${id}`)
  }

  async deleteMany(ids: any[]): Promise<void> {
    const keys = ids.map(id => `${this.keyPrefix}:${id}`)
    await this.client.del(...keys)
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys(`${this.keyPrefix}:*`)
    if (keys.length > 0) {
      await this.client.del(...keys)
    }
  }

  close(): void {
    this.client.quit()
  }
}
```

### Use Custom Strategy

```typescript
import { Model } from 'memgoose'

const storage = new RedisStorageStrategy<User>('redis://localhost:6379', 'users')

const User = new Model(userSchema, undefined, storage)

await User.create({ name: 'Alice' })
```

---

## Comparison

### Feature Matrix

| Feature        | Memory    | File    | SQLite         | WiredTiger  |
| -------------- | --------- | ------- | -------------- | ----------- |
| Persistence    | ❌        | ✅      | ✅             | ✅          |
| ACID           | ❌        | Partial | ✅             | ✅          |
| Concurrency    | Good      | Fair    | Good           | Excellent   |
| Performance    | Excellent | Good    | Very Good      | Excellent   |
| Compression    | ❌        | ❌      | ❌             | ✅          |
| Native Build   | ❌        | ❌      | ⚠️             | ✅          |
| Dependencies   | None      | None    | better-sqlite3 | Build tools |
| Human-Readable | N/A       | ✅      | ❌             | ❌          |

### Performance Comparison

**Insert 10k documents (Apple M4 Max):**

| Storage    | Time  |
| ---------- | ----- |
| Memory     | 28ms  |
| WiredTiger | 66ms  |
| SQLite     | 87ms  |
| File       | 454ms |

**Indexed Query (1 of 100k):**

| Storage    | Time   |
| ---------- | ------ |
| Memory     | 0.07ms |
| File       | 0.16ms |
| SQLite     | 0.23ms |
| WiredTiger | 0.16ms |

**Bulk Insert (100k documents):**

| Storage    | Time  |
| ---------- | ----- |
| Memory     | 256ms |
| WiredTiger | 501ms |
| SQLite     | 759ms |

### When to Use Each

**Memory:**

- ✅ Testing
- ✅ Caching
- ✅ Temporary data
- ✅ Development
- ❌ Production data

**File:**

- ✅ Simple persistence
- ✅ Small datasets
- ✅ Configuration files
- ✅ No dependencies
- ❌ High concurrency
- ❌ Large datasets

**SQLite:**

- ✅ Production applications
- ✅ ACID requirements
- ✅ SQL compatibility
- ✅ Small to medium datasets
- ❌ Very high write throughput
- ❌ Distributed systems

**WiredTiger:**

- ✅ Production applications
- ✅ High write throughput
- ✅ Large datasets
- ✅ Concurrent access
- ✅ Compression needed
- ❌ Simple deployments
- ❌ Limited build tools

### Decision Tree

```
Need persistence?
├─ No  → Memory
└─ Yes → ACID required?
    ├─ No  → File
    └─ Yes → High write throughput?
        ├─ No  → SQLite
        └─ Yes → WiredTiger
```

---

## Best Practices

### 1. Choose the Right Storage

Match storage to your requirements:

- Testing → Memory
- Simple apps → File or SQLite
- Production → SQLite or WiredTiger

### 2. Always Disconnect

Ensure clean shutdown:

```typescript
process.on('SIGINT', async () => {
  await db.disconnect()
  process.exit(0)
})
```

### 3. Configure Cache Properly

For WiredTiger:

```typescript
wiredtiger: {
  cacheSize: '1G' // Adjust based on available RAM
}
```

### 4. Use Indexes

All storage backends benefit from indexes:

```typescript
userSchema.index('email')
userSchema.index(['city', 'age'])
```

### 5. Batch Operations

Use `insertMany` instead of multiple `create()`:

```typescript
// Good
await User.insertMany(arrayOfUsers)

// Bad
for (const user of arrayOfUsers) {
  await User.create(user)
}
```

### 6. Handle Errors

```typescript
try {
  await User.create({ email: 'duplicate@example.com' })
} catch (err) {
  console.error('Insert failed:', err.message)
}
```

### 7. Monitor Performance

```typescript
console.time('operation')
await User.insertMany(largeArray)
console.timeEnd('operation')
```
