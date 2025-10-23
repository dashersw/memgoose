import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import {
  Schema,
  model,
  clearRegistry,
  createDatabase,
  getModel,
  getDefaultDatabase,
  TTLManager,
  // These are re-exported but their re-export lines in index.ts need coverage
  MemoryStorageStrategy,
  FileStorageStrategy,
  SqliteStorageStrategy
} from '../index'

describe('Index Exports Coverage', () => {
  before(async () => {
    await clearRegistry()
  })

  after(async () => {
    await clearRegistry()
  })

  it('should export TTLManager', () => {
    assert.ok(TTLManager)
    assert.strictEqual(typeof TTLManager, 'function')
  })

  it('should export and use getModel', async () => {
    await clearRegistry()

    const userSchema = new Schema({
      name: { type: String, required: true }
    })

    // Create a model
    const User = model('IndexExportUser', userSchema)

    // Get the model using getModel
    const RetrievedUser = getModel('IndexExportUser')

    assert.ok(RetrievedUser)
    assert.strictEqual(User, RetrievedUser)
  })

  it('should export and use getDefaultDatabase', async () => {
    await clearRegistry()

    const db = getDefaultDatabase()

    assert.ok(db)
    assert.strictEqual(typeof db.model, 'function')
  })

  it('should reference storage strategies for coverage', () => {
    // These imports ensure the export lines in index.ts are covered
    // The actual functionality is tested in storage-specific test files
    assert.ok(MemoryStorageStrategy, 'MemoryStorageStrategy should be exported')
    assert.ok(FileStorageStrategy, 'FileStorageStrategy should be exported')
    assert.ok(SqliteStorageStrategy, 'SqliteStorageStrategy should be exported')
  })

  it('should use memory storage via createDatabase', async () => {
    await clearRegistry()

    // Create a database with memory storage
    const memoryDb = createDatabase({
      storage: 'memory'
    })

    const testSchema = new Schema({
      value: { type: Number, required: true }
    })

    const TestModel = memoryDb.model('TestModel', testSchema)

    // Verify the model works
    const doc = await TestModel.create({ value: 42 })
    assert.strictEqual(doc.value, 42)

    // Verify we can retrieve it
    const found = await TestModel.findById(doc._id)
    assert.ok(found)
    assert.strictEqual(found.value, 42)
  })

  it('should use file storage via createDatabase', async () => {
    await clearRegistry()

    // Create a database with file storage
    const fileDb = createDatabase({
      storage: 'file',
      file: {
        dataPath: './data/temp-file-test',
        persistMode: 'immediate'
      }
    })

    const testSchema = new Schema({
      name: { type: String, required: true }
    })

    const FileTestModel = fileDb.model('FileTestModel', testSchema)

    // Verify the model works
    const doc = await FileTestModel.create({ name: 'test' })
    assert.strictEqual(doc.name, 'test')

    // Verify we can retrieve it
    const found = await FileTestModel.findById(doc._id)
    assert.ok(found)
    assert.strictEqual(found.name, 'test')
  })

  it('should use sqlite storage via createDatabase', async () => {
    await clearRegistry()

    // Create a database with sqlite storage
    const sqliteDb = createDatabase({
      storage: 'sqlite',
      sqlite: {
        dataPath: ':memory:'
      }
    })

    const testSchema = new Schema({
      title: { type: String, required: true }
    })

    const SqliteTestModel = sqliteDb.model('SqliteTestModel', testSchema)

    // Verify the model works
    const doc = await SqliteTestModel.create({ title: 'sqlite test' })
    assert.strictEqual(doc.title, 'sqlite test')

    // Verify we can retrieve it
    const found = await SqliteTestModel.findById(doc._id)
    assert.ok(found)
    assert.strictEqual(found.title, 'sqlite test')
  })
})
