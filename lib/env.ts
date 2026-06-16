import { createHash } from "crypto";

const DEFAULT_ISSUER = "https://auth.honahec.cc";
const DEFAULT_APP_URL = "https://gurl.honahec.cc";
const DEFAULT_DOWNLOAD_BASE_URL = "https://api.honahec.cc/download";

function readEnv(key: string, fallback?: string) {
  const value = process.env[key]?.trim();
  if (value) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  if (isProductionBuild()) {
    return `__build_placeholder_${key.toLowerCase()}__`;
  }
  throw new Error(`Missing environment variable ${key}`);
}

function readOptionalEnv(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function readNumberEnv(key: string, fallback: number) {
  const raw = readOptionalEnv(key);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid number for ${key}`);
  }
  return value;
}

function parseList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isProductionBuild() {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  );
}

export function getAppConfig() {
  return {
    databaseUrl: readEnv("DATABASE_URL"),
    authSecret: readEnv("AUTH_SECRET"),
    authUrl: readEnv("AUTH_URL", DEFAULT_APP_URL),
    oidcIssuer: readEnv("OIDC_ISSUER", DEFAULT_ISSUER).replace(/\/$/, ""),
    oidcClientId: readEnv("OIDC_CLIENT_ID"),
    oidcClientSecret: readEnv("OIDC_CLIENT_SECRET"),
    oidcAdminGroups: parseList(readEnv("OIDC_ADMIN_GROUPS", "admin")),
    oidcUserGroups: parseList(readOptionalEnv("OIDC_USER_GROUPS")),
    publicAppUrl: readEnv("PUBLIC_APP_URL", DEFAULT_APP_URL).replace(/\/$/, ""),
    publicDownloadBaseUrl: readEnv(
      "PUBLIC_DOWNLOAD_BASE_URL",
      DEFAULT_DOWNLOAD_BASE_URL
    ).replace(/\/$/, ""),
    signedUrlTtlSeconds: Math.min(
      Math.max(readNumberEnv("SIGNED_URL_TTL_SECONDS", 60), 1),
      604800
    ),
  };
}

export function getEncryptionKey() {
  const raw = readOptionalEnv("APP_ENCRYPTION_KEY");

  if (!raw) {
    if (process.env.NODE_ENV === "production" && !isProductionBuild()) {
      throw new Error("Missing environment variable APP_ENCRYPTION_KEY");
    }

    return createHash("sha256")
      .update("dev-only-s3-signer-encryption-key")
      .digest();
  }

  const hex = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : null;
  if (hex?.byteLength === 32) {
    return hex;
  }

  const base64 = Buffer.from(raw, "base64");
  if (base64.byteLength === 32) {
    return base64;
  }

  throw new Error(
    "APP_ENCRYPTION_KEY must be a 32-byte key encoded as base64 or 64 hex characters"
  );
}

export function buildDownloadUrl(id: string) {
  const baseUrl = readEnv(
    "PUBLIC_DOWNLOAD_BASE_URL",
    DEFAULT_DOWNLOAD_BASE_URL
  ).replace(/\/$/, "");
  return `${baseUrl}/${id}`;
}
