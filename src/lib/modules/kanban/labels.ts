// labels.ts — ป้ายกำกับของบอร์ด (K1.2 · พิมพ์เขียว §5.6)
//
// ป้ายเป็นของ "บอร์ด" ไม่ใช่ของร้าน — ชื่อซ้ำในบอร์ดเดียวกันไม่ได้ (unique(boardId,name))
//
// 🔴 เขียนคู่ช่วงเปลี่ยนผ่าน (§4.6 ข้อ 4): ทุกครั้งที่แถวเชื่อม `KanbanCardLabel` เปลี่ยน
//    ต้องเขียน `KanbanCard.labels` (Json = ชื่อป้าย) ให้ตรงกันในทรานแซกชันเดียวกัน
//    เพราะหน้าจอ/รายงาน/AI ที่ยัง deploy ค้างอยู่รอบก่อนยังอ่าน Json ตัวนี้อยู่
//    (เลิกเขียนได้เมื่อไม่มีโค้ดไหนอ่าน Json แล้ว — คนละ WO)

import type { Prisma } from "@prisma/client";
import { KanbanLabelColor } from "@prisma/client";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import type { KanbanCtx } from "./types";

/** 6 สีตามดีไซน์ (D9) — ลำดับนี้คือลำดับที่ backfill/สร้างอัตโนมัติใช้ไล่สี */
export const KANBAN_LABEL_COLORS: readonly KanbanLabelColor[] = [
  KanbanLabelColor.SLATE,
  KanbanLabelColor.BLUE,
  KanbanLabelColor.GREEN,
  KanbanLabelColor.AMBER,
  KanbanLabelColor.RED,
  KanbanLabelColor.PURPLE,
] as const;

const LABEL_NAME_MAX = 40;

export type LabelRow = {
  id: string;
  boardId: string;
  name: string;
  color: KanbanLabelColor;
  sortOrder: number;
};

export type LabelWithCount = LabelRow & { cardCount: number };

type Tx = Prisma.TransactionClient;

// ───────────────────────── ตัวช่วยภายใน ─────────────────────────

/** สีที่ผู้ใช้ส่งมาต้องอยู่ใน 6 สีเท่านั้น — ไม่งั้นโยนข้อความไทย (ไม่ปล่อยให้ไปตายที่ DB เป็น 500 ดิบ) */
function normalizeColor(color: string): KanbanLabelColor {
  const found = KANBAN_LABEL_COLORS.find((c) => c === color);
  if (!found) throw new Error(`สีป้าย "${color}" ใช้ไม่ได้ — เลือกได้เฉพาะ ${KANBAN_LABEL_COLORS.join(" / ")}`);
  return found;
}

function normalizeName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error("ต้องตั้งชื่อป้ายกำกับก่อน");
  if (n.length > LABEL_NAME_MAX) throw new Error(`ชื่อป้ายยาวเกิน ${LABEL_NAME_MAX} ตัวอักษร — ตั้งให้สั้นลง`);
  return n;
}

/** อ่าน `KanbanCard.labels` (Json) เป็น string[] แบบไม่เชื่อรูปข้อมูล (แถวเก่าอาจเพี้ยน) */
function readLabelNames(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** บอร์ดต้องอยู่ในร้าน+ระบบของ ctx — ไม่ใช่ = "ไม่พบ" (404 ไม่ใช่ 403 · §6.3) */
async function requireBoard(ctx: KanbanCtx, boardId: string): Promise<{ id: string }> {
  const board = await prisma.kanbanBoard.findFirst({
    where: { id: boardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true },
  });
  if (!board) throw new Error("ไม่พบบอร์ดนี้");
  return board;
}

async function requireLabel(ctx: KanbanCtx, labelId: string): Promise<LabelRow> {
  const label = await prisma.kanbanLabel.findFirst({
    where: { id: labelId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true, name: true, color: true, sortOrder: true },
  });
  if (!label) throw new Error("ไม่พบป้ายกำกับนี้");
  return label;
}

/**
 * เขียน `labels` Json ของการ์ดให้ตรงกับแถวเชื่อมที่มีอยู่จริงในทรานแซกชันนี้
 * (เรียกหลังจากแก้ `KanbanCardLabel` เสร็จเสมอ — คือหัวใจของ dual-write)
 */
async function syncCardLabelJson(tx: Tx, cardId: string): Promise<string[]> {
  const links = await tx.kanbanCardLabel.findMany({
    where: { cardId },
    select: { label: { select: { name: true, sortOrder: true } } },
  });
  const names = links
    .map((l) => l.label)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"))
    .map((l) => l.name);
  await tx.kanbanCard.update({ where: { id: cardId }, data: { labels: names } });
  return names;
}

// ───────────────────────── API ─────────────────────────

/** ป้ายทั้งหมดของบอร์ด + จำนวนการ์ดที่ติดป้ายนั้น (ใช้ในแผงตัวกรอง/ตั้งค่าบอร์ด) */
export async function listLabels(ctx: KanbanCtx, boardId: string): Promise<LabelWithCount[]> {
  await requireBoard(ctx, boardId);
  const rows = await prisma.kanbanLabel.findMany({
    where: { boardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      boardId: true,
      name: true,
      color: true,
      sortOrder: true,
      _count: { select: { cards: true } },
    },
  });
  return rows.map(({ _count, ...r }) => ({ ...r, cardCount: _count.cards }));
}

export async function createLabel(
  ctx: KanbanCtx,
  boardId: string,
  input: { name: string; color: string; sortOrder?: number },
): Promise<LabelRow> {
  await requireBoard(ctx, boardId);
  const name = normalizeName(input.name);
  const color = normalizeColor(input.color);
  const count = await prisma.kanbanLabel.count({ where: { boardId } });
  if (count >= KANBAN_LIMITS.labelsPerBoard) {
    throw new Error(`ป้ายกำกับได้สูงสุด ${KANBAN_LIMITS.labelsPerBoard} ป้ายต่อบอร์ด — ลบป้ายที่ไม่ได้ใช้ก่อน`);
  }
  const dup = await prisma.kanbanLabel.findFirst({ where: { boardId, name }, select: { id: true } });
  if (dup) throw new Error(`มีป้ายชื่อ "${name}" ในบอร์ดนี้แล้ว`);
  try {
    return await prisma.kanbanLabel.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        boardId,
        name,
        color,
        sortOrder: input.sortOrder ?? count,
      },
      select: { id: true, boardId: true, name: true, color: true, sortOrder: true },
    });
  } catch {
    // ชนกันตอนสร้างพร้อมกัน (unique boardId+name) — ข้อความเดียวกับด่านข้างบน ไม่ปล่อย error ดิบออกไป
    throw new Error(`มีป้ายชื่อ "${name}" ในบอร์ดนี้แล้ว`);
  }
}

/** เปลี่ยนชื่อ/สีป้าย — เปลี่ยนชื่อแล้วต้องไล่แก้ `labels` Json ของทุกการ์ดที่ติดป้ายนี้ด้วย */
export async function updateLabel(
  ctx: KanbanCtx,
  labelId: string,
  patch: { name?: string; color?: string; sortOrder?: number },
): Promise<LabelRow> {
  const label = await requireLabel(ctx, labelId);
  const data: Prisma.KanbanLabelUpdateInput = {};
  if (patch.name !== undefined) {
    const name = normalizeName(patch.name);
    if (name !== label.name) {
      const dup = await prisma.kanbanLabel.findFirst({
        where: { boardId: label.boardId, name, id: { not: label.id } },
        select: { id: true },
      });
      if (dup) throw new Error(`มีป้ายชื่อ "${name}" ในบอร์ดนี้แล้ว`);
    }
    data.name = name;
  }
  if (patch.color !== undefined) data.color = normalizeColor(patch.color);
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (Object.keys(data).length === 0) return label;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.kanbanLabel.update({
      where: { id: label.id },
      data,
      select: { id: true, boardId: true, name: true, color: true, sortOrder: true },
    });
    if (updated.name !== label.name || patch.sortOrder !== undefined) {
      const links = await tx.kanbanCardLabel.findMany({ where: { labelId: label.id }, select: { cardId: true } });
      for (const { cardId } of links) await syncCardLabelJson(tx, cardId);
    }
    return updated;
  });
}

/** ลบป้าย → ปลดจากทุกการ์ด + ลบชื่อออกจาก `labels` Json ของการ์ดเหล่านั้น */
export async function deleteLabel(ctx: KanbanCtx, labelId: string): Promise<{ cardsTouched: number }> {
  const label = await requireLabel(ctx, labelId);
  return prisma.$transaction(async (tx) => {
    const links = await tx.kanbanCardLabel.findMany({ where: { labelId: label.id }, select: { cardId: true } });
    await tx.kanbanCardLabel.deleteMany({ where: { labelId: label.id } });
    await tx.kanbanLabel.delete({ where: { id: label.id } });
    for (const { cardId } of links) await syncCardLabelJson(tx, cardId);
    return { cardsTouched: links.length };
  });
}

/**
 * ตั้งชุดป้ายของการ์ด (แทนที่ทั้งชุด)
 * - ป้ายทุกใบต้องเป็นของ "บอร์ดเดียวกับการ์ด" ไม่งั้นโยน และไม่เขียนอะไรเลย
 * - เขียน `labels` Json คู่กันในทรานแซกชันเดียว
 */
export async function setCardLabels(ctx: KanbanCtx, cardId: string, labelIds: string[]): Promise<string[]> {
  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, boardId: true },
  });
  if (!card) throw new Error("ไม่พบการ์ดนี้");

  const ids = [...new Set(labelIds)];
  if (ids.length > 0) {
    const labels = await prisma.kanbanLabel.findMany({
      where: { id: { in: ids }, tenantId: ctx.tenantId, systemId: ctx.systemId },
      select: { id: true, boardId: true },
    });
    // ตรวจให้ครบ **ก่อน** เขียนสักแถว — ป้ายของบอร์ดอื่น/ร้านอื่น = ปฏิเสธทั้งชุด
    const missing = ids.filter((id) => !labels.some((l) => l.id === id));
    if (missing.length > 0) throw new Error("ไม่พบป้ายกำกับที่เลือกบางใบในบอร์ดนี้");
    const foreign = labels.filter((l) => l.boardId !== card.boardId);
    if (foreign.length > 0) throw new Error("ป้ายกำกับที่เลือกไม่ได้อยู่ในบอร์ดเดียวกับการ์ด");
  }

  return prisma.$transaction(async (tx) => {
    await tx.kanbanCardLabel.deleteMany({ where: { cardId: card.id, labelId: { notIn: ids.length ? ids : ["__none__"] } } });
    if (ids.length > 0) {
      await tx.kanbanCardLabel.createMany({
        data: ids.map((labelId) => ({ cardId: card.id, labelId, tenantId: ctx.tenantId })),
        skipDuplicates: true,
      });
    }
    return syncCardLabelJson(tx, card.id);
  });
}

/**
 * ตั้งป้ายของการ์ดด้วย "ชื่อ" (ความเข้ากันได้ย้อนหลัง: createCard/updateCard เดิมรับ `labels: string[]`
 * และ seed/AI/โค้ดเก่ายังส่งชื่อมา) — ชื่อที่ยังไม่มีในบอร์ดจะถูกสร้างเป็น `KanbanLabel` ให้อัตโนมัติ
 * ไล่สีวนจาก 6 สี · ชนเพดาน 30 ป้าย/บอร์ด → ไม่สร้างเพิ่ม (แต่ยังเก็บชื่อไว้ใน Json ไม่ทำให้การสร้างการ์ดล้ม)
 */
export async function applyCardLabelNames(
  ctx: KanbanCtx,
  card: { id: string; boardId: string },
  names: string[],
): Promise<void> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (wanted.length === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.kanbanCardLabel.deleteMany({ where: { cardId: card.id } });
      await tx.kanbanCard.update({ where: { id: card.id }, data: { labels: [] } });
    });
    return;
  }
  const existing = await prisma.kanbanLabel.findMany({
    where: { boardId: card.boardId, name: { in: wanted } },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((l) => [l.name, l.id]));
  const toCreate = wanted.filter((n) => !byName.has(n));
  if (toCreate.length > 0) {
    let count = await prisma.kanbanLabel.count({ where: { boardId: card.boardId } });
    for (const name of toCreate) {
      if (count >= KANBAN_LIMITS.labelsPerBoard) break; // เต็มเพดาน — คงชื่อไว้ใน Json อย่างเดียว
      const created = await prisma.kanbanLabel
        .create({
          data: {
            tenantId: ctx.tenantId,
            systemId: ctx.systemId,
            boardId: card.boardId,
            name: name.slice(0, LABEL_NAME_MAX),
            color: KANBAN_LABEL_COLORS[count % KANBAN_LABEL_COLORS.length]!,
            sortOrder: count,
          },
          select: { id: true, name: true },
        })
        .catch(async () => prisma.kanbanLabel.findFirst({ where: { boardId: card.boardId, name }, select: { id: true, name: true } }));
      if (created) byName.set(created.name, created.id);
      count += 1;
    }
  }
  const ids = wanted.map((n) => byName.get(n)).filter((v): v is string => typeof v === "string");
  await prisma.$transaction(async (tx) => {
    await tx.kanbanCardLabel.deleteMany({ where: { cardId: card.id, labelId: { notIn: ids.length ? ids : ["__none__"] } } });
    if (ids.length > 0) {
      await tx.kanbanCardLabel.createMany({
        data: ids.map((labelId) => ({ cardId: card.id, labelId, tenantId: ctx.tenantId })),
        skipDuplicates: true,
      });
    }
    // 🔴 Json = ชื่อที่ผู้เรียกส่งมา (ไม่ใช่ชื่อจากแถวเชื่อม) — ชื่อที่สร้างไม่ได้เพราะชนเพดานต้องไม่หายไปเงียบ ๆ
    await tx.kanbanCard.update({ where: { id: card.id }, data: { labels: wanted } });
  });
}

/** อ่านชื่อป้ายของการ์ดจาก Json (ตัวช่วยให้ไฟล์อื่นไม่ต้องรู้รูปข้อมูล) */
export function cardLabelNames(labels: Prisma.JsonValue | null): string[] {
  return readLabelNames(labels);
}
