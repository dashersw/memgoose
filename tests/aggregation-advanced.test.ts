import { describe, it } from 'node:test'
import * as assert from 'assert'
import { createDatabase } from '../src/connection'
import { Schema } from '../src/schema'

interface Product {
  name: string
  price: number
  description?: string
  category?: string
  tags?: string[]
  inStock?: boolean
  quantity?: number
}

describe('Advanced Aggregation Operations', async () => {
  const db = createDatabase()

  it('should handle $substr operator in projection', async () => {
    const Product = db.model(
      'ProductSubstr',
      new Schema<Product>({ name: String, description: String })
    )

    await Product.insertMany([
      { name: 'Widget', description: 'A wonderful widget' },
      { name: 'Gadget', description: 'An amazing gadget' }
    ])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          shortDesc: { $substr: ['$description', 0, 10] }
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].shortDesc, 'A wonderfu')
    assert.strictEqual(results[1].shortDesc, 'An amazing')
  })

  it('should handle $cond operator in projection', async () => {
    const Product = db.model('ProductCond', new Schema<Product>({ name: String, price: Number }))

    await Product.insertMany([
      { name: 'Expensive', price: 100 },
      { name: 'Cheap', price: 10 }
    ])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          priceCategory: { $cond: ['$price', 'expensive', 'cheap'] }
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    assert.ok(results.every((r: any) => r.priceCategory))
  })

  it('should handle $divide operator', async () => {
    const Product = db.model(
      'ProductDivide',
      new Schema<Product>({ name: String, price: Number, quantity: Number })
    )

    await Product.insertMany([
      { name: 'Item1', price: 100, quantity: 4 },
      { name: 'Item2', price: 50, quantity: 2 }
    ])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          unitPrice: { $divide: ['$price', '$quantity'] }
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].unitPrice, 25)
    assert.strictEqual(results[1].unitPrice, 25)
  })

  it('should handle $divide by zero', async () => {
    const Product = db.model(
      'ProductDivideZero',
      new Schema<Product>({ name: String, price: Number, quantity: Number })
    )

    await Product.insertMany([{ name: 'Item', price: 100, quantity: 0 }])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          unitPrice: { $divide: ['$price', '$quantity'] }
        }
      }
    ])

    assert.strictEqual(results[0].unitPrice, null)
  })

  it('should handle $ifNull operator', async () => {
    const Product = db.model(
      'ProductIfNull',
      new Schema<Product>({ name: String, description: String })
    )

    await Product.insertMany([
      { name: 'HasDesc', description: 'Some description' },
      { name: 'NoDesc' }
    ])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          desc: { $ifNull: ['$description', 'No description'] }
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].desc, 'Some description')
    assert.strictEqual(results[1].desc, 'No description')
  })

  it('should handle $arrayElemAt operator', async () => {
    const Product = db.model(
      'ProductArrayElem',
      new Schema<Product>({ name: String, tags: [String] })
    )

    await Product.insertMany([
      { name: 'Item1', tags: ['tag1', 'tag2', 'tag3'] },
      { name: 'Item2', tags: ['single'] }
    ])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          firstTag: { $arrayElemAt: ['$tags', 0] },
          lastTag: { $arrayElemAt: ['$tags', -1] }
        }
      }
    ])

    assert.strictEqual(results[0].firstTag, 'tag1')
    assert.strictEqual(results[0].lastTag, 'tag3')
    assert.strictEqual(results[1].firstTag, 'single')
    assert.strictEqual(results[1].lastTag, 'single')
  })

  it('should handle $arrayElemAt with non-array', async () => {
    const Product = db.model('ProductArrayElemNull', new Schema<Product>({ name: String }))

    await Product.insertMany([{ name: 'Item' }])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          firstTag: { $arrayElemAt: ['$tags', 0] }
        }
      }
    ])

    assert.strictEqual(results[0].firstTag, null)
  })

  it('should handle $size operator', async () => {
    const Product = db.model('ProductSize', new Schema<Product>({ name: String, tags: [String] }))

    await Product.insertMany([
      { name: 'Item1', tags: ['tag1', 'tag2', 'tag3'] },
      { name: 'Item2', tags: [] },
      { name: 'Item3' }
    ])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          tagCount: { $size: '$tags' }
        }
      }
    ])

    assert.strictEqual(results[0].tagCount, 3)
    assert.strictEqual(results[1].tagCount, 0)
    assert.strictEqual(results[2].tagCount, 0)
  })

  it('should handle $unwind with preserveNullAndEmptyArrays', async () => {
    const Product = db.model(
      'ProductUnwindPreserve',
      new Schema<Product>({ name: String, tags: [String] })
    )

    await Product.insertMany([
      { name: 'HasTags', tags: ['tag1', 'tag2'] },
      { name: 'EmptyTags', tags: [] },
      { name: 'NoTags' }
    ])

    const results = await Product.aggregate([
      {
        $unwind: {
          path: '$tags',
          preserveNullAndEmptyArrays: true
        }
      }
    ])

    assert.ok(results.length >= 3)
    const noTags = results.find((r: any) => r.name === 'NoTags')
    assert.ok(noTags)
    assert.strictEqual(noTags.tags, null)
  })

  it('should handle $unwind with includeArrayIndex', async () => {
    const Product = db.model(
      'ProductUnwindIndex',
      new Schema<Product>({ name: String, tags: [String] })
    )

    await Product.insertMany([{ name: 'Item', tags: ['tag1', 'tag2', 'tag3'] }])

    const results = await Product.aggregate([
      {
        $unwind: {
          path: '$tags',
          includeArrayIndex: 'tagIndex'
        }
      }
    ])

    assert.strictEqual(results.length, 3)
    assert.strictEqual(results[0].tagIndex, 0)
    assert.strictEqual(results[1].tagIndex, 1)
    assert.strictEqual(results[2].tagIndex, 2)
  })

  it('should handle $unwind with preserveNullAndEmptyArrays and includeArrayIndex', async () => {
    const Product = db.model(
      'ProductUnwindBoth',
      new Schema<Product>({ name: String, tags: [String] })
    )

    await Product.insertMany([{ name: 'HasTags', tags: ['tag1'] }, { name: 'NoTags' }])

    const results = await Product.aggregate([
      {
        $unwind: {
          path: '$tags',
          preserveNullAndEmptyArrays: true,
          includeArrayIndex: 'index'
        }
      }
    ])

    const noTags = results.find((r: any) => r.name === 'NoTags')
    assert.ok(noTags)
    assert.strictEqual(noTags.index, null)
  })

  it('should handle $replaceRoot with field reference', async () => {
    interface ProductWithDetails {
      name: string
      details: {
        price: number
        category: string
      }
    }

    const Product = db.model(
      'ProductReplaceRoot',
      new Schema<ProductWithDetails>({
        name: String,
        details: {
          price: Number,
          category: String
        }
      })
    )

    await Product.insertMany([
      {
        name: 'Item1',
        details: { price: 100, category: 'electronics' }
      }
    ])

    const results = await Product.aggregate([
      {
        $replaceRoot: {
          newRoot: '$details'
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].price, 100)
    assert.strictEqual(results[0].category, 'electronics')
    assert.strictEqual(results[0].name, undefined)
  })

  it('should handle $replaceRoot with object expression', async () => {
    const Product = db.model(
      'ProductReplaceRootExpr',
      new Schema<Product>({ name: String, price: Number })
    )

    await Product.insertMany([{ name: 'Item', price: 100 }])

    const results = await Product.aggregate([
      {
        $replaceRoot: {
          newRoot: {
            productName: '$name',
            cost: '$price'
          }
        }
      }
    ])

    assert.strictEqual(results[0].productName, 'Item')
    assert.strictEqual(results[0].cost, 100)
  })

  it('should handle $sample stage', async () => {
    const Product = db.model('ProductSample', new Schema<Product>({ name: String }))

    await Product.insertMany([
      { name: 'Item1' },
      { name: 'Item2' },
      { name: 'Item3' },
      { name: 'Item4' },
      { name: 'Item5' }
    ])

    const results = await Product.aggregate([
      {
        $sample: { size: 2 }
      }
    ])

    assert.strictEqual(results.length, 2)
  })

  it('should handle $sample with size larger than collection', async () => {
    const Product = db.model('ProductSampleLarge', new Schema<Product>({ name: String }))

    await Product.insertMany([{ name: 'Item1' }, { name: 'Item2' }])

    const results = await Product.aggregate([
      {
        $sample: { size: 10 }
      }
    ])

    assert.strictEqual(results.length, 2)
  })

  it('should handle projection with exclusions', async () => {
    const Product = db.model(
      'ProductProjectExclude',
      new Schema<Product>({ name: String, price: Number, description: String })
    )

    await Product.insertMany([{ name: 'Item', price: 100, description: 'A product' }])

    const results = await Product.aggregate([
      {
        $project: {
          description: 0
        }
      }
    ])

    assert.ok(results[0].name)
    assert.ok(results[0].price)
    assert.strictEqual(results[0].description, undefined)
  })

  it('should handle projection excluding _id', async () => {
    const Product = db.model(
      'ProductProjectNoId',
      new Schema<Product>({ name: String, price: Number })
    )

    await Product.insertMany([{ name: 'Item', price: 100 }])

    const results = await Product.aggregate([
      {
        $project: {
          _id: 0,
          name: 1,
          price: 1
        }
      }
    ])

    assert.strictEqual(results[0]._id, undefined)
    assert.strictEqual(results[0].name, 'Item')
  })

  it('should handle $toUpper and $toLower operators', async () => {
    const Product = db.model('ProductCase', new Schema<Product>({ name: String }))

    await Product.insertMany([{ name: 'MixedCase' }])

    const results = await Product.aggregate([
      {
        $project: {
          upper: { $toUpper: '$name' },
          lower: { $toLower: '$name' }
        }
      }
    ])

    assert.strictEqual(results[0].upper, 'MIXEDCASE')
    assert.strictEqual(results[0].lower, 'mixedcase')
  })

  it('should handle $toUpper with non-string value', async () => {
    const Product = db.model(
      'ProductCaseNumber',
      new Schema<Product>({ name: String, price: Number })
    )

    await Product.insertMany([{ name: 'Item', price: 100 }])

    const results = await Product.aggregate([
      {
        $project: {
          upperPrice: { $toUpper: '$price' }
        }
      }
    ])

    assert.strictEqual(results[0].upperPrice, 100)
  })

  it('should handle complex nested projections', async () => {
    const Product = db.model(
      'ProductNested',
      new Schema<Product>({ name: String, price: Number, quantity: Number })
    )

    await Product.insertMany([{ name: 'Item', price: 10, quantity: 5 }])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          total: { $multiply: ['$price', '$quantity'] },
          sum: { $add: ['$price', '$quantity'] }
        }
      }
    ])

    assert.strictEqual(results[0].total, 50)
    assert.strictEqual(results[0].sum, 15)
  })

  it('should handle $concat with multiple expressions', async () => {
    const Product = db.model(
      'ProductConcat',
      new Schema<Product>({ name: String, category: String })
    )

    await Product.insertMany([{ name: 'Widget', category: 'Tools' }])

    const results = await Product.aggregate([
      {
        $project: {
          fullName: {
            $concat: [{ $toUpper: '$category' }, ': ', '$name']
          }
        }
      }
    ])

    assert.strictEqual(results[0].fullName, 'TOOLS: Widget')
  })

  it('should handle number and boolean expressions in projection', async () => {
    const Product = db.model('ProductLiterals', new Schema<Product>({ name: String }))

    await Product.insertMany([{ name: 'Item' }])

    const results = await Product.aggregate([
      {
        $project: {
          name: 1,
          constantNumber: 42,
          constantBoolean: true
        }
      }
    ])

    assert.strictEqual(results[0].constantNumber, 42)
    assert.strictEqual(results[0].constantBoolean, true)
  })

  it('should handle unknown aggregation stage', async () => {
    const Product = db.model('ProductUnknown', new Schema<Product>({ name: String }))

    await Product.insertMany([{ name: 'Item' }])

    await assert.rejects(async () => {
      await Product.aggregate([{ $unknownStage: {} } as any])
    }, /Unknown aggregation stage/)
  })

  it('should handle $lookup without database context', async () => {
    // Create model without database reference
    const db = createDatabase()
    const Product = db.model('ProductNoDb', new Schema<Product>({ name: String }))

    await Product.insertMany([{ name: 'Item' }])

    // This should work because we're using the same db
    await Product.aggregate([
      {
        $lookup: {
          from: 'ProductNoDb',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      }
    ])
  })

  it('should handle $lookup with non-existent collection', async () => {
    const db = createDatabase()
    const Product = db.model('ProductLookupMissing', new Schema<Product>({ name: String }))

    await Product.insertMany([{ name: 'Item' }])

    await assert.rejects(async () => {
      await Product.aggregate([
        {
          $lookup: {
            from: 'NonExistentCollection',
            localField: 'category',
            foreignField: '_id',
            as: 'info'
          }
        }
      ])
    }, /Model .* not found/)
  })
})
