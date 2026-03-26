import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { Schema, model } from '../index'

describe('$vectorSearch aggregation', () => {
  interface Doc {
    name: string
    embedding: number[]
    segment?: string
  }

  const vectorSchema = new Schema<Doc>({
    name: String,
    embedding: [Number],
    segment: String
  })

  vectorSchema.searchIndex({
    name: 'vec_idx',
    type: 'vectorSearch',
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: 3,
          similarity: 'cosine'
        }
      ]
    }
  })

  const VectorModel = model('VectorSearchAgg', vectorSchema)

  const textOnlySchema = new Schema<{ title: string }>({ title: String })
  textOnlySchema.searchIndex({
    name: 'atlas_text_only',
    type: 'search',
    definition: { mappings: { dynamic: true } }
  })
  const TextOnlyModel = model('VectorSearchVsTextIdx', textOnlySchema)

  beforeEach(async () => {
    await VectorModel.deleteMany({})
    await TextOnlyModel.deleteMany({})
  })

  it('ranks documents by similarity with declared vector index', async () => {
    await VectorModel.insertMany([
      { name: 'a', embedding: [1, 0, 0] },
      { name: 'b', embedding: [0, 1, 0] },
      { name: 'c', embedding: [0.99, 0.01, 0] }
    ])

    const results = await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          limit: 10
        }
      }
    ])

    assert.strictEqual(results.length, 3)
    assert.strictEqual(results[0].name, 'a')
    assert.strictEqual(results[1].name, 'c')
    assert.strictEqual(results[2].name, 'b')
    assert.ok(typeof results[0].score === 'number')
  })

  it('exposes vector score in later stages with $meta vectorSearchScore', async () => {
    await VectorModel.insertMany([
      { name: 'a', embedding: [1, 0, 0] },
      { name: 'b', embedding: [0, 1, 0] }
    ])

    const results = await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          limit: 10
        }
      },
      {
        $project: {
          _id: 0,
          name: 1,
          vectorRank: { $meta: 'vectorSearchScore' }
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].name, 'a')
    assert.ok(typeof results[0].vectorRank === 'number')
    assert.ok(!('score' in results[0]))
  })

  it('treats $meta searchScore like vector score after $vectorSearch', async () => {
    await VectorModel.insertMany([{ name: 'a', embedding: [1, 0, 0] }])

    const [row] = await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          limit: 5
        }
      },
      {
        $project: {
          _id: 0,
          name: 1,
          s1: { $meta: 'vectorSearchScore' },
          s2: { $meta: 'searchScore' }
        }
      }
    ])

    assert.strictEqual(row.s1, row.s2)
  })

  it('applies filter before scoring', async () => {
    await VectorModel.insertMany([
      { name: 'x', embedding: [1, 0, 0] },
      { name: 'y', embedding: [0.9, 0.1, 0] }
    ])

    const results = await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          limit: 10,
          filter: { name: 'y' }
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'y')
  })

  it('throws when queryVector length mismatches index dimensions', async () => {
    await VectorModel.insertMany([{ name: 'a', embedding: [1, 0, 0] }])

    await assert.rejects(
      () =>
        VectorModel.aggregate([
          {
            $vectorSearch: {
              index: 'vec_idx',
              path: 'embedding',
              queryVector: [1, 0],
              limit: 5
            }
          }
        ]),
      /queryVector length/
    )
  })

  it('throws when vector index descriptor parses no valid fields', async () => {
    const badDimSchema = new Schema<Doc>({ name: String, embedding: [Number] })
    badDimSchema.searchIndex({
      name: 'bad_dim_idx',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: 3.5,
            similarity: 'cosine'
          }
        ]
      }
    })
    const BadDim = model('VectorSearchMalformedIdx', badDimSchema)
    await BadDim.deleteMany({})
    await BadDim.insertMany([{ name: 'a', embedding: [1, 0, 0] }])

    await assert.rejects(
      () =>
        BadDim.aggregate([
          {
            $vectorSearch: {
              index: 'bad_dim_idx',
              path: 'embedding',
              queryVector: [1, 0, 0],
              limit: 5
            }
          }
        ]),
      /unknown vector search index/
    )
  })

  it('works without searchIndex (permissive mode)', async () => {
    const looseSchema = new Schema<Doc>({ name: String, embedding: [Number] })
    const Loose = model('VectorSearchLoose', looseSchema)

    await Loose.deleteMany({})
    await Loose.insertMany([
      { name: 'p', embedding: [1, 0] },
      { name: 'q', embedding: [0, 1] }
    ])

    const results = await Loose.aggregate([
      {
        $vectorSearch: {
          path: 'embedding',
          queryVector: [1, 0],
          limit: 5
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].name, 'p')
  })

  it('runs $vectorSearch first then $match and $project (Atlas pipeline order)', async () => {
    await VectorModel.insertMany([
      { name: 'keep', embedding: [1, 0, 0] },
      { name: 'drop', embedding: [0, 1, 0] },
      { name: 'also', embedding: [0.5, 0.5, 0] }
    ])

    const results = await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          limit: 10
        }
      },
      { $match: { name: { $in: ['keep', 'also'] } } },
      { $project: { _id: 0, name: 1, score: 1 } }
    ])

    assert.strictEqual(results.length, 2)
    assert.deepStrictEqual(results.map(d => d.name).sort(), ['also', 'keep'])
    assert.ok(results.every(r => typeof r.score === 'number'))
  })

  it('chains $vectorSearch with $addFields, $sort, $limit, and $project', async () => {
    await VectorModel.insertMany([
      { name: 'a1', segment: 'A', embedding: [1, 0, 0] },
      { name: 'a2', segment: 'A', embedding: [0.9, 0.1, 0] },
      { name: 'b1', segment: 'B', embedding: [0, 1, 0] }
    ])

    const ranked = await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          limit: 10
        }
      },
      { $addFields: { searched: true } },
      { $sort: { score: -1 } },
      { $limit: 2 },
      { $project: { _id: 0, name: 1, score: 1, searched: 1 } }
    ])

    assert.strictEqual(ranked.length, 2)
    assert.ok(ranked.every(d => d.searched === true))
    assert.deepStrictEqual(
      ranked.map(d => d.name),
      ['a1', 'a2']
    )
  })

  it('chains $vectorSearch with $sort and $group by segment', async () => {
    await VectorModel.insertMany([
      { name: 'a1', segment: 'A', embedding: [1, 0, 0] },
      { name: 'a2', segment: 'A', embedding: [0.9, 0.1, 0] },
      { name: 'b1', segment: 'B', embedding: [0, 1, 0] }
    ])

    const bySegment = await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          limit: 10
        }
      },
      { $sort: { score: -1 } },
      {
        $group: {
          _id: '$segment',
          topScore: { $max: '$score' },
          names: { $push: '$name' }
        }
      },
      { $sort: { _id: 1 } }
    ])

    assert.strictEqual(bySegment.length, 2)
    const bySeg = Object.fromEntries(bySegment.map(r => [r._id, r]))
    assert.ok(bySeg.A.topScore > bySeg.B.topScore)
    assert.strictEqual(bySeg.A.names.length, 2)
    assert.deepStrictEqual(bySeg.B.names, ['b1'])
  })

  it('chains $vectorSearch with $facet sub-pipelines', async () => {
    await VectorModel.insertMany([
      { name: 'near', embedding: [0.95, 0.05, 0] },
      { name: 'far', embedding: [0, 1, 0] }
    ])

    const [facetRow] = (await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          limit: 10
        }
      },
      {
        $facet: {
          labels: [{ $project: { _id: 0, name: 1 } }, { $limit: 1 }],
          counted: [{ $count: 'n' }]
        }
      }
    ])) as { counted: { n: number }[]; labels: { name: string }[] }[]

    assert.ok(facetRow && typeof facetRow === 'object')
    assert.strictEqual(facetRow.counted[0].n, 2)
    assert.strictEqual(facetRow.labels.length, 1)
    assert.ok(['near', 'far'].includes(facetRow.labels[0].name))
  })

  it('respects numCandidates as a cap before limit', async () => {
    await VectorModel.insertMany([
      { name: 'best', embedding: [1, 0, 0] },
      { name: 'mid', embedding: [0.7, 0.3, 0] },
      { name: 'worst', embedding: [0, 1, 0] }
    ])

    const results = await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          numCandidates: 2,
          limit: 10
        }
      }
    ])

    assert.strictEqual(results.length, 2)
    assert.strictEqual(results[0].name, 'best')
    assert.strictEqual(results[1].name, 'mid')
  })

  it('skips documents with non-numeric or missing embeddings', async () => {
    await VectorModel.insertMany([
      { name: 'ok', embedding: [1, 0, 0] },
      { name: 'bad', embedding: ['x', 0, 0] as unknown as number[] },
      { name: 'none', embedding: undefined as unknown as number[] }
    ])

    const results = await VectorModel.aggregate([
      {
        $vectorSearch: {
          index: 'vec_idx',
          path: 'embedding',
          queryVector: [1, 0, 0],
          limit: 10
        }
      }
    ])

    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].name, 'ok')
  })

  it('throws when queryVector is empty', async () => {
    await VectorModel.insertMany([{ name: 'a', embedding: [1, 0, 0] }])

    await assert.rejects(
      () =>
        VectorModel.aggregate([
          {
            $vectorSearch: {
              index: 'vec_idx',
              path: 'embedding',
              queryVector: [],
              limit: 5
            }
          }
        ]),
      /non-empty queryVector/
    )
  })

  it('throws when queryVector contains non-finite or non-number values', async () => {
    await VectorModel.insertMany([{ name: 'a', embedding: [1, 0, 0] }])

    for (const queryVector of [
      [NaN, 0, 0] as number[],
      [Infinity, 0, 0] as number[],
      ['1', 0, 0] as unknown as number[]
    ]) {
      await assert.rejects(
        () =>
          VectorModel.aggregate([
            {
              $vectorSearch: {
                index: 'vec_idx',
                path: 'embedding',
                queryVector,
                limit: 5
              }
            }
          ]),
        /finite numbers/
      )
    }
  })

  it('throws for unknown vector index name when registry exists', async () => {
    await VectorModel.insertMany([{ name: 'a', embedding: [1, 0, 0] }])

    await assert.rejects(
      () =>
        VectorModel.aggregate([
          {
            $vectorSearch: {
              index: 'no_such_index',
              path: 'embedding',
              queryVector: [1, 0, 0],
              limit: 5
            }
          }
        ]),
      /unknown vector search index/
    )
  })

  it('throws when path is not listed on the vector index', async () => {
    await VectorModel.insertMany([{ name: 'a', embedding: [1, 0, 0] }])

    await assert.rejects(
      () =>
        VectorModel.aggregate([
          {
            $vectorSearch: {
              index: 'vec_idx',
              path: 'name',
              queryVector: [1, 0, 0],
              limit: 5
            }
          }
        ]),
      /not indexed for vector search/
    )
  })

  it('throws when index is omitted but only a named index exists (default not defined)', async () => {
    await VectorModel.insertMany([{ name: 'a', embedding: [1, 0, 0] }])

    await assert.rejects(
      () =>
        VectorModel.aggregate([
          {
            $vectorSearch: {
              path: 'embedding',
              queryVector: [1, 0, 0],
              limit: 5
            }
          }
        ]),
      /unknown vector search index "default"/
    )
  })

  it('rejects $search against a vector index entry', async () => {
    await VectorModel.insertMany([{ name: 'a', embedding: [1, 0, 0] }])

    await assert.rejects(
      () =>
        VectorModel.aggregate([
          {
            $search: {
              index: 'vec_idx',
              text: { path: 'name', query: 'a' }
            }
          }
        ]),
      /not a text search index/
    )
  })

  it('rejects $vectorSearch against a text-only search index', async () => {
    await TextOnlyModel.insertMany([{ title: 'hello' }])

    await assert.rejects(
      () =>
        TextOnlyModel.aggregate([
          {
            $vectorSearch: {
              index: 'atlas_text_only',
              path: 'title',
              queryVector: [1],
              limit: 5
            }
          }
        ]),
      /unknown vector search index/
    )
  })
})
