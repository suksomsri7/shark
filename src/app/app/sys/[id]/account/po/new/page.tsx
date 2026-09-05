// WO 1.3 — ฟอร์มเอกสาร V2 (DESIGN-SPEC-V2 §5.2 · ภาพ g1/g17)
// ด่านสิทธิ์เรียกซ้ำที่นี่ด้วย (ไม่ใช่พึ่ง DocEditorPage อย่างเดียว) — ทะเบียน guard.ts ตรวจไฟล์นี้ตรง ๆ
import { requireAccountPage } from "@/lib/modules/account/guard";
import { DocEditorPage } from "@/lib/modules/account/DocEditorPage";
import { parseAmountQueryToSatang } from "@/lib/modules/account/quick-create-parse";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // WO 9.4 — เติมผู้ติดต่อ/จำนวนเงินจากแผง "สร้างด่วน" (⌘K) เท่านั้น — ไม่ส่งมา = พฤติกรรมเดิมทุกอย่าง
  searchParams: Promise<{ contactId?: string; amount?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireAccountPage(id, "account.doc.create");
  const amountSatang = parseAmountQueryToSatang(sp.amount);
  const prefill = sp.contactId || amountSatang != null ? { contactId: sp.contactId, amountSatang } : undefined;
  return <DocEditorPage systemId={id} docType="PURCHASE_ORDER" prefill={prefill} />;
}
