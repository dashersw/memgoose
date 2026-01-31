import { test } from 'node:test'
import assert from 'node:assert'
import { connect, model, Schema, disconnect, dropDatabase, createDatabase } from '../index'
import * as fs from 'fs'
import * as path from 'path'

const TEST_DATA_PATH = './test-drop-data'

// Helper to clean up test data directory
async function cleanupTestData() {
  if (fs.existsSync(TEST_DATA_PATH)) {
    const files = fs.readdirSync(TEST_DATA_PATH)
    for (const file of files) {
      const filePath = path.join(TEST_DATA_PATH, file)
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true })
      } else {
        fs.unlinkSync(filePath)
      }
    }
    fs.rmdirSync(TEST_DATA_PATH)
  }
}

test('Drop Database', async t => {
  t.beforeEach(async () => {
    await cleanupTestData()
  })

  t.afterEach(async () => {
    await disconnect()
    await cleanupTestData()
  })

  await t.test('should drop memory database', async () => {
    // Use in-memory storage (default)
    connect()

    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })
    await User.create({ name: 'Bob', age: 30 })

    let users = await User.find()
    assert.strictEqual(users.length, 2)

    // Drop database
    await dropDatabase()

    // After drop, models should be cleared
    // Creating a new model should work
    const NewUser = model('User', new Schema({}))
    users = await NewUser.find()
    assert.strictEqual(users.length, 0, 'Database should be empty after drop')
  })

  await t.test('should drop file-based database and delete all files', async () => {
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100 // Shorter debounce for faster tests
        }
      }
    })

    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })
    await User.create({ name: 'Bob', age: 30 })

    // Force flush to ensure files are written
    await disconnect()

    // Reconnect for drop test
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    // Get the model again
    model('User', new Schema({}))

    // Verify files exist
    const dataFile = path.join(TEST_DATA_PATH, 'User.data.ndjson')
    const indexFile = path.join(TEST_DATA_PATH, 'User.index.json')
    const schemaFile = path.join(TEST_DATA_PATH, 'User.schema.json')

    assert.ok(fs.existsSync(dataFile), 'Data file should exist before drop')

    // Drop database
    await dropDatabase()

    // Verify files are deleted
    assert.ok(!fs.existsSync(dataFile), 'Data file should be deleted after drop')
    assert.ok(!fs.existsSync(indexFile), 'Index file should be deleted after drop')
    assert.ok(!fs.existsSync(schemaFile), 'Schema file should be deleted after drop')

    // After drop, should be able to create new models with fresh data
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    const NewUser = model('User', new Schema({}))
    const users = await NewUser.find()
    assert.strictEqual(users.length, 0, 'Database should be empty after drop')
  })

  await t.test('should drop SQLite database and delete .db file', async () => {
    connect({
      storage: 'sqlite',
      sqlite: {
        dataPath: TEST_DATA_PATH
      }
    })

    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })
    await User.create({ name: 'Bob', age: 30 })

    const dbFile = path.join(TEST_DATA_PATH, 'User.db')

    // Verify database file exists
    assert.ok(fs.existsSync(dbFile), 'Database file should exist before drop')

    // Drop database
    await dropDatabase()

    // Verify database file is deleted
    assert.ok(!fs.existsSync(dbFile), 'Database file should be deleted after drop')

    // Verify WAL/SHM files are also deleted if they existed
    const walFile = path.join(TEST_DATA_PATH, 'User.db-wal')
    const shmFile = path.join(TEST_DATA_PATH, 'User.db-shm')
    assert.ok(!fs.existsSync(walFile), 'WAL file should be deleted')
    assert.ok(!fs.existsSync(shmFile), 'SHM file should be deleted')

    // After drop, should be able to create new database
    connect({
      storage: 'sqlite',
      sqlite: {
        dataPath: TEST_DATA_PATH
      }
    })

    const NewUser = model('User', new Schema({}))
    const users = await NewUser.find()
    assert.strictEqual(users.length, 0, 'Database should be empty after drop')
  })

  await t.test('should drop multiple models in same database', async () => {
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    const User = model('User', new Schema({}))
    const Product = model('Product', new Schema({}))

    await User.create({ name: 'Alice' })
    await Product.create({ name: 'Widget' })

    // Force flush to ensure files are written
    await disconnect()

    // Reconnect for drop test
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    // Get models again
    model('User', new Schema({}))
    model('Product', new Schema({}))

    // Verify files exist for both models
    const userDataFile = path.join(TEST_DATA_PATH, 'User.data.ndjson')
    const productDataFile = path.join(TEST_DATA_PATH, 'Product.data.ndjson')

    assert.ok(fs.existsSync(userDataFile), 'User data file should exist')
    assert.ok(fs.existsSync(productDataFile), 'Product data file should exist')

    // Drop database
    await dropDatabase()

    // Verify all files are deleted
    assert.ok(!fs.existsSync(userDataFile), 'User data file should be deleted')
    assert.ok(!fs.existsSync(productDataFile), 'Product data file should be deleted')

    // After drop, should be able to recreate models
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    const NewUser = model('User', new Schema({}))
    const NewProduct = model('Product', new Schema({}))

    const users = await NewUser.find()
    const products = await NewProduct.find()

    assert.strictEqual(users.length, 0, 'Users should be empty after drop')
    assert.strictEqual(products.length, 0, 'Products should be empty after drop')
  })

  await t.test('should handle drop on empty database', async () => {
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate'
      }
    })

    // Don't create any models or data
    // Just drop immediately
    await assert.doesNotReject(async () => {
      await dropDatabase()
    }, 'Dropping empty database should not throw')
  })

  await t.test('should drop database created with createDatabase()', async () => {
    const db = createDatabase({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    const User = db.model('User', new Schema({}))
    await User.create({ name: 'Alice' })

    // Flush and disconnect to ensure files are written
    await db.disconnect()

    // Reconnect for drop test
    const db1 = createDatabase({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    db1.model('User', new Schema({}))

    const dataFile = path.join(TEST_DATA_PATH, 'User.data.ndjson')
    assert.ok(fs.existsSync(dataFile), 'Data file should exist')

    // Drop the database instance
    await db1.dropDatabase()

    // Verify files are deleted
    assert.ok(!fs.existsSync(dataFile), 'Data file should be deleted after drop')

    // Should be able to create a new database with same path
    const db2 = createDatabase({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    const NewUser = db2.model('User', new Schema({}))
    const users = await NewUser.find()
    assert.strictEqual(users.length, 0, 'New database should be empty')

    await db2.disconnect()
  })

  await t.test('should clear model registry after drop', async () => {
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice' })

    // Drop database
    await dropDatabase()

    // After drop, creating a new model with same name should work
    // and it should be a fresh model with no data
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'immediate',
        compaction: {
          debounceMs: 100
        }
      }
    })

    const NewUser = model('User', new Schema({}))
    const users = await NewUser.find()
    assert.strictEqual(users.length, 0, 'New model should have no data')
  })

  await t.test('should flush pending writes before drop', async () => {
    connect({
      storage: 'file',
      file: {
        dataPath: TEST_DATA_PATH,
        persistMode: 'debounced', // Use debounced mode to test pending writes
        debounceMs: 1000
      }
    })

    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice' })

    // Drop immediately without waiting for debounce
    // Should flush pending writes before dropping
    await assert.doesNotReject(async () => {
      await dropDatabase()
    }, 'Drop should handle pending writes gracefully')
  })
})

test('Drop Database - WiredTiger', async t => {
  // Skip WiredTiger tests if package is not installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('memgoose-wiredtiger')
  } catch {
    console.log('Skipping WiredTiger drop tests (memgoose-wiredtiger not installed)')
    return
  }

  t.beforeEach(async () => {
    await cleanupTestData()
  })

  t.afterEach(async () => {
    await disconnect()
    await cleanupTestData()
  })

  await t.test('should drop WiredTiger database and delete data directory', async () => {
    connect({
      storage: 'wiredtiger',
      wiredtiger: {
        dataPath: TEST_DATA_PATH,
        cacheSize: '100M',
        compressor: 'snappy'
      }
    })

    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })
    await User.create({ name: 'Bob', age: 30 })

    const wtDir = path.join(TEST_DATA_PATH, 'User')

    // Verify directory exists
    assert.ok(fs.existsSync(wtDir), 'WiredTiger directory should exist before drop')

    // Drop database
    await dropDatabase()

    // Verify directory is deleted
    assert.ok(!fs.existsSync(wtDir), 'WiredTiger directory should be deleted after drop')

    // After drop, should be able to create new database
    connect({
      storage: 'wiredtiger',
      wiredtiger: {
        dataPath: TEST_DATA_PATH,
        cacheSize: '100M'
      }
    })

    const NewUser = model('User', new Schema({}))
    const users = await NewUser.find()
    assert.strictEqual(users.length, 0, 'Database should be empty after drop')
  })
})
