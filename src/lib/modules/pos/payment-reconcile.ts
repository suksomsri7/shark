// payment-reconcile.ts — กระทบยอดใบขอรับเงิน PromptPay/Beam (P3-SKEL R9 · มติ §10-4 · CD-S7) — อ่านอย่างเดียว ไม่มีผลเงิน
//
// reportIntentReconcile: ใบขอรับเงิน (PosPaymentIntent) สถานะ PAID/CONSUMED ของสาขานี้ ในช่วงวันไทย [from, to] (รวมปลาย · วัน = วันไทยของ createdAt)
//   days = ต่อ (วัน, kind): webhookPaid · manualPaid · lateWebhook · paidNotConsumed · consumed · amountSatang
//   rows = ต่อใบ + flag ตามลำดับ REFUND_NEEDED (PAID แต่ไม่มีบิล — ต้องคืนเงิน) > LATE (webhook มาหลังหมดเวลา) >
//          SALE_REVERSED (บิลถูกยกเลิก/คืนเงินภายหลัง · fix1 H1) > AMOUNT_MISMATCH (สลิปยืนยันของใบนี้ยอดไม่ตรง · fix1 H1) >
//          NEEDS_CHECK (ยืนยันมือโดยไม่มีสลิป CONFIRMED ที่ผูกใบนี้และยอดตรง — ไม่มีหลักฐานธนาคาร) > OK
// reportIntentReconcileCsv: หัวตรึง date,intentId,kind,status,confirmedVia,lateWebhook,amountSatang,receiptNo,beamChargeId,slipStatus,flag (ไม่มีข้อมูลลูกค้า)
// importBeamSettlement: โครง — NOT_CONFIGURED จนกว่าเจ้าของส่งไฟล์ settlement ตัวอย่างของ Beam (รูปคอลัมน์ยังไม่รู้ · W4/W20) — ไม่เขียนอะไร
// 🔴 fact promptpayReconcile ใน pos-integrations.ts คง false (มติ §10-9) · สิทธิ์ pos.report.view ที่สาขา
import { evaluate } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { prisma } from "./db";

export const RECONCILE_CSV_HEADER = "date,intentId,kind,status,confirmedVia,lateWebhook,amountSatang,receiptNo,beamChargeId,slipStatus,flag";
export const RECONCILE_MAX_DAYS = 92;
/** fix1 H1: + SALE_REVERSED (บิลถูกยกเลิก/คืนเงินหลังรับเงิน) · AMOUNT_MISMATCH (สลิปที่ยืนยันแล้วของใบนี้ยอดไม่ตรง) */
export type ReconcileFlag = "REFUND_NEEDED" | "LATE" | "SALE_REVERSED" | "AMOUNT_MISMATCH" | "NEEDS_CHECK" | "OK";
export type ReconcileDay = { date: string; kind: string; webhookPaid: number; manualPaid: number; lateWebhook: number; paidNotConsumed: number; consumed: number; amountSatang: number };
export type ReconcileRow = {
  intentId: string;
  date: string;
  kind: string;
  status: string;
  confirmedVia: string | null;
  lateWebhook: boolean;
  amountSatang: number;
  saleId: string | null;
  receiptNo: string | null;
  beamChargeId: string | null;
  slipStatus: string | null;
  /** fix1 H1: สถานะบิลตอนอ่านรายงาน (PAID · VOIDED · REFUNDED) + ยอดคืนสะสม — คืนเงินหลังกระทบยอดก็เห็น */
  saleStatus: string | null;
  saleRefundedSatang: number;
  flag: ReconcileFlag;
};
export type ReconcileCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "NOT_CONFIGURED" | "UNKNOWN";
export type ReconcileRefusal = { ok: false; code: ReconcileCode; message: string };
export type ReconcileResult = { ok: true; from: string; to: string; days: ReconcileDay[]; rows: ReconcileRow[] } | ReconcileRefusal;
export type ReconcileCtx = { tenantId: string; systemId: string; unitId: string };
export type ReconcileActor = { userId: string; role: string; unitAccess?: unknown; permissions?: unknown };

const MSG: Record<ReconcileCode, string> = {
  NOT_FOUND: "ไม่พบจุดขายนี้",
  PERMISSION_DENIED: "ต้องมีสิทธิ์ดูรายงาน (pos.report.view) ที่สาขานี้",
  VALIDATION: "ช่วงวันที่ไม่ถูกต้อง",
  NOT_CONFIGURED: "นำเข้าไฟล์ settlement ของ Beam ยังไม่เปิด — รอไฟล์ตัวอย่างจากเจ้าของ (W4)",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const refuse = (code: ReconcileCode, message?: string): ReconcileRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const TH_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const thaiDate = (d: Date) => new Date(d.getTime() + TH_OFFSET_MS).toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** วันไทย YYYY-MM-DD → เวลาเริ่มวัน (UTC) · ผิดรูป = null */
function thaiDayStart(s: unknown): Date | null {
  if (typeof s !== "string" || !DATE_RE.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return null;
  return new Date(t - TH_OFFSET_MS);
}

function membershipOf(actor: unknown) {
  return isRecord(actor) && typeof actor.role === "string" && typeof actor.userId === "string" ? posMembership(actor as Parameters<typeof posMembership>[0]) : null;
}

const SLIP_RANK: Record<string, number> = { CONFIRMED: 3, UPLOADED: 2, REJECTED: 1 };

/** รายงานกระทบยอดใบขอรับเงิน (อ่านอย่างเดียว) */
export async function reportIntentReconcile(ctx: ReconcileCtx, actor: ReconcileActor, input: unknown): Promise<ReconcileResult> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
    const m = membershipOf(actor);
    if (!m || !evaluate(m, { module: "pos", action: "pos.report.view", unitId: ctx.unitId })) return refuse("PERMISSION_DENIED");
    const from = isRecord(input) ? thaiDayStart(input.from) : null;
    const to = isRecord(input) ? thaiDayStart(input.to) : null;
    if (!from || !to) return refuse("VALIDATION", "ระบุวันที่ from/to แบบ YYYY-MM-DD (วันไทย)");
    if (from.getTime() > to.getTime()) return refuse("VALIDATION", "วันเริ่มต้องไม่หลังวันสิ้นสุด");
    if ((to.getTime() - from.getTime()) / DAY_MS + 1 > RECONCILE_MAX_DAYS) return refuse("VALIDATION", `ช่วงยาวเกิน ${RECONCILE_MAX_DAYS} วัน`);
    const end = new Date(to.getTime() + DAY_MS);
    const intents = await prisma.posPaymentIntent.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId, status: { in: ["PAID", "CONSUMED"] }, createdAt: { gte: from, lt: end } },
      select: { id: true, kind: true, status: true, confirmedVia: true, lateWebhook: true, amountSatang: true, saleId: true, beamChargeId: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const saleIds = [...new Set(intents.map((i) => i.saleId).filter((x): x is string => !!x))];
    const intentIds = intents.map((i) => i.id);
    const [sales, slips] = await Promise.all([
      saleIds.length ? prisma.posSale.findMany({ where: { tenantId: ctx.tenantId, id: { in: saleIds } }, select: { id: true, receiptNo: true, status: true, refundedSatang: true } }) : [],
      intentIds.length || saleIds.length
        ? prisma.posPaymentSlip.findMany({
            where: { tenantId: ctx.tenantId, OR: [...(intentIds.length ? [{ intentId: { in: intentIds } }] : []), ...(saleIds.length ? [{ saleId: { in: saleIds } }] : [])] },
            select: { intentId: true, saleId: true, status: true, amountSatang: true },
          })
        : [],
    ]);
    const saleOf = new Map(sales.map((s) => [s.id, s]));
    const slipOf = (intentId: string, saleId: string | null): string | null => {
      let best: string | null = null;
      for (const s of slips) if (s.intentId === intentId || (saleId && s.saleId === saleId)) if (!best || (SLIP_RANK[s.status] ?? 0) > (SLIP_RANK[best] ?? 0)) best = s.status;
      return best;
    };
    const rows: ReconcileRow[] = intents.map((i) => {
      const slipStatus = slipOf(i.id, i.saleId);
      // fix1 H1: หลักฐานธนาคาร = สลิป CONFIRMED ที่ผูก "ใบขอรับเงินนี้" และยอดตรงทุกสตางค์ (สลิปบนแถวชำระอื่นของบิล/ไม่ระบุยอด ไม่นับ)
      const tied = slips.filter((s) => s.intentId === i.id && s.status === "CONFIRMED");
      const evidence = tied.some((s) => s.amountSatang === i.amountSatang);
      const mismatch = !evidence && tied.some((s) => s.amountSatang !== null && s.amountSatang !== i.amountSatang);
      const sale = i.saleId ? saleOf.get(i.saleId) : undefined;
      const reversed = !!sale && (sale.status === "VOIDED" || sale.status === "REFUNDED" || sale.refundedSatang > 0);
      const flag: ReconcileFlag =
        i.status === "PAID" && !i.saleId ? "REFUND_NEEDED" : i.lateWebhook ? "LATE" : reversed ? "SALE_REVERSED" : mismatch ? "AMOUNT_MISMATCH" : i.confirmedVia === "MANUAL" && !evidence ? "NEEDS_CHECK" : "OK";
      return {
        intentId: i.id,
        date: thaiDate(i.createdAt),
        kind: i.kind,
        status: i.status,
        confirmedVia: i.confirmedVia,
        lateWebhook: i.lateWebhook,
        amountSatang: i.amountSatang,
        saleId: i.saleId,
        receiptNo: sale?.receiptNo ?? null,
        beamChargeId: i.beamChargeId,
        slipStatus,
        saleStatus: sale?.status ?? null,
        saleRefundedSatang: sale?.refundedSatang ?? 0,
        flag,
      };
    });
    const byDay = new Map<string, ReconcileDay>();
    for (const r of rows) {
      const k = `${r.date}|${r.kind}`;
      const d = byDay.get(k) ?? { date: r.date, kind: r.kind, webhookPaid: 0, manualPaid: 0, lateWebhook: 0, paidNotConsumed: 0, consumed: 0, amountSatang: 0 };
      if (r.confirmedVia === "WEBHOOK") d.webhookPaid++;
      if (r.confirmedVia === "MANUAL") d.manualPaid++;
      if (r.lateWebhook) d.lateWebhook++;
      if (r.status === "PAID" && !r.saleId) d.paidNotConsumed++;
      if (r.status === "CONSUMED") d.consumed++;
      d.amountSatang += r.amountSatang;
      byDay.set(k, d);
    }
    const days = [...byDay.values()].sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : a.date.localeCompare(b.date)));
    return { ok: true, from: thaiDate(from), to: thaiDate(to), days, rows };
  } catch (e) {
    console.error("[pos/payment-reconcile] report", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV ของรายงานกระทบยอด (หัวตรึง · มี BOM ให้ Excel อ่านไทยได้) */
export async function reportIntentReconcileCsv(ctx: ReconcileCtx, actor: ReconcileActor, input: unknown): Promise<{ ok: true; csv: string; filename: string } | ReconcileRefusal> {
  const r = await reportIntentReconcile(ctx, actor, input);
  if (r.ok !== true) return r;
  const lines = [RECONCILE_CSV_HEADER, ...r.rows.map((x) => [x.date, x.intentId, x.kind, x.status, x.confirmedVia, x.lateWebhook ? "true" : "false", x.amountSatang, x.receiptNo, x.beamChargeId, x.slipStatus, x.flag].map(csvCell).join(","))];
  return { ok: true, csv: `﻿${lines.join("\r\n")}\r\n`, filename: `pos-reconcile-${r.from}_${r.to}.csv` };
}

/** นำเข้าไฟล์ settlement ของ Beam — โครง: NOT_CONFIGURED (ไม่อ่าน ไม่เขียน) จนกว่าเจ้าของส่งไฟล์ตัวอย่าง (รูปคอลัมน์ยังไม่รู้) */
export async function importBeamSettlement(ctx: ReconcileCtx, actor: ReconcileActor, _input: unknown): Promise<ReconcileRefusal> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
    const m = membershipOf(actor);
    if (!m || !evaluate(m, { module: "pos", action: "pos.report.view", unitId: ctx.unitId })) return refuse("PERMISSION_DENIED");
    return refuse("NOT_CONFIGURED");
  } catch {
    return refuse("UNKNOWN");
  }
}
