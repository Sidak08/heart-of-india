import type { ReactNode } from "react";
import { OperatorNav } from "@/components/operator-nav";
import { getOperator } from "@/lib/server/operator";

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const operator = await getOperator();
  return <>{operator && <OperatorNav email={operator.email} />}{children}</>;
}
