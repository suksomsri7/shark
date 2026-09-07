// card-templates.ts — เทมเพลตการ์ดในบอร์ด (K2.7 · พิมพ์เขียว 13-kanban-v2 §5.4/§13 K2.7 · สัญญา ledger/KANBAN-RUN.md §K2.7)
//
// "การ์ดต้นแบบ" ของบอร์ด — บันทึกจากการ์ดที่มีอยู่แล้ว (`saveAsCardTemplate`) แล้วนำมาสร้างการ์ดใหม่ซ้ำได้
// (`createCardFromTemplate`) เก็บเฉพาะสิ่งที่ "งานประเภทนี้" ควรมีเหมือนกันทุกครั้ง: ชื่อ/รายละเอียด/ป้าย/
// เช็คลิสต์(ข้อความอย่างเดียว)/ค่าฟิลด์กำหนดเอง — 🔴 ไม่เก็บวันที่/ผู้รับผิดชอบ/สถานะติ๊ก/ไฟล์แนบ
// (คนละงาน คนละกำหนดส่ง คนละคนรับผิดชอบเสมอ — คนสร้างเลือกเองทุกครั้ง)

import type { KanbanCard, Prisma } from "@prisma/client";
import { KanbanNotFoundError } from "./access";
import { logActivity } from "./activity-log";
import { setCardAssignees } from "./cards";
import { prisma } from "./db";
import { getCardFieldValues, setCardFieldValue } from "./fields";
import { KANBAN_LIMITS } from "./limits";
import { assertBoardRole, assertCardRole, assertColumnRole } from "./members";
import { keyBetween, keysBetween } from "./ordering";
import { publishBoardSignal, boardSignal } from "./realtime";
import type { CardTemplateDto, KanbanActor, KanbanCtx } from "./types";

type TemplateChecklistSpec = { title: string; items: string[] };
type TemplateRow = {
  id: string;
  boardId: string;
  name: string;
  title: string;
  description: string | null;
  labelIds: unknown;
  checklists: unknown;
  fieldValues: unknown;
  reminderMinutesBefore: number | null;
  sortOrder: number;
};

function actorUserIdOf(ctx: KanbanCtx, actor?: KanbanActor): string | null {
  return ctx.actorUserId ?? actor?.userId ?? null;
}

function labelIdsOf(row: Pick<TemplateRow, "labelIds">): string[] {
  return Array.isArray(row.labelIds) ? (row.labelIds as string[]) : [];
}

function checklistsOf(row: Pick<TemplateRow, "checklists">): TemplateChecklistSpec[] {
  if (!Array.isArray(row.checklists)) return [];
  return (row.checklists as unknown[])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      title: typeof c.title === "string" ? c.title : "",
      items: Array.isArray(c.items) ? (c.items as unknown[]).filter((i): i is string => typeof i === "string") : [],
    }));
}

function fieldValuesOf(row: Pick<TemplateRow, "fieldValues">): Record<string, unknown> {
  return row.fieldValues && typeof row.fieldValues === "object" ? (row.fieldValues as Record<string, unknown>) : {};
}

async function requireTemplate(ctx: KanbanCtx, id: string): Promise<TemplateRow> {
  const row = await prisma.kanbanCardTemplate.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!row) throw new KanbanNotFoundError("ไม่พบเทมเพลตนี้");
  return row;
}

function toDto(row: TemplateRow): CardTemplateDto {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    labelCount: labelIdsOf(row).length,
    checklistItemCount: checklistsOf(row).reduce((sum, c) => sum + c.items.length, 0),
    sortOrder: row.sortOrder,
  };
}

// ───────────────────────── อ่าน (VIEWER ขึ้นไป) ─────────────────────────

/** เทมเพลตทั้งหมดของบอร์ด เรียงตาม sortOrder — ใช้ทั้งเมนู "จากเทมเพลต ▾" และตั้งค่าบอร์ด */
export async function listCardTemplates(ctx: KanbanCtx, actor: KanbanActor | undefined, boardId: string): Promise<CardTemplateDto[]> {
  void actor;
  await assertBoardRole(ctx, boardId, "VIEWER");
  const rows = await prisma.kanbanCardTemplate.findMany({ where: { boardId, tenantId: ctx.tenantId }, orderBy: { sortOrder: "asc" } });
  return rows.map(toDto);
}

// ───────────────────────── บันทึกเทมเพลต (ADMIN) ─────────────────────────

export type SaveCardTemplateInput = { name: string };

/**
 * บันทึกการ์ดที่เปิดอยู่เป็นเทมเพลตใหม่ของบอร์ด — ADMIN เท่านั้น (เมนู ⋯ ของการ์ด)
 * เก็บ title/description/labelIds/checklists(ข้อความอย่างเดียว)/ค่าฟิลด์กำหนดเอง/reminderMinutesBefore
 * 🔴 ไม่เก็บ dueAt/startAt/ผู้รับผิดชอบ/ไฟล์แนบ/สถานะติ๊ก (ตามสัญญา)
 */
export async function saveAsCardTemplate(
  ctx: KanbanCtx,
  actor: KanbanActor | undefined,
  cardId: string,
  input: SaveCardTemplateInput,
): Promise<CardTemplateDto> {
  const { boardId } = await assertCardRole(ctx, cardId, "ADMIN");
  const name = input.name.trim();
  if (!name) throw new Error("ต้องตั้งชื่อเทมเพลตก่อนจึงบันทึกได้");

  const count = await prisma.kanbanCardTemplate.count({ where: { boardId, tenantId: ctx.tenantId } });
  if (count >= KANBAN_LIMITS.cardTemplatesPerBoard) {
    const err = new Error(`เทมเพลตการ์ดได้สูงสุด ${KANBAN_LIMITS.cardTemplatesPerBoard} ใบต่อบอร์ด — ลบเทมเพลตที่ไม่ได้ใช้ก่อน`);
    (err as Error & { code?: string }).code = "LIMIT_REACHED";
    throw err;
  }

  const card = await prisma.kanbanCard.findFirst({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { title: true, description: true, reminderMinutesBefore: true },
  });
  if (!card) throw new KanbanNotFoundError("ไม่พบการ์ดนี้");

  const [labelRows, checklists, fieldValueRows] = await Promise.all([
    prisma.kanbanCardLabel.findMany({ where: { cardId }, select: { labelId: true } }),
    prisma.kanbanChecklist.findMany({
      where: { cardId },
      orderBy: { position: "asc" },
      include: { items: { orderBy: { position: "asc" }, select: { text: true } } },
    }),
    getCardFieldValues(ctx, actor, cardId),
  ]);

  const checklistsSpec: TemplateChecklistSpec[] = checklists.map((cl) => ({
    title: cl.title,
    items: cl.items.map((i) => i.text),
  }));
  const fieldValues: Record<string, unknown> = {};
  for (const v of fieldValueRows) {
    if (v.value !== null) fieldValues[v.fieldId] = v.value;
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.kanbanCardTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        boardId,
        name,
        title: card.title,
        description: card.description,
        labelIds: labelRows.map((l) => l.labelId) as Prisma.InputJsonValue,
        checklists: checklistsSpec as unknown as Prisma.InputJsonValue,
        fieldValues: fieldValues as Prisma.InputJsonValue,
        reminderMinutesBefore: card.reminderMinutesBefore,
        sortOrder: count,
        createdById: actorUserIdOf(ctx, actor),
      },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      cardId,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "BOARD_UPDATED",
      data: { cardTemplateCreated: name },
    });
    return row;
  });
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.updated", boardId }));
  return toDto(created);
}

// ───────────────────────── สร้างการ์ดจากเทมเพลต (EDITOR) ─────────────────────────

export type CreateCardFromTemplateInput = {
  templateId: string;
  columnId: string;
  /** ไม่ระบุ = ใช้ชื่อจากเทมเพลต */
  title?: string;
  dueAt?: Date | null;
  assigneeUserIds?: string[];
};

/**
 * สร้างการ์ดใหม่จากเทมเพลต — EDITOR ของบอร์ดขึ้นไป (คอลัมน์ใดก็ได้ของบอร์ดเดียวกับเทมเพลต)
 * ป้าย/เช็คลิสต์(ทุกข้อยังไม่ทำ)/ค่าฟิลด์ ตามเทมเพลต · title/dueAt/assigneeUserIds ที่ส่งมาทับค่าเทมเพลต
 * `sourceType: TEMPLATE` `sourceId: templateId` · ไม่ก๊อป dueAt/ผู้รับผิดชอบจากเทมเพลต (เทมเพลตไม่มีเก็บอยู่แล้ว)
 * คืนการ์ดเต็มใบ (แบบเดียวกับ `duplicateCard`/`restoreCard` ใน `cards.ts`) ให้ผู้เรียก (action) ประกอบ
 * `BoardCardDto` ต่อได้เองโดยไม่ต้องแตะ prisma ตรง ๆ
 */
export async function createCardFromTemplate(
  ctx: KanbanCtx,
  actor: KanbanActor | undefined,
  input: CreateCardFromTemplateInput,
): Promise<KanbanCard> {
  const { boardId } = await assertColumnRole(ctx, input.columnId, "EDITOR");
  const template = await prisma.kanbanCardTemplate.findFirst({ where: { id: input.templateId, tenantId: ctx.tenantId, boardId } });
  if (!template) throw new KanbanNotFoundError("ไม่พบเทมเพลตนี้ในบอร์ดนี้");

  const labelIds = labelIdsOf(template);
  const existingLabels = labelIds.length
    ? await prisma.kanbanLabel.findMany({ where: { id: { in: labelIds }, boardId }, select: { id: true } })
    : [];
  const validLabelIds = existingLabels.map((l) => l.id);
  const checklistsSpec = checklistsOf(template);
  const title = input.title?.trim() || template.title;

  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.kanbanCard.findFirst({
      where: { columnId: input.columnId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", position: { not: null } },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = keyBetween(last?.position ?? null, null);
    const seq = await tx.$queryRaw<{ cardNoSeq: number }[]>`
      UPDATE "KanbanBoard" SET "cardNoSeq" = "cardNoSeq" + 1 WHERE id = ${boardId} RETURNING "cardNoSeq"
    `;
    const row = await tx.kanbanCard.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        boardId,
        columnId: input.columnId,
        title,
        description: template.description,
        dueAt: input.dueAt ?? null,
        reminderMinutesBefore: template.reminderMinutesBefore,
        sortOrder: 0,
        position,
        cardNo: seq[0]?.cardNoSeq ?? null,
        sourceType: "TEMPLATE",
        sourceId: template.id,
        createdById: actorUserIdOf(ctx, actor),
      },
    });
    if (validLabelIds.length > 0) {
      await tx.kanbanCardLabel.createMany({
        data: validLabelIds.map((labelId) => ({ cardId: row.id, labelId, tenantId: ctx.tenantId })),
        skipDuplicates: true,
      });
    }
    const checklistPositions = keysBetween(null, null, checklistsSpec.length);
    for (const [ci, cl] of checklistsSpec.entries()) {
      const newChecklist = await tx.kanbanChecklist.create({
        data: { tenantId: ctx.tenantId, cardId: row.id, title: cl.title, position: checklistPositions[ci]! },
      });
      if (cl.items.length > 0) {
        const itemPositions = keysBetween(null, null, cl.items.length);
        await tx.kanbanChecklistItem.createMany({
          data: cl.items.map((text, i) => ({
            tenantId: ctx.tenantId,
            checklistId: newChecklist.id,
            text,
            position: itemPositions[i]!,
            done: false,
          })),
        });
      }
    }
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      cardId: row.id,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "CARD_CREATED",
      data: { title: row.title, columnId: input.columnId, sourceType: "TEMPLATE", templateId: template.id },
    });
    return row;
  });

  if (input.assigneeUserIds && input.assigneeUserIds.length > 0) {
    await setCardAssignees(ctx, created.id, [...new Set(input.assigneeUserIds)]);
  }

  const fieldValues = fieldValuesOf(template);
  if (Object.keys(fieldValues).length > 0) {
    const fields = await prisma.kanbanCustomField.findMany({ where: { boardId, id: { in: Object.keys(fieldValues) } } });
    const typeOf = new Map(fields.map((f) => [f.id, f.type]));
    for (const [fieldId, raw] of Object.entries(fieldValues)) {
      const type = typeOf.get(fieldId);
      if (!type) continue; // ฟิลด์ถูกลบไปแล้วตั้งแต่บันทึกเทมเพลต — ข้าม
      const value = type === "DATE" && typeof raw === "string" ? new Date(raw) : raw;
      await setCardFieldValue(ctx, actor, created.id, fieldId, value).catch(() => {});
    }
  }

  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.created", boardId, cardId: created.id, columnId: input.columnId }));
  return created;
}

// ───────────────────────── แก้ไข/ลบ/จัดลำดับ (ADMIN) ─────────────────────────

export type UpdateCardTemplateInput = { name?: string; title?: string; description?: string | null };

export async function updateCardTemplate(
  ctx: KanbanCtx,
  actor: KanbanActor | undefined,
  id: string,
  patch: UpdateCardTemplateInput,
): Promise<CardTemplateDto> {
  const tpl = await requireTemplate(ctx, id);
  await assertBoardRole(ctx, tpl.boardId, "ADMIN");
  const data: Prisma.KanbanCardTemplateUpdateInput = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("ต้องตั้งชื่อเทมเพลตก่อนจึงบันทึกได้");
    data.name = name;
  }
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error("ต้องตั้งชื่อการ์ดในเทมเพลตก่อนจึงบันทึกได้");
    data.title = title;
  }
  if (patch.description !== undefined) data.description = patch.description;
  if (Object.keys(data).length === 0) return toDto(tpl);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.kanbanCardTemplate.update({ where: { id: tpl.id }, data });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: tpl.boardId,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "BOARD_UPDATED",
      data: { cardTemplateUpdated: row.name },
    });
    return row;
  });
  await publishBoardSignal(ctx, tpl.boardId, boardSignal({ type: "card.updated", boardId: tpl.boardId }));
  return toDto(updated);
}

/** ลบเทมเพลต — ADMIN เท่านั้น · การ์ดที่เคยสร้างจากมันไปแล้วไม่กระทบ (sourceId ยังชี้ id เดิมไว้เป็นประวัติ) */
export async function deleteCardTemplate(ctx: KanbanCtx, actor: KanbanActor | undefined, id: string): Promise<void> {
  const tpl = await requireTemplate(ctx, id);
  await assertBoardRole(ctx, tpl.boardId, "ADMIN");
  await prisma.$transaction(async (tx) => {
    await tx.kanbanCardTemplate.delete({ where: { id: tpl.id } });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: tpl.boardId,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "BOARD_UPDATED",
      data: { cardTemplateDeleted: tpl.name },
    });
  });
  await publishBoardSignal(ctx, tpl.boardId, boardSignal({ type: "card.updated", boardId: tpl.boardId }));
}

/** ลากเรียงลำดับเทมเพลต (หน้าตั้งค่า) — id ที่ไม่ส่งมาต่อท้ายตามลำดับเดิม (แบบเดียวกับ `reorderFields`) */
export async function reorderCardTemplates(ctx: KanbanCtx, actor: KanbanActor | undefined, boardId: string, ids: string[]): Promise<{ ok: true }> {
  await assertBoardRole(ctx, boardId, "ADMIN");
  const all = await prisma.kanbanCardTemplate.findMany({ where: { boardId, tenantId: ctx.tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  const known = new Set(all.map((t) => t.id));
  const ordered = [...ids.filter((id) => known.has(id)), ...all.map((t) => t.id).filter((id) => !ids.includes(id))];
  await prisma.$transaction(async (tx) => {
    for (const [i, id] of ordered.entries()) {
      await tx.kanbanCardTemplate.update({ where: { id }, data: { sortOrder: i } });
    }
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "BOARD_UPDATED",
      data: { cardTemplatesReordered: true },
    });
  });
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.updated", boardId }));
  return { ok: true };
}
