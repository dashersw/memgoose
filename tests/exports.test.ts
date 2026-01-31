import { test } from 'node:test'
import assert from 'node:assert'
import {
  Model,
  model,
  QueryBuilder,
  FindQueryBuilder,
  Schema,
  ValidationError,
  VirtualType,
  clearRegistry,
  Document,
  ObjectId,
  Types
} from '../index'
import memgoose from '../index'

// Test that all exports from index.ts are accessible and functional
test('Module Exports', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should export Model class', async () => {
    const User = new Model()
    await User.create({ name: 'Test' })
    assert.ok(User)
  })

  await t.test('should export QueryBuilder class', async () => {
    assert.ok(QueryBuilder)
    // QueryBuilder is used internally by model.find()
    const User = model('UserQB', new Schema({}))
    await User.create({ name: 'Test' })
    const results = await User.find()
    assert.ok(results)
  })

  await t.test('should export FindQueryBuilder class', async () => {
    assert.ok(FindQueryBuilder)
    // FindQueryBuilder is used internally by model.find()
    const User = model('UserFQB', new Schema({}))
    await User.create({ name: 'Test' })
    const queryBuilder = User.find()
    assert.ok(queryBuilder instanceof FindQueryBuilder)
  })

  await t.test('should export VirtualType class', async () => {
    const vt = new VirtualType()
    vt.get(doc => doc.test)
    assert.ok(vt)
  })

  await t.test('should export ValidationError class', async () => {
    const error = new ValidationError('Test error')
    assert.strictEqual(error.name, 'ValidationError')
    assert.strictEqual(error.message, 'Test error')
  })

  await t.test('should export Document class', async () => {
    assert.ok(Document)
    assert.strictEqual(typeof Document, 'function')
    // Document can be instantiated (for mocking purposes)
    const doc = new Document()
    assert.ok(doc)
    assert.strictEqual(typeof doc.toJSON, 'function')
    assert.strictEqual(typeof doc.toObject, 'function')
  })

  await t.test(
    'Document.save() should throw error when called on standalone instance',
    async () => {
      const doc = new Document()
      await assert.rejects(
        async () => await doc.save(),
        /save\(\) must be called on a document retrieved from a Model/
      )
    }
  )

  await t.test('Document.toJSON() and toObject() should return object copies', async () => {
    const doc = new Document()
    ;(doc as any).name = 'Test'
    ;(doc as any).value = 42

    const json = doc.toJSON()
    const obj = doc.toObject()

    assert.strictEqual(json.name, 'Test')
    assert.strictEqual(json.value, 42)
    assert.strictEqual(obj.name, 'Test')
    assert.strictEqual(obj.value, 42)

    // Should be copies, not the same reference
    json.name = 'Modified'
    assert.strictEqual((doc as any).name, 'Test') // Original unchanged
  })

  await t.test('Document class can be extended', async () => {
    class MyDocument extends Document {
      name!: string

      greet() {
        return `Hello, ${this.name}`
      }
    }

    const doc = new MyDocument()
    doc.name = 'World'

    assert.ok(doc instanceof Document)
    assert.ok(doc instanceof MyDocument)
    assert.strictEqual(doc.greet(), 'Hello, World')
    assert.strictEqual(typeof doc.toJSON, 'function')
  })

  await t.test('should export Schema.Types.ObjectId', async () => {
    assert.ok(Schema.Types)
    assert.ok(Schema.Types.ObjectId)
    assert.strictEqual(Schema.Types.ObjectId, ObjectId)
    // Can create ObjectId using Schema.Types.ObjectId
    const id = new Schema.Types.ObjectId()
    assert.ok(id)
    assert.strictEqual(id.toString().length, 24)
  })

  await t.test('should export Types.ObjectId', async () => {
    assert.ok(Types)
    assert.ok(Types.ObjectId)
    assert.strictEqual(Types.ObjectId, ObjectId)
  })

  await t.test('Schema.Types.ObjectId should work in schema definition with ref', async () => {
    const authorSchema = new Schema({
      name: { type: String, required: true }
    })

    const bookSchema = new Schema({
      title: String,
      authorId: { type: Schema.Types.ObjectId, ref: 'ExportTestAuthor' }
    })

    const Author = model('ExportTestAuthor', authorSchema)
    const Book = model('ExportTestBook', bookSchema)

    const author = await Author.create({ name: 'Jane Austen' })
    const book = await Book.create({ title: 'Pride and Prejudice', authorId: author._id })

    assert.ok(book.authorId)
    assert.strictEqual(book.authorId.toString(), author._id.toString())

    // Verify populate works with Schema.Types.ObjectId ref
    const books = await Book.find({ _id: book._id }).populate('authorId')
    assert.ok(books.length > 0)
    assert.strictEqual((books[0].authorId as any).name, 'Jane Austen')
  })

  await t.test('Types.ObjectId should work for creating and validating IDs', async () => {
    // Create new ObjectId
    const id1 = new Types.ObjectId()
    assert.ok(Types.ObjectId.isValid(id1))

    // Create from string
    const hexString = '507f1f77bcf86cd799439011'
    const id2 = new Types.ObjectId(hexString)
    assert.strictEqual(id2.toString(), hexString)

    // Validate arbitrary strings
    assert.ok(Types.ObjectId.isValid('507f1f77bcf86cd799439011'))
    assert.ok(!Types.ObjectId.isValid('invalid'))
    assert.ok(!Types.ObjectId.isValid(null))
  })

  await t.test('should have default export with mongoose-compatible structure', async () => {
    // Default export should have all the main properties
    assert.ok(memgoose.Schema)
    assert.ok(memgoose.Model)
    assert.ok(memgoose.Document)
    assert.ok(memgoose.ObjectId)
    assert.ok(memgoose.Types)
    assert.ok(memgoose.Types.ObjectId)
    assert.ok(memgoose.model)
    assert.ok(memgoose.connect)

    // Schema.Types.ObjectId should work through default export
    assert.ok(memgoose.Schema.Types)
    assert.ok(memgoose.Schema.Types.ObjectId)
    assert.strictEqual(memgoose.Schema.Types.ObjectId, memgoose.ObjectId)
  })

  await t.test('should use default export like mongoose', async () => {
    await memgoose.clearRegistry()

    // This mimics: import mongoose from 'mongoose'
    const userSchema = new memgoose.Schema({
      name: String,
      friend: { type: memgoose.Schema.Types.ObjectId, ref: 'User' }
    })

    const User = memgoose.model('DefaultExportUser', userSchema)
    const user = await User.create({ name: 'Alice' })

    assert.ok(user)
    assert.strictEqual(user.name, 'Alice')
  })

  await t.test('default export should support full CRUD workflow', async () => {
    await memgoose.clearRegistry()

    const taskSchema = new memgoose.Schema({
      title: { type: String, required: true },
      completed: { type: Boolean, default: false },
      priority: Number
    })

    const Task = memgoose.model('DefaultExportTask', taskSchema)

    // Create
    const task = await Task.create({ title: 'Test task', priority: 1 })
    assert.ok(task._id)
    assert.strictEqual(task.title, 'Test task')
    assert.strictEqual(task.completed, false)

    // Read
    const found = await Task.findById(task._id)
    assert.ok(found)
    assert.strictEqual(found.title, 'Test task')

    // Update
    await Task.updateOne({ _id: task._id }, { $set: { completed: true } })
    const updated = await Task.findById(task._id)
    assert.strictEqual(updated!.completed, true)

    // Delete
    await Task.deleteOne({ _id: task._id })
    const deleted = await Task.findById(task._id)
    assert.strictEqual(deleted, null)
  })

  await t.test('default export createDatabase should work', async () => {
    await memgoose.clearRegistry()

    const db = memgoose.createDatabase({ storage: 'memory' })
    assert.ok(db)

    const itemSchema = new memgoose.Schema({ name: String })
    const Item = db.model('CreateDbItem', itemSchema)

    const item = await Item.create({ name: 'test item' })
    assert.strictEqual(item.name, 'test item')
  })

  await t.test('default export getModel should retrieve registered models', async () => {
    await memgoose.clearRegistry()

    const widgetSchema = new memgoose.Schema({ label: String })
    const Widget = memgoose.model('DefaultWidget', widgetSchema)

    const retrieved = memgoose.getModel('DefaultWidget')
    assert.strictEqual(Widget, retrieved)
  })

  await t.test('default export ValidationError should work', async () => {
    const error = new memgoose.ValidationError('Field is required')
    assert.strictEqual(error.name, 'ValidationError')
    assert.strictEqual(error.message, 'Field is required')
    assert.ok(error instanceof Error)
  })

  await t.test('default export DuplicateKeyError should work', async () => {
    const error = new memgoose.DuplicateKeyError(['email'], { email: 'test@example.com' })
    assert.strictEqual(error.name, 'DuplicateKeyError')
    assert.strictEqual(error.code, 11000)
    assert.deepStrictEqual(error.keyPattern, { email: 1 })
    assert.deepStrictEqual(error.keyValue, { email: 'test@example.com' })
  })

  await t.test('default export ObjectId methods should work', async () => {
    const id = new memgoose.ObjectId()

    // toString
    assert.strictEqual(id.toString().length, 24)

    // toHexString
    assert.strictEqual(id.toHexString(), id.toString())

    // getTimestamp
    const timestamp = id.getTimestamp()
    assert.ok(timestamp instanceof Date)
    assert.ok(timestamp.getTime() > 0)

    // isValid
    assert.ok(memgoose.ObjectId.isValid(id))
    assert.ok(memgoose.ObjectId.isValid(id.toString()))
    assert.ok(!memgoose.ObjectId.isValid('not-valid'))

    // createFromTime
    const timeId = memgoose.ObjectId.createFromTime(1234567890)
    assert.ok(timeId instanceof memgoose.ObjectId)

    // createFromHexString
    const hexId = memgoose.ObjectId.createFromHexString('507f1f77bcf86cd799439011')
    assert.strictEqual(hexId.toString(), '507f1f77bcf86cd799439011')
  })
})
