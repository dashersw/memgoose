import { test } from 'node:test'
import assert from 'node:assert'
import { Schema, model, clearRegistry, ObjectId } from '../index'

interface AuthorDoc {
  _id?: ObjectId
  name: string
  email: string
  age?: number
  active?: boolean
}

interface CategoryDoc {
  _id?: ObjectId
  name: string
  description?: string
}

interface PostDoc {
  _id?: ObjectId
  title: string
  content: string
  authorId: ObjectId
  categoryId?: ObjectId
  published?: boolean
}

interface CommentDoc {
  _id?: ObjectId
  text: string
  postId: ObjectId
  authorId: ObjectId
}

test('Advanced Populate', async t => {
  t.beforeEach(async () => await clearRegistry())

  await t.test('should populate with select option using string', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      age: Number
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Alice', email: 'alice@example.com', age: 30 })
    await Post.create({
      title: 'Hello World',
      content: 'First post',
      authorId: author._id
    })

    const posts = await Post.find().populate({
      path: 'authorId',
      select: 'name'
    })

    assert.strictEqual(posts.length, 1)
    assert.strictEqual(typeof posts[0].authorId, 'object')
    const populatedAuthor = posts[0].authorId as any
    assert.strictEqual(populatedAuthor.name, 'Alice')
    assert.strictEqual(populatedAuthor.email, undefined) // Not selected
    assert.strictEqual(populatedAuthor.age, undefined) // Not selected
  })

  await t.test('should populate with select option using array', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      age: Number
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Bob', email: 'bob@example.com', age: 25 })
    await Post.create({
      title: 'Test Post',
      content: 'Content',
      authorId: author._id
    })

    const posts = await Post.find().populate({
      path: 'authorId',
      select: ['name', 'age']
    })

    assert.strictEqual(posts.length, 1)
    const populatedAuthor = posts[0].authorId as any
    assert.strictEqual(populatedAuthor.name, 'Bob')
    assert.strictEqual(populatedAuthor.age, 25)
    assert.strictEqual(populatedAuthor.email, undefined) // Not selected
  })

  await t.test('should populate with select option using object notation', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      age: Number
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Charlie', email: 'charlie@example.com', age: 35 })
    await Post.create({
      title: 'Another Post',
      content: 'More content',
      authorId: author._id
    })

    const posts = await Post.find().populate({
      path: 'authorId',
      select: { name: 1, email: 1 }
    })

    assert.strictEqual(posts.length, 1)
    const populatedAuthor = posts[0].authorId as any
    assert.strictEqual(populatedAuthor.name, 'Charlie')
    assert.strictEqual(populatedAuthor.email, 'charlie@example.com')
    assert.strictEqual(populatedAuthor.age, undefined) // Not selected
  })

  await t.test('should populate with match filter', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      active: Boolean
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)

    const activeAuthor = await Author.create({
      name: 'Active',
      email: 'active@test.com',
      active: true
    })
    const inactiveAuthor = await Author.create({
      name: 'Inactive',
      email: 'inactive@test.com',
      active: false
    })

    await Post.insertMany([
      { title: 'Post 1', content: 'By active', authorId: activeAuthor._id },
      { title: 'Post 2', content: 'By inactive', authorId: inactiveAuthor._id }
    ])

    const posts = await Post.find().populate({
      path: 'authorId',
      match: { active: true }
    })

    assert.strictEqual(posts.length, 2)

    // First post should have populated author (active)
    const post1Author = posts[0].authorId as any
    if (typeof post1Author === 'object' && post1Author.name) {
      assert.strictEqual(post1Author.name, 'Active')
      assert.strictEqual(post1Author.active, true)
    }

    // Second post should NOT have populated author (inactive, filtered by match)
    const post2Author = posts[1].authorId
    // When match fails, it should remain as ObjectId or be an object without the expected populated fields
    const isUnpopulated =
      post2Author instanceof ObjectId ||
      (typeof post2Author === 'object' && post2Author !== null && !(post2Author as any).name)
    assert.ok(isUnpopulated)
  })

  await t.test('should handle nested populate', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String
    })

    const categorySchema = new Schema<CategoryDoc>({
      name: String,
      description: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' },
      categoryId: { type: ObjectId, ref: 'Category' }
    })

    const commentSchema = new Schema<CommentDoc>({
      text: String,
      postId: { type: ObjectId, ref: 'Post' },
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Category = model('Category', categorySchema)
    const Post = model('Post', postSchema)
    const Comment = model('Comment', commentSchema)

    const author = await Author.create({ name: 'Nested Author', email: 'nested@test.com' })
    const category = await Category.create({ name: 'Tech', description: 'Technology posts' })
    const post = await Post.create({
      title: 'Nested Test',
      content: 'Testing nested populate',
      authorId: author._id,
      categoryId: category._id
    })

    await Comment.create({
      text: 'Great post!',
      postId: post._id,
      authorId: author._id
    })

    const comments = await Comment.find().populate({
      path: 'postId',
      populate: {
        path: 'authorId',
        select: 'name'
      }
    })

    assert.strictEqual(comments.length, 1)
    const populatedPost = comments[0].postId as any
    assert.strictEqual(typeof populatedPost, 'object')
    assert.strictEqual(populatedPost.title, 'Nested Test')

    const nestedAuthor = populatedPost.authorId as any
    assert.strictEqual(typeof nestedAuthor, 'object')
    assert.strictEqual(nestedAuthor.name, 'Nested Author')
    assert.strictEqual(nestedAuthor.email, undefined) // Not selected
  })

  await t.test('should handle multiple nested populates', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String
    })

    const categorySchema = new Schema<CategoryDoc>({
      name: String,
      description: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' },
      categoryId: { type: ObjectId, ref: 'Category' }
    })

    const commentSchema = new Schema<CommentDoc>({
      text: String,
      postId: { type: ObjectId, ref: 'Post' },
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Category = model('Category', categorySchema)
    const Post = model('Post', postSchema)
    const Comment = model('Comment', commentSchema)

    const postAuthor = await Author.create({ name: 'Post Author', email: 'post@test.com' })
    const commentAuthor = await Author.create({ name: 'Comment Author', email: 'comment@test.com' })
    const category = await Category.create({ name: 'Science', description: 'Science posts' })

    const post = await Post.create({
      title: 'Multi Nested',
      content: 'Testing multiple nested populates',
      authorId: postAuthor._id,
      categoryId: category._id
    })

    await Comment.create({
      text: 'Interesting!',
      postId: post._id,
      authorId: commentAuthor._id
    })

    const comments = await Comment.find().populate({
      path: 'postId',
      populate: [
        { path: 'authorId', select: 'name' },
        { path: 'categoryId', select: 'name' }
      ]
    })

    assert.strictEqual(comments.length, 1)
    const populatedPost = comments[0].postId as any
    assert.strictEqual(populatedPost.title, 'Multi Nested')

    const nestedAuthor = populatedPost.authorId as any
    assert.strictEqual(nestedAuthor.name, 'Post Author')
    assert.strictEqual(nestedAuthor.email, undefined)

    const nestedCategory = populatedPost.categoryId as any
    assert.strictEqual(nestedCategory.name, 'Science')
    assert.strictEqual(nestedCategory.description, undefined)
  })

  await t.test('should mix string and PopulateOptions in chained calls', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      age: Number
    })

    const categorySchema = new Schema<CategoryDoc>({
      name: String,
      description: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' },
      categoryId: { type: ObjectId, ref: 'Category' }
    })

    const Author = model('Author', authorSchema)
    const Category = model('Category', categorySchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Mixed Test', email: 'mixed@test.com', age: 40 })
    const category = await Category.create({ name: 'Mixed Cat', description: 'Mixed category' })

    await Post.create({
      title: 'Mixed Populate',
      content: 'Testing mixed populate',
      authorId: author._id,
      categoryId: category._id
    })

    const posts = await Post.find().populate('categoryId').populate({
      path: 'authorId',
      select: 'name age'
    })

    assert.strictEqual(posts.length, 1)

    const populatedAuthor = posts[0].authorId as any
    assert.strictEqual(populatedAuthor.name, 'Mixed Test')
    assert.strictEqual(populatedAuthor.age, 40)
    assert.strictEqual(populatedAuthor.email, undefined)

    const populatedCategory = posts[0].categoryId as any
    assert.strictEqual(populatedCategory.name, 'Mixed Cat')
    assert.strictEqual(populatedCategory.description, 'Mixed category')
  })

  await t.test('should work with findOne and PopulateOptions', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      age: Number
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'FindOne Test', email: 'findone@test.com', age: 28 })
    await Post.create({
      title: 'FindOne Post',
      content: 'Content',
      authorId: author._id
    })

    const post = await Post.findOne({ title: 'FindOne Post' }).populate({
      path: 'authorId',
      select: ['name', 'age']
    })

    assert.ok(post)
    const populatedAuthor = post!.authorId as any
    assert.strictEqual(populatedAuthor.name, 'FindOne Test')
    assert.strictEqual(populatedAuthor.age, 28)
    assert.strictEqual(populatedAuthor.email, undefined)
  })

  await t.test('should work with findById and PopulateOptions', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      age: Number
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({
      name: 'FindById Test',
      email: 'findbyid@test.com',
      age: 32
    })
    const post = await Post.create({
      title: 'FindById Post',
      content: 'Content',
      authorId: author._id
    })

    const found = await Post.findById(post._id).populate({
      path: 'authorId',
      select: { name: 1 }
    })

    assert.ok(found)
    const populatedAuthor = found!.authorId as any
    assert.strictEqual(populatedAuthor.name, 'FindById Test')
    assert.strictEqual(populatedAuthor.email, undefined)
    assert.strictEqual(populatedAuthor.age, undefined)
  })

  await t.test('should handle populate with match that excludes all documents', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      active: Boolean
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' }
    })

    const Author = model('Author', authorSchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Test', email: 'test@test.com', active: false })
    await Post.create({
      title: 'Test Post',
      content: 'Content',
      authorId: author._id
    })

    const posts = await Post.find().populate({
      path: 'authorId',
      match: { active: true } // No authors match this
    })

    assert.strictEqual(posts.length, 1)
    // When match fails, authorId should remain as ObjectId
    assert.ok(posts[0].authorId instanceof ObjectId)
  })

  await t.test('should handle empty select array gracefully', async () => {
    await clearRegistry()

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

    const author = await Author.create({ name: 'Empty Select', email: 'empty@test.com' })
    await Post.create({
      title: 'Empty Select Post',
      content: 'Content',
      authorId: author._id
    })

    const posts = await Post.find().populate({
      path: 'authorId',
      select: []
    })

    assert.strictEqual(posts.length, 1)
    const populatedAuthor = posts[0].authorId as any
    // Empty select should still populate the document
    assert.strictEqual(typeof populatedAuthor, 'object')
    assert.ok(populatedAuthor._id)
  })

  await t.test('should handle chaining string array then PopulateOptions', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      age: Number
    })

    const categorySchema = new Schema<CategoryDoc>({
      name: String,
      description: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' },
      categoryId: { type: ObjectId, ref: 'Category' }
    })

    const Author = model('Author', authorSchema)
    const Category = model('Category', categorySchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Chain Test', email: 'chain@test.com', age: 33 })
    const category = await Category.create({ name: 'Tech', description: 'Technology' })

    await Post.create({
      title: 'Chain Test',
      content: 'Testing chain',
      authorId: author._id,
      categoryId: category._id
    })

    // Start with string array, then add PopulateOptions
    const posts = await Post.find().populate(['categoryId']).populate({
      path: 'authorId',
      select: 'name age'
    })

    assert.strictEqual(posts.length, 1)

    const populatedAuthor = posts[0].authorId as any
    assert.strictEqual(populatedAuthor.name, 'Chain Test')
    assert.strictEqual(populatedAuthor.age, 33)
    assert.strictEqual(populatedAuthor.email, undefined)

    const populatedCategory = posts[0].categoryId as any
    assert.strictEqual(populatedCategory.name, 'Tech')
    assert.strictEqual(populatedCategory.description, 'Technology')
  })

  await t.test('should handle chaining PopulateOptions then string', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      age: Number
    })

    const categorySchema = new Schema<CategoryDoc>({
      name: String,
      description: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' },
      categoryId: { type: ObjectId, ref: 'Category' }
    })

    const Author = model('Author', authorSchema)
    const Category = model('Category', categorySchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Chain Test 2', email: 'chain2@test.com', age: 35 })
    const category = await Category.create({ name: 'Science', description: 'Scientific content' })

    await Post.create({
      title: 'Chain Test 2',
      content: 'Testing chain 2',
      authorId: author._id,
      categoryId: category._id
    })

    // Start with PopulateOptions, then add string
    const posts = await Post.find()
      .populate({
        path: 'authorId',
        select: 'name age'
      })
      .populate('categoryId')

    assert.strictEqual(posts.length, 1)

    const populatedAuthor = posts[0].authorId as any
    assert.strictEqual(populatedAuthor.name, 'Chain Test 2')
    assert.strictEqual(populatedAuthor.age, 35)
    assert.strictEqual(populatedAuthor.email, undefined)

    const populatedCategory = posts[0].categoryId as any
    assert.strictEqual(populatedCategory.name, 'Science')
    assert.strictEqual(populatedCategory.description, 'Scientific content')
  })

  await t.test('should handle chaining PopulateOptions then string array', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String
    })

    const categorySchema = new Schema<CategoryDoc>({
      name: String,
      description: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' },
      categoryId: { type: ObjectId, ref: 'Category' }
    })

    const Author = model('Author', authorSchema)
    const Category = model('Category', categorySchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Chain Test 3', email: 'chain3@test.com' })
    const category = await Category.create({ name: 'Arts', description: 'Art content' })

    await Post.create({
      title: 'Chain Test 3',
      content: 'Testing chain 3',
      authorId: author._id,
      categoryId: category._id
    })

    // Start with PopulateOptions, then add string array
    const posts = await Post.find()
      .populate({
        path: 'authorId',
        select: 'name'
      })
      .populate(['categoryId'])

    assert.strictEqual(posts.length, 1)

    const populatedAuthor = posts[0].authorId as any
    assert.strictEqual(populatedAuthor.name, 'Chain Test 3')
    assert.strictEqual(populatedAuthor.email, undefined)

    const populatedCategory = posts[0].categoryId as any
    assert.strictEqual(populatedCategory.name, 'Arts')
    assert.strictEqual(populatedCategory.description, 'Art content')
  })

  await t.test('should handle chaining PopulateOptions then another PopulateOptions', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String,
      age: Number
    })

    const categorySchema = new Schema<CategoryDoc>({
      name: String,
      description: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' },
      categoryId: { type: ObjectId, ref: 'Category' }
    })

    const Author = model('Author', authorSchema)
    const Category = model('Category', categorySchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'Chain Test 4', email: 'chain4@test.com', age: 40 })
    const category = await Category.create({ name: 'Music', description: 'Musical content' })

    await Post.create({
      title: 'Chain Test 4',
      content: 'Testing chain 4',
      authorId: author._id,
      categoryId: category._id
    })

    // Chain multiple PopulateOptions
    const posts = await Post.find()
      .populate({
        path: 'authorId',
        select: 'name age'
      })
      .populate({
        path: 'categoryId',
        select: 'name'
      })

    assert.strictEqual(posts.length, 1)

    const populatedAuthor = posts[0].authorId as any
    assert.strictEqual(populatedAuthor.name, 'Chain Test 4')
    assert.strictEqual(populatedAuthor.age, 40)
    assert.strictEqual(populatedAuthor.email, undefined)

    const populatedCategory = posts[0].categoryId as any
    assert.strictEqual(populatedCategory.name, 'Music')
    assert.strictEqual(populatedCategory.description, undefined)
  })

  await t.test(
    'should handle chaining string array then PopulateOptions on findOne()',
    async () => {
      await clearRegistry()

      const authorSchema = new Schema<AuthorDoc>({
        name: String,
        email: String
      })

      const categorySchema = new Schema<CategoryDoc>({
        name: String,
        description: String
      })

      const postSchema = new Schema<PostDoc>({
        title: String,
        content: String,
        authorId: { type: ObjectId, ref: 'Author' },
        categoryId: { type: ObjectId, ref: 'Category' }
      })

      const Author = model('Author', authorSchema)
      const Category = model('Category', categorySchema)
      const Post = model('Post', postSchema)

      const author = await Author.create({ name: 'FindOne Chain 1', email: 'findone1@test.com' })
      const category = await Category.create({ name: 'Tech', description: 'Technology' })

      await Post.create({
        title: 'FindOne Chain Test',
        content: 'Testing',
        authorId: author._id,
        categoryId: category._id
      })

      // Start with string array, then add PopulateOptions (DocumentQueryBuilder)
      const post = await Post.findOne({ title: 'FindOne Chain Test' })
        .populate(['categoryId'])
        .populate({
          path: 'authorId',
          select: 'name'
        })

      assert.ok(post)

      const populatedAuthor = post.authorId as any
      assert.strictEqual(populatedAuthor.name, 'FindOne Chain 1')
      assert.strictEqual(populatedAuthor.email, undefined)

      const populatedCategory = post.categoryId as any
      assert.strictEqual(populatedCategory.name, 'Tech')
    }
  )

  await t.test('should handle chaining PopulateOptions then string on findOne()', async () => {
    await clearRegistry()

    const authorSchema = new Schema<AuthorDoc>({
      name: String,
      email: String
    })

    const categorySchema = new Schema<CategoryDoc>({
      name: String,
      description: String
    })

    const postSchema = new Schema<PostDoc>({
      title: String,
      content: String,
      authorId: { type: ObjectId, ref: 'Author' },
      categoryId: { type: ObjectId, ref: 'Category' }
    })

    const Author = model('Author', authorSchema)
    const Category = model('Category', categorySchema)
    const Post = model('Post', postSchema)

    const author = await Author.create({ name: 'FindOne Chain 2', email: 'findone2@test.com' })
    const category = await Category.create({ name: 'Science', description: 'Scientific' })

    await Post.create({
      title: 'FindOne Chain Test 2',
      content: 'Testing',
      authorId: author._id,
      categoryId: category._id
    })

    // Start with PopulateOptions, then add string (DocumentQueryBuilder)
    const post = await Post.findOne({ title: 'FindOne Chain Test 2' })
      .populate({
        path: 'authorId',
        select: 'name'
      })
      .populate('categoryId')

    assert.ok(post)

    const populatedAuthor = post.authorId as any
    assert.strictEqual(populatedAuthor.name, 'FindOne Chain 2')

    const populatedCategory = post.categoryId as any
    assert.strictEqual(populatedCategory.name, 'Science')
  })

  await t.test(
    'should handle chaining PopulateOptions then string array on findOne()',
    async () => {
      await clearRegistry()

      const authorSchema = new Schema<AuthorDoc>({
        name: String,
        email: String
      })

      const categorySchema = new Schema<CategoryDoc>({
        name: String,
        description: String
      })

      const postSchema = new Schema<PostDoc>({
        title: String,
        content: String,
        authorId: { type: ObjectId, ref: 'Author' },
        categoryId: { type: ObjectId, ref: 'Category' }
      })

      const Author = model('Author', authorSchema)
      const Category = model('Category', categorySchema)
      const Post = model('Post', postSchema)

      const author = await Author.create({ name: 'FindOne Chain 3', email: 'findone3@test.com' })
      const category = await Category.create({ name: 'Arts', description: 'Art' })

      await Post.create({
        title: 'FindOne Chain Test 3',
        content: 'Testing',
        authorId: author._id,
        categoryId: category._id
      })

      // Start with PopulateOptions, then add string array (DocumentQueryBuilder)
      const post = await Post.findOne({ title: 'FindOne Chain Test 3' })
        .populate({
          path: 'authorId',
          select: 'name'
        })
        .populate(['categoryId'])

      assert.ok(post)

      const populatedAuthor = post.authorId as any
      assert.strictEqual(populatedAuthor.name, 'FindOne Chain 3')

      const populatedCategory = post.categoryId as any
      assert.strictEqual(populatedCategory.name, 'Arts')
    }
  )

  await t.test(
    'should handle chaining PopulateOptions then another PopulateOptions on findById()',
    async () => {
      await clearRegistry()

      const authorSchema = new Schema<AuthorDoc>({
        name: String,
        email: String,
        age: Number
      })

      const categorySchema = new Schema<CategoryDoc>({
        name: String,
        description: String
      })

      const postSchema = new Schema<PostDoc>({
        title: String,
        content: String,
        authorId: { type: ObjectId, ref: 'Author' },
        categoryId: { type: ObjectId, ref: 'Category' }
      })

      const Author = model('Author', authorSchema)
      const Category = model('Category', categorySchema)
      const Post = model('Post', postSchema)

      const author = await Author.create({
        name: 'FindById Chain',
        email: 'findbyid@test.com',
        age: 45
      })
      const category = await Category.create({ name: 'Music', description: 'Musical' })

      const post = await Post.create({
        title: 'FindById Chain Test',
        content: 'Testing',
        authorId: author._id,
        categoryId: category._id
      })

      // Chain multiple PopulateOptions on findById (DocumentQueryBuilder)
      const result = await Post.findById(post._id)
        .populate({
          path: 'authorId',
          select: 'name age'
        })
        .populate({
          path: 'categoryId',
          select: 'name'
        })

      assert.ok(result)

      const populatedAuthor = result.authorId as any
      assert.strictEqual(populatedAuthor.name, 'FindById Chain')
      assert.strictEqual(populatedAuthor.age, 45)
      assert.strictEqual(populatedAuthor.email, undefined)

      const populatedCategory = result.categoryId as any
      assert.strictEqual(populatedCategory.name, 'Music')
      assert.strictEqual(populatedCategory.description, undefined)
    }
  )
})
