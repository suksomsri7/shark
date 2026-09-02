import { requireAccountPage } from "@/lib/modules/account/guard";
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
  await requireAccountPage(id, "account.doc.create"); // WO 0.2: ด่านสิทธิ์ก่อนโหลดข้อมูล
  const docType = ("EXPENSE") as AccountDocType;
  return <ExpenseListPage systemId={id} docType={docType} variant="expense" tab={sp.tab} err={sp.err} />;
}
