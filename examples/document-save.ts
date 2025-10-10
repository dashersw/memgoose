/**
 * Document Save Method Example
 *
 * Demonstrates Mongoose-style document saving where you can:
 * 1. Fetch a document from the database
 * 2. Modify its properties
 * 3. Save it back with a simple .save() call
 */

import { Schema, model, Document } from '../index'

interface User extends Document {
  name: string
  email: string
  age: number
  city?: string
  updatedAt: Date
}

// Create schema with timestamps
const userSchema = new Schema<User>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    age: { type: Number, min: 0, max: 120 },
    city: String
  },
  { timestamps: true }
)

// Add a pre-save hook
userSchema.pre('save', ({ doc }) => {
  console.log(`  → Pre-save hook: Saving ${doc.name}...`)
})

// Add a post-save hook
userSchema.post('save', ({ doc }) => {
  console.log(`  ✓ Post-save hook: ${doc.name} saved successfully!`)
})

const UserModel = model('User', userSchema)

async function main() {
  const User = UserModel
  console.log('Document Save Method Example\n')
  console.log('='.repeat(50))

  // 1. Create initial users
  console.log('\n1. Creating initial users...')
  await User.create({ name: 'Alice', email: 'alice@example.com', age: 25, city: 'New York' })
  await User.create({ name: 'Bob', email: 'bob@example.com', age: 30, city: 'London' })
  console.log('   ✓ Users created')

  // 2. Fetch and modify a document
  console.log('\n2. Fetching Bob and modifying properties...')
  const bob = await User.findOne({ name: 'Bob' })
  if (!bob) throw new Error('Bob not found')

  console.log(`   Before: Bob is ${bob.age} years old, lives in ${bob.city}`)

  bob.age = 31
  bob.city = 'Paris'

  console.log(`   After: Bob is ${bob.age} years old, lives in ${bob.city}`)

  // 3. Save the modified document
  console.log('\n3. Saving Bob with .save()...')
  await bob.save()
  console.log('   ✓ Saved!')

  // 4. Verify the changes persisted
  console.log('\n4. Verifying changes persisted...')
  const updatedBob = await User.findOne({ name: 'Bob' })
  console.log(`   Verified: Bob is ${updatedBob?.age} years old, lives in ${updatedBob?.city}`)

  // 5. Multiple saves
  console.log('\n5. Making multiple changes with multiple saves...')
  const alice = await User.findOne({ name: 'Alice' })
  if (!alice) throw new Error('Alice not found')

  alice.age = 26
  await alice.save()
  console.log(`   ✓ First save: Alice is now ${alice.age}`)

  alice.age = 27
  await alice.save()
  console.log(`   ✓ Second save: Alice is now ${alice.age}`)

  alice.city = 'Boston'
  await alice.save()
  console.log(`   ✓ Third save: Alice now lives in ${alice.city}`)

  // 6. Validation on save
  console.log('\n6. Testing validation on save...')
  try {
    bob.age = 150 // Invalid: max is 120
    await bob.save()
    console.log('   ✗ Should have thrown validation error!')
  } catch (err: any) {
    console.log(`   ✓ Validation error caught: ${err.message}`)
  }

  // Restore valid age
  bob.age = 31

  // 7. Unique constraint checking
  console.log('\n7. Testing unique constraint on save...')
  try {
    bob.email = 'alice@example.com' // Duplicate!
    await bob.save()
    console.log('   ✗ Should have thrown unique constraint error!')
  } catch (err: any) {
    console.log(`   ✓ Unique constraint error caught: ${err.message}`)
  }

  // 8. Timestamps
  console.log('\n8. Checking timestamps...')
  bob.email = 'bob.updated@example.com' // Restore unique email
  const beforeUpdate = bob.updatedAt

  await new Promise(resolve => setTimeout(resolve, 10)) // Wait a bit

  bob.age = 32
  await bob.save()

  const afterUpdate = bob.updatedAt
  console.log(`   updatedAt changed: ${afterUpdate > beforeUpdate}`)

  // 9. Deleting fields
  console.log('\n9. Deleting a field...')
  console.log(`   Before: Bob's city is ${bob.city}`)
  delete bob.city
  await bob.save()

  const bobWithoutCity = await User.findOne({ name: 'Bob' })
  console.log(`   After: Bob's city is ${bobWithoutCity?.city}`)

  console.log('\n' + '='.repeat(50))
  console.log('All examples completed successfully!')
  console.log('='.repeat(50) + '\n')
}

main().catch(console.error)
