import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, createDatabase } from '../index'
import * as fs from 'fs'
import * as path from 'path'

describe('Schema Tracking', () => {
  const testDir = path.join('data', 'test-schema-tracking')

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  interface User {
    name: string
    email: string
    age: number
  }

  it('should record schema when model is created with SQLite storage', async () => {
    const db = createDatabase({
      storage: 'sqlite',
      sqlite: { dataPath: testDir }
    })

    const userSchema = new Schema<User>({
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      age: { type: Number, min: 0 }
    })

    userSchema.index('email', { unique: true })

    const User = db.model('User', userSchema)

    // Trigger initialization by inserting a document
    await User.create({ name: 'Alice', email: 'alice@example.com', age: 25 })

    // Access storage to check schema
    const storage = (User as any)._storage
    const schema = await storage.getSchema('User')

    assert.ok(schema, 'Schema should be recorded')
    assert.strictEqual(schema.modelName, 'User')
    assert.ok(schema.version, 'Schema should have a version')
    assert.ok(schema.definition, 'Schema should have definition')
    assert.ok(Array.isArray(schema.indexes), 'Schema should have indexes array')
    assert.ok(schema.createdAt instanceof Date, 'Schema should have createdAt')
    assert.ok(schema.updatedAt instanceof Date, 'Schema should have updatedAt')

    await db.disconnect()
  })

  it('should record schema when model is created with File storage', async () => {
    const db = createDatabase({
      storage: 'file',
      file: { dataPath: testDir, persistMode: 'immediate' }
    })

    const userSchema = new Schema<User>({
      name: { type: String, required: true },
      email: { type: String, required: true },
      age: Number
    })

    const User = db.model('User', userSchema)

    // Trigger initialization
    await User.create({ name: 'Bob', email: 'bob@example.com', age: 30 })

    // Check that schema file was created
    const schemaFile = path.join(testDir, 'User.schema.json')
    assert.ok(fs.existsSync(schemaFile), 'Schema file should exist')

    // Read and verify schema content
    const schemaContent = JSON.parse(fs.readFileSync(schemaFile, 'utf-8'))
    assert.strictEqual(schemaContent.modelName, 'User')
    assert.ok(schemaContent.version, 'Schema should have version')
    assert.ok(schemaContent.definition, 'Schema should have definition')

    await db.disconnect()
  })

  it('should update schema version when schema changes', async () => {
    const db = createDatabase({
      storage: 'sqlite',
      sqlite: { dataPath: testDir }
    })

    // Create first version of schema
    const schema1 = new Schema<User>({
      name: String,
      email: String,
      age: Number
    })

    const User1 = db.model('User', schema1)
    await User1.create({ name: 'Charlie', email: 'charlie@example.com', age: 35 })

    const storage1 = (User1 as any)._storage
    const initialSchema = await storage1.getSchema('User')
    const initialVersion = initialSchema?.version

    assert.ok(initialVersion, 'Initial schema should have version')

    await db.disconnect()

    // Create second version with different schema
    const db2 = createDatabase({
      storage: 'sqlite',
      sqlite: { dataPath: testDir }
    })

    const schema2 = new Schema<User>({
      name: String,
      email: String,
      age: { type: Number, min: 0, max: 120 } // Added validation
    })

    schema2.index('email') // Added index

    const User2 = db2.model('User', schema2)
    await User2.findOne({}) // Trigger initialization

    const storage2 = (User2 as any)._storage
    const updatedSchema = await storage2.getSchema('User')
    const updatedVersion = updatedSchema?.version

    assert.ok(updatedVersion, 'Updated schema should have version')
    assert.notStrictEqual(
      initialVersion,
      updatedVersion,
      'Schema version should change when schema changes'
    )

    await db2.disconnect()
  })

  it('should record schema immediately on table creation, not on first migration', async () => {
    const db = createDatabase({
      storage: 'sqlite',
      sqlite: { dataPath: testDir }
    })

    const userSchema = new Schema<User>({
      name: String,
      email: String,
      age: Number
    })

    const User = db.model('User', userSchema)

    // Check schema exists BEFORE any documents are inserted
    // Just trigger initialization
    await User.countDocuments({})

    const storage = (User as any)._storage
    const schema = await storage.getSchema('User')

    assert.ok(schema, 'Schema should be recorded immediately on table creation')
    assert.strictEqual(schema.modelName, 'User')
    assert.ok(schema.version, 'Schema should have a version')

    await db.disconnect()
  })

  it('should serialize schema definition correctly', () => {
    interface Product {
      name: string
      price: number
      tags: string[]
    }

    const productSchema = new Schema<Product>({
      name: { type: String, required: true },
      price: { type: Number, min: 0 },
      tags: [String]
    })

    productSchema.index('name', { unique: true })
    productSchema.index(['price'])

    const schemaJSON = productSchema.toJSON()

    assert.ok(schemaJSON.definition, 'Should have definition')
    assert.ok(Array.isArray(schemaJSON.indexes), 'Should have indexes array')
    assert.strictEqual(schemaJSON.indexes.length, 2, 'Should have 2 indexes')

    // Check that unique index is marked correctly
    const uniqueIndex = schemaJSON.indexes.find(idx => idx.fields[0] === 'name')
    assert.ok(uniqueIndex, 'Should have name index')
    assert.strictEqual(uniqueIndex.unique, true, 'Name index should be unique')

    // Check that non-unique index is marked correctly
    const priceIndex = schemaJSON.indexes.find(idx => idx.fields[0] === 'price')
    assert.ok(priceIndex, 'Should have price index')
    assert.strictEqual(priceIndex.unique, false, 'Price index should not be unique')

    // Check version is generated
    assert.ok(schemaJSON.version, 'Should have version hash')
  })
})




