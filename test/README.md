# volatile.sh Test Suite

This document describes the test coverage for the volatile.sh project.

## Backend Tests (test/)

All backend tests use Node.js's built-in `node:test` runner.

### Test Files

| File                     | Description                                | Tests |
| ------------------------ | ------------------------------------------ | ----- |
| `worker.test.js`         | Main worker API tests                      | 5     |
| `security.test.js`       | Security, encryption, rate limiting, CORS  | 29    |
| `performance.test.js`    | Response times, throughput, benchmarks     | 12    |
| `integration.test.js`    | End-to-end flows, error recovery           | 10    |
| `concurrency.test.js`    | Concurrent request handling, deduplication | 13    |
| `cache.test.js`          | LRU cache implementation                   | 16    |
| `circuitBreaker.test.js` | Circuit breaker pattern                    | 13    |
| `payload.test.js`        | Payload size and validation                | 6     |

### Total Backend Tests: 104

## Running Tests

```bash
# Run all backend tests
npm test

# Run only backend tests (skip frontend build)
npm run test:backend

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

## Test Coverage

### Backend Coverage

- **Secrets API**: Create, read, expiration, deletion
- **Rate Limiting**: Per-IP limits, windowed counting, cache efficiency
- **Security**: Encryption, CORS, IP blacklist, request validation
- **Performance**: Response times, DO access latency, crypto benchmarks
- **Concurrency**: Deduplication, race conditions, concurrent requests
- **Caching**: LRU cache, TTL, eviction
- **Circuit Breaker**: Open/half-open/closed states, failure handling
- **Edge Cases**: Large payloads, special characters, unicode

### Frontend Coverage (volatile.sh-front.sh/test/)

| File                  | Description                            |
| --------------------- | -------------------------------------- |
| `CreateView.test.tsx` | Secret creation component tests        |
| `ReadView.test.tsx`   | Secret reading/burning component tests |
| `Toast.test.tsx`      | Toast notification component tests     |
| `crypto.test.ts`      | Client-side encryption utilities       |
| `api.test.ts`         | API client tests                       |

### Running Frontend Tests

```bash
# From the frontend directory
cd volatile.sh-front.sh
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Test Scripts Reference

| Script                  | Description                                 |
| ----------------------- | ------------------------------------------- |
| `npm test`              | Run all backend tests (with frontend build) |
| `npm run test:backend`  | Run only backend tests                      |
| `npm run test:frontend` | Run only frontend tests                     |
| `npm run test:coverage` | Run backend tests with coverage report      |
| `npm run test:watch`    | Watch mode for backend tests                |

## CI/CD

Tests run automatically in GitHub Actions via `.github/workflows/test.yml`.
