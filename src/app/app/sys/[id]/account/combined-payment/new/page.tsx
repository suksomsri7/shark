// WO 1.7 — ฟอร์มพิเศษ "ใบรวมจ่าย" (DESIGN-SPEC-V2 §5.2 K)
// เลือกผู้ขาย → ตารางบิลค้างจ่าย (PUR/EXP/DNR/DP) ติ๊กหลายใบ → รวมยอด → ออกเอกสาร
// `?ids=a,b,c` = มาจากปุ่ม bulk "จ่ายรวม" บนหน้ารายการบันทึกซื้อ/ค่าใช้จ่าย (เติมให้ล่วงหน้า)
import { requireAccountPage } from "@/lib/modules/account/guard";
import { GroupNewPage } from "@/lib/modules/account/group-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.doc.create");
  return <GroupNewPage tenantId={tenantId} systemId={systemId} docType="COMBINED_PAYMENT" ids={sp.ids} />;
}
