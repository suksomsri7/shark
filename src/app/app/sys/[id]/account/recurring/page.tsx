// WO 1.9 — หน้ารายการ "เอกสารประจำ" (BLUEPRINT §0.3 ข้อ 7)
// ด่านสิทธิ์เรียกซ้ำที่นี่ด้วย (ไม่ใช่พึ่ง RecurringListPage อย่างเดียว) — ทะเบียน guard.ts ตรวจไฟล์นี้ตรง ๆ
import { requireAccountPage } from "@/lib/modules/account/guard";
import { RecurringListPage } from "@/lib/modules/account/recurring-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireAccountPage(id, "account.doc.view");
  return <RecurringListPage systemId={id} msg={sp.msg} err={sp.err} />;
}
