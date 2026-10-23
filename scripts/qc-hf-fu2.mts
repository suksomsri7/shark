// QC — POS RUN ใบ HF-FU2: ถังงานตามเก็บของ P2 (ตัวรันด่านเข้มขึ้น · แมนิเฟสต์ · DEP-1 ฝั่งจอ · PRC-1 · D12b · ACC-1 WARN · ป้าย PRC-3)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ · ไม่ต้องมี seed (ร้านชั่วคราวของตัวเอง + ผู้ใช้ชั่วคราว)
//
// สัญญา: ledger/pos-briefs/pos-brief-HF-FU2.md ⚠️1–4 · §1 ตาราง A–W · §2 ทางแก้เล็กสุด · §3 หมุด · §4 แผนข้อสอบ · §8 มติผู้คุม 1–10 (ผูกมัด:
//        ACC-1 = WARN อย่างเดียว (AC1/AC2 จริง) · PRC-1 = พา notSold ลงชั้นช่องทาง · ป้าย PRC-3 อยู่ในใบ · p2.10 ST2 ผู้คุมแก้แล้ว · ตัวรัน/แมนิเฟสต์ก่อน)
//        โน้ต: ledger/wo-notes/pos-HF-FU2-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง · ความคลาดเคลื่อน · ORACLE-EDIT · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ขอบเขต: ST สถิต · DP มัดจำโทษแถว (บริสุทธิ์) · PR บวกราคาทั้งช่องทาง (DB) · DS จอลูกค้า · PB ป้ายเทียบราคา · RG ตัวรันด่าน (ไม่แตะ DB) ·
//         MF แมนิเฟสต์ · AC ค่าคอมฯ ข้ามสมุด (DB) · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-hf-fu): SKIP เมื่อของ HF-FU2 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · PAR เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB ไม่ import อะไร · --no-db = ST DP DS1 PB RG MF (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-hffu2-<rand>` + ผู้ใช้ `posqc-hffu2-<rand>-*@qc.invalid` (ลบทั้งหมดใน finally · แถวค้าง = 0) ·
//    ไม่มีเครือข่าย (fetch = ตัวกั้น 503) · ทุกข้อห่อ try/catch (ข้อพัง = แดงพร้อมเหตุผล ไม่ล้มทั้งชุด) · fixture ผ่านฟังก์ชันของโมดูล ·
//    Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership/AccountSystemLink (ย้ายสมุด) + อ่าน · SQL ดิบ = ลายนิ้วมือ / ลบร้านชั่วคราว
//    RG = โฟลเดอร์ผลชั่วคราว + รากชั่วคราว (git init · สำเนาไบต์ของ scripts/pos-gates-all.sh + แมนิเฟสต์) ใต้ $TMPDIR/hffu2-rg-* แล้วเรียก
//         `bash <ราก>/scripts/pos-gates-all.sh --verdict <dir>` (ลบใน finally · ไม่ export CI)
//    โมดูล/ฟังก์ชันที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + ตรวจว่ามี) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUITE = "qc-hf-fu2";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต · X4 เงิน/จำนวน · X5 ไม่เขียนอะไร · G ตัวรันด่าน · PAR = เขียวทั้งก่อนและหลังสร้าง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`HF-FU2-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "PAR", "[§4 §6 มติ 1 5] เทียบหมุด 72669941: ไม่มี migration (prisma/ เท่าเดิม · ไม่มีไฟล์ใหม่) · scripts/pos-sale-contract.json เท่าเดิม · ไม่มี hunk ใน pos/register*.ts(x) service.ts tender*.ts payment-intent.ts held-cart.ts deposit.ts · outbox-consumers.ts · core/outbox.ts · proxy.ts · ผู้เรียก InterimPayDialog (RegisterScreen TableCheckout OrderPay) เท่าเดิม · ทะเบียนผู้เรียก createSale เท่าเดิม · ทุก hunk ใน src/**/*.ts(x) + scripts/pos-gates-all.sh มี HF-FU2 (ในบรรทัดที่เพิ่มหรือ ±3 บรรทัด · ไฟล์ใหม่มีอย่างน้อย 1)"),
  D("ST2", "S", "[§2 ledger · มติ 2 6] POS-OWNER-PENDING.md มีบรรทัดใหม่ (ไม่มีที่หมุด) ที่มี HF-FU2: K QR-4→P3 · P RPT-6→P4 · Q overflow/UI-6 ของ developers/kanban · developers/account · developers/member · S D1c→P3 · D11→P3 · และแถว W6 (CD-F7) · W7 (one-OPEN-shift) · W8 (commission_other_book) · คีย์ข้อความใหม่ใน pos.json: th = en · th ไทย · en ไม่มีไทย"),
  // ── DP มัดจำโทษแถว (A · DEP-1 ฝั่งจอ · บริสุทธิ์ deposit-blame.ts) ──
  D("DP1", "P", "[A มติ 5] depositBlame + depositId: NOT_OWNER/LOCKED/NOT_FOUND เปลี่ยนเฉพาะแถวที่ชื่อ (3 ชุด: สมาชิก · walk-in · ผสม) — NOT_FOUND/LOCKED ถอดแถวนั้น · NOT_OWNER มัดจำสมาชิก = ถอด + errors.depositNotOwner · walk-in = ถาม 4 หลักแถวนั้น (wrong | again ตาม sentStripped) · สถิต: PayError.depositId? · payErrorPinMeta ส่ง depositId · InterimPayDialog import ./deposit-blame + เรียก depositBlame + บล็อก POS HF-FU2 ▸ DEP-1"),
  D("DP2", "P", "[A มติ 5] แถวสร้างคืนหลัง reload (receiptNo null · needsLast4 · ไม่ใช่สมาชิก) + depositId ⇒ ถาม 4 หลักเฉพาะแถวนั้น (ไม่ใช่ทุกแถว) · notOwnerSet = ชุดเดิมก็ไม่ถอดทั้งหมด · LOCKED/NOT_FOUND ถอดแถวนั้นแถวเดียว"),
  D("DP3", "P", "[A มติ 5 · PAR หลังสร้าง] ไม่มี depositId ⇒ ผล = กติกาเดิมของ InterimPayDialog.tsx:759–805 @72669941 (golden ของข้อสอบ · 600 กรณีสุ่ม seed คงที่ · NOT_OWNER/LOCKED: drop · reask · reaskNote · note · notOwnerSet) · NOT_FOUND/CLOSED ไม่มี depositId ⇒ lookup:true (ผู้เรียกค้นด้วยเลขใบรับแบบเดิม) ไม่ถอด/ไม่ถาม · deposit-blame.ts บริสุทธิ์"),
  // ── PR บวกราคาทั้งช่องทาง (O · PRC-1) ──
  D("PR1", "X4", "[O มติ 4] my มี (ทุกช่องทาง, A) ไม่ขาย · bulkChannelMarkup (LINEMAN, ทุกสาขา, +10%) ⇒ written 1 skipped 0 · แถว (LINEMAN, ทุกสาขา) 11000 + (LINEMAN, A, notSold) · เทียบราคา A = CHANNEL_NOT_SOLD · B = 11000 · audit pos.product.channelPrice via bulk 1 แถว rows มีทั้งสองแถว"),
  D("PR2", "PAR", "[O มติ 4] ไม่เปลี่ยน: mx (LINEMAN, ทุกสาขา) ไม่ขาย + mz สินค้าของสาขา A ที่มี (ทุกช่องทาง, A) ไม่ขาย ⇒ written 0 skipped 2 · แถวเท่าเดิม · ไม่มี audit bulk · เล่น PR1 ซ้ำ ⇒ written 0 · แถว/ audit เท่าเดิม"),
  D("PR3", "X4", "[O มติ 4] [mw mv mu mt] ครั้งเดียว: mw มี (LINEMAN, A) 9000 อยู่แล้ว ⇒ ไม่ถูกทับเป็นไม่ขาย (A = 9000 · B = 11000) · mv ไม่มีแถว ⇒ 11000 · mu ไม่ขายที่ A และ B ⇒ พา notSold ลงทั้งสอง · mt (LINEMAN, ทุกสาขา) ไม่ขาย ⇒ ข้าม · written 3 skipped 1 · productIds ตรง · audit bulk ต่อสินค้า 1 (mt 0)"),
  // ── DS จอลูกค้า (R · D12b) ──
  D("DS1", "S", "[R มติ 8] use-display-publish.ts: อาร์กิวเมนต์ของ publishDisplayStateAction ไม่มีคีย์ deviceId (ยังส่ง deviceCode)"),
  D("DS2", "PAR", "[R มติ 8 · D1b] displayPublisherDevice: เครื่องที่ลงทะเบียนแต่ไม่มีกะ OPEN ของผู้นี้ = null · เครื่องของกะ OPEN = รหัสนั้น · สถิต: publishDisplayStateAction ยังรับ deviceId? · ใช้ displayPublisherDevice · ปฏิเสธ DEVICE_NOT_REGISTERED · ไม่อ่าน args.deviceId"),
  // ── PB ป้ายเทียบราคา (W · PRC-3 · มติ 6) ──
  D("PB1", "S", "[W มติ 6] BranchCompare.tsx: บล็อก POS HF-FU2 ▸ PRC-3 · อ่าน origin ของช่องเทียบราคา · แยก own/inherited (หรือคีย์ chipOwn/chipInherited) · data-testid ขึ้นต้น pos-prod-compare-origin"),
  // ── RG ตัวรันด่าน (U · มติ 7) — รากชั่วคราว + --verdict ──
  D("RG1", "PAR", "[U มติ 7] ตัวควบคุม: ชุดเต็ม ทุกแถว rc 0 · log บรรทัด 1 = HEAD.txt ⇒ VERDICT green exit 0 ทั้ง HEAD.txt มี only=- และ HEAD.txt แบบเดิม (ไม่มี only= ⇒ อ่านเป็น only=-)"),
  D("RG2", "G", "[U(a)] ชุดที่ accepted (checks ไม่ใช่ CRASH) exit 1 · JSON_SUMMARY total 10 passed 7 failed [id ที่ยอมรับ 1 ตัว] ⇒ RED ชื่อชุดนั้น exit ≠ 0 (รายการล้มสั้นกว่า total−passed) · ตัวควบคุม passed 9 ⇒ green"),
  D("RG3", "G", "[U(b)] ชุดที่ accepted.checks มี CRASH แต่ไม่มี accepted.match ⇒ RED ชื่อชุดนั้น exit ≠ 0"),
  D("RG4", "G", "[U(b)] accepted.match ไม่อยู่ใน <name>.log ⇒ RED exit ≠ 0 · อยู่ ⇒ ACCEPTED VERDICT green exit 0"),
  D("RG5", "G", "[U(c)] ชุดไม่ครบ (2 แถว): HEAD.txt only=- ⇒ RED · HEAD.txt แบบเดิม ⇒ RED · only=<n1>,<n2> ⇒ green · only=<n1>,<n2> แต่มี 1 แถว ⇒ RED"),
  D("RG6", "G", "[U(d)] log บรรทัด 1 ของหนึ่งรายการ ≠ HEAD.txt บรรทัด 1 ⇒ RED มีคำว่า log-head exit ≠ 0"),
  D("RG7", "PAR", "[fix2 H3] ชุด accepted exit 137 ⇒ RED exit ≠ 0"),
  D("RG8", "PAR", "[fix2 H3] ชุด accepted exit 1 · findings มี id ที่ไม่อยู่ใน checks (แดงซ่อน แบบ PL2.1) ⇒ RED exit ≠ 0"),
  // ORACLE-ADD ผู้คุม 17 ต.ค. (HF-FU2 fix1 N1–N4) ▸ RG9–RG13 = ของปลอมที่ hunter ทำให้ green ได้ที่ 1224fd12 ◂
  D("RG9", "G", "[fix1 N1] exit ใน SUMMARY ≠ บรรทัด EXIT ท้าย log ⇒ RED (แถว 0 แต่ log EXIT 1 · แถว accepted 1 แต่ log EXIT 137) · ตัวควบคุม EXIT ตรง ⇒ green"),
  D("RG10", "G", "[fix1 N1] แถว exit 0 แต่ JSON_SUMMARY ล้ม ⇒ RED (failed ไม่ว่าง · findings ไม่ว่าง · crashed:true · passed < total)"),
  D("RG11", "G", "[fix1 N2] HEAD.txt 2 บรรทัด (บรรทัด 2 ปลอม head/only) ⇒ RED · บรรทัดเดียวมี only= 2 ตัว ⇒ RED"),
  D("RG12", "G", "[fix1 N3] JSON_SUMMARY 2 บรรทัด (ปลอมต่อท้ายตัวจริงให้ accepted) ⇒ RED · JSON_SUMMARY ไม่ใช่บรรทัดก่อน EXIT ⇒ RED"),
  D("RG13", "G", "[fix1 N4] findings เติมจำนวน (failed 1 + findings 1 · total−passed 2) ⇒ RED · passed > total ⇒ RED · ตัวควบคุม: ชุดที่รายงานแค่ findings นับ findings ⇒ green"),
  // ORACLE-ADD ผู้คุม 17 ต.ค. (HF-FU2 fix2 N6–N7) ▸ RG14–RG15 = ช่องที่ hunter รอบสองพบที่ ffca3f00 ◂
  D("RG14", "G", "[fix2 N6] suite exit 0: ไม่มี JSON_SUMMARY ⇒ RED · passed เป็นสตริง ⇒ RED · total 0 ⇒ RED · skipped:true ⇒ RED · ชุด forced รายงาน forced:false ⇒ RED · ตัวควบคุม qc-restaurant ไม่มี JSON ⇒ green"),
  D("RG15", "G", "[fix2 N7] failed ไม่ใช่รายการ (failed:2 · accepted rc 1 และ exit 0) ⇒ RED · total 0 passed 0 failed [id ที่ยอมรับ] ⇒ RED"),
  // ── MF แมนิเฟสต์ (V) ──
  D("MF1", "S", "[V มติ 7] pos-gates.json: qc-pos-p2.14 ไม่มี accepted · ทุก accepted ที่ checks มี CRASH หรือ *-ERR มี match (สตริงไม่ว่าง · อยู่ใน log ของ gates111 ถ้ามี) · มีชุด qc-hf-fu2 (mode forced)"),
  // ── AC ค่าคอมฯ ข้ามสมุด (B · ACC-1 · มติ 1) ──
  D("AC1", "X1", "[B มติ 1] บิล LINEMAN (PLATFORM) COMMISSION ในสมุด 1 → ย้าย POS ไปผูกสมุด 2 → คืนบางส่วน (PLATFORM) → ระบาย + เล่น consumers[pos.sale.refunded] ซ้ำ ×2 ⇒ OpsEvent WARN pos.account.commission_other_book ของใบคืนนั้น 1 แถว (มี refundId + saleId) · ไม่มี COMMISSION/COMMISSION_REFUNDED ในสมุด 2 · ไม่มี COMMISSION_REFUNDED ในสมุด 1 · คิวคืน DONE"),
  D("AC2", "PAR", "[B มติ 1] ตัวควบคุมสมุดเดียวกัน: คืนบางส่วน ⇒ COMMISSION_REFUNDED ในสมุด 1 = 1 · ไม่มี WARN commission_other_book ของใบคืนนี้"),
  // ── Z คืนสภาพ ──
  D("Z1", "PAR", "QC4 คืนสภาพ: ร้านชั่วคราว 0 แถวทุกตารางที่มี tenantId (สินค้า/แถวราคา/audit/ใบคืน/OpsEvent) · แถว Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0 · โฟลเดอร์ RG ชั่วคราวถูกลบ"),
  D("Z2", "PAR", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosSale คีย์/id · PosProduct ชื่อ · AuditLog/OutboxEvent/OpsEvent ที่มีรหัสรอบหรือ id ของรอบ · Tenant slug) · ลายนิ้วมือร้านอื่น (PosProductChannelPrice · AccountSystemLink) ก่อน/หลังพิมพ์เป็นข้อมูล"),
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
  const full = id.startsWith("HF-FU2-") ? id : `HF-FU2-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 120)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
/** ห่อข้อสอบหนึ่งข้อ — throw = แดงพร้อมเหตุผล (ไม่ล้มทั้งชุด) */
async function step(id: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    chk(id, false, "ไม่ throw", `harness throw: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  }
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : typeof r === "string" ? "STRING" : "VALUE");
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
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    const o = e as { reason?: unknown; field?: unknown } | null;
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true, reason: o?.reason, field: o?.field };
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
const THAI = /[ก-๛]/;
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const PMAX = process.env.QC_ALL === "1" ? 99 : 8; // QC_ALL=1 = พิมพ์ทุกเหตุผล
const P8 = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

// ═════════════════════════ ซอร์ส (สถิต) ═════════════════════════
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
// ตัดคอมเมนต์บรรทัดก่อนคอมเมนต์ก้อน — คอมเมนต์บรรทัดที่มี "/*" (เช่น path `/api/m/*`) จะไม่เปิดก้อนยาวกลืนโค้ด
const stripComments = (s: string) => s.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const srcOf = (f: string) => stripComments(rd(f));
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
/** เนื้อฟังก์ชัน (export หรือไม่ก็ได้) ถึงฟังก์ชันระดับบนตัวถัดไป */
function fnBody(src: string, name: string): string {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`).exec(src);
  if (!m) return "";
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+|\nexport\s/);
  return next < 0 ? rest : rest.slice(0, next);
}
/** วงเล็บคู่แรกหลังตำแหน่ง at (รวมวงเล็บ) */
function balancedFrom(src: string, at: number): string {
  const start = src.indexOf("(", at);
  if (start < 0) return "";
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === "(") depth++;
    else if (src[j] === ")" && --depth === 0) return src.slice(start, j + 1);
  }
  return "";
}

// ── git (หมุดของเลน = ฐานของใบนี้ 72669941 · ต้นไม้ผลิตภัณฑ์ = c5fc223b + CD-FU2a) ──
const LANE_PIN = "e9b765b4"; // ORACLE-EDIT ผู้คุม 23.10 (P5.1 batch B merge CD-RP22 · re-pin c4584062 → e9b765b4) · ORACLE-EDIT ผู้คุม 23.10 (P5.2 fix A+B+C+F merge CD-RP21 · re-pin bf7c0c4c → c4584062) · ORACLE-EDIT ผู้คุม 23.10 (P5.1 A+C+D merge re-pin CD-RP20a · re-pin 6668b832 → bf7c0c4c) · ORACLE-EDIT ผู้คุม 23.10 (P3 close freeze CD-RP19 · re-pin 8704b886 → 6668b832) · ORACLE-EDIT ผู้คุม 22.10 (P4.1 merge re-pin CD-RP18f · re-pin 15ee7536 → 8704b886) · ORACLE-EDIT ผู้คุม 22.10 (P3.12 merge re-pin CD-RP18a · re-pin 50019b25 → 15ee7536) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP17 P3-SKEL U merge · re-pin 8b6b66e4 → 50019b25) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP15 P3.6U merge · re-pin e774edeb → 8b6b66e4) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP14 P5.2 merge · re-pin 5eabd360 → e774edeb) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP13 P3.8U merge · re-pin 2d0acc1b → 5eabd360) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP12 P3.7U merge · re-pin 85c366dd → 2d0acc1b) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP11 P3.9U merge · re-pin 9cfa81bb → 85c366dd) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP10 P3-SKEL merge · re-pin bafdf89f → 9cfa81bb) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 P3.6 merge · re-pin b2458030 → bafdf89f) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP8 P3.4U merge · re-pin da75347a → b2458030) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP6c · product tip after testid rename · re-pin 2e912cfe → da75347a) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP6 · product tip after P3.5U merge · re-pin 02b67f91 → 2e912cfe) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP5 · product tip after P3.7 merge · re-pin a2c9a4c7 → 02b67f91) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP4 · product tip after P3.8 merge · re-pin 767f79c8 → a2c9a4c7) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP3 qc-hf-fu2 ST1 · product tip after P1.6-R2 fix · re-pin 683a7cc8 → 767f79c8) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP2c · product tip after P3.9 · re-pin 0617d17b → 683a7cc8) · ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-hf-fu2 ST1 · lane-pin 72669941 → 0617d17b = merge P3.4 S หลัง P3.5 S) · ST2 (บรรทัด OP/คีย์ข้อความ "ใหม่") ยังเทียบฐานของใบ CARD_BASE
const CARD_BASE = "72669941"; // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-hf-fu2 ST2): ฐานของใบ HF-FU2 — "ใหม่" = ไม่มีที่ฐานนี้ (หมุดเลนย้ายแล้ว ⇒ แยกฐานของ ST2 ไว้คงที่)
function gitRun(args: string[], cwd = ROOT): { ok: boolean; status: number; out: string } {
  try {
    const out = execFileSync("git", ["-C", cwd, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }).toString("utf8");
    return { ok: true, status: 0, out };
  } catch (e) {
    const st = (e as { status?: number }).status;
    return { ok: false, status: typeof st === "number" ? st : -1, out: "" };
  }
}
let pinRev: string | null | undefined;
function pin(): string | null {
  if (pinRev !== undefined) return pinRev;
  const r = gitRun(["rev-parse", "--verify", "-q", `${LANE_PIN}^{commit}`]);
  pinRev = r.ok ? r.out.trim() || null : null;
  return pinRev;
}
let cardRev: string | null | undefined; // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-hf-fu2 ST2)
function cardBase(): string | null {
  if (cardRev !== undefined) return cardRev;
  const r = gitRun(["rev-parse", "--verify", "-q", `${CARD_BASE}^{commit}`]);
  cardRev = r.ok ? r.out.trim() || null : null;
  return cardRev;
}
/** path ใน working tree ตรงกับ rev ไหม (รวมไฟล์ใหม่ที่ยังไม่ track) · null = git ใช้ไม่ได้ */
function sameAsRev(rev: string, path: string): boolean | null {
  const spec = `:(literal)${path}`;
  const d = gitRun(["diff", "--quiet", rev, "--", spec]);
  if (!d.ok && d.status !== 1) return null;
  if (!d.ok) return false;
  const u = gitRun(["ls-files", "--others", "--exclude-standard", "--", spec]);
  if (!u.ok) return null;
  return u.out.trim() === "";
}
const showAt = (rev: string, path: string): string | null => {
  const r = gitRun(["show", `${rev}:${path}`]);
  return r.ok ? r.out : null;
};

// ═════════════════════════ ค่าคงที่ของสัญญา ═════════════════════════
const POS_DIR = "src/lib/modules/pos";
const F = {
  payDialog: "src/components/pos/register/InterimPayDialog.tsx",
  blame: "src/components/pos/register/deposit-blame.ts",
  regScreen: "src/components/pos/register/RegisterScreen.tsx",
  tableCheckout: "src/components/pos/tables/TableCheckout.tsx",
  orderPay: "src/components/pos/orders/OrderPay.tsx",
  catalog: `${POS_DIR}/catalog.ts`,
  displayHook: "src/components/pos/display/use-display-publish.ts",
  displayActions: `${POS_DIR}/display-actions.ts`,
  display: `${POS_DIR}/display.ts`,
  branchCompare: "src/app/app/sys/[id]/pos/products/BranchCompare.tsx",
  refundConsumer: `${POS_DIR}/refund-consumer.ts`,
  accIndex: "src/lib/modules/account/index.ts",
  runner: "scripts/pos-gates-all.sh",
  manifest: "scripts/pos-gates.json",
  contract: "scripts/pos-sale-contract.json",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  ownerPending: "ledger/POS-OWNER-PENDING.md",
};
/** หลักฐานของ match (มติ 7: ข้อความจาก log ของ gates111) */
const GATES111 = "/root/pos-runs/gates111-c-20261016T175326Z";
/** §4 ST1 · §6: ไม่มี hunk */
const PINNED_FIXED = ["src/lib/outbox-consumers.ts", "src/lib/core/outbox.ts", "src/proxy.ts", F.contract, F.regScreen, F.tableCheckout, F.orderPay];
const PINNED_POS_RE = /^src\/lib\/modules\/pos\/(register[^/]*\.tsx?|service\.ts|tender[^/]*\.ts|payment-intent\.ts|held-cart\.ts|deposit\.ts)$/;
/** ไฟล์ที่ทุก hunk ต้องมี HF-FU2 */
const MARK_SCOPE = (f: string) => (/^src\/.*\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f)) || f === F.runner;
const MARK = "HF-FU2";
const AUDIT_CP = "pos.product.channelPrice";
const OPS_KEY = "pos.account.commission_other_book";
const EV_REFUNDED = "pos.sale.refunded";
const NOTE = {
  NOT_FOUND: "errors.depositNotFound",
  CLOSED: "errors.depositClosed",
  NOT_OWNER: "errors.depositNotOwner",
  LOCKED: "errors.depositLocked",
  AGAIN: "errors.depositNotOwnerAgain",
} as const;

const leaves = (o: unknown, pre = ""): [string, string][] => (typeof o === "string" ? [[pre, o]] : isRecord(o) ? Object.entries(o).flatMap(([k, v]) => leaves(v, pre ? `${pre}.${k}` : k)) : []);
const parseJson = (s: string | null): Any => {
  try {
    return JSON.parse(s || "null");
  } catch {
    return null;
  }
};

/** ไฟล์บริสุทธิ์ (โหลดได้ใน --no-db): ไม่ import ค่า prisma/db/โมดูลฝั่งเซิร์ฟเวอร์/next/react/actions และไม่มีนาฬิกา/สุ่ม */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  if ([...valueImports, ...dyn].some((p) => /@prisma\/client|\/db$|@\/lib\/core\/|@\/lib\/modules\/(?!pos\/[\w-]*-shared$)|^node:|^next|^react|server-only|-actions$|^\.(?!.*-shared$)/.test(p))) return false;
  return !/\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bMath\.random\s*\(/.test(s);
};

const skipReasons: string[] = [];
for (const [f, names] of [
  [F.blame, ["depositBlame"]],
] as [string, string[]][])
  for (const n of names) if (!exportsFn(srcOf(f), n)) skipReasons.push(`ยังไม่มี export ${n} (${f.split("/").slice(-2).join("/")})`);
if (!/commission_other_book/.test(srcOf(F.refundConsumer))) skipReasons.push("refund-consumer.ts ยังไม่เตือน pos.account.commission_other_book (ACC-1)");
if (!/other-book/.test(fnBody(srcOf(F.accIndex), "applyExternalChannelCommission"))) skipReasons.push("applyExternalChannelCommission ยังไม่คืน reason other-book ฝั่ง reverse (ACC-1)");

// ═════════════════════════ ตัวอ้างอิงของข้อสอบ — กติกาเดิมของ InterimPayDialog.tsx:759–805 @72669941 (DP3 golden) · เขียนเอง ไม่ import ═════════════════════════
type BRow = { id: number; depositId: string; receiptNo: string | null; needsLast4: boolean; memberLinked: boolean; l4Checked: boolean };
type BIn = { code: string; depositId?: string | null; rows: BRow[]; sentStripped: boolean; notOwnerSet: string | null };
type BOut = { drop: number[]; reask: number[]; reaskNote: "wrong" | "again" | null; note: string | null; notOwnerSet: string | null; lookup: boolean };
/** ชุดแถว (row id) = เรียงจากน้อยไปมาก คั่นด้วย "," — เหมือน sig() ของกล่องเดิม */
const sigOf = (ids: number[]) => [...ids].sort((a, b) => a - b).join(",");
function goldenBlame(i: BIn): BOut {
  const base: BOut = { drop: [], reask: [], reaskNote: null, note: null, notOwnerSet: i.notOwnerSet, lookup: false };
  if (i.code === "DEPOSIT_NOT_FOUND" || i.code === "DEPOSIT_CLOSED") return { ...base, lookup: true, note: i.code === "DEPOSIT_NOT_FOUND" ? NOTE.NOT_FOUND : NOTE.CLOSED };
  if (i.code === "DEPOSIT_LOCKED") return { ...base, drop: i.rows.filter((r) => r.needsLast4).map((r) => r.id), note: NOTE.LOCKED };
  if (i.code !== "DEPOSIT_NOT_OWNER") return base;
  const all = i.rows;
  const l4Rows = all.filter((r) => r.needsLast4);
  const suspects = i.sentStripped ? l4Rows : l4Rows.filter((r) => !r.l4Checked);
  const own = all.filter((r) => r.memberLinked);
  const dropRows = (ids: number[], key: string): BOut => ({ ...base, drop: ids, note: key, notOwnerSet: null });
  const blameL4 = (list: BRow[], note: "wrong" | "again"): BOut => ({ ...base, reask: list.map((r) => r.id), reaskNote: note, note: null, notOwnerSet: sigOf(all.map((r) => r.id)) });
  const sigAll = sigOf(all.map((r) => r.id));
  if (all.length && i.notOwnerSet === sigAll && own.length) {
    const ids = own.map((r) => r.id);
    const left = all.filter((r) => !ids.includes(r.id));
    return { ...dropRows(ids, NOTE.NOT_OWNER), notOwnerSet: left.length ? sigOf(left.map((r) => r.id)) : null };
  }
  if (all.length && i.notOwnerSet === sigAll) return dropRows(all.map((r) => r.id), NOTE.AGAIN);
  if (suspects.length) return blameL4(suspects, i.sentStripped ? "again" : "wrong");
  if (own.length) return dropRows(own.map((r) => r.id), NOTE.NOT_OWNER);
  if (l4Rows.length) return blameL4(l4Rows, "wrong");
  return dropRows(all.map((r) => r.id), NOTE.NOT_OWNER);
}
/** ผลของผู้สร้าง → รูปปกติ (drop = เซตเรียง · reask = ลำดับเดิม) */
function normBlame(o: Any): BOut | string {
  if (!isRecord(o)) return `ผลไม่ใช่วัตถุ (${short(o, 60)})`;
  const nums = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === "number") ? (v as number[]) : null);
  const drop = nums(o.drop);
  const reask = nums(o.reask);
  if (!drop || !reask) return `drop/reask ไม่ใช่ number[] (${short(o, 80)})`;
  return {
    drop: [...drop].sort((a, b) => a - b),
    reask: [...reask],
    reaskNote: o.reaskNote === "wrong" || o.reaskNote === "again" ? o.reaskNote : null,
    note: typeof o.note === "string" ? o.note : null,
    notOwnerSet: typeof o.notOwnerSet === "string" ? o.notOwnerSet : null,
    lookup: o.lookup === true,
  };
}
/** seed คงที่ (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const RK = {
  member: (id: number, d = `dm${id}`): BRow => ({ id, depositId: d, receiptNo: `DEP-${id}`, needsLast4: false, memberLinked: true, l4Checked: false }),
  walkOk: (id: number, d = `dw${id}`): BRow => ({ id, depositId: d, receiptNo: `DEP-${id}`, needsLast4: true, memberLinked: false, l4Checked: true }),
  walkNew: (id: number, d = `dn${id}`): BRow => ({ id, depositId: d, receiptNo: `DEP-${id}`, needsLast4: true, memberLinked: false, l4Checked: false }),
  plain: (id: number, d = `dp${id}`): BRow => ({ id, depositId: d, receiptNo: `DEP-${id}`, needsLast4: false, memberLinked: false, l4Checked: false }),
  reloaded: (id: number, d = `dr${id}`): BRow => ({ id, depositId: d, receiptNo: null, needsLast4: true, memberLinked: false, l4Checked: false }),
};

// ═════════════════════════ ตัวรันด่าน (RG) — รากชั่วคราว + --verdict ═════════════════════════
const RG_BASE = { dir: "" };
const envNoCi = (): NodeJS.ProcessEnv => {
  const e: NodeJS.ProcessEnv = { ...process.env };
  delete e.CI;
  delete e.VERCEL;
  return e;
};
type RgRoot = { root: string; head: string };
/** รากชั่วคราว = git repo 1 commit: scripts/pos-gates-all.sh (สำเนาไบต์ของทรี) + scripts/pos-gates.json (แมนิเฟสต์ที่ข้อสอบกำหนด) */
function mkRoot(label: string, man: Any): RgRoot {
  if (!RG_BASE.dir) RG_BASE.dir = mkdtempSync(join(tmpdir(), "hffu2-rg-"));
  const root = join(RG_BASE.dir, `root-${label}`);
  mkdirSync(join(root, "scripts"), { recursive: true });
  copyFileSync(join(ROOT, F.runner), join(root, F.runner));
  writeFileSync(join(root, F.manifest), `${JSON.stringify(man, null, 2)}\n`);
  const g = (args: string[]) => execFileSync("git", ["-C", root, "-c", "user.name=qc", "-c", "user.email=qc@qc.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
  g(["init", "-q"]);
  g(["add", "-A"]);
  g(["commit", "-q", "-m", `qc-hf-fu2 ${label}`]);
  return { root, head: g(["rev-parse", "--short=8", "HEAD"]).trim() };
}
type RgRow = { name: string; rc: number; body?: string; line1?: string };
let outN = 0;
/** โฟลเดอร์ผลชั่วคราว: HEAD.txt (only: undefined = แบบเดิมไม่มี only=) · SUMMARY.txt · <name>.log (บรรทัด 1 = HEAD · ท้าย EXIT) */
function mkOut(r: RgRoot, rows: RgRow[], only: string | undefined): string {
  const dir = join(RG_BASE.dir, `out-${++outN}`);
  mkdirSync(dir, { recursive: true });
  const headline = `tree=${r.root} head=${r.head} dirty=0 2026-10-16T00:00:00Z${only === undefined ? "" : ` only=${only}`}`;
  writeFileSync(join(dir, "HEAD.txt"), `${headline}\n`);
  writeFileSync(join(dir, "SUMMARY.txt"), rows.map((x) => `${x.name} ${x.rc}`).join("\n") + "\n");
  for (const x of rows) {
    const body = x.body ?? `JSON_SUMMARY ${JSON.stringify({ total: 1, passed: x.rc === 0 ? 1 : 0, failed: x.rc === 0 ? [] : ["X"] })}`;
    writeFileSync(join(dir, `${x.name}.log`), `${x.line1 ?? headline}\n${body}\nEXIT ${x.rc}\n`);
  }
  return dir;
}
function verdictOf(r: RgRoot, dir: string): { rc: number; out: string; green: boolean } {
  const s = spawnSync("bash", [join(r.root, F.runner), "--verdict", dir], { encoding: "utf8", timeout: 60_000, env: envNoCi() });
  const out = `${s.stdout ?? ""}${s.stderr ?? ""}`;
  const rc = typeof s.status === "number" ? s.status : -1;
  return { rc, out, green: rc === 0 && /^VERDICT green/m.test(out) };
}
const vline = (v: { rc: number; out: string }) => `rc ${v.rc} · ${short(v.out.split("\n").filter((l) => /^(RED|VERDICT|SET)/.test(l)).join(" | ") || v.out.trim().split("\n").slice(-2).join(" | "), 160)}`;
const manNames = (m: Any): string[] => [...(Array.isArray(m?.suites) ? m.suites.map((s: Any) => String(s?.suite ?? "")) : []), ...(Array.isArray(m?.commands) ? m.commands.map((c: Any) => String(c?.name ?? "")) : [])];
const isCrashId = (x: unknown) => x === "CRASH" || /-ERR$/.test(String(x));
const allEntries = (m: Any): Any[] => [...(Array.isArray(m?.suites) ? m.suites : []), ...(Array.isArray(m?.commands) ? m.commands : [])];
const entryName = (e: Any) => String(e?.suite ?? e?.name ?? "");

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log(`\n── ST ข้อสถิต (ไม่แตะ DB · หมุด ${LANE_PIN}) ──`);
  await step("ST1", () => {
    const p: string[] = [];
    const mb = pin();
    if (!mb) {
      chk("ST1", false, `หาหมุด ${LANE_PIN} ได้`, "หาหมุดไม่ได้ (git fetch origin session/pos)");
      return;
    }
    // prisma/ + ไฟล์ใหม่ใต้ prisma/
    const pr = sameAsRev(mb, "prisma");
    if (pr === null) p.push("git ใช้ไม่ได้ (prisma)");
    else if (!pr) p.push("prisma/ ต่างจากหมุด (ไม่มี migration · §6)");
    // ไฟล์ที่ต้องไม่มี hunk
    const baseFiles = (gitRun(["ls-tree", "-r", "--name-only", mb, "--", POS_DIR]).out ?? "").split("\n").filter(Boolean);
    const nowFiles = walk(POS_DIR, [], /\.(tsx?|ts)$/);
    const pinned = [...new Set([...PINNED_FIXED, ...baseFiles.filter((f) => PINNED_POS_RE.test(f)), ...nowFiles.filter((f) => PINNED_POS_RE.test(f))])];
    for (const f of pinned) {
      const s = sameAsRev(mb, f);
      if (s === null) p.push(`git ใช้ไม่ได้ (${f})`);
      else if (!s) p.push(`${f.replace(`${POS_DIR}/`, "pos/")} มี hunk (§4 ST1 ห้ามแตะ)`);
    }
    const ch = rd(F.contract);
    const chAt = showAt(mb, F.contract);
    if (chAt !== null && sha256(ch) !== sha256(chAt)) p.push("pos-sale-contract.json sha ต่างจากหมุด");
    // ทะเบียนผู้เรียก createSale — เทียบเฉพาะไฟล์ที่เปลี่ยนจากหมุด
    const changed = gitRun(["diff", "--name-status", "--no-renames", mb, "--", "src", "scripts"]).out.split("\n").filter(Boolean).map((l) => l.split("\t") as [string, string]);
    const untracked = gitRun(["ls-files", "--others", "--exclude-standard", "--", "src", "scripts"]).out.split("\n").filter(Boolean).map((f) => ["A", f] as [string, string]);
    const all = [...changed, ...untracked];
    const csCount = (s: string | null) => (stripComments(s ?? "").match(/\bcreateSale\s*\(/g) ?? []).length;
    for (const [, f] of all) {
      if (!/^src\/.*\.(ts|tsx)$/.test(f) || f.endsWith(`${POS_DIR}/service.ts`) || f.endsWith("src/lib/contracts.ts")) continue;
      const a = csCount(showAt(mb, f));
      const b = csCount(existsSync(join(ROOT, f)) ? rd(f) : "");
      if (a !== b) p.push(`ผู้เรียก createSale ${f.replace("src/lib/", "")}: ${a}→${b}`);
    }
    // ทุก hunk มี HF-FU2
    let hunks = 0;
    for (const [st, f] of all) {
      if (!MARK_SCOPE(f) || st.startsWith("D")) continue;
      const now = rd(f);
      if (st.startsWith("A")) {
        hunks++;
        if (!now.includes(MARK)) p.push(`${f.split("/").pop()} (ไฟล์ใหม่) ไม่มี ${MARK}`);
        continue;
      }
      const lines = now.split("\n");
      const diff = gitRun(["diff", "--no-color", "-U0", mb, "--", `:(literal)${f}`]).out.split("\n");
      for (let i = 0; i < diff.length; i++) {
        const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(diff[i]!);
        if (!m) continue;
        hunks++;
        const start = Number(m[1]);
        const cnt = m[2] === undefined ? 1 : Number(m[2]);
        const from = Math.max(0, start - 1 - 3);
        const to = Math.min(lines.length, (cnt === 0 ? start : start - 1 + cnt) + 3);
        if (!lines.slice(from, to).join("\n").includes(MARK)) p.push(`${f.split("/").pop()}:${start} hunk ไม่มี ${MARK}`);
      }
    }
    chk("ST1", p.length === 0, "ไม่มี migration · ไฟล์ห้ามแตะเท่าหมุด · createSale เท่าเดิม · ทุก hunk มี HF-FU2", P8(p) || `ครบ (${pinned.length} ไฟล์ห้ามแตะ · ${all.length} ไฟล์เปลี่ยน · ${hunks} hunk · หมุด ${mb.slice(0, 8)})`);
  });
  await step("ST2", () => {
    const p: string[] = [];
    const mb = cardBase(); // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-hf-fu2 ST2): เดิม pin() — ฐานของใบ 72669941 คงที่
    const cur = rd(F.ownerPending).split("\n");
    const baseSet = new Set((mb ? (showAt(mb, F.ownerPending) ?? "") : "").split("\n"));
    const fresh = cur.filter((l) => !baseSet.has(l) && l.includes(MARK));
    const need: [string, (l: string) => boolean][] = [
      ["K QR-4 → P3", (l) => /QR-4/.test(l) && /\bP3\b/.test(l)],
      ["P RPT-6 → P4", (l) => /RPT-6/.test(l) && /\bP4\b/.test(l)],
      ["Q developers/kanban", (l) => /(UI-6|overflow)/.test(l) && /developers\/kanban/.test(l)],
      ["Q developers/account", (l) => /(UI-6|overflow)/.test(l) && /developers\/account/.test(l)],
      ["Q developers/member", (l) => /(UI-6|overflow)/.test(l) && /developers\/member/.test(l)],
      ["S D1c → P3", (l) => /D1c/.test(l) && /\bP3\b/.test(l)],
      ["D11 → P3", (l) => /\bD11\b/.test(l) && /\bP3\b/.test(l)],
    ];
    for (const [lbl, f] of need) if (!fresh.some(f)) p.push(`OP ไม่มีบรรทัดใหม่ (${MARK}) ${lbl}`);
    const rows: [string, RegExp][] = [["W6", /CD-F7/], ["W7", /one-OPEN-shift/], ["W8", /commission_other_book/]];
    for (const [w, re] of rows) if (!cur.some((l) => new RegExp(`^\\|\\s*${w}\\s*\\|`).test(l) && re.test(l))) p.push(`OP ไม่มีแถว ${w} (${re.source})`);
    // คีย์ข้อความใหม่
    let added = 0;
    for (const f of [F.msgTh, F.msgEn]) if (!parseJson(rd(f))) p.push(`อ่าน ${f} ไม่ได้`);
    const lv = (s: string | null) => new Map(leaves(parseJson(s)));
    const thNow = lv(rd(F.msgTh));
    const enNow = lv(rd(F.msgEn));
    const thAt = lv(mb ? showAt(mb, F.msgTh) : null);
    const enAt = lv(mb ? showAt(mb, F.msgEn) : null);
    const newTh = [...thNow.keys()].filter((k) => !thAt.has(k));
    const newEn = [...enNow.keys()].filter((k) => !enAt.has(k));
    added = new Set([...newTh, ...newEn]).size;
    for (const k of newTh) if (!enNow.has(k)) p.push(`en ไม่มีคีย์ใหม่ ${k}`);
    for (const k of newEn) if (!thNow.has(k)) p.push(`th ไม่มีคีย์ใหม่ ${k}`);
    for (const k of new Set([...newTh, ...newEn])) {
      const a = thNow.get(k);
      const b = enNow.get(k);
      if (typeof a === "string" && !THAI.test(a)) p.push(`th: ${k} ไม่ใช่ภาษาไทย`);
      if (typeof b === "string" && THAI.test(b)) p.push(`en: ${k} มีอักษรไทย`);
    }
    chk("ST2", p.length === 0, "บรรทัด OP ใหม่ K P Q×3 S D11 · แถว W6 W7 W8 · คีย์ใหม่ th = en", P8(p) || `ครบ (${fresh.length} บรรทัด OP ใหม่ · คีย์ใหม่ ${added})`);
  });
}

// ═════════════════════════ 1b. DP มัดจำโทษแถว (บริสุทธิ์) ═════════════════════════
async function runPure(blameMod: Any): Promise<void> {
  console.log("\n── DP มัดจำโทษแถว (บริสุทธิ์) ──");
  const fn = blameMod?.depositBlame;
  const why0 = !existsSync(join(ROOT, F.blame)) ? `${MISSING} ${F.blame}` : !purePath(F.blame) ? "deposit-blame.ts ไม่บริสุทธิ์ (import ฝั่งเซิร์ฟเวอร์/next/react/actions หรือมีนาฬิกา/สุ่ม)" : typeof fn !== "function" ? `${MISSING} depositBlame` : "";
  const run = (i: BIn): BOut | string => {
    try {
      return normBlame(fn({ ...i, rows: i.rows.map((r) => ({ ...r })) }));
    } catch (e) {
      return `throw ${String((e as Error)?.message ?? e).slice(0, 80)}`;
    }
  };
  /** แถวที่ชื่อเปลี่ยนเท่านั้น (ถอด/ถาม) + note */
  const named = (lbl: string, rows: BRow[], code: string, row: BRow, sentStripped: boolean, notOwnerSet: string | null, p: string[]) => {
    const o = run({ code, depositId: row.depositId, rows, sentStripped, notOwnerSet });
    if (typeof o === "string") return void p.push(`${lbl}: ${o}`);
    if (o.lookup) p.push(`${lbl}: lookup:true (มี depositId แล้ว ไม่ต้องค้น)`);
    const touched = [...new Set([...o.drop, ...o.reask])];
    if (touched.some((id) => id !== row.id)) p.push(`${lbl}: แตะแถวอื่น drop[${o.drop}] reask[${o.reask}] (คาด เฉพาะแถว ${row.id})`);
    if (code === "DEPOSIT_NOT_OWNER" && !row.memberLinked) {
      const want = sentStripped ? "again" : "wrong";
      if (o.reask.join() !== String(row.id) || o.drop.length || o.reaskNote !== want) p.push(`${lbl}: NOT_OWNER walk-in → drop[${o.drop}] reask[${o.reask}] ${o.reaskNote} (คาด ถามแถว ${row.id} · ${want})`);
    } else {
      const key = code === "DEPOSIT_NOT_OWNER" ? NOTE.NOT_OWNER : code === "DEPOSIT_LOCKED" ? NOTE.LOCKED : NOTE.NOT_FOUND;
      if (o.drop.join() !== String(row.id) || o.reask.length || o.note !== key) p.push(`${lbl}: ${code.replace("DEPOSIT_", "")} → drop[${o.drop}] reask[${o.reask}] note ${o.note} (คาด ถอดแถว ${row.id} · ${key})`);
    }
  };
  await step("DP1", () => {
    const p: string[] = [];
    // สถิต: ตัวส่งต่อ meta + การเรียก
    const dlg = srcOf(F.payDialog);
    const payErr = /export\s+type\s+PayError\s*=\s*\{[^;]*\bdepositId\?\s*:/.exec(dlg);
    if (!payErr) p.push("PayError ไม่มี depositId?");
    if (!/depositId/.test(fnBody(dlg, "payErrorPinMeta"))) p.push("payErrorPinMeta ไม่ส่ง depositId");
    if (!/from\s+["'](\.\/deposit-blame|@\/components\/pos\/register\/deposit-blame)["']/.test(dlg) || !/\bdepositBlame\s*\(/.test(dlg)) p.push("InterimPayDialog ไม่ import ./deposit-blame หรือไม่เรียก depositBlame");
    if (!/POS HF-FU2\s*▸\s*DEP-1/.test(rd(F.payDialog))) p.push("InterimPayDialog ไม่มีบล็อก POS HF-FU2 ▸ DEP-1");
    if (why0) p.push(why0);
    else {
      const m1 = RK.member(1);
      const m2 = RK.member(2);
      const w1 = RK.walkOk(3);
      const w2 = RK.walkOk(4);
      const n1 = RK.walkNew(5);
      const sets: [string, BRow[]][] = [["สมาชิก", [m1, m2]], ["walk-in", [w1, w2]], ["ผสม", [m1, n1, w2]]];
      let n = 0;
      for (const [lbl, rows] of sets)
        for (const row of rows)
          for (const code of ["DEPOSIT_NOT_OWNER", "DEPOSIT_LOCKED", "DEPOSIT_NOT_FOUND"])
            for (const ss of [false, true]) {
              n++;
              named(`${lbl}/${code.replace("DEPOSIT_", "")}/แถว${row.id}${ss ? "/stripped" : ""}`, rows, code, row, ss, null, p);
            }
      if (!p.length) console.log(`  (DP1 ข้อมูล) ${n} กรณี`);
    }
    chk("DP1", p.length === 0, "มี depositId ⇒ เปลี่ยนเฉพาะแถวนั้น (3 ชุด) · meta ส่ง depositId · กล่องเรียก depositBlame", P8(p) || "ครบ");
  });
  await step("DP2", () => {
    const p: string[] = [];
    if (why0) p.push(why0);
    else {
      const rows = [RK.reloaded(11), RK.reloaded(12), RK.reloaded(13)];
      const all = sigOf(rows.map((r) => r.id));
      named("reload/NOT_OWNER/แถว12", rows, "DEPOSIT_NOT_OWNER", rows[1]!, false, null, p);
      named("reload/NOT_OWNER/แถว12/stripped", rows, "DEPOSIT_NOT_OWNER", rows[1]!, true, null, p);
      named("reload/NOT_OWNER/แถว12/ชุดเดิมซ้ำ", rows, "DEPOSIT_NOT_OWNER", rows[1]!, false, all, p);
      named("reload/LOCKED/แถว13", rows, "DEPOSIT_LOCKED", rows[2]!, false, null, p);
      named("reload/NOT_FOUND/แถว11", rows, "DEPOSIT_NOT_FOUND", rows[0]!, false, null, p);
      // ตัวควบคุม: กติกาเดิม (ไม่มี depositId) ถามทุกแถว
      const g = goldenBlame({ code: "DEPOSIT_NOT_OWNER", rows, sentStripped: false, notOwnerSet: null });
      if (g.reask.length !== 3) p.push(`(ข้อสอบ) golden ไม่ถามทุกแถว ${short(g, 60)}`);
    }
    chk("DP2", p.length === 0, "หลัง reload + depositId ⇒ ถาม/ถอดเฉพาะแถวนั้น", P8(p) || "ครบ");
  });
  await step("DP3", () => {
    const p: string[] = [];
    if (why0) p.push(why0);
    else {
      const R = rng(0x48ff2);
      const pick = <T,>(xs: T[]): T => xs[Math.floor(R() * xs.length)]!;
      let n = 0;
      let bad = 0;
      for (let k = 0; k < 600; k++) {
        const len = Math.floor(R() * 5);
        const rows: BRow[] = [];
        for (let j = 0; j < len; j++) rows.push(pick([RK.member, RK.walkOk, RK.walkNew, RK.plain, RK.reloaded])(100 + k * 10 + j));
        const ids = rows.map((r) => r.id);
        const sub = ids.filter(() => R() < 0.5);
        const nos = pick<string | null>([null, null, sigOf(ids), sigOf(ids), sigOf(sub), "999"]);
        const code = pick(["DEPOSIT_NOT_OWNER", "DEPOSIT_NOT_OWNER", "DEPOSIT_NOT_OWNER", "DEPOSIT_LOCKED"]);
        const dep = pick<string | null | undefined>([undefined, undefined, null, ""]);
        const i: BIn = { code, ...(dep === undefined ? {} : { depositId: dep }), rows, sentStripped: R() < 0.4, notOwnerSet: nos };
        const g = goldenBlame(i);
        const o = run(i);
        n++;
        const diff =
          typeof o === "string"
            ? o
            : [
                o.drop.join() !== [...g.drop].sort((a, b) => a - b).join() ? `drop[${o.drop}]≠[${g.drop}]` : "",
                o.reask.join() !== g.reask.join() ? `reask[${o.reask}]≠[${g.reask}]` : "",
                o.reaskNote !== g.reaskNote ? `reaskNote ${o.reaskNote}≠${g.reaskNote}` : "",
                o.note !== g.note ? `note ${o.note}≠${g.note}` : "",
                o.notOwnerSet !== g.notOwnerSet ? `notOwnerSet ${o.notOwnerSet}≠${g.notOwnerSet}` : "",
                o.lookup ? "lookup:true" : "",
              ].filter(Boolean).join(" ");
        if (diff) {
          bad++;
          if (bad <= 4) p.push(`#${k} ${code.replace("DEPOSIT_", "")} rows=${rows.map((r) => `${r.id}${r.memberLinked ? "m" : ""}${r.needsLast4 ? "4" : ""}${r.l4Checked ? "c" : ""}`).join(",")} ss=${i.sentStripped} set=${nos}: ${diff}`);
        }
      }
      if (bad) p.push(`ต่าง ${bad}/${n} กรณี`);
      for (const code of ["DEPOSIT_NOT_FOUND", "DEPOSIT_CLOSED"]) {
        const rows = [RK.member(1), RK.walkOk(2)];
        const o = run({ code, rows, sentStripped: false, notOwnerSet: null });
        if (typeof o === "string") p.push(`${code}: ${o}`);
        else if (!o.lookup || o.drop.length || o.reask.length) p.push(`${code} ไม่มี depositId → lookup ${o.lookup} drop[${o.drop}] reask[${o.reask}] (คาด lookup:true ไม่ถอด/ไม่ถาม)`);
      }
      if (!p.length) console.log(`  (DP3 ข้อมูล) ${n} กรณีตรง golden`);
    }
    chk("DP3", p.length === 0, "ไม่มี depositId ⇒ = กติกาเดิม (golden 600 กรณี) · NOT_FOUND/CLOSED = lookup", P8(p) || "ครบ");
  });
}

// ═════════════════════════ 1c. DS1 · PB1 · RG · MF (ไม่แตะ DB) ═════════════════════════
async function runTooling(): Promise<void> {
  console.log("\n── DS1 · PB1 สถิต ──");
  await step("DS1", () => {
    const p: string[] = [];
    const s = srcOf(F.displayHook);
    if (!s) p.push(`ไม่มี ${F.displayHook}`);
    const at = s.search(/\bpublishDisplayStateAction\s*\(/);
    const args = at >= 0 ? balancedFrom(s, at) : "";
    if (!args) p.push("ไม่พบการเรียก publishDisplayStateAction(…)");
    else {
      if (/[{,]\s*deviceId\s*[:,}]/.test(args)) p.push(`อาร์กิวเมนต์ยังมี deviceId: ${short(args.replace(/\s+/g, " "), 120)}`);
      if (!/\bdeviceCode\b/.test(args)) p.push("อาร์กิวเมนต์ไม่มี deviceCode");
    }
    chk("DS1", p.length === 0, "hook ไม่ส่ง deviceId (ยังส่ง deviceCode)", P8(p) || "ครบ");
  });
  await step("PB1", () => {
    const p: string[] = [];
    const raw = rd(F.branchCompare);
    const s = stripComments(raw);
    if (!raw) p.push(`ไม่มี ${F.branchCompare}`);
    if (!/POS HF-FU2\s*▸\s*PRC-3/.test(raw)) p.push("ไม่มีบล็อก POS HF-FU2 ▸ PRC-3");
    if (!/\.origin\b/.test(s)) p.push("ไม่อ่าน origin ของช่องเทียบราคา");
    if (!((/["']own["']/.test(s) && /["']inherited["']/.test(s)) || (/chipOwn/.test(s) && /chipInherited/.test(s)))) p.push("ไม่แยก own/inherited");
    if (!/pos-prod-compare-origin/.test(s)) p.push("ไม่มี data-testid pos-prod-compare-origin…");
    chk("PB1", p.length === 0, "ป้าย origin ใน BranchCompare", P8(p) || "ครบ");
  });

  console.log("\n── RG ตัวรันด่าน (รากชั่วคราว · --verdict) ──");
  const man = parseJson(rd(F.manifest));
  const names = manNames(man);
  // ชุด accepted ที่ checks ไม่ใช่ CRASH — ไม่ใช้ qc-pos-p2.14 (accepted ของมันถูกถอดในใบนี้ · มติ 7) ⇒ ตัวเลือกเดียวกันทั้งก่อนและหลังสร้าง
  const nonCrash = (Array.isArray(man?.suites) ? man.suites : []).find((s: Any) => s?.suite !== "qc-pos-p2.14" && Array.isArray(s?.accepted?.checks) && s.accepted.checks.some((x: unknown) => !isCrashId(x)));
  const crash = (Array.isArray(man?.suites) ? man.suites : []).find((s: Any) => Array.isArray(s?.accepted?.checks) && s.accepted.checks.includes("CRASH"));
  const fxErr = !man ? "อ่าน pos-gates.json ไม่ได้" : !existsSync(join(ROOT, F.runner)) ? `ไม่มี ${F.runner}` : !names.length ? "แมนิเฟสต์ว่าง" : !nonCrash ? "ไม่มีชุด accepted ที่ checks ไม่ใช่ CRASH" : !crash ? "ไม่มีชุด accepted ที่ checks มี CRASH" : "";
  const nc = nonCrash ? String(nonCrash.suite) : "";
  const ncChecks: string[] = nonCrash ? (nonCrash.accepted.checks as unknown[]).map(String).filter((x) => !isCrashId(x)) : [];
  const cr = crash ? String(crash.suite) : "";
  let real: RgRoot | null = null;
  const ok0 = (names2: string[], over: Record<string, Partial<RgRow>> = {}): RgRow[] => names2.map((n) => ({ name: n, rc: 0, ...(over[n] ?? {}) }));
  const js = (o: Any) => `JSON_SUMMARY ${JSON.stringify(o)}`;
  const need = () => {
    if (fxErr) throw new Error(`(fixture) ${fxErr}`);
    if (!real) real = mkRoot("real", man);
    return real;
  };
  await step("RG1", () => {
    const r = need();
    const a = verdictOf(r, mkOut(r, ok0(names), "-"));
    const b = verdictOf(r, mkOut(r, ok0(names), undefined));
    const p: string[] = [];
    if (!a.green) p.push(`only=- → ${vline(a)}`);
    if (!b.green) p.push(`HEAD แบบเดิม → ${vline(b)}`);
    chk("RG1", p.length === 0, "ชุดเต็ม rc 0 ⇒ green (only=- และแบบเดิม)", P8(p) || `green ×2 (${names.length} รายการ)`);
  });
  await step("RG2", () => {
    const r = need();
    const id0 = ncChecks[0]!;
    const bad = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: 10, passed: 7, failed: [id0] }) } }), "-"));
    const ctl = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: 10, passed: 9, failed: [id0] }) } }), "-"));
    const p: string[] = [];
    if (bad.green || bad.rc === 0 || !new RegExp(`^RED ${nc.replace(/\./g, "\\.")}\\b`, "m").test(bad.out)) p.push(`${nc} total10/passed7/failed[${id0}] → ${vline(bad)} (คาด RED ${nc})`);
    if (!ctl.green) p.push(`(ตัวควบคุม) passed 9 → ${vline(ctl)} (คาด green)`);
    chk("RG2", p.length === 0, "len(ids) < total−passed ⇒ RED", P8(p) || "ครบ");
  });
  await step("RG3", () => {
    if (fxErr) throw new Error(`(fixture) ${fxErr}`);
    const m2 = JSON.parse(JSON.stringify(man));
    for (const s of m2.suites) if (s?.suite === cr && s.accepted) delete s.accepted.match;
    const r = mkRoot("nomatch", m2);
    const v = verdictOf(r, mkOut(r, ok0(names, { [cr]: { rc: 1, body: `💥 qc-hf-fu2 crash fixture\n${js({ total: 1, passed: 0, findings: ["CRASH"] })}` } }), "-"));
    const p: string[] = [];
    if (v.green || v.rc === 0 || !v.out.includes(cr)) p.push(`${cr} CRASH ไม่มี match → ${vline(v)} (คาด RED ${cr})`);
    chk("RG3", p.length === 0, "CRASH accepted ไม่มี match ⇒ RED", P8(p) || "ครบ");
  });
  await step("RG4", () => {
    if (fxErr) throw new Error(`(fixture) ${fxErr}`);
    const tok = `QC-HFFU2-MATCH-${Math.random().toString(36).slice(2, 8)}`;
    const m2 = JSON.parse(JSON.stringify(man));
    for (const s of m2.suites) if (s?.suite === cr && s.accepted) s.accepted.match = tok;
    const r = mkRoot("match", m2);
    const miss = verdictOf(r, mkOut(r, ok0(names, { [cr]: { rc: 1, body: `💥 something else\n${js({ total: 1, passed: 0, findings: ["CRASH"] })}` } }), "-"));
    const hit = verdictOf(r, mkOut(r, ok0(names, { [cr]: { rc: 1, body: `💥 ${tok}\n${js({ total: 1, passed: 0, findings: ["CRASH"] })}` } }), "-"));
    const p: string[] = [];
    if (miss.green || miss.rc === 0) p.push(`match ไม่อยู่ใน log → ${vline(miss)} (คาด RED)`);
    if (!hit.green || !new RegExp(`^ACCEPTED ${cr.replace(/\./g, "\\.")}\\b`, "m").test(hit.out)) p.push(`match อยู่ใน log → ${vline(hit)} (คาด ACCEPTED · green)`);
    chk("RG4", p.length === 0, "match ต้องอยู่ใน log", P8(p) || "ครบ");
  });
  await step("RG5", () => {
    const r = need();
    const two = names.slice(0, 2);
    const a = verdictOf(r, mkOut(r, ok0(two), "-"));
    const b = verdictOf(r, mkOut(r, ok0(two), undefined));
    const c = verdictOf(r, mkOut(r, ok0(two), two.join(",")));
    const d = verdictOf(r, mkOut(r, ok0(two.slice(0, 1)), two.join(",")));
    const p: string[] = [];
    if (a.green || a.rc === 0) p.push(`partial only=- → ${vline(a)} (คาด RED)`);
    if (b.green || b.rc === 0) p.push(`partial HEAD แบบเดิม → ${vline(b)} (คาด RED · อ่านเป็น only=-)`);
    if (!c.green) p.push(`partial only=${two.join(",")} 2 แถว → ${vline(c)} (คาด green)`);
    if (d.green || d.rc === 0) p.push(`only 2 ชื่อแต่มี 1 แถว → ${vline(d)} (คาด RED)`);
    chk("RG5", p.length === 0, "partial ต้องมาจาก --only และนับตรง", P8(p) || "ครบ");
  });
  await step("RG6", () => {
    const r = need();
    const last = names[names.length - 1]!;
    const v = verdictOf(r, mkOut(r, ok0(names, { [last]: { line1: `tree=${r.root} head=deadbeef dirty=0 2026-10-16T00:00:00Z only=-` } }), "-"));
    const p: string[] = [];
    if (v.green || v.rc === 0 || !/log-head/.test(v.out)) p.push(`${last}.log บรรทัด 1 head อื่น → ${vline(v)} (คาด RED log-head)`);
    chk("RG6", p.length === 0, "log บรรทัด 1 ≠ HEAD.txt ⇒ RED log-head", P8(p) || "ครบ");
  });
  await step("RG7", () => {
    const r = need();
    const v = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 137, body: js({ total: 10, passed: 9, failed: [ncChecks[0]] }) } }), "-"));
    chk("RG7", !v.green && v.rc !== 0, "rc 137 ⇒ RED", vline(v));
  });
  await step("RG8", () => {
    const r = need();
    const ids = [...ncChecks.map((x) => `${x} accepted`), "QCX-HIDDEN-1 แดงซ่อน (แบบ PL2.1)"];
    const v = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: ids.length + 5, passed: 5, findings: ids }) } }), "-"));
    chk("RG8", !v.green && v.rc !== 0, "แดงซ่อนนอก checks ⇒ RED", vline(v));
  });

  // ORACLE-ADD ผู้คุม 17 ต.ค. (HF-FU2 fix1 N1–N4) ▸ RG9–RG13: แก้ไฟล์ในโฟลเดอร์ผลชั่วคราวหลัง mkOut ให้เหมือนของปลอมของ hunter (ทุกอย่างอื่นสอดคล้อง) ◂
  const setLog = (dir: string, name: string, fn: (lines: string[]) => string[]) => {
    const f = join(dir, `${name}.log`);
    const L = readFileSync(f, "utf8").replace(/\n$/, "").split("\n");
    writeFileSync(f, `${fn(L).join("\n")}\n`);
  };
  const isRed = (v: { rc: number; green: boolean }) => !v.green && v.rc !== 0;
  await step("RG9", () => {
    const r = need();
    const first = names[0]!;
    const a = mkOut(r, ok0(names), "-");
    setLog(a, first, (L) => [...L.slice(0, -1), "EXIT 1"]);
    const va = verdictOf(r, a);
    const b = mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: 10, passed: 9, failed: [ncChecks[0]] }) } }), "-");
    setLog(b, nc, (L) => [...L.slice(0, -1), "EXIT 137"]);
    const vb = verdictOf(r, b);
    const vc = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: 10, passed: 9, failed: [ncChecks[0]] }) } }), "-"));
    const p: string[] = [];
    if (!isRed(va)) p.push(`${first} SUMMARY 0 · log EXIT 1 → ${vline(va)} (คาด RED)`);
    if (!isRed(vb)) p.push(`${nc} SUMMARY 1 · log EXIT 137 → ${vline(vb)} (คาด RED)`);
    if (!vc.green) p.push(`(ตัวควบคุม) ${nc} EXIT 1 ตรง → ${vline(vc)} (คาด green)`);
    chk("RG9", p.length === 0, "exit ใน SUMMARY = EXIT ท้าย log", P8(p) || "ครบ");
  });
  await step("RG10", () => {
    const r = need();
    const first = names[0]!;
    const cases: [string, Any][] = [
      ["failed ไม่ว่าง", { total: 3, passed: 2, failed: ["QCX-RG10-1"] }],
      ["findings ไม่ว่าง", { total: 3, passed: 3, findings: ["QCX-RG10-2 ซ่อน"] }],
      ["crashed:true", { total: 3, passed: 3, failed: [], crashed: true }],
      ["passed < total", { total: 3, passed: 2, failed: [] }],
    ];
    const p: string[] = [];
    for (const [lbl, j] of cases) {
      const v = verdictOf(r, mkOut(r, ok0(names, { [first]: { rc: 0, body: js(j) } }), "-"));
      if (!isRed(v)) p.push(`${first} exit 0 + ${lbl} → ${vline(v)} (คาด RED)`);
    }
    chk("RG10", p.length === 0, "แถว exit 0 ที่สรุปล้ม ⇒ RED", P8(p) || "ครบ (4 กรณี)");
  });
  await step("RG11", () => {
    const r = need();
    const two = names.slice(0, 2);
    const a = mkOut(r, ok0(two), "-");
    writeFileSync(join(a, "HEAD.txt"), `${readFileSync(join(a, "HEAD.txt"), "utf8").replace(/\n$/, "")}\nhead=${r.head} dirty=0 only=${two.join(",")}\n`);
    const va = verdictOf(r, a);
    const vb = verdictOf(r, mkOut(r, ok0(two), `- only=${two.join(",")}`));
    const p: string[] = [];
    if (!isRed(va)) p.push(`HEAD.txt 2 บรรทัด (บรรทัด 2 only=${two.join(",")}) → ${vline(va)} (คาด RED)`);
    if (!isRed(vb)) p.push(`บรรทัดเดียว only=- only=${two.join(",")} → ${vline(vb)} (คาด RED)`);
    chk("RG11", p.length === 0, "HEAD.txt บรรทัดเดียว · only= ตัวเดียว", P8(p) || "ครบ");
  });
  await step("RG12", () => {
    const r = need();
    const real = js({ total: 10, passed: 9, failed: ["QCX-RG12-NOT-ACCEPTED"] });
    const forged = js({ total: 10, passed: 9, failed: [ncChecks[0]] });
    const va = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: `${real}\n${forged}` } }), "-"));
    const vb = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: `${forged}\nบรรทัดต่อท้ายหลังสรุป` } }), "-"));
    const p: string[] = [];
    if (!isRed(va)) p.push(`${nc} JSON_SUMMARY 2 บรรทัด (ปลอมต่อท้าย) → ${vline(va)} (คาด RED)`);
    if (!isRed(vb)) p.push(`${nc} JSON_SUMMARY ไม่ใช่บรรทัดก่อน EXIT → ${vline(vb)} (คาด RED)`);
    chk("RG12", p.length === 0, "JSON_SUMMARY บรรทัดเดียว ก่อน EXIT", P8(p) || "ครบ");
  });
  await step("RG13", () => {
    const r = need();
    const id0 = ncChecks[0]!;
    const id1 = ncChecks[1] ?? `${ncChecks[0]}-B`;
    const va = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: 10, passed: 8, failed: [id0], findings: [id1] }) } }), "-"));
    const vb = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: 10, passed: 11, failed: [id0] }) } }), "-"));
    const vc = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: 10, passed: 8, findings: [id0, id1] }) } }), "-"));
    const p: string[] = [];
    if (!isRed(va)) p.push(`${nc} failed[${id0}] + findings[${id1}] · total−passed 2 → ${vline(va)} (คาด RED)`);
    if (!isRed(vb)) p.push(`${nc} passed 11 > total 10 → ${vline(vb)} (คาด RED)`);
    if (!vc.green) p.push(`(ตัวควบคุม) ${nc} findings อย่างเดียว 2 ตัว · total−passed 2 → ${vline(vc)} (คาด green)`);
    chk("RG13", p.length === 0, "นับ failed เท่านั้น · 0 ≤ passed ≤ total", P8(p) || "ครบ");
  });

  // ORACLE-ADD ผู้คุม 17 ต.ค. (HF-FU2 fix2 N6–N7) ▸ RG14–RG15 ◂
  await step("RG14", () => {
    const r = need();
    const plainSuite = (Array.isArray(man?.suites) ? man.suites : []).map((x: Any) => String(x?.suite ?? "")).find((n: string) => n && !["qc-restaurant", "qc-nav-functions"].includes(n) && !(man.suites.find((x: Any) => x.suite === n)?.accepted)) ?? "";
    const forcedSuite = (Array.isArray(man?.suites) ? man.suites : []).find((x: Any) => x?.mode === "forced" && !x?.accepted)?.suite ?? "";
    if (!plainSuite || !forcedSuite || !names.includes("qc-restaurant")) throw new Error(`(fixture) ชุดสำหรับ RG14 ไม่ครบ (${plainSuite}/${forcedSuite}/qc-restaurant)`);
    const cases: [string, string, string][] = [
      ["ไม่มี JSON_SUMMARY", plainSuite, "ผ่านทั้งหมด (สรุปถูกลบ)"],
      ["passed เป็นสตริง", plainSuite, js({ total: 3, passed: "3", failed: [] })],
      ["total 0", plainSuite, js({ total: 0, passed: 0, failed: [] })],
      ["skipped:true", plainSuite, js({ total: 3, passed: 3, failed: [], skipped: true })],
      ["forced:false (ชุด forced)", forcedSuite, js({ total: 3, passed: 3, failed: [], forced: false })],
    ];
    const p: string[] = [];
    for (const [lbl, nm, body] of cases) {
      const v = verdictOf(r, mkOut(r, ok0(names, { [nm]: { rc: 0, body } }), "-"));
      if (!isRed(v)) p.push(`${nm} exit 0 + ${lbl} → ${vline(v)} (คาด RED)`);
    }
    const ctl = verdictOf(r, mkOut(r, ok0(names, { "qc-restaurant": { rc: 0, body: "qc-restaurant ผ่าน (ชุดนี้ไม่พิมพ์ JSON_SUMMARY)" } }), "-"));
    if (!ctl.green) p.push(`(ตัวควบคุม) qc-restaurant ไม่มี JSON → ${vline(ctl)} (คาด green)`);
    chk("RG14", p.length === 0, "suite exit 0 ต้องมีสรุปที่ผ่านจริง (ยกเว้นชุดที่ไม่พิมพ์สรุป)", P8(p) || "ครบ (5 กรณี + ตัวควบคุม)");
  });
  await step("RG15", () => {
    const r = need();
    const id0 = ncChecks[0]!;
    const first = names[0]!;
    const va = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: 10, passed: 9, failed: 2, findings: [id0] }) } }), "-"));
    const vb = verdictOf(r, mkOut(r, ok0(names, { [first]: { rc: 0, body: js({ total: 3, passed: 3, failed: 0 }) } }), "-"));
    const vc = verdictOf(r, mkOut(r, ok0(names, { [nc]: { rc: 1, body: js({ total: 0, passed: 0, failed: [id0] }) } }), "-"));
    const p: string[] = [];
    if (!isRed(va)) p.push(`${nc} accepted rc 1 · failed:2 (+ findings [${id0}]) → ${vline(va)} (คาด RED)`);
    if (!isRed(vb)) p.push(`${first} exit 0 · failed:0 → ${vline(vb)} (คาด RED)`);
    if (!isRed(vc)) p.push(`${nc} total 0 passed 0 failed [${id0}] → ${vline(vc)} (คาด RED)`);
    chk("RG15", p.length === 0, "failed ต้องเป็นรายการ · ไม่เกิน total−passed", P8(p) || "ครบ");
  });

  console.log("\n── MF แมนิเฟสต์ ──");
  await step("MF1", () => {
    const p: string[] = [];
    if (!man) p.push("อ่าน pos-gates.json ไม่ได้");
    const es = allEntries(man);
    const p214 = es.find((e) => entryName(e) === "qc-pos-p2.14");
    if (!p214) p.push("ไม่มีชุด qc-pos-p2.14");
    else if (p214.accepted !== undefined) p.push(`qc-pos-p2.14 ยังมี accepted (checks ${short(p214.accepted?.checks, 40)})`);
    const crashy = es.filter((e) => Array.isArray(e?.accepted?.checks) && e.accepted.checks.some(isCrashId));
    for (const e of crashy) {
      const n = entryName(e);
      const m = e.accepted.match;
      if (typeof m !== "string" || !m.trim()) {
        p.push(`${n} ไม่มี accepted.match`);
        continue;
      }
      const log = join(GATES111, `${n}.log`);
      if (existsSync(log) && !readFileSync(log, "utf8").includes(m)) p.push(`${n} match "${short(m, 40)}" ไม่อยู่ใน gates111 log`);
    }
    const me = (Array.isArray(man?.suites) ? man.suites : []).find((s: Any) => s?.suite === SUITE);
    if (!me) p.push(`ไม่มีชุด ${SUITE} ในแมนิเฟสต์`);
    else if (me.mode !== "forced") p.push(`${SUITE} mode ${me.mode} (คาด forced)`);
    chk("MF1", p.length === 0, "p2.14 ไม่มี accepted · CRASH/*-ERR มี match · มี qc-hf-fu2", P8(p) || `ครบ (${crashy.length} รายการ CRASH/ERR มี match)`);
  });
}
function rmRg(): string {
  if (!RG_BASE.dir) return "";
  try {
    rmSync(RG_BASE.dir, { recursive: true, force: true });
  } catch (e) {
    return `ลบ ${RG_BASE.dir} ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
  }
  return existsSync(RG_BASE.dir) ? `${RG_BASE.dir} ยังอยู่` : "";
}

// ═════════════════════════ 1d. --no-db ═════════════════════════
const loadBlame = async () => (existsSync(join(ROOT, F.blame)) && purePath(F.blame) ? await tryImport("@/components/pos/register/deposit-blame") : null);
const NODB_IDS = ["ST1", "ST2", "DP1", "DP2", "DP3", "DS1", "PB1", "RG1", "RG2", "RG3", "RG4", "RG5", "RG6", "RG7", "RG8", "RG9", "RG10", "RG11", "RG12", "RG13", "RG14", "RG15", "MF1"]; // ORACLE-ADD ผู้คุม 17 ต.ค. (HF-FU2 fix1 N1–N4): + RG9–RG13 ◂ · ORACLE-ADD ผู้คุม 17 ต.ค. (HF-FU2 fix2 N6–N7): + RG14–RG15 ◂
if (NODB) {
  const ids = NODB_IDS.map((x) => `HF-FU2-${x}`);
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + บริสุทธิ์ + ตัวรันด่าน · ไม่โหลด prisma)`);
  let crashedS = "";
  let rgLeft = "";
  try {
    await runStatic();
    await runPure(await loadBlame());
    await runTooling();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  } finally {
    rgLeft = rmRg();
    if (rgLeft) console.log(`  ⚠️  ${rgLeft}`);
  }
  for (const id of ids) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
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

// ═════════════════════════ 3. ด่าน SKIP + ลายนิ้วมือก่อน ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const FP_TABLES: [string, string][] = [["PosProductChannelPrice", "updatedAt"], ["AccountSystemLink", "systemId"]];
/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราวของข้อสอบนี้ (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-hffu2-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ HF-FU2 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล · PAR เขียว)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · PAR เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const blameMod = await loadBlame();
const catalog = await tryImport("@/lib/modules/pos/catalog");
const svc = await tryImport("@/lib/modules/pos/service");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const chMod = await tryImport("@/lib/modules/pos/channel");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const dispMod = await tryImport("@/lib/modules/pos/display");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-hffu2-${RAND}`;
const T_SLUG = `posqc-hffu2-${RAND}`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qcfu2-${RAND}`;
let T = "";
const RUN_START = Date.now();
const MIN = 60_000;
const MY_SALES: string[] = [];

// ── ตัวกั้นเครือข่าย ──
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
async function drain(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} · DB ${HOST} ──`);
  console.log("   สาขา A B (SHOP · POS) · LINEMAN (PLATFORM 30%) ทั้งสองสาขา · สมุด 1 (ผูก POS · จด VAT) · สมุด 2 · เครื่อง D1 (กะ OPEN ของเจ้าของ) · D2 (ไม่มีกะ)");
  let fx = "";
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const CH: Record<string, string> = {};
  const PP: Record<string, string> = {};
  const PFX: Record<string, string> = {};
  try {
    T = (await P.tenant.create({ data: { name: `QC HF-FU2 ตามเก็บ ${RAND}`, slug: T_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    U.B = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาB`, slug: `${T_SLUG}-b` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.ACC1 = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี 1 ${RAND}`)).id;
    S.ACC2 = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี 2 ${RAND}`)).id;
    for (const [acc, nm] of [[S.ACC1, "1"], [S.ACC2, "2"]] as const) {
      await accSvc.saveSettings(T, acc, { orgName: `ร้านตามเก็บสอง คิวซี ${nm} ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
      await glMod.ensureAccounting({ tenantId: T, systemId: acc });
    }
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC1, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
  }
  if (!fx) {
    try {
      const u = await P.user.create({ data: { email: `${EMAIL_PREFIX}owner@qc.invalid`, name: `OWNER คิวซี${RAND}` } });
      await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
      US.OWNER = { id: u.id, role: "OWNER", unitAccess: ["*"], perms: {} };
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid("OWNER") });
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  const DEV1 = `qcfu2${RAND}d1`;
  const DEV2 = `qcfu2${RAND}d2`;
  // ─── ช่องทาง ───
  if (!fx) {
    try {
      for (const u of ["A", "B"]) {
        const r = await call(chMod, "ensureUnitChannels", P, { tenantId: T, systemId: S.POS, unitId: U[u] });
        if (!Array.isArray(r)) throw new Error(`ensureUnitChannels ${u}: ${codeOf(r)}`);
        const s = must(`saveChannel LINEMAN ${u}`, await call(chMod, "saveChannel", ctxU(u), A("OWNER"), { code: "LINEMAN", name: `LINE MAN ${u} ${RAND}`, payout: "PLATFORM", commissionBp: 3000 }));
        CH[`LM_${u}`] = String(s.channel?.id ?? "");
        if (!CH[`LM_${u}`]) throw new Error(`ช่องทาง LINEMAN ${u} ไม่มี id`);
      }
    } catch (e) {
      fx = `ช่องทาง:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── สินค้า (แคตตาล็อก) ───
  if (!fx) {
    try {
      for (const k of ["my", "mx", "mz", "mw", "mv", "mu", "mt"]) {
        const input: Any = { name: `ราคา ${k} ${RAND}`, kind: "PRODUCT", basePriceSatang: 10_000, ...(k === "mz" ? { unitId: U.A } : {}) };
        const r = await call(catalog, "createProduct", cc(), input);
        PP[k] = String(r?.id ?? "");
        if (!PP[k]) throw new Error(`createProduct ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      }
      const rows: Record<string, Any[]> = {
        my: [{ channelCode: null, unitId: U.A, priceSatang: null, notSold: true }],
        mx: [{ channelCode: "LINEMAN", unitId: null, priceSatang: null, notSold: true }],
        mz: [{ channelCode: null, unitId: U.A, priceSatang: null, notSold: true }],
        mw: [{ channelCode: null, unitId: U.A, priceSatang: null, notSold: true }, { channelCode: "LINEMAN", unitId: U.A, priceSatang: 9_000 }],
        mu: [{ channelCode: null, unitId: U.A, priceSatang: null, notSold: true }, { channelCode: null, unitId: U.B, priceSatang: null, notSold: true }],
        mt: [{ channelCode: "LINEMAN", unitId: null, priceSatang: null, notSold: true }],
      };
      for (const [k, rs] of Object.entries(rows)) {
        const r = await call(catalog, "setChannelPrices", cc(), { productId: PP[k], rows: rs });
        if (r?.ok === false) PFX[k] = `setChannelPrices ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`; // ข้อที่ใช้สินค้านี้แดงด้วยเหตุ fixture (ไม่ล้มทั้งชุด)
      }
    } catch (e) {
      fx = `สินค้า:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── เครื่อง + กะ ───
  let devFx = "";
  if (!fx) {
    try {
      for (const dev of [DEV1, DEV2]) must(`registerDevice ${dev.slice(-2)}`, await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เครื่อง ${dev.slice(-2)} ${RAND}`, deviceCode: dev }));
      must("openShift D1", await call(shiftMod, "openShift", ctxU("A", DEV1), A("OWNER"), { deviceId: DEV1, deviceLabel: `เครื่อง d1 ${RAND}`, floatSatang: 0 }));
    } catch (e) {
      devFx = `เครื่อง/กะ:${(e as Error).message.slice(0, 160)}`;
    }
  }
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  if (devFx) console.log(`  ⚠️  fixture: ${devFx}`);
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;

  // ─── ตัวช่วยราคา ───
  const LBL = (u: unknown) => (u === null ? "*" : u === U.A ? "A" : u === U.B ? "B" : String(u).slice(-4));
  const rowsOf = async (k: string): Promise<string> =>
    ((await P.posProductChannelPrice.findMany({ where: { tenantId: T, productId: PP[k] ?? "none" } }).catch(() => [])) as Any[])
      .map((r) => `${r.channelCode ?? "*"}|${LBL(r.unitId)}|${r.notSold ? "NS" : r.priceSatang}`)
      .sort(byStr)
      .join(" ");
  const bulkAudits = async (k: string): Promise<Any[]> =>
    ((await P.auditLog.findMany({ where: { tenantId: T, action: AUDIT_CP, targetId: PP[k] ?? "none" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]).filter((a) => a?.after?.via === "bulk");
  const cell = async (k: string, u: string): Promise<string> => {
    const m = await call(catalog, "unitPriceMatrix", cc(), { productIds: [PP[k] ?? "none"], unitIds: [U.A, U.B], channelCodes: ["LINEMAN"] });
    const c = (Array.isArray(m?.cells) ? m.cells : []).find((x: Any) => x.unitId === U[u] && x.channelCode === "LINEMAN");
    return c ? (c.refusal ? String(c.refusal) : String(c.unitPriceSatang)) : `ไม่มีช่อง (${codeOf(m)})`;
  };
  const bulk = (keys: string[]) => call(catalog, "bulkChannelMarkup", cc(), { channelCode: "LINEMAN", unitId: null, markupBp: 1000, roundTo: 1, productIds: keys.map((k) => PP[k] ?? "none") });
  const resStr = (r: Any) => (r && typeof r.written === "number" ? `written ${r.written} skipped ${r.skipped}` : `${codeOf(r)} ${short(r?.message ?? "", 60)}`);
  const auditRows = (a: Any) => (Array.isArray(a?.after?.rows) ? (a.after.rows as Any[]) : []).map((r) => `${r.channelCode ?? "*"}|${LBL(r.unitId)}|${r.notSold ? "NS" : r.priceSatang}`).sort(byStr).join(" ");

  // ════════ PR บวกราคาทั้งช่องทาง (PRC-1) ════════
  let pr1Rows = "";
  let pr1Audits = -1;
  await step("PR1", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    if (PFX.my) throw new Error(`fixture ${PFX.my}`);
    const r = await bulk(["my"]);
    if (r?.written !== 1 || r?.skipped !== 0 || (r?.productIds ?? []).join() !== PP.my) p.push(`ผล ${resStr(r)} ids ${short(r?.productIds, 40)} (คาด written 1 skipped 0 [my])`);
    pr1Rows = await rowsOf("my");
    const want = ["*|A|NS", "LINEMAN|*|11000", "LINEMAN|A|NS"].sort(byStr).join(" ");
    if (pr1Rows !== want) p.push(`แถว my: ${pr1Rows} (คาด ${want})`);
    const a = await cell("my", "A");
    const b = await cell("my", "B");
    if (a !== "CHANNEL_NOT_SOLD") p.push(`เทียบราคา A/LINEMAN ${a} (คาด CHANNEL_NOT_SOLD)`);
    if (b !== "11000") p.push(`เทียบราคา B/LINEMAN ${b} (คาด 11000)`);
    const au = await bulkAudits("my");
    pr1Audits = au.length;
    const wantA = ["LINEMAN|*|11000", "LINEMAN|A|NS"].sort(byStr).join(" ");
    if (au.length !== 1 || auditRows(au[0]) !== wantA) p.push(`audit bulk ${au.length} แถว rows ${au.map(auditRows).join(" / ")} (คาด 1 · ${wantA})`);
    chk("PR1", p.length === 0, "พา notSold ลงชั้นช่องทาง · A ไม่ขาย · B ราคาบวก · audit 1", FX(P8(p) || "ครบ"));
  });
  await step("PR2", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const pf = ["mx", "mz", "my"].map((k) => PFX[k]).filter(Boolean);
    if (pf.length) throw new Error(`fixture ${pf.join(" · ")}`);
    const before = { mx: await rowsOf("mx"), mz: await rowsOf("mz") };
    const r = await bulk(["mx", "mz"]);
    if (r?.written !== 0 || r?.skipped !== 2) p.push(`mx+mz ${resStr(r)} (คาด written 0 skipped 2)`);
    for (const k of ["mx", "mz"] as const) {
      const now = await rowsOf(k);
      if (now !== before[k]) p.push(`แถว ${k} ${before[k]} → ${now}`);
      const au = await bulkAudits(k);
      if (au.length) p.push(`${k} มี audit bulk ${au.length}`);
    }
    const myBefore = await rowsOf("my");
    const auBefore = (await bulkAudits("my")).length;
    const r2 = await bulk(["my"]);
    if (r2?.written !== 0) p.push(`เล่น PR1 ซ้ำ ${resStr(r2)} (คาด written 0)`);
    const myAfter = await rowsOf("my");
    if (myAfter !== myBefore) p.push(`เล่นซ้ำ: แถว my ${myBefore} → ${myAfter}`);
    const auAfter = (await bulkAudits("my")).length;
    if (auAfter !== auBefore) p.push(`เล่นซ้ำ: audit bulk my ${auBefore} → ${auAfter}`);
    if (pr1Audits >= 0 && auBefore !== pr1Audits) p.push(`(ข้อมูล) audit my หลัง PR1 ${pr1Audits} ก่อนเล่นซ้ำ ${auBefore}`);
    chk("PR2", p.length === 0, "notSold ระดับช่องทาง + สินค้าของสาขา = ข้าม · เล่นซ้ำไม่เขียน", FX(P8(p) || `ครบ (my ${pr1Rows || myAfter})`));
  });
  await step("PR3", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture ${fx}`);
    const pf = ["mw", "mu", "mt"].map((k) => PFX[k]).filter(Boolean);
    if (pf.length) throw new Error(`fixture ${pf.join(" · ")}`);
    const mt0 = await rowsOf("mt");
    const r = await bulk(["mw", "mv", "mu", "mt"]);
    const ids = Array.isArray(r?.productIds) ? [...(r.productIds as string[])].sort(byStr).join() : "-";
    const wantIds = [PP.mw!, PP.mv!, PP.mu!].sort(byStr).join();
    if (r?.written !== 3 || r?.skipped !== 1 || ids !== wantIds) p.push(`ผล ${resStr(r)} ids ${ids === wantIds ? "ตรง" : short(r?.productIds, 60)} (คาด written 3 skipped 1 [mw mv mu])`);
    const want: Record<string, string> = {
      mw: ["*|A|NS", "LINEMAN|A|9000", "LINEMAN|*|11000"].sort(byStr).join(" "),
      mv: "LINEMAN|*|11000",
      mu: ["*|A|NS", "*|B|NS", "LINEMAN|*|11000", "LINEMAN|A|NS", "LINEMAN|B|NS"].sort(byStr).join(" "),
      mt: mt0,
    };
    for (const k of ["mw", "mv", "mu", "mt"]) {
      const now = await rowsOf(k);
      if (now !== want[k]) p.push(`แถว ${k}: ${now} (คาด ${want[k]})`);
    }
    const cells: [string, string, string][] = [["mw", "A", "9000"], ["mw", "B", "11000"], ["mv", "A", "11000"], ["mv", "B", "11000"], ["mu", "A", "CHANNEL_NOT_SOLD"], ["mu", "B", "CHANNEL_NOT_SOLD"]];
    for (const [k, u, w] of cells) {
      const c = await cell(k, u);
      if (c !== w) p.push(`เทียบราคา ${k} ${u}/LINEMAN ${c} (คาด ${w})`);
    }
    for (const [k, n] of [["mw", 1], ["mv", 1], ["mu", 1], ["mt", 0]] as const) {
      const au = await bulkAudits(k);
      if (au.length !== n) p.push(`audit bulk ${k} ${au.length} (คาด ${n})`);
    }
    const mu = (await bulkAudits("mu"))[0];
    const muWant = ["LINEMAN|*|11000", "LINEMAN|A|NS", "LINEMAN|B|NS"].sort(byStr).join(" ");
    if (mu && auditRows(mu) !== muWant) p.push(`audit mu rows ${auditRows(mu)} (คาด ${muWant})`);
    chk("PR3", p.length === 0, "ไม่ทับแถวราคา (LINEMAN, A) · พาลงหลายสาขา · นับ written/skipped ตรง", FX(P8(p) || "ครบ"));
  });

  // ════════ DS2 เครื่องของผู้ส่งภาพจอ (D1b PAR) ════════
  await step("DS2", async () => {
    const p: string[] = [];
    // สถิต
    const act = fnBody(srcOf(F.displayActions), "publishDisplayStateAction");
    if (!act) p.push("ไม่มี publishDisplayStateAction");
    else {
      if (!/deviceId\?\s*:\s*string/.test(act)) p.push("publishDisplayStateAction ไม่รับ deviceId? แล้ว (แท็บเก่าส่งมาได้ · มติ 8)");
      if (!/\bdisplayPublisherDevice\s*\(/.test(act)) p.push("ไม่ใช้ displayPublisherDevice");
      if (!/DEVICE_NOT_REGISTERED/.test(act)) p.push("ไม่ปฏิเสธ DEVICE_NOT_REGISTERED");
      if (/\bargs\??\.deviceId\b/.test(act)) p.push("อ่าน args.deviceId");
    }
    if (fx || devFx) throw new Error(`fixture ${fx || devFx}`);
    const fn = dispMod?.displayPublisherDevice;
    if (typeof fn !== "function") p.push(`${MISSING} displayPublisherDevice`);
    else {
      const forged = await fn({ tenantId: T, unitId: U.A }, { userId: uid("OWNER") }, DEV2).catch((e: unknown) => `throw ${(e as Error).message.slice(0, 40)}`);
      const own = await fn({ tenantId: T, unitId: U.A }, { userId: uid("OWNER") }, DEV1).catch((e: unknown) => `throw ${(e as Error).message.slice(0, 40)}`);
      const otherUnit = await fn({ tenantId: T, unitId: U.B }, { userId: uid("OWNER") }, DEV1).catch((e: unknown) => `throw ${(e as Error).message.slice(0, 40)}`);
      if (forged !== null) p.push(`เครื่อง D2 (ไม่มีกะ) → ${short(forged, 40)} (คาด null)`);
      if (otherUnit !== null) p.push(`เครื่อง D1 ที่สาขา B → ${short(otherUnit, 40)} (คาด null)`);
      if (own !== DEV1) p.push(`(ตัวควบคุม) เครื่อง D1 (กะ OPEN) → ${short(own, 40)} (คาด ${DEV1})`);
    }
    chk("DS2", p.length === 0, "เครื่องมาจากกะ OPEN ของผู้ใช้ · ปลอม = null", P8(p) || "ครบ");
  });

  // ════════ AC ค่าคอมฯ ข้ามสมุด (ACC-1) ════════
  const jvCount = (systemId: string, key: string) => P.accountJournalEntry.count({ where: { tenantId: T, systemId, idempotencyKey: key } }).catch(() => -1) as Promise<number>;
  const K = (id: string, ev: string) => `PosSale#${id}#${ev}`;
  const warnsOf = async (refundId: string): Promise<Any[]> =>
    ((await P.opsEvent.findMany({ where: { tenantId: T, level: "WARN" } }).catch(() => [])) as Any[]).filter((e) => {
      const txt = `${e.source ?? ""} ${e.message ?? ""} ${e.detail ?? ""}`;
      return txt.includes("commission_other_book") && !!refundId && txt.includes(refundId);
    });
  /** บิล LINEMAN (PLATFORM) 2 บรรทัด ฿200 + ฿220 → ระบาย ⇒ PAID + COMMISSION ในสมุด 1 */
  const lmSale = async (lbl: string): Promise<{ id: string; lineA: string }> => {
    const r = await call(svc, "createSale", {
      tenantId: T, unitId: U.A, systemId: S.POS, idempotencyKey: newKey(lbl),
      lines: [{ name: `ของ ${lbl} ก ${RAND}`, qty: 1, unitPriceSatang: 20_000 }, { name: `ของ ${lbl} ข ${RAND}`, qty: 1, unitPriceSatang: 22_000 }],
      payMethods: [{ type: "PLATFORM", amountSatang: 42_000 }], channelId: CH.LM_A, channelRef: `LM-${lbl}-${RAND}`,
    });
    const id = r && typeof r.saleId === "string" ? r.saleId : "";
    if (!id) throw new Error(`(fixture) บิล ${lbl}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    MY_SALES.push(id);
    await drain();
    const lines = (await P.posSaleLine.findMany({ where: { saleId: id }, orderBy: { id: "asc" } }).catch(() => [])) as Any[];
    const lineA = String(lines.find((l) => /ก /.test(String(l.name)))?.id ?? lines[0]?.id ?? "");
    const com = await jvCount(S.ACC1!, K(id, "COMMISSION"));
    if (com !== 1) throw new Error(`(fixture) บิล ${lbl} COMMISSION ในสมุด 1 = ${com} (คาด 1)`);
    return { id, lineA };
  };
  const refund = async (s: { id: string; lineA: string }, lbl: string): Promise<string> => {
    const r = await call(refundMod, "refundSale", ctxU("A", DEV1), A("OWNER"), { saleId: s.id, lines: [{ lineId: s.lineA || "none", qty: 1 }], payMethods: [{ type: "PLATFORM", amountSatang: 20_000 }], reasonCode: "CHANGED_MIND", reason: `ลูกค้ายกเลิก ${lbl}`, idempotencyKey: newKey(lbl) });
    const docs = (await P.posSale.findMany({ where: { tenantId: T, docType: "REFUND", refSaleId: s.id } }).catch(() => [])) as Any[];
    for (const d of docs) MY_SALES.push(String(d.id));
    const rid = r?.ok === true ? String(r.refund?.id ?? docs[0]?.id ?? "") : "";
    if (!rid) throw new Error(`(fixture) คืน ${lbl} → ${codeOf(r)} ${short(r?.message ?? "", 80)} · ใบคืน ${docs.length}`);
    return rid;
  };
  const evOf = async (rid: string): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type: EV_REFUNDED } }).catch(() => [])) as Any[]).filter((e) => e.payload?.refundSaleId === rid);
  const relink = (acc: string) => P.accountSystemLink.updateMany({ where: { tenantId: T, linkedKind: "POS", linkedId: S.POS }, data: { systemId: acc } });
  await step("AC1", async () => {
    const p: string[] = [];
    if (fx || devFx) throw new Error(`fixture ${fx || devFx}`);
    const s = await lmSale("ac1");
    let rid = "";
    const replay: string[] = [];
    try {
      await relink(S.ACC2!);
      rid = await refund(s, "ac1rf");
      await drain();
      const ev = (await evOf(rid))[0];
      const h = consMod?.consumers?.[EV_REFUNDED];
      if (!ev || typeof h !== "function") replay.push(`ไม่มี event/consumer ${EV_REFUNDED}`);
      else
        for (let i = 0; i < 2; i++)
          try {
            await h(ev);
          } catch (e) {
            replay.push(`เล่นซ้ำ ${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
          }
      // ORACLE-ADD ผู้คุม 17 ต.ค. (HF-FU2 fix1 N5) ▸ เขียน WARN ไม่ได้ต้องโยน (คิวลองใหม่) ไม่ใช่กลืนเงียบ: ฉีด findFirst = null + create ล้ม เฉพาะ source ของ WARN นี้ ·
      //   เรียก consumer ตรง (ยังผูกสมุด 2) ⇒ ต้อง throw ข้อความที่ฉีด · create ถูกเรียก 1 ครั้ง · ไม่มีแถวเพิ่ม (คืนของเดิมใน finally) ◂
      if (ev && typeof h === "function") {
        const dlg = P.opsEvent;
        const f0 = dlg.findFirst;
        const c0 = dlg.create;
        let calls = 0;
        let threw = "";
        dlg.findFirst = (a: Any) => (String(a?.where?.source ?? "") === OPS_KEY ? Promise.resolve(null) : f0.call(dlg, a));
        dlg.create = (a: Any) => {
          if (String(a?.data?.source ?? "") === OPS_KEY) {
            calls++;
            return Promise.reject(new Error("QCX-HFFU2-INJECTED-OPS-CREATE"));
          }
          return c0.call(dlg, a);
        };
        try {
          await h(ev);
        } catch (e) {
          threw = String((e as Error)?.message ?? e);
        } finally {
          dlg.findFirst = f0;
          dlg.create = c0;
        }
        if (dlg.create !== c0 || dlg.findFirst !== f0) replay.push("(ข้อสอบ) คืน delegate ไม่สำเร็จ");
        if (calls !== 1 || !threw.includes("QCX-HFFU2-INJECTED-OPS-CREATE")) replay.push(`ฉีด create ล้ม: เรียก create ${calls} ครั้ง · consumer throw "${threw.slice(0, 60)}" (คาด 1 ครั้ง · throw ข้อความที่ฉีด — ห้ามกลืนเงียบ · N5)`);
        else console.log("  (AC1 ข้อมูล) ฉีด create ล้ม ⇒ consumer throw (คิวลองใหม่) ✓");
      }
      await drain();
    } finally {
      await relink(S.ACC1!);
    }
    p.push(...replay);
    const w = await warnsOf(rid);
    if (w.length !== 1) p.push(`WARN ${OPS_KEY} ของใบคืน ${w.length} แถว (คาด 1 · เล่นซ้ำ ×2 แล้ว)`);
    else if (!`${w[0].message ?? ""} ${w[0].detail ?? ""}`.includes(s.id)) p.push(`WARN ไม่มี saleId (${short(w[0], 120)})`);
    const comB2 = await jvCount(S.ACC2!, K(s.id, "COMMISSION"));
    const revB2 = await jvCount(S.ACC2!, K(rid, "COMMISSION_REFUNDED"));
    const revB1 = await jvCount(S.ACC1!, K(rid, "COMMISSION_REFUNDED"));
    const comB1 = await jvCount(S.ACC1!, K(s.id, "COMMISSION"));
    if (comB2 !== 0 || revB2 !== 0) p.push(`สมุด 2: COMMISSION ${comB2} · COMMISSION_REFUNDED ${revB2} (คาด 0 · 0 — ไม่โพสต์ข้ามสมุด)`);
    if (revB1 !== 0) p.push(`สมุด 1: COMMISSION_REFUNDED ${revB1} (คาด 0 — ลงมือในสมุดเก่าตาม W8)`);
    if (comB1 !== 1) p.push(`สมุด 1: COMMISSION ${comB1} (คาด 1 เดิม)`);
    const ev = await evOf(rid);
    if (ev.length !== 1 || ev[0]?.status !== "DONE") p.push(`${EV_REFUNDED} ${ev.length} · ${ev.map((e) => `${e.status}/${e.attempts}`).join(",")} ${short(ev[0]?.lastError ?? "", 60)} (คาด 1 · DONE)`);
    const jvB2 = ((await P.accountJournalEntry.findMany({ where: { tenantId: T, systemId: S.ACC2 }, select: { idempotencyKey: true } }).catch(() => [])) as Any[]).map((e) => String(e.idempotencyKey));
    console.log(`  (AC1 ข้อมูล) สมุด 2 JV: ${short(jvB2, 200)} · WARN ${w.length}`);
    chk("AC1", p.length === 0, "คืนหลังย้ายสมุด ⇒ WARN commission_other_book 1 · ไม่โพสต์ข้ามสมุด · คิว DONE", FX(P8(p) || "ครบ"));
  });
  await step("AC2", async () => {
    const p: string[] = [];
    if (fx || devFx) throw new Error(`fixture ${fx || devFx}`);
    const s = await lmSale("ac2");
    const rid = await refund(s, "ac2rf");
    await drain();
    const rev = await jvCount(S.ACC1!, K(rid, "COMMISSION_REFUNDED"));
    if (rev !== 1) p.push(`COMMISSION_REFUNDED ในสมุด 1 ${rev} (คาด 1)`);
    const w = await warnsOf(rid);
    if (w.length) p.push(`WARN ${OPS_KEY} ของใบคืนสมุดเดียวกัน ${w.length} (คาด 0)`);
    const ev = await evOf(rid);
    if (ev.length !== 1 || ev[0]?.status !== "DONE") p.push(`${EV_REFUNDED} ${ev.map((e) => `${e.status}/${e.attempts}`).join(",") || "ไม่มี"} (คาด DONE)`);
    chk("AC2", p.length === 0, "สมุดเดียวกัน ⇒ COMMISSION_REFUNDED 1 · ไม่มี WARN", FX(P8(p) || "ครบ"));
  });
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราว + ผู้ใช้ชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; err: string };
async function wipeTenant(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
  if (T) {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, T)) as Any[];
    if (t.length && t[0].slug !== T_SLUG) {
      rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
      return rep;
    }
    await drain();
    const tables = ((await P.$queryRawUnsafe(
      `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    )) as Any[]).map((r: Any) => String(r.t));
    rep.tables = tables.length;
    await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, T).catch(() => {});
    let pending = [...tables];
    for (let pass = 0; pass < 10 && pending.length; pass++) {
      const next: string[] = [];
      for (const tb of pending) {
        try {
          await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, T);
        } catch {
          next.push(tb);
        }
      }
      pending = next;
    }
    try {
      await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, T, T_SLUG);
    } catch (e) {
      rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
    }
    for (const tb of tables) {
      try {
        const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, T)) as Any[])[0]?.n ?? 0);
        if (n) rep.left[tb] = n;
      } catch {
        rep.left[tb] = -1;
      }
    }
    rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, T)) as Any[])[0]?.n ?? 0);
  }
  try {
    await P.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: "@qc.invalid" } } });
    rep.usersLeft = Number(await P.user.count({ where: { email: { startsWith: EMAIL_PREFIX } } }));
  } catch (e) {
    rep.err = [rep.err, `ลบผู้ใช้ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
  }
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
let rgLeft = "";
try {
  await runStatic();
  await runPure(blameMod);
  await runTooling();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  rgLeft = rmRg();
  installFetchGuard();
  try {
    wipe = await wipeTenant();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft + wipe.usersLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.usersLeft === 0 && !wipe.err && !rgLeft, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0 · โฟลเดอร์ RG ถูกลบ",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.usersLeft ? `ผู้ใช้เหลือ ${wipe.usersLeft}` : "ผู้ใช้ 0", wipe.err, rgLeft].filter(Boolean).join(" · "));
/** รอยของรอบนี้นอกร้านชั่วคราว (ตัวตัดสิน Z2 — ไม่ไวต่อ lane อื่นที่เขียนพร้อมกัน) */
async function leaksOutside(): Promise<string[]> {
  const out: string[] = [];
  const n = async (lbl: string, f: () => Promise<unknown>) => {
    try {
      const v = Number(await f());
      if (v) out.push(`${lbl}:${v}`);
    } catch (e) {
      out.push(`${lbl}:err ${(e as Error).message.slice(0, 40)}`);
    }
  };
  const since = new Date(RUN_START - MIN);
  const like = `%${RAND}%`;
  await n("posSale", () => P.posSale.count({ where: { idempotencyKey: { contains: KEY_PREFIX } } }));
  if (MY_SALES.length) await n("posSale.id", () => P.posSale.count({ where: { id: { in: MY_SALES.filter(Boolean) } } }));
  await n("posProduct", () => P.posProduct.count({ where: { name: { contains: RAND }, createdAt: { gte: since } } }));
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "createdAt" >= $1 AND (coalesce("after"::text,'') || coalesce("before"::text,'') || coalesce("targetId",'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" >= $1 AND ("payload"::text LIKE $2 OR "idempotencyKey" LIKE $2)`, since, like)) as Any[])[0]?.n);
  const ids = MY_SALES.filter(Boolean);
  if (ids.length)
    await n("opsEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE "createdAt" >= $1 AND (coalesce("message",'') || ' ' || coalesce("detail",'')) ~ $2`, since, ids.map((x) => x.replace(/[^A-Za-z0-9]/g, "")).join("|"))) as Any[])[0]?.n);
  await n("tenant", () => P.tenant.count({ where: { slug: { startsWith: T_SLUG } } }));
  return out;
}
const leaks = await leaksOutside();
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", leaks.length === 0, "ไม่มีรอยของรอบนี้นอกร้านชั่วคราว (ลายนิ้วมือ = ข้อมูล)",
  [leaks.length ? `หลุด ${leaks.join(", ")}` : "ไม่มีรอย", fpDrift.length ? `(ข้อมูล · lane อื่นอาจเขียน) ลายนิ้วมือต่าง ${fpDrift.join(", ")}` : `ลายนิ้วมือร้านอื่นเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
const parIds = CHECKS.filter(([, x]) => x === "PAR").map(([id]) => id);
const parRed = parIds.filter((id) => failed.includes(id));
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""} · PAR ${parIds.length - parRed.length}/${parIds.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, parRed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.usersLeft, leaks, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต HF-FU2: K QR-4 → P3 · P RPT-6 ทางเส้นทาง → P4 · Q overflow หน้า developers ของ kanban/account/member → เลนเจ้าของ · S D1c → P3 ·
//   T one-OPEN-shift → W7 · CD-F7 → W6 · D11 → P3 · ไฟล์ fixtures ของ acc-v2 → ACCOUNT (OP :262) · ภาพ (ผู้คุมถ่ายเฉพาะ state ที่ใบแตะ) ·
//   ORACLE-EDIT qc-pos-p2.14 P2 (:2238–2252) = ผู้สร้างเตรียมเป็น commit test(pos) ของตัวเอง (มติ 4) · re-pin หมุดเลนหลัง merge = ผู้คุม (มติ 3)
