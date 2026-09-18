// บล็อก "กิจกรรมและโน้ต" สำหรับหน้า 360 ของ CRM (ผู้ติดต่อ · บริษัท · ดีล) — CRM v2 · ใบ C1.6 · มติ C19
//
// 🔴 คอมโพเนนต์ฝั่งเซิร์ฟเวอร์ (ไม่มี 'use client'): อ่านข้อมูลผ่าน facade `@/lib/modules/crm` เท่านั้น (fitness F2.3 — โค้ดนอกโมดูล
//    แตะ crm ได้เฉพาะ facade/ui) แล้วส่งให้แผงฝั่ง client (`crm/activities/_components/ActivityPanel`) ที่เรียก server actions เอง
// 🔴 หน้า GET ไม่เขียนอะไร — อ่านอย่างเดียว · ทุกการอ่านผ่าน where.ts ของผู้ดู (activityWhere ในบริการ)
// 🔴 ctx.systemId ถูก resolve ใหม่ในบริการ (ระบบ CRM ของร้านนี้) · actor มาจาก `toMemberActor` ของหน้า

import { evaluate } from "@/lib/core/rbac";
import { activities } from "@/lib/modules/crm";
import type { MemberActor } from "@/lib/modules/member";
import { ActivityPanel } from "@/app/app/sys/[id]/crm/activities/_components/ActivityPanel";

type Ctx = { tenantId: string; systemId: string; actorUserId: string | null };
type Target = { contactId?: string; companyId?: string; dealId?: string; customRecordId?: string };

export async function CrmActivityBlock({ ctx, actor, target }: { ctx: Ctx; actor: MemberActor; target: Target }) {
  const [list, notes, outcomes, mentions, boards] = await Promise.all([
    activities.listActivities(ctx, actor, { ...target, pageSize: 30 }),
    activities.listNotes(ctx, actor, target),
    activities.outcomeOptions(ctx, actor),
    activities.mentionOptions(ctx, actor),
    activities.boardOptions(ctx, actor),
  ]);
  const can = (action: string) =>
    actor.role !== "CUSTOMER" && evaluate({ role: actor.role, unitAccess: actor.unitAccess, permissions: actor.permissions }, { module: "crm", action });
  const canLog = can("crm.activity.create");
  const q = new URLSearchParams({ scope: "team", status: "pending" });
  for (const [k, v] of Object.entries(target)) if (typeof v === "string" && v) q.set(k, v);
  return (
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
}
