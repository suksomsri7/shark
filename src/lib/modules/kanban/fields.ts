// fields.ts — ฟิลด์กำหนดเอง 5 ชนิด ≤20/บอร์ด (K2.6 · พิมพ์เขียว 13-kanban-v2 §3.10/§4.3 · สัญญา ledger/KANBAN-RUN.md §K2.6)
//
// นิยามฟิลด์ (`KanbanCustomField`) เป็น "ของบอร์ด" (เหมือนป้ายกำกับ) — จัดการได้เฉพาะ ADMIN
// ค่าฟิลด์ (`KanbanCustomFieldValue`) เป็น "ของการ์ด" — แก้ได้ตั้งแต่ EDITOR ขึ้นไป
// 🔴 1 ฟิลด์เก็บค่าได้ชนิดเดียวเสมอ (ตรงกับ `type` ของฟิลด์) — คอลัมน์ value* ที่ไม่ตรงชนิดต้องเป็น null เสมอ
// 🔴 `null` = ลบแถวค่า (ไม่ใช่แค่ล้างเป็น null ในคอลัมน์ — ค่าที่ไม่มีความหมาย = ไม่มีแถว)

import type { KanbanCustomField, KanbanCustomFieldType, Prisma } from "@prisma/client";
import { logActivity } from "./activity-log";
import { KanbanNotFoundError } from "./access";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import { assertBoardRole, assertCardRole } from "./members";
import { publishBoardSignal, boardSignal } from "./realtime";
import type { CardFieldValueDto, CustomFieldDto, CustomFieldOptions, FieldOnCardDto, KanbanActor, KanbanCtx } from "./types";

// ชนิดที่ client component ต้อง `import type` ได้โดยไม่ลาก prisma เข้าบันเดิล อยู่ที่ `types.ts` จริง
// (แบบเดียวกับ K1.11/…/K2.5) — export ซ้ำที่นี่ให้ผู้เรียกยัง `import type { CustomFieldDto } from ".../fields"` ได้
export type { CardFieldValueDto, CustomFieldDto, CustomFieldOptions } from "./types";

const NAME_MAX = 60;
const TEXT_VALUE_MAX = 500;
const FIELD_TYPES: readonly KanbanCustomFieldType[] = ["TEXT", "NUMBER", "DATE", "CHECKBOX", "SELECT"];

// ───────────────────────── ตัวช่วยภายใน ─────────────────────────

function actorUserIdOf(ctx: KanbanCtx, actor?: KanbanActor): string | null {
  return ctx.actorUserId ?? actor?.userId ?? null;
}

function normalizeName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error("ต้องตั้งชื่อฟิลด์ก่อนจึงบันทึกได้");
  if (n.length > NAME_MAX) throw new Error(`ชื่อฟิลด์ยาวเกิน ${NAME_MAX} ตัวอักษร — ตั้งให้สั้นลง`);
  return n;
}

function normalizeType(type: string): KanbanCustomFieldType {
  const found = FIELD_TYPES.find((t) => t === type);
  if (!found) throw new Error(`ชนิดฟิลด์ "${type}" ใช้ไม่ได้ — เลือกได้เฉพาะ ${FIELD_TYPES.join(" / ")}`);
  return found;
}

/** ตรวจ/ทำความสะอาด options ตามชนิดฟิลด์ — SELECT ต้องมี choices อย่างน้อย 1 ตัวเลือกเสมอ */
function normalizeOptions(type: KanbanCustomFieldType, raw: unknown): CustomFieldOptions {
  const o = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  if (type === "SELECT") {
    const choicesRaw = Array.isArray(o.choices) ? o.choices : [];
    const choices = choicesRaw
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim())
      .filter(Boolean);
    if (choices.length === 0) throw new Error("ฟิลด์ชนิดตัวเลือกต้องมีอย่างน้อย 1 ตัวเลือก");
    return { choices: [...new Set(choices)] };
  }
  if (type === "NUMBER") {
    const unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim().slice(0, 20) : undefined;
    const decimals =
      typeof o.decimals === "number" && Number.isFinite(o.decimals) ? Math.min(4, Math.max(0, Math.floor(o.decimals))) : undefined;
    return { ...(unit ? { unit } : {}), ...(decimals !== undefined ? { decimals } : {}) };
  }
  return {};
}

function optionsOf(field: Pick<KanbanCustomField, "options">): CustomFieldOptions {
  return (field.options && typeof field.options === "object" ? (field.options as CustomFieldOptions) : {}) ?? {};
}

async function requireField(ctx: KanbanCtx, fieldId: string): Promise<KanbanCustomField> {
  const field = await prisma.kanbanCustomField.findFirst({ where: { id: fieldId, tenantId: ctx.tenantId } });
  if (!field) throw new KanbanNotFoundError("ไม่พบฟิลด์นี้");
  return field;
}

function toDto(field: KanbanCustomField): CustomFieldDto {
  return {
    id: field.id,
    boardId: field.boardId,
    name: field.name,
    type: field.type,
    options: optionsOf(field),
    showOnCard: field.showOnCard,
    sortOrder: field.sortOrder,
  };
}

// ───────────────────────── การแสดงผลไทย ─────────────────────────
// ห้าม toLocale*/getDay (กติกาของ run นี้) — จัดกลุ่มหลักพันเอง + ปฏิทินไทยคำนวณมือแบบเดียวกับ Card.tsx/ThaiDatePicker

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

function formatThaiDate(d: Date): string {
  const bkk = new Date(d.getTime() + BKK_OFFSET_MS);
  return `${bkk.getUTCDate()} ${TH_MONTH[bkk.getUTCMonth()]} ${bkk.getUTCFullYear() + 543}`;
}

/** จุดคั่นหลักพัน — เขียนเองแทน toLocaleString (ห้าม toLocale* ในโมดูลนี้) */
function groupThousands(n: number): string {
  const neg = n < 0;
  const [intPart, decPart] = Math.abs(n).toFixed(4).replace(/0+$/, "").replace(/\.$/, "").split(".");
  const grouped = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}${decPart ? `.${decPart.padEnd(2, "0").slice(0, Math.max(2, decPart.length))}` : ""}`;
}

function formatNumber(n: number, options: CustomFieldOptions): string {
  const decimals = options.decimals ?? (Number.isInteger(n) ? 0 : 2);
  const fixed = Number(n.toFixed(decimals));
  const grouped = groupThousands(fixed);
  if (!options.unit) return grouped;
  return options.unit === "บาท" ? `฿${grouped}` : `${grouped} ${options.unit}`;
}

function formatDisplay(type: KanbanCustomFieldType, value: string | number | boolean | null, options: CustomFieldOptions): string {
  if (value === null) return "—";
  switch (type) {
    case "NUMBER":
      return formatNumber(value as number, options);
    case "DATE":
      return formatThaiDate(new Date(value as string));
    case "CHECKBOX":
      return value ? "✓" : "—";
    case "SELECT":
    case "TEXT":
    default:
      return String(value);
  }
}

/** อ่านค่าดิบจากแถว value → ชนิดที่ JS ใช้ (number/string/boolean/Date-ISO) ตามชนิดฟิลด์ */
function readRawValue(
  type: KanbanCustomFieldType,
  row: { valueText: string | null; valueNumber: Prisma.Decimal | number | null; valueDate: Date | null; valueBool: boolean | null; valueOption: string | null } | null,
): string | number | boolean | null {
  if (!row) return null;
  switch (type) {
    case "NUMBER":
      return row.valueNumber === null ? null : Number(row.valueNumber);
    case "DATE":
      return row.valueDate === null ? null : row.valueDate.toISOString();
    case "CHECKBOX":
      return row.valueBool === null ? null : row.valueBool;
    case "SELECT":
      return row.valueOption;
    case "TEXT":
    default:
      return row.valueText;
  }
}

// ───────────────────────── นิยามฟิลด์ (ADMIN) ─────────────────────────

/** ฟิลด์ทั้งหมดของบอร์ด เรียงตาม sortOrder — VIEWER ขึ้นไปดูได้ (ใช้ในหลังการ์ด/ตั้งค่า/ตาราง) */
export async function listFields(ctx: KanbanCtx, actor: KanbanActor | undefined, boardId: string): Promise<CustomFieldDto[]> {
  void actor;
  await assertBoardRole(ctx, boardId, "VIEWER");
  const rows = await prisma.kanbanCustomField.findMany({ where: { boardId, tenantId: ctx.tenantId }, orderBy: { sortOrder: "asc" } });
  return rows.map(toDto);
}

export type CreateFieldInput = { name: string; type: string; options?: unknown; showOnCard?: boolean };

/** สร้างฟิลด์ใหม่ของบอร์ด — ADMIN เท่านั้น · ชื่อซ้ำ/ว่าง/SELECT ไม่มีตัวเลือก → throw ไทย · เพดาน 20/บอร์ด */
export async function createField(ctx: KanbanCtx, actor: KanbanActor | undefined, boardId: string, input: CreateFieldInput): Promise<CustomFieldDto> {
  await assertBoardRole(ctx, boardId, "ADMIN");
  const name = normalizeName(input.name);
  const type = normalizeType(input.type);
  const options = normalizeOptions(type, input.options);

  const count = await prisma.kanbanCustomField.count({ where: { boardId, tenantId: ctx.tenantId } });
  if (count >= KANBAN_LIMITS.customFieldsPerBoard) {
    const err = new Error(`ฟิลด์กำหนดเองได้สูงสุด ${KANBAN_LIMITS.customFieldsPerBoard} ฟิลด์ต่อบอร์ด — ลบฟิลด์ที่ไม่ได้ใช้ก่อน`);
    (err as Error & { code?: string }).code = "LIMIT_REACHED";
    throw err;
  }
  const dup = await prisma.kanbanCustomField.findFirst({ where: { boardId, name }, select: { id: true } });
  if (dup) throw new Error(`มีฟิลด์ชื่อ "${name}" ในบอร์ดนี้แล้ว`);

  const field = await prisma.$transaction(async (tx) => {
    const created = await tx.kanbanCustomField
      .create({
        data: { tenantId: ctx.tenantId, boardId, name, type, options: options as Prisma.InputJsonValue, showOnCard: input.showOnCard ?? false, sortOrder: count },
      })
      .catch(() => {
        throw new Error(`มีฟิลด์ชื่อ "${name}" ในบอร์ดนี้แล้ว`);
      });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "BOARD_UPDATED",
      data: { customFieldCreated: name },
    });
    return created;
  });
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.updated", boardId }));
  return toDto(field);
}

export type UpdateFieldInput = { name?: string; options?: unknown; showOnCard?: boolean; sortOrder?: number };

/** แก้ชื่อ/ตัวเลือก/สลับแสดงบนการ์ด — ADMIN เท่านั้น (ชนิดฟิลด์แก้ไม่ได้หลังสร้าง — ค่าที่กรอกไปแล้วจะตีความผิดชนิด) */
export async function updateField(ctx: KanbanCtx, actor: KanbanActor | undefined, fieldId: string, patch: UpdateFieldInput): Promise<CustomFieldDto> {
  const field = await requireField(ctx, fieldId);
  await assertBoardRole(ctx, field.boardId, "ADMIN");
  const data: Prisma.KanbanCustomFieldUpdateInput = {};
  if (patch.name !== undefined) {
    const name = normalizeName(patch.name);
    if (name !== field.name) {
      const dup = await prisma.kanbanCustomField.findFirst({ where: { boardId: field.boardId, name, id: { not: field.id } }, select: { id: true } });
      if (dup) throw new Error(`มีฟิลด์ชื่อ "${name}" ในบอร์ดนี้แล้ว`);
    }
    data.name = name;
  }
  if (patch.options !== undefined) data.options = normalizeOptions(field.type, patch.options) as Prisma.InputJsonValue;
  if (patch.showOnCard !== undefined) data.showOnCard = patch.showOnCard;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (Object.keys(data).length === 0) return toDto(field);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.kanbanCustomField.update({ where: { id: field.id }, data });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: field.boardId,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "BOARD_UPDATED",
      data: { customFieldUpdated: row.name },
    });
    return row;
  });
  await publishBoardSignal(ctx, field.boardId, boardSignal({ type: "card.updated", boardId: field.boardId }));
  return toDto(updated);
}

/** ลบฟิลด์ — ADMIN เท่านั้น · cascade ค่าของทุกการ์ดไปด้วย (FK onDelete Cascade) */
export async function deleteField(ctx: KanbanCtx, actor: KanbanActor | undefined, fieldId: string): Promise<void> {
  const field = await requireField(ctx, fieldId);
  await assertBoardRole(ctx, field.boardId, "ADMIN");
  await prisma.$transaction(async (tx) => {
    await tx.kanbanCustomField.delete({ where: { id: field.id } });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: field.boardId,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "BOARD_UPDATED",
      data: { customFieldDeleted: field.name },
    });
  });
  await publishBoardSignal(ctx, field.boardId, boardSignal({ type: "card.updated", boardId: field.boardId }));
}

/** ลากเรียงลำดับฟิลด์ (หน้าตั้งค่า) — ฟิลด์ที่ไม่ส่งมาต่อท้ายตามลำดับเดิม */
export async function reorderFields(ctx: KanbanCtx, actor: KanbanActor | undefined, boardId: string, ids: string[]): Promise<{ ok: true }> {
  await assertBoardRole(ctx, boardId, "ADMIN");
  const all = await prisma.kanbanCustomField.findMany({ where: { boardId, tenantId: ctx.tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  const known = new Set(all.map((f) => f.id));
  const ordered = [...ids.filter((id) => known.has(id)), ...all.map((f) => f.id).filter((id) => !ids.includes(id))];
  // K1.10: เขียนลำดับใหม่ + ประวัติในทรานแซกชันเดียวกัน (callback form — array form ของ $transaction
  // แยกอิสระต่อกัน ไม่มี tx เดียวให้ logActivity เกาะ)
  await prisma.$transaction(async (tx) => {
    for (const [i, id] of ordered.entries()) {
      await tx.kanbanCustomField.update({ where: { id }, data: { sortOrder: i } });
    }
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      actorUserId: actorUserIdOf(ctx, actor),
      type: "BOARD_UPDATED",
      data: { customFieldsReordered: true },
    });
  });
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.updated", boardId }));
  return { ok: true };
}

// ───────────────────────── ค่าฟิลด์ต่อการ์ด (EDITOR) ─────────────────────────

/** ตรวจ+แปลงค่าตามชนิดฟิลด์ — โยนไทยเมื่อผิดชนิด (ไม่บันทึกอะไรเลย) */
function coerceValue(field: KanbanCustomField, value: unknown): { valueText: string | null; valueNumber: number | null; valueDate: Date | null; valueBool: boolean | null; valueOption: string | null } {
  const empty = { valueText: null, valueNumber: null, valueDate: null, valueBool: null, valueOption: null };
  switch (field.type) {
    case "TEXT": {
      if (typeof value !== "string") throw new Error(`ฟิลด์ "${field.name}" ต้องเป็นข้อความ`);
      const v = value.trim();
      if (v.length > TEXT_VALUE_MAX) throw new Error(`ฟิลด์ "${field.name}" ยาวเกิน ${TEXT_VALUE_MAX} ตัวอักษร`);
      return { ...empty, valueText: v };
    }
    case "NUMBER": {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`ฟิลด์ "${field.name}" ต้องเป็นตัวเลข`);
      return { ...empty, valueNumber: value };
    }
    case "DATE": {
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`ฟิลด์ "${field.name}" ต้องเป็นวันที่ที่ถูกต้อง`);
      return { ...empty, valueDate: value };
    }
    case "CHECKBOX": {
      if (typeof value !== "boolean") throw new Error(`ฟิลด์ "${field.name}" ต้องเป็นค่าถูก/ไม่ถูก`);
      return { ...empty, valueBool: value };
    }
    case "SELECT": {
      const choices = optionsOf(field).choices ?? [];
      if (typeof value !== "string" || !choices.includes(value)) {
        throw new Error(`ฟิลด์ "${field.name}" ต้องเลือกจาก: ${choices.join(" / ")}`);
      }
      return { ...empty, valueOption: value };
    }
    default:
      return empty;
  }
}

/** ตั้งค่าฟิลด์ของการ์ด 1 ใบ — `value: null` = ลบแถวค่า (EDITOR ของบอร์ดขึ้นไป) */
export async function setCardFieldValue(ctx: KanbanCtx, actor: KanbanActor | undefined, cardId: string, fieldId: string, value: unknown): Promise<CardFieldValueDto> {
  const { boardId } = await assertCardRole(ctx, cardId, "EDITOR");
  const field = await requireField(ctx, fieldId);
  if (field.boardId !== boardId) throw new KanbanNotFoundError("ไม่พบฟิลด์นี้ในบอร์ดของการ์ดนี้");

  if (value === null || value === undefined) {
    await prisma.$transaction(async (tx) => {
      await tx.kanbanCustomFieldValue.deleteMany({ where: { cardId, fieldId } });
      await logActivity(tx, { tenantId: ctx.tenantId, boardId, cardId, actorUserId: actorUserIdOf(ctx, actor), type: "CARD_UPDATED", data: { fields: [field.name] } });
    });
    await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.updated", boardId, cardId }));
    return { fieldId: field.id, name: field.name, type: field.type, options: optionsOf(field), showOnCard: field.showOnCard, sortOrder: field.sortOrder, value: null, display: "—" };
  }

  const coerced = coerceValue(field, value);
  await prisma.$transaction(async (tx) => {
    await tx.kanbanCustomFieldValue.upsert({
      where: { cardId_fieldId: { cardId, fieldId } },
      create: { tenantId: ctx.tenantId, cardId, fieldId, ...coerced },
      update: coerced,
    });
    await logActivity(tx, { tenantId: ctx.tenantId, boardId, cardId, actorUserId: actorUserIdOf(ctx, actor), type: "CARD_UPDATED", data: { fields: [field.name] } });
  });
  await publishBoardSignal(ctx, boardId, boardSignal({ type: "card.updated", boardId, cardId }));
  const raw = readRawValue(field.type, coerced);
  const options = optionsOf(field);
  return { fieldId: field.id, name: field.name, type: field.type, options, showOnCard: field.showOnCard, sortOrder: field.sortOrder, value: raw, display: formatDisplay(field.type, raw, options) };
}

/** ค่าฟิลด์ทุกตัวของบอร์ด + ค่าของการ์ดใบนี้ (แถวที่ยังไม่กรอก = value null) — VIEWER ขึ้นไปอ่านได้ */
export async function getCardFieldValues(ctx: KanbanCtx, actor: KanbanActor | undefined, cardId: string): Promise<CardFieldValueDto[]> {
  void actor;
  const { boardId } = await assertCardRole(ctx, cardId, "VIEWER");
  const [fields, values] = await Promise.all([
    prisma.kanbanCustomField.findMany({ where: { boardId, tenantId: ctx.tenantId }, orderBy: { sortOrder: "asc" } }),
    prisma.kanbanCustomFieldValue.findMany({ where: { cardId, tenantId: ctx.tenantId } }),
  ]);
  const valueByField = new Map(values.map((v) => [v.fieldId, v]));
  return fields.map((field) => {
    const row = valueByField.get(field.id) ?? null;
    const raw = readRawValue(field.type, row);
    const options = optionsOf(field);
    return { fieldId: field.id, name: field.name, type: field.type, options, showOnCard: field.showOnCard, sortOrder: field.sortOrder, value: raw, display: formatDisplay(field.type, raw, options) };
  });
}

// ───────────────────────── ชิปบนการ์ด/แถวตาราง (ใช้จาก service.ts/table.ts) ─────────────────────────

/** ชื่อฟิลด์ที่ `showOnCard=true` ของบอร์ด เรียงตาม sortOrder — คอลัมน์เพิ่มของมุมมองตาราง (K2.1) */
export async function listShowOnCardFieldNames(tenantId: string, boardId: string): Promise<string[]> {
  const rows = await prisma.kanbanCustomField.findMany({ where: { boardId, tenantId, showOnCard: true }, orderBy: { sortOrder: "asc" }, select: { name: true } });
  return rows.map((r) => r.name);
}

/** ชิปฟิลด์ที่ต้องโชว์บนการ์ด/แถวตาราง ของการ์ดหลายใบพร้อมกัน (คิวรีเดียว กัน N+1) */
export async function fieldsOnCardForCards(tenantId: string, boardId: string, cardIds: string[]): Promise<Map<string, FieldOnCardDto[]>> {
  const byCard = new Map<string, FieldOnCardDto[]>();
  if (cardIds.length === 0) return byCard;
  const fields = await prisma.kanbanCustomField.findMany({ where: { boardId, tenantId, showOnCard: true }, orderBy: { sortOrder: "asc" } });
  if (fields.length === 0) return byCard;
  const values = await prisma.kanbanCustomFieldValue.findMany({ where: { tenantId, fieldId: { in: fields.map((f) => f.id) }, cardId: { in: cardIds } } });
  const valuesByCardField = new Map(values.map((v) => [`${v.cardId}#${v.fieldId}`, v]));
  for (const cardId of cardIds) {
    const list: FieldOnCardDto[] = [];
    for (const field of fields) {
      const row = valuesByCardField.get(`${cardId}#${field.id}`);
      if (!row) continue;
      const raw = readRawValue(field.type, row);
      if (raw === null) continue;
      list.push({ name: field.name, display: formatDisplay(field.type, raw, optionsOf(field)) });
    }
    if (list.length > 0) byCard.set(cardId, list);
  }
  return byCard;
}
