# Deployment Guide

This guide covers deploying volatile.sh to Cloudflare Workers in production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Custom Domain Setup](#custom-domain-setup)
- [Environment Variables](#environment-variables)
- [CI/CD Deployment](#cicd-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying volatile.sh, you need:

1. **Cloudflare Account** - Sign up at https://dash.cloudflare.com/
2. **Cloudflare Workers Paid Plan** - Some features require the paid plan ($5/month)
3. **Node.js 18+** - For building the frontend
4. **Git** - For cloning the repository
5. **Wrangler CLI** - Installed via npm

### Install Wrangler CLI

```bash
npm install -g wrangler
```

### Authenticate Wrangler

```bash
wrangler login
```

This will open a browser window to authenticate with Cloudflare.

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/residentialproxies/volatile.sh.git
cd volatile.sh
```

### 2. Install Dependencies

```bash
npm install
```

This will install backend dependencies and frontend dependencies automatically.

### 3. Create Configuration File

```bash
cp wrangler.toml.example wrangler.toml
```

### 4. Get Your Cloudflare Account ID

You can find your Account ID in several ways:

- **Via Dashboard**: Log into https://dash.cloudflare.com/ and find your Account ID in the right sidebar
- **Via Wrangler**: Run `wrangler whoami` to see your account details

Add your Account ID to `wrangler.toml`:

```toml
account_id = "YOUR_ACCOUNT_ID_HERE"
```

## Configuration

### Basic Configuration (wrangler.toml)

The minimal `wrangler.toml` for development:

```toml
name = "volatile-sh"
main = "src/index.js"
compatibility_date = "2024-12-01"

account_id = "YOUR_ACCOUNT_ID_HERE"

# Workers.dev subdomain for testing
workers_dev = true

# Serve static files from /public
[assets]
directory = "./dist"

# Durable Object bindings
[[durable_objects.bindings]]
name = "SECRETS"
class_name = "SecretStore"

[[durable_objects.bindings]]
name = "RATE_LIMIT"
class_name = "RateLimiter"

# Durable Object migrations
[[migrations]]
tag = "v1"
new_classes = ["SecretStore"]

[[migrations]]
tag = "v2"
new_classes = ["RateLimiter"]
```

### Production Configuration

For production with custom domains:

```toml
name = "volatile-sh"
main = "src/index.js"
compatibility_date = "2024-12-01"

account_id = "YOUR_ACCOUNT_ID_HERE"

# Comment out workers_dev when using custom domains
# workers_dev = true

# Custom domain routes
routes = [
  { pattern = "volatile.sh", custom_domain = true },
  { pattern = "www.volatile.sh", custom_domain = true }
]

[assets]
directory = "./dist"

[[durable_objects.bindings]]
name = "SECRETS"
class_name = "SecretStore"

[[durable_objects.bindings]]
name = "RATE_LIMIT"
class_name = "RateLimiter"

[[migrations]]
tag = "v1"
new_classes = ["SecretStore"]

[[migrations]]
tag = "v2"
new_classes = ["RateLimiter"]
```

## Deployment

### Deploy to Workers.dev (Development)

The simplest deployment uses Cloudflare's `workers.dev` subdomain:

```bash
npm run deploy
```

This will deploy to: `https://volatile-sh.YOUR_SUBDOMAIN.workers.dev`

### Deploy to Custom Domain (Production)

#### Step 1: Add Custom Domain in Cloudflare Dashboard

1. Go to **Workers & Pages** in the Cloudflare Dashboard
2. Select your worker (`volatile-sh`)
3. Go to **Settings** > **Domains & Routes**
4. Click **Add Custom Domain**
5. Enter your domain (e.g., `volatile.sh`)
6. Click **Add Domain**
7. Repeat for `www.volatile.sh` if desired

#### Step 2: Update wrangler.toml

Comment out `workers_dev = true` and uncomment the routes section:

```toml
# workers_dev = true

routes = [
  { pattern = "volatile.sh", custom_domain = true },
  { pattern = "www.volatile.sh", custom_domain = true }
]
```

#### Step 3: Deploy

```bash
npm run deploy
```

## Environment Variables

You can configure additional behavior via environment variables in `wrangler.toml`:

```toml
[vars]
ENVIRONMENT = "production"

[[unsafe.bindings]]
name = "RATE_LIMIT_CREATE_PER_WINDOW"
type = "secret"
value = "100"

[[unsafe.bindings]]
name = "RATE_LIMIT_READ_PER_WINDOW"
type = "secret"
value = "1000"

[[unsafe.bindings]]
name = "ALLOWED_ORIGINS"
type = "secret"
value = "https://volatile.sh,https://www.volatile.sh"
```

### Available Environment Variables

| Variable                       | Description                                  | Default                |
| ------------------------------ | -------------------------------------------- | ---------------------- |
| `ALLOWED_ORIGINS`              | Comma-separated list of allowed CORS origins | `*`                    |
| `RATE_LIMIT_CREATE_PER_WINDOW` | Max secret creates per hour per IP           | `100`                  |
| `RATE_LIMIT_READ_PER_WINDOW`   | Max secret reads per hour per IP             | `1000`                 |
| `SECURITY_CONTACT`             | Email for security.txt                       | `security@volatile.sh` |

## CI/CD Deployment

The project includes GitHub Actions for automatic deployment.

### Setting up GitHub Actions

1. Go to your repository **Settings** > **Secrets and variables** > **Actions**
2. Add the following secrets:

| Secret                  | Description                | How to Get                                               |
| ----------------------- | -------------------------- | -------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token for deployment   | Create at https://dash.cloudflare.com/profile/api-tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID | Dashboard or `wrangler whoami`                           |

### Creating an API Token

1. Visit https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template
4. Configure permissions:
   - Account > Cloudflare Workers > Edit
   - Account > Workers Scripts > Edit
   - Account > Durable Objects > Edit
5. Set **Account Resources** to your account
6. Click **Continue to summary** and create the token
7. Copy the token to GitHub Secrets

### Deployment Behavior

- **Push to `main`**: Runs tests and deploys to production
- **Pull Request**: Runs tests only (no deployment)

## Monitoring

### Viewing Logs

Use Wrangler's tail command to view real-time logs:

```bash
npm run tail
```

Or manually:

```bash
wrangler tail volatile-sh
```

### Metrics

The application includes built-in metrics tracking:

- Request count by method and status
- Request duration (response time)
- Error count by type
- Rate limit violations
- Circuit breaker state changes

Metrics are logged to Cloudflare Workers logs and can be viewed via:

```bash
wrangler tail --format pretty
```

### Analytics

Cloudflare provides built-in analytics for Workers:

1. Go to **Workers & Pages** in the Dashboard
2. Select your worker
3. Click **Metrics** to view:
   - Request count
   - Success rate
   - Response time
   - Status code distribution

## Troubleshooting

### Common Issues

#### "Module not found" Error

**Problem**: Deployment fails with module import errors.

**Solution**: Make sure you've built the frontend first:

```bash
npm run build:front
npm run deploy
```

#### "Durable Object already exists" Error

**Problem**: Migration fails because a Durable Object class already exists.

**Solution**: Update the migration tag in `wrangler.toml`:

```toml
[[migrations]]
tag = "v3"  # Increment the tag
new_classes = ["SecretStore", "RateLimiter"]
```

#### CORS Errors in Production

**Problem**: Frontend cannot connect to API.

**Solution**: Ensure `ALLOWED_ORIGINS` includes your production domain:

```toml
[vars]
ALLOWED_ORIGINS = "https://volatile.sh,https://www.volatile.sh"
```

#### Rate Limiting Too Aggressive

**Problem**: Legitimate users are being rate limited.

**Solution**: Adjust the rate limits in `src/constants.js` or via environment variables, then redeploy.

#### Custom Domain Not Working

**Problem**: Custom domain shows 5xx errors.

**Solution**:

1. Verify DNS is configured correctly (CNAME to `workers.dev`)
2. Check SSL certificate status in Cloudflare Dashboard
3. Ensure the route pattern matches your domain exactly
4. Check that `workers_dev` is commented out

### Getting Help

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/residentialproxies/volatile.sh/issues)
2. Review the [main README](README.md)
3. Consult [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
4. Contact support: `support@volatile.sh`

### Debug Mode

For additional debugging, you can enable verbose logging:

```bash
wrangler deploy --verbose
```

Or tail logs with more detail:

```bash
wrangler tail --format pretty --status
```

## Rollback

If you need to rollback to a previous version:

```bash
# View deployment history
wrangler deployments list

# Rollback to a specific deployment
wrangler rollback volatile-sh --version <version-id>
```

Or simply revert the code change and push again:

```bash
git revert HEAD
git push origin main
```

GitHub Actions will automatically deploy the reverted version.
