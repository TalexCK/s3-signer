import "server-only";

import { getServerSession } from "next-auth";
import type { NextAuthOptions, Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { getAccessSettings, resolveRole, splitGroups } from "@/lib/access";
import { HttpError } from "@/lib/api";
import { getAppConfig } from "@/lib/env";

interface PocketIdProfile extends Profile {
  preferred_username?: string;
  username?: string;
  picture?: string;
  groups?: string[] | string;
}

function profileGroups(profile?: PocketIdProfile | null) {
  const groups = profile?.groups;
  if (Array.isArray(groups)) {
    return groups.filter((group): group is string => typeof group === "string");
  }
  if (typeof groups === "string") {
    return splitGroups(groups);
  }
  return [];
}

async function roleForGroups(groups: string[]) {
  return resolveRole(groups, await getAccessSettings());
}

export const authOptions: NextAuthOptions = {
  secret: getAppConfig().authSecret,
  session: {
    strategy: "jwt",
  },
  providers: [
    {
      id: "pocketid",
      name: "PocketID",
      type: "oauth",
      wellKnown: `${getAppConfig().oidcIssuer}/.well-known/openid-configuration`,
      clientId: getAppConfig().oidcClientId,
      clientSecret: getAppConfig().oidcClientSecret,
      authorization: {
        params: {
          scope: "openid profile email groups",
        },
      },
      idToken: true,
      checks: ["pkce", "state"],
      profile(profile: PocketIdProfile) {
        if (!profile.sub) {
          throw new Error("OIDC profile is missing sub");
        }

        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username ?? profile.username,
          email: profile.email,
          image: profile.picture,
          groups: profileGroups(profile),
        };
      },
    },
  ],
  callbacks: {
    async signIn({ profile }) {
      return !!(await roleForGroups(profileGroups(profile as PocketIdProfile)));
    },
    async jwt({ token, profile, user }) {
      const pocketProfile = profile as PocketIdProfile | undefined;
      if (pocketProfile?.sub) {
        token.sub = pocketProfile.sub;
        token.groups = profileGroups(pocketProfile);
      }
      if (user?.name) {
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      return attachTokenToSession(session, token);
    },
  },
};

async function attachTokenToSession(session: Session, token: JWT) {
  if (session.user) {
    const groups = Array.isArray(token.groups) ? token.groups : [];
    session.user.id = token.sub ?? "";
    session.user.groups = groups;
    session.user.role = (await roleForGroups(groups)) ?? undefined;
  }

  return session;
}

export async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  const role = await roleForGroups(session.user.groups ?? []);
  if (!role) {
    throw new HttpError(403, "Forbidden");
  }

  return {
    id: userId,
    name: session.user.name ?? session.user.email ?? "User",
    email: session.user.email ?? null,
    groups: session.user.groups ?? [],
    role,
  };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new HttpError(403, "Admin group required");
  }

  return user;
}
