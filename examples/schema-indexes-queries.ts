import { Schema, model } from '../index'

// Example usage - mongoose-style
interface UserDoc {
  name: string
  age: number
}

// Define schema with indexes
const userSchema = new Schema<UserDoc>({
  name: String,
  age: Number
})

// Single-field index
userSchema.index('name')

// Compound index (multiple fields)
// Note: requires extending the interface
interface ExtendedUserDoc extends UserDoc {
  city: string
}

const extendedSchema = new Schema<ExtendedUserDoc>({
  name: String,
  age: Number,
  city: String
})

extendedSchema.index('name').index(['city', 'age'])

// Create model from schema with compound index
const User = model('ExtendedUser', extendedSchema)

;(async () => {
  // Seed some initial data
  await User.insertMany([
    { name: 'Alice', age: 25, city: 'New York' },
    { name: 'Bob', age: 32, city: 'London' },
    { name: 'Charlie', age: 40, city: 'Paris' }
  ])
  // Query examples
  console.time('Indexed findOne')
  console.log(await User.findOne({ name: 'Bob' })) // O(1)
  console.timeEnd('Indexed findOne')

  console.time('Indexed find')
  console.log(await User.find({ name: 'Alice' })) // O(1) - returns array
  console.timeEnd('Indexed find')

  console.time('Non-indexed')
  console.log(await User.find({ age: { $gt: 30 } })) // linear scan
  console.timeEnd('Non-indexed')

  // Find all
  console.log('All users:', await User.find())

  // Compound index query (O(1))
  console.time('Compound index')
  console.log(await User.findOne({ city: 'New York', age: 25 })) // O(1) with compound index
  console.timeEnd('Compound index')

  // Mongoose-style API
  await User.create({ name: 'Diana', age: 29, city: 'Tokyo' }) // updates all indexes automatically

  // Insert multiple documents
  await User.insertMany([
    { name: 'Eve', age: 35, city: 'Berlin' },
    { name: 'Frank', age: 40, city: 'Sydney' }
  ])

  // Create another user
  await User.create({ name: 'George', age: 45, city: 'Madrid' })
})()
