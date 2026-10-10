// บล็อก "ไฟล์แนบ" สำหรับหน้า 360 ของ CRM (ผู้ติดต่อ · บริษัท · ดีล) — CRM v2 · ใบ C1.6 · มติ C19 · ไฟล์ส่วนตัว C0.4
//
// 🔴 คอมโพเนนต์ฝั่งเซิร์ฟเวอร์: อ่านผ่าน facade `@/lib/modules/crm` (`files.listFiles`) แล้วส่งให้แผงฝั่ง client
//    (`crm/activities/_components/FilesPanel`) — ลิงก์ทุกแถวเป็นลิงก์ส่วนตัวที่ผูกกับผู้ดูคนนี้และหมดอายุ (X10)
// 🔴 หน้า GET ไม่เขียนอะไร · ระเบียนที่ผู้ดูมองไม่เห็น = บริการตอบ NOT_FOUND (หน้า 360 ตัดไป 404 ก่อนถึงบล็อกนี้อยู่แล้ว ·
//    ยกเว้นรายการวัตถุที่เก็บถาวร — หน้าเปิดได้ แต่บล็อกนี้แสดงการ์ด "เปิดดูไม่ได้แล้ว" แทน · C5.5-fix15 O-it6-d)

import { crmCan, files } from "@/lib/modules/crm";
import type { MemberActor } from "@/lib/modules/member";
import { FilesPanel } from "@/app/app/sys/[id]/crm/activities/_components/FilesPanel";

type Ctx = { tenantId: string; systemId: string; actorUserId: string | null };

// CRM C5.5-fix15 ▸ O-it6-d: the record page renders an ARCHIVED custom record (banner "เก็บถาวรแล้ว"), but `files.listFiles` only accepts a
//   live record (`assertEntity` RECORD: archivedAt null) ⇒ the block threw ActivitiesError NOT_FOUND inside the RSC (4× in the run5 server
//   log). A parent the service no longer accepts (archived · removed between the page's read and this block) = a quiet "not available" card,
//   not a thrown error. Other errors still throw. (`ActivitiesError` is matched by name + code: components must not import activities-shared.) ◂
const isNotFound = (e: unknown) => e instanceof Error && e.name === "ActivitiesError" && (e as { code?: unknown }).code === "NOT_FOUND";

export async function CrmFilesBlock({ ctx, actor, entityType, entityId }: { ctx: Ctx; actor: MemberActor; entityType: "CONTACT" | "COMPANY" | "DEAL" | "RECORD"; entityId: string }) {
  const list = await files.listFiles(ctx, actor, { entityType, entityId }).catch((e: unknown) => {
    if (isNotFound(e)) return null;
    throw e;
  });
  if (!list) {
    return (
      <section className="card flex min-w-0 flex-col gap-2 p-4" data-testid="crm-files-unavailable">
        <h2 className="font-semibold">ไฟล์แนบ</h2>
        <p className="text-sm text-[color:var(--color-muted)]">ไฟล์แนบของรายการนี้เปิดดูไม่ได้แล้ว (รายการถูกเก็บถาวรหรือถูกลบไปแล้ว)</p>
      </section>
    );
  }
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
