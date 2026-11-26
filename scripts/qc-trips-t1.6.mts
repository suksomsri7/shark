// QC — TRIPS T1.6a1 · ร้านยกเลิกรอบที่มีคนจอง: ยกเลิกในขั้นตอนเดียว · ปล่อยถือที่/คำขอจอง/รายการรอ · ถอนคำขอคืนเงินเปิด · คืนเงินเต็ม (ป้าย DEPARTURE_CANCEL) · ทางไม่มีเงิน · เงินเข้าหลังยกเลิก · รั้ว §6 · สิทธิ์ N3 · จอ
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/T1.6.md ร่างรอบ 2 (มติ N1–N14 · C9–C14) · ขอบเขตของไฟล์นี้ = **a1 เท่านั้น** · ข้อ MV ของ a2 อยู่ที่ scripts/qc-trips-t1.6a2.draft.txt (รวมเข้าที่นี่เมื่อ a2)
//
// กลุ่มข้อ (ทุกข้อติดระดับในชื่อ: [บริการ] [action] [หน้า] [โค้ด] [บริสุทธิ์] [งาน] [ฐาน]):
//   PC ตัวควบคุม (เขียวก่อนมีงาน)   S ไฟล์/ขอบเขต/โค้ด   P ตัวช่วยบริสุทธิ์
//   CD ยกเลิกรอบที่มีคน   GD รั้วผู้เขียนอื่น §6   RF คืนเงินเต็ม   NM ทางไม่มีเงิน/เอเจนซี่/เงินเข้าหลังยกเลิก   RC กระทบยอด   AC action   PG หน้า   PM สิทธิ์
// 🔴 ก่อนมี migration: PC + S + P รันจริง · กลุ่ม CD GD RF NM RC AC PG PM แดง "migration missing" ข้อเดียวต่อกลุ่ม (ไม่ throw) — ลำดับรันหลังมี migration: CD → GD → RF → NM → RC → AC → PG → PM (GD ต้องมาก่อนงวดของ dC ถูกปิด)
// 🔴 สัญญาที่ข้อสอบตรึง (ใบ §5 · ผู้เขียนข้อสอบเติมชื่อที่ใบไม่ได้ระบุ — แย้งได้ทาง wo-notes):
//   · cancelDepartureWithBookings(ctx: TripCtx { tenantId, actorUserId }, { unitId, departureId, expectedVersion, kind, reason, confirmBookings, idempotencyKey }, { now })
//   · resolveCancelledBooking(ctx: TripCtx, { unitId, bookingId, expectedVersion (ของการจอง), choice: REFUND|NO_MONEY|MOVE, reason?, idempotencyKey }, { now }) — a1: MOVE ⇒ { ok:false, code:"VALIDATION", details:{ reason:"MOVE_NOT_AVAILABLE_YET" } }
//   · ผลพลาด = { ok:false, code, details?: { reason } } · ข้อสอบรับรหัสที่ใบเขียนเป็น "CODE REASON" ว่า code = CODE และ details.reason = REASON · รหัสเดี่ยว (DEPARTURE_STARTED ฯลฯ) อยู่ที่ code หรือ details.reason ก็ได้ · ซ้ำคีย์ ⇒ ok:true + replayed:true (ที่ผลหรือ value)
//   · fullRefundSplitOf(receipts: { kind: "RECEIVED"|"REFUNDED", amountSatang, passThroughSatang, vatSatang }[]) ⇒ { refundSatang, refundNonPtSatang, refundPassThroughSatang, refundVatSatang } (ชื่อเดียวกับ RefundQuote · RECEIVED − REFUNDED)
//   · decideByOf(now, days, tz) ⇒ Date (หรือ ISO) · cancelOptionsOf({ options, autoRefundAfterDays }) ⇒ string[] · cancelOutcomeOf(row, now, decideBy) ⇒ { choice, overdue }
//   · ชื่อฟิลด์ฟอร์ม (§9): ยกเลิก = departureId kind reason confirmBookings expectedVersion idempotencyKey · ทางออก = bookingId expectedVersion choice reason idempotencyKey (a2 เพิ่ม targetDepartureId consentChannel consentNote)
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t16-*` (ผู้ใช้ `trips-t16-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน seed ไม่แตะ · ห้ามรันพร้อมข้อสอบ TRIPS อื่น
// 🔴 นาฬิกา: บริการได้ `now` ที่ฉีด (NOW = 2027-04-15T05:00Z = 12:00 เวลาร้าน) · action/หน้าใช้นาฬิกาจริง (รอบของข้อ AC/PG อยู่ปี 2027 จึงยังไม่เริ่ม)
// 🔴 ฟิกซ์เจอร์ผ่านบริการจริง quoteTrips → bookTripsNow → recordTripPayment → requestTripRefund/decideTripRefund/executeTripRefund · "แถวตรง" เฉพาะที่ระบบวันนี้สร้างไม่ได้:
//   b4/b12 เอเจนซี่เก็บเงิน (A1.4) · p1 PENDING (HOLD → PENDING + ถือ SHOP_CONFIRM) · เวลาหมดถือที่ของ h1/p1 = NOW + 1 วัน · หลักฐานซื้อเก็บแทน · รายการรอ · ทรัพยากร · RF-6 คำขอที่มีป้ายกลับ QUOTED
// ผลรันรอบ 1 (ผู้เขียนข้อสอบ · 26 พ.ย.): PC-9 แดงเพราะตัวข้อสอบ — ForbiddenError ของ action เดิมเป็นข้อความไทย "ไม่มีสิทธิ์: …" ⇒ ตัวจับรับ /forbidden|ไม่มีสิทธิ์/ แล้ว ·
//   ทางลูกค้าต้องเปิด trips.public.bookingEnabled + shopContact ของหน่วย (แบบ qc-trips-w1.3) — เพิ่มหลังรอบ 1 · ส่วนที่เหลือของ PC-9 ยังไม่ถูกรันจริง (ผู้คุมยืนยันในรอบถัดไป)
// ORACLE-EDIT T1.6 รอบ 4 (มติ F1–F6 หลังผู้ตรวจโค้ดเงิน): +S-9 CD-14 CD-15 GD-6 RF-11 RF-12 RF-13 NM-8 NM-9 NM-10 · ตรึงใหม่ NM-3 NM-7 (ยื่นใหม่หลังรับเงิน = QUOTED) RF-10 (ผู้กระทำ trips.departureCancel.autoApprove · after.status ของ requote) · รวม 82 ข้อ
// ORACLE-EDIT T1.6 รอบ 6 (มติ H1–H7): +S-10 S-11 CD-16 NM-11 PG-6 … PG-10 · รวม 91 ข้อ
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.6.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน T1.6a1: PC เขียวทั้งหมด · S-3 เขียว · ที่เหลือแดงพร้อมเหตุ ("ยังไม่มี…" / "migration missing")
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { createRequire } from "node:module";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";
import { fromMainMerge, TRIPS_MAIN_MERGE_SHA } from "./trips-main-merge.mjs";

const LABEL = "qc-trips-t1.6";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;
// บทเรียน T1.7a2: ตั้ง AsyncLocalStorage ก่อนโหลดโมดูลใดของ next
(globalThis as unknown as Record<string, unknown>).AsyncLocalStorage ??= (await import("node:async_hooks")).AsyncLocalStorage;

// ═══════════════ ตัวนับ SQL จริง (ก่อน import @/lib/core/db) ═══════════════
let sqlLog: string[] = [];
let counting = false;
const qcPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: "event", level: "query" }], transactionOptions: { timeout: 30_000, maxWait: 10_000 } });
(qcPrisma as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on("query", (ev) => { if (counting) sqlLog.push(ev.query); });
(globalThis as unknown as { prisma?: unknown }).prisma = qcPrisma;
const realSql = () => sqlLog.filter((s) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET|SAVEPOINT|RELEASE)\b/i.test(s));

// ═══════════════ harness (แบบ qc-trips-t1.7a2) ═══════════════
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
  const mine0 = cks.filter((c) => c.id.replace(/-\d+$/, "") === g);
  console.log(`  ── สรุป ${g}: ผ่าน ${mine0.filter((c) => c.res === "PASS").length}/${mine0.length}`);
};
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const num = (v: unknown): number => Number(v);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t16qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const SLUG = "trips-t16-";
const EMAIL_PREFIX = "trips-t16-";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const addMs = (d: Date | string, ms: number) => new Date(new Date(d).getTime() + ms);
const isoOf = (v: unknown): string => (v instanceof Date ? v.toISOString() : typeof v === "string" ? new Date(v).toISOString() : String(v));
const halfUp = (a: number, b: number, c: number): number => { const n = BigInt(a) * BigInt(b), d = BigInt(c); return Number((BigInt(2) * n + d) / (BigInt(2) * d)); };
const vatIn = (x: number) => halfUp(x, 700, 10_700);
const THAI = /[฀-๿]/;

// ═══════════════ สเปก (ใบสั่ง T1.6 · a1) ═══════════════
const BASE_SHA = "5953d5061"; // session/trips ตอนเขียนใบ (ผู้คุมตรึงเต็มตอนปล่อย)
const MOD = "src/lib/modules/trips/";
const CORE = MOD + "cancel-departure-core.ts";
const SVC = MOD + "cancel-departure.ts";
const ACTS = MOD + "cancel-departure-actions.ts";
const COMP = "src/components/trips";
const APP = "src/app/app/u/[unitSlug]/trips";
const R = FX.PRODUCT_RACHA;
const ADULT = R.adultSatang, PARK = R.parkAdultSatang, ONE = ADULT + PARK; // 350,000 + 60,000 = 410,000
const NOW = new Date("2027-04-15T05:00:00.000Z");
const NOW0 = new Date("2027-03-01T03:00:00.000Z"); // 10:00 1 มี.ค. — เวลาจองของฟิกซ์เจอร์
const DECIDE_BY = "2027-04-17T16:59:59.999Z";
const DEP_B2 = halfUp(2 * ADULT, 30, 100); // 210,000 (TRIP_ONLY)
const DEP_B11 = halfUp(ONE, 30, 100); // 123,000 (ALL_LINES)
const PROMO_B9 = ADULT - halfUp(ADULT, 1_000, 10_000) + PARK; // 375,000
const HELD_AT_CANCEL = 2 * ONE + DEP_B2 + 3 * ONE + PROMO_B9 + DEP_B11; // 2,758,000
const SLIP_B11 = 50_000;
const HELD_AFTER_SLIP = HELD_AT_CANCEL + SLIP_B11; // 2,808,000
const PENDING_KEYS = ["b1", "b2", "b3", "b4", "b6", "b7", "b8", "b9", "b11"];
const FACADE_FNS = ["cancelDepartureWithBookings", "resolveCancelledBooking", "decideByOf", "cancelOptionsOf", "cancelOutcomeOf", "fullRefundSplitOf", "fullRefundQuoteFromReceipts"];
const FACADE_CONSTS = ["CANCEL_KINDS", "CANCEL_OUTCOMES", "CONSENT_CHANNELS"];
const OPEN_REQ = ["REQUESTED", "QUOTED", "APPROVED", "EXECUTING", "FAILED"];
const SOLD_ST = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
const RAW_CODES = ["EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT", "PENDING", "NO_MONEY", "AGENCY_MONEY_HELD", "MOVE_DATE", "REFUND_100", "DEPARTURE_CANCEL", "MOVE_NOT_AVAILABLE_YET"];
/** ไฟล์เดิมที่แก้ได้แบบจำกัด (§1 · a1): [ไฟล์ (หลายไฟล์ = งบรวม), ลบได้สูงสุด, เพิ่มได้สูงสุด (null = ไม่จำกัด)] */
const LIMITED: [string[], number, number | null][] = [
  [["prisma/schema/trips.prisma"], 0, 26] /* ORACLE-EDIT ผู้คุม: +4 ฟิลด์ relation ของ FK RESTRICT 2 ตัวที่ §3 บังคับ */, [["src/lib/core/scope.ts"], 0, 1], [[MOD + "refund.ts"], 6, 70] /* ORACLE-EDIT T1.6 รอบ 5: มติ F3 งบลบ −6 */, [[MOD + "money-core.ts"], 0, 35], [[MOD + "money.ts"], 0, 25], [[MOD + "booking.ts"], 2, 25],
  [[MOD + "capacity.ts", MOD + "capacity-service.ts"], 0, 16], [[MOD + "jobs.ts"], 1, 8], [[MOD + "departure-desk.ts"], 2, 14], [[MOD + "departures.ts"], 0, 4], [[MOD + "departure-screens.ts"], 2, 45], [[MOD + "booking-screens.ts"], 0, 30],
  [["src/lib/platform/trips-self.ts", "src/lib/platform/trips-self-core.ts"], 2, 20], [[`${COMP}/DeparturePanel.tsx`, `${COMP}/DepartureDialogs.tsx`, `${COMP}/BookingsScreen.tsx`, `${COMP}/BookingDrawer.tsx`], 6, 70],
  [["src/lib/outbox-consumers.ts"], 0, 3], [["src/lib/automation/labels.ts"], 0, 3], [[MOD + "index.ts"], 0, null], [["src/messages/th/trips.json"], 2, null], [["src/messages/en/trips.json"], 2, null], [["scripts/trips-ui-inventory.json"], 0, null],
];
const LIMITED_SET = new Set(LIMITED.flatMap(([fs]) => fs));
/** ไฟล์ของผู้ร่าง/ผู้คุมในใบนี้ (ไม่นับเป็นการแตะของ builder): ข้อสอบนี้ + ร่าง a2 + ORACLE-EDIT ที่คาด (C9) */
const DRAFTER_FILES = ["scripts/qc-trips-t1.6.mts", "scripts/qc-trips-t1.6a2.draft.txt", "scripts/qc-trips-t1.2.mts", "scripts/qc-trips-t0.7.mts", "scripts/qc-trips-w1.3.mts", "scripts/qc-trips-t1.7.mts", "scripts/visual-trips.mts"];

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 30 });
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
/** สถานะ migration ของใบ (อ่านสดทุกครั้ง · ไม่ใช้แคช) */
const migState = async (): Promise<{ ok: boolean; why: string }> => {
  const c = (await q<{ c: string }>(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'TripDeparture' AND column_name = ANY($1::text[])`, [["cancelKind", "cancelDecideBy", "cancelOptions"]])).map((r) => r.c);
  const t = (await q(`SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'TripDepartureCancelOutcome'`)).length;
  const miss = [...["cancelKind", "cancelDecideBy", "cancelOptions"].filter((x) => !c.includes(x)).map((x) => `TripDeparture.${x}`), ...(t ? [] : ["ตาราง TripDepartureCancelOutcome"])];
  return { ok: miss.length === 0, why: miss.length ? `ยังไม่มี ${miss.join(" · ")} (ใบ §3)` : "" };
};

// ═══════════════ ร้านชั่วคราว + กวาด ═══════════════
async function tablesWithTenant(): Promise<string[]> {
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  return rows.map((r) => r.t).filter((t) => t !== "Tenant");
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  let pending = await tablesWithTenant();
  for (let pass = 0; pass < 16 && pending.length; pass++) {
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
  const MONEY = await tryImport("@/lib/modules/trips/money");
  const WAIT = await tryImport("@/lib/modules/trips/waitlist");
  const SELF = await tryImport("@/lib/platform/trips-self");
  const LEVELS = await tryImport("@/lib/staff/levels");
  const STAFFSVC = await tryImport("@/lib/staff/service");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.6a1 ยังไม่สร้าง)`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  const callF = async (f: unknown, what: string, ...a: unknown[]): Promise<Rec> => {
    ok(typeof f === "function", `ไม่มี ${what}`);
    try { return asRec(await (f as AnyFn)(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  const pure = (name: string, ...a: unknown[]): unknown => fn(name)(...a);
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? r; };
  const tags = (r: Rec): string[] => [String(r.code ?? ""), String(asRec(r.details)?.reason ?? ""), String(r.reason ?? "")];
  /** ผลพลาด: code (ถ้าให้ reason ต้อง details.reason ตรง) · รหัสเดี่ยวยอมรับที่ code หรือ reason */
  const codeR = (r: Rec, code: string, what: string, reason?: string) => {
    const t = tags(r);
    ok(r.ok === false && (reason ? t[0] === code && (t[1] === reason || t[2] === reason) : t.includes(code)), `${what}: ต้อง ${code}${reason ? ` ${reason}` : ""} ได้ ${fmt(r)}`);
  };
  const replayedOf = (r: Rec) => r.replayed === true || asRec(r.value)?.replayed === true;
  const S = (name: string): AnyFn => { const f = SETI.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const th = asRec((() => { try { return JSON.parse(read("src/messages/th/trips.json")); } catch { return null; } })()) ?? {};
  const en = asRec((() => { try { return JSON.parse(read("src/messages/en/trips.json")); } catch { return null; } })()) ?? {};
  const flat = (o: Rec, p = ""): Record<string, string> => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (asRec(v) ? Object.entries(flat(asRec(v) ?? {}, `${p}${k}.`)) : [[`${p}${k}`, String(v)]])));
  const fth = flat(th), fen = flat(en);
  const baseJson = (f: string): Record<string, string> => { try { return flat(asRec(JSON.parse(git(["show", `${BASE_SHA}:${f}`]))) ?? {}); } catch { return {}; } };

  // ═══════════════ PC. ตัวควบคุม (ก่อนตั้งร้าน) ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "[บริสุทธิ์] คิดมือ §4.6: เงินที่ถือ ณ ยกเลิก 2,758,000 = 820,000 + 210,000 + 410,000 × 3 + 375,000 + 123,000 · หลังสลิป b11 2,808,000 · b2 pt สัดส่วน snapshot = 30,732 (เหตุ OVER_REFUND · N4) · VAT b1 45,794 · b2 13,738 · decideBy = สิ้นวัน 17 เม.ย. เวลาไทย", () => {
    eq([DEP_B2, DEP_B11, PROMO_B9, HELD_AT_CANCEL, HELD_AFTER_SLIP], [210_000, 123_000, 375_000, 2_758_000, 2_808_000], "ยอด");
    eq([halfUp(DEP_B2, 2 * PARK, 2 * ONE), vatIn(2 * ADULT), vatIn(DEP_B2), halfUp(DEP_B11, PARK, ONE)], [30_732, 45_794, 13_738, 18_000], "สัดส่วน/VAT");
    const ymd = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const end = new Date(DECIDE_BY);
    eq([ymd(NOW, "Asia/Bangkok"), ymd(end, "Asia/Bangkok"), ymd(addMs(end, 1), "Asia/Bangkok")], ["2027-04-15", "2027-04-17", "2027-04-18"], "เส้นตาย");
  });

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB"), tC = rid("tC");
  const uA = rid("uA"), uA2 = rid("uA2"), uB = rid("uB"), uC = rid("uC");
  const SLUG_A = `${SLUG}a-${STAMP}`, SHOP_A = `${SLUG}${STAMP}-a`;
  let setupErr = "", settingsErr = "";
  const U: Record<string, { userId: string; tenantId: string; membershipId: string }> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; park: string }> = {};
  const DEP: Record<string, string> = {};
  type Bk = { key: string; id: string; code: string; dep: string; unit: string; tenant: string; token: string; payable: number; phone: string; status: string };
  const BK: Record<string, Bk> = {};
  const REQ: Record<string, string> = {};
  let seq = 0, bkN = 0, PROMO = "";
  const tenantOfUnit = (u: string) => (u === uB ? tB : u === uC ? tC : tA);
  const ownerOfUnit = (u: string) => (u === uB ? "ob" : u === uC ? "oc" : "oa");
  const staff = (o: { unit?: string; now?: Date; who?: string } = {}): Rec => {
    const unit = o.unit ?? uA;
    return { tenantId: tenantOfUnit(unit), unitId: unit, channel: "COUNTER", actor: { kind: "STAFF", userId: String(U[o.who ?? ownerOfUnit(unit)]?.userId ?? "x") }, now: o.now ?? NOW, locale: "th" };
  };
  const sysCtx = (o: { unit?: string; now?: Date } = {}): Rec => ({ tenantId: tenantOfUnit(o.unit ?? uA), unitId: o.unit ?? uA, channel: "COUNTER", actor: { kind: "SYSTEM", job: "qc.t16" }, now: o.now ?? NOW });
  const tc = (tag: string): Rec => { const a = U[tag]; if (!a) throw new AssertFail(`ไม่มีผู้ใช้ชั่วคราว ${tag} (${setupErr || "ยังไม่ตั้ง"})`); return { tenantId: a.tenantId, actorUserId: a.userId }; };
  const mkUser = async (tag: string, tenantId: string, role: string, unitAccess: string[], perms: string[]) => {
    const id = rid(`u${tag}`), mb = rid(`mb${tag}`);
    await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
    await insertRow("Membership", { id: mb, userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(Object.fromEntries(perms.map((p) => [p, true]))), acceptedAt: new Date(), updatedAt: new Date() });
    U[tag] = { userId: id, tenantId, membershipId: mb };
  };
  const mkProd = async (key: string, tenantId: string, unitId: string) => {
    const id = rid(`p${key}`), o = rid(`o${key}`);
    await insertRow("TripProduct", { id, tenantId, unitId, slug: `t16qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}`, en: `Test ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
    await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
    const pt: Record<string, string> = {};
    for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code, en: code }), countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
    const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: PARK, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
      name: JSON.stringify({ th: "ค่าอุทยาน", en: "Park fee" }), paxPrices: JSON.stringify({ ADULT: PARK, CHILD: R.parkChildSatang }), active: true, updatedAt: new Date() });
    for (const [code, amount] of [["ADULT", ADULT], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
    PRD[key] = { id, opt: o, unit: unitId, tenant: tenantId, pt, park };
  };
  const mkDep = async (key: string, date: string, o: { prod?: string; cap?: number; minPax?: number | null; hm?: string } = {}): Promise<string> => {
    const p = PRD[o.prod ?? "PR"]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${o.prod ?? "PR"}`);
    const startsAt = new Date(BKK(date, o.hm ?? "08:00").getTime() + (seq++ % 600) * 60_000); const id = rid(`d${key}`);
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * HOUR),
      status: "OPEN", capacity: o.cap ?? 20, sold: 0, held: 0, reserved: 0, minPax: o.minPax ?? null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    DEP[key] = id; return id;
  };
  const lineOf = (dep: string, prod: string, a: number, promo?: string): Rec => {
    const p = PRD[prod] as NonNullable<(typeof PRD)[string]>;
    return { productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax: [{ paxTypeId: p.pt.ADULT, qty: a }], extras: [], ...(promo ? { promoCode: promo } : {}) };
  };
  /** จองด้วยบริการ T0.6 (STAFF bookTripsNow) — PAY_LATER ⇒ CONFIRMED · PAY_NOW ⇒ HOLD */
  const mkBk = async (key: string, depKey: string, o: { prod?: string; a?: number; pay?: "PAY_LATER" | "PAY_NOW"; promo?: string; now?: Date } = {}): Promise<Bk> => {
    const prod = o.prod ?? "PR"; const p = PRD[prod]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${prod}`);
    const dep = DEP[depKey]; if (!dep) throw new AssertFail(`ไม่มีรอบ ${depKey}`);
    const ctx = staff({ unit: p.unit, now: o.now ?? NOW0 }); const lines = [lineOf(dep, prod, o.a ?? 1, o.promo)];
    const quote = V(await call("quoteTrips", ctx, { lines }, {}), `quoteTrips ${key}`);
    bkN++; const phone = `08${String(10_000_000 + bkN * 7_919 + Number.parseInt(hex(2), 16)).slice(-8)}`;
    const r = await call("bookTripsNow", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `n${hex(6)}`, booker: { name: `ลูกค้าทดสอบ ${bkN}`, phone }, pay: { method: o.pay ?? "PAY_LATER" } }, {});
    ok(r.ok === true, `bookTripsNow ${key}: ${fmt(r)}`); const ref = asArr(r.value)[0] ?? {};
    const row = (await q<Rec>(`SELECT * FROM "TripBooking" WHERE id = $1`, [String(ref.bookingId)]))[0] ?? {};
    const b: Bk = { key, id: String(ref.bookingId), code: String(row.code ?? ref.code), dep, unit: p.unit, tenant: p.tenant, token: String(ref.publicToken ?? ""), payable: num(asRec(asRec(row.policySnapshot)?.totals)?.payableSatang), phone, status: String(row.status) };
    BK[key] = b; return b;
  };
  const bk = async (id: string): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripBooking" WHERE id = $1`, [id]))[0] ?? {};
  const dues = async (bid: string) => q<Rec>(`SELECT * FROM "TripPaymentDue" WHERE "bookingId" = $1 ORDER BY seq`, [bid]);
  const evs = async (bid: string, kind?: string) => q<Rec>(`SELECT * FROM "TripMoneyEvent" WHERE "bookingId" = $1 ${kind ? `AND kind = '${kind}'` : ""} ORDER BY "createdAt", id`, [bid]);
  const reqs = async (bid: string) => q<Rec>(`SELECT * FROM "TripRefundRequest" WHERE "bookingId" = $1 ORDER BY "createdAt", id`, [bid]);
  const reqRow = async (id: string): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripRefundRequest" WHERE id = $1`, [id]))[0] ?? {};
  const depRow = async (id: string): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripDeparture" WHERE id = $1`, [id]))[0] ?? {};
  const outbox = async (type: string, tenantId = tA) => q<{ payload: Rec; idempotencyKey: string; createdAt: Date }>(`SELECT payload, "idempotencyKey", "createdAt" FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2 ORDER BY "createdAt", id`, [tenantId, type]).catch(() => []);
  const audits = async (action: string, tenantId = tA) => q<Rec>(`SELECT * FROM "AuditLog" WHERE "tenantId" = $1 AND action = $2 ORDER BY "createdAt", id`, [tenantId, action]);
  // ORACLE-EDIT T1.6 รอบ 5 (มติ F1 ตามที่สร้าง): หลังร้านยกเลิก รับเฉพาะ slipId หรือช่องทางธนาคารที่มีเลขอ้างอิง ⇒ ทุกการรับเงินของข้อสอบแนบ reference (ไม่ใส่ = null)
  const pay = async (b: Bk, amount: number, o: { now?: Date; who?: string; key?: string; tender?: string; reference?: string | null } = {}) =>
    call("recordTripPayment", staff({ unit: b.unit, now: o.now ?? addMs(NOW0, 60_000), who: o.who }), { bookingId: b.id, amountSatang: amount, tender: o.tender ?? "PROMPTPAY", idempotencyKey: o.key ?? `p${hex(6)}`, ...(o.reference === null ? {} : { reference: o.reference ?? `QCREF${hex(4)}` }) });
  const payOk = async (b: Bk, amount: number, now?: Date) => V(await pay(b, amount, { now }), `recordTripPayment ${b.key}`);
  const reqRefund = async (b: Bk, o: { now?: Date; reasonKind?: string } = {}) =>
    call("requestTripRefund", staff({ unit: b.unit, now: o.now ?? NOW }), { bookingId: b.id, expectedVersion: num((await bk(b.id)).version), reasonKind: o.reasonKind ?? "CUSTOMER", choice: "MONEY", reason: "ลูกค้าขอยกเลิก", idempotencyKey: `r${hex(6)}` });
  const decide = async (b: Bk, requestId: unknown, o: { delta?: number; now?: Date } = {}) =>
    call("decideTripRefund", staff({ unit: b.unit, now: o.now ?? NOW }), { requestId, decision: "APPROVE", ...(o.delta !== undefined ? { manualDeltaSatang: o.delta, manualReason: "ปรับยอดทดสอบ" } : {}), idempotencyKey: `d${hex(6)}` });
  const execute = async (b: Bk, requestId: unknown, o: { now?: Date; ctx?: Rec } = {}) => call("executeTripRefund", o.ctx ?? staff({ unit: b.unit, now: o.now ?? NOW }), { requestId, idempotencyKey: `x${hex(6)}` });
  const setV = async (tenantId: string, who: string, changes: Rec[]) => {
    const r = asRec(await S("setSettings")({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: U[who]?.userId }, { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  const unitSet = (unit: string, key: string, value: unknown): Rec => ({ key, scope: "UNIT", scopeId: unit, value });
  const VATREG = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
  /** ค่าคงที่เงิน §16 ข้อ 1–3 ของ T0.7 */
  const moneyInv = async (bid: string): Promise<string[]> => {
    const b = await bk(bid); const bad: string[] = []; const e = await evs(bid);
    const sum = (k: string) => e.filter((x) => x.kind === k).reduce((s, x) => s + num(x.amountSatang), 0);
    if (num(b.paidSatang) !== sum("RECEIVED")) bad.push(`paid ${b.paidSatang} ≠ ΣRECEIVED ${sum("RECEIVED")}`);
    if (num(b.refundedSatang) !== sum("REFUNDED")) bad.push(`refunded ${b.refundedSatang} ≠ ΣREFUNDED ${sum("REFUNDED")}`);
    for (const x of e) if (num(x.amountSatang) - num(x.passThroughSatang) < 0) bad.push(`${x.kind} pt > amount`);
    return bad;
  };
  const seatInv = async (d: string, what: string) => {
    const c = await depRow(d);
    const s = (await q<{ n: number }>(`SELECT COALESCE(sum(i.qty),0)::int AS n FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" LEFT JOIN "TripPaxType" p ON p.id = i."paxTypeId"
      WHERE i."departureId" = $1 AND i.active AND i.kind IN ('SEAT','BERTH') AND COALESCE(p."countsCapacity", true) AND b.status = ANY($2::text[])`, [d, SOLD_ST]))[0]?.n ?? -1;
    const h = (await q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic" + "qtyAllot"),0)::int AS n FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [d]))[0]?.n ?? -1;
    ok(num(c.sold) === s && num(c.held) === h, `${what} ค่าคงที่ที่นั่ง: sold ${c.sold}/${s} held ${c.held}/${h}`);
  };

  try {
    for (const t of ["TripProduct", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripPriceRule", "TripBooking", "TripBookingItem", "TripPaymentDue", "TripMoneyEvent", "TripRefundRequest", "TripHold", "TripWaitlist", "TripResource", "TripResourceUse", "TripPassThroughEvidence", "TripPromoRedemption"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"], [tC, "c"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T1.6 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uA2, tA, "a2"], [uB, tB, "b"], [uC, tC, "c"]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({ timezone: "Asia/Bangkok" }), updatedAt: new Date() });
    const DV = "trips.departure.view", BV = "trips.booking.view";
    await mkUser("oa", tA, "OWNER", ["*"], []); await mkUser("ob", tB, "OWNER", ["*"], []); await mkUser("oc", tC, "OWNER", ["*"], []);
    await mkUser("mg", tA, "MANAGER", [uA], []); await mkUser("mgx", tA, "MANAGER", [uA2], []);
    await mkUser("st", tA, "STAFF", [uA], [DV, BV, "trips.departure.status"]);
    await mkUser("sta", tA, "STAFF", [uA], [DV, BV, "trips.departure.status", "trips.refund.approve"]);
    await mkUser("wild", tA, "STAFF", [uA], ["trips.*"]);
    await mkUser("req", tA, "STAFF", [uA], [DV, BV, "trips.refund.request"]);
    await mkUser("cxl", tA, "STAFF", [uA], [DV, BV, "trips.booking.cancel"]);
    await mkUser("pay", tA, "STAFF", [uA], [DV, BV, "trips.payment.record"]);
    await mkUser("exe", tA, "STAFF", [uA], [DV, BV, "trips.refund.execute"]); // ORACLE-EDIT T1.6 รอบ 6 (H1): ผู้มีแต่สิทธิ์บันทึกโอนคืน // ORACLE-EDIT T1.6 รอบ 4 (F1): ผู้มีแต่สิทธิ์รับเงิน
    await mkUser("use", tA, "STAFF", [uA], []); await mkUser("view", tA, "STAFF", [uA], []);
    await mkUser("none", tA, "STAFF", [uA], []);
    await mkProd("PR", tA, uA); await mkProd("PR2", tA, uA); await mkProd("PA2", tA, uA2); await mkProd("PB", tB, uB); await mkProd("PC", tC, uC);
    PROMO = `T16OFF${hex(2)}`.toUpperCase();
    await insertRow("TripPriceRule", { id: rid("ru"), tenantId: tA, unitId: uA, productId: null, kind: "PROMO_CODE", code: PROMO, params: JSON.stringify({ kind: "PROMO_CODE", code: PROMO, discountBp: 1_000, maxUses: 50 }), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  try {
    if (!setupErr) {
      await setV(tA, "oa", [unitSet(uA, "trips.tax.vatRegistered", VATREG), unitSet(uA2, "trips.tax.vatRegistered", VATREG), unitSet(uA, "trips.pay.depositPct", 30), unitSet(uA, "trips.pay.balanceDueDaysBefore", 20),
        unitSet(uA, "trips.cancel.shopCancelRefund", { EXTERNAL: 50, MIN_NOT_MET: 100, SHOP_FAULT: 100 }),
        unitSet(uA, "trips.pay.overdueAction", "AUTO_RELEASE"), // ORACLE-EDIT T1.6 รอบ 3 (GD-1): ค่านี้ถูกจดลง snapshot ตอนจอง (money.ts markTripDueOverdue อ่านจาก snapshot) ⇒ ต้องตั้งก่อนจองฟิกซ์เจอร์ทุกใบ — เดิมตั้งชั่วคราวใน GD-1 หลังจอง ⇒ ตัวควบคุมไม่เคยยิง unitSet(uA, "payments.receiver", { promptpayId: "0812345678", displayName: "ร้านทดสอบ T1.6" }),
        unitSet(uA, "trips.public.bookingEnabled", true), unitSet(uA, "trips.public.shopContact", { phone: "076-000-316", line: "@t16qc", address: "16 ถนนทดสอบ ภูเก็ต" }), // ทางลูกค้า (W1.3) ของ PC-9/RF-3
        { key: "trips.cancel.shopCancelOptions", scope: "PRODUCT", scopeId: PRD.PR2?.id, value: { options: ["MOVE_DATE"], autoRefundAfterDays: 0 } }]);
      await setV(tB, "ob", [unitSet(uB, "trips.tax.vatRegistered", VATREG)]);
      await setV(tC, "oc", [unitSet(uC, "trips.tax.vatRegistered", VATREG), unitSet(uC, "trips.pay.depositPct", 30), unitSet(uC, "trips.pay.balanceDueDaysBefore", 20)]);
    }
  } catch (e) { settingsErr = errMsg(e); console.log(`  ⚠️ ตั้งค่าตั้งไม่สำเร็จ: ${settingsErr}`); }
  const needSetup = () => { needTrips(); ok(!setupErr, `ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); ok(!settingsErr, `ตั้งค่าตั้งไม่สำเร็จ: ${settingsErr}`); };

  // ── ฟิกซ์เจอร์ §4.6 (ผ่านบริการจริง) ──
  let fixErr = "";
  const RU: Record<string, string> = {};
  try {
    needSetup();
    const dC = await mkDep("C", "2027-04-20");
    const dT = await mkDep("T", "2027-04-21");
    await insertRow("TripPrice", { id: rid("prT"), tenantId: tA, unitId: uA, productId: PRD.PR?.id, optionId: null, paxTypeId: PRD.PR?.pt.ADULT, cabinTypeId: null, seasonId: null, departureId: dT, currency: "THB", amountMinor: 400_000, weekdayMask: null, priority: 10, updatedAt: new Date() });
    await mkDep("Q", "2027-04-22"); await mkDep("V", "2027-04-23", { cap: 10 }); await mkDep("V2", "2027-04-24", { cap: 10 });
    await mkDep("S", "2027-04-15", { cap: 10 }); // เริ่ม 08:xx เวลาไทย = ก่อน NOW
    await mkDep("M", "2027-04-25", { minPax: 8 }); await mkDep("M0", "2027-04-25", { minPax: 8, hm: "13:00" }); await mkDep("A", "2027-04-27");
    await mkDep("X", "2027-04-20", { prod: "PA2" }); await mkDep("B", "2027-04-20", { prod: "PB" }); await mkDep("CC", "2027-04-20", { prod: "PC" });
    // dC: b1 b2 b3 b4 b6 b7 b8 b9 b11 (ยืนยันแล้ว) · b10 ยกเลิกก่อน · h1 p1 ถือที่
    await payOk(await mkBk("b1", "C", { a: 2 }), 2 * ONE);
    const b2 = await mkBk("b2", "C", { a: 2 }); await payOk(b2, num((await dues(b2.id))[0]?.amountSatang));
    await mkBk("b3", "C");
    const b4 = await mkBk("b4", "C", { a: 2 });
    await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT', "agentAccountId" = $2, "contactRoute" = 'VIA_AGENT' WHERE id = $1`, [b4.id, `t16-agent-${STAMP}`]); // แถวตรง (A1.4)
    const b6 = await mkBk("b6", "C"); await payOk(b6, ONE);
    await insertRow("TripPassThroughEvidence", { id: rid("ev"), tenantId: tA, unitId: uA, departureId: dC, bookingId: b6.id, extraKind: "PARK_FEE", paidToPayee: "กรมอุทยาน", amountSatang: PARK, paidAt: addMs(NOW0, DAY), fileIds: [], updatedAt: new Date() }); // แถวตรง
    const b7 = await mkBk("b7", "C"); await payOk(b7, ONE);
    REQ.b7old = String(V(await reqRefund(b7, { now: addMs(NOW, -DAY) }), "คำขอ b7 CUSTOMER").requestId);
    const b8 = await mkBk("b8", "C"); await payOk(b8, ONE);
    REQ.b8old = String(V(await reqRefund(b8, { now: addMs(NOW, -DAY), reasonKind: "EXTERNAL" }), "คำขอ b8 EXTERNAL").requestId);
    V(await decide(b8, REQ.b8old, { now: addMs(NOW, -DAY) }), "อนุมัติ b8");
    const b9 = await mkBk("b9", "C", { promo: PROMO }); await payOk(b9, b9.payable);
    await setV(tA, "oa", [unitSet(uA, "trips.pay.depositBase", "ALL_LINES")]);
    const b11 = await mkBk("b11", "C");
    await setV(tA, "oa", [unitSet(uA, "trips.pay.depositBase", "TRIP_ONLY")]);
    await payOk(b11, num((await dues(b11.id))[0]?.amountSatang));
    const b10 = await mkBk("b10", "C"); await payOk(b10, ONE);
    const r10 = V(await reqRefund(b10, { now: BKK("2027-03-28", "10:00") }), "คำขอ b10"); V(await decide(b10, r10.requestId, { now: BKK("2027-03-28", "10:00") }), "อนุมัติ b10");
    V(await execute(b10, r10.requestId, { now: BKK("2027-03-28", "10:05") }), "โอนคืน b10");
    const h1 = await mkBk("h1", "C", { pay: "PAY_NOW", now: addMs(NOW, -5 * 60_000) });
    const p1 = await mkBk("p1", "C", { pay: "PAY_NOW", now: addMs(NOW, -5 * 60_000) });
    await pool.query(`UPDATE "TripHold" SET "expiresAt" = $2 WHERE "bookingId" = ANY($1::text[]) AND status = 'ACTIVE'`, [[h1.id, p1.id], addMs(NOW, DAY)]); // แถวตรง: ถือที่ยังไม่หมดเวลาตลอดข้อสอบ
    await pool.query(`UPDATE "TripBooking" SET status = 'PENDING' WHERE id = $1`, [p1.id]); await pool.query(`UPDATE "TripHold" SET purpose = 'SHOP_CONFIRM' WHERE "bookingId" = $1`, [p1.id]); // แถวตรง (คำขอจอง)
    RU.w1 = await insertRow("TripWaitlist", { id: rid("wl"), tenantId: tA, unitId: uA, departureId: dC, partyId: null, channel: "WEB", qty: 2, status: "WAITING", updatedAt: new Date() });
    for (const k of ["C", "V"] as const) {
      const d = await depRow(DEP[k] as string); const res = await insertRow("TripResource", { id: rid("rs"), tenantId: tA, unitId: uA, kind: "BOAT", name: `เรือทดสอบ ${k}`, seats: 30, active: true, updatedAt: new Date() });
      RU[k] = await insertRow("TripResourceUse", { id: rid("rsu"), tenantId: tA, unitId: uA, resourceId: res, departureId: DEP[k], startsAt: d.startsAt, endsAt: d.endsAt, active: true, updatedAt: new Date() });
    }
    // รอบอื่น
    for (const k of ["q1", "q2", "q3", "q4"]) await payOk(await mkBk(k, "Q"), ONE);
    await mkBk("s1", "S"); await mkBk("m1", "M");
    const b12 = await mkBk("b12", "A", { a: 2 }); await payOk(b12, 100_000);
    await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT', "agentAccountId" = $2, "contactRoute" = 'VIA_AGENT' WHERE id = $1`, [b12.id, `t16-agent-${STAMP}`]); // แถวตรง (A1.4 · เอเจนซี่มีเงิน)
    await payOk(await mkBk("x1", "X", { prod: "PA2" }), ONE); await payOk(await mkBk("y1", "B", { prod: "PB" }), ONE);
    const cc = await mkBk("cc1", "CC", { prod: "PC", a: 2 }); await payOk(cc, num((await dues(cc.id))[0]?.amountSatang));
  } catch (e) { fixErr = errMsg(e); console.log(`  ⚠️ ฟิกซ์เจอร์ไม่สำเร็จ: ${fixErr}`); }
  const needFix = () => { needSetup(); ok(!fixErr, `ฟิกซ์เจอร์ไม่สำเร็จ: ${fixErr}`); };
  const B = (k: string): Bk => { const b = BK[k]; if (!b) throw new AssertFail(`ไม่มีการจองฟิกซ์เจอร์ ${k} (${fixErr || "ยังไม่สร้าง"})`); return b; };
  const D = (k: string): string => { const d = DEP[k]; if (!d) throw new AssertFail(`ไม่มีรอบ ${k}`); return d; };

  // ── ตัวเรนเดอร์ / ตัวเรียก action / หน้า ──
  const req = createRequire(import.meta.url);
  let renderErr = "";
  const RX = (() => { try { return { intl: req("next-intl") as Rec, arc: req("next/dist/shared/lib/app-router-context.shared-runtime.js") as Rec, react: req("react") as Rec, rds: req("react-dom/server") as Rec }; } catch (e) { renderErr = errMsg(e); return null; } })();
  const unent = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const wrap = (el: unknown, locale: "th" | "en"): string => {
    const ce = RX?.react.createElement as AnyFn; const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
    return String((RX?.rds.renderToStaticMarkup as AnyFn)(ce(asRec(RX?.arc.AppRouterContext)?.Provider, { value: router }, ce(RX?.intl.NextIntlClientProvider, { locale, messages: { trips: locale === "th" ? th : en }, timeZone: "Asia/Bangkok" }, el))));
  };
  const render = (comp: unknown, props: Rec, locale: "th" | "en" = "th"): string => {
    ok(RX, `เรนเดอร์ไม่ได้ (${renderErr})`); ok(typeof comp === "function", "ไม่มีคอมโพเนนต์");
    return wrap((RX?.react.createElement as AnyFn)(comp, props), locale);
  };
  const byTestid = (html: string, id: string): string => {
    const i = html.indexOf(`data-testid="${id}"`); if (i < 0) return "";
    const st0 = html.lastIndexOf("<", i); const tag = /^<(\w+)/.exec(html.slice(st0))?.[1] ?? "div";
    if (/^(input|img|br|hr|meta|link)$/.test(tag)) return html.slice(st0, html.indexOf(">", i) + 1);
    let depth = 0; const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g"); re.lastIndex = st0;
    for (let m = re.exec(html); m; m = re.exec(html)) { if (m[2]) continue; depth += m[1] ? -1 : 1; if (depth === 0) return html.slice(st0, m.index + m[0].length); }
    return html.slice(st0);
  };
  const has = (html: string, id: string) => html.includes(`data-testid="${id}"`);
  const hrefOf = (html: string, id: string): string | null => { const t = byTestid(html, id); const m = /^<a\b[^>]*\shref="([^"]*)"/.exec(t); return m ? decode(m[1] ?? "") : null; };
  const nextWork = (await tryImport("next/dist/server/app-render/work-async-storage.external.js")).mod as Rec | null;
  const nextWorkUnit = (await tryImport("next/dist/server/app-render/work-unit-async-storage.external.js")).mod as Rec | null;
  const nextCookies = (await tryImport("next/dist/server/web/spec-extension/cookies.js")).mod as Rec | null;
  const ENV = await tryImport("@/lib/env");
  const HASH = await tryImport("@/lib/core/hash");
  const SESSION_COOKIE = asRec(ENV.mod)?.secureCookies === false ? "shark_session" : "__Host-shark_session";
  const cookieOf: Record<string, string> = {};
  const sessionCookie = async (tag: string): Promise<string> => {
    needSetup();
    ok(asRec(nextWork?.workAsyncStorage) && asRec(nextWorkUnit?.workUnitAsyncStorage) && typeof nextCookies?.RequestCookies === "function", "ตั้งขอบเขตคำขอของ Next ไม่ได้ (โมดูลภายในของ next หาย)");
    if (!cookieOf[tag]) {
      const token = `t16ac${randomBytes(24).toString("hex")}`; const sha = HASH.mod?.sha256 as AnyFn | undefined; ok(typeof sha === "function", "ไม่มี sha256");
      await insertRow("Session", { id: rid("ss"), userId: U[tag]?.userId, tokenHash: String((sha as AnyFn)(token)), idleExpiresAt: new Date(Date.now() + DAY), expiresAt: new Date(Date.now() + DAY), createdAt: new Date() });
      cookieOf[tag] = `${SESSION_COOKIE}=${token}; shark_tenant=${U[tag]?.tenantId}`;
    }
    return cookieOf[tag];
  };
  const inRequest = async (tag: string, path: string, phase: "action" | "render", g: () => unknown): Promise<unknown> => {
    const cookie = await sessionCookie(tag);
    const reqq = new Request(`http://qc.local${path}`, { headers: { cookie, "user-agent": "qc-t16" } });
    const jar = new (nextCookies?.RequestCookies as new (h: Headers) => unknown)(reqq.headers);
    const workStore = { route: path, page: `${path}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
    const unitStore = { type: "request", phase, implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: reqq.headers, draftMode: undefined, rootParams: {}, url: { pathname: path, search: "" } };
    const run = (s: Rec | null, store: unknown, h: () => unknown) => (s?.run as (st1: unknown, h1: () => unknown) => unknown).call(s, store, h);
    return run(asRec(nextWork?.workAsyncStorage), workStore, () => run(asRec(nextWorkUnit?.workUnitAsyncStorage), unitStore, g));
  };
  const runAction = async (f: unknown, tag: string, path: string, args: unknown[]): Promise<Rec> => {
    ok(typeof f === "function", "ไม่มี action");
    try { return asRec(await inRequest(tag, path, "action", () => (f as AnyFn)(...args))) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e), digest: String(asRec(e)?.digest ?? "") }; }
  };
  const pageAt = async (route: "departures" | "bookings", sp: Record<string, string>, tag = "oa", locale: "th" | "en" = "th"): Promise<string> => {
    const PG = await tryImport(`@/app/app/u/[unitSlug]/trips/${route}/page`); ok(typeof PG.mod?.default === "function", `ไม่มีหน้า ${route} (${PG.err.slice(0, 100)})`); ok(RX, `เรนเดอร์ไม่ได้ (${renderErr})`);
    let el: unknown;
    try { el = await inRequest(tag, `/app/u/${SLUG_A}/trips/${route}`, "render", () => (PG.mod?.default as AnyFn)({ params: Promise.resolve({ unitSlug: SLUG_A }), searchParams: Promise.resolve(sp) })); }
    catch (e) { throw new AssertFail(`หน้า throw (notFound/redirect?): ${errMsg(e).slice(0, 80)} ${String(asRec(e)?.digest ?? "")}`); }
    return wrap(el, locale);
  };
  const DRAWER = await tryImport("@/components/trips/BookingDrawer");
  const drawerAt = async (tag: string, b: Bk, now: Date, locale: "th" | "en" = "th"): Promise<string> => {
    const r = await call("loadBookingDetailVM", tc(tag), { unitId: b.unit, bookingId: b.id }, { now }); ok(r.ok === true, `loadBookingDetailVM ${b.key}: ${fmt(r)}`);
    const whens = needTrips().BOOKING_LIST_WHENS as string[] | undefined;
    const qy = { q: null, product: null, when: whens?.[0] ?? "upcoming", date: null, channel: "", chip: "all", dep: null, b: b.id, view: "list", day: null };
    return render(DRAWER.mod?.default, { unitSlug: SLUG_A, vm: r.vm, base: `/app/u/${SLUG_A}/trips/bookings`, q: qy, channels: needTrips().DEPARTURE_SELL_CHANNELS ?? [] }, locale);
  };
  const measure = async (f: () => Promise<unknown>): Promise<{ n: number; r: unknown }> => {
    sqlLog = []; counting = true;
    try { const r = await f(); return { n: realSql().length, r }; } finally { counting = false; }
  };
  // ทางลูกค้า (W1.3): verify → grant → quote/cancel
  const PUBI = await tryImport("@/lib/platform/trips-public"); let ipN = 0;
  const sfn = (name: string): AnyFn => { const f = SELF.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`ไม่มี ${name} ใน platform/trips-self (${SELF.err.slice(0, 80)})`); return f as AnyFn; };
  const selfQuote = async (b: Bk, now: Date): Promise<Rec> => {
    const nonce = sfn("issueSelfFormNonce")({ now: addMs(now, -60_000), scope: { tenantId: b.tenant, purpose: "verify", token: b.token } });
    const bck = PUBI.mod?.bookClientKey; ok(typeof bck === "function", `ไม่มี bookClientKey (${PUBI.err.slice(0, 80)})`); // ORACLE-EDIT (ผู้คุม 26 พ.ย.): กุญแจเครื่องจาก IP แบบ qc-trips-w1.3 (เดิม NO_CLIENT)
    ipN++; const ck = String((bck as AnyFn)(`100.66.16.${ipN & 255}`));
    const v = asRec(await sfn("verifyBookSelf")({ shop: SHOP_A, token: b.token, form: { phone: b.phone, nonce }, clientKey: ck }, { now: addMs(now, -30_000) })) ?? {};
    ok(v.ok === true && typeof v.grant === "string", `verifyBookSelf ${b.key}: ${fmt(v)}`);
    try { return asRec(await sfn("quoteBookSelfCancel")({ shop: SHOP_A, token: b.token, grant: v.grant, clientKey: ck }, { now })) ?? {}; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };

  // ═══════════════ PC (ต่อ) — ของเดิมที่ใบนี้พึ่ง (เขียวทั้งก่อนและหลังงาน) ═══════════════
  console.log("\n── PC (ต่อ): ฟิกซ์เจอร์ + ของเดิม ──");
  await st("PC-2", "[บริการ] ทางเดิม: cancelDeparture บน dC ⇒ HAS_BOOKINGS ไม่เขียน (departures.ts:1115) · บน dV (ว่าง) ⇒ CANCELLED + releaseUsesTx ปิด TripResourceUse ของรอบ (departures.ts:1116)", async () => {
    needFix(); const v0 = await depRow(D("C"));
    const r = await call("cancelDeparture", tc("oa"), { unitId: uA, departureId: D("C"), reason: "ทดสอบทางเดิม" }, { now: NOW }); codeR(r, "HAS_BOOKINGS", "dC");
    eq([(await depRow(D("C"))).version, (await depRow(D("C"))).status], [v0.version, v0.status], "dC ไม่เปลี่ยน");
    V(await call("cancelDeparture", tc("oa"), { unitId: uA, departureId: D("V"), reason: "ทดสอบทางเดิม" }, { now: NOW }), "dV");
    eq([(await depRow(D("V"))).status, (await q<Rec>(`SELECT active FROM "TripResourceUse" WHERE id = $1`, [RU.V]))[0]?.active], ["CANCELLED", false], "dV + ทรัพยากร");
  });
  await st("PC-3", "[บริการ] ของเดิม (เหตุของ B3): requestTripRefund เหตุ EXTERNAL บน q1 (รอบปกติ) ⇒ refundBp 5000 ตาม T21 ของ snapshot (ยอด < ที่จ่าย) · decideTripRefund ปรับลบได้ (refund.ts:525–535) — RF-3/RF-6 กลับข้อนี้บนรอบที่ร้านยกเลิก", async () => {
    needFix(); const b = B("q1"); const r = V(await reqRefund(b, { reasonKind: "EXTERNAL" }), "ยื่น EXTERNAL");
    const row = await reqRow(String(r.requestId)); eq([asRec(row.computed)?.refundBp, num(row.amountSatang) < ONE], [5_000, true], "50%");
    V(await decide(b, r.requestId, { delta: -1_000 }), "ปรับลบ"); eq((await reqRow(String(r.requestId))).status, "APPROVED", "อนุมัติ");
  });
  await st("PC-4", "[บริการ] ของเดิม (เหตุของ B2): คำขอ EXTERNAL อนุมัติแล้วของ q2 + เพิ่ม TripPassThroughEvidence ⇒ executeTripRefund ⇒ STATE_CONFLICT QUOTE_REFRESHED ยอดใหม่ต่ำลง (requoteApproved refund.ts:848)", async () => {
    needFix(); const b = B("q2"); const r = V(await reqRefund(b, { reasonKind: "EXTERNAL" }), "ยื่น"); V(await decide(b, r.requestId), "อนุมัติ"); const a0 = num((await reqRow(String(r.requestId))).amountSatang);
    await insertRow("TripPassThroughEvidence", { id: rid("ev"), tenantId: tA, unitId: uA, departureId: b.dep, bookingId: b.id, extraKind: "PARK_FEE", paidToPayee: "กรมอุทยาน", amountSatang: PARK, paidAt: addMs(NOW, -HOUR), fileIds: [], updatedAt: new Date() });
    const x = await execute(b, r.requestId); codeR(x, "STATE_CONFLICT", "execute", "QUOTE_REFRESHED");
    ok(num(asRec(x.details)?.amountSatang) < a0, `ยอดใหม่ ${fmt(x.details)} ต้องต่ำกว่า ${a0}`);
  });
  await st("PC-5", "[บริการ+งาน] ของเดิม (เหตุของ B1): changeTripBooking q3 (จ่ายแล้ว) → dT (ราคาเฉพาะรอบ 4,000) ⇒ STATE_CONFLICT PRICE_CHANGED_AFTER_PAYMENT (booking.ts:1710) · runPaymentDue ณ NOW ของร้านควบคุม C เลือกงวดที่เลยกำหนดของ cc1 (แบบ b2) ⇒ OVERDUE (jobs.ts:268)", async () => {
    needFix(); const b = B("q3"); const ctx = staff(); const ln = lineOf(D("T"), "PR", 1);
    const quote = V(await call("quoteTrips", ctx, { lines: [ln] }, {}), "quote");
    codeR(await call("changeTripBooking", ctx, { bookingId: b.id, expectedVersion: num((await bk(b.id)).version), line: ln, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `m${hex(6)}` }, {}), "STATE_CONFLICT", "เปลี่ยนรอบ", "PRICE_CHANGED_AFTER_PAYMENT");
    eq((await bk(b.id)).departureId, D("Q"), "ไม่ย้าย");
    const j = asRec(await fn("runPaymentDue")(NOW, { tenantIds: [tC] })) ?? {}; ok(num(j.overdue) >= 1, `runPaymentDue: ${fmt(j)}`);
    ok((await dues(B("cc1").id)).some((d) => d.status === "OVERDUE"), `งวด cc1: ${fmt((await dues(B("cc1").id)).map((d) => d.status))}`);
  });
  await st("PC-6", "[บริการ] ของเดิม: moneyBookingGate ปฏิเสธการจองเอเจนซี่ (money.ts:113–117 · FORBIDDEN AGENCY_NOT_ENABLED) · recordTripPayment บน b4 (เอเจนซี่) ⇒ FORBIDDEN · executeTripRefund ด้วยผู้กระทำ SYSTEM ⇒ FORBIDDEN", async () => {
    needFix(); const gate = MONEY.mod?.moneyBookingGate; ok(typeof gate === "function", "ไม่มี moneyBookingGate");
    codeR(asRec((gate as AnyFn)({ collectMode: "AGENT", agentAccountId: "x", currency: "THB" })) ?? {}, "FORBIDDEN", "gate", "AGENCY_NOT_ENABLED");
    codeR(await pay(B("b4"), 1_000, { now: addMs(NOW, -HOUR) }), "FORBIDDEN", "รับเงินเอเจนซี่");
    const rq = (await reqs(B("q1").id)).find((x) => x.status === "APPROVED"); ok(rq, "ไม่มีคำขอ APPROVED ของ q1 (PC-3)");
    codeR(await execute(B("q1"), rq?.id, { ctx: sysCtx() }), "FORBIDDEN", "execute SYSTEM");
  });
  await st("PC-7", "[ฐาน] ฟิกซ์เจอร์สอดคล้องจากแถวดิบ: สถานะ b1 PAID b2 PART_PAID b3 b4 CONFIRMED b6–b9 PAID b11 PART_PAID b10 CANCELLED h1 HOLD p1 PENDING · ยอดจ่าย 820,000/210,000/0/0/410,000×3/375,000/123,000 · dC sold 12 held 2 (ค่าคงที่ที่นั่ง) · b7 QUOTED CUSTOMER · b8 APPROVED EXTERNAL 235,000 · b9 โปรโมชัน ACTIVE · b6 มีหลักฐาน · ค่าคงที่เงินทุกการจอง · รายการรอ WAITING 2 · ทรัพยากร active", async () => {
    needFix(); const bad: string[] = [];
    const want: [string, string, number][] = [["b1", "PAID", 2 * ONE], ["b2", "PART_PAID", DEP_B2], ["b3", "CONFIRMED", 0], ["b4", "CONFIRMED", 0], ["b6", "PAID", ONE], ["b7", "PAID", ONE], ["b8", "PAID", ONE], ["b9", "PAID", PROMO_B9], ["b11", "PART_PAID", DEP_B11], ["b10", "CANCELLED", ONE], ["h1", "HOLD", 0], ["p1", "PENDING", 0]];
    for (const [k, s, p] of want) { const r = await bk(B(k).id); if (r.status !== s || num(r.paidSatang) !== p) bad.push(`${k} ${r.status}/${r.paidSatang}`); const mi = await moneyInv(B(k).id); if (mi.length) bad.push(`${k}: ${mi.join(",")}`); }
    const d = await depRow(D("C")); if (num(d.sold) !== 12 || num(d.held) !== 2) bad.push(`dC sold ${d.sold} held ${d.held}`);
    await seatInv(D("C"), "dC");
    const r7 = await reqRow(REQ.b7old ?? ""), r8 = await reqRow(REQ.b8old ?? "");
    if (r7.status !== "QUOTED" || r7.reasonKind !== "CUSTOMER") bad.push(`b7 คำขอ ${r7.status}/${r7.reasonKind}`);
    if (r8.status !== "APPROVED" || r8.reasonKind !== "EXTERNAL" || num(r8.amountSatang) !== halfUp(ADULT, 50, 100) + PARK) bad.push(`b8 คำขอ ${r8.status}/${r8.reasonKind}/${r8.amountSatang}`);
    if ((await q<Rec>(`SELECT status FROM "TripPromoRedemption" WHERE "bookingId" = $1`, [B("b9").id])).map((x) => x.status).join() !== "ACTIVE") bad.push("b9 โปรโมชัน");
    if ((await q(`SELECT 1 FROM "TripPassThroughEvidence" WHERE "bookingId" = $1`, [B("b6").id])).length !== 1) bad.push("b6 หลักฐาน");
    if ((await q<Rec>(`SELECT status, qty FROM "TripWaitlist" WHERE id = $1`, [RU.w1])).map((x) => `${x.status}/${x.qty}`).join() !== "WAITING/2") bad.push("รายการรอ");
    if ((await q<Rec>(`SELECT active FROM "TripResourceUse" WHERE id = $1`, [RU.C]))[0]?.active !== true) bad.push("ทรัพยากร dC");
    const holds = await q<Rec>(`SELECT purpose, status FROM "TripHold" WHERE "bookingId" = ANY($1::text[]) ORDER BY purpose`, [[B("h1").id, B("p1").id]]);
    if (holds.map((h) => `${h.purpose}/${h.status}`).join() !== "PAYMENT/ACTIVE,SHOP_CONFIRM/ACTIVE") bad.push(`ถือที่ ${fmt(holds)}`);
    const b11d = await dues(B("b11").id); if (num(b11d[0]?.passThroughSatang) !== 18_000) bad.push(`b11 มัดจำ ALL_LINES pt ${b11d[0]?.passThroughSatang}`);
    const b2r = (await evs(B("b2").id, "RECEIVED"))[0]; if (num(b2r?.passThroughSatang) !== 0) bad.push(`b2 ใบรับ pt ${b2r?.passThroughSatang} (ต้อง 0 · TRIP_ONLY)`);
    const ag = await q<Rec>(`SELECT "collectMode", "paidSatang" FROM "TripBooking" WHERE id = ANY($1::text[]) ORDER BY "paidSatang"`, [[B("b4").id, B("b12").id]]);
    if (ag.map((x) => `${x.collectMode}/${x.paidSatang}`).join() !== "AGENT/0,AGENT/100000") bad.push(`เอเจนซี่ ${fmt(ag)}`);
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("PC-8", `[โค้ด] ตัวช่วยขอบเขต: BASE ${BASE_SHA} มีจริง · trips-main-merge positive control (ไฟล์ main ที่ TRIPS ไม่แตะ ⇒ true) · negative control (ไฟล์ของใบนี้ ⇒ false)`, () => {
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", `หา BASE ${BASE_SHA} ไม่เจอ`);
    const pos = ["src/lib/modules/kanban/", "src/lib/modules/crm/", "src/lib/modules/member/", "src/lib/"].flatMap((d) => git(["ls-tree", "-r", "--name-only", TRIPS_MAIN_MERGE_SHA, d]).split("\n").filter(Boolean).slice(0, 40))
      .find((f) => git(["diff", "--name-only", TRIPS_MAIN_MERGE_SHA, "--", f]).trim() === "" && git(["diff", "--name-only", BASE_SHA, "--", f]).trim() === "");
    ok(pos, "หาไฟล์ควบคุมบน main ไม่ได้"); eq(fromMainMerge(ROOT, String(pos)), true, `positive ${pos}`);
    eq([fromMainMerge(ROOT, "ledger/trips-briefs/T1.6.md"), fromMainMerge(ROOT, SVC), fromMainMerge(ROOT, MOD + "refund.ts")], [false, false, false], "negative");
  });
  await st("PC-9", "[action+หน้า+บริการ] ตัวช่วยของข้อสอบทำงานกับของเดิม: cancelDepartureScreenAction ใน dV2 (ว่าง) โดย OWNER ⇒ CANCELLED · โดย none ⇒ FORBIDDEN/ForbiddenError · หน้า /trips/departures?dep=dQ เรนเดอร์ trips-dep-panel · ลิ้นชัก q1 เรนเดอร์ trips-bk-detail · หน้า /trips/bookings เรนเดอร์ trips-bk · ตัวนับ SQL > 0 · ทางลูกค้า verify → quoteBookSelfCancel ของ q4 ok", async () => {
    needFix(); const ACT = await tryImport("@/lib/modules/trips/departure-screen-actions"); const f = ACT.mod?.cancelDepartureScreenAction;
    const path = `/app/u/${SLUG_A}/trips/departures`;
    const no = await runAction(f, "none", path, [SLUG_A, { departureId: D("V2"), reason: "ทดสอบตัวเรียก" }]);
    ok(no.ok !== true && (no.code === "FORBIDDEN" || /forbidden|ไม่มีสิทธิ์/i.test(String(no.e ?? ""))), `none: ${fmt(no)}`);
    V(await runAction(f, "oa", path, [SLUG_A, { departureId: D("V2"), reason: "ทดสอบตัวเรียก" }]), "OWNER"); eq((await depRow(D("V2"))).status, "CANCELLED", "dV2");
    ok(has(await pageAt("departures", { dep: D("Q") }), "trips-dep-panel"), "หน้ารอบไม่มี trips-dep-panel");
    ok(has(await drawerAt("oa", B("q1"), NOW), "trips-bk-detail"), "ลิ้นชักไม่มี trips-bk-detail");
    ok(has(await pageAt("bookings", {}), "trips-bk"), "หน้ารายการไม่มี trips-bk");
    const m = await measure(() => call("loadDeparturePanelVM", tc("oa"), { unitId: uA, departureId: D("Q") }, { now: NOW })); ok(m.n > 0 && asRec(m.r)?.ok === true, `ตัวนับ SQL ${m.n}`);
    const sq = await selfQuote(B("q4"), NOW); ok(sq.ok === true, `quoteBookSelfCancel q4: ${fmt(sq)}`); // q4 = จ่ายแล้ว ไม่มีคำขอ (q2 มีคำขอค้างจาก PC-4 ⇒ REFUND_IN_PROGRESS)
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์/ขอบเขต/โค้ด ═══════════════
  console.log("\n── S: ไฟล์ · ขอบเขต · โค้ด ──");
  const lit = (p: string) => `:(literal)${p}`;
  const sameAsSession = (f: string) => git(["diff", "--name-only", "session/trips", "--", lit(f)]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", lit(f)]).trim() === "";
  const newMigrations = () => {
    const base = new Set(git(["ls-tree", "--name-only", `${BASE_SHA}:prisma/migrations`]).split("\n").filter(Boolean));
    return existsSync(join(ROOT, "prisma/migrations")) ? readdirSync(join(ROOT, "prisma/migrations")).filter((n) => !base.has(n) && existsSync(join(ROOT, "prisma/migrations", n, "migration.sql"))) : [];
  };
  const fnBody = (src: string, name: string): string => {
    const i = src.search(new RegExp(`(async\\s+)?function\\s+${name}\\b`)); if (i < 0) return "";
    const open = src.indexOf("{", src.indexOf(")", i)); if (open < 0) return "";
    let depth = 0; for (let j = open; j < src.length; j++) { const ch = src[j]; if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) return src.slice(i, j + 1); } }
    return src.slice(i);
  };
  await st("S-1", "[โค้ด] ไฟล์ใหม่ครบ (cancel-departure-core.ts · cancel-departure.ts · cancel-departure-actions.ts · src/components/trips/DepartureCancel*.tsx) · migration ใหม่ 1 โฟลเดอร์ · facade ส่งออก " + [...FACADE_FNS, ...FACADE_CONSTS].join(" "), () => {
    const miss = [CORE, SVC, ACTS].filter((f) => !read(f)); ok(miss.length === 0, `ยังไม่มี ${miss.join(", ")}`);
    ok(existsSync(join(ROOT, COMP)) && readdirSync(join(ROOT, COMP)).some((n) => /^DepartureCancel\w*\.tsx$/.test(n)), "ยังไม่มี DepartureCancel*.tsx");
    eq(newMigrations().length, 1, `migration ใหม่ (${newMigrations().join(", ")})`);
    const t = needTrips(); const nf = [...FACADE_FNS.filter((n) => typeof t[n] !== "function"), ...FACADE_CONSTS.filter((n) => t[n] === undefined)]; ok(nf.length === 0, `facade ยังไม่มี ${nf.join(" ")}`);
  });
  await st("S-2", "[ฐาน] migration ตรง §3: 3 คอลัมน์ · CHECK cancelKind (3 ค่า) + CHECK รวม (jsonb_typeof array · status CANCELLED) · ดัชนีบางส่วน (tenantId, cancelDecideBy) WHERE cancelKind · ตาราง TripDepartureCancelOutcome: CHECK choice (5 ค่า รวม MOVED) · by (STAFF SYSTEM_DEFAULT) · consent ⇔ MOVED · REFUND ⇒ refundRequestId · UNIQUE (departureId, bookingId) · FK RESTRICT · ทะเบียน scope `TripDepartureCancelOutcome: unit` ใน scope.ts", async () => {
    const m = await migState(); ok(m.ok, `migration missing — ${m.why}`);
    const defs = async (t: string) => (await q<{ d: string }>(`SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = current_schema() AND r.relname = $1`, [t])).map((x) => x.d);
    const dd = await defs("TripDeparture"), od = await defs("TripDepartureCancelOutcome"); const bad: string[] = [];
    if (!dd.some((d) => /cancelKind/.test(d) && ["EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"].every((k) => d.includes(`'${k}'`)))) bad.push("CHECK cancelKind");
    if (!dd.some((d) => /jsonb_typeof/.test(d) && /cancelOptions/.test(d) && /CANCELLED/.test(d) && /cancelDecideBy/.test(d))) bad.push("CHECK รวม");
    if (!od.some((d) => ["PENDING", "MOVED", "REFUND", "NO_MONEY", "AGENCY_MONEY_HELD"].every((k) => d.includes(`'${k}'`)))) bad.push("CHECK choice");
    if (!od.some((d) => /"by"|\bby\b/.test(d) && d.includes("'STAFF'") && d.includes("'SYSTEM_DEFAULT'"))) bad.push("CHECK by");
    if (!od.some((d) => /consent/.test(d) && /MOVED/.test(d))) bad.push("CHECK consent");
    if (!od.some((d) => /refundRequestId/.test(d) && /REFUND/.test(d))) bad.push("CHECK refund");
    if (od.filter((d) => /^FOREIGN KEY/.test(d) && /ON DELETE RESTRICT/.test(d)).length < 2) bad.push("FK RESTRICT 2 ตัว");
    const idx = (await q<{ d: string }>(`SELECT indexdef AS d FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ANY($1::text[])`, [["TripDeparture", "TripDepartureCancelOutcome"]])).map((x) => x.d);
    if (!idx.some((d) => /UNIQUE/.test(d) && /"departureId", "bookingId"/.test(d))) bad.push("UNIQUE");
    if (!idx.some((d) => /"cancelDecideBy"/.test(d) && /WHERE/.test(d))) bad.push("ดัชนีบางส่วน");
    if (!/TripDepartureCancelOutcome:\s*unit/.test(read("src/lib/core/scope.ts"))) bad.push("ทะเบียน scope");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-3", `[โค้ด] ขอบเขตเทียบ BASE ${BASE_SHA} (ไม่นับไฟล์ที่ตรงกับ session/trips หรือมาจาก main): ไม่แตะไฟล์ต้องห้าม (core นอก scope.ts · staff · payment · webhooks · api · โมดูลอื่น · pricing/costs/reports · ข้อสอบเดิมนอก ORACLE-EDIT ที่คาด) · ไฟล์จำกัดอยู่ในงบ §1 (a1)`, () => {
    const atBase = (dir: string) => git(["ls-tree", "-r", "--name-only", BASE_SHA, `${dir}/`]).split("\n").filter(Boolean);
    const allowNewTrips = new Set([CORE, SVC, ACTS]);
    const forbidden = [...atBase("src/lib/core").filter((f) => f !== "src/lib/core/scope.ts"), "src/lib/staff", "src/lib/payment", "src/lib/webhooks", "src/app/api", "src/proxy.ts", "next.config.ts",
      ...["pos", "account", "party", "approval", "hotel", "rooms", "booking", "dorm", "queue", "ticket", "agency", "supplier", "hr", "inventory", "chat"].map((m) => `src/lib/modules/${m}`),
      ...atBase("src/lib/modules/trips").filter((f) => !LIMITED_SET.has(f) && !allowNewTrips.has(f)), ...atBase(COMP).filter((f) => !LIMITED_SET.has(f)), ...atBase(APP), ...atBase("src/lib/platform").filter((f) => !LIMITED_SET.has(f)),
      ...atBase("prisma").filter((f) => !LIMITED_SET.has(f) && !f.startsWith("prisma/migrations/")), ...atBase("prisma/migrations"),
      ...atBase("scripts").filter((f) => /^scripts\/(qc-trips-[\w.]+\.mts|probe-trips-[\w.-]+\.mts)$/.test(f) && !DRAFTER_FILES.includes(f)), "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/seed-trips-qc.mts",
      "scripts/trips-fixture.mts", "scripts/iso.sh", "scripts/qc-trips.sh", "scripts/trips-main-merge.mts"];
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...forbidden.map(lit)]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...forbidden.filter((p) => !/\.\w+$/.test(p)).map(lit)]).split("\n")].filter(Boolean))];
    const touched = changed.filter((f) => !sameAsSession(f) && !fromMainMerge(ROOT, f));
    ok(touched.length === 0, `แตะไฟล์ต้องห้าม: ${touched.slice(0, 6).join(", ")}`);
    const over: string[] = [];
    for (const [fs, maxDel, maxAdd] of LIMITED) {
      let a = 0, d = 0;
      for (const f of fs) { const line = git(["diff", "--numstat", BASE_SHA, "--", lit(f)]).trim(); if (!line || sameAsSession(f) || fromMainMerge(ROOT, f)) continue; const [x, y] = line.split("\t").map(Number); a += x ?? 0; d += y ?? 0; }
      if (d > maxDel || (maxAdd !== null && a > maxAdd)) over.push(`${fs.join("+")} +${a}/−${d} (ได้ +${maxAdd ?? "∞"}/−${maxDel})`);
    }
    ok(over.length === 0, `เกินงบ: ${over.join(" · ")}`);
    const nm = newMigrations(); ok(nm.length <= 1, `migration ใหม่เกิน 1 โฟลเดอร์: ${nm.join(", ")}`);
  });
  await st("S-4", "[โค้ด] cancel-departure-actions.ts: \"use server\" · ส่งออกเฉพาะ cancelDepartureWithBookingsAction + resolveCancelledBookingAction (async function) · requireUnit · assertCan + ForbiddenError · unitId จาก slug · ไม่รับ/ไม่สร้างเวลา · ไม่ส่ง opts สิทธิ์ให้บริการ (N3 — บริการอ่านสิทธิ์เอง)", () => {
    const raw = read(ACTS), s = stripComments(raw); ok(raw, `ยังไม่มี ${ACTS}`);
    ok(/^\s*["']use server["']/.test(raw), "ไม่มี \"use server\"");
    const exps = [...s.matchAll(/export\s+(async\s+function|function|const|let|class|type|interface|default)\s+(\w+)?/g)].map((m) => `${m[1]} ${m[2]}`).sort();
    eq(exps, ["async function cancelDepartureWithBookingsAction", "async function resolveCancelledBookingAction"], "export");
    ok(/requireUnit\(/.test(s) && /assertCan\(/.test(s) && /ForbiddenError/.test(s), "requireUnit/assertCan/ForbiddenError");
    ok(/unitId:\s*unit\.id/.test(s), "unitId ไม่ได้มาจากหน่วยของ slug");
    ok(!/\bnow\s*[:=]/.test(s) && !/new Date\(/.test(s), "action รับ/สร้างเวลา");
    ok(!/canDecide|canApprove|\bperms?\s*:|permissions\s*:/.test(s), "action ส่งสิทธิ์ให้บริการผ่าน opts (N3 ห้าม)");
  });
  await st("S-5", "[โค้ด] รั้วระดับโค้ดใน refund.ts: requestCore อ่าน cancelKind ของรอบ (DEPARTURE_CANCELLED_USE_RESOLVE) · tripRefundQuote / requoteApproved / decideTripRefund / fileRefundRequestInTx อ่านป้าย DEPARTURE_CANCEL · ตัวคิดคืนเต็มอยู่ใน money-core (fullRefundQuoteFromReceipts) ไม่ใช้ shopCancelRefundBpByReason", () => {
    const r = stripComments(read(MOD + "refund.ts")); const bad: string[] = [];
    if (!/cancelKind/.test(fnBody(r, "requestCore")) || !/DEPARTURE_CANCELLED_USE_RESOLVE/.test(r)) bad.push("requestCore ไม่อ่าน cancelKind");
    for (const f of ["tripRefundQuote", "requoteApproved", "fileRefundRequestInTx"]) if (!/DEPARTURE_CANCEL\b|fullRefund/.test(fnBody(r, f))) bad.push(`${f} ไม่อ่านป้าย`);
    if (!/DEPARTURE_CANCEL_FULL_REFUND/.test(r)) bad.push("decideTripRefund ไม่มีรหัส DEPARTURE_CANCEL_FULL_REFUND");
    const mc = stripComments(read(MOD + "money-core.ts")); const fq = fnBody(mc, "fullRefundQuoteFromReceipts");
    if (!fq) bad.push("money-core ไม่มี fullRefundQuoteFromReceipts"); else if (/shopCancelRefundBpByReason|cancelLadder/.test(fq)) bad.push("fullRefundQuoteFromReceipts อ่านตาราง/T21");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-6", "[โค้ด] ทางเงินที่เดียว: cancel-departure.ts ไม่ INSERT \"TripRefundRequest\"/\"TripMoneyEvent\" เอง · ไม่ import account/pos · ไม่ใช้นาฬิกาฐาน (now() CURRENT_TIMESTAMP) · ทางไม่มีเงิน = ตัวช่วยเดียว settleNoMoneyInTx (ประกาศครั้งเดียว · ถูกเรียก)", () => {
    const s = stripComments(read(SVC)); ok(s, `ยังไม่มี ${SVC}`); const bad: string[] = [];
    if (/INSERT\s+INTO\s+"Trip(RefundRequest|MoneyEvent)"/i.test(s)) bad.push("INSERT คำขอ/เงินเอง");
    if (/from\s+["']@\/lib\/modules\/(account|pos)/.test(s)) bad.push("import account/pos");
    if (/\bnow\(\)|CURRENT_TIMESTAMP|CURRENT_DATE|LOCALTIMESTAMP|clock_timestamp|statement_timestamp/i.test(s)) bad.push("นาฬิกาฐาน");
    if ((s.match(/function\s+settleNoMoneyInTx\b/g) ?? []).length !== 1 || (s.match(/settleNoMoneyInTx\(/g) ?? []).length < 2) bad.push("settleNoMoneyInTx ไม่ใช่ตัวช่วยเดียวที่ถูกเรียก");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-7", "[โค้ด] ลำดับล็อกของ cancelDepartureWithBookings (CC :495): advisory (pg_advisory_xact_lock) ก่อนล็อกรอบ · ล็อกรอบก่อนแตะ TripHold/TripBooking · การจองล็อกเรียง id (ORDER BY \"id\" … FOR UPDATE)", () => {
    const s = stripComments(read(SVC)); const b = fnBody(s, "cancelDepartureWithBookings"); ok(b, "ยังไม่มี cancelDepartureWithBookings ใน cancel-departure.ts");
    const all = s; const ia = all.search(/pg_advisory_xact_lock|advisoryLock|advisory/), idp = all.search(/lockDeparture\(|"TripDeparture"[^`]*FOR UPDATE/), ih = all.search(/"TripHold"/), ib = all.search(/"TripBooking"[^`]*ORDER BY\s+"?id"?[^`]*FOR UPDATE|ORDER BY\s+"id"\s+FOR UPDATE/);
    ok(ia >= 0 && idp > ia, `advisory (${ia}) ต้องมาก่อนล็อกรอบ (${idp})`); ok(ih < 0 || ih > idp, "แตะ TripHold ก่อนล็อกรอบ"); ok(ib > idp, "ไม่มีการล็อกการจองเรียง id หลังล็อกรอบ");
  });
  await st("S-8", "[โค้ด] ข้อความ th/en ที่เพิ่มเทียบ BASE: มีอย่างน้อย 1 คีย์ · คีย์สองภาษาเท่ากัน · ไม่มี \"อัตโนมัติ\"/\"automatic\" · ไม่สัญญาระยะเวลาคืนเงิน · ไม่มีรหัสดิบ · อังกฤษไม่มีอักษรไทย", () => {
    const bth = baseJson("src/messages/th/trips.json"), ben = baseJson("src/messages/en/trips.json");
    const nth = Object.keys(fth).filter((k) => !(k in bth)), nen = Object.keys(fen).filter((k) => !(k in ben)); ok(nth.length > 0, "ยังไม่มีข้อความใหม่ของใบ");
    eq([...nth].sort(), [...nen].sort(), "คีย์ใหม่ th/en"); const bad: string[] = [];
    for (const k of nth) {
      const a = fth[k] ?? "", b = fen[k] ?? "";
      if (/อัตโนมัติ/.test(a) || /automatic/i.test(b)) bad.push(`${k}: อัตโนมัติ`);
      if (/คืน[^{]*\d+\s*(วัน|ชั่วโมง)|\d+\s*(วัน|ชั่วโมง)[^{]*คืน/.test(a) || /refund[^{]*\d+\s*(day|hour)|\d+\s*(day|hour)s?[^{]*refund/i.test(b)) bad.push(`${k}: ระยะเวลาคืนเงิน`);
      for (const c of RAW_CODES) if (a.includes(c) || b.includes(c)) bad.push(`${k}: รหัสดิบ ${c}`);
      if (THAI.test(b)) bad.push(`${k}: อังกฤษมีอักษรไทย`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("S-9", "[โค้ด] F3: ผู้กระทำของการอนุมัติให้เองชื่อ trips.departureCancel.autoApprove อยู่ในโค้ดของใบ (refund.ts หรือ cancel-departure.ts) · ไม่ใช้ trips.refund.autoApprove กับคำขอติดป้าย", () => { // ORACLE-EDIT T1.6 รอบ 4
    const src = stripComments(read(MOD + "refund.ts")) + stripComments(read(SVC)); ok(src.includes('"trips.departureCancel.autoApprove"'), "ยังไม่มีผู้กระทำ trips.departureCancel.autoApprove");
  });
  await st("S-10", "[โค้ด] H2: DepartureCancel.tsx กันกดซ้ำแบบ synchronous (useRef) · กุญแจกันซ้ำสร้างครั้งเดียวต่อการเรนเดอร์ของปุ่ม (useState/useRef/useMemo) ไม่ใช่ในตัวจัดการคลิก (ไม่มี set(\"idempotencyKey\", newKey( …)) · กล่องยืนยันมีคำบอกจำนวนไม่ตรง trips-depcancel-mismatch", () => { // ORACLE-EDIT T1.6 รอบ 6
    const c = stripComments(read(`${COMP}/DepartureCancel.tsx`)); ok(c, "ไม่มี DepartureCancel.tsx"); const bad: string[] = [];
    if (!/useRef\(/.test(c)) bad.push("ไม่มี useRef (กันกดซ้ำ)"); if (/set\(\s*["']idempotencyKey["']\s*,\s*newKey\(/.test(c)) bad.push("สร้างกุญแจใหม่ทุกคลิก");
    if (!/use(State|Ref|Memo)\(\s*(\(\)\s*=>\s*)?newKey\(/.test(c)) bad.push("ไม่มีกุญแจต่อการเรนเดอร์"); if (!c.includes('"trips-depcancel-mismatch"')) bad.push("ไม่มี trips-depcancel-mismatch");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-11", "[โค้ด] H3 H6: รหัส DEPARTURE_CANCELLED_SLIP_ONLY · DEPARTURE_CANCELLED · DEPARTURE_CANCELLED_USE_RESOLVE มีข้อความของตัวเองใน bookings.reason (th/en · สามข้อความต่างกัน · ไม่ใช่ข้อความ errors.STATE_CONFLICT) และอยู่ใน REASON_CODES ของ BookingParts · ข้อความใบนี้มี \"ยังไม่มีเงินในระบบ\" และ \"ปิดแบบไม่มีเงิน\" (th) · แม่แบบการ์ดสถานะ a1 ไม่มี \"ย้ายแล้ว\"", () => { // ORACLE-EDIT T1.6 รอบ 6
    const codes = ["DEPARTURE_CANCELLED_SLIP_ONLY", "DEPARTURE_CANCELLED", "DEPARTURE_CANCELLED_USE_RESOLVE"]; const bad: string[] = [];
    for (const [L, d] of [["th", fth], ["en", fen]] as const) { const v = codes.map((k) => d[`bookings.reason.${k}`]); if (v.some((x) => !x) || new Set(v).size !== 3 || v.includes(d["errors.STATE_CONFLICT"])) bad.push(`${L}: ${fmt(v)}`); }
    const bp = read(`${COMP}/BookingParts.tsx`); for (const k of codes) if (!new RegExp(`"${k}"`).test(bp.slice(bp.indexOf("REASON_CODES"), bp.indexOf("];", bp.indexOf("REASON_CODES"))))) bad.push(`REASON_CODES ไม่มี ${k}`);
    const vals = Object.entries(fth).filter(([k]) => k.startsWith("depCancel.")); if (!vals.some(([, v]) => v.includes("ยังไม่มีเงินในระบบ"))) bad.push("ไม่มี \"ยังไม่มีเงินในระบบ\""); if (!vals.some(([, v]) => v.includes("ปิดแบบไม่มีเงิน"))) bad.push("ไม่มี \"ปิดแบบไม่มีเงิน\"");
    if (/ย้ายแล้ว/.test(fth["depCancel.status"] ?? "") || /Moved/i.test(fen["depCancel.status"] ?? "")) bad.push("การ์ดสถานะยังมี ย้ายแล้ว");
    ok(bad.length === 0, bad.join(" · "));
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (cancel-departure-core · money-core) ──");
  await st("P-1", "[บริสุทธิ์] decideByOf(now, days, tz): กรุงเทพ 2 วัน ⇒ 2027-04-17T16:59:59.999Z · 0 วัน ⇒ สิ้นวันนี้ · 00:30 กรุงเทพ (17:30Z วันก่อน) + 2 ⇒ 18 เม.ย. · โตเกียว 2 วัน ⇒ 2027-04-17T14:59:59.999Z · ลอนดอนข้ามวันเปลี่ยนเวลา (26 มี.ค. + 2 = 28 มี.ค. BST) ⇒ 2027-03-28T22:59:59.999Z · เลยวันเดินทางได้ (N7 — ไม่มีอินพุตวันเดินทาง)", () => {
    const f = (n: Date, d: number, tz: string) => isoOf(pure("decideByOf", n, d, tz));
    eq([f(NOW, 2, "Asia/Bangkok"), f(NOW, 0, "Asia/Bangkok"), f(new Date("2027-04-15T17:30:00Z"), 2, "Asia/Bangkok"), f(NOW, 2, "Asia/Tokyo"), f(new Date("2027-03-26T12:00:00Z"), 2, "Europe/London")],
      [DECIDE_BY, "2027-04-15T16:59:59.999Z", "2027-04-18T16:59:59.999Z", "2027-04-17T14:59:59.999Z", "2027-03-28T22:59:59.999Z"], "เส้นตาย");
  });
  await st("P-2", "[บริสุทธิ์] cancelOptionsOf (N9 · มติ 7): ค่าเริ่ม ⇒ [MOVE_DATE, REFUND_100] · [MOVE_DATE] ⇒ [MOVE_DATE, REFUND_100] · [CREDIT, REFUND_100] ⇒ [REFUND_100] · [REFUND_100] ⇒ [REFUND_100] · [CREDIT] ⇒ [REFUND_100]", () => {
    const f = (o: string[]) => pure("cancelOptionsOf", { options: o, autoRefundAfterDays: 2 });
    eq([f(["MOVE_DATE", "REFUND_100"]), f(["MOVE_DATE"]), f(["CREDIT", "REFUND_100"]), f(["REFUND_100"]), f(["CREDIT"])],
      [["MOVE_DATE", "REFUND_100"], ["MOVE_DATE", "REFUND_100"], ["REFUND_100"], ["REFUND_100"], ["REFUND_100"]], "ตัวเลือก");
  });
  await st("P-3", "[บริสุทธิ์] fullRefundSplitOf(ใบรับ) แบ่งตามใบรับจริง (N4): b2 ⇒ 210,000 = nonPt 210,000 + pt 0 · VAT 13,738 · b1 ⇒ 820,000 = 700,000 + 120,000 · VAT 45,794 · b11 สองใบ ⇒ 173,000 = 147,683 + 25,317 · VAT 9,661 · มี REFUNDED ⇒ หักออก · ไม่มีใบรับ ⇒ 0", () => {
    const f = (rs: Rec[]) => { const r = asRec(pure("fullRefundSplitOf", rs)) ?? {}; return [r.refundSatang, r.refundNonPtSatang, r.refundPassThroughSatang, r.refundVatSatang]; };
    const rc = (amount: number, pt: number, vat: number, kind = "RECEIVED"): Rec => ({ kind, amountSatang: amount, passThroughSatang: pt, vatSatang: vat });
    eq([f([rc(DEP_B2, 0, 13_738)]), f([rc(2 * ONE, 2 * PARK, 45_794)]), f([rc(DEP_B11, 18_000, 6_869), rc(SLIP_B11, 7_317, 2_792)]), f([rc(2 * ONE, 2 * PARK, 45_794), rc(100_000, 20_000, 5_234, "REFUNDED")]), f([])],
      [[210_000, 210_000, 0, 13_738], [820_000, 700_000, 120_000, 45_794], [173_000, 147_683, 25_317, 9_661], [720_000, 620_000, 100_000, 40_560], [0, 0, 0, 0]], "แบ่ง");
  });
  await st("P-4", "[บริสุทธิ์] cancelOutcomeOf(row, now, decideBy): PENDING ก่อนเส้นตาย ⇒ overdue false · PENDING หลังเส้นตาย (1 ms) ⇒ true · REFUND/NO_MONEY หลังเส้นตาย ⇒ false · ตรงเส้นตายพอดี ⇒ false (N1: now > decideBy)", () => {
    const f = (choice: string, now: Date) => { const r = asRec(pure("cancelOutcomeOf", { choice }, now, new Date(DECIDE_BY))) ?? {}; return [r.choice, r.overdue]; };
    const end = new Date(DECIDE_BY);
    eq([f("PENDING", NOW), f("PENDING", addMs(end, 1)), f("REFUND", addMs(end, DAY)), f("NO_MONEY", addMs(end, DAY)), f("PENDING", end)],
      [["PENDING", false], ["PENDING", true], ["REFUND", false], ["NO_MONEY", false], ["PENDING", false]], "ผล");
  });
  await st("P-5", "[บริสุทธิ์] ค่าคงที่: CANCEL_KINDS = EXTERNAL MIN_NOT_MET SHOP_FAULT · CANCEL_OUTCOMES = PENDING MOVED REFUND NO_MONEY AGENCY_MONEY_HELD · CONSENT_CHANNELS = PHONE LINE EMAIL IN_PERSON AGENT (ตรงกับ CHECK ของ migration)", () => {
    const t = needTrips();
    eq([t.CANCEL_KINDS, t.CANCEL_OUTCOMES, t.CONSENT_CHANNELS], [["EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"], ["PENDING", "MOVED", "REFUND", "NO_MONEY", "AGENCY_MONEY_HELD"], ["PHONE", "LINE", "EMAIL", "IN_PERSON", "AGENT"]], "ค่า");
  });
  groupLine("P");

  // ═══════════════ กลุ่มที่ต้องใช้ migration ═══════════════
  const MIG = await migState();
  const GROUP_N: Record<string, number> = { CD: 16, GD: 6, RF: 13, NM: 11, RC: 3, AC: 4, PG: 10, PM: 3 };
  const gated = async (g: string, title: string, body: () => Promise<void>) => {
    console.log(`\n── ${g}: ${title} ──`);
    if (!MIG.ok) { record(`${g}-0`, `[ฐาน] กลุ่ม ${g} (${GROUP_N[g]} ข้อ) ต้องใช้ migration ของ T1.6a1`, "FAIL", `migration missing — ${MIG.why}`); groupLine(g); return; }
    await body(); groupLine(g);
  };
  const cancelSvc = async (tag: string, depId: string, o: { kind?: string; reason?: string; confirm?: number; version?: number; key?: string; now?: Date; unit?: string } = {}) =>
    call("cancelDepartureWithBookings", tc(tag), { unitId: o.unit ?? uA, departureId: depId, expectedVersion: o.version ?? num((await depRow(depId)).version), kind: o.kind ?? "EXTERNAL", reason: o.reason ?? "คลื่นลมแรง ประกาศเตือนภัย",
      confirmBookings: o.confirm ?? 0, idempotencyKey: o.key ?? `cd${hex(6)}` }, { now: o.now ?? NOW });
  const resolveSvc = async (tag: string, b: Bk, choice: string, o: { reason?: string; key?: string; now?: Date; unit?: string; version?: number } = {}) =>
    call("resolveCancelledBooking", tc(tag), { unitId: o.unit ?? b.unit, bookingId: b.id, expectedVersion: o.version ?? num((await bk(b.id)).version), choice, ...(o.reason ? { reason: o.reason } : {}), idempotencyKey: o.key ?? `rs${hex(6)}` }, { now: o.now ?? NOW });
  const outRows = async (depId: string) => q<Rec>(`SELECT * FROM "TripDepartureCancelOutcome" WHERE "departureId" = $1 ORDER BY "bookingId"`, [depId]);
  const outOf = async (b: Bk): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripDepartureCancelOutcome" WHERE "bookingId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [b.id]))[0] ?? {};
  const openReqs = async (bids: string[]) => q<Rec>(`SELECT * FROM "TripRefundRequest" WHERE "bookingId" = ANY($1::text[]) AND status = ANY($2::text[])`, [bids, OPEN_REQ]);
  const flaggedOf = async (b: Bk): Promise<Rec> => (await q<Rec>(`SELECT * FROM "TripRefundRequest" WHERE "bookingId" = $1 AND computed->>'path' = 'DEPARTURE_CANCEL' ORDER BY "createdAt" DESC, id DESC LIMIT 1`, [b.id]))[0] ?? {};
  const piiOf = (bs: Bk[]) => bs.flatMap((b) => [b.phone, `ลูกค้าทดสอบ`]);
  /** รอบเล็กสำหรับข้อแยก: จ่ายเต็ม 1 + ยังไม่จ่าย 1 (จอง ณ NOW0) */
  let miniN = 0;
  const mkMini = async (tag: string, o: { minPax?: number; unpaid?: boolean; paid?: boolean; date?: string } = {}): Promise<{ dep: string; paid?: Bk; unpaid?: Bk }> => {
    miniN++; const date = o.date ?? `2027-05-${String(1 + (miniN % 28)).padStart(2, "0")}`; await mkDep(tag, date, { minPax: o.minPax ?? null, hm: `${String(6 + (miniN % 12)).padStart(2, "0")}:00` });
    const out: { dep: string; paid?: Bk; unpaid?: Bk } = { dep: D(tag) };
    if (o.paid !== false) { out.paid = await mkBk(`${tag}p`, tag); await payOk(out.paid, ONE); }
    if (o.unpaid !== false) out.unpaid = await mkBk(`${tag}u`, tag);
    return out;
  };
  // ORACLE-EDIT T1.6 รอบ 4 (F1 F2): รอบเล็กบนเส้นเวลาจริง — action ใช้นาฬิกาจริง ⇒ จองย้อน 20 วัน · ยกเลิกด้วยนาฬิกาฉีด 1 วันก่อนตอนนี้ ⇒ ใบรับที่ action บันทึกอยู่หลังแถวผลจริง
  const ymdBkk = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const mkRealMini = async (tag: string, keys: { k: string; pay: "full" | "deposit" | "none" }[]): Promise<Record<string, Bk>> => {
    const real = Date.now(); miniN++; await mkDep(tag, ymdBkk(new Date(real + 40 * DAY)), { hm: `${String(6 + (miniN % 12)).padStart(2, "0")}:30` }); const out: Record<string, Bk> = {};
    for (const x of keys) { const b = await mkBk(`${tag}${x.k}`, tag, { now: new Date(real - 20 * DAY) }); if (x.pay !== "none") await payOk(b, x.pay === "full" ? ONE : num((await dues(b.id))[0]?.amountSatang), new Date(real - 20 * DAY + 60_000)); out[x.k] = b; }
    V(await cancelSvc("oa", D(tag), { confirm: keys.length, now: new Date(real - DAY) }), `ยกเลิก ${tag}`); return out;
  };
  const MACT = await tryImport("@/lib/modules/trips/money-actions");
  const actPay = (tag: string, b: Bk, amount: number, tender: string, key?: string, reference: string | null = `QCREF${hex(4)}`) => runAction(MACT.mod?.recordTripPaymentAction, tag, `/app/u/${SLUG_A}/trips/bookings`, [SLUG_A, { bookingId: b.id, amountSatang: amount, tender, idempotencyKey: key ?? `ap${hex(6)}`, ...(reference === null ? {} : { reference }) }]); // ORACLE-EDIT T1.6 รอบ 5 (F1: reference)
  const actDecide = (tag: string, requestId: unknown, delta?: number) => runAction(MACT.mod?.decideTripRefundAction, tag, `/app/u/${SLUG_A}/trips/bookings`, [SLUG_A, { requestId, decision: "APPROVE", ...(delta !== undefined ? { manualDeltaSatang: delta, manualReason: "ปรับยอดทดสอบ" } : {}), idempotencyKey: `ad${hex(6)}` }]);
  const openMarked = async (b: Bk) => q<Rec>(`SELECT * FROM "TripRefundRequest" WHERE "bookingId" = $1 AND status = ANY($2::text[]) AND computed->>'path' = 'DEPARTURE_CANCEL' ORDER BY "createdAt" DESC, id DESC`, [b.id, OPEN_REQ]);
  const choiceAudits = async (b: Bk) => (await audits("trips.booking.cancel_choice")).filter((a) => a.targetId === b.id || JSON.stringify(a.after ?? {}).includes(b.id));
  const choiceMade = async (b: Bk) => (await outbox("trips.booking.cancel_choice_made")).filter((e) => asRec(e.payload)?.bookingId === b.id);
  // ORACLE-EDIT T1.6 รอบ 6 (H1 H2): อ่านช่องของ <form> ที่เรนเดอร์จริง (input ซ่อน/ช่อง + select ที่เลือก) ⇒ ส่งให้ action จริงตามที่จอส่ง
  const inputsOf = (frag: string): Record<string, string> => { const o: Record<string, string> = {}; for (const m of frag.matchAll(/<input\b[^>]*>/g)) { const n = /\sname="([^"]*)"/.exec(m[0])?.[1]; if (n) o[n] = decode(/\svalue="([^"]*)"/.exec(m[0])?.[1] ?? ""); }
    for (const m of frag.matchAll(/<select\b[^>]*\sname="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g)) { const body = m[2] ?? ""; const sel = /<option\b[^>]*\sselected[^>]*\svalue="([^"]*)"/.exec(body) ?? /<option\b[^>]*\svalue="([^"]*)"[^>]*\sselected/.exec(body) ?? /<option\b[^>]*\svalue="([^"]*)"/.exec(body); o[m[1] ?? ""] = decode(sel?.[1] ?? ""); } return o; };
  const actOf = (name: string, tag: string, input: Rec) => runAction(MACT.mod?.[name], tag, `/app/u/${SLUG_A}/trips/bookings`, [SLUG_A, input]);
  /** การจองที่มีคำขอติดป้าย QUOTED (ใบรับหลังยกเลิก · F1) บนเส้นเวลาจริง */
  const mkQuotedMarked = async (tag: string): Promise<{ b: Bk; c: Bk; u: Bk }> => {
    const M = await mkRealMini(tag, [{ k: "b", pay: "deposit" }, { k: "c", pay: "full" }, { k: "u", pay: "none" }]); const b = M.b as Bk, c = M.c as Bk, u = M.u as Bk;
    V(await resolveSvc("oa", c, "REFUND", { now: new Date(Date.now() - 12 * HOUR) }), `REFUND ${tag}c`); V(await actPay("pay", b, 50_000, "PROMPTPAY"), `สลิป ${tag}b`);
    V(await resolveSvc("oa", b, "REFUND", { now: new Date() }), `REFUND ${tag}b`); return { b, c, u };
  };
  let cancelledC = false;
  const needC = () => { needFix(); ok(cancelledC, "dC ยังไม่ถูกยกเลิกด้วยทางใหม่ (CD-2 ไม่ผ่าน)"); };
  const CANCEL_KEY = `cdC${hex(6)}`;

  // ═══════════════ CD. ยกเลิกรอบที่มีคน ═══════════════
  await gated("CD", "ยกเลิกรอบที่มีคน (ใบ §5.1 · C11)", async () => {
    await st("CD-1", "[บริการ] ปฏิเสธไม่เขียน (ก่อนยกเลิกจริง): confirmBookings 8 ⇒ STATE_CONFLICT BOOKINGS_CHANGED · expectedVersion เก่า ⇒ STATE_CONFLICT · kind นอกชุด / เหตุผล < 3 ⇒ VALIDATION · dS เริ่มแล้ว ⇒ DEPARTURE_STARTED · รอบหน่วยอื่น/ร้านอื่น ⇒ NOT_FOUND · ทุกกรณีรอบ/การจอง/คำขอไม่เปลี่ยน · ไม่มีแถวผล", async () => {
      needFix(); const d0 = await depRow(D("C")); const v = num(d0.version);
      codeR(await cancelSvc("oa", D("C"), { confirm: 8, version: v }), "STATE_CONFLICT", "จำนวนไม่ตรง", "BOOKINGS_CHANGED");
      codeR(await cancelSvc("oa", D("C"), { confirm: 9, version: v - 1 }), "STATE_CONFLICT", "version เก่า");
      codeR(await cancelSvc("oa", D("C"), { confirm: 9, version: v, kind: "CUSTOMER" }), "VALIDATION", "kind");
      codeR(await cancelSvc("oa", D("C"), { confirm: 9, version: v, reason: "ab" }), "VALIDATION", "เหตุผลสั้น");
      codeR(await cancelSvc("oa", D("S"), { confirm: 1 }), "DEPARTURE_STARTED", "dS");
      codeR(await cancelSvc("oa", D("X"), { confirm: 1 }), "NOT_FOUND", "รอบหน่วยอื่นผ่านหน่วย a");
      codeR(await cancelSvc("oa", D("B"), { confirm: 1, unit: uB, version: num((await depRow(D("B"))).version) }), "NOT_FOUND", "รอบร้าน B");
      const d1 = await depRow(D("C"));
      eq([d1.status, d1.version, d1.sold, d1.held, (await outRows(D("C"))).length, (await reqRow(REQ.b7old ?? "")).status, (await reqRow(REQ.b8old ?? "")).status], [d0.status, d0.version, d0.sold, d0.held, 0, "QUOTED", "APPROVED"], "ไม่เขียน");
    });
    await st("CD-2", "[บริการ] OWNER ยกเลิก dC kind EXTERNAL confirmBookings 9 ⇒ ok · รอบ CANCELLED · cancelKind EXTERNAL · cancelDecideBy = 2027-04-17T16:59:59.999Z · cancelOptions [MOVE_DATE, REFUND_100] (T22 ค่าเริ่ม) · version +1 · cancelReason/cancelledAt ตามทางเดิม", async () => {
      needFix(); const v = num((await depRow(D("C"))).version);
      V(await cancelSvc("oa", D("C"), { confirm: 9, version: v, key: CANCEL_KEY }), "ยกเลิก dC"); cancelledC = true;
      const d = await depRow(D("C"));
      eq([d.status, d.cancelKind, isoOf(d.cancelDecideBy), d.cancelOptions, num(d.version), d.cancelReason, isoOf(d.cancelledAt)], ["CANCELLED", "EXTERNAL", DECIDE_BY, ["MOVE_DATE", "REFUND_100"], v + 1, "คลื่นลมแรง ประกาศเตือนภัย", NOW.toISOString()], "รอบ");
    });
    await st("CD-3", "[ฐาน] แถวผล 9 แถว (C11 — มีเงินหรือไม่ก็ตาม): b1 b2 b3 b4 b6 b7 b8 b9 b11 ทั้งหมด PENDING · tenant/unit ถูก · at = NOW · consent null · refundRequestId null · ไม่มีแถวของ b10 h1 p1", async () => {
      needC(); const rows = await outRows(D("C"));
      eq(rows.map((r) => r.bookingId).sort(), PENDING_KEYS.map((k) => B(k).id).sort(), "การจองในตาราง");
      const bad = rows.filter((r) => r.choice !== "PENDING" || r.tenantId !== tA || r.unitId !== uA || isoOf(r.at) !== NOW.toISOString() || r.consent !== null || r.refundRequestId !== null);
      ok(bad.length === 0, `แถวผิด: ${fmt(bad.map((r) => [r.choice, isoOf(r.at), r.consent, r.refundRequestId]))}`);
    });
    await st("CD-4", "[บริการ] N10: คำขอเปิดของ b7 (CUSTOMER QUOTED) และ b8 (EXTERNAL APPROVED) ⇒ WITHDRAWN · audit trips.refund.withdraw ผู้กระทำ SYSTEM 2 แถว · ไม่มีคำขอเปิดของการจองใน dC เหลือ · แถวผลของ b7 b8 PENDING", async () => {
      needC(); eq([(await reqRow(REQ.b7old ?? "")).status, (await reqRow(REQ.b8old ?? "")).status], ["WITHDRAWN", "WITHDRAWN"], "ถอน");
      const au = (await audits("trips.refund.withdraw")).filter((a) => [REQ.b7old, REQ.b8old].includes(String(a.targetId)));
      eq([au.length, au.every((a) => a.actorType === "SYSTEM")], [2, true], `audit ${fmt(au.map((a) => a.actorType))}`);
      eq((await openReqs(PENDING_KEYS.map((k) => B(k).id))).length, 0, "คำขอเปิดเหลือ");
      eq([(await outOf(B("b7"))).choice, (await outOf(B("b8"))).choice], ["PENDING", "PENDING"], "แถวผล");
    });
    await st("CD-5", "[บริการ] ปล่อยทันที (C11): h1 (HOLD) และ p1 (PENDING) ⇒ CANCELLED · ถือที่ RELEASED · held = reserved = 0 · รายการรอ w1 ปิด (ไม่ WAITING/OFFERED) · releaseUsesTx ปิด TripResourceUse ของ dC (N14) · ค่าคงที่ที่นั่ง", async () => {
      needC(); const bad: string[] = [];
      for (const k of ["h1", "p1"]) if ((await bk(B(k).id)).status !== "CANCELLED") bad.push(`${k} ${(await bk(B(k).id)).status}`);
      const hs = await q<Rec>(`SELECT status FROM "TripHold" WHERE "departureId" = $1`, [D("C")]); if (hs.some((h) => h.status === "ACTIVE")) bad.push(`ถือที่ ${fmt(hs)}`);
      const d = await depRow(D("C")); if (num(d.held) !== 0 || num(d.reserved) !== 0) bad.push(`held ${d.held} reserved ${d.reserved}`);
      const w = (await q<Rec>(`SELECT status FROM "TripWaitlist" WHERE id = $1`, [RU.w1]))[0]?.status; if (w === "WAITING" || w === "OFFERED") bad.push(`รายการรอ ${w}`);
      if ((await q<Rec>(`SELECT active FROM "TripResourceUse" WHERE id = $1`, [RU.C]))[0]?.active !== false) bad.push("ทรัพยากรยัง active");
      ok(bad.length === 0, bad.join(" · ")); await seatInv(D("C"), "dC");
    });
    await st("CD-6", "[บริการ] C11 การจองยืนยันแล้วที่ไม่มีเงิน (b3 · b4 เอเจนซี่) คงอยู่: สถานะ CONFIRMED · ที่นั่งยังนับ (sold dC = 12) · งวดไม่ถูกยกเลิก · ไม่มี trips.booking.cancelled ของสองใบ · การจองที่มีเงินสถานะเดิม", async () => {
      needC(); eq([(await bk(B("b3").id)).status, (await bk(B("b4").id)).status, num((await depRow(D("C"))).sold)], ["CONFIRMED", "CONFIRMED", 12], "สถานะ/ที่นั่ง");
      const ds = [...(await dues(B("b3").id)), ...(await dues(B("b4").id))]; ok(ds.length > 0 && ds.every((x) => x.status !== "CANCELLED"), `งวด ${fmt(ds.map((x) => x.status))}`);
      eq((await outbox("trips.booking.cancelled")).filter((e) => [B("b3").id, B("b4").id].includes(String(asRec(e.payload)?.bookingId))).length, 0, "อีเวนต์ยกเลิก");
      eq(await Promise.all(["b1", "b2", "b6", "b9", "b11"].map(async (k) => (await bk(B(k).id)).status)), ["PAID", "PART_PAID", "PAID", "PAID", "PART_PAID"], "การจองที่มีเงิน");
    });
    await st("CD-7", "[บริการ] อีเวนต์: trips.departure.cancelled ของ dC 1 แถว (kind EXTERNAL · decideBy · affected 9 · noMoney 2 · agencyHeld 0) · trips.booking.cancel_choice_offered 9 แถว คีย์ไม่ซ้ำ · **ไม่มี decideBy** (N1) · recipient CUSTOMER ทุกใบยกเว้น b4 = AGENT + agentAccountId · options [MOVE_DATE, REFUND_100] · ไม่มีชื่อ/เบอร์ใน payload", async () => {
      needC(); const dc = (await outbox("trips.departure.cancelled")).filter((e) => asRec(e.payload)?.id === D("C") || asRec(e.payload)?.departureId === D("C"));
      ok(dc.length === 1, `departure.cancelled ${dc.length}`); const p = asRec(dc[0]?.payload) ?? {};
      eq([p.kind, isoOf(p.decideBy), p.affected, p.noMoney, p.agencyHeld], ["EXTERNAL", DECIDE_BY, 9, 2, 0], "payload รอบ");
      const of = (await outbox("trips.booking.cancel_choice_offered")).filter((e) => asRec(e.payload)?.departureId === D("C"));
      eq([of.length, new Set(of.map((e) => e.idempotencyKey)).size], [9, 9], "offered");
      const bad: string[] = [];
      for (const e of of) {
        const x = asRec(e.payload) ?? {}; const isB4 = x.bookingId === B("b4").id;
        if ("decideBy" in x) bad.push("มี decideBy"); if (x.recipient !== (isB4 ? "AGENT" : "CUSTOMER")) bad.push(`recipient ${x.recipient}`); if (isB4 && !x.agentAccountId) bad.push("b4 ไม่มี agentAccountId");
        if (!isDeepStrictEqual(x.options, ["MOVE_DATE", "REFUND_100"])) bad.push(`options ${fmt(x.options)}`);
      }
      const all = JSON.stringify([...dc, ...of].map((e) => e.payload)); for (const s of piiOf(PENDING_KEYS.map(B))) if (all.includes(s)) bad.push(`ข้อมูลบุคคล ${s}`);
      ok(bad.length === 0, [...new Set(bad)].join(" · "));
    });
    await st("CD-8", "[บริการ] audit trips.departure.cancel ของ dC: after มี CANCELLED · EXTERNAL · decideBy · จำนวนแถวผล 9 · Σ เงินที่ถือ 2,758,000 · before มีสถานะเดิม · ไม่มีชื่อ/เบอร์", async () => {
      needC(); const au = (await audits("trips.departure.cancel")).filter((a) => a.targetId === D("C")); ok(au.length === 1, `audit ${au.length}`);
      const after = JSON.stringify(au[0]?.after ?? {}), before = JSON.stringify(au[0]?.before ?? {}); const bad: string[] = [];
      for (const s of ["CANCELLED", "EXTERNAL", DECIDE_BY.slice(0, 16), String(HELD_AT_CANCEL)]) if (!after.includes(s)) bad.push(`after ไม่มี ${s}`);
      if (!/\b9\b/.test(after)) bad.push("after ไม่มีจำนวน 9"); if (!before.includes("OPEN")) bad.push(`before ${before.slice(0, 60)}`);
      for (const s of piiOf(PENDING_KEYS.map(B))) if (after.includes(s) || before.includes(s)) bad.push(`ข้อมูลบุคคล ${s}`);
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("CD-9", "[บริการ] กันซ้ำ: คีย์เดิม เนื้อหาเดิม ⇒ ok + replayed (ไม่มีแถว/อีเวนต์เพิ่ม) · คีย์เดิม เนื้อหาต่าง (kind SHOP_FAULT) ⇒ IDEMPOTENCY_CONFLICT · คีย์ใหม่บนรอบที่ยกเลิกแล้ว ⇒ FORBIDDEN_TRANSITION", async () => {
      needC(); const n0 = (await outRows(D("C"))).length, e0 = (await outbox("trips.booking.cancel_choice_offered")).length;
      const r = await cancelSvc("oa", D("C"), { confirm: 9, version: num((await depRow(D("C"))).version) - 1, key: CANCEL_KEY }); ok(r.ok === true && replayedOf(r), `ซ้ำ: ${fmt(r)}`);
      codeR(await cancelSvc("oa", D("C"), { confirm: 9, version: num((await depRow(D("C"))).version) - 1, key: CANCEL_KEY, kind: "SHOP_FAULT" }), "IDEMPOTENCY_CONFLICT", "เนื้อหาต่าง");
      codeR(await cancelSvc("oa", D("C"), { confirm: 9 }), "FORBIDDEN_TRANSITION", "ยกเลิกซ้ำ");
      eq([(await outRows(D("C"))).length, (await outbox("trips.booking.cancel_choice_offered")).length, (await depRow(D("C"))).cancelKind], [n0, e0, "EXTERNAL"], "ไม่เพิ่ม");
    });
    await st("CD-10", "[บริการ] b10 (ยกเลิกก่อนร้านยกเลิกรอบ) ไม่ถูกแตะ: CANCELLED · RETAINED = จ่าย − คืน เดิม · ไม่มีแถวผล · ไม่มีอีเวนต์ offered", async () => {
      needC(); const b = await bk(B("b10").id); const ret = (await evs(B("b10").id, "RETAINED")).reduce((s, x) => s + num(x.amountSatang), 0);
      eq([b.status, ret, num(b.paidSatang) - num(b.refundedSatang) === ret, (await q(`SELECT 1 FROM "TripDepartureCancelOutcome" WHERE "bookingId" = $1`, [B("b10").id])).length,
        (await outbox("trips.booking.cancel_choice_offered")).filter((e) => asRec(e.payload)?.bookingId === B("b10").id).length], ["CANCELLED", ret, true, 0, 0], "b10");
    });
    await st("CD-11", "[บริการ] race (ไม่มี deadlock · ไม่มี THROW/40P01 ถึงผู้เรียก · รอบละ 1 จ่ายแล้ว + 1 ยังไม่จ่าย): ยกเลิก ∥ ยกเลิก ×10 ⇒ สำเร็จ 1 · ยกเลิก ∥ requestTripRefund CUSTOMER ×5 ⇒ คำขอชนะ = ถูกถอน / ยกเลิกชนะ = DEPARTURE_CANCELLED_USE_RESOLVE · ไม่มีคำขอเปิดค้าง · ยกเลิก ∥ จองใหม่ (ถือที่) ×5 ⇒ ไม่มีถือที่ ACTIVE ค้าง · ยกเลิก ∥ รับเงินการจองที่ยังไม่จ่าย ×5 ⇒ ค่าคงที่เงิน/ที่นั่งถูก · แถวผล 2 ทุกรอบ", async () => {
      needFix(); const bad: string[] = []; const throwish = (r: Rec) => r.ok === "THROW" || /40P01|deadlock/i.test(fmt(r));
      for (let i = 0; i < 25; i++) {
        const kind = i < 10 ? "cc" : i < 15 ? "rq" : i < 20 ? "hold" : "pay";
        const m = await mkMini(`R${i}`, { date: `2027-06-${String(1 + i).padStart(2, "0")}` }); const P0 = m.paid as Bk, U0 = m.unpaid as Bk; const v = num((await depRow(m.dep)).version);
        const c1 = cancelSvc("oa", m.dep, { confirm: 2, version: v });
        const other: Promise<Rec> = kind === "cc" ? cancelSvc("oa", m.dep, { confirm: 2, version: v }) : kind === "rq" ? reqRefund(P0) : kind === "pay" ? pay(U0, ONE, { now: NOW })
          : (async () => { const ctx = staff(); const lines = [lineOf(m.dep, "PR", 1)]; const qv = asRec((await call("quoteTrips", ctx, { lines }, {})).value) ?? {};
            return call("bookTripsNow", ctx, { quote: { lines }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `rh${hex(6)}`, booker: { name: "ลูกค้าแข่ง", phone: `08${String(20_000_000 + i).slice(-8)}` }, pay: { method: "PAY_NOW" } }, {}); })();
        const [a, b] = await Promise.all([c1, other]);
        if (throwish(a) || throwish(b)) { bad.push(`${kind}#${i} THROW ${fmt(a).slice(0, 60)} ${fmt(b).slice(0, 60)}`); continue; }
        if (kind === "cc" && [a, b].filter((x) => x.ok === true).length !== 1) bad.push(`cc#${i} สำเร็จ ${[a, b].filter((x) => x.ok === true).length}`);
        if (kind !== "cc" && a.ok !== true) bad.push(`${kind}#${i} ยกเลิกไม่สำเร็จ ${fmt(a).slice(0, 80)}`);
        if (kind === "rq" && b.ok !== true && !tags(b).includes("DEPARTURE_CANCELLED_USE_RESOLVE")) bad.push(`rq#${i} ${fmt(b).slice(0, 80)}`);
        if ((await openReqs([P0.id, U0.id])).length) bad.push(`${kind}#${i} คำขอเปิดค้าง`);
        if ((await q(`SELECT 1 FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [m.dep])).length) bad.push(`${kind}#${i} ถือที่ค้าง`);
        if ((await outRows(m.dep)).length !== 2) bad.push(`${kind}#${i} แถวผล ${(await outRows(m.dep)).length}`);
        for (const x of [P0, U0]) { const mi = await moneyInv(x.id); if (mi.length) bad.push(`${kind}#${i} ${x.key} ${mi.join(",")}`); }
        try { await seatInv(m.dep, `${kind}#${i}`); } catch (e) { bad.push(errMsg(e)); }
      }
      ok(bad.length === 0, bad.slice(0, 6).join(" · "));
    });
    await st("CD-12", "[บริการ] decideBelowMin CANCEL บนรอบต่ำกว่าขั้นต่ำที่มีคน (dM · input เพิ่ม confirmBookings expectedVersion idempotencyKey · มติรอบ 2) ⇒ ทางใหม่ kind MIN_NOT_MET · แถวผล 1 · รอบต่ำกว่าขั้นต่ำที่ว่าง (dM0) ⇒ ทางเดิม (CANCELLED · cancelKind null)", async () => {
      needFix(); const v = num((await depRow(D("M"))).version);
      V(await call("decideBelowMin", tc("oa"), { unitId: uA, departureId: D("M"), decision: "CANCEL", reason: "คนไม่ครบขั้นต่ำ", confirmBookings: 1, expectedVersion: v, idempotencyKey: `bm${hex(6)}` }, { now: NOW }), "dM");
      const d = await depRow(D("M")); eq([d.status, d.cancelKind, (await outRows(D("M"))).map((r) => [r.bookingId, r.choice])], ["CANCELLED", "MIN_NOT_MET", [[B("m1").id, "PENDING"]]], "dM");
      V(await call("decideBelowMin", tc("oa"), { unitId: uA, departureId: D("M0"), decision: "CANCEL", reason: "คนไม่ครบขั้นต่ำ" }, { now: NOW }), "dM0 ว่าง");
      const d0 = await depRow(D("M0")); eq([d0.status, d0.cancelKind, d0.cancelDecideBy, d0.cancelOptions], ["CANCELLED", null, null, null], "dM0 ทางเดิม");
    });
    await st("CD-13", "[บริการ] N11 เอเจนซี่มีเงิน (b12 บน dA · แถวตรง collectMode AGENT paid 100,000): ยกเลิก dA ⇒ แถวผล AGENCY_MONEY_HELD · อีเวนต์ offered recipient AGENT · resolve REFUND / NO_MONEY ⇒ FORBIDDEN AGENCY_NOT_ENABLED · paid คงเดิม · ไม่มีคำขอ", async () => {
      needFix(); V(await cancelSvc("oa", D("A"), { confirm: 1 }), "ยกเลิก dA"); const b = B("b12");
      eq((await outOf(b)).choice, "AGENCY_MONEY_HELD", "แถวผล");
      const of = (await outbox("trips.booking.cancel_choice_offered")).filter((e) => asRec(e.payload)?.bookingId === b.id); eq(of.map((e) => asRec(e.payload)?.recipient), ["AGENT"], "offered");
      codeR(await resolveSvc("oa", b, "REFUND", { reason: "เอเจนซี่ขอคืน" }), "FORBIDDEN", "REFUND", "AGENCY_NOT_ENABLED");
      codeR(await resolveSvc("oa", b, "NO_MONEY", { reason: "เอเจนซี่ขอปิด" }), "FORBIDDEN", "NO_MONEY", "AGENCY_NOT_ENABLED");
      eq([num((await bk(b.id)).paidSatang), (await reqs(b.id)).length, (await outOf(b)).choice], [100_000, 0, "AGENCY_MONEY_HELD"], "ไม่มีเงินหาย");
    });
    // ORACLE-EDIT T1.6 รอบ 4 (รายการขาดของผู้ตรวจเงิน)
    await st("CD-14", "[บริการ] race ยกเลิก ∥ executeTripRefund ของคำขอลูกค้าที่อนุมัติไว้ก่อน (ขั้น 50% · 16–20 วันก่อนเดินทาง) ×5: สำเร็จฝ่ายเดียว — ยกเลิกชนะ ⇒ คำขอ WITHDRAWN · ไม่มี REFUNDED · แถวผล PENDING (ไม่มี DONE ตามขั้นหลังยกเลิก) · โอนคืนชนะ ⇒ DONE · การจอง CANCELLED · ยกเลิกได้ BOOKINGS_CHANGED/STATE_CONFLICT · ไม่มี THROW/40P01", async () => {
      needFix(); const bad: string[] = [];
      for (let i = 0; i < 5; i++) {
        const m = await mkMini(`EX${i}`, { unpaid: false, date: `2027-05-0${1 + i}` }); const P0 = m.paid as Bk;
        const rr = V(await reqRefund(P0), `คำขอลูกค้า EX${i}`); V(await decide(P0, rr.requestId), "อนุมัติ"); const v = num((await depRow(m.dep)).version);
        const [c, x] = await Promise.all([cancelSvc("oa", m.dep, { confirm: 1, version: v }), execute(P0, rr.requestId)]);
        if (c.ok === "THROW" || x.ok === "THROW" || /40P01|deadlock/i.test(fmt([c, x]))) { bad.push(`#${i} THROW`); continue; }
        const st0 = String((await reqRow(String(rr.requestId))).status), rf = (await evs(P0.id, "REFUNDED")).length;
        if (c.ok === true && x.ok === true) bad.push(`#${i} สำเร็จทั้งคู่ (คำขอ ${st0} REFUNDED ${rf})`);
        else if (c.ok === true) { if (st0 !== "WITHDRAWN" || rf !== 0 || (await outOf(P0)).choice !== "PENDING") bad.push(`#${i} ยกเลิกชนะแต่ ${st0}/${rf}`); }
        else if (x.ok === true) { if (st0 !== "DONE" || (await bk(P0.id)).status !== "CANCELLED" || !["BOOKINGS_CHANGED", "STATE_CONFLICT"].some((t) => tags(c).includes(t))) bad.push(`#${i} โอนชนะแต่ ${fmt(c).slice(0, 80)}`); }
        else bad.push(`#${i} ไม่สำเร็จทั้งคู่ ${fmt([c, x]).slice(0, 120)}`);
        if ((await openReqs([P0.id])).length) bad.push(`#${i} คำขอเปิดค้าง`); const mi = await moneyInv(P0.id); if (mi.length) bad.push(`#${i} ${mi.join(",")}`);
      }
      ok(bad.length === 0, bad.slice(0, 5).join(" · "));
    });
    await st("CD-15", "[บริการ] รอบต่ำกว่าขั้นต่ำที่มีแต่ถือที่ (HOLD 1 ใบ · ไม่มีการจองยืนยัน) ผ่าน decideBelowMin: st (ไม่มี refund.approve) ⇒ FORBIDDEN (หนี้ที่รับ) · OWNER + confirmBookings 0 ⇒ ทางใหม่ MIN_NOT_MET · ถือที่ปล่อย · การจอง HOLD ⇒ CANCELLED · held 0 · ไม่มีแถวผล", async () => {
      needFix(); miniN++; await mkDep("HO", "2027-05-12", { minPax: 8, hm: "14:00" }); const h = await mkBk("HOh", "HO", { pay: "PAY_NOW", now: addMs(NOW, -5 * 60_000) });
      await pool.query(`UPDATE "TripHold" SET "expiresAt" = $2 WHERE "bookingId" = $1 AND status = 'ACTIVE'`, [h.id, addMs(NOW, DAY)]); // แถวตรง: ถือที่ไม่หมดเวลา
      const inp = async () => ({ unitId: uA, departureId: D("HO"), decision: "CANCEL", reason: "คนไม่ครบขั้นต่ำ", confirmBookings: 0, expectedVersion: num((await depRow(D("HO"))).version), idempotencyKey: `ho${hex(6)}` });
      codeR(await call("decideBelowMin", tc("st"), await inp(), { now: NOW }), "FORBIDDEN", "st"); eq((await depRow(D("HO"))).status, "OPEN", "ไม่เขียน");
      V(await call("decideBelowMin", tc("oa"), await inp(), { now: NOW }), "OWNER"); const d = await depRow(D("HO"));
      eq([d.status, d.cancelKind, num(d.held), (await bk(h.id)).status, (await q(`SELECT 1 FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [D("HO")])).length, (await outRows(D("HO"))).length], ["CANCELLED", "MIN_NOT_MET", 0, "CANCELLED", 0, 0], "ผล");
    });
    await st("CD-16", "[บริการ] H5: decideBelowMin CANCEL บนรอบต่ำกว่าขั้นต่ำที่มีคน สำเร็จแล้ว เรียกซ้ำด้วยกุญแจเดิม (เนื้อหาเดิม) ⇒ ok + replayed (ตรวจกุญแจก่อน \"ยังต่ำกว่าขั้นต่ำ\") · ไม่มีแถวผล/อีเวนต์เพิ่ม", async () => { // ORACLE-EDIT T1.6 รอบ 6
      needFix(); const m = await mkMini("H5", { minPax: 8, unpaid: false }); const K = `h5${hex(6)}`; const inp = { unitId: uA, departureId: m.dep, decision: "CANCEL", reason: "คนไม่ครบขั้นต่ำ", confirmBookings: 1, expectedVersion: num((await depRow(m.dep)).version), idempotencyKey: K };
      V(await call("decideBelowMin", tc("oa"), inp, { now: NOW }), "ครั้งแรก"); const n0 = (await outRows(m.dep)).length, e0 = (await outbox("trips.booking.cancel_choice_offered")).length;
      const r = await call("decideBelowMin", tc("oa"), inp, { now: NOW }); ok(r.ok === true && replayedOf(r), `ซ้ำ: ${fmt(r)}`);
      eq([(await outRows(m.dep)).length, (await outbox("trips.booking.cancel_choice_offered")).length], [n0, e0], "ไม่เพิ่ม");
    });
  });

  // ═══════════════ GD. รั้วผู้เขียนอื่น (§6) — ก่อนงวดของ dC ถูกปิด ═══════════════
  await gated("GD", "รั้วผู้เขียนอื่นบนรอบที่ร้านยกเลิก (ใบ §6)", async () => {
    await st("GD-1", "[งาน] runPaymentDue ณ NOW + 2 วัน (หน่วยตั้ง AUTO_RELEASE ก่อนจองฟิกซ์เจอร์ ⇒ snapshot ทุกใบจด AUTO_RELEASE) ไม่เลือกการจองของ dC: งวดของ b2 b3 b11 (OPEN เลยกำหนด) ไม่เปลี่ยน · ไม่มี outbox trips.payment.* ใหม่ · ไม่มีคำขอคืนเงินใหม่ · ตัวควบคุม: การจองใหม่บน dQ (งวดเลยกำหนด) ⇒ OVERDUE + คำขอ AUTO_RELEASE", async () => {
      needC(); const qa = await mkBk("qa", "Q"); await payOk(qa, num((await dues(qa.id))[0]?.amountSatang));
      const ids = ["b2", "b3", "b11"].map((k) => B(k).id); const snap = async () => fmt(await q<Rec>(`SELECT "bookingId", seq, status FROM "TripPaymentDue" WHERE "bookingId" = ANY($1::text[]) ORDER BY "bookingId", seq`, [ids]));
      const s0 = await snap(); const r0 = (await q(`SELECT 1 FROM "TripRefundRequest" WHERE "bookingId" = ANY($1::text[])`, [ids])).length;
      const ev = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type LIKE 'trips.payment.%' AND payload->>'bookingId' = ANY($2::text[])`, [tA, ids]))[0]?.n ?? 0; const e0 = await ev();
      const act = await q<{ a: string | null }>(`SELECT "policySnapshot"->'policy'->'trips'->'values'->>'trips.pay.overdueAction' AS a FROM "TripBooking" WHERE id = ANY($1::text[])`, [[...ids, qa.id]]);
      ok(act.length === 4 && act.every((x) => x.a === "AUTO_RELEASE"), `snapshot ไม่ได้จด AUTO_RELEASE (ฟิกซ์เจอร์ผิด): ${fmt(act)}`); // ORACLE-EDIT T1.6 รอบ 3
      const j = asRec(await fn("runPaymentDue")(addMs(NOW, 2 * DAY), { tenantIds: [tA] })) ?? {}; ok(num(j.overdue) >= 1 && num(j.autoReleased) >= 1, `งาน: ${fmt(j)}`);
      eq([await snap() === s0, (await q(`SELECT 1 FROM "TripRefundRequest" WHERE "bookingId" = ANY($1::text[])`, [ids])).length - r0, await ev() - e0], [true, 0, 0], "dC ไม่ถูกแตะ");
      const qd = await dues(qa.id); const qr0 = await reqs(qa.id); ok(qd.some((d) => d.status === "OVERDUE") && qr0.length === 1 && qr0[0]?.by === "SYSTEM" && qr0[0]?.reasonKind === "CUSTOMER", `ตัวควบคุม qa ${fmt(qr0.map((x) => [x.by, x.reasonKind, x.status]))}: งวด ${fmt(qd.map((d) => d.status))} คำขอ ${(await reqs(qa.id)).length}`);
    });
    await st("GD-2", "[บริการ] ของเดิมที่ทำเป็นข้อสอบ (N14) บน dC: bookTripsNow (PAY_LATER/PAY_NOW) · placeHold · joinWaitlist ⇒ ปฏิเสธ · approveTripBooking p1 ⇒ ปฏิเสธ · convertHold ถือที่ของ h1 ⇒ ปฏิเสธ · runExpireHolds / runMinPaxCheck / offerWaitlistForDeparture ⇒ ไม่เปลี่ยนรอบ · ตัวนับ/จำนวนการจองไม่เปลี่ยน", async () => {
      needC(); const d0 = await depRow(D("C")); const n0 = (await q(`SELECT 1 FROM "TripBooking" WHERE "departureId" = $1`, [D("C")])).length; const bad: string[] = [];
      const ctx = staff(); const lines = [lineOf(D("C"), "PR", 1)]; const qr = await call("quoteTrips", ctx, { lines }, {}); const qv = asRec(qr.value) ?? {};
      for (const m of ["PAY_LATER", "PAY_NOW"]) { const r = qr.ok === true ? await call("bookTripsNow", ctx, { quote: { lines }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `g2${hex(5)}`, booker: { name: "ลูกค้าใหม่", phone: "0811112222" }, pay: { method: m } }, {}) : qr; if (r.ok === true) bad.push(`bookTripsNow ${m} สำเร็จ`); }
      if ((await call("placeHold", ctx, { departureId: D("C"), qty: 1, idempotencyKey: `g2h${hex(5)}` })).ok === true) bad.push("placeHold สำเร็จ");
      if ((await call("joinWaitlist", ctx, { departureId: D("C"), qty: 1, partyId: rid("pty"), idempotencyKey: `g2w${hex(5)}` })).ok === true) bad.push("joinWaitlist สำเร็จ");
      if ((await call("approveTripBooking", ctx, { bookingId: B("p1").id, expectedVersion: num((await bk(B("p1").id)).version), decision: "APPROVE" })).ok === true) bad.push("approve p1 สำเร็จ");
      const hid = (await q<Rec>(`SELECT id FROM "TripHold" WHERE "bookingId" = $1`, [B("h1").id]))[0]?.id; if (hid && (await call("convertHold", ctx, { holdId: hid, idempotencyKey: `g2c${hex(5)}` })).ok === true) bad.push("convertHold สำเร็จ");
      await call("runExpireHolds", addMs(NOW, DAY), { tenantIds: [tA] }); await call("runMinPaxCheck", addMs(NOW, DAY), { tenantIds: [tA] });
      const off = WAIT.mod?.offerWaitlistForDeparture; if (typeof off === "function") { try { await (off as AnyFn)(tA, uA, D("C"), NOW, "qc.t16"); } catch { /* ปฏิเสธได้ */ } }
      const d1 = await depRow(D("C"));
      if (d1.status !== "CANCELLED" || num(d1.sold) !== num(d0.sold) || num(d1.held) !== 0 || num(d1.version) !== num(d0.version)) bad.push(`รอบเปลี่ยน ${fmt([d1.status, d1.sold, d1.held, d1.version])}`);
      if ((await q(`SELECT 1 FROM "TripBooking" WHERE "departureId" = $1`, [D("C")])).length !== n0) bad.push("มีการจองใหม่");
      if ((await q(`SELECT 1 FROM "TripWaitlist" WHERE "departureId" = $1 AND status IN ('WAITING','OFFERED')`, [D("C")])).length) bad.push("รายการรอเปิด");
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("GD-3", "[บริการ] returnSold / moveSold มือ (trips.seat.manage) บน dC ⇒ ปฏิเสธ · ตัวนับ dC และ dQ ไม่เปลี่ยน", async () => {
      needC(); const c0 = await depRow(D("C")), q0 = await depRow(D("Q")); const ctx = staff();
      const r1 = await call("returnSold", ctx, { departureId: D("C"), qty: 1 }); const r2 = await call("moveSold", ctx, { fromDepartureId: D("C"), toDepartureId: D("Q"), qty: 1 });
      ok(r1.ok === false && r2.ok === false, `returnSold ${fmt(r1)} · moveSold ${fmt(r2)}`);
      const c1 = await depRow(D("C")), q1 = await depRow(D("Q")); eq([c1.sold, c1.version, q1.sold], [c0.sold, c0.version, q0.sold], "ตัวนับ");
    });
    await st("GD-4", "[บริการ] setDepartureStatus (OPEN) / setDepartureCapacity / assignResource บน dC ⇒ ปฏิเสธ (ของเดิม) · รอบไม่เปลี่ยน", async () => {
      needC(); const c0 = await depRow(D("C")); const res = (await q<Rec>(`SELECT "resourceId" FROM "TripResourceUse" WHERE id = $1`, [RU.C]))[0]?.resourceId;
      const rs = [await call("setDepartureStatus", tc("oa"), { unitId: uA, departureId: D("C"), status: "OPEN" }, { now: NOW }), await call("setDepartureCapacity", tc("oa"), { unitId: uA, departureId: D("C"), capacity: 30 }, { now: NOW }),
        await call("assignResource", tc("oa"), { unitId: uA, departureId: D("C"), resourceId: res })];
      ok(rs.every((r) => r.ok === false), fmt(rs)); const c1 = await depRow(D("C")); eq([c1.status, c1.capacity, c1.version], [c0.status, c0.capacity, c0.version], "รอบ");
    });
    await st("GD-5", "[บริการ] เปลี่ยนการจองข้ามรอบที่ร้านยกเลิก: changeTripBooking b1 (dC → dQ ราคาเท่ากัน) ⇒ ปฏิเสธ (ทางเดียวคือ resolve) · การจอง q1 (dQ → dC) ⇒ ปฏิเสธ · cancelTripBooking b1 EXECUTE ⇒ STATE_CONFLICT DEPARTURE_CANCELLED_USE_RESOLVE · ไม่เขียน", async () => {
      needC(); const ctx = staff(); const chg = async (b: Bk, to: string) => { const ln = lineOf(to, "PR", (await q<{ n: number }>(`SELECT sum(qty)::int AS n FROM "TripBookingItem" WHERE "bookingId" = $1 AND kind = 'SEAT' AND active`, [b.id]))[0]?.n ?? 1);
        const qt = await call("quoteTrips", ctx, { lines: [ln] }, {}); const qv = asRec(qt.value) ?? {};
        return call("changeTripBooking", ctx, { bookingId: b.id, expectedVersion: num((await bk(b.id)).version), line: ln, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `g5${hex(6)}` }, {}); };
      const r1 = await chg(B("b1"), D("Q")), r2 = await chg(B("q1"), D("C")); ok(r1.ok === false && r2.ok === false, `b1→dQ ${fmt(r1)} · q1→dC ${fmt(r2)}`);
      codeR(await call("cancelTripBooking", ctx, { bookingId: B("b1").id, mode: "EXECUTE", reason: "ลูกค้าขอยกเลิก", idempotencyKey: `g5c${hex(5)}` }), "STATE_CONFLICT", "cancelTripBooking", "DEPARTURE_CANCELLED_USE_RESOLVE");
      eq([(await bk(B("b1").id)).departureId, (await bk(B("b1").id)).status, (await bk(B("q1").id)).departureId, (await reqs(B("b1").id)).length], [D("C"), "PAID", D("Q"), 0], "ไม่เขียน");
    });
    // ORACLE-EDIT T1.6 รอบ 4 (รายการขาดของผู้ตรวจเงิน)
    await st("GD-6", "[งาน] คิวเตือนงวด (runPaymentDue · trips.pay.reminderDaysBefore [7, 1] ตั้งชั่วคราว) ข้ามรอบที่ร้านยกเลิก: รอบ RM1 (ยกเลิก) กับ RM2 (ตัวควบคุม) จ่ายมัดจำแล้ว งวดที่ 2 ครบ 2027-04-30 · งาน ณ 2027-04-24 ⇒ RM2 ได้ trips.payment.due_soon · RM1 ไม่ได้ · งวด RM1 ไม่เปลี่ยน", async () => {
      needFix(); const mk = async (tag: string) => { await mkDep(tag, "2027-05-20", { hm: tag === "RM1" ? "09:10" : "09:20" }); const b = await mkBk(`${tag}b`, tag); await payOk(b, num((await dues(b.id))[0]?.amountSatang)); return b; };
      const r1 = await mk("RM1"), r2 = await mk("RM2"); V(await cancelSvc("oa", D("RM1"), { confirm: 1 }), "ยกเลิก RM1");
      const dueIds = async (b: Bk) => (await dues(b.id)).map((d) => String(d.id)); const soon = async (b: Bk) => { const ids = await dueIds(b); return (await outbox("trips.payment.due_soon")).filter((e) => ids.some((x) => e.idempotencyKey.includes(x))).length; };
      const s1 = fmt(await dues(r1.id)); await setV(tA, "oa", [unitSet(uA, "trips.pay.reminderDaysBefore", [7, 1])]);
      try { await fn("runPaymentDue")(new Date("2027-04-24T05:00:00Z"), { tenantIds: [tA] }); } finally { await setV(tA, "oa", [unitSet(uA, "trips.pay.reminderDaysBefore", [])]); }
      eq([await soon(r2) >= 1, await soon(r1), fmt(await dues(r1.id)) === s1], [true, 0, true], "เตือน");
    });
  });

  // ═══════════════ RF. คืนเงินเต็ม (N4 N5 N9) ═══════════════
  await gated("RF", "คืนเงินเต็ม (ใบ §4.1 §5.2)", async () => {
    const flagOk = (r: Rec, amount: number, kind: string, pt?: number): string[] => {
      const c = asRec(r.computed) ?? {}; const bad: string[] = [];
      if (r.status !== "APPROVED" && r.status !== "DONE") bad.push(`status ${r.status}`); if (num(r.amountSatang) !== amount) bad.push(`amount ${r.amountSatang} ≠ ${amount}`);
      if (r.reasonKind !== kind) bad.push(`reasonKind ${r.reasonKind}`); if (c.path !== "DEPARTURE_CANCEL" || c.fullRefund !== true || num(c.refundBp) !== 10_000) bad.push(`computed ${fmt([c.path, c.fullRefund, c.refundBp])}`);
      if (pt !== undefined && num(c.refundPassThroughSatang) !== pt) bad.push(`pt ${c.refundPassThroughSatang} ≠ ${pt}`);
      return bad;
    };
    await st("RF-1", "[บริการ] resolve REFUND b2 (มัดจำ TRIP_ONLY) ⇒ คำขอ APPROVED ทันที 210,000 · reasonKind EXTERNAL · computed.path DEPARTURE_CANCEL · fullRefund · refundBp 10000 · pt 0 · audit trips.refund.approve ผู้กระทำ SYSTEM · แถวผล REFUND + refundRequestId · ไม่ผ่าน X12", async () => {
      needC(); V(await resolveSvc("oa", B("b2"), "REFUND"), "REFUND b2"); const r = await flaggedOf(B("b2"));
      const bad = flagOk(r, DEP_B2, "EXTERNAL", 0); const o = await outOf(B("b2")); if (o.choice !== "REFUND" || o.refundRequestId !== r.id) bad.push(`แถวผล ${fmt([o.choice, o.refundRequestId])}`);
      const au = (await audits("trips.refund.approve")).filter((a) => a.targetId === r.id); if (!au.some((a) => a.actorType === "SYSTEM")) bad.push("ไม่มี audit อนุมัติของ SYSTEM");
      ok(bad.length === 0, bad.join(" · ")); REQ.b2 = String(r.id);
    });
    await st("RF-2", "[บริการ] resolve REFUND b6 (มีหลักฐานซื้อค่าอุทยาน) ⇒ 410,000 (เก็บแทน 60,000 คืนด้วย) · b7 ⇒ 410,000 (ไม่ใช่ 0 ของตารางลูกค้า) · b8 ⇒ 410,000 (ไม่ใช่ 235,000 ของ T21 50%) · ทุกใบมีป้าย · แถวผล REFUND", async () => {
      needC(); const bad: string[] = [];
      for (const k of ["b6", "b7", "b8"]) { const r0 = await resolveSvc("oa", B(k), "REFUND"); if (r0.ok !== true) { bad.push(`${k}: ${fmt(r0)}`); continue; } const r = await flaggedOf(B(k)); bad.push(...flagOk(r, ONE, "EXTERNAL", PARK).map((x) => `${k} ${x}`)); REQ[k] = String(r.id); if ((await outOf(B(k))).choice !== "REFUND") bad.push(`${k} แถวผล`); }
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("RF-3", "[บริการ] B3 ทางทั่วไปปิดบน b1 (PENDING): requestTripRefund เหตุ CUSTOMER และ EXTERNAL ⇒ STATE_CONFLICT DEPARTURE_CANCELLED_USE_RESOLVE · ทางลูกค้า verify → quoteBookSelfCancel ⇒ ok:false DEPARTURE_CANCELLED_USE_RESOLVE · ไม่มีคำขอเกิด", async () => {
      needC(); const b = B("b1");
      codeR(await reqRefund(b), "STATE_CONFLICT", "CUSTOMER", "DEPARTURE_CANCELLED_USE_RESOLVE"); codeR(await reqRefund(b, { reasonKind: "EXTERNAL" }), "STATE_CONFLICT", "EXTERNAL", "DEPARTURE_CANCELLED_USE_RESOLVE");
      const sq = await selfQuote(b, NOW); ok(sq.ok === false && fmt(sq).includes("DEPARTURE_CANCELLED_USE_RESOLVE"), `ทางลูกค้า: ${fmt(sq)}`);
      eq((await reqs(b.id)).length, 0, "คำขอ");
    });
    await st("RF-4", "[บริการ] B2 requote คง 100%: คำขอ b6 APPROVED → เพิ่ม TripPassThroughEvidence ใหม่ (ข้อเท็จจริงเปลี่ยน) → executeTripRefund ⇒ ok หรือ QUOTE_REFRESHED ยอด 410,000 แล้วอนุมัติซ้ำให้เอง (ไม่ค้าง QUOTED) · execute ซ้ำได้ ⇒ DONE · REFUNDED 410,000 (pt 60,000) · การจอง CANCELLED · ค่าคงที่เงิน", async () => {
      needC(); const b = B("b6"), id = REQ.b6; ok(id, "RF-2 ไม่ผ่าน");
      await insertRow("TripPassThroughEvidence", { id: rid("ev"), tenantId: tA, unitId: uA, departureId: D("C"), bookingId: b.id, extraKind: "PARK_FEE", paidToPayee: "กรมอุทยาน (ใบที่ 2)", amountSatang: 0, paidAt: addMs(NOW, HOUR), fileIds: [], updatedAt: new Date() });
      const x1 = await execute(b, id, { now: addMs(NOW, 2 * HOUR) }); const bad: string[] = [];
      if (x1.ok !== true) { if (!tags(x1).includes("QUOTE_REFRESHED") || num(asRec(x1.details)?.amountSatang) !== ONE) bad.push(`execute 1: ${fmt(x1)}`); const r = await reqRow(String(id)); if (r.status !== "APPROVED" || num(r.amountSatang) !== ONE) bad.push(`หลัง requote ${r.status}/${r.amountSatang}`);
        const x2 = await execute(b, id, { now: addMs(NOW, 3 * HOUR) }); if (x2.ok !== true) bad.push(`execute 2: ${fmt(x2)}`); }
      const rf = await evs(b.id, "REFUNDED"); const r = await reqRow(String(id));
      eq([bad, r.status, rf.reduce((s, x) => s + num(x.amountSatang), 0), rf.reduce((s, x) => s + num(x.passThroughSatang), 0), (await bk(b.id)).status, await moneyInv(b.id)], [[], "DONE", ONE, PARK, "CANCELLED", []], "b6");
    });
    await st("RF-5", "[บริการ] execute end-to-end การจ่ายบางส่วน TRIP_ONLY (b2): DONE · REFUNDED 210,000 pt 0 ตามใบรับ (ไม่ OVER_REFUND) · งวดที่เหลือ CANCELLED · การจอง CANCELLED · ที่นั่งคืน 2 · ค่าคงที่เงิน/ที่นั่ง · b7 execute ⇒ DONE 410,000", async () => {
      needC(); const s0 = num((await depRow(D("C"))).sold); const x = await execute(B("b2"), REQ.b2); ok(x.ok === true, `execute b2: ${fmt(x)}`);
      const rf = await evs(B("b2").id, "REFUNDED"); const ds = await dues(B("b2").id);
      eq([rf.reduce((s, y) => s + num(y.amountSatang), 0), rf.reduce((s, y) => s + num(y.passThroughSatang), 0), (await bk(B("b2").id)).status, ds.filter((d) => num(d.paidSatang) < num(d.amountSatang)).every((d) => d.status === "CANCELLED"), s0 - num((await depRow(D("C"))).sold), await moneyInv(B("b2").id)],
        [DEP_B2, 0, "CANCELLED", true, 2, []], "b2");
      ok((await execute(B("b7"), REQ.b7)).ok === true, "execute b7"); eq([(await reqRow(REQ.b7 ?? "")).status, (await bk(B("b7").id)).status], ["DONE", "CANCELLED"], "b7"); await seatInv(D("C"), "dC");
    });
    await st("RF-6", "[บริการ] decideTripRefund บนคำขอที่มีป้าย (แถวตรง: คำขอ b8 กลับ QUOTED): manualDeltaSatang −1 และ +1 ⇒ VALIDATION DEPARTURE_CANCEL_FULL_REFUND ไม่เขียน · อนุมัติไม่มี delta ⇒ APPROVED 410,000", async () => {
      needC(); const id = REQ.b8; ok(id, "RF-2 ไม่ผ่าน"); await pool.query(`UPDATE "TripRefundRequest" SET status = 'QUOTED' WHERE id = $1`, [id]);
      codeR(await decide(B("b8"), id, { delta: -1 }), "VALIDATION", "delta −1", "DEPARTURE_CANCEL_FULL_REFUND"); codeR(await decide(B("b8"), id, { delta: 1 }), "VALIDATION", "delta +1", "DEPARTURE_CANCEL_FULL_REFUND");
      eq([(await reqRow(id)).status, num((await reqRow(id)).amountSatang)], ["QUOTED", ONE], "ไม่เขียน");
      V(await decide(B("b8"), id), "อนุมัติ"); eq([(await reqRow(id)).status, num((await reqRow(id)).amountSatang), num((await reqRow(id)).manualDeltaSatang)], ["APPROVED", ONE, 0], "อนุมัติ");
    });
    await st("RF-7", "[บริการ] N9 + N1: สินค้า PR2 ตั้ง T22 = [MOVE_DATE] · 0 วัน ⇒ ยกเลิก dC2 (SHOP_FAULT) ⇒ cancelOptions [MOVE_DATE, REFUND_100] · decideBy = สิ้นวัน 15 เม.ย. · resolve REFUND ณ เลยเส้นตาย 2 วัน ⇒ ได้ (APPROVED 410,000 · SHOP_FAULT)", async () => {
      needFix(); await mkDep("C2", "2027-04-28", { prod: "PR2" }); const c1 = await mkBk("c1", "C2", { prod: "PR2" }); await payOk(c1, ONE); await mkBk("c2", "C2", { prod: "PR2", promo: PROMO });
      V(await cancelSvc("oa", D("C2"), { kind: "SHOP_FAULT", confirm: 2 }), "ยกเลิก dC2"); const d = await depRow(D("C2"));
      eq([d.cancelOptions, isoOf(d.cancelDecideBy)], [["MOVE_DATE", "REFUND_100"], "2027-04-15T16:59:59.999Z"], "รอบ");
      V(await resolveSvc("oa", c1, "REFUND", { now: addMs(NOW, 2 * DAY) }), "REFUND หลังเส้นตาย"); const bad = flagOk(await flaggedOf(c1), ONE, "SHOP_FAULT"); ok(bad.length === 0, bad.join(" · "));
    });
    await st("RF-8", "[บริการ] withdrawTripRefund คำขอที่มีป้ายของ b8 (ผู้มีสิทธิ์อนุมัติ · canDecide) ⇒ WITHDRAWN · แถวผลกลับ PENDING · resolve REFUND ใหม่ (คีย์ใหม่) ⇒ คำขอใหม่ APPROVED 410,000 · แถวผลชี้คำขอใหม่", async () => {
      needC(); const old = REQ.b8; ok(old, "RF-6 ไม่ผ่าน");
      V(await call("withdrawTripRefund", staff(), { requestId: old, reason: "ลูกค้าขอเปลี่ยนใจ", idempotencyKey: `w${hex(6)}` }, { canDecide: true }), "ถอน");
      eq([(await reqRow(old)).status, (await outOf(B("b8"))).choice], ["WITHDRAWN", "PENDING"], "หลังถอน");
      V(await resolveSvc("oa", B("b8"), "REFUND"), "ยื่นใหม่"); const r = await flaggedOf(B("b8")); ok(r.id !== old, "ไม่ใช่คำขอใหม่");
      const bad = flagOk(r, ONE, "EXTERNAL"); const o = await outOf(B("b8")); if (o.choice !== "REFUND" || o.refundRequestId !== r.id) bad.push(`แถวผล ${fmt([o.choice, o.refundRequestId])}`); ok(bad.length === 0, bad.join(" · ")); REQ.b8 = String(r.id);
    });
    await st("RF-9", "[หน้า] ลิ้นชักการจอง (BookingDrawer เรนเดอร์จริง · VM ณ เวลาฉีด): คำขอที่อนุมัติแล้วยังไม่บันทึกโอน (b8) ณ อนุมัติ + 3 วัน 1 นาที ⇒ มี trips-bk-refund-transfer-due · ณ + 2 วัน ⇒ ไม่มี (N5 · ภายในร้าน)", async () => {
      needC(); const at = (await audits("trips.refund.approve")).filter((a) => a.targetId === REQ.b8).map((a) => new Date(String(a.createdAt)).getTime()); ok(at.length, "ไม่มี audit อนุมัติของคำขอ b8");
      const t0 = NOW.getTime(); // บริการอนุมัติด้วยนาฬิกาฉีด NOW
      eq([has(await drawerAt("oa", B("b8"), new Date(t0 + 3 * DAY + 60_000)), "trips-bk-refund-transfer-due"), has(await drawerAt("oa", B("b8"), new Date(t0 + 2 * DAY)), "trips-bk-refund-transfer-due")], [true, false], "คำเตือน");
    });
    // ORACLE-EDIT T1.6 รอบ 3 (ข้อเบี่ยง 1–2 ของผู้สร้าง): requote ของคำขอที่มีป้าย ⇒ ยังเต็ม · จบที่ APPROVED · audit บอกว่าใคร/อะไรอนุมัติ
    await st("RF-10", "[บริการ] requote ของคำขอมีป้าย (รอบเล็ก RQ): resolve REFUND (ผู้ยื่น USER = OWNER) → เพิ่มหลักฐานเก็บแทน → execute ⇒ QUOTE_REFRESHED ยอด 410,000 · คำขอ APPROVED · fullRefund · refundBp 10000 · gen ≥ 1 · audit: trips.refund.request (USER ผู้กด) · trips.refund.approve ≥ 2 แถว SYSTEM ผู้กระทำ trips.departureCancel.autoApprove (F3) · trips.refund.requote ≥ 1 และ after.status = สถานะแถวจริง APPROVED (F3) · execute ซ้ำ ⇒ DONE 410,000", async () => {
      needFix(); const m = await mkMini("RQ", { unpaid: false }); V(await cancelSvc("oa", m.dep, { confirm: 1 }), "ยกเลิก RQ"); const b = m.paid as Bk;
      V(await resolveSvc("oa", b, "REFUND"), "REFUND"); const r0 = await flaggedOf(b); const id = String(r0.id);
      await insertRow("TripPassThroughEvidence", { id: rid("ev"), tenantId: tA, unitId: uA, departureId: m.dep, bookingId: b.id, extraKind: "PARK_FEE", paidToPayee: "กรมอุทยาน", amountSatang: PARK, paidAt: addMs(NOW, HOUR), fileIds: [], updatedAt: new Date() });
      const x1 = await execute(b, id, { now: addMs(NOW, 2 * HOUR) }); const bad: string[] = [];
      if (x1.ok === true) bad.push("execute แรกสำเร็จโดยไม่ requote (หลักฐานใหม่ไม่ถูกนับเป็นข้อเท็จจริงเปลี่ยน)"); else if (!tags(x1).includes("QUOTE_REFRESHED") || num(asRec(x1.details)?.amountSatang) !== ONE) bad.push(`execute แรก ${fmt(x1)}`);
      const r1 = await reqRow(id); const c1 = asRec(r1.computed) ?? {};
      if (r1.status !== "APPROVED" || num(r1.amountSatang) !== ONE || c1.fullRefund !== true || num(c1.refundBp) !== 10_000 || !(num(c1.gen) >= 1)) bad.push(`หลัง requote ${fmt([r1.status, r1.amountSatang, c1.fullRefund, c1.refundBp, c1.gen])}`);
      const au = async (a: string) => (await audits(a)).filter((x) => x.targetId === id);
      const rq = await au("trips.refund.request"), apv = await au("trips.refund.approve"), rqt = await au("trips.refund.requote");
      if (!(rq.length === 1 && rq[0]?.actorType === "USER" && rq[0]?.actorId === U.oa?.userId)) bad.push(`audit ยื่น ${fmt(rq.map((x) => [x.actorType, x.actorId]))}`);
      const isAA = (x: Rec) => x.actorType === "SYSTEM" && (x.actorId === "trips.departureCancel.autoApprove" || JSON.stringify(x.after ?? {}).includes("trips.departureCancel.autoApprove")); // ORACLE-EDIT T1.6 รอบ 4 (F3)
      if (!(apv.length >= 2 && apv.every(isAA))) bad.push(`audit อนุมัติ (F3 ต้องเป็น trips.departureCancel.autoApprove) ${fmt(apv.map((x) => [x.actorType, x.actorId, asRec(x.after)?.auto]))}`);
      if (rqt.length < 1 || !rqt.every((x) => asRec(x.after)?.status === r1.status)) bad.push(`audit requote (F3 after.status = ${r1.status}) ${fmt(rqt.map((x) => asRec(x.after)?.status))}`);
      const x2 = await execute(b, id, { now: addMs(NOW, 3 * HOUR) }); if (x2.ok !== true) bad.push(`execute ซ้ำ ${fmt(x2)}`);
      const rf = (await evs(b.id, "REFUNDED")).reduce((s0, x) => s0 + num(x.amountSatang), 0);
      eq([bad, (await reqRow(id)).status, rf], [[], "DONE", ONE], "requote");
    });
    // ORACLE-EDIT T1.6 รอบ 4 (F4 F5 F6)
    await st("RF-11", "[บริการ] F4: resolve REFUND ด้วยกุญแจ K ⇒ คำขอ r1 · ถอน r1 (canDecide) · เรียกซ้ำด้วยกุญแจ K ⇒ ไม่ replay ความสำเร็จเก่า (ได้ STATE_CONFLICT หรือผลปัจจุบันที่ไม่ใช่ replayed) · แถวผลไม่ชี้ r1 · คำขอใหม่ไม่เกิน 1 ใบ", async () => {
      needFix(); const m = await mkMini("IK", { unpaid: false }); V(await cancelSvc("oa", m.dep, { confirm: 1 }), "ยกเลิก IK"); const b = m.paid as Bk; const K = `ik${hex(6)}`;
      V(await resolveSvc("oa", b, "REFUND", { key: K }), "REFUND"); const r1 = String((await flaggedOf(b)).id);
      V(await call("withdrawTripRefund", staff(), { requestId: r1, reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: `w${hex(6)}` }, { canDecide: true }), "ถอน");
      const n0 = (await reqs(b.id)).length; const r = await resolveSvc("oa", b, "REFUND", { key: K }); const o = await outOf(b); const bad: string[] = [];
      if (r.ok === true && replayedOf(r)) bad.push(`replay ความสำเร็จเก่า ${fmt(r).slice(0, 100)}`); if (r.ok !== true && !tags(r).includes("STATE_CONFLICT")) bad.push(`ผล ${fmt(r).slice(0, 100)}`);
      if (o.refundRequestId === r1) bad.push("แถวผลชี้คำขอที่ถอนแล้ว"); if ((await reqs(b.id)).length - n0 > 1) bad.push("คำขอเพิ่มเกิน 1");
      if (r.ok === true && (o.choice !== "REFUND" || !o.refundRequestId)) bad.push(`ok แต่แถวผล ${fmt([o.choice, o.refundRequestId])}`);
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("RF-12", "[หน้า] F5: คำเตือนโอนค้างนับจากการอนุมัติครั้งแรก — คำขอมีป้ายอนุมัติ ณ NOW · requote ณ NOW + 4 วัน (หลักฐานใหม่ → execute ⇒ QUOTE_REFRESHED อนุมัติซ้ำ) · ลิ้นชัก ณ NOW + 5 วัน (1 วันหลัง requote) ⇒ ยังมี trips-bk-refund-transfer-due", async () => {
      needFix(); const m = await mkMini("WT", { unpaid: false }); V(await cancelSvc("oa", m.dep, { confirm: 1 }), "ยกเลิก WT"); const b = m.paid as Bk;
      V(await resolveSvc("oa", b, "REFUND"), "REFUND"); const id = String((await flaggedOf(b)).id);
      await insertRow("TripPassThroughEvidence", { id: rid("ev"), tenantId: tA, unitId: uA, departureId: m.dep, bookingId: b.id, extraKind: "PARK_FEE", paidToPayee: "กรมอุทยาน", amountSatang: PARK, paidAt: addMs(NOW, DAY), fileIds: [], updatedAt: new Date() });
      const x = await execute(b, id, { now: addMs(NOW, 4 * DAY) }); ok(x.ok !== true && tags(x).includes("QUOTE_REFRESHED") && (await reqRow(id)).status === "APPROVED", `requote ไม่เกิด ${fmt(x).slice(0, 100)}`);
      ok(has(await drawerAt("oa", b, addMs(NOW, 5 * DAY)), "trips-bk-refund-transfer-due"), "ไม่มีคำเตือน (นับจาก requote แทนการอนุมัติครั้งแรก)");
    });
    await st("RF-13", "[บริการ] F6: การจองสกุลเงินอื่น (แถวตรง: USD หลังยกเลิกรอบ) ⇒ resolve REFUND ถูกปฏิเสธด้วยรหัสชัด (CURRENCY_NOT_ALLOWED / CURRENCY_NOT_THB) · ไม่มีคำขอ · แถวผล PENDING", async () => {
      needFix(); const m = await mkMini("FX", { unpaid: false }); V(await cancelSvc("oa", m.dep, { confirm: 1 }), "ยกเลิก FX"); const b = m.paid as Bk;
      await pool.query(`UPDATE "TripBooking" SET currency = 'USD', "fxRateMicros" = 36000000 WHERE id = $1`, [b.id]); // แถวตรง (สกุลอื่นยังสร้างผ่านบริการไม่ได้ · L1.x)
      const r = await resolveSvc("oa", b, "REFUND"); ok(r.ok === false && ["CURRENCY_NOT_ALLOWED", "CURRENCY_NOT_THB"].some((t) => tags(r).includes(t)), `ผล ${fmt(r)}`);
      eq([(await reqs(b.id)).length, (await outOf(b)).choice], [0, "PENDING"], "ไม่เขียน");
    });
  });

  // ═══════════════ NM. ทางไม่มีเงิน / เงินเข้าหลังยกเลิก ═══════════════
  await gated("NM", "ทางไม่มีเงิน · เงินเข้าหลังยกเลิก (ใบ §4.3–§4.5)", async () => {
    await st("NM-1", "[บริการ] ทางเลือกผิดทาง ⇒ ไม่เขียน: REFUND บน b3 (ไม่มีเงิน) ⇒ VALIDATION NO_MONEY_USE_CLOSE · NO_MONEY บน b1 (มีเงิน) ⇒ VALIDATION HAS_MONEY_USE_REFUND · MOVE บน b1 ⇒ VALIDATION MOVE_NOT_AVAILABLE_YET (a1) · NO_MONEY b4 (เอเจนซี่) ไม่มีเหตุผล ⇒ VALIDATION · expectedVersion เก่า ⇒ STATE_CONFLICT · การจองหน่วยอื่น ⇒ NOT_FOUND", async () => {
      needC(); codeR(await resolveSvc("oa", B("b3"), "REFUND"), "VALIDATION", "REFUND ไม่มีเงิน", "NO_MONEY_USE_CLOSE"); codeR(await resolveSvc("oa", B("b1"), "NO_MONEY"), "VALIDATION", "NO_MONEY มีเงิน", "HAS_MONEY_USE_REFUND");
      codeR(await resolveSvc("oa", B("b1"), "MOVE"), "VALIDATION", "MOVE", "MOVE_NOT_AVAILABLE_YET"); codeR(await resolveSvc("oa", B("b4"), "NO_MONEY"), "VALIDATION", "เอเจนซี่ไม่มีเหตุผล");
      codeR(await resolveSvc("oa", B("b3"), "NO_MONEY", { version: num((await bk(B("b3").id)).version) - 1 }), "STATE_CONFLICT", "version เก่า");
      codeR(await resolveSvc("oa", B("x1"), "REFUND", { unit: uA }), "NOT_FOUND", "หน่วยอื่น");
      eq([(await outOf(B("b1"))).choice, (await outOf(B("b3"))).choice, (await outOf(B("b4"))).choice, (await bk(B("b3").id)).status, (await reqs(B("b1").id)).length], ["PENDING", "PENDING", "PENDING", "CONFIRMED", 0], "ไม่เขียน");
    });
    await st("NM-2", "[บริการ] settleNoMoneyInTx ผ่าน resolve NO_MONEY: b3 ⇒ CANCELLED · ที่นั่ง −1 · งวดเปิด ⇒ CANCELLED · แถวผล NO_MONEY by STAFF · trips.booking.cancelled + cancel_choice_made NO_MONEY · audit trips.booking.cancel_choice · b4 (มีเหตุผล) ⇒ เช่นเดียวกัน · c2 (dC2 มีโค้ด) ⇒ โปรโมชัน RELEASED · ยื่นซ้ำ ⇒ STATE_CONFLICT CHOICE_ALREADY_MADE", async () => {
      needC(); const s0 = num((await depRow(D("C"))).sold); const bad: string[] = [];
      V(await resolveSvc("oa", B("b3"), "NO_MONEY"), "b3"); V(await resolveSvc("oa", B("b4"), "NO_MONEY", { reason: "เอเจนซี่แจ้งลูกค้าไม่ไปแล้ว" }), "b4");
      for (const k of ["b3", "b4"]) {
        const b = B(k); const o = await outOf(b); if (o.choice !== "NO_MONEY" || o.by !== "STAFF") bad.push(`${k} แถวผล ${o.choice}/${o.by}`);
        if ((await bk(b.id)).status !== "CANCELLED") bad.push(`${k} สถานะ`); if ((await dues(b.id)).some((d) => d.status === "OPEN" || d.status === "OVERDUE")) bad.push(`${k} งวดเปิด`);
        if (!(await outbox("trips.booking.cancelled")).some((e) => asRec(e.payload)?.bookingId === b.id)) bad.push(`${k} ไม่มี booking.cancelled`);
        if (!(await outbox("trips.booking.cancel_choice_made")).some((e) => asRec(e.payload)?.bookingId === b.id && asRec(e.payload)?.choice === "NO_MONEY")) bad.push(`${k} ไม่มี choice_made`);
        if (!(await audits("trips.booking.cancel_choice")).some((a) => a.targetId === b.id || JSON.stringify(a.after ?? {}).includes(b.id))) bad.push(`${k} ไม่มี audit`);
      }
      if (s0 - num((await depRow(D("C"))).sold) !== 3) bad.push(`ที่นั่งคืน ${s0 - num((await depRow(D("C"))).sold)} (ต้อง 3)`);
      codeR(await resolveSvc("oa", B("b3"), "NO_MONEY"), "STATE_CONFLICT", "ซ้ำ", "CHOICE_ALREADY_MADE");
      if (BK.c2) { V(await resolveSvc("oa", B("c2"), "NO_MONEY"), "c2"); const pr = await q<Rec>(`SELECT status FROM "TripPromoRedemption" WHERE "bookingId" = $1`, [B("c2").id]); if (pr.map((x) => x.status).join() !== "RELEASED") bad.push(`c2 โปรโมชัน ${fmt(pr)}`); } else bad.push("ไม่มี c2 (RF-7 ไม่ผ่าน)");
      ok(bad.length === 0, bad.join(" · ")); await seatInv(D("C"), "dC");
    });
    await st("NM-3", "[บริการ] N13 เงินเข้าหลังยกเลิก (b11): resolve REFUND ⇒ APPROVED 123,000 · recordTripPayment สลิป 50,000 (STAFF) ⇒ ok · คำขอเดิม WITHDRAWN และคำขอใหม่ QUOTED 173,000 (มีป้าย · F1 ใบรับหลังยกเลิก ⇒ ไม่อนุมัติให้เอง) ในธุรกรรมเดียว · แถวผลชี้คำขอใหม่ · ผู้อนุมัติอนุมัติ ⇒ APPROVED · execute ⇒ DONE · REFUNDED pt = Σ pt ของใบรับ 2 ใบ · ไม่ OVER_REFUND · ค่าคงที่เงิน", async () => {
      needC(); const b = B("b11"); V(await resolveSvc("oa", b, "REFUND"), "REFUND"); const r1 = await flaggedOf(b); eq([r1.status, num(r1.amountSatang)], ["APPROVED", DEP_B11], "คำขอแรก");
      V(await pay(b, SLIP_B11, { now: addMs(NOW, HOUR) }), "สลิปหลังยกเลิก");
      const r2 = await flaggedOf(b); const bad: string[] = [];
      if ((await reqRow(String(r1.id))).status !== "WITHDRAWN") bad.push(`คำขอแรก ${(await reqRow(String(r1.id))).status}`); if (r2.id === r1.id || r2.status !== "QUOTED" || num(r2.amountSatang) !== DEP_B11 + SLIP_B11) bad.push(`คำขอใหม่ ${fmt([r2.status, r2.amountSatang])} (F1: ต้อง QUOTED)`); // ORACLE-EDIT T1.6 รอบ 4 (F1)
      const dz = await decide(b, r2.id, { now: addMs(NOW, 90 * 60_000) }); if (dz.ok !== true || (await reqRow(String(r2.id))).status !== "APPROVED" || num((await reqRow(String(r2.id))).amountSatang) !== DEP_B11 + SLIP_B11) bad.push(`อนุมัติ ${fmt(dz)}`); // ORACLE-EDIT T1.6 รอบ 4 (F1)
      const o = await outOf(b); if (o.choice !== "REFUND" || o.refundRequestId !== r2.id) bad.push(`แถวผล ${fmt([o.choice, o.refundRequestId])}`);
      const x = await execute(b, r2.id, { now: addMs(NOW, 2 * HOUR) }); if (x.ok !== true) bad.push(`execute ${fmt(x)}`);
      const rec = await evs(b.id, "RECEIVED"), rf = await evs(b.id, "REFUNDED"); const sum = (a: Rec[], f: string) => a.reduce((s, y) => s + num(y[f]), 0);
      if (sum(rf, "amountSatang") !== DEP_B11 + SLIP_B11 || sum(rf, "passThroughSatang") !== sum(rec, "passThroughSatang")) bad.push(`REFUNDED ${sum(rf, "amountSatang")}/pt ${sum(rf, "passThroughSatang")} ≠ ใบรับ pt ${sum(rec, "passThroughSatang")}`);
      ok(bad.length === 0, bad.join(" · ")); eq([(await bk(b.id)).status, await moneyInv(b.id)], ["CANCELLED", []], "b11");
    });
    await st("NM-4", "[บริการ] tripPaymentIntent บนการจองของรอบที่ร้านยกเลิก (b9) ⇒ STATE_CONFLICT DEPARTURE_CANCELLED (ไม่ขอเงินเพิ่ม) · ตัวควบคุม: q2 ไม่โดนรั้วนี้", async () => {
      needC(); codeR(await call("tripPaymentIntent", staff(), { bookingId: B("b9").id }), "STATE_CONFLICT", "b9", "DEPARTURE_CANCELLED");
      ok(!tags(await call("tripPaymentIntent", staff(), { bookingId: B("q2").id })).includes("DEPARTURE_CANCELLED"), "q2 โดนรั้ว");
    });
    await st("NM-5", "[บริการ] สลิปบนการจองที่ไม่มีคำขอเปิด (c1 · dC2 แถวผล REFUND แล้วโอนคืนเสร็จ) ⇒ รับไม่ได้เกินยอด (paid ≤ payable ของเดิม) · ค่าคงที่เงิน", async () => {
      needFix(); const c1 = B("c1"); const r = await flaggedOf(c1); ok(r.id, "RF-7 ไม่ผ่าน"); V(await execute(c1, r.id), "execute c1");
      ok((await pay(c1, 1_000, { now: addMs(NOW, 3 * DAY) })).ok === false, "รับเงินบนการจองที่คืนแล้ว"); eq(await moneyInv(c1.id), [], "c1");
    });
    // ORACLE-EDIT T1.6 รอบ 3 (ข้อเบี่ยง 3 6 ของผู้สร้าง): สองคนกดพร้อมกัน · expectedVersion เก่า · สลิปหลังยกเลิกขณะมีคำขอเปิด (ล้มต้องไม่เสียของ)
    await st("NM-6", "[บริการ] สองคนกดทางออกการจองเดียวกันพร้อมกัน ×4 รอบ (OWNER ∥ wild REFUND บนการจองจ่ายแล้ว · OWNER ∥ cxl NO_MONEY บนการจองยังไม่จ่าย) ⇒ สำเร็จ 1 อีกฝ่าย STATE_CONFLICT (ไม่ THROW) · คำขอมีป้าย 1 ใบ · แถวผลเดียว · ก่อนนั้น expectedVersion −1 / +5 ⇒ STATE_CONFLICT ไม่เขียน", async () => {
      needFix(); const bad: string[] = [];
      for (let i = 0; i < 4; i++) {
        const m = await mkMini(`CR${i}`, { date: `2027-07-${String(1 + i).padStart(2, "0")}` }); V(await cancelSvc("oa", m.dep, { confirm: 2 }), `ยกเลิก CR${i}`); const P0 = m.paid as Bk, U0 = m.unpaid as Bk;
        if (i === 0) { const v = num((await bk(P0.id)).version); for (const vv of [v - 1, v + 5]) { const r = await resolveSvc("oa", P0, "REFUND", { version: vv }); if (!(r.ok === false && r.code === "STATE_CONFLICT")) bad.push(`version ${vv - v}: ${fmt(r).slice(0, 80)}`); } if ((await reqs(P0.id)).length || (await outOf(P0)).choice !== "PENDING") bad.push("version เก่าเขียน"); }
        for (const [b, c, t2] of [[P0, "REFUND", "wild"], [U0, "NO_MONEY", "cxl"]] as const) {
          const v = num((await bk(b.id)).version); const rs = await Promise.all([resolveSvc("oa", b, c, { version: v }), resolveSvc(t2, b, c, { version: v })]);
          const okN = rs.filter((r) => r.ok === true).length, sc = rs.filter((r) => r.ok === false && r.code === "STATE_CONFLICT").length;
          if (okN !== 1 || sc !== 1) bad.push(`#${i} ${c}: ${fmt(rs).slice(0, 140)}`);
          if ((await q(`SELECT 1 FROM "TripDepartureCancelOutcome" WHERE "bookingId" = $1`, [b.id])).length !== 1 || (await outOf(b)).choice !== c) bad.push(`#${i} ${c} แถวผล ${(await outOf(b)).choice}`);
        }
        const fr = await q(`SELECT 1 FROM "TripRefundRequest" WHERE "bookingId" = $1 AND computed->>'path' = 'DEPARTURE_CANCEL'`, [P0.id]); if (fr.length !== 1) bad.push(`#${i} คำขอมีป้าย ${fr.length}`);
        try { await seatInv(m.dep, `CR${i}`); } catch (e) { bad.push(errMsg(e)); }
      }
      ok(bad.length === 0, bad.slice(0, 6).join(" · "));
    });
    await st("NM-7", "[บริการ] N13 สลิปหลังยกเลิกขณะมีคำขอมีป้ายเปิด (รอบเล็ก SL · มัดจำ 30%): สลิปที่ล้ม (เกินยอดค้าง) ⇒ ok:false · คำขอเดิมยัง APPROVED เปิดใบเดียว แถวผลชี้ใบเดิม paid เดิม (ย้อนครบ) · สลิป 50,000 ⇒ เปิดใบเดียว = ใบใหม่ ยอดมัดจำ + 50,000 สถานะ QUOTED (F1) · ใบเดิม WITHDRAWN · ส่งซ้ำคีย์เดิม ⇒ ไม่มีคำขอเพิ่ม · ค่าคงที่เงิน", async () => {
      needFix(); await mkDep("SL", "2027-07-10"); const b = await mkBk("SLp", "SL"); const dep0 = num((await dues(b.id))[0]?.amountSatang); await payOk(b, dep0);
      V(await cancelSvc("oa", D("SL"), { confirm: 1 }), "ยกเลิก SL"); V(await resolveSvc("oa", b, "REFUND"), "REFUND"); const r1 = await flaggedOf(b); const bad: string[] = [];
      const openOf = async () => q<Rec>(`SELECT id, status, "amountSatang" FROM "TripRefundRequest" WHERE "bookingId" = $1 AND status = ANY($2::text[])`, [b.id, OPEN_REQ]);
      const p0 = num((await bk(b.id)).paidSatang); const over = b.payable - p0 + 1;
      const f1 = await pay(b, over, { now: addMs(NOW, HOUR) }); if (f1.ok === true) bad.push(`สลิปเกินยอดรับได้ ${fmt(f1)}`);
      const o1 = await openOf(); if (o1.length !== 1 || o1[0]?.id !== r1.id || o1[0]?.status !== "APPROVED" || num((await bk(b.id)).paidSatang) !== p0 || (await outOf(b)).refundRequestId !== r1.id) bad.push(`หลังสลิปล้ม ${fmt(o1)} paid ${(await bk(b.id)).paidSatang}`);
      const key = `sl${hex(6)}`; V(await pay(b, SLIP_B11, { now: addMs(NOW, 2 * HOUR), key }), "สลิป 50,000");
      const o2 = await openOf(); if (o2.length !== 1 || o2[0]?.id === r1.id || num(o2[0]?.amountSatang) !== dep0 + SLIP_B11 || o2[0]?.status !== "QUOTED" /* ORACLE-EDIT T1.6 รอบ 4 (F1) */ || (await reqRow(String(r1.id))).status !== "WITHDRAWN" || (await outOf(b)).refundRequestId !== o2[0]?.id) bad.push(`หลังสลิป ${fmt(o2)} เดิม ${(await reqRow(String(r1.id))).status}`);
      const n2 = (await reqs(b.id)).length; const rp = await pay(b, SLIP_B11, { now: addMs(NOW, 2 * HOUR), key }); if (rp.ok !== true) bad.push(`ส่งซ้ำ ${fmt(rp)}`);
      if ((await reqs(b.id)).length !== n2 || (await openOf()).length !== 1 || num((await bk(b.id)).paidSatang) !== p0 + SLIP_B11) bad.push("ส่งซ้ำแล้วคำขอ/เงินเพิ่ม");
      eq([bad, await moneyInv(b.id)], [[], []], "สลิป");
    });
    // ORACLE-EDIT T1.6 รอบ 4 (F1 F2) — รอบบนเส้นเวลาจริง (action ใช้นาฬิกาจริง)
    await st("NM-8", "[action+บริการ] F1(ก) ตามที่สร้าง (มติรอบ 5): บนรอบที่ร้านยกเลิก ผู้มีแต่ trips.payment.record (recordTripPaymentAction): เงินสด / บัตร ⇒ STATE_CONFLICT DEPARTURE_CANCELLED_SLIP_ONLY แม้มีเลขอ้างอิง · พร้อมเพย์/โอนไม่มีเลขอ้างอิง (ไม่ส่ง หรือช่องว่าง) ⇒ ปฏิเสธเช่นกัน · พร้อมเพย์/โอนมีเลขอ้างอิง ⇒ รับได้ · บริการ: เงินสดปฏิเสธ · พร้อมเพย์มีเลขอ้างอิงรับได้ · ที่ปฏิเสธไม่เขียนอะไร", async () => { // ORACLE-EDIT T1.6 รอบ 5
      needFix(); const M = await mkRealMini("SO", [{ k: "a", pay: "deposit" }]); const b = M.a as Bk; const bad: string[] = [];
      const p0 = num((await bk(b.id)).paidSatang), e0 = (await evs(b.id)).length; const slipOnly = (r: Rec) => r.ok === false && tags(r).includes("STATE_CONFLICT") && tags(r).includes("DEPARTURE_CANCELLED_SLIP_ONLY");
      for (const [t, ref] of [["CASH", "REF123"], ["CARD", "REF123"], ["CASH", null], ["PROMPTPAY", null], ["TRANSFER", null], ["PROMPTPAY", "   "], ["TRANSFER", ""]] as const) { const r = await actPay("pay", b, 10_000, t, undefined, ref); if (!(slipOnly(r) || (ref === "" && r.ok === false && r.code === "VALIDATION" /* ORACLE-EDIT T1.6 รอบ 5: ช่องว่างล้วนถูก schema ของ reference ปฏิเสธก่อน = ปฏิเสธเหมือนกัน */))) bad.push(`action ${t} ref=${fmt(ref)}: ${fmt(r).slice(0, 100)}`); }
      const sv = await pay(b, 10_000, { now: new Date(), tender: "CASH", reference: "REF123" }); if (!slipOnly(sv)) bad.push(`บริการ CASH: ${fmt(sv).slice(0, 100)}`);
      if (num((await bk(b.id)).paidSatang) !== p0 || (await evs(b.id)).length !== e0) bad.push(`ที่ปฏิเสธเขียน: paid ${(await bk(b.id)).paidSatang} แถว ${(await evs(b.id)).length}`);
      const s1 = await pay(b, 10_000, { now: new Date() }); if (s1.ok !== true) bad.push(`บริการ PROMPTPAY + เลขอ้างอิง: ${fmt(s1).slice(0, 100)}`);
      const a1 = await actPay("pay", b, 10_000, "TRANSFER"); if (a1.ok !== true) bad.push(`action TRANSFER + เลขอ้างอิง: ${fmt(a1).slice(0, 100)}`);
      const a2 = await actPay("pay", b, 10_000, "PROMPTPAY"); if (a2.ok !== true) bad.push(`action PROMPTPAY + เลขอ้างอิง: ${fmt(a2).slice(0, 100)}`);
      if (num((await bk(b.id)).paidSatang) !== p0 + 30_000) bad.push(`รับได้ ${num((await bk(b.id)).paidSatang) - p0} (ต้อง 30,000)`);
      ok(bad.length === 0, bad.join(" · ")); eq(await moneyInv(b.id), [], "ค่าคงที่เงิน");
    });
    await st("NM-9", "[action+บริการ] F1(ข): ใบรับหลังเวลาแถวผล ⇒ คำขอคืนเต็มไม่อนุมัติให้เอง — (1) มีคำขอติดป้าย APPROVED แล้ว pay สลิป ⇒ เปิดใบเดียว QUOTED ยอดใหม่เต็ม (2) ไม่มีคำขอ pay สลิปแล้ว resolve REFUND ⇒ QUOTED · ผู้ไม่มี refund.approve (req) อนุมัติไม่ได้ (FORBIDDEN) · ปรับยอดไม่ได้ · ผู้มี refund.approve (sta) อนุมัติ ⇒ APPROVED เต็ม 100% · execute บน QUOTED ⇒ ไม่อนุมัติ · สลิปซ้ำบน QUOTED ⇒ ยื่นใหม่ยัง QUOTED · ตัวควบคุม: ไม่มีใบรับหลังยกเลิก ⇒ อนุมัติให้เอง", async () => {
      needFix(); const M = await mkRealMini("PQ", [{ k: "a", pay: "deposit" }, { k: "b", pay: "deposit" }, { k: "c", pay: "full" }]); const A = M.a as Bk, Bb = M.b as Bk, C = M.c as Bk; const bad: string[] = [];
      const pre = new Date(Date.now() - 12 * HOUR);
      V(await resolveSvc("oa", A, "REFUND", { now: pre }), "REFUND a ก่อนรับเงิน"); V(await resolveSvc("oa", C, "REFUND", { now: pre }), "REFUND c (ตัวควบคุม)");
      if ((await flaggedOf(A)).status !== "APPROVED" || (await flaggedOf(C)).status !== "APPROVED") bad.push(`ตัวควบคุม: ${(await flaggedOf(A)).status}/${(await flaggedOf(C)).status} (ไม่มีใบรับหลังยกเลิก ⇒ ต้อง APPROVED)`);
      V(await actPay("pay", A, 50_000, "PROMPTPAY"), "สลิป a"); const oa1 = await openMarked(A); const paidA = num((await bk(A.id)).paidSatang);
      if (oa1.length !== 1 || oa1[0]?.status !== "QUOTED" || num(oa1[0]?.amountSatang) !== paidA) bad.push(`(1) เปิด ${fmt(oa1.map((x) => [x.status, x.amountSatang]))} ต้อง QUOTED ${paidA} ใบเดียว`);
      V(await actPay("pay", Bb, 50_000, "PROMPTPAY"), "สลิป b"); if ((await reqs(Bb.id)).length) bad.push("(2) รับเงินแล้วเกิดคำขอเอง");
      V(await resolveSvc("oa", Bb, "REFUND", { now: new Date() }), "REFUND b หลังรับเงิน"); const rb = await flaggedOf(Bb); const paidB = num((await bk(Bb.id)).paidSatang);
      if (rb.status !== "QUOTED" || num(rb.amountSatang) !== paidB || asRec(rb.computed)?.fullRefund !== true) bad.push(`(2) resolve ${fmt([rb.status, rb.amountSatang, asRec(rb.computed)?.fullRefund])}`);
      const xq = await execute(Bb, rb.id, { now: new Date() }); if (xq.ok === true || (await reqRow(String(rb.id))).status !== "QUOTED") bad.push(`execute บน QUOTED: ${fmt(xq).slice(0, 80)} → ${(await reqRow(String(rb.id))).status}`);
      V(await actPay("pay", Bb, 10_000, "PROMPTPAY"), "สลิปซ้ำ b"); const ob2 = await openMarked(Bb); if (ob2.length !== 1 || ob2[0]?.status !== "QUOTED" || num(ob2[0]?.amountSatang) !== paidB + 10_000) bad.push(`สลิปซ้ำ ${fmt(ob2.map((x) => [x.status, x.amountSatang]))}`);
      const qa1 = String(oa1[0]?.id ?? "");
      const nr = await actDecide("req", qa1); if (!(nr.ok !== true && (nr.code === "FORBIDDEN" || /forbidden|ไม่มีสิทธิ์/i.test(String(nr.e ?? ""))))) bad.push(`req อนุมัติได้ ${fmt(nr).slice(0, 80)}`);
      const dl = await actDecide("sta", qa1, -1); if (!(dl.ok === false && tags(dl).includes("DEPARTURE_CANCEL_FULL_REFUND"))) bad.push(`ปรับยอด ${fmt(dl).slice(0, 80)}`);
      V(await actDecide("sta", qa1), "sta อนุมัติ"); const ra = await reqRow(qa1); if (ra.status !== "APPROVED" || num(ra.amountSatang) !== paidA || num(asRec(ra.computed)?.refundBp) !== 10_000) bad.push(`หลังอนุมัติ ${fmt([ra.status, ra.amountSatang])}`);
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("NM-10", "[บริการ] F2: การยื่นใหม่หลังรับเงิน (มีคำขอติดป้ายเปิด) เขียน audit trips.booking.cancel_choice +1 และ outbox trips.booking.cancel_choice_made +1 (คีย์ใหม่ ไม่ถูกกลืนเป็นซ้ำ) ที่ payload.refundRequestId = คำขอใหม่ · ยอดใหม่อยู่ที่คำขอที่ payload ชี้ (ORACLE-EDIT T1.6 รอบ 5: payload ไม่มีช่องยอด — §8 / F2 ระบุแค่ refundRequestId)", async () => {
      needFix(); const M = await mkRealMini("RE", [{ k: "a", pay: "deposit" }]); const b = M.a as Bk;
      V(await resolveSvc("oa", b, "REFUND", { now: new Date(Date.now() - 12 * HOUR) }), "REFUND"); const a0 = (await choiceAudits(b)).length, e0 = await choiceMade(b);
      V(await pay(b, 30_000, { now: new Date() }), "สลิป"); const nw = (await openMarked(b))[0]; ok(nw, "ไม่มีคำขอเปิดหลังรับเงิน");
      const e1 = await choiceMade(b); const last = asRec(e1[e1.length - 1]?.payload) ?? {};
      eq([(await choiceAudits(b)).length - a0, e1.length - e0.length, new Set(e1.map((e) => e.idempotencyKey)).size === e1.length, last.refundRequestId, num((await reqRow(String(last.refundRequestId ?? ""))).amountSatang)], [1, 1, true, nw?.id, num((await bk(b.id)).paidSatang)], "audit/อีเวนต์");
    });
    await st("NM-11", "[บริการ] H7: เงินที่เข้ากิ่ง \"รอบที่ร้านยกเลิก\" นับเป็นหลังยกเลิกเสมอ — ยกเลิก ณ NOW แล้ว recordTripPayment ด้วยนาฬิกาคำขอ NOW − 1 นาที (พร้อมเพย์ + เลขอ้างอิง): (1) ไม่มีคำขอ ⇒ resolve REFUND ⇒ QUOTED (2) มีคำขอติดป้าย APPROVED ⇒ ยื่นใหม่ ⇒ QUOTED (ไม่อนุมัติให้เอง)", async () => { // ORACLE-EDIT T1.6 รอบ 6
      needFix(); await mkDep("H7", "2027-07-15"); const x = await mkBk("H7x", "H7"), y = await mkBk("H7y", "H7"); for (const b of [x, y]) await payOk(b, num((await dues(b.id))[0]?.amountSatang));
      V(await cancelSvc("oa", D("H7"), { confirm: 2 }), "ยกเลิก H7"); V(await resolveSvc("oa", y, "REFUND", { now: addMs(NOW, 60_000) }), "REFUND y ก่อนรับเงิน"); const bad: string[] = [];
      if ((await flaggedOf(y)).status !== "APPROVED") bad.push(`ตัวควบคุม y ${(await flaggedOf(y)).status}`);
      for (const b of [x, y]) V(await pay(b, 20_000, { now: addMs(NOW, -60_000) }), `สลิปนาฬิกาเก่า ${b.key}`);
      const oy = await openMarked(y); if (oy.length !== 1 || oy[0]?.status !== "QUOTED") bad.push(`(2) ${fmt(oy.map((r) => r.status))} ต้อง QUOTED ใบเดียว`);
      V(await resolveSvc("oa", x, "REFUND", { now: addMs(NOW, HOUR) }), "REFUND x"); if ((await flaggedOf(x)).status !== "QUOTED") bad.push(`(1) ${(await flaggedOf(x)).status} ต้อง QUOTED`);
      ok(bad.length === 0, bad.join(" · "));
    });
  });

  // ═══════════════ RC. กระทบยอด ═══════════════
  await gated("RC", "กระทบยอด dC (ใบ §4.6)", async () => {
    await st("RC-1", "[บริการ+ฐาน] ปิดที่เหลือ: resolve REFUND b1 b9 · execute ทุกคำขอ APPROVED ของ dC ⇒ ทุกแถวผล ≠ PENDING (REFUND 7 · NO_MONEY 2) · ทุกการจอง CANCELLED · refunded = paid (REFUND) · paid 0 (NO_MONEY) · ไม่มี RETAINED · b9 โปรโมชัน RELEASED", async () => {
      needC(); for (const k of ["b1", "b9"]) V(await resolveSvc("oa", B(k), "REFUND"), `REFUND ${k}`);
      for (const k of PENDING_KEYS) { const r = await flaggedOf(B(k)); if (r.status === "APPROVED") ok((await execute(B(k), r.id, { now: addMs(NOW, 4 * HOUR) })).ok === true, `execute ${k}`); }
      const rows = await outRows(D("C")); const cnt = (c: string) => rows.filter((r) => r.choice === c).length; const bad: string[] = [];
      if (cnt("REFUND") !== 7 || cnt("NO_MONEY") !== 2) bad.push(`ผล ${fmt(rows.map((r) => r.choice))}`);
      for (const k of PENDING_KEYS) { const b = await bk(B(k).id); const nm = k === "b3" || k === "b4"; if (b.status !== "CANCELLED" || (nm ? num(b.paidSatang) !== 0 : num(b.refundedSatang) !== num(b.paidSatang)) || (await evs(B(k).id, "RETAINED")).length) bad.push(`${k} ${b.status} ${b.paidSatang}/${b.refundedSatang}`); }
      if ((await q<Rec>(`SELECT status FROM "TripPromoRedemption" WHERE "bookingId" = $1`, [B("b9").id])).map((x) => x.status).join() !== "RELEASED") bad.push("b9 โปรโมชัน");
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("RC-2", "[ฐาน] ต่อรอบ dC: Σ เงินที่รับ = 2,808,000 = Σ REFUNDED (คืนทั้งหมด · a1 ไม่มีย้าย) · sold/held/reserved = 0 · ค่าคงที่ที่นั่ง · ทุกการจองค่าคงที่เงิน", async () => {
      needC(); const ids = PENDING_KEYS.map((k) => B(k).id);
      const s = (await q<{ p: number; r: number }>(`SELECT sum("paidSatang")::int AS p, sum("refundedSatang")::int AS r FROM "TripBooking" WHERE id = ANY($1::text[])`, [ids]))[0];
      const rf = (await q<{ n: number }>(`SELECT COALESCE(sum("amountSatang"),0)::int AS n FROM "TripMoneyEvent" WHERE "bookingId" = ANY($1::text[]) AND kind = 'REFUNDED'`, [ids]))[0]?.n;
      const d = await depRow(D("C")); eq([s?.p, s?.r, rf, num(d.sold), num(d.held), num(d.reserved)], [HELD_AFTER_SLIP, HELD_AFTER_SLIP, HELD_AFTER_SLIP, 0, 0, 0], "กระทบยอด");
      await seatInv(D("C"), "dC"); for (const id of ids) eq(await moneyInv(id), [], `ค่าคงที่ ${id}`);
    });
    await st("RC-3", "[ฐาน] ทุกคำขอที่มีป้ายของ dC ที่ DONE: refundBp 10000 · fullRefund · ยอด = paid − refunded ณ ยื่น (= paid) · pt ของคำขอ = Σ pt ของใบรับ · ไม่มีคำเตือน OVER_REFUND", async () => {
      needC(); const bad: string[] = [];
      for (const k of PENDING_KEYS.filter((x) => x !== "b3" && x !== "b4")) {
        const r = await flaggedOf(B(k)); const c = asRec(r.computed) ?? {}; const rec = await evs(B(k).id, "RECEIVED"); const pt = rec.reduce((s, x) => s + num(x.passThroughSatang), 0), paid = rec.reduce((s, x) => s + num(x.amountSatang), 0);
        if (r.status !== "DONE" || num(c.refundBp) !== 10_000 || c.fullRefund !== true || num(r.amountSatang) !== paid || num(c.refundPassThroughSatang) !== pt || /OVER_REFUND/.test(fmt(c.warnings))) bad.push(`${k} ${fmt([r.status, c.refundBp, r.amountSatang, paid, c.refundPassThroughSatang, pt])}`);
      }
      ok(bad.length === 0, bad.join(" · "));
    });
  });

  // ═══════════════ AC. action (ทางจริงของจอ) ═══════════════
  const CACT = await tryImport("@/lib/modules/trips/cancel-departure-actions");
  const DSA = await tryImport("@/lib/modules/trips/departure-screen-actions");
  const formOf = (o: Record<string, string | number>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, String(v)); return f; };
  const actCancel = (tag: string, fields: Record<string, string | number>) => runAction(CACT.mod?.cancelDepartureWithBookingsAction, tag, `/app/u/${SLUG_A}/trips/departures`, [SLUG_A, formOf(fields)]);
  const actResolve = (tag: string, fields: Record<string, string | number>) => runAction(CACT.mod?.resolveCancelledBookingAction, tag, `/app/u/${SLUG_A}/trips/bookings`, [SLUG_A, formOf(fields)]);
  const cancelFields = async (depId: string, o: Record<string, string | number> = {}) => ({ departureId: depId, kind: "EXTERNAL", reason: "คลื่นลมแรงทดสอบจอ", confirmBookings: 2, expectedVersion: num((await depRow(depId)).version), idempotencyKey: `ac${hex(6)}`, ...o });
  const resolveFields = async (b: Bk, choice: string, o: Record<string, string | number> = {}) => ({ bookingId: b.id, expectedVersion: num((await bk(b.id)).version), choice, idempotencyKey: `ar${hex(6)}`, ...o });
  const noMoney = (r: Rec) => !/\b(410000|4,100|4100)\b/.test(fmt(r));
  let AC: { dep: string; paid?: Bk; unpaid?: Bk } | null = null;
  await gated("AC", "server action ด้วย FormData (ใบ §5.3 §9)", async () => {
    await st("AC-1", "[action] cancelDepartureWithBookingsAction(slug, FormData) บนรอบ dAC (1 จ่าย + 1 ยังไม่จ่าย) โดย OWNER: ทุกฟิลด์ถูกอ่าน — confirmBookings 1 ⇒ BOOKINGS_CHANGED · expectedVersion เก่า ⇒ STATE_CONFLICT · kind SHOP_FAULT ⇒ cancelKind SHOP_FAULT · reason ลงรอบ · idempotencyKey ซ้ำ ⇒ replayed · ถ้าฟอร์ม trips-depcancel-dialog เรนเดอร์ฝั่งเซิร์ฟเวอร์ ชื่อช่องต้องเป็นชุด §9", async () => {
      // ORACLE-EDIT T1.6 รอบ 5 (F1ข): action ยกเลิกด้วยนาฬิกาจริง ⇒ ใบรับต้องอยู่ก่อนเวลาจริงด้วย (เดิมจอง/รับเงินด้วยนาฬิกาฉีด 2027 ⇒ ทุกใบรับดูเหมือน "หลังยกเลิก" ⇒ QUOTED)
      needFix(); { const real = Date.now(); miniN++; await mkDep("AC", ymdBkk(new Date(real + 40 * DAY)), { hm: "11:40" }); const P0 = await mkBk("ACp", "AC", { now: new Date(real - 20 * DAY) }); await payOk(P0, ONE, new Date(real - 20 * DAY + 60_000)); const U0 = await mkBk("ACu", "AC", { now: new Date(real - 20 * DAY) }); AC = { dep: D("AC"), paid: P0, unpaid: U0 }; }
      const dep = AC.dep;
      codeR(await actCancel("oa", await cancelFields(dep, { confirmBookings: 1 })), "STATE_CONFLICT", "confirmBookings", "BOOKINGS_CHANGED");
      codeR(await actCancel("oa", await cancelFields(dep, { expectedVersion: num((await depRow(dep)).version) - 1 })), "STATE_CONFLICT", "expectedVersion");
      const f = await cancelFields(dep, { kind: "SHOP_FAULT", reason: "เรือเสียทดสอบจอ" }); V(await actCancel("oa", f), "ยกเลิก"); const d = await depRow(dep);
      eq([d.status, d.cancelKind, d.cancelReason, (await outRows(dep)).length], ["CANCELLED", "SHOP_FAULT", "เรือเสียทดสอบจอ", 2], "รอบ");
      ok(replayedOf(await actCancel("oa", f)), "คีย์ซ้ำไม่ replayed");
      const h = await pageAt("departures", { dep: D("Q") }); const form = byTestid(h, "trips-depcancel-dialog");
      if (form) { const names = [...form.matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]); const miss = ["kind", "reason", "confirmBookings", "expectedVersion", "idempotencyKey"].filter((n) => !names.includes(n)); ok(miss.length === 0, `ฟอร์มขาดช่อง ${miss.join(" ")}`); }
    });
    await st("AC-2", "[action] resolveCancelledBookingAction(slug, FormData): REFUND บนการจองจ่ายแล้วของ dAC ⇒ APPROVED 410,000 มีป้าย · NO_MONEY บนการจองยังไม่จ่าย ⇒ NO_MONEY · unitId ในฟอร์ม (หน่วยอื่น) ถูกทับด้วยหน่วยของ slug · MOVE ⇒ MOVE_NOT_AVAILABLE_YET · bookingId ของหน่วยอื่น ⇒ NOT_FOUND", async () => {
      needFix(); ok(AC?.paid && AC.unpaid, "AC-1 ไม่ผ่าน"); const P0 = AC?.paid as Bk, U0 = AC?.unpaid as Bk;
      codeR(await actResolve("oa", await resolveFields(P0, "MOVE")), "VALIDATION", "MOVE", "MOVE_NOT_AVAILABLE_YET");
      V(await actResolve("oa", await resolveFields(P0, "REFUND", { unitId: uA2 })), "REFUND"); const r = await flaggedOf(P0); eq([r.status, num(r.amountSatang), asRec(r.computed)?.path], ["APPROVED", ONE, "DEPARTURE_CANCEL"], "คำขอ");
      V(await actResolve("oa", await resolveFields(U0, "NO_MONEY")), "NO_MONEY"); eq([(await outOf(U0)).choice, (await bk(U0.id)).status], ["NO_MONEY", "CANCELLED"], "ไม่มีเงิน");
      codeR(await actResolve("oa", await resolveFields(B("x1"), "REFUND")), "NOT_FOUND", "หน่วยอื่น");
    });
    await st("AC-3", "[action] ผู้ไม่มีสิทธิ์ตาม §7 ⇒ { ok:false, code:\"FORBIDDEN\" } (ไม่ throw · ไม่มีตัวเลขเงิน) · ไม่เขียน: ยกเลิกรอบ none · view · st (มีแต่ departure.status) · req · cxl · resolve REFUND ด้วย cxl · NO_MONEY ด้วย req · ทั้งสองด้วย none", async () => {
      needFix(); const m = await mkMini("AC3"); const bad: string[] = [];
      for (const t of ["none", "view", "st", "req", "cxl"]) { const r = await actCancel(t, await cancelFields(m.dep)); if (r.ok !== false || r.code !== "FORBIDDEN" || !noMoney(r)) bad.push(`ยกเลิก ${t}: ${fmt(r).slice(0, 80)}`); }
      eq((await depRow(m.dep)).status, "OPEN", "รอบไม่เปลี่ยน"); V(await cancelSvc("oa", m.dep, { confirm: 2 }), "ยกเลิกด้วยบริการ");
      for (const [t, b, c] of [["cxl", m.paid, "REFUND"], ["req", m.unpaid, "NO_MONEY"], ["none", m.paid, "REFUND"], ["none", m.unpaid, "NO_MONEY"]] as const) { const r = await actResolve(t, await resolveFields(b as Bk, c)); if (r.ok !== false || r.code !== "FORBIDDEN" || !noMoney(r)) bad.push(`${c} ${t}: ${fmt(r).slice(0, 80)}`); }
      eq([bad, (await outRows(m.dep)).map((r) => r.choice)], [[], ["PENDING", "PENDING"]], "ไม่เขียน");
    });
    await st("AC-4", "[action] decideBelowMinAction (เดิม · departure-screen-actions.ts:37) CANCEL บนรอบต่ำกว่าขั้นต่ำที่มีคน (dM2): st (ผ่าน assertCan ของ action ด้วย departure.status) ⇒ FORBIDDEN ที่บริการ (N3) · ระดับ \"ทัวร์: ใช้งาน\" ⇒ FORBIDDEN · OWNER ⇒ ทางใหม่ kind MIN_NOT_MET + แถวผล", async () => {
      needFix(); const m = await mkMini("M2", { minPax: 8, unpaid: false });
      const lv = LEVELS.mod?.setStaffLevels; ok(typeof lv === "function", "ไม่มี setStaffLevels");
      const lr = asRec(await (lv as AnyFn)({ tenantId: tA, actorUserId: U.oa?.userId, membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } }, U.use?.membershipId, { levels: { trips: "USE" } })) ?? {}; ok(lr.ok !== false, `setStaffLevels USE: ${fmt(lr)}`);
      const inp = async () => ({ departureId: m.dep, decision: "CANCEL", reason: "คนไม่ครบขั้นต่ำทดสอบ", confirmBookings: 1, expectedVersion: num((await depRow(m.dep)).version), idempotencyKey: `bm${hex(6)}` });
      const path = `/app/u/${SLUG_A}/trips/departures`; const bad: string[] = [];
      for (const t of ["st", "use"]) { const r = await runAction(DSA.mod?.decideBelowMinAction, t, path, [SLUG_A, await inp()]); if (!(r.ok !== true && (r.code === "FORBIDDEN" || /forbidden|ไม่มีสิทธิ์/i.test(String(r.e ?? ""))))) bad.push(`${t}: ${fmt(r).slice(0, 80)}`); }
      eq((await depRow(m.dep)).status, "OPEN", "ไม่เขียน");
      V(await runAction(DSA.mod?.decideBelowMinAction, "oa", path, [SLUG_A, await inp()]), "OWNER"); const d = await depRow(m.dep);
      eq([bad, d.status, d.cancelKind, (await outRows(m.dep)).length], [[], "CANCELLED", "MIN_NOT_MET", 1], "ผล");
    });
  });

  // ═══════════════ PG. หน้า ═══════════════
  await gated("PG", "จอ (ใบ §9)", async () => {
    await st("PG-1", "[หน้า] /trips/departures?dep=<รอบมีคน> เรนเดอร์จริง: ปุ่ม trips-dep-cancel-bookings เฉพาะผู้มีสิทธิ์ §7 (OWNER · sta · wild มี / st · req · cxl ไม่มี) · รอบว่างไม่มีปุ่มนี้", async () => {
      needFix(); const bad: string[] = []; const dep = D("Q");
      for (const [t, want] of [["oa", true], ["sta", true], ["wild", true], ["st", false]] as const) { const h = await pageAt("departures", { dep }, t).catch((e) => `THROW ${errMsg(e)}`); if (h.startsWith("THROW")) { bad.push(`${t}: ${h.slice(0, 80)}`); continue; } if (has(h, "trips-dep-cancel-bookings") !== want) bad.push(`${t} ปุ่ม ${!want}`); }
      if (has(await pageAt("departures", { dep: D("V2") }), "trips-dep-cancel-bookings")) bad.push("รอบว่าง/ยกเลิกแล้วมีปุ่ม");
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("PG-2", "[หน้า] รอบที่ร้านยกเลิก (dAC: กำลังคืน 1 · ไม่มีเงิน 1) ?dep=dAC: trips-depcancel-status มีจำนวนและ \"฿4,100.00\" (ต้องโอน) · ลิงก์ trips-depcancel-list ไปหน้ารายการการจอง · ไม่มีปุ่ม trips-dep-cancel-bookings · th/en ไม่มีรหัสดิบ/อัตโนมัติ", async () => {
      needFix(); ok(AC?.dep, "AC-1 ไม่ผ่าน"); const bad: string[] = [];
      for (const L of ["th", "en"] as const) {
        const h = await pageAt("departures", { dep: String(AC?.dep) }, "oa", L); const card = unent(byTestid(h, "trips-depcancel-status"));
        if (!card) { bad.push(`${L} ไม่มีการ์ด`); continue; } if (!card.includes("4,100.00")) bad.push(`${L} การ์ดไม่มียอดต้องโอน: "${card.slice(0, 80)}"`);
        const href = hrefOf(h, "trips-depcancel-list"); if (!href || !new URL(href, "http://qc.local").pathname.endsWith("/trips/bookings")) bad.push(`${L} ลิงก์ ${href}`);
        if (has(h, "trips-dep-cancel-bookings")) bad.push(`${L} ยังมีปุ่มยกเลิก`);
        for (const c of RAW_CODES) if (card.includes(c)) bad.push(`${L} รหัสดิบ ${c}`); if (/อัตโนมัติ|automatic/i.test(card)) bad.push(`${L} อัตโนมัติ`); if (L === "en" && THAI.test(card)) bad.push("en มีอักษรไทย");
      }
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("PG-3", "[หน้า] รายการการจอง: ลิงก์ตัวกรอง trips-bk-filter-cancel-pending และ trips-bk-filter-cancel-overdue · ตามลิงก์ pending ⇒ แสดงเลขจองของรอบที่ร้านยกเลิกที่ยังรอ (dPG 2 ใบ) ไม่แสดงการจองรอบปกติ (q1) · ตัวกรอง overdue (VM ณ เลยเส้นตาย) ⇒ มี / ก่อนเส้นตาย ⇒ ไม่มี", async () => {
      needFix(); const m = await mkMini("PG"); V(await cancelSvc("oa", m.dep, { confirm: 2 }), "ยกเลิก dPG"); const bad: string[] = [];
      const h = await pageAt("bookings", {}); const hp = hrefOf(h, "trips-bk-filter-cancel-pending"), ho = hrefOf(h, "trips-bk-filter-cancel-overdue"); ok(hp && ho, `ไม่มีลิงก์ตัวกรอง (${hp} · ${ho})`);
      const sp = (href: string) => Object.fromEntries(new URL(href, "http://qc.local").searchParams.entries());
      const hl = await pageAt("bookings", sp(String(hp))); const codes = [m.paid, m.unpaid].map((b) => (b as Bk).code);
      if (!codes.every((c) => hl.includes(c))) bad.push("ตัวกรองไม่แสดงการจองที่รอ"); if (hl.includes(B("q1").code)) bad.push("ตัวกรองแสดงการจองรอบปกติ");
      const KEYMAP: Record<string, string> = { p: "product", ch: "channel" }; const inp = Object.fromEntries(Object.entries(sp(String(ho))).map(([k, v]) => [KEYMAP[k] ?? k, v]));
      const dby = new Date(String((await depRow(m.dep)).cancelDecideBy)).getTime();
      const lst = async (now: Date) => { const r = await call("loadBookingListVM", tc("oa"), { unitId: uA, ...inp }, { now }); ok(r.ok === true, `loadBookingListVM ${fmt(r)}`); return JSON.stringify(r.vm); };
      if (!(await lst(new Date(dby + 60_000))).includes((m.paid as Bk).id)) bad.push("overdue หลังเส้นตายไม่มี"); if ((await lst(new Date(dby - 60_000))).includes((m.paid as Bk).id)) bad.push("overdue ก่อนเส้นตายมี");
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("PG-4", "[หน้า] ลิ้นชักการจองที่รอทางเลือก (BookingDrawer เรนเดอร์จริง th/en): จ่ายแล้ว ⇒ trips-bk-resolve-refund \"฿4,100.00\" ไม่มี close · ยังไม่จ่าย ⇒ trips-bk-resolve-close (name=choice value=NO_MONEY) ไม่มี refund · ไม่มี trips-bk-resolve-move (a1) · ผู้ไม่มี refund.request (cxl) ไม่มีปุ่มคืน · ไม่มีรหัสดิบ/อัตโนมัติ · อังกฤษไม่มีอักษรไทย", async () => {
      needFix(); const P0 = BK.PGp, U0 = BK.PGu; ok(P0 && U0, "PG-3 ไม่ผ่าน"); const bad: string[] = [];
      for (const L of ["th", "en"] as const) {
        const hp = await drawerAt("oa", P0 as Bk, NOW, L), hu = await drawerAt("oa", U0 as Bk, NOW, L);
        if (!has(hp, "trips-bk-resolve-refund") || !unent(byTestid(hp, "trips-bk-resolve-refund")).includes("4,100.00") || has(hp, "trips-bk-resolve-close")) bad.push(`${L} จ่ายแล้ว`);
        const close = byTestid(hu, "trips-bk-resolve-close"); if (!close || has(hu, "trips-bk-resolve-refund") || !(/name="choice"[^>]*value="NO_MONEY"|value="NO_MONEY"[^>]*name="choice"/.test(hu))) bad.push(`${L} ยังไม่จ่าย`);
        if (has(hp, "trips-bk-resolve-move") || has(hu, "trips-bk-resolve-move")) bad.push(`${L} มีปุ่มย้าย (a2)`);
        for (const x of [byTestid(hp, "trips-bk-resolve-refund"), close].map(unent)) { for (const c of RAW_CODES) if (x.includes(c)) bad.push(`${L} รหัสดิบ ${c}`); if (/อัตโนมัติ|automatic/i.test(x)) bad.push(`${L} อัตโนมัติ`); if (L === "en" && THAI.test(x)) bad.push("en ไทย"); }
      }
      if (has(await drawerAt("cxl", P0 as Bk, NOW), "trips-bk-resolve-refund")) bad.push("cxl เห็นปุ่มคืน");
      ok(bad.length === 0, [...new Set(bad)].join(" · "));
    });
    // ORACLE-EDIT T1.6 รอบ 3 (ข้อเบี่ยง 11 ของผู้สร้าง): ตัวกรองผ่านช่อง dep ของ URL เดิม — ตรวจผ่านหน้า bookings/page.tsx จริง (นาฬิกาจริง ⇒ รอบ PGO ยกเลิกด้วยนาฬิกาฉีดในอดีตจริงให้เลยเส้นตายแล้ว)
    await st("PG-5", "[หน้า] หน้า /trips/bookings เรนเดอร์จริงด้วย dep=cancel:pending&when=all ⇒ แสดงเลขจองที่รอของ dPG และ dPGO ไม่แสดง q1 · dep=cancel:overdue&when=all ⇒ แสดงของ dPGO (เส้นตายผ่านไปแล้วตามนาฬิกาจริง) ไม่แสดงของ dPG (เส้นตายยังไม่ถึง)", async () => {
      needFix(); ok(BK.PGp && BK.PGu, "PG-3 ไม่ผ่าน"); const real = Date.now(); const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(real + 10 * DAY));
      await mkDep("PGO", ymd, { hm: "15:00" }); const o1 = await mkBk("PGOp", "PGO", { now: new Date(real - 20 * DAY) }); await payOk(o1, ONE, new Date(real - 20 * DAY + 60_000)); const o2 = await mkBk("PGOu", "PGO", { now: new Date(real - 20 * DAY) });
      V(await cancelSvc("oa", D("PGO"), { confirm: 2, now: new Date(real - 10 * DAY) }), "ยกเลิก dPGO"); ok(new Date(String((await depRow(D("PGO"))).cancelDecideBy)).getTime() < real, "เส้นตาย dPGO ยังไม่ผ่าน");
      const pg = [BK.PGp, BK.PGu].map((x) => (x as Bk).code), po = [o1.code, o2.code]; const bad: string[] = [];
      const hp = await pageAt("bookings", { dep: "cancel:pending", when: "all" }), ho = await pageAt("bookings", { dep: "cancel:overdue", when: "all" });
      if (![...pg, ...po].every((c) => hp.includes(c))) bad.push(`pending ขาด ${[...pg, ...po].filter((c) => !hp.includes(c)).join(",")}`); if (hp.includes(B("q1").code)) bad.push("pending มี q1");
      if (!po.every((c) => ho.includes(c))) bad.push("overdue ไม่มี dPGO"); if (pg.some((c) => ho.includes(c))) bad.push("overdue มี dPG (ยังไม่เลยเส้นตาย)"); if (ho.includes(B("q1").code)) bad.push("overdue มี q1");
      ok(bad.length === 0, bad.join(" · "));
    });
    // ORACLE-EDIT T1.6 รอบ 6 (H1–H4 H6) — ชื่อที่ข้อสอบตรึง: trips-bk-depcancel-approve / trips-bk-depcancel-transfer = <form> ที่ช่องตรงกับ input ของ decideTripRefundAction / executeTripRefundAction · trips-bk-depcancel-state = ป้ายสถานะคำขอ
    let H1: { b: Bk; c: Bk; u: Bk } | null = null;
    await st("PG-6", "[หน้า+action] H1 อนุมัติในลิ้นชัก: คำขอติดป้าย QUOTED ⇒ ผู้มี refund.approve (sta) เห็นฟอร์ม trips-bk-depcancel-approve (ไม่มีช่องปรับยอด/หักเงิน · กุญแจกันซ้ำซ่อนไม่ว่าง · สองการเรนเดอร์คนละกุญแจ — H2) · ผู้ไม่มี (req) ไม่เห็น · ป้าย trips-bk-depcancel-state th มี \"รออนุมัติ\" · ส่งช่องของฟอร์มที่เรนเดอร์ให้ decideTripRefundAction จริง ⇒ APPROVED ยอดเต็ม refundBp 10000 · ป้ายเปลี่ยนเป็น \"อนุมัติแล้ว รอโอน\" · en สองป้ายต่างกันไม่มีอักษรไทย", async () => {
      needFix(); H1 = await mkQuotedMarked("HQ"); const b = H1.b; const bad: string[] = []; const now = new Date();
      const h1 = await drawerAt("sta", b, now), h2 = await drawerAt("sta", b, now), hr = await drawerAt("req", b, now); const f1 = byTestid(h1, "trips-bk-depcancel-approve");
      if (!/^<form\b/.test(f1)) bad.push("ไม่มีฟอร์มอนุมัติ"); const in1 = inputsOf(f1), in2 = inputsOf(byTestid(h2, "trips-bk-depcancel-approve"));
      if ("manualDeltaSatang" in in1 || "deductions" in in1 || "manualReason" in in1) bad.push(`มีช่องปรับยอด ${fmt(Object.keys(in1))}`); if (!in1.idempotencyKey || in1.idempotencyKey === in2.idempotencyKey) bad.push("กุญแจกันซ้ำ (H2)");
      if (has(hr, "trips-bk-depcancel-approve")) bad.push("req เห็นปุ่มอนุมัติ"); if (!unent(byTestid(h1, "trips-bk-depcancel-state")).includes("รออนุมัติ")) bad.push(`ป้าย QUOTED "${unent(byTestid(h1, "trips-bk-depcancel-state"))}"`);
      const enQ = unent(byTestid(await drawerAt("sta", b, now, "en"), "trips-bk-depcancel-state"));
      if (!bad.length) { const r = await actOf("decideTripRefundAction", "sta", in1); if (r.ok !== true) bad.push(`ส่งฟอร์ม: ${fmt(r).slice(0, 120)}`); }
      const rq = await flaggedOf(b); if (rq.status !== "APPROVED" || num(rq.amountSatang) !== num((await bk(b.id)).paidSatang) || num(asRec(rq.computed)?.refundBp) !== 10_000) bad.push(`หลังอนุมัติ ${fmt([rq.status, rq.amountSatang])}`);
      const ha = await drawerAt("sta", b, new Date()); if (!unent(byTestid(ha, "trips-bk-depcancel-state")).includes("อนุมัติแล้ว รอโอน")) bad.push(`ป้าย APPROVED "${unent(byTestid(ha, "trips-bk-depcancel-state"))}"`);
      const enA = unent(byTestid(await drawerAt("sta", b, new Date(), "en"), "trips-bk-depcancel-state")); if (!enQ || !enA || enQ === enA || THAI.test(enQ + enA)) bad.push(`en ${fmt([enQ, enA])}`);
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("PG-7", "[หน้า+action] H1 บันทึกโอนคืนในลิ้นชัก: คำขอติดป้าย APPROVED (จาก PG-6) ณ เวลาอนุมัติ + 4 วัน ⇒ ผู้มีสิทธิ์ execute (exe) เห็นฟอร์ม trips-bk-depcancel-transfer · req ไม่เห็น · คำเตือน 3 วันอยู่ในก้อนเดียวกับฟอร์มและไม่อ้าง \"ส่วนคืนเงิน\" ที่ไม่มีอยู่ · ส่งช่องของฟอร์มให้ executeTripRefundAction จริง ⇒ DONE · REFUNDED = ยอดจ่าย · pt = Σ pt ของใบรับ", async () => {
      needFix(); ok(H1, "PG-6 ไม่ผ่าน"); const b = (H1 as { b: Bk }).b; const bad: string[] = []; const at = new Date(Date.now() + 4 * DAY);
      const h = await drawerAt("exe", b, at); const sec = byTestid(h, "trips-bk-depcancel"); const f = byTestid(sec, "trips-bk-depcancel-transfer");
      if (!/^<form\b/.test(f)) bad.push("ไม่มีฟอร์มบันทึกโอนในก้อน"); if (has(await drawerAt("req", b, at), "trips-bk-depcancel-transfer")) bad.push("req เห็นปุ่มโอน");
      const w = unent(byTestid(sec, "trips-bk-refund-transfer-due")); if (!w) bad.push("ไม่มีคำเตือนในก้อน"); else if (/ส่วนคืนเงิน|refund section/i.test(w)) bad.push(`คำเตือนอ้างส่วนที่ไม่มี "${w}"`);
      if (!bad.length) { const r = await actOf("executeTripRefundAction", "exe", inputsOf(f)); if (r.ok !== true) bad.push(`ส่งฟอร์ม: ${fmt(r).slice(0, 120)}`); }
      const rec = await evs(b.id, "RECEIVED"), rf = await evs(b.id, "REFUNDED"); const sm = (a: Rec[], k: string) => a.reduce((x, y) => x + num(y[k]), 0);
      eq([bad, (await flaggedOf(b)).status, sm(rf, "amountSatang"), sm(rf, "passThroughSatang")], [[], "DONE", sm(rec, "amountSatang"), sm(rec, "passThroughSatang")], "โอนคืน");
    });
    await st("PG-8", "[หน้า] H1 H6 การ์ดสถานะของรอบ (รอบเล็ก HC: b QUOTED มัดจำ + สลิป 50,000 · c APPROVED 410,000 · u ปิดไม่มีเงิน) ⇒ trips-depcancel-status แยก \"รออนุมัติ ฿(มัดจำ+500)\" กับ \"ต้องโอน ฿4,100.00\" · มี \"ปิดแบบไม่มีเงิน 1\" · ไม่มี \"ย้ายแล้ว\" (th) · en ไม่มี Moved", async () => {
      needFix(); const M = await mkQuotedMarked("HC"); V(await resolveSvc("oa", M.u, "NO_MONEY", { now: new Date() }), "ปิด u"); const bad: string[] = [];
      const x = num((await flaggedOf(M.b)).amountSatang); const baht = (n: number) => (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const th0 = unent(byTestid(await pageAt("departures", { dep: M.b.dep }), "trips-depcancel-status")), en0 = unent(byTestid(await pageAt("departures", { dep: M.b.dep }, "oa", "en"), "trips-depcancel-status"));
      if (!/รออนุมัติ/.test(th0) || !th0.includes(baht(x)) || !th0.includes("4,100.00")) bad.push(`ยอดแยก (รออนุมัติ ${baht(x)} · ต้องโอน 4,100.00): "${th0}"`);
      if (!/ปิดแบบไม่มีเงิน\s*1/.test(th0)) bad.push("ไม่มี ปิดแบบไม่มีเงิน 1"); if (/ย้ายแล้ว/.test(th0) || /Moved/i.test(en0)) bad.push("ยังมี ย้ายแล้ว/Moved");
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("PG-9", "[หน้า] H3 ลิ้นชักการจองที่มียอดค้างบนรอบที่ร้านยกเลิก ⇒ ไม่มีปุ่ม QR (trips-bk-qr) · ตัวควบคุม: การจองยังไม่จ่ายบนรอบปกติมี trips-bk-qr · (ทางเลือกช่องทางในกล่องรับเงิน + ช่องเลขอ้างอิงบังคับ = ด่านภาพ/กดจริง)", async () => {
      needFix(); const m = await mkMini("H3", { paid: false }); const ctl = await mkMini("H3c", { paid: false }); V(await cancelSvc("oa", m.dep, { confirm: 1 }), "ยกเลิก H3");
      eq([has(await drawerAt("oa", m.unpaid as Bk, NOW), "trips-bk-qr"), has(await drawerAt("oa", ctl.unpaid as Bk, NOW), "trips-bk-qr")], [false, true], "ปุ่ม QR");
    });
    await st("PG-10", "[หน้า+โค้ด] H4: รอบที่มีคนแสดงทางยกเลิกทางเดียว (ไม่มีทั้ง trips-dep-cancel และ trips-dep-cancel-bookings พร้อมกัน · มี trips-dep-cancel-bookings) · ข้อความ departures.* ของกล่องยกเลิก/ตัดสินต่ำกว่าขั้นต่ำไม่มี \"ยังไม่เปิด\" / \"ทำที่นี่ไม่ได้\" / \"not available\"", async () => {
      needFix(); const h = await pageAt("departures", { dep: D("Q") }); const bad: string[] = [];
      if (!has(h, "trips-dep-cancel-bookings") || has(h, "trips-dep-cancel")) bad.push(`ปุ่ม: ใหม่ ${has(h, "trips-dep-cancel-bookings")} เดิม ${has(h, "trips-dep-cancel")}`);
      for (const [k, v] of [...Object.entries(fth), ...Object.entries(fen)]) if (/^departures\.(cancel|decide|dialog)/i.test(k) && /ยังไม่เปิด|ทำที่นี่ไม่ได้|not (yet )?available/i.test(v)) bad.push(`${k}: ${v.slice(0, 50)}`);
      ok(bad.length === 0, bad.slice(0, 5).join(" · "));
    });
  });

  // ═══════════════ PM. สิทธิ์ทุกทาง (บทเรียน T1.7a1) ═══════════════
  await gated("PM", "สิทธิ์ทุกทาง (ใบ §7 · N3)", async () => {
    await st("PM-1", "[บริการ] ตาราง §7 ที่บริการ (ไม่ใช่แค่ action): ยกเลิกรอบมีคน — none · view · st · req · cxl · use ⇒ FORBIDDEN · MANAGER หน่วยอื่น / ร้าน B ⇒ NOT_FOUND · sta · wild · MANAGER ⇒ ได้ · resolve REFUND — req ได้ · cxl/st ⇒ FORBIDDEN · NO_MONEY — cxl ได้ · req/st ⇒ FORBIDDEN", async () => {
      needFix(); const bad: string[] = []; const m1 = await mkMini("PM1"), m2 = await mkMini("PM2"), m3 = await mkMini("PM3");
      for (const t of ["none", "view", "st", "req", "cxl", "use"]) { const r = await cancelSvc(t, m1.dep, { confirm: 2 }); if (!(r.ok === false && r.code === "FORBIDDEN")) bad.push(`ยกเลิก ${t}: ${fmt(r).slice(0, 60)}`); }
      for (const t of ["mgx", "ob"]) { const r = await cancelSvc(t, m1.dep, { confirm: 2 }); if (!(r.ok === false && r.code === "NOT_FOUND")) bad.push(`ยกเลิก ${t}: ${fmt(r).slice(0, 60)}`); }
      for (const [t, dep] of [["sta", m1.dep], ["wild", m2.dep], ["mg", m3.dep]] as const) { const r = await cancelSvc(t, dep, { confirm: 2 }); if (r.ok !== true) bad.push(`ยกเลิก ${t}: ${fmt(r).slice(0, 60)}`); }
      const exp: [string, Bk | undefined, string, boolean][] = [["cxl", m1.paid, "REFUND", false], ["st", m1.paid, "REFUND", false], ["req", m1.paid, "REFUND", true], ["req", m1.unpaid, "NO_MONEY", false], ["st", m1.unpaid, "NO_MONEY", false], ["cxl", m1.unpaid, "NO_MONEY", true]];
      for (const [t, b, c, okWant] of exp) { const r = await resolveSvc(t, b as Bk, c); if (okWant ? r.ok !== true : !(r.ok === false && r.code === "FORBIDDEN")) bad.push(`${c} ${t}: ${fmt(r).slice(0, 60)}`); }
      ok(bad.length === 0, bad.join(" · "));
    });
    await st("PM-2", "[บริการ] ระดับสำเร็จรูปจริง (setStaffLevels): \"ทัวร์: ใช้งาน\" ⇒ ยกเลิกรอบมีคนไม่ได้ (ไม่มี refund.approve) · คืนตาม permissionsForLevel(trips, USE) มี refund.request หรือไม่ · ปิดไม่มีเงินตามมี booking.cancel หรือไม่ · \"ทัวร์: ดู\" ⇒ ไม่ได้ทั้งหมด", async () => {
      needFix(); const lv = LEVELS.mod?.setStaffLevels, pfl = LEVELS.mod?.permissionsForLevel; ok(typeof lv === "function" && typeof pfl === "function", "ไม่มี setStaffLevels/permissionsForLevel");
      const ctxL = { tenantId: tA, actorUserId: U.oa?.userId, membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } };
      for (const [t, l] of [["use", "USE"], ["view", "VIEW"]] as const) { const r = asRec(await (lv as AnyFn)(ctxL, U[t]?.membershipId, { levels: { trips: l } })) ?? {}; ok(r.ok !== false, `setStaffLevels ${t}: ${fmt(r)}`); }
      const use = asRec((pfl as AnyFn)("trips", "USE", {})) ?? {}; const m = await mkMini("PML"); const bad: string[] = [];
      for (const t of ["use", "view"]) { const r = await cancelSvc(t, m.dep, { confirm: 2 }); if (!(r.ok === false && r.code === "FORBIDDEN")) bad.push(`ยกเลิก ${t}: ${fmt(r).slice(0, 60)}`); }
      V(await cancelSvc("oa", m.dep, { confirm: 2 }), "OWNER ยกเลิก");
      const r1 = await resolveSvc("view", m.paid as Bk, "REFUND"), r2 = await resolveSvc("view", m.unpaid as Bk, "NO_MONEY"); if (r1.ok !== false || r2.ok !== false) bad.push("VIEW ทำได้");
      const ru = await resolveSvc("use", m.paid as Bk, "REFUND"); if ((ru.ok === true) !== (use["trips.refund.request"] === true)) bad.push(`USE REFUND ${fmt(ru).slice(0, 60)} (คีย์ ${use["trips.refund.request"]})`);
      const rn = await resolveSvc("use", m.unpaid as Bk, "NO_MONEY"); if ((rn.ok === true) !== (use["trips.booking.cancel"] === true)) bad.push(`USE NO_MONEY ${fmt(rn).slice(0, 60)} (คีย์ ${use["trips.booking.cancel"]})`);
      ok(bad.length === 0, bad.join(" · "));
    });
    // ORACLE-EDIT T1.6 รอบ 3 (มติผู้คุม): MANAGER แจกคีย์ใดก็ได้เพราะ rbac ให้ MANAGER ผ่านทุกคีย์โดยปริยาย (src/lib/core/rbac.ts ~:127 · staff/service.ts:206) — เป็นคุณสมบัติเดิมของแพลตฟอร์ม (ตระกูล OQ55) ไม่ใช่ข้อบกพร่องของ T1.6
    //   ⇒ ข้อนี้ตรึงเฉพาะทางแจกที่ T1.6 มีผล: STAFF ที่ไม่มี trips.refund.approve แจกคีย์นี้ให้ตัวเอง/คนอื่นไม่ได้ · ระดับสำเร็จรูปของ trips (OFF/VIEW/USE) ไม่แถม trips.refund.approve (จึงไม่แถมคู่ status ∧ approve)
    await st("PM-3", "[บริการ] แจกสิทธิ์ (staff/service.ts:206 checkNoEscalation · levels.ts): STAFF ที่มี departure.status แต่ไม่มี trips.refund.approve แจก trips.refund.approve ให้ตัวเอง/คนอื่นไม่ได้ · ตัวควบคุม STAFF ที่มีคีย์ ⇒ แจกได้ (null) · permissionsForLevel(trips, OFF/VIEW/USE) ไม่มี trips.refund.approve (ไม่แถมคู่สิทธิ์ยกเลิกรอบมีคน) — MANAGER แจกได้ทุกคีย์ = คุณสมบัติเดิม (หมายเหตุในโค้ด)", () => {
      const f = STAFFSVC.mod?.checkNoEscalation, pfl = LEVELS.mod?.permissionsForLevel; ok(typeof f === "function" && typeof pfl === "function", `ไม่มี checkNoEscalation/permissionsForLevel (${STAFFSVC.err.slice(0, 60)} ${LEVELS.err.slice(0, 60)})`);
      const stP = { "trips.departure.view": true, "trips.booking.view": true, "trips.departure.status": true }; const ap = { "trips.refund.approve": true };
      const bad: string[] = [];
      if ((f as AnyFn)({ role: "STAFF", unitAccess: [uA], permissions: stP }, stP, { ...stP, ...ap }) === null) bad.push("STAFF แจกให้ตัวเองได้");
      if ((f as AnyFn)({ role: "STAFF", unitAccess: [uA], permissions: stP }, {}, ap) === null) bad.push("STAFF แจกให้คนอื่นได้");
      if ((f as AnyFn)({ role: "STAFF", unitAccess: [uA], permissions: { ...stP, ...ap } }, {}, ap) !== null) bad.push("ตัวควบคุม: STAFF ที่มีคีย์แจกไม่ได้");
      for (const lv of ["OFF", "VIEW", "USE"]) { const m = asRec((pfl as AnyFn)("trips", lv, {})) ?? {}; if (m["trips.refund.approve"] === true) bad.push(`ระดับ ${lv} แถม trips.refund.approve`); }
      ok(bad.length === 0, bad.join(" · "));
    });
  });

  // ── ตรวจว่าไม่มีของค้าง (ก่อน finally ลบ) ──
  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { for (const t of tenantIds) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:%:${t}:%`]); } catch (e) { console.log(`  ⚠️ cleanup ถัง: ${errMsg(e)}`); }
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0]?.n ?? -1;
    const leftU = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]))[0]?.n ?? -1;
    console.log(`  🧹 หลังลบ: ร้านชั่วคราวค้าง ${left} · ผู้ใช้ชั่วคราวค้าง ${leftU}`);
  } catch (e) { console.log(`  ⚠️ ตรวจของค้าง: ${errMsg(e)}`); }
  try { await qcPrisma.$disconnect(); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

console.log(`\nเหลือให้ด่านภาพ + การกดจริง (ผู้คุม · visual-trips t1.6a1): แผงรอบก่อน/หลัง · กล่องยืนยัน (พิมพ์จำนวน) · การ์ดสถานะ · ลิ้นชัก คืน/ปิด · 1440 + 390 · th/en · กดจริง: ยกเลิก 2 แท็บพร้อมกัน · โอนคืนการจ่ายบางส่วน`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${(p0 ?? 0) + (c.res === "PASS" ? 1 : 0)}/${(t0 ?? 0) + 1}`; }
console.log(`\n===== QC TRIPS T1.6a1 · ร้านยกเลิกรอบที่มีคนจอง =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
