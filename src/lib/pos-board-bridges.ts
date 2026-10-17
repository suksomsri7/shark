// pos-board-bridges.ts — composition root "บอร์ดงาน + ห้องทีม" ของ POS (POS P3.8 ▸ R1–R10 · มติ 1–11 · CD-1…CD-8 ◂)
//
// 🔴 ทำไมอยู่นอก `src/lib/modules/pos/`: งานนี้เปิดการ์ดในบอร์ดงานและโพสต์เข้าห้องแชททีม — เส้น pos→kanban / pos→meeting
//    ไม่อยู่ใน allowlist ของ fitness F2 (ตั้งใจให้ POS ไม่รู้จักทั้งสองโมดูล) ⇒ ต่อสายที่นี่แบบเดียวกับ `pos-receipt-bridges.ts` (P1.11)
// 🔴 ขอบเขต (มติ 9): บอร์ดงานเขียนผ่าน `kanban/links.createCardFromExternal` (การ์ดใหม่ · sourceKey กันซ้ำ) + `kanban/moves.moveCard` (ย้ายเข้าคอลัมน์เสร็จ) ·
//    แชททีมเขียนผ่าน `@/lib/modules/meeting` (index) `postSystemMessage(…, tx)` เท่านั้น · import บอร์ดงานเฉพาะ links/moves/notify/types
//    ⚠️ ข้อยกเว้นเดียว (CONTROLLER-DECISION CD-P38-B1 ใน wo-notes): ความเห็น "กลับมาขายแล้ว" บนบอร์ดที่ไม่มีคอลัมน์เสร็จ (R5) — บอร์ดงานไม่มีประตู
//    เขียนความเห็นในนามระบบให้โมดูลอื่น ⇒ เขียนแถวตรงแบบเดียวกับ `platform/kanban-bridges.ts#systemComment` (กันซ้ำด้วยข้อความเดิม)
// 🔴 ปริยายปิดทุกอย่าง (มติ 3): consumer/sweep คืนก่อนอ่านบอร์ดงาน/แชททีมใด ๆ เมื่อร้านไม่ได้เปิด
// 🔴 ผู้กระทำ (มติ 5): การ์ดจากเหตุการณ์/ตัวกวาด = ระบบ (actorUserId null · createdById null) · ผู้รับ = ผู้จัดการคนแรกของสาขา ·
//    การ์ดจุดผิดปกติแบบกดเอง = คนกด (ต้องผ่าน pos.report.view + pos.report.anomaly ที่สาขา และ EDITOR ของบอร์ด)
// 🔴 ค่าตั้งเพี้ยน (บอร์ด/ห้องใช้ไม่ได้) = ไม่ throw · ops WARN source "pos.board" ครั้งเดียวต่อ (ระบบ, กฎ, วันไทย) (CD-5) · error DB ที่ไม่คาด = throw (คิว retry)
// 🔴 ห้องทีม: ธง AuditLog pos.teamroom.posted + โพสต์ใน tx เดียวใต้ advisory lock ต่อคีย์ ⇒ ซ้ำ/พร้อมกัน = ข้อความเดียว · ห้องถูกปฏิเสธ = ย้อนทั้งคู่
// 🔴 PDPA (มติ 10): ไม่มีชื่อพนักงาน/ลูกค้า · เบอร์ · ทิป · ค่าคอมฯ · เงินเดือน บนการ์ด/โพสต์ (ข้อความประกอบใน board-settings-shared.ts)

import { prisma } from "@/lib/core/db";
import type { OutboxHandler } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { canOpenCardOnBoard, createCardFromExternal, type AddLinkInput } from "@/lib/modules/kanban/links";
import { moveCard } from "@/lib/modules/kanban/moves";
import { cardLink } from "@/lib/modules/kanban/notify";
import type { KanbanActor, KanbanCtx } from "@/lib/modules/kanban/types";
import { listRoomOptions, postSystemMessage } from "@/lib/modules/meeting";
import {
  isBoardSettingsId,
  posAnomalyCardText,
  posAnomalyValueText,
  posBoardIdForUnit,
  posBoardKeys,
  posBoardSettings,
  posRefundCardText,
  posRoomForUnit,
  posShiftCardText,
  posSoldOutBackComment,
  posSoldOutCardText,
  posTeamRoomSettings,
  posZPostBody,
  type PosBoardLocale,
  type PosBoardSettings,
  type PosRoomRef,
  type PosTeamRoomSettings,
} from "@/lib/modules/pos/board-settings-shared";
import { updatePosBoardSettings, type PosBoardSettingsResult } from "@/lib/modules/pos/board-settings";
import { POS_ANOMALY_RULES, posDayCutoffMinutes, posReceiptLocale } from "@/lib/modules/pos/settings-shared";
import { bkkBusinessDate, reportAnomalies } from "@/lib/modules/pos/reports";
import { composeBrief, TEAM_SAFE_SECTIONS } from "@/lib/modules/pos/ai-brief-shared";
import { loadBriefInput } from "@/lib/modules/pos/ai-brief";
import type { RegisterActor, RegisterRole } from "@/lib/modules/pos/register-shared";

type Evt = Parameters<OutboxHandler>[0];
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const OPS_SOURCE = "pos.board";
const ROOM_AUTHOR = "system:pos";
const ROOM_FLAG = { action: "pos.teamroom.posted", targetType: "PosTeamRoomPost" } as const;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const BKK_MS = 7 * HOUR_MS;
const MAX_SYSTEMS = 200;
const MAX_ROWS = 500;
const DEFAULT_BUDGET_MS = 20_000;

/** actor ของ "ระบบ" สำหรับ moveCard (รูปเดียวกับ kanban-bridges SYSTEM_ACTOR) — actorUserId null ⇒ ประวัติขึ้น "ระบบทำ" */
const SYSTEM_ACTOR: KanbanActor = { userId: "", role: "OWNER", unitAccess: ["*"], permissions: {}, apiRole: "ADMIN" };
const systemCtx = (tenantId: string, kanbanSystemId: string): KanbanCtx => ({ tenantId, systemId: kanbanSystemId, actorUserId: null });
const moveCtx = (tenantId: string, kanbanSystemId: string): KanbanCtx => ({ tenantId, systemId: kanbanSystemId, actorUserId: null, actor: SYSTEM_ACTOR });

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const bkkYmd = (d: Date) => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
const bkkHour = (d: Date) => new Date(d.getTime() + BKK_MS).getUTCHours();
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** 12:00 ของวันไทยถัดไปจาก d (R4 กำหนดส่งการ์ดตรวจเงิน) */
const noonNextBkk = (d: Date) => new Date(Date.parse(`${bkkYmd(d)}T00:00:00Z`) + DAY_MS + (12 - 7) * HOUR_MS);
/** ที่อยู่เว็บของแอป — ลิงก์ URL ของการ์ดต้องเป็น http(s) เต็ม (kanban links.normalizeInput) · อ่าน process.env ตรง (แบบ crm/emails) */
const appUrl = () => (str(process.env.APP_URL).trim() || "https://shark.in.th").replace(/\/+$/, "");
const posUrl = (posSystemId: string, path: string) => `${appUrl()}/app/sys/${posSystemId}/pos/${path}`;
const localeOf = (settings: unknown): PosBoardLocale => posReceiptLocale(settings);

type PosSys = { id: string; tenantId: string; settings: unknown };
async function posSystemOf(tenantId: string, systemId: string | null | undefined): Promise<PosSys | null> {
  if (!tenantId || !systemId) return null;
  return prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true, tenantId: true, settings: true } });
}
async function unitNameOf(tenantId: string, unitId: string): Promise<string> {
  return (await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId }, select: { name: true } }))?.name ?? "";
}
async function linkedUnitIds(tenantId: string, posSystemId: string): Promise<string[]> {
  return (await prisma.appSystemUnit.findMany({ where: { tenantId, systemId: posSystemId, type: "POS" }, select: { unitId: true } })).map((r) => r.unitId);
}

/**
 * ops WARN ครั้งเดียวต่อ (ระบบ POS, กฎ, วันไทย) (CD-5) — กุญแจอยู่หัว detail ของ OpsEvent ของร้านนั้น (แบบ crm.teamroom warnOnceKey) · ids ล้วน ·
 * ตรวจ + เขียนใน tx เดียวใต้ advisory lock ต่อกุญแจ ⇒ event เดียวกันวิ่งพร้อมกันสองทาง = แถวเดียว (แถว OpsEvent ระดับ WARN = สิ่งเดียวกับที่ logOps เขียน)
 * ล้มเอง = เงียบ (logger ห้ามพางานหลักพัง)
 */
async function warnOnce(tenantId: string, posSystemId: string, rule: string, now: Date, message: string, detail: string): Promise<void> {
  const key = `warn:${posSystemId}:${rule}:${bkkYmd(now)}`;
  try {
    await prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pos:board:${tenantId}:${key}`}, 0))`;
      const had = await tx.opsEvent.findFirst({ where: { tenantId, source: OPS_SOURCE, detail: { startsWith: `${key} ` } }, select: { id: true } });
      if (had) return;
      await tx.opsEvent.create({ data: { level: "WARN", source: OPS_SOURCE, message, detail: `${key} ${detail}`.slice(0, 4000), tenantId } });
    });
  } catch {
    await logOps("WARN", OPS_SOURCE, message, { tenantId, detail: `${key} ${detail}` });
  }
}

type BoardTarget = { boardId: string; kanbanSystemId: string };
/** R3: boardByUnit[unit] ?? defaultBoardId → บอร์ด ACTIVE ของร้านนี้ → ระบบ KANBAN ที่เปิดอยู่ → มีคอลัมน์ใช้งาน · อย่างใดไม่ผ่าน = null */
async function resolveBoard(tenantId: string, b: PosBoardSettings, unitId: string | null): Promise<BoardTarget | null> {
  const id = posBoardIdForUnit(b, unitId);
  if (!id) return null;
  const board = await prisma.kanbanBoard.findFirst({ where: { id, tenantId, status: "ACTIVE" }, select: { id: true, systemId: true } });
  if (!board) return null;
  const sys = await prisma.appSystem.findFirst({ where: { id: board.systemId, tenantId, type: "KANBAN", active: true }, select: { id: true } });
  if (!sys) return null;
  const col = await prisma.kanbanColumn.findFirst({ where: { boardId: board.id, tenantId, systemId: board.systemId, status: "ACTIVE" }, select: { id: true } });
  return col ? { boardId: board.id, kanbanSystemId: board.systemId } : null;
}

/** ผู้จัดการคนแรก (ตามลำดับเข้าร้าน) ที่ดูแลสาขานี้ — สำเนาของ kanban-bridges managerOfUnits (R3) · ไม่มี = ไม่มอบหมาย */
async function managerOfUnit(tenantId: string, unitId: string): Promise<string | null> {
  const rows = await prisma.membership.findMany({ where: { tenantId, role: "MANAGER" }, orderBy: { createdAt: "asc" }, select: { userId: true, unitAccess: true } });
  for (const r of rows) {
    const access = Array.isArray(r.unitAccess) ? (r.unitAccess as unknown[]).map(String) : [];
    if (access.includes("*") || access.includes(unitId)) return r.userId;
  }
  return null;
}

async function cardBySourceKey(tenantId: string, sourceKey: string) {
  return prisma.kanbanCard.findFirst({ where: { tenantId, sourceKey }, select: { id: true, cardNo: true, boardId: true, systemId: true, completedAt: true } });
}

/**
 * ทำ fn ทีละรายต่อกุญแจ (pg_advisory_xact_lock ใน tx สั้นที่ถือล็อกไว้เฉย ๆ — fn ใช้ connection อื่นของ pool ได้ตามปกติ) ·
 * เหตุผล: ประตู createCardFromExternal กันการ์ดซ้ำได้ แต่ผู้แพ้ที่ชน unique คืน "ใบเดิม" ทันทีขณะผู้ชนะยังตั้งผู้รับ/ลิงก์ไม่เสร็จ ⇒
 * event เดียวกันส่งซ้ำพร้อมกัน (lease หมด · cron + after-drain) ต้องจบด้วยการ์ดที่ครบแล้วทุกทาง · ล็อกหลุดเองตอน commit/rollback
 */
async function underKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx: Tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      return fn();
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/** การ์ดในนามระบบ (sourceType AUTOMATION · createdById null) — กันซ้ำด้วย sourceKey ที่ประตูของบอร์ดงาน + ล็อกต่อกุญแจ */
async function systemCard(
  tenantId: string,
  target: BoardTarget,
  input: { title: string; description: string; sourceKey: string; unitId: string; assignManager: boolean; dueAt?: Date | null; links?: AddLinkInput[] },
): Promise<{ created: boolean; cardId: string }> {
  const manager = input.assignManager ? await managerOfUnit(tenantId, input.unitId) : null;
  const r = await underKeyLock(`pos:card:${tenantId}:${input.sourceKey}`, () => createCardFromExternal(systemCtx(tenantId, target.kanbanSystemId), {
    boardId: target.boardId,
    title: input.title,
    description: input.description,
    sourceType: "AUTOMATION",
    sourceKey: input.sourceKey,
    assigneeUserIds: manager ? [manager] : [],
    dueAt: input.dueAt ?? null,
    links: input.links ?? [],
  }));
  return { created: r.created, cardId: r.cardId };
}

class RoomRefused extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "RoomRefused";
  }
}
/**
 * R7 — ธง + โพสต์ใน tx เดียว: advisory lock ต่อคีย์ → ธงมีแล้ว = ซ้ำ → แถว AuditLog (SYSTEM) → postSystemMessage(…, tx) ·
 * ห้องถูกปฏิเสธ = ย้อนทั้งคู่ (ไม่มีธง) + ops WARN ครั้งเดียว · ไม่มี outbox event ใหม่
 */
async function postFlagged(tenantId: string, posSystemId: string, key: string, room: PosRoomRef, body: string, rule: string, now: Date): Promise<"posted" | "dup" | "refused"> {
  try {
    return await prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pos:room:${key}`}, 0))`;
      const had = await tx.auditLog.findFirst({ where: { tenantId, action: ROOM_FLAG.action, targetType: ROOM_FLAG.targetType, targetId: key }, select: { id: true } });
      if (had) return "dup" as const;
      await tx.auditLog.create({
        data: { tenantId, actorType: "SYSTEM", actorId: null, action: ROOM_FLAG.action, targetType: ROOM_FLAG.targetType, targetId: key, after: { posSystemId, meetingSystemId: room.meetingSystemId, channelId: room.channelId } },
      });
      const r = await postSystemMessage({ tenantId, systemId: room.meetingSystemId, channelId: room.channelId, body, author: ROOM_AUTHOR }, tx);
      if (!r.ok) throw new RoomRefused(r.reason);
      return "posted" as const;
    });
  } catch (e) {
    if (e instanceof RoomRefused) {
      await warnOnce(tenantId, posSystemId, rule, now, "โพสต์เข้าห้องทีมไม่สำเร็จ — ห้องที่ผูกไว้ใช้ไม่ได้", `room:${room.meetingSystemId}/${room.channelId} reason:${e.reason}`);
      return "refused";
    }
    throw e;
  }
}

// ═════════════════════════ R4 + R7 consumer ของ pos.shift.closed ═════════════════════════
export type ShiftClosedResult = { card: "created" | "exists" | "skipped" | "no-board"; room: "posted" | "dup" | "refused" | "no-room" | "skipped" };

/**
 * consumer ของ outbox `pos.shift.closed` (main step ใน outbox-consumers.ts ผ่าน withAutomation) · idempotent (sourceKey + ธงห้อง)
 * การ์ดตรวจเงิน (R4) และโพสต์ Z (R7) ทำทั้งคู่เสมอ — ห้องพังไม่พาการ์ดพัง · error ที่ไม่คาดของขาใด = throw ท้ายสุด (คิว retry)
 */
export async function onShiftClosed(evt: Evt): Promise<ShiftClosedResult> {
  const out: ShiftClosedResult = { card: "skipped", room: "skipped" };
  const tenantId = str(evt?.tenantId);
  const p = isRecord(evt?.payload) ? evt.payload : {};
  const shiftId = str(p.shiftId);
  if (!tenantId || !shiftId) return out;
  const shift = await prisma.posShift.findFirst({
    where: { id: shiftId, tenantId },
    select: { id: true, systemId: true, unitId: true, deviceId: true, deviceLabel: true, status: true, zNumber: true, expectedCashSatang: true, countedCashSatang: true, overShortSatang: true, zReport: true, closedAt: true, closedByUserId: true },
  });
  if (!shift || shift.status === "OPEN") return out;
  const pos = await posSystemOf(tenantId, shift.systemId);
  if (!pos) return out;
  const b = posBoardSettings(pos.settings);
  const r = posTeamRoomSettings(pos.settings);
  const cardOn = b.enabled && b.rules.shiftDiff.enabled;
  const roomOn = r.enabled && r.posts.shiftClose;
  if (!cardOn && !roomOn) return out; // มติ 3: ปิดอยู่ = จบก่อนอ่านบอร์ดงาน/แชททีมใด ๆ

  const now = new Date();
  const locale = localeOf(pos.settings);
  const unitName = await unitNameOf(tenantId, shift.unitId);
  const z = isRecord(shift.zReport) ? shift.zReport : {};
  const billCount = int(z.billCount) ?? 0;
  const salesTotalSatang = int(z.salesTotalSatang) ?? 0;
  const zNumber = shift.zNumber ?? 0;
  const deviceLabel = (shift.deviceLabel ?? "").trim() || shift.deviceId;
  const forced = p.forced === true || (shift.closedByUserId === null && shift.countedCashSatang === null);
  let failure: unknown = null;

  if (cardOn) {
    try {
      const rule = b.rules.shiftDiff;
      const os = shift.overShortSatang ?? 0;
      const uncounted = forced && shift.countedCashSatang === null;
      const want = (uncounted && rule.forcedClose) || (!uncounted && Math.abs(os) >= rule.minAbsSatang) || rule.everyClose;
      if (want) {
        const target = await resolveBoard(tenantId, b, shift.unitId);
        if (!target) {
          out.card = "no-board";
          await warnOnce(tenantId, pos.id, "shiftDiff", now, "เปิดการ์ดตรวจเงินกะไม่ได้ — บอร์ดที่ตั้งไว้ใช้ไม่ได้", `shift:${shift.id} unit:${shift.unitId} board:${posBoardIdForUnit(b, shift.unitId) ?? "-"}`);
        } else {
          const t = posShiftCardText(
            { zNumber, unitName, deviceLabel, forced, overShortSatang: shift.overShortSatang, expectedCashSatang: shift.expectedCashSatang, countedCashSatang: shift.countedCashSatang, billCount, salesTotalSatang },
            locale,
          );
          const c = await systemCard(tenantId, target, {
            title: t.title,
            description: t.description,
            sourceKey: posBoardKeys.shift(shift.id),
            unitId: shift.unitId,
            assignManager: b.assignManager,
            dueAt: noonNextBkk(shift.closedAt ?? now),
            links: [{ linkType: "URL", linkId: posUrl(pos.id, `shifts?shift=${shift.id}`), label: t.linkLabel, role: "SOURCE" }],
          });
          out.card = c.created ? "created" : "exists";
        }
      }
    } catch (e) {
      failure = e;
    }
  }

  if (roomOn) {
    try {
      const room = posRoomForUnit(r, shift.unitId);
      if (!room) {
        out.room = "no-room";
        await warnOnce(tenantId, pos.id, "room", now, "โพสต์ปิดกะเข้าห้องทีมไม่ได้ — ยังไม่ได้เลือกห้อง", `shift:${shift.id} unit:${shift.unitId}`);
      } else {
        const body = posZPostBody({ zNumber, unitName, deviceLabel, salesTotalSatang, billCount, overShortSatang: shift.overShortSatang, showOverShort: r.posts.showOverShort }, locale);
        out.room = await postFlagged(tenantId, pos.id, posBoardKeys.roomZ(shift.id), room, body, "room", now);
      }
    } catch (e) {
      if (failure === null) failure = e;
    }
  }
  if (failure !== null) throw failure;
  return out;
}

// ═════════════════════════ R5 R6 R8 ตัวกวาดรายชั่วโมง ═════════════════════════
export type SweepPosBoardResult = { ok: true; systems: number; created: number; closed: number; commented: number; posted: number; failed: number };

/**
 * ตัวกวาดรายชั่วโมง (cron hourly · R10): 86 นานเกิน N ชม. → การ์ด · 86 หาย → ปิดการ์ด · refund_needed 7 วัน → การ์ด · สรุปเช้าในห้องทีม (R8)
 * `tenantId` = กรองร้าน (CD-3 · route ไม่ส่ง) · หน้าละ 200 ระบบ · งบเวลา 20 วิ · พังรายระบบ = ops WARN แล้วไปต่อ
 */
export async function sweepPosBoard(opts: { now?: Date; deadline?: Date | number; tenantId?: string } = {}): Promise<SweepPosBoardResult> {
  const now = opts.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
  const deadline = opts.deadline instanceof Date ? opts.deadline.getTime() : typeof opts.deadline === "number" ? opts.deadline : Date.now() + DEFAULT_BUDGET_MS;
  const res: SweepPosBoardResult = { ok: true, systems: 0, created: 0, closed: 0, commented: 0, posted: 0, failed: 0 };
  let cursor: string | null = null;
  for (;;) {
    if (Date.now() > deadline) break;
    const page: PosSys[] = await prisma.appSystem.findMany({
      where: { type: "POS", active: true, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}), ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: MAX_SYSTEMS,
      select: { id: true, tenantId: true, settings: true },
    });
    if (page.length === 0) break;
    for (const sys of page) {
      if (Date.now() > deadline) break;
      const b = posBoardSettings(sys.settings);
      const r = posTeamRoomSettings(sys.settings);
      const soldOutOn = b.enabled && b.rules.soldOut.enabled;
      const refundOn = b.enabled && b.rules.refundNeeded.enabled;
      const briefOn = r.enabled && r.posts.dailyBrief;
      if (!soldOutOn && !refundOn && !briefOn) continue; // มติ 3: ปิด = ไม่อ่านอะไรต่อ
      res.systems += 1;
      try {
        const units = await linkedUnitIds(sys.tenantId, sys.id);
        if (soldOutOn) await sweepSoldOut(sys, b, units, now, res);
        if (refundOn) await sweepRefunds(sys, b, now, res);
        if (briefOn) await postTeamBrief(sys, r, now, res);
      } catch (e) {
        res.failed += 1;
        await logOps("WARN", OPS_SOURCE, `ตัวกวาดบอร์ดงาน POS ล้ม (ระบบ ${sys.id})`, { tenantId: sys.tenantId, detail: e instanceof Error ? (e.stack ?? e.message).slice(0, 1500) : String(e) });
      }
    }
    if (page.length < MAX_SYSTEMS) break;
    cursor = page[page.length - 1]!.id;
  }
  return res;
}

/** R5 — 86 นาน ≥ N ชม. (แหล่งที่เลือก) → การ์ด `pos-86:<unit>:<product>:<markId>` · 86 ที่ markId หายไปแล้ว (คืนขาย/86 ใหม่) → ปิดการ์ด */
async function sweepSoldOut(sys: PosSys, b: PosBoardSettings, units: string[], now: Date, res: SweepPosBoardResult): Promise<void> {
  const tenantId = sys.tenantId;
  const rule = b.rules.soldOut;
  const locale = localeOf(sys.settings);
  if (units.length && rule.sources.length) {
    const marks = await prisma.posAvailabilityMark.findMany({
      where: { tenantId, systemId: sys.id, unitId: { in: units }, source: { in: rule.sources }, markedAt: { lte: new Date(now.getTime() - rule.hours * HOUR_MS) } },
      orderBy: [{ markedAt: "asc" }, { id: "asc" }],
      take: MAX_ROWS,
      select: { id: true, unitId: true, productId: true, source: true, markedAt: true },
    });
    for (const m of marks) {
      const key = posBoardKeys.soldOut(m.unitId, m.productId, m.id);
      if (await cardBySourceKey(tenantId, key)) continue;
      const target = await resolveBoard(tenantId, b, m.unitId);
      if (!target) {
        await warnOnce(tenantId, sys.id, "soldOut", now, "เปิดการ์ดสินค้าหมดนานไม่ได้ — บอร์ดที่ตั้งไว้ใช้ไม่ได้", `unit:${m.unitId} board:${posBoardIdForUnit(b, m.unitId) ?? "-"}`);
        continue;
      }
      const product = await prisma.posProduct.findFirst({ where: { id: m.productId, tenantId }, select: { name: true } });
      const t = posSoldOutCardText({ hours: rule.hours, productName: product?.name ?? m.productId, unitName: await unitNameOf(tenantId, m.unitId), markedAt: m.markedAt, source: m.source }, locale);
      const c = await systemCard(tenantId, target, { title: t.title, description: t.description, sourceKey: key, unitId: m.unitId, assignManager: b.assignManager });
      if (c.created) res.created += 1;
    }
  }
  // ── ปิดการ์ด 86 ที่ markId ไม่อยู่แล้ว (สาขาของ POS นี้เท่านั้น) ──
  const open = await prisma.kanbanCard.findMany({
    where: { tenantId, status: "ACTIVE", completedAt: null, sourceKey: { startsWith: "pos-86:" } },
    orderBy: { id: "asc" },
    take: MAX_ROWS,
    select: { id: true, boardId: true, systemId: true, sourceKey: true, createdById: true },
  });
  const mine = open
    .map((c) => ({ c, parts: String(c.sourceKey ?? "").split(":") }))
    .filter((x) => x.parts.length === 4 && units.includes(x.parts[1]!) && isBoardSettingsId(x.parts[3]));
  if (!mine.length) return;
  const alive = new Set(
    (await prisma.posAvailabilityMark.findMany({ where: { tenantId, id: { in: mine.map((x) => x.parts[3]!) } }, select: { id: true } })).map((m) => m.id),
  );
  for (const { c, parts } of mine) {
    if (alive.has(parts[3]!)) continue;
    const done = await prisma.kanbanColumn.findFirst({
      where: { boardId: c.boardId, tenantId, systemId: c.systemId, status: "ACTIVE", isDoneColumn: true },
      orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
      select: { id: true },
    });
    if (done) {
      const mv = await moveCard(moveCtx(tenantId, c.systemId), { cardId: c.id, toColumnId: done.id, force: true });
      if (mv.ok) res.closed += 1;
    } else if (await backOnSaleComment(tenantId, c, posSoldOutBackComment(locale))) res.commented += 1;
  }
}

/**
 * ความเห็นของระบบ "กลับมาขายแล้ว" (บอร์ดไม่มีคอลัมน์เสร็จ — การ์ดอยู่ที่เดิม) · กันซ้ำด้วยข้อความเดิม · ผู้เขียน = ผู้สร้างการ์ด ?? เจ้าของร้านคนแรก
 * ⚠️ CD-P38-B1: แถวตรง (สำเนา `platform/kanban-bridges.ts#systemComment`) — บอร์ดงานไม่มีประตูความเห็นในนามระบบ · ไม่ยิง kanban.comment.added
 */
async function backOnSaleComment(tenantId: string, card: { id: string; boardId: string; createdById: string | null }, body: string): Promise<boolean> {
  const dup = await prisma.kanbanComment.findFirst({ where: { cardId: card.id, tenantId, body }, select: { id: true } });
  if (dup) return false;
  const author = card.createdById ?? (await prisma.membership.findFirst({ where: { tenantId, role: "OWNER" }, orderBy: { createdAt: "asc" }, select: { userId: true } }))?.userId ?? null;
  if (!author) return false;
  await prisma.$transaction(async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pos:86back:${card.id}`}, 0))`;
    if (await tx.kanbanComment.findFirst({ where: { cardId: card.id, tenantId, body }, select: { id: true } })) return;
    const row = await tx.kanbanComment.create({ data: { tenantId, cardId: card.id, authorUserId: author, body, mentions: [] } });
    await tx.kanbanActivity.create({ data: { tenantId, boardId: card.boardId, cardId: card.id, actorUserId: null, type: "COMMENT_ADDED", data: { commentId: row.id, bridge: true } } });
  });
  return true;
}

/** R6 — PosOrderEvent refund_needed ใน 7 วัน (ครบ 3 สาเหตุ รวม late_payment ที่ไม่มี outbox ⚠️3) → การ์ด `pos-refund:<orderId>` บนบอร์ดของสาขาออเดอร์ */
async function sweepRefunds(sys: PosSys, b: PosBoardSettings, now: Date, res: SweepPosBoardResult): Promise<void> {
  const tenantId = sys.tenantId;
  const locale = localeOf(sys.settings);
  const evs = await prisma.posOrderEvent.findMany({
    where: { tenantId, systemId: sys.id, type: "refund_needed", at: { gte: new Date(now.getTime() - 7 * DAY_MS), lte: now } },
    orderBy: [{ at: "asc" }, { id: "asc" }],
    take: MAX_ROWS,
    select: { orderId: true, payload: true },
  });
  const seen = new Set<string>();
  for (const ev of evs) {
    if (seen.has(ev.orderId)) continue;
    seen.add(ev.orderId);
    const key = posBoardKeys.refund(ev.orderId);
    if (await cardBySourceKey(tenantId, key)) continue;
    const order = await prisma.posOrder.findFirst({ where: { id: ev.orderId, tenantId, systemId: sys.id }, select: { id: true, code: true, unitId: true, totalSatang: true } });
    if (!order) continue;
    const target = await resolveBoard(tenantId, b, order.unitId);
    if (!target) {
      await warnOnce(tenantId, sys.id, "refundNeeded", now, "เปิดการ์ดคืนเงินลูกค้าไม่ได้ — บอร์ดที่ตั้งไว้ใช้ไม่ได้", `order:${order.id} unit:${order.unitId}`);
      continue;
    }
    const pl = isRecord(ev.payload) ? ev.payload : {};
    const amount = int(pl.amountSatang) ?? order.totalSatang;
    const t = posRefundCardText({ orderCode: order.code, amountSatang: amount, cause: str(pl.cause) }, locale);
    const c = await systemCard(tenantId, target, {
      title: t.title,
      description: t.description,
      sourceKey: key,
      unitId: order.unitId,
      assignManager: b.assignManager,
      links: [{ linkType: "URL", linkId: posUrl(sys.id, `orders?id=${order.id}`), label: t.linkLabel, role: "SOURCE" }],
    });
    if (c.created) res.created += 1;
  }
}

/**
 * R8 (มติ 4) — สรุปเช้าในห้องปริยายของทีม: ชั่วโมงไทย ≥ briefHourBkk (พลาด = ตามหลังวันเดียวกัน) · วันธุรกิจ = เมื่อวาน (เหมือน P3.9) ·
 * ข้อมูลโหลดด้วยสิทธิ์ของเจ้าของร้านที่เปิด (enabledByUserId · ต้องยังเป็น OWNER — CD-4) · เฉพาะ TEAM_SAFE_SECTIONS ·
 * ครั้งเดียวต่อ (ระบบ POS, ห้อง, วันธุรกิจ) ด้วยธงห้อง
 */
async function postTeamBrief(sys: PosSys, r: PosTeamRoomSettings, now: Date, res: SweepPosBoardResult): Promise<void> {
  const room = r.defaultRoom;
  if (!room || bkkHour(now) < r.briefHourBkk) return;
  const tenantId = sys.tenantId;
  const date = addDays(bkkBusinessDate(now, posDayCutoffMinutes(sys.settings)), -1);
  const key = posBoardKeys.roomBrief(sys.id, room.channelId, date);
  if (await prisma.auditLog.findFirst({ where: { tenantId, action: ROOM_FLAG.action, targetType: ROOM_FLAG.targetType, targetId: key }, select: { id: true } })) return;
  const owner = r.enabledByUserId
    ? await prisma.membership.findFirst({ where: { tenantId, userId: r.enabledByUserId, acceptedAt: { not: null } }, select: { userId: true, role: true, unitAccess: true, permissions: true } })
    : null;
  if (!owner || owner.role !== "OWNER") {
    await warnOnce(tenantId, sys.id, "brief", now, "ไม่ได้โพสต์สรุปเช้าเข้าห้องทีม — ผู้เปิดไม่ใช่เจ้าของร้านแล้ว", `room:${room.meetingSystemId}/${room.channelId} date:${date}`);
    return;
  }
  const actor: RegisterActor = {
    userId: owner.userId,
    role: owner.role as RegisterRole,
    unitAccess: Array.isArray(owner.unitAccess) ? (owner.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
    permissions: isRecord(owner.permissions) ? owner.permissions : {},
  };
  const input = await loadBriefInput({ tenantId, systemId: sys.id }, actor, date);
  const brief = composeBrief(input, localeOf(sys.settings), { sections: TEAM_SAFE_SECTIONS });
  if (brief.lines.length === 0) return;
  const out = await postFlagged(tenantId, sys.id, key, room, [brief.title, ...brief.lines].join("\n"), "brief", now);
  if (out === "posted") res.posted += 1;
}

// ═════════════════════════ R9 การ์ดจุดผิดปกติ (กดเอง) + ตัวอ่านชิป ═════════════════════════
export type CreateAnomalyCardInput = { unitId: string; rule: string; businessDate: string; refType: string; refId: string | null };
export type CreateAnomalyCardResult =
  | { ok: true; created: boolean; cardNo: number | null; cardId?: string }
  | { ok: false; code: "VALIDATION" | "NOT_FOUND" | "PERMISSION_DENIED" | "NO_BOARD" | "UNKNOWN"; message: string };
const refuse = (code: Exclude<CreateAnomalyCardResult, { ok: true }>["code"], message: string): CreateAnomalyCardResult => ({ ok: false, code, message });
const REF_TYPES = ["USER", "PosSale", "PosShift", "UNIT"];

function membershipOf(a: unknown): (MembershipCtx & { userId: string }) | null {
  if (!isRecord(a) || !isBoardSettingsId(a.userId) || (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF")) return null;
  return { userId: a.userId, role: a.role, unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter((u): u is string => typeof u === "string") : [], permissions: isRecord(a.permissions) ? a.permissions : {} };
}

/**
 * R9 — เปิดการ์ดจากแถวรายงานจุดผิดปกติ (คนกด · createdById = คนกด) · อ่านแถวใหม่จาก reportAnomalies (ไม่เชื่อข้อความจาก client) ·
 * สิทธิ์: pos.report.view + pos.report.anomaly ที่สาขา และ EDITOR ของบอร์ดปลายทาง (CD-7) · บอร์ดปิด/ไม่มี = NO_BOARD (CD-6) · แถวไม่มี = NOT_FOUND ·
 * กดซ้ำ = {ok, created:false, cardNo เดิม} · ชื่อ/รายละเอียดไม่มี userName
 */
export async function createAnomalyCard(ctx: { tenantId: string; systemId: string }, actor: RegisterActor, input: CreateAnomalyCardInput): Promise<CreateAnomalyCardResult> {
  try {
    const tenantId = str(ctx?.tenantId);
    const systemId = str(ctx?.systemId);
    if (!isBoardSettingsId(tenantId) || !isBoardSettingsId(systemId)) return refuse("NOT_FOUND", "ไม่พบจุดขายนี้");
    const m = membershipOf(actor);
    if (!m) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์");
    const i: Record<string, unknown> = isRecord(input) ? input : {};
    const unitId = str(i.unitId);
    const rule = str(i.rule);
    const businessDate = str(i.businessDate);
    const refType = str(i.refType);
    const refId = i.refId === null || i.refId === undefined ? null : str(i.refId);
    if (!isBoardSettingsId(unitId) || !(POS_ANOMALY_RULES as readonly string[]).includes(rule) || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || !REF_TYPES.includes(refType) || (refId !== null && !isBoardSettingsId(refId)))
      return refuse("VALIDATION", "ข้อมูลแถวจุดผิดปกติไม่ถูกต้อง");
    if (!evaluate(m, { module: "pos", action: "pos.report.view", unitId }) || !evaluate(m, { module: "pos", action: "pos.report.anomaly", unitId }))
      return refuse("PERMISSION_DENIED", "ต้องมีสิทธิ์ดูรายงานจุดผิดปกติของสาขานี้");
    const pos = await posSystemOf(tenantId, systemId);
    if (!pos || !(await linkedUnitIds(tenantId, pos.id)).includes(unitId)) return refuse("NOT_FOUND", "ไม่พบสาขานี้ในจุดขายนี้");
    const b = posBoardSettings(pos.settings);
    const target = b.enabled ? await resolveBoard(tenantId, b, unitId) : null;
    if (!target) return refuse("NO_BOARD", "ยังไม่ได้ตั้งบอร์ดงานของจุดขายนี้");
    const kActor: KanbanActor = { userId: m.userId, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions };
    if (!(await canOpenCardOnBoard(tenantId, kActor, target.boardId))) return refuse("PERMISSION_DENIED", "ต้องเป็นผู้แก้ไขของบอร์ดงานนี้");
    const rep = await reportAnomalies({ tenantId, systemId: pos.id }, actor, { from: businessDate, to: businessDate });
    if (!rep.ok) return rep.code === "PERMISSION_DENIED" ? refuse("PERMISSION_DENIED", "ต้องมีสิทธิ์ดูรายงานจุดผิดปกติของสาขานี้") : refuse("NOT_FOUND", "ไม่พบแถวจุดผิดปกตินี้");
    const row = rep.report.rows.find(
      (x) => x.rule === rule && x.unitId === unitId && x.businessDate === businessDate && x.refType === refType && (x.refId ?? null) === refId,
    ) ?? rep.report.rows.find((x) => x.rule === rule && x.unitId === unitId && x.businessDate === businessDate && x.refType === refType && x.refId === null && refId !== null && x.userId === refId);
    if (!row) return refuse("NOT_FOUND", "ไม่พบแถวจุดผิดปกตินี้ในรายงาน");
    const key = posBoardKeys.anomaly(row.rule, row.unitId, businessDate, row.refId ?? row.userId ?? "unit");
    const had = await cardBySourceKey(tenantId, key);
    if (had) return { ok: true, created: false, cardNo: had.cardNo, cardId: had.id };
    const locale = localeOf(pos.settings);
    const t = posAnomalyCardText({ rule: row.rule, unitName: await unitNameOf(tenantId, unitId), businessDate, valueText: posAnomalyValueText(row.rule, row.value, locale) }, locale);
    const c = await underKeyLock(`pos:card:${tenantId}:${key}`, () => createCardFromExternal(
      { tenantId, systemId: target.kanbanSystemId, actorUserId: m.userId, actor: kActor },
      {
        boardId: target.boardId,
        title: t.title,
        description: t.description,
        sourceType: "MANUAL",
        sourceKey: key,
        links: [{ linkType: "URL", linkId: posUrl(pos.id, `reports?kind=anomalies&from=${businessDate}&to=${businessDate}&unit=${unitId}`), label: t.linkLabel, role: "SOURCE" }],
      },
    ));
    return { ok: true, created: c.created, cardNo: c.cardNo, cardId: c.cardId };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "KanbanForbiddenError" || name === "KanbanNotFoundError") return refuse("PERMISSION_DENIED", "ต้องเป็นผู้แก้ไขของบอร์ดงานนี้");
    console.error("[pos-board-bridges] createAnomalyCard", e);
    return refuse("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}

export type PosCardForKey = { key: string; cardNo: number | null; href: string; completed: boolean };
/** ชิป "การ์ด #n" ของหน้ารายงาน/กะ (P3.8U) — กุญแจของ POS เท่านั้น (`pos-…`) · กุญแจที่ไม่มีการ์ด = ไม่อยู่ในผล */
export async function posCardsForKeys(tenantId: string, keys: string[]): Promise<PosCardForKey[]> {
  const list = [...new Set((Array.isArray(keys) ? keys : []).filter((k): k is string => typeof k === "string" && k.startsWith("pos-") && k.length <= 300))].slice(0, 200);
  if (!isBoardSettingsId(tenantId) || list.length === 0) return [];
  const rows = await prisma.kanbanCard.findMany({ where: { tenantId, sourceKey: { in: list } }, select: { id: true, cardNo: true, boardId: true, systemId: true, completedAt: true, sourceKey: true } });
  return rows.map((c) => ({ key: String(c.sourceKey), cardNo: c.cardNo, href: cardLink(c.systemId, c.boardId, c.id), completed: c.completedAt !== null }));
}

// ═════════════════════════ R2 ตัวบันทึกค่าตั้ง (ตรวจ id บอร์ด/ห้องที่นี่ · ตัวเขียนอยู่ใน pos/board-settings.ts) ═════════════════════════
/**
 * บันทึก settings.pos.board / settings.pos.teamRoom — เจ้าของร้านเท่านั้น · บอร์ดต้องเป็นบอร์ด ACTIVE ของร้านนี้ (ระบบ KANBAN เปิดอยู่) ·
 * ห้องต้องอยู่ใน listRoomOptions(ร้าน, เจ้าของ) (ห้อง PRIVATE ที่เจ้าของไม่อยู่ / ถูกเก็บ / ร้านอื่น = VALIDATION) · enabledByUserId = ผู้บันทึก (CD-4)
 */
export async function savePosBoardSettings(ctx: { tenantId: string; systemId: string }, actor: RegisterActor, input: { board?: unknown; teamRoom?: unknown }): Promise<PosBoardSettingsResult> {
  const tenantId = str(ctx?.tenantId);
  return updatePosBoardSettings(ctx, actor, input, async ({ board, teamRoom }) => {
    if (board) {
      const refs: [string, string][] = [];
      if (board.defaultBoardId) refs.push(["board.defaultBoardId", board.defaultBoardId]);
      for (const [u, id] of Object.entries(board.boardByUnit)) refs.push([`board.boardByUnit.${u}`, id]);
      for (const [field, id] of refs) {
        const row = await prisma.kanbanBoard.findFirst({ where: { id, tenantId, status: "ACTIVE" }, select: { systemId: true } });
        const sys = row ? await prisma.appSystem.findFirst({ where: { id: row.systemId, tenantId, type: "KANBAN", active: true }, select: { id: true } }) : null;
        if (!sys) return { field, message: "บอร์ดนี้ไม่ใช่บอร์ดที่ใช้งานอยู่ของร้านนี้" };
      }
    }
    if (teamRoom) {
      const refs: [string, PosRoomRef][] = [];
      if (teamRoom.defaultRoom) refs.push(["teamRoom.defaultRoom", teamRoom.defaultRoom]);
      for (const [u, ref] of Object.entries(teamRoom.roomByUnit)) refs.push([`teamRoom.roomByUnit.${u}`, ref]);
      if (refs.length) {
        const ok = new Set((await listRoomOptions(tenantId, str(actor?.userId))).map((o) => `${o.meetingSystemId}/${o.channelId}`));
        for (const [field, ref] of refs) if (!ok.has(`${ref.meetingSystemId}/${ref.channelId}`)) return { field, message: "ห้องนี้เลือกไม่ได้ (ห้องส่วนตัวที่เจ้าของไม่ได้อยู่ · ถูกเก็บ · หรือไม่ใช่ของร้านนี้)" };
      }
    }
    return null;
  });
}
