import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  assertSearchTextPathAllowed,
  buildSearchIndexRegistry
} from '../src/search-index-registry'
import type { SearchIndexDescriptor } from '../src/schema'

describe('buildSearchIndexRegistry', () => {
  function vectorIndex(dimensions: number, path = 'embedding'): SearchIndexDescriptor {
    return {
      name: 'vec',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path,
            numDimensions: dimensions,
            similarity: 'cosine' as const
          }
        ]
      }
    }
  }

  it('omits vector fields when numDimensions is not a positive integer', () => {
    assert.strictEqual(buildSearchIndexRegistry([vectorIndex(3.5)]).size, 0)
    assert.strictEqual(buildSearchIndexRegistry([vectorIndex(0)]).size, 0)
    assert.strictEqual(buildSearchIndexRegistry([vectorIndex(-1)]).size, 0)
  })

  it('registers vector fields when numDimensions is a positive integer', () => {
    const reg = buildSearchIndexRegistry([vectorIndex(3)])
    assert.ok(reg !== null)
    const entry = reg!.get('vec')
    assert.strictEqual(entry?.kind, 'vectorSearch')
    if (entry?.kind === 'vectorSearch') {
      assert.strictEqual(entry.vectors.get('embedding')?.dimensions, 3)
    }
  })

  it('keeps search index non-dynamic when mappings.dynamic is false but fields is invalid', () => {
    const reg = buildSearchIndexRegistry([
      {
        name: 'idx',
        type: 'search',
        definition: { mappings: { dynamic: false, fields: [] } }
      }
    ])
    assert.ok(reg !== null)
    const entry = reg!.get('idx')
    assert.strictEqual(entry?.kind, 'search')
    if (entry?.kind === 'search') {
      assert.strictEqual(entry.dynamic, false)
      assert.strictEqual(entry.allowedPaths, null)
    }
    assert.throws(() => assertSearchTextPathAllowed(reg!, 'idx', 'title'), /not indexed/)
  })

  it('uses permissive search when fields invalid and dynamic is not false', () => {
    const reg = buildSearchIndexRegistry([
      {
        name: 'idx',
        type: 'search',
        definition: { mappings: { fields: [] } }
      }
    ])
    assert.ok(reg !== null)
    const entry = reg!.get('idx')
    assert.strictEqual(entry?.kind, 'search')
    if (entry?.kind === 'search') {
      assert.strictEqual(entry.dynamic, true)
    }
    assert.doesNotThrow(() => assertSearchTextPathAllowed(reg!, 'idx', 'title'))
  })
})
