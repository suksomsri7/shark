// WO 1.3 — ฟอร์มเอกสาร V2 (DESIGN-SPEC-V2 §5.2 · ภาพ g1/g17)
// ด่านสิทธิ์เรียกซ้ำที่นี่ด้วย (ไม่ใช่พึ่ง DocEditorPage อย่างเดียว) — ทะเบียน guard.ts ตรวจไฟล์นี้ตรง ๆ
import { notFound } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { requireAccountPage } from "@/lib/modules/account/guard";
import { DocEditorPage } from "@/lib/modules/account/DocEditorPage";
import { editorDefOf } from "@/lib/modules/account/doc-editor-config";

export default async function Page({ params }: { params: Promise<{ id: string; docType: string; docId: string }> }) {
  const { id, docType, docId } = await params;
  const def = editorDefOf(docType);
  if (!def || def.side !== "revenue") notFound();
  await requireAccountPage(id, "account.doc.create");
  return <DocEditorPage systemId={id} docType={docType as AccountDocType} docId={docId} />;
}
