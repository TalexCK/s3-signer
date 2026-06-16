import "server-only";

import { query } from "@/lib/db";
import { getAppConfig } from "@/lib/env";

export type AccessRole = "admin" | "user";

export interface AccessSettings {
  adminGroups: string[];
  userGroups: string[];
}

const ADMIN_GROUPS_KEY = "oidc_admin_groups";
const USER_GROUPS_KEY = "oidc_user_groups";

export function splitGroups(value?: string | null) {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((group) => group.trim())
    .filter(Boolean);
}

export async function getAccessSettings(): Promise<AccessSettings> {
  const result = await query(
    "SELECT key, value FROM app_settings WHERE key IN ($1, $2)",
    [ADMIN_GROUPS_KEY, USER_GROUPS_KEY]
  );
  const values = new Map<string, string>(
    result.rows.map((row) => [row.key, row.value])
  );

  return {
    adminGroups: splitGroups(
      values.get(ADMIN_GROUPS_KEY) ?? getAppConfig().oidcAdminGroups.join(",")
    ),
    userGroups: splitGroups(
      values.get(USER_GROUPS_KEY) ?? getAppConfig().oidcUserGroups.join(",")
    ),
  };
}

export async function saveAccessSettings(settings: AccessSettings) {
  await query(
    `INSERT INTO app_settings (key, value)
     VALUES ($1, $2), ($3, $4)
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = now()`,
    [
      ADMIN_GROUPS_KEY,
      settings.adminGroups.join(","),
      USER_GROUPS_KEY,
      settings.userGroups.join(","),
    ]
  );
}

export function resolveRole(groups: string[], settings: AccessSettings) {
  const userGroups = new Set(groups);
  if (settings.adminGroups.some((group) => userGroups.has(group))) {
    return "admin" satisfies AccessRole;
  }
  if (settings.userGroups.some((group) => userGroups.has(group))) {
    return "user" satisfies AccessRole;
  }

  return null;
}
