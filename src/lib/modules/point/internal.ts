// internal.ts — ของใช้ร่วมภายในโมดูลแต้ม (ไม่ export ออกนอกโมดูล · ไม่มีตรรกะธุรกิจของ WO ไหนโดยเฉพาะ)
//
// ทำไมแยกไฟล์ (M2.1): `service.ts` (v1) กับ `lots.ts`/`rules.ts` (v2) ต้องใช้ตัวเดียวกัน
//   — ตัวเขียน ledger + ตัวนับยอด (applyDelta) · ตัวอ่านการตั้งค่า · ตัวคิด "วันไทย"
//   ถ้าปล่อยให้ v2 import จาก v1 จะเกิดวงกลม (v1 ต้องเรียก v2 เพื่อสร้างล็อตให้ POS เดิมด้วย)
//
// 🔴 กติกาเวลา: ทุกอย่างที่เป็น "วัน/ช่วงเวลาของร้าน" คิดด้วยเวลาไทย (UTC+7) เสมอ
//    ห้ามใช้ getDay()/getHours() บน Date ดิบ — บนเซิร์ฟเวอร์ UTC จะเพี้ยนไป 1 วัน
//    (บทเรียนจริง: reference_thai_date_getday_trap)

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

export type Client = PrismaClient | Prisma.TransactionClient;

/** ขอบเขตการทำงานของโมดูลแต้ม — `systemId` = ระบบแต้ม (ไม่ใช่ระบบสมาชิก) */
export type PointCtx = {
  tenantId: string;
  systemId: string;
  /** ระบบสมาชิกที่ผูกกัน (ถ้าผู้เรียกรู้) — ไม่ส่งมาก็หาเองจาก `Customer.memberSystemId` */
  memberSystemId?: string | null;
  actorUserId?: string | null;
};

/** error ของโมดูลแต้ม — ข้อความไทยเสมอ ไม่โทษผู้ใช้ */
export function pointError(message: string): Error {
  return new Error(message);
}

export async function withTx<T>(client: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    return (client as PrismaClient).$transaction((tx) => fn(tx));
  }
  return fn(client);
}

// ───────────────────────── เวลาไทย ─────────────────────────

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** เลขลำดับ "วันไทย" (หารลงตัว) — ใช้เทียบว่าคนละวันไหมโดยไม่ต้องแปลง timezone */
export function bkkDayIndex(d: Date): number {
  return Math.floor((d.getTime() + BKK_OFFSET_MS) / DAY_MS);
}

/** เวลา 00:00 ของ "วันไทย" ที่ `d` อยู่ (คืนเป็น UTC) */
export function bkkDayStart(d: Date): Date {
  return new Date(bkkDayIndex(d) * DAY_MS - BKK_OFFSET_MS);
}

/** วันในสัปดาห์แบบไทย (0 = อาทิตย์) */
export function bkkDayOfWeek(d: Date): number {
  return new Date(d.getTime() + BKK_OFFSET_MS).getUTCDay();
}

/** นาทีนับจากเที่ยงคืนของเวลาไทย (0–1439) */
export function bkkMinuteOfDay(d: Date): number {
  const shifted = new Date(d.getTime() + BKK_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** 31 ธ.ค. 23:59:59 เวลาไทย ของปีที่ `d` อยู่ (คืนเป็น UTC = 16:59:59Z) */
export function endOfBkkYear(d: Date): Date {
  const shifted = new Date(d.getTime() + BKK_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), 11, 31, 23, 59, 59) - BKK_OFFSET_MS);
}

/** บวกเดือนแบบปฏิทิน (31 ม.ค. + 1 เดือน = 3 มี.ค. ตามพฤติกรรมมาตรฐานของ Date — ยอมรับได้กับวันหมดอายุแต้ม) */
export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/** "HH:mm" → นาทีนับจากเที่ยงคืน (ผิดรูป → null) */
export function parseHhMm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// ───────────────────────── การตั้งค่าแต้ม (v2) ─────────────────────────

export type PointSettingsV2 = {
  satangPerPoint: number;
  active: boolean;
  expiryMode: "MONTHS" | "END_OF_YEAR" | "NEVER";
  expiryMonths: number;
  remindDays: number[];
  burnRateSatang: number;
  burnMinPoints: number;
  burnMaxPct: number;
  transferEnabled: boolean;
  transferMonthlyCap: number | null;
  adjustApprovalOver: number | null;
  earnBase: string;
  excludeGiftCard: boolean;
  excludeVoucher: boolean;
  dailyCap: number | null;
};

/** ค่าปริยายเดียวกับ `@default` ใน schema — ใช้ตอนร้านยังไม่มีแถว และตอน dry-run ที่ห้ามเขียน */
export const DEFAULT_POINT_SETTINGS: PointSettingsV2 = Object.freeze({
  satangPerPoint: 2500,
  active: true,
  expiryMode: "MONTHS",
  expiryMonths: 12,
  remindDays: [30, 7],
  burnRateSatang: 10,
  burnMinPoints: 100,
  burnMaxPct: 50,
  transferEnabled: false,
  transferMonthlyCap: null,
  adjustApprovalOver: null,
  earnBase: "NET",
  excludeGiftCard: true,
  excludeVoucher: true,
  dailyCap: null,
});

/** อ่านการตั้งค่า — **สร้างแถวให้ถ้ายังไม่มี** (พฤติกรรมเดิมของ v1) */
export async function getSettings(client: Client, tenantId: string) {
  const found = await client.pointSettings.findUnique({ where: { tenantId } });
  if (found) return found;
  return client.pointSettings.create({ data: { tenantId } });
}

/** อ่านการตั้งค่าแบบ **ไม่เขียนอะไรเลย** (backfill --dry-run · cron ข้ามร้าน) */
export async function readSettings(client: Client, tenantId: string): Promise<PointSettingsV2> {
  const found = await client.pointSettings.findUnique({ where: { tenantId } });
  if (!found) return { ...DEFAULT_POINT_SETTINGS, remindDays: [...DEFAULT_POINT_SETTINGS.remindDays] };
  return {
    satangPerPoint: found.satangPerPoint,
    active: found.active,
    expiryMode: found.expiryMode,
    expiryMonths: found.expiryMonths,
    remindDays: found.remindDays,
    burnRateSatang: found.burnRateSatang,
    burnMinPoints: found.burnMinPoints,
    burnMaxPct: found.burnMaxPct,
    transferEnabled: found.transferEnabled,
    transferMonthlyCap: found.transferMonthlyCap,
    adjustApprovalOver: found.adjustApprovalOver,
    earnBase: found.earnBase,
    excludeGiftCard: found.excludeGiftCard,
    excludeVoucher: found.excludeVoucher,
    dailyCap: found.dailyCap,
  };
}

// ───────────────────────── ledger + ยอดคงเหลือ ─────────────────────────

export async function balanceIn(tx: Client, systemId: string, customerId: string): Promise<number> {
  const b = await tx.pointBalance.findUnique({ where: { systemId_customerId: { systemId, customerId } } });
  return b?.balance ?? 0;
}

export type LedgerWrite = {
  tenantId: string;
  systemId: string;
  customerId: string;
  unitId?: string | null;
  delta: number;
  // M2.2 — +TRANSFER (โอนแต้มระหว่างสมาชิก · แยกจาก EARN/BURN เพราะไม่นับในเพดานแต้ม/วันของ computeEarn)
  type: "EARN" | "BURN" | "ADJUST" | "REVERSE" | "EXPIRE" | "TRANSFER";
  reason?: string | null;
  refType?: string | null;
  refId?: string | null;
  idempotencyKey: string;
  lotId?: string | null;
  expiresAt?: Date | null;
  multiplier?: number | null;
  ruleId?: string | null;
  data?: Prisma.InputJsonValue;
};

/**
 * เขียน 1 รายการลง ledger + ขยับยอดคงเหลือ **ใน tx เดียวกัน** (ตัวนับร่วมห้ามแยกคำสั่ง)
 * คีย์ซ้ำ = ไม่เขียนอะไรเลย คืนยอดปัจจุบัน (`duplicated: true`) — กันยิงซ้ำจากทุกทางเข้า
 */
export async function writeLedger(
  tx: Client,
  input: LedgerWrite,
): Promise<{ ledgerId: string; balance: number; duplicated: boolean }> {
  const dup = await tx.pointLedger.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
  });
  if (dup) {
    return { ledgerId: dup.id, balance: await balanceIn(tx, input.systemId, input.customerId), duplicated: true };
  }
  const row = await tx.pointLedger.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      customerId: input.customerId,
      unitId: input.unitId ?? null,
      delta: input.delta,
      type: input.type,
      reason: input.reason ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      idempotencyKey: input.idempotencyKey,
      lotId: input.lotId ?? null,
      expiresAt: input.expiresAt ?? null,
      multiplier: input.multiplier ?? null,
      ruleId: input.ruleId ?? null,
      ...(input.data === undefined ? {} : { data: input.data }),
    },
  });
  const updated = await tx.pointBalance.upsert({
    where: { systemId_customerId: { systemId: input.systemId, customerId: input.customerId } },
    create: { tenantId: input.tenantId, systemId: input.systemId, customerId: input.customerId, balance: input.delta },
    update: { balance: { increment: input.delta } },
  });
  return { ledgerId: row.id, balance: updated.balance, duplicated: false };
}

/** รูปเดิมของ v1 — คืนแค่ยอดคงเหลือ (คงไว้ให้ `service.ts` เรียกเหมือนเดิม) */
export async function applyDelta(tx: Client, input: LedgerWrite): Promise<number> {
  const r = await writeLedger(tx, input);
  return r.balance;
}

/** prisma กลางของโมดูล (ผู้เรียกที่ไม่ได้อยู่ใน tx) */
export { prisma };
