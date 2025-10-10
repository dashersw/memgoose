import { Schema, model } from '../index'

// Example demonstrating mongoose-like exec() functionality

const userSchema = new Schema({
  name: String,
  email: String,
  age: Number
})

// Add a virtual for demonstration
userSchema.virtual('info').get(doc => `${doc.name} (${doc.age})`)

const User = model('User', userSchema)

async function demo() {
  console.log('=== Mongoose-like exec() Demo ===\n')

  // Seed data
  await User.insertMany([
    { name: 'Alice', email: 'alice@example.com', age: 25 },
    { name: 'Bob', email: 'bob@example.com', age: 30 },
    { name: 'Charlie', email: 'charlie@example.com', age: 35 }
  ])

  // 1. find() with exec()
  console.log('1. find() with exec():')
  const users = await User.find({ age: { $gte: 30 } })
    .sort('-age')
    .limit(2)
    .exec()
  console.log(
    `Found ${users.length} users:`,
    users.map(u => u.name)
  )
  console.log()

  // 2. find() without exec() (thenable - backward compatible)
  console.log('2. find() without exec() (thenable):')
  const users2 = await User.find({ age: { $lt: 30 } })
  console.log(
    `Found ${users2.length} users:`,
    users2.map(u => u.name)
  )
  console.log()

  // 3. findOne() with chaining
  console.log('3. findOne() with select() and exec():')
  const user = await User.findOne({ name: 'Alice' }).select('name age').exec()
  console.log('User:', user)
  console.log('Email excluded:', user?.email === undefined)
  console.log()

  // 4. findOne() with lean()
  console.log('4. findOne() with and without lean():')
  const withVirtuals = await User.findOne({ name: 'Bob' }).exec()
  console.log('With virtuals:', withVirtuals?.info)

  const withoutVirtuals = await User.findOne({ name: 'Bob' }).lean().exec()
  console.log('Lean mode (no virtuals):', withoutVirtuals?.info === undefined)
  console.log()

  // 5. updateOne() with exec()
  console.log('5. updateOne() with exec():')
  const updateResult = await User.updateOne({ name: 'Alice' }, { $inc: { age: 1 } }).exec()
  console.log('Modified count:', updateResult.modifiedCount)
  console.log()

  // 6. deleteOne() with exec()
  console.log('6. deleteOne() with exec():')
  const deleteResult = await User.deleteOne({ name: 'Charlie' }).exec()
  console.log('Deleted count:', deleteResult.deletedCount)
  console.log()

  // 7. findOneAndUpdate() with chaining
  console.log('7. findOneAndUpdate() with select() and exec():')
  const updated = await User.findOneAndUpdate({ name: 'Bob' }, { $set: { age: 31 } })
    .select('name age')
    .exec()
  console.log('Updated user:', updated)
  console.log()

  // 8. Chaining multiple options
  console.log('8. Complex chaining:')
  const complex = await User.find().sort('age').skip(0).limit(1).select('name age').lean().exec()
  console.log('Result:', complex)

  console.log('\n✅ All operations completed successfully!')
}

demo().catch(console.error)
