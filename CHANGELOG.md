# Changelog

All notable changes to volatile.sh will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Webhook notifications when secrets are read
- Custom TTL limits per account
- Geographic routing optimization
- Additional analytics dashboard

## [1.0.0] - 2024-12-30

### Added

#### Core Features

- Zero-knowledge secret sharing with AES-256-GCM encryption
- Burn-after-reading functionality (atomic delete on first read)
- Client-side encryption (server never sees plaintext)
- Configurable TTL (5 minutes to 7 days)

#### Security

- Request validation (size limits, header checks)
- IP-based rate limiting (100 creates/hour, 1000 reads/hour)
- Automatic IP blacklisting for abuse detection
- Comprehensive security headers (CSP, HSTS, X-Frame-Options)
- CORS enforcement for API endpoints

#### Reliability

- Circuit breaker pattern for Durable Object failures
- Request deduplication to prevent thundering herd
- In-memory caching for rate limit decisions
- Durable Object transactions for atomicity
- Automatic expiration via DO alarms

#### Developer Experience

- Comprehensive test suite with Miniflare
- Local development with `--local` flag
- Real-time log tailing with `wrangler tail`
- GitHub Actions CI/CD pipeline
- Code coverage reporting

#### Frontend

- React-based user interface
- Terminal-style design
- Keyboard shortcuts
- ARIA labels for accessibility
- Reduced motion support
- Toast notifications

#### Documentation

- README with quick start guide
- Privacy policy (GDPR compliant)
- Terms of service
- Security whitepaper
- FAQ page

#### API Endpoints

- `GET /api/health` - Health check
- `POST /api/secrets` - Create encrypted secret
- `GET /api/secrets/:id` - Read and delete secret
- `GET /.well-known/security.txt` - Security contact info

### Security

- Server only stores encrypted ciphertext
- Decryption keys never transmitted (URL fragment only)
- No user accounts or logging
- Ephemeral rate limit data (RAM only)
- IP addresses hashed before storage

### Performance

- Edge deployment on Cloudflare Workers (300+ locations)
- Durable Objects for strongly consistent storage
- 256-shard rate limiting for load distribution
- Sub-100ms response times in most regions

### Deployment

- One-click deployment to workers.dev
- Custom domain support
- Automated CI/CD via GitHub Actions
- Zero-downtime deployments

## [0.9.0] - 2024-12-15

### Added

- Initial development release
- Durable Object integration
- Rate limiting infrastructure
- Frontend UI prototype
- Basic test coverage

### Changed

- Migrated from Workers KV to Durable Objects
- Updated to ES modules

## [0.1.0] - 2024-12-01

### Added

- Project initialization
- Basic secret sharing functionality
- Client-side encryption

---

## Version Classification

| Category  | Description                        |
| --------- | ---------------------------------- |
| **Major** | Breaking changes, removed features |
| **Minor** | New features, backward-compatible  |
| **Patch** | Bug fixes, backward-compatible     |

## Release Notes Format

Each release includes:

- **Summary**: High-level overview
- **Added**: New features
- **Changed**: Modifications to existing functionality
- **Deprecated**: Features to be removed
- **Removed**: Features removed in this release
- **Fixed**: Bug fixes
- **Security**: Security-related changes

## Upgrade Notes

### From 0.x to 1.0.0

This is a major release with breaking changes:

1. **Migration to Durable Objects**: KV keys are not compatible
2. **New API format**: Request/response structure updated
3. **Rate limiting changes**: New enforcement mechanism

To upgrade:

1. Update `wrangler.toml` with new Durable Objects bindings
2. Redeploy to initialize DO classes
3. Update frontend to use new API format

### Breaking Changes

| Version | Change                     | Migration Path                |
| ------- | -------------------------- | ----------------------------- |
| 1.0.0   | Durable Objects replace KV | Redeploy with new config      |
| 1.0.0   | Rate limit API changed     | Update client implementations |

## Future Roadmap

See [ROADMAP.md](docs/ROADMAP.md) for planned features and timeline.

---

For project documentation:

- [README.md](README.md) - Overview and quick start
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development setup
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [API.md](API.md) - API reference
