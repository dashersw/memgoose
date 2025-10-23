import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

describe('Aggregation String Operators', () => {
  interface UserInterface {
    name: string
    email: string
    tags: string
    description: string
  }

  const userSchema = new Schema<UserInterface>({
    name: String,
    email: String,
    tags: String,
    description: String
  })

  const User = model<UserInterface>('User', userSchema)

  beforeEach(async () => {
    await User.deleteMany({})
  })

  describe('$split operator', () => {
    it('should split string by delimiter', async () => {
      await User.insertMany([
        {
          name: 'Alice Smith',
          email: 'alice@example.com',
          tags: 'admin,user,premium',
          description: 'test'
        }
      ])

      const results = await User.aggregate([
        {
          $project: {
            nameParts: { $split: ['$name', ' '] },
            tagArray: { $split: ['$tags', ','] }
          }
        }
      ])

      assert.deepStrictEqual(results[0].nameParts, ['Alice', 'Smith'])
      assert.deepStrictEqual(results[0].tagArray, ['admin', 'user', 'premium'])
    })
  })

  describe('$trim, $ltrim, $rtrim operators', () => {
    it('should trim whitespace with $trim', async () => {
      await User.insertMany([
        { name: '  Alice  ', email: 'test@test.com', tags: '', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            trimmed: { $trim: { input: '$name' } }
          }
        }
      ])

      assert.strictEqual(results[0].trimmed, 'Alice')
    })

    it('should trim custom characters with $trim', async () => {
      await User.insertMany([
        { name: '___Alice___', email: 'test@test.com', tags: '', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            trimmed: { $trim: { input: '$name', chars: '_' } }
          }
        }
      ])

      assert.strictEqual(results[0].trimmed, 'Alice')
    })

    it('should left trim with $ltrim', async () => {
      await User.insertMany([
        { name: '  Alice  ', email: 'test@test.com', tags: '', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            trimmed: { $ltrim: { input: '$name' } }
          }
        }
      ])

      assert.strictEqual(results[0].trimmed, 'Alice  ')
    })

    it('should right trim with $rtrim', async () => {
      await User.insertMany([
        { name: '  Alice  ', email: 'test@test.com', tags: '', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            trimmed: { $rtrim: { input: '$name' } }
          }
        }
      ])

      assert.strictEqual(results[0].trimmed, '  Alice')
    })
  })

  describe('$replaceOne and $replaceAll operators', () => {
    it('should replace first occurrence with $replaceOne', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'test@test.com', tags: 'hello world hello', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            replaced: { $replaceOne: { input: '$tags', find: 'hello', replacement: 'hi' } }
          }
        }
      ])

      assert.strictEqual(results[0].replaced, 'hi world hello')
    })

    it('should replace all occurrences with $replaceAll', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'test@test.com', tags: 'hello world hello', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            replaced: { $replaceAll: { input: '$tags', find: 'hello', replacement: 'hi' } }
          }
        }
      ])

      assert.strictEqual(results[0].replaced, 'hi world hi')
    })
  })

  describe('$strLenCP operator', () => {
    it('should count string length in code points', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'test', tags: '', description: 'Hello 世界 🌍' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            nameLen: { $strLenCP: '$name' },
            descLen: { $strLenCP: '$description' }
          }
        }
      ])

      assert.strictEqual(results[0].nameLen, 5)
      // "Hello 世界 🌍" = 10 code points: H-e-l-l-o-space-世-界-space-🌍
      assert.strictEqual(results[0].descLen, 10)
    })
  })

  describe('$indexOfCP operator', () => {
    it('should find substring index', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'alice@example.com', tags: '', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            atIndex: { $indexOfCP: ['$email', '@'] }
          }
        }
      ])

      assert.strictEqual(results[0].atIndex, 5)
    })

    it('should find substring with start and end positions', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'test', tags: 'hello world hello', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            index: { $indexOfCP: ['$tags', 'hello', 6, 20] }
          }
        }
      ])

      assert.strictEqual(results[0].index, 12) // Second "hello" starts at position 12
    })

    it('should return -1 when not found', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'test@test.com', tags: '', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            index: { $indexOfCP: ['$email', 'xyz'] }
          }
        }
      ])

      assert.strictEqual(results[0].index, -1)
    })
  })

  describe('$strcasecmp operator', () => {
    it('should compare strings case-insensitively', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'alice@test.com', tags: 'Apple', description: 'banana' },
        { name: 'Bob', email: 'bob@test.com', tags: 'apple', description: 'Apple' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            name: 1,
            comparison: { $strcasecmp: ['$tags', '$description'] }
          }
        }
      ])

      // "Apple" vs "banana" -> -1 (Apple < banana)
      assert.strictEqual(results[0].comparison, -1)

      // "apple" vs "Apple" -> 0 (equal case-insensitive)
      assert.strictEqual(results[1].comparison, 0)
    })
  })

  describe('Real-world string processing scenarios', () => {
    it('should clean and normalize user input', async () => {
      await User.insertMany([
        { name: '  John Doe  ', email: 'JOHN.DOE@EXAMPLE.COM', tags: '', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            cleanName: { $trim: { input: '$name' } },
            domain: {
              $split: [{ $toLower: '$email' }, '@']
            }
          }
        },
        {
          $project: {
            cleanName: 1,
            domain: { $arrayElemAt: ['$domain', 1] }
          }
        }
      ])

      assert.strictEqual(results[0].cleanName, 'John Doe')
      assert.strictEqual(results[0].domain, 'example.com')
    })

    it('should parse and extract information', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'alice@example.com', tags: 'tag1,tag2,tag3', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            tagCount: {
              $size: { $split: ['$tags', ','] }
            },
            username: {
              $arrayElemAt: [{ $split: ['$email', '@'] }, 0]
            }
          }
        }
      ])

      assert.strictEqual(results[0].tagCount, 3)
      assert.strictEqual(results[0].username, 'alice')
    })

    it('should handle text replacement', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'test', tags: '', description: 'This is a test. A simple test.' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            modified: {
              $replaceAll: {
                input: '$description',
                find: 'test',
                replacement: 'example'
              }
            }
          }
        }
      ])

      assert.strictEqual(results[0].modified, 'This is a example. A simple example.')
    })

    it('should handle null values gracefully', async () => {
      await User.insertMany([
        { name: 'Alice', email: 'test@test.com', tags: '', description: 'test' }
      ])

      const results = await User.aggregate([
        {
          $project: {
            nameLen: { $strLenCP: '$name' },
            missingLen: { $strLenCP: '$missingField' }
          }
        }
      ])

      assert.strictEqual(results[0].nameLen, 5)
      assert.strictEqual(results[0].missingLen, null)
    })
  })
})
