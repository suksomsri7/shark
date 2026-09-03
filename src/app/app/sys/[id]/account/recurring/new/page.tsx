// WO 1.9 — ตั้งเอกสารประจำใหม่ · รองรับ `?from=<docId>` (ปุ่ม "ตั้งเป็นเอกสารประจำ" บนหน้าเอกสาร §5.3)
// ด่านสิทธิ์เรียกซ้ำที่นี่ด้วย — เปิดหน้าแล้วบันทึกกฎที่ออกเอกสารเองได้ ⇒ ต้องมี account.doc.create ตั้งแต่หน้า
import { requireAccountPage } from "@/lib/modules/account/guard";
import { RecurringFormPage } from "@/lib/modules/account/recurring-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; docType?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireAccountPage(id, "account.doc.create");
  return <RecurringFormPage systemId={id} fromDocId={sp.from} docTypeHint={sp.docType} />;
}
