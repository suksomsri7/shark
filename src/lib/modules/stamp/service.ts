// service.ts — สแตมป์การ์ด (Stamp Card) · M2.3
// สัญญา: ledger/MEMBER-RUN.md §2 M2.3 · พิมพ์เขียว docs/modules/06-member-v2.md §4.2 §4.3 §5.6 §7.1 §9.1 §9.2 §11.9
//
// ── หลักคิดของโมดูลนี้ ────────────────────────────────────────────────────────────────
// 1) **ตราคือของมีมูลค่า** ⇒ ทุกการเปลี่ยนแปลงเป็นแถวใน `StampEvent` (ADD/USE/EXPIRE/VOID/MERGE)
//    ยอด `StampCardProgress.stamps` เป็นแค่ตัวสรุปให้หน้าจออ่านเร็ว — ความจริงอยู่ที่สมุดเหตุการณ์
//    ⇒ บิลถูกยกเลิก = ยกเลิกตราของบิลนั้นได้ตรง ๆ โดยไม่ต้องเดาว่าตราไหนมาจากบิลไหน
// 2) **ทุกทางเข้ามี idempotencyKey** (unique ต่อร้าน) — สแกน QR ซ้ำ · คิว outbox ยิงซ้ำ · กดปุ่มรัว
//    ต้องได้ผลเดิม ไม่ใช่ตราเพิ่ม (คืนผลเดิมเงียบ ๆ ไม่ throw — ผู้เรียกไม่มีทางรู้ว่าครั้งไหนคือครั้งแรก)
// 3) **เพดานต่อวันตัดทั้งก้อน ไม่ประทับบางส่วน** — ขอ 3 ตราแต่เหลือโควตา 2 = ไม่ได้เลย + บอกเหตุผล
//    (ประทับบางส่วนเงียบ ๆ = ลูกค้ายืนนับวงกลมแล้วงงว่าหายไปไหน) · ยกเว้นทางอัตโนมัติจากบิล
//    ที่ "ตัดที่เพดาน" ตามสัญญา §5.6 เพราะไม่มีใครยืนอยู่ตรงนั้นให้แก้ตัวเลข
// 4) **วัน = วันไทย (UTC+7)** เสมอ — บนเซิร์ฟเวอร์ UTC การนับวันด้วย Date ดิบเพี้ยนไป 1 วัน
//
// 🔴 โมดูลนี้ **อ่านตาราง PosSale / Appointment ตรง** (ผ่าน ./db) โดยตั้งใจ: มันต้องรู้แค่
//    "บิลใบนี้ยอดเท่าไหร่ · มีบรรทัดอะไร" กับ "นัดใบนี้จบแล้วหรือยัง" ซึ่งเป็นข้อมูลอ่านอย่างเดียว
//    การลาก facade ของโมดูลขายของ/โมดูลจองเข้ามาจะสร้างวงจร (ทั้งคู่เรียกสมาชิกอยู่แล้ว)
//    ⇒ fitness F2 อนุญาตเฉพาะเส้น stamp→member · stamp→point · stamp→voucher เท่านั้น

import type { Prisma, StampCard as StampCardRow, StampCardProgress as StampProgressRow, StampRewardKind, StampRuleKind } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { earnWithLot } from "@/lib/modules/point";
import { coversUnit, hasMemberPerm, type MemberActor } from "@/lib/modules/member/access";
import { MEMBER_LIMITS, memberLimitError } from "@/lib/modules/member/limits";
import { prisma } from "./db";
import { StampForbiddenError, StampInputError, StampNotFoundError, StampStateError } from "./errors";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** ใช้ tx ที่ส่งมาตรง ๆ ถ้ามี (ให้ผู้เรียกคุมอะตอมมิกร่วมกับงานของตัวเอง) ไม่งั้นเปิด tx ใหม่ของตัวเอง */
async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if ("$transaction" in db && typeof db.$transaction === "function") {
    return (db as typeof prisma).$transaction((tx) => fn(tx), { timeout: 30_000, maxWait: 15_000 });
  }
  return fn(db as Tx);
}

/** ขอบเขตการทำงาน — `systemId` = **ระบบสมาชิก** (ไม่ใช่ระบบแต้ม/ระบบขายของ) */
export type StampCtx = {
  tenantId: string;
  systemId: string;
  actorUserId?: string | null;
};

// ───────────────────────── ค่าคงที่ของกติกา (§11.9) ─────────────────────────

/** ช่องน้อยสุด/มากสุดต่อใบ — น้อยกว่านี้ไม่ใช่การ์ดสะสม มากกว่านี้ลูกค้าเลิกกลางทาง */
export const STAMP_MIN_SLOTS = 3;
export const STAMP_MAX_SLOTS = 30;

export const RULE_KINDS: readonly StampRuleKind[] = ["PER_SALE_MIN", "PER_ITEM", "PER_VISIT", "PER_DAY", "MANUAL"];
export const REWARD_KINDS: readonly StampRewardKind[] = ["VOUCHER", "REWARD", "POINTS", "DISCOUNT_NEXT"];

/** ทางที่ตรานี้เกิดขึ้น — เก็บไว้เพื่อ "ย้อนรอย" ไม่ใช่เพื่อคิดกติกา */
export type StampRefType = "MANUAL" | "QR" | "SALE" | "VISIT" | "MERGE";

export type StampRuleConfig = {
  minSatang: number | null;
  itemIds: string[];
  serviceIds: string[];
  perDayMax: number;
  allowStaffScan: boolean;
  allowAutoFromSale: boolean;
  staffPin: string | null;
};

export type StampRewardConfig = Record<string, unknown>;

export type StampCardStats = { active: number; completed: number; rewardsPaid: number };

export type StampCardDto = {
  id: string;
  name: string;
  description: string | null;
  slots: number;
  ruleKind: StampRuleKind;
  ruleConfig: StampRuleConfig;
  rewardKind: StampRewardKind;
  rewardConfig: StampRewardConfig;
  autoRestart: boolean;
  validMonths: number | null;
  tierDefIds: string[];
  unitIds: string[];
  active: boolean;
  sortOrder: number;
  stats: StampCardStats;
};

export type CreateCardInput = {
  name: string;
  description?: string | null;
  slots: number;
  ruleKind: string;
  ruleConfig?: Partial<StampRuleConfig> | null;
  rewardKind: string;
  rewardConfig?: StampRewardConfig | null;
  autoRestart?: boolean;
  validMonths?: number | null;
  tierDefIds?: string[];
  unitIds?: string[];
  sortOrder?: number;
};

export type UpdateCardInput = Partial<CreateCardInput>;

export type AddStampInput = {
  cardId: string;
  customerId: string;
  count?: number;
  refType?: StampRefType;
  refId?: string | null;
  unitId?: string | null;
  byPin?: string | null;
  idempotencyKey: string;
};

export type AddStampResult = {
  progressId: string;
  stamps: number;
  cycle: number;
  completed: boolean;
  rewardKind?: StampRewardKind;
  rewardVoucherId: string | null;
  eventId: string;
};

export type ProgressDto = {
  cardId: string;
  name: string;
  slots: number;
  stamps: number;
  cycle: number;
  expiresAt: Date | null;
  completedCycles: number;
  rewardKind: StampRewardKind;
};

export type AutoStampResult = { events: { cardId: string; eventId: string; stamps: number }[] };

// ───────────────────────── เวลาไทย ─────────────────────────

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** เวลา 00:00 ของ "วันไทย" ที่ `d` อยู่ (คืนเป็น UTC) — ห้ามใช้ getDate()/getDay() บน Date ดิบ */
function bkkDayStart(d: Date): Date {
  return new Date(Math.floor((d.getTime() + BKK_OFFSET_MS) / DAY_MS) * DAY_MS - BKK_OFFSET_MS);
}

/** บวกเดือนแบบไม่ข้ามเดือน (31 ม.ค. + 1 เดือน = 28/29 ก.พ.) */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

// ───────────────────────── ตัวช่วยอ่านค่า config ─────────────────────────

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

function asPositiveInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** ค่าปริยายของกติกา: 1 ตรา/วัน · พนักงานสแกนได้ · รับตราอัตโนมัติจากบิล · ไม่มี PIN */
export function ruleConfigOf(card: { ruleConfig: unknown }): StampRuleConfig {
  const raw = asRecord(card.ruleConfig);
  const minSatang = Number(raw.minSatang);
  const pin = typeof raw.staffPin === "string" && raw.staffPin.trim() ? raw.staffPin.trim() : null;
  return {
    minSatang: Number.isInteger(minSatang) && minSatang > 0 ? minSatang : null,
    itemIds: asStringArray(raw.itemIds),
    serviceIds: asStringArray(raw.serviceIds),
    perDayMax: asPositiveInt(raw.perDayMax, 1),
    allowStaffScan: raw.allowStaffScan !== false,
    allowAutoFromSale: raw.allowAutoFromSale !== false,
    staffPin: pin,
  };
}

function rewardConfigOf(card: { rewardConfig: unknown }): StampRewardConfig {
  return asRecord(card.rewardConfig);
}

/** เพดานต่อวันที่ใช้จริง — PER_DAY บังคับ 1 ตรา/วันไทยเสมอ ไม่ว่าร้านจะตั้ง perDayMax เท่าไหร่ */
function dailyCapOf(card: { ruleKind: StampRuleKind }, cfg: StampRuleConfig): number {
  return card.ruleKind === "PER_DAY" ? 1 : cfg.perDayMax;
}

// ───────────────────────── สิทธิ์ (§6.1) ─────────────────────────

/** จัดการใบ (สร้าง/แก้/เปิดปิด/ยกเลิกตรา) = `member.loyalty.manage` */
function assertManage(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.loyalty.manage")) {
    throw new StampForbiddenError("งานนี้ต้องมีสิทธิ์จัดการสแตมป์การ์ด — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

// ───────────────────────── ตัวอ่านของหลัก ─────────────────────────

async function loadCard(db: Db, ctx: StampCtx, cardId: string): Promise<StampCardRow> {
  const card = await db.stampCard.findFirst({ where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!card) throw new StampNotFoundError("ไม่พบสแตมป์การ์ดใบนี้ในระบบสมาชิกนี้ — รีเฟรชหน้าแล้วเลือกใหม่อีกครั้ง");
  return card;
}

type CustomerLite = { id: string; homeUnitId: string | null; tierDefId: string | null };

async function loadCustomer(db: Db, ctx: StampCtx, customerId: string): Promise<CustomerLite> {
  const c = await db.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
    select: { id: true, homeUnitId: true, tierDefId: true },
  });
  if (!c) throw new StampNotFoundError("ไม่พบสมาชิกคนนี้ในระบบสมาชิกนี้ — ค้นด้วยเบอร์โทรหรือรหัสสมาชิกอีกครั้ง");
  return c;
}

/** ระบบแต้มที่ผูกสาขาเดียวกับระบบสมาชิกนี้ (กติกาเดียวกับ `point.getCustomerPoints`) */
async function resolvePointSystemId(db: Db, ctx: StampCtx): Promise<string | null> {
  const memberUnits = await db.appSystemUnit.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { unitId: true },
  });
  if (memberUnits.length === 0) return null;
  const link = await db.appSystemUnit.findFirst({
    where: { tenantId: ctx.tenantId, type: "POINT", unitId: { in: memberUnits.map((u) => u.unitId) } },
    select: { systemId: true },
  });
  return link?.systemId ?? null;
}

// ───────────────────────── การ์ด: CRUD ─────────────────────────

function normalizeName(v: unknown): string {
  const name = typeof v === "string" ? v.trim() : "";
  if (!name) throw new StampInputError("ตั้งชื่อสแตมป์การ์ดก่อนบันทึก — ลูกค้าจะเห็นชื่อนี้บนบัตร");
  if (name.length > 120) throw new StampInputError("ชื่อสแตมป์การ์ดยาวเกินไป — ย่อให้เหลือไม่เกิน 120 ตัวอักษร");
  return name;
}

function normalizeSlots(v: unknown): number {
  const slots = Number(v);
  if (!Number.isInteger(slots) || slots < STAMP_MIN_SLOTS || slots > STAMP_MAX_SLOTS) {
    throw new StampInputError(`จำนวนช่องต้องอยู่ระหว่าง ${STAMP_MIN_SLOTS}–${STAMP_MAX_SLOTS} ช่อง — ปรับตัวเลขแล้วบันทึกอีกครั้ง`);
  }
  return slots;
}

function normalizeRuleKind(v: unknown): StampRuleKind {
  const kind = RULE_KINDS.find((k) => k === v);
  if (!kind) throw new StampInputError("เลือกเงื่อนไข \"ได้ตราเมื่อ\" จากรายการที่มีให้ก่อนบันทึก");
  return kind;
}

function normalizeRewardKind(v: unknown): StampRewardKind {
  const kind = REWARD_KINDS.find((k) => k === v);
  if (!kind) throw new StampInputError("เลือก \"รางวัลเมื่อครบ\" จากรายการที่มีให้ก่อนบันทึก");
  return kind;
}

function normalizeValidMonths(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 60) {
    throw new StampInputError("อายุใบต้องเป็นจำนวนเดือน 1–60 — ปล่อยว่างไว้ถ้าไม่ต้องการให้ใบหมดอายุ");
  }
  return n;
}

function normalizeRuleConfig(input: Partial<StampRuleConfig> | null | undefined): Prisma.InputJsonValue {
  const cfg = ruleConfigOf({ ruleConfig: input ?? {} });
  const out: Record<string, unknown> = {
    itemIds: cfg.itemIds,
    serviceIds: cfg.serviceIds,
    perDayMax: cfg.perDayMax,
    allowStaffScan: cfg.allowStaffScan,
    allowAutoFromSale: cfg.allowAutoFromSale,
  };
  if (cfg.minSatang !== null) out.minSatang = cfg.minSatang;
  if (cfg.staffPin !== null) out.staffPin = cfg.staffPin;
  return out as Prisma.InputJsonValue;
}

async function statsOf(db: Db, cardIds: string[]): Promise<Map<string, StampCardStats>> {
  const out = new Map<string, StampCardStats>();
  for (const id of cardIds) out.set(id, { active: 0, completed: 0, rewardsPaid: 0 });
  if (cardIds.length === 0) return out;
  const rows = await db.stampCardProgress.groupBy({
    by: ["cardId", "completedAt"],
    where: { cardId: { in: cardIds } },
    _count: { _all: true },
  });
  for (const r of rows) {
    const s = out.get(r.cardId);
    if (!s) continue;
    if (r.completedAt) {
      s.completed += r._count._all;
      // ครบ 1 ใบ = จ่ายรางวัล 1 ครั้ง (รางวัลออกใน transaction เดียวกับที่ปิดใบ)
      s.rewardsPaid += r._count._all;
    } else {
      s.active += r._count._all;
    }
  }
  return out;
}

function toDto(card: StampCardRow, stats: StampCardStats): StampCardDto {
  return {
    id: card.id,
    name: card.name,
    description: card.description,
    slots: card.slots,
    ruleKind: card.ruleKind,
    ruleConfig: ruleConfigOf(card),
    rewardKind: card.rewardKind,
    rewardConfig: rewardConfigOf(card),
    autoRestart: card.autoRestart,
    validMonths: card.validMonths,
    tierDefIds: card.tierDefIds,
    unitIds: card.unitIds,
    active: card.active,
    sortOrder: card.sortOrder,
    stats,
  };
}

/** สแตมป์การ์ดทั้งหมดของระบบสมาชิกนี้ (+ สถิติต่อใบ) — หน้าจอ/REST อ่านตัวนี้ตัวเดียว */
export async function listCards(ctx: StampCtx): Promise<StampCardDto[]> {
  const cards = await prisma.stampCard.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const stats = await statsOf(prisma, cards.map((c) => c.id));
  return cards.map((c) => toDto(c, stats.get(c.id) ?? { active: 0, completed: 0, rewardsPaid: 0 }));
}

export async function getCard(ctx: StampCtx, cardId: string): Promise<StampCardDto> {
  const card = await loadCard(prisma, ctx, cardId);
  const stats = await statsOf(prisma, [card.id]);
  return toDto(card, stats.get(card.id) ?? { active: 0, completed: 0, rewardsPaid: 0 });
}

export async function cardStats(ctx: StampCtx, cardId: string): Promise<StampCardStats> {
  const card = await loadCard(prisma, ctx, cardId);
  const stats = await statsOf(prisma, [card.id]);
  return stats.get(card.id) ?? { active: 0, completed: 0, rewardsPaid: 0 };
}

/**
 * จำนวนตราของ "ใบจริงที่คืบหน้ามากที่สุด" ของการ์ดใบนี้ — ตัวออกแบบเอาไปวาดตัวอย่างการ์ดจริง
 * (ภาพ 17 โชว์ 7/10 = ใบของลูกค้าที่สะสมไว้มากที่สุด ไม่ใช่ตัวเลขสมมติ)
 */
export async function sampleStamps(ctx: StampCtx, cardId: string): Promise<number> {
  const card = await loadCard(prisma, ctx, cardId);
  const top = await prisma.stampCardProgress.findFirst({
    where: { cardId: card.id, completedAt: null },
    orderBy: { stamps: "desc" },
    select: { stamps: true },
  });
  return top?.stamps ?? 0;
}

export async function createCard(ctx: StampCtx, actor: MemberActor, input: CreateCardInput): Promise<StampCardDto> {
  assertManage(actor);
  const name = normalizeName(input.name);
  const slots = normalizeSlots(input.slots);
  const ruleKind = normalizeRuleKind(input.ruleKind);
  const rewardKind = normalizeRewardKind(input.rewardKind);
  const validMonths = normalizeValidMonths(input.validMonths);

  // เพดานแพ็กเกจ (§11.9) — นับเฉพาะใบในระบบสมาชิกนี้ · ปิดใช้งานแล้วยังนับ (ยังกดเปิดกลับได้)
  const used = await prisma.stampCard.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (used >= MEMBER_LIMITS.stampCards) {
    throw memberLimitError(
      `สร้างสแตมป์การ์ดได้สูงสุด ${MEMBER_LIMITS.stampCards} ใบต่อระบบสมาชิก (ตอนนี้มี ${used} ใบ) — ลบใบที่เลิกใช้แล้วก่อน`,
    );
  }

  const card = await prisma.stampCard.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name,
      description: typeof input.description === "string" && input.description.trim() ? input.description.trim() : null,
      slots,
      ruleKind,
      ruleConfig: normalizeRuleConfig(input.ruleConfig),
      rewardKind,
      rewardConfig: (input.rewardConfig ?? {}) as Prisma.InputJsonValue,
      autoRestart: input.autoRestart !== false,
      validMonths,
      tierDefIds: asStringArray(input.tierDefIds),
      unitIds: asStringArray(input.unitIds),
      sortOrder: Number.isInteger(input.sortOrder) ? Number(input.sortOrder) : used,
    },
  });
  return toDto(card, { active: 0, completed: 0, rewardsPaid: 0 });
}

export async function updateCard(
  ctx: StampCtx,
  actor: MemberActor,
  cardId: string,
  patch: UpdateCardInput,
): Promise<StampCardDto> {
  assertManage(actor);
  const card = await loadCard(prisma, ctx, cardId);
  const data: Prisma.StampCardUpdateInput = {};
  if (patch.name !== undefined) data.name = normalizeName(patch.name);
  if (patch.description !== undefined) {
    data.description = typeof patch.description === "string" && patch.description.trim() ? patch.description.trim() : null;
  }
  if (patch.slots !== undefined) data.slots = normalizeSlots(patch.slots);
  if (patch.ruleKind !== undefined) data.ruleKind = normalizeRuleKind(patch.ruleKind);
  if (patch.ruleConfig !== undefined) data.ruleConfig = normalizeRuleConfig(patch.ruleConfig);
  if (patch.rewardKind !== undefined) data.rewardKind = normalizeRewardKind(patch.rewardKind);
  if (patch.rewardConfig !== undefined) data.rewardConfig = (patch.rewardConfig ?? {}) as Prisma.InputJsonValue;
  if (patch.autoRestart !== undefined) data.autoRestart = patch.autoRestart !== false;
  if (patch.validMonths !== undefined) data.validMonths = normalizeValidMonths(patch.validMonths);
  if (patch.tierDefIds !== undefined) data.tierDefIds = asStringArray(patch.tierDefIds);
  if (patch.unitIds !== undefined) data.unitIds = asStringArray(patch.unitIds);
  if (patch.sortOrder !== undefined && Number.isInteger(patch.sortOrder)) data.sortOrder = Number(patch.sortOrder);

  const next = await prisma.stampCard.update({ where: { id: card.id }, data });
  const stats = await statsOf(prisma, [card.id]);
  return toDto(next, stats.get(card.id) ?? { active: 0, completed: 0, rewardsPaid: 0 });
}

/** เปิด/ปิดใบ — ปิดแล้วประทับเพิ่มไม่ได้ แต่ใบที่ลูกค้าถืออยู่ยังอยู่ครบ (ไม่ลบตราของใคร) */
export async function toggleCard(ctx: StampCtx, actor: MemberActor, cardId: string, active: boolean): Promise<StampCardDto> {
  assertManage(actor);
  const card = await loadCard(prisma, ctx, cardId);
  const next = await prisma.stampCard.update({ where: { id: card.id }, data: { active: !!active } });
  const stats = await statsOf(prisma, [card.id]);
  return toDto(next, stats.get(card.id) ?? { active: 0, completed: 0, rewardsPaid: 0 });
}

// ───────────────────────── ประทับตรา ─────────────────────────

/**
 * ใครประทับได้ (§5.6)
 *   • พนักงาน: ต้องมี `member.loyalty.stamp` + ใบเปิดให้พนักงานสแกน + สาขาที่ตัวเองดูแลครอบสมาชิกคนนั้น
 *     (สาขาไม่ครอบ = **ไม่พบ** ไม่ใช่ "ไม่มีสิทธิ์" — §6.4 404-not-403 ไม่บอกใบ้ว่ามีสมาชิกคนนี้อยู่)
 *   • ลูกค้าเอง (LIFF): ต้องเป็นบัตรของตัวเอง + ใบตั้ง PIN ไว้ + ใส่ PIN ตรง
 */
function assertCanStamp(actor: MemberActor, card: StampCardRow, cfg: StampRuleConfig, customer: CustomerLite, byPin: string | null): void {
  if (actor.role === "CUSTOMER") {
    if (!actor.customerId || actor.customerId !== customer.id) {
      throw new StampForbiddenError("ประทับตราได้เฉพาะบัตรของตัวเอง — ถ้าต้องการประทับให้คนอื่น ให้พนักงานเป็นผู้ทำรายการ");
    }
    if (!cfg.staffPin) {
      throw new StampStateError("ใบนี้ยังไม่ได้ตั้ง PIN สำหรับให้ลูกค้ากดเอง — ยื่นบัตรให้พนักงานประทับให้แทน");
    }
    if (!byPin || byPin !== cfg.staffPin) {
      throw new StampStateError("PIN ไม่ตรงกับที่ร้านตั้งไว้ — ขอ PIN จากพนักงานแล้วลองใหม่อีกครั้ง");
    }
    return;
  }
  if (!hasMemberPerm(actor, "member.loyalty.stamp")) {
    throw new StampForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ประทับสแตมป์ — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
  if (!cfg.allowStaffScan) {
    throw new StampStateError("ใบนี้ตั้งไว้ให้ลูกค้ากดรับตราเองด้วย PIN เท่านั้น — เปิดสวิตช์ \"พนักงานสแกน QR ลูกค้า\" ก่อนถ้าต้องการประทับให้");
  }
  if (!coversUnit(actor, customer.homeUnitId)) {
    throw new StampNotFoundError("ไม่พบสมาชิกคนนี้ในสาขาที่คุณดูแล — ให้พนักงานสาขาที่ลูกค้าสังกัดเป็นผู้ประทับ");
  }
}

/** ใบนี้ใช้กับสมาชิกคนนี้ที่สาขานี้ได้ไหม (ระดับ + สาขาที่ใบจำกัดไว้) */
function assertEligible(card: StampCardRow, customer: CustomerLite, unitId: string | null): void {
  if (card.tierDefIds.length > 0 && (!customer.tierDefId || !card.tierDefIds.includes(customer.tierDefId))) {
    throw new StampStateError("ใบนี้จำกัดเฉพาะสมาชิกบางระดับ — สมาชิกคนนี้ยังไม่ถึงระดับที่กำหนด");
  }
  if (card.unitIds.length > 0 && (!unitId || !card.unitIds.includes(unitId))) {
    throw new StampStateError("ใบนี้ใช้ได้เฉพาะสาขาที่ร้านกำหนดไว้ — ประทับที่สาขาที่ร่วมรายการแทน");
  }
}

/** จำนวนตราที่ประทับไปแล้ววันนี้ (วันไทย) ของใบใบนี้ — นับเฉพาะ ADD (VOID/EXPIRE ไม่คืนโควตา) */
async function addedToday(db: Db, progressId: string, now: Date): Promise<number> {
  const agg = await db.stampEvent.aggregate({
    where: { progressId, type: "ADD", createdAt: { gte: bkkDayStart(now) } },
    _sum: { count: true },
  });
  return agg._sum.count ?? 0;
}

/** ใบที่ยังประทับได้ของลูกค้าคนนี้ — ไม่มี = เปิดใบใหม่ (ถ้าใบนี้ตั้ง "เริ่มใบใหม่อัตโนมัติ") */
async function openProgress(tx: Tx, ctx: StampCtx, card: StampCardRow, customerId: string, now: Date): Promise<StampProgressRow> {
  const open = await tx.stampCardProgress.findFirst({
    where: { cardId: card.id, customerId, completedAt: null },
    orderBy: { cycle: "desc" },
  });
  if (open) return open;
  const last = await tx.stampCardProgress.findFirst({
    where: { cardId: card.id, customerId },
    orderBy: { cycle: "desc" },
  });
  if (last && !card.autoRestart) {
    throw new StampStateError("ใบนี้ประทับครบแล้วและร้านไม่ได้เปิดให้เริ่มใบใหม่อัตโนมัติ — รับรางวัลของใบเดิมก่อน");
  }
  return tx.stampCardProgress.create({
    data: {
      tenantId: ctx.tenantId,
      cardId: card.id,
      customerId,
      cycle: (last?.cycle ?? 0) + 1,
      stamps: 0,
      startedAt: now,
      expiresAt: card.validMonths ? addMonths(now, card.validMonths) : null,
    },
  });
}

/**
 * ครบใบ → ปิดใบ + จ่ายรางวัล + เริ่มใบใหม่ (ถ้าตั้งไว้)
 * รางวัล: POINTS  ทำงานจริงผ่าน facade แต้ม (ledger EARN + ล็อตหมดอายุของตัวเอง)
 *         VOUCHER ทำงานจริงผ่าน facade voucher ตั้งแต่ M2.5 (ออกใบใน tx เดียวกับตราที่เพิ่งประทับ
 *                 ⇒ ใบครบแล้วต้องมี voucher เสมอ ไม่มีสภาพ "ครบแต่ไม่ได้ของ")
 *         REWARD/DISCOUNT_NEXT ยังเป็น stub — บันทึกกติกาไว้ใน payload ของ event ให้ M2.4/M2.7 รับช่วง
 *         (ไม่ throw · ลูกค้าต้องไม่โดนบล็อกเพราะฟีเจอร์ยังไม่มา)
 * คืน `rewardVoucherId` ของรอบแรกที่ปิด (รอบถัด ๆ ไปจาก overflow ก็ออกใบของตัวเองครบเหมือนกัน)
 */
async function completeCycle(
  tx: Tx,
  ctx: StampCtx,
  card: StampCardRow,
  progress: StampProgressRow,
  stamps: number,
  now: Date,
  unitId: string | null,
): Promise<{ rewardVoucherId: string | null }> {
  let current = progress;
  let carry = stamps;
  let firstVoucherId: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    await tx.stampCardProgress.update({ where: { id: current.id }, data: { completedAt: now, stamps: carry } });
    await tx.stampEvent.create({
      data: {
        tenantId: ctx.tenantId,
        progressId: current.id,
        type: "USE",
        count: card.slots,
        refType: "REWARD",
        byUserId: ctx.actorUserId ?? null,
        unitId,
        idempotencyKey: `use:${current.id}`,
      },
    });

    if (card.rewardKind === "POINTS") {
      const points = Number(rewardConfigOf(card).points);
      const pointSystemId = Number.isInteger(points) && points > 0 ? await resolvePointSystemId(tx, ctx) : null;
      if (pointSystemId) {
        await earnWithLot(
          { tenantId: ctx.tenantId, systemId: pointSystemId, memberSystemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null },
          {
            customerId: current.customerId,
            points,
            refType: "STAMP",
            refId: current.id,
            idempotencyKey: `stamp:${current.id}`,
            unitId,
            reason: `สะสมครบ ${card.slots} ตรา — ${card.name}`,
          },
          tx,
        );
      }
    }

    // M2.5 — รางวัลเป็น voucher: ออกใบจริงผ่าน facade voucher (เส้น stamp→voucher · fitness F2)
    // 🔴 `await import` ไม่ใช่ import ที่หัวไฟล์โดยตั้งใจ: `voucher/service` อ่านชื่อ/สิทธิ์ผ่าน facade
    //    `member/index` และโมดูลสมาชิกก็เรียกสแตมป์ตอนรวมคน — ผูกแบบ static เสี่ยงวงกลมตอนโหลดโมดูล
    //    (วิธีเดียวกับที่ `member/profile.ts` ใช้กับบัตรกำนัล/สแตมป์)
    // 🔴 ออกใน `tx` เดียวกับตราที่เพิ่งประทับ ⇒ ใบครบ = มี voucher เสมอ (พังตัวใดตัวหนึ่ง = ไม่ครบเลย)
    if (card.rewardKind === "VOUCHER") {
      const templateId = rewardConfigOf(card).templateId;
      if (typeof templateId === "string" && templateId) {
        const voucher = await import("@/lib/modules/voucher");
        const res = await voucher.issue(
          { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null },
          voucher.VOUCHER_SYSTEM_ACTOR,
          {
            customerIds: [current.customerId],
            templateId,
            origin: "STAMP",
            originRef: { stampProgressId: current.id },
            reason: `สะสมครบ ${card.slots} ตรา — ${card.name}`,
          },
          tx,
        );
        const issuedId = res.pending === true ? null : (res.vouchers[0]?.id ?? null);
        if (issuedId) {
          await tx.stampCardProgress.update({ where: { id: current.id }, data: { rewardVoucherId: issuedId } });
          if (!firstVoucherId) firstVoucherId = issuedId;
        }
      }
    }

    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "stamp.completed",
      idempotencyKey: `stamp.completed#${current.id}`,
      systemId: ctx.systemId,
      unitId,
      payload: {
        customerId: current.customerId,
        cardId: card.id,
        progressId: current.id,
        stamps: card.slots,
        cycle: current.cycle,
        rewardKind: card.rewardKind,
        rewardConfig: rewardConfigOf(card),
      },
    });

    if (!card.autoRestart) return { rewardVoucherId: firstVoucherId };
    const overflow = Math.max(0, carry - card.slots);
    const next = await tx.stampCardProgress.create({
      data: {
        tenantId: ctx.tenantId,
        cardId: card.id,
        customerId: current.customerId,
        cycle: current.cycle + 1,
        stamps: overflow,
        startedAt: now,
        expiresAt: card.validMonths ? addMonths(now, card.validMonths) : null,
      },
    });
    if (overflow < card.slots) return { rewardVoucherId: firstVoucherId };
    current = next;
    carry = overflow;
  }
  return { rewardVoucherId: firstVoucherId };
}

type AddArgs = {
  card: StampCardRow;
  cfg: StampRuleConfig;
  customerId: string;
  count: number;
  refType: StampRefType;
  refId: string | null;
  unitId: string | null;
  byUserId: string | null;
  idempotencyKey: string;
  /** ทางอัตโนมัติ (บิล/นัด) ตัดจำนวนลงให้พอดีโควตาวันนี้แทนการปฏิเสธทั้งก้อน */
  clampToDailyCap?: boolean;
};

async function addStampInTx(tx: Tx, ctx: StampCtx, a: AddArgs, now: Date): Promise<AddStampResult | null> {
  const progress = await openProgress(tx, ctx, a.card, a.customerId, now);
  const cap = dailyCapOf(a.card, a.cfg);
  const today = await addedToday(tx, progress.id, now);
  let count = a.count;
  if (today + count > cap) {
    if (!a.clampToDailyCap) {
      throw new StampStateError(
        `ใบนี้ให้ได้สูงสุด ${cap} ตราต่อวัน (วันนี้ได้ไปแล้ว ${today} ตรา) — พรุ่งนี้ประทับต่อได้ตามปกติ`,
      );
    }
    count = cap - today;
    if (count <= 0) return null;
  }

  const ev = await tx.stampEvent.create({
    data: {
      tenantId: ctx.tenantId,
      progressId: progress.id,
      type: "ADD",
      count,
      refType: a.refType,
      refId: a.refId,
      byUserId: a.byUserId,
      unitId: a.unitId,
      idempotencyKey: a.idempotencyKey,
    },
  });
  const stamps = progress.stamps + count;
  await tx.stampCardProgress.update({ where: { id: progress.id }, data: { stamps } });
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    type: "stamp.added",
    idempotencyKey: `stamp.added#${ev.id}`,
    systemId: ctx.systemId,
    unitId: a.unitId,
    payload: {
      customerId: a.customerId,
      cardId: a.card.id,
      progressId: progress.id,
      stamps,
      cycle: progress.cycle,
      count,
      eventId: ev.id,
    },
  });

  if (stamps < a.card.slots) {
    return { progressId: progress.id, stamps, cycle: progress.cycle, completed: false, rewardVoucherId: null, eventId: ev.id };
  }
  const done = await completeCycle(tx, ctx, a.card, progress, stamps, now, a.unitId);
  return {
    progressId: progress.id,
    stamps,
    cycle: progress.cycle,
    completed: true,
    rewardKind: a.card.rewardKind,
    // M2.5 — ใบที่รางวัลเป็น voucher จะได้ id ของใบที่เพิ่งออกกลับไปด้วย (หน้าจอเอาไปโชว์ให้ลูกค้าทันที)
    rewardVoucherId: done.rewardVoucherId,
    eventId: ev.id,
  };
}

/** ยิงคีย์เดิมซ้ำ → คืนผลของครั้งแรก (ไม่สร้าง event ใหม่ · ไม่ throw) */
async function replayOf(idempotencyKey: string, tenantId: string): Promise<AddStampResult | null> {
  const existing = await prisma.stampEvent.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    include: { progress: true },
  });
  if (!existing) return null;
  const p = existing.progress;
  return {
    progressId: p.id,
    stamps: p.stamps,
    cycle: p.cycle,
    completed: !!p.completedAt,
    rewardVoucherId: p.rewardVoucherId,
    eventId: existing.id,
  };
}

/**
 * ประทับตรา (ทางเข้าเดียวของทั้งระบบ — พนักงานกด · ลูกค้าใส่ PIN · อัตโนมัติจากบิล/นัด)
 * ครบใบเมื่อไหร่จ่ายรางวัลทันทีใน transaction เดียวกัน (ไม่ให้เกิดสภาพ "ครบแล้วแต่ยังไม่ได้รางวัล")
 */
export async function addStamp(ctx: StampCtx, actor: MemberActor, input: AddStampInput): Promise<AddStampResult> {
  const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!key) throw new StampInputError("รายการนี้ไม่มีรหัสกันซ้ำ — รีเฟรชหน้าแล้วกดประทับใหม่อีกครั้ง");
  const count = input.count === undefined ? 1 : Number(input.count);
  if (!Number.isInteger(count) || count <= 0) {
    throw new StampInputError("จำนวนตราที่จะประทับต้องเป็นจำนวนเต็มมากกว่า 0 — ใส่ตัวเลขใหม่แล้วลองอีกครั้ง");
  }

  const replay = await replayOf(key, ctx.tenantId);
  if (replay) return replay;

  const card = await loadCard(prisma, ctx, input.cardId);
  if (!card.active) {
    throw new StampStateError("สแตมป์การ์ดใบนี้ถูกปิดใช้งานอยู่ — เปิดใช้งานที่หน้าตั้งค่าก่อนจึงจะประทับได้");
  }
  const cfg = ruleConfigOf(card);
  const customer = await loadCustomer(prisma, ctx, input.customerId);
  const unitId = input.unitId ?? null;
  assertCanStamp(actor, card, cfg, customer, input.byPin ?? null);
  assertEligible(card, customer, unitId);

  const now = new Date();
  const isCustomer = actor.role === "CUSTOMER";
  const res = await prisma.$transaction(
    (tx) =>
      addStampInTx(
        tx,
        ctx,
        {
          card,
          cfg,
          customerId: customer.id,
          count,
          refType: input.refType ?? (isCustomer ? "QR" : "MANUAL"),
          refId: input.refId ?? null,
          unitId,
          byUserId: isCustomer ? null : (actor.userId ?? ctx.actorUserId ?? null),
          idempotencyKey: key,
        },
        now,
      ),
    { timeout: 30_000, maxWait: 15_000 },
  );
  if (!res) throw new StampStateError("วันนี้ประทับครบโควตาของใบนี้แล้ว — พรุ่งนี้ประทับต่อได้ตามปกติ");
  return res;
}

// ───────────────────────── ยกเลิกตรา ─────────────────────────

/** ยกเลิกตรา 1 รายการ — ทำได้เฉพาะตราที่ยังไม่ถูกยกเลิก และใบยังไม่ถูกปิด (ปิดแล้ว = จ่ายรางวัลไปแล้ว) */
async function voidEventInTx(tx: Tx, ctx: StampCtx, eventId: string, byUserId: string | null): Promise<boolean> {
  const ev = await tx.stampEvent.findFirst({ where: { id: eventId, tenantId: ctx.tenantId }, include: { progress: true } });
  if (!ev) throw new StampNotFoundError("ไม่พบรายการตราที่จะยกเลิก — รีเฟรชประวัติแล้วลองใหม่อีกครั้ง");
  if (ev.type !== "ADD") throw new StampStateError("ยกเลิกได้เฉพาะรายการ \"ประทับตรา\" เท่านั้น");
  const already = await tx.stampEvent.findFirst({ where: { tenantId: ctx.tenantId, type: "VOID", refId: ev.id } });
  if (already) throw new StampStateError("ตรารายการนี้ถูกยกเลิกไปแล้ว — ไม่ต้องทำซ้ำ");
  if (ev.progress.completedAt) {
    throw new StampStateError("ใบนี้ถูกปิดและจ่ายรางวัลไปแล้ว — ยกเลิกตราย้อนหลังไม่ได้ ให้ปรับที่รางวัลแทน");
  }
  await tx.stampEvent.create({
    data: {
      tenantId: ctx.tenantId,
      progressId: ev.progressId,
      type: "VOID",
      count: ev.count,
      refType: "VOID",
      refId: ev.id,
      byUserId,
      unitId: ev.unitId,
      idempotencyKey: `void:${ev.id}`,
    },
  });
  await tx.stampCardProgress.update({
    where: { id: ev.progressId },
    data: { stamps: Math.max(0, ev.progress.stamps - ev.count) },
  });
  return true;
}

export async function voidStampEvent(ctx: StampCtx, actor: MemberActor, input: { eventId: string }): Promise<{ voided: number }> {
  assertManage(actor);
  await prisma.$transaction((tx) => voidEventInTx(tx, ctx, input.eventId, actor.userId ?? ctx.actorUserId ?? null));
  return { voided: 1 };
}

/**
 * บิลถูกยกเลิก → ยกเลิกตราทุกใบที่บิลนั้นทำให้เกิด (consumer `pos.sale.voided` เรียก)
 * idempotent: ยิงซ้ำได้ · ตราที่ยกเลิกไปแล้ว/ใบที่ปิดไปแล้วจะถูกข้ามเงียบ ๆ ไม่ throw
 * (คิว outbox ต้องไม่ค้างเพราะบิลใบเดียวที่ปิดใบสแตมป์ไปแล้ว)
 */
export async function voidStampsForSale(ctx: StampCtx, input: { saleId: string }): Promise<{ voided: number }> {
  const events = await prisma.stampEvent.findMany({
    where: { tenantId: ctx.tenantId, type: "ADD", refType: "SALE", refId: input.saleId },
    select: { id: true },
  });
  let voided = 0;
  for (const ev of events) {
    try {
      await prisma.$transaction((tx) => voidEventInTx(tx, ctx, ev.id, ctx.actorUserId ?? null));
      voided += 1;
    } catch {
      // ยกเลิกไปแล้ว / ใบปิดไปแล้ว → ข้าม (idempotent)
    }
  }
  return { voided };
}

// ───────────────────────── ใช้ตราบางส่วน / คืนตรา (M2.4 — reward v2) ─────────────────────────
//
// 🔴 ต่างจาก `completeCycle` (ใช้ "ทั้งใบ" ตอนครบช่อง): ที่นี่คือ "ใช้บางส่วน" — ลูกค้าแลกของรางวัล
//    ด้วยสแตมป์ก่อนใบจะครบ (เช่น การ์ด 5 ช่อง แลกของรางวัล 2 ตรา ที่เหลือ 3 ตราไว้ต่อ)
//    ⇒ ไม่ปิดใบ ไม่จ่ายรางวัลของการ์ด แค่หักยอดคงเหลือ + บันทึก StampEvent USE

export type UseStampsInput = {
  cardId: string;
  customerId: string;
  count: number;
  /** ที่มาของการใช้ (reward module ส่ง "REWARD") */
  refType: string;
  refId: string;
  idempotencyKey: string;
};

export type UseStampsResult = { progressId: string; stamps: number; eventId: string };

/**
 * ใช้ตราบางส่วนแลกของรางวัล (M2.4) — หักจากใบที่ยังเปิดอยู่ (`completedAt: null`) ของลูกค้าคนนี้
 * ตราไม่พอ → throw ไทย ไม่เขียนอะไร · idempotent ผ่าน `idempotencyKey` (ยิงซ้ำคืนผลเดิม ไม่หักซ้ำ)
 * `client` ส่ง tx ของผู้เรียกมาได้ (reward v2 ทำให้ redemption+ใช้ตราอะตอมมิกก้อนเดียวกัน) — ไม่ส่ง = เปิด tx เอง
 */
export async function useStamps(ctx: StampCtx, input: UseStampsInput, client: Db = prisma): Promise<UseStampsResult> {
  const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!key) throw new StampInputError("รายการนี้ไม่มีรหัสกันซ้ำ — รีเฟรชหน้าแล้วลองใหม่อีกครั้ง");
  const count = Number(input.count);
  if (!Number.isInteger(count) || count <= 0) {
    throw new StampInputError("จำนวนตราที่จะใช้ต้องเป็นจำนวนเต็มมากกว่า 0 — ใส่ตัวเลขใหม่แล้วลองอีกครั้ง");
  }
  const replay = await client.stampEvent.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: key } },
  });
  if (replay) {
    const p = await client.stampCardProgress.findUnique({ where: { id: replay.progressId } });
    return { progressId: replay.progressId, stamps: p?.stamps ?? 0, eventId: replay.id };
  }
  const card = await loadCard(client, ctx, input.cardId);
  const customer = await loadCustomer(client, ctx, input.customerId);
  return withTx(client, async (tx) => {
    const progress = await tx.stampCardProgress.findFirst({
      where: { cardId: card.id, customerId: customer.id, completedAt: null },
      orderBy: { cycle: "desc" },
    });
    if (!progress || progress.stamps < count) {
      throw new StampStateError(
        `ตราไม่พอสำหรับแลกรางวัลนี้ (มี ${progress?.stamps ?? 0} ตรา ต้องใช้ ${count} ตรา) — สะสมเพิ่มก่อนแล้วลองใหม่`,
      );
    }
    const stamps = progress.stamps - count;
    await tx.stampCardProgress.update({ where: { id: progress.id }, data: { stamps } });
    const ev = await tx.stampEvent.create({
      data: {
        tenantId: ctx.tenantId,
        progressId: progress.id,
        type: "USE",
        count,
        refType: input.refType,
        refId: input.refId,
        byUserId: ctx.actorUserId ?? null,
        idempotencyKey: key,
      },
    });
    return { progressId: progress.id, stamps, eventId: ev.id };
  });
}

export type RefundStampsInput = {
  cardId: string;
  customerId: string;
  count: number;
  refType: string;
  refId: string;
  idempotencyKey: string;
};

/**
 * คืนตราที่เคยถูก `useStamps` หักไป (M2.4 — ยกเลิกการแลกของรางวัล)
 * 🔴 **ไม่ติดเพดานต่อวัน** (ต่างจาก `addStamp` ปกติ) — นี่คือการคืนของที่ลูกค้ามีอยู่แล้ว ไม่ใช่ตราใหม่
 *    ถ้ามีใบเปิดอยู่ → คืนเข้าใบนั้น · ไม่มีใบเปิด (ปิด/หมดอายุไปแล้ว) → เปิดใบใหม่ให้ (กันตราลอยหาย)
 * `client` ส่ง tx ของผู้เรียกมาได้ (เหมือน `useStamps`) — ไม่ส่ง = เปิด tx เอง
 */
export async function refundStamps(ctx: StampCtx, input: RefundStampsInput, client: Db = prisma): Promise<UseStampsResult> {
  const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!key) throw new StampInputError("รายการนี้ไม่มีรหัสกันซ้ำ — รีเฟรชหน้าแล้วลองใหม่อีกครั้ง");
  const count = Number(input.count);
  if (!Number.isInteger(count) || count <= 0) {
    throw new StampInputError("จำนวนตราที่จะคืนต้องเป็นจำนวนเต็มมากกว่า 0 — ใส่ตัวเลขใหม่แล้วลองอีกครั้ง");
  }
  const replay = await client.stampEvent.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: key } },
  });
  if (replay) {
    const p = await client.stampCardProgress.findUnique({ where: { id: replay.progressId } });
    return { progressId: replay.progressId, stamps: p?.stamps ?? 0, eventId: replay.id };
  }
  const card = await loadCard(client, ctx, input.cardId);
  const now = new Date();
  return withTx(client, async (tx) => {
    let progress = await tx.stampCardProgress.findFirst({
      where: { cardId: card.id, customerId: input.customerId, completedAt: null },
      orderBy: { cycle: "desc" },
    });
    if (!progress) {
      const last = await tx.stampCardProgress.findFirst({
        where: { cardId: card.id, customerId: input.customerId },
        orderBy: { cycle: "desc" },
      });
      progress = await tx.stampCardProgress.create({
        data: {
          tenantId: ctx.tenantId,
          cardId: card.id,
          customerId: input.customerId,
          cycle: (last?.cycle ?? 0) + 1,
          stamps: 0,
          startedAt: now,
          expiresAt: card.validMonths ? addMonths(now, card.validMonths) : null,
        },
      });
    }
    const stamps = progress.stamps + count;
    await tx.stampCardProgress.update({ where: { id: progress.id }, data: { stamps } });
    const ev = await tx.stampEvent.create({
      data: {
        tenantId: ctx.tenantId,
        progressId: progress.id,
        type: "ADD",
        count,
        refType: input.refType,
        refId: input.refId,
        byUserId: ctx.actorUserId ?? null,
        idempotencyKey: key,
      },
    });
    return { progressId: progress.id, stamps, eventId: ev.id };
  });
}

// ───────────────────────── ใบของลูกค้า ─────────────────────────

/** ใบทั้งหมดที่ลูกค้าคนนี้ "เข้าเกณฑ์" วันนี้ — ใบที่ยังไม่เคยประทับก็แสดง (stamps 0) ให้เห็นว่ามีอะไรให้สะสม */
export async function progressFor(ctx: StampCtx, customerId: string): Promise<ProgressDto[]> {
  const customer = await loadCustomer(prisma, ctx, customerId);
  const cards = await prisma.stampCard.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const eligible = cards.filter(
    (c) => c.tierDefIds.length === 0 || (!!customer.tierDefId && c.tierDefIds.includes(customer.tierDefId)),
  );
  if (eligible.length === 0) return [];
  const rows = await prisma.stampCardProgress.findMany({
    where: { cardId: { in: eligible.map((c) => c.id) }, customerId },
    orderBy: { cycle: "asc" },
  });
  return eligible.map((card) => {
    const mine = rows.filter((r) => r.cardId === card.id);
    const open = mine.find((r) => !r.completedAt);
    const completedCycles = mine.filter((r) => !!r.completedAt).length;
    const lastCycle = mine.length > 0 ? Math.max(...mine.map((r) => r.cycle)) : 0;
    return {
      cardId: card.id,
      name: card.name,
      slots: card.slots,
      stamps: open?.stamps ?? 0,
      cycle: open?.cycle ?? lastCycle + 1,
      expiresAt: open?.expiresAt ?? null,
      completedCycles,
      rewardKind: card.rewardKind,
    };
  });
}

// ───────────────────────── อัตโนมัติจากบิล / จากนัด (§9.1 §9.2) ─────────────────────────

type AutoCandidate = { card: StampCardRow; cfg: StampRuleConfig; count: number };

async function runAuto(
  ctx: StampCtx,
  customerId: string,
  unitId: string | null,
  refType: StampRefType,
  refId: string,
  candidates: AutoCandidate[],
  keyOf: (cardId: string) => string,
): Promise<AutoStampResult> {
  const events: { cardId: string; eventId: string; stamps: number }[] = [];
  if (candidates.length === 0) return { events };
  let customer: CustomerLite;
  try {
    customer = await loadCustomer(prisma, ctx, customerId);
  } catch {
    return { events }; // ลูกค้าคนนี้ไม่ใช่สมาชิกของระบบนี้ → ไม่ใช่เรื่องผิด แค่ไม่มีอะไรให้ทำ
  }
  const now = new Date();
  for (const c of candidates) {
    const key = keyOf(c.card.id);
    if (await replayOf(key, ctx.tenantId)) continue; // ทำไปแล้วรอบก่อน → ไม่นับเป็นของใหม่
    try {
      assertEligible(c.card, customer, unitId);
      const res = await prisma.$transaction(
        (tx) =>
          addStampInTx(
            tx,
            ctx,
            {
              card: c.card,
              cfg: c.cfg,
              customerId: customer.id,
              count: c.count,
              refType,
              refId,
              unitId,
              byUserId: ctx.actorUserId ?? null,
              idempotencyKey: key,
              clampToDailyCap: true,
            },
            now,
          ),
        { timeout: 30_000, maxWait: 15_000 },
      );
      if (res) events.push({ cardId: c.card.id, eventId: res.eventId, stamps: res.stamps });
    } catch {
      // ใบนี้ไม่เข้าเกณฑ์ (ระดับ/สาขา/ครบแล้วไม่เริ่มใหม่) → ข้ามใบนี้ ใบอื่นต้องได้ตราตามปกติ
    }
  }
  return { events };
}

/**
 * บิลปิดแล้ว → ประทับตราให้ทุกใบที่เข้าเกณฑ์ (consumer `pos.sale.paid` เรียก)
 * 🔴 อ่านตารางบิลตรง ๆ โดยตั้งใจ (ดูหมายเหตุหัวไฟล์) — อ่านอย่างเดียว ไม่เขียนอะไรกลับนอกจาก
 *    ร่องรอย `stampEventIds` ที่ตัวบิลเอง (ช่องนี้มีมาตั้งแต่ migration member_v2_a เพื่อการนี้)
 */
export async function autoStampFromSale(ctx: StampCtx, input: { saleId: string }): Promise<AutoStampResult> {
  const sale = await prisma.posSale.findFirst({
    where: { id: input.saleId, tenantId: ctx.tenantId },
    select: {
      id: true,
      unitId: true,
      memberId: true,
      status: true,
      grandTotalSatang: true,
      giftCardId: true,
      stampEventIds: true,
      lines: { select: { qty: true, itemId: true, serviceId: true } },
    },
  });
  if (!sale || !sale.memberId || sale.status !== "PAID") return { events: [] };
  // ขาย/เติมบัตรกำนัลไม่ใช่การซื้อของ — ไม่ให้ตรา (กติกาเดียวกับที่ไม่ให้แต้ม §9.1)
  if (sale.giftCardId) return { events: [] };

  const cards = await prisma.stampCard.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, active: true, ruleKind: { in: ["PER_SALE_MIN", "PER_ITEM", "PER_DAY"] } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const candidates: AutoCandidate[] = [];
  for (const card of cards) {
    const cfg = ruleConfigOf(card);
    if (!cfg.allowAutoFromSale) continue;
    let count = 0;
    if (card.ruleKind === "PER_SALE_MIN") {
      count = (cfg.minSatang ?? 0) <= sale.grandTotalSatang ? 1 : 0;
    } else if (card.ruleKind === "PER_DAY") {
      count = 1;
    } else {
      const qty = sale.lines.reduce((n, l) => {
        const hit =
          (!!l.itemId && cfg.itemIds.includes(l.itemId)) || (!!l.serviceId && cfg.serviceIds.includes(l.serviceId));
        return hit ? n + Math.max(0, l.qty) : n;
      }, 0);
      // ซื้อ 5 ชิ้นแต่ใบให้วันละ 2 → ได้ 2 (ตัดที่เพดาน ไม่ปฏิเสธทั้งบิล — §5.6)
      count = Math.min(qty, dailyCapOf(card, cfg));
    }
    if (count > 0) candidates.push({ card, cfg, count });
  }

  const res = await runAuto(ctx, sale.memberId, sale.unitId, "SALE", sale.id, candidates, (cardId) => `sale:${sale.id}:${cardId}`);
  if (res.events.length > 0) {
    const ids = [...new Set([...sale.stampEventIds, ...res.events.map((e) => e.eventId)])];
    await prisma.posSale.update({ where: { id: sale.id }, data: { stampEventIds: ids } });
  }
  return res;
}

/**
 * ลูกค้ามาตามนัดจริง (สถานะ DONE) → ประทับตราให้ใบชนิด "จองที่มาจริง"
 * consumer `booking.completed` เรียก · ใบที่ไม่ระบุบริการ = ทุกบริการนับหมด
 */
export async function autoStampFromVisit(ctx: StampCtx, input: { appointmentId: string }): Promise<AutoStampResult> {
  const appt = await prisma.appointment.findFirst({
    where: { id: input.appointmentId, tenantId: ctx.tenantId },
    select: { id: true, unitId: true, customerId: true, serviceId: true, status: true, stampEventId: true },
  });
  if (!appt || appt.status !== "DONE" || !appt.customerId) return { events: [] };

  const cards = await prisma.stampCard.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, active: true, ruleKind: "PER_VISIT" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const candidates: AutoCandidate[] = [];
  for (const card of cards) {
    const cfg = ruleConfigOf(card);
    if (cfg.serviceIds.length > 0 && !cfg.serviceIds.includes(appt.serviceId)) continue;
    candidates.push({ card, cfg, count: 1 });
  }

  const res = await runAuto(ctx, appt.customerId, appt.unitId, "VISIT", appt.id, candidates, (cardId) => `visit:${appt.id}:${cardId}`);
  if (res.events.length > 0 && !appt.stampEventId) {
    await prisma.appointment.update({ where: { id: appt.id }, data: { stampEventId: res.events[0].eventId } });
  }
  return res;
}

// ───────────────────────── หมดอายุ (cron รายวัน §7.5) ─────────────────────────

/**
 * ใบที่ถึงวันหมดอายุของ **ทุกร้าน** → ตราที่ค้างหายไป แล้ว "เริ่มนับใหม่" จากวันนี้
 * (ไม่ลบแถวทิ้ง: ลูกค้าต้องเห็นประวัติว่าเคยสะสมไว้เท่าไหร่แล้วหมดอายุไปเมื่อไหร่)
 * 🔴 idempotent: หยิบเฉพาะ `completedAt = null` + `expiresAt ≤ now` + `stamps > 0`
 *    ⇒ รอบเดิมของวันเดียวกันรันซ้ำได้ ไม่มีอะไรให้ทำแล้ว
 */
export async function expireDue(now: Date = new Date()): Promise<{ expired: number; cards: number }> {
  const due = await prisma.stampCardProgress.findMany({
    where: { completedAt: null, expiresAt: { lte: now }, stamps: { gt: 0 } },
    include: { card: true },
    orderBy: { expiresAt: "asc" },
    take: 1000,
  });
  const cards = new Set<string>();
  let expired = 0;
  for (const p of due) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.stampEvent.create({
          data: {
            tenantId: p.tenantId,
            progressId: p.id,
            type: "EXPIRE",
            count: p.stamps,
            refType: "EXPIRE",
            idempotencyKey: `expire:${p.id}:${p.expiresAt?.getTime() ?? 0}`,
          },
        });
        await tx.stampCardProgress.update({
          where: { id: p.id },
          data: {
            stamps: 0,
            startedAt: now,
            expiresAt: p.card.validMonths ? addMonths(now, p.card.validMonths) : null,
          },
        });
        await emitOutbox(tx, {
          tenantId: p.tenantId,
          type: "stamp.expired",
          idempotencyKey: `stamp.expired#${p.id}#${p.expiresAt?.getTime() ?? 0}`,
          systemId: p.card.systemId,
          payload: { customerId: p.customerId, cardId: p.cardId, progressId: p.id, stamps: p.stamps, cycle: p.cycle },
        });
      });
      expired += 1;
      cards.add(p.cardId);
    } catch {
      // ใบนี้ถูกจัดการไปแล้วโดยอินสแตนซ์อื่น (คีย์กันซ้ำชน) → ข้ามไปใบถัดไป
    }
  }
  return { expired, cards: cards.size };
}

// ───────────────────────── รวมสมาชิกซ้ำ (§11.1) ─────────────────────────

/**
 * รวมคน → ตราของคนที่ถูกรวมต้องไม่หายไปไหน (เรียกจาก `member/profile.ts#mergeMembers` ใน tx เดียวกัน)
 *   • คนที่เก็บไว้มีใบที่ยังเปิดอยู่ของการ์ดใบเดียวกัน → บวกตราเข้าไป (StampEvent MERGE) แล้วลบใบเดิมทิ้ง
 *   • ไม่มี → ย้ายทั้งใบมาเป็นของคนที่เก็บไว้ (เลื่อน cycle ถ้าเลขชนกัน)
 * ⇒ หลังรวม คนที่ถูกรวมต้องไม่เหลือใบสแตมป์เลย
 */
export async function mergeProgress(
  ctx: StampCtx,
  input: { keepId: string; mergeId: string },
  tx?: Tx,
): Promise<{ moved: number; merged: number }> {
  const run = async (db: Tx): Promise<{ moved: number; merged: number }> => {
    const rows = await db.stampCardProgress.findMany({
      where: { tenantId: ctx.tenantId, customerId: input.mergeId },
      include: { card: true },
      orderBy: { cycle: "asc" },
    });
    let moved = 0;
    let merged = 0;
    const now = new Date();
    for (const p of rows) {
      const open = p.completedAt
        ? null
        : await db.stampCardProgress.findFirst({
            where: { cardId: p.cardId, customerId: input.keepId, completedAt: null },
            orderBy: { cycle: "desc" },
          });
      if (open && p.stamps > 0) {
        await db.stampEvent.create({
          data: {
            tenantId: ctx.tenantId,
            progressId: open.id,
            type: "MERGE",
            count: p.stamps,
            refType: "MERGE",
            refId: input.mergeId,
            idempotencyKey: `merge:${input.mergeId}:${p.id}`,
          },
        });
        const stamps = open.stamps + p.stamps;
        await db.stampCardProgress.update({ where: { id: open.id }, data: { stamps } });
        await db.stampCardProgress.delete({ where: { id: p.id } });
        merged += 1;
        if (stamps >= p.card.slots) {
          await completeCycle(db, ctx, p.card, { ...open, stamps }, stamps, now, null);
        }
        continue;
      }
      if (open) {
        // ใบเปล่าของคนที่ถูกรวม — ไม่มีอะไรให้ย้าย ทิ้งได้เลย
        await db.stampCardProgress.delete({ where: { id: p.id } });
        merged += 1;
        continue;
      }
      const taken = await db.stampCardProgress.findMany({
        where: { cardId: p.cardId, customerId: input.keepId },
        select: { cycle: true },
      });
      const used = new Set(taken.map((t) => t.cycle));
      let cycle = p.cycle;
      while (used.has(cycle)) cycle += 1;
      await db.stampCardProgress.update({ where: { id: p.id }, data: { customerId: input.keepId, cycle } });
      moved += 1;
    }
    return { moved, merged };
  };
  if (tx) return run(tx);
  return prisma.$transaction((inner) => run(inner), { timeout: 30_000, maxWait: 15_000 });
}

// ───────────────────────── สะพานจากคิว outbox (composition root เรียก) ─────────────────────────

/** ระบบสมาชิกที่ผูกสาขานี้ (คิว outbox รู้แค่ tenant + unit — ต้องหาระบบสมาชิกเอง) */
async function memberSystemsForUnit(tenantId: string, unitId: string | null): Promise<string[]> {
  const links = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "MEMBER", ...(unitId ? { unitId } : {}) },
    select: { systemId: true },
  });
  return [...new Set(links.map((l) => l.systemId))];
}

/** consumer `pos.sale.paid` → ประทับตราจากบิล (ทุกระบบสมาชิกที่ผูกสาขาของบิลใบนั้น) */
export async function autoStampFromSaleEvent(tenantId: string, saleId: string): Promise<AutoStampResult> {
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId }, select: { unitId: true } });
  if (!sale) return { events: [] };
  const events: { cardId: string; eventId: string; stamps: number }[] = [];
  for (const systemId of await memberSystemsForUnit(tenantId, sale.unitId)) {
    const r = await autoStampFromSale({ tenantId, systemId }, { saleId });
    events.push(...r.events);
  }
  return { events };
}

/** consumer `pos.sale.voided` → ยกเลิกตราของบิลใบนั้นทุกระบบสมาชิก */
export async function voidStampsForSaleEvent(tenantId: string, saleId: string): Promise<{ voided: number }> {
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId }, select: { unitId: true } });
  if (!sale) return { voided: 0 };
  let voided = 0;
  for (const systemId of await memberSystemsForUnit(tenantId, sale.unitId)) {
    voided += (await voidStampsForSale({ tenantId, systemId }, { saleId })).voided;
  }
  return { voided };
}

/** consumer `booking.completed` → ประทับตราจากนัดที่มาจริง */
export async function autoStampFromVisitEvent(tenantId: string, appointmentId: string): Promise<AutoStampResult> {
  const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, tenantId }, select: { unitId: true } });
  if (!appt) return { events: [] };
  const events: { cardId: string; eventId: string; stamps: number }[] = [];
  for (const systemId of await memberSystemsForUnit(tenantId, appt.unitId)) {
    const r = await autoStampFromVisit({ tenantId, systemId }, { appointmentId });
    events.push(...r.events);
  }
  return { events };
}
