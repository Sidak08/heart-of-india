import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OperatorLoginForm } from "@/components/operator-login-form";
import { getOperator, operatorConfigured } from "@/lib/server/operator";

export const metadata: Metadata = { title: "Operator sign in", robots: { index: false, follow: false } };
export default async function LoginPage({ searchParams }: PageProps<"/operator/login">) {
  const query = await searchParams; if (await getOperator()) redirect("/operator");
  return <main className="container operator-login"><section className="operator-card"><span className="eyebrow">Authorised staff only</span><h1 className="section-title">Order operations</h1>{(query.setup === "1" || !operatorConfigured) && <div className="preview-block"><strong>Operator access needs configuration.</strong><span>Set OPERATOR_EMAIL, OPERATOR_PASSWORD_HASH, and OPERATOR_SESSION_SECRET in the server environment.</span></div>}{operatorConfigured && <OperatorLoginForm />}<p className="summary-note">Your password is checked on the server and is never stored in the browser.</p></section></main>;
}
