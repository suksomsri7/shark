// QC — TRIPS W1.2b-1 · ผู้จองที่พิมพ์เบอร์ต่างจาก Party เดิม ต้องยืนยันตัวตนบนหน้าการจองได้ (ปิดแดงที่รู้จัก w1.2 C-12 · มติ W3 ของ W1.2a · หนี้ R11)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/W1.2b.md (ทางเลือก ก: เก็บผู้จองที่พิมพ์ไว้กับการจองใน policySnapshot.booker · เทียบเบอร์กับค่านั้น · ไม่มีค่า ⇒ Party เดิม)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวทั้งก่อนและหลังงาน · พิสูจน์ฟิกซ์เจอร์ + จับคู่ Party แบบเดิม + Party ไม่ถูกเขียนทับ)
//   M  เคสหลัก C-12 (เบอร์ที่พิมพ์ยืนยันได้ทุกรูป · ชื่อที่พิมพ์ถูกเก็บ · ผ่าน server action จริง)
//   OP เบอร์ของ Party (เบอร์เก่า · CRM แก้ภายหลัง · รวม Party) ไม่ใช่กุญแจของการจองที่มีเบอร์ที่พิมพ์
//   FB ทางสำรอง (การจองก่อนแก้ · STAFF ส่ง partyId · อีเมลอย่างเดียว · เบอร์สั้นกว่า 8 หลัก)
//   FS รูปผลผิดเหมือนกัน (เบอร์ผิด · เบอร์ Party เก่า · ไม่มีเบอร์ · ข้อมูลถูกลบ)
//   CC ยิงพร้อมกัน (ล็อกผู้จอง T0.4d D2/G1 ไม่ถอย)   RL เพดานลองผิด (K6 · L2) ไม่เปลี่ยน
//   ST จอร้าน (T1.3 รายการ/รายละเอียด · T1.4 ใบรายชื่อ) แสดงผู้จองตามที่พิมพ์   PII ไม่มีใน audit/outbox/log/VM สาธารณะ · ลบตาม T0.8
//   S  ขอบเขตไฟล์/กติกาโค้ด (ไม่แตะ party/platform/prisma · งบไฟล์ · ลำดับล็อกเดิม)
//   ── รอบผู้เขียนข้อสอบแยก 26 พ.ย. (ผู้คุมสั่งหลังรายงาน r1 · ข้อเพิ่มทั้งหมดเป็นของใหม่ ไม่แก้ข้อเดิม) ──
//   SN ตัวเขียน policySnapshot ทุกตัว (เลื่อนรอบพกต่อ · รายการตัวเขียน · ไม่ฟื้นหลังลบ)   RV ตัวอ่านการจองสาธารณะ (ผลทั้งก้อน · ขอบโมดูล)
//   SV จอร้านไม่มีเบอร์เต็ม/อีเมลที่พิมพ์ · ไม่มีสิทธิ์ = ไม่เห็น · รูปเบอร์ปิดบังของ 0066…   AF ผู้โจมตีเลือกทางสำรอง (เบอร์ normalize < 8 หลัก + ชื่อ+อีเมลของเหยื่อ)
//   ── มติผู้คุมรอบ 1 E1–E6 (ชนะ C-3 · ผู้เขียนข้อสอบแยกรอบ 2 · 26 พ.ย.) — ORACLE-EDIT FB-3 FB-4 AF-1 SN-2 S-1 ตามมติ ──
//   ER ลบลูกค้า (crm.contact.erased · member.erased ผ่าน consumers จริง) ⇒ แทนสำเนาที่พิมพ์ด้วยป้าย {v:1, erased:true} (E7)   E2 มีคีย์ ⇒ ไม่ถอยไป Party   E3 ขอบโมดูล/หน้า   E5 ไม่มีชนิดพกอีเมล   AU แฮชไม่รวมข้อมูลบุคคล
//
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-w12b-*` · ลบใน finally + กวาดค้างตอนเริ่ม · ค่าคาดหวังคิดเองจากมติ (ไม่เรียกโค้ดที่ถูกทดสอบเพื่อหาคำตอบ)
// 🔴 การจองสาธารณะสร้างผ่านเส้นจริงของ W1.2a (startBookHold → confirmBookHold) + ร้านรับเงิน (recordTripPayment STAFF) · การจองของร้าน = bookTripsNow STAFF PAY_LATER
// 🔴 "ก่อนแก้" (FB-1 · ST-4) จำลองด้วยการลบคีย์ booker ออกจาก snapshot ตรง ๆ หลังจอง (ฐานเก่าไม่มีคีย์นี้ · กู้ค่าที่พิมพ์ย้อนหลังไม่ได้)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-w1.2b.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน W1.2b-1 (ข้อชุดแรก 42 ข้อ): PC · S · FB-1 FB-2 · FS-2 · CC-1 CC-3 · RL-3 · ST-4 · PII-1..3 เขียว · ที่เหลือแดงพร้อมเหตุ (เบอร์ที่พิมพ์ไม่ถูกเก็บ/ไม่ใช่กุญแจ)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { changedOnlyByMainMerge, fromMainMerge } from "./trips-main-merge.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-w1.2b";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-w1.3) ═══════════════
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
const rid = (p: string) => `w12bqc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SLUG = "trips-w12b-";
const EMAIL_PREFIX = "trips-w12b-";
const HOUR = 3_600_000;
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
/** หา object ทุกชั้นที่ผ่านเงื่อนไข */
const findDeep = (v: unknown, pred: (r: Rec) => boolean, out: Rec[] = []): Rec[] => {
  if (Array.isArray(v)) for (const x of v) findDeep(x, pred, out);
  else { const r = asRec(v); if (r) { if (pred(r)) out.push(r); for (const x of Object.values(r)) findDeep(x, pred, out); } }
  return out;
};

// ═══════════════ สเปก (ใบสั่ง W1.2b-1) ═══════════════
const BASE_SHA = "696ea3c05"; // wip/trips-w1.2b = session/trips ตอนเขียนใบสั่ง
const BOOKING = "src/lib/modules/trips/booking.ts";
const PUBMOD = "src/lib/modules/trips/public-booking.ts";
const PDPA = "src/lib/modules/trips/pdpa.ts";
const SCREENS = "src/lib/modules/trips/booking-screens.ts";
const MANIFEST = "src/lib/modules/trips/manifest.ts";
const VIEWCORE = "src/lib/modules/trips/booking-view-core.ts";
const SSVC = "src/lib/platform/trips-self.ts";
const SCORE = "src/lib/platform/trips-self-core.ts";
const PARTY = "src/lib/modules/party";
/** ไฟล์ที่แก้ได้: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด] — ใบสั่ง §3 */
const REFUNDF = "src/lib/modules/trips/refund.ts";
const CONSUMERS = "src/lib/outbox-consumers.ts";
const FACADE = "src/lib/modules/trips/index.ts";
// ORACLE-EDIT S-1 (ผู้คุม 26 พ.ย. · มติ E1 E6): booking ≤ +14/−4 · refund ≤ +3/−2 · outbox-consumers ≤ +16/−0 (รั้ว trips) · ฟังก์ชันตัวรับ E1 หนึ่งตัวใน pdpa.ts หรือ public-booking.ts (+14)
//   · facade +2 (ส่งออกตัวรับ — ไม่อยู่ในมติ E6 · ผู้ร่างเผื่อ ให้ผู้คุมยืนยัน) · รวมทั้งใบ ≤ +110/−20
const LIMITED: [string, number, number][] = [[BOOKING, 4, 14], [PUBMOD, 3, 22], [PDPA, 1, 16], [SCREENS, 4, 12], [MANIFEST, 3, 8], [VIEWCORE, 2, 24], [REFUNDF, 2, 3], [CONSUMERS, 0, 16], [FACADE, 0, 2]];
const TOTAL_BUDGET = { add: 110, del: 20 };
/** ข้อสอบเดิมที่ผู้คุมสั่ง ORACLE-EDIT ในใบนี้ (มติ C-2) — ไม่ใช่ของผู้สร้าง */
const ORACLE_EDITED = ["scripts/qc-trips-w1.2.mts", "scripts/qc-trips-w1.3.mts"];
const FORBIDDEN_PATHS = ["prisma", "src", "next.config.ts", "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts", "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/trips-main-merge.mts", "scripts/visual-trips.mts",
  "scripts/qc-trips-*.mts", ":(exclude)scripts/qc-trips-w1.2b.mts", ...ORACLE_EDITED.map((f) => `:(exclude)${f}`), ...LIMITED.map(([f]) => `:(exclude)${f}`)];
const WRONG_LIMIT = 20; // K6 ผิดได้ 20 ครั้ง / 24 ชม. / การจอง (ไม่เปลี่ยน)
const X8_VERIFY = 5; // TRIPS-DEFAULTS X8 otpPer15Min (ไม่เปลี่ยน)
const R = FX.PRODUCT_RACHA;
const AD = R.adultSatang, CH = R.childSatang, PA = R.parkAdultSatang, PC_ = R.parkChildSatang;
const NOW0 = new Date("2027-03-01T03:00:00.000Z"); // 10:00 น. 1 มี.ค. 2570 (เวลาร้าน)
const at = (ms: number) => ({ now: new Date(NOW0.getTime() + ms) });
const N0 = at(0);
const AFTER = at(20_000);
const VMS = 60_000;
const VNOW = at(VMS);
const ACT = at(120_000);
const IP_PREFIX = "100.67.";
const PURGE_AT = new Date("2027-04-01T17:00:00.000Z"); // หมดเวลา 2 มี.ค. (ไทย) + X22 30 วัน (แบบ t0.8 RT-12)
const HOLD_EXPIRED_AT = new Date("2027-03-02T05:00:00.000Z");

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 24 });
const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t}`); };
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1] ?? ""); if (l.length) return l; }
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
    if (t === "USER-DEFINED") { v[c.column_name] = (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid WHERE ty.typname = $1 ORDER BY e.enumsortorder LIMIT 1`, [c.udt_name]))[0]?.l ?? null; continue; }
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
async function cleanupBuckets(tids: string[]) {
  if (!tids.length) return;
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "BusinessUnit" WHERE "tenantId" = ANY($1::text[])`, [tids])).map((r) => r.id);
    for (const t of tids) for (const p of ["book", "hold", "slot", "token", "confirm", "pub", "verify", "verifyb", "self"]) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:${p}:${t}:%`]);
    for (const u of us) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:view:${u}:%`]);
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
const tenantIds: string[] = [];
const usedClientKeys: string[] = [];

// ═══════════════ ดักข้อความ log ของโค้ดที่ถูกทดสอบ (PII-3) — เฉพาะช่วงที่เรียกบริการ/แพลตฟอร์ม ═══════════════
const logBuf: string[] = [];
let capN = 0;
{
  const c = console as unknown as Record<string, (...a: unknown[]) => void>;
  for (const m of ["log", "info", "warn", "error", "debug"]) {
    const orig = c[m]?.bind(console);
    if (!orig) continue;
    c[m] = (...a: unknown[]) => { if (capN > 0) logBuf.push(a.map((x) => (typeof x === "string" ? x : fmt(x))).join(" ")); orig(...a); };
  }
}
const captured = async <T,>(fn: () => Promise<T>): Promise<T> => { capN++; try { return await fn(); } finally { capN--; } };

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
  const PUBI = await tryImport("@/lib/platform/trips-public");
  const BSI = await tryImport("@/lib/platform/trips-book");
  const SSI = await tryImport("@/lib/platform/trips-self");
  const SCI = await tryImport("@/lib/platform/trips-self-core");
  const SETI = await tryImport("@/lib/core/settings");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const tfn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ไม่มี ${name}`); return f as AnyFn; };
  const tcall = async (name: string, ...a: unknown[]): Promise<Rec> => { const f = tfn(name); return captured(async () => { try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } }); };
  const bfn = (name: string): AnyFn => { const f = BSI.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`ไม่มี ${name} ของ W1.2a (${BSI.err.slice(0, 80)})`); return f as AnyFn; };
  const bcall = async (name: string, ...a: unknown[]): Promise<Rec> => { const f = bfn(name); return captured(async () => { try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } }); };
  const sfn = (name: string): AnyFn => { const f = SSI.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`ไม่มี ${name} ของ W1.3a (${SSI.err.slice(0, 80)})`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => { const f = sfn(name); return captured(async () => { try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } }); };
  const bookClientKey = (ip: string): string => {
    const f = PUBI.mod?.bookClientKey;
    if (typeof f !== "function") throw new AssertFail(`ไม่มี bookClientKey ของ W1.1 (${PUBI.err.slice(0, 80)})`);
    const k = (f as AnyFn)(ip);
    if (typeof k !== "string") throw new AssertFail(`bookClientKey(${ip}) ไม่คืนสตริง: ${fmt(k)}`);
    usedClientKeys.push(k);
    return k;
  };
  let ipN = 0;
  const IP_OF = new Map<string, string>();
  const ck = () => { ipN++; const ip = `${IP_PREFIX}${(ipN >> 8) & 255}.${ipN & 255}`; const k = bookClientKey(ip); IP_OF.set(k, ip); return k; };
  const ERR = (r: Rec, code: string, what: string) => { ok(r.ok === false && r.code === code, `${what}: ต้องได้ ${code} · ได้ ${fmt(r)}`); };
  const GRANT = (r: Rec, what: string) => { ok(r.ok === true && typeof r.grant === "string" && /^g1\.\d{1,12}\.[A-Za-z0-9_-]{22}$/.test(String(r.grant)), `${what}: ต้องได้ grant · ได้ ${fmt(r)}`); };

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), uA = rid("uA");
  const SA = `${SLUG}${STAMP}-a`;
  let setupErr = "", bookErr = "";
  type Prod = { id: string; slug: string; opt: string; unit: string; tenant: string; pt: Record<string, string> };
  const PRD: Record<string, Prod> = {};
  const DEP: Record<string, string> = {};
  const OWNER: Record<string, Rec> = {};
  const STAFF: Record<string, string> = {};
  const setV = async (tenantId: string, changes: Rec[]) => {
    const f = SETI.mod?.setSettings;
    if (typeof f !== "function") throw new AssertFail(`ไม่มี setSettings (${SETI.err.slice(0, 80)})`);
    const r = asRec(await (f as AnyFn)(OWNER[tenantId], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    if (r.ok !== true) throw new AssertFail(`setSettings ${changes.map((c) => String(c.key)).join(",")}: ${fmt(r)}`);
  };
  const mkDep = async (tag: string, date: string, capacity = 30): Promise<string> => {
    const p = PRD.A; if (!p) throw new AssertFail("ไม่มีสินค้า A");
    const startsAt = BKK(date, "08:00"); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8.5 * HOUR),
      status: "OPEN", capacity, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    DEP[tag] = id;
    return id;
  };
  try {
    for (const t of ["TripProduct", "TripOption", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "SellBasket", "TripHold", "TripBooking", "PaymentProfile", "ChatRateBucket", "Party", "AuditLog", "OutboxEvent"]) await needTable(t);
    await insertRow("Tenant", { id: tA, name: "ทดสอบ W1.2b", slug: SA, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(tA);
    await insertRow("BusinessUnit", { id: uA, tenantId: tA, type: "TRIPS", status: "ACTIVE", name: "หน่วย a", slug: `${SLUG}a-${STAMP}`, settings: JSON.stringify({}), updatedAt: new Date() });
    const u = rid("uo");
    await insertRow("User", { id: u, email: `${EMAIL_PREFIX}o-${STAMP}@shark.local`, name: "ผู้ทดสอบ o", updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mbo"), userId: u, tenantId: tA, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    OWNER[tA] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: u };
    STAFF[tA] = u;
    await insertRow("PaymentProfile", { id: rid("pp"), tenantId: tA, promptpayId: "0812345678", displayName: `ร้านทดสอบ W12b ${STAMP}`, updatedAt: new Date() });
    {
      const id = rid("pA"), opt = rid("oA");
      const slug = `w12bqc-a-${STAMP}`;
      await insertRow("TripProduct", { id, tenantId: tA, unitId: uA, slug, productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `${R.name} W12b`, en: "Racha test W12b" }),
        body: JSON.stringify({ summary: { th: "สรุป" } }), currency: "THB", deepDive: false, crossBorder: false, publishedAt: new Date("2027-01-01T00:00:00Z"), updatedAt: new Date() });
      await insertRow("TripOption", { id: opt, tenantId: tA, unitId: uA, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 510, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt: Record<string, string> = {};
      for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId: tA, unitId: uA, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code }),
        ageMin: code === "CHILD" ? R.childAge.min : code === "ADULT" ? 12 : null, ageMax: code === "CHILD" ? R.childAge.max : code === "INFANT" ? 3 : null, countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
      await insertRow("TripExtra", { id: rid("xpark"), tenantId: tA, unitId: uA, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: PA, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
        name: JSON.stringify({ th: "ค่าอุทยาน", en: "Marine park fee" }), paxPrices: JSON.stringify({ ADULT: PA, CHILD: PC_ }), active: true, sortOrder: 0, updatedAt: new Date() });
      for (const [code, amount] of [["ADULT", AD], ["CHILD", CH], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId: tA, unitId: uA, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD.A = { id, slug, opt, unit: uA, tenant: tA, pt };
    }
    await mkDep("gen", "2027-04-24", 120); await mkDep("r11", "2027-04-25", 30); await mkDep("ac", "2027-05-06", 30); await mkDep("pg", "2027-04-26", 30);
    await setV(tA, [{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uA, value: true }]);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const needFx = () => { ok(!setupErr && PRD.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); };

  // ── เบอร์: 06 + สุ่ม 4 หลัก + ตัวนับ 4 หลัก (4 ตัวท้ายไม่ซ้ำกันในรอบรัน ⇒ เบอร์ปิดบังของจอแยกกันได้) ──
  let phoneN = 0;
  const freshPhone = () => { phoneN++; return `06${String(parseInt(hex(2), 16) % 10_000).padStart(4, "0")}${String(phoneN).padStart(4, "0")}`; };
  const e164 = (local: string) => `+66${local.slice(1)}`;
  const forms = (local: string) => [local, e164(local), `+66 ${local.slice(1, 3)} ${local.slice(3, 6)} ${local.slice(6)}`, `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`, `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`];
  const maskOf = (local: string) => `${local.slice(0, 3)}-xxx-${local.slice(-4)}`; // รูปปิดบังของจอร้าน (booking-view-core maskPhone · T1.3)
  type Bk = { tag: string; token: string; id: string; code: string; phone: string; ck: string; dep: string };
  const BK: Record<string, Bk> = {};
  const staffCtx = (when = AFTER) => ({ tenantId: tA, unitId: uA, channel: "COUNTER", actor: { kind: "STAFF", userId: STAFF[tA] }, now: when.now });
  const idOfToken = async (token: string) => (await q<{ id: string; code: string }>(`SELECT id, code FROM "TripBooking" WHERE "publicTokenHash" = $1`, [sha256hex(token)]))[0];
  /** การจองสาธารณะผ่านเส้นจริงของ W1.2a: ผู้ใหญ่ 1 คน · ชื่อ/เบอร์/อีเมลตามที่ส่ง (เบอร์ส่งเป็นรูปที่ลูกค้าพิมพ์) · pay = ร้านรับเงินเต็ม */
  const mkPublic = async (tag: string, depTag: string, who: { name: string; phone: string; email?: string }, o: { pay?: boolean } = {}): Promise<Bk> => {
    const p = PRD.A as Prod;
    const date = String((await q<{ d: string }>(`SELECT "localDate"::text AS d FROM "TripDeparture" WHERE id = $1`, [DEP[depTag]]))[0]?.d ?? "");
    const devH = ck();
    const nonce = (purpose: "hold" | "confirm") => {
      const r = bfn("issueBookFormNonce")({ now: new Date(NOW0.getTime() - 60_000), scope: { tenantId: tA, purpose } });
      if (typeof r !== "string") throw new AssertFail(`issueBookFormNonce: ${fmt(r)}`);
      return r;
    };
    const sq: Rec = { "n.ADULT": "1" };
    const s0 = await bcall("quoteBookSelection", { shop: SA, productSlug: p.slug, query: { d: date, ...sq }, acceptLanguage: "th", clientKey: devH }, N0);
    const sum = asRec(s0.summary);
    ok(s0.ok === true && sum && typeof sum.slotToken === "string", `สรุปยอด ${tag}: ${fmt(s0)}`);
    const total = Number(sum?.totalSatang);
    const h = await bcall("startBookHold", { shop: SA, productSlug: p.slug, form: { d: date, t: String(sum?.slotToken), ...sq, nonce: nonce("hold"), seen: String(total) }, acceptLanguage: "th", clientKey: devH }, N0);
    ok(h.ok === true, `startBookHold ${tag}: ${fmt(h)}`);
    const c = await bcall("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, form: { name: who.name, phone: who.phone, email: who.email ?? "", accept: "on", nonce: nonce("confirm"), seen: String(total) }, clientKey: devH }, at(10_000));
    ok(c.ok === true && typeof c.token === "string", `confirmBookHold ${tag}: ${fmt(c)}`);
    const token = String(c.token);
    const row = await idOfToken(token);
    ok(row?.id, `ไม่พบการจองของ ${tag}`);
    if (o.pay !== false) {
      const pr = await tcall("recordTripPayment", staffCtx(), { bookingId: row?.id, amountSatang: total, tender: "PROMPTPAY", idempotencyKey: `w12bpay_${hex(8)}` });
      ok(pr.ok === true, `recordTripPayment ${tag}: ${fmt(pr)}`);
    }
    const b: Bk = { tag, token, id: String(row?.id), code: String(row?.code), phone: who.phone, ck: ck(), dep: DEP[depTag] ?? "" };
    BK[tag] = b;
    return b;
  };
  const lineOn = (depId: string | undefined) => ({ productKind: "TRIP", unitId: uA, productId: PRD.A?.id, slotId: depId, optionId: PRD.A?.opt, pax: [{ paxTypeId: PRD.A?.pt.ADULT, qty: 1 }] });
  const line = () => lineOn(DEP.gen);
  const quoteGen = async (): Promise<Rec> => {
    const qt = await tcall("quoteTrips", staffCtx(), { lines: [line()] });
    const qv = asRec(qt.value);
    ok(qt.ok === true && typeof qv?.quoteId === "string", `quoteTrips: ${fmt(qt)}`);
    return qv as Rec;
  };
  /** การจองของร้าน (bookTripsNow STAFF PAY_LATER · ผู้ใหญ่ 1 คน รอบ gen) — booker ตามที่ส่ง (ชื่อบังคับตาม bookerSchema) · qv = ใบเสนอราคาเดียวกันสำหรับชุดที่ยิงพร้อมกัน */
  const staffBookRaw = async (booker: Rec, qv0?: Rec): Promise<Rec> => {
    const qv = qv0 ?? (await quoteGen());
    return tcall("bookTripsNow", staffCtx(), { idempotencyKey: `w12bnow_${hex(8)}`, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, booker, pay: { method: "PAY_LATER" }, quote: { lines: [line()] } });
  };
  const mkStaff = async (tag: string, booker: Rec, phoneForBk = ""): Promise<Bk> => {
    const r = await staffBookRaw(booker);
    const ref = asArr(r.value)[0];
    ok(r.ok === true && typeof ref?.publicToken === "string" && typeof ref?.bookingId === "string", `bookTripsNow ${tag}: ${fmt(r)}`);
    const code = String((await q<{ code: string }>(`SELECT code FROM "TripBooking" WHERE id = $1`, [ref?.bookingId]))[0]?.code ?? "");
    const b: Bk = { tag, token: String(ref?.publicToken), id: String(ref?.bookingId), code, phone: phoneForBk, ck: ck(), dep: DEP.gen ?? "" };
    BK[tag] = b;
    return b;
  };

  // ── ผู้จองของข้อสอบ (ชื่อ+อีเมลเดียวกัน ⇒ Party เดียวกันตามกติกา party ขั้น 3) ──
  const NX = `ผู้จอง W12b ${STAMP}`, EX = `${EMAIL_PREFIX}x.${STAMP}@example.com`; // Party X
  const N2 = `คนชื่อใหม่ W12b ${STAMP}`; // ชื่อใหม่ เบอร์เดิมของ X (R11)
  const P: Record<string, string> = {};
  const who = (k: string) => { P[k] ??= freshPhone(); return P[k] as string; };
  // ORACLE-EDIT M-3 (ผู้เขียนข้อสอบ r3 · 26 พ.ย.): เบอร์ที่ร้านพิมพ์รูป 0066… ต้องไม่ขึ้นต้น 066 — normalizePartyPhone("0066 66…") ตัด 66 ซ้ำ (หนี้ของ modules/party · เบอร์มือถือ 066 จริง)
  //   เดิมสุ่มได้ 06 6… ราว 1 ใน 10 รอบ ⇒ M-3 แดงผิดเหตุ (รอบ r3) · ตอนนี้ P4 = 0617 + ตัวนับ
  P.P4 = `0617${String(900_000 + parseInt(hex(2), 16)).padStart(6, "0")}`;
  const partyOf = async (bookingId: string) => (await q<{ id: string; name: string; phone: string | null; phoneNorm: string | null; email: string | null; mergedIntoId: string | null; updatedAt: Date }>(
    `SELECT p.id, p.name, p.phone, p."phoneNorm", p.email, p."mergedIntoId", p."updatedAt" FROM "Party" p JOIN "TripBooking" t ON t."bookerPartyId" = p.id WHERE t.id = $1`, [bookingId]))[0];
  const snapOf = async (bookingId: string): Promise<Rec> => asRec((await q<{ s: unknown }>(`SELECT "policySnapshot" AS s FROM "TripBooking" WHERE id = $1`, [bookingId]))[0]?.s) ?? {};
  const typedOf = async (bookingId: string): Promise<unknown> => (await snapOf(bookingId)).booker;
  /** จำลองการจองก่อนแก้: ไม่มีคีย์ booker ใน snapshot */
  const makeLegacy = async (bookingId: string) => { await pool.query(`UPDATE "TripBooking" SET "policySnapshot" = "policySnapshot" - 'booker' WHERE id = $1`, [bookingId]); };
  let partyXBefore: Rec | null = null;
  const NV = `เหยื่อ W12b ${STAMP}`, EV = `${EMAIL_PREFIX}v.${STAMP}@example.com`; // AF-1
  const ATTACK_PHONE = "+00661234"; // ผ่านรูป "+ 8–15 หลัก" ของ bookerPhoneOf · normalizePartyPhone ⇒ "1234" (< 8 หลัก)
  const NOVIEW: { id: string } = { id: "" };
  const NE = `ผู้จอง E ${STAMP}`, EE = `${EMAIL_PREFIX}e.${STAMP}@example.com`; // E1
  const tB = rid("tB"), uB = rid("uB");
  const OTHER_T: { bookingId: string } = { bookingId: "" };
  const REFREQ: { rfb1: string; rfl: string } = { rfb1: "", rfl: "" };
  if (!setupErr) {
    try {
      await mkPublic("A0", "gen", { name: NX, phone: who("P1"), email: EX });
      const x0 = await partyOf(BK.A0?.id ?? "");
      partyXBefore = x0 ? { ...x0 } : null;
      await mkPublic("A1", "gen", { name: NX, phone: who("P2"), email: EX }); // C-12: ชื่อ+อีเมลตรง X · เบอร์ใหม่
      await mkPublic("A2", "r11", { name: N2, phone: who("P1") }); // R11: เบอร์ตรง X · ชื่อใหม่ · ไม่มีอีเมล
      await mkPublic("Q0", "gen", { name: `ผู้จอง Q ${STAMP}`, phone: who("Q1"), email: `${EMAIL_PREFIX}q.${STAMP}@example.com` });
      await mkPublic("Q1", "gen", { name: `ผู้จอง Q ${STAMP}`, phone: who("Q2"), email: `${EMAIL_PREFIX}q.${STAMP}@example.com` });
      await mkPublic("Z0", "gen", { name: `ผู้จอง Z ${STAMP}`, phone: who("Z1"), email: `${EMAIL_PREFIX}z.${STAMP}@example.com` });
      await mkPublic("Z1", "gen", { name: `ผู้จอง Z ${STAMP}`, phone: who("Z2"), email: `${EMAIL_PREFIX}z.${STAMP}@example.com` });
      await mkPublic("R0", "gen", { name: `ผู้จอง R ${STAMP}`, phone: who("R1"), email: `${EMAIL_PREFIX}r.${STAMP}@example.com` });
      await mkPublic("R1", "gen", { name: `ผู้จอง R ${STAMP}`, phone: who("R2"), email: `${EMAIL_PREFIX}r.${STAMP}@example.com` });
      await mkPublic("R2", "gen", { name: `ผู้จอง R ${STAMP}`, phone: who("R3"), email: `${EMAIL_PREFIX}r.${STAMP}@example.com` });
      await mkPublic("L1", "gen", { name: NX, phone: who("P5"), email: EX }); // ก่อนแก้ (ลบคีย์ด้านล่าง)
      await mkPublic("F1", "gen", { name: `ผู้จอง F ${STAMP}`, phone: who("F1") }); // ข้อมูลผู้จองถูกลบ (FS-2)
      await mkPublic("AC0", "ac", { name: `ผู้จอง AC ${STAMP}`, phone: who("AC1"), email: `${EMAIL_PREFIX}ac.${STAMP}@example.com` });
      await mkPublic("AC1", "ac", { name: `ผู้จอง AC ${STAMP}`, phone: who("AC2"), email: `${EMAIL_PREFIX}ac.${STAMP}@example.com` });
      await mkPublic("PG", "pg", { name: `ผู้จอง PG ${STAMP}`, phone: who("PG"), email: `${EMAIL_PREFIX}pg.${STAMP}@example.com` }, { pay: false }); // HOLD → EXPIRED → ลบ (PII-4)
      await mkStaff("S0066", { name: NX, phone: `0066${who("P4").slice(1)}`, email: EX }, who("P4")); // ร้านพิมพ์ 0066… · ชื่อ+อีเมลตรง X
      await mkStaff("SPID", { name: NX, phone: e164(who("P6")), partyId: BK.A0 ? (await partyOf(BK.A0.id))?.id : "" }, who("P6")); // ร้านเลือก Party X + พิมพ์เบอร์อื่น
      await mkStaff("SMAIL", { name: NX, email: EX }); // อีเมลอย่างเดียว ⇒ X
      await mkStaff("SSHORT", { name: NX, phone: "081234", email: EX }, "081234"); // เบอร์ < 8 หลัก ⇒ ไม่จับเบอร์ · ชื่อ+อีเมล ⇒ X
      await mkStaff("SNONE", { name: `ไม่มีเบอร์ W12b ${STAMP}`, email: `${EMAIL_PREFIX}n.${STAMP}@example.com` }); // คนใหม่ ไม่มีเบอร์ใดเลย
      // ── รอบผู้เขียนข้อสอบแยก (26 พ.ย. · ผู้คุมสั่งเพิ่ม a–f) ──
      await mkStaff("SCHG", { name: NX, phone: e164(who("CH1")), email: EX }, who("CH1")); // CONFIRMED ของร้าน มีค่าที่พิมพ์ ⇒ เลื่อนรอบ (SN-1)
      await mkPublic("CHP", "gen", { name: `ผู้จอง CHP ${STAMP}`, phone: who("CH2"), email: `${EMAIL_PREFIX}chp.${STAMP}@example.com` }); // PAID สาธารณะ ⇒ เลื่อนรอบ (SN-1)
      await mkPublic("PG2", "pg", { name: `ผู้จอง PG2 ${STAMP}`, phone: who("PG2"), email: `${EMAIL_PREFIX}pg2.${STAMP}@example.com` }, { pay: false }); // HOLD ⇒ ลบ ⇒ แก้ค้าง (SN-3)
      await mkStaff("S66", { name: `ผู้จอง 0066 ${STAMP}`, phone: "0066812345678" }, "0812345678"); // รูปเบอร์ปิดบัง (SV-3)
      await mkPublic("VB", "gen", { name: NV, phone: who("PV"), email: EV }); // เหยื่อ: สร้าง Party V
      await mkPublic("FA", "gen", { name: NV, phone: ATTACK_PHONE, email: EV }); // ผู้โจมตี: ชื่อ+อีเมลของเหยื่อ + เบอร์ที่ normalize < 8 หลัก (AF-1)
      { // ผู้ใช้ที่ไม่มีสิทธิ์ดูการจอง (มีแค่ดูสินค้า)
        const id = rid("upv");
        await insertRow("User", { id, email: `${EMAIL_PREFIX}pv-${STAMP}@shark.local`, name: "ผู้ทดสอบ pv", updatedAt: new Date() });
        await insertRow("Membership", { id: rid("mbpv"), userId: id, tenantId: tA, role: "STAFF", unitAccess: JSON.stringify([uA]), permissions: JSON.stringify({ "trips.product.view": true }), acceptedAt: new Date(), updatedAt: new Date() });
        NOVIEW.id = id;
      }
      // ── มติ E1–E5 (ผู้เขียนข้อสอบแยก รอบ 2 · 26 พ.ย.) ──
      await mkPublic("E0", "gen", { name: NE, phone: who("PE1"), email: EE }); // Party E (ลบผ่าน CRM)
      await mkPublic("E1", "gen", { name: NE, phone: who("PE2"), email: EE });
      await mkPublic("E0L", "gen", { name: NE, phone: who("PE3"), email: EE }); // ของ Party E ที่ทำเป็น "ก่อนแก้" (ไม่มีคีย์) ด้านล่าง
      await mkPublic("M0", "gen", { name: `ผู้จอง M ${STAMP}`, phone: who("PM"), email: `${EMAIL_PREFIX}m.${STAMP}@example.com` }); // Party M (ลบผ่านสมาชิก)
      await mkPublic("U0", "gen", { name: `ผู้จอง U ${STAMP}`, phone: who("PU"), email: `${EMAIL_PREFIX}u.${STAMP}@example.com` }); // Party U (CRM ตัดการผูก ไม่ล้าง Party)
      for (const [tag, ph] of [["E2a", "+66123456"], ["E2b", "+00661234567"], ["E2c", "+6612345678"]] as const) await mkPublic(tag, "gen", { name: NX, phone: ph, email: EX });
      await mkStaff("E2s", { name: NX, phone: "08123456", email: EX }, "08123456");
      await mkPublic("RFB1", "gen", { name: `ผู้จอง RF1 ${STAMP}`, phone: who("RF1"), email: `${EMAIL_PREFIX}rf1.${STAMP}@example.com` });
      await mkPublic("RFB2", "gen", { name: `ผู้จอง RF2 ${STAMP}`, phone: who("RF2"), email: `${EMAIL_PREFIX}rf2.${STAMP}@example.com` });
      await mkPublic("RFL", "gen", { name: `ผู้จอง RFL ${STAMP}`, phone: who("RFL"), email: `${EMAIL_PREFIX}rfl.${STAMP}@example.com` });
      await mkStaff("SAU", { name: `ผู้จอง AU ${STAMP}`, phone: e164(who("AU")) }, who("AU"));
      await makeLegacy(BK.RFL?.id ?? "");
      await makeLegacy(BK.E0L?.id ?? "");
      { // ร้านอื่น (tB): การจองที่ชี้ id ของ Party E (ปลูกตรง) — ตัวรับของร้าน A ห้ามแตะ
        await insertRow("Tenant", { id: tB, name: "ทดสอบ W1.2b b", slug: `${SA}-b`, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(tB);
        await insertRow("BusinessUnit", { id: uB, tenantId: tB, type: "TRIPS", status: "ACTIVE", name: "หน่วย b", slug: `${SLUG}b-${STAMP}`, settings: JSON.stringify({}), updatedAt: new Date() });
        const pe = (await partyOf(BK.E0?.id ?? ""))?.id ?? "";
        OTHER_T.bookingId = await insertRow("TripBooking", { id: rid("bkB"), tenantId: tB, unitId: uB, code: `QB-${hex(3)}`, publicTokenHash: sha256hex(rid("tok")), status: "PAID", productId: rid("p"), departureId: rid("d"), travelDate: "2027-04-24",
          channel: "WEB", collectMode: "SHOP", payMethod: "PAY_NOW", bookerPartyId: pe, contactRoute: "DIRECT", currency: "THB", accountingState: "NONE", version: 0,
          policySnapshot: JSON.stringify({ v: 1, booker: { v: 1, name: NE, phone: e164(who("PE1")), email: EE } }), updatedAt: new Date() });
      }
      await makeLegacy(BK.L1?.id ?? "");
    } catch (e) { bookErr = e instanceof AssertFail ? e.message : errMsg(e); console.log(`  ⚠️ สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`); }
  }
  const needBk = (...tags: string[]): Bk[] => { needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`); return tags.map((t) => { const b = BK[t]; ok(b, `ไม่มีการจอง ${t}`); return b as Bk; }); };
  const needSelf = () => { ok(SSI.mod, `ยังไม่มี platform/trips-self (W1.3a · ${SSI.err.slice(0, 60)})`); };

  // ── ยืนยันเบอร์ (แบบ qc-trips-w1.3 · nonce verify ผูก token) ──
  const snonce = (b: Bk, ms: number): string => {
    const r = sfn("issueSelfFormNonce")({ now: new Date(NOW0.getTime() + ms), scope: { tenantId: tA, purpose: "verify", token: b.token } });
    if (typeof r !== "string" || !r) throw new AssertFail(`issueSelfFormNonce ไม่คืนสตริง: ${fmt(r)}`);
    return r;
  };
  /** ทุกครั้งใช้กุญแจเครื่องใหม่ (ถังเครื่อง X8 ไม่กวน) เว้นแต่ระบุ */
  const verify = (b: Bk, phone: string, o: { clientKey?: string; when?: { now: Date } } = {}) => {
    const when = o.when ?? VNOW;
    return call("verifyBookSelf", { shop: SA, token: b.token, form: { phone, nonce: snonce(b, when.now.getTime() - NOW0.getTime() - 60_000) }, clientKey: o.clientKey ?? ck() }, when);
  };
  const lockKeyOf = (b: Bk) => `trips:verifyb:${tA}:${sha256hex(sha256hex(b.token)).slice(0, 24)}`;
  const wrongCount = async (b: Bk) => Number((await q<{ count: number }>(`SELECT count FROM "ChatRateBucket" WHERE key = $1`, [lockKeyOf(b)]))[0]?.count ?? 0);
  const typedRed = (v: unknown, what: string) => ok(asRec(v), `${what}: snapshot ไม่มีผู้จองที่พิมพ์ (policySnapshot.booker) — W1.2b-1 ยังไม่เก็บ`);

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม (เขียวก่อนและหลังงาน) ──");
  await st("PC-1", "ฟิกซ์เจอร์: การจอง A0 (ชื่อ+อีเมล X · เบอร์ P1) ผ่านเส้นจริงของ W1.2a + ร้านรับเงิน ⇒ PAID · Party X เบอร์ P1 (E.164) · ยืนยันด้วย P1 ได้ (W1.3a ทำงานกับการจองที่ไม่โดนบั๊ก)", async () => {
    needSelf(); const [a0] = needBk("A0");
    const x = await partyOf(a0.id);
    eq([(await q<{ status: string }>(`SELECT status FROM "TripBooking" WHERE id = $1`, [a0.id]))[0]?.status, x?.phone, x?.phoneNorm, x?.name, x?.email], ["PAID", e164(who("P1")), who("P1"), NX, EX], "การจอง/Party X");
    GRANT(await verify(a0, who("P1")), "A0 + P1");
  });
  await st("PC-2", "เหตุของ C-12 ยังเกิดเหมือนเดิม (ใบนี้ไม่แตะ modules/party): A1 = ชื่อ+อีเมล X เบอร์ใหม่ P2 ⇒ bookerPartyId = X · แถว Party X ไม่ถูกเขียนทับ (ชื่อ/เบอร์/อีเมล/updatedAt เท่าเดิม · กันทางเลือก ข)", async () => {
    const [a0, a1] = needBk("A0", "A1");
    const x0 = await partyOf(a0.id), x1 = await partyOf(a1.id);
    eq(x1?.id, x0?.id, "A1 ชี้ Party X");
    ok(partyXBefore, "ไม่มีภาพ Party X ก่อน A1");
    eq([x1?.name, x1?.phone, x1?.phoneNorm, x1?.email, x1?.updatedAt?.toISOString()], [partyXBefore?.name, partyXBefore?.phone, partyXBefore?.phoneNorm, partyXBefore?.email, (partyXBefore?.updatedAt as Date | undefined)?.toISOString()], "Party X");
    ok(x1?.phoneNorm !== who("P2"), "Party X ถูกเปลี่ยนเป็นเบอร์ที่พิมพ์ (ทางเลือก ข ถูกปฏิเสธ)");
  });
  await st("PC-3", "เบอร์ตรง Party เดิมแต่ชื่อใหม่ (A2: ชื่อ N2 · เบอร์ P1) ⇒ Party X (จับด้วยเบอร์) · ยืนยันด้วย P1 ได้", async () => {
    needSelf(); const [a0, a2] = needBk("A0", "A2");
    eq((await partyOf(a2.id))?.id, (await partyOf(a0.id))?.id, "A2 ชี้ Party X");
    GRANT(await verify(a2, who("P1")), "A2 + P1");
  });
  await st("PC-4", "กติกาฟอร์มยืนยันเดิม: เบอร์รูป 0066… / สั้น / มีตัวอักษร ⇒ INVALID[phone] · ไม่นับครั้งผิดของการจอง", async () => {
    needSelf(); const [a0] = needBk("A0");
    const n0 = await wrongCount(a0);
    for (const p of [`0066${who("P1").slice(1)}`, "0812", "08a1234567"]) { const r = await verify(a0, p); eq([r.ok, r.code, r.fields], [false, "INVALID", ["phone"]], `ฟอร์ม ${p.length} ตัว`); }
    eq(await wrongCount(a0), n0, "ถังผิดของการจอง");
  });
  await st("PC-5", `ค่าคงที่ของ W1.3a ไม่เปลี่ยน: ผิดได้ ${WRONG_LIMIT} ครั้ง/24 ชม./การจอง · ถังเครื่อง X8 = ${X8_VERIFY}/15 นาที`, async () => {
    eq([SCI.mod?.SELF_WRONG_PER_BOOKING, SCI.mod?.SELF_WRONG_WINDOW_SEC], [WRONG_LIMIT, 86_400], "trips-self-core");
    const rs = SETI.mod?.resolveSettings;
    ok(typeof rs === "function", "ไม่มี resolveSettings");
    const v = asRec(await (rs as AnyFn)({ tenantId: tA }, ["trips.public.rateLimits"], { unitId: uA }, ACT.now)) ?? {};
    eq(asRec(asRec(v["trips.public.rateLimits"])?.value)?.otpPer15Min, X8_VERIFY, "X8");
  });
  groupLine("PC");

  // ═══════════════ M. เคสหลัก ═══════════════
  console.log("\n── M: เบอร์ที่ผู้จองพิมพ์ = กุญแจยืนยันของการจองนั้น ──");
  await st("M-1", "C-12: A1 (ชื่อ+อีเมลตรง Party X · พิมพ์เบอร์ใหม่ P2) ⇒ ยืนยันด้วย P2 (รูป 08…) ได้ grant — วันนี้ VERIFY_FAILED", async () => {
    needSelf(); const [a1] = needBk("A1");
    GRANT(await verify(a1, who("P2")), "A1 + P2");
  });
  await st("M-2", "เบอร์ที่พิมพ์ยืนยันได้ทุกรูปที่ฟอร์มรับ: 08… · +66… · +66 8x xxx xxxx · 08x-xxx-xxxx · 08x xxx xxxx (เครื่องละครั้ง) · ไม่นับครั้งผิด", async () => {
    needSelf(); const [a1] = needBk("A1");
    const n0 = await wrongCount(a1);
    for (const [i, p] of forms(who("P2")).entries()) GRANT(await verify(a1, p), `รูปที่ ${i + 1}`);
    eq(await wrongCount(a1), n0, "ถังผิดของการจอง");
  });
  await st("M-3", "ร้านพิมพ์เบอร์ผู้จองรูป 0066… (bookTripsNow · ชื่อ+อีเมลตรง X) ⇒ ยืนยันด้วย 08… และ +66… ได้ · snapshot เก็บเบอร์ตามที่ส่ง (ตัดช่องว่างหัวท้าย)", async () => {
    needSelf(); const [s] = needBk("S0066");
    const t = await typedOf(s.id); typedRed(t, "S0066");
    eq(t, { v: 1, name: NX, phone: `0066${who("P4").slice(1)}`, email: EX }, "policySnapshot.booker");
    for (const p of [who("P4"), e164(who("P4"))]) GRANT(await verify(s, p), `S0066 + ${p.startsWith("+") ? "+66" : "08"}`);
  });
  await st("M-4", "รูปที่เก็บ (สาธารณะ): policySnapshot.booker = { v: 1, name: ชื่อ NFC ตัดช่องว่าง, phone: E.164 ที่แพลตฟอร์มส่ง, email: ตัวเล็ก } ทุกการจองของตะกร้า · ไม่มีคีย์อื่น", async () => {
    const [a1] = needBk("A1");
    eq(await typedOf(a1.id), { v: 1, name: NX, phone: e164(who("P2")), email: EX }, "policySnapshot.booker ของ A1");
  });
  await st("M-5", "R11: ชื่อที่พิมพ์ถูกเก็บแม้ Party เดิมชื่ออื่น (A2) · ไม่มีอีเมล ⇒ email null · Party X ยังชื่อเดิม", async () => {
    const [a2] = needBk("A2");
    eq(await typedOf(a2.id), { v: 1, name: N2, phone: e164(who("P1")), email: null }, "policySnapshot.booker ของ A2");
    eq((await partyOf(a2.id))?.name, NX, "Party X ชื่อเดิม");
  });
  // ── ผ่าน server action จริง (แบบ qc-trips-w1.3 P1 · นาฬิกาจริง) ──
  (globalThis as Rec).AsyncLocalStorage ??= AsyncLocalStorage;
  const nWork = asRec(await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null));
  const nUnit = asRec(await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null));
  const nCookies = asRec(await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null));
  const ACTI = await tryImport("@/app/book/[shop]/my/actions");
  const BSC = await tryImport("@/components/book/BookSelf");
  type Redir = { kind: "REDIRECT" | "NOT_FOUND" | "RETURN" | "THROW"; url: string; q: URLSearchParams; err: string };
  const runAction = async (name: string, ip: string, args: unknown[]): Promise<Redir> => {
    const fn = ACTI.mod?.[name];
    ok(typeof fn === "function", `โหลด ${name} จาก my/actions.ts ไม่ได้ (${ACTI.err.slice(0, 100)})`);
    const ws = asRec(nWork?.workAsyncStorage), us = asRec(nUnit?.workUnitAsyncStorage), RC = nCookies?.RequestCookies;
    ok(ws && us && typeof RC === "function", "หาขอบเขตคำขอของ Next ไม่ได้ (work-async-storage)");
    const req = new Request("http://qc.local/book/x/my/y", { method: "POST", headers: { "x-real-ip": ip, "accept-language": "th", "user-agent": "qc-w12b-action", "content-type": "multipart/form-data; boundary=x", "next-action": "qc" } });
    const jar = new (RC as new (h: Headers) => unknown)(req.headers);
    const workStore = { route: "/book/[shop]/my/[token]", page: "/book/[shop]/my/[token]/page", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
    const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname: "/book/x/my/y", search: "" } };
    capN++;
    try {
      await (ws?.run as AnyFn).call(ws, workStore, () => (us?.run as AnyFn).call(us, unit, () => (fn as AnyFn)(...args)));
      return { kind: "RETURN", url: "", q: new URLSearchParams(), err: "" };
    } catch (e) {
      const d = String(asRec(e)?.digest ?? "");
      if (d.startsWith("NEXT_REDIRECT")) { const url = d.split(";")[2] ?? ""; return { kind: "REDIRECT", url, q: new URL(url, "http://x").searchParams, err: "" }; }
      if (/NEXT_HTTP_ERROR_FALLBACK;404/.test(d)) return { kind: "NOT_FOUND", url: "", q: new URLSearchParams(), err: "" };
      return { kind: "THROW", url: "", q: new URLSearchParams(), err: errMsg(e) };
    } finally { capN--; }
  };
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  const unent = (h: string) => h.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const html = (name: string, props: Rec): string => {
    const C = BSC.mod?.[name];
    ok(typeof C === "function", `โหลด ${name} จาก components/book/BookSelf ไม่ได้ (${BSC.err.slice(0, 80)})`);
    return renderToStaticMarkup(createElement(C as never, props as never));
  };
  const NOOP = async () => {};
  const NONCE_RE = /^[A-Za-z0-9_-]{22}\.\d{1,12}\.[A-Za-z0-9_-]{22}$/;
  const stringsDeep = (v: unknown, skip: unknown, out: string[] = []): string[] => {
    if (v === skip) return out;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const x of v) stringsDeep(x, skip, out);
    else if (v !== null && typeof v === "object") for (const x of Object.values(v as Rec)) stringsDeep(x, skip, out);
    return out;
  };
  const formDataOf = (h: string, typed: Record<string, string> = {}): FormData => {
    const fd = new FormData();
    for (const tag of h.match(/<input\b[^>]*>/g) ?? []) {
      const name = /\bname="([^"]*)"/.exec(tag)?.[1];
      if (!name) continue;
      const type = /\btype="([^"]*)"/.exec(tag)?.[1] ?? "text";
      const value = unent(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? "");
      if (type === "hidden") fd.append(name, value);
      else if (type === "checkbox") fd.append(name, value || "on");
      else if (name in typed) fd.append(name, typed[name] ?? "");
    }
    return fd;
  };
  const verifyViaAction = async (b: Bk, phone: string): Promise<Redir> => {
    const devK = ck();
    const o = await bcall("openBookReservation", { shop: SA, token: b.token, lang: "th", acceptLanguage: "th", clientKey: devK });
    ok(o.ok === true, `เปิดหน้า (นาฬิกาจริง) ${b.tag}: ${fmt(o)}`);
    const nonce = stringsDeep(o, asRec(asRec(o.vm)?.manage)).find((x) => NONCE_RE.test(x));
    ok(nonce, "ผลของตัวเปิดหน้าไม่มี nonce ฟอร์มยืนยันเบอร์ (มติ L6 ของ W1.3)");
    const fd = formDataOf(html("BookSelfVerify", { action: NOOP, nonce, locale: "th", error: null }), { phone });
    await sleep(1_200);
    return runAction("verifySelfAction", IP_OF.get(devK) ?? "", [SA, b.token, fd]);
  };
  await st("M-6", "ผ่าน verifySelfAction (FormData จากฟอร์ม BookSelfVerify จริง · นาฬิกาจริง): AC1 (ชื่อ+อีเมลตรง Party ของ AC0 · เบอร์ใหม่) + เบอร์ที่พิมพ์ ⇒ redirect ?do=cancel&g=<grant>", async () => {
    needSelf(); const [b] = needBk("AC1");
    const r = await verifyViaAction(b, who("AC2"));
    const g = r.q.get("g") ?? "";
    ok(r.kind === "REDIRECT" && /^g1\.\d{1,12}\.[A-Za-z0-9_-]{22}$/.test(g) && r.q.get("do") === "cancel", `ผล: ${fmt([r.kind, r.url.replace(/\/my\/[^?]+/, "/my/…").replace(/g=[^&]+/, "g=…"), r.err])}`);
  });
  await st("M-7", "ผ่าน verifySelfAction: AC1 + เบอร์ของ Party (เบอร์ของ AC0) ⇒ redirect กลับพร้อม e=VERIFY_FAILED ไม่มี g", async () => {
    needSelf(); const [b] = needBk("AC1");
    const r = await verifyViaAction(b, who("AC1"));
    ok(r.kind === "REDIRECT" && r.q.get("e") === "VERIFY_FAILED" && !r.q.get("g"), `ผล: ${fmt([r.kind, r.url.replace(/\/my\/[^?]+/, "/my/…").replace(/g=[^&]+/, "g=…"), r.err])}`);
  });
  groupLine("M");

  // ═══════════════ OP. เบอร์ของ Party ═══════════════
  console.log("\n── OP: เบอร์ของ Party ไม่ใช่กุญแจของการจองที่มีเบอร์ที่พิมพ์ ──");
  await st("OP-1", "A1 + เบอร์ของ Party X (P1 = เบอร์ของผู้จองคนก่อน) ⇒ VERIFY_FAILED · นับเป็นครั้งผิด +1 — วันนี้ได้ grant", async () => {
    needSelf(); const [a1] = needBk("A1");
    const n0 = await wrongCount(a1);
    ERR(await verify(a1, who("P1")), "VERIFY_FAILED", "A1 + P1");
    eq(await wrongCount(a1), n0 + 1, "ถังผิดของการจอง");
  });
  await st("OP-2", "ร้านแก้เบอร์ของ Party ใน CRM หลังจอง (Party Q ⇒ เบอร์ Q9): Q1 ยังยืนยันด้วยเบอร์ที่พิมพ์ Q2 ได้ · Q9 ⇒ VERIFY_FAILED · Q0 (ผู้สร้าง Party) ยืนยันด้วยเบอร์ที่พิมพ์ของตัวเอง Q1 ได้แม้ Party เปลี่ยนเบอร์แล้ว", async () => {
    needSelf(); const [q0, q1] = needBk("Q0", "Q1");
    const pq = await partyOf(q1.id);
    eq(pq?.id, (await partyOf(q0.id))?.id, "Q1 ชี้ Party ของ Q0");
    const q9 = who("Q9");
    await pool.query(`UPDATE "Party" SET phone = $2, "phoneNorm" = $3, "updatedAt" = now() WHERE id = $1`, [pq?.id, e164(q9), q9]); // แบบ updateContactInfo ของ CRM
    GRANT(await verify(q1, who("Q2")), "Q1 + Q2 (ที่พิมพ์)");
    ERR(await verify(q1, q9), "VERIFY_FAILED", "Q1 + Q9 (CRM)");
    GRANT(await verify(q0, who("Q1")), "Q0 + Q1 (ที่พิมพ์ของ Q0)");
  });
  await st("OP-3", "Party ถูกรวม (Z ⇒ W ที่มีเบอร์ W1): Z1 ยืนยันด้วยเบอร์ที่พิมพ์ Z2 ได้ · เบอร์ของ Z (Z1) และของ W ⇒ VERIFY_FAILED", async () => {
    needSelf(); const [z0, z1] = needBk("Z0", "Z1");
    const pz = await partyOf(z1.id);
    eq(pz?.id, (await partyOf(z0.id))?.id, "Z1 ชี้ Party ของ Z0");
    const w1 = who("W1");
    const pw = await insertRow("Party", { id: rid("pw"), tenantId: tA, kind: "PERSON", name: `ผู้จอง W ${STAMP}`, phone: e164(w1), phoneNorm: w1, updatedAt: new Date() });
    await pool.query(`UPDATE "Party" SET "mergedIntoId" = $2 WHERE id = $1`, [pz?.id, pw]); // แบบ mergeParties
    GRANT(await verify(z1, who("Z2")), "Z1 + Z2 (ที่พิมพ์)");
    ERR(await verify(z1, who("Z1")), "VERIFY_FAILED", "Z1 + เบอร์ของ Z");
    ERR(await verify(z1, w1), "VERIFY_FAILED", "Z1 + เบอร์ของ W");
  });
  groupLine("OP");

  // ═══════════════ FB. ทางสำรอง ═══════════════
  console.log("\n── FB: ไม่มีเบอร์ที่พิมพ์ที่ใช้ได้ ⇒ เบอร์ของ Party (แบบเดิม) ──");
  await st("FB-1", "การจองก่อนแก้ (ไม่มีคีย์ booker · L1 ชื่อ+อีเมล X พิมพ์ P5): ยืนยันด้วยเบอร์ของ Party X (P1) ได้ · P5 ⇒ VERIFY_FAILED (กู้ย้อนหลังไม่ได้ — ตรงกับวันนี้)", async () => {
    needSelf(); const [l1] = needBk("L1");
    eq((await snapOf(l1.id)).booker, undefined, "ไม่มีคีย์ booker");
    GRANT(await verify(l1, who("P1")), "L1 + P1");
    ERR(await verify(l1, who("P5")), "VERIFY_FAILED", "L1 + P5");
  });
  await st("FB-2", "ร้านเลือก Party X (partyId) + พิมพ์เบอร์อื่น P6 ⇒ ไม่มีคีย์ booker (ร้านเลือกบุคคลจาก CRM เอง) · ยืนยันด้วย P1 ได้ · P6 ⇒ VERIFY_FAILED", async () => {
    needSelf(); const [s] = needBk("SPID");
    eq([(await partyOf(s.id))?.phoneNorm, (await snapOf(s.id)).booker], [who("P1"), undefined], "Party X · ไม่มีคีย์ booker");
    GRANT(await verify(s, who("P1")), "SPID + P1");
    ERR(await verify(s, who("P6")), "VERIFY_FAILED", "SPID + P6");
  });
  await st("FB-3", "ร้านจองด้วยอีเมลอย่างเดียว (ชื่อ+อีเมลตรง X) ⇒ booker { phone: null, email } · E2: ไม่มีเบอร์ที่พิมพ์ ⇒ ยืนยันไม่ได้ (เบอร์ของ Party X ก็ไม่ได้)", async () => {
    needSelf(); const [s] = needBk("SMAIL");
    eq(await typedOf(s.id), { v: 1, name: NX, phone: null, email: EX }, "policySnapshot.booker");
    // ORACLE-EDIT FB-3 (ผู้คุม 26 พ.ย. · มติ E2 แทน C-3): มีคีย์ booker แต่ไม่มีเบอร์ ⇒ ไม่มีใครยืนยันได้ (ไม่ถอยไปเบอร์ของ Party)
    ERR(await verify(s, who("P1")), "VERIFY_FAILED", "SMAIL + P1 (เบอร์ของ Party)");
  });
  await st("FB-4", "ร้านพิมพ์เบอร์สั้นกว่า 8 หลัก (081234 · Party ไม่จับด้วยเบอร์ · ล็อก T0.4d ไม่ถือ p:) ⇒ เก็บตามที่พิมพ์ · E2: ใช้ไม่ได้ ⇒ ยืนยันไม่ได้ (เบอร์ของ Party X ก็ไม่ได้)", async () => {
    needSelf(); const [s] = needBk("SSHORT");
    eq(await typedOf(s.id), { v: 1, name: NX, phone: "081234", email: EX }, "policySnapshot.booker");
    // ORACLE-EDIT FB-4 (ผู้คุม 26 พ.ย. · มติ E2 แทน C-3): เบอร์ที่พิมพ์ใช้ไม่ได้ ⇒ ไม่มีใครยืนยันได้ (ไม่ถอยไปเบอร์ของ Party)
    ERR(await verify(s, who("P1")), "VERIFY_FAILED", "SSHORT + P1 (เบอร์ของ Party)");
  });
  groupLine("FB");

  // ═══════════════ FS. รูปผลผิดเหมือนกัน ═══════════════
  console.log("\n── FS: ไม่มีข้อมูลรั่วจากรูปผล ──");
  await st("FS-1", "VERIFY_FAILED รูปเดียว (code · คีย์ผล): เบอร์สุ่ม (A1) · เบอร์ของ Party X (A1) · การจองที่ไม่มีเบอร์ใดเลย (SNONE) — ไม่มีเบอร์ในผล", async () => {
    needSelf(); const [a1, sn] = needBk("A1", "SNONE");
    const rs = [await verify(a1, "0899999991"), await verify(a1, who("P1")), await verify(sn, "0899999992")];
    for (const [i, r] of rs.entries()) ERR(r, "VERIFY_FAILED", `กรณีที่ ${i + 1}`);
    eq(rs.map((r) => Object.keys(r).sort()), rs.map(() => Object.keys(rs[0] ?? {}).sort()), "คีย์ผล");
    const s = JSON.stringify(rs);
    ok(![who("P1"), who("P2"), who("P1").slice(-4), who("P2").slice(-4)].some((x) => s.includes(x)), "มีเบอร์ในผล");
  });
  await st("FS-2", "ข้อมูลผู้จองถูกลบ (piiPurgedAt ตั้ง แต่ snapshot ยังมีค่าที่พิมพ์ — จำลองลบไม่ครบ) ⇒ เบอร์ที่พิมพ์ก็ VERIFY_FAILED (ถูกลบชนะเสมอ · รูปเดียวกับ FS-1)", async () => {
    needSelf(); const [f1] = needBk("F1");
    await pool.query(`UPDATE "TripBooking" SET "piiPurgedAt" = $2 WHERE id = $1`, [f1.id, ACT.now]);
    const r = await verify(f1, who("F1"));
    ERR(r, "VERIFY_FAILED", "F1 + เบอร์ที่พิมพ์");
    eq(Object.keys(r).sort(), Object.keys(await verify(f1, "0899999993")).sort(), "คีย์ผลเท่าเบอร์ผิด");
  });
  groupLine("FS");

  // ═══════════════ CC. ยิงพร้อมกัน ═══════════════
  console.log("\n── CC: ล็อกผู้จองของ T0.4d (D2 · G1) ไม่ถอย ──");
  const ccPhone = who("CC"), ccName = `พร้อมกัน W12b ${STAMP}`;
  let ccRes: Rec[] = [];
  await st("CC-1", "D2: STAFF bookTripsNow 8 ทางพร้อมกัน ผู้จองใหม่คนเดียวกัน (ชื่อ+เบอร์ใหม่ · ไม่มีอีเมล) ⇒ สำเร็จทั้ง 8 · Party ของเบอร์นี้ 1 แถว · ไม่มี THROW", async () => {
    needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const qv = await quoteGen();
    ccRes = await Promise.all(Array.from({ length: 8 }, () => staffBookRaw({ name: ccName, phone: e164(ccPhone) }, qv)));
    ok(ccRes.every((r) => r.ok === true), `ผล: ${fmt(ccRes.filter((r) => r.ok !== true).slice(0, 2))}`);
    eq(Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Party" WHERE "tenantId" = $1 AND "phoneNorm" = $2`, [tA, ccPhone]))[0]?.n), 1, "Party");
  });
  await st("CC-2", "ทั้ง 8 การจองของ CC-1 เก็บผู้จองที่พิมพ์ครบ (booker.phone = ที่ส่ง) และยืนยันด้วยเบอร์นั้นได้ (การจองแรก)", async () => {
    needSelf(); ok(ccRes.length === 8 && ccRes.every((r) => r.ok === true), "CC-1 ไม่ผ่าน");
    const ids = ccRes.map((r) => String(asArr(r.value)[0]?.bookingId));
    const ts = await Promise.all(ids.map((id) => typedOf(id)));
    eq(ts, ids.map(() => ({ v: 1, name: ccName, phone: e164(ccPhone), email: null })), "policySnapshot.booker");
    const r0 = asArr(ccRes[0]?.value)[0];
    GRANT(await verify({ tag: "CC0", token: String(r0?.publicToken), id: ids[0] ?? "", code: "", phone: ccPhone, ck: "", dep: DEP.gen ?? "" }, ccPhone), "CC การจองแรก");
  });
  await st("CC-3", "G1: (ชื่อ+เบอร์+อีเมล) 4 ทาง ∥ (ชื่อ+อีเมลอย่างเดียว) 4 ทาง พร้อมกัน ผู้จองใหม่ ⇒ Party ของอีเมลนี้ 1 แถว", async () => {
    needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const gn = `จีวัน W12b ${STAMP}`, ge = `${EMAIL_PREFIX}g1.${STAMP}@example.com`, gp = who("G1");
    const qv = await quoteGen();
    const rs = await Promise.all([...Array.from({ length: 4 }, () => staffBookRaw({ name: gn, phone: e164(gp), email: ge }, qv)), ...Array.from({ length: 4 }, () => staffBookRaw({ name: gn, email: ge }, qv))]);
    ok(rs.every((r) => r.ok === true), `ผล: ${fmt(rs.filter((r) => r.ok !== true).slice(0, 2))}`);
    eq(Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Party" WHERE "tenantId" = $1 AND email = $2`, [tA, ge]))[0]?.n), 1, "Party");
  });
  groupLine("CC");

  // ═══════════════ RL. เพดานลองผิด ═══════════════
  console.log("\n── RL: เพดานลองผิดของ W1.3a ไม่เปลี่ยน ──");
  await st("RL-1", `R1 (ชื่อ+อีเมลตรง Party ของ R0 · เบอร์ใหม่ R2): ลองด้วยเบอร์ของ Party (R1) ${WRONG_LIMIT} ครั้ง (คนละเครื่อง) ⇒ VERIFY_FAILED ทุกครั้ง · ครั้งถัดไปด้วยเบอร์ที่พิมพ์ ⇒ RATE_LIMITED LOCKED`, async () => {
    needSelf(); const [r1] = needBk("R1");
    for (let i = 0; i < WRONG_LIMIT; i++) ERR(await verify(r1, who("R1")), "VERIFY_FAILED", `ครั้งที่ ${i + 1}`);
    const r = await verify(r1, who("R2"));
    ok(r.ok === false && r.code === "RATE_LIMITED" && r.reason === "LOCKED", `ครั้งที่ ${WRONG_LIMIT + 1}: ${fmt(r)}`);
  });
  await st("RL-2", "R2 (ชื่อ+อีเมลตรง · เบอร์ใหม่ R3): ยืนยันถูกด้วยเบอร์ที่พิมพ์ 3 ครั้ง ⇒ grant ทุกครั้ง · ถังผิดของการจอง = 0 (คืนสิทธิ์ · L2)", async () => {
    needSelf(); const [r2] = needBk("R2");
    for (let i = 0; i < 3; i++) GRANT(await verify(r2, who("R3")), `ครั้งที่ ${i + 1}`);
    eq(await wrongCount(r2), 0, "ถังผิดของการจอง");
  });
  await st("RL-3", `ถังเครื่อง X8 ไม่เปลี่ยน: เครื่องเดียว ยืนยันถูก ${X8_VERIFY} ครั้ง (A0 + P1) ⇒ ผ่าน · ครั้งที่ ${X8_VERIFY + 1} ⇒ RATE_LIMITED LIMIT`, async () => {
    needSelf(); const [a0] = needBk("A0");
    const k = ck();
    const w = at(VMS + 30 * 60_000);
    for (let i = 0; i < X8_VERIFY; i++) GRANT(await verify(a0, who("P1"), { clientKey: k, when: w }), `ครั้งที่ ${i + 1}`);
    const r = await verify(a0, who("P1"), { clientKey: k, when: w });
    ok(r.ok === false && r.code === "RATE_LIMITED" && r.reason === "LIMIT", `ครั้งที่ ${X8_VERIFY + 1}: ${fmt(r)}`);
  });
  groupLine("RL");

  // ═══════════════ ST. จอร้าน ═══════════════
  console.log("\n── ST: จอร้าน (T1.3 · T1.4) แสดงผู้จองตามที่พิมพ์ ──");
  const scr = () => ({ tenantId: tA, actorUserId: STAFF[tA] });
  const rowOf = (vm: unknown, b: Bk): Rec | undefined => findDeep(vm, (r) => (r.bookingId === b.id || r.id === b.id) && "bookerName" in r)[0];
  const listRow = async (b: Bk) => {
    const r = await tcall("loadBookingListVM", scr(), { unitId: uA, q: b.code }, { now: ACT.now });
    ok(r.ok === true, `loadBookingListVM: ${fmt(r)}`);
    const row = rowOf(r.vm, b); ok(row, `ไม่พบแถวของ ${b.tag} ในรายการ (ค้นด้วยเลขจอง)`);
    return row as Rec;
  };
  const detailOf = async (b: Bk) => {
    const r = await tcall("loadBookingDetailVM", scr(), { unitId: uA, bookingId: b.id }, { now: ACT.now });
    ok(r.ok === true, `loadBookingDetailVM: ${fmt(r)}`);
    return asRec(asRec(r.vm)?.customer) ?? {};
  };
  await st("ST-1", "รายการการจอง (T1.3): ผู้จองของ A2 = ชื่อที่พิมพ์ (N2) ไม่ใช่ชื่อของ Party X", async () => {
    const [a2] = needBk("A2");
    eq((await listRow(a2)).bookerName, N2, "bookerName");
  });
  await st("ST-2", "รายละเอียดการจอง (T1.3): A1 เบอร์ปิดบัง = ของเบอร์ที่พิมพ์ (P2) ไม่ใช่ของ Party X (P1) · A2 ชื่อ = N2", async () => {
    const [a1, a2] = needBk("A1", "A2");
    const c1 = await detailOf(a1), c2 = await detailOf(a2);
    eq([c1.name, c1.phoneMasked, c1.purged], [NX, maskOf(who("P2")), false], "A1");
    eq([c2.name, c2.phoneMasked], [N2, maskOf(who("P1"))], "A2");
  });
  await st("ST-3", "ใบรายชื่อของรอบ (T1.4): แถวการจอง A2 ผู้จอง = N2", async () => {
    const [a2] = needBk("A2");
    const r = await tcall("loadManifestVM", scr(), { unitId: uA, departureId: a2.dep }, { now: ACT.now });
    ok(r.ok === true, `loadManifestVM: ${fmt(r)}`);
    const row = rowOf(r.vm, a2); ok(row, "ไม่พบแถวการจอง A2 ในใบรายชื่อ");
    eq(row?.bookerName, N2, "bookerName");
  });
  await st("ST-4", "การจองก่อนแก้ (L1 · ไม่มีคีย์) ⇒ จอใช้ชื่อ/เบอร์ของ Party (แบบเดิม): ชื่อ X · เบอร์ปิดบังของ P1", async () => {
    const [l1] = needBk("L1");
    eq((await listRow(l1)).bookerName, NX, "รายการ");
    const c = await detailOf(l1);
    eq([c.name, c.phoneMasked], [NX, maskOf(who("P1"))], "รายละเอียด");
  });
  groupLine("ST");

  // ═══════════════ PII ═══════════════
  console.log("\n── PII ──");
  const piiStrings = () => {
    const out = [NX, N2, EX];
    for (const k of ["P1", "P2", "P4", "P5", "P6", "Q1", "Q2", "Z2", "AC2", "CC"]) if (P[k]) { const l = P[k] as string; out.push(l, e164(l), l.slice(1)); }
    return out;
  };
  await st("PII-1", "audit/outbox ของร้านทดสอบไม่มีชื่อ/เบอร์ (ทุกรูป)/อีเมลที่ผู้จองพิมพ์", async () => {
    needBk("A1");
    const a = await q<{ s: string }>(`SELECT coalesce("after"::text, '') || coalesce("before"::text, '') AS s FROM "AuditLog" WHERE "tenantId" = $1`, [tA]);
    const o = await q<{ s: string }>(`SELECT coalesce(payload::text, '') AS s FROM "OutboxEvent" WHERE "tenantId" = $1`, [tA]);
    const blob = [...a, ...o].map((x) => x.s).join("\n");
    ok(a.length + o.length > 0, "ไม่มีแถว audit/outbox ให้ตรวจ");
    const leak = piiStrings().filter((s) => blob.includes(s));
    ok(leak.length === 0, `พบข้อมูลผู้จองใน audit/outbox: ${leak.length} ค่า`);
  });
  await st("PII-2", "ผลสาธารณะ (หน้าการจอง A1 · ยืนยันผิด/ถูก) ไม่มีชื่อ/เบอร์/อีเมลที่พิมพ์ และไม่มีคีย์ booker", async () => {
    needSelf(); const [a1] = needBk("A1");
    const rs = [await bcall("openBookReservation", { shop: SA, token: a1.token, lang: "th", acceptLanguage: "th", clientKey: ck() }, ACT), await verify(a1, "0899999994"), await verify(a1, who("P2"))];
    const s = JSON.stringify(rs);
    const leak = piiStrings().filter((x) => s.includes(x));
    ok(leak.length === 0, `พบข้อมูลผู้จองในผลสาธารณะ: ${leak.length} ค่า`);
    ok(!findDeep(rs, (r) => "booker" in r).length, "มีคีย์ booker ในผลสาธารณะ");
  });
  await st("PII-3", "log ของโค้ดที่ถูกทดสอบระหว่างข้อสอบนี้ (console.* ระหว่างเรียกบริการ/แพลตฟอร์ม/action) ไม่มีชื่อ/เบอร์/อีเมลที่พิมพ์", () => {
    const blob = logBuf.join("\n");
    const leak = piiStrings().filter((x) => blob.includes(x));
    ok(leak.length === 0, `พบข้อมูลผู้จองใน log: ${leak.length} ค่า (${logBuf.length} บรรทัด)`);
  });
  await st("PII-4", "ลบตาม T0.8: PG (HOLD สาธารณะ มีคีย์ booker) ⇒ หมดเวลา (EXPIRED ไม่มีเงิน) ⇒ runPdpaPurge ที่ครบ X22 ⇒ bookerPartyId null · piiPurgedAt · คีย์ booker หาย · snapshot ส่วนอื่นเท่าเดิม · จอร้านไม่แสดงผู้จอง", async () => {
    const [pgb] = needBk("PG");
    const before = await snapOf(pgb.id);
    typedRed(before.booker, "PG ก่อนลบ");
    await pool.query(`UPDATE "TripBooking" SET status = 'EXPIRED' WHERE id = $1`, [pgb.id]);
    await pool.query(`UPDATE "TripHold" SET status = 'EXPIRED', "expiresAt" = $2 WHERE "bookingId" = $1`, [pgb.id, HOLD_EXPIRED_AT]);
    const r = await tcall("runPdpaPurge", PURGE_AT, { tenantIds: [tA] });
    ok(r.ok === true, `runPdpaPurge: ${fmt(r)}`);
    const row = (await q<{ bookerPartyId: string | null; piiPurgedAt: Date | null; s: Rec }>(`SELECT "bookerPartyId", "piiPurgedAt", "policySnapshot" AS s FROM "TripBooking" WHERE id = $1`, [pgb.id]))[0];
    eq([row?.bookerPartyId ?? null, row?.piiPurgedAt instanceof Date, row ? "booker" in row.s : true], [null, true, false], "หลังลบ");
    const { booker: _b, ...rest0 } = before; void _b;
    eq(row?.s, rest0, "snapshot ส่วนอื่น");
    const c = await detailOf(pgb);
    eq([c.name ?? null, c.phoneMasked ?? null, c.purged], [null, null, true], "จอรายละเอียด");
  });
  groupLine("PII");

  // ═══════════════ รอบผู้เขียนข้อสอบแยก (26 พ.ย. · ผู้คุมสั่งเพิ่ม a–f หลังรายงาน r1) ═══════════════
  const bkRow = async (id: string) => (await q<{ version: number; departureId: string; status: string; bookerPartyId: string | null; piiPurgedAt: Date | null; s: Rec }>(
    `SELECT version, "departureId", status, "bookerPartyId", "piiPurgedAt", "policySnapshot" AS s FROM "TripBooking" WHERE id = $1`, [id]))[0];
  const changeTo = async (b: Bk, depId: string | undefined, o: { version?: number; qv?: Rec } = {}): Promise<Rec> => {
    const ln = lineOn(depId);
    const qt = o.qv ?? asRec((await tcall("quoteTrips", staffCtx(), { lines: [ln] })).value);
    ok(qt && typeof qt.quoteId === "string", `quoteTrips (เลื่อน ${b.tag}): ${fmt(qt)}`);
    const v = o.version ?? Number((await bkRow(b.id))?.version);
    return tcall("changeTripBooking", staffCtx(), { bookingId: b.id, expectedVersion: v, line: ln, quoteId: qt?.quoteId, quoteExpiresAt: qt?.expiresAt, idempotencyKey: `w12bmv_${hex(6)}` });
  };
  console.log("\n── SN: ทุกตัวเขียน policySnapshot พกผู้จองที่พิมพ์ต่อ / ไม่ฟื้นหลังลบ (ก · ข) ──");
  await st("SN-1", "ร้านเลื่อนรอบ (changeTripBooking STAFF) ของ CONFIRMED ที่ร้านจอง (SCHG) และ PAID สาธารณะ (CHP) ⇒ สำเร็จ · version +1 · รอบใหม่ · policySnapshot.booker เท่าเดิมทั้งก้อน · ยืนยันด้วยเบอร์ที่พิมพ์ได้ต่อ", async () => {
    needSelf(); const [sc, cp] = needBk("SCHG", "CHP");
    for (const [b, local] of [[sc, who("CH1")], [cp, who("CH2")]] as const) {
      const r0 = await bkRow(b.id);
      typedRed(r0?.s.booker, `${b.tag} ก่อนเลื่อน`);
      const r = await changeTo(b, DEP.r11);
      ok(r.ok === true, `เลื่อน ${b.tag}: ${fmt(r)}`);
      const r1 = await bkRow(b.id);
      eq([r1?.version, r1?.departureId, r1?.s.booker], [Number(r0?.version) + 1, DEP.r11, r0?.s.booker], `${b.tag} หลังเลื่อน`);
      GRANT(await verify(b, local), `${b.tag} + เบอร์ที่พิมพ์ (หลังเลื่อน)`);
    }
  });
  await st("SN-2", "ตัวเขียน TripBooking.policySnapshot ใน src/ มี 4 ที่เท่านั้น (สร้าง finalizeCoreInTx · เลื่อน changeImpl · ลบ T0.8 pdpa (ลบคีย์ทิ้ง) · ตัวรับการลบลูกค้า E1/E7 (แทนด้วยป้าย)) — ที่ใหม่ต้องเพิ่มข้อสอบแบบ SN-1", () => {
    const files = git(["ls-files", "src"]).split("\n").filter((f) => /\.(ts|tsx)$/.test(f));
    const hits: string[] = [];
    for (const f of files) {
      const t = stripComments(read(f));
      if (!/"TripBooking"|tripBooking\./.test(t)) continue;
      for (const m of t.matchAll(/"policySnapshot"\s*=|tripBooking\.(?:create|createMany|update|updateMany|upsert)\(\{[\s\S]{0,4000}?policySnapshot\s*:/g)) hits.push(`${f}:${t.slice(0, m.index ?? 0).split("\n").length}`);
    }
    // ORACLE-EDIT SN-2 (ผู้คุม 26 พ.ย. · มติ E1): ตัวรับการลบลูกค้า (ตัด booker) = ตัวเขียนที่ 4 ใน pdpa.ts หรือ public-booking.ts
    const fs4 = hits.map((h) => h.replace(/:\d+$/, "")).sort();
    ok(fs4.length === 4 && [[BOOKING, BOOKING, PDPA, PDPA].sort(), [BOOKING, BOOKING, PDPA, PUBMOD].sort()].some((e) => isDeepStrictEqual(e, fs4)), `ตัวเขียนต้องเป็น สร้าง · เลื่อน · ลบ T0.8 · ตัวรับ E1 (ได้ ${hits.join(" · ")})`);
  });
  await st("SN-3", "ไม่ฟื้นหลังลบ: PG2 (HOLD มีคีย์ booker) เตรียมคำขอเลื่อน (quote + version ก่อนลบ) → หมดเวลา + runPdpaPurge → ส่งคำขอเลื่อนค้าง ⇒ ไม่สำเร็จ · ส่งด้วย version ปัจจุบันก็ไม่สำเร็จ · คีย์ booker ไม่กลับ · bookerPartyId ยัง null · version ไม่ขยับหลังลบ", async () => {
    const [b] = needBk("PG2");
    const r0 = await bkRow(b.id);
    typedRed(r0?.s.booker, "PG2 ก่อนลบ");
    const qv = asRec((await tcall("quoteTrips", staffCtx(), { lines: [lineOn(DEP.r11)] })).value) ?? {};
    const staleV = Number(r0?.version);
    await pool.query(`UPDATE "TripBooking" SET status = 'EXPIRED' WHERE id = $1`, [b.id]);
    await pool.query(`UPDATE "TripHold" SET status = 'EXPIRED', "expiresAt" = $2 WHERE "bookingId" = $1`, [b.id, HOLD_EXPIRED_AT]);
    const pr = await tcall("runPdpaPurge", PURGE_AT, { tenantIds: [tA] });
    ok(pr.ok === true, `runPdpaPurge: ${fmt(pr)}`);
    const r1 = await bkRow(b.id);
    eq([r1?.bookerPartyId ?? null, r1?.piiPurgedAt instanceof Date, r1 ? "booker" in r1.s : true], [null, true, false], "หลังลบ");
    const a = await changeTo(b, DEP.r11, { version: staleV, qv });
    const c = await changeTo(b, DEP.r11, { version: Number(r1?.version) });
    ok(a.ok !== true && c.ok !== true && a.ok !== "THROW" && c.ok !== "THROW", `คำขอเลื่อนหลังลบต้องถูกปฏิเสธ: ${fmt([a, c])}`);
    const r2 = await bkRow(b.id);
    eq([r2?.version, r2?.bookerPartyId ?? null, r2 ? "booker" in r2.s : true, r2?.departureId], [r1?.version, null, false, r1?.departureId], "หลังคำขอค้าง");
  });
  groupLine("SN");

  console.log("\n── RV: ตัวอ่านการจองสาธารณะ (ค) ──");
  const piiOf = (b: Bk, extra: string[] = []) => (b.phone && b.phone.length >= 9 ? [...extra, b.phone, e164(b.phone), b.phone.slice(1)] : [...extra]);
  await st("RV-1", "ผลทั้งก้อนของ openBookReservation (ที่หน้าได้รับ รวมนอก vm) ของ A1 · S0066 · SMAIL ไม่มีชื่อ/เบอร์/อีเมลที่พิมพ์ และไม่มีคีย์ booker", async () => {
    const [a1, s66, sm] = needBk("A1", "S0066", "SMAIL");
    for (const [b, extra] of [[a1, [NX, EX]], [s66, [NX, EX, `0066${who("P4").slice(1)}`]], [sm, [NX, EX]]] as const) {
      const r = await bcall("openBookReservation", { shop: SA, token: b.token, lang: "th", acceptLanguage: "th", clientKey: ck() }, ACT);
      ok(r.ok === true, `openBookReservation ${b.tag}: ${fmt(r)}`);
      const s = JSON.stringify(r);
      const leak = piiOf(b, [...extra]).filter((x) => s.includes(x));
      ok(leak.length === 0, `${b.tag}: พบข้อมูลผู้จองในผลของหน้า ${leak.length} ค่า`);
      ok(!findDeep(r, (x) => "booker" in x).length, `${b.tag}: มีคีย์ booker ในผลของหน้า`);
    }
  });
  await st("RV-2", "ขอบโมดูล: findBookReservation (facade trips → platform/trips-book) ไม่ส่งคีย์ booker ออกนอกโมดูล (ใบสั่ง §5 \"ใครอ่าน: โค้ดโมดูล trips\") — ถ้าโค้ดไม่ตัด = แดง · ผู้คุมตัดสิน", async () => {
    const [a1] = needBk("A1");
    const row = asRec(await tfn("findBookReservation")({ tenantId: tA, unitIds: [uA] }, sha256hex(a1.token)));
    ok(row, "findBookReservation ไม่คืนแถวของ A1");
    const hit = findDeep(row, (x) => "booker" in x);
    ok(hit.length === 0, `findBookReservation ส่ง policySnapshot.booker ออกนอกโมดูล (ชื่อ/เบอร์/อีเมลที่พิมพ์ถึง platform · VM ไม่มีเพราะ platform ไม่หยิบ)`);
  });
  groupLine("RV");

  console.log("\n── SV: จอร้านไม่มีเบอร์เต็ม/อีเมลที่พิมพ์ · ไม่มีสิทธิ์ = ไม่เห็น (ง · จ) ──");
  const staffBlobs = async (ctx: Rec, bs: Bk[]): Promise<{ results: Rec[]; blob: string }> => {
    const results: Rec[] = [];
    for (const b of bs) {
      results.push(await tcall("loadBookingListVM", ctx, { unitId: uA, q: b.code }, { now: ACT.now }));
      results.push(await tcall("loadBookingDetailVM", ctx, { unitId: uA, bookingId: b.id }, { now: ACT.now }));
    }
    for (const d of [...new Set(bs.map((b) => b.dep))]) {
      results.push(await tcall("loadManifestVM", ctx, { unitId: uA, departureId: d }, { now: ACT.now }));
      results.push(await tcall("exportManifestCsv", ctx, { unitId: uA, departureId: d }, { now: ACT.now }));
    }
    return { results, blob: JSON.stringify(results) };
  };
  const fullPhones = (locals: string[]) => locals.flatMap((l) => [l, e164(l), l.slice(1), `0066${l.slice(1)}`]);
  await st("SV-1", "เจ้าของร้าน (สิทธิ์สูงสุด): รายการ · รายละเอียด · ใบรายชื่อ · CSV ของ A1 · S0066 · SMAIL · A2 ไม่มีเบอร์เต็มที่พิมพ์ (ทุกรูป) และไม่มีอีเมลที่พิมพ์ · มีชื่อที่พิมพ์ (ตัวควบคุม)", async () => {
    const bs = needBk("A1", "S0066", "SMAIL", "A2");
    const { results, blob } = await staffBlobs(scr(), bs);
    ok(results.every((r) => r.ok === true), `ตัวโหลดจอ: ${fmt(results.filter((r) => r.ok !== true).slice(0, 2))}`);
    const leak = [...fullPhones([who("P1"), who("P2"), who("P4")]), EX].filter((x) => blob.includes(x));
    ok(leak.length === 0, `จอร้านมีเบอร์เต็ม/อีเมลที่พิมพ์: ${leak.length} ค่า`);
    ok(blob.includes(N2), "ตัวควบคุม: ไม่พบชื่อที่พิมพ์ (N2) ในจอร้าน");
  });
  await st("SV-2", "พนักงานที่ไม่มีสิทธิ์ดูการจอง (มีแค่ trips.product.view): รายการ/รายละเอียด ⇒ FORBIDDEN · ใบรายชื่อ/CSV ไม่สำเร็จ · ไม่มีชื่อ/เบอร์/อีเมลที่พิมพ์ในผลใดเลย", async () => {
    const bs = needBk("A1", "A2");
    ok(NOVIEW.id, "ไม่มีผู้ใช้ไม่มีสิทธิ์");
    const { results, blob } = await staffBlobs({ tenantId: tA, actorUserId: NOVIEW.id }, bs);
    const lists = results.filter((_, i) => i < bs.length * 2);
    ok(lists.every((r) => r.ok === false && r.code === "FORBIDDEN"), `รายการ/รายละเอียด: ${fmt(lists.map((r) => [r.ok, r.code]))}`);
    ok(results.slice(bs.length * 2).every((r) => r.ok !== true), `ใบรายชื่อ/CSV: ${fmt(results.slice(bs.length * 2).map((r) => [r.ok, r.code]))}`);
    const leak = [NX, N2, EX, ...fullPhones([who("P1"), who("P2")])].filter((x) => blob.includes(x));
    ok(leak.length === 0, `ผลของผู้ไม่มีสิทธิ์มีข้อมูลผู้จอง: ${leak.length} ค่า`);
  });
  await st("SV-3", "เบอร์ปิดบังของผู้จองที่ร้านพิมพ์ 0066812345678 = 081-xxx-5678 (รูปเดียวกับเบอร์เดียวกันที่เก็บเป็น +66… · ใบสั่ง §4 \"เบอร์ที่พิมพ์ที่ใช้ได้\" ปิดบังแบบเบอร์ไทย)", async () => {
    const [s66] = needBk("S66");
    eq(await typedOf(s66.id), { v: 1, name: `ผู้จอง 0066 ${STAMP}`, phone: "0066812345678", email: null }, "policySnapshot.booker");
    const c = await detailOf(s66);
    eq(c.phoneMasked, "081-xxx-5678", "phoneMasked");
  });
  groupLine("SV");

  console.log("\n── AF: ผู้โจมตีเลือกทางสำรอง (ฉ) ──");
  await st("AF-1", `ผู้โจมตีจองสาธารณะด้วยชื่อ+อีเมลของเหยื่อ + เบอร์ ${ATTACK_PHONE} (ผ่านรูปฟอร์ม · normalize ⇒ "1234" < 8 หลัก): การจองชี้ Party ของเหยื่อ (ชื่อ+อีเมล · มีมาก่อน) · เก็บเบอร์ตามที่พิมพ์ · ตามมติ E2 ⇒ ไม่มีใครยืนยันได้ (ทั้งเบอร์ของผู้โจมตีและของเหยื่อ) · จอร้านไม่แสดงเบอร์ของเหยื่อ`, async () => {
    needSelf(); const [vb, fa] = needBk("VB", "FA");
    eq((await partyOf(fa.id))?.id, (await partyOf(vb.id))?.id, "FA ชี้ Party ของเหยื่อ");
    eq(await typedOf(fa.id), { v: 1, name: NV, phone: ATTACK_PHONE, email: EV }, "policySnapshot.booker");
    ERR(await verify(fa, ATTACK_PHONE), "VERIFY_FAILED", "FA + เบอร์ของผู้โจมตี");
    // ORACLE-EDIT AF-1 (ผู้คุม 26 พ.ย. · มติ E2): มีคีย์ booker ⇒ ไม่ถอยไปเบอร์ของ Party ⇒ เบอร์ของเหยื่อก็ยืนยันการจองของผู้โจมตีไม่ได้
    ERR(await verify(fa, who("PV")), "VERIFY_FAILED", "FA + เบอร์ของเหยื่อ");
    ERR(await verify(vb, ATTACK_PHONE), "VERIFY_FAILED", "การจองของเหยื่อ + เบอร์ของผู้โจมตี");
    eq((await detailOf(fa)).phoneMasked ?? null, null, "จอร้านของ FA ไม่แสดงเบอร์ของ Party (E2 · เบอร์ที่พิมพ์ใช้ไม่ได้)");
  });
  groupLine("AF");

  // ═══════════════ มติ E1–E5 (ผู้เขียนข้อสอบแยก รอบ 2 · 26 พ.ย.) ═══════════════
  const OBI = await tryImport("@/lib/outbox-consumers");
  const fire = async (type: string, payload: Rec): Promise<Rec> => {
    const h = asRec(OBI.mod?.consumers)?.[type];
    ok(typeof h === "function", `ไม่มีตัวรับ ${type} (${OBI.err.slice(0, 80)})`);
    return captured(async () => { try { await (h as AnyFn)({ id: rid("ev"), tenantId: tA, type, payload, systemId: null, unitId: null }); return { ok: true }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } });
  };
  /** ฝั่ง CRM/สมาชิกล้างตัวตนของ Party ตอนลบ (แบบ crm/privacy.ts eraseInTx: ไม่มีผู้ถืออื่น ⇒ ชื่อ CRM_ERASED_NAME · เบอร์/อีเมล null) */
  const ERASED_NAME = "ลบข้อมูลแล้ว";
  const anonymise = async (partyId: string | undefined) => { await pool.query(`UPDATE "Party" SET name = $2, phone = NULL, "phoneNorm" = NULL, email = NULL, "updatedAt" = now() WHERE id = $1`, [partyId, ERASED_NAME]); };
  const vOf = async (id: string) => Number((await bkRow(id))?.version);
  const hasTyped = async (id: string) => { const r = await bkRow(id); return !!r && "booker" in r.s; };
  console.log("\n── ER: ลบลูกค้าในรายชื่อกลาง ⇒ ลบสำเนาที่พิมพ์ (มติ E1) ──");
  let erDone = false;
  // ORACLE-EDIT ER-1…ER-6 (ผู้คุม 26 พ.ย. · มติ E7): ตัวรับการลบไม่ลบคีย์ทิ้ง แต่แทนด้วยป้าย TOMB ⇒ "มีคีย์ · ไม่มีเบอร์ที่ใช้ได้" ⇒ ไม่มีใครยืนยันได้
  const TOMB = { v: 1, erased: true };
  const tombOf = async (id: string) => (await bkRow(id))?.s.booker;
  const detailMask = async (b: Bk) => { const c = await detailOf(b); return [c.name ?? null, c.phoneMasked ?? null]; };
  await st("ER-1", "crm.contact.erased {contactId, systemId, partyId=E} (Party ถูกล้างแบบ eraseContact) ผ่านตัวรับจริง consumers[…] ⇒ ทุกการจองของ Party E ในร้าน (E0 E1 + E0L ที่ไม่มีคีย์มาก่อน) ได้ booker = {v:1, erased:true} พอดี (ไม่มีชื่อ/เบอร์/อีเมล) · version +1 · การจองของ Party อื่น (A0) และของร้านอื่นที่ชี้ id เดียวกัน ไม่ถูกแตะ", async () => {
    const [e0, e1, e0l, a0] = needBk("E0", "E1", "E0L", "A0");
    const pe = (await partyOf(e0.id))?.id;
    eq([(await partyOf(e1.id))?.id, (await partyOf(e0l.id))?.id], [pe, pe], "E1 E0L ชี้ Party E");
    typedRed((await bkRow(e1.id))?.s.booker, "E1 ก่อนลบ");
    const ids = [e0.id, e1.id, e0l.id];
    const v0 = await Promise.all(ids.map(vOf)), a0r = await bkRow(a0.id), tb0 = (await q<{ version: number; s: Rec }>(`SELECT version, "policySnapshot" AS s FROM "TripBooking" WHERE id = $1`, [OTHER_T.bookingId]))[0];
    await anonymise(pe);
    const r = await fire("crm.contact.erased", { contactId: rid("ct"), systemId: rid("sy"), partyId: pe });
    ok(r.ok === true, `ตัวรับ: ${fmt(r)}`);
    eq([await Promise.all(ids.map(tombOf)), await Promise.all(ids.map(vOf))], [ids.map(() => TOMB), v0.map((v) => v + 1)], "E0 E1 E0L หลังลบ");
    const a0n = await bkRow(a0.id), tb1 = (await q<{ version: number; s: Rec }>(`SELECT version, "policySnapshot" AS s FROM "TripBooking" WHERE id = $1`, [OTHER_T.bookingId]))[0];
    eq([a0n?.version, a0n?.s, tb1?.version, tb1?.s], [a0r?.version, a0r?.s, tb0?.version, tb0?.s], "การจองของ Party อื่น / ร้านอื่น");
    erDone = true;
  });
  await st("ER-2", "หลัง ER-1: จอร้าน (รายการ · รายละเอียด · ใบรายชื่อ · CSV) ของ E1 ไม่มีชื่อ/เบอร์/อีเมลที่พิมพ์ · ชื่อ = ของ Party (ล้างแล้ว) · เบอร์ปิดบัง null · verifyBookSelf ด้วยเบอร์ที่พิมพ์ (E0 E1) ⇒ VERIFY_FAILED รูปเดียวกับเบอร์ผิด", async () => {
    needSelf(); const [e0, e1] = needBk("E0", "E1"); ok(erDone, "ER-1 ไม่ผ่าน");
    const { blob } = await staffBlobs(scr(), [e1]);
    const leak = [NE, EE, ...fullPhones([who("PE1"), who("PE2")])].filter((x) => blob.includes(x));
    ok(leak.length === 0, `จอร้านยังมีข้อมูลผู้จอง ${leak.length} ค่า`);
    eq([await detailMask(e1), (await listRow(e1)).bookerName], [[ERASED_NAME, null], ERASED_NAME], "ชื่อถอยไป Party · เบอร์ปิดบัง null");
    const rs = [await verify(e0, who("PE1")), await verify(e1, who("PE2")), await verify(e1, "0899999990")];
    for (const [i, x] of rs.entries()) ERR(x, "VERIFY_FAILED", `กรณีที่ ${i + 1}`);
    eq(rs.map((x) => Object.keys(x).sort()), rs.map(() => Object.keys(rs[2] ?? {}).sort()), "คีย์ผล");
  });
  await st("ER-3", "ส่งเหตุการณ์เดิมซ้ำ 2 ครั้ง (ตัวรับ idempotent) ⇒ ไม่มีอะไรเปลี่ยนเพิ่ม (version · snapshot ของ E0 E1 E0L เท่าเดิม · ป้ายเดิม)", async () => {
    const [e0, e1, e0l] = needBk("E0", "E1", "E0L"); ok(erDone, "ER-1 ไม่ผ่าน");
    const pe = (await partyOf(e0.id))?.id;
    const b0 = await Promise.all([e0, e1, e0l].map((b) => bkRow(b.id)));
    for (let i = 0; i < 2; i++) ok((await fire("crm.contact.erased", { contactId: rid("ct"), systemId: rid("sy"), partyId: pe })).ok === true, "ตัวรับ");
    const b1 = await Promise.all([e0, e1, e0l].map((b) => bkRow(b.id)));
    eq(b1.map((x) => [x?.version, x?.s]), b0.map((x) => [x?.version, x?.s]), "หลังส่งซ้ำ");
  });
  await st("ER-4", "member.erased {customerId, partyId=M} (Party ถูกล้าง) ผ่านตัวรับจริง ⇒ M0 booker = ป้าย · version +1 · ยืนยันด้วยเบอร์ที่พิมพ์ ⇒ VERIFY_FAILED · เบอร์ปิดบัง null", async () => {
    needSelf(); const [m0] = needBk("M0");
    const pm = (await partyOf(m0.id))?.id;
    typedRed((await bkRow(m0.id))?.s.booker, "M0 ก่อนลบ");
    const v0 = await vOf(m0.id);
    await anonymise(pm);
    const r = await fire("member.erased", { customerId: rid("cu"), partyId: pm });
    ok(r.ok === true, `ตัวรับ: ${fmt(r)}`);
    eq([await tombOf(m0.id), await vOf(m0.id)], [TOMB, v0 + 1], "M0 หลังลบ");
    ERR(await verify(m0, who("PM")), "VERIFY_FAILED", "M0 + เบอร์ที่พิมพ์");
    eq((await detailMask(m0))[1], null, "เบอร์ปิดบัง");
  });
  await st("ER-5", "CRM ตัดการผูกแต่ไม่ล้าง Party (มีผู้ถืออื่น · Party U ยังมีเบอร์ = เบอร์ที่พิมพ์): crm.contact.erased {partyId=U} ⇒ U0 booker = ป้าย · ยืนยันด้วยเบอร์ที่พิมพ์และเบอร์ปัจจุบันของ Party ⇒ VERIFY_FAILED รูปเดียว · จอ: ชื่อ = ของ Party · เบอร์ปิดบัง null (มติ E7)", async () => {
    needSelf(); const [u0] = needBk("U0");
    const pu = await partyOf(u0.id);
    typedRed((await bkRow(u0.id))?.s.booker, "U0 ก่อนลบ");
    const r = await fire("crm.contact.erased", { contactId: rid("ct"), systemId: rid("sy"), partyId: pu?.id });
    ok(r.ok === true, `ตัวรับ: ${fmt(r)}`);
    eq(await tombOf(u0.id), TOMB, "U0 booker");
    const pNow = (await partyOf(u0.id))?.phoneNorm;
    ok(pNow, "ตัวควบคุม: Party U ต้องยังมีเบอร์ (CRM ตัดการผูกเท่านั้น)");
    const rs = [await verify(u0, who("PU")), await verify(u0, String(pNow)), await verify(u0, "0899999987")];
    for (const [i, x] of rs.entries()) ERR(x, "VERIFY_FAILED", `กรณีที่ ${i + 1}`);
    eq(rs.map((x) => Object.keys(x).sort()), rs.map(() => Object.keys(rs[2] ?? {}).sort()), "คีย์ผล");
    eq(await detailMask(u0), [pu?.name, null], "จอรายละเอียด");
  });
  await st("ER-6", "ตัวอ่านป้าย: typedBookerOf({v:1, erased:true}) = { name: null, phone: null } (ไม่ใช่ null — null แปลว่า 'ไม่มีคีย์ ⇒ ถอยไป Party') · ไม่มีคีย์/ผิดรูป ⇒ null · มีค่าที่พิมพ์ ⇒ { name, phone } (ไม่มี email · E5)", async () => {
    const vc = await tryImport("@/lib/modules/trips/booking-view-core");
    const f = vc.mod?.typedBookerOf;
    ok(typeof f === "function", `ไม่มี typedBookerOf (${vc.err.slice(0, 80)})`);
    const tb = f as AnyFn;
    eq([tb(TOMB), tb(undefined), tb({ v: 2, name: "x" }), tb({ v: 1, name: "ก", phone: "+66812345678", email: "a@b.co" })],
      [{ name: null, phone: null }, null, null, { name: "ก", phone: "+66812345678" }], "typedBookerOf");
  });
  groupLine("ER");

  console.log("\n── E2: มีคีย์ booker ⇒ ไม่ถอยไปเบอร์ของรายชื่อกลาง ──");
  await st("E2-1", "สาธารณะพิมพ์ +66123456 / +00661234567 (เลขสำคัญ < 8) + ชื่อ+อีเมลของ X ⇒ ผ่านฟอร์ม · ชี้ Party X · ไม่มีใครยืนยันได้: เบอร์ของ X (P1) · เบอร์ที่พิมพ์เอง · เบอร์สุ่ม ⇒ VERIFY_FAILED รูปเดียว", async () => {
    needSelf(); const [a, b, a0] = needBk("E2a", "E2b", "A0");
    for (const [bk, ph] of [[a, "+66123456"], [b, "+00661234567"]] as const) {
      eq([(await partyOf(bk.id))?.id === (await partyOf(a0.id))?.id, asRec(await typedOf(bk.id))?.phone], [true, ph], `${bk.tag} Party X · เบอร์ที่เก็บ`);
      const rs = [await verify(bk, who("P1")), await verify(bk, ph), await verify(bk, "0899999989")];
      for (const [i, x] of rs.entries()) ERR(x, "VERIFY_FAILED", `${bk.tag} กรณีที่ ${i + 1}`);
      eq(rs.map((x) => Object.keys(x).sort()), rs.map(() => Object.keys(rs[2] ?? {}).sort()), `${bk.tag} คีย์ผล`);
    }
  });
  await st("E2-2", "ร้านพิมพ์ 08123456 (ยาว 8 แต่เลขสำคัญ 7) + ชื่อ+อีเมลของ X ⇒ เบอร์ของ X ยืนยันไม่ได้ · จอร้านไม่แสดงเบอร์ปิดบัง (เกณฑ์เลขสำคัญเดียวกัน)", async () => {
    needSelf(); const [s2] = needBk("E2s");
    ERR(await verify(s2, who("P1")), "VERIFY_FAILED", "E2s + P1");
    eq((await detailOf(s2)).phoneMasked ?? null, null, "phoneMasked");
  });
  await st("E2-3", "เลขสำคัญ 8 หลักพอดี (+6612345678 · ผู้คุมเขียน '+661234567-style' — รูปนั้นมีเลขสำคัญ 7) ⇒ ยืนยันด้วยตัวเองได้ · เบอร์ของ X ไม่ได้", async () => {
    needSelf(); const [c] = needBk("E2c");
    GRANT(await verify(c, "+6612345678"), "E2c + ตัวเอง");
    ERR(await verify(c, who("P1")), "VERIFY_FAILED", "E2c + P1");
  });
  await st("E2-4", "จอร้าน (รายละเอียด): มีคีย์ booker แต่เบอร์ใช้ไม่ได้/ไม่มี (E2a · E2b · SMAIL · SSHORT) ⇒ phoneMasked null (ไม่ใช้เบอร์ของ Party) · ไม่มีคีย์ (L1 · SPID) ⇒ เบอร์ปิดบังของ Party", async () => {
    const [a, b, sm, ss, l1, sp] = needBk("E2a", "E2b", "SMAIL", "SSHORT", "L1", "SPID");
    eq(await Promise.all([a, b, sm, ss].map(async (x) => (await detailOf(x)).phoneMasked ?? null)), [null, null, null, null], "มีคีย์ · ใช้ไม่ได้");
    eq(await Promise.all([l1, sp].map(async (x) => (await detailOf(x)).phoneMasked ?? null)), [maskOf(who("P1")), maskOf(who("P1"))], "ไม่มีคีย์");
  });
  groupLine("E2");

  console.log("\n── E3/E5: ตัดคีย์ที่ขอบโมดูล · ไม่มีชนิดส่งออกที่พกอีเมล ──");
  await st("E3-1", "หน้า my/[token] รับข้อมูลจากแพลตฟอร์มเท่านั้น (ไม่ import @/lib/modules) ⇒ ผลทั้งก้อนของ openBookReservation (RV-1) = ข้อมูลที่หน้าได้ · ไม่มี JSON ดิบของ snapshot ในหน้า", () => {
    const src = stripComments(read("src/app/book/[shop]/my/[token]/page.tsx"));
    ok(src, "ไม่มีหน้า");
    ok(!/from\s+["']@\/lib\/modules/.test(src) && !/policySnapshot/.test(src), "หน้าอ่านโมดูล/snapshot ตรง");
  });
  await st("E5-1", "ชนิดที่ส่งออก TypedBooker (booking-view-core) ไม่มีช่อง email · ไม่มีชนิด/VM ส่งออกใดใน src/lib/modules/trips ที่มีช่องอีเมลผู้จองที่พิมพ์ (typedEmail/bookerEmail)", () => {
    const v = stripComments(read(VIEWCORE));
    const m = /export\s+type\s+TypedBooker\s*=\s*\{([^}]*)\}/.exec(v);
    ok(m, "ไม่มี export type TypedBooker");
    ok(!/\bemail\b/.test(m?.[1] ?? ""), `TypedBooker มีช่อง email: {${(m?.[1] ?? "").trim()}}`);
    const all = git(["ls-files", "src/lib/modules/trips"]).split("\n").filter(Boolean).map((f) => stripComments(read(f))).join("\n");
    ok(!/\b(typedEmail|bookerEmail)\s*[:?]/.test(all), "มีช่อง typedEmail/bookerEmail");
  });
  groupLine("E3");

  console.log("\n── AU: แฮชไม่รวมข้อมูลบุคคล (มติ E4) ──");
  const shaStripped = async (id: string) => String((await q<{ s: string }>(`SELECT encode(sha256(convert_to(("policySnapshot" - 'booker')::text, 'UTF8')), 'hex') AS s FROM "TripBooking" WHERE id = $1`, [id]))[0]?.s ?? "");
  const shaFull = async (id: string) => String((await q<{ s: string }>(`SELECT encode(sha256(convert_to("policySnapshot"::text, 'UTF8')), 'hex') AS s FROM "TripBooking" WHERE id = $1`, [id]))[0]?.s ?? "");
  const reqRefund = async (b: Bk): Promise<string> => {
    const r = await tcall("requestTripRefund", staffCtx(), { bookingId: b.id, expectedVersion: await vOf(b.id), reasonKind: "CUSTOMER", choice: "MONEY", reason: "ลูกค้าขอยกเลิก (W1.2b E4)", idempotencyKey: `w12brq_${hex(6)}` });
    const id = String(asRec(r.value)?.requestId ?? asRec(r.value)?.id ?? "");
    ok(r.ok === true && id, `requestTripRefund ${b.tag}: ${fmt(r)}`);
    return id;
  };
  const approve = async (requestId: string) => {
    const st0 = (await q<{ status: string }>(`SELECT status FROM "TripRefundRequest" WHERE id = $1`, [requestId]))[0]?.status;
    if (st0 === "APPROVED") return;
    const d = await tcall("decideTripRefund", staffCtx(), { requestId, decision: "APPROVE", idempotencyKey: `w12bdc_${hex(6)}` });
    ok(d.ok === true, `decideTripRefund: ${fmt(d)}`);
  };
  const execute = (requestId: string) => tcall("executeTripRefund", staffCtx(), { requestId, idempotencyKey: `w12bex_${hex(6)}` });
  await st("AU-1", "audit trips.booking.change ของการเลื่อน (SAU มีคีย์ booker): before.snapshotSha256 = sha256(JSON ของ snapshot ก่อนเลื่อนที่ตัด booker) ≠ sha ของ snapshot เต็ม", async () => {
    const [b] = needBk("SAU");
    const r0 = await bkRow(b.id);
    typedRed(r0?.s.booker, "SAU ก่อนเลื่อน");
    const { booker: _x, ...rest } = r0?.s ?? {}; void _x;
    const exp = sha256hex(JSON.stringify(rest)), full = sha256hex(JSON.stringify(r0?.s));
    const r = await changeTo(b, DEP.r11);
    ok(r.ok === true, `เลื่อน: ${fmt(r)}`);
    const a = (await q<{ before: Rec }>(`SELECT "before" FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2 AND action = 'trips.booking.change' ORDER BY "createdAt" DESC LIMIT 1`, [tA, b.id]))[0];
    ok(exp !== full, "ตัวควบคุม: แฮชสองแบบต้องต่างกัน");
    eq(asRec(a?.before)?.snapshotSha256, exp, "snapshotSha256");
  });
  await st("AU-2", "คำขอคืนเงิน (RFB1 มีคีย์ booker): computed.facts.snapshotSha = sha ของ (policySnapshot − booker)::text ≠ sha ของ snapshot เต็ม · การจองไม่มีคีย์ (RFL) = sha เต็ม (ค่าเดิมของคำขอที่เปิดก่อนใบนี้)", async () => {
    const [b1, bl] = needBk("RFB1", "RFL");
    const id1 = await reqRefund(b1), idl = await reqRefund(bl);
    REFREQ.rfb1 = id1; REFREQ.rfl = idl;
    const fx = async (id: string) => asRec(asRec(asRec((await q<{ c: Rec }>(`SELECT computed AS c FROM "TripRefundRequest" WHERE id = $1`, [id]))[0]?.c)?.facts))?.snapshotSha;
    const [s1, f1, sl, fl] = [await shaStripped(b1.id), await shaFull(b1.id), await shaStripped(bl.id), await shaFull(bl.id)];
    ok(s1 !== f1 && sl === fl, "ตัวควบคุมของแฮช");
    eq([await fx(id1), await fx(idl)], [s1, fl], "facts.snapshotSha");
  });
  await st("AU-3", "คำขอที่อนุมัติแล้ว (RFB2 มีคีย์) → สำเนาที่พิมพ์ถูกแทนด้วยป้าย {v:1, erased:true} (แบบตัวรับ E1/E7) → executeTripRefund ⇒ DONE (ไม่ใช่ QUOTE_REFRESHED เพราะข้อมูลบุคคล)", async () => {
    const [b2] = needBk("RFB2");
    const id = await reqRefund(b2);
    await approve(id);
    // ORACLE-EDIT AU-3 (ผู้คุม 26 พ.ย. · มติ E7): ตัวรับการลบแทนคีย์ด้วยป้าย (ไม่ลบทิ้ง) — แฮชของ E4 ตัด booker ⇒ ไม่เปลี่ยน
    await pool.query(`UPDATE "TripBooking" SET "policySnapshot" = jsonb_set("policySnapshot", '{booker}', '{"v":1,"erased":true}'::jsonb) WHERE id = $1`, [b2.id]);
    const x = await execute(id);
    ok(x.ok === true && asRec(x.value)?.status === "DONE", `execute: ${fmt(x)}`);
  });
  await st("AU-4", "คำขอที่เปิดอยู่ของการจองไม่มีคีย์ (RFL · แบบคำขอที่เปิดก่อนใบนี้) → อนุมัติ → execute ⇒ DONE (ใบนี้ไม่ทำให้ QUOTE_REFRESHED)", async () => {
    needBk("RFL"); ok(REFREQ.rfl, "AU-2 ไม่ได้สร้างคำขอ");
    await approve(REFREQ.rfl);
    const x = await execute(REFREQ.rfl);
    ok(x.ok === true && asRec(x.value)?.status === "DONE", `execute: ${fmt(x)}`);
  });
  groupLine("AU");

  // ═══════════════ S. ขอบเขตไฟล์/กติกาโค้ด ═══════════════
  console.log("\n── S: ขอบเขตไฟล์และกติกาโค้ด ──");
  const tip = git(["rev-parse", "--verify", "-q", "session/trips"]).trim() || git(["rev-parse", "--verify", "-q", "origin/session/trips"]).trim();
  const same = (f: string) => !!tip && git(["ls-files", "--", f]).trim() !== "" && git(["diff", "--name-only", tip, "--", f]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", f]).trim() === "";
  const limBase = git(["merge-base", "HEAD", "session/trips"]).trim() || BASE_SHA;
  await st("S-1", `ขอบเขต (เทียบ BASE ${BASE_SHA} · ไม่นับไฟล์ที่ตรงกับ session/trips · ไม่นับ scratchpad/ ledger/): แตะได้เฉพาะ ${LIMITED.map(([f]) => f.split("/").pop()).join(" · ")} ตามงบ · ไม่แตะ prisma/platform/party/core/app/components/messages/ข้อสอบเดิม/seed/fixture`, () => {
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...FORBIDDEN_PATHS]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...FORBIDDEN_PATHS]).split("\n")].filter(Boolean))]
      .filter((f) => !f.startsWith("scratchpad/") && !f.startsWith("ledger/"));
    const bad = changed.filter((f) => !same(f) && !fromMainMerge(ROOT, f) && !changedOnlyByMainMerge(ROOT, BASE_SHA, f));
    ok(bad.length === 0, `แตะไฟล์นอกขอบเขต: ${bad.slice(0, 6).join(", ")}`);
    for (const [f, maxDel, maxAdd] of LIMITED) {
      if (same(f)) continue;
      const ns = git(["diff", "--numstat", limBase, "--", f]).trim().split(/\s+/);
      const add = Number(ns[0] || 0), del = Number(ns[1] || 0);
      ok(del <= maxDel && add <= maxAdd, `${f}: +${add} −${del} (จำกัด −${maxDel} +${maxAdd})`);
    }
    const tot = git(["diff", "--numstat", limBase, "--", ...LIMITED.map(([f]) => f)]).trim().split("\n").filter(Boolean).map((l) => l.split(/\s+/).map(Number));
    const ta = tot.reduce((x, r) => x + (r[0] || 0), 0), td = tot.reduce((x, r) => x + (r[1] || 0), 0);
    ok(ta <= TOTAL_BUDGET.add && td <= TOTAL_BUDGET.del, `รวมทั้งใบ +${ta} −${td} (จำกัด +${TOTAL_BUDGET.add} −${TOTAL_BUDGET.del} · E6)`);
  });
  await st("S-2", "ล็อกผู้จอง T0.4d คงเดิมใน finalizeCoreInTx: p:<เบอร์ ≥ 8 หลัก> ก่อน e:<อีเมลตัวเล็ก> ก่อน safeFindOrCreate ด้วยอาร์กิวเมนต์เดิม { name, phone, email } ของ P.booker", () => {
    const s = stripComments(read(BOOKING));
    const iP = s.indexOf("if (ph.length >= 8) await lockBookerKey(t, `p:${c.tenantId}:${ph}`);");
    const iE = s.indexOf("if (em) await lockBookerKey(t, `e:${c.tenantId}:${em}`);");
    const iF = s.indexOf("safeFindOrCreate(c.tenantId, { name: P.booker.name, phone: P.booker.phone, email: P.booker.email }, t)");
    ok(iP > 0 && iE > iP && iF > iE, `ลำดับ/รูปเดิมของล็อกผู้จองหรือการหา Party เปลี่ยน (p ${iP} · e ${iE} · find ${iF})`);
    ok(/hashtext\('trips\.booker\.v1'\)/.test(s), "คลาสล็อก trips.booker.v1 (G3) หาย");
  });
  await st("S-3", "เส้นยืนยันของแพลตฟอร์มไม่เปลี่ยน (รูป/เวลาผลผิดเดิม): trips-self.ts · trips-self-core.ts ตรงกับ session/trips", () => {
    ok(tip, "ไม่มี session/trips ให้เทียบ");
    for (const f of [SSVC, SCORE]) ok(same(f), `${f} ต่างจาก session/trips`);
  });
  await st("S-4", "findBookSelfFacts ยังเป็นคำสั่งอ่านเดิม 2 คำสั่ง ($queryRaw) · ยัง LEFT JOIN Party (ทางสำรอง) · คืน bookerPhoneNorm ชื่อเดิม (ไม่มีคิวรีเพิ่มต่อการยืนยัน)", () => {
    const s = stripComments(read(PUBMOD));
    const i = s.indexOf("export async function findBookSelfFacts");
    ok(i >= 0, "ไม่มี findBookSelfFacts");
    const j = s.indexOf("\nexport ", i + 10);
    const body = s.slice(i, j < 0 ? undefined : j);
    eq((body.match(/\$queryRaw/g) ?? []).length, 2, "จำนวนคำสั่งอ่าน");
    ok(/LEFT JOIN "Party"/.test(body) && /bookerPhoneNorm\s*:/.test(body), "ไม่มี LEFT JOIN Party / bookerPhoneNorm");
  });
  await st("S-5", "บรรทัดที่เพิ่มใน src/ ไม่มี console.* / logOps / ข้อความ audit-outbox ใหม่", () => {
    const d = git(["diff", "-U0", limBase, "--", "src"]).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const bad = d.filter((l) => /console\.|logOps\(|auditBooking\(|auditTx\(|emitOutbox|emitTx\(|emitBooking\(/.test(l));
    ok(bad.length === 0, `มีบรรทัดเพิ่มที่ log/audit/outbox: ${bad.slice(0, 2).join(" | ").slice(0, 200)}`);
  });
  await st("S-6", "modules/party ไม่ถูกแตะ (ตรงกับ session/trips · ใช้ร่วมกับ CRM)", () => {
    ok(tip, "ไม่มี session/trips ให้เทียบ");
    eq(git(["diff", "--name-only", tip, "--", PARTY]).trim() + git(["ls-files", "--others", "--exclude-standard", "--", PARTY]).trim(), "", "ไฟล์ party ที่ต่าง");
  });
  await st("S-7", "ไม่มี migration · ไม่มีคีย์ค่าตั้งใหม่ (prisma/ และ core/settings/defs ตรงกับ BASE ยกเว้นที่มาจากการรวม main)", () => {
    const pr = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", "prisma", "src/lib/core/settings/defs"]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", "prisma", "src/lib/core/settings/defs"]).split("\n")].filter(Boolean))]
      .filter((f) => !fromMainMerge(ROOT, f) && !changedOnlyByMainMerge(ROOT, BASE_SHA, f));
    ok(pr.length === 0, `แตะ: ${pr.slice(0, 4).join(", ")}`);
  });
  groupLine("S");
  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try {
    if (usedClientKeys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [[...new Set(usedClientKeys)].flatMap((k) => [`trips:book:none:${k}`, `trips:token:none:${k}`])]);
    await cleanupTenants(tenantIds); await cleanupUsers();
  } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${(p0 ?? 0) + (c.res === "PASS" ? 1 : 0)}/${(t0 ?? 0) + 1}`; }
console.log(`\n===== QC TRIPS W1.2b-1 · เบอร์ที่ผู้จองพิมพ์ยืนยันตัวตนได้ (ปิด w1.2 C-12) =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
const KNOWN_RED: string[] = []; // ผู้คุมเพิ่มด้วย ORACLE-EDIT เท่านั้น
const knownRed = failed.filter((c) => KNOWN_RED.includes(c.id)).map((c) => c.id), otherRed = failed.filter((c) => !KNOWN_RED.includes(c.id)).map((c) => c.id);
console.log(`แดงที่รู้จัก: ${knownRed.join(" ") || "ไม่มี"} · แดงอื่น: ${otherRed.join(" ") || "ไม่มี"}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), knownRed, otherRed, skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
