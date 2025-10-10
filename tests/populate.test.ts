import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model, clearRegistry, ObjectId } from '../index'

interface AuthorDoc {
  _id?: ObjectId
  name: string
  email: string
}

interface PostDoc {
  _id?: ObjectId
  title: string
  content: string
  authorId: ObjectId
}

test('Populate', async t => {
  await t.test('should populate referenced document', async () => {
    clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Alice', email: 'alice@example.com' })
    await Post.create({
      title: 'Hello World',
      content: 'First post',
      authorId: author._id
    })

    const posts = await Post.find().populate('authorId')

    assert.strictEqual(posts.length, 1)
    assert.strictEqual(posts[0].title, 'Hello World')
    assert.strictEqual(typeof posts[0].authorId, 'object')
    assert.strictEqual((posts[0].authorId as any).name, 'Alice')
    assert.strictEqual((posts[0].authorId as any).email, 'alice@example.com')
  })

  await t.test('should handle missing referenced document', async () => {
    clearRegistry()

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    model('Author', new Schema({ name: String, email: String }))
    const Post = model('Post', postSchema)

    const fakeId = new ObjectId()
    await Post.create({ title: 'Orphan Post', content: 'No author', authorId: fakeId })

    const posts = await Post.find().populate('authorId')

    assert.strictEqual(posts.length, 1)
    // authorId should remain as ID when referenced doc doesn't exist
    assert.ok(posts[0].authorId.equals(fakeId))
  })

  await t.test('should populate multiple documents', async () => {
    clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)

    const [alice, bob] = await Author.insertMany([
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' }
    ])

    await Post.insertMany([
      { title: 'Post 1', content: 'By Alice', authorId: alice._id },
      { title: 'Post 2', content: 'By Bob', authorId: bob._id },
      { title: 'Post 3', content: 'Also by Alice', authorId: alice._id }
    ])

    const posts = await Post.find().populate('authorId')

    assert.strictEqual(posts.length, 3)
    assert.strictEqual((posts[0].authorId as any).name, 'Alice')
    assert.strictEqual((posts[1].authorId as any).name, 'Bob')
    assert.strictEqual((posts[2].authorId as any).name, 'Alice')
  })

  await t.test('should work with findOne and populate', async () => {
    clearRegistry()

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', new Schema({ name: String, email: String }))
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Alice', email: 'alice@example.com' })
    const post = await Post.create({
      title: 'Test Post',
      content: 'Content',
      authorId: author._id
    })

    // Note: populate doesn't work with findOne directly (returns single doc)
    // But works with find().limit(1)
    const posts = await Post.find({ _id: post._id }).populate('authorId').limit(1)

    assert.strictEqual(posts.length, 1)
    assert.strictEqual((posts[0].authorId as any).name, 'Alice')
  })

  await t.test('should populate multiple fields', async () => {
    clearRegistry()

    interface CommentDoc {
      _id?: ObjectId
      text: string
      postId: ObjectId
      authorId: ObjectId
    }

    const authorSchema = new Schema({ name: String })
    const postSchema = new Schema({ title: String })
    const commentSchema = new Schema<CommentDoc>({
      text: String,
      postId: { type: ObjectId, ref: 'Post' },
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)
    const Comment = model('Comment', commentSchema)

    const author = await Author.create({ name: 'Alice' })
    const post = await Post.create({ title: 'Great Post' })
    await Comment.create({
      text: 'Nice!',
      postId: post._id,
      authorId: author._id
    })

    const comments = await Comment.find().populate(['postId', 'authorId'])

    assert.strictEqual(comments.length, 1)
    assert.strictEqual((comments[0].postId as any).title, 'Great Post')
    assert.strictEqual((comments[0].authorId as any).name, 'Alice')
  })

  await t.test('should not populate when ref field has no value', async () => {
    clearRegistry()

    const postSchema = new Schema<Partial<PostDoc>>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    model('Author', new Schema({ name: String }))
    const Post = model('Post', postSchema)

    await Post.create({ title: 'No Author Post', content: 'Content' })

    const posts = await Post.find().populate('authorId')

    assert.strictEqual(posts.length, 1)
    assert.strictEqual(posts[0].authorId, undefined)
  })

  await t.test('should not populate when ref model not found', async () => {
    clearRegistry()

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'NonExistentModel' }
    })

    const Post = model('Post', postSchema)

    const fakeId = new ObjectId()
    await Post.create({ title: 'Test', content: 'Content', authorId: fakeId })

    const posts = await Post.find().populate('authorId')

    assert.strictEqual(posts.length, 1)
    // Should remain as ID when model doesn't exist
    assert.ok(posts[0].authorId.equals(fakeId))
  })

  await t.test('should handle populate on field without ref option', async () => {
    clearRegistry()

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: ObjectId // No ref option
    })

    model('Author', new Schema({ name: String }))
    const Post = model('Post', postSchema)

    const fakeId = new ObjectId()
    await Post.create({ title: 'Test', content: 'Content', authorId: fakeId })

    // Populate should skip field without ref
    const posts = await Post.find().populate('authorId')

    assert.strictEqual(posts.length, 1)
    assert.ok(posts[0].authorId.equals(fakeId)) // Remains as ObjectId
  })

  await t.test('should handle populate with empty fields array', async () => {
    clearRegistry()

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    model('Author', new Schema({ name: String }))
    const Post = model('Post', postSchema)

    const fakeId = new ObjectId()
    await Post.create({ title: 'Test', content: 'Content', authorId: fakeId })

    const posts = await Post.find()

    // Directly call _applyPopulate with empty array to hit the branch
    const result = await Post._applyPopulate(posts, [])

    assert.strictEqual(result.length, 1)
    assert.strictEqual(result, posts) // Should return same array when fields is empty
  })

  await t.test('should handle populate when field has no ref', async () => {
    clearRegistry()

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: ObjectId // No ref option
    })

    const Post = model('Post', postSchema)
    await Post.create({ title: 'Test', content: 'Content', authorId: new ObjectId() })

    const posts = await Post.find()

    // Call _applyPopulate on field without ref - should return unchanged
    const result = await Post._applyPopulate(posts, ['authorId'])

    assert.strictEqual(result.length, 1)
    // authorId should remain as ObjectId when field has no ref
    assert.ok(result[0].authorId instanceof ObjectId)
  })

  await t.test('should handle chaining multiple populate calls', async () => {
    clearRegistry()

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', new Schema({ name: String }))
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Alice' })
    await Post.create({ title: 'Test', content: 'Content', authorId: author._id })

    // Chain populate (tests _populate array handling)
    const posts = await Post.find().populate('authorId').populate('authorId')

    assert.strictEqual(posts.length, 1)
    assert.strictEqual(typeof posts[0].authorId, 'object')
  })

  await t.test('should append populate fields when array provided', async () => {
    clearRegistry()

    const Post = model(
      'Post',
      new Schema({
        title: String,
        authorId: { type: ObjectId, ref: 'Author' }
      })
    )

    const builder = Post.findOne({})

    ;(builder as any)._populate = ['existing']
    const returned = builder.populate(['authorId', 'comments'])

    assert.strictEqual(returned, builder)
    assert.deepStrictEqual((builder as any)._populate, ['existing', 'authorId', 'comments'])
  })

  await t.test('should fallback to empty array when populate storage missing', async () => {
    clearRegistry()

    const Post = model('Post', new Schema({ title: String }))

    const builder = Post.findOne({})

    ;(builder as any)._populate = undefined
    builder.populate('authorId')

    assert.deepStrictEqual((builder as any)._populate, ['authorId'])
  })

  await t.test('should populate with string parameter on findOne', async () => {
    clearRegistry()

    const Author = model('Author', new Schema({ name: String }))
    const Post = model(
      'Post',
      new Schema({
        title: String,
        authorId: { type: ObjectId, ref: 'Author' }
      })
    )

    const author = await Author.create({ name: 'Alice' })
    await Post.create({ title: 'Post', authorId: author._id })

    const post = await Post.findOne({}).populate('authorId')

    assert.ok(post)
    assert.strictEqual((post.authorId as any).name, 'Alice')
  })

  await t.test('should populate on findOne with query', async () => {
    clearRegistry()

    const Author = model('Author', new Schema({ name: String }))
    const Post = model(
      'Post',
      new Schema({
        title: String,
        authorId: { type: ObjectId, ref: 'Author' }
      })
    )

    const author = await Author.create({ name: 'Charlie' })
    await Post.create({ title: 'Single Post', authorId: author._id })

    const post = await Post.findOne({ title: 'Single Post' }).populate('authorId')

    assert.ok(post)
    assert.strictEqual((post.authorId as any).name, 'Charlie')
  })

  await t.test('should handle populate with missing referenced document on findOne', async () => {
    clearRegistry()

    model('Author', new Schema({ name: String }))
    const Post = model(
      'Post',
      new Schema({
        title: String,
        authorId: { type: ObjectId, ref: 'Author' }
      })
    )

    await Post.create({ title: 'Orphan Post', authorId: new ObjectId() })

    const post = await Post.findOne({ title: 'Orphan Post' }).populate('authorId')

    assert.ok(post)
    assert.ok(post.authorId instanceof ObjectId)
  })

  await t.test('should handle findOne returning null with populate', async () => {
    clearRegistry()

    const User = model('User', new Schema({ name: String }))

    const result = await User.findOne({ name: 'NonExistent' }).populate('someField')

    assert.strictEqual(result, null)
  })

  await t.test('should populate with string parameter on find', async () => {
    clearRegistry()

    const Author = model('Author', new Schema({ name: String }))
    const Post = model(
      'Post',
      new Schema({
        title: String,
        authorId: { type: ObjectId, ref: 'Author' }
      })
    )

    const author = await Author.create({ name: 'Frank' })
    await Post.create({ title: 'Post 1', authorId: author._id })

    const posts = await Post.find().populate('authorId')

    assert.strictEqual(posts.length, 1)
    assert.strictEqual((posts[0].authorId as any).name, 'Frank')
  })

  await t.test('should handle populate results returning undefined', async () => {
    clearRegistry()

    model('Author', new Schema({ name: String }))
    const Post = model(
      'Post',
      new Schema({
        title: String,
        authorId: { type: ObjectId, ref: 'Author' }
      })
    )

    await Post.create({ title: 'Post', authorId: new ObjectId() })

    // Mock _applyPopulate to simulate edge case where results[0] is falsy
    const originalApplyPopulate = (Post as any)._applyPopulate.bind(Post)
    let mockCalled = false
    ;(Post as any)._applyPopulate = async (_docs: any[]) => {
      mockCalled = true
      return [undefined]
    }

    const post = await Post.findOne({}).populate('authorId')

    // Restore
    ;(Post as any)._applyPopulate = originalApplyPopulate

    assert.strictEqual(post, null)
    assert.ok(mockCalled)
  })
})
