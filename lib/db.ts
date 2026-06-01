import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getAppConfig } from "@/lib/env";
import type { DownloadLink, OssProfile, ProfileSnapshot } from "@/lib/types";

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getAppConfig().databaseUrl,
      max: 10,
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  await ensureDatabase();
  return getPool().query<T>(text, values);
}

export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>
) {
  await ensureDatabase();
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function ensureDatabase() {
  if (!schemaReady) {
    schemaReady = migrate();
  }

  return schemaReady;
}

async function migrate() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS oss_profiles (
      id uuid PRIMARY KEY,
      owner_sub text NOT NULL,
      name text NOT NULL,
      endpoint text NOT NULL,
      region text NOT NULL,
      bucket text NOT NULL,
      access_key_id text NOT NULL,
      encrypted_secret_access_key text NOT NULL,
      encrypted_session_token text,
      force_path_style boolean NOT NULL DEFAULT false,
      is_default boolean NOT NULL DEFAULT false,
      disabled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS download_links (
      id uuid PRIMARY KEY,
      owner_sub text NOT NULL,
      oss_profile_id uuid NOT NULL REFERENCES oss_profiles(id),
      profile_snapshot jsonb NOT NULL,
      object_key text NOT NULL,
      valid_until timestamptz,
      max_downloads integer,
      downloads_served integer NOT NULL DEFAULT 0,
      download_filename text,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )
  `);
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_oss_profiles_owner ON oss_profiles(owner_sub)"
  );
  await db.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_oss_profiles_default ON oss_profiles(owner_sub) WHERE is_default = true AND disabled_at IS NULL"
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_download_links_owner_created ON download_links(owner_sub, created_at DESC)"
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_download_links_valid_until ON download_links(valid_until)"
  );
  await db.query(
    "ALTER TABLE download_links ALTER COLUMN valid_until DROP NOT NULL"
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_download_links_profile ON download_links(oss_profile_id)"
  );
}

export function mapProfile(row: QueryResultRow): OssProfile {
  return {
    id: row.id,
    ownerSub: row.owner_sub,
    name: row.name,
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    accessKeyId: row.access_key_id,
    encryptedSecretAccessKey: row.encrypted_secret_access_key,
    encryptedSessionToken: row.encrypted_session_token,
    forcePathStyle: row.force_path_style,
    isDefault: row.is_default,
    disabledAt: row.disabled_at?.toISOString?.() ?? row.disabled_at ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

export function mapLink(row: QueryResultRow): DownloadLink {
  return {
    id: row.id,
    ownerSub: row.owner_sub,
    ossProfileId: row.oss_profile_id,
    profileSnapshot: row.profile_snapshot as ProfileSnapshot,
    objectKey: row.object_key,
    validUntil: row.valid_until?.toISOString?.() ?? row.valid_until ?? null,
    maxDownloads: row.max_downloads,
    downloadsServed: row.downloads_served,
    downloadFilename: row.download_filename,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    deletedAt: row.deleted_at?.toISOString?.() ?? row.deleted_at ?? null,
  };
}
