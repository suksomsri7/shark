// ─────────────────────────────────────────────────────────────
// payment-request.ts — WO 5.5 · "ส่งลิงก์+QR PromptPay ให้ลูกค้า → จ่ายแล้วกระทบยอดอัตโนมัติ"
// อ้าง BLUEPRINT §0.3 ข้อ 5 · DESIGN-SPEC-V2 §5.3 (ปุ่ม "ส่ง") · §10.2 (กระทบยอด) · §14
//
// 🔴 ที่นี่เป็น "ตัวประสาน" เท่านั้น — ตรรกะเงิน/บัญชีของจริงอยู่ที่เดิมทั้งหมด ห้ามเขียน posting ใหม่:
//    รับชำระ+JV  → service.recordPayment (WO 1.4 · idempotencyKey/สถานะเอกสาร/VAT ตอนรับเงิน)
//    QR PromptPay → lib/payment/promptpay.ts (EMVCo + CRC16 มีอยู่แล้ว ไม่เขียนซ้ำ ไม่เพิ่ม dependency)
//    Beam         → lib/payment/beam.ts (createCharge/verifyWebhook)
//    กระทบยอด     → AccountBankStatementLine ของ WO 5.3 (สถานะ/ดัชนีเดียวกัน ไม่มีตารางใหม่)
//
// 2 โหมด — เลือกให้เองตามว่าแพลตฟอร์มตั้งกุญแจ Beam ครบไหม (prod ยังไม่ได้ตั้ง → ตกมาโหมดนิ่งเสมอ):
//   ① PROMPTPAY_BEAM (มีกุญแจครบ) — สร้าง charge จริง · ลูกค้าจ่าย · Beam ยิง webhook กลับ
//      → บันทึกรับชำระ + JV + จับคู่ statement ให้อัตโนมัติ + แจ้งทีมงาน
//   ② PROMPTPAY_STATIC (ไม่มีกุญแจ) — QR PromptPay ล็อกยอด ไม่มี webhook
//      → เงินเข้าจริงรู้ได้ 2 ทาง: คนกด "ยืนยันรับเงินแล้ว" ที่หน้าเอกสาร **หรือ**
//        ตอนนำเข้า statement เดือนนั้น ระบบเห็นแถวยอดตรง+วันอยู่ในกรอบ → บันทึกรับชำระ+จับคู่ให้เอง
//
// กติกาความปลอดภัย:
//   - token 128 บิต (randomBytes(16).base64url) = capability ของลิงก์สาธารณะ · ห้ามใส่ id ที่เดาได้ใน URL
//   - หน้าสาธารณะเปิดเผยเท่าที่จำเป็น (ชื่อกิจการ · เลขที่เอกสาร · ยอด · วันหมดอายุ) — **ห้ามมีข้อมูลลูกค้า**
//   - เงินเป็น satang integer ทุกจุด · ทุก query ผูก tenantId+systemId (ยกเว้นทางเข้า webhook/สาธารณะ
//     ที่ยังไม่รู้ร้าน — ตัว token/chargeId เองคือ scope แล้วอ่าน tenantId ของคำขอมาใช้ต่อ)
//   - กันซ้ำ 3 ชั้น: unique(providerChargeId) ชั้น DB · idempotencyKey ของ payment · เช็คสถานะคำขอ
// ─────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import type { AccountDocType, Prisma } from "@prisma/client";
// 🔴 ไฟล์นี้ **ไม่ import prisma ดิบ** (fitness F5) — ทุกการแตะ DB ผ่าน `tenantDb` (มี scope)
//    ทางเข้าที่ยังไม่รู้ร้าน (webhook / ลิงก์สาธารณะ / cron) ใช้ตัวเข้าถึงใน service.ts
import { tenantDb } from "@/lib/core/db";
import { beamEnabled, createCharge as beamCreateCharge } from "@/lib/payment/beam";
import { promptpayPayload, isValidPromptPayId } from "@/lib/payment/promptpay";
import {
  recordPayment,
  paymentTargetOf,
  getSettings,
  orgDisplayName,
  DOC_LABEL,
  selectAccountNotifyRecipients,
  findPaymentRequestById,
  findPaymentRequestByToken,
  expirePaymentRequestsAll,
} from "./service";
import { listFinanceAccounts } from "./finance";
import { writeAudit } from "./access";

export type PayReqCtx = { tenantId: string; systemId: string };
export type PayReqFail = { ok: false; reason: string };
const fail = (reason: string): PayReqFail => ({ ok: false, reason });

/** คำนำหน้า referenceId ที่ส่งให้ Beam — webhook ใช้แยกว่ารายการนี้เป็นของโมดูลบัญชี ไม่ใช่เติมเครดิต AI */
export const ACC_CHARGE_PREFIX = "acc:";

/** ชนิดเอกสารที่ขอเก็บเงินผ่านลิงก์ได้ (ฝั่งรายรับที่มีลูกหนี้ของตัวเอง)
 *
 * 🔴 **ไม่มีใบวางบิลรวม (BILLING_NOTE)** โดยตั้งใจ: เอกสารกลุ่มต้องรับชำระผ่าน `group.recordGroupPayment`
 *    ซึ่งกระจายเป็น payment + JV **หลายใบ** ⇒ แถว statement ก้อนเดียวจับคู่ 1:1 กับบรรทัดสมุดรายวันไม่ได้
 *    (คำมั่นหลักของ WO นี้คือ "จ่ายแล้วกระทบยอดอัตโนมัติ" — ถ้ารองรับ BN จะได้ครึ่ง ๆ กลาง ๆ)
 */
export const PAYMENT_REQUEST_DOC_TYPES: readonly AccountDocType[] = ["INVOICE", "DEPOSIT_RECEIPT", "DEBIT_NOTE"];

/** สถานะเอกสารที่ยัง "เก็บเงินได้" */
const OPEN_STATUSES = ["AWAITING_PAYMENT", "PARTIAL"] as const;

export const DEFAULT_EXPIRES_DAYS = 7;
const MAX_EXPIRES_DAYS = 90;
/** ช่วงวันที่ยอมให้คลาดได้ตอนจับคู่ statement — ต้องตรงกับ reconcile.MATCH_DAY_WINDOW (§10.2 "ยอด + วัน ±3") */
export const MATCH_DAY_WINDOW = 3;
const DAY_MS = 86_400_000;

/**
 * ตัวเสียบ Beam — ให้ข้อสอบสลับเป็นของปลอมได้โดยไม่ต้องมีกุญแจจริง
 * (prod ยังไม่มี BEAM_* ⇒ ทุกอย่างต้องเดินได้ผ่านตัวเสียบนี้ + webhook จำลอง)
 */
export const beamAdapter: {
  enabled: () => boolean;
  createCharge: typeof beamCreateCharge;
} = {
  enabled: beamEnabled,
  createCharge: beamCreateCharge,
};

// ─────────────────── ตัวช่วย ───────────────────

function newToken(): string {
  return randomBytes(16).toString("base64url"); // 128 บิต
}

function clampExpiresDays(v: number | null | undefined): number {
  const n = Math.round(Number(v ?? DEFAULT_EXPIRES_DAYS));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_EXPIRES_DAYS;
  return Math.min(MAX_EXPIRES_DAYS, n);
}

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });

/**
 * URL สาธารณะเต็มของคำขอ (ใช้ทั้งฝั่งเซิร์ฟเวอร์และแสดงในโมดัล)
 * 🔴 อ่าน `process.env.APP_URL` ตรง ๆ ไม่ผ่าน `@/lib/env` โดยตั้งใจ: `@/lib/env` ตรวจ env **ตอน import**
 *    ไฟล์นี้ถูกดึงผ่าน account/index → ai/tools ⇒ สคริปต์ตรวจ (fitness) ที่ไม่มี env ครบจะพังทันที
 */
export function paymentRequestUrl(token: string): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/pay/${token}`;
}

export type PaymentRequestView = {
  id: string;
  token: string;
  url: string;
  amountSatang: number;
  method: "PROMPTPAY_STATIC" | "PROMPTPAY_BEAM";
  methodLabel: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
  statusLabel: string;
  qrPayload: string | null;
  /** โหมด Beam: URL หน้าจ่ายของผู้ให้บริการ (เก็บใน qrPayload) */
  providerUrl: string | null;
  financeId: string;
  financeName: string | null;
  expiresAt: Date;
  paidAt: Date | null;
  paidAmountSatang: number | null;
  note: string | null;
  createdAt: Date;
};

export const PAYMENT_REQUEST_STATUS_LABEL: Record<PaymentRequestView["status"], string> = {
  PENDING: "รอชำระ",
  PAID: "ชำระแล้ว",
  EXPIRED: "หมดอายุ",
  CANCELLED: "ยกเลิก",
};

export const PAYMENT_REQUEST_METHOD_LABEL: Record<PaymentRequestView["method"], string> = {
  PROMPTPAY_STATIC: "QR พร้อมเพย์",
  PROMPTPAY_BEAM: "ลิงก์ชำระเงิน (พร้อมเพย์)",
};

type RawRequest = {
  id: string;
  token: string;
  amountSatang: number;
  method: PaymentRequestView["method"];
  status: PaymentRequestView["status"];
  qrPayload: string | null;
  provider: string | null;
  financeId: string;
  expiresAt: Date;
  paidAt: Date | null;
  paidAmountSatang: number | null;
  note: string | null;
  createdAt: Date;
};

function toView(r: RawRequest, financeName: string | null): PaymentRequestView {
  const isBeam = r.method === "PROMPTPAY_BEAM";
  return {
    id: r.id,
    token: r.token,
    url: paymentRequestUrl(r.token),
    amountSatang: r.amountSatang,
    method: r.method,
    methodLabel: PAYMENT_REQUEST_METHOD_LABEL[r.method],
    status: r.status,
    statusLabel: PAYMENT_REQUEST_STATUS_LABEL[r.status],
    qrPayload: isBeam ? null : r.qrPayload,
    providerUrl: isBeam ? r.qrPayload : null,
    financeId: r.financeId,
    financeName,
    expiresAt: r.expiresAt,
    paidAt: r.paidAt,
    paidAmountSatang: r.paidAmountSatang,
    note: r.note,
    createdAt: r.createdAt,
  };
}

// ─────────────────── ① สร้างคำขอชำระเงิน ───────────────────

export type CreatePaymentRequestResult =
  | { ok: true; request: PaymentRequestView; reused: boolean }
  | PayReqFail;

/**
 * สร้างลิงก์+QR เก็บเงินของเอกสาร 1 ใบ — ยอด = **ยอดคงค้างจริง ณ ตอนนี้** (ไม่รับยอดจาก browser)
 * มีคำขอที่ยังรอชำระ ยอดเท่ากัน ช่องทางเดียวกัน อยู่แล้ว → คืนใบเดิม (กดปุ่มซ้ำไม่งอกลิงก์เป็นพรวน)
 */
export async function createPaymentRequest(
  ctx: PayReqCtx,
  documentId: string,
  opts: { financeId: string; expiresInDays?: number | null; userId?: string | null },
): Promise<CreatePaymentRequestResult> {
  const found = await paymentTargetOf(ctx.tenantId, ctx.systemId, documentId);
  if (!found) return fail("ไม่พบเอกสาร");
  const { target } = found;
  if (!PAYMENT_REQUEST_DOC_TYPES.includes(target.docType))
    return fail("เอกสารชนิดนี้ยังขอเก็บเงินผ่านลิงก์ไม่ได้ (รองรับใบแจ้งหนี้ · ใบรับเงินมัดจำ · ใบเพิ่มหนี้)");
  if (!(OPEN_STATUSES as readonly string[]).includes(target.status))
    return fail("เอกสารนี้ไม่อยู่ในสถานะที่เก็บเงินได้ (ต้องออกเอกสารแล้วและยังค้างชำระ)");

  const outstanding = Math.max(0, target.grandTotal - target.paidTotal);
  if (outstanding <= 0) return fail("เอกสารนี้ไม่มียอดคงค้างแล้ว");

  const channels = await listFinanceAccounts(ctx.tenantId, ctx.systemId);
  const finance = channels.find((c) => c.id === opts.financeId);
  if (!finance) return fail("ช่องทางการเงินไม่ถูกต้อง");
  if (!finance.useForReceive) return fail(`ช่องทาง “${finance.name}” ตั้งไว้ว่าไม่ใช้รับเงิน — เลือกช่องทางอื่น`);
  if (finance.archivedAt) return fail(`ช่องทาง “${finance.name}” ถูกเก็บเข้ากรุแล้ว`);

  // ใบเดิมที่ยังใช้ได้ → คืนใบเดิม (idempotent ระดับผู้ใช้)
  const reusable = await tenantDb(ctx).accountPaymentRequest.findFirst({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      documentId: target.id,
      financeId: finance.id,
      status: "PENDING",
      amountSatang: outstanding,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (reusable) return { ok: true, request: toView(reusable as RawRequest, finance.name), reused: true };

  const expiresAt = new Date(Date.now() + clampExpiresDays(opts.expiresInDays) * DAY_MS);
  const token = newToken();
  let staticToken = token;
  const useBeam = beamAdapter.enabled();

  let method: PaymentRequestView["method"] = "PROMPTPAY_STATIC";
  let provider: string | null = null;
  let providerChargeId: string | null = null;
  let qrPayload: string | null = null;
  let note: string | null = null;

  if (useBeam) {
    // สร้าง "id ของคำขอ" ล่วงหน้าไม่ได้ (cuid ออกตอน create) ⇒ สร้างแถวก่อนแบบนิ่ง แล้วค่อยยิง charge
    // ทำแบบนี้เพื่อให้ referenceId = "acc:<id ของคำขอ>" ชี้กลับมาที่แถวจริงเสมอ (webhook หาเจอแน่)
    const draft = await tenantDb(ctx).accountPaymentRequest.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        documentId: target.id,
        financeId: finance.id,
        token,
        amountSatang: outstanding,
        method: "PROMPTPAY_BEAM",
        provider: "beam",
        expiresAt,
        createdById: opts.userId ?? null,
      },
    });
    // 🔴 `createCharge` เป็น network call — เน็ตล่ม/ปลายทางตาย = **throw** ไม่ใช่คืน {error}
    //    ถ้าไม่ครอบ try จะได้แถวร่างค้างในตาราง (PENDING ไม่มี chargeId) และผู้ใช้เห็นหน้าแดง
    const charge = await beamAdapter
      .createCharge({
        amountSatang: outstanding,
        referenceId: `${ACC_CHARGE_PREFIX}${draft.id}`,
        description: `${DOC_LABEL[target.docType] ?? target.docType} ${target.docNo ?? ""}`.trim(),
        returnUrl: paymentRequestUrl(token),
      })
      .catch((e: unknown) => ({ error: e instanceof Error ? e.message : "beam_unreachable" }));
    if ("error" in charge) {
      // ยิงไม่ผ่าน → ทิ้งใบร่างนี้ (ยังไม่มีใครเห็น) แล้วตกมาโหมด QR นิ่งให้ผู้ใช้ทำงานต่อได้
      await tenantDb(ctx).accountPaymentRequest.deleteMany({ where: { id: draft.id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
      staticToken = newToken(); // ลบไม่สำเร็จก็ยังสร้างใบใหม่ได้ (token ไม่ชนกัน)
    } else {
      const updated = await tenantDb(ctx).accountPaymentRequest.update({
        where: { id: draft.id },
        data: { providerChargeId: charge.chargeId, qrPayload: charge.url },
      });
      await writeAudit({
        tenantId: ctx.tenantId,
        actorId: opts.userId ?? null,
        action: "account.payment_request.create",
        targetType: "AccountPaymentRequest",
        targetId: updated.id,
        after: { documentId: target.id, amountSatang: outstanding, method: "PROMPTPAY_BEAM" },
      });
      return { ok: true, request: toView(updated as RawRequest, finance.name), reused: false };
    }
  }

  // ── โหมด QR นิ่ง ── PromptPay ID: ของช่องทางก่อน แล้วค่อยถอยไปช่องรับเงินระดับร้าน (PaymentProfile)
  const profile = await tenantDb(ctx).paymentProfile.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { promptpayId: true },
  });
  const ppId = (finance.promptpayId ?? profile?.promptpayId ?? "").trim();
  if (!ppId)
    return fail(
      `ช่องทาง “${finance.name}” ยังไม่ได้กรอกพร้อมเพย์ — ไปที่ การเงิน → แก้ไขช่องทาง แล้วกรอกเบอร์มือถือหรือเลขบัตรประชาชนก่อน`,
    );
  if (!isValidPromptPayId(ppId))
    return fail("พร้อมเพย์ของช่องทางนี้ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก");

  method = "PROMPTPAY_STATIC";
  provider = null;
  providerChargeId = null;
  qrPayload = promptpayPayload({ id: ppId, amountSatang: outstanding });
  note = "ยืนยันเมื่อเห็นยอดใน statement";

  const created = await tenantDb(ctx).accountPaymentRequest.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      documentId: target.id,
      financeId: finance.id,
      token: staticToken,
      amountSatang: outstanding,
      method,
      provider,
      providerChargeId,
      qrPayload,
      note,
      expiresAt,
      createdById: opts.userId ?? null,
    },
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: opts.userId ?? null,
    action: "account.payment_request.create",
    targetType: "AccountPaymentRequest",
    targetId: created.id,
    after: { documentId: target.id, amountSatang: outstanding, method },
  });
  return { ok: true, request: toView(created as RawRequest, finance.name), reused: false };
}

/** คำขอทั้งหมดของเอกสาร (ใหม่ก่อน) — ใช้ในหน้าเอกสาร */
export async function listPaymentRequests(ctx: PayReqCtx, documentId: string): Promise<PaymentRequestView[]> {
  const [rows, channels] = await Promise.all([
    tenantDb(ctx).accountPaymentRequest.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, documentId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    listFinanceAccounts(ctx.tenantId, ctx.systemId),
  ]);
  const nameById = new Map(channels.map((c) => [c.id, c.name]));
  return rows.map((r) => toView(r as RawRequest, nameById.get(r.financeId) ?? null));
}

/** ยกเลิกคำขอที่ยังรอชำระ (ลิงก์ที่ส่งออกไปแล้วใช้ไม่ได้ทันที) */
export async function cancelPaymentRequest(
  ctx: PayReqCtx,
  requestId: string,
  userId?: string | null,
): Promise<{ ok: true } | PayReqFail> {
  const res = await tenantDb(ctx).accountPaymentRequest.updateMany({
    where: { id: requestId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (res.count === 0) return fail("ยกเลิกไม่ได้ — คำขอนี้ไม่อยู่ในสถานะรอชำระแล้ว");
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: userId ?? null,
    action: "account.payment_request.cancel",
    targetType: "AccountPaymentRequest",
    targetId: requestId,
  });
  return { ok: true };
}

// ─────────────────── ② หน้าสาธารณะ /pay/<token> ───────────────────

export type PublicPaymentPage = {
  token: string;
  orgName: string;
  docLabel: string;
  docNo: string | null;
  amountSatang: number;
  /** สตริง EMVCo สำหรับวาด QR (โหมดนิ่ง) */
  qrPayload: string | null;
  /** โหมด Beam: ปุ่ม "ไปหน้าชำระเงิน" */
  providerUrl: string | null;
  status: PaymentRequestView["status"];
  statusLabel: string;
  expiresAt: Date;
  paidAt: Date | null;
  paidAmountSatang: number | null;
  expired: boolean;
};

/**
 * ข้อมูลหน้าสาธารณะจาก token (ไม่ต้องล็อกอิน — token คือ capability)
 * 🔴 คืนเฉพาะสิ่งที่ลูกค้าต้องเห็นเพื่อจ่ายเงิน — **ไม่มีชื่อ/ที่อยู่/เบอร์ของลูกค้า** และไม่มี id ภายใน
 * token ไม่รู้จัก → null (หน้าเว็บขึ้น "ลิงก์ไม่ถูกต้องหรือหมดอายุ" เหมือนกันหมด กันเดา token)
 */
export async function getPublicPaymentPage(token: string): Promise<PublicPaymentPage | null> {
  const t = String(token ?? "").trim();
  // token ของเราเป็น base64url 22 ตัว — ยาว/สั้นผิดรูป = ไม่ต้องแตะ DB
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return null;
  const req = await findPaymentRequestByToken(t);
  if (!req) return null;
  const settings = await getSettings(req.tenantId, req.systemId);
  const now = new Date();
  const expired = req.status === "EXPIRED" || (req.status === "PENDING" && req.expiresAt <= now);
  const status = expired && req.status === "PENDING" ? "EXPIRED" : req.status;
  const isBeam = req.method === "PROMPTPAY_BEAM";
  return {
    token: req.token,
    orgName: orgDisplayName(settings) || "ร้านค้า",
    docLabel: DOC_LABEL[req.document.docType] ?? req.document.docType,
    docNo: req.document.docNo,
    amountSatang: req.amountSatang,
    qrPayload: !isBeam && status === "PENDING" ? req.qrPayload : null,
    providerUrl: isBeam && status === "PENDING" ? req.qrPayload : null,
    status,
    statusLabel: PAYMENT_REQUEST_STATUS_LABEL[status],
    expiresAt: req.expiresAt,
    paidAt: req.paidAt,
    paidAmountSatang: req.paidAmountSatang,
    expired,
  };
}

// ─────────────────── ③ webhook: จ่ายแล้ว ───────────────────

export type HandlePaidResult =
  | { ok: true; requestId: string; paymentId: string | null; duplicated: boolean; matchedStatementLineId: string | null }
  | PayReqFail;

/** referenceId → id ของคำขอ (รูป "acc:<id>") · ไม่ใช่ของบัญชี = null */
export function parseAccountReference(referenceId: string): string | null {
  const s = String(referenceId ?? "");
  if (!s.startsWith(ACC_CHARGE_PREFIX)) return null;
  const id = s.slice(ACC_CHARGE_PREFIX.length).trim();
  return /^[A-Za-z0-9_-]{10,40}$/.test(id) ? id : null;
}

/**
 * Beam แจ้งว่าลูกค้าจ่ายแล้ว → บันทึกรับชำระ + JV + จับคู่ statement + แจ้งทีมงาน
 * **idempotent ต่อ chargeId**: ยิงซ้ำกี่รอบก็ได้ payment ใบเดียว (คีย์ `pp:<chargeId>` + unique providerChargeId)
 */
export async function handleBeamPaid(input: {
  referenceId: string;
  chargeId: string;
  paidSatang: number;
}): Promise<HandlePaidResult> {
  const chargeId = String(input.chargeId ?? "").trim();
  if (!chargeId) return fail("ไม่มีเลขที่รายการชำระเงิน");
  const requestId = parseAccountReference(input.referenceId);
  if (!requestId) return fail("รหัสอ้างอิงไม่ใช่ของโมดูลบัญชี");

  const req = await findPaymentRequestById(requestId);
  if (!req) return fail("ไม่พบคำขอชำระเงิน");
  if (req.method !== "PROMPTPAY_BEAM") return fail("คำขอนี้ไม่ได้เปิดผ่านผู้ให้บริการ");
  if (req.providerChargeId && req.providerChargeId !== chargeId) return fail("เลขที่รายการชำระเงินไม่ตรงกับคำขอ");

  const ctx: PayReqCtx = { tenantId: req.tenantId, systemId: req.systemId };

  // ── กันซ้ำ: เคยบันทึกด้วยคีย์นี้แล้ว = คืนผลเดิมเงียบ ๆ (ห้ามบันทึกเงินซ้ำเด็ดขาด) ──
  const key = `pp:${chargeId}`;
  const done = await tenantDb(ctx).accountDocumentPayment.findFirst({
    where: { idempotencyKey: key, tenantId: req.tenantId, systemId: req.systemId },
    select: { id: true },
  });
  if (done) return { ok: true, requestId: req.id, paymentId: done.id, duplicated: true, matchedStatementLineId: req.statementLineId };
  if (req.status === "CANCELLED") return fail("คำขอนี้ถูกยกเลิกไปแล้ว");

  const paid = Math.round(Number(input.paidSatang ?? 0));
  if (!Number.isFinite(paid) || paid < 1) return fail("ยอดที่จ่ายต้องมากกว่า 0");

  const found = await paymentTargetOf(req.tenantId, req.systemId, req.documentId);
  if (!found) return fail("ไม่พบเอกสารของคำขอนี้");
  const { target } = found;
  const outstanding = Math.max(0, target.grandTotal - target.paidTotal);
  if (outstanding <= 0) return fail("เอกสารนี้ไม่มียอดคงค้างแล้ว");

  // จ่ายเกิน = บันทึกได้แค่ "ยอดคงค้าง" (ลูกหนี้ห้ามติดลบ) + จดส่วนเกินไว้ให้คนตามคืนเงินเอง
  const overpay = Math.max(0, paid - outstanding);
  const amount = Math.min(paid, outstanding);
  const noteParts = ["พร้อมเพย์ผ่านลิงก์"];
  if (overpay > 0) noteParts.push(`เกิน ฿${baht(overpay)}`);

  const rec = await recordPayment(req.tenantId, req.systemId, target.id, {
    paidAt: new Date(),
    channel: "PROMPTPAY",
    financeAccountId: req.financeId,
    amount,
    note: noteParts.join(" · ").slice(0, 20),
    createdById: req.createdById,
    idempotencyKey: key,
    paymentRequestId: req.id,
  });
  if (!rec.ok) return fail(rec.reason);

  await tenantDb(ctx).accountPaymentRequest.update({
    where: { id: req.id },
    data: {
      status: "PAID",
      providerChargeId: chargeId,
      paidAt: new Date(),
      paidAmountSatang: paid,
      paymentId: rec.paymentId ?? null,
      note: overpay > 0 ? `ลูกค้าจ่ายเกิน ฿${baht(overpay)} — ติดต่อคืนเงิน` : req.note,
    },
  });

  const matchedStatementLineId = rec.paymentId ? await linkPaymentToStatement(ctx, rec.paymentId, req.id) : null;
  await notifyPaid(ctx, { docLabel: DOC_LABEL[target.docType] ?? target.docType, docNo: target.docNo, amount, status: rec.status });
  await writeAudit({
    tenantId: req.tenantId,
    actorId: req.createdById,
    action: "account.payment_request.paid",
    targetType: "AccountPaymentRequest",
    targetId: req.id,
    after: { chargeId, paidSatang: paid, recorded: amount, docStatus: rec.status, matchedStatementLineId },
  });
  return { ok: true, requestId: req.id, paymentId: rec.paymentId ?? null, duplicated: false, matchedStatementLineId };
}

/** Beam แจ้งว่าไม่สำเร็จ/หมดอายุ — แตะแค่สถานะคำขอ ไม่ยุ่งกับเงินหรือบัญชี */
export async function handleBeamFailed(input: {
  referenceId: string;
  status: "FAILED" | "EXPIRED" | "CANCELLED";
}): Promise<{ ok: true; requestId: string; changed: boolean } | PayReqFail> {
  const requestId = parseAccountReference(input.referenceId);
  if (!requestId) return fail("รหัสอ้างอิงไม่ใช่ของโมดูลบัญชี");
  const next = input.status === "FAILED" ? "CANCELLED" : input.status;
  const req = await findPaymentRequestById(requestId);
  if (!req) return fail("ไม่พบคำขอชำระเงิน");
  const res = await tenantDb({ tenantId: req.tenantId, systemId: req.systemId }).accountPaymentRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: next },
  });
  return { ok: true, requestId, changed: res.count > 0 };
}

// ─────────────────── ④ ยืนยันรับเงินเอง (โหมด QR นิ่ง) ───────────────────

/**
 * คน (staff) กด "ยืนยันรับเงินแล้ว" ที่หน้าเอกสาร — เส้นทางเงินเดียวกับ webhook เป๊ะ
 * คีย์กันซ้ำ `pp-manual:<requestId>` ⇒ กดรัวไม่บันทึกซ้ำ
 */
export async function confirmStaticPaymentRequest(
  ctx: PayReqCtx,
  requestId: string,
  opts?: { userId?: string | null; paidAt?: Date },
): Promise<{ ok: true; paymentId: string | null; duplicated: boolean } | PayReqFail> {
  const req = await tenantDb(ctx).accountPaymentRequest.findFirst({
    where: { id: requestId, tenantId: ctx.tenantId, systemId: ctx.systemId },
  });
  if (!req) return fail("ไม่พบคำขอชำระเงิน");
  if (req.method !== "PROMPTPAY_STATIC") return fail("คำขอนี้ระบบยืนยันให้อัตโนมัติเมื่อผู้ให้บริการแจ้งผล");

  const key = `pp-manual:${req.id}`;
  const done = await tenantDb(ctx).accountDocumentPayment.findFirst({
    where: { idempotencyKey: key, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true },
  });
  if (done) return { ok: true, paymentId: done.id, duplicated: true };
  if (req.status !== "PENDING") return fail("คำขอนี้ไม่อยู่ในสถานะรอชำระแล้ว");

  const found = await paymentTargetOf(ctx.tenantId, ctx.systemId, req.documentId);
  if (!found) return fail("ไม่พบเอกสารของคำขอนี้");
  const { target } = found;
  const outstanding = Math.max(0, target.grandTotal - target.paidTotal);
  if (outstanding <= 0) return fail("เอกสารนี้ไม่มียอดคงค้างแล้ว");
  const amount = Math.min(req.amountSatang, outstanding);

  const rec = await recordPayment(ctx.tenantId, ctx.systemId, target.id, {
    paidAt: opts?.paidAt ?? new Date(),
    channel: "PROMPTPAY",
    financeAccountId: req.financeId,
    amount,
    note: "พร้อมเพย์ (ยืนยันเอง)",
    createdById: opts?.userId ?? null,
    idempotencyKey: key,
    paymentRequestId: req.id,
  });
  if (!rec.ok) return fail(rec.reason);

  await tenantDb(ctx).accountPaymentRequest.update({
    where: { id: req.id },
    data: { status: "PAID", paidAt: opts?.paidAt ?? new Date(), paidAmountSatang: amount, paymentId: rec.paymentId ?? null },
  });
  if (rec.paymentId) await linkPaymentToStatement(ctx, rec.paymentId, req.id);
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: opts?.userId ?? null,
    action: "account.payment_request.confirm",
    targetType: "AccountPaymentRequest",
    targetId: req.id,
    after: { documentId: target.id, amountSatang: amount, docStatus: rec.status },
  });
  return { ok: true, paymentId: rec.paymentId ?? null, duplicated: false };
}

// ─────────────────── ⑤ กระทบยอดอัตโนมัติ ───────────────────

/**
 * หลังบันทึกรับชำระ: ถ้าแถว statement ของช่องทางนั้น "มีอยู่แล้ว" (นำเข้าไฟล์ไปก่อนแล้ว) และยอด+วันตรง
 * → ผูกให้เป็น MATCHED ทันที · ยังไม่มีแถว = ไม่ต้องทำอะไร (พอ import ทีหลัง `reconcile.autoMatch` จะจับให้เอง
 *   เพราะบรรทัดสมุดรายวันของการรับเงินนี้อยู่ในฝั่งระบบแล้ว) — ตรวจทั้ง 2 ทางในข้อสอบ
 * คืน id ของแถว statement ที่จับคู่ได้ (null = ยังไม่มี)
 */
async function linkPaymentToStatement(ctx: PayReqCtx, paymentId: string, requestId: string): Promise<string | null> {
  const payment = await tenantDb(ctx).accountDocumentPayment.findFirst({
    where: { id: paymentId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, amount: true, paidAt: true, financeAccountId: true },
  });
  if (!payment?.financeAccountId) return null;

  const channels = await listFinanceAccounts(ctx.tenantId, ctx.systemId);
  const finance = channels.find((c) => c.id === payment.financeAccountId);
  if (!finance?.ledgerAccountId) return null;

  // 🔴 หา JV ของการรับเงินจาก `refType/refId` **ไม่ใช่** `AccountDocumentPayment.entryId`
  //    (คอลัมน์นั้น gl.postPayment ไม่ได้เขียนกลับ — ยังเป็น null · ตัวจับคู่ของ WO 5.3
  //     ก็ใช้ refType/refId เหมือนกัน ⇒ ใช้ทางเดียวกันถึงจะตรงกันเสมอ)
  const entry = await tenantDb(ctx).accountJournalEntry.findFirst({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      refType: "AccountDocumentPayment",
      refId: payment.id,
      status: { not: "REVERSED" },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (!entry) return null;

  // บรรทัดสมุดรายวันฝั่ง "เงินเข้า" ของ JV การรับเงินใบนี้
  const jvLine = await tenantDb(ctx).accountJournalLine.findFirst({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      entryId: entry.id,
      accountId: finance.ledgerAccountId,
      reconciledAt: null,
    },
    select: { id: true, debit: true, credit: true },
  });
  if (!jvLine) return null;
  const signed = jvLine.debit - jvLine.credit;

  const from = new Date(payment.paidAt.getTime() - MATCH_DAY_WINDOW * DAY_MS);
  const to = new Date(payment.paidAt.getTime() + (MATCH_DAY_WINDOW + 1) * DAY_MS);
  const line = await tenantDb(ctx).accountBankStatementLine.findFirst({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      financeId: finance.id,
      status: { in: ["UNMATCHED", "SUGGESTED"] },
      amountSatang: signed,
      txDate: { gte: from, lt: to },
      matchedLineId: null,
      statement: { confirmedAt: null },
    },
    orderBy: [{ txDate: "asc" }, { seq: "asc" }],
    select: { id: true },
  });
  if (!line) return null;

  const now = new Date();
  await tenantDb(ctx).$transaction(async (tx) => {
    await tx.accountBankStatementLine.updateMany({
      where: { id: line.id, tenantId: ctx.tenantId, systemId: ctx.systemId, matchedLineId: null },
      data: {
        status: "MATCHED",
        matchedLineId: jvLine.id,
        matchedEntryId: entry.id,
        suggestedLineId: null,
        suggestedEntryId: null,
        suggestedHint: null,
        matchedAt: now,
      },
    });
    await tx.accountJournalLine.updateMany({
      where: { id: jvLine.id, tenantId: ctx.tenantId, systemId: ctx.systemId, reconciledAt: null },
      data: { reconciledAt: now, reconciledStatementLineId: line.id },
    });
  });
  await tenantDb(ctx).accountPaymentRequest.updateMany({
    where: { id: requestId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: { statementLineId: line.id },
  });
  return line.id;
}

export type StatementLineForSettle = {
  id: string;
  amountSatang: number;
  txDate: Date;
  status: string;
  matchedLineId: string | null;
};

export type SettleFromStatementResult = { settled: number; requestIds: string[] };

/**
 * 🔗 ตะขอสำหรับ `reconcile.autoMatch` (WO 5.3): แถว statement เงินเข้าที่ยอด+วันตรงกับ
 * "คำขอ QR นิ่งที่ยังรอชำระ" = ลูกค้าโอนมาแล้วจริง → บันทึกรับชำระ + JV ให้เลย
 * (ตัวจับคู่รอบปกติที่รันต่อจากนี้จะเห็นบรรทัดสมุดรายวันใหม่ วันตรงเป๊ะ แล้วจับคู่ให้เอง)
 *
 * 🔴 ต้องถูกเรียก **ก่อน** `listSystemEntries` ของ autoMatch เสมอ ไม่งั้นบรรทัดที่เพิ่งสร้างจะตกสำรวจรอบนี้
 * idempotent: บันทึกด้วยคีย์ `pp-stmt:<lineId>` ⇒ รัน autoMatch ซ้ำไม่เกิดเงินซ้ำ
 */
export async function settleStaticRequestsFromStatement(
  ctx: PayReqCtx,
  financeId: string,
  lines: StatementLineForSettle[],
): Promise<SettleFromStatementResult> {
  const open = lines.filter((l) => l.amountSatang > 0 && !l.matchedLineId && (l.status === "UNMATCHED" || l.status === "SUGGESTED"));
  if (open.length === 0) return { settled: 0, requestIds: [] };

  const pending = await tenantDb(ctx).accountPaymentRequest.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      financeId,
      status: "PENDING",
      method: "PROMPTPAY_STATIC",
    },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return { settled: 0, requestIds: [] };

  const used = new Set<string>();
  const requestIds: string[] = [];
  for (const line of open) {
    // ยอดต้องตรงเป๊ะเสมอ · วันของแถวต้องอยู่ใน "ช่วงที่ลิงก์ใช้ได้" (สร้าง−3 วัน … หมดอายุ+3 วัน)
    // 🔴 ไม่ใช้ ±3 วันจากวันสร้างอย่างเดียว: ลิงก์อายุ 7–30 วัน ลูกค้าจ่ายวันที่ 5 ต้องจับได้ด้วย
    const req = pending.find(
      (r) =>
        !used.has(r.id) &&
        r.amountSatang === line.amountSatang &&
        line.txDate.getTime() >= r.createdAt.getTime() - MATCH_DAY_WINDOW * DAY_MS &&
        line.txDate.getTime() <= r.expiresAt.getTime() + MATCH_DAY_WINDOW * DAY_MS,
    );
    if (!req) continue;
    used.add(req.id);

    const key = `pp-stmt:${line.id}`;
    const done = await tenantDb(ctx).accountDocumentPayment.findFirst({
      where: { idempotencyKey: key, tenantId: ctx.tenantId, systemId: ctx.systemId },
      select: { id: true },
    });
    if (done) continue;

    const found = await paymentTargetOf(ctx.tenantId, ctx.systemId, req.documentId);
    if (!found) continue;
    const { target } = found;
    const outstanding = Math.max(0, target.grandTotal - target.paidTotal);
    if (outstanding <= 0) continue;
    const amount = Math.min(line.amountSatang, outstanding);

    const rec = await recordPayment(ctx.tenantId, ctx.systemId, target.id, {
      // 🔴 วันที่ต้องเป็น "วันที่ในสเตทเมนต์" ไม่ใช่วันนี้ — ตัวจับคู่รอบที่ 1 ต้องเห็นวันตรงเป๊ะ
      paidAt: line.txDate,
      channel: "PROMPTPAY",
      financeAccountId: req.financeId,
      amount,
      note: "พร้อมเพย์ (จาก statement)",
      createdById: req.createdById,
      idempotencyKey: key,
      paymentRequestId: req.id,
    });
    if (!rec.ok) continue;

    await tenantDb(ctx).accountPaymentRequest.update({
      where: { id: req.id },
      data: {
        status: "PAID",
        paidAt: line.txDate,
        paidAmountSatang: line.amountSatang,
        paymentId: rec.paymentId ?? null,
        statementLineId: line.id,
      },
    });
    requestIds.push(req.id);
    await notifyPaid(ctx, {
      docLabel: DOC_LABEL[target.docType] ?? target.docType,
      docNo: target.docNo,
      amount,
      status: rec.status,
    });
    await writeAudit({
      tenantId: ctx.tenantId,
      actorId: req.createdById,
      action: "account.payment_request.paid",
      targetType: "AccountPaymentRequest",
      targetId: req.id,
      after: { source: "statement", statementLineId: line.id, amountSatang: amount, docStatus: rec.status },
    });
  }
  return { settled: requestIds.length, requestIds };
}

// ─────────────────── ⑥ หมดอายุ (cron) ───────────────────

/** ปิดคำขอที่เลยวันหมดอายุ — ปลอดภัยต่อการรันซ้ำ (แตะเฉพาะแถวที่ยัง PENDING) */
export async function expireRequests(now: Date = new Date()): Promise<{ expired: number }> {
  return { expired: await expirePaymentRequestsAll(now) };
}

/** จำนวน "คำขอ QR นิ่งที่รอยืนยันรับเงิน" — การ์ด "งานที่รอคุณ" บนหน้าหลัก */
export async function pendingStaticRequestCount(ctx: PayReqCtx, now: Date = new Date()): Promise<number> {
  return tenantDb(ctx).accountPaymentRequest.count({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: "PENDING",
      method: "PROMPTPAY_STATIC",
      expiresAt: { gt: now },
    },
  });
}

// ─────────────────── แจ้งเตือนทีมงาน ───────────────────

/**
 * "ลูกค้าจ่ายแล้ว ฿… ใบ IV-…" → AppNotification ถึงคนที่มีสิทธิ์รับเงินจริงเท่านั้น
 * (fail-closed เหมือน WO 1.9 — ห้ามเขียนแบบประกาศทั้งร้าน เพราะข้อความมีเลขที่เอกสาร+ยอดเงิน)
 * แจ้งเตือนล้ม ห้ามทำให้เงินที่บันทึกไปแล้วพัง → ครอบ try/catch
 */
async function notifyPaid(
  ctx: PayReqCtx,
  info: { docLabel: string; docNo: string | null; amount: number; status: string },
): Promise<void> {
  try {
    const to = await selectAccountNotifyRecipients(ctx.tenantId, "account.payment.record");
    if (to.length === 0) return;
    const title = "ลูกค้าจ่ายแล้ว (พร้อมเพย์)";
    const body = `รับเงิน ฿${baht(info.amount)} · ${info.docLabel} ${info.docNo ?? ""} · ${
      info.status === "PAID" ? "ชำระครบแล้ว" : "ชำระบางส่วน"
    }`.replace(/\s+/g, " ");
    const data: Prisma.AppNotificationCreateManyInput[] = to.map((userId) => ({
      tenantId: ctx.tenantId,
      recipientUserId: userId,
      title,
      body,
    }));
    await tenantDb(ctx).appNotification.createMany({ data });
  } catch {
    // แจ้งเตือนล้มเหลวห้ามทำให้การรับเงินพัง
  }
}
