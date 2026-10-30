// SVC B.8 — มัดจำรุ่นแรก (จองคิว) · สัญญา: ledger/svc-briefs/svc-brief-b.8.md §3 · ข้อสอบ scripts/qc-svc-b.8.mts
//   สถานะมัดจำ (คิดจากข้อมูล) · หน้าจ่ายสาธารณะ (QR พร้อมเพย์ยอดล็อก + แนบสลิป · token ลิงก์จัดการนัด = สิทธิ์) · consumer สลิปอนุมัติ ·
//   จอร้าน (คิวมัดจำ · ร้านยืนยันรับเงิน · คืนมัดจำที่ค้างคืน) · ใช้มัดจำในบิล (B.10)
//
// 🔴 ไฟล์นี้ไม่ import prisma ดิบ (F5): ตัวช่วยฐานข้อมูลอยู่ใน service.ts (แถวนัด = ตัวตัดสินเดียว ใต้ FOR UPDATE) · ที่เหลือใช้ tenantDb
// 🔴 เงิน: ใบรับ/บิลริบผ่านฟังก์ชันโมดูลของ POS + createSale จุดเดียวของ booking (bookingTxSale) — ไม่เรียก createSale เอง ·
//    คีย์ใบรับต่อนัดเดียวทุกทาง (booking-deposit-<id>) ⇒ สลิป ∥ ร้านกด ∥ consumer ซ้ำ = ใบรับเดียว · ยอดคาดของสลิปมาจากแถวนัดเสมอ
// 🔴 X7: token ใช้ไม่ได้ทุกแบบ ⇒ คำตอบเดียวกันทุกไบต์ · X8/X10: ผลคืนไม่มีชื่อ/เบอร์/ชื่อผู้โอน/URL ไฟล์ · ไม่ส่ง policy ให้ตัวตรวจสลิป
// 🔴 สิทธิ์จอร้าน = Membership สดจากฐานทุกคำขอ · ไม่มีสิทธิ์/หน่วยอื่น/ร้านอื่น/ยังไม่ตอบรับ ⇒ NOT_FOUND คำตอบเดียว
// 🔴 นโยบายร้าน (เวลาถือช่อง · % ริบ · ระดับยกเว้น · โหมดยกเลิกช้า) อ่านจาก snapshot/ทะเบียนค่าตั้ง — ไม่ฮาร์ดโค้ดในไฟล์นี้
import { tenantDb } from "@/lib/core/db";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { logOps } from "@/lib/core/ops";
import { submitSlip } from "@/lib/payment/slip-verify";
import { promptpayQrFor, receiverFor } from "@/lib/payment/receiver";
import { lateCancelModeOf, lateForfeitSatangOf, manageIpGate, manageTokenGate, resolveManageToken } from "./online";
import { maskPhone } from "./privacy-shared";
import {
  acceptPaidDeposit,
  bindDepositReceipt,
  claimSlipSubmit,
  depositSnapOf,
  forfeitPendingDeposit,
  lockForRefund,
  refundSaleTotalOf,
  releaseSlipSubmit,
  depositAuditExists,
  depositFactsForQueue,
  depositFactsOf,
  depositSlipOf,
  holdUntilOf,
  liveDepositReceiptOf,
  selfChangeState,
  snapshotSelfPolicy,
  takeAppointmentDeposit,
  writeDepositAudit,
  type DepositFacts,
} from "./service";

// ═════════════════════════ §3.1 สถานะมัดจำ ═════════════════════════
export type DepositState = "NONE" | "AWAITING" | "IN_REVIEW" | "UNDERPAID" | "PAID" | "USED" | "FORFEITED" | "REFUND_DUE" | "REFUNDED" | "EXPIRED"
  /** V5 (มติผู้คุม): ไม่มา/ยกเลิกช้า มัดจำยัง OPEN · % > 0 · ยังไม่มีบิลริบ (ริบอัตโนมัติล้ม) ⇒ รอร้านตัดสิน ริบ/คืน */
  | "FORFEIT_PENDING"
  /** V12: สลิปอนุมัติแล้ว กำลังลงเงิน (ซ่อน QR · แนบใหม่ไม่ได้) */
  | "RECORDING";
export type DepositInfo = {
  state: DepositState; method: "NONE" | "PROMPTPAY_SLIP"; exempt: "MEMBER_TIER" | null;
  requiredSatang: number;
  paidSatang: number;
  usedSatang: number; forfeitedSatang: number; refundedSatang: number;
  refundDueSatang: number;
  holdUntilMs: number | null;
  receiptNo: string | null; slipStatus: "PENDING" | "AUTO_APPROVED" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED" | null;
  /** V15: รับเกินยอดมัดจำ (สตางค์) · 0 = ไม่เกิน */
  overpaidSatang: number;
};

const SLIP_STATUSES = ["PENDING", "AUTO_APPROVED", "NEEDS_REVIEW", "APPROVED", "REJECTED"] as const;
type SlipStatus = (typeof SLIP_STATUSES)[number];
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ACTIVE = new Set(["PENDING", "CONFIRMED"]);
const NO_SERVICE_END = new Set(["CANCELLED", "NO_SHOW"]);
const snapValues = (snap: unknown): Record<string, unknown> => (isRec(snap) && isRec(snap.values) ? snap.values : {});

/** คงเหลือของใบรับ (สตางค์) — ไม่มีแถวมัดจำ POS (ไม่ผูก POS) = ยอดมัดจำของนัดเมื่อจ่ายแล้ว */
function remainingOf(f: DepositFacts): number {
  if (!f.appt.depositPaidAt) return 0;
  return f.dep ? Math.max(0, f.dep.amountSatang - f.dep.usedSatang - f.dep.refundedSatang) : Math.max(0, f.appt.depositSatang);
}
const pctOfSnap = (snap: unknown): number | null => {
  const v = snapValues(snap)["booking.deposit.forfeitPct"];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(100, v) : null;
};

function infoOf(f: DepositFacts): DepositInfo {
  const a = f.appt;
  const vals = snapValues(a.policySnapshot);
  const method = vals["booking.deposit.method"] === "PROMPTPAY_SLIP" ? "PROMPTPAY_SLIP" : "NONE";
  const ds = depositSnapOf(a.policySnapshot);
  const exempt = ds.exempt === "MEMBER_TIER" ? "MEMBER_TIER" : null;
  const required = Math.max(0, a.depositSatang);
  const paid = a.depositPaidAt ? (f.dep ? f.dep.amountSatang : required) : 0;
  const forfeited = f.forfeitedSatang;
  const refunded = f.dep?.refundedSatang ?? 0;
  const used = Math.max(0, (f.dep?.usedSatang ?? 0) - forfeited);
  const remaining = remainingOf(f);
  const slipStatus = f.slip && (SLIP_STATUSES as readonly string[]).includes(f.slip.status) ? (f.slip.status as SlipStatus) : null;
  let state: DepositState;
  if (!a.depositPaidAt) {
    if (required <= 0) state = "NONE";
    else if (!ACTIVE.has(a.status)) state = a.status === "CANCELLED" && a.cancelReason === "DEPOSIT_TIMEOUT" ? "EXPIRED" : "NONE"; // V20
    else if (slipStatus === "PENDING" || slipStatus === "NEEDS_REVIEW") state = "IN_REVIEW";
    else if (slipStatus === "APPROVED" || slipStatus === "AUTO_APPROVED") state = "RECORDING"; // V12
    else state = "AWAITING";
  } else if (remaining <= 0) {
    state = refunded > 0 ? "REFUNDED" : used > 0 ? "USED" : forfeited > 0 ? "FORFEITED" : "USED";
  } else if (NO_SERVICE_END.has(a.status)) {
    // V5: ไม่มา / ยกเลิกช้า (จ่ายก่อนยกเลิก · ยอมรับยอด > 0) + % > 0 + ยังไม่มีบิลริบ ⇒ รอร้านตัดสิน (ไม่แสดงว่า "ร้านจะคืน")
    const forfeitable = !!f.dep && forfeited === 0 && ds.lateMoney !== true && pctOfSnap(a.policySnapshot) !== null
      && (a.status === "NO_SHOW" || (a.cancelReason === "CUSTOMER_LATE" && ds.late?.paid === true && (ds.late?.acceptSatang ?? 0) > 0));
    state = forfeitable ? "FORFEIT_PENDING" : "REFUND_DUE";
  } else if (used > 0) state = "USED";
  else if (paid < required && ACTIVE.has(a.status) && ds.accepted !== true) state = "UNDERPAID"; // V21
  else state = "PAID";
  const hold = state === "AWAITING" ? holdUntilOf({ channel: a.channel, depositSatang: a.depositSatang, policySnapshot: a.policySnapshot, status: a.status, depositPaidAt: a.depositPaidAt, createdAt: a.createdAt }) : null;
  return {
    state, method, exempt, requiredSatang: required, paidSatang: paid, usedSatang: used, forfeitedSatang: forfeited, refundedSatang: refunded,
    refundDueSatang: state === "REFUND_DUE" ? remaining : 0,
    holdUntilMs: hold ? hold.getTime() : null,
    receiptNo: f.receiptNo, slipStatus,
    overpaidSatang: a.depositPaidAt && paid > required ? paid - required : 0,
  };
}

const validCtx = (ctx: unknown): ctx is { tenantId: string; unitId: string } =>
  isRec(ctx) && typeof ctx.tenantId === "string" && !!ctx.tenantId && typeof ctx.unitId === "string" && !!ctx.unitId;

/** สถานะมัดจำของนัดในหน่วยนี้ — นัดของหน่วยอื่น/ร้านอื่น ⇒ null */
export async function depositInfo(ctx: { tenantId: string; unitId: string }, appointmentId: string): Promise<DepositInfo | null> {
  if (!validCtx(ctx)) return null;
  const f = await depositFactsOf(ctx, appointmentId);
  return f ? infoOf(f) : null;
}

// ═════════════════════════ §3.2 หน้าจ่าย (สาธารณะ) ═════════════════════════
export type DepositPay = {
  state: DepositState; amountSatang: number; holdUntilMs: number | null;
  qr: { svgDataUrl: string; displayName: string } | null;
  noReceiver: boolean;
  canSubmitSlip: boolean;
  slip: { status: string } | null;
  forfeitedSatang: number; refundDueSatang: number;
  lateCancel: { allowed: boolean; forfeitSatang: number } | null;
};
export type SlipSubmitFail = "NOT_FOUND" | "RATE_LIMITED" | "EXPIRED" | "ALREADY_PAID" | "IN_REVIEW" | "NO_DEPOSIT" | "BAD_STATE" | "BAD_INPUT" | "NO_RECEIVER" | "BUSY";

const R = {
  /** X7: ข้อความเดียวทุกกรณีที่ลิงก์ใช้ไม่ได้ (เท่ากับ online.ts) */
  NF: "ลิงก์นี้ใช้ไม่ได้แล้ว — กรุณาติดต่อร้าน",
  RATE: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  NO_DEPOSIT: "นัดนี้ไม่ต้องจ่ายมัดจำ",
  ALREADY_PAID: "นัดนี้ได้รับมัดจำแล้ว",
  IN_REVIEW: "ร้านกำลังตรวจสลิปที่ส่งไว้ — รอผลก่อนส่งใบใหม่",
  EXPIRED: "เลยเวลาจ่ายมัดจำแล้ว นัดนี้ถูกปล่อยช่อง — กรุณาจองใหม่",
  BAD_STATE: "นัดนี้รับมัดจำทางลิงก์ไม่ได้ในสถานะปัจจุบัน — กรุณาติดต่อร้าน",
  BAD_INPUT: "แนบรูปสลิป (JPG/PNG/WEBP) แล้วลองอีกครั้ง",
  NO_RECEIVER: "ร้านยังไม่ได้ตั้งบัญชีรับเงิน — กรุณาติดต่อร้าน",
  BUSY: "ระบบไม่ว่าง กรุณาลองใหม่อีกครั้ง",
} as const;
const nowOf = (o?: { now?: Date }): Date => (o?.now instanceof Date && !Number.isNaN(o.now.getTime()) ? o.now : new Date());
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

/** เลยเวลาฟรี + นัดยังถือช่อง ⇒ { allowed (snapshot FORFEIT), ยอดที่ร้านจะเก็บ } · อื่น null */
async function lateCancelOf(f: DepositFacts, now: Date): Promise<DepositPay["lateCancel"]> {
  const a = f.appt;
  if (!ACTIVE.has(a.status)) return null;
  const ctx = { tenantId: a.tenantId, unitId: a.unitId };
  const row = await tenantDb(ctx).appointment.findFirst({ where: { id: a.id, tenantId: a.tenantId, unitId: a.unitId }, select: { serviceId: true, staffId: true, policySnapshot: true, rescheduleCount: true } });
  if (!row) return null;
  const pol = await snapshotSelfPolicy(ctx, row);
  const st = selfChangeState({ status: a.status, startAt: a.startAt, rescheduleCount: row.rescheduleCount }, pol, now);
  if (st.cancelBlock !== "LATE_CHANGE") return null;
  return { allowed: lateCancelModeOf(a.policySnapshot) === "FORFEIT", forfeitSatang: await lateForfeitSatangOf(ctx, a.id) }; // V14 นิยามเดียวกับ cancelOnline
}

export async function loadDepositPay(token: unknown, opts?: { now?: Date; ip?: string; ipCounted?: true }): Promise<{ ok: true; pay: DepositPay } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" }> {
  const now = nowOf(opts);
  // V17: หน้า /bq/m นับถัง IP ไปแล้วใน loadManageView ของคำขอเดียวกัน (ipCounted · ฝั่งเซิร์ฟเวอร์เท่านั้น) ⇒ ไม่นับซ้ำ
  if (opts?.ipCounted !== true && !(await manageIpGate(opts?.ip, now)).ok) return { ok: false, code: "RATE_LIMITED" };
  const m = await resolveManageToken(token, now);
  if (!m) return { ok: false, code: "NOT_FOUND" };
  const f = await depositFactsOf(m.ctx, m.row.id);
  if (!f) return { ok: false, code: "NOT_FOUND" };
  const info = infoOf(f);
  let qr: DepositPay["qr"] = null;
  let noReceiver = false;
  if (info.state === "AWAITING") {
    const q = await promptpayQrFor({ tenantId: m.ctx.tenantId }, { unitId: m.ctx.unitId, amountSatang: f.appt.depositSatang, ref: "" });
    if (q.ok) qr = { svgDataUrl: q.svgDataUrl, displayName: q.displayName };
    else if (q.code === "NO_RECEIVER") noReceiver = true;
  }
  const holdOver = info.holdUntilMs !== null && now.getTime() > info.holdUntilMs;
  return {
    ok: true,
    pay: {
      state: info.state,
      amountSatang: f.appt.depositSatang,
      holdUntilMs: info.holdUntilMs,
      qr,
      noReceiver,
      canSubmitSlip: info.state === "AWAITING" && !noReceiver && !holdOver,
      slip: f.slip ? { status: f.slip.status } : null,
      forfeitedSatang: info.forfeitedSatang,
      refundDueSatang: info.refundDueSatang,
      lateCancel: await lateCancelOf(f, now),
    },
  };
}

type SubmitOut = { ok: true; status: string; state: DepositState } | { ok: false; code: SlipSubmitFail; reason: string };
const sfail = (code: SlipSubmitFail, reason: string): SubmitOut => ({ ok: false, code, reason });

export async function submitDepositSlip(
  token: unknown,
  input: { file: { data: Uint8Array; contentType: string }; qrPayload?: string; idempotencyKey: string },
  opts?: { now?: Date; ip?: string; deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> } },
): Promise<SubmitOut> {
  const now = nowOf(opts);
  // ① ถัง IP ก่อนแตะฐาน → ② token → ③ ถังต่อ token (นับทุกครั้งที่ token ใช้ได้ ก่อนตรวจสถานะ/ผู้รับ/อัปไฟล์)
  if (!(await manageIpGate(opts?.ip, now)).ok) return sfail("RATE_LIMITED", R.RATE);
  const m = await resolveManageToken(token, now);
  if (!m) return sfail("NOT_FOUND", R.NF);
  if (!(await manageTokenGate(m.token, now)).ok) return sfail("RATE_LIMITED", R.RATE);
  const ctx = m.ctx;
  const f = await depositFactsOf(ctx, m.row.id);
  if (!f) return sfail("NOT_FOUND", R.NF);
  const a = f.appt;

  // รูปข้อมูล (ไม่รับยอด/นโยบาย/โดเมนจาก client — ใช้เฉพาะไฟล์ · QR · key)
  const x: Record<string, unknown> = isRec(input) ? input : {};
  const key = typeof x.idempotencyKey === "string" ? x.idempotencyKey.trim() : "";
  const fx = isRec(x.file) ? x.file : null;
  const file = fx && fx.data instanceof Uint8Array && typeof fx.contentType === "string" ? { data: fx.data, contentType: fx.contentType } : null;
  const qrPayload = typeof x.qrPayload === "string" && x.qrPayload.length <= 4096 ? x.qrPayload : undefined;
  const slipKey = `bq-slip:${key}`;
  const okOf = async (status: string): Promise<SubmitOut> => {
    const after = await depositFactsOf(ctx, a.id);
    return { ok: true, status, state: after ? infoOf(after).state : "AWAITING" };
  };
  // V19: คำขอเดิม (key เดิม) ⇒ ผลเดิม (สถานะสลิปเดิม) ไม่ติดด่านสถานะ · ไม่ส่งไฟล์ซ้ำ
  const priorOf = async () => (KEY_RE.test(key)
    ? tenantDb(ctx).paymentSlip.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, refId: a.id, checks: { path: ["idempotencyKey"], equals: slipKey } }, select: { id: true, status: true } })
    : null);
  const prior = await priorOf();
  if (prior) return okOf(prior.status);

  // ด่านตามลำดับสัญญา (อ่านก่อน · ตัดสินซ้ำใต้ claim ด้านล่าง)
  const gate = (st: { status: string; cancelReason: string | null; depositPaidAt: Date | null; depositSatang: number }, lastSlip: string | undefined): SubmitOut | null => {
    if (st.depositSatang <= 0) return sfail("NO_DEPOSIT", R.NO_DEPOSIT);
    if (st.depositPaidAt || lastSlip === "APPROVED" || lastSlip === "AUTO_APPROVED") return sfail("ALREADY_PAID", R.ALREADY_PAID);
    if (lastSlip === "PENDING" || lastSlip === "NEEDS_REVIEW") return sfail("IN_REVIEW", R.IN_REVIEW);
    if (!ACTIVE.has(st.status)) return st.status === "CANCELLED" && st.cancelReason === "DEPOSIT_TIMEOUT" ? sfail("EXPIRED", R.EXPIRED) : sfail("BAD_STATE", R.BAD_STATE);
    const hold = holdUntilOf({ channel: a.channel, depositSatang: st.depositSatang, policySnapshot: a.policySnapshot, status: st.status, depositPaidAt: st.depositPaidAt, createdAt: a.createdAt });
    if (hold && now.getTime() > hold.getTime()) return sfail("EXPIRED", R.EXPIRED);
    return null;
  };
  const g0 = gate(a, f.slip?.status);
  if (g0) return g0;
  if (!file || !KEY_RE.test(key) || (x.qrPayload !== undefined && x.qrPayload !== null && qrPayload === undefined)) return sfail("BAD_INPUT", R.BAD_INPUT);
  if (!(await receiverFor({ tenantId: ctx.tenantId }, ctx.unitId))) return sfail("NO_RECEIVER", R.NO_RECEIVER);

  // V4: ด่านต่อนัด — claim (CAS บนแถวนัด · หมดอายุเอง) ก่อนอัปไฟล์/เรียกตัวตรวจ · ใต้ claim ตรวจซ้ำ (จ่ายแล้ว · สลิปค้าง · ถือช่อง) ·
  //   ไม่ถือ tx/ล็อกข้ามการเรียกตัวตรวจสลิป · ปล่อย claim เสมอ (finally)
  const claim = await claimSlipSubmit(ctx, a.id, slipKey);
  if (!claim.ok) {
    if (claim.code === "HELD") return sfail("IN_REVIEW", R.IN_REVIEW);
    if (claim.code === "BUSY") return sfail("BUSY", R.BUSY);
    return sfail("NOT_FOUND", R.NF);
  }
  try {
    const again = await priorOf();
    if (again) return okOf(again.status);
    const lastSlip = (await tenantDb(ctx).paymentSlip.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, domain: "BOOKING", refType: "APPT_DEPOSIT", refId: a.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { status: true } }))?.status;
    const g1 = gate(claim.row, lastSlip);
    if (g1) return g1;
    const deps = isRec(opts?.deps) ? opts!.deps! : {};
    const r = await submitSlip(
      { tenantId: ctx.tenantId },
      {
        unitId: ctx.unitId, domain: "BOOKING", refType: "APPT_DEPOSIT", refId: a.id, file,
        ...(qrPayload !== undefined ? { qrPayload } : {}),
        expectedSatang: claim.row.depositSatang, // จากแถวนัด (ไม่รับจาก client)
        expectedPayerNames: a.customerName ? [a.customerName] : [], // ใช้เทียบเท่านั้น (ตัวตรวจไม่เก็บ)
        idempotencyKey: slipKey,
      },
      { ...(typeof deps.put === "function" ? { put: deps.put } : {}), ...(typeof deps.del === "function" ? { del: deps.del } : {}), now },
    );
    if (!r.ok) {
      if (r.code === "IDEMPOTENCY_CONFLICT") {
        const p2 = await priorOf();
        if (p2) return okOf(p2.status); // V19
      }
      return r.code === "NO_RECEIVER" ? sfail("NO_RECEIVER", R.NO_RECEIVER) : sfail("BAD_INPUT", r.message || R.BAD_INPUT);
    }
    // อนุมัติอัตโนมัติ ⇒ ลงเงินทันที (ลูกค้าเห็นผลเลย) · consumer ที่ตามมาไม่มีผล (idempotent ต่อสลิป)
    if (r.status === "AUTO_APPROVED") {
      try {
        await onDepositSlipApproved({ tenantId: ctx.tenantId, unitId: ctx.unitId, payload: { slipId: r.slipId } });
      } catch (e) {
        await logOps("WARN", "booking.deposit", "ลงเงินมัดจำจากสลิปอนุมัติอัตโนมัติไม่สำเร็จ — คิวจะลองใหม่", { tenantId: ctx.tenantId, detail: e instanceof Error ? e.message.slice(0, 200) : "error" });
      }
    }
    // นัดถูกปล่อย/ยกเลิกระหว่างตรวจ (expire ไม่แตะนัดที่ถือ claim แต่ทางอื่นได้) ⇒ บอกความจริง (ไม่ตอบ ok)
    const after = await depositFactsOf(ctx, a.id);
    if (after && !ACTIVE.has(after.appt.status) && !after.appt.depositPaidAt) return after.appt.cancelReason === "DEPOSIT_TIMEOUT" ? sfail("EXPIRED", R.EXPIRED) : sfail("BAD_STATE", R.BAD_STATE);
    return { ok: true, status: r.status, state: after ? infoOf(after).state : "AWAITING" };
  } finally {
    await releaseSlipSubmit(ctx, a.id, slipKey);
  }
}

// ═════════════════════════ §3.3 consumer เงินเข้า (สลิปอนุมัติ) ═════════════════════════
async function slipAfterPaid(tenantId: string, unitId: string, appointmentId: string, slipId: string, amountSatang: number, receiptSaleId: string | null): Promise<void> {
  if (await depositAuditExists(tenantId, appointmentId, "booking.deposit.slip_after_paid", slipId)) return;
  await writeDepositAudit({ tenantId, unitId, appointmentId, action: "booking.deposit.slip_after_paid", actorType: "SYSTEM", actorId: "module:booking", after: { slipId, amountSatang, receiptSaleId } });
  await logOps("WARN", "booking.deposit", "มีสลิปอนุมัติของนัดที่รับมัดจำแล้ว — ไม่ออกใบรับที่สอง ตรวจว่าเป็นการโอนซ้ำจริงไหม", { tenantId, detail: `appointment=${appointmentId} slip=${slipId}` });
}

/** สลิปอนุมัติ ⇒ ใบรับมัดจำ + ผูกแถวนัด (§3.3) · อ่านสลิป/นัดจากฐานใหม่เสมอ · ไม่ใช่ของจองคิว/ไม่พบ = ไม่ทำอะไร · ไม่ throw ในทางปกติ */
export async function onDepositSlipApproved(evt: { tenantId: string; unitId?: string | null; payload: unknown }): Promise<void> {
  if (!isRec(evt) || typeof evt.tenantId !== "string" || !evt.tenantId) return;
  const p = isRec(evt.payload) ? evt.payload : null;
  const slipId = typeof p?.slipId === "string" ? p.slipId : "";
  if (!slipId) return;
  const tenantId = evt.tenantId;
  const slip = await depositSlipOf(tenantId, slipId);
  if (!slip || slip.domain !== "BOOKING" || slip.refType !== "APPT_DEPOSIT" || (slip.status !== "APPROVED" && slip.status !== "AUTO_APPROVED")) return;
  const ctx = { tenantId, unitId: slip.unitId };
  const f = await depositFactsOf(ctx, slip.refId);
  if (!f) {
    await logOps("WARN", "booking.deposit", "สลิปมัดจำที่อนุมัติแล้วไม่พบนัดของสาขา — ไม่ลงเงิน", { tenantId, detail: `slip=${slip.id}` });
    return;
  }
  const id = f.appt.id;
  if (await depositAuditExists(tenantId, id, "booking.deposit.receive", slip.id)) return; // สลิปนี้ลงเงินแล้ว
  const decided = isRec(slip.checks) && isRec(slip.checks.decided) ? slip.checks.decided.amountSatang : undefined;
  const pick = [decided, slip.amountSatang, slip.expectedSatang].find((v) => typeof v === "number" && Number.isSafeInteger(v) && v > 0);
  const amount = typeof pick === "number" ? pick : 0;
  if (amount <= 0) {
    await logOps("WARN", "booking.deposit", "สลิปมัดจำอนุมัติแต่ไม่มียอด — ไม่ลงเงิน", { tenantId, detail: `slip=${slip.id}` });
    return;
  }
  if (f.appt.depositPaidAt) {
    await slipAfterPaid(tenantId, ctx.unitId, id, slip.id, amount, f.appt.depositSaleId);
    return;
  }
  const take = await takeAppointmentDeposit({
    tenantId, unitId: ctx.unitId, appointmentId: id, amountSatang: amount, payType: "PROMPTPAY",
    customerId: f.appt.customerId, customerName: f.appt.customerName || null, serviceName: f.appt.serviceName,
  });
  let saleId: string | null;
  if (take.ok) saleId = take.saleId;
  else if (take.code === "CONFLICT") {
    // อีกทาง (ร้านกด/รับมัดจำเดิม) ออกใบรับของคีย์นี้ด้วยยอด/วิธีอื่นไปแล้ว ⇒ ใบรับนั้นคือมัดจำของนัด (ไม่ออกซ้ำ)
    saleId = await liveDepositReceiptOf(tenantId, id);
    if (!saleId) throw new Error(`[booking.deposit] ใบรับของนัดชนคีย์แต่ไม่พบใบที่มีผล (${take.code})`);
  } else throw new Error(`[booking.deposit] ออกใบรับมัดจำไม่สำเร็จ: ${take.code}`); // คิวลองใหม่
  const bind = await bindDepositReceipt({ tenantId, unitId: ctx.unitId, appointmentId: id, saleId, amountSatang: amount, via: "SLIP", slipId: slip.id });
  if (bind.kind === "BUSY") throw new Error("[booking.deposit] แถวนัดไม่ว่าง — คิวลองใหม่");
  // V8: ชน/ALREADY ที่ไม่ใช่การลงเงินของสลิปนี้เอง ⇒ เตือนเสมอ (แม้ใบรับเดียวกัน — เงินเข้า 2 ก้อนต้องมีคนเห็น)
  if (bind.kind === "ALREADY" && !(await depositAuditExists(tenantId, id, "booking.deposit.receive", slip.id))) await slipAfterPaid(tenantId, ctx.unitId, id, slip.id, amount, bind.saleId);
  if (bind.kind === "GONE") await logOps("WARN", "booking.deposit", "นัดหายระหว่างลงเงินมัดจำ", { tenantId, detail: `slip=${slip.id}` });
}

// ═════════════════════════ §3.4 จอร้าน ═════════════════════════
export type ShopCtx = { tenantId: string; actorUserId: string };
export type DepositQueueItem = {
  appointmentId: string; startMs: number; serviceName: string; staffName: string | null;
  customerName: string; phoneMasked: string;
  info: DepositInfo; slipId: string | null;
};
const DEFAULT_QUEUE_STATES: readonly DepositState[] = ["AWAITING", "IN_REVIEW", "UNDERPAID", "REFUND_DUE", "FORFEIT_PENDING", "RECORDING"];
const ALL_STATES: readonly DepositState[] = ["NONE", "AWAITING", "IN_REVIEW", "UNDERPAID", "PAID", "USED", "FORFEITED", "REFUND_DUE", "REFUNDED", "EXPIRED", "FORFEIT_PENDING", "RECORDING"];
const KEYS = {
  queue: ["booking.deposit.confirm", "booking.deposit.record", "booking.deposit.refund", "booking.deposit.forfeit"],
  confirm: ["booking.deposit.confirm", "booking.deposit.record"],
  refund: ["booking.deposit.refund"],
  forfeit: ["booking.deposit.forfeit"],
} as const;
const SHOP_NF = "ไม่พบนัดนี้";

/** สิทธิ์สด: Membership ที่ตอบรับแล้วของร้าน + หน่วย BOOKING ของร้าน + ถือคีย์ใดคีย์หนึ่งที่หน่วยนั้น */
async function shopAllowed(ctx: unknown, unitId: unknown, keys: readonly string[]): Promise<{ tenantId: string; unitId: string; userId: string; m: MembershipCtx } | null> {
  if (!isRec(ctx) || typeof ctx.tenantId !== "string" || !ctx.tenantId || typeof ctx.actorUserId !== "string" || !ctx.actorUserId) return null;
  if (typeof unitId !== "string" || !unitId || unitId.length > 200) return null;
  const tenantId = ctx.tenantId;
  const db = tenantDb({ tenantId });
  const [mem, unit] = await Promise.all([
    db.membership.findFirst({ where: { tenantId, userId: ctx.actorUserId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "BOOKING" }, select: { id: true } }),
  ]);
  if (!mem || !unit) return null;
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  if (!keys.some((k) => evaluate(m, { module: "booking", action: k, unitId }))) return null;
  return { tenantId, unitId, userId: ctx.actorUserId, m };
}

/**
 * คิวมัดจำของหน่วย (V7: SQL กรองเฉพาะแถวที่ยังค้าง · แบ่งหน้า · ช่วงวัน) · `can` = ปุ่มที่ผู้ขอกดได้ (V13) ·
 * `overpaid` = นัดที่รับเกินยอดมัดจำ (V15 · สถานะ PAID จึงไม่อยู่ใน items) ให้ร้านตัดสินคืนส่วนเกิน
 */
export async function depositQueue(
  ctx: ShopCtx,
  input: { unitId: string; states?: DepositState[]; now?: Date; offset?: number; limit?: number; fromMs?: number; toMs?: number },
): Promise<{ ok: true; items: DepositQueueItem[]; overpaid: DepositQueueItem[]; hasMore: boolean; can: { confirm: boolean; refund: boolean; forfeit: boolean } } | { ok: false; code: "NOT_FOUND" }> {
  const s = await shopAllowed(ctx, isRec(input) ? input.unitId : undefined, KEYS.queue);
  if (!s) return { ok: false, code: "NOT_FOUND" };
  const want = new Set<DepositState>(Array.isArray(input.states) && input.states.length ? input.states.filter((x) => ALL_STATES.includes(x)) : DEFAULT_QUEUE_STATES);
  const page = await depositFactsForQueue({ tenantId: s.tenantId, unitId: s.unitId }, { offset: input.offset, limit: input.limit, fromMs: input.fromMs, toMs: input.toMs });
  const items: DepositQueueItem[] = [];
  const overpaid: DepositQueueItem[] = [];
  for (const f of page.facts) {
    const info = infoOf(f);
    const item: DepositQueueItem = {
      appointmentId: f.appt.id, startMs: f.appt.startAt.getTime(), serviceName: f.appt.serviceName, staffName: f.appt.staffName,
      customerName: f.appt.customerName, phoneMasked: maskPhone(f.appt.customerPhone) || "•••",
      info, slipId: f.slip?.id ?? null,
    };
    if (want.has(info.state)) items.push(item);
    else if (info.overpaidSatang > 0 && info.state === "PAID") overpaid.push(item);
  }
  const ord = (x: DepositQueueItem, y: DepositQueueItem) => x.startMs - y.startMs || (x.appointmentId < y.appointmentId ? -1 : 1);
  items.sort(ord);
  overpaid.sort(ord);
  const can = (keys: readonly string[]) => keys.some((k) => evaluate(s.m, { module: "booking", action: k, unitId: s.unitId }));
  return { ok: true, items, overpaid, hasMore: page.hasMore, can: { confirm: can(KEYS.confirm), refund: can(KEYS.refund), forfeit: can(KEYS.forfeit) } };
}

type ConfirmOut = { ok: true; info: DepositInfo; duplicated?: true; late?: true } | { ok: false; code: "NOT_FOUND" | "NO_DEPOSIT" | "SLIP_IN_REVIEW" | "BAD_STATE" | "SHIFT_REQUIRED" | "BUSY"; reason: string };
const PAY_TYPES = new Set(["PROMPTPAY", "TRANSFER", "CASH"]);

export async function confirmDepositByShop(ctx: ShopCtx, input: { unitId: string; appointmentId: string; payType?: "PROMPTPAY" | "TRANSFER" | "CASH" }): Promise<ConfirmOut> {
  const s = await shopAllowed(ctx, isRec(input) ? input.unitId : undefined, KEYS.confirm);
  if (!s) return { ok: false, code: "NOT_FOUND", reason: SHOP_NF };
  const sc = { tenantId: s.tenantId, unitId: s.unitId };
  const f = await depositFactsOf(sc, typeof input.appointmentId === "string" ? input.appointmentId : "");
  if (!f) return { ok: false, code: "NOT_FOUND", reason: SHOP_NF };
  const info = infoOf(f);
  const id = f.appt.id;
  if (f.appt.depositSatang <= 0 && !f.appt.depositPaidAt) return { ok: false, code: "NO_DEPOSIT", reason: "นัดนี้ไม่ต้องมัดจำ" };
  if (info.state === "NONE" || info.state === "EXPIRED") return { ok: false, code: "BAD_STATE", reason: "นัดนี้ถูกปล่อยช่องหรือจบแล้ว — รับมัดจำไม่ได้" };
  if (info.state === "IN_REVIEW" || info.state === "RECORDING") return { ok: false, code: "SLIP_IN_REVIEW", reason: "นัดนี้มีสลิปรอตรวจ/กำลังบันทึก — ตัดสินที่คิวตรวจสลิป" };
  if (info.state === "PAID") return { ok: true, info, duplicated: true };
  if (info.state === "UNDERPAID") {
    const r = await acceptPaidDeposit({ tenantId: s.tenantId, unitId: s.unitId, appointmentId: id, actorUserId: s.userId, amountSatang: info.paidSatang });
    if (r === "BUSY") return { ok: false, code: "BUSY", reason: R.BUSY };
    if (r === "GONE") return { ok: false, code: "BAD_STATE", reason: "นัดนี้ยืนยันมัดจำไม่ได้ในสถานะปัจจุบัน" };
    const again = await depositFactsOf(sc, id);
    return { ok: true, info: again ? infoOf(again) : info };
  }
  if (info.state !== "AWAITING") return { ok: false, code: "BAD_STATE", reason: "นัดนี้ถูกปล่อยช่องหรือจบแล้ว — รับมัดจำไม่ได้" };
  const payType = typeof input.payType === "string" && PAY_TYPES.has(input.payType) ? input.payType : "PROMPTPAY";
  const take = await takeAppointmentDeposit({
    tenantId: s.tenantId, unitId: s.unitId, appointmentId: id, amountSatang: f.appt.depositSatang, payType,
    customerId: f.appt.customerId, customerName: f.appt.customerName || null, serviceName: f.appt.serviceName,
  });
  let saleId: string | null;
  if (take.ok) saleId = take.saleId;
  else if (take.code === "SHIFT_REQUIRED") return { ok: false, code: "SHIFT_REQUIRED", reason: take.reason };
  else if (take.code === "CONFLICT") {
    saleId = await liveDepositReceiptOf(s.tenantId, id);
    if (!saleId) return { ok: false, code: "BUSY", reason: R.BUSY };
  } else return { ok: false, code: "BUSY", reason: take.reason };
  const bind = await bindDepositReceipt({ tenantId: s.tenantId, unitId: s.unitId, appointmentId: id, saleId, amountSatang: f.appt.depositSatang, via: "SHOP", actorUserId: s.userId, payType });
  if (bind.kind === "BUSY") return { ok: false, code: "BUSY", reason: R.BUSY };
  if (bind.kind === "GONE") return { ok: false, code: "NOT_FOUND", reason: SHOP_NF };
  const again = await depositFactsOf(sc, id);
  const now = again ? infoOf(again) : info;
  if (bind.kind === "ALREADY") return { ok: true, info: now, duplicated: true };
  if (bind.late) return { ok: true, info: now, late: true }; // V22: นัดถูกปล่อยระหว่างบันทึก ⇒ เงินที่รับอยู่ในคิว (REFUND_DUE)
  return { ok: true, info: now };
}

type RefundOut = { ok: true; info: DepositInfo; duplicated?: true } | { ok: false; code: "NOT_FOUND" | "BAD_STATE" | "BAD_INPUT" | "SHIFT_REQUIRED" | "BUSY"; reason: string };

export async function refundDepositByShop(ctx: ShopCtx, input: { unitId: string; appointmentId: string; reason: string }): Promise<RefundOut> {
  const s = await shopAllowed(ctx, isRec(input) ? input.unitId : undefined, KEYS.refund);
  if (!s) return { ok: false, code: "NOT_FOUND", reason: SHOP_NF };
  const sc = { tenantId: s.tenantId, unitId: s.unitId };
  const f = await depositFactsOf(sc, typeof input.appointmentId === "string" ? input.appointmentId : "");
  if (!f) return { ok: false, code: "NOT_FOUND", reason: SHOP_NF };
  const info = infoOf(f);
  if (info.state === "REFUNDED") return { ok: true, info, duplicated: true };
  if (info.state !== "REFUND_DUE" && info.state !== "FORFEIT_PENDING") return { ok: false, code: "BAD_STATE", reason: "คืนได้เฉพาะมัดจำที่ค้างคืน (นัดถูกยกเลิก/ไม่มา) — ยกเลิกนัดก่อน" };
  const reason = typeof input.reason === "string" ? input.reason.normalize("NFKC").trim() : "";
  if (reason.length < 1 || reason.length > 200 || /[\u0000-\u001F\u007F]/.test(reason)) return { ok: false, code: "BAD_INPUT", reason: "ใส่เหตุผลการคืนเงิน 1–200 ตัวอักษร" };
  if (!f.appt.depositSaleId || !f.dep) return { ok: false, code: "BAD_STATE", reason: "มัดจำนี้ไม่ได้ออกใบรับในระบบขาย — คืนที่หน้าบิลแบบเดิม" };
  // V11: ตรวจใต้ล็อกแถวนัดว่ายังจบแบบไม่ใช้บริการ + อ้างใบรับเดิม (ไม่ถือล็อกข้ามธุรกรรมคืนเงินของ POS — หนี้)
  const lk = await lockForRefund(sc, f.appt.id, f.appt.depositSaleId);
  if (lk === "BUSY") return { ok: false, code: "BUSY", reason: R.BUSY };
  if (lk === "BAD_STATE") return { ok: false, code: "BAD_STATE", reason: "สถานะนัดเพิ่งเปลี่ยน — โหลดคิวมัดจำใหม่" };
  const posDep = await import("@/lib/modules/pos/deposit");
  const r = await posDep.moduleRefundDeposit({ tenantId: s.tenantId, unitId: s.unitId, receiptSaleId: f.appt.depositSaleId, reason, actorId: s.userId });
  if (r.ok === false) {
    if (r.code === "SHIFT_REQUIRED") return { ok: false, code: "SHIFT_REQUIRED", reason: r.message };
    if (r.code === "BUSY") return { ok: false, code: "BUSY", reason: r.message };
    const again = await depositFactsOf(sc, f.appt.id);
    if (again && infoOf(again).state === "REFUNDED") return { ok: true, info: infoOf(again), duplicated: true };
    return { ok: false, code: "BAD_STATE", reason: r.message };
  }
  if (r.legacy || !r.refundSaleId) return { ok: false, code: "BAD_STATE", reason: "มัดจำนี้ไม่ได้ออกใบรับในระบบขาย — คืนที่หน้าบิลแบบเดิม" };
  // V11: ยอดใน audit/event = ยอดจากใบคืนจริง
  const refundSatang = (await refundSaleTotalOf(s.tenantId, r.refundSaleId)) ?? info.refundDueSatang;
  if (!r.duplicated) {
    await writeDepositAudit({ tenantId: s.tenantId, unitId: s.unitId, appointmentId: f.appt.id, action: "booking.deposit.refund", actorType: "USER", actorId: s.userId, after: { refundSaleId: r.refundSaleId, receiptSaleId: f.appt.depositSaleId, refundSatang, reason } });
  }
  try {
    await (await import("@/lib/core/outbox")).emitOutboxOutsideTx({
      tenantId: s.tenantId, unitId: s.unitId, type: "booking.deposit_refunded", idempotencyKey: `booking.deposit_refunded#${r.refundSaleId}`,
      payload: { appointmentId: f.appt.id, unitId: s.unitId, refundSatang },
    });
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code !== "P2002") throw e; // คำขอพร้อมกัน = event เดียว
  }
  const again = await depositFactsOf(sc, f.appt.id);
  return { ok: true, info: again ? infoOf(again) : info, ...(r.duplicated ? { duplicated: true as const } : {}) };
}

// ═════════════════════════ §3.8 ใช้มัดจำในบิล (B.10) ═════════════════════════
export async function depositForBill(ctx: { tenantId: string; unitId: string }, appointmentId: string, billSatang: number): Promise<{ refSaleId: string; satang: number } | null> {
  if (!validCtx(ctx) || !Number.isSafeInteger(billSatang) || billSatang <= 0) return null;
  const f = await depositFactsOf(ctx, appointmentId);
  if (!f || !f.appt.depositPaidAt || !f.appt.depositSaleId) return null;
  return (await import("@/lib/modules/pos/deposit")).moduleDepositForBill(ctx.tenantId, ctx.unitId, f.appt.depositSaleId, billSatang);
}

// ═════════════════════════ V5 ร้านตัดสินริบ (FORFEIT_PENDING) ═════════════════════════
export async function forfeitDepositByShop(ctx: ShopCtx, input: { unitId: string; appointmentId: string }): Promise<{ ok: true; info: DepositInfo; duplicated?: true } | { ok: false; code: "NOT_FOUND" | "BAD_STATE" | "BUSY"; reason: string }> {
  const s = await shopAllowed(ctx, isRec(input) ? input.unitId : undefined, KEYS.forfeit);
  if (!s) return { ok: false, code: "NOT_FOUND", reason: SHOP_NF };
  const sc = { tenantId: s.tenantId, unitId: s.unitId };
  const f = await depositFactsOf(sc, typeof input.appointmentId === "string" ? input.appointmentId : "");
  if (!f) return { ok: false, code: "NOT_FOUND", reason: SHOP_NF };
  const info = infoOf(f);
  if (info.state === "FORFEITED" || (info.forfeitedSatang > 0 && info.state !== "FORFEIT_PENDING")) return { ok: true, info, duplicated: true };
  if (info.state !== "FORFEIT_PENDING") return { ok: false, code: "BAD_STATE", reason: "ริบได้เฉพาะมัดจำที่รอร้านตัดสิน (ไม่มา/ยกเลิกช้า)" };
  const r = await forfeitPendingDeposit(sc, f.appt.id, s.userId);
  if (!r.forfeited) return { ok: false, code: r.reason ? "BUSY" : "BAD_STATE", reason: r.reason ?? "ริบมัดจำไม่ได้ในสถานะปัจจุบัน" };
  const again = await depositFactsOf(sc, f.appt.id);
  return { ok: true, info: again ? infoOf(again) : info };
}
