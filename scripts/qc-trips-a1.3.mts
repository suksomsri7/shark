// QC — TRIPS A1.3a · ระดับเอเจนซี่ A/B/C · rate card (ต่อระดับ / ต่อเอเจนซี่) · 3 แบบราคา + คอมฯ บาทต่อที่นั่ง · ช่วงพิเศษ · ตัวเลือกชั้นเอเจนซี่ (CC §F.1 ขั้น 5–6) · port ตัวจริง · เครื่องลองคิด
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/A1.3.md (ใบสั่ง) · ledger/TRIPS-CORE-CONTRACT.md §A.2 :87 · §B.2 :181–:186 · §E.4 X26 · §F.1 · §F.2 · §H.4 · ภาพ ledger/design-trips/10-agent-pricing.body.html :59–68
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนสร้าง: ฐาน/CHECK ของตาราง · เครื่องยนต์ T0.5 ให้ 1,050 / 7,181.50 ด้วย port ที่ข้อสอบฉีดเอง · snapshot ค่าตั้ง 24 คีย์ · ตัวอ้างอิงของข้อสอบ · AGENT ยังถือที่ไม่ได้ · ตัวสแกน)
//   K core บริสุทธิ์ · KF สุ่มมีเมล็ดเทียบตัวอ้างอิงของข้อสอบ · S โครง/ขอบเขต/สิทธิ์/ไม่มีสูตรเงิน/AGENT ยังปิด · T ระดับ · R rate card + แถวราคา · PM สิทธิ์ · X แยกร้าน/เอเจนซี่
//   C พร้อมกัน/CAS · AU audit/event · E ราคาจริงบนฐาน (สตางค์ตรงตัว) · TP เครื่องลองคิด = เส้นทางจริง · SN snapshot ไม่เปลี่ยน · EF คุณสมบัติเงินสุ่ม · ST ค่าตั้ง · G regression
//
// 🔴 ร้านชั่วคราว slug `trips-a13-*` (A: หน่วย TRIPS 2 [หน่วยที่สองเขตเวลา UTC] · B: TRIPS 1) · ตัวตนเอเจนซี่ติดป้าย "QCA13" · อีเมล `qca13-*@example.test` · ลบใน finally + กวาดค้างตอนเริ่ม
//    สินค้า/ประเภทคน/รายการเสริม/รอบ/ราคาปลีก/บัญชีเอเจนซี่ สร้างด้วย SQL ดิบ (รูปตารางของ T0.1 / A1.1) · ระดับ + rate card + แถวราคา สร้างผ่านบริการของใบนี้
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-a1.3.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน · `--no-regression` = G เป็น SKIP — รับใบต้องไม่มี SKIP)
// ผลที่ถูกต้องก่อนมี A1.3a: PC เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-a1.3";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NO_REG = process.argv.includes("--no-regression");
const BASE_SHA = "8a8c1a070"; // ORACLE-EDIT S-6 S-7 (ผู้คุม 14 พ.ย.): ฐาน = commit ใบสั่ง (ผู้คุมเพิ่มเส้น agency→trips ใน fitness.mts ใน commit นั้นเอง · มติ R2) · เดิม e60f54c89 // ปลาย wip/trips-a1.3 ตอนเขียนข้อสอบ (= session/trips หลังรับ A1.2a)
const AGENCY_MIG = "20270201000200_agency";
const ORACLE_FILE = "scripts/qc-trips-a1.3.mts";

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) process.env.SESSION_SECRET = `qc-a13-session-${"s".repeat(40)}`;
if (!process.env.INTEGRATIONS_CREDENTIALS_KEY || process.env.INTEGRATIONS_CREDENTIALS_KEY.trim().length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = `qc-a13-${"k".repeat(40)}`;
process.env.RESEND_API_KEY = "";
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
type F = (...a: unknown[]) => unknown;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 320); } catch { return String(v); } };
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
const skip = (id: string, name: string, why: string) => record(id, name, "SKIP", why);
const groupLine = (g: string) => {
  const mine = cks.filter((c) => c.id.replace(/-\d+$/, "") === g);
  console.log(`  ── สรุป ${g}: ผ่าน ${mine.filter((c) => c.res === "PASS").length}/${mine.length}`);
};
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const R = (v: unknown): Rec => asRec(v) ?? {};
const A = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => R(x)) : []);
const fnOf = (mod: Rec | null, name: string, where: string): F => {
  const f = mod?.[name];
  if (typeof f !== "function") throw new AssertFail(`${where} ยังไม่มี ${name}`);
  return f as F;
};
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
const gitOk = (args: string[]) => spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).status === 0;
const hasRef = (ref: string) => gitOk(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
const changedSinceBase = (paths: string[]): string[] => {
  const a = git(["diff", "--name-only", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean);
  const b = git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n").filter(Boolean);
  return [...new Set([...a, ...b])];
};
const sameAsSession = (f: string) => hasRef("session/trips") && gitOk(["diff", "--quiet", "session/trips", "--", f]) && !git(["ls-files", "--others", "--exclude-standard", "--", f]).trim();
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const hex = (n: number) => randomBytes(n).toString("hex");
const rid = (p: string) => `a13qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG = "trips-a13-";
const EMAIL_PREFIX = "trips-a13-";
const QC_MARK = "QCA13";
const mail = (tag: string) => `qca13-${tag}-${STAMP}@example.test`;
const keysDeep = (v: unknown, out: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(v)) { for (const x of v) keysDeep(x, out); return out; }
  const r = asRec(v);
  if (r) for (const [k, x] of Object.entries(r)) { out.add(k); keysDeep(x, out); }
  return out;
};
const leaks = (s: string, needles: string[]) => needles.filter((n) => n && n.length >= 6 && s.includes(n));
const sortedKeys = (v: unknown) => Object.keys(R(v)).sort();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const deepFreeze = <T,>(v: T): T => { if (v && typeof v === "object") { for (const k of Object.keys(v as object)) deepFreeze((v as Rec)[k]); Object.freeze(v); } return v; };
const addDaysYmd = (ymd: string, n: number) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n)).toISOString().slice(0, 10);
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const NEVER_SHOW = ["identityId", "agentUserId", "lastLoginAt", "providerId", "subject", "activeAgentAccountId", "taxIdHash", "taxIdEnc", "bankAccountEnc", "inviteTokenHash", "tokenHash", "codeHash", "target", "tenantIds", "otherAccounts"];

// ═══════════════ ตัวเลขอ้างอิง (ฟิกซ์เจอร์ · ภาพ 10 · CC §H.4) ═══════════════
const RACHA = FX.PRODUCT_RACHA;
const AC = FX.AGENCY_CASE_2ADULTS; // 2 ผู้ใหญ่ราชา · ระดับ B 15% · หัก 3% ⇒ 1,050 / 31.50 / ส่งร้าน 7,181.50
const ACV = FX.AGENCY_COMMISSION_VAT; // EXCLUSIVE 7,108.00 · INCLUSIVE 7,179.44 · ร้านเก็บ: จ่ายเอเจนซี่ 1,018.50
const ADULT = RACHA.adultSatang, CHILD = RACHA.childSatang;
const NOW = new Date(FX.TRIPS_AS_OF); // 12 พ.ย. 2569 18:00 ไทย
const TODAY = "2026-11-12";
const DEP_DATE = "2027-03-10";

// ═══════════════ ตัวคำนวณอ้างอิงของข้อสอบ (BigInt · ไม่พึ่งโค้ดที่ตรวจ) ═══════════════
const halfUp = (num: bigint, den: bigint): bigint => (BigInt(2) * num + den) / (BigInt(2) * den); // num ≥ 0 · den > 0
const refBp = (amount: number, bp: number) => Number(halfUp(BigInt(amount) * BigInt(bp), BigInt(10_000)));
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ── ตัวเลือกชั้นเอเจนซี่อ้างอิง (ใบสั่ง §5.1–§5.3 ตรงตัว) ──
const inR = (d: string, f: unknown, t: unknown) => (f === null || f === undefined || String(f) <= d) && (t === null || t === undefined || d <= String(t));
const isSpecial = (r: Rec) => r.bookFrom !== null || r.bookTo !== null || r.travelFrom !== null || r.travelTo !== null;
const descNullLast = (a: unknown, b: unknown) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : String(a) > String(b) ? -1 : 1);
function refLayer(layer: "TIER" | "CONTRACT", f: Rec): Rec | null {
  const acc = R(f.account), prod = R(f.product);
  const cards = A(f.cards).filter((c) => c.status === "ACTIVE" && inR(String(f.bookYmd), c.validFrom, c.validTo)
    && (layer === "TIER" ? c.ownerKind === "TIER" && acc.tierId !== null && c.tierId === acc.tierId : c.ownerKind === "AGENT" && c.agentAccountId === acc.id));
  const rows: { r: Rec; c: Rec }[] = [];
  for (const c of cards) for (const r of A(c.rates)) {
    if (r.active === true && r.productKind === "TRIP" && r.productId === prod.id && (r.optionId === null || r.optionId === prod.optionId) && r.cabinTypeId === null && r.currency === f.currency
      && inR(String(f.bookYmd), r.bookFrom, r.bookTo) && inR(String(f.travelYmd), r.travelFrom, r.travelTo)) rows.push({ r, c });
  }
  // ORACLE-EDIT KF-1 (มติ Z5 ค): "แถวแรก" — ก่อนตัดสินด้วย id: แถวไม่ระบุประเภทคนมาก่อนแถวรายประเภท · แถวรายประเภทเสมอกันตัดสินด้วยรหัสประเภทคน
  //   (ร่างใช้ id "draft-…" ส่วนหลังบันทึกใช้ id จริง — ถ้าเสมอแล้วตัดสินด้วย id ร่างกับหลังบันทึกจะได้คนละแถว ซึ่งมติห้าม)
  const cmpS = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
  const order = (x: { r: Rec; c: Rec }, y: { r: Rec; c: Rec }) => (Number(y.r.priority) - Number(x.r.priority)) || (Number(isSpecial(y.r)) - Number(isSpecial(x.r))) || (Number(y.r.optionId !== null) - Number(x.r.optionId !== null))
    || (Number(y.c.priority) - Number(x.c.priority)) || descNullLast(x.r.travelFrom, y.r.travelFrom) || descNullLast(x.r.bookFrom, y.r.bookFrom)
    || (Number(x.r.paxTypeId !== null) - Number(y.r.paxTypeId !== null)) || cmpS(x.r.paxTypeId ?? "", y.r.paxTypeId ?? "") || cmpS(x.r.id, y.r.id);
  rows.sort(order);
  if (!rows.length) {
    if (layer === "CONTRACT" || acc.tierId === null || acc.tierCode === null) return null;
    const t = R(R(R(R(f.policy).values)["agency.tier.table"])[String(acc.tierCode)]);
    const pct = prod.productType === "LIVEABOARD" ? t.laPct : t.tourPct;
    return { refId: `tier:${String(acc.tierId)}:A1`, mode: "COMMISSION_PCT", rateBp: Number(pct) * 100, fixedSatang: null, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null };
  }
  const first = rows[0]; const mode = String(first.r.mode);
  const same = rows.filter((x) => x.r.mode === mode);
  const refId = `${String(first.r.id)}@${String(first.c.version)}`;
  if (mode === "COMMISSION_PCT") return { refId, mode, rateBp: first.r.valueBp, fixedSatang: null, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null };
  if (mode === "COMMISSION_FIXED") return { refId, mode, rateBp: null, fixedSatang: first.r.valueMinor, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null };
  const map: Rec = {};
  // ORACLE-EDIT KF-1 (มติ Z5 ข): ราคาต่อประเภทคน — priority → ช่วงพิเศษ → ความเจาะจงของประเภทคน → ลำดับเดิม (แถวช่วงพิเศษไม่ระบุประเภท priority สูงกว่าชนะแถวปกติรายประเภท)
  for (const pt of A(prod.paxTypes)) {
    const cand = same.filter((x) => x.r.paxTypeId === pt.id || x.r.paxTypeId === null)
      .sort((x, y) => (Number(y.r.priority) - Number(x.r.priority)) || (Number(isSpecial(y.r)) - Number(isSpecial(x.r))) || (Number(y.r.paxTypeId !== null) - Number(x.r.paxTypeId !== null)) || order(x, y));
    if (cand.length) map[String(pt.code)] = cand[0].r.valueMinor;
  }
  // ORACLE-EDIT KF-1 (มติ Z5 ง): ขั้นต่ำมาจากแถวไม่ระบุประเภทคนเท่านั้น (แถวแรกตามลำดับที่ paxTypeId null) · ไม่มี/เป็น null ⇒ A7 (เฉพาะสกุลการจอง THB)
  const a7 = R(R(f.policy).values)["agency.price.minResalePrice"];
  const generic = same.find((x) => x.r.paxTypeId === null);
  const minSell = generic && generic.r.minSellMinor !== null ? generic.r.minSellMinor : f.currency === "THB" && typeof a7 === "number" ? a7 : null;
  return { refId, mode, rateBp: null, fixedSatang: null, unitMinorByPaxCode: map, minSellMinor: minSell, markupCapBp: mode === "MARKUP" ? first.r.markupCapBp : null };
}

// ═══════════════ ฐาน ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 16 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
async function cols(table: string): Promise<ColRow[]> {
  const c = colCache.get(table);
  if (c) return c;
  const r = await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]);
  if (r.length) colCache.set(table, r);
  return r;
}
async function ins(table: string, vals: Rec, client: pg.Pool | pg.PoolClient = pool): Promise<string> {
  const cs = await cols(table);
  if (!cs.length) throw new AssertFail(`ไม่มีตาราง ${table}`);
  const names = new Set(cs.map((c) => c.column_name));
  const v: Rec = {};
  for (const [k, x] of Object.entries(vals)) if (names.has(k)) v[k] = x;
  for (const c of cs) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    v[c.column_name] = t === "text" || t.startsWith("character") ? `qc${hex(3)}` : ["integer", "bigint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await client.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => { const x = v[k]; return x !== null && typeof x === "object" && !(x instanceof Date) && !Array.isArray(x) ? JSON.stringify(x) : x; }));
  return String(v.id ?? "");
}
const pgCode = async (sql: string, params: unknown[]): Promise<string> => { try { await pool.query(sql, params); return "OK"; } catch (e) { return String((e as { code?: unknown }).code ?? "ERR"); } };

// ═══════════════ ร้านชั่วคราว + กวาด ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
const createdUserIds: string[] = [];
const createdIdentityIds: string[] = [];
async function cleanupGlobal() {
  try {
    const us = (await q<{ id: string }>(`SELECT u.id FROM "AgentUser" u LEFT JOIN "AgentIdentity" i ON i.id = u."identityId" WHERE u."displayName" LIKE $1 OR i."displayName" LIKE $1 OR u.id = ANY($2::text[]) OR u."identityId" = ANY($3::text[])`, [`${QC_MARK}%`, createdUserIds, createdIdentityIds])).map((r) => r.id);
    if (us.length) {
      await pool.query(`DELETE FROM "AgentLogin" WHERE "agentUserId" = ANY($1::text[])`, [us]);
      await pool.query(`DELETE FROM "AgentSession" WHERE "agentUserId" = ANY($1::text[])`, [us]);
      await pool.query(`DELETE FROM "AgentUser" WHERE id = ANY($1::text[])`, [us]);
    }
    await pool.query(`DELETE FROM "AgentLogin" WHERE subject LIKE 'qca13-%'`);
    await pool.query(`DELETE FROM "AgentIdentity" WHERE "displayName" LIKE $1 OR id = ANY($2::text[])`, [`${QC_MARK}%`, createdIdentityIds]);
  } catch (e) { console.log(`  ⚠️ cleanup global: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
    if (!us.length) return;
    for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* ignore */ } }
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
const unregister: (() => void)[] = [];

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers(); await cleanupGlobal();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  // ── โมดูล ──
  const AGM = await tryImport("@/lib/modules/agency");
  const COREM = await tryImport("@/lib/modules/agency/rates-core");
  const TRM = await tryImport("@/lib/modules/trips");
  const SETM = await tryImport("@/lib/core/settings");
  const need = (m: { mod: Rec | null; err: string }, what: string): Rec => { if (!m.mod) throw new AssertFail(`ยังไม่มี ${what} (${m.err.slice(0, 90)})`); return m.mod; };
  const AG = (n: string): F => fnOf(need(AGM, "@/lib/modules/agency"), n, "agency facade");
  const AGV = (n: string): unknown => { const m = need(AGM, "@/lib/modules/agency"); if (!(n in m)) throw new AssertFail(`agency facade ยังไม่มี ${n}`); return m[n]; };
  const CO = (n: string): unknown => { const m = need(COREM, "agency/rates-core"); if (!(n in m)) throw new AssertFail(`rates-core ยังไม่มี ${n}`); return m[n]; };
  const COF = (n: string): F => { const f = CO(n); if (typeof f !== "function") throw new AssertFail(`rates-core.${n} ไม่ใช่ฟังก์ชัน`); return f as F; };
  const TR = (n: string): F => fnOf(need(TRM, "@/lib/modules/trips"), n, "trips facade");
  const S = (n: string): F => fnOf(need(SETM, "@/lib/core/settings"), n, "settings");
  const LIM = (k: string): number => { const v = R(CO("AGENT_RATE_LIMITS"))[k]; ok(typeof v === "number", `AGENT_RATE_LIMITS.${k} ไม่ใช่ตัวเลข`); return v as number; };
  const AG_DIR = "src/lib/modules/agency";
  const F_CORE = `${AG_DIR}/rates-core.ts`, F_SVC = `${AG_DIR}/rates.ts`;
  const OWNED_NEW = [F_CORE, F_SVC];
  const OWNED = new Set([...OWNED_NEW, `${AG_DIR}/index.ts`, "src/lib/core/permissions.ts", "src/lib/platform/sellables.ts"]);
  const needBuilt = () => { const miss = OWNED_NEW.filter((f) => !existsSync(join(ROOT, f))); if (miss.length) throw new AssertFail(`ยังไม่มีไฟล์ ${miss.join(", ")}`); };
  const V = (r: unknown, what: string): Rec => { const x = R(r); ok(x.ok === true, `${what}: ${fmt(x)}`); return R(x.value); };
  const com = (v: Rec) => R(v.commission);
  const tot = (v: Rec) => R(v.totals);
  const wht = (v: Rec) => R(com(v).wht);

  // ═══════════════ PC (ส่วนที่ไม่ต้องมีร้าน) ═══════════════
  console.log("\n── PC: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("PC-1", `ฐาน QC ต่อได้ + migration ${AGENCY_MIG} ลงแล้ว + ตาราง AgentTier/AgentRateCard/AgentRate/AgentAccount มี + คอลัมน์ที่ใบสั่งใช้ครบ`, async () => {
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, [AGENCY_MIG]);
    eq(r[0]?.n, 1, "migration agency");
    const want: Record<string, string[]> = {
      AgentTier: ["id", "tenantId", "code", "name", "sortOrder", "active"],
      AgentRateCard: ["id", "tenantId", "ownerKind", "tierId", "agentAccountId", "name", "status", "validFrom", "validTo", "version", "priority"],
      AgentRate: ["id", "tenantId", "rateCardId", "productKind", "productId", "optionId", "paxTypeId", "cabinTypeId", "mode", "valueBp", "valueMinor", "currency", "minSellMinor", "markupCapBp", "bookFrom", "bookTo", "travelFrom", "travelTo", "priority", "active"],
      AgentAccount: ["id", "tenantId", "tierId", "status", "unitIds", "payeeType", "vatRegistered", "updatedAt"],
    };
    for (const [t, cs] of Object.entries(want)) { const have = new Set((await cols(t)).map((c) => c.column_name)); eq(cs.filter((c) => !have.has(c)), [], `คอลัมน์ ${t}`); }
  });
  await st("PC-2", "ตัวอ้างอิงของข้อสอบ: ปัด half-up (0.5 ขึ้น) · 15% ของ 7,000.00 = 1,050.00 · 3% ของ 1,050.00 = 31.50 · 3% ของ 1,417.50 = 42.53 · ตัวเลือกอ้างอิงเลือกแถว priority สูง", () => {
    eq([refBp(AC.saleSatang, 1500), refBp(105_000, 300), refBp(141_750, 300), refBp(1, 5000), refBp(3, 5000)], [AC.commissionSatang, AC.whtSatang, 4_253, 1, 2], "half-up");
    const f = { account: { id: "a", tierId: "t", tierCode: "B" }, product: { id: "p", productType: "TOUR", optionId: null, paxTypes: [] }, currency: "THB", bookYmd: TODAY, travelYmd: DEP_DATE, policy: { values: { "agency.tier.table": { B: { tourPct: 15, laPct: 15 } } } },
      cards: [{ id: "c", ownerKind: "TIER", tierId: "t", agentAccountId: null, status: "ACTIVE", validFrom: null, validTo: null, version: 2, priority: 0, rates: [
        { id: "r1", productKind: "TRIP", productId: "p", optionId: null, paxTypeId: null, cabinTypeId: null, mode: "COMMISSION_PCT", valueBp: 1100, valueMinor: null, currency: "THB", minSellMinor: null, markupCapBp: null, bookFrom: null, bookTo: null, travelFrom: null, travelTo: null, priority: 0, active: true },
        { id: "r2", productKind: "TRIP", productId: "p", optionId: null, paxTypeId: null, cabinTypeId: null, mode: "COMMISSION_PCT", valueBp: 900, valueMinor: null, currency: "THB", minSellMinor: null, markupCapBp: null, bookFrom: null, bookTo: null, travelFrom: "2027-03-01", travelTo: null, priority: 1, active: true }] }] };
    eq([R(refLayer("TIER", f)).refId, R(refLayer("TIER", f)).rateBp, refLayer("CONTRACT", f), R(refLayer("TIER", { ...f, cards: [] })).rateBp], ["r2@2", 900, null, 1500], "ตัวเลือกอ้างอิง");
  });

  // ── ร้านชั่วคราว ──
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uB = rid("uB");
  type Staff = { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Rec };
  const staff: Record<string, Staff> = {};
  type Prod = { id: string; opt: string; opt2: string; unit: string; tenant: string; pt: Record<string, string> };
  const PRD: Record<string, Prod> = {};
  const MARK_B = `${QC_MARK}-MARKB-${STAMP}`, MARK_CARD = `${QC_MARK}-CARDNAME-${STAMP}`, MARK_LEGAL = `${QC_MARK}-LEGAL-${STAMP}`;
  let setupErr = "", settingsErr = "", seq = 0;
  const PARK_TABLE = { confirmedAt: null, groups: [{ code: "G1", nameTh: "กลุ่ม 1", thaiChildSatang: 1_000, thaiAdultSatang: 2_000, foreignChildSatang: 5_000, foreignAdultSatang: 10_000 }], diveSatangPerPaxDay: 20_000, mooring: { upTo20Satang: 100_000, from21Satang: 200_000 },
    shopRates: [{ label: "เกาะราชา", adultSatang: RACHA.parkAdultSatang, childSatang: RACHA.parkChildSatang, diverSatang: null, effectiveFrom: "2026-11-01" }] };
  try {
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await ins("Tenant", { id, name: `${QC_MARK} ร้าน ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag, settings] of [[uA, tA, "a", {}], [uA2, tA, "a2", { timezone: "UTC" }], [uB, tB, "b", {}]] as const) await ins("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings, updatedAt: new Date() });
    const mk = async (tag: string, tenantId: string, role: Staff["role"], unitAccess: string[], permissions: Rec): Promise<Staff> => {
      const id = rid(`u${tag}`);
      await ins("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await ins("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: new Date(), updatedAt: new Date() });
      return { userId: id, role, unitAccess, permissions };
    };
    staff.OA = await mk("oa", tA, "OWNER", ["*"], {});
    staff.OB = await mk("ob", tB, "OWNER", ["*"], {});
    staff.NONE = await mk("none", tA, "STAFF", ["*"], {});
    staff.VIEW = await mk("view", tA, "STAFF", ["*"], { "agency.rate.view": true });
    staff.EDIT = await mk("edit", tA, "STAFF", ["*"], { "agency.rate.view": true, "agency.rate.edit": true });
    staff.RESTR = await mk("restr", tA, "STAFF", [uA2], { "agency.rate.view": true, "agency.rate.edit": true, "agency.account.view": true });
    const mkProd = async (key: string, tenantId: string, unitId: string) => {
      const id = rid(`p${key}`), o = rid(`o${key}`), o2 = rid(`o2${key}`);
      await ins("TripProduct", { id, tenantId, unitId, slug: `a13qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: { th: `ทดสอบ ${key}` }, body: {}, currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await ins("TripOption", { id: o, tenantId, unitId, productId: id, name: { th: "ร่วมกลุ่ม" }, durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      await ins("TripOption", { id: o2, tenantId, unitId, productId: id, name: { th: "ส่วนตัว" }, durationMin: 480, sortOrder: 2, active: true, updatedAt: new Date() });
      const pt: Record<string, string> = {};
      for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await ins("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: { th: code }, countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
      await ins("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: RACHA.parkAdultSatang, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
        name: { th: "ค่าอุทยาน" }, paxPrices: { ADULT: RACHA.parkAdultSatang, CHILD: RACHA.parkChildSatang }, active: true, updatedAt: new Date() });
      for (const [code, amt] of [["ADULT", ADULT], ["CHILD", CHILD]] as const) await ins("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amt, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt: o, opt2: o2, unit: unitId, tenant: tenantId, pt };
    };
    await mkProd("A", tA, uA); await mkProd("A2", tA, uA2); await mkProd("B", tB, uB);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const ctxOf = (tenantId: string, s: Staff) => ({ tenantId, actorUserId: s.userId });
  const cA = () => ctxOf(tA, staff.OA), cB = () => ctxOf(tB, staff.OB);
  const setV = async (tenantId: string, changes: Rec[], who = "OA") => {
    const r = R(await S("setSettings")({ ...staff[who] }, { tenantId }, changes, { ackLegalWarn: true }));
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  try {
    if (!setupErr) {
      for (const [t, u, who] of [[tA, uA, "OA"], [tA, uA2, "OA"], [tB, uB, "OB"]] as const) {
        const park = R(R(await S("resolveSetting")({ tenantId: t }, "trips.parkFee.table", { unitId: u })).value);
        await setV(t, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: u, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } },
          { key: "trips.parkFee.table", scope: "UNIT", scopeId: u, value: { ...park, shopRates: PARK_TABLE.shopRates } }], who);
      }
    }
  } catch (e) { settingsErr = errMsg(e); console.log(`  ⚠️ ตั้งค่าตั้งหน่วยไม่สำเร็จ: ${settingsErr}`); }
  const needDb = () => { ok(!setupErr && PRD.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); ok(!settingsErr, `ตั้งค่าตั้งไม่ได้: ${settingsErr}`); };
  const mkDep = async (date: string, key = "A", optKey: "opt" | "opt2" = "opt"): Promise<string> => {
    const p = PRD[key]; const startsAt = new Date(BKK(date, "08:00").getTime() + (seq++ % 500) * 60_000); const id = rid("d");
    await ins("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p[optKey], scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "OPEN", capacity: 24, sold: 0, held: 0, reserved: 0, minPax: RACHA.minPax, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const mkIdentity = async (tag: string): Promise<string> => {
    const r = R(await AG("createAgentIdentity")({ displayName: `${QC_MARK} ${tag} ${STAMP}`, owner: { displayName: `${QC_MARK} owner ${tag}`, login: { kind: "EMAIL", providerId: "email", subject: mail(tag) } } }));
    ok(r.ok === true, `createAgentIdentity: ${fmt(r)}`);
    const id = String(R(r.identity).id); createdIdentityIds.push(id); createdUserIds.push(String(r.agentUserId));
    return id;
  };
  type Acc = { id: string; tenant: string; identityId: string | null };
  const ACC: Record<string, Acc> = {};
  const mkAccount = async (key: string, tenantId: string, o: { status?: string; vatRegistered?: boolean; payeeType?: string; unitIds?: string[]; identityId?: string | null; legalName?: string } = {}): Promise<Acc> => {
    const status = o.status ?? "ACTIVE";
    const identityId = o.identityId !== undefined ? o.identityId : status === "CLOSED" ? null : await mkIdentity(key.toLowerCase());
    const id = rid(`acc${key}`);
    await ins("AgentAccount", { id, tenantId, identityId, kind: "AGENT", code: `Q${key}${hex(2)}`.toUpperCase(), status, tierId: null, partyId: rid("party"), unitIds: o.unitIds ?? [], legalName: o.legalName ?? `${QC_MARK} บจก. ${key}`,
      payeeType: o.payeeType ?? "TH_JURISTIC", country: "TH", vatRegistered: o.vatRegistered ?? false, ...(status === "ACTIVE" ? { approvedAt: new Date() } : {}), ...(status === "CLOSED" ? { statusReason: "CLOSED_BY_SHOP" } : {}), updatedAt: new Date() });
    ACC[key] = { id, tenant: tenantId, identityId };
    return ACC[key];
  };
  const acc = (key: string): Acc => { const a = ACC[key]; if (!a) throw new AssertFail(`ไม่มีบัญชีทดสอบ ${key} (${accErr || "ยังไม่ตั้ง"})`); return a; };
  let accErr = "";
  try {
    if (!setupErr) {
      for (const k of ["X", "Y", "XC", "XN", "XF", "XT", "XS", "S1", "S2", "T1"]) await mkAccount(k, tA);
      await mkAccount("V", tA, { vatRegistered: true });
      await mkAccount("SU", tA, { status: "SUSPENDED" });
      await mkAccount("CL", tA, { status: "CLOSED" });
      await mkAccount("RU", tA, { unitIds: [uA] });
      await mkAccount("Z", tB, { identityId: ACC.X.identityId, legalName: `${MARK_B} ${MARK_LEGAL}` }); // เอเจนซี่เดียวกัน (ตัวตนเดียวกัน) ที่ร้าน B
    }
  } catch (e) { accErr = errMsg(e); console.log(`  ⚠️ ตั้งบัญชีเอเจนซี่ไม่สำเร็จ: ${accErr}`); }

  const agentCtx = (accountId: string, o: { now?: Date; unit?: string; tenant?: string } = {}): Rec => ({ tenantId: o.tenant ?? tA, unitId: o.unit ?? uA, channel: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: accountId, agentUserId: "agu_qc" }, now: o.now ?? NOW, locale: "th" });
  const line = (depId: string, o: { key?: string; adults?: number; children?: number; opt?: "opt" | "opt2" } = {}): Rec => {
    const p = PRD[o.key ?? "A"];
    return { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: depId, optionId: p[o.opt ?? "opt"], pax: [{ paxTypeId: p.pt.ADULT, qty: o.adults ?? 2 }, ...((o.children ?? 0) > 0 ? [{ paxTypeId: p.pt.CHILD, qty: o.children ?? 0 }] : [])], extras: [] };
  };
  const callTr = async (name: string, ...a: unknown[]): Promise<Rec> => { const f = TR(name); try { return R(await f(...a)); } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  let installedOnce = false;
  const install = async () => { needBuilt(); await AG("installAgencyPricingPort")(); installedOnce = true; };
  const quoteAgent = async (accountId: string, depId: string, o: { key?: string; adults?: number; children?: number; now?: Date; unit?: string; tenant?: string; opt?: "opt" | "opt2" } = {}): Promise<Rec> => {
    await install();
    return callTr("quoteTripLine", agentCtx(accountId, { now: o.now, unit: o.unit ?? PRD[o.key ?? "A"].unit, tenant: o.tenant }), line(depId, o));
  };
  /** เรียกบริการฝั่งร้าน — ไม่ throw (throw = ผล {ok:"THROW"}) · ยังไม่มีฟังก์ชัน ⇒ AssertFail */
  const seenByA: string[] = [];
  const shop = async (fn: string, ctx: { tenantId: string; actorUserId: string } | unknown, input?: unknown, opts: Rec = {}): Promise<Rec> => {
    const f = AG(fn);
    let r: Rec;
    try { r = R(await (input === undefined ? f(ctx) : f(ctx, input, { now: NOW, ...opts }))); } catch (e) { r = { ok: "THROW", e: errMsg(e) }; }
    if (asRec(ctx)?.tenantId === tA) seenByA.push(JSON.stringify(r));
    return r;
  };
  const okR = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return r; };
  const failR = (r: Rec, code: string, what: string, reason?: string) => {
    ok(r.ok === false && r.code === code, `${what}: ต้อง ${code} ได้ ${fmt(r)}`);
    if (reason) eq(r.reason, reason, `${what} reason`);
    ok(typeof r.message === "string" && /[฀-๿]/.test(String(r.message)), `${what}: ไม่มีข้อความไทย`);
  };
  const tierIds: Record<string, Record<string, string>> = {};
  const tiers = async (tenantId = tA): Promise<Record<string, string>> => {
    if (tierIds[tenantId]) return tierIds[tenantId];
    needBuilt();
    const r = okR(await shop("ensureAgentTiers", tenantId === tA ? cA() : cB()), "ensureAgentTiers");
    const m: Record<string, string> = {};
    for (const t of A(r.tiers)) m[String(t.code)] = String(t.id);
    eq(Object.keys(m).sort(), ["A", "B", "C"], "ระดับ");
    tierIds[tenantId] = m;
    return m;
  };
  const setTierRaw = async (key: string, code: "A" | "B" | "C" | null) => {
    const t = code ? (await tiers(acc(key).tenant))[code] : null;
    await pool.query(`UPDATE "AgentAccount" SET "tierId" = $2 WHERE id = $1`, [acc(key).id, t]);
  };
  const cardVer = async (id: string): Promise<number> => Number((await q<{ version: number }>(`SELECT version FROM "AgentRateCard" WHERE id = $1`, [id]))[0]?.version ?? -1);
  const rateOf = (o: Rec = {}): Rec => ({ productKind: "TRIP", productId: PRD.A.id, mode: "COMMISSION_PCT", valueBp: 1200, ...o });
  /** สร้าง card ผ่านบริการ + ใส่แถว + (ปริยาย) เปิดใช้ — คืน id · version ล่าสุด · id ของแถวตามลำดับ */
  const mkCard = async (owner: Rec, rates: Rec[], o: { ctx?: { tenantId: string; actorUserId: string }; activate?: boolean; validFrom?: string; validTo?: string; priority?: number; name?: string } = {}): Promise<{ id: string; version: number; rateIds: string[] }> => {
    needBuilt();
    const ctx = o.ctx ?? cA();
    const c = R(okR(await shop("createAgentRateCard", ctx, { owner, name: o.name ?? `card ${hex(3)}`, ...(o.validFrom ? { validFrom: o.validFrom } : {}), ...(o.validTo ? { validTo: o.validTo } : {}), ...(o.priority !== undefined ? { priority: o.priority } : {}) }), "createAgentRateCard").card);
    const id = String(c.id); let version = Number(c.version); const rateIds: string[] = [];
    for (const rate of rates) {
      const u = okR(await shop("upsertAgentRate", ctx, { cardId: id, expectedVersion: version, rate }), "upsertAgentRate");
      version = Number(R(u.card).version); rateIds.push(String(R(u.rate).id));
    }
    if (o.activate !== false) { const s = okR(await shop("setAgentRateCardStatus", ctx, { cardId: id, expectedVersion: version, action: "ACTIVATE" }), "ACTIVATE"); version = Number(R(s.card).version); }
    return { id, version, rateIds };
  };
  const tierOwner = (code: string) => ({ kind: "TIER", tierCode: code });
  const agentOwner = (key: string) => ({ kind: "AGENT", agentAccountId: acc(key).id });
  const auditRows = async (tenantId: string) => q<{ action: string; actorId: string | null; targetType: string | null; after: unknown; j: string }>(`SELECT action, "actorId", "targetType", after, row_to_json(a)::text AS j FROM "AuditLog" a WHERE "tenantId" = $1 AND (action LIKE 'agency.rate%' OR action LIKE 'agency.tier%') ORDER BY "createdAt"`, [tenantId]);
  const writeCounts = async () => {
    const a = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]))[0]?.n;
    const o = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]).catch(() => [{ n: -1 }]))[0]?.n;
    const c = (await q<{ n: number; v: number }>(`SELECT count(*)::int AS n, COALESCE(sum(version), 0)::int AS v FROM "AgentRateCard" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]))[0];
    const r = (await q<{ n: number; h: string }>(`SELECT count(*)::int AS n, COALESCE(md5(string_agg(id || ':' || COALESCE("valueBp"::text, '') || ':' || COALESCE("valueMinor"::text, '') || ':' || active::text, ',' ORDER BY id)), '') AS h FROM "AgentRate" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]))[0];
    return [a, o, c?.n, c?.v, r?.n, r?.h];
  };

  // ═══════════════ PC (ส่วนที่ใช้ร้าน) ═══════════════
  const agencyFixture = (accountId: string): Rec => ({
    agentAccountId: accountId, agentTierId: "tier_B", vatRegistered: false,
    tier: { refId: "tier_B", mode: "COMMISSION_PCT", rateBp: AC.commissionBp, fixedSatang: null, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null }, contract: null,
    terms: { collector: "AGENT_COLLECTS", sellerOfRecord: "SHOP_PRINCIPAL", vatMode: "NONE", vatRateBp: 700,
      wht: { applies: true, mode: "RATE", rateBp: AC.whtBp, eWht: false, grossUp: true, minPerContractSatang: 100_000, continuous: "EVERY_PAYMENT", remitter: "SHOP", payerType: "JURISTIC", payeeType: "TH_JURISTIC" },
      discountFromCommission: { enabled: false, capPct: 5 }, earnedAt: "AFTER_TRAVEL", clawbackOnCancel: true, actualSaleSatang: null },
    policySnapshot: null,
  });
  let depMain = "";
  await st("PC-3", "เครื่องยนต์ T0.5 + ฟิกซ์เจอร์ของข้อสอบ (port ที่ข้อสอบฉีดเอง): ราชา 2 ผู้ใหญ่ ⇒ ขาย 7,000 + อุทยาน 1,200 = 8,200 · คอมฯ 1,050 (ฐาน 7,000 ไม่รวมอุทยาน) · หัก 31.50 · ส่งร้าน 7,181.50 · 2 ผู้ใหญ่ + 1 เด็ก ⇒ ฐาน 9,450", async () => {
    needDb(); ok(!accErr, `บัญชี: ${accErr}`);
    depMain = await mkDep(DEP_DATE);
    const off = TR("registerAgencyPricingPort")({ load: async (_c: unknown, qq: unknown) => (R(qq).agentAccountId ? agencyFixture(String(R(qq).agentAccountId)) : null) }) as () => void;
    try {
      const v = V(await callTr("quoteTripLine", agentCtx(acc("X").id), line(depMain)), "quote");
      eq([tot(v).payableSatang, tot(v).passThroughSatang, com(v).baseSatang, com(v).commissionSatang, wht(v).whtSatang, com(v).remitToShopSatang], [AC.collectSatang, AC.parkSatang, AC.commissionBaseSatang, AC.commissionSatang, AC.whtSatang, AC.toShopSatang], "ภาพ 10");
      const v2 = V(await callTr("quoteTripLine", agentCtx(acc("X").id), line(depMain, { children: 1 })), "quote 2A+1C");
      eq([com(v2).baseSatang, com(v2).commissionSatang, wht(v2).whtSatang, tot(v2).passThroughSatang], [2 * ADULT + CHILD, refBp(2 * ADULT + CHILD, 1500), refBp(refBp(2 * ADULT + CHILD, 1500), 300), 2 * RACHA.parkAdultSatang + RACHA.parkChildSatang], "2A+1C");
    } finally { if (typeof off === "function") off(); }
    const none = await callTr("quoteTripLine", agentCtx(acc("X").id), line(depMain));
    if (!existsSync(join(ROOT, F_SVC))) ok(none.ok === false && none.code === "FORBIDDEN", `ไม่มี port ⇒ AGENT ต้อง FORBIDDEN: ${fmt(none)}`);
  });
  let BASEPOL: Rec = {};
  await st("PC-4", "snapshot ค่าตั้ง \"agency.booking\" ของหน่วยทดสอบ: 24 คีย์ · A1.B.tourPct = 15 · X26 = NONE จากแม่แบบ/ค่าสำรอง · A26 JURISTIC×TH_JURISTIC = FLAT 3% · A27 1,000 บาท หักทุกรายการ · A25 ยังไม่ตั้ง", async () => {
    needDb();
    const snap = R(await S("snapshotPolicy")({ tenantId: tA }, "agency.booking", { unitId: uA }, NOW));
    const v = R(snap.values), s = R(snap.sources);
    eq(Object.keys(v).length, 24, "จำนวนคีย์");
    eq([R(R(v["agency.tier.table"]).B).tourPct, v["agency.comm.vatMode"], ["TEMPLATE", "FALLBACK"].includes(String(s["agency.comm.vatMode"])), R(R(R(v["agency.wht.ruleByPayee"]).JURISTIC).TH_JURISTIC).rateBp, R(v["agency.wht.minPerContract"]).amountSatang, R(v["agency.wht.minPerContract"]).continuousContract, v["agency.wht.payerType"], v["agency.money.collector"]],
      [15, "NONE", true, 300, 100_000, "EVERY_PAYMENT", null, "AGENT_COLLECTS"], "ค่าเริ่ม");
    BASEPOL = { values: v, sources: s };
  });
  await st("PC-5", "ผู้กระทำ AGENT ยังถือที่ไม่ได้: trips.holdTrips ⇒ FORBIDDEN (AGENCY_NOT_ENABLED) — ต้องคงเป็นแบบนี้หลังใบนี้", async () => {
    needDb();
    const r = await callTr("holdTrips", agentCtx(ACC.X?.id ?? "x"), { idempotencyKey: `qc-${hex(8)}`, quoteId: "x", quoteExpiresAt: new Date(NOW.getTime() + 600_000).toISOString(), quote: { lines: [line(depMain || "x")] } }, {});
    ok(r.ok === false && r.code === "FORBIDDEN", `ต้อง FORBIDDEN: ${fmt(r)}`);
    eq(R(r.details).reason, "AGENCY_NOT_ENABLED", "reason");
  });
  await st("PC-6", "ตัวกันของฐาน (A1.1) ที่ใบสั่งพึ่ง: COMMISSION_PCT ไม่มี valueBp ⇒ 23514 · valueBp 10001 ⇒ 23514 · COMMISSION_FIXED สกุล USD ⇒ 23514 · card เจ้าของสองชนิด ⇒ 23514 · คีย์ NND ซ้ำ ⇒ 23505 · ระดับรหัส D ⇒ 23514", async () => {
    needDb();
    const card = await ins("AgentRateCard", { id: rid("pccard"), tenantId: tA, ownerKind: "AGENT", tierId: null, agentAccountId: acc("Y").id, name: "pc", status: "DRAFT", version: 1, priority: 0, updatedAt: new Date() });
    const base = `INSERT INTO "AgentRate" (id, "tenantId", "rateCardId", "productKind", "productId", mode, "valueBp", "valueMinor", currency, "updatedAt") VALUES ($1, $2, $3, 'TRIP', $4, $5, $6, $7, $8, now())`;
    const r1 = await pgCode(base, [rid("r"), tA, card, PRD.A.id, "COMMISSION_PCT", null, null, "THB"]);
    const r2 = await pgCode(base, [rid("r"), tA, card, PRD.A.id, "COMMISSION_PCT", 10_001, null, "THB"]);
    const r3 = await pgCode(base, [rid("r"), tA, card, PRD.A.id, "COMMISSION_FIXED", null, 100, "USD"]);
    const r4 = await pgCode(`INSERT INTO "AgentRateCard" (id, "tenantId", "ownerKind", "tierId", "agentAccountId", name, "updatedAt") VALUES ($1, $2, 'AGENT', 'x', $3, 'pc', now())`, [rid("c"), tA, acc("Y").id]);
    const r5a = await pgCode(base, [rid("r"), tA, card, PRD.A.id, "COMMISSION_PCT", 100, null, "THB"]);
    const r5b = await pgCode(base, [rid("r"), tA, card, PRD.A.id, "COMMISSION_PCT", 200, null, "THB"]);
    const r6 = await pgCode(`INSERT INTO "AgentTier" (id, "tenantId", code, name, "updatedAt") VALUES ($1, $2, 'D', 'x', now())`, [rid("t"), tA]);
    await pool.query(`DELETE FROM "AgentRate" WHERE "rateCardId" = $1`, [card]); await pool.query(`DELETE FROM "AgentRateCard" WHERE id = $1`, [card]);
    eq([r1, r2, r3, r4, r5a, r5b, r6], ["23514", "23514", "23514", "23514", "OK", "23505", "23514"], "CHECK/unique");
  });
  await st("PC-7", "positive control ตัวสแกน: แถว AuditLog ของร้าน A ที่ฝังเครื่องหมายร้าน B + คีย์ต้องห้าม ⇒ ตัวสแกนเจอทั้งสอง (แล้วลบ)", async () => {
    needDb();
    const id = rid("pcaudit");
    await ins("AuditLog", { id, tenantId: tA, actorType: "SYSTEM", action: "agency.rate.qc_pc", after: { x: MARK_B, identityId: "zzz" } });
    const rows = await auditRows(tA);
    await pool.query(`DELETE FROM "AuditLog" WHERE id = $1`, [id]);
    ok(leaks(rows.map((r) => r.j).join("\n"), [MARK_B]).length === 1, "ไม่เจอเครื่องหมาย");
    ok(rows.some((r) => [...keysDeep(r.after)].some((k) => NEVER_SHOW.includes(k))), "ไม่เจอคีย์ต้องห้าม");
  });
  groupLine("PC");

  // ═══════════════ K. core บริสุทธิ์ ═══════════════
  console.log("\n── K: rates-core บริสุทธิ์ ──");
  const PID = "prod_1", OPT = "opt_1", OPT_OTHER = "opt_2";
  const PAX = [{ id: "pt_a", code: "ADULT" }, { id: "pt_c", code: "CHILD" }, { id: "pt_i", code: "INFANT" }];
  const pol = (patch: Rec = {}, src: Rec = {}): Rec => { ok(Object.keys(BASEPOL).length > 0, "ไม่มี snapshot ค่าตั้ง (PC-4)"); return { values: { ...clone(R(BASEPOL.values)), ...patch }, sources: { ...clone(R(BASEPOL.sources)), ...src } }; };
  const facts = (o: Rec = {}): Rec => ({
    account: { id: "acc_1", tierId: "tier_B", tierCode: "B", payeeType: "TH_JURISTIC", vatRegistered: false, ...R(o.account) },
    product: { id: PID, productType: "TOUR", optionId: OPT, paxTypes: PAX, ...R(o.product) },
    currency: o.currency ?? "THB", bookYmd: o.bookYmd ?? TODAY, travelYmd: o.travelYmd ?? DEP_DATE, cards: o.cards ?? [], policy: o.policy ?? pol(), vatRateBp: 700,
  });
  const rrow = (id: string, o: Rec = {}): Rec => ({ id, rateCardId: "", productKind: "TRIP", productId: PID, optionId: null, paxTypeId: null, cabinTypeId: null, mode: "COMMISSION_PCT", valueBp: 1200, valueMinor: null, currency: "THB",
    minSellMinor: null, markupCapBp: null, bookFrom: null, bookTo: null, travelFrom: null, travelTo: null, priority: 0, active: true, ...o });
  const net = (id: string, minor: number, o: Rec = {}): Rec => rrow(id, { mode: "NET", valueBp: null, valueMinor: minor, ...o });
  const kcard = (id: string, o: Rec, rates: Rec[]): Rec => ({ id, ownerKind: "TIER", tierId: "tier_B", agentAccountId: null, status: "ACTIVE", validFrom: null, validTo: null, version: 3, priority: 0, ...o, rates: rates.map((r) => ({ ...r, rateCardId: id })) });
  const tierCard = (rates: Rec[], o: Rec = {}) => kcard(String(o.id ?? "card_t"), o, rates);
  const agentCard = (rates: Rec[], o: Rec = {}) => kcard(String(o.id ?? "card_a"), { ownerKind: "AGENT", tierId: null, agentAccountId: "acc_1", ...o }, rates);
  const layer = (l: "TIER" | "CONTRACT", f: Rec): Rec => R(COF("resolveAgentLayer")(l, f));
  const lvl = (l: "TIER" | "CONTRACT", f: Rec): Rec | null => asRec(layer(l, f).level);
  const built = (f: Rec): Rec => { const b = R(COF("buildAgencyPricingInput")(f)); ok(b.ok === true, `buildAgencyPricingInput: ${fmt(b)}`); return b; };
  const terms = (f: Rec): Rec => R(R(built(f).input).terms);
  const norm = (raw: unknown): Rec => R(COF("normalizeAgentRate")(raw));
  const normBad = (raw: unknown, reason: string, what: string) => { const r = norm(raw); ok(r.ok === false, `${what}: ต้องไม่ผ่าน ได้ ${fmt(r)}`); eq(r.reason, reason, what); };

  await st("K-1", "ค่าคงที่: โหมด 4 · สถานะ 3 · ระดับ A/B/C · AGENT_RATE_LIMITS ตรงตารางใบสั่ง §3 ทุกคีย์ทุกค่า · คีย์ DTO/audit ตรงตัว · เหตุผลครบ", () => {
    eq([CO("AGENT_RATE_MODES"), CO("AGENT_RATE_CARD_STATUSES"), CO("AGENT_TIER_CODES"), CO("AGENT_RATE_CARD_ACTIONS")], [["COMMISSION_PCT", "COMMISSION_FIXED", "NET", "MARKUP"], ["DRAFT", "ACTIVE", "ARCHIVED"], ["A", "B", "C"], ["ACTIVATE", "ARCHIVE"]], "ค่าคงที่");
    // ORACLE-EDIT K-1 (มติ Z9): TIER_A_CREDIT_DAYS ย้ายเข้า AGENT_RATE_LIMITS เป็น tierACreditDays = 30 (มติ R3 ของ A1.1)
    eq(CO("AGENT_RATE_LIMITS"), { cardsPerOwner: 20, ratesPerCard: 500, cardNameMax: 80, listMax: 100, tryPaxLines: 20, draftRatesMax: 200, markupCapBpMax: 100_000, priorityMax: 1000, tierACreditDays: 30 }, "AGENT_RATE_LIMITS");
    eq(CO("SHOP_RATE_CARD_KEYS"), ["id", "ownerKind", "tierCode", "agentAccountId", "name", "status", "validFrom", "validTo", "priority", "version", "rateCount", "rates", "createdAt", "updatedAt"], "SHOP_RATE_CARD_KEYS");
    eq(CO("SHOP_RATE_KEYS"), ["id", "productKind", "productId", "optionId", "paxTypeId", "mode", "valueBp", "valueMinor", "currency", "minSellMinor", "markupCapBp", "bookFrom", "bookTo", "travelFrom", "travelTo", "priority", "active", "specialPeriod", "updatedAt"], "SHOP_RATE_KEYS");
    eq(CO("AGENT_RATE_AUDIT_KEYS"), ["cardId", "rateId", "version", "from", "to", "fields", "before", "after", "ownerKind", "tierCode", "agentAccountId", "copiedFrom", "count"], "AGENT_RATE_AUDIT_KEYS");
    const reasons = CO("AGENT_RATE_REASONS") as string[];
    eq(["BAD_INPUT", "BAD_RANGE", "MODE_VALUE_MISMATCH", "PAX_RATE_COMMISSION", "CABIN_RATE_NOT_SUPPORTED", "KIND_NOT_SUPPORTED", "PRODUCT_NOT_FOUND", "CURRENCY_MISMATCH", "MIN_SELL_BELOW_NET", "RATE_OVERLAP", "CARD_OVERLAP", "CARD_ARCHIVED", "LIMIT_REACHED", "TIER_NOT_FOUND", "ACCOUNT_NOT_ACTIVE", "SETTINGS_INVALID", "STATE_CONFLICT",
      "MIXED_MODES", "ACCOUNT_NOT_IN_UNIT"].filter((x) => !reasons.includes(x)), [], "เหตุผลที่ขาด"); // ORACLE-EDIT K-1 (มติ Z5 ก · Z3): เพิ่ม MIXED_MODES · ACCOUNT_NOT_IN_UNIT
    ok(![...(CO("SHOP_RATE_CARD_KEYS") as string[]), ...(CO("SHOP_RATE_KEYS") as string[]), ...(CO("AGENT_RATE_AUDIT_KEYS") as string[])].some((k) => NEVER_SHOW.includes(k)), "มีคีย์ต้องห้ามในรายการคีย์");
  });
  await st("K-2", "rateCardTransition: DRAFT→ACTIVE · DRAFT→ARCHIVED · ACTIVE→ARCHIVED · ACTIVE+ACTIVATE / ARCHIVED+ใด ๆ = null", () => {
    const t = COF("rateCardTransition");
    eq([t("DRAFT", "ACTIVATE"), t("DRAFT", "ARCHIVE"), t("ACTIVE", "ARCHIVE"), t("ACTIVE", "ACTIVATE"), t("ARCHIVED", "ACTIVATE"), t("ARCHIVED", "ARCHIVE"), t("DRAFT", "DELETE")], ["ACTIVE", "ARCHIVED", "ARCHIVED", null, null, null, null], "ผัง");
  });
  const base = { productKind: "TRIP", productId: PID };
  await st("K-3", "normalizeAgentRate แถวถูกต้องทั้ง 4 โหมด: เติมค่าปริยาย (สกุล THB · priority 0 · active · ช่องที่ไม่ใช้ = null) · 0% และ 100% รับได้ · เพดานบวกเพิ่มเท่าขีดรับได้", () => {
    const a = norm({ ...base, mode: "COMMISSION_PCT", valueBp: 1500 });
    ok(a.ok === true, `PCT: ${fmt(a)}`);
    eq(R(a.rate), { productKind: "TRIP", productId: PID, optionId: null, paxTypeId: null, cabinTypeId: null, mode: "COMMISSION_PCT", valueBp: 1500, valueMinor: null, currency: "THB", minSellMinor: null, markupCapBp: null, bookFrom: null, bookTo: null, travelFrom: null, travelTo: null, priority: 0, active: true }, "PCT เติมค่า");
    for (const [what, raw] of [["0%", { ...base, mode: "COMMISSION_PCT", valueBp: 0 }], ["100%", { ...base, mode: "COMMISSION_PCT", valueBp: 10_000 }], ["FIXED", { ...base, mode: "COMMISSION_FIXED", valueMinor: 20_000 }],
      ["NET ต่อประเภทคน + ขั้นต่ำ = เน็ต", { ...base, mode: "NET", valueMinor: 280_000, paxTypeId: "pt_a", minSellMinor: 280_000 }], ["NET ช่วงพิเศษวันเดียว", { ...base, mode: "NET", valueMinor: 1, travelFrom: "2027-01-01", travelTo: "2027-01-01", bookTo: "2026-12-31" }],
      ["MARKUP เพดานเท่าขีด", { ...base, mode: "MARKUP", valueMinor: 300_000, markupCapBp: 100_000 }], ["MARKUP เพดาน 0", { ...base, mode: "MARKUP", valueMinor: 300_000, markupCapBp: 0, optionId: OPT, priority: 1000, active: false }]] as const) ok(norm(raw).ok === true, `${what}: ${fmt(norm(raw))}`);
  });
  await st("K-4", "normalizeAgentRate ปฏิเสธพร้อมเหตุ: ผิดคู่ช่อง · คอมฯ ใส่ประเภทคน · เคบิน · TICKET/HOTEL · ขั้นต่ำต่ำกว่าเน็ต · ช่วงกลับด้าน · FIXED สกุลอื่น · MARKUP เป็น % · ทศนิยม/NaN/สตริง/ติดลบ/เกินขีด/วันที่ไม่มีจริง/ช่องแปลก — ไม่ throw", () => {
    const n = COF("normalizeAgentRate");
    for (const [raw, reason, what] of [
      [{ ...base, mode: "COMMISSION_PCT" }, "MODE_VALUE_MISMATCH", "PCT ไม่มีอัตรา"], [{ ...base, mode: "COMMISSION_PCT", valueBp: 1500, valueMinor: 100 }, "MODE_VALUE_MISMATCH", "PCT มีจำนวนเงิน"],
      [{ ...base, mode: "COMMISSION_PCT", valueBp: 1500, minSellMinor: 100 }, "MODE_VALUE_MISMATCH", "PCT มีขั้นต่ำ"], [{ ...base, mode: "COMMISSION_FIXED", valueBp: 100 }, "MODE_VALUE_MISMATCH", "FIXED ไม่มีจำนวนเงิน"],
      [{ ...base, mode: "NET", valueBp: 100 }, "MODE_VALUE_MISMATCH", "NET เป็น %"], [{ ...base, mode: "NET", valueMinor: 100, markupCapBp: 100 }, "MODE_VALUE_MISMATCH", "NET มีเพดานบวกเพิ่ม"],
      [{ ...base, mode: "MARKUP", valueBp: 2000, markupCapBp: 100 }, "MODE_VALUE_MISMATCH", "MARKUP เป็น %"], [{ ...base, mode: "MARKUP", valueMinor: 100 }, "MODE_VALUE_MISMATCH", "MARKUP ไม่มีเพดาน"],
      [{ ...base, mode: "COMMISSION_PCT", valueBp: 1500, paxTypeId: "pt_a" }, "PAX_RATE_COMMISSION", "PCT ต่อประเภทคน"], [{ ...base, mode: "COMMISSION_FIXED", valueMinor: 100, paxTypeId: "pt_a" }, "PAX_RATE_COMMISSION", "FIXED ต่อประเภทคน"],
      [{ ...base, mode: "NET", valueMinor: 100, cabinTypeId: "cab" }, "CABIN_RATE_NOT_SUPPORTED", "เคบิน"],
      [{ ...base, productKind: "TICKET", mode: "NET", valueMinor: 100 }, "KIND_NOT_SUPPORTED", "TICKET"], [{ ...base, productKind: "HOTEL", mode: "NET", valueMinor: 100 }, "KIND_NOT_SUPPORTED", "HOTEL"],
      [{ ...base, mode: "NET", valueMinor: 280_000, minSellMinor: 279_999 }, "MIN_SELL_BELOW_NET", "ขั้นต่ำ < เน็ต"],
      [{ ...base, mode: "NET", valueMinor: 1, travelFrom: "2027-01-02", travelTo: "2027-01-01" }, "BAD_RANGE", "เดินทางกลับด้าน"], [{ ...base, mode: "NET", valueMinor: 1, bookFrom: "2027-01-02", bookTo: "2027-01-01" }, "BAD_RANGE", "จองกลับด้าน"],
      [{ ...base, mode: "COMMISSION_FIXED", valueMinor: 100, currency: "USD" }, "CURRENCY_MISMATCH", "FIXED USD"],
      [{ ...base, mode: "COMMISSION_PCT", valueBp: 15.5 }, "BAD_INPUT", "ทศนิยม"], [{ ...base, mode: "COMMISSION_PCT", valueBp: Number.NaN }, "BAD_INPUT", "NaN"], [{ ...base, mode: "COMMISSION_PCT", valueBp: "1500" }, "BAD_INPUT", "สตริง"],
      [{ ...base, mode: "COMMISSION_PCT", valueBp: -1 }, "BAD_INPUT", "ติดลบ"], [{ ...base, mode: "COMMISSION_PCT", valueBp: 10_001 }, "BAD_INPUT", "เกิน 100%"], [{ ...base, mode: "NET", valueMinor: 2_147_483_648 }, "BAD_INPUT", "เกิน int4"],
      [{ ...base, mode: "NET", valueMinor: Number.POSITIVE_INFINITY }, "BAD_INPUT", "Infinity"], [{ ...base, mode: "MARKUP", valueMinor: 1, markupCapBp: 100_001 }, "BAD_INPUT", "เพดานเกินขีด"],
      [{ ...base, mode: "NET", valueMinor: 1, travelFrom: "2027-02-30" }, "BAD_INPUT", "วันที่ไม่มีจริง"], [{ ...base, mode: "NET", valueMinor: 1, travelFrom: "2027-2-3" }, "BAD_INPUT", "รูปวันที่"],
      [{ ...base, mode: "NET", valueMinor: 1, priority: 1001 }, "BAD_INPUT", "priority เกิน"], [{ ...base, mode: "NET", valueMinor: 1, currency: "thb" }, "BAD_INPUT", "สกุลตัวเล็ก"],
      [{ ...base, mode: "NET", valueMinor: 1, tenantId: "x" }, "BAD_INPUT", "ช่องแปลก tenantId"], [{ ...base, mode: "NET", valueMinor: 1, rateCardId: "x" }, "BAD_INPUT", "ช่องแปลก rateCardId"],
      [{ ...base, mode: "FREE", valueMinor: 1 }, "BAD_INPUT", "โหมดไม่รู้จัก"], [{ mode: "NET", valueMinor: 1 }, "BAD_INPUT", "ไม่มีสินค้า"],
    ] as const) normBad(raw, reason, what);
    for (const raw of [null, undefined, 1, "x", [], [{}]]) { let r: unknown; try { r = n(raw); } catch (e) { throw new AssertFail(`throw กับ ${fmt(raw)}: ${errMsg(e)}`); } ok(R(r).ok === false, `ขยะ ${fmt(raw)} ต้องไม่ผ่าน`); }
  });
  await st("K-5", "dateRangesOverlap (ปิดสองด้าน · null = ไม่จำกัด): วันเดียวกันซ้อน · ติดกันไม่ซ้อน · ปลายเปิดซ้อน · ห่างกันไม่ซ้อน · สลับข้างได้ผลเดียวกัน", () => {
    const o = COF("dateRangesOverlap");
    const cases: [string | null, string | null, string | null, string | null, boolean][] = [
      ["2027-01-01", "2027-01-05", "2027-01-05", "2027-01-09", true], ["2027-01-01", "2027-01-05", "2027-01-06", "2027-01-09", false], [null, "2027-01-05", "2027-01-05", null, true], [null, "2027-01-05", "2027-01-06", null, false],
      [null, null, "2027-01-06", "2027-01-06", true], [null, null, null, null, true], ["2027-01-01", null, "2026-01-01", "2026-12-31", false], ["2027-01-01", null, "2026-01-01", "2027-01-01", true], ["2026-12-20", "2027-01-05", "2026-12-25", "2026-12-26", true]];
    for (const [a, b, c, d, exp] of cases) { eq(o(a, b, c, d), exp, `${a}..${b} กับ ${c}..${d}`); eq(o(c, d, a, b), exp, `สลับ ${c}..${d} กับ ${a}..${b}`); }
  });
  await st("K-6", "rateRowsConflict: ช่วงพิเศษสองแถวมิติเดียวกัน priority เท่ากัน ช่วงจองและเดินทางซ้อน = ชน · ต่าง priority / ต่างประเภทคน / ต่างตัวเลือก / ต่าง card / แถวปิด / ช่วงเดินทางห่าง / ช่วงจองห่าง / แถวไม่มีขอบวันกับช่วงพิเศษ = ไม่ชน", () => {
    const c = COF("rateRowsConflict");
    const a = { ...rrow("a", { travelFrom: "2026-12-20", travelTo: "2027-01-05" }), rateCardId: "c1" };
    const b = (o: Rec) => ({ ...rrow("b", { travelFrom: "2027-01-05", travelTo: "2027-01-10", ...o }), rateCardId: String(o.rateCardId ?? "c1") });
    eq([c(a, b({})), c(b({}), a), c(a, b({ priority: 1 })), c(a, b({ paxTypeId: "pt_a", mode: "NET", valueBp: null, valueMinor: 1 })), c(a, b({ optionId: OPT })), c(a, b({ rateCardId: "c2" })), c(a, b({ active: false })),
      c(a, b({ travelFrom: "2027-01-06" })), c({ ...a, bookTo: "2026-11-30" }, b({ bookFrom: "2026-12-01" })), c({ ...a, bookTo: "2026-12-01" }, b({ bookFrom: "2026-12-01" })), c(a, b({ travelFrom: null, travelTo: null })), c(a, b({ productId: "other" }))],
      [true, true, false, false, false, false, false, false, false, true, false, false], "ชน");
  });
  await st("K-7", "ค่าเริ่มของระดับจาก A1 เมื่อไม่มี card: B ทัวร์ 15% · Liveaboard ใช้ laPct · สถานที่ใช้ tourPct · refId \"tier:<tierId>:A1\" · trace TIER_DEFAULT · ไม่มีระดับ ⇒ tier null + applied NONE + เตือน NO_AGENT_RATE", () => {
    const p = pol({ "agency.tier.table": { ...R(R(BASEPOL.values)["agency.tier.table"]), A: { ...R(R(R(BASEPOL.values)["agency.tier.table"]).A), tourPct: 20, laPct: 18 } } });
    eq(lvl("TIER", facts()), { refId: "tier:tier_B:A1", mode: "COMMISSION_PCT", rateBp: 1500, fixedSatang: null, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null }, "B ทัวร์");
    eq([lvl("TIER", facts({ account: { tierId: "tier_A", tierCode: "A" }, product: { productType: "LIVEABOARD" }, policy: p }))?.rateBp, lvl("TIER", facts({ account: { tierId: "tier_A", tierCode: "A" }, product: { productType: "ATTRACTION" }, policy: p }))?.rateBp, R(layer("TIER", facts()).trace).source], [1800, 2000, "TIER_DEFAULT"], "ชนิดสินค้า");
    const b = built(facts({ account: { tierId: null, tierCode: null } }));
    eq([R(b.input).tier, R(b.input).contract, R(b.trace).applied, (b.warnings as string[]).includes("NO_AGENT_RATE"), R(b.input).agentTierId], [null, null, "NONE", true, null], "ไม่มีระดับ");
    eq([R(built(facts()).trace).applied, R(built(facts()).input).agentTierId, R(built(facts()).input).agentAccountId, lvl("CONTRACT", facts())], ["TIER", "tier_B", "acc_1", null], "มีระดับ");
  });
  await st("K-8", "card ของระดับชนะค่าเริ่ม · refId = \"<rateId>@<card.version>\" · card DRAFT/ARCHIVED ไม่ใช้ · แถวปิดไม่ใช้ · ช่วงมีผลของ card ตัดสินด้วยวันจอง (วันแรก/วันสุดท้ายใช้ · ก่อน/หลังหนึ่งวันไม่ใช้)", () => {
    const c = (o: Rec = {}, r: Rec = {}) => facts({ cards: [tierCard([rrow("r1", r)], o)], ...(o.bookYmd ? { bookYmd: o.bookYmd } : {}) });
    eq(lvl("TIER", c()), { refId: "r1@3", mode: "COMMISSION_PCT", rateBp: 1200, fixedSatang: null, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null }, "card");
    eq([R(layer("TIER", c()).trace).source, R(layer("TIER", c()).trace).cardId, R(layer("TIER", c()).trace).cardVersion, R(layer("TIER", c()).trace).rateId, R(layer("TIER", c()).trace).specialPeriod], ["TIER_CARD", "card_t", 3, "r1", false], "trace");
    eq([lvl("TIER", c({ status: "DRAFT" }))?.rateBp, lvl("TIER", c({ status: "ARCHIVED" }))?.rateBp, lvl("TIER", c({}, { active: false }))?.rateBp], [1500, 1500, 1500], "ไม่ใช้");
    const v = { validFrom: "2026-11-12", validTo: "2026-11-20" };
    eq(["2026-11-11", "2026-11-12", "2026-11-20", "2026-11-21"].map((d) => lvl("TIER", facts({ cards: [tierCard([rrow("r1")], v)], bookYmd: d }))?.rateBp), [1500, 1200, 1200, 1500], "ช่วงมีผลของ card");
    eq(lvl("TIER", facts({ cards: [tierCard([rrow("r1")], { validFrom: "2026-11-13" })], travelYmd: "2026-11-13", bookYmd: "2026-11-12" }))?.rateBp, 1500, "ตัดสินด้วยวันจอง ไม่ใช่วันเดินทาง");
  });
  await st("K-9", "สัญญาแทนระดับทั้งชุด: มีแถวสัญญา ⇒ contract ไม่ null + applied CONTRACT (ระดับยังคืนใน tier) · สัญญาไม่มีแถวของสินค้านี้ ⇒ contract null ใช้ระดับ · ช่วงพิเศษใน card ระดับที่ถูกสัญญาบัง ⇒ เตือน TIER_SPECIAL_PERIOD_SHADOWED", () => {
    const t = tierCard([rrow("rt", { valueBp: 1200 })]), a = agentCard([rrow("ra", { valueBp: 1800 })]);
    const b = built(facts({ cards: [t, a] }));
    eq([R(R(b.input).contract).rateBp, R(R(b.input).contract).refId, R(R(b.input).tier).rateBp, R(b.trace).applied, R(R(b.trace).contract).source], [1800, "ra@3", 1200, "CONTRACT", "AGENT_CARD"], "สัญญาชนะ");
    const b2 = built(facts({ cards: [t, agentCard([rrow("ra", { productId: "other" })])] }));
    eq([R(b2.input).contract, R(b2.trace).applied, R(R(b2.input).tier).rateBp], [null, "TIER", 1200], "สัญญาไม่มีแถว");
    const sp = tierCard([rrow("rt"), rrow("rs", { valueBp: 1000, travelFrom: "2027-03-01", travelTo: "2027-03-31" })]);
    const b3 = built(facts({ cards: [sp, a] }));
    eq([R(R(b3.input).contract).rateBp, R(R(b3.input).tier).rateBp, (b3.warnings as string[]).includes("TIER_SPECIAL_PERIOD_SHADOWED"), (built(facts({ cards: [t, a] })).warnings as string[]).includes("TIER_SPECIAL_PERIOD_SHADOWED")], [1800, 1000, true, false], "ช่วงพิเศษถูกบัง");
  });
  await st("K-10", "ช่วงพิเศษ: ขอบวันเดินทางปิดสองด้าน · ช่วงติดกันเลือกถูกทั้งสองฝั่งของรอยต่อ · ปลายเปิด · ช่วงวันจอง · ช่วงพิเศษชนะแถวไม่มีขอบวันที่ priority เท่ากัน · priority สูงกว่าชนะช่วงพิเศษ · ช่วงซ้อนต่าง priority ตัวสูงชนะ", () => {
    const rows = [rrow("r0", { valueBp: 1500 }), rrow("r1", { valueBp: 1000, travelFrom: "2026-12-20", travelTo: "2027-01-05" }), rrow("r2", { valueBp: 800, travelFrom: "2027-01-06", travelTo: "2027-01-10" }), rrow("r3", { valueBp: 500, travelFrom: "2027-06-01" })];
    const at = (d: string, extra: Rec[] = [], bookYmd = TODAY) => lvl("TIER", facts({ cards: [tierCard([...rows, ...extra])], travelYmd: d, bookYmd }))?.rateBp;
    eq(["2026-12-19", "2026-12-20", "2027-01-05", "2027-01-06", "2027-01-10", "2027-01-11", "2027-05-31", "2027-06-01", "2029-01-01"].map((d) => at(d)), [1500, 1000, 1000, 800, 800, 1500, 1500, 500, 500], "ขอบ/ติดกัน/ปลายเปิด");
    eq(R(layer("TIER", facts({ cards: [tierCard(rows)], travelYmd: "2026-12-25" })).trace).specialPeriod, true, "trace.specialPeriod");
    eq([at("2026-12-25", [rrow("r9", { valueBp: 2500, priority: 1 })]), at("2026-12-25", [rrow("r8", { valueBp: 300, priority: 2, travelFrom: "2026-12-24", travelTo: "2026-12-26" })]), at("2026-12-27", [rrow("r8", { valueBp: 300, priority: 2, travelFrom: "2026-12-24", travelTo: "2026-12-26" })])], [2500, 300, 1000], "priority");
    const bk = [rrow("b1", { valueBp: 700, bookFrom: "2026-11-01", bookTo: "2026-11-12" })];
    eq([at("2027-03-10", bk, "2026-11-12"), at("2027-03-10", bk, "2026-11-13"), at("2027-03-10", bk, "2026-10-31")], [700, 1500, 1500], "ช่วงวันจอง");
    eq(at("2027-01-06", [rrow("r5", { valueBp: 900, travelFrom: "2027-01-01", travelTo: "2027-01-31" })]), 800, "ซ้อน priority เท่า: travelFrom หลังสุดชนะ");
  });
  await st("K-11", "ราคาเน็ต/บวกเพิ่ม: แถวต่อประเภทคนชนะแถวไม่ระบุ · ประเภทที่ไม่มีแถวใช้แถวไม่ระบุ · ไม่มีเลย = ไม่อยู่ใน map · ขั้นต่ำจากแถว ไม่มีใช้ A7 (เฉพาะบาท) · MARKUP ส่งเพดาน · rateBp/fixedSatang = null", () => {
    const l = lvl("CONTRACT", facts({ cards: [agentCard([net("n0", 250_000), net("na", 280_000, { paxTypeId: "pt_a", minSellMinor: 330_000 })])] }));
    eq(l, { refId: l?.refId, mode: "NET", rateBp: null, fixedSatang: null, unitMinorByPaxCode: { ADULT: 280_000, CHILD: 250_000, INFANT: 250_000 }, minSellMinor: l?.minSellMinor, markupCapBp: null }, "NET map");
    const only = lvl("CONTRACT", facts({ cards: [agentCard([net("na", 280_000, { paxTypeId: "pt_a", minSellMinor: 330_000 })])] }));
    // ORACLE-EDIT K-11 (มติ Z5 ง): ขั้นต่ำของแถวรายประเภทคนไม่ใช้ (Level ของ T0.5 มีขั้นต่ำค่าเดียวทุกที่นั่ง) — ใช้เฉพาะของแถวไม่ระบุประเภท แล้วถอยไป A7
    eq([only?.unitMinorByPaxCode, only?.minSellMinor, only?.refId], [{ ADULT: 280_000 }, null, "na@3"], "เฉพาะผู้ใหญ่ (ขั้นต่ำรายประเภทไม่ใช้ · A7 ไม่ตั้ง)");
    eq(lvl("CONTRACT", facts({ cards: [agentCard([net("na", 280_000, { paxTypeId: "pt_a", minSellMinor: 330_000 })])], policy: pol({ "agency.price.minResalePrice": 300_000 }) }))?.minSellMinor, 300_000, "เฉพาะผู้ใหญ่ + A7 ⇒ A7 (ไม่ใช่ 330,000 ของแถวรายประเภท)");
    eq([l?.minSellMinor, lvl("CONTRACT", facts({ cards: [agentCard([net("n0", 250_000, { minSellMinor: 260_000 }), net("na", 280_000, { paxTypeId: "pt_a", minSellMinor: 330_000 })])] }))?.minSellMinor], [null, 260_000], "ขั้นต่ำจากแถวไม่ระบุประเภทเท่านั้น");
    const a7 = facts({ cards: [agentCard([net("n0", 250_000)])], policy: pol({ "agency.price.minResalePrice": 300_000 }) });
    eq([lvl("CONTRACT", a7)?.minSellMinor, lvl("CONTRACT", facts({ cards: [agentCard([net("n0", 250_000)])] }))?.minSellMinor, lvl("CONTRACT", facts({ cards: [agentCard([net("n0", 250_000, { minSellMinor: 260_000 })])], policy: pol({ "agency.price.minResalePrice": 300_000 }) }))?.minSellMinor], [300_000, null, 260_000], "A7");
    eq(lvl("CONTRACT", facts({ currency: "USD", cards: [agentCard([net("n0", 9_000, { currency: "USD" })])], policy: pol({ "agency.price.minResalePrice": 300_000 }) }))?.minSellMinor, null, "A7 ไม่ใช้กับสกุลอื่น");
    const m = lvl("CONTRACT", facts({ cards: [agentCard([rrow("m0", { mode: "MARKUP", valueBp: null, valueMinor: 300_000, markupCapBp: 2000 })])] }));
    eq([m?.mode, m?.markupCapBp, m?.unitMinorByPaxCode, m?.rateBp, m?.fixedSatang], ["MARKUP", 2000, { ADULT: 300_000, CHILD: 300_000, INFANT: 300_000 }, null, null], "MARKUP");
    const fx = lvl("CONTRACT", facts({ cards: [agentCard([rrow("f0", { mode: "COMMISSION_FIXED", valueBp: null, valueMinor: 20_000 })])] }));
    eq(fx, { refId: "f0@3", mode: "COMMISSION_FIXED", rateBp: null, fixedSatang: 20_000, unitMinorByPaxCode: null, minSellMinor: null, markupCapBp: null }, "FIXED");
    const mixed = layer("CONTRACT", facts({ cards: [agentCard([rrow("p1", { priority: 1 }), net("na", 280_000, { paxTypeId: "pt_a" })])] }));
    eq([R(mixed.level).mode, R(mixed.level).unitMinorByPaxCode, (mixed.warnings as string[]).includes("MIXED_MODES_IGNORED")], ["COMMISSION_PCT", null, true], "โหมดปน");
  });
  await st("K-12", "ไม่ใช้ของคนอื่น/ผิดมิติ แม้ถูกส่งเข้ามา: card เอเจนซี่อื่น · card ระดับอื่น · สินค้าอื่น · ตัวเลือกอื่น · เคบิน · สกุลอื่น · productKind อื่น — ตัวเลือกเจาะจงชนะไม่ระบุ", () => {
    const bad = [agentCard([rrow("x1", { valueBp: 9999 })], { id: "c_other_agent", agentAccountId: "acc_2" }), tierCard([rrow("x2", { valueBp: 9998 })], { id: "c_other_tier", tierId: "tier_A" }),
      tierCard([rrow("x3", { valueBp: 9997, productId: "other" }), rrow("x4", { valueBp: 9996, optionId: OPT_OTHER }), rrow("x5", { valueBp: 9995, cabinTypeId: "cab" }), rrow("x6", { valueBp: 9994, currency: "USD" }), rrow("x7", { valueBp: 9993, productKind: "TICKET" })], { id: "c_dims" }),
      kcard("c_agent_as_tier", { ownerKind: "AGENT", tierId: "tier_B", agentAccountId: "acc_2" }, [rrow("x8", { valueBp: 9992 })])];
    const b = built(facts({ cards: bad }));
    eq([R(R(b.input).tier).rateBp, R(b.input).contract, R(R(b.trace).tier).source], [1500, null, "TIER_DEFAULT"], "ไม่ใช้");
    eq(lvl("TIER", facts({ cards: [tierCard([rrow("g", { valueBp: 1200 }), rrow("o", { valueBp: 1300, optionId: OPT })])] }))?.rateBp, 1300, "ตัวเลือกเจาะจงชนะ");
    eq(lvl("TIER", facts({ cards: [tierCard([rrow("g", { valueBp: 1200 }), rrow("o", { valueBp: 1300, optionId: OPT })])], product: { optionId: OPT_OTHER } }))?.rateBp, 1200, "รอบของตัวเลือกอื่นใช้แถวไม่ระบุ");
    eq(lvl("TIER", facts({ cards: [tierCard([rrow("lo", { valueBp: 1100 })], { id: "c_lo", priority: 0 }), tierCard([rrow("hi", { valueBp: 1700 })], { id: "c_hi", priority: 5 })] }))?.rateBp, 1700, "card priority สูงชนะ");
  });
  await st("K-13", "VAT ของคอมฯ (X26 · OQ14): ไม่จด VAT ⇒ NONE เสมอ (แม้ร้านตั้ง EXCLUSIVE/INCLUSIVE + เตือน) · จด VAT + ร้านไม่ได้ตั้ง (TEMPLATE/FALLBACK) ⇒ EXCLUSIVE · จด VAT + ร้านตั้งเอง ⇒ ค่าที่ตั้ง (รวม NONE)", () => {
    const d = COF("decideCommissionVatMode");
    const tbl: [unknown, string, boolean, string, string][] = [["NONE", "TEMPLATE", false, "NONE", "NOT_REGISTERED"], ["EXCLUSIVE", "UNIT", false, "NONE", "NOT_REGISTERED"], ["INCLUSIVE", "AGENT", false, "NONE", "NOT_REGISTERED"],
      ["NONE", "TEMPLATE", true, "EXCLUSIVE", "DEFAULT_REGISTERED"], ["NONE", "FALLBACK", true, "EXCLUSIVE", "DEFAULT_REGISTERED"], ["NONE", "UNIT", true, "NONE", "SETTING"], ["INCLUSIVE", "AGENT_TIER", true, "INCLUSIVE", "SETTING"], ["EXCLUSIVE", "AGENT", true, "EXCLUSIVE", "SETTING"]];
    for (const [value, source, reg, mode, by] of tbl) eq(d({ value, source, vatRegistered: reg }), { mode, decidedBy: by }, `${String(value)}/${source}/${reg}`);
    const f = (reg: boolean, value: string, source: string) => built(facts({ account: { vatRegistered: reg }, policy: pol({ "agency.comm.vatMode": value }, { "agency.comm.vatMode": source }) }));
    eq([R(R(f(true, "NONE", "TEMPLATE").input).terms).vatMode, R(f(true, "NONE", "TEMPLATE").trace).vat, R(R(f(false, "EXCLUSIVE", "UNIT").input).terms).vatMode, (f(false, "EXCLUSIVE", "UNIT").warnings as string[]).includes("VAT_MODE_IGNORED_NOT_REGISTERED"),
      (f(false, "NONE", "TEMPLATE").warnings as string[]).includes("VAT_MODE_IGNORED_NOT_REGISTERED"), R(R(f(true, "INCLUSIVE", "AGENT").input).terms).vatMode, R(f(true, "NONE", "TEMPLATE").input).vatRegistered, R(R(f(true, "NONE", "TEMPLATE").input).terms).vatRateBp],
      ["EXCLUSIVE", { mode: "EXCLUSIVE", decidedBy: "DEFAULT_REGISTERED" }, "NONE", true, false, "INCLUSIVE", true, 700], "ใน input");
  });
  await st("K-14", "หัก ณ ที่จ่าย (ผู้จ่าย × ผู้รับ · A25–A30): นิติฯ→นิติฯไทย RATE 3% ขั้นต่ำ 1,000 · →มูลนิธิ 10% ขั้นต่ำ 0 · →บุคคลไทย PROGRESSIVE_50_1 ไม่มีอัตรา · →ต่างประเทศ NONE_FOREIGN · ร้านบุคคล→นิติฯ NONE · A25 ไม่ตั้ง ⇒ JURISTIC + เตือน · e-WHT 1% ถึงวันสิ้นมาตรการ", () => {
    const w = (payee: string, patch: Rec = {}, o: Rec = {}) => R(terms(facts({ account: { payeeType: payee }, policy: pol(patch), ...o })).wht);
    eq(w("TH_JURISTIC"), { applies: true, mode: "RATE", rateBp: 300, eWht: false, grossUp: true, minPerContractSatang: 100_000, continuous: "EVERY_PAYMENT", remitter: "SHOP", payerType: "JURISTIC", payeeType: "TH_JURISTIC" }, "นิติฯ→นิติฯ");
    eq([w("TH_FOUNDATION").rateBp, w("TH_FOUNDATION").minPerContractSatang, w("TH_FOUNDATION").mode], [1000, 0, "RATE"], "มูลนิธิ");
    eq([w("TH_PERSON").applies, w("TH_PERSON").mode, w("TH_PERSON").rateBp, w("TH_PERSON").minPerContractSatang], [true, "PROGRESSIVE_50_1", null, 0], "บุคคลไทย");
    eq([w("FOREIGN").applies, w("FOREIGN").mode, w("FOREIGN").rateBp], [false, "NONE_FOREIGN", null], "ต่างประเทศ");
    const ind = w("TH_JURISTIC", { "agency.wht.payerType": "INDIVIDUAL" });
    eq([ind.applies, ind.mode, ind.rateBp, ind.payerType], [false, "NONE", null, "INDIVIDUAL"], "ร้านบุคคล");
    const wa = (patch: Rec) => (built(facts({ policy: pol(patch) })).warnings as string[]).includes("WHT_PAYER_ASSUMED_JURISTIC");
    eq([wa({}), wa({ "agency.wht.payerType": "JURISTIC" }), wa({ "agency.wht.payerType": "INDIVIDUAL" })], [true, false, false], "คำเตือนผู้จ่าย");
    const e = { "agency.wht.eWht": { enabled: true, rateBp: 100, untilPaidOn: "2027-12-31" } };
    eq([[w("TH_JURISTIC", e).rateBp, w("TH_JURISTIC", e).eWht], [w("TH_JURISTIC", e, { bookYmd: "2027-12-31" }).rateBp, w("TH_JURISTIC", e, { bookYmd: "2027-12-31" }).eWht], [w("TH_JURISTIC", e, { bookYmd: "2028-01-01" }).rateBp, w("TH_JURISTIC", e, { bookYmd: "2028-01-01" }).eWht],
      [w("TH_PERSON", e).rateBp, w("TH_PERSON", e).eWht], [w("FOREIGN", e).eWht, w("FOREIGN", e).applies], [w("TH_JURISTIC", { "agency.wht.eWht": { enabled: true, rateBp: 100, untilPaidOn: null } }, { bookYmd: "2031-01-01" }).rateBp]],
      [[100, true], [100, true], [300, false], [null, false], [false, false], [100]], "e-WHT");
    eq([w("TH_JURISTIC", { "agency.wht.grossUpOnNetRemit": false, "agency.wht.remitter": "AGENT_ON_BEHALF" }).grossUp, w("TH_JURISTIC", { "agency.wht.grossUpOnNetRemit": false, "agency.wht.remitter": "AGENT_ON_BEHALF" }).remitter,
      w("TH_JURISTIC", { "agency.wht.minPerContract": { amountSatang: 250_000, appliesTo: { TH_JURISTIC: true, TH_FOUNDATION: true }, continuousContract: "PER_CONTRACT_TOTAL" } }).minPerContractSatang,
      w("TH_JURISTIC", { "agency.wht.minPerContract": { amountSatang: 250_000, appliesTo: { TH_JURISTIC: true, TH_FOUNDATION: true }, continuousContract: "PER_CONTRACT_TOTAL" } }).continuous], [false, "AGENT_ON_BEHALF", 250_000, "PER_CONTRACT_TOTAL"], "A27 A29 A30");
  });
  await st("K-15", "terms ส่วนที่เหลือส่งตรงจากค่าตั้ง (A10 A5 A21 A23 A24) · actualSaleSatang = null · ผลทุกแบบ + policySnapshot:null ผ่าน agencyPricingInputSchema ของ trips", () => {
    const t = terms(facts({ policy: pol({ "agency.money.collector": "SHOP_COLLECTS", "agency.comm.earnedAt": "ON_CONFIRM", "agency.comm.clawbackOnCancel": false, "agency.comm.discountFromCommission": { enabled: true, capPct: 7 } }) }));
    eq([t.collector, t.sellerOfRecord, t.earnedAt, t.clawbackOnCancel, t.discountFromCommission, t.actualSaleSatang], ["SHOP_COLLECTS", "SHOP_PRINCIPAL", "ON_CONFIRM", false, { enabled: true, capPct: 7 }, null], "ส่งตรง");
    const schema = need(TRM, "trips").agencyPricingInputSchema as { safeParse(v: unknown): { success: boolean; error?: unknown } };
    const variants = [facts(), facts({ account: { tierId: null, tierCode: null } }), facts({ account: { payeeType: "TH_PERSON", vatRegistered: true } }), facts({ account: { payeeType: "FOREIGN" } }),
      facts({ cards: [agentCard([net("n0", 250_000), net("na", 280_000, { paxTypeId: "pt_a", minSellMinor: 330_000 })])] }), facts({ cards: [agentCard([rrow("m0", { mode: "MARKUP", valueBp: null, valueMinor: 300_000, markupCapBp: 2000 })]), tierCard([rrow("f0", { mode: "COMMISSION_FIXED", valueBp: null, valueMinor: 20_000 })])] })];
    for (const [i, f] of variants.entries()) { const p = schema.safeParse({ ...R(built(f).input), policySnapshot: null }); ok(p.success, `แบบที่ ${i}: ไม่ผ่าน schema ของ trips ${fmt(p.error)}`); }
    eq(sortedKeys(built(facts()).input), ["agentAccountId", "agentTierId", "contract", "terms", "tier", "vatRegistered"], "คีย์ของ input");
  });
  await st("K-16", "ค่าตั้งขาด/ผิดรูป ⇒ { ok:false, reason:\"SETTINGS_INVALID\" } (ไม่เดา ไม่ throw): ไม่มี A26 · A1 เป็นสตริง · X26 ค่าแปลก · ผู้รับไม่มีในตาราง · อัตรา VAT ไม่ใช่จำนวนเต็ม", () => {
    const b = COF("buildAgencyPricingInput");
    const del = (k: string) => { const p = pol(); delete R(p.values)[k]; return p; };
    const cases: [string, Rec][] = [["ไม่มี A26", facts({ policy: del("agency.wht.ruleByPayee") })], ["A1 tourPct สตริง", facts({ policy: pol({ "agency.tier.table": { A: {}, B: { tourPct: "15", laPct: 15 }, C: {} } }) })],
      ["X26 แปลก", facts({ account: { vatRegistered: true }, policy: pol({ "agency.comm.vatMode": "MAYBE" }, { "agency.comm.vatMode": "UNIT" }) })], ["ผู้รับแปลก", facts({ account: { payeeType: "ALIEN" } })], ["VAT ทศนิยม", { ...facts(), vatRateBp: 7.5 }], ["ไม่มี A10", facts({ policy: del("agency.money.collector") })]];
    for (const [what, f] of cases) { let r: unknown; try { r = b(f); } catch (e) { throw new AssertFail(`${what}: throw ${errMsg(e)}`); } eq([R(r).ok, R(r).reason], [false, "SETTINGS_INVALID"], what); }
  });
  await st("K-17", "บริสุทธิ์: อินพุตแช่แข็งทั้งก้อนไม่ถูกแก้/ไม่ throw · เรียกซ้ำได้ผลเท่ากันทุกไบต์", () => {
    const f = deepFreeze(facts({ cards: [tierCard([rrow("rt"), rrow("rs", { valueBp: 1000, travelFrom: "2027-03-01", travelTo: "2027-03-31" })]), agentCard([net("n0", 250_000), net("na", 280_000, { paxTypeId: "pt_a" })])] }));
    const a = COF("buildAgencyPricingInput")(f), b = COF("buildAgencyPricingInput")(f);
    eq(JSON.stringify(a), JSON.stringify(b), "ซ้ำ");
    ok(R(a).ok === true, fmt(a));
  });
  // ═══ ข้อสอบที่มติ Z1–Z9 สั่งเพิ่ม (ผู้เขียนข้อสอบแยก · r1) — ค่าคาดหวังคิดจากฟิกซ์เจอร์/มติ ไม่เรียกโค้ดที่ตรวจเป็นคำตอบ ═══
  await st("K-18", "มติ Z5 (ข)(ค) ราคาต่อประเภทคน + แถวแรก: แถวช่วงพิเศษไม่ระบุประเภท priority สูงกว่าชนะแถวปกติรายประเภท · priority เท่ากัน ช่วงพิเศษไม่ระบุชนะแถวปกติรายประเภท · ช่วงพิเศษทั้งคู่ รายประเภทชนะ · priority ของรายประเภทสูงกว่าชนะ · เสมอกันทุกชั้น ⇒ แถวไม่ระบุประเภทเป็น \"แถวแรก\" (เพดาน/refId) ไม่ว่า id", () => {
    const sp = { travelFrom: "2027-03-01", travelTo: "2027-03-31" };
    const m = (rates: Rec[], travelYmd = DEP_DATE) => lvl("CONTRACT", facts({ cards: [agentCard(rates)], travelYmd }))?.unitMinorByPaxCode;
    eq(m([net("na", 280_000, { paxTypeId: "pt_a" }), net("sg", 200_000, { priority: 1, ...sp })]), { ADULT: 200_000, CHILD: 200_000, INFANT: 200_000 }, "ช่วงพิเศษไม่ระบุ priority 1 ชนะรายประเภท priority 0");
    eq(m([net("na", 280_000, { paxTypeId: "pt_a" }), net("sg", 200_000, sp)]), { ADULT: 200_000, CHILD: 200_000, INFANT: 200_000 }, "priority เท่า: ช่วงพิเศษไม่ระบุชนะแถวปกติรายประเภท");
    eq(m([net("na", 280_000, { paxTypeId: "pt_a", ...sp }), net("sg", 200_000, { travelFrom: "2027-03-05", travelTo: "2027-03-20" })]), { ADULT: 280_000, CHILD: 200_000, INFANT: 200_000 }, "ช่วงพิเศษทั้งคู่: รายประเภทชนะ");
    eq(m([net("na", 280_000, { paxTypeId: "pt_a", priority: 1 }), net("sg", 200_000, sp)]), { ADULT: 280_000, CHILD: 200_000, INFANT: 200_000 }, "priority ของรายประเภทสูงกว่าชนะ");
    eq(m([net("na", 280_000, { paxTypeId: "pt_a" }), net("sg", 200_000, { priority: 1, ...sp })], "2027-04-10"), { ADULT: 280_000 }, "นอกช่วงพิเศษ: เหลือรายประเภท");
    const mk = (rid1: string, rid2: string) => [rrow(rid1, { mode: "MARKUP", valueBp: null, valueMinor: 300_000, markupCapBp: 5_000, paxTypeId: "pt_a" }), rrow(rid2, { mode: "MARKUP", valueBp: null, valueMinor: 310_000, markupCapBp: 2_000, minSellMinor: 320_000 })];
    for (const [ip, ig] of [["a_pax", "z_gen"], ["draft-000", "draft-001"], ["z_pax", "a_gen"]] as const) {
      const l = lvl("CONTRACT", facts({ cards: [agentCard(mk(ip, ig))] }));
      eq([l?.refId, l?.markupCapBp, l?.minSellMinor, l?.unitMinorByPaxCode], [`${ig}@3`, 2_000, 320_000, { ADULT: 300_000, CHILD: 310_000, INFANT: 310_000 }], `เสมอกัน id ${ip}/${ig}: แถวไม่ระบุประเภทเป็นแถวแรก`);
    }
  });
  await st("K-19", "มติ Z6 ⚖️ e-WHT: มูลนิธิ + เปิด e-WHT ⇒ อัตรายัง 10% (eWht false) · นิติบุคคลไทย ⇒ อัตราจากค่าตั้ง A28 จนถึงวันสิ้นมาตรการของค่าตั้ง (เปลี่ยนค่าตั้งแล้วผลเปลี่ยนตาม — ไม่ฝังโค้ด) · ปิด e-WHT ⇒ 3%", () => {
    const w = (payee: string, e: Rec, bookYmd = TODAY) => { const x = R(terms(facts({ account: { payeeType: payee }, policy: pol({ "agency.wht.eWht": e }), bookYmd })).wht); return [x.mode, x.rateBp, x.eWht]; };
    const on = { enabled: true, rateBp: 100, untilPaidOn: "2027-12-31" };
    eq(w("TH_FOUNDATION", on), ["RATE", 1_000, false], "มูลนิธิ + e-WHT");
    eq([w("TH_JURISTIC", on), w("TH_JURISTIC", on, "2027-12-31"), w("TH_JURISTIC", on, "2028-01-01")], [["RATE", 100, true], ["RATE", 100, true], ["RATE", 300, false]], "นิติบุคคลไทย ถึงวันสิ้นมาตรการ");
    const alt = { enabled: true, rateBp: 150, untilPaidOn: "2026-12-31" };
    eq([w("TH_JURISTIC", alt), w("TH_JURISTIC", alt, "2027-01-01"), w("TH_FOUNDATION", alt)], [["RATE", 150, true], ["RATE", 300, false], ["RATE", 1_000, false]], "อัตรา/วันสิ้นมาตรการมาจากค่าตั้ง");
    eq(w("TH_JURISTIC", { ...on, enabled: false }), ["RATE", 300, false], "ปิด e-WHT");
  });
  await st("K-20", "มติ Z9 + Z8 (บริสุทธิ์): ไม่จด VAT + X26 จากแม่แบบ/ค่าสำรอง (แม้เป็น EXCLUSIVE/INCLUSIVE) ⇒ ไม่เตือน · ร้านตั้งเอง ⇒ เตือน · วันที่ปี 0000/1899/2201 ⇒ BAD_INPUT · ปี 1900/2200 ⇒ รับ", () => {
    const warn = (value: string, source: string) => (built(facts({ account: { vatRegistered: false }, policy: pol({ "agency.comm.vatMode": value }, { "agency.comm.vatMode": source }) })).warnings as string[]).includes("VAT_MODE_IGNORED_NOT_REGISTERED");
    eq([warn("EXCLUSIVE", "TEMPLATE"), warn("INCLUSIVE", "FALLBACK"), warn("EXCLUSIVE", "UNIT"), warn("INCLUSIVE", "AGENT"), warn("NONE", "UNIT")], [false, false, true, true, false], "คำเตือน VAT");
    for (const d of ["0000-01-01", "1899-12-31", "2201-01-01"]) for (const k of ["travelFrom", "bookTo"]) normBad({ ...base, mode: "NET", valueMinor: 1, [k]: d }, "BAD_INPUT", `${k} ${d}`);
    for (const d of ["1900-01-01", "2200-12-31"]) ok(norm({ ...base, mode: "NET", valueMinor: 1, travelFrom: d, travelTo: d }).ok === true, `ปี ${d} ต้องรับ`);
  });
  groupLine("K");

  // ═══════════════ KF. สุ่มมีเมล็ดเทียบตัวอ้างอิง ═══════════════
  console.log("\n── KF: ตัวเลือกชั้นเอเจนซี่ — สุ่มมีเมล็ด ──");
  const genFacts = (rnd: () => number, i: number): Rec => {
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
    const day = () => (rnd() < 0.35 ? null : addDaysYmd("2027-03-01", Math.floor(rnd() * 20)));
    const range = (): [string | null, string | null] => { const a = day(), b = day(); return a !== null && b !== null && b < a ? [b, a] : [a, b]; };
    const bday = () => (rnd() < 0.6 ? null : addDaysYmd("2026-11-05", Math.floor(rnd() * 14)));
    const brange = (): [string | null, string | null] => { const a = bday(), b = bday(); return a !== null && b !== null && b < a ? [b, a] : [a, b]; };
    let n = 0;
    const mkRate = (): Rec => {
      const mode = pick(["COMMISSION_PCT", "COMMISSION_PCT", "COMMISSION_FIXED", "NET", "NET", "MARKUP"] as const);
      const [tf, tt] = range(), [bf, bt] = brange();
      const pax = mode === "NET" || mode === "MARKUP" ? pick([null, null, "pt_a", "pt_c", "pt_i", "pt_zz"]) : null;
      const valueMinor = mode === "COMMISSION_PCT" ? null : 1_000 + Math.floor(rnd() * 400_000);
      return rrow(`r${String(i).padStart(3, "0")}_${String(n++).padStart(2, "0")}_${Math.floor(rnd() * 1e6)}`, { mode, valueBp: mode === "COMMISSION_PCT" ? Math.floor(rnd() * 10_001) : null, valueMinor, paxTypeId: pax,
        minSellMinor: (mode === "NET" || mode === "MARKUP") && rnd() < 0.4 ? Number(valueMinor) + Math.floor(rnd() * 50_000) : null, markupCapBp: mode === "MARKUP" ? Math.floor(rnd() * 5_000) : null,
        productId: rnd() < 0.85 ? PID : "other", optionId: pick([null, null, OPT, OPT_OTHER]), cabinTypeId: rnd() < 0.06 ? "cab" : null, currency: rnd() < 0.92 ? "THB" : "USD", productKind: rnd() < 0.95 ? "TRIP" : "TICKET",
        travelFrom: tf, travelTo: tt, bookFrom: bf, bookTo: bt, priority: Math.floor(rnd() * 3), active: rnd() < 0.88 });
    };
    const cards: Rec[] = [];
    const nc = 1 + Math.floor(rnd() * 5);
    for (let c = 0; c < nc; c++) {
      const kind = pick(["T", "T", "A", "A", "TO", "AO"] as const);
      const [vf, vt] = brange();
      const o: Rec = { id: `c${i}_${c}`, status: pick(["ACTIVE", "ACTIVE", "ACTIVE", "DRAFT", "ARCHIVED"] as const), validFrom: vf, validTo: vt, version: 1 + Math.floor(rnd() * 9), priority: Math.floor(rnd() * 3),
        ...(kind === "T" ? { ownerKind: "TIER", tierId: "tier_B", agentAccountId: null } : kind === "TO" ? { ownerKind: "TIER", tierId: "tier_A", agentAccountId: null } : kind === "A" ? { ownerKind: "AGENT", tierId: null, agentAccountId: "acc_1" } : { ownerKind: "AGENT", tierId: null, agentAccountId: "acc_2" }) };
      cards.push(kcard(String(o.id), o, Array.from({ length: Math.floor(rnd() * 7) }, mkRate)));
    }
    return facts({ cards, bookYmd: addDaysYmd("2026-11-05", Math.floor(rnd() * 14)), travelYmd: addDaysYmd("2027-03-01", Math.floor(rnd() * 20)), account: rnd() < 0.1 ? { tierId: null, tierCode: null } : {},
      product: { productType: pick(["TOUR", "LIVEABOARD", "ATTRACTION"] as const), optionId: pick([OPT, OPT, null]) }, policy: pol(rnd() < 0.3 ? { "agency.price.minResalePrice": 123_400 } : {}) });
  };
  const shuffle = (rnd: () => number, f: Rec): Rec => {
    const sh = <T,>(xs: T[]): T[] => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    return { ...f, cards: sh(A(f.cards)).map((c) => ({ ...c, rates: sh(A(c.rates)) })), product: { ...R(f.product), paxTypes: sh(A(R(f.product).paxTypes)) } };
  };
  await st("KF-1", "400 ชุดสุ่ม × 2 ชั้น: resolveAgentLayer ได้ Level เท่ากับตัวเลือกอ้างอิงของข้อสอบทุกช่อง (และมีทั้งกรณีได้แถว/ค่าเริ่ม/null จริง)", () => {
    const rnd = rng(13_001); const seen = { row: 0, def: 0, nul: 0, netmap: 0 };
    for (let i = 0; i < 400; i++) {
      const f = genFacts(rnd, i);
      for (const l of ["TIER", "CONTRACT"] as const) {
        const exp = refLayer(l, f), got = lvl(l, f);
        if (!isDeepStrictEqual(got, exp)) throw new AssertFail(`ชุด ${i} ชั้น ${l}: ได้ ${fmt(got)} ต้องเป็น ${fmt(exp)}`);
        if (exp === null) seen.nul++; else if (String(exp.refId).startsWith("tier:")) seen.def++; else { seen.row++; if (exp.unitMinorByPaxCode) seen.netmap++; }
      }
    }
    ok(seen.row > 80 && seen.def > 30 && seen.nul > 80 && seen.netmap > 15, `ตัวสร้างชุดสุ่มไม่ครอบคลุม ${fmt(seen)}`);
  });
  await st("KF-2", "ไม่ขึ้นกับลำดับอินพุต: สลับลำดับ card / แถว / ประเภทคน 200 ชุด ⇒ input + trace เท่าเดิมทุกไบต์", () => {
    const rnd = rng(13_002);
    for (let i = 0; i < 200; i++) {
      const f = genFacts(rnd, i); const a = built(f), b = built(shuffle(rnd, f));
      const canon = (x: Rec) => { const c = clone(x); for (const k of ["tier", "contract"]) { const m = asRec(R(R(c.input)[k]).unitMinorByPaxCode); if (m) R(R(c.input)[k]).unitMinorByPaxCode = Object.fromEntries(Object.entries(m).sort()); } (c.warnings as string[]).sort(); return c; };
      if (!isDeepStrictEqual(canon(a), canon(b))) throw new AssertFail(`ชุด ${i}: สลับลำดับแล้วผลเปลี่ยน ${fmt(R(a.input).tier)} / ${fmt(R(b.input).tier)}`);
    }
  });
  await st("KF-3", "แถว/การ์ดที่ไม่เข้าเกณฑ์ไม่มีผล: เติม card เอเจนซี่อื่น · ระดับอื่น · DRAFT · หมดช่วง · แถวปิด/สินค้าอื่น/นอกช่วง ที่อัตราสุดโต่ง 200 ชุด ⇒ Level เท่าเดิม", () => {
    const rnd = rng(13_003);
    for (let i = 0; i < 200; i++) {
      const f = genFacts(rnd, i);
      const junk = [agentCard([rrow("j1", { valueBp: 10_000, priority: 999 })], { id: "j_a", agentAccountId: "acc_9" }), tierCard([rrow("j2", { valueBp: 10_000, priority: 999 })], { id: "j_t", tierId: "tier_9" }),
        tierCard([rrow("j3", { valueBp: 10_000, priority: 999 })], { id: "j_d", status: "DRAFT" }), agentCard([rrow("j4", { valueBp: 10_000, priority: 999 })], { id: "j_x", validTo: "2026-01-01" }),
        agentCard([rrow("j5", { valueBp: 10_000, priority: 999, active: false }), rrow("j6", { valueBp: 10_000, priority: 999, productId: "zz" }), rrow("j7", { valueBp: 10_000, priority: 999, travelTo: "2020-01-01" }), rrow("j8", { valueBp: 10_000, priority: 999, bookFrom: "2030-01-01" })], { id: "j_r" })];
      const g = { ...f, cards: [...A(f.cards), ...junk] };
      for (const l of ["TIER", "CONTRACT"] as const) if (!isDeepStrictEqual(lvl(l, f), lvl(l, g))) throw new AssertFail(`ชุด ${i} ชั้น ${l}: ของไม่เข้าเกณฑ์เปลี่ยนผล ${fmt(lvl(l, f))} → ${fmt(lvl(l, g))}`);
    }
  });
  await st("KF-4", "แถวที่เลือกเข้าเกณฑ์จริงเสมอ + เติมแถว priority ต่ำกว่าทุกแถวไม่เปลี่ยน refId (map ราคาเน็ตเดิมไม่ถูกทับ) 200 ชุด", () => {
    const rnd = rng(13_004); let checked = 0;
    for (let i = 0; i < 200; i++) {
      const f = genFacts(rnd, i);
      for (const l of ["TIER", "CONTRACT"] as const) {
        const got = lvl(l, f); if (!got || String(got.refId).startsWith("tier:")) continue;
        const [rateId, ver] = String(got.refId).split("@");
        const owner = A(f.cards).find((c) => A(c.rates).some((r) => r.id === rateId));
        const row = A(owner?.rates).find((r) => r.id === rateId);
        ok(owner && row, `ชุด ${i}: refId ${String(got.refId)} ไม่มีจริง`);
        ok(owner?.status === "ACTIVE" && String(owner?.version) === ver && row?.active === true && row?.productId === PID && row?.currency === "THB" && row?.cabinTypeId === null && inR(String(f.travelYmd), row?.travelFrom, row?.travelTo) && inR(String(f.bookYmd), row?.bookFrom, row?.bookTo) && inR(String(f.bookYmd), owner?.validFrom, owner?.validTo)
          && (l === "TIER" ? owner?.tierId === "tier_B" && owner?.ownerKind === "TIER" : owner?.agentAccountId === "acc_1" && owner?.ownerKind === "AGENT"), `ชุด ${i} ชั้น ${l}: เลือกแถวไม่เข้าเกณฑ์ ${fmt(row)}`);
        const bumped = { ...f, cards: A(f.cards).map((c) => ({ ...c, priority: Number(c.priority) + 1, rates: A(c.rates).map((r) => ({ ...r, priority: Number(r.priority) + 1 })) })) };
        const low = l === "TIER" ? tierCard([rrow("zz_low", { valueBp: 1, priority: 0 })], { id: "zz_c", priority: 0 }) : agentCard([rrow("zz_low", { valueBp: 1, priority: 0 })], { id: "zz_c", priority: 0 });
        const g1 = lvl(l, bumped), g2 = lvl(l, { ...bumped, cards: [...A(bumped.cards), low] });
        eq([g2?.refId, g2?.mode, g2?.rateBp, g2?.fixedSatang], [g1?.refId, g1?.mode, g1?.rateBp, g1?.fixedSatang], `ชุด ${i} ชั้น ${l}: แถว priority ต่ำเปลี่ยนผล`);
        checked++;
      }
    }
    ok(checked >= 30, `ตรวจได้น้อยไป ${checked}`);
  });
  groupLine("KF");

  // ═══════════════ S. โครง/ขอบเขต ═══════════════
  console.log("\n── S: โครง · ขอบเขต · กติกาโค้ด ──");
  const srcCore = () => stripComments(read(F_CORE)), srcSvc = () => stripComments(read(F_SVC));
  // ORACLE-EDIT S-6 S-7 S-9 (มติ Z1 · Z4): แตะ trips ได้เฉพาะจุด — pricing.ts ส่ง currency เข้า port (เพิ่ม ≤ 2 ลบ ≤ 2 · ทุกบรรทัดที่เพิ่มต้องมี currency)
  //   · pricing-core.ts ด่านคอมฯ > ฐาน (เพิ่ม 1 ลบ 0 · บรรทัดที่เพิ่มต้องมี COMMISSION_EXCEEDS_PAYABLE) — เกินจำนวน/เนื้อหาไม่ตรง = นอกขอบเขตเหมือนเดิม
  const TRIPS_RULING: Record<string, { add: number; del: number; must: RegExp }> = {
    "src/lib/modules/trips/pricing.ts": { add: 2, del: 2, must: /currency/ },
    "src/lib/modules/trips/pricing-core.ts": { add: 1, del: 0, must: /COMMISSION_EXCEEDS_PAYABLE/ },
  };
  const withinRuling = (f: string): boolean => {
    const a = TRIPS_RULING[f];
    if (!a) return false;
    const [add, del] = git(["diff", "--numstat", BASE_SHA, "--", f]).trim().split(/\s+/).map(Number);
    if (!(add >= 1 && add <= a.add && del <= a.del)) return false;
    const added = git(["diff", "-U0", BASE_SHA, "--", f]).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    return added.length === add && added.every((l) => a.must.test(l));
  };
  // ORACLE-EDIT S-6 S-7 (ผู้คุม): ไม่นับไฟล์ที่ผู้คุมแก้เอง (ORACLE-EDIT ของ a1.1 / t0.1 · probe ของนักล่า) และไฟล์ทดลองใน scratchpad/ (ไม่ใช่โค้ด · untracked)
  const SUPERVISOR_FILES = new Set(["scripts/qc-trips-a1.1.mts", "scripts/qc-trips-t0.1.mts"]);
  const notOurs = (f: string): boolean => f === ORACLE_FILE || /^scripts\/probe-trips-a1\.3-/.test(f) || SUPERVISOR_FILES.has(f) || f.startsWith("scratchpad/");
  const SVC_FNS = ["ensureAgentTiers", "listAgentTiers", "setAgentAccountTier", "listAgentRateCards", "getAgentRateCard", "createAgentRateCard", "updateAgentRateCard", "setAgentRateCardStatus", "upsertAgentRate", "setAgentRateActive", "installAgencyPricingPort", "tryAgentPrice"];
  const CORE_FNS = ["rateCardTransition", "normalizeAgentRate", "dateRangesOverlap", "rateRowsConflict", "resolveAgentLayer", "decideCommissionVatMode", "buildAgencyPricingInput"];
  const CORE_CONSTS = ["AGENT_TIER_CODES", "AGENT_RATE_MODES", "AGENT_RATE_CARD_STATUSES", "AGENT_RATE_CARD_ACTIONS", "AGENT_RATE_LIMITS", "AGENT_RATE_REASONS", "SHOP_RATE_CARD_KEYS", "SHOP_RATE_KEYS", "AGENT_RATE_AUDIT_KEYS"];
  await st("S-1", "rates-core.ts บริสุทธิ์: import ได้เฉพาะ zod + import type · ไม่มี Date.now / new Date() / Math.random / process.env / fetch / tenantDb", () => {
    needBuilt();
    const s = srcCore();
    const imports = [...s.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1] && m[2] !== "zod").map((m) => m[2]);
    eq(imports, [], "import ที่ไม่ใช่ zod/import type");
    eq(["Date.now(", "new Date()", "Math.random", "process.env", "fetch(", "tenantDb", "import("].filter((x) => s.includes(x)), [], "ของไม่บริสุทธิ์");
  });
  await st("S-2", "facade agency ส่งออกครบ (บริการ 12 · บริสุทธิ์ 7 · ค่าคงที่ 9 · agencyPricingPort.load) · ไม่มี export * · agent-side.ts ไม่ส่งออกของใบนี้ (ไม่มีฟังก์ชันฝั่งเอเจนซี่)", () => {
    needBuilt();
    const m = need(AGM, "agency");
    eq([...SVC_FNS, ...CORE_FNS].filter((n) => typeof m[n] !== "function"), [], "ฟังก์ชันที่ขาด");
    eq(CORE_CONSTS.filter((n) => !(n in m)), [], "ค่าคงที่ที่ขาด");
    ok(typeof R(m.agencyPricingPort).load === "function", "agencyPricingPort.load");
    const idx = stripComments(read(`${AG_DIR}/index.ts`));
    ok(!/export\s+\*/.test(idx), "มี export *");
    const side = stripComments(read(`${AG_DIR}/agent-side.ts`));
    eq([...SVC_FNS, "agencyPricingPort", "rates"].filter((n) => new RegExp(`\\b${n}\\b`).test(side)), [], "agent-side.ts อ้างของใบนี้");
  });
  await st("S-3", "rates.ts: ไม่ import prisma · ไม่ import static จากโมดูลอื่น (trips ผ่าน import() เท่านั้น · ไม่มี party/crm/account/pos/member) · ไม่มี writeAudit/emitOutbox · ไม่ลบแถวราคา · advisory lock สองอาร์กิวเมนต์ทุกจุด · ไม่อ่านตาราง global", () => {
    needBuilt();
    const s = srcSvc();
    ok(!/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s), "import prisma");
    const statics = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']@\/lib\/modules\/([a-z-]+)[^"']*["']/gm)].map((m) => m[1]).filter((x) => x !== "agency");
    eq(statics, [], "import static ข้ามโมดูล");
    const dyn = [...s.matchAll(/import\(\s*["']@\/lib\/modules\/([a-z-]+)[^"']*["']\s*\)/g)].map((m) => m[1]);
    ok(dyn.includes("trips"), "ไม่มี import(\"@/lib/modules/trips\") แบบ lazy");
    eq(dyn.filter((x) => x !== "trips"), [], "lazy import โมดูลอื่น");
    eq(["writeAudit(", "emitOutboxOutsideTx(", "emitOutbox(", "agentRate.delete", "agentRateCard.delete", "DELETE FROM", "agentIdentity", "agentUser.", "agentSession", "agentLogin"].filter((x) => s.includes(x)), [], "ของต้องห้าม");
    const locks = [...s.matchAll(/pg_advisory_xact_lock\s*\(([^;]*?)\)\s*[`"';]/g)].map((m) => m[1]);
    ok(s.includes("pg_advisory_xact_lock") && locks.length > 0, "ไม่มี advisory lock (สร้าง card / เปิดใช้ / สร้างระดับ ต้องล็อก)");
    eq(locks.filter((a) => (a.match(/hashtext\s*\(/g) ?? []).length !== 2), [], "advisory lock ที่ไม่ใช่สองอาร์กิวเมนต์ hashtext");
    ok(s.includes("auditLog.create"), "ไม่มี tx.auditLog.create");
  });
  await st("S-4", "ไม่มีสูตรเงินในไฟล์ของใบนี้ (คณิตเป็นของ T0.5): ไม่มี Math.round/floor/ceil · toFixed · parseFloat · mulBpHalfUp/mulDivHalfUp/vatOf* · 107 · เลขทศนิยม", () => {
    needBuilt();
    for (const [f, s] of [[F_CORE, srcCore()], [F_SVC, srcSvc()]] as const) {
      eq(["Math.round(", "Math.floor(", "Math.ceil(", "Math.trunc(", ".toFixed(", "parseFloat(", "mulBpHalfUp", "mulDivHalfUp", "vatOfInclusive", "vatOfExclusive", "allocateWithin", "10_700", "10700", "/ 107", "/107"].filter((x) => s.includes(x)), [], `${f}: สูตรเงิน`);
      const noStr = s.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""').replace(/`(?:\\.|[^`\\])*`/g, "``");
      eq([...noStr.matchAll(/(?<![\w.])\d+\.\d+(?![\w.])/g)].map((m) => m[0]).slice(0, 5), [], `${f}: เลขทศนิยม`);
    }
  });
  await st("S-6", `ขอบเขต (เทียบ ${BASE_SHA} · ไม่นับ ledger/ · ไฟล์ข้อสอบนี้ · probe ของนักล่า · ไฟล์ที่ตรง session/trips): แตะได้เฉพาะไฟล์ใบสั่ง §2`, () => {
    needBuilt();
    const ch = changedSinceBase(["."]).filter((f) => !f.startsWith("ledger/") && !notOurs(f) && !withinRuling(f) && !sameAsSession(f)); // ORACLE-EDIT S-6 (มติ Z1 Z4)
    eq(ch.filter((f) => !OWNED.has(f)), [], "ไฟล์นอกขอบเขต");
  });
  await st("S-7", "ไม่แตะไฟล์ต้องห้าม: modules/{trips,ticket,pos,hotel,rooms,dorm,booking,queue,account,party,crm,member} · agency/{entry,identity-core,accounts,accounts-core,tokens,agent-side} · platform/agent-auth · core/settings · core/{db,scope,audit,outbox,session,rbac} · prisma · app · components · messages · scripts", () => {
    needBuilt();
    const forb = ["trips", "ticket", "pos", "hotel", "rooms", "dorm", "booking", "queue", "account", "party", "crm", "member"].map((m) => `src/lib/modules/${m}`)
      .concat(["entry", "identity-core", "accounts", "accounts-core", "tokens", "agent-side"].map((f) => `${AG_DIR}/${f}.ts`))
      .concat(["src/lib/platform/agent-auth.ts", "src/lib/core/settings", "src/lib/core/db.ts", "src/lib/core/scope.ts", "src/lib/core/audit.ts", "src/lib/core/outbox.ts", "src/lib/core/session.ts", "src/lib/core/rbac.ts", "prisma", "src/app", "src/components", "src/messages", "scripts"]);
    const t = changedSinceBase(forb).filter((f) => !notOurs(f) && !withinRuling(f) && !sameAsSession(f)); // ORACLE-EDIT S-7 (มติ Z1 Z4)
    eq(t, [], "ไฟล์ต้องห้ามที่เปลี่ยน");
  });
  await st("S-8", "สิทธิ์ 2 คีย์ agency.rate.view / agency.rate.edit มีป้ายไทยใน permissions.ts · ไม่มี event ใหม่ agency.rate.* / agency.tier.* ใน outbox-consumers และ automation/labels", () => {
    needBuilt();
    const p = read("src/lib/core/permissions.ts");
    for (const k of ["agency.rate.view", "agency.rate.edit"]) ok(new RegExp(`"${k.replace(/\./g, "\\.")}"\\s*:\\s*"[^"]*[฀-๿][^"]*"`).test(p), `ไม่มีสิทธิ์ ${k} พร้อมป้ายไทย`);
    eq(["src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts"].filter((f) => /agency\.(rate|rate_card|tier)\./.test(read(f))), [], "event ใหม่");
  });
  await st("S-9", "ผู้กระทำ AGENT ยังปิดในถือที่/จอง/เงิน: ไฟล์ trips ทั้งโมดูลตรง session/trips · จุดกั้นเดิมยังอยู่ (capacity.ts · state.ts · money.ts) · หลังติดตั้ง port แล้ว holdTrips ของ AGENT ยัง FORBIDDEN AGENCY_NOT_ENABLED", async () => {
    needBuilt(); needDb();
    eq(changedSinceBase(["src/lib/modules/trips"]).filter((f) => !sameAsSession(f) && !withinRuling(f)), [], "ไฟล์ trips ที่เปลี่ยน (นอกจุดที่มติ Z1/Z4 อนุญาต)"); // ORACLE-EDIT S-9 (มติ Z1 Z4)
    for (const f of ["capacity.ts", "state.ts", "money.ts"]) ok(read(`src/lib/modules/trips/${f}`).includes("AGENCY_NOT_ENABLED"), `${f} ไม่มีจุดกั้น`);
    await install();
    const r = await callTr("holdTrips", agentCtx(acc("X").id), { idempotencyKey: `qc-${hex(8)}`, quoteId: "x", quoteExpiresAt: new Date(NOW.getTime() + 600_000).toISOString(), quote: { lines: [line(depMain)] } }, {});
    ok(r.ok === false && r.code === "FORBIDDEN" && R(r.details).reason === "AGENCY_NOT_ENABLED", `หลังติดตั้ง port: ${fmt(r)}`);
  });
  await st("S-10", "จุดติดตั้ง: platform/sellables.ts เรียก installAgencyPricingPort ผ่าน import() แบบ lazy ของ facade agency · เทียบฐาน: เพิ่ม ≤ 6 บรรทัด ไม่ลบบรรทัดเดิม · ติดตั้งซ้ำ 3 ครั้งไม่พัง", async () => {
    needBuilt();
    const s = stripComments(read("src/lib/platform/sellables.ts"));
    ok(/import\(\s*["']@\/lib\/modules\/agency["']\s*\)/.test(s) && s.includes("installAgencyPricingPort"), "sellables.ts ไม่ได้ติดตั้ง port");
    ok(!/^\s*import\s+(?!type\b)[^;]*from\s+["']@\/lib\/modules\//m.test(s), "sellables.ts import โมดูลแบบ static");
    const stat = git(["diff", "--numstat", BASE_SHA, "--", "src/lib/platform/sellables.ts"]).trim().split(/\s+/);
    ok(Number(stat[0]) >= 1 && Number(stat[0]) <= 6 && Number(stat[1]) <= 1, `diff sellables.ts +${stat[0]} −${stat[1]}`);
    await install(); await install(); await install();
    const sf = fnOf(R((await tryImport("@/lib/platform/sellables")).mod), "sellableFor", "platform/sellables");
    ok(R(await sf("TRIP")).ok === true, "sellableFor(TRIP)");
  });
  groupLine("S");

  // ═══════════════ T. ระดับ ═══════════════
  console.log("\n── T: ระดับ A/B/C ──");
  await st("T-1", "ensureAgentTiers: สร้าง A/B/C (created 3 · sortOrder 0/1/2 · active) · เรียกซ้ำ created 0 แถวเดิม id เดิม · ฐานมี 3 แถวพอดี · listAgentTiers ตรงกัน", async () => {
    needBuilt(); needDb();
    const r1 = okR(await shop("ensureAgentTiers", cA()), "ครั้งแรก");
    tierIds[tA] = Object.fromEntries(A(r1.tiers).map((t) => [String(t.code), String(t.id)]));
    eq([r1.created, A(r1.tiers).map((t) => [t.code, t.sortOrder, t.active])], [3, [["A", 0, true], ["B", 1, true], ["C", 2, true]]], "ครั้งแรก");
    const r2 = okR(await shop("ensureAgentTiers", cA()), "ครั้งสอง");
    eq([r2.created, A(r2.tiers).map((t) => t.id)], [0, A(r1.tiers).map((t) => t.id)], "ซ้ำ");
    eq((await q<{ code: string }>(`SELECT code FROM "AgentTier" WHERE "tenantId" = $1 ORDER BY code`, [tA])).map((x) => x.code), ["A", "B", "C"], "ฐาน");
    eq(A(okR(await shop("listAgentTiers", cA()), "list").tiers).map((t) => t.id), A(r1.tiers).map((t) => t.id), "list");
    ok(A(r1.tiers).every((t) => isDeepStrictEqual(sortedKeys(t), ["active", "code", "id", "name", "sortOrder"])), `คีย์ของระดับ ${fmt(sortedKeys(A(r1.tiers)[0]))}`);
  });
  await st("T-2", "ค่าตั้งวิธีจ่ายตอนสร้างระดับ (มติ R3 ของ A1.1): A11 ชั้น AGENT_TIER = A1[ระดับ].payDefault (A = CREDIT · B/C = PAY_NOW) · ระดับ A เขียน A12 = \"30\" · payDefaultsSeeded true", async () => {
    needBuilt(); needDb();
    const t = await tiers();
    const rs = async (key: string, code: string) => R(await S("resolveSetting")({ tenantId: tA }, key, { unitId: uA, agentTierId: t[code] }, NOW));
    const a11 = [await rs("agency.money.paymentMethod", "A"), await rs("agency.money.paymentMethod", "B"), await rs("agency.money.paymentMethod", "C")];
    eq(a11.map((x) => [x.value, x.source]), [["CREDIT", "AGENT_TIER"], ["PAY_NOW", "AGENT_TIER"], ["PAY_NOW", "AGENT_TIER"]], "A11");
    const a12 = await rs("agency.money.creditTermDays", "A");
    eq([a12.value, a12.source], ["30", "AGENT_TIER"], "A12 ระดับ A");
    const fresh = okR(await shop("ensureAgentTiers", cB()), "ร้าน B");
    tierIds[tB] = Object.fromEntries(A(fresh.tiers).map((x) => [String(x.code), String(x.id)]));
    eq([fresh.created, fresh.payDefaultsSeeded], [3, true], "ร้าน B");
  });
  await st("T-3", "setAgentAccountTier: ตั้ง B ⇒ ฐานเปลี่ยน · expectedUpdatedAt เก่า ⇒ STALE ไม่เขียน · รหัสระดับแปลก ⇒ VALIDATION · บัญชีร้านอื่น/ไม่มี ⇒ NOT_FOUND รูปเดียวกัน · บัญชี CLOSED ⇒ BAD_STATE · null = ล้างระดับ", async () => {
    needBuilt(); needDb(); const t = await tiers();
    const upd = async (key: string) => String((await q<{ u: string }>(`SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS u FROM "AgentAccount" WHERE id = $1`, [acc(key).id]))[0]?.u);
    const tierOf = async (key: string) => (await q<{ tierId: string | null }>(`SELECT "tierId" FROM "AgentAccount" WHERE id = $1`, [acc(key).id]))[0]?.tierId;
    const u0 = await upd("T1");
    const r = okR(await shop("setAgentAccountTier", cA(), { agentAccountId: acc("T1").id, tierCode: "B", expectedUpdatedAt: u0 }), "ตั้ง B");
    eq([r.tierCode, r.agentAccountId, await tierOf("T1")], ["B", acc("T1").id, t.B], "ตั้ง B");
    failR(await shop("setAgentAccountTier", cA(), { agentAccountId: acc("T1").id, tierCode: "A", expectedUpdatedAt: u0 }), "STALE", "updatedAt เก่า");
    eq(await tierOf("T1"), t.B, "STALE ต้องไม่เขียน");
    failR(await shop("setAgentAccountTier", cA(), { agentAccountId: acc("T1").id, tierCode: "Z", expectedUpdatedAt: await upd("T1") }), "VALIDATION", "รหัสแปลก");
    const nf1 = await shop("setAgentAccountTier", cA(), { agentAccountId: acc("Z").id, tierCode: "B", expectedUpdatedAt: await upd("Z") });
    const nf2 = await shop("setAgentAccountTier", cA(), { agentAccountId: "nope_zzz", tierCode: "B", expectedUpdatedAt: u0 });
    failR(nf1, "NOT_FOUND", "บัญชีร้านอื่น"); eq(nf1, nf2, "ผลเดียวกับ id ไม่มี");
    failR(await shop("setAgentAccountTier", cA(), { agentAccountId: acc("CL").id, tierCode: "B", expectedUpdatedAt: await upd("CL") }), "BAD_STATE", "CLOSED");
    okR(await shop("setAgentAccountTier", cA(), { agentAccountId: acc("T1").id, tierCode: null, expectedUpdatedAt: await upd("T1") }), "ล้าง");
    eq(await tierOf("T1"), null, "ล้างระดับ");
  });
  groupLine("T");

  // ═══════════════ R. rate card + แถวราคา ═══════════════
  console.log("\n── R: rate card และแถวราคา ──");
  let cardR = { id: "", version: 0 };
  await st("R-1", "createAgentRateCard (ระดับ A): DRAFT · version 1 · คีย์ DTO ตรง SHOP_RATE_CARD_KEYS · getAgentRateCard เท่ากัน · รายการไม่มีคีย์ rates · tenantId ในฐานถูก", async () => {
    needBuilt(); needDb(); await tiers();
    const c = R(okR(await shop("createAgentRateCard", cA(), { owner: tierOwner("A"), name: `${MARK_CARD} หลัก` }), "create").card);
    cardR = { id: String(c.id), version: Number(c.version) };
    eq([c.status, c.version, c.ownerKind, c.tierCode, c.agentAccountId, c.rateCount, c.rates, c.validFrom, c.validTo, c.priority], ["DRAFT", 1, "TIER", "A", null, 0, [], null, null, 0], "card ใหม่");
    eq(sortedKeys(c), [...(CO("SHOP_RATE_CARD_KEYS") as string[])].sort(), "คีย์ card");
    eq(R(okR(await shop("getAgentRateCard", cA(), { cardId: cardR.id }), "get").card), c, "get");
    const items = A(okR(await shop("listAgentRateCards", cA(), { owner: tierOwner("A") }), "list").items);
    const it = items.find((x) => x.id === cardR.id);
    ok(it, "ไม่อยู่ในรายการ");
    eq(sortedKeys(it), (CO("SHOP_RATE_CARD_KEYS") as string[]).filter((k) => k !== "rates").sort(), "คีย์รายการ");
    eq((await q<{ tenantId: string; tierId: string }>(`SELECT "tenantId", "tierId" FROM "AgentRateCard" WHERE id = $1`, [cardR.id]))[0], { tenantId: tA, tierId: (await tiers()).A }, "ฐาน");
  });
  await st("R-2", "เจ้าของ: บัญชี CLOSED ⇒ VALIDATION ACCOUNT_NOT_ACTIVE · บัญชีร้านอื่น ⇒ NOT_FOUND (= id ไม่มี) · รูป owner ผิด/มีทั้งสองชนิด ⇒ VALIDATION · ชื่อมีอักขระควบคุม/ว่าง/ยาวเกิน ⇒ VALIDATION", async () => {
    needBuilt(); needDb(); await tiers();
    failR(await shop("createAgentRateCard", cA(), { owner: agentOwner("CL"), name: "x" }), "VALIDATION", "CLOSED", "ACCOUNT_NOT_ACTIVE");
    const a = await shop("createAgentRateCard", cA(), { owner: { kind: "AGENT", agentAccountId: acc("Z").id }, name: "x" }), b = await shop("createAgentRateCard", cA(), { owner: { kind: "AGENT", agentAccountId: "nope_zzz" }, name: "x" });
    failR(a, "NOT_FOUND", "ร้านอื่น"); eq(a, b, "= id ไม่มี");
    for (const [what, input] of [["owner สองชนิด", { owner: { kind: "TIER", tierCode: "B", agentAccountId: acc("X").id }, name: "x" }], ["owner แปลก", { owner: { kind: "SHOP" }, name: "x" }], ["ระดับ D", { owner: tierOwner("D"), name: "x" }],
      ["ชื่อควบคุม", { owner: tierOwner("B"), name: "a\u0000b" }], ["ชื่อกลับทิศ", { owner: tierOwner("B"), name: "a‮b" }], ["ชื่อว่าง", { owner: tierOwner("B"), name: "   " }], ["ชื่อยาว", { owner: tierOwner("B"), name: "ก".repeat(81) }],
      ["ช่องแปลก", { owner: tierOwner("B"), name: "x", tenantId: tB }], ["status ตอนสร้าง", { owner: tierOwner("B"), name: "x", status: "ACTIVE" }]] as const) failR(await shop("createAgentRateCard", cA(), input), "VALIDATION", what);
  });
  await st("R-3", "updateAgentRateCard: แก้ชื่อ/ช่วง/ลำดับ version +1 พอดี · ช่วงกลับด้าน ⇒ VALIDATION BAD_RANGE · version เก่า ⇒ STALE ไม่เขียน · เปลี่ยนเจ้าของ/สถานะผ่าน patch ⇒ VALIDATION", async () => {
    needBuilt(); ok(cardR.id, "ไม่มี card (R-1)");
    const u = R(okR(await shop("updateAgentRateCard", cA(), { cardId: cardR.id, expectedVersion: cardR.version, patch: { name: `${MARK_CARD} แก้`, validFrom: "2026-11-01", validTo: "2028-10-31", priority: 2 } }), "update").card);
    eq([u.version, u.validFrom, u.validTo, u.priority, u.name], [cardR.version + 1, "2026-11-01", "2028-10-31", 2, `${MARK_CARD} แก้`], "หลังแก้");
    failR(await shop("updateAgentRateCard", cA(), { cardId: cardR.id, expectedVersion: cardR.version, patch: { priority: 9 } }), "STALE", "version เก่า");
    cardR.version = Number(u.version);
    failR(await shop("updateAgentRateCard", cA(), { cardId: cardR.id, expectedVersion: cardR.version, patch: { validFrom: "2027-02-01", validTo: "2027-01-31" } }), "VALIDATION", "กลับด้าน", "BAD_RANGE");
    for (const patch of [{ status: "ACTIVE" }, { ownerKind: "AGENT" }, { tierId: "x" }, { version: 99 }, { tenantId: tB }]) failR(await shop("updateAgentRateCard", cA(), { cardId: cardR.id, expectedVersion: cardR.version, patch }), "VALIDATION", `patch ${fmt(patch)}`);
    eq([await cardVer(cardR.id), (await q<{ priority: number }>(`SELECT priority FROM "AgentRateCard" WHERE id = $1`, [cardR.id]))[0]?.priority], [cardR.version, 2], "ไม่มีการเขียนจากคำสั่งที่ล้ม");
  });
  const upsert = async (rate: Rec, ctx = cA()): Promise<Rec> => {
    const r = await shop("upsertAgentRate", ctx, { cardId: cardR.id, expectedVersion: cardR.version, rate });
    if (r.ok === true) cardR.version = Number(R(r.card).version);
    return r;
  };
  let rPct = "", rSp = "";
  await st("R-4", "upsertAgentRate ทั้ง 4 โหมด: คีย์ DTO ตรง SHOP_RATE_KEYS · version +1 ต่อครั้ง · ฐานตรง (จำนวนเต็ม) · specialPeriod ถูก · แถวผิดรูป ⇒ VALIDATION พร้อมเหตุ และ version ไม่ขยับ", async () => {
    needBuilt(); ok(cardR.id, "ไม่มี card (R-1)");
    const v0 = cardR.version;
    const a = R(okR(await upsert(rateOf({ valueBp: 1200 })), "PCT").rate); rPct = String(a.id);
    eq(sortedKeys(a), [...(CO("SHOP_RATE_KEYS") as string[])].sort(), "คีย์แถว");
    eq([a.mode, a.valueBp, a.valueMinor, a.currency, a.priority, a.active, a.specialPeriod, a.optionId, a.paxTypeId], ["COMMISSION_PCT", 1200, null, "THB", 0, true, false, null, null], "PCT");
    const b = R(okR(await upsert(rateOf({ valueBp: 1000, travelFrom: "2026-12-20", travelTo: "2027-01-05" })), "ช่วงพิเศษ").rate); rSp = String(b.id);
    eq([b.specialPeriod, b.travelFrom, b.travelTo], [true, "2026-12-20", "2027-01-05"], "ช่วงพิเศษ");
    okR(await upsert({ productKind: "TRIP", productId: PRD.A2.id, mode: "COMMISSION_FIXED", valueMinor: 20_000 }), "FIXED");
    // ORACLE-EDIT R-4 (มติ Z5 ก): สินค้า/ตัวเลือก/priority เดียวกันใน card เดียว ต้องโหมดเดียว — NET ข้าง FIXED (A2 · ตัวเลือก null · priority 0) ⇒ VALIDATION MIXED_MODES ไม่เขียน
    const vMix = cardR.version;
    failR(await upsert({ productKind: "TRIP", productId: PRD.A2.id, mode: "NET", valueMinor: 280_000, paxTypeId: PRD.A2.pt.ADULT, minSellMinor: 330_000, travelFrom: "2028-01-01", travelTo: "2028-01-31" }), "VALIDATION", "NET ปนกับ FIXED priority เดียวกัน", "MIXED_MODES");
    eq(await cardVer(cardR.id), vMix, "version หลัง MIXED_MODES");
    // priority ต่างกัน ⇒ ไม่ถือว่าปน (ตัว priority สูงชนะตอนเลือก) ⇒ รับ
    okR(await upsert({ productKind: "TRIP", productId: PRD.A2.id, mode: "NET", valueMinor: 280_000, paxTypeId: PRD.A2.pt.ADULT, minSellMinor: 330_000, travelFrom: "2028-01-01", travelTo: "2028-01-31", priority: 1 }), "NET priority ต่าง");
    okR(await upsert({ productKind: "TRIP", productId: PRD.A2.id, optionId: PRD.A2.opt, mode: "MARKUP", valueMinor: 300_000, markupCapBp: 2000, travelFrom: "2028-02-01", travelTo: "2028-02-28" }), "MARKUP");
    eq([cardR.version, await cardVer(cardR.id)], [v0 + 5, v0 + 5], "version");
    const db = await q<{ mode: string; valueBp: number | null; valueMinor: number | null; tenantId: string }>(`SELECT mode, "valueBp", "valueMinor", "tenantId" FROM "AgentRate" WHERE "rateCardId" = $1 ORDER BY mode, "valueBp"`, [cardR.id]);
    eq(db.map((x) => [x.mode, x.valueBp, x.valueMinor, x.tenantId]), [["COMMISSION_FIXED", null, 20_000, tA], ["COMMISSION_PCT", 1000, null, tA], ["COMMISSION_PCT", 1200, null, tA], ["MARKUP", null, 300_000, tA], ["NET", null, 280_000, tA]], "ฐาน");
    for (const [rate, reason] of [[rateOf({ valueBp: 15.5 }), "BAD_INPUT"], [rateOf({ valueBp: undefined, valueMinor: 5 }), "MODE_VALUE_MISMATCH"], [rateOf({ paxTypeId: PRD.A.pt.ADULT, travelFrom: "2029-01-01" }), "PAX_RATE_COMMISSION"],
      [{ productKind: "HOTEL", productId: PRD.A.id, mode: "NET", valueMinor: 1 }, "KIND_NOT_SUPPORTED"], [{ productKind: "TRIP", productId: PRD.A.id, mode: "NET", valueMinor: 500, minSellMinor: 499, travelFrom: "2029-01-01" }, "MIN_SELL_BELOW_NET"]] as const) failR(await upsert(rate), "VALIDATION", `แถวผิด ${reason}`, reason);
    eq(await cardVer(cardR.id), v0 + 5, "version หลังคำสั่งที่ล้ม");
    eq(R(okR(await shop("getAgentRateCard", cA(), { cardId: cardR.id }), "get").card).rateCount, 5, "rateCount");
  });
  // ORACLE-EDIT R-5 (มติ Z2): ไม่ส่ง id แล้วคีย์มิติชนแถวเดิม — ทุกช่องเท่ากัน = ผลซ้ำ (replayed · version ไม่ขยับ · ไม่มี audit) · ต่างแม้ช่องเดียว ⇒ VALIDATION RATE_OVERLAP ไม่เขียนทับ · แก้แถวได้ทางเดียวคือส่ง id + expectedVersion
  await st("R-5", "upsert ไม่มี id ที่คีย์มิติตรงแถวเดิม: ช่องต่าง ⇒ RATE_OVERLAP ไม่เขียนทับ · ทุกช่องเท่า ⇒ replayed (version/audit ไม่ขยับ) · แก้ด้วย id + expectedVersion ได้ (1200 → 1300 → 1200) · id ไม่มี ⇒ NOT_FOUND · version เก่า ⇒ STALE", async () => {
    needBuilt(); ok(rPct, "ไม่มีแถว (R-4)");
    const rowJson = async () => (await q<{ j: string }>(`SELECT row_to_json(r)::text AS j FROM "AgentRate" r WHERE id = $1`, [rPct]))[0]?.j;
    const nRows = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentRate" WHERE "rateCardId" = $1`, [cardR.id]))[0]?.n;
    const v0 = cardR.version, j0 = await rowJson(), a0 = (await auditRows(tA)).length;
    failR(await upsert(rateOf({ valueBp: 1300 })), "VALIDATION", "ซ้ำมิติ ช่องต่าง", "RATE_OVERLAP");
    eq([await rowJson(), await nRows(), await cardVer(cardR.id), (await auditRows(tA)).length], [j0, 5, v0, a0], "ไม่เขียนทับ (แถวเดิมทุกไบต์)");
    const same = await upsert(rateOf({ valueBp: 1200 }));
    okR(same, "ส่งซ้ำทุกช่อง");
    eq([same.replayed, R(same.rate).id, R(same.card).version, await cardVer(cardR.id), (await auditRows(tA)).length, await rowJson(), await nRows()], [true, rPct, v0, v0, a0, j0, 5], "ผลซ้ำ");
    const up = R(okR(await upsert(rateOf({ id: rPct, valueBp: 1300 })), "ด้วย id 1300").rate);
    eq([up.id, up.valueBp, cardR.version, await nRows()], [rPct, 1300, v0 + 1, 5], "ด้วย id 1300");
    const byId = R(okR(await upsert(rateOf({ id: rPct, valueBp: 1200 })), "ด้วย id").rate);
    eq([byId.id, byId.valueBp], [rPct, 1200], "ด้วย id");
    failR(await upsert(rateOf({ id: "nope_zzz", valueBp: 1 })), "NOT_FOUND", "id ไม่มี");
    failR(await shop("upsertAgentRate", cA(), { cardId: cardR.id, expectedVersion: cardR.version - 1, rate: rateOf({ valueBp: 1 }) }), "STALE", "version เก่า");
    eq((await q<{ valueBp: number }>(`SELECT "valueBp" FROM "AgentRate" WHERE id = $1`, [rPct]))[0]?.valueBp, 1200, "ไม่ถูกเขียนจากคำสั่งที่ล้ม");
  });
  await st("R-6", "ตรวจกับสินค้าจริง: สินค้าร้านอื่น ⇒ VALIDATION PRODUCT_NOT_FOUND (ผลเดียวกับ id ไม่มี) · ตัวเลือก/ประเภทคนของสินค้าอื่น ⇒ PRODUCT_NOT_FOUND · สกุล USD บนสินค้าบาท ⇒ CURRENCY_MISMATCH · TICKET ⇒ KIND_NOT_SUPPORTED", async () => {
    needBuilt(); ok(cardR.id, "ไม่มี card");
    const v = cardR.version;
    const other = await upsert({ productKind: "TRIP", productId: PRD.B.id, mode: "COMMISSION_PCT", valueBp: 100 }), none = await upsert({ productKind: "TRIP", productId: "nope_zzz", mode: "COMMISSION_PCT", valueBp: 100 });
    failR(other, "VALIDATION", "สินค้าร้านอื่น", "PRODUCT_NOT_FOUND"); eq(other, none, "= id ไม่มี");
    failR(await upsert({ productKind: "TRIP", productId: PRD.A.id, optionId: PRD.A2.opt, mode: "COMMISSION_PCT", valueBp: 100 }), "VALIDATION", "ตัวเลือกสินค้าอื่น", "PRODUCT_NOT_FOUND");
    failR(await upsert({ productKind: "TRIP", productId: PRD.A.id, paxTypeId: PRD.A2.pt.ADULT, mode: "NET", valueMinor: 100 }), "VALIDATION", "ประเภทคนสินค้าอื่น", "PRODUCT_NOT_FOUND");
    failR(await upsert({ productKind: "TRIP", productId: PRD.A.id, mode: "NET", valueMinor: 9_000, currency: "USD", travelFrom: "2029-06-01" }), "VALIDATION", "USD", "CURRENCY_MISMATCH");
    failR(await upsert({ productKind: "TICKET", productId: PRD.A.id, mode: "NET", valueMinor: 100 }), "VALIDATION", "TICKET", "KIND_NOT_SUPPORTED");
    eq(await cardVer(cardR.id), v, "version ไม่ขยับ");
  });
  await st("R-7", "ไม่มีการลบแถว: setAgentRateActive(false) ⇒ แถวยังอยู่ active=false · version +1 · เปิดกลับได้ · แถวของ card อื่น ⇒ NOT_FOUND", async () => {
    needBuilt(); ok(rSp, "ไม่มีแถว (R-4)");
    const n0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentRate" WHERE "rateCardId" = $1`, [cardR.id]))[0]?.n;
    const off = okR(await shop("setAgentRateActive", cA(), { cardId: cardR.id, expectedVersion: cardR.version, rateId: rSp, active: false }), "ปิด");
    eq([R(off.rate).active, R(off.card).version, (await q<{ active: boolean }>(`SELECT active FROM "AgentRate" WHERE id = $1`, [rSp]))[0]?.active, (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentRate" WHERE "rateCardId" = $1`, [cardR.id]))[0]?.n], [false, cardR.version + 1, false, n0], "ปิด");
    cardR.version += 1;
    const on = okR(await shop("setAgentRateActive", cA(), { cardId: cardR.id, expectedVersion: cardR.version, rateId: rSp, active: true }), "เปิด");
    cardR.version = Number(R(on.card).version);
    eq(R(on.rate).active, true, "เปิดกลับ");
    failR(await shop("setAgentRateActive", cA(), { cardId: cardR.id, expectedVersion: cardR.version, rateId: "nope_zzz", active: false }), "NOT_FOUND", "แถวไม่มี");
  });
  await st("R-8", "ตัวกันช่วงซ้อน: ช่วงพิเศษมิติเดียวกัน priority เท่ากัน ซ้อนวันเดียว ⇒ VALIDATION RATE_OVERLAP · ติดกัน (วันถัดไป) ได้ · ซ้อนแต่ priority ต่าง ได้ · ปิดแถวแล้วซ้อนได้ แต่เปิดกลับตอนมีแถวซ้อน ⇒ RATE_OVERLAP · แก้ช่วงให้ซ้อน ⇒ RATE_OVERLAP", async () => {
    needBuilt(); ok(rSp, "ไม่มีแถว (R-4)");
    failR(await upsert(rateOf({ valueBp: 900, travelFrom: "2027-01-05", travelTo: "2027-01-10" })), "VALIDATION", "ซ้อนวันเดียว", "RATE_OVERLAP");
    const adj = R(okR(await upsert(rateOf({ valueBp: 900, travelFrom: "2027-01-06", travelTo: "2027-01-10" })), "ติดกัน").rate);
    okR(await upsert(rateOf({ valueBp: 700, travelFrom: "2026-12-24", travelTo: "2026-12-26", priority: 5 })), "priority ต่าง");
    failR(await upsert(rateOf({ id: String(adj.id), valueBp: 900, travelFrom: "2027-01-03", travelTo: "2027-01-10" })), "VALIDATION", "แก้ช่วงให้ซ้อน", "RATE_OVERLAP");
    const off = okR(await shop("setAgentRateActive", cA(), { cardId: cardR.id, expectedVersion: cardR.version, rateId: String(adj.id), active: false }), "ปิดแถวติดกัน"); cardR.version = Number(R(off.card).version);
    const over = R(okR(await upsert(rateOf({ valueBp: 850, travelFrom: "2027-01-08", travelTo: "2027-01-12" })), "ซ้อนกับแถวที่ปิด").rate);
    failR(await shop("setAgentRateActive", cA(), { cardId: cardR.id, expectedVersion: cardR.version, rateId: String(adj.id), active: true }), "VALIDATION", "เปิดกลับแล้วซ้อน", "RATE_OVERLAP");
    ok(over.id !== adj.id, "ต้องเป็นคนละแถว");
    failR(await upsert(rateOf({ valueBp: 600, bookFrom: "2026-11-01", bookTo: "2026-11-30", travelFrom: "2026-12-30", travelTo: "2026-12-31" })), "VALIDATION", "ซ้อนทั้งช่วงจองและเดินทาง (อีกแถวไม่จำกัดวันจอง)", "RATE_OVERLAP");
  });
  let cardArch = "";
  await st("R-9", "ผังสถานะ: ACTIVATE ⇒ ACTIVE (version +1) · ACTIVATE ซ้ำ ⇒ replayed ไม่เพิ่ม version/audit · ACTIVE ยังแก้แถวได้ · ARCHIVE ⇒ ARCHIVED · ทุกการเขียนบน ARCHIVED ⇒ BAD_STATE CARD_ARCHIVED · ACTIVATE บน ARCHIVED ⇒ BAD_STATE", async () => {
    needBuilt(); needDb();
    const c = await mkCard(agentOwner("Y"), [rateOf({ valueBp: 1100 })], { activate: false });
    cardArch = c.id;
    const a1 = okR(await shop("setAgentRateCardStatus", cA(), { cardId: c.id, expectedVersion: c.version, action: "ACTIVATE" }), "ACTIVATE");
    eq([R(a1.card).status, R(a1.card).version, a1.replayed], ["ACTIVE", c.version + 1, false], "ACTIVE");
    const au0 = (await auditRows(tA)).length;
    const a2 = okR(await shop("setAgentRateCardStatus", cA(), { cardId: c.id, expectedVersion: c.version + 1, action: "ACTIVATE" }), "ซ้ำ");
    eq([a2.replayed, R(a2.card).version, (await auditRows(tA)).length], [true, c.version + 1, au0], "replayed");
    // ORACLE-EDIT R-9 (มติ Z2): แก้แถวเดิมต้องส่ง id (ไม่ส่ง id + คีย์ชน = RATE_OVERLAP)
    const e = okR(await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: c.version + 1, rate: rateOf({ id: c.rateIds[0], valueBp: 1150 }) }), "แก้ตอน ACTIVE");
    const v = Number(R(e.card).version);
    const ar = okR(await shop("setAgentRateCardStatus", cA(), { cardId: c.id, expectedVersion: v, action: "ARCHIVE" }), "ARCHIVE");
    eq(R(ar.card).status, "ARCHIVED", "ARCHIVED");
    const v2 = Number(R(ar.card).version);
    failR(await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: v2, rate: rateOf({ valueBp: 1 }) }), "BAD_STATE", "upsert บน ARCHIVED", "CARD_ARCHIVED");
    failR(await shop("updateAgentRateCard", cA(), { cardId: c.id, expectedVersion: v2, patch: { priority: 1 } }), "BAD_STATE", "update บน ARCHIVED", "CARD_ARCHIVED");
    failR(await shop("setAgentRateActive", cA(), { cardId: c.id, expectedVersion: v2, rateId: c.rateIds[0], active: false }), "BAD_STATE", "ปิดแถวบน ARCHIVED", "CARD_ARCHIVED");
    failR(await shop("setAgentRateCardStatus", cA(), { cardId: c.id, expectedVersion: v2, action: "ACTIVATE" }), "BAD_STATE", "ACTIVATE บน ARCHIVED");
    eq([await cardVer(c.id), (await q<{ valueBp: number }>(`SELECT "valueBp" FROM "AgentRate" WHERE id = $1`, [c.rateIds[0]]))[0]?.valueBp], [v2, 1150], "ไม่ถูกเขียน");
    failR(await shop("setAgentRateCardStatus", cA(), { cardId: c.id, expectedVersion: v2, action: "DELETE" }), "VALIDATION", "action แปลก");
  });
  await st("R-10", "CARD_OVERLAP: card ที่สองของเจ้าของเดียวกัน ช่วงมีผลซ้อน priority เท่ากัน ⇒ ACTIVATE ถูกปฏิเสธ VALIDATION CARD_OVERLAP (ยัง DRAFT) · ช่วงติดกันได้ · priority ต่างได้ · ขยายช่วงของใบ ACTIVE ให้ซ้อน ⇒ CARD_OVERLAP · ต่างเจ้าของไม่เกี่ยว", async () => {
    needBuilt(); needDb();
    const o = agentOwner("XS");
    const c1 = await mkCard(o, [rateOf()], { validFrom: "2027-01-01", validTo: "2027-06-30" });
    const c2 = await mkCard(o, [rateOf()], { activate: false, validFrom: "2027-06-30", validTo: "2027-12-31" });
    failR(await shop("setAgentRateCardStatus", cA(), { cardId: c2.id, expectedVersion: c2.version, action: "ACTIVATE" }), "VALIDATION", "ซ้อนวันเดียว", "CARD_OVERLAP");
    eq((await q<{ status: string }>(`SELECT status FROM "AgentRateCard" WHERE id = $1`, [c2.id]))[0]?.status, "DRAFT", "ยัง DRAFT");
    const c3 = await mkCard(o, [rateOf()], { validFrom: "2027-07-01", validTo: "2027-12-31" });
    await mkCard(o, [rateOf()], { validFrom: "2027-03-01", validTo: "2027-03-31", priority: 3 });
    failR(await shop("updateAgentRateCard", cA(), { cardId: c3.id, expectedVersion: c3.version, patch: { validFrom: "2027-06-01" } }), "VALIDATION", "ขยายช่วงให้ซ้อน", "CARD_OVERLAP");
    failR(await shop("updateAgentRateCard", cA(), { cardId: c1.id, expectedVersion: c1.version, patch: { priority: 3 } }), "VALIDATION", "เปลี่ยน priority ให้ชน", "CARD_OVERLAP");
    await mkCard(agentOwner("S2"), [rateOf()], { validFrom: "2027-01-01", validTo: "2027-12-31" });
  });
  await st("R-11", "copyFromCardId: คัดลอกแถวราคาทั้งหมด (ค่า/ช่วง/สถานะเปิดปิดเท่าต้นฉบับ · id ใหม่ · ต้นฉบับไม่เปลี่ยน) เป็น DRAFT version 1 · คัดลอกจาก card ร้านอื่น ⇒ NOT_FOUND (= id ไม่มี)", async () => {
    needBuilt(); ok(cardR.id, "ไม่มี card");
    const src = R(okR(await shop("getAgentRateCard", cA(), { cardId: cardR.id }), "get").card);
    const cp = R(okR(await shop("createAgentRateCard", cA(), { owner: agentOwner("XS"), name: "สำเนา", copyFromCardId: cardR.id, validFrom: "2030-01-01", validTo: "2030-12-31" }), "copy").card);
    const strip = (rs: unknown) => A(rs).map((r) => { const { id: _i, updatedAt: _u, ...rest } = r; return rest; }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    eq([cp.status, cp.version, cp.rateCount, strip(cp.rates)], ["DRAFT", 1, src.rateCount, strip(src.rates)], "สำเนา");
    ok(A(cp.rates).every((r) => !A(src.rates).some((s) => s.id === r.id)), "id ของแถวต้องใหม่");
    eq(R(okR(await shop("getAgentRateCard", cA(), { cardId: cardR.id }), "get").card), src, "ต้นฉบับไม่เปลี่ยน");
    const bcard = await mkCard(tierOwner("B"), [{ productKind: "TRIP", productId: PRD.B.id, mode: "COMMISSION_PCT", valueBp: 4321 }], { ctx: cB(), name: MARK_B });
    const x = await shop("createAgentRateCard", cA(), { owner: agentOwner("XS"), name: "ขโมย", copyFromCardId: bcard.id }), y = await shop("createAgentRateCard", cA(), { owner: agentOwner("XS"), name: "ขโมย", copyFromCardId: "nope_zzz" });
    failR(x, "NOT_FOUND", "คัดลอกข้ามร้าน"); eq(x, y, "= id ไม่มี");
  });
  await st("R-12", "เพดานแถวต่อ card (ratesPerCard): card ที่มีครบ 500 แถว ⇒ เพิ่มแถวใหม่ VALIDATION LIMIT_REACHED · แก้แถวเดิมยังได้", async () => {
    needBuilt(); needDb();
    const c = await mkCard(agentOwner("S1"), [rateOf({ valueBp: 1 })], { activate: false, validFrom: "2031-01-01", validTo: "2031-12-31" });
    const lim = LIM("ratesPerCard");
    await pool.query(`INSERT INTO "AgentRate" (id, "tenantId", "rateCardId", "productKind", "productId", mode, "valueBp", currency, "travelFrom", "travelTo", priority, active, "createdAt", "updatedAt")
      SELECT 'a13qc_bulk_' || $4 || '_' || g, $1, $2, 'TRIP', $3, 'COMMISSION_PCT', 100, 'THB', date '2032-01-01' + g, date '2032-01-01' + g, 0, true, now(), now() FROM generate_series(1, $5::int) g`, [tA, c.id, PRD.A.id, STAMP, lim - 1]);
    failR(await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: c.version, rate: rateOf({ valueBp: 5, travelFrom: "2040-01-01", travelTo: "2040-01-01" }) }), "VALIDATION", "เกินเพดาน", "LIMIT_REACHED");
    okR(await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: c.version, rate: rateOf({ id: c.rateIds[0], valueBp: 2 }) }), "แก้แถวเดิมตอนเต็ม");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentRate" WHERE "rateCardId" = $1`, [c.id]))[0]?.n, lim, "จำนวนแถว");
  });
  await st("R-13", "อินพุตขยะไม่ทำให้ throw: null · อาร์เรย์ · id เป็นอ็อบเจ็กต์/มี NUL/ยาวมาก · expectedVersion ไม่ใช่จำนวนเต็ม · ctx ผิดรูป ⇒ ผลเป็น AgencyFail (VALIDATION/NOT_FOUND/FORBIDDEN) ทุกตัว", async () => {
    needBuilt(); needDb();
    const junk: unknown[] = [null, [], "x", 1, { cardId: null }, { cardId: { $ne: "" }, expectedVersion: 1 }, { cardId: "a\u0000b", expectedVersion: 1 }, { cardId: "x".repeat(5000), expectedVersion: 1 }, { cardId: cardR.id, expectedVersion: 1.5 }, { cardId: cardR.id, expectedVersion: "1" }, { cardId: cardR.id, expectedVersion: -1 }, { __proto__: { cardId: cardR.id } }];
    for (const fnName of ["getAgentRateCard", "updateAgentRateCard", "setAgentRateCardStatus", "upsertAgentRate", "setAgentRateActive", "createAgentRateCard", "setAgentAccountTier", "tryAgentPrice", "listAgentRateCards"]) {
      for (const j of junk) {
        if (fnName === "listAgentRateCards" && (j === null || (asRec(j) && Object.keys(R(j)).length === 0))) continue;
        const r = await shop(fnName, cA(), j);
        ok(r.ok === false && ["VALIDATION", "NOT_FOUND", "FORBIDDEN"].includes(String(r.code)), `${fnName}(${fmt(j).slice(0, 60)}): ${fmt(r)}`);
      }
    }
    for (const c of [null, {}, { tenantId: tA }, { tenantId: tA, actorUserId: null }, { tenantId: null, actorUserId: staff.OA.userId }]) { const r = await shop("getAgentRateCard", c, { cardId: cardR.id }); ok(r.ok === false && r.code === "FORBIDDEN", `ctx ${fmt(c)}: ${fmt(r)}`); }
  });
  await st("R-14", "มติ Z2: แถวถาวร + แถว travelTo อย่างเดียว (ไม่ส่ง id · คีย์มิติชน) ⇒ VALIDATION RATE_OVERLAP · แถวถาวรไม่เปลี่ยนแม้ไบต์เดียว · version/audit ไม่ขยับ · ร่างในเครื่องลองคิดได้ผลเดียวกับตอนบันทึก (ชน ⇒ RATE_OVERLAP · ซ้ำทุกช่อง ⇒ เท่ากับแถวเดียว) · แถวเปิดต้นแบบ travelFrom 1900-01-01 ⇒ รับ", async () => {
    needBuilt(); needDb();
    await mkAccount("Z2", tA); await setTierRaw("Z2", "B");
    const perm = rateOf({ valueBp: 1000 }), until = rateOf({ valueBp: 2000, travelTo: "2027-02-28" });
    const c = await mkCard(agentOwner("Z2"), [perm], { activate: false });
    const permJson = async () => (await q<{ j: string }>(`SELECT row_to_json(r)::text AS j FROM "AgentRate" r WHERE id = $1`, [c.rateIds[0]]))[0]?.j;
    const j0 = await permJson(), a0 = (await auditRows(tA)).length;
    const saved = await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: c.version, rate: until });
    failR(saved, "VALIDATION", "บันทึก travelTo อย่างเดียวข้างแถวถาวร", "RATE_OVERLAP");
    eq([await permJson(), (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentRate" WHERE "rateCardId" = $1`, [c.id]))[0]?.n, await cardVer(c.id), (await auditRows(tA)).length], [j0, 1, c.version, a0], "แถวถาวรไม่เปลี่ยน");
    const tried = await shop("tryAgentPrice", cA(), { agentAccountId: acc("Z2").id, unitId: uA, productId: PRD.A.id, slotId: depMain, pax: [{ paxTypeId: PRD.A.pt.ADULT, qty: 2 }], at: NOW.toISOString(), draft: { ownerKind: "AGENT", rates: [perm, until] } });
    eq(tried, saved, "ร่าง = ตอนบันทึก (ทุกไบต์)");
    const one = okR(await shop("tryAgentPrice", cA(), { agentAccountId: acc("Z2").id, unitId: uA, productId: PRD.A.id, slotId: depMain, pax: [{ paxTypeId: PRD.A.pt.ADULT, qty: 2 }], at: NOW.toISOString(), draft: { ownerKind: "AGENT", rates: [perm] } }), "ร่างแถวเดียว");
    const twice = okR(await shop("tryAgentPrice", cA(), { agentAccountId: acc("Z2").id, unitId: uA, productId: PRD.A.id, slotId: depMain, pax: [{ paxTypeId: PRD.A.pt.ADULT, qty: 2 }], at: NOW.toISOString(), draft: { ownerKind: "AGENT", rates: [perm, perm] } }), "ร่างแถวซ้ำทุกช่อง");
    eq(JSON.stringify(twice), JSON.stringify(one), "ร่างซ้ำทุกช่อง = แถวเดียว (บันทึกจริงก็ได้ผลซ้ำ)");
    eq(com(R(one.priced)).rateBp, 1_000, "ร่างแถวเดียวใช้ 10%");
    okR(await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: c.version, rate: rateOf({ valueBp: 2000, travelFrom: "1900-01-01", travelTo: "2027-02-28" }) }), "แถวเปิดต้นแบบ 1900-01-01");
    eq(await permJson(), j0, "แถวถาวรยังเดิม");
  });
  await st("R-15", "มติ Z8: ปี 0000 / 1899 / 2201 ในทุกช่องวันที่ (แถวราคา · ช่วงมีผลของ card ตอนสร้าง/แก้ · ร่าง · วันจองสมมติของเครื่องลองคิด) ⇒ VALIDATION BAD_INPUT ไม่ถึงฐาน · ไม่มี OpsEvent ใหม่ · ปี 1900 / 2200 ⇒ รับ", async () => {
    needBuilt(); needDb();
    await mkAccount("Z8", tA);
    const ops = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]))[0]?.n;
    const o0 = await ops();
    const c = await mkCard(agentOwner("Z8"), [], { activate: false });
    const tz8 = (o: Rec) => ({ agentAccountId: acc("Z8").id, unitId: uA, productId: PRD.A.id, slotId: depMain, pax: [{ paxTypeId: PRD.A.pt.ADULT, qty: 1 }], at: NOW.toISOString(), ...o });
    for (const d of ["0000-01-01", "1899-12-31", "2201-01-01"]) {
      failR(await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: c.version, rate: rateOf({ travelFrom: d, travelTo: d }) }), "VALIDATION", `แถว travel ${d}`, "BAD_INPUT");
      failR(await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: c.version, rate: rateOf({ bookFrom: d }) }), "VALIDATION", `แถว bookFrom ${d}`, "BAD_INPUT");
      failR(await shop("createAgentRateCard", cA(), { owner: agentOwner("Z8"), name: "z8", validFrom: d }), "VALIDATION", `card validFrom ${d}`, "BAD_INPUT");
      failR(await shop("updateAgentRateCard", cA(), { cardId: c.id, expectedVersion: c.version, patch: { validTo: d } }), "VALIDATION", `แก้ card validTo ${d}`, "BAD_INPUT");
      failR(await shop("tryAgentPrice", cA(), tz8({ at: `${d}T12:00:00.000Z` })), "VALIDATION", `วันจองสมมติ ${d}`, "BAD_INPUT");
      failR(await shop("tryAgentPrice", cA(), tz8({ draft: { ownerKind: "AGENT", validTo: d, rates: [] } })), "VALIDATION", `ร่าง validTo ${d}`, "BAD_INPUT");
      failR(await shop("tryAgentPrice", cA(), tz8({ draft: { ownerKind: "AGENT", rates: [rateOf({ travelTo: d })] } })), "VALIDATION", `ร่างแถว ${d}`, "BAD_INPUT");
    }
    eq([await cardVer(c.id), (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentRate" WHERE "rateCardId" = $1`, [c.id]))[0]?.n], [c.version, 0], "ไม่มีการเขียนจากวันที่นอกช่วง");
    const r1 = okR(await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: c.version, rate: rateOf({ travelFrom: "1900-01-01", travelTo: "1900-01-01" }) }), "ปี 1900");
    okR(await shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: Number(R(r1.card).version), rate: rateOf({ travelFrom: "2200-12-31", travelTo: "2200-12-31" }) }), "ปี 2200");
    okR(await shop("createAgentRateCard", cA(), { owner: agentOwner("Z8"), name: "z8 ok", validFrom: "1900-01-01", validTo: "2200-12-31" }), "card 1900–2200");
    eq(await ops(), o0, "OpsEvent ใหม่");
  });
  await st("R-16", "มติ Z9: setAgentRateActive ด้วยค่าเดิม (เปิดอยู่แล้วสั่งเปิด / ปิดอยู่แล้วสั่งปิด) ⇒ ok + replayed · version ไม่ขยับ · ไม่มี audit · ค่าใหม่ ⇒ replayed false + version +1 + audit 1", async () => {
    needBuilt(); needDb();
    await mkAccount("Z9", tA);
    const c = await mkCard(agentOwner("Z9"), [rateOf({ valueBp: 900 })], { activate: false });
    const au = async () => (await auditRows(tA)).length;
    const a0 = await au();
    const same = okR(await shop("setAgentRateActive", cA(), { cardId: c.id, expectedVersion: c.version, rateId: c.rateIds[0], active: true }), "เปิดซ้ำ");
    eq([same.replayed, R(same.card).version, R(same.rate).active, await cardVer(c.id), await au()], [true, c.version, true, c.version, a0], "เปิดซ้ำ = ผลซ้ำ");
    const off = okR(await shop("setAgentRateActive", cA(), { cardId: c.id, expectedVersion: c.version, rateId: c.rateIds[0], active: false }), "ปิด");
    eq([off.replayed, R(off.card).version, await au()], [false, c.version + 1, a0 + 1], "ปิดจริง");
    const off2 = okR(await shop("setAgentRateActive", cA(), { cardId: c.id, expectedVersion: c.version + 1, rateId: c.rateIds[0], active: false }), "ปิดซ้ำ");
    eq([off2.replayed, R(off2.card).version, await cardVer(c.id), await au()], [true, c.version + 1, c.version + 1, a0 + 1], "ปิดซ้ำ = ผลซ้ำ");
  });
  groupLine("R");

  // ═══════════════ PM. สิทธิ์ ═══════════════
  console.log("\n── PM: สิทธิ์ ──");
  const WRITES = (): [string, Rec][] => [["createAgentRateCard", { owner: tierOwner("C"), name: "pm" }], ["updateAgentRateCard", { cardId: cardR.id, expectedVersion: cardR.version, patch: { priority: 1 } }], ["setAgentRateCardStatus", { cardId: cardR.id, expectedVersion: cardR.version, action: "ARCHIVE" }],
    ["upsertAgentRate", { cardId: cardR.id, expectedVersion: cardR.version, rate: rateOf({ valueBp: 1 }) }], ["setAgentRateActive", { cardId: cardR.id, expectedVersion: cardR.version, rateId: rPct, active: false }], ["setAgentAccountTier", { agentAccountId: ACC.T1?.id ?? "x", tierCode: "C", expectedUpdatedAt: new Date().toISOString() }]];
  const READS = (): [string, Rec][] => [["listAgentRateCards", {}], ["getAgentRateCard", { cardId: cardR.id }], ["tryAgentPrice", { agentAccountId: ACC.X?.id ?? "x", unitId: uA, productId: PRD.A?.id ?? "x", slotId: depMain, pax: [{ paxTypeId: PRD.A?.pt.ADULT ?? "x", qty: 2 }], at: NOW.toISOString() }]];
  await st("PM-1", "ไม่มีสิทธิ์ (STAFF ไม่มีคีย์): อ่านและเขียนทุกตัว ⇒ FORBIDDEN · ตรวจสิทธิ์ก่อนแตะ id (id ไม่มีก็ FORBIDDEN ไม่ใช่ NOT_FOUND) · ensureAgentTiers/listAgentTiers ⇒ FORBIDDEN", async () => {
    needBuilt(); ok(cardR.id, "ไม่มี card");
    const c = ctxOf(tA, staff.NONE);
    for (const [fnName, input] of [...WRITES(), ...READS()]) failR(await shop(fnName, c, input), "FORBIDDEN", `${fnName} (ไม่มีสิทธิ์)`);
    failR(await shop("getAgentRateCard", c, { cardId: "nope_zzz" }), "FORBIDDEN", "id ไม่มี");
    failR(await shop("ensureAgentTiers", c), "FORBIDDEN", "ensureAgentTiers"); failR(await shop("listAgentTiers", c), "FORBIDDEN", "listAgentTiers");
  });
  await st("PM-2", "agency.rate.view อย่างเดียว: อ่าน + ลองคิดได้ · เขียนทุกตัว ⇒ FORBIDDEN และฐานไม่เปลี่ยน", async () => {
    needBuilt(); await setTierRaw("X", "A"); ok(cardR.id, "ไม่มี card");
    const c = ctxOf(tA, staff.VIEW); const before = await writeCounts();
    for (const [fnName, input] of READS()) okR(await shop(fnName, c, input), `${fnName} (view)`);
    okR(await shop("listAgentTiers", c), "listAgentTiers (view)");
    for (const [fnName, input] of WRITES()) failR(await shop(fnName, c, input), "FORBIDDEN", `${fnName} (view)`);
    failR(await shop("ensureAgentTiers", c), "FORBIDDEN", "ensureAgentTiers (view)");
    eq(await writeCounts(), before, "ฐานเปลี่ยน");
  });
  await st("PM-3", "agency.rate.edit + ไม่จำกัดสาขา (STAFF): สร้าง card · ใส่แถว · เปิดใช้ ได้ · audit actorId = ผู้กระทำ", async () => {
    needBuilt(); needDb();
    const c = await mkCard(agentOwner("S2"), [rateOf({ valueBp: 1234 })], { ctx: ctxOf(tA, staff.EDIT), validFrom: "2033-01-01", validTo: "2033-12-31" });
    ok(c.version >= 3, "version");
    const rows = (await auditRows(tA)).filter((r) => R(r.after).cardId === c.id);
    ok(rows.length >= 3 && rows.every((r) => r.actorId === staff.EDIT.userId), `audit ของ card: ${fmt(rows.map((r) => [r.action, r.actorId]))}`);
  });
  await st("PM-4", "ผู้ใช้จำกัดสาขา (มี view+edit · unitAccess = หน่วยที่สอง): เขียน ⇒ FORBIDDEN · card ของระดับอ่านได้ · card ของเอเจนซี่ที่ unitIds = หน่วยแรก ⇒ NOT_FOUND (รูปเดียวกับ id ไม่มี) · ลองคิดกับบัญชีนั้น ⇒ NOT_FOUND", async () => {
    needBuilt(); needDb();
    const c = ctxOf(tA, staff.RESTR);
    for (const [fnName, input] of WRITES()) failR(await shop(fnName, c, input), "FORBIDDEN", `${fnName} (จำกัดสาขา)`);
    okR(await shop("getAgentRateCard", c, { cardId: cardR.id }), "card ระดับ");
    const ru = await mkCard(agentOwner("RU"), [rateOf({ valueBp: 1777 })]);
    const a = await shop("getAgentRateCard", c, { cardId: ru.id }), b = await shop("getAgentRateCard", c, { cardId: "nope_zzz" });
    failR(a, "NOT_FOUND", "card ของบัญชีที่มองไม่เห็น"); eq(a, b, "= id ไม่มี");
    ok(!A(okR(await shop("listAgentRateCards", c, {}), "list").items).some((x) => x.id === ru.id), "รายการมี card ที่มองไม่เห็น");
    failR(await shop("tryAgentPrice", c, { agentAccountId: acc("RU").id, unitId: uA, productId: PRD.A.id, slotId: depMain, pax: [{ paxTypeId: PRD.A.pt.ADULT, qty: 2 }], at: NOW.toISOString() }), "NOT_FOUND", "ลองคิดบัญชีที่มองไม่เห็น");
    okR(await shop("getAgentRateCard", cA(), { cardId: ru.id }), "เจ้าของเห็น");
  });
  await st("PM-5", "คนนอกร้าน (เจ้าของร้าน B ใส่ tenantId ร้าน A): อ่าน/เขียนทุกตัว ⇒ FORBIDDEN", async () => {
    needBuilt(); ok(cardR.id, "ไม่มี card");
    const c = { tenantId: tA, actorUserId: staff.OB.userId };
    for (const [fnName, input] of [...WRITES(), ...READS()]) failR(await shop(fnName, c, input), "FORBIDDEN", `${fnName} (คนนอก)`);
  });
  groupLine("PM");

  // ═══════════════ E. ราคาจริงบนฐาน ═══════════════
  console.log("\n── E: ราคาจริงบนฐาน (port ตัวจริง · สตางค์ตรงตัว) ──");
  const nums = (v: Rec) => [tot(v).payableSatang, com(v).baseSatang, com(v).commissionSatang, com(v).commissionVatSatang, wht(v).whtSatang, com(v).remitToShopSatang];
  await st("E-1", "ค่าเริ่มของระดับ B (ไม่มีแถวราคาของสินค้านี้ที่ใช้ได้ ณ วันเดินทาง): ภาพ 10 — เก็บลูกค้า 8,200 · ฐาน 7,000 (ไม่รวมอุทยาน) · คอมฯ 1,050 · หัก 31.50 · ส่งร้าน 7,181.50 · rateSource TIER", async () => {
    needBuilt(); needDb(); await setTierRaw("XT", "B");
    const v = V(await quoteAgent(acc("XT").id, depMain), "quote");
    eq(nums(v), [AC.collectSatang, AC.commissionBaseSatang, AC.commissionSatang, 0, AC.whtSatang, AC.toShopSatang], "ภาพ 10");
    eq([com(v).rateSource, com(v).mode, com(v).vatMode, com(v).collectMode, wht(v).payeeType, wht(v).payerType, com(v).agentAccountId, com(v).agentTierId], ["TIER", "COMMISSION_PCT", "NONE", "AGENT_COLLECTS", "TH_JURISTIC", "JURISTIC", acc("XT").id, (await tiers()).B], "ที่มา");
    eq(com(v).refId, `tier:${(await tiers()).B}:A1`, "refId");
  });
  await st("E-2", "card ของระดับ A (แถว 12% ที่ R-4 ตั้งไว้ · เปิดใช้แล้ว · ชนะค่าเริ่ม 20% ของระดับ): คอมฯ 840.00 · หัก 25.20 · ส่งร้าน 7,385.20 · refId = \"<rateId>@<version>\" ของ card ปัจจุบัน · เอเจนซี่ระดับ C ไม่ได้อัตรานี้ (10% = 700.00)", async () => {
    needBuilt(); needDb(); ok(cardR.id && rPct, "ไม่มี card (R-1/R-4)");
    await setTierRaw("X", "A"); await setTierRaw("S1", "C");
    const s = okR(await shop("setAgentRateCardStatus", cA(), { cardId: cardR.id, expectedVersion: cardR.version, action: "ACTIVATE" }), "ACTIVATE"); cardR.version = Number(R(s.card).version);
    const v = V(await quoteAgent(acc("X").id, depMain), "quote A");
    eq(nums(v), [AC.collectSatang, 700_000, 84_000, 0, 2_520, 820_000 - 84_000 + 2_520], "12%");
    eq([com(v).refId, com(v).rateSource, com(v).rateBp], [`${rPct}@${cardR.version}`, "TIER", 1200], "refId");
    eq(nums(V(await quoteAgent(acc("S1").id, depMain), "quote C")), [AC.collectSatang, 700_000, 70_000, 0, 2_100, 820_000 - 70_000 + 2_100], "ระดับ C");
  });
  let cardXC = { id: "", version: 0, rateIds: [] as string[] };
  await st("E-3", "สัญญาเฉพาะเอเจนซี่ 18% ชนะระดับ: คอมฯ 1,260.00 · หัก 37.80 · rateSource CONTRACT · เอเจนซี่ระดับ A ที่ไม่มีสัญญายังได้ 12% จาก card ของระดับ · บรรทัดที่นั่งยังเป็นราคาปลีก (priceSource ไม่ใช่ CONTRACT)", async () => {
    needBuilt(); needDb(); await setTierRaw("XC", "B");
    cardXC = await mkCard(agentOwner("XC"), [rateOf({ valueBp: 1800 })]);
    const v = V(await quoteAgent(acc("XC").id, depMain), "quote");
    eq(nums(v), [AC.collectSatang, 700_000, 126_000, 0, 3_780, 820_000 - 126_000 + 3_780], "18%");
    eq([com(v).rateSource, com(v).refId], ["CONTRACT", `${cardXC.rateIds[0]}@${cardXC.version}`], "ที่มา");
    eq(com(V(await quoteAgent(acc("X").id, depMain), "อีกราย")).commissionSatang, 84_000, "อีกราย");
    const seat = A(v.items).find((i) => i.kind === "SEAT");
    eq([seat?.unitMinor, seat?.priceSource !== "CONTRACT"], [ADULT, true], "ราคาที่นั่ง");
  });
  await st("E-4", "ราคาเน็ต (สัญญา · ผู้ใหญ่ 2,800 · เด็กไม่มีแถว): ที่นั่งผู้ใหญ่ราคา 2,800 จากขั้น CONTRACT · เด็กยังราคาปลีก 2,450 · ไม่มีคอมฯ · เอเจนซี่ส่งร้าน = เน็ต + อุทยาน (TA §2.2: 2,800 + 600 ต่อคน)", async () => {
    needBuilt(); needDb(); await setTierRaw("XN", "B");
    await mkCard(agentOwner("XN"), [{ productKind: "TRIP", productId: PRD.A.id, mode: "NET", valueMinor: 280_000, paxTypeId: PRD.A.pt.ADULT, minSellMinor: 330_000 }]);
    const v = V(await quoteAgent(acc("XN").id, depMain), "quote 2A");
    const seat = A(v.items).find((i) => i.kind === "SEAT" && i.paxTypeCode === "ADULT");
    eq([seat?.unitMinor, seat?.priceSource, com(v).mode, com(v).commissionSatang, wht(v).whtSatang, tot(v).payableSatang, com(v).remitToShopSatang], [280_000, "CONTRACT", "NET", 0, 0, 2 * 280_000 + AC.parkSatang, 2 * (280_000 + RACHA.parkAdultSatang)], "เน็ต");
    const v2 = V(await quoteAgent(acc("XN").id, depMain, { children: 1 }), "quote 2A+1C");
    const child = A(v2.items).find((i) => i.kind === "SEAT" && i.paxTypeCode === "CHILD");
    eq([child?.unitMinor, child?.priceSource !== "CONTRACT", Number(tot(v2).payableSatang) - Number(tot(v2).passThroughSatang)], [CHILD, true, 2 * 280_000 + CHILD], "เด็กราคาปลีก");
  });
  await st("E-5", "คอมฯ บาทต่อที่นั่ง (200 บาท): 2 ผู้ใหญ่ ⇒ 400.00 · 2 ผู้ใหญ่ + 1 เด็ก ⇒ 600.00 · หักคิดจากคอมฯ · ส่งร้าน = เก็บลูกค้า − คอมฯ + หัก", async () => {
    needBuilt(); needDb(); await setTierRaw("XF", "B");
    await mkCard(agentOwner("XF"), [{ productKind: "TRIP", productId: PRD.A.id, mode: "COMMISSION_FIXED", valueMinor: 20_000 }], { validFrom: "2026-01-01", validTo: "2026-12-31" });
    const v = V(await quoteAgent(acc("XF").id, depMain), "2A"), v2 = V(await quoteAgent(acc("XF").id, depMain, { children: 1 }), "2A+1C");
    eq([com(v).mode, com(v).commissionSatang, wht(v).whtSatang, com(v).remitToShopSatang], ["COMMISSION_FIXED", 40_000, refBp(40_000, 300), 820_000 - 40_000 + refBp(40_000, 300)], "2A");
    eq([com(v2).commissionSatang, wht(v2).whtSatang, com(v2).remitToShopSatang], [60_000, refBp(60_000, 300), Number(tot(v2).payableSatang) - 60_000 + refBp(60_000, 300)], "2A+1C");
  });
  await st("E-6", "ช่วงพิเศษปีใหม่ 20 ธ.ค.–5 ม.ค. คอมฯ 10% (แถวของ card ระดับ A): เดินทาง 19 ธ.ค. ⇒ 12% · 20 ธ.ค. ⇒ 10% · 5 ม.ค. ⇒ 10% · 6 ม.ค. ⇒ 12% · 25 ธ.ค. มีแถว priority 5 (7%) ชนะ · 8 ม.ค. = 8.5% (แถวที่ R-8 เพิ่ม)", async () => {
    needBuilt(); needDb(); ok(rSp, "ไม่มีแถวช่วงพิเศษ (R-4)"); await setTierRaw("X", "A");
    const out: number[] = [];
    for (const d of ["2026-12-19", "2026-12-20", "2027-01-05", "2027-01-06", "2026-12-25", "2027-01-08"]) out.push(Number(com(V(await quoteAgent(acc("X").id, await mkDep(d)), d)).rateBp));
    eq(out, [1200, 1000, 1000, 1200, 700, 850], "อัตราตามวันเดินทาง");
    const v = V(await quoteAgent(acc("X").id, await mkDep("2026-12-31")), "31 ธ.ค.");
    eq([com(v).commissionSatang, com(v).refId], [70_000, `${rSp}@${cardR.version}`], "คอมฯ ช่วงพิเศษ");
  });
  await st("E-7", "วันมีผลตามเขตเวลาของหน่วย: card มีผล 1 ก.พ. 2570 — หน่วยเวลาไทย: 31 ม.ค. 23:59 ไทย ยังไม่ใช้ · 1 ก.พ. 00:30 ไทย (= 31 ม.ค. 17:30Z) ใช้ · หน่วยเขต UTC: 31 ม.ค. 17:30Z ยังไม่ใช้ · 1 ก.พ. 00:00Z ใช้ · วันสุดท้าย (28 ก.พ.) ใช้ วันถัดไปไม่ใช้", async () => {
    needBuilt(); needDb(); await setTierRaw("XT", "B");
    await mkCard(agentOwner("XT"), [rateOf({ valueBp: 2000 }), { productKind: "TRIP", productId: PRD.A2.id, mode: "COMMISSION_PCT", valueBp: 2000 }], { validFrom: "2027-02-01", validTo: "2027-02-28" });
    const dA = await mkDep("2027-04-10"), dA2 = await mkDep("2027-04-10", "A2");
    const rate = async (iso: string, key: "A" | "A2") => Number(com(V(await quoteAgent(acc("XT").id, key === "A" ? dA : dA2, { key, now: new Date(iso) }), `${key} ${iso}`)).rateBp);
    eq([await rate("2027-01-31T16:59:00Z", "A"), await rate("2027-01-31T17:30:00Z", "A"), await rate("2027-02-28T16:59:00Z", "A"), await rate("2027-02-28T17:00:00Z", "A")], [1500, 2000, 2000, 1500], "หน่วยเวลาไทย");
    eq([await rate("2027-01-31T17:30:00Z", "A2"), await rate("2027-02-01T00:00:00Z", "A2"), await rate("2027-02-28T23:59:00Z", "A2"), await rate("2027-03-01T00:00:00Z", "A2")], [1500, 2000, 2000, 1500], "หน่วยเขต UTC");
  });
  await st("E-8", "ขอบอัตรา: 0% ⇒ คอมฯ 0 หัก 0 ส่งร้านเท่ายอดเก็บ · 100% ⇒ คอมฯ = ฐาน 7,000 (ไม่เกินฐาน · ไม่แตะอุทยาน) หัก 210 ส่งร้าน 1,410 · ช่วงวันจอง: หมดเขตวันนี้ยังใช้ พรุ่งนี้ไม่ใช้", async () => {
    needBuilt(); needDb(); await setTierRaw("S2", "C");
    const c = await mkCard(agentOwner("S2"), [rateOf({ valueBp: 0 }), rateOf({ valueBp: 10_000, travelFrom: "2027-05-01", travelTo: "2027-05-31" }), rateOf({ valueBp: 3300, bookFrom: "2026-11-01", bookTo: TODAY, travelFrom: "2027-07-01", travelTo: "2027-07-31" })], { validFrom: "2026-01-01", validTo: "2026-12-31" });
    ok(c.id, "card");
    const v0 = V(await quoteAgent(acc("S2").id, depMain), "0%");
    eq(nums(v0), [820_000, 700_000, 0, 0, 0, 820_000], "0%");
    const v100 = V(await quoteAgent(acc("S2").id, await mkDep("2027-05-10")), "100%");
    eq(nums(v100), [820_000, 700_000, 700_000, 0, 21_000, 141_000], "100%");
    const dJ = await mkDep("2027-07-10");
    eq([com(V(await quoteAgent(acc("S2").id, dJ, { now: BKK(TODAY, "23:59") }), "วันสุดท้าย")).rateBp, com(V(await quoteAgent(acc("S2").id, dJ, { now: BKK(addDaysYmd(TODAY, 1), "00:01") }), "พรุ่งนี้")).rateBp], [3300, 0], "ช่วงวันจอง");
  });
  await st("E-9", "แถวเจาะจงตัวเลือกชนะแถวไม่ระบุเฉพาะรอบของตัวเลือกนั้น · สินค้าที่ไม่มีแถว ⇒ ค่าเริ่มของระดับ", async () => {
    needBuilt(); needDb(); await setTierRaw("Y", "C");
    await mkCard(agentOwner("Y"), [rateOf({ valueBp: 1600 }), rateOf({ valueBp: 2100, optionId: PRD.A.opt2 })], { validFrom: "2026-01-01", validTo: "2026-12-31" });
    const d2 = await mkDep("2027-08-10", "A", "opt2"), dOther = await mkDep("2027-08-10", "A2");
    eq([com(V(await quoteAgent(acc("Y").id, depMain), "ตัวเลือกหลัก")).rateBp, com(V(await quoteAgent(acc("Y").id, d2, { opt: "opt2" }), "ตัวเลือกสอง")).rateBp, com(V(await quoteAgent(acc("Y").id, dOther, { key: "A2" }), "สินค้าอื่น")).rateBp, com(V(await quoteAgent(acc("Y").id, dOther, { key: "A2" }), "สินค้าอื่น")).rateSource], [1600, 2100, 1000, "TIER"], "ตัวเลือก");
  });
  await st("E-10", "มติ Z1 ผ่านตัวโหลดจริง (trips.loadPricingInput → port ตัวจริง): Liveaboard สกุล THB จองเป็น USD + สัญญาเน็ต THB ⇒ แถวไม่ถูกเลือก (contract null) และขั้นต่ำ A7 ไม่ถูกใช้ · จองเป็น THB (หรือไม่ระบุสกุล) ⇒ ถูกเลือก + ขั้นต่ำ A7 · Liveaboard สกุล USD จองเป็น USD + แถว USD ⇒ ถูกเลือกแต่ไม่ใช้ A7 (A7 ใช้เฉพาะบาท) · quote จริงสกุล THB ได้ราคาเน็ตจากสัญญา", async () => {
    needBuilt(); needDb(); await install();
    const mkLa = async (key: string, currency: string, adult: number) => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      await ins("TripProduct", { id, tenantId: tA, unitId: uA, slug: `a13qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "LIVEABOARD", sourceKind: "OWN", status: "ACTIVE", title: { th: `ทดสอบ ${key}` }, body: {}, currency, deepDive: false, crossBorder: false, updatedAt: new Date() });
      await ins("TripOption", { id: o, tenantId: tA, unitId: uA, productId: id, name: { th: "ทริป" }, durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt: Record<string, string> = {};
      for (const [i, code] of ["ADULT", "CHILD"].entries()) pt[code] = await ins("TripPaxType", { id: rid(`pt${code}`), tenantId: tA, unitId: uA, productId: id, code, label: { th: code }, countsCapacity: true, active: true, sortOrder: i, updatedAt: new Date() });
      for (const code of ["ADULT", "CHILD"]) await ins("TripPrice", { id: rid("pr"), tenantId: tA, unitId: uA, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency, amountMinor: adult, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt: o, opt2: o, unit: uA, tenant: tA, pt };
    };
    await mkLa("LT", "THB", ADULT); await mkLa("LU", "USD", 12_000);
    await mkAccount("LA", tA);
    const A7 = 340_000;
    await setV(tA, [{ key: "agency.price.minResalePrice", scope: "AGENT", scopeId: acc("LA").id, value: A7 }]);
    await mkCard(agentOwner("LA"), [{ productKind: "TRIP", productId: PRD.LT.id, mode: "NET", valueMinor: 300_000 }, { productKind: "TRIP", productId: PRD.LU.id, mode: "NET", valueMinor: 9_000, currency: "USD" }]);
    const dT = await mkDep(DEP_DATE, "LT"), dU = await mkDep(DEP_DATE, "LU");
    const load = async (key: string, depId: string, currency?: string) => V(await callTr("loadPricingInput", agentCtx(acc("LA").id), { ...line(depId, { key, adults: 1 }), ...(currency ? { currency } : {}) }), `loadPricingInput ${key} ${currency ?? "-"}`);
    const ag = (v: Rec) => R(v.agency);
    const usd = await load("LT", dT, "USD");
    // (A7 อยู่ใน policySnapshot.values เสมอ — "ไม่ถูกใช้" = ไม่มีชั้นใดได้ minSellMinor จากมัน)
    eq([usd.currency, ag(usd).agentAccountId, ag(usd).contract, ag(usd).tier, R(R(ag(usd).policySnapshot).values)["agency.price.minResalePrice"]], ["USD", acc("LA").id, null, null, A7], "THB สินค้า จอง USD: แถว THB ไม่ถูกเลือก · ขั้นต่ำ A7 ไม่ถูกใช้");
    const thb = await load("LT", dT, "THB"), dflt = await load("LT", dT);
    eq([R(ag(thb).contract).mode, R(ag(thb).contract).unitMinorByPaxCode, R(ag(thb).contract).minSellMinor], ["NET", { ADULT: 300_000, CHILD: 300_000 }, A7], "THB สินค้า จอง THB: ถูกเลือก + A7");
    eq(ag(dflt).contract, ag(thb).contract, "ไม่ระบุสกุล = สกุลของสินค้า");
    const uu = await load("LU", dU, "USD");
    eq([R(ag(uu).contract).mode, R(ag(uu).contract).unitMinorByPaxCode, R(ag(uu).contract).minSellMinor], ["NET", { ADULT: 9_000, CHILD: 9_000 }, null], "USD สินค้า จอง USD: แถว USD ถูกเลือก · A7 ไม่ใช้กับสกุลอื่น");
    eq(ag(await load("LU", dU, "THB")).contract, null, "USD สินค้า จอง THB: แถว USD ไม่ถูกเลือก");
    const real = V(await quoteAgent(acc("LA").id, dT, { key: "LT", adults: 1 }), "quote THB");
    const seat = A(real.items).find((i) => i.kind === "SEAT");
    eq([seat?.unitMinor, seat?.priceSource, com(real).mode], [300_000, "CONTRACT", "NET"], "quote จริงสกุล THB");
  });
  groupLine("E");

  // ═══════════════ X. แยกร้าน / แยกเอเจนซี่ ═══════════════
  console.log("\n── X: แยกร้านและแยกเอเจนซี่ ──");
  await st("X-1", "ร้าน B แตะ card ของร้าน A ไม่ได้: get/update/status/upsert/setActive ⇒ NOT_FOUND รูปเดียวกับ id ที่ไม่มี · card ของ A ไม่เปลี่ยน · รายการของ B ไม่มี card ของ A", async () => {
    needBuilt(); ok(cardR.id, "ไม่มี card"); await tiers(tB);
    const v = await cardVer(cardR.id);
    for (const [fnName, mkIn] of [["getAgentRateCard", (id: string) => ({ cardId: id })], ["updateAgentRateCard", (id: string) => ({ cardId: id, expectedVersion: v, patch: { priority: 7 } })], ["setAgentRateCardStatus", (id: string) => ({ cardId: id, expectedVersion: v, action: "ARCHIVE" })],
      ["upsertAgentRate", (id: string) => ({ cardId: id, expectedVersion: v, rate: { productKind: "TRIP", productId: PRD.B.id, mode: "COMMISSION_PCT", valueBp: 1 } })], ["setAgentRateActive", (id: string) => ({ cardId: id, expectedVersion: v, rateId: rPct, active: false })]] as const) {
      const a = await shop(fnName, cB(), mkIn(cardR.id)), b = await shop(fnName, cB(), mkIn("nope_zzz"));
      failR(a, "NOT_FOUND", `${fnName} ข้ามร้าน`); eq(a, b, `${fnName}: ต้องเท่ากับ id ไม่มี`);
    }
    eq([await cardVer(cardR.id), (await q<{ status: string }>(`SELECT status FROM "AgentRateCard" WHERE id = $1`, [cardR.id]))[0]?.status, (await q<{ active: boolean }>(`SELECT active FROM "AgentRate" WHERE id = $1`, [rPct]))[0]?.active], [v, "ACTIVE", true], "card ของ A");
    const lb = JSON.stringify(okR(await shop("listAgentRateCards", cB(), {}), "list B"));
    eq(leaks(lb, [MARK_CARD, cardR.id]), [], "รายการของ B");
    failR(await shop("listAgentRateCards", cB(), { owner: { kind: "AGENT", agentAccountId: acc("X").id } }), "NOT_FOUND", "กรองด้วยบัญชีร้านอื่น");
  });
  await st("X-2", "ราคาสัญญาของเอเจนซี่อื่นไม่มีผล: Y มีสัญญา 16% / XN มีเน็ต 2,800 — X (ระดับ A ไม่มีสัญญา) ยังได้ 12% ราคาปลีก · เอเจนซี่เดียวกัน (ตัวตนเดียวกัน) ที่ร้าน B มีสัญญา 99% — ราคาที่ร้าน A ไม่เปลี่ยน และที่ร้าน B ได้ 99% ของสินค้าร้าน B", async () => {
    needBuilt(); needDb(); await setTierRaw("X", "A"); await setTierRaw("Z", "B");
    await mkCard({ kind: "AGENT", agentAccountId: acc("Z").id }, [{ productKind: "TRIP", productId: PRD.B.id, mode: "COMMISSION_PCT", valueBp: 9900 }], { ctx: cB(), name: `${MARK_B} สัญญา` });
    const v = V(await quoteAgent(acc("X").id, depMain), "X ที่ร้าน A");
    const seat = A(v.items).find((i) => i.kind === "SEAT");
    eq([com(v).rateBp, com(v).rateSource, seat?.unitMinor], [1200, "TIER", ADULT], "X ไม่ได้รับผลของคนอื่น");
    const dB = await mkDep(DEP_DATE, "B");
    const vb = V(await quoteAgent(acc("Z").id, dB, { key: "B", tenant: tB }), "Z ที่ร้าน B");
    eq([com(vb).rateBp, com(vb).rateSource, com(vb).agentAccountId], [9900, "CONTRACT", acc("Z").id], "ร้าน B");
  });
  await st("X-3", "port คืน null ทุกกรณีที่ไม่ควรเปิด (ผลเดียวกัน ไม่บอกเหตุ): บัญชีร้านอื่น · id ไม่มี · บัญชีถูกพัก · บัญชีปิด · หน่วยนอก unitIds · มีแต่ linkId · สินค้าของหน่วยอื่น — และ quote ของ AGENT ⇒ FORBIDDEN AGENCY_NOT_ENABLED", async () => {
    needBuilt(); needDb(); await install();
    const load = fnOf(R(AGV("agencyPricingPort")), "load", "agencyPricingPort");
    const qq = (o: Rec = {}) => ({ productId: PRD.A.id, departureId: depMain, travelDate: DEP_DATE, at: NOW, ...o });
    const dA2 = await mkDep(DEP_DATE, "A2");
    const res = [await load(agentCtx(acc("Z").id), qq({ agentAccountId: acc("Z").id })), await load(agentCtx("nope"), qq({ agentAccountId: "nope_zzz" })), await load(agentCtx(acc("SU").id), qq({ agentAccountId: acc("SU").id })), await load(agentCtx(acc("CL").id), qq({ agentAccountId: acc("CL").id })),
      await load(agentCtx(acc("RU").id, { unit: uA2 }), qq({ agentAccountId: acc("RU").id, productId: PRD.A2.id, departureId: dA2 })), await load(agentCtx(acc("X").id), qq({ linkId: "lnk_1" })), await load(agentCtx(acc("X").id), qq({ agentAccountId: acc("X").id, productId: PRD.A2.id, departureId: dA2 })),
      await load(agentCtx(acc("X").id, { tenant: tB, unit: uB }), qq({ agentAccountId: acc("X").id, productId: PRD.B.id }))];
    eq(res, [null, null, null, null, null, null, null, null], "ต้อง null ทุกกรณี");
    const okLoad = R(await load(agentCtx(acc("RU").id), qq({ agentAccountId: acc("RU").id })));
    eq([okLoad.agentAccountId, asRec(okLoad.policySnapshot) !== null], [acc("RU").id, true], "positive control: หน่วยใน unitIds ได้ผล");
    for (const k of ["SU", "CL", "Z"]) { const r = await quoteAgent(acc(k).id, depMain); ok(r.ok === false && r.code === "FORBIDDEN" && R(r.details).reason === "AGENCY_NOT_ENABLED", `quote ${k}: ${fmt(r)}`); }
  });
  await st("X-4", "ผลของ port ไม่มีข้อมูลเกินจำเป็น: คีย์ชั้นบนตรงรูปของ T0.5 · ไม่มีคีย์ต้องห้าม (identityId · agentUserId · taxId* · bank*) · policySnapshot = โดเมน agency 24 คีย์ · ไม่มีชื่อ/เลขภาษีของเอเจนซี่", async () => {
    needBuilt(); needDb(); await install();
    const got = R(await fnOf(R(AGV("agencyPricingPort")), "load", "agencyPricingPort")(agentCtx(acc("X").id), { agentAccountId: acc("X").id, productId: PRD.A.id, departureId: depMain, travelDate: DEP_DATE, at: NOW }));
    eq(sortedKeys(got), ["agentAccountId", "agentTierId", "contract", "policySnapshot", "terms", "tier", "vatRegistered"], "คีย์");
    // ORACLE-EDIT X-4 (ผู้คุม 14 พ.ย.): ไม่สแกนชื่อคีย์ค่าตั้งใน policySnapshot.values (เช่น agency.crm.customerContactRoute เป็น 1 ใน 24 คีย์ที่ใบสั่ง §8 บังคับ — ไม่ใช่ข้อมูลติดต่อ)
    // ORACLE-EDIT X-4 (ผู้เขียนข้อสอบแยก · r1): การแก้เดิมตัดชื่อคีย์ออกจาก values อย่างเดียว แต่ชื่อเดียวกันยังเป็นคีย์ของ policySnapshot.sources (ป้ายที่มาของค่า) ⇒ ยังแดง
    //   เจตนา: ชื่อคีย์ค่าตั้ง 24 ตัวของโดเมน agency (ทั้งใน values และ sources) ไม่ใช่ข้อมูลหลุด — ยกเว้นเฉพาะชื่อที่ตรงตัวกับคีย์ของ values · คีย์อื่นทุกชั้นยังสแกนหาข้อมูลติดต่อ/ภาษี/ธนาคาร
    const settingKeys = new Set(Object.keys(R(R(got.policySnapshot).values)));
    eq([[...settingKeys].filter((k) => !k.startsWith("agency.")), sortedKeys(R(R(got.policySnapshot).sources)).filter((k) => !settingKeys.has(k))], [[], []], "ชื่อคีย์ค่าตั้งต้องเป็นของโดเมน agency และ sources ใช้ชุดเดียวกับ values");
    eq([...keysDeep(got)].filter((k) => !settingKeys.has(k)).filter((k) => NEVER_SHOW.includes(k) || /legalName|taxId|bank|contact|licence/i.test(k)), [], "คีย์เกิน");
    eq([R(got.policySnapshot).domain, Object.keys(R(R(got.policySnapshot).values)).length], ["agency", 24], "policySnapshot");
    ok(!JSON.stringify(got).includes(QC_MARK), "มีชื่อเอเจนซี่ในผล");
  });
  await st("X-5", "สแกนทุกผลที่ร้าน A ได้รับตลอดการรัน + audit ของร้าน A: ไม่มีเครื่องหมายของร้าน B · ไม่มีคีย์ต้องห้าม · ไม่มี id ของบัญชี/ระดับ/card ร้าน B", async () => {
    needBuilt(); ok(seenByA.length > 50, `ผลที่เก็บได้น้อยไป (${seenByA.length})`);
    const bIds = [...(await q<{ id: string }>(`SELECT id FROM "AgentRateCard" WHERE "tenantId" = $1 UNION SELECT id FROM "AgentTier" WHERE "tenantId" = $1 UNION SELECT id FROM "AgentRate" WHERE "tenantId" = $1`, [tB])).map((r) => r.id)];
    ok(bIds.length >= 4, "ร้าน B ไม่มีข้อมูลให้สแกนหา");
    const all = seenByA.join("\n");
    eq(leaks(all, [MARK_B, MARK_LEGAL, ...bIds, PRD.B.id]), [], "ผลของร้าน A");
    const bad = new Set<string>();
    for (const s of seenByA) { try { for (const k of keysDeep(JSON.parse(s))) if (NEVER_SHOW.includes(k)) bad.add(k); } catch { /* ignore */ } }
    eq([...bad], [], "คีย์ต้องห้ามในผล");
    const au = await auditRows(tA);
    eq(leaks(au.map((r) => r.j).join("\n"), [MARK_B, ...bIds]), [], "audit ของร้าน A");
  });
  await st("X-6", "มติ Z7: cursor ของ listAgentRateCards ที่เป็น card ร้านอื่น / card ที่ผู้เรียกมองไม่เห็น ⇒ ผลเท่ากับ cursor ที่ไม่มีจริงทุกไบต์ (ทั้งมี/ไม่มีตัวกรอง) · positive control: cursor ของจริงพาไปหน้าถัดไปได้", async () => {
    needBuilt(); needDb();
    const bCards = (await q<{ id: string }>(`SELECT id FROM "AgentRateCard" WHERE "tenantId" = $1 ORDER BY id`, [tB])).map((r) => r.id);
    ok(bCards.length >= 1, "ร้าน B ไม่มี card");
    const js = (r: Rec) => JSON.stringify(r);
    for (const extra of [{}, { limit: 5 }, { owner: tierOwner("B") }, { status: "ACTIVE", limit: 2 }] as Rec[]) {
      const none = okR(await shop("listAgentRateCards", cA(), { ...extra, cursor: "nope_zzz" }), "cursor ไม่มี");
      for (const id of bCards) eq(js(await shop("listAgentRateCards", cA(), { ...extra, cursor: id })), js(none), `cursor ร้าน B ${fmt(extra)}`);
    }
    const ruCard = (await q<{ id: string }>(`SELECT id FROM "AgentRateCard" WHERE "agentAccountId" = $1 ORDER BY id LIMIT 1`, [acc("RU").id]))[0]?.id;
    ok(ruCard, "ไม่มี card ของ RU (PM-4)");
    const rc = ctxOf(tA, staff.RESTR);
    eq(js(await shop("listAgentRateCards", rc, { cursor: ruCard })), js(await shop("listAgentRateCards", rc, { cursor: "nope_zzz" })), "cursor ที่มองไม่เห็น (จำกัดสาขา)");
    const p1 = okR(await shop("listAgentRateCards", cA(), { limit: 1 }), "หน้า 1");
    ok(typeof p1.nextCursor === "string", `positive control: ไม่มี nextCursor ${fmt(p1)}`);
    const p2 = okR(await shop("listAgentRateCards", cA(), { limit: 1, cursor: p1.nextCursor }), "หน้า 2");
    ok(A(p2.items).length === 1 && A(p2.items)[0].id !== A(p1.items)[0].id, `positive control: หน้า 2 ${fmt(p2)}`);
  });
  groupLine("X");

  // ═══════════════ C. พร้อมกัน / CAS ═══════════════
  console.log("\n── C: พร้อมกัน ──");
  await st("C-1", "8 คำสั่ง upsert พร้อมกันด้วย expectedVersion เดียวกัน (มิติต่างกัน): สำเร็จ 1 พอดี · ที่เหลือ STALE · version +1 พอดี · เพิ่ม 1 แถวพอดี", async () => {
    needBuilt(); needDb();
    const c = await mkCard(agentOwner("T1"), [], { activate: false });
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => shop("upsertAgentRate", cA(), { cardId: c.id, expectedVersion: c.version, rate: rateOf({ valueBp: 100 + i, travelFrom: addDaysYmd("2034-01-01", i * 10), travelTo: addDaysYmd("2034-01-05", i * 10) }) })));
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => r.ok === false && r.code === "STALE").length, await cardVer(c.id), (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentRate" WHERE "rateCardId" = $1`, [c.id]))[0]?.n], [1, 7, c.version + 1, 1], `ผล ${fmt(rs.map((r) => r.code ?? r.ok))}`);
  });
  await st("C-2", "เปิดใช้ card สองใบที่ช่วงซ้อนกันพร้อมกัน (เจ้าของเดียวกัน) 5 รอบ: ACTIVE ได้ใบเดียวทุกรอบ · อีกใบ CARD_OVERLAP ยัง DRAFT", async () => {
    needBuilt(); needDb();
    for (let i = 0; i < 5; i++) {
      const vf = `${2040 + i}-01-01`, vt = `${2040 + i}-12-31`;
      const a = await mkCard(agentOwner("T1"), [], { activate: false, validFrom: vf, validTo: vt }), b = await mkCard(agentOwner("T1"), [], { activate: false, validFrom: vf, validTo: vt });
      const rs = await Promise.all([a, b].map((c) => shop("setAgentRateCardStatus", cA(), { cardId: c.id, expectedVersion: c.version, action: "ACTIVATE" })));
      const st2 = (await q<{ status: string }>(`SELECT status FROM "AgentRateCard" WHERE id = ANY($1::text[]) ORDER BY status`, [[a.id, b.id]])).map((r) => r.status);
      eq([rs.filter((r) => r.ok === true).length, st2], [1, ["ACTIVE", "DRAFT"]], `รอบ ${i}: ${fmt(rs.map((r) => [r.ok, r.code, r.reason]))}`);
      ok(rs.some((r) => r.ok === false && (r.reason === "CARD_OVERLAP" || r.code === "BUSY")), `รอบ ${i}: ตัวแพ้ต้อง CARD_OVERLAP/BUSY`);
    }
  });
  await st("C-3", "เพดาน card ต่อเจ้าของ (cardsPerOwner = 20) ยิงพร้อมกัน: มี 17 ใบ + สร้างพร้อมกัน 6 ⇒ สำเร็จ 3 · LIMIT_REACHED 3 · รวม 20 พอดี · ใบถัดไป LIMIT_REACHED · เก็บหนึ่งใบแล้วสร้างได้อีกหนึ่ง", async () => {
    needBuilt(); needDb();
    const lim = LIM("cardsPerOwner"); const owner = agentOwner("V");
    const first: { id: string; version: number }[] = [];
    for (let i = 0; i < lim - 3; i++) { const c = R(okR(await shop("createAgentRateCard", cA(), { owner, name: `cap ${i}` }), `สร้าง ${i}`).card); first.push({ id: String(c.id), version: Number(c.version) }); }
    const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => shop("createAgentRateCard", cA(), { owner, name: `par ${i}` })));
    const cnt = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentRateCard" WHERE "agentAccountId" = $1 AND status <> 'ARCHIVED'`, [acc("V").id]))[0]?.n;
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => r.ok === false && r.reason === "LIMIT_REACHED").length, await cnt()], [3, 3, lim], `ผล ${fmt(rs.map((r) => r.reason ?? r.ok))}`);
    failR(await shop("createAgentRateCard", cA(), { owner, name: "เกิน" }), "VALIDATION", "ใบที่ 21", "LIMIT_REACHED");
    okR(await shop("setAgentRateCardStatus", cA(), { cardId: first[0].id, expectedVersion: first[0].version, action: "ARCHIVE" }), "เก็บหนึ่งใบ");
    okR(await shop("createAgentRateCard", cA(), { owner, name: "แทน" }), "สร้างแทน");
    for (const c of first.slice(1)) await pool.query(`UPDATE "AgentRateCard" SET status = 'ARCHIVED' WHERE id = $1`, [c.id]);
    await pool.query(`UPDATE "AgentRateCard" SET status = 'ARCHIVED' WHERE "agentAccountId" = $1`, [acc("V").id]);
  });
  await st("C-4", "ตั้งระดับพร้อมกันสองคำสั่งด้วย expectedUpdatedAt เดียวกัน (A กับ C) 5 รอบ: เขียนสำเร็จคำสั่งเดียว · อีกคำสั่ง STALE · ค่าในฐาน = ของคำสั่งที่สำเร็จ", async () => {
    needBuilt(); needDb(); const t = await tiers();
    for (let i = 0; i < 5; i++) {
      await pool.query(`UPDATE "AgentAccount" SET "tierId" = $2, "updatedAt" = now() WHERE id = $1`, [acc("T1").id, t.B]);
      const u = String((await q<{ u: string }>(`SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS u FROM "AgentAccount" WHERE id = $1`, [acc("T1").id]))[0]?.u);
      const rs = await Promise.all((["A", "C"] as const).map((code) => shop("setAgentAccountTier", cA(), { agentAccountId: acc("T1").id, tierCode: code, expectedUpdatedAt: u })));
      const won = rs.filter((r) => r.ok === true);
      eq([won.length, rs.filter((r) => r.ok === false && r.code === "STALE").length], [1, 1], `รอบ ${i}: ${fmt(rs.map((r) => [r.ok, r.code]))}`);
      eq((await q<{ tierId: string }>(`SELECT "tierId" FROM "AgentAccount" WHERE id = $1`, [acc("T1").id]))[0]?.tierId, t[String(won[0].tierCode)], `รอบ ${i}: ฐาน`);
    }
  });
  await st("C-5", "ensureAgentTiers พร้อมกัน 6 คำสั่งบนร้านที่ลบระดับออก: สำเร็จทุกคำสั่ง · ฐานมี A/B/C ชุดเดียว · ผลรวม created = 3", async () => {
    needBuilt(); needDb();
    const tC = rid("tC"); await ins("Tenant", { id: tC, name: `${QC_MARK} ร้าน c`, slug: `${SLUG}${STAMP}-c`, updatedAt: new Date() }); tenantIds.push(tC);
    await ins("BusinessUnit", { id: rid("uC"), tenantId: tC, type: "TRIPS", name: "หน่วย c", slug: `${SLUG}c-${STAMP}`, settings: {}, updatedAt: new Date() });
    const uid = rid("uoc");
    await ins("User", { id: uid, email: `${EMAIL_PREFIX}oc-${STAMP}@shark.local`, name: "ผู้ทดสอบ oc", updatedAt: new Date() });
    await ins("Membership", { id: rid("mboc"), userId: uid, tenantId: tC, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    const rs = await Promise.all(Array.from({ length: 6 }, () => shop("ensureAgentTiers", { tenantId: tC, actorUserId: uid })));
    eq([rs.filter((r) => r.ok === true).length, rs.reduce((s, r) => s + Number(r.created ?? 0), 0), (await q<{ code: string }>(`SELECT code FROM "AgentTier" WHERE "tenantId" = $1 ORDER BY code`, [tC])).map((x) => x.code)], [6, 3, ["A", "B", "C"]], `ผล ${fmt(rs.map((r) => [r.ok, r.created, r.code]))}`);
  });
  groupLine("C");

  // ═══════════════ TP. เครื่องลองคิด ═══════════════
  console.log("\n── TP: เครื่องลองคิด = เส้นทางจริง ──");
  const tryIn = (key: string, o: Rec = {}): Rec => ({ agentAccountId: acc(key).id, unitId: uA, productId: PRD.A.id, slotId: depMain, pax: [{ paxTypeId: PRD.A.pt.ADULT, qty: 2 }], at: NOW.toISOString(), ...o });
  const noLadder = (v: unknown): Rec => { const c = clone(R(v)); delete c.cancelMinimumLadder; return c; };
  await st("TP-1", "ตัวอย่างภาพ 10 (:60–67) ผ่าน tryAgentPrice: ขาย 7,000 · อุทยาน 1,200 · เก็บลูกค้า 8,200 · คอมฯ 15% ← ระดับ · หัก 31.50 · ส่งร้าน 7,181.50 · trace.applied TIER · termSources 24 คีย์", async () => {
    needBuilt(); needDb(); await setTierRaw("XT", "B");
    const r = okR(await shop("tryAgentPrice", cA(), tryIn("XT")), "tryAgentPrice");
    const p = R(r.priced);
    eq([Number(tot(p).payableSatang) - Number(tot(p).passThroughSatang), tot(p).passThroughSatang, tot(p).payableSatang, com(p).commissionSatang, com(p).rateBp, wht(p).whtSatang, com(p).remitToShopSatang], [AC.saleSatang, AC.parkSatang, AC.collectSatang, AC.commissionSatang, AC.commissionBp, AC.whtSatang, AC.toShopSatang], "ภาพ 10");
    eq([R(r.trace).applied, R(R(r.trace).tier).source, R(r.trace).contract, R(R(r.trace).vat).mode, Object.keys(R(r.termSources)).length, Array.isArray(r.warnings)], ["TIER", "TIER_DEFAULT", null, "NONE", 24, true], "trace");
    ok((r.warnings as string[]).includes("WHT_PAYER_ASSUMED_JURISTIC"), "ต้องเตือนสถานะผู้จ่ายที่ร้านยังไม่ตั้ง");
  });
  await st("TP-2", "เท่ากับเส้นทางจริงทุกไบต์ (ไม่มีร่าง): tryAgentPrice.priced = trips.quoteTripLine ของผู้กระทำ AGENT ที่เวลาเดียวกัน — 7 สถานการณ์ (ค่าเริ่มระดับ · card ระดับ · สัญญา % · เน็ต · บาทต่อที่นั่ง · ช่วงพิเศษ · มีเด็ก)", async () => {
    needBuilt(); needDb();
    const dNY = await mkDep("2026-12-28");
    const cases: [string, string, string, number, number][] = [["XT", depMain, "ค่าเริ่ม", 2, 0], ["X", depMain, "card ระดับ", 2, 0], ["XC", depMain, "สัญญา", 3, 1], ["XN", depMain, "เน็ต", 2, 2], ["XF", depMain, "บาทต่อที่นั่ง", 4, 1], ["X", dNY, "ช่วงพิเศษ", 2, 1], ["S2", depMain, "0%", 1, 0]];
    for (const [key, dep, what, adults, children] of cases) {
      const pax = [{ paxTypeId: PRD.A.pt.ADULT, qty: adults }, ...(children ? [{ paxTypeId: PRD.A.pt.CHILD, qty: children }] : [])];
      const t = okR(await shop("tryAgentPrice", cA(), tryIn(key, { slotId: dep, pax })), `try ${what}`);
      const real = V(await quoteAgent(acc(key).id, dep, { adults, children }), `quote ${what}`);
      if (!isDeepStrictEqual(noLadder(t.priced), noLadder(real))) throw new AssertFail(`${what}: ไม่เท่ากัน — try ${fmt([tot(R(t.priced)), com(R(t.priced)).commissionSatang, com(R(t.priced)).refId])} จริง ${fmt([tot(real), com(real).commissionSatang, com(real).refId])}`);
    }
  });
  await st("TP-3", "ร่างที่ยังไม่บันทึก (ภาพ \"ลองคิดราคา ก่อนบันทึก\"): ร่างสัญญาเน็ต 2,800 ⇒ ส่งร้าน 6,800 ขณะที่ราคาจริงยังเป็นค่าเดิม · บันทึกร่างนั้นจริงแล้ว quote จริงได้ตัวเลขเท่าผลลองคิดทุกช่อง (ยกเว้น refId)", async () => {
    needBuilt(); needDb(); await setTierRaw("T1", "B");
    await pool.query(`UPDATE "AgentRateCard" SET status = 'ARCHIVED' WHERE "agentAccountId" = $1`, [acc("T1").id]);
    const rates = [{ productKind: "TRIP", productId: PRD.A.id, mode: "NET", valueMinor: 280_000, paxTypeId: PRD.A.pt.ADULT }, { productKind: "TRIP", productId: PRD.A.id, mode: "NET", valueMinor: 200_000, paxTypeId: PRD.A.pt.CHILD }];
    const pax = [{ paxTypeId: PRD.A.pt.ADULT, qty: 2 }, { paxTypeId: PRD.A.pt.CHILD, qty: 1 }];
    const before = V(await quoteAgent(acc("T1").id, depMain, { children: 1 }), "ก่อน");
    const t = okR(await shop("tryAgentPrice", cA(), tryIn("T1", { pax, draft: { ownerKind: "AGENT", rates } })), "ร่าง");
    const p = R(t.priced);
    eq([com(p).mode, com(p).commissionSatang, Number(tot(p).payableSatang) - Number(tot(p).passThroughSatang), com(p).remitToShopSatang, R(R(t.trace).contract).source, R(t.trace).applied], ["NET", 0, 2 * 280_000 + 200_000, tot(p).payableSatang, "AGENT_CARD", "CONTRACT"], "ผลร่าง");
    eq(V(await quoteAgent(acc("T1").id, depMain, { children: 1 }), "หลังลอง"), before, "ราคาจริงต้องไม่เปลี่ยนจากการลองคิด");
    await mkCard(agentOwner("T1"), rates);
    const real = V(await quoteAgent(acc("T1").id, depMain, { children: 1 }), "หลังบันทึก");
    const cmp = (v: Rec) => [tot(v), { ...com(v), refId: null }, A(v.items).map((i) => [i.itemRef, i.unitMinor, i.amountSatang, i.priceSource, i.commissionable, i.passThrough])];
    eq(cmp(real), cmp(p), "บันทึกแล้ว = ผลลองคิด");
  });
  await st("TP-4", "ร่างแทน card เดิม (replacesCardId): แถวของ card ที่ถูกแทนไม่ถูกใช้ · ร่างชั้นระดับ (ownerKind TIER) มีผลผ่านชั้นระดับ · ร่างที่ช่วงมีผลไม่ครอบวันจอง ⇒ ไม่มีผล", async () => {
    needBuilt(); needDb(); ok(cardXC.id, "ไม่มี card สัญญา (E-3)");
    const d = (o: Rec) => ({ ownerKind: "AGENT", rates: [rateOf({ valueBp: 2500, travelFrom: "2027-03-01", travelTo: "2027-03-31" })], ...o });
    const t1 = R(okR(await shop("tryAgentPrice", cA(), tryIn("XC", { draft: d({}) })), "ร่างเสริม").priced);
    eq(com(t1).rateBp, 2500, "ช่วงพิเศษในร่างชนะแถวไม่มีขอบวันของ card เดิม");
    const t2 = R(okR(await shop("tryAgentPrice", cA(), tryIn("XC", { draft: { ownerKind: "AGENT", replacesCardId: cardXC.id, rates: [rateOf({ valueBp: 900 })] } })), "ร่างแทน").priced);
    eq([com(t2).rateBp, com(t2).rateSource], [900, "CONTRACT"], "แทน card เดิม");
    const t3 = R(okR(await shop("tryAgentPrice", cA(), tryIn("XC", { draft: { ownerKind: "AGENT", replacesCardId: cardXC.id, rates: [] } })), "ร่างว่างแทน card เดิม").priced);
    eq([com(t3).rateSource, com(t3).rateBp], ["TIER", 1500], "ตัดสัญญาออก ⇒ ใช้ระดับ");
    const t4 = R(okR(await shop("tryAgentPrice", cA(), tryIn("XT", { draft: { ownerKind: "TIER", rates: [rateOf({ valueBp: 1900, priority: 9 })] } })), "ร่างชั้นระดับ").priced);
    eq([com(t4).rateBp, com(t4).rateSource], [1900, "TIER"], "ร่างชั้นระดับ");
    const t5 = R(okR(await shop("tryAgentPrice", cA(), tryIn("XT", { draft: { ownerKind: "AGENT", validFrom: "2027-01-01", validTo: "2027-12-31", rates: [rateOf({ valueBp: 2222 })] } })), "ร่างยังไม่ถึงวันมีผล").priced);
    eq(com(t5).rateBp, 1500, "ร่างนอกช่วงมีผล");
  });
  await st("TP-5", "เครื่องลองคิดและ port ไม่เขียนฐาน: หลังลองคิด 6 แบบ (มี/ไม่มีร่าง · ล้ม · สำเร็จ) + port.load 3 ครั้ง ⇒ จำนวน AuditLog · OutboxEvent · card · ผลรวม version · แถวราคา (แฮชค่า) เท่าเดิม", async () => {
    needBuilt(); needDb(); await install();
    const before = await writeCounts();
    for (const input of [tryIn("XT"), tryIn("XC", { draft: { ownerKind: "AGENT", rates: [rateOf({ valueBp: 1 })] } }), tryIn("XN", { actualSaleSatang: 1 }), tryIn("XT", { draft: { ownerKind: "AGENT", rates: [rateOf({ valueBp: 99_999 })] } }), tryIn("XT", { slotId: "nope" }), tryIn("XF", { agentDiscountSatang: 1 })]) await shop("tryAgentPrice", cA(), input);
    const load = fnOf(R(AGV("agencyPricingPort")), "load", "agencyPricingPort");
    for (const k of ["X", "XC", "SU"]) await load(agentCtx(acc(k).id), { agentAccountId: acc(k).id, productId: PRD.A.id, departureId: depMain, travelDate: DEP_DATE, at: NOW });
    eq(await writeCounts(), before, "ฐานเปลี่ยน");
  });
  await st("TP-6", "ร่างผิดถูกปฏิเสธด้วยเหตุเดียวกับตอนบันทึก: แถวผิดคู่ช่อง ⇒ VALIDATION MODE_VALUE_MISMATCH · แถวในร่างซ้อนกันเอง ⇒ RATE_OVERLAP · เกิน draftRatesMax / tryPaxLines ⇒ VALIDATION · สินค้าในร่างเป็นของร้านอื่น ⇒ PRODUCT_NOT_FOUND", async () => {
    needBuilt(); needDb();
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { draft: { ownerKind: "AGENT", rates: [rateOf({ valueBp: undefined, valueMinor: 1 })] } })), "VALIDATION", "ผิดคู่ช่อง", "MODE_VALUE_MISMATCH");
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { draft: { ownerKind: "AGENT", rates: [rateOf({ valueBp: 1, travelFrom: "2027-03-01", travelTo: "2027-03-10" }), rateOf({ valueBp: 2, travelFrom: "2027-03-10", travelTo: "2027-03-20" })] } })), "VALIDATION", "ซ้อนกันเอง", "RATE_OVERLAP");
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { draft: { ownerKind: "AGENT", rates: Array.from({ length: LIM("draftRatesMax") + 1 }, (_, i) => rateOf({ valueBp: 1, travelFrom: addDaysYmd("2050-01-01", i), travelTo: addDaysYmd("2050-01-01", i) })) } })), "VALIDATION", "ร่างยาวเกิน");
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { pax: Array.from({ length: LIM("tryPaxLines") + 1 }, () => ({ paxTypeId: PRD.A.pt.ADULT, qty: 1 })) })), "VALIDATION", "ประเภทคนเกิน");
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { draft: { ownerKind: "AGENT", rates: [{ productKind: "TRIP", productId: PRD.B.id, mode: "COMMISSION_PCT", valueBp: 1 }] } })), "VALIDATION", "สินค้าร้านอื่นในร่าง", "PRODUCT_NOT_FOUND");
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { draft: { ownerKind: "SHOP", rates: [] } })), "VALIDATION", "ownerKind แปลก");
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { at: "เมื่อวาน" })), "VALIDATION", "เวลาแปลก");
  });
  await st("TP-7", "ราคาขายจริงของเอเจนซี่ราคาเน็ต (ขั้นต่ำ 3,300 ต่อที่นั่ง): ต่ำกว่าขั้นต่ำ ⇒ VALIDATION BELOW_MIN_SELL_PRICE · เท่าขั้นต่ำพอดีผ่าน · เอเจนซี่ได้ส่วนต่าง = ขายจริง − เน็ต × ที่นั่ง · คอมฯ 100% + ส่วนลดจากคอมฯ ที่ปิดอยู่ ⇒ VALIDATION DISCOUNT_OVER_CAP", async () => {
    needBuilt(); needDb();
    // ORACLE-EDIT TP-7 (มติ Z5 ง): ขั้นต่ำมาจากแถวไม่ระบุประเภทคนเท่านั้น — card ของ XN (E-4) มีขั้นต่ำ 3,300 อยู่บนแถวผู้ใหญ่ ⇒ ไม่ใช้แล้ว (A7 ไม่ตั้ง ⇒ ไม่มีขั้นต่ำ)
    //   ฟิกซ์เจอร์: ร่างแทน card ของ XN ด้วยแถวเน็ตไม่ระบุประเภท 2,800 ขั้นต่ำ 3,300 เพื่อยังพิสูจน์ BELOW_MIN_SELL_PRICE ได้
    const xnCard = (await q<{ id: string }>(`SELECT id FROM "AgentRateCard" WHERE "agentAccountId" = $1 AND status = 'ACTIVE'`, [acc("XN").id]))[0]?.id;
    ok(xnCard, "ไม่มี card ของ XN (E-4)");
    const paxOnly = okR(await shop("tryAgentPrice", cA(), tryIn("XN", { actualSaleSatang: 2 * 330_000 - 1 })), "ขั้นต่ำบนแถวรายประเภทไม่ใช้");
    eq(com(R(paxOnly.priced)).agentEarnsSatang, 2 * 330_000 - 1 - 2 * 280_000, "ไม่มีขั้นต่ำจากแถวรายประเภท");
    const draftMin = { draft: { ownerKind: "AGENT", replacesCardId: xnCard, rates: [{ productKind: "TRIP", productId: PRD.A.id, mode: "NET", valueMinor: 280_000, minSellMinor: 330_000 }] } };
    failR(await shop("tryAgentPrice", cA(), tryIn("XN", { actualSaleSatang: 2 * 330_000 - 1, ...draftMin })), "VALIDATION", "ต่ำกว่าขั้นต่ำ", "BELOW_MIN_SELL_PRICE");
    const okp = R(okR(await shop("tryAgentPrice", cA(), tryIn("XN", { actualSaleSatang: 2 * 330_000, ...draftMin })), "เท่าขั้นต่ำ").priced);
    eq([com(okp).agentActualSaleSatang, com(okp).agentEarnsSatang], [660_000, 660_000 - 2 * 280_000], "ส่วนต่าง");
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { agentDiscountSatang: 1_000 })), "VALIDATION", "ส่วนลดจากคอมฯ ปิดอยู่", "DISCOUNT_OVER_CAP");
  });
  await st("TP-8", "ขอบเขตของเครื่องลองคิด: บัญชีร้านอื่น ⇒ NOT_FOUND (= id ไม่มี) · รอบของหน่วยอื่น/ไม่มี ⇒ NOT_FOUND · บัญชีถูกพักยังลองคิดได้ (ร้านตั้งราคาก่อนคืนสิทธิ์) ขณะที่เส้นทางจริงยังปิด · บัญชีปิด ⇒ ไม่ผ่าน", async () => {
    needBuilt(); needDb(); await setTierRaw("SU", "B");
    const a = await shop("tryAgentPrice", cA(), tryIn("Z")), b = await shop("tryAgentPrice", cA(), { ...tryIn("XT"), agentAccountId: "nope_zzz" });
    failR(a, "NOT_FOUND", "บัญชีร้านอื่น"); eq(a, b, "= id ไม่มี");
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { slotId: "nope_zzz" })), "NOT_FOUND", "รอบไม่มี");
    failR(await shop("tryAgentPrice", cA(), tryIn("XT", { slotId: await mkDep(DEP_DATE, "A2") })), "NOT_FOUND", "รอบของหน่วยอื่น");
    const su = R(okR(await shop("tryAgentPrice", cA(), tryIn("SU")), "บัญชีถูกพัก").priced);
    eq([com(su).commissionSatang, com(su).agentAccountId], [AC.commissionSatang, acc("SU").id], "บัญชีถูกพักลองคิดได้");
    const q2 = await quoteAgent(acc("SU").id, depMain);
    ok(q2.ok === false && q2.code === "FORBIDDEN", "เส้นทางจริงของบัญชีถูกพักต้องปิด");
    ok((await shop("tryAgentPrice", cA(), tryIn("CL"))).ok === false, "บัญชีปิดต้องไม่ผ่าน");
  });
  await st("TP-9", "มติ Z3: บัญชี ACTIVE ผูกหน่วยอื่น ลองคิดที่หน่วยนี้ ⇒ VALIDATION ACCOUNT_NOT_IN_UNIT ทุกกรณี (ไม่มีร่าง · มีร่าง · มีราคาขายจริง) ขณะเส้นทางจริง FORBIDDEN · ที่หน่วยของบัญชีลองคิดได้ · ไม่มีร่าง + ACTIVE ⇒ priced เท่ากับ quote จริงทุกไบต์ (JSON · ตัด cancelMinimumLadder ตาม §9)", async () => {
    needBuilt(); needDb();
    await mkAccount("OU", tA, { unitIds: [uA2] }); await setTierRaw("OU", "B");
    for (const [what, o] of [["ไม่มีร่าง", {}], ["มีร่าง", { draft: { ownerKind: "AGENT", rates: [rateOf({ valueBp: 1000 })] } }], ["มีราคาขายจริง", { actualSaleSatang: 800_000 }]] as [string, Rec][]) {
      failR(await shop("tryAgentPrice", cA(), tryIn("OU", o)), "VALIDATION", `ผูกหน่วยอื่น (${what})`, "ACCOUNT_NOT_IN_UNIT");
    }
    const real = await quoteAgent(acc("OU").id, depMain);
    ok(real.ok === false && real.code === "FORBIDDEN" && R(real.details).reason === "AGENCY_NOT_ENABLED", `เส้นทางจริง: ${fmt(real)}`);
    const dA2 = await mkDep(DEP_DATE, "A2");
    const inUnit = okR(await shop("tryAgentPrice", cA(), tryIn("OU", { unitId: uA2, productId: PRD.A2.id, slotId: dA2, pax: [{ paxTypeId: PRD.A2.pt.ADULT, qty: 2 }] })), "หน่วยของบัญชี");
    eq(com(R(inUnit.priced)).commissionSatang, AC.commissionSatang, "หน่วยของบัญชี: ค่าเริ่มระดับ B");
    for (const key of ["XT", "X", "XC", "XN", "XF"]) {
      const t = okR(await shop("tryAgentPrice", cA(), tryIn(key, { pax: [{ paxTypeId: PRD.A.pt.ADULT, qty: 2 }, { paxTypeId: PRD.A.pt.CHILD, qty: 1 }] })), `try ${key}`);
      const q2 = V(await quoteAgent(acc(key).id, depMain, { children: 1 }), `quote ${key}`);
      eq(JSON.stringify(noLadder(t.priced)), JSON.stringify(noLadder(q2)), `${key}: try ≠ quote ทุกไบต์`);
    }
  });
  await st("TP-10", "มติ Z4: คอมฯ บาทต่อที่นั่งรวมเกินฐานคอมฯ ⇒ VALIDATION COMMISSION_EXCEEDS_PAYABLE (ตัวอย่างนักล่า 3,751.90 × ผู้ใหญ่ 11 + เด็ก 4) ทั้งเครื่องลองคิดและ quote จริง · คอมฯ = ฐานพอดี ⇒ ผ่าน (คอมฯ = ฐาน · หัก 3% · ส่งร้าน = เก็บ − คอมฯ + หัก) · เกินฐาน 1 สตางค์ ⇒ ปฏิเสธ", async () => {
    needBuilt(); needDb();
    await mkAccount("Z4", tA); await setTierRaw("Z4", "B");
    const fixed = (v: number) => ({ draft: { ownerKind: "AGENT", rates: [{ productKind: "TRIP", productId: PRD.A.id, mode: "COMMISSION_FIXED", valueMinor: v }] } });
    const pax15 = [{ paxTypeId: PRD.A.pt.ADULT, qty: 11 }, { paxTypeId: PRD.A.pt.CHILD, qty: 4 }];
    const base15 = 11 * ADULT + 4 * CHILD;
    ok(375_190 * 15 > base15, `ฟิกซ์เจอร์: ${375_190 * 15} ต้องเกินฐาน ${base15}`);
    failR(await shop("tryAgentPrice", cA(), tryIn("Z4", { pax: pax15, ...fixed(375_190) })), "VALIDATION", "คอมฯ เกินฐาน (ลองคิด)", "COMMISSION_EXCEEDS_PAYABLE");
    const edge = R(okR(await shop("tryAgentPrice", cA(), tryIn("Z4", fixed(ADULT))), "คอมฯ = ฐานพอดี").priced);
    eq([com(edge).baseSatang, com(edge).commissionSatang, wht(edge).whtSatang, com(edge).remitToShopSatang], [2 * ADULT, 2 * ADULT, refBp(2 * ADULT, 300), AC.collectSatang - 2 * ADULT + refBp(2 * ADULT, 300)], "คอมฯ = ฐาน");
    failR(await shop("tryAgentPrice", cA(), tryIn("Z4", fixed(ADULT + 1))), "VALIDATION", "เกินฐาน 1 สตางค์ต่อที่นั่ง", "COMMISSION_EXCEEDS_PAYABLE");
    await mkCard(agentOwner("Z4"), [{ productKind: "TRIP", productId: PRD.A.id, mode: "COMMISSION_FIXED", valueMinor: 375_190 }]);
    const real = await quoteAgent(acc("Z4").id, depMain, { adults: 11, children: 4 });
    ok(real.ok === false && real.code === "VALIDATION" && R(real.details).reason === "COMMISSION_EXCEEDS_PAYABLE", `quote จริง: ${fmt(real)}`);
  });
  await st("TP-11", "มติ Z5 (ข)(ค) บนฐานจริง: แถวช่วงพิเศษไม่ระบุประเภท priority สูงกว่าชนะแถวปกติรายประเภท (quote จริง) · ร่าง (id draft-…) กับหลังบันทึกจริงได้ผลเดียวกันเมื่อแถวเสมอกัน: เพดานบวกเพิ่มมาจากแถวไม่ระบุประเภท (20% ไม่ใช่ 50%) ทั้งก่อนและหลังบันทึก", async () => {
    needBuilt(); needDb();
    await mkAccount("Z5", tA); await setTierRaw("Z5", "B");
    await mkCard(agentOwner("Z5"), [{ productKind: "TRIP", productId: PRD.A.id, mode: "NET", valueMinor: 280_000, paxTypeId: PRD.A.pt.ADULT }, { productKind: "TRIP", productId: PRD.A.id, mode: "NET", valueMinor: 200_000, priority: 1, travelFrom: "2027-03-01", travelTo: "2027-03-31" }]);
    const seatOf = (v: Rec, code: string) => { const s2 = A(v.items).find((i) => i.kind === "SEAT" && i.paxTypeCode === code); return [s2?.unitMinor, s2?.priceSource]; };
    const inSp = V(await quoteAgent(acc("Z5").id, depMain, { children: 1 }), "ในช่วงพิเศษ");
    eq([seatOf(inSp, "ADULT"), seatOf(inSp, "CHILD")], [[200_000, "CONTRACT"], [200_000, "CONTRACT"]], "ช่วงพิเศษไม่ระบุ priority 1 ชนะรายประเภท");
    const out = V(await quoteAgent(acc("Z5").id, await mkDep("2027-04-10"), { children: 1 }), "นอกช่วงพิเศษ");
    eq([seatOf(out, "ADULT")[0], seatOf(out, "CHILD")[0] === CHILD], [280_000, true], "นอกช่วง: ผู้ใหญ่รายประเภท · เด็กราคาปลีก");
    await mkAccount("Z5C", tA); await setTierRaw("Z5C", "B");
    const rates = [{ productKind: "TRIP", productId: PRD.A.id, mode: "MARKUP", valueMinor: 300_000, markupCapBp: 5_000, paxTypeId: PRD.A.pt.ADULT }, { productKind: "TRIP", productId: PRD.A.id, mode: "MARKUP", valueMinor: 300_000, markupCapBp: 2_000 }];
    const net2 = 2 * 300_000, cap20 = net2 + refBp(net2, 2_000);
    const d1 = await shop("tryAgentPrice", cA(), tryIn("Z5C", { actualSaleSatang: cap20 + 1, draft: { ownerKind: "AGENT", rates } }));
    failR(d1, "VALIDATION", "ร่าง: เกินเพดาน 20%", "MARKUP_OVER_CAP");
    const d2 = okR(await shop("tryAgentPrice", cA(), tryIn("Z5C", { actualSaleSatang: cap20, draft: { ownerKind: "AGENT", rates } })), "ร่าง: เท่าเพดาน 20%");
    eq(R(R(d2.trace).contract).rateId, "draft-001", "ร่าง: แถวแรก = แถวไม่ระบุประเภท");
    const saved = await mkCard(agentOwner("Z5C"), rates);
    const s1 = await shop("tryAgentPrice", cA(), tryIn("Z5C", { actualSaleSatang: cap20 + 1 }));
    eq(s1, d1, "หลังบันทึก: เกินเพดาน 20% ผลเดียวกับร่าง");
    const s2 = okR(await shop("tryAgentPrice", cA(), tryIn("Z5C", { actualSaleSatang: cap20 })), "หลังบันทึก: เท่าเพดาน");
    eq(R(R(s2.trace).contract).rateId, saved.rateIds[1], "หลังบันทึก: แถวแรก = แถวไม่ระบุประเภท");
    const cmp = (v: Rec) => [tot(v), { ...com(v), refId: null }, A(v.items).map((i) => [i.itemRef, i.unitMinor, i.amountSatang, i.priceSource])];
    eq(cmp(R(s2.priced)), cmp(R(d2.priced)), "ร่าง = หลังบันทึก (ยกเว้น refId)");
  });
  await st("TP-12", "มติ Z9: ร่างชั้นระดับ (ownerKind TIER) ของบัญชีที่ไม่มีระดับ ⇒ VALIDATION TIER_NOT_FOUND · ร่างชั้นสัญญาของบัญชีเดียวกันลองคิดได้", async () => {
    needBuilt(); needDb();
    await mkAccount("NT", tA);
    failR(await shop("tryAgentPrice", cA(), tryIn("NT", { draft: { ownerKind: "TIER", rates: [rateOf({ valueBp: 1300 })] } })), "VALIDATION", "ร่างระดับของบัญชีไม่มีระดับ", "TIER_NOT_FOUND");
    eq(com(R(okR(await shop("tryAgentPrice", cA(), tryIn("NT", { draft: { ownerKind: "AGENT", rates: [rateOf({ valueBp: 1300 })] } })), "ร่างสัญญา").priced)).rateBp, 1_300, "ร่างสัญญา");
  });
  groupLine("TP");

  // ═══════════════ SN. snapshot ═══════════════
  console.log("\n── SN: snapshot — การจองเดิมไม่เปลี่ยน ──");
  await st("SN-1", "จดตอนจอง (quote → buildTripBookingSnapshot ด้วย port ตัวจริง): commission ใน snapshot = ของ quote · refId มีรุ่นของ card · policy.agency มี 24 คีย์ · refs มี agentId/agentTierId", async () => {
    needBuilt(); needDb(); ok(cardXC.id, "ไม่มี card สัญญา (E-3)"); await install();
    const ctx = agentCtx(acc("XC").id), ln = line(depMain);
    const priced = V(await callTr("quoteTripLine", ctx, ln), "quote");
    const snap = V(await callTr("buildTripBookingSnapshot", ctx, ln, priced, {}), "snapshot");
    const rec = (ev: Rec): Rec => { const r = R(TR("recomputeFromSnapshot")(snap, ev)); return r.ok === true ? R(r.value) : r; };
    const c0 = rec({ kind: "COMMISSION" });
    eq([c0.commissionSatang, c0.remitToShopSatang], [126_000, 820_000 - 126_000 + 3_780], "ตอนจอง");
    eq([JSON.stringify(snap).includes(`${cardXC.rateIds[0]}@${cardXC.version}`), Object.keys(R(R(R(snap.policy).agency).values)).length, R(snap.refs).agentId, R(snap.refs).agentTierId], [true, 24, acc("XC").id, (await tiers()).B], "ที่จด");
    // แก้ทุกอย่างหลังจอง
    const u = okR(await shop("upsertAgentRate", cA(), { cardId: cardXC.id, expectedVersion: cardXC.version, rate: rateOf({ id: cardXC.rateIds[0], valueBp: 2500 }) }), "แก้อัตรา"); cardXC.version = Number(R(u.card).version);
    eq(com(V(await callTr("quoteTripLine", ctx, ln), "quote ใหม่")).commissionSatang, 175_000, "quote ใหม่ใช้อัตราใหม่");
    eq([rec({ kind: "COMMISSION" }).commissionSatang, rec({ kind: "COMMISSION" }).remitToShopSatang], [126_000, 820_000 - 126_000 + 3_780], "หลังแก้อัตรา");
    const ar = okR(await shop("setAgentRateCardStatus", cA(), { cardId: cardXC.id, expectedVersion: cardXC.version, action: "ARCHIVE" }), "เก็บ card"); cardXC.version = Number(R(ar.card).version);
    await setTierRaw("XC", "C");
    await setV(tA, [{ key: "agency.comm.vatMode", scope: "AGENT", scopeId: acc("XC").id, value: "INCLUSIVE" }, { key: "agency.money.collector", scope: "AGENT", scopeId: acc("XC").id, value: "SHOP_COLLECTS" }]);
    await pool.query(`UPDATE "AgentAccount" SET "vatRegistered" = true WHERE id = $1`, [acc("XC").id]);
    const now2 = V(await callTr("quoteTripLine", ctx, ln), "quote หลังเปลี่ยนทุกอย่าง");
    eq([com(now2).rateSource, com(now2).rateBp, com(now2).vatMode, com(now2).collectMode], ["TIER", 1000, "INCLUSIVE", "SHOP_COLLECTS"], "ของใหม่เปลี่ยนจริง (positive control)");
    eq([rec({ kind: "COMMISSION" }).commissionSatang, rec({ kind: "COMMISSION" }).remitToShopSatang], [126_000, 820_000 - 126_000 + 3_780], "snapshot เดิมหลังเก็บ card + เปลี่ยนระดับ + เปลี่ยนค่าตั้ง + เอเจนซี่จด VAT");
  });
  groupLine("SN");

  // ═══════════════ EF. คุณสมบัติเงินสุ่ม ═══════════════
  console.log("\n── EF: คุณสมบัติเงิน (สุ่มมีเมล็ด · ผ่านเครื่องลองคิดด้วยร่าง — ไม่เขียนฐาน) ──");
  await st("EF-1", "40 ชุดสุ่ม (คอมฯ % 0–100 · บาทต่อที่นั่ง · เน็ต × ผู้ใหญ่ 1–6 เด็ก 0–3): Σ บรรทัด = ยอดเก็บ · ฐานคอมฯ = ราคาที่นั่งเท่านั้น (เงินเก็บแทนไม่อยู่ในฐาน) · คอมฯ = ตัวอ้างอิง half-up · คอมฯ ≤ ฐาน · หัก = 3% ของคอมฯ · ส่งร้าน = เก็บ − คอมฯ + หัก", async () => {
    needBuilt(); needDb(); await setTierRaw("XS", "B");
    await pool.query(`UPDATE "AgentRateCard" SET status = 'ARCHIVED' WHERE "agentAccountId" = $1`, [acc("XS").id]);
    const rnd = rng(13_100); let pctN = 0;
    for (let i = 0; i < 40; i++) {
      const adults = 1 + Math.floor(rnd() * 6), children = Math.floor(rnd() * 4);
      const mode = (["COMMISSION_PCT", "COMMISSION_PCT", "COMMISSION_FIXED", "NET"] as const)[Math.floor(rnd() * 4)];
      const bp = i === 0 ? 0 : i === 1 ? 10_000 : i === 2 ? 1 : i === 3 ? 9_999 : Math.floor(rnd() * 10_001), fixed = Math.floor(rnd() * 100_001), netA = 100_000 + Math.floor(rnd() * 250_000);
      const rate = mode === "COMMISSION_PCT" ? rateOf({ valueBp: bp }) : mode === "COMMISSION_FIXED" ? { productKind: "TRIP", productId: PRD.A.id, mode, valueMinor: fixed } : { productKind: "TRIP", productId: PRD.A.id, mode, valueMinor: netA, paxTypeId: PRD.A.pt.ADULT };
      const pax = [{ paxTypeId: PRD.A.pt.ADULT, qty: adults }, ...(children ? [{ paxTypeId: PRD.A.pt.CHILD, qty: children }] : [])];
      const p = R(okR(await shop("tryAgentPrice", cA(), tryIn("XS", { pax, draft: { ownerKind: "AGENT", rates: [rate] } })), `ชุด ${i} ${mode}`).priced);
      const items = A(p.items); const payable = Number(tot(p).payableSatang), pass = Number(tot(p).passThroughSatang);
      const seatAmt = (mode === "NET" ? netA : ADULT) * adults + CHILD * children;
      const what = `ชุด ${i} ${mode} ${adults}A${children}C`;
      eq(items.reduce((s, x) => s + Number(x.amountSatang), 0), payable, `${what}: Σ บรรทัด`);
      eq([payable - pass, items.filter((x) => x.passThrough === true).reduce((s, x) => s + Number(x.amountSatang), 0), items.filter((x) => x.passThrough === true).every((x) => x.commissionable === false)], [seatAmt, pass, true], `${what}: เงินเก็บแทน`);
      ok(pass === RACHA.parkAdultSatang * adults + RACHA.parkChildSatang * children, `${what}: อุทยาน ${pass}`);
      const expC = mode === "COMMISSION_PCT" ? refBp(seatAmt, bp) : mode === "COMMISSION_FIXED" ? fixed * (adults + children) : 0;
      const expW = refBp(expC, 300);
      eq([com(p).baseSatang, com(p).commissionSatang, wht(p).whtSatang, com(p).remitToShopSatang, com(p).commissionVatSatang], [seatAmt, expC, expW, payable - expC + expW, 0], `${what}: คอมฯ/หัก/ส่งร้าน`);
      ok(expC <= seatAmt || mode === "COMMISSION_FIXED", `${what}: คอมฯ เกินฐาน`);
      ok(Number(com(p).remitToShopSatang) >= 0 && Number.isInteger(com(p).commissionSatang), `${what}: ยอดติดลบ/ไม่ใช่จำนวนเต็ม`);
      if (mode === "COMMISSION_PCT") pctN++;
    }
    ok(pctN >= 10, "ชุดสุ่มมีแบบ % น้อยไป");
  });
  await st("EF-2", "อัตราสูงขึ้นคอมฯ ไม่ลด ยอดส่งร้านไม่เพิ่ม: ไล่ 0 → 100% ทีละ 6.25% บนยอด 3 ผู้ใหญ่ + 1 เด็ก · คอมฯ ที่ 100% = ฐานพอดี · ทุกขั้นตรงตัวอ้างอิง", async () => {
    needBuilt(); needDb();
    const pax = [{ paxTypeId: PRD.A.pt.ADULT, qty: 3 }, { paxTypeId: PRD.A.pt.CHILD, qty: 1 }]; const seatAmt = 3 * ADULT + CHILD;
    let prevC = -1, prevR = Number.MAX_SAFE_INTEGER;
    for (let bp = 0; bp <= 10_000; bp += 625) {
      const p = R(okR(await shop("tryAgentPrice", cA(), tryIn("XS", { pax, draft: { ownerKind: "AGENT", rates: [rateOf({ valueBp: bp })] } })), `bp ${bp}`).priced);
      const c = Number(com(p).commissionSatang), r = Number(com(p).remitToShopSatang);
      eq(c, refBp(seatAmt, bp), `bp ${bp}`);
      ok(c >= prevC && r <= prevR, `bp ${bp}: ไม่เรียงทางเดียว (คอมฯ ${prevC}→${c} · ส่งร้าน ${prevR}→${r})`);
      prevC = c; prevR = r;
    }
    eq(prevC, seatAmt, "100% = ฐาน");
  });
  groupLine("EF");

  // ═══════════════ ST. ค่าตั้ง ═══════════════
  console.log("\n── ST: ค่าตั้งกับราคา ──");
  await st("ST-1", "เอเจนซี่จด VAT + ร้านไม่ได้ตั้ง X26 ⇒ แยก VAT (CC §H.4): คอมฯ 1,050 · VAT คอมฯ 73.50 · หัก 31.50 · ส่งร้าน 7,108.00 · snapshot จะจด vatMode EXCLUSIVE + agencyVatRegistered true", async () => {
    needBuilt(); needDb(); await setTierRaw("V", "B");
    const v = V(await quoteAgent(acc("V").id, depMain), "quote");
    eq([com(v).commissionSatang, com(v).commissionVatSatang, wht(v).whtSatang, com(v).remitToShopSatang, com(v).vatMode, com(v).agencyVatRegistered], [ACV.exclusive.commissionSatang, ACV.exclusive.commissionVatSatang, ACV.exclusive.whtSatang, ACV.exclusive.toShopSatang, "EXCLUSIVE", true], "EXCLUSIVE");
  });
  await st("ST-2", "ร้านตั้ง X26 = INCLUSIVE ที่ชั้นเอเจนซี่ (เอเจนซี่จด VAT) ⇒ คอมฯ ก่อน VAT 981.31 · VAT 68.69 · หัก 29.44 · ส่งร้าน 7,179.44 · ตั้ง NONE เอง ⇒ ไม่มี VAT (7,181.50)", async () => {
    needBuilt(); needDb();
    await setV(tA, [{ key: "agency.comm.vatMode", scope: "AGENT", scopeId: acc("V").id, value: "INCLUSIVE" }]);
    const v = V(await quoteAgent(acc("V").id, depMain), "INCLUSIVE");
    eq([com(v).commissionSatang, com(v).commissionVatSatang, wht(v).whtSatang, com(v).remitToShopSatang, com(v).vatMode], [ACV.inclusive.commissionSatang, ACV.inclusive.commissionVatSatang, ACV.inclusive.whtSatang, ACV.inclusive.toShopSatang, "INCLUSIVE"], "INCLUSIVE");
    await setV(tA, [{ key: "agency.comm.vatMode", scope: "AGENT", scopeId: acc("V").id, value: "NONE" }]);
    const n = V(await quoteAgent(acc("V").id, depMain), "NONE ที่ร้านตั้งเอง");
    eq([com(n).vatMode, com(n).commissionVatSatang, com(n).remitToShopSatang], ["NONE", 0, AC.toShopSatang], "NONE ที่ร้านตั้งเอง");
  });
  await st("ST-3", "ร้านตั้ง X26 = EXCLUSIVE ทั้งหน่วย แต่เอเจนซี่ไม่จด VAT ⇒ ไม่มี VAT คอมฯ (7,181.50) + เครื่องลองคิดเตือน VAT_MODE_IGNORED_NOT_REGISTERED · เอเจนซี่จด VAT ในหน่วยเดียวกัน (ไม่มีค่าระดับเอเจนซี่) ⇒ 7,108.00", async () => {
    needBuilt(); needDb(); await setTierRaw("XT", "B"); await setTierRaw("SU", "B");
    await setV(tA, [{ key: "agency.comm.vatMode", scope: "UNIT", scopeId: uA, value: "EXCLUSIVE" }]);
    try {
      const v = V(await quoteAgent(acc("XT").id, depMain), "ไม่จด VAT");
      eq([com(v).vatMode, com(v).commissionVatSatang, com(v).remitToShopSatang], ["NONE", 0, AC.toShopSatang], "ไม่จด VAT");
      const t = okR(await shop("tryAgentPrice", cA(), tryIn("XT")), "try");
      eq([(t.warnings as string[]).includes("VAT_MODE_IGNORED_NOT_REGISTERED"), R(R(t.trace).vat).decidedBy, R(t.termSources)["agency.comm.vatMode"]], [true, "NOT_REGISTERED", "UNIT"], "คำเตือน");
      await pool.query(`UPDATE "AgentAccount" SET "vatRegistered" = true WHERE id = $1`, [acc("SU").id]);
      const s = R(okR(await shop("tryAgentPrice", cA(), tryIn("SU")), "จด VAT").priced);
      eq([com(s).vatMode, com(s).remitToShopSatang], ["EXCLUSIVE", ACV.exclusive.toShopSatang], "จด VAT ใช้ค่าที่ร้านตั้ง");
    } finally { await setV(tA, [{ key: "agency.comm.vatMode", scope: "UNIT", scopeId: uA, value: "NONE" }]); await pool.query(`UPDATE "AgentAccount" SET "vatRegistered" = false WHERE id = $1`, [ACC.SU?.id ?? ""]); }
  });
  await st("ST-4", "ร้านแก้ตารางระดับ A1 (B ทัวร์ 15 → 17) ⇒ ค่าเริ่มของระดับเปลี่ยนตาม: คอมฯ 1,190.00 · refId ยังเป็น tier:<id>:A1 · คืนค่าเดิมได้ 1,050.00", async () => {
    needBuilt(); needDb(); await setTierRaw("XT", "B");
    const t0 = R(R(await S("resolveSetting")({ tenantId: tA }, "agency.tier.table", { unitId: uA })).value);
    await setV(tA, [{ key: "agency.tier.table", scope: "UNIT", scopeId: uA, value: { ...t0, B: { ...R(t0.B), tourPct: 17 } } }]);
    try {
      const v = V(await quoteAgent(acc("XT").id, depMain), "17%");
      eq([com(v).commissionSatang, com(v).rateBp, com(v).refId], [119_000, 1700, `tier:${(await tiers()).B}:A1`], "17%");
    } finally { await setV(tA, [{ key: "agency.tier.table", scope: "UNIT", scopeId: uA, value: t0 }]); }
    eq(com(V(await quoteAgent(acc("XT").id, depMain), "คืนค่า")).commissionSatang, AC.commissionSatang, "คืนค่า");
  });
  await st("ST-5", "สถานะผู้จ่าย A25: ร้านตั้งเป็นบุคคลธรรมดา ⇒ ไม่หัก ณ ที่จ่ายเอเจนซี่นิติบุคคล (หัก 0 · ส่งร้าน 7,150.00) และไม่มีคำเตือนสมมติผู้จ่าย · ตั้งเป็นนิติบุคคล ⇒ หัก 31.50 ไม่มีคำเตือน", async () => {
    needBuilt(); needDb(); await setTierRaw("XT", "B");
    await setV(tA, [{ key: "agency.wht.payerType", scope: "UNIT", scopeId: uA, value: "INDIVIDUAL" }]);
    try {
      const t = okR(await shop("tryAgentPrice", cA(), tryIn("XT")), "บุคคล");
      eq([wht(R(t.priced)).applies, wht(R(t.priced)).whtSatang, com(R(t.priced)).remitToShopSatang, (t.warnings as string[]).includes("WHT_PAYER_ASSUMED_JURISTIC")], [false, 0, AC.toShopNoWhtSatang, false], "ร้านบุคคล");
      await setV(tA, [{ key: "agency.wht.payerType", scope: "UNIT", scopeId: uA, value: "JURISTIC" }]);
      const j = okR(await shop("tryAgentPrice", cA(), tryIn("XT")), "นิติ");
      eq([wht(R(j.priced)).whtSatang, com(R(j.priced)).remitToShopSatang, (j.warnings as string[]).includes("WHT_PAYER_ASSUMED_JURISTIC")], [AC.whtSatang, AC.toShopSatang, false], "ร้านนิติบุคคล");
    } finally { await setV(tA, [{ key: "agency.wht.payerType", scope: "UNIT", scopeId: uA, value: null }]); }
  });
  await st("ST-6", "ใครเก็บเงิน A10 ตามชั้น ระดับ → เอเจนซี่: ระดับ C ตั้งร้านเก็บ ⇒ เอเจนซี่ระดับ C ได้ SHOP_COLLECTS (ลูกค้าจ่ายร้าน 8,200 · ร้านจ่ายเอเจนซี่ = คอมฯ − หัก · เอเจนซี่ส่งร้าน 0 · ที่มา AGENT_TIER) · เอเจนซี่ที่ตั้งเองชนะระดับ (AGENT_COLLECTS · ที่มา AGENT) · ระดับ B ไม่กระทบ", async () => {
    needBuilt(); needDb(); const t = await tiers(); await setTierRaw("S1", "C"); await setTierRaw("S2", "C"); await setTierRaw("XT", "B");
    await pool.query(`UPDATE "AgentRateCard" SET status = 'ARCHIVED' WHERE "agentAccountId" = ANY($1::text[])`, [[acc("S1").id, acc("S2").id]]);
    await setV(tA, [{ key: "agency.money.collector", scope: "AGENT_TIER", scopeId: t.C, value: "SHOP_COLLECTS" }, { key: "agency.money.collector", scope: "AGENT", scopeId: acc("S2").id, value: "AGENT_COLLECTS" }]);
    const a = okR(await shop("tryAgentPrice", cA(), tryIn("S1")), "ระดับ C"), b = okR(await shop("tryAgentPrice", cA(), tryIn("S2")), "เอเจนซี่ตั้งเอง"), c = okR(await shop("tryAgentPrice", cA(), tryIn("XT")), "ระดับ B");
    const pa = R(a.priced);
    eq([com(pa).collectMode, com(pa).shopCollectsSatang, com(pa).payToAgentSatang, com(pa).remitToShopSatang, com(pa).collectFromCustomerSatang, R(a.termSources)["agency.money.collector"]], ["SHOP_COLLECTS", 820_000, 70_000 - 2_100, 0, 0, "AGENT_TIER"], "ระดับ C");
    eq([com(R(b.priced)).collectMode, com(R(b.priced)).remitToShopSatang, R(b.termSources)["agency.money.collector"]], ["AGENT_COLLECTS", 820_000 - 70_000 + 2_100, "AGENT"], "เอเจนซี่ชนะระดับ");
    eq([com(R(c.priced)).collectMode, com(R(c.priced)).remitToShopSatang], ["AGENT_COLLECTS", AC.toShopSatang], "ระดับ B");
    eq(com(V(await quoteAgent(acc("S1").id, depMain), "เส้นทางจริง")).payToAgentSatang, 67_900, "เส้นทางจริงตรงกัน");
  });
  await st("ST-7", "มติ Z6 ⚖️ บนฐานจริง: ร้านเปิด e-WHT (A28 1% ถึง 31 ธ.ค. 2570) ⇒ เอเจนซี่มูลนิธิยังหัก 10% ของคอมฯ 1,050 = 105.00 (eWht false) · เอเจนซี่นิติบุคคลไทยหัก 1% = 10.50 (eWht true) · ส่งร้านตามยอดหัก", async () => {
    needBuilt(); needDb(); await setTierRaw("XT", "B");
    await mkAccount("FD", tA, { payeeType: "TH_FOUNDATION" }); await setTierRaw("FD", "B");
    const e0 = R(await S("resolveSetting")({ tenantId: tA }, "agency.wht.eWht", { unitId: uA }, NOW)).value;
    await setV(tA, [{ key: "agency.wht.eWht", scope: "UNIT", scopeId: uA, value: { enabled: true, rateBp: 100, untilPaidOn: "2027-12-31" } }]);
    try {
      const fd = R(okR(await shop("tryAgentPrice", cA(), tryIn("FD")), "มูลนิธิ").priced), xt = R(okR(await shop("tryAgentPrice", cA(), tryIn("XT")), "นิติบุคคล").priced);
      eq([wht(fd).rateBp, wht(fd).eWht, wht(fd).whtSatang, com(fd).remitToShopSatang], [1_000, false, refBp(AC.commissionSatang, 1_000), AC.collectSatang - AC.commissionSatang + refBp(AC.commissionSatang, 1_000)], "มูลนิธิ 10%");
      eq([wht(xt).rateBp, wht(xt).eWht, wht(xt).whtSatang, com(xt).remitToShopSatang], [100, true, refBp(AC.commissionSatang, 100), AC.collectSatang - AC.commissionSatang + refBp(AC.commissionSatang, 100)], "นิติบุคคล 1%");
      const fq = V(await quoteAgent(acc("FD").id, depMain), "quote มูลนิธิ");
      eq([wht(fq).rateBp, wht(fq).whtSatang], [1_000, refBp(AC.commissionSatang, 1_000)], "quote จริง มูลนิธิ");
    } finally { await setV(tA, [{ key: "agency.wht.eWht", scope: "UNIT", scopeId: uA, value: e0 }]); }
  });
  groupLine("ST");

  // ═══════════════ AU. audit / event ═══════════════
  console.log("\n── AU: audit และ event ──");
  await st("AU-1", "audit ของทุกการเขียน: action อยู่ในชุดที่ใบสั่งกำหนดและมีครบทุกชนิดที่รันนี้ทำ · actorType USER + actorId = ผู้กระทำ · คีย์ของ after ⊂ AGENT_RATE_AUDIT_KEYS · before/after ชั้นในมีเฉพาะคอลัมน์ของแถวราคา/card (ไม่มีชื่อ)", async () => {
    needBuilt();
    const rows = await q<{ action: string; actorType: string; actorId: string | null; after: unknown }>(`SELECT action, "actorType", "actorId", after FROM "AuditLog" WHERE "tenantId" = $1 AND (action LIKE 'agency.rate%' OR action LIKE 'agency.tier%')`, [tA]);
    ok(rows.length >= 40, `audit น้อยไป (${rows.length})`);
    const allowed = ["agency.rate_card.create", "agency.rate_card.update", "agency.rate_card.activate", "agency.rate_card.archive", "agency.rate.upsert", "agency.rate.deactivate", "agency.rate.reactivate", "agency.tier.ensure", "agency.tier.assign"];
    const seen = new Set(rows.map((r) => r.action));
    eq([...seen].filter((a) => !allowed.includes(a)), [], "action นอกชุด");
    eq(allowed.filter((a) => !seen.has(a)), [], "action ที่ควรมีแต่ไม่มี");
    const users = new Set([staff.OA.userId, staff.EDIT.userId]);
    eq(rows.filter((r) => r.actorType !== "USER" || !users.has(String(r.actorId))).map((r) => [r.action, r.actorType]).slice(0, 3), [], "ผู้กระทำ");
    const top = new Set(CO("AGENT_RATE_AUDIT_KEYS") as string[]);
    const inner = new Set([...(CO("SHOP_RATE_KEYS") as string[]), "status", "validFrom", "validTo", "tierId"].filter((k) => k !== "name"));
    for (const r of rows) {
      const a = R(r.after);
      eq(Object.keys(a).filter((k) => !top.has(k)), [], `${r.action}: คีย์ชั้นบน`);
      for (const side of ["before", "after"]) eq(Object.keys(R(a[side])).filter((k) => !inner.has(k)), [], `${r.action}: คีย์ใน ${side}`);
      ok(typeof a.cardId === "string" || typeof a.agentAccountId === "string" || r.action === "agency.tier.ensure", `${r.action}: ไม่มีตัวอ้างอิง`);
    }
  });
  await st("AU-2", "audit ไม่มีข้อความอิสระ/ข้อมูลเกิน: ไม่มีชื่อ card ที่ฝังเครื่องหมาย · ไม่มีชื่อเอเจนซี่ · ไม่มีคีย์ต้องห้าม · การแก้อัตราจดค่าก่อน/หลังเป็นจำนวนเต็ม (1200 → 1300)", async () => {
    needBuilt();
    const rows = await auditRows(tA);
    eq(leaks(rows.map((r) => r.j).join("\n"), [MARK_CARD, MARK_LEGAL, `${QC_MARK} บจก.`]), [], "ข้อความอิสระใน audit");
    eq([...new Set(rows.flatMap((r) => [...keysDeep(r.after)]))].filter((k) => NEVER_SHOW.includes(k) || k === "name" || k === "legalName"), [], "คีย์เกิน");
    ok(rows.some((r) => r.action === "agency.rate.upsert" && R(r.after).rateId === rPct && R(R(r.after).before).valueBp === 1200 && R(R(r.after).after).valueBp === 1300), "ไม่พบ audit ของการแก้ 1200 → 1300");
  });
  await st("AU-3", "คำสั่งที่ล้มไม่ทิ้ง audit: STALE · VALIDATION · FORBIDDEN · NOT_FOUND · BAD_STATE รวม 6 คำสั่ง ⇒ จำนวน audit เท่าเดิม · ไม่มี OutboxEvent ชนิด agency.rate* / agency.tier* ตลอดการรัน", async () => {
    needBuilt(); ok(cardR.id && cardArch, "ไม่มี card");
    const n0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]))[0]?.n;
    const v = await cardVer(cardR.id);
    const rs = [await shop("updateAgentRateCard", cA(), { cardId: cardR.id, expectedVersion: v - 1, patch: { priority: 1 } }), await shop("upsertAgentRate", cA(), { cardId: cardR.id, expectedVersion: v, rate: rateOf({ valueBp: 99_999 }) }),
      await shop("upsertAgentRate", ctxOf(tA, staff.VIEW), { cardId: cardR.id, expectedVersion: v, rate: rateOf({ valueBp: 1 }) }), await shop("upsertAgentRate", cB(), { cardId: cardR.id, expectedVersion: v, rate: rateOf({ valueBp: 1 }) }),
      await shop("upsertAgentRate", cA(), { cardId: cardArch, expectedVersion: await cardVer(cardArch), rate: rateOf({ valueBp: 1 }) }), await shop("setAgentAccountTier", cA(), { agentAccountId: acc("T1").id, tierCode: "A", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" })];
    eq(rs.map((r) => r.ok), [false, false, false, false, false, false], "ต้องล้มทั้งหมด");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]))[0]?.n, n0, "audit เพิ่มจากคำสั่งที่ล้ม");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND (type LIKE 'agency.rate%' OR type LIKE 'agency.tier%')`, [tenantIds]))[0]?.n, 0, "event");
  });
  await st("AU-4", "ค่าคงที่ของข้อมูลหลังรันทั้งชุด: ทุกแถวราคาอยู่ร้านเดียวกับ card · card ทุกใบมีเจ้าของชนิดเดียวและเจ้าของอยู่ร้านเดียวกัน · ไม่มี card ACTIVE ของเจ้าของเดียวกันที่ priority เท่ากันและช่วงซ้อน · version ≥ 1 · ไม่มีแถว active ที่ชนกันตามกติกา §4.2", async () => {
    needBuilt();
    const cross = await q<{ id: string }>(`SELECT r.id FROM "AgentRate" r JOIN "AgentRateCard" c ON c.id = r."rateCardId" WHERE c."tenantId" = ANY($1::text[]) AND r."tenantId" <> c."tenantId"`, [tenantIds]);
    const orphan = await q<{ id: string }>(`SELECT c.id FROM "AgentRateCard" c LEFT JOIN "AgentTier" t ON t.id = c."tierId" AND t."tenantId" = c."tenantId" LEFT JOIN "AgentAccount" a ON a.id = c."agentAccountId" AND a."tenantId" = c."tenantId" WHERE c."tenantId" = ANY($1::text[]) AND t.id IS NULL AND a.id IS NULL AND c.name <> 'pc'`, [tenantIds]);
    const overlap = await q<{ a: string }>(`SELECT x.id AS a FROM "AgentRateCard" x JOIN "AgentRateCard" y ON y.id > x.id AND y."tenantId" = x."tenantId" AND y.status = 'ACTIVE' AND y.priority = x.priority AND y."tierId" IS NOT DISTINCT FROM x."tierId" AND y."agentAccountId" IS NOT DISTINCT FROM x."agentAccountId"
      WHERE x."tenantId" = ANY($1::text[]) AND x.status = 'ACTIVE' AND COALESCE(x."validFrom", '-infinity') <= COALESCE(y."validTo", 'infinity') AND COALESCE(y."validFrom", '-infinity') <= COALESCE(x."validTo", 'infinity')`, [tenantIds]);
    const rateClash = await q<{ a: string }>(`SELECT x.id AS a FROM "AgentRate" x JOIN "AgentRate" y ON y.id > x.id AND y."rateCardId" = x."rateCardId" AND y.active AND y.priority = x.priority AND y."productKind" = x."productKind" AND y."productId" = x."productId"
        AND y."optionId" IS NOT DISTINCT FROM x."optionId" AND y."paxTypeId" IS NOT DISTINCT FROM x."paxTypeId" AND y."cabinTypeId" IS NOT DISTINCT FROM x."cabinTypeId"
      WHERE x."tenantId" = ANY($1::text[]) AND x.active AND x.id NOT LIKE 'a13qc_bulk_%' AND (x."bookFrom" IS NOT NULL OR x."bookTo" IS NOT NULL OR x."travelFrom" IS NOT NULL OR x."travelTo" IS NOT NULL) AND (y."bookFrom" IS NOT NULL OR y."bookTo" IS NOT NULL OR y."travelFrom" IS NOT NULL OR y."travelTo" IS NOT NULL)
        AND COALESCE(x."travelFrom", '-infinity') <= COALESCE(y."travelTo", 'infinity') AND COALESCE(y."travelFrom", '-infinity') <= COALESCE(x."travelTo", 'infinity') AND COALESCE(x."bookFrom", '-infinity') <= COALESCE(y."bookTo", 'infinity') AND COALESCE(y."bookFrom", '-infinity') <= COALESCE(x."bookTo", 'infinity')`, [tenantIds]);
    eq([cross.length, orphan.length, overlap.length, rateClash.length], [0, 0, 0, 0], "ค่าคงที่");
    ok(((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentRateCard" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]))[0]?.n ?? 0) >= 30, "card น้อยไป (ข้อนี้ต้องรันหลังกลุ่มอื่น)");
  });
  groupLine("AU");

  // ═══════════════ G. regression ═══════════════
  console.log("\n── G: regression ──");
  const child = (args: string[]) => spawnSync(join(ROOT, "node_modules/.bin/tsx"), args, { cwd: ROOT, env: process.env, encoding: "utf8", timeout: 40 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  const summary = (out: string): Rec | null => { const l = out.split("\n").find((x) => x.startsWith("JSON_SUMMARY ")); try { return l ? asRec(JSON.parse(l.slice(13))) : null; } catch { return null; } };
  if (NO_REG) {
    for (const [id, n] of [["G-1", "fitness"], ["G-2", "qc-trips-a1.2"], ["G-3", "qc-trips-t0.5"]]) skip(id, n, "--no-regression");
  } else {
    await st("G-1", "fitness: ไม่มี ❌ ใดเลย (เส้น agency→trips ผู้คุมเพิ่มแล้ว · F5.1 คง 52 · F17.1 ✅)", () => {
      needBuilt();
      const out = `${child(["scripts/fitness.mts"]).stdout ?? ""}`;
      ok(out.split("\n").some((l) => l.includes("✅") && l.includes("[F17.1]")), "ไม่มี ✅ [F17.1]");
      const bad = out.split("\n").filter((l) => l.includes("❌"));
      ok(bad.length === 0, `❌ ${bad.length}: ${bad.slice(0, 3).map((l) => l.trim().slice(0, 110)).join(" | ")}`);
    });
    await st("G-2", "qc-trips-a1.2 --no-regression: ที่ไม่ผ่านต้องเป็นข้อขอบเขตที่เห็น agency/index.ts · permissions.ts เปลี่ยน (S-*) เท่านั้น (ORACLE-EDIT ผู้คุม)", () => {
      needBuilt();
      const r = child(["scripts/qc-trips-a1.2.mts", "--no-regression"]);
      const s = summary(`${r.stdout ?? ""}`);
      ok(s, `ไม่มี JSON_SUMMARY (exit ${r.status})`);
      const failed = ((s?.failed as string[]) ?? []).filter((x) => !/^S-\d+$/.test(x));
      ok(failed.length === 0, `ไม่ผ่านนอกรายการ: ${failed.join(", ")}`);
    });
    await st("G-3", "qc-trips-t0.5: ตัวคิดราคาไม่ถอยหลัง — ที่ไม่ผ่านต้องเป็นข้อขอบเขต (S-*) เท่านั้น", () => {
      needBuilt();
      const r = child(["scripts/qc-trips-t0.5.mts"]);
      const s = summary(`${r.stdout ?? ""}`);
      ok(s, `ไม่มี JSON_SUMMARY (exit ${r.status})`);
      const failed = ((s?.failed as string[]) ?? []).filter((x) => !/^S-\d+$/.test(x));
      ok(failed.length === 0, `ไม่ผ่านนอกรายการ: ${failed.join(", ")}`);
    });
  }
  void installedOnce;
  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  for (const off of unregister) { try { off(); } catch { /* ignore */ } }
  try { await cleanupTenants(tenantIds); await cleanupUsers(); await cleanupGlobal(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as (...a: unknown[]) => unknown).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS A1.3a · ระดับ · rate card · ช่วงพิเศษ · port ราคาเอเจนซี่ · เครื่องลองคิด =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
process.exit(exitCode);
