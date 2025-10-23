import { Schema, createDatabase, ObjectId } from '../index'

interface CompanyDoc {
  name: string
  location: string
  industry: string
  verified: boolean
}

interface AuthorDoc {
  name: string
  email: string
  companyId: any
  active: boolean
  reputation: number
}

interface PostDoc {
  title: string
  content: string
  authorId: any
  categoryId: any
  tags: string[]
  published: boolean
}

interface CategoryDoc {
  name: string
  description: string
}

const companySchema = new Schema<CompanyDoc>({
  name: String,
  location: String,
  industry: String,
  verified: Boolean
})

const authorSchema = new Schema<AuthorDoc>({
  name: String,
  email: String,
  companyId: { type: ObjectId, ref: 'Company' },
  active: Boolean,
  reputation: Number
})

const categorySchema = new Schema<CategoryDoc>({
  name: String,
  description: String
})

const postSchema = new Schema<PostDoc>({
  title: String,
  content: String,
  authorId: { type: ObjectId, ref: 'Author' },
  categoryId: { type: ObjectId, ref: 'Category' },
  tags: [String],
  published: Boolean
})

const db = createDatabase()
const Company = db.model('Company', companySchema)
const Author = db.model('Author', authorSchema)
const Category = db.model('Category', categorySchema)
const Post = db.model('Post', postSchema)

async function main() {
  console.log('=== Advanced Populate Demo ===\n')

  // Seed data
  const techCorp = await Company.create({
    name: 'TechCorp',
    location: 'San Francisco',
    industry: 'Technology',
    verified: true
  })

  const startupInc = await Company.create({
    name: 'StartupInc',
    location: 'Austin',
    industry: 'Technology',
    verified: false
  })

  const alice = await Author.create({
    name: 'Alice Johnson',
    email: 'alice@techcorp.com',
    companyId: techCorp._id,
    active: true,
    reputation: 150
  })

  const bob = await Author.create({
    name: 'Bob Smith',
    email: 'bob@startup.com',
    companyId: startupInc._id,
    active: false,
    reputation: 50
  })

  const charlie = await Author.create({
    name: 'Charlie Brown',
    email: 'charlie@techcorp.com',
    companyId: techCorp._id,
    active: true,
    reputation: 200
  })

  const tech = await Category.create({
    name: 'Technology',
    description: 'Tech articles and tutorials'
  })

  const business = await Category.create({
    name: 'Business',
    description: 'Business insights and news'
  })

  await Post.insertMany([
    {
      title: 'Introduction to TypeScript',
      content: 'TypeScript is...',
      authorId: alice._id,
      categoryId: tech._id,
      tags: ['typescript', 'programming'],
      published: true
    },
    {
      title: 'Building Startups',
      content: 'How to build...',
      authorId: bob._id,
      categoryId: business._id,
      tags: ['startup', 'business'],
      published: true
    },
    {
      title: 'Advanced Node.js',
      content: 'Node.js patterns...',
      authorId: charlie._id,
      categoryId: tech._id,
      tags: ['nodejs', 'backend'],
      published: true
    },
    {
      title: 'Draft Post',
      content: 'Unpublished...',
      authorId: bob._id,
      categoryId: tech._id,
      tags: ['draft'],
      published: false
    }
  ])

  // Example 1: Basic populate
  console.log('1. Basic Populate (backward compatible):\n')
  const posts1 = await Post.find().populate('authorId').exec()
  console.log(
    posts1.slice(0, 2).map(p => ({
      title: p.title,
      author: (p.authorId as any).name
    }))
  )
  console.log()

  // Example 2: Populate with field selection
  console.log('2. Populate with Field Selection:\n')
  const posts2 = await Post.find().populate({ path: 'authorId', select: 'name email' }).exec()
  console.log(
    posts2.slice(0, 2).map(p => ({
      title: p.title,
      author: p.authorId
    }))
  )
  console.log()

  // Example 3: Populate with match filter
  console.log('3. Populate with Match Filter (only active authors):\n')
  const posts3 = await Post.find()
    .populate({
      path: 'authorId',
      match: { active: true }
    })
    .exec()
  console.log(
    posts3.map(p => ({
      title: p.title,
      author: (p.authorId as any)?.name || 'N/A (inactive author)'
    }))
  )
  console.log()

  // Example 4: Nested populate (2 levels)
  console.log('4. Nested Populate (Author → Company):\n')
  const posts4 = await Post.find()
    .populate({
      path: 'authorId',
      select: 'name email companyId',
      populate: {
        path: 'companyId',
        select: 'name location'
      }
    })
    .exec()
  console.log(
    posts4.slice(0, 2).map(p => ({
      title: p.title,
      author: {
        name: (p.authorId as any).name,
        company: (p.authorId as any).companyId
      }
    }))
  )
  console.log()

  // Example 5: Multiple populates
  console.log('5. Multiple Populates (Author + Category):\n')
  const posts5 = await Post.find()
    .populate({ path: 'authorId', select: 'name' })
    .populate({ path: 'categoryId', select: 'name' })
    .exec()
  console.log(
    posts5.slice(0, 2).map(p => ({
      title: p.title,
      author: (p.authorId as any).name,
      category: (p.categoryId as any).name
    }))
  )
  console.log()

  // Example 6: Nested populate with match filters at each level
  console.log('6. Advanced: Nested Populate with Match at Each Level:\n')
  const posts6 = await Post.find({ published: true })
    .populate({
      path: 'authorId',
      select: 'name email reputation companyId',
      match: { active: true, reputation: { $gte: 100 } },
      populate: {
        path: 'companyId',
        select: 'name location verified',
        match: { verified: true }
      }
    })
    .exec()
  console.log(
    posts6.map(p => ({
      title: p.title,
      author: p.authorId
        ? {
            name: (p.authorId as any).name,
            reputation: (p.authorId as any).reputation,
            company: (p.authorId as any).companyId
          }
        : 'N/A (filtered out)'
    }))
  )
  console.log()

  // Example 7: Combined select + match + nested
  console.log('7. Full Featured: Select + Match + Nested:\n')
  const posts7 = await Post.find()
    .populate({
      path: 'authorId',
      select: '-email', // Exclude email
      match: { active: true },
      populate: {
        path: 'companyId',
        select: 'name location -_id', // Exclude _id
        match: { industry: 'Technology' }
      }
    })
    .exec()
  console.log(
    posts7.slice(0, 2).map(p => ({
      title: p.title,
      author: p.authorId
    }))
  )
  console.log()

  // Example 8: Array population
  interface Article {
    title: string
    authorIds: any[]
    content: string
  }

  const articleSchema = new Schema<Article>({
    title: String,
    authorIds: [{ type: ObjectId, ref: 'Author' }],
    content: String
  })

  const Article2 = db.model('Article', articleSchema)

  await Article2.create({
    title: 'Collaborative Article',
    authorIds: [alice._id, charlie._id],
    content: 'This article was written by...'
  })

  console.log('8. Populate Array of References:\n')
  const articles = await Article2.find()
    .populate({
      path: 'authorIds',
      select: 'name email',
      match: { active: true }
    })
    .exec()
  console.log({
    title: articles[0].title,
    authors: articles[0].authorIds
  })
  console.log()

  // Cleanup
  await db.disconnect()
  console.log('=== Demo Complete ===')
}

main().catch(console.error)
