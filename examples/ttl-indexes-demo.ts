import { Schema, createDatabase } from '../index'

async function sessionManagementExample() {
  console.log('=== Example 1: Session Management ===\n')

  interface SessionDoc {
    sessionId: string
    userId: string
    createdAt: Date
    data: Record<string, any>
  }

  const sessionSchema = new Schema<SessionDoc>({
    sessionId: String,
    userId: String,
    createdAt: Date,
    data: Object
  })

  // Auto-expire sessions after 30 minutes of inactivity
  sessionSchema.index('createdAt', { ttl: 1800 })

  const db = createDatabase()
  const Session = db.model('Session', sessionSchema)

  console.log('Creating sessions...')

  // Create a current session
  await Session.create({
    sessionId: 'sess_current',
    userId: 'user123',
    createdAt: new Date(),
    data: { loggedIn: true }
  })

  // Create an "old" session (simulated for demo - normally would be 30+ minutes old)
  const oldDate = new Date(Date.now() - 31 * 60 * 1000) // 31 minutes ago
  await Session.create({
    sessionId: 'sess_expired',
    userId: 'user456',
    createdAt: oldDate,
    data: { loggedIn: true }
  })

  console.log(`Total sessions: ${await Session.countDocuments()}`)
  console.log('\nNote: In production, the expired session would be automatically')
  console.log('deleted within 60 seconds by the TTL cleanup process.\n')

  await db.disconnect()
}

async function cacheInvalidationExample() {
  console.log('=== Example 2: Cache Invalidation ===\n')

  interface CacheEntry {
    key: string
    value: string
    accessedAt: Date
    createdAt: Date
  }

  const cacheSchema = new Schema<CacheEntry>({
    key: String,
    value: String,
    accessedAt: Date,
    createdAt: Date
  })

  // Dual TTL strategy:
  // 1. Evict if not accessed in 5 minutes
  // 2. Absolute expiration after 1 hour
  cacheSchema.index('accessedAt', { ttl: 300 }) // 5 minutes
  cacheSchema.index('createdAt', { ttl: 3600 }) // 1 hour

  const db = createDatabase()
  const Cache = db.model('Cache', cacheSchema)

  console.log('Cache entries are automatically cleaned up based on:')
  console.log('- Last access time (5 minute TTL)')
  console.log('- Creation time (1 hour absolute TTL)\n')

  // Create cache entries
  await Cache.create({
    key: 'user:123:profile',
    value: JSON.stringify({ name: 'Alice' }),
    accessedAt: new Date(),
    createdAt: new Date()
  })

  await Cache.create({
    key: 'user:456:settings',
    value: JSON.stringify({ theme: 'dark' }),
    accessedAt: new Date(),
    createdAt: new Date()
  })

  console.log(`Total cache entries: ${await Cache.countDocuments()}`)
  console.log('\nEntries will be automatically removed when either:')
  console.log('- accessedAt < (now - 5 minutes), OR')
  console.log('- createdAt < (now - 1 hour)\n')

  await db.disconnect()
}

async function temporaryTokensExample() {
  console.log('=== Example 3: Temporary Verification Tokens ===\n')

  interface VerificationToken {
    token: string
    email: string
    type: 'email_verification' | 'password_reset'
    createdAt: Date
    used: boolean
  }

  const tokenSchema = new Schema<VerificationToken>({
    token: String,
    email: String,
    type: String,
    createdAt: Date,
    used: Boolean
  })

  // Tokens expire after 1 hour
  tokenSchema.index('createdAt', { ttl: 3600 })
  tokenSchema.index('token', { unique: true })

  const db = createDatabase()
  const Token = db.model('VerificationToken', tokenSchema)

  console.log('Creating verification tokens...')

  // Email verification token
  await Token.create({
    token: 'verify_abc123',
    email: 'alice@example.com',
    type: 'email_verification',
    createdAt: new Date(),
    used: false
  })

  // Password reset token
  await Token.create({
    token: 'reset_xyz789',
    email: 'bob@example.com',
    type: 'password_reset',
    createdAt: new Date(),
    used: false
  })

  console.log(`Total tokens: ${await Token.countDocuments()}`)
  console.log('\nThese tokens will automatically expire and be deleted')
  console.log('1 hour after creation, even if unused.\n')

  // Simulate token usage
  const token = await Token.findOne({ token: 'verify_abc123' })
  if (token) {
    token.used = true
    await token.save()
    console.log('Token marked as used. It will still be deleted after TTL expires.\n')
  }

  await db.disconnect()
}

async function rateLimitingExample() {
  console.log('=== Example 4: Rate Limiting ===\n')

  interface RateLimitEntry {
    ipAddress: string
    endpoint: string
    requestCount: number
    windowStart: Date
  }

  const rateLimitSchema = new Schema<RateLimitEntry>({
    ipAddress: String,
    endpoint: String,
    requestCount: Number,
    windowStart: Date
  })

  // Reset rate limit windows after 1 minute
  rateLimitSchema.index('windowStart', { ttl: 60 })
  rateLimitSchema.index(['ipAddress', 'endpoint'])

  const db = createDatabase()
  const RateLimit = db.model('RateLimit', rateLimitSchema)

  const ip = '192.168.1.1'
  const endpoint = '/api/users'

  console.log(`Tracking rate limit for ${ip} on ${endpoint}`)

  // Record requests
  for (let i = 0; i < 5; i++) {
    const existing = await RateLimit.findOne({ ipAddress: ip, endpoint })

    if (existing) {
      existing.requestCount++
      await existing.save()
    } else {
      await RateLimit.create({
        ipAddress: ip,
        endpoint,
        requestCount: 1,
        windowStart: new Date()
      })
    }
  }

  const limit = await RateLimit.findOne({ ipAddress: ip, endpoint })
  console.log(`\nRequests in current window: ${limit?.requestCount}`)
  console.log('Rate limit window will auto-reset after 60 seconds\n')

  await db.disconnect()
}

async function logRotationExample() {
  console.log('=== Example 5: Automatic Log Rotation ===\n')

  interface LogEntry {
    level: 'info' | 'warn' | 'error'
    message: string
    timestamp: Date
    metadata?: any
  }

  const logSchema = new Schema<LogEntry>({
    level: String,
    message: String,
    timestamp: Date,
    metadata: Object
  })

  // Keep logs for 7 days
  logSchema.index('timestamp', { ttl: 604800 }) // 7 days

  const db = createDatabase({
    storage: 'file',
    file: { dataPath: './data/logs' }
  })

  const Log = db.model('Log', logSchema)

  console.log('Logging application events...')

  await Log.insertMany([
    {
      level: 'info',
      message: 'Application started',
      timestamp: new Date()
    },
    {
      level: 'warn',
      message: 'High memory usage detected',
      timestamp: new Date()
    },
    {
      level: 'error',
      message: 'Database connection failed',
      timestamp: new Date(),
      metadata: { retry: 3 }
    }
  ])

  const logCount = await Log.countDocuments()
  console.log(`Total logs: ${logCount}`)
  console.log('Logs older than 7 days are automatically deleted.\n')

  // Query recent errors
  const recentErrors = await Log.find({ level: 'error' })
  console.log('Recent errors:')
  console.log(recentErrors.map(log => ({ message: log.message, time: log.timestamp })))
  console.log()

  await db.disconnect()
}

async function main() {
  console.log('╔═══════════════════════════════════════╗')
  console.log('║  TTL Indexes Demo - memgoose         ║')
  console.log('╚═══════════════════════════════════════╝\n')

  await sessionManagementExample()
  await cacheInvalidationExample()
  await temporaryTokensExample()
  await rateLimitingExample()
  await logRotationExample()

  console.log('╔═══════════════════════════════════════╗')
  console.log('║  All Examples Complete!              ║')
  console.log('╚═══════════════════════════════════════╝')
  console.log('\nKey Takeaways:')
  console.log('✓ TTL indexes automatically clean up expired documents')
  console.log('✓ Background cleanup runs every 60 seconds')
  console.log('✓ Works across all storage backends')
  console.log('✓ Perfect for sessions, caches, tokens, and temporary data')
}

main().catch(console.error)
