// deposit.ts — POS P2.9b ▸ มัดจำเป็นวิธีชำระของ POS: รับมัดจำ · ค้นมัดจำ · คืนเงินมัดจำคงเหลือ · คืนสภาพเมื่อบิลที่ใช้ถูก void ◂
// สัญญา = scripts/qc-pos-p2.9b.mts (ตารางชื่อ ledger/wo-notes/pos-P2.9b-oracle.md) · brief ledger/pos-briefs/pos-brief-P2.9b.md §2 R1–R10 · §10 มติ 1–20
//
// 🔴 ใบรับเงินมัดจำ = PosSale sourceModule "POS_DEPOSIT" (sourceId = PosDeposit.id · memberId null ⇒ ไม่มีแต้ม/ตรา/CRM: member-bridges.ts:67 `!sale.memberId`)
//    ออกผ่าน `regCreateSale` (จุดเรียกเดิมของหน้าขาย · มติ 18) ⇒ ไม่มีจุดเรียก createSale ใหม่ (ทะเบียน U4/HT6.4/L2 = 19/16)
//    HF-TX: regCreateSale(…, callerTx(tx)) + PosDeposit + RECEIVE ในธุรกรรมเดียว · afterSaleCommitted หลัง commit
// 🔴 VAT เกิดตอนรับเงิน (มติ 1): PosDeposit.vatSatang = vatSatang ของใบรับ (สูตรเดียวกับบิล) · บัญชี = account-bridge (POS_DEPOSIT → applyExternalDepositReceipt)
// 🔴 ใช้มัดจำ = แถว {DEPOSIT, refSaleId = ใบรับ} ใน createSale (service.ts ล็อก/ตัดในธุรกรรมของบิล) · คืนสภาพ = depositSaleVoided (งานหลักของคิว pos.sale.voided)
// 🔴 คำปฏิเสธคืนเป็นข้อมูล {ok:false, code, message} · ข้อผิดพลาดที่ไม่คาดคิด = INTERNAL · เงินเป็นสตางค์ · ไม่มีเบอร์เต็มเก็บ/ส่งออก

import { randomUUID } from "node:crypto";
import type { PosDeposit, PosPayType, Prisma } from "@prisma/client"; // POS P5.1 ▸ MA2 PosPayType ◂
import { evaluate } from "@/lib/core/rbac";
import { emitOutbox } from "@/lib/core/outbox";
import { callerTx } from "@/lib/core/caller-tx";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { systemForUnit } from "@/lib/modules/system/service";
import { prisma } from "./db";
import { regCreateSale, registerRefuse, registerScopeCheck } from "./register";
import { REGISTER_MANUAL_METHODS, REGISTER_MANUAL_MANAGER_MESSAGE, type RegisterActor, type RegisterCtx, type RegisterRefusal, type RegisterRefusalCode } from "./register-shared";
import { afterSaleCommitted, depositVatLeft, POS_DEPOSIT_SOURCE, PosSaleError, saleStatusByKey } from "./service"; // POS P5.1 ▸ MA4 saleStatusByKey ◂
import { parsePosPaymentSettings } from "./payment-settings";
import { isPaymentIntentId, parsePosIntentSettings } from "./payment-intent-shared";
import { consumeSaleIntents, lockSaleIntents, type SaleIntentRef } from "./payment-intent";
import { isShiftDeviceId, resolveApiRefundShift, resolveRegisterShift } from "./shift"; // POS P5.1 ▸ MA4 resolveApiRefundShift ◂
import { posDeviceRevoked } from "./device";
import { maskPhone } from "./order-shared";
import { checkDepositPhone, maskDepositPhone } from "./deposit-links"; // POS P2.9b ▸ fix2 มติ 3 ◂
import { verifyManagerPin } from "./staff-pin";
import { newReceiptToken } from "./receipt-token";

type Db = typeof prisma;
type Tx = Prisma.TransactionClient;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isMoney = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 2_000_000_000;
const isKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const cleanText = (v: unknown, max: number): string | null | false => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || v.length > max || /[\u0000-\u001F\u007F]/.test(v)) return false;
  return v.trim() || null;
};

/** วิธีรับ/คืนมัดจำ = เงินจริงเท่านั้น (บัตรของขวัญ/เครดิตร้าน/มัดจำ/แพลตฟอร์ม/ลงห้อง = VALIDATION) */
export const DEPOSIT_PAY_TYPES = ["CASH", "PROMPTPAY", "TRANSFER", "CARD"] as const;
export type DepositPayType = (typeof DEPOSIT_PAY_TYPES)[number];
export type DepositPayMethod = { type: DepositPayType; amountSatang: number; reference?: string };
const NOTE_MAX = 200;
const NAME_MAX = 100;
const REF_MAX = 100;
const REFUND_PERMISSION = "pos.sale.refund";
/** namespace ของคีย์ใน PosDeposit/PosSale (client ส่งคีย์ [A-Za-z0-9_-] ⇒ ไม่มีวันชนคีย์ของหน้าขาย reg2: หรือโมดูลอื่น) */
const KEY_DEPOSIT = "dep:";
const KEY_RECEIPT = "dep-rcv:";
const KEY_REFUND = "dep-ref:";

const MSG = {
  DISABLED: "จุดขายนี้ยังไม่เปิดรับมัดจำ — เจ้าของร้านเปิดได้ที่ ตั้งค่า → การชำระเงิน",
  AMOUNT: "ยอดมัดจำต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1",
  METHOD: "รับ/คืนมัดจำได้ด้วยเงินสด พร้อมเพย์ โอน หรือบัตรธนาคารเท่านั้น",
  REFUND_ALL: "คืนมัดจำได้ทั้งยอดคงเหลือเท่านั้น — ยอดที่คืนต้องเท่ากับคงเหลือ",
  REASON: "ระบุเหตุผลการคืนเงินมัดจำ",
  NOT_FOUND: "ไม่พบมัดจำใบนี้ในสาขานี้ — ตรวจเลขใบรับมัดจำอีกครั้ง",
  CLOSED: "มัดจำใบนี้ใช้หมดหรือคืนเงินไปแล้ว",
  CONFLICT: "มีรายการของรหัสนี้อยู่แล้วแต่ยอด/วิธีชำระไม่ตรงกัน — ตรวจรายการเดิมก่อน",
} as const;
const refuse = (code: RegisterRefusalCode, message?: string): RegisterRefusal => registerRefuse(code, message);
const isRefusal = (v: unknown): v is RegisterRefusal => isRecord(v) && v.ok === false;
/** โยนในธุรกรรมเพื่อย้อนทั้งก้อน แล้วคืนเป็นคำปฏิเสธ */
class DepositAbort extends Error {
  constructor(readonly refusal: RegisterRefusal) {
    super(refusal.code);
  }
}

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | RegisterRefusal> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof DepositAbort) return e.refusal;
    console.error(`[pos/deposit] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

/** แถววิธีรับ/คืน (เงินจริง · เงินสดได้แถวเดียว · เลขอ้างอิงเฉพาะบัตร/โอน · pi_… บนพร้อมเพย์/บัตร = ใบขอรับเงินที่ PAID แล้ว — แบบหน้าขาย) */
function parsePays(raw: unknown): DepositPayMethod[] | RegisterRefusal {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10) return refuse("VALIDATION", MSG.METHOD);
  const out: DepositPayMethod[] = [];
  for (const p of raw as unknown[]) {
    if (!isRecord(p) || !Object.keys(p).every((k) => k === "type" || k === "amountSatang" || k === "reference")) return refuse("VALIDATION", MSG.METHOD);
    if (!(DEPOSIT_PAY_TYPES as readonly unknown[]).includes(p.type)) return refuse("VALIDATION", MSG.METHOD);
    if (!isMoney(p.amountSatang)) return refuse("VALIDATION", MSG.AMOUNT);
    if (p.type === "CASH" && out.some((x) => x.type === "CASH")) return refuse("VALIDATION", "เงินสดใส่ได้รายการเดียว");
    let reference: string | undefined;
    if (p.reference !== undefined && p.reference !== null) {
      if (typeof p.reference !== "string" || p.reference.length > REF_MAX) return refuse("VALIDATION", "เลขอ้างอิงไม่ถูกต้อง");
      const r = p.reference.trim();
      if (p.type === "CASH" || (p.type === "PROMPTPAY" && !isPaymentIntentId(r)) || (p.type === "TRANSFER" && isPaymentIntentId(r))) return refuse("VALIDATION", "เลขอ้างอิงใส่ได้เฉพาะบัตรและโอน");
      reference = r || undefined;
    }
    out.push({ type: p.type as DepositPayType, amountSatang: p.amountSatang, ...(reference ? { reference } : {}) });
  }
  return out;
}
const payBag = (xs: readonly { type: string; amountSatang: number }[]) => xs.map((p) => `${p.type}|${p.amountSatang}`).sort().join(",");

/** มัดจำในรูปที่ส่งออก (ไม่มีเบอร์เต็ม) */
export type DepositView = {
  id: string;
  receiptSaleId: string;
  receiptNo: string | null;
  amountSatang: number;
  vatSatang: number;
  usedSatang: number;
  refundedSatang: number;
  remainingSatang: number;
  status: string;
  customerId: string | null;
  customerName: string | null;
  phoneMasked: string | null;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
};
type DepositRow = PosDeposit;
function viewOf(d: DepositRow): DepositView {
  return {
    id: d.id,
    receiptSaleId: d.receiptSaleId,
    receiptNo: d.receiptNo,
    amountSatang: d.amountSatang,
    vatSatang: d.vatSatang,
    usedSatang: d.usedSatang,
    refundedSatang: d.refundedSatang,
    remainingSatang: d.amountSatang - d.usedSatang - d.refundedSatang,
    status: String(d.status),
    customerId: d.customerId,
    customerName: d.customerName,
    // POS P2.9b ▸ fix2 มติ 3: มัดจำ walk-in ที่บันทึกเบอร์ = ปิดหมดเว้น 3 ตัวแรก (ไม่มี 4 หลักท้าย · phoneLast4 ไม่ส่งออก) ◂
    phoneMasked: !d.customerId && d.phoneLast4 ? maskDepositPhone(d.phoneMasked) : d.phoneMasked,
    note: d.note,
    expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
  };
}

// ═══════════════════════ R2 รับมัดจำ ═══════════════════════
export type RegisterTakeDepositInput = {
  amountSatang: number;
  payMethods: DepositPayMethod[];
  /** สมาชิกเจ้าของมัดจำ (Customer.id ในระบบสมาชิกของสาขา) — ไม่ส่ง = ลูกค้าทั่วไป (ผู้ถือใบรับ) */
  memberId?: string;
  customerName?: string;
  /** เบอร์ (9–10 หลัก) — เก็บแบบปิดบัง + 4 หลักท้าย (มติ 19) ไม่เก็บเบอร์เต็ม */
  phone?: string;
  note?: string;
  /** เงินที่รับมาของแถวเงินสด (ทอน = รับ − ส่วนเงินสด) — ไม่ส่ง = รับพอดี */
  cashReceivedSatang?: number;
  idempotencyKey: string;
};
export type RegisterTakeDepositResult = { ok: true; deposit: DepositView; receiptNo: string | null; changeSatang: number; duplicated?: boolean } | RegisterRefusal;

/**
 * R2 (มติ 14) — รับมัดจำที่หน้าขาย: สิทธิ์ pos.sale.create · ค่าตั้ง pos.deposit.enabled ปิด = VALIDATION (ไม่มีแถว) · กะตามกติกาหน้าขาย ·
 * ธุรกรรมเดียว: ใบรับมัดจำ (regCreateSale · callerTx) + PosDeposit + RECEIVE · คีย์เดิม payload เดิม = มัดจำเดิม (duplicated) · ต่าง = IDEMPOTENCY_CONFLICT
 */
export async function registerTakeDeposit(ctx: RegisterCtx, actor: RegisterActor, input: RegisterTakeDepositInput, client?: Db): Promise<RegisterTakeDepositResult> {
  return guard("registerTakeDeposit", async (): Promise<RegisterTakeDepositResult> => {
    const db = client ?? prisma;
    const sc = await registerScopeCheck(ctx, actor, db);
    if (sc.ok === false) return sc;
    const s = sc.ctx;
    const deviceRaw = isRecord(ctx) ? ctx.deviceId : undefined;
    if (deviceRaw !== undefined && deviceRaw !== null && !isShiftDeviceId(deviceRaw)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    const deviceId = typeof deviceRaw === "string" ? deviceRaw : undefined;
    if (!isRecord(input)) return refuse("VALIDATION");
    if (!isKey(input.idempotencyKey)) return refuse("VALIDATION", "ข้อมูลรายการไม่ครบ — ลองใหม่อีกครั้ง");
    if (!isMoney(input.amountSatang)) return refuse("VALIDATION", MSG.AMOUNT);
    const pays = parsePays(input.payMethods);
    if (isRefusal(pays)) return pays;
    if (pays.reduce((t, p) => t + p.amountSatang, 0) !== input.amountSatang) return refuse("PAYMENT_MISMATCH", "ยอดที่รับแยกตามวิธีไม่เท่ากับยอดมัดจำ");
    const cash = pays.find((p) => p.type === "CASH")?.amountSatang ?? 0;
    let cashReceived: number | null = null;
    if (input.cashReceivedSatang !== undefined && input.cashReceivedSatang !== null) {
      if (!(Number.isInteger(input.cashReceivedSatang) && input.cashReceivedSatang >= 0) || cash === 0 || input.cashReceivedSatang < cash) return refuse("PAYMENT_MISMATCH", "เงินที่รับน้อยกว่าส่วนที่จ่ายเงินสด");
      cashReceived = input.cashReceivedSatang;
    }
    const note = cleanText(input.note, NOTE_MAX);
    const name = cleanText(input.customerName, NAME_MAX);
    if (note === false || name === false) return refuse("VALIDATION", "ชื่อหรือหมายเหตุยาวเกินไป");
    let phoneMasked: string | null = null;
    let phoneLast4: string | null = null;
    if (input.phone !== undefined && input.phone !== null && input.phone !== "") {
      const digits = typeof input.phone === "string" ? input.phone.replace(/[\s-]/g, "") : "";
      if (!/^0\d{8,9}$/.test(digits)) return refuse("PHONE_INVALID");
      phoneMasked = `${digits.slice(0, 3)}-xxx-xxxx`; // POS P2.9b ▸ fix2 มติ 3: ไม่เก็บ 4 หลักท้ายในเบอร์ปิด ◂
      phoneLast4 = digits.slice(-4);
    }
    // มติ 14: ค่าตั้งปิด = รับใหม่ไม่ได้ (มัดจำที่รับแล้วยังใช้/คืนได้)
    const sys = await db.appSystem.findFirst({ where: { id: s.systemId, tenantId: s.tenantId }, select: { settings: true } });
    if (!parsePosPaymentSettings(sys?.settings).deposit.enabled) return refuse("VALIDATION", MSG.DISABLED);
    // สมาชิกเจ้าของมัดจำ = สมาชิกในระบบสมาชิกของสาขานี้ (ไม่พบ/คนละร้าน = MEMBER_NOT_FOUND)
    let customerId: string | null = null;
    let memberName: string | null = null;
    let memberPhone: string | null = null;
    if (input.memberId !== undefined && input.memberId !== null) {
      if (!isId(input.memberId)) return refuse("MEMBER_NOT_FOUND");
      const memberSystemId = await systemForUnit(s.tenantId, s.unitId, "MEMBER");
      const c = memberSystemId ? await db.customer.findFirst({ where: { id: input.memberId, tenantId: s.tenantId, memberSystemId, status: { not: "MERGED" } }, select: { id: true, name: true, phone: true } }) : null;
      if (!c) return refuse("MEMBER_NOT_FOUND");
      customerId = c.id;
      memberName = c.name;
      memberPhone = c.phone;
    }
    const depKey = KEY_DEPOSIT + input.idempotencyKey;
    // คีย์เดิมที่ commit แล้ว = คำตอบเดิม (ก่อนตรวจกะ/เครื่อง — ลองซ้ำหลังปิดกะได้มัดจำเดิม)
    const prior = await db.posDeposit.findUnique({ where: { tenantId_idempotencyKey: { tenantId: s.tenantId, idempotencyKey: depKey } } });
    if (prior) return sameTake(db, prior, s, input.amountSatang, customerId, pays, cashReceived);
    if (deviceId && (await posDeviceRevoked(db, s.tenantId, s.unitId, deviceId))) return refuse("DEVICE_REVOKED");
    // HF-PP กติกาเดียวกับหน้าขาย: พร้อมเพย์/บัตรที่ไม่อ้างใบขอรับเงิน + ร้านตั้ง manualConfirmRequiresManager ⇒ ต้องมี pos.shift.manage
    if (pays.some((p) => REGISTER_MANUAL_METHODS.has(p.type) && !isPaymentIntentId(p.reference)) && !evaluate(sc.actor, { module: "pos", action: "pos.shift.manage", unitId: s.unitId })) {
      if (parsePosIntentSettings(sys?.settings).manualConfirmRequiresManager) return refuse("PERMISSION_DENIED", REGISTER_MANUAL_MANAGER_MESSAGE);
    }
    const shift = await resolveRegisterShift(db, s, deviceId);
    if (!shift.ok) return refuse("SHIFT_REQUIRED");
    const intentRefs: SaleIntentRef[] = pays.flatMap((p) => ((p.type === "PROMPTPAY" || p.type === "CARD") && isPaymentIntentId(p.reference) ? [{ intentId: p.reference!, payType: p.type, amountSatang: p.amountSatang }] : []));
    const lineName = note ? `มัดจำ — ${note}` : "มัดจำ";
    const lines = [{ name: lineName, qty: 1, unitPriceSatang: input.amountSatang }];

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await db.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${s.tenantId}::text || ':' || ${depKey}::text))) l`;
            const again = await tx.posDeposit.findUnique({ where: { tenantId_idempotencyKey: { tenantId: s.tenantId, idempotencyKey: depKey } } });
            if (again) return { kind: "dup" as const, dup: again };
            const locked = intentRefs.length ? await lockSaleIntents(tx, s, intentRefs) : null;
            if (locked && !locked.ok) throw new DepositAbort(refuse(locked.code));
            const depositId = `dep${randomUUID().replace(/-/g, "")}`;
            // มติ 18: ใบรับเงินมัดจำผ่านจุดเรียกเดิมของหน้าขาย (callerTx · HF-TX) — sourceModule POS_DEPOSIT · memberId ไม่ส่ง (null) · แถวเดียว "มัดจำ — …"
            const r = await regCreateSale(
              {
                tenantId: s.tenantId,
                unitId: s.unitId,
                systemId: s.systemId,
                sourceModule: POS_DEPOSIT_SOURCE,
                sourceId: depositId,
                idempotencyKey: KEY_RECEIPT + input.idempotencyKey,
                lines,
                payMethods: pays.map((p) => ({
                  type: p.type,
                  amountSatang: p.amountSatang,
                  ...(p.reference ? { reference: p.reference } : {}),
                  ...(p.type === "CASH" && cashReceived !== null ? { cashTenderedSatang: cashReceived } : {}),
                })),
                ...(note ? { note } : {}),
                shiftId: shift.shiftId,
                soldByUserId: sc.actor.userId,
              },
              callerTx(tx),
            );
            if (locked?.ok) await consumeSaleIntents(tx, s, r.saleId, locked.notes);
            const sale = await tx.posSale.findUnique({ where: { id: r.saleId }, select: { vatSatang: true, receiptNo: true } });
            const dep = await tx.posDeposit.create({
              data: {
                id: depositId,
                tenantId: s.tenantId,
                systemId: s.systemId,
                unitId: s.unitId,
                customerId,
                customerName: name ?? memberName,
                phoneMasked: phoneMasked ?? (memberPhone ? maskPhone(memberPhone) : null),
                phoneLast4: phoneLast4 ?? (memberPhone ? memberPhone.replace(/\D/g, "").slice(-4) || null : null),
                amountSatang: input.amountSatang,
                vatSatang: sale?.vatSatang ?? 0,
                receiptSaleId: r.saleId,
                receiptNo: sale?.receiptNo ?? r.receiptNo,
                note,
                reference: pays.find((p) => p.reference)?.reference ?? null,
                idempotencyKey: depKey,
                createdByUserId: sc.actor.userId,
              },
            });
            await tx.posDepositTxn.create({
              data: { tenantId: s.tenantId, depositId, type: "RECEIVE", satang: input.amountSatang, vatSatang: dep.vatSatang, saleId: r.saleId, idempotencyKey: `dep-receive-${depositId}` },
            });
            await tx.auditLog.create({
              data: {
                tenantId: s.tenantId,
                unitId: s.unitId,
                actorType: "USER",
                actorId: sc.actor.userId,
                action: "pos.deposit.receive",
                targetType: "PosDeposit",
                targetId: depositId,
                after: { receiptSaleId: r.saleId, receiptNo: dep.receiptNo, amountSatang: dep.amountSatang, vatSatang: dep.vatSatang, member: !!customerId, payMethods: pays.map((p) => ({ type: p.type, amountSatang: p.amountSatang })) },
              },
            });
            return { kind: "new" as const, dep, saleId: r.saleId };
          },
          { timeout: 20_000, maxWait: 15_000 },
        );
        if (out.kind === "dup") return sameTake(db, out.dup, s, input.amountSatang, customerId, pays, cashReceived);
        await afterSaleCommitted({ tenantId: s.tenantId, unitId: s.unitId, lines }, out.saleId); // HF-TX ▸ งานหลัง commit ชุดเดียว ◂
        return { ok: true as const, deposit: viewOf(out.dep), receiptNo: out.dep.receiptNo, changeSatang: cashReceived !== null ? cashReceived - cash : 0 };
      } catch (e) {
        if (e instanceof DepositAbort) return e.refusal;
        const code = (e as { code?: unknown } | null)?.code;
        if (code === "P2002" || code === "P2034" || code === "P2028") continue; // ตัวนับใบเสร็จเดือนใหม่ชน/ธุรกรรมชน = rollback ทั้งก้อน ลองใหม่ (คีย์กันซ้ำ)
        if (e instanceof PosSaleError) return refuse(e.code === "HAS_REFUNDS" ? "VALIDATION" : e.code, e.code === "VALIDATION" ? e.message : undefined);
        throw e;
      }
    }
    return refuse("BUSY");
  });
}

/** คีย์เดิมของการรับมัดจำ: payload เดิม (สาขา/ระบบ · ยอด · สมาชิก · วิธีรับ) = มัดจำเดิม · ต่าง = IDEMPOTENCY_CONFLICT */
async function sameTake(db: Db, d: DepositRow, s: RegisterCtx, amount: number, customerId: string | null, pays: DepositPayMethod[], cashReceived: number | null): Promise<RegisterTakeDepositResult> {
  const rp = await db.posPayment.findMany({ where: { tenantId: s.tenantId, saleId: d.receiptSaleId }, select: { type: true, amountSatang: true } });
  if (d.unitId !== s.unitId || d.systemId !== s.systemId || d.amountSatang !== amount || (d.customerId ?? null) !== customerId || payBag(rp) !== payBag(pays)) return refuse("IDEMPOTENCY_CONFLICT", MSG.CONFLICT);
  const cash = pays.find((p) => p.type === "CASH")?.amountSatang ?? 0;
  return { ok: true as const, deposit: viewOf(d), receiptNo: d.receiptNo, changeSatang: cashReceived !== null ? cashReceived - cash : 0, duplicated: true };
}

// ═══════════════════════ R9 ค้นมัดจำ (จอชำระ) ═══════════════════════
// POS P2.9b ▸ fix1 มติ 6 (hunt D5): remainingSatang/amountSatang = null เมื่อยังไม่ยืนยันผู้ถือ (ค้นด้วยชื่อ/เบอร์ · มัดจำ walk-in ที่มีเบอร์แต่ไม่ส่ง/ส่ง 4 หลักผิด) ◂
export type RegisterDepositLookupRow = Pick<DepositView, "id" | "receiptNo" | "customerName" | "phoneMasked" | "status" | "expiresAt"> & { remainingSatang: number | null; amountSatang: number | null; memberLinked: boolean; needsPhoneLast4: boolean; fromModule: boolean }; // POS P5.1 ▸ MA13 fromModule = มัดจำของการจอง (ริบได้ที่หน้าบิล · CD-P51-O8c) ◂
export type RegisterDepositLookupResult = { ok: true; deposits: RegisterDepositLookupRow[] } | RegisterRefusal;
const LOOKUP_MAX = 20;
/**
 * R9 (มติ 19) — ค้นมัดจำของสาขานี้: เลขใบรับ (ตรงตัว) · ชื่อ (ขึ้นต้น ไม่สนตัวพิมพ์) · (fix3: ไม่ค้นด้วย 4 หลักท้าย — ใช้ยืนยันตอนใช้เท่านั้น) · สิทธิ์ pos.sale.create ·
 * ไม่เขียนแถว ยกเว้นเลขใบรับ + phoneLast4 (fix2 มติ 3 · fix4 มติ 4 R4 F4): ตรวจผ่าน checkDepositPhone = เขียนตัวนับผิด/ล็อก (นับเหมือนตอนใช้) ·
 * ไม่ส่ง phoneLast4 = อ่านอย่างเดียว · สาขาอื่น/ร้านอื่น = ไม่พบ (ผลว่าง) · เบอร์ปิดบังเท่านั้น
 */
export async function registerDepositLookup(ctx: RegisterCtx, actor: RegisterActor, input: { query?: string; phoneLast4?: string; memberId?: string }, client?: Db): Promise<RegisterDepositLookupResult> {
  return guard("registerDepositLookup", async (): Promise<RegisterDepositLookupResult> => {
    const db = client ?? prisma;
    const sc = await registerScopeCheck(ctx, actor, db);
    if (sc.ok === false) return sc;
    const q = isRecord(input) && typeof input.query === "string" ? input.query.trim() : "";
    // POS P2.9b ▸ fix1 มติ 5 (hunt D4): ค้นมัดจำของสมาชิกในบิล — รวมมัดจำของสมาชิกที่ถูกรวมเข้าคนนี้ (mergedIntoId ≤ 5 ชั้น) ◂
    const memberId = isRecord(input) && isId(input.memberId) ? input.memberId : null;
    if ((!q && !memberId) || q.length > 60 || (q && [...q].length < 3)) return refuse("VALIDATION", "พิมพ์เลขใบรับมัดจำ หรือชื่อ (อย่างน้อย 3 ตัวอักษร)");
    const last4 = isRecord(input) && typeof input.phoneLast4 === "string" && /^\d{4}$/.test(input.phoneLast4) ? input.phoneLast4 : null;
    const or: Prisma.PosDepositWhereInput[] = q ? [{ receiptNo: q }, { customerName: { startsWith: q, mode: "insensitive" } }] : [];
    // POS P2.9b ▸ fix3 มติ 2 (R3 F2 · hunter F1 · มติ 19 แก้): ไม่ค้นด้วย 4 หลักท้ายของเบอร์ — 4 หลักท้ายเป็นความลับยืนยันตอนใช้เท่านั้น (checkDepositPhone · ตัวนับ · DEPOSIT_LOCKED) ◂
    const family = memberId ? await mergedFamily(db, sc.ctx.tenantId, memberId) : [];
    if (memberId) or.push({ customerId: { in: family } });
    const rows = await db.posDeposit.findMany({
      where: { tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, OR: or },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LOOKUP_MAX,
    });
    // POS P2.9b ▸ fix2 มติ 3: ตรงเลขใบรับ + ส่ง 4 หลัก = นับแบบตัวนับ PIN (ผิด 5 = ล็อก) · ล็อก/ผิด = ไม่เห็นยอด ◂
    const phoneOk = new Set<string>();
    for (const d of rows) if (q && d.receiptNo === q && !d.customerId && d.phoneLast4 && last4 && (await checkDepositPhone(sc.ctx.tenantId, d, last4, db)) === "OK") phoneOk.add(d.id);
    return {
      ok: true as const,
      deposits: rows.map((d) => {
        const v = viewOf(d);
        // ยอดเห็นได้เมื่อ: ตรงเลขใบรับ (มัดจำสมาชิก/ไม่มีเบอร์ หรือ walk-in ที่ 4 หลักท้ายถูก) หรือมัดจำของสมาชิกในบิล (memberId) · ค้นด้วยชื่อ/เบอร์ = ไม่มียอด
        const needsPhoneLast4 = !d.customerId && !!d.phoneLast4;
        // POS P2.9b ▸ fix2 มติ 1 (R2 F1): ค้นด้วยสมาชิก = เห็นยอดเฉพาะมัดจำของสมาชิกนั้น/ที่ถูกรวมเข้า (ไม่ใช่มัดจำของสมาชิกอื่นที่ชื่อตรงคำค้น) ◂
        const holder = (q && d.receiptNo === q && (!needsPhoneLast4 || phoneOk.has(d.id))) || (!!d.customerId && family.includes(d.customerId));
        return { id: v.id, receiptNo: v.receiptNo, customerName: v.customerName, phoneMasked: v.phoneMasked, remainingSatang: holder ? v.remainingSatang : null, status: v.status, expiresAt: v.expiresAt, amountSatang: holder ? v.amountSatang : null, memberLinked: !!d.customerId, needsPhoneLast4, fromModule: d.idempotencyKey.startsWith(MODULE_DEPOSIT_KEY) }; // POS P5.1 ▸ MA13 ◂
      }),
    };
  });
}

/** POS P2.9b ▸ fix1 มติ 5: สมาชิกคนนี้ + ทุกคนที่ถูกรวมเข้ามา (ตาม mergedIntoId ย้อน ≤ 5 ชั้น) */
async function mergedFamily(db: Db, tenantId: string, memberId: string): Promise<string[]> {
  const all = new Set<string>([memberId]);
  let frontier = [memberId];
  for (let hop = 0; hop < 5 && frontier.length; hop++) {
    const rows = await db.customer.findMany({ where: { tenantId, mergedIntoId: { in: frontier } }, select: { id: true } });
    frontier = rows.map((r) => r.id).filter((id) => !all.has(id));
    for (const id of frontier) all.add(id);
  }
  return [...all];
}

// ═══════════════════════ R8 คืนเงินมัดจำคงเหลือ ═══════════════════════
export type RegisterRefundDepositInput = {
  depositId: string;
  /** วิธีคืน = เงินจริง · Σ = คงเหลือทั้งหมด (CD5 · มติ 17) */
  payMethods: DepositPayMethod[];
  reason: string;
  idempotencyKey: string;
  /** P1.8/P1.15: PIN ผู้จัดการ (คู่ managerUserId) แทนผู้ทำรายการที่ไม่มี pos.sale.refund */
  managerPin?: string | null;
  managerUserId?: string | null;
};
export type RegisterRefundDepositResult = { ok: true; refund: { id: string; receiptNo: string | null; grandTotalSatang: number; vatSatang: number }; deposit: DepositView; duplicated?: boolean } | RegisterRefusal;

function refundPrefixOf(settings: unknown): string {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const r = pos && isRecord(pos.receipt) ? pos.receipt : null;
  const p = r && typeof r.refundPrefix === "string" ? r.refundPrefix.trim() : "";
  return /^[A-Za-z][A-Za-z0-9-]{0,9}$/.test(p) ? p : "CN";
}
function bkkPeriod(): string {
  const d = new Date(Date.now() + 7 * 3600000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * R8 (มติ 5 17) — คืนเงินมัดจำ "ทั้งยอดคงเหลือ" ด้วยเงินจริง: pos.sale.refund หรือ PIN ผู้จัดการ · เหตุผลบังคับ (REASON_REQUIRED) ·
 * ใบคืน (PosSale docType REFUND · refSaleId = ใบรับ · เลข CN จาก PosDocCounter) + REFUND txn (VAT ที่เหลือ) + REFUNDED ในธุรกรรมเดียว (ล็อกแถวมัดจำ) ·
 * ใช้หมด/คืนแล้ว = DEPOSIT_CLOSED · คิว pos.sale.refunded → refund-consumer (POS_DEPOSIT) → ใบลดหนี้ + JV
 */
export async function registerRefundDeposit(ctx: RegisterCtx, actor: RegisterActor, input: RegisterRefundDepositInput, client?: Db): Promise<RegisterRefundDepositResult> {
  return guard("registerRefundDeposit", async (): Promise<RegisterRefundDepositResult> => {
    const db = client ?? prisma;
    const sc = await registerScopeCheck(ctx, actor, db);
    if (sc.ok === false) return sc;
    const s = sc.ctx;
    const deviceRaw = isRecord(ctx) ? ctx.deviceId : undefined;
    if (deviceRaw !== undefined && deviceRaw !== null && !isShiftDeviceId(deviceRaw)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    const deviceId = typeof deviceRaw === "string" ? deviceRaw : undefined;
    if (!isRecord(input)) return refuse("VALIDATION");
    // สิทธิ์: pos.sale.refund ที่สาขา หรือ PIN ผู้จัดการ (ผู้จัดการต้องมี pos.sale.refund)
    const hasPin = input.managerPin !== undefined && input.managerPin !== null;
    const canRefund = evaluate(sc.actor, { module: "pos", action: REFUND_PERMISSION, unitId: s.unitId });
    if (!canRefund && !hasPin) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์คืนเงิน — ขอให้ผู้จัดการทำรายการหรือใส่ PIN ผู้จัดการ");
    const reason = cleanText(input.reason, 200);
    if (reason === false) return refuse("VALIDATION", "เหตุผลยาวได้ไม่เกิน 200 ตัวอักษร");
    if (!reason) return refuse("REASON_REQUIRED", MSG.REASON);
    if (!isKey(input.idempotencyKey)) return refuse("VALIDATION", "ข้อมูลรายการไม่ครบ — ลองใหม่อีกครั้ง");
    if (!isId(input.depositId)) return refuse("DEPOSIT_NOT_FOUND", MSG.NOT_FOUND);
    const pays = parsePays(input.payMethods);
    if (isRefusal(pays)) return pays;
    if (pays.some((p) => p.reference && isPaymentIntentId(p.reference))) return refuse("VALIDATION", MSG.METHOD);
    let auditActorId = sc.actor.userId;
    if (!canRefund) {
      const v = await verifyManagerPin({ tenantId: s.tenantId, unitId: s.unitId, deviceId: deviceId ?? null }, { managerPin: input.managerPin, managerUserId: input.managerUserId }, db);
      if (v.ok === false) return v;
      if (!evaluate(v.actor, { module: "pos", action: REFUND_PERMISSION, unitId: s.unitId })) return refuse("PERMISSION_DENIED", "PIN นี้ไม่มีสิทธิ์คืนเงิน — ใช้ PIN ของผู้จัดการ");
      auditActorId = v.actor.userId;
    }
    const sys = await db.appSystem.findFirst({ where: { id: s.systemId, tenantId: s.tenantId }, select: { settings: true } });
    const shift = await resolveRegisterShift(db, s, deviceId);
    if (!shift.ok && pays.some((p) => p.type === "CASH")) return refuse("SHIFT_REQUIRED");
    const shiftId = shift.ok ? shift.shiftId : null;
    const key = KEY_REFUND + input.idempotencyKey;
    const depositId = input.depositId;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await db.$transaction(
          async (tx) => refundDepositInTx(tx, { s, depositId, pays, reason, key, shiftId, sys, requestedByUserId: sc.actor.userId, auditActorId, actorType: "USER" }), // POS P5.1 ▸ MA4: เนื้อธุรกรรมเดิมย้ายไป refundDepositInTx ◂
          { timeout: 20_000, maxWait: 15_000 },
        );
        if (out.kind === "dup") return { ok: true as const, refund: { id: out.dup.id, receiptNo: out.dup.receiptNo, grandTotalSatang: out.dup.grandTotalSatang, vatSatang: out.dup.vatSatang }, deposit: viewOf(out.dep), duplicated: true };
        scheduleDrain();
        return { ok: true as const, refund: { id: out.refund.id, receiptNo: out.refund.receiptNo, grandTotalSatang: out.refund.grandTotalSatang, vatSatang: out.refund.vatSatang }, deposit: viewOf(out.dep) };
      } catch (e) {
        if (e instanceof DepositAbort) return e.refusal;
        const code = (e as { code?: unknown } | null)?.code;
        if (code === "P2002" || code === "P2034" || code === "P2028") continue;
        throw e;
      }
    }
    return refuse("BUSY");
  });
}

// POS P5.1 ▸ MA4 (F4): ธุรกรรมคืนเงินมัดจำ (ทั้งคงเหลือ) แยกออกจาก registerRefundDeposit ทั้งก้อน (เนื้อเดิมทุกบรรทัด) ⇒ หน้าขาย (R8) และ
//   moduleRefundDeposit (คืนมัดจำของโมดูลจองคิว) ใช้ทางเดียวกัน · requestedByUserId = ผู้ทำรายการ (soldByUserId) · actorType ของ audit ◂
type RefundDepositTxArgs = {
  s: { tenantId: string; unitId: string; systemId: string };
  depositId: string;
  pays: DepositPayMethod[];
  reason: string;
  key: string;
  shiftId: string | null;
  sys: { settings: unknown } | null;
  requestedByUserId: string;
  auditActorId: string;
  actorType: "USER" | "SYSTEM";
};
async function refundDepositInTx(tx: Tx, a: RefundDepositTxArgs) {
  const { s, depositId, pays, reason, key, shiftId, sys, requestedByUserId, auditActorId, actorType } = a;
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${s.tenantId}::text || ':' || ${key}::text))) l`;
  const dup = await tx.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: s.tenantId, idempotencyKey: key } }, include: { payments: true } });
  if (dup) {
    const d0 = await tx.posDeposit.findFirst({ where: { id: depositId, tenantId: s.tenantId, unitId: s.unitId } });
    if (!d0 || dup.docType !== "REFUND" || dup.refSaleId !== d0.receiptSaleId || payBag(dup.payments) !== payBag(pays)) throw new DepositAbort(refuse("IDEMPOTENCY_CONFLICT", MSG.CONFLICT));
    return { kind: "dup" as const, dup, dep: d0 };
  }
  // ล็อกแถวมัดจำ (ใช้มัดจำ ∥ คืนเงิน = คนเดียวชนะ · CHECK used + refunded ≤ amount)
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PosDeposit" WHERE id = ${depositId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} ORDER BY id FOR UPDATE`;
  if (!locked.length) throw new DepositAbort(refuse("DEPOSIT_NOT_FOUND", MSG.NOT_FOUND));
  const d = await tx.posDeposit.findUniqueOrThrow({ where: { id: depositId } });
  const remaining = d.amountSatang - d.usedSatang - d.refundedSatang;
  if (d.status !== "OPEN" || remaining <= 0) throw new DepositAbort(refuse("DEPOSIT_CLOSED", MSG.CLOSED));
  if (pays.reduce((t, p) => t + p.amountSatang, 0) !== remaining) throw new DepositAbort(refuse("VALIDATION", MSG.REFUND_ALL));
  const vatOut = (await depositVatLeft(tx, [d.id])).get(d.id) ?? 0;
  const vat = Math.min(remaining, Math.max(0, d.vatSatang - vatOut));
  const receipt = await tx.posSale.findFirst({ where: { id: d.receiptSaleId, tenantId: s.tenantId }, include: { lines: { orderBy: { id: "asc" } } } });
  if (!receipt) throw new DepositAbort(refuse("DEPOSIT_NOT_FOUND", MSG.NOT_FOUND));
  // เลขใบคืน CN… ตัวนับของใบคืน (PosDocCounter · แบบ refund.ts) — ใบเสร็จขายไม่ขยับ
  const period = bkkPeriod();
  const ctr = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "PosDocCounter" ("id", "tenantId", "unitId", "docType", "period", "seq")
    VALUES (${randomUUID()}, ${s.tenantId}, ${s.unitId}, 'REFUND'::"PosSaleDocType", ${period}, 1)
    ON CONFLICT ("unitId", "docType", "period") DO UPDATE SET "seq" = "PosDocCounter"."seq" + 1
    RETURNING "seq"`;
  const receiptNo = `${refundPrefixOf(sys?.settings)}${period}-${String(Number(ctr[0]!.seq)).padStart(4, "0")}`;
  const line = receipt.lines[0];
  const refund = await tx.posSale.create({
    data: {
      tenantId: s.tenantId,
      unitId: s.unitId,
      systemId: s.systemId,
      memberId: null,
      sourceModule: POS_DEPOSIT_SOURCE,
      sourceId: null,
      idempotencyKey: key,
      receiptNo,
      publicToken: newReceiptToken(),
      status: "PAID",
      docType: "REFUND",
      refSaleId: receipt.id,
      reasonCode: "OTHER",
      subtotalSatang: remaining,
      discountSatang: 0,
      vatSatang: vat,
      grandTotalSatang: remaining,
      serviceChargeSatang: 0,
      tipSatang: 0,
      note: reason,
      paidAt: new Date(),
      shiftId,
      soldByUserId: requestedByUserId,
    },
  });
  await tx.posSaleLine.create({
    data: { tenantId: s.tenantId, unitId: s.unitId, saleId: refund.id, name: `คืน${line?.name ?? "มัดจำ"}`.slice(0, 200), qty: 1, unitPriceSatang: remaining, discountSatang: 0, lineTotalSatang: remaining, refLineId: line?.id ?? null, restock: false },
  });
  await tx.posPayment.createMany({ data: pays.map((p) => ({ tenantId: s.tenantId, unitId: s.unitId, saleId: refund.id, type: p.type, amountSatang: p.amountSatang, reference: p.reference ?? null })) });
  // ใบรับ: ยอดคืนสะสม · คืนครบทั้งใบ (ยังไม่เคยใช้) = REFUNDED แบบบิลที่คืนครบ (บิลที่ใช้ไปบางส่วนยัง PAID)
  const rcpt = await tx.posSale.update({ where: { id: receipt.id }, data: { refundedSatang: { increment: remaining } }, select: { refundedSatang: true, grandTotalSatang: true } });
  if (rcpt.refundedSatang >= rcpt.grandTotalSatang) await tx.posSale.update({ where: { id: receipt.id }, data: { status: "REFUNDED" } });
  const n = await tx.$executeRaw`
    UPDATE "PosDeposit" SET "refundedSatang" = "refundedSatang" + ${remaining}, status = 'REFUNDED'::"PosDepositStatus", "updatedAt" = now()
    WHERE id = ${d.id} AND status = 'OPEN' AND "amountSatang" - "usedSatang" - "refundedSatang" = ${remaining}`;
  if (n !== 1) throw new DepositAbort(refuse("DEPOSIT_CLOSED", MSG.CLOSED));
  await tx.posDepositTxn.create({ data: { tenantId: s.tenantId, depositId: d.id, type: "REFUND", satang: remaining, vatSatang: vat, saleId: refund.id, idempotencyKey: `dep-refund-${refund.id}` } });
  await emitOutbox(tx, {
    tenantId: s.tenantId,
    type: "pos.sale.refunded",
    idempotencyKey: `PosSale#${refund.id}#REFUNDED`,
    payload: {
      saleId: receipt.id,
      refundSaleId: refund.id,
      sourceModule: POS_DEPOSIT_SOURCE,
      full: true,
      depositId: d.id,
      lines: line ? [{ refLineId: line.id, qty: 1, amountSatang: remaining, restock: false, itemId: null }] : [],
      payMethods: pays.map((p) => ({ type: p.type, amountSatang: p.amountSatang })),
    },
    systemId: s.systemId,
    unitId: s.unitId,
  });
  await tx.auditLog.create({
    data: {
      tenantId: s.tenantId,
      unitId: s.unitId,
      actorType,
      actorId: auditActorId,
      action: "pos.deposit.refund",
      targetType: "PosSale",
      targetId: refund.id,
      after: { depositId: d.id, receiptNo, depositReceiptNo: d.receiptNo, grandTotalSatang: remaining, vatSatang: vat, reason, payMethods: pays.map((p) => ({ type: p.type, amountSatang: p.amountSatang })), ...(auditActorId !== requestedByUserId ? { via: "pin_override", requestedByUserId: requestedByUserId } : {}) } as Prisma.InputJsonValue,
    },
  });
  const dep = await tx.posDeposit.findUniqueOrThrow({ where: { id: d.id } });
  return { kind: "new" as const, refund, dep };
}

// ═══════════════════════ POS P5.1 ▸ MA2 MA4 (F2 F4) มัดจำของโมดูล (จองคิว · โรงแรม · เช่า) ═══════════════════════
// 🔴 มัดจำของโมดูล = ใบรับเงินมัดจำ POS_DEPOSIT (Cr 2110 + VAT ตอนรับ · ไม่ใช่รายได้) + PosDeposit + RECEIVE ในธุรกรรมเดียว ·
//    บิลปิด (เช็คเอาท์/คืนของ/มาใช้บริการ) จ่ายมัดจำเป็นแถว {DEPOSIT, refSaleId = ใบรับ} + ส่วนที่เหลือ ⇒ Σ รายได้ = ราคา · VAT ครั้งเดียว
// 🔴 ไม่มีจุดเรียก createSale ใหม่: โมดูลส่งฟังก์ชันที่เรียก createSale จุดเดิมของตัวเองด้วย client = callerTx(tx) (HT6.1 · ทะเบียน U4/L2 คงเดิม)
// 🔴 ไม่ผ่าน RBAC/ค่าตั้งของหน้าขาย (pos.deposit.enabled): สิทธิ์ตรวจที่ action ของโมดูลแล้ว · กะ = กติกา "ทางอื่น" ของ createSale
export type ModuleDepositSell = (client: Tx, p: { idempotencyKey: string; sourceModule: typeof POS_DEPOSIT_SOURCE; sourceId: string; payType: PosPayType }) => Promise<{ saleId: string; status?: string }>;
export type ModuleDepositInput = {
  tenantId: string;
  unitId: string;
  systemId: string;
  /** คีย์ฐานของโมดูล (เช่น booking-deposit-<id>) · ใบรับของคีย์ที่ไม่ใช่ PAID แล้ว (คืนเงิน/ยกเลิก) ⇒ เลื่อนเป็น <คีย์>-r1, -r2 … */
  keyBase: string;
  amountSatang: number;
  /** POS P5.1 ▸ MA14 (R1 F4 · CD-P51-O9): วิธีรับจริงของฟอร์มโมดูล — CASH/PROMPTPAY/TRANSFER/CARD · ไม่ส่ง/อื่น (รวม "DEPOSIT") = TRANSFER (ฟอร์มโมดูลไม่มีช่องวิธีรับ) ·
   *  ห้าม DEPOSIT สำหรับเงินเข้า (DEPOSIT = "ใช้มัดจำ" เท่านั้น — สรุปวันนับซ้อน/ไม่ตรง 1010) · GL เดิม (depositChannel TRANSFER → 1010) ◂ */
  payType?: PosPayType;
  customerId?: string | null;
  customerName?: string | null;
  note?: string | null;
  /** ผู้สร้างในแถว PosDeposit/audit (เช่น "module:hotel") */
  createdBy: string;
};
export type ModuleDepositResult = { saleId: string; depositId: string | null; duplicated: boolean };

export async function moduleTakeDeposit(input: ModuleDepositInput, sell: ModuleDepositSell): Promise<ModuleDepositResult> {
  const payType: PosPayType = input.payType && (DEPOSIT_PAY_TYPES as readonly string[]).includes(input.payType) ? input.payType : "TRANSFER"; // POS P5.1 ▸ MA14 (CD-P51-O9): ค่าปริยาย TRANSFER (เดิม DEPOSIT) ◂
  for (let round = 0; round <= 20; round++) {
    const key = round === 0 ? input.keyBase : `${input.keyBase}-r${round}`;
    const st = await saleStatusByKey(input.tenantId, key);
    if (st !== null && st !== "PAID") continue;
    if (st === "PAID") {
      // บิลมัดจำแบบเดิม (ก่อน P5.1 · ไม่ใช่ใบรับ) ของคีย์นี้ = มัดจำเดิม (ไม่ออกใบรับซ้อน · บิลปิดคิดราคาเต็มแบบเดิม)
      const old = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: key } }, select: { id: true, sourceModule: true, refundedSatang: true } });
      if (old && old.sourceModule !== POS_DEPOSIT_SOURCE) return { saleId: old.id, depositId: null, duplicated: true };
      // POS P5.1 ▸ MA4b (R1 F1 · CD-P51-O7): ใบรับที่ใช้ไปบางส่วนแล้วคืนเงินส่วนที่เหลือ ยัง PAID (refundedSatang > 0) = มัดจำที่ปิดแล้ว ⇒ คีย์ถัดไป ◂
      if (old && old.refundedSatang > 0) continue;
    }
    let stale = false;
    for (let attempt = 0; attempt < 3 && !stale; attempt++) {
      try {
        const out = await prisma.$transaction(
          async (tx) => {
            const depositId = `dep${randomUUID().replace(/-/g, "")}`;
            const r = await sell(tx, { idempotencyKey: key, sourceModule: POS_DEPOSIT_SOURCE, sourceId: depositId, payType }); // ผู้เรียกห่อ callerTx(tx) เอง (HT6.1) 
            if (r.status !== undefined && r.status !== "PAID") return { kind: "stale" as const };
            const prior = await tx.posDeposit.findUnique({ where: { receiptSaleId: r.saleId }, select: { id: true, status: true, refundedSatang: true } });
            // POS P5.1 ▸ MA4b (R1 F1 · CD-P51-O7): มัดจำของใบรับนี้ถูกคืนแล้ว (บางส่วนหรือทั้งหมด) / หมดอายุ = ไม่ใช่ "รายการเดิม" ⇒ คีย์ถัดไป
            //   (การคืนของโมดูลทิ้ง refundedSatang > 0 เสมอ · ลองซ้ำ/แข่งจริง refunded 0 ⇒ ยังเป็น dup) ◂
            if (prior && (prior.refundedSatang > 0 || prior.status === "REFUNDED" || prior.status === "EXPIRED")) return { kind: "stale" as const };
            if (prior) return { kind: "dup" as const, saleId: r.saleId, depositId: prior.id };
            const sale = await tx.posSale.findUnique({ where: { id: r.saleId }, select: { vatSatang: true, receiptNo: true } });
            const dep = await tx.posDeposit.create({
              data: {
                id: depositId,
                tenantId: input.tenantId,
                systemId: input.systemId,
                unitId: input.unitId,
                customerId: input.customerId ?? null,
                customerName: input.customerName ?? null,
                amountSatang: input.amountSatang,
                vatSatang: sale?.vatSatang ?? 0,
                receiptSaleId: r.saleId,
                receiptNo: sale?.receiptNo ?? null,
                note: input.note ?? null,
                idempotencyKey: `${KEY_DEPOSIT}mod:${key}`,
                createdByUserId: input.createdBy,
              },
            });
            await tx.posDepositTxn.create({
              data: { tenantId: input.tenantId, depositId, type: "RECEIVE", satang: input.amountSatang, vatSatang: dep.vatSatang, saleId: r.saleId, idempotencyKey: `dep-receive-${depositId}` },
            });
            await tx.auditLog.create({
              data: {
                tenantId: input.tenantId,
                unitId: input.unitId,
                actorType: "SYSTEM",
                actorId: input.createdBy,
                action: "pos.deposit.receive",
                targetType: "PosDeposit",
                targetId: depositId,
                after: { receiptSaleId: r.saleId, receiptNo: dep.receiptNo, amountSatang: dep.amountSatang, vatSatang: dep.vatSatang, member: !!dep.customerId, source: input.createdBy, payMethods: [{ type: payType, amountSatang: input.amountSatang }] },
              },
            });
            return { kind: "new" as const, saleId: r.saleId, depositId };
          },
          { timeout: 20_000, maxWait: 15_000 },
        );
        if (out.kind === "stale") {
          stale = true;
          continue;
        }
        if (out.kind === "new") await afterSaleCommitted({ tenantId: input.tenantId, unitId: input.unitId, lines: [] }, out.saleId);
        return { saleId: out.saleId, depositId: out.depositId, duplicated: out.kind === "dup" };
      } catch (e) {
        const code = (e as { code?: unknown } | null)?.code;
        if (code === "P2002" || code === "P2034" || code === "P2028") continue; // ตัวนับใบเสร็จเดือนใหม่ชน/ธุรกรรมชน = rollback ทั้งก้อน ลองใหม่ (คีย์กันซ้ำ)
        throw e;
      }
    }
    if (!stale) throw new Error("ระบบไม่ว่าง — ลองรับมัดจำอีกครั้ง");
  }
  throw new PosSaleError("VALIDATION", "มัดจำของรายการนี้ถูกคืน/ยกเลิกซ้ำหลายครั้งเกินไป — ติดต่อผู้ดูแลระบบ");
}

/** บิลปิดของโมดูล: แถวมัดจำที่ใช้ได้ของใบรับ (OPEN · สาขาเดียวกัน) = min(คงเหลือ, ยอดบิล) · ไม่มีใบรับ (มัดจำแบบเดิม/standalone) หรือปิดแล้ว = null (คิดเต็มแบบเดิม) */
export async function moduleDepositForBill(tenantId: string, unitId: string, receiptSaleId: string | null | undefined, billSatang: number): Promise<{ refSaleId: string; satang: number } | null> {
  if (!receiptSaleId || billSatang <= 0) return null;
  const d = await prisma.posDeposit.findUnique({ where: { receiptSaleId }, select: { tenantId: true, unitId: true, status: true, amountSatang: true, usedSatang: true, refundedSatang: true } });
  if (!d || d.tenantId !== tenantId || d.unitId !== unitId || d.status !== "OPEN") return null;
  const satang = Math.min(d.amountSatang - d.usedSatang - d.refundedSatang, billSatang);
  return satang > 0 ? { refSaleId: receiptSaleId, satang } : null;
}

export type ModuleRefundDepositResult = { ok: true; refundSaleId: string | null; legacy: boolean; duplicated?: boolean } | { ok: false; code: string; message: string };
/**
 * คืนเงินมัดจำของโมดูล (ทั้งคงเหลือ · วิธีเดียวกับตอนรับ) ผ่านธุรกรรมเดียวกับหน้าขาย (refundDepositInTx: ใบคืน CN + REFUND txn + ใบรับ REFUNDED) ·
 * ไม่มี PosDeposit ของใบรับ = มัดจำแบบเดิม ⇒ {legacy: true} ให้ผู้เรียก void ตามทางเดิม · คีย์ผูกใบรับ (ลองซ้ำ = ใบคืนเดิม)
 */
export async function moduleRefundDeposit(input: { tenantId: string; unitId: string; receiptSaleId: string; reason: string; actorId: string }): Promise<ModuleRefundDepositResult> {
  const d = await prisma.posDeposit.findUnique({ where: { receiptSaleId: input.receiptSaleId } });
  if (!d || d.tenantId !== input.tenantId) return { ok: true, refundSaleId: null, legacy: true };
  if (d.unitId !== input.unitId) return { ok: false, code: "DEPOSIT_NOT_FOUND", message: MSG.NOT_FOUND };
  const key = `${KEY_REFUND}mod:${input.receiptSaleId}`;
  const prior = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: key } }, select: { id: true } });
  if (prior) return { ok: true, refundSaleId: prior.id, legacy: false, duplicated: true };
  const remaining = d.amountSatang - d.usedSatang - d.refundedSatang;
  if (d.status !== "OPEN" || remaining <= 0) return { ok: false, code: "DEPOSIT_CLOSED", message: MSG.CLOSED };
  const receiptPays = await prisma.posPayment.findMany({ where: { tenantId: input.tenantId, saleId: d.receiptSaleId }, select: { type: true }, orderBy: { amountSatang: "desc" } });
  const t = receiptPays.find((p) => (DEPOSIT_PAY_TYPES as readonly string[]).includes(p.type))?.type;
  const pays: DepositPayMethod[] = [{ type: (t as DepositPayType | undefined) ?? "TRANSFER", amountSatang: remaining }];
  const s = { tenantId: d.tenantId, unitId: d.unitId, systemId: d.systemId };
  const receipt = await prisma.posSale.findFirst({ where: { id: d.receiptSaleId, tenantId: s.tenantId }, select: { shiftId: true } });
  const sh = await resolveApiRefundShift(prisma, s, receipt?.shiftId ?? null);
  if (pays[0]!.type === "CASH" && sh.required && !sh.shiftId) return { ok: false, code: "SHIFT_REQUIRED", message: "ต้องเปิดกะก่อนคืนเงินสด" };
  const sys = await prisma.appSystem.findFirst({ where: { id: s.systemId, tenantId: s.tenantId }, select: { settings: true } });
  const reason = (input.reason.trim() || "คืนมัดจำ").slice(0, 200);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await prisma.$transaction(
        async (tx) => refundDepositInTx(tx, { s, depositId: d.id, pays, reason, key, shiftId: sh.shiftId, sys, requestedByUserId: input.actorId, auditActorId: input.actorId, actorType: "SYSTEM" }),
        { timeout: 20_000, maxWait: 15_000 },
      );
      if (out.kind === "new") scheduleDrain();
      return { ok: true, refundSaleId: out.kind === "dup" ? out.dup.id : out.refund.id, legacy: false, ...(out.kind === "dup" ? { duplicated: true } : {}) };
    } catch (e) {
      if (e instanceof DepositAbort) return { ok: false, code: e.refusal.code, message: e.refusal.message ?? e.refusal.code };
      const code = (e as { code?: unknown } | null)?.code;
      if (code === "P2002" || code === "P2034" || code === "P2028") continue;
      throw e;
    }
  }
  return { ok: false, code: "BUSY", message: "ระบบไม่ว่าง — ลองอีกครั้ง" };
}
/**
 * POS P5.1 ▸ MA2b (R1 F2 · CD-P51-O7): คืนเงินทั้งรายการของโมดูล (hotel refundStay · rental refundRental) หลัง void บิลปิด —
 * คืนสภาพ APPLY ของบิลที่ void ทันที (depositSaleVoided · คีย์ dep-restore-<apply> ⇒ คิวที่ตามมา = ไม่มีผล) แล้วคืนเงินมัดจำคงเหลือทั้งหมด
 * (ใบคืน CN ของใบรับ · moduleRefundDeposit) ⇒ "คืนเงินแล้ว" = ลูกค้าได้มัดจำคืนครบ · ไม่มีใบรับ (มัดจำแบบเดิม/standalone) = legacy ไม่ทำอะไร ·
 * voidSale เปิดธุรกรรมของตัวเอง (สัญญา pos-sale-contract.json ตรึงไว้) ⇒ ทำต่อกันเป็นขั้น แต่ละขั้นมีคีย์กันซ้ำ ◂
 */
export async function moduleRefundDepositAfterVoid(input: { tenantId: string; unitId: string; receiptSaleId: string | null | undefined; voidedSaleId: string | null | undefined; reason: string; actorId: string }): Promise<ModuleRefundDepositResult & { refundSatang?: number }> {
  if (!input.receiptSaleId) return { ok: true, refundSaleId: null, legacy: true };
  if (input.voidedSaleId) await depositSaleVoided({ tenantId: input.tenantId, payload: { saleId: input.voidedSaleId } });
  const d = await prisma.posDeposit.findUnique({ where: { receiptSaleId: input.receiptSaleId }, select: { tenantId: true, status: true, amountSatang: true, usedSatang: true, refundedSatang: true } });
  if (!d || d.tenantId !== input.tenantId) return { ok: true, refundSaleId: null, legacy: true };
  const left = d.amountSatang - d.usedSatang - d.refundedSatang;
  if (d.status !== "OPEN" || left <= 0) return { ok: true, refundSaleId: null, legacy: false, refundSatang: 0 };
  const r = await moduleRefundDeposit({ tenantId: input.tenantId, unitId: input.unitId, receiptSaleId: input.receiptSaleId, reason: input.reason, actorId: input.actorId });
  return r.ok ? { ...r, refundSatang: r.duplicated ? 0 : left } : r;
}
// ◂ POS P5.1 MA2 MA4

// ═══════════════════════ POS P5.1 ▸ MA12 MA13 (R1 F3 · CD-P51-O8) ริบมัดจำ ═══════════════════════
// 🔴 CD-P51-O8 (ค่าปริยายระหว่าง W39 ยังเปิด): ริบ = บิล "มัดจำริบ — ไม่มาตามนัด" บรรทัดเดียว (ไม่ผูกสินค้า · ยอด = คงเหลือ · VAT ตามค่าตั้งของบิล)
//    จ่ายด้วยแถว {DEPOSIT, refSaleId = ใบรับ} ⇒ createSale ตัดมัดจำ (APPLY · VAT ที่รับไว้ปล่อยครบ) ⇒ มัดจำ USED · รายได้รับรู้ครั้งเดียว · ไม่มีแถวเงินสด
//    ผ่าน createSale จุดเดิมของผู้เรียก (จองคิว = จุดเดียวของ booking/service.ts · หน้าขาย = regCreateSale) — ไม่มีจุดเรียกใหม่ (HT6.1 · HT6.4)
//    คีย์ dep-forfeit:<depositId> ⇒ ริบซ้ำ/สองทาง (NO_SHOW + หน้าขาย) = บิลเดียว · audit pos.deposit.forfeit (targetType PosDeposit · เหตุผล · ผู้ทำ)
//    (b) ยกเลิก (จองคิว CANCELLED · โรงแรม cancelReservation · เช่า cancelBooking) ไม่เรียกที่นี่ = มัดจำ OPEN ให้คนตัดสินที่หน้าขาย (คืนหรือริบ)
//    (d) มัดจำแบบเดิม (ก่อน MA2 · ไม่มี PosDeposit) = ไม่พบ ⇒ ไม่แตะ
export const FORFEIT_LINE_NAME = "มัดจำริบ — ไม่มาตามนัด";
const KEY_FORFEIT = "dep-forfeit:";
/** คีย์ PosDeposit ของมัดจำโมดูล (moduleTakeDeposit) — หน้าขายริบได้เฉพาะมัดจำชนิดนี้ (O8c) */
const MODULE_DEPOSIT_KEY = `${KEY_DEPOSIT}mod:`;
const FORFEIT_PERMISSION = "pos.sale.manage";
export type DepositForfeitSellInput = {
  idempotencyKey: string;
  lines: { name: string; qty: number; unitPriceSatang: number }[];
  payMethods: { type: "DEPOSIT"; amountSatang: number; refSaleId: string }[];
  memberId?: string;
  note?: string;
};
/** ผู้เรียกส่งฟังก์ชันที่เรียก createSale จุดเดิมของตัวเองด้วย client = callerTx(tx) (แบบ ModuleDepositSell) */
export type DepositForfeitSell = (client: Tx, p: DepositForfeitSellInput) => Promise<{ saleId: string; status?: string }>;
export type DepositForfeitResult = { ok: true; saleId: string; satang: number; deposit: DepositView; duplicated?: boolean } | { ok: false; code: RegisterRefusalCode; message: string };

async function forfeitDeposit(
  a: { tenantId: string; unitId: string; depositId: string; reason: string; note?: string; actorType: "USER" | "SYSTEM"; actorId: string; source: string },
  sell: DepositForfeitSell,
): Promise<DepositForfeitResult> {
  const key = KEY_FORFEIT + a.depositId;
  for (let attempt = 0; attempt < 3; attempt++) {
    const d = await prisma.posDeposit.findFirst({ where: { id: a.depositId, tenantId: a.tenantId, unitId: a.unitId } });
    if (!d) return { ok: false, code: "DEPOSIT_NOT_FOUND", message: MSG.NOT_FOUND };
    const prior = await prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: a.tenantId, idempotencyKey: key } }, select: { id: true, grandTotalSatang: true } });
    if (prior) return { ok: true, saleId: prior.id, satang: prior.grandTotalSatang, deposit: viewOf(d), duplicated: true };
    const remaining = d.amountSatang - d.usedSatang - d.refundedSatang;
    if (d.status !== "OPEN" || remaining <= 0) return { ok: false, code: "DEPOSIT_CLOSED", message: MSG.CLOSED };
    const lines = [{ name: FORFEIT_LINE_NAME, qty: 1, unitPriceSatang: remaining }];
    try {
      const out = await prisma.$transaction(
        async (tx) => {
          // ริบพร้อมกันสองทาง (NO_SHOW ∥ หน้าขาย) = เรียงคิวที่คีย์ · คนที่สองเห็นบิลของคนแรก (ไม่เขียน audit ซ้ำ)
          await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${a.tenantId}::text || ':' || ${key}::text))) l`;
          const again = await tx.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: a.tenantId, idempotencyKey: key } }, select: { id: true, grandTotalSatang: true } });
          if (again) return { kind: "dup" as const, saleId: again.id, satang: again.grandTotalSatang };
          // ล็อก/ตัดมัดจำอยู่ในธุรกรรมของบิล (createSale · ลำดับล็อกเดียวกับทุกบิล) — คงเหลือเปลี่ยน = DEPOSIT_EXCEEDS ⇒ อ่านใหม่
          const r = await sell(tx, {
            idempotencyKey: key,
            lines,
            payMethods: [{ type: "DEPOSIT", amountSatang: remaining, refSaleId: d.receiptSaleId }],
            ...(d.customerId ? { memberId: d.customerId } : {}), // มัดจำของสมาชิกใช้ได้เฉพาะบิลของสมาชิกนั้น (มติ 4)
            ...(a.note ? { note: a.note } : {}),
          });
          if (r.status !== undefined && r.status !== "PAID") throw new DepositAbort(refuse("VALIDATION", "บิลริบมัดจำไม่สำเร็จ — ลองอีกครั้ง"));
          await tx.auditLog.create({
            data: {
              tenantId: a.tenantId,
              unitId: a.unitId,
              actorType: a.actorType,
              actorId: a.actorId,
              action: "pos.deposit.forfeit",
              targetType: "PosDeposit",
              targetId: d.id,
              after: { saleId: r.saleId, receiptSaleId: d.receiptSaleId, depositReceiptNo: d.receiptNo, satang: remaining, reason: a.reason, source: a.source } as Prisma.InputJsonValue,
            },
          });
          return { kind: "new" as const, saleId: r.saleId, satang: remaining };
        },
        { timeout: 20_000, maxWait: 15_000 },
      );
      if (out.kind === "new") await afterSaleCommitted({ tenantId: a.tenantId, unitId: a.unitId, lines }, out.saleId);
      const dep = await prisma.posDeposit.findUniqueOrThrow({ where: { id: d.id } });
      return { ok: true, saleId: out.saleId, satang: out.satang, deposit: viewOf(dep), ...(out.kind === "dup" ? { duplicated: true } : {}) };
    } catch (e) {
      if (e instanceof DepositAbort) return { ok: false, code: e.refusal.code, message: e.refusal.message ?? e.refusal.code };
      if (e instanceof PosSaleError) {
        if (e.code === "DEPOSIT_EXCEEDS") continue; // มีบิลใช้มัดจำแทรกระหว่างอ่านกับตัด ⇒ อ่านคงเหลือใหม่
        return { ok: false, code: e.code === "HAS_REFUNDS" ? "VALIDATION" : e.code, message: e.message };
      }
      const code = (e as { code?: unknown } | null)?.code;
      if (code === "P2002" || code === "P2034" || code === "P2028") continue;
      throw e;
    }
  }
  return { ok: false, code: "BUSY", message: "ระบบไม่ว่าง — ลองอีกครั้ง" };
}

/**
 * O8a — ริบมัดจำของโมดูล (จองคิว NO_SHOW): ใบรับไม่มี PosDeposit (มัดจำแบบเดิม/standalone) = {legacy} ไม่ทำอะไร ·
 * ปิดแล้ว (ใช้/คืน) = DEPOSIT_CLOSED · ไม่ผ่าน RBAC ของหน้าขาย (สิทธิ์ตรวจที่ action ของโมดูลแล้ว) · audit actorType SYSTEM
 */
export async function moduleForfeitDeposit(
  input: { tenantId: string; unitId: string; receiptSaleId: string | null | undefined; reason: string; actorId: string },
  sell: DepositForfeitSell,
): Promise<DepositForfeitResult | { ok: true; legacy: true }> {
  if (!input.receiptSaleId) return { ok: true, legacy: true };
  const d = await prisma.posDeposit.findUnique({ where: { receiptSaleId: input.receiptSaleId }, select: { id: true, tenantId: true, unitId: true } });
  if (!d || d.tenantId !== input.tenantId) return { ok: true, legacy: true };
  if (d.unitId !== input.unitId) return { ok: false, code: "DEPOSIT_NOT_FOUND", message: MSG.NOT_FOUND };
  return forfeitDeposit({ tenantId: input.tenantId, unitId: input.unitId, depositId: d.id, reason: input.reason, actorType: "SYSTEM", actorId: input.actorId, source: input.actorId }, sell);
}

export type RegisterForfeitDepositInput = { depositId: string; reason: string };
export type RegisterForfeitDepositResult = { ok: true; sale: { id: string; receiptNo: string | null; grandTotalSatang: number }; deposit: DepositView; duplicated?: boolean } | RegisterRefusal;
/**
 * O8c — หน้าขาย "ริบมัดจำ" ของมัดจำโมดูลที่ OPEN (ยกเลิกจอง/ไม่มา · คนตัดสิน): pos.sale.manage ที่สาขา · เหตุผลบังคับ (REASON_REQUIRED) ·
 * มัดจำที่รับหน้าขาย (ไม่ใช่ของโมดูล) = VALIDATION · บิลผ่าน regCreateSale (จุดเรียกเดิมของหน้าขาย · sourceModule POS · sourceId = มัดจำ) ·
 * กะของเครื่อง (ถ้ามี) ผูกกับบิล · ไม่มีเงินเข้าออก ⇒ ไม่บังคับกะ
 */
export async function registerForfeitDeposit(ctx: RegisterCtx, actor: RegisterActor, input: RegisterForfeitDepositInput, client?: Db): Promise<RegisterForfeitDepositResult> {
  return guard("registerForfeitDeposit", async (): Promise<RegisterForfeitDepositResult> => {
    const db = client ?? prisma;
    const sc = await registerScopeCheck(ctx, actor, db);
    if (sc.ok === false) return sc;
    const s = sc.ctx;
    if (!evaluate(sc.actor, { module: "pos", action: FORFEIT_PERMISSION, unitId: s.unitId })) return refuse("PERMISSION_DENIED", "ริบมัดจำได้เฉพาะผู้จัดการ (สิทธิ์ pos.sale.manage)");
    if (!isRecord(input)) return refuse("VALIDATION");
    const reason = cleanText(input.reason, 200);
    if (reason === false) return refuse("VALIDATION", "เหตุผลยาวได้ไม่เกิน 200 ตัวอักษร");
    if (!reason) return refuse("REASON_REQUIRED", "ระบุเหตุผลการริบมัดจำ");
    if (!isId(input.depositId)) return refuse("DEPOSIT_NOT_FOUND", MSG.NOT_FOUND);
    const d = await db.posDeposit.findFirst({ where: { id: input.depositId, tenantId: s.tenantId, unitId: s.unitId }, select: { id: true, idempotencyKey: true } });
    if (!d) return refuse("DEPOSIT_NOT_FOUND", MSG.NOT_FOUND);
    if (!d.idempotencyKey.startsWith(MODULE_DEPOSIT_KEY)) return refuse("VALIDATION", "ริบได้เฉพาะมัดจำของการจอง (จองคิว · โรงแรม · เช่า) — มัดจำที่รับหน้าขายให้คืนเงินหรือใช้กับบิล");
    const deviceRaw = isRecord(ctx) ? ctx.deviceId : undefined;
    if (deviceRaw !== undefined && deviceRaw !== null && !isShiftDeviceId(deviceRaw)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    const shift = await resolveRegisterShift(db, s, typeof deviceRaw === "string" ? deviceRaw : undefined);
    const shiftId = shift.ok ? shift.shiftId : null;
    const r = await forfeitDeposit(
      { tenantId: s.tenantId, unitId: s.unitId, depositId: d.id, reason, note: reason, actorType: "USER", actorId: sc.actor.userId, source: "register" },
      (tx, p) =>
        regCreateSale(
          { tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId, sourceModule: "POS", sourceId: d.id, ...p, ...(shiftId ? { shiftId } : {}), soldByUserId: sc.actor.userId },
          callerTx(tx),
        ),
    );
    if (r.ok === false) return refuse(r.code, r.message);
    const sale = await db.posSale.findFirst({ where: { id: r.saleId, tenantId: s.tenantId }, select: { id: true, receiptNo: true, grandTotalSatang: true } });
    return { ok: true as const, sale: { id: r.saleId, receiptNo: sale?.receiptNo ?? null, grandTotalSatang: sale?.grandTotalSatang ?? r.satang }, deposit: r.deposit, ...(r.duplicated ? { duplicated: true } : {}) };
  });
}
// ◂ POS P5.1 MA12 MA13

// ═══════════════════════ R6 คืนสภาพเมื่อบิลที่ใช้มัดจำถูก void ═══════════════════════
/**
 * R6 (X5) — งานหลักของคิว `pos.sale.voided` (หลัง tenderSaleVoided · try/fail แบบเดียวกัน): บิลขายที่ VOIDED แล้วเท่านั้น ⇒
 * ทุก APPLY ของบิล → RESTORE คีย์ dep-restore-<applyTxnId> (ล็อกแถวมัดจำ · used −= satang · คงเหลือ > 0 = OPEN) · บิล walk-in ก็ทำ ·
 * เล่นซ้ำ = ไม่มีผลเพิ่ม (คีย์ unique + ตรวจก่อนเขียนใต้ล็อก) · ล้ม = โยน (event ลองใหม่) · ไม่มี APPLY = query เดียวแล้วจบ ·
 * JV ไม่ต้องทำ (กลับรายการ JV ขายทั้งใบ = 2110/2200 คืนครบแล้ว)
 */
export async function depositSaleVoided(evt: { tenantId: string; payload: unknown }): Promise<void> {
  const saleId = isRecord(evt.payload) && typeof evt.payload.saleId === "string" ? evt.payload.saleId : "";
  if (!saleId) return;
  const applies = await prisma.posDepositTxn.findMany({ where: { tenantId: evt.tenantId, saleId, type: "APPLY" }, orderBy: { id: "asc" } });
  if (!applies.length) return;
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: evt.tenantId }, select: { status: true, docType: true } });
  if (!sale || sale.status !== "VOIDED" || sale.docType !== "SALE") return;
  for (const a of applies) {
    await prisma.$transaction(
      async (tx: Tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PosDeposit" WHERE id = ${a.depositId} AND "tenantId" = ${evt.tenantId} ORDER BY id FOR UPDATE`;
        if (!locked.length) return;
        const key = `dep-restore-${a.id}`;
        if (await tx.posDepositTxn.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) return;
        const n = await tx.$executeRaw`
          UPDATE "PosDeposit" SET "usedSatang" = "usedSatang" - ${a.satang},
            status = (CASE WHEN status = 'EXPIRED' THEN 'EXPIRED' ELSE 'OPEN' END)::"PosDepositStatus", "updatedAt" = now()
          WHERE id = ${a.depositId} AND "usedSatang" >= ${a.satang}`;
        if (n !== 1) throw new Error(`[pos/deposit] คืนสภาพมัดจำ ${a.depositId} ไม่ได้ (ยอดใช้ไม่พอคืน) — คิวลองใหม่`);
        await tx.posDepositTxn.create({ data: { tenantId: evt.tenantId, depositId: a.depositId, type: "RESTORE", satang: a.satang, vatSatang: a.vatSatang, saleId, paymentId: a.paymentId, refTxnId: a.id, idempotencyKey: key } });
      },
      { timeout: 20_000, maxWait: 15_000 },
    );
  }
}
