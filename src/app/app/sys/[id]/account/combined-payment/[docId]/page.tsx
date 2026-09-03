// WO 1.7 — หน้าเอกสาร 1 ใบของใบรวมจ่าย (CP) — DocDetailPage แสดง "เอกสารในกลุ่ม" แทนตารางรายการ
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
  await requireAccountPage(id, "account.doc.view");
  return <ExpenseDetailPage systemId={id} docId={docId} slug="combined-payment" err={sp.err} tab={sp.tab} msg={sp.msg} />;
}
