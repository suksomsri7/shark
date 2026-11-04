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
import { FREE_PACK, monthKeyBangkok, nextResetBangkok, quotaMessage as packQuotaMessage, SECRETARY_LAUNCH_AT } from "./secretary/pack";
import { bkkDayStart } from "@/lib/core/quiet-hours";
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
 * SEC S1.13 (R-K7 · มติ 7.4) ▸ ร้านนี้ได้เครดิตต้อนรับไหม — ร้านที่สร้าง **ก่อน** `SECRETARY_LAUNCH_AT` = ได้ (เดิมทุกไบต์)
 *   ร้านที่สร้างตั้งแต่เวลาเปิดเลขา = ไม่ได้ (ใช้แพ็กฟรี 100 งาน/เดือนแทน) · ไม่มีแถว Tenant (เช่น `__platform__`) = ไม่ได้ (R-S1.13i) ◂
 */
export async function getsWelcomeGrant(tenantId: string): Promise<boolean> {
  // R-S1.13i (I-9) ▸ ไม่มีแถว Tenant (รวม `__platform__`) ⇒ ไม่แจก — เครดิตต้อนรับเป็นของกิจการจริงเท่านั้น ◂
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { createdAt: true } });
  if (!t) return false;
  return t.createdAt.getTime() < new Date(SECRETARY_LAUNCH_AT).getTime();
}

/**
 * อ่านกระเป๋า — ยังไม่มี = เปิดให้พร้อมเครดิตต้อนรับ (lazy)
 * ทำแบบ lazy ไม่ใช่ตอนสร้างกิจการ เพราะร้านที่มีอยู่ก่อนระบบนี้ต้องได้ด้วย โดยไม่ต้อง backfill
 * แจกซ้ำไม่ได้: grantedAt เป็นตัวล็อก + P2002 ตอนสร้างชนกัน = อ่านของเดิมมาใช้
 * SEC S1.13 (R-K7) ▸ ร้านที่สร้างหลังเปิดเลขา = เปิดกระเป๋ายอด 0 · grantedAt null · **ไม่มีแถว GRANT** (กระเป๋าเป็นแค่บัญชีต้นทุน) ◂
 */
export async function ensureWallet(tenantId: string): Promise<Wallet> {
  const found = await prisma.aiCreditWallet.findUnique({ where: { tenantId } });
  if (found) return found;

  const welcome = await getsWelcomeGrant(tenantId);
  const grant = welcome ? welcomeGrantMicro() : 0;
  try {
    return await prisma.$transaction(async (tx) => {
      const w = await tx.aiCreditWallet.create({
        data: { tenantId, balanceMicro: grant, grantedAt: welcome ? new Date() : null },
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

/**
 * ยอดกระเป๋าแบบ **อ่านอย่างเดียว** (SEC S1.13) — ไม่มีกระเป๋า = null (ไม่สร้าง · ไม่แจก GRANT)
 * ใช้ในทางอ่านสถานะ/ด่าน (quotaStatus · canRunAi · GET usage · degrade) แทน `balanceOf` ที่เปิดกระเป๋า
 */
export async function balancePeek(tenantId: string): Promise<number | null> {
  return (await walletPeek(tenantId))?.balanceMicro ?? null;
}

/** กระเป๋าแบบอ่านอย่างเดียว (ยอด + grantedAt) — grantedAt null = ร้านในแพ็กฟรีที่ไม่ได้เครดิตต้อนรับ (ใช้ตัดสิน degrade) · ไม่มี = null */
export async function walletPeek(tenantId: string): Promise<{ balanceMicro: number; grantedAt: Date | null } | null> {
  return prisma.aiCreditWallet.findUnique({ where: { tenantId }, select: { balanceMicro: true, grantedAt: true } });
}

// ─────────────── SEC S1.13 ▸ ด่านเดียวก่อนเรียกโมเดล (R-K7 · มติ 7.1–7.4 · Q4) ───────────────
// job    = เปิดห้องงานของเลขา (นับที่ startRoom) · assist = ทุกทางเดิม (ห้อง AI เดิม + ผู้เรียก canSpend ทุกจุด)
// ลำดับ: (FREE_PACK.enabled && assist) || (job && jobsLeft > 0) || balance > 0
//   รุ่นแรก assist ฟรี (ยังเขียน AiCreditTxn เป็นบันทึกต้นทุน · ยอดติดลบได้) · งานเกินโควตา = ใช้กระเป๋าต่อ (Q4) · ไม่เขียนอะไรเลย
export type RunScope = "job" | "assist";
/** ยอดกระเป๋าขั้นต่ำ ($0.50) — ต่ำกว่านี้ sendMessage ลดชั้นโมเดล · และเป็นเกณฑ์ใช้กระเป๋าต่อเมื่อโควตางานหมด (R-S1.13h) */
export const LOW_BALANCE_MICRO = 500_000;
export type CanRun = { ok: true } | { ok: false; reason: "jobs" | "credit"; resetAt?: Date; message: string };

/** งานที่เหลือของเดือนไทยที่ครอบ `now` — อ่านตัวนับอย่างเดียว (ไม่มีแถว = ยังไม่ใช้ = เต็มโควตา) */
async function jobsLeftOf(tenantId: string, now: Date): Promise<{ used: number; left: number }> {
  const row = await prisma.aiJobCounter.findUnique({
    where: { tenantId_month: { tenantId, month: monthKeyBangkok(now) } },
    select: { jobs: true },
  });
  const used = Math.max(0, row?.jobs ?? 0);
  return { used, left: Math.max(0, FREE_PACK.jobsPerMonth - used) };
}

/**
 * R-S1.13b ▸ ต้นทุน assist ของวันไทยที่ครอบ `now` = Σ|amountMicro| ของแถว USAGE ของร้าน (1 aggregate · index [tenantId, createdAt])
 *   คืนช่วงวันด้วย (resetAt = เที่ยงคืนไทยถัดไป) ◂
 */
export async function assistUsedMicroOfDay(tenantId: string, now: Date = new Date()): Promise<{ usedMicro: number; capMicro: number; resetAt: Date }> {
  const start = bkkDayStart(now);
  const resetAt = new Date(start.getTime() + 86_400_000);
  // R-S1.13f ▸ ต้นทุนของห้องเลขา (conversationId มี AiRoom) ไม่นับในเพดานนี้ — ห้องคุมด้วยโควตางานแล้ว
  //   2 query ที่มีขอบเขต: รวมต่อ conversationId ของวันนี้ (index [tenantId, createdAt]) → หาว่าตัวไหนเป็นห้องเลขา ◂
  const rows = await prisma.aiCreditTxn.groupBy({
    by: ["conversationId"],
    where: { tenantId, kind: "USAGE", createdAt: { gte: start, lt: resetAt } },
    _sum: { amountMicro: true },
  });
  const convIds = (rows ?? []).map((r) => r.conversationId).filter((c): c is string => typeof c === "string" && c.length > 0);
  const roomConv = convIds.length > 0
    ? new Set((await prisma.aiRoom.findMany({ where: { tenantId, conversationId: { in: convIds } }, select: { conversationId: true } })).map((r) => r.conversationId))
    : new Set<string>();
  let used = 0;
  for (const r of rows ?? []) {
    if (r.conversationId && roomConv.has(r.conversationId)) continue;
    used += Math.abs(Number(r._sum?.amountMicro ?? 0) || 0);
  }
  return { usedMicro: used, capMicro: FREE_PACK.assistDailyMicro, resetAt };
}

/** R-S1.13e ▸ เหตุผลของ `canSpend` (assist) — ผู้เรียกใช้ `message` แทนข้อความ "เติมเครดิต" ตายตัว (ถึงเพดานวัน ⇒ "วันนี้…") ◂ */
export async function canSpendWhy(tenantId: string, now?: Date): Promise<CanRun> {
  return canRunAi(tenantId, { scope: "assist", now });
}

/**
 * R-S1.13e ▸ ข้อความปฏิเสธของ assist: ชนเพดานวัน ⇒ ข้อความ "วันนี้…" · ไม่งั้น = `fallback` (ข้อความเครดิตเดิมของผู้เรียก)
 *   เรียกเฉพาะหลัง `canSpend` ตอบ false (1 query เพิ่มเฉพาะทางปฏิเสธ) ◂
 */
export async function spendRefusalMessage(tenantId: string, fallback: string = outOfCreditMessage()): Promise<string> {
  const why = await canSpendWhy(tenantId);
  return !why.ok && why.resetAt ? why.message : fallback;
}

/** ข้อความไทยเมื่อชนเพดานต้นทุน assist ของวัน (ไม่บอกตัวเงิน — §C.6) */
export function assistDailyCapMessage(): string {
  return "วันนี้ใช้ผู้ช่วย AI ครบเพดานของแพ็กฟรีแล้ว — กลับมาใช้ได้หลังเที่ยงคืน (งานในห้องเลขายังเปิดได้ตามโควตา)";
}

export async function canRunAi(tenantId: string, opts: { scope: RunScope; now?: Date }): Promise<CanRun> {
  const now = opts.now ?? new Date();
  if (opts.scope === "assist") {
    if (FREE_PACK.enabled) {
      // R-S1.13b ▸ ฟรีแต่มีเพดานต่อวัน — ถึงเพดาน = ปฏิเสธแบบ "credit" พร้อมเวลาเริ่มใหม่ ◂
      const day = await assistUsedMicroOfDay(tenantId, now);
      if (day.usedMicro < day.capMicro) return { ok: true };
      // R-S1.13g ▸ ถึงเพดานแล้ว **ไม่** fall-through ไปยอดกระเป๋า (ยุคแพ็กฟรี: เพดานคุมต้นทุนก่อน · เติมเงินปิด 7.3 ·
      //   $10 ของร้านเดิม = บัญชีต้นทุน ไม่ใช่สิทธิ์ใช้เกินเพดาน — บันทึกมติเจ้าของ B8) ◂
      return { ok: false, reason: "credit", resetAt: day.resetAt, message: assistDailyCapMessage() };
    }
    if (((await balancePeek(tenantId)) ?? 0) > 0) return { ok: true };
    return { ok: false, reason: "credit", message: outOfCreditMessage() };
  }
  const { used, left } = await jobsLeftOf(tenantId, now);
  if (left > 0) return { ok: true };
  // R-S1.13h ▸ ใช้กระเป๋าต่อ (Q4) ต้องมียอด ≥ LOW_BALANCE_MICRO (ไม่ใช่แค่ > 0) ◂
  if (((await balancePeek(tenantId)) ?? 0) >= LOW_BALANCE_MICRO) return { ok: true };
  const resetAt = nextResetBangkok(now);
  const limit = FREE_PACK.jobsPerMonth;
  const text = packQuotaMessage(Math.max(used, limit), limit, resetAt, now).text ?? "โควตางานเดือนนี้หมดแล้ว";
  return { ok: false, reason: "jobs", resetAt, message: text };
}

/**
 * พอจ่ายไหม — ชื่อเดิมของผู้เรียก ~20 จุด (SEC S1.13 · R-K7: ภายใน = `canRunAi(…, "assist")`)
 * 🔴 ไม่เปิดกระเป๋าอีกต่อไป — กระเป๋าเปิดตอนหักเงินจริงครั้งแรก (`chargeUsage`)
 */
export async function canSpend(tenantId: string): Promise<boolean> {
  return (await canRunAi(tenantId, { scope: "assist" })).ok;
}

/**
 * พอจ่ายไหม โดย **ไม่เปิดกระเป๋าและไม่แจกเครดิตต้อนรับ** — ใช้ในเส้นทาง "อ่านสถานะ" (GET/หน้าจอ)
 * 🔴 ทำไมต้องมีตัวนี้: `canSpend` → `balanceOf` → `ensureWallet` ซึ่ง **เขียน** กระเป๋า + แถว GRANT
 *    ⇒ การอ่านสถานะปุ่ม (เช่น `crm/calls.callAiStatus`) จะพาร้านที่ยังไม่เคยใช้ AI เข้าระบบเครดิตเงียบ ๆ ทุกครั้งที่เปิดหน้า
 *    (เขียนใน GET · แถว GRANT ที่ไม่มีใครขอ · ยอดของทั้งแพลตฟอร์มเพี้ยน)
 * ยังไม่มีกระเป๋า = จะได้เครดิตต้อนรับตอนใช้จริง ⇒ ตอบว่า "พอจ่าย" ถ้าเครดิตต้อนรับมากกว่า 0 (ไม่เขียนอะไรเลย)
 */
export async function canSpendPeek(tenantId: string): Promise<boolean> {
  const w = await prisma.aiCreditWallet.findUnique({ where: { tenantId }, select: { balanceMicro: true } });
  // SEC S1.13 (R-K7) ▸ ไม่มีกระเป๋า: ร้านเดิม = จะได้เครดิตต้อนรับ · ร้านใหม่ = แพ็กฟรี (assist ฟรี) · มีกระเป๋า: ยอด > 0 หรือแพ็กฟรีเปิด ◂
  // R-S1.13i ▸ แพ็กฟรีเปิด: เพดานต้นทุน assist ของวันมีผลด้วย (ถึงเพดาน ⇒ false · แถบ blocked ไม่ null) ◂
  if (!w && (await getsWelcomeGrant(tenantId))) return welcomeGrantMicro() > 0;
  if (FREE_PACK.enabled) {
    const day = await assistUsedMicroOfDay(tenantId);
    return day.usedMicro < day.capMicro;
  }
  return (w?.balanceMicro ?? 0) > 0;
}

export type ChargeInput = {
  source: AiCreditSource;
  model: string;
  tokensIn: number;
  tokensOut: number;
  conversationId?: string;
  userId?: string;
  note?: string;
  /**
   * ค่าใช้จ่ายที่ **ไม่ใช่ token ของโมเดล** และผู้เรียกรู้ค่าเอง (ไมโครดอลลาร์ ≥ 0) — บวกเข้ากับค่า token ในแถวเดียว
   * 🔴 ใบ CRM v2 C2.4: ผู้ให้บริการถอดเสียงคิดเงินตามนาทีเสียง ไม่ใช่ token ⇒ ถ้าไม่มีช่องนี้ ค่าถอดเสียงจะหายไป
   *    จากบิลของร้านทั้งก้อน (เรียกใช้บริการแล้วแต่ไม่ได้คิดเงิน) · ไม่ส่งมา = 0 ⇒ พฤติกรรมเดิมทุกจุดที่ไม่ได้ตั้งค่านี้
   */
  extraMicroUsd?: number;
  /**
   * SVC D.14 (มติ R1) ▸ กุญแจกันหักซ้ำ — เขียนลง `AiCreditTxn.ref` (unique ต่อร้าน `@@unique([tenantId, ref])`)
   *   ref เดิมซ้ำ (กดซ้ำ/ส่งใหม่/พร้อมกันหลายโพรเซส) ⇒ ฐานปฏิเสธแถวที่สอง (P2002) ⇒ ทรานแซกชันย้อน (กระเป๋าไม่ถูกหัก) แล้วคืน 0
   *   ไม่ส่ง = พฤติกรรมเดิมทุกจุด ◂
   */
  ref?: string;
};

/** ค่าที่ต้องหักจริงของรายการนี้ = ค่า token ของโมเดล + ค่าที่ผู้เรียกรายงานเพิ่ม (ปัดเป็นจำนวนเต็ม ≥ 0) */
function totalCostMicro(input: ChargeInput): number {
  const model = costMicroUsd(input.model, input.tokensIn, input.tokensOut);
  const extra = Math.max(0, Math.round(Number(input.extraMicroUsd ?? 0) || 0));
  return model + extra;
}

/**
 * หักค่าใช้จ่ายหลังเรียก AI สำเร็จ — คืนจำนวนที่หักจริง (ไมโครดอลลาร์)
 * - หักแล้วติดลบได้ (คำตอบออกไปแล้ว ห้ามเก็บฟรี) แต่ครั้งถัดไปจะถูกกันตั้งแต่ต้นทาง (เว้นแต่แพ็กฟรีเปิด — assist ฟรี · R-K7)
 * - ล้ม = โยนต่อให้ผู้เรียกจัดการ (ชั้นบน catch แล้ว log — คำตอบต้องไม่หาย)
 */
export async function chargeUsage(ctx: Ctx, input: ChargeInput): Promise<number> {
  const cost = totalCostMicro(input);
  if (cost <= 0) return 0;

  // SVC D.14 (มติ R1) ▸ ref ว่าง/ไม่ใช่สตริง = ไม่ใช้ (เหมือนไม่ส่ง) ◂
  const ref = typeof input.ref === "string" && input.ref.length > 0 ? input.ref : null;
  try {
    await chargeTx(ctx, input, cost, ref);
  } catch (e) {
    // SVC D.14 (มติ R1) ▸ ref นี้หักไปแล้ว (P2002 บน (tenantId, ref)) — ทั้งทรานแซกชันย้อน ⇒ ไม่หักซ้ำ · คืน 0 ไม่ throw ◂
    if (ref && isRefDuplicate(e)) return 0;
    // SEC S1.13 ▸ ยังไม่มีกระเป๋า (canSpend ไม่เปิดกระเป๋าแล้ว) ⇒ เปิดตามกติกา R-K7 แล้วหักอีกครั้งเดียว — ร้านใหม่ยอดติดลบได้ (บันทึกต้นทุน) ◂
    if (!isWalletMissing(e)) throw e;
    await ensureWallet(ctx.tenantId);
    try {
      await chargeTx(ctx, input, cost, ref);
    } catch (e2) {
      if (ref && isRefDuplicate(e2)) return 0;
      throw e2;
    }
  }
  return cost;
}

/** แถวหักเงิน 1 รายการ: decrement กระเป๋า + แถว USAGE ใน $transaction เดียว (กระเป๋าไม่มี ⇒ P2025) */
async function chargeTx(ctx: Ctx, input: ChargeInput, cost: number, ref: string | null): Promise<void> {
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
        ...(ref ? { ref } : {}), // SVC D.14 (R1) ◂
      },
    });
  });
}

/** SEC S1.13 ▸ update กระเป๋าที่ยังไม่มี — Prisma P2025 (ไล่ cause เผื่อถูกห่อ) ◂ */
function isWalletMissing(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; cause?: unknown };
    if (o.code === "P2025") return true;
    cur = o.cause;
  }
  return false;
}

/** SVC D.14 (R1) ▸ unique ชน — Prisma P2002 (ไล่ cause/driver adapter เผื่อถูกห่อ · 23505 = รหัส pg ของตัวเดียวกัน) ◂ */
function isRefDuplicate(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "P2002" || o.code === "23505" || o.originalCode === "23505") return true;
    const meta = o.meta && typeof o.meta === "object" ? (o.meta as { driverAdapterError?: unknown }) : null;
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return false;
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
  const cost = totalCostMicro(input);
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
