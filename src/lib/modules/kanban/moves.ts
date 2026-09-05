// moves.ts — ย้ายการ์ด/คอลัมน์ (K1.4 · พิมพ์เขียว 13-kanban-v2 §5.5 · §11.1–§11.4 · D10/D16)
//
// ไฟล์นี้เป็น "ที่เดียว" ที่เขียน `position` ของการ์ด/คอลัมน์เวลาผู้ใช้สั่งย้าย
// (คีย์ทุกตัวมาจาก `ordering.ts` — ห้ามคิดอัลกอริทึมเองตาม §11.1)
//
// 🔴 กติกาที่ถือไว้ทั้งไฟล์
//  1. client ส่งได้แค่ **id ของเพื่อนบ้าน** — server อ่าน `position` จริงใน transaction แล้วค่อย gen คีย์
//     (client ที่ค้าง cache ส่งคีย์มาเองได้ = ลำดับเพี้ยนข้ามเครื่อง)
//  2. ทุกการย้าย serialize ต่อคอลัมน์ด้วย `SELECT … FOR UPDATE` บนแถว `KanbanColumn`
//     ⇒ 20 คนลากมาจุดเดียวกันพร้อมกันก็อ่านเพื่อนบ้าน "หลังคนก่อนหน้าเขียนเสร็จ" เสมอ (คีย์ไม่ซ้ำ)
//     ล็อกหลายคอลัมน์ = เรียงตาม id ก่อนเสมอ (ล็อกสลับทาง A→B / B→A พร้อมกัน = deadlock)
//  3. dual-write `sortOrder` (D10): หลังเขียน `position` เสร็จ renumber 0..n ของคอลัมน์ที่กระทบ
//     ด้วย SQL **คำสั่งเดียว** (row_number()) — ไม่ใช่ update ทีละแถวจาก JS (คอลัมน์ 260 ใบ = 260 round trip)
//  4. เพื่อนบ้านหาย/ถูกเก็บระหว่างลาก → ต่อท้ายคอลัมน์ + บอก `placedAt:"end"` กลับไป **ไม่ error ใส่ผู้ใช้** (§11.1)
//  5. คีย์ยาวเกิน `KANBAN_LIMITS.positionRebalanceLength` → rewrite ทั้งคอลัมน์ใน tx เดียวกันทันที (§11.1)
//
// หมายเหตุการเทียบคีย์: DB ของ run นี้เป็น `C.UTF-8` ⇒ `ORDER BY position` = byte order เท่ากับ
// string compare ของ JS พอดี (ถ้าย้ายไป collation แบบ en_US เมื่อไหร่ ต้องบังคับ `COLLATE "C"` ทุกจุด)

import { Prisma } from "@prisma/client";
import type { KanbanCard } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import { assertBoardRole, assertColumnRole } from "./members";
import { keyBetween, keysBetween, rebalanceKeys } from "./ordering";
import type { KanbanCtx } from "./types";

type Tx = Prisma.TransactionClient;

/** งานย้ายทั้งหมดใช้ tx แบบ interactive — ตั้งเวลาให้เผื่อคิวล็อกตอนหลายคนลากพร้อมกัน */
const TX_OPTS = { maxWait: 30_000, timeout: 30_000 } as const;

// ───────────────────────── ชนิดของผลลัพธ์ (สัญญา K1.4) ─────────────────────────

export type MoveCardFailCode = "CARD_ARCHIVED" | "WIP_LIMIT" | "NOT_FOUND" | "CROSS_BOARD";

export type MoveCardInput = {
  cardId: string;
  toColumnId: string;
  /** วางไว้ "ก่อน" การ์ดใบนี้ */
  beforeCardId?: string | null;
  /** วางไว้ "หลัง" การ์ดใบนี้ (ใช้เมื่อไม่ส่ง beforeCardId) */
  afterCardId?: string | null;
  /** ADMIN ของบอร์ดเท่านั้น — ข้ามเพดาน WIP (§11.4) */
  force?: boolean;
};

export type MoveCardResult =
  | { ok: true; position: string; placedAt: "between" | "end"; card: KanbanCard }
  | { ok: false; code: MoveCardFailCode; message: string };

const fail = (code: MoveCardFailCode, message: string): MoveCardResult => ({ ok: false, code, message });

// ───────────────────────── ตัวช่วยระดับ SQL ─────────────────────────

/**
 * ล็อกแถวคอลัมน์ (จุด serialize ของการย้าย) — เรียง id ก่อนล็อกเสมอ
 * 🔴 ล็อกไม่เรียง = ย้าย A→B พร้อมกับ B→A แล้ว deadlock (Postgres จะ abort ตัวหนึ่งทิ้ง)
 */
async function lockColumns(tx: Tx, ctx: KanbanCtx, columnIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(columnIds)].sort()) {
    await tx.$queryRaw`
      SELECT "id" FROM "KanbanColumn"
       WHERE "id" = ${id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
       FOR UPDATE
    `;
  }
}

/** ล็อกแถวบอร์ด — ใช้ตอนย้าย "คอลัมน์" (ลำดับคอลัมน์เป็นของบอร์ด ไม่ใช่ของคอลัมน์ใดคอลัมน์หนึ่ง) */
async function lockBoard(tx: Tx, ctx: KanbanCtx, boardId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT "id" FROM "KanbanBoard"
     WHERE "id" = ${boardId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId}
     FOR UPDATE
  `;
}

/**
 * dual-write `sortOrder` = ลำดับจริงในคอลัมน์ 0..n-1 (D10) — **คำสั่งเดียว**
 * เรียงแบบเดียวกับ `getBoard()` (position ก่อน · แถวที่ยังไม่ backfill อยู่หน้า · แล้ว createdAt)
 */
async function renumberCardSortOrder(tx: Tx, ctx: KanbanCtx, columnId: string): Promise<void> {
  await tx.$executeRaw`
    WITH ord AS (
      SELECT "id",
             (row_number() OVER (ORDER BY "position" ASC NULLS FIRST, "sortOrder" ASC, "createdAt" ASC))::int - 1 AS rn
        FROM "KanbanCard"
       WHERE "columnId" = ${columnId} AND "tenantId" = ${ctx.tenantId}
         AND "systemId" = ${ctx.systemId} AND "status" = 'ACTIVE'
    )
    UPDATE "KanbanCard" c SET "sortOrder" = ord.rn
      FROM ord WHERE c."id" = ord."id" AND c."sortOrder" <> ord.rn
  `;
}

async function renumberColumnSortOrder(tx: Tx, ctx: KanbanCtx, boardId: string): Promise<void> {
  await tx.$executeRaw`
    WITH ord AS (
      SELECT "id",
             (row_number() OVER (ORDER BY "position" ASC NULLS FIRST, "sortOrder" ASC, "createdAt" ASC))::int - 1 AS rn
        FROM "KanbanColumn"
       WHERE "boardId" = ${boardId} AND "tenantId" = ${ctx.tenantId}
         AND "systemId" = ${ctx.systemId} AND "status" = 'ACTIVE'
    )
    UPDATE "KanbanColumn" c SET "sortOrder" = ord.rn
      FROM ord WHERE c."id" = ord."id" AND c."sortOrder" <> ord.rn
  `;
}

/** ความยาวคีย์ที่ยาวที่สุดในคอลัมน์ (ตัวชี้ว่าถึงเวลา rebalance หรือยัง) — 1 คำสั่ง ไม่ต้องดึงทุกแถว */
async function maxKeyLength(tx: Tx, ctx: KanbanCtx, columnId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ len: number | null }[]>`
    SELECT COALESCE(max(length("position")), 0)::int AS len
      FROM "KanbanCard"
     WHERE "columnId" = ${columnId} AND "tenantId" = ${ctx.tenantId}
       AND "systemId" = ${ctx.systemId} AND "status" = 'ACTIVE'
  `;
  return rows[0]?.len ?? 0;
}

/**
 * rewrite คีย์ทั้งคอลัมน์เป็นคีย์สั้นที่สุดที่ห่างเท่ากัน (a0, a1, …) โดย **ลำดับเดิมไม่เปลี่ยน**
 * เขียนกลับด้วย `UPDATE … FROM (VALUES …)` คำสั่งเดียว (คอลัมน์ 300 ใบ = 1 round trip ไม่ใช่ 300)
 */
async function rebalanceColumnCards(tx: Tx, ctx: KanbanCtx, columnId: string): Promise<Map<string, string>> {
  const rows = await tx.kanbanCard.findMany({
    where: { columnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const keys = rebalanceKeys(rows.length);
  const mapping = new Map<string, string>();
  rows.forEach((r, i) => mapping.set(r.id, keys[i]!));
  if (rows.length === 0) return mapping;
  const values = Prisma.join(rows.map((r, i) => Prisma.sql`(${r.id}::text, ${keys[i]!}::text)`));
  await tx.$executeRaw`
    UPDATE "KanbanCard" c SET "position" = v.pos
      FROM (VALUES ${values}) AS v(id, pos)
     WHERE c."id" = v.id
  `;
  return mapping;
}

// ───────────────────────── เพื่อนบ้าน → คีย์ใหม่ ─────────────────────────

type Neighbors = { prev: string | null; next: string | null; placedAt: "between" | "end" };

/**
 * อ่านคีย์ของ "คู่ที่จะแทรกระหว่าง" จากฐานข้อมูลจริงใน tx (1 คำสั่ง)
 * - `beforeCardId` → next = คีย์ของใบนั้น · prev = ใบที่อยู่ก่อนหน้ามันจริง ๆ
 * - `afterCardId`  → prev = คีย์ของใบนั้น · next = ใบถัดไปจริง ๆ
 * - ไม่ส่งเพื่อนบ้าน / เพื่อนบ้านหาย-ถูกเก็บ-ย้ายไปคอลัมน์อื่น → ต่อท้าย (`placedAt:"end"`) ไม่ error (§11.1)
 * 🔴 กันการ์ดที่กำลังย้ายออกจากการคิดเสมอ (ย้ายในคอลัมน์เดิม คีย์ของตัวเองยังอยู่ในคอลัมน์)
 */
async function resolveNeighbors(
  tx: Tx,
  ctx: KanbanCtx,
  columnId: string,
  movingCardId: string,
  beforeCardId: string | null,
  afterCardId: string | null,
): Promise<Neighbors> {
  const anchorId = beforeCardId ?? afterCardId ?? null;
  if (anchorId && anchorId !== movingCardId) {
    const asBefore = Boolean(beforeCardId);
    const rows = asBefore
      ? await tx.$queryRaw<{ apos: string; other: string | null }[]>`
          SELECT a."position" AS apos,
                 (SELECT p."position" FROM "KanbanCard" p
                   WHERE p."columnId" = a."columnId" AND p."status" = 'ACTIVE'
                     AND p."id" <> ${movingCardId} AND p."position" IS NOT NULL
                     AND p."position" < a."position"
                   ORDER BY p."position" DESC LIMIT 1) AS other
            FROM "KanbanCard" a
           WHERE a."id" = ${anchorId} AND a."columnId" = ${columnId}
             AND a."tenantId" = ${ctx.tenantId} AND a."systemId" = ${ctx.systemId}
             AND a."status" = 'ACTIVE' AND a."position" IS NOT NULL
        `
      : await tx.$queryRaw<{ apos: string; other: string | null }[]>`
          SELECT a."position" AS apos,
                 (SELECT p."position" FROM "KanbanCard" p
                   WHERE p."columnId" = a."columnId" AND p."status" = 'ACTIVE'
                     AND p."id" <> ${movingCardId} AND p."position" IS NOT NULL
                     AND p."position" > a."position"
                   ORDER BY p."position" ASC LIMIT 1) AS other
            FROM "KanbanCard" a
           WHERE a."id" = ${anchorId} AND a."columnId" = ${columnId}
             AND a."tenantId" = ${ctx.tenantId} AND a."systemId" = ${ctx.systemId}
             AND a."status" = 'ACTIVE' AND a."position" IS NOT NULL
        `;
    const row = rows[0];
    if (row) {
      return asBefore
        ? { prev: row.other, next: row.apos, placedAt: "between" }
        : { prev: row.apos, next: row.other, placedAt: "between" };
    }
    // เพื่อนบ้านหายไปแล้ว → ตกไปทาง "ต่อท้าย" ข้างล่าง
  }
  const last = await tx.$queryRaw<{ pos: string | null }[]>`
    SELECT max("position") AS pos FROM "KanbanCard"
     WHERE "columnId" = ${columnId} AND "tenantId" = ${ctx.tenantId}
       AND "systemId" = ${ctx.systemId} AND "status" = 'ACTIVE' AND "id" <> ${movingCardId}
  `;
  return { prev: last[0]?.pos ?? null, next: null, placedAt: "end" };
}

// ───────────────────────── moveCard ─────────────────────────

/**
 * ย้ายการ์ด (ในคอลัมน์เดิมหรือข้ามคอลัมน์) ไปยังตำแหน่งระหว่างเพื่อนบ้านที่ระบุ
 *
 * คืน `{ok:false, code}` สำหรับกรณีที่ "ผู้ใช้ทำถูกแต่โลกเปลี่ยนไปแล้ว" (การ์ดถูกเก็บ · คอลัมน์เต็ม ·
 * คอลัมน์ของบอร์ดอื่น) เพื่อให้ UI ที่ลากอยู่คืนการ์ดกลับที่เดิม + toast ได้โดยไม่ต้อง try/catch
 * ส่วน "ไม่มีสิทธิ์" ยังโยน (404/403 ตามกติกา §6.3) เหมือน mutation อื่นของโมดูล
 */
export async function moveCard(ctx: KanbanCtx, input: MoveCardInput): Promise<MoveCardResult> {
  const card = await prisma.kanbanCard.findFirst({
    where: { id: input.cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true, columnId: true, status: true, board: { select: { unitId: true } } },
  });
  if (!card) return fail("NOT_FOUND", "ไม่พบการ์ดนี้");
  // ชั้นสิทธิ์: EDITOR ของบอร์ดใบนี้ (D16) · มองไม่เห็น = 404 · force ต้อง ADMIN (§11.4)
  await assertBoardRole(ctx, card.boardId, input.force ? "ADMIN" : "EDITOR");
  if (card.status !== "ACTIVE") return fail("CARD_ARCHIVED", "การ์ดนี้ถูกเก็บเข้าคลังไปแล้ว");

  const target = await prisma.kanbanColumn.findFirst({
    where: { id: input.toColumnId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true, status: true },
  });
  if (!target) return fail("NOT_FOUND", "ไม่พบคอลัมน์ปลายทาง");
  if (target.boardId !== card.boardId) return fail("CROSS_BOARD", "ย้ายการ์ดข้ามบอร์ดไม่ได้");
  if (target.status !== "ACTIVE") return fail("NOT_FOUND", "คอลัมน์ปลายทางถูกเก็บเข้าคลังแล้ว");

  const result = await prisma.$transaction(async (tx) => {
    await lockColumns(tx, ctx, [card.columnId, target.id]);

    // อ่านซ้ำ "หลังได้ล็อก" — ระหว่างที่รอคิว คนอื่นอาจเก็บการ์ด/คอลัมน์ไปแล้ว
    const fresh = await tx.kanbanCard.findFirst({
      where: { id: card.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
      select: { id: true, columnId: true, boardId: true, status: true, cardNo: true, title: true, completedAt: true },
    });
    if (!fresh) return fail("NOT_FOUND", "ไม่พบการ์ดนี้");
    if (fresh.status !== "ACTIVE") return fail("CARD_ARCHIVED", "การ์ดนี้ถูกเก็บเข้าคลังไปแล้ว");

    const col = await tx.kanbanColumn.findFirst({
      where: { id: target.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
      select: { id: true, boardId: true, status: true, isDoneColumn: true, wipLimit: true },
    });
    if (!col || col.status !== "ACTIVE") return fail("NOT_FOUND", "คอลัมน์ปลายทางถูกเก็บเข้าคลังแล้ว");
    if (col.boardId !== fresh.boardId) return fail("CROSS_BOARD", "ย้ายการ์ดข้ามบอร์ดไม่ได้");

    const crossColumn = fresh.columnId !== col.id;

    // WIP (§11.4): นับเฉพาะ ACTIVE · บล็อกเฉพาะ "ย้ายเข้า" · ADMIN ส่ง force ผ่านได้
    if (crossColumn && col.wipLimit !== null && !input.force) {
      const inColumn = await tx.kanbanCard.count({
        where: { columnId: col.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
      });
      if (inColumn >= col.wipLimit) {
        return fail("WIP_LIMIT", `คอลัมน์เต็ม (${inColumn}/${col.wipLimit}) — ปิดงานที่ค้างก่อน`);
      }
    }

    const nb = await resolveNeighbors(
      tx,
      ctx,
      col.id,
      fresh.id,
      input.beforeCardId ?? null,
      input.afterCardId ?? null,
    );
    let position = keyBetween(nb.prev, nb.next);

    // คอลัมน์ "เสร็จ" (§11.3): เข้า → completedAt = now · ออก → null · ขยับในคอลัมน์เดิมไม่รีเซ็ตเวลาเดิม
    const now = new Date();
    const completedAt = col.isDoneColumn ? (fresh.completedAt ?? now) : null;
    const justCompleted = col.isDoneColumn && fresh.completedAt === null;

    const updated = await tx.kanbanCard.update({
      where: { id: fresh.id },
      data: { columnId: col.id, position, completedAt },
    });

    // rebalance ทันทีเมื่อคีย์ยาวเกินเพดาน (§11.1) — ทั้งคอลัมน์ ใน tx เดียวกัน
    if ((await maxKeyLength(tx, ctx, col.id)) > KANBAN_LIMITS.positionRebalanceLength) {
      const mapping = await rebalanceColumnCards(tx, ctx, col.id);
      position = mapping.get(fresh.id) ?? position;
    }

    // dual-write sortOrder ของคอลัมน์ที่กระทบ (ปลายทางเสมอ · ต้นทางเมื่อข้ามคอลัมน์)
    await renumberCardSortOrder(tx, ctx, col.id);
    if (crossColumn) await renumberCardSortOrder(tx, ctx, fresh.columnId);

    // เหตุการณ์ (§7.1) — ยิงเฉพาะการย้าย "ข้ามคอลัมน์" (ขยับในคอลัมน์เดิมไม่ยิง กันคิว/ประวัติท่วม)
    if (crossColumn) {
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        unitId: card.board.unitId,
        type: "kanban.card.moved",
        idempotencyKey: `kanban.card.moved#${fresh.id}#${updated.updatedAt.getTime()}`,
        payload: {
          cardId: fresh.id,
          boardId: fresh.boardId,
          fromColumnId: fresh.columnId,
          toColumnId: col.id,
          cardNo: updated.cardNo,
          title: updated.title,
        },
      });
    }
    if (justCompleted && completedAt) {
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        unitId: card.board.unitId,
        type: "kanban.card.completed",
        idempotencyKey: `kanban.card.completed#${fresh.id}#${completedAt.getTime()}`,
        payload: {
          cardId: fresh.id,
          boardId: fresh.boardId,
          columnId: col.id,
          cardNo: updated.cardNo,
          completedAt: completedAt.toISOString(),
        },
      });
    }

    // rebalance/renumber เขียนทับ position+sortOrder ด้วย SQL ดิบไปแล้ว (Prisma ไม่รู้)
    // → อ่านแถวจริงกลับมาให้ผู้เรียกเสมอ ไม่ส่งค่าที่ค้างอยู่ใน `updated` กลับไปหลอกจอ
    const finalCard = await tx.kanbanCard.findFirstOrThrow({ where: { id: fresh.id } });
    return { ok: true as const, position: finalCard.position ?? position, placedAt: nb.placedAt, card: finalCard };
  }, TX_OPTS);

  return result;
}

/**
 * ปุ่ม ◀ ▶ ของหน้าเดิม: ย้ายไปคอลัมน์ซ้าย/ขวาถัดไป **ต่อท้าย** คอลัมน์นั้น
 * (ตัวเดียวกับ `service.moveCardSideways` เดิม แต่เดินผ่าน `moveCard` ตัวใหม่ ⇒ ได้ WIP/done/เหตุการณ์/สิทธิ์ครบชุด)
 */
export async function moveCardSideways(
  ctx: KanbanCtx,
  input: { cardId: string; direction: "left" | "right"; force?: boolean },
): Promise<MoveCardResult> {
  const card = await prisma.kanbanCard.findFirst({
    where: { id: input.cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true, columnId: true },
  });
  if (!card) return fail("NOT_FOUND", "ไม่พบการ์ดนี้");
  const cols = await prisma.kanbanColumn.findMany({
    where: { boardId: card.boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const idx = cols.findIndex((c) => c.id === card.columnId);
  const targetIdx = input.direction === "left" ? idx - 1 : idx + 1;
  if (idx < 0 || targetIdx < 0 || targetIdx >= cols.length) {
    return fail("NOT_FOUND", input.direction === "left" ? "ไม่มีคอลัมน์ทางซ้ายแล้ว" : "ไม่มีคอลัมน์ทางขวาแล้ว");
  }
  return moveCard(ctx, { cardId: card.id, toColumnId: cols[targetIdx]!.id, force: input.force });
}

// ───────────────────────── moveColumn ─────────────────────────

export type MoveColumnInput = { columnId: string; beforeColumnId?: string | null; afterColumnId?: string | null };
export type MoveColumnResult = { ok: true; position: string; placedAt: "between" | "end" };

/** ย้ายคอลัมน์ซ้าย-ขวา (EDITOR ตาม D16) — dual-write `sortOrder` 0..n ของทั้งบอร์ด */
export async function moveColumn(ctx: KanbanCtx, input: MoveColumnInput): Promise<MoveColumnResult> {
  const { boardId } = await assertColumnRole(ctx, input.columnId, "EDITOR");

  return prisma.$transaction(async (tx) => {
    await lockBoard(tx, ctx, boardId);
    const cols = await tx.kanbanColumn.findMany({
      where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
      orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });
    const others = cols.filter((c) => c.id !== input.columnId);
    const anchorId = input.beforeColumnId ?? input.afterColumnId ?? null;
    const idx = anchorId ? others.findIndex((c) => c.id === anchorId) : -1;

    let prev: string | null;
    let next: string | null;
    let placedAt: "between" | "end";
    if (idx >= 0) {
      // คอลัมน์ที่ยังไม่ backfill (position = null) ใช้เป็นสมอไม่ได้ → ตกไปท้ายบอร์ดเหมือนเพื่อนบ้านหาย
      const anchorPos = others[idx]!.position;
      if (anchorPos === null) {
        prev = others.at(-1)?.position ?? null;
        next = null;
        placedAt = "end";
      } else if (input.beforeColumnId) {
        prev = others[idx - 1]?.position ?? null;
        next = anchorPos;
        placedAt = "between";
      } else {
        prev = anchorPos;
        next = others[idx + 1]?.position ?? null;
        placedAt = "between";
      }
    } else {
      prev = others.at(-1)?.position ?? null;
      next = null;
      placedAt = "end";
    }

    const position = keyBetween(prev, next);
    await tx.kanbanColumn.update({ where: { id: input.columnId }, data: { position } });
    await renumberColumnSortOrder(tx, ctx, boardId);
    return { ok: true as const, position, placedAt };
  }, TX_OPTS);
}

// ───────────────────────── ตั้งค่าคอลัมน์ ─────────────────────────

/**
 * ตั้ง/ปลดธง "คอลัมน์เสร็จ" (ADMIN ตาม D16)
 * - ติดธง → การ์ดที่อยู่ในคอลัมน์อยู่แล้วได้ `completedAt` ทันที (สัญญา K1.4)
 * - ปลดธง → ล้าง `completedAt` ของการ์ดในคอลัมน์นั้น (สัญญา K1.4 · ต่างจากพิมพ์เขียว §11.3 ที่เขียนว่าคงค่าไว้
 *   — ยึดสัญญา WO เพราะ "คอลัมน์นี้ไม่ใช่คอลัมน์เสร็จอีกต่อไป" แล้วการ์ดยังมีเวลาปิดงานค้างอยู่ = รายงานเพี้ยนกว่า)
 */
export async function setColumnDone(ctx: KanbanCtx, columnId: string, isDone: boolean): Promise<{ ok: true }> {
  await assertColumnRole(ctx, columnId, "ADMIN");
  await prisma.$transaction(async (tx) => {
    await tx.kanbanColumn.updateMany({
      where: { id: columnId, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: { isDoneColumn: isDone },
    });
    await tx.kanbanCard.updateMany({
      where: {
        columnId,
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        status: "ACTIVE",
        ...(isDone ? { completedAt: null } : { completedAt: { not: null } }),
      },
      data: { completedAt: isDone ? new Date() : null },
    });
  }, TX_OPTS);
  return { ok: true };
}

/** เพดานงานพร้อมกันของคอลัมน์ (ADMIN) — `null` = ไม่จำกัด · ต้องเป็นจำนวนเต็ม ≥ 1 */
export async function setColumnWip(ctx: KanbanCtx, columnId: string, wipLimit: number | null): Promise<{ ok: true }> {
  await assertColumnRole(ctx, columnId, "ADMIN");
  if (wipLimit !== null && (!Number.isInteger(wipLimit) || wipLimit < 1)) {
    throw new Error("จำนวนงานพร้อมกันต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป (เว้นว่าง = ไม่จำกัด)");
  }
  await prisma.kanbanColumn.updateMany({
    where: { id: columnId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: { wipLimit },
  });
  return { ok: true };
}

/** เปลี่ยนชื่อคอลัมน์ (EDITOR ตาม D16) */
export async function renameColumn(ctx: KanbanCtx, columnId: string, name: string): Promise<{ ok: true }> {
  await assertColumnRole(ctx, columnId, "EDITOR");
  const clean = name.trim();
  if (clean.length < 1) throw new Error("ตั้งชื่อคอลัมน์ก่อนจึงบันทึกได้");
  if (clean.length > 60) throw new Error("ชื่อคอลัมน์ยาวได้ไม่เกิน 60 ตัวอักษร");
  await prisma.kanbanColumn.updateMany({
    where: { id: columnId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: { name: clean },
  });
  return { ok: true };
}

/**
 * เก็บคอลัมน์เข้าคลัง (ADMIN ตาม D16) — **ต้องว่างก่อน**
 * 🔴 ต่างจาก `service.archiveColumn` เดิมที่เก็บการ์ดตามไปเงียบ ๆ (พิมพ์เขียว §5.3):
 *    การ์ดที่ยังไม่ปิดงานหายไปทั้งคอลัมน์โดยไม่มีใครสั่ง = ของหายจากสายตาทีม
 */
export async function archiveColumn(ctx: KanbanCtx, columnId: string): Promise<{ ok: true }> {
  const { boardId } = await assertColumnRole(ctx, columnId, "ADMIN");
  await prisma.$transaction(async (tx) => {
    await lockBoard(tx, ctx, boardId);
    const cards = await tx.kanbanCard.count({
      where: { columnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    });
    if (cards > 0) throw new Error(`ย้ายการ์ด ${cards} ใบออกก่อนจึงเก็บคอลัมน์นี้ได้`);
    const active = await tx.kanbanColumn.count({
      where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    });
    if (active <= 1) throw new Error("เก็บคอลัมน์สุดท้ายของบอร์ดไม่ได้ — บอร์ดต้องมีอย่างน้อย 1 คอลัมน์");
    await tx.kanbanColumn.updateMany({
      where: { id: columnId, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await renumberColumnSortOrder(tx, ctx, boardId);
  }, TX_OPTS);
  return { ok: true };
}

// ───────────────────────── moveAllCards ─────────────────────────

/**
 * ย้ายการ์ด ACTIVE ทั้งคอลัมน์ไปต่อท้ายอีกคอลัมน์ **โดยคงลำดับเดิม** (ใช้ในกล่อง "เก็บคอลัมน์นี้")
 * ไม่บังคับเพดาน WIP: นี่คืองานจัดบ้านของผู้ดูแล ไม่ใช่การลากงานเข้ามาเพิ่มทีละใบ (§11.4)
 */
export async function moveAllCards(
  ctx: KanbanCtx,
  input: { fromColumnId: string; toColumnId: string },
): Promise<{ moved: number }> {
  const { boardId } = await assertColumnRole(ctx, input.fromColumnId, "EDITOR");
  if (input.fromColumnId === input.toColumnId) return { moved: 0 };

  return prisma.$transaction(async (tx) => {
    await lockColumns(tx, ctx, [input.fromColumnId, input.toColumnId]);
    const target = await tx.kanbanColumn.findFirst({
      where: { id: input.toColumnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
      select: { id: true, boardId: true, isDoneColumn: true },
    });
    if (!target) throw new Error("ไม่พบคอลัมน์ปลายทาง");
    if (target.boardId !== boardId) throw new Error("ย้ายการ์ดข้ามบอร์ดไม่ได้");

    const cards = await tx.kanbanCard.findMany({
      where: { columnId: input.fromColumnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
      orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, completedAt: true },
    });
    if (cards.length === 0) return { moved: 0 };

    const last = await tx.$queryRaw<{ pos: string | null }[]>`
      SELECT max("position") AS pos FROM "KanbanCard"
       WHERE "columnId" = ${target.id} AND "tenantId" = ${ctx.tenantId}
         AND "systemId" = ${ctx.systemId} AND "status" = 'ACTIVE'
    `;
    const keys = keysBetween(last[0]?.pos ?? null, null, cards.length);
    const now = new Date();
    for (let i = 0; i < cards.length; i++) {
      await tx.kanbanCard.update({
        where: { id: cards[i]!.id },
        data: {
          columnId: target.id,
          position: keys[i]!,
          completedAt: target.isDoneColumn ? (cards[i]!.completedAt ?? now) : null,
        },
      });
    }
    await renumberCardSortOrder(tx, ctx, target.id);
    await renumberCardSortOrder(tx, ctx, input.fromColumnId);
    return { moved: cards.length };
  }, TX_OPTS);
}
