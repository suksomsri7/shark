// party-block.tsx — ตัวโหลดบล็อก "CRM" บนหน้าโปรไฟล์ผู้ติดต่อกลาง `/app/party/[partyId]` (ใบ C1.11 · RESOLUTIONS R-A)
//
// ผู้ติดต่อ · บริษัท · ดีลที่ยังเปิด ของ Party นี้ ในทุกระบบ CRM ของร้านที่เปิด CRM ใหม่ (uiVersion 2) — ระบบ uiVersion 1 ไม่เพิ่มอะไรเลย
// หน้าตาอยู่ที่ `src/components/crm/party/PartyCrmView.tsx` (แสดงผลล้วน)
// 🔴 AUDIT-CLASS X1: อ่านผ่าน brief.ts (การมองเห็นของ C1.7) — มองไม่เห็นผู้ติดต่อ = ไม่มีอะไรของเขาในบล็อก · ไม่มีรายการเลย = ไม่เรนเดอร์บล็อก
// 🔴 ไม่แตะข้อมูลคลินิก (ข้อมูลสุขภาพต้องใช้สิทธิ์คลินิก — หนี้ crm-C1.1) · ไม่แสดงเบอร์/อีเมล (หน้าโปรไฟล์มีของตัวเองตามสิทธิ์)
import { requireTenant } from "@/lib/core/context";
import { toMemberActor } from "@/lib/modules/member";
import { PartyCrmView, type PartyCrmRow } from "@/components/crm/party/PartyCrmView";
import { partyBriefs } from "./brief";

export async function PartyCrmBlock({ partyId }: { partyId: string }) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const found = await partyBriefs(auth.active.tenantId, actor, partyId).catch(() => []);
  const rows: PartyCrmRow[] = found.flatMap((f) =>
    f.brief.contact
      ? [{ systemId: f.systemId, systemName: f.systemName, contact: { id: f.brief.contact.id, name: f.brief.contact.name, lifecycleStage: f.brief.contact.lifecycleStage }, company: f.brief.company, openDeals: f.brief.openDeals }]
      : [],
  );
  return <PartyCrmView rows={rows} />;
}
