import { test } from 'node:test'
import assert from 'node:assert'
import { connect, model, Schema, disconnect } from '../index'
import * as fs from 'fs'
import * as path from 'path'

const TEST_DATA_PATH = './test-wiredtiger-data'

// Helper to clean up test databases
async function cleanupTestData() {
  if (fs.existsSync(TEST_DATA_PATH)) {
    const removeDir = (dir: string) => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const filePath = path.join(dir, file)
          if (fs.statSync(filePath).isDirectory()) {
            removeDir(filePath)
          } else {
            fs.unlinkSync(filePath)
          }
        }
        fs.rmdirSync(dir)
      }
    }
    removeDir(TEST_DATA_PATH)
  }
}

test('WiredTiger Storage Strategy', async t => {
  t.beforeEach(async () => {
    await cleanupTestData()
    connect({
      storage: 'wiredtiger',
      wiredtiger: {
        dataPath: TEST_DATA_PATH,
        cacheSize: '100M'
      }
    })
  })

  t.afterEach(async () => {
    await disconnect()
    await cleanupTestData()
  })

  await t.test('should create WiredTiger directory on initialization', async () => {
    const User = model('User', new Schema({}))
    await User.create({ name: 'Alice', age: 25 })

    const wtPath = path.join(TEST_DATA_PATH, 'User')
    assert.ok(fs.existsSync(wtPath), 'WiredTiger directory should exist')
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
      // Ensure storage is initialized
      const storage = (User as any)._storage
      if (storage && storage.initialize) {
        await storage.initialize()
      }

      await User.create({ name: 'Alice', age: 25 })

      // Verify the document was created
      const check = await User.findOne({ name: 'Alice' })
      assert.ok(check, 'Document should exist before disconnect')

      // Ensure data is flushed by waiting longer
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    await disconnect()
    // Give time for proper cleanup
    await new Promise(resolve => setTimeout(resolve, 300))

    // Reconnect
    connect({
      storage: 'wiredtiger',
      wiredtiger: {
        dataPath: TEST_DATA_PATH,
        cacheSize: '100M'
      }
    })

    // Second session - data should still be there
    {
      const User = model('PersistUser', new Schema({}))
      // Wait for storage initialization
      const storage = (User as any)._storage
      if (storage && storage.initialize) {
        await storage.initialize()
      }

      const alice = await User.findOne({ name: 'Alice' })
      assert.ok(alice, 'Document should persist across reconnect')
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

  await t.test('should handle large batch operations with transactions', async () => {
    const User = model('BatchUser', new Schema({}))

    const largeUserSet = Array.from({ length: 500 }, (_, i) => ({
      name: `User${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 60)
    }))

    await User.insertMany(largeUserSet)
    const count = await User.countDocuments()
    assert.strictEqual(count, 500)

    // Test batch delete
    await User.deleteMany({ age: { $gte: 50 } })
    const remaining = await User.countDocuments()
    assert.ok(remaining < 500)
  })

  await t.test('should support index-optimized queries', async () => {
    interface ProductDoc {
      category: string
      price: number
      inStock: boolean
    }

    const productSchema = new Schema<ProductDoc>({
      category: { type: String, required: true },
      price: { type: Number, required: true },
      inStock: { type: Boolean, required: true }
    })

    // Create index on category for faster lookups
    productSchema.index({ category: 1 })

    const Product = model('Product', productSchema)

    await Product.insertMany([
      { category: 'Electronics', price: 299, inStock: true },
      { category: 'Electronics', price: 499, inStock: false },
      { category: 'Books', price: 19, inStock: true },
      { category: 'Books', price: 29, inStock: true },
      { category: 'Clothing', price: 49, inStock: true }
    ])

    // Should use index for efficient lookup
    const electronics = await Product.find({ category: 'Electronics' })
    assert.strictEqual(electronics.length, 2)
  })

  await t.test('should handle concurrent operations safely', async () => {
    const User = model('ConcurrentUser', new Schema({}))

    // Create multiple documents concurrently
    await Promise.all([
      User.create({ name: 'User1', score: 100 }),
      User.create({ name: 'User2', score: 200 }),
      User.create({ name: 'User3', score: 300 }),
      User.create({ name: 'User4', score: 400 }),
      User.create({ name: 'User5', score: 500 })
    ])

    const count = await User.countDocuments()
    assert.strictEqual(count, 5)

    // Concurrent updates
    await Promise.all([
      User.updateOne({ name: 'User1' }, { score: 150 }),
      User.updateOne({ name: 'User2' }, { score: 250 }),
      User.updateOne({ name: 'User3' }, { score: 350 })
    ])

    const user1 = await User.findOne({ name: 'User1' })
    assert.strictEqual(user1?.score, 150)
  })

  await t.test('should maintain data integrity after multiple operations', async () => {
    interface AccountDoc {
      username: string
      balance: number
    }

    const accountSchema = new Schema<AccountDoc>({
      username: { type: String, required: true, unique: true },
      balance: { type: Number, required: true }
    })

    // unique: true in the field definition already creates the index
    const Account = model('IntegrityAccount', accountSchema)

    // Wait for storage initialization
    const storage = (Account as any)._storage
    if (storage && storage.initialize) {
      await storage.initialize()
    }

    // Clear existing data first
    await Account.deleteMany({})

    // Create accounts
    await Account.create({ username: 'alice', balance: 1000 })
    await Account.create({ username: 'bob', balance: 500 })

    // Multiple operations
    await Account.updateOne({ username: 'alice' }, { balance: 900 })
    await Account.updateOne({ username: 'bob' }, { balance: 600 })

    const alice = await Account.findOne({ username: 'alice' })
    const bob = await Account.findOne({ username: 'bob' })

    assert.strictEqual(alice?.balance, 900)
    assert.strictEqual(bob?.balance, 600)
  })

  await t.test('should handle document removal in batch', async () => {
    const User = model('RemoveUser', new Schema({}))

    await User.insertMany([
      { name: 'User1', status: 'active' },
      { name: 'User2', status: 'inactive' },
      { name: 'User3', status: 'inactive' },
      { name: 'User4', status: 'active' },
      { name: 'User5', status: 'inactive' }
    ])

    const result = await User.deleteMany({ status: 'inactive' })
    assert.strictEqual(result.deletedCount, 3)

    const remaining = await User.find()
    assert.strictEqual(remaining.length, 2)
    assert.ok(remaining.every(u => u.status === 'active'))
  })

  await t.test('should support complex queries with multiple conditions', async () => {
    const User = model('ComplexQueryUser', new Schema({}))

    await User.insertMany([
      { name: 'Alice', age: 25, city: 'NYC', active: true },
      { name: 'Bob', age: 30, city: 'LA', active: true },
      { name: 'Charlie', age: 35, city: 'NYC', active: false },
      { name: 'Diana', age: 28, city: 'NYC', active: true }
    ])

    const results = await User.find({
      city: 'NYC',
      active: true,
      age: { $gte: 25 }
    })

    assert.strictEqual(results.length, 2)
    assert.ok(results.every(u => u.city === 'NYC' && u.active === true))
  })
})
