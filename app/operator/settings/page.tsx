import type { Metadata } from "next";
import { OperatorSettingsForm } from "@/components/operator-settings-form";
import { requireOperator } from "@/lib/server/operator";
import { readSettings } from "@/lib/server/sheets";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ordering settings", robots: { index: false, follow: false } };
export default async function OperatorSettingsPage() {
  await requireOperator();
  const settings = await readSettings();
  return <main className="container operator-page"><div className="operator-head"><div><span className="eyebrow">Restaurant controls</span><h1 className="section-title">Ordering settings</h1><p>Manage restaurant details, hours, policies, approvals, and ordering availability.</p></div></div><OperatorSettingsForm initial={settings} /></main>;
}
