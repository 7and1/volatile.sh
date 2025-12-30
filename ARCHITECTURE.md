# Architecture Documentation

This document describes the architecture of volatile.sh, a zero-knowledge secret sharing service built on Cloudflare Workers.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Data Flow](#data-flow)
- [Technology Stack](#technology-stack)
- [Component Design](#component-design)
- [Security Architecture](#security-architecture)
- [Scalability Design](#scalability-design)
- [Reliability Features](#reliability-features)

## Overview

volatile.sh is designed around the principle of **zero-knowledge architecture**: the server never has access to plaintext secrets. All encryption happens client-side before data leaves the user's browser.

### Key Principles

1. **Zero-Knowledge**: Server only stores encrypted ciphertext
2. **Ephemeral**: Secrets deleted immediately after first read
3. **Global**: Deployed on Cloudflare's edge network
4. **Resilient**: Circuit breakers and deduplication for reliability
5. **Simple**: No accounts, no databases, minimal dependencies

## System Architecture

```
                    +-------------------+
                    |   User Browser    |
                    +-------------------+
                            |
                            | 1. Encrypt (AES-256-GCM)
                            |    Key in URL fragment
                            |
                    +-------------------+
                    |  Cloudflare Worker |
                    |     (Entry Point)  |
                    +-------------------+
                            |
            +---------------+---------------+
            |               |               |
    +-------+-------+ +-----+------+ +-----+------+
    |  Secret Store | |Rate Limiter| |   Cache    |
    | (Durable Obj) | |(Durable Obj| |  (Memory)  |
    +---------------+ +------------+ +------------+
            |                   |
            v                   v
    +---------------+ +-------------------+
    | Encrypted     | | Rate Limit State |
    | Secrets       | | (Per IP Shard)    |
    +---------------+ +-------------------+
```

### Request Flow

1. **Client** generates AES-256-GCM key and IV
2. **Client** encrypts secret locally
3. **Client** sends ciphertext + IV to Worker
4. **Worker** validates request (rate limits, security)
5. **SecretStore DO** stores encrypted data
6. **Client** shares URL with decryption key in fragment
7. **Recipient** opens URL, decrypts locally
8. **SecretStore DO** atomically deletes secret

## Technology Stack

| Component  | Technology                   | Purpose                          |
| ---------- | ---------------------------- | -------------------------------- |
| Runtime    | Cloudflare Workers           | Edge compute platform            |
| Storage    | Cloudflare Durable Objects   | Strongly consistent storage      |
| Frontend   | React + Vite                 | User interface                   |
| Encryption | Web Crypto API (AES-256-GCM) | Client-side encryption           |
| Testing    | Miniflare + Node.js          | Local testing framework          |
| Deployment | Wrangler CLI                 | Cloudflare deployment tool       |
| CI/CD      | GitHub Actions               | Automated testing and deployment |

### Why Cloudflare Workers?

- **Global Edge Deployment**: 300+ locations worldwide
- **Durable Objects**: Strongly consistent storage with atomic transactions
- **Free Tier**: Generous limits for small applications
- **Fast Cold Starts**: Minimal latency
- **Integrated Security**: Built-in DDoS protection

### Why Durable Objects?

- **Strong Consistency**: ACID transactions prevent race conditions
- **Coordinated Storage**: Perfect for "burn after reading" semantics
- **Auto-Scaling**: Handles load automatically
- **Global Access**: Low-latency access from anywhere

## Component Design

### Worker Entry Point (`src/index.js`)

Main entry point that:

- Creates request context with unique ID
- Validates security (request size, headers, method)
- Checks IP blacklist
- Delegates to worker handler
- Captures errors and metrics
- Adds tracking headers

```javascript
export default {
  async fetch(request, env, ctx) {
    // Security validation
    validateRequest(request);

    // Check blacklist
    if (isBlacklisted(clientIp)) {
      return FORBIDDEN;
    }

    // Handle request
    const response = await handleRequest(request, env, ctx);

    // Record metrics
    metrics.record(response);

    return response;
  },
};
```

### API Handler (`src/api.js`)

Routes API requests to appropriate handlers:

| Endpoint           | Method | Purpose       |
| ------------------ | ------ | ------------- |
| `/api/health`      | GET    | Health check  |
| `/api/secrets`     | POST   | Create secret |
| `/api/secrets/:id` | GET    | Read secret   |

### SecretStore Durable Object (`src/do/SecretStore.js`)

Manages encrypted secret storage with atomic delete-on-read:

```javascript
async read() {
  return await this.storage.transaction(async (txn) => {
    const secret = await txn.get("secret");
    if (!secret) return NOT_FOUND;

    await txn.delete("secret");  // Atomic delete
    return { encrypted: secret.encrypted, iv: secret.iv };
  });
}
```

**Key Features**:

- Transactional storage prevents race conditions
- Alarm auto-deletes expired secrets
- Collision detection for ID generation

### RateLimiter Durable Object (`src/do/RateLimiter.js`)

Distributed rate limiting across 256 shards:

```javascript
async check(request) {
  const { key, limit, windowMs } = await request.json();

  const entry = await this.storage.get(key);
  const count = entry?.count || 0;
  const resetAt = entry?.resetAt || now + windowMs;

  if (count >= limit) {
    return { allowed: false, resetAt };
  }

  await this.storage.put(key, { count: count + 1, resetAt });
  return { allowed: true, remaining: limit - count - 1 };
}
```

**Sharding Strategy**:

- SHA-256 hash of IP -> sharded DO
- 256 shards for even distribution
- Prevents single-point bottleneck

### Circuit Breaker (`src/circuitBreaker.js`)

Prevents cascading failures when Durable Objects are slow:

**States**:

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Failures detected, requests fail fast
- **HALF-OPEN**: Testing if service recovered

```javascript
class CircuitBreaker {
  async execute(fn) {
    if (this.state === "OPEN") {
      if (Date.now() > this.resetTime) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }
}
```

### Deduplication (`src/deduplication.js`)

Prevents thundering herd on concurrent identical requests:

```javascript
export async function deduplicate(key, fn) {
  const existing = inflight.get(key);
  if (existing) {
    return existing; // Return ongoing promise
  }

  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
```

### Cache (`src/cache.js`)

In-memory LRU cache for frequently accessed data:

- Rate limit decisions cached for 1 second
- Reduces Durable Object calls
- Automatic expiration

## Security Architecture

### Zero-Knowledge Design

```
[ Client Browser ]                     [ Server ]
       |                                      |
       | 1. Generate Key (AES-256)            |
       | 2. Encrypt Secret                    |
       | 3. Create URL: https://...#key       |
       |                                      |
       |---- POST /api/secrets -------------->|
       |    Body: { encrypted, iv }           |
       |    (No key sent!)                    |
       |                                      |
       |<---- Response: { id, expiresAt } ----|
       |                                      |
       | Share URL: https://volatile.sh/      |
       |          s/abc123#a2b3c4d5...         |
       |          ^^^^  ^^^^^^^^^             |
       |          ID    Decryption Key        |
       |                                      |
       | (Recipient opens URL)                |
       | 4. Extract key from fragment         |
       | 5. Fetch encrypted secret            |
       | 6. Decrypt locally                   |
       |                                      |
```

**Key Point**: The URL fragment (`#key`) is never sent to the server.

### Encryption Details

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Generation**: `crypto.subtle.generateKey()`
- **IV**: 12 bytes (cryptographically random)
- **Key Storage**: URL fragment only (never transmitted)
- **Server Storage**: Ciphertext + IV only

### Security Layers

| Layer                  | Mechanism                  | Purpose             |
| ---------------------- | -------------------------- | ------------------- |
| Client-Side Encryption | AES-256-GCM                | Zero-knowledge      |
| Request Validation     | Size limits, header checks | DoS prevention      |
| Rate Limiting          | Per-IP quotas              | Abuse prevention    |
| IP Blacklist           | Auto-ban on abuse          | Blocking abusers    |
| CORS                   | Origin validation          | Prevent XSS         |
| Security Headers       | CSP, HSTS                  | Browser protections |

### CSP (Content Security Policy)

```javascript
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self';
  form-action 'none';
  frame-ancestors 'none';
  base-uri 'self';
```

## Data Flow

### Secret Creation Flow

```
Client                          Worker                         SecretStore
  |                               |                                 |
  |--1. Encrypt secret ---------->|                                 |
  |   (AES-256-GCM)               |                                 |
  |                               |                                 |
  |--2. POST /api/secrets ------->|                                 |
  |   {encrypted, iv, ttl}        |                                 |
  |                               |                                 |
  |                               |--3. Check Rate Limit ---------->|
  |                               |   (RateLimiter DO)              |
  |                               |<--------------------------------|
  |                               |                                 |
  |                               |--4. Store Secret -------------->|
  |                               |   (SecretStore DO)             |
  |                               |<--------------------------------|
  |                               |                                 |
  |<--5. Response: {id, expiresAt}|                                 |
  |                               |                                 |
  |--6. Create URL:-------------->|                                 |
  |   https://.../s/{id}#{key}    |                                 |
```

### Secret Reading Flow

```
Client                          Worker                         SecretStore
  |                               |                                 |
  |--1. GET /api/secrets/{id} --->|                                 |
  |   (Fragment: #key not sent)   |                                 |
  |                               |                                 |
  |                               |--2. Check Rate Limit ---------->|
  |                               |<--------------------------------|
  |                               |                                 |
  |                               |--3. Read and Delete ----------->|
  |                               |   (atomic transaction)         |
  |                               |<--------------------------------|
  |                               |                                 |
  |<--4. {encrypted, iv} ----------|                                 |
  |   (or error if not found)     |                                 |
  |                               |                                 |
  |--5. Decrypt locally -----------|                                 |
  |   (using key from fragment)   |                                 |
```

## Scalability Design

### Horizontal Scaling

- **Workers**: Auto-scale across 300+ edge locations
- **Durable Objects**: Auto-scale instances per object ID
- **Rate Limiters**: 256 shards distribute load

### Performance Optimization

| Technique             | Purpose                    |
| --------------------- | -------------------------- |
| Edge Deployment       | Low latency worldwide      |
| Request Deduplication | Reduce redundant DO calls  |
| In-Memory Cache       | Cache rate limit decisions |
| Circuit Breakers      | Fail fast when overloaded  |
| Sharded Rate Limiting | Distribute load evenly     |

### Capacity Planning

Based on current limits:

| Metric            | Limit          | Notes             |
| ----------------- | -------------- | ----------------- |
| Max secret size   | ~1MB encrypted | Base64url encoded |
| TTL range         | 5min - 7 days  | Configurable      |
| Creates per IP    | 100/hour       | Per IP            |
| Reads per IP      | 1000/hour      | Per IP            |
| Rate limit shards | 256            | Distributes load  |

## Reliability Features

### Circuit Breaker Pattern

Prevents cascading failures when Durable Objects are slow:

- **Failure Threshold**: 5 consecutive failures
- **Reset Timeout**: 60 seconds before retry
- **Timeout**: 10 seconds per request

### Transactional Storage

Durable Object transactions ensure:

- **Atomicity**: Delete on read is all-or-nothing
- **Consistency**: No partial states visible
- **Isolation**: Concurrent reads don't interfere

### Alarm System

SecretStore uses Durable Object alarms for:

- **Auto-deletion**: Remove expired secrets
- **Cleanup**: Free storage automatically

### Error Handling

```javascript
try {
  const result = await operation();
  return success(result);
} catch (err) {
  captureException(err, context, env);
  return errorResponse();
}
```

### Monitoring

Built-in metrics tracking:

- Request count and duration
- Error rate by type
- Rate limit violations
- Circuit breaker state changes
- Cache hit/miss ratio

## Future Enhancements

Potential architectural improvements:

1. **Geographic Sharding**: Route to nearest DO instance
2. **Encryption at Rest**: Additional server-side encryption layer
3. **Batch Operations**: Bulk secret creation API
4. **Webhook Notifications**: Alert when secret is read
5. **Custom TTL Limits**: Per-account TTL configuration
6. **Analytics**: Anonymous usage statistics

## References

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [AES-GCM Specification](https://csrc.nist.gov/publications/detail/fips/197/final)
