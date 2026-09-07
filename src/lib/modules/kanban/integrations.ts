// integrations.ts — "การเชื่อมต่อ" ของบอร์ดงาน: สวิตช์รายร้านที่บอกว่าโมดูลอื่นสร้างการ์ดได้ไหม (K3.2 · D6)
//                    พิมพ์เขียว `docs/modules/13-kanban-v2.md` §9.2 · สัญญา `ledger/KANBAN-RUN.md` §K3.2
//
// 🔴 ทำไมค่าปริยายต้อง "ปิดทุกตัว": ทางเข้าพวกนี้เขียนการ์ดให้เองโดยไม่มีใครกด (แชทเข้ามา ฟอร์มถูกส่ง
//    ใบลาถูกยื่น) ⇒ เปิดมาเลย = บอร์ดของร้านที่ไม่เคยขอ มีการ์ดงอกทุกวันโดยไม่มีใครเข้าใจว่ามาจากไหน
//    (มติ D6: "การ์ดอัตโนมัติ = กฎที่ผู้ดูแลเปิดเอง ไม่ใช่ AI ลงมือ")
//
// 🔴 เก็บใน `AppSystem.settings.integrations` ของระบบ KANBAN — ไม่มีตารางใหม่ (ไมเกรชัน = ความเสี่ยง
//    ที่ไม่จำเป็นสำหรับค่า 7 ตัว) · อ่าน **สดทุกครั้ง** ไม่ cache: สวิตช์ที่เพิ่งปิดต้องมีผลทันที
//    ไม่ใช่ "อีก 60 วินาที" — ตัวที่ปิดสวิตช์คือคนที่กำลังตกใจว่าการ์ดงอกเยอะเกินไป

import { z } from "zod";
import { boardRole, hasBoardRole, visibleBoardsWhere, KanbanForbiddenError } from "./access";
import { prisma } from "./db";
import { loadActor } from "./members";
import type { KanbanActor, KanbanCtx } from "./types";

// ───────────────────────── รูปของค่า (zod) ─────────────────────────
//
// ทุกฟิลด์เป็น optional ในชั้น parse แล้วค่อย "เติมให้เต็ม" ด้วย `normalize()` — จงใจไม่ใช้ `.default()`
// ของ zod เพราะค่าที่อ่านจาก DB คือ JSON ที่คนรุ่นก่อนเขียนไว้ (อาจไม่มีคีย์ อาจมีคีย์เกิน อาจชนิดผิด)
// สิ่งที่เราต้องการคือ "อ่านได้เสมอ ไม่มีวัน throw ตอนอ่าน" ไม่ใช่ "ปฏิเสธค่าที่เพี้ยน"

const idField = z.string().min(1).max(64).nullable().optional();
const flagField = z.boolean().optional();

const RawIntegrationsSchema = z
  .object({
    openTaskFromChat: z
      .object({
        enabled: flagField,
        boardId: idField,
        columnId: idField,
        /** K3.3 — "ห้องที่ไม่มีคนรับเกินกี่นาทีแล้วให้เปิดการ์ดตาม" (ยังไม่ทำงานใน K3.2) */
        unassignedMinutes: z.number().int().min(1).max(10_080).nullable().optional(),
      })
      .optional(),
    cardFromForm: z.object({ enabled: flagField, boardId: idField, columnId: idField }).optional(),
    cardFromApproval: z.object({ enabled: flagField, boardId: idField }).optional(),
    closeCardOnDocApproved: z.object({ enabled: flagField }).optional(),
    cardOnLeave: z.object({ enabled: flagField, boardId: idField }).optional(),
    cardOnVoidedSale: z
      .object({
        enabled: flagField,
        boardId: idField,
        /** ยอดบิลขั้นต่ำ (สตางค์) ที่ถือว่า "ต้องมีคนตรวจ" — ต่ำกว่านี้ไม่ต้องเปิดการ์ด */
        minSatang: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
      })
      .optional(),
    cardFromEmail: z.object({ enabled: flagField, boardId: idField }).optional(),
  })
  .partial();

export type IntegrationsPatch = z.infer<typeof RawIntegrationsSchema>;

export type ChatIntegration = { enabled: boolean; boardId: string | null; columnId: string | null; unassignedMinutes: number | null };
export type BoardColumnIntegration = { enabled: boolean; boardId: string | null; columnId: string | null };
export type BoardIntegration = { enabled: boolean; boardId: string | null };
export type FlagIntegration = { enabled: boolean };
export type VoidedSaleIntegration = { enabled: boolean; boardId: string | null; minSatang: number | null };

export type KanbanIntegrations = {
  openTaskFromChat: ChatIntegration;
  cardFromForm: BoardColumnIntegration;
  cardFromApproval: BoardIntegration;
  closeCardOnDocApproved: FlagIntegration;
  cardOnLeave: BoardIntegration;
  cardOnVoidedSale: VoidedSaleIntegration;
  cardFromEmail: BoardIntegration;
};

/** คีย์ทั้งหมดตามสัญญา — หน้าตั้งค่าวนจากที่นี่ ไม่พิมพ์รายชื่อซ้ำ */
export const INTEGRATION_KEYS = [
  "openTaskFromChat",
  "cardFromForm",
  "cardFromApproval",
  "closeCardOnDocApproved",
  "cardOnLeave",
  "cardOnVoidedSale",
  "cardFromEmail",
] as const;

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

/** ค่าปริยาย = ปิดทุกตัว ไม่มีบอร์ดปลายทาง (ประกาศเป็นฟังก์ชันเพื่อไม่ให้ผู้เรียกแก้ของกลางโดยบังเอิญ) */
export function defaultIntegrations(): KanbanIntegrations {
  return {
    openTaskFromChat: { enabled: false, boardId: null, columnId: null, unassignedMinutes: null },
    cardFromForm: { enabled: false, boardId: null, columnId: null },
    cardFromApproval: { enabled: false, boardId: null },
    closeCardOnDocApproved: { enabled: false },
    cardOnLeave: { enabled: false, boardId: null },
    cardOnVoidedSale: { enabled: false, boardId: null, minSatang: null },
    cardFromEmail: { enabled: false, boardId: null },
  };
}

function normalize(raw: IntegrationsPatch): KanbanIntegrations {
  const d = defaultIntegrations();
  return {
    openTaskFromChat: {
      enabled: raw.openTaskFromChat?.enabled ?? d.openTaskFromChat.enabled,
      boardId: raw.openTaskFromChat?.boardId ?? d.openTaskFromChat.boardId,
      columnId: raw.openTaskFromChat?.columnId ?? d.openTaskFromChat.columnId,
      unassignedMinutes: raw.openTaskFromChat?.unassignedMinutes ?? d.openTaskFromChat.unassignedMinutes,
    },
    cardFromForm: {
      enabled: raw.cardFromForm?.enabled ?? d.cardFromForm.enabled,
      boardId: raw.cardFromForm?.boardId ?? d.cardFromForm.boardId,
      columnId: raw.cardFromForm?.columnId ?? d.cardFromForm.columnId,
    },
    cardFromApproval: {
      enabled: raw.cardFromApproval?.enabled ?? d.cardFromApproval.enabled,
      boardId: raw.cardFromApproval?.boardId ?? d.cardFromApproval.boardId,
    },
    closeCardOnDocApproved: { enabled: raw.closeCardOnDocApproved?.enabled ?? d.closeCardOnDocApproved.enabled },
    cardOnLeave: {
      enabled: raw.cardOnLeave?.enabled ?? d.cardOnLeave.enabled,
      boardId: raw.cardOnLeave?.boardId ?? d.cardOnLeave.boardId,
    },
    cardOnVoidedSale: {
      enabled: raw.cardOnVoidedSale?.enabled ?? d.cardOnVoidedSale.enabled,
      boardId: raw.cardOnVoidedSale?.boardId ?? d.cardOnVoidedSale.boardId,
      minSatang: raw.cardOnVoidedSale?.minSatang ?? d.cardOnVoidedSale.minSatang,
    },
    cardFromEmail: {
      enabled: raw.cardFromEmail?.enabled ?? d.cardFromEmail.enabled,
      boardId: raw.cardFromEmail?.boardId ?? d.cardFromEmail.boardId,
    },
  };
}

/** ค่าที่เก็บอยู่ใน `AppSystem.settings` ทั้งก้อน (คีย์อื่นของระบบต้องไม่หายตอนเราเขียนทับ) */
function settingsObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

// ───────────────────────── อ่าน ─────────────────────────

/**
 * ค่าสวิตช์ของระบบ KANBAN ใบหนึ่ง — **อ่านสดทุกครั้ง ไม่มี cache**
 * ระบบไม่มี/ค่าเพี้ยน → คืนค่าปริยาย (ปิดทุกตัว) แทนที่จะ throw: ผู้เรียกทุกรายคือ "ด่านก่อนทำงาน"
 * ⇒ อ่านไม่ได้ต้องแปลว่า "ปิดอยู่" เสมอ (fail-closed) ไม่ใช่พาทั้ง consumer ล้ม
 */
export async function getIntegrations(tenantId: string, systemId: string): Promise<KanbanIntegrations> {
  const sys = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "KANBAN" },
    select: { settings: true },
  });
  if (!sys) return defaultIntegrations();
  const parsed = RawIntegrationsSchema.safeParse(settingsObject(sys.settings).integrations ?? {});
  return normalize(parsed.success ? parsed.data : {});
}

/**
 * ปุ่ม "สร้างงาน" ในหัวห้องแชทควรโผล่ไหม (หน้าแชทเรียกจาก server แล้วส่งลงเป็น prop)
 * `null` = ไม่โผล่ — และ `createTaskFromChat` ก็ปฏิเสธด้วยเหตุเดียวกัน (UI ไม่ใช่ด่าน)
 *
 * ร้านหนึ่งเปิดระบบบอร์ดงานได้หลายใบ (D1) ⇒ เลือกใบแรกที่ "เปิดสวิตช์ + ตั้งบอร์ดปลายทางไว้จริง"
 */
export async function chatTaskButtonConfig(
  tenantId: string,
): Promise<{ kanbanSystemId: string; boardId: string; columnId: string | null } | null> {
  const systems = await prisma.appSystem.findMany({
    where: { tenantId, type: "KANBAN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, settings: true },
  });
  for (const sys of systems) {
    const parsed = RawIntegrationsSchema.safeParse(settingsObject(sys.settings).integrations ?? {});
    const cfg = normalize(parsed.success ? parsed.data : {}).openTaskFromChat;
    if (!cfg.enabled || !cfg.boardId) continue;
    // บอร์ดปลายทางถูกเก็บเข้าคลังทีหลัง = ปุ่มที่กดแล้วพัง ⇒ ถือว่ายังไม่พร้อม (ไม่ต้องโผล่)
    const board = await prisma.kanbanBoard.findFirst({
      where: { id: cfg.boardId, tenantId, systemId: sys.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!board) continue;
    return { kanbanSystemId: sys.id, boardId: board.id, columnId: cfg.columnId };
  }
  return null;
}

// ───────────────────────── เขียน ─────────────────────────

/** OWNER ผ่านโดยนัย · คนอื่นต้องมีคีย์ `kanban.automation.manage` ชัด ๆ (แบบเดียวกับ `canViewReports`) */
function assertCanManageIntegrations(actor: KanbanActor): void {
  if (actor.role === "OWNER") return;
  if (actor.permissions["kanban.automation.manage"] === true) return;
  throw new KanbanForbiddenError("ต้องเป็นเจ้าของร้าน หรือมีสิทธิ์ตั้งค่ากฎอัตโนมัติ จึงจะแก้การเชื่อมต่อได้");
}

/**
 * ตรวจ "บอร์ด/คอลัมน์ปลายทาง" ที่ผู้ใช้เลือก — ต้องเป็นบอร์ด ACTIVE ในระบบนี้ ที่ actor เป็น **ADMIN**
 * 🔴 ทำไมต้อง ADMIN ไม่ใช่ EDITOR: สวิตช์นี้เท่ากับ "ยกบอร์ดใบนี้ให้ระบบเขียนการ์ดลงได้ตลอดไป"
 *    คนที่แค่แก้การ์ดได้ ไม่ควรชี้บอร์ดของทีมอื่นให้รับงานอัตโนมัติแทนเจ้าของบอร์ด
 */
async function assertTarget(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  columnId: string | null | undefined,
): Promise<void> {
  const board = await prisma.kanbanBoard.findFirst({
    where: { id: boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    select: { id: true, unitId: true, visibility: true },
  });
  if (!board) throw new Error("ไม่พบบอร์ดปลายทาง หรือบอร์ดถูกเก็บเข้าคลังแล้ว — เลือกบอร์ดใหม่อีกครั้ง");
  const members = await prisma.kanbanBoardMember.findMany({
    where: { boardId: board.id, tenantId: ctx.tenantId },
    select: { userId: true, role: true },
  });
  const role = boardRole(actor, board, members);
  if (!hasBoardRole(role, "ADMIN")) {
    throw new KanbanForbiddenError("ต้องเป็นผู้ดูแลบอร์ดที่เลือกไว้ จึงจะตั้งเป็นบอร์ดปลายทางได้");
  }
  if (columnId) {
    const col = await prisma.kanbanColumn.findFirst({
      where: { id: columnId, boardId: board.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!col) throw new Error("คอลัมน์ที่เลือกไม่ได้อยู่ในบอร์ดปลายทางนี้ — เลือกคอลัมน์ใหม่อีกครั้ง");
  }
}

/**
 * บันทึกสวิตช์ — **merge เฉพาะคีย์ที่ส่งมา** (ส่ง `{ openTaskFromChat: { enabled: false } }` แล้ว
 * บอร์ดปลายทางที่เคยตั้งไว้ต้องยังอยู่ — คนปิดสวิตช์ชั่วคราวไม่ควรเสียการตั้งค่าเดิมทิ้ง)
 */
export async function setIntegrations(
  ctx: KanbanCtx,
  actor: KanbanActor,
  patch: IntegrationsPatch,
): Promise<KanbanIntegrations> {
  assertCanManageIntegrations(actor);
  const parsed = RawIntegrationsSchema.safeParse(patch ?? {});
  if (!parsed.success) throw new Error("ค่าการเชื่อมต่อไม่ถูกต้อง — ลองเลือกใหม่อีกครั้ง");
  const p = parsed.data;

  // ตรวจปลายทางก่อนเขียนทุกตัวที่ส่งบอร์ดมา (ตรวจครบก่อน แล้วค่อยเขียนครั้งเดียว — ไม่เขียนครึ่งทาง)
  if (p.openTaskFromChat?.boardId) await assertTarget(ctx, actor, p.openTaskFromChat.boardId, p.openTaskFromChat.columnId);
  if (p.cardFromForm?.boardId) await assertTarget(ctx, actor, p.cardFromForm.boardId, p.cardFromForm.columnId);
  if (p.cardFromApproval?.boardId) await assertTarget(ctx, actor, p.cardFromApproval.boardId, null);
  if (p.cardOnLeave?.boardId) await assertTarget(ctx, actor, p.cardOnLeave.boardId, null);
  if (p.cardOnVoidedSale?.boardId) await assertTarget(ctx, actor, p.cardOnVoidedSale.boardId, null);
  if (p.cardFromEmail?.boardId) await assertTarget(ctx, actor, p.cardFromEmail.boardId, null);

  const sys = await prisma.appSystem.findFirst({
    where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "KANBAN" },
    select: { id: true, settings: true },
  });
  if (!sys) throw new Error("ไม่พบระบบบอร์ดงานของร้านนี้");

  const settings = settingsObject(sys.settings);
  const currentRaw = RawIntegrationsSchema.safeParse(settings.integrations ?? {});
  const current = normalize(currentRaw.success ? currentRaw.data : {});

  const merged: KanbanIntegrations = {
    openTaskFromChat: { ...current.openTaskFromChat, ...stripUndefined(p.openTaskFromChat) },
    cardFromForm: { ...current.cardFromForm, ...stripUndefined(p.cardFromForm) },
    cardFromApproval: { ...current.cardFromApproval, ...stripUndefined(p.cardFromApproval) },
    closeCardOnDocApproved: { ...current.closeCardOnDocApproved, ...stripUndefined(p.closeCardOnDocApproved) },
    cardOnLeave: { ...current.cardOnLeave, ...stripUndefined(p.cardOnLeave) },
    cardOnVoidedSale: { ...current.cardOnVoidedSale, ...stripUndefined(p.cardOnVoidedSale) },
    cardFromEmail: { ...current.cardFromEmail, ...stripUndefined(p.cardFromEmail) },
  };

  settings.integrations = merged;
  await prisma.appSystem.update({ where: { id: sys.id }, data: { settings: settings as never } });
  return merged;
}

/** คีย์ที่ผู้เรียก "ไม่ได้ส่ง" ต้องไม่ไปทับของเดิมด้วย `undefined` ตอน spread */
function stripUndefined<T extends object>(patch: T | undefined): Partial<T> {
  if (!patch) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

// ───────────────────────── ตัวเลือกให้หน้าจอ ─────────────────────────

export type IntegrationBoardOption = {
  id: string;
  name: string;
  role: "EDITOR" | "ADMIN";
  columns: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
};

/**
 * บอร์ดที่ actor "ลงงานได้จริง" (EDITOR ขึ้นไป) พร้อมคอลัมน์/ป้ายของแต่ละใบ
 * ใช้ทั้งแผงสร้างงานจากแชท (เลือกบอร์ดปลายทาง) และหน้าตั้งค่าการเชื่อมต่อ (`need: "ADMIN"`)
 */
export async function listTaskTargetBoards(
  ctx: KanbanCtx,
  actor: KanbanActor,
  need: "EDITOR" | "ADMIN" = "EDITOR",
): Promise<IntegrationBoardOption[]> {
  const boards = await prisma.kanbanBoard.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "ACTIVE",
      ...visibleBoardsWhere(actor),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      unitId: true,
      visibility: true,
      members: { select: { userId: true, role: true } },
      columns: {
        where: { status: "ACTIVE" },
        orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
        select: { id: true, name: true },
      },
      labels: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } },
    },
  });
  const out: IntegrationBoardOption[] = [];
  for (const b of boards) {
    const role = boardRole(actor, b, b.members);
    if (!hasBoardRole(role, need)) continue;
    out.push({
      id: b.id,
      name: b.name,
      role: role === "ADMIN" ? "ADMIN" : "EDITOR",
      columns: b.columns.map((c) => ({ id: c.id, name: c.name })),
      labels: b.labels.map((l) => ({ id: l.id, name: l.name, color: String(l.color) })),
    });
  }
  return out;
}

/** actor ของ ctx (ไม่มี membership = ไม่มีตัวตนในโมดูลนี้) — ผู้เรียกฝั่งหน้าเว็บใช้ประกอบ actor ครั้งเดียว */
export async function integrationsActor(ctx: KanbanCtx): Promise<KanbanActor | null> {
  return loadActor(ctx);
}
