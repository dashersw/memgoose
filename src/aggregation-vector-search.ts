import type { VectorSearchStage } from './aggregation'
import { getVectorSpec, type SearchIndexRegistry, type VectorSimilarity } from './search-index-registry'

export type VectorSearchStageDeps = {
  resolveFieldPath: (doc: Record<string, unknown>, path: string) => unknown
  matchDocument: (doc: unknown, query: Record<string, unknown>) => boolean
  searchIndexRegistry: SearchIndexRegistry | null
}

function pathToRef(path: string): string {
  return path.startsWith('$') ? path : `$${path}`
}

function toNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const out: number[] = []
  for (const x of value) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return null
    out.push(x)
  }
  return out
}

function dotProduct(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function norm(a: number[]): number {
  return Math.sqrt(dotProduct(a, a))
}

function euclideanSimilarity(a: number[], b: number[]): number {
  let sumSq = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sumSq += d * d
  }
  return 1 / (1 + Math.sqrt(sumSq))
}

function cosineSimilarity(a: number[], b: number[]): number {
  const na = norm(a)
  const nb = norm(b)
  if (na === 0 || nb === 0) return 0
  return dotProduct(a, b) / (na * nb)
}

function scoreSimilarity(
  docVec: number[],
  queryVec: number[],
  similarity: VectorSimilarity
): number {
  if (similarity === 'dotProduct') {
    return dotProduct(docVec, queryVec)
  }
  if (similarity === 'euclidean') {
    return euclideanSimilarity(docVec, queryVec)
  }
  return cosineSimilarity(docVec, queryVec)
}

export function runVectorSearchStage(
  docs: Record<string, unknown>[],
  stage: VectorSearchStage,
  deps: VectorSearchStageDeps
): Record<string, unknown>[] {
  const { resolveFieldPath, matchDocument, searchIndexRegistry } = deps
  if (!Array.isArray(stage.queryVector) || stage.queryVector.length === 0) {
    throw new Error('memgoose: $vectorSearch requires a non-empty queryVector array')
  }
  const validatedQuery = toNumberArray(stage.queryVector)
  if (!validatedQuery) {
    throw new Error('memgoose: $vectorSearch queryVector must contain only finite numbers')
  }

  const vecSpec = searchIndexRegistry
    ? getVectorSpec(searchIndexRegistry, stage.index, stage.path)
    : null

  if (vecSpec && validatedQuery.length !== vecSpec.dimensions) {
    throw new Error(
      `memgoose: queryVector length ${validatedQuery.length} does not match index dimensions ${vecSpec.dimensions}`
    )
  }

  const similarity: VectorSimilarity = vecSpec?.similarity ?? 'cosine'
  const pathRef = pathToRef(stage.path)

  let candidates = docs
  if (stage.filter && Object.keys(stage.filter).length > 0) {
    candidates = candidates.filter(d => matchDocument(d, stage.filter as Record<string, unknown>))
  }

  const scored: { doc: Record<string, unknown>; score: number }[] = []

  for (const doc of candidates) {
    const raw = resolveFieldPath(doc, pathRef)
    const docVec = toNumberArray(raw)
    if (!docVec) continue

    if (vecSpec && docVec.length !== vecSpec.dimensions) continue
    if (!vecSpec && docVec.length !== validatedQuery.length) continue

    const score = scoreSimilarity(docVec, validatedQuery, similarity)
    scored.push({ doc: { ...doc, score }, score })
  }

  scored.sort((a, b) => b.score - a.score)

  const cap =
    stage.numCandidates !== undefined && stage.numCandidates >= 0
      ? Math.min(scored.length, stage.numCandidates)
      : scored.length
  const limited = scored.slice(0, cap).slice(0, Math.max(0, stage.limit))

  return limited.map(x => x.doc)
}
