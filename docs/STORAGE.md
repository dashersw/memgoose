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

Memory storage provides the fastest possible performance:

- **Insert**: ~366,667 docs/sec
- **Query**: ~0.07ms for indexed lookups
- **Memory usage**: ~1.7KB per document

---

## File Storage

Lightweight persistence using NDJSON files with Write-Ahead Logging (WAL).

### Features

- ✅ Human-readable files
- ✅ No dependencies
- ✅ Simple backup (just copy files)
- ✅ Cross-platform
- ❌ No ACID guarantees
- ❌ Slower than SQLite

### Architecture

File storage uses a simple but effective architecture:

```
data/
├── User.ndjson          # Main data file
├── User.wal             # Write-ahead log
└── User.compacted.ndjson # Compressed version
```

### Configuration

```typescript
import { connect } from 'memgoose'

const db = connect({
  storage: 'file',
  file: {
    dataPath: './data', // Directory for data files
    persistMode: 'immediate', // 'immediate' | 'debounced'
    debounceMs: 1000 // Debounce delay for 'debounced' mode
  }
})
```

### Options

#### `dataPath` (required)

Directory where data files will be stored.

#### `persistMode`

- `'immediate'` - Write to disk immediately (default)
- `'debounced'` - Batch writes with debouncing

#### `debounceMs`

Debounce delay in milliseconds for batched writes (default: 1000ms).

### Compaction

File storage automatically compacts data files to remove deleted records:

```typescript
// Manual compaction
await db.compact('User')
```

### Use Cases

- Simple applications
- Development and prototyping
- Human-readable data requirements
- Cross-platform compatibility
- Backup-friendly storage

### Performance

File storage performance characteristics:

- **Insert**: ~22,026 docs/sec
- **Query**: ~0.16ms for indexed lookups
- **Disk usage**: Larger than SQLite due to text format

---

## SQLite Storage

ACID-compliant persistent storage using SQLite.

### Features

- ✅ ACID transactions
- ✅ Mature and stable
- ✅ Cross-platform
- ✅ Small footprint
- ✅ Excellent performance
- ❌ Requires better-sqlite3 dependency

### Installation

```bash
npm install better-sqlite3
```

### Configuration

```typescript
import { connect } from 'memgoose'

const db = connect({
  storage: 'sqlite',
  sqlite: {
    dataPath: './data', // Directory for .db files
    walMode: true, // Enable WAL mode (recommended)
    synchronous: 'NORMAL' // Sync mode: 'OFF' | 'NORMAL' | 'FULL'
  }
})
```

### Architecture

SQLite storage creates one database file per model:

```
data/
├── User.db
├── Product.db
└── Order.db
```

Each database uses SQLite's Write-Ahead Logging (WAL) mode for better concurrency.

### Features in Detail

#### ACID Guarantees

SQLite provides full ACID compliance:

- **Atomicity**: All operations succeed or fail together
- **Consistency**: Database remains in valid state
- **Isolation**: Concurrent operations don't interfere
- **Durability**: Committed data survives crashes

#### Write-Ahead Logging (WAL)

WAL mode provides:

- Better concurrency (readers don't block writers)
- Faster writes
- Crash recovery
- Hot backups

#### Native Indexes

SQLite storage leverages SQLite's native indexing:

- B-tree indexes for fast lookups
- Compound indexes for multi-field queries
- Automatic index optimization

### Use Cases

- Production applications
- ACID compliance requirements
- Cross-platform deployment
- Simple backup and restore
- Development with persistence

### Performance

SQLite storage performance:

- **Insert**: ~114,943 docs/sec
- **Query**: ~0.23ms for indexed lookups
- **Disk usage**: Compact binary format

---

## WiredTiger Storage

High-performance embedded database engine that powers MongoDB.

### Features

- ✅ Enterprise-grade performance
- ✅ Compression support
- ✅ ACID transactions
- ✅ High write throughput
- ✅ MVCC (Multi-Version Concurrency Control)
- ✅ Built-in compression
- ✅ WAL for crash recovery
- ✅ Production-ready (battle-tested in MongoDB)
- ⚠️ Requires separate package installation (`memgoose-wiredtiger`)
- ⚠️ Package includes native bindings (requires build tools)

### Installation

```bash
npm install memgoose-wiredtiger
```

**Requirements:**

- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Linux: `build-essential`, `autoconf`, `libtool`
- Windows: Visual Studio Build Tools

### Configuration

```typescript
import { connect } from 'memgoose'

const db = connect({
  storage: 'wiredtiger',
  wiredtiger: {
    dataPath: './data', // Directory for data files
    cacheSize: '1G', // Cache size (default: 500M)
    compressor: 'snappy' // Compression: 'none' | 'snappy' | 'zlib'
  }
})
```

### Options

#### `dataPath` (required)

Directory where WiredTiger will store data files.

#### `cacheSize`

Memory cache size. Supports formats like:

- `'500M'` - 500 megabytes
- `'1G'` - 1 gigabyte
- `'2G'` - 2 gigabytes

#### `compressor`

Compression algorithm:

- `'none'` - No compression (fastest)
- `'snappy'` - Fast compression (recommended)
- `'zlib'` - High compression (slower)

### Use Cases

- High-performance applications
- Large datasets (>100k documents)
- High write throughput requirements
- Enterprise applications
- Analytics and logging

### Performance

WiredTiger storage performance:

- **Insert**: ~151,515 docs/sec
- **Query**: ~0.16ms for indexed lookups
- **Compression**: Up to 70% space savings

For detailed WiredTiger configuration, troubleshooting, and advanced usage, see [WIREDTIGER.md](WIREDTIGER.md).

---

## Mixed Storage

Use different storage backends for different models based on their requirements.

### Per-Database Storage

```typescript
import { connect } from 'memgoose'

// Cache in memory for speed
const cacheDb = connect({ storage: 'memory' })
const Cache = cacheDb.model('Cache', cacheSchema)

// Main data in SQLite for persistence
const mainDb = connect({ storage: 'sqlite', path: './data.db' })
const User = mainDb.model('User', userSchema)

// Analytics in WiredTiger for performance
const analyticsDb = connect({ storage: 'wiredtiger', path: './analytics' })
const Event = analyticsDb.model('Event', eventSchema)
```

### Use Cases

- **Memory**: Session data, temporary caches
- **SQLite**: User data, application state
- **WiredTiger**: Analytics, logs, high-volume data
- **File**: Configuration, simple data

### Examples

```typescript
// Session management
const sessionDb = connect({ storage: 'memory' })
const Session = sessionDb.model('Session', sessionSchema)

// User management
const userDb = connect({ storage: 'sqlite', path: './users.db' })
const User = userDb.model('User', userSchema)

// Event logging
const eventDb = connect({ storage: 'wiredtiger', path: './events' })
const Event = eventDb.model('Event', eventSchema)
```

---

## Switching Storage Backends

You can easily migrate between storage backends since they all implement the same interface.

### From Memory to File

```typescript
// Export from memory
const users = await User.find()

// Import to file storage
const fileDb = connect({ storage: 'file', path: './data' })
const FileUser = fileDb.model('User', userSchema)
await FileUser.insertMany(users)
```

### From File to SQLite

```typescript
// Export from file
const users = await User.find()

// Import to SQLite
const sqliteDb = connect({ storage: 'sqlite', path: './data.db' })
const SqliteUser = sqliteDb.model('User', userSchema)
await SqliteUser.insertMany(users)
```

### Migration Script

```typescript
async function migrateStorage(fromStorage: string, toStorage: string) {
  // Connect to source
  const sourceDb = connect({ storage: fromStorage, path: './source' })
  const SourceModel = sourceDb.model('User', userSchema)

  // Connect to destination
  const destDb = connect({ storage: toStorage, path: './dest' })
  const DestModel = destDb.model('User', userSchema)

  // Migrate data
  const documents = await SourceModel.find()
  await DestModel.insertMany(documents)

  // Cleanup
  await sourceDb.disconnect()
  await destDb.disconnect()
}
```

---

## Custom Storage Strategies

You can implement custom storage strategies by implementing the `StorageStrategy` interface.

### Create Custom Strategy

```typescript
import { StorageStrategy } from 'memgoose'

class RedisStorageStrategy<T> implements StorageStrategy<T> {
  constructor(
    private redis: Redis,
    private key: string
  ) {}

  async initialize(): Promise<void> {
    // Initialize Redis connection
  }

  async getAll(): Promise<T[]> {
    const data = await this.redis.get(this.key)
    return data ? JSON.parse(data) : []
  }

  async insert(doc: T): Promise<void> {
    const docs = await this.getAll()
    docs.push(doc)
    await this.redis.set(this.key, JSON.stringify(docs))
  }

  // ... implement other methods
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

| Feature        | Memory | File | SQLite         | WiredTiger          |
| -------------- | ------ | ---- | -------------- | ------------------- |
| Persistence    | ❌     | ✅   | ✅             | ✅                  |
| ACID           | ❌     | ❌   | ✅             | ✅                  |
| Compression    | ❌     | ❌   | ❌             | ✅                  |
| Native Build   | ❌     | ❌   | ❌             | ✅                  |
| Dependencies   | None   | None | better-sqlite3 | memgoose-wiredtiger |
| Human-Readable | N/A    | ✅   | ❌             | ❌                  |

### Performance Comparison

**Insert 10k documents (Apple M4 Max):**

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

### When to Use Each

**Memory Storage:**

- Testing and development
- Temporary data
- Maximum performance
- No persistence needed

**File Storage:**

- Simple applications
- Human-readable data
- Cross-platform compatibility
- No ACID requirements

**SQLite Storage:**

- Production applications
- ACID compliance needed
- Cross-platform deployment
- Balanced performance

**WiredTiger Storage:**

- High-performance applications
- Large datasets
- Enterprise requirements
- Maximum persistent performance

### Decision Tree

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

## Best Practices

### 1. Choose the Right Storage

- Start with Memory for development
- Use SQLite for most production apps
- Upgrade to WiredTiger for high performance

### 2. Always Disconnect

```typescript
process.on('SIGINT', async () => {
  await db.disconnect()
  process.exit(0)
})
```

### 3. Configure Cache Properly

```typescript
// WiredTiger cache sizing
const db = connect({
  storage: 'wiredtiger',
  wiredtiger: { cacheSize: '1G' } // Adjust based on available RAM
})
```

### 4. Use Indexes

```typescript
// Add indexes for frequently queried fields
userSchema.index('email')
userSchema.index(['city', 'age']) // Compound index
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
// Use insertMany for bulk operations
await User.insertMany(users) // Better than multiple create() calls
```

### 6. Monitor Performance

```typescript
// Use lean queries for better performance
const users = await User.find({}, { lean: true })
```
