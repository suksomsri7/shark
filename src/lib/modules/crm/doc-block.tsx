// doc-block.tsx — ตัวโหลดบล็อก "ดีล" บนหน้าเอกสารบัญชี `/app/sys/[id]/account/docs/[docType]/[docId]` (ใบ C2.7)
//
// หน้าตาอยู่ที่ `src/components/crm/doc/DocDealLink.tsx` (แสดงผลล้วน)
// 🔴 AUDIT-CLASS X1: อ่านผ่าน `payments.dealForDoc(tenantId, docId, actor)` — เอกสารของร้านอื่น / ดีลที่ผู้ดูมองไม่เห็น /
//    ระบบ CRM ที่ยังเป็น uiVersion 1 ⇒ `null` แล้วหน้าเอกสารไม่เปลี่ยนไปแม้แต่ตัวอักษรเดียว
import { requireTenant } from "@/lib/core/context";
import { toMemberActor } from "@/lib/modules/member";
import { DocDealLink } from "@/components/crm/doc/DocDealLink";
import { dealForDoc } from "./payments";

export async function AccountDocCrmDealBlock({ docId }: { docId: string }) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const found = await dealForDoc(auth.active.tenantId, docId, actor).catch(() => null);
  if (!found) return null;
  return <DocDealLink title={found.title} path={found.path} />;
}
