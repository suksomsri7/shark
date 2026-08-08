// เครดิตผู้ช่วย AI 2 ชั้นแบบ Claude (Phase 4 · ledger/MOBILE_PLAN.md · docs/AI_LAYER.md)
//
// ทำไมต้อง 2 ชั้น: เพดานรายวันเดิม (AiUsage) กันค่าใช้จ่ายรวมได้ แต่ผู้ใช้คนเดียวยิงรัวใน 10 นาที
// ก็ยังกินโควตาทั้งวันของร้านหมด — ชั้น "หน้าต่าง 5 ชม." กันการใช้รวดเดียว · ชั้น "สัปดาห์" กันยอดรวม
//
// - 1 เครดิต = 1,000 weighted token · weighted = tokensIn + tokensOut×5 (ราคา output แพงกว่า input ~5 เท่า)
//   คูณน้ำหนักโมเดล (haiku=1 · sonnet=3 ตามส่วนต่างราคาจริง) → เครดิตสะท้อนเงินที่จ่ายจริง ไม่ใช่จำนวนครั้ง
// - หน้าต่าง 5 ชม. เริ่มนับที่ "ข้อความแรก" หลังหน้าต่างเดิมหมดอายุ (แบบ Claude) ไม่ใช่ช่องเวลาตายตัว
// - soft degrade: ใช้เกินเกณฑ์ → ลดชั้นเหลือ haiku ก่อน (ยังคุยได้) ค่อยตัดเมื่อครบเพดานจริง

import { prisma, tenantDb } from "@/lib/core/db";
import { FAST_MODEL, SMART_MODEL } from "./provider";

export type Ctx = { tenantId: string };
export type QuotaScope = "session" | "week";

export const SESSION_WINDOW_HOURS = 5;
const SESSION_WINDOW_MS = SESSION_WINDOW_HOURS * 3_600_000;
const WEEK_MS = 7 * 86_400_000;
const BKK_OFFSET_MS = 7 * 3_600_000; // ไทย = UTC+7 คงที่ (ไม่มี DST)

const CREDIT_TOKENS = 1_000; // 1 เครดิต = 1,000 weighted token
const OUTPUT_WEIGHT = 5; // token ขาออกแพงกว่าขาเข้า ~5 เท่า

/** น้ำหนักราคาของโมเดล (เทียบ haiku = 1) — โมเดลที่ไม่รู้จัก/mock = 1 (ไม่ลงโทษข้อสอบ) */
export function modelWeight(model: string): number {
  const m = String(model ?? "").toLowerCase();
  if (m.includes("sonnet")) return 3;
  if (m.includes("opus")) return 15;
  return 1;
}

/** เครดิตที่ใช้ไปของการเรียก 1 ครั้ง — ใช้จริงแต่ปัดได้ 0 → คิดขั้นต่ำ 1 (ห้ามมีการใช้ฟรี) */
export function creditsFor(model: string, tokensIn: number, tokensOut: number): number {
  const tin = Math.max(0, Math.round(tokensIn || 0));
  const tout = Math.max(0, Math.round(tokensOut || 0));
  if (tin + tout === 0) return 0;
  const weighted = (tin + tout * OUTPUT_WEIGHT) * modelWeight(model);
  return Math.max(1, Math.ceil(weighted / CREDIT_TOKENS));
}

/** จันทร์ 00:00 เวลาไทย ของสัปดาห์ที่เวลานั้นตกอยู่ (คืนเป็น Date UTC จริง) */
export function weekStartBangkok(d: Date): Date {
  const bkk = new Date(d.getTime() + BKK_OFFSET_MS);
  const dow = (bkk.getUTCDay() + 6) % 7; // จันทร์ = 0
  const midnightBkk = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate());
  return new Date(midnightBkk - dow * 86_400_000 - BKK_OFFSET_MS);
}

/** ลดชั้นโมเดลเมื่อใกล้เต็มโควตา — แตะเฉพาะชั้น SMART (โมเดลอื่น/บังคับเองไม่ยุ่ง) */
export function applyDegrade(model: string, degraded: boolean): string {
  if (!degraded) return model;
  return model === SMART_MODEL ? FAST_MODEL : model;
}

export type QuotaLimits = {
  sessionCredits: number;
  weeklyCredits: number;
  degradeAtPct: number; // ≥ เท่านี้ = ลดชั้นเหลือ haiku
  warnAtPct: number; // ≥ เท่านี้ = เตือนผู้ใช้ใน UI
};

const envNum = (key: string, fallback: number): number => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/**
 * เพดานต่อ plan — ตอนนี้มี FREE ตัวเดียว (ราคาแพ็กเกจจริงรอเจ้าของเคาะ ดู ledger/OWNER_TODO.md ข้อ 6)
 * ตั้ง env ทับได้ทุกค่า → เปิด PRO ทีหลังแค่เพิ่มบรรทัดในตารางนี้ ไม่ต้องแก้ตรรกะ
 */
export function planLimits(plan?: string | null): QuotaLimits {
  const base: Record<string, { session: number; weekly: number }> = {
    FREE: { session: 1_200, weekly: 6_000 },
  };
  const row = base[String(plan ?? "FREE").toUpperCase()] ?? base.FREE;
  return {
    sessionCredits: envNum("SHARK_AI_SESSION_CREDITS", row.session),
    weeklyCredits: envNum("SHARK_AI_WEEKLY_CREDITS", row.weekly),
    degradeAtPct: envNum("SHARK_AI_DEGRADE_PCT", 0.7),
    warnAtPct: envNum("SHARK_AI_WARN_PCT", 0.8),
  };
}

export type QuotaLayer = { used: number; limit: number; pct: number; resetAt: Date };
export type QuotaStatus = {
  session: QuotaLayer;
  week: QuotaLayer;
  degraded: boolean;
  warn: boolean;
  blocked: QuotaScope | null;
};

/** ปัดลงเป็นนาที — ทำให้ unique key ชนกันเมื่อสองคำขอเปิดหน้าต่างพร้อมกัน (กันหน้าต่างซ้ำ) */
function floorToMinute(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000);
}

/** แถว SESSION ที่ยังไม่หมดอายุ ณ เวลานั้น (ไม่มี = ยังไม่เริ่มหน้าต่าง) */
async function currentSessionRow(ctx: Ctx, now: Date) {
  return tenantDb(ctx).aiUsageWindow.findFirst({
    where: { kind: "SESSION", windowStart: { gt: new Date(now.getTime() - SESSION_WINDOW_MS) } },
    orderBy: { windowStart: "desc" },
  });
}

const pctOf = (used: number, limit: number) => (limit > 0 ? Math.min(1, used / limit) : 0);

/** สถานะโควตาปัจจุบันของร้าน — UI + guard ใช้ตัวเดียวกัน (แหล่งความจริงเดียว) */
export async function getQuotaStatus(ctx: Ctx, now: Date = new Date()): Promise<QuotaStatus> {
  const weekStart = weekStartBangkok(now);
  const [tenant, sessionRow, weekRow] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { plan: true } }),
    currentSessionRow(ctx, now),
    tenantDb(ctx).aiUsageWindow.findFirst({ where: { kind: "WEEK", windowStart: weekStart } }),
  ]);
  const lim = planLimits(tenant?.plan);

  const sessionUsed = sessionRow?.credits ?? 0;
  const weekUsed = weekRow?.credits ?? 0;
  const session: QuotaLayer = {
    used: sessionUsed,
    limit: lim.sessionCredits,
    pct: pctOf(sessionUsed, lim.sessionCredits),
    // ยังไม่เริ่มหน้าต่าง → หน้าต่างจะเริ่มนับตอนพิมพ์ข้อความแรก (โชว์เต็ม 5 ชม. นับจากตอนนี้)
    resetAt: new Date((sessionRow?.windowStart ?? now).getTime() + SESSION_WINDOW_MS),
  };
  const week: QuotaLayer = {
    used: weekUsed,
    limit: lim.weeklyCredits,
    pct: pctOf(weekUsed, lim.weeklyCredits),
    resetAt: new Date(weekStart.getTime() + WEEK_MS),
  };

  const blocked: QuotaScope | null =
    session.used >= session.limit ? "session" : week.used >= week.limit ? "week" : null;
  const worst = Math.max(session.pct, week.pct);
  return {
    session,
    week,
    degraded: blocked === null && worst >= lim.degradeAtPct,
    warn: worst >= lim.warnAtPct,
    blocked,
  };
}

/**
 * บันทึกเครดิตที่ใช้ไป — บวกทั้ง 2 ชั้น (คืนจำนวนเครดิตที่หัก)
 * หน้าต่าง SESSION: ต่อของเดิมถ้ายังไม่หมดอายุ ไม่งั้นเปิดใหม่ที่เวลานี้ (unique ชน = แข่งกันเปิด → บวกทับแถวที่ชนะ)
 */
export async function recordQuotaUsage(
  ctx: Ctx,
  input: { model: string; tokensIn: number; tokensOut: number },
  now: Date = new Date(),
): Promise<number> {
  const credits = creditsFor(input.model, input.tokensIn, input.tokensOut);
  if (credits <= 0) return 0;

  const existing = await currentSessionRow(ctx, now);
  const sessionStart = existing?.windowStart ?? floorToMinute(now);
  const bump = { credits: { increment: credits }, requests: { increment: 1 } };

  for (const [kind, windowStart] of [
    ["SESSION", sessionStart],
    ["WEEK", weekStartBangkok(now)],
  ] as const) {
    await prisma.aiUsageWindow.upsert({
      where: { tenantId_kind_windowStart: { tenantId: ctx.tenantId, kind, windowStart } },
      create: { tenantId: ctx.tenantId, kind, windowStart, credits, requests: 1 },
      update: bump,
    });
  }
  return credits;
}

/** ข้อความไทยสุภาพเมื่อโควตาหมด — บอกด้วยว่ากลับมาใช้ได้เมื่อไหร่ (UI ทุกช่องทางใช้ตัวเดียวกัน) */
export function quotaMessage(
  scope?: QuotaScope | "day" | "credit" | null,
  resetAt?: string | Date | null,
): string {
  // เครดิตหมด = ไม่มี "รอบใหม่" ให้รอ ต้องเติมเท่านั้น (โมเดล prepaid ตั้งแต่ 8 ส.ค. 2026)
  if (scope === "credit") {
    return "เครดิตผู้ช่วย AI หมดแล้วครับ — เติมเครดิตที่ ตั้งค่า → เครดิต AI แล้วคุยกันต่อได้ทันที";
  }
  const when = resetAt ? new Date(resetAt) : null;
  const timeTh =
    when && !Number.isNaN(when.getTime())
      ? new Intl.DateTimeFormat("th-TH", {
          timeZone: "Asia/Bangkok",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(when)
      : null;
  if (scope === "week") {
    return `ใช้ผู้ช่วย AI ครบโควตาสัปดาห์นี้แล้ว${timeTh ? ` โควตาชุดใหม่เริ่ม ${timeTh} น.` : " รอสัปดาห์หน้านะครับ"}`;
  }
  if (scope === "session") {
    return `คุยกันเยอะเลยครับ ช่วงนี้ใช้ครบโควตาแล้ว${timeTh ? ` กลับมาคุยกันต่อได้ ${timeTh} น.` : " อีกสักครู่ค่อยลองใหม่นะครับ"}`;
  }
  return `วันนี้ใช้ผู้ช่วย AI ครบโควตาแล้ว${timeTh ? ` กลับมาใช้ได้ ${timeTh} น.` : " พรุ่งนี้กลับมาคุยกันใหม่ได้เลย"}`;
}
