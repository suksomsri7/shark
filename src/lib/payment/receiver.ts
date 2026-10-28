// ─────────────────────────────────────────────────────────────
// payment/receiver.ts — ผู้รับเงินของสาขา + QR พร้อมเพย์ยอดล็อก (SVC R0.6 · CC §3.3 · ใบสั่ง §3) — ฝั่งเซิร์ฟเวอร์เท่านั้น
//
// ลำดับหาผู้รับ: ค่าตั้ง `payments.receiver` (UNIT → TENANT ผ่าน resolveSettings) → PaymentProfile ของร้าน → null
//   รูปค่าของ payments.receiver (มติใบ R0.6): { promptpayId, displayName?, bankAccount? } หรือ { paymentProfileId, labelTh? }
//   🔴 paymentProfileId ต้องเป็นของ ctx.tenantId (อ่าน tenantId ของแถว) · promptpayId ต้องผ่าน isValidPromptPayId — ไม่ผ่าน = ไม่นับ
//      (ค่าชั้นสาขาที่ไม่นับ ⇒ ตกไป PaymentProfile ของร้าน · resolveSettings คืนแค่ชั้นบนสุด จึงไม่ย้อนไปอ่านชั้น TENANT แยก)
// 🔴 ไม่มีผลเงิน · ไม่ import POS/บัญชี · ไม่ฝัง ref ใน payload (QR พร้อมเพย์บุคคลไม่รับประกัน ref — ผู้เรียกเก็บเอง)
// ─────────────────────────────────────────────────────────────
import QRCode from "qrcode";
import { prisma } from "@/lib/core/db";
import { resolveSettings } from "@/lib/core/settings";
import { isValidPromptPayId, promptpayPayload } from "./promptpay";
import type { SlipCtx, SlipRefusal } from "./slip-shared";

export type Receiver = { promptpayId: string; displayName: string; bankAccount?: string };
export type PromptpayQrResult = { ok: true; payload: string; svgDataUrl: string; displayName: string } | SlipRefusal;

/** เพดานยอด QR = ฿99,999,999.99 (ช่อง 54 ของ EMV) */
export const PROMPTPAY_QR_MAX_SATANG = 9_999_999_999;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.normalize("NFKC").trim();
  return t && t.length <= max ? t : undefined;
};
const errName = (e: unknown) => (e instanceof Error ? e.name : "Error");

const MESSAGES: Record<SlipRefusal["code"], string> = {
  NOT_FOUND: "ไม่พบสาขานี้ในร้าน",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้",
  VALIDATION: "ยอดเงินสำหรับสร้าง QR ไม่ถูกต้อง",
  INVALID_STATE: "รายการนี้อยู่ในสถานะที่ทำต่อไม่ได้",
  IDEMPOTENCY_CONFLICT: "รายการนี้ถูกส่งไปแล้วด้วยข้อมูลอื่น",
  STORAGE_NOT_CONFIGURED: "ระบบยังไม่ได้ตั้งที่เก็บไฟล์",
  NO_RECEIVER: "ร้านยังไม่ได้ตั้งบัญชีพร้อมเพย์สำหรับรับเงิน — ตั้งได้ที่หน้าตั้งค่ารับเงิน",
  DUPLICATE: "รายการนี้ซ้ำกับรายการเดิม",
  UNKNOWN: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",
};
const refuse = (code: SlipRefusal["code"], message?: string): SlipRefusal => ({ ok: false, code, message: message ?? MESSAGES[code] });

/** unit นี้เป็นของร้านไหม */
async function unitOfTenant(tenantId: string, unitId: unknown): Promise<boolean> {
  if (typeof unitId !== "string" || !ID_RE.test(unitId)) return false;
  return (await prisma.businessUnit.count({ where: { id: unitId, tenantId } })) === 1;
}

/** ค่าตั้ง payments.receiver ของสาขา (อ่านไม่ได้/ยังไม่มีเครื่องยนต์ค่าตั้ง ⇒ null) */
async function receiverSetting(tenantId: string, unitId: string): Promise<unknown> {
  try {
    const r = await resolveSettings({ tenantId }, ["payments.receiver"], { unitId });
    return r["payments.receiver"]?.value ?? null;
  } catch (e) {
    console.error("[payment.receiver] settings", errName(e));
    return null;
  }
}

async function tenantName(tenantId: string): Promise<string> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return t?.name ?? "";
}

/** แปลงค่าตั้งเป็นผู้รับ — ไม่ผ่านเงื่อนไขข้อใด ⇒ null (ตกชั้นถัดไป) */
async function fromSetting(tenantId: string, v: unknown): Promise<Receiver | null> {
  if (!isRec(v)) return null;
  if (typeof v.paymentProfileId === "string") {
    const id = v.paymentProfileId;
    if (!ID_RE.test(id)) return null;
    // 🔴 โปรไฟล์ต้องเป็นของร้านนี้ (carry R0.3/R0.8) — ของร้านอื่น = ไม่นับ
    const pp = await prisma.paymentProfile.findFirst({ where: { id, tenantId }, select: { promptpayId: true, displayName: true } });
    if (!pp?.promptpayId || !isValidPromptPayId(pp.promptpayId)) return null;
    return { promptpayId: pp.promptpayId, displayName: str(v.labelTh, 80) ?? str(pp.displayName, 120) ?? (await tenantName(tenantId)) };
  }
  const pid = str(v.promptpayId, 32);
  if (!pid || !isValidPromptPayId(pid)) return null;
  const bank = str(v.bankAccount, 32);
  const out: Receiver = { promptpayId: pid, displayName: str(v.displayName, 120) ?? (await tenantName(tenantId)) };
  if (bank && /\d{4,}/.test(bank.replace(/\D/g, ""))) out.bankAccount = bank;
  return out;
}

/**
 * ผู้รับเงินของสาขา — unit ไม่ใช่ของร้าน/ไม่มีผู้รับ ⇒ null · ไม่ throw
 */
export async function receiverFor(ctx: SlipCtx, unitId: string): Promise<Receiver | null> {
  try {
    if (!isRec(ctx) || typeof ctx.tenantId !== "string" || !ID_RE.test(ctx.tenantId)) return null;
    const tenantId = ctx.tenantId;
    if (!(await unitOfTenant(tenantId, unitId))) return null;
    const viaSetting = await fromSetting(tenantId, await receiverSetting(tenantId, unitId));
    if (viaSetting) return viaSetting;
    const pp = await prisma.paymentProfile.findUnique({ where: { tenantId }, select: { promptpayId: true, displayName: true } });
    if (!pp?.promptpayId || !isValidPromptPayId(pp.promptpayId)) return null;
    return { promptpayId: pp.promptpayId, displayName: str(pp.displayName, 120) ?? (await tenantName(tenantId)) };
  } catch (e) {
    console.error("[payment.receiver] receiverFor", errName(e));
    return null;
  }
}

/**
 * QR พร้อมเพย์แบบล็อกยอด (dynamic) ไปยังผู้รับของสาขา — คืนคำปฏิเสธ ไม่ throw
 * ยอด = จำนวนเต็มสตางค์ 1..9,999,999,999 · unit ร้านอื่น ⇒ NOT_FOUND · ไม่มีผู้รับ ⇒ NO_RECEIVER
 */
export async function promptpayQrFor(ctx: SlipCtx, input: { unitId: string; amountSatang: number; ref: string }): Promise<PromptpayQrResult> {
  try {
    if (!isRec(ctx) || typeof ctx.tenantId !== "string" || !ID_RE.test(ctx.tenantId)) return refuse("NOT_FOUND");
    if (!isRec(input)) return refuse("VALIDATION");
    const a = input.amountSatang;
    if (typeof a !== "number" || !Number.isSafeInteger(a) || a < 1 || a > PROMPTPAY_QR_MAX_SATANG) return refuse("VALIDATION");
    if (input.ref !== undefined && (typeof input.ref !== "string" || input.ref.length > 128)) return refuse("VALIDATION", "รหัสอ้างอิงไม่ถูกต้อง");
    if (!(await unitOfTenant(ctx.tenantId, input.unitId))) return refuse("NOT_FOUND");
    const rc = await receiverFor(ctx, input.unitId);
    if (!rc) return refuse("NO_RECEIVER");
    const payload = promptpayPayload({ id: rc.promptpayId, amountSatang: a });
    const svg = await QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { ok: true, payload, svgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`, displayName: rc.displayName };
  } catch (e) {
    console.error("[payment.receiver] promptpayQrFor", errName(e));
    return refuse("UNKNOWN");
  }
}
