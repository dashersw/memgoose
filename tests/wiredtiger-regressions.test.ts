import { test } from 'node:test'
import assert from 'node:assert'
import { connect, disconnect, model, Schema } from '../index'
import * as fs from 'fs'
import * as path from 'path'

const TEST_DATA_PATH = './test-wiredtiger-regressions'

async function cleanupTestData(): Promise<void> {
  if (!fs.existsSync(TEST_DATA_PATH)) return

  const removeDir = (dir: string) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir)) {
      const entryPath = path.join(dir, entry)
      const stat = fs.statSync(entryPath)
      if (stat.isDirectory()) {
        removeDir(entryPath)
      } else {
        fs.unlinkSync(entryPath)
      }
    }
    fs.rmdirSync(dir)
  }

  removeDir(TEST_DATA_PATH)
}

test('WiredTiger regression coverage', async t => {
  t.beforeEach(async () => {
    await cleanupTestData()
    connect({
      storage: 'wiredtiger',
      wiredtiger: {
        dataPath: TEST_DATA_PATH,
        cacheSize: '64M'
      }
    })
  })

  t.afterEach(async () => {
    await disconnect()
    await cleanupTestData()
  })

  await t.test('re-using a unique value after update should succeed', async () => {
    interface UserDoc {
      _id?: string
      email: string
      name: string
    }

    const userSchema = new Schema<UserDoc>({
      email: { type: String, required: true, unique: true },
      name: { type: String, required: true }
    })

    const User = model<UserDoc>('WiredTigerRegressionUserUpdate', userSchema)

    const created = await User.create({ email: 'alice@example.com', name: 'Alice' })
    assert.ok(created)

    await User.updateOne({ _id: created._id }, { email: 'alice@new.example.com' })

    // Re-using the original email should be allowed once the update is applied
    const replacement = await User.create({
      email: 'alice@example.com',
      name: 'Alice Replacement'
    })

    assert.strictEqual(replacement.email, 'alice@example.com')
    const count = await User.countDocuments({ email: 'alice@example.com' })
    assert.strictEqual(count, 1)
  })

  await t.test('re-using a unique value after delete should succeed', async () => {
    interface UsernameDoc {
      _id?: string
      username: string
    }

    const usernameSchema = new Schema<UsernameDoc>({
      username: { type: String, required: true, unique: true }
    })

    const Account = model<UsernameDoc>('WiredTigerRegressionUserDelete', usernameSchema)

    const created = await Account.create({ username: 'stale-user' })
    assert.ok(created)

    await Account.deleteOne({ _id: created._id })

    // Creating a new document with the same username should be possible
    const recreated = await Account.create({ username: 'stale-user' })
    assert.strictEqual(recreated.username, 'stale-user')
    const count = await Account.countDocuments({ username: 'stale-user' })
    assert.strictEqual(count, 1)
  })

  await t.test('unique indexes should ignore documents missing the indexed fields', async () => {
    interface ReferralDoc {
      email: string
      referralCode?: string
    }

    const referralSchema = new Schema<ReferralDoc>({
      email: { type: String, required: true },
      referralCode: { type: String, unique: true }
    })

    const Referral = model<ReferralDoc>('WiredTigerRegressionSparseUnique', referralSchema)

    const first = await Referral.create({ email: 'first@example.com' })
    assert.ok(first)

    const second = await Referral.create({ email: 'second@example.com' })
    assert.ok(second)

    const count = await Referral.countDocuments()
    assert.strictEqual(count, 2)
  })
})
