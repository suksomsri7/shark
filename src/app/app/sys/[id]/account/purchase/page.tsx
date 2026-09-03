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
  await requireAccountPage(id, "account.doc.view"); // WO 0.2: ด่านสิทธิ์ก่อนโหลดข้อมูล · WO 0.3: หน้าอ่านอย่างเดียว = doc.view (doc.create ครอบให้อยู่แล้ว)
  const docType = ("PURCHASE") as AccountDocType;
  return <ExpenseListPage systemId={id} docType={docType} variant="purchase" tab={sp.tab} err={sp.err} />;
}
