import { Schema, createDatabase } from '../index'

interface SaleDoc {
  orderId: string
  item: string
  category: string
  price: number
  quantity: number
  region: string
  date: Date
  customerId: string
}

interface CustomerDoc {
  customerId: string
  name: string
  email: string
  tier: 'bronze' | 'silver' | 'gold'
}

const saleSchema = new Schema<SaleDoc>({
  orderId: String,
  item: String,
  category: String,
  price: Number,
  quantity: Number,
  region: String,
  date: Date,
  customerId: String
})

const customerSchema = new Schema<CustomerDoc>({
  customerId: String,
  name: String,
  email: String,
  tier: String
})

const db = createDatabase()
const Sale = db.model('Sale', saleSchema)
const Customer = db.model('Customer', customerSchema)

async function main() {
  console.log('=== Aggregation Pipeline Demo ===\n')

  // Seed customer data
  await Customer.insertMany([
    { customerId: 'C001', name: 'Alice Johnson', email: 'alice@example.com', tier: 'gold' },
    { customerId: 'C002', name: 'Bob Smith', email: 'bob@example.com', tier: 'silver' },
    { customerId: 'C003', name: 'Charlie Brown', email: 'charlie@example.com', tier: 'bronze' }
  ])

  // Seed sales data
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  await Sale.insertMany([
    {
      orderId: 'ORD001',
      item: 'Laptop',
      category: 'electronics',
      price: 1200,
      quantity: 2,
      region: 'north',
      date: now,
      customerId: 'C001'
    },
    {
      orderId: 'ORD002',
      item: 'Mouse',
      category: 'electronics',
      price: 25,
      quantity: 5,
      region: 'north',
      date: yesterday,
      customerId: 'C002'
    },
    {
      orderId: 'ORD003',
      item: 'Novel',
      category: 'books',
      price: 15,
      quantity: 3,
      region: 'south',
      date: now,
      customerId: 'C001'
    },
    {
      orderId: 'ORD004',
      item: 'Keyboard',
      category: 'electronics',
      price: 75,
      quantity: 2,
      region: 'south',
      date: yesterday,
      customerId: 'C003'
    },
    {
      orderId: 'ORD005',
      item: 'Monitor',
      category: 'electronics',
      price: 300,
      quantity: 1,
      region: 'north',
      date: lastWeek,
      customerId: 'C002'
    },
    {
      orderId: 'ORD006',
      item: 'Desk',
      category: 'furniture',
      price: 450,
      quantity: 1,
      region: 'south',
      date: now,
      customerId: 'C001'
    }
  ])

  // Example 1: Basic grouping with aggregators
  console.log('1. Sales by Category:\n')
  const byCategory = await Sale.aggregate([
    {
      $group: {
        _id: '$category',
        totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
        totalQuantity: { $sum: '$quantity' },
        avgPrice: { $avg: '$price' },
        salesCount: { $sum: 1 }
      }
    },
    { $sort: { totalRevenue: -1 } }
  ])
  console.log(byCategory)
  console.log()

  // Example 2: Regional sales analysis
  console.log('2. Sales by Region:\n')
  const byRegion = await Sale.aggregate([
    {
      $group: {
        _id: '$region',
        revenue: { $sum: { $multiply: ['$price', '$quantity'] } },
        categories: { $addToSet: '$category' },
        topPrice: { $max: '$price' }
      }
    }
  ])
  console.log(byRegion)
  console.log()

  // Example 3: Filter then aggregate
  console.log('3. Electronics Sales Only:\n')
  const electronics = await Sale.aggregate([
    { $match: { category: 'electronics' } },
    {
      $group: {
        _id: '$region',
        totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
        items: { $push: '$item' }
      }
    },
    { $sort: { totalRevenue: -1 } }
  ])
  console.log(electronics)
  console.log()

  // Example 4: Project with computed fields
  console.log('4. Sales with Computed Revenue:\n')
  const withRevenue = await Sale.aggregate([
    {
      $project: {
        item: 1,
        category: 1,
        revenue: { $multiply: ['$price', '$quantity'] },
        description: { $concat: ['$item', ' (', '$category', ')'] }
      }
    },
    { $sort: { revenue: -1 } },
    { $limit: 3 }
  ])
  console.log(withRevenue)
  console.log()

  // Example 5: Lookup (join) with customers
  console.log('5. Sales with Customer Info (using $lookup):\n')
  const withCustomers = await Sale.aggregate([
    {
      $lookup: {
        from: 'Customer',
        localField: 'customerId',
        foreignField: 'customerId',
        as: 'customer'
      }
    },
    { $unwind: '$customer' },
    {
      $project: {
        item: 1,
        revenue: { $multiply: ['$price', '$quantity'] },
        customerName: '$customer.name',
        customerTier: '$customer.tier'
      }
    },
    { $limit: 3 }
  ])
  console.log(withCustomers)
  console.log()

  // Example 6: Customer spending analysis
  console.log('6. Top Customers by Revenue:\n')
  const topCustomers = await Sale.aggregate([
    {
      $addFields: {
        revenue: { $multiply: ['$price', '$quantity'] }
      }
    },
    {
      $group: {
        _id: '$customerId',
        totalSpent: { $sum: '$revenue' },
        orderCount: { $sum: 1 },
        categories: { $addToSet: '$category' }
      }
    },
    { $sort: { totalSpent: -1 } },
    {
      $lookup: {
        from: 'Customer',
        localField: '_id',
        foreignField: 'customerId',
        as: 'customerInfo'
      }
    },
    { $unwind: '$customerInfo' },
    {
      $project: {
        _id: 0,
        customerName: '$customerInfo.name',
        tier: '$customerInfo.tier',
        totalSpent: 1,
        orderCount: 1,
        avgOrderValue: { $divide: ['$totalSpent', '$orderCount'] }
      }
    }
  ])
  console.log(topCustomers)
  console.log()

  // Example 7: Daily sales trend
  console.log('7. Recent Sales Count:\n')
  const recentSales = await Sale.aggregate([
    { $match: { date: { $gte: yesterday } } },
    { $count: 'recentSalesCount' }
  ])
  console.log(recentSales)
  console.log()

  // Example 8: Compound grouping
  console.log('8. Sales by Region and Category:\n')
  const compoundGroup = await Sale.aggregate([
    {
      $group: {
        _id: { region: '$region', category: '$category' },
        revenue: { $sum: { $multiply: ['$price', '$quantity'] } },
        count: { $sum: 1 }
      }
    },
    { $sort: { revenue: -1 } }
  ])
  console.log(compoundGroup)
  console.log()

  // Example 9: Random sample
  console.log('9. Random Sample of 3 Sales:\n')
  const sample = await Sale.aggregate([{ $sample: { size: 3 } }])
  console.log(sample.map(s => ({ item: s.item, price: s.price })))
  console.log()

  // Example 10: Using $unwind for array analysis
  interface Order {
    orderId: string
    items: string[]
    total: number
  }

  const orderSchema = new Schema<Order>({
    orderId: String,
    items: [String],
    total: Number
  })

  const Order2 = db.model('Order', orderSchema)

  await Order2.insertMany([
    { orderId: 'O1', items: ['laptop', 'mouse', 'keyboard'], total: 1500 },
    { orderId: 'O2', items: ['monitor', 'cable'], total: 400 },
    { orderId: 'O3', items: ['desk', 'chair'], total: 800 }
  ])

  console.log('10. Unwind Orders to Individual Items:\n')
  const unwoundOrders = await Order2.aggregate([
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items',
        orderCount: { $sum: 1 }
      }
    },
    { $sort: { orderCount: -1 } }
  ])
  console.log(unwoundOrders)
  console.log()

  // Cleanup
  await db.disconnect()
  console.log('=== Demo Complete ===')
}

main().catch(console.error)
