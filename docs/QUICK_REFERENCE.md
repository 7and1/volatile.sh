# volatile.sh Quick Reference

A quick reference guide for developers working on volatile.sh.

## Commands

### Development

```bash
# Install dependencies
npm install

# Start local development server
npm run dev -- --local --port 8787

# Build frontend
npm run build:front

# Deploy to Cloudflare
npm run deploy

# View real-time logs
npm run tail
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Wrangler

```bash
# Login to Cloudflare
wrangler login

# View account info
wrangler whoami

# Tail logs
wrangler tail volatile-sh

# Deploy specific environment
wrangler deploy --env production
```

## File Structure

```
volatile.sh/
├── src/
│   ├── index.js              # Entry point
│   ├── worker.js             # Router
│   ├── api.js                # API handlers
│   ├── constants.js          # Config
│   ├── http.js               # HTTP utils
│   ├── security.js           # Security
│   ├── monitoring.js         # Logging
│   ├── cache.js              # Cache
│   ├── circuitBreaker.js     # Circuit breaker
│   ├── deduplication.js      # Deduplication
│   ├── cryptoId.js           # ID generation
│   ├── cors.js               # CORS
│   ├── ip.js                 # IP extraction
│   └── do/
│       ├── SecretStore.js    # Secret DO
│       └── RateLimiter.js    # Rate limit DO
├── test/                     # Tests
├── dist/                     # Built frontend
└── volatile.sh-front.sh/     # Frontend source
```

## API Endpoints

| Method | Endpoint                    | Description        |
| ------ | --------------------------- | ------------------ |
| GET    | `/api/health`               | Health check       |
| POST   | `/api/secrets`              | Create secret      |
| GET    | `/api/secrets/:id`          | Read/delete secret |
| GET    | `/.well-known/security.txt` | Security info      |

## Configuration

### Environment Variables

| Variable                       | Default                | Description    |
| ------------------------------ | ---------------------- | -------------- |
| `ALLOWED_ORIGINS`              | `*`                    | CORS origins   |
| `RATE_LIMIT_CREATE_PER_WINDOW` | 100                    | Creates/hour   |
| `RATE_LIMIT_READ_PER_WINDOW`   | 1000                   | Reads/hour     |
| `SECURITY_CONTACT`             | `security@volatile.sh` | Security email |

### Constants (src/constants.js)

```javascript
TTL.MIN_MS = 300000; // 5 minutes
TTL.MAX_MS = 604800000; // 7 days
RATE_LIMIT.SHARDS = 256; // Rate limiter shards
LIMITS.ENCRYPTED_MAX_CHARS = 1400000; // ~1MB
```

## Error Codes

| Code                  | Status | Description             |
| --------------------- | ------ | ----------------------- |
| `MISSING_FIELDS`      | 400    | Required fields missing |
| `INVALID_ENCODING`    | 400    | Invalid base64url       |
| `INVALID_IV_LENGTH`   | 400    | IV must be 12 bytes     |
| `INVALID_ID`          | 400    | Invalid ID format       |
| `SECRET_TOO_LARGE`    | 413    | Secret exceeds max size |
| `CORS_FORBIDDEN`      | 403    | Origin not allowed      |
| `RATE_LIMITED`        | 429    | Rate limit exceeded     |
| `NOT_FOUND`           | 404    | Resource not found      |
| `SERVICE_UNAVAILABLE` | 503    | Circuit breaker open    |

## Rate Limits

| Operation | Limit | Window |
| --------- | ----- | ------ |
| Create    | 100   | 1 hour |
| Read      | 1000  | 1 hour |

## Security

### Encryption

- Algorithm: AES-256-GCM
- Key size: 256 bits
- IV: 12 bytes
- Mode: Client-side only

### Headers

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'none'`
- `Strict-Transport-Security: max-age=31536000`

## Testing

### Test Structure

```javascript
import test from "node:test";
import assert from "node:assert/strict";

test("test name", async () => {
  const result = await functionUnderTest();
  assert.equal(result, expected);
});
```

### Clearing State Between Tests

```javascript
import { clearInflight } from "../src/deduplication.js";
import { rateLimitCache } from "../src/cache.js";

test("isolated test", async () => {
  clearInflight();
  rateLimitCache.clear();
  // ... test
});
```

## Common Tasks

### Add New API Endpoint

1. Add route in `src/api.js`
2. Implement handler function
3. Add tests in `test/`
4. Update `API.md`

### Modify Rate Limits

1. Edit `src/constants.js`
2. Update tests to match new limits
3. Redeploy

### Add Durable Object

1. Create class in `src/do/`
2. Export from `src/index.js`
3. Add binding in `wrangler.toml`
4. Add migration tag

### Debug Request

```javascript
import { log } from "./monitoring.js";

log("info", "Debug message", {
  requestId: requestContext.requestId,
  customData: value,
});
```

## URLs

| Resource  | URL                                               |
| --------- | ------------------------------------------------- |
| Live site | https://volatile.sh                               |
| GitHub    | https://github.com/residentialproxies/volatile.sh |
| Docs      | https://volatile.sh/docs.html                     |
| Privacy   | https://volatile.sh/privacy.html                  |
| Terms     | https://volatile.sh/terms.html                    |

## Support

| Issue Type | Contact              |
| ---------- | -------------------- |
| Bugs       | GitHub Issues        |
| Features   | GitHub Discussions   |
| Security   | security@volatile.sh |
| Legal      | legal@volatile.sh    |
| General    | support@volatile.sh  |

---

**For detailed documentation, see:**

- [README.md](../README.md) - Overview
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Development guide
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Deployment guide
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [API.md](../API.md) - API reference
