// reminders.ts — cron เตือน "ใกล้ถึงกำหนดส่ง" (รายชั่วโมง) + "เลยกำหนดส่ง" (รายวัน)
// (K2.11 · พิมพ์เขียว 13-kanban-v2 §7.4/§7.6 · สัญญา ledger/KANBAN-RUN.md §K2.11)
//
// 🔴 `now` มาจากผู้เรียกเสมอ — ห้ามอ่านนาฬิกาเองในนี้ (ข้อสอบต้องยิงเวลาไหนก็ได้ · กติกาเดียวกับ K2.7/K2.9)
// 🔴 ทั้งสองตัวกวาด **ข้ามทุกร้าน** (ระดับแพลตฟอร์มเหมือน `sweepRecurringCards`) ⇒ where ต้องพูดครบเอง
// 🔴 กันยิงซ้ำคนละแบบตามธรรมชาติของเรื่อง:
//    - ใกล้ถึงกำหนด = ครั้งเดียวต่อ "รอบกำหนดส่ง" ⇒ claim ที่คอลัมน์ `reminderSentAt` ของการ์ด
//      (`updateMany … where reminderSentAt: null` = แข่งกันได้ปลอดภัย · cron ซ้อนกันก็ยิงใบเดียว)
//      เลื่อนกำหนดส่ง → `cards.updateCardFields` ล้าง `reminderSentAt` ให้เอง = เตือนรอบใหม่ได้
//    - เลยกำหนด = วันละครั้งต่อการ์ด ⇒ กันซ้ำที่ `OutboxEvent.idempotencyKey` ของวันไทยนั้น
//      (ไม่มีคอลัมน์ให้ claim และไม่ควรเพิ่ม — สถานะ "เลยกำหนด" อยู่ได้หลายวันติดกัน)

import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { prisma } from "./db";
import { cardLink, notifyKanbanUserByPreference } from "./notify";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
/** เพดานต่อรอบ (เหมือน sweep อื่นของโมดูล) — cron วิ่งทุกชั่วโมง/ทุกวัน ของเหลือรอบหน้าเก็บต่อ */
const BATCH = 500;
/**
 * ช่วงกวาดหยาบของ "ใกล้ถึงกำหนด" = 2 วัน (2880 นาที)
 * = ค่ามากที่สุดของตัวเลือก "เตือนล่วงหน้า" ในหลังการ์ด (`REMINDER_OPTIONS` ของ CardBack)
 * ดึงหยาบด้วย SQL แล้วค่อยกรองต่อใบใน JS (`dueAt - reminderMinutesBefore ≤ now`) — เทียบ 2 คอลัมน์
 * ต่อกันใน where ของ Prisma ไม่ได้ และไม่อยากเพิ่ม raw SQL ในโมดูล (F5 ratchet)
 */
const DUE_SOON_SCAN_MINUTES = 2880;

/** วันไทย (yyyy-mm-dd) ของเวลา ms */
function bkkDateStr(ms: number): string {
  const d = new Date(ms + BKK_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** เที่ยงคืน (เวลาไทย) ของวันที่ครอบ ms — คืนเป็น ms บนไทม์ไลน์จริง */
function bkkDayStartMs(ms: number): number {
  return Math.floor((ms + BKK_OFFSET_MS) / DAY_MS) * DAY_MS - BKK_OFFSET_MS;
}

/** ผู้รับผิดชอบของการ์ด (ตาราง K1.2 + ช่องเดิม) — ไม่ซ้ำ */
async function assigneesOf(cardId: string, assigneeUserId: string | null): Promise<string[]> {
  const rows = await prisma.kanbanCardAssignee.findMany({ where: { cardId }, select: { userId: true } });
  const ids = new Set(rows.map((r) => r.userId));
  if (assigneeUserId) ids.add(assigneeUserId);
  return [...ids];
}

// ───────────────────────── ใกล้ถึงกำหนดส่ง (รายชั่วโมง) ─────────────────────────

/**
 * เตือน "ใกล้ถึงกำหนดส่ง" ตามที่ตั้งไว้ต่อการ์ด (`reminderMinutesBefore`)
 * เกาะ `/api/cron/hourly` แบบ best-effort · คืนจำนวนการ์ดที่เพิ่งเตือนในรอบนี้
 */
export async function sweepDueSoonReminders(now: Date = new Date()): Promise<number> {
  const nowMs = now.getTime();
  const cards = await prisma.kanbanCard.findMany({
    where: {
      status: "ACTIVE",
      completedAt: null,
      reminderMinutesBefore: { not: null },
      reminderSentAt: null,
      dueAt: { not: null, lte: new Date(nowMs + DUE_SOON_SCAN_MINUTES * 60_000) },
      board: { status: "ACTIVE" },
    },
    select: {
      id: true,
      tenantId: true,
      systemId: true,
      boardId: true,
      title: true,
      dueAt: true,
      reminderMinutesBefore: true,
      assigneeUserId: true,
      createdById: true,
    },
    orderBy: { dueAt: "asc" },
    take: BATCH,
  });

  let sent = 0;
  for (const card of cards) {
    if (!card.dueAt || card.reminderMinutesBefore === null) continue;
    // ถึงเวลาเตือนหรือยัง (เลยกำหนดไปแล้วก็ยังเตือน — ใบที่ค้างมาข้ามคืนต้องไม่หายเงียบ)
    if (card.dueAt.getTime() - card.reminderMinutesBefore * 60_000 > nowMs) continue;

    // ผู้รับผิดชอบทุกคน · ไม่มีเลย → ผู้สร้าง · ไม่มีอีก → ข้ามทั้งใบ (ไม่ claim ด้วย — วันหน้ามีคนรับแล้วจะได้เตือน)
    const assignees = await assigneesOf(card.id, card.assigneeUserId);
    const targets = assignees.length > 0 ? assignees : card.createdById ? [card.createdById] : [];
    if (targets.length === 0) continue;

    // 🔴 claim ต่อใบ: นับเฉพาะรอบที่ "แย่งได้จริง" (count = 1) — cron 2 ตัวชนกันจะมีตัวเดียวที่ได้ 1
    const claim = await prisma.kanbanCard.updateMany({
      where: { id: card.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claim.count !== 1) continue;

    const link = cardLink(card.systemId, card.boardId, card.id);
    try {
      await prisma.$transaction(async (tx) => {
        await emitOutbox(tx, {
          tenantId: card.tenantId,
          systemId: card.systemId,
          type: "kanban.card.due_soon",
          idempotencyKey: `kanban.due_soon.${card.id}.${card.dueAt!.toISOString()}`,
          payload: {
            cardId: card.id,
            boardId: card.boardId,
            dueAt: card.dueAt!.toISOString(),
            assigneeUserIds: targets,
          },
        });
      });
      for (const userId of targets) {
        await notifyKanbanUserByPreference({
          tenantId: card.tenantId,
          systemId: card.systemId,
          recipientUserId: userId,
          title: "ใกล้ถึงกำหนดส่ง",
          body: `"${card.title}" ใกล้ถึงกำหนดส่งแล้ว · ${link}`,
          data: { cardId: card.id, boardId: card.boardId, systemId: card.systemId },
        }).catch(() => {});
      }
    } catch {
      // แจ้ง/ยิง event ล้ม = ปล่อยผ่านใบนี้ (claim ไปแล้ว ไม่ย้อน — ยอมพลาด 1 ใบดีกว่ายิงซ้ำวนทุกชั่วโมง)
    }
    sent++;
  }
  if (sent > 0) scheduleDrain();
  return sent;
}

// ───────────────────────── เลยกำหนดส่ง (รายวัน) ─────────────────────────

/**
 * แจ้ง "เลยกำหนดส่ง" วันละครั้งต่อการ์ด (เกาะ `runDailyCron`) · คืนจำนวนการ์ดที่ยิงใหม่วันนี้
 *
 * ผู้รับ = ผู้รับผิดชอบ + **ผู้ดูแลบอร์ดที่ถูกเชิญชัด ๆ** (D20)
 * 🔴 D20 ไม่รวม OWNER/MANAGER ที่เป็น ADMIN "โดยนัย": ร้านที่มี 40 บอร์ดจะยิงเจ้าของร้านวันละหลายสิบใบ
 *    ทุกเช้าจนเลิกอ่าน — เจ้าของเห็นภาพรวมผ่าน "อีเมลสรุป" (digest.ts) ที่รวมเป็นฉบับเดียวแทน
 * 🔴 ไม่ push (§7.4): เลยกำหนดคือสถานะที่อยู่ต่อเนื่อง ไม่ใช่เหตุการณ์ที่ต้องปลุกคนตอนตี 3
 */
export async function sweepOverdue(now: Date = new Date()): Promise<number> {
  const todayStartMs = bkkDayStartMs(now.getTime());
  const todayKey = bkkDateStr(now.getTime());
  const cards = await prisma.kanbanCard.findMany({
    where: {
      status: "ACTIVE",
      completedAt: null,
      dueAt: { not: null, lt: new Date(todayStartMs) },
      board: { status: "ACTIVE" },
    },
    select: {
      id: true,
      tenantId: true,
      systemId: true,
      boardId: true,
      title: true,
      dueAt: true,
      assigneeUserId: true,
    },
    orderBy: { dueAt: "asc" },
    take: BATCH,
  });

  let fired = 0;
  for (const card of cards) {
    if (!card.dueAt) continue;
    const key = `kanban.overdue.${card.id}.${todayKey}`;
    const existing = await prisma.outboxEvent.findFirst({
      where: { tenantId: card.tenantId, idempotencyKey: key },
      select: { id: true },
    });
    if (existing) continue; // ยิงไปแล้ววันนี้ — ข้ามทั้งใบ (ไม่แจ้งซ้ำ)

    const overdueDays = Math.max(1, Math.round((todayStartMs - bkkDayStartMs(card.dueAt.getTime())) / DAY_MS));
    const [assignees, admins] = await Promise.all([
      assigneesOf(card.id, card.assigneeUserId),
      prisma.kanbanBoardMember.findMany({
        where: { boardId: card.boardId, tenantId: card.tenantId, role: "ADMIN" },
        select: { userId: true },
      }),
    ]);
    const targets = [...new Set([...assignees, ...admins.map((a) => a.userId)])];

    await prisma.$transaction(async (tx) => {
      await emitOutbox(tx, {
        tenantId: card.tenantId,
        systemId: card.systemId,
        type: "kanban.card.overdue",
        idempotencyKey: key,
        payload: {
          cardId: card.id,
          boardId: card.boardId,
          dueAt: card.dueAt!.toISOString(),
          overdueDays,
        },
      });
    });
    const link = cardLink(card.systemId, card.boardId, card.id);
    for (const userId of targets) {
      await notifyKanbanUserByPreference({
        tenantId: card.tenantId,
        systemId: card.systemId,
        recipientUserId: userId,
        title: "เลยกำหนดส่งแล้ว",
        body: `"${card.title}" เลยกำหนดส่งมา ${overdueDays} วัน · ${link}`,
        data: { cardId: card.id, boardId: card.boardId, systemId: card.systemId },
        push: false,
      }).catch(() => {});
    }
    fired++;
  }
  if (fired > 0) scheduleDrain();
  return fired;
}
