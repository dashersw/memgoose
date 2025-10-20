/**
 * Compression Algorithm Comparison
 *
 * This example compares different compression algorithms available in WiredTiger:
 * - snappy: Fast compression with moderate ratio (Google)
 * - lz4: Very fast compression with moderate ratio
 * - zstd: Excellent compression ratio, good speed (Facebook)
 * - zlib: Good compression ratio, slower speed
 * - none: No compression (baseline)
 *
 * Run: npx tsx examples/compression-comparison.ts
 */

import { connect, disconnect, model, Schema } from '../index'
import * as fs from 'fs'
import * as path from 'path'

interface TestDoc {
  name: string
  email: string
  description: string
  content: string
  metadata: {
    tags: string[]
    score: number
    timestamp: Date
    nested: {
      field1: string
      field2: number
      field3: boolean
    }
  }
}

// Generate realistic, compressible test data
function generateTestData(count: number): TestDoc[] {
  const loremIpsum =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'

  return Array.from({ length: count }, (_, i) => ({
    name: `User ${i}`,
    email: `user${i}@example.com`,
    description: `${loremIpsum} User ID: ${i}. ${loremIpsum}`,
    content:
      `This is a long content field with repetitive data to make compression effective. ${loremIpsum} `.repeat(
        5
      ),
    metadata: {
      tags: [
        'javascript',
        'typescript',
        'nodejs',
        'database',
        'performance',
        'wiredtiger',
        'compression'
      ],
      score: Math.random() * 100,
      timestamp: new Date(),
      nested: {
        field1: 'Nested data with repetitive patterns ' + loremIpsum.substring(0, 100),
        field2: i * 1.5,
        field3: i % 2 === 0
      }
    }
  }))
}

// Get directory size recursively
function getDirectorySize(dirPath: string): number {
  let totalSize = 0

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return

    const files = fs.readdirSync(dir)
    for (const file of files) {
      const filePath = path.join(dir, file)
      const stats = fs.statSync(filePath)

      if (stats.isDirectory()) {
        scanDir(filePath)
      } else {
        totalSize += stats.size
      }
    }
  }

  scanDir(dirPath)
  return totalSize
}

// Test a specific compressor
async function testCompressor(
  compressor: 'snappy' | 'lz4' | 'zstd' | 'zlib' | 'none',
  docCount: number
) {
  const dataPath = `./data/compression-test-${compressor}`

  // Clean up previous data
  if (fs.existsSync(dataPath)) {
    fs.rmSync(dataPath, { recursive: true })
  }

  console.log(`\n📦 Testing ${compressor.toUpperCase()} compression...`)

  // Connect with specific compressor
  connect({
    storage: 'wiredtiger',
    wiredtiger: {
      dataPath,
      cacheSize: '500M',
      compressor
    }
  })

  const TestModel = model(
    'CompressionTest',
    new Schema<TestDoc>({
      name: { type: String, required: true },
      email: { type: String, required: true },
      description: { type: String, required: true },
      content: { type: String, required: true },
      metadata: { type: Object, required: true }
    })
  )

  const testData = generateTestData(docCount)

  // Calculate uncompressed data size (approximate)
  const sampleDoc = JSON.stringify(testData[0])
  const uncompressedSize = sampleDoc.length * docCount

  // Measure insert time
  const insertStart = Date.now()
  await TestModel.insertMany(testData)
  const insertTime = Date.now() - insertStart

  // Force checkpoint to flush data
  const storage = (TestModel as any)._storage
  if (storage && storage.flush) {
    await storage.flush()
  }

  // Give time for filesystem to settle
  await new Promise(resolve => setTimeout(resolve, 200))

  // Measure storage size
  const storageSize = getDirectorySize(dataPath)

  // Measure read time
  const readStart = Date.now()
  const _docs = await TestModel.find()
  const readTime = Date.now() - readStart

  await disconnect()

  const sizeMB = (storageSize / 1024 / 1024).toFixed(2)
  const uncompressedMB = (uncompressedSize / 1024 / 1024).toFixed(2)
  const compressionRatio = (uncompressedSize / storageSize).toFixed(2)
  const insertRate = Math.round(docCount / (insertTime / 1000))
  const readRate = Math.round(docCount / (readTime / 1000))

  console.log(`  📊 Results:`)
  console.log(`    - Documents: ${docCount.toLocaleString()}`)
  console.log(`    - Uncompressed size: ~${uncompressedMB} MB`)
  console.log(`    - Storage size: ${sizeMB} MB`)
  console.log(`    - Compression ratio: ${compressionRatio}x`)
  console.log(`    - Space saved: ${((1 - storageSize / uncompressedSize) * 100).toFixed(1)}%`)
  console.log(`    - Insert time: ${insertTime}ms (${insertRate.toLocaleString()} docs/sec)`)
  console.log(`    - Read time: ${readTime}ms (${readRate.toLocaleString()} docs/sec)`)

  // Cleanup
  if (fs.existsSync(dataPath)) {
    fs.rmSync(dataPath, { recursive: true })
  }

  return {
    compressor,
    storageSize,
    compressionRatio: parseFloat(compressionRatio),
    insertTime,
    readTime,
    insertRate,
    readRate
  }
}

async function main() {
  const docCount = 100000
  console.log('🗜️  WiredTiger Compression Algorithm Comparison')
  console.log('='.repeat(70))
  console.log(
    `\nTesting with ${docCount.toLocaleString()} documents containing realistic, compressible data...`
  )

  const compressors: Array<'snappy' | 'lz4' | 'zstd' | 'zlib' | 'none'> = [
    'none',
    'snappy',
    'lz4',
    'zstd',
    'zlib'
  ]

  const results: Array<{
    compressor: 'snappy' | 'lz4' | 'zstd' | 'zlib' | 'none'
    storageSize: number
    compressionRatio: number
    insertTime: number
    readTime: number
    insertRate: number
    readRate: number
  }> = []

  for (const compressor of compressors) {
    try {
      const result = await testCompressor(compressor, docCount)
      results.push(result)
      // Wait a bit between tests
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`)
    }
  }

  // Print comparison table
  console.log('\n' + '='.repeat(70))
  console.log('📊 COMPRESSION COMPARISON SUMMARY')
  console.log('='.repeat(70))
  console.log()

  console.log(
    'Compressor'.padEnd(12),
    'Size (MB)'.padStart(10),
    'Ratio'.padStart(8),
    'Insert/s'.padStart(12),
    'Read/s'.padStart(14)
  )
  console.log('-'.repeat(70))

  for (const result of results) {
    console.log(
      result.compressor.toUpperCase().padEnd(12),
      `${(result.storageSize / 1024 / 1024).toFixed(2)}`.padStart(10),
      `${result.compressionRatio}x`.padStart(8),
      result.insertRate.toLocaleString().padStart(12),
      result.readRate.toLocaleString().padStart(14)
    )
  }

  console.log()

  // Find best compressor
  const bestCompression = results.reduce((best, curr) =>
    curr.compressionRatio > best.compressionRatio ? curr : best
  )
  const fastestInsert = results.reduce((fastest, curr) =>
    curr.insertRate > fastest.insertRate ? curr : fastest
  )
  const fastestRead = results.reduce((fastest, curr) =>
    curr.readRate > fastest.readRate ? curr : fastest
  )

  console.log('🏆 Winners:')
  console.log(
    `   Best Compression: ${bestCompression.compressor.toUpperCase()} (${bestCompression.compressionRatio}x)`
  )
  console.log(
    `   Fastest Insert: ${fastestInsert.compressor.toUpperCase()} (${fastestInsert.insertRate.toLocaleString()} docs/sec)`
  )
  console.log(
    `   Fastest Read: ${fastestRead.compressor.toUpperCase()} (${fastestRead.readRate.toLocaleString()} docs/sec)`
  )

  console.log('\n💡 Recommendations:')
  console.log('   - SNAPPY: Best balance of speed and compression (recommended default)')
  console.log('   - LZ4: Fastest, use for maximum throughput')
  console.log('   - ZSTD: Best compression, use when storage space is critical')
  console.log('   - ZLIB: Good compression but slower')
  console.log('   - NONE: Use only if CPU is bottleneck')
}

main().catch(console.error)
