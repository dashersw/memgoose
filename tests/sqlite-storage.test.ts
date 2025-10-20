import { test } from 'node:test'
import assert from 'node:assert'
import { connect, model, Schema, disconnect } from '../index'
import * as fs from 'fs'
import * as path from 'path'

const TEST_DATA_PATH = './test-sqlite-data'

// Helper to clean up test databases
async function cleanupTestData() {
  if (fs.existsSync(TEST_DATA_PATH)) {
    const files = fs.readdirSync(TEST_DATA_PATH)
    for (const file of files) {
      fs.unlinkSync(path.join(TEST_DATA_PATH, file))
    }
    fs.rmdirSync(TEST_DATA_PATH)
  }
}

test('SQLite Storage Strategy', async t => {
  t.beforeEach(async () => {
    await cleanupTestData()
    connect({
      storage: 'sqlite',
      sqlite: {
        dataPath: TEST_DATA_PATH
      }
    })
  })

  t.afterEach(async () => {
    await disconnect()
    await cleanupTestData()
  })

  await t.test('should create database file on initialization', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const dbPath = path.join(TEST_DATA_PATH, 'User.db')
    assert.ok(fs.existsSync(dbPath), 'Database file should exist')
  })

  await t.test('should persist and retrieve documents', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Bob', age: 30 })
    await User.create({ name: 'Charlie', age: 35 })

    const users = await User.find()
    assert.strictEqual(users.length, 2)
    assert.ok(users.some(u => u.name === 'Bob'))
    assert.ok(users.some(u => u.name === 'Charlie'))
  })

  await t.test('should support basic CRUD operations', async () => {
    const User = model('User', new Schema({}))

    // Create
    await User.create({ name: 'Alice', age: 25 })
    let alice = await User.findOne({ name: 'Alice' })
    assert.strictEqual(alice?.age, 25)

    // Update
    await User.updateOne({ name: 'Alice' }, { age: 26 })
    alice = await User.findOne({ name: 'Alice' })
    assert.strictEqual(alice?.age, 26)

    // Delete
    await User.deleteOne({ name: 'Alice' })
    alice = await User.findOne({ name: 'Alice' })
    assert.strictEqual(alice, null)
  })

  await t.test('should support batch insertMany', async () => {
    const User = model('User', new Schema({}))

    const users = Array.from({ length: 100 }, (_, i) => ({
      name: `User${i}`,
      age: 20 + (i % 50)
    }))

    await User.insertMany(users)
    const count = await User.countDocuments()
    assert.strictEqual(count, 100)
  })

  await t.test('should support deleteMany', async () => {
    const User = model('User', new Schema({}))

    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35 }
    ])

    await User.deleteMany({ age: { $gte: 30 } })
    const remaining = await User.find()

    assert.strictEqual(remaining.length, 1)
    assert.strictEqual(remaining[0].name, 'Alice')
  })

  await t.test('should support unique indexes', async () => {
    interface UserDoc {
      email: string
      name: string
    }

    const userSchema = new Schema<UserDoc>({
      email: { type: String, required: true, unique: true },
      name: { type: String, required: true }
    })

    userSchema.index({ email: 1 }, { unique: true })

    const User = model('UniqueUser', userSchema)
    await User.create({ email: 'alice@example.com', name: 'Alice' })

    // Try to create duplicate
    await assert.rejects(
      async () => {
        await User.create({ email: 'alice@example.com', name: 'Alice Clone' })
      },
      {
        message: /unique/i
      }
    )
  })

  await t.test('should support compound indexes', async () => {
    interface BookDoc {
      title: string
      author: string
      year: number
    }

    const bookSchema = new Schema<BookDoc>({
      title: { type: String, required: true },
      author: { type: String, required: true },
      year: { type: Number, required: true }
    })

    bookSchema.index({ author: 1, year: 1 })

    const Book = model('Book', bookSchema)

    await Book.insertMany([
      { title: 'Book A', author: 'Author1', year: 2020 },
      { title: 'Book B', author: 'Author1', year: 2021 },
      { title: 'Book C', author: 'Author2', year: 2020 }
    ])

    const books = await Book.find({ author: 'Author1', year: 2021 })
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0].title, 'Book B')
  })

  await t.test('should support query operators', async () => {
    const User = model('QueryUser', new Schema({}))

    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35 },
      { name: 'Diana', age: 40 }
    ])

    // $gte
    const olderUsers = await User.find({ age: { $gte: 30 } })
    assert.strictEqual(olderUsers.length, 3)

    // $lt
    const youngerUsers = await User.find({ age: { $lt: 30 } })
    assert.strictEqual(youngerUsers.length, 1)

    // $in
    const specificAges = await User.find({ age: { $in: [25, 35] } })
    assert.strictEqual(specificAges.length, 2)
  })

  await t.test('should support updateMany', async () => {
    const User = model('UpdateUser', new Schema({}))

    await User.insertMany([
      { name: 'Alice', active: false },
      { name: 'Bob', active: false },
      { name: 'Charlie', active: true }
    ])

    const result = await User.updateMany({ active: false }, { active: true })
    assert.strictEqual(result.modifiedCount, 2)

    const activeCount = await User.countDocuments({ active: true })
    assert.strictEqual(activeCount, 3)
  })

  await t.test('should support findById', async () => {
    const User = model('FindByIdUser', new Schema({}))

    const created = await User.create({ name: 'Alice', age: 25 })
    const found = await User.findById(created._id)

    assert.ok(found)
    assert.strictEqual(found.name, 'Alice')
    assert.strictEqual(found.age, 25)
  })

  await t.test('should persist data across model re-creation', async () => {
    // First session
    {
      const User = model('PersistUser', new Schema({}))
      await User.create({ name: 'Alice', age: 25 })
    }

    await disconnect()

    // Reconnect
    connect({
      storage: 'sqlite',
      sqlite: {
        dataPath: TEST_DATA_PATH
      }
    })

    // Second session - data should still be there
    {
      const User = model('PersistUser', new Schema({}))
      const alice = await User.findOne({ name: 'Alice' })
      assert.ok(alice)
      assert.strictEqual(alice.name, 'Alice')
      assert.strictEqual(alice.age, 25)
    }
  })

  await t.test('should handle clear operation', async () => {
    const User = model('ClearUser', new Schema({}))

    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    let count = await User.countDocuments()
    assert.strictEqual(count, 2)

    // Clear all
    await (User as any)._storage.clear()

    count = await User.countDocuments()
    assert.strictEqual(count, 0)
  })
})
