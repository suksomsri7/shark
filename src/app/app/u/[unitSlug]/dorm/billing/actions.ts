"use server";
// SVC D.8 ▸ action รอบบิลหอ — ร้าน/ผู้กระทำมาจาก session เท่านั้น (ไม่รับรหัสร้าน/ผู้ใช้จากอินพุต) · ด่าน requireUnit + หน่วย DORM
//   สิทธิ์ละเอียด (dorm.bill.run / dorm.bill.send / dorm.view) ตรวจสดใน facade ทุกครั้ง — ไม่ผ่าน ⇒ NOT_FOUND
//   เงินจากฟอร์มเป็นบาท ⇒ parseBahtToSatang (D.7) ตัวเดียว · ไม่ throw ให้ผู้ใช้เห็น stack
import { revalidatePath } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import {
  adjustSentBill,
  billRunCsv,
  issueBillTaxInvoice,
  parseBahtToSatang,
  reissueBillTaxInvoice,
  prepareBillRun,
  releaseHeldBill,
  scheduleBillRun,
  sendBillRun,
  setBillExtraLines,
} from "@/lib/modules/dorm";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const refuse = (code: string, reason: string) => ({ ok: false as const, code, reason });
const NO_ACCESS = refuse("NOT_FOUND", "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการรอบบิล");
const BAD_INPUT = refuse("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
const SEND_WINDOW_MS = 45_000;

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}
const refresh = (unitSlug: string) => revalidatePath(`/app/u/${unitSlug}/dorm/billing`);

export async function prepareBillRunAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await prepareBillRun(g.ctx, { unitId: g.unitId, periodKey: str(input.periodKey) });
  refresh(unitSlug);
  return r;
}

export async function setBillExtraLinesAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || !Array.isArray(input.lines)) return BAD_INPUT;
  const lines: { kind: "LATE_FEE" | "OTHER"; labelTh: string; amountSatang: number; note: string | null }[] = [];
  for (const raw of input.lines) {
    if (!isRec(raw)) return BAD_INPUT;
    const amount = parseBahtToSatang(raw.amountBaht);
    if (amount === null || (raw.kind !== "LATE_FEE" && raw.kind !== "OTHER")) return BAD_INPUT;
    lines.push({ kind: raw.kind, labelTh: str(raw.labelTh), amountSatang: amount, note: str(raw.note) || null });
  }
  const r = await setBillExtraLines(g.ctx, { unitId: g.unitId, billId: str(input.billId), lines });
  refresh(unitSlug);
  return r;
}

export async function releaseHeldBillAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await releaseHeldBill(g.ctx, { unitId: g.unitId, billId: str(input.billId) });
  refresh(unitSlug);
  return r;
}

export async function scheduleBillRunAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const at = input.at === null ? null : str(input.at);
  if (at !== null && !at) return BAD_INPUT;
  const r = await scheduleBillRun(g.ctx, { unitId: g.unitId, runId: str(input.runId), at });
  refresh(unitSlug);
  return r;
}

/** ส่งเป็นชุดจนหมดหรือใกล้ 50 วิ แล้วคืนความคืบหน้า (จอเรียกต่อเองเมื่อ done = false) */
export async function sendBillRunAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const t0 = Date.now();
  let sent = 0;
  let last = await sendBillRun(g.ctx, { unitId: g.unitId, runId: str(input.runId) });
  if (last.ok) sent += last.sent;
  while (last.ok && !last.done && Date.now() - t0 < SEND_WINDOW_MS) {
    const left = SEND_WINDOW_MS - (Date.now() - t0);
    last = await sendBillRun(g.ctx, { unitId: g.unitId, runId: str(input.runId) }, { budgetMs: Math.max(3_000, Math.min(25_000, left)) });
    if (last.ok) sent += last.sent;
  }
  refresh(unitSlug);
  return last.ok ? { ...last, sent } : last;
}

export async function adjustSentBillAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || !Array.isArray(input.lines) || (input.kind !== "CREDIT" && input.kind !== "DEBIT")) return BAD_INPUT;
  const lines: { code: string; labelTh: string; amountSatang: number }[] = [];
  for (const raw of input.lines) {
    if (!isRec(raw)) return BAD_INPUT;
    const amount = parseBahtToSatang(raw.amountBaht);
    if (amount === null) return BAD_INPUT;
    lines.push({ code: str(raw.code) || "OTHER", labelTh: str(raw.labelTh), amountSatang: amount });
  }
  const r = await adjustSentBill(g.ctx, {
    unitId: g.unitId,
    billId: str(input.billId),
    kind: input.kind,
    reason: str(input.reason),
    idempotencyKey: str(input.idempotencyKey),
    lines,
  });
  refresh(unitSlug);
  return r;
}

export async function exportBillRunCsvAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const csv = await billRunCsv(g.ctx, { unitId: g.unitId, runId: str(input.runId) });
  if (csv === null) return NO_ACCESS;
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(str(input.periodKey)) ? str(input.periodKey) : "run";
  return { ok: true as const, csv, filename: `bills-${period}.csv` };
}

// SVC D.3 ▸ ใบกำกับภาษีเต็มรูป: ออก (ทางกู้ — ปกติออกพร้อมการส่งบิล) · ยกเลิกแล้วออกฉบับใหม่แทน (ยอดเท่าเดิม · ต้องมีเหตุผล) ◂
export async function issueTaxInvoiceAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const r = await issueBillTaxInvoice(g.ctx, { unitId: g.unitId, billId: str(input.billId) });
  refresh(unitSlug);
  return r;
}

export async function reissueTaxInvoiceAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input)) return BAD_INPUT;
  const b = isRec(input.buyer) ? input.buyer : null;
  const buyer = b
    ? {
        ...(str(b.name) ? { name: str(b.name) } : {}),
        ...(str(b.address) ? { address: str(b.address) } : {}),
        ...(typeof b.taxId === "string" ? { taxId: str(b.taxId) || null } : {}),
        ...(typeof b.branchCode === "string" ? { branchCode: str(b.branchCode) || null } : {}),
      }
    : null;
  const r = await reissueBillTaxInvoice(g.ctx, {
    unitId: g.unitId,
    billId: str(input.billId),
    reason: str(input.reason),
    idempotencyKey: str(input.idempotencyKey),
    buyer,
  });
  refresh(unitSlug);
  return r;
}
