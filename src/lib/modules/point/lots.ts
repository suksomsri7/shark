// lots.ts — ล็อตแต้ม: ได้แต้ม (earnWithLot) · ใช้แต้มแบบ FIFO (burnFifo) · กลับรายการ (reverseWithLots)
//            · หมดอายุ (expireDue) · ใกล้หมดอายุ + แจ้งเตือน (expiringSoon / notifyExpiring)
//
// WO M2.1 · พิมพ์เขียว docs/modules/06-member-v2.md §4.3 §5.5 §7.1 §7.5 §11.4
//
// กติกาประจำไฟล์
//   • ctx = { tenantId, systemId (= ระบบแต้ม), memberSystemId?, actorUserId? }
//   • prisma ดิบผ่าน `./internal` (ซึ่งผ่าน `./db`) เท่านั้น — จุดเดียวของโมดูล (fitness F5.1)
//   • ข้ามโมดูลผ่าน facade เท่านั้น: `@/lib/modules/member` (สิทธิ์ระดับ "แต้มไม่มีวันหมดอายุ")
//   • ทุกฟังก์ชันที่เขียนเงิน/แต้ม ต้อง idempotent ผ่าน `idempotencyKey` — ยิงซ้ำไม่เบิ้ล
//
// 🔴 ทำไม "ล็อต" ไม่ใช่ยอดก้อนเดียว: §11.4 บังคับว่า BURN ต้องตัดล็อตที่หมดอายุเร็วสุดก่อน
//    และ void บิลต้องคืนแต้มกลับ "ล็อตเดิม" (ไม่ใช่ต่ออายุให้ลูกค้าฟรี) ⇒ ต้องรู้ว่าแต้มแต่ละก้อนมาจากไหน
// 🔴 ยอดติดลบยอมได้ (§11.4): void บิลที่ลูกค้าใช้แต้มไปแล้ว → ล็อต remaining ติดลบ · ล็อตถัดไปหักก่อน

import { emitOutbox } from "@/lib/core/outbox";
import { benefitsFor } from "@/lib/modules/member";
import {
  addMonths,
  balanceIn,
  endOfBkkYear,
  getSettings,
  pointError,
  prisma,
  readSettings,
  withTx,
  writeLedger,
  type Client,
  type PointCtx,
} from "./internal";

export type { PointCtx };

const DAY_MS = 24 * 60 * 60 * 1000;
/** ล็อตที่คืนจากการ void บิล แต่ล็อตต้นทางหมดอายุไปแล้ว → ให้ล็อตใหม่อายุเท่านี้ (§11.4) */
const RESTORE_LOT_DAYS = 30;
/** ขนาดชุดของ cron หมดอายุ (§12: 100,000 ล็อต ≤ 5 นาที · batch 1000) */
const EXPIRE_BATCH = 1000;

export type EarnBreakdownRow = { kind: string; ruleId?: string | null; points: number; note?: string };

export type EarnWithLotInput = {
  customerId: string;
  points: number;
  refType: string;
  refId: string;
  idempotencyKey: string;
  unitId?: string | null;
  ruleId?: string | null;
  multiplier?: number | null;
  breakdown?: EarnBreakdownRow[];
  /** ระบุวันหมดอายุเอง (M2.2 ปรับ/แจกแต้มมือ) — ไม่ส่ง = คิดจากการตั้งค่า/ระดับของสมาชิก */
  expiresAt?: Date | null;
  reason?: string;
};

export type EarnWithLotResult = { ledgerId: string; lotId: string; expiresAt: Date | null; balance: number };

export type BurnFifoInput = {
  customerId: string;
  points: number;
  refType: string;
  refId: string;
  idempotencyKey: string;
  unitId?: string | null;
  reason?: string;
};

export type LotUse = { lotId: string; points: number };
export type BurnFifoResult = { ledgerId: string; lotsUsed: LotUse[]; balance: number };

export type ExpiringLot = { customerId: string; lotId: string; points: number; expiresAt: Date; daysLeft: number };

type CustomerRow = { id: string; memberSystemId: string | null; tierDefId: string | null };

async function findCustomer(client: Client, ctx: PointCtx, customerId: string): Promise<CustomerRow> {
  const row = await client.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId },
    select: { id: true, memberSystemId: true, tierDefId: true },
  });
  if (!row) throw pointError("ไม่พบสมาชิกคนนี้ในร้านนี้ — ตรวจว่าเลือกสมาชิกถูกคนแล้วหรือยัง");
  return row;
}

/**
 * ระดับของสมาชิกให้สิทธิ์ "แต้มไม่มีวันหมดอายุ" ไหม (TierBenefitType.NO_POINT_EXPIRY)
 * อ่านผ่าน facade `member` เท่านั้น (fitness F2 เส้น point→member) — ไม่ล้วงตารางระดับเอง
 */
async function hasNoExpiryBenefit(ctx: PointCtx, customer: CustomerRow): Promise<boolean> {
  const memberSystemId = ctx.memberSystemId ?? customer.memberSystemId;
  if (!memberSystemId) return false;
  try {
    const benefits = await benefitsFor({ tenantId: ctx.tenantId, systemId: memberSystemId, actorUserId: null }, customer.id);
    return benefits.noPointExpiry === true;
  } catch {
    // สมาชิกอยู่คนละระบบ/ยังไม่มีระดับ → ถือว่าไม่มีสิทธิ์ยกเว้น (ไม่ทำให้การให้แต้มล้ม)
    return false;
  }
}

/** วันหมดอายุของล็อตใหม่ ตาม settings + สิทธิ์ระดับ (§5.5) */
async function resolveExpiry(
  ctx: PointCtx,
  customer: CustomerRow,
  settings: { expiryMode: "MONTHS" | "END_OF_YEAR" | "NEVER"; expiryMonths: number },
  earnedAt: Date,
  explicit: Date | null | undefined,
): Promise<Date | null> {
  if (explicit !== undefined) return explicit;
  if (await hasNoExpiryBenefit(ctx, customer)) return null;
  if (settings.expiryMode === "NEVER") return null;
  if (settings.expiryMode === "END_OF_YEAR") return endOfBkkYear(earnedAt);
  return addMonths(earnedAt, settings.expiryMonths);
}

// ───────────────────────── ได้แต้ม ─────────────────────────

/**
 * ให้แต้ม 1 ครั้ง = ledger EARN 1 แถว + PointLot 1 ใบ (ผูกกันสองทาง)
 * ผู้เรียกเป็นคนคิดจำนวนแต้มมาแล้ว (computeEarn ของ `rules.ts`) — ที่นี่ไม่คิดแต้มซ้ำ
 */
export async function earnWithLot(
  ctx: PointCtx,
  input: EarnWithLotInput,
  client: Client = prisma,
): Promise<EarnWithLotResult> {
  if (!Number.isInteger(input.points) || input.points <= 0) {
    throw pointError("จำนวนแต้มที่จะให้ต้องเป็นจำนวนเต็มมากกว่า 0");
  }
  const customer = await findCustomer(client, ctx, input.customerId);

  // ยิงซ้ำคีย์เดิม → คืนล็อต/รายการเดิม (ตรวจก่อนเปิด tx เพื่อไม่ถือล็อกฐานข้อมูลโดยเปล่าประโยชน์)
  const existing = await client.pointLedger.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing?.lotId) {
    return {
      ledgerId: existing.id,
      lotId: existing.lotId,
      expiresAt: existing.expiresAt,
      balance: await balanceIn(client, ctx.systemId, input.customerId),
    };
  }

  const settings = await getSettings(client, ctx.tenantId);
  const earnedAt = new Date();
  const expiresAt = await resolveExpiry(ctx, customer, settings, earnedAt, input.expiresAt);

  return withTx(client, async (tx) => {
    const led = await writeLedger(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      customerId: input.customerId,
      unitId: input.unitId ?? null,
      delta: input.points,
      type: "EARN",
      reason: input.reason ?? "สะสมแต้ม",
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: input.idempotencyKey,
      expiresAt,
      multiplier: input.multiplier ?? null,
      ruleId: input.ruleId ?? null,
      ...(input.breakdown ? { data: { breakdown: input.breakdown } } : {}),
    });
    if (led.duplicated) {
      const row = await tx.pointLedger.findUnique({ where: { id: led.ledgerId } });
      if (row?.lotId) return { ledgerId: row.id, lotId: row.lotId, expiresAt: row.expiresAt, balance: led.balance };
    }
    const lot = await tx.pointLot.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        customerId: input.customerId,
        ledgerId: led.ledgerId,
        points: input.points,
        remaining: input.points,
        earnedAt,
        expiresAt,
      },
    });
    await tx.pointLedger.update({ where: { id: led.ledgerId }, data: { lotId: lot.id } });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "point.earned",
      idempotencyKey: `point.earned:${led.ledgerId}`,
      systemId: ctx.systemId,
      unitId: input.unitId ?? null,
      payload: {
        customerId: input.customerId,
        points: input.points,
        lotId: lot.id,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        refType: input.refType,
        refId: input.refId,
      },
    });
    return { ledgerId: led.ledgerId, lotId: lot.id, expiresAt, balance: led.balance };
  });
}

// ───────────────────────── ใช้แต้ม (FIFO) ─────────────────────────

/** อ่านว่ารายการ BURN นี้ไปตัดล็อตไหนบ้าง (`PointLedger.data.lots`) — รูปเก่า/ว่าง = คืนลิสต์เปล่า */
export function usesOf(data: unknown): LotUse[] {
  if (!data || typeof data !== "object") return [];
  const lots = (data as { lots?: unknown }).lots;
  if (!Array.isArray(lots)) return [];
  const out: LotUse[] = [];
  for (const row of lots) {
    if (!row || typeof row !== "object") continue;
    const lotId = (row as { lotId?: unknown }).lotId;
    const points = (row as { points?: unknown }).points;
    if (typeof lotId === "string" && typeof points === "number") out.push({ lotId, points });
  }
  return out;
}

/**
 * ตัดแต้มโดยกินล็อตที่ **หมดอายุเร็วที่สุดก่อน** (ล็อตที่ไม่มีวันหมดอายุอยู่ท้ายสุด)
 * เก็บว่าไปกินล็อตไหนเท่าไรไว้ใน `PointLedger.data.lots` — ตอน void บิลจะได้คืนกลับที่เดิมได้
 */
export async function burnFifo(ctx: PointCtx, input: BurnFifoInput, client: Client = prisma): Promise<BurnFifoResult> {
  if (!Number.isInteger(input.points) || input.points <= 0) {
    throw pointError("จำนวนแต้มที่จะใช้ต้องเป็นจำนวนเต็มมากกว่า 0");
  }
  const existing = await client.pointLedger.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    return {
      ledgerId: existing.id,
      lotsUsed: usesOf(existing.data),
      balance: await balanceIn(client, ctx.systemId, input.customerId),
    };
  }

  return withTx(client, async (tx) => {
    const current = await balanceIn(tx, ctx.systemId, input.customerId);
    if (current < input.points) {
      throw pointError(`แต้มคงเหลือไม่พอ (มี ${current} แต้ม ต้องใช้ ${input.points} แต้ม)`);
    }
    const lots = await tx.pointLot.findMany({
      where: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        customerId: input.customerId,
        expiredAt: null,
        remaining: { gt: 0 },
      },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { earnedAt: "asc" }],
    });
    const used: LotUse[] = [];
    let left = input.points;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(lot.remaining, left);
      used.push({ lotId: lot.id, points: take });
      left -= take;
    }
    const led = await writeLedger(tx, {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      customerId: input.customerId,
      unitId: input.unitId ?? null,
      delta: -input.points,
      type: "BURN",
      reason: input.reason ?? "ใช้แต้ม",
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: input.idempotencyKey,
      data: { lots: used, lotIds: used.map((u) => u.lotId) },
    });
    if (led.duplicated) return { ledgerId: led.ledgerId, lotsUsed: used, balance: led.balance };
    for (const u of used) {
      await tx.pointLot.update({ where: { id: u.lotId }, data: { remaining: { decrement: u.points } } });
    }
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "point.burned",
      idempotencyKey: `point.burned:${led.ledgerId}`,
      systemId: ctx.systemId,
      unitId: input.unitId ?? null,
      payload: {
        customerId: input.customerId,
        points: input.points,
        lotIds: used.map((u) => u.lotId),
        refType: input.refType,
        refId: input.refId,
      },
    });
    return { ledgerId: led.ledgerId, lotsUsed: used, balance: led.balance };
  });
}

// ───────────────────────── กลับรายการ (void บิล) ─────────────────────────

export type ReverseInput = { refType: string; refId: string; idempotencyKey: string; reason?: string };

/**
 * กลับรายการแต้มทั้งหมดของ ref หนึ่ง (void บิล) โดย **คืนเข้าล็อตเดิม** (§11.4)
 *   • กลับ BURN → คืน remaining เข้าล็อตที่ถูกตัดไป · ล็อตนั้นหมดอายุแล้ว → ล็อตใหม่อายุ 30 วัน
 *   • กลับ EARN → หัก remaining ของล็อตนั้นคืน (ติดลบได้ ถ้าลูกค้าใช้แต้มก้อนนั้นไปแล้ว)
 */
export async function reverseWithLots(
  ctx: PointCtx,
  input: ReverseInput,
  client: Client = prisma,
): Promise<{ reversed: number }> {
  const dup = await client.pointLedger.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey } },
  });
  if (dup) return { reversed: 0 };

  const entries = await client.pointLedger.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      refType: input.refType,
      refId: input.refId,
      type: { in: ["EARN", "BURN"] },
    },
    orderBy: { createdAt: "asc" },
  });
  if (entries.length === 0) return { reversed: 0 };

  const now = new Date();
  return withTx(client, async (tx) => {
    let reversed = 0;
    for (const [i, entry] of entries.entries()) {
      const key = i === 0 ? input.idempotencyKey : `${input.idempotencyKey}:${i}`;
      const led = await writeLedger(tx, {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        customerId: entry.customerId,
        unitId: entry.unitId,
        delta: -entry.delta,
        type: "REVERSE",
        reason: input.reason ?? "กลับรายการ",
        refType: input.refType,
        refId: input.refId,
        idempotencyKey: key,
        lotId: entry.type === "EARN" ? entry.lotId : null,
      });
      if (led.duplicated) continue;
      reversed += 1;

      if (entry.type === "EARN") {
        if (entry.lotId) {
          await tx.pointLot.update({ where: { id: entry.lotId }, data: { remaining: { decrement: entry.delta } } });
        }
        continue;
      }
      // BURN → คืนเข้าล็อตเดิมทีละใบ
      for (const use of usesOf(entry.data)) {
        const lot = await tx.pointLot.findUnique({ where: { id: use.lotId } });
        const dead = !lot || lot.expiredAt !== null || (lot.expiresAt !== null && lot.expiresAt.getTime() <= now.getTime());
        if (!dead) {
          await tx.pointLot.update({ where: { id: use.lotId }, data: { remaining: { increment: use.points } } });
          continue;
        }
        await tx.pointLot.create({
          data: {
            tenantId: ctx.tenantId,
            systemId: ctx.systemId,
            customerId: entry.customerId,
            ledgerId: led.ledgerId,
            points: use.points,
            remaining: use.points,
            earnedAt: now,
            expiresAt: new Date(now.getTime() + RESTORE_LOT_DAYS * DAY_MS),
          },
        });
      }
    }
    return { reversed };
  });
}

// ───────────────────────── หมดอายุ ─────────────────────────

/**
 * ตัดล็อตที่ถึงกำหนดหมดอายุ (cron รายวัน) — `ctx` = null คือกวาดทุกร้าน
 * idempotent: ล็อตที่ตัดแล้วมี `expiredAt` ⇒ รอบถัดไปไม่หยิบซ้ำ · คีย์ ledger ผูกกับ lot.id
 */
export async function expireDue(
  ctx: PointCtx | null,
  now: Date = new Date(),
): Promise<{ lots: number; points: number; customers: number }> {
  const scope = ctx ? { tenantId: ctx.tenantId, systemId: ctx.systemId } : {};
  const customers = new Set<string>();
  let lotsDone = 0;
  let pointsDone = 0;

  // วนเป็นชุดจนกว่าจะไม่เหลือ (ห้ามหยิบชุดเดียวแล้วเลิก — บทเรียนคิวตัน)
  for (;;) {
    const batch = await prisma.pointLot.findMany({
      where: { ...scope, expiredAt: null, remaining: { gt: 0 }, expiresAt: { not: null, lte: now } },
      orderBy: { expiresAt: "asc" },
      take: EXPIRE_BATCH,
    });
    if (batch.length === 0) break;
    for (const lot of batch) {
      // ทีละล็อตใน transaction สั้น ๆ — ร้านใหญ่ 100,000 ล็อตต้องไม่ถือล็อกยาว
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.pointLot.findUnique({ where: { id: lot.id } });
        if (!fresh || fresh.expiredAt !== null || fresh.remaining <= 0) return;
        await writeLedger(tx, {
          tenantId: fresh.tenantId,
          systemId: fresh.systemId,
          customerId: fresh.customerId,
          delta: -fresh.remaining,
          type: "EXPIRE",
          reason: "แต้มหมดอายุ",
          refType: "POINT_LOT",
          refId: fresh.id,
          idempotencyKey: `point.expire:${fresh.id}`,
          lotId: fresh.id,
          expiresAt: fresh.expiresAt,
        });
        await tx.pointLot.update({ where: { id: fresh.id }, data: { remaining: 0, expiredAt: now } });
        await emitOutbox(tx, {
          tenantId: fresh.tenantId,
          type: "point.expired",
          idempotencyKey: `point.expired:${fresh.id}`,
          systemId: fresh.systemId,
          payload: {
            customerId: fresh.customerId,
            points: fresh.remaining,
            lotId: fresh.id,
            expiresAt: fresh.expiresAt ? fresh.expiresAt.toISOString() : null,
          },
        });
        lotsDone += 1;
        pointsDone += fresh.remaining;
        customers.add(fresh.customerId);
      });
    }
    if (batch.length < EXPIRE_BATCH) break;
  }
  return { lots: lotsDone, points: pointsDone, customers: customers.size };
}

/** ล็อตที่จะหมดอายุภายใน N วัน (เรียงใกล้หมดก่อน) — หน้ากระเป๋าแต้ม/แผงขวาโปรไฟล์ใช้ตัวนี้ */
export async function expiringSoon(
  ctx: PointCtx,
  input: { customerId?: string; days: number },
  now: Date = new Date(),
): Promise<ExpiringLot[]> {
  const days = Math.max(0, Math.floor(input.days));
  const until = new Date(now.getTime() + days * DAY_MS);
  const rows = await prisma.pointLot.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      expiredAt: null,
      remaining: { gt: 0 },
      expiresAt: { not: null, gte: now, lte: until },
    },
    orderBy: { expiresAt: "asc" },
  });
  return rows.flatMap((lot) =>
    lot.expiresAt
      ? [
          {
            customerId: lot.customerId,
            lotId: lot.id,
            points: lot.remaining,
            expiresAt: lot.expiresAt,
            daysLeft: Math.floor((lot.expiresAt.getTime() - now.getTime()) / DAY_MS),
          },
        ]
      : [],
  );
}

/**
 * แจ้งเตือน "แต้มใกล้หมดอายุ" ตาม `PointSettings.remindDays` (cron รายวัน · `ctx` = null คือทุกร้าน)
 * ยิง event `point.expiring` ต่อ **ล็อต × จำนวนวันที่เหลือ** ⇒ รันซ้ำวันเดียวกันไม่ส่งซ้ำ
 */
export async function notifyExpiring(ctx: PointCtx | null, now: Date = new Date()): Promise<{ notified: number }> {
  let groups: { tenantId: string; systemId: string }[];
  if (ctx) {
    groups = [{ tenantId: ctx.tenantId, systemId: ctx.systemId }];
  } else {
    const rows = await prisma.pointLot.groupBy({
      by: ["tenantId", "systemId"],
      where: { expiredAt: null, remaining: { gt: 0 }, expiresAt: { not: null, gte: now } },
    });
    groups = rows.map((r) => ({ tenantId: r.tenantId, systemId: r.systemId }));
  }

  let notified = 0;
  for (const group of groups) {
    const settings = await readSettings(prisma, group.tenantId);
    const remindDays = [...new Set(settings.remindDays)].filter((d) => Number.isInteger(d) && d >= 0).slice(0, 5);
    for (const d of remindDays) {
      const from = new Date(now.getTime() + d * DAY_MS);
      const to = new Date(now.getTime() + (d + 1) * DAY_MS);
      const rows = await prisma.pointLot.findMany({
        where: {
          tenantId: group.tenantId,
          systemId: group.systemId,
          expiredAt: null,
          remaining: { gt: 0 },
          expiresAt: { gte: from, lt: to },
        },
        take: EXPIRE_BATCH,
      });
      for (const lot of rows) {
        const key = `point.expiring:${lot.id}:${d}`;
        const already = await prisma.outboxEvent.findUnique({
          where: { tenantId_idempotencyKey: { tenantId: lot.tenantId, idempotencyKey: key } },
          select: { id: true },
        });
        if (already) continue;
        await emitOutbox(prisma, {
          tenantId: lot.tenantId,
          type: "point.expiring",
          idempotencyKey: key,
          systemId: lot.systemId,
          payload: {
            customerId: lot.customerId,
            points: lot.remaining,
            lotId: lot.id,
            expiresAt: lot.expiresAt ? lot.expiresAt.toISOString() : null,
            daysLeft: d,
          },
        });
        notified += 1;
      }
    }
  }
  return { notified };
}
