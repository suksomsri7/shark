// recurrence.ts — กำหนดส่งซ้ำ (K2.7 · พิมพ์เขียว 13-kanban-v2 §13 K2.7 · สัญญา ledger/KANBAN-RUN.md §K2.7)
//
// `parseRecurrenceRule` / `describeRecurrence` / `nextOccurrence` = **pure** (ไม่แตะ prisma/เวลาปัจจุบัน)
// เพื่อให้ข้อสอบยิงตรงได้ + ใช้ซ้ำได้ทั้งฝั่ง server (sweep) และฝั่ง client (แสดงตัวอย่างในฟอร์ม)
// 🔴 ห้าม toLocaleString/getDay() ตรง ๆ — คิดวันไทย (+07:00) ด้วยมือแบบเดียวกับ `Card.tsx`/`fields.ts`/
//    `ThaiDatePicker.tsx` (`reference_thai_date_getday_trap`): เลื่อน ms +7 ชม. แล้วอ่านด้วย getUTC*
//
// `setCardRecurrence`/`sweepRecurringCards` แตะ prisma — อยู่ไฟล์เดียวกันตามสัญญา (ไม่แยกไฟล์)

import { KanbanNotFoundError } from "./access";
import { logActivity } from "./activity-log";
import { prisma } from "./db";
import { assertCardRole } from "./members";
import { notifyCardAssigned } from "./notify";
import { keyBetween, keysBetween } from "./ordering";
import { emitOutbox } from "@/lib/core/outbox";
import { publishBoardSignal, boardSignal } from "./realtime";
import type { KanbanActor, KanbanCtx } from "./types";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
/** ลำดับ ISO ของวันในสัปดาห์ — จันทร์ = 0 … อาทิตย์ = 6 (ตรงกับโค้ด BYDAY ของ RRULE) */
const WEEK_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const DAY_TH: Record<string, string> = { MO: "จันทร์", TU: "อังคาร", WE: "พุธ", TH: "พฤหัสบดี", FR: "ศุกร์", SA: "เสาร์", SU: "อาทิตย์" };

// ═══════════════════════════ pure: parse / describe / next ═══════════════════════════

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY";

export type ParsedRecurrence = {
  freq: RecurrenceFreq;
  interval: number;
  /** เฉพาะ WEEKLY — โค้ดวัน ("MO".."SU") อย่างน้อย 1 ตัว */
  byDay?: string[];
  /** เฉพาะ MONTHLY — วันที่ 1-31 */
  byMonthDay?: number;
};

/**
 * รับ subset ของ RRULE เท่านั้น: `FREQ=DAILY[;INTERVAL=n]` · `FREQ=WEEKLY;BYDAY=MO,TH[;INTERVAL=n]` ·
 * `FREQ=MONTHLY;BYMONTHDAY=d[;INTERVAL=n]` — รูปแบบอื่น/ว่าง/ไม่มี BYDAY(WEEKLY)/INTERVAL<1/BYMONTHDAY นอกช่วง
 * → throw ข้อความไทย
 */
export function parseRecurrenceRule(rule: string): ParsedRecurrence {
  const s = (rule ?? "").trim();
  if (!s) throw new Error("รูปแบบการเกิดซ้ำไม่ถูกต้อง");
  const map: Record<string, string> = {};
  for (const part of s.split(";").map((p) => p.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq < 0) throw new Error("รูปแบบการเกิดซ้ำไม่ถูกต้อง — ต้องเป็น FREQ=... คั่นด้วย ;");
    map[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).trim();
  }
  const freq = map.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") {
    throw new Error("รองรับเฉพาะกำหนดส่งซ้ำแบบรายวัน/รายสัปดาห์/รายเดือนเท่านั้น");
  }
  const interval = map.INTERVAL !== undefined ? Number(map.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error("ระบุจำนวนรอบ (ทุก n วัน/สัปดาห์/เดือน) ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
  }
  if (freq === "WEEKLY") {
    if (!map.BYDAY) throw new Error("กำหนดส่งซ้ำรายสัปดาห์ต้องระบุวันของสัปดาห์");
    const byDay = map.BYDAY.split(",").map((d) => d.trim().toUpperCase()).filter(Boolean);
    if (byDay.length === 0 || byDay.some((d) => !WEEK_ORDER.includes(d as (typeof WEEK_ORDER)[number]))) {
      throw new Error("วันของสัปดาห์ไม่ถูกต้อง — ใช้ได้เฉพาะ MO/TU/WE/TH/FR/SA/SU");
    }
    return { freq: "WEEKLY", interval, byDay };
  }
  if (freq === "MONTHLY") {
    const byMonthDay = Number(map.BYMONTHDAY);
    if (!map.BYMONTHDAY || !Number.isInteger(byMonthDay) || byMonthDay < 1 || byMonthDay > 31) {
      throw new Error("วันที่ของเดือนต้องเป็นจำนวนเต็มระหว่าง 1-31");
    }
    return { freq: "MONTHLY", interval, byMonthDay };
  }
  return { freq: "DAILY", interval };
}

/** ประโยคไทยของกฎ — "ทุกวัน" · "ทุก 2 วัน" · "ทุกวันจันทร์" · "ทุกวันจันทร์และพฤหัสบดี" · "ทุก 2 สัปดาห์ วันจันทร์" · "ทุกวันที่ 15 ของเดือน" */
export function describeRecurrence(rule: string): string {
  const p = parseRecurrenceRule(rule);
  if (p.freq === "DAILY") return p.interval === 1 ? "ทุกวัน" : `ทุก ${p.interval} วัน`;
  if (p.freq === "WEEKLY") {
    const days = (p.byDay ?? []).map((d) => DAY_TH[d] ?? d);
    const daysText = days.length <= 1 ? (days[0] ?? "") : `${days.slice(0, -1).join("")}และ${days[days.length - 1]}`;
    return p.interval === 1 ? `ทุกวัน${daysText}` : `ทุก ${p.interval} สัปดาห์ วัน${daysText}`;
  }
  return `ทุกวันที่ ${p.byMonthDay} ของเดือน`;
}

type BkkParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number; dayIndex: number };

function bkk(ms: number): BkkParts {
  const d = new Date(ms + BKK_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: d.getUTCDay(),
    dayIndex: Math.floor((ms + BKK_OFFSET_MS) / DAY_MS),
  };
}

/**
 * วันไทย (yyyy-mm-dd) ของ dayIndex — ใช้ทำ recurrenceKey
 * `dayIndex * DAY_MS` คือจุดเริ่มวันนั้นพอดีในไทม์ไลน์ที่เลื่อน +7 ชม.แล้ว ⇒ อ่าน UTC getters ตรง ๆ ได้เลย
 * (เทียบเท่า `new Date(ms + BKK_OFFSET_MS).toISOString().slice(0,10)` ของ oracle แต่ไม่ต้องมี Date เดิม)
 */
function bkkDateStrOfIndex(dayIndex: number): string {
  const d = new Date(dayIndex * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** สร้าง Date จาก dayIndex(ไทย) + เวลาไทยที่กำหนด (ใช้คงเวลาเดิมของการ์ดแม่) */
function fromBkkDayIndexAndTime(dayIndex: number, hour: number, minute: number, second: number): Date {
  const ms = dayIndex * DAY_MS + hour * 3_600_000 + minute * 60_000 + second * 1000 - BKK_OFFSET_MS;
  return new Date(ms);
}

/** วันสัปดาห์แบบ ISO ของ getUTCDay() — จันทร์=0 … อาทิตย์=6 */
function isoWeekday(getUTCDayValue: number): number {
  return (getUTCDayValue + 6) % 7;
}

/** จำนวนวันของเดือน (year/month แบบ 0-11) — ใช้ clamp BYMONTHDAY ที่เกินเดือนสั้น (เช่น 31 ในเดือน 30 วัน) */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * candidate ตรงกับกฎไหม เทียบกับ "จุดอ้างอิง" (anchor = วันแรกของงานประจำ เช่น dueAt ของการ์ดแม่)
 * candidate ต้องอยู่ **หลัง** anchor เสมอ (strict — anchor เองคือรอบแรก ไม่นับซ้ำ)
 */
function matchesRule(p: ParsedRecurrence, anchor: BkkParts, candidate: BkkParts): boolean {
  if (candidate.dayIndex <= anchor.dayIndex) return false;
  if (p.freq === "DAILY") {
    return (candidate.dayIndex - anchor.dayIndex) % p.interval === 0;
  }
  if (p.freq === "WEEKLY") {
    const anchorWeekStart = anchor.dayIndex - isoWeekday(anchor.weekday);
    const candWeekStart = candidate.dayIndex - isoWeekday(candidate.weekday);
    const weeksDiff = (candWeekStart - anchorWeekStart) / 7;
    if (!Number.isInteger(weeksDiff) || weeksDiff < 0 || weeksDiff % p.interval !== 0) return false;
    const code = WEEK_ORDER[isoWeekday(candidate.weekday)];
    return (p.byDay ?? []).includes(code);
  }
  // MONTHLY
  const monthsDiff = (candidate.year - anchor.year) * 12 + (candidate.month - anchor.month);
  if (monthsDiff < 0 || monthsDiff % p.interval !== 0) return false;
  const targetDay = Math.min(p.byMonthDay ?? 1, daysInMonth(candidate.year, candidate.month));
  return candidate.day === targetDay;
}

/**
 * วันที่ครบกำหนดถัดไป **หลัง** `after` (strict) ตามกฎ — คงเวลา (ชั่วโมง:นาที ไทย) ของ `after`
 * ค้นหาทีละวันไทยไปข้างหน้าไม่เกิน 400 วัน (พอสำหรับ DAILY/WEEKLY/MONTHLY ทุก interval ที่รองรับ)
 */
export function nextOccurrence(rule: string, after: Date): Date {
  const p = parseRecurrenceRule(rule);
  const anchor = bkk(after.getTime());
  for (let i = 1; i <= 400; i++) {
    const candMs = fromBkkDayIndexAndTime(anchor.dayIndex + i, anchor.hour, anchor.minute, anchor.second).getTime();
    const cand = bkk(candMs);
    if (matchesRule(p, anchor, cand)) return new Date(candMs);
  }
  throw new Error("หาไม่พบวันครบกำหนดถัดไปของกำหนดส่งซ้ำนี้");
}

// ═══════════════════════════ ตั้ง/ล้าง กำหนดส่งซ้ำของการ์ด (EDITOR) ═══════════════════════════

function actorUserIdOf(ctx: KanbanCtx, actor?: KanbanActor): string | null {
  return ctx.actorUserId ?? actor?.userId ?? null;
}

/**
 * ตั้ง/ล้างกำหนดส่งซ้ำของการ์ด — EDITOR ของบอร์ดขึ้นไป
 * การ์ดไม่มีกำหนดส่ง → throw ไทย (ไม่รู้จะนับรอบจากวันไหน) · กฎผิดรูป → throw (จาก `parseRecurrenceRule`)
 */
export async function setCardRecurrence(
  ctx: KanbanCtx,
  actor: KanbanActor | undefined,
  cardId: string,
  rule: string | null,
): Promise<void> {
  const { boardId } = await assertCardRole(ctx, cardId, "EDITOR");
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, dueAt: true },
  });
  if (!card) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");
  if (rule !== null) {
    if (!card.dueAt) throw new Error("ตั้งกำหนดส่งก่อน แล้วจึงตั้งกำหนดส่งซ้ำได้");
    parseRecurrenceRule(rule); // throw ไทยถ้ากฎผิด — ไม่เขียนอะไรถ้ายังไม่ผ่าน
  }
  await prisma.$transaction(async (tx) => {
    await tx.kanbanCard.update({ where: { id: card.id }, data: { recurrenceRule: rule } });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      cardId: card.id,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "CARD_UPDATED",
      data: { recurrence: rule },
    });
  });
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.updated", boardId, cardId: card.id }));
}

// ═══════════════════════════ cron: สร้างการ์ดลูกของงานประจำ ═══════════════════════════

type RecurringParent = {
  id: string;
  tenantId: string;
  systemId: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  dueAt: Date;
  reminderMinutesBefore: number | null;
  recurrenceRule: string;
  createdById: string | null;
};

/** คอลัมน์แรก (active) ของบอร์ด — เรียงแบบเดียวกับที่ใช้ทั้งโมดูล (position → sortOrder → createdAt) */
async function firstActiveColumnId(tenantId: string, systemId: string, boardId: string): Promise<string | null> {
  const col = await prisma.kanbanColumn.findFirst({
    where: { boardId, tenantId, systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return col?.id ?? null;
}

function isUniqueConstraintError(e: unknown): boolean {
  return !!e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002";
}

/**
 * สร้างการ์ดลูก 1 ใบของงานประจำ `parent` สำหรับวันไทยที่ตรงกับ `key`
 * คืน `true` = สร้างสำเร็จ · `false` = ชนกับที่มีอยู่แล้ว (unique — cron ซ้อน) หรือบอร์ดไม่มีคอลัมน์ที่ใช้งานได้
 */
async function createRecurringChild(parent: RecurringParent, key: string, dueAt: Date): Promise<boolean> {
  const columnId = await firstActiveColumnId(parent.tenantId, parent.systemId, parent.boardId);
  if (!columnId) return false; // บอร์ดไม่มีคอลัมน์ที่ใช้งานได้แล้ว — ข้ามรอบนี้ (ไม่ throw ทำให้ cron ทั้งรอบล้ม)

  const [labelRows, assigneeRows, checklists, fieldValueRows] = await Promise.all([
    prisma.kanbanCardLabel.findMany({ where: { cardId: parent.id }, select: { labelId: true } }),
    prisma.kanbanCardAssignee.findMany({ where: { cardId: parent.id }, select: { userId: true } }),
    prisma.kanbanChecklist.findMany({
      where: { cardId: parent.id },
      orderBy: { position: "asc" },
      include: { items: { orderBy: { position: "asc" }, select: { text: true } } },
    }),
    prisma.kanbanCustomFieldValue.findMany({ where: { cardId: parent.id } }),
  ]);

  try {
    const child = await prisma.$transaction(async (tx) => {
      const last = await tx.kanbanCard.findFirst({
        where: { columnId, tenantId: parent.tenantId, systemId: parent.systemId, status: "ACTIVE", position: { not: null } },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const position = keyBetween(last?.position ?? null, null);
      const seq = await tx.$queryRaw<{ cardNoSeq: number }[]>`
        UPDATE "KanbanBoard" SET "cardNoSeq" = "cardNoSeq" + 1 WHERE id = ${parent.boardId} RETURNING "cardNoSeq"
      `;
      const row = await tx.kanbanCard.create({
        data: {
          tenantId: parent.tenantId,
          systemId: parent.systemId,
          boardId: parent.boardId,
          columnId,
          title: parent.title,
          description: parent.description,
          dueAt,
          reminderMinutesBefore: parent.reminderMinutesBefore,
          sortOrder: 0,
          position,
          cardNo: seq[0]?.cardNoSeq ?? null,
          sourceType: "AUTOMATION",
          sourceId: parent.id,
          recurrenceParentId: parent.id,
          recurrenceKey: key,
          createdById: parent.createdById,
        },
      });
      if (labelRows.length > 0) {
        await tx.kanbanCardLabel.createMany({
          data: labelRows.map((l) => ({ cardId: row.id, labelId: l.labelId, tenantId: parent.tenantId })),
          skipDuplicates: true,
        });
      }
      if (assigneeRows.length > 0) {
        // งานประจำก๊อปผู้รับผิดชอบเดิม (D19) — ต้องโผล่ใน "งานของฉัน" ของคนเดิมเองโดยไม่ต้องมอบใหม่
        await tx.kanbanCardAssignee.createMany({
          data: assigneeRows.map((a) => ({ cardId: row.id, userId: a.userId, tenantId: parent.tenantId })),
          skipDuplicates: true,
        });
        await tx.kanbanCard.update({ where: { id: row.id }, data: { assigneeUserId: assigneeRows[0]!.userId } });
      }
      const checklistPositions = keysBetween(null, null, checklists.length);
      for (const [ci, cl] of checklists.entries()) {
        const newChecklist = await tx.kanbanChecklist.create({
          data: { tenantId: parent.tenantId, cardId: row.id, title: cl.title, position: checklistPositions[ci]! },
        });
        if (cl.items.length > 0) {
          const itemPositions = keysBetween(null, null, cl.items.length);
          await tx.kanbanChecklistItem.createMany({
            data: cl.items.map((it, i) => ({
              tenantId: parent.tenantId,
              checklistId: newChecklist.id,
              text: it.text,
              position: itemPositions[i]!,
              done: false,
            })),
          });
        }
      }
      if (fieldValueRows.length > 0) {
        await tx.kanbanCustomFieldValue.createMany({
          data: fieldValueRows.map((v) => ({
            tenantId: parent.tenantId,
            cardId: row.id,
            fieldId: v.fieldId,
            valueText: v.valueText,
            valueNumber: v.valueNumber,
            valueDate: v.valueDate,
            valueBool: v.valueBool,
            valueOption: v.valueOption,
          })),
        });
      }
      await logActivity(tx, {
        tenantId: parent.tenantId,
        boardId: parent.boardId,
        cardId: row.id,
        actorUserId: null,
        type: "CARD_CREATED",
        data: { title: row.title, columnId, sourceType: "AUTOMATION", recurrenceParentId: parent.id },
      });
      await emitOutbox(tx, {
        tenantId: parent.tenantId,
        systemId: parent.systemId,
        type: "kanban.card.created",
        idempotencyKey: `kanban.card.created#${row.id}`,
        payload: { cardId: row.id, boardId: parent.boardId, columnId, cardNo: row.cardNo, title: row.title, sourceType: row.sourceType },
      });
      return row;
    });

    for (const a of assigneeRows) {
      await notifyCardAssigned(parent.tenantId, parent.systemId, { id: child.id, title: child.title, boardId: parent.boardId }, a.userId).catch(() => {});
    }
    await publishBoardSignal(
      { tenantId: parent.tenantId },
      parent.boardId,
      boardSignal({ type: "card.created", boardId: parent.boardId, cardId: child.id, columnId }),
    );
    return true;
  } catch (e) {
    if (isUniqueConstraintError(e)) return false; // ชนกัน (cron ซ้อน) — นับเป็น 0 ไม่ throw
    throw e;
  }
}

/**
 * กวาดการ์ดแม่ทุกใบ (ทุกร้าน) ที่ถึงรอบวันนี้ → สร้างการ์ดลูก 1 ใบต่อใบ · idempotent ผ่าน
 * `recurrenceKey = kanban.recur.{parentId}.{yyyy-mm-dd ไทย}` (unique DB กันซ้ำเมื่อ cron ทำงานซ้อน)
 * เรียกจาก `runDailyCron` ใน try/catch ของตัวเอง · **`now` ต้องมาจากผู้เรียกเสมอ ห้ามใช้ `new Date()` ภายใน**
 */
export async function sweepRecurringCards(now: Date): Promise<number> {
  const nowBkk = bkk(now.getTime());
  const todayKey = bkkDateStrOfIndex(nowBkk.dayIndex);
  const parents = await prisma.kanbanCard.findMany({
    where: {
      status: "ACTIVE",
      recurrenceRule: { not: null },
      recurrenceParentId: null,
      board: { status: "ACTIVE" },
    },
    select: {
      id: true,
      tenantId: true,
      systemId: true,
      boardId: true,
      columnId: true,
      title: true,
      description: true,
      dueAt: true,
      reminderMinutesBefore: true,
      recurrenceRule: true,
      createdById: true,
    },
    take: 500,
  });

  let created = 0;
  for (const parent of parents) {
    if (!parent.dueAt || !parent.recurrenceRule) continue;
    let parsed: ParsedRecurrence;
    try {
      parsed = parseRecurrenceRule(parent.recurrenceRule);
    } catch {
      continue; // กฎเสีย (ไม่ควรเกิดเพราะ setCardRecurrence ตรวจก่อนเขียนแล้ว) — ข้ามอย่างปลอดภัย
    }
    const anchor = bkk(parent.dueAt.getTime());
    if (!matchesRule(parsed, anchor, nowBkk)) continue;
    const key = `kanban.recur.${parent.id}.${todayKey}`;
    const dueAt = fromBkkDayIndexAndTime(nowBkk.dayIndex, anchor.hour, anchor.minute, anchor.second);
    const ok = await createRecurringChild(
      { ...parent, dueAt: parent.dueAt, recurrenceRule: parent.recurrenceRule },
      key,
      dueAt,
    );
    if (ok) created++;
  }
  return created;
}
