import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

describe('$search aggregation', () => {
  interface Doc {
    title: string
    body: string
  }

  const dynamicSchema = new Schema<Doc>(
    { title: String, body: String },
    { autoSearchIndex: true }
  )

  dynamicSchema.searchIndex({
    name: 'dyn',
    type: 'search',
    definition: { mappings: { dynamic: true } }
  })

  const DynamicModel = model('AtlasSearchDyn', dynamicSchema)

  const staticSchema = new Schema<Doc>({ title: String, body: String })
  staticSchema.searchIndex({
    name: 'static_idx',
    type: 'search',
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          title: { type: 'string' }
        }
      }
    }
  })

  const StaticModel = model('AtlasSearchStatic', staticSchema)

  beforeEach(async () => {
    await DynamicModel.deleteMany({})
    await StaticModel.deleteMany({})
  })

  it('filters with text operator (dynamic index)', async () => {
    await DynamicModel.insertMany([
      { title: 'Apple Pie', body: 'dessert' },
      { title: 'Carrot', body: 'vegetable' }
    ])

    const results = await DynamicModel.aggregate([
      {
        $search: {
          index: 'dyn',
          text: { path: 'title', query: 'apple' }
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].title, 'Apple Pie')
    assert.ok(typeof results[0].score === 'number')
  })

  it('exposes search score in later stages with $meta searchScore', async () => {
    await DynamicModel.insertMany([
      { title: 'Apple Pie', body: 'dessert' },
      { title: 'Carrot', body: 'vegetable' }
    ])

    const results = await DynamicModel.aggregate([
      {
        $search: {
          index: 'dyn',
          text: { path: 'title', query: 'apple' }
        }
      },
      {
        $project: {
          _id: 0,
          title: 1,
          relevance: { $meta: 'searchScore' }
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].title, 'Apple Pie')
    assert.strictEqual(results[0].relevance, 1)
    assert.ok(!('score' in results[0]))
  })

  it('supports $addFields with $meta searchScore', async () => {
    await DynamicModel.insertMany([{ title: 'alpha beta', body: 'x' }])

    const results = await DynamicModel.aggregate([
      {
        $search: {
          index: 'dyn',
          text: { path: 'title', query: 'alpha' }
        }
      },
      { $addFields: { fromMeta: { $meta: 'searchScore' } } },
      { $project: { _id: 0, title: 1, fromMeta: 1 } }
    ])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].fromMeta, 1)
  })

  it('throws for unsupported $meta key', async () => {
    await DynamicModel.insertMany([{ title: 'Apple', body: 'x' }])

    await assert.rejects(
      () =>
        DynamicModel.aggregate([
          {
            $search: {
              index: 'dyn',
              text: { path: 'title', query: 'apple' }
            }
          },
          {
            $project: {
              _id: 0,
              bad: { $meta: 'textScore' }
            }
          }
        ]),
      /unsupported \$meta/
    )
  })

  it('requires path in mappings when not dynamic', async () => {
    await StaticModel.insertMany([{ title: 'ok', body: 'hidden' }])

    await assert.rejects(
      () =>
        StaticModel.aggregate([
          {
            $search: {
              index: 'static_idx',
              text: { path: 'body', query: 'hidden' }
            }
          }
        ]),
      /not indexed/
    )
  })

  it('allows declared path on static index', async () => {
    await StaticModel.insertMany([{ title: 'hello world', body: 'x' }])

    const results = await StaticModel.aggregate([
      {
        $search: {
          index: 'static_idx',
          text: { path: 'title', query: 'hello world' }
        }
      }
    ])

    assert.strictEqual(results.length, 1)
  })

  it('works without searchIndex (permissive)', async () => {
    const looseSchema = new Schema<Doc>({ title: String })
    const Loose = model('AtlasSearchLoose', looseSchema)
    await Loose.deleteMany({})
    await Loose.insertMany([{ title: 'alpha beta' }, { title: 'gamma' }])

    const results = await Loose.aggregate([
      {
        $search: {
          text: { path: 'title', query: 'alpha' }
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].title, 'alpha beta')
  })

  it('runs $search first then $match, $sort, and $project (Atlas pipeline order)', async () => {
    await DynamicModel.insertMany([
      { title: 'red apple', body: 'fruit' },
      { title: 'green apple', body: 'fruit' },
      { title: 'car', body: 'vehicle' }
    ])

    const results = await DynamicModel.aggregate([
      {
        $search: {
          index: 'dyn',
          text: { path: 'title', query: 'apple' }
        }
      },
      { $match: { body: 'fruit' } },
      { $sort: { score: -1, title: 1 } },
      { $project: { _id: 0, title: 1, score: 1 } }
    ])

    assert.strictEqual(results.length, 2)
    assert.ok(results.every(r => typeof r.score === 'number'))
    assert.deepStrictEqual(results.map(r => r.title), ['green apple', 'red apple'])
  })

  it('chains $search with $addFields, $skip, $limit, and $facet', async () => {
    await DynamicModel.insertMany([
      { title: 'zebra apple', body: 'z' },
      { title: 'apple jam', body: 'a' },
      { title: 'plain', body: 'p' }
    ])

    const [row] = (await DynamicModel.aggregate([
      {
        $search: {
          index: 'dyn',
          text: { path: 'title', query: 'apple' }
        }
      },
      { $addFields: { source: 'atlas' } },
      { $sort: { title: 1 } },
      { $skip: 1 },
      {
        $facet: {
          titles: [{ $project: { _id: 0, title: 1 } }],
          total: [{ $count: 'c' }]
        }
      }
    ])) as { total: { c: number }[]; titles: { title: string }[] }[]

    assert.ok(row && typeof row === 'object')
    assert.strictEqual(row.total[0].c, 1)
    assert.strictEqual(row.titles.length, 1)
    assert.match(row.titles[0].title, /apple/i)
  })

  it('returns no rows when query tokenizes to nothing', async () => {
    await DynamicModel.insertMany([{ title: 'only', body: 'x' }])

    const results = await DynamicModel.aggregate([
      {
        $search: {
          index: 'dyn',
          text: { path: 'title', query: '   \t  ' }
        }
      }
    ])

    assert.strictEqual(results.length, 0)
  })

  it('returns no rows for empty string text query', async () => {
    await DynamicModel.insertMany([{ title: 'only', body: 'x' }])

    const results = await DynamicModel.aggregate([
      {
        $search: {
          index: 'dyn',
          text: { path: 'title', query: '' }
        }
      }
    ])

    assert.strictEqual(results.length, 0)
  })

  it('throws when text.path or text.query are missing', async () => {
    await DynamicModel.insertMany([{ title: 'x', body: 'y' }])

    await assert.rejects(
      () =>
        DynamicModel.aggregate([
          // @ts-expect-error intentional bad stage for runtime validation
          { $search: { index: 'dyn', text: { path: 'title' } } }
        ]),
      /text\.path and text\.query/
    )

    await assert.rejects(
      () =>
        DynamicModel.aggregate([
          // @ts-expect-error intentional bad stage for runtime validation
          { $search: { index: 'dyn', text: { query: 'x' } } }
        ]),
      /text\.path and text\.query/
    )
  })

  it('throws for unknown search index when registry exists', async () => {
    await StaticModel.insertMany([{ title: 'ok', body: 'x' }])

    await assert.rejects(
      () =>
        StaticModel.aggregate([
          {
            $search: {
              index: 'does_not_exist',
              text: { path: 'title', query: 'ok' }
            }
          }
        ]),
      /unknown search index/
    )
  })

  it('throws when index is omitted but only a named search index exists', async () => {
    await StaticModel.insertMany([{ title: 'ok', body: 'x' }])

    await assert.rejects(
      () =>
        StaticModel.aggregate([
          {
            $search: {
              text: { path: 'title', query: 'ok' }
            }
          }
        ]),
      /unknown search index "default"/
    )
  })

  it('rejects $vectorSearch against a text search index', async () => {
    await StaticModel.insertMany([{ title: 'ok', body: 'x' }])

    await assert.rejects(
      () =>
        StaticModel.aggregate([
          {
            $vectorSearch: {
              index: 'static_idx',
              path: 'title',
              queryVector: [1],
              limit: 5
            }
          }
        ]),
      /unknown vector search index/
    )
  })

  it('throws when text operator is missing', async () => {
    await DynamicModel.insertMany([{ title: 'x', body: 'y' }])

    await assert.rejects(
      () =>
        DynamicModel.aggregate([
          // @ts-expect-error intentional bad stage for runtime validation
          { $search: { index: 'dyn' } }
        ]),
      /text\.path and text\.query/
    )
  })
})
