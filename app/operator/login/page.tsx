import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, authConfigured, signIn } from "@/auth";
import { env, isOperatorEmail } from "@/lib/server/env";

export const metadata: Metadata = { title: "Operator sign in", robots: { index: false, follow: false } };
export default async function LoginPage({ searchParams }: PageProps<"/operator/login">) {
  const query = await searchParams; const session = authConfigured ? await auth() : null; if (session?.user?.email && isOperatorEmail(session.user.email)) redirect("/operator/orders");
  const hasEmail = Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL); const hasGoogle = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  return <main className="container operator-login"><section className="operator-card"><span className="eyebrow">Authorised staff only</span><h1 className="section-title">Order operations</h1>{query.sent === "1" && <div className="pickup-box">Check your email for a secure sign-in link.</div>}{query.error === "1" && <div className="inline-error">Sign-in was not accepted. Use an allowlisted operator email.</div>}{!authConfigured && <div className="preview-block"><strong>Operator access needs production configuration.</strong><span>Configure the database, AUTH_SECRET, OPERATOR_EMAILS, and at least one sign-in provider.</span></div>}{hasEmail && <form action={async (formData) => { "use server"; await signIn("resend", formData); }}><div className="field"><label htmlFor="email">Operator email</label><input id="email" name="email" type="email" autoComplete="email" required /></div><button className="button-primary full" type="submit">Email me a sign-in link</button></form>}{hasGoogle && <form action={async () => { "use server"; await signIn("google", { redirectTo: "/operator/orders" }); }}><button className="button-secondary full" type="submit">Continue with Google</button></form>}<p className="summary-note">Only addresses in the server-side operator allowlist can sign in.</p></section></main>;
}
