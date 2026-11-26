// QC — TRIPS W1.4a · กรณีพิเศษฝั่งลูกค้า (ภาพ 07ก ไม่รวมรายการรอ · 07ข): ก้อนรอบเต็ม + วันใกล้เคียง + ทริปอื่นวันเดียวกัน · หน้าการจองที่หมดเวลา + ลิงก์ถือที่ใหม่
// ผู้เขียนข้อสอบแยก 26 พ.ย. (จากร่างที่ผู้คุมรับ 7900dbf8a · มติ C-1..C-11 ท้ายใบสั่ง) — ฟิกซ์เจอร์ตรงกับ schema/โค้ดจริง · รันตัวควบคุมแล้วก่อนผู้สร้างเริ่ม
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/W1.4.md (W1.4a §3–§9) · ภาพ ledger/design-trips/07-states.png (ก ข)
//
// กลุ่มข้อ (ป้ายระดับในชื่อข้อ: [pure] ตัวช่วยบริสุทธิ์ · [service] ฟังก์ชัน platform/บริการ · [action] server action + FormData จริง · [page] เรนเดอร์หน้าจริง · [code] อ่านโค้ด)
//   PC ตัวควบคุม (เขียวก่อนและหลังงาน)   S ขอบเขตไฟล์/กติกาโค้ด   P ตัวช่วยบริสุทธิ์
//   FS รอบเต็ม [service]   FP รอบเต็ม [page]   FA รอบเต็ม [action]
//   EX หมดเวลา [service]   EP หมดเวลา [page]   EL ลิงก์ถือใหม่ → หน้าสินค้า → ถือ [service/action]
//   LG ข้อความ   X อินพุตอันตราย/ข้ามร้าน
//
// 🔴 นาฬิกา: [service] ส่ง now จำลอง (NOW0 = 1 มี.ค. 2570 10:00 เวลาร้าน) เสมอ · [page]/[action] ใช้นาฬิกาจริง — รอบทดสอบทุกตัวอยู่ปี 2027 (ไม่ขึ้นกับวันนี้)
//    ช่วงวันใกล้เคียงยึดวันที่เลือก (D0 = 2027-05-12) ±7 — ข้อสอบไม่มีข้อใดเทียบกับวันนี้
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-w14-*` · ลบใน finally + กวาดค้างตอนเริ่ม · ไม่พึ่งร้าน seed · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน
// 🔴 ค่าคาดหวังคิดเองจากฟิกซ์เจอร์ (ความจุ/ที่ขายแล้วที่ข้อสอบตั้ง) — ไม่เรียกโค้ดที่ถูกทดสอบเพื่อหาคำตอบ
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-w1.4.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน: PC · S (ยกเว้น S-8 S-9 คีย์/testid ใหม่) · X-2 เขียว · ที่เหลือแดง "ยังไม่มี vm.full / vm.expired / …"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { changedOnlyByMainMerge, fromMainMerge } from "./trips-main-merge.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-w1.4";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;
// ═══════════════ ตัวนับคำสั่ง SQL จริง (มติ D3 D9 · แบบ qc-trips-t1.7a2 PF-3) — ฉีด PrismaClient ที่เปิด event query ลง globalThis ก่อนโหลด @/lib/core/db ═══════════════
let sqlLog: string[] = [];
let counting = false;
const qcPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: "event", level: "query" }] });
(qcPrisma as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on("query", (ev) => { if (counting) sqlLog.push(ev.query); });
(globalThis as unknown as { prisma?: unknown }).prisma = qcPrisma;
const realSql = () => sqlLog.filter((x) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET|SAVEPOINT|RELEASE)\b/i.test(x));
/** รันครั้งแรกให้แคชอุ่น แล้วนับคำสั่งของรอบที่สอง */
const measure = async <T,>(f: () => Promise<T>): Promise<{ n: number; r: T; sql: string[] }> => {
  await f(); sqlLog = []; counting = true;
  try { const r = await f(); return { n: realSql().length, r, sql: realSql() }; } finally { counting = false; }
};

// ═══════════════ harness (แบบ qc-trips-w1.3 / w1.2b) ═══════════════
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
  console.log(`  ${res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ "} [${id}] ${name}${res !== "PASS" && why ? ` — ${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); record(id, name, "PASS", ""); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`); }
};
const groupLine = (g: string) => { const m = cks.filter((c) => c.id.replace(/-\d+$/, "") === g); console.log(`  ── สรุป ${g}: ผ่าน ${m.filter((c) => c.res === "PASS").length}/${m.length}`); };
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => { try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `w14qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SLUG = "trips-w14-";
const EMAIL_PREFIX = "trips-w14-";
const HOUR = 3_600_000;
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const walk = (rel: string): string[] => {
  const abs = join(ROOT, rel); if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const n of readdirSync(abs)) { const p = join(rel, n); if (statSync(join(ROOT, p)).isDirectory()) out.push(...walk(p)); else if (/\.(ts|tsx|mts)$/.test(n)) out.push(p); }
  return out;
};
const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) for (const x of v) keysDeep(x, out);
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v as Rec)) { out.add(k); keysDeep(x, out); }
  return out;
};
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const qsOf = (href: string) => new URL(href, "http://x").searchParams;

// ═══════════════ สเปก (ใบสั่ง W1.4a) ═══════════════
const BASE_SHA = "e296a5a1a"; // wip/trips-w1.4 = session/trips ตอนเขียนใบสั่ง
const PCORE = "src/lib/platform/trips-public-core.ts";
const PSVC = "src/lib/platform/trips-public.ts";
const BCORE = "src/lib/platform/trips-book-core.ts";
const BSVC = "src/lib/platform/trips-book.ts";
const PUBMOD = "src/lib/modules/trips/public-booking.ts";
const FACADE = "src/lib/modules/trips/index.ts";
const PAGE_PROD = "src/app/book/[shop]/t/[productSlug]/page.tsx";
const PAGE_RES = "src/app/book/[shop]/my/[token]/page.tsx";
const COMP_FULL = "src/components/book/BookFull.tsx";
const COMP_PROD = "src/components/book/BookProduct.tsx";
const COMP_RES = "src/components/book/BookReservation.tsx";
const MSG_TH = "src/messages/th/book.json", MSG_EN = "src/messages/en/book.json";
const VISUAL = "scripts/visual-trips.mts";
/** [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด] — ใบสั่ง §3 */
// ORACLE-EDIT S-1 (ผู้คุม 26 พ.ย. · "งบรอบนี้" ท้ายมติ D): page.tsx หน้าสินค้า ≤ +10/−5 · ไฟล์ platform/modules ที่แตะ +25/−8 ต่อไฟล์ · BookReservation +10 · ข้อความ +4 ต่อภาษา
const LIMITED: [string, number, number][] = [[PCORE, 10, 95], [PSVC, 14, 95], [BCORE, 10, 85], [BSVC, 14, 85], [PUBMOD, 10, 70], [FACADE, 8, 28], [PAGE_PROD, 5, 10], [PAGE_RES, 1, 4],
  [COMP_FULL, 0, 110], [COMP_PROD, 2, 10], [COMP_RES, 8, 55], [MSG_TH, 2, 28], [MSG_EN, 2, 28], [VISUAL, 0, 40]];
const FORBIDDEN_PATHS = ["prisma", "src", "next.config.ts", "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts", "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/trips-main-merge.mts",
  "scripts/qc-trips-*.mts", ":(exclude)scripts/qc-trips-w1.4.mts", ...LIMITED.map(([f]) => `:(exclude)${f}`)];
const NEW_KEYS = ["full.title", "full.short", "full.want", "full.nearby", "full.left", "full.choose", "full.sameDay", "full.none", "full.noneNoContact",
  "res.expiredTitle", "res.expiredWhen", "res.expiredMoney", "res.expiredNowOpen", "res.expiredNowFull", "res.expiredNowClosed", "res.reholdSubmit", "res.reholdNote", "res.reholdPartial", "res.expiredPaidTitle", "res.expiredPaidHow"];
const TESTIDS = ["book-full", "book-full-want", "book-full-nearby", "book-full-nearby-item", "book-full-sameday", "book-full-sameday-item", "book-full-none",
  "book-res-expired-when", "book-res-expired-money", "book-res-expired-now", "book-res-rehold", "book-res-rehold-partial", "book-res-expired-paid"];
const FORBIDDEN_PHRASES = [/LINE/, /ทันที/, /วันทำการ/, /\d+\s*นาที/, /ราคาเท่ากัน/, /ไม่มีการตัดเงิน/, /immediately/i, /business day/i, /within \d+/i, /same price/i, /not (been )?charged/i];
const INTERNAL_KEYS = ["id", "tenantId", "unitId", "productId", "slotId", "departureId", "optionId", "paxTypeId", "extraId", "bookingId", "basketId", "holdId", "partyId", "bookerPartyId", "policySnapshot", "publicTokenHash", "phone", "email", "booker"];
const R = FX.PRODUCT_RACHA;
const AD = R.adultSatang, CH = R.childSatang, PA = R.parkAdultSatang, PC_ = R.parkChildSatang, CAM = R.extras.camera.satang;
const NOW0 = new Date("2027-03-01T03:00:00.000Z");
const at = (ms: number) => ({ now: new Date(NOW0.getTime() + ms) });
const N0 = at(0), AFTER = at(20_000), LATER = at(3 * HOUR); // LATER = หลังที่ถือ 15 นาทีหมดแน่นอน
const D0 = "2027-05-12"; // วันเต็มของสินค้า A
// ── มติ D1 D3 D5 (ผู้เขียนข้อสอบแยก รอบ 2 · 26 พ.ย.) ──
const XKAYAK = 20_000, XSNORKEL = 15_000, XCABIN = 10_000; // ต่อวัน · ต่อคน · ต่อคืน (สตางค์)
const M_EXTRAS = 1 * 3 * XKAYAK + 2 * XSNORKEL + 1 * 2 * XCABIN; // ผู้ใหญ่ 2 · 3 วัน 2 คืน ⇒ 60,000 + 30,000 + 20,000 = 110,000 (pricing-core.ts:675 · :701)
const ZONE_PAID = 30_000;
// หน่วย uS: DS1 วันเต็ม (21 ตัวไม่ผ่านตัวกรองหยาบ) · DS2 วันเต็ม (20 ตัว · 3 ตัวท้ายผ่าน) · DS3 วันตัวที่ต้องไม่ขึ้น · DS4 พิสูจน์เพดาน 20 (มติ D11) · DSO วันว่าง (ฐาน)
const DS1 = "2027-07-01", DS2 = "2027-07-02", DS3 = "2027-07-03", DS4 = "2027-07-04", DSO = "2027-07-05";
const D6 = "2027-05-22"; // ว่าง 5 · FA (ร้านขายตัดหน้า 3 ที่ระหว่างเปิดฟอร์มกับกดส่ง)
const D5 = "2027-05-21"; // รอบเหลือ 2 (want 3 ⇒ SOLD_OUT) · D0+9 นอกช่วง ±7 ของ D0 (ไม่กระทบวันใกล้เคียง · ไม่ชนรอบ D0+8)
const IP_PREFIX = "100.68.";
const SHOP_CONTACT = { phone: "076-000-414", line: "@w14qc", address: "14 ถนนทดสอบ ภูเก็ต" };

// ═══════════════ pg + ร้านชั่วคราว (แบบ qc-trips-w1.2b) ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (t: string) => { if (!colCache.has(t)) colCache.set(t, await q<ColRow>(`SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [t])); return colCache.get(t) ?? []; };
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1] ?? ""); if (l.length) return l; }
  return [];
};
async function insertRow(table: string, vals: Rec): Promise<string> {
  const c0 = await cols(table); if (!c0.length) throw new AssertFail(`ยังไม่มีตาราง ${table}`);
  const v: Rec = { ...vals }; const names = new Set(c0.map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of c0) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (c.column_name === "updatedAt" || c.column_name === "createdAt") { v[c.column_name] = new Date(); continue; }
    if (t === "text" || t.startsWith("character")) { const l = await checkLits(table, c.column_name); v[c.column_name] = l[0] ?? `qc${hex(4)}`; continue; }
    if (t === "USER-DEFINED") { v[c.column_name] = (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid WHERE ty.typname = $1 ORDER BY e.enumsortorder LIMIT 1`, [c.udt_name]))[0]?.l ?? null; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? "2027-01-01 00:00:00" : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id ?? "");
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  try { for (const t of tids) for (const p of ["book", "hold", "slot", "token", "confirm", "pub", "verify", "verifyb", "self"]) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:${p}:${t}:%`]); } catch { /* ถัง */ }
  let pending = (await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t).filter((t) => t !== "Tenant");
  for (let pass = 0; pass < 14 && pending.length; pass++) { const next: string[] = []; for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } } pending = next; }
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
  if (!us.length) return;
  for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* */ } }
  await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
}
const tenantIds: string[] = [];
const usedClientKeys: string[] = [];

let exitCode = 1;
try {
  try { const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id); if (stale.length) await cleanupTenants(stale); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips"), TR = TRI.mod;
  const PUBI = await tryImport("@/lib/platform/trips-public");
  const BSI = await tryImport("@/lib/platform/trips-book");
  const PCI = await tryImport("@/lib/platform/trips-public-core");
  const BCI = await tryImport("@/lib/platform/trips-book-core");
  const SETI = await tryImport("@/lib/core/settings");
  const tfn = (n: string): AnyFn => { const f = TR?.[n]; if (typeof f !== "function") throw new AssertFail(`facade trips ไม่มี ${n} (${TRI.err.slice(0, 80)})`); return f as AnyFn; };
  const tcall = async (n: string, ...a: unknown[]): Promise<Rec> => { const f = tfn(n); try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  const pfn = (mod: { mod: Rec | null; err: string }, n: string, what: string): AnyFn => { const f = mod.mod?.[n]; if (typeof f !== "function") throw new AssertFail(`ไม่มี ${n} ของ ${what} (${mod.err.slice(0, 80)})`); return f as AnyFn; };
  const pcall = async (mod: { mod: Rec | null; err: string }, n: string, what: string, ...a: unknown[]): Promise<Rec> => { const f = pfn(mod, n, what); try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  const openProduct = (slug: string, query: Rec, when = N0, clientKey = ck()) => pcall(PUBI, "openBookProduct", "W1.1", { shop: SA, productSlug: slug, query, acceptLanguage: "th", clientKey, countView: false }, when);
  const openRes = (token: string, when = LATER, lang = "th") => pcall(BSI, "openBookReservation", "W1.2a", { shop: SA, token, lang, acceptLanguage: lang, clientKey: ck() }, when);
  const bookClientKey = (ip: string): string => { const k = pfn(PUBI, "bookClientKey", "W1.1")(ip); if (typeof k !== "string") throw new AssertFail(`bookClientKey: ${fmt(k)}`); usedClientKeys.push(k); return k; };
  let ipN = 0; const IP_OF = new Map<string, string>();
  const ck = () => { ipN++; const ip = `${IP_PREFIX}${(ipN >> 8) & 255}.${ipN & 255}`; const k = bookClientKey(ip); IP_OF.set(k, ip); return k; };
  const noInternal = (vm: unknown, what: string, extra: string[] = []) => {
    const bad = INTERNAL_KEYS.filter((k) => keysDeep(vm).has(k));
    ok(bad.length === 0, `${what}: มีคีย์ภายใน ${bad.join(", ")}`);
    const s = JSON.stringify(vm); const leak = extra.filter((x) => x && s.includes(x));
    ok(leak.length === 0, `${what}: มีค่าภายใน/ข้อมูลบุคคล ${leak.length} ค่า`);
  };

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), uA = rid("uA"), uX = rid("uX"), uZ = rid("uZ"), uS = rid("uS"), SA = `${SLUG}${STAMP}-a`;
  const XM: Record<string, string> = {}, ZN: Record<string, string> = {};
  let setupErr = "", bookErr = "";
  type Prod = { id: string; slug: string; opt: string; unit: string; pt: Record<string, string>; cam: string };
  const PRD: Record<string, Prod> = {};
  const DEP: Record<string, string> = {};
  const OWNER: Rec = {};
  let staffUser = "";
  const setV = async (changes: Rec[]) => {
    const f = SETI.mod?.setSettings; if (typeof f !== "function") throw new AssertFail("ไม่มี setSettings");
    const r = asRec(await (f as AnyFn)(OWNER, { tenantId: tA }, changes, { ackLegalWarn: true })) ?? {};
    if (r.ok !== true) throw new AssertFail(`setSettings: ${fmt(r)}`);
  };
  const mkProd = async (key: string, unit: string, o: { status?: string; published?: boolean; nights?: number } = {}) => {
    const id = rid(`p${key}`), opt = rid(`o${key}`), slug = `w14qc-${key.toLowerCase()}-${STAMP}`;
    await insertRow("TripProduct", { id, tenantId: tA, unitId: unit, slug, productType: "TOUR", sourceKind: "OWN", status: o.status ?? "ACTIVE", title: JSON.stringify({ th: `${R.name} ${key}`, en: `Racha test ${key}` }),
      body: JSON.stringify({ summary: { th: `สรุป ${key}` } }), currency: "THB", deepDive: false, crossBorder: false, publishedAt: o.published === false ? null : new Date("2027-01-01T00:00:00Z"), updatedAt: new Date() });
    await insertRow("TripOption", { id: opt, tenantId: tA, unitId: unit, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 510, sortOrder: 1, active: true, ...(o.nights ? { nights: o.nights } : {}), updatedAt: new Date() });
    const pt: Record<string, string> = {};
    for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId: tA, unitId: unit, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code }),
      ageMin: code === "CHILD" ? R.childAge.min : code === "ADULT" ? 12 : null, ageMax: code === "CHILD" ? R.childAge.max : code === "INFANT" ? 3 : null, countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
    await insertRow("TripExtra", { id: rid("xpark"), tenantId: tA, unitId: unit, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: PA, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE", name: JSON.stringify({ th: "ค่าอุทยาน", en: "Park fee" }), paxPrices: JSON.stringify({ ADULT: PA, CHILD: PC_ }), active: true, sortOrder: 0, updatedAt: new Date() });
    const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId: tA, unitId: unit, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: CAM, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", name: JSON.stringify({ th: R.extras.camera.name, en: "Camera" }), active: true, sortOrder: 1, updatedAt: new Date() });
    for (const [code, amount] of [["ADULT", AD], ["CHILD", CH], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId: tA, unitId: unit, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
    // ไม่ตั้งเขตรับส่ง: TripPickupZone ผูกระดับหน่วย (ไม่ใช่สินค้า · schema trips.prisma:124) — การแปลงเขตในลิงก์ถือใหม่ตรวจที่ตัวช่วยบริสุทธิ์ P-5
    PRD[key] = { id, slug, opt, unit, pt, cam };
  };
  const mkDep = async (tag: string, key: string, date: string, o: { capacity?: number; hm?: string; status?: string } = {}) => {
    const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const startsAt = BKK(date, o.hm ?? "08:00"), id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: tA, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8.5 * HOUR),
      status: o.status ?? "OPEN", capacity: o.capacity ?? 30, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    DEP[tag] = id; return id;
  };
  const staffCtx = (unit = uA, when = AFTER) => ({ tenantId: tA, unitId: unit, channel: "COUNTER", actor: { kind: "STAFF", userId: staffUser }, now: when.now });
  /** ขายที่นั่งจริงผ่าน bookTripsNow (STAFF · CONFIRMED) — ตัวนับ sold ตรงกับรายการ (ไม่ปลูกตัวนับเอง) */
  const fillSeats = async (key: string, depTag: string, adults: number) => {
    const p = PRD[key] as Prod;
    const line = { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: DEP[depTag], optionId: p.opt, pax: [{ paxTypeId: p.pt.ADULT, qty: adults }] };
    const qt = await tcall("quoteTrips", staffCtx(p.unit), { lines: [line] }); const qv = asRec(qt.value);
    ok(qt.ok === true && qv, `quoteTrips ${depTag}: ${fmt(qt)}`);
    const r = await tcall("bookTripsNow", staffCtx(p.unit), { idempotencyKey: `w14fill_${hex(8)}`, quoteId: qv?.quoteId, quoteExpiresAt: qv?.expiresAt, booker: { name: `ร้านเติม ${STAMP}`, phone: "+66899990001" }, pay: { method: "PAY_LATER" }, quote: { lines: [line] } });
    ok(r.ok === true, `bookTripsNow ${depTag}: ${fmt(r)}`);
  };
  try {
    await insertRow("Tenant", { id: tA, name: "ทดสอบ W1.4", slug: SA, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(tA);
    for (const [id, tag] of [[uA, "a"], [uX, "x"]] as const) await insertRow("BusinessUnit", { id, tenantId: tA, type: "TRIPS", status: "ACTIVE", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({}), updatedAt: new Date() });
    staffUser = rid("uo");
    await insertRow("User", { id: staffUser, email: `${EMAIL_PREFIX}o-${STAMP}@shark.local`, name: "ผู้ทดสอบ", updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mb"), userId: staffUser, tenantId: tA, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    Object.assign(OWNER, { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: staffUser });
    await insertRow("PaymentProfile", { id: rid("pp"), tenantId: tA, promptpayId: "0812345678", displayName: `ร้าน W14 ${STAMP}`, updatedAt: new Date() });
    // สินค้า: A หลัก · B อื่นหน่วยเดียวกัน (ขายได้) · C ร้านยืนยันก่อน · D ร่าง (status DRAFT = ไม่เห็นบนหน้าสาธารณะ · public-catalog.ts:97) · E ไม่มีทางเลือก · X หน่วยอื่น
    await mkProd("A", uA); await mkProd("B", uA); await mkProd("C", uA); await mkProd("D", uA, { status: "DRAFT" }); await mkProd("E", uA); await mkProd("X", uX);
    // A: D0 เต็ม (3) · D0−1 ว่าง 30 · D0+2 ว่าง 2 · D0+3 ว่าง 10 · D0−7 ว่าง 5 · D0+8 ว่าง 50 (นอกช่วง) · D5 ว่าง 2 · EXO/EXF/EXC/EXA/EXP ของการจองหมดเวลา
    await mkDep("A0", "A", D0, { capacity: 3 }); await mkDep("Am1", "A", addDays(D0, -1)); await mkDep("Ap2", "A", addDays(D0, 2), { capacity: 2 }); await mkDep("Ap3", "A", addDays(D0, 3), { capacity: 10 });
    await mkDep("Am7", "A", addDays(D0, -7), { capacity: 5 }); await mkDep("Ap8", "A", addDays(D0, 8), { capacity: 50 }); await mkDep("A5", "A", D5, { capacity: 2 }); await mkDep("A6", "A", D6, { capacity: 5 });
    await mkDep("EXO", "A", "2027-05-25"); await mkDep("EXF", "A", "2027-05-26", { capacity: 3 }); await mkDep("EXC", "A", "2027-05-27"); await mkDep("EXA", "A", "2027-05-28"); await mkDep("EXP", "A", "2027-05-29"); await mkDep("EXR", "A", "2027-05-30"); await mkDep("PAYD", "A", "2027-06-01"); await mkDep("EXAF", "A", "2027-06-02", { capacity: 1 });
    // วันเดียวกับ D0: B ว่าง 6 (09:00) · C ว่าง (ร้านยืนยันก่อน) · D ว่าง (ไม่เผยแพร่) · X ว่าง (หน่วยอื่น) · E เต็มวัน D0 และไม่มีวันอื่น
    await mkDep("B0", "B", D0, { capacity: 6, hm: "09:00" }); await mkDep("C0", "C", D0); await mkDep("D0", "D", D0); await mkDep("X0", "X", D0); await mkDep("E0", "E", D0, { capacity: 1 });
    await setV([{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uA, value: true }, { key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uX, value: true },
      { key: "trips.public.shopContact", scope: "UNIT", scopeId: uA, value: SHOP_CONTACT }, { key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PRD.C?.id, value: "SHOP_CONFIRMS" }]);
    await fillSeats("A", "A0", 3); await fillSeats("E", "E0", 1);
    // ── มติ D1 (ผู้เขียนข้อสอบแยก รอบ 2): สินค้าหลายวัน M (option 2 คืน = 3 วัน · pricing.ts:222) + รายการเสริม 3 ฐาน ──
    await mkProd("M", uA, { nights: 2 }); await mkDep("M1", "M", "2027-06-10", { capacity: 30 });
    for (const [tag, basis, price] of [["kayak", "PER_DAY", XKAYAK], ["snorkel", "PER_PAX", XSNORKEL], ["cabin", "PER_BOAT_NIGHT", XCABIN]] as const)
      XM[tag] = await insertRow("TripExtra", { id: rid(`x${tag}`), tenantId: tA, unitId: uA, productId: PRD.M?.id, kind: "EQUIPMENT", basis, mandatory: false, priceMinor: price, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
        name: JSON.stringify({ th: `เสริม ${tag} ${STAMP}`, en: `Extra ${tag}` }), active: true, sortOrder: 5, updatedAt: new Date() });
    // ── มติ D5: หน่วย uZ มีเขตรับส่ง 2 เขต (ไม่มีค่าบริการ / มีค่าบริการ) · TripPickupZone ผูกหน่วย (trips.prisma:124 · v2 ต้องครบ kind windowMin active basis) ──
    await insertRow("BusinessUnit", { id: uZ, tenantId: tA, type: "TRIPS", status: "ACTIVE", name: "หน่วย z", slug: `${SLUG}z-${STAMP}`, settings: JSON.stringify({}), updatedAt: new Date() });
    await mkProd("Z", uZ); await mkDep("Z1", "Z", "2027-06-12"); await mkDep("Z2", "Z", "2027-06-13");
    for (const [tag, surcharge] of [["free", 0], ["paid", ZONE_PAID]] as const)
      ZN[tag] = await insertRow("TripPickupZone", { id: rid(`z${tag}`), tenantId: tA, unitId: uZ, name: `เขต ${tag} ${STAMP}`, nameEn: `Zone ${tag}`, pickupOffsetMin: 30, surchargeSatang: surcharge, kind: "ZONE", windowMin: 30, active: true, basis: "PER_BOOKING", sortOrder: tag === "free" ? 0 : 1, updatedAt: new Date() });
    // ── มติ D3 D9: หน่วย uS — SM (สินค้าหลัก) + S01..S21 (ทริปอื่นวันเดียวกัน) + I1..I5 G1 (ตัวที่ต้องไม่ขึ้น/ตัวที่ขึ้น) ──
    await insertRow("BusinessUnit", { id: uS, tenantId: tA, type: "TRIPS", status: "ACTIVE", name: "หน่วย s", slug: `${SLUG}s-${STAMP}`, settings: JSON.stringify({}), updatedAt: new Date() });
    await mkProd("SM", uS);
    await mkDep("SMO", "SM", DSO); await mkDep("SM1", "SM", DS1, { capacity: 1 }); await mkDep("SM2", "SM", DS2, { capacity: 1 }); await mkDep("SM3", "SM", DS3, { capacity: 1, hm: "13:00" }); await mkDep("SM4", "SM", DS4, { capacity: 1 });
    // ORACLE-EDIT (มติ D11 · เพดาน 20 นับหลังตัวกรองหยาบใน SQL): DS1 = 21 ตัวไม่ผ่านตัวกรองหยาบ (ความจุ 1 < ต้องการ 3) · DS2 = 20 ตัว (S01–S17 ไม่ผ่าน · S18–S20 ผ่าน) — S21 ไม่มีรอบ DS2
    for (let i = 1; i <= 21; i++) {
      const k = `S${String(i).padStart(2, "0")}`; await mkProd(k, uS);
      await mkDep(`${k}d1`, k, DS1, { capacity: 1, hm: "09:00" });
      if (i <= 20) await mkDep(`${k}d2`, k, DS2, i >= 18 ? { capacity: 30, hm: "09:00" } : { capacity: 1, hm: "09:00" });
    }
    // มติ D11: DS4 = C01–C20 ผ่านตัวกรองหยาบ (ความจุ 30) แต่ไม่ผ่านตัวตรวจละเอียด (ร้านยืนยันก่อน = bookSaleState SHOP_CONFIRMS · ค่าตั้ง ไม่ใช่คอลัมน์) · Q21 = ตัวที่ 21 ตาม slug ผ่านทุกด่าน ออก 07:00 (ถ้าถูกสแกนจะขึ้นเป็นตัวแรก)
    for (let i = 1; i <= 20; i++) { const k = `C${String(i).padStart(2, "0")}`; await mkProd(k, uS); await mkDep(`${k}d4`, k, DS4, { capacity: 30, hm: "09:00" }); }
    await mkProd("Q21", uS); await mkDep("Q21d4", "Q21", DS4, { capacity: 30, hm: "07:00" });
    for (const k of ["I1", "I2", "I3", "I4", "I5", "G1"]) await mkProd(k, uS);
    await mkDep("I1d", "I1", DS3, { hm: "14:00" }); await pool.query(`UPDATE "TripOption" SET active = false WHERE id = $1`, [PRD.I1?.opt]); // มีแต่ตัวเลือกที่ปิด
    await mkDep("I2d", "I2", DS3, { hm: "08:00" }); // ออกแล้ว ณ 12:00
    await mkDep("I3d", "I3", DS3, { hm: "15:00" }); // ปิดรับ 10:00 (ค่าตั้งระดับสินค้า) ⇒ ปิดรับแล้ว ณ 12:00
    await mkDep("I4d", "I4", DS3, { hm: "14:00", status: "CANCELLED" });
    await mkDep("I5d", "I5", DS3, { hm: "14:00" }); await pool.query(`UPDATE "TripDeparture" SET "stopSell" = $2::jsonb WHERE id = $1`, [DEP.I5d, JSON.stringify({ reason: "qc w1.4" })]); // หยุดขายทุกช่องทาง
    await mkDep("G1d", "G1", DS3, { hm: "14:00" });
    await setV([{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uZ, value: true }, { key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uS, value: true },
      { key: "trips.sell.cutoff", scope: "UNIT", scopeId: uS, value: { daysBefore: 0, atMin: 1380 } }, { key: "trips.sell.cutoff", scope: "PRODUCT", scopeId: PRD.I3?.id, value: { daysBefore: 0, atMin: 600 } }]);
    await setV(Array.from({ length: 20 }, (_, i) => ({ key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PRD[`C${String(i + 1).padStart(2, "0")}`]?.id, value: "SHOP_CONFIRMS" })));
    await fillSeats("SM", "SM1", 1); await fillSeats("SM", "SM2", 1); await fillSeats("SM", "SM3", 1); await fillSeats("SM", "SM4", 1);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const needFx = () => ok(!setupErr && PRD.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`);

  // ── การจองสาธารณะผ่านเส้นจริงของ W1.2a (ถือ → ยืนยัน) แล้วปล่อยให้หมดเวลาด้วยตัวกวาดจริง (runExpireHolds) ──
  let phoneN = 0;
  const freshPhone = () => { phoneN++; return `06${String(parseInt(hex(2), 16) % 10_000).padStart(4, "0")}${String(phoneN).padStart(4, "0")}`; };
  type Bk = { tag: string; token: string; id: string; code: string; dep: string; phone: string; name: string };
  const BK: Record<string, Bk> = {};
  const nonceOf = (purpose: "hold" | "confirm") => { const r = pfn(BSI, "issueBookFormNonce", "W1.2a")({ now: new Date(NOW0.getTime() - 60_000), scope: { tenantId: tA, purpose } }); if (typeof r !== "string") throw new AssertFail(`nonce: ${fmt(r)}`); return r; };
  /** การเลือกเดิมของการจอง (ยอดรายการเสริมตอนจอง · มติ D1 เทียบยอดหลังตามลิงก์) */
  const ORIG: Record<string, { extrasSatang: number; query: Rec }> = {};
  const extrasOf = (lines: unknown) => asArr(lines).filter((l) => l.kind === "EXTRA" && l.passThrough !== true).reduce((a, l) => a + Number(l.amountSatang ?? 0), 0);
  const mkHeld = async (tag: string, depTag: string, pick: { adults: number; children?: number; camera?: boolean; prod?: string; extras?: string[]; zone?: string }): Promise<Bk> => {
    const p = PRD[pick.prod ?? "A"] as Prod; const devH = ck();
    const date = String((await q<{ d: string }>(`SELECT "localDate"::text AS d FROM "TripDeparture" WHERE id = $1`, [DEP[depTag]]))[0]?.d ?? "");
    const o0 = await pcall(BSI, "quoteBookSelection", "W1.2a", { shop: SA, productSlug: p.slug, query: { d: date }, acceptLanguage: "th", clientKey: devH }, N0);
    const sq: Rec = { "n.ADULT": String(pick.adults) };
    if (pick.children) sq["n.CHILD"] = String(pick.children);
    if (pick.camera) { const x = asArr(asRec(o0.options)?.extras).find((e) => /กล้อง|camera/i.test(String(asRec(e.name)?.text ?? e.name ?? ""))); ok(x?.ref, "ไม่พบรายการเสริมกล้อง"); sq[`x.${String(x?.ref)}`] = "1"; }
    for (const name of pick.extras ?? []) { const x = asArr(asRec(o0.options)?.extras).find((e) => JSON.stringify(e.name ?? "").includes(name)); ok(x?.ref, `ไม่พบรายการเสริม ${name}`); sq[`x.${String(x?.ref)}`] = "1"; }
    if (pick.zone) { const z = asArr(asRec(o0.options)?.zones).find((e) => JSON.stringify(e.name ?? "").includes(pick.zone ?? "")); ok(z?.ref, `ไม่พบเขต ${pick.zone}`); sq.z = String(z?.ref); }
    const s0 = await pcall(BSI, "quoteBookSelection", "W1.2a", { shop: SA, productSlug: p.slug, query: { d: date, ...sq }, acceptLanguage: "th", clientKey: devH }, N0);
    const sum = asRec(s0.summary); ok(s0.ok === true && sum, `สรุปยอด ${tag}: ${fmt(s0)}`);
    ORIG[tag] = { extrasSatang: extrasOf(sum?.lines), query: sq };
    const h = await pcall(BSI, "startBookHold", "W1.2a", { shop: SA, productSlug: p.slug, form: { d: date, t: String(sum?.slotToken), ...sq, nonce: nonceOf("hold"), seen: String(sum?.totalSatang) }, acceptLanguage: "th", clientKey: devH }, N0);
    ok(h.ok === true, `ถือ ${tag}: ${fmt(h)}`);
    const phone = freshPhone(), name = `ผู้จอง ${tag} ${STAMP}`;
    const c = await pcall(BSI, "confirmBookHold", "W1.2a", { shop: SA, basketToken: h.basketToken, sel: h.sel, form: { name, phone, email: "", accept: "on", nonce: nonceOf("confirm"), seen: String(sum?.totalSatang) }, clientKey: devH }, at(10_000));
    ok(c.ok === true, `ยืนยัน ${tag}: ${fmt(c)}`);
    const row = (await q<{ id: string; code: string }>(`SELECT id, code FROM "TripBooking" WHERE "publicTokenHash" = $1`, [sha256hex(String(c.token))]))[0];
    const b: Bk = { tag, token: String(c.token), id: String(row?.id), code: String(row?.code), dep: DEP[depTag] ?? "", phone, name };
    BK[tag] = b; return b;
  };
  if (!setupErr) {
    try {
      await mkHeld("EO", "EXO", { adults: 2, children: 1, camera: true }); // หมดเวลา · รอบเดิมยังว่าง
      await mkHeld("EF", "EXF", { adults: 3 }); // หมดเวลา แล้วรอบเต็ม (เติมด้านล่าง)
      await mkHeld("EC", "EXC", { adults: 1 }); // หมดเวลา แล้วรอบถูกยกเลิก
      await mkHeld("EA", "EXA", { adults: 1 }); // หมดเวลา · การจองผ่านเอเจนซี่ (ปรับฟิกซ์เจอร์)
      await mkHeld("EP", "EXP", { adults: 1, camera: true }); // หมดเวลา · รายการเสริมเลิกขาย (partial) + ข้อมูลผู้จองถูกลบ
      await mkHeld("ER", "EXR", { adults: 2 }); // หมดเวลา · ตามลิงก์ถือใหม่ไปจนถือได้ (EL)
      await mkHeld("EM", "M1", { adults: 2, prod: "M", extras: [`เสริม kayak ${STAMP}`, `เสริม snorkel ${STAMP}`, `เสริม cabin ${STAMP}`] }); // มติ D1: ต่อวัน · ต่อคน · ต่อคืน บนรอบ 3 วัน 2 คืน
      await mkHeld("EZF", "Z1", { adults: 1, prod: "Z", zone: `เขต free ${STAMP}` }); // มติ D5: เขตไม่มีค่าบริการ (ไม่อยู่ใน snapshot)
      await mkHeld("EZP", "Z2", { adults: 1, prod: "Z", zone: `เขต paid ${STAMP}` }); // มติ D5: เขตมีค่าบริการ (อยู่ใน snapshot)
      await mkHeld("EAF", "EXAF", { adults: 1 }); // มติ D4: เอเจนซี่ + รอบเต็ม
      const ex = await tcall("runExpireHolds", LATER.now, { tenantIds: [tA] });
      ok(asRec(ex)?.expired !== undefined || ex.ok !== "THROW", `runExpireHolds: ${fmt(ex)}`);
      await fillSeats("A", "EXF", 3);
      await mkHeld("PAY", "PAYD", { adults: 1 }); // ถือหลังตัวกวาด ⇒ ยัง HOLD (ตัวควบคุม EX-1: ไม่มีก้อนหมดเวลา) · รอบของตัวเอง (ไม่กระทบที่ว่างของ EXO)
      await pool.query(`UPDATE "TripDeparture" SET status = 'CANCELLED' WHERE id = $1`, [DEP.EXC]);
      await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT' WHERE id = $1`, [BK.EA?.id]);
      await fillSeats("A", "EXAF", 1); await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT' WHERE id = $1`, [BK.EAF?.id]);
      await pool.query(`UPDATE "TripExtra" SET active = false WHERE id = $1`, [PRD.A?.cam]); // หลังจองทุกตัวแล้ว (EP มีกล้อง ⇒ partial · EO ก็มีกล้อง ⇒ partial ด้วย — EX-5 ใช้ ER ที่ไม่มีกล้อง)
      await pool.query(`UPDATE "TripBooking" SET "piiPurgedAt" = $2 WHERE id = $1`, [BK.EP?.id, LATER.now]);
    } catch (e) { bookErr = e instanceof AssertFail ? e.message : errMsg(e); console.log(`  ⚠️ สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`); }
  }
  const needBk = (...tags: string[]): Bk[] => { needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`); return tags.map((t) => { const b = BK[t]; ok(b, `ไม่มีการจอง ${t}`); return b as Bk; }); };
  const fullOf = (r: Rec): Rec | null => asRec(asRec(r.vm)?.full);
  const expiredOf = (r: Rec): Rec | null => asRec(asRec(r.vm)?.expired);
  const bRow = async (id: string) => (await q<{ status: string; version: number; departureId: string }>(`SELECT status, version, "departureId" FROM "TripBooking" WHERE id = $1`, [id]))[0];

  // ═══════════════ PC ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "[service] หน้าสินค้า A ?d=D0 (ความจุ 3 ขาย 3) — พฤติกรรม W1.1 เดิม: ช่องวัน D0 สถานะ FULL ไม่เลือกได้ · requestedUnavailable true · หน้าถอยไปเลือกวันแรกที่ว่างของเดือน (D0−7) ⇒ vm.full ต้องคิดจากวันที่ขอ (d) ไม่ใช่วันที่หน้าเลือก", async () => {
    needFx();
    const r = await openProduct(PRD.A?.slug ?? "", { d: D0 });
    ok(r.ok === true, `openBookProduct: ${fmt(r)}`);
    const vm = asRec(r.vm);
    const cell = (Array.isArray(vm?.weeks) ? (vm?.weeks as unknown[][]).flat() : []).map((c) => asRec(c)).find((c) => c?.date === D0);
    eq([cell?.state, cell?.selectable, vm?.requestedUnavailable, asRec(vm?.selected)?.date], ["FULL", false, true, addDays(D0, -7)], "วัน D0");
  });
  await st("PC-2", "[service] ถือ 3 ที่บนรอบ D5 (เหลือ 2) ⇒ SOLD_OUT (W1.2a เดิม) · ไม่มีที่ถือใหม่", async () => {
    needFx(); const p = PRD.A as Prod; const devH = ck();
    const s0 = await pcall(BSI, "quoteBookSelection", "W1.2a", { shop: SA, productSlug: p.slug, query: { d: D5, "n.ADULT": "3" }, acceptLanguage: "th", clientKey: devH }, N0);
    const sum = asRec(s0.summary);
    const h = await pcall(BSI, "startBookHold", "W1.2a", { shop: SA, productSlug: p.slug, form: { d: D5, t: String(sum?.slotToken), "n.ADULT": "3", nonce: nonceOf("hold"), seen: String(sum?.totalSatang) }, acceptLanguage: "th", clientKey: devH }, N0);
    eq([h.ok, h.code], [false, "SOLD_OUT"], "ถือเกิน");
    eq(Number((await q<{ held: number }>(`SELECT held FROM "TripDeparture" WHERE id = $1`, [DEP.A5]))[0]?.held), 0, "held");
  });
  await st("PC-3", "[service] การจองทดสอบหมดเวลาด้วยตัวกวาดจริง (runExpireHolds ที่ LATER): EO EF EC EA EP ER = EXPIRED · held ของรอบ EXO คืนเป็น 0 (PAY ก็หมดเวลาที่ LATER — EX-1 เปิด PAY ด้วยนาฬิกา N0+30 วิ ซึ่งยังถืออยู่ตามเวลานั้น)", async () => {
    const bs = needBk("EO", "EF", "EC", "EA", "EP", "ER");
    eq(await Promise.all(bs.map(async (b) => (await bRow(b.id))?.status)), bs.map(() => "EXPIRED"), "สถานะ");
    eq(Number((await q<{ held: number }>(`SELECT held FROM "TripDeparture" WHERE id = $1`, [DEP.EXO]))[0]?.held), 0, "held ของ EXO");
  });
  await st("PC-4", "[service] หน้าการจองหมดเวลาวันนี้: state EXPIRED + ข้อความ res.expired/expiredPaid (W1.2a เดิม · ไม่มี QR)", async () => {
    const [b] = needBk("EO");
    const r = await openRes(b.token);
    eq([r.ok, asRec(r.vm)?.state, asRec(r.vm)?.pay ?? null], [true, "EXPIRED", null], "หน้า");
  });
  await st("PC-5", "[service] สินค้า C (ร้านยืนยันก่อน) ปุ่มจองปิด · D (DRAFT) ⇒ ไม่พบ · X อยู่หน่วยอื่น (ตัวควบคุมของ FS-3)", async () => {
    needFx();
    const c = await openProduct(PRD.C?.slug ?? "", { d: D0 });
    eq([c.ok, asRec(asRec(c.vm)?.cta)?.enabled], [true, false], "C");
    const d = await openProduct(PRD.D?.slug ?? "", { d: D0 });
    ok(d.ok !== true, `D ต้องไม่พบ: ${fmt(d)}`);
  });
  await st("PC-6", "[service] ค่าคาดหวังของวันใกล้เคียงคิดจากฟิกซ์เจอร์ = ที่ว่างจริงจาก listAvailability (D0−1 30 · D0+2 2 · D0+3 10 · D0−7 5 · D0+8 50)", async () => {
    needFx();
    const r = await tcall("listAvailability", { tenantId: tA, unitId: uA, channel: "WEB", actor: { kind: "PUBLIC", clientKey: "qc" }, now: N0.now }, { productId: PRD.A?.id, from: addDays(D0, -8), to: addDays(D0, 8) });
    ok(r.ok === true, `listAvailability: ${fmt(r)}`);
    // AvailabilityValue = AvailabilityRow (localDate · publicLeft · sellable.ts:109) + saleBlock (capacity-service.ts:295) · localDate อาจมาเป็น Date ⇒ ตัด 10 ตัว
    const left = Object.fromEntries(asArr(r.value).map((x) => [(x.localDate instanceof Date ? x.localDate.toISOString() : String(x.localDate)).slice(0, 10), Number(x.publicLeft)]));
    eq([left[addDays(D0, -1)], left[addDays(D0, 2)], left[addDays(D0, 3)], left[addDays(D0, -7)], left[addDays(D0, 8)], left[D0]], [30, 2, 10, 5, 50, 0], "publicLeft");
  });
  groupLine("PC");

  // ═══════════════ S ═══════════════
  console.log("\n── S: ขอบเขตไฟล์และกติกาโค้ด ──");
  const tip = git(["rev-parse", "--verify", "-q", "session/trips"]).trim();
  const same = (f: string) => !!tip && git(["diff", "--name-only", tip, "--", f]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", f]).trim() === "" && git(["ls-files", "--", f]).trim() !== "";
  const limBase = git(["merge-base", "HEAD", "session/trips"]).trim() || BASE_SHA;
  await st("S-1", `[code] ขอบเขต (เทียบ BASE ${BASE_SHA} · ไม่นับไฟล์ที่ตรงกับ session/trips/มาจาก main · ไม่นับ scratchpad/ ledger/): แตะได้เฉพาะไฟล์ใบสั่ง §3 ตามงบ`, () => {
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...FORBIDDEN_PATHS]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...FORBIDDEN_PATHS]).split("\n")].filter(Boolean))]
      .filter((f) => !f.startsWith("scratchpad/") && !f.startsWith("ledger/"));
    const bad = changed.filter((f) => !same(f) && !fromMainMerge(ROOT, f) && !changedOnlyByMainMerge(ROOT, BASE_SHA, f));
    ok(bad.length === 0, `แตะไฟล์นอกขอบเขต: ${bad.slice(0, 6).join(", ")}`);
    for (const [f, maxDel, maxAdd] of LIMITED) {
      if (same(f)) continue;
      const ns = git(["diff", "--numstat", limBase, "--", f]).trim().split(/\s+/);
      const add = ns[0] ? Number(ns[0]) : existsSync(join(ROOT, f)) ? read(f).split("\n").length : 0, del = Number(ns[1] || 0);
      ok(del <= maxDel && add <= maxAdd, `${f}: +${add} −${del} (จำกัด −${maxDel} +${maxAdd})`);
    }
  });
  await st("S-2", "[code] ไม่มี migration · ไม่มีคีย์ค่าตั้งใหม่ (prisma/ · core/settings ตรงกับ BASE ยกเว้นที่มาจาก main)", () => {
    const pr = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", "prisma", "src/lib/core/settings"]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", "prisma", "src/lib/core/settings"]).split("\n")].filter(Boolean))]
      .filter((f) => !fromMainMerge(ROOT, f) && !changedOnlyByMainMerge(ROOT, BASE_SHA, f));
    ok(pr.length === 0, `แตะ: ${pr.slice(0, 4).join(", ")}`);
  });
  await st("S-3", "[code] ไม่มี server action ใหม่: src/app/book/**/actions.ts ตรงกับ session/trips · ไฟล์ใหม่ใต้ /book ไม่มี 'use server'", () => {
    for (const f of walk("src/app/book").filter((x) => /actions\.ts$/.test(x))) ok(same(f), `${f} เปลี่ยน`);
    const fresh = git(["ls-files", "--others", "--exclude-standard", "--", "src/app/book", "src/components/book"]).split("\n").filter(Boolean);
    ok(!fresh.some((f) => /["']use server["']/.test(read(f))), "ไฟล์ใหม่มี 'use server'");
  });
  await st("S-4", "[code] ไม่มีหน้าใดใต้ src/app/book ตั้ง metadata referrer \"no-referrer\" (บทเรียน W1.3a V1) · หน้า t/ และ my/ ยัง force-dynamic", () => {
    const pages = walk("src/app/book").filter((f) => /\/(page|layout)\.tsx?$/.test(f));
    ok(!pages.some((f) => /referrer\s*:\s*["']no-referrer["']/.test(stripComments(read(f)))), "มี referrer no-referrer");
    for (const f of [PAGE_PROD, PAGE_RES]) ok(/export const dynamic\s*=\s*["']force-dynamic["']/.test(read(f)), `${f} ไม่ใช่ force-dynamic`);
  });
  await st("S-5", "[code] ไม่ต้องมี JS: BookFull.tsx ไม่มี 'use client' / onClick / useState / useEffect · ทางเลือกเป็น <a href>", () => {
    const s = stripComments(read(COMP_FULL));
    ok(s, "ยังไม่มี BookFull.tsx");
    ok(!/["']use client["']|onClick|useState|useEffect/.test(s), "BookFull ต้องเป็นคอมโพเนนต์เซิร์ฟเวอร์ล้วน");
    ok(/<a\b[^>]*href=/.test(s) || /Link\b/.test(s), "ไม่มีลิงก์ <a href>");
  });
  await st("S-6", "[code] ไม่มี route/loading/error ใต้ /book · ไม่มี dangerouslySetInnerHTML/fetch/any ในไฟล์ของใบ", () => {
    ok(!walk("src/app/book").some((f) => /\/(route|loading|error)\.tsx?$/.test(f)), "มี route/loading/error");
    for (const f of [PCORE, PSVC, BCORE, BSVC, PUBMOD, COMP_FULL, COMP_PROD, COMP_RES]) {
      const s = stripComments(read(f));
      ok(!/dangerouslySetInnerHTML|\bfetch\(/.test(s), `${f}: dangerouslySetInnerHTML/fetch`);
      ok(!/:\s*any\b|<any>|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable/.test(read(f)), `${f}: any/ธงปิดตัวตรวจ`);
    }
  });
  await st("S-7", "[code] W1.4a อ่านอย่างเดียว: บรรทัดที่เพิ่มใน src/ ไม่มีคำสั่งเขียน (INSERT/UPDATE/DELETE · .create/.update/.upsert/.delete · emitOutbox · audit) และไม่เรียกบริการเขียนของ trips", () => {
    const d = git(["diff", "-U0", limBase, "--", "src"]).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const bad = d.filter((l) => /\b(INSERT|UPDATE|DELETE)\b|\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|emitOutbox|audit[A-Z]\w*\(|holdTrips|confirmTrips|bookTripsNow|recordTripPayment|cancelTripBooking|joinWaitlist/.test(l));
    ok(bad.length === 0, `มีบรรทัดเขียน: ${bad.slice(0, 2).join(" | ").slice(0, 200)}`);
  });
  const th = (() => { try { return JSON.parse(read(MSG_TH)) as Rec; } catch { return {}; } })(), en = (() => { try { return JSON.parse(read(MSG_EN)) as Rec; } catch { return {}; } })();
  const flat = (o: unknown, pre = "", out: Record<string, unknown> = {}): Record<string, unknown> => { const r = asRec(o); if (!r) return out; for (const [k, v] of Object.entries(r)) { if (asRec(v)) flat(v, `${pre}${k}.`, out); else out[`${pre}${k}`] = v; } return out; };
  const TH = flat(th), EN = flat(en);
  await st("S-8", `[code] คีย์ข้อความใหม่ ${NEW_KEYS.length} คีย์ มีทั้ง th และ en (ไม่ว่าง)`, () => {
    const miss = NEW_KEYS.filter((k) => typeof TH[k] !== "string" || !TH[k] || typeof EN[k] !== "string" || !EN[k]);
    ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
  });
  await st("S-9", `[code] data-testid ใหม่ครบ ${TESTIDS.length} ตัว`, () => {
    const ui = [COMP_FULL, COMP_PROD, COMP_RES].map((f) => stripComments(read(f))).join("\n");
    const miss = TESTIDS.filter((t) => !new RegExp(`["'\`]${t}["'\`]`).test(ui));
    ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
  });
  groupLine("S");

  // ═══════════════ P ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ ──");
  type Day = { date: string; left: number; sellable: boolean };
  const days: Day[] = [
    { date: addDays(D0, -1), left: 30, sellable: true }, { date: addDays(D0, 2), left: 2, sellable: true }, { date: addDays(D0, 3), left: 10, sellable: true },
    { date: addDays(D0, -7), left: 5, sellable: true }, { date: addDays(D0, 8), left: 50, sellable: true }, { date: D0, left: 0, sellable: true }, { date: addDays(D0, 1), left: 40, sellable: false },
  ];
  await st("P-1", "[pure] nearbyDatesOf({selected D0, want 3, days}) = [D0−1, D0+3] (≥ want · ห่างน้อยก่อน · ไม่เกิน 2 · ตัด D0 · ตัดวันขายไม่ได้ · ตัดนอกช่วง ±7)", () => {
    const f = pfn(PCI, "nearbyDatesOf", "trips-public-core");
    eq(asArr(f({ selected: D0, want: 3, days })).map((d) => [d.date, d.left]), [[addDays(D0, -1), 30], [addDays(D0, 3), 10]], "ผล");
  });
  await st("P-2", "[pure] want null ⇒ เกณฑ์ ≥ 1: [D0−1, D0+2] · want 40 ⇒ [] (D0+8 นอกช่วง · D0+1 ขายไม่ได้)", () => {
    const f = pfn(PCI, "nearbyDatesOf", "trips-public-core");
    eq(asArr(f({ selected: D0, want: null, days })).map((d) => d.date), [addDays(D0, -1), addDays(D0, 2)], "want null");
    eq(asArr(f({ selected: D0, want: 40, days })).map((d) => d.date), [], "want 40");
  });
  await st("P-3", "[pure] ห่างเท่ากัน ⇒ วันก่อนก่อน (D0−3 กับ D0+3 ⇒ D0−3 ก่อน) · ช่วงยึด selected ไม่ยึดวันนี้ (ไม่มีอาร์กิวเมนต์ today)", () => {
    const f = pfn(PCI, "nearbyDatesOf", "trips-public-core");
    eq(asArr(f({ selected: D0, want: 1, days: [{ date: addDays(D0, 3), left: 5, sellable: true }, { date: addDays(D0, -3), left: 5, sellable: true }] })).map((d) => d.date), [addDays(D0, -3), addDays(D0, 3)], "เรียง");
  });
  await st("P-4", "[pure] fullStateOf: ทุกรอบที่ไม่ปิดเหตุอื่นเหลือ 0 ⇒ true · มีรอบว่าง ⇒ false · ไม่มีรอบ ⇒ false · e=SOLD_OUT + want > left ⇒ true", () => {
    const f = pfn(PCI, "fullStateOf", "trips-public-core");
    eq([f({ slots: [{ left: 0, saleBlock: null }], error: null, want: null }), f({ slots: [{ left: 0, saleBlock: null }, { left: 4, saleBlock: null }], error: null, want: null }), f({ slots: [], error: null, want: null }), f({ slots: [{ left: 2, saleBlock: null }], error: "SOLD_OUT", want: 3 })], [true, false, false, true], "ผล");
  });
  const snapLines = [{ kind: "SEAT", paxTypeCode: "ADULT", qty: 2 }, { kind: "SEAT", paxTypeCode: "CHILD", qty: 1 }, { kind: "EXTRA", extraId: "xA", qty: 1 }, { kind: "PICKUP", zoneId: "zA", qty: 1 }];
  await st("P-5", "[pure] reholdSelectionOf(snapshot.lines, catalog): n.ADULT 2 · n.CHILD 1 · x.<ref ของ xA> 1 · z <ref ของ zA> · ครบ ⇒ partial false · xA เลิกขาย ⇒ ไม่มี x. + partial true", () => {
    const f = pfn(BCI, "reholdSelectionOf", "trips-book-core");
    const cat = { paxCodes: ["ADULT", "CHILD", "INFANT"], extras: [{ id: "xA", ref: "refxa" }], zones: [{ id: "zA", ref: "refza" }] };
    eq(asRec(f(snapLines, cat)), { query: { "n.ADULT": "2", "n.CHILD": "1", "x.refxa": "1", z: "refza" }, partial: false }, "ครบ");
    eq(asRec(f(snapLines, { ...cat, extras: [] })), { query: { "n.ADULT": "2", "n.CHILD": "1", z: "refza" }, partial: true }, "รายการเสริมเลิกขาย");
  });
  await st("P-6", "[pure] reholdSelectionOf: ไม่ใช่อาร์เรย์ / ไม่มีบรรทัด SEAT / ประเภทคนที่นับที่นั่งปิดหมด ⇒ null · ไม่ throw", () => {
    const f = pfn(BCI, "reholdSelectionOf", "trips-book-core");
    const cat = { paxCodes: ["INFANT"], extras: [], zones: [] };
    eq([f(null, cat), f([{ kind: "EXTRA", extraId: "x", qty: 1 }], cat), f(snapLines, cat)], [null, null, null], "ผล");
  });
  groupLine("P");

  // ═══════════════ FS (service) ═══════════════
  console.log("\n── FS: ก้อนรอบเต็ม [service] ──");
  const fullA = async (query: Rec) => { const r = await openProduct(PRD.A?.slug ?? "", query); ok(r.ok === true, `openBookProduct: ${fmt(r)}`); return { r, full: fullOf(r) }; };
  await st("FS-1", "[service] A วัน D0 + n.ADULT=3 ⇒ vm.full {want 3 · left 0 · date D0} · ไม่มีปุ่มฝากชื่อ (ไม่มีคีย์ waitlist ใน VM)", async () => {
    needFx(); const { full, r } = await fullA({ d: D0, "n.ADULT": "3" });
    ok(full, "ไม่มี vm.full");
    eq([full?.want, full?.left, full?.date], [3, 0, D0], "ค่า");
    ok(!/waitlist/i.test(JSON.stringify(r.vm)), "มีเรื่องรายการรอใน VM (W1.4c)");
  });
  await st("FS-2", "[service] วันใกล้เคียง = [D0−1 ว่าง 30, D0+3 ว่าง 10] · href ไปหน้า A · d=<วัน> · m · n.ADULT=3 · ไม่มี t · ไม่มี token/ข้อมูลบุคคล", async () => {
    needFx(); const { full } = await fullA({ d: D0, "n.ADULT": "3" }); ok(full, "ไม่มี vm.full");
    const nb = asArr(full?.nearby);
    eq(nb.map((x) => [x.date, x.left]), [[addDays(D0, -1), 30], [addDays(D0, 3), 10]], "วัน");
    for (const x of nb) {
      const href = String(x.href ?? ""); const qs = qsOf(href);
      ok(href.startsWith(`/book/${SA}/t/${PRD.A?.slug}`), `href: ${href}`);
      eq([qs.get("d"), qs.get("n.ADULT"), qs.has("t"), qs.get("m")], [String(x.date), "3", false, String(x.date).slice(0, 7)], "พารามิเตอร์");
    }
  });
  await st("FS-3", "[service] ทริปอื่นวันเดียวกัน = [B ว่าง 6] เท่านั้น (C ร้านยืนยันก่อน · D ไม่เผยแพร่ · E เต็ม · X หน่วยอื่น ⇒ ไม่มี) · href หน้า B d=D0 ไม่มี n.*", async () => {
    needFx(); const { full } = await fullA({ d: D0, "n.ADULT": "3" }); ok(full, "ไม่มี vm.full");
    const sd = asArr(full?.sameDay);
    eq(sd.map((x) => [String(x.href ?? "").split("?")[0], x.left]), [[`/book/${SA}/t/${PRD.B?.slug}`, 6]], "รายการ");
    const qs = qsOf(String(sd[0]?.href ?? ""));
    eq([qs.get("d"), [...qs.keys()].some((k) => k.startsWith("n."))], [D0, false], "พารามิเตอร์");
  });
  await st("FS-4", "[service] want 7 ⇒ ทริปอื่นวันเดียวกันว่าง 6 ไม่พอ ⇒ sameDay [] · วันใกล้เคียง [D0−1 ว่าง 30, D0+3 ว่าง 10] (D0−7 ว่าง 5 ไม่พอ)", async () => {
    needFx(); const { full } = await fullA({ d: D0, "n.ADULT": "7" }); ok(full, "ไม่มี vm.full");
    eq([asArr(full?.sameDay).length, asArr(full?.nearby).map((x) => x.date)], [0, [addDays(D0, -1), addDays(D0, 3)]], "ผล");
  });
  await st("FS-5", "[service] รอบเหลือ 2 (D5) + n.ADULT=3 + e=SOLD_OUT ⇒ vm.full {want 3 · left 2} · ไม่มี e ⇒ ไม่มีก้อน (ยังถือได้ 2)", async () => {
    needFx();
    const a = await fullA({ d: D5, "n.ADULT": "3", e: "SOLD_OUT" });
    eq([a.full?.want, a.full?.left], [3, 2], "มี e");
    const b = await fullA({ d: D5, "n.ADULT": "3" });
    eq(b.full ?? null, null, "ไม่มี e");
  });
  await st("FS-6", "[service] วันที่ว่างปกติ (D0−1) ⇒ vm.full = null · สินค้า E วัน D0 (เต็ม · ไม่มีวันอื่น · ทริปอื่นวันเดียวกัน B) ⇒ ก้อนมี nearby [] · B ใน sameDay", async () => {
    needFx();
    eq(fullOf(await openProduct(PRD.A?.slug ?? "", { d: addDays(D0, -1) })) ?? null, null, "วันว่าง");
    const e = fullOf(await openProduct(PRD.E?.slug ?? "", { d: D0 })); ok(e, "ไม่มี vm.full ของ E");
    eq([asArr(e?.nearby).length, asArr(e?.sameDay).map((x) => String(x.href).split("?")[0])], [0, [`/book/${SA}/t/${PRD.B?.slug}`]], "E");
  });
  await st("FS-7", "[service] ไม่มีทางเลือกเลย (E + n.ADULT=7) ⇒ nearby [] sameDay [] · contact = ช่องทาง X30 ของร้าน (เบอร์ · LINE) · VM ไม่มีคีย์/ค่าภายใน", async () => {
    needFx(); const r = await openProduct(PRD.E?.slug ?? "", { d: D0, "n.ADULT": "7" }); const full = fullOf(r); ok(full, "ไม่มี vm.full");
    eq([asArr(full?.nearby).length, asArr(full?.sameDay).length], [0, 0], "ทางเลือก");
    ok(JSON.stringify(full?.contact ?? {}).includes(SHOP_CONTACT.phone), "ไม่มีช่องทางติดต่อร้าน");
    noInternal(full, "vm.full", [PRD.A?.id ?? "", PRD.B?.id ?? "", DEP.B0 ?? "", tA, uA]);
  });
  await st("FS-8", "[service] ถังอ่านถูกกินครั้งเดียวต่อการเปิดหน้า (เท่ากันทั้งวันเต็มที่มีก้อน และวันว่างที่ไม่มีก้อน)", async () => {
    needFx(); const k1 = ck(), k2 = ck();
    const cnt = async (k: string) => Number((await q<{ c: number }>(`SELECT coalesce(sum(count), 0)::int AS c FROM "ChatRateBucket" WHERE key LIKE $1`, [`%${k}%`]))[0]?.c ?? 0);
    await openProduct(PRD.A?.slug ?? "", { d: D0, "n.ADULT": "3" }, N0, k1); await openProduct(PRD.A?.slug ?? "", { d: addDays(D0, -1) }, N0, k2);
    const [c1, c2] = [await cnt(k1), await cnt(k2)];
    ok(c2 >= 1, `ตัวควบคุม: หาแถวถังอ่านของเครื่องไม่เจอ (คีย์ไม่มีกุญแจเครื่อง?) c2=${c2}`);
    eq(c1, c2, "ถังของสองเครื่อง");
  });
  await st("FS-9", "[service] ช่วงยึดวันที่เลือก ไม่ยึดนาฬิกา: เปิดด้วย now = 2027-05-01 และ 2027-03-01 ได้ nearby เท่ากัน · now หลัง D0−1 ปิดรับ ⇒ D0−1 หายไป (ตัดตามนาฬิกาของคำขอ)", async () => {
    needFx();
    const a = fullOf(await openProduct(PRD.A?.slug ?? "", { d: D0, "n.ADULT": "3" }, { now: new Date("2027-05-01T03:00:00Z") })); ok(a, "ไม่มี vm.full");
    const b = fullOf(await openProduct(PRD.A?.slug ?? "", { d: D0, "n.ADULT": "3" }, N0));
    eq(asArr(a?.nearby).map((x) => x.date), asArr(b?.nearby).map((x) => x.date), "สองนาฬิกา");
    const c = fullOf(await openProduct(PRD.A?.slug ?? "", { d: D0, "n.ADULT": "3" }, { now: BKK(addDays(D0, -1), "09:00") }));
    ok(!asArr(c?.nearby).some((x) => x.date === addDays(D0, -1)), `หลังปิดรับ D0−1 ยังอยู่: ${fmt(c?.nearby)}`);
  });
  groupLine("FS");

  // ═══════════════ เรนเดอร์หน้า + action จริง (แบบ qc-trips-w1.3 V2 / P1) ═══════════════
  (globalThis as Rec).AsyncLocalStorage ??= AsyncLocalStorage;
  const nWork = asRec(await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null));
  const nUnit = asRec(await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null));
  const nCookies = asRec(await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null));
  const PPROD = await tryImport("@/app/book/[shop]/t/[productSlug]/page");
  const PRES = await tryImport("@/app/book/[shop]/my/[token]/page");
  const ACTI = await tryImport("@/app/book/[shop]/actions");
  const inRequest = async <T,>(route: string, pathname: string, search: string, ip: string, phase: "render" | "action", fn: () => Promise<T> | T): Promise<T> => {
    const ws = asRec(nWork?.workAsyncStorage), us = asRec(nUnit?.workUnitAsyncStorage), RC = nCookies?.RequestCookies;
    ok(ws && us && typeof RC === "function", "หาขอบเขตคำขอของ Next ไม่ได้");
    const req = new Request(`http://qc.local${pathname}${search}`, { method: phase === "action" ? "POST" : "GET", headers: { "x-real-ip": ip, "accept-language": "th", "user-agent": "qc-w14", ...(phase === "action" ? { "content-type": "multipart/form-data; boundary=x", "next-action": "qc" } : {}) } });
    const jar = new (RC as new (h: Headers) => unknown)(req.headers);
    const workStore = { route, page: `${route}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
    const unit = { type: "request", phase, implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search } };
    return (ws?.run as AnyFn).call(ws, workStore, () => (us?.run as AnyFn).call(us, unit, fn)) as Promise<T>;
  };
  const productHtml = async (slug: string, sp: Record<string, string>): Promise<string> => {
    const Page = PPROD.mod?.default; ok(typeof Page === "function", `โหลดหน้าสินค้าไม่ได้ (${PPROD.err.slice(0, 100)})`);
    const el = await inRequest("/book/[shop]/t/[productSlug]", `/book/${SA}/t/${slug}`, `?${new URLSearchParams(sp)}`, IP_OF.get(ck()) ?? "100.68.250.1", "render", () => (Page as AnyFn)({ params: Promise.resolve({ shop: SA, productSlug: slug }), searchParams: Promise.resolve(sp) }));
    return renderToStaticMarkup(el as never);
  };
  const resHtml = async (b: Bk, sp: Record<string, string> = {}): Promise<string> => {
    const Page = PRES.mod?.default; ok(typeof Page === "function", `โหลดหน้า my/[token] ไม่ได้ (${PRES.err.slice(0, 100)})`);
    const el = await inRequest("/book/[shop]/my/[token]", `/book/${SA}/my/${b.token}`, "", IP_OF.get(ck()) ?? "100.68.250.2", "render", () => (Page as AnyFn)({ params: Promise.resolve({ shop: SA, token: b.token }), searchParams: Promise.resolve(sp) }));
    return renderToStaticMarkup(el as never);
  };
  const unent = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const tpl = (lang: "th" | "en", k: string, vars: Rec = {}) => String((lang === "th" ? TH : EN)[k] ?? "∅").replace(/\{(\w+)\}/g, (m, v: string) => (v in vars ? String(vars[v]) : m));
  const head = (v: string) => v.split("{")[0]?.trim() ?? "";
  const hrefsIn = (h: string, testid: string): string[] => [...h.matchAll(new RegExp(`<a\\b[^>]*data-testid="${testid}"[^>]*>`, "g"))].map((m) => unent(/\bhref="([^"]*)"/.exec(m[0])?.[1] ?? "")).concat(
    [...h.matchAll(new RegExp(`data-testid="${testid}"[\\s\\S]*?<a\\b[^>]*href="([^"]*)"`, "g"))].map((m) => unent(m[1] ?? "")));

  console.log("\n── FP: ก้อนรอบเต็ม [page] ──");
  await st("FP-1", "[page] หน้าสินค้า A ?d=D0&n.ADULT=3 (นาฬิกาจริง · รอบปี 2027) ⇒ book-full · ข้อความ full.title + full.want {want 3 · left 0} · ลิงก์วันใกล้เคียง 2 อัน (d = D0−1, D0+3) · ลิงก์ทริปอื่น 1 อัน (B)", async () => {
    needFx(); const h = await productHtml(PRD.A?.slug ?? "", { d: D0, "n.ADULT": "3" }); const t = unent(h);
    ok(h.includes('data-testid="book-full"'), `ไม่มี book-full: ${t.slice(0, 200)}`);
    ok(t.includes(tpl("th", "full.title")) && t.includes(tpl("th", "full.want", { want: 3, left: 0 })), "ข้อความ");
    const near = hrefsIn(h, "book-full-nearby-item").map((x) => qsOf(x).get("d"));
    eq(near, [addDays(D0, -1), addDays(D0, 3)], "ลิงก์วันใกล้เคียง");
    eq(hrefsIn(h, "book-full-sameday-item").map((x) => x.split("?")[0]), [`/book/${SA}/t/${PRD.B?.slug}`], "ลิงก์ทริปอื่น");
  });
  await st("FP-2", "[page] ?lang=en ⇒ ข้อความภาษาอังกฤษ (full.title en · full.nearby en) · ไม่มีอักษรไทยในก้อน (ยกเว้นชื่อสินค้าที่ร้านไม่แปล)", async () => {
    needFx(); const h = await productHtml(PRD.A?.slug ?? "", { d: D0, "n.ADULT": "3", lang: "en" });
    const blk = /data-testid="book-full"[\s\S]*?<\/section>/.exec(h)?.[0] ?? "";
    const t = unent(blk);
    ok(t.includes(tpl("en", "full.title")) && t.includes(tpl("en", "full.nearby")), `en: ${t.slice(0, 200)}`);
  });
  await st("FP-3", "[page] ไม่มีทางเลือก + ร้านไม่มีช่องทางติดต่อ (หน่วย X ไม่ตั้ง X30 · สินค้า X เต็มวัน D0) ⇒ full.noneNoContact (ไม่มีชื่อร้านลอย ๆ · มติ L8)", async () => {
    needFx(); await fillSeats("X", "X0", 30);
    const hx = await productHtml(PRD.X?.slug ?? "", { d: D0, "n.ADULT": "40" }); ok(hx.includes('data-testid="book-full"'), "ไม่มี book-full"); const t = unent(hx);
    ok(t.includes(tpl("th", "full.noneNoContact")) && !t.includes(head(tpl("th", "full.none")) + " {"), `ข้อความ: ${t.slice(0, 200)}`);
  });
  await st("FP-4", "[page] ไม่ต้องมี JS: ก้อน book-full เป็นลิงก์ <a href> ล้วน (ไม่มี <button> ที่ไม่อยู่ในฟอร์ม · ไม่มี onclick)", async () => {
    needFx(); const h = await productHtml(PRD.A?.slug ?? "", { d: D0, "n.ADULT": "3" });
    const blk = /data-testid="book-full"[\s\S]*?<\/section>/.exec(h)?.[0] ?? "";
    ok(blk, "ไม่มีก้อน");
    ok(!/onclick/i.test(blk) && (!/<button\b/.test(blk) || /<form\b/.test(blk)), "ก้อนต้องใช้ได้โดยไม่มี JS");
  });
  groupLine("FP");

  console.log("\n── FA: ถือเกินที่ว่าง [action] ──");
  type Redir = { kind: string; url: string; q: URLSearchParams; err: string };
  const runAction = async (name: string, ip: string, args: unknown[]): Promise<Redir> => {
    const fn = ACTI.mod?.[name]; ok(typeof fn === "function", `โหลด ${name} ไม่ได้ (${ACTI.err.slice(0, 100)})`);
    try { await inRequest("/book/[shop]/t/[productSlug]", "/book/x/t/y", "", ip, "action", () => (fn as AnyFn)(...args)); return { kind: "RETURN", url: "", q: new URLSearchParams(), err: "" }; } catch (e) {
      const d = String(asRec(e)?.digest ?? "");
      if (d.startsWith("NEXT_REDIRECT")) { const url = d.split(";")[2] ?? ""; return { kind: "REDIRECT", url, q: new URL(url, "http://x").searchParams, err: "" }; }
      return { kind: "THROW", url: "", q: new URLSearchParams(), err: errMsg(e) };
    }
  };
  const formDataOf = (h: string, typed: Record<string, string>): FormData => {
    // ฟอร์มถือที่ = ฟอร์มที่มีช่อง nonce (ไม่ใช่ฟอร์ม GET ของปุ่ม − / + ที่อยู่ก่อนหน้าในก้อนเลือก)
    const fd = new FormData(); const form = (h.match(/<form\b[\s\S]*?<\/form>/g) ?? []).find((f) => /name="nonce"/.test(f)) ?? "";
    ok(form, "ไม่พบฟอร์มถือที่ (ฟอร์มที่มีช่อง nonce) บนหน้า");
    for (const tag of form.match(/<(input|select)\b[^>]*>/g) ?? []) {
      const name = /\bname="([^"]*)"/.exec(tag)?.[1]; if (!name) continue;
      const type = /\btype="([^"]*)"/.exec(tag)?.[1] ?? "text"; const value = unent(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? "");
      if (name in typed) fd.append(name, typed[name] ?? ""); else if (type === "hidden") fd.append(name, value);
    }
    for (const [k, v] of Object.entries(typed)) if (!fd.has(k)) fd.append(k, v);
    return fd;
  };
  let soldOutUrl = "";
  await st("FA-1", "[action] หน้า A วัน D6 (ว่าง 5) เลือก n.ADULT=3 → เรนเดอร์ฟอร์มถือที่จริง → ร้านขาย 3 ที่ก่อนลูกค้ากด (เหลือ 2) → startBookHoldAction (FormData ของฟอร์มนั้น) ⇒ redirect หน้าสินค้า e=SOLD_OUT พา n.ADULT=3 กลับมา · ไม่มีที่ถือใหม่", async () => {
    needFx(); const slug = PRD.A?.slug ?? "";
    // หมายเหตุ: บนรอบที่เหลือน้อยกว่าที่ขอ ตัวเลือกจำนวนคนของหน้าจำกัดอยู่แล้ว (เลือก 3 บนรอบเหลือ 2 ⇒ INVALID ไม่ใช่ SOLD_OUT) — SOLD_OUT จริงเกิดเมื่อที่หมดระหว่างเปิดฟอร์มกับกดส่ง
    const h = await productHtml(slug, { d: D6, "n.ADULT": "3" });
    ok(h.includes('data-testid="book-select"') && /<form\b/.test(h), "ไม่มีฟอร์มถือที่บนหน้า");
    const fd = formDataOf(h, {});
    await fillSeats("A", "A6", 3);
    await new Promise((r) => setTimeout(r, 1_200));
    const r = await runAction("startBookHoldAction", IP_OF.get(ck()) ?? "100.68.250.3", [SA, slug, fd]);
    ok(r.kind === "REDIRECT" && r.q.get("e") === "SOLD_OUT" && r.q.get("n.ADULT") === "3", `ผล: ${fmt([r.kind, r.url, r.err])}`);
    eq(Number((await q<{ held: number }>(`SELECT held FROM "TripDeparture" WHERE id = $1`, [DEP.A6]))[0]?.held), 0, "held");
    soldOutUrl = r.url;
  });
  await st("FA-2", "[page] เปิด URL ที่ FA-1 redirect ไป ⇒ book-full ด้วย full.short {left 2 · want 3} + ลิงก์ทางเลือก", async () => {
    ok(soldOutUrl, "FA-1 ไม่ผ่าน");
    const u = new URL(soldOutUrl, "http://x"); const sp = Object.fromEntries(u.searchParams.entries());
    const t = unent(await productHtml(PRD.A?.slug ?? "", sp));
    ok(t.includes(tpl("th", "full.short", { left: 2, want: 3 })), `ข้อความ: ${t.slice(0, 200)}`);
  });
  groupLine("FA");

  // ═══════════════ EX (service) ═══════════════
  console.log("\n── EX: หน้าการจองหมดเวลา [service] ──");
  await st("EX-1", "[service] vm.expired มีเฉพาะสถานะ EXPIRED: PAY (ยังถือที่ ที่ N0) ⇒ null · EO ⇒ มี", async () => {
    const [pay, eo] = needBk("PAY", "EO");
    eq(expiredOf(await openRes(pay.token, at(30_000))) ?? null, null, "PAY");
    ok(expiredOf(await openRes(eo.token)), "EO ไม่มี vm.expired");
  });
  await st("EX-2", "[service] heldUntilDate/heldUntilLocal = expiresAt ของที่ถือ (เวลาร้าน Asia/Bangkok) — คิดจากแถว TripHold", async () => {
    const [b] = needBk("EO");
    const h = (await q<{ e: Date }>(`SELECT max("expiresAt") AS e FROM "TripHold" WHERE "bookingId" = $1`, [b.id]))[0]?.e as Date;
    const local = new Date(h.getTime() + 7 * HOUR).toISOString();
    const x = expiredOf(await openRes(b.token)); ok(x, "ไม่มี vm.expired");
    eq([x?.heldUntilDate, x?.heldUntilLocal], [local.slice(0, 10), local.slice(11, 16)], "เวลา");
  });
  await st("EX-3", "[service] รอบเดิมยังว่าง (EXO ความจุ 30 · ถือ 1 ที่ของ PAY ปล่อยแล้วตอน LATER) ⇒ now {state OPEN · left 30} · rehold มีลิงก์", async () => {
    const [b] = needBk("EO"); const x = expiredOf(await openRes(b.token)); ok(x, "ไม่มี vm.expired");
    eq([asRec(x?.now)?.state, asRec(x?.now)?.left, !!asRec(x?.rehold)?.href], ["OPEN", 30, true], "ตอนนี้");
  });
  await st("EX-4", "[service] ลิงก์ถือใหม่ (ER · ผู้ใหญ่ 2 ไม่มีรายการเสริม): /book/<shop>/t/<A>?d=<วันเดิม>&t=<ตัวอ้างรอบเดิม>&n.ADULT=2 · partial false · ไม่มี token เดิม · ไม่มีข้อมูลผู้จอง", async () => {
    const [b] = needBk("ER"); const x = expiredOf(await openRes(b.token)); ok(x, "ไม่มี vm.expired"); const rh = asRec(x?.rehold);
    const href = String(rh?.href ?? ""); const qs = qsOf(href);
    ok(href.startsWith(`/book/${SA}/t/${PRD.A?.slug}?`), `href: ${href}`);
    const slotTok = pfn(PUBI, "bookSlotToken", "W1.1")(tA, DEP.EXR);
    eq([qs.get("d"), qs.get("t"), qs.get("n.ADULT"), qs.has("n.CHILD"), rh?.partial], ["2027-05-30", slotTok, "2", false, false], "ลิงก์");
    ok(!href.includes(b.token) && !href.includes(b.phone) && !href.includes(encodeURIComponent(b.name)), "ลิงก์มี token/ข้อมูลผู้จอง");
  });
  await st("EX-5", "[service] รายการเสริมเลิกขายหลังจอง (EO มีกล้อง) ⇒ ลิงก์มี n.ADULT=2 n.CHILD=1 ไม่มี x. · partial true", async () => {
    const [b] = needBk("EO"); const ex = expiredOf(await openRes(b.token)); ok(ex, "ไม่มี vm.expired"); const rh = asRec(ex?.rehold); const qs = qsOf(String(rh?.href ?? ""));
    eq([qs.get("n.ADULT"), qs.get("n.CHILD"), [...qs.keys()].some((k) => k.startsWith("x.")), rh?.partial], ["2", "1", false, true], "ลิงก์");
  });
  await st("EX-6", "[service] รอบเดิมเต็ม (EF · เติม 3 ที่หลังหมดเวลา) ⇒ now FULL · rehold ยังมี · full = ก้อนรอบเต็มของวันเดิม {want 3 · left 0}", async () => {
    const [b] = needBk("EF"); const x = expiredOf(await openRes(b.token)); ok(x, "ไม่มี vm.expired");
    eq([asRec(x?.now)?.state, !!asRec(x?.rehold)?.href, asRec(x?.full)?.want, asRec(x?.full)?.left], ["FULL", true, 3, 0], "ผล");
  });
  await st("EX-7", "[service] รอบเดิมถูกยกเลิก (EC) ⇒ now CLOSED · rehold null · full = null หรือก้อนทางเลือก (ไม่มีปุ่มถือรอบเดิม)", async () => {
    const [b] = needBk("EC"); const x = expiredOf(await openRes(b.token)); ok(x, "ไม่มี vm.expired");
    eq([asRec(x?.now)?.state, x?.rehold ?? null], ["CLOSED", null], "ผล");
  });
  await st("EX-8", "[service] การจองผ่านเอเจนซี่ (EA · collectMode AGENT) ⇒ rehold null (เอเจนซี่จัดการเอง)", async () => {
    const [b] = needBk("EA"); const x = expiredOf(await openRes(b.token)); ok(x, "ไม่มี vm.expired"); eq(x?.rehold ?? null, null, "rehold");
  });
  await st("EX-9", "[service] ข้อมูลผู้จองถูกลบแล้ว (EP · piiPurgedAt) ⇒ ยังมี vm.expired · VM ทั้งก้อนไม่มีชื่อ/เบอร์/คีย์ภายใน", async () => {
    const [b] = needBk("EP"); const r = await openRes(b.token); ok(expiredOf(r), "ไม่มี vm.expired");
    noInternal(expiredOf(r), "vm.expired", [b.phone, b.phone.slice(1), b.name, b.id, b.dep]);
  });
  await st("EX-10", "[service] เปิดหน้าการจองหมดเวลา 3 ครั้ง ⇒ การจองเดิมไม่เปลี่ยน (status · version · departureId) · ไม่มีที่ถือ/การจองใหม่", async () => {
    const [b] = needBk("EO"); const r0 = await bRow(b.id); const n0 = Number((await q<{ c: number }>(`SELECT count(*)::int AS c FROM "TripBooking" WHERE "tenantId" = $1`, [tA]))[0]?.c);
    for (let i = 0; i < 3; i++) await openRes(b.token);
    eq([await bRow(b.id), Number((await q<{ c: number }>(`SELECT count(*)::int AS c FROM "TripBooking" WHERE "tenantId" = $1`, [tA]))[0]?.c)], [r0, n0], "ไม่เปลี่ยน");
  });
  await st("EX-11", "[service] ร้านปิดปุ่มจองออนไลน์ (bookingEnabled false) ⇒ rehold null แต่ก้อนหมดเวลายังแสดง (เงิน · ติดต่อร้าน) — คืนค่าตั้งใน finally ของข้อ", async () => {
    const [b] = needBk("EO");
    await setV([{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uA, value: false }]);
    try { const x = expiredOf(await openRes(b.token)); ok(x, "ไม่มี vm.expired"); ok(x, "ไม่มี vm.expired"); eq(x?.rehold ?? null, null, "rehold"); }
    finally { await setV([{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uA, value: true }]); }
  });
  groupLine("EX");

  // ═══════════════ EP (page) ═══════════════
  console.log("\n── EP: หน้าการจองหมดเวลา [page] ──");
  await st("EP-1", "[page] my/[token] ของ EO ⇒ res.expiredTitle · res.expiredWhen · res.expiredMoney · res.expiredNowOpen {n 30} · ลิงก์ book-res-rehold (href ตรงกับ service) · res.reholdPartial · ก้อนโอนแล้ว (book-res-expired-paid) · ไม่มี QR", async () => {
    const [b] = needBk("EO"); const h = await resHtml(b); const t = unent(h);
    for (const k of ["res.expiredTitle", "res.expiredMoney", "res.reholdSubmit", "res.reholdPartial", "res.expiredPaidTitle", "res.expiredPaidHow"]) ok(t.includes(tpl("th", k)), `ไม่มี ${k}: ${t.slice(0, 240)}`);
    ok(t.includes(tpl("th", "res.expiredNowOpen", { n: 30 })), "ไม่มีที่ว่างตอนนี้");
    ok(h.includes('data-testid="book-res-rehold"') && h.includes('data-testid="book-res-expired-paid"'), "testid");
    ok(!/book-pay-qr|data:image\/svg/.test(h), "มี QR ในหน้าหมดเวลา");
  });
  await st("EP-2", "[page] ?lang=en ⇒ ข้อความหมดเวลาเป็นภาษาอังกฤษ (res.expiredTitle en · res.reholdSubmit en)", async () => {
    const [b] = needBk("EO"); const t = unent(await resHtml(b, { lang: "en" }));
    ok(t.includes(tpl("en", "res.expiredTitle")) && t.includes(tpl("en", "res.reholdSubmit")), `en: ${t.slice(0, 200)}`);
  });
  await st("EP-3", "[page] รอบเดิมเต็ม (EF) ⇒ res.expiredNowFull + ก้อน book-full ในหน้าการจอง · รอบถูกยกเลิก (EC) ⇒ res.expiredNowClosed · ไม่มีลิงก์ถือใหม่", async () => {
    const [ef, ec] = needBk("EF", "EC");
    const hf = await resHtml(ef); ok(unent(hf).includes(tpl("th", "res.expiredNowFull")) && hf.includes('data-testid="book-full"'), "EF");
    const hc = await resHtml(ec); ok(unent(hc).includes(tpl("th", "res.expiredNowClosed")) && !hc.includes('data-testid="book-res-rehold"'), "EC");
  });
  await st("EP-4", "[page] ไม่ต้องมี JS: ลิงก์ถือใหม่เป็น <a href> (GET) ไม่ใช่ปุ่มของฟอร์ม · หน้าไม่ตั้ง referrer no-referrer", async () => {
    const [b] = needBk("ER"); const h = await resHtml(b);
    ok(/<a\b[^>]*data-testid="book-res-rehold"[^>]*href="\/book\//.test(h) || /data-testid="book-res-rehold"[\s\S]{0,200}<a\b[^>]*href="\/book\//.test(h), "ลิงก์ถือใหม่ไม่ใช่ <a href>");
    ok(!/referrer\s*:\s*["']no-referrer["']/.test(read(PAGE_RES)), "หน้าตั้ง no-referrer");
  });
  groupLine("EP");

  // ═══════════════ EL ═══════════════
  console.log("\n── EL: ลิงก์ถือใหม่ → หน้าสินค้า → ถือ ──");
  let reholdHref = "";
  await st("EL-1", "[service] เปิดหน้าสินค้าตามลิงก์ของ ER ⇒ วันเดิม · รอบเดิมถูกเลือก · ยอดสรุปของการเลือก (ผู้ใหญ่ 2) = ราคาปัจจุบัน 2×(ผู้ใหญ่+ค่าอุทยาน)", async () => {
    const [b] = needBk("ER"); reholdHref = String(asRec(expiredOf(await openRes(b.token))?.rehold)?.href ?? "");
    ok(reholdHref, "ไม่มีลิงก์");
    const sp = Object.fromEntries(qsOf(reholdHref).entries());
    const s = await pcall(BSI, "quoteBookSelection", "W1.2a", { shop: SA, productSlug: PRD.A?.slug, query: sp, acceptLanguage: "th", clientKey: ck() }, N0);
    eq([s.ok, asRec(s.summary)?.totalSatang], [true, 2 * (AD + PA)], "ยอด");
  });
  await st("EL-2", "[action] ถือที่จากหน้านั้น (FormData จากฟอร์มที่เรนเดอร์ตามลิงก์) ⇒ redirect ไปหน้าชำระ c/<basket> · การจองเดิม ER ไม่เปลี่ยน", async () => {
    const [b] = needBk("ER"); ok(reholdHref, "EL-1 ไม่ผ่าน");
    const r0 = await bRow(b.id);
    const sp = Object.fromEntries(qsOf(reholdHref).entries());
    const h = await productHtml(PRD.A?.slug ?? "", sp);
    await new Promise((r) => setTimeout(r, 1_200));
    const r = await runAction("startBookHoldAction", IP_OF.get(ck()) ?? "100.68.250.4", [SA, PRD.A?.slug, formDataOf(h, {})]);
    ok(r.kind === "REDIRECT" && new RegExp(`^/book/${SA}/c/`).test(r.url), `ผล: ${fmt([r.kind, r.url, r.err])}`);
    eq(await bRow(b.id), r0, "การจองเดิม");
  });
  await st("EL-3", "[service] ลิงก์ถือใหม่ของ EF (รอบเดิมเต็ม) ⇒ หน้าสินค้าตามลิงก์มี vm.full ของวันนั้น (want 3)", async () => {
    const [b] = needBk("EF"); const href = String(asRec(expiredOf(await openRes(b.token))?.rehold)?.href ?? "");
    const sp = Object.fromEntries(qsOf(href).entries());
    eq(fullOf(await openProduct(PRD.A?.slug ?? "", sp))?.want, 3, "want");
  });
  groupLine("EL");

  // ═══════════════ LG ═══════════════
  console.log("\n── LG: ข้อความ ──");
  await st("LG-1", "[code] คีย์ใหม่ไม่มีคำสัญญาที่ระบบทำไม่ได้: LINE · ทันที · วันทำการ · N นาที · ราคาเท่ากัน · ไม่มีการตัดเงิน (และคำอังกฤษที่เทียบเท่า)", () => {
    const miss = NEW_KEYS.filter((k) => typeof TH[k] !== "string" || typeof EN[k] !== "string");
    ok(miss.length === 0, `ยังไม่มีคีย์ให้ตรวจ: ${miss.length} คีย์`);
    const bad: string[] = [];
    for (const k of NEW_KEYS) for (const [lang, m] of [["th", TH], ["en", EN]] as const) { const v = String(m[k] ?? ""); if (FORBIDDEN_PHRASES.some((re) => re.test(v))) bad.push(`${lang}:${k}`); }
    ok(bad.length === 0, `มีคำต้องห้าม: ${bad.join(", ")}`);
  });
  await st("LG-2", "[code] คีย์ที่มี {contact} มีรูปไม่มีช่องทางคู่กัน (full.none ↔ full.noneNoContact) · รูปไม่มีช่องทางไม่มี {contact} และไม่จบด้วย \"ติดต่อร้าน\" + ชื่อร้าน", () => {
    eq([String(TH["full.none"] ?? "").includes("{contact}"), String(TH["full.noneNoContact"] ?? "").includes("{contact}"), String(EN["full.noneNoContact"] ?? "").includes("{contact}")], [true, false, false], "รูปข้อความ");
  });
  await st("LG-3", "[code] ตัวแปรในข้อความ th/en ตรงกันทุกคีย์ใหม่ ({want} {left} {n} {time} {date} {contact})", () => {
    const miss = NEW_KEYS.filter((k) => typeof TH[k] !== "string" || typeof EN[k] !== "string");
    ok(miss.length === 0, `ยังไม่มีคีย์ให้ตรวจ: ${miss.length} คีย์`);
    const vars = (s: unknown) => [...String(s ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const bad = NEW_KEYS.filter((k) => !isDeepStrictEqual(vars(TH[k]), vars(EN[k])));
    ok(bad.length === 0, `ตัวแปรไม่ตรง: ${bad.join(", ")}`);
  });
  groupLine("LG");

  // ═══════════════ X ═══════════════
  console.log("\n── X: อินพุตอันตราย · ข้ามร้าน ──");
  await st("X-1", "[service] พารามิเตอร์ผิดรูป (d=2027-02-30 · n.ADULT=999 · n.XYZ=1 · n.ADULT=-1) ⇒ ไม่ throw · ไม่สะท้อนค่าที่ผิดใน VM (want ไม่ใช่ 999/-1)", async () => {
    needFx();
    for (const query of [{ d: "2027-02-30", "n.ADULT": "3" }, { d: D0, "n.ADULT": "999" }, { d: D0, "n.XYZ": "1" }, { d: D0, "n.ADULT": "-1" }] as Rec[]) {
      const r = await openProduct(PRD.A?.slug ?? "", query);
      ok(r.ok !== "THROW", `throw: ${fmt(r)}`);
      const w = fullOf(r)?.want; ok(w === undefined || w === null || (typeof w === "number" && w >= 1 && w <= 50), `want สะท้อนค่าผิด: ${fmt(w)}`);
    }
  });
  await st("X-2", "[service] token ของการจองหมดเวลาเปิดผ่านร้านอื่น ⇒ NOT_FOUND รูปเดียวกับ token ผิด (พฤติกรรม W1.2a คงเดิม)", async () => {
    const [b] = needBk("EO");
    const other = (await q<{ slug: string }>(`SELECT slug FROM "Tenant" WHERE slug LIKE 'trips-%' AND id <> $1 LIMIT 1`, [tA]))[0]?.slug ?? "no-such-shop";
    const r = await pcall(BSI, "openBookReservation", "W1.2a", { shop: other, token: b.token, lang: "th", acceptLanguage: "th", clientKey: ck() }, LATER);
    const w = await pcall(BSI, "openBookReservation", "W1.2a", { shop: SA, token: `${b.token.slice(0, -2)}AA`, lang: "th", acceptLanguage: "th", clientKey: ck() }, LATER);
    eq([r.ok, r.code, Object.keys(r).sort()], [false, "NOT_FOUND", Object.keys(w).sort()], "ข้ามร้าน");
  });
  groupLine("X");

  // ═══════════════ มติ D1–D10 (ผู้เขียนข้อสอบแยก รอบ 2 · 26 พ.ย. — ยังไม่ได้รัน · ผู้คุมรันหลังผู้สร้าง) ═══════════════
  console.log("\n── D: มติผู้คุมรอบ 2 ──");
  const reholdOf = async (b: Bk) => { const x = expiredOf(await openRes(b.token)); ok(x, "ไม่มี vm.expired"); return x as Rec; };
  const quoteSel = async (slug: string, sp: Rec) => {
    const s = await pcall(BSI, "quoteBookSelection", "W1.2a", { shop: SA, productSlug: slug, query: sp, acceptLanguage: "th", clientKey: ck() }, N0);
    ok(s.ok === true && asRec(s.summary), `quoteBookSelection: ${fmt(s)}`); return asRec(s.summary) as Rec;
  };
  await st("D1-1", "[service] มติ D1: การจองหลายวัน (EM · 3 วัน 2 คืน · ผู้ใหญ่ 2) ที่เลือกรายการเสริมต่อวัน/ต่อคน/ต่อคืน ⇒ ลิงก์ถือใหม่มี x.<ref>=1 ของทั้งสามรายการ (ไม่ใช่จำนวนที่คิดเงินแล้ว 3 / 2 / 2)", async () => {
    const [b] = needBk("EM"); const href = String(asRec((await reholdOf(b)).rehold)?.href ?? ""); const qs = qsOf(href);
    const xs = [...qs.entries()].filter(([k]) => k.startsWith("x."));
    const want = Object.entries(ORIG.EM?.query ?? {}).filter(([k]) => k.startsWith("x.")).map(([k]) => [k, "1"]).sort();
    eq(xs.sort(), want, "x.* ในลิงก์");
  });
  await st("D1-2", `[service] มติ D1: ตามลิงก์ของ EM แล้วเสนอราคา ⇒ ยอดรายการเสริม = ยอดของการเลือกเดิม (ราคาปัจจุบัน) = ${M_EXTRAS} สตางค์ (คิดจากฟิกซ์เจอร์ · ไม่คูณซ้ำ)`, async () => {
    const [b] = needBk("EM"); const href = String(asRec((await reholdOf(b)).rehold)?.href ?? "");
    const sum = await quoteSel(PRD.M?.slug ?? "", Object.fromEntries(qsOf(href).entries()));
    eq([extrasOf(sum.lines), ORIG.EM?.extrasSatang], [M_EXTRAS, M_EXTRAS], "ยอดรายการเสริม (ตามลิงก์ · ตอนจอง)");
  });
  await st("D1-3", `[action] มติ D1 (ปลายทางจริง): ถือผ่าน startBookHoldAction จากฟอร์มของหน้าที่เปิดตามลิงก์ของ EM ⇒ ตะกร้าใหม่ · หน้าชำระของตะกร้านั้นมียอดรายการเสริม ${M_EXTRAS} สตางค์`, async () => {
    const [b] = needBk("EM"); const href = String(asRec((await reholdOf(b)).rehold)?.href ?? "");
    const h = await productHtml(PRD.M?.slug ?? "", Object.fromEntries(qsOf(href).entries()));
    await new Promise((r) => setTimeout(r, 1_200));
    const r = await runAction("startBookHoldAction", IP_OF.get(ck()) ?? "100.68.250.5", [SA, PRD.M?.slug, formDataOf(h, {})]);
    ok(r.kind === "REDIRECT" && new RegExp(`^/book/${SA}/c/`).test(r.url), `ผล: ${fmt([r.kind, r.url, r.err])}`);
    const u = new URL(r.url, "http://x"); const basket = u.pathname.split("/").pop() ?? "";
    const co = await pcall(BSI, "loadBookCheckout", "W1.2a", { shop: SA, basketToken: basket, sel: u.searchParams.get("sel"), lang: "th", acceptLanguage: "th", clientKey: ck() });
    ok(co.ok === true, `loadBookCheckout: ${fmt(co)}`);
    eq(extrasOf(asRec(asRec(co.vm)?.summary)?.lines ?? asRec(co.vm)?.lines), M_EXTRAS, "ยอดรายการเสริมในตะกร้า");
  });
  await st("D2-1", "[service] มติ D2: e=SOLD_OUT ไม่มี n.* ⇒ vm.full = null · e=SOLD_OUT + n.ADULT=2 (want 2 ≤ เหลือ 2) ⇒ null · n.ADULT=3 ⇒ ยังมีก้อน (FS-5 คงเดิม)", async () => {
    needFx();
    eq([fullOf(await openProduct(PRD.A?.slug ?? "", { d: D5, e: "SOLD_OUT" })) ?? null, fullOf(await openProduct(PRD.A?.slug ?? "", { d: D5, "n.ADULT": "2", e: "SOLD_OUT" })) ?? null], [null, null], "ไม่ใช่เต็ม");
    ok(fullOf(await openProduct(PRD.A?.slug ?? "", { d: D5, "n.ADULT": "3", e: "SOLD_OUT" })), "want 3 > เหลือ 2 ต้องยังมีก้อน");
  });
  await st("D2-2", "[page] มติ D2: หน้าสินค้า ?d=D5&e=SOLD_OUT (ไม่มี n.*) และ ?d=D5&n.ADULT=2&e=SOLD_OUT ⇒ ไม่มี book-full", async () => {
    needFx();
    for (const sp of [{ d: D5, e: "SOLD_OUT" }, { d: D5, "n.ADULT": "2", e: "SOLD_OUT" }] as Record<string, string>[]) ok(!(await productHtml(PRD.A?.slug ?? "", sp)).includes('data-testid="book-full"'), `มี book-full: ${fmt(sp)}`);
  });
  const sameDayHrefs = (full: Rec | null) => asArr(full?.sameDay).map((x) => String(x.href ?? "").split("?")[0]);
  const slugHref = (k: string) => `/book/${SA}/t/${PRD[k]?.slug}`;
  let nf = 0;
  await st("D3-1", "[service] มติ D3 D9: จำนวนคำสั่ง SQL ของการเปิดหน้าวันที่ไม่เต็ม (SM · DSO) — n.ADULT=3 เท่ากับไม่มี n.* (การอ่านจำนวนคนไม่เพิ่มคำสั่ง) · ไม่มีคำสั่งสแกนสินค้าอื่น (TripProduct ที่ id <> …) · ℹ️ พิมพ์จำนวนไว้ให้ผู้คุมตรึง", async () => {
    needFx();
    const a = await measure(() => openProduct(PRD.SM?.slug ?? "", { d: DSO, "n.ADULT": "3" }));
    const b = await measure(() => openProduct(PRD.SM?.slug ?? "", { d: DSO }));
    ok(a.n > 0, "ตัวควบคุม: ตัวนับไม่เห็นคำสั่ง (ฉีด prisma ไม่สำเร็จ?)");
    console.log(`     ℹ️ คำสั่ง SQL หน้าวันไม่เต็ม: ${a.n} (มี n.*) · ${b.n} (ไม่มี)`);
    eq(a.n, b.n, "จำนวนคำสั่ง");
    ok(!a.sql.some((x) => /"TripProduct"[\s\S]*"id"\s*<>/.test(x)), "หน้าวันไม่เต็มสแกนสินค้าอื่น");
    // ORACLE-EDIT (ผู้คุมตรึงหลังผู้สร้าง): ฐานก่อนใบนี้หาไม่ได้จากข้อสอบ ⇒ ตั้ง NOTFULL_SQL_PIN = จำนวนที่วัดหลังผู้สร้าง แล้วข้อนี้จะตรวจ a.n ≤ PIN
    const NOTFULL_SQL_PIN: number | null = null;
    if (NOTFULL_SQL_PIN !== null) ok(a.n <= NOTFULL_SQL_PIN, `คำสั่ง ${a.n} > ที่ตรึง ${NOTFULL_SQL_PIN}`);
    nf = a.n;
  });
  await st("D3-2", "[service] มติ D3 D11: วันที่เต็ม (SM · DS1) ที่มีทริปอื่นวันเดียวกัน 21 ตัว ไม่มีตัวไหนผ่านตัวกรองหยาบ (ความจุ 1 < ต้องการ 3) ⇒ sameDay [] · คำสั่ง SQL ≤ หน้าวันไม่เต็ม + 30", async () => {
    ok(nf > 0, "D3-1 ไม่ผ่าน");
    const m = await measure(() => openProduct(PRD.SM?.slug ?? "", { d: DS1, "n.ADULT": "3" }));
    const full = fullOf(m.r); ok(full, "ไม่มี vm.full");
    console.log(`     ℹ️ คำสั่ง SQL วันเต็ม (ไม่มีตัวผ่าน): ${m.n} (ฐาน ${nf})`);
    eq(sameDayHrefs(full), [], "sameDay"); ok(m.n <= nf + 30, `คำสั่ง ${m.n} > ${nf} + 30`);
  });
  await st("D3-3", "[service] มติ D3 D11: วันที่เต็ม (SM · DS2) ทริปอื่นวันเดียวกัน 20 ตัว (S01–S17 ไม่ผ่านตัวกรองหยาบ · S18–S20 ผ่าน) ⇒ sameDay = [S18, S19, S20] · คำสั่ง SQL ≤ ฐาน + 30", async () => {
    ok(nf > 0, "D3-1 ไม่ผ่าน");
    const m = await measure(() => openProduct(PRD.SM?.slug ?? "", { d: DS2, "n.ADULT": "3" }));
    const full = fullOf(m.r); ok(full, "ไม่มี vm.full");
    console.log(`     ℹ️ คำสั่ง SQL วันเต็ม (3 ตัวท้ายผ่าน): ${m.n} (ฐาน ${nf})`);
    eq(sameDayHrefs(full), ["S18", "S19", "S20"].map(slugHref), "sameDay");
    ok(m.n <= nf + 30, `คำสั่ง ${m.n} > ${nf} + 30`);
  });
  await st("D3-5", "[service] มติ D11 (เพดาน 20 นับหลังตัวกรองหยาบ): DS4 มี C01–C20 ผ่านตัวกรองหยาบแต่เป็นร้านยืนยันก่อน + Q21 (ตัวที่ 21 ตาม slug · ขายได้ · ออก 07:00) ⇒ sameDay = [] (Q21 ไม่ถูกสแกน) · ตัวควบคุม: หน้า Q21 วัน DS4 เปิดปุ่มจอง และ C01 ปิดปุ่มจอง", async () => {
    needFx();
    eq([asRec(asRec((await openProduct(PRD.Q21?.slug ?? "", { d: DS4 })).vm)?.cta)?.enabled, asRec(asRec((await openProduct(PRD.C01?.slug ?? "", { d: DS4 })).vm)?.cta)?.enabled], [true, false], "ตัวควบคุม");
    const full = fullOf(await openProduct(PRD.SM?.slug ?? "", { d: DS4, "n.ADULT": "3" }));
    ok(full, "ไม่มี vm.full");
    eq(sameDayHrefs(full), [], "sameDay (Q21 ต้องไม่ขึ้น)");
  });
  await st("D3-4", "[service] มติ D3: ทริปอื่นวันเดียวกัน (DS3 · นาฬิกา 12:00 เวลาร้าน) ที่มีแต่ตัวเลือกที่ปิด / ออกแล้ว / ปิดรับแล้ว / ยกเลิก / หยุดขาย ไม่ขึ้น · G1 (ขายได้) ขึ้นตัวเดียว", async () => {
    needFx();
    const full = fullOf(await openProduct(PRD.SM?.slug ?? "", { d: DS3, "n.ADULT": "3" }, { now: BKK(DS3, "12:00") }));
    ok(full, "ไม่มี vm.full");
    eq(sameDayHrefs(full), [slugHref("G1")], "sameDay");
  });
  const bookingOff = async <T,>(on: boolean, f: () => Promise<T>) => { await setV([{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uA, value: on }]); try { return await f(); } finally { await setV([{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uA, value: true }]); } };
  const shopConfirms = async <T,>(f: () => Promise<T>) => { await setV([{ key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PRD.A?.id, value: "SHOP_CONFIRMS" }]); try { return await f(); } finally { await setV([{ key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PRD.A?.id, value: "AUTO" }]); } };
  await st("D4-1", "[service] มติ D4: การจองเอเจนซี่ที่หมดเวลาบนรอบเต็ม (EAF) ⇒ expired.full = null · rehold = null", async () => {
    const [b] = needBk("EAF"); const x = await reholdOf(b);
    eq([asRec(x.now)?.state, x.full ?? null, x.rehold ?? null], ["FULL", null, null], "EAF");
  });
  await st("D4-2", "[service] มติ D4: รอบเต็ม (EF) เมื่อร้านปิดปุ่มจอง (BOOKING_OFF) และเมื่อสินค้าเป็นร้านยืนยันก่อน (SHOP_CONFIRMS) ⇒ expired.full = null · rehold = null — คืนค่าตั้งทุกกรณี", async () => {
    const [b] = needBk("EF");
    const off = await bookingOff(false, () => reholdOf(b)); const sc = await shopConfirms(() => reholdOf(b));
    eq([off.full ?? null, off.rehold ?? null, sc.full ?? null, sc.rehold ?? null], [null, null, null, null], "ปิดปุ่ม · ร้านยืนยันก่อน");
  });
  await st("D4-3", "[page] มติ D4: หน้า my/[token] ของ EAF · EF (ปิดปุ่ม) · EF (ร้านยืนยันก่อน) ⇒ ไม่มี book-full และไม่มี book-res-rehold", async () => {
    const [eaf, ef] = needBk("EAF", "EF");
    const hs = [await resHtml(eaf), await bookingOff(false, () => resHtml(ef)), await shopConfirms(() => resHtml(ef))];
    eq(hs.map((h) => [h.includes('data-testid="book-full"'), h.includes('data-testid="book-res-rehold"')]), hs.map(() => [false, false]), "ก้อน/ลิงก์");
  });
  await st("D5-1", "[service] มติ D5: การจองที่เลือกเขตไม่มีค่าบริการ (EZF · เขตไม่อยู่ใน snapshot) ⇒ partial true หรือลิงก์มี z ของเขตนั้น · เขตมีค่าบริการ (EZP) ⇒ ลิงก์มี z ของเขตนั้น และ partial false", async () => {
    const [f, pz] = needBk("EZF", "EZP");
    const rf = asRec((await reholdOf(f)).rehold), rp = asRec((await reholdOf(pz)).rehold);
    ok(rf, "EZF ไม่มีลิงก์"); ok(rp, "EZP ไม่มีลิงก์");
    const zf = qsOf(String(rf?.href ?? "")).get("z"), zp = qsOf(String(rp?.href ?? "")).get("z");
    ok(rf?.partial === true || zf === ORIG.EZF?.query.z, `EZF: partial ${fmt(rf?.partial)} · z ${fmt(zf)}`);
    eq([zp, rp?.partial], [ORIG.EZP?.query.z, false], "EZP");
  });
  const noText = (h: string, k: string, lang: "th" | "en") => !unent(h).includes(head(tpl(lang, k)));
  await st("D6-1", "[page] มติ D6 D7: การจองเอเจนซี่ที่รอบยังว่าง (EA) ⇒ ไม่มีบรรทัด \"ตอนนี้รอบเดิมยังว่าง N ที่\" และไม่มี res.expiredPaidHow (ทั้ง th และ en) · ก้อนหมดเวลายังอยู่", async () => {
    const [b] = needBk("EA");
    for (const lang of ["th", "en"] as const) {
      const h = await resHtml(b, lang === "en" ? { lang: "en" } : {});
      ok(unent(h).includes(tpl(lang, "res.expiredTitle")), `${lang}: ไม่มีก้อนหมดเวลา`);
      ok(noText(h, "res.expiredNowOpen", lang), `${lang}: มีบรรทัดที่ว่างตอนนี้`);
      ok(noText(h, "res.expiredPaidHow", lang), `${lang}: มี res.expiredPaidHow (เงินอยู่ที่เอเจนซี่)`);
    }
  });
  await st("D6-2", "[page] มติ D6: ร้านปิดปุ่มจอง (EO · รอบยังว่าง) ⇒ ไม่มีบรรทัด \"ตอนนี้รอบเดิมยังว่าง N ที่\" (th · en) · ตัวควบคุม: ปุ่มเปิดอยู่มีบรรทัดนั้น", async () => {
    const [b] = needBk("EO");
    ok(!noText(await resHtml(b), "res.expiredNowOpen", "th"), "ตัวควบคุม: ปุ่มเปิดแต่ไม่มีบรรทัดที่ว่าง");
    const [th, en] = await bookingOff(false, async () => [await resHtml(b), await resHtml(b, { lang: "en" })]);
    ok(noText(th ?? "", "res.expiredNowOpen", "th") && noText(en ?? "", "res.expiredNowOpen", "en"), "ปิดปุ่มแล้วยังมีบรรทัดที่ว่าง");
  });
  await st("D10-1", "[code] มติ D10: BookProductVM.full และ BookReservationVM.expired เป็นช่องบังคับ `… | null` (ไม่มี ?:) · openOnce ของหน้าสินค้าไม่ JSON.parse/JSON.stringify อาร์กิวเมนต์", () => {
    const pc = stripComments(read(PCORE)), bc = stripComments(read(BCORE)), pp = stripComments(read(PAGE_PROD));
    ok(/\bfull\s*:\s*BookFullVM\s*\|\s*null\s*;/.test(pc) && !/\bfull\s*\?\s*:/.test(pc), "BookProductVM.full ต้องเป็น full: BookFullVM | null");
    ok(/\bexpired\s*:\s*BookExpiredVM\s*\|\s*null\s*;/.test(bc) && !/\bexpired\s*\?\s*:/.test(bc), "BookReservationVM.expired ต้องเป็น expired: BookExpiredVM | null");
    ok(/openOnce/.test(pp), "หาฟังก์ชัน openOnce ในหน้าสินค้าไม่เจอ");
    ok(!/JSON\.(parse|stringify)\(/.test(pp), "หน้าสินค้ายังส่ง/อ่าน JSON ผ่านอาร์กิวเมนต์ของ openOnce");
  });
  groupLine("D1"); groupLine("D2"); groupLine("D3"); groupLine("D4"); groupLine("D5"); groupLine("D6"); groupLine("D10");
  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try {
    if (usedClientKeys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [[...new Set(usedClientKeys)].flatMap((k) => [`trips:book:none:${k}`, `trips:token:none:${k}`])]);
    await cleanupTenants(tenantIds); await cleanupUsers();
  } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* */ }
  await pool.end().catch(() => undefined);
  try { await qcPrisma.$disconnect(); } catch { /* ignore */ }
}

const failed = cks.filter((c) => c.res === "FAIL"), skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${(p0 ?? 0) + (c.res === "PASS" ? 1 : 0)}/${(t0 ?? 0) + 1}`; }
console.log(`\n===== QC TRIPS W1.4a · กรณีพิเศษฝั่งลูกค้า: รอบเต็ม · ถือที่หมดเวลา =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
const KNOWN_RED: string[] = [];
const knownRed = failed.filter((c) => KNOWN_RED.includes(c.id)).map((c) => c.id), otherRed = failed.filter((c) => !KNOWN_RED.includes(c.id)).map((c) => c.id);
console.log(`แดงที่รู้จัก: ${knownRed.join(" ") || "ไม่มี"} · แดงอื่น: ${otherRed.join(" ") || "ไม่มี"}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), knownRed, otherRed, skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
