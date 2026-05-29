import { getServerSession } from "next-auth";
import { LoginPanel } from "@/app/login-panel";
import { DashboardClient } from "@/app/dashboard-client";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return <LoginPanel />;
  }

  return (
    <DashboardClient
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.email ?? "User",
        email: session.user.email ?? null,
      }}
    />
  );
}
