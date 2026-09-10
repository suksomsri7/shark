// Point (แต้ม) — scope ตาม systemId (ระบบแต้ม). Point คิดแต้มเอง (contract 2.2)
//
// 🔴 M2.1: ตัวช่วยภายใน (withTx / getSettings / balanceIn / applyDelta) ย้ายไป `./internal`
//    เพราะ `lots.ts` (v2) ต้องใช้ตัวเดียวกัน และ v1 ในไฟล์นี้ก็ต้องเรียก v2 กลับ (สร้างล็อตให้ POS เดิม)
//    ⇒ วางไว้ตรงกลางกันวงกลม · prisma ดิบเข้าผ่าน `./db` ที่เดียว (fitness F5.1)
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  addMonths,
  applyDelta,
  balanceIn,
  endOfBkkYear,
  getSettings,
  pointError,
  prisma,
  withTx,
  writeLedger,
  type Client,
} from "./internal";
import { earnWithLot, usesOf } from "./lots";

export async function earn(
  input: {
    tenantId: string;
    systemId: string;
    customerId: string;
    unitId?: string;
    amountSatang: number;
    sourceModule: string;
    refType: string;
    refId: string;
    idempotencyKey: string;
  },
  client: Client = prisma,
): Promise<{ pointsEarned: number; balance: number }> {
  return withTx(client, async (tx) => {
    const settings = await getSettings(tx, input.tenantId);
    const cur = await balanceIn(tx, input.systemId, input.customerId);
    if (!settings.active) return { pointsEarned: 0, balance: cur };
    const points = Math.floor(input.amountSatang / settings.satangPerPoint);
    if (points <= 0) return { pointsEarned: 0, balance: cur };
    // 🔴 M2.1: ทางเข้าเดิม (POS/จอง/ร้านเรียนฯ) ต้อง **สร้างล็อตด้วย** ไม่งั้นแต้มที่ได้หลังวันนี้
    //    จะไม่มีวันหมดอายุและ burnFifo ตัดไม่ได้ ⇒ ยอดคงเหลือกับผลรวมล็อตจะเพี้ยนกันทันที
    const r = await earnWithLot(
      { tenantId: input.tenantId, systemId: input.systemId },
      {
        customerId: input.customerId,
        points,
        refType: input.refType,
        refId: input.refId,
        idempotencyKey: input.idempotencyKey,
        unitId: input.unitId ?? null,
        reason: `สะสมจาก ${input.sourceModule}`,
      },
      tx,
    );
    return { pointsEarned: points, balance: r.balance };
  });
}

export async function burn(
  input: {
    tenantId: string;
    systemId: string;
    customerId: string;
    points: number;
    refType: string;
    refId: string;
    idempotencyKey: string;
  },
  client: Client = prisma,
): Promise<{ balance: number }> {
  if (input.points <= 0) throw new Error("points ต้อง > 0");
  return withTx(client, async (tx) => {
    const current = await balanceIn(tx, input.systemId, input.customerId);
    const dup = await tx.pointLedger.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (!dup && current < input.points) throw new Error("แต้มไม่พอ");
    const balance = await applyDelta(tx, {
      tenantId: input.tenantId,
      systemId: input.systemId,
      customerId: input.customerId,
      delta: -input.points,
      type: "BURN",
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: input.idempotencyKey,
    });
    return { balance };
  });
}

// คืนแต้มแบบเจาะจงจำนวน (ใช้ตอนยกเลิกการแลกรางวัล — คืนเท่า pointsCost ของรายการนั้น ๆ)
// ต่างจาก reverse() ที่กลับ "ทุก" รายการตาม refType+refId — credit คืนเป๊ะตามที่ระบุ + idempotent ผ่าน key
export async function credit(
  input: {
    tenantId: string;
    systemId: string;
    customerId: string;
    points: number;
    reason?: string;
    refType: string;
    refId: string;
    idempotencyKey: string;
  },
  client: Client = prisma,
): Promise<{ balance: number }> {
  if (input.points <= 0) throw new Error("points ต้อง > 0");
  return withTx(client, async (tx) => {
    const dup = await tx.pointLedger.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (dup) return { balance: await balanceIn(tx, input.systemId, input.customerId) };

    // 🔴 M2.1: แต้มที่คืนเข้ามาก็ต้องมีล็อตของตัวเอง ไม่งั้นยอดคงเหลือจะมากกว่าผลรวมล็อต
    //    (แล้ว burnFifo จะตัดไม่ครบ และ cron หมดอายุก็มองไม่เห็นแต้มก้อนนี้)
    const earnedAt = new Date();
    const expiresAt = await creditExpiry(tx, input.tenantId, earnedAt);
    const led = await writeLedger(tx, {
      tenantId: input.tenantId,
      systemId: input.systemId,
      customerId: input.customerId,
      delta: input.points,
      type: "REVERSE",
      reason: input.reason ?? "คืนแต้ม",
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: input.idempotencyKey,
      expiresAt,
    });
    if (led.duplicated) return { balance: led.balance };
    const lot = await tx.pointLot.create({
      data: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        customerId: input.customerId,
        ledgerId: led.ledgerId,
        points: input.points,
        remaining: input.points,
        earnedAt,
        expiresAt,
      },
    });
    await tx.pointLedger.update({ where: { id: led.ledgerId }, data: { lotId: lot.id } });
    return { balance: led.balance };
  });
}

/** วันหมดอายุของล็อตที่เกิดจาก `credit()` — ตามการตั้งค่าของร้าน (ไม่ดูสิทธิ์ระดับ: คืนแต้มไม่ใช่การขาย) */
async function creditExpiry(tx: Client, tenantId: string, at: Date): Promise<Date | null> {
  const settings = await getSettings(tx, tenantId);
  if (settings.expiryMode === "NEVER") return null;
  if (settings.expiryMode === "END_OF_YEAR") return endOfBkkYear(at);
  return addMonths(at, settings.expiryMonths);
}

export async function reverse(
  input: { tenantId: string; systemId: string; refType: string; refId: string; idempotencyKey: string },
  client: Client = prisma,
): Promise<void> {
  await withTx(client, async (tx) => {
    const entries = await tx.pointLedger.findMany({
      where: {
        tenantId: input.tenantId,
        systemId: input.systemId,
        refType: input.refType,
        refId: input.refId,
        type: { in: ["EARN", "BURN"] },
      },
    });
    if (entries.length === 0) return;
    // 🔴 M2.1: กันคืนล็อตซ้ำ — ถ้ารายการกลับรายการใบแรกมีอยู่แล้ว แปลว่ารอบนี้เคยทำไปแล้วทั้งชุด
    //    (ตัว ledger เองกันซ้ำอยู่แล้วด้วย idempotencyKey · ล็อตต้องมีด่านของตัวเองเพราะไม่มีคีย์)
    const done = await tx.pointLedger.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: `${input.idempotencyKey}:0` } },
    });
    if (done) return;

    const byCustomer = new Map<string, number>();
    for (const e of entries) byCustomer.set(e.customerId, (byCustomer.get(e.customerId) ?? 0) - e.delta);
    let i = 0;
    for (const [customerId, delta] of byCustomer) {
      if (delta === 0) continue;
      await applyDelta(tx, {
        tenantId: input.tenantId,
        systemId: input.systemId,
        customerId,
        delta,
        type: "REVERSE",
        reason: "กลับรายการ",
        refType: input.refType,
        refId: input.refId,
        idempotencyKey: `${input.idempotencyKey}:${i++}`,
      });
    }
    // คืนสภาพล็อตให้ตรงกับยอด (§11.4): EARN ที่ถูกกลับ → หักล็อตนั้นคืน · BURN ที่ถูกกลับ → เติมล็อตเดิม
    await restoreLots(tx, entries, new Date());
  });
}

/**
 * ปรับ `PointLot` ให้ตรงกับการกลับรายการของ `reverse()` (v1)
 * ล็อตที่หมดอายุไปแล้วไม่ปลุกกลับ — สร้างล็อตใหม่อายุ 30 วันแทน (§11.4 · ตัวเดียวกับ `reverseWithLots`)
 */
async function restoreLots(
  tx: Client,
  entries: { id: string; customerId: string; tenantId: string; systemId: string; type: string; delta: number; lotId: string | null; data: unknown }[],
  now: Date,
): Promise<void> {
  for (const e of entries) {
    if (e.type === "EARN") {
      if (e.lotId) await tx.pointLot.update({ where: { id: e.lotId }, data: { remaining: { decrement: e.delta } } });
      continue;
    }
    for (const use of usesOf(e.data)) {
      const lot = await tx.pointLot.findUnique({ where: { id: use.lotId } });
      const dead = !lot || lot.expiredAt !== null || (lot.expiresAt !== null && lot.expiresAt.getTime() <= now.getTime());
      if (!dead) {
        await tx.pointLot.update({ where: { id: use.lotId }, data: { remaining: { increment: use.points } } });
        continue;
      }
      await tx.pointLot.create({
        data: {
          tenantId: e.tenantId,
          systemId: e.systemId,
          customerId: e.customerId,
          ledgerId: e.id,
          points: use.points,
          remaining: use.points,
          earnedAt: now,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }
}

export async function getBalance(systemId: string, customerId: string): Promise<number> {
  return balanceIn(prisma, systemId, customerId);
}

// ── ตั้งค่าอัตราสะสม (tenant-scoped) ──
// อ่านค่าจริง (สร้าง default ให้ถ้ายังไม่มี) — UI ใช้ prefill ฟอร์ม
export async function getPointSettings(tenantId: string) {
  return getSettings(prisma, tenantId);
}

// ── บันทึกการตั้งค่าแต้ม (v2 · M2.1 §4.1) ──
// ส่งมาเฉพาะช่องที่จะแก้ก็ได้ — ช่องที่ไม่ส่งไม่ถูกแตะ · ช่องที่ไม่รู้จัก (id/createdAt) ถูกตัดทิ้ง
// 🔴 ตัวแรกรับได้ทั้ง `tenantId` (รูปเดิม WO Wave1-D) และ `{ tenantId }` (รูป ctx ของ v2)
//    ทั้งสองทางเข้ายังมีจริงในโค้ด (หน้าตั้งค่าเดิม + service ของระบบสมาชิก v2) — ไม่หักสัญญาเดิมทิ้ง
const SETTINGS_LABEL: Record<string, string> = {
  satangPerPoint: "อัตราสะสม (สตางค์ต่อแต้ม)",
  expiryMonths: "อายุแต้ม (เดือน)",
  remindDays: "วันแจ้งเตือนก่อนแต้มหมดอายุ",
  burnRateSatang: "มูลค่าแต้ม (สตางค์ต่อแต้ม)",
  burnMinPoints: "แต้มขั้นต่ำที่ใช้ได้",
  burnMaxPct: "ใช้แต้มได้ไม่เกินกี่เปอร์เซ็นต์ของบิล",
  transferMonthlyCap: "เพดานโอนแต้มต่อเดือน",
  adjustApprovalOver: "ปรับแต้มเกินเท่าไรต้องขออนุมัติ",
  earnBase: "ฐานคิดแต้ม",
  dailyCap: "เพดานแต้มต่อวัน",
};

const SETTINGS_SCHEMA = z.object({
  satangPerPoint: z.number().int().min(1).optional(),
  active: z.boolean().optional(),
  expiryMode: z.enum(["MONTHS", "END_OF_YEAR", "NEVER"]).optional(),
  expiryMonths: z.number().int().min(1).max(120).optional(),
  remindDays: z.array(z.number().int().min(0).max(3650)).max(5).optional(),
  burnRateSatang: z.number().int().min(1).optional(),
  burnMinPoints: z.number().int().min(0).optional(),
  burnMaxPct: z.number().int().min(0).max(100).optional(),
  transferEnabled: z.boolean().optional(),
  transferMonthlyCap: z.number().int().min(0).nullable().optional(),
  adjustApprovalOver: z.number().int().min(0).nullable().optional(),
  earnBase: z.enum(["NET", "GROSS"]).optional(),
  excludeGiftCard: z.boolean().optional(),
  excludeVoucher: z.boolean().optional(),
  dailyCap: z.number().int().min(0).nullable().optional(),
});

export type SetPointSettingsInput = z.input<typeof SETTINGS_SCHEMA>;

export async function setPointSettings(
  target: string | { tenantId: string },
  input: SetPointSettingsInput,
) {
  const tenantId = typeof target === "string" ? target : target.tenantId;
  const parsed = SETTINGS_SCHEMA.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const key = String(first?.path?.[0] ?? "");
    const label = SETTINGS_LABEL[key] ?? "ค่าที่กรอก";
    throw pointError(`ตั้งค่าแต้มไม่สำเร็จ — ช่อง “${label}” ยังไม่อยู่ในช่วงที่รองรับ ลองตรวจค่าอีกครั้ง`);
  }
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  const existing = await prisma.pointSettings.findUnique({ where: { tenantId } });
  if (existing) return prisma.pointSettings.update({ where: { tenantId }, data });
  return prisma.pointSettings.create({ data: { tenantId, ...data } });
}

// ── ปรับ/แจกแต้มด้วยมือ (พนักงาน) — type ADJUST ──
// delta > 0 = แจก · delta < 0 = หัก (กันแต้มติดลบ) · idempotent ผ่าน key (คีย์เดิมไม่เบิ้ล)
export async function adjustPoints(
  input: {
    tenantId: string;
    systemId: string;
    customerId: string;
    unitId?: string;
    delta: number;
    reason?: string;
    idempotencyKey: string;
  },
  client: Client = prisma,
): Promise<{ balance: number }> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error("จำนวนแต้มต้องเป็นจำนวนเต็มที่ไม่เท่ากับ 0");
  }
  return withTx(client, async (tx) => {
    // ยิงซ้ำคีย์เดิม → คืนยอดปัจจุบัน ไม่ทำรายการใหม่ (กันเบิ้ล + กัน guard พลาดตอน re-run)
    const dup = await tx.pointLedger.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (dup) return { balance: await balanceIn(tx, input.systemId, input.customerId) };
    if (input.delta < 0) {
      const cur = await balanceIn(tx, input.systemId, input.customerId);
      if (cur + input.delta < 0) throw new Error("แต้มคงเหลือไม่พอสำหรับการหัก");
    }
    const balance = await applyDelta(tx, {
      tenantId: input.tenantId,
      systemId: input.systemId,
      customerId: input.customerId,
      unitId: input.unitId,
      delta: input.delta,
      type: "ADJUST",
      reason: input.reason || (input.delta > 0 ? "แจกแต้มโดยพนักงาน" : "หักแต้มโดยพนักงาน"),
      idempotencyKey: input.idempotencyKey,
    });
    return { balance };
  });
}

// ── สมาชิกที่ปรับแต้มในระบบแต้มนี้ได้ — จากระบบสมาชิก (MEMBER) ที่ผูก unit เดียวกับระบบแต้ม ──
// pattern เดียวกับ reward.listRewardCustomers (แต่ resolve จากฝั่งระบบแต้ม)
export async function listPointCustomers(
  tenantId: string,
  pointSystemId: string,
): Promise<{ id: string; name: string | null; memberCode: string; phone: string | null }[]> {
  const pointUnits = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: pointSystemId },
    select: { unitId: true },
  });
  if (pointUnits.length === 0) return [];
  const memberLinks = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "MEMBER", unitId: { in: pointUnits.map((u) => u.unitId) } },
    select: { systemId: true },
  });
  const memberSystemIds = [...new Set(memberLinks.map((m) => m.systemId))];
  if (memberSystemIds.length === 0) return [];
  const rows = await prisma.customer.findMany({
    where: { tenantId, memberSystemId: { in: memberSystemIds } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, memberCode: true, phone: true },
  });
  return rows.map((c) => ({ ...c, memberCode: c.memberCode ?? "" }));
}

// รวมแต้มของลูกค้า จากระบบแต้มที่ผูกกับ unit เดียวกับระบบสมาชิกของลูกค้า
export type CustomerLedgerRow = {
  id: string;
  systemId: string;
  unitId: string | null;
  delta: number;
  type: string;
  reason: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: Date;
};

/**
 * รายการแต้มทั้งหมดของสมาชิก 1 คน (M1.7 — คำขอ "ขอสำเนาข้อมูลของฉัน" ตาม PDPA)
 * resolve ระบบแต้มด้วยกติกาเดียวกับ `getCustomerPoints` (ระบบ POINT ที่ผูกสาขาเดียวกับระบบสมาชิก)
 * ⇒ ไม่มีใครนอกโมดูลแต้มต้องรู้จักตาราง `PointLedger` เอง (fitness F2 · พิมพ์เขียว §5.11)
 */
export async function listCustomerLedger(
  tenantId: string,
  memberSystemId: string,
  customerId: string,
  take = 1000,
): Promise<CustomerLedgerRow[]> {
  const memberUnits = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: memberSystemId },
    select: { unitId: true },
  });
  if (memberUnits.length === 0) return [];
  const pointLinks = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "POINT", unitId: { in: memberUnits.map((u) => u.unitId) } },
    select: { systemId: true },
  });
  const pointSystemIds = [...new Set(pointLinks.map((p) => p.systemId))];
  if (pointSystemIds.length === 0) return [];
  const rows = await prisma.pointLedger.findMany({
    where: { tenantId, customerId, systemId: { in: pointSystemIds } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 5000),
  });
  return rows.map((r) => ({
    id: r.id,
    systemId: r.systemId,
    unitId: r.unitId,
    delta: r.delta,
    type: r.type,
    reason: r.reason,
    refType: r.refType,
    refId: r.refId,
    createdAt: r.createdAt,
  }));
}

export async function getCustomerPoints(
  tenantId: string,
  memberSystemId: string,
  customerId: string,
): Promise<number> {
  const memberUnits = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: memberSystemId },
    select: { unitId: true },
  });
  if (memberUnits.length === 0) return 0;
  const pointLinks = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "POINT", unitId: { in: memberUnits.map((u) => u.unitId) } },
    select: { systemId: true },
  });
  const pointSystemIds = [...new Set(pointLinks.map((p) => p.systemId))];
  if (pointSystemIds.length === 0) return 0;
  const balances = await prisma.pointBalance.findMany({
    where: { systemId: { in: pointSystemIds }, customerId },
    select: { balance: true },
  });
  return balances.reduce((s, b) => s + b.balance, 0);
}

// ═══════════════════════════ M2.2 — ผลกระทบ · settings เพิ่มเติม · หน้าจอ ═══════════════════════════
// พิมพ์เขียว §5.5 §11.4 — หน้า /member/points/* ทุกหน้ารู้จัก "ระบบสมาชิก" (id ใน URL) ไม่ใช่ "ระบบแต้ม"
// (คนละ AppSystem — ดู resolvePointSystemIds) ⇒ ทุกฟังก์ชันด้านล่างรับ memberSystemId แล้ว resolve เอง

/** systemId ของ "ระบบแต้ม" ทั้งหมดที่ผูกกับ "ระบบสมาชิก" นี้ (unit เดียวกัน) — ปกติมีระบบเดียว */
export async function resolvePointSystemIds(tenantId: string, memberSystemId: string): Promise<string[]> {
  const memberUnits = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: memberSystemId },
    select: { unitId: true },
  });
  if (memberUnits.length === 0) return [];
  const pointLinks = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "POINT", unitId: { in: memberUnits.map((u) => u.unitId) } },
    select: { systemId: true },
  });
  return [...new Set(pointLinks.map((p) => p.systemId))];
}

export type PointImpactPreview = {
  monthlyEarn: number;
  monthlyCostSatang: number;
  liabilitySatang: number;
  expiringIn90d: number;
};

/** การ์ด "ผลกระทบ" ของหน้าตั้งค่าแต้ม (ภาพ 16) — ประมาณจากยอดจริงเดือนนี้ ไม่ใช่สูตรทำนาย */
export async function previewPointImpact(ctx: { tenantId: string; systemId: string }): Promise<PointImpactPreview> {
  const settings = await getSettings(prisma, ctx.tenantId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const until90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const [earnAgg, balAgg, expAgg] = await Promise.all([
    prisma.pointLedger.aggregate({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "EARN", createdAt: { gte: since } },
      _sum: { delta: true },
    }),
    prisma.pointBalance.aggregate({ where: { systemId: ctx.systemId }, _sum: { balance: true } }),
    prisma.pointLot.aggregate({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, expiredAt: null, remaining: { gt: 0 }, expiresAt: { not: null, lte: until90 } },
      _sum: { remaining: true },
    }),
  ]);

  const monthlyEarn = earnAgg._sum.delta ?? 0;
  return {
    monthlyEarn,
    monthlyCostSatang: monthlyEarn * settings.burnRateSatang,
    liabilitySatang: (balAgg._sum.balance ?? 0) * settings.burnRateSatang,
    expiringIn90d: expAgg._sum.remaining ?? 0,
  };
}

/** ค่าตั้งค่าแต้มที่ไม่มีคอลัมน์ของตัวเอง — เก็บใน `AppSystem.settings.member.points` (ของระบบ "สมาชิก") */
export type PointExtras = {
  /** ใช้แต้มได้ที่ระบบไหนบ้าง (§5.5 "(ค) ใช้แต้ม") */
  burnAllowedAt: ("POS" | "BOOKING" | "LIFF")[];
  /** ค่าธรรมเนียมโอนแต้ม (แต้ม) — ยังไม่ถูกหักจริงใน `transfer.ts` (M2.2 คงไว้ที่ 0 ตามสัญญา feePoints) */
  transferFeePoints: number;
  /** โอนแต้มต้องยืนยัน OTP เสมอ */
  requireOtp: boolean;
};

const POINT_EXTRAS_BURN_AT = new Set(["POS", "BOOKING", "LIFF"]);

const DEFAULT_POINT_EXTRAS: PointExtras = { burnAllowedAt: ["POS", "BOOKING", "LIFF"], transferFeePoints: 0, requireOtp: true };

function pointExtrasOf(settings: unknown): PointExtras {
  const s = settings as { member?: { points?: Partial<PointExtras> } } | null;
  const raw = s?.member?.points;
  const burnAllowedAt = Array.isArray(raw?.burnAllowedAt)
    ? (raw.burnAllowedAt.filter((v): v is PointExtras["burnAllowedAt"][number] => typeof v === "string" && POINT_EXTRAS_BURN_AT.has(v)))
    : [...DEFAULT_POINT_EXTRAS.burnAllowedAt];
  return {
    burnAllowedAt: burnAllowedAt.length > 0 ? burnAllowedAt : [...DEFAULT_POINT_EXTRAS.burnAllowedAt],
    transferFeePoints: typeof raw?.transferFeePoints === "number" ? raw.transferFeePoints : DEFAULT_POINT_EXTRAS.transferFeePoints,
    requireOtp: typeof raw?.requireOtp === "boolean" ? raw.requireOtp : DEFAULT_POINT_EXTRAS.requireOtp,
  };
}

export async function getPointExtras(target: { tenantId: string; systemId: string }): Promise<PointExtras> {
  const sys = await prisma.appSystem.findFirst({ where: { id: target.systemId, tenantId: target.tenantId }, select: { settings: true } });
  return pointExtrasOf(sys?.settings ?? null);
}

/**
 * บันทึกค่าที่ไม่มีคอลัมน์ (อ่าน-แก้-เขียน `settings` ทั้งก้อน — เก็บคีย์อื่นของระบบไว้ครบ)
 * `target.systemId` = **ระบบสมาชิก** (AppSystem ที่มี `settings.member.*`) ไม่ใช่ระบบแต้ม
 */
export async function setPointExtras(
  target: { tenantId: string; systemId: string },
  input: Partial<PointExtras>,
): Promise<PointExtras> {
  const sys = await prisma.appSystem.findFirst({ where: { id: target.systemId, tenantId: target.tenantId }, select: { settings: true } });
  if (!sys) throw pointError("ไม่พบระบบสมาชิกนี้ในร้านนี้");
  const current = (sys.settings ?? {}) as Record<string, unknown>;
  const member = (current.member ?? {}) as Record<string, unknown>;
  const existing = pointExtrasOf(current);
  const merged: PointExtras = {
    burnAllowedAt:
      Array.isArray(input.burnAllowedAt) && input.burnAllowedAt.length > 0
        ? input.burnAllowedAt.filter((v) => POINT_EXTRAS_BURN_AT.has(v))
        : existing.burnAllowedAt,
    transferFeePoints: typeof input.transferFeePoints === "number" ? Math.max(0, Math.floor(input.transferFeePoints)) : existing.transferFeePoints,
    requireOtp: typeof input.requireOtp === "boolean" ? input.requireOtp : existing.requireOtp,
  };
  const settings = { ...current, member: { ...member, points: merged } } as Prisma.InputJsonValue;
  await prisma.appSystem.update({ where: { id: target.systemId }, data: { settings } });
  return merged;
}

export type PointLedgerFilter = {
  type?: "EARN" | "BURN" | "ADJUST" | "REVERSE" | "EXPIRE" | "TRANSFER";
  from?: Date;
  to?: Date;
  unitId?: string;
  /** ค้นชื่อ/รหัสสมาชิก/เบอร์ */
  q?: string;
  take?: number;
};

export type PointLedgerRow = {
  id: string;
  customerId: string;
  customerName: string;
  memberCode: string;
  unitId: string | null;
  delta: number;
  type: string;
  reason: string | null;
  createdAt: Date;
};

export type PointLedgerKpi = {
  issuedThisMonth: number;
  usedThisMonth: number;
  expiredThisMonth: number;
  outstanding: number;
  liabilitySatang: number;
};

/** ledger รวมของ "ระบบสมาชิก" นี้ (ทุกระบบแต้มที่ผูกอยู่) — หน้า `/member/points` (ภาพ 16) */
export async function listPointLedgerForMemberSystem(
  tenantId: string,
  memberSystemId: string,
  filter: PointLedgerFilter = {},
): Promise<{ rows: PointLedgerRow[]; total: number }> {
  const pointSystemIds = await resolvePointSystemIds(tenantId, memberSystemId);
  if (pointSystemIds.length === 0) return { rows: [], total: 0 };

  let customerIds: string[] | undefined;
  const q = (filter.q ?? "").trim();
  if (q) {
    const matches = await prisma.customer.findMany({
      where: {
        tenantId,
        memberSystemId,
        OR: [{ name: { contains: q, mode: "insensitive" } }, { memberCode: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
      },
      select: { id: true },
      take: 500,
    });
    customerIds = matches.map((m) => m.id);
    if (customerIds.length === 0) return { rows: [], total: 0 };
  }

  const where: Prisma.PointLedgerWhereInput = {
    tenantId,
    systemId: { in: pointSystemIds },
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.unitId ? { unitId: filter.unitId } : {}),
    ...(customerIds ? { customerId: { in: customerIds } } : {}),
    ...(filter.from || filter.to ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
  };

  const take = Math.min(Math.max(filter.take ?? 50, 1), 200);
  const [rows, total] = await Promise.all([
    prisma.pointLedger.findMany({ where, orderBy: { createdAt: "desc" }, take }),
    prisma.pointLedger.count({ where }),
  ]);
  if (rows.length === 0) return { rows: [], total };

  const custRows = await prisma.customer.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.customerId))] } },
    select: { id: true, name: true, firstName: true, lastName: true, memberCode: true },
  });
  const custById = new Map(custRows.map((c) => [c.id, c]));

  return {
    total,
    rows: rows.map((r) => {
      const c = custById.get(r.customerId);
      const name = c ? (c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ")) : "";
      return {
        id: r.id,
        customerId: r.customerId,
        customerName: name || "ไม่ระบุชื่อ",
        memberCode: c?.memberCode ?? "",
        unitId: r.unitId,
        delta: r.delta,
        type: r.type,
        reason: r.reason,
        createdAt: r.createdAt,
      };
    }),
  };
}

/** KPI บนหัวหน้า `/member/points` — ออกเดือนนี้/ใช้เดือนนี้/หมดอายุเดือนนี้/คงค้าง/หนี้สิน */
export async function pointKpiForMemberSystem(tenantId: string, memberSystemId: string): Promise<PointLedgerKpi> {
  const pointSystemIds = await resolvePointSystemIds(tenantId, memberSystemId);
  if (pointSystemIds.length === 0) {
    return { issuedThisMonth: 0, usedThisMonth: 0, expiredThisMonth: 0, outstanding: 0, liabilitySatang: 0 };
  }
  const settings = await getSettings(prisma, tenantId);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [issuedAgg, usedAgg, expiredAgg, balAgg] = await Promise.all([
    prisma.pointLedger.aggregate({
      where: { tenantId, systemId: { in: pointSystemIds }, type: { in: ["EARN", "ADJUST"] }, delta: { gt: 0 }, createdAt: { gte: monthStart } },
      _sum: { delta: true },
    }),
    prisma.pointLedger.aggregate({
      where: { tenantId, systemId: { in: pointSystemIds }, type: { in: ["BURN", "ADJUST", "TRANSFER"] }, delta: { lt: 0 }, createdAt: { gte: monthStart } },
      _sum: { delta: true },
    }),
    prisma.pointLedger.aggregate({
      where: { tenantId, systemId: { in: pointSystemIds }, type: "EXPIRE", createdAt: { gte: monthStart } },
      _sum: { delta: true },
    }),
    prisma.pointBalance.aggregate({ where: { systemId: { in: pointSystemIds } }, _sum: { balance: true } }),
  ]);

  const outstanding = balAgg._sum.balance ?? 0;
  return {
    issuedThisMonth: issuedAgg._sum.delta ?? 0,
    usedThisMonth: Math.abs(usedAgg._sum.delta ?? 0),
    expiredThisMonth: Math.abs(expiredAgg._sum.delta ?? 0),
    outstanding,
    liabilitySatang: outstanding * settings.burnRateSatang,
  };
}

export type ExpiringLotRow = {
  customerId: string;
  customerName: string;
  memberCode: string;
  lotId: string;
  points: number;
  expiresAt: Date;
  daysLeft: number;
};

/** ล็อตที่จะหมดอายุภายใน `days` วัน ของทุกระบบแต้มที่ผูกกับระบบสมาชิกนี้ — หน้า `/member/points/expiring` */
export async function expiringForMemberSystem(
  tenantId: string,
  memberSystemId: string,
  days: number,
): Promise<ExpiringLotRow[]> {
  const pointSystemIds = await resolvePointSystemIds(tenantId, memberSystemId);
  if (pointSystemIds.length === 0) return [];
  const now = new Date();
  const until = new Date(now.getTime() + Math.max(0, Math.floor(days)) * 24 * 60 * 60 * 1000);
  const rows = await prisma.pointLot.findMany({
    where: { tenantId, systemId: { in: pointSystemIds }, expiredAt: null, remaining: { gt: 0 }, expiresAt: { not: null, gte: now, lte: until } },
    orderBy: { expiresAt: "asc" },
    take: 300,
  });
  if (rows.length === 0) return [];
  const custRows = await prisma.customer.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.customerId))] } },
    select: { id: true, name: true, firstName: true, lastName: true, memberCode: true },
  });
  const custById = new Map(custRows.map((c) => [c.id, c]));
  return rows.flatMap((lot) => {
    if (!lot.expiresAt) return [];
    const c = custById.get(lot.customerId);
    const name = c ? (c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ")) : "";
    return [
      {
        customerId: lot.customerId,
        customerName: name || "ไม่ระบุชื่อ",
        memberCode: c?.memberCode ?? "",
        lotId: lot.id,
        points: lot.remaining,
        expiresAt: lot.expiresAt,
        daysLeft: Math.floor((lot.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      },
    ];
  });
}
