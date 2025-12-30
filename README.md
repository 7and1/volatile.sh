# volatile.sh

<p align="center">
  <img src="docs/logo.png" alt="volatile.sh logo" width="200">
</p>

<p align="center">
  <strong>Zero-knowledge, burn-after-reading secret sharing</strong><br>
  Built on Cloudflare Workers + Durable Objects
</p>

<p align="center">
  <a href="https://volatile.sh">Live Demo</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#architecture">Architecture</a>
</p>

---

<p align="center">
  <img src="docs/screenshot.png" alt="volatile.sh screenshot" width="800">
</p>

[![CI Status](https://github.com/residentialproxies/volatile.sh/workflows/test/badge.svg)](https://github.com/residentialproxies/volatile.sh/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

| Feature                       | Description                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------- |
| **Zero-Knowledge Encryption** | Client-side AES-256-GCM encryption. Server never sees plaintext.                |
| **Burn After Reading**        | Secrets deleted atomically on first read using Durable Object transactions.     |
| **No Account Required**       | Anonymous by design. No registration, no tracking.                              |
| **Ephemeral Storage**         | Configurable TTL (5 minutes to 7 days). Auto-deletion on expiration.            |
| **Rate Limited**              | Per-IP quotas (100 creates/hour, 1000 reads/hour) with sharded Durable Objects. |
| **Circuit Breakers**          | Resilient to failures with automatic circuit breaker pattern.                   |
| **Request Deduplication**     | Thundering herd protection for concurrent identical requests.                   |
| **Security Headers**          | Comprehensive CSP, HSTS, X-Frame-Options, CORS.                                 |
| **Accessibility**             | Keyboard shortcuts, reduced motion support, ARIA labels.                        |
| **Global Edge**               | Deployed on Cloudflare's 300+ edge locations.                                   |

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare Account (free tier works)
- Cloudflare Workers Paid Plan ($5/month for Durable Objects)

### Local Development

```bash
# Clone the repository
git clone https://github.com/residentialproxies/volatile.sh.git
cd volatile.sh

# Install dependencies
npm install

# Create configuration
cp wrangler.toml.example wrangler.toml

# Add your Cloudflare Account ID to wrangler.toml
# Get it from: https://dash.cloudflare.com/ (right sidebar)

# Run locally
npm run dev -- --local --port 8787
```

Visit http://localhost:8787

## Deployment

### Deploy to Workers.dev (Development)

```bash
npm run deploy
```

This deploys to: `https://volatile-sh.YOUR_SUBDOMAIN.workers.dev`

### Deploy to Custom Domain (Production)

1. Add custom domain in Cloudflare Dashboard
2. Update `wrangler.toml` with routes
3. Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Architecture

```
[Client Browser]          [Cloudflare Worker]         [Durable Objects]
     |                            |                            |
     | 1. Encrypt (AES-256)       |                            |
     |    Key in URL fragment     |                            |
     |---------------------------->|                            |
     | POST /api/secrets          |                            |
     | {encrypted, iv, ttl}       |                            |
     |                            |---------------------------->|
     |                            | Store encrypted data        |
     |                            |<----------------------------|
     |< {id, expiresAt}           |                            |
     |                            |                            |
     | Share: https://.../#key    |                            |
     |                            |                            |
     | [Recipient opens URL]      |                            |
     |                            |---------------------------->|
     |                            | Atomic read + delete        |
     |                            |<----------------------------|
     |< {encrypted, iv}           |                            |
     | 2. Decrypt locally         |                            |
```

**Key Security Points:**

- Encryption happens entirely client-side
- Decryption key is in the URL fragment (never sent to server)
- Server only stores encrypted ciphertext
- Durable Object transactions ensure atomic delete-on-read

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system architecture.

## Security Model

### Zero-Knowledge Design

| Component  | What We Store                      |
| ---------- | ---------------------------------- |
| Server     | Encrypted ciphertext (AES-256-GCM) |
| Server     | Initialization vector (12 bytes)   |
| Server     | Expiration timestamp               |
| Server     | Hashed IP (for rate limiting)      |
| **Client** | Decryption key (URL fragment only) |

### What We DON'T Store

- Plaintext secrets
- Decryption keys
- User accounts
- IP addresses linked to secrets
- Access logs
- Read receipts

### Encryption Details

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Size**: 256 bits
- **IV**: 12 cryptographically random bytes
- **Key Storage**: URL fragment only (browsers never send fragments to servers)

See [dist/security.html](dist/security.html) for the full security whitepaper.

## API Documentation

```bash
# Health check
curl https://volatile.sh/api/health

# Create secret (client-side encrypted)
curl -X POST https://volatile.sh/api/secrets \
  -H "Content-Type: application/json" \
  -d '{"encrypted":"Zm9vYmFy","iv":"a2V5MTIzNDU2Nzg5MDEy","ttl":3600000}'

# Read secret (deleted after first read)
curl https://volatile.sh/api/secrets/AbCd1234EfGh5678
```

See [API.md](API.md) for complete API reference.

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# View real-time logs
npm run tail
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup and debugging.

## Project Structure

```
volatile.sh/
├── src/                      # Backend source
│   ├── index.js             # Worker entry point
│   ├── worker.js            # Request router
│   ├── api.js               # API handlers
│   ├── constants.js         # Configuration
│   ├── security.js          # Security middleware
│   ├── monitoring.js        # Logging & metrics
│   ├── circuitBreaker.js    # Circuit breaker pattern
│   ├── deduplication.js     # Request deduplication
│   └── do/                  # Durable Objects
│       ├── SecretStore.js   # Secret storage
│       └── RateLimiter.js   # Rate limiting
├── test/                    # Test suite
│   └── *.test.js
├── dist/                    # Built frontend
├── volatile.sh-front.sh/    # Frontend (React)
├── wrangler.toml.example    # Config template
├── DEPLOYMENT.md            # Deployment guide
├── DEVELOPMENT.md           # Development guide
├── ARCHITECTURE.md          # System architecture
├── API.md                   # API reference
├── CONTRIBUTING.md          # Contribution guide
└── CHANGELOG.md             # Version history
```

## Configuration

Key configuration in `src/constants.js`:

| Constant                       | Default   | Description             |
| ------------------------------ | --------- | ----------------------- |
| `TTL.MIN_MS`                   | 5 minutes | Minimum TTL             |
| `TTL.MAX_MS`                   | 7 days    | Maximum TTL             |
| `RATE_LIMIT.CREATE_PER_WINDOW` | 100       | Creates per IP per hour |
| `RATE_LIMIT.READ_PER_WINDOW`   | 1000      | Reads per IP per hour   |
| `LIMITS.ENCRYPTED_MAX_CHARS`   | 1,400,000 | Max secret size (~1MB)  |

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Report bugs via [GitHub Issues](https://github.com/residentialproxies/volatile.sh/issues)
- Submit pull requests for improvements
- Discuss features in [GitHub Discussions](https://github.com/residentialproxies/volatile.sh/discussions)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Legal

- **Privacy Policy**: https://volatile.sh/privacy.html
- **Terms of Service**: https://volatile.sh/terms.html
- **Security Whitepaper**: https://volatile.sh/security.html

## Acknowledgments

- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- Storage via [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- Frontend with [React](https://react.dev/) and [Vite](https://vitejs.dev/)
- Inspired by [PrivateBin](https://privatebin.info/) and [CryptBin](https://cryptbin.org/)

---

<p align="center">
  <a href="https://volatile.sh">volatile.sh</a> &bull;
  <a href="mailto:support@volatile.sh">Support</a> &bull;
  <a href="https://github.com/residentialproxies/volatile.sh">GitHub</a>
</p>

<p align="center">
  <sub>Zero-knowledge means we have zero knowledge of your data.</sub>
</p>
