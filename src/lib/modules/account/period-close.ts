// period-close.ts — ปิดงวดบัญชี V2 (WO 6.2 · DESIGN-SPEC-V2 §11.4)
//
// ของเดิมที่ห้ามเขียนใหม่: `gl.closePeriod` (ตัดสินจริงว่าปิดได้ไหม + upsert สถานะ) · `gl.reopenPeriod` ·
//                        `period-sweep.sweepAutoClosePeriods` (cron ปิดอัตโนมัติ — ไม่แตะ)
// ที่เพิ่มในนี้: **เช็กลิสต์ก่อนปิด** 4 ข้อที่คิดฝั่ง server แล้วแสดงบนหน้า (ผู้ใช้เห็นเหตุผลก่อนกดปุ่ม)
//
// ข้อบังคับ (blocking) vs ข้อเตือน (warning) — ตามใบสั่งงาน WO 6.2 / §9.3:
//   1) บัญชีพัก 9999 = 0                    → **บังคับ** (gl.closePeriod ปฏิเสธเองอยู่แล้ว)
//   2) ไม่มีใบสำคัญติดธง ⚑ ต้องตรวจ         → **บังคับ** (gl.closePeriod ปฏิเสธเองอยู่แล้ว)
//   3) กระทบยอดธนาคารครบทุกช่องทาง          → เตือน (ช่องทางที่ยังไม่นำเข้า statement = "ยังไม่นำเข้า")
//   4) ยื่น ภ.พ.30 ของงวดแล้ว               → เตือน
// 🔴 ข้อ 1–2 ที่นี่เป็นแค่ "กระจกสะท้อน" ของกติกาใน gl.closePeriod — ความจริงตัดสินที่ gl เสมอ
//    (ถ้าสองที่ไม่ตรงกัน gl ชนะ · ข้อสอบ qc-acc-v2-period-assets ตรวจว่าสองที่ให้คำตอบเดียวกัน)

import { tenantDb } from "@/lib/core/db";
import { closePeriod, reopenPeriod } from "./gl";
import { reconcileBlock, listReconcilableChannels } from "./reconcile";

export type PeriodCtx = { tenantId: string; systemId: string };

export type ChecklistState = "PASS" | "FAIL" | "UNKNOWN";

export type ChecklistItem = {
  key: "SUSPENSE" | "NEEDS_REVIEW" | "RECONCILE" | "VAT";
  label: string;
  /** true = ไม่ผ่านแล้วปิดงวดไม่ได้ · false = แค่เตือน */
  blocking: boolean;
  state: ChecklistState;
  /** ข้อความรายละเอียดไทย (เช่น "คงเหลือ 1,000.00 บาท" / "2 รายการ") */
  detail: string;
};

export type PeriodChecklist = {
  periodKey: string;
  items: ChecklistItem[];
  /** ปิดงวดได้ไหม = ทุกข้อ blocking ผ่านหมด */
  canClose: boolean;
  /** จำนวนข้อเตือนที่ยังไม่ผ่าน (ปิดได้แต่ควรรู้) */
  warnings: number;
};

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ตรวจว่ารูปแบบเป็น "YYYY-MM" */
export function isPeriodKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/**
 * เช็กลิสต์ก่อนปิดงวด (§11.4) — คิดสด ๆ จากข้อมูลจริง ไม่มีค่า hardcode
 * ⚠️ ข้อ 1 ใช้ `periodKey <= งวดนี้` (ยอด**สะสม**ถึงสิ้นงวด) ให้ตรงกับ gl.closePeriod เป๊ะ
 *    ถ้าเปลี่ยนเป็น "เฉพาะงวดนี้" หน้าจะบอกว่าปิดได้แต่ gl ปฏิเสธ = ผู้ใช้งง
 */
export async function periodChecklist(ctx: PeriodCtx, periodKey: string): Promise<PeriodChecklist> {
  const db = tenantDb(ctx);

  // ── ข้อ 1: บัญชีพัก 9999 ต้องเคลียร์ (ยอดสะสมถึงสิ้นงวด = 0)
  const suspense = await db.accountLedger.findFirst({ where: { code: "9999" }, select: { id: true } });
  let suspenseNet = 0;
  if (suspense) {
    const agg = await db.accountJournalLine.aggregate({
      where: { accountId: suspense.id, entry: { status: "POSTED", periodKey: { lte: periodKey } } },
      _sum: { debit: true, credit: true },
    });
    suspenseNet = (agg._sum.debit ?? 0) - (agg._sum.credit ?? 0);
  }

  // ── ข้อ 2: ไม่มีใบสำคัญติดธง ⚑ ในงวด
  const flagged = await db.accountJournalEntry.count({
    where: { periodKey, status: "POSTED", needsReview: true },
  });

  // ── ข้อ 3: กระทบยอดครบทุกช่องทางที่มี statement ของเดือนนั้น
  const channels = await listReconcilableChannels(ctx);
  const blocks = await Promise.all(channels.map((c) => reconcileBlock(ctx, c.id, periodKey)));
  const withStatement = blocks.filter((b) => b && b.statementBalanceSatang != null);
  const confirmed = withStatement.filter((b) => b!.confirmed).length;
  const notImported = channels.length - withStatement.length;

  // ── ข้อ 4: ยื่น ภ.พ.30 ของงวดแล้ว
  const vat = await db.accountVatFiling.findFirst({ where: { periodKey }, select: { filedAt: true } });

  const items: ChecklistItem[] = [
    {
      key: "SUSPENSE",
      label: "บัญชีพักรายการ (9999) เคลียร์แล้ว",
      blocking: true,
      state: suspenseNet === 0 ? "PASS" : "FAIL",
      // แสดงเป็นจำนวนบวก + บอกด้าน (เดบิต/เครดิต) — เลขติดลบบนหน้าจอทำให้ผู้ใช้ตีความผิดว่า "ติดลบ = ผิด 2 เท่า"
      detail:
        suspenseNet === 0
          ? "คงเหลือ 0.00 บาท"
          : `ยังคงเหลือ ${baht(Math.abs(suspenseNet))} บาท (ด้าน${suspenseNet > 0 ? "เดบิต" : "เครดิต"})`,
    },
    {
      key: "NEEDS_REVIEW",
      label: "ไม่มีใบสำคัญที่ต้องตรวจ (⚑)",
      blocking: true,
      state: flagged === 0 ? "PASS" : "FAIL",
      detail: flagged === 0 ? "ไม่มีรายการค้างตรวจ" : `ยังมี ${flagged} รายการรอตรวจ`,
    },
    {
      key: "RECONCILE",
      label: "กระทบยอดธนาคารครบทุกช่องทาง",
      blocking: false,
      state:
        channels.length === 0
          ? "PASS"
          : notImported > 0
            ? "UNKNOWN"
            : confirmed === withStatement.length
              ? "PASS"
              : "FAIL",
      detail:
        channels.length === 0
          ? "ไม่มีช่องทางที่ต้องกระทบยอด"
          : notImported > 0
            ? `ยังไม่นำเข้า statement ${notImported} ช่องทาง · ยืนยันแล้ว ${confirmed}/${withStatement.length}`
            : `ยืนยันแล้ว ${confirmed}/${withStatement.length} ช่องทาง`,
    },
    {
      key: "VAT",
      label: "ยื่น ภ.พ.30 ของงวดแล้ว",
      blocking: false,
      state: vat ? "PASS" : "FAIL",
      detail: vat ? "ทำเครื่องหมายยื่นแล้ว" : "ยังไม่ได้ทำเครื่องหมายยื่น",
    },
  ];

  return {
    periodKey,
    items,
    canClose: items.every((i) => !i.blocking || i.state === "PASS"),
    warnings: items.filter((i) => !i.blocking && i.state !== "PASS").length,
  };
}

// ─────────────────── ตารางงวด (§11.4) ───────────────────

export type PeriodRow = {
  periodKey: string;
  /** ป้ายไทย เช่น "กันยายน 2026" */
  label: string;
  status: "OPEN" | "CLOSED";
  closedAt: Date | null;
  closedByName: string | null;
  reopenedAt: Date | null;
  reopenCount: number;
  /** งวดนี้มีใบสำคัญกี่ใบ (งวดว่าง = ปิดได้ทันที) */
  entryCount: number;
  /** งวดปัจจุบันตามเวลาไทย (ห้ามปิดงวดที่ยังไม่จบ — เตือนเฉย ๆ ไม่บล็อก) */
  isCurrent: boolean;
};

const TH_MONTH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export function periodLabel(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  return `${TH_MONTH[m - 1] ?? periodKey} ${y}`;
}

/** งวดปัจจุบันตามเวลาไทย ("YYYY-MM") */
export function currentPeriodKey(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7);
}

/**
 * ตารางงวดของหน้า §11.4 — งวดที่มีแถวใน AccountPeriod **บวก** งวดที่มีใบสำคัญแต่ยังไม่เคยสร้างแถว
 * (งวดที่ยังไม่มีแถว = เปิดอยู่ตามนิยามของ gl.assertPeriodOpen — ต้องเห็นในตารางด้วย ไม่งั้นปิดไม่ได้)
 */
export async function listPeriods(ctx: PeriodCtx, now: Date = new Date()): Promise<PeriodRow[]> {
  const db = tenantDb(ctx);
  const [rows, grouped] = await Promise.all([
    db.accountPeriod.findMany({ orderBy: { periodKey: "desc" } }),
    db.accountJournalEntry.groupBy({ by: ["periodKey"], _count: { _all: true } }),
  ]);
  const countByKey = new Map(grouped.map((g) => [g.periodKey, g._count._all]));
  const byKey = new Map(rows.map((r) => [r.periodKey, r]));
  const cur = currentPeriodKey(now);

  const keys = [...new Set([...byKey.keys(), ...countByKey.keys(), cur])].sort().reverse();

  const userIds = [...new Set(rows.map((r) => r.closedById).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return keys.map((periodKey) => {
    const r = byKey.get(periodKey);
    const log = Array.isArray(r?.reopenLog) ? (r!.reopenLog as unknown[]) : [];
    return {
      periodKey,
      label: periodLabel(periodKey),
      status: (r?.status ?? "OPEN") as "OPEN" | "CLOSED",
      closedAt: r?.closedAt ?? null,
      // "system-auto" = cron ปิดให้ (period-sweep) — ไม่ใช่ id ของผู้ใช้จริง
      closedByName: r?.closedById
        ? r.closedById === "system-auto"
          ? "ระบบ (อัตโนมัติ)"
          : (nameById.get(r.closedById) ?? "—")
        : null,
      reopenedAt: r?.reopenedAt ?? null,
      reopenCount: log.length,
      entryCount: countByKey.get(periodKey) ?? 0,
      isCurrent: periodKey === cur,
    };
  });
}

// ─────────────────── ปิด / เปิดงวด ───────────────────

export type ClosePeriodResult = { ok: true; checklist: PeriodChecklist } | { ok: false; reason: string };

/**
 * ปิดงวด — เก็บ snapshot เช็กลิสต์ไว้ใน `AccountPeriod.checklist` เมื่อปิดสำเร็จ
 * (ผู้ตรวจสอบย้อนดูได้ว่าปิดตอนสถานะไหน · โดยเฉพาะข้อเตือนที่ยอมข้าม)
 * ⚠️ การตัดสินยังอยู่ที่ `gl.closePeriod` เหมือนเดิม — ที่นี่แค่ห่อและบันทึกเพิ่ม
 */
export async function closePeriodWithChecklist(
  ctx: PeriodCtx,
  periodKey: string,
  userId: string,
): Promise<ClosePeriodResult> {
  if (!isPeriodKey(periodKey)) return { ok: false, reason: "รูปแบบงวดไม่ถูกต้อง (ต้องเป็น YYYY-MM)" };
  const checklist = await periodChecklist(ctx, periodKey);
  if (!checklist.canClose) {
    const bad = checklist.items.find((i) => i.blocking && i.state !== "PASS");
    return { ok: false, reason: `ปิดงวดไม่ได้ — ${bad?.label}: ${bad?.detail}` };
  }
  const r = await closePeriod(ctx, periodKey, userId);
  if (!r.ok) return { ok: false, reason: r.reason ?? "ปิดงวดไม่สำเร็จ" };

  await tenantDb(ctx).accountPeriod.updateMany({
    where: { periodKey },
    data: { checklist: checklist.items as never },
  });
  return { ok: true, checklist };
}

/** เปิดงวดที่ปิดแล้ว — ห่อ `gl.reopenPeriod` + ประทับ `reopenedAt` (สิทธิ์ `account.period.reopen` ตรวจที่ชั้น action) */
export async function reopenPeriodV2(
  ctx: PeriodCtx,
  periodKey: string,
  reason: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPeriodKey(periodKey)) return { ok: false, reason: "รูปแบบงวดไม่ถูกต้อง (ต้องเป็น YYYY-MM)" };
  if (reason.trim().length < 3) return { ok: false, reason: "กรุณาระบุเหตุผลในการเปิดงวดใหม่" };
  try {
    await reopenPeriod(ctx, periodKey, reason.trim(), userId);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "เปิดงวดไม่สำเร็จ" };
  }
  await tenantDb(ctx).accountPeriod.updateMany({ where: { periodKey }, data: { reopenedAt: new Date() } });
  return { ok: true };
}

// ─────────────────── ภ.พ.30 ยื่นแล้ว (เช็กลิสต์ข้อ 4) ───────────────────

/**
 * ทำเครื่องหมาย "ยื่น ภ.พ.30 ของงวดนี้แล้ว" — idempotent ต่อ (systemId, periodKey)
 * ยอดที่บันทึกมาจากหน้า ภ.พ.30 (reports.pp30) — เก็บไว้เป็นหลักฐานว่ายื่นด้วยตัวเลขเท่าไร
 */
export async function markVatFiled(
  ctx: PeriodCtx,
  input: { periodKey: string; salesVat: number; inputVat: number; userId: string; note?: string | null },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPeriodKey(input.periodKey)) return { ok: false, reason: "รูปแบบงวดไม่ถูกต้อง (ต้องเป็น YYYY-MM)" };
  const db = tenantDb(ctx);
  const existing = await db.accountVatFiling.findFirst({ where: { periodKey: input.periodKey }, select: { id: true } });
  if (existing) return { ok: false, reason: `งวด ${input.periodKey} ทำเครื่องหมายยื่นไปแล้ว` };
  await db.accountVatFiling.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      periodKey: input.periodKey,
      filedById: input.userId,
      salesVatSatang: input.salesVat,
      inputVatSatang: input.inputVat,
      payableSatang: input.salesVat - input.inputVat,
      note: input.note ?? null,
    },
  });
  return { ok: true };
}

/** ยกเลิกเครื่องหมายยื่น ภ.พ.30 (สิทธิ์ระดับเจ้าของ — เหมือน `account.wht.unfile`) */
export async function unmarkVatFiled(ctx: PeriodCtx, periodKey: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = tenantDb(ctx);
  const row = await db.accountVatFiling.findFirst({ where: { periodKey }, select: { id: true } });
  if (!row) return { ok: false, reason: "งวดนี้ยังไม่ได้ทำเครื่องหมายยื่น" };
  await db.accountVatFiling.delete({ where: { id: row.id } });
  return { ok: true };
}

/** งวดที่ทำเครื่องหมายยื่น ภ.พ.30 แล้ว (ใช้ติดป้ายในหน้า ภ.พ.30) */
export async function listVatFilings(ctx: PeriodCtx) {
  return tenantDb(ctx).accountVatFiling.findMany({ orderBy: { periodKey: "desc" } });
}
