// Example demonstrating file-based storage strategy
import { connect, model, Schema } from '../index'

// Configure file storage for default database (like mongoose.connect())
connect({
  storage: 'file',
  file: {
    dataPath: './data',
    persistMode: 'debounced', // or 'immediate'
    debounceMs: 100
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
  email: { type: String, required: true },
  age: { type: Number, min: 0 }
})

// Create model using default database (like mongoose.model())
const User = model('User', userSchema)

async function demo() {
  console.log('File Storage Demo')
  console.log('=================\n')

  // Create some users
  console.log('Creating users...')
  await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })
  await User.create({ name: 'Bob', email: 'bob@example.com', age: 30 })
  await User.create({ name: 'Charlie', email: 'charlie@example.com', age: 35 })

  // Data is now persisted to ./data/User.json
  console.log('Users created and saved to ./data/User.json\n')

  // Query users
  const allUsers = await User.find()
  console.log('All users:', allUsers)

  // Update a user
  console.log("\nUpdating Bob's age...")
  await User.updateOne({ name: 'Bob' }, { age: 31 })

  // Delete a user
  console.log('Deleting Charlie...')
  await User.deleteOne({ name: 'Charlie' })

  // Query again
  const remainingUsers = await User.find()
  console.log('\nRemaining users:', remainingUsers)

  console.log('\n✓ All changes have been persisted to disk!')
  console.log('  Check ./data/User.json to see the stored data')
}

// Run the demo
demo().catch(console.error)
