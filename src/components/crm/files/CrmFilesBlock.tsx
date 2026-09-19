// บล็อก "ไฟล์แนบ" สำหรับหน้า 360 ของ CRM (ผู้ติดต่อ · บริษัท · ดีล) — CRM v2 · ใบ C1.6 · มติ C19 · ไฟล์ส่วนตัว C0.4
//
// 🔴 คอมโพเนนต์ฝั่งเซิร์ฟเวอร์: อ่านผ่าน facade `@/lib/modules/crm` (`files.listFiles`) แล้วส่งให้แผงฝั่ง client
//    (`crm/activities/_components/FilesPanel`) — ลิงก์ทุกแถวเป็นลิงก์ส่วนตัวที่ผูกกับผู้ดูคนนี้และหมดอายุ (X10)
// 🔴 หน้า GET ไม่เขียนอะไร · ระเบียนที่ผู้ดูมองไม่เห็น = บริการตอบ NOT_FOUND (หน้า 360 ตัดไป 404 ก่อนถึงบล็อกนี้อยู่แล้ว)

import { crmCan, files } from "@/lib/modules/crm";
import type { MemberActor } from "@/lib/modules/member";
import { FilesPanel } from "@/app/app/sys/[id]/crm/activities/_components/FilesPanel";

type Ctx = { tenantId: string; systemId: string; actorUserId: string | null };

export async function CrmFilesBlock({ ctx, actor, entityType, entityId }: { ctx: Ctx; actor: MemberActor; entityType: "CONTACT" | "COMPANY" | "DEAL" | "RECORD"; entityId: string }) {
  const list = await files.listFiles(ctx, actor, { entityType, entityId });
  // CRM C1.7 ▸ ด่านเดียวกับบริการ `files.attachFile`: คีย์แก้ไขของระเบียนแม่ (crm.<entity>.update) ผ่าน crmCan ◂
  const attachKey = { CONTACT: "crm.contact.update", COMPANY: "crm.company.update", DEAL: "crm.deal.update", RECORD: "crm.record.update" }[entityType];
  const canAttach = crmCan(actor, attachKey);
  return (
    <FilesPanel
      systemId={ctx.systemId}
      entityType={entityType}
      entityId={entityId}
      items={list.items}
      currentUserId={actor.userId}
      canManage={actor.role === "OWNER" || actor.role === "MANAGER"}
      canAttach={canAttach}
    />
  );
}
