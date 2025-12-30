# volatile.sh Roadmap

This document outlines the planned development roadmap for volatile.sh.

## Status Legend

| Status      | Description                 |
| ----------- | --------------------------- |
| Proposed    | Idea under consideration    |
| Planned     | Approved for implementation |
| In Progress | Currently being worked on   |
| Completed   | Feature shipped             |

---

## Version 1.1 (Planned - Q1 2025)

### Features

| Feature                             | Status  | Priority |
| ----------------------------------- | ------- | -------- |
| **Webhook Notifications**           | Planned | Medium   |
| - Alert when secret is read         | Planned | Medium   |
| - Alert when secret expires         | Planned | Low      |
| - Support for Discord/Slack/webhook | Planned | Medium   |

| Feature                          | Status  | Priority |
| -------------------------------- | ------- | -------- |
| **Custom Limits**                | Planned | High     |
| - Per-account TTL configuration  | Planned | High     |
| - Custom rate limits per account | Planned | Medium   |
| - Larger secret size option      | Planned | Medium   |

| Feature                      | Status  | Priority |
| ---------------------------- | ------- | -------- |
| **Analytics Dashboard**      | Planned | Low      |
| - Anonymous usage statistics | Planned | Low      |
| - Rate limit monitoring      | Planned | Low      |
| - Error rate tracking        | Planned | Low      |

---

## Version 1.2 (Planned - Q2 2025)

### Features

| Feature                     | Status   | Priority |
| --------------------------- | -------- | -------- |
| **Multi-Recipient Secrets** | Proposed | High     |
| - Share with N recipients   | Proposed | High     |
| - Notify when all have read | Proposed | Medium   |
| - Optional read receipts    | Proposed | Low      |

| Feature                           | Status   | Priority |
| --------------------------------- | -------- | -------- |
| **Password Protection**           | Proposed | Medium   |
| - Optional password for secrets   | Proposed | Medium   |
| - Client-side password derivation | Proposed | Medium   |
| - PBKDF2 key stretching           | Proposed | Medium   |

| Feature                          | Status  | Priority |
| -------------------------------- | ------- | -------- |
| **Geographic Routing**           | Planned | Low      |
| - Route to nearest DO instance   | Planned | Low      |
| - Region-specific data residency | Planned | Low      |

---

## Version 2.0 (Proposed - Q3 2025)

### Features

| Feature                                 | Status   | Priority |
| --------------------------------------- | -------- | -------- |
| **End-to-End Encryption for Messaging** | Proposed | High     |
| - Multi-message threads                 | Proposed | High     |
| - Forward secrecy                       | Proposed | High     |
| - Message expiration                    | Proposed | Medium   |

| Feature                     | Status   | Priority |
| --------------------------- | -------- | -------- |
| **File Sharing**            | Proposed | Medium   |
| - Encrypted file storage    | Proposed | Medium   |
| - Streaming upload/download | Proposed | Medium   |
| - Size limits (10MB-100MB)  | Proposed | Low      |

| Feature                     | Status   | Priority |
| --------------------------- | -------- | -------- |
| **Client SDKs**             | Proposed | High     |
| - JavaScript/TypeScript SDK | Proposed | High     |
| - Python SDK                | Proposed | Medium   |
| - Go SDK                    | Proposed | Medium   |
| - CLI tool                  | Proposed | Low      |

---

## Infrastructure Improvements

### Monitoring & Observability

| Feature                     | Status  | Priority |
| --------------------------- | ------- | -------- |
| **Enhanced Metrics**        | Planned | High     |
| - Prometheus export         | Planned | High     |
| - OpenTelemetry integration | Planned | Medium   |
| - Custom dashboards         | Planned | Medium   |

| Feature              | Status  | Priority |
| -------------------- | ------- | -------- |
| **Error Tracking**   | Planned | High     |
| - Sentry integration | Planned | High     |
| - Error aggregation  | Planned | Medium   |
| - Alerting on errors | Planned | Medium   |

### Performance

| Feature                           | Status  | Priority |
| --------------------------------- | ------- | -------- |
| **Caching Layer**                 | Planned | Medium   |
| - Edge caching for static assets  | Planned | Medium   |
| - API response caching where safe | Planned | Low      |

| Feature                   | Status  | Priority |
| ------------------------- | ------- | -------- |
| **Database Optimization** | Planned | Low      |
| - Storage compression     | Planned | Low      |
| - Connection pooling      | Planned | Low      |

---

## Security Enhancements

| Feature                              | Status   | Priority |
| ------------------------------------ | -------- | -------- |
| **Additional Algorithms**            | Proposed | Medium   |
| - XChaCha20-Poly1305 option          | Proposed | Medium   |
| - Post-quantum algorithms (research) | Proposed | Low      |

| Feature                       | Status   | Priority |
| ----------------------------- | -------- | -------- |
| **Security Audit**            | Planned  | High     |
| - Third-party security review | Planned  | High     |
| - Penetration testing         | Planned  | High     |
| - Bug bounty program          | Proposed | Medium   |

---

## Developer Experience

| Feature                  | Status      | Priority |
| ------------------------ | ----------- | -------- |
| **Local Development**    | In Progress | High     |
| - Docker compose setup   | Planned     | High     |
| - Mock Durable Objects   | Planned     | Medium   |
| - Hot module replacement | Planned     | Low      |

| Feature              | Status    | Priority |
| -------------------- | --------- | -------- |
| **Documentation**    | Completed | High     |
| - API documentation  | Completed | High     |
| - Architecture docs  | Completed | High     |
| - Contributing guide | Completed | High     |
| - Deployment guide   | Completed | High     |

| Feature                  | Status    | Priority |
| ------------------------ | --------- | -------- |
| **Testing**              | Completed | High     |
| - Unit tests             | Completed | High     |
| - Integration tests      | Completed | High     |
| - E2E tests (Playwright) | Proposed  | Medium   |
| - Performance benchmarks | Proposed  | Low      |

---

## Community

| Feature                          | Status   | Priority |
| -------------------------------- | -------- | -------- |
| **Self-Hosting Guide**           | Proposed | Medium   |
| - Alternative deployment options | Proposed | Medium   |
| - Cost estimation                | Proposed | Low      |

| Feature                     | Status   | Priority |
| --------------------------- | -------- | -------- |
| **Integrations**            | Proposed | Low      |
| - Browser extension         | Proposed | Low      |
| - Mobile app (React Native) | Proposed | Low      |
| - Slack/Discord bots        | Proposed | Low      |

---

## Long-Term Vision

The long-term vision for volatile.sh includes:

1. **Zero-Knowledge Platform**: Expand beyond one-time secrets to include secure messaging, file sharing, and collaboration tools.

2. **Privacy-First**: Maintain strict zero-knowledge architecture across all features. No user tracking, no logs, no accounts required.

3. **Global Performance**: Leverage Cloudflare's edge network for sub-100ms response times worldwide.

4. **Open Source**: Keep core functionality open source with transparent security practices.

5. **Sustainable Business**: Optional premium features for power users while keeping essential features free.

---

## Contribution

If you're interested in contributing to any of these features:

1. Check the [CONTRIBUTING.md](CONTRIBUTING.md) guide
2. Open a GitHub Discussion to propose changes
3. Submit pull requests for small features
4. Contact: maintainers@volatile.sh

---

**Last Updated**: December 2024
