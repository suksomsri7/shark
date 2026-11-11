// QC — POS RUN ใบ P1.9b: ผู้จัดการนับเงินย้อนหลังของกะที่ระบบบังคับปิด (Q9.4) · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.9b.md (มติร่าง R1–R14) · pos-brief-P1.9.md (S10/S12 · §R2 เลื่อน Q9.4 มาที่นี่) · pos-brief-COMMON · pos-brief-LANE-RULES
//        โน้ต: ledger/wo-notes/pos-P1.9b-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ชื่อที่ตั้งใหม่ · ความคลาดเคลื่อน)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ตหัวข้อ "Names" — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม
//   ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.9b ต้องส่ง (ย่อจาก brief §2):
//   schema: ตารางใหม่ PosShiftRecount (shiftId @unique · zNumber · expectedCashSatang · countedCashSatang · varianceSatang · countDetail? · note ·
//     recountedByUserId · idempotencyKey · @@unique [tenantId, idempotencyKey]) · PosShift ไม่เพิ่มคอลัมน์ · scope.ts ลงทะเบียน
//   shift.ts recountShift(ctx, actor, {shiftId, countedCashSatang, countDetail?, note, idempotencyKey}, client?) → {ok, recount, duplicated?}
//     เฉพาะ pos.shift.manage · เฉพาะกะ FORCE_CLOSED · 1 ครั้งต่อกะ · audit "pos.shift.recount" ในtx เดียวกัน · ไม่เขียนแถว PosShift (Z แช่แข็ง)
//   zReport/xReport ของกะที่ปิด = {ok, report (Z เดิมทุกไบต์), recount} · listShifts item.recount
//   รหัสใหม่: SHIFT_NOT_FORCED · ALREADY_RECOUNTED · shift-actions recountShiftAction · ShiftsClient ปุ่ม + กล่อง · ข้อความ th+en
//
// ขอบเขต: ST สถิต · RC นับย้อนหลัง · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.9): SKIP เมื่อของ P1.9b ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต (ST1–ST8) ไม่โหลด env/prisma (exit 1 ถ้าแดง)
//    ตาราง/คอลัมน์ตรวจจาก Prisma DMMF + information_schema (ไม่มี = SKIP/แดงพร้อมเหตุ ไม่ crash) · ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab (QC4) เท่านั้น
//    แถวชั่วคราวติดป้าย `qc-p1.9b-<rand>` อยู่ในร้าน QC กาแฟ (sandbox 2 สาขา 1 ระบบ POS) · ลบทั้งหมดใน finally
//    นับแถวร้าน QC ก่อน/หลังต้องเท่ากัน (Z1) + ลายนิ้วมือแถวเดิม (Z2) · การแข่งใช้ PrismaClient คนละตัว (connection จริงคนละเส้น)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.9b";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: "-" = เชิงหน้าที่ล้วน · X1 idempotency · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X6 แข่ง (POS-MASTER-PLAN §3)
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.9b-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต (ไม่แตะ DB) ──
  D("ST1", "-", "[static · R1] schema: model PosShiftRecount (คอลัมน์สัญญาครบ · shiftId @unique · @@unique [tenantId, idempotencyKey] · expected/counted/variance/note/zNumber ไม่ nullable · countDetail Json?)"),
  D("ST2", "-", "[static · R1] migration: CREATE TABLE \"PosShiftRecount\" · unique index (\"shiftId\") · ไม่ ALTER TABLE \"PosShift\" · ไม่มี DROP/RENAME/SET NOT NULL"),
  D("ST3", "-", "[static · R1] src/lib/core/scope.ts ลงทะเบียน PosShiftRecount (บรรทัดจริง ไม่ใช่คอมเมนต์ · F1 fail-closed)"),
  D("ST4", "-", "[static · R2 R3 R5 R14] shift.ts export recountShift · ShiftRefusalCode มี SHIFT_NOT_FORCED + ALREADY_RECOUNTED · MSG ไทยของทั้งสอง · recountShift เขียน auditLog \"pos.shift.recount\" · ไม่ update/upsert posShift · ไม่เรียก finalizeClose/bumpCounter/emitOutbox"),
  D("ST5", "-", "[static · R13] shift-actions.ts \"use server\" · export async ล้วน · ไม่ throw · recountShiftAction เรียก recountShift + catch"),
  D("ST6", "-", "[static · R13] ข้อความ pos.shift.recount.{title action counted variance note by at saved} + pos.register.errors.{shiftNotForced alreadyRecounted} th+en · en ไม่มีอักษรไทย · refusalMessageKey 2 รหัสใหม่ตรงคีย์"),
  D("ST7", "X1", "[static · R13] ShiftsClient: เรียก recountShiftAction · ปุ่มเฉพาะ FORCE_CLOSED + canManage · คีย์ recount เก็บใน state (useState(newKey)) ไม่ใช่ newKey() ในคำขอ · Z แสดง recount (counted/variance) · ใช้ t(\"recount.*\")"),
  D("ST8", "-", "[static · R1 R7 R14 · เขียวได้บนฐาน] PosShift คอลัมน์เท่าเดิม (ชุด P1.9 ไม่มี recount*) · ไม่มีสิทธิ์ใหม่ pos.shift.recount* · ไม่มี event pos.shift.recount* ใน outbox-consumers/labels"),
  // ── RC นับย้อนหลัง ──
  D("RC1", "X4", "นับย้อนหลังกะที่ถูกบังคับปิด (float ฿10 + ขายเงินสด ฿45 ⇒ ควรมี 5,500): เจ้าของนับได้ 5,000 + countDetail + เหตุผล → ok · แถว PosShiftRecount ร้าน/สาขา/ระบบ/shiftId/zNumber ถูก · expected 5,500 (= Z) · counted 5,000 · variance −500 · note · countDetail ตรงตัว · recountedBy · ผลคืน recount ตรงแถว"),
  D("RC2", "X4", "Z แช่แข็ง: แถว PosShift ทุกคอลัมน์ (รวม updatedAt/zReport/counted null/closeKey null) ก่อน = หลังนับ · zReport().report เดิมทุกไบต์ · PosShiftCounter ไม่ขยับ · ไม่มี event ใหม่ของกะ · บิล/การจ่าย/เงินเข้าออกของสาขาไม่เปลี่ยน"),
  D("RC3", "-", "audit: AuditLog action pos.shift.recount 1 แถวต่อการนับ · targetType PosShift · targetId shiftId · unitId · actorType USER · actorId ผู้นับ · before.status FORCE_CLOSED + expected · after.recountId/countedCashSatang/varianceSatang"),
  D("RC4", "-", "ทางอ่าน: zReport/xReport กะที่นับแล้ว = report เดิม + recount ข้างกัน (id/counted/variance/by/at) · ไม่ผสานเข้า report · listShifts item.recount ของกะนั้นไม่ null · กะปิดปกติ recount = null (มีคีย์)"),
  D("RC5", "-", "เฉพาะกะบังคับปิด: กะ OPEN → SHIFT_NOT_FORCED · กะปิดปกติ (CLOSED) → SHIFT_NOT_FORCED · ไม่มีแถวนับ ไม่มี audit · แถวกะไม่เปลี่ยน"),
  D("RC6", "X3", "สิทธิ์: operate อย่างเดียว (คนเปิดกะเอง) → PERMISSION_DENIED · ขายได้อย่างเดียว → PERMISSION_DENIED · ไม่มีแถว · STAFF ที่มี manage → ok · คนเปิดกะ (operate) อ่าน zReport กะตัวเองเห็น recount"),
  D("RC7", "X1", "กันซ้ำ: คีย์เดิม payload เดิม → ok duplicated แถวเดิม ไม่มีแถว/audit เพิ่ม · คีย์เดิม payload ต่าง → IDEMPOTENCY_CONFLICT · คีย์ใหม่กับกะที่นับแล้ว → ALREADY_RECOUNTED · แถวเดิมไม่เปลี่ยน · audit ยัง 1"),
  D("RC8", "X4", "ตรวจค่า: counted −1 / 1.5 / \"100\" / 2,000,000,001 · note ไม่ส่ง/ว่าง/ช่องว่าง/201 ตัว · countDetail รวมไม่เท่า/ธนบัตรไม่รู้จัก/จำนวนติดลบ · คีย์แปลก · ไม่มี idempotencyKey → VALIDATION · ไม่มีแถว ไม่มี audit"),
  D("RC9", "X2", "ข้ามขอบเขต: ctx สาขาอื่น (ระบบเดียวกัน) + กะสาขา 1 → NOT_FOUND · เจ้าของร้าน QC อาหาร + shiftId ร้านกาแฟ → NOT_FOUND · shiftId ที่ไม่มี → NOT_FOUND · ไม่มีแถว"),
  D("RC10", "X6", "แข่งนับ (คีย์ต่างกัน): 10 connection × 3 กะ → ok 1 · ALREADY_RECOUNTED 9 · ไม่มีรหัสอื่น · แถวนับ 1 · audit 1 · แถวที่ชนะตรงกับผล ok"),
  D("RC11", "X6", "แข่งนับ (คีย์เดียวกัน payload เดียวกัน): 6 connection → ok ทั้งหมด id เดียวกัน · ไม่ duplicated ไม่เกิน 1 · แถวนับ 1 · audit 1"),
  D("RC12", "-", "คำปฏิเสธของ recountShift (SHIFT_NOT_FORCED · ALREADY_RECOUNTED · PERMISSION_DENIED · VALIDATION · NOT_FOUND · IDEMPOTENCY_CONFLICT) = คืน {ok:false, code, message} ไม่ throw · ครบทุกรหัส · message ไม่ว่าง"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม PosShift/PosShiftRecount/AuditLog) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosShift · PosShiftCounter · PosShiftRecount) ทุกคอลัมน์ ก่อน = หลัง"),
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
  if (!TITLE.has(id)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(id, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${id}] ${TITLE.get(id)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : "UNKNOWN");
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1];
  return typeof o?.code === "string" && o.code ? o.code : "THROW";
}
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
/** JSON ที่เรียงคีย์ทุกชั้น (เทียบ Json ที่ DB อาจคืนลำดับคีย์ต่าง) */
const canon = (v: unknown): string => {
  const sort = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(sort) : x && typeof x === "object" && !(x instanceof Date) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, w]) => [k, sort(w)])) : x;
  return JSON.stringify(sort(v ?? null));
};

// ── ซอร์ส (สถิต) ──
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
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b`).test(src);
/** บล็อก `model X { … }` / `enum X { … }` จากข้อความ schema ทั้งหมด ("" = ไม่มี) */
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
/** บรรทัดฟิลด์ใน model block: `name Type…` */
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
/** ชื่อฟิลด์ทั้งหมดของ model block (ไม่รวม @@) */
const fieldNames = (block: string): string[] =>
  block
    .split("\n")
    .slice(1)
    .map((l) => /^\s*([A-Za-z_]\w*)\s+\S/.exec(l)?.[1] ?? "")
    .filter(Boolean);
/** เนื้อ `export async function name` จนถึง export ถัดไป ("" = ไม่มี) */
function fnBody(src: string, name: string): string {
  const at = src.search(new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`));
  if (at < 0) return "";
  return src.slice(at).split(/\n\s*export\s+/)[0] ?? "";
}
/** ตัวเรียกที่วงเล็บสมดุล: คืนข้อความตั้งแต่ `(` ตัวแรกหลัง at จนถึง `)` ที่ปิดมัน ("" = ไม่พบ) */
function balancedFrom(src: string, at: number): string {
  if (at < 0) return "";
  const open = src.indexOf("(", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return "";
}
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
      /* ไฟล์พัง = คีย์หาย (ST6 แดงเอง) */
    }
  }
  return keys;
}

const SHIFT_FILE = "src/lib/modules/pos/shift.ts";
const SHIFT_ACT_FILE = "src/lib/modules/pos/shift-actions.ts";
const SHIFTS_UI_FILE = "src/app/app/sys/[id]/pos/shifts/ShiftsClient.tsx";
/** ชุดคอลัมน์ PosShift ของ P1.9 (R1: P1.9b ห้ามเพิ่ม) */
const P19_SHIFT_COLS = [
  "id", "tenantId", "unitId", "systemId", "deviceId", "deviceLabel", "shiftNo", "status", "openedByUserId", "openedAt", "floatSatang", "floatDetail",
  "closedByUserId", "closedAt", "expectedCashSatang", "countedCashSatang", "overShortSatang", "countDetail", "countedByMethod", "closeNote", "closeKey",
  "zNumber", "zReport", "createdAt", "updatedAt",
] as const;
const REC_COLS = [
  "id", "tenantId", "unitId", "systemId", "shiftId", "zNumber", "expectedCashSatang", "countedCashSatang", "varianceSatang", "countDetail", "note",
  "recountedByUserId", "idempotencyKey", "createdAt",
] as const;
const REC_REQUIRED = ["zNumber", "expectedCashSatang", "countedCashSatang", "varianceSatang", "note", "recountedByUserId", "idempotencyKey", "shiftId"] as const;
const RECOUNT_MSG_KEYS = ["title", "action", "counted", "variance", "note", "by", "at", "saved"] as const;
const NEW_CODES: [string, string][] = [["SHIFT_NOT_FORCED", "errors.shiftNotForced"], ["ALREADY_RECOUNTED", "errors.alreadyRecounted"]];
const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
const shiftRaw = rd(SHIFT_FILE);
const shiftSrc = stripComments(shiftRaw);

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB · ST1–ST8) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const shiftB = prismaBlock(schemaSrc, "model", "PosShift");
  const recB = prismaBlock(schemaSrc, "model", "PosShiftRecount");

  // ST1 schema
  const s1: string[] = [];
  if (!recB) s1.push("ไม่มี model PosShiftRecount");
  else {
    const miss = REC_COLS.filter((c) => !fieldLine(recB, c));
    if (miss.length) s1.push(`PosShiftRecount ขาด ${miss.join(",")}`);
    if (!/@unique\b/.test(fieldLine(recB, "shiftId")) && !/@@unique\(\[\s*shiftId\s*\]/.test(recB)) s1.push("shiftId ไม่ @unique (1 ครั้งต่อกะ R6)");
    if (!/@@unique\(\[\s*tenantId\s*,\s*idempotencyKey\s*\]/.test(recB)) s1.push("ไม่มี @@unique([tenantId, idempotencyKey])");
    for (const f of REC_REQUIRED) {
      const l = fieldLine(recB, f);
      if (l && /\?/.test(l.split(/\s+/)[1] ?? "")) s1.push(`${f} ต้องไม่ nullable`);
    }
    const cd = fieldLine(recB, "countDetail");
    if (cd && !/^countDetail\s+Json\?/.test(cd)) s1.push(`countDetail ไม่ใช่ Json? (${cd.slice(0, 40)})`);
  }
  chk("P1.9b-ST1", s1.length === 0, "PosShiftRecount ครบ · shiftId unique · (tenantId, key) unique", s1.join(" · ") || "ครบ");

  // ST2 migration
  const s2: string[] = [];
  const migFiles = walk("prisma/migrations", [], /\.sql$/).filter((f) => /PosShiftRecount/.test(rd(f)));
  if (!migFiles.length) s2.push("ไม่มี migration ที่แตะ PosShiftRecount");
  const migAll = migFiles.map((f) => rd(f).replace(/--.*$/gm, "")).join("\n");
  if (migFiles.length && !/CREATE\s+TABLE\s+"PosShiftRecount"/i.test(migAll)) s2.push("ไม่มี CREATE TABLE \"PosShiftRecount\"");
  if (migFiles.length && !/CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+"PosShiftRecount"\s*\(\s*"shiftId"\s*\)/i.test(migAll)) s2.push("ไม่มี unique index (\"shiftId\")");
  for (const f of migFiles) {
    const t = rd(f).replace(/--.*$/gm, "");
    const name = f.split("/").slice(-2, -1)[0];
    if (/\bDROP\s+(TABLE|COLUMN|INDEX)\b|\bRENAME\b|SET\s+NOT\s+NULL/i.test(t)) s2.push(`${name}: มี DROP/RENAME/SET NOT NULL`);
    if (/ALTER\s+TABLE\s+"PosShift"\s/i.test(t)) s2.push(`${name}: ALTER TABLE "PosShift" (R1 ห้ามแตะ)`);
  }
  chk("P1.9b-ST2", s2.length === 0, "CREATE PosShiftRecount · unique shiftId · additive · ไม่แตะ PosShift", s2.join(" · ") || `ครบ (${migFiles.length} ไฟล์)`);

  // ST3 scope.ts — ตรวจทีละบรรทัด (ไม่ใช้ตัวตัดคอมเมนต์ที่กินท้ายไฟล์ · ดูโน้ต P1.9)
  const scopeLines = rd("src/lib/core/scope.ts").split("\n");
  const s3 = scopeLines.some((l) => /^\s*PosShiftRecount\s*:/.test(l));
  chk("P1.9b-ST3", s3, "PosShiftRecount: … ใน scope.ts", s3 ? "มี" : "ไม่มี");

  // ST4 shift.ts
  const s4: string[] = [];
  if (!exportsFn(shiftSrc, "recountShift")) s4.push("ไม่มี export recountShift");
  const codeType = /export\s+type\s+ShiftRefusalCode\s*=[\s\S]*?;/.exec(shiftSrc)?.[0] ?? "";
  for (const [c] of NEW_CODES) {
    if (!codeType.includes(`"${c}"`)) s4.push(`ShiftRefusalCode ไม่มี ${c}`);
    const mm = new RegExp(`\\b${c}\\s*:\\s*["'\`]([^"'\`]*)["'\`]`).exec(shiftSrc);
    if (!mm || !/[฀-๿]/.test(mm[1] ?? "")) s4.push(`MSG.${c} ไม่มีข้อความไทย`);
  }
  const body = fnBody(shiftSrc, "recountShift");
  if (body) {
    if (!/auditLog\.create\s*\(/.test(body)) s4.push("recountShift ไม่ auditLog.create");
    if (!/["']pos\.shift\.recount["']/.test(body)) s4.push("ไม่มี action \"pos.shift.recount\"");
    if (/posShift\.(update|updateMany|upsert|delete|deleteMany)\s*\(/.test(body) || /UPDATE\s+"PosShift"\s/i.test(body)) s4.push("recountShift เขียนแถว PosShift (Z ต้องแช่แข็ง)");
    if (/\b(finalizeClose|bumpCounter|emitOutbox)\s*\(/.test(body)) s4.push("recountShift เรียก finalizeClose/bumpCounter/emitOutbox");
    if (!/\.manage\b/.test(body)) s4.push("recountShift ไม่ตรวจ manage");
  }
  chk("P1.9b-ST4", s4.length === 0, "recountShift · 2 รหัส + MSG · audit · ไม่เขียน PosShift", s4.join(" · ") || "ครบ");

  // ST5 shift-actions
  const s5: string[] = [];
  const actRaw = rd(SHIFT_ACT_FILE);
  const actSrc = stripComments(actRaw);
  if (!actRaw) s5.push(`ไม่มี ${SHIFT_ACT_FILE}`);
  else {
    if (!/^\s*["']use server["']/.test(actRaw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""))) s5.push("ไม่มี \"use server\" บรรทัดแรก");
    const exps = [...actSrc.matchAll(/^\s*export\b[^\n]*/gm)].map((m) => m[0].trim());
    const nonFn = exps.filter((x) => !/^export\s+async\s+function\s+\w+/.test(x));
    if (nonFn.length) s5.push(`export ไม่ใช่ async function (${nonFn.slice(0, 2).join(" | ")})`);
    if (/\bthrow\b/.test(actSrc)) s5.push("มี throw");
    const ab = fnBody(actSrc, "recountShiftAction");
    if (!ab) s5.push("ไม่มี recountShiftAction");
    else {
      if (!/\brecountShift\s*\(/.test(ab)) s5.push("recountShiftAction ไม่เรียก recountShift");
      if (!/\bcatch\b/.test(ab)) s5.push("recountShiftAction ไม่มี catch");
    }
  }
  chk("P1.9b-ST5", s5.length === 0, "recountShiftAction ห่อ recountShift + catch · use server", s5.join(" · ") || "ครบ");

  // ST6 ข้อความ + refusalMessageKey
  const regShared = await tryImport("@/lib/modules/pos/register-shared");
  const th = posMessages("th");
  const en = posMessages("en");
  const thai = /[฀-๿]/;
  const s6: string[] = [];
  const keys = [...RECOUNT_MSG_KEYS.map((k) => `pos.shift.recount.${k}`), ...NEW_CODES.map(([, k]) => `pos.register.${k}`)];
  for (const k of keys) {
    const t = th.get(k);
    const e = en.get(k);
    if (typeof t !== "string" || !t.trim()) s6.push(`${k}: th ขาด`);
    if (typeof e !== "string" || !e.trim()) s6.push(`${k}: en ขาด`);
    else if (thai.test(e)) s6.push(`${k}: en มีอักษรไทย`);
  }
  for (const [code, key] of NEW_CODES) {
    const mk = callSync(regShared, "refusalMessageKey", code);
    if (mk !== key) s6.push(`refusalMessageKey(${code})=${short(mk, 40)}`);
  }
  chk("P1.9b-ST6", s6.length === 0, `${keys.length} คีย์ th+en · refusalMessageKey 2`, s6.slice(0, 8).join(" · ") + (s6.length > 8 ? ` …(+${s6.length - 8})` : "") || "ครบ");

  // ST7 UI
  const s7: string[] = [];
  const ui = stripComments(rd(SHIFTS_UI_FILE));
  if (!ui) s7.push(`ไม่มี ${SHIFTS_UI_FILE}`);
  else {
    const callTxt = balancedFrom(ui, ui.search(/recountShiftAction\s*\(/));
    if (!callTxt) s7.push("ไม่เรียก recountShiftAction");
    else {
      if (!/idempotencyKey/.test(callTxt)) s7.push("คำขอไม่มี idempotencyKey");
      if (/newKey\s*\(\s*\)/.test(callTxt)) s7.push("สร้างคีย์ใหม่ในคำขอ (ต้องเก็บใน state · F6)");
    }
    if (!/const\s*\[\s*\w*[Rr]ecount\w*Key\s*,\s*set\w+\s*\]\s*=\s*useState\(\s*newKey\s*\)/.test(ui)) s7.push("ไม่มี state คีย์ recount = useState(newKey)");
    if (!/FORCE_CLOSED[\s\S]{0,300}canManage|canManage[\s\S]{0,300}FORCE_CLOSED/.test(ui)) s7.push("ปุ่มไม่ผูก FORCE_CLOSED + canManage");
    if (!/\brecount\??\.(countedCashSatang|varianceSatang)\b/.test(ui)) s7.push("Z ไม่แสดง recount.counted/variance");
    if (!/\bt\(\s*["'`]recount\./.test(ui)) s7.push("ไม่ใช้ t(\"recount.*\")");
  }
  chk("P1.9b-ST7", s7.length === 0, "ปุ่ม + กล่อง + คีย์ใน state + Z แสดง recount", s7.join(" · ") || "ครบ");

  // ST8 ฐานเขียวได้: ไม่แตะ PosShift · ไม่มีสิทธิ์/event ใหม่
  const s8: string[] = [];
  if (!shiftB) s8.push("ไม่มี model PosShift (P1.9 หาย?)");
  else {
    const names = fieldNames(shiftB);
    const extra = names.filter((n) => !(P19_SHIFT_COLS as readonly string[]).includes(n));
    const gone = P19_SHIFT_COLS.filter((n) => !names.includes(n));
    if (extra.length) s8.push(`PosShift มีคอลัมน์เพิ่ม ${extra.join(",")}`);
    if (gone.length) s8.push(`PosShift คอลัมน์หาย ${gone.join(",")}`);
  }
  const permSrc = stripComments(rd("src/lib/core/permissions.ts"));
  if (/["']pos\.shift\.recount\w*["']/.test(permSrc)) s8.push("มีสิทธิ์ใหม่ pos.shift.recount* (R7 ใช้ manage)");
  const obSrc = stripComments(rd("src/lib/outbox-consumers.ts"));
  const lbSrc = stripComments(rd("src/lib/automation/labels.ts"));
  if (/["']pos\.shift\.recount\w*["']/.test(obSrc) || /["']pos\.shift\.recount\w*["']/.test(lbSrc)) s8.push("มี event pos.shift.recount* (R14 ไม่มี event)");
  chk("P1.9b-ST8", s8.length === 0, "PosShift เท่าเดิม · ไม่มีสิทธิ์/event ใหม่", s8.join(" · ") || "ถูก");
}
const STATIC_IDS = ["P1.9b-ST1", "P1.9b-ST2", "P1.9b-ST3", "P1.9b-ST4", "P1.9b-ST5", "P1.9b-ST6", "P1.9b-ST7", "P1.9b-ST8"];

const skipReasons: string[] = [];
if (!exportsFn(shiftSrc, "recountShift")) skipReasons.push(`${SHIFT_FILE} ยังไม่มี export recountShift`);

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อสถิต (ไม่ผ่านด่าน SKIP · ข้ออื่นต้องใช้ DB)`);
  if (skipReasons.length) console.log(`   (ของ P1.9b ที่ยังขาด: ${skipReasons.join(" · ")})`);
  let crashedS = "";
  try {
    await runStatic();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;
const TIDS = envMod.PQC_TENANT_IDS as string[];
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP (ตาราง/คอลัมน์ + ของ P1.9b) ═════════════════════════
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const prismaPkg = (await import("@prisma/client")) as Any;
const DMMF = ((prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma)?.dmmf?.datamodel ?? { models: [], enums: [] }) as { models: { name: string; fields: { name: string }[] }[] };
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosShift','PosShiftRecount','PosSale')`,
  )) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const clientHas = (model: string, field: string) => (DMMF.models.length ? !!DMMF.models.find((m) => m.name === model)?.fields.some((f) => f.name === field) : dbCols.has(`${model}.${field}`));
const hasField = (model: string, field: string) => clientHas(model, field) && dbCols.has(`${model}.${field}`);
const PS: Any = typeof P.posShift?.findMany === "function" ? P.posShift : null;
const PC: Any = typeof P.posShiftCounter?.findMany === "function" ? P.posShiftCounter : null;
const PR: Any = typeof P.posShiftRecount?.findMany === "function" ? P.posShiftRecount : null;
if (!PS) skipReasons.push("Prisma client ไม่มี delegate posShift (P1.9 ต้องมีก่อน)");
if (!hasField("PosSale", "shiftId")) skipReasons.push("PosSale.shiftId ไม่มี (P1.9 ต้องมีก่อน)");
if (!PR) skipReasons.push("Prisma client ยังไม่มี delegate posShiftRecount (R1)");
const missRec = REC_COLS.filter((c) => !hasField("PosShiftRecount", c));
if (missRec.length) skipReasons.push(`ตาราง PosShiftRecount ขาดคอลัมน์ (client/DB): ${missRec.join(",")}`);

let scope: Any = null;
let restoScope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed บน DB นี้ — รัน scripts/seed-pos-qc.mts ก่อน");
if (!restoScope) skipReasons.push("ชุดข้อมูล QC POS (ร้านอาหาร) ยังไม่ถูก seed — ข้อ RC9 ต้องใช้");

const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posReceiptCounter", "outboxEvent", "appSystem", "appSystemUnit", "businessUnit", "auditLog",
  "posShift", "posCashMovement", "posShiftCounter", "posShiftRecount", "couponRedemption", "pointLedger",
] as const;
const FP_MODELS = ["appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter", "posShift", "posShiftCounter", "posShiftRecount"] as const;
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

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.9b ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ร้านกาแฟ ${scope ? "มี" : "ไม่มี"} · seed ร้านอาหาร ${restoScope ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`   A5 (อ่านอย่างเดียว) จำนวนแถวร้าน QC POS: ${JSON.stringify(countsBefore)}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: { coffee: !!scope, resto: !!restoScope }, a5: countsBefore })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const shiftMod = existsSync(join(ROOT, SHIFT_FILE)) ? await tryImport("@/lib/modules/pos/shift") : null;
const svc = await tryImport("@/lib/modules/pos/service");
const sysSvc = await tryImport("@/lib/modules/system/service");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.9b-${RAND}`;
const runStart = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HOUR = 3_600_000;

// ═════════════════════════ 5. ข้อที่ต้องมี DB (sandbox) ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.9b-Z1" && id !== "P1.9b-Z2");
const sb = { unitIds: [] as string[], systemIds: [] as string[], shiftIds: new Set<string>() };
const lanes: Any[] = [];
async function lane(i: number): Promise<Any> {
  if (lanes[i]) return lanes[i];
  const { PrismaClient } = (await import("@prisma/client")) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
  while (lanes.length <= i) lanes.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
  return lanes[i];
}
const shiftRow = async (id: string | null | undefined): Promise<Any> => (PS && id ? PS.findUnique({ where: { id } }).catch(() => null) : null);
const recRows = async (shiftId: string): Promise<Any[]> => (PR && shiftId ? ((await PR.findMany({ where: { shiftId } }).catch(() => [])) as Any[]) : []);
const audits = async (shiftId: string): Promise<Any[]> =>
  shiftId ? ((await P.auditLog.findMany({ where: { action: "pos.shift.recount", targetId: shiftId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : [];
const shiftEvents = async (shiftId: string): Promise<number> => (shiftId ? P.outboxEvent.count({ where: { idempotencyKey: { contains: shiftId } } }).catch(() => -1) : -1);

async function runDb() {
  if (!scope) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  const tid: string = scope.tenantId;
  const restoTid: string = PQC.resto.tenantId;
  const mOwner = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.owner.userId } });
  const mCash = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.cashier.userId } });
  const mROwner = await P.membership.findFirst({ where: { tenantId: restoTid, userId: PQC.resto.users.owner.userId } });
  const actor = (m: Any, userId: string, fallbackRole: string, over: Partial<Any> = {}) => ({
    userId,
    role: m?.role ?? fallbackRole,
    unitAccess: Array.isArray(m?.unitAccess) ? m.unitAccess : [],
    permissions: (m?.permissions ?? {}) as Record<string, unknown>,
    ...over,
  });
  const owner = actor(mOwner, PQC.coffee.users.owner.userId, "OWNER");
  const restoOwner = actor(mROwner, PQC.resto.users.owner.userId, "OWNER");
  const ctxR = { tenantId: restoTid, systemId: PQC.resto.systems.POS.id, unitId: PQC.resto.units.main.id };

  // ─── sandbox (เขียนแถวแรก ⇒ ด่าน host QC4 ก่อน) ───
  assertQc4BeforeWrite();
  console.log(`\n── sandbox ${TAG} (2 สาขา + 1 ระบบ POS ชั่วคราวในร้าน QC กาแฟ) ──`);
  let fx = "";
  let u1 = "", u2 = "", posS = "";
  try {
    for (const label of ["u1", "u2"]) {
      const u = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} ${label}`, slug: `${TAG}-${label}` } });
      sb.unitIds.push(u.id);
    }
    [u1, u2] = sb.unitIds as [string, string];
    // settings {} = ไม่ใช่ registerV2 ⇒ ไม่บังคับกะที่หน้าขาย · บิลผูกกะด้วย createSale(shiftId) ตรง ๆ
    const s = await P.appSystem.create({ data: { tenantId: tid, type: "POS", name: `${TAG} POS`, settings: {} } });
    sb.systemIds.push(s.id);
    posS = s.id;
    await sysSvc.linkUnit(tid, posS, u1);
    await sysSvc.linkUnit(tid, posS, u2);
  } catch (e) {
    fx = `sandbox:${(e as Error).message.slice(0, 120)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;

  // ─── ผู้กระทำ ───
  const units = [u1, u2].filter(Boolean);
  const cashOp = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: units, permissions: { "pos.sale.create": true, "pos.shift.operate": true } });
  const cashMgr = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: units, permissions: { "pos.sale.create": true, "pos.shift.operate": true, "pos.shift.manage": true } });
  const sellOnly = actor(mCash, PQC.coffee.users.cashier.userId, "STAFF", { unitAccess: units, permissions: { "pos.sale.create": true } });
  const ctx = (unitId: string): Any => ({ tenantId: tid, systemId: posS, unitId });
  const dev = (n: string) => `qc19b-${RAND}-${n}`;
  let keyN = 0;
  const newKey = () => `p19b-${RAND}-${++keyN}`;

  // ─── ทางเรียก ───
  const dataRefusals: Any[] = [];
  const recount = async (c: Any, a: Any, input: Any, cl?: Any): Promise<Any> => {
    const r = cl ? await call(shiftMod, "recountShift", c, a, input, cl) : await call(shiftMod, "recountShift", c, a, input);
    if (r?.ok === false) dataRefusals.push(r);
    return r;
  };
  const open = async (c: Any, a: Any, input: Any): Promise<string> => {
    const r = await call(shiftMod, "openShift", c, a, input);
    const id = r?.ok === true && typeof r.shift?.id === "string" ? r.shift.id : "";
    if (id) sb.shiftIds.add(id);
    return id;
  };
  /** บิลเงินสดแบบผู้เรียกเดิม ผูกกะด้วย shiftId */
  const cashSale = async (unitId: string, shiftId: string, amount: number): Promise<string> => {
    const r = await call(svc, "createSale", {
      tenantId: tid, unitId, systemId: posS, sourceModule: "HOTEL", idempotencyKey: `${TAG}-cs-${++keyN}`, shiftId,
      lines: [{ name: "ค่าบริการ QC P1.9b", qty: 1, unitPriceSatang: amount }], payMethods: [{ type: "CASH", amountSatang: amount }],
    });
    return typeof r?.saleId === "string" ? r.saleId : "";
  };
  /** กะที่ระบบบังคับปิด: เปิด (float ฿10) → [ขายเงินสด] → ถอย openedAt 25 ชม. → currentShift ของเครื่อง (ขี้เกียจปิด S12) */
  const forcedShift = async (label: string, opener: Any, sale = 0): Promise<{ id: string; err: string }> => {
    if (fx) return { id: "", err: fx };
    const d = dev(label);
    const id = await open(ctx(u1), opener, { deviceId: d, floatSatang: 1000 });
    if (!id) return { id: "", err: `เปิดกะ ${label} ไม่ได้` };
    if (sale > 0 && !(await cashSale(u1, id, sale))) return { id, err: `ขายในกะ ${label} ไม่ได้` };
    try {
      await PS.update({ where: { id }, data: { openedAt: new Date(Date.now() - 25 * HOUR) } });
    } catch (e) {
      return { id, err: `ถอยเวลาไม่ได้: ${(e as Error).message.slice(0, 60)}` };
    }
    await call(shiftMod, "currentShift", ctx(u1), owner, { deviceId: d });
    const row = await shiftRow(id);
    return { id, err: row?.status === "FORCE_CLOSED" ? "" : `กะ ${label} ไม่ถูกบังคับปิด (${row?.status})` };
  };

  // ════════ ชุดกะ ════════
  const fA = await forcedShift("a", owner, 4500); // RC1–RC4 RC7 · ควรมี 1,000 + 4,500 = 5,500
  const fB = await forcedShift("b", cashOp); // RC6 · คนเปิด = แคชเชียร์ operate
  const fV = await forcedShift("v", owner); // RC8 RC9 · ไม่ถูกนับจนจบ
  const SA = fA.id, SB = fB.id, SV = fV.id;
  const fixErr = [fA.err, fB.err, fV.err].filter(Boolean).join(" · ");
  const FX2 = (s: string) => FX((fixErr ? `fixture:${fixErr} · ` : "") + s);

  // ════════ RC8 ตรวจค่า (ก่อนนับจริง) ════════
  {
    const p: string[] = [];
    const baseIn = { shiftId: SV, countedCashSatang: 1000, note: "นับย้อนหลัง", idempotencyKey: newKey() };
    const bads: [string, Any][] = [
      ["counted −1", { ...baseIn, countedCashSatang: -1 }],
      ["counted 1.5", { ...baseIn, countedCashSatang: 1.5 }],
      ["counted \"100\"", { ...baseIn, countedCashSatang: "100" }],
      ["counted เกินเพดาน", { ...baseIn, countedCashSatang: 2_000_000_001 }],
      ["note ไม่ส่ง", { shiftId: SV, countedCashSatang: 1000, idempotencyKey: newKey() }],
      ["note ว่าง", { ...baseIn, note: "" }],
      ["note ช่องว่าง", { ...baseIn, note: "   " }],
      ["note 201", { ...baseIn, note: "ก".repeat(201) }],
      ["countDetail รวมไม่เท่า", { ...baseIn, countDetail: { "500": 1 } }],
      ["countDetail ธนบัตรไม่รู้จัก", { ...baseIn, countedCashSatang: 30000, countDetail: { "30000": 1 } }],
      ["countDetail ติดลบ", { ...baseIn, countDetail: { "1000": -1 } }],
      ["คีย์แปลก", { ...baseIn, foo: 1 }],
      ["ไม่มีคีย์กันซ้ำ", { shiftId: SV, countedCashSatang: 1000, note: "x" }],
      ["คีย์กันซ้ำว่าง", { ...baseIn, idempotencyKey: "" }],
    ];
    for (const [label, input] of bads) {
      const r = await recount(ctx(u1), owner, input);
      if (!(r?.ok === false && r.code === "VALIDATION" && !r.threw)) p.push(`${label}: ${codeOf(r)}`);
    }
    if (!SV) p.push("ไม่มีกะทดสอบ");
    else {
      if ((await recRows(SV)).length) p.push("มีแถวนับเกิด");
      if ((await audits(SV)).length) p.push("มี audit เกิด");
    }
    chk("P1.9b-RC8", p.length === 0, `${bads.length} แบบ → VALIDATION · ไม่มีแถว`, FX2(p.slice(0, 6).join(" · ") + (p.length > 6 ? ` …(+${p.length - 6})` : "") || "ครบ"));
  }

  // ════════ RC9 ข้ามขอบเขต ════════
  {
    const p: string[] = [];
    const inp = () => ({ shiftId: SV, countedCashSatang: 1000, note: "ข้ามขอบเขต", idempotencyKey: newKey() });
    const r1 = await recount(ctx(u2), owner, inp());
    if (!(r1?.ok === false && r1.code === "NOT_FOUND")) p.push(`สาขาอื่น ${codeOf(r1)}`);
    const r2 = await recount(ctxR, restoOwner, inp());
    if (!(r2?.ok === false && r2.code === "NOT_FOUND")) p.push(`ร้านอื่น ${codeOf(r2)}`);
    const r3 = await recount(ctx(u1), owner, { ...inp(), shiftId: `${TAG}-nope` });
    if (!(r3?.ok === false && r3.code === "NOT_FOUND")) p.push(`ไม่มีกะ ${codeOf(r3)}`);
    if (SV && (await recRows(SV)).length) p.push("มีแถวนับเกิด");
    chk("P1.9b-RC9", p.length === 0, "NOT_FOUND ×3 · ไม่มีแถว", FX2(p.join(" · ") || "ครบ"));
  }

  // ════════ RC1 นับย้อนหลังสำเร็จ + RC2 Z แช่แข็ง ════════
  const K1 = newKey();
  const IN1 = { shiftId: SA, countedCashSatang: 5000, countDetail: { "1000": 5 }, note: "ผู้จัดการนับย้อนหลัง QC", idempotencyKey: K1 };
  const preRow = await shiftRow(SA);
  const preZ = SA ? await call(shiftMod, "zReport", ctx(u1), owner, { shiftId: SA }) : null;
  const preCtr = PC ? await PC.findFirst({ where: { unitId: u1 } }).catch(() => null) : null;
  const preEv = await shiftEvents(SA);
  const preSales = u1 ? await P.posSale.count({ where: { unitId: u1 } }).catch(() => -1) : -1;
  const prePays = u1 ? await P.posPayment.count({ where: { sale: { unitId: u1 } } }).catch(() => -1) : -1;
  const preMoves = u1 && typeof P.posCashMovement?.count === "function" ? await P.posCashMovement.count({ where: { unitId: u1 } }).catch(() => -1) : -1;
  const r1 = await recount(ctx(u1), owner, IN1);
  const rowA = (await recRows(SA))[0] ?? null;
  {
    const p: string[] = [];
    if (r1?.ok !== true) p.push(`recount ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
    if (preRow && preRow.expectedCashSatang !== 5500) p.push(`fixture expected ${preRow.expectedCashSatang} ≠ 5,500`);
    if (!rowA) p.push("ไม่มีแถว PosShiftRecount");
    else {
      if (rowA.tenantId !== tid || rowA.unitId !== u1 || rowA.systemId !== posS || rowA.shiftId !== SA) p.push("ร้าน/สาขา/ระบบ/กะ ผิด");
      if (rowA.zNumber !== preRow?.zNumber || !Number.isInteger(rowA.zNumber)) p.push(`zNumber ${rowA.zNumber} ≠ ${preRow?.zNumber}`);
      if (rowA.expectedCashSatang !== 5500) p.push(`expected ${rowA.expectedCashSatang}`);
      if (rowA.countedCashSatang !== 5000) p.push(`counted ${rowA.countedCashSatang}`);
      if (rowA.varianceSatang !== -500) p.push(`variance ${rowA.varianceSatang}`);
      if (rowA.note !== IN1.note) p.push(`note ${short(rowA.note, 30)}`);
      if (canon(rowA.countDetail) !== canon(IN1.countDetail)) p.push(`countDetail ${short(rowA.countDetail, 40)}`);
      if (rowA.recountedByUserId !== owner.userId) p.push(`by ${rowA.recountedByUserId}`);
      if (rowA.idempotencyKey !== K1) p.push("idempotencyKey");
    }
    const v = r1?.ok === true ? r1.recount : null;
    if (r1?.ok === true) {
      if (!v || v.id !== rowA?.id || v.shiftId !== SA || v.varianceSatang !== -500 || v.expectedCashSatang !== 5500 || v.countedCashSatang !== 5000) p.push(`ผลคืน ${short(v, 120)}`);
      if (v && (typeof v.recountedAt !== "string" || Number.isNaN(Date.parse(v.recountedAt)))) p.push("recountedAt ไม่ใช่ ISO");
      if (r1.duplicated) p.push("ครั้งแรก duplicated");
    }
    chk("P1.9b-RC1", p.length === 0, "ok · แถวครบ · expected 5,500 · counted 5,000 · variance −500", FX2(p.join(" · ") || "ครบ"));
  }
  {
    const p: string[] = [];
    if (r1?.ok !== true) p.push(`ยังนับไม่ได้ (${codeOf(r1)}) — ตรวจการแช่แข็งหลังนับไม่ได้`);
    const postRow = await shiftRow(SA);
    if (!preRow || !postRow) p.push("ไม่มีแถวกะ");
    else {
      const diff = Object.keys(preRow).filter((k) => canon(preRow[k]) !== canon(postRow[k]));
      if (diff.length) p.push(`แถว PosShift เปลี่ยน: ${diff.join(",")}`);
      if (postRow.countedCashSatang !== null || postRow.closeKey !== null || postRow.status !== "FORCE_CLOSED") p.push("counted/closeKey/status ถูกแก้");
    }
    const postZ = SA ? await call(shiftMod, "zReport", ctx(u1), owner, { shiftId: SA }) : null;
    if (!(preZ?.ok === true && postZ?.ok === true)) p.push(`zReport ${codeOf(preZ)}→${codeOf(postZ)}`);
    else if (JSON.stringify(preZ.report) !== JSON.stringify(postZ.report)) p.push("Z report เปลี่ยน");
    const postCtr = PC ? await PC.findFirst({ where: { unitId: u1 } }).catch(() => null) : null;
    if (canon(preCtr) !== canon(postCtr)) p.push(`PosShiftCounter ${short(preCtr?.zSeq)}→${short(postCtr?.zSeq)}`);
    const postEv = await shiftEvents(SA);
    if (postEv !== preEv) p.push(`event ของกะ ${preEv}→${postEv}`);
    const postSales = await P.posSale.count({ where: { unitId: u1 } }).catch(() => -2);
    const postPays = await P.posPayment.count({ where: { sale: { unitId: u1 } } }).catch(() => -2);
    const postMoves = typeof P.posCashMovement?.count === "function" ? await P.posCashMovement.count({ where: { unitId: u1 } }).catch(() => -2) : -1;
    if (postSales !== preSales || postPays !== prePays || postMoves !== preMoves) p.push(`บิล/จ่าย/เงินเข้าออก ${preSales}/${prePays}/${preMoves}→${postSales}/${postPays}/${postMoves}`);
    chk("P1.9b-RC2", p.length === 0, "แถวกะ · Z · ตัวนับ · event · บิล เท่าเดิม", FX2(p.join(" · ") || "ครบ"));
  }

  // ════════ RC3 audit ════════
  {
    const p: string[] = [];
    const a = await audits(SA);
    if (a.length !== 1) p.push(`audit ${a.length} แถว`);
    const x = a[0];
    if (x) {
      if (x.tenantId !== tid || x.unitId !== u1) p.push("ร้าน/สาขา ผิด");
      if (x.actorType !== "USER" || x.actorId !== owner.userId) p.push(`actor ${x.actorType}/${x.actorId}`);
      if (x.targetType !== "PosShift") p.push(`targetType ${x.targetType}`);
      if (x.before?.status !== "FORCE_CLOSED" || x.before?.expectedCashSatang !== 5500) p.push(`before ${short(x.before, 80)}`);
      if (x.after?.recountId !== rowA?.id || x.after?.countedCashSatang !== 5000 || x.after?.varianceSatang !== -500) p.push(`after ${short(x.after, 100)}`);
    }
    chk("P1.9b-RC3", p.length === 0, "audit 1 แถว ครบฟิลด์", FX2(p.join(" · ") || "ครบ"));
  }

  // ════════ RC5 เฉพาะกะบังคับปิด ════════
  let SC = "";
  {
    const p: string[] = [];
    const SO = fx ? "" : await open(ctx(u1), owner, { deviceId: dev("o"), floatSatang: 0 });
    SC = fx ? "" : await open(ctx(u1), owner, { deviceId: dev("c"), floatSatang: 1000 });
    const c = SC ? await call(shiftMod, "closeShift", ctx(u1), owner, { shiftId: SC, countedCashSatang: 1000, idempotencyKey: newKey() }) : null;
    if (!SO || !SC || c?.ok !== true) p.push(`fixture เปิด/ปิด ${SO ? "o" : "-"} ${SC ? "c" : "-"} ${codeOf(c)}`);
    const preO = await shiftRow(SO);
    const preC = await shiftRow(SC);
    const ro = await recount(ctx(u1), owner, { shiftId: SO, countedCashSatang: 0, note: "กะยังเปิด", idempotencyKey: newKey() });
    const rc = await recount(ctx(u1), owner, { shiftId: SC, countedCashSatang: 900, note: "กะปิดปกติ", idempotencyKey: newKey() });
    if (!(ro?.ok === false && ro.code === "SHIFT_NOT_FORCED")) p.push(`OPEN ${codeOf(ro)}`);
    if (!(rc?.ok === false && rc.code === "SHIFT_NOT_FORCED")) p.push(`CLOSED ${codeOf(rc)}`);
    for (const id of [SO, SC]) {
      if (id && (await recRows(id)).length) p.push("มีแถวนับเกิด");
      if (id && (await audits(id)).length) p.push("มี audit เกิด");
    }
    if (canon(preO) !== canon(await shiftRow(SO)) || canon(preC) !== canon(await shiftRow(SC))) p.push("แถวกะเปลี่ยน");
    // ปิดกะ OPEN ที่เหลือ (ไม่ทิ้งกะเปิดไว้)
    if (SO) await call(shiftMod, "closeShift", ctx(u1), owner, { shiftId: SO, countedCashSatang: 0, idempotencyKey: newKey() });
    chk("P1.9b-RC5", p.length === 0, "OPEN/CLOSED → SHIFT_NOT_FORCED · ไม่มีแถว", FX2(p.join(" · ") || "ครบ"));
  }

  // ════════ RC4 ทางอ่าน ════════
  {
    const p: string[] = [];
    const z = SA ? await call(shiftMod, "zReport", ctx(u1), owner, { shiftId: SA }) : null;
    const x = SA ? await call(shiftMod, "xReport", ctx(u1), owner, { shiftId: SA }) : null;
    for (const [n, r] of [["zReport", z], ["xReport", x]] as [string, Any][]) {
      if (r?.ok !== true) {
        p.push(`${n} ${codeOf(r)}`);
        continue;
      }
      const rc = r.recount;
      if (!rc || rc.id !== rowA?.id || rc.countedCashSatang !== 5000 || rc.varianceSatang !== -500 || rc.recountedByUserId !== owner.userId || typeof rc.recountedAt !== "string") p.push(`${n}.recount ${short(rc, 100)}`);
      if (preZ?.ok === true && JSON.stringify(r.report) !== JSON.stringify(preZ.report)) p.push(`${n}.report ไม่ใช่ Z เดิม`);
      if (r.report && ("recount" in r.report || r.report.countedCashSatang !== null)) p.push(`${n}: recount ถูกผสานเข้า report`);
    }
    const l = await call(shiftMod, "listShifts", ctx(u1), owner, { limit: 50 });
    if (l?.ok !== true) p.push(`listShifts ${codeOf(l)}`);
    else {
      const ia = (l.items as Any[]).find((i) => i.id === SA);
      const ic = (l.items as Any[]).find((i) => i.id === SC);
      if (!ia?.recount || ia.recount.countedCashSatang !== 5000 || ia.recount.varianceSatang !== -500) p.push(`list SA.recount ${short(ia?.recount, 60)}`);
      if (!ic || !("recount" in ic) || ic.recount !== null) p.push(`list SC.recount ${short(ic?.recount, 40)}`);
    }
    const zc = SC ? await call(shiftMod, "zReport", ctx(u1), owner, { shiftId: SC }) : null;
    if (!(zc?.ok === true && "recount" in zc && zc.recount === null)) p.push(`zReport กะปิดปกติ recount ${codeOf(zc)} ${short(zc?.recount, 30)}`);
    chk("P1.9b-RC4", p.length === 0, "Z/X = report เดิม + recount ข้างกัน · list item.recount · ปกติ null", FX2(p.join(" · ") || "ครบ"));
  }

  // ════════ RC6 สิทธิ์ ════════
  {
    const p: string[] = [];
    const inp = (n: string) => ({ shiftId: SB, countedCashSatang: 900, note: `สิทธิ์ ${n}`, idempotencyKey: newKey() });
    const ro = await recount(ctx(u1), cashOp, inp("operate"));
    if (!(ro?.ok === false && ro.code === "PERMISSION_DENIED")) p.push(`operate (คนเปิด) ${codeOf(ro)}`);
    const rs = await recount(ctx(u1), sellOnly, inp("sale"));
    if (!(rs?.ok === false && rs.code === "PERMISSION_DENIED")) p.push(`sale.create ${codeOf(rs)}`);
    if (SB && (await recRows(SB)).length) p.push("ถูกปฏิเสธแต่มีแถว");
    if (SB && (await audits(SB)).length) p.push("ถูกปฏิเสธแต่มี audit");
    const rm = await recount(ctx(u1), cashMgr, inp("manage"));
    if (rm?.ok !== true) p.push(`STAFF manage ${codeOf(rm)}`);
    const row = (await recRows(SB))[0];
    if (rm?.ok === true && (!row || row.recountedByUserId !== cashMgr.userId || row.varianceSatang !== -100)) p.push(`แถว ${short(row, 80)}`);
    const zo = SB ? await call(shiftMod, "zReport", ctx(u1), cashOp, { shiftId: SB }) : null;
    if (!(zo?.ok === true && zo.recount?.id === row?.id && row)) p.push(`คนเปิดอ่าน Z ${codeOf(zo)} recount ${short(zo?.recount?.id, 20)}`);
    chk("P1.9b-RC6", p.length === 0, "operate/sale → DENIED · manage ok · คนเปิดเห็น recount", FX2(p.join(" · ") || "ครบ"));
  }

  // ════════ RC7 กันซ้ำ ════════
  {
    const p: string[] = [];
    const d1 = await recount(ctx(u1), owner, { ...IN1 });
    if (!(d1?.ok === true && d1.duplicated === true && d1.recount?.id === rowA?.id && rowA)) p.push(`คีย์เดิม payload เดิม ${codeOf(d1)} dup ${short(d1?.duplicated, 10)}`);
    const d2 = await recount(ctx(u1), owner, { ...IN1, countedCashSatang: 5100, countDetail: null });
    if (!(d2?.ok === false && d2.code === "IDEMPOTENCY_CONFLICT")) p.push(`คีย์เดิม payload ต่าง ${codeOf(d2)}`);
    const d3 = await recount(ctx(u1), owner, { ...IN1, idempotencyKey: newKey(), countedCashSatang: 5200, countDetail: null });
    if (!(d3?.ok === false && d3.code === "ALREADY_RECOUNTED")) p.push(`คีย์ใหม่ ${codeOf(d3)}`);
    const rows = await recRows(SA);
    if (rows.length !== 1) p.push(`แถวนับ ${rows.length}`);
    else if (canon(rows[0]) !== canon(rowA)) p.push("แถวนับเปลี่ยน");
    const a = await audits(SA);
    if (a.length !== 1) p.push(`audit ${a.length}`);
    chk("P1.9b-RC7", p.length === 0, "duplicated · CONFLICT · ALREADY_RECOUNTED · 1 แถว 1 audit", FX2(p.join(" · ") || "ครบ"));
  }

  // ════════ RC10 แข่งนับ คีย์ต่างกัน ════════
  {
    const p: string[] = [];
    for (let round = 0; round < 3; round++) {
      const f = await forcedShift(`r${round}`, owner);
      if (!f.id || f.err) {
        p.push(`รอบ ${round + 1}: ${f.err}`);
        continue;
      }
      const cls = await Promise.all(Array.from({ length: 10 }, (_, i) => lane(i)));
      const rs = await Promise.all(cls.map((cl, i) => recount(ctx(u1), owner, { shiftId: f.id, countedCashSatang: 1000 + i, note: `แข่ง ${i}`, idempotencyKey: newKey() }, cl)));
      const codes = rs.map(codeOf);
      const okN = codes.filter((c) => c === "OK").length;
      const arN = codes.filter((c) => c === "ALREADY_RECOUNTED").length;
      if (okN !== 1 || arN !== 9) p.push(`รอบ ${round + 1}: ${[...new Set(codes)].map((c) => `${c}×${codes.filter((x) => x === c).length}`).join(" ")}`);
      const rows = await recRows(f.id);
      if (rows.length !== 1) p.push(`รอบ ${round + 1}: แถว ${rows.length}`);
      const win = rs.find((r) => r?.ok === true);
      if (win && rows[0] && (win.recount?.id !== rows[0].id || win.recount?.countedCashSatang !== rows[0].countedCashSatang)) p.push(`รอบ ${round + 1}: ผู้ชนะไม่ตรงแถว`);
      const a = await audits(f.id);
      if (a.length !== 1) p.push(`รอบ ${round + 1}: audit ${a.length}`);
    }
    chk("P1.9b-RC10", p.length === 0, "ok 1 · ALREADY_RECOUNTED 9 · 1 แถว 1 audit ×3", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ RC11 แข่งนับ คีย์เดียวกัน ════════
  {
    const p: string[] = [];
    const f = await forcedShift("same", owner);
    if (!f.id || f.err) p.push(f.err || "ไม่มีกะ");
    else {
      const k = newKey();
      const cls = await Promise.all(Array.from({ length: 6 }, (_, i) => lane(i)));
      const rs = await Promise.all(cls.map((cl) => recount(ctx(u1), owner, { shiftId: f.id, countedCashSatang: 1200, note: "คีย์เดียวกัน", idempotencyKey: k }, cl)));
      const codes = rs.map(codeOf);
      if (codes.some((c) => c !== "OK")) p.push(`รหัส ${codes.join(",")}`);
      const ids = new Set(rs.filter((r) => r?.ok === true).map((r) => r.recount?.id));
      if (ids.size !== 1) p.push(`id ${ids.size} แบบ`);
      const fresh = rs.filter((r) => r?.ok === true && !r.duplicated).length;
      if (fresh > 1) p.push(`ไม่ duplicated ${fresh}`);
      const rows = await recRows(f.id);
      if (rows.length !== 1) p.push(`แถว ${rows.length}`);
      const a = await audits(f.id);
      if (a.length !== 1) p.push(`audit ${a.length}`);
    }
    chk("P1.9b-RC11", p.length === 0, "ok ×6 id เดียว · 1 แถว 1 audit", FX(p.join(" · ") || "ครบ"));
  }

  // ════════ RC12 ปฏิเสธเป็นข้อมูล ════════
  {
    const p: string[] = [];
    const want = ["SHIFT_NOT_FORCED", "ALREADY_RECOUNTED", "PERMISSION_DENIED", "VALIDATION", "NOT_FOUND", "IDEMPOTENCY_CONFLICT"];
    const seen = new Set(dataRefusals.map((r) => String(r.code)));
    const miss = want.filter((c) => !seen.has(c));
    if (miss.length) p.push(`ไม่เคยได้ ${miss.join(",")}`);
    const threw = dataRefusals.filter((r) => r.threw);
    if (threw.length) p.push(`throw ${threw.length} ครั้ง (${short(threw[0]?.code, 30)})`);
    const noMsg = dataRefusals.filter((r) => !r.threw && (typeof r.message !== "string" || !r.message.trim()));
    if (noMsg.length) p.push(`ไม่มี message ${noMsg.length}`);
    const odd = [...seen].filter((c) => !want.includes(c));
    if (odd.length) p.push(`รหัสอื่น ${odd.join(",")}`);
    chk("P1.9b-RC12", p.length === 0, "6 รหัส · คืนไม่ throw · มี message", FX(p.join(" · ") || `ครบ (${dataRefusals.length} ครั้ง)`));
  }
}

// ═════════════════════════ 6. คืนสภาพ ═════════════════════════
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
  const counts: Record<string, number> = {};
  if (!units.length && !systems.length) return;
  if (PS) {
    try {
      const extra = ((await PS.findMany({ where: { tenantId: { in: TIDS }, unitId: { in: units } }, select: { id: true } })) as Any[]).map((r) => r.id);
      for (const id of extra) sb.shiftIds.add(id);
    } catch {
      /* ใช้รายการที่จำไว้ */
    }
  }
  const shiftIds = [...sb.shiftIds];
  const unitOr = [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : [])];
  const sales = ((await P.posSale.findMany({ where: { tenantId: { in: TIDS }, OR: unitOr }, select: { id: true } }).catch(() => [])) as Any[]).map((s) => s.id);
  const evWhere = { tenantId: { in: TIDS }, OR: [...unitOr, ...shiftIds.filter(Boolean).map((id) => ({ idempotencyKey: { contains: id } })), ...(sales.length ? [{ idempotencyKey: { in: sales.flatMap((s) => [`PosSale#${s}#PAID`, `PosSale#${s}#VOIDED`]) } }] : [])] };
  for (let i = 0; i < 20; i++) {
    const pend = await P.outboxEvent.count({ where: { ...evWhere, status: "PENDING" } }).catch(() => 0);
    if (pend === 0) break;
    await sleep(500);
  }
  counts.outbox = await del("outboxEvent", evWhere);
  counts.audit = await del("auditLog", { tenantId: { in: TIDS }, createdAt: { gte: runStart }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), { targetId: { in: [...shiftIds, ...systems, ...units, ...sales] } }] });
  if (units.length) counts.recount = await del("posShiftRecount", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (shiftIds.length) counts.recountByShift = await del("posShiftRecount", { shiftId: { in: shiftIds } });
  if (units.length) counts.move = await del("posCashMovement", { tenantId: { in: TIDS }, unitId: { in: units } });
  if (sales.length) {
    await del("couponRedemption", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    await del("pointLedger", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    counts.payment = await del("posPayment", { saleId: { in: sales } });
    counts.line = await del("posSaleLine", { saleId: { in: sales } });
    counts.sale = await del("posSale", { id: { in: sales } });
  }
  if (units.length) {
    counts.shift = await del("posShift", { tenantId: { in: TIDS }, unitId: { in: units } });
    await del("posShiftCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
    await del("posReceiptCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
    await del("appSystemUnit", { unitId: { in: units } });
  }
  if (systems.length) {
    await del("posProduct", { tenantId: { in: TIDS }, systemId: { in: systems } });
    await del("posCategory", { tenantId: { in: TIDS }, systemId: { in: systems } });
    await del("appSystemUnit", { systemId: { in: systems } });
    await del("appSystem", { id: { in: systems } });
  }
  if (units.length) await del("businessUnit", { id: { in: units } });
  console.log(`  ลบแล้ว: ${JSON.stringify(counts)} · กะ ${shiftIds.length} · บิล ${sales.length} · สาขา ${units.length} · ระบบ ${systems.length}`);
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
try {
  await runStatic();
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
chk("P1.9b-Z1", drift.length === 0, "ก่อน = หลัง", drift.length ? drift.join(", ") : "เท่ากันทุกตาราง");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("P1.9b-Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
for (const c of lanes) await c.$disconnect?.().catch?.(() => {});
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.9b: แก้/ลบการนับย้อนหลัง · นับหลายครั้งต่อกะ (R6) · นับกะปิดปกติ (R8) · JV ขาด/เกินของการนับ + event (P3 · R14) ·
// กล่องนับแยกธนบัตรในจอ · รายงานกะ/ขาดเกินรายเดือน (P1.17) · จอ = visual ของผู้คุมงาน
