// WO 1.9 — แก้ไขเอกสารประจำ
// ด่านสิทธิ์เรียกซ้ำที่นี่ด้วย — ทะเบียน guard.ts ตรวจไฟล์นี้ตรง ๆ (account.doc.create)
import { requireAccountPage } from "@/lib/modules/account/guard";
import { RecurringFormPage } from "@/lib/modules/account/recurring-page";

export default async function Page({ params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await params;
  await requireAccountPage(id, "account.doc.create");
  return <RecurringFormPage systemId={id} ruleId={ruleId} />;
}
