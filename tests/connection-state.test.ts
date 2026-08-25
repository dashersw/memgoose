import { test } from 'node:test'
import assert from 'node:assert'
import memgoose, {
  clearRegistry,
  connect,
  connection,
  createDatabase,
  disconnect,
  dropDatabase,
  STATES
} from '../index'

// Mongoose-compatible connection state: applications commonly gate optional
// database work on `mongoose.connection.readyState === 1` and register
// lifecycle listeners on the connection; the shim must reflect the explicit
// connect()/disconnect() lifecycle and keep mongoose's semantics for
// operations that do NOT change connection state.
test('connection readyState', async t => {
  await t.test('starts disconnected', () => {
    assert.strictEqual(connection.readyState, STATES.disconnected)
  })

  await t.test('connect() moves it to connected and emits connected/open', () => {
    const events: string[] = []
    connection.once('connected', () => events.push('connected'))
    connection.once('open', () => events.push('open'))
    connect({ storage: 'memory' })
    assert.strictEqual(connection.readyState, STATES.connected)
    assert.deepStrictEqual(events, ['connected', 'open'])
  })

  await t.test('createDatabase() does not touch the default connection state', () => {
    createDatabase({ storage: 'memory' })
    assert.strictEqual(connection.readyState, STATES.connected)
  })

  await t.test(
    'dropDatabase() and clearRegistry() stay connected (mongoose semantics)',
    async () => {
      await dropDatabase()
      assert.strictEqual(connection.readyState, STATES.connected)
      await clearRegistry()
      assert.strictEqual(connection.readyState, STATES.connected)
    }
  )

  await t.test('disconnect() reports disconnecting, then disconnected, and emits', async () => {
    const events: string[] = []
    connection.once('disconnected', () => events.push('disconnected'))
    connection.once('close', () => events.push('close'))
    const inFlight = disconnect()
    assert.strictEqual(connection.readyState, STATES.disconnecting)
    await inFlight
    assert.strictEqual(connection.readyState, STATES.disconnected)
    assert.deepStrictEqual(events, ['disconnected', 'close'])
  })

  await t.test('double disconnect is idempotent and emits once', async () => {
    connect({ storage: 'memory' })
    let emissions = 0
    const count = () => {
      emissions += 1
    }
    connection.on('disconnected', count)
    await disconnect()
    await disconnect()
    connection.off('disconnected', count)
    assert.strictEqual(connection.readyState, STATES.disconnected)
    assert.strictEqual(emissions, 1)
  })

  await t.test('reconnecting works and close() is a disconnect alias', async () => {
    connect({ storage: 'memory' })
    assert.strictEqual(connection.readyState, STATES.connected)
    await connection.close()
    assert.strictEqual(connection.readyState, STATES.disconnected)
  })

  await t.test('db exposes the active default database', () => {
    const db = connect({ storage: 'memory' })
    assert.strictEqual(connection.db, db)
  })

  await t.test('the default export exposes the same connection object and STATES', () => {
    assert.strictEqual(memgoose.connection, connection)
    assert.strictEqual(memgoose.STATES, STATES)
  })
})
