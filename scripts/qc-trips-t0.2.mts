// QC — TRIPS T0.2 · สินค้า · ตัวเลือก · ประเภทคน (ช่วงอายุ) · รายการเสริม (ธง 3 ตัว) · เนื้อหาไทย/อังกฤษ (+ "ยังไม่แปล")
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.2.md · ledger/TRIPS-CORE-CONTRACT.md §A.2 §B.1 §E §F §L-27 · ledger/trips-briefs/T0.1.md §4 §7 §8 · ledger/TRIPS-DEFAULTS.md T2 T3 T27 T44
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน)   S  ไฟล์/facade/"use server"/ไม่มี any/ไม่มีเลขตายตัว/สิทธิ์/event 3 ทะเบียน/ไม่แตะไฟล์ต้องห้าม
//   C  ฟังก์ชันบริสุทธิ์ (ช่วงอายุ · หาประเภทคนจากอายุ · ภาษาสำรอง · ชี้ชวน 9 ข้อ)
//   P  CRUD ผ่าน facade   I  ค่าคงที่ (invariant) + กรณีลบ   D  ค่าเริ่มจากค่าตั้ง (+ ตัวควบคุมบวก: เปลี่ยนค่าตั้ง ⇒ สินค้าใหม่เปลี่ยน · เดิมไม่เปลี่ยน)
//   L  ภาษา (อังกฤษไม่มี ⇒ ไทย + ธง)   PM สิทธิ์   X1 แยกร้าน/แยกหน่วย   X3 พร้อมกัน   X9 การกระทำอันตราย (เก็บสินค้าที่ถูกอ้างถึง)
//   EV event (payload ไม่มีข้อมูลส่วนบุคคล)   R  seed: หน่วย TRIPS + สินค้า 4 ตัวของจอ 16 (ราชา = ตัวเลขฟิกซ์เจอร์เฉพาะส่วนของ T0.2)
//
// 🔴 ทุกแถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t02-*` (ผู้ใช้ `trips-t02-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ไม่แตะร้าน seed (R อ่านอย่างเดียว)
// 🔴 ยังไม่มีตาราง/โมดูล = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception (import แบบกัน · needTable)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.2.mts
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมี T0.2 (และก่อน T0.1 ลงทรีนี้): PC เขียว · S-10 เขียวได้ (ยังไม่แตะไฟล์ต้องห้าม) · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t0.2";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ harness ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 240); } catch { return String(v); } };
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
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
type AnyFn = (...a: unknown[]) => unknown;
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t02qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG = "trips-t02-";
const EMAIL_PREFIX = "trips-t02-";
const PSLUG = (tag: string) => `t02qc-${tag}-${STAMP}`; // slug สินค้าชั่วคราว — ขึ้นต้น t02qc- ไม่ชนกับ seed
const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const now = () => new Date();

// ═══════════════ สเปก (ใบสั่ง T0.2 §2–§3) ═══════════════
const FACADE_FNS = [
  "createProduct", "updateProduct", "setProductContent", "publishProduct", "unpublishProduct", "archiveProduct", "restoreProduct",
  "listProducts", "getProduct", "getProductBySlug",
  "createOption", "updateOption", "setOptionActive", "reorderOptions",
  "createPaxType", "updatePaxType", "setPaxTypeActive",
  "createExtra", "updateExtra", "setExtraActive",
  "effectivePaxBand", "paxTypeForAge", "localize", "prospectusChecklist",
];
const NO_DELETE_FNS = ["deleteProduct", "deleteOption", "deletePaxType", "deleteExtra"]; // มติผู้คุม §11 ข้อ 8: ไม่มีการลบแถว
const FACADE_CONSTS = ["CONTENT_SECTIONS", "PROSPECTUS_ITEMS", "TRIP_PRODUCT_ERROR_CODES"];
const CONTENT_SECTIONS = ["title", "summary", "itinerary", "includes", "meeting"];
const PROSPECTUS_ITEMS = ["OPERATOR_LICENSE", "DURATION", "PRICE_PAYMENT", "VEHICLE", "ITINERARY", "ACCOMMODATION_MEALS", "GUIDE", "MIN_PAX", "INSURANCE"];
const ERROR_CODES = ["INVALID_INPUT", "NOT_FOUND", "FORBIDDEN", "UNIT_NOT_TRIPS", "SLUG_TAKEN", "CURRENCY_NOT_ALLOWED", "CURRENCY_MISMATCH", "SOURCE_NOT_SUPPORTED",
  "PUBLISH_INCOMPLETE", "BAD_STATE", "CONFIRM_REQUIRED", "AGE_RANGE", "AGE_OVERLAP", "PAX_CODE_TAKEN", "UNKNOWN_PAX_TYPE", "LAST_ACTIVE_OPTION", "LAST_SEAT_PAX_TYPE",
  "PASS_THROUGH_FLAGS", "TAX_KIND_MISMATCH", "LOCALE_DISABLED", "BUSY"];
const PERM_KEYS = ["trips.product.view", "trips.product.edit", "trips.product.publish"];
const EVENTS = ["trips.product.published", "trips.product.unpublished", "trips.product.archived"];
const EVENT_PAYLOAD_KEYS = ["productId", "unitId", "productType", "status"];
const OWN_FILES = ["src/lib/modules/trips/products.ts", "src/lib/modules/trips/products-core.ts", "src/lib/modules/trips/product-actions.ts"];
const T27 = "trips.pax.childAgeBand", T44 = "trips.line.defaults", T3 = "trips.general.currencies", T2 = "trips.general.customerLocales";
// seed (ใบสั่ง §7)
const DIVE_TRIPS_UNIT = { id: "tripsqc-unit-dive-trips", slug: "andaman-dive-trips" };
const SEED_SLUGS = { racha: "racha-yai-day-trip", phiphi: "phiphi-khai-speedboat", deep3: "racha-noi-3-dives", similan: "similan-4-nights" } as const;

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t} (migration ของ T0.1 ยังไม่ลงฐานนี้)`); };
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]); if (l.length) return l; }
  return [];
};
/** INSERT ค่าขั้นต่ำ — NOT NULL ไม่มี default เติมให้ (แบบ qc-trips-t0.1) */
async function insertRow(table: string, vals: Rec): Promise<void> {
  await needTable(table);
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (t === "text" || t.startsWith("character")) { const l = await checkLits(table, c.column_name); v[c.column_name] = l[0] ?? `qc${randomBytes(3).toString("hex")}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? new Date() : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}

// ═══════════════ ร้านชั่วคราว ═══════════════
async function tablesWithTenant(): Promise<string[]> {
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  return rows.map((r) => r.t).filter((t) => t !== "Tenant");
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
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
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type Ctx = { tenantId: string; actorUserId: string };

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  // ── โมดูล (นำเข้าครั้งเดียว · ไม่มี = ข้อที่ใช้แดงพร้อมเหตุผล) ──
  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const PERMS = (await tryImport("@/lib/core/permissions")).mod;
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name}`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => asRec(await fn(name)(...a)) ?? {};
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const okR = (r: Rec, what: string) => ok(r.ok === true, `${what}: ${fmt(r)}`);
  const codeR = (r: Rec, code: string, what: string) => ok(r.ok === false && r.code === code, `${what}: ต้อง ${code} ได้ ${fmt(r)}`);

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed P0.1 (andaman-dive) อยู่", async () => {
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = 'andaman-dive'`);
    eq(r[0]?.n, 1, "ร้าน andaman-dive");
  });
  await st("PC-2", "ฟิกซ์เจอร์ยังคำนวณถูก (assertFixtureArithmetic) · ราชา ผู้ใหญ่ 3,500 · เด็ก 4–11 · กล้อง 500", () => {
    const r = FX.assertFixtureArithmetic();
    ok(r.checks > 20, `checks=${r.checks}`);
    eq([FX.PRODUCT_RACHA.adultSatang, FX.PRODUCT_RACHA.childAge, FX.PRODUCT_RACHA.extras.camera.satang], [350_000, { min: 4, max: 11 }, 50_000], "ราชา");
  });
  await st("PC-3", "ทะเบียนค่าตั้งเดิมโหลดได้ (resolveSetting · setSettings มีอยู่)", () => {
    S("resolveSetting"); S("setSettings");
  });

  // ═══════════════ S. ไฟล์ · facade · กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const srcOf = (p: string) => stripComments(read(p));
  await st("S-1", "ไฟล์เจ้าของมีครบ: trips/products.ts · products-core.ts · product-actions.ts", () => {
    const miss = OWN_FILES.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
  await st("S-2", `facade trips ส่งออก ${FACADE_FNS.length} ฟังก์ชัน + ${FACADE_CONSTS.length} ค่าคงที่ · บล็อก "// TRIPS T0.2 ▸" · ไม่มี export *`, () => {
    const t = needTrips();
    const miss = [...FACADE_FNS.filter((n) => typeof t[n] !== "function"), ...FACADE_CONSTS.filter((n) => t[n] === undefined)];
    ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 8).join(", ")}`);
    const idx = read("src/lib/modules/trips/index.ts");
    ok(/\/\/\s*TRIPS T0\.2 ▸/.test(idx), "ไม่มีบล็อก // TRIPS T0.2 ▸ … ◂ ใน index.ts");
    ok(!/export\s*\*\s*from/.test(stripComments(idx)), "มี export * ใน facade");
    eq(t.CONTENT_SECTIONS, CONTENT_SECTIONS, "CONTENT_SECTIONS");
    eq(t.PROSPECTUS_ITEMS, PROSPECTUS_ITEMS, "PROSPECTUS_ITEMS");
    const codes = Array.isArray(t.TRIP_PRODUCT_ERROR_CODES) ? (t.TRIP_PRODUCT_ERROR_CODES as string[]) : [];
    const missC = ERROR_CODES.filter((c) => !codes.includes(c));
    ok(missC.length === 0, `TRIP_PRODUCT_ERROR_CODES ขาด: ${missC.join(", ")}`);
    ok(!codes.includes("REFERENCED"), "ยังมีรหัส REFERENCED (ไม่มีการลบ · มติ §11 ข้อ 8)");
  });
  await st("S-11", "ไม่มีการลบแถว (มติ §11 ข้อ 8): facade/action ไม่ส่งออก delete* · ไฟล์ของใบไม่มี .delete( / .deleteMany( / DELETE FROM", () => {
    const t = needTrips();
    const exp = NO_DELETE_FNS.filter((n) => n in t);
    ok(exp.length === 0, `facade ส่งออก: ${exp.join(", ")}`);
    const bad: string[] = [];
    for (const f of OWN_FILES) {
      const src = srcOf(f);
      if (!src) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/\.(delete|deleteMany)\s*\(|DELETE\s+FROM/i.test(src)) bad.push(f);
      if (/export\s+async\s+function\s+delete/.test(src)) bad.push(`${f}: export delete*`);
    }
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-3", "product-actions.ts: บรรทัดแรก \"use server\" · ส่งออกเฉพาะ export async function · ทุกตัวมี assertCan", () => {
    const raw = read("src/lib/modules/trips/product-actions.ts");
    ok(raw, "ยังไม่มีไฟล์");
    ok(/^\s*["']use server["'];?/.test(stripComments(raw).trimStart()), "ไม่ขึ้นต้น \"use server\"");
    const s = stripComments(raw);
    const exps = [...s.matchAll(/^export\s+(?!async\s+function\b)(\S+)/gm)].map((m) => m[1]);
    ok(exps.length === 0, `export ที่ไม่ใช่ async function: ${exps.join(", ")}`);
    const n = [...s.matchAll(/^export\s+async\s+function\b/gm)].length;
    ok(n >= 10, `action น้อยเกินไป (${n})`);
    ok(/assertCan\(/.test(s) && /requireUnit\(/.test(s), "ไม่มี requireUnit/assertCan (fitness F6)");
  });
  await st("S-4", "ไม่มี any (ชนิด/แคสต์) ในไฟล์ของใบ", () => {
    const bad: string[] = [];
    for (const f of OWN_FILES) { const s = srcOf(f); if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; } if (/(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(s)) bad.push(f); }
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-5", "ไม่มี prisma ดิบ (F5 +0) · import ได้แค่ @/lib/core/* zod @prisma/client ./ · products-core.ts บริสุทธิ์ (import type เท่านั้น)", () => {
    const bad: string[] = [];
    for (const f of OWN_FILES) {
      const s = srcOf(f);
      if (!s) { bad.push(`${f}(ไม่มีไฟล์)`); continue; }
      if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s)) bad.push(`${f}: prisma ดิบ`);
      for (const m of s.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g)) {
        const sp = m[1];
        if (!(sp.startsWith("@/lib/core/") || sp === "zod" || sp === "@prisma/client" || sp.startsWith("./") || sp === "next/cache")) bad.push(`${f}→${sp}`);
      }
    }
    const core = srcOf("src/lib/modules/trips/products-core.ts");
    for (const m of core.matchAll(/^import\s+(?!type\b)[^;]*from\s*["']([^"']+)["']/gm)) bad.push(`products-core ไม่บริสุทธิ์: ${m[1]}`);
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-6", "ไม่มีเลขธุรกิจตายตัว (อายุ/ราคา/คอมฯ) ใน trips สำหรับสินค้า — ค่ามาจากค่าตั้ง T27/T44", () => {
    const bad: string[] = [];
    for (const f of OWN_FILES) {
      const s = srcOf(f).replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
      if (!s) continue;
      for (const m of s.matchAll(/\b(ageMin|ageMax|childFrom|childTo|infantBelow|commissionPct|priceMinor|amountMinor)\s*[:=]\s*[1-9]\d*/g)) bad.push(`${f}: ${m[0]}`);
      for (const m of s.matchAll(/\b(350_?000|245_?000|190_?000|60_?000|50_?000|30_?000|3_?500|2_?450|7_?000)\b/g)) bad.push(`${f}: ${m[0]}`);
    }
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-7", "zod v4 strict ในไฟล์บริการ (z.strictObject หรือ .strict())", () => {
    const s = srcOf("src/lib/modules/trips/products.ts");
    ok(s, "ยังไม่มีไฟล์");
    ok(/from\s*["']zod["']/.test(s) && /(z\.strictObject\(|\.strict\(\))/.test(s), "ไม่มี zod strict");
  });
  await st("S-8", "สิทธิ์ 3 คีย์ใน MODULE_DEFS โมดูล trips (ป้ายไทย)", () => {
    ok(PERMS, "โหลด permissions ไม่ได้");
    const isKey = PERMS?.isPermissionKey as ((k: string) => boolean) | undefined;
    const label = PERMS?.permissionLabel as ((k: string) => string) | undefined;
    ok(typeof isKey === "function" && typeof label === "function", "ไม่มี isPermissionKey/permissionLabel");
    const miss = PERM_KEYS.filter((k) => !isKey?.(k) || !THAI.test(String(label?.(k) ?? "")));
    ok(miss.length === 0, `ยังไม่ลงทะเบียน/ไม่มีป้ายไทย: ${miss.join(", ")}`);
    eq(PERM_KEYS.map((k) => (PERMS?.moduleOfPermissionKey as (k: string) => string)?.(k)), ["trips", "trips", "trips"], "โมดูล");
  });
  await st("S-9", "event 3 ตัวลง 3 ทะเบียน (consumer · automation labels · webhook events) ป้ายไทย", async () => {
    const cons = stripComments(read("src/lib/outbox-consumers.ts"));
    const auto = (await tryImport("@/lib/automation/labels")).mod;
    const hook = (await tryImport("@/lib/webhooks/labels")).mod;
    const ae = asArr(auto?.AUTOMATION_EVENTS), we = asArr(hook?.WEBHOOK_EVENTS);
    const bad: string[] = [];
    for (const e of EVENTS) {
      if (!new RegExp(`["']${e.replace(/\./g, "\\.")}["']\\s*:`).test(cons)) bad.push(`${e}(consumer)`);
      const a = ae.find((x) => x.value === e);
      if (!a || !THAI.test(String(a.label))) bad.push(`${e}(automation)`);
      if (!we.some((x) => x.value === e)) bad.push(`${e}(webhook)`);
    }
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-10", "ไม่แตะไฟล์ต้องห้ามเทียบ session/trips: prisma/ · core/settings/ · โมดูลเดิม (pos rooms hotel dorm booking ticket) · ข้อสอบ t0.1/t0.2", () => {
    const base = git(["merge-base", "HEAD", "session/trips"]).trim();
    ok(base, "หา merge-base กับ session/trips ไม่ได้");
    const paths = ["prisma", "src/lib/core/settings", "src/lib/modules/pos", "src/lib/modules/rooms", "src/lib/modules/hotel", "src/lib/modules/dorm", "src/lib/modules/booking", "src/lib/modules/ticket", "scripts/qc-trips-t0.1.mts", "scripts/qc-trips-p0.1.mts"];
    const changed = [...new Set([
      ...git(["diff", "--name-only", base, "--", ...paths]).split("\n"),
      ...git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n"),
    ].filter(Boolean))];
    // ข้อสอบนี้เอง: เทียบกับฉบับใน session/trips (ถ้ามีแล้ว)
    const inBase = git(["ls-tree", "--name-only", "session/trips", "scripts/qc-trips-t0.2.mts"]).trim() !== "";
    if (inBase && git(["show", "session/trips:scripts/qc-trips-t0.2.mts"]) !== read("scripts/qc-trips-t0.2.mts")) changed.push("scripts/qc-trips-t0.2.mts");
    ok(changed.length === 0, `แตะ: ${changed.slice(0, 6).join(", ")}`);
  });

  // ═══════════════ C. ฟังก์ชันบริสุทธิ์ ═══════════════
  console.log("\n── C: ฟังก์ชันบริสุทธิ์ ──");
  const BAND = { infantBelow: 4, childFrom: 4, childTo: 11 };
  await st("C-1", "effectivePaxBand: คอลัมน์ชนะ · ว่างทั้งคู่ = ค่าตั้งตามรหัส ADULT/CHILD/INFANT · รหัสอื่นว่าง = ไม่มีช่วง (NONE)", () => {
    const b = (pt: Rec) => asRec(fn("effectivePaxBand")(pt, BAND)) ?? {};
    eq([b({ code: "CHILD", ageMin: null, ageMax: null }), b({ code: "ADULT", ageMin: null, ageMax: null }), b({ code: "INFANT", ageMin: null, ageMax: null })],
      [{ from: 4, to: 11, source: "SETTING" }, { from: 12, to: null, source: "SETTING" }, { from: 0, to: 3, source: "SETTING" }], "จากค่าตั้ง");
    eq([b({ code: "CHILD", ageMin: 2, ageMax: 9 }), b({ code: "SENIOR", ageMin: 60, ageMax: null }), b({ code: "DIVER", ageMin: null, ageMax: null })],
      [{ from: 2, to: 9, source: "PAX_TYPE" }, { from: 60, to: null, source: "PAX_TYPE" }, { from: 0, to: null, source: "NONE" }], "จากคอลัมน์/ไม่มีช่วง");
  });
  await st("C-2", "paxTypeForAge: อายุ 30→ADULT · 8→CHILD · 11→CHILD · 12→ADULT · 2→INFANT · ข้ามที่ปิดใช้ · ไม่ตรง = null", () => {
    const pts = [
      { id: "a", code: "ADULT", active: true, band: { from: 12, to: null, source: "PAX_TYPE" } },
      { id: "c", code: "CHILD", active: true, band: { from: 4, to: 11, source: "SETTING" } },
      { id: "i", code: "INFANT", active: true, band: { from: 0, to: 3, source: "SETTING" } },
      { id: "x", code: "TEEN", active: false, band: { from: 12, to: 17, source: "PAX_TYPE" } },
      { id: "d", code: "DIVER", active: true, band: { from: 0, to: null, source: "NONE" } },
    ];
    const f = (age: number) => { const r = fn("paxTypeForAge")(pts, age); return asRec(r)?.code ?? r; };
    eq([f(30), f(8), f(11), f(12), f(2)], ["ADULT", "CHILD", "CHILD", "ADULT", "INFANT"], "ตามอายุ");
    eq(fn("paxTypeForAge")(pts.slice(1), 40) ?? null, null, "ไม่มีช่วงครอบ");
  });
  await st("C-3", "localize: อังกฤษไม่มี ⇒ ไทย + fallback true · มี ⇒ อังกฤษ · ขอไทย ⇒ fallback false เสมอ · ไม่มีทั้งคู่ ⇒ text null", () => {
    const L = (i: unknown, l: string) => asRec(fn("localize")(i, l));
    eq([L({ th: "ราชา", en: null }, "en"), L({ th: "ราชา", en: "  " }, "en"), L({ th: "ราชา", en: "Racha" }, "en"), L({ th: "ราชา", en: "Racha" }, "th"), L({}, "en")],
      [{ text: "ราชา", locale: "th", fallback: true }, { text: "ราชา", locale: "th", fallback: true }, { text: "Racha", locale: "en", fallback: false }, { text: "ราชา", locale: "th", fallback: false }, { text: null, locale: "en", fallback: false }], "localize");
  });
  await st("C-4", "prospectusChecklist: 9 ข้อเรียงตาม PROSPECTUS_ITEMS · ราชา 7/9 = 78% · ครบ 100 · ไม่บอก = ไม่ครบ", () => {
    const racha = Object.fromEntries(PROSPECTUS_ITEMS.map((k) => [k, !["OPERATOR_LICENSE", "INSURANCE"].includes(k)]));
    const r = asRec(fn("prospectusChecklist")(racha)) ?? {};
    eq([r.done, r.total, r.pct, asArr(r.items).map((x) => x.code)], [7, 9, 78, PROSPECTUS_ITEMS], "ราชา");
    const all = asRec(fn("prospectusChecklist")(Object.fromEntries(PROSPECTUS_ITEMS.map((k) => [k, true])))) ?? {};
    const none = asRec(fn("prospectusChecklist")({})) ?? {};
    eq([all.pct, none.done, none.pct, asRec(fn("prospectusChecklist")({ DURATION: true, PRICE_PAYMENT: true, VEHICLE: true, ITINERARY: true, ACCOMMODATION_MEALS: true, GUIDE: true }))?.pct], [100, 0, 0, 67], "ขอบ");
  });

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uBk = rid("uBk"), uB = rid("uB");
  let setupErr = "";
  const U: Record<string, Actor> = {};
  try {
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) {
      await insertRow("Tenant", { id, name: `ทดสอบ T0.2 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: now() });
      tenantIds.push(id);
    }
    const mkUnit = async (id: string, tenantId: string, type: string, tag: string) => {
      try { await insertRow("BusinessUnit", { id, tenantId, type, name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, updatedAt: now() }); }
      catch (e) { throw new Error(type === "TRIPS" ? `สร้างหน่วยชนิด TRIPS ไม่ได้ (enum ของ T0.1 ยังไม่ลง): ${errMsg(e).slice(0, 80)}` : errMsg(e)); }
    };
    await mkUnit(uBk, tA, "BOOKING", "abk");
    await mkUnit(uA, tA, "TRIPS", "a"); await mkUnit(uA2, tA, "TRIPS", "a2"); await mkUnit(uB, tB, "TRIPS", "b");
    const mkUser = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], perms: string[]): Promise<void> => {
      const id = rid(`u${tag}`);
      const permissions = Object.fromEntries(perms.map((p) => [p, true]));
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: now() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: now(), updatedAt: now() });
      U[tag] = { role, unitAccess, permissions, userId: id };
    };
    await mkUser("oa", tA, "OWNER", ["*"], []);
    await mkUser("ob", tB, "OWNER", ["*"], []);
    await mkUser("se", tA, "STAFF", [uA], ["trips.product.view", "trips.product.edit"]);
    await mkUser("sv", tA, "STAFF", [uA], ["trips.product.view"]);
    await mkUser("sn", tA, "STAFF", [uA], []);
    await mkUser("s2", tA, "STAFF", [uA2], PERM_KEYS);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const ctxOf = (tag: string): Ctx => {
    const a = U[tag];
    if (!a) throw new AssertFail(`ไม่มีร้าน/ผู้ใช้ชั่วคราว (${setupErr || "ยังไม่ตั้ง"})`);
    return { tenantId: tag === "ob" ? tB : tA, actorUserId: a.userId };
  };
  const OA = () => ctxOf("oa");
  const needDb = async () => { needTrips(); await needTable("TripProduct"); ctxOf("oa"); };

  const TH = (s: string) => ({ th: s });
  const THEN = (th: string, en: string) => ({ th, en });
  /** สินค้า + ตัวเลือก 1 (ค่าเริ่มประเภทคน ADULT/CHILD/INFANT จากค่าตั้ง) */
  const mkProduct = async (tag: string, extra: Rec = {}, unitId = uA, ctx: Ctx = OA()): Promise<{ id: string; optionId: string }> => {
    const r = await call("createProduct", ctx, { unitId, slug: PSLUG(tag), productType: "TOUR", title: THEN(`ทดสอบ ${tag}`, `Test ${tag}`), ...extra });
    okR(r, `createProduct ${tag}`);
    const o = await call("createOption", ctx, { unitId, productId: String(r.id), name: THEN("ร่วมกลุ่ม", "Join-in") });
    okR(o, `createOption ${tag}`);
    return { id: String(r.id), optionId: String(o.id) };
  };
  const getP = async (id: string, locale = "th", unitId = uA, ctx: Ctx = OA()) => {
    const r = await call("getProduct", ctx, { unitId, productId: id, locale });
    okR(r, "getProduct");
    return asRec(r.product) ?? {};
  };
  const paxOf = (p: Rec) => asArr(p.paxTypes);
  const byCode = (p: Rec, code: string) => paxOf(p).find((x) => x.code === code) ?? {};
  const dbStatus = async (id: string) => (await q<{ status: string }>(`SELECT status FROM "TripProduct" WHERE id = $1`, [id]))[0]?.status ?? null;
  const setV = async (changes: Rec[]) => {
    const r = asRec(await S("setSettings")(U.oa, { tenantId: tA }, changes, {})) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  const resolveV = async (key: string, refs: Rec) => asRec(await S("resolveSetting")({ tenantId: tA }, key, refs)) ?? {};
  const outbox = async (pid: string, type?: string) => q<{ type: string; payload: Rec; unitId: string | null }>(
    `SELECT type, payload, "unitId" FROM "OutboxEvent" WHERE "tenantId" = $1 AND payload->>'productId' = $2 ${type ? "AND type = $3" : ""} ORDER BY "createdAt"`, type ? [tA, pid, type] : [tA, pid]);
  const referenceByDeparture = (productId: string, optionId: string | null) => insertRow("TripDeparture", {
    tenantId: tA, unitId: uA, productId, optionId, localDate: ymd(new Date(Date.now() + 9 * DAY)), startsAt: new Date(Date.now() + 9 * DAY), endsAt: new Date(Date.now() + 9 * DAY + 8 * 3_600_000), status: "OPEN", capacity: 10, updatedAt: now(),
  });

  // ═══════════════ P. CRUD ═══════════════
  console.log("\n── P: CRUD ผ่าน facade ──");
  let P1 = "", P1opt = "";
  await st("P-1", "createProduct ⇒ DRAFT · TOUR · OWN · THB (จาก T3) · ประเภทคนเริ่มต้น ADULT/CHILD/INFANT · ไม่มีตัวเลือก", async () => {
    await needDb();
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("p1"), productType: "TOUR", title: THEN("เกาะทดสอบ", "Test Island") });
    okR(r, "createProduct");
    P1 = String(r.id);
    const p = await getP(P1);
    eq([p.status, p.productType, p.sourceKind, p.currency, p.slug, asArr(p.options).length, paxOf(p).map((x) => x.code).sort()], ["DRAFT", "TOUR", "OWN", "THB", PSLUG("p1"), 0, ["ADULT", "CHILD", "INFANT"]], "สินค้าใหม่");
    eq(p.title, { th: "เกาะทดสอบ", en: "Test Island" }, "title");
  });
  await st("P-2", "updateProduct: body/meetingPoint/disclosure/deepDive/crossBorder กลับมาตรงตัว", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const body = { summary: THEN("ดำน้ำตื้นชมปะการัง", "Snorkel the reef"), itinerary: TH("08:00 ออกจากท่า · 10:00 อ่าวสยาม"), includes: THEN("อาหารกลางวัน", "Lunch") };
    const meetingPoint = { text: THEN("ท่าเรืออ่าวฉลอง", "Chalong Pier"), lat: 7.8231, lng: 98.3415 };
    const disclosure = { accommodationMeals: TH("ไม่ค้างคืน · อาหารกลางวัน 1 มื้อ"), guides: TH("ไกด์ 2 คนต่อรอบ") };
    okR(await call("updateProduct", OA(), { unitId: uA, productId: P1, body, meetingPoint, disclosure, deepDive: true, crossBorder: false }), "updateProduct");
    const p = await getP(P1);
    eq([p.body, p.meetingPoint, p.disclosure, p.deepDive, p.crossBorder], [body, meetingPoint, disclosure, true, false], "ค่าหลังแก้");
  });
  await st("P-3", "createOption ×2 ⇒ sortOrder 1,2 · updateOption ระยะเวลา/คืน กลับมาตรง · ชื่อสองภาษา", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const a = await call("createOption", OA(), { unitId: uA, productId: P1, name: THEN("ร่วมกลุ่ม", "Join-in"), durationMin: 510 });
    const b = await call("createOption", OA(), { unitId: uA, productId: P1, name: TH("เหมาเรือส่วนตัว"), active: false });
    okR(a, "option a"); okR(b, "option b");
    P1opt = String(a.id);
    okR(await call("updateOption", OA(), { unitId: uA, optionId: String(b.id), nights: 1, durationMin: null }), "updateOption");
    const o = asArr((await getP(P1)).options);
    eq(o.map((x) => [x.id, x.sortOrder, x.active, x.durationMin, x.nights, x.name]), [[a.id, 1, true, 510, null, { th: "ร่วมกลุ่ม", en: "Join-in" }], [b.id, 2, false, null, 1, { th: "เหมาเรือส่วนตัว" }]], "ตัวเลือก");
  });
  await st("P-4", "listProducts(หน่วย) เห็นของหน่วยนี้ · กรองสถานะ · getProductBySlug ได้ตัวเดียวกัน", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const l = await call("listProducts", OA(), { unitId: uA });
    okR(l, "listProducts");
    ok(asArr(l.items).some((x) => x.id === P1), "ไม่เห็น P1");
    const d = await call("listProducts", OA(), { unitId: uA, status: "ACTIVE" });
    ok(!asArr(d.items).some((x) => x.id === P1), "กรอง ACTIVE ยังเห็น P1 (DRAFT)");
    const s = await call("getProductBySlug", OA(), { unitId: uA, slug: PSLUG("p1") });
    eq(asRec(s.product)?.id, P1, "getProductBySlug");
  });
  await st("P-5", "publish ⇒ ACTIVE · unpublish ⇒ DRAFT · publish อีกครั้ง · archive (ACTIVE ⇒ confirm+เหตุผล) ⇒ ARCHIVED · restore ⇒ DRAFT", async () => {
    await needDb(); ok(P1 && P1opt, "ไม่มี P1");
    const seq: [string, string][] = [["publishProduct", "ACTIVE"], ["unpublishProduct", "DRAFT"], ["publishProduct", "ACTIVE"], ["archiveProduct", "ARCHIVED"], ["restoreProduct", "DRAFT"]];
    const got: unknown[] = [];
    for (const [f] of seq) { const r = await call(f, OA(), { unitId: uA, productId: P1, ...(f === "archiveProduct" ? { confirm: true, reason: "ทดสอบเก็บหลังเคยเปิดขาย" } : {}) }); okR(r, f); got.push(await dbStatus(P1)); }
    eq(got, seq.map((x) => x[1]), "ลำดับสถานะ");
  });
  await st("P-6", "createExtra 3 แบบของจอ 16 · ธง/ราคา/ชนิด/ฐานคิดกลับมาตรงตัว", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const want = [
      { kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: 60_000, name: TH("ค่าอุทยาน"), passThrough: true, commissionable: false, discountable: false, taxKind: "NONE" },
      { kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: 50_000, name: THEN("เช่ากล้องกันน้ำ", "Underwater camera rental"), passThrough: false, commissionable: true, discountable: true, taxKind: "VAT7", stockItemId: "stock-cam-qc" },
      { kind: "COURSE", basis: "PER_PAX", mandatory: false, priceMinor: 190_000, name: TH("ทดลองดำน้ำลึก 1 ไดฟ์"), passThrough: false, commissionable: true, discountable: true, taxKind: "VAT7" },
    ];
    for (const w of want) okR(await call("createExtra", OA(), { unitId: uA, productId: P1, ...w }), `createExtra ${w.kind}`);
    const ex = asArr((await getP(P1)).extras);
    const pick = (x: Rec) => ({ kind: x.kind, basis: x.basis, mandatory: x.mandatory, priceMinor: x.priceMinor, name: x.name, passThrough: x.passThrough, commissionable: x.commissionable, discountable: x.discountable, taxKind: x.taxKind, ...(x.stockItemId ? { stockItemId: x.stockItemId } : {}) });
    eq(ex.map(pick), want, "extras");
    eq(ex.map((x) => [x.currency, x.active, x.productId]), [["THB", true, P1], ["THB", true, P1], ["THB", true, P1]], "currency/active");
  });
  await st("P-7", "updateExtra: เปลี่ยนราคา/ธงลดได้ กลับมาตรง · ค่าอื่นไม่เปลี่ยน", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const cam = asArr((await getP(P1)).extras).find((x) => x.kind === "EQUIPMENT");
    ok(cam, "ไม่มีกล้อง");
    okR(await call("updateExtra", OA(), { unitId: uA, extraId: cam?.id, priceMinor: 55_000, discountable: false }), "updateExtra");
    const c2 = asArr((await getP(P1)).extras).find((x) => x.id === cam?.id) ?? {};
    eq([c2.priceMinor, c2.discountable, c2.commissionable, c2.passThrough, c2.taxKind, c2.basis], [55_000, false, true, false, "VAT7", "PER_BOOKING"], "หลังแก้");
  });
  await st("P-8", "createPaxType รหัสอื่น (DIVER ไม่มีช่วงอายุ) + updatePaxType ป้าย/ใช้ที่นั่ง กลับมาตรง · band NONE", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const r = await call("createPaxType", OA(), { unitId: uA, productId: P1, code: "DIVER", label: THEN("นักดำน้ำ", "Diver"), countsCapacity: true });
    okR(r, "createPaxType");
    okR(await call("updatePaxType", OA(), { unitId: uA, paxTypeId: String(r.id), label: THEN("นักดำน้ำมีบัตร", "Certified diver") }), "updatePaxType");
    const d = byCode(await getP(P1), "DIVER");
    eq([d.label, d.countsCapacity, d.active, d.ageMin, d.ageMax, asRec(d.band)?.source], [{ th: "นักดำน้ำมีบัตร", en: "Certified diver" }, true, true, null, null, "NONE"], "DIVER");
  });
  await st("P-9", "สินค้า LIVEABOARD + ตัวเลือก 4 คืน · ร่างไม่เคยเปิดขาย/ไม่ถูกอ้าง archive ไม่ต้องยืนยัน ⇒ ARCHIVED · แถวและลูกยังอยู่ครบ (ไม่ลบ)", async () => {
    await needDb();
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("la"), productType: "LIVEABOARD", title: TH("ลิฟอะบอร์ดทดสอบ") });
    okR(r, "createProduct LA");
    const id = String(r.id);
    okR(await call("createOption", OA(), { unitId: uA, productId: id, name: TH("4 คืน"), nights: 4 }), "option");
    okR(await call("createExtra", OA(), { unitId: uA, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: 180_000, name: TH("ค่าอุทยาน") }), "extra");
    eq([(await getP(id)).productType, asArr((await getP(id)).options)[0]?.nights], ["LIVEABOARD", 4], "LA");
    okR(await call("archiveProduct", OA(), { unitId: uA, productId: id }), "archive ร่าง");
    const n = await q<{ p: number; o: number; t: number; e: number }>(`SELECT (SELECT count(*)::int FROM "TripProduct" WHERE id = $1) AS p, (SELECT count(*)::int FROM "TripOption" WHERE "productId" = $1) AS o, (SELECT count(*)::int FROM "TripPaxType" WHERE "productId" = $1) AS t, (SELECT count(*)::int FROM "TripExtra" WHERE "productId" = $1) AS e`, [id]);
    eq([await dbStatus(id), n[0]?.p, n[0]?.o, n[0]?.t, n[0]?.e], ["ARCHIVED", 1, 1, 3, 1], "แถวคงอยู่");
  });
  await st("P-10", "อินพุตผิด ⇒ INVALID_INPUT ไม่มีแถว: ช่องแปลก (strict) · slug ผิดรูป · ไม่มีชื่อไทย · ราคาติดลบ/ไม่ใช่จำนวนเต็ม · อายุติดลบ", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const before = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripProduct" WHERE "tenantId" = $1`, [tA]))[0]?.n;
    const bad = [
      await call("createProduct", OA(), { unitId: uA, slug: PSLUG("x1"), productType: "TOUR", title: TH("x"), vesselId: "v1" }),
      await call("createProduct", OA(), { unitId: uA, slug: "Bad Slug!", productType: "TOUR", title: TH("x") }),
      await call("createProduct", OA(), { unitId: uA, slug: PSLUG("x3"), productType: "TOUR", title: { en: "No Thai" } }),
      await call("createExtra", OA(), { unitId: uA, productId: P1, kind: "OTHER", basis: "PER_PAX", mandatory: false, priceMinor: -1, name: TH("x") }),
      await call("createExtra", OA(), { unitId: uA, productId: P1, kind: "OTHER", basis: "PER_PAX", mandatory: false, priceMinor: 10.5, name: TH("x") }),
      await call("createPaxType", OA(), { unitId: uA, productId: P1, code: "KID", label: TH("x"), ageMin: -1, ageMax: 5, countsCapacity: true }),
    ];
    eq(bad.map((r) => r.code), Array(bad.length).fill("INVALID_INPUT"), "codes");
    ok(bad.every((r) => THAI.test(String(r.message))), "ข้อความไม่ใช่ไทย");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripProduct" WHERE "tenantId" = $1`, [tA]))[0]?.n, before, "จำนวนสินค้า");
  });

  await st("P-11", "paxPrices ไป-กลับ (มติ §11 ข้อ 4): ค่าอุทยานเก็บแทน {ADULT 60000, CHILD 30000} + priceMinor 60000 · ธงเก็บแทนคงเดิม · แก้ค่า/ตั้ง null กลับมาตรง · รายการอื่น paxPrices = null", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const pp = { ADULT: 60_000, CHILD: 30_000 };
    const r = await call("createExtra", OA(), { unitId: uA, productId: P1, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: 60_000, paxPrices: pp, name: THEN("ค่าอุทยานตามประเภทคน", "Park fee") });
    okR(r, "createExtra paxPrices");
    const g = async () => asArr((await getP(P1)).extras).find((x) => x.id === r.id) ?? {};
    const a = await g();
    eq([a.paxPrices, a.priceMinor, a.passThrough, a.commissionable, a.discountable, a.taxKind], [pp, 60_000, true, false, false, "NONE"], "สร้าง");
    okR(await call("updateExtra", OA(), { unitId: uA, extraId: r.id, paxPrices: { ADULT: 65_000, CHILD: 30_000, INFANT: 0 } }), "แก้");
    const b = await g();
    okR(await call("updateExtra", OA(), { unitId: uA, extraId: r.id, paxPrices: null }), "null");
    const c = await g();
    eq([b.paxPrices, c.paxPrices, c.passThrough], [{ ADULT: 65_000, CHILD: 30_000, INFANT: 0 }, null, true], "แก้/null");
    const cam = asArr((await getP(P1)).extras).find((x) => x.kind === "EQUIPMENT");
    eq(cam ? cam.paxPrices : "ไม่มีช่อง", null, "กล้อง paxPrices"); // ORACLE-EDIT P-11 (ผู้คุม 12 พ.ย.): `null ?? "…"` ไม่มีทางได้ null
  });

  // ═══════════════ I. ค่าคงที่ ═══════════════
  console.log("\n── I: ค่าคงที่ (invariant) ──");
  await st("I-1", "publish ไม่มีตัวเลือก ⇒ PUBLISH_INCOMPLETE missing มี OPTION · ยัง DRAFT", async () => {
    await needDb();
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("i1"), productType: "TOUR", title: TH("ไม่มีตัวเลือก") });
    okR(r, "create");
    const p = await call("publishProduct", OA(), { unitId: uA, productId: String(r.id) });
    codeR(p, "PUBLISH_INCOMPLETE", "publish");
    ok(Array.isArray(p.missing) && (p.missing as string[]).includes("OPTION"), `missing: ${fmt(p.missing)}`);
    eq(await dbStatus(String(r.id)), "DRAFT", "สถานะ");
  });
  await st("I-2", "publish ไม่มีประเภทคนที่ใช้ที่นั่ง (defaultPaxTypes:false + INFANT ไม่ใช้ที่นั่ง) ⇒ missing SEAT_PAX_TYPE", async () => {
    await needDb();
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("i2"), productType: "TOUR", title: TH("ไม่มีที่นั่ง"), defaultPaxTypes: false });
    okR(r, "create");
    const id = String(r.id);
    okR(await call("createOption", OA(), { unitId: uA, productId: id, name: TH("ร่วมกลุ่ม") }), "option");
    okR(await call("createPaxType", OA(), { unitId: uA, productId: id, code: "INFANT", label: TH("ทารก"), ageMin: 0, ageMax: 3, countsCapacity: false }), "pax");
    eq(paxOf(await getP(id)).length, 1, "ไม่สร้างประเภทคนเริ่มต้นเมื่อ defaultPaxTypes:false");
    const p = await call("publishProduct", OA(), { unitId: uA, productId: id });
    codeR(p, "PUBLISH_INCOMPLETE", "publish");
    eq(p.missing, ["SEAT_PAX_TYPE"], "missing");
  });
  await st("I-3", "publish มีแต่ตัวเลือกที่ปิด ⇒ missing OPTION", async () => {
    await needDb();
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("i3"), productType: "TOUR", title: TH("ตัวเลือกปิด") });
    okR(r, "create");
    okR(await call("createOption", OA(), { unitId: uA, productId: String(r.id), name: TH("ปิด"), active: false }), "option");
    const p = await call("publishProduct", OA(), { unitId: uA, productId: String(r.id) });
    codeR(p, "PUBLISH_INCOMPLETE", "publish");
    eq(p.missing, ["OPTION"], "missing");
  });
  let PA = { id: "", optionId: "" };
  await st("I-4", "สินค้าเปิดขาย: ปิดตัวเลือกสุดท้าย ⇒ LAST_ACTIVE_OPTION (ยังเปิด)", async () => {
    await needDb();
    PA = await mkProduct("i4");
    okR(await call("publishProduct", OA(), { unitId: uA, productId: PA.id }), "publish");
    codeR(await call("setOptionActive", OA(), { unitId: uA, optionId: PA.optionId, active: false }), "LAST_ACTIVE_OPTION", "ปิดตัวสุดท้าย");
    eq(asArr((await getP(PA.id)).options)[0]?.active, true, "ยังเปิด");
  });
  await st("I-5", "สินค้าเปิดขาย: ปิด/เปลี่ยน countsCapacity=false ของประเภทคนใช้ที่นั่งตัวสุดท้าย ⇒ LAST_SEAT_PAX_TYPE", async () => {
    await needDb(); ok(PA.id, "ไม่มีสินค้า I-4");
    const p = await getP(PA.id);
    const adult = byCode(p, "ADULT"), child = byCode(p, "CHILD");
    okR(await call("setPaxTypeActive", OA(), { unitId: uA, paxTypeId: child.id, active: false }), "ปิด CHILD (ยังมี ADULT)");
    const r = [
      await call("setPaxTypeActive", OA(), { unitId: uA, paxTypeId: adult.id, active: false }),
      await call("updatePaxType", OA(), { unitId: uA, paxTypeId: adult.id, countsCapacity: false }),
    ];
    eq(r.map((x) => x.code), ["LAST_SEAT_PAX_TYPE", "LAST_SEAT_PAX_TYPE"], "codes");
    eq([byCode(await getP(PA.id), "ADULT").active, byCode(await getP(PA.id), "ADULT").countsCapacity], [true, true], "ADULT คงเดิม");
  });
  await st("I-6", "ช่วงอายุซ้อน (สร้าง) ⇒ AGE_OVERLAP ไม่มีแถว · ติดกัน (12+ กับ 4–11) ได้", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const n0 = paxOf(await getP(P1)).length;
    codeR(await call("createPaxType", OA(), { unitId: uA, productId: P1, code: "TEEN", label: TH("วัยรุ่น"), ageMin: 10, ageMax: 14, countsCapacity: true }), "AGE_OVERLAP", "10–14 ซ้อน 4–11/12+");
    codeR(await call("createPaxType", OA(), { unitId: uA, productId: P1, code: "SENIOR", label: TH("ผู้สูงอายุ"), ageMin: 60, ageMax: null, countsCapacity: true }), "AGE_OVERLAP", "60+ ซ้อน ADULT 12+");
    eq(paxOf(await getP(P1)).length, n0, "จำนวนประเภทคน");
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("i6"), productType: "TOUR", title: TH("ติดกัน"), defaultPaxTypes: false });
    okR(r, "create");
    okR(await call("createPaxType", OA(), { unitId: uA, productId: String(r.id), code: "CHILD", label: TH("เด็ก"), ageMin: 4, ageMax: 11, countsCapacity: true }), "4–11");
    okR(await call("createPaxType", OA(), { unitId: uA, productId: String(r.id), code: "ADULT", label: TH("ผู้ใหญ่"), ageMin: 12, ageMax: null, countsCapacity: true }), "12+");
  });
  await st("I-7", "ช่วงอายุซ้อน (แก้) ⇒ AGE_OVERLAP ค่าเดิมคงอยู่ · ageMin > ageMax ⇒ AGE_RANGE · ประเภทที่ปิดใช้ไม่นับซ้อน", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const child = byCode(await getP(P1), "CHILD");
    codeR(await call("updatePaxType", OA(), { unitId: uA, paxTypeId: child.id, ageMin: 4, ageMax: 13 }), "AGE_OVERLAP", "CHILD 4–13 ซ้อน ADULT");
    codeR(await call("updatePaxType", OA(), { unitId: uA, paxTypeId: child.id, ageMin: 9, ageMax: 5 }), "AGE_RANGE", "9–5");
    eq([byCode(await getP(P1), "CHILD").ageMin, byCode(await getP(P1), "CHILD").ageMax], [4, 11], "CHILD เดิม");
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("i7"), productType: "TOUR", title: TH("ปิดใช้ไม่นับ") });
    okR(r, "create");
    const c = byCode(await getP(String(r.id)), "CHILD");
    okR(await call("setPaxTypeActive", OA(), { unitId: uA, paxTypeId: c.id, active: false }), "ปิด CHILD");
    okR(await call("createPaxType", OA(), { unitId: uA, productId: String(r.id), code: "KID", label: TH("เด็กโต"), ageMin: 5, ageMax: 11, countsCapacity: true }), "KID 5–11 ทับ CHILD ที่ปิด");
  });
  await st("I-8", "รายการเสริมเก็บแทน + คิดคอมฯ/ลดได้ ⇒ PASS_THROUGH_FLAGS (สร้างและแก้) · ไม่มีแถว · ค่าเดิมคงอยู่", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const n0 = asArr((await getP(P1)).extras).length;
    const base = { unitId: uA, productId: P1, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: 10_000, name: TH("ค่าอุทยาน"), passThrough: true, taxKind: "NONE" };
    codeR(await call("createExtra", OA(), { ...base, commissionable: true, discountable: false }), "PASS_THROUGH_FLAGS", "คิดคอมฯ");
    codeR(await call("createExtra", OA(), { ...base, commissionable: false, discountable: true }), "PASS_THROUGH_FLAGS", "ลดได้");
    eq(asArr((await getP(P1)).extras).length, n0, "จำนวน");
    const cour = asArr((await getP(P1)).extras).find((x) => x.kind === "COURSE");
    codeR(await call("updateExtra", OA(), { unitId: uA, extraId: cour?.id, passThrough: true, taxKind: "NONE" }), "PASS_THROUGH_FLAGS", "แก้เป็นเก็บแทนทั้งที่คิดคอมฯ");
    eq(asArr((await getP(P1)).extras).find((x) => x.id === cour?.id)?.passThrough, false, "COURSE เดิม");
  });
  await st("I-9", "ชนิดภาษีไม่ตรงธงเก็บแทน ⇒ TAX_KIND_MISMATCH (เก็บแทน+VAT7 · ไม่เก็บแทน+NONE) · สกุลไม่ตรงสินค้า ⇒ CURRENCY_MISMATCH", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const base = { unitId: uA, productId: P1, basis: "PER_PAX", mandatory: false, priceMinor: 10_000, name: TH("x") };
    codeR(await call("createExtra", OA(), { ...base, kind: "PARK_FEE", passThrough: true, commissionable: false, discountable: false, taxKind: "VAT7" }), "TAX_KIND_MISMATCH", "PT+VAT7");
    codeR(await call("createExtra", OA(), { ...base, kind: "OTHER", passThrough: false, taxKind: "NONE" }), "TAX_KIND_MISMATCH", "ไม่ PT+NONE");
    codeR(await call("createExtra", OA(), { ...base, kind: "OTHER", currency: "USD" }), "CURRENCY_MISMATCH", "USD บนสินค้า THB");
  });
  await st("I-10", "slug ซ้ำในร้านเดียวกัน (หน่วยอื่น) ⇒ SLUG_TAKEN · ร้านอื่นใช้ slug เดียวกันได้ · รหัสประเภทคนซ้ำ ⇒ PAX_CODE_TAKEN", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    codeR(await call("createProduct", OA(), { unitId: uA2, slug: PSLUG("p1"), productType: "TOUR", title: TH("ซ้ำ") }), "SLUG_TAKEN", "หน่วย a2");
    ok(PA.id, "ไม่มีสินค้า I-4");
    codeR(await call("updateProduct", OA(), { unitId: uA, productId: PA.id, slug: PSLUG("p1") }), "SLUG_TAKEN", "แก้เป็น slug ที่มีแล้ว");
    okR(await call("createProduct", ctxOf("ob"), { unitId: uB, slug: PSLUG("p1"), productType: "TOUR", title: TH("ร้าน B") }), "ร้าน B slug เดียวกัน");
    codeR(await call("createPaxType", OA(), { unitId: uA, productId: P1, code: "ADULT", label: TH("ซ้ำ"), ageMin: null, ageMax: null, countsCapacity: true }), "PAX_CODE_TAKEN", "ADULT ซ้ำ");
  });
  await st("I-11", "หน่วยไม่ใช่ TRIPS ⇒ UNIT_NOT_TRIPS · sourceKind SUPPLIER ⇒ SOURCE_NOT_SUPPORTED · TOUR สกุล USD ⇒ CURRENCY_NOT_ALLOWED", async () => {
    await needDb();
    codeR(await call("createProduct", OA(), { unitId: uBk, slug: PSLUG("bk"), productType: "TOUR", title: TH("หน่วยจองคิว") }), "UNIT_NOT_TRIPS", "BOOKING");
    codeR(await call("createProduct", OA(), { unitId: uA, slug: PSLUG("sup"), productType: "TOUR", sourceKind: "SUPPLIER", title: TH("ของคนอื่น") }), "SOURCE_NOT_SUPPORTED", "SUPPLIER");
    codeR(await call("createProduct", OA(), { unitId: uA, slug: PSLUG("usd"), productType: "TOUR", currency: "USD", title: TH("ดอลลาร์") }), "CURRENCY_NOT_ALLOWED", "TOUR USD");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripProduct" WHERE slug = ANY($1::text[])`, [[PSLUG("bk"), PSLUG("sup"), PSLUG("usd")]]))[0]?.n, 0, "แถว");
  });
  await st("I-12", "ไม่มีการลบ: ลูกที่ถูกอ้าง (ตัวเลือกมีรอบ · ประเภทคนมีราคา · รายการเสริมมีบรรทัดจอง) ปิดใช้ได้ แถวยังอยู่ · ร่างที่มีรอบอ้าง archive ไม่ยืนยัน ⇒ CONFIRM_REQUIRED", async () => {
    await needDb(); await needTable("TripDeparture");
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("i12"), productType: "TOUR", title: TH("ถูกอ้าง") });
    okR(r, "create");
    const id = String(r.id);
    const o1 = await call("createOption", OA(), { unitId: uA, productId: id, name: TH("หลัก") });
    const o2 = await call("createOption", OA(), { unitId: uA, productId: id, name: TH("รอง") });
    const ex = await call("createExtra", OA(), { unitId: uA, productId: id, kind: "OTHER", basis: "PER_BOOKING", mandatory: false, priceMinor: 1_000, name: TH("ของแถม") });
    okR(o1, "o1"); okR(o2, "o2"); okR(ex, "extra");
    const child = byCode(await getP(id), "CHILD");
    await referenceByDeparture(id, String(o2.id));
    await insertRow("TripPrice", { tenantId: tA, unitId: uA, productId: id, paxTypeId: child.id, currency: "THB", amountMinor: 100, updatedAt: now() });
    await insertRow("TripBookingItem", { tenantId: tA, unitId: uA, bookingId: rid("bk"), departureId: rid("dep"), kind: "EXTRA", extraId: String(ex.id), qty: 1, updatedAt: now() });
    okR(await call("setOptionActive", OA(), { unitId: uA, optionId: String(o2.id), active: false }), "ปิดตัวเลือก");
    okR(await call("setPaxTypeActive", OA(), { unitId: uA, paxTypeId: child.id, active: false }), "ปิดประเภทคน");
    okR(await call("setExtraActive", OA(), { unitId: uA, extraId: String(ex.id), active: false }), "ปิดรายการเสริม");
    const p = await getP(id);
    eq([asArr(p.options).map((o) => o.active), byCode(p, "CHILD").active, asArr(p.extras)[0]?.active], [[true, false], false, false], "active");
    const n = await q<{ o: number; t: number; e: number }>(`SELECT (SELECT count(*)::int FROM "TripOption" WHERE "productId" = $1) AS o, (SELECT count(*)::int FROM "TripPaxType" WHERE "productId" = $1) AS t, (SELECT count(*)::int FROM "TripExtra" WHERE "productId" = $1) AS e`, [id]);
    eq([n[0]?.o, n[0]?.t, n[0]?.e], [2, 3, 1], "แถวคงอยู่");
    codeR(await call("archiveProduct", OA(), { unitId: uA, productId: id }), "CONFIRM_REQUIRED", "ร่างที่ถูกอ้าง");
    eq(await dbStatus(id), "DRAFT", "สถานะ");
  });
  await st("I-13", "เปลี่ยนสถานะผิดลำดับ ⇒ BAD_STATE: publish ของ ARCHIVED · restore ของ ACTIVE · unpublish ของ DRAFT · archive ของ ARCHIVED", async () => {
    await needDb(); ok(PA.id, "ไม่มีสินค้า I-4");
    const z = await mkProduct("i13");
    okR(await call("archiveProduct", OA(), { unitId: uA, productId: z.id }), "archive");
    eq([
      (await call("publishProduct", OA(), { unitId: uA, productId: z.id })).code,
      (await call("restoreProduct", OA(), { unitId: uA, productId: PA.id })).code,
      (await call("unpublishProduct", OA(), { unitId: uA, productId: P1 })).code,
      (await call("archiveProduct", OA(), { unitId: uA, productId: z.id, confirm: true, reason: "เก็บซ้ำเพื่อทดสอบสถานะ" })).code,
    ], ["BAD_STATE", "BAD_STATE", "BAD_STATE", "BAD_STATE"], "codes");
    eq([await dbStatus(z.id), await dbStatus(PA.id)], ["ARCHIVED", "ACTIVE"], "สถานะคงเดิม");
  });
  await st("I-14", "เปลี่ยนสกุลเงินได้เฉพาะร่าง (ACTIVE ⇒ BAD_STATE) · productType แก้ไม่ได้ (INVALID_INPUT)", async () => {
    await needDb(); ok(PA.id, "ไม่มีสินค้า I-4");
    codeR(await call("updateProduct", OA(), { unitId: uA, productId: PA.id, currency: "THB" }), "BAD_STATE", "currency บน ACTIVE");
    codeR(await call("updateProduct", OA(), { unitId: uA, productId: PA.id, productType: "LIVEABOARD" }), "INVALID_INPUT", "productType");
  });

  await st("I-15", "paxPrices คีย์ไม่รู้จัก ⇒ UNKNOWN_PAX_TYPE (code ไม่มีบนสินค้า · ประเภทคนที่ปิดใช้ · ตัวเล็ก) · ค่าติดลบ/ว่าง {} / บนรายการระดับหน่วย ⇒ INVALID_INPUT · ไม่มีแถว", async () => {
    await needDb();
    const { id } = await mkProduct("i15");
    const infant = byCode(await getP(id), "INFANT");
    okR(await call("setPaxTypeActive", OA(), { unitId: uA, paxTypeId: infant.id, active: false }), "ปิด INFANT");
    const base = { unitId: uA, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: 60_000, name: TH("ค่าอุทยาน") };
    const codes = [
      (await call("createExtra", OA(), { ...base, paxPrices: { ADULT: 60_000, SENIOR: 10_000 } })).code,
      (await call("createExtra", OA(), { ...base, paxPrices: { ADULT: 60_000, INFANT: 0 } })).code,
      (await call("createExtra", OA(), { ...base, paxPrices: { adult: 60_000 } })).code,
      (await call("createExtra", OA(), { ...base, paxPrices: { ADULT: -1 } })).code,
      (await call("createExtra", OA(), { ...base, paxPrices: {} })).code,
      (await call("createExtra", OA(), { ...base, productId: null, paxPrices: { ADULT: 60_000 } })).code,
    ];
    eq(codes, ["UNKNOWN_PAX_TYPE", "UNKNOWN_PAX_TYPE", "UNKNOWN_PAX_TYPE", "INVALID_INPUT", "INVALID_INPUT", "INVALID_INPUT"], "codes");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripExtra" WHERE "tenantId" = $1 AND ("productId" = $2 OR ("productId" IS NULL AND "unitId" = $3))`, [tA, id, uA]))[0]?.n, 0, "แถว");
    const ok1 = await call("createExtra", OA(), { ...base, paxPrices: { ADULT: 60_000 } });
    okR(ok1, "คีย์ถูก");
    codeR(await call("updateExtra", OA(), { unitId: uA, extraId: ok1.id, paxPrices: { ADULT: 60_000, GHOST: 1 } }), "UNKNOWN_PAX_TYPE", "แก้ด้วยคีย์ไม่รู้จัก");
    eq(asArr((await getP(id)).extras)[0]?.paxPrices, { ADULT: 60_000 }, "ค่าเดิม");
  });
  await st("I-16", "รายการเก็บแทนที่มี paxPrices ยังอยู่ใต้กฎธง: สร้างพร้อมคิดคอมฯ/ลดได้ ⇒ PASS_THROUGH_FLAGS · แก้ให้ลดได้ ⇒ PASS_THROUGH_FLAGS · paxPrices/ธงเดิมคงอยู่", async () => {
    await needDb();
    const { id } = await mkProduct("i16");
    const base = { unitId: uA, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: 60_000, paxPrices: { ADULT: 60_000, CHILD: 30_000 }, name: TH("ค่าอุทยาน"), passThrough: true, taxKind: "NONE" };
    codeR(await call("createExtra", OA(), { ...base, commissionable: true, discountable: false }), "PASS_THROUGH_FLAGS", "คิดคอมฯ");
    const e = await call("createExtra", OA(), { ...base, commissionable: false, discountable: false });
    okR(e, "ถูกต้อง");
    codeR(await call("updateExtra", OA(), { unitId: uA, extraId: e.id, discountable: true, paxPrices: { ADULT: 1 } }), "PASS_THROUGH_FLAGS", "แก้ให้ลดได้");
    const x = asArr((await getP(id)).extras)[0] ?? {};
    eq([asArr((await getP(id)).extras).length, x.discountable, x.paxPrices], [1, false, { ADULT: 60_000, CHILD: 30_000 }], "คงเดิม");
  });

  // ═══════════════ D. ค่าเริ่มจากค่าตั้ง ═══════════════
  console.log("\n── D: ค่าเริ่มจากค่าตั้ง (T27 T44 T3 T2) ──");
  let DOLD = "";
  await st("D-1", "สินค้าใหม่: ประเภทคนเริ่มต้นช่วงอายุจาก T27 (ร้านดำน้ำ: ทารก 0–3 ไม่ใช้ที่นั่ง · เด็ก 4–11 · ผู้ใหญ่ 12+) ลงคอลัมน์", async () => {
    await needDb();
    const t = await resolveV(T27, { unitId: uA });
    eq(t.value, BAND, "T27 ของหน่วย (แม่แบบ/_fallback)");
    DOLD = (await mkProduct("d1")).id;
    const p = await getP(DOLD);
    eq(["ADULT", "CHILD", "INFANT"].map((c) => [byCode(p, c).ageMin, byCode(p, c).ageMax, byCode(p, c).countsCapacity]), [[12, null, true], [4, 11, true], [0, 3, false]], "ประเภทคน");
    ok(["ADULT", "CHILD", "INFANT"].every((c) => THAI.test(String(asRec(byCode(p, c).label)?.th))), "ป้ายไทย");
  });
  await st("D-2", "ตัวควบคุมบวก: ตั้ง T27 ร้าน = {3,3,12} ⇒ สินค้าใหม่ 0–2 · 3–12 · 13+ · สินค้าเดิมคง 4–11", async () => {
    await needDb(); ok(DOLD, "ไม่มีสินค้า D-1");
    await setV([{ key: T27, scope: "UNIT", scopeId: uA, value: { infantBelow: 3, childFrom: 3, childTo: 12 } }]);
    const nw = await getP((await mkProduct("d2")).id);
    const od = await getP(DOLD);
    eq(["INFANT", "CHILD", "ADULT"].map((c) => [byCode(nw, c).ageMin, byCode(nw, c).ageMax]), [[0, 2], [3, 12], [13, null]], "สินค้าใหม่");
    eq(["INFANT", "CHILD", "ADULT"].map((c) => [byCode(od, c).ageMin, byCode(od, c).ageMax]), [[0, 3], [4, 11], [12, null]], "สินค้าเดิม");
  });
  await st("D-3", "ประเภทคนไม่ระบุอายุ (CHILD ว่างทั้งคู่) ⇒ band จากค่าตั้งปัจจุบัน (SETTING) · ชั้นสินค้าของ T27 ชนะชั้นร้าน (L-27)", async () => {
    await needDb();
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("d3"), productType: "TOUR", title: TH("ตามค่าตั้ง"), defaultPaxTypes: false });
    okR(r, "create");
    const id = String(r.id);
    okR(await call("createPaxType", OA(), { unitId: uA, productId: id, code: "CHILD", label: TH("เด็ก"), countsCapacity: true }), "CHILD ว่าง");
    const b1 = asRec(byCode(await getP(id), "CHILD").band);
    await setV([{ key: T27, scope: "PRODUCT", scopeId: id, value: { infantBelow: 2, childFrom: 2, childTo: 10 } }]);
    const c2 = byCode(await getP(id), "CHILD");
    eq([b1, [c2.ageMin, c2.ageMax], c2.band], [{ from: 3, to: 12, source: "SETTING" }, [null, null], { from: 2, to: 10, source: "SETTING" }], "band");
  });
  let XOLD = "";
  await st("D-4", "รายการเสริมไม่ส่งธง ⇒ ธงจาก T44 ตามชนิด (PARK_FEE เก็บแทน/NONE · EQUIPMENT คิดคอมฯ+ลดได้/VAT7) · commissionPct ที่ใช้ = T44 (50 · 0)", async () => {
    await needDb();
    const { id } = await mkProduct("d4");
    const a = await call("createExtra", OA(), { unitId: uA, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: 20_000, name: TH("ค่าอุทยาน") });
    const b = await call("createExtra", OA(), { unitId: uA, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: 30_000, name: TH("กล้อง") });
    okR(a, "PARK_FEE"); okR(b, "EQUIPMENT");
    XOLD = String(b.id);
    const ex = asArr((await getP(id)).extras);
    const f = (x: Rec | undefined) => [x?.passThrough, x?.commissionable, x?.discountable, x?.taxKind, x?.commissionPct];
    eq([f(ex.find((x) => x.id === a.id)), f(ex.find((x) => x.id === b.id))], [[true, false, false, "NONE", 0], [false, true, true, "VAT7", 50]], "ธง");
  });
  await st("D-5", "ตัวควบคุมบวก: T44 ร้าน EQUIPMENT ลดไม่ได้ ⇒ รายการใหม่ discountable=false · รายการเดิมคง true", async () => {
    await needDb(); ok(XOLD, "ไม่มีรายการ D-4");
    const cur = asRec((await resolveV(T44, { unitId: uA })).value) ?? {};
    ok(asRec(cur.EQUIPMENT), `T44 ไม่มี EQUIPMENT: ${fmt(cur)}`);
    await setV([{ key: T44, scope: "UNIT", scopeId: uA, value: { ...cur, EQUIPMENT: { ...asRec(cur.EQUIPMENT), discountable: false } } }]);
    const { id } = await mkProduct("d5");
    const n = await call("createExtra", OA(), { unitId: uA, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: 30_000, name: TH("กล้อง") });
    okR(n, "ใหม่");
    const nd = asArr((await getP(id)).extras)[0]?.discountable;
    const od = asArr((await getP(String((await q<{ productId: string }>(`SELECT "productId" FROM "TripExtra" WHERE id = $1`, [XOLD]))[0]?.productId))).extras).find((x) => x.id === XOLD)?.discountable;
    eq([nd, od], [false, true], "ใหม่/เดิม");
  });
  await st("D-6", "LIVEABOARD สกุล USD: T3 [THB] ⇒ CURRENCY_NOT_ALLOWED · ตั้ง T3 [THB,USD] ⇒ ได้ · ไม่ระบุสกุล ⇒ ตัวแรกของ T3", async () => {
    await needDb();
    codeR(await call("createProduct", OA(), { unitId: uA, slug: PSLUG("d6a"), productType: "LIVEABOARD", currency: "USD", title: TH("ดอลลาร์") }), "CURRENCY_NOT_ALLOWED", "ก่อนตั้ง");
    await setV([{ key: T3, scope: "UNIT", scopeId: uA, value: ["THB", "USD"] }]);
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("d6b"), productType: "LIVEABOARD", currency: "USD", title: TH("ดอลลาร์") });
    okR(r, "หลังตั้ง");
    const d = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("d6c"), productType: "LIVEABOARD", title: TH("ปริยาย") });
    okR(d, "ปริยาย");
    eq([(await getP(String(r.id))).currency, (await getP(String(d.id))).currency], ["USD", "THB"], "สกุล");
  });

  // ═══════════════ L. ภาษา ═══════════════
  console.log("\n── L: ไทย/อังกฤษ + ยังไม่แปล ──");
  let LP = "";
  await st("L-1", "อังกฤษไม่มี ⇒ getProduct(en) คืนไทย + fallback true · translation.missing = ส่วนที่มีไทยแต่ไม่มีอังกฤษ (ตามลำดับ CONTENT_SECTIONS)", async () => {
    await needDb();
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("l1"), productType: "TOUR", title: TH("เกาะราชาใหญ่"),
      body: { summary: THEN("ดำน้ำตื้น", "Snorkel"), itinerary: TH("4 จุด"), includes: THEN("อาหาร", "Meals") }, meetingPoint: { text: TH("ท่าเรืออ่าวฉลอง") } });
    okR(r, "create");
    LP = String(r.id);
    const p = await getP(LP, "en");
    const c = asRec(p.content) ?? {};
    eq([c.title, c.summary, c.itinerary, c.meeting], [{ text: "เกาะราชาใหญ่", locale: "th", fallback: true }, { text: "Snorkel", locale: "en", fallback: false }, { text: "4 จุด", locale: "th", fallback: true }, { text: "ท่าเรืออ่าวฉลอง", locale: "th", fallback: true }], "content");
    eq(asRec(p.translation), { locale: "en", missing: ["title", "itinerary", "meeting"] }, "translation");
  });
  await st("L-2", "setProductContent(en) ⇒ fallback false · ลบอังกฤษ (null) ⇒ กลับเป็นไทย + fallback · ขอไทย ⇒ fallback false · ไทยของชื่อลบไม่ได้ (INVALID_INPUT)", async () => {
    await needDb(); ok(LP, "ไม่มีสินค้า L-1");
    okR(await call("setProductContent", OA(), { unitId: uA, productId: LP, locale: "en", title: "Racha Yai Island", itinerary: "4 stops" }), "set en");
    const a = asRec((await getP(LP, "en")).content) ?? {};
    okR(await call("setProductContent", OA(), { unitId: uA, productId: LP, locale: "en", itinerary: null }), "ลบ en");
    const b = await getP(LP, "en");
    const th = asRec((await getP(LP, "th")).content) ?? {};
    eq([a.title, a.itinerary, asRec(b.content)?.itinerary, asRec(b.translation)?.missing, th.title], [
      { text: "Racha Yai Island", locale: "en", fallback: false }, { text: "4 stops", locale: "en", fallback: false }, { text: "4 จุด", locale: "th", fallback: true }, ["itinerary", "meeting"], { text: "เกาะราชาใหญ่", locale: "th", fallback: false }], "หลังแก้");
    codeR(await call("setProductContent", OA(), { unitId: uA, productId: LP, locale: "th", title: null }), "INVALID_INPUT", "ลบชื่อไทย");
  });
  await st("L-3", "ตัวเลือก/ประเภทคน/รายการเสริม: display ตาม locale + fallback (ไม่มีอังกฤษ = ไทย + ธง)", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const p = await getP(P1, "en");
    const o = asArr(p.options);
    const cam = asArr(p.extras).find((x) => x.kind === "EQUIPMENT"), park = asArr(p.extras).find((x) => x.kind === "PARK_FEE");
    eq([o[0]?.display, o[1]?.display, cam?.display, park?.display], [
      { text: "Join-in", locale: "en", fallback: false }, { text: "เหมาเรือส่วนตัว", locale: "th", fallback: true },
      { text: "Underwater camera rental", locale: "en", fallback: false }, { text: "ค่าอุทยาน", locale: "th", fallback: true }], "display");
    ok(asRec(byCode(p, "ADULT").display)?.locale === "en" && asRec(byCode(p, "ADULT").display)?.fallback === false, `ADULT ป้ายอังกฤษเริ่มต้น: ${fmt(byCode(p, "ADULT").display)}`);
  });
  await st("L-4", "ภาษาที่ร้านไม่เปิด (zh · T2 = [th,en]) ⇒ LOCALE_DISABLED · ตั้ง T2 [th,en,zh] ⇒ เขียนได้", async () => {
    await needDb(); ok(LP, "ไม่มีสินค้า L-1");
    codeR(await call("setProductContent", OA(), { unitId: uA, productId: LP, locale: "zh", title: "拉查岛" }), "LOCALE_DISABLED", "zh ก่อนเปิด");
    await setV([{ key: T2, scope: "UNIT", scopeId: uA, value: ["th", "en", "zh"] }]);
    okR(await call("setProductContent", OA(), { unitId: uA, productId: LP, locale: "zh", title: "拉查岛" }), "zh หลังเปิด");
    eq(asRec((await getP(LP, "zh")).content)?.title, { text: "拉查岛", locale: "zh", fallback: false }, "zh");
  });

  // ═══════════════ PM. สิทธิ์ ═══════════════
  console.log("\n── PM: สิทธิ์ ──");
  await st("PM-1", "พนักงานดูอย่างเดียว: getProduct ได้ · createProduct/updateProduct/createExtra ⇒ FORBIDDEN ไม่มีแถว", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const sv = ctxOf("sv");
    okR(await call("getProduct", sv, { unitId: uA, productId: P1 }), "getProduct");
    eq([
      (await call("createProduct", sv, { unitId: uA, slug: PSLUG("pm1"), productType: "TOUR", title: TH("x") })).code,
      (await call("updateProduct", sv, { unitId: uA, productId: P1, deepDive: false })).code,
      (await call("createExtra", sv, { unitId: uA, productId: P1, kind: "OTHER", basis: "PER_PAX", mandatory: false, priceMinor: 1, name: TH("x") })).code,
    ], ["FORBIDDEN", "FORBIDDEN", "FORBIDDEN"], "codes");
    eq([(await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripProduct" WHERE slug = $1`, [PSLUG("pm1")]))[0]?.n, (await getP(P1)).deepDive], [0, true], "ไม่มีการเขียน");
  });
  await st("PM-2", "พนักงานแก้ได้ (ไม่มีสิทธิ์เปิดขาย): สร้างสินค้า/ตัวเลือกได้ · publish/archive/restore ⇒ FORBIDDEN", async () => {
    await needDb();
    const se = ctxOf("se");
    const r = await call("createProduct", se, { unitId: uA, slug: PSLUG("pm2"), productType: "TOUR", title: TH("ของพนักงาน") });
    okR(r, "create");
    okR(await call("createOption", se, { unitId: uA, productId: String(r.id), name: TH("ร่วมกลุ่ม") }), "option");
    eq([
      (await call("publishProduct", se, { unitId: uA, productId: String(r.id) })).code,
      (await call("archiveProduct", se, { unitId: uA, productId: String(r.id) })).code,
      (await call("restoreProduct", se, { unitId: uA, productId: String(r.id) })).code,
    ], ["FORBIDDEN", "FORBIDDEN", "FORBIDDEN"], "codes");
    eq(await dbStatus(String(r.id)), "DRAFT", "สถานะ");
  });
  await st("PM-3", "พนักงานไม่มีสิทธิ์ trips เลย: getProduct/listProducts ⇒ FORBIDDEN (ไม่คืนข้อมูล)", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const sn = ctxOf("sn");
    const a = await call("getProduct", sn, { unitId: uA, productId: P1 });
    const b = await call("listProducts", sn, { unitId: uA });
    eq([a.code, b.code, a.product ?? null, b.items ?? null], ["FORBIDDEN", "FORBIDDEN", null, null], "ผล");
  });
  await st("PM-4", "ผู้ใช้ที่ไม่มีสมาชิกภาพ/ยังไม่รับเชิญ ⇒ NOT_FOUND (actorUserId สุ่ม)", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const r = await call("getProduct", { tenantId: tA, actorUserId: rid("ghost") }, { unitId: uA, productId: P1 });
    codeR(r, "NOT_FOUND", "ghost");
  });

  // ═══════════════ X1. แยกร้าน/แยกหน่วย ═══════════════
  console.log("\n── X1: แยกร้าน · แยกหน่วย ──");
  const nf = async (ctx: Ctx, unitId: string) => call("getProduct", ctx, { unitId, productId: rid("nope") });
  await st("X1-1", "ร้าน B อ่านสินค้าร้าน A (หน่วยตัวเอง/หน่วย A) ⇒ NOT_FOUND ข้อความเดียวกับ id ที่ไม่มีจริง · ไม่มี product ในผล", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const ob = ctxOf("ob");
    const a = await call("getProduct", ob, { unitId: uB, productId: P1 });
    const b = await call("getProduct", ob, { unitId: uA, productId: P1 });
    const c = await call("getProductBySlug", ob, { unitId: uA, slug: PSLUG("p1") });
    const ref = await nf(ob, uB);
    eq([a.code, b.code, c.code, a.message, b.message], ["NOT_FOUND", "NOT_FOUND", "NOT_FOUND", ref.message, ref.message], "ผล");
    ok(!fmt([a, b, c]).includes("เกาะทดสอบ"), "ข้อมูลหลุด");
  });
  await st("X1-2", "ร้าน B เขียนของร้าน A (แก้สินค้า · เปิดขาย · เก็บ · เพิ่มตัวเลือก · แก้รายการเสริม/ประเภทคน) ⇒ NOT_FOUND · ฐานไม่เปลี่ยน", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const ob = ctxOf("ob");
    const p = await getP(P1);
    const before = await q(`SELECT status, title::text, "updatedAt" FROM "TripProduct" WHERE id = $1`, [P1]);
    const ex = asArr(p.extras)[0], pt = paxOf(p)[0];
    const codes = [
      (await call("updateProduct", ob, { unitId: uA, productId: P1, title: TH("ถูกแก้") })).code,
      (await call("publishProduct", ob, { unitId: uB, productId: P1 })).code,
      (await call("archiveProduct", ob, { unitId: uA, productId: P1, confirm: true, reason: "ทดสอบข้ามร้าน 1234" })).code,
      (await call("createOption", ob, { unitId: uB, productId: P1, name: TH("แทรก") })).code,
      (await call("updateExtra", ob, { unitId: uB, extraId: ex?.id, priceMinor: 1 })).code,
      (await call("updatePaxType", ob, { unitId: uB, paxTypeId: pt?.id, label: TH("แทรก") })).code,
      (await call("setProductContent", ob, { unitId: uB, productId: P1, locale: "en", title: "Hacked" })).code,
    ];
    eq(codes, Array(codes.length).fill("NOT_FOUND"), "codes");
    eq(await q(`SELECT status, title::text, "updatedAt" FROM "TripProduct" WHERE id = $1`, [P1]), before, "แถวสินค้า");
    eq([asArr((await getP(P1)).extras)[0]?.priceMinor, asArr((await getP(P1)).options).length], [ex?.priceMinor, asArr(p.options).length], "ลูก");
  });
  await st("X1-3", "ร้าน B listProducts(หน่วยของ A) ⇒ NOT_FOUND (ไม่ใช่รายการว่าง/มีข้อมูล)", async () => {
    await needDb();
    const r = await call("listProducts", ctxOf("ob"), { unitId: uA });
    eq([r.code, r.items ?? null], ["NOT_FOUND", null], "ผล");
  });
  await st("X1-4", "แยกหน่วยในร้านเดียว: สินค้าหน่วย a ขอด้วยหน่วย a2 ⇒ NOT_FOUND · พนักงานที่เข้าได้แค่ a2 ขอหน่วย a ⇒ NOT_FOUND", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const a = await call("getProduct", OA(), { unitId: uA2, productId: P1 });
    const b = await call("getProduct", ctxOf("s2"), { unitId: uA, productId: P1 });
    const c = await call("updateProduct", ctxOf("s2"), { unitId: uA2, productId: P1, deepDive: false });
    eq([a.code, b.code, c.code], ["NOT_FOUND", "NOT_FOUND", "NOT_FOUND"], "codes");
    const l = await call("listProducts", OA(), { unitId: uA2 });
    ok(!asArr(l.items).some((x) => x.id === P1), "หน่วย a2 เห็นสินค้าหน่วย a");
  });
  await st("X1-5", "ร้าน A ใช้ id ลูก (ตัวเลือก/ประเภทคน/รายการเสริม) ของสินค้าอื่นในหน่วยอื่น ⇒ NOT_FOUND · reorder ที่ปน id สินค้าอื่น ⇒ INVALID_INPUT/NOT_FOUND", async () => {
    await needDb(); ok(P1 && PA.id, "ไม่มีสินค้า");
    const s2 = ctxOf("s2");
    const opt = asArr((await getP(P1)).options)[0];
    const r1 = await call("setOptionActive", s2, { unitId: uA2, optionId: opt?.id, active: false });
    const r2 = await call("reorderOptions", OA(), { unitId: uA, productId: PA.id, optionIds: [PA.optionId, String(opt?.id)] });
    ok(r1.code === "NOT_FOUND", `option ข้ามหน่วย: ${fmt(r1)}`);
    ok(r2.ok === false && ["INVALID_INPUT", "NOT_FOUND"].includes(String(r2.code)), `reorder ปน: ${fmt(r2)}`);
    eq(asArr((await getP(P1)).options)[0]?.active, true, "ตัวเลือกไม่ถูกปิด");
  });

  // ═══════════════ X3. พร้อมกัน ═══════════════
  console.log("\n── X3: ยิงพร้อมกัน ──");
  await st("X3-1", "สร้าง slug เดียวกันพร้อมกัน 2 ทาง (หน่วยต่างกัน) ⇒ สำเร็จ 1 · อีกทาง SLUG_TAKEN (ไม่ throw) · แถว 1", async () => {
    await needDb();
    const s = PSLUG("race");
    const [a, b] = await Promise.all([
      call("createProduct", OA(), { unitId: uA, slug: s, productType: "TOUR", title: TH("แข่ง ก") }),
      call("createProduct", OA(), { unitId: uA2, slug: s, productType: "TOUR", title: TH("แข่ง ข") }),
    ]);
    eq([a, b].map((r) => (r.ok === true ? "OK" : r.code)).sort(), ["OK", "SLUG_TAKEN"], "ผล");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripProduct" WHERE "tenantId" = $1 AND slug = $2`, [tA, s]))[0]?.n, 1, "แถว");
  });
  await st("X3-2", "สร้างตัวเลือกพร้อมกัน 8 ทาง ⇒ ทุกทางสำเร็จ · sortOrder ไม่ซ้ำ = 1..8", async () => {
    await needDb();
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("x32"), productType: "TOUR", title: TH("ตัวเลือกพร้อมกัน") });
    okR(r, "create");
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => call("createOption", OA(), { unitId: uA, productId: String(r.id), name: TH(`ตัวเลือก ${i}`) })));
    ok(res.every((x) => x.ok === true), `ล้ม: ${fmt(res.filter((x) => x.ok !== true))}`);
    const so = (await q<{ s: number }>(`SELECT "sortOrder" AS s FROM "TripOption" WHERE "productId" = $1 ORDER BY 1`, [String(r.id)])).map((x) => x.s);
    eq(so, [1, 2, 3, 4, 5, 6, 7, 8], "sortOrder");
  });
  await st("X3-3", "จัดลำดับตัวเลือกพร้อมกัน 10 ทาง (คนละลำดับ) ⇒ ผลสุดท้ายเป็นลำดับหนึ่งที่ส่งมาครบ (permutation 1..n) · ที่ไม่สำเร็จ = BUSY เท่านั้น", async () => {
    await needDb();
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("x33"), productType: "TOUR", title: TH("จัดลำดับพร้อมกัน") });
    okR(r, "create");
    const pid = String(r.id);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) { const o = await call("createOption", OA(), { unitId: uA, productId: pid, name: TH(`o${i}`) }); okR(o, "option"); ids.push(String(o.id)); }
    const perms = Array.from({ length: 10 }, (_, k) => [...ids].sort((x, y) => ((x.charCodeAt(x.length - 1) * (k + 3)) % 11) - ((y.charCodeAt(y.length - 1) * (k + 3)) % 11) || x.localeCompare(y)));
    const res = await Promise.all(perms.map((o) => call("reorderOptions", OA(), { unitId: uA, productId: pid, optionIds: o })));
    ok(res.every((x) => x.ok === true || x.code === "BUSY"), `ผลแปลก: ${fmt(res.filter((x) => x.ok !== true && x.code !== "BUSY"))}`);
    ok(res.some((x) => x.ok === true), "ไม่มีทางไหนสำเร็จ");
    const rows = await q<{ id: string; s: number }>(`SELECT id, "sortOrder" AS s FROM "TripOption" WHERE "productId" = $1 ORDER BY "sortOrder", id`, [pid]);
    eq(rows.map((x) => x.s), [1, 2, 3, 4, 5], "permutation");
    const final = rows.map((x) => x.id);
    ok(perms.some((p, i) => res[i].ok === true && isDeepStrictEqual(p, final)), `ลำดับสุดท้ายไม่ตรงลำดับที่สำเร็จใด ๆ: ${fmt(final)}`);
  });
  await st("X3-4", "เปิดขายพร้อมกัน 5 ทาง ⇒ สำเร็จ 1 · ที่เหลือ BAD_STATE · event published 1 ตัว", async () => {
    await needDb(); await needTable("OutboxEvent");
    const { id } = await mkProduct("x34");
    const res = await Promise.all(Array.from({ length: 5 }, () => call("publishProduct", OA(), { unitId: uA, productId: id })));
    eq(res.map((r) => (r.ok === true ? "OK" : r.code)).sort(), ["BAD_STATE", "BAD_STATE", "BAD_STATE", "BAD_STATE", "OK"], "ผล");
    eq((await outbox(id, "trips.product.published")).length, 1, "event");
  });

  // ═══════════════ X9. การกระทำอันตราย ═══════════════
  console.log("\n── X9: เก็บสินค้าที่ถูกอ้างถึง ──");
  let XR = { id: "", optionId: "" };
  await st("X9-1", "เก็บสินค้าที่มีรอบอ้างถึง ไม่ส่ง confirm ⇒ CONFIRM_REQUIRED (ข้อความไทย) · สถานะเดิม", async () => {
    await needDb(); await needTable("TripDeparture");
    XR = await mkProduct("x9");
    okR(await call("publishProduct", OA(), { unitId: uA, productId: XR.id }), "publish");
    await referenceByDeparture(XR.id, XR.optionId);
    const r = await call("archiveProduct", OA(), { unitId: uA, productId: XR.id });
    codeR(r, "CONFIRM_REQUIRED", "ไม่ยืนยัน");
    ok(THAI.test(String(r.message)), "ข้อความไม่ใช่ไทย");
    eq(await dbStatus(XR.id), "ACTIVE", "สถานะ");
  });
  await st("X9-2", "confirm แต่ไม่มีเหตุผล / เหตุผลสั้นกว่า 10 ตัวอักษร ⇒ CONFIRM_REQUIRED · สถานะเดิม", async () => {
    await needDb(); ok(XR.id, "ไม่มีสินค้า X9-1");
    const a = await call("archiveProduct", OA(), { unitId: uA, productId: XR.id, confirm: true });
    const b = await call("archiveProduct", OA(), { unitId: uA, productId: XR.id, confirm: true, reason: "  สั้น  " });
    eq([a.code, b.code, await dbStatus(XR.id)], ["CONFIRM_REQUIRED", "CONFIRM_REQUIRED", "ACTIVE"], "ผล");
  });
  await st("X9-3", "confirm + เหตุผล ⇒ ARCHIVED · AuditLog trips.product.archive (actorId · after.reason · after.referenced) · event archived", async () => {
    await needDb(); ok(XR.id, "ไม่มีสินค้า X9-1");
    const reason = "เลิกขายเส้นทางนี้ตั้งแต่ฤดูหน้า";
    okR(await call("archiveProduct", OA(), { unitId: uA, productId: XR.id, confirm: true, reason }), "archive");
    const a = await q<{ actorId: string; after: Rec; targetType: string }>(`SELECT "actorId", "after", "targetType" FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.product.archive' AND "targetId" = $2`, [tA, XR.id]);
    eq([await dbStatus(XR.id), a.length, a[0]?.actorId, a[0]?.targetType, asRec(a[0]?.after)?.reason, asRec(a[0]?.after)?.referenced, asRec(a[0]?.after)?.wasPublished], ["ARCHIVED", 1, U.oa?.userId, "TripProduct", reason, true, true], "ผล");
    eq((await outbox(XR.id, "trips.product.archived")).length, 1, "event");
  });
  await st("X9-4", "AuditLog ครบทุกการเขียน (ไม่มี action ลบ): create/update/publish ของสินค้า · option/paxType/extra/content ระดับ action ที่ใบสั่ง §5 กำหนด", async () => {
    await needDb(); ok(P1, "ไม่มี P1");
    const acts = (await q<{ action: string }>(`SELECT DISTINCT action FROM "AuditLog" WHERE "tenantId" = $1 AND action LIKE 'trips.%'`, [tA])).map((r) => r.action);
    const need = ["trips.product.create", "trips.product.update", "trips.product.publish", "trips.product.unpublish", "trips.product.archive", "trips.product.restore",
      "trips.option.create", "trips.option.update", "trips.option.reorder", "trips.paxType.create", "trips.paxType.update", "trips.extra.create", "trips.extra.update", "trips.content.update"];
    const miss = need.filter((x) => !acts.includes(x));
    ok(miss.length === 0, `ไม่มี audit: ${miss.join(", ")}`);
    const del = acts.filter((x) => /\.delete$/.test(x));
    ok(del.length === 0, `มี audit การลบ: ${del.join(", ")}`);
  });
  await st("X9-5", "ร่างที่เคยเปิดขาย (publish → unpublish · ไม่ถูกอ้าง) archive ไม่ยืนยัน ⇒ CONFIRM_REQUIRED · ร่างไม่เคยเปิดขาย ⇒ ได้ทันที (audit wasPublished false · referenced false)", async () => {
    await needDb();
    const a = await mkProduct("x95a");
    okR(await call("publishProduct", OA(), { unitId: uA, productId: a.id }), "publish");
    okR(await call("unpublishProduct", OA(), { unitId: uA, productId: a.id }), "unpublish");
    codeR(await call("archiveProduct", OA(), { unitId: uA, productId: a.id }), "CONFIRM_REQUIRED", "เคยเปิดขาย");
    codeR(await call("archiveProduct", OA(), { unitId: uA, productId: a.id, confirm: true, reason: "สั้นไป" }), "CONFIRM_REQUIRED", "เหตุผลสั้น");
    const b = await mkProduct("x95b");
    okR(await call("archiveProduct", OA(), { unitId: uA, productId: b.id }), "ไม่เคยเปิดขาย");
    const au = await q<{ after: Rec }>(`SELECT "after" FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.product.archive' AND "targetId" = $2`, [tA, b.id]);
    eq([await dbStatus(a.id), await dbStatus(b.id), asRec(au[0]?.after)?.wasPublished, asRec(au[0]?.after)?.referenced], ["DRAFT", "ARCHIVED", false, false], "ผล");
  });

  // ═══════════════ EV. event ═══════════════
  console.log("\n── EV: event ──");
  await st("EV-1", "publish/unpublish/archive ⇒ OutboxEvent ชนิดละ 1 ต่อครั้ง · unitId ตรง · payload = {productId,unitId,productType,status}", async () => {
    await needDb(); await needTable("OutboxEvent");
    const { id } = await mkProduct("ev1");
    for (const f of ["publishProduct", "unpublishProduct", "archiveProduct"]) okR(await call(f, OA(), { unitId: uA, productId: id, ...(f === "archiveProduct" ? { confirm: true, reason: "ทดสอบ event ตอนเก็บสินค้า" } : {}) }), f);
    const ev = await outbox(id);
    eq(ev.map((e) => e.type), EVENTS, "ชนิด/ลำดับ");
    eq(ev.map((e) => [e.unitId, Object.keys(e.payload).sort(), e.payload.status]), [[uA, [...EVENT_PAYLOAD_KEYS].sort(), "ACTIVE"], [uA, [...EVENT_PAYLOAD_KEYS].sort(), "DRAFT"], [uA, [...EVENT_PAYLOAD_KEYS].sort(), "ARCHIVED"]], "payload");
  });
  await st("EV-2", "payload ไม่มีข้อมูลส่วนบุคคล (อีเมล · เบอร์ · ชื่อผู้ใช้/ลูกค้าฟิกซ์เจอร์) และไม่มีชื่อสินค้า/ราคา", async () => {
    await needDb(); await needTable("OutboxEvent");
    const rows = await q<{ payload: Rec }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type LIKE 'trips.product.%'`, [tA]);
    ok(rows.length >= 3, `event น้อย (${rows.length})`);
    const names = [...FX.DIVE_PARTIES.map((p) => p.name), "ผู้ทดสอบ"];
    const bad = rows.map((r) => JSON.stringify(r.payload)).filter((s) => /@|\+?\d{9,}/.test(s) || names.some((n) => s.includes(n)) || THAI.test(s));
    ok(bad.length === 0, `payload มีข้อมูลต้องห้าม: ${bad[0]?.slice(0, 120)}`);
  });
  await st("EV-3", "publish ไม่ผ่าน (ขาดตัวเลือก) / ถูกปฏิเสธสิทธิ์ ⇒ ไม่มี event · ไม่มี audit publish", async () => {
    await needDb(); await needTable("OutboxEvent");
    const r = await call("createProduct", OA(), { unitId: uA, slug: PSLUG("ev3"), productType: "TOUR", title: TH("ไม่ครบ") });
    okR(r, "create");
    const id = String(r.id);
    codeR(await call("publishProduct", OA(), { unitId: uA, productId: id }), "PUBLISH_INCOMPLETE", "publish");
    okR(await call("createOption", OA(), { unitId: uA, productId: id, name: TH("ร่วมกลุ่ม") }), "option");
    codeR(await call("publishProduct", ctxOf("se"), { unitId: uA, productId: id }), "FORBIDDEN", "staff publish");
    const au = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'trips.product.publish' AND "targetId" = $2`, [tA, id]);
    eq([(await outbox(id)).length, au[0]?.n], [0, 0], "event/audit");
  });

  // ═══════════════ R. seed (ร้านตัวอย่าง · อ่านอย่างเดียว) ═══════════════
  console.log("\n── R: seed หน่วย TRIPS + สินค้าจอ 16 ──");
  const D = FX.SHOP_DIVE;
  const diveOwner: Ctx = { tenantId: D.tenant.id, actorUserId: D.users[0].userId };
  const seeded = async (key: keyof typeof SEED_SLUGS, locale = "th"): Promise<Rec> => {
    needTrips();
    const r = await call("getProductBySlug", diveOwner, { unitId: DIVE_TRIPS_UNIT.id, slug: SEED_SLUGS[key], locale });
    ok(r.ok === true, `ยังไม่ได้ seed สินค้า ${SEED_SLUGS[key]} (รัน seed-trips-qc.mts หลัง T0.2): ${fmt(r).slice(0, 120)}`);
    return asRec(r.product) ?? {};
  };
  await st("R-1", "seed: อันดามันไดฟ์มีหน่วย TRIPS (tripsqc-unit-dive-trips · andaman-dive-trips) + หน่วย BOOKING เดิมยังอยู่", async () => {
    const u = await q<{ id: string; type: string; slug: string }>(`SELECT id, type::text AS type, slug FROM "BusinessUnit" WHERE "tenantId" = $1 ORDER BY id`, [D.tenant.id]);
    eq(u.map((x) => [x.id, x.type, x.slug]), [[D.units.main.id, "BOOKING", "andaman-dive"], [DIVE_TRIPS_UNIT.id, "TRIPS", DIVE_TRIPS_UNIT.slug]], "หน่วย");
  });
  await st("R-2", "seed: สินค้า 4 ตัวของจอ 16 เปิดขาย (ทัวร์ 3 + Liveaboard 1) ชื่อตามฟิกซ์เจอร์ · สกุล THB", async () => {
    const ps = await Promise.all((Object.keys(SEED_SLUGS) as (keyof typeof SEED_SLUGS)[]).map((k) => seeded(k)));
    eq(ps.map((p) => [p.slug, p.status, p.productType, p.currency, asRec(p.title)?.th]), [
      [SEED_SLUGS.racha, "ACTIVE", "TOUR", "THB", FX.PRODUCT_RACHA.name], [SEED_SLUGS.phiphi, "ACTIVE", "TOUR", "THB", FX.PRODUCT_PHIPHI.name],
      [SEED_SLUGS.deep3, "ACTIVE", "TOUR", "THB", FX.PRODUCT_DEEP3.name], [SEED_SLUGS.similan, "ACTIVE", "LIVEABOARD", "THB", FX.TRIP_SIMILAN.name]], "สินค้า");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripProduct" WHERE "tenantId" = $1`, [D.tenant.id]))[0]?.n, 4, "ไม่มีสินค้าเกิน");
  });
  await st("R-3", "ราชา ตัวเลือก: ร่วมกลุ่ม (เปิด · 510 นาที = 08:00–16:30) · เหมาเรือส่วนตัว (ปิด = ร่าง) · ดำน้ำลึกราชาน้อย deepDive · สิมิลัน 4 คืน", async () => {
    const r = await seeded("racha");
    eq(asArr(r.options).map((o) => [asRec(o.name)?.th, o.active, o.durationMin]), [["ร่วมกลุ่ม", true, 510], ["เหมาเรือส่วนตัว", false, null]], "ราชา");
    const d3 = await seeded("deep3"), sim = await seeded("similan");
    eq([d3.deepDive, sim.deepDive, asArr(sim.options).map((o) => o.nights)], [true, true, [FX.TRIP_SIMILAN.nights]], "อื่น");
  });
  await st("R-4", "ราชา ประเภทคน: ผู้ใหญ่ 12+ ใช้ที่นั่ง · เด็ก 4–11 (= ฟิกซ์เจอร์ childAge) ใช้ที่นั่ง · ทารก 0–3 ไม่ใช้ · อายุ 30/8/2 ⇒ ADULT/CHILD/INFANT", async () => {
    const r = await seeded("racha");
    eq(["ADULT", "CHILD", "INFANT"].map((c) => [byCode(r, c).ageMin, byCode(r, c).ageMax, byCode(r, c).countsCapacity]), [[12, null, true], [FX.PRODUCT_RACHA.childAge.min, FX.PRODUCT_RACHA.childAge.max, true], [0, 3, false]], "ประเภทคน");
    const f = (age: number) => { const x = fn("paxTypeForAge")(paxOf(r), age); return asRec(x)?.code ?? x; };
    eq([f(30), f(8), f(2)], ["ADULT", "CHILD", "INFANT"], "ตามอายุ");
  });
  await st("R-5", "ราชา รายการเสริม 3 ตัว (จอ 16): ค่าอุทยาน 600 (+ paxPrices 600/300) คน/บังคับ/เก็บแทน · กล้อง 500 การจอง/คอมฯ 50%/ลดได้ · ทดลองดำน้ำ 1,900 คน/คอมฯ/ลดได้", async () => {
    const r = await seeded("racha");
    const ex = asArr(r.extras).map((x) => [x.kind, x.basis, x.mandatory, x.priceMinor, x.paxPrices, x.passThrough, x.commissionable, x.discountable, x.taxKind, x.commissionPct, asRec(x.name)?.th]);
    eq(ex, [
      ["PARK_FEE", "PER_PAX", true, FX.PRODUCT_RACHA.parkAdultSatang, { ADULT: FX.PRODUCT_RACHA.parkAdultSatang, CHILD: FX.PRODUCT_RACHA.parkChildSatang }, true, false, false, "NONE", 0, "ค่าอุทยาน"],
      ["EQUIPMENT", "PER_BOOKING", false, FX.PRODUCT_RACHA.extras.camera.satang, null, false, true, true, "VAT7", 50, FX.PRODUCT_RACHA.extras.camera.name],
      ["COURSE", "PER_PAX", false, FX.PRODUCT_RACHA.extras.introDive.satang, null, false, true, true, "VAT7", 100, FX.PRODUCT_RACHA.extras.introDive.name],
    ], "extras");
    const sim = await seeded("similan");
    eq(asArr(sim.extras).map((x) => [x.kind, x.priceMinor, x.paxPrices, x.passThrough]), [["PARK_FEE", FX.TRIP_SIMILAN.parkPerPersonSatang, null, true]], "สิมิลัน");
  });
  await st("R-6", "ภาษา: ราชา EN ยังไม่แปล 2 ส่วน (กำหนดการ · จุดนัดพบ) ชื่ออังกฤษ \"Racha Yai Island Day Trip\" · อีก 3 ตัว EN ครบ (missing [])", async () => {
    const r = await seeded("racha", "en");
    eq([asRec(r.translation)?.missing, asRec(asRec(r.content)?.title)?.text], [["itinerary", "meeting"], "Racha Yai Island Day Trip"], "ราชา");
    const rest = await Promise.all((["phiphi", "deep3", "similan"] as const).map((k) => seeded(k, "en")));
    eq(rest.map((p) => asRec(p.translation)?.missing), [[], [], []], "อื่น");
  });
  await st("R-7", "TR-6911-0142 (2 ผู้ใหญ่ 1 เด็ก + กล้อง) เฉพาะราคาตั้งของ T0.2: กล้อง 1×500 · ค่าอุทยาน paxPrices 2×600 + 1×300 = 1,500 = บรรทัดฟิกซ์เจอร์ เก็บแทน · (ราคาคน/ยอด/VAT/การเลือกราคา = T0.5)", async () => {
    const r = await seeded("racha");
    const cam = asArr(r.extras).find((x) => x.kind === "EQUIPMENT"), park = asArr(r.extras).find((x) => x.kind === "PARK_FEE");
    const fl = (label: string) => FX.BOOKING_TR_0142.lines.find((l) => l.label === label);
    const pp = asRec(park?.paxPrices) ?? {};
    const f = (age: number) => String(asRec(fn("paxTypeForAge")(paxOf(r), age))?.code);
    const pax = [...Array(FX.BOOKING_TR_0142.adults).fill(30), ...Array(FX.BOOKING_TR_0142.children).fill(8)].map(f);
    eq(pax, ["ADULT", "ADULT", "CHILD"], "ประเภทคนของ 0142");
    const parkSum = pax.reduce((t, c) => t + Number(pp[c] ?? NaN), 0);
    eq([Number(cam?.priceMinor) * 1, pp.ADULT, pp.CHILD, parkSum, park?.passThrough, cam?.commissionable],
      [fl("เช่ากล้องกันน้ำ")?.totalSatang, fl("ค่าอุทยาน ผู้ใหญ่")?.unitSatang, fl("ค่าอุทยาน เด็ก")?.unitSatang, FX.BOOKING_TR_0142.parkSatang, true, true], "บรรทัด");
  });
  await st("R-8", "seed สร้างผ่าน facade (ไม่มี prisma ตรงสำหรับสินค้า) · ฟิกซ์เจอร์มีหน่วย TRIPS + slug ของสินค้า 4 ตัว", () => {
    const s = stripComments(read("scripts/seed-trips-qc.mts"));
    ok(/createProduct/.test(s) && /@\/lib\/modules\/trips["']/.test(s), "seed ไม่เรียก facade trips");
    ok(!/prisma\.tripProduct\.(create|update|upsert)/.test(s), "seed เขียน TripProduct ตรง");
    const fx = read("scripts/trips-fixture.mts");
    const miss = [DIVE_TRIPS_UNIT.id, DIVE_TRIPS_UNIT.slug, ...Object.values(SEED_SLUGS)].filter((x) => !fx.includes(x));
    ok(miss.length === 0, `ฟิกซ์เจอร์ไม่มี: ${miss.join(", ")}`);
  });

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T0.2 · สินค้า · ตัวเลือก · ประเภทคน · รายการเสริม · ภาษา =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
