# WiredTiger Storage Backend

Memgoose supports **WiredTiger** as a storage backend via the separate **`memgoose-wiredtiger`** package. WiredTiger is a high-performance embedded database engine that powers MongoDB. It provides:

- **ACID transactions** - Full transactional support with durability guarantees
- **High performance** - Optimized for both read and write-heavy workloads
- **Efficient storage** - Built-in compression and space reclamation
- **Scalability** - MVCC (Multi-Version Concurrency Control) for high concurrency
- **WAL logging** - Write-Ahead Logging for crash recovery

## Installation

WiredTiger support is provided as a separate npm package:

```bash
npm install memgoose-wiredtiger
```

### Prerequisites

The `memgoose-wiredtiger` package includes native bindings that require build tools on your system:

- **Node.js**: 16+ with N-API support
- **C++ compiler**: gcc, clang, or MSVC
- **Python**: 3.x (for node-gyp)
- **Build tools**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential`, `autoconf`, `libtool`
  - **Windows**: Visual Studio Build Tools

The native bindings are built automatically during `npm install memgoose-wiredtiger`. If the build fails, you can use other storage backends (memory, file, sqlite) instead.

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
| Insert (10k docs)  | 28ms   | 454ms  | 87ms   | 66ms       |
| Query (indexed)    | 0.07ms | 0.16ms | 0.23ms | 0.16ms     |
| Bulk insert (100k) | 256ms  | N/A    | 759ms  | 501ms      |

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

### Build fails during installation

Make sure you have the required build tools installed:

```bash
# macOS
xcode-select --install

# Linux (Debian/Ubuntu)
sudo apt-get install build-essential autoconf libtool

# Then retry installation
npm install memgoose-wiredtiger
```

### Runtime error: "WiredTiger native bindings not available"

The `memgoose-wiredtiger` package is not installed or wasn't built successfully. Options:

1. Install the package: `npm install memgoose-wiredtiger`
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

Found a bug or want to improve the WiredTiger integration? The `memgoose-wiredtiger` package is maintained separately:

- Repository: [memgoose-wiredtiger on npm](https://www.npmjs.com/package/memgoose-wiredtiger)
- Integration in memgoose: `src/storage/wiredtiger-strategy.ts`

## Package Information

The `memgoose-wiredtiger` package provides:

- WiredTiger native bindings compiled for your platform
- C++ N-API bindings that wrap the WiredTiger C API
- Pre-built binaries for common platforms (when available)
- Automatic compilation fallback when pre-built binaries are unavailable

## License

The `memgoose-wiredtiger` package includes WiredTiger, which is licensed under GPL v2 with linking exception, allowing commercial use.

The memgoose core library is MIT licensed.
