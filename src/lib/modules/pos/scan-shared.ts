// scan-shared.ts — ตัวแยก "เครื่องสแกนแบบพิมพ์รัว" กับ "คนพิมพ์" + ผลสแกน → การกระทำของจอ + ค่าคงที่กล้อง (POS P1.4 · มติ B1–B4 · O22)
//   บริสุทธิ์ล้วน (client import ได้): ห้ามแตะ react / next / ฐานข้อมูล / server-only / @/lib/core — ข้อสอบ qc-pos-p1.4 B1 ตรวจ
//   ผู้เรียกหลัก: RegisterScreen (ตัวจับ keydown บน window) · ScanCameraDialog (รูปแบบของกล้อง)

import type { RegisterProduct, RegisterScanResult } from "./register-shared";

/** ช่วงห่างสูงสุดระหว่างคีย์ของเครื่องสแกน (ms) — 30 พอดียังนับเป็นเครื่องสแกน · 31 = คนพิมพ์ (B1) */
export const SCAN_MAX_GAP_MS = 30;
/** รหัสสั้นสุดที่นับเป็นการสแกน (ตัวอักษร ไม่นับตัวจบ/ปุ่มปรับ) */
export const SCAN_MIN_LENGTH = 4;

/** คีย์หนึ่งตัวในบัฟเฟอร์ — key = KeyboardEvent.key · at = event.timeStamp (ms) · isComposing = IME กำลังประกอบคำ */
export type ScanKey = { key: string; at: number; isComposing?: boolean };
/** บริบทตอนตัวจบมาถึง — target: ช่องค้นหา / ที่อื่นในหน้า (ปริยาย) / ช่องกรอกอื่น */
export type ScanBurstContext = { dialogOpen?: boolean; target?: "search" | "body" | "input" };
export type ScanBurstResult = { kind: "scan"; code: string } | { kind: "type" } | { kind: "ignore"; reason: "ime" | "dialog" | "input" };

/** ปุ่มปรับ — เครื่องสแกนกด Shift ก่อนตัวพิมพ์ใหญ่ ⇒ ข้าม (ไม่นับความยาว ไม่นับช่วงห่าง) */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);
const isTerminator = (key: string) => key === "Enter" || key === "Tab";

/**
 * ตัดสินบัฟเฟอร์คีย์ที่จบด้วย Enter/Tab (B1) — ลำดับ: ime → dialog → input → จังหวะ
 *   scan ⇔ ตัวจบคือคีย์สุดท้าย · ตัวอักษร ≥ SCAN_MIN_LENGTH · ทุกช่วงห่างระหว่างตัวอักษร และจากตัวท้ายถึงตัวจบ ≤ SCAN_MAX_GAP_MS
 *   คีย์ยาว >1 อื่น (Backspace · ลูกศร …) ก่อนตัวจบ = คนพิมพ์ · ไม่แก้ array ที่ส่งเข้า
 */
export function classifyScanBurst(keys: readonly ScanKey[], ctx: ScanBurstContext = {}): ScanBurstResult {
  if (keys.some((k) => k.isComposing === true || k.key === "Process")) return { kind: "ignore", reason: "ime" };
  if (ctx.dialogOpen) return { kind: "ignore", reason: "dialog" };
  if (ctx.target === "input") return { kind: "ignore", reason: "input" };
  const last = keys[keys.length - 1];
  if (!last || !isTerminator(last.key)) return { kind: "type" };
  let code = "";
  let prevAt: number | null = null;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    if (MODIFIER_KEYS.has(k.key)) continue;
    if (k.key.length !== 1) return { kind: "type" };
    if (prevAt !== null && k.at - prevAt > SCAN_MAX_GAP_MS) return { kind: "type" };
    code += k.key;
    prevAt = k.at;
  }
  if (prevAt === null || code.length < SCAN_MIN_LENGTH) return { kind: "type" };
  if (last.at - prevAt > SCAN_MAX_GAP_MS) return { kind: "type" };
  return { kind: "scan", code };
}

/**
 * แป้นภาษาไทย (Kedmanee): เครื่องสแกนแบบพิมพ์ส่ง "ตำแหน่งปุ่ม" แต่ระบบแปลงเป็นอักษรไทย (1 → ๅ · . → ใ …)
 *   ⇒ ตารางตำแหน่งปุ่ม (KeyboardEvent.code) → [ไม่กด Shift, กด Shift] ตามแป้น US — ตัวเครื่องสแกนตั้งมาเป็นแป้น US เสมอ
 */
const US_KEY_BY_CODE: Readonly<Record<string, readonly [string, string]>> = {
  Digit1: ["1", "!"], Digit2: ["2", "@"], Digit3: ["3", "#"], Digit4: ["4", "$"], Digit5: ["5", "%"],
  Digit6: ["6", "^"], Digit7: ["7", "&"], Digit8: ["8", "*"], Digit9: ["9", "("], Digit0: ["0", ")"],
  Minus: ["-", "_"], Equal: ["=", "+"], BracketLeft: ["[", "{"], BracketRight: ["]", "}"], Backslash: ["\\", "|"],
  Semicolon: [";", ":"], Quote: ["'", '"'], Backquote: ["`", "~"], Comma: [",", "<"], Period: [".", ">"], Slash: ["/", "?"],
};

/**
 * คีย์ที่ใส่บัฟเฟอร์ของตัวแยกเครื่องสแกน — key เป็น ASCII อยู่แล้ว/ยาวกว่า 1/IME ประกอบคำ = คงเดิม
 *   อักษรนอก ASCII ⇒ แปลงจากตำแหน่งปุ่ม: ตาราง US (เคารพ Shift) · Numpad0–9 · KeyA–Z (Shift = ตัวพิมพ์ใหญ่) · ไม่รู้จัก = คงเดิม
 */
export function scanKeyFromEvent(e: { key: string; code: string; shiftKey: boolean; isComposing?: boolean }): string {
  if (e.isComposing || e.key.length !== 1 || /^[\x20-\x7e]$/.test(e.key)) return e.key;
  const us = US_KEY_BY_CODE[e.code];
  if (us) return e.shiftKey ? us[1] : us[0];
  const n = /^Numpad(\d)$/.exec(e.code);
  if (n) return n[1]!;
  const a = /^Key([A-Z])$/.exec(e.code);
  if (a) return e.shiftKey ? a[1]! : a[1]!.toLowerCase();
  return e.key;
}

export type ScanOutcome<P = RegisterProduct> =
  | { action: "add"; product: P }
  | { action: "choose"; products: P[] }
  | { action: "none"; offerCustom: boolean }
  | { action: "error"; code: string };

/**
 * ผลของ registerScan → สิ่งที่จอต้องทำ (B2 · B4)
 *   one = ใส่ตะกร้า (สแกนซ้ำ = +1 ที่ cartAddProduct) · choose = กล่องเลือก (ครบทุกตัว ลำดับเดิม)
 *   none = แจ้งไม่พบ + เสนอ "เพิ่มเป็นรายการกำหนดเอง?" เฉพาะผู้มีสิทธิ์ราคาเปิด · ปฏิเสธ = error + รหัส
 */
export function scanOutcome(result: RegisterScanResult, opts: { canOverridePrice: boolean }): ScanOutcome {
  if (!result.ok) return { action: "error", code: result.code };
  if (result.match === "one") return { action: "add", product: result.product };
  if (result.match === "choose") return { action: "choose", products: [...result.products] };
  return { action: "none", offerCustom: opts.canOverridePrice === true };
}

/** รูปแบบที่ขอจาก BarcodeDetector (ชื่อตามสเปก Shape Detection) — B3 */
export const SCAN_CAMERA_FORMATS: readonly string[] = ["ean_13", "ean_8", "upc_a", "code_128", "qr_code"];
/**
 * O22 = ใช่ (เจ้าของ 4 ต.ค. 2026): ตัวถอดรหัสสำรองเมื่อเบราว์เซอร์ไม่มี BarcodeDetector (iPhone/Safari)
 *   โหลดแบบ import() ตอนเปิดแผ่นกล้องเท่านั้น (ScanCameraDialog) — ห้าม import แบบ static ที่ใดใน src
 */
export const SCAN_CAMERA_FALLBACK_PKG: string | null = "@zxing/browser";

// ═══════════════════ POS P1.2 ▸ R10 บาร์โค้ดน้ำหนัก/ราคาจากเครื่องชั่ง (EAN-13 · บริสุทธิ์) ◂ ═══════════════════
// รูปแบบ: PP IIIII VVVVV C — PP = คำนำหน้า (20–29 ตามกฎของร้าน) · IIIII = รหัสสินค้า (PosProduct.scalePlu) ·
//   VVVVV = ค่า: กรัม (WEIGHT) หรือ สตางค์ (PRICE · สูงสุด ฿999.99 — มติเจ้าของ P2) · C = check digit EAN-13 (น้ำหนัก 1/3 จากซ้าย)
// ค่าตั้ง: AppSystem(POS).settings.pos.weighedBarcode = { enabled, rules: [{ prefix: "20"…"29", kind }] } · ปิดเป็นปริยาย (มติ P1)

export type WeighedBarcodeKind = "WEIGHT" | "PRICE";
export type WeighedBarcodeRule = { prefix: string; kind: WeighedBarcodeKind };
export type WeighedBarcodeSettings = { enabled: boolean; rules: WeighedBarcodeRule[] };
/** ผลถอดป้าย — grams มีค่าเมื่อ WEIGHT · priceSatang มีค่าเมื่อ PRICE (อีกช่อง = null) */
export type WeighedBarcode = { prefix: string; itemCode: string; kind: WeighedBarcodeKind; grams: number | null; priceSatang: number | null };

/** check digit ของ EAN-13 จาก 12 หลักแรก (น้ำหนัก 1,3,1,3… จากซ้าย) · อินพุตไม่ใช่ตัวเลข 12 หลัก = −1 */
export function ean13CheckDigit(first12: string): number {
  if (typeof first12 !== "string" || !/^\d{12}$/.test(first12)) return -1;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * (first12.charCodeAt(i) - 48);
  return (10 - (sum % 10)) % 10;
}

const WEIGHED_KINDS: ReadonlySet<string> = new Set(["WEIGHT", "PRICE"]);
/** กฎที่ใช้ได้เท่านั้น: prefix "20"…"29" · kind WEIGHT/PRICE · prefix ซ้ำ = ตัวแรกชนะ (ผิดรูปถูกทิ้งเงียบ ๆ) */
function cleanWeighedRules(v: unknown): WeighedBarcodeRule[] {
  if (!Array.isArray(v)) return [];
  const out: WeighedBarcodeRule[] = [];
  for (const r of v as unknown[]) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const { prefix, kind } = r as { prefix?: unknown; kind?: unknown };
    if (typeof prefix !== "string" || !/^2\d$/.test(prefix) || typeof kind !== "string" || !WEIGHED_KINDS.has(kind)) continue;
    if (out.some((x) => x.prefix === prefix)) continue;
    out.push({ prefix, kind: kind as WeighedBarcodeKind });
  }
  return out;
}

/** ตัวอ่านค่าตั้งเดียว (จาก AppSystem.settings ทั้งก้อน) — ไม่ตั้ง/ผิดรูป = ปิด · enabled ต้องเป็น true เคร่ง · ไม่แก้อินพุต */
export function weighedBarcodeSettings(settings: unknown): WeighedBarcodeSettings {
  const pos = settings && typeof settings === "object" ? (settings as { pos?: unknown }).pos : undefined;
  const wb = pos && typeof pos === "object" ? (pos as { weighedBarcode?: unknown }).weighedBarcode : undefined;
  if (!wb || typeof wb !== "object" || Array.isArray(wb)) return { enabled: false, rules: [] };
  const o = wb as { enabled?: unknown; rules?: unknown };
  return { enabled: o.enabled === true, rules: cleanWeighedRules(o.rules) };
}

/**
 * ถอดป้ายเครื่องชั่ง → ผล หรือ null (ปิดใช้ · ไม่ใช่ตัวเลข 13 หลัก · check digit ผิด · prefix ไม่อยู่ในกฎ)
 * `settings` = ผลของ weighedBarcodeSettings (รับค่าตั้งทั้งก้อนของ AppSystem ก็ได้ — อ่านผ่านตัวอ่านเดียวกัน)
 */
export function parseWeighedBarcode(code: string, settings: WeighedBarcodeSettings | unknown): WeighedBarcode | null {
  const st: WeighedBarcodeSettings =
    settings && typeof settings === "object" && "rules" in (settings as object) && "enabled" in (settings as object)
      ? { enabled: (settings as WeighedBarcodeSettings).enabled === true, rules: cleanWeighedRules((settings as WeighedBarcodeSettings).rules) }
      : weighedBarcodeSettings(settings);
  if (!st.enabled || typeof code !== "string" || !/^\d{13}$/.test(code)) return null;
  if (ean13CheckDigit(code.slice(0, 12)) !== code.charCodeAt(12) - 48) return null;
  const prefix = code.slice(0, 2);
  const rule = st.rules.find((r) => r.prefix === prefix);
  if (!rule) return null;
  const value = Number(code.slice(7, 12));
  return { prefix, itemCode: code.slice(2, 7), kind: rule.kind, grams: rule.kind === "WEIGHT" ? value : null, priceSatang: rule.kind === "PRICE" ? value : null };
}

/** ปัดครึ่งขึ้นของ num/den (num ≥ 0 · den > 0 · จำนวนเต็ม) — สูตรเดียวกับ roundHalfUp ของ pricing-shared (ไฟล์นี้ห้าม import ค่า) */
const halfUp = (num: number, den: number): number => Math.floor((2 * num + den) / (2 * den));
/** ราคาของน้ำหนัก (สตางค์) = ปัดครึ่งขึ้น(กรัม × ราคาต่อกก. ÷ 1000) · อินพุตต้องเป็นจำนวนเต็ม ≥ 0 */
export function weighedPriceSatang(grams: number, perKgSatang: number): number {
  return halfUp(grams * perKgSatang, 1000);
}
/** น้ำหนัก (กรัม) จากป้ายฝังราคา = ปัดครึ่งขึ้น(ราคา × 1000 ÷ ราคาต่อกก.) · ราคาต่อกก. ≤ 0 = 0 (ผู้เรียกต้องตรวจก่อน) */
export function weighedGramsFromPrice(priceSatang: number, perKgSatang: number): number {
  return perKgSatang > 0 ? halfUp(priceSatang * 1000, perKgSatang) : 0;
}
