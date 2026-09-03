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
  await requireAccountPage(id, "account.doc.view"); // WO 0.2: ด่านสิทธิ์ก่อนโหลดข้อมูล · WO 0.3: หน้าอ่านอย่างเดียว = doc.view (doc.create ครอบให้อยู่แล้ว)
  return <ExpenseDetailPage systemId={id} docId={docId} slug="expense" err={sp.err} tab={sp.tab} msg={sp.msg} />;
}
