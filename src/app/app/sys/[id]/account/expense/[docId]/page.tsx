import { requireAccountPage } from "@/lib/modules/account/guard";
import { ExpenseDetailPage } from "@/lib/modules/account/expense-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id, docId } = await params;
  const sp = await searchParams;
  await requireAccountPage(id, "account.doc.create"); // WO 0.2: ด่านสิทธิ์ก่อนโหลดข้อมูล
  return <ExpenseDetailPage systemId={id} docId={docId} slug="expense" err={sp.err} />;
}
