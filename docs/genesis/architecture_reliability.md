# volatile.sh - Reliability-First Architecture

## The GEMINI Manifesto: Reliability is Everything

> "A secret sharing platform that loses secrets or exposes them twice is worse than useless - it is a betrayal of trust."

This document defines the architecture for volatile.sh with a singular obsession: **reliability**. Every decision is made through the lens of "what can go wrong, and how do we prevent it."

---

## 1. Technology Stack - Justified for Reliability

### Core Runtime: Cloudflare Workers

| Component   | Choice                   | Reliability Justification                                                                            |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| **Compute** | Cloudflare Workers       | 99.99% SLA, 300+ edge locations, automatic failover, no cold starts after first request              |
| **State**   | Durable Objects          | Single-writer guarantee eliminates race conditions, atomic transactions, automatic state replication |
| **Storage** | DO Transactional Storage | ACID guarantees, encrypted at rest, co-located with compute                                          |
| **CDN**     | Cloudflare CDN           | Built-in DDoS protection, Anycast routing, automatic SSL                                             |
| **DNS**     | Cloudflare DNS           | Fastest authoritative DNS, 100% uptime SLA                                                           |

**Why NOT alternatives:**

| Alternative           | Rejected Because                                                  |
| --------------------- | ----------------------------------------------------------------- |
| AWS Lambda + DynamoDB | Cold starts (100-500ms), eventual consistency risks double-reads  |
| Vercel Edge Functions | Less mature DO equivalent, smaller edge network                   |
| Self-hosted           | Single point of failure, requires ops team, no automatic failover |
| Redis + PostgreSQL    | Network hops add latency and failure modes                        |

### Frontend: Minimal Attack Surface

```
Framework: Vanilla TypeScript (no framework)
Bundle Size Target: < 30KB gzipped
Dependencies: ZERO runtime dependencies
Crypto: Web Crypto API (browser-native)
```

**Justification:**

- Zero dependencies = zero supply chain vulnerabilities
- Small bundle = fast load = fewer timeout failures
- Native crypto = audited by browser vendors, hardware acceleration

---

## 2. Failure Mode Analysis

### Failure Taxonomy

```
CATEGORY A: Infrastructure Failures
  A1. Cloudflare global outage (RARE: <1 hour/year)
  A2. Single edge location failure (COMMON: handled automatically)
  A3. Durable Object migration (EXPECTED: transparent to user)
  A4. Storage quota exceeded (PREVENTABLE)

CATEGORY B: Application Failures
  B1. Secret already read (double-read attempt)
  B2. Secret expired before read
  B3. Invalid decryption key
  B4. Malformed request payload
  B5. Rate limit exceeded

CATEGORY C: Security Failures
  C1. Replay attack attempt
  C2. Brute force on secret ID
  C3. XSS injection in secret content
  C4. MITM on key transmission (URL interception)

CATEGORY D: Client Failures
  D1. Browser crypto API unavailable
  D2. JavaScript disabled
  D3. Network timeout during fetch
  D4. Clipboard API permission denied
```

### Failure Response Matrix

| Failure | Detection                  | Response                              | User Message                                              |
| ------- | -------------------------- | ------------------------------------- | --------------------------------------------------------- |
| A1      | External monitor (Pingdom) | Wait for recovery, secrets safe in DO | "Service temporarily unavailable. Your secrets are safe." |
| A2      | Automatic                  | Cloudflare reroutes to healthy edge   | Transparent                                               |
| A3      | DO lifecycle event         | State preserved during migration      | Transparent                                               |
| A4      | Pre-flight check           | Reject new secrets, allow reads       | "Service at capacity. Try again later."                   |
| B1      | 404 from DO                | Return clear error                    | "This secret has already been viewed and destroyed."      |
| B2      | TTL alarm                  | Auto-cleanup, 410 on access           | "This secret has expired."                                |
| B3      | Client decryption fails    | Show error, no retry                  | "Decryption failed. Check your link."                     |
| B4      | Schema validation          | 400 response                          | "Invalid request format."                                 |
| B5      | Rate limiter               | 429 response                          | "Too many requests. Wait 60 seconds."                     |
| C1      | Nonce validation           | Reject silently                       | Log for analysis                                          |
| C2      | Exponential backoff        | Increase delay                        | "Please wait before trying again."                        |
| C3      | CSP + sanitization         | Block render                          | Safe fallback display                                     |
| C4      | n/a (client-side key)      | Document risk                         | n/a                                                       |
| D1      | Feature detection          | Show warning                          | "Your browser doesn't support secure encryption."         |
| D2      | noscript fallback          | Static message                        | "JavaScript required for encryption."                     |
| D3      | Fetch timeout              | Retry with backoff                    | "Connection issue. Retrying..."                           |
| D4      | API rejection              | Manual copy fallback                  | "Click to copy manually."                                 |

---

## 3. Security Layers - Defense in Depth

### Layer Model

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 7: Application Logic                                       │
│   - Input validation (zod schemas)                               │
│   - Business rule enforcement                                    │
│   - Atomic state transitions                                     │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 6: Rate Limiting & Abuse Prevention                        │
│   - IP-based rate limits (100 creates/hour, 1000 reads/hour)     │
│   - Secret ID entropy validation                                 │
│   - Payload size limits (10KB text, 10MB files)                  │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 5: Request Authentication                                  │
│   - CORS strict origin checking                                  │
│   - CSRF token for mutations                                     │
│   - Request signing for API access                               │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 4: Transport Security                                      │
│   - TLS 1.3 enforced (Cloudflare)                                │
│   - HSTS with preload                                            │
│   - Certificate transparency monitoring                          │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 3: Content Security                                        │
│   - CSP: default-src 'self'; script-src 'self'                   │
│   - X-Content-Type-Options: nosniff                              │
│   - X-Frame-Options: DENY                                        │
│   - Referrer-Policy: no-referrer                                 │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 2: Encryption                                              │
│   - AES-256-GCM client-side (12-byte IV, 128-bit auth tag)       │
│   - Key derivation: PBKDF2 for password layer (100K iterations)  │
│   - Key never transmitted to server                              │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 1: Infrastructure                                          │
│   - Cloudflare DDoS protection                                   │
│   - Anycast routing (no single IP target)                        │
│   - WAF rules for common attacks                                 │
│   - Bot management                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Zero-Knowledge Proof Architecture

```typescript
// CLIENT SIDE - Key Generation and Encryption
interface SecretCreation {
  // Step 1: Generate random key (never sent to server)
  key: CryptoKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable for URL hash
    ['encrypt', 'decrypt']
  );

  // Step 2: Generate random IV (sent with ciphertext)
  iv: Uint8Array = crypto.getRandomValues(new Uint8Array(12));

  // Step 3: Encrypt plaintext
  ciphertext: ArrayBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  // Step 4: Export key for URL
  keyBytes: ArrayBuffer = await crypto.subtle.exportKey('raw', key);
  keyBase64: string = base64url(keyBytes);

  // Step 5: Send only ciphertext + IV to server
  // Step 6: Receive secret ID
  // Step 7: Construct URL: https://volatile.sh/s/{id}#{keyBase64}
  // Key is in fragment - NEVER sent to server in HTTP request
}
```

### Cryptographic Guarantees

| Property              | Implementation           | Verification                                |
| --------------------- | ------------------------ | ------------------------------------------- |
| **Confidentiality**   | AES-256-GCM              | Key in URL hash, never transmitted          |
| **Integrity**         | GCM authentication tag   | Tampering detected on decrypt               |
| **Authenticity**      | Authenticated encryption | Only key holder can create valid ciphertext |
| **Forward Secrecy**   | Unique key per secret    | Compromising one key reveals nothing else   |
| **Replay Prevention** | One-time read + delete   | Secret destroyed atomically                 |

---

## 4. Error Handling - Every Edge Case Covered

### Worker Error Handling Pattern

```typescript
// Comprehensive error handling wrapper
export async function handleRequest(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // Pre-flight validation
    const validation = await validateRequest(request);
    if (!validation.ok) {
      return errorResponse(validation.error, 400, requestId);
    }

    // Rate limiting check
    const rateLimit = await checkRateLimit(request);
    if (!rateLimit.ok) {
      return errorResponse("RATE_LIMIT_EXCEEDED", 429, requestId, {
        "Retry-After": String(rateLimit.retryAfter),
        "X-RateLimit-Reset": String(rateLimit.resetTime),
      });
    }

    // Route to handler
    const response = await routeRequest(request, requestId);

    // Add reliability headers
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("X-Response-Time", String(Date.now() - startTime));

    return response;
  } catch (error) {
    // Categorize error for appropriate response
    if (error instanceof DurableObjectError) {
      return handleDOError(error, requestId);
    }
    if (error instanceof ValidationError) {
      return errorResponse(error.code, 400, requestId);
    }
    if (error instanceof NotFoundError) {
      return errorResponse("SECRET_NOT_FOUND", 404, requestId);
    }

    // Unknown error - log and return generic
    console.error(`[${requestId}] Unexpected error:`, error);
    return errorResponse("INTERNAL_ERROR", 500, requestId);
  }
}

// Structured error response
function errorResponse(
  code: string,
  status: number,
  requestId: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message: ERROR_MESSAGES[code] || "An error occurred",
        requestId,
        timestamp: new Date().toISOString(),
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        ...headers,
      },
    }
  );
}
```

### Durable Object Consistency Pattern

```typescript
export class SecretVault implements DurableObject {
  private state: DurableObjectState;
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/create") {
      return this.createSecret(request);
    }

    if (request.method === "GET" && url.pathname === "/read") {
      return this.readAndBurn();
    }

    return new Response("Not Found", { status: 404 });
  }

  // ATOMIC CREATE with TTL
  private async createSecret(request: Request): Promise<Response> {
    // Check if secret already exists (idempotency)
    const existing = await this.storage.get("secret");
    if (existing) {
      return new Response(
        JSON.stringify({
          error: "SECRET_EXISTS",
        }),
        { status: 409 }
      );
    }

    const body = (await request.json()) as CreateSecretRequest;

    // Validate payload
    if (!body.ciphertext || body.ciphertext.length > 10 * 1024) {
      return new Response(
        JSON.stringify({
          error: "INVALID_PAYLOAD",
        }),
        { status: 400 }
      );
    }

    // Atomic write
    await this.storage.put("secret", {
      ciphertext: body.ciphertext,
      iv: body.iv,
      createdAt: Date.now(),
      ttl: body.ttl || 86400000, // 24h default
      viewCount: 0,
      maxViews: body.maxViews || 1,
    });

    // Set expiration alarm
    await this.storage.setAlarm(Date.now() + (body.ttl || 86400000));

    return new Response(
      JSON.stringify({
        success: true,
        expiresAt: new Date(Date.now() + (body.ttl || 86400000)).toISOString(),
      }),
      { status: 201 }
    );
  }

  // ATOMIC READ-AND-BURN - The critical operation
  private async readAndBurn(): Promise<Response> {
    // Use transaction to ensure atomicity
    const result = await this.storage.transaction(async (txn) => {
      const secret = (await txn.get("secret")) as StoredSecret | null;

      // Secret doesn't exist or already burned
      if (!secret) {
        return { error: "NOT_FOUND", status: 404 };
      }

      // Check if expired (belt + suspenders with alarm)
      if (Date.now() > secret.createdAt + secret.ttl) {
        await txn.delete("secret");
        return { error: "EXPIRED", status: 410 };
      }

      // Check view count
      if (secret.viewCount >= secret.maxViews) {
        await txn.delete("secret");
        return { error: "ALREADY_READ", status: 410 };
      }

      // Increment view count
      secret.viewCount += 1;

      // If this is the last allowed view, delete
      if (secret.viewCount >= secret.maxViews) {
        await txn.delete("secret");
        // Cancel alarm since we're deleting now
        await this.storage.deleteAlarm();
      } else {
        // Update with incremented view count
        await txn.put("secret", secret);
      }

      return {
        success: true,
        data: {
          ciphertext: secret.ciphertext,
          iv: secret.iv,
          remainingViews: secret.maxViews - secret.viewCount,
        },
      };
    });

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status,
      });
    }

    return new Response(JSON.stringify(result.data), {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  }

  // TTL Expiration Handler
  async alarm(): Promise<void> {
    // Alarm fired - delete the secret regardless
    await this.storage.delete("secret");
    console.log("Secret expired by TTL alarm");
  }
}
```

### Client-Side Error Recovery

```typescript
// Robust secret retrieval with retry logic
async function retrieveSecret(secretId: string, key: string): Promise<SecretResult> {
  const maxRetries = 3;
  const baseDelay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(`/api/secrets/${secretId}`, {
        timeout: 10000,
      });

      // Handle specific error codes
      if (response.status === 404) {
        return {
          success: false,
          error: "NOT_FOUND",
          message: "This secret does not exist or has already been viewed.",
          retryable: false,
        };
      }

      if (response.status === 410) {
        return {
          success: false,
          error: "EXPIRED",
          message: "This secret has expired.",
          retryable: false,
        };
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "60");
        if (attempt < maxRetries) {
          await sleep(retryAfter * 1000);
          continue;
        }
        return {
          success: false,
          error: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
          retryable: true,
          retryAfter,
        };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const { ciphertext, iv } = await response.json();

      // Decrypt on client
      const decrypted = await decryptSecret(ciphertext, iv, key);

      return {
        success: true,
        plaintext: decrypted,
      };
    } catch (error) {
      if (error.name === "AbortError") {
        // Timeout - retry with backoff
        if (attempt < maxRetries) {
          await sleep(baseDelay * Math.pow(2, attempt - 1));
          continue;
        }
      }

      if (error.name === "OperationError") {
        // Decryption failed - wrong key
        return {
          success: false,
          error: "DECRYPTION_FAILED",
          message: "Failed to decrypt. The link may be corrupted.",
          retryable: false,
        };
      }

      // Unknown error - retry if attempts remain
      if (attempt === maxRetries) {
        return {
          success: false,
          error: "NETWORK_ERROR",
          message: "Unable to connect. Please check your internet connection.",
          retryable: true,
        };
      }

      await sleep(baseDelay * Math.pow(2, attempt - 1));
    }
  }

  return {
    success: false,
    error: "MAX_RETRIES",
    message: "Failed after multiple attempts. Please try again later.",
    retryable: true,
  };
}
```

---

## 5. Abuse Prevention Without Breaking Zero-Knowledge

### The Challenge

We cannot inspect secret content (zero-knowledge), but must prevent:

- Malware distribution
- Phishing campaigns
- Spam/abuse at scale
- Resource exhaustion

### Multi-Layer Abuse Prevention

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: Rate Limiting (Does NOT see content)                   │
├─────────────────────────────────────────────────────────────────┤
│ - IP-based: 100 creates/hour, 1000 reads/hour                   │
│ - Global: 10,000 creates/minute across platform                 │
│ - Sliding window with exponential backoff                       │
│ - Separate limits for authenticated API users                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: Behavioral Analysis (Does NOT see content)             │
├─────────────────────────────────────────────────────────────────┤
│ - Burst detection: >10 creates in 1 minute = CAPTCHA            │
│ - Pattern detection: same ciphertext size = suspicious          │
│ - Geographic anomaly: unusual origin distribution               │
│ - Time-of-day patterns: bot-like behavior                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: Resource Limits (Does NOT see content)                 │
├─────────────────────────────────────────────────────────────────┤
│ - Max secret size: 10KB text, 10MB files                        │
│ - Max TTL: 7 days (free), 30 days (paid)                        │
│ - Max views: 10 (prevents viral distribution)                   │
│ - Minimum TTL: 5 minutes (prevents instant abuse cycling)       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4: Reputation System (Does NOT see content)               │
├─────────────────────────────────────────────────────────────────┤
│ - IP reputation from Cloudflare                                 │
│ - Threat score thresholds                                       │
│ - Known bad actor lists (Tor exit nodes, datacenters)           │
│ - Progressive trust: new IPs get stricter limits                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 5: Abuse Reporting (Post-hoc, preserves ZK)               │
├─────────────────────────────────────────────────────────────────┤
│ - Report button on view page                                    │
│ - Reporter provides: secret ID + description                    │
│ - We can delete by ID without seeing content                    │
│ - Pattern: multiple reports = proactive scanning                │
└─────────────────────────────────────────────────────────────────┘
```

### Rate Limiting Implementation

```typescript
interface RateLimitConfig {
  window: number; // Time window in seconds
  maxRequests: number; // Max requests per window
  keyPrefix: string; // 'create' | 'read' | 'api'
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  create: { window: 3600, maxRequests: 100, keyPrefix: "rl:create:" },
  read: { window: 3600, maxRequests: 1000, keyPrefix: "rl:read:" },
  createBurst: { window: 60, maxRequests: 10, keyPrefix: "rl:burst:" },
  global: { window: 60, maxRequests: 10000, keyPrefix: "rl:global" },
};

async function checkRateLimit(
  request: Request,
  action: string,
  env: Env
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[action];
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `${config.keyPrefix}${ip}`;

  // Use Cloudflare KV for distributed rate limiting
  const current = (await env.RATE_LIMITS.get(key, "json")) as RateLimitState | null;
  const now = Date.now();

  if (!current || now > current.windowEnd) {
    // New window
    await env.RATE_LIMITS.put(
      key,
      JSON.stringify({
        count: 1,
        windowEnd: now + config.window * 1000,
      }),
      { expirationTtl: config.window * 2 }
    );

    return { ok: true, remaining: config.maxRequests - 1 };
  }

  if (current.count >= config.maxRequests) {
    const retryAfter = Math.ceil((current.windowEnd - now) / 1000);
    return {
      ok: false,
      remaining: 0,
      retryAfter,
      resetTime: current.windowEnd,
    };
  }

  // Increment counter
  current.count += 1;
  await env.RATE_LIMITS.put(key, JSON.stringify(current), {
    expirationTtl: Math.ceil((current.windowEnd - now) / 1000) + 60,
  });

  return { ok: true, remaining: config.maxRequests - current.count };
}
```

---

## 6. Monitoring and Alerting

### Metrics Collection

```typescript
// Structured logging for observability
interface RequestLog {
  timestamp: string;
  requestId: string;
  action: "create" | "read" | "expire";
  status: number;
  latencyMs: number;
  colo: string; // Cloudflare data center
  country: string;
  secretId?: string; // For correlation (not content)
  error?: string;
  rateLimit?: {
    remaining: number;
    exceeded: boolean;
  };
}

async function logRequest(log: RequestLog, env: Env): Promise<void> {
  // Send to Cloudflare Logpush or external service
  await env.ANALYTICS.writeDataPoint({
    blobs: [log.action, log.error || "none", log.colo, log.country],
    doubles: [log.status, log.latencyMs],
    indexes: [log.requestId],
  });
}
```

### Alert Thresholds

| Metric        | Warning     | Critical    | Response                   |
| ------------- | ----------- | ----------- | -------------------------- |
| Error Rate    | > 1%        | > 5%        | Page on-call               |
| P99 Latency   | > 500ms     | > 2000ms    | Investigate DO performance |
| Create Rate   | > 5000/min  | > 8000/min  | Potential abuse, review    |
| 429 Responses | > 100/min   | > 500/min   | Possible DDoS              |
| DO Storage    | > 80% quota | > 95% quota | Scale or purge             |
| Global Outage | 1+ region   | 3+ regions  | Cloudflare escalation      |

### Health Check Endpoint

```typescript
// /api/health - Comprehensive health check
async function healthCheck(env: Env): Promise<Response> {
  const checks: Record<string, HealthCheck> = {};

  // Check 1: Worker is alive
  checks.worker = { status: "ok", latencyMs: 0 };

  // Check 2: Can create DO
  const doStart = Date.now();
  try {
    const testDO = env.SECRETS.get(env.SECRETS.idFromName("health-check"));
    await testDO.fetch("https://internal/ping");
    checks.durableObject = {
      status: "ok",
      latencyMs: Date.now() - doStart,
    };
  } catch (e) {
    checks.durableObject = {
      status: "error",
      error: e.message,
      latencyMs: Date.now() - doStart,
    };
  }

  // Check 3: KV accessible
  const kvStart = Date.now();
  try {
    await env.RATE_LIMITS.get("health-check");
    checks.kv = { status: "ok", latencyMs: Date.now() - kvStart };
  } catch (e) {
    checks.kv = {
      status: "error",
      error: e.message,
      latencyMs: Date.now() - kvStart,
    };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "ok");

  return new Response(
    JSON.stringify({
      status: allHealthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
      region: request.cf?.colo,
    }),
    {
      status: allHealthy ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    }
  );
}
```

### External Monitoring

```yaml
# Pingdom / Uptime Robot Configuration
monitors:
  - name: volatile.sh Homepage
    url: https://volatile.sh
    interval: 1m
    alert_threshold: 2 failures

  - name: volatile.sh API Health
    url: https://volatile.sh/api/health
    interval: 1m
    expected_status: 200
    expected_body_contains: '"status":"healthy"'

  - name: volatile.sh Create Flow
    type: transaction
    steps:
      - POST https://volatile.sh/api/secrets
        body: '{"ciphertext":"dGVzdA==","iv":"dGVzdGl2","ttl":300000}'
        expect: 201
        save: secretId
      - GET https://volatile.sh/api/secrets/${secretId}
        expect: 200
      - GET https://volatile.sh/api/secrets/${secretId}
        expect: 404  # Should be burned
```

---

## 7. Recovery Procedures

### Incident Response Playbook

#### Scenario 1: Elevated Error Rates

```
TRIGGER: Error rate > 5% for 5 minutes

STEPS:
1. Check Cloudflare Status (cloudflarestatus.com)
   - If global outage: Monitor, no action needed

2. Check error distribution by endpoint
   $ wrangler tail --filter 'status >= 500'

3. If errors concentrated in one region:
   - Use Cloudflare dashboard to exclude region

4. If errors in DO operations:
   - Check DO storage limits
   - Check for infinite loops in alarm handlers

5. If errors in rate limiting:
   - Temporarily increase limits or disable
   - $ wrangler kv:bulk delete rl:*

6. Rollback if recent deployment:
   $ wrangler rollback
```

#### Scenario 2: Suspected Data Breach

```
TRIGGER: Security alert, unusual access patterns

STEPS:
1. IMMEDIATE: Enable paranoid mode
   - Increase rate limits 10x
   - Enable CAPTCHA on all creates
   - Block suspicious IPs

2. ASSESS: What was exposed?
   - Secret content? IMPOSSIBLE (zero-knowledge)
   - Secret IDs? Low risk (random UUIDs)
   - Access patterns? Moderate risk

3. INVESTIGATE: Access logs
   $ wrangler tail --since 24h --format json | grep suspicious

4. COMMUNICATE: If user data affected
   - Post status page update
   - Direct notification if identifiable

5. REMEDIATE: Fix vulnerability
   - Deploy fix to staging
   - Security review
   - Deploy to production

6. POST-MORTEM: Document and improve
```

#### Scenario 3: Resource Exhaustion

```
TRIGGER: Storage quota > 90%, or global rate limits hit

STEPS:
1. IDENTIFY: What's consuming resources?
   - Abuse? → Block + report
   - Legitimate growth? → Scale plan

2. IMMEDIATE RELIEF:
   - Reduce TTL maximum temporarily
   - Force-expire secrets > 24h old
   $ wrangler durable-objects list | xargs -I {} wrangler do delete {}

3. SCALE:
   - Upgrade Cloudflare plan
   - Implement tiered storage (R2 for large files)

4. PREVENT:
   - Add storage quotas per IP
   - Implement paid tier for large secrets
```

---

## 8. Trade-offs - What We Sacrifice for Safety

### Performance Trade-offs

| Feature                     | Reliability Gain           | Performance Cost      |
| --------------------------- | -------------------------- | --------------------- |
| Synchronous DO transactions | Atomic guarantees          | +10-50ms latency      |
| No caching of secrets       | Prevents stale reads       | Every read hits DO    |
| Retry logic with backoff    | Handles transient failures | Slower error recovery |
| Full request validation     | Rejects bad input early    | +5ms per request      |
| Structured logging          | Debugging capability       | +2ms per request      |

### Feature Trade-offs

| Feature Sacrificed   | Reason                                  |
| -------------------- | --------------------------------------- |
| Eventual consistency | Cannot risk double-reads                |
| Optimistic updates   | Must confirm delete before responding   |
| Client-side caching  | Secrets must not persist                |
| Offline mode         | Requires server for delete confirmation |
| Partial reads        | All-or-nothing for atomicity            |

### Cost Trade-offs

| Choice                  | Reliability Benefit           | Cost Increase          |
| ----------------------- | ----------------------------- | ---------------------- |
| Durable Objects over KV | Atomic transactions           | ~10x storage cost      |
| Multiple DO replicas    | Faster failover               | ~2x request cost       |
| Cloudflare Pro/Business | Better support, more features | $20-200/mo             |
| External monitoring     | Faster incident detection     | $20-100/mo             |
| Security audit          | Third-party validation        | $5,000-20,000 one-time |

---

## 9. Architecture Diagram - Final

```
                                    INTERNET
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE EDGE (300+ locations)                  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ WAF Rules │ DDoS Protection │ Bot Management │ Rate Limiting       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                    │                                      │
│                                    ▼                                      │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                        CLOUDFLARE WORKER                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │  │
│  │  │   Router     │→ │  Validator   │→ │  Handler     │              │  │
│  │  │  /api/*      │  │  zod schemas │  │  create/read │              │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │  │
│  │         │                                    │                      │  │
│  │         ▼                                    ▼                      │  │
│  │  ┌──────────────┐                   ┌──────────────┐               │  │
│  │  │ Rate Limiter │                   │ DO Connector │               │  │
│  │  │    (KV)      │                   │              │               │  │
│  │  └──────────────┘                   └──────────────┘               │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                    │                                      │
│                                    ▼                                      │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                      DURABLE OBJECTS (per-secret)                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │  SecretVault DO Instance (unique per secret)                 │   │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │   │  │
│  │  │  │ Transactional│  │ Alarm for   │  │ Atomic      │          │   │  │
│  │  │  │ Storage      │  │ TTL Expiry  │  │ Read+Delete │          │   │  │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘          │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                           ┌──────────────┐
                           │  Monitoring  │
                           │  - Logpush   │
                           │  - Analytics │
                           │  - Alerts    │
                           └──────────────┘
```

---

## 10. Implementation Checklist

### Phase 1: Core Reliability (Week 1-2)

- [ ] Worker with comprehensive error handling
- [ ] Durable Object with transactional storage
- [ ] Atomic read-and-burn implementation
- [ ] TTL alarm for expiration
- [ ] Input validation with zod
- [ ] Structured logging

### Phase 2: Security Hardening (Week 3)

- [ ] Rate limiting (IP + global)
- [ ] CORS configuration
- [ ] CSP headers
- [ ] HTTPS enforcement
- [ ] Security headers audit

### Phase 3: Client Robustness (Week 4)

- [ ] Web Crypto API implementation
- [ ] Retry logic with backoff
- [ ] Graceful degradation
- [ ] Error state handling
- [ ] Feature detection

### Phase 4: Observability (Week 5)

- [ ] Health check endpoint
- [ ] External monitoring setup
- [ ] Alert configuration
- [ ] Incident runbooks
- [ ] On-call rotation

### Phase 5: Security Audit (Week 6+)

- [ ] Internal security review
- [ ] External penetration test
- [ ] Cryptographic audit
- [ ] Remediation of findings

---

## Confidence Score: 9/10

### Why 9 and not 10:

**Strengths (supporting high confidence):**

- Cloudflare infrastructure is battle-tested for reliability
- Durable Objects provide the exact guarantees needed for atomic delete-on-read
- Zero-knowledge architecture is cryptographically sound
- Defense-in-depth covers all attack vectors
- Error handling covers known failure modes

**Remaining risks (preventing 10):**

1. **Cloudflare dependency**: Single vendor lock-in. Mitigation: Document escape hatch to alternative providers
2. **Browser crypto variations**: Edge cases in older browsers. Mitigation: Feature detection + polyfills
3. **Novel attack vectors**: Unknown unknowns in zero-knowledge abuse prevention. Mitigation: Security audit
4. **Cost at scale**: Durable Objects pricing may not scale linearly. Mitigation: Monitor and optimize

### Reliability Guarantee

With this architecture, volatile.sh can credibly claim:

- **99.99% uptime** (matching Cloudflare SLA)
- **100% burn-on-read guarantee** (transactional storage)
- **Zero plaintext exposure** (client-side encryption)
- **Sub-second global latency** (edge compute)

**The system is designed to fail safe**: if anything goes wrong, secrets remain encrypted and inaccessible rather than exposed.

---

_"Reliability is not a feature. It is the foundation upon which trust is built."_

_- The GEMINI Manifesto_
