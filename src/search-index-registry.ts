import type { SearchIndexDescriptor } from './schema'

export type VectorSimilarity = 'cosine' | 'dotProduct' | 'euclidean'

export type VectorFieldSpec = {
  dimensions: number
  similarity: VectorSimilarity
}

type ParsedVectorIndex = {
  kind: 'vectorSearch'
  vectors: Map<string, VectorFieldSpec>
}

type ParsedSearchIndex = {
  kind: 'search'
  dynamic: boolean
  allowedPaths: Set<string> | null
}

export type ParsedIndexEntry = ParsedVectorIndex | ParsedSearchIndex

export type SearchIndexRegistry = Map<string, ParsedIndexEntry>

const DEFAULT_INDEX_NAME = 'default'

function normalizeIndexName(name: string | undefined): string {
  return name && name.length > 0 ? name : DEFAULT_INDEX_NAME
}

function parseVectorFields(definition: Record<string, unknown>): Map<string, VectorFieldSpec> | null {
  const fields = definition.fields
  if (!Array.isArray(fields)) return null

  const vectors = new Map<string, VectorFieldSpec>()
  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') continue
    const f = raw as Record<string, unknown>
    if (f.type !== 'vector') continue
    const path = f.path
    if (typeof path !== 'string' || !path) continue

    const dimRaw = f.numDimensions ?? f.dimensions
    if (typeof dimRaw !== 'number' || !Number.isFinite(dimRaw) || !Number.isInteger(dimRaw)) continue
    const dimensions = dimRaw
    if (dimensions <= 0) continue

    let similarity: VectorSimilarity = 'cosine'
    if (f.similarity === 'dotProduct' || f.similarity === 'euclidean' || f.similarity === 'cosine') {
      similarity = f.similarity
    }

    vectors.set(path, { dimensions, similarity })
  }

  return vectors.size > 0 ? vectors : null
}

function looksLikeVectorDefinition(definition: Record<string, unknown>): boolean {
  return parseVectorFields(definition) !== null
}

function parseSearchMappings(definition: Record<string, unknown>): ParsedSearchIndex {
  const mappings = definition.mappings as Record<string, unknown> | undefined
  if (!mappings || typeof mappings !== 'object') {
    return { kind: 'search', dynamic: true, allowedPaths: null }
  }

  if (mappings.dynamic === true) {
    return { kind: 'search', dynamic: true, allowedPaths: null }
  }

  const fields = mappings.fields as Record<string, unknown> | undefined
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return mappings.dynamic === false
      ? { kind: 'search', dynamic: false, allowedPaths: null }
      : { kind: 'search', dynamic: true, allowedPaths: null }
  }

  const allowedPaths = new Set<string>()
  for (const key of Object.keys(fields)) {
    allowedPaths.add(key)
  }
  return { kind: 'search', dynamic: false, allowedPaths }
}

export function buildSearchIndexRegistry(
  descriptors: ReadonlyArray<SearchIndexDescriptor>
): SearchIndexRegistry {
  const registry: SearchIndexRegistry = new Map()
  if (descriptors.length === 0) return registry

  for (const desc of descriptors) {
    const name = normalizeIndexName(desc.name)
    const def = desc.definition

    if (desc.type === 'search') {
      registry.set(name, parseSearchMappings(def))
      continue
    }

    if (desc.type === 'vectorSearch' || (desc.type === undefined && looksLikeVectorDefinition(def))) {
      const vectors = parseVectorFields(def)
      if (vectors) {
        registry.set(name, { kind: 'vectorSearch', vectors })
      }
      continue
    }

    registry.set(name, parseSearchMappings(def))
  }

  return registry
}

export function getVectorSpec(
  registry: SearchIndexRegistry | null,
  indexName: string | undefined,
  path: string
): VectorFieldSpec | null {
  if (!registry) return null

  const name = normalizeIndexName(indexName)
  const entry = registry.get(name)
  if (!entry || entry.kind !== 'vectorSearch') {
    throw new Error(`memgoose: unknown vector search index "${name}"`)
  }

  const spec = entry.vectors.get(path)
  if (!spec) {
    throw new Error(`memgoose: path "${path}" is not indexed for vector search on index "${name}"`)
  }

  return spec
}

export function assertSearchTextPathAllowed(
  registry: SearchIndexRegistry | null,
  indexName: string | undefined,
  textPath: string
): void {
  if (!registry) return

  const name = normalizeIndexName(indexName)
  const entry = registry.get(name)
  if (!entry) {
    throw new Error(`memgoose: unknown search index "${name}"`)
  }
  if (entry.kind !== 'search') {
    throw new Error(`memgoose: index "${name}" is not a text search index`)
  }
  if (entry.dynamic) return
  if (!entry.allowedPaths || !entry.allowedPaths.has(textPath)) {
    throw new Error(`memgoose: path "${textPath}" is not indexed for $search on index "${name}"`)
  }
}
