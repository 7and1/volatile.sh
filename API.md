# API Reference

This document describes the volatile.sh REST API for creating and retrieving encrypted secrets.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Base URL](#base-url)
- [Common Headers](#common-headers)
- [Endpoints](#endpoints)
- [Error Codes](#error-codes)
- [Rate Limiting](#rate-limiting)
- [Security](#security)
- [Examples](#examples)

## Overview

The volatile.sh API is a RESTful API for creating and retrieving encrypted secrets. All encryption happens client-side using AES-256-GCM.

### Key Features

- **Zero-Knowledge**: Server never has access to plaintext
- **Burn After Reading**: Secrets deleted atomically on first read
- **Ephemeral**: Secrets auto-expire after configured TTL
- **Rate Limited**: Per-IP quotas prevent abuse

## Authentication

No authentication is required. The service is anonymous by design.

### Client-Side Encryption Required

All secrets must be encrypted client-side before sending:

```javascript
// Generate key
const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
  "encrypt",
  "decrypt",
]);

// Generate IV (12 bytes)
const iv = crypto.getRandomValues(new Uint8Array(12));

// Encrypt
const ciphertext = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv },
  key,
  encoder.encode(plaintext)
);

// Encode to base64url
const encrypted = b64urlEncode(new Uint8Array(ciphertext));
const ivEncoded = b64urlEncode(iv);
```

The decryption key is stored in the URL fragment and never sent to the server.

## Base URL

| Environment | URL                     |
| ----------- | ----------------------- |
| Production  | `https://volatile.sh`   |
| Development | `http://localhost:8787` |

## Common Headers

All API responses include the following headers:

| Header                  | Description                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| `X-Request-ID`          | Unique request identifier for tracing (format: `timestamp-random`) |
| `X-API-Version`         | Current API version (e.g., `1.0.0`)                                |
| `X-RateLimit-Limit`     | Requests allowed per window                                        |
| `X-RateLimit-Remaining` | Remaining requests in current window                               |
| `X-RateLimit-Reset`     | Unix timestamp when the rate limit resets                          |

CORS responses expose these headers via `Access-Control-Expose-Headers`.

## Endpoints

### Health Check

Check if the API is operational.

```http
GET /api/health
```

**Response**

```json
{
  "ok": true,
  "version": "1.0.0",
  "uptime": {
    "ms": 123456,
    "seconds": 123
  },
  "do": {
    "secrets": "available",
    "rateLimiter": "available"
  },
  "metrics": {
    "create": { "success": 0, "failure": 0 },
    "read": { "success": 0, "failure": 0 }
  }
}
```

**Status Codes**

- `200 OK` - Service is healthy

---

### Create Secret

Create a new encrypted secret.

```http
POST /api/secrets
Content-Type: application/json
```

**Request Body**

| Field       | Type   | Required | Description                                      |
| ----------- | ------ | -------- | ------------------------------------------------ |
| `encrypted` | string | Yes      | Base64url-encoded ciphertext                     |
| `iv`        | string | Yes      | Base64url-encoded IV (12 bytes)                  |
| `ttl`       | number | No       | Time-to-live in milliseconds (default: 24 hours) |

**Request Example**

```json
{
  "encrypted": "Zm9vYmFyYmF6",
  "iv": "a2V5MTIzNDU2Nzg5MDEy",
  "ttl": 3600000
}
```

**Response**

```json
{
  "id": "AbCd1234EfGh5678",
  "expiresAt": 1704067200000
}
```

**Status Codes**

- `201 Created` - Secret created successfully
- `400 Bad Request` - Invalid request (see error codes)
- `413 Payload Too Large` - Secret exceeds maximum size
- `429 Too Many Requests` - Rate limit exceeded
- `503 Service Unavailable` - Temporary service issue

**TTL Limits**

| Minimum               | Default  | Maximum                |
| --------------------- | -------- | ---------------------- |
| 5 minutes (300,000ms) | 24 hours | 7 days (604,800,000ms) |

---

### Read Secret

Retrieve and delete a secret (burn after reading).

```http
GET /api/secrets/:id
```

**URL Parameters**

| Parameter | Type   | Description                               |
| --------- | ------ | ----------------------------------------- |
| `id`      | string | Secret ID (alphanumeric, 8-64 characters) |

**Response (Success)**

```json
{
  "encrypted": "Zm9vYmFyYmF6",
  "iv": "a2V5MTIzNDU2Nzg5MDEy"
}
```

**Response (Not Found)**

```json
{
  "error": {
    "code": "SECRET_NOT_FOUND",
    "message": "Secret not found or already read",
    "status": 404,
    "requestId": "1704067200000-a1b2c3d4"
  }
}
```

**Status Codes**

- `200 OK` - Secret retrieved and deleted
- `400 Bad Request` - Invalid ID format
- `404 Not Found` - Secret not found or already read
- `410 Gone` - Secret expired
- `429 Too Many Requests` - Rate limit exceeded
- `503 Service Unavailable` - Temporary service issue

**Important**: The secret is **atomically deleted** when read. A second request with the same ID will return 404.

---

### Validate Secret

Check if a secret exists without consuming it.

```http
GET /api/secrets/:id/validate
```

**URL Parameters**

| Parameter | Type   | Description                               |
| --------- | ------ | ----------------------------------------- |
| `id`      | string | Secret ID (alphanumeric, 8-64 characters) |

**Response (Success)**

```json
{
  "id": "AbCd1234EfGh5678",
  "status": "ready",
  "createdAt": 1704063600000,
  "expiresAt": 1704067200000,
  "ttl": 3600000
}
```

**Response (Not Found)**

```json
{
  "error": {
    "code": "SECRET_NOT_FOUND",
    "message": "Secret not found",
    "status": 404,
    "requestId": "1704067200000-a1b2c3d4"
  }
}
```

**Status Codes**

- `200 OK` - Secret exists and is ready
- `400 Bad Request` - Invalid ID format
- `404 Not Found` - Secret not found
- `429 Too Many Requests` - Rate limit exceeded
- `503 Service Unavailable` - Temporary service issue

---

## Error Codes

All error responses follow this standardized format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "status": 400,
    "requestId": "1704067200000-a1b2c3d4",
    "details": {}
  }
}
```

| Field       | Type   | Description                                |
| ----------- | ------ | ------------------------------------------ |
| `code`      | string | Machine-readable error code                |
| `message`   | string | Human-readable error description           |
| `status`    | number | HTTP status code                           |
| `requestId` | string | Unique request ID for support/debugging    |
| `details`   | object | Optional additional error details (if any) |

### Error Code Reference

| Code                     | Status | Description                                 |
| ------------------------ | ------ | ------------------------------------------- |
| `NOT_FOUND`              | 404    | Endpoint not found                          |
| `SECRET_NOT_FOUND`       | 404    | Secret not found or already read            |
| `MISSING_FIELDS`         | 400    | Required fields missing                     |
| `EMPTY_CONTENT`          | 400    | Encrypted data or IV is empty               |
| `INVALID_ENCODING`       | 400    | Invalid base64url encoding                  |
| `INVALID_IV_LENGTH`      | 400    | IV must be 12 bytes (16-22 base64url chars) |
| `INVALID_ID`             | 400    | Invalid secret ID format                    |
| `SECRET_TOO_LARGE`       | 413    | Encrypted data exceeds maximum size         |
| `CORS_FORBIDDEN`         | 403    | Origin not allowed for CORS                 |
| `RATE_LIMITED`           | 429    | Rate limit exceeded                         |
| `URL_TOO_LONG`           | 414    | Request URL exceeds maximum length          |
| `REQUEST_TOO_LARGE`      | 413    | Request body exceeds maximum size           |
| `HEADERS_TOO_LARGE`      | 431    | Request headers too large                   |
| `METHOD_NOT_ALLOWED`     | 405    | HTTP method not allowed                     |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | Expected JSON body                          |
| `PAYLOAD_TOO_LARGE`      | 413    | Request body too large                      |
| `BAD_REQUEST`            | 400    | Failed to read request body                 |
| `BAD_JSON`               | 400    | Invalid JSON                                |
| `STORE_FAILED`           | 500    | Failed to store secret                      |
| `ID_GENERATION_FAILED`   | 500    | Failed to generate unique ID                |
| `SERVICE_UNAVAILABLE`    | 503    | Service temporarily unavailable             |
| `INTERNAL_ERROR`         | 500    | Unexpected server error                     |

## Rate Limiting

API requests are rate limited per IP address.

### Limits

| Operation     | Limit | Window |
| ------------- | ----- | ------ |
| Create secret | 100   | 1 hour |
| Read secret   | 1000  | 1 hour |

### Rate Limit Response

When rate limited, the response includes:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Try again later.",
    "status": 429,
    "requestId": "1704067200000-a1b2c3d4"
  }
}
```

### Headers

Rate limit information is included in response headers:

| Header                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `X-RateLimit-Limit`     | Requests allowed per window              |
| `X-RateLimit-Remaining` | Remaining requests                       |
| `X-RateLimit-Reset`     | Unix timestamp of reset                  |
| `Retry-After`           | Seconds until rate limit resets (on 429) |

### Abuse Detection

Exceeding rate limits by 5x or more triggers automatic IP blacklisting for 24 hours.

## Security

### CORS

The API enforces CORS. Allowed origins must be configured via the `ALLOWED_ORIGINS` environment variable.

**Preflight Request**

```http
OPTIONS /api/secrets
Origin: https://volatile.sh
Access-Control-Request-Method: POST
```

**Response**

```http
Access-Control-Allow-Origin: https://volatile.sh
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Expose-Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, X-Request-ID, X-API-Version
Access-Control-Max-Age: 86400
```

### Security Headers

All responses include:

| Header                         | Value                                          |
| ------------------------------ | ---------------------------------------------- |
| `X-Content-Type-Options`       | `nosniff`                                      |
| `X-Frame-Options`              | `DENY`                                         |
| `Content-Security-Policy`      | `default-src 'none'; sandbox`                  |
| `Strict-Transport-Security`    | `max-age=31536000; includeSubDomains; preload` |
| `Referrer-Policy`              | `no-referrer`                                  |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                  |
| `Cross-Origin-Resource-Policy` | `same-origin`                                  |
| `Cross-Origin-Embedder-Policy` | `require-corp`                                 |
| `Cache-Control`                | `no-store`                                     |
| `Pragma`                       | `no-cache`                                     |
| `X-Request-ID`                 | Unique request identifier                      |
| `X-API-Version`                | API version number                             |

### Input Validation

- **Request size**: Maximum 2MB
- **URL length**: Maximum 2048 characters
- **Header size**: Maximum 8192 bytes
- **Secret size**: Maximum ~1MB encrypted (base64url)
- **ID format**: 8-64 alphanumeric characters

## Examples

### Complete Workflow (JavaScript)

```javascript
// 1. Generate encryption key
const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
  "encrypt",
  "decrypt",
]);

// 2. Encrypt the secret
const plaintext = "This is a secret message";
const iv = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv },
  key,
  new TextEncoder().encode(plaintext)
);

// 3. Encode to base64url
function b64urlEncode(data) {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const encrypted = b64urlEncode(new Uint8Array(ciphertext));
const ivEncoded = b64urlEncode(iv);

// 4. Create secret
const createResponse = await fetch("https://volatile.sh/api/secrets", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    encrypted,
    iv: ivEncoded,
    ttl: 3600000, // 1 hour
  }),
});

const { id, expiresAt } = await createResponse.json();

// 5. Export key for URL fragment
const rawKey = await crypto.subtle.exportKey("raw", key);
const keyEncoded = b64urlEncode(new Uint8Array(rawKey));

// 6. Create sharing URL
const shareUrl = `https://volatile.sh/#/${id}?k=${keyEncoded}&iv=${ivEncoded}`;

// 7. Recipient decrypts
async function decryptSecret(url) {
  const hash = url.hash.slice(1);
  const [, id, params] = hash.match(/^\/([^/?]+)(.*)$/) || [];
  const searchParams = new URLSearchParams(params);
  const k = searchParams.get("k");
  const iv = searchParams.get("iv");

  const readResponse = await fetch(`https://volatile.sh/api/secrets/${id}`);
  const { encrypted: encryptedData, iv: responseIv } = await readResponse.json();

  const keyData = Uint8Array.from(atob(k), (c) => c.charCodeAt(0));
  const ivData = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey("raw", keyData, "AES-GCM", false, ["decrypt"]);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivData }, key, ciphertext);

  return new TextDecoder().decode(decrypted);
}
```

### cURL Examples

**Create Secret**

```bash
curl -X POST https://volatile.sh/api/secrets \
  -H "Content-Type: application/json" \
  -d '{
    "encrypted": "Zm9vYmFyYmF6",
    "iv": "a2V5MTIzNDU2Nzg5MDEy",
    "ttl": 3600000
  }'
```

**Read Secret**

```bash
curl https://volatile.sh/api/secrets/AbCd1234EfGh5678
```

**Health Check**

```bash
curl https://volatile.sh/api/health
```

### Python Example

```python
import base64
import json
import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Generate key and encrypt
key = AESGCM.generate_key(bit_length=256)
aesgcm = AESGCM(key)
nonce = b'\x00' * 12  # In production, use random nonce
plaintext = b'Secret message'
ciphertext = aesgcm.encrypt(nonce, plaintext, None)

# Encode to base64url
encrypted = base64.urlsafe_b64encode(ciphertext).decode().rstrip('=')
iv = base64.urlsafe_b64encode(nonce).decode().rstrip('=')

# Create secret
response = requests.post('https://volatile.sh/api/secrets', json={
    'encrypted': encrypted,
    'iv': iv,
    'ttl': 3600000
})
data = response.json()
secret_id = data['id']

# Read secret
response = requests.get(f'https://volatile.sh/api/secrets/{secret_id}')
data = response.json()

# Decrypt
ciphertext = base64.urlsafe_b64decode(data['encrypted'] + '==')
nonce = base64.urlsafe_b64decode(data['iv'] + '==')
aesgcm = AESGCM(key)
decrypted = aesgcm.decrypt(nonce, ciphertext, None)
print(decrypted.decode())
```

## SDK Libraries

Official SDKs:

| Language   | Package                               |
| ---------- | ------------------------------------- |
| JavaScript | `@volatile.sh/sdk` (planned)          |
| Python     | `volatile-sh` (planned)               |
| Go         | `github.com/volatile-sh/go` (planned) |

## Support

For API issues or questions:

- Documentation: https://volatile.sh/docs.html
- GitHub Issues: https://github.com/residentialproxies/volatile.sh/issues
- Email: api@volatile.sh
