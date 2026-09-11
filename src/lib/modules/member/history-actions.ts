"use server";

// history-actions.ts — server action ของแท็บ "ประวัติ" ในหน้าสมาชิก 360 (M3.7 · ภาพ 08 ซ้าย/กลาง)
//
// 🔴 ด่านเดียว: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย · ไม่มี = assertCan โยน) → ระบบนี้เป็น MEMBER
//    ของร้านนี้จริง → `listHistory` ตัดสิน "เห็นสมาชิกคนนี้ไหม" + ขอบเขตสาขาของแถวเอง (ด่านเดียวกับหน้า 360)
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิด/ค่าคงที่อยู่ที่ `history-kinds.ts` (บทเรียน M2.2)
// 🔴 ข้อความ error กลับหน้าจอผ่าน `safeReason` เสมอ (ไทย · ไม่โทษผู้ใช้)

import { requireTenant } from "@/lib/core/context";
import { safeReason } from "@/lib/core/errors";
import { assertCan } from "@/lib/core/rbac";
import { canReadMember, toMemberActor } from "./access";
import { prisma } from "./db";
import { listHistory, toHistoryPageView } from "./history";
import {
  HISTORY_DEFAULT_RANGE,
  HISTORY_PAGE_SIZE,
  historyRangeFrom,
  isHistoryKind,
  isHistoryRange,
  type HistoryActionResult,
  type HistoryKindFilter,
  type HistoryPageView,
} from "./history-kinds";

/** หน้าถัดไป/เปลี่ยนตัวกรองของไทม์ไลน์ (ชนิด · ช่วงเวลา · สาขา · เคอร์เซอร์) */
export async function memberHistoryAction(
  systemId: string,
  memberId: string,
  q: { kind?: string | null; range?: string | null; unitId?: string | null; cursor?: string | null },
): Promise<HistoryActionResult<HistoryPageView>> {
  try {
    const auth = await requireTenant();
    const tenantId = auth.active.tenantId;
    const actor = toMemberActor(auth.user.id, auth.active);
    if (!canReadMember(actor)) {
      assertCan({ role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions }, { module: "member", action: "member.customer.read" });
    }
    const system = await prisma.appSystem.findFirst({ where: { id: String(systemId ?? ""), tenantId, type: "MEMBER" }, select: { id: true } });
    if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

    const kindRaw = String(q?.kind ?? "all");
    const kind: HistoryKindFilter = kindRaw === "all" || !isHistoryKind(kindRaw) ? "all" : kindRaw;
    const rangeRaw = String(q?.range ?? HISTORY_DEFAULT_RANGE);
    const range = isHistoryRange(rangeRaw) ? rangeRaw : HISTORY_DEFAULT_RANGE;
    const unitId = q?.unitId ? String(q.unitId) : null;

    const result = await listHistory({ tenantId, systemId: system.id, actorUserId: auth.user.id }, actor, String(memberId ?? ""), {
      kind,
      from: historyRangeFrom(range),
      unitId,
      cursor: q?.cursor ? String(q.cursor) : null,
      take: HISTORY_PAGE_SIZE,
    });
    return { ok: true, data: toHistoryPageView(result) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "โหลดประวัติไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
