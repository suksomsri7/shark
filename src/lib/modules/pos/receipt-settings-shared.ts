// receipt-settings-shared.ts — ค่าตั้งใบเสร็จของระบบ POS (P1.10 · มติ R4) · ตัวตรวจบริสุทธิ์ + ชนิดข้อมูล
//
// 🔴 client import ได้ (หน้า 17A ของ P1.10U) — ห้าม import prisma/server/next
// ที่เก็บ: `AppSystem(POS).settings.pos.receipt` · ชื่อ/ที่อยู่/เลขผู้เสียภาษีว่าง = ใช้โปรไฟล์ของสมุดบัญชีที่ผูก POS (receipt.ts)
// รูปแบบเลขใบเสร็จ / ใบลดหนี้ "ไม่ใช่" ค่าตั้ง (O2 · P1.8 R4)
import type { PosFieldRefusal } from "./device-shared";

export const RECEIPT_NAME_MAX = 80;
export const RECEIPT_PHONE_MAX = 30;
export const RECEIPT_ADDRESS_MAX = 200;
export const RECEIPT_FOOTER_MAX = 200;
export const RECEIPT_LOGO_URL_MAX = 500;
export const RECEIPT_FOOTER_DEFAULT = "ขอบคุณที่อุดหนุนค่ะ";

export type PosReceiptHeader = { name?: string; phone?: string; address?: string; logoUrl: string | null };
export type PosReceiptSettings = {
  header: PosReceiptHeader;
  footer: string;
  showPoints: boolean;
  showCashier: boolean;
  qrEReceipt: boolean;
  /** POS P1.11 ▸ มติผู้คุมงาน 5: บอร์ดงานที่รับเรื่อง "แจ้งปัญหาบิล" จากหน้าใบเสร็จออนไลน์ (KanbanBoard.id) · null = ไม่เปิดการ์ด (ไม่มี fallback) ◂ */
  issueBoardId?: string | null;
};
export type PosReceiptSettingsPatch = {
  header?: { name?: string | null; phone?: string | null; address?: string | null; logoUrl?: string | null };
  footer?: string;
  showPoints?: boolean;
  showCashier?: boolean;
  qrEReceipt?: boolean;
  issueBoardId?: string | null; // POS P1.11
};
export type ParseReceiptSettingsResult = { ok: true; settings: PosReceiptSettings } | PosFieldRefusal;
export type PosReceiptSettingsRefusal = { ok: false; code: "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "UNKNOWN"; message: string; field?: string };
export type PosReceiptSettingsResult = { ok: true; settings: PosReceiptSettings } | PosReceiptSettingsRefusal;

export const POS_RECEIPT_DEFAULTS: Readonly<PosReceiptSettings> = Object.freeze({
  header: Object.freeze({ logoUrl: null }) as PosReceiptHeader,
  footer: RECEIPT_FOOTER_DEFAULT,
  showPoints: true,
  showCashier: true,
  qrEReceipt: true,
});

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const bad = (field: string, message: string): PosFieldRefusal => ({ ok: false, code: "VALIDATION", message, field });
/** ไม่มี NUL / ตัวควบคุม (ยกเว้นขึ้นบรรทัดในที่อยู่/ท้ายใบ) */
const clean = (s: string, multiline: boolean) => !(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/).test(s);
/** ความยาวเป็นตัวอักษร (code point) — สระ/วรรณยุกต์ไทยนับเป็นตัว */
const len = (s: string) => [...s].length;

/** ข้อความไม่บังคับ: undefined/null/ว่าง = ไม่ตั้ง (ใช้ค่าจากสมุดบัญชี) · เกิน/ผิดชนิด = false */
function optText(v: unknown, max: number, multiline = false): string | undefined | false {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (!t) return undefined;
  if (len(t) > max || !clean(t, multiline)) return false;
  return t;
}

/** URL รูปโลโก้: https เท่านั้น (หน้าพิมพ์โหลดผ่าน https · ftp:/javascript:/data:/ข้อความอื่น = ผิด) · null/ว่าง = ไม่มีโลโก้ */
function logoOf(v: unknown): string | null | false {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (!t) return null;
  if (t.length > RECEIPT_LOGO_URL_MAX || !/^https:\/\/[^\s/?#]+\.[^\s/?#]+[^\s]*$/i.test(t) || !clean(t, false)) return false;
  return t;
}

/**
 * ค่าตั้งใบเสร็จจาก JSON (R4) — undefined/null/{} = ค่าปริยาย · คีย์ที่ไม่รู้จักถูกทิ้ง · ค่าผิด = VALIDATION + ชื่อฟิลด์
 * (ฟิลด์: name · phone · address · logoUrl · footer · showPoints · showCashier · qrEReceipt)
 */
export function parseReceiptSettings(json: unknown): ParseReceiptSettingsResult {
  if (json === undefined || json === null) return { ok: true, settings: defaults() };
  if (!isRecord(json)) return { ok: false, code: "VALIDATION", message: "ค่าตั้งใบเสร็จต้องเป็นออบเจกต์" };
  const h = json.header;
  if (h !== undefined && h !== null && !isRecord(h)) return bad("header", "header: ต้องเป็นออบเจกต์");
  const hr: Record<string, unknown> = isRecord(h) ? h : {};
  const header: PosReceiptHeader = { logoUrl: null };
  const name = optText(hr.name, RECEIPT_NAME_MAX);
  if (name === false) return bad("name", `name: ชื่อร้านบนใบเสร็จยาวได้ไม่เกิน ${RECEIPT_NAME_MAX} ตัวอักษร`);
  const phone = optText(hr.phone, RECEIPT_PHONE_MAX);
  if (phone === false) return bad("phone", `phone: เบอร์โทรยาวได้ไม่เกิน ${RECEIPT_PHONE_MAX} ตัวอักษร`);
  const address = optText(hr.address, RECEIPT_ADDRESS_MAX, true);
  if (address === false) return bad("address", `address: ที่อยู่ยาวได้ไม่เกิน ${RECEIPT_ADDRESS_MAX} ตัวอักษร`);
  const logo = logoOf(hr.logoUrl);
  if (logo === false) return bad("logoUrl", "logoUrl: ลิงก์โลโก้ต้องขึ้นต้นด้วย https://");
  if (name !== undefined) header.name = name;
  if (phone !== undefined) header.phone = phone;
  if (address !== undefined) header.address = address;
  header.logoUrl = logo;

  let footer = RECEIPT_FOOTER_DEFAULT;
  if (json.footer !== undefined && json.footer !== null) {
    if (typeof json.footer !== "string") return bad("footer", "footer: ต้องเป็นข้อความ");
    const t = json.footer.trim();
    if (len(t) > RECEIPT_FOOTER_MAX || !clean(t, true)) return bad("footer", `footer: ข้อความท้ายใบเสร็จยาวได้ไม่เกิน ${RECEIPT_FOOTER_MAX} ตัวอักษร`);
    footer = t; // ว่าง = ไม่พิมพ์ข้อความท้าย (ตั้งใจ)
  }
  const out: PosReceiptSettings = { header, footer, showPoints: true, showCashier: true, qrEReceipt: true, issueBoardId: null };
  for (const k of ["showPoints", "showCashier", "qrEReceipt"] as const) {
    const v = json[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== "boolean") return bad(k, `${k}: ต้องเป็นจริง/เท็จ`);
    out[k] = v;
  }
  // POS P1.11 ▸ บอร์ดรับเรื่องแจ้งปัญหาบิล: id ของบอร์ด (ตรวจรูปแบบอย่างเดียว — consumer ตรวจว่าบอร์ดยังอยู่) · ว่าง/null = ไม่มี ◂
  const ib = json.issueBoardId;
  if (ib !== undefined && ib !== null) {
    if (typeof ib !== "string" || ib.trim().length > 64 || !/^[A-Za-z0-9_-]*$/.test(ib.trim())) return bad("issueBoardId", "issueBoardId: รหัสบอร์ดงานไม่ถูกต้อง");
    out.issueBoardId = ib.trim() || null;
  }
  return { ok: true, settings: out };
}

function defaults(): PosReceiptSettings {
  return { header: { logoUrl: null }, footer: RECEIPT_FOOTER_DEFAULT, showPoints: true, showCashier: true, qrEReceipt: true, issueBoardId: null };
}

/** รวม patch (บางส่วน) ทับค่าปัจจุบัน — header รวมรายฟิลด์ (null/ว่าง = ล้างฟิลด์นั้น) · ผลต้องผ่าน parseReceiptSettings อีกรอบ */
export function mergeReceiptSettings(cur: PosReceiptSettings, patch: PosReceiptSettingsPatch): Record<string, unknown> {
  const header: Record<string, unknown> = { ...cur.header };
  if (isRecord(patch.header)) for (const [k, v] of Object.entries(patch.header)) header[k] = v;
  const next: Record<string, unknown> = { ...cur, header };
  for (const k of ["footer", "showPoints", "showCashier", "qrEReceipt", "issueBoardId"] as const) if (patch[k] !== undefined) next[k] = patch[k];
  return next;
}

// ═══════════ POS P2.11 ▸ ตัวตนบนใบเสร็จต่อสาขา (brief P2.11 §4 · มติ 4 14 15) ═══════════
// ที่เก็บ: `AppSystem(POS).settings.pos.receipt.byUnit.<unitId> = {taxBranchNo?, address?, phone?}` (JSON · ไม่มี migration)
// ลำดับบนใบเสร็จ (receipt.ts): สาขาที่ = ค่าของสาขา → branchCode ของสมุด → "00000" (เฉพาะใบกำกับ ABB/เต็มรูป — RECEIPT ไม่พิมพ์สาขา) ·
//   ที่อยู่/โทร = ค่าของสาขา → หัวใบของระบบ → สมุด · รูปแบบเลขใบเสร็จไม่เปลี่ยน (O2)

/** สาขาตามกรมสรรพากร = ตัวเลข 5 หลัก (00000 = สำนักงานใหญ่) */
export const TAX_BRANCH_NO_RE = /^\d{5}$/;
export const RECEIPT_UNIT_KEYS = ["taxBranchNo", "address", "phone"] as const;
export type PosReceiptUnitOverride = { taxBranchNo: string | null; address: string | null; phone: string | null };
export type PosReceiptUnitPatch = { taxBranchNo?: string | null; address?: string | null; phone?: string | null };
export type PosReceiptUnitResult = { ok: true; unitId: string; override: PosReceiptUnitOverride } | PosReceiptSettingsRefusal;
export const RECEIPT_UNIT_NONE: Readonly<PosReceiptUnitOverride> = Object.freeze({ taxBranchNo: null, address: null, phone: null });

/**
 * ค่าของสาขาจาก `settings` ทั้งก้อนของ AppSystem(POS) — อ่านอย่างปลอดภัย (ไม่มี/พัง = null ทีละช่อง · ใบเสร็จต้องพิมพ์ได้เสมอ)
 * taxBranchNo ต้องเป็นตัวเลข 5 หลัก · address ≤ RECEIPT_ADDRESS_MAX · phone ≤ RECEIPT_PHONE_MAX
 */
export function receiptUnitOverride(settings: unknown, unitId: string): PosReceiptUnitOverride {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const rc = pos && isRecord(pos.receipt) ? pos.receipt : null;
  const by = rc && isRecord(rc.byUnit) ? rc.byUnit : null;
  const u = by && typeof unitId === "string" && Object.prototype.hasOwnProperty.call(by, unitId) && isRecord(by[unitId]) ? (by[unitId] as Record<string, unknown>) : null;
  if (!u) return { ...RECEIPT_UNIT_NONE };
  const tb = typeof u.taxBranchNo === "string" && TAX_BRANCH_NO_RE.test(u.taxBranchNo) ? u.taxBranchNo : null;
  const ad = optText(u.address, RECEIPT_ADDRESS_MAX, true);
  const ph = optText(u.phone, RECEIPT_PHONE_MAX);
  return { taxBranchNo: tb, address: typeof ad === "string" ? ad : null, phone: typeof ph === "string" ? ph : null };
}

/**
 * patch ของสาขา (คีย์ตรงตัว taxBranchNo · address · phone) ทับค่าปัจจุบัน — null/ว่าง = ล้างช่องนั้น (กลับไปใช้หัวใบของระบบ/สมุด) ·
 * ค่าผิด/คีย์แปลก = VALIDATION + field
 */
export function mergeReceiptUnitPatch(cur: PosReceiptUnitOverride, patch: unknown): { ok: true; next: PosReceiptUnitOverride } | PosFieldRefusal {
  if (!isRecord(patch)) return { ok: false, code: "VALIDATION", message: "ค่าของสาขาต้องเป็นออบเจกต์", field: "patch" };
  const keys = Object.keys(patch);
  const odd = keys.find((k) => !(RECEIPT_UNIT_KEYS as readonly string[]).includes(k));
  if (odd) return bad("patch", `ตั้งต่อสาขาได้เฉพาะ สาขาที่ / ที่อยู่ / โทร — ไม่รู้จัก ${odd.slice(0, 40)}`);
  if (!keys.length) return bad("patch", "ไม่มีค่าที่จะเปลี่ยน");
  const next: PosReceiptUnitOverride = { ...cur };
  if ("taxBranchNo" in patch) {
    const v = patch.taxBranchNo;
    if (v === null || v === "") next.taxBranchNo = null;
    else if (typeof v !== "string" || !TAX_BRANCH_NO_RE.test(v)) return bad("taxBranchNo", "สาขาที่ต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)");
    else next.taxBranchNo = v;
  }
  if ("address" in patch) {
    const v = optText(patch.address, RECEIPT_ADDRESS_MAX, true);
    if (v === false) return bad("address", `ที่อยู่ของสาขายาวได้ไม่เกิน ${RECEIPT_ADDRESS_MAX} ตัวอักษร`);
    next.address = v ?? null;
  }
  if ("phone" in patch) {
    const v = optText(patch.phone, RECEIPT_PHONE_MAX);
    if (v === false) return bad("phone", `เบอร์โทรของสาขายาวได้ไม่เกิน ${RECEIPT_PHONE_MAX} ตัวอักษร`);
    next.phone = v ?? null;
  }
  return { ok: true, next };
}

/** ค่าที่จะเก็บ (เฉพาะช่องที่ตั้ง) · ไม่มีช่องใดเลย = null (ลบคีย์ของสาขา) */
export function storedReceiptUnit(o: PosReceiptUnitOverride): Partial<PosReceiptUnitOverride> | null {
  const out: Partial<PosReceiptUnitOverride> = {};
  for (const k of RECEIPT_UNIT_KEYS) if (o[k] !== null) out[k] = o[k];
  return Object.keys(out).length ? out : null;
}
// ◂
