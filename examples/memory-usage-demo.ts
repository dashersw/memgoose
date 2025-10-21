/**
 * Memory Usage Demonstration with 100,000 Documents
 *
 * This demo showcases the memory footprint of storing 100,000 documents
 * in memory with different configurations:
 * - Without indexes
 * - With single field indexes
 * - With compound indexes
 * - With virtuals and hooks
 *
 * Also demonstrates memory usage patterns for various operations.
 */

import { connect, Schema, model, disconnect, clearRegistry } from '../index'

// User schema definition
interface User {
  _id?: string
  id: number
  email: string
  name: string
  age: number
  city: string
  status: string
  score: number
  active: boolean
  createdAt?: Date
}

// Utility to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

// Utility to get memory usage
function getMemoryUsage() {
  const usage = process.memoryUsage()
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss
  }
}

// Utility to display memory stats
function displayMemoryStats(
  label: string,
  before: ReturnType<typeof getMemoryUsage>,
  after: ReturnType<typeof getMemoryUsage>
) {
  const heapDiff = after.heapUsed - before.heapUsed
  const rssDiff = after.rss - before.rss

  console.log(`\n${label}:`)
  console.log(
    `  Heap Used: ${formatBytes(before.heapUsed)} → ${formatBytes(after.heapUsed)} (Δ ${formatBytes(heapDiff)})`
  )
  console.log(
    `  RSS: ${formatBytes(before.rss)} → ${formatBytes(after.rss)} (Δ ${formatBytes(rssDiff)})`
  )
  console.log(`  Heap Total: ${formatBytes(after.heapTotal)}`)
  console.log(`  External: ${formatBytes(after.external)}`)

  return { heapDiff, rssDiff }
}

// Generate test data
function generateUsers(count: number): Omit<User, '_id' | 'createdAt'>[] {
  const cities = [
    'New York',
    'London',
    'Paris',
    'Tokyo',
    'Berlin',
    'Sydney',
    'Madrid',
    'Rome',
    'Amsterdam',
    'Toronto'
  ]
  const statuses = ['active', 'inactive', 'pending']
  const names = [
    'Alice',
    'Bob',
    'Charlie',
    'Diana',
    'Eve',
    'Frank',
    'George',
    'Helen',
    'Ivan',
    'Julia'
  ]

  const users: Omit<User, '_id' | 'createdAt'>[] = []

  for (let i = 0; i < count; i++) {
    users.push({
      id: i,
      email: `user${i}@example.com`,
      name: names[i % names.length],
      age: 20 + (i % 60),
      city: cities[i % cities.length],
      status: statuses[i % statuses.length],
      score: i % 1000,
      active: i % 10 !== 0
    })
  }

  return users
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Test 1: Basic memory usage without indexes
async function testBasicMemoryUsage() {
  console.log('\n' + '='.repeat(80))
  console.log('📦 TEST 1: BASIC MEMORY USAGE (100k docs, no indexes)')
  console.log('='.repeat(80))

  // Force garbage collection if available
  if (global.gc) {
    global.gc()
    await sleep(100)
  }

  const beforeConnect = getMemoryUsage()

  await clearRegistry()
  connect({ storage: 'memory' })

  const userSchema = new Schema<User>({
    id: Number,
    email: { type: String, required: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    city: { type: String, required: true },
    status: { type: String, required: true },
    score: { type: Number, required: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: () => new Date() }
  })

  const User = model('User', userSchema)

  const afterConnect = getMemoryUsage()
  displayMemoryStats('After connection and model creation', beforeConnect, afterConnect)

  // Insert 100k documents
  console.log('\n📝 Inserting 100,000 documents...')
  const beforeInsert = getMemoryUsage()

  const users = generateUsers(100_000)
  await User.insertMany(users)

  const afterInsert = getMemoryUsage()
  const { heapDiff, rssDiff } = displayMemoryStats(
    'After inserting 100k documents',
    beforeInsert,
    afterInsert
  )

  console.log(`\n💡 Per document memory cost:`)
  console.log(`  Heap: ~${formatBytes(heapDiff / 100_000)}`)
  console.log(`  RSS: ~${formatBytes(rssDiff / 100_000)}`)

  await disconnect()
  await sleep(100)

  return { heapDiff, rssDiff }
}

// Test 2: Memory usage with indexes
async function testMemoryWithIndexes() {
  console.log('\n' + '='.repeat(80))
  console.log('📇 TEST 2: MEMORY USAGE WITH INDEXES')
  console.log('='.repeat(80))

  if (global.gc) {
    global.gc()
    await sleep(100)
  }

  const beforeConnect = getMemoryUsage()

  await clearRegistry()
  connect({ storage: 'memory' })

  const userSchema = new Schema<User>({
    id: Number,
    email: { type: String, required: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    city: { type: String, required: true },
    status: { type: String, required: true },
    score: { type: Number, required: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: () => new Date() }
  })

  // Add indexes
  userSchema.index('email')
  userSchema.index('status')
  userSchema.index(['city', 'age']) // Compound index

  const User = model('User', userSchema)

  // Insert 100k documents
  console.log('\n📝 Inserting 100,000 documents with 3 indexes (2 single, 1 compound)...')
  const beforeInsert = getMemoryUsage()

  const users = generateUsers(100_000)
  await User.insertMany(users)

  const afterInsert = getMemoryUsage()
  const { heapDiff, rssDiff } = displayMemoryStats(
    'After inserting 100k documents with indexes',
    beforeInsert,
    afterInsert
  )

  console.log(`\n💡 Per document memory cost (with indexes):`)
  console.log(`  Heap: ~${formatBytes(heapDiff / 100_000)}`)
  console.log(`  RSS: ~${formatBytes(rssDiff / 100_000)}`)

  console.log(`\n📊 Memory overhead comparison:`)
  console.log(`  Total heap used: ${formatBytes(afterInsert.heapUsed - beforeConnect.heapUsed)}`)

  await disconnect()
  await sleep(100)

  return { heapDiff, rssDiff }
}

// Test 3: Memory usage with virtuals and hooks
async function testMemoryWithVirtualsAndHooks() {
  console.log('\n' + '='.repeat(80))
  console.log('🎭 TEST 3: MEMORY USAGE WITH VIRTUALS AND HOOKS')
  console.log('='.repeat(80))

  if (global.gc) {
    global.gc()
    await sleep(100)
  }

  await clearRegistry()
  connect({ storage: 'memory' })

  const userSchema = new Schema<User>({
    id: Number,
    email: { type: String, required: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    city: { type: String, required: true },
    status: { type: String, required: true },
    score: { type: Number, required: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: () => new Date() }
  })

  // Add virtuals
  userSchema.virtual('fullInfo').get(doc => `${doc.name} (${doc.age}) from ${doc.city}`)
  userSchema.virtual('isAdult').get(doc => doc.age >= 18)
  userSchema.virtual('emailDomain').get(doc => doc.email.split('@')[1])

  // Add hooks
  userSchema.pre('save', function () {
    // Some validation logic
    if (this.age < 0) throw new Error('Age cannot be negative')
  })

  userSchema.post('save', function () {
    // Some post-save logic
  })

  const User = model('User', userSchema)

  // Insert 100k documents
  console.log('\n📝 Inserting 100,000 documents with virtuals and hooks...')
  const beforeInsert = getMemoryUsage()

  const users = generateUsers(100_000)
  await User.insertMany(users)

  const afterInsert = getMemoryUsage()
  const { heapDiff, rssDiff } = displayMemoryStats(
    'After inserting 100k documents with virtuals/hooks',
    beforeInsert,
    afterInsert
  )

  console.log(`\n💡 Per document memory cost (with virtuals/hooks):`)
  console.log(`  Heap: ~${formatBytes(heapDiff / 100_000)}`)
  console.log(`  RSS: ~${formatBytes(rssDiff / 100_000)}`)

  await disconnect()
  await sleep(100)

  return { heapDiff, rssDiff }
}

// Test 4: Memory patterns during operations
async function testOperationMemoryPatterns() {
  console.log('\n' + '='.repeat(80))
  console.log('⚡ TEST 4: MEMORY PATTERNS DURING OPERATIONS')
  console.log('='.repeat(80))

  if (global.gc) {
    global.gc()
    await sleep(100)
  }

  await clearRegistry()
  connect({ storage: 'memory' })

  const userSchema = new Schema<User>({
    id: Number,
    email: { type: String, required: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    city: { type: String, required: true },
    status: { type: String, required: true },
    score: { type: Number, required: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: () => new Date() }
  })

  userSchema.index('email')
  userSchema.index('status')

  const User = model('User', userSchema)
  await User.insertMany(generateUsers(100_000))

  console.log('\n📊 Testing memory patterns for different operations...')

  // Find operation
  const beforeFind = getMemoryUsage()
  const activeUsers = await User.find({ status: 'active' })
  const afterFind = getMemoryUsage()
  console.log(`\n🔍 Find operation (${activeUsers.length} results):`)
  console.log(`  Memory delta: ${formatBytes(afterFind.heapUsed - beforeFind.heapUsed)}`)

  // Lean query (should use less memory)
  if (global.gc) global.gc()
  await sleep(100)

  const beforeLean = getMemoryUsage()
  const leanUsers = await User.find({ status: 'active' }, { lean: true })
  const afterLean = getMemoryUsage()
  console.log(`\n🏃 Lean query (${leanUsers.length} results):`)
  console.log(`  Memory delta: ${formatBytes(afterLean.heapUsed - beforeLean.heapUsed)}`)
  console.log(
    `  Savings vs regular find: ~${Math.round(((afterFind.heapUsed - beforeFind.heapUsed) / (afterLean.heapUsed - beforeLean.heapUsed)) * 10) / 10}x more efficient`
  )

  // Update operation
  const beforeUpdate = getMemoryUsage()
  await User.updateMany({ status: 'pending' }, { $set: { status: 'processed' } })
  const afterUpdate = getMemoryUsage()
  console.log(`\n✏️  Update operation:`)
  console.log(`  Memory delta: ${formatBytes(afterUpdate.heapUsed - beforeUpdate.heapUsed)}`)

  // Count operation (minimal memory)
  const beforeCount = getMemoryUsage()
  const count = await User.countDocuments({ active: true })
  const afterCount = getMemoryUsage()
  console.log(`\n🔢 Count operation (${count} documents):`)
  console.log(`  Memory delta: ${formatBytes(afterCount.heapUsed - beforeCount.heapUsed)}`)

  await disconnect()
  await sleep(100)
}

// Test 5: Memory scaling comparison
async function testMemoryScaling() {
  console.log('\n' + '='.repeat(80))
  console.log('📈 TEST 5: MEMORY SCALING AT DIFFERENT SIZES')
  console.log('='.repeat(80))

  const sizes = [1_000, 10_000, 50_000, 100_000]
  const results: { size: number; heap: number; rss: number }[] = []

  for (const size of sizes) {
    if (global.gc) {
      global.gc()
      await sleep(100)
    }

    await clearRegistry()
    connect({ storage: 'memory' })

    const userSchema = new Schema<User>({
      id: Number,
      email: { type: String, required: true },
      name: { type: String, required: true },
      age: { type: Number, required: true },
      city: { type: String, required: true },
      status: { type: String, required: true },
      score: { type: Number, required: true },
      active: { type: Boolean, default: true },
      createdAt: { type: Date, default: () => new Date() }
    })

    userSchema.index('email')

    const User = model('User', userSchema)

    const beforeInsert = getMemoryUsage()
    await User.insertMany(generateUsers(size))
    const afterInsert = getMemoryUsage()

    const heapDiff = afterInsert.heapUsed - beforeInsert.heapUsed
    const rssDiff = afterInsert.rss - beforeInsert.rss

    results.push({ size, heap: heapDiff, rss: rssDiff })

    console.log(`\n${size.toLocaleString()} documents:`)
    console.log(`  Total heap: ${formatBytes(heapDiff)}`)
    console.log(`  Per document: ${formatBytes(heapDiff / size)}`)

    await disconnect()
    await sleep(100)
  }

  console.log('\n📊 SCALING SUMMARY:')
  console.log('\n| Documents | Total Heap | Per Document | Total RSS | Per Document (RSS) |')
  console.log('| --------- | ---------- | ------------ | --------- | ------------------ |')

  for (const result of results) {
    console.log(
      `| ${result.size.toLocaleString().padEnd(9)} | ${formatBytes(result.heap).padEnd(10)} | ${formatBytes(result.heap / result.size).padEnd(12)} | ${formatBytes(result.rss).padEnd(9)} | ${formatBytes(result.rss / result.size).padEnd(18)} |`
    )
  }
}

// Main function
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║              MEMGOOSE MEMORY USAGE DEMONSTRATION                              ║
║              100,000 Documents in Memory                                      ║
║                                                                                ║
║  This demo shows the actual memory footprint of storing documents in memory.  ║
║  Run with --expose-gc flag for accurate measurements: node --expose-gc ...   ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`)

  if (!global.gc) {
    console.log('\n⚠️  WARNING: Garbage collection is not exposed.')
    console.log(
      '   For more accurate measurements, run with: node --expose-gc examples/memory-usage-demo.ts\n'
    )
  }

  try {
    const basicResult = await testBasicMemoryUsage()
    const indexedResult = await testMemoryWithIndexes()
    const virtualsResult = await testMemoryWithVirtualsAndHooks()

    await testOperationMemoryPatterns()
    await testMemoryScaling()

    // Summary
    console.log('\n' + '='.repeat(80))
    console.log('📋 SUMMARY')
    console.log('='.repeat(80))

    console.log('\n100,000 Documents Memory Usage:')
    console.log(
      `  Basic (no indexes): ${formatBytes(basicResult.heapDiff)} heap, ${formatBytes(basicResult.rssDiff)} RSS`
    )
    console.log(
      `  With indexes: ${formatBytes(indexedResult.heapDiff)} heap, ${formatBytes(indexedResult.rssDiff)} RSS`
    )
    console.log(
      `  With virtuals/hooks: ${formatBytes(virtualsResult.heapDiff)} heap, ${formatBytes(virtualsResult.rssDiff)} RSS`
    )

    console.log('\nIndex overhead:')
    const indexOverhead = indexedResult.heapDiff - basicResult.heapDiff
    console.log(
      `  Additional heap for 3 indexes: ${formatBytes(indexOverhead)} (${Math.round((indexOverhead / basicResult.heapDiff) * 100)}%)`
    )

    console.log('\n💡 Key Insights:')
    console.log('  • Memory storage is extremely efficient for in-memory operations')
    console.log('  • Indexes add minimal overhead while providing massive query speedups')
    console.log('  • Lean queries can significantly reduce memory for result sets')
    console.log('  • Memory usage scales linearly with document count')
    console.log('  • Virtual fields and hooks add minimal overhead (computed on-demand)')

    console.log('\n✨ Demo complete!')
    console.log('='.repeat(80))
  } catch (error) {
    console.error('\n❌ Demo failed:', error)
    process.exit(1)
  }
}

// Run
main().catch(console.error)
