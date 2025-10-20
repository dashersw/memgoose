// Example demonstrating SQLite-based storage strategy
import { connect, model, Schema } from '../index'

// Configure SQLite storage for default database (like mongoose.connect())
connect({
  storage: 'sqlite',
  sqlite: {
    dataPath: './data'
  }
})

// Define schema
interface UserDoc {
  name: string
  email: string
  age: number
}

const userSchema = new Schema<UserDoc>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: { type: Number, min: 0 }
})

// Create indexes for efficient querying
userSchema.index({ email: 1 }, { unique: true })
userSchema.index({ age: 1 })

// Create model using default database (like mongoose.model())
const User = model('User', userSchema)

async function demo() {
  console.log('SQLite Storage Demo')
  console.log('===================\n')

  // Clear any existing data
  await User.deleteMany({})

  // Create some users
  console.log('Creating users...')
  await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })
  await User.create({ name: 'Bob', email: 'bob@example.com', age: 30 })
  await User.create({ name: 'Charlie', email: 'charlie@example.com', age: 35 })
  await User.create({ name: 'Diana', email: 'diana@example.com', age: 28 })

  // Data is now persisted to ./data/User.db (SQLite database)
  console.log('Users created and saved to ./data/User.db\n')

  // Query users
  const allUsers = await User.find()
  console.log('All users:', allUsers)

  // Query with index (age)
  console.log('\nUsers age 30 or older:')
  const olderUsers = await User.find({ age: { $gte: 30 } })
  console.log(olderUsers)

  // Query by unique email
  console.log('\nFinding user by email (using unique index):')
  const alice = await User.findOne({ email: 'alice@example.com' })
  console.log(alice)

  // Update a user
  console.log("\nUpdating Bob's age...")
  await User.updateOne({ name: 'Bob' }, { age: 31 })

  // Delete a user
  console.log('Deleting Charlie...')
  await User.deleteOne({ name: 'Charlie' })

  // Query again
  const remainingUsers = await User.find()
  console.log('\nRemaining users:', remainingUsers)

  // Test unique constraint
  console.log('\nTesting unique constraint (should fail):')
  try {
    await User.create({ name: 'Bob Clone', email: 'bob@example.com', age: 25 })
    console.log('ERROR: Should have thrown unique constraint error!')
  } catch (error: any) {
    console.log('✓ Unique constraint enforced:', error.message)
  }

  // Batch operations
  console.log('\nPerforming batch insert:')
  const startTime = Date.now()
  const newUsers = []
  for (let i = 0; i < 100; i++) {
    newUsers.push({ name: `User${i}`, email: `user${i}@example.com`, age: 20 + (i % 50) })
  }
  await User.insertMany(newUsers)
  const endTime = Date.now()
  console.log(`✓ Inserted 100 users in ${endTime - startTime}ms`)

  // Count users
  const totalUsers = await User.countDocuments()
  console.log(`\nTotal users in database: ${totalUsers}`)

  console.log('\n✓ All changes have been persisted to SQLite database!')
  console.log('  Check ./data/User.db to see the stored data')
  console.log('  SQLite uses WAL mode for better concurrency and performance')
}

// Run the demo
demo().catch(console.error)
