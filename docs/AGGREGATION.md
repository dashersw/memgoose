# Aggregation Pipeline Guide

Complete guide to using the aggregation pipeline in memgoose.

## Table of Contents

- [Introduction](#introduction)
- [Basic Syntax](#basic-syntax)
- [Pipeline Stages](#pipeline-stages)
  - [$match](#match---filter-documents)
  - [$group](#group---group-and-aggregate)
  - [$project](#project---transform-documents)
  - [$sort](#sort---sort-documents)
  - [$limit](#limit---limit-results)
  - [$skip](#skip---skip-results)
  - [$count](#count---count-documents)
  - [$unwind](#unwind---flatten-arrays)
  - [$lookup](#lookup---join-collections)
  - [$addFields](#addfields---add-fields)
  - [$replaceRoot](#replaceroot---replace-root)
  - [$sample](#sample---random-sample)
  - [$bucket](#bucket---categorize-into-buckets) 🆕
  - [$bucketAuto](#bucketauto---automatic-bucketing) 🆕
  - [$facet](#facet---multi-pipeline-processing) 🆕
  - [$out](#out---output-to-collection) 🆕
  - [$merge](#merge---merge-into-collection) 🆕
- [Accumulator Operators](#accumulator-operators)
- [Expression Operators](#expression-operators)
  - [Date Operators](#date-operators) 🆕
  - [String Operators](#string-operators) 🆕
  - [Array Operators](#array-operators) 🆕
  - [Type Conversion Operators](#type-conversion-operators) 🆕
  - [Conditional Operators](#conditional-operators) 🆕
  - [Object Operators](#object-operators) 🆕
- [Real-World Examples](#real-world-examples)
- [Performance Tips](#performance-tips)

---

## Introduction

The aggregation pipeline provides a powerful framework for data analysis and transformation. It processes documents through a sequence of stages, where each stage transforms the documents and passes them to the next stage.

### Why Use Aggregation?

- **Complex Analytics**: Calculate sums, averages, min/max across groups
- **Data Transformation**: Reshape documents, compute new fields
- **Multi-Collection Joins**: Combine data from related collections
- **Performance**: More efficient than client-side processing for large datasets

---

## Basic Syntax

```typescript
const results = await Model.aggregate([{ stage1 }, { stage2 }, { stage3 }])
```

Each stage transforms the documents and outputs to the next stage.

---

## Pipeline Stages

### $match - Filter Documents

Filters documents like a `find()` query. Should be early in the pipeline for best performance.

```typescript
// Filter by single field
await User.aggregate([{ $match: { status: 'active' } }])

// Filter with operators
await Sale.aggregate([{ $match: { price: { $gte: 100 }, quantity: { $gt: 0 } } }])

// Filter with logical operators
await User.aggregate([
  {
    $match: {
      $or: [{ age: { $lt: 18 } }, { role: 'admin' }]
    }
  }
])
```

**Best Practices:**

- Place `$match` early to reduce documents processed by later stages
- Use indexes by matching indexed fields
- Combine with logical operators for complex filtering

---

### $group - Group and Aggregate

Groups documents by a specified expression and applies accumulator functions.

#### Group by Single Field

```typescript
// Count documents by category
await Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }])

// Output: [
//   { _id: 'electronics', count: 25 },
//   { _id: 'books', count: 42 }
// ]
```

#### Group by Multiple Fields (Compound Key)

```typescript
await Sale.aggregate([
  {
    $group: {
      _id: { region: '$region', category: '$category' },
      total: { $sum: '$amount' }
    }
  }
])

// Output: [
//   { _id: { region: 'north', category: 'electronics' }, total: 5000 },
//   { _id: { region: 'south', category: 'books' }, total: 3000 }
// ]
```

#### Group All Documents

```typescript
// Group everything together (use null as _id)
await Sale.aggregate([
  {
    $group: {
      _id: null,
      totalRevenue: { $sum: '$revenue' },
      avgPrice: { $avg: '$price' }
    }
  }
])

// Output: [{ _id: null, totalRevenue: 50000, avgPrice: 25.5 }]
```

---

### $project - Transform Documents

Include, exclude, or compute fields.

#### Include Specific Fields

```typescript
await User.aggregate([{ $project: { name: 1, email: 1 } }])

// Output: [
//   { _id: '...', name: 'Alice', email: 'alice@example.com' },
//   ...
// ]
```

#### Exclude Fields

```typescript
await User.aggregate([{ $project: { password: 0, secretKey: 0 } }])
```

#### Exclude \_id

```typescript
await User.aggregate([{ $project: { _id: 0, name: 1, email: 1 } }])
```

#### Compute New Fields

```typescript
await Sale.aggregate([
  {
    $project: {
      item: 1,
      revenue: { $multiply: ['$price', '$quantity'] }
    }
  }
])
```

---

### $sort - Sort Documents

Sort by one or more fields.

```typescript
// Sort ascending
await User.aggregate([{ $sort: { age: 1 } }])

// Sort descending
await User.aggregate([{ $sort: { createdAt: -1 } }])

// Sort by multiple fields
await User.aggregate([{ $sort: { country: 1, age: -1 } }])
```

---

### $limit - Limit Results

Limit the number of documents.

```typescript
// Get top 10
await Sale.aggregate([{ $sort: { revenue: -1 } }, { $limit: 10 }])
```

---

### $skip - Skip Results

Skip a number of documents (useful for pagination).

```typescript
// Skip first 20, get next 10 (page 3)
await User.aggregate([{ $sort: { createdAt: -1 } }, { $skip: 20 }, { $limit: 10 }])
```

---

### $count - Count Documents

Count documents passing through the pipeline.

```typescript
await User.aggregate([{ $match: { status: 'active' } }, { $count: 'activeUsers' }])

// Output: [{ activeUsers: 42 }]
```

---

### $unwind - Flatten Arrays

Deconstructs an array field, outputting one document per array element.

#### Basic Unwind

```typescript
// Document: { name: 'Alice', items: ['apple', 'banana'] }
await Order.aggregate([{ $unwind: '$items' }])

// Output: [
//   { name: 'Alice', items: 'apple' },
//   { name: 'Alice', items: 'banana' }
// ]
```

#### Preserve Empty Arrays

```typescript
await Order.aggregate([
  {
    $unwind: {
      path: '$items',
      preserveNullAndEmptyArrays: true
    }
  }
])

// Documents with empty arrays are preserved with items: null
```

#### Include Array Index

```typescript
await Order.aggregate([
  {
    $unwind: {
      path: '$items',
      includeArrayIndex: 'itemIndex'
    }
  }
])

// Output: [
//   { name: 'Alice', items: 'apple', itemIndex: 0 },
//   { name: 'Alice', items: 'banana', itemIndex: 1 }
// ]
```

---

### $lookup - Join Collections

Performs a left outer join with another collection.

```typescript
// Author collection
const Author = model('Author', authorSchema)
const Book = model('Book', bookSchema)

// Join books with authors
await Book.aggregate([
  {
    $lookup: {
      from: 'Author', // Collection to join
      localField: 'authorId', // Field in Book
      foreignField: '_id', // Field in Author
      as: 'authorInfo' // Output field (array)
    }
  }
])

// Output: [
//   {
//     title: 'Book1',
//     authorId: '...',
//     authorInfo: [{ _id: '...', name: 'Alice', ... }]
//   }
// ]
```

**Combined with $unwind:**

```typescript
await Book.aggregate([
  {
    $lookup: {
      from: 'Author',
      localField: 'authorId',
      foreignField: '_id',
      as: 'author'
    }
  },
  { $unwind: '$author' } // Convert array to single object
])

// Output: [
//   { title: 'Book1', authorId: '...', author: { _id: '...', name: 'Alice' } }
// ]
```

---

### $addFields - Add Fields

Adds new fields to documents without removing existing fields.

```typescript
await Sale.aggregate([
  {
    $addFields: {
      revenue: { $multiply: ['$price', '$quantity'] },
      discountedPrice: { $multiply: ['$price', 0.9] }
    }
  }
])

// Original fields preserved + new fields added
```

---

### $replaceRoot - Replace Root

Replaces the document root with a nested field.

```typescript
// Document: { name: 'Product', details: { price: 100, stock: 50 } }
await Product.aggregate([{ $replaceRoot: { newRoot: '$details' } }])

// Output: [{ price: 100, stock: 50 }]
```

---

### $sample - Random Sample

Randomly selects a specified number of documents.

```typescript
// Get 10 random users
await User.aggregate([{ $sample: { size: 10 } }])
```

---

### $bucket - Categorize into Buckets

Categorizes documents into buckets based on field values and boundaries.

```typescript
// Group sales by price ranges
await Sale.aggregate([
  {
    $bucket: {
      groupBy: '$price',
      boundaries: [0, 50, 100, 200, 500],
      default: 'Other',
      output: {
        count: { $sum: 1 },
        total: { $sum: '$price' },
        products: { $push: '$name' }
      }
    }
  }
])

// Result:
// [
//   { _id: 0, count: 5, total: 200, products: [...] },    // $0-$50
//   { _id: 50, count: 8, total: 650, products: [...] },   // $50-$100
//   { _id: 100, count: 3, total: 420, products: [...] },  // $100-$200
//   ...
// ]
```

**Parameters:**

- `groupBy`: Field expression to categorize by
- `boundaries`: Array of bucket boundaries (must be sorted)
- `default`: (Optional) Bucket name for values outside boundaries
- `output`: (Optional) Accumulator expressions for each bucket

---

### $bucketAuto - Automatic Bucketing

Automatically distributes documents into a specified number of buckets.

```typescript
// Automatically create 4 price buckets
await Product.aggregate([
  {
    $bucketAuto: {
      groupBy: '$price',
      buckets: 4,
      output: {
        count: { $sum: 1 },
        avgPrice: { $avg: '$price' }
      }
    }
  }
])

// With granularity for cleaner boundaries
await Product.aggregate([
  {
    $bucketAuto: {
      groupBy: '$price',
      buckets: 5,
      granularity: 'E12', // Use E12 Renard series for boundaries
      output: { count: { $sum: 1 } }
    }
  }
])
```

**Parameters:**

- `groupBy`: Field expression to categorize by
- `buckets`: Number of buckets to create
- `output`: (Optional) Accumulator expressions
- `granularity`: (Optional) Boundary calculation method (R5, R10, E6, E12, etc.)

---

### $facet - Multi-Pipeline Processing

Executes multiple aggregation pipelines in parallel on the same input documents.

```typescript
// Multi-dimensional faceted search
await Product.aggregate([
  { $match: { category: 'Electronics' } },
  {
    $facet: {
      // Price ranges
      priceRanges: [
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 100, 500, 1000, 5000],
            default: 'Luxury'
          }
        }
      ],

      // Brand distribution
      topBrands: [
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ],

      // Rating statistics
      ratingStats: [
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            minRating: { $min: '$rating' },
            maxRating: { $max: '$rating' }
          }
        }
      ]
    }
  }
])

// Result:
// [{
//   priceRanges: [{ _id: 0, count: 10 }, ...],
//   topBrands: [{ _id: 'Apple', count: 25 }, ...],
//   ratingStats: [{ avgRating: 4.2, minRating: 3.0, maxRating: 5.0 }]
// }]
```

Perfect for building faceted search UIs with multiple filters and aggregations in a single query.

---

### $out - Output to Collection

Writes the aggregation results to a collection, **replacing** its contents.

```typescript
// Create materialized view of daily sales summaries
await Sale.aggregate([
  {
    $group: {
      _id: {
        $dateToString: { format: '%Y-%m-%d', date: '$date' }
      },
      totalRevenue: { $sum: '$amount' },
      orderCount: { $sum: 1 }
    }
  },
  {
    $project: {
      date: '$_id',
      totalRevenue: 1,
      orderCount: 1,
      _id: 0
    }
  },
  { $out: 'DailySalesSummary' } // Replaces collection contents
])

// Returns empty array (per MongoDB spec)
// Data is now in DailySalesSummary collection
```

**⚠️ Warning:** `$out` **replaces** the entire target collection. Use `$merge` for incremental updates.

---

### $merge - Merge into Collection

Merges aggregation results into a collection with flexible upsert behavior.

```typescript
// Incremental analytics updates
await Sale.aggregate([
  { $match: { date: { $gte: yesterday } } },
  {
    $group: {
      _id: '$productId',
      dailySales: { $sum: '$amount' },
      orderCount: { $sum: 1 }
    }
  },
  {
    $merge: {
      into: 'ProductAnalytics',
      on: '_id', // Match on _id field
      whenMatched: 'merge', // Merge new fields with existing
      whenNotMatched: 'insert' // Insert if doesn't exist
    }
  }
])

// Advanced: Merge on custom fields
await User.aggregate([
  {
    $project: {
      email: 1,
      lastLogin: new Date(),
      loginCount: { $add: ['$loginCount', 1] }
    }
  },
  {
    $merge: {
      into: 'UserStats',
      on: 'email', // Match on email instead of _id
      whenMatched: 'replace', // Replace entire document
      whenNotMatched: 'insert'
    }
  }
])
```

**`whenMatched` options:**

- `replace` - Replace entire document
- `merge` - Merge new fields (keeps existing fields)
- `keepExisting` - Keep existing document unchanged
- `fail` - Throw error if document exists

**`whenNotMatched` options:**

- `insert` - Insert new document
- `discard` - Discard document
- `fail` - Throw error if document doesn't exist

---

## Accumulator Operators

Used in `$group` to aggregate values across grouped documents.

### $sum - Sum Values

```typescript
// Count documents
{
  $sum: 1
}

// Sum numeric values
{
  $sum: '$price'
}

// Sum computed values
{
  $sum: {
    $multiply: ['$price', '$quantity']
  }
}
```

### $avg - Average

```typescript
await Sale.aggregate([
  {
    $group: {
      _id: '$category',
      avgPrice: { $avg: '$price' }
    }
  }
])
```

### $min and $max

```typescript
await Sale.aggregate([
  {
    $group: {
      _id: '$category',
      minPrice: { $min: '$price' },
      maxPrice: { $max: '$price' }
    }
  }
])
```

### $first and $last

```typescript
// Get first and last item in each group
await Sale.aggregate([
  { $sort: { date: 1 } },
  {
    $group: {
      _id: '$category',
      firstSale: { $first: '$item' },
      lastSale: { $last: '$item' }
    }
  }
])
```

### $push - Collect into Array

```typescript
// Collect all items in each category
await Product.aggregate([
  {
    $group: {
      _id: '$category',
      items: { $push: '$name' }
    }
  }
])

// Push objects
await Sale.aggregate([
  {
    $group: {
      _id: '$region',
      sales: { $push: { item: '$item', price: '$price' } }
    }
  }
])
```

### $addToSet - Collect Unique Values

```typescript
// Get unique brands per category
await Product.aggregate([
  {
    $group: {
      _id: '$category',
      brands: { $addToSet: '$brand' }
    }
  }
])
```

---

### $stdDevPop - Population Standard Deviation 🆕

Calculates the population standard deviation of numeric values.

```typescript
await Sale.aggregate([
  {
    $group: {
      _id: '$category',
      avgPrice: { $avg: '$price' },
      stdDev: { $stdDevPop: '$price' },
      variance: { $stdDevSamp: '$price' } // Sample std dev
    }
  }
])
```

---

### $stdDevSamp - Sample Standard Deviation 🆕

Calculates the sample standard deviation (uses n-1 denominator).

```typescript
// Statistical analysis of test scores
await Score.aggregate([
  {
    $group: {
      _id: '$subject',
      mean: { $avg: '$score' },
      stdDev: { $stdDevSamp: '$score' }
    }
  }
])
```

---

### $mergeObjects - Merge Objects 🆕

Merges multiple objects into a single object.

```typescript
// Combine metadata from all documents
await User.aggregate([
  {
    $group: {
      _id: '$team',
      combinedMetadata: { $mergeObjects: '$metadata' }
    }
  }
])
// Later values override earlier ones
```

---

## Expression Operators

Used in `$project` and other stages to compute values.

### String Operators

#### $concat - Concatenate Strings

```typescript
{
  $project: {
    fullName: { $concat: ['$firstName', ' ', '$lastName'] },
    email: { $concat: ['$username', '@', '$domain'] }
  }
}
```

#### $toUpper and $toLower

```typescript
{
  $project: {
    upperName: { $toUpper: '$name' },
    lowerEmail: { $toLower: '$email' }
  }
}
```

#### $substr - Substring

```typescript
{
  $project: {
    shortDesc: {
      $substr: ['$description', 0, 100]
    }
  }
}
```

### Arithmetic Operators

#### $add, $subtract, $multiply, $divide

```typescript
{
  $project: {
    revenue: { $multiply: ['$price', '$quantity'] },
    profit: { $subtract: ['$revenue', '$cost'] },
    total: { $add: ['$subtotal', '$tax', '$shipping'] },
    unitPrice: { $divide: ['$total', '$quantity'] }
  }
}
```

### Conditional Operators

#### $cond - Conditional Expression

```typescript
{
  $project: {
    priceCategory: {
      $cond: [{ $gte: ['$price', 100] }, 'expensive', 'affordable']
    }
  }
}
```

#### $ifNull - Handle Null Values

```typescript
{
  $project: {
    displayName: {
      $ifNull: ['$nickname', '$name']
    }
  }
}
```

### Array Operators

#### $arrayElemAt - Get Array Element

```typescript
{
  $project: {
    firstItem: { $arrayElemAt: ['$items', 0] },
    lastItem: { $arrayElemAt: ['$items', -1] }
  }
}
```

#### $size - Array Length

```typescript
{
  $project: {
    itemCount: {
      $size: '$items'
    }
  }
}
```

---

## Real-World Examples

### Sales Analytics

```typescript
interface Sale {
  item: string
  price: number
  quantity: number
  category: string
  region: string
  date: Date
}

// Monthly sales report by category
const monthlySales = await Sale.aggregate([
  // Filter to current month
  {
    $match: {
      date: { $gte: startOfMonth, $lt: endOfMonth }
    }
  },
  // Calculate revenue per sale
  {
    $addFields: {
      revenue: { $multiply: ['$price', '$quantity'] }
    }
  },
  // Group by category
  {
    $group: {
      _id: '$category',
      totalRevenue: { $sum: '$revenue' },
      avgPrice: { $avg: '$price' },
      totalQuantity: { $sum: '$quantity' },
      salesCount: { $sum: 1 }
    }
  },
  // Sort by revenue
  { $sort: { totalRevenue: -1 } },
  // Top 10 categories
  { $limit: 10 }
])
```

### User Activity Report

```typescript
interface Activity {
  userId: string
  action: string
  timestamp: Date
  metadata: any
}

// Daily active users by action type
await Activity.aggregate([
  // Last 7 days
  {
    $match: {
      timestamp: { $gte: sevenDaysAgo }
    }
  },
  // Group by day and action
  {
    $group: {
      _id: {
        action: '$action',
        day: '$date' // Assuming date is extracted
      },
      uniqueUsers: { $addToSet: '$userId' }
    }
  },
  // Count unique users
  {
    $project: {
      action: '$_id.action',
      day: '$_id.day',
      userCount: { $size: '$uniqueUsers' }
    }
  },
  { $sort: { day: 1, action: 1 } }
])
```

### E-commerce Order Analysis

```typescript
interface Order {
  orderId: string
  customerId: string
  items: Array<{ productId: string; quantity: number; price: number }>
  status: string
  createdAt: Date
}

// Customer spending analysis
await Order.aggregate([
  // Only completed orders
  { $match: { status: 'completed' } },
  // Unwind items array
  { $unwind: '$items' },
  // Calculate item revenue
  {
    $addFields: {
      itemRevenue: { $multiply: ['$items.price', '$items.quantity'] }
    }
  },
  // Group by customer
  {
    $group: {
      _id: '$customerId',
      totalSpent: { $sum: '$itemRevenue' },
      orderCount: { $addToSet: '$orderId' },
      avgOrderValue: { $avg: '$itemRevenue' }
    }
  },
  // Calculate actual order count
  {
    $project: {
      customerId: '$_id',
      totalSpent: 1,
      orderCount: { $size: '$orderCount' },
      avgOrderValue: 1
    }
  },
  // Sort by total spent
  { $sort: { totalSpent: -1 } },
  // Top 100 customers
  { $limit: 100 }
])
```

### Blog Post Analytics with $lookup

```typescript
interface Post {
  title: string
  authorId: string
  views: number
  likes: number
}

interface Author {
  name: string
  email: string
}

// Posts with author information
await Post.aggregate([
  // Join with authors
  {
    $lookup: {
      from: 'Author',
      localField: 'authorId',
      foreignField: '_id',
      as: 'author'
    }
  },
  // Convert author array to object
  { $unwind: '$author' },
  // Add engagement score
  {
    $addFields: {
      engagementScore: { $add: ['$views', { $multiply: ['$likes', 10] }] }
    }
  },
  // Select fields
  {
    $project: {
      title: 1,
      authorName: '$author.name',
      engagementScore: 1
    }
  },
  // Sort by engagement
  { $sort: { engagementScore: -1 } }
])
```

### Tag Distribution

```typescript
interface Article {
  title: string
  tags: string[]
  publishedAt: Date
}

// Most popular tags
await Article.aggregate([
  // Only published articles
  { $match: { publishedAt: { $ne: null } } },
  // Unwind tags array
  { $unwind: '$tags' },
  // Group by tag
  {
    $group: {
      _id: '$tags',
      count: { $sum: 1 },
      articles: { $push: '$title' }
    }
  },
  // Sort by count
  { $sort: { count: -1 } },
  // Top 20 tags
  { $limit: 20 }
])
```

---

## Date Operators 🆕

### Date Extraction

Extract components from dates for grouping and analysis.

```typescript
await Order.aggregate([
  {
    $project: {
      year: { $year: '$orderDate' },
      month: { $month: '$orderDate' },
      dayOfMonth: { $dayOfMonth: '$orderDate' },
      dayOfWeek: { $dayOfWeek: '$orderDate' },
      hour: { $hour: '$orderDate' },
      week: { $week: '$orderDate' }
    }
  }
])
```

**Available:** `$year`, `$month`, `$dayOfMonth`, `$dayOfWeek`, `$dayOfYear`, `$hour`, `$minute`, `$second`, `$millisecond`, `$week`, `$isoWeek`, `$isoWeekYear`

### Date Formatting

```typescript
// Format dates for display
{
  $project: {
    formattedDate: {
      $dateToString: {
        date: '$orderDate',
        format: '%Y-%m-%d %H:%M:%S'
      }
    }
  }
}
// Format specifiers: %Y (year), %m (month), %d (day), %H (hour), %M (minute), %S (second)
```

### Date Arithmetic

```typescript
// Add/subtract time from dates
{
  $project: {
    expiryDate: {
      $dateAdd: {
        startDate: '$createdAt',
        unit: 'day',
        amount: 30
      }
    },
    daysSinceOrder: {
      $dateDiff: {
        startDate: '$orderDate',
        endDate: new Date(),
        unit: 'day'
      }
    }
  }
}
// Units: 'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond'
```

---

## String Operators 🆕

### String Manipulation

```typescript
{
  $project: {
    // Split strings
    tags: { $split: ['$tagString', ','] },

    // Trim whitespace
    cleanName: { $trim: { input: '$name' } },

    // Replace text
    sanitized: { $replaceAll: { input: '$text', find: 'bad', replacement: '***' } },

    // String length (Unicode-aware)
    length: { $strLenCP: '$content' },

    // Find substring
    position: { $indexOfCP: ['$text', 'search'] }
  }
}
```

**Available:** `$split`, `$trim`, `$ltrim`, `$rtrim`, `$replaceOne`, `$replaceAll`, `$strLenCP`, `$indexOfCP`, `$strcasecmp`

---

## Array Operators 🆕

### Array Transformation

```typescript
{
  $project: {
    // Filter arrays
    highScores: {
      $filter: {
        input: '$scores',
        as: 'score',
        cond: { $gte: ['$$score', 80] }
      }
    },

    // Transform arrays
    doubled: {
      $map: {
        input: '$numbers',
        as: 'num',
        in: { $multiply: ['$$num', 2] }
      }
    },

    // Reduce arrays
    total: {
      $reduce: {
        input: '$items',
        initialValue: 0,
        in: { $add: ['$$value', '$$this'] }
      }
    },

    // Concatenate arrays
    combined: { $concatArrays: ['$array1', '$array2'] },

    // Slice arrays
    first5: { $slice: ['$items', 5] },

    // Sort arrays of objects
    sortedProducts: {
      $sortArray: {
        input: '$products',
        sortBy: { price: 1 }
      }
    }
  }
}
```

**Available:** `$filter`, `$map`, `$reduce`, `$concatArrays`, `$slice`, `$zip`, `$reverseArray`, `$sortArray`, `$in`, `$indexOfArray`

---

## Type Conversion Operators 🆕

### Type Conversions

```typescript
{
  $project: {
    // Convert to string
    priceStr: { $toString: '$price' },

    // Convert to numbers
    quantity: { $toInt: '$quantityStr' },  // Truncates decimals
    amount: { $toDouble: '$amountStr' },

    // Convert to date
    parsedDate: { $toDate: '$dateString' },

    // Convert to boolean
    isActive: { $toBool: '$status' },

    // Get BSON type
    fieldType: { $type: '$value' }
  }
}
```

### Advanced Conversion with Error Handling

```typescript
{
  $project: {
    safeNumber: {
      $convert: {
        input: '$input',
        to: 'int',
        onError: 0,        // Use 0 if conversion fails
        onNull: -1         // Use -1 if value is null
      }
    }
  }
}
```

**Available:** `$toString`, `$toInt`, `$toLong`, `$toDouble`, `$toDecimal`, `$toDate`, `$toBool`, `$toObjectId`, `$convert`, `$type`

---

## Conditional Operators 🆕

### $switch - Multi-Branch Conditional

Replaces nested `$cond` chains with cleaner switch-case logic.

```typescript
{
  $project: {
    grade: {
      $switch: {
        branches: [
          { case: { $gte: ['$score', 90] }, then: 'A' },
          { case: { $gte: ['$score', 80] }, then: 'B' },
          { case: { $gte: ['$score', 70] }, then: 'C' },
          { case: { $gte: ['$score', 60] }, then: 'D' }
        ],
        default: 'F'
      }
    },

    status: {
      $switch: {
        branches: [
          { case: { $eq: ['$state', 'pending'] }, then: 'Waiting' },
          { case: { $eq: ['$state', 'processing'] }, then: 'In Progress' },
          { case: { $eq: ['$state', 'completed'] }, then: 'Done' }
        ],
        default: 'Unknown'
      }
    }
  }
}
```

---

## Object Operators 🆕

### Object Manipulation

```typescript
{
  $project: {
    // Merge multiple objects
    combined: {
      $mergeObjects: [
        '$profile',
        '$settings',
        { lastUpdated: new Date() }
      ]
    },

    // Convert object to array of key-value pairs
    pairs: { $objectToArray: '$metadata' },
    // Result: [{ k: 'key1', v: 'value1' }, { k: 'key2', v: 'value2' }]

    // Convert array to object
    obj: { $arrayToObject: '$pairs' }
    // Result: { key1: 'value1', key2: 'value2' }
  }
}
```

**Use Cases:**

- Dynamically reshape documents
- Merge configuration objects
- Convert between object and array representations

---

## Performance Tips

### 1. Filter Early with $match

Place `$match` as early as possible to reduce the number of documents processed by subsequent stages.

```typescript
// Good - filter first
await Sale.aggregate([
  { $match: { status: 'completed' } },  // Reduces dataset
  { $group: { ... } }
])

// Less efficient - filter after grouping
await Sale.aggregate([
  { $group: { ... } },
  { $match: { total: { $gte: 100 } } }
])
```

### 2. Use Indexes

**Automatic Optimization**: Memgoose automatically uses indexes when `$match` is the **first stage** in the pipeline! This optimization significantly improves query performance.

Ensure fields used in early `$match` stages are indexed.

```typescript
saleSchema.index('status')  // Create index
saleSchema.index('date')

// ✅ Automatically uses indexes - $match is first stage!
await Sale.aggregate([
  { $match: { status: 'completed', date: { $gte: yesterday } } },
  { $group: { _id: '$category', total: { $sum: '$amount' } } }
  // ... other stages
])

// ⚠️ Index NOT used - $match is after $project
await Sale.aggregate([
  { $project: { ... } },
  { $match: { status: 'completed' } }  // No index optimization here
])
```

**How it works**: When `$match` is the first stage, memgoose uses `Model.find()` with the match query, which automatically leverages all available indexes. This is the same optimization that MongoDB uses.

### 3. Project Only Needed Fields

Use `$project` to reduce document size before expensive operations.

```typescript
await User.aggregate([
  { $match: { active: true } },
  { $project: { name: 1, age: 1, city: 1 } },  // Drop unused fields
  { $group: { ... } }
])
```

### 4. Limit Early When Possible

If you only need top N results, limit before sorting can be more efficient.

```typescript
// For top 10, sorting fewer documents is faster
await Sale.aggregate([
  { $match: { category: 'electronics' } },
  { $sort: { price: -1 } },
  { $limit: 10 } // Only need 10, so sorting is faster
])
```

### 5. Avoid Unnecessary $unwind

`$unwind` can multiply document count. Use it only when needed.

```typescript
// If you don't need individual array elements, don't unwind
await Order.aggregate([
  {
    $group: {
      _id: '$customerId',
      itemCount: { $sum: { $size: '$items' } } // No unwind needed
    }
  }
])
```

---

## Common Patterns

### Pagination with Total Count

```typescript
// Get page of results AND total count
const page = 2
const pageSize = 10

const results = await User.aggregate([
  { $match: { status: 'active' } },
  {
    $facet: {
      metadata: [{ $count: 'total' }],
      data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }]
    }
  }
])

const total = results[0].metadata[0]?.total || 0
const users = results[0].data
```

### Top N by Group

```typescript
// Top 3 products in each category by sales
await Product.aggregate([
  { $sort: { category: 1, sales: -1 } },
  {
    $group: {
      _id: '$category',
      products: { $push: '$$ROOT' }
    }
  },
  {
    $project: {
      category: '$_id',
      topProducts: { $slice: ['$products', 3] }
    }
  }
])
```

### Running Totals

```typescript
// Calculate running total of sales
await Sale.aggregate([
  { $sort: { date: 1 } },
  {
    $group: {
      _id: null,
      sales: { $push: { date: '$date', amount: '$amount' } }
    }
  }
  // Note: Running sum would need custom accumulator or post-processing
])
```

---

## Error Handling

```typescript
try {
  const results = await Model.aggregate([
    { $group: { _id: '$category' } },
    { $unknownStage: {} } // Invalid stage
  ])
} catch (error) {
  console.error('Aggregation error:', error.message)
  // "Unknown aggregation stage: $unknownStage"
}
```

---

## Differences from MongoDB

memgoose aims for MongoDB compatibility but has some differences:

### Not Yet Supported

- `$graphLookup` - Recursive lookup
- `$redact` - Document redaction
- Text search stages (`$text`, `$search`)
- `$geoNear` - Geospatial queries
- `$collStats` - Collection statistics
- Complex nested pipeline expressions in `$lookup`

### memgoose Specific

- Aggregation is performed in-memory after loading documents
- All stages work uniformly across storage backends
- Automatic index optimization when `$match` is the first stage

---

## See Also

- [Queries Guide](QUERIES.md) - Query operators and filtering
- [Advanced Features](ADVANCED.md) - Populate, hooks, virtuals
- [API Reference](API.md) - Complete API documentation
- [Performance Guide](PERFORMANCE.md) - Optimization tips
