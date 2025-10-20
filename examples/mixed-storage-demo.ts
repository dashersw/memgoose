// Example demonstrating mixing storage strategies
import { createDatabase, Schema } from '../index'

// Define schemas
interface UserDoc {
  username: string
  email: string
}

interface SessionDoc {
  userId: string
  token: string
  expiresAt: Date
}

const userSchema = new Schema<UserDoc>({
  username: { type: String, required: true },
  email: { type: String, required: true }
})

const sessionSchema = new Schema<SessionDoc>({
  userId: { type: String, required: true },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true }
})

// Create separate databases with different storage strategies
// Users persist to disk (important data)
const persistentDb = createDatabase({
  storage: 'file',
  file: {
    dataPath: './data',
    persistMode: 'debounced'
  }
})

const User = persistentDb.model('User', userSchema)

// Sessions stay in memory (temporary data)
const memoryDb = createDatabase({
  storage: 'memory'
})

const Session = memoryDb.model('Session', sessionSchema)

async function demo() {
  console.log('Mixed Storage Demo')
  console.log('==================\n')

  // Create a user (persisted to disk)
  console.log('Creating user (persisted to disk)...')
  const user = await User.create({
    username: 'alice',
    email: 'alice@example.com'
  })

  // Create a session (stored in memory only)
  console.log('Creating session (memory only)...')
  await Session.create({
    userId: user._id.toString(),
    token: 'abc123',
    expiresAt: new Date(Date.now() + 3600000)
  })

  console.log('\n✓ User saved to ./data/User.json')
  console.log('✓ Session exists only in memory\n')

  // Query both
  const allUsers = await User.find()
  const allSessions = await Session.find()

  console.log('Users in persistent storage:', allUsers.length)
  console.log('Sessions in memory:', allSessions.length)

  console.log('\nRestart the application:')
  console.log('  - Users will be loaded from disk')
  console.log('  - Sessions will be lost (as intended)')
}

demo().catch(console.error)
