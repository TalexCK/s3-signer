# GURL

Next.js service for creating short download links that redirect to fresh
S3-compatible OSS SigV4 presigned URLs.

## Features

- PocketID OIDC login with admin group filtering.
- Per-user OSS profiles with encrypted `secretAccessKey` and optional session token.
- S3-compatible object browsing, link creation, link history, soft deletes, and cleanup.
- Public `GET /download/:id` endpoint that validates the stored link window and generates a new short-lived presigned URL on each request.
- Docker deployment with PostgreSQL persistence.

## Environment

Copy `.env.example` and fill the secrets.

Generate `APP_ENCRYPTION_KEY` with:

```bash
openssl rand -base64 32
```

Important URLs:

- Main service: `https://gurl.honahec.cc`
- Download base: `https://api.honahec.cc/download`
- OIDC callback: `https://gurl.honahec.cc/api/auth/callback/pocketid`

## Development

```bash
pnpm install
pnpm dev
```

PostgreSQL schema is created automatically when the app first touches the
database.

## Verification

```bash
pnpm lint
pnpm test
pnpm build
```

## Docker

```bash
docker compose up --build -d
```

Put a reverse proxy in front of the same container for both domains:

- `gurl.honahec.cc` routes to the whole app.
- `api.honahec.cc/download/*` routes to `/download/*` on the app.
