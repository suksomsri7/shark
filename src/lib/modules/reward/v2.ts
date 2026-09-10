// v2.ts — รางวัล v2 (M2.4 · ledger/MEMBER-RUN.md §2 M2.4 · พิมพ์เขียว docs/modules/06-member-v2.md §4.1 §4.2 §5.x §7.1 §11.9)
//
// ต่อยอด `service.ts` (v1 — ยังทำงานเหมือนเดิม ห้ามลบ): ที่นี่คือของรางวัลรุ่นใหม่ที่
//   • มีชนิด (ITEM/SERVICE/VOUCHER/DISCOUNT) + รูป + จำกัดระดับ/สาขา/ชิ้นต่อคนต่อเดือน + ช่วงเวลา
//   • แลกได้ด้วยแต้ม **และ/หรือ** สแตมป์ (ผ่าน `point`/`stamp` facade)
//   • มี QR รับของ + วันหมดอายุรับของ + fulfil/cancel (คืนแต้ม/สแตมป์/สต็อก) + cron หมดอายุ
//
// ctx = { tenantId, systemId (= ระบบ REWARD), memberSystemId (= ระบบ MEMBER), pointSystemId (= ระบบ POINT), actorUserId }
// สิทธิ์ (§6.1): จัดการ = `member.loyalty.manage` · แลกให้ลูกค้า = `member.loyalty.read` (พนักงาน) หรือ CUSTOMER ตนเอง
//               ส่งมอบ/ยกเลิก = `member.loyalty.fulfil`
//
// 🔴 ไฟล์นี้เรียกโมดูลอื่น (point/stamp/member) ผ่าน facade `@/lib/modules/<x>` เท่านั้น (import ตรง
//    ไปที่ไฟล์ย่อยของโมดูลอื่นห้ามเด็ดขาด — fitness F2 เส้น reward→point/stamp/member อนุมัติแล้วแต่ต้องผ่านจุดตัดนี้)
//    ไฟล์พี่น้อง `service.ts`/`resolvePointSystemId`/`resolveMemberSystemIds` import ตรงได้ (อยู่โมดูลเดียวกัน)

import type { Prisma, Reward as RewardRow, RewardKind as RewardKindT, RewardRedemption as RedemptionRow } from "@prisma/client";
import { randomCode, randomToken } from "@/lib/core/hash";
import { emitOutbox } from "@/lib/core/outbox";
import { MEMBER_LIMITS, hasMemberPerm, memberLimitError, type MemberActor } from "@/lib/modules/member";
import { burnFifo, getBalance, reverseWithLots } from "@/lib/modules/point";
import { useStamps, refundStamps } from "@/lib/modules/stamp";
// 🔴 prisma ผ่าน `./service` (ไม่ใช่ `@/lib/core/db` ตรง) — กัน fitness F5 เพิ่มไฟล์ใหม่ที่แตะ prisma ดิบ
//    (v1 `service.ts` import ตัวจริงไว้แล้ว นับเป็น 1 ไฟล์ในเพดานเดิม — ที่นี่แค่ยืมมาใช้ต่อ)
import { prisma, resolveMemberSystemIds, resolvePointSystemId } from "./service";

type Tx = Prisma.TransactionClient;

/** ขอบเขตการทำงานของรางวัล v2 — `systemId` = ระบบ **รางวัล** เสมอ (ไม่ใช่ระบบสมาชิก/ระบบแต้ม) */
export type RewardCtx = {
  tenantId: string;
  systemId: string;
  memberSystemId: string;
  /** "" = ไม่มีระบบแต้มผูกไว้ — แลกด้วยแต้ม (pointsCost > 0) จะ throw ไทยให้เอง */
  pointSystemId: string;
  actorUserId: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** 00:00 ของ "เดือนไทย" ที่ `d` อยู่ (คืนเป็น UTC) — ใช้นับโควตาต่อคนต่อเดือน */
function bkkMonthStart(d: Date): Date {
  const shifted = new Date(d.getTime() + BKK_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - BKK_OFFSET_MS);
}

/** 00:00 ของเดือนไทยถัดไป (ขอบบนแบบ exclusive) */
function bkkMonthEnd(d: Date): Date {
  const shifted = new Date(d.getTime() + BKK_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - BKK_OFFSET_MS);
}

/** โค้ดรับของแบบสั้น (v1 คงไว้ — พนักงานพิมพ์เองได้ถ้า QR สแกนไม่ขึ้น) */
function genCode(): string {
  return randomCode(6, "ACDEFGHJKLMNPQRSTUVWXY3456789");
}

/** โค้ด QR แบบยาว (crypto random ≥ 12 ตัว · unique) — ตัวจริงที่ QR เก็บ */
function genQrCode(): string {
  return randomToken(12);
}

// ───────────────────────── สิทธิ์ (§6.1) ─────────────────────────

function assertManage(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.loyalty.manage")) {
    throw new Error("งานนี้ต้องมีสิทธิ์จัดการของรางวัล — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

/** แลกให้ลูกค้า = พนักงานที่มี `member.loyalty.read` · หรือ CUSTOMER แลกให้ตัวเองเท่านั้น */
function assertRedeem(actor: MemberActor, customerId: string): void {
  if (actor.role === "CUSTOMER") {
    if (!actor.customerId || actor.customerId !== customerId) {
      throw new Error("แลกของรางวัลได้เฉพาะบัญชีของตัวเอง — ถ้าต้องการแลกให้คนอื่น ให้พนักงานเป็นผู้ทำรายการ");
    }
    return;
  }
  if (!hasMemberPerm(actor, "member.loyalty.read")) {
    throw new Error("บัญชีของคุณยังไม่ได้รับสิทธิ์แลกของรางวัลให้สมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

function assertFulfil(actor: MemberActor): void {
  if (!hasMemberPerm(actor, "member.loyalty.fulfil")) {
    throw new Error("งานนี้ต้องมีสิทธิ์ส่งมอบของรางวัล — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
}

// ───────────────────────── ตัวช่วยตรวจ/แปลงค่า ─────────────────────────

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

function normalizeName(v: unknown): string {
  const name = typeof v === "string" ? v.trim() : "";
  if (!name) throw new Error("ตั้งชื่อของรางวัลก่อนบันทึก — ลูกค้าจะเห็นชื่อนี้ในแคตตาล็อก");
  if (name.length > 120) throw new Error("ชื่อของรางวัลยาวเกินไป — ย่อให้เหลือไม่เกิน 120 ตัวอักษร");
  return name;
}

function normalizeDescription(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

const KINDS: readonly RewardKindT[] = ["ITEM", "SERVICE", "VOUCHER", "DISCOUNT"];

function normalizeKind(v: unknown): RewardKindT {
  const k = KINDS.find((x) => x === v);
  if (!k) throw new Error('เลือกชนิดของรางวัลจากรายการที่มีให้ก่อนบันทึก ("ของจริง" / "บริการ" / "คูปอง" / "ส่วนลด")');
  return k;
}

function normalizePointsCost(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("ราคาแต้มต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  }
  return n;
}

function normalizeStock(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("สต็อกต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป — ปล่อยว่างไว้ถ้าไม่จำกัด");
  }
  return n;
}

/** stampsCost มีค่าได้ก็ต่อเมื่อเลือกการ์ดสแตมป์แล้ว (≥1 ตรา) — ไม่งั้น throw ไทย */
function normalizeStampCost(rawStampsCost: unknown, stampCardId: string | null): number | null {
  const hasCard = !!stampCardId;
  const raw = rawStampsCost === null || rawStampsCost === undefined || rawStampsCost === "" ? null : Number(rawStampsCost);
  if (raw !== null && !hasCard) {
    throw new Error("เลือกสแตมป์การ์ดก่อนตั้งราคาเป็นจำนวนตรา — ถ้าไม่ใช้สแตมป์ ปล่อยช่องนี้ว่างไว้");
  }
  if (hasCard) {
    if (raw === null || !Number.isInteger(raw) || raw < 1) {
      throw new Error("ราคาสแตมป์ต้องเป็นจำนวนเต็มตั้งแต่ 1 ตราขึ้นไปเมื่อเลือกสแตมป์การ์ดแล้ว");
    }
    return raw;
  }
  return null;
}

function normalizePerMemberMonthly(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("จำกัดจำนวนชิ้น/คน/เดือน ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป — ปล่อยว่างไว้ถ้าไม่จำกัด");
  }
  return n;
}

function normalizeDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new Error("รูปแบบวันที่ไม่ถูกต้อง — เลือกวันที่จากปฏิทินอีกครั้ง");
  return d;
}

function normalizePickupDays(v: unknown): number {
  if (v === undefined) return 14;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 365) {
    throw new Error("รับของภายในต้องเป็นจำนวนวัน 1–365 วัน");
  }
  return n;
}

function normalizeFileId(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ───────────────────────── DTO ─────────────────────────

export type RewardDto = {
  id: string;
  name: string;
  description: string | null;
  kind: RewardKindT;
  pointsCost: number;
  stampCardId: string | null;
  stampsCost: number | null;
  stock: number | null;
  active: boolean;
  tierDefIds: string[];
  perMemberMonthly: number | null;
  startAt: Date | null;
  endAt: Date | null;
  unitIds: string[];
  pickupDays: number;
  showToCustomer: boolean;
  imageFileId: string | null;
  sortOrder: number;
  stats: { pending: number; fulfilled: number };
};

function toDto(r: RewardRow, stats: { pending: number; fulfilled: number }): RewardDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    kind: r.kind,
    pointsCost: r.pointsCost,
    stampCardId: r.stampCardId,
    stampsCost: r.stampsCost,
    stock: r.stock,
    active: r.active,
    tierDefIds: r.tierDefIds,
    perMemberMonthly: r.perMemberMonthly,
    startAt: r.startAt,
    endAt: r.endAt,
    unitIds: r.unitIds,
    pickupDays: r.pickupDays,
    showToCustomer: r.showToCustomer,
    imageFileId: r.imageFileId,
    sortOrder: r.sortOrder,
    stats,
  };
}

async function statsOf(rewardIds: string[]): Promise<Map<string, { pending: number; fulfilled: number }>> {
  const out = new Map<string, { pending: number; fulfilled: number }>();
  for (const id of rewardIds) out.set(id, { pending: 0, fulfilled: 0 });
  if (rewardIds.length === 0) return out;
  const rows = await prisma.rewardRedemption.groupBy({
    by: ["rewardId", "status"],
    where: { rewardId: { in: rewardIds } },
    _count: { _all: true },
  });
  for (const row of rows) {
    const s = out.get(row.rewardId);
    if (!s) continue;
    if (row.status === "PENDING") s.pending += row._count._all;
    if (row.status === "FULFILLED") s.fulfilled += row._count._all;
  }
  return out;
}

async function loadReward(ctx: RewardCtx, rewardId: string): Promise<RewardRow> {
  const reward = await prisma.reward.findFirst({ where: { id: rewardId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!reward) throw new Error("ไม่พบของรางวัลนี้ในระบบสมาชิกนี้ — รีเฟรชหน้าแล้วเลือกใหม่อีกครั้ง");
  return reward;
}

async function loadCustomerLite(ctx: RewardCtx, customerId: string): Promise<{ id: string; tierDefId: string | null; homeUnitId: string | null }> {
  const c = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.memberSystemId },
    select: { id: true, tierDefId: true, homeUnitId: true },
  });
  if (!c) throw new Error("ไม่พบสมาชิกคนนี้ในระบบสมาชิกนี้ — ตรวจว่าเลือกสมาชิกถูกคนแล้วหรือยัง");
  return c;
}

// ───────────────────────── CRUD ─────────────────────────

export type CreateRewardV2Input = {
  name: string;
  description?: string | null;
  kind: string;
  pointsCost: number;
  stampCardId?: string | null;
  stampsCost?: number | null;
  stock?: number | null;
  tierDefIds?: string[];
  perMemberMonthly?: number | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  unitIds?: string[];
  pickupDays?: number;
  showToCustomer?: boolean;
  imageFileId?: string | null;
};

export type UpdateRewardV2Input = Partial<CreateRewardV2Input>;

/** สร้างของรางวัล — เพดาน `MEMBER_LIMITS.rewards` ต่อระบบสมาชิก (§11.9) */
export async function createRewardV2(ctx: RewardCtx, actor: MemberActor, input: CreateRewardV2Input): Promise<RewardDto> {
  assertManage(actor);
  const name = normalizeName(input.name);
  const kind = normalizeKind(input.kind);
  const stampCardId = normalizeFileId(input.stampCardId);
  const stampsCost = normalizeStampCost(input.stampsCost, stampCardId);
  const pointsCost = normalizePointsCost(input.pointsCost);
  if (pointsCost === 0 && !stampsCost) {
    throw new Error("ตั้งราคาของรางวัลอย่างน้อยหนึ่งอย่าง (แต้ม หรือ สแตมป์) ก่อนบันทึก");
  }

  const used = await prisma.reward.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (used >= MEMBER_LIMITS.rewards) {
    throw memberLimitError(
      `สร้างของรางวัลได้สูงสุด ${MEMBER_LIMITS.rewards} รายการต่อระบบสมาชิก (ตอนนี้มี ${used} รายการ) — ปิดใช้งานรายการที่เลิกให้แล้วก่อน`,
    );
  }

  const reward = await prisma.reward.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name,
      description: normalizeDescription(input.description),
      pointsCost,
      stock: normalizeStock(input.stock),
      kind,
      imageFileId: normalizeFileId(input.imageFileId),
      stampCardId,
      stampsCost,
      tierDefIds: asStringArray(input.tierDefIds),
      perMemberMonthly: normalizePerMemberMonthly(input.perMemberMonthly),
      startAt: normalizeDate(input.startAt),
      endAt: normalizeDate(input.endAt),
      unitIds: asStringArray(input.unitIds),
      pickupDays: normalizePickupDays(input.pickupDays),
      showToCustomer: input.showToCustomer !== false,
    },
  });
  return toDto(reward, { pending: 0, fulfilled: 0 });
}

export async function updateRewardV2(ctx: RewardCtx, actor: MemberActor, rewardId: string, patch: UpdateRewardV2Input): Promise<RewardDto> {
  assertManage(actor);
  const reward = await loadReward(ctx, rewardId);
  const data: Prisma.RewardUpdateInput = {};

  if (patch.name !== undefined) data.name = normalizeName(patch.name);
  if (patch.description !== undefined) data.description = normalizeDescription(patch.description);
  if (patch.kind !== undefined) data.kind = normalizeKind(patch.kind);
  if (patch.stampCardId !== undefined || patch.stampsCost !== undefined) {
    const nextCard = patch.stampCardId !== undefined ? normalizeFileId(patch.stampCardId) : reward.stampCardId;
    data.stampsCost = normalizeStampCost(patch.stampsCost !== undefined ? patch.stampsCost : reward.stampsCost, nextCard);
    data.stampCardId = nextCard;
  }
  if (patch.pointsCost !== undefined) data.pointsCost = normalizePointsCost(patch.pointsCost);
  if (patch.stock !== undefined) data.stock = normalizeStock(patch.stock);
  if (patch.tierDefIds !== undefined) data.tierDefIds = asStringArray(patch.tierDefIds);
  if (patch.perMemberMonthly !== undefined) data.perMemberMonthly = normalizePerMemberMonthly(patch.perMemberMonthly);
  if (patch.startAt !== undefined) data.startAt = normalizeDate(patch.startAt);
  if (patch.endAt !== undefined) data.endAt = normalizeDate(patch.endAt);
  if (patch.unitIds !== undefined) data.unitIds = asStringArray(patch.unitIds);
  if (patch.pickupDays !== undefined) data.pickupDays = normalizePickupDays(patch.pickupDays);
  if (patch.showToCustomer !== undefined) data.showToCustomer = patch.showToCustomer !== false;
  if (patch.imageFileId !== undefined) data.imageFileId = normalizeFileId(patch.imageFileId);

  const next = await prisma.reward.update({ where: { id: reward.id }, data });
  const stats = (await statsOf([reward.id])).get(reward.id) ?? { pending: 0, fulfilled: 0 };
  return toDto(next, stats);
}

export async function toggleReward(ctx: RewardCtx, actor: MemberActor, rewardId: string, active: boolean): Promise<RewardDto> {
  assertManage(actor);
  const reward = await loadReward(ctx, rewardId);
  const next = await prisma.reward.update({ where: { id: reward.id }, data: { active: !!active } });
  const stats = (await statsOf([reward.id])).get(reward.id) ?? { pending: 0, fulfilled: 0 };
  return toDto(next, stats);
}

/** ของรางวัลทั้งหมดของระบบสมาชิกนี้ (+ สถิติต่อรายการ) — หน้าจอ/REST อ่านตัวนี้ตัวเดียว */
export async function listRewardsV2(ctx: RewardCtx): Promise<RewardDto[]> {
  const rewards = await prisma.reward.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const stats = await statsOf(rewards.map((r) => r.id));
  return rewards.map((r) => toDto(r, stats.get(r.id) ?? { pending: 0, fulfilled: 0 }));
}

// ───────────────────────── แลก ─────────────────────────

export type RedeemV2Input = { rewardId: string; customerId: string; unitId?: string | null; idempotencyKey: string };
export type RedeemV2Result = { redemptionId: string; qrCode: string; code: string; expiresAt: Date; pointsCost: number; stampsCost: number };

function redeemResultOf(r: { id: string; qrCode: string | null; code: string; expiresAt: Date | null; pointsCost: number }, stampsCost: number): RedeemV2Result {
  return { redemptionId: r.id, qrCode: r.qrCode ?? "", code: r.code, expiresAt: r.expiresAt ?? new Date(), pointsCost: r.pointsCost, stampsCost };
}

/**
 * แลกของรางวัลด้วยแต้ม และ/หรือ สแตมป์ (§5.x) — เงื่อนไขทุกข้อ throw ไทยก่อนเขียนอะไรทั้งนั้น
 * การเขียนจริง (ตัดสต็อก/สร้างรายการ/ตัดแต้ม/ตัดสแตมป์/ยิง event) อยู่ใน tx เดียว — ไม่ผ่านข้อไหน = ย้อนกลับหมด
 */
export async function redeemV2(ctx: RewardCtx, actor: MemberActor, input: RedeemV2Input): Promise<RedeemV2Result> {
  const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!key) throw new Error("รายการนี้ไม่มีรหัสกันซ้ำ — รีเฟรชหน้าแล้วลองใหม่อีกครั้ง");
  assertRedeem(actor, input.customerId);

  const replay = await prisma.rewardRedemption.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: key } },
  });
  if (replay) {
    const rw = await prisma.reward.findFirst({ where: { id: replay.rewardId } });
    return redeemResultOf(replay, rw?.stampsCost ?? 0);
  }

  const reward = await loadReward(ctx, input.rewardId);
  if (!reward.active) throw new Error("ของรางวัลนี้ปิดใช้งานอยู่ — เลือกรายการอื่นแทน");
  const now = new Date();
  if (reward.startAt && reward.startAt > now) throw new Error("ของรางวัลนี้ยังไม่เปิดให้แลก — รอถึงวันเริ่มก่อน");
  if (reward.endAt && reward.endAt < now) throw new Error("ของรางวัลนี้หมดเขตแลกแล้ว — เลือกรายการอื่นแทน");
  if (reward.stock !== null && reward.stock <= 0) throw new Error("ของรางวัลนี้หมดแล้ว — รอร้านเติมสต็อกใหม่");

  const customer = await loadCustomerLite(ctx, input.customerId);
  if (reward.tierDefIds.length > 0 && (!customer.tierDefId || !reward.tierDefIds.includes(customer.tierDefId))) {
    throw new Error("สมาชิกคนนี้ยังไม่ถึงระดับที่ของรางวัลนี้กำหนดไว้");
  }
  const unitId = input.unitId ?? customer.homeUnitId ?? null;
  if (reward.unitIds.length > 0 && (!unitId || !reward.unitIds.includes(unitId))) {
    throw new Error("ของรางวัลนี้รับได้เฉพาะบางสาขา — เลือกสาขาที่ร่วมรายการ");
  }
  if (reward.perMemberMonthly) {
    const count = await prisma.rewardRedemption.count({
      where: {
        tenantId: ctx.tenantId,
        rewardId: reward.id,
        customerId: input.customerId,
        status: { not: "CANCELLED" },
        createdAt: { gte: bkkMonthStart(now), lt: bkkMonthEnd(now) },
      },
    });
    if (count >= reward.perMemberMonthly) {
      throw new Error(`ของรางวัลนี้แลกได้ไม่เกิน ${reward.perMemberMonthly} ชิ้น/คน/เดือน — เดือนนี้แลกครบแล้ว`);
    }
  }

  const code = genCode();
  const qrCode = genQrCode();
  const expiresAt = new Date(now.getTime() + reward.pickupDays * DAY_MS);

  const redemption = await prisma.$transaction(
    async (tx) => {
      if (reward.stock !== null) {
        const upd = await tx.reward.updateMany({ where: { id: reward.id, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
        if (upd.count === 0) throw new Error("ของรางวัลนี้หมดแล้ว — รอร้านเติมสต็อกใหม่");
      }
      const row = await tx.rewardRedemption.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          rewardId: reward.id,
          customerId: input.customerId,
          pointsCost: reward.pointsCost,
          code,
          qrCode,
          status: "PENDING",
          expiresAt,
          idempotencyKey: key,
        },
      });
      if (reward.pointsCost > 0) {
        if (!ctx.pointSystemId) throw new Error("ยังไม่ได้ผูกระบบแต้มกับระบบรางวัลนี้ — ติดต่อผู้ดูแลร้าน");
        await burnFifo(
          { tenantId: ctx.tenantId, systemId: ctx.pointSystemId, memberSystemId: ctx.memberSystemId, actorUserId: ctx.actorUserId },
          { customerId: input.customerId, points: reward.pointsCost, refType: "RewardRedemption", refId: row.id, idempotencyKey: `reward:${row.id}`, unitId },
          tx,
        );
      }
      if (reward.stampsCost && reward.stampCardId) {
        await useStamps(
          { tenantId: ctx.tenantId, systemId: ctx.memberSystemId, actorUserId: ctx.actorUserId },
          { cardId: reward.stampCardId, customerId: input.customerId, count: reward.stampsCost, refType: "REWARD", refId: row.id, idempotencyKey: `reward:${row.id}` },
          tx,
        );
      }
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        type: "reward.redeemed",
        idempotencyKey: `reward.redeemed#${row.id}`,
        systemId: ctx.systemId,
        unitId,
        payload: { customerId: input.customerId, rewardId: reward.id, redemptionId: row.id },
      });
      return row;
    },
    { timeout: 30_000, maxWait: 15_000 },
  );

  return redeemResultOf(redemption, reward.stampsCost ?? 0);
}

// ───────────────────────── ส่งมอบ / ยกเลิก ─────────────────────────

export type FulfilV2Input = { redemptionId: string; unitId: string };
export type FulfilV2Result = { ok: true };

/** ส่งมอบของหน้าร้าน (สแกน QR/พิมพ์รหัสแล้วกดยืนยัน) — idempotent เมื่อส่งมอบซ้ำ */
export async function fulfilV2(ctx: RewardCtx, actor: MemberActor, input: FulfilV2Input): Promise<FulfilV2Result> {
  assertFulfil(actor);
  const redemption = await prisma.rewardRedemption.findFirst({ where: { id: input.redemptionId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!redemption) throw new Error("ไม่พบรายการแลกของรางวัลนี้ — รีเฟรชแล้วลองใหม่อีกครั้ง");
  if (redemption.status === "FULFILLED") return { ok: true };
  if (redemption.status === "CANCELLED") throw new Error("รายการนี้ถูกยกเลิกไปแล้ว — ส่งมอบไม่ได้");
  if (redemption.expiresAt && redemption.expiresAt.getTime() < Date.now()) {
    throw new Error("รายการนี้หมดอายุรับของแล้ว — แนะนำให้กดยกเลิก (คืนแต้ม) แทน");
  }
  const reward = await prisma.reward.findFirst({ where: { id: redemption.rewardId, tenantId: ctx.tenantId } });
  if (reward && reward.unitIds.length > 0 && !reward.unitIds.includes(input.unitId)) {
    throw new Error("ของรางวัลนี้รับได้เฉพาะสาขาที่ร้านกำหนดไว้ — ส่งมอบที่สาขาที่ร่วมรายการแทน");
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.rewardRedemption.updateMany({
      where: { id: redemption.id, tenantId: ctx.tenantId, status: "PENDING" },
      data: { status: "FULFILLED", fulfilledById: actor.userId ?? null, fulfilledUnitId: input.unitId },
    });
    if (claimed.count === 0) return; // แข่งกันกด — อีกคนส่งมอบไปก่อนแล้ว
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "reward.fulfilled",
      idempotencyKey: `reward.fulfilled#${redemption.id}`,
      systemId: ctx.systemId,
      unitId: input.unitId,
      payload: { customerId: redemption.customerId, rewardId: redemption.rewardId, redemptionId: redemption.id },
    });
  });
  return { ok: true };
}

export type CancelV2Input = { redemptionId: string; reason: string };
export type CancelV2Result = { ok: true; refundedPoints: number; refundedStamps: number };

/** คืนแต้ม/สแตมป์/สต็อกของรายการที่ถูกหักไปตอนแลก (ผ่าน `reverseWithLots`/`refundStamps` — ไม่ติดเพดานต่อวัน) */
async function applyRefund(
  tx: Tx,
  tenantId: string,
  pointSystemId: string | null,
  memberSystemId: string | null,
  actorUserId: string | null,
  redemption: { id: string; pointsCost: number; customerId: string },
  reward: { id: string; stock: number | null; stampsCost: number | null; stampCardId: string | null } | null,
): Promise<{ ok: true; refundedPoints: number; refundedStamps: number }> {
  let refundedPoints = 0;
  let refundedStamps = 0;
  if (redemption.pointsCost > 0 && pointSystemId) {
    const r = await reverseWithLots(
      { tenantId, systemId: pointSystemId, memberSystemId: memberSystemId ?? undefined, actorUserId },
      { refType: "RewardRedemption", refId: redemption.id, idempotencyKey: `reward-cancel:${redemption.id}`, reason: "ยกเลิกแลกของรางวัล" },
      tx,
    );
    if (r.reversed > 0) refundedPoints = redemption.pointsCost;
  }
  if (reward?.stampsCost && reward.stampCardId && memberSystemId) {
    await refundStamps(
      { tenantId, systemId: memberSystemId, actorUserId },
      {
        cardId: reward.stampCardId,
        customerId: redemption.customerId,
        count: reward.stampsCost,
        refType: "REWARD_CANCEL",
        refId: redemption.id,
        idempotencyKey: `reward-cancel:${redemption.id}`,
      },
      tx,
    );
    refundedStamps = reward.stampsCost;
  }
  if (reward && reward.stock !== null) {
    await tx.reward.update({ where: { id: reward.id }, data: { stock: { increment: 1 } } });
  }
  return { ok: true, refundedPoints, refundedStamps };
}

/** ยกเลิกการแลก (พนักงานกดที่แผงรับของ) — PENDING เท่านั้น · FULFILLED ยกเลิกไม่ได้ · CANCELLED ซ้ำ = idempotent */
export async function cancelV2(ctx: RewardCtx, actor: MemberActor, input: CancelV2Input): Promise<CancelV2Result> {
  assertFulfil(actor);
  const redemption = await prisma.rewardRedemption.findFirst({ where: { id: input.redemptionId, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!redemption) throw new Error("ไม่พบรายการแลกของรางวัลนี้ — รีเฟรชแล้วลองใหม่อีกครั้ง");
  if (redemption.status === "FULFILLED") throw new Error("รายการนี้ส่งมอบแล้ว — ยกเลิกคืนแต้มไม่ได้");
  if (redemption.status === "CANCELLED") return { ok: true, refundedPoints: 0, refundedStamps: 0 };

  const reward = await prisma.reward.findFirst({ where: { id: redemption.rewardId, tenantId: ctx.tenantId } });
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : "ยกเลิก";

  return prisma.$transaction(
    async (tx) => {
      const claimed = await tx.rewardRedemption.updateMany({
        where: { id: redemption.id, tenantId: ctx.tenantId, status: "PENDING" },
        data: { status: "CANCELLED", cancelReason: reason },
      });
      if (claimed.count === 0) return { ok: true as const, refundedPoints: 0, refundedStamps: 0 };
      return applyRefund(tx, ctx.tenantId, ctx.pointSystemId || null, ctx.memberSystemId, ctx.actorUserId ?? null, redemption, reward);
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
}

/** cron รายวัน — รายการ PENDING ที่ถึงวันหมดอายุรับของของ **ทุกร้าน** → CANCELLED + คืนแต้ม/สแตมป์/สต็อก */
export async function expireDue(now: Date = new Date()): Promise<{ expired: number }> {
  const due = await prisma.rewardRedemption.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: 1000,
  });
  let expired = 0;
  for (const r of due) {
    try {
      const reward = await prisma.reward.findFirst({ where: { id: r.rewardId, tenantId: r.tenantId } });
      const pointSystemId = await resolvePointSystemId(r.tenantId, r.systemId);
      const memberSystemId = (await resolveMemberSystemIds(r.tenantId, r.systemId))[0] ?? null;
      const done = await prisma.$transaction(
        async (tx) => {
          const claimed = await tx.rewardRedemption.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "CANCELLED", cancelReason: "EXPIRED" } });
          if (claimed.count === 0) return false;
          await applyRefund(tx, r.tenantId, pointSystemId, memberSystemId, null, r, reward);
          return true;
        },
        { timeout: 30_000, maxWait: 15_000 },
      );
      if (done) expired += 1;
    } catch {
      // ใบนี้ล้ม (คู่แข่งจัดการไปแล้ว/ข้อมูลที่ผูกไว้หาย) → ข้ามไปใบถัดไป ไม่ให้รอบทั้งหมดล้ม
    }
  }
  return { expired };
}

// ───────────────────────── ค้นหา / รายการ / แคตตาล็อก ─────────────────────────

export type LookupRedemptionResult = {
  redemption: { id: string; status: string; expiresAt: Date | null; createdAt: Date; pointsCost: number; stampsCost: number | null };
  reward: { id: string; name: string; kind: RewardKindT };
  member: { customerId: string; name: string; memberCode: string; tierName?: string };
  fulfilledBy?: { name: string };
} | null;

/** หารายการแลกด้วย qrCode หรือ code (v1) — ต่างร้าน/ไม่พบ = null (ไม่บอกใบ้ว่ามีอยู่) */
export async function lookupRedemption(ctx: RewardCtx, input: { code: string }): Promise<LookupRedemptionResult> {
  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!code) return null;
  const redemption = await prisma.rewardRedemption.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, OR: [{ qrCode: code }, { code }] },
  });
  if (!redemption) return null;
  const reward = await prisma.reward.findFirst({ where: { id: redemption.rewardId, tenantId: ctx.tenantId } });
  if (!reward) return null;
  const customer = await prisma.customer.findFirst({
    where: { id: redemption.customerId, tenantId: ctx.tenantId },
    select: { id: true, name: true, firstName: true, lastName: true, memberCode: true, tierDefId: true },
  });
  let tierName: string | undefined;
  if (customer?.tierDefId) {
    const tier = await prisma.memberTierDef.findFirst({ where: { id: customer.tierDefId }, select: { name: true } });
    tierName = tier?.name;
  }
  let fulfilledBy: { name: string } | undefined;
  if (redemption.fulfilledById) {
    const u = await prisma.user.findFirst({ where: { id: redemption.fulfilledById }, select: { name: true, email: true } });
    if (u) fulfilledBy = { name: u.name ?? u.email };
  }
  return {
    redemption: {
      id: redemption.id,
      status: redemption.status,
      expiresAt: redemption.expiresAt,
      createdAt: redemption.createdAt,
      pointsCost: redemption.pointsCost,
      stampsCost: reward.stampsCost,
    },
    reward: { id: reward.id, name: reward.name, kind: reward.kind },
    member: {
      customerId: customer?.id ?? redemption.customerId,
      name: customer?.name ?? [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") ?? customer?.memberCode ?? "สมาชิก",
      memberCode: customer?.memberCode ?? "",
      tierName,
    },
    fulfilledBy,
  };
}

export type ListRedemptionsFilter = { status?: RedemptionRow["status"]; unitId?: string; take?: number };
export type RedemptionRowV2 = {
  id: string;
  code: string;
  qrCode: string | null;
  rewardName: string;
  memberName: string;
  status: string;
  unitName?: string;
  fulfilledByName?: string;
  createdAt: Date;
  expiresAt: Date | null;
};

/** ประวัติการแลกของระบบรางวัลนี้ (หน้า "ประวัติการแลก") */
export async function listRedemptionsV2(ctx: RewardCtx, filter: ListRedemptionsFilter = {}): Promise<RedemptionRowV2[]> {
  const rows = await prisma.rewardRedemption.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.unitId ? { fulfilledUnitId: filter.unitId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filter.take && filter.take > 0 ? Math.min(filter.take, 200) : 50,
  });
  if (rows.length === 0) return [];

  const rewardIds = [...new Set(rows.map((r) => r.rewardId))];
  const customerIds = [...new Set(rows.map((r) => r.customerId))];
  const unitIds = [...new Set(rows.map((r) => r.fulfilledUnitId).filter((x): x is string => !!x))];
  const userIds = [...new Set(rows.map((r) => r.fulfilledById).filter((x): x is string => !!x))];

  const [rewards, customers, units, users] = await Promise.all([
    prisma.reward.findMany({ where: { id: { in: rewardIds } }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, firstName: true, lastName: true, memberCode: true } }),
    unitIds.length ? prisma.businessUnit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
  ]);
  const rMap = new Map(rewards.map((r) => [r.id, r.name]));
  const cMap = new Map(customers.map((c) => [c.id, c.name ?? ([c.firstName, c.lastName].filter(Boolean).join(" ") || c.memberCode || "ลูกค้า")]));
  const uMap = new Map(units.map((u) => [u.id, u.name]));
  const pMap = new Map(users.map((p) => [p.id, p.name ?? p.email]));

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    qrCode: r.qrCode,
    rewardName: rMap.get(r.rewardId) ?? "ของรางวัล",
    memberName: cMap.get(r.customerId) ?? "ลูกค้า",
    status: r.status,
    unitName: r.fulfilledUnitId ? uMap.get(r.fulfilledUnitId) : undefined,
    fulfilledByName: r.fulfilledById ? pMap.get(r.fulfilledById) : undefined,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));
}

export type CatalogItem = {
  rewardId: string;
  name: string;
  kind: RewardKindT;
  pointsCost: number;
  stampsCost?: number;
  stampCardName?: string;
  stock: number | null;
  eligible: boolean;
  affordable: boolean;
  reason?: string;
};

/** แคตตาล็อกของรางวัลสำหรับลูกค้าคนหนึ่ง (หน้า "แคตตาล็อก" + LIFF M2.9) — ไม่ตัดรายการที่ eligible=false ออก */
export async function catalogFor(ctx: RewardCtx, customerId: string): Promise<CatalogItem[]> {
  const now = new Date();
  const rewards = await prisma.reward.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, active: true, showToCustomer: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const inWindow = rewards.filter((r) => (!r.startAt || r.startAt <= now) && (!r.endAt || r.endAt >= now));
  if (inWindow.length === 0) return [];

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.memberSystemId },
    select: { id: true, tierDefId: true, homeUnitId: true },
  });
  const pointBalance = ctx.pointSystemId ? await getBalance(ctx.pointSystemId, customerId) : 0;

  const cardIds = [...new Set(inWindow.map((r) => r.stampCardId).filter((x): x is string => !!x))];
  const [progresses, cards] = await Promise.all([
    cardIds.length
      ? prisma.stampCardProgress.findMany({ where: { cardId: { in: cardIds }, customerId, completedAt: null }, orderBy: { cycle: "desc" } })
      : Promise.resolve([]),
    cardIds.length ? prisma.stampCard.findMany({ where: { id: { in: cardIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const stampsOf = new Map<string, number>();
  for (const p of progresses) if (!stampsOf.has(p.cardId)) stampsOf.set(p.cardId, p.stamps);
  const cardNameOf = new Map(cards.map((c) => [c.id, c.name]));

  return inWindow.map((r) => {
    let eligible = true;
    let reason: string | undefined;
    if (r.tierDefIds.length > 0 && (!customer?.tierDefId || !r.tierDefIds.includes(customer.tierDefId))) {
      eligible = false;
      reason = "สมาชิกระดับนี้ยังแลกของรางวัลชิ้นนี้ไม่ได้";
    } else if (r.unitIds.length > 0 && (!customer?.homeUnitId || !r.unitIds.includes(customer.homeUnitId))) {
      eligible = false;
      reason = "ของรางวัลนี้รับได้เฉพาะบางสาขา";
    }
    const haveStamps = r.stampCardId ? (stampsOf.get(r.stampCardId) ?? 0) : 0;
    const affordable = (r.pointsCost === 0 || pointBalance >= r.pointsCost) && (!r.stampsCost || haveStamps >= r.stampsCost) && (r.stock === null || r.stock > 0);
    return {
      rewardId: r.id,
      name: r.name,
      kind: r.kind,
      pointsCost: r.pointsCost,
      stampsCost: r.stampsCost ?? undefined,
      stampCardName: r.stampCardId ? cardNameOf.get(r.stampCardId) : undefined,
      stock: r.stock,
      eligible,
      affordable,
      reason,
    };
  });
}

// ───────────────────────── ขอบเขต — resolve จาก MEMBER systemId (หน้า/action ใช้ตัวนี้) ─────────────────────────

/**
 * หน้า/action ของโมดูลสมาชิกอยู่ใต้ `/member/rewards` ซึ่งใช้ **MEMBER systemId** เป็น `[id]` ของ route
 * แต่ตาราง Reward ผูกกับ **REWARD systemId** (คนละ AppSystem — เหมือน point/stamp) ⇒ ต้อง resolve ก่อนเสมอ
 * คืน `null` เมื่อร้านนี้ยังไม่ได้ตั้งค่าระบบรางวัลผูกกับสาขาของระบบสมาชิกนี้เลย
 */
export async function resolveRewardCtx(tenantId: string, memberSystemId: string, actorUserId: string | null): Promise<RewardCtx | null> {
  const memberUnits = await prisma.appSystemUnit.findMany({ where: { tenantId, systemId: memberSystemId }, select: { unitId: true } });
  if (memberUnits.length === 0) return null;
  const unitIds = memberUnits.map((u) => u.unitId);
  const rewardLink = await prisma.appSystemUnit.findFirst({ where: { tenantId, type: "REWARD", unitId: { in: unitIds } }, select: { systemId: true } });
  if (!rewardLink) return null;
  const pointLink = await prisma.appSystemUnit.findFirst({ where: { tenantId, type: "POINT", unitId: { in: unitIds } }, select: { systemId: true } });
  return { tenantId, systemId: rewardLink.systemId, memberSystemId, pointSystemId: pointLink?.systemId ?? "", actorUserId };
}
