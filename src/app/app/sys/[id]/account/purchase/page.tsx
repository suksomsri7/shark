import { ExpenseListPage } from "@/lib/modules/account/expense-page";
import type { AccountDocType } from "@prisma/client";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; docType?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const docType = ("PURCHASE") as AccountDocType;
  return <ExpenseListPage systemId={id} docType={docType} variant="purchase" tab={sp.tab} err={sp.err} />;
}
