import { test } from 'node:test'
import assert from 'node:assert'
import { model, Schema, clearRegistry } from '../index'

test('Document Save Method', async t => {
  await t.test('should save a document after modifying it', async () => {
    const User = model('SaveUser1', new Schema({}))
    await User.create({ name: 'Alice', age: 25, city: 'New York' })

    const user = await User.findOne({ name: 'Alice' })
    assert.ok(user)
    assert.strictEqual(user.age, 25)

    // Modify the document
    user.age = 26
    user.city = 'Boston'

    // Save it back
    await user.save()

    // Verify changes persisted
    const updated = await User.findOne({ name: 'Alice' })
    assert.ok(updated)
    assert.strictEqual(updated.age, 26)
    assert.strictEqual(updated.city, 'Boston')
  })

  await t.test('should save a document after adding new fields', async () => {
    const User = model('SaveUser2', new Schema({}))
    await User.create({ name: 'Bob', age: 30 })

    const user = await User.findOne({ name: 'Bob' })
    assert.ok(user)

    // Add a new field
    user.email = 'bob@example.com'

    await user.save()

    // Verify new field persisted
    const updated = await User.findOne({ name: 'Bob' })
    assert.ok(updated)
    assert.strictEqual(updated.email, 'bob@example.com')
  })

  await t.test('should save a document after deleting fields', async () => {
    const User = model('SaveUser3', new Schema({}))
    await User.create({ name: 'Charlie', age: 35, city: 'London' })

    const user = await User.findOne({ name: 'Charlie' })
    assert.ok(user)

    // Delete a field
    delete user.city

    await user.save()

    // Verify field was removed
    const updated = await User.findOne({ name: 'Charlie' })
    assert.ok(updated)
    assert.strictEqual(updated.city, undefined)
  })

  await t.test('should validate document on save', async () => {
    const userSchema = new Schema({
      name: { type: String, required: true },
      age: { type: Number, min: 0, max: 120 }
    })
    const User = model('SaveUser4', userSchema)
    await User.create({ name: 'Diana', age: 28 })

    const user = await User.findOne({ name: 'Diana' })
    assert.ok(user)

    // Set invalid age
    user.age = 150

    // Should throw validation error
    await assert.rejects(async () => await user.save(), /age must be at most 120/)
  })

  await t.test('should apply timestamps on save', async () => {
    const userSchema = new Schema(
      {
        name: String,
        age: Number
      },
      { timestamps: true }
    )
    const User = model('SaveUser4', userSchema)

    const created = await User.create({ name: 'Eve', age: 30 })
    const createdAt = created.createdAt
    const updatedAt1 = created.updatedAt

    assert.ok(createdAt)
    assert.ok(updatedAt1)

    // Wait a bit to ensure timestamp changes
    await new Promise(resolve => setTimeout(resolve, 10))

    const user = await User.findOne({ name: 'Eve' })
    assert.ok(user)

    user.age = 31
    await user.save()

    // Check from the database to verify persistence
    const updated = await User.findOne({ name: 'Eve' })

    // updatedAt should have changed, createdAt should not
    assert.strictEqual(updated?.createdAt.getTime(), createdAt.getTime())
    assert.ok(updated?.updatedAt.getTime() > updatedAt1.getTime())
  })

  await t.test('should execute pre-save hooks', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number
    })

    let hookCalled = false
    userSchema.pre('save', ({ doc }) => {
      hookCalled = true
      doc.modified = true
    })

    const User = model('SaveUser4', userSchema)
    await User.create({ name: 'Frank', age: 40 })

    hookCalled = false // Reset
    const user = await User.findOne({ name: 'Frank' })
    assert.ok(user)

    user.age = 41
    await user.save()

    assert.strictEqual(hookCalled, true)
    assert.strictEqual(user.modified, true)
  })

  await t.test('should execute post-save hooks', async () => {
    const userSchema = new Schema({
      name: String,
      age: Number
    })

    let postHookCalled = false
    let savedDoc: any = null
    userSchema.post('save', ({ doc }) => {
      postHookCalled = true
      savedDoc = doc
    })

    const User = model('SaveUser4', userSchema)
    await User.create({ name: 'George', age: 50 })

    postHookCalled = false // Reset
    const user = await User.findOne({ name: 'George' })
    assert.ok(user)

    user.age = 51
    await user.save()

    assert.strictEqual(postHookCalled, true)
    assert.ok(savedDoc)
    assert.strictEqual(savedDoc.age, 51)
  })

  await t.test('should check unique constraints on save', async () => {
    const userSchema = new Schema({
      email: { type: String, unique: true },
      name: String
    })
    const User = model('SaveUser4', userSchema)

    await User.create({ email: 'alice@example.com', name: 'Alice' })
    await User.create({ email: 'bob@example.com', name: 'Bob' })

    const bob = await User.findOne({ name: 'Bob' })
    assert.ok(bob)

    // Try to change to a duplicate email
    bob.email = 'alice@example.com'

    // Should throw unique constraint error
    await assert.rejects(async () => await bob.save(), /duplicate key error/)
  })

  await t.test('should allow multiple saves on same document', async () => {
    const User = model('SaveUser7', new Schema({}))
    await User.create({ name: 'Helen', age: 25 })

    const user = await User.findOne({ name: 'Helen' })
    assert.ok(user)

    // First save
    user.age = 26
    await user.save()

    const check1 = await User.findOne({ name: 'Helen' })
    assert.strictEqual(check1?.age, 26)

    // Second save
    user.age = 27
    await user.save()

    const check2 = await User.findOne({ name: 'Helen' })
    assert.strictEqual(check2?.age, 27)

    // Third save
    user.age = 28
    await user.save()

    const check3 = await User.findOne({ name: 'Helen' })
    assert.strictEqual(check3?.age, 28)
  })

  await t.test('should save with nested objects', async () => {
    const User = model('SaveUser8', new Schema({}))
    await User.create({
      name: 'Ivan',
      address: { street: '123 Main St', city: 'New York' }
    })

    const user = await User.findOne({ name: 'Ivan' })
    assert.ok(user)

    // Modify nested object
    user.address.city = 'Boston'
    user.address.zip = '02101'

    await user.save()

    const updated = await User.findOne({ name: 'Ivan' })
    assert.ok(updated)
    assert.strictEqual(updated.address.city, 'Boston')
    assert.strictEqual(updated.address.zip, '02101')
  })

  await t.test('should save with arrays', async () => {
    const User = model('SaveUser9', new Schema({}))
    await User.create({ name: 'Jane', tags: ['nodejs', 'typescript'] })

    const user = await User.findOne({ name: 'Jane' })
    assert.ok(user)

    // Modify array
    user.tags.push('mongodb')

    await user.save()

    const updated = await User.findOne({ name: 'Jane' })
    assert.ok(updated)
    assert.deepStrictEqual(updated.tags, ['nodejs', 'typescript', 'mongodb'])
  })

  await t.test('should not save virtual properties', async () => {
    const userSchema = new Schema({
      firstName: String,
      lastName: String
    })

    userSchema.virtual('fullName').get(doc => `${doc.firstName} ${doc.lastName}`)

    const User = model('SaveUser4', userSchema)
    await User.create({ firstName: 'John', lastName: 'Doe' })

    const user = await User.findOne({ firstName: 'John' })
    assert.ok(user)
    assert.strictEqual(user.fullName, 'John Doe')

    // Try to modify virtual (should not be saved)
    user.fullName = 'Jane Smith'
    user.firstName = 'Johnny'

    await user.save()

    const updated = await User.findOne({ firstName: 'Johnny' })
    assert.ok(updated)
    assert.strictEqual(updated.firstName, 'Johnny')
    assert.strictEqual(updated.lastName, 'Doe')
    assert.strictEqual(updated.fullName, 'Johnny Doe') // Virtual recalculated
  })

  await t.test('lean queries should not have save method', async () => {
    const User = model('SaveUser10', new Schema({}))
    await User.create({ name: 'Kevin', age: 35 })

    const users = await User.find({ name: 'Kevin' }).lean(true)
    assert.ok(users.length > 0)
    const user = users[0]
    assert.strictEqual(typeof user.save, 'undefined')
  })

  await t.test('should throw error when saving deleted document', async () => {
    const User = model('SaveUser11', new Schema({}))
    await User.create({ name: 'Larry', age: 40 })

    const user = await User.findOne({ name: 'Larry' })
    assert.ok(user)

    // Delete the document
    await User.deleteOne({ name: 'Larry' })

    // Try to save the stale reference
    user.age = 41
    await assert.rejects(
      async () => await user.save(),
      /Document has been deleted and cannot be saved/
    )
  })

  await t.test('should work with getters and setters', async () => {
    const userSchema = new Schema({
      email: {
        type: String,
        set: (val: string) => val.toLowerCase(),
        get: (val: string) => val
      },
      name: String
    })

    const User = model('SaveUser4', userSchema)
    await User.create({ email: 'MIKE@EXAMPLE.COM', name: 'Mike' })

    const user = await User.findOne({ name: 'Mike' })
    assert.ok(user)

    // Email should have been lowercased by setter
    assert.strictEqual(user.email, 'mike@example.com')

    // Change email with mixed case
    user.email = 'MIKE.NEW@EXAMPLE.COM'
    await user.save()

    const updated = await User.findOne({ name: 'Mike' })
    assert.ok(updated)
    // Setter should have lowercased it
    assert.strictEqual(updated.email, 'mike.new@example.com')
  })

  await t.test('should update indexes after save', async () => {
    const userSchema = new Schema({
      email: { type: String },
      name: String
    })
    userSchema.index('email')

    const User = model('SaveUser4', userSchema)
    await User.create({ email: 'nancy@example.com', name: 'Nancy' })

    const user = await User.findOne({ name: 'Nancy' })
    assert.ok(user)

    // Change indexed field
    user.email = 'nancy.new@example.com'
    await user.save()

    // Should be able to find by new email using index
    const byNewEmail = await User.findOne({ email: 'nancy.new@example.com' })
    assert.ok(byNewEmail)
    assert.strictEqual(byNewEmail.name, 'Nancy')

    // Old email should not find anything
    const byOldEmail = await User.findOne({ email: 'nancy@example.com' })
    assert.strictEqual(byOldEmail, null)
  })

  await t.test('should work with documents from find() results', async () => {
    const User = model('SaveUser12', new Schema({}))
    await User.insertMany([
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Charlie', age: 35 }
    ])

    const users = await User.find({ age: { $gte: 30 } })
    assert.strictEqual(users.length, 2)

    // Modify both documents
    for (const user of users) {
      user.age += 1
      await user.save()
    }

    // Verify changes
    const bob = await User.findOne({ name: 'Bob' })
    const charlie = await User.findOne({ name: 'Charlie' })

    assert.strictEqual(bob?.age, 31)
    assert.strictEqual(charlie?.age, 36)
  })

  await t.test('should work with documents from create()', async () => {
    const User = model('SaveUser13', new Schema({}))
    const user = await User.create({ name: 'Oliver', age: 45 })

    // Modify the just-created document
    user.age = 46
    await user.save()

    const updated = await User.findOne({ name: 'Oliver' })
    assert.strictEqual(updated?.age, 46)
  })

  await t.test('should return updated document with virtuals after save', async () => {
    const userSchema = new Schema({
      firstName: String,
      lastName: String,
      age: Number
    })

    userSchema.virtual('fullName').get(doc => `${doc.firstName} ${doc.lastName}`)

    const User = model('SaveUser4', userSchema)
    await User.create({ firstName: 'Peter', lastName: 'Parker', age: 25 })

    const user = await User.findOne({ firstName: 'Peter' })
    assert.ok(user)

    user.age = 26
    const saved = await user.save()

    // Saved document should have virtuals
    assert.ok(saved)
    assert.strictEqual(saved.fullName, 'Peter Parker')
    assert.strictEqual(saved.age, 26)
  })

  await t.test('should handle save with required field validation', async () => {
    const userSchema = new Schema({
      name: { type: String, required: true },
      email: { type: String, required: true }
    })

    const User = model('SaveUser4', userSchema)
    await User.create({ name: 'Quinn', email: 'quinn@example.com' })

    const user = await User.findOne({ name: 'Quinn' })
    assert.ok(user)

    // Try to delete required field
    delete user.email

    await assert.rejects(async () => await user.save(), /email is required/)
  })

  await t.test('should handle save with enum validation', async () => {
    const userSchema = new Schema({
      name: String,
      status: { type: String, enum: ['active', 'inactive', 'pending'] }
    })

    const User = model('SaveUser4', userSchema)
    await User.create({ name: 'Rachel', status: 'active' })

    const user = await User.findOne({ name: 'Rachel' })
    assert.ok(user)

    // Set invalid enum value
    user.status = 'invalid'

    await assert.rejects(async () => await user.save(), /status must be one of/)
  })

  await t.test('should not expose internal Symbol properties during iteration', async () => {
    const User = model('SaveUser6', new Schema({ name: String, age: Number }))
    await User.create({ name: 'Sam', age: 40 })

    const user = await User.findOne({ name: 'Sam' })
    assert.ok(user)

    // Get all enumerable keys
    const keys = Object.keys(user)
    const forInKeys: string[] = []
    for (const key in user) {
      forInKeys.push(key)
    }

    // Should not include any Symbol-based internal properties
    assert.ok(!keys.some(k => k.includes('original') || k.includes('model')))
    assert.ok(!forInKeys.some(k => k.includes('original') || k.includes('model')))

    // Should only have actual document fields
    assert.ok(keys.includes('name'))
    assert.ok(keys.includes('age'))
    assert.ok(keys.includes('_id'))
  })

  await t.test('should save when schema has no virtuals', async () => {
    clearRegistry()

    const userSchema = new Schema({ name: String })
    const User = model('User', userSchema)
    const user = await User.create({ name: 'Alice' })

    ;(user as any).name = 'Alicia'
    const saved = await (user as any).save()

    assert.strictEqual(saved.name, 'Alicia')
  })

  await t.test('should save document with virtuals in schema', async () => {
    clearRegistry()

    const userSchema = new Schema({ firstName: String, lastName: String })
    userSchema.virtual('fullName').get(doc => `${doc.firstName} ${doc.lastName}`)

    const User = model('User', userSchema)
    const user = await User.create({ firstName: 'Eve', lastName: 'Smith' })

    ;(user as any).firstName = 'Eva'
    const saved = await (user as any).save()

    assert.strictEqual(saved.firstName, 'Eva')
    assert.strictEqual((saved as any).fullName, 'Eva Smith')
  })

  await t.test('save with schema but no virtuals defined', async () => {
    clearRegistry()

    const userSchema = new Schema({ name: String, age: Number })
    const User = model('User', userSchema)
    const user = await User.create({ name: 'Helen', age: 40 })

    ;(user as any).age = 41
    const saved = await (user as any).save()

    assert.strictEqual(saved.age, 41)
  })
})
