# Using memgoose as a Drop-in Replacement for Mongoose in Tests

memgoose can be used as a complete drop-in replacement for Mongoose in your test suite. This allows you to run tests against an in-memory database without needing a real MongoDB instance.

## Basic Setup with Vitest

Mock mongoose to use memgoose in your test files:

```typescript
import { vi, describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import { connect, disconnect, dropDatabase } from 'memgoose'

// Replace mongoose with memgoose - one line is all you need
vi.mock('mongoose', () => import('memgoose'))

// Your imports that use mongoose will now use memgoose
import { User } from '../src/models/user.js'

describe('User tests', () => {
  beforeAll(() => {
    connect({ storage: 'memory' })
  })

  afterAll(() => {
    disconnect()
  })

  beforeEach(async () => {
    await dropDatabase()
  })

  it('creates a user', async () => {
    const user = await User.create({ name: 'John', email: 'john@example.com' })
    expect(user.name).toBe('John')
  })
})
```

## Setup with Jest

```javascript
// In your test file or setupFilesAfterEnv
jest.mock('mongoose', () => require('memgoose'))
```

Then use the same `beforeAll`/`afterAll`/`beforeEach` pattern as shown above.

## Example: Testing an Express/Fastify App

```typescript
import { vi, describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import { connect, disconnect, dropDatabase } from 'memgoose'

// Mock mongoose before importing your app
vi.mock('mongoose', () => import('memgoose'))

import { buildApp } from '../src/app.js'

describe('API tests', () => {
  let app

  beforeAll(async () => {
    connect({ storage: 'memory' })
    app = await buildApp()
  })

  afterAll(() => {
    disconnect()
  })

  beforeEach(async () => {
    await dropDatabase()
  })

  it('creates a resource', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { name: 'John' }
    })
    expect(response.statusCode).toBe(201)
  })
})
```

## Test Isolation with dropDatabase()

The `dropDatabase()` function clears all data from all models. Using it in `beforeEach` ensures each test starts with a clean state:

```typescript
import { dropDatabase } from 'memgoose'

beforeEach(async () => {
  await dropDatabase()
})
```

## Performance Benefits

memgoose runs entirely in-memory, making tests significantly faster than using a real MongoDB instance:

- **No connection overhead**: No network latency or connection pool management
- **Instant operations**: All operations are in-memory
- **Fast cleanup**: `dropDatabase()` is nearly instantaneous
- **No external dependencies**: No MongoDB server to start/stop

## Tips for Migration

1. **Mock early**: Place `vi.mock()` or `jest.mock()` calls at the top of your test file, before any imports that use mongoose.

2. **Use the same patterns**: Your existing Mongoose code should work as-is. memgoose supports the same Schema, model, and query patterns.

3. **Check for unsupported features**: While memgoose covers most common use cases, some advanced MongoDB features may not be implemented. Check the [API Reference](./API.md) for details.

4. **Gradual migration**: You can migrate test files one at a time. Each file can independently mock mongoose.

## See Also

- [Getting Started](./GETTING_STARTED.md) - Installation and basic usage
- [API Reference](./API.md) - Complete API documentation
- [Schemas](./SCHEMAS.md) - Schema definition and validation
