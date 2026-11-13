// QC — TRIPS T0.8 · ผู้เดินทาง: แบบฟอร์มตั้งได้ · ลิงก์กรอกเอง · เอกสารรับทราบความเสี่ยง · ไฟล์ส่วนตัว + ผู้ดู LINK_CUSTOMER ใน route ไฟล์กลาง · ลบอัตโนมัติ (G5) · คำขอเจ้าของข้อมูล
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.8.md · ledger/TRIPS-CORE-CONTRACT.md §B.1 §D.4 ข้อ 5 §J.1–§J.4 · TRIPS-DEFAULTS T29 T30 T61–T68 X20–X22 · OQ17(ค) อนุญาต 13 พ.ย.
//
// กลุ่มข้อ:
//   PC ตัวควบคุมบวก (เขียวก่อนมีงาน)   S ไฟล์/facade/ขอบเขต (เทียบ BASE_SHA)   FS แกนบริสุทธิ์   LK ลิงก์กรอกเอง (token · หมดอายุ · เพิกถอน · เดา · อัตรา)
//   SB ส่งแบบฟอร์ม   HL สุขภาพ/ความยินยอม/ผู้เยาว์   WV เอกสารรับทราบความเสี่ยง   DC ไฟล์   CR route ไฟล์กลาง (ผู้ดูเดิมไม่เปลี่ยน + LINK_CUSTOMER)
//   MK ปิดบัง/เปิดดู   SE สิทธิ์ฝั่งร้าน   X แยกร้าน/หน่วย   PQ คำขอเจ้าของข้อมูล   RC ยิงพร้อมกัน   RT ลบตามอายุ (เขตเวลาหน่วย)   LE สแกนการรั่ว   EV event
//
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t08-*` ลบใน finally + กวาดค้างตอนเริ่ม · ไม่แตะร้าน seed
// 🔴 ที่เก็บไฟล์ = ปลอม: env SHARK_BUNNY_* ถูกตั้งเป็นค่าปลอมในโปรเซสนี้ + ดัก fetch ของ host ที่เก็บ (ไม่มีทางยิง Bunny จริง) · deps.put/del ที่ส่งให้บริการเขียนที่เดียวกัน
// 🔴 นาฬิกา = ctx.now / pctx.now · งานลบเรียกด้วย tenantIds ของข้อสอบเสมอ (ไม่ลบข้อมูลร้านอื่นในฐาน)
// 🔴 route ไฟล์กลางเรียก GET ตรง (นอก Next: cookie อ่านไม่ได้ ⇒ ไม่มีผู้ดู STAFF/CUSTOMER/PORTAL จาก cookie) — ผู้คุมทดสอบผ่าน Next จริงแยก
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.8.mts   (ห้าม timeout ครอบ)
// ผลที่ถูกต้องก่อนมี T0.8: PC เขียว · CR-1..CR-3 (ถดถอยของ route เดิม) เขียว · S-8 เขียวได้ · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

const LABEL = "qc-trips-t0.8";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** ปลาย wip/trips-t0.8 ตอนเขียนข้อสอบ (= session/trips: P0.1–T0.6 + T1.1) — ฐานของ S-8/S-9 */
const BASE_SHA = "4026db50488a756879496f94f97daf02724a4770";

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ ที่เก็บไฟล์ปลอม (ก่อน import โมดูลใด) ═══════════════
const FAKE_ZONE = "qcfake-zone-t08";
process.env.SHARK_BUNNY_ZONE = FAKE_ZONE;
process.env.SHARK_BUNNY_KEY = "qcfake-key";
process.env.SHARK_BUNNY_CDN = "https://qcfake-t08.invalid";
delete process.env.BUNNY_ACCOUNT_KEY;
const STORE = new Map<string, Uint8Array>();
const STORE_LOG: { op: string; path: string }[] = [];
let storageFail = false;
const STORAGE_PREFIX = `https://sg.storage.bunnycdn.com/${FAKE_ZONE}/`;
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("https://sg.storage.bunnycdn.com/")) {
    if (!url.startsWith(STORAGE_PREFIX)) return new Response(null, { status: 403 });
    const path = url.slice(STORAGE_PREFIX.length);
    const method = (init?.method ?? "GET").toUpperCase();
    STORE_LOG.push({ op: method, path });
    if (method === "PUT") {
      const b = init?.body;
      const bytes = b instanceof ArrayBuffer ? new Uint8Array(b) : b instanceof Uint8Array ? b : new Uint8Array(0);
      STORE.set(path, new Uint8Array(bytes));
      return new Response(null, { status: 201 });
    }
    if (method === "DELETE") { if (storageFail) return new Response(null, { status: 503 }); return new Response(null, { status: STORE.delete(path) ? 200 : 404 }); }
    const got = STORE.get(path);
    return got ? new Response(got.slice().buffer as ArrayBuffer, { status: 200 }) : new Response(null, { status: 404 });
  }
  if (url.startsWith("https://api.bunny.net/")) return new Response(null, { status: 200 });
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;
const fakePut = async (path: string, data: Uint8Array) => { STORE_LOG.push({ op: "PUT", path }); STORE.set(path, new Uint8Array(data)); };
const fakeDel = async (path: string) => { STORE_LOG.push({ op: "DELETE", path }); if (storageFail) return 503; return STORE.delete(path) ? 200 : 404; };
const DEPS = { put: fakePut, del: fakeDel };

// ═══════════════ harness ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
type AnyFn = (...a: unknown[]) => unknown;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? `<${x.length}B>` : x)) ?? String(v)).slice(0, 300); } catch { return String(v); } };
const ok: (cond: unknown, why: string) => asserts cond = (cond, why) => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string) => {
  cks.push({ id, res, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${why}` : ""}`);
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
const stripStrings = (s: string) => s.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""');
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t08qc${p}${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SLUG = "trips-t08-";
const EMAIL_PREFIX = "trips-t08-";
const CTL = `_qc_t08_ctl_${STAMP}`;
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const T0 = new Date(); // เริ่มรัน (สแกน OpsEvent)
/** ต้นวันถัดจาก ymd ตามเวลาไทย (UTC+7 ไม่มีเวลาออมแสง) */
const instAfter = (ymd: string) => new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)) + 1) - 7 * 3_600_000);
const addDays = (ymd: string, n: number) => new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)) + n)).toISOString().slice(0, 10);
const secs = (d: Date, s: number) => new Date(d.getTime() + s * 1000);

// ── ตัวบ่งชี้ที่ปลูก (ต้องไม่โผล่ใน event/audit/ops/error/URL/path) ──
const UP = STAMP.toUpperCase().replace(/[^A-Z0-9]/g, "");
const MK = { name: `Zqxname${STAMP}`, doc: `ZQ${UP}`.slice(0, 18), allergy: `zqxalg${STAMP}`, cond: `zqxcnd${STAMP}`, guardian: `Zqxgrd${STAMP}`, party: `Zqxpty${STAMP}`, file: `zqxfile${STAMP}` };
const TOKENS: string[] = [];
const ERRS: Rec[] = [];
const MARKERS = () => [MK.name, MK.doc, MK.allergy, MK.cond, MK.guardian, MK.party, ...TOKENS, ...TOKENS.map((t) => t.split(".")[1] ?? t)].filter((x) => x.length >= 10);
const leaks = (text: string): string[] => MARKERS().filter((m) => text.includes(m)).map((m) => m.slice(0, 14));

// ── สเปกจากใบสั่ง ──
const D = "src/lib/modules/trips/";
const OWN = ["passengers-core.ts", "passengers.ts", "pdpa.ts", "passenger-actions.ts"].map((f) => D + f);
const PAX_KEYS = ["fullName", "nationality", "dob", "sex", "docType", "docNumber", "docExpiry", "phone", "birthPlace", "certLevel", "diveCount", "lastDiveAt", "finSize", "allergies", "pickupHotel"];
const CONSENT_TH = "ข้าพเจ้ายินยอมให้ร้านเก็บและใช้ข้อมูลสุขภาพของผู้เดินทางคนนี้ (อาหารที่แพ้ โรคประจำตัว แบบฟอร์มแพทย์) เพื่อความปลอดภัยและการจัดบริการของทริปนี้เท่านั้น ข้อมูลจะถูกลบตามระยะเวลาที่ร้านกำหนด และถอนความยินยอมได้ทุกเมื่อจากลิงก์นี้หรือแจ้งร้าน";
const CONSENT_EN = "I consent to the shop collecting and using this traveller's health information (food allergies, medical conditions, medical form) only for the safety and service of this trip. The information will be deleted after the shop's retention period, and I can withdraw consent at any time from this link or by telling the shop.";
const CONSENT_VERSION = "trips.health-consent.v1";
const CONSENT_HASH = sha256hex(JSON.stringify([CONSENT_VERSION, CONSENT_TH, CONSENT_EN]));
const tplHash = (t: { th: string; en?: string }) => sha256hex(JSON.stringify(["trips.waiver.v1", t.th, t.en ?? null]));
const FNS_CORE = ["resolveFormSpec", "waiverTemplateHash", "ageAt", "minorStatus", "normalizeDocNumber", "docLast4Of", "maskDoc", "maskDob", "retentionDueYmd", "purgeInstant", "canSeeSensitive"];
const FNS_SVC = ["getTripPassengers", "ensurePassengerSlots", "updateTripPassenger", "setPassengerFormStatus", "issuePassengerFormLink", "issueBookingFormLinks", "revokePassengerFormLink",
  "recordWitnessedWaiver", "uploadPassengerDocumentStaff", "passengerDocumentUrl", "revealPassengerData", "withdrawHealthConsentStaff",
  "openPassengerForm", "submitPassengerForm", "signPassengerWaiver", "uploadPassengerDocument", "withdrawHealthConsent", "customerDocumentUrl", "linkCustomerMayOpenFile",
  "purgeTripPersonalDataForUnit", "runPdpaPurge", "recordPdpaRequest", "listPdpaRequests", "resolvePdpaRequest", "exportPassengerData"];
const PERM_KEYS = ["trips.passenger.view", "trips.passenger.edit", "trips.passenger.reveal", "trips.passenger.health", "trips.pdpa.manage"];
const EVENTS = ["trips.passenger.form_completed", "trips.document.purged"];
const NOW0 = "2027-03-01T03:00:00.000Z";
// ไฟล์ทดสอบ (magic bytes จริง)
const JPG = (n = 64) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };
const PNG = (n = 64) => { const b = new Uint8Array(n); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return b; };
const PDF = (n = 64) => { const b = new Uint8Array(n); b.set([0x25, 0x50, 0x44, 0x46, 0x2d]); return b; };

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 30 });
const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
async function insertRow(table: string, vals: Rec): Promise<string> {
  const v: Rec = { ...vals };
  const cs = await cols(table);
  if (!cs.length) throw new AssertFail(`ไม่มีตาราง ${table}`);
  const names = new Set(cs.map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of cs) {
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
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  let pending = (await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t).filter((t) => t !== "Tenant");
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupMisc() {
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
    if (us.length) { for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* */ } } await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]); }
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
  try { await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'trips:token:t08qc%' OR key LIKE 'files:private:LINK_CUSTOMER:%' OR key LIKE 'files:private:ip:198.51.100.%' OR key LIKE '_qc_t08_%'`); } catch { /* */ }
  try { for (const r of await q<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = current_schema() AND tablename LIKE '_qc_t08_ctl_%'`)) await pool.query(`DROP TABLE IF EXISTS "${r.t}"`); } catch { /* */ }
}
const tenantIds: string[] = [];

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupMisc();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SET = (await tryImport("@/lib/core/settings")).mod;
  const BOX = (await tryImport("@/lib/core/integrations/secret-box")).mod;
  const SL = (await tryImport("@/lib/core/signed-link")).mod;
  const STO = (await tryImport("@/lib/storage/service")).mod;
  const PLI = await tryImport("@/lib/storage/private-links");
  const RL = (await tryImport("@/lib/core/rate-limit-db")).mod;
  const ROUTE = await tryImport("@/app/api/files/[id]/route");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`โหลดโมดูล trips ไม่ได้ (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name} (T0.8 ยังไม่สร้าง)`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    let r: Rec;
    try { r = asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { r = { ok: "THROW", e: errMsg(e) }; }
    if (r.ok !== true) ERRS.push(r);
    return r;
  };
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const codeR = (r: Rec, code: string | string[], what: string, reason?: string) => {
    const cs = Array.isArray(code) ? code : [code];
    ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`);
    if (reason) eq(asRec(r.details)?.reason, reason, `${what} details.reason`);
  };
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ไม่มี ${name}`); return f as AnyFn; };
  const seal = (obj: Rec, aad: string): string => String((BOX?.sealIntegrationSecret as AnyFn)(obj, aad));
  const open = (box: unknown, aad: string): Rec | null => asRec((BOX?.openIntegrationSecret as AnyFn)(box, aad));
  const outbox = async (type: string, tids = tenantIds) => (await q<{ payload: Rec; idempotencyKey: string; createdAt: Date }>(`SELECT payload, "idempotencyKey", "createdAt" FROM "OutboxEvent" WHERE type = $1 AND "tenantId" = ANY($2::text[]) ORDER BY "createdAt", id`, [type, tids]));
  const audits = async (action: string, targetId?: string) => (await q<{ id: string; after: Rec | null; before: Rec | null; actorType: string; actorId: string | null; targetId: string | null; createdAt: Date }>(
    `SELECT id, after, before, "actorType", "actorId", "targetId", "createdAt" FROM "AuditLog" WHERE action = $1 AND "tenantId" = ANY($2::text[]) ${targetId ? `AND "targetId" = $3` : ""} ORDER BY "createdAt", id`, targetId ? [action, tenantIds, targetId] : [action, tenantIds]));
  const pax = async (id: string) => (await q<Rec>(`SELECT * FROM "TripPassenger" WHERE id = $1`, [id]))[0] ?? {};
  const docRow = async (id: string) => (await q<Rec>(`SELECT * FROM "TripDocument" WHERE id = $1`, [id]))[0] ?? null;
  const revOf = (row: Rec) => Number(asRec(row.answers)?.rev ?? 0);

  // ═══════════════ PC. ตัวควบคุมบวก ═══════════════
  console.log("\n── PC: ตัวควบคุมบวก ──");
  let ctlErr = "";
  try { await pool.query(`CREATE TABLE "${CTL}" (id text PRIMARY KEY, rev int NOT NULL DEFAULT 0, v text)`); } catch (e) { ctlErr = errMsg(e); }
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed andaman-dive อยู่ · สร้างตารางควบคุมได้ · ตาราง TripPassenger/TripDocument/TripDocView/TripPdpaRequest มีครบ", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = 'andaman-dive'`))[0]?.n, 1, "ร้าน seed");
    ok(!ctlErr, `ตารางควบคุม: ${ctlErr}`);
    for (const t of ["TripPassenger", "TripDocument", "TripDocView", "TripPdpaRequest"]) ok((await cols(t)).length > 0, `ไม่มี ${t}`);
    eq(await checkLits("TripDocView", "viewerKind"), ["STAFF", "AGENT", "LINK_CUSTOMER", "CUSTOMER"], "CHECK viewerKind");
  });
  await st("PC-2", "กล่องปิดผนึก (secret-box) เปิดได้ด้วย AAD เดิมเท่านั้น · AAD อื่น ⇒ null", () => {
    ok(typeof BOX?.sealIntegrationSecret === "function", "ไม่มี secret-box");
    const b = seal({ v: 1, n: MK.doc }, "trips.pax.doc.v1:a:b");
    eq(open(b, "trips.pax.doc.v1:a:b"), { v: 1, n: MK.doc }, "เปิด");
    eq(open(b, "trips.pax.doc.v1:a:c"), null, "AAD อื่น");
    ok(!b.includes(MK.doc), "กล่องมีข้อความดิบ");
  });
  await st("PC-3", "signLink/verifyLink: ถูก ⇒ {tenantId, subjectId} · แก้ payload/ลายเซ็น/จุดประสงค์ ⇒ null", () => {
    const sign = SL?.signLink as AnyFn | undefined, ver = SL?.verifyLink as AnyFn | undefined;
    ok(sign && ver, "ไม่มี signed-link");
    const t = String(sign({ tenantId: "tX", purpose: "trips.pax-form", subjectId: "pX", expMin: 10 }));
    eq(ver(t, "trips.pax-form"), { tenantId: "tX", subjectId: "pX" }, "ถูก");
    eq(ver(t, "other.purpose"), null, "จุดประสงค์อื่น");
    const [p, s] = t.split(".");
    eq(ver(`${p}.${s.slice(0, -2)}AA`, "trips.pax-form"), null, "ลายเซ็นปลอม");
  });
  const FILE_KEY = () => `private-file:v1:${process.env.SESSION_SECRET ?? ""}`;
  const mintSig = (fileId: string, exp: number, viewerKey: string) => createHmac("sha256", FILE_KEY()).update(`${fileId}.${exp}.${viewerKey}`).digest("hex");
  await st("PC-4", "ลิงก์ไฟล์ส่วนตัว: สูตรลายเซ็นของข้อสอบ = signPrivateFile (STAFF/CUSTOMER/PORTAL) · ผู้ดูอื่นตรวจไม่ผ่าน · TTL ≤ 900", () => {
    const P = PLI.mod; ok(P, `ไม่มี private-links (${PLI.err})`);
    const exp = Math.floor(Date.now() / 1000) + 200;
    for (const kind of ["STAFF", "CUSTOMER", "PORTAL"]) eq((P!.signPrivateFile as AnyFn)("abcdefghijklmnop1234", exp, { kind, id: "u1" }), mintSig("abcdefghijklmnop1234", exp, `${kind}:u1`), `สูตร ${kind}`);
    const url = String((P!.privateFileUrl as AnyFn)("abcdefghijklmnop1234", { kind: "STAFF", id: "u1" }, 5000));
    const u = new URL(`http://x${url}`);
    ok(Number(u.searchParams.get("exp")) - Math.floor(Date.now() / 1000) <= 900, "TTL เกิน 900");
    eq((P!.privateFileSignatureOk as AnyFn)("abcdefghijklmnop1234", u.searchParams.get("exp"), u.searchParams.get("sig"), { kind: "STAFF", id: "u2" }), false, "ผู้ดูอื่น");
  });
  await st("PC-5", "checkRateLimitDb: limit 3 ⇒ ครั้งที่ 4 ไม่ผ่าน (ถังของข้อสอบ)", async () => {
    const f = RL?.checkRateLimitDb as AnyFn; ok(f, "ไม่มี rate-limit-db");
    const key = `_qc_t08_${STAMP}`;
    const rs: boolean[] = [];
    for (let i = 0; i < 4; i++) rs.push(Boolean(asRec(await f(key, { limit: 3, windowMs: 60_000 }))?.ok));
    eq(rs, [true, true, true, false], "ผล");
  });
  const tPC = rid("tpc");
  await st("PC-6", "ที่เก็บปลอม: uploadFile private ⇒ path t/<ร้าน>/private/<40hex> + cdnUrl private:// · deleteFileAsset ลบแถว+วัตถุ (ไม่มีทางยิงของจริง)", async () => {
    await insertRow("Tenant", { id: tPC, name: "pc t08", slug: `${SLUG}${STAMP}-pc`, updatedAt: new Date() }); tenantIds.push(tPC);
    const up = asRec(await (STO?.uploadFile as AnyFn)({ tenantId: tPC }, { kind: "ATTACHMENT", filename: "x.jpg", contentType: "image/jpeg", data: JPG(), visibility: "private" })) ?? {};
    ok(up.ok === true, `upload: ${fmt(up)}`);
    const fa = (await q<{ path: string; cdnUrl: string }>(`SELECT path, "cdnUrl" FROM "FileAsset" WHERE id = $1`, [up.assetId]))[0];
    ok(fa && new RegExp(`^t/${tPC}/private/[0-9a-f]{40}\\.jpg$`).test(fa.path) && fa.cdnUrl === `private://${fa.path}` && STORE.has(fa.path), `แถว ${fmt(fa)}`);
    const del = asRec(await (STO?.deleteFileAsset as AnyFn)({ tenantId: tPC }, up.assetId)) ?? {};
    ok(del.ok === true && !STORE.has(fa.path), `delete ${fmt(del)}`);
    eq((await q(`SELECT 1 FROM "FileAsset" WHERE id = $1`, [up.assetId])).length, 0, "แถว FileAsset");
  });
  await st("PC-7", "ตัวควบคุมการแข่ง: 10 คำสั่ง UPDATE … WHERE rev = 0 พร้อมกัน ⇒ สำเร็จ 1", async () => {
    ok(!ctlErr, "ไม่มีตารางควบคุม");
    const id = rid("c"); await pool.query(`INSERT INTO "${CTL}" (id) VALUES ($1)`, [id]);
    const n = await Promise.all(Array.from({ length: 10 }, async (_, i) => (await pool.query(`UPDATE "${CTL}" SET rev = rev + 1, v = $2 WHERE id = $1 AND rev = 0`, [id, `w${i}`])).rowCount ?? 0));
    eq(n.reduce((a, b) => a + b, 0), 1, "ผู้ชนะ");
  });
  await st("PC-8", "ตัวสแกนการรั่วจับได้: ปลูกตัวบ่งชี้ใน OutboxEvent ของร้านทดสอบ ⇒ เจอ", async () => {
    await insertRow("OutboxEvent", { id: rid("ob"), tenantId: tPC, type: "qc.t08.control", payload: JSON.stringify({ x: MK.doc }), idempotencyKey: rid("k") });
    const rows = await q<{ payload: Rec }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'qc.t08.control'`, [tPC]);
    ok(leaks(JSON.stringify(rows)).length > 0, "ตัวสแกนไม่เจอ");
    await pool.query(`DELETE FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'qc.t08.control'`, [tPC]);
  });
  await st("PC-9", "เขตเวลา: 2027-03-10T17:30Z = 11 มี.ค. เวลาไทย · ต้นวันถัดจาก 2027-04-10 = 2027-04-10T17:00Z", () => {
    eq(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date("2027-03-10T17:30:00Z")), "2027-03-11", "วันที่ไทย");
    eq(instAfter("2027-04-10").toISOString(), "2027-04-10T17:00:00.000Z", "ต้นวันถัดไป");
    eq(addDays("2027-03-11", 365), "2028-03-10", "บวกวันข้ามปีอธิกสุรทิน");
  });
  groupLine("PC");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("ta"), tB = rid("tb"), uA = rid("ua"), uA2 = rid("ub"), uB = rid("uc");
  let setupErr = "";
  const U: Record<string, Rec> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; adult: string }> = {};
  let seq = 0;
  try {
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T0.8 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uA2, tA, "a2"], [uB, tB, "b"]] as const) await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({ timezone: "Asia/Bangkok" }), updatedAt: new Date() });
    const mkUser = async (tag: string, tenantId: string, role: string, perms: Rec, unitAccess: string[] = ["*"]) => {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`m${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(perms), acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role, unitAccess, permissions: perms, userId: id };
    };
    await mkUser("oa", tA, "OWNER", {}); await mkUser("ob", tB, "OWNER", {});
    await mkUser("mg", tA, "MANAGER", {});
    await mkUser("sv", tA, "STAFF", { "trips.passenger.view": true });
    await mkUser("se", tA, "STAFF", { "trips.passenger.view": true, "trips.passenger.edit": true, "trips.*": true });
    await mkUser("sh", tA, "STAFF", { "trips.passenger.view": true, "trips.passenger.edit": true, "trips.passenger.health": true });
    await mkUser("sr", tA, "STAFF", { "trips.passenger.view": true, "trips.passenger.reveal": true });
    await mkUser("su2", tA, "STAFF", { "trips.passenger.view": true, "trips.passenger.edit": true }, [uA2]);
    await mkUser("pm", tA, "STAFF", { "trips.pdpa.manage": true });
    const mkProd = async (key: string, tenantId: string, unitId: string, flags: { deepDive?: boolean; crossBorder?: boolean } = {}) => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t08qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}` }), body: "{}", currency: "THB", deepDive: !!flags.deepDive, crossBorder: !!flags.crossBorder, updatedAt: new Date() });
      await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const adult = await insertRow("TripPaxType", { id: rid("pt"), tenantId, unitId, productId: id, code: "ADULT", label: JSON.stringify({ th: "ผู้ใหญ่" }), countsCapacity: true, active: true, sortOrder: 0, updatedAt: new Date() });
      await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: adult, cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: 350_000, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt: o, unit: unitId, tenant: tenantId, adult };
    };
    await mkProd("PD", tA, uA, { deepDive: true }); await mkProd("PT", tA, uA); await mkProd("PX", tA, uA, { crossBorder: true });
    await mkProd("PC", tA, uA2, { deepDive: true }); await mkProd("PB", tB, uB, { deepDive: true });
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านไม่สำเร็จ: ${setupErr}`); }
  const setV = async (tenantId: string, changes: Rec[], who = "oa") => {
    const r = asRec(await S("setSettings")(U[who], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  const FIELDS = (req: string[], opt: string[] = [], cross: string[] = []) => Object.fromEntries(PAX_KEYS.map((k) => [k, req.includes(k) ? "REQUIRED" : opt.includes(k) ? "OPTIONAL" : cross.includes(k) ? "REQUIRED_CROSS_BORDER" : "OFF"]));
  const VATREG = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
  const RET_A = { passportImageDays: 30, medicalFormDays: 365, riskAckDays: 1095, consentAccessLogDays: 1100, manifestDays: 500, taxDocsDays: 1825 };
  let settingsErr = "";
  try {
    if (!setupErr) {
      const P = (k: string) => PRD[k].id;
      await setV(tA, [
        { key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uA, value: VATREG }, { key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uA2, value: VATREG },
        { key: "trips.pdpa.retention", scope: "UNIT", scopeId: uA, value: RET_A },
        { key: "trips.pdpa.retention", scope: "UNIT", scopeId: uA2, value: { ...RET_A, passportImageDays: null } },
        { key: "trips.pdpa.maskOnScreen", scope: "UNIT", scopeId: uA2, value: false },
        { key: "trips.public.rateLimits", scope: "UNIT", scopeId: uA2, value: { holdPerHourPerContact: 10, otpPer15Min: 5, tokenPerHourPerDevice: 3 } },
        { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PD"), value: FIELDS(["fullName", "nationality", "dob", "docType", "docNumber", "certLevel", "diveCount"], ["allergies", "finSize", "phone", "sex"]) },
        { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: P("PD"), value: true },
        { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: P("PD"), value: "SCUBA_ONLY" },
        { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PT"), value: FIELDS(["fullName"], ["allergies", "pickupHotel"]) },
        { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: P("PT"), value: false },
        { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: P("PT"), value: "NONE" },
        { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PX"), value: FIELDS(["fullName", "nationality", "docType", "docNumber"], [], ["birthPlace"]) },
        { key: "trips.pdpa.healthDataProducts", scope: "PRODUCT", scopeId: P("PX"), value: false },
        { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: P("PX"), value: "ALL" },
        { key: "trips.pax.passportCutoffDays", scope: "PRODUCT", scopeId: P("PX"), value: { domestic: 3, crossBorder: 21 } },
        { key: "trips.pax.fields", scope: "PRODUCT", scopeId: P("PC"), value: FIELDS(["fullName", "dob", "docNumber", "docType"]) },
      ]);
      await setV(tB, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uB, value: VATREG }], "ob");
    }
  } catch (e) { settingsErr = errMsg(e); console.log(`  ⚠️ ตั้งค่าตั้งไม่สำเร็จ: ${settingsErr}`); }
  const needDb = () => { ok(!setupErr && PRD.PD, `ไม่มีร้านทดสอบ (${setupErr})`); ok(!settingsErr, `ค่าตั้ง: ${settingsErr}`); };
  const mkDep = async (key: string, date: string, o: { endsAt?: Date } = {}): Promise<string> => {
    const p = PRD[key]; const startsAt = new Date(BKK(date, "08:00").getTime() + (seq++ % 600) * 60_000); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: o.endsAt ?? new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "OPEN", capacity: 40, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  const staff = (who = "oa", o: { unit?: string; tenant?: string; now?: string | Date } = {}): Rec => ({ tenantId: o.tenant ?? (who === "ob" ? tB : tA), unitId: o.unit ?? (who === "ob" ? uB : uA), channel: "COUNTER", actor: { kind: "STAFF", userId: String(U[who]?.userId ?? "x") }, now: new Date(o.now ?? NOW0), locale: "th" });
  let pubN = 0;
  const pctx = (now: string | Date = NOW0, ck?: string): Rec => ({ clientKey: ck ?? `t08qc_c${pubN++}_${hex(3)}`, now: new Date(now), locale: "th" });
  type Bk = { bookingId: string; pax: string[]; dep: string; key: string };
  const mkBooking = async (key: string, names: string[], o: { date?: string; seats?: number; endsAt?: Date } = {}): Promise<Bk> => {
    const p = PRD[key]; const dep = await mkDep(key, o.date ?? "2027-03-10", { endsAt: o.endsAt });
    const ctx = staff(p.tenant === tB ? "ob" : "oa", { unit: p.unit, tenant: p.tenant });
    const line = { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax: [{ paxTypeId: p.adult, qty: o.seats ?? names.length }], extras: [] };
    const qr = asRec(await fn("quoteTrips")(ctx, { lines: [line] }, {})) ?? {};
    const quote = V(qr, "quoteTrips");
    const r = asRec(await fn("bookTripsNow")(ctx, { quote: { lines: [line] }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `n${hex(6)}`, booker: { name: `ผู้จอง ${hex(2)}`, phone: `08${String(10_000_000 + Number.parseInt(hex(3), 16) % 89_999_999).slice(-8)}` },
      pay: { method: "PAY_LATER" }, passengers: names.map((n) => ({ name: n, paxTypeId: p.adult })) }, {})) ?? {};
    ok(r.ok === true, `bookTripsNow (T0.6): ${fmt(r)}`);
    const bookingId = String(asArr(r.value)[0]?.bookingId ?? "");
    // ORACLE-EDIT (ผู้คุม 13 พ.ย.): T0.6 สร้างผู้เดินทางด้วย createMany (createdAt เท่ากัน · id สุ่ม) ⇒ เรียงตามชื่อที่ส่งเข้าไป ไม่ใช่ (createdAt, id)
    const rows = await q<{ id: string; fullName: string | null }>(`SELECT id, "fullName" FROM "TripPassenger" WHERE "bookingId" = $1 ORDER BY "createdAt", id`, [bookingId]);
    const ids = [...rows].sort((a, b) => names.indexOf(String(a.fullName)) - names.indexOf(String(b.fullName))).map((x) => x.id);
    return { bookingId, pax: ids, dep, key };
  };
  const issue = async (pid: string, who = "oa", now: string | Date = NOW0, unit = uA): Promise<{ token: string; expiresAt: string }> => {
    const v = V(await call("issuePassengerFormLink", staff(who, { now, unit }), { passengerId: pid }), "issuePassengerFormLink");
    const token = String(v.token ?? ""); TOKENS.push(token);
    return { token, expiresAt: String(v.expiresAt ?? "") };
  };
  const curTemplate = async (key: string): Promise<{ th: string; en?: string }> => {
    const r = asRec(await S("resolveSettings")({ tenantId: tA }, ["trips.waiver.template"], { unitId: PRD[key].unit, productId: PRD[key].id }, new Date(NOW0))) ?? {};
    const v = asRec(asRec(r["trips.waiver.template"])?.value) ?? {};
    return { th: String(v.th ?? ""), ...(typeof v.en === "string" ? { en: v.en } : {}) };
  };
  const consent = { accepted: true, textHash: CONSENT_HASH, locale: "th" };
  const fullPD = (o: Rec = {}): Rec => ({ fullName: MK.name, nationality: "TH", dob: "1990-05-06", docType: "PASSPORT", docNumber: MK.doc, certLevel: "AOW", diveCount: 48, ...o });

  // ═══════════════ S. ไฟล์ · facade · ขอบเขต ═══════════════
  console.log("\n── S: ไฟล์ · facade · ขอบเขต ──");
  const srcOf = (p: string) => stripComments(read(p));
  await st("S-1", "ไฟล์เจ้าของครบ: passengers-core · passengers · pdpa · passenger-actions", () => {
    const miss = OWN.filter((f) => !existsSync(join(ROOT, f))); ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
  await st("S-2", `facade ส่งออก ${FNS_CORE.length + FNS_SVC.length} ฟังก์ชัน + PAX_FIELD_KEYS + HEALTH_CONSENT_V1 · บล็อก "// TRIPS T0.8 ▸" · ไม่มี export *`, () => {
    const t = needTrips();
    const miss = [...FNS_CORE, ...FNS_SVC].filter((n) => typeof t[n] !== "function").concat(["PAX_FIELD_KEYS", "HEALTH_CONSENT_V1"].filter((n) => t[n] === undefined));
    ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 8).join(", ")}`);
    const idx = read(D + "index.ts"); ok(/\/\/\s*TRIPS T0\.8 ▸/.test(idx), "ไม่มีบล็อก TRIPS T0.8"); ok(!/export\s*\*\s*from/.test(stripComments(idx)), "export *");
  });
  await st("S-3", "passengers-core บริสุทธิ์: import ได้แค่ zod · node:crypto · import type · ไม่มี prisma/tenantDb/Date.now/new Date()", () => {
    const s = srcOf(D + "passengers-core.ts"); ok(s, "ยังไม่มีไฟล์");
    const bad = [...s.matchAll(/^import\s+(?!type\b)[^;]*?from\s*["']([^"']+)["']/gm)].map((m) => m[1]).filter((x) => !["zod", "node:crypto"].includes(x));
    ok(bad.length === 0, `import: ${bad.join(", ")}`);
    ok(!/\b(prisma|tenantDb|\$queryRaw|\$transaction|Date\.now\(\)|new Date\(\))/.test(s), "ไม่บริสุทธิ์");
  });
  await st("S-4", "passenger-actions: \"use server\" · ส่งออกเฉพาะ async function · requireUnit + assertCan ทุกตัว · ใช้คีย์ trips.passenger.* / trips.pdpa.manage · ไม่ส่ง now · ไม่ปลอมผู้กระทำ", () => {
    const raw = read(D + "passenger-actions.ts"); ok(raw, "ยังไม่มีไฟล์");
    const s = stripComments(raw);
    ok(/^\s*["']use server["'];?/.test(s.trimStart()), "ไม่ขึ้นต้น use server");
    ok([...s.matchAll(/^export\s+(?!async\s+function\b)(\S+)/gm)].length === 0, "export อื่น");
    const bodies = s.split(/export\s+async\s+function\s+/).slice(1);
    ok(bodies.length >= 8, `action ${bodies.length} ตัว`);
    const bad = bodies.filter((b) => !/requireUnit\(/.test(b) || !/assertCan\(/.test(b)).map((b) => b.slice(0, 30));
    ok(bad.length === 0, `ไม่ตรวจสิทธิ์: ${bad.join(" | ")}`);
    ok(PERM_KEYS.every((k) => raw.includes(`"${k}"`)), "ไม่ได้ใช้คีย์ครบ 5");
    ok(!/kind\s*:\s*["'](SYSTEM|PUBLIC|AGENT)["']/.test(s) && !/\bnow\s*:/.test(stripStrings(s)), "ปลอมผู้กระทำ/ส่ง now");
  });
  await st("S-5", "ไฟล์ของใบ: ไม่มี any · console.* · Math.random · DELETE/.delete(/.deleteMany( (ไม่ลบแถว Trip*)", () => {
    const bad: string[] = [];
    for (const f of OWN) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มี)`); continue; }
      if (/(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(s)) bad.push(`${f}: any`);
      if (/\bconsole\.(log|info|warn|error|debug)\s*\(/.test(s)) bad.push(`${f}: console`);
      if (/Math\.random/.test(s)) bad.push(`${f}: Math.random`);
      if (/\.(delete|deleteMany)\s*\(|DELETE\s+FROM/i.test(s)) bad.push(`${f}: ลบแถว`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-6", "import ของ passengers/pdpa/actions: @/lib/core/* · @/lib/storage/service · @/lib/storage/sniff · ./ · zod · @prisma/client · node:crypto (actions: + next/ @/lib/) · ไม่มี prisma ดิบ · ไม่มีเส้นข้ามโมดูลใหม่", () => {
    const bad: string[] = [];
    const okSpec = (sp: string) => sp.startsWith("@/lib/core/") || ["@/lib/storage/service", "@/lib/storage/sniff", "zod", "@prisma/client", "node:crypto"].includes(sp) || sp.startsWith("./");
    for (const f of [D + "passengers.ts", D + "pdpa.ts", D + "passenger-actions.ts"]) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มี)`); continue; }
      if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s)) bad.push(`${f}: prisma ดิบ`);
      for (const m of s.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) if (!okSpec(m[1]) && !(f.endsWith("actions.ts") && (m[1].startsWith("@/lib/") || m[1].startsWith("next/")) && !m[1].startsWith("@/lib/modules/"))) bad.push(`${f}→${m[1]}`);
      for (const m of s.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) if (!okSpec(m[1])) bad.push(`${f}→${m[1]}`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-7", "OQ18: ไม่ส่ง object ผู้เรียกเข้า Prisma data · มี zod strict · settings/storage/rate-limit ไม่อยู่ใน 40 บรรทัดหลัง $transaction(", () => {
    const bad: string[] = [];
    for (const f of OWN.slice(0, 3)) {
      const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มี)`); continue; }
      if (/\bdata\s*:\s*(input|req|args|body|raw|params|payload|p\.data|parsed\.data)\b/.test(s) || /\bdata\s*:\s*\{\s*\.\.\.(input|req|args|body|raw|params|payload|p\.data)\b/.test(s)) bad.push(`${f}: data = object ผู้เรียก`);
      const lines = s.split("\n");
      lines.forEach((l, i) => { if (/\$transaction\(/.test(l)) { const win = lines.slice(i, i + 40).join("\n"); if (/\b(resolveSettings|uploadFile|deleteFileAsset|checkRateLimitDb)\(/.test(win)) bad.push(`${f}:${i + 1} เรียก I/O ใน tx`); } });
    }
    ok(/(z\.strictObject\(|\.strict\(\))/.test(srcOf(D + "passengers-core.ts") + srcOf(D + "passengers.ts")), "ไม่มี zod strict");
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-8", `ขอบเขตเทียบ BASE ${BASE_SHA.slice(0, 9)}: ไม่แตะ prisma · core/settings · core/sellable · storage (ยกเว้น private-links ลบ ≤ 2) · api/files (ยกเว้น [id]/route.ts ลบ 0) · pos/hotel/rooms/booking/dorm/queue/ticket/party/member/crm · ไฟล์ T0.1–T0.6 (ยกเว้น index/jobs) · ข้อสอบเดิม`, () => {
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", "หา BASE_SHA ไม่เจอ");
    const trips = ["booking.ts", "booking-core.ts", "booking-actions.ts", "state.ts", "numbering.ts", "sellable-impl.ts", "capacity.ts", "capacity-core.ts", "capacity-service.ts", "capacity-actions.ts", "pricing.ts", "pricing-core.ts", "pricing-actions.ts", "promo.ts", "prices.ts", "snapshot.ts",
      "products.ts", "products-core.ts", "product-actions.ts", "departures.ts", "departures-core.ts", "departure-actions.ts", "resources.ts", "waitlist.ts", "money-math.ts", "json-schemas.ts", "pickup.ts", "pickup-core.ts", "pickup-actions.ts", "screens.ts", "screen-actions.ts", "trips-settings.ts"].map((f) => D + f);
    const paths = ["prisma", "src/lib/core/settings", "src/lib/core/sellable.ts", "src/lib/platform/sellables.ts", "src/lib/platform/basket.ts", "src/lib/storage", "src/app/api/files", ...trips,
      ...["pos", "rooms", "hotel", "booking", "dorm", "queue", "ticket", "party", "member", "crm"].map((m) => `src/lib/modules/${m}`),
      ...["p0.1", "t0.1", "t0.2", "t0.3", "t0.4", "t0.5", "t0.6", "t1.1"].map((w) => `scripts/qc-trips-${w}.mts`), "scripts/trips-fixture.mts", "scripts/trips-qc-env.mts"];
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...paths]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n")].filter(Boolean))];
    const ours = changed.filter((f) => git(["diff", "--name-only", "session/trips", "--", f]).trim() !== "" || git(["ls-files", "--others", "--exclude-standard", "--", f]).trim() !== "");
    const allowed = new Set(["src/app/api/files/[id]/route.ts", "src/lib/storage/private-links.ts", "src/lib/modules/trips/booking-core.ts" /* ORACLE-EDIT S-8 (ผู้คุม 13 พ.ย.): มติ P7 — export text เพิ่ม 1 บรรทัด */]);
    ok(ours.filter((f) => !allowed.has(f)).length === 0, `แตะ: ${ours.filter((f) => !allowed.has(f)).slice(0, 6).join(", ")}`);
    const rows = git(["diff", "--numstat", BASE_SHA, "--", "src/app/api/files/[id]/route.ts", "src/lib/storage/private-links.ts", "src/lib/modules/trips/booking-core.ts"]).split("\n").filter(Boolean).map((l) => l.split("\t"));
    const del = rows.filter((r) => Number(r[1]) > (r[2].endsWith("private-links.ts") ? 2 : 0)).map((r) => `${r[2]} −${r[1]}`);
    ok(del.length === 0, `route ไฟล์กลางลบ/แก้บรรทัดเกินที่อนุญาต: ${del.join(", ")}`);
  });
  await st("S-9", "jobs.ts ต่อท้ายอย่างเดียว (ลบ 0) + runPdpaPurge ในบล็อก // ── T0.8 pdpa ── · minute-jobs ลงทะเบียน trips.pdpaPurge everyMinutes 1440 cadence daily", () => {
    const n = git(["diff", "--numstat", BASE_SHA, "--", D + "jobs.ts"]).split("\n").filter(Boolean).map((l) => l.split("\t"));
    ok(n.every((r) => Number(r[1]) === 0), `jobs.ts ลบบรรทัด: ${fmt(n)}`);
    const j = read(D + "jobs.ts"); ok(/\/\/\s*── T0\.8 pdpa ──[\s\S]*runPdpaPurge[\s\S]*\/\/\s*── \/T0\.8 pdpa ──/.test(j), "ไม่มีบล็อก T0.8 pdpa");
    const mj = read("src/lib/platform/minute-jobs.ts");
    ok(/name:\s*"trips\.pdpaPurge",\s*everyMinutes:\s*1440,\s*cadence:\s*"daily"/.test(mj), "ไม่ได้ลงทะเบียน trips.pdpaPurge");
  });
  await st("S-10", "สิทธิ์ 5 คีย์ลงทะเบียน (ป้ายไทย · โมดูล trips)", async () => {
    const P = (await tryImport("@/lib/core/permissions")).mod;
    const isKey = P?.isPermissionKey as ((k: string) => boolean) | undefined, label = P?.permissionLabel as ((k: string) => string) | undefined, mod = P?.moduleOfPermissionKey as ((k: string) => string) | undefined;
    ok(isKey && label && mod, "โหลด permissions ไม่ได้");
    const miss = PERM_KEYS.filter((k) => !isKey?.(k) || !THAI.test(String(label?.(k) ?? "")) || mod?.(k) !== "trips");
    ok(miss.length === 0, `ยังไม่ลงทะเบียน: ${miss.join(", ")}`);
  });
  await st("S-11", "event 2 ตัวลง 3 ทะเบียน (outbox-consumers · automation/labels · webhooks/labels)", () => {
    const oc = read("src/lib/outbox-consumers.ts"), al = read("src/lib/automation/labels.ts"), wl = read("src/lib/webhooks/labels.ts");
    const miss = EVENTS.flatMap((e) => [[oc, "consumers"], [al, "automation"], [wl, "webhooks"]].filter(([s]) => !s.includes(`"${e}"`) && !s.includes(e)).map(([, n]) => `${e}@${n}`));
    ok(miss.length === 0, miss.join(", "));
  });
  await st("S-12", "ปิดผนึกด้วย sealIntegrationSecret + AAD trips.pax.health.v1 / trips.pax.doc.v1 · signLink จุดประสงค์ trips.pax-form · privateFileUrl ใช้ TTL 300", () => {
    const s = srcOf(D + "passengers.ts") + srcOf(D + "passengers-core.ts") + srcOf(D + "pdpa.ts"); ok(s, "ยังไม่มีไฟล์");
    ok(/sealIntegrationSecret\(/.test(s) && /trips\.pax\.health\.v1:/.test(s) && /trips\.pax\.doc\.v1:/.test(s), "ไม่ใช้กล่อง/AAD ตามใบสั่ง");
    ok(/signLink\(/.test(s) && /trips\.pax-form/.test(s), "ไม่ใช้ signLink");
    ok(/privateFileUrl\([^)]*\b300\b/.test(s) || /(TTL|ttl)\w*\s*=\s*300\b/.test(s), "TTL ลิงก์ไฟล์ไม่ใช่ 300");
  });
  groupLine("S");

  // ═══════════════ FS. แกนบริสุทธิ์ ═══════════════
  console.log("\n── FS: แกนบริสุทธิ์ ──");
  const DS_FIELDS = FIELDS(["fullName", "finSize", "allergies", "certLevel", "diveCount"]);
  const TPL = { th: "รับทราบความเสี่ยง", en: "I acknowledge" };
  const MINOR = { parentOnlyAtOrBelow: 10, minorBelow: 20 };
  await st("FS-1", "PAX_FIELD_KEYS ตรงลำดับ · HEALTH_CONSENT_V1 = ข้อความ/รุ่น/แฮชตามใบสั่ง (แช่แข็ง)", () => {
    eq(needTrips().PAX_FIELD_KEYS, PAX_KEYS, "PAX_FIELD_KEYS");
    const c = asRec(needTrips().HEALTH_CONSENT_V1) ?? {};
    eq([c.version, c.th, c.en, c.hash], [CONSENT_VERSION, CONSENT_TH, CONSENT_EN, CONSENT_HASH], "ข้อความยินยอม");
    ok(Object.isFrozen(needTrips().HEALTH_CONSENT_V1), "ไม่แช่แข็ง");
  });
  await st("FS-2", "resolveFormSpec ร้านดำน้ำ (DS · deepDive · T62 จริง · SCUBA_ONLY) ⇒ ช่องตรง · สุขภาพครบ · ต้องเซ็น + แฮชแม่แบบ", () => {
    const r = asRec(fn("resolveFormSpec")({ paxFields: DS_FIELDS, crossBorder: false, deepDive: true, healthDataProduct: true, waiverRequiredFor: "SCUBA_ONLY", waiverTemplate: TPL, minorConsent: MINOR })) ?? {};
    const sp = asRec(r.spec) ?? {};
    eq(r.ok, true, "ok");
    eq(sp.fields, DS_FIELDS, "fields");
    eq(sp.health, { enabled: true, conditions: true, allergies: true, medicalDocument: true }, "health");
    eq(sp.waiver, { required: true, templateHash: tplHash(TPL), template: TPL }, "waiver");
    eq(sp.minor, MINOR, "minor");
  });
  await st("FS-3", "resolveFormSpec: REQUIRED_CROSS_BORDER ⇒ REQUIRED/OFF ตาม crossBorder · fullName OFF ⇒ OPTIONAL · สุขภาพจาก allergies อย่างเดียว · NONE/SCUBA_ONLY ไม่ดำลึก ⇒ ไม่ต้องเซ็น", () => {
    const f = (i: Rec) => asRec(asRec(fn("resolveFormSpec")({ paxFields: FIELDS([], ["allergies"], ["birthPlace"]), crossBorder: false, deepDive: false, healthDataProduct: false, waiverRequiredFor: "NONE", waiverTemplate: TPL, minorConsent: MINOR, ...i }))?.spec) ?? {};
    const a = f({}), b = f({ crossBorder: true }), c = f({ waiverRequiredFor: "SCUBA_ONLY" }), d = f({ waiverRequiredFor: "ALL" });
    eq([asRec(a.fields)?.birthPlace, asRec(b.fields)?.birthPlace, asRec(a.fields)?.fullName], ["OFF", "REQUIRED", "OPTIONAL"], "ช่อง");
    eq(a.health, { enabled: true, conditions: false, allergies: true, medicalDocument: false }, "สุขภาพจาก allergies");
    eq([asRec(a.waiver)?.required, asRec(c.waiver)?.required, asRec(d.waiver)?.required, asRec(a.waiver)?.templateHash], [false, false, true, null], "waiver");
  });
  await st("FS-4", "resolveFormSpec ค่าผิดรูป ⇒ {ok:false, reason SETTINGS_INVALID, key} ไม่ throw", () => {
    const r1 = asRec(fn("resolveFormSpec")({ paxFields: { fullName: "BOGUS" }, crossBorder: false, deepDive: false, healthDataProduct: false, waiverRequiredFor: "NONE", waiverTemplate: TPL, minorConsent: MINOR })) ?? {};
    const r2 = asRec(fn("resolveFormSpec")({ paxFields: DS_FIELDS, crossBorder: false, deepDive: false, healthDataProduct: false, waiverRequiredFor: "SOMETIMES", waiverTemplate: TPL, minorConsent: MINOR })) ?? {};
    eq([r1.ok, r1.reason, r1.key, r2.ok, r2.key], [false, "SETTINGS_INVALID", "trips.pax.fields", false, "trips.waiver.requiredFor"], "ผล");
  });
  await st("FS-5", "waiverTemplateHash = sha256(JSON [\"trips.waiver.v1\", th, en ?? null]) · เปลี่ยน en ⇒ แฮชเปลี่ยน", () => {
    eq(fn("waiverTemplateHash")(TPL), tplHash(TPL), "สูตร");
    eq(fn("waiverTemplateHash")({ th: TPL.th }), tplHash({ th: TPL.th }), "ไม่มี en");
    ok(fn("waiverTemplateHash")({ th: TPL.th, en: "x" }) !== tplHash(TPL), "แฮชไม่เปลี่ยน");
  });
  await st("FS-6", "ageAt: วันเกิดตรงวันเดินทาง = ครบปี · ก่อนหนึ่งวัน = ยังไม่ครบ · 29 ก.พ. ครบปีปกติวันที่ 1 มี.ค. · อนาคต/วันที่ผิด ⇒ null", () => {
    const a = fn("ageAt");
    eq([a("2017-03-10", "2027-03-10"), a("2017-03-11", "2027-03-10"), a("2008-02-29", "2027-02-28"), a("2008-02-29", "2027-03-01"), a("2030-01-01", "2027-03-10"), a("2027-02-30", "2027-03-10")], [10, 9, 18, 19, null, null], "อายุ");
  });
  await st("FS-7", "minorStatus (T63 ≤10 แทน · <20 ร่วม): 10 ⇒ guardianOnly · 11 ⇒ ร่วม · 19 ผู้เยาว์ · 20 ผู้ใหญ่ · ไม่มี dob ใช้ declaredMinor · ไม่มีทั้งคู่ known=false", () => {
    const m = (dob: string | null, d: boolean | null) => { const r = asRec(fn("minorStatus")({ dob, declaredMinor: d, travelYmd: "2027-03-10", rule: MINOR })) ?? {}; return [r.known, r.isMinor, r.guardianOnly, r.age]; };
    eq([m("2017-03-10", null), m("2016-03-10", null), m("2007-03-11", null), m("2007-03-10", null), m(null, true), m(null, false), m(null, null)],
      [[true, true, true, 10], [true, true, false, 11], [true, true, false, 19], [true, false, false, 20], [true, true, false, null], [true, false, false, null], [false, false, false, null]], "ผล");
  });
  await st("FS-8", "normalizeDocNumber / docLast4Of / maskDoc / maskDob", () => {
    eq([fn("normalizeDocNumber")(" ab-12 34 567 "), fn("normalizeDocNumber")("ab1"), fn("normalizeDocNumber")("ก1234567"), fn("docLast4Of")("AB1234567"), fn("maskDoc")("4567"), fn("maskDoc")(null), fn("maskDob")("1990-05-06"), fn("maskDob")(null)],
      ["AB1234567", null, null, "4567", "••••4567", null, "1990-••-••", null], "ผล");
  });
  await st("FS-9", "retentionDueYmd + purgeInstant (เขตเวลาหน่วย): 2027-03-11 + 30 = 2027-04-10 ⇒ 2027-04-10T17:00Z · null ⇒ null · ข้ามปี", () => {
    eq([fn("retentionDueYmd")("2027-03-11", 30), fn("retentionDueYmd")("2027-03-11", null), fn("retentionDueYmd")("2027-12-31", 1)], ["2027-04-10", null, "2028-01-01"], "วัน");
    eq((fn("purgeInstant")("2027-04-10", "Asia/Bangkok") as Date).toISOString(), "2027-04-10T17:00:00.000Z", "ต้นวันถัดไป");
    eq((fn("purgeInstant")("2027-04-10", "UTC") as Date).toISOString(), "2027-04-11T00:00:00.000Z", "UTC");
  });
  await st("FS-10", "canSeeSensitive แคบ: OWNER ได้ · MANAGER ไม่ได้ · STAFF ระบุตรงได้ · trips.* ไม่ได้ · ไม่มีหน่วยไม่ได้", () => {
    const c = fn("canSeeSensitive"), K = "trips.passenger.health";
    eq([c({ role: "OWNER", unitAccess: [], permissions: {} }, K, "u1"), c({ role: "MANAGER", unitAccess: ["*"], permissions: {} }, K, "u1"), c({ role: "STAFF", unitAccess: ["*"], permissions: { [K]: true } }, K, "u1"),
      c({ role: "STAFF", unitAccess: ["*"], permissions: { "trips.*": true } }, K, "u1"), c({ role: "STAFF", unitAccess: ["u2"], permissions: { [K]: true } }, K, "u1"), c(null, K, "u1")], [true, false, true, false, false, false], "ผล");
  });
  groupLine("FS");

  // ═══════════════ LK. ลิงก์กรอกเอง ═══════════════
  console.log("\n── LK: ลิงก์กรอกเอง ──");
  let L1: Bk | null = null; let L1tok = { token: "", expiresAt: "" };
  await st("LK-1", "ออกลิงก์ (เจ้าของ): token = signLink 2 ส่วน · expiresAt = จบทริป · audit link_issued เก็บ sha256(token) · ไม่มี token ดิบในฐาน", async () => {
    needDb(); L1 = await mkBooking("PD", [MK.name, "ผู้เดินทาง สอง"]);
    L1tok = await issue(L1.pax[0]);
    ok(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(L1tok.token), `รูป token ${L1tok.token.slice(0, 20)}`);
    const dep = (await q<{ endsAt: Date }>(`SELECT "endsAt" FROM "TripDeparture" WHERE id = $1`, [L1.dep]))[0];
    eq(new Date(L1tok.expiresAt).toISOString(), dep.endsAt.toISOString(), "expiresAt");
    const a = await audits("trips.passenger.link_issued", L1.pax[0]);
    ok(a.length === 1 && a[0].after?.tokenHash === sha256hex(L1tok.token) && a[0].after?.bookingId === L1.bookingId, `audit ${fmt(a)}`);
    eq((await q(`SELECT 1 FROM "AuditLog" WHERE "tenantId" = $1 AND (after::text LIKE $2 OR before::text LIKE $2)`, [tA, `%${L1tok.token.split(".")[1]}%`])).length, 0, "token ดิบใน audit");
  });
  await st("LK-2", "เปิดแบบฟอร์ม: เห็นเฉพาะคนนี้ (คนที่ i จาก 2) · spec · ไม่มีเลขเต็ม/สุขภาพ/ชื่อคนอื่น/URL", async () => {
    ok(L1, "LK-1 ไม่ผ่าน");
    const v = V(await call("openPassengerForm", pctx(), { token: L1tok.token }), "open");
    const ord = (await q<{ id: string }>(`SELECT id FROM "TripPassenger" WHERE "bookingId" = $1 ORDER BY "createdAt", id`, [L1!.bookingId])).map((x) => x.id);
    eq([v.passengerIndex, v.passengerCount], [ord.indexOf(L1!.pax[0]) + 1, 2], "ลำดับ (createdAt, id)"); // ORACLE-EDIT LK-2 (ผู้คุม 13 พ.ย.): ลำดับในระบบ = (createdAt, id) ไม่ผูกกับลำดับที่กรอก (หนี้ T0.6)
    eq(asRec(asRec(v.spec)?.waiver)?.required, true, "ต้องเซ็น");
    const s = JSON.stringify(v);
    ok(!s.includes("ผู้เดินทาง สอง") && !/https?:\/\/|\/api\/files/.test(s) && !s.includes(MK.doc), "รั่วข้อมูลคนอื่น/URL");
  });
  await st("LK-3", "token ผิด (แก้ลายเซ็น · จุดประสงค์อื่น · สุ่ม) ⇒ NOT_FOUND รูปเดียวกันทุกกรณี ไม่มี details", async () => {
    ok(L1 && L1tok.token, "LK-1 ไม่ผ่าน");
    const [p, s] = L1tok.token.split(".");
    const other = String((SL!.signLink as AnyFn)({ tenantId: tA, purpose: "trips.other", subjectId: L1.pax[0], expMin: 60 }));
    const rs = [await call("openPassengerForm", pctx(), { token: `${p}.${s.slice(0, -3)}abc` }), await call("openPassengerForm", pctx(), { token: other }), await call("openPassengerForm", pctx(), { token: randomBytes(40).toString("base64url") })];
    for (const r of rs) codeR(r, "NOT_FOUND", "token ผิด");
    ok(rs.every((r) => r.details === undefined && r.messageTh === rs[0].messageTh), `รูปต่างกัน ${fmt(rs)}`);
  });
  await st("LK-4", "หมดอายุ: pctx.now > expiresAt ⇒ NOT_FOUND · ก่อนหมด 1 วินาที ⇒ ใช้ได้", async () => {
    ok(L1, "LK-1 ไม่ผ่าน");
    V(await call("openPassengerForm", pctx(secs(new Date(L1tok.expiresAt), -1)), { token: L1tok.token }), "ก่อนหมด");
    codeR(await call("openPassengerForm", pctx(secs(new Date(L1tok.expiresAt), 1)), { token: L1tok.token }), "NOT_FOUND", "หมดอายุ");
  });
  await st("LK-5", "เพิกถอน ⇒ NOT_FOUND · ออกใหม่ ⇒ ใบเก่า NOT_FOUND ใบใหม่ใช้ได้", async () => {
    needDb(); const b = await mkBooking("PD", ["ลิงก์ ห้า"]);
    const t1 = await issue(b.pax[0]);
    V(await call("revokePassengerFormLink", staff(), { passengerId: b.pax[0] }), "revoke");
    codeR(await call("openPassengerForm", pctx(), { token: t1.token }), "NOT_FOUND", "หลังเพิกถอน");
    const t2 = await issue(b.pax[0]); const t3 = await issue(b.pax[0]);
    codeR(await call("openPassengerForm", pctx(), { token: t2.token }), "NOT_FOUND", "ใบก่อนหน้า");
    V(await call("openPassengerForm", pctx(), { token: t3.token }), "ใบล่าสุด");
  });
  await st("LK-6", "token ที่ลายเซ็นถูกแต่ไม่ได้ออกโดยบริการ (ไม่มีแฮชในบันทึก) ⇒ NOT_FOUND", async () => {
    ok(L1, "LK-1 ไม่ผ่าน");
    const forged = String((SL!.signLink as AnyFn)({ tenantId: tA, purpose: "trips.pax-form", subjectId: L1.pax[1], expMin: 600 }));
    TOKENS.push(forged);
    codeR(await call("openPassengerForm", pctx(), { token: forged }), "NOT_FOUND", "ไม่ได้ออก");
  });
  await st("LK-7", "การจอง CANCELLED / EXPIRED ⇒ ลิงก์ใช้ไม่ได้ (NOT_FOUND)", async () => {
    needDb(); const b = await mkBooking("PT", ["ยกเลิก หนึ่ง"]); const t = await issue(b.pax[0]);
    await pool.query(`UPDATE "TripBooking" SET status = 'CANCELLED' WHERE id = $1`, [b.bookingId]);
    codeR(await call("openPassengerForm", pctx(), { token: t.token }), "NOT_FOUND", "CANCELLED");
    await pool.query(`UPDATE "TripBooking" SET status = 'EXPIRED' WHERE id = $1`, [b.bookingId]);
    codeR(await call("openPassengerForm", pctx(), { token: t.token }), "NOT_FOUND", "EXPIRED");
  });
  await st("LK-8", "อินพุตสาธารณะ strict: มี passengerId / bookingId / tenantId ⇒ VALIDATION", async () => {
    ok(L1, "LK-1 ไม่ผ่าน");
    codeR(await call("openPassengerForm", pctx(), { token: L1tok.token, passengerId: L1.pax[1] }), "VALIDATION", "passengerId");
    codeR(await call("submitPassengerForm", pctx(), { token: L1tok.token, idempotencyKey: `k${hex(5)}`, expectedRev: 0, fields: { fullName: "x" }, bookingId: L1.bookingId }), "VALIDATION", "bookingId");
  });
  await st("LK-9", "เดา: token ลายเซ็นถูก 25 ใบที่ชี้ id ผู้เดินทางสุ่ม/ร้านอื่น ⇒ NOT_FOUND ทุกใบ ผลเหมือนกัน", async () => {
    needDb();
    const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => call("openPassengerForm", pctx(), { token: String((SL!.signLink as AnyFn)({ tenantId: i % 2 ? tB : tA, purpose: "trips.pax-form", subjectId: rid("px"), expMin: 60 })) })));
    ok(rs.every((r) => r.ok === false && r.code === "NOT_FOUND" && r.details === undefined && r.messageTh === rs[0].messageTh), `ผล ${fmt(rs.find((r) => r.code !== "NOT_FOUND"))}`);
  });
  await st("LK-10", "อัตรา: หน่วยตั้ง tokenPerHourPerDevice = 3 ⇒ เครื่องเดิมครั้งที่ 4 RATE_LIMITED · เครื่องอื่นยังได้", async () => {
    needDb(); const b = await mkBooking("PC", ["อัตรา หนึ่ง"]); const t = await issue(b.pax[0], "oa", NOW0, uA2);
    const ck = `t08qc_rl_${hex(4)}`;
    const rs: string[] = [];
    // ORACLE-EDIT LK-10 (ผู้คุม 13 พ.ย.): มติ P6 — ลิงก์ผิด/ใช้ไม่ได้นับต่อเครื่อง (เพดานของหน่วย = 3) · ลิงก์ถูกนับต่อ "ลิงก์" (10 × 3 = 30 ต่อชั่วโมง) · เครื่องที่เกินเพดานถูกปฏิเสธแม้ลิงก์ถูก
    const forged = String((SL!.signLink as AnyFn)({ tenantId: tA, purpose: "trips.pax-form", subjectId: b.pax[0], expMin: 60 }));
    for (let i = 0; i < 3; i++) { const r = await call("openPassengerForm", pctx(NOW0, ck), { token: forged }); rs.push(r.ok === true ? "OK" : String(r.code)); }
    { const r = await call("openPassengerForm", pctx(NOW0, ck), { token: t.token }); rs.push(r.ok === true ? "OK" : String(r.code)); }
    eq(rs, ["NOT_FOUND", "NOT_FOUND", "NOT_FOUND", "RATE_LIMITED"], "เครื่องเดิม");
    const per: string[] = [];
    for (let i = 0; i < 31; i++) { const r = await call("openPassengerForm", pctx(NOW0, `t08qc_ok_${hex(4)}`), { token: t.token }); per.push(r.ok === true ? "OK" : String(r.code)); }
    eq([per.slice(0, 30).every((x) => x === "OK"), per[30]], [true, "RATE_LIMITED"], "ต่อ ลิงก์ 30 ครั้ง/ชม.");
  });
  await st("LK-11", "เดารัว: token ผิด 60 ครั้งจากเครื่องเดียว ⇒ ครั้งต่อไปแม้ token ถูก = RATE_LIMITED", async () => {
    ok(L1, "LK-1 ไม่ผ่าน"); const ck = `t08qc_guess_${hex(4)}`;
    for (let i = 0; i < 60; i++) await call("openPassengerForm", pctx(NOW0, ck), { token: randomBytes(30).toString("base64url") });
    codeR(await call("openPassengerForm", pctx(NOW0, ck), { token: L1tok.token }), "RATE_LIMITED", "หลังเดา 60");
  });
  await st("LK-12", "ไม่มี SESSION_SECRET ⇒ ออกลิงก์ BUSY SERVER_KEY_MISSING (ไม่มีทางถอย) · คืนค่าแล้วใช้ได้", async () => {
    ok(L1, "LK-1 ไม่ผ่าน"); const keep = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    let r: Rec; try { r = await call("issuePassengerFormLink", staff(), { passengerId: L1.pax[1] }); } finally { process.env.SESSION_SECRET = keep; }
    codeR(r, "BUSY", "ไม่มีกุญแจ", "SERVER_KEY_MISSING");
  });
  await st("LK-13", "issueBookingFormLinks: ลิงก์ละคน token ไม่ซ้ำ · แต่ละใบเปิดได้เฉพาะคนของตัวเอง", async () => {
    needDb(); const b = await mkBooking("PT", ["กลุ่ม หนึ่ง", "กลุ่ม สอง", "กลุ่ม สาม"]);
    const v = V(await call("issueBookingFormLinks", staff(), { bookingId: b.bookingId }), "issueBookingFormLinks");
    const ls = asArr(v.links); ls.forEach((l) => TOKENS.push(String(l.token)));
    eq([ls.length, new Set(ls.map((l) => l.token)).size, [...ls.map((l) => String(l.passengerId))].sort()], [3, 3, [...b.pax].sort()], "ลิงก์");
    const idx = await Promise.all(ls.map(async (l) => V(await call("openPassengerForm", pctx(), { token: l.token }), "open").passengerIndex));
    eq([...idx].sort(), [1, 2, 3], "ลำดับ");
  });
  await st("LK-14", "ensurePassengerSlots: 3 ที่นั่ง 1 ชื่อ ⇒ สร้าง 2 รวม 3 · ซ้ำ = 0 · ยิงพร้อมกัน 10 ⇒ ยังรวม 3", async () => {
    needDb(); const b = await mkBooking("PT", ["ช่อง หนึ่ง"], { seats: 3 });
    eq(asRec(V(await call("ensurePassengerSlots", staff(), { bookingId: b.bookingId }), "slots")), { created: 2, total: 3 }, "ครั้งแรก");
    eq(asRec(V(await call("ensurePassengerSlots", staff(), { bookingId: b.bookingId }), "slots"))?.created, 0, "ซ้ำ");
    const b2 = await mkBooking("PT", ["ช่อง สอง"], { seats: 4 });
    await Promise.all(Array.from({ length: 10 }, () => call("ensurePassengerSlots", staff(), { bookingId: b2.bookingId })));
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripPassenger" WHERE "bookingId" = $1`, [b2.bookingId]))[0]?.n, 4, "พร้อมกัน");
  });
  groupLine("LK");

  // ═══════════════ SB. ส่งแบบฟอร์ม ═══════════════
  console.log("\n── SB: ส่งแบบฟอร์ม ──");
  let SB1: Bk | null = null; let SB1t = "";
  const submit = (token: string, body: Rec, now: string | Date = NOW0) => call("submitPassengerForm", pctx(now), { token, idempotencyKey: `s${hex(6)}`, ...body });
  await st("SB-1", "ส่งช่อง REQUIRED ครบ ⇒ SUBMITTED rev 1 · event form_completed ครั้งเดียว payload {bookingId, passengerId, kind FORM}", async () => {
    needDb(); SB1 = await mkBooking("PD", ["ส่ง หนึ่ง"]); SB1t = (await issue(SB1.pax[0])).token;
    const v = V(await submit(SB1t, { expectedRev: 0, fields: fullPD() }), "submit");
    eq([v.rev, v.formStatus], [1, "SUBMITTED"], "ผล");
    const ev = (await outbox("trips.passenger.form_completed")).filter((e) => e.payload.passengerId === SB1!.pax[0]);
    eq(ev.map((e) => e.payload), [{ bookingId: SB1.bookingId, kind: "FORM", passengerId: SB1.pax[0] }], "event");
  });
  await st("SB-2", "ส่งไม่ครบ ⇒ PENDING + missing ตาม spec", async () => {
    needDb(); const b = await mkBooking("PD", ["ส่ง สอง"]); const t = (await issue(b.pax[0])).token;
    eq(V(await submit(t, { expectedRev: 0, fields: { fullName: "ส่ง สอง" } }), "submit").formStatus, "PENDING", "สถานะ");
    const o = V(await call("openPassengerForm", pctx(), { token: t }), "open");
    eq([...(o.missing as string[])].sort(), ["certLevel", "diveCount", "dob", "docNumber", "docType", "nationality"], "missing");
  });
  await st("SB-3", "ช่อง OFF ⇒ VALIDATION FIELD_OFF · allergies ใน fields ⇒ FIELD_OFF", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    codeR(await submit(SB1t, { expectedRev: 1, fields: { birthPlace: "Bangkok" } }), "VALIDATION", "OFF", "FIELD_OFF");
    codeR(await submit(SB1t, { expectedRev: 1, fields: { allergies: "กุ้ง" } }), "VALIDATION", "allergies", "FIELD_OFF");
  });
  await st("SB-4", "ข้อความ: ตัวกลับทิศ/C0 ⇒ VALIDATION · ZWSP ถูกตัด + NFC", async () => {
    needDb(); const b = await mkBooking("PT", ["ข้อความ"]); const t = (await issue(b.pax[0])).token;
    codeR(await submit(t, { expectedRev: 0, fields: { fullName: "ab‮cd" } }), "VALIDATION", "bidi");
    codeR(await submit(t, { expectedRev: 0, fields: { fullName: "ab\u0007cd" } }), "VALIDATION", "C0");
    V(await submit(t, { expectedRev: 0, fields: { fullName: "José​ Smith" } }), "ZWSP/NFC");
    eq((await pax(b.pax[0])).fullName, "José Smith", "เก็บ");
  });
  await st("SB-5", "เลขเอกสารปิดผนึก: docNumberEnc เปิดด้วย AAD trips.pax.doc.v1:<ร้าน>:<คน> = {v:1, n} · คอลัมน์ไม่มีเลขดิบ · docLast4 · AAD คนอื่นเปิดไม่ได้", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน"); const r = await pax(SB1.pax[0]);
    eq(open(r.docNumberEnc, `trips.pax.doc.v1:${tA}:${SB1.pax[0]}`), { v: 1, n: MK.doc }, "เปิด");
    ok(!String(r.docNumberEnc ?? "").includes(MK.doc), "มีเลขดิบ");
    eq(r.docLast4, MK.doc.slice(-4), "docLast4");
    eq(open(r.docNumberEnc, `trips.pax.doc.v1:${tA}:${rid("x")}`), null, "AAD อื่น");
  });
  await st("SB-6", "ปิดรับข้อมูลเอกสาร (T30 ข้ามแดน 21 วัน): ลูกค้าแก้ docNumber หลังวันปิด ⇒ PASSPORT_CUTOFF_PASSED · ชื่อแก้ได้ · พนักงานแก้ได้", async () => {
    needDb(); const b = await mkBooking("PX", ["ข้ามแดน"], { date: "2027-03-25" }); const t = (await issue(b.pax[0], "oa", "2027-03-10T03:00:00Z")).token;
    codeR(await submit(t, { expectedRev: 0, fields: { docNumber: "AB1234567" } }, "2027-03-10T03:00:00Z"), "VALIDATION", "หลังปิด", "PASSPORT_CUTOFF_PASSED");
    V(await submit(t, { expectedRev: 0, fields: { fullName: "ข้ามแดน ใหม่" } }, "2027-03-10T03:00:00Z"), "ชื่อ");
    V(await call("updateTripPassenger", staff("oa", { now: "2027-03-10T03:00:00Z" }), { passengerId: b.pax[0], expectedRev: 1, idempotencyKey: `u${hex(6)}`, fields: { docNumber: "AB1234567" } }), "พนักงาน");
  });
  await st("SB-7", "กันซ้ำ: คีย์+เนื้อเดิม ⇒ ผลเดิม replayed ไม่มี event ที่สอง · คีย์เดิมเนื้อต่าง ⇒ IDEMPOTENCY_CONFLICT", async () => {
    needDb(); const b = await mkBooking("PD", ["ซ้ำ"]); const t = (await issue(b.pax[0])).token;
    const body = { token: t, idempotencyKey: `same${hex(5)}`, expectedRev: 0, fields: fullPD({ fullName: "ซ้ำ ซ้ำ" }) };
    const a = V(await call("submitPassengerForm", pctx(), body), "ครั้งแรก"), c = V(await call("submitPassengerForm", pctx(), body), "ครั้งสอง");
    eq([a.rev, c.rev, c.replayed], [1, 1, true], "ผล");
    eq((await outbox("trips.passenger.form_completed")).filter((e) => e.payload.passengerId === b.pax[0]).length, 1, "event");
    codeR(await call("submitPassengerForm", pctx(), { ...body, fields: fullPD({ fullName: "อื่น" }) }), "IDEMPOTENCY_CONFLICT", "เนื้อต่าง");
  });
  await st("SB-8", "rev เก่า ⇒ STATE_CONFLICT + details.rev ปัจจุบัน · ไม่เขียน", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    const r = await submit(SB1t, { expectedRev: 0, fields: { fullName: "เก่า" } });
    codeR(r, "STATE_CONFLICT", "rev เก่า"); eq(asRec(r.details)?.rev, revOf(await pax(SB1.pax[0])), "details.rev");
    eq((await pax(SB1.pax[0])).fullName, MK.name, "ไม่เขียน");
  });
  await st("SB-9", "รูปข้อมูล: diveCount เกิน int4 · nationality ตัวเล็ก · dob อนาคต · ช่องไม่รู้จัก ⇒ VALIDATION", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน"); const rv = revOf(await pax(SB1.pax[0]));
    for (const f of [{ diveCount: 2_147_483_648 }, { nationality: "th" }, { dob: "2030-01-01" }, { shoeSize: 9 }]) codeR(await submit(SB1t, { expectedRev: rv, fields: f }), "VALIDATION", fmt(f));
  });
  await st("SB-10", "ร้านขอแก้ (NEEDS_FIX + fixReason) → ลูกค้าส่งใหม่ครบ ⇒ SUBMITTED + event ครั้งที่สอง (คีย์ต่าง rev)", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน"); const rv = revOf(await pax(SB1.pax[0]));
    codeR(await call("setPassengerFormStatus", staff(), { passengerId: SB1.pax[0], expectedRev: rv, status: "NEEDS_FIX" }), "VALIDATION", "ไม่มี fixReason");
    eq(V(await call("setPassengerFormStatus", staff(), { passengerId: SB1.pax[0], expectedRev: rv, status: "NEEDS_FIX", fixReason: "DOC_UNREADABLE" }), "fix").formStatus, "NEEDS_FIX", "fix");
    eq(V(await submit(SB1t, { expectedRev: rv + 1, fields: { diveCount: 49 } }), "ส่งใหม่").formStatus, "SUBMITTED", "ส่งใหม่");
    eq((await outbox("trips.passenger.form_completed")).filter((e) => e.payload.passengerId === SB1!.pax[0]).length, 2, "event 2");
  });
  await st("SB-11", "PENDING ⇒ VERIFIED ไม่ได้ (STATE_CONFLICT FORM_INCOMPLETE) · SUBMITTED ⇒ VERIFIED ได้", async () => {
    needDb(); const b = await mkBooking("PD", ["ตรวจ"]);
    codeR(await call("setPassengerFormStatus", staff(), { passengerId: b.pax[0], expectedRev: 0, status: "VERIFIED" }), "STATE_CONFLICT", "PENDING", "FORM_INCOMPLETE");
    ok(SB1, "SB-1 ไม่ผ่าน");
    eq(V(await call("setPassengerFormStatus", staff(), { passengerId: SB1.pax[0], expectedRev: revOf(await pax(SB1.pax[0])), status: "VERIFIED" }), "verify").formStatus, "VERIFIED", "VERIFIED");
  });
  groupLine("SB");

  // ═══════════════ HL. สุขภาพ · ความยินยอม · ผู้เยาว์ ═══════════════
  console.log("\n── HL: สุขภาพ/ความยินยอม/ผู้เยาว์ ──");
  let H1: Bk | null = null; let H1t = "";
  await st("HL-1", "สินค้าไม่ใช้ข้อมูลสุขภาพแต่เปิดช่อง allergies (PT): conditions ⇒ HEALTH_NOT_COLLECTED · allergies + ยินยอม ⇒ PROVIDED", async () => {
    needDb(); const b = await mkBooking("PT", ["แพ้ หนึ่ง"]); const t = (await issue(b.pax[0])).token;
    codeR(await submit(t, { expectedRev: 0, isMinorDeclared: false, health: { consent, conditions: MK.cond } }), "VALIDATION", "conditions", "HEALTH_NOT_COLLECTED");
    V(await submit(t, { expectedRev: 0, isMinorDeclared: false, health: { consent, allergies: MK.allergy } }), "allergies");
    eq(asRec(asRec((await pax(b.pax[0])).answers)?.health)?.status, "PROVIDED", "สถานะ");
  });
  await st("HL-2", "สินค้าที่ไม่เก็บสุขภาพและปิด allergies (PX) ⇒ HEALTH_NOT_COLLECTED", async () => {
    needDb(); const b = await mkBooking("PX", ["ไม่เก็บ"]); const t = (await issue(b.pax[0])).token;
    codeR(await submit(t, { expectedRev: 0, isMinorDeclared: false, health: { consent, allergies: "x" } }), "VALIDATION", "PX", "HEALTH_NOT_COLLECTED");
  });
  await st("HL-3", "ไม่มีความยินยอม ⇒ HEALTH_CONSENT_REQUIRED · แฮชข้อความไม่ตรง ⇒ CONSENT_TEXT_CHANGED + details.textHash ปัจจุบัน", async () => {
    needDb(); H1 = await mkBooking("PD", ["สุขภาพ หนึ่ง"]); H1t = (await issue(H1.pax[0])).token;
    codeR(await submit(H1t, { expectedRev: 0, fields: fullPD(), health: { allergies: MK.allergy } }), "VALIDATION", "ไม่มียินยอม", "HEALTH_CONSENT_REQUIRED");
    const r = await submit(H1t, { expectedRev: 0, fields: fullPD(), health: { consent: { ...consent, textHash: "0".repeat(64) }, allergies: MK.allergy } });
    codeR(r, "VALIDATION", "แฮชผิด", "CONSENT_TEXT_CHANGED"); eq(asRec(r.details)?.textHash, CONSENT_HASH, "details.textHash");
  });
  await st("HL-4", "บันทึกความยินยอม: answers.health.consent {version textHash via LINK signerRole SELF} · audit consent_given ไม่มีเนื้อหา · กล่องผูก AAD ของคน (ย้ายกล่องไปคนอื่นเปิดไม่ได้)", async () => {
    ok(H1, "HL-3 ไม่ผ่าน");
    V(await submit(H1t, { expectedRev: 0, fields: fullPD(), health: { consent, allergies: MK.allergy, conditions: MK.cond } }), "submit");
    const h = asRec(asRec((await pax(H1.pax[0])).answers)?.health) ?? {};
    const c = asRec(h.consent) ?? {};
    eq([h.status, c.version, c.textHash, c.via, c.signerRole], ["PROVIDED", CONSENT_VERSION, CONSENT_HASH, "LINK", "SELF"], "consent");
    eq(open(h.box, `trips.pax.health.v1:${tA}:${H1.pax[0]}`), { v: 1, allergies: MK.allergy, conditions: MK.cond }, "กล่อง");
    eq(open(h.box, `trips.pax.health.v1:${tA}:${H1.pax[0]}x`), null, "AAD อื่น");
    const a = await audits("trips.passenger.consent_given", H1.pax[0]);
    ok(a.length === 1 && a[0].after?.textHash === CONSENT_HASH && a[0].after?.scope === "HEALTH" && leaks(JSON.stringify(a)).length === 0, `audit ${fmt(a)}`);
  });
  await st("HL-5", "ผู้เยาว์ ≤ 10 ปี: ไม่มีผู้ปกครอง ⇒ GUARDIAN_REQUIRED · มี ⇒ signerRole GUARDIAN · guardianConsent scopes HEALTH · isMinor", async () => {
    needDb(); const b = await mkBooking("PD", ["เด็ก แปด"]); const t = (await issue(b.pax[0])).token;
    const f = fullPD({ fullName: "เด็ก แปด", dob: "2019-01-01" });
    codeR(await submit(t, { expectedRev: 0, fields: f, health: { consent, allergies: "นม" } }), "VALIDATION", "ไม่มีผู้ปกครอง", "GUARDIAN_REQUIRED");
    V(await submit(t, { expectedRev: 0, fields: f, health: { consent, allergies: "นม" }, guardian: { name: MK.guardian, relation: "PARENT" } }), "มีผู้ปกครอง");
    const r = await pax(b.pax[0]); const g = asRec(r.guardianConsent) ?? {};
    eq([r.isMinor, asRec(asRec(asRec(r.answers)?.health)?.consent)?.signerRole, g.name, g.relation, g.scopes], [true, "GUARDIAN", MK.guardian, "PARENT", ["HEALTH"]], "ผล");
  });
  await st("HL-6", "ผู้เยาว์ 15 ปี (ช่วงร่วม) ⇒ signerRole SELF_AND_GUARDIAN", async () => {
    needDb(); const b = await mkBooking("PD", ["วัยรุ่น"]); const t = (await issue(b.pax[0])).token;
    V(await submit(t, { expectedRev: 0, fields: fullPD({ dob: "2011-06-01" }), health: { consent, allergies: "ถั่ว" }, guardian: { name: "ผู้ปกครอง", relation: "LEGAL_GUARDIAN" } }), "submit");
    eq(asRec(asRec(asRec((await pax(b.pax[0])).answers)?.health)?.consent)?.signerRole, "SELF_AND_GUARDIAN", "signerRole");
  });
  await st("HL-7", "อายุไม่รู้ (ไม่มี dob ไม่มี isMinorDeclared) ⇒ AGE_UNKNOWN · ประกาศว่าไม่ใช่ผู้เยาว์ ⇒ ผ่าน", async () => {
    needDb(); const b = await mkBooking("PT", ["อายุ"]); const t = (await issue(b.pax[0])).token;
    codeR(await submit(t, { expectedRev: 0, health: { consent, allergies: "x" } }), "VALIDATION", "ไม่รู้อายุ", "AGE_UNKNOWN");
    V(await submit(t, { expectedRev: 0, isMinorDeclared: false, health: { consent, allergies: "x" } }), "ประกาศ");
  });
  await st("HL-8", "ปฏิเสธให้ข้อมูลสุขภาพ ⇒ health DECLINED · ไม่บล็อกการส่ง (SUBMITTED)", async () => {
    needDb(); const b = await mkBooking("PD", ["ไม่ให้"]); const t = (await issue(b.pax[0])).token;
    eq(V(await submit(t, { expectedRev: 0, fields: fullPD(), health: { declined: true } }), "declined").formStatus, "SUBMITTED", "สถานะ");
    eq(asRec(asRec((await pax(b.pax[0])).answers)?.health)?.status, "DECLINED", "health");
  });
  await st("HL-9", "ถอนความยินยอม: PREVIEW ไม่เปลี่ยน · EXECUTE ลบกล่อง (WITHDRAWN) + ไฟล์ MEDICAL (ที่เก็บ+deletedAt) + audit + event HEALTH_ANSWERS/MEDICAL · ซ้ำ = ผลเดิม", async () => {
    ok(H1, "HL-3 ไม่ผ่าน");
    const up = V(await call("uploadPassengerDocument", pctx(), { token: H1t, idempotencyKey: `m${hex(6)}`, kind: "MEDICAL", contentType: "application/pdf", data: PDF() }, DEPS), "upload MEDICAL");
    const pv = V(await call("withdrawHealthConsent", pctx(), { token: H1t, idempotencyKey: `wp${hex(5)}`, mode: "PREVIEW" }, DEPS), "preview");
    eq([asRec(pv.effects), pv.done], [{ healthAnswers: true, medicalDocuments: 1 }, false], "preview");
    eq(asRec(asRec((await pax(H1.pax[0])).answers)?.health)?.status, "PROVIDED", "ยังไม่เปลี่ยน");
    const key = `we${hex(5)}`;
    V(await call("withdrawHealthConsent", pctx(), { token: H1t, idempotencyKey: key, mode: "EXECUTE" }, DEPS), "execute");
    const h = asRec(asRec((await pax(H1.pax[0])).answers)?.health) ?? {};
    eq([h.status, h.box], ["WITHDRAWN", undefined], "กล่อง");
    ok((await docRow(String(up.documentId)))?.deletedAt, "MEDICAL ยังไม่ลบ");
    const kinds = (await outbox("trips.document.purged")).filter((e) => e.payload.passengerId === H1!.pax[0]).map((e) => e.payload.kind);
    ok(kinds.includes("HEALTH_ANSWERS") && kinds.includes("MEDICAL"), `event ${fmt(kinds)}`);
    eq((await audits("trips.passenger.consent_withdrawn", H1.pax[0])).length, 1, "audit");
    V(await call("withdrawHealthConsent", pctx(), { token: H1t, idempotencyKey: key, mode: "EXECUTE" }, DEPS), "ซ้ำ");
    eq((await audits("trips.passenger.consent_withdrawn", H1.pax[0])).length, 1, "audit ซ้ำ");
  });
  await st("HL-10", "ไม่มีกุญแจกล่อง ⇒ BUSY SECRET_KEY_MISSING · ไม่เขียนอะไร (rev เดิม)", async () => {
    needDb(); const b = await mkBooking("PT", ["กุญแจ"]); const t = (await issue(b.pax[0])).token;
    const keep = process.env.INTEGRATIONS_CREDENTIALS_KEY; delete process.env.INTEGRATIONS_CREDENTIALS_KEY;
    let r: Rec; try { r = await submit(t, { expectedRev: 0, isMinorDeclared: false, health: { consent, allergies: MK.allergy } }); } finally { process.env.INTEGRATIONS_CREDENTIALS_KEY = keep; }
    codeR(r, "BUSY", "ไม่มีกุญแจ", "SECRET_KEY_MISSING");
    eq(revOf(await pax(b.pax[0])), 0, "rev");
  });
  groupLine("HL");

  // ═══════════════ WV. เอกสารรับทราบความเสี่ยง ═══════════════
  console.log("\n── WV: เอกสารรับทราบความเสี่ยง ──");
  let W1: Bk | null = null; let W1t = ""; let W1hash = "";
  const sign = (token: string, body: Rec, now: string | Date = NOW0) => call("signPassengerWaiver", pctx(now), { token, idempotencyKey: `w${hex(6)}`, locale: "th", accept: true, signerName: MK.name, signerRole: "SELF", ...(body.signerRole === "GUARDIAN" || "isMinorDeclared" in body ? {} : { isMinorDeclared: false }) /* ORACLE-EDIT WV (ผู้คุม 13 พ.ย.): มติ P5 — เซ็นเองต้องรู้อายุหรือประกาศเป็นผู้ใหญ่ */, ...body });
  await st("WV-1", "สินค้าไม่ต้องเซ็น (PT · NONE) ⇒ WAIVER_NOT_REQUIRED", async () => {
    needDb(); const b = await mkBooking("PT", ["ไม่ต้องเซ็น"]); const t = (await issue(b.pax[0])).token;
    codeR(await sign(t, { templateHash: tplHash(await curTemplate("PT")) }), "VALIDATION", "PT", "WAIVER_NOT_REQUIRED");
  });
  await st("WV-2", "แฮชแม่แบบไม่ตรง ⇒ TEMPLATE_CHANGED + details.templateHash = แม่แบบปัจจุบันของสินค้า", async () => {
    needDb(); W1 = await mkBooking("PD", ["เซ็น หนึ่ง"]); W1t = (await issue(W1.pax[0])).token; W1hash = tplHash(await curTemplate("PD"));
    const r = await sign(W1t, { templateHash: "f".repeat(64) });
    codeR(r, "VALIDATION", "แฮชผิด", "TEMPLATE_CHANGED"); eq(asRec(r.details)?.templateHash, W1hash, "details");
  });
  await st("WV-3", "เซ็นผ่านลิงก์: waiverEvidence = ข้อความแม่แบบตรงตัว + textHash + templateHash + method LINK + identityProof {required T68, used LINK_POSSESSION, verified false} + signedAt · audit ไม่มีชื่อ", async () => {
    ok(W1, "WV-2 ไม่ผ่าน"); const tpl = await curTemplate("PD");
    const v = V(await sign(W1t, { templateHash: W1hash }), "sign");
    const r = await pax(W1.pax[0]); const e = asRec(r.waiverEvidence) ?? {};
    eq([e.v, e.templateHash, e.locale, e.text, e.textHash, e.method, e.signedAt], [1, W1hash, "th", tpl.th, sha256hex(tpl.th), "LINK", new Date(NOW0).toISOString()], "หลักฐาน");
    eq(asRec(e.identityProof), { required: "LINE_IF_AVAILABLE_ELSE_OTP", used: "LINK_POSSESSION", verified: false }, "identityProof");
    eq(asRec(e.signer), { role: "SELF", name: MK.name }, "signer");
    eq([new Date(String(r.waiverSignedAt)).toISOString(), v.templateHash], [new Date(NOW0).toISOString(), W1hash], "waiverSignedAt");
    const a = await audits("trips.waiver.signed", W1.pax[0]);
    ok(a.length === 1 && a[0].after?.templateHash === W1hash && leaks(JSON.stringify(a)).length === 0, `audit ${fmt(a)}`);
  });
  await st("WV-4", "ผู้เยาว์ ⇒ ต้องผู้ปกครองลงนาม (SELF ⇒ GUARDIAN_REQUIRED · GUARDIAN + guardian ⇒ ผ่าน)", async () => {
    needDb(); const b = await mkBooking("PD", ["เด็ก เซ็น"]); const t = (await issue(b.pax[0])).token;
    V(await submit(t, { expectedRev: 0, fields: fullPD({ dob: "2018-01-01" }) }), "dob");
    codeR(await sign(t, { templateHash: W1hash }), "VALIDATION", "SELF", "GUARDIAN_REQUIRED");
    V(await sign(t, { templateHash: W1hash, signerRole: "GUARDIAN", signerName: "ผู้ปกครอง", guardian: { name: "ผู้ปกครอง", relation: "PARENT" } }), "GUARDIAN");
  });
  await st("WV-5", "ซ้ำ: คีย์เดิม = ผลเดิม · คีย์ใหม่ขณะเซ็นแล้ว ⇒ STATE_CONFLICT WAIVER_ALREADY_SIGNED", async () => {
    needDb(); const b = await mkBooking("PD", ["เซ็น ซ้ำ"]); const t = (await issue(b.pax[0])).token;
    const body = { token: t, idempotencyKey: `ws${hex(5)}`, templateHash: W1hash, locale: "th", accept: true, signerName: "เซ็น ซ้ำ", signerRole: "SELF", isMinorDeclared: false };
    V(await call("signPassengerWaiver", pctx(), body), "1"); eq(V(await call("signPassengerWaiver", pctx(), body), "2").replayed, true, "replayed");
    codeR(await sign(t, { templateHash: W1hash }), "STATE_CONFLICT", "คีย์ใหม่", "WAIVER_ALREADY_SIGNED");
  });
  await st("WV-6", "พนักงานเซ็นต่อหน้า + รูปลายเซ็น PNG ⇒ TripDocument WAIVER ส่วนตัว · method STAFF_WITNESSED · verified true · staffUserId", async () => {
    needDb(); const b = await mkBooking("PD", ["ท่าเรือ"]);
    const v = V(await call("recordWitnessedWaiver", staff("se"), { passengerId: b.pax[0], idempotencyKey: `ww${hex(5)}`, templateHash: W1hash, locale: "th", signerName: "ท่าเรือ", signerRole: "SELF", isMinorDeclared: false, signatureImage: { contentType: "image/png", data: PNG() } }, DEPS), "witnessed");
    const d = await docRow(String(v.documentId)); ok(d && d.kind === "WAIVER", `doc ${fmt(d)}`);
    const e = asRec((await pax(b.pax[0])).waiverEvidence) ?? {};
    eq([e.method, asRec(e.identityProof)?.used, asRec(e.identityProof)?.verified, e.staffUserId, e.signatureDocumentId], ["STAFF_WITNESSED", "STAFF_WITNESSED", true, U.se.userId, v.documentId], "หลักฐาน");
  });
  await st("WV-7", "แม่แบบเปลี่ยนก่อนเริ่มทริป ⇒ NEEDS_RESIGN · ข้อความที่เก็บไม่เปลี่ยน · เซ็นใหม่ด้วยแฮชใหม่ได้ · audit 2 แถว", async () => {
    ok(W1, "WV-2 ไม่ผ่าน"); const old = asRec((await pax(W1.pax[0])).waiverEvidence)?.text;
    const nt = { th: `แม่แบบใหม่ ${STAMP} ข้าพเจ้ารับทราบความเสี่ยง`, en: `New template ${STAMP}` };
    await setV(tA, [{ key: "trips.waiver.template", scope: "PRODUCT", scopeId: PRD.PD.id, value: nt }]);
    const g = V(await call("getTripPassengers", staff(), { bookingId: W1.bookingId }), "get");
    eq(asRec(asArr(g.passengers).find((p) => p.id === W1!.pax[0])?.waiver)?.status, "NEEDS_RESIGN", "สถานะ");
    eq(asRec((await pax(W1.pax[0])).waiverEvidence)?.text, old, "ข้อความเดิม");
    V(await sign(W1t, { templateHash: tplHash(nt) }), "เซ็นใหม่");
    eq([asRec((await pax(W1.pax[0])).waiverEvidence)?.text, (await audits("trips.waiver.signed", W1.pax[0])).length], [nt.th, 2], "หลังเซ็นใหม่");
  });
  await st("WV-8", "แม่แบบเปลี่ยนหลังเริ่มทริปแล้ว ⇒ คง SIGNED", async () => {
    ok(W1, "WV-2 ไม่ผ่าน");
    const dep = (await q<{ startsAt: Date }>(`SELECT "startsAt" FROM "TripDeparture" WHERE id = $1`, [W1.dep]))[0];
    await setV(tA, [{ key: "trips.waiver.template", scope: "PRODUCT", scopeId: PRD.PD.id, value: { th: `หลังออก ${STAMP}`, en: "after" } }]);
    const g = V(await call("getTripPassengers", staff("oa", { now: secs(dep.startsAt, 60) }), { bookingId: W1.bookingId }), "get");
    eq(asRec(asArr(g.passengers).find((p) => p.id === W1!.pax[0])?.waiver)?.status, "SIGNED", "สถานะ");
    W1hash = tplHash(await curTemplate("PD"));
  });
  groupLine("WV");

  // ═══════════════ DC. ไฟล์ ═══════════════
  console.log("\n── DC: ไฟล์ส่วนตัว ──");
  let DC1: Bk | null = null; let DC1t = ""; let DC1doc = "";
  const upload = (token: string, body: Rec) => call("uploadPassengerDocument", pctx(), { token, idempotencyKey: `f${hex(6)}`, contentType: "image/jpeg", data: JPG(), ...body }, DEPS);
  await st("DC-1", "อัปโหลด PASSPORT ผ่านลิงก์ ⇒ TripDocument + FileAsset t/<ร้าน>/private/<40hex>.jpg · cdnUrl private:// · ไม่มีชื่อไฟล์ลูกค้าใน path · retainUntil = ต้นวันถัดจาก E+30", async () => {
    needDb(); DC1 = await mkBooking("PD", ["ไฟล์ หนึ่ง"], { endsAt: new Date("2027-03-10T17:30:00Z") }); DC1t = (await issue(DC1.pax[0])).token;
    const v = V(await upload(DC1t, { kind: "PASSPORT" }), "upload");
    DC1doc = String(v.documentId);
    const d = await docRow(DC1doc); ok(d && d.kind === "PASSPORT" && d.passengerId === DC1.pax[0] && !d.deletedAt, `doc ${fmt(d)}`);
    const fa = (await q<{ path: string; cdnUrl: string }>(`SELECT path, "cdnUrl" FROM "FileAsset" WHERE id = $1`, [d!.fileId]))[0];
    ok(fa && new RegExp(`^t/${tA}/private/[0-9a-f]{40}\\.jpg$`).test(fa.path) && fa.cdnUrl === `private://${fa.path}` && STORE.has(fa.path), `FileAsset ${fmt(fa)}`);
    eq(new Date(String(d!.retainUntil)).toISOString(), instAfter(addDays("2027-03-11", 30)).toISOString(), "retainUntil");
  });
  await st("DC-2", "ชนิดเอกสาร: MEDICAL บน PT ⇒ DOC_KIND_NOT_ALLOWED · MEDICAL บน PD ก่อนยินยอม ⇒ HEALTH_CONSENT_REQUIRED · INSURANCE ทางลิงก์ ⇒ VALIDATION", async () => {
    needDb(); const b = await mkBooking("PT", ["ชนิด"]); const t = (await issue(b.pax[0])).token;
    codeR(await upload(t, { kind: "MEDICAL", contentType: "application/pdf", data: PDF() }), "VALIDATION", "PT", "DOC_KIND_NOT_ALLOWED");
    ok(DC1, "DC-1 ไม่ผ่าน");
    codeR(await upload(DC1t, { kind: "MEDICAL", contentType: "application/pdf", data: PDF() }), "VALIDATION", "ก่อนยินยอม", "HEALTH_CONSENT_REQUIRED");
    codeR(await upload(DC1t, { kind: "INSURANCE" }), "VALIDATION", "INSURANCE");
  });
  await st("DC-3", "ชนิดไฟล์: ประกาศ jpeg แต่ไบต์ png · svg · html ⇒ FILE_TYPE", async () => {
    ok(DC1, "DC-1 ไม่ผ่าน");
    codeR(await upload(DC1t, { kind: "PASSPORT", contentType: "image/jpeg", data: PNG() }), "VALIDATION", "ไม่ตรง", "FILE_TYPE");
    codeR(await upload(DC1t, { kind: "PASSPORT", contentType: "image/svg+xml", data: new TextEncoder().encode("<svg onload=x>") }), "VALIDATION", "svg", "FILE_TYPE");
    codeR(await upload(DC1t, { kind: "PASSPORT", contentType: "text/html", data: new TextEncoder().encode("<html>") }), "VALIDATION", "html", "FILE_TYPE");
  });
  await st("DC-4", "ใหญ่เกิน 5 MB ⇒ FILE_TOO_LARGE · ไม่มีวัตถุใหม่ในที่เก็บ", async () => {
    ok(DC1, "DC-1 ไม่ผ่าน"); const n = STORE.size;
    codeR(await upload(DC1t, { kind: "PASSPORT", data: JPG(5 * 1024 * 1024 + 1) }), "VALIDATION", "ใหญ่", "FILE_TOO_LARGE");
    eq(STORE.size, n, "ที่เก็บ");
  });
  await st("DC-5", "ไฟล์ชนิดเดียวกันต่อคน ≤ 3 ⇒ ใบที่ 4 DOC_LIMIT", async () => {
    ok(DC1, "DC-1 ไม่ผ่าน");
    V(await upload(DC1t, { kind: "PASSPORT" }), "2"); V(await upload(DC1t, { kind: "PASSPORT" }), "3");
    codeR(await upload(DC1t, { kind: "PASSPORT" }), "VALIDATION", "4", "DOC_LIMIT");
  });
  await st("DC-6", "ส่งซ้ำพร้อมกัน 6 ครั้งคีย์เดียว ⇒ TripDocument 1 แถว · FileAsset ของคนที่แพ้ถูกลบ (เหลือ 1) · ทุกผลได้ documentId เดียวกัน", async () => {
    needDb(); const b = await mkBooking("PD", ["ซ้ำ ไฟล์"]); const t = (await issue(b.pax[0])).token;
    const before = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "FileAsset" WHERE "tenantId" = $1`, [tA]))[0]?.n ?? 0;
    const body = { token: t, idempotencyKey: `dup${hex(5)}`, kind: "PASSPORT", contentType: "image/jpeg", data: JPG() };
    const rs = await Promise.all(Array.from({ length: 6 }, () => call("uploadPassengerDocument", pctx(), body, DEPS)));
    ok(rs.every((r) => r.ok === true), `ผล ${fmt(rs.find((r) => r.ok !== true))}`);
    eq(new Set(rs.map((r) => asRec(r.value)?.documentId)).size, 1, "documentId");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDocument" WHERE "passengerId" = $1`, [b.pax[0]]))[0]?.n, 1, "TripDocument");
    eq(((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "FileAsset" WHERE "tenantId" = $1`, [tA]))[0]?.n ?? 0) - before, 1, "FileAsset สุทธิ");
  });
  await st("DC-7", "พนักงานขอลิงก์ไฟล์ PASSPORT (view): url /api/files/<id>?exp&sig TTL 300 · ลายเซ็นผูก STAFF ผู้ขอ · แถว TripDocView STAFF + purpose", async () => {
    ok(DC1, "DC-1 ไม่ผ่าน");
    const v = V(await call("passengerDocumentUrl", staff("sv"), { documentId: DC1doc, purpose: "CHECKIN" }), "url");
    const u = new URL(`http://x${String(v.url)}`); const fileId = String((await docRow(DC1doc))?.fileId);
    eq([u.pathname, v.expiresInSec], [`/api/files/${fileId}`, 300], "url");
    const exp = Number(u.searchParams.get("exp")); ok(exp - Math.floor(Date.now() / 1000) <= 300, "TTL");
    eq([u.searchParams.get("sig"), u.searchParams.get("lv")], [mintSig(fileId, exp, `STAFF:${U.sv.userId}`), null], "ลายเซ็น");
    const views = await q<Rec>(`SELECT "viewerKind", "viewerId", purpose FROM "TripDocView" WHERE "documentId" = $1`, [DC1doc]);
    ok(views.some((x) => x.viewerKind === "STAFF" && x.viewerId === U.sv.userId && x.purpose === "CHECKIN"), `TripDocView ${fmt(views)}`);
  });
  await st("DC-8", "ไฟล์ MEDICAL: sv/MANAGER ⇒ FORBIDDEN SENSITIVE_PERMISSION · sh (health) ⇒ ได้", async () => {
    needDb(); const b = await mkBooking("PD", ["แพทย์"]); const t = (await issue(b.pax[0])).token;
    V(await submit(t, { expectedRev: 0, fields: fullPD(), health: { consent, conditions: "ไม่มี" } }), "ยินยอม");
    const d = V(await upload(t, { kind: "MEDICAL", contentType: "application/pdf", data: PDF() }), "MEDICAL");
    codeR(await call("passengerDocumentUrl", staff("sv"), { documentId: d.documentId, purpose: "SAFETY" }), "FORBIDDEN", "sv", "SENSITIVE_PERMISSION");
    codeR(await call("passengerDocumentUrl", staff("mg"), { documentId: d.documentId, purpose: "SAFETY" }), "FORBIDDEN", "mg", "SENSITIVE_PERMISSION");
    V(await call("passengerDocumentUrl", staff("sh"), { documentId: d.documentId, purpose: "SAFETY" }), "sh");
  });
  groupLine("DC");

  // ═══════════════ CR. route ไฟล์กลาง ═══════════════
  console.log("\n── CR: route ไฟล์กลาง (ผู้ดูเดิมไม่เปลี่ยน + LINK_CUSTOMER) ──");
  const GET = ROUTE.mod?.GET as ((r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>) | undefined;
  let ipN = 1;
  const hit = async (url: string): Promise<Response> => {
    ok(GET, `โหลด route ไม่ได้ (${ROUTE.err.slice(0, 100)})`);
    const u = new URL(url.startsWith("http") ? url : `http://qc.local${url}`);
    const id = decodeURIComponent(u.pathname.replace(/^\/api\/files\//, ""));
    return GET!(new Request(u.toString(), { headers: { "x-forwarded-for": `198.51.100.${(ipN++ % 250) + 1}` } }), { params: Promise.resolve({ id }) });
  };
  await st("CR-1", "ถดถอย: ไม่มี cookie ไม่มี lv ⇒ 403 + cache-control private, no-store (เหมือนเดิม)", async () => {
    const r = await hit(`/api/files/abcdefghijklmnop1234?exp=1&sig=${"0".repeat(64)}`);
    eq([r.status, r.headers.get("cache-control")], [403, "private, no-store"], "ผล");
  });
  await st("CR-2", "ถดถอย: ไม่มีผู้ดู + id รูปที่อยู่ไฟล์ ⇒ 403 (ด่านผู้ดูมาก่อน) · ลายเซ็น STAFF ถูกแต่ไม่มี session ⇒ 403 · lv ผิดรูปไม่ทำให้เกิดผู้ดู ⇒ 403", async () => {
    eq((await hit(`/api/files/..%2Fx?exp=1&sig=00`)).status, 403, "path ไม่มีผู้ดู");
    const exp = Math.floor(Date.now() / 1000) + 200;
    eq((await hit(`/api/files/abcdefghijklmnop1234?exp=${exp}&sig=${mintSig("abcdefghijklmnop1234", exp, "STAFF:u1")}`)).status, 403, "STAFF ไม่มี session");
    eq((await hit(`/api/files/abcdefghijklmnop1234?exp=${exp}&sig=${"0".repeat(64)}&lv=BAD.LV`)).status, 403, "lv ผิดรูป");
  });
  await st("CR-3", "ถดถอย: privateFileViewerKey ของ STAFF/CUSTOMER/PORTAL = ค่าเดิม · ชนิดไม่รู้จัก throw ข้อความเดิม", () => {
    const P = PLI.mod; ok(P, "ไม่มี private-links");
    eq(["STAFF", "CUSTOMER", "PORTAL"].map((k) => (P!.privateFileViewerKey as AnyFn)({ kind: k, id: " u1 " })), ["STAFF:u1", "CUSTOMER:u1", "PORTAL:u1"], "คีย์");
    let m = ""; try { (P!.privateFileViewerKey as AnyFn)({ kind: "ROBOT", id: "u1" }); } catch (e) { m = errMsg(e); }
    eq(m, "ผู้ดูไฟล์ไม่ถูกต้อง — ต้องระบุ { kind: 'STAFF' | 'CUSTOMER' | 'PORTAL', id }", "ข้อความ error");
  });
  let CRurl = ""; let CRlv = "";
  await st("CR-4", "ผู้ถือลิงก์ขอ URL ไฟล์ของตัวเอง ⇒ /api/files/<id>?exp&sig&lv (ไม่มี token) · TripDocView LINK_CUSTOMER · GET ⇒ 200 ไบต์ตรง · หัว private,no-store · nosniff · no-referrer · inline (jpeg)", async () => {
    ok(DC1, "DC-1 ไม่ผ่าน");
    const v = V(await call("customerDocumentUrl", pctx(), { token: DC1t, documentId: DC1doc, purpose: "CUSTOMER_SELF" }), "customerDocumentUrl");
    CRurl = String(v.url); const u = new URL(`http://x${CRurl}`); CRlv = String(u.searchParams.get("lv"));
    const issued = await audits("trips.passenger.link_issued", DC1.pax[0]);
    eq([v.expiresInSec, CRlv], [300, issued[issued.length - 1]?.id], "lv = แถว link_issued ล่าสุด");
    ok(!CRurl.includes(DC1t.split(".")[1]) && !CRurl.includes(DC1t.split(".")[0]), "token ใน URL");
    ok((await q(`SELECT 1 FROM "TripDocView" WHERE "documentId" = $1 AND "viewerKind" = 'LINK_CUSTOMER' AND "viewerId" = $2 AND purpose = 'CUSTOMER_SELF'`, [DC1doc, CRlv])).length === 1, "TripDocView");
    const r = await hit(CRurl);
    eq([r.status, r.headers.get("cache-control"), r.headers.get("x-content-type-options"), r.headers.get("referrer-policy"), r.headers.get("content-disposition")], [200, "private, no-store", "nosniff", "no-referrer", "inline"], "หัว");
    eq(new Uint8Array(await r.arrayBuffer()).slice(0, 4), JPG().slice(0, 4), "ไบต์");
  });
  await st("CR-5", "ลิงก์ของคน A เปิดไฟล์คน B ไม่ได้: customerDocumentUrl(documentId ของ B) ⇒ NOT_FOUND · สลับ id ใน URL ⇒ 403 · ลายเซ็น LINK ถูกแต่ไฟล์ของคนอื่น/ร้านอื่น ⇒ 404", async () => {
    ok(DC1 && CRlv, "CR-4 ไม่ผ่าน");
    const b = await mkBooking("PD", ["คนอื่น"]); const tb = (await issue(b.pax[0])).token;
    const vb = V(await upload(tb, { kind: "PASSPORT" }), "upload B"); const fileB = String((await docRow(String(vb.documentId)))?.fileId);
    codeR(await call("customerDocumentUrl", pctx(), { token: DC1t, documentId: vb.documentId, purpose: "CUSTOMER_SELF" }), "NOT_FOUND", "documentId ของ B");
    const u = new URL(`http://x${CRurl}`); u.pathname = `/api/files/${fileB}`;
    eq((await hit(`${u.pathname}${u.search}`)).status, 403, "สลับ id");
    const exp = Math.floor(Date.now() / 1000) + 200;
    eq((await hit(`/api/files/${fileB}?exp=${exp}&sig=${mintSig(fileB, exp, `LINK_CUSTOMER:${CRlv}`)}&lv=${CRlv}`)).status, 404, "ไฟล์คนอื่น");
    const up = asRec(await (STO?.uploadFile as AnyFn)({ tenantId: tB }, { kind: "ATTACHMENT", filename: "x.jpg", contentType: "image/jpeg", data: JPG(), visibility: "private" })) ?? {};
    const fT = String(up.assetId);
    eq((await hit(`/api/files/${fT}?exp=${exp}&sig=${mintSig(fT, exp, `LINK_CUSTOMER:${CRlv}`)}&lv=${CRlv}`)).status, 404, "ร้านอื่น");
  });
  await st("CR-6", "เพิกถอน/ออกลิงก์ใหม่หลังออก URL ไฟล์ ⇒ URL เดิมใช้ไม่ได้ทันที (404)", async () => {
    needDb(); const b = await mkBooking("PD", ["ถอน URL"]); const t = (await issue(b.pax[0])).token;
    const d = V(await upload(t, { kind: "PASSPORT" }), "upload");
    const url = String(V(await call("customerDocumentUrl", pctx(), { token: t, documentId: d.documentId, purpose: "CUSTOMER_SELF" }), "url").url);
    eq((await hit(url)).status, 200, "ก่อน");
    V(await call("revokePassengerFormLink", staff(), { passengerId: b.pax[0] }), "revoke");
    eq((await hit(url)).status, 404, "หลังเพิกถอน");
  });
  await st("CR-7", "หมดอายุ: ลายเซ็น exp ผ่านไปแล้ว ⇒ 403 · linkCustomerMayOpenFile หลังจบทริป ⇒ false · ก่อนจบ ⇒ true", async () => {
    ok(DC1 && CRlv, "CR-4 ไม่ผ่าน"); const fileId = String((await docRow(DC1doc))?.fileId);
    const past = Math.floor(Date.now() / 1000) - 5;
    eq((await hit(`/api/files/${fileId}?exp=${past}&sig=${mintSig(fileId, past, `LINK_CUSTOMER:${CRlv}`)}&lv=${CRlv}`)).status, 403, "exp ผ่าน");
    const f = fn("linkCustomerMayOpenFile");
    eq([await f({ viewerId: CRlv, fileId, tenantId: tA, now: new Date(NOW0) }), await f({ viewerId: CRlv, fileId, tenantId: tA, now: new Date("2027-03-11T00:00:00Z") }), await f({ viewerId: CRlv, fileId, tenantId: tB, now: new Date(NOW0) })], [true, false, false], "ผล");
  });
  await st("CR-8", "ไฟล์ MEDICAL: customerDocumentUrl ⇒ FORBIDDEN OTP_REQUIRED · ลายเซ็น LINK ที่ข้อสอบทำเองสำหรับไฟล์ MEDICAL ⇒ 404 · มุมมองบอก viewable false", async () => {
    needDb(); const b = await mkBooking("PD", ["แพทย์ ลิงก์"]); const t = (await issue(b.pax[0])).token;
    V(await submit(t, { expectedRev: 0, fields: fullPD(), health: { consent, conditions: "ไม่มี" } }), "ยินยอม");
    const d = V(await upload(t, { kind: "MEDICAL", contentType: "application/pdf", data: PDF() }), "MEDICAL");
    codeR(await call("customerDocumentUrl", pctx(), { token: t, documentId: d.documentId, purpose: "CUSTOMER_SELF" }), "FORBIDDEN", "MEDICAL", "OTP_REQUIRED");
    const fileId = String((await docRow(String(d.documentId)))?.fileId); const lv = (await audits("trips.passenger.link_issued", b.pax[0])).pop()?.id ?? "";
    const exp = Math.floor(Date.now() / 1000) + 200;
    eq((await hit(`/api/files/${fileId}?exp=${exp}&sig=${mintSig(fileId, exp, `LINK_CUSTOMER:${lv}`)}&lv=${lv}`)).status, 404, "route");
    eq(asArr(V(await call("openPassengerForm", pctx(), { token: t }), "open").documents).find((x) => x.id === d.documentId)?.viewable, false, "viewable");
  });
  await st("CR-9", "อัตราต่อผู้ดูลิงก์ (60/นาที ของ route เดิม): ครั้งที่ 61 ⇒ 429", async () => {
    needDb(); const b = await mkBooking("PD", ["อัตรา ไฟล์"]); const t = (await issue(b.pax[0])).token;
    const d = V(await upload(t, { kind: "PASSPORT" }), "upload");
    const fresh = String(V(await call("customerDocumentUrl", pctx(), { token: t, documentId: d.documentId, purpose: "CUSTOMER_SELF" }), "url").url);
    const codes: number[] = []; for (let i = 0; i < 61; i++) codes.push((await hit(fresh)).status);
    eq([codes.slice(0, 60).every((c) => c === 200), codes[60]], [true, 429], "ผล");
  });
  groupLine("CR");

  // ═══════════════ MK. ปิดบัง / เปิดดู ═══════════════
  console.log("\n── MK: ปิดบัง/เปิดดู ──");
  await st("MK-1", "DTO ฝั่งร้าน (X21 จริง): docMasked ••••+4 · dob ปิดบัง · ไม่มีเลขเต็ม/กล่อง/สุขภาพ/token/URL ในผลทั้งก้อน", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    const g = V(await call("getTripPassengers", staff("sv"), { bookingId: SB1.bookingId }), "get");
    const p = asArr(g.passengers).find((x) => x.id === SB1!.pax[0]) ?? {};
    eq([p.docMasked, p.dob], [`••••${MK.doc.slice(-4)}`, "1990-••-••"], "ปิดบัง");
    const s = JSON.stringify(g); ok(!s.includes(MK.doc) && !/"box"|docNumberEnc|tokenHash|\/api\/files/.test(s), "DTO รั่ว");
  });
  await st("MK-2", "เปิดเลขเต็ม: sr (reveal) ได้ค่าเต็ม · MANAGER/sv ⇒ FORBIDDEN SENSITIVE_PERMISSION · audit revealed {what purpose} ไม่มีค่า", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    eq(V(await call("revealPassengerData", staff("sr"), { passengerId: SB1.pax[0], what: "DOC_NUMBER", purpose: "MANIFEST" }), "sr").docNumber, MK.doc, "ค่า");
    codeR(await call("revealPassengerData", staff("mg"), { passengerId: SB1.pax[0], what: "DOC_NUMBER", purpose: "MANIFEST" }), "FORBIDDEN", "mg", "SENSITIVE_PERMISSION");
    codeR(await call("revealPassengerData", staff("sv"), { passengerId: SB1.pax[0], what: "DOC_NUMBER", purpose: "MANIFEST" }), "FORBIDDEN", "sv", "SENSITIVE_PERMISSION");
    const a = await audits("trips.passenger.revealed", SB1.pax[0]);
    ok(a.length === 1 && a[0].after?.what === "DOC_NUMBER" && a[0].after?.purpose === "MANIFEST" && a[0].actorId === U.sr.userId && leaks(JSON.stringify(a)).length === 0, `audit ${fmt(a)}`);
  });
  await st("MK-3", "เปิดข้อมูลสุขภาพ: sh ได้ · sr ⇒ FORBIDDEN · audit", async () => {
    needDb(); const b = await mkBooking("PD", ["เปิด สุขภาพ"]); const t = (await issue(b.pax[0])).token;
    V(await submit(t, { expectedRev: 0, fields: fullPD(), health: { consent, allergies: MK.allergy } }), "submit");
    eq(asRec(V(await call("revealPassengerData", staff("sh"), { passengerId: b.pax[0], what: "HEALTH", purpose: "SAFETY" }), "sh").health), { allergies: MK.allergy, conditions: null }, "ค่า");
    codeR(await call("revealPassengerData", staff("sr"), { passengerId: b.pax[0], what: "HEALTH", purpose: "SAFETY" }), "FORBIDDEN", "sr", "SENSITIVE_PERMISSION");
    eq((await audits("trips.passenger.revealed", b.pax[0])).length, 1, "audit");
  });
  await st("MK-4", "purpose ต้องเป็น enum (ข้อความอิสระ ⇒ VALIDATION)", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    codeR(await call("revealPassengerData", staff("sr"), { passengerId: SB1.pax[0], what: "DOC_NUMBER", purpose: "ลูกค้าโทรมาถาม" }), "VALIDATION", "purpose");
  });
  await st("MK-5", "X21 เท็จ (หน่วย uA2): dob เต็มทุกคน · docNumber เต็มเฉพาะผู้มีสิทธิ์ reveal (เจ้าของ) + audit list_unmasked · su2 เห็นแค่ docMasked", async () => {
    needDb(); const b = await mkBooking("PC", ["ไม่ปิด"]);
    V(await call("updateTripPassenger", staff("oa", { unit: uA2 }), { passengerId: b.pax[0], expectedRev: 0, idempotencyKey: `u${hex(6)}`, fields: { dob: "1985-02-03", docType: "PASSPORT", docNumber: "XY9876543" } }), "update");
    const o = asArr(V(await call("getTripPassengers", staff("oa", { unit: uA2 }), { bookingId: b.bookingId }), "owner").passengers)[0] ?? {};
    const s2 = asArr(V(await call("getTripPassengers", staff("su2", { unit: uA2 }), { bookingId: b.bookingId }), "su2").passengers)[0] ?? {};
    eq([o.dob, o.docNumber, s2.dob, s2.docNumber, s2.docMasked], ["1985-02-03", "XY9876543", "1985-02-03", undefined, "••••6543"], "ผล");
    eq((await q(`SELECT 1 FROM "AuditLog" WHERE action = 'trips.passenger.list_unmasked' AND "tenantId" = $1 AND "actorId" = $2`, [tA, U.oa.userId])).length >= 1, true, "audit");
  });
  groupLine("MK");

  // ═══════════════ SE. สิทธิ์ฝั่งร้าน ═══════════════
  console.log("\n── SE: สิทธิ์ฝั่งร้าน ──");
  await st("SE-1", "แก้ข้อมูลสุขภาพฝั่งร้าน: se (edit · มี trips.*) ⇒ FORBIDDEN SENSITIVE_PERMISSION · sh ⇒ ได้ via STAFF_RECORDED", async () => {
    needDb(); const b = await mkBooking("PD", ["ร้าน สุขภาพ"]);
    const body = { passengerId: b.pax[0], expectedRev: 0, idempotencyKey: `u${hex(6)}`, fields: fullPD(), health: { consent, allergies: "ไข่" } };
    codeR(await call("updateTripPassenger", staff("se"), body), "FORBIDDEN", "se", "SENSITIVE_PERMISSION");
    V(await call("updateTripPassenger", staff("sh"), { ...body, idempotencyKey: `u${hex(6)}` }), "sh");
    eq(asRec(asRec(asRec((await pax(b.pax[0])).answers)?.health)?.consent)?.via, "STAFF_RECORDED", "via");
  });
  await st("SE-2", "บริการตรวจสิทธิ์เอง: sv แก้ ⇒ FORBIDDEN · pm (ไม่มี view) อ่าน ⇒ FORBIDDEN · sv ออกลิงก์ ⇒ FORBIDDEN", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    codeR(await call("updateTripPassenger", staff("sv"), { passengerId: SB1.pax[0], expectedRev: revOf(await pax(SB1.pax[0])), idempotencyKey: `u${hex(6)}`, fields: { finSize: "40" } }), "FORBIDDEN", "sv แก้");
    codeR(await call("getTripPassengers", staff("pm"), { bookingId: SB1.bookingId }), "FORBIDDEN", "pm อ่าน");
    codeR(await call("issuePassengerFormLink", staff("sv"), { passengerId: SB1.pax[0] }), "FORBIDDEN", "sv ลิงก์");
  });
  await st("SE-3", "ผู้กระทำ PUBLIC บนบริการฝั่งร้าน ⇒ FORBIDDEN PUBLIC_NOT_ALLOWED · AGENT ⇒ FORBIDDEN AGENCY_NOT_ENABLED", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    codeR(await call("getTripPassengers", { tenantId: tA, unitId: uA, channel: "WEB", actor: { kind: "PUBLIC", clientKey: "t08qc_x" }, now: new Date(NOW0) }, { bookingId: SB1.bookingId }), "FORBIDDEN", "PUBLIC", "PUBLIC_NOT_ALLOWED");
    codeR(await call("getTripPassengers", { tenantId: tA, unitId: uA, channel: "AGENT_PORTAL", actor: { kind: "AGENT", agentAccountId: "a1", agentUserId: "au1" }, now: new Date(NOW0) }, { bookingId: SB1.bookingId }), "FORBIDDEN", "AGENT", "AGENCY_NOT_ENABLED");
  });
  groupLine("SE");

  // ═══════════════ X. แยกร้าน/หน่วย ═══════════════
  console.log("\n── X: แยกร้าน/หน่วย ──");
  await st("X-1", "ร้าน B อ่าน/แก้/ออกลิงก์ของร้าน A ไม่ได้ (NOT_FOUND ข้อความเดียว) ทั้ง ctx ของ B และ ctx ของ A ด้วยผู้ใช้ B", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    for (const ctx of [staff("ob"), staff("ob", { tenant: tA, unit: uA })]) {
      codeR(await call("getTripPassengers", ctx, { bookingId: SB1.bookingId }), "NOT_FOUND", "อ่าน");
      codeR(await call("issuePassengerFormLink", ctx, { passengerId: SB1.pax[0] }), "NOT_FOUND", "ลิงก์");
      codeR(await call("revealPassengerData", ctx, { passengerId: SB1.pax[0], what: "DOC_NUMBER", purpose: "MANIFEST" }), "NOT_FOUND", "reveal");
    }
  });
  await st("X-2", "พนักงานที่เข้าได้แค่หน่วย uA2 เข้าการจองของ uA ไม่ได้ (NOT_FOUND)", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    codeR(await call("getTripPassengers", staff("su2", { unit: uA }), { bookingId: SB1.bookingId }), "NOT_FOUND", "su2");
  });
  await st("X-3", "documentId ของร้าน A ผ่านร้าน B ⇒ NOT_FOUND · ctx หน่วย uA2 กับการจองของ uA ⇒ NOT_FOUND", async () => {
    ok(DC1, "DC-1 ไม่ผ่าน");
    codeR(await call("passengerDocumentUrl", staff("ob"), { documentId: DC1doc, purpose: "CHECKIN" }), "NOT_FOUND", "ร้าน B");
    codeR(await call("getTripPassengers", staff("oa", { unit: uA2 }), { bookingId: DC1.bookingId }), "NOT_FOUND", "หน่วยอื่น");
  });
  groupLine("X");

  // ═══════════════ PQ. คำขอเจ้าของข้อมูล ═══════════════
  console.log("\n── PQ: คำขอเจ้าของข้อมูล ──");
  let PQ1: Bk | null = null; let PQreq = "";
  await st("PQ-1", "บันทึกคำขอ: ERASE dueAt = ต้นวันถัดจาก รับ+90 · ACCESS = +30 · คีย์ซ้ำ = ผลเดิม", async () => {
    needDb(); PQ1 = await mkBooking("PD", [MK.name]);
    const key = `pq${hex(5)}`;
    const e = V(await call("recordPdpaRequest", staff("pm"), { kind: "ERASE", passengerId: PQ1.pax[0], receivedAt: "2027-03-01", idempotencyKey: key }), "ERASE");
    const a = V(await call("recordPdpaRequest", staff("pm"), { kind: "ACCESS", passengerId: PQ1.pax[0], receivedAt: "2027-03-01", idempotencyKey: `pq${hex(5)}` }), "ACCESS");
    PQreq = String(e.requestId);
    eq([new Date(String(e.dueAt)).toISOString(), new Date(String(a.dueAt)).toISOString()], [instAfter(addDays("2027-03-01", 90)).toISOString(), instAfter(addDays("2027-03-01", 30)).toISOString()], "dueAt");
    eq(V(await call("recordPdpaRequest", staff("pm"), { kind: "ERASE", passengerId: PQ1.pax[0], receivedAt: "2027-03-01", idempotencyKey: key }), "ซ้ำ").requestId, PQreq, "ซ้ำ");
  });
  await st("PQ-2", "รายการคำขอ: dueSoon (≤ 7 วัน) / overdue ตามนาฬิกา", async () => {
    ok(PQreq, "PQ-1 ไม่ผ่าน");
    const at = async (now: string) => asArr(V(await call("listPdpaRequests", staff("pm", { now }), {}), "list").items).find((x) => x.id === PQreq) ?? {};
    const a = await at("2027-05-26T00:00:00Z"), b = await at("2027-06-05T00:00:00Z");
    eq([a.dueSoon, a.overdue, b.overdue], [true, false, true], "ผล");
  });
  await st("PQ-3", "ERASE → DONE ⇒ ลบทั้งคน (ชื่อว่าง · คอลัมน์ null · ไฟล์ลบ · answers.purged) + audit · ปิดซ้ำด้วยสถานะเก่า ⇒ STATE_CONFLICT", async () => {
    ok(PQ1 && PQreq, "PQ-1 ไม่ผ่าน"); const t = (await issue(PQ1.pax[0])).token;
    V(await submit(t, { expectedRev: 0, fields: fullPD() }), "submit"); const d = V(await upload(t, { kind: "PASSPORT" }), "upload");
    V(await call("resolvePdpaRequest", staff("pm"), { requestId: PQreq, expectedStatus: "RECEIVED", decision: "IN_PROGRESS" }, DEPS), "IN_PROGRESS");
    V(await call("resolvePdpaRequest", staff("pm"), { requestId: PQreq, expectedStatus: "IN_PROGRESS", decision: "DONE" }, DEPS), "DONE");
    const r = await pax(PQ1.pax[0]);
    eq([r.fullName, r.docNumberEnc, r.docLast4, r.nationality, r.dob, Array.isArray(asRec(asRec(r.answers)?.purged)?.stages)], ["", null, null, null, null, true], "ลบทั้งคน");
    ok((await docRow(String(d.documentId)))?.deletedAt, "ไฟล์ยังอยู่");
    codeR(await call("resolvePdpaRequest", staff("pm"), { requestId: PQreq, expectedStatus: "IN_PROGRESS", decision: "DONE" }, DEPS), "STATE_CONFLICT", "ปิดซ้ำ");
  });
  await st("PQ-4", "REJECTED ต้องมี reasonCode · LEGAL_CLAIM ⇒ ข้อมูลอยู่ครบ · คำขอที่มีแค่ partyId + DONE ⇒ PARTY_ERASE_NOT_SUPPORTED", async () => {
    needDb(); const b = await mkBooking("PT", ["เก็บสู้คดี"]);
    const r = V(await call("recordPdpaRequest", staff("pm"), { kind: "ERASE", passengerId: b.pax[0], idempotencyKey: `pq${hex(5)}` }), "record");
    codeR(await call("resolvePdpaRequest", staff("pm"), { requestId: r.requestId, expectedStatus: "RECEIVED", decision: "REJECTED" }, DEPS), "VALIDATION", "ไม่มีเหตุ");
    V(await call("resolvePdpaRequest", staff("pm"), { requestId: r.requestId, expectedStatus: "RECEIVED", decision: "REJECTED", reasonCode: "LEGAL_CLAIM" }, DEPS), "REJECTED");
    eq((await pax(b.pax[0])).fullName, "เก็บสู้คดี", "ข้อมูลอยู่");
    const party = (await q<{ id: string }>(`SELECT "bookerPartyId" AS id FROM "TripBooking" WHERE id = $1`, [b.bookingId]))[0]?.id;
    const pr = V(await call("recordPdpaRequest", staff("pm"), { kind: "ERASE", partyId: party, idempotencyKey: `pq${hex(5)}` }), "party");
    codeR(await call("resolvePdpaRequest", staff("pm"), { requestId: pr.requestId, expectedStatus: "RECEIVED", decision: "DONE" }, DEPS), "VALIDATION", "party", "PARTY_ERASE_NOT_SUPPORTED");
  });
  await st("PQ-5", "สิทธิ์คิวคำขอ = trips.pdpa.manage (evaluate): sv (view อย่างเดียว) บันทึก/อ่านคำขอ ⇒ FORBIDDEN", async () => {
    ok(PQ1, "PQ-1 ไม่ผ่าน");
    codeR(await call("recordPdpaRequest", staff("sv"), { kind: "ACCESS", passengerId: PQ1.pax[0], idempotencyKey: `pq${hex(5)}` }), "FORBIDDEN", "sv");
    codeR(await call("listPdpaRequests", staff("sv"), {}), "FORBIDDEN", "sv list");
  });
  await st("PQ-6", "ส่งออกข้อมูลผู้เดินทาง: ต้อง reveal + health (sh ⇒ FORBIDDEN · เจ้าของได้ครบรวมเลขเต็ม) + audit exported", async () => {
    ok(SB1, "SB-1 ไม่ผ่าน");
    codeR(await call("exportPassengerData", staff("sh"), { passengerId: SB1.pax[0], purpose: "PDPA_REQUEST" }), "FORBIDDEN", "sh", "SENSITIVE_PERMISSION");
    const v = V(await call("exportPassengerData", staff("oa"), { passengerId: SB1.pax[0], purpose: "PDPA_REQUEST" }), "owner");
    ok(JSON.stringify(v).includes(MK.doc), "ไม่มีเลขเต็ม");
    eq((await audits("trips.passenger.exported", SB1.pax[0])).length, 1, "audit");
  });
  groupLine("PQ");

  // ═══════════════ RC. ยิงพร้อมกัน ═══════════════
  console.log("\n── RC: ยิงพร้อมกัน ──");
  await st("RC-1", "ส่งซ้ำพร้อมกัน 10 ครั้งคีย์เดียว ⇒ rev เพิ่ม 1 · ทุกผล ok (ผู้แพ้ replayed) · event 1", async () => {
    needDb(); const b = await mkBooking("PD", ["พร้อม หนึ่ง"]); const t = (await issue(b.pax[0])).token;
    const body = { token: t, idempotencyKey: `rc${hex(5)}`, expectedRev: 0, fields: fullPD({ fullName: "พร้อม หนึ่ง" }) };
    const rs = await Promise.all(Array.from({ length: 10 }, () => call("submitPassengerForm", pctx(), body)));
    ok(rs.every((r) => r.ok === true && asRec(r.value)?.rev === 1), `ผล ${fmt(rs.find((r) => r.ok !== true || asRec(r.value)?.rev !== 1))}`);
    eq([revOf(await pax(b.pax[0])), (await outbox("trips.passenger.form_completed")).filter((e) => e.payload.passengerId === b.pax[0]).length], [1, 1], "rev/event");
  });
  await st("RC-2", "ลูกค้า ∥ พนักงาน rev เดียวกัน (5 รอบ) ⇒ สำเร็จ 1 ต่อรอบ อีกฝั่ง STATE_CONFLICT · ค่าสุดท้าย = ผู้ชนะ (ไม่มีการเขียนหาย)", async () => {
    needDb(); const b = await mkBooking("PT", ["แข่ง"]); const t = (await issue(b.pax[0])).token;
    for (let i = 0; i < 5; i++) {
      const rv = revOf(await pax(b.pax[0]));
      const [c, s] = await Promise.all([submit(t, { expectedRev: rv, fields: { pickupHotel: `ลูกค้า ${i}` } }), call("updateTripPassenger", staff("se"), { passengerId: b.pax[0], expectedRev: rv, idempotencyKey: `u${hex(6)}`, fields: { pickupHotel: `ร้าน ${i}` } })]);
      const wins = [c, s].filter((r) => r.ok === true);
      ok(wins.length === 1 && [c, s].some((r) => r.code === "STATE_CONFLICT"), `รอบ ${i}: ${fmt([c, s])}`);
      eq(asRec(asRec((await pax(b.pax[0])).answers)?.fields)?.pickupHotel, c.ok === true ? `ลูกค้า ${i}` : `ร้าน ${i}`, `ค่ารอบ ${i}`);
    }
  });
  await st("RC-3", "เซ็น ∥ เปลี่ยนแม่แบบ (6 คนพร้อมกัน): หลักฐานทุกใบ textHash = sha256(text) · templateHash ∈ {เก่า, ใหม่} · สถานะ = SIGNED ถ้าตรงปัจจุบันไม่งั้น NEEDS_RESIGN", async () => {
    needDb(); const b = await mkBooking("PD", ["ก1", "ก2", "ก3", "ก4", "ก5", "ก6"]);
    const toks = await Promise.all(b.pax.map(async (p) => (await issue(p)).token));
    const oldT = await curTemplate("PD"); const oldH = tplHash(oldT); const nt = { th: `แข่งแม่แบบ ${hex(3)}`, en: "race" };
    await Promise.all([...toks.map((t) => sign(t, { templateHash: oldH })), setV(tA, [{ key: "trips.waiver.template", scope: "PRODUCT", scopeId: PRD.PD.id, value: nt }])]);
    const g = asArr(V(await call("getTripPassengers", staff(), { bookingId: b.bookingId }), "get").passengers);
    for (const p of b.pax) {
      const e = asRec((await pax(p)).waiverEvidence); if (!e) continue;
      ok(e.textHash === sha256hex(String(e.text)) && [oldH, tplHash(nt)].includes(String(e.templateHash)) && (e.templateHash === oldH ? e.text === oldT.th : e.text === nt.th), `หลักฐาน ${fmt(e)}`);
      eq(asRec(g.find((x) => x.id === p)?.waiver)?.status, e.templateHash === tplHash(nt) ? "SIGNED" : "NEEDS_RESIGN", "สถานะ");
    }
    W1hash = tplHash(nt);
  });
  await st("RC-4", "ลบตามคำขอ ∥ ลูกค้าส่งข้อมูล (มีตัวบ่งชี้) ⇒ จบแล้วแถวไม่มีตัวบ่งชี้ไม่ว่าลำดับใด · การส่งที่มาหลังได้ NOT_FOUND/STATE_CONFLICT", async () => {
    needDb();
    for (let i = 0; i < 3; i++) {
      const b = await mkBooking("PD", [`ลบแข่ง ${i}`]); const t = (await issue(b.pax[0])).token;
      const r = V(await call("recordPdpaRequest", staff("pm"), { kind: "ERASE", passengerId: b.pax[0], idempotencyKey: `pq${hex(5)}` }), "record");
      V(await call("resolvePdpaRequest", staff("pm"), { requestId: r.requestId, expectedStatus: "RECEIVED", decision: "IN_PROGRESS" }, DEPS), "progress");
      const [sub] = await Promise.all([submit(t, { expectedRev: 0, fields: fullPD() }), call("resolvePdpaRequest", staff("pm"), { requestId: r.requestId, expectedStatus: "IN_PROGRESS", decision: "DONE" }, DEPS)]);
      const row = await pax(b.pax[0]);
      eq(leaks(JSON.stringify(row)), [], `รอบ ${i} แถวมีตัวบ่งชี้`);
      ok(sub.ok === true || ["NOT_FOUND", "STATE_CONFLICT"].includes(String(sub.code)), `submit ${fmt(sub)}`);
    }
  });
  await st("RC-5", "ลบตามอายุ ∥ พนักงานแก้ (ชั้นสุขภาพครบกำหนด): สุดท้ายสุขภาพ PURGED · การแก้สำเร็จหรือ STATE_CONFLICT (ไม่หายเงียบ)", async () => {
    needDb(); const b = await mkBooking("PD", ["อายุ แข่ง"], { endsAt: new Date("2027-03-10T17:30:00Z") }); const t = (await issue(b.pax[0])).token;
    V(await submit(t, { expectedRev: 0, fields: fullPD(), health: { consent, allergies: MK.allergy } }), "submit");
    const at = instAfter(addDays("2027-03-11", 365));
    const [, s] = await Promise.all([call("runPdpaPurge", at, { tenantIds: [tA], storage: { del: fakeDel } }), call("updateTripPassenger", staff("se", { now: at }), { passengerId: b.pax[0], expectedRev: 1, idempotencyKey: `u${hex(6)}`, fields: { finSize: "41" } })]);
    await call("runPdpaPurge", at, { tenantIds: [tA], storage: { del: fakeDel } });
    const row = await pax(b.pax[0]);
    eq(asRec(asRec(row.answers)?.health)?.status, "PURGED", "สุขภาพ");
    ok(s.ok === true ? asRec(asRec(row.answers)?.fields)?.finSize === "41" : s.code === "STATE_CONFLICT", `แก้ ${fmt(s)}`);
  });
  await st("RC-6", "งานลบ 3 ตัวพร้อมกัน ⇒ ไฟล์ครบกำหนดลบครั้งเดียว: deletedAt 1 · event 1 · audit 1 ต่อไฟล์", async () => {
    needDb(); const b = await mkBooking("PD", ["งาน แข่ง"], { endsAt: new Date("2027-03-10T17:30:00Z") }); const t = (await issue(b.pax[0])).token;
    const ds = [V(await upload(t, { kind: "PASSPORT" }), "1").documentId, V(await upload(t, { kind: "PASSPORT" }), "2").documentId].map(String);
    const at = instAfter(addDays("2027-03-11", 30));
    await Promise.all(Array.from({ length: 3 }, () => call("runPdpaPurge", at, { tenantIds: [tA], storage: { del: fakeDel } })));
    for (const d of ds) {
      ok((await docRow(d))?.deletedAt, `ยังไม่ลบ ${d}`);
      eq((await outbox("trips.document.purged")).filter((e) => e.idempotencyKey === `trips.document.purged:${d}`).length, 1, "event");
      eq((await q(`SELECT 1 FROM "AuditLog" WHERE action = 'trips.document.purged' AND "targetId" = $1`, [d])).length, 1, "audit");
    }
  });
  groupLine("RC");

  // ═══════════════ RT. ลบตามอายุ ═══════════════
  console.log("\n── RT: ลบตามอายุ (เขตเวลาหน่วย · E = 11 มี.ค. 2570 จาก endsAt 17:30Z) ──");
  const E = "2027-03-11";
  const plantFile = async (tenantId: string, ext = "jpg") => {
    const path = `t/${tenantId}/private/${randomBytes(20).toString("hex")}.${ext}`; STORE.set(path, JPG());
    return { fileId: await insertRow("FileAsset", { id: rid("fa"), tenantId, kind: "ATTACHMENT", path, cdnUrl: `private://${path}`, contentType: ext === "pdf" ? "application/pdf" : "image/jpeg", bytes: 64 }), path };
  };
  const plantDoc = async (b: Bk, kind: string, days: number | null, tenantId = tA, unitId = uA) => {
    const f = await plantFile(tenantId, kind === "MEDICAL" ? "pdf" : "jpg");
    const ru = days === null ? new Date("9999-12-31T00:00:00Z") : instAfter(addDays(E, days));
    const id = await insertRow("TripDocument", { id: rid("doc"), tenantId, unitId, passengerId: b.pax[0], kind, fileId: f.fileId, consent: null, retainUntil: ru, deletedAt: null, updatedAt: new Date() });
    return { id, ...f, ru };
  };
  const endsRT = new Date("2027-03-10T17:30:00Z");
  /** ผู้เดินทางที่ปลูกข้อมูลทุกชั้นตามรูป v1 ของใบสั่ง (ข้อสอบปิดผนึกเองด้วย AAD ของใบสั่ง) */
  const plantFullPax = async (): Promise<{ b: Bk; med: { id: string; path: string }; wv: { id: string; path: string } }> => {
    const b = await mkBooking("PD", [MK.name], { endsAt: endsRT }); const p = b.pax[0];
    const answers = { v: 1, rev: 3, fields: { finSize: "40" }, health: { status: "PROVIDED", box: seal({ v: 1, allergies: MK.allergy, conditions: MK.cond }, `trips.pax.health.v1:${tA}:${p}`), consent: { version: CONSENT_VERSION, textHash: CONSENT_HASH, at: NOW0, via: "LINK", signerRole: "GUARDIAN" } } };
    const ev = { v: 1, templateHash: W1hash, locale: "th", text: "ข้อความ", textHash: sha256hex("ข้อความ"), signedAt: NOW0, method: "LINK", identityProof: { required: "OTP_PHONE", used: "LINK_POSSESSION", verified: false }, signer: { role: "GUARDIAN", name: MK.guardian }, minor: { isMinor: true, age: 9 } };
    await pool.query(`UPDATE "TripPassenger" SET answers = $2, "docNumberEnc" = $3, "docLast4" = $4, "waiverEvidence" = $5, "waiverSignedAt" = $6, "guardianConsent" = $7, "isMinor" = true, "retainUntil" = $8 WHERE id = $1`,
      [p, JSON.stringify(answers), seal({ v: 1, n: MK.doc }, `trips.pax.doc.v1:${tA}:${p}`), MK.doc.slice(-4), JSON.stringify(ev), new Date(NOW0), JSON.stringify({ v: 1, name: MK.guardian, relation: "PARENT", at: NOW0, via: "LINK", scopes: ["HEALTH", "WAIVER"] }), instAfter(addDays(E, 365))]);
    const med = await plantDoc(b, "MEDICAL", 365); const wv = await plantDoc(b, "WAIVER", 1095);
    return { b, med, wv };
  };
  const purge = (at: Date, o: Rec = {}) => call("runPdpaPurge", at, { tenantIds: [tA], storage: { del: fakeDel }, ...o });
  await st("RT-1", "ขอบ: PASSPORT (30 วัน) ไม่ลบที่ 2027-04-10T16:59:59Z · ลบที่ 17:00:00Z (FileAsset+วัตถุหาย · deletedAt)", async () => {
    needDb(); const b = await mkBooking("PD", ["ขอบ"], { endsAt: endsRT }); const d = await plantDoc(b, "PASSPORT", 30);
    V(await purge(new Date("2027-04-10T16:59:59Z")), "ก่อน"); ok(!(await docRow(d.id))?.deletedAt && STORE.has(d.path), "ลบก่อนเวลา");
    V(await purge(new Date("2027-04-10T17:00:00Z")), "ถึง");
    ok((await docRow(d.id))?.deletedAt && !STORE.has(d.path), "ยังไม่ลบ");
    eq((await q(`SELECT 1 FROM "FileAsset" WHERE id = $1`, [d.fileId])).length, 0, "FileAsset");
  });
  let RTP: Awaited<ReturnType<typeof plantFullPax>> | null = null;
  await st("RT-2", "ชั้นสุขภาพ (365): กล่อง ⇒ {status PURGED} · ไฟล์ MEDICAL ลบ · เลขเอกสารยังอยู่ (ชั้น 500) · retainUntil เลื่อนไปชั้นถัดไป", async () => {
    needDb(); RTP = await plantFullPax(); const p = RTP.b.pax[0];
    V(await purge(new Date(instAfter(addDays(E, 365)).getTime() - 1000)), "ก่อน"); eq(asRec(asRec((await pax(p)).answers)?.health)?.status, "PROVIDED", "ก่อนเวลา");
    V(await purge(instAfter(addDays(E, 365))), "ถึง");
    const r = await pax(p); const h = asRec(asRec(r.answers)?.health) ?? {};
    eq([h.status, h.box, h.consent], ["PURGED", undefined, undefined], "สุขภาพ");
    ok((await docRow(RTP.med.id))?.deletedAt && r.docNumberEnc, "MEDICAL/เลข");
    eq(new Date(String(r.retainUntil)).toISOString(), instAfter(addDays(E, 500)).toISOString(), "retainUntil ถัดไป");
  });
  await st("RT-3", "ชั้นเลขเอกสาร (manifest 500): docNumberEnc ⇒ null · docLast4 คงอยู่", async () => {
    ok(RTP, "RT-2 ไม่ผ่าน"); V(await purge(instAfter(addDays(E, 500))), "purge");
    const r = await pax(RTP.b.pax[0]); eq([r.docNumberEnc, r.docLast4], [null, MK.doc.slice(-4)], "ผล");
  });
  await st("RT-4", "ชั้นเอกสารรับทราบความเสี่ยง (1,095): waiverEvidence ⇒ {v, purged, templateHash, textHash, signedAt, method} ไม่มีชื่อ/ข้อความ · ไฟล์ WAIVER ลบ · waiverSignedAt คง", async () => {
    ok(RTP, "RT-2 ไม่ผ่าน"); V(await purge(instAfter(addDays(E, 1095))), "purge");
    const r = await pax(RTP.b.pax[0]);
    eq(r.waiverEvidence, { v: 1, purged: true, templateHash: W1hash, textHash: sha256hex("ข้อความ"), signedAt: NOW0, method: "LINK" }, "หลักฐาน");
    ok((await docRow(RTP.wv.id))?.deletedAt && r.waiverSignedAt, "ไฟล์/เวลา");
  });
  await st("RT-5", "ชั้นบันทึกความยินยอม (1,100): guardianConsent ⇒ null · ไม่เหลืออะไรรอ (retainUntil null) · ไม่มีตัวบ่งชี้ในแถว", async () => {
    ok(RTP, "RT-2 ไม่ผ่าน"); V(await purge(instAfter(addDays(E, 1100))), "purge");
    const r = await pax(RTP.b.pax[0]);
    eq([r.guardianConsent, r.retainUntil], [null, null], "ผล");
    eq(leaks(JSON.stringify({ ...r, fullName: "" })), [], "ตัวบ่งชี้");
  });
  await st("RT-6", "ไม่ลบ (T61 = null ในหน่วย uA2): ไฟล์ PASSPORT ไม่ถูกลบแม้ปี 2040", async () => {
    needDb(); const b = await mkBooking("PC", ["ไม่ลบ"], { endsAt: endsRT }); const d = await plantDoc(b, "PASSPORT", null, tA, uA2);
    V(await purge(new Date("2040-01-01T00:00:00Z")), "purge"); ok(!(await docRow(d.id))?.deletedAt && STORE.has(d.path), "ถูกลบ");
  });
  await st("RT-7", "ขยายอายุหลังอัปโหลด (30 ⇒ 60): ถึงวันเดิม ไม่ลบ + retainUntil เลื่อนเป็นวันใหม่ · ถึงวันใหม่ ลบ", async () => {
    needDb(); const b = await mkBooking("PD", ["ขยาย"], { endsAt: endsRT }); const d = await plantDoc(b, "PASSPORT", 30);
    await setV(tA, [{ key: "trips.pdpa.retention", scope: "UNIT", scopeId: uA, value: { ...RET_A, passportImageDays: 60 } }]);
    try {
      V(await purge(instAfter(addDays(E, 30))), "วันเดิม");
      const r = await docRow(d.id); ok(!r?.deletedAt, "ลบตามค่าเก่า");
      eq(new Date(String(r?.retainUntil)).toISOString(), instAfter(addDays(E, 60)).toISOString(), "retainUntil ใหม่");
      V(await purge(instAfter(addDays(E, 60))), "วันใหม่"); ok((await docRow(d.id))?.deletedAt, "ไม่ลบที่วันใหม่");
    } finally { await setV(tA, [{ key: "trips.pdpa.retention", scope: "UNIT", scopeId: uA, value: RET_A }]); }
  });
  await st("RT-8", "เป็นชุดจำกัด: ไฟล์ครบกำหนด 5 ใบ limitPerUnit 2 ⇒ 2 · more true · 2 · 1 · 0", async () => {
    needDb(); const b = await mkBooking("PD", ["ชุด"], { endsAt: endsRT });
    const at = instAfter(addDays(E, 30)); V(await purge(at), "ล้างค้าง");
    for (let i = 0; i < 5; i++) await plantDoc(b, "CERT", 30);
    const n: unknown[] = [];
    for (let i = 0; i < 4; i++) { const v = V(await purge(at, { limitPerUnit: 2 }), `รอบ ${i}`); n.push([v.documents, v.more]); }
    eq(n, [[2, true], [2, true], [1, false], [0, false]], "ผล");
  });
  await st("RT-9", "ลบซ้ำได้: รอบสองบนข้อมูลเดิม = 0 · ไม่มี event ใหม่", async () => {
    needDb(); const at = instAfter(addDays(E, 1100));
    V(await purge(at), "1"); const n = (await outbox("trips.document.purged")).length;
    const v = V(await purge(at), "2"); eq([v.documents, v.passengerStages, v.bookers, (await outbox("trips.document.purged")).length], [0, 0, 0, n], "ผล");
  });
  await st("RT-10", "ที่เก็บลบไม่สำเร็จ (503) ⇒ ไม่ตั้ง deletedAt + failed STORAGE_DELETE_FAILED · รอบหน้าสำเร็จ", async () => {
    needDb(); const b = await mkBooking("PD", ["ล้ม"], { endsAt: endsRT }); const d = await plantDoc(b, "PASSPORT", 30);
    storageFail = true; let v: Rec;
    try { v = V(await purge(instAfter(addDays(E, 30))), "ล้ม"); } finally { storageFail = false; }
    ok(!(await docRow(d.id))?.deletedAt && asArr(v.failed).some((f) => f.code === "STORAGE_DELETE_FAILED"), `ผล ${fmt(v)}`);
    V(await purge(instAfter(addDays(E, 30))), "รอบหน้า"); ok((await docRow(d.id))?.deletedAt, "รอบหน้าไม่ลบ");
  });
  await st("RT-11", "event trips.document.purged payload = {bookingId, kind, passengerId} ตรงชุด · audit purged ไม่มีตัวบ่งชี้", async () => {
    const ev = await outbox("trips.document.purged"); ok(ev.length > 0, "ไม่มี event");
    const bad = ev.filter((e) => !isDeepStrictEqual(Object.keys(e.payload).sort(), ["bookingId", "kind", "passengerId"]));
    ok(bad.length === 0, `payload ${fmt(bad[0]?.payload)}`);
    eq(leaks(JSON.stringify(await audits("trips.document.purged")) + JSON.stringify(await audits("trips.passenger.purged"))), [], "audit");
  });
  let RB: { booking: string; party: string; pax: string; doc: string } | null = null;
  const plantExpired = async (o: { paid?: number; money?: boolean; status?: string } = {}) => {
    const p = PRD.PD; const dep = await mkDep("PD", "2027-03-12");
    const party = await insertRow("Party", { id: rid("pty"), tenantId: tA, name: MK.party, phone: "0899999999", email: `${MK.party.toLowerCase()}@x.invalid`, updatedAt: new Date() });
    const booking = await insertRow("TripBooking", { id: rid("bk"), tenantId: tA, unitId: p.unit, code: `TR-7003-${hex(3)}`, publicTokenHash: sha256hex(rid("t")), status: o.status ?? "EXPIRED", productId: p.id, departureId: dep, travelDate: "2027-03-12", channel: "WEB", collectMode: "SHOP", payMethod: "PAY_NOW",
      bookerPartyId: party, marketingEligible: true, contactRoute: "DIRECT", currency: "THB", grossSatang: 350_000, discountSatang: 0, agentDiscountSatang: 0, passThroughSatang: 0, vatSatang: 0, commissionSatang: 0, commissionVatSatang: 0, whtSatang: 0, netToShopSatang: 350_000, paidSatang: o.paid ?? 0, refundedSatang: 0, accountingState: "NONE", policySnapshot: "{}", version: 2, updatedAt: new Date("2027-03-02T05:00:00Z") });
    await insertRow("TripHold", { id: rid("h"), tenantId: tA, unitId: p.unit, departureId: dep, bookingId: booking, channel: "WEB", qtyPublic: 1, qtyAllot: 0, unitIds: [], purpose: "PAYMENT", capKeyHash: "x", requestHash: "x", idempotencyKey: rid("hk"), status: "EXPIRED", expiresAt: new Date("2027-03-02T05:00:00Z"), updatedAt: new Date() });
    if (o.money) await insertRow("TripMoneyEvent", { id: rid("me"), tenantId: tA, unitId: p.unit, bookingId: booking, kind: "RECEIVED", amountSatang: 100, vatSatang: 0, passThroughSatang: 0, tender: "CASH", postingStatus: "POSTED", postingAttempts: 0, idempotencyKey: rid("mk") });
    const pid = await insertRow("TripPassenger", { id: rid("tp"), tenantId: tA, unitId: p.unit, bookingId: booking, fullName: MK.name, phone: "+66899999999", docLast4: "1234", docNumberEnc: "x", answers: JSON.stringify({ v: 1, rev: 0, fields: { pickupHotel: MK.name } }), formStatus: "PENDING", updatedAt: new Date() });
    const bk: Bk = { bookingId: booking, pax: [pid], dep, key: "PD" };
    const d = await plantDoc(bk, "PASSPORT", 3000);
    return { booking, party, pax: pid, doc: d.id };
  };
  await st("RT-12", "ผู้จองของการจอง EXPIRED ไม่มีเงิน (X22 = 30 จากหมดเวลา 2 มี.ค. ไทย): ไม่ลบที่ 2027-04-01T16:59:59Z · ลบที่ 17:00Z ⇒ bookerPartyId null · piiPurgedAt · version+1 · ผู้เดินทางลบทั้งคน · ไฟล์ลบ · event BOOKER (passengerId null)", async () => {
    needDb(); RB = await plantExpired();
    V(await purge(new Date("2027-04-01T16:59:59Z")), "ก่อน");
    eq((await q<{ b: string | null }>(`SELECT "bookerPartyId" AS b FROM "TripBooking" WHERE id = $1`, [RB.booking]))[0]?.b, RB.party, "ก่อนเวลา");
    V(await purge(new Date("2027-04-01T17:00:00Z")), "ถึง");
    const bk = (await q<Rec>(`SELECT "bookerPartyId", "piiPurgedAt", version FROM "TripBooking" WHERE id = $1`, [RB.booking]))[0] ?? {};
    eq([bk.bookerPartyId, !!bk.piiPurgedAt, bk.version], [null, true, 3], "การจอง");
    const r = await pax(RB.pax); eq([r.fullName, r.phone, r.docLast4, r.docNumberEnc], ["", null, null, null], "ผู้เดินทาง");
    eq(leaks(JSON.stringify(r)), [], "ตัวบ่งชี้");
    ok((await docRow(RB.doc))?.deletedAt, "ไฟล์");
    ok((await outbox("trips.document.purged")).some((e) => e.payload.bookingId === RB!.booking && e.payload.kind === "BOOKER" && e.payload.passengerId === null), "event BOOKER");
  });
  await st("RT-13", "ไม่ลบผู้จอง: EXPIRED ที่ paidSatang > 0 · EXPIRED ที่มีแถว TripMoneyEvent · CANCELLED", async () => {
    needDb(); const a = await plantExpired({ paid: 100 }), b = await plantExpired({ money: true }), c = await plantExpired({ status: "CANCELLED" });
    V(await purge(new Date("2027-06-01T00:00:00Z")), "purge");
    const rows = await q<{ id: string; b: string | null; p: Date | null }>(`SELECT id, "bookerPartyId" AS b, "piiPurgedAt" AS p FROM "TripBooking" WHERE id = ANY($1::text[])`, [[a.booking, b.booking, c.booking]]);
    ok(rows.length === 3 && rows.every((x) => x.b && !x.p), `ถูกลบ ${fmt(rows)}`);
  });
  await st("RT-14", "ต่อร้าน: tenantIds = [A] ไม่แตะไฟล์ครบกำหนดของร้าน B · purgeTripPersonalDataForUnit ของ uA ไม่แตะ uA2", async () => {
    needDb(); const b = await mkBooking("PB", ["ร้านบี"], { endsAt: endsRT }); const d = await plantDoc(b, "PASSPORT", 30, tB, uB);
    V(await purge(new Date("2030-01-01T00:00:00Z")), "A"); ok(!(await docRow(d.id))?.deletedAt, "ลบของร้าน B");
    const c = await mkBooking("PC", ["หน่วยสอง"], { endsAt: endsRT }); const d2 = await plantDoc(c, "CERT", 30, tA, uA2);
    await (fn("purgeTripPersonalDataForUnit") as AnyFn)({ tenantId: tA, unitId: uA, now: new Date("2030-01-01T00:00:00Z"), storage: { del: fakeDel } });
    ok(!(await docRow(d2.id))?.deletedAt, "ลบของหน่วยอื่น");
  });
  groupLine("RT");

  // ═══════════════ LE. สแกนการรั่ว ═══════════════
  console.log("\n── LE: สแกนการรั่ว (ตัวบ่งชี้ที่ปลูก · token) ──");
  await st("LE-1", "OutboxEvent ของร้านทดสอบ: ไม่มีชื่อ/เลขเอกสาร/สุขภาพ/token", async () => {
    const rows = await q<{ type: string }>(`SELECT type, payload FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]);
    ok(rows.some((r) => EVENTS.includes(r.type)), "ยังไม่มี event ของใบให้ตรวจ");
    eq(leaks(JSON.stringify(rows)), [], "รั่ว");
  });
  await st("LE-2", "AuditLog ของร้านทดสอบ: ไม่มีตัวบ่งชี้/token (แฮช token อยู่ได้เฉพาะ link_issued)", async () => {
    const rows = await q<{ action: string; before: unknown; after: unknown }>(`SELECT action, before, after FROM "AuditLog" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]);
    eq(leaks(JSON.stringify(rows)), [], "รั่ว");
    const hashes = new Set(TOKENS.map(sha256hex));
    ok(rows.filter((r) => r.action !== "trips.passenger.link_issued").every((r) => ![...hashes].some((h) => JSON.stringify(r.after ?? "").includes(h))), "แฮช token นอก link_issued");
    ok(rows.some((r) => r.action.startsWith("trips.passenger.") || r.action.startsWith("trips.waiver.")), "ไม่มีแถว audit ของใบ (ยังไม่สร้าง)");
  });
  await st("LE-3", "OpsEvent ตั้งแต่เริ่มรัน: ไม่มีตัวบ่งชี้/token", async () => {
    eq(leaks(JSON.stringify(await q(`SELECT message, detail FROM "OpsEvent" WHERE "createdAt" >= $1`, [T0]))), [], "รั่ว");
  });
  await st("LE-4", "ผลปฏิเสธทุกตัวที่บริการคืนตลอดการรัน: ไม่มีตัวบ่งชี้/token ใน messageTh/details", () => {
    ok(ERRS.length > 0, "ไม่มีผลปฏิเสธให้ตรวจ");
    eq(leaks(JSON.stringify(ERRS.filter((e) => e.ok === false))), [], "รั่ว");
    ok(ERRS.some((e) => e.ok === false && e.code !== undefined && !String(e.messageTh ?? "").includes("ยังไม่มี")), "ยังไม่มีผลจากบริการจริง");
  });
  await st("LE-5", "path ไฟล์/cdnUrl/คีย์ในที่เก็บ: ไม่มีชื่อไฟล์ลูกค้า/ตัวบ่งชี้ · ทุกไฟล์ของใบอยู่ใต้ private/", async () => {
    const fa = await q<{ path: string; cdnUrl: string }>(`SELECT path, "cdnUrl" FROM "FileAsset" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]);
    ok(fa.length > 0, "ไม่มีไฟล์");
    ok(fa.every((f) => /\/private\//.test(f.path) && f.cdnUrl.startsWith("private://")), "มีไฟล์สาธารณะ");
    eq([...leaks(JSON.stringify(fa)), ...leaks([...STORE.keys()].join(" "))].concat(JSON.stringify(fa).includes(MK.file) ? ["file"] : []), [], "รั่ว");
  });
  await st("LE-6", "แถวผู้เดินทาง: answers ดิบไม่มีข้อความสุขภาพ · docNumberEnc ไม่มีเลขดิบ · waiverEvidence ไม่มี token", async () => {
    const rows = await q<{ answers: unknown; docNumberEnc: string | null; waiverEvidence: unknown }>(`SELECT answers, "docNumberEnc", "waiverEvidence" FROM "TripPassenger" WHERE "tenantId" = ANY($1::text[])`, [tenantIds]);
    const s = JSON.stringify(rows);
    ok(rows.some((r) => asRec(r.answers)?.v === 1), "ยังไม่มีแถวรูป v1");
    eq([s.includes(MK.allergy), s.includes(MK.cond), rows.some((r) => (r.docNumberEnc ?? "").includes(MK.doc)), TOKENS.some((t) => s.includes(t))], [false, false, false, false], "รั่ว");
  });
  groupLine("LE");

  // ═══════════════ EV ═══════════════
  console.log("\n── EV: event ──");
  await st("EV-1", "trips.passenger.form_completed: payload ตรงชุด {bookingId, kind, passengerId} ทุกแถว · คีย์ trips.passenger.form_completed:<passengerId>:<rev>", async () => {
    const ev = await outbox("trips.passenger.form_completed"); ok(ev.length > 0, "ไม่มี event");
    ok(ev.every((e) => isDeepStrictEqual(Object.keys(e.payload).sort(), ["bookingId", "kind", "passengerId"]) && e.payload.kind === "FORM" && new RegExp(`^trips\\.passenger\\.form_completed:${e.payload.passengerId}:\\d+$`).test(e.idempotencyKey)), `แถว ${fmt(ev.find((e) => e.payload.kind !== "FORM"))}`);
  });
  groupLine("EV");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  console.error(`💥 ${LABEL}: ${errMsg(e)}`);
  exitCode = 2;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupMisc(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await pool.end().catch(() => undefined);
}
const passed = cks.filter((c) => c.res === "PASS").length;
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p, t] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p + (c.res === "PASS" ? 1 : 0)}/${t + 1}`; }
console.log(`\n${LABEL}: ผ่าน ${passed}/${cks.length} · ล้ม ${failed.length} · ข้าม ${skipped.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
