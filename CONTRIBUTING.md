# Contributing to volatile.sh

Thank you for your interest in contributing to volatile.sh! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and constructive in all interactions.

### Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment, trolling, or derogatory comments
- Personal or political attacks
- Public or private harassment
- Publishing private information without permission
- Any other unethical or unprofessional conduct

### Reporting

If you witness or experience unacceptable behavior, please contact: conduct@volatile.sh

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git
- Cloudflare Account (for deployment testing)

### Initial Setup

1. Fork the repository on GitHub
2. Clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/volatile.sh.git
cd volatile.sh
```

3. Install dependencies:

```bash
npm install
```

4. Create a feature branch:

```bash
git checkout -b feature/your-feature-name
```

## Development Workflow

### 1. Make Your Changes

- Write clean, well-commented code
- Follow the coding standards below
- Add tests for new functionality
- Update documentation as needed

### 2. Test Your Changes

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

Ensure all tests pass before submitting.

### 3. Build the Frontend

```bash
npm run build:front
```

### 4. Commit Your Changes

Follow the commit message guidelines below.

### 5. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 6. Create a Pull Request

See the Pull Request Process section below.

## Coding Standards

### JavaScript/TypeScript Style

We follow a functional, modular style:

```javascript
// Good: Named exports, pure functions
export async function createSecret(request, env) {
  const body = await readJson(request);
  // ...logic
  return json({ id: result.id }, { status: 201 });
}

// Avoid: Default exports, side effects
export default async function (req, env) {
  // ...logic with side effects
}
```

### Code Organization

```
src/
├── index.js          # Entry point, minimal logic
├── worker.js         # Request routing
├── api.js            # API handlers
├── constants.js      # Configuration only
├── http.js           # HTTP utilities
├── security.js       # Security functions
├── monitoring.js     # Logging/metrics
├── cache.js          # Caching layer
├── circuitBreaker.js # Circuit breaker
├── deduplication.js  # Deduplication
└── do/               # Durable Objects
    ├── SecretStore.js
    └── RateLimiter.js
```

### Naming Conventions

| Type              | Convention       | Example                               |
| ----------------- | ---------------- | ------------------------------------- |
| Files             | camelCase        | `api.js`, `rateLimit.js`              |
| Functions         | camelCase        | `createSecret()`, `validateRequest()` |
| Classes           | PascalCase       | `SecretStore`, `RateLimiter`          |
| Constants         | UPPER_SNAKE_CASE | `MAX_SECRET_SIZE`, `DEFAULT_TTL`      |
| Private functions | camelCase        | `internalFunction()`                  |

### Error Handling

Always use the `HttpError` class for HTTP errors:

```javascript
import { HttpError } from "./http.js";

// Good: Specific error with code
if (!encrypted) {
  throw new HttpError(400, "MISSING_FIELDS", "Encrypted data is required");
}

// Avoid: Generic errors
if (!encrypted) {
  throw new Error("Missing data");
}
```

### Comments

- Document public functions with JSDoc comments
- Add inline comments for complex logic
- Keep comments up-to-date with code changes

```javascript
/**
 * Creates a new encrypted secret
 * @param {Request} request - The HTTP request
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Response>} JSON response with secret ID
 */
export async function createSecret(request, env) {
  // Validate input
  const body = await readJson(request);

  // ... implementation
}
```

### Security Considerations

When contributing security-sensitive code:

1. **Validate all input**: Never trust user input
2. **Use constant-time comparisons**: For sensitive data
3. **Avoid timing leaks**: Be careful with error messages
4. **Sanitize output**: Encode user-generated content
5. **Follow the principle of least privilege**: Minimal access needed

## Testing Guidelines

### Test Structure

```javascript
import test from "node:test";
import assert from "node:assert/strict";

test("descriptive test name", async () => {
  // Arrange
  const input = { value: "test" };

  // Act
  const result = await functionUnderTest(input);

  // Assert
  assert.equal(result.status, 200);
});
```

### Test Categories

1. **Unit Tests**: Test individual functions in isolation
2. **Integration Tests**: Test component interactions
3. **Security Tests**: Verify security controls work
4. **Performance Tests**: Ensure acceptable performance

### Coverage Goals

| Component           | Target Coverage |
| ------------------- | --------------- |
| Core logic (api.js) | 90%+            |
| Security functions  | 100%            |
| Durable Objects     | 80%+            |
| Utilities           | 80%+            |

### Writing Good Tests

- Test behavior, not implementation
- Use descriptive test names
- Test edge cases and error conditions
- Mock external dependencies (Durable Objects in tests)
- Keep tests fast and independent

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type       | Usage                           |
| ---------- | ------------------------------- |
| `feat`     | New feature                     |
| `fix`      | Bug fix                         |
| `docs`     | Documentation changes           |
| `style`    | Code style changes (formatting) |
| `refactor` | Code refactoring                |
| `test`     | Adding or updating tests        |
| `chore`    | Maintenance tasks               |
| `perf`     | Performance improvements        |
| `security` | Security fixes                  |

### Examples

```
feat(api): add support for custom TTL

Add the ability for users to specify custom expiration times
for secrets between 5 minutes and 7 days.

Closes #123
```

```
fix(security): validate IV length in createSecret

Previously, IVs of any length were accepted. This change
validates that IVs are exactly 12 bytes for AES-256-GCM.

Fixes #456
```

```
docs(readme): add deployment instructions

Add step-by-step guide for deploying to Cloudflare Workers.
```

## Pull Request Process

### Before Submitting

1. **Update documentation** if you've changed functionality
2. **Add tests** for new features or bug fixes
3. **Ensure all tests pass**: `npm test`
4. **Build frontend**: `npm run build:front`
5. **Rebase** your branch on the latest main if needed

### PR Description Template

```markdown
## Summary

<!-- Brief description of changes -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All tests passing locally

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Changes generate no new warnings

## Related Issues

Fixes #123
Related to #456
```

### Review Process

1. Automated checks must pass (CI/CD)
2. At least one maintainer approval required
3. Address review comments promptly
4. Keep PRs focused and reasonably sized
5. Squash commits before merging if needed

### Merging

Maintainers will:

- Review and approve PRs
- Ensure CI checks pass
- Squash and merge to maintain clean history
- Delete merged branches

## Reporting Issues

### Bug Reports

When reporting bugs, include:

1. **Clear title and description**
2. **Steps to reproduce**:
   ```bash
   # Step 1
   # Step 2
   # Step 3
   ```
3. **Expected behavior**
4. **Actual behavior**
5. **Environment details**:
   - Browser/OS version
   - Node.js version
   - Deployment (local/production)
6. **Screenshots** if applicable

### Feature Requests

When proposing features:

1. **Describe the problem** you're trying to solve
2. **Propose a solution** if you have ideas
3. **Explain the use case** and who would benefit
4. **Consider alternatives** and why they're insufficient

### Security Issues

For security vulnerabilities:

1. Do **NOT** open a public issue
2. Email security@volatile.sh with details
3. Include steps to reproduce if applicable
4. Allow time for response before disclosing

## Getting Help

If you need help contributing:

1. **Documentation**: Check [README.md](README.md), [DEVELOPMENT.md](DEVELOPMENT.md)
2. **Issues**: Search existing GitHub issues
3. **Discussions**: Start a GitHub Discussion
4. **Email**: support@volatile.sh for non-technical questions

## Recognition

Contributors will be:

- Listed in the CONTRIBUTORS section of README.md
- Credited in release notes for significant contributions
- Invited to become maintainers for consistent, valuable contributions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

Thank you for contributing to volatile.sh!
