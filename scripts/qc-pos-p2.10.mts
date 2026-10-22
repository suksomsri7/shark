// QC — POS RUN ใบ P2.10: จอลูกค้า (จอที่ 2) — จับคู่ด้วยรหัส → คุกกี้ · ภาพบิลบนแถวของจอ + โพลสั้น · DTO เนื้อหา · สถานะช่องจ่ายเงิน
//   เขียนก่อนสร้าง (fail-before) · ผู้สร้าง (builder) P2.10 (ใบเดียว S+U)
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.10.md §0 · §2 R1–R8 · §3 ตาราง DTO · §6 แผนข้อสอบ 12 ข้อ · §7 หมุด · §10 มติผู้คุมงาน 1–12 (ผูกมัด):
//   มติ 1 ภาพบนแถว + โพล 1 วิ (cart/paying) · 3 วิ (idle) · 1 วิ 20 วิหลัง done · changed:false ทางลัด · ไม่มีแถว rate-limit ต่อโพล · lastPolledAt ทุก 30 วิ
//   มติ 2 รหัสจับคู่ 8 ตัว Crockford อายุ 10 นาที → คุกกี้ pos_display (httpOnly · Secure · SameSite=Lax · Path=/d · 400 วัน) · เก็บแต่ sha256 · pairFailCount ≤ 5
//   มติ 3 PDPA (ชื่อต้น ≤ 30 ตัว + ระดับเสมอ · แต้มตาม showPoints · ไม่มีเบอร์/รหัสสมาชิก/นามสกุล/รหัสบัตร/เลขมัดจำ · โค้ดคูปองแสดงได้)
//   มติ 4 เครื่อง ACTIVE ที่ลงทะเบียนแล้วเท่านั้น · 1 จอ ACTIVE ต่อเครื่อง · ค่าตั้งอยู่บนแถวของจอ · เพิกถอนเครื่อง = จอหลุด
//   มติ 6 เซิร์ฟเวอร์สร้าง QR/ลิงก์ใบเสร็จเอง (ใบขอรับเงิน PENDING ของเครื่องนี้ / QR นิ่งของสาขา · บิลของกะเครื่องนี้ ≤ 15 นาที + qrEReceipt) ·
//          qr/receiptUrl ที่ client ส่ง = DISPLAY_STATE_INVALID · PAID โผล่ในการอ่านครั้งถัดไปโดยไม่ต้อง publish ใหม่
//   มติ 9 ตาราง PosCustomerDisplay (migration *_pos_p210_customer_display) · ผู้เขียนเดียว pos/display.ts · JSON ≤ 16 KB · ≤ 20 บรรทัด + moreCount
//   มติ 10 ข้อสอบนี้ 12 ข้อ (+ CT3 = 13 · ORACLE-ADD ผู้คุม 15 ต.ค. (P2.10 fix 1)) · ORACLE-EDIT ที่อนุมัติล่วงหน้า = qc-pos-p1.18.mts:312 (rewardNearCustomerDisplay → live) เท่านั้น
//
// ชื่อที่ข้อสอบนี้ตั้ง (ผู้สร้างต้องทำให้มีจริง — ตารางเต็มใน ledger/wo-notes/pos-P2.10-oracle.md):
//   src/lib/modules/pos/display.ts (ไม่ใช่ "use server" · คืนคำปฏิเสธเป็นข้อมูล {ok:false, code, message} ไม่ throw):
//     enableCustomerDisplay(ctx, actor, {deviceId} | {deviceCode}) → {ok:true, pairCode, pairCodeExpiresAt, display} · สิทธิ์ pos.device.manage
//     pairCustomerDisplay({code}, {ip}) → {ok:true, token, displayId} (ไม่มี session · เพดาน 10/นาที/IP ผ่าน core/rate-limit-db คีย์มี ip)
//     revokeCustomerDisplay(ctx, actor, {deviceId}) · updateCustomerDisplaySettings(ctx, actor, {deviceId, showPoints?, idleText?, locale?})
//     customerDisplayStatus(ctx, actor, {deviceId}) → {ok:true, display:{paired, pendingCodeExpiresAt, online, lastPolledAt, showPoints, idleText, locale}}
//     publishDisplayState(ctx, actor, {deviceCode, seq, state}) → {ok:true, paired:true, seq, written} | {ok:true, paired:false} · สิทธิ์ pos.sale.create
//     readCustomerDisplay({token, sinceSeq?}) → {ok:true, changed:false, seq, nextPollMs} | {ok:true, changed:true, seq, view, nextPollMs}
//   src/lib/modules/pos/display-actions.ts ("use server" บาง ๆ) · src/lib/modules/pos/display-shared.ts (บริสุทธิ์: DisplayView DisplayState
//     MAX_DISPLAY_LINES=20 MAX_DISPLAY_STATE_BYTES=16384 nextPollMs displayStateSchema DISPLAY_COOKIE="pos_display" DISPLAY_COOKIE_OPTIONS)
//   รหัสปฏิเสธ DISPLAY_NOT_PAIRED PAIR_CODE_INVALID DEVICE_NOT_REGISTERED DISPLAY_STATE_INVALID PERMISSION_DENIED NOT_FOUND RATE_LIMITED ·
//   ข้อความ pos.display.errors.<camel> th/en · audit pos.display.enable|pair|revoke · หน้า src/app/(store)/d/page.tsx · hook components/pos/display/use-display-publish.ts
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.9b): SKIP เมื่อของ P2.10 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · Z1 เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST2 (ไม่โหลด prisma)
//    ฐาน = QC4 เท่านั้น · ร้านชั่วคราว `posqc-p210-<rand>` (+ `-t2`) ลบทั้งร้านใน finally · ถังเพดานอัตราของรอบ (คีย์มีรหัสรอบ) ลบด้วย
//    ฟิกซ์เจอร์ผ่านฟังก์ชันของโมดูล — ยกเว้น SQL ดิบบนตารางใหม่ในร้านชั่วคราว: เลื่อนเวลา (pairCodeExpiresAt · stateAt · lastPolledAt) +
//    ตั้ง pairFailCount = 5 (ล็อก) · เลื่อน PosSale.createdAt ของบิลชั่วคราว 16 นาที (บิลเก่า) · ตั้ง PaymentProfile ของร้านชั่วคราว
//    ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.10";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/** ฐานของข้อสอบ (57a8b19a) — ใช้เมื่อหาหมุดของเลนไม่ได้ (หมุด ST2 เทียบ "ของที่ใบนี้แก้" เท่านั้น) */ // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin) 
const BASE_REV = process.env.P210_BASE || "57a8b19a";
/** sha256 ของ scripts/pos-sale-contract.json (ใบนี้ไม่แตะสัญญา createSale · ค่าเดียวกับ qc-pos-p2.9b L1) */
const CONTRACT_SHA = "762e073cd5f80eeeb915835ae6b85e5793956facdfe233f90d65484db04dac55"; // ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 · contract +4 optional keys P3.6 · ba68f669 → 762e073c) · ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p2.10 ST2): sha สัญญาหลัง P3.4 S (0617d17b · +CreateSaleInput.offline) — เดิม 72afb258e9c0dc46c4d5ea2346835b6a56afda551038325d14ed9e12910546ad

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต (ไม่บอกว่ามีอยู่) · X3 สิทธิ์ · X4 เงิน (ของที่เซิร์ฟเวอร์สร้างเอง) · X5 ไม่เขียน/PDPA · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.10-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[R1 มติ 9] migration *_pos_p210_customer_display เขียนมือ: SET lock_timeout · CREATE TABLE \"PosCustomerDisplay\" · unique (tokenHash) · partial unique (deviceId) WHERE status = 'ACTIVE' · partial unique (pairCodeHash) WHERE NOT NULL · ไม่มี DROP/DELETE/UPDATE/ALTER ตารางอื่น/REFERENCES · schema คอลัมน์ R1 ครบ ไม่มี @relation · scope.ts PosCustomerDisplay: sys() · pos-qc-env · display.ts/display-actions.ts/display-shared.ts export ครบ · display.ts ผู้เขียนเดียวของตาราง · ไม่ import member/account · ไม่เรียก createSale/emitOutbox"),
  D("ST2", "S", "[§7 มติ 5 10] หมุด (เทียบ merge-base): register*.ts service.ts tender*.ts payment-intent.ts held-cart.ts outbox-consumers.ts proxy.ts pos-sale-contract.json ไม่มี hunk (+ sha) · RegisterScreen.tsx/InterimPayDialog.tsx เพิ่มเฉพาะในบล็อก // POS P2.10 ▸ … ◂ · ข้อสอบเดิมไม่ถูกแก้ (ยกเว้น ORACLE-EDIT p1.18 บรรทัด rewardNearCustomerDisplay) · S5.17 สะอาด ‖ มีจริง: ข้อความ pos.display.errors th/en 7 รหัส · หน้า /d (force-dynamic · noindex · ไม่อ่าน session · คุกกี้ pos_display) · hook import แค่ display-actions/display-shared · DeviceSettings ใช้ display-actions · fact rewardNearCustomerDisplay live"),
  // ── PA จับคู่ ──
  D("PA1", "X3", "[R2 มติ 2 4] enableCustomerDisplay(D1) → รหัส 8 ตัว Crockford · หมดอายุ +10 นาที · แถว ACTIVE (ร้าน/ระบบ/สาขา/deviceId/createdByUserId) · ไม่มีรหัสตัวจริงในแถว/audit · เปิดซ้ำ = รหัสใหม่ แถว ACTIVE ยัง 1 · รหัสเก่าใช้ไม่ได้ · แคชเชียร์ → PERMISSION_DENIED · รหัสเครื่องไม่ลงทะเบียน (D2) / เครื่องสาขาอื่น / id มั่ว → DEVICE_NOT_REGISTERED ข้อความเดียว · audit pos.display.enable · สถานะ = ยังไม่จับคู่ + มีรหัสรอ"),
  D("PA2", "X1", "[R2 มติ 2] pairCustomerDisplay: รหัสถูก → token (≥ 32 ตัว) · tokenHash = sha256(token) · รหัสถูกล้าง · token/รหัสไม่อยู่ในแถว/audit · ใช้รหัสซ้ำ/ผิด/หมดอายุ/ถูกล็อก (pairFailCount 5) → PAIR_CODE_INVALID ข้อความเดียวกัน · เปิดใหม่ล้างตัวนับ · IP เดียว 11 ครั้ง/นาที → RATE_LIMITED · DISPLAY_COOKIE_OPTIONS ตามมติ 2 · audit pos.display.pair · สถานะ = จับคู่แล้ว"),
  D("PA3", "X2", "[R2 R4 มติ 4] จับคู่ใหม่หมุน token (เก่า → DISPLAY_NOT_PAIRED) · ยกเลิกจับคู่ → DISPLAY_NOT_PAIRED + audit pos.display.revoke · เพิกถอนเครื่อง → จอหลุด · token มั่ว/ถูกยกเลิก = คำปฏิเสธเดียวกัน · ร้านอื่น/สาขาอื่น/id มั่ว ยกเลิก/แก้ค่าตั้ง → NOT_FOUND ข้อความเดียว แถวไม่เปลี่ยน · สาขา B publish รหัส D1 → paired:false · แคชเชียร์ยกเลิก → PERMISSION_DENIED"),
  // ── DS ภาพบนแถว ──
  D("DS1", "X1", "[R3 R4 มติ 1 9] seq 6 แล้ว 5 → 5 ไม่เขียน · seq ซ้ำ → ไม่เขียน · ×10 พร้อมกัน seq เดียว → written 1 ครั้ง · sinceSeq = seq → changed:false ไม่มี view · เครื่องไม่ลงทะเบียน/จอถูกยกเลิก → paired:false ไม่สร้างแถว · ไม่มีสิทธิ์ → PERMISSION_DENIED · seq ผิดรูป → DISPLAY_STATE_INVALID · publish/read ไม่เขียน audit/outbox · read ไม่เรียกตัวจำกัดอัตรา · lastPolledAt เขียนไม่ถี่กว่า 30 วิ · ออนไลน์"),
  D("DS2", "X5", "[R4 มติ 1 9] stateAt เก่า 121 วิ → idle (ไม่มีบรรทัด/สมาชิก) แม้ sinceSeq = seq · done เก่า 21 วิ → idle · 21 บรรทัด → 20 + moreCount 1 · JSON > 16 KB / คีย์แปลก → DISPLAY_STATE_INVALID แถวไม่เปลี่ยน · ข้อความ 81 ตัว → ปฏิเสธหรือตัดเหลือ ≤ 80 · nextPollMs idle 3000 · cart/paying/done 1000"),
  // ── CT เนื้อหา ──
  D("CT1", "-", "[§3 R6 R7 มติ 4] หัวจอ = ชื่อร้านใบเสร็จ + โลโก้ + ชื่อสาขา + ชื่อเครื่อง · บรรทัด/ยอด/คูปอง WELCOME50/ส่วนลดสมาชิกตรงที่ส่ง · สแตมป์ filled = min(stamps+toAdd, slots) · near เมื่อเหลือ ≤ 2 · ไม่มีโปรแกรม → null · ค่าตั้งปริยาย showPoints true locale th · แก้ locale en + idleText → อยู่ใน view · locale fr / idleText 81 ตัว → ปฏิเสธ แถวไม่เปลี่ยน"),
  D("CT2", "X5", "[R3 มติ 3] PDPA: view ไม่มีเบอร์/เบอร์ปิดบัง/รหัสสมาชิก/นามสกุล (สแกนทั้งก้อน) · ชื่อต้นคำแรก ≤ 30 ตัว · state ที่มี member.phone/phoneMasked/memberCode/lastName · pay.giftCardNumber/depositNo → DISPLAY_STATE_INVALID · showPoints=false → ไม่มีแต้มสะสม/แต้มที่ได้ใน view แม้ส่งมา"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.10 fix 1) — CT3 (R1 F2 F4 · มติ fix1 ข้อ 2 4 8)
  D("CT3", "X5", "[R3 มติ 3 · fix1 มติ 2 4] ชื่อในบรีฟสมาชิก = รหัสสมาชิก (สมาชิกไม่มีชื่อ) → view.member.firstName '' · รหัสสมาชิกไม่อยู่ใน view (cart + done) · ชื่อจริงยังแสดง ‖ totals.member มี kind: POINTS + showPoints=false → ป้ายกลาง ไม่มีตัวเลข/จำนวนแต้ม · VOUCHER ไม่มีชื่อ (ไม่ส่งป้าย / ป้าย = โค้ด) → 'คูปอง' ไม่มีโค้ด voucher · VOUCHER มีชื่อ/TIER คงป้าย · showPoints=true → ป้ายแต้มเดิม"),
  // ── PY ช่องจ่ายเงิน ──
  D("PY1", "X4", "[R3 มติ 6] pay.qr / pay.qrPayload จาก client → DISPLAY_STATE_INVALID · intentId ของ D1 (PENDING) → qr = qrPayload + ยอด + PENDING ของใบนั้น · ใบของเครื่องอื่น/สาขาอื่น → ไม่ใช้ (QR นิ่งของร้านยอด roundSatang) · ไม่มี intentId → QR นิ่ง · markIntentPaid → PAID ในการอ่านถัดไปโดยไม่ publish (sinceSeq เดิมก็ต้องเห็น) · ชำระแล้ว/คงเหลือ/รับ/ทอนตรงที่ส่ง · บัตรไม่มีใบ → qr null"),
  D("PY2", "X4", "[R3 มติ 6 8] done ของบิลกะ D1 → receiptUrl = <origin>/r/<publicToken> · receiptNo/ทอน/แต้มที่ได้ตรง · receiptUrl จาก client → DISPLAY_STATE_INVALID · บิลของ D3 / บิลเก่า 16 นาที / id มั่ว → null · qrEReceipt ปิด → null"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว (+ -t2) เหลือ 0 แถวทุกตารางที่มี tenantId (รวม PosCustomerDisplay) + Tenant ถูกลบ · ถังเพดานอัตราของรอบ 0 · ลายนิ้วมือร้าน seed (เครื่อง/กะ/ใบขอรับเงิน/ระบบ/โปรไฟล์จ่ายเงิน/จอลูกค้า) เท่าเดิม"),
];

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
  const full = id.startsWith("P2.10-") ? id : `P2.10-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : "UNKNOWN");
const THAI = /[ก-๛]/;
const refused = (r: Any, ...codes: string[]) => r?.ok === false && codes.includes(String(r.code));
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ฟังก์ชัน ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true, name: (e as Error)?.name };
  }
}
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const camel = (code: string) => code.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const joinP = (p: string[], ok = "ครบ") => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || ok;
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const sha256b64u = (s: string) => createHash("sha256").update(s).digest("base64url");
function walk(dir: string, out: string[] = [], re = /\.(tsx|ts)$/): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out, re);
    else if (re.test(f)) out.push(rel);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
const exportsType = (src: string, n: string) => new RegExp(`export\\s+(type|interface)\\s+${n}\\b|export\\s+type\\s*\\{[^}]*\\b${n}\\b`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
function fnBody(src: string, n: string): string {
  const m = new RegExp(`(export\\s+)?(async\\s+)?function\\s+${n}\\b`).exec(src);
  if (!m) return "";
  const next = src.slice(m.index + 10).search(/\n(export\s|async function\s|function\s)/);
  return next < 0 ? src.slice(m.index) : src.slice(m.index, m.index + 10 + next);
}
function gitBuf(args: string[]): Buffer | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}
const gitStr = (args: string[]) => gitBuf(args)?.toString("utf8") ?? null;

const POS_DIR = "src/lib/modules/pos";
const F = {
  display: `${POS_DIR}/display.ts`,
  actions: `${POS_DIR}/display-actions.ts`,
  shared: `${POS_DIR}/display-shared.ts`,
  hook: "src/components/pos/display/use-display-publish.ts",
  page: "src/app/(store)/d/page.tsx",
  pageDir: "src/app/(store)/d",
  displayUi: "src/components/pos/display",
  register: "src/components/pos/register/RegisterScreen.tsx",
  payDialog: "src/components/pos/register/InterimPayDialog.tsx",
  deviceSettings: "src/app/app/sys/[id]/pos/settings/DeviceSettings.tsx",
  integrations: "src/lib/pos-integrations.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  contract: "scripts/pos-sale-contract.json",
  p118: "scripts/qc-pos-p1.18.mts",
  self: "scripts/qc-pos-p2.10.mts",
};
const MIG_RE = /^\d{14}_pos_p210_customer_display$/;
const migDir = (): string => {
  const abs = join(ROOT, "prisma/migrations");
  if (!existsSync(abs)) return "";
  const d = readdirSync(abs).find((x) => MIG_RE.test(x));
  return d ? `prisma/migrations/${d}/migration.sql` : "";
};
const CODES = ["DISPLAY_NOT_PAIRED", "PAIR_CODE_INVALID", "DEVICE_NOT_REGISTERED", "DISPLAY_STATE_INVALID", "PERMISSION_DENIED", "NOT_FOUND", "RATE_LIMITED"] as const;
const DISPLAY_FNS = ["enableCustomerDisplay", "pairCustomerDisplay", "revokeCustomerDisplay", "publishDisplayState", "readCustomerDisplay", "updateCustomerDisplaySettings", "customerDisplayStatus"] as const;
const ACTION_FNS = ["enableCustomerDisplayAction", "revokeCustomerDisplayAction", "updateCustomerDisplaySettingsAction", "customerDisplayStatusAction", "publishDisplayStateAction"] as const;
const SHARED_CONSTS = ["MAX_DISPLAY_LINES", "MAX_DISPLAY_STATE_BYTES", "nextPollMs", "displayStateSchema", "DISPLAY_COOKIE", "DISPLAY_COOKIE_OPTIONS"] as const;
const SHARED_TYPES = ["DisplayView", "DisplayState"] as const;
/** โมดูลเซิร์ฟเวอร์ที่ไฟล์ "use client" ห้าม import (ชุดของ qc-pos-p1.3 S5.17 + pos/display ตัวเต็ม) */
const SERVER_MOD = /^(@\/lib\/modules\/pos\/(register|catalog|service|index|db|access|tabs|display)(\.tsx?)?$|@\/lib\/modules\/pos$|\.{1,2}\/(.*\/)?(register|catalog|service|db|display)(\.tsx?)?$|@\/lib\/core\/(db|context)$|@prisma\/client$|next\/headers$|server-only$|@\/lib\/modules\/(inventory|account|member|crm|system)(\/|$))/;
const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2"].map((x) => `P2.10-${x}`);
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.display))) skipReasons.push(`${F.display} ยังไม่มี`);
for (const n of DISPLAY_FNS) if (!exportsFn(srcOf(F.display), n)) skipReasons.push(`ยังไม่มี export ${n} (pos/display.ts)`);
if (!migDir()) skipReasons.push("ยังไม่มี migration *_pos_p210_customer_display");

// ── หมุดของเลน (หมุด ST2 เทียบเฉพาะสิ่งที่ใบนี้แก้) ──
const LANE_PIN = "ebcede2c"; // ORACLE-EDIT ผู้คุม 22.10 (CD-RP13 p2.10 · re-pin e46a909a → ebcede2c) · ORACLE-EDIT ผู้คุม 22.10 (CD-SKEL-O2 p2.10 · re-pin 10e589e2 → e46a909a) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP12b p2.10 · re-pin 76f2e4bc → 10e589e2) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP12 p2.10 · re-pin c2ad0f42 → 76f2e4bc) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP11b p2.10 · re-pin 144b244b → c2ad0f42) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP11 p2.10 → re-pin commit · re-pin 101f4045 → 144b244b) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP10 p2.10 → re-pin commit · re-pin a7b2acb9 → 101f4045) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP9b p2.10 → re-pin commit · re-pin 41d5f66c → a7b2acb9) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 p2.10 → re-pin commit · re-pin 3c23702c → 41d5f66c) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP8 p2.10 → re-pin commit · re-pin 560f61ee → 3c23702c) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP7 p2.10 → re-pin commit · re-pin b63713e3 → 560f61ee) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP6c · p2.10 → re-pin commit · re-pin 154606e0 → b63713e3) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP6b · p2.10 → re-pin commit · re-pin de965895 → 154606e0) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP6 · p2.10 → re-pin commit · re-pin d6cc1e01 → de965895) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP5 · p2.10 → re-pin commit · re-pin 0816b6ad → d6cc1e01) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP4 · p2.10 → re-pin commit · re-pin 0c1a1ad1 → 0816b6ad) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP3 · p2.10 → re-pin commit · re-pin 59d7f203 → 0c1a1ad1) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP2c · p2.10 → re-pin commit · re-pin 44ad390a → 59d7f203) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP2b · p2.10 → re-pin commit · re-pin d1ca5f2b → 44ad390a) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP2 · p2.10 → re-pin commit · re-pin 096c405d → d1ca5f2b) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1b · p2.10 → re-pin commit · re-pin c687501e → 096c405d) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1 lane-pin · p2.10 → re-pin commit · re-pin 728dae0e → c687501e) · ORACLE-EDIT ผู้คุม 16.10 (HF-FU2 lane-pin · p2.10 → re-pin commit · re-pin 3d2f6db8 → 728dae0e) · ORACLE-EDIT ผู้คุม 16 ต.ค. 20:0xZ (CD-FU2a · re-pin → 3d2f6db8 = commit re-pin CD-B1c ของผู้คุม · ต้นไม้ผลิตภัณฑ์ = c5fc223b) · ก่อนหน้า: ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin · gates108): หมุด = commit re-pin ของผู้คุม 280b56f7 (ต่อจาก merge 05975437 · แก้แต่ scripts/ — ต้นไม้ผลิตภัณฑ์เท่ากับ merge) เพื่อให้กฎ "ข้อสอบเดิมไม่ถูกแก้" วัดจากหลัง re-pin ของผู้คุม ไม่ใช่วงกลมกับ commit re-pin เอง
const MB = (() => {
  const mb = gitStr(["rev-parse", "--verify", "-q", `${LANE_PIN}^{commit}`])?.trim(); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin → merge 05975437): หมุดคงที่ 05975437 (ฐานของ P2.14 = first parent ของ merge) แทนฐานร่วมกับสาขาต้นทาง
  return process.env.P210_BASE ? BASE_REV : mb || BASE_REV;
})();
/** บรรทัดที่เพิ่ม (เลขบรรทัดของไฟล์ปัจจุบัน) + จำนวนบรรทัดที่ลบ เทียบ MB (รวมของที่ยังไม่ commit) */
function diffLines(f: string): { added: number[]; removed: number; err: string } {
  const out = gitStr(["diff", "--no-color", "-U0", MB, "--", f]);
  if (out === null) return { added: [], removed: 0, err: `git diff ${MB} ไม่ได้` };
  const added: number[] = [];
  let removed = 0;
  for (const m of out.matchAll(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const del = m[1] === undefined ? 1 : Number(m[1]);
    const start = Number(m[2]);
    const add = m[3] === undefined ? 1 : Number(m[3]);
    removed += del;
    for (let i = 0; i < add; i++) added.push(start + i);
  }
  return { added, removed, err: "" };
}
/** เลขบรรทัด (1-based) ที่อยู่ในบล็อก `POS P2.10 ▸ … ◂` (บรรทัดเปิดถึงบรรทัดแรกที่มี ◂) */
function markedLines(src: string): Set<number> {
  const s = new Set<number>();
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/POS P2\.(10|14) ▸/.test(lines[i]!)) continue; // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 U2 · CD-U2b): RegisterScreen/InterimPayDialog รับบล็อกมาร์กของใบปิดเฟส `// POS P2.14 ▸ … ◂` ด้วย (H1 offline gate) — กติกา "เพิ่มได้เฉพาะในบล็อกมาร์ก" คงเดิม
    let j = i;
    while (j < lines.length && !lines[j]!.slice(j === i ? lines[i]!.indexOf("▸") : 0).includes("◂")) j++;
    for (let k = i; k <= Math.min(j, lines.length - 1); k++) s.add(k + 1);
    i = j;
  }
  return s;
}

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
let st2PinsOk = false;
function runStatic(): void {
  console.log(`\n── ST ข้อสถิต (ไม่แตะ DB · merge-base ${MB.slice(0, 10)}) ──`);
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1 migration + schema + scope + qc-env + exports + ผู้เขียนเดียว
  {
    const p: string[] = [];
    const mf = migDir();
    const mig = mf ? rd(mf).replace(/--.*$/gm, "") : "";
    if (!mig) p.push("ไม่มีไฟล์ migration *_pos_p210_customer_display");
    else {
      if (!/SET\s+lock_timeout\s*=?\s*'\d+s'/i.test(mig)) p.push("ไม่มี SET lock_timeout");
      if (!/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?"PosCustomerDisplay"\s*\(/i.test(mig)) p.push("ไม่มี CREATE TABLE \"PosCustomerDisplay\"");
      const uniqIdx = (col: string, where: RegExp | null) =>
        new RegExp(`CREATE\\s+UNIQUE\\s+INDEX\\s+(IF\\s+NOT\\s+EXISTS\\s+)?"[^"]+"\\s+ON\\s+"PosCustomerDisplay"\\s*\\(\\s*"${col}"\\s*\\)${where ? `\\s*WHERE\\s*\\(?\\s*${where.source}` : "\\s*;"}`, "i").test(mig);
      if (!uniqIdx("tokenHash", null) && !/"tokenHash"[^,\n]*UNIQUE/i.test(mig) && !/UNIQUE\s*\(\s*"tokenHash"\s*\)/i.test(mig)) p.push("ไม่มี unique (tokenHash)");
      if (!uniqIdx("deviceId", /"status"\s*=\s*'ACTIVE'/)) p.push("ไม่มี partial unique (deviceId) WHERE status = 'ACTIVE'");
      if (!uniqIdx("pairCodeHash", /"pairCodeHash"\s+IS\s+NOT\s+NULL/)) p.push("ไม่มี partial unique (pairCodeHash) WHERE pairCodeHash IS NOT NULL");
      for (const bad of [/\bDROP\b/i, /\bDELETE\b/i, /\bUPDATE\b/i, /\bRENAME\b/i, /\bREFERENCES\b/i, /ALTER\s+TABLE\s+"(?!PosCustomerDisplay")/i]) if (bad.test(mig)) p.push(`มีคำสั่งต้องห้าม ${bad.source}`);
    }
    const blk = prismaBlock(schemaSrc, "model", "PosCustomerDisplay");
    if (!blk) p.push("schema ไม่มี model PosCustomerDisplay");
    else {
      const spec: [string, string][] = [
        ["id", "String"], ["tenantId", "String"], ["systemId", "String"], ["unitId", "String"], ["deviceId", "String"], ["status", "(PosCustomerDisplayStatus|String)"],
        ["tokenHash", "String\\?"], ["pairCodeHash", "String\\?"], ["pairCodeExpiresAt", "DateTime\\?"], ["pairFailCount", "Int"], ["showPoints", "Boolean"],
        ["idleText", "String\\?"], ["locale", "String\\?"], ["state", "Json\\?"], ["stateSeq", "Int"], ["stateAt", "DateTime\\?"], ["lastPolledAt", "DateTime\\?"],
        ["createdByUserId", "String"], ["revokedAt", "DateTime\\?"], ["createdAt", "DateTime"], ["updatedAt", "DateTime"],
      ];
      const bad = spec.filter(([f, t]) => !new RegExp(`^${f}\\s+${t}(\\s|$)`).test(fieldLine(blk, f))).map(([f]) => f);
      if (bad.length) p.push(`PosCustomerDisplay ฟิลด์ไม่ตรง ${bad.join(",")}`);
      if (!/@unique/.test(fieldLine(blk, "tokenHash")) && !/@@unique\(\[\s*tokenHash\s*\]/.test(blk)) p.push("tokenHash ไม่ @unique");
      if (!/@default\(\s*true\s*\)/.test(fieldLine(blk, "showPoints"))) p.push("showPoints ไม่ @default(true)");
      if (!/@default\(\s*0\s*\)/.test(fieldLine(blk, "stateSeq")) || !/@default\(\s*0\s*\)/.test(fieldLine(blk, "pairFailCount"))) p.push("stateSeq/pairFailCount ไม่ @default(0)");
      if (/@relation/.test(blk)) p.push("PosCustomerDisplay มี @relation (ต้อง id หลวม)");
      if (/PosCustomerDisplayStatus/.test(fieldLine(blk, "status"))) {
        const en = prismaBlock(schemaSrc, "enum", "PosCustomerDisplayStatus");
        if (!/^\s*ACTIVE\b/m.test(en) || !/^\s*REVOKED\b/m.test(en)) p.push("enum PosCustomerDisplayStatus ไม่ใช่ ACTIVE|REVOKED");
      }
    }
    if (!/\bPosCustomerDisplay\s*:\s*sys\(\s*\)/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี PosCustomerDisplay: sys()");
    if (!/model\s*:\s*["']PosCustomerDisplay["']/.test(srcOf(F.qcEnv))) p.push("pos-qc-env ไม่มี PosCustomerDisplay");
    const disp = srcOf(F.display);
    for (const n of DISPLAY_FNS) if (!exportsFn(disp, n)) p.push(`display.ts ไม่มี ${n}`);
    if (/^\s*["']use server["']/.test(rd(F.display))) p.push("display.ts เป็น \"use server\" (ต้องอยู่ที่ display-actions.ts)");
    if (/from\s+["']@\/lib\/modules\/(member|account|crm|inventory)(\/|["'])|import\(\s*["']@\/lib\/modules\/(member|account|crm|inventory)/.test(disp)) p.push("display.ts import member/account/crm/inventory");
    if (/\bcreateSale\s*\(|\bemitOutbox\w*\s*\(/.test(disp)) p.push("display.ts เรียก createSale/emitOutbox");
    const act = rd(F.actions);
    if (!act) p.push("ไม่มี display-actions.ts");
    else {
      if (!/^\s*["']use server["']/.test(act)) p.push("display-actions.ts ไม่ใช่ \"use server\"");
      for (const n of ACTION_FNS) if (!exportsFn(stripComments(act), n)) p.push(`display-actions.ts ไม่มี ${n}`);
      if (/export\s+(type|interface)\s/.test(stripComments(act))) p.push("display-actions.ts export type (use server ห้าม)");
    }
    const sh = rd(F.shared);
    if (!sh) p.push("ไม่มี display-shared.ts");
    else {
      const s = stripComments(sh);
      for (const n of SHARED_CONSTS) if (!exportsFn(s, n)) p.push(`display-shared.ts ไม่มี ${n}`);
      for (const n of SHARED_TYPES) if (!exportsType(s, n)) p.push(`display-shared.ts ไม่มี type ${n}`);
      if (!/MAX_DISPLAY_LINES\s*(:\s*\w+\s*)?=\s*20\b/.test(s)) p.push("MAX_DISPLAY_LINES ≠ 20");
      if (!/MAX_DISPLAY_STATE_BYTES\s*(:\s*\w+\s*)?=\s*(16384|16_384|16\s*\*\s*1024)\b/.test(s)) p.push("MAX_DISPLAY_STATE_BYTES ≠ 16384");
      if (!/DISPLAY_COOKIE\s*(:\s*\w+\s*)?=\s*["']pos_display["']/.test(s)) p.push("DISPLAY_COOKIE ≠ \"pos_display\"");
      for (const m of s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)) if (SERVER_MOD.test(m[1]!) || /\/db$|prisma/.test(m[1]!)) p.push(`display-shared.ts import ${m[1]}`);
    }
    // ผู้เขียนเดียว (มติ 9)
    const WRITE = /\bposCustomerDisplay\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"PosCustomerDisplay"/;
    const writers = walk("src").filter((f) => f !== F.display && WRITE.test(stripComments(rd(f))));
    if (writers.length) p.push(`เขียน PosCustomerDisplay นอก display.ts: ${writers.join(", ")}`);
    if (existsSync(join(ROOT, F.display)) && !WRITE.test(disp)) p.push("display.ts ไม่มีคำสั่งเขียน PosCustomerDisplay");
    chk("ST1", p.length === 0, "migration + schema + scope + qc-env + exports + ผู้เขียนเดียว", joinP(p));
  }
  // ST2 หมุด (เขียวที่ฐาน) ‖ ของที่ต้องมี (แดงที่ฐาน)
  {
    const pins: string[] = [];
    const baseFiles = (gitStr(["ls-tree", "-r", "--name-only", MB, "--", POS_DIR]) ?? "").split("\n").filter(Boolean);
    if (!baseFiles.length) pins.push(`อ่านไฟล์ที่ ${MB} ไม่ได้`);
    const pinned = [
      ...baseFiles.filter((f) => /\/(register[^/]*|service|tender[^/]*|payment-intent|held-cart)\.ts$/.test(f)),
      "src/lib/outbox-consumers.ts",
      "src/proxy.ts",
      F.contract,
    ];
    for (const f of pinned) {
      const d = diffLines(f);
      if (d.err) pins.push(`${f}: ${d.err}`);
      else if (d.added.length || d.removed) pins.push(`${f.replace(`${POS_DIR}/`, "")} มี hunk (+${d.added.length} −${d.removed})`);
    }
    const raw = existsSync(join(ROOT, F.contract)) ? readFileSync(join(ROOT, F.contract)) : null;
    const h = raw ? createHash("sha256").update(raw).digest("hex") : "";
    if (h !== CONTRACT_SHA) pins.push(`pos-sale-contract.json sha ${h.slice(0, 12) || "อ่านไม่ได้"} ≠ ${CONTRACT_SHA.slice(0, 12)}`);
    for (const f of [F.register, F.payDialog]) {
      const d = diffLines(f);
      if (d.err) {
        pins.push(`${f}: ${d.err}`);
        continue;
      }
      if (d.removed) pins.push(`${f.split("/").pop()} ลบ/แก้บรรทัดเดิม ${d.removed} บรรทัด (เพิ่มได้อย่างเดียวในบล็อก)`);
      const mk = markedLines(rd(f));
      const out = d.added.filter((n) => !mk.has(n));
      if (out.length) pins.push(`${f.split("/").pop()} เพิ่มนอกบล็อก // POS P2.10 ▸ … ◂ ที่บรรทัด ${out.slice(0, 5).join(",")}${out.length > 5 ? "…" : ""}`);
    }
    // ข้อสอบเดิมไม่ถูกแก้ (ยกเว้น ORACLE-EDIT p1.18 บรรทัด rewardNearCustomerDisplay)
    // ORACLE-EDIT ผู้คุม 16 ต.ค. (CD-FU2a): "ข้อสอบเดิมไม่ถูกแก้" = เทียบเฉพาะไฟล์ที่มีอยู่แล้วที่หมุด (M) · ไฟล์ข้อสอบใหม่ของใบถัดไป (A) ไม่ใช่ "ข้อสอบเดิม" — กฎคงเดิม
    const changed = (gitStr(["diff", "--name-only", "--diff-filter=M", MB, "--", "scripts"]) ?? "").split("\n").filter((f) => /^scripts\/qc-(pos|hf)-[^/]+\.mts$/.test(f) && f !== F.self);
    for (const f of changed) {
      if (f !== F.p118) {
        pins.push(`${f} ถูกแก้ (CONTROLLER-DECISION)`);
        continue;
      }
      const out = gitStr(["diff", "--no-color", "-U0", MB, "--", f]) ?? "";
      const bad = out.split("\n").filter((l) => /^[+-](?![+-])/.test(l) && l.slice(1).trim() && !/rewardNearCustomerDisplay|ORACLE-EDIT/.test(l));
      if (bad.length) pins.push(`qc-pos-p1.18 แก้นอกบรรทัด rewardNearCustomerDisplay ${bad.length} บรรทัด`);
    }
    // S5.17 — ไฟล์ "use client" ของจอ/หน้าขาย ไม่ import โมดูลเซิร์ฟเวอร์
    const clientFiles = [...walk(F.displayUi), ...walk(F.pageDir), F.register, F.payDialog].filter((f) => /^\s*["']use client["']/.test(rd(f)));
    for (const cf of clientFiles)
      for (const m of stripComments(rd(cf)).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm))
        if (SERVER_MOD.test(m[1]!) && !/-shared$|-actions$/.test(m[1]!)) pins.push(`S5.17 ${cf.split("/").pop()} ← ${m[1]}`);
    st2PinsOk = pins.length === 0;
    console.log(`  ${st2PinsOk ? "✅" : "❌"} (ST2·หมุด) ${st2PinsOk ? `ไม่มี hunk ในไฟล์ต้องห้าม · บล็อกมาร์กเท่านั้น · ข้อสอบเดิมเท่าเดิม · S5.17 สะอาด (${clientFiles.length} ไฟล์ client)` : joinP(pins)}`);

    const ex: string[] = [];
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f));
      } catch {
        ex.push(`${lang}: อ่าน json ไม่ได้`);
        continue;
      }
      const errs = j?.display?.errors;
      if (!isRecord(errs)) {
        ex.push(`${lang}: ไม่มี display.errors`);
        continue;
      }
      const miss = CODES.map(camel).filter((k) => typeof errs[k] !== "string" || !String(errs[k]).trim());
      if (miss.length) ex.push(`${lang}: ขาด ${miss.join(",")}`);
      const wrong = CODES.map(camel).filter((k) => typeof errs[k] === "string" && (lang === "en" ? THAI.test(errs[k]) : !THAI.test(errs[k])));
      if (wrong.length) ex.push(`${lang}: ภาษาไม่ตรง ${wrong.join(",")}`);
    }
    const page = rd(F.page);
    if (!page) ex.push("ไม่มี src/app/(store)/d/page.tsx");
    else {
      if (!/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(page)) ex.push("/d ไม่ force-dynamic");
      if (!/noindex|index\s*:\s*false/.test(page)) ex.push("/d ไม่ noindex");
    }
    const dAll = walk(F.pageDir).map((f) => stripComments(rd(f))).join("\n");
    if (page) {
      if (/@\/lib\/core\/context|getSession\s*\(|requireSession|@\/lib\/auth/.test(dAll)) ex.push("/d อ่าน session");
      if (!/pairCustomerDisplay/.test(dAll) || !/readCustomerDisplay/.test(dAll)) ex.push("/d ไม่เรียก pairCustomerDisplay/readCustomerDisplay");
      if (!/DISPLAY_COOKIE|["']pos_display["']/.test(dAll) || !/httpOnly|DISPLAY_COOKIE_OPTIONS/.test(dAll)) ex.push("/d ไม่ตั้งคุกกี้ pos_display (httpOnly)");
    }
    const hook = rd(F.hook);
    if (!hook) ex.push(`ไม่มี ${F.hook}`);
    else {
      const mods = [...stripComments(hook).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!).filter((m) => m.startsWith("@/lib/") || m.startsWith("."));
      const bad = mods.filter((m) => !/^@\/lib\/modules\/pos\/display-(actions|shared)$/.test(m));
      if (bad.length) ex.push(`hook import นอก display-actions/display-shared: ${bad.join(", ")}`);
      if (!/use-display-publish/.test(rd(F.register))) ex.push("RegisterScreen ไม่เรียก hook");
    }
    if (!/display-actions/.test(rd(F.deviceSettings))) ex.push("DeviceSettings ไม่ใช้ display-actions");
    if (!/\[\s*["']rewardNearCustomerDisplay["']\s*,\s*true\s*,\s*null\s*\]/.test(rd(F.integrations))) ex.push("fact rewardNearCustomerDisplay ยังไม่ live");
    console.log(`  ${ex.length ? "❌" : "✅"} (ST2·มีจริง) ${joinP(ex)}`);
    chk("ST2", st2PinsOk && ex.length === 0, "หมุดเขียว + ข้อความ/หน้า /d/hook/DeviceSettings/fact ครบ", `หมุด: ${st2PinsOk ? "เขียว" : joinP(pins)} ‖ มีจริง: ${joinP(ex)}`);
  }
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต · ไม่โหลด prisma)`);
  try {
    runStatic();
  } catch (e) {
    console.log(`💥 harness: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, st2Pins: st2PinsOk, mergeBase: MB, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;
const TIDS = envMod.PQC_TENANT_IDS as string[];
const HOST = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "?";
  }
})();
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
let seedOk = false;
try {
  seedOk = !!(await envMod.resolvePosScope(prisma, "coffee"));
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!seedOk) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน");
const colsOf = async (t: string): Promise<Set<string>> => {
  try {
    const rows = (await P.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, t)) as Any[];
    return new Set(rows.map((r) => String(r.column_name)));
  } catch {
    return new Set();
  }
};
const dispCols = await colsOf("PosCustomerDisplay");
const HAS_TABLE = dispCols.has("tokenHash") && dispCols.has("stateSeq") && dispCols.has("deviceId");
if (!HAS_TABLE) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosCustomerDisplay");

const FP_MODELS = ["posDevice", "posShift", "posPaymentIntent", "appSystem", "paymentProfile"] as const;
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
  if (HAS_TABLE) {
    try {
      const rows = (await P.$queryRawUnsafe(`SELECT * FROM "PosCustomerDisplay" WHERE "tenantId" = ANY($1::text[]) ORDER BY id`, TIDS)) as Any[];
      out.posCustomerDisplay = `${rows.length}:${createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16)}`;
    } catch (e) {
      out.posCustomerDisplay = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.10 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · Z1 เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const dispMod = existsSync(join(ROOT, F.display)) ? await tryImport("@/lib/modules/pos/display") : null;
const dispShared = existsSync(join(ROOT, F.shared)) ? await tryImport("@/lib/modules/pos/display-shared") : null;
const devMod = await tryImport("@/lib/modules/pos/device");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const regMod = await tryImport("@/lib/modules/pos/register");
const intentMod = await tryImport("@/lib/modules/pos/payment-intent");
const ppMod = await tryImport("@/lib/payment/promptpay");
const originMod = await tryImport("@/lib/core/origin");
const sysSvc = await tryImport("@/lib/modules/system/service");
const memMod = await tryImport("@/lib/modules/member");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const T_SLUG = `posqc-p210-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
let ORIGIN = "";
try {
  ORIGIN = String(await originMod?.publicOrigin?.()).replace(/\/+$/, "");
} catch (e) {
  console.log(`  ⚠️  publicOrigin() ล้มในบริบทสคริปต์: ${(e as Error).message.slice(0, 120)}`);
}

const realFetch = globalThis.fetch;
const guardHits: string[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    guardHits.push(host);
    return new Response(`blocked by ${SUITE}`, { status: 503 });
  }) as typeof fetch;
}
function removeFetchGuard() {
  globalThis.fetch = realFetch;
}
async function drain(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P2.10-Z1");

async function runDb() {
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed — ข้อ DB ตรวจไม่ได้");
    return;
  }
  assertQc4BeforeWrite();
  installFetchGuard();
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = `qc-p210-${RAND}-${Math.random().toString(36).slice(2)}`;
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  let fx = "";
  const notes: string[] = [];
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const ownerId: string = PQC.coffee.users.owner.userId;
  const cashierId: string = PQC.coffee.users.cashier.userId;
  const step = async (label: string, fn: () => unknown): Promise<Any> => {
    try {
      return await fn();
    } catch (e) {
      const m = `${label}: ${String((e as Error)?.message ?? e).slice(0, 140)}`;
      notes.push(m);
      console.log(`  ⚠️  fixture ${m}`);
      return null;
    }
  };
  const PPID = "0812345678";
  const SHOP = `บ้านกาแฟสวนผึ้ง QC ${RAND}`;
  const LOGO = `https://cdn.example.com/qc-p210-${RAND}.png`;
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.10 จอลูกค้า ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.10 ร้านอื่น ${RAND}`, slug: T2_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขาหัวหิน ${RAND}`, slug: `${T_SLUG}-a` } })).id;
    U.B = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `สาขาบี ${RAND}`, slug: `${T_SLUG}-b` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `ร้านอื่น ${RAND}`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", "POS P2.10")).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", "สมาชิก QC P2.10")).id;
    S.POS2 = (await sysSvc.createSystem(T2, "POS", "POS P2.10 ร้านอื่น")).id;
    for (const k of ["A", "B"]) await sysSvc.linkUnit(T, S.POS, U[k]);
    await sysSvc.linkUnit(T, S.MEM, U.A);
    await sysSvc.linkUnit(T2, S.POS2, U.X);
    await P.paymentProfile.create({ data: { tenantId: T, promptpayId: PPID, displayName: `ร้านจอลูกค้าคิวซี ${RAND}` } });
    const s0 = (await P.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } }))?.settings ?? {};
    const pos0 = isRecord(s0.pos) ? s0.pos : {};
    await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...s0, pos: { ...pos0, receipt: { header: { name: SHOP, logoUrl: LOGO } } } } } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FXB = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;

  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const cashier = { userId: cashierId, role: "STAFF", unitAccess: [U.A, U.B], permissions: { "pos.sale.create": true } };
  const noperm = { userId: cashierId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.read": true } };
  const ctxOf = (k: string, deviceId?: string): Any =>
    k === "X" ? { tenantId: T2, systemId: S.POS2, unitId: U.X, ...(deviceId ? { deviceId } : {}) } : { tenantId: T, systemId: S.POS, unitId: U[k], ...(deviceId ? { deviceId } : {}) };
  const CODE = (n: string) => `qc210${RAND}${n}`;
  const DV = { D1: CODE("d1"), D2: CODE("d2"), D3: CODE("d3"), D4: CODE("d4"), B1: CODE("b1"), X1: CODE("x1") };
  const DEVNAME: Record<string, string> = { D1: `เคาน์เตอร์ 1 ${RAND}`, D3: `เคาน์เตอร์ 3 ${RAND}`, D4: `เคาน์เตอร์ 4 ${RAND}`, B1: `บี 1 ${RAND}`, X1: `ร้านอื่น 1 ${RAND}` };
  const DID: Record<string, string> = {};
  // ─── เครื่อง (D2 = ไม่ลงทะเบียน) + กะ D1/D3 ───
  if (!fx) {
    for (const [k, unit] of [["D1", "A"], ["D3", "A"], ["D4", "A"], ["B1", "B"], ["X1", "X"]] as const) {
      const r = await call(devMod, "registerDevice", ctxOf(unit), owner, { name: DEVNAME[k], deviceCode: DV[k] });
      if (r?.ok === true) DID[k] = String(r.device?.id ?? "");
      else notes.push(`registerDevice ${k}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    }
    for (const k of ["D1", "D3"] as const) {
      const o = await call(shiftMod, "openShift", ctxOf("A", DV[k]), owner, { deviceId: DV[k], deviceLabel: DEVNAME[k], floatSatang: 0 });
      if (o?.ok !== true) notes.push(`openShift ${k}: ${codeOf(o)} ${short(o?.message ?? "", 80)}`);
    }
  }
  // ─── สมาชิก X (ไว้สแกน PDPA — ค่าจริงของเบอร์/รหัสสมาชิก) ───
  const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
  const MEMBER = { name: "สมชาย ใจดี", phone: `0897${rnd(6)}`, memberCode: "", phoneMasked: "" };
  if (!fx) {
    const r = await step("สมาชิก X", () => memMod.createMember({ tenantId: T, systemId: S.MEM, actorUserId: ownerId }, owner, { phone: MEMBER.phone, name: MEMBER.name, source: "WALK_IN", homeUnitId: U.A }));
    const cid = String(r?.customerId ?? "");
    const c = cid ? await P.customer.findUnique({ where: { id: cid } }).catch(() => null) : null;
    MEMBER.memberCode = String(c?.memberCode ?? "");
    MEMBER.phoneMasked = typeof memMod?.maskPhone === "function" ? String(memMod.maskPhone(MEMBER.phone)) : "";
    await drain();
  }

  // ─── ตัวช่วยของจอ ───
  const q = async (sql: string, ...args: unknown[]): Promise<Any[]> => {
    if (!HAS_TABLE) return [];
    try {
      return (await P.$queryRawUnsafe(sql, ...args)) as Any[];
    } catch (e) {
      notes.push(`SQL ${sql.slice(0, 40)}: ${(e as Error).message.slice(0, 80)}`);
      return [];
    }
  };
  const ex = async (sql: string, ...args: unknown[]): Promise<number> => {
    if (!HAS_TABLE) return 0;
    try {
      return Number(await P.$executeRawUnsafe(sql, ...args));
    } catch (e) {
      notes.push(`SQL ${sql.slice(0, 40)}: ${(e as Error).message.slice(0, 80)}`);
      return 0;
    }
  };
  const SEL = `SELECT *, status::text AS status FROM "PosCustomerDisplay"`;
  const rowsOf = (devKey: string) => q(`${SEL} WHERE "tenantId" = $1 AND "deviceId" = $2 ORDER BY "createdAt", id`, T, DID[devKey] ?? "-");
  const activeOf = async (devKey: string): Promise<Any[]> => (await rowsOf(devKey)).filter((r) => r.status === "ACTIVE");
  const rowText = async (devKey: string) => JSON.stringify(await rowsOf(devKey));
  const allRows = () => q(`SELECT count(*)::int AS n FROM "PosCustomerDisplay" WHERE "tenantId" = ANY($1::text[])`, [T, T2]).then((r) => Number(r[0]?.n ?? 0));
  const auditText = async (): Promise<string> => JSON.stringify(await P.auditLog.findMany({ where: { tenantId: T, action: { startsWith: "pos.display." } } }).catch(() => []));
  const auditN = async (action: string): Promise<number> => Number(await P.auditLog.count({ where: { tenantId: T, action } }).catch(() => -1));
  const countsT = async () => ({
    audit: Number(await P.auditLog.count({ where: { tenantId: T } }).catch(() => -1)),
    outbox: Number(await P.outboxEvent.count({ where: { tenantId: T } }).catch(() => -1)),
  });
  const D_ = dispMod;
  const enable = (unit: string, actor: Any, input: Any) => call(D_, "enableCustomerDisplay", ctxOf(unit), actor, input);
  const revoke = (unit: string, actor: Any, devId: string) => call(D_, "revokeCustomerDisplay", ctxOf(unit), actor, { deviceId: devId });
  const settings = (unit: string, actor: Any, input: Any) => call(D_, "updateCustomerDisplaySettings", ctxOf(unit), actor, input);
  const status = (unit: string, actor: Any, devId: string) => call(D_, "customerDisplayStatus", ctxOf(unit), actor, { deviceId: devId });
  let ipN = 0;
  const freshIp = () => `qc-p210-${RAND}-ip${++ipN}`;
  const pair = (code: string, ip = freshIp()) => call(D_, "pairCustomerDisplay", { code }, { ip });
  const read = (token: string, sinceSeq?: number) => call(D_, "readCustomerDisplay", sinceSeq === undefined ? { token } : { token, sinceSeq });
  let seqN = 0;
  const nextSeq = () => ++seqN * 10;
  const publish = (devKey: keyof typeof DV, seq: number, state: Any, actor: Any = owner, unit = "A") => call(D_, "publishDisplayState", ctxOf(unit, DV[devKey]), actor, { deviceCode: DV[devKey], seq, state });
  const CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
  const wrongCode = (not: string[]) => {
    for (;;) {
      const c = Array.from({ length: 8 }, () => CROCK[Math.floor(Math.random() * 32)]).join("");
      if (!not.includes(c)) return c;
    }
  };
  const codeOfEnable = (r: Any) => String(r?.pairCode ?? "");
  const tokenOf = (r: Any) => (r?.ok === true && typeof r.token === "string" ? r.token : "");
  const viewOf = (r: Any): Any => (r?.ok === true && r.changed !== false ? r.view : null);
  const deepHas = (v: unknown, needle: string) => !!needle && JSON.stringify(v ?? null).includes(needle);

  // ─── สถานะตัวอย่าง (ภาพ 11A) ───
  const LINES = [
    { qty: 2, name: "ลาเต้", detail: "M · นมโอ๊ต · หวานน้อย", grossSatang: 20_000, discountSatang: 0 },
    { qty: 1, name: "ครัวซองต์", grossSatang: 8_500, discountSatang: 1_000, discountLabel: "ของช่วงบ่าย" },
    { qty: 1, name: "อเมริกาโน่", detail: "L", grossSatang: 9_000, discountSatang: 0 },
    { qty: 1, name: "เมล็ดกาแฟ", detail: "250 g", grossSatang: 35_000, discountSatang: 0 },
  ];
  const TOTALS = {
    subtotalSatang: 72_500,
    lineDiscountSatang: 1_000,
    billDiscountSatang: 0,
    coupon: { code: "WELCOME50", satang: 5_000 },
    member: [{ label: "ส่วนลดสมาชิก Gold", satang: 4_000 }],
    serviceChargeSatang: 0,
    grandTotalSatang: 62_500,
  };
  const MEMBER_IN = { firstName: MEMBER.name, tier: "Gold", points: 98_765 };
  const STAMP_IN = { name: "สะสมครบ 10 แก้ว ฟรี 1 แก้ว", stamps: 6, slots: 10, toAdd: 1 };
  // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 CD-4) ▸ มติ 15: ภาพที่ส่ง (publish) มี kind "TIER" บนแถวสมาชิก (TL-5 kind บังคับ) — TOTALS คงรูปของ view (label + satang) ที่ข้อเทียบใช้ ◂
  const TOTALS_PUB = { ...TOTALS, member: TOTALS.member.map((m) => ({ kind: "TIER", ...m })) };
  const CART = (over: Any = {}): Any => ({ phase: "cart", member: MEMBER_IN, lines: LINES, totals: TOTALS_PUB, stamp: STAMP_IN, ...over });
  const PAY = (over: Any = {}): Any => ({ method: "PROMPTPAY", dueSatang: 62_500, roundSatang: 32_500, paidSatang: 30_000, remainingSatang: 32_500, ...over });
  const PAYING = (pay: Any, over: Any = {}): Any => ({ ...CART(), phase: "paying", pay, ...over });
  const DONE = (done: Any): Any => ({ phase: "done", member: MEMBER_IN, done });

  const ready = !fx && !!DID.D1;
  let TOK = ""; // token หลักของ D1 (หลังหมุนใน PA3)

  // ════════ PA1 เปิดจอลูกค้า ════════
  let code1 = "";
  {
    const p: string[] = [];
    if (!ready) p.push("ไม่มีเครื่อง D1");
    else {
      const t0 = Date.now();
      const r1 = await enable("A", owner, { deviceId: DID.D1 });
      code1 = codeOfEnable(r1);
      if (r1?.ok !== true) p.push(`enable → ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
      else {
        if (!CODE_RE.test(code1)) p.push(`pairCode ${short(code1, 20)} ไม่ใช่ 8 ตัว Crockford`);
        const exp = Date.parse(String(r1.pairCodeExpiresAt ?? ""));
        if (!(exp >= t0 + 9.5 * 60_000 && exp <= Date.now() + 10.5 * 60_000)) p.push(`pairCodeExpiresAt ${short(r1.pairCodeExpiresAt, 30)} (คาด +10 นาที)`);
        const act = await activeOf("D1");
        const row = act[0];
        if (act.length !== 1) p.push(`แถว ACTIVE ของ D1 ${act.length} (คาด 1)`);
        else {
          if (row.unitId !== U.A || row.systemId !== S.POS || row.createdByUserId !== ownerId) p.push("แถว: สาขา/ระบบ/ผู้สร้างไม่ตรง");
          if (!row.pairCodeHash || row.pairCodeHash === code1 || row.tokenHash) p.push("แถว: pairCodeHash ว่าง/เป็นรหัสจริง หรือมี tokenHash ก่อนจับคู่");
          if (Number(row.pairFailCount) !== 0 || row.showPoints !== true || Number(row.stateSeq) !== 0) p.push("แถว: ค่าปริยาย pairFailCount/showPoints/stateSeq ไม่ตรง");
          const pend = Date.parse(String(row.pairCodeExpiresAt ?? ""));
          if (!(Math.abs(pend - exp) < 2_000)) p.push("แถว pairCodeExpiresAt ≠ ค่าที่คืน");
        }
        if ((await rowText("D1")).includes(code1)) p.push("แถวมีรหัสตัวจริง");
        const st = await status("A", owner, DID.D1);
        if (st?.ok !== true || st.display?.paired !== false || !st.display?.pendingCodeExpiresAt) p.push(`status → ${codeOf(st)} paired ${st?.display?.paired} pending ${short(st?.display?.pendingCodeExpiresAt, 30)}`);
        if (deepHas(st, code1)) p.push("status มีรหัสตัวจริง");
      }
      const r2 = await enable("A", owner, { deviceId: DID.D1 });
      const code2 = codeOfEnable(r2);
      if (r2?.ok !== true || !CODE_RE.test(code2) || code2 === code1) p.push(`เปิดซ้ำ → ${codeOf(r2)} รหัส ${code2 === code1 ? "เดิม" : short(code2, 12)}`);
      if ((await activeOf("D1")).length !== 1) p.push(`เปิดซ้ำแล้วแถว ACTIVE ${(await activeOf("D1")).length}`);
      if (code1) {
        const old = await pair(code1);
        if (!refused(old, "PAIR_CODE_INVALID")) p.push(`รหัสเก่าหลังหมุน → ${codeOf(old)} (คาด PAIR_CODE_INVALID)`);
      }
      code1 = code2;
      const before = await allRows();
      const c = await enable("A", cashier, { deviceId: DID.D1 });
      if (!refused(c, "PERMISSION_DENIED")) p.push(`แคชเชียร์ → ${codeOf(c)}`);
      const nr = [
        ["D2 (deviceCode ไม่ลงทะเบียน)", await enable("A", owner, { deviceCode: DV.D2 })],
        ["เครื่องสาขา B", await enable("A", owner, { deviceId: DID.B1 ?? "x" })],
        ["id มั่ว", await enable("A", owner, { deviceId: `qc-none-${RAND}` })],
      ] as const;
      for (const [lbl, r] of nr) if (!refused(r, "DEVICE_NOT_REGISTERED")) p.push(`${lbl} → ${codeOf(r)}`);
      if (new Set(nr.map(([, r]) => String(r?.message ?? ""))).size !== 1) p.push("ข้อความ DEVICE_NOT_REGISTERED ไม่เหมือนกัน");
      if ((await allRows()) !== before) p.push("คำขอที่ถูกปฏิเสธสร้างแถว");
      if ((await auditN("pos.display.enable")) < 2) p.push(`audit pos.display.enable ${await auditN("pos.display.enable")} (คาด ≥ 2)`);
      if (code1 && (await auditText()).includes(code1)) p.push("audit มีรหัสตัวจริง");
    }
    chk("PA1", p.length === 0, "รหัส 8 ตัว 10 นาที · แถวเดียว · หมุน · สิทธิ์ · ไม่ลงทะเบียน = ข้อความเดียว · audit", FXB(joinP(p)));
  }

  // ════════ PA2 แลกรหัส → token ════════
  let TOK0 = "";
  let TOK_D4 = "";
  {
    const p: string[] = [];
    if (!ready) p.push("ไม่มีเครื่อง D1");
    else {
      const wrong = await pair(wrongCode([code1]));
      if (!refused(wrong, "PAIR_CODE_INVALID")) p.push(`รหัสผิด → ${codeOf(wrong)}`);
      // หมดอายุ (D3)
      const e3 = await enable("A", owner, { deviceId: DID.D3 });
      const codeE = codeOfEnable(e3);
      await ex(`UPDATE "PosCustomerDisplay" SET "pairCodeExpiresAt" = $3 WHERE "tenantId" = $1 AND "deviceId" = $2 AND status::text = 'ACTIVE'`, T, DID.D3, new Date(Date.now() - 1_000));
      const expired = codeE ? await pair(codeE) : { ok: false, code: "NO_CODE" };
      if (!refused(expired, "PAIR_CODE_INVALID")) p.push(`รหัสหมดอายุ → ${codeOf(expired)}`);
      // ล็อก (D4: pairFailCount 5 → รหัสถูกก็ไม่ผ่าน · เปิดใหม่ล้างตัวนับ)
      const e4 = await enable("A", owner, { deviceId: DID.D4 });
      const codeL = codeOfEnable(e4);
      await ex(`UPDATE "PosCustomerDisplay" SET "pairFailCount" = 5 WHERE "tenantId" = $1 AND "deviceId" = $2 AND status::text = 'ACTIVE'`, T, DID.D4);
      const locked = codeL ? await pair(codeL) : { ok: false, code: "NO_CODE" };
      if (!refused(locked, "PAIR_CODE_INVALID")) p.push(`ถูกล็อก (pairFailCount 5) → ${codeOf(locked)}`);
      const msgs = [wrong, expired, locked].map((r) => String(r?.message ?? ""));
      if (new Set(msgs).size !== 1 || !msgs[0]) p.push(`ข้อความผิด/หมดอายุ/ล็อก ไม่เหมือนกัน (${new Set(msgs).size} แบบ)`);
      const e4b = await enable("A", owner, { deviceId: DID.D4 });
      const r4 = (await activeOf("D4"))[0];
      if (Number(r4?.pairFailCount ?? -1) !== 0) p.push(`เปิดใหม่แล้ว pairFailCount ${r4?.pairFailCount} (คาด 0)`);
      TOK_D4 = tokenOf(await pair(codeOfEnable(e4b)));
      if (!TOK_D4) p.push("D4 จับคู่ด้วยรหัสใหม่ไม่ได้");
      // รหัสถูก (D1)
      const t0 = Date.now();
      const ok1 = code1 ? await pair(code1) : null;
      TOK0 = tokenOf(ok1);
      if (!TOK0) p.push(`รหัสถูก → ${codeOf(ok1)} ${short(ok1?.message ?? "", 60)}`);
      else {
        if (TOK0.length < 32) p.push(`token ยาว ${TOK0.length} (คาด ≥ 32)`);
        const row = (await activeOf("D1"))[0];
        if (!row) p.push("ไม่มีแถว ACTIVE หลังจับคู่");
        else {
          if (row.tokenHash !== sha256hex(TOK0) && row.tokenHash !== sha256b64u(TOK0)) p.push("tokenHash ≠ sha256(token)");
          if (row.pairCodeHash !== null || row.pairCodeExpiresAt !== null) p.push("รหัสยังไม่ถูกล้างหลังจับคู่");
          if (String(ok1.displayId ?? "") !== String(row.id)) p.push("displayId ≠ id ของแถว");
        }
        const txt = await rowText("D1");
        if (txt.includes(TOK0) || txt.includes(code1)) p.push("แถวมี token/รหัสตัวจริง");
        const au = await auditText();
        if (au.includes(TOK0) || au.includes(code1)) p.push("audit มี token/รหัสตัวจริง");
        if ((await auditN("pos.display.pair")) < 1) p.push("ไม่มี audit pos.display.pair");
        const again = await pair(code1);
        if (!refused(again, "PAIR_CODE_INVALID")) p.push(`ใช้รหัสซ้ำ → ${codeOf(again)}`);
        const rr = await read(TOK0);
        if (rr?.ok !== true || viewOf(rr)?.phase !== "idle") p.push(`read หลังจับคู่ → ${codeOf(rr)} phase ${viewOf(rr)?.phase}`);
        const st = await status("A", owner, DID.D1);
        if (st?.display?.paired !== true || st.display?.pendingCodeExpiresAt) p.push(`status หลังจับคู่ paired ${st?.display?.paired} pending ${short(st?.display?.pendingCodeExpiresAt, 24)}`);
        if (deepHas(st, TOK0) || deepHas(st, String(row?.tokenHash ?? "-"))) p.push("status มี token/tokenHash");
        if (Date.now() - t0 > 30_000) notes.push("PA2 ช้ากว่า 30 วิ");
      }
      // เพดานอัตรา (IP เดียว 11 ครั้ง)
      const ip = freshIp();
      const rs: Any[] = [];
      for (let i = 0; i < 11; i++) rs.push(await pair(wrongCode([]), ip));
      const firstTen = rs.slice(0, 10).filter((r) => refused(r, "PAIR_CODE_INVALID")).length;
      if (firstTen !== 10 || !refused(rs[10], "RATE_LIMITED")) p.push(`IP เดียว 11 ครั้ง: 10 แรก PAIR_CODE_INVALID ${firstTen} · ครั้งที่ 11 ${codeOf(rs[10])} (คาด RATE_LIMITED)`);
      const co = dispShared?.DISPLAY_COOKIE_OPTIONS;
      if (dispShared?.DISPLAY_COOKIE !== "pos_display" || !isRecord(co) || co.httpOnly !== true || co.secure !== true || String(co.sameSite).toLowerCase() !== "lax" || co.path !== "/d" || co.maxAge !== 400 * 86_400)
        p.push(`คุกกี้ ${short(dispShared?.DISPLAY_COOKIE, 20)} ${short(co, 120)} (คาด pos_display · httpOnly · secure · lax · /d · 400 วัน)`);
    }
    chk("PA2", p.length === 0, "token + hash · ล้างรหัส · ผิด/หมดอายุ/ล็อก/ซ้ำ = PAIR_CODE_INVALID เดียว · RATE_LIMITED · คุกกี้", FXB(joinP(p)));
  }

  // ════════ PA3 หมุน/ยกเลิก/ข้ามขอบเขต ════════
  {
    const p: string[] = [];
    if (!ready || !TOK0) p.push("ไม่มี token ของ D1 (PA2)");
    else {
      const e = await enable("A", owner, { deviceId: DID.D1 });
      TOK = tokenOf(await pair(codeOfEnable(e)));
      if (!TOK || TOK === TOK0) p.push("จับคู่ใหม่ไม่ได้ token ใหม่");
      const oldR = await read(TOK0);
      if (!refused(oldR, "DISPLAY_NOT_PAIRED")) p.push(`token เก่าหลังหมุน → ${codeOf(oldR)}`);
      if (TOK && (await read(TOK))?.ok !== true) p.push("token ใหม่อ่านไม่ได้");
    }
    if (ready) {
      // ข้ามขอบเขต
      const rowBefore = JSON.stringify(await activeOf("D1"));
      const cross = [
        ["ร้านอื่น ยกเลิก D1", await revoke("X", owner, DID.D1)],
        ["สาขา B ยกเลิก D1", await revoke("B", owner, DID.D1)],
        ["id มั่ว ยกเลิก", await revoke("A", owner, `qc-none-${RAND}`)],
        ["ร้านอื่น แก้ค่าตั้ง D1", await settings("X", owner, { deviceId: DID.D1, showPoints: false })],
      ] as const;
      for (const [lbl, r] of cross) if (!refused(r, "NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
      if (new Set(cross.map(([, r]) => String(r?.message ?? ""))).size !== 1) p.push("ข้อความ NOT_FOUND ไม่เหมือนกัน");
      if (JSON.stringify(await activeOf("D1")) !== rowBefore) p.push("แถวของ D1 เปลี่ยนจากคำขอข้ามขอบเขต");
      const pb = await publish("D1", 5, CART(), owner, "B");
      if (pb?.ok !== true || pb.paired !== false) p.push(`สาขา B publish รหัส D1 → ${codeOf(pb)} paired ${pb?.paired}`);
      const cr = await revoke("A", cashier, DID.D1);
      if (!refused(cr, "PERMISSION_DENIED")) p.push(`แคชเชียร์ยกเลิก → ${codeOf(cr)}`);
      // ยกเลิกจับคู่ (D3: จับคู่ก่อน แล้วยกเลิก)
      const e3 = await enable("A", owner, { deviceId: DID.D3 });
      const tok3 = tokenOf(await pair(codeOfEnable(e3)));
      if (!tok3) p.push("D3 จับคู่ไม่ได้");
      const rv = await revoke("A", owner, DID.D3);
      if (rv?.ok !== true) p.push(`ยกเลิก D3 → ${codeOf(rv)}`);
      const after3 = tok3 ? await read(tok3) : null;
      if (!refused(after3, "DISPLAY_NOT_PAIRED")) p.push(`หลังยกเลิก read → ${codeOf(after3)}`);
      const rows3 = await rowsOf("D3");
      if (rows3.some((r) => r.status === "ACTIVE" && r.tokenHash) || !rows3.some((r) => r.status === "REVOKED" && r.revokedAt)) p.push("แถว D3 ไม่เป็น REVOKED + revokedAt");
      if ((await auditN("pos.display.revoke")) < 1) p.push("ไม่มี audit pos.display.revoke");
      const st3 = await status("A", owner, DID.D3);
      if (st3?.ok !== true || st3.display?.paired !== false) p.push(`status D3 หลังยกเลิก → ${codeOf(st3)} paired ${st3?.display?.paired}`);
      // เพิกถอนเครื่อง D4 → จอหลุด
      if (!TOK_D4) p.push("ไม่มี token ของ D4 (PA2)");
      else {
        const pre = await read(TOK_D4);
        if (pre?.ok !== true) p.push(`D4 ก่อนเพิกถอน read → ${codeOf(pre)}`);
        const rd4 = await call(devMod, "revokeDevice", ctxOf("A"), owner, { id: DID.D4 });
        if (rd4?.ok !== true) p.push(`revokeDevice D4 → ${codeOf(rd4)}`);
        const post = await read(TOK_D4);
        if (!refused(post, "DISPLAY_NOT_PAIRED")) p.push(`หลังเพิกถอนเครื่อง read → ${codeOf(post)}`);
      }
      const rnd1 = await read(`qc${RAND}`.padEnd(43, "x"));
      if (!refused(rnd1, "DISPLAY_NOT_PAIRED")) p.push(`token มั่ว → ${codeOf(rnd1)}`);
      const msgs = [rnd1, after3, TOK0 ? await read(TOK0) : rnd1].map((r) => `${r?.code}|${r?.message}`);
      if (new Set(msgs).size !== 1) p.push("คำปฏิเสธของ token มั่ว/ยกเลิก/หมุน ไม่เหมือนกัน");
    }
    chk("PA3", p.length === 0, "หมุน token · ยกเลิก · เพิกถอนเครื่อง · NOT_FOUND เดียว · paired:false ข้ามสาขา", FXB(joinP(p)));
  }

  // ════════ DS1 publish/read ════════
  {
    const p: string[] = [];
    if (!TOK) p.push("ไม่มี token หลัก (PA3)");
    else {
      const c0 = await countsT();
      const w6 = await publish("D1", 6, CART());
      if (w6?.ok !== true || w6.paired !== true || w6.written !== true) p.push(`seq 6 → ${codeOf(w6)} paired ${w6?.paired} written ${w6?.written}`);
      const w5 = await publish("D1", 5, CART({ lines: LINES.slice(0, 1) }));
      if (w5?.ok !== true || w5.written !== false) p.push(`seq 5 หลัง 6 → ${codeOf(w5)} written ${w5?.written} (คาด false)`);
      const w6b = await publish("D1", 6, CART({ lines: LINES.slice(0, 2) }));
      if (w6b?.ok !== true || w6b.written !== false) p.push(`seq 6 ซ้ำ → written ${w6b?.written} (คาด false)`);
      const r6 = await read(TOK);
      if (Number(r6?.seq) !== 6 || viewOf(r6)?.lines?.length !== 4) p.push(`read หลัง 6/5/6 → seq ${r6?.seq} บรรทัด ${viewOf(r6)?.lines?.length} (คาด 6 · 4)`);
      const par = await Promise.all(Array.from({ length: 10 }, () => publish("D1", 7, CART())));
      const wrote = par.filter((r) => r?.ok === true && r.written === true).length;
      if (wrote !== 1 || par.some((r) => r?.ok !== true)) p.push(`×10 พร้อมกัน seq 7 → written ${wrote} · ล้ม ${par.filter((r) => r?.ok !== true).map(codeOf).join(",") || 0}`);
      const row = (await activeOf("D1"))[0];
      if (Number(row?.stateSeq) !== 7) p.push(`stateSeq ${row?.stateSeq} (คาด 7)`);
      const same = await read(TOK, 7);
      if (same?.ok !== true || same.changed !== false || same.view != null || Number(same.seq) !== 7) p.push(`sinceSeq 7 → changed ${same?.changed} view ${same?.view === undefined ? "ไม่มี" : "มี"} seq ${same?.seq}`);
      const before = await allRows();
      const u2 = await publish("D2", 1, CART());
      const u3 = await publish("D3", 1, CART());
      if (u2?.ok !== true || u2.paired !== false) p.push(`D2 ไม่ลงทะเบียน → ${codeOf(u2)} paired ${u2?.paired}`);
      if (u3?.ok !== true || u3.paired !== false) p.push(`D3 จอถูกยกเลิก → ${codeOf(u3)} paired ${u3?.paired}`);
      if ((await allRows()) !== before) p.push("publish ของเครื่องที่ไม่มีจอสร้างแถว");
      const np = await publish("D1", 8, CART(), noperm);
      if (!refused(np, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ → ${codeOf(np)}`);
      const badSeq = [await publish("D1", -1, CART()), await publish("D1", 8.5, CART()), await publish("D1", "9" as Any, CART())];
      if (!badSeq.every((r) => refused(r, "DISPLAY_STATE_INVALID"))) p.push(`seq ผิดรูป → ${badSeq.map(codeOf).join(",")}`);
      const cs = await publish("D1", 8, CART(), cashier);
      if (cs?.ok !== true || cs.written !== true) p.push(`แคชเชียร์ (pos.sale.create) publish → ${codeOf(cs)}`);
      const c1 = await countsT();
      if (c1.audit !== c0.audit || c1.outbox !== c0.outbox) p.push(`publish/read เขียน audit ${c0.audit}→${c1.audit} · outbox ${c0.outbox}→${c1.outbox}`);
      const rb = fnBody(srcOf(F.display), "readCustomerDisplay");
      if (/checkRateLimitDb|accountRateGuard|rateBucketCte|writeAudit|emitOutbox/.test(rb)) p.push("readCustomerDisplay เรียกตัวจำกัดอัตรา/audit/outbox");
      // lastPolledAt ทุก 30 วิ
      const lp1 = (await activeOf("D1"))[0]?.lastPolledAt;
      if (!lp1) p.push("lastPolledAt ยังว่างหลัง read");
      const fresh = new Date(Date.now() - 5_000);
      await ex(`UPDATE "PosCustomerDisplay" SET "lastPolledAt" = $3 WHERE "tenantId" = $1 AND "deviceId" = $2 AND status::text = 'ACTIVE'`, T, DID.D1, fresh);
      await read(TOK);
      const lp2 = (await activeOf("D1"))[0]?.lastPolledAt;
      if (!lp2 || new Date(lp2).getTime() !== fresh.getTime()) p.push(`read ภายใน 30 วิหลังเขียนล่าสุดเขียน lastPolledAt (${short(lp2, 30)})`);
      await ex(`UPDATE "PosCustomerDisplay" SET "lastPolledAt" = $3 WHERE "tenantId" = $1 AND "deviceId" = $2 AND status::text = 'ACTIVE'`, T, DID.D1, new Date(Date.now() - 31_000));
      await read(TOK);
      const lp3 = (await activeOf("D1"))[0]?.lastPolledAt;
      if (!(lp3 && Date.now() - new Date(lp3).getTime() < 10_000)) p.push(`lastPolledAt เก่า 31 วิไม่ถูกเขียนใหม่ (${short(lp3, 30)})`);
      const st = await status("A", owner, DID.D1);
      if (st?.display?.online !== true) p.push(`status online ${st?.display?.online} (คาด true)`);
    }
    chk("DS1", p.length === 0, "seq โมโนโทนิก · ×10 = 1 · changed:false · paired:false ไม่สร้างแถว · สิทธิ์ · ไม่เขียน audit/outbox · โพล 30 วิ", FXB(joinP(p)));
  }

  // ════════ DS2 หมดอายุ/เพดาน ════════
  {
    const p: string[] = [];
    if (!TOK) p.push("ไม่มี token หลัก (PA3)");
    else {
      const sStale = nextSeq();
      await publish("D1", sStale, CART());
      const live = await read(TOK);
      if (viewOf(live)?.phase !== "cart" || Number(live?.nextPollMs) !== 1000) p.push(`cart → phase ${viewOf(live)?.phase} nextPollMs ${live?.nextPollMs} (คาด cart · 1000)`);
      await ex(`UPDATE "PosCustomerDisplay" SET "stateAt" = $3 WHERE "tenantId" = $1 AND "deviceId" = $2 AND status::text = 'ACTIVE'`, T, DID.D1, new Date(Date.now() - 121_000));
      const st = await read(TOK);
      const sv = viewOf(st);
      if (sv?.phase !== "idle" || (sv?.lines ?? []).length || sv?.member) p.push(`เก่า 121 วิ → phase ${sv?.phase} บรรทัด ${(sv?.lines ?? []).length} สมาชิก ${sv?.member ? "มี" : "ไม่มี"} (คาด idle ว่าง)`);
      if (Number(st?.nextPollMs) !== 3000) p.push(`idle nextPollMs ${st?.nextPollMs} (คาด 3000)`);
      const st2 = await read(TOK, sStale);
      if (st2?.changed === false || viewOf(st2)?.phase !== "idle") p.push(`เก่า 121 วิ + sinceSeq = seq → changed ${st2?.changed} phase ${viewOf(st2)?.phase} (คาด idle · ห้ามค้างภาพบิล)`);
      const sPay = nextSeq();
      await publish("D1", sPay, PAYING(PAY({ method: "CASH", cashReceivedSatang: 50_000, changeSatang: 0 })));
      const pr = await read(TOK);
      if (viewOf(pr)?.phase !== "paying" || Number(pr?.nextPollMs) !== 1000) p.push(`paying → ${viewOf(pr)?.phase} · ${pr?.nextPollMs}`);
      const sDone = nextSeq();
      await publish("D1", sDone, DONE({ receiptNo: `R-${RAND}`, changeSatang: 0 }));
      const dn = await read(TOK);
      if (viewOf(dn)?.phase !== "done" || Number(dn?.nextPollMs) !== 1000) p.push(`done → phase ${viewOf(dn)?.phase} nextPollMs ${dn?.nextPollMs} (คาด done · 1000)`);
      await ex(`UPDATE "PosCustomerDisplay" SET "stateAt" = $3 WHERE "tenantId" = $1 AND "deviceId" = $2 AND status::text = 'ACTIVE'`, T, DID.D1, new Date(Date.now() - 21_000));
      const dn2 = await read(TOK, sDone);
      if (viewOf(dn2)?.phase !== "idle") p.push(`done เก่า 21 วิ → changed ${dn2?.changed} phase ${viewOf(dn2)?.phase} (คาด idle)`);
      // 21 บรรทัด → 20 + moreCount 1
      const many = Array.from({ length: 21 }, (_, i) => ({ qty: 1, name: `ของ ${i + 1}`, grossSatang: 1_000, discountSatang: 0 }));
      await publish("D1", nextSeq(), CART({ lines: many, stamp: undefined }));
      const mv = viewOf(await read(TOK));
      if (mv?.lines?.length !== 20 || Number(mv?.moreCount) !== 1) p.push(`21 บรรทัด → ${mv?.lines?.length} + moreCount ${mv?.moreCount} (คาด 20 + 1)`);
      // > 16 KB / คีย์แปลก → ปฏิเสธ · แถวไม่เปลี่ยน
      const seqBefore = Number((await activeOf("D1"))[0]?.stateSeq ?? -1);
      // 20 บรรทัด (ไม่เกินเพดานบรรทัด) แต่ละช่อง ≤ 80 ตัว — ก้อนเกิน 16 KB แม้ตัดบรรทัดแล้ว
      const big = Array.from({ length: 20 }, (_, i) => ({ qty: 1, name: `${"ก".repeat(77)}${String(i).padStart(3, "0")}`, detail: "ข".repeat(80), grossSatang: 1_000, discountSatang: 100, discountLabel: "ฃ".repeat(80) }));
      const bigState = CART({ lines: big });
      const bytes = Buffer.byteLength(JSON.stringify(bigState), "utf8");
      const rb = await publish("D1", nextSeq(), bigState);
      if (bytes <= 16_384) p.push(`ฟิกซ์เจอร์ 17 KB ได้แค่ ${bytes} ไบต์`);
      if (!refused(rb, "DISPLAY_STATE_INVALID")) p.push(`${Math.round(bytes / 1024)} KB → ${codeOf(rb)}`);
      const rk = await publish("D1", nextSeq(), { ...CART(), foo: 1 });
      if (!refused(rk, "DISPLAY_STATE_INVALID")) p.push(`คีย์แปลก foo → ${codeOf(rk)}`);
      const rp = await publish("D1", nextSeq(), CART({ phase: "refund" }));
      if (!refused(rp, "DISPLAY_STATE_INVALID")) p.push(`phase refund → ${codeOf(rp)}`);
      if (Number((await activeOf("D1"))[0]?.stateSeq ?? -2) !== seqBefore) p.push("คำขอที่ถูกปฏิเสธเปลี่ยน stateSeq");
      // ข้อความ 81 ตัว → ปฏิเสธหรือตัด ≤ 80
      const long = await publish("D1", nextSeq(), CART({ lines: [{ qty: 1, name: "ค".repeat(81), grossSatang: 1_000, discountSatang: 0 }] }));
      if (!refused(long, "DISPLAY_STATE_INVALID")) {
        const lv = viewOf(await read(TOK));
        const n = [...String(lv?.lines?.[0]?.name ?? "")].length;
        if (long?.ok !== true || n > 80 || n === 0) p.push(`ชื่อ 81 ตัว → ${codeOf(long)} · ใน view ${n} ตัว (คาด ปฏิเสธ หรือ ≤ 80)`);
      }
    }
    chk("DS2", p.length === 0, "เก่า 121 วิ/done 21 วิ → idle · 20 + moreCount · 16 KB/คีย์แปลก = DISPLAY_STATE_INVALID · nextPollMs", FXB(joinP(p)));
  }

  // ════════ CT1 เนื้อหา ════════
  let fullView: Any = null;
  {
    const p: string[] = [];
    if (!TOK) p.push("ไม่มี token หลัก (PA3)");
    else {
      await publish("D1", nextSeq(), CART());
      const v = viewOf(await read(TOK));
      fullView = v;
      if (!v) p.push("อ่าน view ไม่ได้");
      else {
        const h = v.header ?? {};
        if (h.shopName !== SHOP || h.logoUrl !== LOGO || h.branch !== `สาขาหัวหิน ${RAND}` || h.counter !== DEVNAME.D1) p.push(`header ${short(h, 160)}`);
        const ln = (v.lines ?? []) as Any[];
        const want = LINES.map((l) => ({ qty: l.qty, name: l.name, detail: l.detail ?? null, grossSatang: l.grossSatang, discountSatang: l.discountSatang, discountLabel: l.discountLabel ?? null }));
        const got = ln.map((l) => ({ qty: l.qty, name: l.name, detail: l.detail ?? null, grossSatang: l.grossSatang, discountSatang: l.discountSatang ?? 0, discountLabel: l.discountLabel ?? null }));
        if (JSON.stringify(got) !== JSON.stringify(want)) p.push(`lines ${short(got, 160)}`);
        if (Number(v.moreCount ?? 0) !== 0) p.push(`moreCount ${v.moreCount} (คาด 0)`);
        const t = v.totals ?? {};
        const tWant = { ...TOTALS };
        const tGot = { subtotalSatang: t.subtotalSatang, lineDiscountSatang: t.lineDiscountSatang, billDiscountSatang: t.billDiscountSatang, coupon: t.coupon, member: t.member, serviceChargeSatang: t.serviceChargeSatang, grandTotalSatang: t.grandTotalSatang };
        if (JSON.stringify(tGot) !== JSON.stringify(tWant)) p.push(`totals ${short(tGot, 200)}`);
        const st = v.stamp ?? {};
        if (st.name !== STAMP_IN.name || st.filled !== 7 || st.slots !== 10 || st.toAdd !== 1 || st.near !== false) p.push(`stamp 6+1/10 → ${short(st, 120)} (คาด filled 7 near false)`);
        if (v.member?.firstName !== "สมชาย" || v.member?.tier !== "Gold" || Number(v.member?.points) !== 98_765) p.push(`member ${short(v.member, 120)} (คาด สมชาย · Gold · 98765)`);
        if (v.settings?.showPoints !== true || v.settings?.locale !== "th") p.push(`settings ปริยาย ${short(v.settings, 120)}`);
      }
      const stampCase = async (stamp: Any): Promise<Any> => {
        await publish("D1", nextSeq(), CART({ stamp }));
        return viewOf(await read(TOK))?.stamp;
      };
      const s8 = await stampCase({ ...STAMP_IN, stamps: 7 });
      if (s8?.filled !== 8 || s8?.near !== true) p.push(`stamp 7+1/10 → ${short(s8, 80)} (คาด 8 near true)`);
      const s10 = await stampCase({ ...STAMP_IN, stamps: 9, toAdd: 3 });
      if (s10?.filled !== 10 || s10?.near !== true) p.push(`stamp 9+3/10 → ${short(s10, 80)} (คาด 10 · min · near true)`);
      await publish("D1", nextSeq(), CART({ stamp: undefined }));
      const s0 = viewOf(await read(TOK));
      if (s0 && s0.stamp !== null && s0.stamp !== undefined) p.push(`ไม่มีโปรแกรม → stamp ${short(s0.stamp, 60)} (คาด null)`);
      // ค่าตั้ง
      const u1 = await settings("A", owner, { deviceId: DID.D1, locale: "en", idleText: `สวัสดี QC ${RAND}` });
      if (u1?.ok !== true) p.push(`แก้ค่าตั้ง → ${codeOf(u1)}`);
      const v2 = viewOf(await read(TOK));
      if (v2?.settings?.locale !== "en" || v2?.settings?.idleText !== `สวัสดี QC ${RAND}`) p.push(`หลังแก้ settings ${short(v2?.settings, 120)}`);
      const rowB = JSON.stringify((await activeOf("D1")).map((r) => [r.locale, r.idleText, r.showPoints]));
      const b1 = await settings("A", owner, { deviceId: DID.D1, locale: "fr" });
      const b2 = await settings("A", owner, { deviceId: DID.D1, idleText: "ง".repeat(81) });
      const b3 = await settings("A", cashier, { deviceId: DID.D1, showPoints: false });
      if (b1?.ok !== false || b2?.ok !== false) p.push(`locale fr → ${codeOf(b1)} · idleText 81 → ${codeOf(b2)} (คาด ปฏิเสธ)`);
      if (!refused(b3, "PERMISSION_DENIED")) p.push(`แคชเชียร์แก้ค่าตั้ง → ${codeOf(b3)}`);
      if (JSON.stringify((await activeOf("D1")).map((r) => [r.locale, r.idleText, r.showPoints])) !== rowB) p.push("ค่าตั้งที่ถูกปฏิเสธเปลี่ยนแถว");
      await settings("A", owner, { deviceId: DID.D1, locale: null, idleText: null });
    }
    chk("CT1", p.length === 0, "header · บรรทัด · ยอด · คูปอง · สแตมป์ min/near · ค่าตั้ง", FXB(joinP(p)));
  }

  // ════════ CT2 PDPA ════════
  {
    const p: string[] = [];
    if (!TOK || !fullView) p.push("ไม่มี view เต็ม (CT1)");
    else {
      const leaks: [string, string][] = [["เบอร์", MEMBER.phone], ["เบอร์ปิดบัง", MEMBER.phoneMasked], ["รหัสสมาชิก", MEMBER.memberCode], ["นามสกุล", "ใจดี"]];
      for (const [lbl, s] of leaks) if (s && deepHas(fullView, s)) p.push(`view มี${lbl}`);
      if (!MEMBER.memberCode) notes.push("CT2: ไม่มี memberCode ของสมาชิก X (ข้ามการสแกนรหัสสมาชิก)");
      if (!deepHas(fullView, "WELCOME50")) p.push("ไม่มีโค้ดคูปอง (ต้องแสดงได้)");
      await publish("D1", nextSeq(), CART({ member: { ...MEMBER_IN, firstName: `${"ส".repeat(40)} ท้าย` } }));
      const fn = String(viewOf(await read(TOK))?.member?.firstName ?? "");
      if ([...fn].length > 30 || /ท้าย/.test(fn) || !fn) p.push(`ชื่อต้นยาว → "${short(fn, 40)}" (คาด คำแรก ≤ 30 ตัว)`);
      const bad = [
        ["member.phone", CART({ member: { ...MEMBER_IN, phone: MEMBER.phone } })],
        ["member.phoneMasked", CART({ member: { ...MEMBER_IN, phoneMasked: MEMBER.phoneMasked || "089***1234" } })],
        ["member.memberCode", CART({ member: { ...MEMBER_IN, memberCode: MEMBER.memberCode || "M0001" } })],
        ["member.lastName", CART({ member: { ...MEMBER_IN, lastName: "ใจดี" } })],
        ["pay.giftCardNumber", PAYING(PAY({ giftCardNumber: "GC-1234-5678" }))],
        ["pay.depositNo", PAYING(PAY({ depositNo: "DP-0001" }))],
      ] as const;
      for (const [lbl, s] of bad) {
        const r = await publish("D1", nextSeq(), s);
        if (!refused(r, "DISPLAY_STATE_INVALID")) p.push(`${lbl} → ${codeOf(r)}`);
      }
      const off = await settings("A", owner, { deviceId: DID.D1, showPoints: false });
      if (off?.ok !== true) p.push(`showPoints false → ${codeOf(off)}`);
      await publish("D1", nextSeq(), CART());
      const v = viewOf(await read(TOK));
      if (!v || (v.member?.points !== undefined && v.member?.points !== null) || deepHas(v, "98765")) p.push(`showPoints false → points ${short(v?.member?.points, 20)}`);
      if (v?.settings?.showPoints !== false) p.push("settings.showPoints ไม่ใช่ false");
      await publish("D1", nextSeq(), DONE({ receiptNo: `R-${RAND}`, changeSatang: 0, pointsEarned: 4_321 }));
      const dv = viewOf(await read(TOK));
      if (!dv || (dv.done?.pointsEarned !== undefined && dv.done?.pointsEarned !== null) || deepHas(dv, "4321")) p.push(`showPoints false → แต้มที่ได้ ${short(dv?.done?.pointsEarned, 20)} (คาด ไม่มี)`);
      await settings("A", owner, { deviceId: DID.D1, showPoints: true });
    }
    chk("CT2", p.length === 0, "ไม่มีเบอร์/รหัสสมาชิก/นามสกุล · ชื่อต้น ≤ 30 · ฟิลด์ต้องห้าม = DISPLAY_STATE_INVALID · showPoints", FXB(joinP(p)));
  }

  // ════════ CT3 ชื่อที่เป็นรหัสสมาชิก · ป้ายส่วนลดสมาชิก ════════
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.10 fix 1) — R1 F2 F4 · มติ fix1 ข้อ 2 4 8 (ข้อสอบเพิ่ม 12 + 1 = 13)
  {
    const p: string[] = [];
    if (!TOK) p.push("ไม่มี token หลัก (PA3)");
    else if (!MEMBER.memberCode) p.push("ไม่มี memberCode ของสมาชิก X (ฟิกซ์เจอร์)");
    else {
      // (a) สมาชิกไม่มีชื่อ → บรีฟสมาชิกใช้รหัสสมาชิกแทนชื่อ (member/profile.ts briefsOf) → hook เดิมส่งรหัสมาเป็น firstName
      const MC = MEMBER.memberCode;
      await publish("D1", nextSeq(), CART({ member: { firstName: MC, tier: "Gold", points: 1_234 } }));
      const va = viewOf(await read(TOK));
      if (!va) p.push("ชื่อ = รหัสสมาชิก → อ่าน view ไม่ได้");
      else {
        if (va.member?.firstName !== "") p.push(`ชื่อ = รหัสสมาชิก → firstName "${short(va.member?.firstName, 20)}" (คาด "")`);
        if (deepHas(va, MC)) p.push("ชื่อ = รหัสสมาชิก → view มีรหัสสมาชิก");
      }
      await publish("D1", nextSeq(), { phase: "done", member: { firstName: MC, tier: null }, done: { receiptNo: `R3-${RAND}`, changeSatang: 0 } });
      const vd = viewOf(await read(TOK));
      if (!vd || vd.member?.firstName !== "" || deepHas(vd, MC)) p.push(`done ชื่อ = รหัสสมาชิก → ${short(vd?.member, 60)} (คาด firstName "" · ไม่มีรหัส)`);
      // คุมผลบวก: ชื่อจริงยังแสดง
      await publish("D1", nextSeq(), CART());
      if (viewOf(await read(TOK))?.member?.firstName !== "สมชาย") p.push("ชื่อจริง (สมชาย) หายไป (คุมผลบวก)");

      // (b) ป้ายส่วนลดสมาชิก: hook ส่ง kind · POINTS + showPoints=false → ป้ายกลาง ไม่มีตัวเลข · VOUCHER ไม่มีชื่อ → "คูปอง" ไม่มีโค้ด
      const VCODE = `QCV${RAND.toUpperCase()}7`;
      const ML = [
        { kind: "TIER", label: "ส่วนลดสมาชิก Gold", satang: 4_000 },
        { kind: "POINTS", label: "ใช้ 1,240 แต้ม", satang: 6_200 }, // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.10 fix 1) แก้: ยอด 12_400 มีสตริง "1240" (ผลบวกปลอม)
        { kind: "VOUCHER", label: VCODE, satang: 5_000 }, // hook เดิม: ชื่อ voucher ไม่มี → wallet ใช้ res.code
        { kind: "VOUCHER", satang: 3_000 }, // hook ใหม่: ไม่มีชื่อ = ไม่ส่งป้าย
        { kind: "VOUCHER", label: "ส่วนลดวันเกิด", satang: 2_000 }, // มีชื่อ = แสดงชื่อ (คุมผลบวก)
      ];
      const withML = () => CART({ totals: { ...TOTALS, member: ML } });
      const off = await settings("A", owner, { deviceId: DID.D1, showPoints: false });
      if (off?.ok !== true) p.push(`showPoints false → ${codeOf(off)}`);
      const r0 = await publish("D1", nextSeq(), withML());
      if (r0?.ok !== true || r0?.written !== true) p.push(`publish totals.member มี kind → ${codeOf(r0)} written ${r0?.written}`);
      const vb = viewOf(await read(TOK));
      const ml = ((vb?.totals?.member ?? []) as Any[]).map((m) => ({ label: String(m?.label ?? ""), satang: Number(m?.satang) }));
      if (ml.length !== ML.length) p.push(`totals.member ${ml.length} แถว (คาด ${ML.length}) ${short(ml, 120)}`);
      else {
        if (ml[0]!.label !== "ส่วนลดสมาชิก Gold") p.push(`TIER → "${ml[0]!.label}"`);
        if (!ml[1]!.label || /\d/.test(ml[1]!.label) || ml[1]!.label === "ใช้ 1,240 แต้ม") p.push(`POINTS + showPoints=false → "${ml[1]!.label}" (คาด ป้ายกลาง ไม่มีตัวเลข)`);
        if (ml[2]!.label !== "คูปอง" || ml[3]!.label !== "คูปอง") p.push(`VOUCHER ไม่มีชื่อ → "${ml[2]!.label}" / "${ml[3]!.label}" (คาด "คูปอง")`);
        if (ml[4]!.label !== "ส่วนลดวันเกิด") p.push(`VOUCHER มีชื่อ → "${ml[4]!.label}" (คาด ชื่อ voucher · คุมผลบวก)`);
        if (ml.map((m) => m.satang).join() !== ML.map((m) => m.satang).join()) p.push(`ยอด totals.member ${short(ml.map((m) => m.satang), 60)}`);
      }
      if (deepHas(vb, VCODE)) p.push("view มีโค้ด voucher");
      if (deepHas(vb, "1,240") || ml.some((m) => /1,?240/.test(m.label))) p.push("showPoints=false → view มีจำนวนแต้มที่ใช้");
      // คุมผลบวก: showPoints=true → ป้ายแต้มเดิม · VOUCHER ไม่มีชื่อยังเป็น "คูปอง"
      await settings("A", owner, { deviceId: DID.D1, showPoints: true });
      const vp = viewOf(await read(TOK));
      const mp = ((vp?.totals?.member ?? []) as Any[]).map((m) => String(m?.label ?? ""));
      if (mp[1] !== "ใช้ 1,240 แต้ม") p.push(`POINTS + showPoints=true → "${short(mp[1], 30)}" (คาด ป้ายเดิม)`);
      if (mp[2] !== "คูปอง" || deepHas(vp, VCODE)) p.push(`showPoints=true VOUCHER ไม่มีชื่อ → "${short(mp[2], 30)}"`);
    }
    chk("CT3", p.length === 0, "ชื่อ = รหัสสมาชิก → firstName \"\" ไม่มีรหัส · POINTS (showPoints=false) ป้ายกลางไม่มีตัวเลข · VOUCHER ไม่มีชื่อ = \"คูปอง\" ไม่มีโค้ด", FXB(joinP(p)));
  }

  // ════════ PY1 พร้อมเพย์ ════════
  {
    const p: string[] = [];
    // ฟิกซ์เจอร์ใบขอรับเงิน (สร้างก่อนด่าน token — ตรวจฟิกซ์เจอร์ได้ตั้งแต่ก่อนมีของ P2.10)
    const mk = async (unit: string, dev: string, k: string, amountSatang = 32_500) =>
      call(intentMod, "createPaymentIntent", ctxOf(unit, dev), owner, { method: "PROMPTPAY", amountSatang, idempotencyKey: `p210${RAND}-${k}`, deviceId: dev });
    const i1 = ready ? await mk("A", DV.D1, "i1") : null;
    const i3 = ready ? await mk("A", DV.D3, "i3", 31_100) : null;
    const iB = ready ? await mk("B", DV.D1, "ib", 31_200) : null;
    const I1 = i1?.intent;
    if (i1?.ok !== true || !I1?.id) p.push(`ฟิกซ์เจอร์ createPaymentIntent D1 → ${codeOf(i1)} ${short(i1?.message ?? "", 60)}`);
    if (i3?.ok !== true || iB?.ok !== true) p.push(`ฟิกซ์เจอร์ intent D3/B → ${codeOf(i3)}/${codeOf(iB)}`);
    if (!TOK) p.push("ไม่มี token หลัก (PA3)");
    else {
      const pp = (amt: number) => (typeof ppMod?.promptpayPayload === "function" ? String(ppMod.promptpayPayload({ id: PPID, amountSatang: amt })) : "?");
      const qrIn = await publish("D1", nextSeq(), PAYING(PAY({ qr: { payload: "000201FAKE", amountSatang: 1 } })));
      const qrIn2 = await publish("D1", nextSeq(), PAYING(PAY({ qrPayload: "000201FAKE" })));
      if (!refused(qrIn, "DISPLAY_STATE_INVALID") || !refused(qrIn2, "DISPLAY_STATE_INVALID")) p.push(`qr จาก client → ${codeOf(qrIn)} / ${codeOf(qrIn2)}`);
      if (I1?.id) {
        const s1 = nextSeq();
        await publish("D1", s1, PAYING(PAY({ intentId: I1.id })));
        const r1 = await read(TOK);
        const pay = viewOf(r1)?.pay;
        if (pay?.qr?.payload !== I1.qrPayload || Number(pay?.qr?.amountSatang) !== 32_500 || pay?.qr?.status !== "PENDING" || pay?.qr?.intentId !== I1.id) p.push(`intent D1 → qr ${short(pay?.qr, 120)}`);
        if (Number(pay?.paidSatang) !== 30_000 || Number(pay?.remainingSatang) !== 32_500 || Number(pay?.dueSatang) !== 62_500) p.push(`ชำระแล้ว/คงเหลือ ${short(pay, 140)}`);
        const mp = await call(intentMod, "markIntentPaid", I1.id, { via: "MANUAL", userId: ownerId, amountSatang: 32_500 });
        if (mp?.ok !== true) p.push(`markIntentPaid → ${codeOf(mp)}`);
        const r2 = await read(TOK);
        if (viewOf(r2)?.pay?.qr?.status !== "PAID") p.push(`หลัง PAID read เต็ม → ${short(viewOf(r2)?.pay?.qr?.status, 20)}`);
        // จอถือ seq ของการอ่านก่อน PAID — การอ่านถัดไปต้องเห็น PAID (ห้าม changed:false ค้าง PENDING)
        const r3 = await read(TOK, Number(r1?.seq ?? s1));
        if (r3?.changed === false || viewOf(r3)?.pay?.qr?.status !== "PAID") p.push(`หลัง PAID read sinceSeq เดิม → changed ${r3?.changed} status ${short(viewOf(r3)?.pay?.qr?.status, 20)} (คาด PAID)`);
      }
      const staticWant = pp(32_500);
      for (const [lbl, it] of [["ใบของ D3", i3?.intent], ["ใบของสาขา B", iB?.intent]] as const) {
        if (!it?.id) continue;
        await publish("D1", nextSeq(), PAYING(PAY({ intentId: it.id })));
        const q1 = viewOf(await read(TOK))?.pay?.qr;
        if (q1?.payload !== staticWant || !!q1?.intentId) p.push(`${lbl} → qr ${short(q1, 100)} (คาด QR นิ่งของร้าน ยอด roundSatang)`);
      }
      await publish("D1", nextSeq(), PAYING(PAY()));
      const qs = viewOf(await read(TOK))?.pay?.qr;
      if (qs?.payload !== staticWant || Number(qs?.amountSatang) !== 32_500 || !!qs?.intentId) p.push(`ไม่มี intentId → qr ${short(qs, 100)} (คาด QR นิ่ง ${staticWant.slice(0, 16)}…)`);
      await publish("D1", nextSeq(), PAYING(PAY({ method: "CASH", roundSatang: 32_500, cashReceivedSatang: 50_000, changeSatang: 17_500 })));
      const cv = viewOf(await read(TOK))?.pay;
      if (cv?.method !== "CASH" || Number(cv?.cashReceivedSatang) !== 50_000 || Number(cv?.changeSatang) !== 17_500 || cv?.qr) p.push(`เงินสด → ${short(cv, 140)}`);
      await publish("D1", nextSeq(), PAYING(PAY({ method: "CARD" })));
      const kv = viewOf(await read(TOK))?.pay;
      if (kv?.method !== "CARD" || kv?.qr) p.push(`บัตรไม่มีใบ → ${short(kv, 100)} (คาด qr null)`);
    }
    chk("PY1", p.length === 0, "QR จากใบของเครื่องนี้ / QR นิ่ง · client qr ถูกปฏิเสธ · PAID ไม่ต้อง publish · ยอดตรง", FXB(joinP(p)));
  }

  // ════════ PY2 จบบิล + ลิงก์ใบเสร็จ ════════
  {
    const p: string[] = [];
    // ฟิกซ์เจอร์บิล (กะ D1 ×2 · กะ D3) สร้างก่อนด่าน token
    const sell = async (dev: string, k: string, price: number) => {
      const cart = { lines: [{ name: `ของ PY2 ${k} ${RAND}`, qty: 1, unitPriceSatang: price }] };
      const q0 = await call(regMod, "quoteRegisterCart", ctxOf("A", dev), owner, cart);
      const g = Number(q0?.grandTotalSatang ?? price);
      return call(regMod, "submitRegisterSale", ctxOf("A", dev), owner, { ...cart, idempotencyKey: `p210${RAND}-${k}`, expectedGrandTotalSatang: g, payMethods: [{ type: "CASH", amountSatang: g }], cashReceivedSatang: g });
    };
    const s1 = ready ? await sell(DV.D1, "s1", 10_000) : null;
    const sOld = ready ? await sell(DV.D1, "s1old", 11_000) : null;
    const s3 = ready ? await sell(DV.D3, "s3", 12_000) : null;
    if (s1?.ok !== true || sOld?.ok !== true || s3?.ok !== true) p.push(`ฟิกซ์เจอร์ ขาย → ${codeOf(s1)}/${codeOf(sOld)}/${codeOf(s3)} ${short(s1?.message ?? "", 60)}`);
    const shiftDev = async (id: string): Promise<string | null> => {
      const sale = await P.posSale.findUnique({ where: { id }, select: { shiftId: true } }).catch(() => null);
      const sh = sale?.shiftId ? await P.posShift.findUnique({ where: { id: sale.shiftId }, select: { deviceId: true } }).catch(() => null) : null;
      return sh?.deviceId ?? null;
    };
    if (s1?.saleId && (await shiftDev(s1.saleId)) !== DV.D1) p.push("ฟิกซ์เจอร์ บิล s1 ไม่อยู่ในกะของ D1");
    if (s3?.saleId && (await shiftDev(s3.saleId)) !== DV.D3) p.push("ฟิกซ์เจอร์ บิล s3 ไม่อยู่ในกะของ D3");
    const tokOf = async (id: string) => String((await P.posSale.findUnique({ where: { id }, select: { publicToken: true } }).catch(() => null))?.publicToken ?? "");
    if (sOld?.saleId) {
      const old = new Date(Date.now() - 16 * 60_000);
      const row = await P.posSale.findUnique({ where: { id: sOld.saleId }, select: { paidAt: true } }).catch(() => null);
      const n = await P.posSale.updateMany({ where: { id: sOld.saleId, tenantId: T }, data: { createdAt: old, ...(row?.paidAt ? { paidAt: old } : {}) } }).catch((e: Error) => {
        notes.push(`เลื่อนบิลเก่า: ${e.message.replace(/\s+/g, " ").slice(0, 100)}`);
        return null;
      });
      if (n?.count !== 1) p.push("ฟิกซ์เจอร์ เลื่อนบิลเก่า 16 นาทีไม่ได้");
    }
    if (!TOK) p.push("ไม่มี token หลัก (PA3)");
    else {
      const doneOf = async (saleId: string, extra: Any = {}) => {
        await publish("D1", nextSeq(), DONE({ receiptNo: `R-${RAND}`, saleId, changeSatang: 2_000, pointsEarned: 62, ...extra }));
        return viewOf(await read(TOK))?.done;
      };
      if (s1?.saleId) {
        const d1 = await doneOf(s1.saleId);
        const want = `${ORIGIN}/r/${await tokOf(s1.saleId)}`;
        if (!ORIGIN) p.push("publicOrigin() ไม่มีค่า");
        if (d1?.receiptUrl !== want) p.push(`บิล D1 → receiptUrl ${short(d1?.receiptUrl, 80)} (คาด ${want})`);
        if (d1?.receiptNo !== `R-${RAND}` || Number(d1?.changeSatang) !== 2_000 || Number(d1?.pointsEarned) !== 62) p.push(`done ${short(d1, 140)}`);
        const ru = await publish("D1", nextSeq(), DONE({ receiptNo: `R-${RAND}`, saleId: s1.saleId, changeSatang: 0, receiptUrl: "https://evil.example/r/x" }));
        if (!refused(ru, "DISPLAY_STATE_INVALID")) p.push(`receiptUrl จาก client → ${codeOf(ru)}`);
        // qrEReceipt ปิด
        const setQr = async (on: boolean | null) => {
          const s = (await P.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } }))?.settings ?? {};
          const pos = isRecord(s.pos) ? s.pos : {};
          const receipt = isRecord(pos.receipt) ? { ...pos.receipt } : {};
          if (on === null) delete receipt.qrEReceipt;
          else receipt.qrEReceipt = on;
          await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...s, pos: { ...pos, receipt } } } });
        };
        await setQr(false);
        const dOff = await doneOf(s1.saleId);
        if (dOff?.receiptUrl !== null) p.push(`qrEReceipt ปิด → ${short(dOff?.receiptUrl, 60)} (คาด null)`);
        await setQr(null);
      }
      for (const [lbl, id] of [["บิลของ D3", s3?.saleId], ["บิลเก่า 16 นาที", sOld?.saleId], ["id มั่ว", `qc-none-${RAND}`]] as const) {
        if (!id) continue;
        const d = await doneOf(id);
        if (!d || d.receiptUrl !== null) p.push(`${lbl} → receiptUrl ${short(d?.receiptUrl, 60)} (คาด null)`);
      }
    }
    chk("PY2", p.length === 0, "ลิงก์ใบเสร็จเฉพาะบิลกะ D1 ≤ 15 นาที + qrEReceipt · client receiptUrl ถูกปฏิเสธ", FXB(joinP(p)));
  }
  if (notes.length) console.log(`  ℹ️  ฟิกซ์เจอร์มีหมายเหตุ ${notes.length}: ${notes.slice(0, 8).join(" | ")}`);
}

// ═════════════════════════ 6. คืนสภาพ ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; err: string };
async function wipeTenant(tid: string, slug: string): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
  if (!tid) return rep;
  try {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as Any[];
    if (t.length && t[0].slug !== slug) {
      rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
      return rep;
    }
  } catch (e) {
    rep.err = `อ่าน Tenant ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
    return rep;
  }
  const tables = ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid);
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, slug);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const tb of tables) {
    try {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
      if (n) rep.left[tb] = n;
    } catch {
      rep.left[tb] = -1;
    }
  }
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, tid)) as Any[])[0]?.n ?? 0);
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
const wipes: WipeReport[] = [];
let bucketsLeft = -1;
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    await drain();
    await sleep(300);
    for (const [tid, slug] of [[T, T_SLUG], [T2, T2_SLUG]] as const) {
      const w = await wipeTenant(tid, slug);
      wipes.push(w);
      const residue = Object.values(w.left).reduce((a, b) => a + Math.abs(b), 0) + w.tenantLeft;
      console.log(`  ลบร้านชั่วคราว ${tid || "(ไม่ได้สร้าง)"}: ${w.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
    // ถังเพดานอัตราของรอบนี้ (คีย์มี ip ปลอม qc-p210-<RAND>-ipN)
    const like = `%qc-p210-${RAND}-%`;
    const nb = Number(await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, like).catch(() => -1));
    bucketsLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE $1`, like).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    console.log(`  ลบถังเพดานอัตราของรอบ ${nb} แถว · เหลือ ${bucketsLeft}`);
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
    console.log(`💥 cleanup ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = sum(wipes.map((w) => w.tenantLeft));
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
const fpErr = Object.values(fpBefore).some((v) => v.startsWith("err"));
chk(
  "Z1",
  tempLeft.length === 0 && tenantLeft === 0 && !wipeErr && bucketsLeft === 0 && fpDrift.length === 0 && !fpErr,
  "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ถังเพดาน 0 · ลายนิ้วมือ seed เท่าเดิม",
  [
    tempLeft.length ? `เหลือ ${tempLeft.join(", ")}` : `0 แถว (${wipes[0]?.tables ?? 0} ตาราง)`,
    tenantLeft ? "Tenant ยังอยู่" : "",
    wipeErr,
    `ถังเพดาน ${bucketsLeft}`,
    fpDrift.length ? `ลายนิ้วมือต่าง ${fpDrift.join(", ")}` : `ลายนิ้วมือเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`,
  ].filter(Boolean).join(" · "),
);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, st2Pins: st2PinsOk, mergeBase: MB, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft, buckets: bucketsLeft, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.10: ใบเสร็จ 80 มม. (แผง B · P1.10) · หน้า /r (แผง C · P1.11U) · คืนเงิน/ยกเลิกบนจอ · ลูกค้ากรอกบนจอ · Ably/SSE · สไลด์โฆษณา · KDS ·
// CARD_BEAM (QR = URL ของ Beam) ตรวจที่ภาพ/รีวิว (ฟิกซ์เจอร์ไม่มี Beam) · ภาพ 10 state + 3 state ค่าตั้ง = visual-pos wo p2.10 (ผู้คุมงาน)
