/**
 * WiredTiger Storage Demo
 *
 * This example demonstrates using WiredTiger as the storage backend for memgoose.
 * WiredTiger is a high-performance embedded database engine used by MongoDB.
 *
 * Features:
 * - Persistent storage with ACID transactions
 * - High-performance read and write operations
 * - Efficient indexing and compression
 * - WAL (Write-Ahead Logging) for durability
 * - MVCC (Multi-Version Concurrency Control)
 *
 * Prerequisites:
 * - Run `npm install` to build the WiredTiger native bindings
 * - This will compile WiredTiger and the Node.js bindings
 */

import { connect, Schema, model } from '../index'

// Define a User schema
interface User {
  _id?: string
  name: string
  email: string
  age: number
  createdAt?: Date
}

const userSchema = new Schema<User>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: { type: Number, required: true },
  createdAt: { type: Date, default: () => new Date() }
})

async function main() {
  console.log('=== WiredTiger Storage Demo ===\n')

  try {
    // Connect with WiredTiger storage
    // Data will be persisted to ./data/wiredtiger directory
    console.log('Connecting to WiredTiger storage...')
    const db = connect({
      storage: 'wiredtiger',
      wiredtiger: {
        dataPath: './data/wiredtiger',
        cacheSize: '500M' // Configure cache size (default: 500M)
      }
    })

    // Create a User model
    const User = model('User', userSchema)

    // Check for existing data from previous runs
    const existingCount = await User.countDocuments()
    console.log(`Found ${existingCount} existing users from previous runs`)

    if (existingCount > 0) {
      console.log('\n📦 Data persisted! Showing existing users:')
      const existingUsers = await User.find({}).limit(10)
      existingUsers.forEach(u => console.log(`  - ${u.name} (${u.email}), age ${u.age}`))
      if (existingCount > 10) {
        console.log(`  ... and ${existingCount - 10} more`)
      }
      console.log('\n🧹 Clearing existing data for fresh demo...')
    }

    // Clear existing data for demo
    await User.deleteMany({})

    // 1. Create documents
    console.log('\n1. Creating users...')
    const users = await User.insertMany([
      { name: 'Alice Johnson', email: 'alice@example.com', age: 28 },
      { name: 'Bob Smith', email: 'bob@example.com', age: 35 },
      { name: 'Charlie Brown', email: 'charlie@example.com', age: 42 },
      { name: 'Diana Prince', email: 'diana@example.com', age: 31 }
    ])
    console.log(`Created ${users.length} users`)

    // 2. Query documents
    console.log('\n2. Querying users over 30...')
    const olderUsers = await User.find({ age: { $gte: 30 } })
    olderUsers.forEach(u => console.log(`  - ${u.name}, age ${u.age}`))

    // 3. Update document
    console.log("\n3. Updating Bob's age...")
    const updateResult = await User.updateOne({ name: 'Bob Smith' }, { age: 36 })
    console.log(`Updated ${updateResult.modifiedCount} document`)

    // 4. Query with email (unique index)
    console.log('\n4. Finding user by email...')
    const alice = await User.findOne({ email: 'alice@example.com' })
    console.log(`Found: ${alice?.name} (${alice?.email})`)

    // 5. Count documents
    console.log('\n5. Counting users...')
    const count = await User.countDocuments()
    console.log(`Total users: ${count}`)

    // 6. Delete document
    console.log('\n6. Deleting Charlie...')
    const deleteResult = await User.deleteOne({ name: 'Charlie Brown' })
    console.log(`Deleted ${deleteResult.deletedCount} document`)

    // 7. Verify deletion
    console.log('\n7. Remaining users:')
    const remainingUsers = await User.find({})
    remainingUsers.forEach(u => console.log(`  - ${u.name}`))

    // Performance test
    console.log('\n8. Performance test: Bulk insert...')
    const startTime = Date.now()
    const bulkUsers: Partial<User>[] = []
    for (let i = 0; i < 1000; i++) {
      bulkUsers.push({
        name: `User ${i}`,
        email: `user${i}@example.com`,
        age: 20 + (i % 50)
      })
    }
    await User.insertMany(bulkUsers)
    const endTime = Date.now()
    console.log(`Inserted 1000 users in ${endTime - startTime}ms`)

    // Query performance
    console.log('\n9. Performance test: Query...')
    const queryStartTime = Date.now()
    const results = await User.find({ age: { $gte: 40 } })
    const queryEndTime = Date.now()
    console.log(`Found ${results.length} users in ${queryEndTime - queryStartTime}ms`)

    // Disconnect
    console.log('\n10. Disconnecting...')
    await db.disconnect()
    console.log('Disconnected from WiredTiger storage')

    console.log('\n=== Demo Complete! ===')
    console.log('\nData has been persisted to ./data/wiredtiger')
    console.log('Run this script again to see that data persists across restarts!')
  } catch (error) {
    console.error('Error:', error)
    if (error instanceof Error && error.message.includes('WiredTiger native bindings')) {
      console.error('\nTo use WiredTiger storage, you need to build the native bindings:')
      console.error('  npm install')
      console.error('  npm run build:wiredtiger')
    }
  }
}

main()
