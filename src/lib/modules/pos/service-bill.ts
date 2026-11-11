// service-bill.ts — "บิลจากคิว": บิลพัก POS ที่ผูกงานบริการ (SVC B.10 · จุด 1 ที่เจ้าของอนุญาต · ใบสั่ง ledger/svc-briefs/svc-brief-b.10.md §3.2)
//
// 🔴 POS ไม่ import โมดูล booking (เส้นเดิม booking→pos เท่านั้น) — booking ส่งบรรทัดที่คิดราคา/ผู้ทำ/อัตราค่าคอมฯ แล้วมาเป็นตัวเลข (snapshot)
// 🔴 แถว PosHeldCart ที่มี serviceJobId (= Appointment.id) · HELD ≤ 1 แถวต่องาน (partial unique "PosHeldCart_serviceJobId_held_key" ของ B.0)
//    ทุกการเขียนของงานหนึ่งอยู่ใต้ advisory lock คีย์ `bq-bill-<appointmentId>` (ต่อร้าน) — เปิด/แก้/ทิ้ง/จ่าย ได้ผลเดียวเสมอ
// 🔴 บรรทัดล็อกราคา (ไม่ re-quote ตอนจ่าย — ต่างจากบิลพักปกติ H3) · ไม่หมดอายุ · ลิ้นชัก/เรียกคืนของบิลพักปกติไม่แตะแถวเหล่านี้ (held-cart.ts)
// 🔴 จ่าย = CAS แถว HELD→RECALLED (version ที่อ่าน) ในธุรกรรมเดียวกับ createSale (คีย์ตายตัว bq-sale-<appointmentId>) · แพ้ = ไม่มีบิล ไม่ตัดมัดจำ
//    มัดจำ = server เติมแถว DEPOSIT{refSaleId} เองจาก moduleDepositForBill ณ วินาทีจ่าย (client ส่ง DEPOSIT = VALIDATION)
// 🔴 ไม่ throw — คืน {ok:false, code, message} · ขอบเขต: ร้าน + สาขา (+ ระบบ POS ฝั่งหน้าขาย) ทุกคำสั่ง ⇒ ของร้าน/สาขาอื่น = NOT_FOUND
import type { PosPayType, Prisma } from "@prisma/client";
import { callerTx } from "@/lib/core/caller-tx";
import { systemForUnit } from "@/lib/modules/system/service";
import { prisma } from "./db";
import { posDeviceRevoked } from "./device";
import { moduleDepositForBill } from "./deposit";
import { resolvePrices } from "./price";
import { registerScopeCheck } from "./register";
import type { RegisterActor, RegisterCtx, RegisterRefusal } from "./register-shared";
import { afterSaleCommitted, createSale, PosSaleError, voidSale, type CreateSaleInput } from "./service";
import { effectiveTrackStock } from "./catalog";
import { resolveRegisterShift } from "./shift";

type Tx = Prisma.TransactionClient;

export type ServiceBillLineInput = {
  kind: "SERVICE" | "PRODUCT";
  name: string;
  qty: number;
  unitPriceSatang: number;
  productId: string | null;
  serviceId: string | null;
  performerEmployeeId: string | null;
  commissionBp: number | null;
  /** ชื่อผู้ให้บริการที่แสดงบนหน้าขาย (snapshot · ไม่บังคับ — เพิ่มล้วน) */
  performerName?: string | null;
};
export type ServiceBillFail = { ok: false; code: string; message: string };
export type OpenServiceBillInput = {
  tenantId: string; unitId: string; appointmentId: string; memberId?: string | null; label: string;
  lines: ServiceBillLineInput[]; depositReceiptSaleId?: string | null; actorUserId: string | null;
};
export type ServiceBillListItem = { heldCartId: string; appointmentId: string; label: string; subtotalSatang: number; depositSatang: number; dueSatang: number; createdAt: Date; staffName: string | null };
export type ServiceBillViewLine = { kind: "SERVICE" | "PRODUCT"; name: string; qty: number; unitPriceSatang: number; amountSatang: number; performerEmployeeId: string | null; performerName: string | null };
export type ServiceBillView = {
  ok: true; heldCartId: string; appointmentId: string; version: number; label: string;
  lines: ServiceBillViewLine[]; subtotalSatang: number; depositSatang: number; dueSatang: number; deposit: { receiptSaleId: string; satang: number } | null;
};
export type PayServiceBillInput = {
  heldCartId: string;
  payMethods: { type: PosPayType; amountSatang: number; reference?: string; cashTenderedSatang?: number }[];
  idempotencyKey: string;
};
export type PayServiceBillResult = { ok: true; saleId: string; receiptNo: string | null; grandTotalSatang: number; duplicated: boolean } | ServiceBillFail;

/** คีย์บิลขายตายตัวของงาน (ตัวรับค่าคอมฯ/booking.paid ใช้แยกบิลจากคิวจากบิล BOOKING แบบเดิม `booking-sale-…`) */
export const SERVICE_BILL_SALE_PREFIX = "bq-sale-";
export const SERVICE_BILL_LINES_MAX = 21; // บรรทัดจากนัด 1 + ของที่ทำเพิ่ม ≤ 20
const LABEL_MAX = 60;
const NAME_MAX = 120;
const KEY_MAX = 120;
const PAY_ROWS_MAX = 4;
const CLIENT_PAY_TYPES: ReadonlySet<string> = new Set(["CASH", "PROMPTPAY", "TRANSFER", "CARD"]);
const TX_OPTS = { timeout: 30_000, maxWait: 20_000 } as const;

const MSG = {
  NO_POS: "สาขานี้ยังไม่ได้ผูกระบบขายหน้าร้าน",
  VALIDATION: "ข้อมูลบิลจากคิวไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  NOT_FOUND: "ไม่พบบิลจากคิวนี้ (อาจถูกยกเลิก หรือเป็นของสาขาอื่น)",
  BILL_PAID: "บิลจากคิวนี้รับเงินแล้ว — แก้ไม่ได้ (ยกเลิกบิลที่รับเงินแล้วได้จากหน้างานจองคิว · ต้องมีสิทธิ์ทำงานแทนทุกคน)",
  BILL_VOIDED: "บิลจากคิวของงานนี้ถูกยกเลิกหลังรับเงินแล้ว — เก็บเงินใหม่ที่หน้าขายแบบบิลปกติ (ยังเปิดบิลจากคิวซ้ำให้งานเดิมไม่ได้)",
  SERVICE_BILL_PAID: "บิลจากคิวนี้รับเงินไปแล้ว (อาจจากอีกเครื่อง)",
  PAYMENT_MISMATCH: "ยอดที่รับไม่ตรงกับยอดต้องจ่ายของบิลจากคิว",
  DEPOSIT_BY_SERVER: "ไม่ต้องใส่มัดจำเอง — ระบบหักมัดจำของนัดให้อัตโนมัติ",
  SHIFT_REQUIRED: "ต้องเปิดกะก่อนรับเงิน",
  DEVICE_REVOKED: "เครื่องนี้ถูกเพิกถอนแล้ว — รับเงินไม่ได้ ติดต่อผู้จัดการ",
  BUSY: "มีรายการอื่นกำลังทำกับบิลนี้พร้อมกัน — ลองอีกครั้ง",
  INTERNAL: "ระบบบิลจากคิวขัดข้องชั่วคราว — ลองอีกครั้ง",
} as const;
const fail = (code: string, message?: string): ServiceBillFail => ({ ok: false, code, message: message ?? (MSG as Record<string, string>)[code] ?? "ทำรายการไม่ได้" });
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

// ───────────────────────── ที่เก็บใน cartJson ─────────────────────────
/** cartJson.service — snapshot ของบิลจากคิว (ราคา/ผู้ทำ/อัตราค่าคอมฯ ล็อกตอนเปิด/แก้) · saleId/payKey เขียนในธุรกรรมของบิลขาย */
type StoredService = {
  v: 1;
  appointmentId: string;
  memberId: string | null;
  depositReceiptSaleId: string | null;
  lines: ServiceBillLineInput[];
  saleId?: string | null;
  payKey?: string | null;
  discardReason?: string | null;
};
type Stored = { service: StoredService; preview: string };

function storedOf(j: unknown): StoredService | null {
  if (!isRec(j) || !isRec(j.service)) return null;
  const s = j.service as Record<string, unknown>;
  if (!isId(s.appointmentId) || !Array.isArray(s.lines)) return null;
  const lines = cleanLines(s.lines);
  if (!lines) return null;
  return {
    v: 1,
    appointmentId: s.appointmentId,
    memberId: isId(s.memberId) ? s.memberId : null,
    depositReceiptSaleId: isId(s.depositReceiptSaleId) ? s.depositReceiptSaleId : null,
    lines,
    saleId: isId(s.saleId) ? s.saleId : null,
    payKey: typeof s.payKey === "string" ? s.payKey : null,
    discardReason: typeof s.discardReason === "string" ? s.discardReason : null,
  };
}
const toJson = (s: StoredService): Prisma.InputJsonValue => ({ service: s, preview: previewOf(s.lines) } satisfies Stored) as unknown as Prisma.InputJsonValue;
const previewOf = (lines: ServiceBillLineInput[]) => lines.map((l) => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name)).join(", ").slice(0, 120);
const amountOf = (l: { qty: number; unitPriceSatang: number }) => l.qty * l.unitPriceSatang;
const subtotalOf = (lines: ServiceBillLineInput[]) => lines.reduce((t, l) => t + amountOf(l), 0);

function cleanLines(raw: unknown): ServiceBillLineInput[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > SERVICE_BILL_LINES_MAX) return null;
  const out: ServiceBillLineInput[] = [];
  for (const x of raw) {
    if (!isRec(x)) return null;
    if (x.kind !== "SERVICE" && x.kind !== "PRODUCT") return null;
    const name = typeof x.name === "string" ? x.name.trim() : "";
    if (!name || [...name].length > NAME_MAX || name.includes("\u0000")) return null;
    if (!isInt(x.qty, 1, 99) || !isInt(x.unitPriceSatang, 0, 1_000_000_000)) return null;
    const productId = x.productId === null || x.productId === undefined ? null : isId(x.productId) ? x.productId : undefined;
    const serviceId = x.serviceId === null || x.serviceId === undefined ? null : isId(x.serviceId) ? x.serviceId : undefined;
    const perf = x.performerEmployeeId === null || x.performerEmployeeId === undefined ? null : isId(x.performerEmployeeId) ? x.performerEmployeeId : undefined;
    const bp = x.commissionBp === null || x.commissionBp === undefined ? null : isInt(x.commissionBp, 0, 10_000) ? x.commissionBp : undefined;
    if (productId === undefined || serviceId === undefined || perf === undefined || bp === undefined) return null;
    if (x.kind === "PRODUCT" && !productId) return null;
    const pn = typeof x.performerName === "string" ? [...x.performerName.replace(/\u0000/g, "").trim()].slice(0, 60).join("") : "";
    out.push({ kind: x.kind, name, qty: x.qty, unitPriceSatang: x.unitPriceSatang, productId, serviceId, performerEmployeeId: perf, commissionBp: bp, ...(pn ? { performerName: pn } : {}) });
  }
  return out;
}
function cleanLabel(v: unknown): string {
  const t = typeof v === "string" ? v.replace(/\u0000/g, "").trim() : "";
  return [...t].slice(0, LABEL_MAX).join("");
}

// ───────────────────────── ตัวช่วยฐาน ─────────────────────────
async function lockJob(tx: Tx, tenantId: string, appointmentId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${tenantId}::text || ':' || ${`bq-bill-${appointmentId}`}::text))) l`;
}
function inTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : prisma.$transaction((t) => fn(t), TX_OPTS);
}
async function posOfUnit(db: Tx | typeof prisma, tenantId: string, unitId: string): Promise<string | null> {
  const systemId = await systemForUnit(tenantId, unitId, "POS", db);
  if (!systemId) return null;
  const sys = await db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true } });
  return sys?.id ?? null;
}
type JobRow = { id: string; status: "HELD" | "RECALLED" | "DISCARDED"; version: number; systemId: string; cartJson: Prisma.JsonValue; createdAt: Date; label: string | null };
const JOB_SELECT = { id: true, status: true, version: true, systemId: true, cartJson: true, createdAt: true, label: true } as const;
async function jobRows(db: Tx | typeof prisma, tenantId: string, unitId: string, appointmentId: string): Promise<JobRow[]> {
  return (await db.posHeldCart.findMany({
    where: { tenantId, unitId, serviceJobId: appointmentId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: JOB_SELECT,
  })) as JobRow[];
}
/** บิลที่ "ยังมีผล" ของงาน: HELD ก่อน แล้วที่จ่ายแล้ว (RECALLED) */
const liveOf = (rows: JobRow[]) => rows.find((r) => r.status === "HELD") ?? rows.find((r) => r.status === "RECALLED") ?? null;
/** B.10 fix Q11: บิลขายของแถว RECALLED ถูกยกเลิก (VOIDED) แล้วไหม — อ่านด้วย client เดียวกับผู้เรียก (tx ได้) */
async function saleVoided(db: Tx | typeof prisma, tenantId: string, row: JobRow | null): Promise<boolean> {
  const saleId = row?.status === "RECALLED" ? storedOf(row.cartJson)?.saleId : null;
  if (!saleId) return false;
  const s = await db.posSale.findFirst({ where: { id: saleId, tenantId }, select: { status: true } });
  return s?.status === "VOIDED";
}

function isBusyErr(e: unknown): boolean {
  const o = e as { code?: unknown; meta?: { code?: unknown }; message?: unknown } | null;
  if (!o) return false;
  if (o.code === "P2034" || o.code === "P2028") return true;
  if (o.meta?.code === "40P01" || o.meta?.code === "40001") return true;
  return typeof o.message === "string" && /40P01|40001|deadlock detected|could not serialize|Transaction already closed|expired transaction/i.test(o.message);
}

// ═════════════════════════ ฝั่งโมดูลจองคิว (ไม่มีด่านผู้ใช้ — booking ตรวจสิทธิ์ก่อนเรียก) ═════════════════════════

/** เปิดบิลจากคิวของงาน (ซ้ำ = แถวเดิม created:false) · สาขาไม่ผูก POS = NO_POS · งานจ่ายแล้ว = BILL_PAID */
export async function openServiceBill(input: OpenServiceBillInput, tx?: Tx): Promise<{ ok: true; heldCartId: string; created: boolean } | ServiceBillFail> {
  if (!isRec(input) || !isId(input.tenantId) || !isId(input.unitId) || !isId(input.appointmentId)) return fail("VALIDATION");
  const lines = cleanLines(input.lines);
  if (!lines) return fail("VALIDATION");
  const memberId = isId(input.memberId) ? input.memberId : null;
  const dep = isId(input.depositReceiptSaleId) ? input.depositReceiptSaleId : null;
  const actor = isId(input.actorUserId) ? input.actorUserId : null;
  const label = cleanLabel(input.label);
  return inTx(tx, async (t) => {
    await lockJob(t, input.tenantId, input.appointmentId);
    const systemId = await posOfUnit(t, input.tenantId, input.unitId);
    if (!systemId) return fail("NO_POS");
    const live = liveOf(await jobRows(t, input.tenantId, input.unitId, input.appointmentId));
    if (live?.status === "HELD") return { ok: true as const, heldCartId: live.id, created: false };
    if (live?.status === "RECALLED") return (await saleVoided(t, input.tenantId, live)) ? fail("BILL_VOIDED") : fail("BILL_PAID");
    const svc: StoredService = { v: 1, appointmentId: input.appointmentId, memberId, depositReceiptSaleId: dep, lines };
    const c = await t.posHeldCart.create({
      data: {
        tenantId: input.tenantId, unitId: input.unitId, systemId, label: label || null, cartJson: toJson(svc), lineCount: lines.length,
        approxTotalSatang: subtotalOf(lines), heldByUserId: actor ?? "system", serviceJobId: input.appointmentId,
      },
      select: { id: true },
    });
    return { ok: true as const, heldCartId: c.id, created: true };
  });
}

/** แทนบรรทัดทั้งชุดของบิล HELD (CAS version) · จ่ายแล้ว = BILL_PAID · ไม่มีบิลที่ยังมีผล = NOT_FOUND */
export async function replaceServiceBillLines(
  input: { tenantId: string; unitId: string; appointmentId: string; lines: ServiceBillLineInput[] },
  tx?: Tx,
): Promise<{ ok: true; heldCartId: string; version: number } | ServiceBillFail> {
  if (!isRec(input) || !isId(input.tenantId) || !isId(input.unitId) || !isId(input.appointmentId)) return fail("NOT_FOUND");
  const lines = cleanLines(input.lines);
  if (!lines) return fail("VALIDATION");
  return inTx(tx, async (t) => {
    await lockJob(t, input.tenantId, input.appointmentId);
    const live = liveOf(await jobRows(t, input.tenantId, input.unitId, input.appointmentId));
    if (!live) return fail("NOT_FOUND");
    if (live.status === "RECALLED") return fail("BILL_PAID");
    const svc = storedOf(live.cartJson);
    if (!svc) return fail("NOT_FOUND");
    const next: StoredService = { ...svc, lines };
    const r = await t.posHeldCart.updateMany({
      where: { id: live.id, tenantId: input.tenantId, unitId: input.unitId, status: "HELD", version: live.version },
      data: { cartJson: toJson(next), lineCount: lines.length, approxTotalSatang: subtotalOf(lines), version: { increment: 1 } },
    });
    if (r.count !== 1) return fail("BUSY");
    return { ok: true as const, heldCartId: live.id, version: live.version + 1 };
  });
}

/** ทิ้งบิล HELD (เหตุผล 1–200 ตัว · AuditLog ในธุรกรรมเดียวกัน) · จ่ายแล้ว = BILL_PAID */
export async function discardServiceBill(
  input: { tenantId: string; unitId: string; appointmentId: string; actorUserId: string | null; reason: string },
  tx?: Tx,
): Promise<{ ok: true; heldCartId: string } | ServiceBillFail> {
  if (!isRec(input) || !isId(input.tenantId) || !isId(input.unitId) || !isId(input.appointmentId)) return fail("NOT_FOUND");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || [...reason].length > 200) return fail("VALIDATION", "ต้องใส่เหตุผล 1–200 ตัวอักษร");
  const actor = isId(input.actorUserId) ? input.actorUserId : null;
  return inTx(tx, async (t) => {
    await lockJob(t, input.tenantId, input.appointmentId);
    const live = liveOf(await jobRows(t, input.tenantId, input.unitId, input.appointmentId));
    if (!live) return fail("NOT_FOUND");
    if (live.status === "RECALLED") return fail("BILL_PAID");
    const svc = storedOf(live.cartJson);
    const r = await t.posHeldCart.updateMany({
      where: { id: live.id, tenantId: input.tenantId, unitId: input.unitId, status: "HELD", version: live.version },
      data: { status: "DISCARDED", version: { increment: 1 }, ...(svc ? { cartJson: toJson({ ...svc, discardReason: reason }) } : {}) },
    });
    if (r.count !== 1) return fail("BUSY");
    await t.auditLog.create({
      data: {
        tenantId: input.tenantId,
        unitId: input.unitId,
        actorType: actor ? "USER" : "SYSTEM",
        actorId: actor,
        action: "pos.serviceBill.discard",
        targetType: "PosHeldCart",
        targetId: live.id,
        before: { status: "HELD", appointmentId: input.appointmentId, lineCount: svc?.lines.length ?? null, subtotalSatang: svc ? subtotalOf(svc.lines) : null } as Prisma.InputJsonValue,
        after: { status: "DISCARDED", appointmentId: input.appointmentId, reason } as Prisma.InputJsonValue,
      },
    });
    return { ok: true as const, heldCartId: live.id };
  });
}

/** สถานะบิลจากคิวของงาน (อ่านอย่างเดียว) · ไม่เคยมี = null */
export async function serviceBillStatus(tenantId: string, unitId: string, appointmentId: string): Promise<{ heldCartId: string; status: "HELD" | "PAID" | "DISCARDED" | "VOIDED"; saleId: string | null } | null> {
  if (!isId(tenantId) || !isId(unitId) || !isId(appointmentId)) return null;
  try {
    const rows = await jobRows(prisma, tenantId, unitId, appointmentId);
    const r = liveOf(rows) ?? rows[0] ?? null;
    if (!r) return null;
    if (r.status === "HELD") return { heldCartId: r.id, status: "HELD", saleId: null };
    if (r.status === "RECALLED") return { heldCartId: r.id, status: (await saleVoided(prisma, tenantId, r)) ? "VOIDED" : "PAID", saleId: storedOf(r.cartJson)?.saleId ?? null }; // B.10 fix Q11 ◂
    return { heldCartId: r.id, status: "DISCARDED", saleId: null };
  } catch (e) {
    console.error("[pos/service-bill] serviceBillStatus", e instanceof Error ? e.message.slice(0, 160) : e);
    return null;
  }
}

/** B.10 fix Q5: ระบบ POS ที่ "ใช้งานได้" ของสาขา (ผูก AppSystemUnit + AppSystem POS active) — นิยามเดียวของจองคิวและบิลจากคิว · ไม่มี = null */
export async function servicePosOfUnit(tenantId: string, unitId: string): Promise<string | null> {
  if (!isId(tenantId) || !isId(unitId)) return null;
  return posOfUnit(prisma, tenantId, unitId);
}

/**
 * B.10 fix Q4: ในธุรกรรมของผู้เรียก (ที่ถือ FOR UPDATE แถวนัดแล้ว) — ล็อก advisory `bq-bill-<นัด>` แล้วคืนว่างานมีบิลจากคิวที่ "ยังมีผล" ไหม
 * (HELD = รอรับเงิน · PAID = รับเงินแล้วและยังไม่ถูกยกเลิก) · ไม่มี/ทิ้งแล้ว/บิลขายถูกยกเลิก = null · ใช้ connection ของ tx เท่านั้น
 */
export async function serviceBillLiveTx(tx: Tx, tenantId: string, unitId: string, appointmentId: string): Promise<"HELD" | "PAID" | null> {
  if (!isId(tenantId) || !isId(unitId) || !isId(appointmentId)) return null;
  await lockJob(tx, tenantId, appointmentId);
  const live = liveOf(await jobRows(tx, tenantId, unitId, appointmentId));
  if (!live) return null;
  if (live.status === "HELD") return "HELD";
  return (await saleVoided(tx, tenantId, live)) ? null : "PAID";
}

/**
 * B.10 fix Q11: ยกเลิกบิลจากคิวที่รับเงินแล้ว (ฝั่งจองคิวตรวจสิทธิ์ booking.job.runAny + เหตุผลแล้ว) ⇒ voidSale ทางเดิมของ POS
 * (audit pos.sale.void · pos.sale.voided ⇒ ค่าคอมฯ REVERSE ต่อผู้ทำ · มัดจำกลับตามตัวรับเดิม) · ซ้ำ = already · ไม่มีบิลที่จ่าย = NOT_FOUND
 */
export async function voidServiceBillSale(input: { tenantId: string; unitId: string; appointmentId: string; actorUserId: string; reason: string }): Promise<{ ok: true; saleId: string; already: boolean } | ServiceBillFail> {
  if (!isRec(input) || !isId(input.tenantId) || !isId(input.unitId) || !isId(input.appointmentId) || !isId(input.actorUserId)) return fail("NOT_FOUND");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || [...reason].length > 200) return fail("VALIDATION", "ต้องใส่เหตุผล 1–200 ตัวอักษร");
  const rows = await jobRows(prisma, input.tenantId, input.unitId, input.appointmentId);
  const paid = rows.find((r) => r.status === "RECALLED");
  const saleId = paid ? storedOf(paid.cartJson)?.saleId : null;
  if (!paid || !saleId) return fail("NOT_FOUND", "งานนี้ไม่มีบิลจากคิวที่รับเงินแล้ว");
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: input.tenantId, unitId: input.unitId }, select: { status: true } });
  if (!sale) return fail("NOT_FOUND");
  if (sale.status === "VOIDED") return { ok: true, saleId, already: true };
  try {
    await voidSale(input.tenantId, input.unitId, saleId, { actorUserId: input.actorUserId, reason, idempotencyKey: `bq-void-${input.appointmentId}`, source: "booking" });
  } catch (e) {
    if (e instanceof PosSaleError) return fail(e.code === "HAS_REFUNDS" || e.code === "SHIFT_CLOSED" ? e.code : "VALIDATION", e.message);
    const again = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: input.tenantId }, select: { status: true } });
    if (again?.status === "VOIDED") return { ok: true, saleId, already: true };
    if (isBusyErr(e)) return fail("BUSY");
    return fail("VALIDATION", e instanceof Error ? e.message.slice(0, 200) : "ยกเลิกบิลไม่ได้");
  }
  return { ok: true, saleId, already: false };
}

/** บิลขายของบิลจากคิว (ตัวรับ pos.sale.paid ของจองคิวใช้) — ไม่ใช่บิลจากคิว / ร้านอื่น = null */
export async function serviceBillOfSale(tenantId: string, saleId: string): Promise<{ appointmentId: string; unitId: string; saleId: string; grandTotalSatang: number; status: string } | null> {
  if (!isId(tenantId) || !isId(saleId)) return null;
  const s = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId },
    select: { id: true, unitId: true, sourceModule: true, sourceId: true, idempotencyKey: true, docType: true, status: true, grandTotalSatang: true },
  });
  if (!s || s.docType !== "SALE" || s.sourceModule !== "BOOKING" || !s.sourceId || s.idempotencyKey !== `${SERVICE_BILL_SALE_PREFIX}${s.sourceId}`) return null;
  return { appointmentId: s.sourceId, unitId: s.unitId, saleId: s.id, grandTotalSatang: s.grandTotalSatang, status: String(s.status) };
}

/**
 * ราคา POS ของสินค้าที่ทำเพิ่ม ณ ตอนเปิด/แก้บิล (resolvePrices ช่องทาง STORE ของระบบ POS ที่สาขาผูก) + ชื่อสินค้า ·
 * สาขาไม่ผูก POS = NO_POS · สินค้าไม่อยู่ในระบบ/สาขานี้/เก็บถาวร/ไม่ตั้งราคา = PRODUCT_NOT_FOUND (ไม่บอกว่ามีที่อื่น)
 */
export async function serviceBillProductPrices(
  tenantId: string,
  unitId: string,
  productIds: string[],
): Promise<{ ok: true; items: { productId: string; name: string; unitPriceSatang: number }[] } | ServiceBillFail> {
  if (!isId(tenantId) || !isId(unitId) || !Array.isArray(productIds) || productIds.length > 50 || !productIds.every(isId)) return fail("VALIDATION");
  if (!productIds.length) return { ok: true, items: [] };
  const systemId = await posOfUnit(prisma, tenantId, unitId);
  if (!systemId) return fail("NO_POS");
  const ids = [...new Set(productIds)];
  const rows = await prisma.posProduct.findMany({
    where: { tenantId, systemId, id: { in: ids }, archivedAt: null, OR: [{ unitId: null }, { unitId }] },
    select: { id: true, name: true, soldByWeight: true, kind: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  // B.10 fix Q3: สินค้าเดี่ยว (PRODUCT) เท่านั้น — ชุด/เมนูตามสูตร/สินค้าชั่ง ตัดสต็อกแบบหน้าขายไม่ได้จากบิลจากคิว (หนี้) ⇒ ไม่รับ
  if (ids.some((id) => !byId.has(id) || byId.get(id)!.soldByWeight || byId.get(id)!.kind !== "PRODUCT")) return fail("PRODUCT_NOT_FOUND", "ไม่พบสินค้านี้ในระบบขายของสาขา");
  const pr = await resolvePrices(prisma, { tenantId, systemId, unitId }, { items: ids.map((productId) => ({ productId })) });
  if (!pr.ok) return fail("PRODUCT_NOT_FOUND", pr.message);
  return { ok: true, items: ids.map((id, i) => ({ productId: id, name: byId.get(id)!.name, unitPriceSatang: pr.items[i]!.unitPriceSatang })) };
}

/** มัดจำที่หักได้ ณ ตอนนี้ของใบรับ (คงเหลือจริง · ใบรับของร้าน/สาขาอื่น/ปิดแล้ว = null) — ตัวเดียวกับตอนจ่าย */
export async function serviceBillDeposit(tenantId: string, unitId: string, receiptSaleId: string | null | undefined, billSatang: number): Promise<{ refSaleId: string; satang: number } | null> {
  if (!isId(tenantId) || !isId(unitId) || !isId(receiptSaleId) || !isInt(billSatang, 1, 1_000_000_000_000)) return null;
  return moduleDepositForBill(tenantId, unitId, receiptSaleId, billSatang);
}

// ═════════════════════════ ฝั่งหน้าขาย (ด่านเดียวกับหน้าขาย: registerScopeCheck · pos.sale.create) ═════════════════════════

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | ServiceBillFail> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/service-bill] ${name} INTERNAL`, e instanceof Error ? e.message.slice(0, 300) : e);
    return fail("INTERNAL");
  }
}
const regWhere = (s: RegisterCtx) => ({ tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId });

async function depositFor(tenantId: string, unitId: string, svc: StoredService, subtotal: number): Promise<{ refSaleId: string; satang: number } | null> {
  return moduleDepositForBill(tenantId, unitId, svc.depositReceiptSaleId, subtotal);
}

/** ลิ้นชัก "บิลจากคิว" ของสาขา (ทุกเครื่องของสาขาเห็นเหมือนกัน · เก่าสุดก่อน) */
export async function listServiceBills(ctx: RegisterCtx, actor: RegisterActor): Promise<{ ok: true; items: ServiceBillListItem[] } | RegisterRefusal | ServiceBillFail> {
  return guard("listServiceBills", async () => {
    const s = await registerScopeCheck(ctx, actor);
    if (!s.ok) return s;
    const rows = await prisma.posHeldCart.findMany({
      where: { ...regWhere(s.ctx), status: "HELD", serviceJobId: { not: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, label: true, cartJson: true, createdAt: true },
    });
    const items: ServiceBillListItem[] = [];
    // B.10 fix Q10: มัดจำของทุกบิลในคิวรีเดียว (กติกาเดียวกับ moduleDepositForBill: ร้าน+สาขาเดียวกัน · OPEN · คงเหลือ ∧ ยอดบิล)
    const parsed = rows.map((r) => ({ r, svc: storedOf(r.cartJson) }));
    const receipts = [...new Set(parsed.flatMap((x) => (x.svc?.depositReceiptSaleId ? [x.svc.depositReceiptSaleId] : [])))];
    const deps = receipts.length
      ? await prisma.posDeposit.findMany({ where: { receiptSaleId: { in: receipts } }, select: { receiptSaleId: true, tenantId: true, unitId: true, status: true, amountSatang: true, usedSatang: true, refundedSatang: true } })
      : [];
    const left = new Map(deps.filter((d) => d.tenantId === s.ctx.tenantId && d.unitId === s.ctx.unitId && d.status === "OPEN").map((d) => [d.receiptSaleId, d.amountSatang - d.usedSatang - d.refundedSatang]));
    for (const { r, svc } of parsed) {
      if (!svc) continue;
      const subtotal = subtotalOf(svc.lines);
      const d = svc.depositReceiptSaleId && subtotal > 0 ? Math.max(0, Math.min(left.get(svc.depositReceiptSaleId) ?? 0, subtotal)) : 0;
      items.push({ heldCartId: r.id, appointmentId: svc.appointmentId, label: r.label ?? "", subtotalSatang: subtotal, depositSatang: d, dueSatang: subtotal - d, createdAt: r.createdAt, staffName: svc.lines[0]?.performerName ?? null });
    }
    return { ok: true as const, items };
  });
}

/** รายละเอียดบิลจากคิวที่เลือก (บรรทัด + ผู้ให้บริการ + หักมัดจำคงเหลือจริง + ต้องจ่าย) · ไม่ใช่ HELD ของสาขานี้ = NOT_FOUND */
export async function serviceBillView(ctx: RegisterCtx, actor: RegisterActor, input: { heldCartId: string }): Promise<ServiceBillView | RegisterRefusal | ServiceBillFail> {
  return guard("serviceBillView", async () => {
    const s = await registerScopeCheck(ctx, actor);
    if (!s.ok) return s;
    const id = isRec(input) && isId(input.heldCartId) ? input.heldCartId : null;
    if (!id) return fail("NOT_FOUND");
    const r = await prisma.posHeldCart.findFirst({ where: { id, ...regWhere(s.ctx), status: "HELD", serviceJobId: { not: null } }, select: { id: true, version: true, cartJson: true, label: true } });
    const svc = r ? storedOf(r.cartJson) : null;
    if (!r || !svc) return fail("NOT_FOUND");
    const subtotal = subtotalOf(svc.lines);
    const dep = await depositFor(s.ctx.tenantId, s.ctx.unitId, svc, subtotal);
    const d = dep?.satang ?? 0;
    return {
      ok: true as const, heldCartId: r.id, appointmentId: svc.appointmentId, version: r.version, label: r.label ?? "",
      lines: svc.lines.map((l) => ({ kind: l.kind, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, amountSatang: amountOf(l), performerEmployeeId: l.performerEmployeeId, performerName: l.performerName ?? null })),
      subtotalSatang: subtotal, depositSatang: d, dueSatang: subtotal - d, deposit: dep ? { receiptSaleId: dep.refSaleId, satang: dep.satang } : null,
    };
  });
}

type CleanPay = { type: PosPayType; amountSatang: number; reference?: string; cashTenderedSatang?: number };
function cleanPays(raw: unknown): CleanPay[] | ServiceBillFail {
  // B.10 fix Q1: [] = ยอดต้องจ่าย ฿0 (มัดจำครอบเต็ม · server เติมแถว DEPOSIT เอง) — ยอดไม่ใช่ 0 = PAYMENT_MISMATCH ที่ด่านยอด
  if (!Array.isArray(raw) || raw.length > PAY_ROWS_MAX) return fail("VALIDATION");
  const out: CleanPay[] = [];
  for (const p of raw) {
    if (!isRec(p) || typeof p.type !== "string") return fail("VALIDATION");
    if (p.type === "DEPOSIT") return fail("VALIDATION", MSG.DEPOSIT_BY_SERVER);
    if (!CLIENT_PAY_TYPES.has(p.type)) return fail("VALIDATION", "วิธีชำระนี้ใช้กับบิลจากคิวไม่ได้");
    if (!isInt(p.amountSatang, 1, 1_000_000_000)) return fail("VALIDATION");
    const row: CleanPay = { type: p.type as PosPayType, amountSatang: p.amountSatang };
    if (p.reference !== undefined && p.reference !== null) {
      if (typeof p.reference !== "string" || p.reference.length > 100) return fail("VALIDATION");
      if (p.reference.trim()) row.reference = p.reference.trim();
    }
    if (p.cashTenderedSatang !== undefined && p.cashTenderedSatang !== null) {
      if (p.type !== "CASH" || !isInt(p.cashTenderedSatang, p.amountSatang, 1_000_000_000)) return fail("VALIDATION");
      row.cashTenderedSatang = p.cashTenderedSatang;
    }
    out.push(row);
  }
  return out;
}
class Lost extends Error {}

/**
 * B.10 fix Q3: productId → InvItem ที่ต้องตัดสต็อก (กติกา C2 เดียวกับหน้าขาย: PRODUCT + invItemId + trackStock ที่ใช้จริง ·
 * AUTO = มีความเคลื่อนไหวหรือ onHand ≠ 0) · สินค้าที่ไม่นับสต็อก/ไม่ผูกคลัง = ไม่อยู่ในผล
 */
async function stockItemsOf(tenantId: string, systemId: string, productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!productIds.length) return out;
  const rows = await prisma.posProduct.findMany({ where: { tenantId, systemId, id: { in: productIds } }, select: { id: true, kind: true, invItemId: true, trackStock: true } });
  const autoIds = [...new Set(rows.filter((r) => r.trackStock === null && r.kind === "PRODUCT" && r.invItemId).map((r) => r.invItemId!))];
  const inv = autoIds.length ? await prisma.invItem.findMany({ where: { tenantId, id: { in: autoIds } }, select: { id: true, onHand: true } }) : [];
  const onHand = new Map(inv.map((i) => [i.id, i.onHand]));
  const zero = inv.filter((i) => i.onHand === 0).map((i) => i.id);
  const moved = zero.length
    ? new Set((await prisma.$queryRaw<{ id: string }[]>`SELECT i.id FROM "InvItem" i WHERE i.id = ANY(${zero}::text[]) AND i."tenantId" = ${tenantId}
        AND EXISTS (SELECT 1 FROM "InvMovement" m WHERE m."itemId" = i.id AND m."tenantId" = ${tenantId} LIMIT 1)`).map((m) => m.id))
    : new Set<string>();
  for (const r of rows) {
    if (r.kind !== "PRODUCT" || !r.invItemId) continue;
    const invInfo = onHand.has(r.invItemId) ? { hasMovement: moved.has(r.invItemId), onHand: onHand.get(r.invItemId)! } : null;
    if (effectiveTrackStock({ trackStock: r.trackStock, invItemId: r.invItemId, kind: r.kind }, invInfo).trackStock) out.set(r.id, r.invItemId);
  }
  return out;
}

/**
 * รับเงินบิลจากคิว: บิลขาย BOOKING 1 ใบ (คีย์ bq-sale-<นัด>) · บรรทัด = แถวบิลพัก (ล็อกราคา) · แถวจ่าย = client + DEPOSIT ที่ server เติม ·
 * Σ ≠ ยอดต้องจ่าย = PAYMENT_MISMATCH (ไม่มีบิล) · คีย์ client เดิมหลังจ่าย = duplicated:true บิลเดิม · คีย์ใหม่หลังจ่าย = SERVICE_BILL_PAID
 */
export async function payServiceBill(ctx: RegisterCtx, actor: RegisterActor, input: PayServiceBillInput): Promise<PayServiceBillResult | RegisterRefusal> {
  return guard("payServiceBill", async (): Promise<PayServiceBillResult | RegisterRefusal> => {
    const s = await registerScopeCheck(ctx, actor);
    if (!s.ok) return s;
    const deviceId = isRec(ctx) && typeof ctx.deviceId === "string" ? ctx.deviceId : undefined;
    const id = isRec(input) && isId(input.heldCartId) ? input.heldCartId : null;
    if (!id) return fail("NOT_FOUND");
    const key = isRec(input) && typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!key || key.length > KEY_MAX) return fail("VALIDATION", "รหัสรายการ (idempotencyKey) ไม่ถูกต้อง");
    const pays = cleanPays(isRec(input) ? input.payMethods : null);
    if (!Array.isArray(pays)) return pays;
    const where = { id, ...regWhere(s.ctx), serviceJobId: { not: null } };

    const settled = async (row: { status: string; cartJson: Prisma.JsonValue }): Promise<PayServiceBillResult | null> => {
      if (row.status === "DISCARDED") return fail("NOT_FOUND");
      if (row.status !== "RECALLED") return null;
      const svc = storedOf(row.cartJson);
      if (!svc?.saleId || svc.payKey !== key) return fail("SERVICE_BILL_PAID");
      const sale = await prisma.posSale.findFirst({ where: { id: svc.saleId, tenantId: s.ctx.tenantId }, select: { id: true, receiptNo: true, grandTotalSatang: true } });
      return sale ? { ok: true, saleId: sale.id, receiptNo: sale.receiptNo, grandTotalSatang: sale.grandTotalSatang, duplicated: true } : fail("SERVICE_BILL_PAID");
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await prisma.posHeldCart.findFirst({ where, select: { id: true, status: true, version: true, cartJson: true } });
      if (!row) return fail("NOT_FOUND");
      const done = await settled(row);
      if (done) return done;
      const svc = storedOf(row.cartJson);
      if (!svc) return fail("NOT_FOUND");
      if (attempt === 0 && deviceId && (await posDeviceRevoked(prisma, s.ctx.tenantId, s.ctx.unitId, deviceId))) return fail("DEVICE_REVOKED");
      const subtotal = subtotalOf(svc.lines);
      const dep = await depositFor(s.ctx.tenantId, s.ctx.unitId, svc, subtotal);
      const due = subtotal - (dep?.satang ?? 0);
      if (pays.reduce((t, p) => t + p.amountSatang, 0) !== due) return fail("PAYMENT_MISMATCH", `${MSG.PAYMENT_MISMATCH} (ต้องจ่าย ${due} สตางค์)`);
      const shift = await resolveRegisterShift(prisma, s.ctx, deviceId);
      if (!shift.ok) return fail("SHIFT_REQUIRED");
      // B.10 fix Q3: สินค้านับสต็อก (PRODUCT + invItemId + trackStock ตามกติกา C2 ของหน้าขาย) ⇒ itemId บนบรรทัด (ตัดสต็อก + COGS ทางเดียวกับหน้าขาย) ·
      //   สินค้าที่มองไม่เห็นที่สาขานี้แล้ว = ไม่มี itemId (ไม่ปฏิเสธบิลของที่ส่งมอบแล้ว · แบบบิลโต๊ะ P2.4) ◂
      const prodIds = [...new Set(svc.lines.flatMap((l) => (l.kind === "PRODUCT" && l.productId ? [l.productId] : [])))];
      const itemOf = await stockItemsOf(s.ctx.tenantId, s.ctx.systemId, prodIds);
      // B.10 fix Q6: สะสมแต้มตามกติกา POS เดิม (ระบบแต้มของสาขา) ◂
      const pointSystemId = svc.memberId ? await systemForUnit(s.ctx.tenantId, s.ctx.unitId, "POINT") : null;
      const saleInput: CreateSaleInput = {
        tenantId: s.ctx.tenantId,
        unitId: s.ctx.unitId,
        systemId: s.ctx.systemId,
        ...(svc.memberId ? { memberId: svc.memberId, memberAttachOnly: true } : {}),
        sourceModule: "BOOKING",
        sourceId: svc.appointmentId,
        idempotencyKey: `${SERVICE_BILL_SALE_PREFIX}${svc.appointmentId}`,
        soldByUserId: s.actor.userId,
        ...(pointSystemId ? { pointSystemId } : {}),
        shiftId: shift.shiftId,
        lines: svc.lines.map((l) => ({
          name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang,
          ...(l.serviceId ? { serviceId: l.serviceId } : {}),
          ...(l.productId ? { productId: l.productId } : {}),
          ...(l.productId && itemOf.get(l.productId) ? { itemId: itemOf.get(l.productId)! } : {}),
          ...(l.performerEmployeeId ? { performerEmployeeId: l.performerEmployeeId } : {}),
        })),
        payMethods: [...pays, ...(dep ? [{ type: "DEPOSIT" as PosPayType, amountSatang: dep.satang, refSaleId: dep.refSaleId }] : [])],
      };
      try {
        const out = await prisma.$transaction(async (tx) => {
          await lockJob(tx, s.ctx.tenantId, svc.appointmentId);
          const now = new Date();
          const won = await tx.posHeldCart.updateMany({
            where: { id, ...regWhere(s.ctx), status: "HELD", version: row.version },
            data: { status: "RECALLED", recalledAt: now, recalledByUserId: s.actor.userId, version: { increment: 1 } },
          });
          if (won.count !== 1) throw new Lost();
          const sale = await createSale(saleInput, callerTx(tx));
          await tx.posHeldCart.update({ where: { id }, data: { cartJson: toJson({ ...svc, saleId: sale.saleId, payKey: key }) } });
          return sale;
        }, TX_OPTS);
        await afterSaleCommitted(saleInput, out.saleId);
        return { ok: true as const, saleId: out.saleId, receiptNo: out.receiptNo ?? null, grandTotalSatang: out.grandTotalSatang, duplicated: false };
      } catch (e) {
        if (e instanceof Lost) continue; // แพ้ CAS (จ่ายพร้อมกัน/แก้ของระหว่างจ่าย) ⇒ อ่านใหม่แล้วตัดสิน
        if (isBusyErr(e)) {
          if (attempt < 2) continue;
          return fail("BUSY");
        }
        if (e instanceof PosSaleError) {
          if ((e.code === "DEPOSIT_EXCEEDS" || e.code === "DEPOSIT_CLOSED") && attempt < 2) continue; // มัดจำเปลี่ยนระหว่างอ่านกับล็อก ⇒ คิดใหม่
          if (e.code === "PAYMENT_MISMATCH") return fail("PAYMENT_MISMATCH");
          if (e.code === "SHIFT_REQUIRED" || e.code === "SHIFT_CLOSED") return fail("SHIFT_REQUIRED");
          return fail(e.code === "IDEMPOTENCY_CONFLICT" ? "SERVICE_BILL_PAID" : "VALIDATION", e.message);
        }
        if (e instanceof Error && e.message.startsWith("PAYMENT_MISMATCH")) return fail("PAYMENT_MISMATCH");
        throw e;
      }
    }
    return fail("BUSY");
  });
}
