// WO 1.2 — หน้าเอกสาร 1 ใบของรับใบลดหนี้ (CNR)
import { requireAccountPage } from "@/lib/modules/account/guard";
import { ExpenseDetailPage } from "@/lib/modules/account/expense-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ err?: string; tab?: string; msg?: string }>;
}) {
  const { id, docId } = await params;
  const sp = await searchParams;
  await requireAccountPage(id, "account.doc.view"); // WO 0.2/0.3: หน้าอ่านอย่างเดียว = doc.view
  return <ExpenseDetailPage systemId={id} docId={docId} slug="credit-note-received" err={sp.err} tab={sp.tab} msg={sp.msg} />;
}
