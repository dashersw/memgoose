# Advanced Features Guide

Complete guide to advanced features in memgoose.

## Table of Contents

- [Virtuals](#virtuals)
- [Hooks (Middleware)](#hooks-middleware)
- [Populate (References)](#populate-references)
- [Discriminators](#discriminators)
- [Instance Methods](#instance-methods)
- [Static Methods](#static-methods)
- [Document Save Method](#document-save-method)
- [Getters and Setters](#getters-and-setters)
- [Subdocuments](#subdocuments)
- [Timestamps](#timestamps)

---

## Virtuals

Virtuals are computed properties that don't get stored in the database.

### Basic Virtuals

```typescript
const userSchema = new Schema({
  firstName: String,
  lastName: String,
  age: Number
})

// Define virtual property
userSchema.virtual('fullName').get(doc => {
  return `${doc.firstName} ${doc.lastName}`
})

userSchema.virtual('isAdult').get(doc => {
  return doc.age >= 18
})

const User = model('User', userSchema)

const user = await User.create({
  firstName: 'Alice',
  lastName: 'Smith',
  age: 25
})

console.log(user.fullName) // "Alice Smith"
console.log(user.isAdult) // true
```

### Two Syntaxes

memgoose supports both parameter and `this` syntax:

```typescript
// Parameter syntax (recommended)
userSchema.virtual('fullName').get(doc => {
  return `${doc.firstName} ${doc.lastName}`
})

// 'this' syntax (Mongoose-compatible)
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`
})
```

### Complex Virtuals

```typescript
const orderSchema = new Schema({
  items: [{ name: String, price: Number, quantity: Number }],
  taxRate: Number
})

orderSchema.virtual('subtotal').get(doc => {
  return doc.items.reduce((sum, item) => {
    return sum + item.price * item.quantity
  }, 0)
})

orderSchema.virtual('tax').get(doc => {
  return doc.subtotal * doc.taxRate
})

orderSchema.virtual('total').get(doc => {
  return doc.subtotal + doc.tax
})

const order = await Order.create({
  items: [
    { name: 'Widget', price: 10, quantity: 2 },
    { name: 'Gadget', price: 15, quantity: 1 }
  ],
  taxRate: 0.08
})

console.log(order.subtotal) // 35
console.log(order.tax) // 2.8
console.log(order.total) // 37.8
```

### Virtuals with Lean Queries

Virtuals are **not included** in lean queries:

```typescript
// Regular query - includes virtuals
const user = await User.findOne({ name: 'Alice' })
console.log(user.fullName) // "Alice Smith"

// Lean query - no virtuals
const leanUser = await User.findOne({ name: 'Alice' }, { lean: true })
console.log(leanUser.fullName) // undefined
```

This makes lean queries faster!

### Use Cases

- **Computed properties**: `fullName`, `age`, `isExpired`
- **Formatting**: `formattedDate`, `formattedPrice`
- **Derived data**: `totalPrice`, `averageRating`
- **Boolean flags**: `isActive`, `hasAccess`, `isValid`

---

## Hooks (Middleware)

Hooks execute custom logic before or after operations.

### Pre Hooks

Execute **before** an operation:

```typescript
const userSchema = new Schema({
  name: String,
  email: String,
  createdAt: Date
})

// Pre-save hook
userSchema.pre('save', ({ doc }) => {
  doc.createdAt = new Date()
  console.log('About to save:', doc.name)
})

// Async pre-hook
userSchema.pre('save', async ({ doc }) => {
  await validateEmail(doc.email)
})

const User = model('User', userSchema)

await User.create({ name: 'Alice', email: 'alice@example.com' })
// Logs: "About to save: Alice"
```

### Post Hooks

Execute **after** an operation:

```typescript
// Post-save hook
userSchema.post('save', ({ doc }) => {
  console.log(`Saved user: ${doc.name}`)
})

// Post-delete hook
userSchema.post('delete', ({ deletedCount, docs }) => {
  console.log(`Deleted ${deletedCount} users`)
  docs?.forEach(doc => console.log(`- ${doc.name}`))
})

// Post-update hook
userSchema.post('update', ({ modifiedCount }) => {
  console.log(`Updated ${modifiedCount} documents`)
})
```

### Hook Events

| Event     | Pre Context                | Post Context                               |
| --------- | -------------------------- | ------------------------------------------ |
| `save`    | `{ doc }`                  | `{ doc }`                                  |
| `delete`  | `{ query }`                | `{ query, deletedCount, docs? }`           |
| `update`  | `{ query, update?, doc? }` | `{ query, update?, modifiedCount, docs? }` |
| `find`    | `{ query }`                | `{ query, results? }`                      |
| `findOne` | `{ query }`                | `{ query, result? }`                       |

### Save Hooks

```typescript
userSchema.pre('save', ({ doc }) => {
  // Normalize email
  doc.email = doc.email.toLowerCase().trim()
})

userSchema.post('save', ({ doc }) => {
  // Send welcome email
  emailService.sendWelcome(doc.email)
})

await User.create({ name: 'Alice', email: '  ALICE@EXAMPLE.COM  ' })
// Email is normalized before save
// Welcome email sent after save
```

### Delete Hooks

```typescript
userSchema.pre('delete', async ({ query }) => {
  // Cascade delete
  const users = await User.find(query)
  for (const user of users) {
    await Post.deleteMany({ authorId: user._id })
  }
})

userSchema.post('delete', ({ deletedCount }) => {
  console.log(`Cleaned up ${deletedCount} users`)
})
```

### Update Hooks

```typescript
userSchema.pre('update', ({ query, update }) => {
  // Add updatedAt timestamp
  if (!update.$set) update.$set = {}
  update.$set.updatedAt = new Date()
})

userSchema.post('update', ({ modifiedCount }) => {
  if (modifiedCount > 0) {
    console.log('Update successful')
  }
})
```

### Find Hooks

```typescript
userSchema.pre('find', ({ query }) => {
  console.log('Searching for:', query)
})

userSchema.post('find', ({ results }) => {
  console.log(`Found ${results?.length || 0} documents`)
})

userSchema.post('findOne', ({ result }) => {
  if (result) {
    console.log(`Found: ${result.name}`)
  } else {
    console.log('Not found')
  }
})
```

### Async Hooks

Hooks support async operations:

```typescript
userSchema.pre('save', async ({ doc }) => {
  // Async validation
  const exists = await checkUsernameExists(doc.username)
  if (exists) {
    throw new Error('Username already taken')
  }

  // Async transformation
  doc.avatar = await generateAvatar(doc.name)
})

userSchema.post('save', async ({ doc }) => {
  // Async notification
  await notificationService.notify(doc.email, 'Account created')
})
```

### Multiple Hooks

Register multiple hooks for the same event:

```typescript
userSchema.pre('save', ({ doc }) => {
  console.log('First hook')
})

userSchema.pre('save', ({ doc }) => {
  console.log('Second hook')
})

userSchema.pre('save', ({ doc }) => {
  console.log('Third hook')
})

// All three hooks execute in order
await User.create({ name: 'Alice' })
```

### Use Cases

**Pre-save:**

- Validation
- Normalization
- Encryption
- ID generation
- Default values

**Post-save:**

- Notifications
- Logging
- Analytics
- Cache updates
- Webhooks

**Pre-delete:**

- Cascade deletes
- Authorization checks
- Backup creation

**Post-delete:**

- Cleanup
- Audit logs
- Cache invalidation

**Pre-update:**

- Authorization
- Timestamp updates
- Validation

**Post-update:**

- Notifications
- Cache updates
- Event triggers

---

## Populate (References)

Populate replaces document references with actual documents.

### Define References

Use `ObjectId` with `ref` option:

```typescript
import { ObjectId, Schema, model } from 'memgoose'

// User schema
const userSchema = new Schema({
  name: String,
  email: String
})

const User = model('User', userSchema)

// Post schema with author reference
const postSchema = new Schema({
  title: String,
  content: String,
  authorId: { type: ObjectId, ref: 'User' }
})

const Post = model('Post', postSchema)
```

### Create Referenced Documents

```typescript
// Create user
const user = await User.create({
  name: 'Alice',
  email: 'alice@example.com'
})

// Create post with reference
const post = await Post.create({
  title: 'Hello World',
  content: 'My first post',
  authorId: user._id
})
```

### Basic Populate

```typescript
// Without populate - just the ID
const post = await Post.findOne({ title: 'Hello World' })
console.log(post.authorId) // ObjectId("507f1f77bcf86cd799439011")

// With populate - full user document
const post = await Post.findOne(
  { title: 'Hello World' },
  {
    populate: 'authorId'
  }
)
console.log(post.authorId)
// { _id: "507f...", name: "Alice", email: "alice@example.com" }
```

### Query Chaining

```typescript
const post = await Post.findOne({ title: 'Hello World' }).populate('authorId').exec()

console.log(post.authorId.name) // "Alice"
```

### Multiple References

```typescript
const postSchema = new Schema({
  title: String,
  authorId: { type: ObjectId, ref: 'User' },
  categoryId: { type: ObjectId, ref: 'Category' },
  reviewerId: { type: ObjectId, ref: 'User' }
})

// Populate multiple fields
const post = await Post.findOne(
  { title: 'Hello' },
  {
    populate: ['authorId', 'categoryId', 'reviewerId']
  }
)

// Or with chaining
const post2 = await Post.findOne({ title: 'Hello' })
  .populate('authorId')
  .populate('categoryId')
  .populate('reviewerId')
  .exec()
```

### Populate Arrays

```typescript
const postSchema = new Schema({
  title: String,
  commentIds: [{ type: ObjectId, ref: 'Comment' }],
  tagIds: [{ type: ObjectId, ref: 'Tag' }]
})

const post = await Post.create({
  title: 'Hello',
  commentIds: [comment1._id, comment2._id, comment3._id],
  tagIds: [tag1._id, tag2._id]
})

// Populate array references
const populatedPost = await Post.findOne(
  { title: 'Hello' },
  {
    populate: ['commentIds', 'tagIds']
  }
)

console.log(populatedPost.commentIds)
// [{ _id: "...", text: "Great post!" }, { _id: "...", text: "Thanks!" }, ...]
```

### Populate with Find

```typescript
// Populate all results
const posts = await Post.find(
  { status: 'published' },
  {
    populate: 'authorId'
  }
)

posts.forEach(post => {
  console.log(`${post.title} by ${post.authorId.name}`)
})
```

### Nested Populate

Currently, memgoose doesn't support nested populate (e.g., populating author's company). This is a potential future enhancement.

### Use Cases

- **Author relationships**: Posts → User
- **Category relationships**: Products → Category
- **One-to-many**: User → Posts[]
- **Many-to-many**: Posts ↔ Tags[]

---

## Discriminators

Discriminators allow schema inheritance for polymorphic models.

### Basic Discriminators

```typescript
// Base event schema
const eventSchema = new Schema(
  {
    title: String,
    date: Date
  },
  { discriminatorKey: 'type' }
)

const Event = model('Event', eventSchema)

// Meeting extends Event
const meetingSchema = new Schema({
  location: String,
  attendees: [String]
})

const Meeting = Event.discriminator('Meeting', meetingSchema)

// Webinar extends Event
const webinarSchema = new Schema({
  url: String,
  platform: String
})

const Webinar = Event.discriminator('Webinar', webinarSchema)
```

### Creating Discriminated Documents

```typescript
// Create meeting
const meeting = await Meeting.create({
  title: 'Team Standup',
  date: new Date('2025-10-21'),
  location: 'Conference Room A',
  attendees: ['Alice', 'Bob', 'Charlie']
})

// Create webinar
const webinar = await Webinar.create({
  title: 'Product Launch',
  date: new Date('2025-10-22'),
  url: 'https://zoom.us/j/123',
  platform: 'Zoom'
})

// Both stored in Event collection with 'type' field
console.log(meeting.type) // 'Meeting'
console.log(webinar.type) // 'Webinar'
```

### Querying Discriminators

```typescript
// Query base model - returns all types
const allEvents = await Event.find()
console.log(allEvents.length) // 2

// Query specific discriminator
const meetings = await Meeting.find()
console.log(meetings.length) // 1

const webinars = await Webinar.find()
console.log(webinars.length) // 1

// Filter by type manually
const meetingsManual = await Event.find({ type: 'Meeting' })
```

### Discriminator Key

The discriminator key (default: `type`) identifies which discriminator a document belongs to:

```typescript
// Custom discriminator key
const eventSchema = new Schema(
  {
    title: String
  },
  { discriminatorKey: 'kind' }
)

const Event = model('Event', eventSchema)
const Meeting = Event.discriminator('Meeting', meetingSchema)

const meeting = await Meeting.create({ title: 'Standup' })
console.log(meeting.kind) // 'Meeting'
```

### Use Cases

- **Polymorphic models**: Events (Meeting, Webinar, Conference)
- **Content types**: Content (Article, Video, Image)
- **Users**: User (Admin, Customer, Guest)
- **Notifications**: Notification (Email, SMS, Push)

---

## Instance Methods

Add custom methods to document instances.

### Define Instance Methods

```typescript
interface User {
  firstName: string
  lastName: string
  email: string
  password: string
}

const userSchema = new Schema<User>({
  firstName: String,
  lastName: String,
  email: String,
  password: String
})

// Add instance method
userSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`
}

userSchema.methods.checkPassword = function (password: string): boolean {
  return this.password === hashPassword(password)
}

userSchema.methods.sendEmail = async function (subject: string, body: string) {
  await emailService.send(this.email, subject, body)
}

const User = model('User', userSchema)
```

### Use Instance Methods

```typescript
const user = await User.findOne({ email: 'alice@example.com' })

// Call methods
console.log(user.getFullName()) // "Alice Smith"

if (user.checkPassword('secret123')) {
  console.log('Password correct')
}

await user.sendEmail('Welcome', 'Thanks for signing up!')
```

### TypeScript Support

For proper TypeScript support, extend the interface:

```typescript
interface UserDocument extends User {
  getFullName(): string
  checkPassword(password: string): boolean
  sendEmail(subject: string, body: string): Promise<void>
}

const userSchema = new Schema<UserDocument>({
  firstName: String,
  lastName: String,
  email: String,
  password: String
})

userSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`
}

const User = model('User', userSchema)

// Now TypeScript knows about methods
const user = await User.findOne({ email: 'alice@example.com' })
user.getFullName() // TypeScript autocomplete works!
```

---

## Static Methods

Add custom methods to the model itself.

### Define Static Methods

```typescript
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email })
}

userSchema.statics.findAdults = function () {
  return this.find({ age: { $gte: 18 } })
}

userSchema.statics.createAdmin = async function (data: Partial<User>) {
  return this.create({
    ...data,
    role: 'admin',
    permissions: ['all']
  })
}

const User = model('User', userSchema)
```

### Use Static Methods

```typescript
// Call static methods on model
const user = await User.findByEmail('alice@example.com')

const adults = await User.findAdults()

const admin = await User.createAdmin({
  name: 'Admin User',
  email: 'admin@example.com'
})
```

### TypeScript Support

```typescript
interface UserModel extends Model<UserDocument> {
  findByEmail(email: string): Promise<UserDocument | null>
  findAdults(): Promise<UserDocument[]>
  createAdmin(data: Partial<User>): Promise<UserDocument>
}

const User = model('User', userSchema) as UserModel

// TypeScript autocomplete works
const user = await User.findByEmail('alice@example.com')
```

---

## Document Save Method

Save changes made to a document back to the database.

### Basic Save

```typescript
const user = await User.findOne({ name: 'Alice' })

// Modify document
user.age = 26
user.city = 'NYC'
user.lastModified = new Date()

// Save changes
await user.save()
```

### Save Behavior

The `save()` method:

- Validates the document
- Executes pre/post save hooks
- Updates timestamps (if enabled)
- Checks unique constraints
- Rebuilds indexes if needed
- Returns the updated document with virtuals

```typescript
const userSchema = new Schema(
  {
    name: String,
    age: { type: Number, min: 0 }
  },
  { timestamps: true }
)

userSchema.pre('save', ({ doc }) => {
  console.log('About to save:', doc.name)
})

const user = await User.findOne({ name: 'Alice' })
user.age = -5 // Invalid!

try {
  await user.save() // Throws ValidationError
} catch (err) {
  console.error(err.message) // "age must be at least 0"
}
```

### Save vs Update

```typescript
// Using save() - validates, runs hooks
const user = await User.findOne({ name: 'Alice' })
user.age = 26
await user.save()

// Using updateOne() - direct database update
await User.updateOne({ name: 'Alice' }, { $set: { age: 26 } })
```

**Use `save()` when:**

- You need validation
- You need hooks
- You want timestamps updated
- You're modifying fetched documents

**Use `updateOne()` when:**

- Direct database updates
- Bulk operations
- Performance is critical

### Not Available on Lean Documents

```typescript
// Regular query - save() available
const user = await User.findOne({ name: 'Alice' })
await user.save() // ✅ Works

// Lean query - no save() method
const leanUser = await User.findOne({ name: 'Alice' }, { lean: true })
await leanUser.save() // ❌ Error: not a function
```

---

## Getters and Setters

Transform field values when reading or writing.

### Getters

Applied when **reading** a field:

```typescript
const productSchema = new Schema({
  priceInCents: {
    type: Number,
    get: value => value / 100 // Convert cents to dollars
  }
})

const product = await Product.create({ priceInCents: 1999 })
console.log(product.priceInCents) // 19.99 (getter applied)
```

### Setters

Applied when **writing** a field:

```typescript
const userSchema = new Schema({
  email: {
    type: String,
    set: value => value.toLowerCase().trim()
  }
})

const user = await User.create({
  email: '  ALICE@EXAMPLE.COM  '
})
console.log(user.email) // "alice@example.com" (setter applied)
```

### Combined Getter and Setter

```typescript
const userSchema = new Schema({
  password: {
    type: String,
    set: value => hashPassword(value), // Hash on write
    get: value => '***HIDDEN***' // Hide on read
  }
})

const user = await User.create({ password: 'secret123' })
console.log(user.password) // "***HIDDEN***"
// But stored as hashed value in database
```

### Practical Examples

**Price formatting:**

```typescript
priceInCents: {
  type: Number,
  get: (value) => (value / 100).toFixed(2),
  set: (value) => Math.round(value * 100)
}

const product = await Product.create({ priceInCents: 19.99 })
// Stored as 1999, read as "19.99"
```

**Email normalization:**

```typescript
email: {
  type: String,
  set: (value) => value.toLowerCase().trim()
}
```

**Phone number formatting:**

```typescript
phone: {
  type: String,
  set: (value) => value.replace(/\D/g, ''),  // Remove non-digits
  get: (value) => {
    // Format as (123) 456-7890
    const match = value.match(/^(\d{3})(\d{3})(\d{4})$/)
    return match ? `(${match[1]}) ${match[2]}-${match[3]}` : value
  }
}
```

---

## Subdocuments

Nested schemas within a parent schema.

### Single Subdocument

```typescript
const addressSchema = new Schema({
  street: String,
  city: String,
  state: String,
  zipCode: { type: String, match: /^\d{5}$/ }
})

const userSchema = new Schema({
  name: String,
  address: addressSchema
})

const user = await User.create({
  name: 'Alice',
  address: {
    street: '123 Main St',
    city: 'New York',
    state: 'NY',
    zipCode: '10001'
  }
})

console.log(user.address.city) // 'New York'
```

### Array of Subdocuments

```typescript
const phoneSchema = new Schema({
  type: { type: String, enum: ['home', 'work', 'mobile'] },
  number: String
})

const userSchema = new Schema({
  name: String,
  phones: [phoneSchema]
})

const user = await User.create({
  name: 'Alice',
  phones: [
    { type: 'home', number: '555-1234' },
    { type: 'mobile', number: '555-5678' }
  ]
})

console.log(user.phones[0].type) // 'home'
```

### Nested Subdocuments

```typescript
const coordinatesSchema = new Schema({
  lat: Number,
  lng: Number
})

const addressSchema = new Schema({
  street: String,
  city: String,
  coordinates: coordinatesSchema
})

const userSchema = new Schema({
  name: String,
  address: addressSchema
})

const user = await User.create({
  name: 'Alice',
  address: {
    street: '123 Main St',
    city: 'NYC',
    coordinates: { lat: 40.7128, lng: -74.006 }
  }
})

console.log(user.address.coordinates.lat) // 40.7128
```

### Subdocument Validation

Validation rules in subdocuments work automatically:

```typescript
const addressSchema = new Schema({
  street: { type: String, required: true },
  zipCode: { type: String, match: /^\d{5}$/ }
})

try {
  await User.create({
    name: 'Alice',
    address: { zipCode: '10001' } // Missing required 'street'
  })
} catch (err) {
  console.error(err.message) // "address: street is required"
}
```

### Subdocument Methods

```typescript
const addressSchema = new Schema({
  street: String,
  city: String,
  state: String,
  zipCode: String
})

addressSchema.methods.getFullAddress = function () {
  return `${this.street}, ${this.city}, ${this.state} ${this.zipCode}`
}

const user = await User.findOne({ name: 'Alice' })
console.log(user.address.getFullAddress())
// "123 Main St, New York, NY 10001"
```

---

## Timestamps

Automatically manage `createdAt` and `updatedAt` fields.

### Enable Timestamps

```typescript
const userSchema = new Schema(
  {
    name: String,
    email: String
  },
  { timestamps: true }
)

const user = await User.create({ name: 'Alice' })
console.log(user.createdAt) // 2025-10-20T10:30:00.000Z
console.log(user.updatedAt) // 2025-10-20T10:30:00.000Z
```

### Auto-Update on Modification

```typescript
// Update a user
await User.updateOne({ name: 'Alice' }, { $set: { email: 'alice@example.com' } })

const updated = await User.findOne({ name: 'Alice' })
console.log(updated.createdAt) // 2025-10-20T10:30:00.000Z (unchanged)
console.log(updated.updatedAt) // 2025-10-20T10:35:00.000Z (updated!)
```

### Custom Field Names

```typescript
const schema = new Schema(
  {
    name: String
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
)

const user = await User.create({ name: 'Alice' })
console.log(user.created_at) // Uses custom field name
console.log(user.updated_at)
```

### Disable Specific Timestamps

```typescript
// Only createdAt
const schema1 = new Schema(
  {
    name: String
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false
    }
  }
)

// Only updatedAt
const schema2 = new Schema(
  {
    name: String
  },
  {
    timestamps: {
      createdAt: false,
      updatedAt: true
    }
  }
)
```

### Use Cases

- **Audit trails**: Track when records were created/modified
- **Sorting**: Sort by creation or modification date
- **Analytics**: Track user activity patterns
- **Debugging**: Investigate when changes occurred
