// tax-invoice-shared.ts — ใบกำกับภาษีเต็มรูปของบิล POS (P1.13 · R1 R9) : ตัวแกะผู้ซื้อ + รหัสปฏิเสธ + คีย์ข้อความ
//
// 🔴 บริสุทธิ์ + ใช้ร่วม client: ห้าม import prisma / server-only / next/* / ไฟล์ฝั่งเซิร์ฟเวอร์ของ pos (P1.13U ใช้ตรวจฟอร์มก่อนส่ง)
// 🔴 ผู้ซื้อ (R1) = {kind, name, taxId, branchCode, address, email, source} — คีย์อื่น = VALIDATION · เลขผู้เสียภาษีผิดทุกแบบ = TAX_ID_INVALID (มติ 6)
//    ตัดช่องว่างหัวท้ายทุกช่อง · branchCode ปริยาย "00000" (สำนักงานใหญ่) · email ปริยาย null · source ปริยาย "MANUAL"
// 🔴 เลขผู้เสียภาษีไทย 13 หลัก ตรวจหลักตรวจ mod-11 ตามกรมสรรพากร: Σ(หลักที่ i × (13 − i)) i = 0..11 → (11 − Σ mod 11) mod 10 = หลักที่ 13

export type TaxInvoiceBuyerKind = "PERSON" | "JURISTIC";
export type TaxInvoiceBuyerSource = "MANUAL" | "DBD" | "PROFILE";

/** ผู้ซื้อที่แกะแล้ว (ไม่มีคีย์อื่นเกิน) */
export type TaxInvoiceBuyer = {
  kind: TaxInvoiceBuyerKind;
  name: string;
  taxId: string;
  branchCode: string;
  address: string;
  email: string | null;
  source: TaxInvoiceBuyerSource;
};
/** ผู้ซื้อที่ส่งเข้ามา (ก่อนแกะ) — branchCode/email/source ไม่ส่งได้ */
export type TaxInvoiceBuyerInput = {
  kind: TaxInvoiceBuyerKind;
  name: string;
  taxId: string;
  branchCode?: string | null;
  address: string;
  email?: string | null;
  source?: TaxInvoiceBuyerSource;
};
/** สำเนาบนบิล (PosSale.taxInvoice) = ผู้ซื้อ + เวลาที่ขอ (ISO) */
export type TaxInvoiceSnapshot = TaxInvoiceBuyer & { requestedAt: string };

/** รหัสปฏิเสธของใบนี้ทั้งหมด (R9 · {ok:false, code, message ไทย} · ไม่ throw) */
export const TAX_INVOICE_REFUSAL_CODES = [
  "VALIDATION",
  "TAX_ID_INVALID",
  "TOO_LATE",
  "SALE_VOIDED",
  "ALREADY_ISSUED",
  "NOT_ELIGIBLE",
  "ACCOUNT_PENDING",
  "HAS_REFUNDS",
  "PERMISSION_DENIED",
  "SALE_NOT_FOUND",
  "NOT_FOUND",
  "DBD_NOT_CONFIGURED",
  "DBD_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export type TaxInvoiceRefusalCode = (typeof TAX_INVOICE_REFUSAL_CODES)[number];
export type TaxInvoiceRefusal = { ok: false; code: TaxInvoiceRefusalCode; message: string };

/** ข้อความไทยของเซิร์ฟเวอร์ (ไว้ดูใน log/AI) — จอใช้ taxInvoiceRefusalKey(code) → pos.taxInvoice.errors.* */
export const TAX_INVOICE_MESSAGES: Readonly<Record<TaxInvoiceRefusalCode, string>> = {
  VALIDATION: "ข้อมูลผู้ซื้อไม่ครบหรือไม่ถูกต้อง — ตรวจชื่อ ที่อยู่ สาขา และอีเมลอีกครั้ง",
  TAX_ID_INVALID: "เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลักที่หลักตรวจถูกต้อง)",
  TOO_LATE: "บิลนี้ชำระเกิน 7 วันแล้ว — ออกใบกำกับภาษีเต็มรูปจากหน้าขายไม่ได้ ให้ฝ่ายบัญชีออกเอกสารแทน",
  SALE_VOIDED: "บิลนี้ถูกยกเลิกแล้ว — ออกใบกำกับภาษีไม่ได้",
  ALREADY_ISSUED: "บิลนี้ออกใบกำกับภาษีเต็มรูปให้ผู้ซื้อรายอื่นไปแล้ว",
  NOT_ELIGIBLE: "จุดขายนี้ยังไม่ได้ผูกสมุดบัญชีที่จดภาษีมูลค่าเพิ่ม (ใบกำกับอย่างย่อ) — ออกใบกำกับภาษีเต็มรูปไม่ได้",
  ACCOUNT_PENDING: "ระบบบัญชียังบันทึกบิลนี้ไม่เสร็จ — รอสักครู่แล้วลองใหม่",
  HAS_REFUNDS: "บิลนี้มีการคืนเงินแล้ว — ออกใบกำกับภาษีเต็มรูปหลังคืนเงินไม่ได้ ให้ฝ่ายบัญชีออกเอกสารแทน",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ออกใบกำกับภาษีเต็มรูป — ขอสิทธิ์จากเจ้าของร้าน",
  SALE_NOT_FOUND: "ไม่พบบิลนี้ (อาจเป็นของสาขาอื่น)",
  NOT_FOUND: "ไม่พบคำขอนี้ (อาจเป็นของสาขาอื่น)",
  DBD_NOT_CONFIGURED: "ยังไม่ได้เชื่อมบริการค้นหานิติบุคคลของกรมพัฒนาธุรกิจการค้า — กรอกข้อมูลผู้ซื้อเอง",
  DBD_UNAVAILABLE: "ตอนนี้ค้นข้อมูลจากกรมพัฒนาธุรกิจการค้าไม่ได้ — กรอกข้อมูลผู้ซื้อเองไปก่อน",
  RATE_LIMITED: "ค้นหาบ่อยเกินไป — รอสักครู่แล้วลองใหม่",
  INTERNAL: "ระบบใบกำกับภาษีขัดข้องชั่วคราว — ลองอีกครั้ง",
};

export const taxInvoiceRefuse = (code: TaxInvoiceRefusalCode, message?: string): TaxInvoiceRefusal => ({ ok: false, code, message: message ?? TAX_INVOICE_MESSAGES[code] });

/** ออกเต็มรูปทีหลังได้ภายในกี่วันนับจากเวลาชำระ (R3) */
export const TAX_INVOICE_LATE_DAYS = 7;
/** เพดานค้นกรมพัฒน์ฯ ต่อสาขาต่อนาที (R5 · มติ 11) */
export const TAX_INVOICE_DBD_PER_MINUTE = 30;
/** เพดานรวมต่อร้านต่อนาที (fix F2) */
export const TAX_INVOICE_DBD_PER_MINUTE_TENANT = 100;
export const TAX_INVOICE_NAME_MAX = 120;
export const TAX_INVOICE_ADDRESS_MAX = 300;
export const TAX_INVOICE_EMAIL_MAX = 120;
/** สำนักงานใหญ่ */
export const HEAD_OFFICE_BRANCH_CODE = "00000";

const BUYER_KEYS: ReadonlySet<string> = new Set(["kind", "name", "taxId", "branchCode", "address", "email", "source"]);
const KINDS: readonly string[] = ["PERSON", "JURISTIC"];
const SOURCES: readonly string[] = ["MANUAL", "DBD", "PROFILE"];
/** อีเมลแบบเบา: มี @ หนึ่งตัว ส่วนหน้าไม่ว่าง ส่วนหลังมีจุด ไม่มีช่องว่าง */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const NO_CTRL = /[\u0000-\u0008\u000B-\u001F\u007F]/;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** ความยาวแบบนับรหัสอักขระ (ไม่นับ surrogate คู่เป็น 2) */
const textLength = (s: string) => Array.from(s).length;

/** เลขผู้เสียภาษีไทย 13 หลัก mod-11 (กรมสรรพากร) — สตริงตัวเลข 13 ตัวเท่านั้น */
export function isValidThaiTaxIdChecksum(id: unknown): boolean {
  if (typeof id !== "string" || !/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

/** ปิดเลข (audit · log) — "xxxxxxxxx" + 4 ตัวท้าย · ค่าที่สั้นกว่า 4 ตัว = ปิดทั้งหมด */
export function maskTaxId(id: unknown): string {
  const s = typeof id === "string" ? id.replace(/\s/g, "") : "";
  return s.length >= 4 ? `xxxxxxxxx${s.slice(-4)}` : "xxxxxxxxx";
}

/** ชนิดผู้ซื้อจากเลข (คำขอ P1.11 ไม่มี kind — มติ 7): นิติบุคคลไทยขึ้นต้นด้วย 0 */
export const buyerKindFromTaxId = (taxId: string): TaxInvoiceBuyerKind => (taxId.startsWith("0") ? "JURISTIC" : "PERSON");

type ParseResult = { ok: true; buyer: TaxInvoiceBuyer } | { ok: false; code: "VALIDATION" | "TAX_ID_INVALID"; message: string };

/**
 * แกะ/ตรวจผู้ซื้อ (R1) — {ok:true, buyer} | {ok:false, code VALIDATION|TAX_ID_INVALID, message} · ไม่ throw
 * ลำดับ: รูปร่าง/คีย์ → kind → ชื่อ → ที่อยู่ → สาขา → อีเมล → source → เลขผู้เสียภาษี
 */
export function parseTaxInvoiceBuyer(input: unknown): ParseResult {
  const bad = (message?: string): ParseResult => ({ ok: false, code: "VALIDATION", message: message ?? TAX_INVOICE_MESSAGES.VALIDATION });
  if (!isRecord(input)) return bad();
  for (const k of Object.keys(input)) if (!BUYER_KEYS.has(k) && input[k] !== undefined) return bad("มีข้อมูลที่ไม่รู้จักปนมากับข้อมูลผู้ซื้อ");
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : null);

  if (typeof input.kind !== "string" || !KINDS.includes(input.kind)) return bad("เลือกชนิดผู้ซื้อ (บุคคลธรรมดา / นิติบุคคล)");
  const kind = input.kind as TaxInvoiceBuyerKind;

  const name = str(input.name);
  if (!name || textLength(name) > TAX_INVOICE_NAME_MAX || NO_CTRL.test(name)) return bad(`ชื่อผู้ซื้อต้องมี 1–${TAX_INVOICE_NAME_MAX} ตัวอักษร`);

  const address = str(input.address);
  if (!address || textLength(address) > TAX_INVOICE_ADDRESS_MAX || NO_CTRL.test(address)) return bad(`ที่อยู่ผู้ซื้อต้องมี 1–${TAX_INVOICE_ADDRESS_MAX} ตัวอักษร`);

  let branchCode = HEAD_OFFICE_BRANCH_CODE;
  if (input.branchCode !== undefined && input.branchCode !== null) {
    const b = str(input.branchCode);
    if (b === null || !/^\d{5}$/.test(b)) return bad("รหัสสาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)");
    branchCode = b;
  }

  let email: string | null = null;
  if (input.email !== undefined && input.email !== null) {
    const e = str(input.email);
    if (e === null) return bad("อีเมลไม่ถูกต้อง");
    if (e) {
      if (e.length > TAX_INVOICE_EMAIL_MAX || !EMAIL_RE.test(e)) return bad("อีเมลไม่ถูกต้อง");
      email = e;
    }
  }

  let source: TaxInvoiceBuyerSource = "MANUAL";
  if (input.source !== undefined && input.source !== null) {
    if (typeof input.source !== "string" || !SOURCES.includes(input.source)) return bad("ที่มาของข้อมูลผู้ซื้อไม่ถูกต้อง");
    source = input.source as TaxInvoiceBuyerSource;
  }

  const taxId = str(input.taxId);
  if (!taxId || !isValidThaiTaxIdChecksum(taxId)) return { ok: false, code: "TAX_ID_INVALID", message: TAX_INVOICE_MESSAGES.TAX_ID_INVALID };

  return { ok: true, buyer: { kind, name, taxId, branchCode, address, email, source } };
}

/** ผู้ซื้อคนเดียวกันไหม (มติ 5 — ยิงซ้ำ = คืนเอกสารเดิม) · ไม่นับ source/requestedAt */
export function sameTaxInvoiceBuyer(a: Pick<TaxInvoiceBuyer, "kind" | "name" | "taxId" | "branchCode" | "address" | "email">, b: Pick<TaxInvoiceBuyer, "kind" | "name" | "taxId" | "branchCode" | "address" | "email">): boolean {
  return a.kind === b.kind && a.name === b.name && a.taxId === b.taxId && a.branchCode === b.branchCode && a.address === b.address && (a.email ?? null) === (b.email ?? null);
}

/** สำเนาบนบิล (PosSale.taxInvoice) ที่อ่านกลับมา → ผู้ซื้อ (รูปผิด = null) */
export function snapshotBuyer(v: unknown): TaxInvoiceSnapshot | null {
  if (!isRecord(v)) return null;
  const { requestedAt, ...rest } = v;
  const p = parseTaxInvoiceBuyer(rest);
  if (!p.ok) return null;
  return { ...p.buyer, requestedAt: typeof requestedAt === "string" ? requestedAt : "" };
}

const camel = (code: string) => code.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const REFUSAL_KEYS: ReadonlySet<string> = new Set(TAX_INVOICE_REFUSAL_CODES);

/** รหัสปฏิเสธ → คีย์ข้อความใต้ `pos` (มติ 13): "taxInvoice.errors.<camel>" · รหัสที่ไม่รู้จัก = "taxInvoice.errors.unknown" */
export function taxInvoiceRefusalKey(code: string): string {
  return typeof code === "string" && REFUSAL_KEYS.has(code) ? `taxInvoice.errors.${camel(code)}` : "taxInvoice.errors.unknown";
}
