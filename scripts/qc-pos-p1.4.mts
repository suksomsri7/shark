// QC — POS RUN ใบ P1.4: บาร์โค้ด (เครื่องสแกนแบบพิมพ์รัว + กล้อง) · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ (oracle writer)
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.4.md (มติร่าง B1–B5 · คำถามเจ้าของ O22) · pos-brief-COMMON · pos-brief-LANE-RULES
//        ledger/pos-briefs/pos-spec-P1.3-register-ui.md แถว 7 / 9 / 29 · §1.3 (จุดต่อ P1.4) · §3.6 (แป้น + สแกน) · มติ Q24
//        โน้ต: ledger/wo-notes/pos-P1.4-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ความคลาดเคลื่อนของ brief · ชื่อที่ตั้งใหม่ · คำถาม)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ตหัวข้อ "Names I had to invent" — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม
//   ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.4 ต้องส่ง (ข้อสอบนี้คือสัญญา):
//   src/lib/modules/pos/scan-shared.ts  — บริสุทธิ์ (client import ได้ · ห้ามแตะ react/next/prisma/server/@/lib/core)
//     SCAN_MAX_GAP_MS = 30 · SCAN_MIN_LENGTH = 4
//     classifyScanBurst(keys: ScanKey[], ctx?: ScanBurstContext) → ScanBurstResult
//       ScanKey = { key: string (KeyboardEvent.key) ; at: number (ms · performance.now/event.timeStamp) ; isComposing?: boolean }
//       ScanBurstContext = { dialogOpen?: boolean ; target?: "search" | "body" | "input" }   (ปริยาย target "body")
//       ScanBurstResult = { kind: "scan"; code: string } | { kind: "type" } | { kind: "ignore"; reason: "ime" | "dialog" | "input" }
//       กติกา (B1): ลำดับการตัดสิน ime → dialog → input → จังหวะ
//         • คีย์ใดมี isComposing หรือ key "Process" = ignore/ime (IME ไทย/จีนกำลังประกอบคำ)
//         • dialogOpen = ignore/dialog (สแกนขณะกล่องชำระ/กล่องอื่นเปิด = ไม่ทำอะไร + toast — B2)
//         • target "input" (ช่องกรอกอื่นที่ไม่ใช่ช่องค้นหา) = ignore/input
//         • ตัวอักษร = คีย์ที่ key ยาว 1 ตัว · Shift/Control/Alt/Meta/CapsLock = ข้าม (ไม่นับความยาว ไม่นับช่วงห่าง)
//           คีย์ยาว >1 อื่น ๆ (Backspace · ลูกศร …) ก่อนตัวจบ = type
//         • scan ⇔ คีย์สุดท้ายคือ Enter หรือ Tab · ตัวอักษร ≥ SCAN_MIN_LENGTH · ทุกช่วงห่างระหว่างตัวอักษรที่ติดกัน และจากตัวอักษรตัวสุดท้าย
//           ถึงตัวจบ ≤ SCAN_MAX_GAP_MS (= 30 พอดียังนับเป็นเครื่องสแกน · 31 = คนพิมพ์) · code = ตัวอักษรต่อกันตามลำดับ
//         • อื่น ๆ ทั้งหมด (รวม array ว่าง · ไม่มีตัวจบ) = type
//     scanOutcome(result: RegisterScanResult, opts: { canOverridePrice: boolean }) →
//       { action: "add"; product } | { action: "choose"; products } (ครบทุกตัว ลำดับเดิม) | { action: "none"; offerCustom: boolean } |
//       { action: "error"; code }  — offerCustom = canOverridePrice เท่านั้น (B4: "เพิ่มเป็นรายการกำหนดเอง?" เฉพาะผู้มีสิทธิ์ราคาเปิด)
//     SCAN_CAMERA_FORMATS (รูปแบบของ BarcodeDetector): "ean_13" "ean_8" "upc_a" "code_128" "qr_code" ครบ (B3)
//     SCAN_CAMERA_FALLBACK_PKG: string | null — O22 = ใช่ ⇒ ชื่อแพ็กเกจถอดรหัสสำรอง (เช่น "@zxing/browser") ที่อยู่ใน package.json ·
//       O22 = ไม่ ⇒ null (ปุ่มกล้องซ่อนบนเบราว์เซอร์ที่ไม่มี BarcodeDetector) — ค่าที่ข้อสอบคาดอยู่ที่ O22_ANSWER ข้างล่าง (ปริยาย "yes" รอเจ้าของ)
//   src/lib/modules/pos/register-shared.ts (เพิ่ม export · บริสุทธิ์เหมือนเดิม)
//     cartAddProduct(cart: RegisterCart, productId: string, newLineKey: string) → RegisterCart ใหม่ (ไม่แก้ตัวเดิม)
//       = +1 ที่บรรทัดสินค้าแรกที่ productId เดียวกัน ไม่มีส่วนลด ไม่มีราคาเปิด (ราคา/ตัวเลือกเดียวกัน · B2) — เพดาน REGISTER_MAX_QTY
//       ไม่มีบรรทัดแบบนั้น = เพิ่มบรรทัดใหม่ {key:newLineKey, kind:"product", productId, qty:1} · ตะกร้าเต็ม REGISTER_MAX_LINES = คืนตะกร้าเดิม
//   src/components/pos/register/RegisterScreen.tsx
//     ตัวจับ keydown บน window เรียก classifyScanBurst(บัฟเฟอร์, { dialogOpen, target }) · บัฟเฟอร์เก็บ isComposing ของแต่ละคีย์
//     scan ⇒ onScannedCode(code) — เรียก registerScanAction ตรง (ไม่ผ่าน setQ / หน่วง 200ms / loadCatalog) · ทิ้งผลถ้าบิลเปลี่ยนรุ่น (billGen)
//     ผล → scanOutcome(r, { canOverridePrice: limits.canOverridePrice }) · add ⇒ ใส่ตะกร้าด้วย cartAddProduct (สแกนซ้ำ = +1)
//     choose ⇒ กล่องเลือก pos-reg-scan-chooser (แถว pos-reg-scan-choice-<id> ≥44px) — ห้ามยึดกริด (ไม่มี setProducts(r.products))
//     none ⇒ toast scan.notFound + (offerCustom) ปุ่ม scan.addAsCustom · กล่องเปิดอยู่ ⇒ toast scan.ignoredWhileDialog
//     กล้อง: แผ่น pos-reg-scan-sheet · BarcodeDetector ก่อน (ตรวจว่ามีด้วย "BarcodeDetector" in window / typeof) · getUserMedia ·
//       ตัวสำรองโหลดแบบ import("<pkg>") ตอนต้องใช้เท่านั้น (ไม่มี import แบบ static ที่ใดใน src) · ปุ่มกล้องไม่ใช่ soon อีกต่อไป
//     ข้อความ pos.register.scan.{chooseTitle, notFound, addAsCustom, ignoredWhileDialog, cameraTitle, cameraDenied, cameraNone} th+en
//   เซิร์ฟเวอร์ registerScan (มีแล้วจาก P1.3 · register.ts:705) — ข้อ K = คุมพฤติกรรมเดิมไม่ให้ถอย (ร้านอื่น/สาขาอื่น/เก็บถาวร = none · ซ้ำ = choose ครบ)
//
// ขอบเขต: B ตัวแยกเครื่องสแกน (บริสุทธิ์) · R ตะกร้า +1 / ผลสแกน · C กล้อง (ค่าคงที่ + สถิต) · S สถิตของจอ · K สแกนฝั่งเซิร์ฟเวอร์ · Z คืนสภาพ
//   การทำงานของกล้องจริง (ขออนุญาต · อ่านได้ · ปิดแผ่นหลังอ่าน 1 ครั้ง · Safari/iPhone) = ผู้คุมงานตรวจในเบราว์เซอร์ (headless ทำไม่ได้)
//   บาร์โค้ดน้ำหนัก (weight barcode) = P1.2 · ตัวเลือกสินค้า (options) ยังไม่มีในบรรทัดตะกร้า ⇒ "ตัวเลือกเดียวกัน" ตรวจเมื่อ P1.2 เพิ่มฟิลด์
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.6): SKIP เมื่อของ P1.4 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · --no-db = รันเฉพาะข้อบริสุทธิ์/สถิต (B R1 R2 C S) โดยไม่โหลด env/prisma (ใช้ตรวจในเครื่องที่ไม่มี DB ·
//    ไม่ผ่านด่าน SKIP · exit 1 ถ้าแดง) · ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab (QC4) เท่านั้น (ไม่มีทางปลด)
//    แถวชั่วคราวติดป้าย `qc-p1.4-<rand>` อยู่ในร้าน QC กาแฟ (สาขา/ระบบ sandbox) + ระบบ POS sandbox 1 ตัวในร้าน QC อาหาร (ข้อ K3) · ลบทั้งหมดใน finally
//    นับแถวร้าน QC ก่อน/หลังต้องเท่ากัน (Z1 · รวมผลรวมตัวนับใบเสร็จ) + ลายนิ้วมือแถวเดิม (Z2) · ข้อสอบนี้ไม่สร้างบิลเลย
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.4";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/**
 * O22 (เจ้าของ): เพิ่มแพ็กเกจถอดรหัสบาร์โค้ดสำรอง (โหลดแบบ lazy) ให้ iPhone/Safari สแกนด้วยกล้องได้ไหม
 * ปริยาย "yes" ตามคำแนะนำใน brief — รอเจ้าของตอบ · เจ้าของตอบ "ไม่" ⇒ ผู้คุมงานแก้ค่านี้เป็น "no" (ORACLE-EDIT บรรทัดเดียว)
 */
const O22_ANSWER: "yes" | "no" = "yes";

// ═════════════════════════ ทะเบียนข้อสอบ (id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: "-" = เชิงหน้าที่ล้วน · ค่าอื่น = กลุ่มบังคับใน POS-MASTER-PLAN §3 (X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X11 จอสัมผัส/แป้น)
const CHECKS: readonly (readonly [string, string, string])[] = [
  // ── B ตัวแยกเครื่องสแกนกับคนพิมพ์ (บริสุทธิ์ · B1) ──
  ["P1.4-B1", "-", "scan-shared.ts: export classifyScanBurst · SCAN_MAX_GAP_MS = 30 · SCAN_MIN_LENGTH = 4 · ไฟล์บริสุทธิ์ (ไม่ import react/next/prisma/server/@/lib/core) · เรียกซ้ำผลเท่าเดิม · ไม่แก้ array/object ที่ส่งเข้า (แช่แข็งแล้วไม่ throw)"],
  ["P1.4-B2", "X11", "ตารางจังหวะ → scan + code ตรงตัว: EAN-13 ห่าง 8ms+Enter · +Tab · ห่าง 30ms พอดี · 4 ตัวพอดี · ห่าง 0ms (USB บัฟเฟอร์) · Code128 'PQC-CF-WATER' · ตัวพิมพ์ใหญ่มี Shift แทรก ('ABC-1234')"],
  ["P1.4-B3", "X11", "ตารางจังหวะ → type: คนพิมพ์ห่าง 120ms · เครื่องสแกนช้า 45ms · ห่าง 31ms · รหัส 3 ตัว · ช่องว่าง 200ms กลางรหัส · Enter ช้า 150ms · ไม่มีตัวจบ · Backspace กลางรหัส · ว่าง · Enter เดี่ยว"],
  ["P1.4-B4", "X11", "บริบท: isComposing / key 'Process' → ignore ime · dialogOpen → ignore dialog · target 'input' → ignore input · target 'search' และ 'body' (ตัวจับทั้งหน้า) จังหวะเครื่องสแกน → scan"],
  // ── R ตะกร้า +1 · ผลสแกน (B2 · B4) ──
  ["P1.4-R1", "X4", "cartAddProduct (register-shared.ts): สแกนซ้ำ = +1 บรรทัดเดิม (key เดิม · ไม่เพิ่มบรรทัด) · บรรทัดมีส่วนลด / ราคาเปิด / สินค้าอื่น → บรรทัดใหม่ key ใหม่ qty 1 · เพดาน 9999 · ตะกร้าเต็ม 200 + สินค้าใหม่ = เท่าเดิม (สินค้าเดิมยัง +1 ได้) · คง billDiscount/memberId · ไม่แก้ตะกร้าเดิม"],
  ["P1.4-R2", "X3", "scanOutcome (scan-shared.ts): one → add สินค้าตัวนั้น · choose → choose ครบทุกตัวลำดับเดิม · none + canOverridePrice → offerCustom true · none ไม่มีสิทธิ์ → false · ปฏิเสธ → error + code"],
  ["P1.4-R3", "X4", "ทางเซิร์ฟเวอร์ของ +1: cartAddProduct ×2 สินค้าเดียวกัน → cartToQuoteInput → quoteRegisterCart = 1 บรรทัด gross 2×ราคา · ยอด 2×ราคา (ไม่ใช่ 2 บรรทัด)"],
  // ── C กล้อง (B3 · O22) ──
  ["P1.4-C1", "-", "SCAN_CAMERA_FORMATS ครบ ean_13 ean_8 upc_a code_128 qr_code · SCAN_CAMERA_FALLBACK_PKG ตรง O22 (yes = ชื่อแพ็กเกจที่อยู่ใน package.json dependencies · no = null)"],
  ["P1.4-C2", "-", "[static] ไฟล์กล้องใน src/components/pos/register: ตรวจ BarcodeDetector ก่อน ('BarcodeDetector' in window / typeof) · getUserMedia · แผ่น pos-reg-scan-sheet · ปุ่มกล้องไม่ใช่ soon · O22 yes: ตัวสำรองโหลดด้วย import(\"<pkg>\") หลังจุดตรวจ BarcodeDetector และไม่มี import แบบ static ที่ใดใน src · O22 no: ไม่มีตัวสำรองเลย"],
  // ── S สถิตของจอหน้าขาย ──
  ["P1.4-S1", "-", "[static] ทางเครื่องสแกนไม่ผ่านหน่วงค้นหา: RegisterScreen import classifyScanBurst · มี onScannedCode ที่เรียก registerScanAction + ทิ้งผลเมื่อ billGen เปลี่ยน · ไม่เรียก setQ/setTimeout/loadCatalog · ถูกเรียกจากตัวจับแป้น"],
  ["P1.4-S2", "X11", "[static] ตัวจับแป้นทั้งหน้าไม่รับ IME/ช่องกรอกอื่น/ตอนกล่องเปิด: classifyScanBurst(…) ส่ง dialogOpen + target · บัฟเฟอร์เก็บ isComposing: · ตรวจ tagName/isContentEditable/HTMLInputElement ของเป้า"],
  ["P1.4-S3", "X3", "[static] none → เสนอรายการกำหนดเองเฉพาะผู้มีสิทธิ์ราคาเปิด: RegisterScreen เรียก scanOutcome(…canOverridePrice…) · ใช้ offerCustom · มีข้อความ scan.addAsCustom"],
  ["P1.4-S4", "X11", "[static] choose = กล่องเลือกจริง: pos-reg-scan-chooser + แถว pos-reg-scan-choice- มีคลาส ≥44px · ไม่ยึดกริดด้วย setProducts(r.products) · สแกนขณะกล่องเปิด = toast scan.ignoredWhileDialog"],
  ["P1.4-S5", "-", "ข้อความ pos.register.scan.{chooseTitle notFound addAsCustom ignoredWhileDialog cameraTitle cameraDenied cameraNone} มี th+en ไม่ว่าง · en ไม่มีอักษรไทย · ทุกคีย์ถูกใช้ในโค้ดหน้าขาย"],
  // ── K สแกนฝั่งเซิร์ฟเวอร์ (registerScan · คุมไม่ให้ถอย) ──
  ["P1.4-K1", "-", "บาร์โค้ดเฉพาะตัว (InvItem) → one + สินค้านั้น · สแกนซ้ำได้ตัวเดิม · มีช่องว่างหัวท้ายยังเจอ"],
  ["P1.4-K2", "X2", "บาร์โค้ดเดียว 4 สินค้า (A B ปกติ · C เก็บถาวร · D ผูกสาขา 2): สาขา 1 → choose = {A,B} ครบ ลำดับคงที่สองครั้ง · สาขา 2 → choose = {A,B,D} · C ไม่โผล่เลย"],
  ["P1.4-K3", "X2", "บาร์โค้ดที่มีเฉพาะในร้านอื่น (ร้าน QC อาหาร · ระบบ POS sandbox) → none ที่ร้านกาแฟ (แถวของร้านอื่นมีจริง)"],
  ["P1.4-K4", "X2", "สินค้าผูกสาขา 2 (unitId) บาร์โค้ดเฉพาะตัว → สาขา 1 none · สาขา 2 one"],
  ["P1.4-K5", "-", "สินค้าเก็บถาวร: บาร์โค้ดของแถว PosProduct เอง และบาร์โค้ดของ InvItem ที่ผูก → none ทั้งคู่"],
  // ── Z คืนสภาพ ──
  ["P1.4-Z1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ"],
  ["P1.4-Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · InvItem · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter) ทุกคอลัมน์ ก่อน = หลัง"],
] as const;

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  if (!TITLE.has(id)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(id, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${id}] ${TITLE.get(id)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const skippedChecks = new Map<string, string>();
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 220) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : "UNKNOWN");
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1];
  return typeof o?.code === "string" && o.code ? o.code : "THROW";
}
/** เรียกฟังก์ชันของผู้สร้างแบบไม่ crash: ไม่มีฟังก์ชัน = {ok:false, code:"MISSING:<name>"} · throw = {ok:false, code, threw:true} */
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `ยังไม่มีฟังก์ชัน ${name}` };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}` };
  try {
    return fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 120)})`);
    return null;
  }
};
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

// ── ซอร์ส (สถิต) ──
function walk(dir: string, out: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx|ts)$/.test(f)) out.push(rel);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b`).test(src);
/** ช่วง [เปิด, ปิด] ของบล็อก {…} แรกหลังตำแหน่ง at (นับปีกกาแบบหยาบ · ซอร์สที่ stripComments แล้ว) */
const blockAt = (src: string, at: number): [number, number] => {
  if (at < 0) return [-1, -1];
  const arrow = src.indexOf("=>", at);
  const open = src.indexOf("{", arrow >= 0 && arrow < at + 400 ? arrow : at);
  if (open < 0) return [-1, -1];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return [open, i];
  }
  return [open, src.length];
};
/** เนื้อของ `const <name> = …` (ฟังก์ชันลูกศร) · ไม่พบ = "" */
const constBody = (src: string, name: string): string => {
  const k = src.search(new RegExp(`const\\s+${name}\\s*=`));
  if (k < 0) return "";
  const [a, b] = blockAt(src, k);
  return a < 0 ? "" : src.slice(a, b + 1);
};
/** อาร์กิวเมนต์ของการเรียก fn(…) ครั้งแรก (นับวงเล็บ) · ไม่พบ = "" */
const callArgs = (src: string, fn: string): string => {
  const k = src.search(new RegExp(`\\b${fn}\\s*\\(`));
  if (k < 0) return "";
  const open = src.indexOf("(", k);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
};
const TOUCH = /(^|[\s"'`])(min-h-(1[1-9]|[2-9]\d)|h-(1[1-9]|[2-9]\d)|size-(1[1-9]|[2-9]\d)|min-h-\[(4[4-9]|[5-9]\d|\d{3})px\]|h-\[(4[4-9]|[5-9]\d|\d{3})px\]|touch-target|pos-touch)(?=$|[\s"'`])/;
const tagOf = (code: string, t: string): string => {
  const i = code.indexOf(t);
  if (i < 0) return "";
  const st = code.lastIndexOf("<", i);
  const en = code.indexOf(">", i);
  return st >= 0 && en > i ? code.slice(st, en + 1) : "";
};
function posMessages(locale: string): Map<string, unknown> {
  const keys = new Map<string, unknown>();
  const flat = (o: unknown, prefix: string) => {
    if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, `${prefix}.${k}`);
    else keys.set(prefix, o);
  };
  const dir = join(ROOT, "src", "messages", locale);
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".json")).sort() : []) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
      if (f === "pos.json") flat(j, "pos");
      else if (j && typeof j === "object" && "pos" in j) flat(j.pos, "pos");
    } catch {
      /* ไฟล์พัง = คีย์หาย (S5 แดงเอง) */
    }
  }
  return keys;
}

const SCAN_FILE = "src/lib/modules/pos/scan-shared.ts";
const REG_SHARED_FILE = "src/lib/modules/pos/register-shared.ts";
const RS_FILE = "src/components/pos/register/RegisterScreen.tsx";
const REG_UI_DIRS = ["src/components/pos/register", "src/app/app/sys/[id]/pos"];
const scanSrcRaw = rd(SCAN_FILE);
const scanSrc = stripComments(scanSrcRaw);
const regSharedSrc = stripComments(rd(REG_SHARED_FILE));
const RS = stripComments(rd(RS_FILE));
const regUiFiles = REG_UI_DIRS.flatMap((d) => walk(d));
const regUiCode = regUiFiles.map((f) => stripComments(rd(f))).filter((s) => s.includes("pos-reg-")).join("\n");
const SCAN_KEYS = ["chooseTitle", "notFound", "addAsCustom", "ignoredWhileDialog", "cameraTitle", "cameraDenied", "cameraNone"] as const;

// ═════════════════════════ 1. ข้อบริสุทธิ์/สถิต (ไม่แตะ DB) ═════════════════════════
type Key = { key: string; at: number; isComposing?: boolean };
/** รหัส → คีย์ห่างกัน gap ms · ตัวจบห่างจากตัวท้าย termGap ms (ปริยาย = gap) */
const burst = (code: string, gap: number, term: "Enter" | "Tab" | null = "Enter", termGap = gap, t0 = 1000): Key[] => {
  const keys: Key[] = [];
  let t = t0;
  for (const ch of code) {
    keys.push({ key: ch, at: t });
    t += gap;
  }
  if (term) keys.push({ key: term, at: (keys.length ? keys[keys.length - 1]!.at : t0) + termGap });
  return keys;
};
/** ตัวพิมพ์ใหญ่มี Shift กดก่อน 2ms (เครื่องสแกนส่ง Shift สำหรับตัวพิมพ์ใหญ่) · ตัวอักษรห่างกัน 10ms */
const shifted = (code: string): Key[] => {
  const keys: Key[] = [];
  let t = 5000;
  for (const ch of code) {
    if (/[A-Z]/.test(ch)) keys.push({ key: "Shift", at: t - 2 });
    keys.push({ key: ch, at: t });
    t += 10;
  }
  keys.push({ key: "Enter", at: t - 10 + 9 });
  return keys;
};
const EAN = "8850999000015";
type Exp = { kind: "scan"; code: string } | { kind: "type" } | { kind: "ignore"; reason: string };
const matches = (r: Any, e: Exp): boolean =>
  !!r && r.ok !== false && r.kind === e.kind && (e.kind !== "scan" || r.code === e.code) && (e.kind !== "ignore" || r.reason === e.reason);

async function runPure(): Promise<void> {
  console.log("\n── B/R/C/S ข้อที่ไม่แตะ DB ──");
  const scanMod = existsSync(join(ROOT, SCAN_FILE)) ? await tryImport("@/lib/modules/pos/scan-shared") : null;
  const regShared = await tryImport("@/lib/modules/pos/register-shared");

  // B1 มี + บริสุทธิ์
  const p1: string[] = [];
  if (!exportsFn(scanSrc, "classifyScanBurst")) p1.push(`${SCAN_FILE} ไม่มี export classifyScanBurst`);
  if (scanMod?.SCAN_MAX_GAP_MS !== 30) p1.push(`SCAN_MAX_GAP_MS=${short(scanMod?.SCAN_MAX_GAP_MS, 20)}`);
  if (scanMod?.SCAN_MIN_LENGTH !== 4) p1.push(`SCAN_MIN_LENGTH=${short(scanMod?.SCAN_MIN_LENGTH, 20)}`);
  if (scanSrc && (/from\s+["'](react|next\/|@prisma|server-only|@\/lib\/core)/.test(scanSrc) || /\bprisma\b/.test(scanSrc) || /^\s*["']use (client|server)["']/m.test(scanSrc)))
    p1.push("scan-shared.ts import ของ react/next/prisma/server หรือมี directive");
  {
    const input = deepFreeze(burst(EAN, 8));
    const ctx = deepFreeze({ dialogOpen: false, target: "search" as const });
    const a = callSync(scanMod, "classifyScanBurst", input, ctx);
    const b = callSync(scanMod, "classifyScanBurst", input, ctx);
    if (a?.threw) p1.push(`throw กับ input แช่แข็ง: ${short(a, 80)}`);
    else if (short(a) !== short(b)) p1.push(`เรียกซ้ำไม่เท่ากัน ${short(a, 60)} ≠ ${short(b, 60)}`);
    if (!matches(a, { kind: "scan", code: EAN })) p1.push(`EAN 8ms → ${short(a, 80)}`);
  }
  chk("P1.4-B1", p1.length === 0, "export · 30/4 · บริสุทธิ์ · ไม่แก้ input", p1.join(" · ") || "ครบ");

  // B2/B3/B4 ตารางจังหวะ
  const table = (rows: [string, Key[], Any, Exp][]): string[] => {
    const bad: string[] = [];
    for (const [label, keys, ctx, exp] of rows) {
      const r = ctx === undefined ? callSync(scanMod, "classifyScanBurst", clone(keys)) : callSync(scanMod, "classifyScanBurst", clone(keys), clone(ctx));
      if (!matches(r, exp)) bad.push(`${label}: ${short(r, 70)} ≠ ${short(exp, 50)}`);
    }
    return bad;
  };
  const b2 = table([
    ["EAN-13 8ms Enter", burst(EAN, 8), undefined, { kind: "scan", code: EAN }],
    ["EAN-13 8ms Tab", burst(EAN, 8, "Tab"), { target: "search" }, { kind: "scan", code: EAN }],
    ["30ms พอดี", burst("12345678", 30), undefined, { kind: "scan", code: "12345678" }],
    ["4 ตัวพอดี", burst("1234", 10), undefined, { kind: "scan", code: "1234" }],
    ["0ms (บัฟเฟอร์ USB)", burst("00012345", 0), undefined, { kind: "scan", code: "00012345" }],
    ["Code128", burst("PQC-CF-WATER", 5), { target: "body" }, { kind: "scan", code: "PQC-CF-WATER" }],
    ["Shift แทรก", shifted("ABC-1234"), undefined, { kind: "scan", code: "ABC-1234" }],
  ]);
  chk("P1.4-B2", b2.length === 0, "7 แถว = scan + code ตรง", b2.join(" · ") || "ครบ 7");

  const gap200 = burst(EAN, 8).map((k, i) => (i >= 6 ? { ...k, at: k.at + 200 } : k));
  const withBs = burst("8850999000015", 8);
  withBs.splice(5, 0, { key: "Backspace", at: withBs[4]!.at + 4 });
  const b3 = table([
    ["คนพิมพ์ 120ms", burst(EAN, 120), undefined, { kind: "type" }],
    ["เครื่องสแกนช้า 45ms", burst(EAN, 45), undefined, { kind: "type" }],
    ["31ms", burst("12345678", 31), undefined, { kind: "type" }],
    ["3 ตัว", burst("123", 8), undefined, { kind: "type" }],
    ["ช่องว่าง 200ms กลางรหัส", gap200, undefined, { kind: "type" }],
    ["Enter ช้า 150ms", burst(EAN, 8, "Enter", 150), undefined, { kind: "type" }],
    ["ไม่มีตัวจบ", burst(EAN, 8, null), undefined, { kind: "type" }],
    ["Backspace กลางรหัส", withBs, undefined, { kind: "type" }],
    ["ว่าง", [], undefined, { kind: "type" }],
    ["Enter เดี่ยว", [{ key: "Enter", at: 1 }], undefined, { kind: "type" }],
  ]);
  chk("P1.4-B3", b3.length === 0, "10 แถว = type", b3.join(" · ") || "ครบ 10");

  const ime1 = burst(EAN, 8).map((k, i) => (i === 3 ? { ...k, isComposing: true } : k));
  const ime2 = burst(EAN, 8);
  ime2.splice(2, 0, { key: "Process", at: ime2[1]!.at + 3 });
  const b4 = table([
    ["isComposing", ime1, undefined, { kind: "ignore", reason: "ime" }],
    ["key Process", ime2, undefined, { kind: "ignore", reason: "ime" }],
    ["dialogOpen", burst(EAN, 8), { dialogOpen: true, target: "body" }, { kind: "ignore", reason: "dialog" }],
    ["target input", burst(EAN, 8), { dialogOpen: false, target: "input" }, { kind: "ignore", reason: "input" }],
    ["target search", burst(EAN, 8), { dialogOpen: false, target: "search" }, { kind: "scan", code: EAN }],
    ["target body", burst(EAN, 8), { dialogOpen: false, target: "body" }, { kind: "scan", code: EAN }],
  ]);
  chk("P1.4-B4", b4.length === 0, "IME/กล่อง/ช่องอื่น = ignore ตามเหตุ · search/body = scan", b4.join(" · ") || "ครบ 6");

  // R1 cartAddProduct
  const r1: string[] = [];
  const add = (cart: Any, pid: string, key: string) => callSync(regShared, "cartAddProduct", cart, pid, key);
  {
    const c0 = deepFreeze({ lines: [] as Any[], billDiscount: { type: "AMOUNT", value: 100 }, memberId: "m1" });
    const c1 = add(c0, "p1", "k1");
    const ok1 = Array.isArray(c1?.lines) && c1.lines.length === 1 && c1.lines[0].key === "k1" && c1.lines[0].kind === "product" && c1.lines[0].productId === "p1" && c1.lines[0].qty === 1;
    if (!ok1) r1.push(`ว่าง+p1 → ${short(c1, 90)}`);
    const c2 = ok1 ? add(deepFreeze(clone(c1)), "p1", "k2") : null;
    if (ok1 && !(c2?.lines?.length === 1 && c2.lines[0].key === "k1" && c2.lines[0].qty === 2)) r1.push(`สแกนซ้ำ → ${short(c2, 90)} (ต้อง 1 บรรทัด key k1 qty 2)`);
    if (ok1 && !(c2?.billDiscount?.value === 100 && c2?.memberId === "m1")) r1.push("billDiscount/memberId หาย");
    if (short(c0) !== short({ lines: [], billDiscount: { type: "AMOUNT", value: 100 }, memberId: "m1" })) r1.push("แก้ตะกร้าเดิม");
  }
  {
    const disc = deepFreeze({ lines: [{ key: "d1", kind: "product", productId: "p1", qty: 1, discount: { type: "PERCENT", value: 1000 } }] });
    const r = add(disc, "p1", "kn");
    if (!(r?.lines?.length === 2 && r.lines[0].qty === 1 && r.lines[1].key === "kn" && r.lines[1].qty === 1 && r.lines[1].productId === "p1" && !r.lines[1].discount)) r1.push(`บรรทัดมีส่วนลด → ${short(r, 90)}`);
    const open = deepFreeze({ lines: [{ key: "o1", kind: "product", productId: "p1", qty: 1, openPriceSatang: 4000 }] });
    const r2 = add(open, "p1", "kn");
    if (!(r2?.lines?.length === 2 && r2.lines[0].qty === 1 && r2.lines[1].key === "kn" && r2.lines[1].openPriceSatang === undefined)) r1.push(`บรรทัดราคาเปิด → ${short(r2, 90)}`);
    const other = deepFreeze({ lines: [{ key: "a1", kind: "product", productId: "p1", qty: 3 }] });
    const r3 = add(other, "p2", "kn");
    if (!(r3?.lines?.length === 2 && r3.lines[0].qty === 3 && r3.lines[1].productId === "p2" && r3.lines[1].qty === 1)) r1.push(`สินค้าอื่น → ${short(r3, 90)}`);
    const custom = deepFreeze({ lines: [{ key: "c1", kind: "custom", name: "p1", unitPriceSatang: 100, qty: 1 }] });
    const r4 = add(custom, "p1", "kn");
    if (!(r4?.lines?.length === 2 && r4.lines[0].kind === "custom" && r4.lines[0].qty === 1)) r1.push(`รายการกำหนดเองชื่อซ้ำ → ${short(r4, 90)}`);
    const cap = deepFreeze({ lines: [{ key: "x1", kind: "product", productId: "p1", qty: 9999 }] });
    const r5 = add(cap, "p1", "kn");
    if (!(r5?.lines?.length === 1 && r5.lines[0].qty === 9999)) r1.push(`เพดาน 9999 → ${short(r5, 90)}`);
    const full = deepFreeze({ lines: Array.from({ length: 200 }, (_, i) => ({ key: `f${i}`, kind: "product", productId: `q${i}`, qty: 1 })) });
    const r6 = add(full, "pNEW", "kn");
    if (!(r6?.lines?.length === 200 && !r6.lines.some((l: Any) => l.productId === "pNEW"))) r1.push(`เต็ม 200 + ใหม่ → ${r6?.lines?.length ?? short(r6, 60)} บรรทัด`);
    const r7 = add(full, "q7", "kn");
    if (!(r7?.lines?.length === 200 && r7.lines[7].qty === 2)) r1.push(`เต็ม 200 + ของเดิม → ${short(r7?.lines?.[7], 60)}`);
  }
  chk("P1.4-R1", r1.length === 0, "+1 บรรทัดเดิม · บรรทัดใหม่เมื่อราคา/สินค้าต่าง · เพดาน · ไม่แก้ของเดิม", r1.join(" · ") || "ครบ");

  // R2 scanOutcome
  const r2: string[] = [];
  {
    const P = { id: "pa", name: "A" };
    const Q = { id: "pb", name: "B" };
    const R = { id: "pc", name: "C" };
    const o1 = callSync(scanMod, "scanOutcome", deepFreeze({ ok: true, match: "one", product: P }), { canOverridePrice: false });
    if (!(o1?.action === "add" && o1.product?.id === "pa")) r2.push(`one → ${short(o1, 70)}`);
    const o2 = callSync(scanMod, "scanOutcome", deepFreeze({ ok: true, match: "choose", products: [P, Q, R] }), { canOverridePrice: false });
    if (!(o2?.action === "choose" && Array.isArray(o2.products) && o2.products.map((p: Any) => p.id).join(",") === "pa,pb,pc")) r2.push(`choose → ${short(o2, 90)}`);
    const o3 = callSync(scanMod, "scanOutcome", deepFreeze({ ok: true, match: "none" }), { canOverridePrice: true });
    if (!(o3?.action === "none" && o3.offerCustom === true)) r2.push(`none+สิทธิ์ → ${short(o3, 70)}`);
    const o4 = callSync(scanMod, "scanOutcome", deepFreeze({ ok: true, match: "none" }), { canOverridePrice: false });
    if (!(o4?.action === "none" && o4.offerCustom === false)) r2.push(`none ไม่มีสิทธิ์ → ${short(o4, 70)}`);
    const o5 = callSync(scanMod, "scanOutcome", deepFreeze({ ok: false, code: "NOT_FOUND", message: "x" }), { canOverridePrice: true });
    if (!(o5?.action === "error" && o5.code === "NOT_FOUND")) r2.push(`ปฏิเสธ → ${short(o5, 70)}`);
  }
  chk("P1.4-R2", r2.length === 0, "add · choose ครบ · none offerCustom ตามสิทธิ์ · error", r2.join(" · ") || "ครบ");

  // C1 ค่าคงที่กล้อง + O22
  const c1: string[] = [];
  const fm = scanMod?.SCAN_CAMERA_FORMATS;
  const wantFm = ["ean_13", "ean_8", "upc_a", "code_128", "qr_code"];
  if (!Array.isArray(fm)) c1.push("ไม่มี SCAN_CAMERA_FORMATS");
  else {
    const miss = wantFm.filter((f) => !fm.includes(f));
    if (miss.length) c1.push(`รูปแบบขาด ${miss.join(",")}`);
  }
  const hasPkgExport = !!scanMod && "SCAN_CAMERA_FALLBACK_PKG" in scanMod;
  const pkgName: unknown = scanMod?.SCAN_CAMERA_FALLBACK_PKG;
  let pkgJson: Any = {};
  try {
    pkgJson = JSON.parse(rd("package.json"));
  } catch {
    /* ว่าง */
  }
  if (!hasPkgExport) c1.push("ไม่มี SCAN_CAMERA_FALLBACK_PKG");
  else if (O22_ANSWER === "yes") {
    if (typeof pkgName !== "string" || !pkgName) c1.push(`O22 yes แต่ SCAN_CAMERA_FALLBACK_PKG=${short(pkgName, 40)}`);
    else if (!pkgJson?.dependencies?.[pkgName]) c1.push(`${pkgName} ไม่อยู่ใน package.json dependencies`);
  } else if (pkgName !== null) c1.push(`O22 no แต่ SCAN_CAMERA_FALLBACK_PKG=${short(pkgName, 40)}`);
  chk("P1.4-C1", c1.length === 0, `5 รูปแบบ · ตัวสำรองตาม O22=${O22_ANSWER}`, c1.join(" · ") || `ครบ (pkg ${short(pkgName, 40)})`);

  // C2 สถิตของกล้อง
  const c2: string[] = [];
  const camFiles = walk("src/components/pos/register").filter((f) => /BarcodeDetector/.test(stripComments(rd(f))));
  if (!camFiles.length) c2.push("ไม่มีไฟล์ใน src/components/pos/register ที่ใช้ BarcodeDetector");
  const camCode = camFiles.map((f) => stripComments(rd(f))).join("\n");
  const detectRe = /["']BarcodeDetector["']\s+in\s+(window|globalThis|self)|typeof\s+(window\.|globalThis\.|self\.)?BarcodeDetector\b/;
  const detectAt = camCode.search(detectRe);
  if (camFiles.length && detectAt < 0) c2.push("ไม่ตรวจว่ามี BarcodeDetector ก่อนใช้");
  if (camFiles.length && !/getUserMedia/.test(camCode)) c2.push("ไม่มี getUserMedia");
  if (!regUiCode.includes("pos-reg-scan-sheet")) c2.push("ไม่มีแผ่น pos-reg-scan-sheet");
  if (/onCamera=\{\s*soon\s*\}/.test(RS)) c2.push("ปุ่มกล้องยัง onCamera={soon}");
  const allSrc = walk("src").map((f) => [f, stripComments(rd(f))] as const);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  if (O22_ANSWER === "yes") {
    if (typeof pkgName !== "string" || !pkgName) c2.push("O22 yes แต่ไม่มีชื่อแพ็กเกจสำรอง (C1)");
    else {
      const staticImp = allSrc.filter(([, s]) => new RegExp(`(from\\s+|import\\s+)["']${esc(pkgName)}(/[^"']*)?["']`).test(s)).map(([f]) => f);
      if (staticImp.length) c2.push(`import ${pkgName} แบบ static: ${staticImp.slice(0, 3).join(", ")}`);
      const dynAt = camCode.search(new RegExp(`import\\(\\s*["']${esc(pkgName)}(/[^"']*)?["']\\s*\\)`));
      if (dynAt < 0) c2.push(`ไม่มี import("${pkgName}") ในไฟล์กล้อง`);
      else if (detectAt >= 0 && dynAt < detectAt) c2.push("โหลดตัวสำรองก่อนตรวจ BarcodeDetector");
    }
  } else {
    const anyZx = allSrc.filter(([, s]) => /["']@zxing\/|["']quagga|["']html5-qrcode/.test(s)).map(([f]) => f);
    if (anyZx.length) c2.push(`O22 no แต่มีตัวถอดรหัสสำรอง: ${anyZx.slice(0, 3).join(", ")}`);
  }
  chk("P1.4-C2", c2.length === 0, "BarcodeDetector ก่อน · getUserMedia · แผ่นกล้อง · ไม่ soon · ตัวสำรอง lazy ตาม O22", c2.join(" · ") || `ครบ (${camFiles.join(", ")})`);

  // S1 ทางเครื่องสแกนไม่ผ่านหน่วงค้นหา
  const s1: string[] = [];
  if (!/import\s*\{[^}]*\bclassifyScanBurst\b[^}]*\}\s*from\s*["']@\/lib\/modules\/pos\/scan-shared["']/.test(RS)) s1.push("RegisterScreen ไม่ import classifyScanBurst จาก scan-shared");
  const onScan = constBody(RS, "onScannedCode");
  if (!onScan) s1.push("ไม่มี const onScannedCode");
  else {
    if (!/registerScanAction\s*\(/.test(onScan)) s1.push("onScannedCode ไม่เรียก registerScanAction");
    if (!/billGen\.current/.test(onScan)) s1.push("onScannedCode ไม่ทิ้งผลเมื่อบิลเปลี่ยนรุ่น (billGen)");
    const via = ["setQ(", "setTimeout(", "loadCatalog("].filter((x) => onScan.includes(x));
    if (via.length) s1.push(`onScannedCode ผ่าน ${via.join(" ")}`);
  }
  // นิยามเป็น `const onScannedCode = …` (ไม่มี "onScannedCode(") ⇒ ทุกตัวที่ตรงคือการเรียก
  const scanCalls = [...RS.matchAll(/\bonScannedCode\s*\(/g)].length;
  if (onScan && scanCalls < 1) s1.push("ไม่มีที่เรียก onScannedCode(…)");
  if (!/classifyScanBurst\s*\(/.test(RS)) s1.push("ไม่มีการเรียก classifyScanBurst(…)");
  chk("P1.4-S1", s1.length === 0, "import · onScannedCode → registerScanAction ตรง + billGen · ไม่ผ่าน setQ/หน่วง", s1.join(" · ") || "ครบ");

  // S2 ตัวจับแป้นไม่รับ IME/ช่องอื่น/ตอนกล่องเปิด
  const s2: string[] = [];
  const args = callArgs(RS, "classifyScanBurst");
  if (!args) s2.push("ไม่มีการเรียก classifyScanBurst");
  else {
    if (!/dialogOpen/.test(args)) s2.push("ไม่ส่ง dialogOpen");
    if (!/target/.test(args)) s2.push("ไม่ส่ง target");
  }
  if (!/isComposing\s*:/.test(RS)) s2.push("บัฟเฟอร์ไม่เก็บ isComposing:");
  if (!/\.tagName\b|isContentEditable|instanceof\s+HTML(Input|TextArea|Select)Element/.test(RS)) s2.push("ไม่ตรวจชนิดเป้าหมาย (tagName/isContentEditable/HTMLInputElement)");
  if (!/addEventListener\(\s*["']keydown["']/.test(RS)) s2.push("ไม่มีตัวจับ keydown บน window");
  chk("P1.4-S2", s2.length === 0, "dialogOpen + target + isComposing + ตรวจเป้า", s2.join(" · ") || "ครบ");

  // S3 none → รายการกำหนดเองเฉพาะผู้มีสิทธิ์ราคาเปิด
  const s3: string[] = [];
  const soArgs = callArgs(RS, "scanOutcome");
  if (!soArgs) s3.push("RegisterScreen ไม่เรียก scanOutcome");
  else if (!/canOverridePrice/.test(soArgs)) s3.push("scanOutcome ไม่ได้รับ canOverridePrice");
  if (!/\bofferCustom\b/.test(RS)) s3.push("ไม่ใช้ offerCustom");
  if (!/["'`]scan\.addAsCustom["'`]/.test(regUiCode)) s3.push("ไม่มีข้อความ scan.addAsCustom ในจอ");
  chk("P1.4-S3", s3.length === 0, "scanOutcome(…canOverridePrice) · offerCustom · scan.addAsCustom", s3.join(" · ") || "ครบ");

  // S4 กล่องเลือกจริง ≥44px · ไม่ยึดกริด · กล่องเปิด = toast
  const s4: string[] = [];
  if (!regUiCode.includes("pos-reg-scan-chooser")) s4.push("ไม่มี pos-reg-scan-chooser");
  const choiceTag = tagOf(regUiCode, "pos-reg-scan-choice-");
  if (!choiceTag) s4.push("ไม่มีแถว pos-reg-scan-choice-");
  else if (!TOUCH.test(choiceTag)) s4.push(`แถวเลือกไม่มีคลาส ≥44px: ${choiceTag.slice(0, 80)}`);
  if (/setProducts\(\s*\w+\.products\s*\)/.test(RS)) s4.push("ยังยึดกริดด้วย setProducts(r.products)");
  if (!/["'`]scan\.ignoredWhileDialog["'`]/.test(regUiCode)) s4.push("ไม่มี toast scan.ignoredWhileDialog");
  chk("P1.4-S4", s4.length === 0, "กล่องเลือก + แถว ≥44px · ไม่ setProducts(r.products) · toast ตอนกล่องเปิด", s4.join(" · ") || "ครบ");

  // S5 ข้อความ th+en
  const th = posMessages("th");
  const en = posMessages("en");
  const thai = /[฀-๿]/;
  const s5: string[] = [];
  for (const k of SCAN_KEYS) {
    const full = `pos.register.scan.${k}`;
    const t = th.get(full);
    const e = en.get(full);
    if (typeof t !== "string" || !t.trim()) s5.push(`${k}: th ขาด`);
    if (typeof e !== "string" || !e.trim()) s5.push(`${k}: en ขาด`);
    else if (thai.test(e)) s5.push(`${k}: en มีอักษรไทย`);
    if (!new RegExp(`["'\`]scan\\.${k}["'\`]`).test(regUiCode)) s5.push(`${k}: ไม่ถูกใช้ในจอ`);
  }
  chk("P1.4-S5", s5.length === 0, `${SCAN_KEYS.length} คีย์ th+en + ใช้ในจอ`, s5.slice(0, 8).join(" · ") + (s5.length > 8 ? ` …(+${s5.length - 8})` : "") || "ครบ");
}

const PURE_IDS = ["P1.4-B1", "P1.4-B2", "P1.4-B3", "P1.4-B4", "P1.4-R1", "P1.4-R2", "P1.4-C1", "P1.4-C2", "P1.4-S1", "P1.4-S2", "P1.4-S3", "P1.4-S4", "P1.4-S5"];

// ── ตัวบ่งชี้ว่าของ P1.4 ถูกสร้างแล้ว (ไม่ครบ = SKIP ทั้งชุดเมื่อไม่ FORCE) ──
const skipReasons: string[] = [];
if (!exportsFn(scanSrc, "classifyScanBurst")) skipReasons.push(`${SCAN_FILE} ยังไม่มี export classifyScanBurst (B1)`);
if (!exportsFn(scanSrc, "scanOutcome")) skipReasons.push(`${SCAN_FILE} ยังไม่มี export scanOutcome (B4)`);
if (!exportsFn(regSharedSrc, "cartAddProduct")) skipReasons.push(`${REG_SHARED_FILE} ยังไม่มี export cartAddProduct (B2)`);
if (!/classifyScanBurst/.test(RS)) skipReasons.push(`${RS_FILE} ยังไม่ต่อทางเครื่องสแกน (ไม่มี classifyScanBurst)`);

// ═════════════════════════ 1b. --no-db: รันเฉพาะข้อบริสุทธิ์/สถิต แล้วจบ (ไม่โหลด env/prisma) ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${PURE_IDS.length} ข้อที่ไม่แตะ DB (ไม่ผ่านด่าน SKIP · ข้อ R3 K Z ต้องใช้ DB)`);
  if (skipReasons.length) console.log(`   (ของ P1.4 ที่ยังขาด: ${skipReasons.join(" | ")})`);
  let crashedPure = "";
  try {
    await runPure();
  } catch (e) {
    crashedPure = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedPure}`);
  }
  for (const id of PURE_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedPure ? `ไม่ถึง (harness ล้ม: ${crashedPure.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons, o22: O22_ANSWER })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;
const TIDS = envMod.PQC_TENANT_IDS as string[];
/** ด่าน host ก่อนเขียนแถวแรก: DATABASE_URL (และ DIRECT_URL ถ้ามี) ต้องเป็น ep-frosty-lab เท่านั้น — POS_QC_ALLOW_HOST ไม่ปลดด่านนี้ */
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP ═════════════════════════
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;

let scope: Any = null;
let restoScope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}

// ── A5: นับแถวของร้าน QC POS (อ่านอย่างเดียว) — ใช้ทั้งตอน SKIP และตอนรันจริง (Z1) ──
const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posReceiptCounter", "outboxEvent", "invItem", "invMovement", "invLocationStock",
  "appSystem", "appSystemUnit", "businessUnit", "auditLog", "posProduct", "posCategory", "recipeLine", "accountJournalEntry",
] as const;
const FP_MODELS = ["posProduct", "posCategory", "invItem", "appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter"] as const;
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of FP_MODELS) {
    const d = P[m];
    if (typeof d?.findMany !== "function") {
      out[m] = "absent";
      continue;
    }
    try {
      const rows = (await d.findMany({ where: { tenantId: { in: TIDS } }, orderBy: { id: "asc" } })) as Any[];
      out[m] = `${rows.length}:${createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16)}`;
    } catch (e) {
      out[m] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS) {
    for (const m of COUNT_MODELS) {
      const d = P[m];
      if (typeof d?.count !== "function") {
        out[`${tid}.${m}`] = "absent";
        continue;
      }
      try {
        out[`${tid}.${m}`] = await d.count({ where: { tenantId: tid } });
      } catch (e) {
        out[`${tid}.${m}`] = `err:${(e as Error).message.slice(0, 40)}`;
      }
    }
    try {
      const rows = (await P.posReceiptCounter.findMany({ where: { tenantId: tid }, select: { seq: true } })) as Any[];
      out[`${tid}.receiptSeqSum`] = rows.reduce((s, r) => s + Number(r.seq), 0);
    } catch {
      out[`${tid}.receiptSeqSum`] = "err";
    }
  }
  return out;
}
const countsBefore = await snapshotCounts();

if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed บน DB นี้ — รัน scripts/seed-pos-qc.mts ก่อน");
if (!restoScope) skipReasons.push("ชุดข้อมูล QC POS (ร้านอาหาร) ยังไม่ถูก seed — ข้อ K3 ต้องใช้");

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.4 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ร้านกาแฟ ${scope ? "มี" : "ไม่มี"} · seed ร้านอาหาร ${restoScope ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล) · O22=${O22_ANSWER}`);
  console.log(`   A5 (อ่านอย่างเดียว) จำนวนแถวร้าน QC POS: ${JSON.stringify(countsBefore)}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: { coffee: !!scope, resto: !!restoScope }, o22: O22_ANSWER, a5: countsBefore })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด: ${skipReasons.join(" | ")} (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล (ไม่มี = null → ข้อที่ใช้แดงด้วยเหตุ MISSING) ═════════════════════════
const regShared = await tryImport("@/lib/modules/pos/register-shared");
const register = await tryImport("@/lib/modules/pos/register");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const inventory = await tryImport("@/lib/modules/inventory/service");
const sysSvc = await tryImport("@/lib/modules/system/service");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.4-${RAND}`;
const runStart = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** บาร์โค้ดเฉพาะรอบ (13 หลัก ขึ้นต้น 2 = รหัสในร้าน) — ไม่ชนบาร์โค้ด seed */
const BC_BASE = `2${String(Date.now() % 1e8).padStart(8, "0")}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
const BC = (n: number) => `${BC_BASE}${String(n).padStart(2, "0")}`;

// ═════════════════════════ 5. ข้อที่ต้องมี DB (sandbox) ═════════════════════════
const DB_IDS = ["P1.4-R3", "P1.4-K1", "P1.4-K2", "P1.4-K3", "P1.4-K4", "P1.4-K5"];
const sb = { unitIds: [] as string[], systemIds: [] as string[], invSysIds: [] as string[], productIds: [] as string[], invItemIds: [] as string[] };

async function runDb() {
  if (!scope) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  const tid: string = scope.tenantId;
  const restoTid: string = PQC.resto.tenantId;
  const mOwner = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.owner.userId } });
  const owner = {
    userId: PQC.coffee.users.owner.userId,
    role: mOwner?.role ?? "OWNER",
    unitAccess: Array.isArray(mOwner?.unitAccess) ? mOwner.unitAccess : [],
    permissions: (mOwner?.permissions ?? {}) as Record<string, unknown>,
  };

  // ─── sandbox (เขียนแถวแรก ⇒ ด่าน host QC4 ก่อน) ───
  assertQc4BeforeWrite();
  console.log(`\n── sandbox ${TAG} (สาขา 2 + ระบบ POS/คลัง ชั่วคราวในร้าน QC กาแฟ · ระบบ POS ชั่วคราว 1 ตัวในร้าน QC อาหาร) ──`);
  const mkUnit = async (label: string) => {
    const u = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} ${label}`, slug: `${TAG}-${label}` } });
    sb.unitIds.push(u.id);
    return u.id as string;
  };
  const mkSys = async (type: string, label: string, tenantId = tid) => {
    const s = await P.appSystem.create({ data: { tenantId, type, name: `${TAG} ${label}` } });
    sb.systemIds.push(s.id);
    if (type === "INVENTORY") sb.invSysIds.push(s.id);
    return s.id as string;
  };
  let fx = "";
  let u1 = "", u2 = "", posS = "", invS = "", posR = "";
  try {
    u1 = await mkUnit("u1");
    u2 = await mkUnit("u2");
    posS = await mkSys("POS", "POS-S");
    invS = await mkSys("INVENTORY", "INV-S");
    posR = await mkSys("POS", "POS-RESTO", restoTid);
    for (const u of [u1, u2]) {
      await sysSvc.linkUnit(tid, posS, u);
      await sysSvc.linkUnit(tid, invS, u);
    }
  } catch (e) {
    fx = `sandbox:${(e as Error).message.slice(0, 120)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const ctx1 = { tenantId: tid, systemId: posS, unitId: u1 };
  const ctx2 = { tenantId: tid, systemId: posS, unitId: u2 };
  const SYSTEM_ACTOR: unknown = catalog?.CATALOG_SYSTEM_ACTOR ?? owner.userId;
  const cctx = { tenantId: tid, systemId: posS, actorUserId: SYSTEM_ACTOR };
  const rctx = { tenantId: restoTid, systemId: posR, actorUserId: SYSTEM_ACTOR };
  const invCtx = { tenantId: tid, systemId: invS };
  const idOf = (r: Any): string | null => (typeof r === "string" ? r : r?.ok === false ? null : (r?.id ?? r?.product?.id ?? null));
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw Object.assign(new Error(`${label} ล้ม: ${short(r)}`), { code: r.code });
    return r;
  };
  /** สินค้าผูก InvItem ที่มีบาร์โค้ด (ทางเดียวที่บาร์โค้ดซ้ำได้ — catalog.createProduct กันบาร์โค้ดซ้ำในระบบขาย) */
  const mkInvBarcode = async (sku: string, name: string, barcode: string, price: number | null = null) => {
    const it = await inventory.createItem(invCtx, { sku: `${TAG}-${sku}`, name, costSatang: 100, barcode });
    sb.invItemIds.push(it.id);
    const id = idOf(must("ensureForInvItem", await call(catalog, "ensureForInvItem", cctx, it.id)));
    if (!id) throw new Error("ensureForInvItem ไม่คืน id");
    sb.productIds.push(id);
    if (price !== null) must("setPrice", await call(catalog, "setPrice", cctx, id, price));
    return id;
  };
  /** สินค้าไม่ผูกคลัง + บาร์โค้ดของแถวเอง */
  const mkFreeBarcode = async (c: Any, name: string, barcode: string, more: Any = {}) => {
    const id = idOf(must("createProduct", await call(catalog, "createProduct", c, { name, kind: "PRODUCT", basePriceSatang: 1000, barcode, ...more })));
    if (!id) throw new Error("createProduct ไม่คืน id");
    sb.productIds.push(id);
    return id;
  };
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const scan = (c: Any, barcode: string) => call(register, "registerScan", c, owner, { barcode });
  const ids = (r: Any): string[] => (r?.match === "choose" && Array.isArray(r.products) ? r.products.map((p: Any) => p.id) : r?.match === "one" ? [r.product?.id] : []);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

  // ════════ K1 one ════════
  let ONE = "";
  try {
    if (!fx) ONE = await mkInvBarcode("ONE", "น้ำแร่สแกนเดี่ยว P1.4", BC(1), 2500);
  } catch (e) {
    fx ||= `K1:${(e as Error).message.slice(0, 100)}`;
  }
  {
    const a = await scan(ctx1, BC(1));
    const b = await scan(ctx1, BC(1));
    const c = await scan(ctx1, `  ${BC(1)}  `);
    const ok = !!ONE && [a, b, c].every((r) => r?.ok === true && r.match === "one" && r.product?.id === ONE);
    chk("P1.4-K1", ok, "one ×3 = สินค้าเดียวกัน", FX(`${codeOf(a)}/${a?.match} · ${codeOf(b)}/${b?.match} · ช่องว่าง ${codeOf(c)}/${c?.match} · id ${short(ids(a), 40)} vs ${ONE || "-"}`));
  }

  // ════════ R3 ทางเซิร์ฟเวอร์ของ +1 ════════
  {
    let c: Any = { lines: [] };
    c = callSync(regShared, "cartAddProduct", c, ONE, "k-r3-1");
    c = c?.ok === false ? c : callSync(regShared, "cartAddProduct", c, ONE, "k-r3-2");
    const input = c?.ok === false ? null : callSync(regShared, "cartToQuoteInput", c);
    const q = input && input.ok !== false ? await call(register, "quoteRegisterCart", ctx1, owner, input) : { ok: false, code: c?.code ?? "NO_INPUT" };
    const ok = !!ONE && q?.ok === true && Array.isArray(q.lines) && q.lines.length === 1 && q.lines[0].grossSatang === 5000 && q.grandTotalSatang === 5000;
    chk("P1.4-R3", ok, "1 บรรทัด gross 5,000 · ยอด 5,000", FX(`ตะกร้า ${short(c?.lines ?? c, 90)} · quote ${codeOf(q)} บรรทัด ${q?.lines?.length ?? "-"} ยอด ${q?.grandTotalSatang ?? "-"}`));
  }

  // ════════ K2 choose ครบ ════════
  let A = "", B = "", C = "", D = "";
  let fx2 = "";
  try {
    if (!fx) {
      A = await mkInvBarcode("DA", "สบู่ซ้ำ A", BC(2));
      B = await mkInvBarcode("DB", "สบู่ซ้ำ B", BC(2));
      C = await mkInvBarcode("DC", "สบู่ซ้ำ C (เก็บถาวร)", BC(2));
      D = await mkInvBarcode("DD", "สบู่ซ้ำ D (สาขา 2)", BC(2));
      must("archive C", await call(catalog, "archive", cctx, C));
      must("updateProduct D unitId", await call(catalog, "updateProduct", cctx, D, { unitId: u2 }));
    }
  } catch (e) {
    fx2 = `K2:${(e as Error).message.slice(0, 100)}`;
  }
  {
    const s1 = await scan(ctx1, BC(2));
    const s1b = await scan(ctx1, BC(2));
    const s2 = await scan(ctx2, BC(2));
    const ok =
      !fx2 && !!A &&
      s1?.match === "choose" && sameSet(ids(s1), [A, B]) && ids(s1).join(",") === ids(s1b).join(",") &&
      s2?.match === "choose" && sameSet(ids(s2), [A, B, D]) && ![...ids(s1), ...ids(s2)].includes(C);
    chk("P1.4-K2", ok, "สาขา 1 choose {A,B} คงที่ · สาขา 2 choose {A,B,D} · ไม่มี C",
      FX(`${fx2 ? `${fx2} · ` : ""}สาขา1 ${s1?.match ?? codeOf(s1)} ${ids(s1).length} ตัว (คงที่ ${ids(s1).join(",") === ids(s1b).join(",")}) · สาขา2 ${s2?.match ?? codeOf(s2)} ${ids(s2).length} ตัว · มี C ${[...ids(s1), ...ids(s2)].includes(C)}`));
  }

  // ════════ K3 บาร์โค้ดร้านอื่น ════════
  {
    let W = "";
    let e3 = "";
    try {
      if (!fx) W = await mkFreeBarcode(rctx, "เครื่องดื่มร้านอื่น P1.4", BC(3));
    } catch (e) {
      e3 = `K3:${(e as Error).message.slice(0, 100)}`;
    }
    const exists = W ? await P.posProduct.count({ where: { tenantId: restoTid, barcode: BC(3) } }) : 0;
    const r = await scan(ctx1, BC(3));
    chk("P1.4-K3", !e3 && exists === 1 && r?.ok === true && r.match === "none", "แถวร้านอื่นมี 1 · ร้านกาแฟ none", FX(`${e3 ? `${e3} · ` : ""}แถวร้านอื่น ${exists} · ผล ${codeOf(r)}/${r?.match ?? "-"}`));
  }

  // ════════ K4 สินค้าผูกสาขา 2 ════════
  {
    let E = "";
    let e4 = "";
    try {
      if (!fx) E = await mkFreeBarcode(cctx, "ขนมเฉพาะสาขา 2", BC(4), { unitId: u2 });
    } catch (e) {
      e4 = `K4:${(e as Error).message.slice(0, 100)}`;
    }
    const r1 = await scan(ctx1, BC(4));
    const r2 = await scan(ctx2, BC(4));
    chk("P1.4-K4", !e4 && !!E && r1?.ok === true && r1.match === "none" && r2?.ok === true && r2.match === "one" && r2.product?.id === E,
      "สาขา 1 none · สาขา 2 one", FX(`${e4 ? `${e4} · ` : ""}สาขา1 ${codeOf(r1)}/${r1?.match ?? "-"} · สาขา2 ${codeOf(r2)}/${r2?.match ?? "-"}`));
  }

  // ════════ K5 เก็บถาวร ════════
  {
    let e5 = "";
    let F = "", G = "";
    try {
      if (!fx) {
        F = await mkFreeBarcode(cctx, "สินค้าเลิกขาย (บาร์โค้ดแถว)", BC(5));
        G = await mkInvBarcode("GA", "สินค้าเลิกขาย (บาร์โค้ดคลัง)", BC(6));
        must("archive F", await call(catalog, "archive", cctx, F));
        must("archive G", await call(catalog, "archive", cctx, G));
      }
    } catch (e) {
      e5 = `K5:${(e as Error).message.slice(0, 100)}`;
    }
    const r1 = await scan(ctx1, BC(5));
    const r2 = await scan(ctx1, BC(6));
    chk("P1.4-K5", !e5 && !!F && !!G && r1?.ok === true && r1.match === "none" && r2?.ok === true && r2.match === "none",
      "none ทั้งสองทาง", FX(`${e5 ? `${e5} · ` : ""}แถว ${codeOf(r1)}/${r1?.match ?? "-"} · คลัง ${codeOf(r2)}/${r2?.match ?? "-"}`));
  }
}

// ═════════════════════════ 6. คืนสภาพ (ลบทุกอย่างที่ข้อสอบสร้าง) ═════════════════════════
async function del(model: string, where: Any): Promise<number> {
  const d = P[model];
  if (typeof d?.deleteMany !== "function") return 0;
  try {
    return (await d.deleteMany({ where })).count as number;
  } catch (e) {
    console.log(`  (ลบ ${model} ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
    return -1;
  }
}
async function cleanup() {
  const units = sb.unitIds;
  const systems = sb.systemIds;
  if (systems.length && typeof P.posProduct?.findMany === "function") {
    try {
      const extra = ((await P.posProduct.findMany({ where: { tenantId: { in: TIDS }, systemId: { in: systems } }, select: { id: true } })) as Any[]).map((r) => r.id);
      sb.productIds = [...new Set([...sb.productIds, ...extra])];
    } catch {
      /* ใช้รายการที่จำไว้ */
    }
  }
  const evWhere = { tenantId: { in: TIDS }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : []), { createdAt: { gte: runStart }, idempotencyKey: { contains: TAG } }] };
  for (let i = 0; i < 10 && (units.length || systems.length); i++) {
    const pend = await P.outboxEvent.count({ where: { ...evWhere, status: "PENDING" } }).catch(() => 0);
    if (pend === 0) break;
    await sleep(500);
  }
  const counts: Record<string, number> = {};
  counts.outbox = await del("outboxEvent", evWhere);
  counts.audit = await del("auditLog", { tenantId: { in: TIDS }, createdAt: { gte: runStart }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), { targetId: { in: [...sb.productIds, ...sb.invItemIds, ...systems, ...units] } }] });
  for (const m of ["posProductOptionGroup", "posVariant", "recipeLine", "posProductChannelPrice", "posProductAvailability", "posProductUnit"]) {
    if (sb.productIds.length) await del(m, { productId: { in: sb.productIds } });
  }
  counts.product = sb.productIds.length ? await del("posProduct", { id: { in: sb.productIds } }) : 0;
  if (systems.length) counts.productBySystem = await del("posProduct", { tenantId: { in: TIDS }, systemId: { in: systems } });
  if (systems.length) await del("posCategory", { tenantId: { in: TIDS }, systemId: { in: systems } });
  for (const sbInv of sb.invSysIds) {
    const mvIds = ((await P.invMovement.findMany({ where: { tenantId: { in: TIDS }, systemId: sbInv }, select: { id: true } }).catch(() => [])) as Any[]).map((m) => m.id);
    if (mvIds.length) counts.invJournal = (counts.invJournal ?? 0) + (await del("accountJournalEntry", { tenantId: { in: TIDS }, refType: "InvMovement", refId: { in: mvIds } }));
    for (const m of ["invMovement", "invLot", "invLocationStock", "invItemImage"]) await del(m, { tenantId: { in: TIDS }, OR: [{ systemId: sbInv }, { itemId: { in: sb.invItemIds } }] });
    counts.invItem = (counts.invItem ?? 0) + (await del("invItem", { tenantId: { in: TIDS }, systemId: sbInv }));
    for (const m of ["invLocation", "invCategory", "invSettings"]) await del(m, { tenantId: { in: TIDS }, systemId: sbInv });
  }
  if (units.length) await del("posReceiptCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (units.length) await del("appSystemUnit", { unitId: { in: units } });
  if (systems.length) {
    await del("appSystemUnit", { systemId: { in: systems } });
    await del("appSystem", { id: { in: systems } });
  }
  if (units.length) await del("businessUnit", { id: { in: units } });
  console.log(`  ลบแล้ว: ${JSON.stringify(counts)} · สาขา ${units.length} · ระบบ ${systems.length}`);
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
try {
  await runPure();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup();
  } catch (e) {
    console.log(`💥 cleanup: ${(e as Error).message.slice(0, 200)}`);
  }
}
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
chk("P1.4-Z1", drift.length === 0, "ก่อน = หลัง", drift.length ? drift.join(", ") : "เท่ากันทุกตาราง");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("P1.4-Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id) && !skippedChecks.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${skippedChecks.size ? ` · ข้าม ${skippedChecks.size}` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, skippedChecks: Object.fromEntries(skippedChecks), missing: skipReasons, o22: O22_ANSWER, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.4 (ใบอื่นเป็นเจ้าของ): P1.2 ตัวเลือกสินค้า + บาร์โค้ดน้ำหนัก · P1.5 พักบิล · P1.6 จอชำระเงิน ·
// กล้องจริง (ขออนุญาต · อ่าน · ปิดแผ่น · Safari) = ผู้คุมงานตรวจในเบราว์เซอร์
