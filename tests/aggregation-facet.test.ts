import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

describe('Aggregation $facet Stage', () => {
  interface ProductInterface {
    name: string
    price: number
    category: string
    rating: number
    inStock: boolean
  }

  const productSchema = new Schema<ProductInterface>({
    name: String,
    price: Number,
    category: String,
    rating: Number,
    inStock: Boolean
  })

  const Product = model<ProductInterface>('Product', productSchema)

  beforeEach(async () => {
    await Product.deleteMany({})
  })

  it('should execute multiple parallel facets', async () => {
    await Product.insertMany([
      { name: 'Laptop', price: 1000, category: 'electronics', rating: 4.5, inStock: true },
      { name: 'Mouse', price: 25, category: 'electronics', rating: 4.0, inStock: true },
      { name: 'Keyboard', price: 75, category: 'electronics', rating: 4.2, inStock: false },
      { name: 'Monitor', price: 300, category: 'electronics', rating: 4.8, inStock: true },
      { name: 'Desk', price: 200, category: 'furniture', rating: 4.3, inStock: true }
    ])

    const results = await Product.aggregate([
      {
        $facet: {
          byCategory: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
          priceRanges: [
            {
              $bucket: {
                groupBy: '$price',
                boundaries: [0, 100, 500, 2000],
                output: { count: { $sum: 1 } }
              }
            }
          ],
          topRated: [
            { $match: { rating: { $gte: 4.5 } } },
            { $sort: { rating: -1 } },
            { $limit: 3 }
          ]
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    const facets = results[0]

    // Check byCategory facet
    assert.ok(Array.isArray(facets.byCategory))
    assert.strictEqual(facets.byCategory.length, 2)

    const electronicsGroup = facets.byCategory.find((g: any) => g._id === 'electronics')
    assert.ok(electronicsGroup)
    assert.strictEqual(electronicsGroup.count, 4)

    // Check priceRanges facet
    assert.ok(Array.isArray(facets.priceRanges))
    assert.strictEqual(facets.priceRanges.length, 3)

    // Check topRated facet
    assert.ok(Array.isArray(facets.topRated))
    assert.ok(facets.topRated.length <= 3)
    assert.ok(facets.topRated.every((p: any) => p.rating >= 4.5))
  })

  it('should handle facet with empty results', async () => {
    await Product.insertMany([
      { name: 'Laptop', price: 1000, category: 'electronics', rating: 4.5, inStock: true }
    ])

    const results = await Product.aggregate([
      {
        $facet: {
          highPrice: [{ $match: { price: { $gte: 2000 } } }],
          lowPrice: [{ $match: { price: { $lt: 2000 } } }]
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    const facets = results[0]

    assert.strictEqual((facets.highPrice as unknown[]).length, 0)
    assert.strictEqual((facets.lowPrice as unknown[]).length, 1)
  })

  it('should work with complex pipelines in each facet', async () => {
    await Product.insertMany([
      { name: 'Laptop', price: 1000, category: 'electronics', rating: 4.5, inStock: true },
      { name: 'Mouse', price: 25, category: 'electronics', rating: 4.0, inStock: true },
      { name: 'Keyboard', price: 75, category: 'electronics', rating: 4.2, inStock: false },
      { name: 'Monitor', price: 300, category: 'electronics', rating: 4.8, inStock: true }
    ])

    const results = await Product.aggregate([
      {
        $facet: {
          expensiveItems: [
            { $match: { price: { $gte: 100 } } },
            { $sort: { price: -1 } },
            { $project: { name: 1, price: 1 } }
          ],
          stats: [
            {
              $group: {
                _id: null,
                avgPrice: { $avg: '$price' },
                maxPrice: { $max: '$price' },
                count: { $sum: 1 }
              }
            }
          ],
          inStockCount: [{ $match: { inStock: true } }, { $count: 'total' }]
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    const facets = results[0]

    // Expensive items should be sorted and projected
    assert.ok((facets.expensiveItems as unknown[]).length > 0)
    assert.ok(facets.expensiveItems[0].name)
    assert.ok(facets.expensiveItems[0].price)

    // Stats should have aggregated values
    assert.strictEqual((facets.stats as unknown[]).length, 1)
    assert.ok(facets.stats[0].avgPrice !== undefined)
    assert.ok(facets.stats[0].maxPrice !== undefined)
    assert.strictEqual(facets.stats[0].count, 4)

    // In stock count
    assert.strictEqual((facets.inStockCount as unknown[]).length, 1)
    assert.strictEqual(facets.inStockCount[0].total, 3)
  })

  it('should support faceted search use case', async () => {
    // Realistic faceted search scenario
    await Product.insertMany([
      { name: 'Laptop Pro', price: 1500, category: 'electronics', rating: 4.8, inStock: true },
      { name: 'Laptop Basic', price: 800, category: 'electronics', rating: 4.2, inStock: true },
      { name: 'Mouse Wireless', price: 35, category: 'electronics', rating: 4.5, inStock: true },
      { name: 'Mouse Wired', price: 15, category: 'electronics', rating: 3.9, inStock: false },
      { name: 'Keyboard Mech', price: 120, category: 'electronics', rating: 4.7, inStock: true },
      { name: 'Office Desk', price: 300, category: 'furniture', rating: 4.4, inStock: true },
      { name: 'Gaming Chair', price: 400, category: 'furniture', rating: 4.6, inStock: true }
    ])

    const results = await Product.aggregate([
      {
        $facet: {
          // Category breakdown
          categories: [
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          // Price ranges
          priceRanges: [
            {
              $bucketAuto: {
                groupBy: '$price',
                buckets: 3,
                output: { count: { $sum: 1 }, avgRating: { $avg: '$rating' } }
              }
            }
          ],
          // Rating distribution
          ratings: [
            {
              $bucket: {
                groupBy: '$rating',
                boundaries: [0, 3, 4, 5],
                default: 'other',
                output: { count: { $sum: 1 } }
              }
            }
          ],
          // Availability
          availability: [{ $group: { _id: '$inStock', count: { $sum: 1 } } }]
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    const facets = results[0]

    // Verify all facets are present
    assert.ok(Array.isArray(facets.categories))
    assert.ok(Array.isArray(facets.priceRanges))
    assert.ok(Array.isArray(facets.ratings))
    assert.ok(Array.isArray(facets.availability))

    // Categories should show electronics and furniture
    assert.strictEqual(facets.categories.length, 2)

    // Price ranges should have 3 buckets
    assert.strictEqual(facets.priceRanges.length, 3)

    // Ratings should be bucketed
    assert.ok(facets.ratings.length > 0)

    // Availability should have true/false groups
    assert.strictEqual(facets.availability.length, 2)
  })

  it('should work after other pipeline stages', async () => {
    await Product.insertMany([
      { name: 'Laptop', price: 1000, category: 'electronics', rating: 4.5, inStock: true },
      { name: 'Desk', price: 200, category: 'furniture', rating: 4.3, inStock: true },
      { name: 'Mouse', price: 25, category: 'electronics', rating: 4.0, inStock: true }
    ])

    const results = await Product.aggregate([
      { $match: { category: 'electronics' } },
      {
        $facet: {
          byPrice: [{ $sort: { price: -1 } }],
          stats: [{ $group: { _id: null, avgPrice: { $avg: '$price' } } }]
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    const facets = results[0]

    // Should only include electronics
    assert.strictEqual((facets.byPrice as unknown[]).length, 2)
    assert.ok((facets.byPrice as any[]).every((p: any) => p.category === 'electronics'))

    // Stats should be calculated only for electronics
    assert.strictEqual(facets.stats[0].avgPrice, (1000 + 25) / 2)
  })
})
