import { Schema, model } from '../index'

interface UserDoc {
  name: string
  age: number
  email: string
  status: 'active' | 'inactive' | 'suspended' | 'banned'
  role: 'user' | 'admin' | 'moderator'
  city?: string
  verified?: boolean
  lastLoginAt?: Date
}

const userSchema = new Schema<UserDoc>({
  name: String,
  age: Number,
  email: String,
  status: String,
  role: String,
  city: String,
  verified: Boolean,
  lastLoginAt: Date
})

// Add indexes for better performance
userSchema.index('status')
userSchema.index('role')
userSchema.index('city')

const User = model('User', userSchema)

async function main() {
  console.log('=== Logical Operators Demo ===\n')

  // Seed data
  await User.insertMany([
    {
      name: 'Alice',
      age: 17,
      email: 'alice@example.com',
      status: 'active',
      role: 'user',
      verified: true
    },
    {
      name: 'Bob',
      age: 25,
      email: 'bob@example.com',
      status: 'active',
      role: 'admin',
      city: 'NYC',
      verified: true
    },
    {
      name: 'Charlie',
      age: 35,
      email: 'charlie@example.com',
      status: 'inactive',
      role: 'user',
      city: 'LA',
      verified: false
    },
    {
      name: 'Diana',
      age: 28,
      email: 'diana@example.com',
      status: 'active',
      role: 'moderator',
      city: 'NYC',
      verified: true
    },
    {
      name: 'Eve',
      age: 22,
      email: 'eve@example.com',
      status: 'suspended',
      role: 'user',
      verified: false
    },
    {
      name: 'Frank',
      age: 45,
      email: 'frank@example.com',
      status: 'banned',
      role: 'user',
      city: 'SF'
    }
  ])

  // 1. $or - Find users who meet ANY condition
  console.log('1. $or - Users who are under 18 OR have admin role:')
  const youngOrAdmin = await User.find({
    $or: [{ age: { $lt: 18 } }, { role: 'admin' }]
  })
  console.log(youngOrAdmin.map(u => ({ name: u.name, age: u.age, role: u.role })))
  console.log()

  // 2. $and - Find users who meet ALL conditions
  console.log('2. $and - Active users in NYC:')
  const activeNYC = await User.find({
    $and: [{ status: 'active' }, { city: 'NYC' }]
  })
  console.log(activeNYC.map(u => ({ name: u.name, status: u.status, city: u.city })))
  console.log()

  // 3. $nor - Find users who meet NONE of the conditions
  console.log('3. $nor - Users who are neither suspended nor banned:')
  const notProblematic = await User.find({
    $nor: [{ status: 'suspended' }, { status: 'banned' }]
  })
  console.log(notProblematic.map(u => ({ name: u.name, status: u.status })))
  console.log()

  // 4. $not - Negate specific operator
  console.log('4. $not - Users whose age is NOT less than 30:')
  const notYoung = await User.find({
    age: { $not: { $lt: 30 } }
  })
  console.log(notYoung.map(u => ({ name: u.name, age: u.age })))
  console.log()

  // 5. Complex nested logic
  console.log('5. Complex query - Active verified users in major cities OR admins:')
  const complex = await User.find({
    $or: [
      {
        $and: [{ status: 'active' }, { verified: true }, { city: { $in: ['NYC', 'LA', 'SF'] } }]
      },
      { role: 'admin' }
    ]
  })
  console.log(
    complex.map(u => ({
      name: u.name,
      role: u.role,
      city: u.city,
      verified: u.verified
    }))
  )
  console.log()

  // 6. Access control pattern
  console.log('6. Access Control - Users who can moderate (admins OR moderators):')
  const canModerate = await User.find({
    $or: [{ role: 'admin' }, { role: 'moderator' }]
  })
  console.log(canModerate.map(u => ({ name: u.name, role: u.role })))
  console.log()

  // 7. Exclusion pattern with $nor
  console.log('7. Exclusion - Users not in problematic states:')
  const goodStanding = await User.find({
    $nor: [{ status: 'suspended' }, { status: 'banned' }, { verified: false }]
  })
  console.log(goodStanding.map(u => ({ name: u.name, status: u.status, verified: u.verified })))
  console.log()

  // 8. Age range with $and
  console.log('8. Age Range - Users between 20 and 40:')
  const ageRange = await User.find({
    $and: [{ age: { $gte: 20 } }, { age: { $lte: 40 } }]
  })
  console.log(ageRange.map(u => ({ name: u.name, age: u.age })))
  console.log()

  // 9. Complex search pattern
  console.log('9. Complex Search - Active or moderator users NOT in banned list:')
  const searchResults = await User.find({
    $and: [
      {
        $or: [{ status: 'active' }, { role: 'moderator' }]
      },
      {
        status: { $not: { $in: ['banned', 'suspended'] } }
      }
    ]
  })
  console.log(searchResults.map(u => ({ name: u.name, status: u.status, role: u.role })))
  console.log()

  // 10. Update with logical operators
  console.log('10. Update - Mark young users or unverified users as needing review:')
  const updateResult = await User.updateMany(
    {
      $or: [{ age: { $lt: 18 } }, { verified: false }]
    },
    { $set: { status: 'inactive' } }
  )
  console.log(`Updated ${updateResult.modifiedCount} users`)

  const updated = await User.find({ status: 'inactive' })
  console.log(updated.map(u => ({ name: u.name, age: u.age, verified: u.verified })))
  console.log()

  // 11. Delete with logical operators
  console.log('11. Delete - Remove banned or suspended users:')
  const deleteResult = await User.deleteMany({
    $or: [{ status: 'banned' }, { status: 'suspended' }]
  })
  console.log(`Deleted ${deleteResult.deletedCount} users`)

  const remaining = await User.countDocuments()
  console.log(`Remaining users: ${remaining}`)
  console.log()

  console.log('=== Demo Complete ===')
}

main().catch(console.error)
