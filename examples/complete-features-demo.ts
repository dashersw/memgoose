import { Schema, model, clearRegistry, Document, ObjectId } from '../index'

// Showcase all new Mongoose features
;(async () => {
  console.log('=== Memgoose Feature Showcase ===\n')

  clearRegistry()

  // 1. Validation + Defaults + Timestamps
  console.log('1. Validation, Defaults & Timestamps:')

  interface UserDoc extends Document {
    name: string
    email: string
    age: number // Has default, always present
    status: string
    tags: string[] // Array field
    createdAt: Date
    updatedAt: Date
    greet(): string
  }

  const userSchema = new Schema<UserDoc>(
    {
      name: { type: String, required: true, minLength: 2 },
      email: { type: String, required: true, match: /@/, set: (v: string) => v.toLowerCase() },
      age: { type: Number, min: 0, max: 120, default: 0 },
      status: { type: String, enum: ['active', 'inactive'], default: 'active' },
      tags: { type: Array, default: [] }
    },
    { timestamps: true }
  )

  // Add unique index
  userSchema.index('email', { unique: true })

  // Add instance method
  userSchema.methods.greet = function () {
    return `Hello, I'm ${this.name}!`
  }

  const User = model('User', userSchema)

  const user = await User.create({ name: 'Alice', email: 'ALICE@EXAMPLE.COM' })
  console.log('Created:', { name: user.name, email: user.email, status: user.status })
  console.log('Greeting:', user.greet())
  console.log('Timestamps:', {
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  })

  // 2. Query Operators
  console.log('\n2. New Query Operators ($exists, $size, $elemMatch):')
  await User.insertMany([
    { name: 'Bob', email: 'bob@example.com', age: 30, tags: ['dev', 'js'] },
    { name: 'Charlie', email: 'charlie@example.com', tags: ['designer'] }
  ])

  const withAge = await User.find({ age: { $exists: true } })
  console.log(
    'Users with age field:',
    withAge.map(u => u.name)
  )

  // 3. Lean queries
  console.log('\n3. Lean Queries (performance):')
  const leanUsers = await User.find().lean()
  console.log('Lean result has toJSON?', typeof leanUsers[0].toJSON)

  // 4. Field Selection
  console.log('\n4. Field Selection:')
  const selected = await User.find().select('name email')
  console.log('Selected fields:', selected[0])

  // 5. Populate
  console.log('\n5. Populate (References):')

  interface PostDoc extends Document {
    title: string
    authorId: ObjectId | UserDoc // Can be populated
  }

  const postSchema = new Schema<PostDoc>({
    title: String,
    authorId: { type: ObjectId, ref: 'User' }
  })

  const Post = model('Post', postSchema)
  const author = await User.create({ name: 'Author', email: 'author@example.com' })
  await Post.create({ title: 'Great Post', authorId: author._id })

  type PopulatedPost = Omit<PostDoc, 'authorId'> & { authorId: UserDoc }
  const posts = await Post.find().populate<PopulatedPost>('authorId')
  const post = posts[0]
  console.log('Post with author:', {
    title: post.title,
    authorId: post.authorId._id,
    author: post.authorId.name
  })

  // 6. Subdocuments
  console.log('\n6. Subdocuments (Nested Schemas):')

  interface AddressDoc {
    street: string
    city: string
    zip: string
  }

  interface CompanyDoc extends Document {
    name: string
    address: AddressDoc
  }

  const addressSchema = new Schema<AddressDoc>({
    street: String,
    city: { type: String, required: true },
    zip: { type: String, default: '00000' }
  })

  const companySchema = new Schema<CompanyDoc>({
    name: String,
    address: addressSchema
  })

  const Company = model('Company', companySchema)
  const company = await Company.create({
    name: 'Acme Corp',
    address: { street: '123 Main St', city: 'NYC' }
  })

  console.log('Company:', {
    name: company.name,
    address: company.address
  })

  // 7. Discriminators
  console.log('\n7. Discriminators (Inheritance):')

  interface AnimalDoc extends Document {
    name: string
    age: number
  }

  const animalSchema = new Schema<AnimalDoc>({
    name: String,
    age: Number
  })

  interface DogExtras {
    breed: string
  }

  const dogSchema = new Schema<DogExtras>({
    breed: String
  })

  const Animal = model('Animal', animalSchema)
  const Dog = Animal.discriminator('Dog', dogSchema)

  await Dog.create({ name: 'Rex', age: 5, breed: 'Husky' })
  await Animal.create({ name: 'Generic', age: 10 })

  const allAnimals = await Animal.find()
  const onlyDogs = await Dog.find()

  console.log('All animals:', allAnimals.length)
  console.log('Only dogs:', onlyDogs.length)

  console.log('\n=== All Features Working! ===')
})()
