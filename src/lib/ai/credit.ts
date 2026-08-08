// กระเป๋าเครดิตผู้ช่วย AI — prepaid (เติมเงินล่วงหน้า) แทนโควตาต่อรอบแบบเดิม
//
// กติกาที่เจ้าของเคาะ (8 ส.ค. 2026):
// - สมัครครั้งแรกได้เครดิตต้อนรับ $10 (แจกครั้งเดียวต่อกิจการ)
// - หมดแล้วต้องเติมอย่างเดียว ไม่มีโควตาฟรีรีเซ็ตรายรอบอีกต่อไป
// - **ทุกทางที่ยิง LLM ต้องผ่านที่นี่** — ก่อนหน้านี้ 4/6 ทางไม่ผ่านมิเตอร์เลย
//
// ledger append-only: ทุกแถวเก็บ balanceAfter → ตรวจย้อนหลังได้ว่ายอดเดินยังไง
// การหักเงินทำใน $transaction + อ่านยอดสดในทรานแซกชัน (กันสองคำขอพร้อมกันหักทับกัน)

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { costMicroUsd, MICRO_PER_USD } from "./pricing";
import type { AiCreditKind, AiCreditSource } from "@prisma/client";

export type Ctx = { tenantId: string };

/** บัญชีกลางของแพลตฟอร์ม — ใช้ลงค่าใช้จ่ายที่ทีมเราเป็นคนก่อ (ร่างคำตอบเคส) ไม่หักร้าน */
export const PLATFORM_LEDGER_ID = "__platform__";

/** เครดิตต้อนรับ (ไมโครดอลลาร์) — ตั้ง env ทับได้ */
export function welcomeGrantMicro(): number {
  const usd = Number(process.env.SHARK_AI_WELCOME_USD);
  return Math.round((Number.isFinite(usd) && usd >= 0 ? usd : 10) * MICRO_PER_USD);
}

export type Wallet = { tenantId: string; balanceMicro: number; grantedAt: Date | null };

/**
 * อ่านกระเป๋า — ยังไม่มี = เปิดให้พร้อมเครดิตต้อนรับ (lazy)
 * ทำแบบ lazy ไม่ใช่ตอนสร้างกิจการ เพราะร้านที่มีอยู่ก่อนระบบนี้ต้องได้ด้วย โดยไม่ต้อง backfill
 * แจกซ้ำไม่ได้: grantedAt เป็นตัวล็อก + P2002 ตอนสร้างชนกัน = อ่านของเดิมมาใช้
 */
export async function ensureWallet(tenantId: string): Promise<Wallet> {
  const found = await prisma.aiCreditWallet.findUnique({ where: { tenantId } });
  if (found) return found;

  const grant = welcomeGrantMicro();
  try {
    return await prisma.$transaction(async (tx) => {
      const w = await tx.aiCreditWallet.create({
        data: { tenantId, balanceMicro: grant, grantedAt: new Date() },
      });
      if (grant > 0) {
        await tx.aiCreditTxn.create({
          data: {
            tenantId,
            kind: "GRANT",
            source: "GRANT",
            amountMicro: grant,
            balanceAfter: grant,
            note: "เครดิตต้อนรับสำหรับกิจการใหม่",
            ref: "welcome-grant",
          },
        });
      }
      return w;
    });
  } catch (e) {
    // เปิดกระเป๋าพร้อมกัน 2 คำขอ → unique ชน = ของอีกฝั่งเปิดสำเร็จแล้ว อ่านมาใช้
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.aiCreditWallet.findUnique({ where: { tenantId } });
      if (again) return again;
    }
    throw e;
  }
}

export async function balanceOf(tenantId: string): Promise<number> {
  return (await ensureWallet(tenantId)).balanceMicro;
}

/** พอจ่ายไหม — ยอดต้องเหลือมากกว่า 0 (ไม่ให้ติดลบไปเรื่อย ๆ) */
export async function canSpend(tenantId: string): Promise<boolean> {
  return (await balanceOf(tenantId)).valueOf() > 0;
}

export type ChargeInput = {
  source: AiCreditSource;
  model: string;
  tokensIn: number;
  tokensOut: number;
  conversationId?: string;
  userId?: string;
  note?: string;
};

/**
 * หักค่าใช้จ่ายหลังเรียก AI สำเร็จ — คืนจำนวนที่หักจริง (ไมโครดอลลาร์)
 * - หักแล้วติดลบได้ (คำตอบออกไปแล้ว ห้ามเก็บฟรี) แต่ครั้งถัดไปจะถูกกันตั้งแต่ต้นทาง
 * - ล้ม = โยนต่อให้ผู้เรียกจัดการ (ชั้นบน catch แล้ว log — คำตอบต้องไม่หาย)
 */
export async function chargeUsage(ctx: Ctx, input: ChargeInput): Promise<number> {
  const cost = costMicroUsd(input.model, input.tokensIn, input.tokensOut);
  if (cost <= 0) return 0;

  await prisma.$transaction(async (tx) => {
    // อ่านยอดสดในทรานแซกชัน แล้วเขียนกลับด้วย decrement → สองคำขอพร้อมกันไม่หักทับกัน
    const w = await tx.aiCreditWallet.update({
      where: { tenantId: ctx.tenantId },
      data: { balanceMicro: { decrement: cost } },
    });
    await tx.aiCreditTxn.create({
      data: {
        tenantId: ctx.tenantId,
        kind: "USAGE",
        source: input.source,
        amountMicro: -cost,
        balanceAfter: w.balanceMicro,
        model: input.model,
        tokensIn: Math.max(0, Math.round(input.tokensIn || 0)),
        tokensOut: Math.max(0, Math.round(input.tokensOut || 0)),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.note ? { note: input.note } : {}),
      },
    });
  });
  return cost;
}

/**
 * หักแบบ best-effort — ใช้ในเส้นทางที่ห้ามพังเพราะคิดเงินไม่สำเร็จ
 * (คำตอบส่งถึงผู้ใช้แล้ว การคิดเงินล้มไม่ควรทำให้คำตอบหาย — บันทึกไว้แล้วไปต่อ)
 */
export async function chargeUsageSafe(ctx: Ctx, input: ChargeInput): Promise<number> {
  try {
    return await chargeUsage(ctx, input);
  } catch (e) {
    const { logOps } = await import("@/lib/core/ops");
    await logOps("ERROR", "ai", "หักเครดิตไม่สำเร็จ", {
      tenantId: ctx.tenantId,
      detail: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}

/** ลงค่าใช้จ่ายที่แพลตฟอร์มออกให้ (ไม่แตะกระเป๋าร้าน) — มิเตอร์ระดับแพลตฟอร์มที่เดิมไม่มีเลย */
export async function chargePlatform(input: ChargeInput & { forTenantId?: string }): Promise<number> {
  const cost = costMicroUsd(input.model, input.tokensIn, input.tokensOut);
  if (cost <= 0) return 0;
  const w = await ensureWallet(PLATFORM_LEDGER_ID);
  await prisma.$transaction(async (tx) => {
    const next = await tx.aiCreditWallet.update({
      where: { tenantId: PLATFORM_LEDGER_ID },
      data: { balanceMicro: { decrement: cost } },
    });
    await tx.aiCreditTxn.create({
      data: {
        tenantId: PLATFORM_LEDGER_ID,
        kind: "USAGE",
        source: input.source,
        amountMicro: -cost,
        balanceAfter: next.balanceMicro,
        model: input.model,
        tokensIn: Math.max(0, Math.round(input.tokensIn || 0)),
        tokensOut: Math.max(0, Math.round(input.tokensOut || 0)),
        note: input.note ?? (input.forTenantId ? `ให้กิจการ ${input.forTenantId}` : undefined),
      },
    });
  });
  void w;
  return cost;
}

/**
 * เติมเครดิต — idempotent ต่อ ref (กัน webhook ยิงซ้ำแล้วเติมสองรอบ)
 * คืน { credited, balanceMicro } · credited=false = เคยเติมด้วย ref นี้แล้ว
 */
export async function topUp(
  tenantId: string,
  amountMicro: number,
  opts: { ref: string; note?: string; kind?: AiCreditKind; source?: AiCreditSource },
): Promise<{ credited: boolean; balanceMicro: number }> {
  if (!Number.isFinite(amountMicro) || amountMicro <= 0) {
    throw new Error("จำนวนเงินที่เติมต้องมากกว่า 0");
  }
  await ensureWallet(tenantId);
  try {
    return await prisma.$transaction(async (tx) => {
      const w = await tx.aiCreditWallet.update({
        where: { tenantId },
        data: { balanceMicro: { increment: Math.round(amountMicro) } },
      });
      await tx.aiCreditTxn.create({
        data: {
          tenantId,
          kind: opts.kind ?? "TOPUP",
          source: opts.source ?? "TOPUP",
          amountMicro: Math.round(amountMicro),
          balanceAfter: w.balanceMicro,
          ref: opts.ref,
          ...(opts.note ? { note: opts.note } : {}),
        },
      });
      return { credited: true, balanceMicro: w.balanceMicro };
    });
  } catch (e) {
    // ref ซ้ำ = webhook ยิงซ้ำ → ไม่เติมเพิ่ม คืนยอดปัจจุบัน (idempotent)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { credited: false, balanceMicro: await balanceOf(tenantId) };
    }
    throw e;
  }
}

export type TxnRow = {
  id: string;
  kind: AiCreditKind;
  source: AiCreditSource;
  amountMicro: number;
  balanceAfter: number;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  note: string | null;
  createdAt: Date;
};

/** รายการเดินบัญชี ล่าสุดก่อน — cursor = id ของแถวสุดท้ายหน้าที่แล้ว */
export async function listTxns(
  tenantId: string,
  opts: { take?: number; cursor?: string; kind?: AiCreditKind } = {},
): Promise<{ rows: TxnRow[]; nextCursor: string | null }> {
  const take = Math.min(200, Math.max(1, opts.take ?? 20));
  const rows = await prisma.aiCreditTxn.findMany({
    where: { tenantId, ...(opts.kind ? { kind: opts.kind } : {}) },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true, kind: true, source: true, amountMicro: true, balanceAfter: true,
      model: true, tokensIn: true, tokensOut: true, note: true, createdAt: true,
    },
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return { rows: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

/** ยอดใช้แยกตามต้นทาง 30 วันล่าสุด — ตอบคำถาม "เงินหมดไปกับอะไร" */
export async function usageBySource(
  tenantId: string,
  days = 30,
): Promise<{ source: AiCreditSource; spentMicro: number; calls: number }[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.aiCreditTxn.groupBy({
    by: ["source"],
    where: { tenantId, kind: "USAGE", createdAt: { gte: since } },
    _sum: { amountMicro: true },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ source: r.source, spentMicro: -(r._sum.amountMicro ?? 0), calls: r._count._all }))
    .sort((a, b) => b.spentMicro - a.spentMicro);
}

/** ข้อความไทยเมื่อเครดิตหมด — ทุกช่องทางใช้ตัวเดียวกัน */
export function outOfCreditMessage(): string {
  return "เครดิตผู้ช่วย AI หมดแล้ว — เติมเครดิตที่ ตั้งค่า → เครดิต AI แล้วใช้งานต่อได้ทันที";
}

// ─────────────────── ตั้งค่าผู้ช่วย AI ระดับกิจการ ───────────────────
// กติกา (มติเจ้าของ 8 ส.ค. 2026): อะไรที่ระบบทำเองแล้วหักเครดิตร้าน ต้อง **ปิดไว้ก่อน**
// เดิมรายงานสัปดาห์ยิงให้ทุกร้านอัตโนมัติโดยไม่มีใครสั่ง = เก็บเงินจากสิ่งที่ลูกค้าไม่ได้ขอ

export type AiSettingsView = { weeklyReportEnabled: boolean };

/** อ่านการตั้งค่า — ยังไม่เคยตั้ง = ค่าเริ่มต้น (ปิดหมด) โดยไม่ต้องสร้างแถว */
export async function getAiSettings(tenantId: string): Promise<AiSettingsView> {
  const row = await prisma.aiSettings.findUnique({ where: { tenantId } });
  return { weeklyReportEnabled: row?.weeklyReportEnabled ?? false };
}

/** เปิด/ปิดรายงานธุรกิจรายสัปดาห์ */
export async function setWeeklyReportEnabled(tenantId: string, enabled: boolean): Promise<void> {
  await prisma.aiSettings.upsert({
    where: { tenantId },
    create: { tenantId, weeklyReportEnabled: enabled },
    update: { weeklyReportEnabled: enabled },
  });
}

/** รายชื่อร้านที่เปิดรายงานสัปดาห์ไว้ — cron ใช้กรอง (ไม่เปิด = ไม่ยิง ไม่หักเงิน) */
export async function tenantsWithWeeklyReport(): Promise<string[]> {
  const rows = await prisma.aiSettings.findMany({
    where: { weeklyReportEnabled: true },
    select: { tenantId: true },
  });
  return rows.map((r) => r.tenantId);
}
