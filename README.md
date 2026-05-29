# S3 Signer

S3 Signer is a small web service for creating short download links backed by
S3-compatible object storage. Users sign in with PocketID/OIDC, save encrypted
OSS profiles, browse objects, and create public links that redirect to fresh
short-lived presigned URLs.

## Features

- PocketID/OIDC login with admin group access control.
- Encrypted storage credentials for S3-compatible services such as Aliyun OSS.
- Object browser with keyword search.
- Link creation, link history, soft delete, and cleanup support.
- Public download endpoint that generates a new presigned URL for each request.
- Docker deployment with PostgreSQL persistence.

## Quick Start

Create a `.env` file:

```bash
cp .env.example .env
```

Fill the required values:

```env
AUTH_SECRET=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_ADMIN_GROUPS=admins
APP_ENCRYPTION_KEY=
```

Generate secrets with:

```bash
openssl rand -base64 32
```

Use one generated value for `AUTH_SECRET`, and another generated value for
`APP_ENCRYPTION_KEY`.

Start the service:

```bash
docker compose pull
docker compose up -d
```

By default Docker Compose uses the latest published image:

```text
ghcr.io/honahec/s3-signer:latest
```

To pin a specific image version, set `IMAGE_TAG` in `.env`:

```env
IMAGE_TAG=1.2.3
```

## OIDC

Register this callback URL in your OIDC provider:

```text
https://{PUBLIC_APP_URL}/api/auth/callback/pocketid
```

## Reverse Proxy

Run one app container and put two domains in front of it:

- `{PUBLIC_APP_URL}` proxies the whole app.
- `{PUBLIC_DOWNLOAD_BASE_URL}/*` proxies to `/download/*` on the same app.

The app listens on port `3000` inside Docker Compose.
