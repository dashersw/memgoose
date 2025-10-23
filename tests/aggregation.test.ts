import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model, createDatabase } from '../index'

describe('Aggregation Pipeline', () => {
  interface SaleInterface {
    item: string
    price: number
    quantity: number
    date: Date
    category: string
    region?: string
  }

  const saleSchema = new Schema<SaleInterface>({
    item: String,
    price: Number,
    quantity: Number,
    date: Date,
    category: String,
    region: String
  })

  const Sale = model('Sale', saleSchema)

  beforeEach(async () => {
    await Sale.deleteMany({})
  })

  describe('$match stage', () => {
    it('should filter documents', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Carrot', price: 0.75, quantity: 15, date: new Date(), category: 'vegetable' }
      ])

      const results = await Sale.aggregate([{ $match: { category: 'fruit' } }])

      assert.strictEqual(results.length, 2)
      const items = results.map(r => r.item).sort()
      assert.deepStrictEqual(items, ['Apple', 'Banana'])
    })

    it('should work with complex queries', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Orange', price: 1.5, quantity: 5, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $match: { price: { $gte: 1.0 }, quantity: { $gte: 10 } } }
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].item, 'Apple')
    })

    it('should work with logical operators', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Orange', price: 1.5, quantity: 5, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $match: { $or: [{ price: { $lt: 0.6 } }, { quantity: { $lt: 10 } }] } }
      ])

      assert.strictEqual(results.length, 2)
      const items = results.map(r => r.item).sort()
      assert.deepStrictEqual(items, ['Banana', 'Orange'])
    })
  })

  describe('$group stage', () => {
    it('should group by field and count', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Carrot', price: 0.75, quantity: 15, date: new Date(), category: 'vegetable' }
      ])

      const results = await Sale.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }])

      assert.strictEqual(results.length, 2)

      const fruitGroup = results.find(r => r._id === 'fruit')
      const vegGroup = results.find(r => r._id === 'vegetable')

      assert.strictEqual(fruitGroup?.count, 2)
      assert.strictEqual(vegGroup?.count, 1)
    })

    it('should sum numeric fields', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Carrot', price: 0.75, quantity: 15, date: new Date(), category: 'vegetable' }
      ])

      const results = await Sale.aggregate([
        { $group: { _id: '$category', totalQuantity: { $sum: '$quantity' } } }
      ])

      const fruitGroup = results.find(r => r._id === 'fruit')
      const vegGroup = results.find(r => r._id === 'vegetable')

      assert.strictEqual(fruitGroup?.totalQuantity, 30)
      assert.strictEqual(vegGroup?.totalQuantity, 15)
    })

    it('should calculate average', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Orange', price: 1.5, quantity: 5, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $group: { _id: '$category', avgPrice: { $avg: '$price' } } }
      ])

      const fruitGroup = results.find(r => r._id === 'fruit')
      assert(fruitGroup)
      assert.strictEqual(fruitGroup.avgPrice, 1.0) // (1.0 + 0.5 + 1.5) / 3
    })

    it('should find min and max', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Orange', price: 1.5, quantity: 5, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        {
          $group: {
            _id: '$category',
            minPrice: { $min: '$price' },
            maxPrice: { $max: '$price' }
          }
        }
      ])

      const fruitGroup = results.find(r => r._id === 'fruit')
      assert(fruitGroup)
      assert.strictEqual(fruitGroup.minPrice, 0.5)
      assert.strictEqual(fruitGroup.maxPrice, 1.5)
    })

    it('should use $first and $last', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Orange', price: 1.5, quantity: 5, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        {
          $group: {
            _id: '$category',
            firstItem: { $first: '$item' },
            lastItem: { $last: '$item' }
          }
        }
      ])

      const fruitGroup = results.find(r => r._id === 'fruit')
      assert(fruitGroup)
      assert.strictEqual(fruitGroup.firstItem, 'Apple')
      assert.strictEqual(fruitGroup.lastItem, 'Orange')
    })

    it('should use $push to collect values', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $group: { _id: '$category', items: { $push: '$item' } } }
      ])

      const fruitGroup = results.find(r => r._id === 'fruit')
      assert(fruitGroup)
      assert.deepStrictEqual((fruitGroup.items as any[]).sort(), ['Apple', 'Banana'])
    })

    it('should use $addToSet for unique values', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Apple', price: 1.0, quantity: 5, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $group: { _id: '$category', uniqueItems: { $addToSet: '$item' } } }
      ])

      const fruitGroup = results.find(r => r._id === 'fruit')
      assert(fruitGroup)
      assert.strictEqual((fruitGroup.uniqueItems as unknown[]).length, 2)
      assert((fruitGroup.uniqueItems as any[]).includes('Apple'))
      assert((fruitGroup.uniqueItems as any[]).includes('Banana'))
    })

    it('should group by null (all documents)', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0]._id, null)
      assert.strictEqual(results[0].total, 30)
    })

    it('should group by compound key', async () => {
      await Sale.insertMany([
        {
          item: 'Apple',
          price: 1.0,
          quantity: 10,
          date: new Date(),
          category: 'fruit',
          region: 'north'
        },
        {
          item: 'Banana',
          price: 0.5,
          quantity: 20,
          date: new Date(),
          category: 'fruit',
          region: 'south'
        },
        {
          item: 'Apple',
          price: 1.0,
          quantity: 5,
          date: new Date(),
          category: 'fruit',
          region: 'north'
        }
      ])

      const results = await Sale.aggregate([
        {
          $group: {
            _id: { category: '$category', region: '$region' },
            total: { $sum: '$quantity' }
          }
        }
      ])

      assert.strictEqual(results.length, 2)

      const northFruit = results.find(r => (r._id as any).region === 'north')
      const southFruit = results.find(r => (r._id as any).region === 'south')

      assert.strictEqual(northFruit?.total, 15)
      assert.strictEqual(southFruit?.total, 20)
    })
  })

  describe('$project stage', () => {
    it('should include specific fields', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([{ $project: { item: 1, price: 1 } }])

      assert.strictEqual(results.length, 1)
      assert(results[0].item)
      assert(results[0].price)
      assert(results[0]._id) // _id included by default
      assert(!results[0].quantity)
      assert(!results[0].category)
    })

    it('should exclude specific fields', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([{ $project: { quantity: 0, category: 0 } }])

      assert.strictEqual(results.length, 1)
      assert(results[0].item)
      assert(results[0].price)
      assert(!results[0].quantity)
      assert(!results[0].category)
    })

    it('should exclude _id', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([{ $project: { _id: 0, item: 1, price: 1 } }])

      assert.strictEqual(results.length, 1)
      assert(!results[0]._id)
      assert(results[0].item)
      assert(results[0].price)
    })

    it('should compute new fields with expressions', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $project: { item: 1, total: { $multiply: ['$price', '$quantity'] } } }
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].total, 10.0)
    })

    it('should use $concat', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $project: { description: { $concat: ['$item', ' - ', '$category'] } } }
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].description, 'Apple - fruit')
    })

    it('should use $toUpper and $toLower', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        {
          $project: {
            upper: { $toUpper: '$item' },
            lower: { $toLower: '$category' }
          }
        }
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].upper, 'APPLE')
      assert.strictEqual(results[0].lower, 'fruit')
    })

    it('should use arithmetic operators', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 10.0, quantity: 5, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        {
          $project: {
            add: { $add: ['$price', '$quantity'] },
            subtract: { $subtract: ['$price', '$quantity'] },
            multiply: { $multiply: ['$price', '$quantity'] },
            divide: { $divide: ['$price', '$quantity'] }
          }
        }
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].add, 15)
      assert.strictEqual(results[0].subtract, 5)
      assert.strictEqual(results[0].multiply, 50)
      assert.strictEqual(results[0].divide, 2)
    })
  })

  describe('$sort stage', () => {
    it('should sort in ascending order', async () => {
      await Sale.insertMany([
        { item: 'Orange', price: 1.5, quantity: 5, date: new Date(), category: 'fruit' },
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([{ $sort: { price: 1 } }])

      assert.strictEqual(results[0].item, 'Banana')
      assert.strictEqual(results[1].item, 'Apple')
      assert.strictEqual(results[2].item, 'Orange')
    })

    it('should sort in descending order', async () => {
      await Sale.insertMany([
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Orange', price: 1.5, quantity: 5, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([{ $sort: { price: -1 } }])

      assert.strictEqual(results[0].item, 'Orange')
      assert.strictEqual(results[1].item, 'Apple')
      assert.strictEqual(results[2].item, 'Banana')
    })

    it('should sort by multiple fields', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 5, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Orange', price: 0.5, quantity: 15, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([{ $sort: { price: 1, quantity: -1 } }])

      assert.strictEqual(results[0].item, 'Orange')
      assert.strictEqual(results[1].item, 'Banana')
      assert.strictEqual(results[2].item, 'Apple')
    })
  })

  describe('$limit and $skip stages', () => {
    beforeEach(async () => {
      await Sale.insertMany([
        { item: 'Item1', price: 1, quantity: 10, date: new Date(), category: 'A' },
        { item: 'Item2', price: 2, quantity: 20, date: new Date(), category: 'B' },
        { item: 'Item3', price: 3, quantity: 30, date: new Date(), category: 'C' },
        { item: 'Item4', price: 4, quantity: 40, date: new Date(), category: 'D' },
        { item: 'Item5', price: 5, quantity: 50, date: new Date(), category: 'E' }
      ])
    })

    it('should limit results', async () => {
      const results = await Sale.aggregate([{ $limit: 3 }])

      assert.strictEqual(results.length, 3)
    })

    it('should skip results', async () => {
      const results = await Sale.aggregate([{ $skip: 2 }])

      assert.strictEqual(results.length, 3)
      assert.strictEqual(results[0].item, 'Item3')
    })

    it('should combine skip and limit for pagination', async () => {
      const results = await Sale.aggregate([{ $skip: 2 }, { $limit: 2 }])

      assert.strictEqual(results.length, 2)
      assert.strictEqual(results[0].item, 'Item3')
      assert.strictEqual(results[1].item, 'Item4')
    })
  })

  describe('$count stage', () => {
    it('should count documents', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 0.5, quantity: 20, date: new Date(), category: 'fruit' },
        { item: 'Orange', price: 1.5, quantity: 5, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $match: { category: 'fruit' } },
        { $count: 'totalFruits' }
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].totalFruits, 3)
    })
  })

  describe('$unwind stage', () => {
    interface OrderInterface {
      customer: string
      items: string[]
      total: number
    }

    const orderSchema = new Schema<OrderInterface>({
      customer: String,
      items: [String],
      total: Number
    })

    const Order = model('Order', orderSchema)

    beforeEach(async () => {
      await Order.deleteMany({})
    })

    it('should unwind array field', async () => {
      await Order.insertMany([
        { customer: 'Alice', items: ['apple', 'banana'], total: 10 },
        { customer: 'Bob', items: ['orange'], total: 5 }
      ])

      const results = await Order.aggregate([{ $unwind: '$items' }])

      assert.strictEqual(results.length, 3)
      assert.strictEqual(results[0].customer, 'Alice')
      assert.strictEqual(results[0].items, 'apple')
      assert.strictEqual(results[1].customer, 'Alice')
      assert.strictEqual(results[1].items, 'banana')
      assert.strictEqual(results[2].customer, 'Bob')
      assert.strictEqual(results[2].items, 'orange')
    })

    it('should preserve null and empty arrays', async () => {
      await Order.insertMany([
        { customer: 'Alice', items: ['apple'], total: 10 },
        { customer: 'Bob', items: [], total: 0 }
      ])

      const results = await Order.aggregate([
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } }
      ])

      assert.strictEqual(results.length, 2)
      assert.strictEqual(results[0].customer, 'Alice')
      assert.strictEqual(results[1].customer, 'Bob')
      assert.strictEqual(results[1].items, null)
    })

    it('should include array index', async () => {
      await Order.insertMany([
        { customer: 'Alice', items: ['apple', 'banana', 'orange'], total: 10 }
      ])

      const results = await Order.aggregate([
        { $unwind: { path: '$items', includeArrayIndex: 'itemIndex' } }
      ])

      assert.strictEqual(results.length, 3)
      assert.strictEqual(results[0].itemIndex, 0)
      assert.strictEqual(results[1].itemIndex, 1)
      assert.strictEqual(results[2].itemIndex, 2)
    })
  })

  describe('$lookup stage', () => {
    interface AuthorInterface {
      name: string
      country: string
    }

    interface BookInterface {
      title: string
      authorId: string
      pages: number
    }

    const db = createDatabase()

    const authorSchema = new Schema<AuthorInterface>({ name: String, country: String })
    const bookSchema = new Schema<BookInterface>({ title: String, authorId: String, pages: Number })

    const Author = db.model('Author', authorSchema)
    const Book = db.model('Book', bookSchema)

    beforeEach(async () => {
      await Author.deleteMany({})
      await Book.deleteMany({})
    })

    it('should join collections', async () => {
      const author1 = await Author.create({ name: 'Alice', country: 'USA' })
      const author2 = await Author.create({ name: 'Bob', country: 'UK' })

      await Book.insertMany([
        { title: 'Book1', authorId: author1._id.toString(), pages: 100 },
        { title: 'Book2', authorId: author1._id.toString(), pages: 200 },
        { title: 'Book3', authorId: author2._id.toString(), pages: 150 }
      ])

      const results = await Book.aggregate([
        {
          $lookup: {
            from: 'Author',
            localField: 'authorId',
            foreignField: '_id',
            as: 'authorInfo'
          }
        }
      ])

      assert.strictEqual(results.length, 3)
      assert(Array.isArray(results[0].authorInfo))
      assert.strictEqual(results[0].authorInfo.length, 1)
      assert.strictEqual(results[0].authorInfo[0].name, 'Alice')
    })
  })

  describe('$addFields stage', () => {
    it('should add computed fields', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 1.0, quantity: 10, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $addFields: { total: { $multiply: ['$price', '$quantity'] } } }
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].total, 10)
      assert(results[0].item) // Original fields preserved
      assert(results[0].price)
    })
  })

  describe('$replaceRoot stage', () => {
    it('should replace document root with field', async () => {
      interface ProductInterface {
        name: string
        details: {
          price: number
          quantity: number
        }
      }

      const productSchema = new Schema<ProductInterface>({
        name: String,
        details: { price: Number, quantity: Number }
      })

      const Product = model('Product', productSchema)

      await Product.deleteMany({})
      await Product.create({
        name: 'Apple',
        details: { price: 1.0, quantity: 10 }
      })

      const results = await Product.aggregate([{ $replaceRoot: { newRoot: '$details' } }])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].price, 1.0)
      assert.strictEqual(results[0].quantity, 10)
      assert(!results[0].name)
    })
  })

  describe('$sample stage', () => {
    it('should return random sample', async () => {
      await Sale.insertMany([
        { item: 'Item1', price: 1, quantity: 10, date: new Date(), category: 'A' },
        { item: 'Item2', price: 2, quantity: 20, date: new Date(), category: 'B' },
        { item: 'Item3', price: 3, quantity: 30, date: new Date(), category: 'C' },
        { item: 'Item4', price: 4, quantity: 40, date: new Date(), category: 'D' },
        { item: 'Item5', price: 5, quantity: 50, date: new Date(), category: 'E' }
      ])

      const results = await Sale.aggregate([{ $sample: { size: 3 } }])

      assert.strictEqual(results.length, 3)
    })

    it('should return all documents if sample size exceeds count', async () => {
      await Sale.insertMany([
        { item: 'Item1', price: 1, quantity: 10, date: new Date(), category: 'A' },
        { item: 'Item2', price: 2, quantity: 20, date: new Date(), category: 'B' }
      ])

      const results = await Sale.aggregate([{ $sample: { size: 10 } }])

      assert.strictEqual(results.length, 2)
    })
  })

  describe('Multi-stage pipelines', () => {
    it('should execute complex pipeline', async () => {
      await Sale.insertMany([
        {
          item: 'Apple',
          price: 1.0,
          quantity: 10,
          date: new Date(),
          category: 'fruit',
          region: 'north'
        },
        {
          item: 'Banana',
          price: 0.5,
          quantity: 20,
          date: new Date(),
          category: 'fruit',
          region: 'south'
        },
        {
          item: 'Orange',
          price: 1.5,
          quantity: 5,
          date: new Date(),
          category: 'fruit',
          region: 'north'
        },
        {
          item: 'Carrot',
          price: 0.75,
          quantity: 15,
          date: new Date(),
          category: 'vegetable',
          region: 'north'
        }
      ])

      const results = await Sale.aggregate([
        { $match: { category: 'fruit' } },
        {
          $group: {
            _id: '$region',
            totalQuantity: { $sum: '$quantity' },
            avgPrice: { $avg: '$price' }
          }
        },
        { $sort: { totalQuantity: -1 } }
      ])

      assert.strictEqual(results.length, 2)
      assert.strictEqual(results[0]._id, 'south') // Highest quantity first
      assert.strictEqual(results[0].totalQuantity, 20)
      assert.strictEqual(results[1]._id, 'north')
      assert.strictEqual(results[1].totalQuantity, 15)
    })

    it('should handle pipeline with project and group', async () => {
      await Sale.insertMany([
        { item: 'Apple', price: 2.0, quantity: 10, date: new Date(), category: 'fruit' },
        { item: 'Banana', price: 1.0, quantity: 20, date: new Date(), category: 'fruit' }
      ])

      const results = await Sale.aggregate([
        { $project: { item: 1, revenue: { $multiply: ['$price', '$quantity'] } } },
        { $group: { _id: null, totalRevenue: { $sum: '$revenue' } } }
      ])

      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].totalRevenue, 40) // (2*10) + (1*20)
    })
  })
})
