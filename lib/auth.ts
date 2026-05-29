import "server-only";

import { getServerSession } from "next-auth";
import type { NextAuthOptions, Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
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
    return groups
      .split(/[,\s]+/)
      .map((group) => group.trim())
      .filter(Boolean);
  }
  return [];
}

function hasAdminGroup(groups: string[]) {
  const allowed = new Set(getAppConfig().oidcAdminGroups);
  return groups.some((group) => allowed.has(group));
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
      return hasAdminGroup(profileGroups(profile as PocketIdProfile));
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

function attachTokenToSession(session: Session, token: JWT) {
  if (session.user) {
    session.user.id = token.sub ?? "";
    session.user.groups = Array.isArray(token.groups) ? token.groups : [];
  }

  return session;
}

export async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  if (!hasAdminGroup(session.user.groups ?? [])) {
    throw new HttpError(403, "Forbidden");
  }

  return {
    id: userId,
    name: session.user.name ?? session.user.email ?? "User",
    email: session.user.email ?? null,
    groups: session.user.groups ?? [],
  };
}
