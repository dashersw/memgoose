import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model, clearRegistry } from '../index'

interface UserDoc {
  name: string
  age: number
  email?: string
  validated?: boolean
}

test('Hooks', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should execute pre-save hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let hookCalled = false
    userSchema.pre('save', ({ doc }) => {
      hookCalled = true
      doc.validated = true
    })

    const User = model('User', userSchema)
    await User.create({ name: 'Alice', age: 25 })

    assert.strictEqual(hookCalled, true)

    const result = await User.findOne({ name: 'Alice' })
    assert.strictEqual(result.validated, true)
  })

  await t.test('should execute post-save hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    const savedDocs: any[] = []
    userSchema.post('save', ({ doc }) => {
      savedDocs.push(doc)
    })

    const User = model('User', userSchema)
    await User.create({ name: 'Bob', age: 30 })

    assert.strictEqual(savedDocs.length, 1)
    assert.strictEqual(savedDocs[0].name, 'Bob')
  })

  await t.test('should execute async hooks', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    userSchema.pre('save', async ({ doc }) => {
      await new Promise(resolve => setTimeout(resolve, 10))
      doc.email = `${doc.name.toLowerCase()}@example.com`
    })

    const User = model('User', userSchema)
    await User.create({ name: 'Charlie', age: 35 })

    const result = await User.findOne({ name: 'Charlie' })
    assert.strictEqual(result.email, 'charlie@example.com')
  })

  await t.test('should execute multiple hooks in order', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    const executionOrder: string[] = []

    userSchema.pre('save', () => {
      executionOrder.push('pre1')
    })
    userSchema.pre('save', () => {
      executionOrder.push('pre2')
    })
    userSchema.post('save', () => {
      executionOrder.push('post1')
    })
    userSchema.post('save', () => {
      executionOrder.push('post2')
    })

    const User = model('User', userSchema)
    await User.create({ name: 'Diana', age: 28 })

    assert.deepStrictEqual(executionOrder, ['pre1', 'pre2', 'post1', 'post2'])
  })

  await t.test('should execute pre-delete hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let deletedName = ''
    userSchema.pre('delete', ({ query }) => {
      deletedName = query.name
    })

    const User = model('User', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    await User.deleteOne({ name: 'Bob' })

    assert.strictEqual(deletedName, 'Bob')
  })

  await t.test('should execute post-delete hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let deletedCount = 0
    userSchema.post('delete', ({ deletedCount: count }) => {
      deletedCount = count
    })

    const User = model('User', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    await User.deleteMany({ age: { $gte: 25 } })

    assert.strictEqual(deletedCount, 2)
  })

  await t.test('should execute pre-update hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let updateQuery: any = null
    userSchema.pre('update', ({ query }) => {
      updateQuery = query
    })

    const User = model('User', userSchema)
    await User.create({ name: 'Alice', age: 25 })

    await User.updateOne({ name: 'Alice' }, { $inc: { age: 1 } })

    assert.deepStrictEqual(updateQuery, { name: 'Alice' })
  })

  await t.test('should execute post-update hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let modifiedCount = 0
    userSchema.post('update', ({ modifiedCount: count }) => {
      modifiedCount = count
    })

    const User = model('User', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    await User.updateMany({ age: { $gte: 25 } }, { $inc: { age: 1 } })

    assert.strictEqual(modifiedCount, 2)
  })

  await t.test('should execute pre-findOne hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let queriedName = ''
    userSchema.pre('findOne', ({ query }) => {
      queriedName = query.name
    })

    const User = model('User', userSchema)
    await User.create({ name: 'Alice', age: 25 })

    await User.findOne({ name: 'Alice' })

    assert.strictEqual(queriedName, 'Alice')
  })

  await t.test('should execute post-findOne hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let foundDoc: any = null
    userSchema.post('findOne', ({ result }) => {
      foundDoc = result
    })

    const User = model('User', userSchema)
    await User.create({ name: 'Bob', age: 30 })

    await User.findOne({ name: 'Bob' })

    assert.ok(foundDoc)
    assert.strictEqual(foundDoc.name, 'Bob')
  })

  await t.test('hooks should work with insertMany', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let saveCount = 0
    userSchema.pre('save', () => {
      saveCount++
    })

    const User = model('User', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35 }
    ])

    assert.strictEqual(saveCount, 3) // Pre-save called for each doc
  })

  await t.test('should execute pre-find hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let queriedAge = 0
    userSchema.pre('find', ({ query }) => {
      if (query.age && query.age.$gte) {
        queriedAge = query.age.$gte
      }
    })

    const User = model('User', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    await User.find({ age: { $gte: 30 } })

    assert.strictEqual(queriedAge, 30)
  })

  await t.test('should execute post-find hook', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let resultCount = 0
    userSchema.post('find', ({ results }) => {
      resultCount = results.length
    })

    const User = model('User', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35 }
    ])

    await User.find({ age: { $gte: 30 } })

    assert.strictEqual(resultCount, 2) // Bob and Charlie
  })

  await t.test('should handle multiple pre-hooks with loop execution', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    const hookExecutions: string[] = []

    // Add multiple pre-hooks to ensure loop executes
    userSchema.pre('save', ({ doc }) => {
      hookExecutions.push('hook1')
      doc.validated = true
    })

    userSchema.pre('save', () => {
      hookExecutions.push('hook2')
    })

    userSchema.pre('save', () => {
      hookExecutions.push('hook3')
    })

    const User = model('UserWithManyHooks', userSchema)
    await User.create({ name: 'Test', age: 30 })

    assert.strictEqual(hookExecutions.length, 3)
    assert.deepStrictEqual(hookExecutions, ['hook1', 'hook2', 'hook3'])
  })

  await t.test('should execute post-delete hook when deleteMany finds no matches', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let hookExecuted = false
    let deletedCountInHook = -1
    userSchema.post('delete', ({ deletedCount }) => {
      hookExecuted = true
      deletedCountInHook = deletedCount
    })

    const User = model('UserPostDeleteNoMatch', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    // Delete with no matches
    const result = await User.deleteMany({ name: 'Zack' })

    assert.strictEqual(result.deletedCount, 0)
    assert.strictEqual(hookExecuted, true)
    assert.strictEqual(deletedCountInHook, 0)
  })

  await t.test('should execute post-delete hook when deleteOne finds no matches', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let hookExecuted = false
    let deletedCountInHook = -1
    userSchema.post('delete', ({ deletedCount }) => {
      hookExecuted = true
      deletedCountInHook = deletedCount
    })

    const User = model('UserPostDeleteOneNoMatch', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    // Delete one with no matches
    const result = await User.deleteOne({ name: 'Nobody' })

    assert.strictEqual(result.deletedCount, 0)
    assert.strictEqual(hookExecuted, true)
    assert.strictEqual(deletedCountInHook, 0)
  })

  await t.test('should execute post-update hook when updateMany finds no matches', async () => {
    const userSchema = new Schema<UserDoc>({
      name: String,
      age: Number
    })

    let hookExecuted = false
    let modifiedCountInHook = -1
    userSchema.post('update', ({ modifiedCount }) => {
      hookExecuted = true
      modifiedCountInHook = modifiedCount
    })

    const User = model('UserPostUpdateNoMatch', userSchema)
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 }
    ])

    // Update with no matches
    const result = await User.updateMany({ name: 'Nobody' }, { $inc: { age: 1 } })

    assert.strictEqual(result.modifiedCount, 0)
    assert.strictEqual(hookExecuted, true)
    assert.strictEqual(modifiedCountInHook, 0)
  })
})
