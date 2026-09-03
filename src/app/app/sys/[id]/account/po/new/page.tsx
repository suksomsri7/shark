// WO 1.3 — ฟอร์มเอกสาร V2 (DESIGN-SPEC-V2 §5.2 · ภาพ g1/g17)
// ด่านสิทธิ์เรียกซ้ำที่นี่ด้วย (ไม่ใช่พึ่ง DocEditorPage อย่างเดียว) — ทะเบียน guard.ts ตรวจไฟล์นี้ตรง ๆ
import { requireAccountPage } from "@/lib/modules/account/guard";
import { DocEditorPage } from "@/lib/modules/account/DocEditorPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAccountPage(id, "account.doc.create");
  return <DocEditorPage systemId={id} docType="PURCHASE_ORDER" />;
}
