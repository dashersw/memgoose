/**
 * Drop Database Demo
 *
 * This example demonstrates how to use the dropDatabase() function
 * to completely remove all database files and data.
 */

import { connect, model, Schema, dropDatabase, createDatabase } from '../index'

// Define a simple schema
const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String },
  age: { type: Number }
})

async function memoryDatabaseDemo() {
  console.log('\n=== Memory Database Demo ===')

  // Use default in-memory database
  connect()

  const User = model('User', userSchema)

  // Create some users
  await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })
  await User.create({ name: 'Bob', email: 'bob@example.com', age: 30 })

  console.log('Users before drop:', await User.countDocuments())

  // Drop the database
  await dropDatabase()
  console.log('Database dropped!')

  // After drop, create a new model - it will be empty
  const NewUser = model('User', userSchema)
  console.log('Users after drop:', await NewUser.countDocuments())
}

async function fileDatabaseDemo() {
  console.log('\n=== File Database Demo ===')

  // Use file-based storage
  connect({
    storage: 'file',
    file: {
      dataPath: './demo-data',
      persistMode: 'immediate'
    }
  })

  const User = model('User', userSchema)

  // Create some users
  await User.create({ name: 'Charlie', email: 'charlie@example.com', age: 35 })
  await User.create({ name: 'Diana', email: 'diana@example.com', age: 28 })

  console.log('Users before drop:', await User.countDocuments())

  // Drop the database - this will delete all files in ./demo-data/
  await dropDatabase()
  console.log('Database dropped! All files deleted.')

  // Verify files are gone
  const fs = await import('fs')
  const files = fs.existsSync('./demo-data') ? fs.readdirSync('./demo-data') : []
  console.log('Remaining files in ./demo-data/:', files.length ? files : 'none')
}

async function multipleDatabasesDemo() {
  console.log('\n=== Multiple Databases Demo ===')

  // Create two separate database instances
  const mainDb = createDatabase({
    storage: 'file',
    file: {
      dataPath: './main-db',
      persistMode: 'immediate'
    }
  })

  const testDb = createDatabase({
    storage: 'file',
    file: {
      dataPath: './test-db',
      persistMode: 'immediate'
    }
  })

  // Create models in each database
  const MainUser = mainDb.model('User', userSchema)
  const TestUser = testDb.model('User', userSchema)

  await MainUser.create({ name: 'Main User', age: 40 })
  await TestUser.create({ name: 'Test User', age: 20 })

  console.log('Main DB users:', await MainUser.countDocuments())
  console.log('Test DB users:', await TestUser.countDocuments())

  // Drop only the test database
  await testDb.dropDatabase()
  console.log('Test database dropped!')

  // Main database is still intact
  console.log('Main DB users after drop:', await MainUser.countDocuments())

  // Clean up main database too
  await mainDb.dropDatabase()
  console.log('Main database dropped!')
}

async function sqliteDatabaseDemo() {
  console.log('\n=== SQLite Database Demo ===')

  try {
    // Use SQLite storage
    connect({
      storage: 'sqlite',
      sqlite: {
        dataPath: './sqlite-demo'
      }
    })

    const User = model('User', userSchema)

    // Create some users
    await User.create({ name: 'SQLite User 1', age: 45 })
    await User.create({ name: 'SQLite User 2', age: 50 })

    console.log('Users before drop:', await User.countDocuments())

    // Drop the database - this will delete the .db file
    await dropDatabase()
    console.log('SQLite database dropped! .db file deleted.')

    // Verify file is gone
    const fs = await import('fs')
    const dbExists = fs.existsSync('./sqlite-demo/User.db')
    console.log('Database file exists:', dbExists)
  } catch (error: any) {
    if (error.message.includes('better-sqlite3')) {
      console.log('SQLite demo skipped (better-sqlite3 not installed)')
    } else {
      throw error
    }
  }
}

// Run all demos
async function main() {
  console.log('Drop Database Demo\n')

  await memoryDatabaseDemo()
  await fileDatabaseDemo()
  await multipleDatabasesDemo()
  await sqliteDatabaseDemo()

  console.log('\n✅ All demos completed!')

  // Clean up any remaining files
  const fs = await import('fs')
  const dirs = ['./demo-data', './main-db', './test-db', './sqlite-demo']
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}

main().catch(console.error)
