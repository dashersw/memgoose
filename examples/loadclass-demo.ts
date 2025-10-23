/**
 * Example demonstrating Schema.loadClass() functionality
 * This shows how to load methods and statics from an ES6 class
 */

import { model, Schema } from '../index.js'

interface User {
  firstName: string
  lastName: string
  age: number
  email: string
}

// Define a class with methods, statics, getters, and setters
class UserClass {
  // TypeScript field declarations
  firstName!: string
  lastName!: string
  age!: number
  email!: string

  // Getters become virtuals
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`
  }

  // Setters become virtual setters
  set fullName(value: string) {
    const parts = value.split(' ')
    this.firstName = parts[0]
    this.lastName = parts.slice(1).join(' ') || ''
  }

  get initials(): string {
    return `${this.firstName[0]}.${this.lastName[0]}.`
  }

  // Instance methods - available on document instances
  getFullName(): string {
    return `${this.firstName} ${this.lastName}`
  }

  greet(greeting: string = 'Hello'): string {
    return `${greeting}, ${this.firstName}!`
  }

  isAdult(): boolean {
    return this.age >= 18
  }

  getInitials(): string {
    return `${this.firstName[0]}.${this.lastName[0]}.`
  }

  async sendWelcomeEmail(): Promise<void> {
    // Simulate sending an email
    console.log(`📧 Sending welcome email to ${this.email}`)
    await new Promise(resolve => setTimeout(resolve, 10))
    console.log(`✅ Email sent to ${this.fullName}`) // Using getter
  }

  // Static methods - available on the Model
  static async findByEmail(this: any, email: string) {
    return this.findOne({ email })
  }

  static async findAdults(this: any) {
    return this.find({ age: { $gte: 18 } })
  }

  static async findByLastName(this: any, lastName: string) {
    return this.find({ lastName })
  }

  static async countAdults(this: any): Promise<number> {
    const adults = await this.findAdults()
    return adults.length
  }
}

async function main() {
  console.log('=== Schema.loadClass() Demo ===\n')

  // Create schema and load class
  const userSchema = new Schema<User>({
    firstName: String,
    lastName: String,
    age: Number,
    email: String
  })

  // Load all methods and statics from UserClass
  userSchema.loadClass(UserClass)

  // Create model
  const User = model('UserLoadClass', userSchema)

  // Insert sample data
  console.log('📝 Inserting sample users...')
  await User.insertMany([
    { firstName: 'Alice', lastName: 'Smith', age: 28, email: 'alice@example.com' },
    { firstName: 'Bob', lastName: 'Smith', age: 32, email: 'bob@example.com' },
    { firstName: 'Charlie', lastName: 'Jones', age: 17, email: 'charlie@example.com' },
    { firstName: 'Diana', lastName: 'Wilson', age: 45, email: 'diana@example.com' }
  ])
  console.log('✅ Users inserted\n')

  // Use getters (virtuals)
  console.log('--- Getters (Virtuals) ---')
  const alice = await User.findOne({ firstName: 'Alice' })
  if (alice) {
    console.log(`Full name (getter): ${(alice as any).fullName}`)
    console.log(`Initials (getter): ${(alice as any).initials}`)
  }
  console.log()

  // Use setters (virtuals)
  console.log('--- Setters (Virtuals) ---')
  if (alice) {
    console.log(`Before setter: ${alice.firstName} ${alice.lastName}`)
    ;(alice as any).fullName = 'Alice Johnson'
    console.log(`After setter: ${alice.firstName} ${alice.lastName}`)
    console.log(`Full name now: ${(alice as any).fullName}`)
  }
  console.log()

  // Use instance methods
  console.log('--- Instance Methods ---')
  if (alice) {
    console.log(`Full name (method): ${(alice as any).getFullName()}`)
    console.log(`Initials (method): ${(alice as any).getInitials()}`)
    console.log(`Greeting: ${(alice as any).greet('Hi')}`)
    console.log(`Is adult: ${(alice as any).isAdult()}`)
    await (alice as any).sendWelcomeEmail()
  }
  console.log()

  // Use static methods
  console.log('--- Static Methods ---')

  // findByEmail
  const foundUser = await (User as any).findByEmail('bob@example.com')
  if (foundUser) {
    console.log(`Found by email: ${(foundUser as any).getFullName()}`)
  }

  // findByLastName
  const smiths = await (User as any).findByLastName('Smith')
  console.log(`\nUsers with last name Smith: ${smiths.length}`)
  smiths.forEach((user: any) => {
    console.log(`  - ${user.getFullName()}`)
  })

  // findAdults
  const adults = await (User as any).findAdults()
  console.log(`\nAdults (age >= 18): ${adults.length}`)
  adults.forEach((user: any) => {
    console.log(`  - ${user.getFullName()}, age ${user.age}`)
  })

  // countAdults
  const adultCount = await (User as any).countAdults()
  console.log(`\nTotal adult count: ${adultCount}`)

  console.log('\n--- Method Chaining with loadClass() ---')

  // Demonstrate that loadClass() supports chaining
  class ProductClass {
    name!: string
    price!: number

    getFormattedPrice(): string {
      return `$${this.price.toFixed(2)}`
    }

    static async findByCategory(this: any, category: string) {
      return this.find({ category })
    }
  }

  const productSchema = new Schema({
    name: String,
    price: Number,
    category: String
  })
    .loadClass(ProductClass)
    .index('category')

  productSchema.virtual('displayName').get(function (this: any) {
    return this.name.toUpperCase()
  })

  const Product = model('Product', productSchema)
  await Product.create({ name: 'Widget', price: 19.99, category: 'Tools' })

  const product = await Product.findOne({ name: 'Widget' })
  if (product) {
    console.log(`Product: ${(product as any).displayName}`)
    console.log(`Price: ${(product as any).getFormattedPrice()}`)
  }

  console.log('\n✅ Demo complete!')
}

main().catch(console.error)
