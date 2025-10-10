import { Schema, model } from '../index'

// Advanced example showcasing virtuals and hooks - Mongoose style!

interface UserDoc {
  firstName: string
  lastName: string
  email: string
  age: number
  createdAt?: Date
  updatedAt?: Date
  fullName: string
  initials: string
  isAdult: boolean
}

const userSchema = new Schema<UserDoc>({
  firstName: String,
  lastName: String,
  email: String,
  age: Number
})

// === Virtuals ===

// Computed property: fullName
userSchema.virtual('fullName').get(function (this: UserDoc) {
  return `${this.firstName} ${this.lastName}`
})

// Computed property: initials
userSchema.virtual('initials').get(function (this: UserDoc) {
  return `${this.firstName[0]}.${this.lastName[0]}.`
})

// Computed property: isAdult
userSchema.virtual('isAdult').get(function (this: UserDoc) {
  return this.age >= 18
})

// === Hooks ===

// Pre-save: Add timestamps
userSchema.pre('save', ({ doc }) => {
  if (!doc.createdAt) {
    doc.createdAt = new Date()
  }
  doc.updatedAt = new Date()
})

// Post-save: Log
userSchema.post('save', ({ doc }) => {
  console.log(`[LOG] Saved: ${doc.firstName} ${doc.lastName}`)
})

// Pre-update: Add updated timestamp
userSchema.pre('update', async ({ doc, update }) => {
  // Simulate async operation (e.g., validation)
  await new Promise(resolve => setTimeout(resolve, 1))

  if (doc && update) {
    console.log(`[LOG] Updating ${doc.firstName}...`)
  }
})

// Post-delete: Log
userSchema.post('delete', ({ deletedCount, docs }) => {
  console.log(`[LOG] Deleted ${deletedCount} document(s)`)
  if (docs) {
    docs.forEach((doc: any) => console.log(`  - ${doc.firstName} ${doc.lastName}`))
  }
})

// Pre-findOne: Log query
userSchema.pre('findOne', ({ query }) => {
  console.log(`[LOG] Finding:`, query)
})

// Create model
const User = model<UserDoc>('User', userSchema)

;(async () => {
  console.log('=== Virtuals and Hooks Demo ===\n')

  // Insert users (triggers pre/post save hooks)
  console.log('Creating users...')
  await User.insertMany([
    { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', age: 25 },
    { firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com', age: 30 }
  ])

  console.log('\nQuerying user (triggers pre-findOne hook)...')
  const alice = await User.findOne({ firstName: 'Alice' })

  if (alice) {
    console.log('\nVirtual properties:')
    console.log('  Full name:', alice.fullName)
    console.log('  Initials:', alice.initials)
    console.log('  Is adult:', alice.isAdult)

    console.log('\nTimestamps (added by pre-save hook):')
    console.log('  Created:', alice.createdAt)
    console.log('  Updated:', alice.updatedAt)
  }

  // Update user (triggers pre/post update hooks)
  console.log('\nUpdating user...')
  await User.updateOne({ firstName: 'Alice' }, { $inc: { age: 1 } })

  // Delete user (triggers post-delete hook)
  console.log('\nDeleting users...')
  await User.deleteMany({ age: { $gte: 25 } })

  console.log('\n=== Demo Complete ===')
})()
