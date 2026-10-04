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
