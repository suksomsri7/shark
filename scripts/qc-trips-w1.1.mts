// QC — TRIPS W1.1a · โครงหน้าจองสาธารณะ /book/[shop]: ตัวแก้ร้าน/หน่วย · ด่านอัตรา (ปิดเมื่อพัง) · ตัวนับเปิดดู TripLinkStat · หน้ารายการ + หน้าสินค้าทัวร์ (ภาพ 19 · 01ก)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/W1.1.md (W1.1 แยก a/b — ไฟล์นี้ = W1.1a) · สัญญา ledger/TRIPS-CORE-CONTRACT.md §C §J.3 · ภาพ ledger/design-trips/19-customer-desktop-en.* · 01-tour-customer.*
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน)   S ไฟล์/กติกาโค้ด (static)   P ตัวช่วยบริสุทธิ์ (trips-public-core)   LG ภาษา
//   SD ตัวโหลดบนร้าน seed (now = TRIPS_AS_OF · อ่านอย่างเดียว)   IS ร้านชั่วคราว: แยกร้าน/หน่วย · การมองเห็น · ไม่มี id ภายใน
//   RL ด่านอัตรา (เพดาน · ปิดเมื่อพัง · คำสั่งเดียว · ไม่มีถัง unknown)   TK ตัวนับเปิดดู (พร้อมกัน · เพดาน · วันของร้าน · ลิงก์)   EM โดเมนฝัง
//   XR มติผู้คุมหลังตรวจรอบ 1 (X1–X12 ท้ายใบสั่ง): ผู้ใช้คือใคร (X2) · ราคาคนเดียว (X3) · วันเดียวหลายรอบ (X4) · ไม่คืนเงิน (X5) · นับเมื่อหน้าแสดงได้จริง (X6) · ธงยังไม่แปล (X7)
//      ชื่อเข้าถึงได้ (X8) · จำกัดความถี่ ops (X9) · โลโก้/เขตเวลา DST (X10) · ร้านคิด VAT เพิ่ม (X11) — ร้านชั่วคราวของตัวเอง (slug …-x)
// ORACLE-EDIT 13 พ.ย. 2569 (ผู้เขียนข้อสอบ · มติ X12): ปรับ S-5 · P-9 · LG-1…3 · IS-5 · IS-6 · RL-5 ตามมติ X1/X4/X6/X7/X10 + เพิ่มกลุ่ม XR
//
// 🔴 ที่ตรวจไม่ได้ที่นี่ (ไม่มี server/เบราว์เซอร์) = ด่านภาพ + การเปิดจริงผ่าน Next ของผู้คุม: 404 จริง · X-Frame-Options · ผัง 1440/390 · ไม่ล้น · สีตราสินค้า
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-w11-*` (ผู้ใช้ `trips-w11-*@shark.local`) + ถัง ChatRateBucket ของร้าน/กุญแจเครื่องที่ข้อสอบใช้ — ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน seed อ่านอย่างเดียว
// 🔴 ยังไม่มีโมดูล/ฟังก์ชัน = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-w1.1.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน W1.1a: PC เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-w1.1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t1.3) ═══════════════
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
const rid = (p: string) => `w11qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const SLUG = "trips-w11-";
const EMAIL_PREFIX = "trips-w11-";
const HOUR = 3_600_000;
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const walk = (rel: string): string[] => {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const n of readdirSync(abs)) {
    const p = join(rel, n);
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mts)$/.test(n)) out.push(p);
  }
  return out;
};
const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) for (const x of v) keysDeep(x, out);
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v as Rec)) { out.add(k); keysDeep(x, out); }
  return out;
};
const flat = (o: unknown, pre = "", out: Record<string, unknown> = {}): Record<string, unknown> => {
  const r = asRec(o);
  if (!r) return out;
  for (const [k, v] of Object.entries(r)) { if (asRec(v)) flat(v, `${pre}${k}.`, out); else out[`${pre}${k}`] = v; }
  return out;
};

// ═══════════════ สเปก (ใบสั่ง W1.1 · ส่วน a) ═══════════════
const BASE_SHA = "7cae2e5c31050539df903e2d229d7203923fee8d"; // wip/trips-w1.1 = session/trips ตอนเขียนใบสั่ง
const CORE = "src/lib/platform/trips-public-core.ts";
const SVC = "src/lib/platform/trips-public.ts";
const CATALOG = "src/lib/modules/trips/public-catalog.ts";
const FACADE = "src/lib/modules/trips/index.ts";
const APP = "src/app/book";
const PAGE_INDEX = `${APP}/[shop]/page.tsx`;
const PAGE_PRODUCT = `${APP}/[shop]/t/[productSlug]/page.tsx`;
const PAGE_NF = `${APP}/[shop]/not-found.tsx`;
const COMP = "src/components/book";
const I18N = `${COMP}/book-i18n.ts`;
const MSG_TH = "src/messages/th/book.json";
const MSG_EN = "src/messages/en/book.json";
const OWN = [CORE, SVC, CATALOG, PAGE_INDEX, PAGE_PRODUCT, PAGE_NF, I18N, MSG_TH, MSG_EN];
const CORE_NAMES = ["BOOK_LOCALES", "BOOK_DAY_STATES", "BOOK_PUBLIC_CHANNELS", "BOOK_READ_LIMIT", "BOOK_MISS_LIMIT", "BOOK_VIEW_PER_CLIENT_DAY", "BOOK_STAT_ROW_CAP", "BOOK_PRODUCT_CAP", "BOOK_MONTHS_AHEAD",
  "BOOK_CODE_RE", "bookLocaleOf", "canonicalClientIp", "clientIpFromHeaders", "parseBookQuery", "bookHref", "monthGrid", "clampMonth", "dayCellOf", "frameAncestorsOf", "embedOriginAllowed"];
const SVC_FNS = ["bookClientKey", "registerBookLinkResolver", "resolveBookShop", "bookPageGate", "bookFramePolicy", "loadBookShopVM", "loadBookProductVM", "openBookShop", "openBookProduct"];
const DAY_STATES = ["PAST", "NONE", "NOT_RUNNING", "CLOSED", "FULL", "LOW", "OPEN"];
const INTERNAL_KEYS = ["id", "tenantId", "unitId", "productId", "slotId", "departureId", "optionId", "paxTypeId", "extraId", "agentAccountId", "linkId", "clientKey", "itemRef", "priceSource", "priceTrace", "fingerprint", "warnings"];
const TESTIDS_FIXED = ["book-shell", "book-brand", "book-lang-th", "book-lang-en", "book-index", "book-index-empty", "book-not-found", "book-rate-limited", "book-product", "book-title", "book-meta", "book-cal",
  "book-cal-month", "book-cal-prev", "book-cal-next", "book-cal-strip", "book-legend", "book-selected", "book-selected-date", "book-requested-unavailable", "book-prices", "book-fees", "book-extras",
  "book-vat-note", "book-price-unavailable", "book-cancel", "book-tz-note", "book-cta", "book-cta-note", "book-bottom-bar", "book-itinerary", "book-includes", "book-meeting", "book-untranslated"];
const TESTID_PATTERNS = ["book-card-", "book-day-", "book-chip-", "book-slot-", "book-price-", "book-fee-", "book-extra-"];
const I18N_REQUIRED = [
  ...["langTh", "langEn", "brandHome"].map((k) => `shell.${k}`), ...["title", "empty", "truncated", "view"].map((k) => `index.${k}`), "notFound.title", "notFound.body", "rate.title", "rate.body",
  ...["chooseDate", "prevMonth", "nextMonth", "prices", "fees", "extras", "itinerary", "includes", "meeting", "untranslated", "capacity"].map((k) => `product.${k}`),
  ...DAY_STATES.map((k) => `day.${k}`), ...["selected", "low", "notRunning", "real"].map((k) => `legend.${k}`), ...["guaranteed", "closesAt"].map((k) => `slot.${k}`),
  ...["ageRange", "ageFrom", "ageUnder", "noSeat", "free"].map((k) => `pax.${k}`), ...["from", "passThrough", "unavailable"].map((k) => `price.${k}`),
  ...["INCLUDED", "ADDED", "NONE"].map((k) => `price.vat.${k}`), ...["title", "row", "rowLast", "noRefund"].map((k) => `cancel.${k}`), "tz.note", "cta.continue", "cta.notYet", "unavailable.requested",
  ...[0, 1, 2, 3, 4, 5, 6].map((k) => `weekday.${k}`), ...Array.from({ length: 12 }, (_, i) => `month.${i + 1}`),
];
/** มติ X10: คีย์ที่ไม่มีที่ใช้ต้องถูกลบ (ห้ามกลับมา) */
const I18N_REMOVED = ["slot.available", "slot.left", "pax.perPerson", "pax.perBooking", "price.currency"];
/** คีย์ที่มติ r2 เพิ่ม (ต้องมีทั้งสองภาษา) */
const I18N_RULED = ["price.group", "price.amount", "slot.title", "slot.from", "slot.choose", "slot.chosen", "slot.more", "slot.count"];
const VISUAL_SCENES = ["book-index", "book-product", "book-product-en", "book-not-found"];
const FORBIDDEN_PATHS = ["prisma", "src/proxy.ts", "src/lib/core", "src/i18n", "src/lib/branding", "src/lib/payment", "src/app/api", "src/app/app", "src/app/b", "src/app/(store)", "src/lib/platform", "src/lib/modules",
  "src/messages/th/trips.json", "src/messages/en/trips.json", "src/components/trips", "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts", "scripts/trips-ui-inventory.json",
  ...["p0.1", "t0.1", "t0.2", "t0.3", "t0.4", "t0.5", "t0.6", "t0.7", "t0.8", "t1.1", "t1.2", "a1.1"].map((w) => `scripts/qc-trips-${w}.mts`),
  `:(exclude)${CORE}`, `:(exclude)${SVC}`, `:(exclude)${CATALOG}`, `:(exclude)${FACADE}`];
/** ไฟล์ที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด (null = ไม่จำกัด)] */
const LIMITED: [string, number, number | null][] = [[FACADE, 0, 40], ["scripts/visual-trips.mts", 12, null], ["scripts/parity-trips.sh", 8, null]];
// seed / ภาพ 19
const AS_OF = new Date(FX.TRIPS_AS_OF);
const DIVE_TENANT = FX.SHOP_DIVE.tenant.id;
const DIVE_SLUG = FX.SHOP_DIVE.tenant.slug;
const U0 = FX.SHOP_DIVE.units.trips.id;
const R = FX.PRODUCT_RACHA;
const RACHA_SLUG = "racha-yai-day-trip";
const D14 = FX.DEPARTURE_RACHA_1114.date;
const TIME_TEXT = `${R.time.start}–${R.time.end}`;
const LADDER = [{ daysBefore: 30, refundBp: 10000 }, { daysBefore: 15, refundBp: 5000 }, { daysBefore: 0, refundBp: 0 }];
// ร้านชั่วคราว
const NOW0 = "2027-03-01T03:00:00.000Z"; // 10:00 น. 1 มี.ค. 2570 (เวลาร้าน)
const NF = { ok: false, code: "NOT_FOUND" };
const IP_PREFIX = "100.64.";

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
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
    for (const t of tids) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:book:${t}:%`]);
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
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
const T_START = new Date();

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
  const SET = SETI.mod;
  const DBI = await tryImport("@/lib/core/db");
  const prismaObj = asRec(DBI.mod?.prisma);
  const COREI = existsSync(join(ROOT, CORE)) ? await tryImport("@/lib/platform/trips-public-core") : { mod: null, err: "ยังไม่มีไฟล์" };
  const SVCI = existsSync(join(ROOT, SVC)) ? await tryImport("@/lib/platform/trips-public") : { mod: null, err: "ยังไม่มีไฟล์" };
  const I18I = existsSync(join(ROOT, I18N)) ? await tryImport("@/components/book/book-i18n") : { mod: null, err: "ยังไม่มีไฟล์" };
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const tfn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ไม่มี ${name}`); return f as AnyFn; };
  const coreV = (name: string): unknown => { const v = COREI.mod?.[name]; if (v === undefined) throw new AssertFail(`ยังไม่มี ${name} ใน trips-public-core (W1.1a ยังไม่สร้าง · ${COREI.err.slice(0, 80)})`); return v; };
  const P = (name: string): AnyFn => { const f = coreV(name); if (typeof f !== "function") throw new AssertFail(`${name} ไม่ใช่ฟังก์ชัน`); return f as AnyFn; };
  const sfn = (name: string): AnyFn => { const f = SVCI.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`ยังไม่มี ${name} ใน platform/trips-public (W1.1a ยังไม่สร้าง · ${SVCI.err.slice(0, 80)})`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = sfn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const VM = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.vm) ?? {}; };
  const limitOf = (name: string): { limit: number; windowMs: number } => { const v = asRec(coreV(name)) ?? {}; return { limit: Number(v.limit), windowMs: Number(v.windowMs) }; };
  let ipN = 0;
  const newIp = () => { ipN++; return `${IP_PREFIX}${(ipN >> 8) & 255}.${ipN & 255}`; };
  const ckOf = (ip: string): string => { const k = sfn("bookClientKey")(ip); if (typeof k !== "string") throw new AssertFail(`bookClientKey(${ip}) ไม่คืนสตริง: ${fmt(k)}`); usedClientKeys.push(k); return k; };
  const ck = () => ckOf(newIp());
  const realQuery = (sql: unknown): Promise<unknown[]> => { const f = prismaObj?.$queryRaw; if (typeof f !== "function") throw new AssertFail("ไม่มี prisma.$queryRaw"); return (f as AnyFn).call(prismaObj, sql) as Promise<unknown[]>; };
  const weeksDays = (vm: Rec) => (Array.isArray(vm.weeks) ? (vm.weeks as unknown[]).flatMap((w) => (Array.isArray(w) ? w : [])).filter((d) => d !== null).map((d) => asRec(d) ?? {}) : []);
  const dayOf = (vm: Rec, date: string) => weeksDays(vm).find((d) => d.date === date) ?? {};
  const noInternal = (vm: Rec, ids: string[], what: string) => {
    const bad = INTERNAL_KEYS.filter((k) => keysDeep(vm).has(k));
    ok(bad.length === 0, `${what}: VM มีคีย์ภายใน ${bad.join(", ")}`);
    const s = JSON.stringify(vm);
    const leak = ids.filter((i) => i && s.includes(i));
    ok(leak.length === 0, `${what}: VM มีค่า id ภายใน ${leak.slice(0, 3).join(", ")}`);
  };

  const seedProducts = await q<{ id: string; slug: string; status: string; productType: string }>(`SELECT id, slug, status, "productType" FROM "TripProduct" WHERE "tenantId" = $1 ORDER BY "publishedAt", id`, [DIVE_TENANT]).catch(() => []);
  const seedRacha = seedProducts.find((p) => p.slug === RACHA_SLUG);
  const seedWrites = async () => (await q<{ a: number; b: number; c: number; d: number }>(
    `SELECT (SELECT count(*) FROM "TripLinkStat" WHERE "tenantId" = $1)::int AS a, (SELECT count(*) FROM "ChatRateBucket" WHERE key LIKE $2 OR key LIKE $3)::int AS b,
            (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1)::int AS c, (SELECT count(*) FROM "OutboxEvent" WHERE "tenantId" = $1)::int AS d`, [DIVE_TENANT, `trips:book:${DIVE_TENANT}:%`, `trips:view:${U0}:%`]))[0];

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed andaman-dive ACTIVE + หน่วย TRIPS andaman-dive-trips ACTIVE", async () => {
    const r = await q<{ ts: string; us: string; slug: string }>(`SELECT t.status::text AS ts, u.status::text AS us, t.slug FROM "BusinessUnit" u JOIN "Tenant" t ON t.id = u."tenantId" WHERE u.id = $1 AND u."tenantId" = $2 AND u.type::text = 'TRIPS'`, [U0, DIVE_TENANT]);
    eq(r, [{ ts: "ACTIVE", us: "ACTIVE", slug: DIVE_SLUG }], "ร้าน/หน่วย seed");
  });
  await st("PC-2", "seed สินค้า: ทัวร์ ACTIVE 3 ตัว (ราชา · พีพี · ดำน้ำลึก) + Liveaboard ACTIVE 1 ตัว · ราชา ส. 14 พ.ย. GUARANTEED 24 ที่", async () => {
    eq(seedProducts.filter((p) => p.status === "ACTIVE" && p.productType === "TOUR").map((p) => p.slug).sort(), ["phiphi-khai-speedboat", "racha-noi-3-dives", RACHA_SLUG], "ทัวร์");
    eq(seedProducts.filter((p) => p.productType === "LIVEABOARD").map((p) => [p.slug, p.status]), [["similan-4-nights", "ACTIVE"]], "Liveaboard");
    const d = await q<{ status: string; capacity: number }>(`SELECT status, capacity FROM "TripDeparture" WHERE "productId" = $1 AND "localDate" = $2::date`, [seedRacha?.id ?? "", D14]);
    eq(d, [{ status: "GUARANTEED", capacity: R.capacity }], "รอบ 14 พ.ย.");
  });
  await st("PC-3", "ฟิกซ์เจอร์: TRIPS_AS_OF = 12 พ.ย. 2569 18:00 · ราชา 3,500 / 2,450 · อุทยาน 600 / 300 · กล้อง 500 · ทดลองดำน้ำ 1,900 · 08:00–16:30", () => {
    eq(AS_OF.toISOString(), "2026-11-12T11:00:00.000Z", "as-of");
    eq([R.adultSatang, R.childSatang, R.parkAdultSatang, R.parkChildSatang, R.extras.camera.satang, R.extras.introDive.satang, TIME_TEXT], [350_000, 245_000, 60_000, 30_000, 50_000, 190_000, "08:00–16:30"], "ราคา");
  });
  await st("PC-4", "บริการที่ใบนี้เรียกมีใน facade trips (listAvailability · quoteTripLine · localize · utcToLocal · normalizeTimezone) · core มี rateBucketCte · resolveSettings · branding มี getPublicBranding · trips-shared มี formatBaht/formatYmd", () => {
    for (const n of ["listAvailability", "quoteTripLine", "localize", "utcToLocal", "normalizeTimezone"]) tfn(n);
    ok(/export function rateBucketCte\b/.test(read("src/lib/core/rate-limit-db.ts")), "ไม่มี rateBucketCte");
    ok(typeof SET?.resolveSettings === "function", `ไม่มี resolveSettings (${SETI.err.slice(0, 60)})`);
    ok(/export async function getPublicBranding\b/.test(read("src/lib/branding/service.ts")), "ไม่มี getPublicBranding");
    const sh = read("src/components/trips/trips-shared.ts");
    ok(/export function formatBaht\b/.test(sh) && /export function formatYmd\b/.test(sh), "trips-shared ไม่มี formatBaht/formatYmd");
  });
  await st("PC-5", "TripLinkStat มีแล้ว (ไม่ต้อง migrate): คอลัมน์ครบ · ดัชนี unique (unitId, day, channel, linkId) NULLS NOT DISTINCT · CHECK channel/ตัวนับ ≥ 0 · ChatRateBucket.key unique", async () => {
    const c = (await cols("TripLinkStat")).map((x) => x.column_name);
    for (const n of ["id", "tenantId", "unitId", "day", "channel", "linkId", "agentAccountId", "views", "starts", "paid"]) ok(c.includes(n), `TripLinkStat ไม่มีคอลัมน์ ${n}`);
    const idx = await q<{ d: string }>(`SELECT indexdef AS d FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'TripLinkStat_unitId_day_channel_linkId_key'`);
    ok(/UNIQUE/.test(idx[0]?.d ?? "") && /NULLS NOT DISTINCT/.test(idx[0]?.d ?? ""), `ดัชนี unique: ${idx[0]?.d ?? "ไม่มี"}`);
    ok((await checkLits("TripLinkStat", "channel")).includes("WEB"), "CHECK channel ไม่มี WEB");
    const rb = await q<{ d: string }>(`SELECT indexdef AS d FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'ChatRateBucket' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%(key)%'`);
    ok(rb.length > 0, "ChatRateBucket.key ไม่ unique");
  });
  await st("PC-6", "สภาพก่อนงาน: proxy ส่ง X-Frame-Options DENY ทุกเส้นยกเว้น /f (หน้า /book ฝังไม่ได้) · checkRateLimitDb เป็น fail-open (เหตุที่ใบนี้ห้ามใช้) · SESSION_SECRET ของฐาน QC ยาว ≥ 32", () => {
    const px = read("src/proxy.ts");
    ok(/const framable = \/\^\\\/f\(\\\/\|\$\)\/\.test/.test(px) && /if \(!framable\) res\.headers\.set\("X-Frame-Options", "DENY"\)/.test(px), "proxy เปลี่ยนรูป (ตรวจกติกาฝังใหม่)");
    ok(/return \{ ok: true \};\s*\n\s*\}\s*\n\}/.test(read("src/lib/core/rate-limit-db.ts")), "checkRateLimitDb ไม่ใช่รูปเดิม");
    ok((process.env.SESSION_SECRET ?? "").length >= 32, "SESSION_SECRET ของ .env.qc-trips สั้น/ไม่มี");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์และกติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด (static) ──");
  const compFiles = walk(COMP);
  const appFiles = walk(APP);
  const uiSrc = [...compFiles, ...appFiles].map((f) => stripComments(read(f))).join("\n");
  const needOwn = () => { const miss = OWN.filter((f) => !existsSync(join(ROOT, f))); ok(miss.length === 0, `ไฟล์ของใบยังไม่ครบ: ${miss.slice(0, 4).join(", ")}${miss.length > 4 ? ` (+${miss.length - 4})` : ""}`); };
  await st("S-1", "ไฟล์เจ้าของครบ: trips-public-core · trips-public · public-catalog · หน้า [shop] · [shop]/t/[productSlug] · not-found · book-i18n · book.json ×2 · คอมโพเนนต์ src/components/book/Book*.tsx", () => {
    needOwn();
    ok(compFiles.some((f) => /^Book.*\.tsx$/.test(basename(f))), "ยังไม่มีคอมโพเนนต์ Book*.tsx");
    const odd = compFiles.filter((f) => !/^Book/.test(basename(f)) && basename(f) !== "book-i18n.ts");
    ok(odd.length === 0, `ไฟล์ใน components/book ต้องขึ้นต้น Book: ${odd.join(", ")}`);
  });
  await st("S-2", `ชื่อที่ส่งออกครบ: core ${CORE_NAMES.length} ชื่อ · platform ${SVC_FNS.length} ฟังก์ชัน · facade trips บล็อก "// TRIPS W1.1 ▸" มี loadPublicCatalog/loadPublicProduct · ไม่มี export *`, () => {
    for (const n of CORE_NAMES) coreV(n);
    for (const n of SVC_FNS) sfn(n);
    const src = read(FACADE);
    ok(/\/\/ TRIPS W1\.1 ▸/.test(src), "facade ไม่มีบล็อก // TRIPS W1.1 ▸");
    ok(!/export \* from/.test(src), "facade มี export *");
    for (const n of ["loadPublicCatalog", "loadPublicProduct"]) tfn(n);
  });
  await st("S-3", "trips-public-core เป็น pure: import ได้เฉพาะ import type · ไม่มี process.env / Date.now / new Date() ไม่มีอาร์กิวเมนต์ / getDay…getFullYear / fetch / prisma", () => {
    needOwn();
    const s = stripComments(read(CORE));
    const imps = [...s.matchAll(/^import\s+(?!type\b)[^;]*;/gm)].map((m) => m[0].slice(0, 60));
    ok(imps.length === 0, `มี import ค่า: ${imps.join(" | ")}`);
    for (const [re, what] of [[/process\.env/, "process.env"], [/Date\.now\(/, "Date.now"], [/new Date\(\s*\)/, "new Date()"], [/\.get(Day|Date|Hours|Month|FullYear|Minutes)\(/, "getDay…"], [/\bfetch\(/, "fetch"], [/prisma/, "prisma"]] as const) ok(!re.test(s), `core มี ${what}`);
  });
  await st("S-4", "src/app/book/** import เฉพาะ next/react/platform trips-public(-core)/components/book · ไม่มี prisma · ไม่มี @/lib/modules · ไม่มี @/lib/core · คอมโพเนนต์ book ไม่ import prisma/core/db/modules (ยกเว้น import type)", () => {
    needOwn();
    const bad: string[] = [];
    for (const f of appFiles) for (const m of stripComments(read(f)).matchAll(/from\s+["']([^"']+)["']/g)) {
      const s = m[1] ?? "";
      if (!(s === "react" || s.startsWith("next/") || s === "next" || s === "@/lib/platform/trips-public" || s === "@/lib/platform/trips-public-core" || s.startsWith("@/components/book/") || s.startsWith("./") || s.startsWith("../"))) bad.push(`${basename(f)} ← ${s}`);
    }
    ok(bad.length === 0, `import ต้องห้ามใน app/book: ${bad.slice(0, 5).join(" · ")}`);
    const bad2: string[] = [];
    for (const f of compFiles) for (const m of stripComments(read(f)).matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)) {
      const s = m[1] ?? "";
      if (/@prisma|@\/lib\/core\/db|@\/lib\/modules\//.test(s)) bad2.push(`${basename(f)} ← ${s}`);
    }
    ok(bad2.length === 0, `คอมโพเนนต์ import ค่าจากชั้นฐาน: ${[...new Set(bad2)].slice(0, 5).join(" · ")}`);
  });
  await st("S-5", "มติ X1 — หน้าไม่ส่งเวลา/ของภายในเข้าบริการ · ต่อไฟล์หน้า: open* ถูกห่อ cache() ของ React ตัวเดียว (อาร์กิวเมนต์เป็นค่าพื้นฐาน) และมีจุดเรียก openBook*( จุดเดียว · generateMetadata กับหน้าใช้ผลชุดเดียวกัน · ไม่มีตัวโหลด/ตัวแก้/ด่าน/ฐานนอก open* · ชื่อหน้าใช้ได้เฉพาะผลที่ ok · หน้าแจ้งไม่รับข้อมูลร้าน · ไม่มี loading/route/'use server'", () => {
    needOwn();
    const src = appFiles.map((f) => stripComments(read(f))).join("\n");
    for (const [re, what] of [[/\bnow\s*:/, "now:"], [/\bdeps\s*:/, "deps:"], [/new Date\(/, "new Date("], [/Date\.now\(/, "Date.now"], [/bookPageGate/, "bookPageGate ตรง"], [/["']use server["']/, "use server"],
      [/loadBook(Shop|Product)VM/, "loadBook*VM (ตัวโหลดนอกด่าน — มติ X1)"], [/resolveBookShop|bookFramePolicy|getPublicBranding|findPublicProduct|loadPublic(Catalog|Product)/, "ตัวแก้ร้าน/ตราสินค้า/ตัวอ่านสินค้า นอก open*"],
      [/clientIpFromHeaders\(|bookClientKey\(|canonicalClientIp\(/, "ตัวอ่าน IP/ทำกุญแจเอง (ต้องผ่าน bookRequestFromHeaders — มติ X2)"], [/x-forwarded-for|x-real-ip/i, "ชื่อหัว IP ในหน้า"]] as const) ok(!re.test(src), `app/book มี ${what}`);
    for (const [f, fn] of [[PAGE_INDEX, "openBookShop"], [PAGE_PRODUCT, "openBookProduct"]] as const) {
      const s = stripComments(read(f));
      const where = basename(dirname(f));
      ok(/import\s*\{[^}]*\bcache\b[^}]*\}\s*from\s*["']react["']/.test(s), `${where}: ไม่ได้ import cache จาก react`);
      // (1) ตัวห่อ cache() ตัวเดียว · อาร์กิวเมนต์เป็นสตริง/null เท่านั้น (object เช่น props ทำให้ cache ไม่ร่วมผลระหว่าง metadata กับหน้า ⇒ ด่าน/ตัวนับทำงานสองครั้ง)
      const wraps = [...s.matchAll(/const\s+(\w+)\s*=\s*cache\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g)];
      eq(wraps.length, 1, `${where}: จำนวนตัวห่อ cache(async (…) => {…})`);
      const cached = wraps[0]?.[1] ?? "";
      const params = (wraps[0]?.[2] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      const badParam = params.filter((x) => !/^\w+\s*:\s*string(\s*\|\s*null)?$/.test(x));
      ok(params.length > 0 && badParam.length === 0, `${where}: อาร์กิวเมนต์ของตัวห่อ cache ต้องเป็น string / string | null ทุกตัว: ${badParam.join(" · ") || "(ไม่มีอาร์กิวเมนต์)"}`);
      const start = (wraps[0]?.index ?? 0) + (wraps[0]?.[0].length ?? 0);
      const end = s.indexOf("\n});", start);
      ok(end > start, `${where}: หาจุดจบของตัวห่อ cache ไม่เจอ`);
      const body = s.slice(start, end);
      // (2) จุดเรียก open* จุดเดียวทั้งไฟล์ และอยู่ในตัวห่อ cache
      const calls = [...s.matchAll(/openBook(Shop|Product)\(/g)];
      eq([calls.length, calls[0]?.[0], (calls[0]?.index ?? -1) > start && (calls[0]?.index ?? -1) < end], [1, `${fn}(`, true], `${where}: จุดเรียก open* (ต้องมี ${fn}( จุดเดียว ในตัวห่อ cache)`);
      ok(/bookRequestFromHeaders\(/.test(body) && (s.match(/bookRequestFromHeaders\(/g) ?? []).length === 1, `${where}: ผู้ใช้คือใคร ต้องอ่านด้วย bookRequestFromHeaders จุดเดียวในตัวห่อ`);
      ok(/clientKey\s*:\s*\w+\.clientKey/.test(body), `${where}: clientKey ต้องมาจากผลของ bookRequestFromHeaders`);
      if (fn === "openBookProduct") ok(/countView\s*:\s*\w+\.countView/.test(body), `${where}: countView ต้องมาจากผลของ bookRequestFromHeaders (มติ X6)`);
      // (3) generateMetadata และหน้าใช้ผลชุดเดียวกัน (เรียกตัวห่อโดยตรง หรือผ่านตัวช่วยตัวเดียวกันที่เรียกตัวห่อ)
      const gm = s.match(/export async function generateMetadata[\s\S]*?\n\}/)?.[0] ?? "";
      const page = s.match(/export default async function \w+[\s\S]*?\n\}/)?.[0] ?? "";
      ok(gm && page, `${where}: ไม่พบ generateMetadata / หน้า`);
      const helpers = [...s.matchAll(/(?:^|\n)async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)].filter((m) => new RegExp(`\\b${cached}\\(`).test(m[2] ?? "")).map((m) => m[1] ?? "");
      const via = [cached, ...helpers].filter(Boolean);
      const used = (txt: string) => via.filter((n) => new RegExp(`await\\s+${n}\\(`).test(txt));
      ok(used(gm).length === 1 && used(page).length === 1 && used(gm)[0] === used(page)[0], `${where}: generateMetadata (${used(gm).join(",") || "ไม่เรียก"}) กับหน้า (${used(page).join(",") || "ไม่เรียก"}) ต้องเรียกทางเดียวกันสู่ตัวห่อ cache`);
      ok((s.match(new RegExp(`\\b${cached}\\(`, "g")) ?? []).length === 1 || helpers.length === 0, `${where}: ตัวห่อ cache ถูกเรียกหลายจุดด้วยอาร์กิวเมนต์ที่อาจต่างกัน`);
      for (const [name, txt] of [["generateMetadata", gm], ["หน้า", page]] as const) ok(!/\bheaders\(|openBook/.test(txt), `${where}: ${name} อ่านหัว/เปิดเองนอกตัวห่อ cache`);
      // (4) ชื่อหน้า: ผลไม่ ok ⇒ ไม่มี title เลย · title อ้างได้เฉพาะ .vm.
      ok(/\.ok\b/.test(gm), `${where}: generateMetadata ไม่ตรวจ .ok`);
      const titles = [...gm.matchAll(/\btitle\s*(?::|=)\s*([^\n;]*)/g)].map((m) => m[1] ?? "");
      const firstTitle = gm.search(/\btitle\b/), guard = gm.search(/\.ok\b/);
      ok(titles.length > 0 && firstTitle > guard, `${where}: title ต้องอยู่หลังการตรวจ .ok`);
      ok(/if\s*\(\s*!\w+\.ok\s*\)\s*return\s+NO_INDEX\s*;|\.ok\s*\?[\s\S]*?\}\s*:\s*NO_INDEX\s*;/.test(gm), `${where}: ผลไม่ ok ต้องคืน metadata ที่ไม่มีชื่อ (NO_INDEX)`);
      const noIdx = s.match(/const NO_INDEX[^=]*=\s*(\{[^\n]*\});/)?.[1] ?? "";
      ok(/robots\s*:\s*\{\s*index\s*:\s*false\s*,\s*follow\s*:\s*false\s*\}/.test(noIdx) && !/title|description|openGraph/.test(noIdx), `${where}: NO_INDEX ต้องมีแค่ robots noindex: ${noIdx}`);
      ok(!/\b(shop|productSlug)\b/.test(gm.replace(/\.vm\.shop\b/g, "").replace(/\.vm\.product\b/g, "")), `${where}: generateMetadata ใช้ shop/productSlug ดิบ (ชื่อจาก URL ไม่ผ่านด่าน)`);
      // (5) หน้าไม่ ok: notFound() หรือหน้าแจ้งที่ไม่รับ prop
      ok(/notFound\(\)/.test(page), `${f}: ไม่เรียก notFound()`);
      ok(/<BookRateLimited\s*\/>/.test(page), `${f}: หน้าถูกจำกัดต้องเป็น <BookRateLimited /> ไม่มี prop`);
      ok(/await\s+(props\.)?params|await\s+(props\.)?searchParams/.test(s), `${f}: ต้อง await params/searchParams (Next 16)`);
    }
    for (const [f, name] of [[`${COMP}/BookRateLimited.tsx`, "BookRateLimited"], [`${COMP}/BookNotFound.tsx`, "BookNotFound"]] as const) {
      const c = stripComments(read(f));
      ok(new RegExp(`export function ${name}\\(\\s*\\)`).test(c), `${name} ต้องไม่รับ prop (ไม่มีข้อมูลร้าน)`);
      ok(!/\bvm\b|\bbrand\b|\bshop\b|publicThemeStyle|logoUrl/.test(c), `${name} อ้างข้อมูลร้าน/ตราสินค้า`);
    }
    ok(/<BookNotFound\s*\/>/.test(stripComments(read(PAGE_NF))), "not-found.tsx ต้องเป็น <BookNotFound /> ไม่มี prop");
    const extra = [...appFiles, ...(existsSync(join(ROOT, APP)) ? readdirSync(join(ROOT, APP), { recursive: true }).map(String) : [])].filter((f) => /(^|\/)(loading|route)\.(tsx|ts)$/.test(f));
    ok(extra.length === 0, `ห้ามมี loading/route ใต้ app/book: ${extra.join(", ")}`);
  });
  await st("S-6", "ไฟล์ฐานของใบ: ไม่มี $transaction · ไม่มี checkRateLimitDb( / checkRateLimitDbMany( · ไม่มี console.* · ไม่มีคำว่า \"unknown\" เป็นค่าถัง · public-catalog ไม่ import prisma ตรงและไม่มีคำสั่งเขียน", () => {
    needOwn();
    for (const f of [SVC, CATALOG, CORE]) {
      const s = stripComments(read(f));
      for (const [re, what] of [[/\$transaction/, "$transaction"], [/checkRateLimitDb(Many)?\(/, "checkRateLimitDb"], [/console\.(log|info|warn|error|debug)\(/, "console.*"], [/["'`]unknown["'`]/, "\"unknown\""]] as const) ok(!re.test(s), `${basename(f)} มี ${what}`);
    }
    const c = stripComments(read(CATALOG));
    ok(!/from\s+["']@\/lib\/core\/db["']/.test(c) && !/@prisma\/client["'];?\s*$/m.test(c.split("\n").filter((l) => /^import\s+(?!type)/.test(l)).join("\n")), "public-catalog import prisma ตรง");
    ok(!/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|INSERT INTO|UPDATE\s+"|DELETE FROM/.test(c), "public-catalog มีคำสั่งเขียน");
    const sv = stripComments(read(SVC));
    ok((sv.match(/INSERT INTO "TripLinkStat"/g) ?? []).length === 1, "trips-public ต้องมี INSERT INTO \"TripLinkStat\" ที่เดียว (คำสั่งของด่าน)");
    ok(!/"Agent[A-Z]\w*"|agentLink\.|agentAccount\./.test(sv + c), "ไฟล์ของใบอ่าน/เขียนตารางเอเจนซี่ตรง");
  });
  await st("S-7", "จอ: ไม่คิดเงิน/ไม่จัดรูปเงินเอง (toFixed · toLocaleString · parseFloat · Intl.NumberFormat · Satang / 100) · ใช้ formatBaht · ไม่มี dangerouslySetInnerHTML · ไม่มี new Date( ในคอมโพเนนต์", () => {
    needOwn();
    for (const [re, what] of [[/\.toFixed\(/, "toFixed"], [/\.toLocaleString\(/, "toLocaleString"], [/parseFloat\(/, "parseFloat"], [/Intl\.NumberFormat/, "Intl.NumberFormat"], [/Satang\s*[/*+-]\s*\d|Satang\s*[*+]\s*\w/, "คิดเลขกับ Satang"],
      [/dangerouslySetInnerHTML/, "dangerouslySetInnerHTML"], [/new Date\(/, "new Date("], [/Date\.now\(/, "Date.now"]] as const) ok(!re.test(uiSrc), `จอมี ${what}`);
    ok(/formatBaht\(/.test(uiSrc), "จอไม่ใช้ formatBaht");
    ok(/publicThemeStyle\(/.test(uiSrc), "จอไม่ใช้ publicThemeStyle (ตราสินค้า)");
    ok(/\blang=\{/.test(uiSrc), "ไม่มี lang={locale} ที่กล่องหน้า");
  });
  await st("S-8", `data-testid ครบ ${TESTIDS_FIXED.length} ตัว + ${TESTID_PATTERNS.length} แพตเทิร์น · ปุ่มหลัก book-cta เป็น disabled · ลิงก์ในจอสร้างด้วย bookHref`, () => {
    needOwn();
    const miss = TESTIDS_FIXED.filter((t) => !new RegExp(`["'\`]${t}["'\`]`).test(uiSrc));
    ok(miss.length === 0, `ไม่มี testid: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` (+${miss.length - 8})` : ""}`);
    const missP = TESTID_PATTERNS.filter((t) => !uiSrc.includes(`\`${t}\${`));
    ok(missP.length === 0, `ไม่มีแพตเทิร์น testid: ${missP.join(", ")}`);
    ok(/data-testid="book-cta"[^>]*\bdisabled\b|\bdisabled\b[^>]*data-testid="book-cta"/.test(uiSrc), "book-cta ต้อง disabled");
    ok(/bookHref\(/.test(uiSrc), "จอไม่ใช้ bookHref");
    ok(!/href=\{?[`"']\/book\//.test(uiSrc), "มีลิงก์ /book/ ที่ประกอบเอง (ต้องผ่าน bookHref)");
  });
  await st("S-9", "ไม่มีรหัสดิบ/รหัสใบงานเป็นข้อความบนจอ: JSX ไม่มีตัวอักษร OPEN/LOW/NOT_RUNNING/PER_PAX/INCLUDED/RATE_LIMITED/NOT_FOUND เป็นเนื้อความ · ไม่มี W1.x/T0.x/OQn ในซอร์สจอและ book.json", () => {
    needOwn();
    const txt = [...uiSrc.matchAll(/>([^<>{}]+)</g)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
    const raw = txt.filter((t) => /\b(OPEN|LOW|FULL|CLOSED|NOT_RUNNING|PER_PAX|PER_BOOKING|INCLUDED|ADDED|RATE_LIMITED|NOT_FOUND|ADULT|CHILD|INFANT)\b/.test(t));
    ok(raw.length === 0, `ข้อความดิบใน JSX: ${raw.slice(0, 3).join(" | ")}`);
    const hard = txt.filter((t) => /[ก-๙]/.test(t));
    ok(hard.length === 0, `ข้อความไทยฝังใน JSX (ต้องมาจาก book.json): ${hard.slice(0, 3).join(" | ")}`);
    const vals = [...Object.values(flat(JSON.parse(read(MSG_TH) || "{}"))), ...Object.values(flat(JSON.parse(read(MSG_EN) || "{}")))].map(String);
    const codes = vals.filter((v) => /\b([WTAKLSX]\d\.\d+[abc]?|OQ\d+)\b/.test(v) || /\b(NOT_RUNNING|PER_PAX|RATE_LIMITED|LIMITER_DOWN|NO_CLIENT)\b/.test(v));
    ok(codes.length === 0, `book.json มีรหัส: ${codes.slice(0, 3).join(" | ")}`);
  });
  await st("S-10", `ฉากภาพ w1.1 ใน scripts/visual-trips.mts: ${VISUAL_SCENES.join(" · ")} · มีธง public (ไม่ใส่คุกกี้) + expectStatus 404 + x-forwarded-for · parity-trips.sh รับ 19 และ 01`, () => {
    const v = read("scripts/visual-trips.mts");
    ok(/["']w1\.1["']\s*:/.test(v), "ไม่มีสเปก w1.1");
    const miss = VISUAL_SCENES.filter((n) => !new RegExp(`name:\\s*["']${n}["']`).test(v));
    ok(miss.length === 0, `ไม่มีฉาก: ${miss.join(", ")}`);
    ok(/public\??:\s*(true|boolean)/.test(v) && /expectStatus/.test(v) && /x-forwarded-for/.test(v), "ไม่มี public / expectStatus / x-forwarded-for");
    const p = read("scripts/parity-trips.sh");
    ok(/19\)\s*NAME="19-customer-desktop-en"/.test(p) && /01\)\s*NAME="01-tour-customer"/.test(p), "parity-trips.sh ยังไม่รับ 19/01");
  });
  await st("S-11", "ไม่มี 'any' · ไม่มี @ts-ignore/@ts-expect-error/eslint-disable ในไฟล์ของใบ", () => {
    needOwn();
    for (const f of [CORE, SVC, CATALOG, I18N, ...compFiles, ...appFiles]) {
      const s = stripComments(read(f));
      ok(!/:\s*any\b|\bas any\b|<any>/.test(s), `${f} มี any`);
      ok(!/@ts-ignore|@ts-expect-error|eslint-disable/.test(read(f)), `${f} มี ts-ignore/eslint-disable`);
    }
  });
  await st("S-12", `ขอบเขต (เทียบ BASE ${BASE_SHA.slice(0, 9)} · ไม่นับไฟล์ที่ตรงกับ session/trips): ไม่แตะ prisma/proxy/core/i18n/branding/payment/api/app อื่น/platform อื่น/โมดูลอื่น/trips.json/components/trips/ข้อสอบเดิม/seed · facade เพิ่มอย่างเดียว`, () => {
    needOwn();
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", `หา BASE ${BASE_SHA} ไม่เจอ`);
    const sameAsSession = (f: string) => git(["diff", "--name-only", "session/trips", "--", f]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", f]).trim() === "";
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...FORBIDDEN_PATHS]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...FORBIDDEN_PATHS]).split("\n")].filter(Boolean))];
    const touched = changed.filter((f) => !sameAsSession(f));
    ok(touched.length === 0, `แตะไฟล์ต้องห้าม: ${touched.slice(0, 6).join(", ")}`);
    const over: string[] = [];
    for (const [f, maxDel, maxAdd] of LIMITED) {
      const line = git(["diff", "--numstat", BASE_SHA, "--", f]).trim();
      if (!line || sameAsSession(f)) continue;
      const [a, d] = line.split("\t").map(Number);
      if ((d ?? 0) > maxDel || (maxAdd !== null && (a ?? 0) > maxAdd)) over.push(`${f} +${a}/−${d} (ได้ +${maxAdd ?? "∞"}/−${maxDel})`);
    }
    ok(over.length === 0, over.join(" · "));
    ok(git(["diff", "--name-only", BASE_SHA, "--", "prisma/migrations"]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", "prisma"]).trim() === "", "มี migration/ไฟล์ prisma ใหม่");
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (trips-public-core) ──");
  await st("P-1", "ค่าคงที่: ภาษา th/en · สภาพวัน 7 ค่าตามลำดับ · ช่องทาง WEB/LIFF/EMBED · เพดานอ่าน 60..300 ต่อ 60 วิ · เพดานเดา 20..60 ต่อ 10 นาที · นับ 1 ครั้ง/เครื่อง/วัน · เพดานแถว 1e5..1e7 · การ์ด 20..100 · 12 เดือน", () => {
    eq([coreV("BOOK_LOCALES"), coreV("BOOK_DAY_STATES"), coreV("BOOK_PUBLIC_CHANNELS"), coreV("BOOK_VIEW_PER_CLIENT_DAY"), coreV("BOOK_MONTHS_AHEAD")], [["th", "en"], DAY_STATES, ["WEB", "LIFF", "EMBED"], 1, 12], "ค่าคงที่");
    const r = limitOf("BOOK_READ_LIMIT"), m = limitOf("BOOK_MISS_LIMIT");
    ok(Number.isInteger(r.limit) && r.limit >= 60 && r.limit <= 300 && r.windowMs === 60_000, `BOOK_READ_LIMIT ${fmt(r)}`);
    ok(Number.isInteger(m.limit) && m.limit >= 20 && m.limit <= 60 && m.windowMs === 600_000, `BOOK_MISS_LIMIT ${fmt(m)}`);
    const cap = Number(coreV("BOOK_STAT_ROW_CAP")), pc = Number(coreV("BOOK_PRODUCT_CAP"));
    ok(Number.isInteger(cap) && cap >= 100_000 && cap <= 10_000_000, `BOOK_STAT_ROW_CAP ${cap}`);
    ok(Number.isInteger(pc) && pc >= 20 && pc <= 100, `BOOK_PRODUCT_CAP ${pc}`);
    const re = coreV("BOOK_CODE_RE");
    ok(re instanceof RegExp && re.test("PTD_1-a") && !re.test("") && !re.test("a b") && !re.test("x".repeat(33)) && !re.test("../x"), "BOOK_CODE_RE");
  });
  await st("P-2", "bookLocaleOf: lang ตรงตัวชนะ · Accept-Language เรียง q · แท็กแรกที่เป็น th/en · มีหัวแต่ไม่มีทั้งคู่ ⇒ en · ไม่มีหัว ⇒ th · q=0 ทิ้ง", () => {
    const f = P("bookLocaleOf");
    eq([f("en", "th-TH"), f("th", "en-US"), f("EN", "th"), f(null, "th-TH,th;q=0.9,en;q=0.8"), f(undefined, "en-GB,en;q=0.9,th;q=0.5"), f("xx", "de-DE,de;q=0.9"), f(null, "de;q=0.9, th;q=0.95"), f(null, "de, th;q=0.4, en;q=0.6"),
      f(null, null), f(null, ""), f(null, 42), f(["en"], "th"), f(null, "th;q=0, fr")],
      ["en", "th", "th", "th", "en", "en", "th", "en", "th", "th", "th", "th", "en"], "ภาษา");
  });
  await st("P-3", "canonicalClientIp: IPv4 (ตัดพอร์ต/ช่องว่าง) · IPv4-mapped · IPv6 รวม /64 (ตัวเล็ก ไม่มีศูนย์นำ · วงเล็บ/พอร์ต/zone) · ขยะ/unknown/ว่าง/มีจุลภาค/ไม่ใช่สตริง ⇒ null", () => {
    const f = P("canonicalClientIp");
    eq([f("203.0.113.7"), f(" 203.0.113.7:4431 "), f("::ffff:203.0.113.7"), f("[2001:db8:1:2:aaaa:bbbb:cccc:dddd]:443"), f("2001:0DB8:0001:0002::1"), f("2001:db8:1:3::1"), f("fe80::1%eth0"), f("::1")],
      ["203.0.113.7", "203.0.113.7", "203.0.113.7", "2001:db8:1:2::/64", "2001:db8:1:2::/64", "2001:db8:1:3::/64", "fe80:0:0:0::/64", "0:0:0:0::/64"], "ถูก");
    eq([f(""), f("unknown"), f("abc"), f("999.1.1.1"), f("1.2.3"), f("1.2.3.4, 5.6.7.8"), f(null), f(undefined), f(42), f("2001:db8::1::2"), f("gggg::1"), f("' OR 1=1 --")].map((x) => x === null), Array(12).fill(true), "ผิด ⇒ null");
  });
  await st("P-4", "clientIpFromHeaders: ลำดับ x-real-ip → x-vercel-forwarded-for → x-forwarded-for · ใช้ตัวแรกก่อนจุลภาค · หัวแรกที่มีค่าเป็นตัวตัดสิน (ผิดรูป ⇒ null ไม่ไล่ต่อ) · ไม่มีหัว ⇒ null (ไม่มี unknown)", () => {
    const f = P("clientIpFromHeaders");
    const h = (o: Record<string, string>) => (n: string) => o[n.toLowerCase()] ?? null;
    eq([f(h({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" })), f(h({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.9" })), f(h({ "x-vercel-forwarded-for": "2001:db8:a:b::9", "x-forwarded-for": "198.51.100.9" })),
      f(h({ "x-real-ip": "garbage", "x-forwarded-for": "198.51.100.9" })), f(h({})), f(h({ "x-forwarded-for": "unknown" })), f(h({ "x-real-ip": "", "x-forwarded-for": " 198.51.100.9 " })), f(() => undefined)],
      ["198.51.100.9", "203.0.113.5", "2001:db8:a:b::/64", null, null, null, "198.51.100.9", null], "IP");
  });
  await st("P-5", "parseBookQuery: lang th|en · a/s ตามรูป · d วันที่มีจริง · m YYYY-MM · array/ชนิดอื่น/ผิดรูป ⇒ null · ไม่ throw กับขยะ", () => {
    const f = P("parseBookQuery");
    eq(f({ lang: "en", a: "PTD1", s: "mint_01", d: "2026-11-14", m: "2026-11", x: "1" }), { lang: "en", a: "PTD1", s: "mint_01", d: "2026-11-14", m: "2026-11" }, "ปกติ");
    const nul = { lang: null, a: null, s: null, d: null, m: null };
    eq(f({ lang: "zh", a: "../etc", s: "x".repeat(33), d: "2026-02-30", m: "2026-13" }), nul, "ผิดรูป");
    eq(f({ lang: ["en"], a: ["A", "B"], s: 5, d: null, m: {} }), nul, "ชนิดผิด");
    eq([f(null), f(undefined), f("x"), f(7), f([])], [nul, nul, nul, nul, nul], "ขยะ");
    eq(f({ a: "a b", d: "2026-11-14T00:00", m: "2026-1" }), nul, "รูปใกล้เคียง");
    eq(asRec(f({ d: "2028-02-29" }))?.d, "2028-02-29", "ปีอธิกสุรทิน");
  });
  await st("P-6", "bookHref: path เข้ารหัส · query ลำดับ lang,a,m,d · ค่าว่างไม่ใส่ · ไม่มีค่า ⇒ ไม่มี ?", () => {
    const f = P("bookHref");
    eq([f("andaman-dive", null), f("andaman-dive", null, {}), f("andaman-dive", RACHA_SLUG, { d: "2026-11-14", m: "2026-11", a: "PTD1", lang: "en" }), f("andaman-dive", RACHA_SLUG, { lang: null, a: "", d: "2026-11-14" }), f("a b", "x/y?z", { lang: "th" })],
      ["/book/andaman-dive", "/book/andaman-dive", `/book/andaman-dive/t/${RACHA_SLUG}?lang=en&a=PTD1&m=2026-11&d=2026-11-14`, `/book/andaman-dive/t/${RACHA_SLUG}?d=2026-11-14`, "/book/a%20b/t/x%2Fy%3Fz?lang=th"], "ลิงก์");
  });
  await st("P-7", "monthGrid: อาทิตย์ก่อน · พ.ย. 2026 = 5 แถว เริ่ม 1 · ก.พ. 2026 = 4 แถว · ส.ค. 2026 = 6 แถว · ก.พ. 2028 มี 29 · เทียบกับการคำนวณ UTC อิสระทุกเดือนของปี 2027 · ผิดรูป ⇒ null", () => {
    const f = P("monthGrid");
    const exp = (month: string) => {
      const [y, m] = month.split("-").map(Number) as [number, number];
      const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
      while (cells.length % 7) cells.push(null);
      return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
    };
    const nov = f("2026-11") as (string | null)[][];
    eq([nov?.length, nov?.[0]?.[0], nov?.[4]], [5, "2026-11-01", ["2026-11-29", "2026-11-30", null, null, null, null, null]], "พ.ย. 2026");
    eq([(f("2026-02") as unknown[])?.length, (f("2026-08") as unknown[])?.length], [4, 6], "จำนวนแถว");
    ok(JSON.stringify(f("2028-02")).includes("2028-02-29"), "ก.พ. 2028");
    for (let m = 1; m <= 12; m++) { const k = `2027-${String(m).padStart(2, "0")}`; eq(f(k), exp(k), k); }
    eq([f("2026-13"), f("2026-1"), f("x"), f("2026-00")], [null, null, null, null], "ผิดรูป");
  });
  await st("P-8", "clampMonth: ในช่วง [เดือนนี้, +12] ⇒ ค่าเดิม · ก่อน/เกิน/ผิดรูป/ไม่ใช่สตริง ⇒ เดือนของวันนี้ · ข้ามปีถูก", () => {
    const f = P("clampMonth");
    eq([f("2026-11", "2026-11-12"), f("2026-12", "2026-11-12"), f("2027-11", "2026-11-12"), f("2027-12", "2026-11-12"), f("2026-10", "2026-11-12"), f("x", "2026-11-12"), f(null, "2026-11-12"), f("2026-13", "2026-11-12"), f("2027-01", "2026-12-31"), f(["2026-12"], "2026-11-12")],
      ["2026-11", "2026-12", "2027-11", "2026-11", "2026-11", "2026-11", "2026-11", "2026-11", "2027-01", "2026-11"], "เดือน");
  });
  await st("P-9", "dayCellOf (มติ X4 · X7): ผ่านแล้ว · ไม่มีรอบ · ว่าง · เหลือน้อย · เต็ม · ไม่ออกเดินทาง (ยกเลิกทุกรอบ) · ปิดรับ · หลายรอบ = เลขและ showLeft ของรอบที่ออกเร็วที่สุดที่ขายได้ (อาร์เรย์เรียงเวลาออก · ไม่ใช่รอบที่ว่างมากสุด · ไม่รวมข้ามรอบ) · รอบสถานะ FULL = เต็ม · เลขติดลบ = 0", () => {
    const f = P("dayCellOf");
    const s = (status: string, publicLeft: number, saleBlock: string | null, showLeft = false) => ({ status, publicLeft, saleBlock, showLeft });
    const T = "2026-11-12";
    eq([f([s("OPEN", 9, null)], "2026-11-11", T), f([], "2026-11-14", T), f([s("OPEN", 9, null)], "2026-11-14", T), f([s("OPEN", 3, null, true)], "2026-11-15", T), f([s("OPEN", 0, null)], "2026-11-15", T),
      f([s("CANCELLED", 0, "STATUS")], "2026-11-13", T), f([s("CLOSED", 0, "STATUS")], T, T), f([s("OPEN", 0, "CUTOFF")], "2026-11-13", T), f([s("OPEN", 0, "STOP_SELL")], "2026-11-13", T), f([s("OPEN", 14, null)], T, T)],
      [{ state: "PAST", left: null }, { state: "NONE", left: null }, { state: "OPEN", left: 9 }, { state: "LOW", left: 3 }, { state: "FULL", left: 0 }, { state: "NOT_RUNNING", left: null }, { state: "CLOSED", left: null },
        { state: "CLOSED", left: null }, { state: "CLOSED", left: null }, { state: "OPEN", left: 14 }], "รอบเดียว");
    eq([f([s("OPEN", 0, null), s("OPEN", 5, null, true), s("OPEN", 12, null)], "2026-11-14", T), f([s("OPEN", 2, null, true), s("OPEN", 4, null, true)], "2026-11-14", T), f([s("CANCELLED", 0, "STATUS"), s("OPEN", 0, "CUTOFF")], "2026-11-14", T),
      f([s("CANCELLED", 0, "STATUS"), s("CANCELLED", 0, "STATUS")], "2026-11-14", T), f([s("CANCELLED", 0, "STATUS"), s("OPEN", 0, null)], "2026-11-14", T), f([s("OPEN", -2, null)], "2026-11-14", T), f([s("OPEN", 7, "CUTOFF"), s("OPEN", 1, null, true)], "2026-11-14", T)],
      [{ state: "LOW", left: 5 }, { state: "LOW", left: 2 }, { state: "CLOSED", left: null }, { state: "NOT_RUNNING", left: null }, { state: "FULL", left: 0 }, { state: "FULL", left: 0 }, { state: "LOW", left: 1 }], "หลายรอบ = รอบแรกที่ขายได้");
    eq([f([s("OPEN", 30, null), s("OPEN", 3, null, true)], "2026-11-14", T), f([s("OPEN", 3, null, true), s("OPEN", 30, null)], "2026-11-14", T), f([s("CANCELLED", 0, "STATUS"), s("OPEN", 30, null), s("OPEN", 40, null)], "2026-11-14", T)],
      [{ state: "OPEN", left: 30 }, { state: "LOW", left: 3 }, { state: "OPEN", left: 30 }], "ลำดับเวลาออกเป็นตัวตัดสิน (ไม่ใช่จำนวนที่ว่าง)");
    eq([f([s("FULL", 0, "STATUS")], "2026-11-14", T), f([s("FULL", 0, "STATUS"), s("CANCELLED", 0, "STATUS")], "2026-11-14", T), f([s("FULL", 0, "STATUS"), s("OPEN", 6, null)], "2026-11-14", T), f([s("FULL", 0, "STATUS")], "2026-11-11", T)],
      [{ state: "FULL", left: 0 }, { state: "FULL", left: 0 }, { state: "OPEN", left: 6 }, { state: "PAST", left: null }], "รอบที่ร้านปิดเป็นเต็ม (มติ X7)");
  });
  await st("P-10", "frameAncestorsOf: ว่าง/ขยะ ⇒ 'none' · โดเมนถูกรูป ⇒ https://… ตัวเล็ก ตัดซ้ำ · ทิ้งตัวที่มี scheme/path/ช่องว่าง/*/;/'self' · ไม่เกิน 20 · ผลไม่มี * http: ; เลย", () => {
    const f = P("frameAncestorsOf");
    const NONE = "frame-ancestors 'none'";
    eq([f([]), f(null), f("andamandive.com"), f({}), f(["*", "https://a.com", "a.com/x", "a b.com", "'self'", "a.com; script-src *", "localhost", "*.a.com", 5])], [NONE, NONE, NONE, NONE, NONE], "ปิด");
    eq(f(["andamandive.com", "Book.AndamanDive.com", "andamandive.com", "*"]), "frame-ancestors https://andamandive.com https://book.andamandive.com", "เปิด");
    const many = String(f(Array.from({ length: 30 }, (_, i) => `d${i}.example.com`)));
    eq(many.split(" ").length - 1, 20, "ไม่เกิน 20");
    ok(!/[*;]|http:/.test(many + String(f(["x.com", "*", "http://y.com"]))), "มีอักขระอันตรายหลุด");
  });
  await st("P-11", "embedOriginAllowed: https + host ตรงตัวเท่านั้น · http / พอร์ต / โดเมนย่อย / ชื่อคล้าย / ต่อท้าย / มี path / userinfo / \"null\" / ไม่มี scheme ⇒ false", () => {
    const f = P("embedOriginAllowed");
    const D = ["andamandive.com", "book.andamandive.com"];
    eq([f("https://andamandive.com", D), f("https://ANDAMANDIVE.com", D), f("https://book.andamandive.com", D)], [true, true, true], "ผ่าน");
    eq(["http://andamandive.com", "https://andamandive.com:8443", "https://www.andamandive.com", "https://evilandamandive.com", "https://andamandive.com.evil.io", "https://andamandive.com/x", "https://u@andamandive.com", "null", "", "andamandive.com", "//andamandive.com",
      "https://andamandive.com.", "javascript:alert(1)"].map((o) => f(o, D)), Array(13).fill(false), "ไม่ผ่าน");
    eq([f(null, D), f(5, D), f("https://andamandive.com", []), f("https://andamandive.com", null), f("https://andamandive.com", ["*"])], [false, false, false, false, false], "ขยะ");
  });
  groupLine("P");

  // ═══════════════ LG. ภาษา ═══════════════
  console.log("\n── LG: ภาษา (book.json ไทย + อังกฤษ) ──");
  const msgs = () => { needOwn(); return { th: flat(JSON.parse(read(MSG_TH))), en: flat(JSON.parse(read(MSG_EN))) }; };
  await st("LG-1", "book.json สองภาษาชุดคีย์เท่ากัน · ทุกค่าเป็นสตริงไม่ว่าง · ค่าอังกฤษไม่มีอักษรไทย (ยกเว้น shell.langTh) · ค่าไทยของข้อความหลักมีอักษรไทย", () => {
    const m = msgs();
    eq(Object.keys(m.th).sort(), Object.keys(m.en).sort(), "ชุดคีย์");
    const empty = [...Object.entries(m.th), ...Object.entries(m.en)].filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
    ok(empty.length === 0, `ค่าว่าง/ไม่ใช่สตริง: ${empty.slice(0, 5).join(", ")}`);
    const thInEn = Object.entries(m.en).filter(([k, v]) => k !== "shell.langTh" && /[ก-๙]/.test(String(v))).map(([k]) => k);
    ok(thInEn.length === 0, `ค่าอังกฤษมีอักษรไทย: ${thInEn.slice(0, 5).join(", ")}`);
    for (const k of ["notFound.title", "rate.body", "cta.notYet", "day.NOT_RUNNING", "price.vat.INCLUDED", "product.untranslated"]) ok(/[ก-๙]/.test(String(m.th[k] ?? "")), `ค่าไทยของ ${k} ไม่มีอักษรไทย`);
    const same = Object.keys(m.th).filter((k) => !/^(weekday|month|shell\.lang)/.test(k) && m.th[k] === m.en[k]);
    ok(same.length === 0, `ค่าไทย = อังกฤษ (ยังไม่แปล): ${same.slice(0, 5).join(", ")}`);
  });
  await st("LG-2", `คีย์ขั้นต่ำครบทั้งสองภาษา (${I18N_REQUIRED.length} คีย์ + ${I18N_RULED.length} คีย์ของมติ r2) · มติ X10: คีย์ที่ไม่ใช้ถูกลบ (${I18N_REMOVED.join(" · ")}) และทุกคีย์ใน book.json มีที่ใช้ในจอ`, () => {
    const m = msgs();
    const miss = [...I18N_REQUIRED, ...I18N_RULED].filter((k) => typeof m.th[k] !== "string" || typeof m.en[k] !== "string");
    ok(miss.length === 0, `ขาด: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` (+${miss.length - 8})` : ""}`);
    const back = I18N_REMOVED.filter((k) => k in m.th || k in m.en);
    ok(back.length === 0, `คีย์ที่มติ X10 ให้ลบยังอยู่: ${back.join(", ")}`);
    // ทุกคีย์ต้องมีที่ใช้: ตัวอักษรตรงตัวในซอร์สจอ/book-i18n หรือประกอบจากคำนำหน้า `prefix.${…}`
    const ui = `${uiSrc}\n${stripComments(read(I18N))}`;
    const dyn = new Set([...ui.matchAll(/\`([a-zA-Z]+(?:\.[a-zA-Z]+)*)\.\$\{/g)].map((x) => x[1] ?? ""));
    const unused = Object.keys(m.th).filter((k) => !ui.includes(`"${k}"`) && !ui.includes(`'${k}'`) && !ui.includes(`\`${k}\``) && !dyn.has(k.slice(0, k.lastIndexOf("."))));
    ok(unused.length === 0, `คีย์ที่ไม่มีที่ใช้ในจอ: ${unused.slice(0, 8).join(", ")}${unused.length > 8 ? ` (+${unused.length - 8})` : ""}`);
  });
  await st("LG-3", "bookT: คืนข้อความจริงของทุกคีย์ขั้นต่ำทั้งสองภาษา · locale ไม่รู้จัก ⇒ ไทย · แทนตัวแปร {n} · bookDateNames ไทย พ.ศ. (543) อังกฤษ ค.ศ. (0) มี 7 วัน 12 เดือน", () => {
    const m = msgs();
    const bt = I18I.mod?.bookT, dn = I18I.mod?.bookDateNames;
    ok(typeof bt === "function" && typeof dn === "function", `ยังไม่มี bookT/bookDateNames (${I18I.err.slice(0, 80)})`);
    const T = (l: string) => (bt as AnyFn)(l) as (k: string, v?: Rec) => string;
    const bad = I18N_REQUIRED.filter((k) => T("th")(k) !== m.th[k] || T("en")(k) !== m.en[k]);
    ok(bad.length === 0, `bookT ไม่ตรงไฟล์: ${bad.slice(0, 5).join(", ")}`);
    eq(T("zz")("notFound.title"), m.th["notFound.title"], "locale แปลก");
    const withN = I18N_REQUIRED.find((k) => /\{n\}/.test(String(m.th[k])));
    ok(withN, "ไม่มีคีย์ที่ใช้ {n} (day.OPEN / product.capacity ต้องรับจำนวน)");
    for (const k of ["day.OPEN", "day.LOW", "product.capacity", "slot.count", "slot.more"]) ok(/\{n\}/.test(String(m.th[k])) && /\{n\}/.test(String(m.en[k])), `${k} ต้องรับ {n} ทั้งสองภาษา`);
    ok(T("th")(String(withN), { n: 18 }).includes("18") && !T("th")(String(withN), { n: 18 }).includes("{n}"), "ไม่แทน {n}");
    const a = asRec((dn as AnyFn)("th")) ?? {}, b = asRec((dn as AnyFn)("en")) ?? {};
    eq([a.yearOffset, b.yearOffset, (a.weekdays as unknown[])?.length, (a.months as unknown[])?.length, (b.weekdays as unknown[])?.length, (b.months as unknown[])?.length], [543, 0, 7, 12, 7, 12], "ชื่อวันเดือน");
  });
  groupLine("LG");

  // ═══════════════ SD. ตัวโหลดบนร้าน seed ═══════════════
  console.log("\n── SD: ตัวโหลดบนร้าน seed (now = TRIPS_AS_OF · อ่านอย่างเดียว) ──");
  const O = { now: AS_OF };
  const seedBefore = await seedWrites().catch(() => undefined);
  const seedIds = [DIVE_TENANT, U0, ...seedProducts.map((p) => p.id)];
  await st("SD-1", "resolveBookShop: andaman-dive ⇒ ร้าน + หน่วย TRIPS ตัวเดียว (ไม่รวมหน่วย BOOKING) tz Asia/Bangkok · ตัวใหญ่/ช่องว่าง normalise · slug ผิดรูป/ไม่มี ⇒ NOT_FOUND เท่ากัน", async () => {
    const r = await call("resolveBookShop", DIVE_SLUG);
    ok(r.ok === true, fmt(r));
    const shop = asRec(r.shop) ?? {};
    eq([shop.tenantId, shop.slug, asArr(shop.units).map((u) => [u.id, u.slug, u.tz])], [DIVE_TENANT, DIVE_SLUG, [[U0, FX.SHOP_DIVE.units.trips.slug, "Asia/Bangkok"]]], "ร้าน");
    eq(asRec((await call("resolveBookShop", "  Andaman-Dive ")).shop)?.tenantId, DIVE_TENANT, "normalise");
    for (const bad of ["no-such-shop-xyz", "", "a".repeat(80), "andaman_dive", "../etc", "andaman-dive'--", null, 5, { slug: DIVE_SLUG }]) eq(await call("resolveBookShop", bad), NF, `slug ${fmt(bad)}`);
    eq(await call("resolveBookShop", FX.SHOP_AQUARIUM.tenant.slug), NF, "ร้านตั๋ว (ไม่มีหน่วย TRIPS)");
  });
  await st("SD-2", "รายการสินค้า (ไทย): ชื่อร้าน อันดามันไดฟ์ · ทัวร์ 3 ตัวเรียงตามเวลาเผยแพร่ · ไม่มี Liveaboard · ชื่อ/สรุปไทย ไม่ fallback · total 3 ไม่ถูกตัด", async () => {
    const vm = VM(await call("loadBookShopVM", { shop: DIVE_SLUG, lang: "th", acceptLanguage: null }, O), "loadBookShopVM");
    const expSlugs = seedProducts.filter((p) => p.status === "ACTIVE" && p.productType === "TOUR").map((p) => p.slug);
    eq([asRec(vm.shop)?.slug, asRec(vm.shop)?.name, vm.locale, asArr(vm.products).map((p) => p.slug), vm.total, vm.shown, vm.truncated], [DIVE_SLUG, FX.SHOP_DIVE.tenant.name, "th", expSlugs, 3, 3, false], "รายการ");
    const racha = asArr(vm.products).find((p) => p.slug === RACHA_SLUG) ?? {};
    eq([racha.title, asRec(racha.summary)?.fallback], [{ text: R.name, fallback: false }, false], "ราชา");
    noInternal(vm, seedIds, "รายการ");
  });
  await st("SD-3", "หน้าสินค้าอังกฤษ: ชื่อ \"Racha Yai Island Day Trip\" · กำหนดการยังไม่แปล ⇒ ข้อความไทย + fallback true (ภาพ 19 :78) · includes อังกฤษ · ภาษาจาก Accept-Language เมื่อไม่มี lang", async () => {
    const vm = VM(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: RACHA_SLUG, lang: "en", acceptLanguage: "th" }, O), "en");
    const p = asRec(vm.product) ?? {};
    eq([vm.locale, p.slug, p.title, asRec(p.itinerary)?.fallback, /[ก-๙]/.test(String(asRec(p.itinerary)?.text ?? "")), asRec(p.includes)?.fallback, /[ก-๙]/.test(String(asRec(p.includes)?.text ?? ""))],
      ["en", RACHA_SLUG, { text: "Racha Yai Island Day Trip", fallback: false }, true, true, false, false], "เนื้อหา");
    const th = VM(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: RACHA_SLUG, acceptLanguage: "th-TH,en;q=0.5" }, O), "th");
    eq([th.locale, asRec(th.product)?.title, asRec(asRec(th.product)?.itinerary)?.fallback], ["th", { text: R.name, fallback: false }, false], "ไทย");
    eq(VM(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: RACHA_SLUG, acceptLanguage: "de-DE" }, O), "de").locale, "en", "ภาษาอื่น ⇒ en");
  });
  await st("SD-4", "ปฏิทิน พ.ย. 2569 (ภาพ 19 :43–:48): today 12 · 5 แถวเริ่มอาทิตย์ที่ 1 · 1–11 ผ่านแล้ว · 12 ปิดรับ · 13 ไม่ออกเดินทาง · 14 ว่าง = ความจุ − ขาย − ถือ − โควตา ของฐาน · ทุกวันตรงกับ listAvailability (PUBLIC/WEB) ผ่าน dayCellOf · tz GMT+7 · เดือนก่อนไม่มี", async () => {
    ok(seedRacha, "ไม่มีสินค้าราชาใน seed");
    const vm = VM(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: RACHA_SLUG, lang: "th", month: "2026-11" }, O), "พ.ย.");
    eq([vm.today, vm.month, vm.prevMonth, vm.nextMonth, vm.tz, (vm.weeks as unknown[])?.length], ["2026-11-12", "2026-11", null, "2026-12", { name: "Asia/Bangkok", offsetMin: 420 }, 5], "หัวปฏิทิน");
    eq((vm.weeks as (Rec | null)[][]).map((w) => w.map((d) => (d ? d.date : null))), P("monthGrid")("2026-11"), "ช่องวัน");
    const av = asRec(await tfn("listAvailability")({ tenantId: DIVE_TENANT, unitId: U0, channel: "WEB", actor: { kind: "PUBLIC", clientKey: "w11qc-oracle" }, now: AS_OF, locale: "th" }, { productId: seedRacha?.id, from: "2026-11-01", to: "2026-11-30" })) ?? {};
    ok(av.ok === true, `listAvailability: ${fmt(av)}`);
    const rows = asArr(av.value);
    const cell = P("dayCellOf");
    for (const d of weeksDays(vm)) {
      const e = asRec(cell(rows.filter((r) => r.localDate === d.date), d.date, "2026-11-12")) ?? {};
      eq([d.state, d.left, d.selectable, d.day], [e.state, e.left, e.state === "OPEN" || e.state === "LOW", Number(String(d.date).slice(8))], `วัน ${d.date}`);
    }
    const db = await q<{ n: number }>(`SELECT (capacity - sold - held - reserved)::int AS n FROM "TripDeparture" WHERE "productId" = $1 AND "localDate" = $2::date`, [seedRacha?.id, D14]);
    eq([dayOf(vm, "2026-11-05").state, dayOf(vm, "2026-11-11").state, dayOf(vm, "2026-11-12").state, dayOf(vm, "2026-11-13").state, dayOf(vm, D14).state, dayOf(vm, D14).left], ["PAST", "PAST", "CLOSED", "NOT_RUNNING", "OPEN", db[0]?.n], "วันสำคัญ");
    ok(Number(db[0]?.n) > 0 && Number(db[0]?.n) <= R.capacity, "เลขว่างของฐานผิดปกติ");
  });
  await st("SD-5", "วันที่เลือกปริยาย = ส. 14 พ.ย. (วันแรกที่เลือกได้) · รอบ 08:00–16:30 · ร่วมกลุ่ม · ความจุ 24 · ยืนยันออกแล้ว · ปิดรับ 13 พ.ย. 18:00 (ภาพ 19 :51) · ปุ่มหลักยังปิด", async () => {
    const vm = VM(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: RACHA_SLUG, lang: "th", month: "2026-11" }, O), "เลือก");
    const sel = asRec(vm.selected) ?? {};
    const s0 = asArr(sel.slots)[0] ?? {};
    eq([sel.date, asArr(sel.slots).length, s0.timeText, s0.optionName, s0.state, s0.left, s0.capacity, s0.guaranteed, s0.cutoffLocal, vm.requestedUnavailable, vm.cta, dayOf(vm, D14).selected, weeksDays(vm).filter((d) => d.selected).length],
      [D14, 1, TIME_TEXT, { text: "ร่วมกลุ่ม", fallback: false }, "OPEN", dayOf(vm, D14).left, R.capacity, true, "2026-11-13 18:00", false, { enabled: false }, true, 1], "รอบ");
  });
  await st("SD-6", "ตารางราคา ส. 14 พ.ย. (ภาพ 19 :57–:72 · :101–:103): ผู้ใหญ่ 3,500 · เด็ก 2,450 · ทารก 0 ไม่มีที่นั่ง · ค่าอุทยาน 600/300 เก็บแทน · กล้อง 500 ต่อการจอง · ทดลองดำน้ำ 1,900 ต่อคน · VAT รวมแล้ว · ขั้นบันได 100/50/0 · เท่ากับ quoteTripLine ที่ข้อสอบเรียกเอง", async () => {
    const vm = VM(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: RACHA_SLUG, lang: "en", month: "2026-11", date: D14 }, O), "ราคา");
    const sel = asRec(vm.selected) ?? {};
    const pr = asRec(sel.price);
    ok(pr, `ไม่มี price: ${fmt(sel.priceError)}`);
    eq([sel.priceError, pr?.currency, pr?.vatNote, pr?.cancelLadder, pr?.headline], [null, "THB", "INCLUDED", LADDER, { code: "ADULT", unitSatang: R.adultSatang }], "หัวราคา");
    eq(asArr(pr?.pax).map((p) => [p.code, asRec(p.label)?.text, p.ageMin, p.ageMax, p.seat, p.unitSatang]),
      [["ADULT", "Adult", 12, null, true, R.adultSatang], ["CHILD", "Child", R.childAge.min, R.childAge.max, true, R.childSatang], ["INFANT", "Infant", 0, 3, false, 0]], "ประเภทคน");
    eq(asArr(pr?.fees).map((f) => [asRec(f.name)?.text, f.paxCode, f.unitSatang, f.passThrough]), [["Marine park fee", "ADULT", R.parkAdultSatang, true], ["Marine park fee", "CHILD", R.parkChildSatang, true]], "ค่าอุทยาน");
    eq(asArr(pr?.extras).map((x) => [asRec(x.name)?.text, x.basis, x.unitSatang]).sort(), [["Discover scuba diving (1 dive)", "PER_PAX", R.extras.introDive.satang], ["Underwater camera rental", "PER_BOOKING", R.extras.camera.satang]], "รายการเสริม");
    // เทียบกับบริการราคาที่รับแล้ว (ข้อสอบเรียกเอง)
    const dep = await q<{ id: string; optionId: string }>(`SELECT id, "optionId" FROM "TripDeparture" WHERE "productId" = $1 AND "localDate" = $2::date`, [seedRacha?.id, D14]);
    const pts = await q<{ id: string; code: string }>(`SELECT id, code FROM "TripPaxType" WHERE "productId" = $1 AND active ORDER BY "sortOrder"`, [seedRacha?.id]);
    const ql = asRec(await tfn("quoteTripLine")({ tenantId: DIVE_TENANT, unitId: U0, channel: "WEB", actor: { kind: "PUBLIC", clientKey: "w11qc-oracle" }, now: AS_OF, locale: "en" },
      { productKind: "TRIP", unitId: U0, productId: seedRacha?.id, slotId: dep[0]?.id, optionId: dep[0]?.optionId, pax: pts.map((p) => ({ paxTypeId: p.id, qty: 1 })), extras: [] })) ?? {};
    ok(ql.ok === true, `quoteTripLine: ${fmt(ql)}`);
    const items = asArr(asRec(ql.value)?.items);
    eq(asArr(pr?.pax).map((p) => p.unitSatang), pts.map((p) => items.find((i) => i.kind === "SEAT" && i.paxTypeId === p.id)?.unitMinor), "ราคาต่อคน = quote");
    eq(asArr(pr?.fees).map((f) => [f.paxCode, f.unitSatang]), items.filter((i) => i.kind === "EXTRA").map((i) => [i.paxTypeCode, i.unitMinor]), "ค่าบังคับ = quote");
    const th = VM(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: RACHA_SLUG, lang: "th", month: "2026-11", date: D14 }, O), "ราคาไทย");
    eq(asArr(asRec(asRec(th.selected)?.price)?.pax).map((p) => asRec(p.label)?.text), ["ผู้ใหญ่", "เด็ก", "ทารก"], "ป้ายไทยจากสินค้า (ไม่ใช่ป้ายของ quote)");
  });
  await st("SD-7", "พารามิเตอร์วัน/เดือน: d=16 ⇒ เลือก 16 · d=13 (ยกเลิก) ⇒ เลือกวันถัดไปที่ได้ + requestedUnavailable · d ผิดรูป ⇒ ปริยาย ไม่เตือน · เดือนอดีต/ไกลเกิน/ผิดรูป ⇒ เดือนนี้ · ธ.ค. เปิดได้ (prev = พ.ย.)", async () => {
    const L = async (i: Rec) => VM(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: RACHA_SLUG, lang: "th", ...i }, O), fmt(i));
    const a = await L({ month: "2026-11", date: "2026-11-16" }), b = await L({ month: "2026-11", date: "2026-11-13" }), c = await L({ month: "2026-11", date: "2026-11-99" }), d = await L({ date: "2026-11-16" });
    eq([asRec(a.selected)?.date, a.requestedUnavailable, asRec(b.selected)?.date, b.requestedUnavailable, asRec(c.selected)?.date, c.requestedUnavailable, d.month, asRec(d.selected)?.date],
      ["2026-11-16", false, D14, true, D14, false, "2026-11", "2026-11-16"], "วัน");
    eq([(await L({ month: "2026-10" })).month, (await L({ month: "2027-12" })).month, (await L({ month: "nope" })).month, (await L({ month: ["2026-12"] })).month], ["2026-11", "2026-11", "2026-11", "2026-11"], "เดือนนอกช่วง");
    const dec = await L({ month: "2026-12" });
    eq([dec.month, dec.prevMonth, dec.nextMonth, dayOf(dec, "2026-12-01").state === "PAST"], ["2026-12", "2026-11", "2027-01", false], "ธ.ค.");
    const last = await L({ month: "2027-11" });
    eq([last.month, last.nextMonth, last.selected], ["2027-11", null, null], "เดือนสุดท้ายของช่วง · ไม่มีรอบ ⇒ selected null");
  });
  await st("SD-8", "มองไม่เห็น ⇒ NOT_FOUND เท่ากันทุกสาเหตุ: Liveaboard ที่เผยแพร่ · slug ไม่มี · slug ตัวใหญ่ · ขยะ/ยาว/ชนิดผิด · ร้านไม่มี · ร้านตั๋ว — ตัวโหลดไม่ throw", async () => {
    for (const slug of ["similan-4-nights", "no-such-product", RACHA_SLUG.toUpperCase(), "", "x".repeat(500), "racha%", "racha-yai-day-trip' OR '1'='1", "\u0000", null, 7, [RACHA_SLUG]])
      eq(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: slug, lang: "th" }, O), NF, `slug ${fmt(slug).slice(0, 40)}`);
    eq(await call("loadBookProductVM", { shop: "no-such-shop-xyz", productSlug: RACHA_SLUG }, O), NF, "ร้านไม่มี");
    eq(await call("loadBookProductVM", { shop: FX.SHOP_AQUARIUM.tenant.slug, productSlug: RACHA_SLUG }, O), NF, "สินค้าของร้านอื่น");
    eq(await call("loadBookShopVM", { shop: "no-such-shop-xyz" }, O), NF, "รายการร้านไม่มี");
    eq(await call("loadBookShopVM", { shop: FX.SHOP_AQUARIUM.tenant.slug }, O), NF, "รายการร้านตั๋ว");
  });
  await st("SD-9", "VM หน้าสินค้าไม่มี id ภายใน/ของภายในของ quote · รูปคีย์ชั้นบนตรงใบสั่ง", async () => {
    const vm = VM(await call("loadBookProductVM", { shop: DIVE_SLUG, productSlug: RACHA_SLUG, lang: "en", month: "2026-11", date: D14 }, O), "vm");
    const deps = (await q<{ id: string }>(`SELECT id FROM "TripDeparture" WHERE "productId" = $1`, [seedRacha?.id])).map((r) => r.id);
    const sub = (await q<{ id: string }>(`SELECT id FROM "TripPaxType" WHERE "productId" = $1 UNION SELECT id FROM "TripExtra" WHERE "productId" = $1 UNION SELECT id FROM "TripOption" WHERE "productId" = $1`, [seedRacha?.id])).map((r) => r.id);
    noInternal(vm, [...seedIds, ...deps, ...sub], "หน้าสินค้า");
    eq(Object.keys(vm).sort(), ["cta", "locale", "month", "nextMonth", "prevMonth", "product", "requestedUnavailable", "selected", "shop", "today", "tz", "weeks"], "คีย์ VM");
    eq(Object.keys(asRec(vm.shop) ?? {}).sort(), ["brandColor", "brandFg", "logoUrl", "name", "slug"], "คีย์ shop");
  });
  await st("SD-10", "ตัวโหลดไม่เขียนฐาน: TripLinkStat / ถังอัตรา / AuditLog / OutboxEvent ของร้าน seed เท่าเดิมหลังทุกข้อ SD", async () => {
    sfn("loadBookProductVM");
    ok(seedBefore, "อ่านตัวนับ seed ก่อนเริ่มไม่ได้");
    eq(await seedWrites(), seedBefore, "ตัวนับ seed");
  });
  groupLine("SD");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB"), tS = rid("tS"), tN = rid("tN");
  const uA = rid("uA"), uA2 = rid("uA2"), uAp = rid("uAp"), uAb = rid("uAb"), uT = rid("uT"), uB = rid("uB"), uS = rid("uS"), uN = rid("uN");
  const slugOf = (tag: string) => `${SLUG}${STAMP}-${tag}`;
  const SA = slugOf("a"), SB = slugOf("b"), SS = slugOf("s"), SN = slugOf("n");
  let setupErr = "";
  const U: Record<string, Actor> = {};
  type Prod = { id: string; slug: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; cam: string; park: string };
  const PRD: Record<string, Prod> = {};
  const allIds: string[] = [tA, tB, tS, tN, uA, uA2, uAp, uAb, uT, uB, uS, uN];
  const mkDep = async (key: string, date: string, o: { capacity?: number; sold?: number; status?: string; opt?: string | null; hm?: string } = {}): Promise<string> => {
    const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const startsAt = BKK(date, o.hm ?? "08:00"); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: o.opt === undefined ? p.opt : o.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * HOUR),
      status: o.status ?? "OPEN", capacity: o.capacity ?? 40, sold: o.sold ?? 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    allIds.push(id);
    return id;
  };
  try {
    for (const t of ["TripProduct", "TripOption", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripLinkStat", "ChatRateBucket"]) await needTable(t);
    for (const [id, slug, status] of [[tA, SA, "ACTIVE"], [tB, SB, "ACTIVE"], [tS, SS, "SUSPENDED"], [tN, SN, "ACTIVE"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ W1.1 ${slug.slice(-1)}`, slug, status, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag, type, status, s] of [[uA, tA, "a", "TRIPS", "ACTIVE", {}], [uA2, tA, "a2", "TRIPS", "ACTIVE", {}], [uAp, tA, "ap", "TRIPS", "PAUSED", {}], [uAb, tA, "ab", "BOOKING", "ACTIVE", {}], [uT, tA, "tokyo", "TRIPS", "ACTIVE", { timezone: "Asia/Tokyo" }],
      [uB, tB, "b", "TRIPS", "ACTIVE", {}], [uS, tS, "s", "TRIPS", "ACTIVE", {}], [uN, tN, "n", "BOOKING", "ACTIVE", {}]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type, status, name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify(s), updatedAt: new Date() });
    const mkUser = async (tag: string, tenantId: string): Promise<void> => {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id };
    };
    await mkUser("oa", tA); await mkUser("ob", tB);
    let pubN = 0;
    const mkProd = async (key: string, tenantId: string, unitId: string, o: { status?: string; type?: string; slug?: string; en?: boolean } = {}) => {
      const id = rid(`p${key}`), opt = rid(`o${key}`);
      const slug = o.slug ?? `w11qc-${key.toLowerCase()}-${STAMP}`;
      await insertRow("TripProduct", { id, tenantId, unitId, slug, productType: o.type ?? "TOUR", sourceKind: "OWN", status: o.status ?? "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}`, ...(o.en === false ? {} : { en: `Test ${key}` }) }),
        body: JSON.stringify({ summary: { th: `สรุป ${key}` }, itinerary: { th: `กำหนดการ ${key}` }, includes: { th: `รวม ${key}`, en: `Includes ${key}` } }), currency: "THB", deepDive: false, crossBorder: false,
        publishedAt: new Date(Date.parse("2027-01-01T00:00:00Z") + pubN++ * 60_000), updatedAt: new Date() });
      await insertRow("TripOption", { id: opt, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt: Record<string, string> = {};
      for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code === "ADULT" ? "Adult" : code === "CHILD" ? "Child" : "Infant" }), countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
      const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: R.parkAdultSatang, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
        name: JSON.stringify({ th: "ค่าอุทยาน", en: "Marine park fee" }), paxPrices: JSON.stringify({ ADULT: R.parkAdultSatang, CHILD: R.parkChildSatang }), active: true, updatedAt: new Date() });
      const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: R.extras.camera.satang, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
        name: JSON.stringify({ th: R.extras.camera.name, en: "Waterproof camera" }), active: true, updatedAt: new Date() });
      for (const [code, amount] of [["ADULT", 123_400], ["CHILD", 56_700], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, slug, opt, unit: unitId, tenant: tenantId, pt, cam, park };
      allIds.push(id, opt, park, cam, ...Object.values(pt));
    };
    const SHARED = `w11qc-shared-${STAMP}`;
    await mkProd("A", tA, uA, { slug: SHARED }); await mkProd("A2", tA, uA2); await mkProd("AT", tA, uT, { en: false });
    await mkProd("DRAFT", tA, uA, { status: "DRAFT" }); await mkProd("ARCH", tA, uA, { status: "ARCHIVED" }); await mkProd("LB", tA, uA, { type: "LIVEABOARD" }); await mkProd("PAUSED", tA, uAp); await mkProd("WRONGU", tA, uAb);
    await mkProd("B", tB, uB, { slug: SHARED }); await mkProd("BONLY", tB, uB); await mkProd("S", tS, uS);
    // รอบของ A (มี.ค. 2570): 10 ว่าง 35 · 11 เหลือ 2 · 12 เต็ม · 13 ยกเลิก · 14 ตัวเลือกปิด (สาธารณะไม่เห็น) · 15 สองรอบ (ว่าง 5 · ว่าง 30) · 16 = รอบของสินค้า DRAFT/สินค้าอื่น (ไม่ใช่ของ A)
    await mkDep("A", "2027-03-10", { sold: 5 }); await mkDep("A", "2027-03-11", { sold: 38 }); await mkDep("A", "2027-03-12", { sold: 40 }); await mkDep("A", "2027-03-13", { status: "CANCELLED" });
    const optOff = rid("ooff"); allIds.push(optOff);
    await insertRow("TripOption", { id: optOff, tenantId: tA, unitId: uA, productId: PRD.A.id, name: JSON.stringify({ th: "เหมาลำ" }), durationMin: 480, sortOrder: 2, active: false, updatedAt: new Date() });
    await mkDep("A", "2027-03-14", { opt: optOff });
    await mkDep("A", "2027-03-15", { capacity: 10, sold: 5, hm: "07:00" }); await mkDep("A", "2027-03-15", { capacity: 40, sold: 10, hm: "13:00" });
    await mkDep("DRAFT", "2027-03-16"); await mkDep("A2", "2027-03-16"); await mkDep("B", "2027-03-16", { sold: 1 });
    await mkDep("AT", "2027-03-10");
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const needDb = () => { ok(!setupErr && PRD.A && PRD.S, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); };
  const N0 = { now: new Date(NOW0) };
  const openP = (i: Rec, o: Rec = N0) => call("openBookProduct", { shop: SA, productSlug: PRD.A?.slug, query: {}, acceptLanguage: "th", ...i }, o);
  const statRows = async (unit: string) => q<{ day: string; channel: string; linkId: string | null; agentAccountId: string | null; views: number; starts: number; paid: number; tenantId: string }>(
    `SELECT "day"::text AS day, channel, "linkId", "agentAccountId", views, starts, paid, "tenantId" FROM "TripLinkStat" WHERE "unitId" = $1 ORDER BY "day", "linkId" NULLS FIRST`, [unit]);
  const gateIn = (o: Rec = {}): Rec => ({ tenantId: tA, unit: { id: uA, tz: "Asia/Bangkok" }, productId: PRD.A?.id ?? null, channel: "WEB", linkCode: null, ...o });
  const gate = (i: Rec, o: Rec = N0) => call("bookPageGate", i, o);

  // ═══════════════ IS. แยกร้าน/หน่วย · การมองเห็น ═══════════════
  console.log("\n── IS: แยกร้าน/หน่วย · การมองเห็น (ร้านชั่วคราว) ──");
  await st("IS-1", "resolveBookShop ร้าน A: หน่วย TRIPS ที่ ACTIVE เท่านั้น (a · a2 · tokyo) — ไม่มีหน่วย PAUSED/BOOKING · tz ของ tokyo = Asia/Tokyo · ร้านระงับ/ร้านไม่มีหน่วย TRIPS ⇒ NOT_FOUND เท่ากับร้านที่ไม่มี", async () => {
    needDb();
    const r = await call("resolveBookShop", SA);
    ok(r.ok === true, fmt(r));
    eq([asRec(r.shop)?.tenantId, asArr(asRec(r.shop)?.units).map((u) => u.id).sort(), asArr(asRec(r.shop)?.units).find((u) => u.id === uT)?.tz], [tA, [uA, uA2, uT].sort(), "Asia/Tokyo"], "ร้าน A");
    eq([await call("resolveBookShop", SS), await call("resolveBookShop", SN), await call("resolveBookShop", slugOf("zz"))], [NF, NF, NF], "ร้านระงับ/ไม่มีหน่วย/ไม่มี");
  });
  await st("IS-2", "รายการร้าน A: เฉพาะทัวร์ ACTIVE ในหน่วย TRIPS ACTIVE ของ A (A · A2 · AT) เรียงตามเวลาเผยแพร่ — ไม่มี DRAFT/ARCHIVED/Liveaboard/หน่วยพัก/หน่วยผิดชนิด/ของร้าน B · ร้าน B เห็นเฉพาะของ B", async () => {
    needDb();
    const a = VM(await call("loadBookShopVM", { shop: SA, lang: "en" }, N0), "A"), b = VM(await call("loadBookShopVM", { shop: SB, lang: "th" }, N0), "B");
    eq([asArr(a.products).map((p) => p.slug), a.total, asArr(b.products).map((p) => p.slug), b.total], [[PRD.A.slug, PRD.A2.slug, PRD.AT.slug], 3, [PRD.B.slug, PRD.BONLY.slug], 2], "รายการ");
    eq([asArr(a.products)[0]?.title, asArr(a.products)[2]?.title, asArr(b.products)[0]?.title], [{ text: "Test A", fallback: false }, { text: "ทดสอบ AT", fallback: true }, { text: "ทดสอบ B", fallback: false }], "ชื่อ (slug ซ้ำข้ามร้านได้ของร้านตัวเอง)");
    noInternal(a, allIds, "รายการ A");
  });
  await st("IS-3", "หน้าสินค้า: slug เดียวกันสองร้านได้ของร้านตัวเอง · DRAFT/ARCHIVED/Liveaboard/หน่วยพัก/หน่วยผิดชนิด/slug ของร้าน B/ร้านระงับ ⇒ NOT_FOUND เท่ากันทุกตัว", async () => {
    needDb();
    const a = VM(await call("loadBookProductVM", { shop: SA, productSlug: PRD.A.slug, lang: "th", month: "2027-03" }, N0), "A"), b = VM(await call("loadBookProductVM", { shop: SB, productSlug: PRD.B.slug, lang: "th", month: "2027-03" }, N0), "B");
    eq([asRec(a.product)?.title, asRec(b.product)?.title, dayOf(a, "2027-03-16").state, dayOf(b, "2027-03-16").left], [{ text: "ทดสอบ A", fallback: false }, { text: "ทดสอบ B", fallback: false }, "NONE", 39], "ของร้านตัวเอง");
    for (const k of ["DRAFT", "ARCH", "LB", "PAUSED", "WRONGU"]) eq(await call("loadBookProductVM", { shop: SA, productSlug: PRD[k]?.slug }, N0), NF, k);
    eq(await call("loadBookProductVM", { shop: SA, productSlug: PRD.BONLY.slug }, N0), NF, "slug ของ B ใต้ร้าน A");
    eq(await call("loadBookProductVM", { shop: SS, productSlug: PRD.S.slug }, N0), NF, "ร้านระงับ");
    eq(await call("loadBookProductVM", { shop: SB, productSlug: PRD.A2.slug }, N0), NF, "slug ของ A ใต้ร้าน B");
  });
  await st("IS-4", "สถานะเปลี่ยนมีผลทันที (ไม่แคชการมองเห็น): ถอนเผยแพร่ ⇒ NOT_FOUND + หายจากรายการ → เผยแพร่คืน ⇒ เห็น · พักหน่วย ⇒ NOT_FOUND · ระงับร้าน ⇒ NOT_FOUND ทั้งร้าน → คืน ⇒ เห็น", async () => {
    needDb();
    const see = async () => (await call("loadBookProductVM", { shop: SA, productSlug: PRD.A2.slug }, N0)).ok === true;
    const listed = async () => asArr(asRec((await call("loadBookShopVM", { shop: SA }, N0)).vm)?.products).some((p) => p.slug === PRD.A2.slug);
    ok((await see()) && (await listed()), "ก่อนเปลี่ยนต้องเห็น");
    try {
      await pool.query(`UPDATE "TripProduct" SET status = 'DRAFT' WHERE id = $1`, [PRD.A2.id]);
      eq([await see(), await listed()], [false, false], "ถอนเผยแพร่");
      await pool.query(`UPDATE "TripProduct" SET status = 'ACTIVE' WHERE id = $1`, [PRD.A2.id]);
      ok(await see(), "เผยแพร่คืน");
      await pool.query(`UPDATE "BusinessUnit" SET status = 'PAUSED' WHERE id = $1`, [uA2]);
      eq([await see(), await listed()], [false, false], "พักหน่วย");
      await pool.query(`UPDATE "BusinessUnit" SET status = 'ACTIVE' WHERE id = $1`, [uA2]);
      await pool.query(`UPDATE "Tenant" SET status = 'SUSPENDED' WHERE id = $1`, [tA]);
      eq([await see(), await call("loadBookShopVM", { shop: SA }, N0), await call("resolveBookShop", SA)], [false, NF, NF], "ระงับร้าน");
    } finally {
      await pool.query(`UPDATE "Tenant" SET status = 'ACTIVE' WHERE id = $1`, [tA]); await pool.query(`UPDATE "BusinessUnit" SET status = 'ACTIVE' WHERE id = $1`, [uA2]); await pool.query(`UPDATE "TripProduct" SET status = 'ACTIVE' WHERE id = $1`, [PRD.A2.id]);
    }
    ok(await see(), "คืนสภาพแล้วต้องเห็น");
  });
  await st("IS-5", "ปฏิทินร้านชั่วคราว มี.ค. 2570 (มติ X4): 10 ว่าง 35 · 11 เหลือ 2 · 12 เต็ม · 13 ไม่ออกเดินทาง · 14 (ตัวเลือกปิด) ไม่มี · 15 สองรอบ = 5 (รอบ 07:00 ที่ออกเร็วที่สุด ไม่ใช่ 30 ของรอบบ่าย) + departures 2 · 16 (รอบของสินค้าอื่น/ร่าง) ไม่มี · 1 มี.ค. = วันนี้ · เลือกปริยาย 10 · รอบที่เลือก/ตัวอ้างรอบ · เลขตรงฐาน", async () => {
    needDb();
    const vm = VM(await call("loadBookProductVM", { shop: SA, productSlug: PRD.A.slug, lang: "th", month: "2027-03" }, N0), "มี.ค.");
    const g = (d: string) => [dayOf(vm, d).state, dayOf(vm, d).left, dayOf(vm, d).selectable];
    eq([vm.today, vm.month, vm.prevMonth, g("2027-03-01"), g("2027-03-10"), g("2027-03-11"), g("2027-03-12"), g("2027-03-13"), g("2027-03-14"), g("2027-03-15"), g("2027-03-16"), asRec(vm.selected)?.date],
      ["2027-03-01", "2027-03", null, ["NONE", null, false], ["OPEN", 35, true], ["LOW", 2, true], ["FULL", 0, false], ["NOT_RUNNING", null, false], ["NONE", null, false], ["LOW", 5, true], ["NONE", null, false], "2027-03-10"], "วัน");
    eq(["2027-03-01", "2027-03-10", "2027-03-11", "2027-03-12", "2027-03-13", "2027-03-14", "2027-03-15"].map((d) => dayOf(vm, d).departures), [0, 1, 1, 0, 0, 0, 2], "departures = จำนวนรอบที่ขายได้ของวัน");
    const db15 = await q<{ n: number }>(`SELECT (capacity - sold - held - reserved)::int AS n FROM "TripDeparture" WHERE "productId" = $1 AND "localDate" = '2027-03-15' ORDER BY "startsAt"`, [PRD.A.id]);
    eq([db15.map((r) => r.n), dayOf(vm, "2027-03-15").left], [[5, 30], db15[0]?.n], "ช่อง 15 = ที่ว่างของรอบแรกในฐาน");
    const two = VM(await call("loadBookProductVM", { shop: SA, productSlug: PRD.A.slug, lang: "en", month: "2027-03", date: "2027-03-15" }, N0), "15");
    eq(asArr(asRec(two.selected)?.slots).map((s) => [s.timeText, s.state, s.left, s.capacity, s.guaranteed, s.optionName]), [["07:00–15:00", "LOW", 5, 10, false, { text: "Join-in", fallback: false }], ["13:00–21:00", "OPEN", 30, 40, false, { text: "Join-in", fallback: false }]], "สองรอบเรียงเวลา");
    eq([asArr(asRec(two.selected)?.slots).map((s) => [s.selected, s.token, s.selectable]), asRec(two.selected)?.moreSlots], [[[true, "0700", true], [false, "1300", true]], 0], "รอบที่เลือกปริยาย = รอบแรกที่ขายได้ · ตัวอ้างรอบ = เวลาออก");
    const one = asArr(asRec(vm.selected)?.slots);
    eq(one.map((s) => [s.selected, s.token, s.selectable, s.left]), [[true, "0800", true, 35]], "วันรอบเดียว: รอบนั้นคือรอบที่เลือก");
    eq([await call("loadBookProductVM", { shop: SA, productSlug: PRD.A.slug, month: "2027-03", date: "2027-03-12" }, N0).then((r) => [asRec(asRec(r.vm)?.selected)?.date, asRec(r.vm)?.requestedUnavailable])], [["2027-03-10", true]], "ขอวันเต็ม");
  });
  await st("IS-6", "ราคาร้านชั่วคราวมาจากบริการราคา: ผู้ใหญ่ 1,234 · เด็ก 567 · ทารก 0 · ค่าอุทยานเก็บแทน · กล้อง · เท่ากับ quoteTripLine ที่ข้อสอบเรียกเอง · แก้ราคาในฐาน ⇒ หน้าเห็นราคาใหม่ทันที · มติ X7: ราคาของประเภทคนเดียวหาย ⇒ ซ่อนเฉพาะแถวนั้น · หายทุกประเภท ⇒ price null + priceError (ไม่ throw ไม่ปั้นเลข)", async () => {
    needDb();
    const load = async () => asRec(VM(await call("loadBookProductVM", { shop: SA, productSlug: PRD.A.slug, lang: "en", month: "2027-03", date: "2027-03-10" }, N0), "ราคา").selected) ?? {};
    const pr = asRec((await load()).price);
    ok(pr, "ไม่มี price");
    eq([asArr(pr?.pax).map((p) => [p.code, p.unitSatang, p.seat]), asArr(pr?.fees).map((f) => [f.paxCode, f.unitSatang, f.passThrough]), asArr(pr?.extras).map((x) => [asRec(x.name)?.text, x.basis, x.unitSatang]), pr?.headline],
      [[["ADULT", 123_400, true], ["CHILD", 56_700, true], ["INFANT", 0, false]], [["ADULT", R.parkAdultSatang, true], ["CHILD", R.parkChildSatang, true]], [["Waterproof camera", "PER_BOOKING", R.extras.camera.satang]], { code: "ADULT", unitSatang: 123_400 }], "ตาราง");
    const dep = await q<{ id: string }>(`SELECT id FROM "TripDeparture" WHERE "productId" = $1 AND "localDate" = '2027-03-10'`, [PRD.A.id]);
    const ql = asRec(await tfn("quoteTripLine")({ tenantId: tA, unitId: uA, channel: "WEB", actor: { kind: "PUBLIC", clientKey: "w11qc-oracle" }, now: new Date(NOW0), locale: "en" },
      { productKind: "TRIP", unitId: uA, productId: PRD.A.id, slotId: dep[0]?.id, optionId: PRD.A.opt, pax: Object.values(PRD.A.pt).map((id) => ({ paxTypeId: id, qty: 1 })), extras: [{ extraId: PRD.A.cam, qty: 1 }] })) ?? {};
    ok(ql.ok === true, `quoteTripLine: ${fmt(ql)}`);
    const tot = asRec(asRec(ql.value)?.totals) ?? {};
    eq([pr?.cancelLadder, pr?.vatNote], [asArr(asRec(ql.value)?.cancelLadder).map((s) => ({ daysBefore: s.daysBefore, refundBp: s.refundBp })), Number(tot.vatSatang) === 0 ? "NONE" : Number(tot.payableSatang) > Number(tot.grossSatang) - Number(tot.discountSatang) ? "ADDED" : "INCLUDED"], "ขั้นบันได/VAT = quote");
    try {
      await pool.query(`UPDATE "TripPrice" SET "amountMinor" = 222200 WHERE "productId" = $1 AND "paxTypeId" = $2`, [PRD.A.id, PRD.A.pt.ADULT]);
      eq(asArr(asRec((await load()).price)?.pax)[0]?.unitSatang, 222_200, "ราคาใหม่");
      await pool.query(`DELETE FROM "TripPrice" WHERE "productId" = $1 AND "paxTypeId" = $2`, [PRD.A.id, PRD.A.pt.ADULT]);
      // มติ X7: ประเภทคนที่ไม่มีราคา ⇒ ซ่อนเฉพาะแถวนั้น (ตารางที่เหลือยังแสดง · ราคาเริ่มต้น = ประเภทที่มีที่นั่งตัวถัดไป · ค่าธรรมเนียมของประเภทที่ซ่อนไม่ค้าง)
      const s = await load();
      const hp = asRec(s.price);
      eq([asArr(hp?.pax).map((p) => [p.code, p.unitSatang]), s.priceError, hp?.headline, asArr(hp?.fees).map((f) => [f.paxCode, f.unitSatang]), asArr(s.slots).map((x) => x.from)],
        [[["CHILD", 56_700], ["INFANT", 0]], null, { code: "CHILD", unitSatang: 56_700 }, [["CHILD", R.parkChildSatang]], [{ code: "CHILD", unitSatang: 56_700 }]], "ซ่อนเฉพาะแถวที่ไม่มีราคา");
      eq(asArr(s.slots).length, 1, "รอบยังแสดง");
      // ทุกประเภทไม่มีราคา ⇒ price null + รหัสเหตุ (ไม่ throw ไม่ปั้นเลข)
      await pool.query(`DELETE FROM "TripPrice" WHERE "productId" = $1`, [PRD.A.id]);
      const none = await load();
      ok(none.price === null && typeof none.priceError === "string" && /^[A-Z_]+$/.test(String(none.priceError)), `ราคาหายทุกประเภท: ${fmt([none.price, none.priceError])}`);
      eq([asArr(none.slots).length, asArr(none.slots)[0]?.from, asArr(none.slots)[0]?.left], [1, null, 35], "รอบยังแสดง (ไม่มีราคาเริ่มต้น · ที่ว่างยังจริง)");
    } finally {
      await pool.query(`DELETE FROM "TripPrice" WHERE "productId" = $1`, [PRD.A.id]);
      for (const [code, amount] of [["ADULT", 123_400], ["CHILD", 56_700], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId: tA, unitId: uA, productId: PRD.A.id, optionId: null, paxTypeId: PRD.A.pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
    }
    eq(asArr(asRec((await load()).price)?.pax).map((p) => [p.code, p.unitSatang]), [["ADULT", 123_400], ["CHILD", 56_700], ["INFANT", 0]], "คืนราคาแล้วตารางกลับมาครบ");
  });
  await st("IS-7", "VM ร้านชั่วคราวไม่มี id ภายในใด ๆ (ร้าน/หน่วย/สินค้า/ตัวเลือก/ประเภทคน/รายการเสริม/รอบ) ทั้งรายการและหน้าสินค้า · เขตเวลาโตเกียว: today/เวลารอบ/offset ตามหน่วย", async () => {
    needDb();
    const vm = VM(await call("loadBookProductVM", { shop: SA, productSlug: PRD.A.slug, lang: "en", month: "2027-03", date: "2027-03-15" }, N0), "A");
    noInternal(vm, allIds, "หน้าสินค้า A");
    const late = { now: new Date("2027-03-01T15:30:00.000Z") }; // 22:30 กรุงเทพ = 00:30 วันที่ 2 โตเกียว
    const tk = VM(await call("loadBookProductVM", { shop: SA, productSlug: PRD.AT.slug, lang: "en", month: "2027-03" }, late), "AT"), bk = VM(await call("loadBookProductVM", { shop: SA, productSlug: PRD.A.slug, lang: "en", month: "2027-03" }, late), "A late");
    eq([tk.today, tk.tz, bk.today, asRec(asRec(tk.product)?.title), String(asArr(asRec(tk.selected)?.slots)[0]?.timeText).slice(0, 2)], ["2027-03-02", { name: "Asia/Tokyo", offsetMin: 540 }, "2027-03-01", { text: "ทดสอบ AT", fallback: true }, "10"], "โตเกียว (08:00 กรุงเทพ = 10:00 โตเกียว)");
  });
  await st("IS-8", "ตัวโหลดไม่เขียนฐานบนร้านชั่วคราว (TripLinkStat 0 แถว · ไม่มีถัง trips:book/trips:view ของร้าน A/B) หลังกลุ่ม IS", async () => {
    needDb(); sfn("loadBookProductVM");
    const n = await q<{ a: number; b: number }>(`SELECT (SELECT count(*) FROM "TripLinkStat" WHERE "tenantId" = ANY($1::text[]))::int AS a, (SELECT count(*) FROM "ChatRateBucket" WHERE key LIKE $2 OR key LIKE $3 OR key LIKE $4)::int AS b`, [[tA, tB], `trips:book:${tA}:%`, `trips:book:${tB}:%`, `trips:view:${uA}:%`]);
    eq(n[0], { a: 0, b: 0 }, "แถวที่เขียน");
  });
  groupLine("IS");

  // ═══════════════ RL. ด่านอัตรา ═══════════════
  console.log("\n── RL: ด่านอัตรา (เพดาน · ปิดเมื่อพัง · คำสั่งเดียว) ──");
  await st("RL-1", "bookClientKey: รูป pc_ + hex 40 · คงที่ต่อ IP · IPv6 ใน /64 เดียวกันได้กุญแจเดียว · ต่าง /64 ต่างกุญแจ · ไม่มี IP ดิบในกุญแจ · IP อ่านไม่ได้ ⇒ null · ไม่มี/สั้น SESSION_SECRET ⇒ null (ไม่มีกุญแจสำรอง) · เปลี่ยนกุญแจเซิร์ฟเวอร์ ⇒ กุญแจเปลี่ยน", () => {
    const f = sfn("bookClientKey");
    const a = f("203.0.113.7"), b = f(" 203.0.113.7:55 "), c = f("203.0.113.8"), v6a = f("2001:db8:1:2::1"), v6b = f("[2001:db8:1:2:ffff::9]:443"), v6c = f("2001:db8:1:3::1");
    ok(typeof a === "string" && /^pc_[0-9a-f]{40}$/.test(a), `รูปกุญแจ: ${fmt(a)}`);
    eq([a === b, a === c, v6a === v6b, v6a === v6c, String(a).includes("203"), f(null), f(""), f("unknown"), f("garbage"), f(undefined)], [true, false, true, false, false, null, null, null, null, null], "กุญแจ");
    const keep = process.env.SESSION_SECRET;
    try {
      delete process.env.SESSION_SECRET; const none = f("203.0.113.7");
      process.env.SESSION_SECRET = "short"; const short = f("203.0.113.7");
      process.env.SESSION_SECRET = "x".repeat(48); const other = f("203.0.113.7");
      eq([none, short, typeof other === "string" && other !== a], [null, null, true], "กุญแจเซิร์ฟเวอร์");
    } finally { if (keep === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = keep; }
    eq(f("203.0.113.7"), a, "คืนค่าแล้วได้กุญแจเดิม");
  });
  await st("RL-2", "ไม่มีกุญแจเครื่อง ⇒ RATE_LIMITED NO_CLIENT โดยไม่ถามฐาน (ด่าน · openBookShop · openBookProduct) · ไม่มีแถว/ถังเกิดขึ้น", async () => {
    needDb();
    let n = 0;
    const spy = { now: new Date(NOW0), deps: { query: (sql: unknown) => { n++; return realQuery(sql); } } };
    const g = await gate({ ...gateIn(), clientKey: null }, spy);
    const a = await call("openBookShop", { shop: SA, query: {}, acceptLanguage: "th", clientKey: null }, spy), b = await openP({ clientKey: null }, spy);
    for (const r of [g, a, b]) eq([r.ok, r.code, r.reason, "vm" in r], [false, "RATE_LIMITED", "NO_CLIENT", false], "ผล");
    eq(n, 0, "จำนวนคำสั่งของด่าน");
    eq((await statRows(uA)).length, 0, "แถวสถิติ");
  });
  await st("RL-3", "เพดานอ่านต่อ (ร้าน, เครื่อง): ผ่านครบ BOOK_READ_LIMIT ครั้ง (ยิงพร้อมกัน) → ครั้งถัดไป RATE_LIMITED LIMIT + retryAfterSec 1..60 · เครื่องอื่น/ร้านอื่นไม่โดน · พ้นหน้าต่าง 60 วิ ⇒ ผ่านใหม่ · ถังเป็น trips:book:<tenantId>:<กุญแจ> แถวเดียว", async () => {
    needDb();
    const { limit } = limitOf("BOOK_READ_LIMIT");
    const k = ck(), k2 = ck();
    const rs = await Promise.all(Array.from({ length: limit }, () => gate({ ...gateIn({ unit: null, productId: null }), clientKey: k })));
    eq(rs.filter((r) => r.ok === true).length, limit, `ผ่านครบ ${limit} (ตัวอย่างที่ไม่ผ่าน: ${fmt(rs.find((r) => r.ok !== true))})`);
    const over = await gate({ ...gateIn({ unit: null, productId: null }), clientKey: k });
    eq([over.ok, over.code, over.reason], [false, "RATE_LIMITED", "LIMIT"], "เกินเพดาน");
    ok(Number.isInteger(over.retryAfterSec) && Number(over.retryAfterSec) >= 1 && Number(over.retryAfterSec) <= 60, `retryAfterSec ${fmt(over.retryAfterSec)}`);
    eq([(await gate({ ...gateIn({ unit: null, productId: null }), clientKey: k2 })).ok, (await gate({ ...gateIn({ tenantId: tB, unit: null, productId: null }), clientKey: k })).ok], [true, true], "เครื่องอื่น/ร้านอื่น");
    const blocked = await openP({ clientKey: k });
    eq([blocked.ok, blocked.code, "vm" in blocked], [false, "RATE_LIMITED", false], "openBookProduct ของเครื่องที่เกิน ⇒ ไม่มี vm");
    eq((await gate({ ...gateIn({ unit: null, productId: null }), clientKey: k }, { now: new Date(Date.parse(NOW0) + 61_000) })).ok, true, "พ้นหน้าต่าง");
    const b = await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:book:${tA}:%${k}`]);
    eq(b.map((r) => r.key), [`trips:book:${tA}:${k}`], "ถังของร้าน");
  });
  await st("RL-4", "ปิดเมื่อพัง: ตัวรันคำสั่ง throw / คืน [] / คืนแถวไม่มีเลขนับ ⇒ RATE_LIMITED LIMITER_DOWN (ไม่ปล่อยผ่าน) · openBookProduct/openBookShop ไม่มี vm · ไม่มีแถวสถิติเพิ่ม · ไม่ throw ออกมา", async () => {
    needDb();
    const before = (await statRows(uA)).reduce((s, r) => s + r.views, 0);
    for (const [name, query] of [["throw", async () => { throw new Error("db down"); }], ["ไม่มีแถว", async () => []], ["แถวว่าง", async () => [{}]], ["เลข null", async () => [{ count: null, rc: null, c: null, n: null }]]] as const) {
      const o = { now: new Date(NOW0), deps: { query } };
      const g = await gate({ ...gateIn(), clientKey: ck() }, o);
      eq([g.ok, g.code, g.reason], [false, "RATE_LIMITED", "LIMITER_DOWN"], `ด่าน (${name})`);
      ok(Number(g.retryAfterSec) >= 1, `retryAfterSec (${name})`);
      const p = await openP({ clientKey: ck() }, o), s = await call("openBookShop", { shop: SA, query: {}, acceptLanguage: "th", clientKey: ck() }, o);
      eq([p.ok, p.code, "vm" in p, s.ok, s.code, "vm" in s], [false, "RATE_LIMITED", false, false, "RATE_LIMITED", false], `open* (${name})`);
      const miss = await call("openBookProduct", { shop: SA, productSlug: "nope-nope", query: {}, acceptLanguage: "th", clientKey: ck() }, o);
      eq([miss.ok, miss.code], [false, "RATE_LIMITED"], `คำขอไม่พบ + ด่านพัง (${name}) ต้องปิด ไม่ใช่ NOT_FOUND`);
    }
    eq((await statRows(uA)).reduce((s, r) => s + r.views, 0), before, "views ไม่เพิ่ม");
  });
  await st("RL-5", "คำสั่งเดียวต่อการเรียกด่าน (หน้ารายการ · ด่านที่ส่ง unit · คำขอไม่พบ) — ไม่มี read-then-write · มติ X6: openBookProduct = ด่าน 1 คำสั่ง (ไม่มี TripLinkStat) แล้วนับ 1 คำสั่งหลัง VM พร้อม · countView:false ⇒ ด่านอย่างเดียว · ไม่พบ ⇒ ถังเดาอย่างเดียว · open* ส่ง deps ถึงทั้งด่านและตัวนับ", async () => {
    needDb();
    const sqlText = (sql: unknown): string => { const r = asRec(sql); return typeof r?.sql === "string" ? r.sql : Array.isArray(r?.strings) ? (r?.strings as unknown[]).join("?") : String(sql); };
    const count = async (fn: (o: Rec) => Promise<Rec>): Promise<[number, unknown, boolean[]]> => { const seen: boolean[] = []; const r = await fn({ now: new Date(NOW0), deps: { query: (sql: unknown) => { seen.push(/"TripLinkStat"/.test(sqlText(sql))); return realQuery(sql); } } }); return [seen.length, r.ok === true ? true : r.code, seen]; };
    eq(await count((o) => gate({ ...gateIn({ unit: null, productId: null }), clientKey: ck() }, o)), [1, true, [false]], "ด่านหน้ารายการ");
    eq(await count((o) => gate({ ...gateIn(), clientKey: ck() }, o)), [1, true, [true]], "ด่านที่ผู้เรียกส่ง unit (สัญญา §5.2: นับในคำสั่งเดียวกับด่าน)");
    eq(await count((o) => gate({ ...gateIn({ tenantId: null, unit: null, productId: null }), clientKey: ck() }, o)), [1, true, [false]], "ด่านคำขอไม่พบ");
    eq(await count((o) => openP({ clientKey: ck() }, o)), [2, true, [false, true]], "openBookProduct: ด่านอ่าน (ไม่แตะ TripLinkStat) → นับ");
    eq(await count((o) => openP({ clientKey: ck(), countView: false }, o)), [1, true, [false]], "openBookProduct countView:false ⇒ ไม่มีคำสั่งนับ");
    eq(await count((o) => call("openBookShop", { shop: SA, query: {}, acceptLanguage: "th", clientKey: ck() }, o)), [1, true, [false]], "openBookShop");
    eq(await count((o) => call("openBookProduct", { shop: SA, productSlug: PRD.DRAFT.slug, query: {}, acceptLanguage: "th", clientKey: ck() }, o)), [1, "NOT_FOUND", [false]], "ไม่พบ");
  });
  await st("RL-6", "คำขอไม่พบ (ร้าน/สินค้า/ร่าง/ร้านอื่น): ผล NOT_FOUND เท่ากัน · นับในถังเดียวต่อเครื่อง trips:book:none:<กุญแจ> (ไม่มีแถวต่อ slug ที่เดา) · เกิน BOOK_MISS_LIMIT ⇒ RATE_LIMITED · ไม่กินเพดานของร้านจริง", async () => {
    needDb();
    const { limit } = limitOf("BOOK_MISS_LIMIT");
    const k = ck();
    const guess = `guess-${hex(5)}`;
    const targets: [string, unknown][] = [[slugOf("zz"), "x"], [SA, guess], [SA, PRD.DRAFT.slug], [SA, PRD.ARCH.slug], [SA, PRD.LB.slug], [SA, PRD.PAUSED.slug], [SA, PRD.BONLY.slug], [SS, PRD.S.slug], [SN, "x"], ["BAD SLUG!", "x"]];
    const first: Rec[] = [];
    for (const [shop, productSlug] of targets) first.push(await call("openBookProduct", { shop, productSlug, query: {}, acceptLanguage: "th", clientKey: k }, N0));
    for (const r of first) eq(r, NF, "ผลต้องเท่ากันทุกสาเหตุ");
    eq(await call("openBookShop", { shop: SS, query: {}, acceptLanguage: "th", clientKey: k }, N0), NF, "รายการของร้านระงับ");
    const rest = await Promise.all(Array.from({ length: limit }, () => call("openBookProduct", { shop: SA, productSlug: guess, query: {}, acceptLanguage: "th", clientKey: k }, N0)));
    ok(rest.some((r) => r.code === "RATE_LIMITED" && r.reason === "LIMIT") && rest.every((r) => r.ok === false && !("vm" in r)), `เกินเพดานเดาต้อง RATE_LIMITED: ${fmt(rest.slice(-2))}`);
    const keys = (await q<{ key: string; count: number }>(`SELECT key, count FROM "ChatRateBucket" WHERE key LIKE $1`, [`%${k}`])).map((r) => r.key);
    eq(keys, [`trips:book:none:${k}`], "ถังของเครื่องนี้");
    const slugRows = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1 OR key LIKE $2`, [`%${guess}%`, `%${slugOf("zz")}%`]);
    eq(slugRows[0]?.n, 0, "ถังที่มี slug ที่เดา");
    eq((await openP({ clientKey: ck() })).ok, true, "เครื่องอื่นยังเปิดร้านได้");
  });
  await st("RL-7", "ไม่มีถัง/แถวที่มี unknown หรือ IP ดิบ: ChatRateBucket (trips:book · trips:view) และ TripLinkStat ของร้านชั่วคราว · OpsEvent ระหว่างรันไม่มี IP/กุญแจเครื่อง", async () => {
    needDb(); sfn("bookPageGate");
    const bad = await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE (key LIKE 'trips:book:%' OR key LIKE 'trips:view:%') AND (key ILIKE '%unknown%' OR key LIKE $1 OR key LIKE '%::/64%' OR key ~ '[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+') LIMIT 3`, [`%${IP_PREFIX}%`]);
    eq(bad.map((r) => r.key), [], "ถังที่มี unknown/IP");
    const mine = await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1 OR key LIKE $2 LIMIT 500`, [`trips:book:${tA}:%`, `trips:view:${uA}:%`]);
    ok(mine.length > 0 && mine.every((r) => /:pc_[0-9a-f]{40}$/.test(r.key)), `ถังต้องลงท้ายด้วยกุญแจ HMAC: ${fmt(mine.find((r) => !/:pc_[0-9a-f]{40}$/.test(r.key)))}`);
    if ((await cols("OpsEvent")).length) {
      const ev = await q<{ t: string }>(`SELECT (coalesce(message, '') || ' ' || coalesce(detail, '')) AS t FROM "OpsEvent" WHERE "createdAt" >= $1 AND source ILIKE 'trips%'`, [T_START]);
      const leak = ev.filter((e) => e.t.includes(IP_PREFIX) || usedClientKeys.some((k) => e.t.includes(k)));
      ok(leak.length === 0, `OpsEvent มี IP/กุญแจ: ${leak[0]?.t.slice(0, 120)}`);
    }
  });
  groupLine("RL");

  // ═══════════════ TK. ตัวนับเปิดดู ═══════════════
  console.log("\n── TK: ตัวนับเปิดดู TripLinkStat (หน่วย uA2 · ล้างก่อนแต่ละข้อ) ──");
  const G2 = (o: Rec = {}) => gateIn({ unit: { id: uA2, tz: "Asia/Bangkok" }, productId: PRD.A2?.id ?? null, ...o });
  const resetStat = async (unit: string) => { await pool.query(`DELETE FROM "TripLinkStat" WHERE "unitId" = $1`, [unit]); await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:view:${unit}:%`]); };
  const setResolver = (f: unknown) => { sfn("registerBookLinkResolver")(f); };
  await st("TK-1", "25 เครื่องเปิดพร้อมกัน ⇒ ทุกคำขอผ่าน counted · แถวเดียว (หน่วย, วันของร้าน 2027-03-01, WEB, linkId null) views = 25 พอดี · starts/paid = 0 · tenantId ถูก", async () => {
    needDb(); await resetStat(uA2);
    const rs = await Promise.all(Array.from({ length: 25 }, () => gate({ ...G2(), clientKey: ck() })));
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => r.counted === true).length, rs.every((r) => r.linkId === null)], [25, 25, true], "ผลด่าน");
    eq(await statRows(uA2), [{ day: "2027-03-01", channel: "WEB", linkId: null, agentAccountId: null, views: 25, starts: 0, paid: 0, tenantId: tA }], "แถว");
  });
  await st("TK-2", "เครื่องเดียวเปิด 25 ครั้งพร้อมกัน (+ ซ้ำอีก 5) ⇒ ผ่านทุกครั้งแต่ views +1 พอดี · counted จริงครั้งเดียว · วันถัดไปของร้านนับใหม่ได้ 1", async () => {
    needDb(); await resetStat(uA2);
    const k = ck();
    const rs = await Promise.all(Array.from({ length: 25 }, () => gate({ ...G2(), clientKey: k })));
    for (let i = 0; i < 5; i++) rs.push(await gate({ ...G2(), clientKey: k }));
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => r.counted === true).length, (await statRows(uA2)).map((r) => r.views)], [30, 1, [1]], "วันเดียว");
    const next = await gate({ ...G2(), clientKey: k }, { now: new Date(Date.parse(NOW0) + 24 * HOUR) });
    eq([next.counted, (await statRows(uA2)).map((r) => [r.day, r.views])], [true, [["2027-03-01", 1], ["2027-03-02", 1]]], "วันถัดไป");
  });
  await st("TK-3", "เพดานแถวต่อวัน: views = BOOK_STAT_ROW_CAP − 1 แล้วอีก 4 เครื่องพร้อมกัน ⇒ views = เพดานพอดี ไม่เกิน · ทุกคำขอยังผ่าน", async () => {
    needDb(); await resetStat(uA2);
    const cap = Number(coreV("BOOK_STAT_ROW_CAP"));
    ok((await gate({ ...G2(), clientKey: ck() })).ok === true, "สร้างแถวแรก");
    await pool.query(`UPDATE "TripLinkStat" SET views = $2 WHERE "unitId" = $1`, [uA2, cap - 1]);
    const rs = await Promise.all(Array.from({ length: 4 }, () => gate({ ...G2(), clientKey: ck() })));
    eq([rs.every((r) => r.ok === true), (await statRows(uA2)).map((r) => r.views)], [true, [cap]], "เพดาน");
  });
  await st("TK-4", "วันนับตามเขตเวลาของหน่วย: กรุงเทพ 23:59 = 1 มี.ค. · 00:00 = 2 มี.ค. · หน่วยโตเกียว ณ เวลาเดียวกัน (16:59Z) = 2 มี.ค. แล้ว · แถวแยกตามหน่วย ไม่ปนกัน", async () => {
    needDb(); await resetStat(uA2); await resetStat(uT);
    await gate({ ...G2(), clientKey: ck() }, { now: new Date("2027-03-01T16:59:00.000Z") });
    await gate({ ...G2(), clientKey: ck() }, { now: new Date("2027-03-01T17:00:00.000Z") });
    await gate({ ...gateIn({ unit: { id: uT, tz: "Asia/Tokyo" }, productId: PRD.AT.id }), clientKey: ck() }, { now: new Date("2027-03-01T16:59:00.000Z") });
    eq([(await statRows(uA2)).map((r) => [r.day, r.views]), (await statRows(uT)).map((r) => [r.day, r.views])], [[["2027-03-01", 1], ["2027-03-02", 1]], [["2027-03-02", 1]]], "วัน");
    const viaOpen = await call("openBookProduct", { shop: SA, productSlug: PRD.AT.slug, query: {}, acceptLanguage: "en", clientKey: ck() }, { now: new Date("2027-03-01T14:00:00.000Z") });
    eq([viaOpen.ok, (await statRows(uT)).map((r) => [r.day, r.views])], [true, [["2027-03-01", 1], ["2027-03-02", 1]]], "openBookProduct ใช้ tz ของหน่วยสินค้า (23:00 โตเกียว = 1 มี.ค.)");
  });
  await st("TK-5", "หน้ารายการและคำขอไม่พบไม่นับ views · หน่วยที่ไม่ใช่ของร้านนั้น/ไม่ใช่ TRIPS/พักอยู่ ⇒ ไม่มีแถว (ด่านไม่เชื่อ id ที่ส่งมาเกินร้านที่ resolve แล้ว) · counted false", async () => {
    needDb(); await resetStat(uA2); await resetStat(uB); await resetStat(uAb); await resetStat(uAp);
    ok((await call("openBookShop", { shop: SA, query: {}, acceptLanguage: "th", clientKey: ck() }, N0)).ok === true, "openBookShop");
    const a = await gate({ ...gateIn({ unit: null, productId: null }), clientKey: ck() });
    const cross = await gate({ ...gateIn({ tenantId: tA, unit: { id: uB, tz: "Asia/Bangkok" }, productId: PRD.B.id }), clientKey: ck() });
    const wrongType = await gate({ ...gateIn({ unit: { id: uAb, tz: "Asia/Bangkok" }, productId: PRD.WRONGU.id }), clientKey: ck() });
    const paused = await gate({ ...gateIn({ unit: { id: uAp, tz: "Asia/Bangkok" }, productId: PRD.PAUSED.id }), clientKey: ck() });
    const n = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripLinkStat" WHERE "unitId" = ANY($1::text[])`, [[uA2, uB, uAb, uAp]]);
    eq([a.ok, a.counted, cross.counted === true, wrongType.counted === true, paused.counted === true, n[0]?.n], [true, false, false, false, false, 0], "ไม่นับ");
  });
  await st("TK-6", "?a ผ่านช่องเสียบ: ยังไม่ลงทะเบียน ⇒ ไม่ผูก (linkId null) · ลงทะเบียนแล้ว: รหัสของร้านนี้ ⇒ แถว (linkId, agentAccountId) แยกจากแถว null · ตัวแก้ได้ tenantId ของร้านที่ resolve เสมอ · รหัสร้านอื่น/ปิด/ผูกสินค้าอื่น/ตัวแก้ throw ⇒ นับใต้ null หน้าไม่ล้ม · รหัสผิดรูปไม่ถูกส่งถึงตัวแก้", async () => {
    needDb(); await resetStat(uA2);
    const openA2 = (a: unknown, key = ck()) => call("openBookProduct", { shop: SA, productSlug: PRD.A2.slug, query: { a }, acceptLanguage: "th", clientKey: key }, N0);
    setResolver(null);
    const none = await openA2("PTD1");
    eq([none.ok, asRec(none.carry)?.a, (await statRows(uA2)).map((r) => [r.linkId, r.views])], [true, null, [[null, 1]]], "ยังไม่ลงทะเบียน");
    const seen: Rec[] = [];
    const L1 = rid("link"), AG = rid("agent");
    try {
      setResolver(async (x: unknown) => {
        const i = asRec(x) ?? {}; seen.push(i);
        if (i.tenantId !== tA) return null;
        if (i.code === "PTD1") return { linkId: L1, agentAccountId: AG, productId: null, active: true };
        if (i.code === "ONLYA2") return { linkId: `${L1}b`, agentAccountId: AG, productId: PRD.A2.id, active: true };
        if (i.code === "OTHERP") return { linkId: `${L1}c`, agentAccountId: AG, productId: PRD.A.id, active: true };
        if (i.code === "OFF") return { linkId: `${L1}d`, agentAccountId: AG, productId: null, active: false };
        if (i.code === "BOOM") throw new Error("resolver down");
        return null;
      });
      const r1 = await openA2("PTD1"), r1b = await openA2("PTD1"), r2 = await openA2("ONLYA2");
      eq([r1.ok, asRec(r1.carry)?.a, r1b.ok, r2.ok, asRec(r2.carry)?.a], [true, "PTD1", true, true, "ONLYA2"], "ผูก");
      for (const code of ["OTHERP", "OFF", "BOOM", "NOSUCH"]) { const r = await openA2(code); eq([r.ok, asRec(r.carry)?.a], [true, null], `ไม่ผูก ${code}`); }
      const before = seen.length;
      for (const bad of ["../x", "a b", "x".repeat(33), "", ["PTD1"], 5, "PTD1;DROP"]) ok((await openA2(bad)).ok === true, `รหัสผิดรูป ${fmt(bad)}`);
      eq(seen.length, before, "ตัวแก้ถูกเรียกด้วยรหัสผิดรูป");
      ok(seen.length > 0 && seen.every((s) => s.tenantId === tA && typeof s.code === "string"), `ตัวแก้ต้องได้ tenantId ของร้าน: ${fmt(seen[0])}`);
      const other = await call("openBookProduct", { shop: SB, productSlug: PRD.BONLY.slug, query: { a: "PTD1" }, acceptLanguage: "th", clientKey: ck() }, N0);
      eq([other.ok, asRec(other.carry)?.a, seen[seen.length - 1]?.tenantId, (await statRows(uB)).map((r) => [r.linkId, r.views, r.tenantId])], [true, null, tB, [[null, 1, tB]]], "รหัสของร้าน A ใต้ร้าน B");
      eq((await statRows(uA2)).map((r) => [r.linkId, r.agentAccountId, r.views]), [[null, null, 12], [L1, AG, 2], [`${L1}b`, AG, 1]], "แถวของหน่วย (null = 1 + 4 ไม่ผูก + 7 ผิดรูป)");
      const vmS = JSON.stringify(r1.vm ?? {});
      ok(!vmS.includes(L1) && !vmS.includes(AG), "VM มี linkId/agentAccountId");
    } finally { setResolver(null); }
  });
  await st("TK-7", "openBookProduct ครบเส้น: เปิดครั้งแรก ⇒ vm + views 1 · เครื่องเดิมเปิดซ้ำ/เปลี่ยนภาษา/เปลี่ยนวัน ⇒ ยังได้ vm แต่ไม่นับเพิ่ม · carry.lang ตาม ?lang · ?s ถูกทิ้ง (ไม่อยู่ใน carry/vm/แถว) · ?d/?m ไปถึงตัวโหลด", async () => {
    needDb(); await resetStat(uA);
    const k = ck();
    const r1 = await openP({ clientKey: k, query: { lang: "en", s: "mint_01", d: "2027-03-15", m: "2027-03" } });
    ok(r1.ok === true, fmt(r1));
    const vm = asRec(r1.vm) ?? {};
    eq([vm.locale, asRec(vm.selected)?.date, vm.month, r1.carry, (await statRows(uA)).map((r) => [r.day, r.channel, r.linkId, r.views])], ["en", "2027-03-15", "2027-03", { lang: "en", a: null }, [["2027-03-01", "WEB", null, 1]]], "ครั้งแรก");
    ok(!JSON.stringify(r1).includes("mint_01"), "?s หลุดไปในผล");
    for (const query of [{}, { lang: "th" }, { d: "2027-03-10" }, { m: "2027-04" }]) ok((await openP({ clientKey: k, query })).ok === true, `เปิดซ้ำ ${fmt(query)}`);
    eq((await statRows(uA)).map((r) => r.views), [1], "ไม่นับซ้ำ");
    const viaHeader = await openP({ clientKey: ck(), acceptLanguage: "en-US,en;q=0.9", query: null });
    eq([viaHeader.ok, asRec(viaHeader.vm)?.locale, asRec(viaHeader.carry)?.lang, (await statRows(uA)).map((r) => r.views)], [true, "en", null, [2]], "query ขยะ + ภาษาจากหัว");
    noInternal(vm, allIds, "vm ของ openBookProduct");
  });
  await st("TK-8", "ผลของ openBookShop: vm รายการ + carry · ไม่มีแถวสถิติของทุกหน่วยในร้าน · เปิดร้านที่มีสินค้ามากกว่าเพดานการ์ดไม่ต้องทดสอบที่นี่ (เพดาน = take ในคิวรี) — ตรวจ shown ≤ BOOK_PRODUCT_CAP และ total ตรงฐาน", async () => {
    needDb(); await resetStat(uA); await resetStat(uA2); await resetStat(uT);
    const r = await call("openBookShop", { shop: SA, query: { lang: "en", a: "PTD1" }, acceptLanguage: "th", clientKey: ck() }, N0);
    ok(r.ok === true, fmt(r));
    const vm = asRec(r.vm) ?? {};
    const n = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripProduct" p JOIN "BusinessUnit" u ON u.id = p."unitId" WHERE p."tenantId" = $1 AND p.status = 'ACTIVE' AND p."productType" = 'TOUR' AND u.type::text = 'TRIPS' AND u.status::text = 'ACTIVE'`, [tA]);
    eq([vm.locale, vm.total, Number(vm.shown) <= Number(coreV("BOOK_PRODUCT_CAP")), vm.truncated, r.carry], ["en", n[0]?.n, true, false, { lang: "en", a: null }], "รายการ");
    const s = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripLinkStat" WHERE "tenantId" = $1`, [tA]);
    eq(s[0]?.n, 0, "แถวสถิติ");
  });
  await st("TK-9", "แถว TripLinkStat/ถังของร้านชั่วคราวไม่มีข้อมูลบุคคล: ไม่มี IP ดิบ/กุญแจเครื่องในคอลัมน์ใดของ TripLinkStat · channel ⊂ WEB/LIFF/EMBED · ตัวนับไม่ติดลบ ไม่เกินเพดาน", async () => {
    needDb(); sfn("bookPageGate");
    await gate({ ...G2({ channel: "LIFF" }), clientKey: ck() }); await gate({ ...G2({ channel: "EMBED" }), clientKey: ck() }); await gate({ ...G2(), clientKey: ck() });
    const rows = await q<Rec>(`SELECT * FROM "TripLinkStat" WHERE "tenantId" = ANY($1::text[])`, [[tA, tB]]);
    ok(rows.length >= 3, "ต้องมีแถวจากข้อก่อนหน้า");
    const s = JSON.stringify(rows);
    ok(!s.includes(IP_PREFIX) && !usedClientKeys.some((k) => s.includes(k)), "TripLinkStat มี IP/กุญแจเครื่อง");
    const cap = Number(coreV("BOOK_STAT_ROW_CAP"));
    ok(rows.every((r) => ["WEB", "LIFF", "EMBED"].includes(String(r.channel)) && Number(r.views) >= 0 && Number(r.views) <= cap && Number(r.starts) === 0 && Number(r.paid) === 0), `แถวผิดรูป: ${fmt(rows.find((r) => Number(r.starts) !== 0 || Number(r.paid) !== 0))}`);
    eq((await statRows(uA2)).filter((r) => r.day === "2027-03-01").map((r) => r.channel).sort(), ["EMBED", "LIFF", "WEB"], "แถวแยกตามช่องทาง");
  });
  groupLine("TK");

  // ═══════════════ XR. มติผู้คุมหลังตรวจรอบ 1 (X2–X11) ═══════════════
  console.log("\n── XR: มติผู้คุมหลังตรวจรอบ 1 — ผู้ใช้คือใคร · ราคาคนเดียว · วันเดียวหลายรอบ · นับเมื่อหน้าแสดงได้จริง · ธงยังไม่แปล · โลโก้/DST · VAT เพิ่ม (ร้านชั่วคราว x) ──");
  const tX = rid("tX"), uX = rid("uX"), uV = rid("uV"), uNY = rid("uNY");
  const SX = slugOf("x");
  const X_NAME = `ร้านมติ ${STAMP}`;
  const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const hdr = (o: Record<string, string>) => (n: string) => o[n.toLowerCase()] ?? null;
  let xErr = "";
  let xActor: Actor | null = null;
  const XP: Record<string, Prod> = {};
  const XDEP: Record<string, string> = {};
  const X_GROUP_BP = 2_000;
  const X_DEP_PRICE = 200_000;
  const mkX = async (key: string, unitId: string, o: { thaiOnly?: boolean } = {}) => {
    const id = rid(`p${key}`), opt = rid(`o${key}`);
    const slug = `w11qc-${key.toLowerCase()}-${STAMP}`;
    const both = (th: string, en: string) => JSON.stringify(o.thaiOnly ? { th } : { th, en });
    await insertRow("TripProduct", { id, tenantId: tX, unitId, slug, productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: both(`มติ ${key}`, `Ruling ${key}`),
      body: JSON.stringify({ summary: o.thaiOnly ? { th: `สรุป ${key}` } : { th: `สรุป ${key}`, en: `Summary ${key}` }, itinerary: { th: `กำหนดการ ${key}` }, includes: { th: `รวม ${key}`, en: `Includes ${key}` } }), currency: "THB", deepDive: false, crossBorder: false,
      publishedAt: new Date(Date.parse("2027-01-02T00:00:00Z") + Object.keys(XP).length * 60_000), updatedAt: new Date() });
    await insertRow("TripOption", { id: opt, tenantId: tX, unitId, productId: id, name: both("ร่วมกลุ่ม", "Join-in"), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
    const pt: Record<string, string> = {};
    for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId: tX, unitId, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code === "ADULT" ? "Adult" : code === "CHILD" ? "Child" : "Infant" }), countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
    const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId: tX, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: R.parkAdultSatang, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
      name: both("ค่าธรรมเนียมท่าเรือ", "Pier fee"), paxPrices: JSON.stringify({ ADULT: R.parkAdultSatang, CHILD: R.parkChildSatang }), active: true, updatedAt: new Date() });
    const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId: tX, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: R.extras.camera.satang, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
      name: both("เช่ากล้องกันน้ำ", "Waterproof camera"), note: both("คืนกล้องที่ท่าเรือ", "Return at the pier"), active: true, updatedAt: new Date() });
    for (const [code, amount] of [["ADULT", 123_400], ["CHILD", 56_700], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId: tX, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
    XP[key] = { id, slug, opt, unit: unitId, tenant: tX, pt, cam, park };
    PRD[`X_${key}`] = XP[key] as Prod;
    allIds.push(id, opt, park, cam, ...Object.values(pt));
  };
  /** รอบของสินค้าในร้าน x (เวลาร้านกรุงเทพ) — คืน id · จด XDEP[tag] */
  const xDep = async (tag: string, key: string, date: string, hm: string, o: { capacity?: number; sold?: number; status?: string } = {}) => { const id = await mkDep(`X_${key}`, date, { ...o, hm }); XDEP[tag] = id; return id; };
  const depPrice = async (key: string, depId: string, amount: number) => insertRow("TripPrice", { id: rid("prd"), tenantId: tX, unitId: XP[key]?.unit, productId: XP[key]?.id, optionId: null, paxTypeId: XP[key]?.pt.ADULT, cabinTypeId: null, seasonId: null, departureId: depId, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 10, updatedAt: new Date() });
  try {
    if (setupErr) throw new Error(`ร้านชั่วคราวหลักตั้งไม่ได้: ${setupErr}`);
    await insertRow("Tenant", { id: tX, name: X_NAME, slug: SX, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(tX); allIds.push(tX, uX, uV, uNY);
    for (const [id, tag, s] of [[uX, "x", {}], [uV, "xv", {}], [uNY, "xny", { timezone: "America/New_York" }]] as const)
      await insertRow("BusinessUnit", { id, tenantId: tX, type: "TRIPS", status: "ACTIVE", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify(s), updatedAt: new Date() });
    const ux = rid("uox");
    await insertRow("User", { id: ux, email: `${EMAIL_PREFIX}ox-${STAMP}@shark.local`, name: "ผู้ทดสอบ ox", updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mbox"), userId: ux, tenantId: tX, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    xActor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ux };
    await mkX("S", uX); await mkX("G", uX); await mkX("T", uX, { thaiOnly: true }); await mkX("V", uV); await mkX("NY", uNY); await mkX("HID", uX);
    await pool.query(`UPDATE "TripProduct" SET status = 'DRAFT' WHERE id = $1`, [XP.HID?.id]);
    // สินค้า S (หน่วยกรุงเทพ · มี.ค. 2570): 10 รอบเดียว · 15 สองรอบขายได้ (07:00 เหลือ 5 · 13:00 ว่าง 40 ราคาผู้ใหญ่เฉพาะรอบ 2,000) · 16 รอบเช้าขายหมด + รอบบ่ายราคาเฉพาะรอบ
    //   17 รอบเช้าสถานะ FULL (ขายหมด — ระบบตั้งสถานะนี้เองเมื่อเต็ม) + รอบบ่ายเปิด · 18 มีแต่รอบ FULL · 20 สิบรอบ (สามรอบแรกขายหมด) — เกินเพดาน 8
    await xDep("s10", "S", "2027-03-10", "08:00", { sold: 4 });
    await xDep("s15a", "S", "2027-03-15", "07:00", { capacity: 10, sold: 5 }); await xDep("s15b", "S", "2027-03-15", "13:00", { capacity: 40, sold: 0 });
    await xDep("s16a", "S", "2027-03-16", "07:00", { capacity: 10, sold: 10 }); await xDep("s16b", "S", "2027-03-16", "13:00", { capacity: 40, sold: 1 });
    await xDep("s17a", "S", "2027-03-17", "07:00", { capacity: 10, sold: 10, status: "FULL" }); await xDep("s17b", "S", "2027-03-17", "13:00", { capacity: 40, sold: 2 });
    await xDep("s18", "S", "2027-03-18", "08:00", { capacity: 10, sold: 10, status: "FULL" });
    for (let i = 0; i < 10; i++) await xDep(`s20_${i}`, "S", "2027-03-20", `${String(6 + i).padStart(2, "0")}:00`, { capacity: 10, sold: i < 3 ? 10 : i });
    for (const tag of ["s15b", "s16b"]) await depPrice("S", XDEP[tag] ?? "", X_DEP_PRICE);
    await xDep("g10", "G", "2027-03-10", "08:00", { sold: 0 });
    await insertRow("TripPriceRule", { id: rid("ru"), tenantId: tX, unitId: uX, productId: XP.G?.id, kind: "GROUP_TIER", params: JSON.stringify({ kind: "GROUP_TIER", tiers: [{ minPax: 2, discountBp: X_GROUP_BP }] }), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
    await xDep("t10", "T", "2027-03-10", "08:00", { sold: 1 });
    await xDep("v10", "V", "2027-03-10", "08:00", { sold: 1 });
    // หน่วยนิวยอร์ก (เวลาออมแสงเริ่ม 14 มี.ค. 2570): 10 มี.ค. 08:00 EST (−300) · 20 มี.ค. 08:00 EDT (−240) · 10 ก.ค. 08:00 EDT (−240)
    for (const [tag, date, iso] of [["ny0310", "2027-03-10", "2027-03-10T13:00:00.000Z"], ["ny0320", "2027-03-20", "2027-03-20T12:00:00.000Z"], ["ny0710", "2027-07-10", "2027-07-10T12:00:00.000Z"]] as const) {
      const startsAt = new Date(iso); const id = rid("d");
      await insertRow("TripDeparture", { id, tenantId: tX, unitId: uNY, productId: XP.NY?.id, optionId: XP.NY?.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * HOUR), status: "OPEN", capacity: 40, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
      XDEP[tag] = id; allIds.push(id);
    }
    const r = asRec(await S("setSettings")(xActor, { tenantId: tX }, [{ key: "trips.tax.priceIncludesVat", scope: "UNIT", scopeId: uV, value: false },
      { key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uV, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } }], { ackLegalWarn: true })) ?? {};
    if (r.ok !== true) throw new Error(`ตั้งค่าตั้งภาษีของหน่วย xv ไม่ได้: ${fmt(r)}`);
  } catch (e) { xErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราว x ไม่สำเร็จ: ${xErr}`); }
  const needX = () => { ok(!xErr && XP.S && XP.NY, `ไม่มีร้าน/สินค้าทดสอบของกลุ่ม XR (${xErr || "ยังไม่ตั้ง"})`); };
  const loadX = async (key: string, i: Rec = {}, o: Rec = N0) => VM(await call("loadBookProductVM", { shop: SX, productSlug: XP[key]?.slug, lang: "en", month: "2027-03", ...i }, o), `loadBookProductVM ${key} ${fmt(i)}`);
  const selOf = (vm: Rec) => asRec(vm.selected) ?? {};
  const slotsOf = (vm: Rec) => asArr(selOf(vm).slots);
  const openX = (key: string, i: Rec = {}, o: Rec = N0) => call("openBookProduct", { shop: SX, productSlug: XP[key]?.slug, query: {}, acceptLanguage: "en", ...i }, o);
  const xCtx = (unitId: string, locale = "en") => ({ tenantId: tX, unitId, channel: "WEB", actor: { kind: "PUBLIC", clientKey: "w11qc-oracle" }, now: new Date(NOW0), locale });
  /** ใบเสนอที่ข้อสอบขอเอง (บริการราคาที่รับแล้ว) */
  const quoteX = async (key: string, depTag: string, pax: [string, number][], extras: string[] = []): Promise<Rec> => {
    const p = XP[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const r = asRec(await tfn("quoteTripLine")(xCtx(p.unit), { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: XDEP[depTag], optionId: p.opt, pax: pax.map(([code, qty]) => ({ paxTypeId: p.pt[code], qty })), extras: extras.map((extraId) => ({ extraId, qty: 1 })) })) ?? {};
    ok(r.ok === true, `quoteTripLine ${key}/${depTag} ${fmt(pax)}: ${fmt(r).slice(0, 200)}`);
    return asRec(r.value) ?? {};
  };
  const seatOf = (v: Rec, key: string, code: string) => asArr(v.items).find((i) => i.kind === "SEAT" && i.paxTypeId === XP[key]?.pt[code]) ?? {};
  const availX = async (key: string, from: string, to: string): Promise<Rec[]> => {
    const p = XP[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const av = asRec(await tfn("listAvailability")(xCtx(p.unit), { productId: p.id, from, to })) ?? {};
    ok(av.ok === true, `listAvailability ${key}: ${fmt(av).slice(0, 200)}`);
    return asArr(av.value).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  };
  const viewsX = async (unit = uX) => (await statRows(unit)).reduce((s, r) => s + r.views, 0);
  const viewBucketsX = async (k: string, unit = uX) => Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:view:${unit}:%${k}`]))[0]?.n);
  const sqlTextOf = (sql: unknown): string => { const r = asRec(sql); return typeof r?.sql === "string" ? r.sql : Array.isArray(r?.strings) ? (r?.strings as unknown[]).join("?") : String(sql); };
  const spyOpts = (hook?: (n: number, isStat: boolean) => Promise<void> | void) => { const seen: boolean[] = []; return { seen, o: { now: new Date(NOW0), deps: { query: async (sql: unknown) => { const isStat = /"TripLinkStat"/.test(sqlTextOf(sql)); seen.push(isStat); if (hook) await hook(seen.length, isStat); return realQuery(sql); } } } }; };
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  await st("XR-1", "มติ X2 (core): ลำดับหัว IP = x-real-ip → x-vercel-forwarded-for → x-forwarded-for (ค่าคงที่ส่งออก ที่เดียว) · ที่อยู่ของเครื่องเซิร์ฟเวอร์เอง (127/8 · ::1 · ::ffff:127.x · 0.0.0.0 · มีพอร์ต/วงเล็บ) ⇒ null เป็นปริยาย ไม่ไล่หัวถัดไป · allowLoopback: true เท่านั้นจึงยอม · ไม่มีหัวเลย ⇒ null ทุกโหมด · IP จริงไม่กระทบ", () => {
    const f = P("clientIpFromHeaders");
    eq(coreV("BOOK_IP_HEADERS"), ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"], "BOOK_IP_HEADERS");
    const loop = ["127.0.0.1", "127.8.9.1", "127.0.0.1:3241", "::1", "[::1]:3241", "::ffff:127.0.0.1", "0.0.0.0", " 127.0.0.1 ", "127.0.0.1, 198.51.100.9"];
    for (const name of ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"]) {
      eq(loop.map((v) => f(hdr({ [name]: v }))), loop.map(() => null), `${name}: ที่อยู่เครื่องเอง ⇒ null (ปริยาย)`);
      eq(loop.map((v) => f(hdr({ [name]: v }), { allowLoopback: false })), loop.map(() => null), `${name}: allowLoopback false`);
      ok(loop.every((v) => typeof f(hdr({ [name]: v }), { allowLoopback: true }) === "string"), `${name}: allowLoopback true ต้องได้ค่า`);
    }
    eq([f(hdr({ "x-real-ip": "127.0.0.1", "x-forwarded-for": "198.51.100.9" })), f(hdr({ "x-vercel-forwarded-for": "::1", "x-forwarded-for": "198.51.100.9" })), f(hdr({ "x-real-ip": "127.0.0.1", "x-forwarded-for": "198.51.100.9" }), { allowLoopback: true })],
      [null, null, "127.0.0.1"], "หัวแรกเป็นตัวตัดสิน — ที่อยู่เครื่องเองไม่ทำให้ไล่ไปหัวที่ผู้ใช้ส่งมาได้");
    eq([f(hdr({}), { allowLoopback: true }), f(() => undefined, { allowLoopback: true }), f(() => { throw new Error("x"); }, { allowLoopback: true })], [null, null, null], "ไม่มีหัว/อ่านหัวไม่ได้ ⇒ null แม้ยอม loopback");
    eq([f(hdr({ "x-forwarded-for": "198.51.100.9" })), f(hdr({ "x-forwarded-for": "198.51.100.9" }), { allowLoopback: true }), f(hdr({ "x-real-ip": "203.0.113.5", "x-vercel-forwarded-for": "198.51.100.1", "x-forwarded-for": "127.0.0.1" })),
      f(hdr({ "x-vercel-forwarded-for": "198.51.100.1", "x-forwarded-for": "198.51.100.9" })), f(hdr({ "x-forwarded-for": "128.0.0.1" })), f(hdr({ "x-forwarded-for": "2001:db8:1:2::9" }))],
      ["198.51.100.9", "198.51.100.9", "203.0.113.5", "198.51.100.1", "128.0.0.1", "2001:db8:1:2::/64"], "IP จริง + ลำดับหัว");
    const others = [SVC, CATALOG, ...appFiles, ...compFiles].filter((x) => /x-real-ip|x-forwarded-for|x-vercel-forwarded-for/i.test(stripComments(read(x))));
    eq(others, [], "ชื่อหัว IP ต้องอยู่ใน trips-public-core ที่เดียว");
  });
  await st("XR-2", "มติ X2(ข) (ฝั่งเซิร์ฟเวอร์ · bookRequestFromHeaders): production + ไม่มีหัว IP / เป็นที่อยู่เครื่องเอง ⇒ clientKey null ⇒ หน้ารายการและหน้าสินค้าปิด (NO_CLIENT · ไม่ถามฐาน · ไม่มีถังของ 127.0.0.1) · production + IP จริง ⇒ กุญแจของหัวตามลำดับ (x-real-ip ชนะ) · นอก production ยอม loopback แต่ไม่มีหัวยังปิด · สลับ NODE_ENV มีผลทันที (ไม่จำค่า)", async () => {
    needX();
    const brf = sfn("bookRequestFromHeaders"), key = sfn("bookClientKey");
    const env = process.env as Record<string, string | undefined>;
    const keep = env.NODE_ENV;
    const run = (mode: string | undefined, headers: Record<string, string>): Rec => {
      if (mode === undefined) delete env.NODE_ENV; else env.NODE_ENV = mode;
      try { return asRec(brf(hdr({ "user-agent": BROWSER_UA, ...headers }), "GET")) ?? {}; } finally { if (keep === undefined) delete env.NODE_ENV; else env.NODE_ENV = keep; }
    };
    const loKey = key("127.0.0.1");
    ok(typeof loKey === "string", "bookClientKey(127.0.0.1) ต้องทำกุญแจได้ (ตัวปิดอยู่ที่ตัวอ่านหัว ไม่ใช่ตัวทำกุญแจ)");
    usedClientKeys.push(String(loKey));
    const loop = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "127.0.0.1:55001", "0.0.0.0"];
    eq([run("production", {}).clientKey, loop.map((v) => run("production", { "x-forwarded-for": v }).clientKey), loop.map((v) => run("production", { "x-real-ip": v, "x-forwarded-for": "198.51.100.9" }).clientKey)], [null, loop.map(() => null), loop.map(() => null)], "production: ไม่มีหัว / loopback ⇒ ปิด");
    eq([run("production", { "x-forwarded-for": "198.51.100.9" }).clientKey, run("production", { "x-real-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.9" }).clientKey, run("production", { "x-vercel-forwarded-for": "203.0.113.6", "x-forwarded-for": "198.51.100.9" }).clientKey,
      run("production", { "x-real-ip": "not-an-ip", "x-forwarded-for": "198.51.100.9" }).clientKey, run("production", { "x-forwarded-for": "198.51.100.9", "accept-language": "en-GB" }).acceptLanguage],
      [key("198.51.100.9"), key("203.0.113.5"), key("203.0.113.6"), null, "en-GB"], "production: IP จริงตามลำดับหัว");
    for (const mode of ["development", "test", undefined]) eq([run(mode, { "x-forwarded-for": "127.0.0.1" }).clientKey, run(mode, { "x-forwarded-for": "::1" }).clientKey === key("::1"), run(mode, {}).clientKey, run(mode, { "x-forwarded-for": "198.51.100.9" }).clientKey],
      [loKey, true, null, key("198.51.100.9")], `นอก production (${String(mode)}): ยอม loopback · ไม่มีหัวยังปิด`);
    eq(run("production", { "x-forwarded-for": "127.0.0.1" }).clientKey, null, "กลับเป็น production แล้วต้องปิดทันที (ไม่จำผลของโหมดก่อน)");
    const thrown = (() => { env.NODE_ENV = "production"; try { return asRec(brf(() => { throw new Error("no headers"); }, "GET")) ?? {}; } finally { if (keep === undefined) delete env.NODE_ENV; else env.NODE_ENV = keep; } })();
    eq([thrown.clientKey, thrown.countView], [null, false], "อ่านหัวไม่ได้ ⇒ ปิด + ไม่นับ");
    // ครบเส้น: คำขอ production ที่ไม่มีหัว IP เปิดทั้งสองหน้าไม่ได้ และไม่แตะฐานเลย
    const req0 = run("production", {});
    const spy = spyOpts();
    const a = await call("openBookShop", { shop: SX, query: {}, acceptLanguage: req0.acceptLanguage, clientKey: req0.clientKey }, spy.o), b = await openX("S", { clientKey: req0.clientKey, countView: req0.countView }, spy.o);
    for (const r of [a, b]) eq([r.ok, r.code, r.reason, "vm" in r], [false, "RATE_LIMITED", "NO_CLIENT", false], "ผลของหน้า");
    eq(spy.seen.length, 0, "จำนวนคำสั่งของด่าน/ตัวนับ");
    const lo = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [[`trips:book:${tX}:${String(loKey)}`, `trips:book:none:${String(loKey)}`, `trips:view:${uX}:2027-03-01:WEB:-:${String(loKey)}`]]);
    eq(lo[0]?.n, 0, "ถังของ 127.0.0.1");
  });
  await st("XR-3", "มติ X6 (core · bookViewCountable): นับเฉพาะ GET ของเบราว์เซอร์ที่คนเปิดเอง (รวมเบราว์เซอร์ในแอป LINE/Facebook) · ไม่นับ method อื่น · คำขอมีเนื้อความ · Sec-Purpose / Purpose / Next-Router-Prefetch · บอต/ตัวทำภาพตัวอย่างลิงก์ · ไม่มี User-Agent · อ่านหัวไม่ได้ — รายการอยู่ใน core ที่เดียว", () => {
    const f = P("bookViewCountable");
    const c = (method: unknown, headers: Record<string, string>) => f({ method, get: hdr(headers) });
    const B = { "user-agent": BROWSER_UA };
    const humans = [BROWSER_UA, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0", "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]"];
    eq([...humans.map((ua) => c("GET", { "user-agent": ua })), c(undefined, B), c(null, B), c("get", B), c("GET", { ...B, "content-length": "0" }), c("GET", { ...B, "sec-purpose": "" })], [...humans.map(() => true), true, true, true, true, true], "คนเปิดเอง ⇒ นับ");
    eq(["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "head", "TRACE"].map((m) => c(m, B)), Array(8).fill(false), "method อื่นนอกจาก GET");
    eq([c(undefined, { ...B, "content-type": "application/x-www-form-urlencoded" }), c(undefined, { ...B, "content-length": "3" }), c(undefined, { ...B, "transfer-encoding": "chunked" }), c(undefined, { ...B, "next-action": "0123456789abcdef" })], [false, false, false, false], "คำขอมีเนื้อความ/คำสั่ง (ไม่รู้ method)");
    eq([c("GET", { ...B, "sec-purpose": "prefetch" }), c("GET", { ...B, "sec-purpose": "prefetch;prerender" }), c("GET", { ...B, "sec-purpose": "Prefetch" }), c("GET", { ...B, purpose: "prefetch" }), c("GET", { ...B, purpose: "preview" }),
      c("GET", { ...B, "next-router-prefetch": "1" }), c("GET", { ...B, rsc: "1", "next-router-prefetch": "1", "next-router-segment-prefetch": "/_tree" })], Array(7).fill(false), "โหลดล่วงหน้า");
    const bots = ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "facebookexternalhit/1.1;line-poker/1.0",
      "Twitterbot/1.0", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "WhatsApp/2.23.20.0", "TelegramBot (like TwitterBot)", "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", "curl/8.4.0", "python-requests/2.31.0", "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/126.0.0.0 Safari/537.36"];
    eq(bots.map((ua) => c("GET", { "user-agent": ua })), bots.map(() => false), "บอต/ตัวทำภาพตัวอย่างลิงก์");
    eq([c("GET", {}), c("GET", { "user-agent": "  " }), f({ method: "GET", get: () => { throw new Error("x"); } }), f({ method: "GET", get: () => undefined })], [false, false, false, false], "ไม่มี User-Agent / อ่านหัวไม่ได้");
    const lists = ["BOOK_PURPOSE_HEADERS", "BOOK_PREFETCH_FLAG_HEADERS", "BOOK_BOT_UA_MARKS"].map((n) => coreV(n));
    ok(lists.every((l) => Array.isArray(l) && l.length > 0 && l.every((x) => typeof x === "string" && x === x.toLowerCase())), "รายการหัว/คำของบอตต้องเป็นอาร์เรย์สตริงตัวเล็กที่ส่งออกจาก core");
    const dup = [SVC, CATALOG, ...appFiles, ...compFiles].filter((x) => /sec-purpose|next-router-prefetch|googlebot|facebookexternalhit|user-agent/i.test(stripComments(read(x))));
    eq(dup, [], "รายการ prefetch/บอต/การอ่าน User-Agent ต้องอยู่ใน trips-public-core ที่เดียว");
    // ตัวอ่านคำขอของหน้าใช้ตัวตัดสินตัวนี้
    const brf = sfn("bookRequestFromHeaders");
    const cv = (headers: Record<string, string>, method?: unknown) => asRec(brf(hdr({ "x-forwarded-for": "198.51.100.9", ...headers }), method))?.countView;
    eq([cv(B), cv(B, "GET"), cv(B, "HEAD"), cv(B, "POST"), cv({ ...B, "sec-purpose": "prefetch" }), cv({ ...B, "next-router-prefetch": "1" }), cv({ "user-agent": bots[0] ?? "" }), cv({ "user-agent": bots[2] ?? "" }), cv({})], [true, true, false, false, false, false, false, false, false], "bookRequestFromHeaders.countView");
  });
  await st("XR-4", "มติ X6 (ครบเส้น · openBookProduct บนร้าน x): คน GET ครั้งแรก ⇒ views +1 พอดี (ด่าน 1 คำสั่ง → นับ 1 คำสั่งหลัง VM) · เปิดซ้ำ +0 · ไม่พบ/สินค้าร่าง/สินค้าร้านอื่น +0 · ถูกจำกัด +0 ไม่มีคำสั่งนับ · prefetch/บอต/HEAD/POST (ผ่าน bookRequestFromHeaders) ได้หน้าแต่ +0 และไม่เกิดถังกันนับซ้ำ · สินค้าถูกถอนระหว่างด่านกับตัวโหลด (หน้าแสดงไม่ได้) ⇒ ไม่นับ · คำสั่งนับล้ม ⇒ ไม่ throw", async () => {
    needX(); await resetStat(uX);
    const brf = sfn("bookRequestFromHeaders");
    const reqOf = (ip: string, headers: Record<string, string>, method?: unknown): Rec => { const r = asRec(brf(hdr({ "x-forwarded-for": ip, ...headers }), method)) ?? {}; if (typeof r.clientKey === "string") usedClientKeys.push(r.clientKey); return r; };
    const B = { "user-agent": BROWSER_UA };
    const viaReq = async (headers: Record<string, string>, method?: unknown, ip = newIp()) => { const r = reqOf(ip, headers, method); const spy = spyOpts(); const res = await openX("S", { clientKey: r.clientKey, countView: r.countView, acceptLanguage: r.acceptLanguage }, spy.o); return { res, seen: spy.seen, key: String(r.clientKey) }; };
    // (ก) คนเปิดเอง
    const ipH = newIp();
    const h1 = await viaReq(B, "GET", ipH);
    eq([h1.res.ok, h1.seen, await viewsX(), await viewBucketsX(h1.key)], [true, [false, true], 1, 1], "คน GET ครั้งแรก: ด่าน (ไม่แตะ TripLinkStat) → นับ · views +1");
    const h2 = await viaReq(B, undefined, ipH);
    eq([h2.res.ok, await viewsX()], [true, 1], "เครื่องเดิมเปิดซ้ำ ⇒ ไม่นับเพิ่ม");
    eq(await statRows(uX), [{ day: "2027-03-01", channel: "WEB", linkId: null, agentAccountId: null, views: 1, starts: 0, paid: 0, tenantId: tX }], "แถวสถิติ");
    // (ข) ไม่ใช่การเปิดดูของคน: ได้หน้า แต่ไม่นับ ไม่มีคำสั่งนับ ไม่มีถังกันนับซ้ำ
    for (const [name, headers, method] of [["Sec-Purpose: prefetch", { ...B, "sec-purpose": "prefetch" }, "GET"], ["Purpose: prefetch", { ...B, purpose: "prefetch" }, undefined], ["Next-Router-Prefetch", { ...B, rsc: "1", "next-router-prefetch": "1" }, undefined],
      ["Googlebot", { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }, "GET"], ["facebookexternalhit", { "user-agent": "facebookexternalhit/1.1" }, "GET"], ["ไม่มี User-Agent", {}, "GET"],
      ["HEAD", B, "HEAD"], ["POST", B, "POST"], ["POST form ไม่รู้ method", { ...B, "content-type": "application/x-www-form-urlencoded", "content-length": "3" }, undefined]] as const) {
      const r = await viaReq(headers, method);
      eq([r.res.ok, r.seen, await viewsX(), await viewBucketsX(r.key)], [true, [false], 1, 0], `${name}: ได้หน้า · ไม่นับ`);
    }
    // (ค) ไม่พบ ทุกสาเหตุ
    for (const [name, slug] of [["slug ไม่มี", `nope-${hex(4)}`], ["สินค้าร่าง", XP.HID?.slug], ["สินค้าของร้านอื่น", PRD.A2.slug]] as const) {
      const spy = spyOpts(); const k = ck();
      const r = await call("openBookProduct", { shop: SX, productSlug: slug, query: {}, acceptLanguage: "en", clientKey: k, countView: true }, spy.o);
      eq([r, spy.seen, await viewsX(), await viewBucketsX(k)], [NF, [false], 1, 0], `${name}: ไม่พบ ⇒ ไม่นับ`);
    }
    // (ง) ถูกจำกัด
    const { limit } = limitOf("BOOK_READ_LIMIT");
    const kL = ck();
    await Promise.all(Array.from({ length: limit }, () => gate({ tenantId: tX, unit: null, productId: null, channel: "WEB", linkCode: null, clientKey: kL })));
    const spyL = spyOpts();
    const lim = await openX("S", { clientKey: kL, countView: true }, spyL.o);
    eq([lim.ok, lim.code, lim.reason, "vm" in lim, spyL.seen, await viewsX(), await viewBucketsX(kL)], [false, "RATE_LIMITED", "LIMIT", false, [false], 1, 0], "ถูกจำกัด ⇒ ไม่มี vm ไม่มีคำสั่งนับ");
    // (จ) หน้าแสดงไม่ได้หลังผ่านด่าน (สินค้าถูกถอนเผยแพร่ระหว่างคำสั่งด่านกับตัวโหลด) ⇒ ไม่นับ — ตัวนับที่อยู่ในคำสั่งเดียวกับด่านจะแดงที่นี่
    const kG = ck();
    const spyG = spyOpts(async (n) => { if (n === 1) await pool.query(`UPDATE "TripProduct" SET status = 'DRAFT' WHERE id = $1`, [XP.G?.id]); });
    let gone: Rec;
    try { gone = await openX("G", { clientKey: kG, countView: true }, spyG.o); } finally { await pool.query(`UPDATE "TripProduct" SET status = 'ACTIVE' WHERE id = $1`, [XP.G?.id]); }
    eq([gone.ok, gone.code, "vm" in gone, spyG.seen, await viewsX(), await viewBucketsX(kG)], [false, "NOT_FOUND", false, [false], 1, 0], "ผ่านด่านแล้วหน้าแสดงไม่ได้ ⇒ ไม่นับ");
    eq((await openX("G", { clientKey: ck(), countView: false })).ok, true, "คืนสถานะสินค้าแล้วเปิดได้");
    // (ฉ) คำสั่งนับล้ม: หน้าไม่ล้ม (ไม่มี exception หลุด) และไม่มียอดปลอม
    const kF = ck();
    const failing = { now: new Date(NOW0), deps: { query: async (sql: unknown) => { if (/"TripLinkStat"/.test(sqlTextOf(sql))) throw new Error("count down"); return realQuery(sql); } } };
    const f1 = await openX("S", { clientKey: kF, countView: true }, failing);
    eq([f1.ok, await viewsX()], [true, 1], "คำสั่งนับล้ม ⇒ หน้ายังแสดง ไม่นับ");
    // (ช) ปริยาย (ไม่ส่ง countView) = นับ — ผู้เรียกฝั่งเซิร์ฟเวอร์เดิมไม่เปลี่ยนพฤติกรรม
    eq([(await openX("S", { clientKey: ck() })).ok, await viewsX()], [true, 2], "ไม่ส่ง countView ⇒ นับ 1");
  });
  await st("XR-5", "มติ X3: สินค้าที่มีกติกาลดตามจำนวน (GROUP_TIER ตั้งแต่ 2 คน ลด 20%) — ราคาต่อคนทุกประเภท · ราคาเริ่มต้น · ราคาเริ่มต้นของรอบ = ใบเสนอของ 1 คนจริงที่ข้อสอบขอเอง (ไม่มีส่วนลดกลุ่มปน) + ธง groupPricing true · สินค้าไม่มีกติกา ⇒ false · จอแสดงบรรทัดราคากลุ่มจากธงนั้น (ไม่คิดเลข)", async () => {
    needX();
    const solo = seatOf(await quoteX("G", "g10", [["ADULT", 1]]), "G", "ADULT"), soloChild = seatOf(await quoteX("G", "g10", [["CHILD", 1]]), "G", "CHILD");
    const pair = seatOf(await quoteX("G", "g10", [["ADULT", 2]]), "G", "ADULT"), mixed = seatOf(await quoteX("G", "g10", [["ADULT", 1], ["CHILD", 1], ["INFANT", 1]]), "G", "ADULT");
    eq([solo.unitMinor, soloChild.unitMinor], [123_400, 56_700], "ฟิกซ์เจอร์: ราคาคนเดียวจากบริการ");
    ok(Number(pair.unitMinor) < 123_400 && Number(mixed.unitMinor) < 123_400, `ฟิกซ์เจอร์: กติกากลุ่มต้องลดราคาเมื่อ 2 ที่นั่งขึ้นไป (2 ผู้ใหญ่ ${fmt(pair.unitMinor)} · ผู้ใหญ่+เด็ก+ทารก ${fmt(mixed.unitMinor)})`);
    const vm = await loadX("G", { date: "2027-03-10" });
    const pr = asRec(selOf(vm).price);
    ok(pr, `ไม่มี price: ${fmt(selOf(vm).priceError)}`);
    eq([asArr(pr?.pax).map((p) => [p.code, p.unitSatang]), pr?.headline, slotsOf(vm).map((s) => s.from), pr?.groupPricing],
      [[["ADULT", solo.unitMinor], ["CHILD", soloChild.unitMinor], ["INFANT", 0]], { code: "ADULT", unitSatang: solo.unitMinor }, [{ code: "ADULT", unitSatang: solo.unitMinor }], true], "ราคาต่อคน = ใบเสนอคนเดียว + ธงราคากลุ่ม");
    eq(asArr(pr?.fees).map((f) => [f.paxCode, f.unitSatang]), [["ADULT", R.parkAdultSatang], ["CHILD", R.parkChildSatang]], "ค่าธรรมเนียมบังคับยังครบต่อประเภทคน (ไม่ซ้ำ)");
    eq(asArr(pr?.extras).map((x) => [asRec(x.name)?.text, x.unitSatang]), [["Waterproof camera", R.extras.camera.satang]], "รายการเสริมไม่บังคับ");
    const plain = asRec(selOf(await loadX("S", { date: "2027-03-10" })).price);
    eq([plain?.groupPricing, asArr(plain?.pax).map((p) => p.unitSatang)], [false, [123_400, 56_700, 0]], "สินค้าไม่มีกติกากลุ่ม");
    const bp = stripComments(read(`${COMP}/BookPrices.tsx`));
    ok(/groupPricing\s*\?[\s\S]{0,200}?book-group-note[\s\S]{0,200}?["']price\.group["']/.test(bp), "BookPrices ต้องแสดง book-group-note (ข้อความ price.group) เมื่อ groupPricing");
    ok(/[ก-๙]/.test(String(msgs().th["price.group"])) && /group/i.test(String(msgs().en["price.group"])), "ข้อความ price.group");
  });
  await st("XR-6", "มติ X4 (วันเดียวหลายรอบ): ทุกรอบของวันที่เลือก — ที่ว่าง = listAvailability ของรอบนั้น · ราคาเริ่มต้น = quoteTripLine ของรอบนั้นเอง (รอบบ่ายราคาเฉพาะรอบ 2,000) · ช่องปฏิทิน = รอบแรกที่ขายได้ + จำนวนรอบ · ปริยาย = รอบแรกที่ขายได้ · ?t ที่ตรงรูปและขายได้เลือกรอบนั้น (ตารางราคา/ราคาเริ่มต้น/ที่ว่างตามรอบเดียวกัน) · ?t ผิดรูป/ไม่มี/ชี้รอบที่ขายไม่ได้ ⇒ รอบแรกที่ขายได้ · ไม่มี id ใน VM/ตัวอ้างรอบ", async () => {
    needX();
    const rows = await availX("S", "2027-03-15", "2027-03-16");
    const r15 = rows.filter((r) => r.localDate === "2027-03-15"), r16 = rows.filter((r) => r.localDate === "2027-03-16");
    eq([r15.map((r) => [r.slotId, r.saleBlock, r.publicLeft]), r16.map((r) => [r.slotId, r.saleBlock === null && Number(r.publicLeft) > 0])], [[[XDEP.s15a, null, 5], [XDEP.s15b, null, 40]], [[XDEP.s16a, false], [XDEP.s16b, true]]], "ฟิกซ์เจอร์: บริการที่ว่าง");
    const qa = seatOf(await quoteX("S", "s15a", [["ADULT", 1]]), "S", "ADULT").unitMinor, qb = seatOf(await quoteX("S", "s15b", [["ADULT", 1]]), "S", "ADULT").unitMinor, qc = seatOf(await quoteX("S", "s16b", [["ADULT", 1]]), "S", "ADULT").unitMinor;
    eq([qa, qb, qc], [123_400, X_DEP_PRICE, X_DEP_PRICE], "ฟิกซ์เจอร์: บริการราคาให้ราคาต่างกันต่อรอบ");
    const qbChild = seatOf(await quoteX("S", "s15b", [["CHILD", 1]]), "S", "CHILD").unitMinor; // ราคาเด็กของรอบที่มีราคาผู้ใหญ่เฉพาะรอบ = ตามบริการราคา (ข้อสอบไม่เดาสูตร)
    ok(Number.isInteger(qbChild) && Number(qbChild) > 0, `ฟิกซ์เจอร์: ราคาเด็กของรอบบ่าย ${fmt(qbChild)}`);
    const vm = await loadX("S", { date: "2027-03-15" });
    const sl = slotsOf(vm);
    eq(sl.map((s) => [s.timeText, s.left, s.state, s.from, s.token, s.selectable, s.selected]),
      [["07:00–15:00", r15[0]?.publicLeft, r15[0]?.showLeft ? "LOW" : "OPEN", { code: "ADULT", unitSatang: qa }, "0700", true, true], ["13:00–21:00", r15[1]?.publicLeft, r15[1]?.showLeft ? "LOW" : "OPEN", { code: "ADULT", unitSatang: qb }, "1300", true, false]], "แต่ละรอบ: ที่ว่าง + ราคาเริ่มต้นของรอบนั้นเอง");
    const day = dayOf(vm, "2027-03-15");
    eq([day.left, day.state, day.departures, day.selected, selOf(vm).moreSlots], [r15[0]?.publicLeft, r15[0]?.showLeft ? "LOW" : "OPEN", 2, true, 0], "ช่องปฏิทิน = รอบที่ออกเร็วที่สุดที่ขายได้ + จำนวนรอบ");
    const p0 = asRec(selOf(vm).price);
    eq([asArr(p0?.pax)[0]?.unitSatang, p0?.headline, sl[0]?.from], [qa, { code: "ADULT", unitSatang: qa }, p0?.headline], "ปริยาย: ตารางราคา/ราคาเริ่มต้น มาจากรอบที่เลือก (รอบแรกที่ขายได้)");
    // เลือกรอบบ่ายด้วยตัวอ้างรอบ
    const vb = await loadX("S", { date: "2027-03-15", slot: "1300" });
    const pb = asRec(selOf(vb).price);
    eq([slotsOf(vb).map((s) => s.selected), asArr(pb?.pax).map((p) => [p.code, p.unitSatang]), pb?.headline, slotsOf(vb)[1]?.from, slotsOf(vb)[1]?.left, slotsOf(vb)[0]?.from, dayOf(vb, "2027-03-15").left],
      [[false, true], [["ADULT", qb], ["CHILD", qbChild], ["INFANT", 0]], { code: "ADULT", unitSatang: qb }, { code: "ADULT", unitSatang: qb }, r15[1]?.publicLeft, { code: "ADULT", unitSatang: qa }, r15[0]?.publicLeft], "?t=1300: หัว/ตารางราคา/ที่ว่างของรอบบ่ายรอบเดียวกัน (ช่องปฏิทินยังเป็นรอบแรก)");
    for (const bad of ["9999", "13:00", "1300 ", "1300-2", "0700-9", "", "2460", XDEP.s15b, ["1300"], 1300, null, { t: "1300" }]) {
      const v = await loadX("S", { date: "2027-03-15", slot: bad });
      eq([slotsOf(v).map((s) => s.selected), asRec(selOf(v).price)?.headline], [[true, false], { code: "ADULT", unitSatang: qa }], `ตัวอ้างรอบ ${fmt(bad).slice(0, 30)} ⇒ รอบแรกที่ขายได้`);
    }
    // รอบเช้าขายหมด + รอบบ่ายเปิด: รอบที่เลือก = รอบบ่าย · หัว/ราคา/ที่ว่างมาจากรอบบ่าย · ตัวอ้างของรอบที่ขายไม่ได้ไม่มี และขอมาก็ไม่ถูกเลือก
    for (const slot of [undefined, "0700", "1300"]) {
      const v = await loadX("S", { date: "2027-03-16", ...(slot ? { slot } : {}) });
      const s16 = slotsOf(v), p16 = asRec(selOf(v).price);
      eq([s16.map((s) => [s.timeText, s.state, s.left, s.token, s.selectable, s.selected, s.from]), p16?.headline, asArr(p16?.pax)[0]?.unitSatang, dayOf(v, "2027-03-16").left, dayOf(v, "2027-03-16").departures, selOf(v).priceError],
        [[["07:00–15:00", "FULL", 0, null, false, false, null], ["13:00–21:00", "OPEN", r16[1]?.publicLeft, "1300", true, true, { code: "ADULT", unitSatang: qc }]], { code: "ADULT", unitSatang: qc }, qc, r16[1]?.publicLeft, 1, null], `16 มี.ค. ?t=${String(slot)}: รอบเช้าเต็ม ⇒ ทุกอย่างมาจากรอบบ่าย`);
    }
    // ผ่าน openBookProduct (?t ในคำขอ) + ไม่มี id
    const viaOpen = await openX("S", { clientKey: ck(), countView: false, query: { m: "2027-03", d: "2027-03-15", t: "1300" } });
    ok(viaOpen.ok === true, fmt(viaOpen).slice(0, 200));
    eq([slotsOf(asRec(viaOpen.vm) ?? {}).map((s) => s.selected), asRec(selOf(asRec(viaOpen.vm) ?? {}).price)?.headline], [[false, true], { code: "ADULT", unitSatang: qb }], "openBookProduct ส่ง ?t ถึงตัวโหลด");
    const junk = await openX("S", { clientKey: ck(), countView: false, query: { m: "2027-03", d: "2027-03-15", t: ["1300", "0700"] } });
    eq(slotsOf(asRec(junk.vm) ?? {}).map((s) => s.selected), [true, false], "?t ซ้ำ (array) ⇒ รอบแรกที่ขายได้");
    for (const v of [vm, vb, asRec(viaOpen.vm) ?? {}]) noInternal(v, [...allIds, ...Object.values(XDEP)], "VM วันหลายรอบ");
    eq(Object.keys(sl[0] ?? {}).sort(), ["capacity", "cutoffLocal", "from", "guaranteed", "left", "optionName", "selectable", "selected", "state", "timeText", "token"], "คีย์ของรอบ");
  });
  await st("XR-7", "มติ X4 (ตัวช่วย + เพดาน): parseBookSlot รับเฉพาะ HHMM (+ -2…-9) · slotTokensOf เวลาซ้ำได้ลำดับต่อท้าย · bookHref ต่อ t ท้ายสุด · วันที่มี 10 รอบ ⇒ แสดง 8 (รอบที่ขายได้มาก่อน เรียงเวลาออก) + moreSlots 2 · จอ: หัวหน้า (book-meta) ใช้รอบที่ selected · ลิงก์เลือกรอบสร้างด้วย bookHref ที่มี t", async () => {
    needX();
    const ps = P("parseBookSlot"), tk = P("slotTokensOf"), href = P("bookHref");
    eq([ps({ t: "0700" }), ps({ t: "2359" }), ps({ t: "0700-2" }), ps({ t: "0700-9" })], ["0700", "2359", "0700-2", "0700-9"], "ตรงรูป");
    eq([ps({ t: "2400" }), ps({ t: "0760" }), ps({ t: "700" }), ps({ t: "07:00" }), ps({ t: "0700-1" }), ps({ t: "0700-10" }), ps({ t: " 0700" }), ps({ t: "0700\n" }), ps({ t: ["0700"] }), ps({ t: 700 }), ps({}), ps(null), ps("0700"), ps({ t: "w11qc_d_abc" }), ps({ t: "0700' OR 1=1" })], Array(15).fill(null), "ผิดรูป ⇒ null");
    eq([tk(["07:00", "13:00"]), tk(["07:00", "07:00", "13:00", "07:00"]), tk([]), tk(["7:00", "07:00"])], [["0700", "1300"], ["0700", "0700-2", "1300", "0700-3"], [], [null, "0700"]], "slotTokensOf");
    eq([href("s", "p", { lang: "en", a: "A1", m: "2027-03", d: "2027-03-15", t: "1300" }), href("s", "p", { t: "0700-2", d: "2027-03-15" }), href("s", "p", { t: "", d: "2027-03-15" }), href("s", "p", { t: null })],
      ["/book/s/t/p?lang=en&a=A1&m=2027-03&d=2027-03-15&t=1300", "/book/s/t/p?d=2027-03-15&t=0700-2", "/book/s/t/p?d=2027-03-15", "/book/s/t/p"], "bookHref");
    const cap = Number(coreV("BOOK_SLOT_CAP"));
    eq(cap, 8, "BOOK_SLOT_CAP (มติ X4: เพดาน 8)");
    const v = await loadX("S", { date: "2027-03-20" });
    const s20 = slotsOf(v);
    eq([s20.length, selOf(v).moreSlots, s20.map((s) => String(s.timeText).slice(0, 5)), s20.map((s) => s.selectable), s20.filter((s) => s.selected).map((s) => s.token), dayOf(v, "2027-03-20").departures, dayOf(v, "2027-03-20").left],
      [8, 2, ["06:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"], [false, true, true, true, true, true, true, true], ["0900"], 7, 7], "10 รอบ: ที่แสดง 8 (รอบขายได้ครบ 7 + รอบแรกที่ขายไม่ได้ 1) เรียงเวลา · รอบที่เลือก = 09:00 · ช่องปฏิทิน = 09:00 เหลือ 7");
    ok(s20.filter((s) => s.selectable).every((s) => asRec(s.from)?.unitSatang === 123_400) && s20[0]?.from === null, `ราคาเริ่มต้นต่อรอบ: ${fmt(s20.map((s) => s.from)).slice(0, 200)}`);
    const pick = await loadX("S", { date: "2027-03-20", slot: "1500" });
    eq([slotsOf(pick).filter((s) => s.selected).map((s) => [s.token, s.left]), asRec(selOf(pick).price)?.headline], [[["1500", 1]], { code: "ADULT", unitSatang: 123_400 }], "?t=1500 (รอบสุดท้าย เหลือ 1)");
    const bpz = stripComments(read(`${COMP}/BookProduct.tsx`));
    const meta = bpz.match(/data-testid="book-meta"[\s\S]{0,700}/)?.[0] ?? "";
    const chosenVar = bpz.match(/const\s+(\w+)\s*=\s*\w+\?*\.slots\.find\(\(\w+\)\s*=>\s*\w+\.selected\)/)?.[1] ?? "";
    ok(chosenVar && new RegExp(`\\b${chosenVar}\\.timeText`).test(meta) && new RegExp(`\\b${chosenVar}\\.capacity`).test(meta), `book-meta ต้องใช้รอบที่ selected (ตัวแปร ${chosenVar || "?"}) ไม่ใช่ slots[0]`);
    ok(!/slots\[0\]/.test(bpz), "BookProduct อ้าง slots[0] ตรง ๆ (ต้องใช้รอบที่ selected)");
    ok(/bookHref\([^)]*\bt:\s*\w+\.token/.test(bpz), "ลิงก์เลือกรอบต้องสร้างด้วย bookHref ที่มี t = token ของรอบ");
  });
  await st("XR-8", "มติ X5: cancelRowsOf — บันไดไม่มีขั้น 0 วัน ⇒ ต่อท้าย \"หลังจากนั้นไม่คืนเงิน\" เสมอ · มีขั้น 0 วัน 0% ⇒ บรรทัดเดียว (ไม่ซ้ำ) · ขั้น 0 วันมีร้อยละ ⇒ คงร้อยละ · บันไดว่าง ⇒ ไม่มีบรรทัด · จอใช้ตัวตัดสินนี้ + ข้อความ cancel.noRefund สองภาษา", () => {
    const f = P("cancelRowsOf");
    const NONE = { kind: "LATER_NONE" };
    eq([f([{ daysBefore: 30, refundBp: 10000 }, { daysBefore: 15, refundBp: 5000 }]), f([{ daysBefore: 7, refundBp: 10000 }]), f(LADDER), f([{ daysBefore: 7, refundBp: 10000 }, { daysBefore: 0, refundBp: 2000 }]), f([{ daysBefore: 0, refundBp: 0 }]), f([])],
      [[{ kind: "FROM_DAYS", days: 30, pct: 100 }, { kind: "FROM_DAYS", days: 15, pct: 50 }, NONE], [{ kind: "FROM_DAYS", days: 7, pct: 100 }, NONE], [{ kind: "FROM_DAYS", days: 30, pct: 100 }, { kind: "FROM_DAYS", days: 15, pct: 50 }, NONE],
        [{ kind: "FROM_DAYS", days: 7, pct: 100 }, { kind: "LATER_PCT", pct: 20 }], [NONE], []], "บรรทัดของตารางยกเลิก");
    const bp = stripComments(read(`${COMP}/BookPrices.tsx`));
    ok(/cancelRowsOf\(/.test(bp) && !/ladder\.map\(|cancelLadder\.map\(/.test(uiSrc), "จอต้องสร้างบรรทัดจาก cancelRowsOf (ไม่วนบันไดเอง)");
    ok(/["']cancel\.noRefund["']/.test(bp), "จอไม่ใช้ข้อความ cancel.noRefund");
    const m = msgs();
    ok(/ไม่คืน/.test(String(m.th["cancel.noRefund"])) && /no refund/i.test(String(m.en["cancel.noRefund"])), `ข้อความ cancel.noRefund: ${fmt([m.th["cancel.noRefund"], m.en["cancel.noRefund"]])}`);
  });
  await st("XR-9", "มติ X7: ข้อความของร้านที่ยังไม่แปลได้ธง fallback ครบทุกช่อง (ชื่อตัวเลือก · ชื่อค่าธรรมเนียม · ชื่อ+หมายเหตุรายการเสริม · สรุปสินค้า · สรุปในการ์ด) และจอแสดงป้ายยังไม่แปลจากธงแต่ละช่อง · รอบสถานะ FULL (ขายหมด) ⇒ \"เต็ม\" ทั้งช่องปฏิทินและแถวรอบ (ไม่ใช่ปิดรับ) · ป้ายเก็บแทนไม่ฝังชนิดค่าธรรมเนียม", async () => {
    needX();
    const en = await loadX("T", { date: "2027-03-10" }), th = await loadX("T", { date: "2027-03-10", lang: "th" });
    const pe = asRec(selOf(en).price), pt = asRec(selOf(th).price);
    ok(pe && pt, `ไม่มี price: ${fmt([selOf(en).priceError, selOf(th).priceError])}`);
    const F = (text: string) => ({ text, fallback: true }), T = (text: string) => ({ text, fallback: false });
    eq([slotsOf(en)[0]?.optionName, asArr(pe?.fees).map((f) => f.name), asArr(pe?.extras).map((x) => [x.name, x.note]), asRec(en.product)?.summary, asRec(en.product)?.title],
      [F("ร่วมกลุ่ม"), [F("ค่าธรรมเนียมท่าเรือ"), F("ค่าธรรมเนียมท่าเรือ")], [[F("เช่ากล้องกันน้ำ"), F("คืนกล้องที่ท่าเรือ")]], F("สรุป T"), F("มติ T")], "อังกฤษ: ทุกช่องเป็นข้อความไทย + fallback");
    eq([slotsOf(th)[0]?.optionName, asArr(pt?.fees).map((f) => f.name)[0], asArr(pt?.extras).map((x) => [x.name, x.note]), asRec(th.product)?.summary], [T("ร่วมกลุ่ม"), T("ค่าธรรมเนียมท่าเรือ"), [[T("เช่ากล้องกันน้ำ"), T("คืนกล้องที่ท่าเรือ")]], T("สรุป T")], "ไทย: ไม่มีธง");
    const s = asRec(selOf(await loadX("S", { date: "2027-03-10" })).price);
    eq([asArr(s?.fees).map((f) => f.name)[0], asArr(s?.extras).map((x) => [x.name, x.note])], [T("Pier fee"), [[T("Waterproof camera"), T("Return at the pier")]]], "สินค้าที่แปลแล้ว: ไม่มีธง");
    const cat = VM(await call("loadBookShopVM", { shop: SX, lang: "en" }), "รายการร้าน x");
    const cards = asArr(cat.products);
    eq([cards.map((p) => p.slug), cards.find((p) => p.slug === XP.T?.slug)?.summary, cards.find((p) => p.slug === XP.S?.slug)?.summary], [[XP.S?.slug, XP.G?.slug, XP.T?.slug, XP.V?.slug, XP.NY?.slug], F("สรุป T"), T("Summary S")], "สรุปในการ์ด (สินค้าร่างไม่อยู่ในรายการ)");
    // จอ: ป้ายยังไม่แปลผูกกับธงของแต่ละช่อง
    const prod = stripComments(read(`${COMP}/BookProduct.tsx`)), prices = stripComments(read(`${COMP}/BookPrices.tsx`)), index = stripComments(read(`${COMP}/BookIndex.tsx`));
    for (const [what, src, re] of [["ชื่อตัวเลือก", prod, /optionName\.fallback[^\n]*<BookUntranslated/], ["สรุปสินค้า", prod, /summary\.fallback[^\n]*<BookUntranslated/], ["ชื่อค่าธรรมเนียม", prices, /\w+\.name\.fallback[^\n]*<BookUntranslated/],
      ["หมายเหตุรายการเสริม", prices, /\w+\.note\.fallback[^\n]*<BookUntranslated/], ["ชื่อประเภทคน", prices, /label\.fallback[^\n]*<BookUntranslated/], ["สรุปในการ์ด", index, /summary\.fallback[^\n]*<BookUntranslated/]] as const) ok(re.test(src), `จอไม่แสดงป้ายยังไม่แปลของ ${what}`);
    ok((prices.match(/\w+\.name\.fallback/g) ?? []).length >= 2, "ป้ายยังไม่แปลต้องมีทั้งชื่อค่าธรรมเนียมและชื่อรายการเสริม");
    // รอบสถานะ FULL
    const av = await availX("S", "2027-03-17", "2027-03-18");
    eq(av.map((r) => [r.localDate, r.status, r.saleBlock === null && Number(r.publicLeft) > 0]), [["2027-03-17", "FULL", false], ["2027-03-17", "OPEN", true], ["2027-03-18", "FULL", false]], "ฟิกซ์เจอร์: บริการไม่ขายรอบสถานะ FULL (ขายหมด)");
    const v17 = await loadX("S", { date: "2027-03-17" });
    eq([slotsOf(v17).map((x) => [x.state, x.token, x.selectable, x.selected]), dayOf(v17, "2027-03-18").state, dayOf(v17, "2027-03-18").left, dayOf(v17, "2027-03-18").selectable, dayOf(v17, "2027-03-17").departures],
      [[["FULL", null, false, false], ["OPEN", "1300", true, true]], "FULL", 0, false, 1], "รอบ/วันสถานะ FULL ⇒ เต็ม");
    const m = msgs();
    ok(/เต็ม/.test(String(m.th["day.FULL"])) && /เต็ม/.test(String(m.th["slotState.FULL"])) && /full/i.test(String(m.en["day.FULL"])) && /full/i.test(String(m.en["slotState.FULL"])), "ข้อความสภาพ FULL");
    ok(!/park|อุทยาน/i.test(`${String(m.en["price.passThrough"])} ${String(m.th["price.passThrough"])}`), `ป้ายเก็บแทนฝังชนิดค่าธรรมเนียม: ${fmt([m.th["price.passThrough"], m.en["price.passThrough"]])}`);
    ok(/passThrough\s*\?[^\n]*["']price\.passThrough["']/.test(prices) && /\w+\.name\.text/.test(prices), "แถวค่าธรรมเนียม: ชื่อรายการจริง + ป้ายเก็บแทน");
  });
  await st("XR-10", "มติ X8: ลิงก์วันในตารางเดือนและชิปมือถือมี aria-label = วันที่เต็ม + สภาพ/ที่ว่าง (ไม่ใช่แค่เลขวัน) · ปุ่มเดือนก่อน/ถัดไปมี aria-label", () => {
    needOwn();
    const c = stripComments(read(`${COMP}/BookCalendar.tsx`));
    const anchors = [...c.matchAll(/<a\b[^>]*?data-testid=\{`book-(day|chip)-\$\{[^>]*?>/g)].map((m) => m[0]);
    eq(anchors.map((a) => /book-day-/.test(a) ? "day" : "chip").sort(), ["chip", "day"], "ลิงก์วัน (ตาราง + ชิป)");
    const fn = (anchors[0] ?? "").match(/aria-label=\{(\w+)\(/)?.[1] ?? "";
    ok(fn && anchors.every((a) => new RegExp(`aria-label=\\{${fn}\\([^}]*formatYmd\\(`).test(a)), `ลิงก์วันต้องมี aria-label ที่มีวันที่เต็ม (formatYmd): ${anchors.map((a) => /aria-label/.test(a)).join(",")}`);
    const body = c.match(new RegExp(`function ${fn}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
    ok(/`day\.\$\{\w+\.state\}`/.test(body) && /left/.test(body), `ชื่อเข้าถึงได้ต้องมีสภาพ/ที่ว่างของวัน (${fn})`);
    for (const id of ["book-cal-prev", "book-cal-next"]) ok(new RegExp(`data-testid="${id}"[^>]*aria-label=\\{`).test(c), `${id} ไม่มี aria-label`);
  });
  await st("XR-11", "มติ X9: ด่านล่มซ้ำ ๆ ⇒ ops log ไม่เกิน 1 แถว/นาที/โพรเซส (นาฬิกาจำลอง: 6 ครั้งในนาทีเดียว = 1 แถว · อีก 6 ครั้ง = 0 · ข้าม 61 วิ = อีก 1) · detail ไม่มี IP/กุญแจ/ข้อความของคำสั่ง · ไฟล์มีจุดเขียน ops จุดเดียวหลังตัวจำกัดความถี่ · ตราสินค้าล้มไม่เงียบ", async () => {
    needX(); await needTable("OpsEvent");
    const sv = stripComments(read(SVC));
    eq((sv.match(/\blogOps\(/g) ?? []).length, 1, "จำนวนจุดเรียก logOps ใน trips-public (ต้องผ่านตัวจำกัดความถี่ตัวเดียว)");
    ok(/catch\s*\(\w+\)\s*\{\s*\n?\s*\w+\(\s*["']branding["']/.test(sv), "brandOf: ตราสินค้าล้มต้องจดเหตุ (ไม่กลืนเงียบ)");
    const opsRows = async (since: Date) => q<{ message: string; detail: string | null; level: string }>(`SELECT message, detail, level::text AS level FROM "OpsEvent" WHERE source = 'trips.public' AND "createdAt" >= $1 AND message LIKE '%ด่านอัตรา%' ORDER BY "createdAt"`, [since]);
    /** รอให้แถวที่คาด (เขียนแบบไม่รอผล) ลงฐาน แล้วรออีกช่วงเพื่อจับแถวเกิน · want 0 = ไม่คาดแถวใหม่ (รอช่วงเดียว) */
    const waitRows = async (since: Date, want: number) => { for (let i = 0; want > 0 && i < 40; i++) { if ((await opsRows(since)).length >= want) break; await sleep(250); } await sleep(2500); return opsRows(since); };
    const since = new Date((await q<{ t: Date }>(`SELECT NOW() AS t`))[0]?.t ?? Date.now());
    const realNow = Date.now;
    let offset = 0;
    const down = async (n: number, kind: "throw" | "empty") => {
      for (let i = 0; i < n; i++) {
        const k = ck();
        Date.now = () => realNow() + offset;
        try {
          const g = await gate({ tenantId: tX, unit: null, productId: null, channel: "WEB", linkCode: null, clientKey: k }, { now: new Date(NOW0), deps: { query: async () => { if (kind === "throw") throw new Error(`db down pc_${"a".repeat(40)} 100.64.9.9`); return []; } } });
          eq([g.ok, g.reason], [false, "LIMITER_DOWN"], "ด่านต้องปิด");
        } finally { Date.now = realNow; }
      }
    };
    try {
      offset = 10 * 60_000; // พ้นหน้าต่างของเหตุที่ข้อก่อนหน้า (RL-4) จดไว้ในโพรเซสนี้
      await down(6, "throw");
      const a = await waitRows(since, 1);
      eq(a.length, 1, `6 ครั้งในนาทีเดียว ⇒ ops ${a.length} แถว (ต้อง 1)`);
      offset += 30_000;
      await down(3, "empty"); await down(3, "throw");
      const b = await waitRows(since, 0);
      eq(b.length, 1, `อีก 6 ครั้งภายใน 60 วิ ⇒ รวม ${b.length} แถว (ต้องยังเป็น 1)`);
      offset += 31_000; // รวม 61 วิหลังแถวแรก
      await down(4, "throw");
      const c2 = await waitRows(since, 2);
      eq(c2.length, 2, `พ้น 1 นาที ⇒ รวม ${c2.length} แถว (ต้อง 2)`);
      const txt = c2.map((r) => `${r.message} ${r.detail ?? ""}`).join(" | ");
      ok(c2.every((r) => r.level === "WARN") && !/pc_[0-9a-f]{40}|100\.64\.|db down/.test(txt) && !usedClientKeys.some((k) => txt.includes(k)), `ops มีข้อมูลที่ต้องปิด: ${txt.slice(0, 200)}`);
    } finally { Date.now = realNow; }
  });
  await st("XR-12", "มติ X9 (ไม่ค้นซ้ำ แต่ไม่เปิดช่อง): loadPublicProduct ที่ได้ found จากตัวแก้ ยังอ่านด้วยเงื่อนไข \"มองเห็น\" ชุดเดิม — found ชี้สินค้าร่าง / สินค้าของร้านอื่น / หน่วยนอก ref ⇒ ไม่ได้ข้อมูลของสินค้านั้น · platform ส่ง found ต่อ (ไม่ค้น slug รอบสอง)", async () => {
    needX();
    const lp = tfn("loadPublicProduct");
    const ref = { tenantId: tX, unitIds: [uX, uV, uNY] };
    const ask = (found: Rec | undefined, productSlug: string) => lp(ref, { productSlug, locale: "en", from: "2027-03-01", to: "2027-03-31", ...(found ? { found } : {}) }, { now: new Date(NOW0) }) as Promise<Rec | null>;
    const good = await ask({ productId: XP.S?.id, unitId: uX, tz: "Asia/Bangkok" }, XP.S?.slug ?? "");
    eq([asRec(good?.product)?.slug, asArr(good?.slots).length > 0], [XP.S?.slug, true], "found ที่ถูกต้อง");
    eq([await ask({ productId: XP.HID?.id, unitId: uX, tz: "Asia/Bangkok" }, XP.HID?.slug ?? ""), await ask({ productId: XP.HID?.id, unitId: uX, tz: "Asia/Bangkok" }, XP.S?.slug ?? ""), await ask({ productId: PRD.A.id, unitId: uX, tz: "Asia/Bangkok" }, "nope"), await ask({ productId: XP.V?.id, unitId: uX, tz: "Asia/Bangkok" }, "nope")],
      [null, null, null, null], "found ชี้สินค้าร่าง / ร้านอื่น / หน่วยไม่ตรง ⇒ null");
    const outside = await ask({ productId: PRD.A.id, unitId: uA, tz: "Asia/Bangkok" }, "nope");
    eq(outside, null, "found ที่หน่วยอยู่นอก ref ⇒ ไม่ใช้ (ค้นด้วย slug ของร้านนี้แทน ⇒ ไม่พบ)");
    const sv = stripComments(read(SVC));
    ok(/loadPublicProduct\([\s\S]{0,300}?\bfound\s*:/.test(sv), "productVM ต้องส่ง found ต่อให้ loadPublicProduct (มติ X9: ไม่ค้นสินค้าซ้ำในคำขอเดียว)");
    eq((sv.match(/\bfindPublicProduct\(/g) ?? []).length, 1, "จุดเรียก findPublicProduct ใน trips-public");
  });
  await st("XR-13", "มติ X10 (โลโก้): แสดงเฉพาะไฟล์ https บนที่เก็บไฟล์ของแพลตฟอร์ม (ตัวตรวจ storagePathFromCdnUrl) — โฮสต์ภายนอก / http / โฮสต์ชื่อคล้าย / โฟลเดอร์ส่วนตัว / เส้นทางผิดรูป ⇒ logoUrl null (ชื่อร้านยังแสดง)", async () => {
    needX(); await needTable("TenantBranding");
    const BR = await tryImport("@/lib/branding/service");
    const inval = BR.mod?.invalidateBrandingCache;
    ok(typeof inval === "function", `ไม่มี invalidateBrandingCache (${BR.err.slice(0, 80)})`);
    ok(/storagePathFromCdnUrl\(/.test(stripComments(read(SVC))), "trips-public ต้องใช้ตัวตรวจที่เก็บไฟล์ของแพลตฟอร์ม (storagePathFromCdnUrl)");
    const env = process.env as Record<string, string | undefined>;
    const keep = env.SHARK_BUNNY_CDN;
    const CDN = "https://w11qc-cdn.example.net";
    const brId = rid("br");
    const logoOf = async (logoUrl: string | null, o: Rec = {}) => {
      await pool.query(`DELETE FROM "TenantBranding" WHERE "tenantId" = $1`, [tX]);
      await insertRow("TenantBranding", { id: brId, tenantId: tX, displayName: "X Brand", logoUrl, brandColor: "#aa0000", brandFg: "#ffffff", applyStorefront: true, applyMobile: true, updatedAt: new Date(), ...o });
      (inval as AnyFn)(tX);
      const shop = asRec(VM(await call("loadBookShopVM", { shop: SX, lang: "en" }), "รายการ").shop) ?? {};
      const viaOpen = asRec(asRec((await openX("S", { clientKey: ck(), countView: false })).vm)?.shop) ?? {};
      eq(viaOpen.logoUrl, shop.logoUrl, "หน้าสินค้าและหน้ารายการต้องได้โลโก้เดียวกัน");
      return [shop.name, shop.logoUrl];
    };
    try {
      env.SHARK_BUNNY_CDN = CDN;
      const good = `${CDN}/t/${tX}/logo/logo.png`;
      eq(await logoOf(good), ["X Brand", good], "โลโก้บนที่เก็บไฟล์ของแพลตฟอร์ม");
      for (const [what, url] of [["โฮสต์ภายนอก", "https://hunt-tracker.invalid/pixel.png?shop=x"], ["http ของแพลตฟอร์ม", good.replace("https://", "http://")], ["โฮสต์ชื่อคล้าย (ต่อท้าย)", `${CDN}.evil.io/t/${tX}/logo/logo.png`], ["โฮสต์ชื่อคล้าย (userinfo)", `https://w11qc-cdn.example.net@evil.io/t/${tX}/logo/logo.png`],
        ["โฟลเดอร์ส่วนตัว", `${CDN}/t/${tX}/private/${"a".repeat(40)}.png`], ["เส้นทางผิดรูป", `${CDN}/logo.png`], ["traversal", `${CDN}/t/${tX}/logo/..%2f..%2fx.png`], ["data:", "data:image/png;base64,AAAA"], ["protocol-relative", `//w11qc-cdn.example.net/t/${tX}/logo/logo.png`]] as const)
        eq(await logoOf(url), ["X Brand", null], what);
      eq(await logoOf(null), ["X Brand", null], "ไม่มีโลโก้");
      delete env.SHARK_BUNNY_CDN;
      eq(await logoOf(good), ["X Brand", null], "ไม่ได้ตั้งที่เก็บไฟล์ของแพลตฟอร์ม ⇒ ไม่แสดงรูป (ปิดไว้ก่อน)");
    } finally {
      if (keep === undefined) delete env.SHARK_BUNNY_CDN; else env.SHARK_BUNNY_CDN = keep;
      await pool.query(`DELETE FROM "TenantBranding" WHERE "tenantId" = $1`, [tX]).catch(() => undefined);
      if (typeof inval === "function") (inval as AnyFn)(tX);
    }
  });
  await st("XR-14", "มติ X10 (เขตเวลา): offset คิด ณ วันที่ของรอบที่เลือก ไม่ใช่ now — หน่วยนิวยอร์ก now = 1 มี.ค. (EST −300): รอบ 10 มี.ค. ⇒ −300 · รอบ 20 มี.ค. (หลังเริ่มเวลาออมแสง 14 มี.ค.) ⇒ −240 · รอบ 10 ก.ค. ⇒ −240 · เดือนไม่มีรอบ ⇒ ณ now (−300) · เวลารอบ/ปิดรับ/วันนี้ เป็นเวลาท้องถิ่นของหน่วย", async () => {
    needX();
    const nyLocal = (iso: unknown) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(String(iso))).replace(",", "");
    const cut = new Map((await availX("NY", "2027-03-01", "2027-03-31")).concat(await availX("NY", "2027-07-01", "2027-07-31")).map((r) => [String(r.localDate), nyLocal(r.cutoffAt)]));
    eq([nyLocal("2027-03-10T13:00:00.000Z"), nyLocal("2027-07-10T12:00:00.000Z"), cut.size], ["2027-03-10 08:00", "2027-07-10 08:00", 3], "ตัวควบคุม: ตัวแปลงเวลานิวยอร์กของข้อสอบ + รอบจากบริการ");
    const at = async (i: Rec, o: Rec = N0) => { const v = await loadX("NY", i, o); const s = slotsOf(v)[0] ?? {}; return [v.tz, selOf(v).date ?? null, s.timeText ?? null, s.cutoffLocal ?? null]; };
    const NYZ = (offsetMin: number) => ({ name: "America/New_York", offsetMin });
    eq(await at({ month: "2027-03" }), [NYZ(-300), "2027-03-10", "08:00–16:00", cut.get("2027-03-10")], "รอบ 10 มี.ค. (EST)");
    eq(await at({ month: "2027-03", date: "2027-03-20" }), [NYZ(-240), "2027-03-20", "08:00–16:00", cut.get("2027-03-20")], "รอบ 20 มี.ค. (EDT) — now ยังเป็น EST");
    eq(await at({ month: "2027-07" }), [NYZ(-240), "2027-07-10", "08:00–16:00", cut.get("2027-07-10")], "รอบ 10 ก.ค. (EDT)");
    eq(await at({ month: "2027-05" }), [NYZ(-300), null, null, null], "เดือนไม่มีรอบ ⇒ offset ณ now");
    const summer = { now: new Date("2027-07-01T12:00:00.000Z") };
    eq(await at({ month: "2027-07" }, summer), [NYZ(-240), "2027-07-10", "08:00–16:00", cut.get("2027-07-10")], "now ฤดูร้อน");
    const late = { now: new Date("2027-03-02T03:30:00.000Z") }; // 22:30 ของ 1 มี.ค. ที่นิวยอร์ก = 10:30 ของ 2 มี.ค. ที่กรุงเทพ
    eq([(await loadX("NY", {}, late)).today, (await loadX("S", {}, late)).today, asRec((await loadX("S", { date: "2027-03-10" })).tz)], ["2027-03-01", "2027-03-02", { name: "Asia/Bangkok", offsetMin: 420 }], "วันนี้ตามเขตของหน่วย · กรุงเทพ 420");
  });
  await st("XR-15", "มติ X11 · X12 (ร้านคิด VAT เพิ่มจากราคาตั้ง): ทุกยอดที่ลูกค้าเห็น = ยอดจ่ายจริงรวม VAT จากบริการราคา (สุทธิ + ภาษีของบรรทัด) · ราคาผู้ใหญ่ + ค่าธรรมเนียมบังคับ = payableSatang ของใบเสนอ 1 ผู้ใหญ่ · vatNote ADDED + ข้อความ \"รวม VAT แล้ว\" · ร้านรวม VAT ไม่เปลี่ยน · ตัวโหลดตรวจผลรวมบรรทัดกับ payableSatang ก่อนใช้ · จอไม่บวกเลข", async () => {
    needX();
    const lineOf = (v: Rec, pred: (i: Rec) => boolean) => asArr(v.items).find(pred) ?? {};
    const pay = (i: Rec) => Number(i.amountSatang) + Number(i.vatSatang);
    const qa = await quoteX("V", "v10", [["ADULT", 1]]), qc = await quoteX("V", "v10", [["CHILD", 1]]), qx = await quoteX("V", "v10", [["ADULT", 1]], [XP.V?.cam ?? ""]);
    const ta = asRec(qa.totals) ?? {}, tc = asRec(qc.totals) ?? {};
    const sa = seatOf(qa, "V", "ADULT"), sc = seatOf(qc, "V", "CHILD"), fa = lineOf(qa, (i) => i.kind === "EXTRA"), fc = lineOf(qc, (i) => i.kind === "EXTRA"), cam = lineOf(qx, (i) => i.kind === "EXTRA" && i.extraId === XP.V?.cam);
    ok(Number(ta.vatSatang) > 0 && Number(ta.payableSatang) > Number(ta.grossSatang) - Number(ta.discountSatang) && pay(sa) > Number(sa.unitMinor), `ฟิกซ์เจอร์: บริการต้องคิดภาษีเพิ่มจากราคาตั้ง: ${fmt(ta)}`);
    eq([sa.unitMinor, pay(sa) + pay(fa), pay(sc) + pay(fc)], [123_400, ta.payableSatang, tc.payableSatang], "ฟิกซ์เจอร์: ผลรวมบรรทัด = ยอดจ่ายจริงของบริการ");
    const vm = await loadX("V", { date: "2027-03-10" });
    const pr = asRec(selOf(vm).price);
    ok(pr, `ไม่มี price: ${fmt(selOf(vm).priceError)}`);
    eq([asArr(pr?.pax).map((p) => [p.code, p.unitSatang]), asArr(pr?.fees).map((f) => [f.paxCode, f.unitSatang, f.passThrough]), asArr(pr?.extras).map((x) => x.unitSatang), pr?.headline, slotsOf(vm).map((s) => s.from), pr?.vatNote, selOf(vm).priceError],
      [[["ADULT", pay(sa)], ["CHILD", pay(sc)], ["INFANT", 0]], [["ADULT", pay(fa), true], ["CHILD", pay(fc), true]], [pay(cam)], { code: "ADULT", unitSatang: pay(sa) }, [{ code: "ADULT", unitSatang: pay(sa) }], "ADDED", null], "ทุกยอด = ยอดจ่ายจริงของบรรทัดจากบริการ");
    const adult = asArr(pr?.pax)[0] ?? {}, feeA = asArr(pr?.fees)[0] ?? {};
    eq(Number(adult.unitSatang) + Number(feeA.unitSatang), ta.payableSatang, "ราคาผู้ใหญ่ที่แสดง + ค่าธรรมเนียมบังคับ = payableSatang ของใบเสนอ 1 ผู้ใหญ่");
    ok(Number(adult.unitSatang) > 123_400, "ราคาที่แสดงต้องมากกว่าราคาตั้ง (รวมภาษีแล้ว)");
    const incl = asRec(selOf(await loadX("S", { date: "2027-03-10" })).price);
    eq([asArr(incl?.pax).map((p) => p.unitSatang), incl?.vatNote === "ADDED"], [[123_400, 56_700, 0], false], "ร้านที่ราคารวม VAT แล้ว: ราคาต่อหน่วยของบริการตรง ๆ");
    const m = msgs();
    ok(/รวม/.test(String(m.th["price.vat.ADDED"])) && /includ/i.test(String(m.en["price.vat.ADDED"])) && !/\d/.test(`${String(m.th["price.vat.ADDED"])}${String(m.en["price.vat.ADDED"])}`), `ข้อความ VAT แบบบวกเพิ่มต้องบอกว่ารวมแล้ว (ไม่ฝังเลขอัตรา): ${fmt([m.th["price.vat.ADDED"], m.en["price.vat.ADDED"]])}`);
    // ตัวโหลดต้องตรวจผลรวมบรรทัดกับยอดจ่ายจริงของบริการ ก่อนใช้ยอด (ตรวจจากซอร์ส — บริการราคาฉีดผลปลอมไม่ได้)
    const cs = stripComments(read(CATALOG));
    ok(/reduce\([\s\S]{0,160}?\)\s*!==\s*\w+\.payableSatang\)\s*return\s*\{\s*ok:\s*false/.test(cs), "public-catalog: ไม่พบการตรวจ ผลรวมยอดจ่ายของบรรทัด !== totals.payableSatang ⇒ ไม่มีราคา");
    ok(/amountSatang\s*\+\s*\w+\.vatSatang/.test(cs) && !/vatRate|rateBp|\*\s*7\b|0\.07|1\.07/.test(cs), "public-catalog: ยอดรวมภาษีต้องมาจาก amountSatang + vatSatang ของบริการ (ไม่คูณอัตราเอง)");
    ok(!/vatSatang|amountSatang|payableSatang/.test(uiSrc) && !/vatSatang|amountSatang|payableSatang/.test(stripComments(read(SVC))), "จอ/platform ต้องไม่แตะยอดภาษีของใบเสนอ (อยู่ในตัวโหลดของโมดูลที่เดียว)");
  });
  await st("XR-16", "มติ X1 (ระดับฟังก์ชัน): ผลของ open* เมื่อไม่พบ/ถูกจำกัด ไม่มีชื่อร้าน · ชื่อสินค้า · slug · ตราสินค้า ใด ๆ (ชื่อหน้าและเนื้อหาจึงไม่มีทางได้ข้อมูลร้าน) · ผล ok มีชื่อร้าน/สินค้า (ตัวควบคุม) · ?a ของเครื่องที่ถูกจำกัด/คำขอไม่พบ ไม่ถูกส่งถึงตัวแก้ลิงก์", async () => {
    needX();
    const okRes = await openX("S", { clientKey: ck(), countView: false });
    ok(okRes.ok === true && JSON.stringify(okRes).includes(X_NAME) && JSON.stringify(okRes).includes("Ruling S"), "ตัวควบคุม: ผล ok ต้องมีชื่อร้าน/สินค้า");
    const secrets = [X_NAME, "X Brand", "Ruling", "มติ S", SX, XP.S?.slug ?? "?", XP.HID?.slug ?? "?", tX, uX];
    const clean = (r: Rec, keys: string[], what: string) => { eq(Object.keys(r).sort(), keys, `${what}: คีย์ของผล`); const s = JSON.stringify(r); const leak = secrets.filter((x) => s.includes(x)); ok(leak.length === 0, `${what}: ผลมีข้อมูลร้าน ${leak.join(", ")}`); };
    const NFK = ["code", "ok"], RLK = ["code", "ok", "reason", "retryAfterSec"];
    clean(await openX("HID", { clientKey: ck() }), NFK, "สินค้าร่าง");
    clean(await call("openBookProduct", { shop: SX, productSlug: "nope", query: {}, acceptLanguage: "en", clientKey: ck() }, N0), NFK, "slug ไม่มี");
    clean(await openX("S", { clientKey: null }), RLK, "ไม่มีกุญแจเครื่อง (หน้าสินค้า)");
    clean(await call("openBookShop", { shop: SX, query: {}, acceptLanguage: "en", clientKey: null }, N0), RLK, "ไม่มีกุญแจเครื่อง (หน้ารายการ)");
    const { limit } = limitOf("BOOK_READ_LIMIT");
    const kL = ck();
    await Promise.all(Array.from({ length: limit }, () => gate({ tenantId: tX, unit: null, productId: null, channel: "WEB", linkCode: null, clientKey: kL })));
    const seen: Rec[] = [];
    try {
      setResolver(async (x: unknown) => { seen.push(asRec(x) ?? {}); return { linkId: rid("link"), agentAccountId: rid("agent"), productId: null, active: true }; });
      const limP = await openX("S", { clientKey: kL, query: { a: "PTD1" } }), limS = await call("openBookShop", { shop: SX, query: { a: "PTD1" }, acceptLanguage: "en", clientKey: kL }, N0);
      clean(limP, RLK, "ถูกจำกัด (หน้าสินค้า)"); clean(limS, RLK, "ถูกจำกัด (หน้ารายการ)");
      eq([limP.reason, limS.reason], ["LIMIT", "LIMIT"], "เหตุ");
      const down = { now: new Date(NOW0), deps: { query: async () => { throw new Error(`db down ${X_NAME}`); } } };
      clean(await openX("S", { clientKey: ck(), query: { a: "PTD1" } }, down), RLK, "ด่านล่ม");
      clean(await openX("HID", { clientKey: ck(), query: { a: "PTD1" } }), NFK, "ไม่พบ + ?a");
      eq(seen.length, 0, "ตัวแก้ลิงก์ถูกเรียกสำหรับเครื่องที่ถูกจำกัด/ด่านล่ม/คำขอไม่พบ");
      const bound = await openX("S", { clientKey: ck(), countView: false, query: { a: "PTD1" } });
      eq([bound.ok, asRec(bound.carry)?.a, seen.length, seen[0]?.tenantId], [true, "PTD1", 1, tX], "ตัวควบคุม: หน้าที่แสดงได้จึงผูก ?a");
    } finally { setResolver(null); await resetStat(uX); }
  });
  groupLine("XR");

  // ═══════════════ EM. โดเมนฝัง ═══════════════
  console.log("\n── EM: โดเมนฝัง → frame-ancestors (ตัวอ่านค่าตั้ง · ยังไม่ต่อหัว HTTP) ──");
  let embedErr = "";
  try {
    if (!setupErr) {
      const r = asRec(await S("setSettings")(U.oa, { tenantId: tA }, [{ key: "trips.public.embedDomains", scope: "UNIT", scopeId: uA, value: ["shop-a.example.com", "www.shop-a.example.com"] }], { ackLegalWarn: true })) ?? {};
      if (r.ok !== true) embedErr = fmt(r);
    }
  } catch (e) { embedErr = errMsg(e); }
  await st("EM-1", "หน่วยที่ตั้งโดเมน ⇒ frame-ancestors https://… ตามค่าตั้ง · หน่วยอื่นของร้านเดียวกัน/ร้านอื่น (ไม่ได้ตั้ง) ⇒ 'none' (ค่าตั้งไม่รั่วข้ามหน่วย/ร้าน)", async () => {
    needDb(); ok(!embedErr, `ตั้งค่าตั้งไม่ได้: ${embedErr}`);
    const a = await call("bookFramePolicy", { tenantId: tA, unitId: uA }), a2 = await call("bookFramePolicy", { tenantId: tA, unitId: uA2 }), b = await call("bookFramePolicy", { tenantId: tB, unitId: uB });
    const NONE = { frameAncestors: "frame-ancestors 'none'", domains: [] };
    eq([a, a2, b], [{ frameAncestors: "frame-ancestors https://shop-a.example.com https://www.shop-a.example.com", domains: ["shop-a.example.com", "www.shop-a.example.com"] }, NONE, NONE], "นโยบาย");
  });
  await st("EM-2", "ปิดเมื่อไม่แน่ใจ: (ร้าน B, หน่วยของ A) · หน่วยไม่มีจริง · หน่วย BOOKING · หน่วยพัก · ร้านระงับ · input ขยะ ⇒ 'none' ไม่ throw · embedOriginAllowed กับโดเมนของหน่วย: ตรงตัวเท่านั้น", async () => {
    needDb(); ok(!embedErr, `ตั้งค่าตั้งไม่ได้: ${embedErr}`);
    const NONE = { frameAncestors: "frame-ancestors 'none'", domains: [] };
    for (const ref of [{ tenantId: tB, unitId: uA }, { tenantId: tA, unitId: "nope" }, { tenantId: tA, unitId: uAb }, { tenantId: tA, unitId: uAp }, { tenantId: tS, unitId: uS }, { tenantId: null, unitId: null }, {}]) eq(await call("bookFramePolicy", ref), NONE, fmt(ref));
    const d = (await call("bookFramePolicy", { tenantId: tA, unitId: uA })).domains;
    const f = P("embedOriginAllowed");
    eq([f("https://shop-a.example.com", d), f("https://www.shop-a.example.com", d), f("https://evil.shop-a.example.com", d), f("http://shop-a.example.com", d), f("https://shop-a.example.com.evil.io", d)], [true, true, false, false, false], "origin");
  });
  groupLine("EM");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try {
    const reg = (await tryImport("@/lib/platform/trips-public").catch(() => ({ mod: null }))).mod?.registerBookLinkResolver;
    if (typeof reg === "function") (reg as AnyFn)(null);
  } catch { /* ยังไม่มีไฟล์ */ }
  try {
    if (usedClientKeys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [[...new Set(usedClientKeys)].map((k) => `trips:book:none:${k}`)]);
    await cleanupTenants(tenantIds); await cleanupUsers();
  } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

console.log(`\nเหลือให้ด่านภาพ + การเปิดจริง (ผู้คุม · scripts/visual-trips.mts w1.1 + parity-trips.sh 19/01): เปิดได้โดยไม่มีคุกกี้ · 404 จริงของสินค้าที่ไม่เผยแพร่ · X-Frame-Options DENY ยังอยู่ · สองคอลัมน์ + แผงสรุปติดจอ 1440 · ชิปวัน/แถบล่าง 390 ไม่ล้น · 5 สภาพวันแยกรูปทรง+ข้อความ · สีตราสินค้า · สลับภาษาคงพารามิเตอร์`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${(p0 ?? 0) + (c.res === "PASS" ? 1 : 0)}/${(t0 ?? 0) + 1}`; }
console.log(`\n===== QC TRIPS W1.1a · หน้าจองสาธารณะ: ตัวแก้ร้าน · ด่านอัตรา · ตัวนับเปิดดู · รายการ + หน้าสินค้าทัวร์ =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
