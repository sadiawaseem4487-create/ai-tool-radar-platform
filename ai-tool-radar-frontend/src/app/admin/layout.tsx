import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession } from "@/lib/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.RADAR_REQUIRE_AUTH !== "true") {
    return <>{children}</>;
  }

  const jar = await cookies();
  const token = jar.get("radar_session")?.value;
  const session = decodeSession(token);

  if (!session) {
    redirect("/login?next=/admin");
  }

  if (session.role !== "admin" && session.role !== "super_admin") {
    redirect("/");
  }

  return <>{children}</>;
}
