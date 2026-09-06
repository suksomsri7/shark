// templates.ts — เทมเพลตบอร์ด (K1.12 · พิมพ์เขียว 13-kanban-v2 §10 · KANBAN-RUN §K1.12)
//
// 6 เทมเพลตแพลตฟอร์ม (`scope=PLATFORM · tenantId=null · key` คงที่) เพิ่มโดย `scripts/seed-kanban-templates.mts`
// ร้านบันทึกของตัวเองเพิ่มได้ (`scope=TENANT · tenantId=ร้าน · key=null`) ผ่าน `saveBoardAsTemplate`
//
// 🔴 `createBoardFromTemplate` ต้อง atomic ทั้งก้อน (บอร์ด+คอลัมน์+ป้าย+การ์ด+เช็คลิสต์+สมาชิกผู้สร้าง)
//    kill กลางคัน → ต้องไม่มีบอร์ดครึ่งใบเหลืออยู่ ⇒ ทุกอย่างอยู่ใน `prisma.$transaction` เดียว
// 🔴 การ์ดจากเทมเพลต **ไม่มีผู้รับผิดชอบและไม่มีกำหนดส่ง** (ให้ทีมเติมเอง) · `sourceType = TEMPLATE`
// 🔴 ตารางนี้ไม่มี `@@unique` ที่ Prisma รู้จัก (unique จริงเป็น partial index เขียนตรงในไมเกรชัน SQL —
//    ดูเหตุผลในคอมเมนต์ของโมเดลใน schema/kanban.prisma) ⇒ ที่นี่ใช้ "หาก่อนแล้วค่อยเขียน" เอง
//    ไม่ใช้ `.upsert()` ของ Prisma (ต้องมี @@unique ในสคีมาก่อน upsert จึงจะรู้จัก where compound ได้)

import type { KanbanBoard, Prisma } from "@prisma/client";
import { evaluate } from "@/lib/core/rbac";
import { KanbanForbiddenError, KanbanNotFoundError } from "./access";
import { logActivity } from "./activity-log";
import { prisma } from "./db";
import { keyBetween, keysBetween } from "./ordering";
import { assertBoardRole } from "./members";
import type { BoardTemplateDto, KanbanActor, KanbanCtx, TemplateCardSpec, TemplateStructure } from "./types";

// 🔴 ชนิดของ structure (`TemplateColumnSpec`/`TemplateLabelSpec`/`TemplateCardSpec`/`TemplateStructure`/
//    `BoardTemplateDto` — สัญญา §K1.12 ปักตายตัว) อยู่ใน `types.ts` (ไฟล์บริสุทธิ์) ไม่ใช่ที่นี่
//    เพื่อให้ client component (`BoardsHome.tsx`/`TemplatePicker.tsx`/`CreateBoardModal.tsx`) `import type`
//    ได้โดยไม่ลากไฟล์นี้ (แตะ prisma) เข้าบันเดิลฝั่ง browser (บทเรียนเดียวกับ K1.11 deviation #1)
export type { TemplateCardSpec, TemplateColumnSpec, TemplateLabelSpec, TemplateStructure, BoardTemplateDto } from "./types";

type TemplateRow = {
  id: string;
  tenantId: string | null;
  scope: "PLATFORM" | "TENANT";
  key: string | null;
  name: string;
  description: string | null;
  icon: string;
  structure: Prisma.JsonValue;
  createdById: string | null;
  createdAt: Date;
};

function toDto(row: TemplateRow): BoardTemplateDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    scope: row.scope,
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    structure: row.structure as unknown as TemplateStructure,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
  };
}

/** actor มีสิทธิ์ `kanban.board.create` ไหม (OWNER/MANAGER ผ่านเสมอ · STAFF ต้องมีคีย์ตรง/`kanban.*`) */
function canCreateBoard(actor: KanbanActor): boolean {
  return evaluate(
    { role: actor.role, unitAccess: actor.unitAccess, permissions: actor.permissions },
    { module: "kanban", action: "kanban.board.create" },
  );
}

/** actor มีสิทธิ์ `kanban.template.manage` ไหม (ใช้ตอนลบเทมเพลตของร้าน) */
function canManageTemplates(actor: KanbanActor): boolean {
  return evaluate(
    { role: actor.role, unitAccess: actor.unitAccess, permissions: actor.permissions },
    { module: "kanban", action: "kanban.template.manage" },
  );
}

// ───────────────────────── อ่าน ─────────────────────────

/** เทมเพลตทั้งหมดที่ ctx.tenantId มองเห็น — แพลตฟอร์มทั้ง 6 (+อนาคต) มาก่อนเสมอ แล้วต่อท้ายด้วยของร้าน */
export async function listTemplates(ctx: KanbanCtx): Promise<BoardTemplateDto[]> {
  const rows = await prisma.kanbanBoardTemplate.findMany({
    where: { OR: [{ scope: "PLATFORM" }, { scope: "TENANT", tenantId: ctx.tenantId }] },
    orderBy: [{ scope: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toDto);
}

/** หาเทมเพลตด้วย id หรือ key (คีย์ใช้ได้เฉพาะเทมเพลตแพลตฟอร์ม) — จำกัดขอบเขตที่ ctx.tenantId มองเห็นเท่านั้น */
async function findTemplate(ctx: KanbanCtx, keyOrId: string): Promise<TemplateRow | null> {
  const visible = { OR: [{ scope: "PLATFORM" as const }, { scope: "TENANT" as const, tenantId: ctx.tenantId }] };
  const byId = await prisma.kanbanBoardTemplate.findFirst({ where: { id: keyOrId, ...visible } });
  if (byId) return byId;
  return prisma.kanbanBoardTemplate.findFirst({ where: { key: keyOrId, ...visible } });
}

// ───────────────────────── สร้างบอร์ดจากเทมเพลต (atomic) ─────────────────────────

export type CreateBoardFromTemplateInput = {
  name?: string;
  unitId?: string | null;
  visibility?: "PRIVATE" | "TENANT";
};

/**
 * สร้างบอร์ดใหม่ทั้งชุดจากเทมเพลต (คอลัมน์+ป้าย+การ์ด+เช็คลิสต์+ผู้สร้างเป็น ADMIN) ใน transaction เดียว
 * — key ไม่พบ / actor ไม่มีสิทธิ์ `kanban.board.create` → โยนก่อนเปิด tx เลย (ไม่มีบอร์ดเศษ)
 */
export async function createBoardFromTemplate(
  ctx: KanbanCtx,
  actor: KanbanActor,
  keyOrId: string,
  input: CreateBoardFromTemplateInput = {},
): Promise<KanbanBoard> {
  if (!canCreateBoard(actor)) throw new KanbanForbiddenError("คุณไม่มีสิทธิ์สร้างบอร์ด");
  const template = await findTemplate(ctx, keyOrId);
  if (!template) throw new Error(`ไม่พบเทมเพลต "${keyOrId}" — เลือกเทมเพลตจากรายการที่มีอยู่จริง`);
  const structure = template.structure as unknown as TemplateStructure;
  if (!Array.isArray(structure.columns) || structure.columns.length === 0) {
    throw new Error("เทมเพลตนี้ไม่มีโครงคอลัมน์ — ใช้สร้างบอร์ดไม่ได้");
  }

  const name = input.name?.trim() || template.name;

  return prisma.$transaction(async (tx) => {
    const colKeys = keysBetween(null, null, structure.columns.length);
    const board = await tx.kanbanBoard.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        name,
        unitId: input.unitId ?? null,
        visibility: input.visibility ?? "PRIVATE",
        createdById: actor.userId,
        templateOfId: template.id,
        columns: {
          create: structure.columns.map((c, i) => ({
            tenantId: ctx.tenantId,
            systemId: ctx.systemId,
            name: c.name,
            sortOrder: i,
            position: colKeys[i]!,
            isDoneColumn: c.isDone === true,
            wipLimit: c.wipLimit ?? null,
            color: c.color ?? null,
          })),
        },
      },
      include: { columns: true },
    });

    // ผู้สร้าง = ADMIN ของบอร์ดใหม่เสมอ (§K1.12)
    await tx.kanbanBoardMember.create({
      data: { tenantId: ctx.tenantId, boardId: board.id, userId: actor.userId, role: "ADMIN", invitedById: actor.userId },
    });

    // ป้าย — สร้างตามลำดับที่ประกาศไว้ในเทมเพลต แล้วจำ id ไว้ผูกกับการ์ด
    const labelIdByName = new Map<string, string>();
    for (let i = 0; i < structure.labels.length; i += 1) {
      const l = structure.labels[i]!;
      const created = await tx.kanbanLabel.create({
        data: { tenantId: ctx.tenantId, systemId: ctx.systemId, boardId: board.id, name: l.name, color: l.color, sortOrder: i },
      });
      labelIdByName.set(l.name, created.id);
    }

    const columnByName = new Map(board.columns.map((c) => [c.name, c]));
    // จัดกลุ่มการ์ดตามคอลัมน์ (คงลำดับที่ปรากฏในเทมเพลต) — ต้องรู้จำนวนต่อคอลัมน์ก่อนจึงคิดคีย์ตำแหน่งได้ทีเดียว
    const cardsByColumn = new Map<string, TemplateCardSpec[]>();
    for (const c of structure.cards) {
      const list = cardsByColumn.get(c.column) ?? [];
      list.push(c);
      cardsByColumn.set(c.column, list);
    }
    const cardPositionOf = new Map<TemplateCardSpec, string>();
    for (const cards of cardsByColumn.values()) {
      const keys = keysBetween(null, null, cards.length);
      cards.forEach((c, i) => cardPositionOf.set(c, keys[i]!));
    }

    let cardNo = 0;
    for (const c of structure.cards) {
      const col = columnByName.get(c.column);
      if (!col) continue; // เทมเพลตพิมพ์ชื่อคอลัมน์ผิด — ข้ามการ์ดใบนี้ไปเงียบ ๆ ดีกว่าทำทั้งบอร์ดล้ม
      cardNo += 1;
      const card = await tx.kanbanCard.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          boardId: board.id,
          columnId: col.id,
          title: c.title,
          description: c.description ?? null,
          labels: c.labels ?? [],
          sortOrder: cardNo,
          position: cardPositionOf.get(c) ?? keyBetween(null, null),
          cardNo,
          sourceType: "TEMPLATE",
          createdById: actor.userId,
        },
      });
      if (c.labels && c.labels.length > 0) {
        const labelIds = c.labels.map((n) => labelIdByName.get(n)).filter((v): v is string => typeof v === "string");
        if (labelIds.length > 0) {
          await tx.kanbanCardLabel.createMany({
            data: labelIds.map((labelId) => ({ cardId: card.id, labelId, tenantId: ctx.tenantId })),
            skipDuplicates: true,
          });
        }
      }
      if (c.checklist && c.checklist.length > 0) {
        const checklist = await tx.kanbanChecklist.create({
          data: { tenantId: ctx.tenantId, cardId: card.id, title: "ขั้นตอนงาน", position: keyBetween(null, null) },
        });
        const itemKeys = keysBetween(null, null, c.checklist.length);
        await tx.kanbanChecklistItem.createMany({
          data: c.checklist.map((text, i) => ({
            tenantId: ctx.tenantId,
            checklistId: checklist.id,
            text,
            position: itemKeys[i]!,
          })),
        });
      }
      await logActivity(tx, {
        tenantId: ctx.tenantId,
        boardId: board.id,
        cardId: card.id,
        actorUserId: actor.userId,
        type: "CARD_CREATED",
        data: { title: card.title, columnId: col.id, sourceType: "TEMPLATE" },
      });
    }

    await tx.kanbanBoard.update({ where: { id: board.id }, data: { cardNoSeq: cardNo } });

    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: board.id,
      actorUserId: actor.userId,
      type: "BOARD_CREATED",
      data: { name: board.name, visibility: board.visibility, unitId: board.unitId, templateId: template.id },
    });

    return board;
  });
}

// ───────────────────────── บันทึกบอร์ดเป็นเทมเพลตของร้าน ─────────────────────────

export type SaveBoardAsTemplateInput = { name: string; description?: string; icon?: string };

/** บันทึกบอร์ดปัจจุบันเป็นเทมเพลต TENANT ของร้าน (ADMIN ของบอร์ดเท่านั้น) — ไม่คัดลอกการ์ดที่เก็บ/ผู้รับผิดชอบ */
export async function saveBoardAsTemplate(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  input: SaveBoardAsTemplateInput,
): Promise<BoardTemplateDto> {
  await assertBoardRole(ctx, boardId, "ADMIN");
  const name = input.name.trim();
  if (!name) throw new Error("ต้องตั้งชื่อเทมเพลตก่อนจึงบันทึกได้");

  const board = await prisma.kanbanBoard.findFirst({
    where: { id: boardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    include: {
      labels: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      columns: {
        where: { status: "ACTIVE" },
        orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
        include: {
          cards: {
            where: { status: "ACTIVE" },
            orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
            include: {
              cardLabels: { include: { label: { select: { name: true } } } },
              checklists: { include: { items: { orderBy: { position: "asc" } } } },
            },
          },
        },
      },
    },
  });
  if (!board) throw new KanbanNotFoundError();

  const structure: TemplateStructure = {
    columns: board.columns.map((c) => ({
      name: c.name,
      isDone: c.isDoneColumn,
      wipLimit: c.wipLimit,
      color: c.color ?? undefined,
    })),
    labels: board.labels.map((l) => ({ name: l.name, color: l.color })),
    cards: board.columns.flatMap((c) =>
      c.cards.map((card) => {
        const items = card.checklists.flatMap((ch) => ch.items.map((i) => i.text));
        return {
          title: card.title,
          column: c.name,
          ...(card.description ? { description: card.description } : {}),
          ...(card.cardLabels.length > 0 ? { labels: card.cardLabels.map((cl) => cl.label.name) } : {}),
          ...(items.length > 0 ? { checklist: items } : {}),
        };
      }),
    ),
  };

  const row = await prisma.kanbanBoardTemplate.create({
    data: {
      tenantId: ctx.tenantId,
      scope: "TENANT",
      key: null,
      name,
      description: input.description?.trim() || null,
      icon: input.icon ?? "copy",
      structure: structure as unknown as Prisma.InputJsonValue,
      createdById: actor.userId,
    },
  });
  return toDto(row);
}

/** ลบเทมเพลตของร้าน (ของแพลตฟอร์มลบไม่ได้) — ต้องเป็นของร้านตัวเอง + มีสิทธิ์ `kanban.template.manage` */
export async function deleteTenantTemplate(ctx: KanbanCtx, actor: KanbanActor, templateId: string): Promise<void> {
  const template = await prisma.kanbanBoardTemplate.findFirst({ where: { id: templateId } });
  if (!template) throw new KanbanNotFoundError("ไม่พบเทมเพลตนี้");
  if (template.scope === "PLATFORM") {
    throw new Error("ลบเทมเพลตของแพลตฟอร์มไม่ได้ — ลบได้เฉพาะเทมเพลตที่ร้านสร้างเอง");
  }
  if (template.tenantId !== ctx.tenantId) throw new KanbanNotFoundError("ไม่พบเทมเพลตนี้");
  if (!canManageTemplates(actor)) throw new KanbanForbiddenError("ต้องมีสิทธิ์จัดการเทมเพลตของบอร์ด");
  await prisma.kanbanBoardTemplate.delete({ where: { id: template.id } });
}
