import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { Schema, createDatabase, clearRegistry } from '../index'
import fs from 'fs/promises'

interface TestDoc {
  name: string
  age: number
  email?: string
}

describe('File Storage Strategy', () => {
  const testDir = './data/test-file-storage'
  let db: ReturnType<typeof createDatabase>

  before(async () => {
    await clearRegistry()
    // Clean up test directory if it exists
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore if directory doesn't exist
    }
  })

  after(async () => {
    await clearRegistry()
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore errors during cleanup
    }
  })

  describe('Basic file operations', () => {
    it('should create file storage directory on initialization', async () => {
      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true },
        email: String
      })

      const User = db.model<TestDoc>('FileUser', userSchema)

      // Create a document to trigger file creation
      await User.create({ name: 'Alice', age: 30 })

      // Check if directory exists
      const stats = await fs.stat(testDir)
      assert.ok(stats.isDirectory())

      // Verify the user was actually created
      const users = await User.find({})
      assert.strictEqual(users.length, 1)
      assert.strictEqual(users[0].name, 'Alice')
    })

    it('should persist and retrieve documents', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true },
        email: String
      })

      const User = db.model<TestDoc>('FilePersist', userSchema)

      // Create documents
      await User.create({ name: 'Bob', age: 25, email: 'bob@example.com' })
      await User.create({ name: 'Charlie', age: 35 })

      // Query documents
      const users = await User.find({})
      assert.strictEqual(users.length, 2)
      assert.strictEqual(users[0].name, 'Bob')
      assert.strictEqual(users[1].name, 'Charlie')
    })

    it('should support insertMany (addMany)', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      const User = db.model<TestDoc>('FileAddMany', userSchema)

      // Insert multiple documents at once
      const docs = await User.insertMany([
        { name: 'User1', age: 20 },
        { name: 'User2', age: 30 },
        { name: 'User3', age: 40 }
      ])

      assert.strictEqual(docs.length, 3)
      assert.strictEqual(docs[0].name, 'User1')
      assert.strictEqual(docs[1].name, 'User2')
      assert.strictEqual(docs[2].name, 'User3')

      // Verify all documents were persisted
      const allUsers = await User.find({})
      assert.strictEqual(allUsers.length, 3)
    })

    it('should support update operations', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true },
        email: String
      })

      const User = db.model<TestDoc>('FileUpdate', userSchema)

      // Create initial document
      const _user = await User.create({ name: 'David', age: 28 })

      // Update the document
      await User.updateOne({ name: 'David' }, { age: 29, email: 'david@example.com' })

      // Verify the update
      const updated = await User.findOne({ name: 'David' })
      assert.ok(updated)
      assert.strictEqual(updated.age, 29)
      assert.strictEqual(updated.email, 'david@example.com')
    })

    it('should support updateMany operations', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true },
        email: String
      })

      const User = db.model<TestDoc>('FileUpdateMany', userSchema)

      // Create multiple documents
      await User.insertMany([
        { name: 'Eve', age: 25 },
        { name: 'Frank', age: 25 },
        { name: 'Grace', age: 30 }
      ])

      // Update all users aged 25
      const result = await User.updateMany({ age: 25 }, { email: 'young@example.com' })
      assert.strictEqual(result.modifiedCount, 2)

      // Verify updates
      const updated = await User.find({ age: 25 })
      assert.strictEqual(updated.length, 2)
      assert.strictEqual(updated[0].email, 'young@example.com')
      assert.strictEqual(updated[1].email, 'young@example.com')
    })

    it('should support delete operations (remove)', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      const User = db.model<TestDoc>('FileRemove', userSchema)

      // Create documents
      await User.insertMany([
        { name: 'Henry', age: 40 },
        { name: 'Iris', age: 35 },
        { name: 'Jack', age: 30 }
      ])

      // Delete one document
      const deleteResult = await User.deleteOne({ name: 'Iris' })
      assert.strictEqual(deleteResult.deletedCount, 1)

      // Verify deletion
      const remaining = await User.find({})
      assert.strictEqual(remaining.length, 2)
      assert.ok(!remaining.find(u => u.name === 'Iris'))
    })

    it('should support deleteMany operations', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      const User = db.model<TestDoc>('FileDeleteMany', userSchema)

      // Create documents
      await User.insertMany([
        { name: 'Kate', age: 20 },
        { name: 'Leo', age: 20 },
        { name: 'Mike', age: 30 }
      ])

      // Delete multiple documents
      const result = await User.deleteMany({ age: 20 })
      assert.strictEqual(result.deletedCount, 2)

      // Verify deletions
      const remaining = await User.find({})
      assert.strictEqual(remaining.length, 1)
      assert.strictEqual(remaining[0].name, 'Mike')
    })
  })

  describe('Index operations', () => {
    it('should update indexes when documents are added', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      // Create index on name field
      userSchema.index('name')

      const User = db.model<TestDoc>('FileIndexAdd', userSchema)

      // Add document - should update index
      await User.create({ name: 'Indexed', age: 25 })

      // Query using indexed field - should use index
      const found = await User.findOne({ name: 'Indexed' })
      assert.ok(found)
      assert.strictEqual(found.age, 25)
    })

    it('should update indexes when using document.save()', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      userSchema.index('age')

      const User = db.model<TestDoc>('FileIndexUpdate', userSchema)

      // Create document
      const user = await User.create({ name: 'TestUser', age: 30 })

      // Modify and save - this properly updates indexes
      user.age = 31
      await user.save()

      // Query with new age should work
      const foundNew = await User.findOne({ age: 31 })
      assert.ok(foundNew)
      assert.strictEqual(foundNew.name, 'TestUser')
      assert.strictEqual(foundNew.age, 31)
    })

    it('should update indexes when documents are removed', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      userSchema.index('name')

      const User = db.model<TestDoc>('FileIndexRemove', userSchema)

      // Create document
      await User.create({ name: 'ToDelete', age: 40 })

      // Verify it's indexed
      const before = await User.findOne({ name: 'ToDelete' })
      assert.ok(before)

      // Delete document - should update index
      await User.deleteOne({ name: 'ToDelete' })

      // Query should not find the document
      const after = await User.findOne({ name: 'ToDelete' })
      assert.strictEqual(after, null)
    })

    it('should handle compound indexes', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      userSchema.index(['name', 'age'])

      const User = db.model<TestDoc>('FileCompoundIndex', userSchema)

      // Create documents
      await User.insertMany([
        { name: 'Alice', age: 25 },
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ])

      // Query using compound index
      const found = await User.findOne({ name: 'Alice', age: 30 })
      assert.ok(found)
      assert.strictEqual(found.name, 'Alice')
      assert.strictEqual(found.age, 30)
    })
  })

  describe('Debounced persistence mode', () => {
    it('should work with debounced mode', async () => {
      await clearRegistry()

      db = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'debounced',
          debounceMs: 100
        }
      })

      const userSchema = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      const User = db.model<TestDoc>('FileDebounced', userSchema)

      // Create multiple documents quickly
      await User.create({ name: 'Quick1', age: 20 })
      await User.create({ name: 'Quick2', age: 21 })
      await User.create({ name: 'Quick3', age: 22 })

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200))

      // Verify all documents were persisted
      const all = await User.find({})
      assert.strictEqual(all.length, 3)
    })
  })

  describe('Data persistence across restarts', () => {
    it('should persist data across model re-creation', async () => {
      await clearRegistry()

      // Create database and add data
      const db1 = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema1 = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      const User1 = db1.model<TestDoc>('FilePersistent', userSchema1)

      await User1.insertMany([
        { name: 'Persistent1', age: 50 },
        { name: 'Persistent2', age: 60 }
      ])

      // Clear registry (simulates app restart)
      await clearRegistry()

      // Create new database and model with same name
      const db2 = createDatabase({
        storage: 'file',
        file: {
          dataPath: testDir,
          persistMode: 'immediate'
        }
      })

      const userSchema2 = new Schema<TestDoc>({
        name: { type: String, required: true },
        age: { type: Number, required: true }
      })

      const User2 = db2.model<TestDoc>('FilePersistent', userSchema2)

      // Data should still be there
      const users = await User2.find({})
      assert.strictEqual(users.length, 2)
      assert.ok(users.find(u => u.name === 'Persistent1'))
      assert.ok(users.find(u => u.name === 'Persistent2'))
    })
  })
})
