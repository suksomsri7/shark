// QC — TRIPS T0.4d · ปิดหนี้ของ T0.4c ก่อนเปิดจองออนไลน์: D1 ข้อความ/รหัสจอ SLOT_BUSY · D2 กัน Party ซ้ำเมื่อยืนยันพร้อมกัน · D3 ที่ถือของพนักงานไม่นับเพดาน PUBLIC
//      · D4 เพดานเห็นทั้งตะกร้า · D6 ล้มหลังขั้นสร้าง Party ⇒ Party +0 (ข้อถาวร)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.4d.md (มติ D1–D6) · T0.4c.md (R1–R7 · §3.1 นิยาม hold ที่นับ) · wo-notes trips-T0.4c.md (หนี้ 7 ข้อ) · probe ledger/trips-probes/t0.4c/*.txt
//
// กลุ่มข้อ:
//   PC ตัวควบคุมบวก (ฟิกซ์เจอร์ใช้ได้จริง · เขียวทั้งก่อน/หลังแก้ · สภาพวันนี้ของข้อที่จะพลิก = ℹ️ เท่านั้น)   S ขอบเขต (ไม่มี migration/ค่าตั้งใหม่ · ไฟล์ · งบบรรทัด)
//   D1 SLOT_BUSY (แพลตฟอร์ม)   D2 Party ไม่ซ้ำ (ยิงพร้อมกัน)   D3 นับเฉพาะผู้กระทำ PUBLIC   D4 เพดานทั้งตะกร้า   D6 ล้มหลัง Party ⇒ +0
//
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t04d-*` ลบใน finally + กวาดค้างตอนเริ่ม + พิมพ์จำนวนแถวที่เหลือ · ไม่แตะร้าน seed (PC-1 อ่านอย่างเดียว)
// 🔴 นาฬิกา = ctx.now ที่ฉีด (NOW0 + ส่วนต่าง) เท่านั้น — ไม่เทียบกับนาฬิกาเครื่อง/now() ของฐาน · หมดเวลาของ hold ตามเวลาที่ฉีด
// 🔴 ค่าคาดหวังคิดเองจากสัญญา + แถวจริง (เพดาน = ceil(ความจุ × % / 100) · hold ที่นับ = ผู้กระทำ PUBLIC) — เงินตรงถึงสตางค์
// 🔴 ข้อ D6 "จัดลำดับด้วยล็อกแถว": ข้อสอบถือล็อกแถว TripPriceRule (UPDATE usedCount ยังไม่ COMMIT) ⇒ ขั้นเตรียมนอก tx เห็นสิทธิ์ว่าง · ธุรกรรมยืนยันผ่านขั้น Party แล้วรอที่ redeem
//    ⇒ ข้อสอบ COMMIT ⇒ redeem เห็นสิทธิ์หมด (PROMO_EXHAUSTED) — เรียงลำดับแน่นอน ไม่ต้องแข่ง (ยืนยันแบบเรียงธรรมดาล้มที่ขั้นเตรียมก่อนถึง Party — ดู D6-1 D6-4)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.4d.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมี T0.4d: PC/S เขียว · D1-1..D1-5 D2-1 D2-2 D2-4 (Party ซ้ำ · สุ่มตามจังหวะ) D2-7 D3-1..D3-5 D4-1..D4-3 แดงด้วยเหตุของหนี้ · D1-6 D2-3 D2-5 D2-6 D3-6 D4-4 D6-* เขียว (ข้อถาวร/regression)
// D6-1 D6-4 (ยืนยันเรียงธรรมดา) ล้มที่ขั้นเตรียมนอก tx ด้วย PRICE_CHANGED ไม่มี reason — ไม่ถึงขั้น Party · D6-2 D6-3 คือข้อ "ล้มหลังขั้น Party" จริงของมติ D6
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t0.4d";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** ปลาย wip/trips-t0.4d ตอนเขียนข้อสอบ (ใบสั่ง T0.4d บน session/trips @9f91b5821) — ฐานของ S เมื่อหา merge-base ไม่ได้ */
const BASE_SHA = "ddd12aab8";

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t0.4c) ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
type AnyFn = (...a: unknown[]) => unknown;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 300); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string) => {
  cks.push({ id, res, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); record(id, name, "PASS", ""); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`); }
};
const info = (id: string, msg: string) => console.log(`     ℹ️ ${id}: ${msg}`);
const groupLine = (g: string) => {
  const mine = cks.filter((c) => c.id.replace(/-\d+$/, "") === g);
  console.log(`  ── สรุป ${g}: ผ่าน ${mine.filter((c) => c.res === "PASS").length}/${mine.length}`);
};
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t04dqc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const tok = () => randomBytes(24).toString("base64url"); // token ตะกร้าของหน้าจอง (32 ตัว)
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SLUG = "trips-t04d-";
const EMAIL_PREFIX = "trips-t04d-";
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const addMin = (d: Date | string, m: number) => new Date(new Date(d).getTime() + m * 60_000);
const addSec = (d: Date | string, s: number) => new Date(new Date(d).getTime() + s * 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═══════════════ สัญญาของใบ (ledger/trips-briefs/T0.4d.md) ═══════════════
const REASON = "PUBLIC_UNPAID_SHARE";
const PUBLIC_CHANNELS = ["WEB", "LIFF", "EMBED", "CHAT_AI"];
const NEW_CODE = "SLOT_BUSY"; // D1 รหัสหน้าใหม่ใน BOOK_ERROR_CODES
/** D1: ข้อความ HOLD_LIMIT เหตุอื่น "คงข้อความเดิม" — ข้อความ ณ session/trips @9f91b5821 (src/messages/{th,en}/book.json err.HOLD_LIMIT) */
const MSG_HOLD_LIMIT = {
  th: "เบอร์นี้ถือที่ไว้หลายรายการแล้ว จ่ายรายการเดิมให้เสร็จหรือรอให้หมดเวลาก่อน",
  en: "This phone number already holds several bookings. Finish paying one of them or wait until it expires.",
};
const FORBIDDEN_WORDS = /เต็ม|sold\s*out|\bfull\b/i; // D1: ที่นั่งยังไม่ได้ขาย
/** D6 ขอบเขตไฟล์ของผู้สร้าง (ใบสั่ง "ขอบเขตไฟล์ของผู้สร้าง") — ไฟล์ตรง + โฟลเดอร์ของหน้าจอง (component/หน้า เฉพาะจุดแสดงข้อความผิดพลาด) */
const OWN_FILES = ["src/lib/modules/trips/booking.ts", "src/lib/modules/trips/capacity.ts", "src/lib/modules/trips/capacity-service.ts", "src/lib/platform/trips-book.ts", "src/lib/platform/trips-book-core.ts",
  "src/messages/th/book.json", "src/messages/en/book.json"];
const OWN_DIRS = ["src/components/book/", "src/app/book/"];
const BUDGET = { add: 120, del: 30 };
const ORACLE_FILES = ["scripts/qc-trips-t0.4d.mts", "scripts/qc-trips-t0.7.mts", "scripts/qc-trips-w1.2.mts"] /* ORACLE-EDIT S-3 (ผู้คุม): w1.2 ERROR_CODES เป็น ORACLE-EDIT ของผู้คุมตามมติ E5 */; // ไฟล์ของผู้เขียนข้อสอบ/ORACLE-EDIT ของใบนี้ (ผู้คุม commit)
const SOLD_ST = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
const SELL_CODES = ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "KIND_NOT_SUPPORTED", "CURRENCY_NOT_ALLOWED", "SOLD_OUT", "INSUFFICIENT_ALLOTMENT", "BERTH_TAKEN", "SLOT_CLOSED", "CUTOFF_PASSED",
  "PRICE_CHANGED", "BELOW_MIN_SELL_PRICE", "DISCOUNT_OVER_CAP", "HOLD_EXPIRED", "HOLD_NOT_FOUND", "HOLD_LIMIT", "AGENT_SUSPENDED", "CREDIT_LIMIT", "REQUIRES_APPROVAL",
  "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "BUSY", "STATE_CONFLICT"];
const shareLimit = (capacity: number, pct: number) => Math.ceil((capacity * pct) / 100);
const PCT = 50; // ค่าเริ่ม X31 (ไม่ตั้งในหน่วยทดสอบ)
const NOW0 = "2027-03-01T03:00:00.000Z"; // ก่อนปิดรับเว็บของทุกรอบในไฟล์ (รอบ ≥ 10 มี.ค.)
const HOLD_MIN = 60; // T5 ของหน่วยโมดูล (ชั้น UNIT)
const P_HOLD_MIN = 15; // T5 ของร้านแพลตฟอร์ม = ค่าเริ่ม (ไม่ตั้ง · W1.2 R.holdMinutes)
const R = FX.PRODUCT_RACHA;
const AD = R.adultSatang, PA = R.parkAdultSatang;
const PROMO_BP = 1_000; // โค้ดส่วนลด 10% (ฐาน = ค่าที่นั่ง · ค่าอุทยานไม่ลด)
const SHOP_CONTACT = { phone: "076-000-457", line: "@t04dqc", address: "9 ถนนทดสอบ ภูเก็ต" };

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 40 });
const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t}`); };
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
async function insertRow(table: string, vals: Rec): Promise<string> {
  await needTable(table);
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (c.column_name === "updatedAt" || c.column_name === "createdAt") { v[c.column_name] = new Date(); continue; }
    if (t === "text" || t.startsWith("character")) { const l = await checkLits(table, c.column_name); v[c.column_name] = l[0] ?? `qc${hex(4)}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? "2027-01-01 00:00:00" : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id ?? "");
}

// ═══════════════ ร้านชั่วคราว + กวาด ═══════════════
async function tablesWithTenant(): Promise<string[]> {
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  return rows.map((r) => r.t).filter((t) => t !== "Tenant");
}
const usedClientKeys: string[] = [];
async function cleanupBuckets(tids: string[]) {
  try {
    for (const t of tids) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`%:${t}:%`]);
    const us = (await q<{ id: string }>(`SELECT id FROM "BusinessUnit" WHERE "tenantId" = ANY($1::text[])`, [tids])).map((r) => r.id);
    for (const u of us) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`%:${u}:%`]);
    for (const k of usedClientKeys) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`%${k}%`]);
    await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, ["%t04dqc_%"]);
  } catch (e) { console.log(`  ⚠️ cleanup ถัง: ${errMsg(e)}`); }
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  await cleanupBuckets(tids);
  let pending = await tablesWithTenant();
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
    if (!us.length) return;
    for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* ไม่มีคอลัมน์ */ } }
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
/** แถวที่เหลือหลังกวาด (ร้าน/ผู้ใช้ของข้อสอบ + ทุกตารางที่มี tenantId ของร้านทดสอบ + ถังอัตรา) — ต้องเป็น 0 */
async function leftover(tids: string[]): Promise<number> {
  let n = Number((await q<{ n: number }>(`SELECT ((SELECT count(*) FROM "Tenant" WHERE slug LIKE $1) + (SELECT count(*) FROM "User" WHERE email LIKE $2))::int AS n`, [`${SLUG}%`, `${EMAIL_PREFIX}%`]))[0]?.n ?? 0);
  if (tids.length) for (const t of await tablesWithTenant()) { try { n += Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]))[0]?.n ?? 0); } catch { /* ignore */ } }
  for (const t of tids) n += Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, [`%:${t}:%`]))[0]?.n ?? 0);
  for (const k of usedClientKeys) n += Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, [`%${k}%`]))[0]?.n ?? 0);
  return n;
}
const tenantIds: string[] = [];

const withTimer = async <T,>(p: Promise<T>, ms: number, what: string): Promise<T> => {
  let t: NodeJS.Timeout | undefined;
  try { return await Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new AssertFail(`${what}: ค้างเกิน ${ms / 1000} วินาที (สงสัย deadlock/pool ค้าง/รอล็อกไม่จบ)`)), ms); })]); }
  finally { if (t) clearTimeout(t); }
};
const badOutcome = (r: Rec) => r.ok === "THROW" || r.code === "BUSY" || /40P01|deadlock|P2028|P2034|P2024|55P03|Transaction already closed|Unable to start a transaction|Timed out fetching/i.test(`${r.e ?? ""} ${r.pg ?? ""} ${fmt(r.details ?? "")}`);

// ═══════════════ ข้อความ ICU ขั้นต่ำ (ข้อความของหน้าจอง) ═══════════════
type Arg = { name: string; type: string; body: string };
/** อาร์กิวเมนต์ระดับบนของแม่แบบ ICU `{x}` `{n, plural, …}` — ไม่สนใจเครื่องหมาย ' หนี */
function icuArgs(tpl: string): Arg[] {
  const out: Arg[] = [];
  for (let i = 0; i < tpl.length; i++) {
    if (tpl[i] !== "{") continue;
    let depth = 0, j = i;
    for (; j < tpl.length; j++) { if (tpl[j] === "{") depth++; else if (tpl[j] === "}") { depth--; if (depth === 0) break; } }
    const inner = tpl.slice(i + 1, j);
    const m = /^\s*([A-Za-z_]\w*)\s*(?:,\s*(\w+)\s*(?:,([\s\S]*))?)?$/.exec(inner);
    if (m) out.push({ name: m[1], type: (m[2] ?? "").toLowerCase(), body: m[3] ?? "" });
    i = j;
  }
  return out;
}
const isMinutesArg = (a: Arg) => ["plural", "number", "selectordinal"].includes(a.type) || /min|minute|wait|retry|^n$|count|นาที/i.test(a.name);
/** แทนค่า: อาร์กิวเมนต์นาที ⇒ N · อื่น ๆ ⇒ ข้อความติดต่อร้าน · plural เลือก =N > one(N=1) > other แล้วแทน # */
function icuRender(tpl: string, N: number, contact: string): string {
  let s = "";
  for (let i = 0; i < tpl.length; i++) {
    if (tpl[i] !== "{") { s += tpl[i]; continue; }
    let depth = 0, j = i;
    for (; j < tpl.length; j++) { if (tpl[j] === "{") depth++; else if (tpl[j] === "}") { depth--; if (depth === 0) break; } }
    const a = icuArgs(tpl.slice(i, j + 1))[0];
    if (!a) { s += tpl.slice(i, j + 1); i = j; continue; }
    if (a.type === "plural" || a.type === "selectordinal" || a.type === "select") {
      const opts = new Map<string, string>();
      const re = /\s*(=?\w+)\s*\{/g; let k = 0; const b = a.body;
      while (k < b.length) {
        re.lastIndex = k; const m = re.exec(b); if (!m) break;
        let d = 1, e = m.index + m[0].length;
        for (; e < b.length && d > 0; e++) { if (b[e] === "{") d++; else if (b[e] === "}") d--; }
        opts.set(m[1], b.slice(m.index + m[0].length, e - 1)); k = e;
      }
      const pick = opts.get(`=${N}`) ?? (N === 1 ? opts.get("one") : undefined) ?? opts.get("other") ?? "";
      s += icuRender(pick.replace(/#/g, String(N)), N, contact);
    } else s += isMinutesArg(a) ? String(N) : contact;
    i = j;
  }
  return s;
}

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const PUBI = await tryImport("@/lib/platform/trips-public");
  const BCI = await tryImport("@/lib/platform/trips-book-core");
  const BSI = await tryImport("@/lib/platform/trips-book");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`โหลดโมดูล trips ไม่ได้ (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ไม่มี ${name}`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e), pg: String((e as { code?: unknown }).code ?? "") }; }
  };
  const bfn = (name: string): AnyFn => { const f = BSI.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`platform/trips-book ไม่มี ${name} (${BSI.err.slice(0, 80)})`); return f as AnyFn; };
  const bcall = async (name: string, ...a: unknown[]): Promise<Rec> => { try { return asRec(await bfn(name)(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  const coreV = (name: string): unknown => { const v = BCI.mod?.[name]; if (v === undefined) throw new AssertFail(`trips-book-core ไม่มี ${name} (${BCI.err.slice(0, 80)})`); return v; };
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const codeR = (r: Rec, code: string | string[], what: string, reason?: string) => {
    const cs = Array.isArray(code) ? code : [code];
    ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")}${reason ? `{${reason}}` : ""} ได้ ${fmt(r)}`);
    if (reason) eq(asRec(r.details)?.reason, reason, `${what} details.reason`);
  };
  const shareR = (r: Rec, what: string) => codeR(r, "HOLD_LIMIT", what, REASON);
  const par = async (n: number, f: (i: number) => Promise<Rec>): Promise<Rec[]> => Promise.all(Array.from({ length: n }, (_, i) => f(i).catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec)));
  const tally = (rs: Rec[]) => { const m: Record<string, number> = {}; for (const r of rs) { const k = r.ok === true ? "ok" : `${String(r.code ?? r.ok)}${asRec(r.details)?.reason ? `:${String(asRec(r.details)?.reason)}` : ""}`; m[k] = (m[k] ?? 0) + 1; } return m; };

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tP = rid("tP");
  const uA = rid("uA"), uP = rid("uP");
  const SP = `${SLUG}${STAMP}-p`;
  let setupErr = "", settingsErr = "", platErr = "";
  const U: Record<string, Rec> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; slug: string; pt: Record<string, string> }> = {};
  try {
    for (const t of ["TripProduct", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripHold", "TripBooking", "SellBasket", "Party", "TripPriceRule", "ChatRateBucket"]) await needTable(t);
    await insertRow("Tenant", { id: tA, name: "ทดสอบ T0.4d a", slug: `${SLUG}${STAMP}-a`, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(tA);
    await insertRow("Tenant", { id: tP, name: "ทดสอบ T0.4d หน้าจอง", slug: SP, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(tP);
    await insertRow("BusinessUnit", { id: uA, tenantId: tA, type: "TRIPS", status: "ACTIVE", name: "หน่วย a", slug: `${SLUG}a-${STAMP}`, settings: "{}", updatedAt: new Date() });
    await insertRow("BusinessUnit", { id: uP, tenantId: tP, type: "TRIPS", status: "ACTIVE", name: "หน่วย p", slug: `${SLUG}p-${STAMP}`, settings: "{}", updatedAt: new Date() });
    for (const [tag, tenantId] of [["oa", tA], ["op", tP]] as const) {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id };
    }
    const mkProd = async (key: string, tenantId: string, unitId: string) => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      const slug = `t04dqc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
      await insertRow("TripProduct", { id, tenantId, unitId, slug, productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}`, en: `Test ${key}` }), body: JSON.stringify({ summary: { th: `สรุป ${key}` } }),
        currency: "THB", deepDive: false, crossBorder: false, publishedAt: new Date("2027-01-01T00:00:00Z"), updatedAt: new Date() });
      await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt: Record<string, string> = {};
      for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code }),
        ageMin: code === "CHILD" ? R.childAge.min : code === "ADULT" ? 12 : null, ageMax: code === "CHILD" ? R.childAge.max : code === "INFANT" ? 3 : null, countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
      await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: PA, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
        name: JSON.stringify({ th: "ค่าอุทยาน", en: "Marine park fee" }), paxPrices: JSON.stringify({ ADULT: PA, CHILD: R.parkChildSatang }), active: true, sortOrder: 0, updatedAt: new Date() });
      for (const [code, amount] of [["ADULT", AD], ["CHILD", R.childSatang], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt: o, unit: unitId, tenant: tenantId, slug, pt };
    };
    for (const k of ["A", "B", "C", "D"]) await mkProd(k, tA, uA);
    await mkProd("SC", tA, uA); // SHOP_CONFIRMS (D3-4)
    await mkProd("P", tP, uP); // หน้าจอง (D1)
    await insertRow("PaymentProfile", { id: rid("pp"), tenantId: tP, promptpayId: "0812345678", displayName: `ร้านทดสอบ T04D ${STAMP}`, updatedAt: new Date() });
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const setV = async (tenantId: string, changes: Rec[], who: string) => {
    const f = SETI.mod?.setSettings;
    if (typeof f !== "function") throw new AssertFail(`ไม่มี setSettings (${SETI.err.slice(0, 80)})`);
    const r = asRec(await (f as AnyFn)(U[who], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    if (r.ok !== true) throw new AssertFail(`setSettings ${changes.map((c) => String(c.key)).join(",")}: ${fmt(r)}`);
  };
  try {
    if (!setupErr) await setV(tA, [
      { key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uA, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } },
      { key: "trips.sell.holdMinutes", scope: "UNIT", scopeId: uA, value: HOLD_MIN },
      { key: "trips.public.holdCapPerContact", scope: "UNIT", scopeId: uA, value: 20 }, // D2: ผู้จองเดียวกันยืนยัน 10 ตะกร้าพร้อมกัน (X10 ค่าเริ่ม 3)
      { key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PRD.SC?.id, value: "SHOP_CONFIRMS" },
    ], "oa");
  } catch (e) { settingsErr = errMsg(e); console.log(`  ⚠️ ตั้งค่าตั้งหน่วยไม่สำเร็จ: ${settingsErr}`); }
  try {
    if (!setupErr) await setV(tP, [{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uP, value: true }, { key: "trips.public.shopContact", scope: "UNIT", scopeId: uP, value: SHOP_CONTACT }], "op");
  } catch (e) { platErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านหน้าจองไม่สำเร็จ: ${platErr}`); }
  const needDb = () => { needTrips(); ok(!setupErr && PRD.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); ok(!settingsErr, `ตั้งค่าตั้งไม่ได้: ${settingsErr}`); };
  const needPlat = () => { needDb(); ok(!platErr, `ตั้งร้านหน้าจองไม่ได้: ${platErr}`); ok(BSI.mod && BCI.mod && PUBI.mod, `โหลด platform ไม่ได้ (${BSI.err || BCI.err || PUBI.err})`); };

  // ── รอบ ──
  const usedStarts = new Set<string>();
  let dayN = 0;
  const mkDep = async (o: { key?: string; date?: string; hm?: string; capacity?: number } = {}): Promise<string> => {
    const p = PRD[o.key ?? "A"];
    const date = o.date ?? `2027-03-${String(10 + (dayN++ % 18)).padStart(2, "0")}`;
    let startsAt = BKK(date, o.hm ?? "08:00"); const id = rid("d");
    while (usedStarts.has(`${p.id}|${startsAt.toISOString()}`)) startsAt = addMin(startsAt, 1);
    usedStarts.add(`${p.id}|${startsAt.toISOString()}`);
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "OPEN", capacity: o.capacity ?? 10, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const depKey = new Map<string, string>();
  const mkDepK = async (key: string, o: { date?: string; hm?: string; capacity?: number } = {}) => { const d = await mkDep({ ...o, key }); depKey.set(d, key); return d; };

  // ── ctx · บรรทัด · ผู้จอง ──
  const staff = (o: { ch?: string; now?: string | Date; tenant?: string; unit?: string } = {}): Rec => ({ tenantId: o.tenant ?? tA, unitId: o.unit ?? uA, channel: o.ch ?? "COUNTER", actor: { kind: "STAFF", userId: String(U.oa?.userId ?? "x") }, now: new Date(o.now ?? NOW0), locale: "th" });
  let pubN = 0;
  const pub = (o: { ch?: string; now?: string | Date; tenant?: string; unit?: string } = {}): Rec => ({ tenantId: o.tenant ?? tA, unitId: o.unit ?? uA, channel: o.ch ?? "WEB", actor: { kind: "PUBLIC", clientKey: `t04dqc_c${pubN++}_${hex(3)}` }, now: new Date(o.now ?? NOW0), locale: "th" });
  const withNow = (ctx: Rec, now: string | Date): Rec => ({ ...ctx, now: new Date(now) });
  const line = (dep: string, o: { a?: number; promo?: string } = {}): Rec => {
    const p = PRD[depKey.get(dep) ?? "A"];
    return { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax: [{ paxTypeId: p.pt.ADULT, qty: o.a ?? 2 }], extras: [], ...(o.promo ? { promoCode: o.promo } : {}) };
  };
  let bkN = 0;
  const newPhone = () => { bkN++; return `08${String(40_000_000 + bkN * 7_919 + Number.parseInt(hex(2), 16)).slice(-8)}`; };
  const booker = (o: Rec = {}): Rec => ({ name: `qc4d ผู้จอง ${STAMP} ${++bkN}`, phone: newPhone(), ...o });
  const quoteOf = async (ctx: Rec, lines: Rec[]): Promise<Rec> => V(await call("quoteTrips", ctx, { lines }, {}), "quoteTrips");
  type H = { r: Rec; v: Rec; quote: Rec; token?: string; lines: Rec[]; ctx: Rec };
  const holdT = async (ctx: Rec, lines: Rec[]): Promise<H> => {
    const quote = await quoteOf(ctx, lines);
    const isPub = asRec(ctx.actor)?.kind === "PUBLIC";
    const token = isPub ? tok() : undefined;
    const r = await call("holdTrips", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `h${hex(6)}`, ...(token ? { basketToken: token } : {}) }, {});
    return { r, v: asRec(r.value) ?? {}, quote, token, lines, ctx };
  };
  const holdOk = async (ctx: Rec, lines: Rec[]): Promise<H> => { const h = await holdT(ctx, lines); V(h.r, "holdTrips"); return h; };
  const confirmT = async (h: H, o: { ctx?: Rec; booker?: Rec; pay?: string; onExpired?: string } = {}): Promise<Rec> => call("confirmTrips", o.ctx ?? h.ctx, {
    basketId: h.v.basketId, holdIds: h.v.holdIds, idempotencyKey: `c${hex(6)}`, quoteId: h.quote.quoteId, quote: { lines: h.lines },
    booker: o.booker ?? booker(), pay: { method: o.pay ?? (asRec(h.ctx.actor)?.kind === "STAFF" ? "PAY_LATER" : "PAY_NOW") }, ...(h.token ? { basketToken: h.token } : {}), ...(o.onExpired ? { onExpired: o.onExpired } : {}),
  }, {});
  const bookNowQ = async (ctx: Rec, lines: Rec[]): Promise<Rec> => quoteOf(ctx, lines);
  const bookNowWith = (ctx: Rec, lines: Rec[], quote: Rec, b: Rec): Promise<Rec> =>
    call("bookTripsNow", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `n${hex(6)}`, booker: b, pay: { method: "PAY_LATER" } }, {});
  const bookNow = async (ctx: Rec, lines: Rec[], b: Rec): Promise<Rec> => bookNowWith(ctx, lines, await bookNowQ(ctx, lines), b);
  const refs = (r: Rec): Rec[] => asArr(r.value);
  const dep = async (id: string): Promise<Rec> => (await q<Rec>(`SELECT capacity, sold, held, reserved, status FROM "TripDeparture" WHERE id = $1`, [id]))[0] ?? {};
  const holdsOf = async (depId: string) => q<Rec>(`SELECT * FROM "TripHold" WHERE "departureId" = $1 ORDER BY "createdAt", id`, [depId]);
  /** ที่ถือที่นับตามมติ D3 (ผู้กระทำ PUBLIC — คอลัมน์ idempotencyKey ขึ้นต้น pub: ทุกเส้นทางที่ INSERT hold · ไม่ถูกแก้หลัง INSERT) · ACTIVE · expiresAt > now · PAYMENT|SHOP_CONFIRM */
  const publicHeld = async (depId: string, now: string | Date) => Number((await q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic" + "qtyAllot"),0)::int AS n FROM "TripHold"
      WHERE "departureId" = $1 AND status = 'ACTIVE' AND "expiresAt" > $2::timestamp AND "idempotencyKey" LIKE 'pub:%' AND purpose IN ('PAYMENT','SHOP_CONFIRM')`, [depId, new Date(now).toISOString()]))[0]?.n ?? -1);
  /** นิยามวันนี้ (T0.4c §3.1 ตามช่องทาง) — ใช้แสดงสภาพวันนี้เท่านั้น */
  const channelHeld = async (depId: string, now: string | Date) => Number((await q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic" + "qtyAllot"),0)::int AS n FROM "TripHold"
      WHERE "departureId" = $1 AND status = 'ACTIVE' AND "expiresAt" > $2::timestamp AND channel = ANY($3::text[]) AND purpose IN ('PAYMENT','SHOP_CONFIRM')`, [depId, new Date(now).toISOString(), PUBLIC_CHANNELS]))[0]?.n ?? -1);
  const inv = async (deps: string[]): Promise<string[]> => {
    const bad: string[] = [];
    for (const d of deps) {
      const c = await dep(d);
      const s = Number((await q<{ n: number }>(`SELECT COALESCE(sum(i.qty),0)::int AS n FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" LEFT JOIN "TripPaxType" p ON p.id = i."paxTypeId"
        WHERE i."departureId" = $1 AND i.active AND i.kind IN ('SEAT','BERTH') AND COALESCE(p."countsCapacity", true) AND b.status = ANY($2::text[])`, [d, SOLD_ST]))[0]?.n ?? -1);
      const h = Number((await q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic" + "qtyAllot"),0)::int AS n FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [d]))[0]?.n ?? -1);
      if (c.sold !== s || c.held !== h || Number(c.sold) + Number(c.held) + Number(c.reserved) > Number(c.capacity)) bad.push(`${d.slice(-6)} sold ${c.sold}/${s} held ${c.held}/${h} cap ${c.capacity}`);
    }
    return bad;
  };
  const invOk = async (deps: string[], what: string) => { const b = await inv(deps); ok(b.length === 0, `${what} ค่าคงที่ D.3: ${b.slice(0, 4).join(" · ")}`); };
  /** Party ของผู้จอง: ชื่อเดียวกัน หรือเบอร์ (phoneNorm ลงท้าย 9 หลักเดียวกัน) หรืออีเมลเดียวกัน ในร้าน */
  const partiesOf = async (tenantId: string, b: Rec) => Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Party" WHERE "tenantId" = $1 AND (name = $2
      OR ($3::text <> '' AND "phoneNorm" LIKE '%' || $3) OR ($4::text <> '' AND lower(email) = lower($4)))`, [tenantId, String(b.name ?? ""), String(b.phone ?? "").replace(/\D/g, "").slice(-9), String(b.email ?? "")]))[0]?.n ?? -1);
  const partyIds = async (tenantId: string, b: Rec) => (await q<{ id: string }>(`SELECT id FROM "Party" WHERE "tenantId" = $1 AND (name = $2
      OR ($3::text <> '' AND "phoneNorm" LIKE '%' || $3) OR ($4::text <> '' AND lower(email) = lower($4)))`, [tenantId, String(b.name ?? ""), String(b.phone ?? "").replace(/\D/g, "").slice(-9), String(b.email ?? "")])).map((r) => r.id);
  const bookerOfBooking = async (id: unknown) => String((await q<{ p: string | null }>(`SELECT "bookerPartyId" AS p FROM "TripBooking" WHERE id = $1`, [String(id)]))[0]?.p ?? "");
  const bksOfBasket = async (basketId: unknown) => q<Rec>(`SELECT * FROM "TripBooking" WHERE "basketId" = $1 ORDER BY id`, [String(basketId)]);
  /** โค้ดส่วนลด 10% ใช้ได้ maxUses ครั้ง (หน่วย A ทุกสินค้า) */
  const promoRule = async (maxUses: number): Promise<{ id: string; code: string }> => {
    const code = `QD${hex(3)}`.toUpperCase();
    const id = await insertRow("TripPriceRule", { id: rid("ru"), tenantId: tA, unitId: uA, productId: null, kind: "PROMO_CODE", code, params: JSON.stringify({ kind: "PROMO_CODE", code, discountBp: PROMO_BP, maxUses }), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
    return { id, code };
  };
  const usedCount = async (ruleId: string) => Number((await q<{ u: number }>(`SELECT "usedCount" AS u FROM "TripPriceRule" WHERE id = $1`, [ruleId]))[0]?.u ?? -1);
  /**
   * D6 จัดลำดับด้วยล็อกแถว: ข้อสอบ UPDATE usedCount = maxUses (ยังไม่ COMMIT) → เรียก `run` → รอจนมี backend อื่นรอล็อกที่คำสั่ง UPDATE "TripPriceRule" ของ redeem (≤ 30 วิ)
   * → COMMIT → ผลของ run · ไม่เคยเห็นผู้รอ ⇒ AssertFail (ไม่ถึงขั้น redeem = ข้อสอบไม่ได้ทดสอบ "หลังขั้น Party")
   */
  const exhaustWhileBlocked = async (ruleId: string, maxUses: number, run: () => Promise<Rec>): Promise<{ r: Rec; waited: boolean }> => {
    const c = await pool.connect();
    let waited = false;
    try {
      await c.query("BEGIN");
      await c.query(`UPDATE "TripPriceRule" SET "usedCount" = $2 WHERE id = $1`, [ruleId, maxUses]);
      const myPid = Number((await c.query<{ p: number }>("SELECT pg_backend_pid() AS p")).rows[0]?.p ?? 0);
      const pr = run().catch((e) => ({ ok: "THROW", e: errMsg(e) }) as Rec);
      for (let i = 0; i < 300 && !waited; i++) {
        const w = await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> $1 AND wait_event_type = 'Lock' AND query ILIKE '%UPDATE "TripPriceRule"%usedCount%'`, [myPid]);
        if (Number(w[0]?.n ?? 0) > 0) waited = true; else await sleep(100);
      }
      await c.query("COMMIT");
      const r = await withTimer(pr, 60_000, "ยืนยันหลังปล่อยล็อกโค้ดส่วนลด");
      return { r, waited };
    } finally { await c.query("ROLLBACK").catch(() => undefined); c.release(); }
  };

  // ── หน้าจอง (แพลตฟอร์ม · ร้าน P) ──
  let ipN = 0;
  const ck = (): string => {
    const f = PUBI.mod?.bookClientKey;
    if (typeof f !== "function") throw new AssertFail(`ไม่มี bookClientKey (${PUBI.err.slice(0, 80)})`);
    ipN++; const k = (f as AnyFn)(`100.66.${(ipN >> 8) & 255}.${ipN & 255}`);
    if (typeof k !== "string") throw new AssertFail(`bookClientKey ไม่คืนสตริง: ${fmt(k)}`);
    usedClientKeys.push(k); return k;
  };
  const nonceAt = (when: Date, purpose: "hold" | "confirm"): string => {
    const r = bfn("issueBookFormNonce")({ now: addSec(when, -60), scope: { tenantId: tP, purpose } });
    if (typeof r !== "string" || !r) throw new AssertFail(`issueBookFormNonce ไม่คืนสตริง: ${fmt(r)}`);
    return r;
  };
  /** ถือที่ผ่านหน้าสินค้า (startBookHold) ณ when: ยอด/ตัวอ้างรอบจาก quoteBookSelection ของวันนั้น (ข้อสอบไม่ปั้นเอง) */
  const pHold = async (date: string, adults: number, when: Date, clientKey = ck()): Promise<{ r: Rec; clientKey: string; seen: number }> => {
    const qs = await bcall("quoteBookSelection", { shop: SP, productSlug: PRD.P.slug, query: { d: date, "n.ADULT": String(adults) }, acceptLanguage: "th", clientKey }, { now: when });
    const sm = asRec(qs.summary);
    ok(qs.ok === true && sm && typeof sm.slotToken === "string", `quoteBookSelection ${date}: ${fmt(qs)}`);
    const seen = Number(sm!.totalSatang);
    const r = await bcall("startBookHold", { shop: SP, productSlug: PRD.P.slug, form: { d: date, t: sm!.slotToken, "n.ADULT": String(adults), nonce: nonceAt(when, "hold"), seen: String(seen) }, acceptLanguage: "th", clientKey }, { now: when });
    return { r, clientKey, seen };
  };
  const pConfirm = async (h: { r: Rec; clientKey: string; seen: number }, phone: string, at: Date): Promise<Rec> => {
    const c = await bcall("loadBookCheckout", { shop: SP, basketToken: h.r.basketToken, sel: h.r.sel, lang: "th", acceptLanguage: "th", clientKey: h.clientKey }, { now: addSec(at, -10) });
    const nonce = String(asRec(asRec(c.vm)?.form)?.nonce ?? nonceAt(at, "confirm"));
    return bcall("confirmBookHold", { shop: SP, basketToken: h.r.basketToken, sel: h.r.sel, form: { name: `qc4d หน้าจอง ${STAMP}`, phone, email: "", accept: "on", nonce, seen: String(h.seen) }, clientKey: h.clientKey }, { now: at });
  };
  const bucketsOf = async (clientKey: string) => q<{ key: string; count: number }>(`SELECT key, "count" FROM "ChatRateBucket" WHERE key LIKE $1 ORDER BY key`, [`%${clientKey}%`]);
  const pubP = (now: Date) => pub({ tenant: tP, unit: uP, now });
  const lineP = (d: string, a: number): Rec => ({ productKind: "TRIP", unitId: uP, productId: PRD.P.id, slotId: d, optionId: PRD.P.opt, pax: [{ paxTypeId: PRD.P.pt.ADULT, qty: a }], extras: [] });
  const msgs = (lang: "th" | "en"): Rec => { try { return asRec(JSON.parse(read(`src/messages/${lang}/book.json`))) ?? {}; } catch { return {}; } };
  /** ค่าคาดหวังของ retryAfterSec (T0.4c R5): min(ceil((min expiresAt ของ hold PUBLIC ที่นับ − now)/1000), T5×60) — คิดจากแถวจริง */
  const expectRetry = async (d: string, now: Date, t5: number) => {
    const first = (await q<{ t: Date | null }>(`SELECT min("expiresAt") AS t FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE' AND "expiresAt" > $2::timestamp AND "idempotencyKey" LIKE 'pub:%' AND purpose IN ('PAYMENT','SHOP_CONFIRM')`, [d, now.toISOString()]))[0]?.t;
    ok(first, "ไม่พบที่ถือ PUBLIC ที่นับ");
    return Math.min(Math.max(1, Math.ceil((new Date(first!).getTime() - now.getTime()) / 1000)), t5 * 60);
  };

  // ═══════════════ PC. ตัวควบคุมบวก ═══════════════
  console.log("\n── PC: ตัวควบคุมบวก (ฟิกซ์เจอร์ใช้ได้จริง · สภาพวันนี้ของข้อที่จะพลิก = ℹ️) ──");
  await st("PC-1", "ฐาน qc-trips + ร้าน seed andaman-dive · ร้านชั่วคราว (โมดูล + หน้าจอง) ตั้งได้ · PUBLIC ถือ 2 → ยืนยัน PAY_NOW ⇒ HOLD · Party ใหม่ 1 แถวผูก bookerPartyId", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = 'andaman-dive'`))[0]?.n, 1, "ร้าน andaman-dive");
    needDb();
    const d = await mkDepK("A", { date: "2027-03-10" });
    const b = booker(); const r = await confirmT(await holdOk(pub(), [line(d)]), { booker: b });
    const ids = await partyIds(tA, b);
    eq([refs(r)[0]?.status, ids.length, await bookerOfBooking(refs(r)[0]?.bookingId) === ids[0]], ["HOLD", 1, true], "สถานะ/Party/ผูก");
  });
  await st("PC-2", `เพดานทำงาน (ความจุ 10 ⇒ ${shareLimit(10, PCT)}): PUBLIC ถือ 3 + 2 ได้ · ขอ 1 ⇒ HOLD_LIMIT ${REASON} · STAFF ช่อง WEB ถือ 3 ได้ (ไม่ถูกเพดานปฏิเสธ — คงเดิม)`, async () => {
    needDb();
    const d = await mkDepK("A", { date: "2027-03-11", capacity: 10 });
    await holdOk(pub(), [line(d, { a: 3 })]); await holdOk(pub(), [line(d, { a: 2 })]);
    shareR((await holdT(pub(), [line(d, { a: 1 })])).r, "ถือที่ 6");
    V((await holdT(staff({ ch: "WEB" }), [line(d, { a: 3 })])).r, "STAFF WEB หลัง PUBLIC ชนเพดาน");
  });
  await st("PC-3", "[D3 แยกผู้กระทำได้โดยไม่มี migration] แถว TripHold: PUBLIC idempotencyKey ขึ้นต้น pub: · STAFF (ช่อง WEB/COUNTER) ขึ้นต้น st: · placeHold เหมือนกัน · capKeyHash ไม่ว่างทุกแถว (ใช้แยกไม่ได้)", async () => {
    needDb();
    const d = await mkDepK("B", { date: "2027-03-11", capacity: 30 });
    await holdOk(pub(), [line(d, { a: 1 })]); await holdOk(staff({ ch: "WEB" }), [line(d, { a: 1 })]); await holdOk(staff(), [line(d, { a: 1 })]);
    V(await call("placeHold", pub(), { departureId: d, qty: 1, idempotencyKey: `p${hex(6)}`, capKey: `basket:${sha256hex(tok())}` }), "placeHold PUBLIC");
    V(await call("placeHold", staff({ ch: "WEB" }), { departureId: d, qty: 1, idempotencyKey: `p${hex(6)}` }), "placeHold STAFF WEB");
    const rows = (await holdsOf(d)).map((h) => [String(h.channel), String(h.idempotencyKey).split(":")[0], typeof h.capKeyHash === "string" && h.capKeyHash.length > 0]);
    eq(rows.map((r) => r.join("/")).sort(), ["COUNTER/st/true", "WEB/pub/true", "WEB/pub/true", "WEB/st/true", "WEB/st/true"], "ช่องทาง/คำนำหน้าคีย์/capKeyHash");
    info("PC-3", `นับตามช่องทาง (T0.4c วันนี้) = ${await channelHeld(d, NOW0)} · นับตามผู้กระทำ PUBLIC (มติ D3) = ${await publicHeld(d, NOW0)}`);
  });
  await st("PC-4", "Party จับคู่แบบเรียงลำดับ (ฐานของ D2): STAFF bookTripsNow ×3 เบอร์ใหม่เดียวกัน ⇒ 1 แถว · อีเมลอย่างเดียว ×3 ⇒ 1 แถว · PUBLIC ยืนยัน ×3 เบอร์เดียวกัน ⇒ 1 แถว (ℹ️ สภาพวันนี้ของ STAFF ×10 พร้อมกัน)", async () => {
    needDb();
    const ds = await Promise.all([0, 1, 2].map((i) => mkDepK(["A", "B", "C"][i], { date: "2027-03-12", capacity: 20 })));
    const bp = booker(); for (const d of ds) V(await bookNow(staff(), [line(d, { a: 1 })], bp), "bookNow เบอร์");
    const be = { name: `qc4d อีเมล ${STAMP} ${hex(2)}`, email: `t04dqc.${hex(4)}@example.com` }; for (const d of ds) V(await bookNow(staff(), [line(d, { a: 1 })], be), "bookNow อีเมล");
    const bq = booker(); for (const d of ds) V(await confirmT(await holdOk(pub(), [line(d, { a: 1 })]), { booker: bq }), "PUBLIC ยืนยัน");
    eq([await partiesOf(tA, bp), await partiesOf(tA, be), await partiesOf(tA, bq)], [1, 1, 1], "Party ต่อผู้จอง (เบอร์/อีเมล/PUBLIC)");
    const mix = { name: `qc4d รูปเบอร์ ${STAMP}`, phone: newPhone() };
    V(await bookNow(staff(), [line(ds[0], { a: 1 })], mix), "เบอร์รูป 08");
    V(await bookNow(staff(), [line(ds[1], { a: 1 })], { ...mix, phone: `+66${String(mix.phone).slice(1)}` }), "เบอร์รูป +66");
    info("PC-4", `เบอร์เดียวกันสองรูป (08… / +66…) แบบเรียง ⇒ Party ${await partiesOf(tA, mix)} แถว (ไม่ตรึง — ขึ้นกับการจับคู่ของ modules/party)`);
  });
  await st("PC-5", `หน้าจอง (ร้าน P · ถือ ${P_HOLD_MIN} นาที): startBookHold 1 ที่ ได้ · ที่สภาพเพดานเต็ม (ความจุ 10 · PUBLIC ถือ 3+2 ด้วยโมดูล) holdTrips ของโมดูล ⇒ HOLD_LIMIT ${REASON} + retryAfterSec ตามแถวจริง (ℹ️ รหัสหน้าจองวันนี้)`, async () => {
    needPlat();
    const d0 = await mkDepK("P", { date: "2027-03-20", capacity: 10 });
    const h0 = await pHold("2027-03-20", 1, new Date(NOW0));
    ok(h0.r.ok === true && typeof h0.r.basketToken === "string", `startBookHold: ${fmt(h0.r)}`);
    const d = await mkDepK("P", { date: "2027-03-21", capacity: 10 });
    await holdOk(pubP(new Date(NOW0)), [lineP(d, 3)]); await holdOk(pubP(new Date(NOW0)), [lineP(d, 2)]);
    const at = addSec(NOW0, 330);
    const r = (await holdT(pubP(at), [lineP(d, 1)])).r;
    shareR(r, "โมดูลที่เพดาน");
    eq(asRec(r.details)?.retryAfterSec, await expectRetry(d, at, P_HOLD_MIN), "retryAfterSec ของบริการ");
    const today = await pHold("2027-03-21", 1, at);
    info("PC-5", `หน้าจองวันนี้ที่เพดาน ⇒ ${fmt({ ok: today.r.ok, code: today.r.code, retryAfterSec: today.r.retryAfterSec })} · รอบ d0 ${d0.slice(-6)}`);
  });
  await st("PC-6", `โค้ดส่วนลด 10% ใช้ได้ 1 ครั้ง: PUBLIC ถือ 2 ผู้ใหญ่ + โค้ด → ยืนยัน ⇒ ส่วนลด ${(2 * AD * PROMO_BP) / 10_000} สตางค์ (ฐานค่าที่นั่ง · ค่าอุทยานไม่ลด) · usedCount 1`, async () => {
    needDb();
    const p = await promoRule(1);
    const d = await mkDepK("A", { date: "2027-03-13", capacity: 20 });
    const r = await confirmT(await holdOk(pub(), [line(d, { promo: p.code })]));
    const b = (await q<Rec>(`SELECT "grossSatang", "discountSatang" FROM "TripBooking" WHERE id = $1`, [String(refs(r)[0]?.bookingId)]))[0] ?? {};
    eq([r.ok, b.grossSatang, b.discountSatang, await usedCount(p.id)], [true, 2 * AD + 2 * PA, (2 * AD * PROMO_BP) / 10_000, 1], "ยืนยัน/ยอดเต็ม/ส่วนลด/ตัวนับ");
  });
  await st("PC-7", "ลำดับใน finalizeCoreInTx (ฐานของ D6): หา/สร้าง Party (safeFindOrCreate) มาก่อน redeemPromosInTx ⇒ redeem ล้ม = ล้มหลังขั้น Party", () => {
    const s = stripComments(read("src/lib/modules/trips/booking.ts"));
    const i = s.search(/async\s+function\s+finalizeCoreInTx\s*\(/);
    ok(i >= 0, "ไม่พบ finalizeCoreInTx");
    const body = s.slice(i, i + s.slice(i + 10).search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+/) + 10);
    const a = body.indexOf("safeFindOrCreate("), b = body.indexOf("redeemPromosInTx(");
    ok(a > 0 && b > a, `ลำดับ safeFindOrCreate ${a} · redeemPromosInTx ${b}`);
  });
  groupLine("PC");

  // ═══════════════ S. ขอบเขต ═══════════════
  console.log("\n── S: ขอบเขต (ไม่มี migration · ไม่มีค่าตั้งใหม่ · ไฟล์ · งบบรรทัด · ไม่นับไฟล์ที่ตรงกับ session/trips) ──");
  const baseOf = () => { const b = git(["merge-base", "HEAD", "session/trips"]).trim() || BASE_SHA; ok(git(["cat-file", "-t", b]).trim() === "commit", `หาฐาน ${b} ไม่เจอ`); return b; };
  const sameAsSession = (f: string) => git(["rev-parse", "--verify", "-q", "session/trips"]).trim() !== "" && git(["diff", "--name-only", "session/trips", "--", f]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", f]).trim() === "";
  const changedOf = (base: string, paths: string[]) => [...new Set([...git(["diff", "--name-only", base, "--", ...paths]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n")].filter(Boolean))].filter((f) => !sameAsSession(f));
  await st("S-1", "ไม่มี migration/schema ใหม่ (prisma/ ไม่เปลี่ยน) · core/sellable.ts ไม่เปลี่ยน", () => {
    const ch = changedOf(baseOf(), ["prisma", "src/lib/core/sellable.ts"]);
    ok(ch.length === 0, `เปลี่ยน: ${ch.slice(0, 6).join(", ")}`);
  });
  await st("S-2", "ไม่มีค่าตั้งใหม่: src/lib/core/settings/ ไม่เปลี่ยน · ledger/TRIPS-DEFAULTS.md ไม่เปลี่ยน", () => {
    const ch = changedOf(baseOf(), ["src/lib/core/settings", "ledger/TRIPS-DEFAULTS.md"]);
    ok(ch.length === 0, `เปลี่ยน: ${ch.slice(0, 6).join(", ")}`);
  });
  await st("S-3", `ไฟล์ src/ ที่แตะ ⊆ ขอบเขตของใบ (${OWN_FILES.map((f) => f.split("/").pop()).join(" · ")} · ${OWN_DIRS.join(" ")}) · ไม่แตะ modules/party · ไม่แก้ข้อสอบ scripts/qc-* (ยกเว้นไฟล์ของผู้เขียนข้อสอบ)`, () => {
    const base = baseOf();
    const out = changedOf(base, ["src"]).filter((f) => !OWN_FILES.includes(f) && !OWN_DIRS.some((d) => f.startsWith(d)));
    ok(out.length === 0, `แตะนอกขอบเขต: ${out.slice(0, 8).join(", ")}`);
    const qc = changedOf(base, ["scripts"]).filter((f) => /^scripts\/qc-/.test(f) && !ORACLE_FILES.includes(f));
    ok(qc.length === 0, `แก้ข้อสอบ: ${qc.slice(0, 6).join(", ")}`);
  });
  await st("S-4", `งบบรรทัดรวมของ src/ ≤ +${BUDGET.add}/−${BUDGET.del}`, () => {
    const base = baseOf();
    let add = 0, del = 0; const per: string[] = [];
    for (const f of changedOf(base, ["src"])) {
      const ln = git(["diff", "--numstat", base, "--", f]).trim();
      let a = 0, d = 0;
      if (ln) { const [x, y] = ln.split("\t"); a = Number(x) || 0; d = Number(y) || 0; } else a = read(f).split("\n").length; // ไฟล์ใหม่ยังไม่ track
      add += a; del += d; per.push(`${f.split("/").pop()} +${a}/−${d}`);
    }
    ok(add <= BUDGET.add && del <= BUDGET.del, `รวม +${add}/−${del}: ${per.join(" · ")}`);
  });
  groupLine("S");

  // ═══════════════ D1. SLOT_BUSY ═══════════════
  console.log(`\n── D1: หน้าจองแปลง HOLD_LIMIT{${REASON}} เป็น ${NEW_CODE} (ข้อความ th/en · นาที · ติดต่อร้าน · ไม่ "เต็ม") ──`);
  await st("D1-1", `รายการรหัสหน้า: BOOK_ERROR_CODES มี ${NEW_CODE} · isBookErrorCode · ลิงก์กลับหน้าสินค้า e=${NEW_CODE} อ่านกลับ (bookErrorParam) ได้รหัสเดิม · รหัสเดิมยังอยู่ครบ`, () => {
    needPlat();
    const codes = coreV("BOOK_ERROR_CODES") as string[];
    ok(Array.isArray(codes) && codes.includes(NEW_CODE), `BOOK_ERROR_CODES ไม่มี ${NEW_CODE}: ${fmt(codes)}`);
    const old = ["NOT_FOUND", "RATE_LIMITED", "INVALID", "PRICE_CHANGED", "SOLD_OUT", "CUTOFF_PASSED", "SLOT_CLOSED", "HOLD_LIMIT", "HOLD_EXPIRED", "STALE_FORM", "TOO_FAST", "ACCEPT_REQUIRED", "DONE", "BUSY", "UNAVAILABLE"];
    eq(old.filter((c) => !codes.includes(c)), [], "รหัสเดิมที่หาย");
    eq((coreV("isBookErrorCode") as AnyFn)(NEW_CODE), true, "isBookErrorCode");
    const href = String((coreV("bookSelectHref") as AnyFn)(SP, { productSlug: PRD.P?.slug ?? "x", query: { d: "2027-03-21" } }, NEW_CODE));
    ok(new RegExp(`[?&]e=${NEW_CODE}(&|$)`).test(href), `ลิงก์: ${href}`);
    eq(asRec((coreV("bookErrorParam") as AnyFn)({ e: NEW_CODE }))?.code, NEW_CODE, "bookErrorParam");
  });
  await st("D1-2", `ข้อความ err.${NEW_CODE} th/en: มีอาร์กิวเมนต์นาที 1 ตัว + ช่องติดต่อร้าน · แทนค่า N = 10 / 1 แล้วมีเลข N · ไม่มี "เต็ม"/"sold out"/"full" · ไม่มีตัวเลขอื่น (จำนวนที่นั่ง) · ไม่ซ้ำข้อความ HOLD_LIMIT/SOLD_OUT · err.HOLD_LIMIT คงข้อความเดิม`, () => {
    const contact = `${SHOP_CONTACT.phone} · LINE ${SHOP_CONTACT.line}`;
    for (const lang of ["th", "en"] as const) {
      const err = asRec(msgs(lang).err) ?? {};
      eq(err.HOLD_LIMIT, MSG_HOLD_LIMIT[lang], `${lang} err.HOLD_LIMIT (เหตุอื่นคงข้อความเดิม)`);
      const tpl = err[NEW_CODE];
      ok(typeof tpl === "string" && tpl.trim(), `${lang}: ไม่มี err.${NEW_CODE}`);
      const args = icuArgs(String(tpl));
      const mins = args.filter(isMinutesArg), others = args.filter((a) => !isMinutesArg(a));
      ok(mins.length >= 1 && new Set(mins.map((a) => a.name)).size === 1, `${lang}: ต้องมีอาร์กิวเมนต์นาที 1 ชื่อ (plural/number หรือชื่อแบบ minutes) ได้ ${fmt(args.map((a) => `${a.name}:${a.type}`))}`);
      ok(others.length >= 1, `${lang}: ต้องมีช่องติดต่อร้าน (เช่น {contact}) ได้ ${fmt(args.map((a) => a.name))}`);
      ok(tpl !== err.HOLD_LIMIT && tpl !== err.SOLD_OUT, `${lang}: ข้อความซ้ำ HOLD_LIMIT/SOLD_OUT`);
      for (const N of [10, 1]) {
        const s = icuRender(String(tpl), N, contact);
        ok(new RegExp(`(^|\\D)${N}(\\D|$)`).test(s), `${lang} N=${N}: ไม่มีเลขนาที — ${s}`);
        ok(s.includes(SHOP_CONTACT.phone), `${lang} N=${N}: ไม่มีช่องทางติดต่อร้าน — ${s}`);
        ok(!FORBIDDEN_WORDS.test(String(tpl)), `${lang}: มีคำว่าเต็ม/sold out/full — ${tpl}`);
        const rest = s.split(contact).join(" ").replace(new RegExp(`(^|\\D)${N}(?=\\D|$)`, "g"), "$1");
        ok(!/[0-9๐-๙]/.test(rest), `${lang} N=${N}: มีตัวเลขอื่นนอกจากนาที (จำนวนที่นั่ง?) — ${s}`);
      }
      if (lang === "th") ok(/[฀-๿]/.test(String(tpl)), "th: ไม่ใช่ข้อความไทย");
    }
  });
  await st("D1-3", `เส้นถือ (หน้าเลือก · startBookHold) ที่เพดาน: ความจุ 10 · PUBLIC ถือ 3+2 ตอน NOW0 · ถือ 1 ตอน +5:30 ⇒ ${NEW_CODE} · retryAfterSec = 570 (คิดจากแถวจริง · N = 10) · มีลิงก์กลับหน้าสินค้า · ไม่มีที่ถือใหม่ · ถังถือ/ถังต่อรอบของเครื่องนี้ขยับ 1 ครั้งเท่าเดิม (ไม่กินถังเพิ่ม)`, async () => {
    needPlat();
    const d = await mkDepK("P", { date: "2027-03-22", capacity: 10 });
    await holdOk(pubP(new Date(NOW0)), [lineP(d, 3)]); await holdOk(pubP(new Date(NOW0)), [lineP(d, 2)]);
    const at = addSec(NOW0, 330);
    const want = await expectRetry(d, at, P_HOLD_MIN);
    eq(want, 570, "เงื่อนไขก่อน: retryAfterSec ที่คิดจากแถว");
    const rowsBefore = (await holdsOf(d)).length;
    const h = await pHold("2027-03-22", 1, at);
    ok(h.r.ok === false && h.r.code === NEW_CODE, `ต้อง ${NEW_CODE} ได้ ${fmt(h.r)}`);
    eq([h.r.retryAfterSec, Math.max(1, Math.ceil(Number(h.r.retryAfterSec) / 60))], [570, 10], "retryAfterSec / N");
    ok(asRec(h.r.back)?.productSlug === PRD.P.slug && h.r.shopSlug === SP, `ลิงก์กลับหน้าสินค้า: ${fmt({ back: h.r.back, shopSlug: h.r.shopSlug })}`);
    ok(!JSON.stringify(h.r).match(/"(seats|held|publicLeft|count|limit)"/), `ผลมีจำนวนที่นั่ง/ตัวนับ: ${fmt(h.r)}`);
    eq([(await holdsOf(d)).length, await publicHeld(d, at)], [rowsBefore, 5], "ที่ถือไม่เพิ่ม");
    const bk = await bucketsOf(h.clientKey);
    eq(bk.filter((b) => /^trips:(hold|slot):/.test(b.key)).map((b) => Number(b.count)), [1, 1], `ถังถือ/ต่อรอบ ${fmt(bk)}`);
  });
  await st("D1-4", `ขั้นต่ำ 1 นาที: ที่ถือที่นับหมดในอีก 20 วิ (ถือตอน NOW0 · ขอตอน +14:40) ⇒ ${NEW_CODE} · retryAfterSec 20 ⇒ N = 1 · ข้อความ th/en แทน N = 1 ได้`, async () => {
    needPlat();
    const d = await mkDepK("P", { date: "2027-03-23", capacity: 10 });
    await holdOk(pubP(new Date(NOW0)), [lineP(d, 3)]); await holdOk(pubP(new Date(NOW0)), [lineP(d, 2)]);
    const at = addSec(NOW0, 14 * 60 + 40);
    eq(await expectRetry(d, at, P_HOLD_MIN), 20, "เงื่อนไขก่อน");
    const h = await pHold("2027-03-23", 1, at);
    ok(h.r.ok === false && h.r.code === NEW_CODE, `ต้อง ${NEW_CODE} ได้ ${fmt(h.r)}`);
    eq([h.r.retryAfterSec, Math.max(1, Math.ceil(Number(h.r.retryAfterSec) / 60))], [20, 1], "retryAfterSec / N");
  });
  await st("D1-5", `เส้นยืนยัน/REHOLD (หน้าชำระ · confirmBookHold) ใช้ตัวแปลงเดียวกับเส้นถือ: ฟังก์ชันที่จัดการ ${REASON} ถูกเรียกทั้งใน startBookHold และ confirmBookHold (ตรวจโค้ด — บริการไม่ตรวจเพดานซ้ำตอนยืนยัน จึงยิงจริงไม่ได้)`, () => {
    const s = stripComments(read("src/lib/platform/trips-book.ts"));
    ok(s, "ไม่มี trips-book.ts");
    const chunks = s.split(/\n(?=(?:export\s+)?(?:async\s+)?function\s+\w+|(?:export\s+)?const\s+\w+\s*=)/);
    const nameOf = (c: string) => /^(?:export\s+)?(?:async\s+)?(?:function\s+|const\s+)(\w+)/.exec(c.trim())?.[1] ?? "";
    const holders = chunks.filter((c) => c.includes(REASON)).map(nameOf).filter(Boolean);
    ok(holders.length > 0, `ไม่มีฟังก์ชันใดใน trips-book.ts จัดการ ${REASON}`);
    for (const f of ["startBookHold", "confirmBookHold"]) {
      const c = chunks.find((x) => nameOf(x) === f) ?? "";
      ok(c, `ไม่พบ ${f}`);
      ok(c.includes(REASON) || holders.some((h) => h !== f && new RegExp(`\\b${h}\\(`).test(c)), `${f} ไม่ผ่านตัวแปลงที่จัดการ ${REASON} (${holders.join(",")})`);
    }
  });
  await st("D1-6", "HOLD_LIMIT เหตุอื่นคงรหัสเดิม: เพดานผู้ติดต่อ (X10 ค่าเริ่ม 3) ผ่านหน้าจอง — เบอร์เดียวกันยืนยัน 4 ตะกร้า ⇒ ใบที่ 4 HOLD_LIMIT (ไม่ใช่ " + NEW_CODE + ")", async () => {
    needPlat();
    await mkDepK("P", { date: "2027-03-24", capacity: 24 });
    const phone = newPhone();
    const out: string[] = [];
    for (let i = 0; i < 4; i++) {
      const h = await pHold("2027-03-24", 1, new Date(NOW0));
      ok(h.r.ok === true, `ถือที่ ${i + 1}: ${fmt(h.r)}`);
      const r = await pConfirm(h, phone, addSec(NOW0, 10));
      out.push(r.ok === true ? "OK" : String(r.code));
    }
    eq(out, ["OK", "OK", "OK", "HOLD_LIMIT"], "ผลต่อตะกร้า");
  });
  groupLine("D1");

  // ═══════════════ D2. Party ไม่ซ้ำ ═══════════════
  console.log("\n── D2: ผู้จองใหม่คนเดียวกันยืนยันพร้อมกัน ⇒ Party 1 แถว (ล็อกต่อเบอร์/อีเมลใน tx · ไม่ deadlock) ──");
  const tenDeps = async (date: string, capacity = 10) => Promise.all(Array.from({ length: 10 }, (_, i) => mkDepK(["A", "B", "C", "D"][i % 4], { date, hm: `${String(7 + Math.floor(i / 4)).padStart(2, "0")}:00`, capacity })));
  const linkedAll = async (rs: Rec[], b: Rec): Promise<{ parties: number; linked: number }> => {
    const ids = await partyIds(tA, b);
    let linked = 0;
    for (const r of rs) for (const x of refs(r)) if (ids.length === 1 && (await bookerOfBooking(x.bookingId)) === ids[0]) linked++;
    return { parties: ids.length, linked };
  };
  await st("D2-1", "STAFF bookTripsNow ×10 พร้อมกัน เบอร์ใหม่เดียวกัน คนละรอบ ⇒ สำเร็จ 10 · Party 1 แถว · ทั้ง 10 การจองผูก Party นั้น · ไม่มี BUSY/40P01", async () => {
    needDb();
    const ds = await tenDeps("2027-03-14");
    const b = booker();
    const qs = await Promise.all(ds.map((d) => bookNowQ(staff(), [line(d, { a: 1 })])));
    const rs = await withTimer(par(10, (i) => bookNowWith(staff(), [line(ds[i], { a: 1 })], qs[i], b)), 120_000, "D2-1");
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    eq(rs.filter((r) => r.ok === true).length, 10, `สำเร็จ ${fmt(tally(rs))}`);
    eq(await linkedAll(rs, b), { parties: 1, linked: 10 }, "Party/การจองที่ผูก");
  });
  await st("D2-2", "STAFF bookTripsNow ×10 พร้อมกัน ผู้จองอีเมลอย่างเดียว (ไม่มีเบอร์) เดียวกัน ⇒ Party 1 แถว · ผูกครบ 10", async () => {
    needDb();
    const ds = await tenDeps("2027-03-15");
    const b = { name: `qc4d อีเมลพร้อมกัน ${STAMP}`, email: `t04dqc.${hex(4)}@Example.com` };
    const qs = await Promise.all(ds.map((d) => bookNowQ(staff(), [line(d, { a: 1 })])));
    const rs = await withTimer(par(10, (i) => bookNowWith(staff(), [line(ds[i], { a: 1 })], qs[i], b)), 120_000, "D2-2");
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    eq(rs.filter((r) => r.ok === true).length, 10, `สำเร็จ ${fmt(tally(rs))}`);
    eq(await linkedAll(rs, b), { parties: 1, linked: 10 }, "Party/การจองที่ผูก");
  });
  await st("D2-3", "regression: PUBLIC ยืนยัน ×10 พร้อมกัน เบอร์ใหม่เดียวกัน คนละรอบ ⇒ สำเร็จ 10 · Party 1 แถว · ผูกครบ", async () => {
    needDb();
    const ds = await tenDeps("2027-03-16");
    const hs: H[] = []; for (const d of ds) hs.push(await holdOk(pub(), [line(d, { a: 1 })]));
    const b = booker();
    const rs = await withTimer(Promise.all(hs.map((h) => confirmT(h, { booker: b }))), 120_000, "D2-3");
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    eq(rs.filter((r) => r.ok === true).length, 10, `สำเร็จ ${fmt(tally(rs))}`);
    eq(await linkedAll(rs, b), { parties: 1, linked: 10 }, "Party/การจองที่ผูก");
  });
  // ตะกร้าสี่แบบวนกัน ([D1] · [D2] · [D1,D2] · [D2,D1]) — แบบรอบเดียวคนละรอบวิ่งขนานกันจริง (ไม่ถูกล็อกรอบเรียงคิว) · แบบสองรอบสลับลำดับไขว้ล็อกรอบกับล็อกผู้จอง
  await st("D2-4", "ไม่ deadlock: STAFF bookTripsNow ×12 พร้อมกัน เบอร์ใหม่เดียวกัน ตะกร้า [D1] · [D2] · [D1,D2] · [D2,D1] วนกัน ⇒ สำเร็จ 12 · ไม่มี BUSY/40P01 · Party 1 แถว · ผูกครบ 18 การจอง · D.3", async () => {
    needDb();
    const d1 = await mkDepK("A", { date: "2027-03-17", capacity: 20 }), d2 = await mkDepK("B", { date: "2027-03-17", capacity: 20 });
    const b = booker();
    const shapes = [[line(d1, { a: 1 })], [line(d2, { a: 1 })], [line(d1, { a: 1 }), line(d2, { a: 1 })], [line(d2, { a: 1 }), line(d1, { a: 1 })]];
    const qs = await Promise.all(shapes.map((ln) => bookNowQ(staff(), ln)));
    const rs = await withTimer(par(12, (i) => bookNowWith(staff(), shapes[i % 4], qs[i % 4], b)), 120_000, "D2-4");
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    eq(rs.filter((r) => r.ok === true).length, 12, `สำเร็จ ${fmt(tally(rs))}`);
    eq(await linkedAll(rs, b), { parties: 1, linked: 18 }, "Party/การจองที่ผูก");
    await invOk([d1, d2], "D2-4");
  });
  await st("D2-5", "ไม่ deadlock (PUBLIC): ยืนยัน ×10 พร้อมกัน ตะกร้าสองรอบสลับลำดับ เบอร์ใหม่เดียวกัน ⇒ สำเร็จ 10 · Party 1 แถว · ไม่มี BUSY/40P01", async () => {
    needDb();
    const d1 = await mkDepK("C", { date: "2027-03-17", capacity: 40 }), d2 = await mkDepK("D", { date: "2027-03-17", capacity: 40 });
    const hs: H[] = []; for (let i = 0; i < 10; i++) hs.push(await holdOk(pub(), i % 2 ? [line(d1, { a: 1 }), line(d2, { a: 1 })] : [line(d2, { a: 1 }), line(d1, { a: 1 })]));
    const b = booker();
    const rs = await withTimer(Promise.all(hs.map((h) => confirmT(h, { booker: b }))), 120_000, "D2-5");
    ok(!rs.some(badOutcome), `ผลเสีย: ${fmt(rs.find(badOutcome))}`);
    eq(rs.filter((r) => r.ok === true).length, 10, `สำเร็จ ${fmt(tally(rs))}`);
    eq(await linkedAll(rs, b), { parties: 1, linked: 20 }, "Party/การจองที่ผูก");
    await invOk([d1, d2], "D2-5");
  });
  await st("D2-6", "ยืนยันที่ล้มพร้อมกันยังไม่ทิ้ง Party: STAFF bookTripsNow ×10 เบอร์ใหม่เดียวกัน SOLD_OUT (ความจุ 1 ขอ 2) · PUBLIC ยืนยัน ×5 เบอร์ใหม่เดียวกันหลัง hold หมดเวลา ⇒ ล้มทั้งหมด · Party 0 · ไม่มี BUSY", async () => {
    needDb();
    const d = await mkDepK("A", { date: "2027-03-18", capacity: 1 });
    const b1 = booker();
    const q1 = await bookNowQ(staff(), [line(d, { a: 2 })]);
    const r1 = await withTimer(par(10, () => bookNowWith(staff(), [line(d, { a: 2 })], q1, b1)), 120_000, "D2-6 STAFF");
    const d2 = await mkDepK("B", { date: "2027-03-18", capacity: 20 });
    const hs: H[] = []; for (let i = 0; i < 5; i++) hs.push(await holdOk(pub(), [line(d2, { a: 1 })]));
    const b2 = booker(); const late = addMin(NOW0, HOLD_MIN + 1);
    const r2 = await withTimer(Promise.all(hs.map((h) => confirmT(h, { ctx: withNow(h.ctx, late), booker: b2 }))), 120_000, "D2-6 PUBLIC");
    ok(![...r1, ...r2].some(badOutcome), `ผลเสีย: ${fmt([...r1, ...r2].find(badOutcome))}`);
    eq([tally(r1), tally(r2), await partiesOf(tA, b1), await partiesOf(tA, b2)], [{ SOLD_OUT: 10 }, { HOLD_EXPIRED: 5 }, 0, 0], "ผล/Party");
  });
  await st("D2-7", "โค้ด: finalizeCoreInTx ขอล็อก (advisory ผ่าน tx เดียวกัน) หลังตรวจรอบ/ผูก hold/คำอนุมัติ และก่อน safeFindOrCreate( · ไม่เปิด connection ที่สอง (ไม่มี prisma./tenantDb(/$transaction ในตัวฟังก์ชัน)", () => {
    const s = stripComments(read("src/lib/modules/trips/booking.ts"));
    const i = s.search(/async\s+function\s+finalizeCoreInTx\s*\(/);
    ok(i >= 0, "ไม่พบ finalizeCoreInTx");
    const body = s.slice(i, i + s.slice(i + 10).search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+/) + 10);
    const from = Math.max(body.indexOf("consumeApprovalsInTx("), body.indexOf("assertDeparturesSellableInTx("));
    const to = body.indexOf("safeFindOrCreate(");
    ok(from > 0 && to > from, `ไม่พบจุดอ้างอิง (${from}, ${to})`);
    const mid = body.slice(from, to).replace(/consumeApprovalsInTx\(/g, "");
    ok(/pg_advisory_xact_lock|\block\w*\s*\(/i.test(mid), "ไม่มีการขอล็อกผู้จองระหว่างคำอนุมัติกับ safeFindOrCreate");
    ok(!/\bprisma\.|tenantDb\(|\$transaction\(/.test(body), "finalizeCoreInTx เปิด client อื่น");
  });
  groupLine("D2");

  // ═══════════════ D3. นับเฉพาะผู้กระทำ PUBLIC ═══════════════
  console.log(`\n── D3: ที่ถือของพนักงาน (แม้ผ่านช่องสาธารณะ) ไม่นับเข้าเพดาน PUBLIC (ค่าเริ่ม ${PCT}%) ──`);
  await st("D3-1", `ความจุ 30 (เพดาน ${shareLimit(30, PCT)}): STAFF ช่อง WEB ถือ 12 ⇒ PUBLIC ถือ 6 (ตะกร้าแรก) + 9 ได้ (= 15) · ขอ 1 ⇒ HOLD_LIMIT ${REASON} (ที่ว่างยังพอ) · ที่ถือ PUBLIC = 15 · held 27`, async () => {
    needDb();
    const d = await mkDepK("A", { date: "2027-03-19", capacity: 30 });
    await holdOk(staff({ ch: "WEB" }), [line(d, { a: 12 })]);
    V((await holdT(pub(), [line(d, { a: 6 })])).r, "PUBLIC 6 (STAFF WEB 12 ไม่นับ)");
    V((await holdT(pub(), [line(d, { a: 9 })])).r, "PUBLIC 9 (รวม 15 = เพดาน)");
    shareR((await holdT(pub(), [line(d, { a: 1 })])).r, "PUBLIC 1 เกินเพดาน");
    eq([await publicHeld(d, NOW0), (await dep(d)).held], [15, 27], "ที่ถือ PUBLIC/held"); await invOk([d], "D3-1");
  });
  await st("D3-2", `ช่องสาธารณะอื่น: STAFF ถือ 2 ทาง LIFF · EMBED · CHAT_AI บนความจุ 20 (เพดาน ${shareLimit(20, PCT)}) ⇒ ยังไม่มีที่ถือ PUBLIC ⇒ PUBLIC ตะกร้าแรก 10 ได้ · ขอ 1 ⇒ HOLD_LIMIT ${REASON}`, async () => {
    needDb();
    const d = await mkDepK("B", { date: "2027-03-19", capacity: 20 });
    for (const ch of ["LIFF", "EMBED", "CHAT_AI"]) V((await holdT(staff({ ch }), [line(d, { a: 2 })])).r, `STAFF ${ch}`);
    V((await holdT(pub(), [line(d, { a: 10 })])).r, "PUBLIC ตะกร้าแรก 10");
    shareR((await holdT(pub(), [line(d, { a: 1 })])).r, "PUBLIC 1 หลังตะกร้าแรก");
  });
  await st("D3-3", `REHOLD ของ STAFF ช่อง WEB ไม่นับ: ความจุ 30 · STAFF WEB ถือ 12 ตอน NOW0 → ยืนยัน PAY_NOW onExpired REHOLD ตอน +61 นาที ⇒ HOLD + hold ใหม่ (ACTIVE · WEB · st:) · ตอนนั้น PUBLIC ถือ 6 + 9 ได้ · ขอ 1 ⇒ HOLD_LIMIT`, async () => {
    needDb();
    const d = await mkDepK("C", { date: "2027-03-19", capacity: 30 });
    const h = await holdOk(staff({ ch: "WEB" }), [line(d, { a: 12 })]);
    const T1 = addMin(NOW0, HOLD_MIN + 1);
    const r = await confirmT(h, { ctx: withNow(h.ctx, T1), pay: "PAY_NOW", onExpired: "REHOLD" });
    eq(refs(r)[0]?.status, "HOLD", `ยืนยัน REHOLD: ${fmt(r)}`);
    const act = (await holdsOf(d)).filter((x) => x.status === "ACTIVE" && new Date(String(x.expiresAt)).getTime() > T1.getTime());
    eq(act.map((x) => [x.channel, String(x.idempotencyKey).split(":")[0], x.purpose, Number(x.qtyPublic)]), [["WEB", "st", "PAYMENT", 12]], "hold ใหม่ของ REHOLD (เงื่อนไขก่อน)");
    V((await holdT(pub({ now: T1 }), [line(d, { a: 6 })])).r, "PUBLIC 6 หลัง REHOLD");
    V((await holdT(pub({ now: T1 }), [line(d, { a: 9 })])).r, "PUBLIC 9");
    shareR((await holdT(pub({ now: T1 }), [line(d, { a: 1 })])).r, "PUBLIC 1 เกินเพดาน");
  });
  await st("D3-4", `SHOP_CONFIRM ของ PUBLIC ยังนับ (ตรง) และ STAFF WEB ไม่นับ: สินค้ารอร้านยืนยัน ความจุ 20 (เพดาน ${shareLimit(20, PCT)}) · STAFF WEB ถือ 8 · PUBLIC ถือ 5 → ยืนยัน ⇒ PENDING (SHOP_CONFIRM) · PUBLIC ถือ 5 ได้ (= 10) · ขอ 1 ⇒ HOLD_LIMIT`, async () => {
    needDb();
    const d = await mkDepK("SC", { date: "2027-03-19", capacity: 20 });
    await holdOk(staff({ ch: "WEB" }), [line(d, { a: 8 })]);
    const h = await holdT(pub(), [line(d, { a: 5 })]);
    V(h.r, "PUBLIC 5 (STAFF WEB 8 ไม่นับ)");
    const c = await confirmT(h);
    eq(refs(c)[0]?.status, "PENDING", `ยืนยัน: ${fmt(c)}`);
    V((await holdT(pub(), [line(d, { a: 5 })])).r, "PUBLIC 5 (รวม 10)");
    shareR((await holdT(pub(), [line(d, { a: 1 })])).r, "PUBLIC 1 เกินเพดาน");
    eq(await publicHeld(d, NOW0), 10, "ที่ถือ PUBLIC (SHOP_CONFIRM 5 + PAYMENT 5)");
  });
  await st("D3-5", `placeHold (ทางตรง T0.4): STAFF ช่อง WEB placeHold 4 บนความจุ 10 (เพดาน ${shareLimit(10, PCT)}) ⇒ PUBLIC placeHold 5 ได้ (ตะกร้าแรก) · PUBLIC placeHold 1 ⇒ HOLD_LIMIT ${REASON}`, async () => {
    needDb();
    const d = await mkDepK("D", { date: "2027-03-19", capacity: 10 });
    V(await call("placeHold", staff({ ch: "WEB" }), { departureId: d, qty: 4, idempotencyKey: `p${hex(6)}` }), "STAFF WEB placeHold 4");
    const ph = (qty: number) => call("placeHold", pub(), { departureId: d, qty, idempotencyKey: `p${hex(6)}`, capKey: `basket:${sha256hex(tok())}` });
    V(await ph(5), "PUBLIC placeHold 5");
    shareR(await ph(1), "PUBLIC placeHold 1");
  });
  await st("D3-6", "regression: ที่ถือ PUBLIC ยังนับตรง — หน้าร้าน (COUNTER) 6 ไม่นับ · PUBLIC 3+2 บนความจุ 10 ได้ · ขอ 1 ⇒ HOLD_LIMIT · PUBLIC ช่อง LIFF นับเหมือน WEB", async () => {
    needDb();
    const d = await mkDepK("A", { date: "2027-03-20", capacity: 20 });
    await holdOk(staff(), [line(d, { a: 6 })]);
    await holdOk(pub(), [line(d, { a: 6 })]); V((await holdT(pub({ ch: "LIFF" }), [line(d, { a: 4 })])).r, "LIFF 4 (= 10)");
    shareR((await holdT(pub({ ch: "EMBED" }), [line(d, { a: 1 })])).r, "EMBED 1 เกินเพดาน");
    eq(await publicHeld(d, NOW0), 10, "ที่ถือ PUBLIC");
  });
  groupLine("D3");

  // ═══════════════ D4. เพดานทั้งตะกร้า ═══════════════
  console.log("\n── D4: ตะกร้า PUBLIC หลายก้อนบนรอบเดียวกันนับรวมทั้งตะกร้า (เกิน QTY_MAX 50 ต่อรอบ) ──");
  const noBasketLeft = async (d: string, before: { rows: number; held: number }, at: string | Date, pubWant: number, what: string) =>
    eq([(await holdsOf(d)).length, Number((await dep(d)).held), await publicHeld(d, at)], [before.rows, before.held, pubWant], `${what}: ไม่มีที่ถือของตะกร้าที่ล้มเหลือ (แถว/held/ที่ถือ PUBLIC)`);
  await st("D4-1", `เพดาน 60 (ความจุ 120) · PUBLIC ถือ 5 · ตะกร้า 30+30 (= 65) ⇒ HOLD_LIMIT ${REASON} · ไม่มีที่ถือของตะกร้านั้นเหลือ`, async () => {
    needDb();
    const d = await mkDepK("A", { date: "2027-03-21", capacity: 120 });
    await holdOk(pub(), [line(d, { a: 5 })]);
    const before = { rows: (await holdsOf(d)).length, held: Number((await dep(d)).held) };
    shareR((await holdT(pub(), [line(d, { a: 30 }), line(d, { a: 30 })])).r, "30+30");
    await noBasketLeft(d, before, NOW0, 5, "D4-1"); await invOk([d], "D4-1");
  });
  await st("D4-2", `สามบรรทัด 20+20+20 (= 60 · แบ่งก้อน 50+10) บนเพดาน 60 ที่ถืออยู่ 5 ⇒ HOLD_LIMIT ${REASON} · ไม่มีที่ถือเหลือ`, async () => {
    needDb();
    const d = await mkDepK("B", { date: "2027-03-21", capacity: 120 });
    await holdOk(pub(), [line(d, { a: 5 })]);
    const before = { rows: (await holdsOf(d)).length, held: Number((await dep(d)).held) };
    shareR((await holdT(pub(), [line(d, { a: 20 }), line(d, { a: 20 }), line(d, { a: 20 })])).r, "20+20+20");
    await noBasketLeft(d, before, NOW0, 5, "D4-2");
  });
  await st("D4-3", `ความจุ 200 (เพดาน ${shareLimit(200, PCT)}) · PUBLIC ถือ 21 · ตะกร้า 40+40 (= 101) ⇒ HOLD_LIMIT ${REASON} · ไม่มีที่ถือเหลือ`, async () => {
    needDb();
    const d = await mkDepK("C", { date: "2027-03-21", capacity: 200 });
    await holdOk(pub(), [line(d, { a: 21 })]);
    const before = { rows: (await holdsOf(d)).length, held: Number((await dep(d)).held) };
    shareR((await holdT(pub(), [line(d, { a: 40 }), line(d, { a: 40 })])).r, "40+40");
    await noBasketLeft(d, before, NOW0, 21, "D4-3");
  });
  await st("D4-4", "regression: ตะกร้าแรก 30+30 บนรอบว่าง (เพดาน 60 · ความจุ 120) ได้ · ตะกร้าแรก 30+30 บนความจุ 60 (เพดาน 30) ได้ · พอดีเพดาน: ถือ 20 + 40+40 (= 100 · ความจุ 200) ได้ · held = Σ hold", async () => {
    needDb();
    const d1 = await mkDepK("D", { date: "2027-03-21", capacity: 120 });
    V((await holdT(pub(), [line(d1, { a: 30 }), line(d1, { a: 30 })])).r, "ตะกร้าแรก 30+30");
    const d2 = await mkDepK("A", { date: "2027-03-22", capacity: 60 });
    V((await holdT(pub(), [line(d2, { a: 30 }), line(d2, { a: 30 })])).r, "ตะกร้าแรก 30+30 บนความจุ 60");
    const d3 = await mkDepK("B", { date: "2027-03-22", capacity: 200 });
    await holdOk(pub(), [line(d3, { a: 20 })]);
    V((await holdT(pub(), [line(d3, { a: 40 }), line(d3, { a: 40 })])).r, "40+40 พอดีเพดาน");
    eq([await publicHeld(d1, NOW0), await publicHeld(d2, NOW0), await publicHeld(d3, NOW0)], [60, 60, 100], "ที่ถือ PUBLIC"); await invOk([d1, d2, d3], "D4-4");
  });
  groupLine("D4");

  // ═══════════════ D6. ล้มหลังขั้น Party ⇒ Party +0 ═══════════════
  console.log("\n── D6: โค้ดส่วนลด 1 สิทธิ์หมดระหว่างยืนยัน ⇒ PRICE_CHANGED{PROMO_EXHAUSTED} · ไม่มี Party ของผู้จองคนที่สอง (ข้อถาวร) ──");
  const FULL = 2 * AD + 2 * PA; // ยอดเต็มของ 2 ผู้ใหญ่ (ไม่มีส่วนลด)
  await st("D6-1", "แบบเรียงธรรมดา (PUBLIC): ถือสองตะกร้าด้วยโค้ดเดียวกันขณะยังมีสิทธิ์ · คนแรกยืนยันได้ (usedCount 1) · ผู้จองใหม่คนที่สองยืนยัน ⇒ PRICE_CHANGED · ไม่มี Party · ไม่มีการจอง · hold ยัง ACTIVE (ℹ️ เหตุ — ล้มที่ขั้นเตรียมก่อน Party)", async () => {
    needDb();
    const p = await promoRule(1);
    const d = await mkDepK("A", { date: "2027-03-23", capacity: 20 });
    const h1 = await holdOk(pub(), [line(d, { promo: p.code })]), h2 = await holdOk(pub(), [line(d, { promo: p.code })]);
    V(await confirmT(h1), "คนแรก");
    const b2 = booker(); const r = await confirmT(h2, { booker: b2 });
    codeR(r, "PRICE_CHANGED", "คนที่สอง");
    info("D6-1", `details.reason = ${fmt(asRec(r.details)?.reason ?? null)}`);
    eq([await partiesOf(tA, b2), (await bksOfBasket(h2.v.basketId)).length, (await holdsOf(d)).filter((x) => x.basketId === h2.v.basketId).map((x) => x.status), await usedCount(p.id)], [0, 0, ["ACTIVE"], 1], "Party/การจอง/hold/usedCount");
  });
  await st("D6-2", `PUBLIC ล้มหลังขั้น Party: ขั้นเตรียมเห็นสิทธิ์ว่าง · สิทธิ์หมดก่อน redeem (ล็อกแถวของข้อสอบ) ⇒ PRICE_CHANGED{PROMO_EXHAUSTED} + ใบเสนอใหม่ยอดเต็ม ${FULL} สตางค์ · ไม่มี Party ของผู้จองนี้ · ไม่มีการจอง · ตะกร้า OPEN · hold ACTIVE ไม่ผูก · ตัวนับเท่าเดิม`, async () => {
    needDb();
    const p = await promoRule(1);
    const d = await mkDepK("B", { date: "2027-03-23", capacity: 20 });
    const h = await holdOk(pub(), [line(d, { promo: p.code })]);
    const before = await dep(d); const b = booker();
    const { r, waited } = await exhaustWhileBlocked(p.id, 1, () => confirmT(h, { booker: b }));
    ok(waited, `การยืนยันไม่ได้ไปรอที่ redeem (ไม่ถึงขั้นหลัง Party): ${fmt(r)}`);
    codeR(r, "PRICE_CHANGED", "ยืนยันเมื่อสิทธิ์หมดใน tx", "PROMO_EXHAUSTED");
    eq(asRec(asRec(asRec(asRec(r.details)?.quote)?.totals)?.payable)?.satang, FULL, "ยอดของใบเสนอใหม่ (ไม่มีส่วนลด)");
    const hr = (await holdsOf(d)).find((x) => x.basketId === h.v.basketId) ?? {};
    const bs = (await q<Rec>(`SELECT status FROM "SellBasket" WHERE id = $1`, [String(h.v.basketId)]))[0] ?? {};
    eq([await partiesOf(tA, b), (await bksOfBasket(h.v.basketId)).length, bs.status, hr.status, hr.bookingId ?? null, (await dep(d)).held, (await dep(d)).sold, await usedCount(p.id)],
      [0, 0, "OPEN", "ACTIVE", null, before.held, before.sold, 1], "Party/การจอง/ตะกร้า/hold/ผูก/held/sold/usedCount");
  });
  await st("D6-3", "STAFF bookTripsNow ล้มหลังขั้น Party: โค้ด 1 สิทธิ์หมดก่อน redeem ⇒ PRICE_CHANGED{PROMO_EXHAUSTED} · ไม่มี Party ของผู้จองนี้ · ไม่มีการจอง/ที่ถือ · ตัวนับเท่าเดิม", async () => {
    needDb();
    const p = await promoRule(1);
    const d = await mkDepK("C", { date: "2027-03-23", capacity: 20 });
    const ln = [line(d, { promo: p.code })];
    const qt = await bookNowQ(staff(), ln);
    const before = await dep(d); const b = booker();
    const { r, waited } = await exhaustWhileBlocked(p.id, 1, () => bookNowWith(staff(), ln, qt, b));
    ok(waited, `bookTripsNow ไม่ได้ไปรอที่ redeem: ${fmt(r)}`);
    codeR(r, "PRICE_CHANGED", "bookTripsNow เมื่อสิทธิ์หมดใน tx", "PROMO_EXHAUSTED");
    eq([await partiesOf(tA, b), (await q(`SELECT id FROM "TripBooking" WHERE "departureId" = $1`, [d])).length, (await holdsOf(d)).length, (await dep(d)).held, (await dep(d)).sold],
      [0, 0, 0, before.held, before.sold], "Party/การจอง/ที่ถือ/held/sold");
  });
  await st("D6-4", "แบบเรียงธรรมดา (STAFF bookTripsNow): ผู้จองแรกใช้สิทธิ์หมด · ผู้จองใหม่คนที่สองจองด้วยโค้ดเดิม (ใบเสนอเดิมที่ยังมีส่วนลด) ⇒ PRICE_CHANGED · ไม่มี Party · ไม่มีการจอง", async () => {
    needDb();
    const p = await promoRule(1);
    const d = await mkDepK("D", { date: "2027-03-23", capacity: 20 });
    const ln = [line(d, { promo: p.code })];
    const qt = await bookNowQ(staff(), ln);
    V(await bookNowWith(staff(), ln, qt, booker()), "คนแรก");
    const b2 = booker(); const r = await bookNowWith(staff(), ln, qt, b2);
    codeR(r, "PRICE_CHANGED", "คนที่สอง");
    info("D6-4", `details.reason = ${fmt(asRec(r.details)?.reason ?? null)}`);
    eq([await partiesOf(tA, b2), (await q(`SELECT id FROM "TripBooking" WHERE "departureId" = $1`, [d])).length, await usedCount(p.id)], [0, 1, 1], "Party/การจอง/usedCount");
  });
  groupLine("D6");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { console.log(`  🧹 cleanup: แถวที่เหลือของข้อสอบ ${await leftover(tenantIds)}`); } catch (e) { console.log(`  ⚠️ นับแถวที่เหลือ: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T0.4d · SLOT_BUSY · Party ไม่ซ้ำ · นับเฉพาะ PUBLIC · เพดานทั้งตะกร้า · ล้มหลัง Party =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
