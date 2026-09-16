import "server-only";
import { redirect } from "next/navigation";
import { auth, authConfigured } from "@/auth";
import { isOperatorEmail } from "@/lib/server/env";

export async function requireOperator() {
  if (!authConfigured) redirect("/operator/login?setup=1");
  const session = await auth();
  if (!session?.user?.email || !isOperatorEmail(session.user.email)) redirect("/operator/login");
  return { email: session.user.email, name: session.user.name };
}
