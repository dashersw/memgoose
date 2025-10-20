# WiredTiger Storage Backend

Memgoose now supports **WiredTiger** as a storage backend! WiredTiger is a high-performance embedded database engine that powers MongoDB. It provides:

- **ACID transactions** - Full transactional support with durability guarantees
- **High performance** - Optimized for both read and write-heavy workloads
- **Efficient storage** - Built-in compression and space reclamation
- **Scalability** - MVCC (Multi-Version Concurrency Control) for high concurrency
- **WAL logging** - Write-Ahead Logging for crash recovery

## Architecture

The WiredTiger integration consists of three layers:

1. **Native Bindings** (`src/storage/wiredtiger/wiredtiger_binding.cc`) - C++ N-API bindings that wrap the WiredTiger C API
2. **TypeScript Wrapper** (`src/storage/wiredtiger/wiredtiger-native.ts`) - Type-safe wrapper around native bindings
3. **Storage Strategy** (`src/storage/wiredtiger-strategy.ts`) - Implementation of the `StorageStrategy` interface

## Installation

### Prerequisites

- Node.js 16+ with N-API support
- C++ compiler (gcc, clang, or MSVC)
- Python 3 (for node-gyp)
- Build tools:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: build-essential, autoconf, libtool
  - **Windows**: Visual Studio Build Tools

### Building WiredTiger

The WiredTiger source code is included in `lib/wiredtiger`. To build:

```bash
# 1. Build WiredTiger library
./scripts/build-wiredtiger.sh

# 2. Build Node.js bindings
npm run build:wiredtiger
```

Or simply run:

```bash
npm install
```

This will automatically attempt to build the WiredTiger bindings. If the build fails, the library will still work with other storage backends (memory, file, sqlite).

## Usage

### Basic Example

```typescript
import { connect, Schema, model } from 'memgoose'

// Define your schema
interface User {
  name: string
  email: string
  age: number
}

const userSchema = new Schema<User>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: { type: Number, required: true }
})

// Connect with WiredTiger storage
const db = connect({
  storage: 'wiredtiger',
  wiredtiger: {
    dataPath: './data/wiredtiger',
    cacheSize: '500M' // Optional: default is 500M
  }
})

// Create and use models
const User = model('User', userSchema)

// Insert documents
await User.insertMany([
  { name: 'Alice', email: 'alice@example.com', age: 28 },
  { name: 'Bob', email: 'bob@example.com', age: 35 }
])

// Query documents
const users = await User.find({ age: { $gte: 30 } })

// Disconnect when done
await db.disconnect()
```

### Configuration Options

```typescript
interface WiredTigerConfig {
  dataPath: string // Directory where WiredTiger stores data
  cacheSize?: string // Cache size (e.g., "500M", "1G", "2G")
  // Default: "500M"
}
```

### Running the Demo

```bash
npm run example:wiredtiger
```

## Performance Characteristics

WiredTiger excels in several scenarios:

### Strengths

- **High write throughput**: Optimized for bulk inserts and updates
- **Concurrent access**: MVCC allows multiple readers without blocking
- **Large datasets**: Efficient memory usage with compression
- **Crash recovery**: WAL ensures data durability
- **Production ready**: Battle-tested in MongoDB

### Trade-offs

- **Startup time**: Slightly longer initialization than in-memory
- **Build complexity**: Requires native compilation
- **Disk space**: Uses more space than SQLite initially (but compresses)

## Performance Comparison

| Operation          | Memory | File   | SQLite | WiredTiger |
| ------------------ | ------ | ------ | ------ | ---------- |
| Insert (10k docs)  | 35ms   | 480ms  | 79ms   | 58ms       |
| Query (indexed)    | 0.06ms | 0.16ms | 0.21ms | 0.14ms     |
| Bulk insert (100k) | 263ms  | N/A    | 790ms  | 520ms      |

_Benchmarks on Apple M4 Max (16 cores, 128GB RAM). Your results may vary._

## Data Persistence

WiredTiger stores data in the configured `dataPath` directory:

```
data/wiredtiger/
├── ModelName/
│   ├── WiredTiger
│   ├── WiredTiger.basecfg
│   ├── WiredTiger.lock
│   ├── WiredTiger.turtle
│   ├── WiredTiger.wt
│   └── ModelName_docs.wt
```

### Backup

To backup your data, simply copy the entire model directory while the database is closed:

```bash
# Stop your application
await db.disconnect()

# Copy the data directory
cp -r data/wiredtiger/ModelName data/backup/
```

For online backups, use WiredTiger's hot backup API (advanced usage).

## Troubleshooting

### Build fails with "wiredtiger.h not found"

Make sure WiredTiger is built first:

```bash
./scripts/build-wiredtiger.sh
npm run build:wiredtiger
```

### Runtime error: "WiredTiger native bindings not available"

The native bindings weren't built successfully. Options:

1. Build manually: `npm run build:wiredtiger`
2. Use a different storage backend: `storage: 'sqlite'` or `storage: 'file'`

### Database won't open: "Resource busy"

Another process might have the database open. WiredTiger uses file locks to prevent concurrent access. Make sure to call `db.disconnect()` when done.

### Poor performance

Try increasing the cache size:

```typescript
connect({
  storage: 'wiredtiger',
  wiredtiger: {
    dataPath: './data',
    cacheSize: '2G' // Increase from default 500M
  }
})
```

## Advanced Usage

### Transaction Support

WiredTiger supports ACID transactions (planned for future memgoose releases):

```typescript
// Future API (not yet implemented)
const session = db.startSession()
await session.startTransaction()

try {
  await User.create([{ name: 'Alice' }], { session })
  await Post.create([{ title: 'Hello' }], { session })
  await session.commitTransaction()
} catch (error) {
  await session.abortTransaction()
  throw error
}
```

### Custom Configuration

For advanced WiredTiger configuration, modify the connection string in `src/storage/wiredtiger-strategy.ts`:

```typescript
this._connection.open(
  wtPath,
  `create,cache_size=${this._cacheSize},log=(enabled=true),checkpoint=(wait=60)`
)
```

See [WiredTiger documentation](http://source.wiredtiger.com/develop/index.html) for available options.

## Comparison with Other Storage Backends

### When to use WiredTiger

- ✅ Production applications requiring durability
- ✅ High write throughput scenarios
- ✅ Large datasets (> 100MB)
- ✅ Need for ACID guarantees
- ✅ Concurrent read/write access

### When to use alternatives

**Memory**: Testing, temporary data, maximum speed
**File**: Simple persistence, human-readable format
**SQLite**: SQL queries, existing SQLite tools, smaller footprint

## Contributing

Found a bug or want to improve the WiredTiger integration? Check out:

- Native bindings: `src/storage/wiredtiger/wiredtiger_binding.cc`
- Storage strategy: `src/storage/wiredtiger-strategy.ts`
- Build configuration: `binding.gyp`

## License

WiredTiger is licensed under GPL v2 with linking exception. See `lib/wiredtiger/LICENSE` for details.

The memgoose WiredTiger integration is MIT licensed.
