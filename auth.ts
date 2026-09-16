import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import ResendProvider from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { accounts, authenticators, sessions, users, verificationTokens } from "@/db/schema";
import { env, isOperatorEmail } from "@/lib/server/env";

const db = getDb();
const providers: NextAuthConfig["providers"] = [];
if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL && db) providers.push(ResendProvider({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM_EMAIL }));
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && db) providers.push(Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }));

export const authConfigured = Boolean(db && env.AUTH_SECRET && providers.length && env.OPERATOR_EMAILS);
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET ?? "preview-only-auth-disabled-secret-000000000000000000",
  trustHost: true,
  adapter: db ? DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens, authenticatorsTable: authenticators }) : undefined,
  providers,
  pages: { signIn: "/operator/login", verifyRequest: "/operator/login?sent=1", error: "/operator/login?error=1" },
  session: { strategy: "database", maxAge: 8 * 60 * 60 },
  callbacks: { signIn({ user }) { return isOperatorEmail(user.email); }, session({ session }) { return session; } },
});
