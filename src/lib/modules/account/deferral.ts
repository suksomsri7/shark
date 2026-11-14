// ACC T5.10 (I12 I5 J11) — รายได้รับล่วงหน้าทยอยรับรู้ · ชนิดเงินประกันต่อรายการ · ใครออกส่วนลด · design note ledger/wo-notes/T5.10.md
//
// รายได้รับล่วงหน้า (TFRS for NPAEs 18.19 บริการรับรู้ตามขั้นความสำเร็จ [V] · ภาษีเงินได้เกณฑ์สิทธิ ม.65 [V] — skill domain-accounting-books §ข · domain-business-income-tax §ก3):
//   ตั้ง   = JV เดือนเริ่ม: Dr รายได้ (บัญชีที่เอกสารขายลงไว้) / Cr รายได้รับล่วงหน้า ทั้งก้อน  (คีย์ AccountDeferral#<id>#SETUP)
//   รับรู้ = JV ต่อเดือน:  Dr รายได้รับล่วงหน้า / Cr รายได้ = ยอด ÷ จำนวนเดือน (เดือนสุดท้ายรับเศษ)  (คีย์ AccountDeferral#<id>#M:<YYYY-MM>) — รันซ้ำได้ ไม่ซ้ำ
//   ยกเลิก = กลับรายการทุกใบของตาราง (reverseFor) ⇒ ยอดกลับเท่าเดิมก่อนตั้ง · ไม่มีการแก้/ลบ JV เดิม (ด่าน T4.4)
//   🔴 จุดรับผิดภาษีมูลค่าเพิ่ม/ใบกำกับไม่เปลี่ยน — ตารางนี้ย้ายเฉพาะ "รายได้ทางบัญชี" · VAT ยังเกิดตามเอกสารเดิม (คำเตือน DEFERRED_REVENUE_TAX_POINT)
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { postManualJV, reverseFor } from "./gl";

export type DefCtx = { tenantId: string; systemId: string };
const KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DEFERRAL_REF = "AccountDeferral";
export const DEFAULT_DEFERRED_CODE = "2110"; // เงินมัดจำรับ/เงินรับล่วงหน้า (ผังมาตรฐาน) — ร้านเลือกบัญชีอื่นได้

function shift(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}
const monthDate = (key: string) => new Date(`${key}-01T12:00:00+07:00`);

/** ตารางรับรู้ (pure): ยอดต่อเดือน · เดือนสุดท้ายรับเศษ */
export function deferralSchedule(totalSatang: number, startMonth: string, months: number): { month: string; amountSatang: number }[] {
  const per = Math.floor(totalSatang / months);
  return Array.from({ length: months }, (_, i) => ({ month: shift(startMonth, i), amountSatang: i === months - 1 ? totalSatang - per * (months - 1) : per }));
}

export type CreateDeferralInput = {
  description: string;
  totalSatang: number;
  startMonth: string;
  months: number;
  incomeAccountCode: string;
  deferredAccountCode?: string | null;
  documentId?: string | null;
  createdById?: string | null;
};
export type DeferralView = {
  id: string;
  description: string;
  documentId: string | null;
  docNo: string | null;
  totalSatang: number;
  startMonth: string;
  months: number;
  status: string;
  incomeAccountCode: string;
  deferredAccountCode: string;
  recognizedSatang: number;
  remainingSatang: number;
  schedule: { month: string; amountSatang: number; posted: boolean; entryId: string | null }[];
  cancelReason: string | null;
};

async function ledgerByCode(ctx: DefCtx, code: string) {
  return tenantDb(ctx).accountLedger.findFirst({ where: { systemId: ctx.systemId, code, archivedAt: null }, select: { id: true, code: true, type: true } });
}

export function deferralWarnings(): LegalWarning[] {
  return [legalWarning("DEFERRED_REVENUE_TAX_POINT")];
}

/** ตั้งตารางรับรู้ + JV ตั้งยอด (ในธุรกรรมเดียว) */
export async function createDeferral(ctx: DefCtx, input: CreateDeferralInput): Promise<{ ok: true; id: string; warnings: LegalWarning[] } | { ok: false; reason: string }> {
  const description = (input.description ?? "").trim();
  if (!description) return { ok: false, reason: "กรุณาระบุรายการ" };
  if (!Number.isInteger(input.totalSatang) || input.totalSatang <= 0) return { ok: false, reason: "ยอดต้องมากกว่า 0" };
  if (!KEY.test(input.startMonth)) return { ok: false, reason: "เดือนเริ่มต้องเป็น YYYY-MM" };
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 120) return { ok: false, reason: "จำนวนเดือนต้องอยู่ระหว่าง 1–120" };
  const inc = await ledgerByCode(ctx, input.incomeAccountCode);
  if (!inc || inc.type !== "INCOME") return { ok: false, reason: `ไม่พบบัญชีรายได้ ${input.incomeAccountCode}` };
  const def = await ledgerByCode(ctx, (input.deferredAccountCode ?? "").trim() || DEFAULT_DEFERRED_CODE);
  if (!def || def.type !== "LIABILITY") return { ok: false, reason: "ไม่พบบัญชีรายได้รับล่วงหน้า (ประเภทหนี้สิน)" };
  if (input.documentId) {
    const d = await tenantDb(ctx).accountDocument.findFirst({ where: { id: input.documentId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true } });
    if (!d) return { ok: false, reason: "ไม่พบเอกสารที่อ้าง" };
  }
  const id = await tenantDb(ctx).$transaction(async (tx) => {
    const row = await tx.accountDeferral.create({
      data: { tenantId: ctx.tenantId, systemId: ctx.systemId, documentId: input.documentId ?? null, description, totalSatang: input.totalSatang, startMonth: input.startMonth, months: input.months, incomeAccountId: inc.id, deferredAccountId: def.id, createdById: input.createdById ?? null },
      select: { id: true },
    });
    await postManualJV(
      ctx,
      {
        date: monthDate(input.startMonth),
        memo: `ตั้งรายได้รับล่วงหน้า: ${description}`,
        postedById: input.createdById ?? undefined,
        lines: [
          { accountId: inc.id, debit: input.totalSatang, credit: 0 },
          { accountId: def.id, debit: 0, credit: input.totalSatang },
        ],
        ref: { refType: DEFERRAL_REF, refId: row.id, event: "SETUP" },
      },
      tx as unknown as Prisma.TransactionClient,
    );
    return row.id;
  });
  return { ok: true, id, warnings: deferralWarnings() };
}

/** รับรู้รายได้ของทุกตารางที่ ACTIVE ถึงเดือน `upTo` (รวมเดือนนั้น) — รันซ้ำได้ (คีย์ต่อเดือน) */
export async function recognizeDeferrals(ctx: DefCtx, upTo: string, opts: { deferralId?: string; postedById?: string | null } = {}): Promise<{ posted: { deferralId: string; month: string; amountSatang: number; entryId: string }[] }> {
  if (!KEY.test(upTo)) throw new Error("เดือนต้องเป็น YYYY-MM");
  const rows = await tenantDb(ctx).accountDeferral.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE", ...(opts.deferralId ? { id: opts.deferralId } : {}) } });
  const posted: { deferralId: string; month: string; amountSatang: number; entryId: string }[] = [];
  for (const r of rows) {
    const sched = deferralSchedule(r.totalSatang, r.startMonth, r.months);
    for (const s of sched) {
      if (s.month > upTo) break;
      const key = `${DEFERRAL_REF}#${r.id}#M:${s.month}`;
      const exists = await tenantDb(ctx).accountJournalEntry.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: key }, select: { id: true } });
      if (exists) continue;
      const out = await postManualJV(ctx, {
        date: monthDate(s.month),
        memo: `รับรู้รายได้ ${s.month}: ${r.description}`,
        postedById: opts.postedById ?? undefined,
        lines: [
          { accountId: r.deferredAccountId, debit: s.amountSatang, credit: 0 },
          { accountId: r.incomeAccountId, debit: 0, credit: s.amountSatang },
        ],
        ref: { refType: DEFERRAL_REF, refId: r.id, event: `M:${s.month}` },
      });
      posted.push({ deferralId: r.id, month: s.month, amountSatang: s.amountSatang, entryId: out.entryId });
    }
    if (sched[sched.length - 1]!.month <= upTo) await tenantDb(ctx).accountDeferral.updateMany({ where: { id: r.id, tenantId: ctx.tenantId, status: "ACTIVE" }, data: { status: "DONE" } });
  }
  return { posted };
}

/** ยกเลิกตาราง = กลับรายการทุก JV ของตาราง (ตั้ง + รับรู้แล้ว) · เหตุผลบังคับ */
export async function cancelDeferral(ctx: DefCtx, id: string, reason: string): Promise<{ ok: true; reversed: number } | { ok: false; reason: string }> {
  const why = (reason ?? "").trim();
  if (!why) return { ok: false, reason: "กรุณาระบุเหตุผลการยกเลิก" };
  const r = await tenantDb(ctx).accountDeferral.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!r) return { ok: false, reason: "ไม่พบตารางนี้" };
  if (r.status === "CANCELLED") return { ok: false, reason: "ยกเลิกไปแล้ว" };
  const n = await tenantDb(ctx).$transaction(async (tx) => {
    const rev = await reverseFor(ctx, DEFERRAL_REF, id, `ยกเลิกรายได้รับล่วงหน้า: ${why}`, tx as unknown as Prisma.TransactionClient);
    await tx.accountDeferral.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { status: "CANCELLED", cancelReason: why, cancelledAt: new Date() } });
    return rev.length;
  });
  return { ok: true, reversed: n };
}

export async function listDeferrals(ctx: DefCtx): Promise<DeferralView[]> {
  const rows = await tenantDb(ctx).accountDeferral.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, orderBy: [{ createdAt: "desc" }] });
  if (!rows.length) return [];
  const ledgerIds = [...new Set(rows.flatMap((r) => [r.incomeAccountId, r.deferredAccountId]))];
  const leds = new Map((await tenantDb(ctx).accountLedger.findMany({ where: { id: { in: ledgerIds } }, select: { id: true, code: true } })).map((l) => [l.id, l.code]));
  const docIds = rows.map((r) => r.documentId).filter(Boolean) as string[];
  const docs = new Map((docIds.length ? await tenantDb(ctx).accountDocument.findMany({ where: { id: { in: docIds } }, select: { id: true, docNo: true } }) : []).map((d) => [d.id, d.docNo]));
  const entries = await tenantDb(ctx).accountJournalEntry.findMany({ where: { systemId: ctx.systemId, refType: DEFERRAL_REF, refId: { in: rows.map((r) => r.id) }, reversalOfId: null }, select: { id: true, refId: true, idempotencyKey: true, status: true } });
  return rows.map((r) => {
    const mine = entries.filter((e) => e.refId === r.id);
    const schedule = deferralSchedule(r.totalSatang, r.startMonth, r.months).map((s) => {
      const e = mine.find((x) => x.idempotencyKey === `${DEFERRAL_REF}#${r.id}#M:${s.month}`);
      return { ...s, posted: !!e && e.status === "POSTED", entryId: e?.id ?? null };
    });
    const recognizedSatang = schedule.filter((s) => s.posted).reduce((a, s) => a + s.amountSatang, 0);
    return {
      id: r.id,
      description: r.description,
      documentId: r.documentId,
      docNo: r.documentId ? docs.get(r.documentId) ?? null : null,
      totalSatang: r.totalSatang,
      startMonth: r.startMonth,
      months: r.months,
      status: r.status,
      incomeAccountCode: leds.get(r.incomeAccountId) ?? "",
      deferredAccountCode: leds.get(r.deferredAccountId) ?? "",
      recognizedSatang,
      remainingSatang: r.status === "CANCELLED" ? 0 : r.totalSatang - recognizedSatang,
      schedule,
      cancelReason: r.cancelReason,
    };
  });
}

// ─────────────────── I5 ชนิดเงินประกันต่อรายการ ───────────────────

export const DEPOSIT_KINDS = ["NONE", "REAL_ESTATE", "SERVICE_VAT", "HOTEL_DAMAGE"] as const;
export type DepositKind = (typeof DEPOSIT_KINDS)[number];
export const DEPOSIT_KIND_LABEL_TH: Record<DepositKind, string> = {
  NONE: "ไม่ใช่เงินประกัน",
  REAL_ESTATE: "เงินประกันการเช่าอสังหาริมทรัพย์ (หอพัก/ห้องเช่า)",
  SERVICE_VAT: "เงินประกันของบริการ/ของที่มีภาษีมูลค่าเพิ่ม (มิเตอร์ คีย์การ์ด บัตรจอดรถ)",
  HOTEL_DAMAGE: "เงินประกันความเสียหายตอนเช็กอินโรงแรม",
};

/**
 * คำเตือนของชนิดเงินประกันเทียบอัตรา VAT ที่ตั้งบนรายการ (ไม่บล็อก)
 *   SERVICE_VAT ค่าเริ่ม = คิด VAT ตอนรับ + ใบลดหนี้ตอนคืน (กค 0811/90 [V]) — ตั้งไม่มี VAT ⇒ เตือน
 *   REAL_ESTATE = ส่วนหนึ่งของค่าเช่าอสังหาฯ ยกเว้น VAT (ป.73/2541 ข้อ 2(3)(ง) [V]) — ตั้งมี VAT ⇒ เตือน
 *   HOTEL_DAMAGE = [U] ค่าเริ่มหนี้สินไม่ออกใบกำกับ + เตือนเสมอ
 */
export function depositKindWarnings(kind: string | null | undefined, vatRateBp: number, vatRegistered: boolean): LegalWarning[] {
  if (!vatRegistered) return [];
  if (kind === "SERVICE_VAT" && vatRateBp <= 0) return [legalWarning("DEPOSIT_SERVICE_VAT_EXPECTED")];
  if (kind === "REAL_ESTATE" && vatRateBp > 0) return [legalWarning("DEPOSIT_REAL_ESTATE_EXEMPT")];
  if (kind === "HOTEL_DAMAGE") return [legalWarning("DEPOSIT_HOTEL_DAMAGE_REVIEW")];
  return [];
}

// ─────────────────── J11 ใครออกส่วนลด ───────────────────
export const DISCOUNT_FUNDERS = ["SHOP", "PLATFORM", "SHARED"] as const;
export type DiscountFunder = (typeof DISCOUNT_FUNDERS)[number];
export const DISCOUNT_FUNDER_LABEL_TH: Record<DiscountFunder, string> = { SHOP: "ร้านออกเอง", PLATFORM: "แพลตฟอร์มออก", SHARED: "ออกร่วมกัน" };

export function discountFunderWarnings(funder: string | null | undefined, discountSatang: number): LegalWarning[] {
  if (!discountSatang || discountSatang <= 0) return [];
  if (funder === "PLATFORM" || funder === "SHARED") return [legalWarning("PLATFORM_DISCOUNT_FUNDER", { funder: DISCOUNT_FUNDER_LABEL_TH[funder] })];
  return [];
}

/** ตั้งชนิดเงินประกันของสินค้า/บริการ */
export async function setProductDepositKind(ctx: DefCtx, productId: string, kind: DepositKind | null): Promise<{ ok: true; warnings: LegalWarning[] } | { ok: false; reason: string }> {
  const p = await tenantDb(ctx).accountProduct.findFirst({ where: { id: productId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, vatRateBp: true } });
  if (!p) return { ok: false, reason: "ไม่พบสินค้า/บริการนี้" };
  if (kind !== null && !(DEPOSIT_KINDS as readonly string[]).includes(kind)) return { ok: false, reason: "ชนิดเงินประกันไม่ถูกต้อง" };
  await tenantDb(ctx).accountProduct.updateMany({ where: { id: p.id, tenantId: ctx.tenantId }, data: { depositKind: kind === "NONE" ? null : kind } });
  const s = await tenantDb(ctx).accountSettings.findFirst({ where: { systemId: ctx.systemId }, select: { vatRegistered: true } }).catch(() => null);
  return { ok: true, warnings: depositKindWarnings(kind, p.vatRateBp, s?.vatRegistered ?? true) };
}

/** ตั้งผู้ออกส่วนลดของเอกสาร (ข้อมูลประกอบ) */
export async function setDiscountFunder(ctx: DefCtx, documentId: string, funder: DiscountFunder | null): Promise<{ ok: true; warnings: LegalWarning[] } | { ok: false; reason: string }> {
  const d = await tenantDb(ctx).accountDocument.findFirst({ where: { id: documentId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, discountAmount: true } });
  if (!d) return { ok: false, reason: "ไม่พบเอกสารนี้" };
  if (funder !== null && !(DISCOUNT_FUNDERS as readonly string[]).includes(funder)) return { ok: false, reason: "ผู้ออกส่วนลดไม่ถูกต้อง" };
  await tenantDb(ctx).accountDocument.updateMany({ where: { id: d.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { discountFundedBy: funder } });
  return { ok: true, warnings: discountFunderWarnings(funder, d.discountAmount) };
}
