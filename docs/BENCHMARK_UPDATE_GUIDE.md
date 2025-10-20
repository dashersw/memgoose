# Benchmark Update Guide

This guide explains how to update all performance numbers in the documentation using the comprehensive benchmark script.

## Running the Benchmark

```bash
npm run benchmark
```

This will:

1. Run comprehensive benchmarks on all storage backends
2. Test with 100,000 documents
3. Measure all operations mentioned in documentation
4. Save results to `examples/benchmark-results.json`
5. Print markdown tables that can be copied to docs

## System Requirements

The benchmark measures:

- Index performance at different scales (1k, 10k, 100k docs)
- Indexed vs non-indexed query performance
- Storage backend comparison (Memory, File, SQLite, WiredTiger)
- Individual operation benchmarks
- Lean query performance

## Files to Update

After running the benchmark, update these files with the new numbers:

### 1. `docs/README.md`

**Section:** Performance Benchmarks

Update the main summary table with numbers from:

- `results.indexPerformance.indexedVsNonIndexed`

**Location:** Line ~215

### 2. `docs/PERFORMANCE.md`

**Sections to update:**

1. **Index Performance Comparison** (Line ~90)
   - Source: `results.indexPerformance.datasetSizes`

2. **Indexed vs Non-Indexed** (Line ~500)
   - Source: `results.indexPerformance.indexedVsNonIndexed`

3. **Storage Performance Comparison** (Line ~225)
   - Insert 10k: `results.storagePerformance.insert10k`
   - Indexed Query: `results.storagePerformance.indexedQuery100k`
   - Bulk Insert: `results.storagePerformance.bulkInsert100k`

4. **Storage Detailed Comparison** (Line ~515)
   - Source: `results.storageComparison`

5. **Operation Benchmarks** (Line ~525)
   - Source: `results.operationBenchmarks`

6. **Lean Query Performance** (Line ~365)
   - Source: `results.leanPerformance`

### 3. `docs/STORAGE.md`

**Sections to update:**

1. **Performance Comparison** (Line ~865)
   - Insert 10k: `results.storagePerformance.insert10k`
   - Indexed Query: `results.storagePerformance.indexedQuery100k`
   - Bulk Insert: `results.storagePerformance.bulkInsert100k`

### 4. `docs/WIREDTIGER.md`

**Section:** Performance Comparison (Line ~130)

Update table with:

- Insert: `results.storagePerformance.insert10k`
- Query: `results.storagePerformance.indexedQuery100k`
- Bulk insert: `results.storagePerformance.bulkInsert100k`

## Using the JSON Output

The benchmark saves results to `examples/benchmark-results.json`. You can use this file programmatically:

```typescript
import results from './examples/benchmark-results.json'

// Access specific metrics
console.log(results.indexPerformance.indexedVsNonIndexed.equalityQuery)
// { indexed: 0, nonIndexed: 2.05, speedup: 465 }
```

## Automation

To automate doc updates in the future, you can:

1. Run the benchmark: `npm run benchmark`
2. Use the printed markdown tables
3. Copy/paste into the appropriate doc sections
4. Commit the changes

### Example LLM Prompt

```
I've run the benchmark script and saved results to examples/benchmark-results.json.
Please update all performance numbers in the documentation files based on these results.
Use the BENCHMARK_UPDATE_GUIDE.md to know which files and sections to update.
```

## Notes

- Benchmarks are machine-specific (CPU, RAM, etc.)
- Current benchmarks are from: Apple M4 Max (16 cores, 128GB RAM)
- Running on different hardware will produce different numbers
- Always include machine specs when updating benchmarks
- The script automatically adds system info to results

## Verification

After updating, verify:

1. All tables use consistent formatting
2. Numbers match between docs
3. Speedup calculations are correct
4. Machine specs are mentioned where appropriate
5. All storage backends are included in comparisons

## Re-running Benchmarks

You should re-run benchmarks when:

- Releasing a new version
- Making performance optimizations
- Changing storage implementations
- Updating to a new machine
- Node.js version changes significantly

The benchmark script is designed to be stable and reproducible, but minor variations (+/- 10%) are normal due to system load and other factors.
