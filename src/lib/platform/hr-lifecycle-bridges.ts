// HR H4.4 ▸ สะพานวงจรพนักงาน → บอร์ดงาน (R12 · เปิดเองรายระบบ HR — ค่าปริยายปิด · D6)
//
// อยู่ที่ src/lib/platform/ ด้วยเหตุผลเดียวกับ kanban-bridges.ts: โมดูล HR ห้าม import บอร์ดงาน (fitness F2) ⇒ ชั้นประกอบอ่านจาก HR
// (ผ่านฟังก์ชันของ hr/lifecycle.ts เท่านั้น — ไฟล์นี้ไม่แตะตาราง HR ตรง) แล้วขอให้บอร์ดงานเปิดการ์ดผ่านประตูเดียว links.createCardFromExternal
//
// กติกา:
//   1. สวิตช์มาก่อน: kanban.enabled ∧ boardId ของระบบ HR ของ event — ปิด ⇒ return ก่อนอ่านอย่างอื่น
//   2. ยิงซ้ำได้: sourceKey hrlife:<พนักงาน>:<ชนิด>:<วันที่> · hrtask:<รายการตรวจ> ⇒ replay กี่รอบก็การ์ดใบเดียว · ผูกการ์ดกับรายการครั้งแรกเท่านั้น
//   3. เนื้อการ์ด = ชื่อ + วันที่ + หัวข้อของแม่แบบ เท่านั้น — ไม่มีเหตุผล/หมายเหตุการสิ้นสุด · บันทึก/ใบเตือน · คะแนน · เงินเดือน
//   4. ผู้รับผิดชอบ = ผู้จัดการสาขาของพนักงาน (assignTo UNIT_MANAGER) ไม่มีก็เจ้าของร้าน ◂
import { prisma } from "@/lib/core/db";
import { createCardFromExternal } from "@/lib/modules/kanban/links";
import { cardSubjectOf, getLifecyclePolicy, linkTaskCard, openTasksOf, type LifecyclePolicy } from "@/lib/modules/hr/lifecycle";
import type { BridgeEvent } from "./kanban-bridges";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const THAI_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "20 มิ.ย." ของวันที่ YYYY-MM-DD */
const dayLabel = (day: string): string => {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${THAI_MONTH[(m ?? 1) - 1] ?? ""}`.trim();
};
/** 09:00 เวลาไทยของวันที่ YYYY-MM-DD */
const morningOf = (day: string): Date => new Date(new Date(`${day}T09:00:00Z`).getTime() - BKK_OFFSET_MS);
const morningOfDate = (d: Date | null): Date | null => (d ? morningOf(d.toISOString().slice(0, 10)) : null);
function str(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v : null;
}

type Target = { hr: { tenantId: string; systemId: string }; policy: LifecyclePolicy; boardId: string; kanbanSystemId: string };
/** สวิตช์ของระบบ HR ของ event (ปิด = null ก่อนอ่านอื่นใด) + ระบบบอร์ดงานของบอร์ดปลายทาง */
async function targetOf(evt: BridgeEvent): Promise<Target | null> {
  if (!evt.systemId) return null;
  const hr = { tenantId: evt.tenantId, systemId: evt.systemId };
  const policy = await getLifecyclePolicy(hr);
  const boardId = policy.kanban.boardId;
  if (!policy.kanban.enabled || !boardId) return null;
  const board = await prisma.kanbanBoard.findFirst({ where: { id: boardId, tenantId: evt.tenantId, status: "ACTIVE" }, select: { systemId: true } });
  if (!board) return null;
  return { hr, policy, boardId, kanbanSystemId: board.systemId };
}

/**
 * ผู้รับการ์ด (r2-8): คนที่มีสิทธิ์งาน HR ของสาขานั้น — ผู้จัดการที่ดูแลสาขา (unitAccess "*" หรือ [] = ทุกสาขา) ตามค่าตั้ง ไม่งั้นเจ้าของร้าน ·
 * ไม่ใช่ตัวพนักงานที่การ์ดพูดถึงเด็ดขาด · ไม่มีใคร = ไม่มีผู้รับ
 */
async function assigneeOf(tenantId: string, unitId: string | null, subjectUserId: string | null, policy: LifecyclePolicy): Promise<string[]> {
  if (policy.assignTo === "UNIT_MANAGER") {
    const rows = await prisma.membership.findMany({ where: { tenantId, role: "MANAGER", acceptedAt: { not: null } }, orderBy: { createdAt: "asc" }, select: { userId: true, unitAccess: true }, take: 200 });
    for (const r of rows) {
      if (r.userId === subjectUserId) continue;
      const access = Array.isArray(r.unitAccess) ? (r.unitAccess as unknown[]).map(String) : [];
      if (access.length === 0 || access.includes("*") || (!!unitId && access.includes(unitId))) return [r.userId];
    }
  }
  const owners = await prisma.membership.findMany({ where: { tenantId, role: "OWNER", acceptedAt: { not: null } }, orderBy: { createdAt: "asc" }, select: { userId: true }, take: 20 });
  const owner = owners.find((o) => o.userId !== subjectUserId);
  return owner ? [owner.userId] : [];
}

/** ครบทดลองงาน / สัญญาใกล้หมด → การ์ด 1 ใบต่อ (พนักงาน, ชนิด, วันที่) */
export async function onMilestoneDue(evt: BridgeEvent): Promise<void> {
  const t = await targetOf(evt);
  if (!t) return;
  const employeeId = str(evt.payload, "employeeId");
  const milestone = str(evt.payload, "milestone");
  const dueDate = str(evt.payload, "dueDate");
  if (!employeeId || !dueDate || (milestone !== "PROBATION_END" && milestone !== "CONTRACT_END")) return;
  const who = await cardSubjectOf(t.hr, employeeId);
  if (!who) return;
  const head = milestone === "PROBATION_END" ? "ครบทดลองงาน" : "สัญญาจ้างใกล้หมด";
  await createCardFromExternal(
    { tenantId: evt.tenantId, systemId: t.kanbanSystemId, actorUserId: null },
    {
      boardId: t.boardId,
      title: `${head}: ${who.name} · ${dayLabel(dueDate)}`,
      dueAt: morningOf(dueDate),
      assigneeUserIds: await assigneeOf(evt.tenantId, who.unitId, who.linkedUserId, t.policy),
      sourceType: "AUTOMATION",
      sourceKey: `hrlife:${employeeId}:${milestone}:${dueDate}`,
    },
  );
}

/** รายการตรวจที่ยังเปิด → การ์ดละใบ (ผูกกลับที่รายการ) */
async function cardsForTasks(evt: BridgeEvent, t: Target, employeeId: string, kind: "ONBOARDING" | "OFFBOARDING"): Promise<void> {
  const who = await cardSubjectOf(t.hr, employeeId);
  if (!who) return;
  const tasks = await openTasksOf(t.hr, employeeId, kind);
  if (tasks.length === 0) return;
  const assignees = await assigneeOf(evt.tenantId, who.unitId, who.linkedUserId, t.policy);
  const head = kind === "ONBOARDING" ? "รับพนักงานใหม่" : "ออกจากงาน";
  for (const task of tasks) {
    const card = await createCardFromExternal(
      { tenantId: evt.tenantId, systemId: t.kanbanSystemId, actorUserId: null },
      {
        boardId: t.boardId,
        title: `${head}: ${who.name} · ${task.label}`,
        dueAt: morningOfDate(task.dueDate),
        assigneeUserIds: assignees,
        sourceType: "AUTOMATION",
        sourceKey: `hrtask:${task.id}`,
      },
    );
    if (!task.cardId) await linkTaskCard(t.hr, task.id, card.cardId);
  }
}

/** เริ่มรายการรับเข้า/ออกจากงาน → การ์ดต่อรายการที่ยังเปิด */
export async function onChecklistStarted(evt: BridgeEvent): Promise<void> {
  const t = await targetOf(evt);
  if (!t) return;
  const employeeId = str(evt.payload, "employeeId");
  const kind = str(evt.payload, "kind");
  if (!employeeId || (kind !== "ONBOARDING" && kind !== "OFFBOARDING")) return;
  await cardsForTasks(evt, t, employeeId, kind);
}

/** สิ้นสุดการจ้าง → การ์ดต่อรายการออกจากงานที่ยังเปิด (PIN/สิทธิ์ที่ปิดแล้ว = ไม่มีการ์ด) */
export async function onOffboarded(evt: BridgeEvent): Promise<void> {
  const t = await targetOf(evt);
  if (!t) return;
  const employeeId = str(evt.payload, "employeeId");
  if (!employeeId) return;
  await cardsForTasks(evt, t, employeeId, "OFFBOARDING");
}
