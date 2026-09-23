import type { Metadata } from "next";
import { OperatorMenuEditor } from "@/components/operator-menu-editor";
import { categories } from "@/lib/menu";
import { requireOperator } from "@/lib/server/operator";
import { readMenu } from "@/lib/server/sheets";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu management", robots: { index: false, follow: false } };

export default async function OperatorMenuPage() {
  await requireOperator();
  const menuItems = await readMenu();
  return <main className="container operator-page operator-menu-page"><div className="operator-head"><div><span className="eyebrow">Customer catalogue</span><h1 className="section-title">Menu management</h1><p>Update the dishes customers see and the items currently available for pickup orders.</p></div></div><OperatorMenuEditor initialItems={menuItems} categories={categories} /></main>;
}
