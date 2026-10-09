// payment-intent.ts — ใบขอรับเงินของหน้าขาย (POS P1.7) · ผู้เขียนเดียวของตาราง PosPaymentIntent
//
// ใช้ทำอะไร: ส่วนที่ไม่ใช่เงินสดของบิล (PromptPay / บัตร) ต้อง "เห็นเงินเข้า" ก่อนบิลเกิด
//   ① createPaymentIntent — QR พร้อมเพย์ล็อกยอด (EMV จาก PaymentProfile.promptpayId ของร้าน) หรือ Beam (ร้านเปิดเอง + แพลตฟอร์มมีกุญแจ)
//   ② ยืนยันเงินเข้า — webhook ของ Beam (payment-webhook.ts → markIntentPaid) หรือแคชเชียร์กดยืนยันเอง (มี audit · CD2)
//   ③ submitRegisterSale ใช้ intent ที่ PAID ได้ครั้งเดียว (ล็อก FOR UPDATE ในธุรกรรมขาย → CONSUMED + saleId)
//   ④ หมดอายุ — cron รายชั่วโมง (expirePaymentIntents) + อ่านสถานะแบบเขียนทับทันที (paymentIntentStatus · CD-E)
// สัญญา: ledger/pos-briefs/pos-brief-P1.7.md §2 R1–R8 + มติผู้คุมงาน A–K · ตารางชื่อ ledger/wo-notes/pos-P1.7-oracle.md
//
// 🔴 คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message ไทย} เสมอ — ไม่โยน (ผู้เรียกคือ server action/route)
// 🔴 Beam ใช้ได้เมื่อ "ร้านเปิดเอง" (settings.pos.payment.beam.enabled) **และ** แพลตฟอร์มมีกุญแจ (CD1) · Beam ล้ม = ถอยเป็น QR นิ่ง + ops event
// 🔴 ห้าม import ไส้ในของโมดูลบัญชี (ลอกแบบ beamAdapter มาเท่านั้น) · ห้าม import lib/env แบบ static
// 🔴 network (Beam) อยู่นอกธุรกรรมเสมอ · ops log หลัง commit เสมอ

import { randomBytes } from "node:crypto";
import { Prisma, type PosPaymentIntent, type PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { logOps } from "@/lib/core/ops";
import { emitOutbox } from "@/lib/core/outbox";
import { isValidPromptPayId, promptpayPayload } from "@/lib/payment/promptpay";
import { beamEnabled, createCharge as beamCreateCharge } from "@/lib/payment/beam";
import { isShiftDeviceId } from "./shift";
import { posDeviceRevoked } from "./device";
import { PRICE_MAX_SATANG } from "./pricing-shared";
import {
  PAYMENT_INTENT_CONSUME_WINDOW_MS,
  POS_BEAM_REF_PREFIX,
  isPaymentIntentId,
  parsePosIntentSettings,
  type CreatePaymentIntentResult,
  type MarkIntentPaidResult,
  type PaymentIntentActionResult,
  type PaymentIntentKind,
  type PaymentIntentRefusal,
  type PaymentIntentRefusalCode,
  type PaymentIntentStatus,
  type PaymentIntentStatusResult,
  type PaymentIntentVia,
  type PaymentIntentView,
  type PosIntentSettings,
  promptpayIdForUnit, // POS P1.18 ▸ มติ Q9 พร้อมเพย์รายสาขา ◂
} from "./payment-intent-shared";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

/** ผู้กระทำ (รูปเดียวกับ RegisterActor — server action สร้างจาก membership ของ session) */
type IntentActor = { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
/** ขอบเขตคำขอ (รูปเดียวกับ RegisterCtx) */
type IntentCtx = { tenantId: string; systemId: string; unitId: string; deviceId?: string };

/** ชื่อเหตุการณ์ (ops / audit / outbox) — ข้อสอบค้นด้วยชื่อตรงตัว (CD-J) */
const EV_INTENT_PAID = "pos.payment.intent_paid";
const OPS_BEAM_FALLBACK = "pos.payment.beam_fallback";
const OPS_AMOUNT_MISMATCH = "pos.payment.amount_mismatch";
const OPS_REFUND_NEEDED = "pos.payment.refund_needed";
const OPS_BEAM_CARD_FAILED = "pos.payment.beam_card_failed";
const AUD_MANUAL = "pos.payment.manual_confirm";
const AUD_CANCEL = "pos.payment.cancel";
const OPS_SOURCE = "pos.payment";

const MSG: Record<PaymentIntentRefusalCode, string> = {
  NOT_FOUND: "ไม่พบสาขานี้ หรือบัญชีนี้ยังขายที่สาขานี้ไม่ได้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  DEVICE_REVOKED: "เครื่องนี้ถูกเพิกถอนแล้ว — ใช้ขายไม่ได้ ติดต่อผู้จัดการ",
  IDEMPOTENCY_CONFLICT: "รหัสรายการนี้ถูกใช้กับยอดอื่นแล้ว — สร้าง QR ใหม่",
  PROMPTPAY_NOT_CONFIGURED: "ร้านยังไม่ได้ตั้งพร้อมเพย์ (หรือเลขไม่ถูกต้อง) — ให้ผู้จัดการไปที่ บัญชี → โปรไฟล์ธุรกิจ แล้วกรอกพร้อมเพย์ (เบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก)",
  CARD_UNAVAILABLE: "รับบัตรผ่าน Beam ยังไม่เปิดใช้ที่ร้านนี้ — รับบัตรด้วยเครื่อง EDC แล้วใส่เลขอ้างอิงแทน",
  AMOUNT_MISMATCH: "ยอดเงินไม่ตรงกับใบขอรับเงิน — สร้าง QR ใหม่ด้วยยอดที่ถูกต้อง",
  INTENT_NOT_FOUND: "ไม่พบรายการรับเงินนี้ที่สาขานี้",
  INTENT_NOT_PAID: "ยังไม่ได้รับเงินของรายการนี้ — รอเงินเข้า หรือยืนยันเองเมื่อเห็นเงินเข้า",
  INTENT_CONSUMED: "รายการรับเงินนี้ถูกใช้กับบิลอื่นไปแล้ว",
  INTENT_EXPIRED: "QR หมดอายุแล้ว — สร้างใหม่ (ถ้าลูกค้าโอนแล้ว ให้ผู้จัดการตรวจยอดเงินเข้า)",
  INTENT_CANCELLED: "รายการรับเงินนี้ถูกยกเลิกแล้ว",
  INTENT_PAID: "เงินของรายการนี้เข้าแล้ว — ยกเลิกไม่ได้ ใช้กับบิล หรือคืนเงินลูกค้าเอง",
  MANUAL_NOT_ALLOWED: "รายการบัตรผ่าน Beam ยืนยันเองไม่ได้ — รอผลจาก Beam หรือรับบัตรด้วยเครื่อง EDC",
  INTERNAL: "ระบบรับเงินขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: PaymentIntentRefusalCode, message?: string): PaymentIntentRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRefusal = (v: unknown): v is PaymentIntentRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;
const isIdemKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(v);
const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= PRICE_MAX_SATANG;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** ขอบของทุกฟังก์ชันสาธารณะ — error ที่ไม่คาดคิด = INTERNAL (คืน ไม่โยน) */
async function guard<T>(name: string, body: () => Promise<T>): Promise<T | PaymentIntentRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/payment-intent] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

async function runTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if ("$transaction" in db && typeof db.$transaction === "function") return (db as PrismaClient).$transaction((tx) => fn(tx), { timeout: 20_000, maxWait: 10_000 });
  return fn(db as Tx);
}

// ─────────────────── ตัวเสียบ Beam (CD-C · รูปเดียวกับ beamAdapter ของโมดูลบัญชี — ลอกแบบ ไม่ import) ───────────────────
export type PosBeamAdapter = {
  enabled: () => boolean;
  createCharge: (input: {
    amountSatang: number;
    referenceId: string;
    method: "promptpay" | "card";
    description?: string;
    returnUrl?: string;
  }) => Promise<{ chargeId: string; url?: string; qrPayload?: string | null } | { error: string }>;
};
const defaultBeam: PosBeamAdapter = {
  enabled: beamEnabled,
  createCharge: (input) => beamCreateCharge({ ...input, description: input.description ?? `SHARK POS ${input.referenceId}` }),
};
export type PaymentIntentDeps = { beam?: PosBeamAdapter };

// ─────────────────── ขอบเขต (ร้าน · ระบบ POS · สาขา · สิทธิ์ขาย) ───────────────────
type Scope = { tenantId: string; systemId: string; unitId: string; actor: IntentActor; settings: PosIntentSettings; unitPromptpayId?: string | null };

function actorOf(a: unknown): IntentActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

/** ด่านเดียวกับหน้าขาย: ระบบ POS ที่เปิดใช้ของร้าน · สาขาผูกระบบ · สาขาไม่เก็บถาวร · เข้าสาขาได้ = ไม่งั้น NOT_FOUND · ไม่มี pos.sale.create = PERMISSION_DENIED */
async function scopeOf(db: Db, ctx: unknown, actorRaw: unknown): Promise<Scope | PaymentIntentRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
  const { tenantId, systemId, unitId } = ctx as IntentCtx;
  const actor = actorOf(actorRaw);
  if (!actor) return refuse("PERMISSION_DENIED");
  const [sys, link, unit] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true, settings: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
  ]);
  if (!sys || !link || link.systemId !== systemId || !unit) return refuse("NOT_FOUND");
  if (!canAccessUnit(actor, unitId)) return refuse("NOT_FOUND");
  if (!evaluate(actor, { module: "pos", action: "pos.sale.create", unitId })) return refuse("PERMISSION_DENIED");
  // POS P1.18 ▸ มติ Q9: เลขพร้อมเพย์ของสาขานี้ (อ่านก่อน — โปรไฟล์ร้านเป็นทางสำรอง) ◂
  return { tenantId, systemId, unitId, actor, settings: parsePosIntentSettings(sys.settings), unitPromptpayId: promptpayIdForUnit(sys.settings, unitId) };
}

/** ctx.deviceId: ไม่ส่ง = undefined · ผิดรูป = false */
function ctxDevice(ctx: unknown): string | undefined | false {
  const v = isRecord(ctx) ? ctx.deviceId : undefined;
  if (v === undefined || v === null) return undefined;
  return isShiftDeviceId(v) ? v : false;
}

// ─────────────────── มุมมอง ───────────────────
const iso = (d: Date | null) => (d ? d.toISOString() : null);
function viewOf(r: PosPaymentIntent): PaymentIntentView {
  return {
    id: r.id,
    unitId: r.unitId,
    kind: r.kind as PaymentIntentKind,
    status: r.status as PaymentIntentStatus,
    amountSatang: r.amountSatang,
    qrPayload: r.qrPayload,
    expiresAt: r.expiresAt.toISOString(),
    paidAt: iso(r.paidAt),
    confirmedVia: (r.confirmedVia as PaymentIntentVia | null) ?? null,
    lateWebhook: r.lateWebhook,
    deviceId: r.deviceId,
    createdAt: r.createdAt.toISOString(),
  };
}
const kindMatches = (kind: string, method: "PROMPTPAY" | "CARD") => (method === "CARD" ? kind === "CARD_BEAM" : kind === "PROMPTPAY_STATIC" || kind === "PROMPTPAY_BEAM");
const newIntentId = () => `pi_${randomBytes(12).toString("base64url")}`;

/** PENDING ที่หมดเวลาแล้ว → EXPIRED แบบมีเงื่อนไข (เขียนจริง · CD-E) — คืนแถวล่าสุด */
async function lazyExpire(db: Db, r: PosPaymentIntent, now: Date): Promise<PosPaymentIntent> {
  if (r.status !== "PENDING" || r.expiresAt.getTime() >= now.getTime()) return r;
  await db.posPaymentIntent.updateMany({ where: { id: r.id, status: "PENDING", expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  return (await db.posPaymentIntent.findUnique({ where: { id: r.id } })) ?? r;
}

// ─────────────────── ① สร้าง ───────────────────
/**
 * สร้างใบขอรับเงิน (R2) — สิทธิ์ pos.sale.create · คีย์เดิม+ยอดเดิม = ใบเดิม (reused) · คีย์เดิม+ยอด/วิธีต่าง = IDEMPOTENCY_CONFLICT
 * PROMPTPAY: Beam (ร้านเปิด + กุญแจ) → PROMPTPAY_BEAM · ไม่งั้น/Beam ล้ม → PROMPTPAY_STATIC (EMV ล็อกยอด) · ไม่มีพร้อมเพย์ = PROMPTPAY_NOT_CONFIGURED
 * CARD: Beam เท่านั้น → CARD_BEAM (qrPayload = URL หน้าชำระ) · ไม่งั้น CARD_UNAVAILABLE (ไม่มีแถว)
 */
export async function createPaymentIntent(ctx: IntentCtx, actor: IntentActor, input: unknown, deps?: PaymentIntentDeps): Promise<CreatePaymentIntentResult> {
  return guard("createPaymentIntent", async (): Promise<CreatePaymentIntentResult> => {
    const s = await scopeOf(prisma, ctx, actor);
    if (isRefusal(s)) return s;
    const dev = ctxDevice(ctx);
    if (dev === false) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    if (!isRecord(input)) return refuse("VALIDATION");
    const { method, amountSatang, idempotencyKey, deviceId } = input;
    if (method !== "PROMPTPAY" && method !== "CARD") return refuse("VALIDATION", "ขอรับเงินได้เฉพาะพร้อมเพย์และบัตร");
    if (!isAmount(amountSatang)) return refuse("VALIDATION", "ยอดต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1");
    if (!isIdemKey(idempotencyKey)) return refuse("VALIDATION", "รหัสรายการไม่ถูกต้อง");
    if (!isShiftDeviceId(deviceId) || (dev !== undefined && dev !== deviceId)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    // P1.10: เครื่องที่ถูกเพิกถอนของสาขานี้ขอรับเงินไม่ได้
    if (await posDeviceRevoked(prisma, s.tenantId, s.unitId, deviceId)) return refuse("DEVICE_REVOKED");

    // คีย์เดิม (R2): ยอด+วิธี+สาขาเดิม = ใบเดิม · อย่างอื่น = ชน
    const reuse = async (): Promise<CreatePaymentIntentResult | null> => {
      const ex = await prisma.posPaymentIntent.findUnique({ where: { tenantId_idempotencyKey: { tenantId: s.tenantId, idempotencyKey } } });
      if (!ex) return null;
      if (ex.amountSatang !== amountSatang || ex.unitId !== s.unitId || ex.systemId !== s.systemId || !kindMatches(ex.kind, method)) return refuse("IDEMPOTENCY_CONFLICT");
      return { ok: true, intent: viewOf(await lazyExpire(prisma, ex, new Date())), reused: true };
    };
    const prior = await reuse();
    if (prior) return prior;

    const beam = deps?.beam ?? defaultBeam;
    const beamOn = s.settings.beam.enabled && safeEnabled(beam);
    const id = newIntentId();
    const referenceId = POS_BEAM_REF_PREFIX + id;
    let kind: PaymentIntentKind;
    let qrPayload: string;
    let beamChargeId: string | null = null;

    if (method === "CARD") {
      if (!beamOn) return refuse("CARD_UNAVAILABLE");
      const ch = await charge(beam, { amountSatang, referenceId, method: "card" });
      if ("error" in ch || !ch.url) {
        await logOps("WARN", OPS_SOURCE, `${OPS_BEAM_CARD_FAILED} — สร้างรายการบัตรผ่าน Beam ไม่สำเร็จ`, { tenantId: s.tenantId, detail: `ref ${referenceId} · ${"error" in ch ? ch.error : "no_url"}` });
        return refuse("CARD_UNAVAILABLE");
      }
      kind = "CARD_BEAM";
      qrPayload = ch.url;
      beamChargeId = ch.chargeId;
    } else {
      let viaBeam: { chargeId: string; qr: string } | null = null;
      if (beamOn) {
        const ch = await charge(beam, { amountSatang, referenceId, method: "promptpay" });
        if (!("error" in ch) && typeof ch.qrPayload === "string" && ch.qrPayload) viaBeam = { chargeId: ch.chargeId, qr: ch.qrPayload };
        else {
          // ปิดสุภาพ: Beam ล้ม/ไม่มี QR → QR พร้อมเพย์นิ่ง (ยืนยันเอง) + ops event ให้ทีมเห็น
          await logOps("WARN", OPS_SOURCE, `${OPS_BEAM_FALLBACK} — Beam สร้าง QR ไม่สำเร็จ ใช้ QR พร้อมเพย์นิ่งแทน`, {
            tenantId: s.tenantId,
            detail: `ref ${referenceId} · ${"error" in ch ? ch.error : "no_qr"}`,
          });
        }
      }
      if (viaBeam) {
        kind = "PROMPTPAY_BEAM";
        qrPayload = viaBeam.qr;
        beamChargeId = viaBeam.chargeId;
      } else {
        // มติ B: พร้อมเพย์ของร้าน = PaymentProfile.promptpayId (หนึ่งเลขต่อร้าน · เหมือนหน้าขายเดิม)
        // POS P1.18 ▸ มติ Q9: เลขของสาขา (settings.pos.payment.promptpayIdByUnit) มาก่อน · ไม่ตั้ง/ใช้ไม่ได้ = เลขของโปรไฟล์ ◂
        const unitPp = s.unitPromptpayId && isValidPromptPayId(s.unitPromptpayId) ? s.unitPromptpayId : null;
        const profile = unitPp ? null : await prisma.paymentProfile.findUnique({ where: { tenantId: s.tenantId }, select: { promptpayId: true } });
        const ppId = unitPp ?? (profile?.promptpayId ?? "").trim();
        if (!ppId || !isValidPromptPayId(ppId)) return refuse("PROMPTPAY_NOT_CONFIGURED");
        kind = "PROMPTPAY_STATIC";
        qrPayload = promptpayPayload({ id: ppId, amountSatang });
      }
    }

    const expiresAt = new Date(Date.now() + s.settings.qrExpiryMinutes * 60_000);
    try {
      const row = await prisma.posPaymentIntent.create({
        data: {
          id,
          tenantId: s.tenantId,
          unitId: s.unitId,
          systemId: s.systemId,
          kind,
          amountSatang,
          status: "PENDING",
          qrPayload,
          beamChargeId,
          deviceId,
          createdByUserId: s.actor.userId,
          expiresAt,
          idempotencyKey,
        },
      });
      return { ok: true, intent: viewOf(row), reused: false };
    } catch (e) {
      // คีย์เดียวกันพร้อมกันสองคำขอ: ผู้แพ้อ่านใบของผู้ชนะ (charge ของ Beam ที่สร้างเกินไม่มีใครเห็น — ไม่มีเงินเข้า)
      if ((e as { code?: unknown } | null)?.code === "P2002") {
        const again = await reuse();
        if (again) return again;
      }
      throw e;
    }
  });
}

function safeEnabled(b: PosBeamAdapter): boolean {
  try {
    return b.enabled() === true;
  } catch {
    return false;
  }
}
/** เรียก Beam (network) — throw = {error} (ไม่ให้หลุดเป็น INTERNAL) */
async function charge(b: PosBeamAdapter, input: Parameters<PosBeamAdapter["createCharge"]>[0]) {
  try {
    const r = await b.createCharge(input);
    if (!isRecord(r)) return { error: "beam_bad_response" };
    if ("error" in r) return { error: String(r.error) };
    if (!isId(r.chargeId)) return { error: "beam_bad_response" };
    return r;
  } catch (e) {
    return { error: `beam_throw: ${errText(e)}` };
  }
}

// ─────────────────── ② ยืนยันเงินเข้า ───────────────────
type PaidOpts = { via: PaymentIntentVia; beamRef?: string | null; amountSatang?: number; userId?: string | null };
type PaidOutcome =
  | { kind: "paid"; row: PosPaymentIntent; late: boolean }
  | { kind: "idempotent"; row: PosPaymentIntent }
  | { kind: "refuse"; code: PaymentIntentRefusalCode; row: PosPaymentIntent | null };

/**
 * แกนของการยืนยันเงินเข้า (ล็อกแถว FOR UPDATE) — PENDING → PAID (+ outbox intent_paid · + audit เมื่อยืนยันเอง)
 * scope = ต้องเป็นสาขานี้ (ยืนยันเอง) · refuseExpired = ยืนยันเองห้ามหลังหมดเวลา (webhook รับ เพราะเงินเข้าจริง · CD4)
 */
async function markPaidCore(id: string, o: PaidOpts, scope: { tenantId: string; unitId: string } | null, refuseExpired: boolean): Promise<PaidOutcome> {
  return runTx(prisma, async (tx): Promise<PaidOutcome> => {
    const got = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PosPaymentIntent" WHERE id = ${id} FOR UPDATE`;
    if (!got.length) return { kind: "refuse", code: "INTENT_NOT_FOUND", row: null };
    const r = await tx.posPaymentIntent.findUnique({ where: { id } });
    if (!r || (scope && (r.tenantId !== scope.tenantId || r.unitId !== scope.unitId))) return { kind: "refuse", code: "INTENT_NOT_FOUND", row: null };
    if (r.status === "PAID" || r.status === "CONSUMED") return { kind: "idempotent", row: r };
    if (r.status === "CANCELLED") return { kind: "refuse", code: "INTENT_CANCELLED", row: r };
    if (o.amountSatang !== undefined && o.amountSatang !== r.amountSatang) return { kind: "refuse", code: "AMOUNT_MISMATCH", row: r };
    const now = new Date();
    const late = r.status === "EXPIRED" || r.expiresAt.getTime() < now.getTime();
    if (late && refuseExpired) {
      if (r.status === "PENDING") await tx.posPaymentIntent.update({ where: { id }, data: { status: "EXPIRED" } });
      return { kind: "refuse", code: "INTENT_EXPIRED", row: r };
    }
    const row = await tx.posPaymentIntent.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: now,
        confirmedVia: o.via,
        confirmedByUserId: o.via === "MANUAL" ? (o.userId ?? null) : null,
        beamRef: o.via === "WEBHOOK" ? (o.beamRef ?? null) : r.beamRef,
        lateWebhook: late,
      },
    });
    // R6: หนึ่ง event ต่อการเปลี่ยน PENDING→PAID (คีย์ต่อ intent ⇒ ซ้ำไม่เพิ่มแถว) · จอลูกค้า (P2) ใช้ต่อ
    await emitOutbox(tx, {
      tenantId: r.tenantId,
      type: EV_INTENT_PAID,
      idempotencyKey: `PosPaymentIntent#${id}#PAID`,
      payload: { intentId: id, unitId: r.unitId, amountSatang: r.amountSatang, via: o.via, kind: r.kind, lateWebhook: late },
      systemId: r.systemId,
      unitId: r.unitId,
    });
    if (o.via === "MANUAL") {
      // CD2: ยืนยันเองต้องมีร่องรอยเสมอ (ในธุรกรรมเดียวกับการเปลี่ยนสถานะ)
      await tx.auditLog.create({
        data: {
          tenantId: r.tenantId,
          actorType: "USER",
          actorId: o.userId ?? null,
          action: AUD_MANUAL,
          targetType: "PosPaymentIntent",
          targetId: id,
          before: { status: r.status } as Prisma.InputJsonValue,
          after: { intentId: id, amountSatang: r.amountSatang, kind: r.kind, unitId: r.unitId } as Prisma.InputJsonValue,
        },
      });
    }
    return { kind: "paid", row, late };
  });
}

/** ops event ของผลที่ต้องให้คนดู (หลัง commit) */
async function opsAfter(out: PaidOutcome, o: PaidOpts): Promise<void> {
  if (out.kind !== "refuse" || !out.row) return;
  const r = out.row;
  if (out.code === "AMOUNT_MISMATCH") {
    await logOps("WARN", OPS_SOURCE, `${OPS_AMOUNT_MISMATCH} — ยอดที่แจ้งเข้าไม่ตรงกับใบขอรับเงิน (ยังไม่ยืนยัน)`, {
      tenantId: r.tenantId,
      detail: `intent ${r.id} · ยอดใบ ${r.amountSatang} · ยอดแจ้ง ${o.amountSatang} · via ${o.via}${o.beamRef ? ` · charge ${o.beamRef}` : ""}`,
    });
  } else if (out.code === "INTENT_CANCELLED") {
    // เงินเข้าหลังยกเลิก = ต้องคืนเงินลูกค้า (มติ J: ERROR)
    await logOps("ERROR", OPS_SOURCE, `${OPS_REFUND_NEEDED} — เงินเข้าหลังยกเลิกใบขอรับเงิน ต้องคืนเงินลูกค้า`, {
      tenantId: r.tenantId,
      detail: `intent ${r.id} · ยอด ${r.amountSatang} · via ${o.via}${o.beamRef ? ` · charge ${o.beamRef}` : ""}`,
    });
  }
}

/**
 * ยืนยันเงินเข้า (R3a · ใช้โดย webhook facade และตัวยืนยันเอง) — ไม่โยน
 * PENDING → PAID · PAID/CONSUMED → {ok, idempotent} · ยอดไม่ตรง → AMOUNT_MISMATCH (+ops WARN) · หมดเวลา/EXPIRED → PAID lateWebhook ·
 * CANCELLED → INTENT_CANCELLED (+ops refund_needed)
 */
export async function markIntentPaid(intentId: string, opts: PaidOpts): Promise<MarkIntentPaidResult> {
  return guard("markIntentPaid", async (): Promise<MarkIntentPaidResult> => {
    if (!isPaymentIntentId(intentId)) return refuse("INTENT_NOT_FOUND");
    if (!isRecord(opts) || (opts.via !== "WEBHOOK" && opts.via !== "MANUAL")) return refuse("VALIDATION");
    if (opts.amountSatang !== undefined && typeof opts.amountSatang !== "number") return refuse("VALIDATION");
    const out = await markPaidCore(intentId, opts, null, false);
    await opsAfter(out, opts);
    if (out.kind === "refuse") return refuse(out.code);
    if (out.kind === "idempotent") return { ok: true, idempotent: true, status: out.row.status as PaymentIntentStatus };
    return { ok: true, status: "PAID", lateWebhook: out.late };
  });
}

/**
 * ยืนยันเงินเข้าเอง (R3b · CD2) — pos.sale.create · ร้านตั้ง manualConfirmRequiresManager = ต้องมี pos.shift.manage ด้วย ·
 * หมดเวลา = INTENT_EXPIRED · จ่ายแล้ว = ok (ไม่มี audit/event ซ้ำ) · audit pos.payment.manual_confirm
 */
export async function confirmPaymentIntentManual(ctx: IntentCtx, actor: IntentActor, input: unknown): Promise<PaymentIntentActionResult> {
  return guard("confirmPaymentIntentManual", async (): Promise<PaymentIntentActionResult> => {
    const s = await scopeOf(prisma, ctx, actor);
    if (isRefusal(s)) return s;
    if (s.settings.manualConfirmRequiresManager && !evaluate(s.actor, { module: "pos", action: "pos.shift.manage", unitId: s.unitId })) {
      return refuse("PERMISSION_DENIED", "ร้านตั้งให้ผู้จัดการเป็นผู้ยืนยันเงินเข้าเท่านั้น");
    }
    const dev = ctxDevice(ctx);
    if (dev === false) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    if (dev && (await posDeviceRevoked(prisma, s.tenantId, s.unitId, dev))) return refuse("DEVICE_REVOKED");
    const intentId = isRecord(input) ? input.intentId : undefined;
    if (!isPaymentIntentId(intentId)) return refuse("INTENT_NOT_FOUND");
    // fix F3 (มติผู้คุมงาน): บัตรผ่าน Beam ยืนยันเองไม่ได้ (MANUAL_NOT_ALLOWED) · PromptPay ผ่าน Beam ยืนยันเองได้เฉพาะผู้มี pos.shift.manage · QR นิ่งเหมือนเดิม
    //   ชนิดของใบไม่เปลี่ยนหลังสร้าง ⇒ อ่านก่อนล็อกได้ (สาขาอื่น/ไม่มี = INTENT_NOT_FOUND เหมือนในล็อก)
    const pre = await prisma.posPaymentIntent.findUnique({ where: { id: intentId }, select: { tenantId: true, unitId: true, kind: true } });
    if (!pre || pre.tenantId !== s.tenantId || pre.unitId !== s.unitId) return refuse("INTENT_NOT_FOUND");
    if (pre.kind === "CARD_BEAM") return refuse("MANUAL_NOT_ALLOWED");
    if (pre.kind === "PROMPTPAY_BEAM" && !evaluate(s.actor, { module: "pos", action: "pos.shift.manage", unitId: s.unitId })) {
      return refuse("PERMISSION_DENIED", "QR ผ่าน Beam ยืนยันอัตโนมัติ — ยืนยันเองได้เฉพาะผู้จัดการ");
    }
    const opts: PaidOpts = { via: "MANUAL", userId: s.actor.userId };
    const out = await markPaidCore(intentId, opts, { tenantId: s.tenantId, unitId: s.unitId }, true);
    await opsAfter(out, opts);
    if (out.kind === "refuse") return refuse(out.code);
    return { ok: true, intent: viewOf(out.row), ...(out.kind === "idempotent" ? { idempotent: true } : {}) };
  });
}

/** ยกเลิก (R3c): PENDING → CANCELLED (+audit) · ยกเลิก/หมดอายุแล้ว = ok · PAID → INTENT_PAID · CONSUMED → INTENT_CONSUMED */
export async function cancelPaymentIntent(ctx: IntentCtx, actor: IntentActor, input: unknown): Promise<PaymentIntentActionResult> {
  return guard("cancelPaymentIntent", async (): Promise<PaymentIntentActionResult> => {
    const s = await scopeOf(prisma, ctx, actor);
    if (isRefusal(s)) return s;
    const intentId = isRecord(input) ? input.intentId : undefined;
    if (!isPaymentIntentId(intentId)) return refuse("INTENT_NOT_FOUND");
    const out = await runTx(prisma, async (tx): Promise<PaymentIntentActionResult> => {
      const got = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PosPaymentIntent" WHERE id = ${intentId} FOR UPDATE`;
      if (!got.length) return refuse("INTENT_NOT_FOUND");
      const r = await tx.posPaymentIntent.findUnique({ where: { id: intentId } });
      if (!r || r.tenantId !== s.tenantId || r.unitId !== s.unitId) return refuse("INTENT_NOT_FOUND");
      if (r.status === "PAID") return refuse("INTENT_PAID");
      if (r.status === "CONSUMED") return refuse("INTENT_CONSUMED");
      if (r.status !== "PENDING") return { ok: true, intent: viewOf(r), idempotent: true };
      const row = await tx.posPaymentIntent.update({ where: { id: intentId }, data: { status: "CANCELLED" } });
      await tx.auditLog.create({
        data: {
          tenantId: s.tenantId,
          actorType: "USER",
          actorId: s.actor.userId,
          action: AUD_CANCEL,
          targetType: "PosPaymentIntent",
          targetId: intentId,
          before: { status: r.status } as Prisma.InputJsonValue,
          after: { intentId, amountSatang: r.amountSatang, kind: r.kind, status: "CANCELLED" } as Prisma.InputJsonValue,
        },
      });
      return { ok: true, intent: viewOf(row) };
    });
    return out;
  });
}

/** อ่านสถานะสำหรับโพลของจอ (R5) — PENDING ที่หมดเวลา = เขียน EXPIRED ทันที (CD-E) · สาขาอื่น/ไม่มี = INTENT_NOT_FOUND */
export async function paymentIntentStatus(ctx: IntentCtx, actor: IntentActor, input: unknown): Promise<PaymentIntentStatusResult> {
  return guard("paymentIntentStatus", async (): Promise<PaymentIntentStatusResult> => {
    const s = await scopeOf(prisma, ctx, actor);
    if (isRefusal(s)) return s;
    const intentId = isRecord(input) ? input.intentId : undefined;
    if (!isPaymentIntentId(intentId)) return refuse("INTENT_NOT_FOUND");
    const found = await prisma.posPaymentIntent.findUnique({ where: { id: intentId } });
    if (!found || found.tenantId !== s.tenantId || found.unitId !== s.unitId) return refuse("INTENT_NOT_FOUND");
    const r = await lazyExpire(prisma, found, new Date());
    return {
      ok: true,
      status: r.status as PaymentIntentStatus,
      amountSatang: r.amountSatang,
      kind: r.kind as PaymentIntentKind,
      qrPayload: r.qrPayload,
      expiresAt: r.expiresAt.toISOString(),
      paidAt: iso(r.paidAt),
      confirmedVia: (r.confirmedVia as PaymentIntentVia | null) ?? null,
    };
  });
}

/** กวาด PENDING ที่หมดเวลา → EXPIRED (R5 · idempotent) — cron รายชั่วโมงเรียกแบบไม่ระบุร้าน */
export async function expirePaymentIntents(tenantId?: string, now: Date = new Date()): Promise<{ expired: number }> {
  const r = await prisma.posPaymentIntent.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now }, ...(typeof tenantId === "string" && tenantId ? { tenantId } : {}) },
    data: { status: "EXPIRED" },
  });
  return { expired: r.count };
}

// ─────────────────── ③ ใช้ intent ในบิล (register.ts เรียกในธุรกรรมขายของตัวเอง) ───────────────────
export type SaleIntentRef = { intentId: string; payType: "PROMPTPAY" | "CARD"; amountSatang: number };
export type SaleIntentRefusalCode = "VALIDATION" | "INTENT_NOT_FOUND" | "INTENT_NOT_PAID" | "INTENT_CONSUMED" | "INTENT_EXPIRED" | "AMOUNT_MISMATCH";

/**
 * R4: ล็อก intent ทุกใบของบิล (FOR UPDATE · เรียงตาม id กันล็อกไขว้) ในธุรกรรมขาย แล้วตรวจ:
 * ร้าน+สาขาเดียวกัน (ไม่ใช่ = INTENT_NOT_FOUND) · ชนิดตรงวิธีจ่าย (มติ G-a: ไม่ตรง = VALIDATION) · CONSUMED = INTENT_CONSUMED ·
 * ไม่ใช่ PAID = INTENT_NOT_PAID · ยอดต่าง = AMOUNT_MISMATCH · paidAt เกิน 24 ชม. = INTENT_EXPIRED (CD-F)
 * ผ่าน = คืน note ของแต่ละใบ ("via WEBHOOK" | "via MANUAL")
 */
export async function lockSaleIntents(
  tx: Tx,
  s: { tenantId: string; unitId: string },
  refs: SaleIntentRef[],
  now: Date = new Date(),
): Promise<{ ok: true; notes: Map<string, string> } | { ok: false; code: SaleIntentRefusalCode }> {
  const ids = [...new Set(refs.map((r) => r.intentId))].sort();
  if (ids.length !== refs.length) return { ok: false, code: "VALIDATION" };
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PosPaymentIntent" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  const rows = locked.length ? await tx.posPaymentIntent.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const notes = new Map<string, string>();
  for (const ref of refs) {
    const r = byId.get(ref.intentId);
    if (!r || r.tenantId !== s.tenantId || r.unitId !== s.unitId) return { ok: false, code: "INTENT_NOT_FOUND" };
    if (!kindMatches(r.kind, ref.payType)) return { ok: false, code: "VALIDATION" };
    if (r.status === "CONSUMED") return { ok: false, code: "INTENT_CONSUMED" };
    if (r.status !== "PAID" || !r.paidAt) return { ok: false, code: "INTENT_NOT_PAID" };
    if (r.amountSatang !== ref.amountSatang) return { ok: false, code: "AMOUNT_MISMATCH" };
    if (now.getTime() - r.paidAt.getTime() > PAYMENT_INTENT_CONSUME_WINDOW_MS) return { ok: false, code: "INTENT_EXPIRED" };
    notes.set(r.id, `via ${r.confirmedVia === "MANUAL" ? "MANUAL" : "WEBHOOK"}`);
  }
  return { ok: true, notes };
}

/** R4: หลัง createSale ในธุรกรรมเดียวกัน — intent → CONSUMED + saleId · PosPayment ที่อ้าง intent ได้ note "via …" (ไม่ครบ = โยน ให้ธุรกรรมย้อน) */
export async function consumeSaleIntents(tx: Tx, s: { tenantId: string; unitId: string }, saleId: string, notes: Map<string, string>): Promise<void> {
  const ids = [...notes.keys()];
  const upd = await tx.posPaymentIntent.updateMany({ where: { id: { in: ids }, tenantId: s.tenantId, unitId: s.unitId, status: "PAID" }, data: { status: "CONSUMED", saleId } });
  if (upd.count !== ids.length) throw new Error(`INTENT_CONSUMED: ใช้ intent ได้ ${upd.count}/${ids.length}`);
  for (const [id, note] of notes) {
    const p = await tx.posPayment.updateMany({ where: { tenantId: s.tenantId, saleId, reference: id, type: { in: ["PROMPTPAY", "CARD"] } }, data: { note } });
    if (p.count !== 1) throw new Error(`INTERNAL: แถวชำระเงินที่อ้าง ${id} = ${p.count}`);
  }
}
