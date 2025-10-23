import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import { Schema, createDatabase } from '../index'

describe('TTL Indexes', () => {
  let db: any
  let cleanupFunctions: Array<() => void> = []

  afterEach(async () => {
    // Clean up database and timers
    if (db) {
      await db.disconnect()
    }
    cleanupFunctions.forEach(fn => fn())
    cleanupFunctions = []
  })

  it('should create TTL index on schema', async () => {
    interface SessionInterface {
      sessionId: string
      createdAt: Date
      data: string
    }

    const sessionSchema = new Schema<SessionInterface>({
      sessionId: String,
      createdAt: Date,
      data: String
    })

    // Create TTL index - expire after 2 seconds
    sessionSchema.index('createdAt', { ttl: 2 })

    const ttlIndexes = sessionSchema.getTTLIndexes()
    assert.strictEqual(ttlIndexes.size, 1)
    assert.strictEqual(ttlIndexes.get('createdAt'), 2)
  })

  it('should automatically delete expired documents', async () => {
    interface SessionInterface {
      sessionId: string
      createdAt: Date
      data: string
    }

    const sessionSchema = new Schema<SessionInterface>({
      sessionId: String,
      createdAt: Date,
      data: String
    })

    // TTL: 1 second, check every 500ms
    sessionSchema.index('createdAt', { ttl: 1 })

    db = createDatabase()
    const Session = db.model('Session', sessionSchema)

    // Override TTL check interval for faster testing
    const ttlManager = (db as any)._ttlManager
    const modelName = (Session as any)._schema?.constructor?.name || 'UnknownModel'
    const key = `${modelName}_createdAt`

    // Unregister default interval and create faster one
    ttlManager.unregisterTTLIndex(key)
    ttlManager.registerTTLIndex(Session, 'createdAt', 1, 500)

    // Create session that should expire
    const oldDate = new Date(Date.now() - 3000) // 3 seconds ago (well past 1s TTL)
    await Session.create({
      sessionId: 'session1',
      createdAt: oldDate,
      data: 'old session'
    })

    // Create session that should NOT expire (future date to avoid timing issues)
    const futureDate = new Date(Date.now() + 10000) // 10 seconds in future
    await Session.create({
      sessionId: 'session2',
      createdAt: futureDate,
      data: 'current session'
    })

    // Initially, both should exist
    let count = await Session.countDocuments()
    assert.strictEqual(count, 2)

    // Wait for TTL cleanup (1 second for expiration + 500ms check interval + buffer)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // After cleanup, only the current session should remain
    count = await Session.countDocuments()
    assert.strictEqual(count, 1)

    const remaining = await Session.find()
    assert.strictEqual(remaining[0].sessionId, 'session2')
  })

  it('should support multiple TTL indexes', async () => {
    interface CachedData {
      key: string
      value: string
      accessedAt: Date
      createdAt: Date
    }

    const cacheSchema = new Schema<CachedData>({
      key: String,
      value: String,
      accessedAt: Date,
      createdAt: Date
    })

    // Different TTLs for different fields
    cacheSchema.index('accessedAt', { ttl: 5 })
    cacheSchema.index('createdAt', { ttl: 10 })

    const ttlIndexes = cacheSchema.getTTLIndexes()
    assert.strictEqual(ttlIndexes.size, 2)
    assert.strictEqual(ttlIndexes.get('accessedAt'), 5)
    assert.strictEqual(ttlIndexes.get('createdAt'), 10)

    db = createDatabase()
    const _Cache = db.model('Cache', cacheSchema)

    const ttlManager = (db as any)._ttlManager
    assert.strictEqual(ttlManager.getActiveCount(), 2)
  })

  it('should only create TTL index for single fields', async () => {
    interface Document {
      field1: string
      field2: string
      timestamp: Date
    }

    const schema = new Schema<Document>({
      field1: String,
      field2: String,
      timestamp: Date
    })

    // Single field - should work
    schema.index('timestamp', { ttl: 60 })

    // Compound index with TTL - should be ignored
    schema.index(['field1', 'field2'], { ttl: 120 })

    const ttlIndexes = schema.getTTLIndexes()
    assert.strictEqual(ttlIndexes.size, 1)
    assert.strictEqual(ttlIndexes.get('timestamp'), 60)
    assert.strictEqual(ttlIndexes.has('field1'), false)
    assert.strictEqual(ttlIndexes.has('field2'), false)
  })

  it('should cleanup TTL intervals on disconnect', async () => {
    interface SessionInterface {
      sessionId: string
      createdAt: Date
    }

    const sessionSchema = new Schema<SessionInterface>({
      sessionId: String,
      createdAt: Date
    })

    sessionSchema.index('createdAt', { ttl: 60 })

    db = createDatabase()
    const _Session = db.model('Session', sessionSchema)

    const ttlManager = (db as any)._ttlManager
    assert.strictEqual(ttlManager.getActiveCount(), 1)

    await db.disconnect()

    assert.strictEqual(ttlManager.getActiveCount(), 0)
  })

  it('should work with file storage', async () => {
    interface TempFileInterface {
      filename: string
      createdAt: Date
      content: string
    }

    const tempFileSchema = new Schema<TempFileInterface>({
      filename: String,
      createdAt: Date,
      content: String
    })

    tempFileSchema.index('createdAt', { ttl: 1 })

    db = createDatabase({
      storage: 'file',
      file: { dataPath: `./data/temp-ttl-${Date.now()}` }
    })

    const TempFile = db.model('TempFile', tempFileSchema)

    // Clear any existing data
    await TempFile.deleteMany({})

    // Override TTL check interval
    const ttlManager = (db as any)._ttlManager
    const modelName = (TempFile as any)._schema?.constructor?.name || 'UnknownModel'
    const key = `${modelName}_createdAt`
    ttlManager.unregisterTTLIndex(key)
    ttlManager.registerTTLIndex(TempFile, 'createdAt', 1, 500)

    // Create expired file
    const oldDate = new Date(Date.now() - 3000)
    await TempFile.create({
      filename: 'old.txt',
      createdAt: oldDate,
      content: 'old content'
    })

    // Create current file (future date to avoid timing issues)
    const futureDate = new Date(Date.now() + 10000)
    await TempFile.create({
      filename: 'current.txt',
      createdAt: futureDate,
      content: 'current content'
    })

    // Wait for cleanup (longer wait when running with other tests)
    await new Promise(resolve => setTimeout(resolve, 1200))

    const remaining = await TempFile.find()
    assert.strictEqual(remaining.length, 1)
    assert.strictEqual(remaining[0].filename, 'current.txt')
  })

  it('should work with memory storage', async () => {
    interface CacheEntryInterface {
      key: string
      value: string
      expiresAt: Date
    }

    const cacheSchema = new Schema<CacheEntryInterface>({
      key: String,
      value: String,
      expiresAt: Date
    })

    cacheSchema.index('expiresAt', { ttl: 1 })

    db = createDatabase({ storage: 'memory' })
    const CacheEntry = db.model('CacheEntry', cacheSchema)

    // Override TTL check interval
    const ttlManager = (db as any)._ttlManager
    const modelName = (CacheEntry as any)._schema?.constructor?.name || 'UnknownModel'
    const key = `${modelName}_expiresAt`
    ttlManager.unregisterTTLIndex(key)
    ttlManager.registerTTLIndex(CacheEntry, 'expiresAt', 1, 500)

    // Create expired entry
    await CacheEntry.create({
      key: 'expired',
      value: 'data',
      expiresAt: new Date(Date.now() - 3000)
    })

    // Create valid entry (future date to avoid timing issues)
    await CacheEntry.create({
      key: 'valid',
      value: 'data',
      expiresAt: new Date(Date.now() + 10000)
    })

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000))

    const remaining = await CacheEntry.find()
    assert.strictEqual(remaining.length, 1)
    assert.strictEqual(remaining[0].key, 'valid')
  })

  it('should handle documents without TTL field gracefully', async () => {
    interface MixedDocInterface {
      id: string
      expiresAt?: Date
    }

    const schema = new Schema<MixedDocInterface>({
      id: String,
      expiresAt: Date
    })

    schema.index('expiresAt', { ttl: 1 })

    db = createDatabase()
    const MixedDoc = db.model('MixedDoc', schema)

    // Override TTL check interval
    const ttlManager = (db as any)._ttlManager
    const modelName = (MixedDoc as any)._schema?.constructor?.name || 'UnknownModel'
    const key = `${modelName}_expiresAt`
    ttlManager.unregisterTTLIndex(key)
    ttlManager.registerTTLIndex(MixedDoc, 'expiresAt', 1, 500)

    // Create doc without expiresAt - should not be deleted
    await MixedDoc.create({ id: 'no-ttl' })

    // Create expired doc
    await MixedDoc.create({
      id: 'with-ttl',
      expiresAt: new Date(Date.now() - 3000)
    })

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000))

    const remaining = await MixedDoc.find()
    assert.strictEqual(remaining.length, 1)
    assert.strictEqual(remaining[0].id, 'no-ttl')
  })

  it('should not delete documents that have not expired yet', async () => {
    interface SessionInterface {
      sessionId: string
      createdAt: Date
    }

    const sessionSchema = new Schema<SessionInterface>({
      sessionId: String,
      createdAt: Date
    })

    sessionSchema.index('createdAt', { ttl: 5 }) // 5 second TTL

    db = createDatabase()
    const Session = db.model('Session', sessionSchema)

    // Override TTL check interval
    const ttlManager = (db as any)._ttlManager
    const modelName = (Session as any)._schema?.constructor?.name || 'UnknownModel'
    const key = `${modelName}_createdAt`
    ttlManager.unregisterTTLIndex(key)
    ttlManager.registerTTLIndex(Session, 'createdAt', 5, 500)

    // Create session 1 second ago (should NOT expire with 5s TTL)
    await Session.create({
      sessionId: 'recent',
      createdAt: new Date(Date.now() - 1000)
    })

    // Wait for one cleanup cycle
    await new Promise(resolve => setTimeout(resolve, 700))

    const remaining = await Session.find()
    assert.strictEqual(remaining.length, 1)
    assert.strictEqual(remaining[0].sessionId, 'recent')
  })

  it('should handle edge case of exact expiration time', async () => {
    interface TokenInterface {
      value: string
      expiresAt: Date
    }

    const tokenSchema = new Schema<TokenInterface>({
      value: String,
      expiresAt: Date
    })

    tokenSchema.index('expiresAt', { ttl: 2 })

    db = createDatabase()
    const Token = db.model('Token', tokenSchema)

    // Override TTL check interval
    const ttlManager = (db as any)._ttlManager
    const modelName = (Token as any)._schema?.constructor?.name || 'UnknownModel'
    const key = `${modelName}_expiresAt`
    ttlManager.unregisterTTLIndex(key)
    ttlManager.registerTTLIndex(Token, 'expiresAt', 2, 500)

    // Create token that expires exactly 2 seconds ago
    await Token.create({
      value: 'token1',
      expiresAt: new Date(Date.now() - 2000)
    })

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 700))

    const remaining = await Token.find()
    assert.strictEqual(remaining.length, 0)
  })
})
