# Development Guide

This guide covers setting up a local development environment for volatile.sh.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Code Structure](#code-structure)
- [Running Tests](#running-tests)
- [Debugging](#debugging)
- [Frontend Development](#frontend-development)
- [Backend Development](#backend-development)
- [Common Development Tasks](#common-development-tasks)

## Prerequisites

- **Node.js 18+** - Download from https://nodejs.org/
- **npm 9+** - Comes with Node.js
- **Git** - For version control

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/residentialproxies/volatile.sh.git
cd volatile.sh
```

### 2. Install Dependencies

```bash
npm install
```

This installs both backend and frontend dependencies.

### 3. Create Configuration File

```bash
cp wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml` and add your Cloudflare Account ID:

```toml
account_id = "YOUR_ACCOUNT_ID_HERE"
```

Get your Account ID from:

- Cloudflare Dashboard (right sidebar)
- Or run: `wrangler whoami`

### 4. Start Development Server

```bash
npm run dev -- --local --port 8787
```

The `--local` flag runs the worker locally using Miniflare instead of connecting to Cloudflare.

Visit http://localhost:8787 to access the application.

## Code Structure

```
volatile.sh/
├── src/                      # Backend source code
│   ├── index.js             # Worker entry point, request handling
│   ├── worker.js            # Main request router
│   ├── api.js               # API endpoint handlers
│   ├── constants.js         # Configuration constants
│   ├── cors.js              # CORS utilities
│   ├── cryptoId.js          # Cryptographic ID generation
│   ├── http.js              # HTTP utilities
│   ├── ip.js                # IP address extraction
│   ├── rateLimit.js         # Rate limiting logic
│   ├── cache.js             # In-memory caching
│   ├── circuitBreaker.js    # Circuit breaker pattern
│   ├── deduplication.js     # Request deduplication
│   ├── monitoring.js        # Logging and metrics
│   ├── security.js          # Security middleware
│   └── do/                  # Durable Objects
│       ├── SecretStore.js   # Secret storage DO
│       └── RateLimiter.js   # Rate limiting DO
├── test/                    # Backend tests
│   ├── worker.test.js       # Main integration tests
│   ├── cache.test.js        # Cache tests
│   ├── circuitBreaker.test.js
│   ├── concurrency.test.js
│   ├── integration.test.js
│   ├── payload.test.js
│   ├── performance.test.js
│   └── security.test.js
├── dist/                    # Built frontend (served by worker)
├── volatile.sh-front.sh/    # Frontend React application
│   ├── components/          # React components
│   ├── utils/               # Frontend utilities
│   ├── index.html           # HTML template
│   └── index.css            # Styles
├── wrangler.toml.example    # Configuration template
└── package.json             # Backend dependencies and scripts
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

Coverage reports are generated in:

- Terminal output
- `coverage/index.html` - HTML report
- `coverage/lcov.info` - LCOV format for CI

### Test Categories

| Test File                | Purpose                            |
| ------------------------ | ---------------------------------- |
| `worker.test.js`         | Main API integration tests         |
| `cache.test.js`          | In-memory cache behavior           |
| `circuitBreaker.test.js` | Circuit breaker pattern            |
| `concurrency.test.js`    | Concurrent request handling        |
| `integration.test.js`    | End-to-end workflows               |
| `payload.test.js`        | Payload size and format validation |
| `performance.test.js`    | Performance benchmarks             |
| `security.test.js`       | Security controls                  |

## Debugging

### Using Chrome DevTools

When running locally, you can debug using Chrome DevTools:

1. Start the dev server with inspect enabled:

   ```bash
   wrangler dev --local --inspect
   ```

2. In Chrome, visit `chrome://inspect`
3. Click "Inspect" on the Worker process

### Using Console.log

The project includes a structured logging utility:

```javascript
import { log } from "./monitoring.js";

log("info", "Something happened", {
  secretId: id,
  action: "created",
});
```

Logs appear in the terminal when running `npm run dev`.

### Using Wrangler Tail

For remote debugging on deployed workers:

```bash
npm run tail
```

This shows real-time logs from production.

### Debugging Durable Objects

To debug Durable Objects specifically:

```bash
wrangler tail --format pretty --status
```

## Frontend Development

The frontend is a React + Vite application in `volatile.sh-front.sh/`.

### Frontend Development Server

```bash
cd volatile.sh-front.sh
npm run dev
```

The frontend dev server runs on http://localhost:5173

### Build Frontend

```bash
npm run build:front
```

This builds the frontend into `dist/` which is served by the Worker.

### Frontend File Structure

```
volatile.sh-front.sh/
├── App.tsx                 # Main React component
├── index.html              # HTML entry point
├── index.css               # Global styles
├── components/
│   ├── CreateView.tsx      # Secret creation UI
│   ├── ReadView.tsx        # Secret reading UI
│   ├── Loading.tsx         # Loading spinner
│   ├── Toast.tsx           # Toast notifications
│   └── TerminalButton.tsx  # Terminal-style button
└── utils/
    └── api.ts              # API client functions
```

### Frontend Environment

The frontend uses Vite for development. Environment variables can be set in `.env` files:

```
# volatile.sh-front.sh/.env.development
VITE_API_URL=http://localhost:8787
```

## Backend Development

### Adding a New API Endpoint

1. Add the route handler in `src/api.js`:

```javascript
if (url.pathname === "/api/newendpoint" && request.method === "POST") {
  return createNewEndpoint(request, env);
}
```

2. Implement the handler function:

```javascript
async function createNewEndpoint(request, env) {
  // Your logic here
  return json({ ok: true }, { status: 200 });
}
```

3. Add tests in `test/worker.test.js` or create a new test file.

### Modifying Constants

Edit `src/constants.js` to change:

- TTL limits
- Rate limits
- Payload sizes
- Circuit breaker thresholds

### Adding a New Durable Object

1. Create the class in `src/do/`:

```javascript
// src/do/NewObject.js
export class NewObject {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    // Handle requests
  }
}
```

2. Export in `src/index.js`:

```javascript
export { SecretStore, RateLimiter, NewObject };
```

3. Add binding in `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "NEW_OBJECT"
class_name = "NewObject"

[[migrations]]
tag = "v3"
new_classes = ["NewObject"]
```

## Common Development Tasks

### Testing Rate Limiting

The test suite includes rate limiting tests. To test manually:

```bash
curl -X POST http://localhost:8787/api/secrets \
  -H "Content-Type: application/json" \
  -d '{"encrypted":"test","iv":"test123456789012","ttl":3600000}'
```

Run this multiple times to trigger rate limits.

### Testing Zero-Knowledge Encryption

The encryption happens entirely client-side. To test:

1. Open browser DevTools Console
2. Create a secret on the frontend
3. Inspect the network request - only encrypted data is sent

### Testing Durable Object Storage

To inspect Durable Object state in production:

1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Select your worker
4. Click "Durable Objects"
5. View object instances and storage

### Profiling Performance

Use the built-in metrics:

```javascript
import { MetricsCollector } from "./monitoring.js";

const metrics = new MetricsCollector();
metrics.timing("operation.duration", duration);
metrics.increment("operation.count", 1);
metrics.flush(); // Send to logs
```

## Development Tips

### Hot Reloading

When using `npm run dev`, the worker should auto-reload on file changes. If it doesn't:

1. Check the terminal for errors
2. Restart the dev server
3. Clear the Miniflare cache: `rm -rf .wrangler`

### Testing CORS Locally

When testing CORS, make sure to include the Origin header:

```bash
curl -X GET http://localhost:8787/api/health \
  -H "Origin: http://localhost:8787"
```

### Clearing Rate Limits

To reset rate limits during development:

1. Restart the dev server (this clears in-memory state)
2. Or use a different IP via the `CF-Connecting-IP` header

### IDE Configuration

For VS Code, recommended extensions:

- `esbenp.prettier-vscode` - Code formatting
- `dbaeumer.vscode-eslint` - Linting
- `bradlc.vscode-tailwindcss` - Tailwind IntelliSense

## Contributing

Before contributing code:

1. Run tests: `npm test`
2. Format code: `npm run format` (if configured)
3. Build frontend: `npm run build:front`
4. Ensure all tests pass

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution guidelines.
