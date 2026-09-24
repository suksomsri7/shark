// บล็อก "กิจกรรมและโน้ต" สำหรับหน้า 360 ของ CRM (ผู้ติดต่อ · บริษัท · ดีล) — CRM v2 · ใบ C1.6 · มติ C19
//
// 🔴 คอมโพเนนต์ฝั่งเซิร์ฟเวอร์ (ไม่มี 'use client'): อ่านข้อมูลผ่าน facade `@/lib/modules/crm` เท่านั้น (fitness F2.3 — โค้ดนอกโมดูล
//    แตะ crm ได้เฉพาะ facade/ui) แล้วส่งให้แผงฝั่ง client (`crm/activities/_components/ActivityPanel`) ที่เรียก server actions เอง
// 🔴 หน้า GET ไม่เขียนอะไร — อ่านอย่างเดียว · ทุกการอ่านผ่าน where.ts ของผู้ดู (activityWhere ในบริการ)
// 🔴 ctx.systemId ถูก resolve ใหม่ในบริการ (ระบบ CRM ของร้านนี้) · actor มาจาก `toMemberActor` ของหน้า

import { activities, crmCan, thaiDateLabel, thaiTimeLabel } from "@/lib/modules/crm";
import type { MemberActor } from "@/lib/modules/member";
import { ActivityPanel } from "@/app/app/sys/[id]/crm/activities/_components/ActivityPanel";
// CRM C2.4 (รอบ 2 · F4) ▸ บล็อก "ไฟล์เสียงของสาย" — ฟัง/ลบได้จากหน้า 360 จริง ๆ (รอบแรกบริการมีแต่ไม่มีใครเรียก) ◂
import { CrmCallRecordings } from "@/components/crm/call/CrmCallRecordings";

type Ctx = { tenantId: string; systemId: string; actorUserId: string | null };
type Target = { contactId?: string; companyId?: string; dealId?: string; customRecordId?: string };

export async function CrmActivityBlock({
  ctx,
  actor,
  target,
  recordings,
}: {
  ctx: Ctx;
  actor: MemberActor;
  target: Target;
  /**
   * แสดงบล็อก "ไฟล์เสียงของสาย" ด้วยไหม และแสดงในนามของหน้าไหน (ใบ C2.4 รอบ 2 · F4)
   * ค่า `variant` ตัดสินชุด testid เพราะทะเบียนปุ่มห้ามมี testid ซ้ำสองแถว (ดูหัวไฟล์ `CrmCallRecordings.tsx`)
   */
  recordings?: "contact" | "deal";
}) {
  const [list, notes, outcomes, mentions, boards] = await Promise.all([
    activities.listActivities(ctx, actor, { ...target, pageSize: 30 }),
    activities.listNotes(ctx, actor, target),
    activities.outcomeOptions(ctx, actor),
    activities.mentionOptions(ctx, actor),
    activities.boardOptions(ctx, actor),
  ]);
  // CRM C1.7 ▸ ด่านคีย์เดียวกับบริการ (crm/access.ts ผ่าน facade) ◂
  const can = (action: string) => crmCan(actor, action);
  const canLog = can("crm.activity.create");
  const q = new URLSearchParams({ scope: "team", status: "pending" });
  for (const [k, v] of Object.entries(target)) if (typeof v === "string" && v) q.set(k, v);
  // ไฟล์เสียงมาจากรายการกิจกรรมที่โหลดมาแล้ว (`hasRecording` ของ DTO) — ไม่มีคิวรีเพิ่ม และไม่มี URL ถาวรในหน้า
  const recordingItems = recordings
    ? list.items
        .filter((i) => i.hasRecording)
        .map((i) => {
          const at = Date.parse(i.startAt ?? i.createdAt);
          const when = Number.isFinite(at) ? `${thaiDateLabel(at)} ${thaiTimeLabel(at)}` : "";
          return { activityId: i.id, label: `${when} · ${i.title}`.trim() };
        })
    : [];
  const panel = (
    <ActivityPanel
      systemId={ctx.systemId}
      target={target}
      items={list.items}
      notes={notes.items}
      outcomes={outcomes}
      mentionOptions={mentions}
      boards={canLog ? boards : []}
      currentUserId={actor.userId}
      canManage={actor.role === "OWNER" || actor.role === "MANAGER"}
      canLog={canLog}
      canComplete={can("crm.activity.complete")}
      allHref={`/app/sys/${ctx.systemId}/crm/activities?${q.toString()}`}
    />
  );
  if (!recordings || recordingItems.length === 0) return panel;
  return (
    <>
      {panel}
      <CrmCallRecordings systemId={ctx.systemId} variant={recordings} items={recordingItems} canRemove={canLog} />
    </>
  );
}
