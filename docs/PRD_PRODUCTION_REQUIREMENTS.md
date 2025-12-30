# Product Requirements Document (PRD)

# volatile.sh - Zero-Knowledge Secret Sharing Service

**Version:** 2.0
**Date:** 2025-12-28
**Status:** Production Implementation
**Owner:** Product & Engineering Team
**Classification:** Internal - Production Planning

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Target Users](#target-users)
3. [Core Features](#core-features)
4. [Technical Requirements](#technical-requirements)
5. [Security Requirements](#security-requirements)
6. [Performance Requirements](#performance-requirements)
7. [Operational Requirements](#operational-requirements)
8. [Quality Assurance](#quality-assurance)
9. [Compliance & Legal](#compliance--legal)
10. [Success Metrics](#success-metrics)
11. [Release Criteria](#release-criteria)

---

## Product Overview

### Vision

Provide the world's most secure, simple, and transparent secret sharing service with zero-knowledge architecture, ensuring complete privacy and ephemerality.

### Mission

Enable individuals and teams to share sensitive information securely without trust dependencies, account requirements, or data persistence.

### Value Proposition

- **Zero Trust:** Client-side encryption ensures server never sees plaintext
- **Zero Knowledge:** Decryption keys never leave user's browser
- **Zero Persistence:** Data destroyed after single read
- **Zero Account:** No signup, no tracking, no profiles
- **100% Transparency:** Open source, auditable code

### Market Position

Position as the **privacy-focused, developer-friendly alternative** to:

- PrivNote (less privacy-focused)
- OneTimeSecret (requires account for some features)
- Snappass (self-hosted complexity)
- Password managers' sharing features (requires same ecosystem)

### Differentiation

1. **Cloudflare Workers**: Global edge network, sub-100ms latency worldwide
2. **Durable Objects**: Strong consistency, atomic operations
3. **Open Source**: Fully auditable, community-driven security
4. **Developer-Friendly**: Clean API, SDKs, webhooks (future)
5. **Terminal Aesthetic**: Unique, memorable UX appealing to technical users

---

## Target Users

### Primary Personas

#### 1. Software Developer (Primary)

**Profile:**

- Age: 25-45
- Technical proficiency: High
- Use case: Share API keys, credentials, debug logs with team
- Pain points: Slack messages are logged, email is insecure
- Frequency: 2-10 times per week
- Value drivers: Speed, security, no-account simplicity

**Requirements:**

- API access for automation
- CLI tool for terminal workflow
- Browser extension for quick sharing
- Code snippet syntax highlighting (future)

#### 2. System Administrator

**Profile:**

- Age: 30-50
- Technical proficiency: High
- Use case: Share root passwords, VPN credentials during incidents
- Pain points: Compliance requires encrypted sharing, audit trails
- Frequency: 5-20 times per week
- Value drivers: Audit logs, compliance, reliability

**Requirements:**

- Encrypted audit logs (optional, paid feature)
- Password protection (future)
- Custom expiration times
- Integration with Slack/Teams (future)

#### 3. Privacy-Conscious User

**Profile:**

- Age: 20-60
- Technical proficiency: Medium
- Use case: Share passwords, personal documents, medical info
- Pain points: Distrust of big tech, previous data breaches
- Frequency: 1-5 times per month
- Value drivers: Privacy, no tracking, transparency

**Requirements:**

- Clear privacy guarantees
- Easy-to-understand security model
- Mobile-friendly interface
- Multi-language support (future)

#### 4. Security Researcher (Influencer)

**Profile:**

- Age: 25-40
- Technical proficiency: Expert
- Use case: Evaluate security, recommend to others
- Pain points: Black-box services, unauditable code
- Frequency: One-time evaluation
- Value drivers: Open source, security audit, bug bounty

**Requirements:**

- Full source code access
- Security documentation
- Bug bounty program
- Vulnerability disclosure policy

### Secondary Personas

- **HR/Recruiters**: Share offer letters, salary info
- **Healthcare Workers**: Share patient data (HIPAA compliance needed)
- **Journalists**: Protect sources, share tips
- **Legal Professionals**: Share confidential documents

---

## Core Features

### MVP Features (Production v1.0)

#### F1: Secret Creation

**Priority:** P0 (Critical)

**User Story:**
As a user, I want to encrypt and upload a secret so that I can share it securely.

**Acceptance Criteria:**

- [ ] User can paste/type text up to 1MB
- [ ] Text is encrypted client-side (AES-GCM-256)
- [ ] Encryption key is generated in browser
- [ ] IV is cryptographically random (12 bytes)
- [ ] User can select expiration time (5min, 1hr, 24hr, 7days)
- [ ] Character count displayed in real-time
- [ ] Error handling for network failures
- [ ] Error handling for rate limits
- [ ] Loading state during upload
- [ ] Success state with shareable link
- [ ] Link includes fragment with encryption key
- [ ] One-click copy to clipboard
- [ ] Clear warning about one-time read

**Technical Requirements:**

- Client-side: Web Crypto API (AES-GCM)
- Server-side: POST /api/secrets endpoint
- Rate limit: 100 creates per hour per IP
- Size limit: 1MB encrypted payload
- ID generation: 16 chars, cryptographically random
- ID collision handling: Retry up to 5 times

**Non-Functional:**

- Response time: < 500ms (p95)
- Availability: 99.9%
- Error rate: < 0.1%

---

#### F2: Secret Retrieval

**Priority:** P0 (Critical)

**User Story:**
As a recipient, I want to decrypt and read a secret so that I can access shared information.

**Acceptance Criteria:**

- [ ] User can access secret via unique link
- [ ] Link format: `https://volatile.sh/?id={ID}#{KEY}`
- [ ] Fragment (key) is never sent to server
- [ ] Encrypted payload fetched from server
- [ ] Decryption happens client-side
- [ ] Secret is displayed in readable format
- [ ] Secret is destroyed on server after first read
- [ ] Second read attempt shows "already read" error
- [ ] Expired secrets show "expired" error
- [ ] Not-found secrets show "not found" error
- [ ] User can copy decrypted text
- [ ] Clear indication that secret is now destroyed

**Technical Requirements:**

- Server-side: GET /api/secrets/:id endpoint
- Durable Object: Atomic read-and-delete transaction
- Expiration: Automatic cleanup via DO alarms
- Rate limit: 1000 reads per hour per IP

**Non-Functional:**

- Response time: < 200ms (p95)
- Availability: 99.95%
- Atomic guarantee: No duplicate reads possible

---

#### F3: Rate Limiting

**Priority:** P0 (Critical)

**User Story:**
As a platform operator, I want to prevent abuse so that legitimate users have good performance.

**Acceptance Criteria:**

- [ ] Create endpoint limited to 100/hour per IP
- [ ] Read endpoint limited to 1000/hour per IP
- [ ] Rate limit headers included in response
- [ ] 429 error with Retry-After header
- [ ] Sliding window algorithm
- [ ] Rate limits distributed across 256 shards
- [ ] IP addresses are hashed (privacy)
- [ ] Cloudflare IPs extracted correctly

**Technical Requirements:**

- Durable Object: RateLimiter class
- Hash algorithm: SHA-256
- Shard distribution: First byte of hash
- Window: 1 hour (configurable)
- Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

**Non-Functional:**

- Shard latency: < 50ms (p95)
- Accuracy: ±5% (eventual consistency acceptable)

---

#### F4: Security Headers

**Priority:** P0 (Critical)

**User Story:**
As a security-conscious user, I want my browser to be protected from attacks.

**Acceptance Criteria:**

- [ ] Content-Security-Policy (CSP) prevents XSS
- [ ] Strict-Transport-Security (HSTS) enforces HTTPS
- [ ] X-Frame-Options prevents clickjacking
- [ ] X-Content-Type-Options prevents MIME sniffing
- [ ] Referrer-Policy protects privacy
- [ ] Permissions-Policy disables unnecessary features
- [ ] Cross-Origin-\* headers prevent data leaks

**Technical Requirements:**

- All responses include security headers
- CSP: default-src 'self'; no unsafe-inline/unsafe-eval
- HSTS: max-age=31536000; includeSubDomains; preload

**Non-Functional:**

- Security audit: Grade A+ on securityheaders.com
- Observatory score: 100+

---

#### F5: CORS Protection

**Priority:** P0 (Critical)

**User Story:**
As a platform operator, I want to prevent unauthorized origins from using the API.

**Acceptance Criteria:**

- [ ] Allowed origins: volatile.sh, www.volatile.sh, localhost (dev)
- [ ] Origin header validation
- [ ] Preflight (OPTIONS) requests handled
- [ ] Non-browser clients allowed (no Origin header)
- [ ] 403 error for disallowed origins
- [ ] Configurable via environment variable

**Technical Requirements:**

- Default allowlist hardcoded
- Environment override: ALLOWED_ORIGINS (comma-separated)
- Vary: Origin header included

---

### Post-MVP Features (v1.1 - v2.0)

#### F6: Password Protection (v1.1)

**Priority:** P1 (High)

**User Story:**
As a user, I want to add a password to my secret for defense-in-depth.

**Features:**

- Optional password field on creation
- Key derivation: PBKDF2 (100k iterations)
- Password prompt before decryption
- Password never sent to server
- Brute-force protection (3 attempts, then destroy)

**Technical:**

- Client-side password hashing
- Combined encryption: AES-GCM + password-derived key
- Server stores attempt counter

---

#### F7: File Upload (v1.2)

**Priority:** P1 (High)

**User Story:**
As a user, I want to share files securely (documents, images, code).

**Features:**

- Drag-and-drop file upload
- File size limit: 10MB (encrypted)
- Supported types: All (no restrictions)
- Preview for images/text
- Download button for recipient
- Chunked upload for large files

**Technical:**

- File read via FileReader API
- Encrypt file bytes
- Base64url encode
- Content-type metadata stored

---

#### F8: API Access (v1.3)

**Priority:** P1 (High)

**User Story:**
As a developer, I want to automate secret sharing via API.

**Features:**

- RESTful API with authentication
- API keys management dashboard
- Rate limits per API key
- SDKs: Python, JavaScript, Go, Rust
- Webhook notifications (when secret read)

**Technical:**

- API key format: JWT with HMAC
- Authentication: Bearer token
- Scopes: read, write, admin
- Audit logs per API key

---

#### F9: Custom Expiration (v1.4)

**Priority:** P2 (Medium)

**User Story:**
As a user, I want fine-grained control over expiration time.

**Features:**

- Custom time input (minutes)
- Max: 30 days (free), unlimited (paid)
- Countdown timer on read view
- Auto-refresh warning before expiration

---

#### F10: Audit Logs (v2.0 - Enterprise)

**Priority:** P2 (Medium)

**User Story:**
As a compliance officer, I need audit trails for secret sharing.

**Features:**

- Encrypted audit logs (optional, paid)
- Log events: create, read, expire, destroy
- Metadata: timestamp, IP, user agent (hashed)
- Export to JSON/CSV
- Retention: 90 days

**Technical:**

- Logs stored in encrypted DO
- AES-256 encryption at rest
- Zero-knowledge: logs encrypted with user key

---

## Technical Requirements

### Architecture

#### Frontend

- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite 6
- **Styling:** TailwindCSS 3
- **Crypto:** Web Crypto API (native browser)
- **State:** React hooks (no external state management)
- **Bundle Size:** < 250KB (gzipped)

#### Backend

- **Runtime:** Cloudflare Workers (V8 isolates)
- **Language:** JavaScript (ES modules)
- **Storage:** Durable Objects (strong consistency)
- **Routing:** Custom router (no framework overhead)
- **Logging:** Structured JSON logs

#### Infrastructure

- **CDN:** Cloudflare (300+ edge locations)
- **DNS:** Cloudflare DNS
- **SSL:** Cloudflare Universal SSL (auto-renewal)
- **DDoS:** Cloudflare DDoS protection (always-on)

### Data Flow

```
[User Browser]
    ↓ (1) Generate AES key
    ↓ (2) Encrypt plaintext
    ↓ (3) POST /api/secrets {encrypted, iv, ttl}
    ↓
[Cloudflare Edge]
    ↓ (4) Rate limit check
    ↓ (5) Store in Durable Object
    ↓ (6) Return {id, expiresAt}
    ↓
[User Browser]
    ↓ (7) Generate link with #key
    ↓ (8) Copy to clipboard

[Recipient Browser]
    ↓ (9) Parse id from query, key from fragment
    ↓ (10) GET /api/secrets/:id
    ↓
[Cloudflare Edge]
    ↓ (11) Rate limit check
    ↓ (12) Read & delete from Durable Object
    ↓ (13) Return {encrypted, iv}
    ↓
[Recipient Browser]
    ↓ (14) Decrypt with key from fragment
    ↓ (15) Display plaintext
```

### Database Schema

#### Durable Object: SecretStore

```javascript
{
  "secret": {
    "encrypted": "base64url string",  // AES-GCM ciphertext
    "iv": "base64url string",         // 12-byte initialization vector
    "expiresAt": 1234567890000        // Unix timestamp (ms)
  }
}
```

**Operations:**

- `store(encrypted, iv, expiresAt)` → Store secret, set alarm
- `read()` → Read and delete secret atomically
- `alarm()` → Auto-delete expired secret

#### Durable Object: RateLimiter

```javascript
{
  "create:{ipHash}": {
    "count": 42,
    "resetAt": 1234567890000
  },
  "read:{ipHash}": {
    "count": 123,
    "resetAt": 1234567890000
  }
}
```

**Operations:**

- `check(key, limit, windowMs)` → Increment counter, check limit

### API Specification

#### POST /api/secrets

**Request:**

```json
{
  "encrypted": "string (base64url, max 1.4M chars)",
  "iv": "string (base64url, 16-22 chars)",
  "ttl": "number (ms, 5min - 7days)"
}
```

**Response (201):**

```json
{
  "id": "string (16 chars)",
  "expiresAt": "number (Unix timestamp)"
}
```

**Errors:**

- 400: MISSING_FIELDS, INVALID_ENCODING, INVALID_IV_LENGTH
- 413: SECRET_TOO_LARGE
- 429: RATE_LIMITED
- 500: STORE_FAILED, ID_GENERATION_FAILED

---

#### GET /api/secrets/:id

**Response (200):**

```json
{
  "encrypted": "string (base64url)",
  "iv": "string (base64url)"
}
```

**Errors:**

- 400: INVALID_ID
- 404: Secret not found or already read
- 410: Secret expired
- 429: RATE_LIMITED

---

#### GET /api/health

**Response (200):**

```json
{
  "ok": true
}
```

---

## Security Requirements

### Encryption Standards

#### Client-Side Encryption

- **Algorithm:** AES-GCM-256
- **Key Size:** 256 bits (32 bytes)
- **IV Size:** 96 bits (12 bytes, recommended for GCM)
- **Key Generation:** `crypto.subtle.generateKey()`
- **Random Source:** `crypto.getRandomValues()` (CSPRNG)
- **Encoding:** Base64url (RFC 4648)

#### Key Management

- **Storage:** Never stored, only in URL fragment
- **Transmission:** Only via fragment identifier (#)
- **Browser Behavior:** Fragment never sent to server
- **Export:** Raw format, base64url encoded
- **Import:** For decryption only (no export allowed)

### Threat Model

#### In-Scope Threats

1. **Server Compromise:** Attacker gains access to Workers/DO
   - Mitigation: Zero-knowledge architecture, server sees only ciphertext
2. **Network Interception:** Man-in-the-middle attack
   - Mitigation: HTTPS/TLS, HSTS, certificate pinning (future)
3. **Client Compromise:** Attacker controls recipient browser
   - Mitigation: CSP, no persistent storage, one-time read
4. **Brute Force:** Attacker tries to guess IDs
   - Mitigation: 62^16 keyspace, rate limiting, expiration
5. **DDoS:** Attacker floods endpoints
   - Mitigation: Cloudflare DDoS protection, rate limiting
6. **Abuse:** Spammers, malware distribution
   - Mitigation: Rate limiting, abuse reporting, monitoring

#### Out-of-Scope Threats

1. Browser/OS malware (keyloggers, screen capture)
2. Quantum computing attacks (AES-256 is quantum-resistant)
3. Social engineering (phishing links)
4. Legal compulsion (can't decrypt without key)

### Compliance

#### Data Protection

- **Data Residency:** Cloudflare global network (user choice not available)
- **Data Retention:** Max 7 days, typically < 24 hours
- **Data Deletion:** Automatic on read or expiration
- **Data Encryption:** At rest (DO encryption) and in transit (TLS)

#### Regulations

- **GDPR:** Compliant (no personal data processed)
- **CCPA:** Compliant (no California residents tracked)
- **HIPAA:** Not compliant (not a BAA-eligible platform)
- **SOC 2:** Not audited (future consideration)

### Security Audit Checklist

- [ ] OWASP Top 10 review
- [ ] Cryptographic implementation review
- [ ] Penetration testing (VAPT)
- [ ] Code audit (static analysis)
- [ ] Dependency scanning (npm audit)
- [ ] Security headers testing
- [ ] TLS configuration review
- [ ] Rate limiting effectiveness
- [ ] Input validation coverage
- [ ] Error message disclosure

---

## Performance Requirements

### Latency Targets

| Operation            | p50     | p95     | p99     | Max   |
| -------------------- | ------- | ------- | ------- | ----- |
| POST /api/secrets    | < 100ms | < 300ms | < 500ms | 1s    |
| GET /api/secrets/:id | < 50ms  | < 150ms | < 300ms | 500ms |
| GET /api/health      | < 10ms  | < 30ms  | < 50ms  | 100ms |
| Frontend load        | < 1s    | < 2s    | < 3s    | 5s    |
| Decryption           | < 50ms  | < 100ms | < 200ms | 500ms |

### Throughput Targets

| Metric          | Free Tier | Production (estimated) |
| --------------- | --------- | ---------------------- |
| Requests/day    | 100,000   | 1,000,000              |
| Requests/second | 1.2       | 12                     |
| Peak RPS        | 10        | 100                    |
| Active secrets  | 10,000    | 100,000                |
| Storage usage   | 100MB     | 1GB                    |

### Resource Limits

| Resource             | Limit  | Reason           |
| -------------------- | ------ | ---------------- |
| CPU time per request | 50ms   | Workers limit    |
| Memory per request   | 128MB  | Workers limit    |
| Subrequest count     | 50     | Workers limit    |
| Durable Object CPU   | 30s    | DO limit         |
| Payload size         | 1MB    | Practical + cost |
| Secret expiration    | 7 days | Storage cost     |

### Scalability

**Horizontal Scaling:**

- Cloudflare Workers auto-scale globally
- Durable Objects shard by ID (no single point)
- Rate limiters shard by IP hash (256 shards)

**Vertical Scaling:**

- Not applicable (serverless architecture)

**Caching Strategy:**

- Static assets: Cloudflare CDN (1 year cache)
- API responses: No caching (no-store header)
- Rate limit checks: In-memory cache (1 second TTL, future)

---

## Operational Requirements

### Monitoring & Observability

#### Metrics to Track

1. **Request Metrics:**
   - Request count (by endpoint, status, origin)
   - Latency (p50, p95, p99)
   - Error rate (by error code)
   - Rate limit hits (by endpoint)

2. **Business Metrics:**
   - Secrets created (daily, weekly, monthly)
   - Secrets read (conversion rate)
   - Secrets expired (never read)
   - Average TTL selected
   - Geographic distribution

3. **System Metrics:**
   - Durable Object count
   - Durable Object latency
   - Storage usage
   - Alarm execution time
   - Worker CPU time

4. **Security Metrics:**
   - Failed CORS requests
   - Invalid ID attempts
   - Rate limit violations
   - Concurrent read attempts (should be 0)

#### Tools

- **Error Tracking:** Sentry (JavaScript, Workers)
- **Uptime Monitoring:** UptimeRobot or Pingdom
- **Analytics:** Cloudflare Web Analytics (privacy-preserving)
- **Logs:** Cloudflare Logpush → S3 → Athena (optional)
- **Dashboards:** Grafana + Prometheus (self-hosted) or Datadog

#### Alerting Rules

- **Critical (PagerDuty):**
  - Error rate > 5% for 5 minutes
  - p95 latency > 1s for 5 minutes
  - Uptime < 99% in rolling 1-hour window

- **Warning (Slack/Email):**
  - Error rate > 1% for 10 minutes
  - Rate limit hits > 100/hour
  - Storage usage > 80% of quota
  - Cost anomaly (> 150% of daily average)

### Logging Strategy

#### Log Levels

- **INFO:** Request completion (< 400 status)
- **WARN:** Client errors (400-499), rate limits
- **ERROR:** Server errors (500+), DO failures

#### Log Format (Structured JSON)

```json
{
  "timestamp": "2025-12-28T10:00:00.000Z",
  "level": "info",
  "message": "Request completed",
  "requestId": "uuid",
  "method": "POST",
  "path": "/api/secrets",
  "status": 201,
  "duration": 123,
  "ip": "hash(203.0.113.1)",
  "origin": "https://volatile.sh",
  "userAgent": "Mozilla/5.0 ...",
  "error": null
}
```

#### Log Retention

- **Workers Logs:** 24 hours (Cloudflare default)
- **Exported Logs:** 90 days (compliance)
- **Audit Logs:** 1 year (future, paid feature)

### Backup & Recovery

#### Data Backup

- **Durable Objects:** No traditional backup (ephemeral by design)
- **Configuration:** `wrangler.toml` in Git (versioned)
- **Static Assets:** Built from source (reproducible)

#### Disaster Recovery

- **RTO (Recovery Time Objective):** 1 hour
- **RPO (Recovery Point Objective):** 0 (acceptable data loss)
- **Runbook:** See OPERATIONS.md (to be created)

**Recovery Steps:**

1. Verify incident (monitoring alerts)
2. Check Cloudflare status page
3. Review Workers logs via CLI
4. Re-deploy from last known good commit
5. Verify Durable Object migrations
6. Test critical paths (health, create, read)
7. Monitor for 1 hour post-recovery

### Incident Response

#### Severity Levels

- **SEV-1 (Critical):** Complete service outage, data breach
- **SEV-2 (High):** Partial outage, severe performance degradation
- **SEV-3 (Medium):** Minor outage, non-critical features
- **SEV-4 (Low):** Cosmetic issues, no user impact

#### Response SLA

- **SEV-1:** Acknowledge in 15 min, resolve in 4 hours
- **SEV-2:** Acknowledge in 1 hour, resolve in 24 hours
- **SEV-3:** Acknowledge in 4 hours, resolve in 1 week
- **SEV-4:** No SLA

#### Communication

- **Status Page:** status.volatile.sh (to be created)
- **Twitter:** @volatilesh (to be created)
- **Email:** Opt-in notifications for downtimes > 1 hour

---

## Quality Assurance

### Testing Strategy

#### Test Pyramid

```
        /\
       /  \     10% E2E (Playwright)
      /____\
     /      \   30% Integration (Miniflare)
    /________\
   /          \  60% Unit (Node.js test runner)
  /__________\
```

#### Test Coverage Goals

- **Backend:** 90% line coverage
- **Frontend:** 80% line coverage
- **Critical paths:** 100% coverage (crypto, DO transactions)

#### Test Types

**Unit Tests:**

- Pure functions (crypto, encoding, validation)
- Error handling
- Edge cases (boundary values, empty inputs)

**Integration Tests:**

- API endpoints with mocked DO
- Durable Object transactions
- Rate limiting logic
- CORS handling

**End-to-End Tests:**

- User flows (create → share → read)
- Error scenarios (expired, not found)
- Browser compatibility (Chrome, Firefox, Safari)

**Security Tests:**

- Input validation (SQL injection, XSS)
- CORS bypass attempts
- Rate limit enforcement
- Concurrent read attempts

**Performance Tests:**

- Load testing (100 RPS sustained)
- Stress testing (find breaking point)
- Soak testing (24-hour stability)

#### CI/CD Pipeline

**Pre-Merge (GitHub Actions):**

1. Lint (ESLint, Prettier)
2. Type check (TypeScript)
3. Unit tests
4. Integration tests
5. Security scan (npm audit, Snyk)
6. Build frontend
7. Build status badge

**Post-Merge (Automatic Deploy):**

1. All pre-merge checks
2. Deploy to production (Wrangler)
3. Smoke tests (health check, create/read)
4. Monitor for errors (10 minutes)
5. Rollback if error rate > 5%

**Manual QA (Weekly):**

1. E2E tests on production
2. Cross-browser testing
3. Mobile testing (iOS Safari, Android Chrome)
4. Accessibility audit (WCAG 2.1 AA)
5. Performance audit (Lighthouse)

---

## Compliance & Legal

### Terms of Service (ToS)

**Key Clauses:**

1. **Acceptable Use:** No illegal content, malware, spam
2. **Liability Disclaimer:** No warranties, use at own risk
3. **Data Retention:** Max 7 days, auto-delete
4. **No Account:** No user accounts, no personal data
5. **Termination:** We can terminate service at any time
6. **Jurisdiction:** Delaware, USA (or user's choice)

**Enforcement:**

- Rate limiting (technical)
- Abuse reporting (manual review)
- Account suspension (N/A, no accounts)
- Law enforcement cooperation (legal obligation)

### Privacy Policy

**Data Collected:**

- **Server Logs:** IP (hashed), timestamp, user agent
- **Analytics:** Page views, country (Cloudflare Analytics)
- **Cookies:** None

**Data Not Collected:**

- Plaintext secrets (zero-knowledge)
- User identities (no accounts)
- Browsing history (no tracking)

**Data Sharing:**

- Cloudflare (infrastructure provider)
- Law enforcement (only if legally compelled)

**User Rights:**

- Right to access: No personal data stored
- Right to deletion: Auto-delete after read/expiration
- Right to portability: Export not applicable
- Right to object: Don't use service

### GDPR Compliance

**Legal Basis:**

- No personal data processing (encrypted data only)
- IP addresses hashed (not PII under GDPR)
- No consent required (no tracking)

**Data Protection Officer:** Not required (no high-risk processing)

**Data Breach Notification:** 72-hour requirement (monitor for breaches)

### Security Disclosure

**Vulnerability Reporting:**

- **Email:** security@volatile.sh (to be created)
- **PGP Key:** Published on website
- **Scope:** All code, infrastructure, cryptography
- **Response Time:** Acknowledge in 24 hours
- **Disclosure Timeline:** 90 days coordinated disclosure

**Bug Bounty Program (Future):**

- **Platform:** HackerOne or Bugcrowd
- **Rewards:** $50 - $5,000 based on severity
- **Scope:** In-scope threats (see Threat Model)

---

## Success Metrics

### Launch Metrics (First 30 Days)

**Adoption:**

- [ ] 1,000 secrets created
- [ ] 500 unique IPs
- [ ] 10 countries represented
- [ ] 0 critical bugs reported

**Performance:**

- [ ] 99.9% uptime
- [ ] p95 latency < 300ms
- [ ] Error rate < 0.5%

**Marketing:**

- [ ] 100 GitHub stars
- [ ] Featured on HackerNews front page
- [ ] 3 blog posts written
- [ ] 1,000 Twitter impressions

### 90-Day Metrics

**Growth:**

- [ ] 10,000 secrets created
- [ ] 5,000 unique IPs
- [ ] 20% week-over-week growth
- [ ] 50% read conversion rate

**Quality:**

- [ ] Security audit completed (clean report)
- [ ] 98% test coverage
- [ ] < 5 bugs reported per month
- [ ] User satisfaction > 4.5/5 (survey)

**Community:**

- [ ] 500 GitHub stars
- [ ] 10 community contributions
- [ ] 5 blog posts (internal + external)
- [ ] Mentioned in 3 industry articles

### 1-Year Metrics

**Scale:**

- [ ] 1M secrets created
- [ ] 100K monthly active IPs
- [ ] 50 countries represented
- [ ] 99.95% uptime

**Revenue (If Monetized):**

- [ ] 100 paid users (API access)
- [ ] $1,000 MRR (monthly recurring revenue)
- [ ] Break-even on infrastructure costs

**Impact:**

- [ ] Top 3 Google result for "secure secret sharing"
- [ ] 5,000 GitHub stars
- [ ] Security researcher endorsements
- [ ] Case studies from major companies

---

## Release Criteria

### Production Launch Checklist

#### Infrastructure (Must-Have)

- [x] Cloudflare Workers deployed
- [x] Durable Objects configured
- [x] Custom domain configured (volatile.sh)
- [ ] SSL certificate valid
- [ ] DNS propagated globally
- [ ] CDN enabled for static assets
- [ ] Error monitoring (Sentry)
- [ ] Uptime monitoring (UptimeRobot)
- [ ] Log aggregation configured
- [ ] Backup procedures documented

#### Security (Must-Have)

- [x] HTTPS enforced (HSTS)
- [x] Security headers (CSP, X-Frame-Options, etc.)
- [x] Rate limiting enabled
- [x] CORS configured
- [x] Input validation
- [ ] Security audit completed
- [ ] Penetration testing passed
- [ ] Vulnerability disclosure policy published
- [ ] security.txt published
- [ ] Dependencies updated (no critical CVEs)

#### Testing (Must-Have)

- [x] Unit tests (90% coverage)
- [x] Integration tests (pass 100%)
- [ ] E2E tests (pass 100%)
- [ ] Security tests (pass 100%)
- [ ] Load tests (100 RPS sustained)
- [ ] Cross-browser tests (Chrome, Firefox, Safari)
- [ ] Mobile tests (iOS, Android)
- [ ] Accessibility audit (WCAG AA)

#### Documentation (Must-Have)

- [x] README.md (setup instructions)
- [ ] API documentation (OpenAPI spec)
- [ ] Security documentation
- [ ] Operations runbook
- [ ] Incident response plan
- [ ] Architecture diagram
- [ ] FAQ page (populated)
- [ ] Privacy Policy (reviewed by lawyer)
- [ ] Terms of Service (reviewed by lawyer)

#### Legal/Compliance (Must-Have)

- [ ] Privacy Policy published
- [ ] Terms of Service published
- [ ] GDPR compliance reviewed
- [ ] Cookie consent (if needed)
- [ ] Data retention policy documented
- [ ] Abuse reporting mechanism

#### Marketing/Communication (Should-Have)

- [ ] Landing page copy finalized
- [ ] Social media accounts created
- [ ] Launch announcement drafted
- [ ] HackerNews post prepared
- [ ] Reddit post prepared
- [ ] ProductHunt listing prepared
- [ ] Press kit created

### Release Go/No-Go Decision

**Go Criteria:**

- All "Must-Have" items complete
- No SEV-1 or SEV-2 bugs open
- Security audit passed (or scheduled within 30 days)
- Legal review complete
- Monitoring/alerting functional
- Runbook reviewed by team

**No-Go Criteria:**

- Any critical security vulnerability
- Uptime < 99.9% in pre-production
- p95 latency > 1s consistently
- Data loss scenario identified
- Legal risk identified

---

## Appendix

### Glossary

- **Zero-Knowledge:** Server has no knowledge of plaintext data
- **Burn-After-Reading:** Data destroyed after single access
- **Durable Objects:** Cloudflare's strongly-consistent storage primitive
- **Workers:** Cloudflare's serverless execution environment
- **Fragment Identifier:** URL hash (#...) never sent to server
- **AES-GCM:** Authenticated encryption algorithm
- **Base64url:** URL-safe base64 encoding (RFC 4648)
- **CSPRNG:** Cryptographically Secure Pseudo-Random Number Generator
- **TTL:** Time-To-Live (expiration duration)
- **DO:** Durable Object
- **RTO:** Recovery Time Objective
- **RPO:** Recovery Point Objective

### References

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Durable Objects Docs](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- [Web Crypto API Spec](https://www.w3.org/TR/WebCryptoAPI/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GDPR Official Text](https://gdpr-info.eu/)
- [RFC 4648 - Base64url](https://datatracker.ietf.org/doc/html/rfc4648)

---

**Document Status:** DRAFT - Pending Review
**Next Review Date:** 2025-01-15
**Approval Required:** Engineering Lead, Product Manager, Security Team
