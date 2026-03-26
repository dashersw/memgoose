import type { AtlasSearchStage } from './aggregation'
import { assertSearchTextPathAllowed, type SearchIndexRegistry } from './search-index-registry'

export type AtlasSearchStageDeps = {
  resolveFieldPath: (doc: Record<string, unknown>, path: string) => unknown
  searchIndexRegistry: SearchIndexRegistry | null
}

function pathToRef(path: string): string {
  return path.startsWith('$') ? path : `$${path}`
}

function tokenize(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map(t => t.toLowerCase())
    .filter(Boolean)
}

export function runAtlasSearchStage(
  docs: Record<string, unknown>[],
  stage: AtlasSearchStage,
  deps: AtlasSearchStageDeps
): Record<string, unknown>[] {
  const { resolveFieldPath, searchIndexRegistry } = deps

  if (!stage.text || typeof stage.text.path !== 'string' || typeof stage.text.query !== 'string') {
    throw new Error('memgoose: $search requires text.path and text.query strings')
  }

  assertSearchTextPathAllowed(searchIndexRegistry, stage.index, stage.text.path)

  const pathRef = pathToRef(stage.text.path)
  const tokens = tokenize(stage.text.query)
  if (tokens.length === 0) {
    return []
  }

  const out: Record<string, unknown>[] = []

  for (const doc of docs) {
    const raw = resolveFieldPath(doc, pathRef)
    const haystack = raw === null || raw === undefined ? '' : String(raw).toLowerCase()

    let matched = 0
    for (const t of tokens) {
      if (haystack.includes(t)) matched++
    }

    if (matched === tokens.length) {
      // All-or-nothing token match: score is always 1.0 here (simplified vs Atlas BM25-style scoring).
      const score = matched / tokens.length
      out.push({ ...doc, score })
    }
  }

  return out
}
