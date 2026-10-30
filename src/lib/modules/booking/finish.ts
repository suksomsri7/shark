// SVC B.10 — จบงาน → "บิลจากคิว" (บิลพัก POS) + ค่าคอมฯ ตามผู้ให้บริการ (ภาพ จอง 07) · ใบสั่ง ledger/svc-briefs/svc-brief-b.10.md §2 §3.1
//
// 🔴 เสร็จ = งานจบ (DONE) + บิลพักเปิด "ในธุรกรรมเดียวกัน" (completeJobTx ของ queue-line + hook → serviceBills.openServiceBill(…, tx)) ·
//    ช่องช่างว่างทันที · เงินค้างที่บิลจากคิวจนแคชเชียร์รับเงิน · จ่ายแล้ว ⇒ booking.paid ครั้งเดียวต่อนัด (ไม่มีสถานะนัดใหม่)
// 🔴 ราคา server ล้วน: บรรทัดจากนัด = Appointment.priceSatang (−1 = ราคาบริการ) · บริการที่ทำเพิ่ม = ราคาเฉพาะคน (BookingStaffService) ไม่มีใช้ราคาบริการ ·
//    สินค้า = ราคา POS ตอนเปิด/แก้บิล (serviceBills.productPrices → resolvePrices) · client ส่งได้แค่ id + จำนวน + ผู้ทำ
// 🔴 อัตราค่าคอมฯ ต่อบรรทัด snapshot ตอนเปิด/แก้บิล (booking.money.commissionTo · booking.money.commissionRate ชั้น UNIT→SERVICE→STAFF) — POS ไม่อ่านค่าตั้ง booking
// 🔴 ค่าตั้ง/ราคา/ช่าง เตรียมก่อนธุรกรรม (ห้าม connection ที่สองขณะถือล็อก) · ล็อก: แถวนัด FOR UPDATE → advisory `bq-bill-<นัด>` (ใน POS) ·
//    เขียนนัด = CAS (updateMany + สถานะที่อ่าน) · ชนชั่วคราว ⇒ ลองใหม่ 1 ครั้งแล้ว BUSY
// 🔴 ขอบเขต (X1): ทุกคิวรีผูก tenantId + unitId ของ ctx · ของร้าน/สาขาอื่น = NOT_FOUND ข้อความเดียว · payload event ไม่มีชื่อ/เบอร์ (X8)
// 🔴 สาขาเดิม (ค่าตั้งยังเป็น _fallback — ไม่เลือกแม่แบบ) = พฤติกรรมรุ่นแรก: ไม่เปิดบิลพัก (บิล CASH เดิมอยู่ที่ setStatusAction) · สาขาไม่มี POS = "รับเงินแล้ว"
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutboxMany } from "@/lib/core/outbox";
import { evaluate } from "@/lib/core/rbac";
import { resolveSettings, resolveSettingsMany, type ScopeRefs } from "@/lib/core/settings";
import { saleStatusByKey, serviceBills, type ServiceBillLineInput } from "@/lib/modules/pos";
import { lineAccess, type LineMember } from "./line-access";
import { addDaysStr, bkkDayOf } from "./planner-run";
import { completeJobTx, lockAppt, okCtx, runLineTx, type JobResult, type LineCtx } from "./queue-line";
import { myStaffIds } from "./today-line";

// ───────────────────────── สัญญา (§3.1) ─────────────────────────
export type ExtraLine =
  | { kind: "SERVICE"; serviceId: string; staffId?: string }
  | { kind: "PRODUCT"; productId: string; qty: number; staffId?: string };
export type BillLine = {
  kind: "SERVICE" | "PRODUCT"; source: "BOOKED" | "EXTRA"; name: string; qty: number; unitPriceSatang: number; amountSatang: number;
  serviceId: string | null; productId: string | null; performerStaffId: string; performerEmployeeId: string | null; commissionBp: number | null;
  /** ชื่อผู้ทำ (แสดงบนแผ่นจบงาน/หน้าขาย · เพิ่มล้วน) */
  performerName?: string;
};
export type ServiceBillPreview = {
  appointmentId: string; ticketNumber: string | null; customerLabel: string; staffName: string;
  lines: BillLine[]; subtotalSatang: number; depositSatang: number; dueSatang: number;
  pos: boolean; heldCartId: string | null; billStatus: "NONE" | "HELD" | "PAID" | "CANCELLED";
  rebook: { dateStr: string; startMin: number; staffId: string } | null;
};
export type FinishFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "BUSY" | "BAD_INPUT" | "FORBIDDEN" | "BILL_PAID" | "BILL_IN_USE" | "USE_POS";
export type FinishResult =
  | { ok: true; appointmentId: string; heldCartId: string | null; already: boolean; needsPayment: "POS" | "NO_POS" | "NONE"; legacy?: boolean }
  | { ok: false; code: FinishFail; reason: string };
export type ServiceBillOp = "finish" | "amend" | "cancel" | "markPaid" | "void";

const EXTRAS_MAX = 20;
const QTY_MAX = 99;
const REASON_MAX = 200;
const MIN_MS = 60_000;
const BKK_MIN = 420;

const R = {
  NOT_FOUND: "ไม่พบงานนี้", // = queue-line JOB_NOT_FOUND (completeJob คงข้อความเดิม)
  BAD_STATE: "งานนี้ทำรายการนี้ไม่ได้ในสถานะปัจจุบัน",
  LOST_RACE: "สถานะงานเพิ่งถูกเปลี่ยนโดยรายการอื่น กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
  BUSY: "ระบบกำลังจัดคิวพร้อมกันหลายรายการ กรุณาลองใหม่อีกครั้ง", // = queue-line BUSY
  BAD_INPUT: "รายการที่ทำเพิ่มไม่ถูกต้อง (บริการ/สินค้า/ผู้ทำ/จำนวน) — ยังไม่ได้บันทึกอะไร",
  NO_BILL: "งานนี้ยังไม่มีบิลจากคิวที่แก้ได้",
  BILL_PAID: "บิลของงานนี้รับเงินแล้ว — แก้หรือยกเลิกไม่ได้ (คืนเงินที่หน้าขาย)",
  BILL_IN_USE: "บิลของงานนี้กำลังถูกทำรายการที่เคาน์เตอร์ — ลองอีกครั้ง",
  USE_POS: "สาขานี้รับเงินที่หน้าขาย (บิลจากคิว) — ไม่ใช้ปุ่มรับเงินแล้ว",
  REASON: "ต้องใส่เหตุผลที่ยกเลิกบิล (1–200 ตัวอักษร)",
  FORBIDDEN: "บัญชีนี้ทำรายการนี้กับงานนี้ไม่ได้",
  BILL_VOIDED: "บิลจากคิวของงานนี้ถูกยกเลิกหลังรับเงินแล้ว — เก็บเงินใหม่ที่หน้าขายแบบบิลปกติ (ยังเปิดบิลจากคิวซ้ำให้งานเดิมไม่ได้)",
  NOT_PAID: "งานนี้ไม่มีบิลจากคิวที่รับเงินแล้ว",
} as const;
const bad = (code: FinishFail, reason?: string): FinishResult => ({ ok: false, code, reason: reason ?? (R as Record<string, string>)[code] ?? R.BAD_STATE });
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nowOf = (d?: Date) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());
const okRes = (appointmentId: string, heldCartId: string | null, already: boolean, needsPayment: "POS" | "NO_POS" | "NONE", legacy?: boolean): FinishResult =>
  ({ ok: true, appointmentId, heldCartId, already, needsPayment, ...(legacy ? { legacy: true } : {}) });

// ───────────────────────── อ่านงาน + ค่าตั้ง (ก่อนธุรกรรม) ─────────────────────────
type Appt = {
  id: string; unitId: string; status: string; kind: string; channel: string | null; staffId: string; plannedStaffId: string | null; serviceId: string;
  priceSatang: number; startAt: Date; customerId: string | null; customerName: string; depositSaleId: string | null; depositPaidAt: Date | null;
  heldCartId: string | null; queueTicketId: string | null; service: { name: string; priceSatang: number };
};
async function loadAppt(ctx: LineCtx, id: string): Promise<Appt | null> {
  if (!okCtx(ctx) || !isId(id)) return null;
  const a = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).appointment.findFirst({
    where: { id, tenantId: ctx.tenantId, unitId: ctx.unitId },
    select: {
      id: true, unitId: true, status: true, kind: true, channel: true, staffId: true, plannedStaffId: true, serviceId: true, priceSatang: true, startAt: true,
      customerId: true, customerName: true, depositSaleId: true, depositPaidAt: true, heldCartId: true, queueTicketId: true,
      service: { select: { name: true, priceSatang: true } },
    },
  });
  return a ? { ...a, status: String(a.status) } : null;
}

type Mode = { v2: boolean; posSystemId: string | null; commissionOn: boolean; rebookDays: number | null };
/** v2 = สาขาเลือกแม่แบบจองคิวแล้ว (ค่าตั้งไม่ใช่ _fallback) · posSystemId = ระบบ POS ที่สาขาผูก (AppSystemUnit) */
async function modeOf(ctx: LineCtx, serviceId: string): Promise<Mode> {
  const [r, posSystemId] = await Promise.all([
    resolveSettings({ tenantId: ctx.tenantId }, ["booking.money.onDone", "booking.money.commissionTo", "booking.service.rebookAfterDays"], { unitId: ctx.unitId, serviceId }),
    serviceBills.posOfUnit(ctx.tenantId, ctx.unitId), // fix Q5: ผูก + active (นิยามเดียวกับบิลจากคิว)
  ]);
  const days = r["booking.service.rebookAfterDays"]?.value;
  return {
    v2: (r["booking.money.onDone"]?.templateKey ?? null) !== null,
    posSystemId,
    commissionOn: r["booking.money.commissionTo"]?.value === "PERFORMER",
    rebookDays: typeof days === "number" && Number.isInteger(days) && days > 0 ? days : null,
  };
}

/** ป้ายบนบิลพัก/แผ่นจบงาน = เลขบัตร + ชื่อที่แสดงบนจอได้ (ตัดตัวเลขยาวแบบเบอร์ทิ้ง · ไม่ใช่เบอร์) */
function customerLabelOf(a: Appt): string {
  if (a.kind === "WALKIN") return "ลูกค้า walk-in";
  return a.customerName.replace(/\+?\d[\d\s-]{5,}\d/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}
async function ticketNumberOf(ctx: LineCtx, a: Appt): Promise<string | null> {
  if (!a.queueTicketId) return null;
  const t = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).queueTicket.findFirst({ where: { id: a.queueTicketId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { number: true } });
  return t?.number ?? null;
}
const labelOf = (ticket: string | null, a: Appt) => [ticket, customerLabelOf(a)].filter(Boolean).join(" · ").slice(0, 60);

// ───────────────────────── สร้างบรรทัดบิล (ราคา server ล้วน) ─────────────────────────
type CleanExtra = { kind: "SERVICE"; serviceId: string; staffId: string | null } | { kind: "PRODUCT"; productId: string; qty: number; staffId: string | null };
/** ของที่ทำเพิ่มจาก client: เอาแค่ id + จำนวน + ผู้ทำ (คีย์อื่น เช่น ราคา ถูกทิ้ง) · ผิดรูป = null (BAD_INPUT) */
function cleanExtras(raw: unknown): CleanExtra[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > EXTRAS_MAX) return null;
  const out: CleanExtra[] = [];
  for (const x of raw) {
    if (!isRec(x)) return null;
    const staffId = x.staffId === undefined || x.staffId === null || x.staffId === "" ? null : isId(x.staffId) ? x.staffId : undefined;
    if (staffId === undefined) return null;
    if (x.kind === "SERVICE" && isId(x.serviceId)) out.push({ kind: "SERVICE", serviceId: x.serviceId, staffId });
    else if (x.kind === "PRODUCT" && isId(x.productId) && typeof x.qty === "number" && Number.isInteger(x.qty) && x.qty >= 1 && x.qty <= QTY_MAX) out.push({ kind: "PRODUCT", productId: x.productId, qty: x.qty, staffId });
    else return null;
  }
  return out;
}

async function buildLines(ctx: LineCtx, a: Appt, mode: Mode, extras: CleanExtra[]): Promise<BillLine[] | null> {
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  const staffIds = [...new Set([a.staffId, ...extras.map((e) => e.staffId).filter((x): x is string => !!x)])];
  const staff = await db.bookingStaff.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: staffIds } }, select: { id: true, name: true, active: true, employeeId: true } });
  const staffOf = new Map(staff.map((s) => [s.id, s]));
  // ผู้ทำของบรรทัดเพิ่มต้องเป็นช่างที่ใช้งานอยู่ของสาขานี้ (ช่างของงานเองผ่านเสมอ)
  if (extras.some((e) => e.staffId && (!staffOf.get(e.staffId)?.active))) return null;
  if (!staffOf.has(a.staffId)) return null;
  const svcIds = [...new Set(extras.flatMap((e) => (e.kind === "SERVICE" ? [e.serviceId] : [])))];
  const services = svcIds.length
    ? await db.bookingService.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: svcIds }, active: true }, select: { id: true, name: true, priceSatang: true } })
    : [];
  const svcOf = new Map(services.map((s) => [s.id, s]));
  if (svcIds.some((id) => !svcOf.has(id))) return null;
  const pairs = extras.flatMap((e) => (e.kind === "SERVICE" ? [{ staffId: e.staffId ?? a.staffId, serviceId: e.serviceId }] : []));
  const terms = pairs.length
    ? await db.bookingStaffService.findMany({
        where: { tenantId: ctx.tenantId, unitId: ctx.unitId, staffId: { in: [...new Set(pairs.map((p) => p.staffId))] }, serviceId: { in: svcIds } },
        select: { staffId: true, serviceId: true, priceSatang: true },
      })
    : [];
  const termPrice = new Map(terms.map((t) => [`${t.staffId}|${t.serviceId}`, t.priceSatang]));
  const prodIds = [...new Set(extras.flatMap((e) => (e.kind === "PRODUCT" ? [e.productId] : [])))];
  let prodOf = new Map<string, { name: string; unitPriceSatang: number }>();
  if (prodIds.length) {
    if (!mode.posSystemId) return null;
    const pr = await serviceBills.productPrices(ctx.tenantId, ctx.unitId, prodIds);
    if (!pr.ok) return null;
    prodOf = new Map(pr.items.map((i) => [i.productId, { name: i.name, unitPriceSatang: i.unitPriceSatang }]));
  }
  const lines: BillLine[] = [];
  const empOf = (staffId: string) => staffOf.get(staffId)?.employeeId ?? null;
  const nameOf = (staffId: string) => staffOf.get(staffId)?.name ?? "";
  const booked = a.priceSatang >= 0 ? a.priceSatang : a.service.priceSatang;
  lines.push({
    kind: "SERVICE", source: "BOOKED", name: a.service.name, qty: 1, unitPriceSatang: booked, amountSatang: booked,
    serviceId: a.serviceId, productId: null, performerStaffId: a.staffId, performerEmployeeId: empOf(a.staffId), commissionBp: null, performerName: nameOf(a.staffId),
  });
  for (const e of extras) {
    const performer = e.staffId ?? a.staffId;
    if (e.kind === "SERVICE") {
      const s = svcOf.get(e.serviceId)!;
      const own = termPrice.get(`${performer}|${e.serviceId}`);
      const price = typeof own === "number" && own >= 0 ? own : s.priceSatang;
      lines.push({ kind: "SERVICE", source: "EXTRA", name: s.name, qty: 1, unitPriceSatang: price, amountSatang: price, serviceId: e.serviceId, productId: null, performerStaffId: performer, performerEmployeeId: empOf(performer), commissionBp: null, performerName: nameOf(performer) });
    } else {
      const p = prodOf.get(e.productId);
      if (!p) return null;
      lines.push({ kind: "PRODUCT", source: "EXTRA", name: p.name, qty: e.qty, unitPriceSatang: p.unitPriceSatang, amountSatang: p.unitPriceSatang * e.qty, serviceId: null, productId: e.productId, performerStaffId: performer, performerEmployeeId: empOf(performer), commissionBp: null, performerName: nameOf(performer) });
    }
  }
  if (lines.some((l) => !Number.isInteger(l.unitPriceSatang) || l.unitPriceSatang < 0)) return null;
  // อัตราค่าคอมฯ ต่อบรรทัด (snapshot) — ปิด (OFF) = null ทุกบรรทัด
  if (mode.commissionOn) {
    const refs: ScopeRefs[] = lines.map((l) => (l.kind === "SERVICE" ? { unitId: ctx.unitId, serviceId: l.serviceId!, staffId: l.performerStaffId } : { unitId: ctx.unitId, staffId: l.performerStaffId }));
    const rs = await resolveSettingsMany({ tenantId: ctx.tenantId }, ["booking.money.commissionRate"], refs);
    lines.forEach((l, i) => {
      const v = rs[i]?.["booking.money.commissionRate"]?.value as { serviceBp?: unknown; productBp?: unknown } | null | undefined;
      const bp = v ? (l.kind === "SERVICE" ? v.serviceBp : v.productBp) : null;
      l.commissionBp = typeof bp === "number" && Number.isInteger(bp) && bp >= 0 && bp <= 10_000 ? bp : null;
    });
  }
  return lines;
}
const toPosLines = (lines: BillLine[]): ServiceBillLineInput[] =>
  lines.map((l) => ({ kind: l.kind, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, productId: l.productId, serviceId: l.serviceId, performerEmployeeId: l.performerEmployeeId, commissionBp: l.commissionBp, performerName: l.performerName ?? null }));
const depositReceiptOf = (a: Appt) => (a.depositPaidAt && a.depositSaleId ? a.depositSaleId : null);

async function billStateOf(ctx: LineCtx, id: string): Promise<{ heldCartId: string | null; billStatus: ServiceBillPreview["billStatus"]; voided?: boolean }> {
  const s = await serviceBills.serviceBillStatus(ctx.tenantId, ctx.unitId, id);
  if (!s) return { heldCartId: null, billStatus: "NONE" };
  if (s.status === "VOIDED") return { heldCartId: null, billStatus: "CANCELLED", voided: true }; // fix Q11 ◂
  if (s.status === "HELD") return { heldCartId: s.heldCartId, billStatus: "HELD" };
  if (s.status === "PAID") return { heldCartId: s.heldCartId, billStatus: "PAID" };
  return { heldCartId: null, billStatus: "CANCELLED" };
}

/** fix Q2: นัดนี้ถูกเก็บเงินทางเดิม (บิล CASH `booking-sale-<id>` ของสาขาเดิม) แล้วหรือยัง — มี (ไม่ใช่ VOIDED) ⇒ ห้ามเปิดบิลจากคิวซ้ำ */
async function legacySold(ctx: LineCtx, id: string): Promise<boolean> {
  const st = await saleStatusByKey(ctx.tenantId, `booking-sale-${id}`);
  return st !== null && st !== "VOIDED";
}
const subtotalOfLines = (lines: BillLine[]) => lines.reduce((t, l) => t + l.amountSatang, 0);

/** fix Q8: สาขายังเป็นร้านเดิม (ค่าตั้งจองคิวยังเป็น _fallback · ไม่เลือกแม่แบบ) ไหม — ทางบิล CASH เดิมของ setStatusAction ใช้ตัดสิน */
export async function isLegacyBookingUnit(ctx: LineCtx): Promise<boolean> {
  if (!okCtx(ctx)) return false;
  const r = await resolveSettings({ tenantId: ctx.tenantId }, ["booking.money.onDone"], { unitId: ctx.unitId });
  return (r["booking.money.onDone"]?.templateKey ?? null) === null;
}

// ═════════════════════════ อ่านอย่างเดียว ═════════════════════════

/** แผ่นจบงาน (ภาพ 07 ก): บรรทัด + ยอด − มัดจำคงเหลือจริง = ต้องจ่าย · ข้ามขอบเขต/ไม่พบ = null · ของเพิ่มผิด = ไม่นับ (แสดงเฉพาะที่ถูกต้อง) */
export async function previewServiceBill(ctx: LineCtx, appointmentId: string, input?: { extras?: ExtraLine[] }): Promise<ServiceBillPreview | null> {
  const a = await loadAppt(ctx, appointmentId);
  if (!a) return null;
  const mode = await modeOf(ctx, a.serviceId);
  const extras = cleanExtras(input?.extras) ?? [];
  const lines = (await buildLines(ctx, a, mode, extras)) ?? (await buildLines(ctx, a, mode, []));
  if (!lines) return null;
  const [ticket, staffRow, bill] = await Promise.all([
    ticketNumberOf(ctx, a),
    tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).bookingStaff.findFirst({ where: { id: a.staffId, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { name: true } }),
    mode.posSystemId ? billStateOf(ctx, a.id) : Promise.resolve({ heldCartId: null, billStatus: "NONE" as const }),
  ]);
  const subtotal = lines.reduce((t, l) => t + l.amountSatang, 0);
  const dep = mode.posSystemId ? await serviceBills.depositForBill(ctx.tenantId, ctx.unitId, depositReceiptOf(a), subtotal) : null;
  const d = dep?.satang ?? 0;
  const startMin = Math.floor((a.startAt.getTime() / MIN_MS + BKK_MIN) % 1440);
  return {
    appointmentId: a.id,
    ticketNumber: ticket,
    customerLabel: customerLabelOf(a),
    staffName: staffRow?.name ?? "",
    lines,
    subtotalSatang: subtotal,
    depositSatang: d,
    dueSatang: subtotal - d,
    pos: !!mode.posSystemId,
    heldCartId: bill.heldCartId,
    billStatus: bill.billStatus,
    rebook: mode.rebookDays ? { dateStr: addDaysStr(bkkDayOf(a.startAt.getTime()), mode.rebookDays), startMin, staffId: a.staffId } : null,
  };
}

/** หน้า "เสร็จงาน" (?finish=<เลขบัตรของวันนี้ | รหัสนัด>) → รหัสนัดของสาขานี้ · ไม่พบ = null */
export async function appointmentIdForFinish(ctx: LineCtx, key: string, opts?: { now?: Date }): Promise<string | null> {
  if (!okCtx(ctx) || typeof key !== "string" || !key.trim() || key.length > 200) return null;
  const k = key.trim();
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  const byId = await db.appointment.findFirst({ where: { id: k, tenantId: ctx.tenantId, unitId: ctx.unitId }, select: { id: true } });
  if (byId) return byId.id;
  const day = bkkDayOf(nowOf(opts?.now).getTime());
  const t = await db.queueTicket.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, businessDate: day, number: k }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!t) return null;
  const a = await db.appointment.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, queueTicketId: t.id }, select: { id: true } });
  return a?.id ?? null;
}

/** ?add=<id,id> → ของที่ทำเพิ่ม: บริการของสาขา = SERVICE · อื่น = สินค้า (ซ้ำ = จำนวนเพิ่ม) · ผู้ทำ = ช่างของงาน · ราคาคิดที่ server ตอนสร้างบรรทัด */
export async function extrasFromIds(ctx: LineCtx, ids: string[]): Promise<ExtraLine[]> {
  if (!okCtx(ctx) || !Array.isArray(ids)) return [];
  const clean = ids.filter(isId).slice(0, EXTRAS_MAX);
  if (!clean.length) return [];
  const svc = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).bookingService.findMany({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: { in: clean } }, select: { id: true } });
  const isSvc = new Set(svc.map((s) => s.id));
  const out: ExtraLine[] = [];
  const qty = new Map<string, number>();
  for (const id of clean) {
    if (isSvc.has(id)) out.push({ kind: "SERVICE", serviceId: id });
    else qty.set(id, Math.min(QTY_MAX, (qty.get(id) ?? 0) + 1));
  }
  for (const [productId, q] of qty) out.push({ kind: "PRODUCT", productId, qty: q });
  return out;
}

/** ตัวเลือกของ "เพิ่มบริการ/สินค้า" บนแผ่นจบงาน — บริการที่ใช้งานอยู่ของสาขา (สินค้าเพิ่มผ่าน ?add=) */
export async function finishCatalog(ctx: LineCtx): Promise<{ services: { id: string; name: string }[]; products: { id: string; name: string }[] }> {
  if (!okCtx(ctx)) return { services: [], products: [] };
  const services = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).bookingService.findMany({
    where: { tenantId: ctx.tenantId, unitId: ctx.unitId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 60,
    select: { id: true, name: true },
  });
  return { services, products: [] };
}

// ═════════════════════════ เสร็จ ═════════════════════════

async function finishCore(ctx: LineCtx, appointmentId: string, input: { extras?: unknown; now?: Date; strict?: boolean }): Promise<FinishResult> {
  if (!okCtx(ctx) || !isId(appointmentId)) return bad("NOT_FOUND");
  const a = await loadAppt(ctx, appointmentId);
  if (!a) return bad("NOT_FOUND");
  if (a.status === "DONE") return input.strict ? bad("BAD_STATE") : ensureCore(ctx, a, true);
  if (a.status !== "IN_SERVICE") return bad("BAD_STATE");
  const extras = cleanExtras(input.extras);
  if (!extras) return bad("BAD_INPUT");
  const now = nowOf(input.now);
  const mode = await modeOf(ctx, a.serviceId);
  if (!mode.v2 || !mode.posSystemId) {
    if (extras.length && !mode.v2) return bad("BAD_INPUT"); // ร้านเดิมไม่มีบิลจากคิว — ของเพิ่มไม่มีที่ลง
    const r = await completeJobTx(ctx, a.id, now);
    if (!r.ok) return afterLoss(ctx, a.id, r, input.strict);
    return okRes(a.id, null, false, mode.v2 ? "NO_POS" : "NONE", !mode.v2);
  }
  const lines = await buildLines(ctx, a, mode, extras);
  if (!lines) return bad("BAD_INPUT");
  // fix Q1/Q2: ยอด ฿0 (คอร์ส/บริการฟรี) หรือเก็บเงินทางเดิมแล้ว ⇒ จบงานโดยไม่เปิดบิล (ไม่มีอะไรให้เก็บ)
  if (subtotalOfLines(lines) === 0 || (await legacySold(ctx, a.id))) {
    const r0 = await completeJobTx(ctx, a.id, now);
    if (!r0.ok) return afterLoss(ctx, a.id, r0, input.strict);
    return okRes(a.id, null, false, "NONE");
  }
  const label = labelOf(await ticketNumberOf(ctx, a), a);
  const r = await completeJobTx(ctx, a.id, now, async (tx, locked) => {
    if (locked.staffId !== a.staffId) return { ok: false, code: "LOST_RACE", reason: R.LOST_RACE }; // ย้ายช่างระหว่างเตรียม ⇒ ผู้ทำเดิมใช้ไม่ได้
    const o = await serviceBills.openServiceBill(
      { tenantId: ctx.tenantId, unitId: ctx.unitId, appointmentId: a.id, memberId: a.customerId, label, lines: toPosLines(lines), depositReceiptSaleId: depositReceiptOf(a), actorUserId: ctx.actorUserId ?? null },
      tx,
    );
    if (o.ok) return { ok: true, heldCartId: o.heldCartId };
    return { ok: false, code: o.code === "BILL_PAID" ? "BILL_PAID" : o.code === "BUSY" ? "BUSY" : "BAD_INPUT", reason: o.message };
  });
  if (!r.ok) return afterLoss(ctx, a.id, r, input.strict);
  return okRes(a.id, r.heldCartId, false, "POS");
}
/** แพ้ CAS/สถานะเปลี่ยนระหว่างเตรียม: อีกทางกดเสร็จไปแล้ว ⇒ คืนบิลเดิม (already) · อื่น ๆ คืนรหัสตามจริง */
async function afterLoss(ctx: LineCtx, id: string, r: { code: string; reason: string }, strict?: boolean): Promise<FinishResult> {
  const code = (["NOT_FOUND", "BAD_STATE", "LOST_RACE", "BUSY", "BAD_INPUT", "BILL_PAID"].includes(r.code) ? r.code : "BAD_STATE") as FinishFail;
  if (!strict && (code === "BAD_STATE" || code === "LOST_RACE")) {
    const a = await loadAppt(ctx, id);
    if (a?.status === "DONE") return ensureCore(ctx, a, true);
  }
  return { ok: false, code, reason: r.reason || ((R as Record<string, string>)[code] ?? R.BAD_STATE) };
}

/** นัด DONE: มีบิล ⇒ บิลเดิม (already) · ไม่มี ⇒ เปิดด้วยบรรทัดจากนัดอย่างเดียว · ร้านเดิม ⇒ legacy · ไม่มี POS ⇒ NO_POS */
async function ensureCore(ctx: LineCtx, a: Appt, fromFinish: boolean): Promise<FinishResult> {
  if (a.status !== "DONE") return bad("BAD_STATE");
  const mode = await modeOf(ctx, a.serviceId);
  if (!mode.v2) return okRes(a.id, null, fromFinish, "NONE", true);
  if (!mode.posSystemId) return okRes(a.id, null, fromFinish, "NO_POS");
  const st = await billStateOf(ctx, a.id);
  if (st.billStatus === "HELD") return okRes(a.id, st.heldCartId, true, "POS");
  if (st.billStatus === "PAID") return okRes(a.id, st.heldCartId, true, "NONE");
  if (st.voided) return bad("BAD_STATE", R.BILL_VOIDED); // fix Q9/Q11: หลัง void ไม่เปิดบิลซ้ำเอง (หนี้ §5) — บอกทางถัดไป
  if (await legacySold(ctx, a.id)) return okRes(a.id, null, true, "NONE"); // fix Q2: เก็บเงินทางเดิมแล้ว
  const lines = await buildLines(ctx, a, mode, []);
  if (!lines) return bad("BAD_INPUT");
  if (subtotalOfLines(lines) === 0) return okRes(a.id, null, false, "NONE"); // fix Q1: ไม่มีอะไรให้เก็บ
  const label = labelOf(await ticketNumberOf(ctx, a), a);
  const r = await runLineTx(async (tx): Promise<FinishResult> => {
    const locked = await lockAppt(tx, ctx, a.id);
    if (!locked) return bad("NOT_FOUND");
    if (locked.status !== "DONE") return bad("BAD_STATE");
    const o = await serviceBills.openServiceBill(
      { tenantId: ctx.tenantId, unitId: ctx.unitId, appointmentId: a.id, memberId: a.customerId, label, lines: toPosLines(lines), depositReceiptSaleId: depositReceiptOf(a), actorUserId: ctx.actorUserId ?? null },
      tx,
    );
    if (!o.ok) return o.code === "BILL_PAID" ? bad("BILL_PAID") : o.code === "BUSY" ? bad("BUSY") : bad("BAD_INPUT", o.message);
    await tx.appointment.updateMany({ where: { id: a.id, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "DONE" }, data: { heldCartId: o.heldCartId } });
    return okRes(a.id, o.heldCartId, !o.created, "POS");
  });
  return r ?? bad("BUSY");
}

/** ปุ่ม "เสร็จ" (แผ่นจบงาน): IN_SERVICE ⇒ DONE + บิลจากคิวในธุรกรรมเดียว · DONE + มีบิล ⇒ บิลเดิม already (ของเพิ่มไม่ถูกใช้ — แก้ด้วย amend) */
export async function finishJob(ctx: LineCtx, appointmentId: string, input?: { extras?: ExtraLine[]; now?: Date }): Promise<FinishResult> {
  return finishCore(ctx, appointmentId, { extras: input?.extras, now: input?.now });
}

/** completeJob ของ B.4 = finishJob โดยไม่มีของเพิ่ม · คืน JobResult เดิม (นัด DONE แล้ว = BAD_STATE แบบเดิม) */
export async function finishForComplete(ctx: LineCtx, appointmentId: string, now: Date): Promise<JobResult> {
  const r = await finishCore(ctx, appointmentId, { now, strict: true });
  if (r.ok) return { ok: true };
  const code = r.code === "NOT_FOUND" || r.code === "LOST_RACE" || r.code === "BUSY" ? r.code : "BAD_STATE";
  return { ok: false, code, reason: r.reason };
}

/** นัด DONE ที่ไม่มีบิล ⇒ เปิด (บรรทัดจากนัด) · มีแล้ว ⇒ บิลเดิม · ร้านเดิม (_fallback) ⇒ {heldCartId:null, legacy:true} ไม่เปิด */
export async function ensureServiceBill(ctx: LineCtx, appointmentId: string): Promise<FinishResult> {
  const a = await loadAppt(ctx, appointmentId);
  if (!a) return bad("NOT_FOUND");
  return ensureCore(ctx, a, false);
}

// ═════════════════════════ แก้ · ยกเลิก ═════════════════════════

/** แทนชุดของที่ทำเพิ่มทั้งชุด (บรรทัดจากนัดคงไว้ · ราคา/อัตรา snapshot ใหม่) — เฉพาะบิล HELD · จ่ายแล้ว = BILL_PAID */
export async function amendServiceBill(ctx: LineCtx, appointmentId: string, input: { extras: ExtraLine[] }): Promise<FinishResult> {
  const a = await loadAppt(ctx, appointmentId);
  if (!a) return bad("NOT_FOUND");
  if (a.status !== "DONE") return bad("BAD_STATE");
  const mode = await modeOf(ctx, a.serviceId);
  if (!mode.v2 || !mode.posSystemId) return bad("BAD_STATE", R.NO_BILL);
  const st = await billStateOf(ctx, a.id);
  if (st.billStatus === "PAID") return bad("BILL_PAID");
  if (st.billStatus !== "HELD") return bad("BAD_STATE", R.NO_BILL);
  const extras = cleanExtras(isRec(input) ? input.extras : undefined);
  if (!extras || !isRec(input) || !Array.isArray(input.extras)) return bad("BAD_INPUT");
  const lines = await buildLines(ctx, a, mode, extras);
  if (!lines) return bad("BAD_INPUT");
  const r = await runLineTx(async (tx): Promise<FinishResult> => {
    const locked = await lockAppt(tx, ctx, a.id);
    if (!locked) return bad("NOT_FOUND");
    if (locked.status !== "DONE") return bad("BAD_STATE");
    const o = await serviceBills.replaceServiceBillLines({ tenantId: ctx.tenantId, unitId: ctx.unitId, appointmentId: a.id, lines: toPosLines(lines) }, tx);
    if (o.ok) return okRes(a.id, o.heldCartId, false, "POS");
    if (o.code === "BILL_PAID") return bad("BILL_PAID");
    if (o.code === "BUSY") return bad("BILL_IN_USE");
    if (o.code === "VALIDATION") return bad("BAD_INPUT");
    return bad("BAD_STATE", R.NO_BILL);
  });
  return r ?? bad("BUSY");
}

/** ยกเลิกบิล HELD (เหตุผล 1–200 · AuditLog ใน POS) ⇒ heldCartId = null · สถานะนัดคง DONE · เปิดใหม่ได้ด้วย ensureServiceBill */
export async function cancelServiceBill(ctx: LineCtx, appointmentId: string, input: { reason: string }): Promise<FinishResult> {
  const a = await loadAppt(ctx, appointmentId);
  if (!a) return bad("NOT_FOUND");
  const reason = isRec(input) && typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || [...reason].length > REASON_MAX) return bad("BAD_INPUT", R.REASON);
  if (a.status !== "DONE") return bad("BAD_STATE");
  const st = await billStateOf(ctx, a.id);
  if (st.billStatus === "PAID") return bad("BILL_PAID");
  if (st.billStatus !== "HELD") return bad("BAD_STATE", R.NO_BILL);
  const r = await runLineTx(async (tx): Promise<FinishResult> => {
    const locked = await lockAppt(tx, ctx, a.id);
    if (!locked) return bad("NOT_FOUND");
    if (locked.status !== "DONE") return bad("BAD_STATE");
    const o = await serviceBills.discardServiceBill({ tenantId: ctx.tenantId, unitId: ctx.unitId, appointmentId: a.id, actorUserId: ctx.actorUserId ?? null, reason }, tx);
    if (!o.ok) return o.code === "BILL_PAID" ? bad("BILL_PAID") : o.code === "BUSY" ? bad("BILL_IN_USE") : o.code === "VALIDATION" ? bad("BAD_INPUT", R.REASON) : bad("BAD_STATE", R.NO_BILL);
    await tx.appointment.updateMany({ where: { id: a.id, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "DONE", heldCartId: o.heldCartId }, data: { heldCartId: null } });
    return okRes(a.id, null, false, "POS");
  });
  return r ?? bad("BUSY");
}

/**
 * fix Q11: ยกเลิกบิลจากคิวที่รับเงินแล้ว (เหตุผล 1–200 · ด่าน booking.job.runAny ที่ action) ⇒ POS voidSale ทางเดิม (audit · ค่าคอมฯ REVERSE ·
 * มัดจำกลับตามตัวรับเดิม) · หลังยกเลิก: ออกจาก DONE ได้ · ไม่เปิดบิลจากคิวซ้ำเอง (หนี้ §5) · booking.paid ไม่กลับรายการ (หนี้)
 */
export async function voidPaidServiceBill(ctx: LineCtx, appointmentId: string, input: { reason: string }): Promise<FinishResult> {
  const a = await loadAppt(ctx, appointmentId);
  if (!a) return bad("NOT_FOUND");
  const reason = isRec(input) && typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || [...reason].length > REASON_MAX) return bad("BAD_INPUT", R.REASON);
  if (!ctx.actorUserId) return bad("FORBIDDEN");
  const o = await serviceBills.voidPaidServiceBill({ tenantId: ctx.tenantId, unitId: ctx.unitId, appointmentId: a.id, actorUserId: ctx.actorUserId, reason });
  if (o.ok) return okRes(a.id, null, o.already, "NONE");
  if (o.code === "NOT_FOUND") return bad("BAD_STATE", R.NOT_PAID);
  if (o.code === "BUSY") return bad("BUSY");
  return bad("BAD_STATE", o.message);
}

// ═════════════════════════ จ่ายแล้ว ═════════════════════════

type PaidPayload = { appointmentId: string; unitId: string; staffId: string; kind: string; channel: string | null; saleId: string | null; amountSatang: number; via: "POS" | "NO_POS" };
async function emitPaid(tx: Prisma.TransactionClient, tenantId: string, p: PaidPayload): Promise<boolean> {
  const n = await emitOutboxMany(tx, [{ tenantId, unitId: p.unitId, type: "booking.paid", idempotencyKey: `booking.paid#${p.appointmentId}`, payload: p }]);
  return n > 0;
}

/** สาขาไม่มี POS: "รับเงินแล้ว" ⇒ booking.paid (via NO_POS) ครั้งเดียว · สาขามี POS = USE_POS · นัดไม่ DONE = BAD_STATE · ซ้ำ = already */
export async function markPaidWithoutPos(ctx: LineCtx, appointmentId: string, opts?: { now?: Date }): Promise<FinishResult> {
  void opts;
  const a = await loadAppt(ctx, appointmentId);
  if (!a) return bad("NOT_FOUND");
  if (await serviceBills.posOfUnit(ctx.tenantId, ctx.unitId)) return bad("USE_POS"); // fix Q5: POS ปิดใช้ = ไม่มี POS
  if (a.status !== "DONE") return bad("BAD_STATE");
  const amount = a.priceSatang >= 0 ? a.priceSatang : a.service.priceSatang;
  const r = await runLineTx(async (tx): Promise<FinishResult> => {
    const locked = await lockAppt(tx, ctx, a.id);
    if (!locked) return bad("NOT_FOUND");
    if (locked.status !== "DONE") return bad("BAD_STATE");
    const fresh = await emitPaid(tx, ctx.tenantId, { appointmentId: a.id, unitId: ctx.unitId, staffId: locked.staffId, kind: locked.kind, channel: locked.channel, saleId: null, amountSatang: amount, via: "NO_POS" });
    return okRes(a.id, null, !fresh, "NONE");
  });
  return r ?? bad("BUSY");
}

/** ตัวรับ pos.sale.paid: บิลจากคิว (BOOKING · คีย์ bq-sale-<นัด>) ⇒ booking.paid ครั้งเดียวต่อนัด (ซ้ำ/พร้อมกัน = แถวเดียว · X4) · บิลอื่น = ไม่ทำอะไร */
export async function onPosSalePaid(evt: { id: string; tenantId: string; payload: unknown }): Promise<void> {
  const saleId = isRec(evt?.payload) && isId(evt.payload.saleId) ? evt.payload.saleId : null;
  if (!saleId || !isId(evt.tenantId)) return;
  const info = await serviceBills.serviceBillOfSale(evt.tenantId, saleId);
  if (!info || info.status !== "PAID") return;
  const a = await tenantDb({ tenantId: evt.tenantId, unitId: info.unitId }).appointment.findFirst({
    where: { id: info.appointmentId, tenantId: evt.tenantId, unitId: info.unitId },
    select: { id: true, staffId: true, kind: true, channel: true },
  });
  if (!a) return;
  const r = await runLineTx((tx) => emitPaid(tx, evt.tenantId, { appointmentId: a.id, unitId: info.unitId, staffId: a.staffId, kind: a.kind, channel: a.channel, saleId: info.saleId, amountSatang: info.grandTotalSatang, via: "POS" }));
  if (r === null) throw new Error("booking.paid: ฐานข้อมูลชนกันชั่วคราว — คิวจะลองใหม่");
}

// ═════════════════════════ สิทธิ์สด ═════════════════════════

const asArr = (v: unknown): string[] => {
  const x = typeof v === "string" ? (() => { try { return JSON.parse(v) as unknown; } catch { return null; } })() : v;
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
};
const asObj = (v: unknown): Record<string, unknown> => {
  const x = typeof v === "string" ? (() => { try { return JSON.parse(v) as unknown; } catch { return null; } })() : v;
  return isRec(x) ? x : {};
};

/**
 * ด่านของทุก action บิลจากคิว — อ่าน Membership จากฐานทุกครั้ง (acceptedAt ≠ null · unitAccess · permissions):
 * finish/amend = งานของตัวเอง (booking.job.run) หรือใครก็ได้ (booking.job.runAny · OWNER/MANAGER ของสาขา) · cancel = booking.job.runAny ·
 * markPaid = booking.queue.operate หรือ pos.sale.create · งานไม่ใช่ของสาขา = NOT_FOUND
 */
export async function authorizeServiceBillOp(ctx: LineCtx, userId: string, op: ServiceBillOp, appointmentId: string): Promise<{ ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND"; reason: string }> {
  const NF = { ok: false as const, code: "NOT_FOUND" as const, reason: R.NOT_FOUND };
  const FB = { ok: false as const, code: "FORBIDDEN" as const, reason: R.FORBIDDEN };
  if (!okCtx(ctx) || !isId(userId) || !isId(appointmentId) || !["finish", "amend", "cancel", "markPaid", "void"].includes(op)) return NF;
  const a = await loadAppt(ctx, appointmentId);
  if (!a) return NF;
  const mb = await tenantDb({ tenantId: ctx.tenantId }).membership.findFirst({
    where: { userId, tenantId: ctx.tenantId, acceptedAt: { not: null } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  if (!mb || !["OWNER", "MANAGER", "STAFF"].includes(String(mb.role))) return FB;
  const m: LineMember = { role: String(mb.role) as LineMember["role"], unitAccess: asArr(mb.unitAccess), permissions: asObj(mb.permissions) };
  const access = lineAccess(m, ctx.unitId);
  if (op === "markPaid") {
    const can = evaluate(m, { module: "booking", action: "booking.queue.operate", unitId: ctx.unitId }) || evaluate(m, { module: "pos", action: "pos.sale.create", unitId: ctx.unitId });
    return can ? { ok: true } : FB;
  }
  if (op === "cancel" || op === "void") return access.runAny ? { ok: true } : FB;
  if (access.runAny) return { ok: true };
  if (!access.runOwn) return FB;
  const mine = new Set(await myStaffIds(ctx, userId));
  return mine.has(a.staffId) || (!!a.plannedStaffId && mine.has(a.plannedStaffId)) ? { ok: true } : FB;
}
