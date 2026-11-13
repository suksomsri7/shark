// QC — TRIPS T1.3a · การจองฝั่งร้าน: รายการ/ค้นหา/ชิป · รายละเอียด · รับเงิน (recordTripPayment) · เอกสารเงินรอออก · เงินสดหน้าร้าน (ภาพ 18 · 13ค · 07)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/T1.3.md (T1.3 แยก a/b/c — ไฟล์นี้ = T1.3a) · สัญญา ledger/TRIPS-CORE-CONTRACT.md §G §H.0 §J.4 · ภาพ ledger/design-trips/18-shop-bookings.* (+ 13 · 07)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน)   S ไฟล์/กติกาโค้ด (static)   P ตัวช่วยบริสุทธิ์ (booking-view-core)
//   LV รายการบนร้าน seed (now = TRIPS_AS_OF)   DV รายละเอียดบนร้าน seed   CS เงินสด/คิวเอกสารบนร้าน seed
//   BT ร้านชั่วคราว: สิทธิ์ · แยกหน่วย/ร้าน · รับเงิน → แถว/เงินสด/เอกสาร · กดซ้ำพร้อมกัน · ถือที่ · ยกเลิก · ต้องทำ · PII · ค้น · เพดาน · เขตเวลา · ไม่เขียนฐาน
//
// 🔴 ที่ตรวจไม่ได้ที่นี่ (ไม่มี server/เบราว์เซอร์) = ด่านภาพ + การกด action จริงผ่าน Next ของผู้คุม: ผังตาราง 1440 · ลิ้นชัก · กล่องรับเงิน · 390 ไม่ล้น · รูปทรงป้าย
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t13-*` (ผู้ใช้ `trips-t13-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน seed อ่านอย่างเดียว (ไม่เรียกตัวเขียนกับ seed)
// 🔴 ยังไม่มีโมดูล/ฟังก์ชัน = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน (มติ T0.6 §16 ข้อ 10)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.3.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน T1.3a: PC เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t1.3";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t1.2) ═══════════════
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
const num = (v: unknown): number => Number(v);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t13qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const SLUG = "trips-t13-";
const EMAIL_PREFIX = "trips-t13-";
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

// ═══════════════ สเปก (ใบสั่ง T1.3 · ส่วน a) ═══════════════
const BASE_SHA = "4288cf7ce54c77eddd839c787595b1fe6bc3b065"; // wip/trips-t1.3 = session/trips ตอนเขียนใบสั่ง (T0.7a + A1.1 merge แล้ว)
const APP = "src/app/app/u/[unitSlug]/trips";
const PAGE = `${APP}/bookings/page.tsx`;
const MOD = "src/lib/modules/trips/";
const PURE = MOD + "booking-view-core.ts";
const LOADER = MOD + "booking-screens.ts";
const OPT_ACTIONS = MOD + "booking-screen-actions.ts";
const OWN_MOD = [PURE, LOADER];
const COMP = "src/components/trips";
const SHARED = `${COMP}/trips-shared.ts`;
const FACADE_T13 = ["loadBookingListVM", "loadBookingDetailVM", "loadBookingDocsVM", "loadCashDayVM", "TRIPS_BOOKING_LIST_CAP", "TRIPS_MONEY_DOCS_CAP", "TRIPS_CASH_EVENTS_CAP",
  "BOOKING_LIST_WHENS", "BOOKING_LIST_CHIPS", "BOOKING_ATTENTION_KINDS", "BOOKING_MONEY_STATES", "BOOKING_OWES_STATUSES", "outstandingOf", "moneyStateOf", "bookingBadgeOf", "listWindowOf",
  "bookingCodeQuery", "parseAmountSatang", "maskPhone", "intentKey"];
const WHENS = ["upcoming", "today", "tomorrow", "next7", "past30", "all"];
const CHIPS = ["all", "day", "hold", "attention"];
const ATTENTION = ["REFUND_OPEN", "PENDING_APPROVAL", "DEPARTURE_CANCELLED", "OVERDUE"];
const MONEY_STATES = ["AGENT_COLLECTS", "REFUNDED", "NONE", "PAID", "PART_PAID", "UNPAID"];
const OWES = ["HOLD", "PENDING", "CONFIRMED", "PART_PAID"];
const BOOKING_STATUSES = ["HOLD", "PENDING", "CONFIRMED", "PART_PAID", "PAID", "EXPIRED", "CANCELLED", "TRAVELLED", "NO_SHOW"];
const REFUND_ST = ["REQUESTED", "QUOTED", "APPROVED", "REJECTED", "WITHDRAWN", "EXECUTING", "DONE", "FAILED"];
const TENDERS = ["CASH", "PROMPTPAY", "TRANSFER", "CARD"];
const ROW_KEYS = ["bookingId", "code", "status", "version", "productId", "productTitleTh", "productTitleEn", "departureId", "travelDate", "timeText", "departureStatus", "departureCancelReason",
  "bookerName", "bookerPurged", "channel", "agentAccountId", "agentRef", "collectMode", "currency", "pax", "extras", "payableSatang", "paidSatang", "refundedSatang", "outstandingSatang", "money",
  "lastTender", "nextDue", "hold", "refund", "attention", "badge", "createdAt", "createdLocal"];
const DETAIL_ACTIONS = ["pay", "qr", "approve", "reject", "cancel", "change", "refund"];
const TESTIDS_FIXED = ["trips-bk", "trips-bk-seg-all", "trips-bk-seg-refunds", "trips-bk-seg-docs", "trips-bk-new", "trips-bk-search", "trips-bk-filter-product", "trips-bk-filter-when",
  "trips-bk-filter-channel", "trips-bk-chip-all", "trips-bk-chip-day", "trips-bk-chip-hold", "trips-bk-chip-attention", "trips-bk-table", "trips-bk-cards", "trips-bk-empty", "trips-bk-truncated",
  "trips-bk-footer", "trips-bk-name-capped", "trips-bk-detail", "trips-bk-detail-close", "trips-bk-status", "trips-bk-customer", "trips-bk-items", "trips-bk-money", "trips-bk-dues", "trips-bk-payments",
  "trips-bk-docs", "trips-bk-travellers", "trips-bk-travellers-note", "trips-bk-refund-open", "trips-bk-actions", "trips-bk-pay", "trips-bk-qr", "trips-bk-approve", "trips-bk-reject", "trips-bk-cancel",
  "trips-bk-change", "trips-bk-refund", "trips-pay-dialog", "trips-pay-amount", "trips-pay-reference", "trips-pay-cash-note", "trips-pay-qr", "trips-pay-confirm", "trips-cancel-bk-dialog",
  "trips-cancel-bk-reason", "trips-cancel-bk-confirm", "trips-approve-dialog", "trips-approve-confirm", "trips-cash", "trips-cash-expected", "trips-cash-open", "trips-cash-dialog", "trips-cash-date",
  "trips-cash-close", "trips-docs", "trips-docs-note", "trips-docs-truncated"];
const TESTID_PATTERNS = ["trips-bk-row-", "trips-bk-card-", "trips-bk-due-", "trips-bk-event-", "trips-pay-tender-", "trips-cash-tender-", "trips-docs-row-"];
const I18N_REQUIRED = [
  "bookings.title", "bookings.segment.all", "bookings.segment.refunds", "bookings.segment.docs", "bookings.search.placeholder",
  ...["product", "when", "channel", "allProducts", "allChannels", "direct", "agent"].map((k) => `bookings.filter.${k}`),
  ...WHENS.map((k) => `bookings.when.${k}`), ...CHIPS.map((k) => `bookings.chip.${k}`),
  ...["code", "customer", "trip", "total", "money", "status"].map((k) => `bookings.col.${k}`),
  ...BOOKING_STATUSES.map((k) => `bookings.status.${k}`), ...ATTENTION.map((k) => `bookings.attention.${k}`), ...MONEY_STATES.map((k) => `bookings.money.${k}`),
  ...[...TENDERS, "AGENCY"].map((k) => `bookings.tender.${k}`),
  ...["DEPOSIT", "BALANCE", "INSTALMENT", "PASSENGER_SHARE"].map((k) => `bookings.dueKind.${k}`),
  ...["OPEN", "PARTLY_PAID", "PAID", "OVERDUE", "WAIVED", "CANCELLED"].map((k) => `bookings.dueStatus.${k}`),
  ...["RECEIVED", "REFUNDED", "RETAINED"].map((k) => `bookings.eventKind.${k}`), ...["UNPOSTED", "POSTED", "FAILED_NEEDS_ACTION"].map((k) => `bookings.posting.${k}`),
  ...REFUND_ST.map((k) => `bookings.refundStatus.${k}`), ...["newBooking", "refunds", "change", "travellers", "cashClose"].map((k) => `bookings.notYet.${k}`),
  "bookings.empty", "bookings.truncated", "bookings.footer",
  ...["customer", "items", "money", "dues", "payments", "docs", "travellers", "close", "purged", "inThisTotal"].map((k) => `bookings.detail.${k}`),
  ...["title", "note", "accountant", "empty", "truncated"].map((k) => `bookings.docs.${k}`), ...["title", "separate", "expected", "open"].map((k) => `bookings.cash.${k}`),
  ...["title", "amount", "tender", "reference", "cashNote", "showQr", "qrAmount", "received", "confirm", "overOutstanding"].map((k) => `bookings.pay.${k}`),
  ...["title", "reason", "summary", "confirm"].map((k) => `bookings.cancel.${k}`), ...["title", "approve", "reject", "reason", "confirm"].map((k) => `bookings.approve.${k}`),
  ...["pay", "qr", "approve", "reject", "cancel", "change", "refund", "new"].map((k) => `bookings.actions.${k}`),
  ...["REFUND_IN_PROGRESS", "NOTHING_DUE", "PENDING_APPROVAL", "BOOKING_EXPIRED", "NOT_PAYABLE", "OVERPAYMENT", "INVALID_AMOUNT", "NO_PROMPTPAY_RECEIVER", "AGENCY_NOT_ENABLED", "CURRENCY_NOT_THB",
    "BOOKER_PURGED", "SLIP_REQUIRED", "TRANSITION_NOT_ALLOWED", "REFUND_REQUIRED"].map((k) => `bookings.reason.${k}`),
  ...["HOLD_EXPIRED", "IDEMPOTENCY_CONFLICT", "STATE_CONFLICT", "CURRENCY_NOT_ALLOWED", "BUSY"].map((k) => `errors.${k}`),
];
const VISUAL_SCENES = ["bookings-list", "booking-detail", "payment-dialog", "money-docs"];
const TRIPS_FORBIDDEN_FILES = ["booking.ts", "booking-core.ts", "booking-actions.ts", "state.ts", "numbering.ts", "money.ts", "money-core.ts", "money-math.ts", "money-actions.ts", "refund.ts", "snapshot.ts",
  "pricing.ts", "pricing-core.ts", "pricing-actions.ts", "prices.ts", "promo.ts", "capacity.ts", "capacity-core.ts", "capacity-service.ts", "capacity-actions.ts", "waitlist.ts", "products.ts",
  "products-core.ts", "product-actions.ts", "departures.ts", "departures-core.ts", "departure-actions.ts", "departure-view-core.ts", "departure-screens.ts", "departure-desk.ts",
  "departure-screen-actions.ts", "resources.ts", "jobs.ts", "json-schemas.ts", "sellable-impl.ts", "pickup.ts", "pickup-core.ts", "pickup-actions.ts", "trips-settings.ts", "screen-actions.ts"].map((f) => MOD + f);
const FORBIDDEN_PATHS = ["prisma", "src/lib/core/settings", "src/lib/core/sellable.ts", "src/lib/core/permissions.ts", "src/lib/platform", "src/lib/payment", "src/app/api", "src/lib/outbox-consumers.ts",
  ...["pos", "account", "party", "approval", "hotel", "rooms", "booking", "dorm", "queue", "ticket", "agency", "supplier"].map((m) => `src/lib/modules/${m}`), ...TRIPS_FORBIDDEN_FILES,
  ...["p0.1", "t0.1", "t0.2", "t0.3", "t0.4", "t0.5", "t0.6", "t0.7", "t1.1", "t1.2", "a1.1"].map((w) => `scripts/qc-trips-${w}.mts`), "scripts/fitness.mts", "scripts/with-gate-lock.sh",
  "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts"];
/** ไฟล์ที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด (null = ไม่จำกัด)] */
const LIMITED: [string, number, number | null][] = [[MOD + "index.ts", 0, null], [MOD + "screens.ts", 3, 6], [SHARED, 1, null], [`${COMP}/ProductsScreenParts.tsx`, 3, null],
  ["src/messages/th/trips.json", 2, null], ["src/messages/en/trips.json", 2, null], ["scripts/trips-ui-inventory.json", 2, null], ["scripts/visual-trips.mts", 12, null], ["scripts/parity-trips.sh", 8, null]];
// seed / ภาพ 18
const AS_OF = new Date(FX.TRIPS_AS_OF);
const DIVE_TENANT = FX.SHOP_DIVE.tenant.id;
const DIVE_TRIPS_UNIT = FX.SHOP_DIVE.units.trips;
const DIVE_OWNER_ID = "tripsqc-user-dive-owner";
const SEED = { tenantId: DIVE_TENANT, actorUserId: DIVE_OWNER_ID };
const U0 = DIVE_TRIPS_UNIT.id;
const R = FX.PRODUCT_RACHA;
const D14 = FX.DEPARTURE_RACHA_1114.date;
const SEED_PARTY = { pattra: "tripsqc-party-dive-pattra", chen: "tripsqc-party-dive-chenyu", wittaya: "tripsqc-party-dive-wittaya" } as const;
const SEED_PAYABLE = { pattra: FX.BOOKING_TR_0142.totalSatang, chen: 2 * R.adultSatang + 2 * R.parkAdultSatang, wittaya: R.adultSatang + R.parkAdultSatang } as const; // 11,450 · 8,200 · 4,100 (ภาพ :45 :48 :50)
const TIME_TEXT = `${R.time.start}–${R.time.end}`;
// ร้านชั่วคราว
const NOW0 = "2027-03-01T03:00:00.000Z"; // 10:00 น. 1 มี.ค. 2570 (เวลาร้าน)
const TRAVEL = "2027-04-10"; // > 30 วัน ⇒ คืน 100% ตามแม่แบบ

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

// ═══════════════ ร้านชั่วคราว + กวาด ═══════════════
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

  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const PTI = await tryImport("@/lib/modules/party");
  const SHI = await tryImport("@/components/trips/trips-shared");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.3a ยังไม่สร้าง)`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const okR = (r: Rec, what: string) => ok(r.ok === true, `${what}: ${fmt(r)}`);
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const VM = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.vm) ?? {}; };
  const codeR = (r: Rec, codes: string | string[], what: string) => { const cs = Array.isArray(codes) ? codes : [codes]; ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`); };
  const constOf = (name: string): unknown => { const v = needTrips()[name]; if (v === undefined) throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.3a ยังไม่สร้าง)`); return v; };
  const rowsOf = (vm: Rec) => asArr(vm.rows);
  const rowOf = (vm: Rec, id: string) => rowsOf(vm).find((r) => r.bookingId === id) ?? null;

  // seed: การจองตรง 3 ใบของราชา ส. 14 พ.ย. (T0.6) — หาจากผู้จอง (เลขจองจริงมาจาก SellCounter)
  const seedBk = await q<{ id: string; code: string; bookerPartyId: string; departureId: string; productId: string; version: number }>(
    `SELECT id, code, "bookerPartyId", "departureId", "productId", version FROM "TripBooking" WHERE "tenantId" = $1 AND "unitId" = $2 AND "travelDate" = $3::date AND "bookerPartyId" = ANY($4::text[]) ORDER BY code`,
    [DIVE_TENANT, U0, D14, Object.values(SEED_PARTY)]).catch(() => []);
  const sb = (k: keyof typeof SEED_PARTY) => { const r = seedBk.find((x) => x.bookerPartyId === SEED_PARTY[k]); if (!r) throw new AssertFail(`ไม่มีการจอง seed ของ ${k}`); return r; };
  const seedProducts: Record<string, string> = {};
  for (const r of await q<{ id: string; slug: string }>(`SELECT id, slug FROM "TripProduct" WHERE "tenantId" = $1`, [DIVE_TENANT]).catch(() => [])) seedProducts[r.slug] = r.id;
  const seedCounts = async () => (await q<{ a: number; b: number; c: number; d: number; e: number }>(
    `SELECT (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = $1)::int AS a, (SELECT count(*) FROM "TripMoneyEvent" WHERE "tenantId" = $1)::int AS b,
            (SELECT count(*) FROM "TripPaymentDue" WHERE "tenantId" = $1)::int AS c, (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1)::int AS d,
            (SELECT count(*) FROM "OutboxEvent" WHERE "tenantId" = $1)::int AS e`, [DIVE_TENANT]))[0];

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed andaman-dive + หน่วย TRIPS andaman-dive-trips อยู่", async () => {
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "BusinessUnit" WHERE id = $1 AND "tenantId" = $2 AND type::text = 'TRIPS'`, [U0, DIVE_TENANT]);
    eq(r[0]?.n, 1, "หน่วย TRIPS ของ seed");
  });
  await st("PC-2", "seed T0.6: การจองตรง 3 ใบ ราชา ส. 14 พ.ย. (ภัทรา · Chen Yu · วิทยา) CONFIRMED · COUNTER · payable 11,450 / 8,200 / 4,100 · ยังไม่มีแถวเงิน/งวด/คำขอคืนเงิน", async () => {
    eq(seedBk.length, 3, "จำนวนการจอง seed");
    const rows = await q<{ status: string; channel: string; g: number }>(`SELECT status, channel, ("grossSatang" - "discountSatang" - "agentDiscountSatang")::int AS g FROM "TripBooking" WHERE id = ANY($1::text[]) ORDER BY "grossSatang" DESC`, [seedBk.map((x) => x.id)]);
    eq(rows.map((r) => [r.status, r.channel, r.g]), [["CONFIRMED", "COUNTER", SEED_PAYABLE.pattra], ["CONFIRMED", "COUNTER", SEED_PAYABLE.chen], ["CONFIRMED", "COUNTER", SEED_PAYABLE.wittaya]], "การจอง");
    const m = await q<{ n: number }>(`SELECT ((SELECT count(*) FROM "TripMoneyEvent" WHERE "bookingId" = ANY($1::text[])) + (SELECT count(*) FROM "TripRefundRequest" WHERE "bookingId" = ANY($1::text[])))::int AS n`, [seedBk.map((x) => x.id)]);
    eq(m[0]?.n, 0, "แถวเงิน/คำขอคืนเงินของ seed");
  });
  await st("PC-3", "ฟิกซ์เจอร์: TRIPS_AS_OF = 12 พ.ย. 2569 18:00 · RC-0588 ก่อนภาษี 9,299.07 VAT 650.93 เก็บแทน 1,500.00 รวม 11,450.00 · คำนวณถูก", () => {
    eq(AS_OF.toISOString(), "2026-11-12T11:00:00.000Z", "as-of");
    const rc = FX.RECEIPT_RC_0588;
    eq([rc.preVatSatang, rc.vatSatang, rc.parkPassThroughSatang, rc.totalSatang], [929_907, 65_093, 150_000, 1_145_000], "13ค");
    ok(FX.assertFixtureArithmetic().checks > 20, "assertFixtureArithmetic");
  });
  await st("PC-4", "บริการ T0.6/T0.7a ที่ใบนี้เรียกมีใน facade (getTripBooking · cancelTripBooking · approveTripBooking · bookTripsNow · quoteTrips · recordTripPayment · tripPaymentIntent · tripMoneySummary · tripCashDay · listTripRefunds · requestTripRefund · parseReason ผ่าน departure-view-core · tripsPageGate · loadTripsNav)", () => {
    for (const n of ["getTripBooking", "cancelTripBooking", "approveTripBooking", "bookTripsNow", "quoteTrips", "recordTripPayment", "tripPaymentIntent", "tripMoneySummary", "tripCashDay", "listTripRefunds",
      "requestTripRefund", "tripsPageGate", "loadTripsNav"]) fn(n);
    ok(/export function parseReason\b/.test(read(MOD + "departure-view-core.ts")), "departure-view-core ไม่มี parseReason");
    eq(needTrips().BOOKING_STATUSES, BOOKING_STATUSES, "BOOKING_STATUSES"); eq(needTrips().TRIP_REFUND_STATUSES, REFUND_ST, "TRIP_REFUND_STATUSES"); eq(needTrips().TRIP_TENDERS, TENDERS, "TRIP_TENDERS");
  });
  await st("PC-5", "action เดิมมีครบ (money-actions: recordTripPaymentAction · tripPaymentIntentAction · booking-actions: cancelTripBookingAction ส่ง canRequest/canDecide · approveTripBookingAction) · facade party มี listBriefsByIds · searchByName · getProfile · สิทธิ์ trips.booking.* / payment.record อยู่ในทะเบียน", () => {
    const ma = read(MOD + "money-actions.ts"), ba = read(MOD + "booking-actions.ts");
    for (const n of ["recordTripPaymentAction", "tripPaymentIntentAction"]) ok(new RegExp(`export async function ${n}\\b`).test(ma), `ไม่มี ${n}`);
    for (const n of ["cancelTripBookingAction", "approveTripBookingAction"]) ok(new RegExp(`export async function ${n}\\b`).test(ba), `ไม่มี ${n}`);
    ok(/canRequest:\s*can\("trips\.refund\.request"\)/.test(ba) && /canDecide:\s*can\("trips\.refund\.approve"\)/.test(ba), "cancelTripBookingAction ไม่ส่งสิทธิ์จริง");
    for (const n of ["listBriefsByIds", "searchByName", "getProfile"]) ok(typeof PTI.mod?.[n] === "function", `party facade ไม่มี ${n} (${PTI.err.slice(0, 60)})`);
    const perms = read("src/lib/core/permissions.ts");
    for (const k of ["trips.booking.view", "trips.booking.approve", "trips.booking.cancel", "trips.payment.record"]) ok(perms.includes(`"${k}"`), `ไม่มีสิทธิ์ ${k}`);
  });
  await st("PC-6", "ดัชนีที่ตัวโหลดต้องใช้มีอยู่: TripBooking (tenantId,unitId,status,travelDate) · (tenantId,code) · bookerPartyId · TripBookingItem/TripHold/TripRefundRequest/TripMoneyEvent bookingId · TripMoneyEvent (tenantId,postingStatus) · TripRefundRequest (tenantId,unitId,status)", async () => {
    const idx = (await q<{ i: string }>(`SELECT indexname AS i FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ('TripBooking','TripBookingItem','TripHold','TripRefundRequest','TripMoneyEvent','TripPaymentDue')`)).map((r) => r.i);
    const need = ["TripBooking_tenantId_unitId_status_travelDate_idx", "TripBooking_tenantId_code_key", "TripBooking_bookerPartyId_idx", "TripBookingItem_bookingId_idx", "TripHold_bookingId_idx",
      "TripRefundRequest_bookingId_idx", "TripRefundRequest_tenantId_unitId_status_idx", "TripMoneyEvent_bookingId_idx", "TripMoneyEvent_tenantId_postingStatus_idx", "TripPaymentDue_bookingId_seq_key"];
    const miss = need.filter((n) => !idx.includes(n));
    ok(miss.length === 0, `ไม่มีดัชนี: ${miss.join(", ")}`);
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์และกติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด (static) ──");
  const compFiles = walk(COMP);
  const appFiles = walk(APP);
  const uiFiles = [...compFiles, ...appFiles];
  const allSrc = uiFiles.map((f) => read(f)).join("\n");
  const t13Comp = compFiles.filter((f) => /^Booking/.test(basename(f)));
  const t13CompSrc = t13Comp.map((f) => read(f)).join("\n");
  const t13Files = [...OWN_MOD, ...t13Comp, PAGE, ...(existsSync(join(ROOT, OPT_ACTIONS)) ? [OPT_ACTIONS] : [])].filter((f) => existsSync(join(ROOT, f)));
  const needOwn = () => { ok(OWN_MOD.every((f) => existsSync(join(ROOT, f))) && t13Comp.some((f) => f.endsWith(".tsx")), "ไฟล์ของใบยังไม่ครบ (booking-view-core · booking-screens · Booking*.tsx)"); };
  await st("S-1", "ไฟล์เจ้าของครบ: booking-view-core.ts · booking-screens.ts · คอมโพเนนต์ src/components/trips/Booking*.tsx · หน้า bookings", () => {
    const miss = [...OWN_MOD, PAGE].filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
    ok(t13Comp.some((f) => f.endsWith(".tsx")), "ยังไม่มีคอมโพเนนต์ src/components/trips/Booking*.tsx");
  });
  await st("S-2", `facade trips: บล็อก "// TRIPS T1.3 ▸" ส่งออก ${FACADE_T13.length} ชื่อ · ไม่มี export *`, () => {
    const src = read(MOD + "index.ts");
    ok(/\/\/ TRIPS T1\.3 ▸/.test(src), "ไม่มีบล็อก // TRIPS T1.3 ▸");
    ok(!/export\s+\*/.test(stripComments(src)), "มี export *");
    const miss = FACADE_T13.filter((n) => needTrips()[n] === undefined);
    ok(miss.length === 0, `ยังไม่ส่งออก: ${miss.join(", ")}`);
  });
  await st("S-3", "หน้า bookings: ไม่ใช่ TripsNotYet · requireUnit + tripsPageGate(page \"bookings\") + loadBookingListVM (+ loadBookingDetailVM) · ไม่ส่ง now · TRIPS_NAV.bookings available (wo T1.3)", () => {
    const s = stripComments(read(PAGE));
    ok(s && !/TripsNotYet/.test(s), "หน้า bookings ยังเป็น TripsNotYet");
    ok(/requireUnit\(/.test(s) && /tripsPageGate\(/.test(s) && /["']bookings["']/.test(s) && /loadBookingListVM\(/.test(s) && /loadBookingDetailVM\(/.test(s), "หน้าไม่ผ่านด่าน/ไม่เรียกตัวโหลด");
    ok(!/\bnow\s*:/.test(s), "หน้าส่ง now (ต้องใช้นาฬิกาจริง)");
    ok(/notFound\(/.test(s), "รายละเอียดของหน่วยอื่น/ไม่มี ต้อง notFound()");
    const nav = asArr(SHI.mod?.TRIPS_NAV).find((x) => x.key === "bookings");
    eq([nav?.available, nav?.wo], [true, "T1.3"], "TRIPS_NAV.bookings");
  });
  await st("S-4", "ไม่มี prisma ในหน้า/คอมโพเนนต์ · ไฟล์โมดูลใหม่ไม่ import prisma ตรง (tenantDb ในโมดูลเท่านั้น)", () => {
    needOwn();
    const badUi = uiFiles.filter((f) => /@\/lib\/core\/db|@prisma\/client["']|\bprisma\./.test(stripComments(read(f)).replace(/import\s+type[^;]+;/g, "")));
    const badMod = t13Files.filter((f) => f.startsWith(MOD) && /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']|@prisma\/client["']/.test(stripComments(read(f)).replace(/import\s+type[^;]+;/g, "")));
    ok(badUi.length === 0 && badMod.length === 0, `prisma: ${[...badUi, ...badMod].join(", ")}`);
  });
  await st("S-5", "ไม่มี any ในไฟล์ของใบ (โมดูล · คอมโพเนนต์ Booking* · หน้า)", () => {
    needOwn();
    const bad = t13Files.filter((f) => /:\s*any\b|\bas\s+any\b|<any>|\bany\[\]/.test(stripComments(read(f))));
    ok(bad.length === 0, `มี any: ${bad.join(", ")}`);
  });
  await st("S-6", "'use client' ไม่ import ของที่ลากถึง prisma (facade trips · core/settings · core/db · ไฟล์โมดูลที่ไม่ใช่ \"use server\" แต่ใช้ tenantDb)", () => {
    const clients = t13Comp.filter((f) => /^\s*["']use client["']/.test(read(f)));
    ok(clients.length > 0, "ยังไม่มีไฟล์ 'use client' ของ T1.3");
    const bad: string[] = [];
    for (const f of clients) {
      const src = stripComments(read(f));
      for (const m of src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s*["']([^"']+)["']/gm)) {
        if (m[1]) continue;
        const spec = m[2] ?? "";
        if (/^@\/lib\/core\/db|^@prisma\/client$|^@\/lib\/core\/settings$|^@\/lib\/core\/settings\/(service|form|index)|^@\/lib\/modules\/trips$|^@\/lib\/modules\/trips\/index|^@\/lib\/modules\/party/.test(spec)) { bad.push(`${f} → ${spec}`); continue; }
        const mm = /^@\/lib\/modules\/trips\/([\w-]+)$/.exec(spec);
        if (mm) {
          const dep = read(`${MOD}${mm[1]}.ts`);
          const isServerAction = /^\s*["']use server["']/.test(dep);
          if (!isServerAction && /@\/lib\/core\/db|tenantDb|@prisma\/client["']/.test(stripComments(dep).replace(/import\s+type[^;]+;/g, ""))) bad.push(`${f} → ${spec} (ลาก db)`);
        }
      }
    }
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-7", `data-testid ครบในซอร์ส: ตายตัว ${TESTIDS_FIXED.length} + แพตเทิร์น ${TESTID_PATTERNS.length}`, () => {
    needOwn();
    const miss = TESTIDS_FIXED.filter((t) => !new RegExp(`data-testid=\\{?["'\`]${t}["'\`]`).test(allSrc));
    const missP = TESTID_PATTERNS.filter((p) => !allSrc.includes(`\`${p}\${`) && !allSrc.includes(`"${p}" +`) && !allSrc.includes(`'${p}' +`));
    ok(miss.length === 0 && missP.length === 0, `ขาด: ${[...miss, ...missP.map((p) => p + "*")].slice(0, 12).join(", ")}${miss.length + missP.length > 12 ? " …" : ""}`);
  });
  await st("S-8", "ทะเบียนปุ่ม: แถว wo T1.3 ครอบ testid ของใบ · page /app/u/[unitSlug]/trips/bookings · roles ถูก · needs = คีย์สิทธิ์ trips จริง · ไม่มีแถวผีทั้งไฟล์", () => {
    const raw = read("scripts/trips-ui-inventory.json");
    ok(raw, "ไม่มี scripts/trips-ui-inventory.json");
    const rows = asArr(asRec(JSON.parse(raw))?.rows);
    const mine = rows.filter((r) => r.wo === "T1.3");
    ok(mine.length > 0, "ยังไม่มีแถว wo T1.3");
    const kinds = ["button", "link", "menu", "tab", "toggle", "drag", "form", "filter", "input", "textarea", "select", "notice"];
    const perms = read("src/lib/core/permissions.ts");
    const bad = mine.filter((r) => typeof r.page !== "string" || !String(r.page).startsWith("/app/u/[unitSlug]/trips/bookings") || typeof r.testid !== "string" || !kinds.includes(String(r.kind))
      || !Array.isArray(r.roles) || (r.roles as unknown[]).length === 0 || !(r.roles as unknown[]).every((x) => ["owner", "editor", "viewer"].includes(String(x))) || r.system !== "TRIPS" || !asRec(r.expect)?.type
      || (typeof r.needs === "string" && !String(r.needs).split(/[|,\s]+/).filter(Boolean).every((k) => perms.includes(`"${k}"`))));
    ok(bad.length === 0, `แถวพิการ ${bad.length}: ${fmt(bad[0])}`);
    const ids = mine.map((r) => String(r.testid));
    const miss = [...TESTIDS_FIXED.filter((t) => !ids.includes(t)), ...TESTID_PATTERNS.filter((p) => !ids.includes(`${p}*`)).map((p) => `${p}*`)];
    ok(miss.length === 0, `ไม่มีแถว: ${miss.slice(0, 10).join(", ")}`);
    const ghost = rows.map((r) => String(r.testid)).filter((t) => (t.endsWith("*") ? !allSrc.includes(t.slice(0, -1)) : !allSrc.includes(t)));
    ok(ghost.length === 0, `แถวผี: ${ghost.slice(0, 8).join(", ")}`);
  });
  await st("S-9", "i18n: th/en คีย์ตรงกัน · คีย์ขั้นต่ำของใบครบ (สถานะการจอง 9 · ต้องทำ 4 · เงิน 6 · วิธีจ่าย · งวด · คำขอคืน 8 · เหตุผล) · ค่าอังกฤษใต้ bookings ไม่มีอักษรไทย", () => {
    const flat = (o: unknown, p = ""): [string, unknown][] => { const r = asRec(o); return r ? Object.entries(r).flatMap(([k, v]) => (asRec(v) ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v] as [string, unknown]])) : []; };
    const th = read("src/messages/th/trips.json"), en = read("src/messages/en/trips.json");
    ok(th && en, "ไม่มี trips.json");
    const kt = flat(JSON.parse(th)).map(([k]) => k).sort(), fe = flat(JSON.parse(en));
    eq(kt, fe.map(([k]) => k).sort(), "คีย์ th = en");
    const miss = I18N_REQUIRED.filter((k) => !kt.includes(k));
    ok(miss.length === 0, `คีย์ขาด ${miss.length}: ${miss.slice(0, 10).join(", ")}`);
    const thaiEn = fe.filter(([k, v]) => k.startsWith("bookings.") && typeof v === "string" && /[฀-๿]/.test(v)).map(([k]) => k);
    ok(thaiEn.length === 0, `en มีอักษรไทย: ${thaiEn.slice(0, 5).join(", ")}`);
  });
  await st("S-10", "ไม่แสดงรหัสดิบบนจอ: คอมโพเนนต์ Booking* ไม่มี {x.status|kind|channel|tender|postingStatus|money|collectMode|reasonKind|badge.kind} เป็นข้อความ JSX (แอตทริบิวต์ได้)", () => {
    needOwn();
    const bad = t13Comp.filter((f) => /[^=\s$]\s*\{\s*[\w.?]+\.(status|state|kind|channel|tender|postingStatus|money|collectMode|reasonKind|departureStatus)\s*\}/.test(stripComments(read(f))));
    ok(bad.length === 0, `แสดงรหัสดิบ: ${bad.join(", ")}`);
  });
  await st("S-11", "วันเวลา: ไฟล์ของใบไม่ใช้ getDay/getDate/getHours/getMinutes/getMonth/getFullYear หรือ toLocaleDateString/TimeString · คอมโพเนนต์ไม่สร้าง Date จากนาฬิกา (new Date() / Date.now())", () => {
    needOwn();
    const bad = t13Files.filter((f) => /\.(getDay|getDate|getHours|getMinutes|getMonth|getFullYear)\(|toLocale(Date|Time)String\(/.test(stripComments(read(f))));
    const clock = t13Comp.filter((f) => /new Date\(\s*\)|Date\.now\(/.test(stripComments(read(f))));
    ok(bad.length === 0 && clock.length === 0, `ใช้เวลาเครื่อง: ${[...bad, ...clock].join(", ")}`);
  });
  await st("S-12", "เขียนผ่าน action เดิมเท่านั้น: คอมโพเนนต์ import recordTripPaymentAction · tripPaymentIntentAction (money-actions) · cancelTripBookingAction · approveTripBookingAction (booking-actions) · ถ้ามี booking-screen-actions.ts = \"use server\" + async function + requireUnit ทุกตัว", () => {
    needOwn();
    for (const [n, f] of [["recordTripPaymentAction", "money-actions"], ["tripPaymentIntentAction", "money-actions"], ["cancelTripBookingAction", "booking-actions"], ["approveTripBookingAction", "booking-actions"]] as const) {
      const imp = [...t13CompSrc.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/modules\/trips\/([\w-]+)["']/g)].some((m) => m[2] === f && new RegExp(`\\b${n}\\b`).test(m[1] ?? ""));
      ok(imp, `คอมโพเนนต์ไม่ import ${n} จาก trips/${f}`);
    }
    if (existsSync(join(ROOT, OPT_ACTIONS))) {
      const raw = read(OPT_ACTIONS), s = stripComments(raw);
      ok(/^\s*["']use server["']/.test(raw), "booking-screen-actions ไม่มี \"use server\"");
      ok(!/export\s+(const|let|type|interface|class|function\s)/.test(s.replace(/export\s+async\s+function/g, "")), "ส่งออกสิ่งที่ไม่ใช่ async function");
      const noGate = s.split(/export\s+async\s+function\s+/).slice(1).filter((b) => !/requireUnit\(/.test(b.slice(0, 600))).map((b) => b.slice(0, 30));
      ok(noGate.length === 0, `action ไม่ผ่าน requireUnit: ${noGate.join(", ")}`);
    }
  });
  await st("S-13", `ขอบเขต (เทียบ BASE ${BASE_SHA.slice(0, 9)} · ไม่นับไฟล์ที่ตรงกับ session/trips): ไม่แตะ prisma/settings/sellable/permissions/platform/payment/api/โมดูลอื่น/ไฟล์บริการ trips/ข้อสอบเดิม/seed · ไฟล์ที่แก้ได้จำกัดจำนวนบรรทัด`, () => {
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
      if (d > maxDel || (maxAdd !== null && a > maxAdd)) over.push(`${f} +${a}/−${d} (ได้ +${maxAdd ?? "∞"}/−${maxDel})`);
    }
    ok(over.length === 0, over.join(" · "));
    const scr = git(["diff", "-U0", BASE_SHA, "--", MOD + "screens.ts"]);
    ok(!scr.trim() || /trips\.booking\.view/.test(scr), "screens.ts เปลี่ยนแต่ไม่ใช่เรื่องสิทธิ์เห็นแท็บการจอง");
  });
  await st("S-14", "ไฟล์โมดูลของใบไม่เขียนฐาน (ไม่มี create/update/delete/upsert/INSERT/UPDATE/DELETE · ไม่มี $transaction · ไม่แตะ TripCashClose)", () => {
    needOwn();
    const files = t13Files.filter((f) => f.startsWith(MOD) && f !== OPT_ACTIONS);
    const bad = files.filter((f) => /\.(delete|deleteMany|create|createMany|update|updateMany|upsert)\(|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"|\$transaction\(|\$executeRaw|tripCashClose|TripCashClose/i.test(stripComments(read(f))));
    ok(bad.length === 0, `เขียน/แตะตาราง: ${bad.join(", ")}`);
  });
  await st("S-15", "ไม่แตะ POS/บัญชี/โรงแรม/ส่วนในของ party: ไฟล์ของใบไม่ import modules/{pos,account,hotel,rooms,dorm,approval} หรือ modules/party/<ไฟล์ใน> (facade @/lib/modules/party เท่านั้น) · ไม่มีคำว่า \"เก็บเงินที่ POS\"/\"ผ่าน POS\" ในข้อความ bookings", () => {
    needOwn();
    const bad = t13Files.filter((f) => /from\s*["']@\/lib\/modules\/(pos|account|hotel|rooms|dorm|approval)\b|from\s*["']@\/lib\/modules\/party\/|from\s*["']@\/lib\/payment/.test(stripComments(read(f))));
    ok(bad.length === 0, `import ต้องห้าม: ${bad.join(", ")}`);
    const msgs = `${read("src/messages/th/trips.json")}\n${read("src/messages/en/trips.json")}`;
    const bk = msgs.match(/"bookings"\s*:\s*\{[\s\S]*/)?.[0] ?? "";
    ok(bk, "ยังไม่มี subtree bookings");
    ok(!/เก็บเงินที่ POS|ผ่าน POS|collect at (the )?POS|via POS/i.test(bk), "ข้อความชวนเก็บเงินที่ POS (OQ17 ก)");
  });
  await st("S-16", "ตัวโหลดมีเพดาน + ไม่ N+1: มี take · ไม่มี await ในลูป · ไม่มี .map(async · listBriefsByIds (ชื่อเป็นชุด) · searchByName(…, 25) · getProfile ≤ 1 ที่ · นับชิปด้วย count แยก", () => {
    const s = stripComments(read(LOADER));
    ok(s, "ยังไม่มี booking-screens.ts");
    ok(/\btake\s*:|\bLIMIT\b/.test(s), "ไม่มี take/LIMIT");
    ok(!/for\s*\([^)]*\)\s*\{[^}]{0,500}\bawait\b/.test(s) && !/\.map\(\s*async\b/.test(s) && !/forEach\(\s*async\b/.test(s), "await ในลูป / map(async) (N+1)");
    ok(/listBriefsByIds\(/.test(s) && /searchByName\([^)]*\b25\b/.test(s), "ไม่ใช้ listBriefsByIds / searchByName ≤ 25");
    ok((s.match(/getProfile\(/g) ?? []).length <= 1, "เรียก getProfile หลายที่ (ต้องเฉพาะรายละเอียด 1 ราย)");
    ok(/\bcount\s*\(|_count|count\(\*\)/i.test(s), "ไม่มีคิวรีนับแยก");
    ok(/TRIPS_BOOKING_LIST_CAP/.test(s) && /TRIPS_MONEY_DOCS_CAP/.test(s) && /TRIPS_CASH_EVENTS_CAP/.test(s), "ไม่ใช้ค่าคงที่เพดาน");
  });
  await st("S-17", "กล่องโต้ตอบ: ไฟล์ Booking* ที่มี role=dialog ต้องจัดการ Escape · ใช้ <Dialog ของ T1.1 · ลิ้นชักไม่ปิดเมื่อมีกล่องอื่นเปิดทับ (นับ [role=dialog])", () => {
    needOwn();
    const own = t13Comp.filter((f) => /role=["{'`]+dialog/.test(read(f)) && !/Escape/.test(read(f)));
    ok(own.length === 0, `กล่องเขียนเองไม่มี Escape: ${own.join(", ")}`);
    ok(/<Dialog\b/.test(t13CompSrc), "ไม่ใช้ Dialog ของ ProductsScreenParts");
    ok(/querySelectorAll\(\s*['"`]\[role=["']?dialog["']?\]['"`]\s*\)/.test(t13CompSrc), "ลิ้นชักไม่ตรวจกล่องที่เปิดทับ");
  });
  await st("S-18", "ตาราง/มือถือ: ทุก <table อยู่ในกล่อง relative min-w-0 overflow-x-auto · ไม่มี sr-only ในไฟล์ที่มี <table · มี trips-bk-cards + ตารางซ่อนใต้ md · ปุ่มลิ้นชัก trips-bk-actions เป็นกริด 2 คอลัมน์", () => {
    needOwn();
    const tableFiles = t13Comp.filter((f) => /<table/.test(read(f)));
    ok(tableFiles.length > 0, "ไม่มีตาราง");
    const unwrapped: string[] = [];
    for (const f of tableFiles) {
      const s = read(f);
      for (const m of s.matchAll(/<table/g)) {
        const before = s.slice(Math.max(0, (m.index ?? 0) - 400), m.index);
        const last = [...before.matchAll(/className=\{?\s*(["'`]([^"'`]*)["'`]|([A-Za-z_$][\w$]*))/g)].pop();
        let cls = last?.[2] ?? "";
        if (!cls && last?.[3]) cls = new RegExp(`\\b${last[3]}\\s*=\\s*["'\`]([^"'\`]*)`).exec(t13CompSrc)?.[1] ?? "";
        if (!/\brelative\b/.test(cls) || !/\bmin-w-0\b/.test(cls) || !/\boverflow-x-auto\b/.test(cls)) unwrapped.push(f);
      }
    }
    ok(unwrapped.length === 0, `ตารางไม่อยู่ในกล่องเลื่อน: ${[...new Set(unwrapped)].join(", ")}`);
    const srTable = tableFiles.filter((f) => /sr-only/.test(read(f)));
    ok(srTable.length === 0, `sr-only ในไฟล์ตาราง: ${srTable.join(", ")}`);
    ok(t13CompSrc.includes("trips-bk-cards"), "ไม่มีการ์ดมือถือ");
    const tb = t13CompSrc.indexOf("trips-bk-table");
    ok(tb >= 0 && /hidden\s+md:|max-md:hidden/.test(t13CompSrc.slice(Math.max(0, tb - 400), tb + 400)), "ตารางไม่ซ่อนใต้ md");
    const at = t13CompSrc.indexOf("trips-bk-actions");
    ok(at >= 0 && /grid-cols-2/.test(t13CompSrc.slice(Math.max(0, at - 400), at + 400)), "trips-bk-actions ไม่ใช่กริด 2 คอลัมน์");
  });
  await st("S-19", "เครื่องมือภาพ: visual-trips มีสเปก t1.3 4 ฉาก (mockup 18 · booking0142 หาจาก Party ภัทรา) · parity-trips.sh รู้จัก 18 และ 15", () => {
    const v = read("scripts/visual-trips.mts");
    ok(/["']t1\.3["']/.test(v), "ไม่มีสเปก t1.3");
    const miss = VISUAL_SCENES.filter((n) => !v.includes(`"${n}"`) && !v.includes(`'${n}'`));
    ok(miss.length === 0, `ฉากขาด: ${miss.join(", ")}`);
    ok(/["']18["']/.test(v) && /booking0142/.test(v) && /tripsqc-party-dive-pattra|SEED_PARTY|DIVE_PARTIES|BOOKING_TR_0142/.test(v), "ไม่มี mockup 18 / booking0142 จาก seed");
    const p = read("scripts/parity-trips.sh");
    ok(/18-shop-bookings/.test(p) && /15-refund-flow/.test(p), "parity-trips.sh ไม่รู้จัก 18/15");
  });
  await st("S-20", "pure: booking-view-core.ts มีแต่ import type (ไม่มี import ค่า) · ไม่อ่าน new Date() / Date.now() · ไม่มี getDay ฯลฯ", () => {
    const s = stripComments(read(PURE));
    ok(s, "ยังไม่มี booking-view-core.ts");
    const imps = [...s.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s*["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    ok(imps.length === 0, `import ค่า: ${imps.join(", ")}`);
    ok(!/new Date\(\s*\)|Date\.now\(|Math\.random\(/.test(s), "อ่านนาฬิกา/สุ่ม");
  });
  await st("S-21", "ไคลเอนต์ไม่คิดเงิน: Booking* ใช้ formatBaht · ไม่มี toFixed/toLocaleString/parseFloat/Intl.NumberFormat/หาร 100 · ไม่เรียกสูตรเงินของ money-core · ยอดที่พิมพ์อ่านด้วย parseAmountSatang", () => {
    needOwn();
    ok(/formatBaht\(/.test(t13CompSrc), "ไม่ใช้ formatBaht");
    const s = stripComments(t13CompSrc);
    ok(!/\.toFixed\(|toLocaleString\(|parseFloat\(|Intl\.NumberFormat|\/\s*100\b/.test(s), "แปลงเงินเอง (float/หาร 100)");
    ok(!/allocatePayment|receiptVatSatang|refundQuoteFromSnapshot|moneyDocumentOf|vatOfInclusive|mulBpHalfUp|mulDivHalfUp|dueDraftsFromSnapshot/.test(s), "คอมโพเนนต์เรียกสูตรเงิน");
    ok(/parseAmountSatang\(/.test(s), "ไม่ใช้ parseAmountSatang อ่านยอด");
  });
  await st("S-22", "กันกดซ้ำต่อเจตนา: คอมโพเนนต์ใช้ intentKey(\"pay\" …) และ intentKey(\"cxl\" …) · seed สุ่มครั้งเดียว (getRandomValues/randomUUID ใน useState/useRef) · ปุ่มยืนยัน disabled ระหว่างส่ง", () => {
    needOwn();
    const s = stripComments(t13CompSrc);
    ok(/intentKey\(\s*["']pay["']/.test(s) && /intentKey\(\s*["']cxl["']/.test(s), "ไม่ใช้ intentKey ของรับเงิน/ยกเลิก");
    ok(/getRandomValues|randomUUID/.test(s), "ไม่มีตัวสุ่ม seed");
    ok(/use(State|Ref)\(\s*(\(\)\s*=>[\s\S]{0,200})?(getRandomValues|randomUUID|\w*[sS]eed\w*)/.test(s), "seed ไม่ได้สร้างครั้งเดียวต่อการเปิดกล่อง (useState/useRef initializer)");
    const at = s.indexOf("trips-pay-confirm");
    ok(at >= 0 && /disabled=\{[^}]*(busy|pending|saving|submitting)/i.test(s.slice(Math.max(0, at - 500), at + 500)), "ปุ่มยืนยันรับเงินไม่ disabled ระหว่างส่ง");
  });
  await st("S-23", "ไม่ส่งฟิลด์ที่บริการปฏิเสธ: Booking* ไม่มี note: · holdMinutes · moveToSlotId · choice: · pay: { tender · ยกเลิกส่ง mode \"EXECUTE\" · อนุมัติส่ง expectedVersion", () => {
    needOwn();
    const s = stripComments(t13CompSrc);
    ok(!/\bnote\s*:|holdMinutes|moveToSlotId|\bchoice\s*:|pay\s*:\s*\{[^}]*tender/.test(s), "ส่งฟิลด์ที่ถูกปฏิเสธ (note/holdMinutes/choice/…)");
    ok(/mode\s*:\s*["']EXECUTE["']/.test(s) && /expectedVersion\s*:/.test(s), "ยกเลิกไม่ส่ง EXECUTE / อนุมัติไม่ส่ง expectedVersion");
  });
  await st("S-24", "ข้อความใต้ bookings.* ไม่มีรหัสใบงาน (T1.3 A1.4 OQ21 …) และไม่ว่าง · เหตุผลยกเลิกรอบผ่าน parseReason/useReasonText · ชื่ออังกฤษใช้เมื่อมี (titleEn/labelEn/nameEn)", () => {
    needOwn();
    const flat = (o: unknown, p = ""): [string, unknown][] => { const r = asRec(o); return r ? Object.entries(r).flatMap(([k, v]) => (asRec(v) ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v] as [string, unknown]])) : []; };
    for (const loc of ["th", "en"]) {
      const f = flat(asRec(JSON.parse(read(`src/messages/${loc}/trips.json`) || "{}"))?.bookings, "bookings.");
      ok(f.length > 0, `ไม่มี bookings.* (${loc})`);
      const bad = f.filter(([, v]) => typeof v !== "string" || !v.trim() || /\b(T|A|W|L|K|S|C|X|P)\d\.\d+[abc]?\b|\bOQ\d+\b/.test(String(v))).map(([k]) => k);
      ok(bad.length === 0, `${loc}: ค่าว่าง/มีรหัสใบ ${bad.slice(0, 5).join(", ")}`);
    }
    const s = stripComments(t13CompSrc);
    ok(/useReasonText|parseReason/.test(s), "ไม่ถอดเหตุผลยกเลิกรอบ");
    ok(/titleEn/.test(s) && /labelEn/.test(s) && /nameEn/.test(s), "ไม่ใช้ชื่ออังกฤษเมื่อมี");
  });
  await st("S-25", "ตัวโหลดไม่ตรึงเลขธุรกิจ/เขตเวลา: ไม่มี \"Asia/Bangkok\" · +07:00 · 7 * 60 · 25200 ใน booking-screens/booking-view-core (ใช้ utcToLocal/normalizeTimezone)", () => {
    needOwn();
    const bad = OWN_MOD.filter((f) => /Asia\/Bangkok|\+07:00|7\s*\*\s*60\b|25_?200\b|7\s*\*\s*3_?600/.test(stripComments(read(f)).replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (m) => (/Asia\/Bangkok|\+07:00/.test(m) ? m : '""'))));
    ok(bad.length === 0, `ตรึงเขตเวลา: ${bad.join(", ")}`);
    ok(/utcToLocal\(/.test(read(LOADER)), "ตัวโหลดไม่ใช้ utcToLocal");
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (booking-view-core) ──");
  const pf = (name: string, ...a: unknown[]): unknown => fn(name)(...a);
  await st("P-1", "ค่าคงที่: WHENS · CHIPS · ATTENTION (ลำดับความสำคัญ) · MONEY_STATES (ลำดับตัดสิน) · OWES · เพดาน 3 ตัวอยู่ใน 50–200", () => {
    eq([constOf("BOOKING_LIST_WHENS"), constOf("BOOKING_LIST_CHIPS"), constOf("BOOKING_ATTENTION_KINDS"), constOf("BOOKING_MONEY_STATES"), constOf("BOOKING_OWES_STATUSES")],
      [WHENS, CHIPS, ATTENTION, MONEY_STATES, OWES], "ค่าคงที่");
    for (const c of ["TRIPS_BOOKING_LIST_CAP", "TRIPS_MONEY_DOCS_CAP", "TRIPS_CASH_EVENTS_CAP"]) { const v = constOf(c); ok(Number.isInteger(v) && num(v) >= 50 && num(v) <= 200, `${c} = ${fmt(v)}`); }
  });
  await st("P-2", "outstandingOf: CONFIRMED 1,145,000/0 ⇒ 1,145,000 · PART_PAID จ่าย 400,000 ⇒ 745,000 · HOLD ⇒ ค้าง · PAID/CANCELLED/EXPIRED/TRAVELLED ⇒ 0 · จ่ายเกิน ⇒ 0", () => {
    const o = (status: string, paid: number, payable = 1_145_000) => pf("outstandingOf", { status, payableSatang: payable, paidSatang: paid });
    eq([o("CONFIRMED", 0), o("PART_PAID", 400_000), o("HOLD", 0), o("PENDING", 0), o("PAID", 1_145_000), o("CANCELLED", 0), o("EXPIRED", 0), o("TRAVELLED", 0), o("CONFIRMED", 1_200_000)],
      [1_145_000, 745_000, 1_145_000, 1_145_000, 0, 0, 0, 0, 0], "ยอดค้าง");
  });
  await st("P-3", "moneyStateOf ตามลำดับ: เอเจนซี่ก่อนทุกอย่าง · คืนแล้ว · ยกเลิก/หมดเวลาไม่จ่าย = NONE · จ่ายครบ · บางส่วน · ยังไม่จ่าย", () => {
    const m = (o: Rec) => pf("moneyStateOf", { status: "CONFIRMED", collectMode: "SHOP", agentAccountId: null, payableSatang: 820_000, paidSatang: 0, refundedSatang: 0, ...o });
    eq([m({ collectMode: "AGENT" }), m({ agentAccountId: "ag1", paidSatang: 820_000 }), m({ status: "CANCELLED", paidSatang: 820_000, refundedSatang: 820_000 }), m({ status: "CANCELLED" }), m({ status: "EXPIRED" }),
      m({ payableSatang: 0 }), m({ status: "PAID", paidSatang: 820_000 }), m({ status: "PART_PAID", paidSatang: 100 }), m({}), m({ status: "HOLD" })],
      ["AGENT_COLLECTS", "AGENT_COLLECTS", "REFUNDED", "NONE", "NONE", "NONE", "PAID", "PART_PAID", "UNPAID", "UNPAID"], "สถานะเงิน");
  });
  await st("P-4", "bookingBadgeOf: ต้องทำ ⇒ alert + ตัวแรก · HOLD/PENDING ⇒ dashed · CONFIRMED/PART_PAID/PAID ⇒ solid · จบแล้ว/ไม่รู้จัก ⇒ muted", () => {
    const b = (status: string, attention: string[] = []) => pf("bookingBadgeOf", { status, attention });
    eq([b("PAID", ["REFUND_OPEN", "OVERDUE"]), b("PENDING", ["PENDING_APPROVAL"]), b("HOLD"), b("PENDING"), b("CONFIRMED"), b("PART_PAID"), b("PAID"), b("CANCELLED"), b("EXPIRED"), b("NO_SHOW"), b("TRAVELLED"), b("WHAT")],
      [{ kind: "REFUND_OPEN", shape: "alert" }, { kind: "PENDING_APPROVAL", shape: "alert" }, { kind: "HOLD", shape: "dashed" }, { kind: "PENDING", shape: "dashed" }, { kind: "CONFIRMED", shape: "solid" },
        { kind: "PART_PAID", shape: "solid" }, { kind: "PAID", shape: "solid" }, { kind: "CANCELLED", shape: "muted" }, { kind: "EXPIRED", shape: "muted" }, { kind: "NO_SHOW", shape: "muted" },
        { kind: "TRAVELLED", shape: "muted" }, { kind: "WHAT", shape: "muted" }], "ป้าย");
  });
  await st("P-5", "listWindowOf: upcoming/today/tomorrow/next7/past30/all ณ 2026-11-12 · ข้ามปี (2026-12-29 next7 ⇒ 2027-01-04 · 2027-01-10 past30 ⇒ 2026-12-11..2027-01-09) · ผิด ⇒ null", () => {
    const w = (when: string, today: string) => pf("listWindowOf", when, today);
    eq([w("upcoming", "2026-11-12"), w("today", "2026-11-12"), w("tomorrow", "2026-11-12"), w("next7", "2026-11-12"), w("past30", "2026-11-12"), w("all", "2026-11-12")],
      [{ from: "2026-11-12", to: null }, { from: "2026-11-12", to: "2026-11-12" }, { from: "2026-11-13", to: "2026-11-13" }, { from: "2026-11-12", to: "2026-11-18" }, { from: "2026-10-13", to: "2026-11-11" }, { from: null, to: null }], "หน้าต่าง");
    eq([w("next7", "2026-12-29"), w("past30", "2027-01-10"), w("tomorrow", "2026-12-31")], [{ from: "2026-12-29", to: "2027-01-04" }, { from: "2026-12-11", to: "2027-01-09" }, { from: "2027-01-01", to: "2027-01-01" }], "ข้ามปี");
    eq([w("soon", "2026-11-12"), w("today", "2026-02-30"), w("today", "12/11/2026")], [null, null, null], "ผิดรูป");
  });
  await st("P-6", "maskPhone: 081-234-5523 / +66812345523 / 66 81 234 5523 ⇒ 081-xxx-5523 · 7–8 หลัก ⇒ xxx-<4 ท้าย> · สั้น ⇒ xxx · ว่าง/null ⇒ null", () => {
    const m = (p: unknown) => pf("maskPhone", p);
    eq([m("081-234-5523"), m("+66812345523"), m("66 81 234 5523"), m("0761234567"), m("1234567"), m("12345"), m(""), m(null), m(undefined)],
      ["081-xxx-5523", "081-xxx-5523", "081-xxx-5523", "076-xxx-4567", "xxx-4567", "xxx", null, null, null], "ปิดบังเบอร์");
  });
  await st("P-7", "parseAmountSatang: จำนวนเต็ม ไม่ผ่าน float · \"11,450.00\" ⇒ 1,145,000 · \"0.1\" ⇒ 10 · \"1 000.5\" ⇒ 100,050 · 3 ตำแหน่ง/ลบ/0/ว่าง/เกิน int4 ⇒ null", () => {
    const p = (t: string) => pf("parseAmountSatang", t);
    eq([p("11,450.00"), p("0.1"), p("1 000.5"), p("4100"), p("21474836.47"), p("12.345"), p("-5"), p("0"), p("0.00"), p(""), p("abc"), p("21474836.48"), p("1e3")],
      [1_145_000, 10, 100_050, 410_000, 2_147_483_647, null, null, null, null, null, null, null, null], "ยอด");
  });
  await st("P-8", "bookingCodeQuery: \" tr-6911-0001 \" ⇒ TR-6911-0001 · LB-7002-0031 · TR-6911-10000 ⇒ ตัวใหญ่ · ชื่อ/ไม่ครบ ⇒ null · รูปตรงกับ BOOKING_CODE_RE ของ numbering", () => {
    const c = (t: string) => pf("bookingCodeQuery", t);
    eq([c(" tr-6911-0001 "), c("LB-7002-0031"), c("TR-6911-10000"), c("ภัทรา"), c("TR-6911"), c("TR-6911-001"), c("TRIPS-6911-0001")],
      ["TR-6911-0001", "LB-7002-0031", "TR-6911-10000", null, null, null, null], "เลขจอง");
    eq(String(needTrips().BOOKING_CODE_RE), "/^[A-Z]{1,4}-\\d{4}-\\d{4,}$/", "BOOKING_CODE_RE (ฐานของรูปเดียวกัน)");
  });
  await st("P-9", "intentKey: ค่าเดียวกัน ⇒ คีย์เดียวกัน · ส่วนใดเปลี่ยน/seed เปลี่ยน ⇒ คีย์ใหม่ · รูป [A-Za-z0-9_-]{8,100} · ขึ้นต้น prefix_seed_", () => {
    const k = (p: string, s: string, parts: unknown[]) => String(pf("intentKey", p, s, parts));
    const a = k("pay", "abc12345", ["b1", 410_000, "CASH", null]);
    eq(a, k("pay", "abc12345", ["b1", 410_000, "CASH", null]), "คงที่");
    const others = [k("pay", "abc12345", ["b1", 410_001, "CASH", null]), k("pay", "abc12345", ["b1", 410_000, "CARD", null]), k("pay", "zzz99999", ["b1", 410_000, "CASH", null]), k("cxl", "abc12345", ["b1", 410_000, "CASH", null])];
    ok(others.every((x) => x !== a) && new Set(others).size === others.length, `คีย์ชน: ${fmt([a, ...others])}`);
    ok([a, ...others].every((x) => /^[A-Za-z0-9_-]{8,100}$/.test(x)), `รูปคีย์: ${fmt(a)}`);
    ok(a.startsWith("pay_abc12345_"), `ขึ้นต้น: ${a}`);
  });
  await st("P-10", "intentKey ทนข้อมูลแปลก: prefix/seed มีอักขระพิเศษ/ยาวมาก ⇒ ยังตรงรูปและ ≤ 100 · parts มีอักษรไทย/ยาว 1,000 ตัว ⇒ คีย์คงที่", () => {
    const x = String(pf("intentKey", "pay!@#ยาว", "ก".repeat(80) + "Ab9".repeat(30), ["ไทย".repeat(300), 1, true, null]));
    ok(/^[A-Za-z0-9_-]{8,100}$/.test(x), `รูป: ${x}`);
    eq(x, String(pf("intentKey", "pay!@#ยาว", "ก".repeat(80) + "Ab9".repeat(30), ["ไทย".repeat(300), 1, true, null])), "คงที่");
  });
  await st("P-11", "ไม่ throw กับข้อมูลขยะ + ไม่แก้อินพุต: moneyStateOf/bookingBadgeOf/outstandingOf รับสถานะแปลก · อินพุต freeze แล้วยังทำงาน", () => {
    const i = Object.freeze({ status: "??", collectMode: "SHOP", agentAccountId: null, payableSatang: 100, paidSatang: 0, refundedSatang: 0, attention: Object.freeze([]) });
    eq([pf("moneyStateOf", i), pf("bookingBadgeOf", i), pf("outstandingOf", i)], ["UNPAID", { kind: "??", shape: "muted" }, 0], "ขยะ");
  });
  groupLine("P");

  // ═══════════════ LV. รายการบนร้าน seed ═══════════════
  console.log("\n── LV: รายการการจอง (ร้าน seed · now = TRIPS_AS_OF) ──");
  const lvSeed = async (input: Rec = {}) => call("loadBookingListVM", SEED, { unitId: U0, ...input }, { now: AS_OF });
  let L0: Rec = {};
  await st("LV-1", "ปริยาย (upcoming): 3 แถว ราชา ส. 14 พ.ย. เรียง travelDate → เวลา → เลขจอง · ชื่อผู้จอง ภัทรา สายใจ / Chen Yu / วิทยา พรหมมา · เลขจองตรงฐาน", async () => {
    L0 = VM(await lvSeed(), "loadBookingListVM");
    const rows = rowsOf(L0);
    eq(rows.map((r) => r.bookingId), seedBk.map((b) => b.id), "ลำดับ (code)");
    eq(rows.map((r) => [r.code, r.bookerName, r.travelDate]), seedBk.map((b) => [b.code, b.bookerPartyId === SEED_PARTY.pattra ? "ภัทรา สายใจ" : b.bookerPartyId === SEED_PARTY.chen ? "Chen Yu" : "วิทยา พรหมมา", D14]), "แถว");
  });
  await st("LV-2", "ยอด: payable 11,450.00 / 8,200.00 / 4,100.00 (ภาพ :45 :48 :50) · paid 0 · outstanding = payable · refunded 0 · money UNPAID · lastTender null", () => {
    const g = (k: keyof typeof SEED_PARTY) => { const r = rowOf(L0, sb(k).id) ?? {}; return [r.payableSatang, r.paidSatang, r.outstandingSatang, r.refundedSatang, r.money, r.lastTender]; };
    eq([g("pattra"), g("chen"), g("wittaya")], [[SEED_PAYABLE.pattra, 0, SEED_PAYABLE.pattra, 0, "UNPAID", null], [SEED_PAYABLE.chen, 0, SEED_PAYABLE.chen, 0, "UNPAID", null], [SEED_PAYABLE.wittaya, 0, SEED_PAYABLE.wittaya, 0, "UNPAID", null]], "เงิน");
  });
  await st("LV-3", "คน/รายการเสริม (ภาพ :45): ภัทรา ผู้ใหญ่ 2 · เด็ก 1 (ป้ายไทย/อังกฤษ) · รายการเสริม = เช่ากล้องกันน้ำ 1 (ค่าอุทยานเก็บแทนไม่อยู่ในรายการเสริม) · Chen Yu ผู้ใหญ่ 2 ไม่มีรายการเสริม", () => {
    const p = rowOf(L0, sb("pattra").id) ?? {}, c = rowOf(L0, sb("chen").id) ?? {};
    eq(asArr(p.pax).map((x) => [x.code, x.qty, x.labelTh, x.labelEn]), [["ADULT", 2, "ผู้ใหญ่", "Adult"], ["CHILD", 1, "เด็ก", "Child"]], "pax ภัทรา");
    eq(asArr(p.extras).map((x) => [x.nameTh, x.qty]), [[R.extras.camera.name, 1]], "extras ภัทรา");
    eq([asArr(c.pax).map((x) => [x.code, x.qty]), asArr(c.extras).length], [[["ADULT", 2]], 0], "Chen Yu");
  });
  await st("LV-4", `ทริป: ชื่อไทย "${R.name}" + อังกฤษ "Racha Yai Island Day Trip" · เวลา "${TIME_TEXT}" (เขตเวลาร้าน) · รอบ GUARANTEED ไม่มีเหตุยกเลิก · ช่องทาง COUNTER · ไม่มีเอเจนซี่`, () => {
    const r = rowOf(L0, sb("pattra").id) ?? {};
    eq([r.productTitleTh, r.productTitleEn, r.timeText, r.departureStatus, r.departureCancelReason, r.channel, r.agentAccountId, r.agentRef, r.collectMode, r.currency],
      [R.name, "Racha Yai Island Day Trip", TIME_TEXT, "GUARANTEED", null, "COUNTER", null, null, "SHOP", "THB"], "ทริป");
  });
  await st("LV-5", "ชิป/ท้ายตาราง (ภาพ :41 :55): ทั้งหมด 3 · เดินทาง 2026-11-14 = 3 · ถือที่ 0 · ต้องทำ 0 · total 3 shown 3 ไม่ถูกตัด · ยอดรวม ฿23,750.00 · คำขอคืนเงินเปิด 0 · เอกสารรอออก 0", () => {
    eq([L0.chips, L0.total, L0.shown, L0.truncated, L0.cap, L0.sumPayableSatang, L0.segments],
      [{ all: 3, day: { date: D14, n: 3 }, hold: 0, attention: 0 }, 3, 3, false, constOf("TRIPS_BOOKING_LIST_CAP"), SEED_PAYABLE.pattra + SEED_PAYABLE.chen + SEED_PAYABLE.wittaya, { refundsOpen: 0, docsWaiting: 0 }], "ชิป/ท้าย");
  });
  await st("LV-6", "หน้าต่างวัน ณ 12 พ.ย.: today 0 · tomorrow 0 · next7 3 · past30 0 · all 3 · date=2026-11-14 3 · date=2026-11-15 0", async () => {
    const n = async (i: Rec) => num(VM(await lvSeed(i), fmt(i)).total);
    eq([await n({ when: "today" }), await n({ when: "tomorrow" }), await n({ when: "next7" }), await n({ when: "past30" }), await n({ when: "all" }), await n({ date: D14 }), await n({ date: "2026-11-15" })],
      [0, 0, 3, 0, 3, 3, 0], "จำนวน");
  });
  await st("LV-7", "ค้น: เลขจองตัวเล็ก ⇒ 1 แถว (queryMode code · ไม่สนหน้าต่างวัน past30) · \"ภัทรา\" ⇒ 1 (text) · \"Chen\" ⇒ 1 · ชื่อที่ไม่มี ⇒ 0", async () => {
    const code = sb("pattra").code;
    const a = VM(await lvSeed({ q: code.toLowerCase(), when: "past30" }), "ค้นเลข");
    eq([rowsOf(a).map((r) => r.bookingId), asRec(a.query)?.queryMode], [[sb("pattra").id], "code"], "เลขจอง");
    const b = VM(await lvSeed({ q: "ภัทรา" }), "ค้นชื่อ");
    eq([rowsOf(b).map((r) => r.bookingId), asRec(b.query)?.queryMode], [[sb("pattra").id], "text"], "ชื่อไทย");
    eq(rowsOf(VM(await lvSeed({ q: "Chen" }), "Chen")).map((r) => r.bookingId), [sb("chen").id], "ชื่ออังกฤษ");
    eq(num(VM(await lvSeed({ q: `ไม่มีใคร${STAMP}` }), "ไม่มี").total), 0, "ไม่พบ");
  });
  await st("LV-8", "ตัวกรองสินค้า: ราชา ⇒ 3 · สิมิลัน ⇒ 0 · id ที่ไม่ใช่ของร้าน ⇒ 0 แถว (ไม่ใช่ข้อผิดพลาด)", async () => {
    const racha = seedProducts["racha-yai-day-trip"], sim = seedProducts["similan-4-nights"];
    ok(racha && sim, "ไม่มีสินค้า seed");
    eq([num(VM(await lvSeed({ product: racha }), "ราชา").total), num(VM(await lvSeed({ product: sim }), "สิมิลัน").total), num(VM(await lvSeed({ product: "nope-product" }), "อื่น").total)], [3, 0, 0], "จำนวน");
  });
  await st("LV-9", "ตัวกรองช่องทาง: COUNTER 3 · WEB 0 · direct 3 · agent 0", async () => {
    const n = async (channel: string) => num(VM(await lvSeed({ channel }), channel).total);
    eq([await n("COUNTER"), await n("WEB"), await n("direct"), await n("agent")], [3, 0, 3, 0], "ช่องทาง");
  });
  await st("LV-10", "input strict ⇒ INVALID_INPUT: คีย์แปลก · date 2026-02-30 · when soon · chip x · channel ไม่รู้จัก · q ยาว 101", async () => {
    for (const i of [{ x: 1 }, { date: "2026-02-30" }, { when: "soon" }, { chip: "x" }, { channel: "FAX" }, { q: "a".repeat(101) }]) codeR(await lvSeed(i), "INVALID_INPUT", fmt(i));
  });
  await st("LV-11", "flags เจ้าของ: canPay canApprove canCancel canSeeMoney = true · canCreate = false (จองหน้าร้าน = T1.3b) · products 4 สินค้า seed มี titleEn", () => {
    eq(L0.flags, { canPay: true, canApprove: true, canCancel: true, canSeeMoney: true, canCreate: false }, "flags");
    const ps = asArr(L0.products);
    ok(ps.length >= 4 && ps.every((p) => typeof p.titleTh === "string" && "titleEn" in p), `products: ${fmt(ps)}`);
    ok(ps.some((p) => p.id === seedProducts["racha-yai-day-trip"] && p.titleEn === "Racha Yai Island Day Trip"), "ราชาไม่อยู่ในรายการ/ไม่มีชื่ออังกฤษ");
  });
  await st("LV-12", "แถบ: แท็บการจองเปิดจริง (available · wo T1.3) · เจ้าของเห็น · tripsPageGate bookings ok · unit tz Asia/Bangkok today 2026-11-12", async () => {
    const nav = asRec((await call("loadTripsNav", SEED, { unitId: U0 })).nav) ?? {};
    const e = asArr(nav.entries).find((x) => x.key === "bookings");
    eq([e?.available, e?.visible, e?.wo, e?.href], [true, true, "T1.3", `/app/u/${DIVE_TRIPS_UNIT.slug}/trips/bookings`], "แท็บ");
    okR(await call("tripsPageGate", SEED, { unitId: U0, page: "bookings" }), "pageGate");
    eq([asRec(L0.unit)?.id, asRec(L0.unit)?.slug, asRec(L0.unit)?.tz, asRec(L0.unit)?.today], [U0, DIVE_TRIPS_UNIT.slug, "Asia/Bangkok", "2026-11-12"], "unit");
  });
  await st("LV-13", "แถวของ seed: ป้าย CONFIRMED ทึบ · ต้องทำ [] · hold/refund/nextDue null · ไม่ถูกลบข้อมูล · คีย์แถวครบตามใบสั่ง · ไม่มีเบอร์/อีเมล/token ในแถว", () => {
    const r = rowOf(L0, sb("pattra").id) ?? {};
    eq([r.badge, r.attention, r.hold, r.refund, r.nextDue, r.bookerPurged], [{ kind: "CONFIRMED", shape: "solid" }, [], null, null, null, false], "ป้าย/ต้องทำ");
    const miss = ROW_KEYS.filter((k) => !(k in r));
    ok(miss.length === 0, `คีย์ขาด: ${miss.join(", ")}`);
    const pii = Object.keys(r).filter((k) => /phone|email|token|contact|tokenHash/i.test(k));
    ok(pii.length === 0, `PII ในแถว: ${pii.join(", ")}`);
  });
  await st("LV-14", "ชิป day/hold/attention เป็นตัวกรอง: chip=day ⇒ 3 · hold ⇒ 0 · attention ⇒ 0 · ชิปนับคงเดิมทุกครั้ง (นับจากชุดฐาน)", async () => {
    const d = VM(await lvSeed({ chip: "day" }), "day"), h = VM(await lvSeed({ chip: "hold" }), "hold");
    eq([d.total, h.total, num(VM(await lvSeed({ chip: "attention" }), "att").total), d.chips, h.chips], [3, 0, 0, L0.chips, L0.chips], "ชิป");
  });
  await st("LV-15", "ตัวโหลดไม่เขียนฐาน: จำนวน TripBooking/TripMoneyEvent/TripPaymentDue/AuditLog/OutboxEvent ของร้าน seed เท่าเดิมหลังเรียกรายการ/รายละเอียด/เงินสด/เอกสาร", async () => {
    const before = await seedCounts();
    await lvSeed(); await lvSeed({ q: "ภัทรา" });
    await call("loadBookingDetailVM", SEED, { unitId: U0, bookingId: sb("pattra").id }, { now: AS_OF });
    await call("loadCashDayVM", SEED, { unitId: U0 }, { now: AS_OF }); await call("loadBookingDocsVM", SEED, { unitId: U0 }, { now: AS_OF });
    eq(await seedCounts(), before, "จำนวนแถว");
  });
  groupLine("LV");

  // ═══════════════ DV. รายละเอียดบนร้าน seed ═══════════════
  console.log("\n── DV: รายละเอียดการจอง (ร้าน seed) ──");
  const dvSeed = async (bookingId: string, extra: Rec = {}) => call("loadBookingDetailVM", SEED, { unitId: U0, bookingId, ...extra }, { now: AS_OF });
  const sctxSeed = { tenantId: DIVE_TENANT, unitId: U0, channel: "COUNTER", actor: { kind: "STAFF", userId: DIVE_OWNER_ID }, now: AS_OF, locale: "th" };
  let D0: Rec = {};
  await st("DV-1", "ภัทรา: ลูกค้า {ชื่อ · เบอร์ปิดบัง null (Party ไม่มีเบอร์) · ไม่ถูกลบ} · row เท่ากับแถวในรายการ (ตัวสร้างแถวเดียวกัน)", async () => {
    D0 = VM(await dvSeed(sb("pattra").id), "loadBookingDetailVM");
    eq(D0.customer, { name: "ภัทรา สายใจ", phoneMasked: null, purged: false }, "ลูกค้า");
    eq(D0.row, rowOf(L0, sb("pattra").id), "row = แถวรายการ");
  });
  await st("DV-2", "เอกสาร (ภาพ :76 = 13ค RC-0588): รวม VAT 9,950.00 · ก่อนภาษี 9,299.07 · VAT 650.93 · เก็บแทน 1,500.00 · รวม 11,450.00", () => {
    const rc = FX.RECEIPT_RC_0588;
    eq(D0.document, { serviceInclVatSatang: rc.serviceInclVatSatang, preVatSatang: rc.preVatSatang, vatSatang: rc.vatSatang, passThroughSatang: rc.parkPassThroughSatang, totalSatang: rc.totalSatang }, "เอกสาร");
  });
  await st("DV-3", "บรรทัด 5 แถว (= tripMoneySummary.document.lines): ผู้ใหญ่ 2 7,000 · เด็ก 1 2,450 · อุทยานผู้ใหญ่ 2 1,200 (เก็บแทน) · อุทยานเด็ก 1 300 (เก็บแทน) · กล้อง 1 500 · labelEn ผู้ใหญ่ = Adult", () => {
    const ls = asArr(D0.lines);
    eq(ls.map((l) => [l.qty, l.amountSatang, l.passThrough]), [[2, 700_000, false], [1, 245_000, false], [2, 120_000, true], [1, 30_000, true], [1, 50_000, false]], "บรรทัด");
    eq([ls[0]?.labelTh, ls[0]?.labelEn, ls[4]?.labelTh], ["ผู้ใหญ่", "Adult", R.extras.camera.name], "ป้าย");
  });
  await st("DV-4", "เงิน: payable 1,145,000 · paid 0 · outstanding 1,145,000 · refunded 0 · งวด 1 ร่าง (id null · BALANCE · 1,145,000 · OPEN · dueLocal 2026-11-12)", () => {
    eq([D0.payableSatang, D0.paidSatang, D0.outstandingSatang, D0.refundedSatang], [1_145_000, 0, 1_145_000, 0], "เงิน");
    eq(asArr(D0.dues).map((d) => [d.id, d.seq, d.kind, d.amountSatang, d.paidSatang, d.outstandingSatang, d.status, d.dueLocal]), [[null, 1, "BALANCE", 1_145_000, 0, 1_145_000, "OPEN", "2026-11-12"]], "งวด");
  });
  await st("DV-5", "การรับเงิน [] · เอกสาร { issued false · waiting [] · vatDiff 0 } · คำขอคืนเงิน []", () => {
    eq([D0.events, D0.docs, D0.refunds], [[], { issued: false, waiting: [], vatDiffSatang: 0 }, []], "เงิน/เอกสาร");
  });
  await st("DV-6", "ผู้เดินทาง: ที่นั่ง 3 · รายชื่อ [] (seed ไม่ได้กรอก) · แบบฟอร์มยังไม่เปิด (formsAvailable false)", () => {
    eq(D0.travellers, { seats: 3, names: [], formsAvailable: false }, "ผู้เดินทาง");
  });
  await st("DV-7", "ปุ่มของเจ้าของ (CONFIRMED · ค้าง · THB · ร้านเก็บ): pay qr = true · approve reject cancel = false · change refund = false เสมอ", () => {
    eq(D0.actions, { pay: true, qr: true, approve: false, reject: false, cancel: false, change: false, refund: false }, "actions");
  });
  await st("DV-8", "ไม่มี/คีย์แปลก: bookingId ที่ไม่มี ⇒ NOT_FOUND · คีย์แปลก ⇒ INVALID_INPUT · Chen Yu ที่นั่ง 2 บรรทัด 2", async () => {
    codeR(await dvSeed("nope-booking"), "NOT_FOUND", "ไม่มี");
    codeR(await dvSeed(sb("pattra").id, { x: 1 }), "INVALID_INPUT", "คีย์แปลก");
    const c = VM(await dvSeed(sb("chen").id), "Chen");
    eq([asRec(c.travellers)?.seats, asArr(c.lines).length], [2, 2], "Chen Yu");
  });
  await st("DV-9", "ตรงบริการ: ทั้ง 3 ใบ payable/document/งวด/แถวเงิน = tripMoneySummary · payable ของแถว = tripMoneySummary.payableSatang", async () => {
    for (const k of ["pattra", "chen", "wittaya"] as const) {
      const s = V(await call("tripMoneySummary", sctxSeed, { bookingId: sb(k).id }), `summary ${k}`);
      const d = VM(await dvSeed(sb(k).id), `detail ${k}`);
      const doc = asRec(s.document) ?? {};
      eq([d.payableSatang, asRec(d.row)?.payableSatang, asRec(d.document)?.vatSatang, asArr(d.dues).length, asArr(d.events).length], [s.payableSatang, s.payableSatang, doc.vatSatang, asArr(s.dues).length, asArr(s.events).length], k);
    }
  });
  groupLine("DV");

  // ═══════════════ CS. เงินสด/คิวเอกสาร บนร้าน seed ═══════════════
  console.log("\n── CS: เงินสดหน้าร้าน · เอกสารเงินรอออก (ร้าน seed) ──");
  await st("CS-1", "เงินสดวันนี้ (ปริยาย = today ร้าน 2026-11-12): ทุกยอด 0 · แยก 4 tender · events [] · ปิดยอดยังไม่เปิด (closeAvailable false)", async () => {
    const c = VM(await call("loadCashDayVM", SEED, { unitId: U0 }, { now: AS_OF }), "loadCashDayVM");
    const zero = { receivedSatang: 0, refundedSatang: 0 };
    eq([c.businessDate, c.tz, c.receivedSatang, c.refundedSatang, c.expectedSatang, c.byTender, c.events, c.total, c.shown, c.truncated, c.closeAvailable],
      ["2026-11-12", "Asia/Bangkok", 0, 0, 0, { CASH: zero, PROMPTPAY: zero, TRANSFER: zero, CARD: zero }, [], 0, 0, false, false], "เงินสด");
  });
  await st("CS-2", "เงินสดเลือกวัน 2026-11-14 ได้ · วันผิด ⇒ INVALID_INPUT · คีย์แปลก ⇒ INVALID_INPUT", async () => {
    eq(asRec((await call("loadCashDayVM", SEED, { unitId: U0, businessDate: "2026-11-14" }, { now: AS_OF })).vm)?.businessDate, "2026-11-14", "เลือกวัน");
    codeR(await call("loadCashDayVM", SEED, { unitId: U0, businessDate: "2026-02-30" }, { now: AS_OF }), "INVALID_INPUT", "วันผิด");
    codeR(await call("loadCashDayVM", SEED, { unitId: U0, x: 1 }, { now: AS_OF }), "INVALID_INPUT", "คีย์แปลก");
  });
  await st("CS-3", "คิวเอกสารเงินรอออกของ seed: count 0 · items [] · cap = TRIPS_MONEY_DOCS_CAP · ไม่ถูกตัด", async () => {
    const d = VM(await call("loadBookingDocsVM", SEED, { unitId: U0 }, { now: AS_OF }), "loadBookingDocsVM");
    eq([d.count, d.items, d.shown, d.cap, d.truncated], [0, [], 0, constOf("TRIPS_MONEY_DOCS_CAP"), false], "คิว");
  });
  await st("CS-4", "ผู้ใช้ seed ที่ไม่มีสิทธิ์ trips (ไกด์มิ้นท์) ⇒ ตัวโหลดทั้ง 4 ตัว FORBIDDEN/NOT_FOUND (ไม่เห็นการจอง)", async () => {
    const g = { tenantId: DIVE_TENANT, actorUserId: "tripsqc-user-dive-guide-mint" };
    for (const [n, i] of [["loadBookingListVM", { unitId: U0 }], ["loadBookingDetailVM", { unitId: U0, bookingId: sb("pattra").id }], ["loadBookingDocsVM", { unitId: U0 }], ["loadCashDayVM", { unitId: U0 }]] as const)
      codeR(await call(n, g, i, { now: AS_OF }), ["FORBIDDEN", "NOT_FOUND"], n);
  });
  groupLine("CS");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uT = rid("uT"), uB = rid("uB");
  let setupErr = "", settingsErr = "";
  const U: Record<string, Actor> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; cam: string }> = {};
  let seq = 0;
  const BV = ["trips.booking.view"];
  try {
    for (const t of ["TripProduct", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripBooking", "TripBookingItem", "TripPaymentDue", "TripMoneyEvent", "TripRefundRequest", "TripHold"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T1.3 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag, s] of [[uA, tA, "a", {}], [uA2, tA, "a2", {}], [uT, tA, "tokyo", { timezone: "Asia/Tokyo" }], [uB, tB, "b", {}]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify(s), updatedAt: new Date() });
    const mkUser = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], perms: string[]): Promise<void> => {
      const id = rid(`u${tag}`);
      const permissions = Object.fromEntries(perms.map((p) => [p, true]));
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role, unitAccess, permissions, userId: id };
    };
    await mkUser("oa", tA, "OWNER", ["*"], []);
    await mkUser("ob", tB, "OWNER", ["*"], []);
    await mkUser("v", tA, "STAFF", [uA], BV);
    await mkUser("vp", tA, "STAFF", [uA], [...BV, "trips.payment.record"]);
    await mkUser("va", tA, "STAFF", [uA], [...BV, "trips.booking.approve"]);
    await mkUser("vc", tA, "STAFF", [uA], [...BV, "trips.booking.cancel"]);
    await mkUser("pv", tA, "STAFF", [uA], ["trips.product.view"]);
    await mkUser("pay", tA, "STAFF", [uA], ["trips.payment.record"]);
    await mkUser("none", tA, "STAFF", [uA], []);
    await mkUser("a2", tA, "STAFF", [uA2], [...BV, "trips.payment.record"]);
    const mkProd = async (key: string, tenantId: string, unitId: string) => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t13qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}`, en: `Test ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt: Record<string, string> = {};
      for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code === "ADULT" ? "Adult" : code === "CHILD" ? "Child" : "Infant" }), countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
      await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: R.parkAdultSatang, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
        name: JSON.stringify({ th: "ค่าอุทยาน", en: "Marine park fee" }), paxPrices: JSON.stringify({ ADULT: R.parkAdultSatang, CHILD: R.parkChildSatang }), active: true, updatedAt: new Date() });
      const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: R.extras.camera.satang, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
        name: JSON.stringify({ th: R.extras.camera.name, en: "Waterproof camera" }), active: true, updatedAt: new Date() });
      for (const [code, amount] of [["ADULT", R.adultSatang], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt: o, unit: unitId, tenant: tenantId, pt, cam };
    };
    await mkProd("A", tA, uA); await mkProd("A9", tA, uA); await mkProd("C", tA, uA2); await mkProd("T", tA, uT); await mkProd("B", tB, uB);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const setV = async (tenantId: string, changes: Rec[], who: string) => {
    const r = asRec(await S("setSettings")(U[who], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  const VATREG = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
  const unitSet = (unit: string, key: string, value: unknown): Rec => ({ key, scope: "UNIT", scopeId: unit, value });
  try {
    if (!setupErr) {
      const recv = { promptpayId: "0812345678", displayName: "ร้านทดสอบ T1.3" };
      await setV(tA, [unitSet(uA, "trips.tax.vatRegistered", VATREG), unitSet(uA2, "trips.tax.vatRegistered", VATREG), unitSet(uT, "trips.tax.vatRegistered", VATREG),
        unitSet(uA, "payments.receiver", recv), unitSet(uT, "payments.receiver", recv)], "oa");
      await setV(tB, [unitSet(uB, "trips.tax.vatRegistered", VATREG)], "ob");
    }
  } catch (e) { settingsErr = e instanceof Error ? e.message : String(e); console.log(`  ⚠️ ตั้งค่าตั้งหน่วยไม่สำเร็จ: ${settingsErr}`); }
  const needDb = () => { needTrips(); ok(!setupErr && PRD.A, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); ok(!settingsErr, `ตั้งค่าตั้งไม่ได้: ${settingsErr}`); };
  const tenantOfUnit = (u: string) => (u === uB ? tB : tA);
  const whoOfUnit = (u: string) => (u === uB ? "ob" : "oa");
  const ctxOf = (tag: string): Ctx => { const a = U[tag]; if (!a) throw new AssertFail(`ไม่มีผู้ใช้ชั่วคราว ${tag} (${setupErr || "ยังไม่ตั้ง"})`); return { tenantId: tag === "ob" ? tB : tA, actorUserId: a.userId }; };
  const staff = (o: { unit?: string; now?: string | Date } = {}): Rec => {
    const unit = o.unit ?? uA;
    return { tenantId: tenantOfUnit(unit), unitId: unit, channel: "COUNTER", actor: { kind: "STAFF", userId: String(U[whoOfUnit(unit)]?.userId ?? "x") }, now: new Date(o.now ?? NOW0), locale: "th" };
  };
  const mkDep = async (date: string, key = "A", capacity = 40, startHm = "08:00"): Promise<string> => {
    const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const startsAt = new Date(BKK(date, startHm).getTime() + (seq++ % 600) * 60_000); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * HOUR),
      status: "OPEN", capacity, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  let bkN = 0;
  type Bk = { id: string; code: string; dep: string; unit: string; payable: number; status: string; phone: string; name: string };
  const mkBooking = async (o: { key?: string; date?: string; dep?: string; pay?: "PAY_LATER" | "PAY_NOW"; a?: number; c?: number; camera?: boolean; now?: string; name?: string } = {}): Promise<Bk> => {
    const key = o.key ?? "A"; const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const dep = o.dep ?? (await mkDep(o.date ?? TRAVEL, key));
    const ctx = staff({ unit: p.unit, now: o.now ?? NOW0 });
    const pax = [["ADULT", o.a ?? 2], ["CHILD", o.c ?? 1]].filter(([, n]) => Number(n) > 0).map(([code, n]) => ({ paxTypeId: p.pt[String(code)], qty: Number(n) }));
    const lines = [{ productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax, extras: o.camera === false ? [] : [{ extraId: p.cam, qty: 1 }] }];
    const quote = V(await call("quoteTrips", ctx, { lines }, {}), "quoteTrips (T0.5)");
    bkN++;
    const phone = `08${String(10_000_000 + bkN * 7_919 + Number.parseInt(hex(2), 16)).slice(-8)}`;
    const name = o.name ?? `ลูกค้า${STAMP} ${bkN}`;
    const r = await call("bookTripsNow", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `n${hex(6)}`, booker: { name, phone }, pay: { method: o.pay ?? "PAY_LATER" } }, {});
    ok(r.ok === true, `bookTripsNow (T0.6): ${fmt(r)}`);
    const ref = asArr(r.value)[0] ?? {};
    const row = (await q<Rec>(`SELECT status, ("grossSatang" - "discountSatang" - "agentDiscountSatang")::int AS p FROM "TripBooking" WHERE id = $1`, [String(ref.bookingId)]))[0] ?? {};
    return { id: String(ref.bookingId), code: String(ref.code), dep, unit: p.unit, payable: num(row.p), status: String(row.status), phone, name };
  };
  const pay = (b: Bk, amount: number, o: { tender?: string; key?: string; now?: string } = {}) =>
    call("recordTripPayment", staff({ unit: b.unit, now: o.now ?? NOW0 }), { bookingId: b.id, amountSatang: amount, tender: o.tender ?? "CASH", idempotencyKey: o.key ?? `p${hex(6)}` });
  const lv = async (tag: string, input: Rec = {}, o: { unit?: string; now?: string } = {}) => call("loadBookingListVM", ctxOf(tag), { unitId: o.unit ?? uA, ...input }, { now: new Date(o.now ?? NOW0) });
  const dv = async (tag: string, bookingId: string, o: { unit?: string; now?: string } = {}) => call("loadBookingDetailVM", ctxOf(tag), { unitId: o.unit ?? uA, bookingId }, { now: new Date(o.now ?? NOW0) });
  const lvRow = async (b: Bk, tag = "oa", input: Rec = {}) => { const vm = VM(await lv(tag, { dep: b.dep, when: "all", ...input }, { unit: b.unit }), "list"); return { vm, row: rowOf(vm, b.id) ?? {} }; };
  const tCounts = async () => (await q<Rec>(`SELECT (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = $1)::int AS a, (SELECT count(*) FROM "TripMoneyEvent" WHERE "tenantId" = $1)::int AS b,
      (SELECT count(*) FROM "TripPaymentDue" WHERE "tenantId" = $1)::int AS c, (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1)::int AS d, (SELECT count(*) FROM "OutboxEvent" WHERE "tenantId" = $1)::int AS e,
      (SELECT count(*) FROM "TripHold" WHERE "tenantId" = $1)::int AS f`, [tA]))[0];

  // ═══════════════ BT. ร้านชั่วคราว ═══════════════
  console.log("\n── BT: ร้านชั่วคราว (สิทธิ์ · แยกหน่วย/ร้าน · รับเงิน · ถือที่ · ต้องทำ · PII · ค้น · เพดาน · เขตเวลา) ──");
  const B: Record<string, Bk> = {};
  const needB = async (k: string, make: () => Promise<Bk>) => { if (!B[k]) B[k] = await make(); return B[k]; };
  await st("BT-1", "ไม่มีสิทธิ์ดูการจอง (none · product.view อย่างเดียว · payment.record อย่างเดียว) ⇒ ตัวโหลด 4 ตัว FORBIDDEN · แท็บการจองไม่เห็น · tripsPageGate bookings FORBIDDEN", async () => {
    needDb();
    const b = await needB("conf", () => mkBooking());
    for (const tag of ["none", "pv", "pay"]) {
      for (const [n, i] of [["loadBookingListVM", { unitId: uA }], ["loadBookingDetailVM", { unitId: uA, bookingId: b.id }], ["loadBookingDocsVM", { unitId: uA }], ["loadCashDayVM", { unitId: uA }]] as const)
        codeR(await call(n, ctxOf(tag), i, { now: new Date(NOW0) }), "FORBIDDEN", `${tag} ${n}`);
    }
    for (const tag of ["pv", "pay"]) {
      const e = asArr(asRec((await call("loadTripsNav", ctxOf(tag), { unitId: uA })).nav)?.entries).find((x) => x.key === "bookings");
      eq(e?.visible, false, `${tag} เห็นแท็บการจอง`);
      codeR(await call("tripsPageGate", ctxOf(tag), { unitId: uA, page: "bookings" }), "FORBIDDEN", `${tag} pageGate`);
    }
  });
  await st("BT-2", "booking.view อย่างเดียว: รายการได้ · flags false ทั้งหมด · segments.docsWaiting null · รายละเอียด actions false ทั้งหมด · เอกสาร/เงินสด FORBIDDEN · แท็บเห็น", async () => {
    needDb();
    const b = await needB("conf", () => mkBooking());
    const vm = VM(await lv("v", { when: "all" }), "v list");
    eq([vm.flags, asRec(vm.segments)?.docsWaiting], [{ canPay: false, canApprove: false, canCancel: false, canSeeMoney: false, canCreate: false }, null], "flags");
    eq(asRec(VM(await dv("v", b.id), "v detail").actions), Object.fromEntries(DETAIL_ACTIONS.map((k) => [k, false])), "actions");
    codeR(await call("loadBookingDocsVM", ctxOf("v"), { unitId: uA }, { now: new Date(NOW0) }), "FORBIDDEN", "docs");
    codeR(await call("loadCashDayVM", ctxOf("v"), { unitId: uA }, { now: new Date(NOW0) }), "FORBIDDEN", "cash");
    okR(await call("tripsPageGate", ctxOf("v"), { unitId: uA, page: "bookings" }), "pageGate v");
  });
  await st("BT-3", "view + payment.record: canPay/canSeeMoney · รายละเอียดการจอง CONFIRMED ค้าง ⇒ pay/qr true (approve/cancel false) · เอกสาร/เงินสดได้", async () => {
    needDb();
    const b = await needB("conf", () => mkBooking());
    const vm = VM(await lv("vp", { when: "all" }), "vp list");
    eq([asRec(vm.flags)?.canPay, asRec(vm.flags)?.canSeeMoney, asRec(vm.flags)?.canApprove], [true, true, false], "flags");
    eq(asRec(VM(await dv("vp", b.id), "vp detail").actions), { pay: true, qr: true, approve: false, reject: false, cancel: false, change: false, refund: false }, "actions");
    VM(await call("loadBookingDocsVM", ctxOf("vp"), { unitId: uA }, { now: new Date(NOW0) }), "docs vp");
    VM(await call("loadCashDayVM", ctxOf("vp"), { unitId: uA }, { now: new Date(NOW0) }), "cash vp");
  });
  await st("BT-4", "แยกหน่วย: ผู้ใช้หน่วย uA2 เปิด uA ⇒ NOT_FOUND · การจองของ uA2 ไม่อยู่ในรายการ uA · เปิดรายละเอียดการจอง uA2 ผ่านหน่วย uA ⇒ NOT_FOUND", async () => {
    needDb();
    const c = await needB("c", () => mkBooking({ key: "C" }));
    codeR(await lv("a2", {}, { unit: uA }), ["NOT_FOUND", "FORBIDDEN"], "a2 → uA");
    ok(!rowsOf(VM(await lv("oa", { when: "all" }), "uA")).some((r) => r.bookingId === c.id), "การจอง uA2 โผล่ใน uA");
    codeR(await dv("oa", c.id, { unit: uA }), "NOT_FOUND", "รายละเอียดข้ามหน่วย");
    eq(rowsOf(VM(await lv("a2", { when: "all" }, { unit: uA2 }), "a2 uA2")).some((r) => r.bookingId === c.id), true, "a2 เห็นของหน่วยตัวเอง");
  });
  await st("BT-5", "แยกร้าน: ชื่อลูกค้าเดียวกันในร้าน B ไม่โผล่ในร้าน A · เลขจองของร้าน B ค้นในร้าน A ⇒ 0 · รายละเอียด id ร้าน B ⇒ NOT_FOUND", async () => {
    needDb();
    const name = `ซ้ำข้ามร้าน${STAMP}`;
    const a = await mkBooking({ name });
    const b = await mkBooking({ key: "B", name });
    eq(rowsOf(VM(await lv("oa", { q: name }), "ค้นชื่อ A")).map((r) => r.bookingId), [a.id], "ชื่อ");
    ok(!rowsOf(VM(await lv("oa", { q: b.code }), "ค้นเลข B")).some((r) => r.bookingId === b.id), "เลขจองร้าน B"); // ORACLE-EDIT BT-5 (ผู้คุม 13 พ.ย.): เลขจองนับต่อร้าน เลขซ้ำข้ามร้านได้ — ตรวจว่าแถวของร้าน B ไม่โผล่
    codeR(await dv("oa", b.id), "NOT_FOUND", "รายละเอียดร้าน B");
  });
  await st("BT-6", "รับเงินสดเต็ม (recordTripPayment): แถว money PAID · lastTender CASH · outstanding 0 · ป้ายทึบ · รายละเอียด events 1 RECEIVED UNPOSTED · docs.waiting 1 (VAT = แถวเงิน) · pay/qr false", async () => {
    needDb();
    const b = await needB("paidCash", () => mkBooking());
    V(await pay(b, b.payable), "recordTripPayment");
    const { row } = await lvRow(b);
    eq([row.money, row.lastTender, row.paidSatang, row.outstandingSatang, asRec(row.badge)?.shape, row.status], ["PAID", "CASH", b.payable, 0, "solid", "PAID"], "แถว");
    const d = VM(await dv("oa", b.id), "detail");
    const ev = asArr(d.events);
    const db = await q<Rec>(`SELECT id, "vatSatang" FROM "TripMoneyEvent" WHERE "bookingId" = $1 AND kind = 'RECEIVED'`, [b.id]);
    eq([ev.map((e) => [e.kind, e.tender, e.amountSatang, e.postingStatus]), asArr(asRec(d.docs)?.waiting).map((w) => [w.eventId, w.vatSatang]), asRec(d.actions)?.pay, asRec(d.actions)?.qr],
      [[["RECEIVED", "CASH", b.payable, "UNPOSTED"]], db.map((x) => [x.id, num(x.vatSatang)]), false, false], "รายละเอียด");
  });
  await st("BT-7", "เงินสดวันนี้หลังรับเงินสด: businessDate = วันร้านของ now · expected = ยอดที่รับเป็นเงินสดทั้งหมดของวัน · byTender.CASH ตรง · แถวมีเลขจอง + เวลาท้องถิ่น", async () => {
    needDb();
    const b = await needB("paidCash", async () => { const x = await mkBooking(); V(await pay(x, x.payable), "pay"); return x; });
    const c = VM(await call("loadCashDayVM", ctxOf("oa"), { unitId: uA }, { now: new Date(NOW0) }), "cash");
    const sum = await q<{ s: number }>(`SELECT coalesce(sum("amountSatang") FILTER (WHERE kind = 'RECEIVED'), 0)::int - coalesce(sum("amountSatang") FILTER (WHERE kind = 'REFUNDED'), 0)::int AS s FROM "TripMoneyEvent" WHERE "tenantId" = $1 AND "unitId" = $2 AND tender = 'CASH' AND "createdAt" >= $3 AND "createdAt" < $4`,
      [tA, uA, BKK("2027-03-01", "00:00"), BKK("2027-03-02", "00:00")]);
    eq([c.businessDate, c.expectedSatang, asRec(asRec(c.byTender)?.CASH)?.receivedSatang !== undefined], ["2027-03-01", sum[0]?.s, true], "เงินสด");
    const ev = asArr(c.events).find((e) => e.bookingId === b.id);
    ok(ev && ev.code === b.code && /^2027-03-01 \d{2}:\d{2}$/.test(String(ev.atLocal)), `แถวเงินสด: ${fmt(ev)}`);
  });
  await st("BT-8", "คิวเอกสารเงินรอออก: มีแถวรับเงินของการจองที่จ่ายแล้ว (kind RECEIVED · เลขจอง · ยอด · VAT · เก็บแทน) · count = แถว UNPOSTED ของหน่วยจากฐาน · segments.docsWaiting = count · ใหม่→เก่า", async () => {
    needDb();
    const b = await needB("paidCash", async () => { const x = await mkBooking(); V(await pay(x, x.payable), "pay"); return x; });
    const d = VM(await call("loadBookingDocsVM", ctxOf("oa"), { unitId: uA }, { now: new Date(NOW0) }), "docs");
    const n = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripMoneyEvent" WHERE "tenantId" = $1 AND "unitId" = $2 AND "postingStatus" = 'UNPOSTED' AND kind IN ('RECEIVED','REFUNDED','RETAINED')`, [tA, uA]);
    eq(d.count, n[0]?.n, "count");
    const it = asArr(d.items).find((x) => x.bookingId === b.id);
    ok(it && it.kind === "RECEIVED" && it.code === b.code && it.amountSatang === b.payable && Number.isInteger(it.vatSatang) && Number.isInteger(it.passThroughSatang), `แถว: ${fmt(it)}`);
    const ats = asArr(d.items).map((x) => String(x.at));
    eq(ats, [...ats].sort().reverse(), "ลำดับใหม่→เก่า");
    eq(asRec(VM(await lv("oa"), "list").segments)?.docsWaiting, d.count, "segments.docsWaiting");
  });
  await st("BT-9", "รับเงินบางส่วนแล้วครบ: 400,000 ⇒ PART_PAID ค้าง payable−400,000 · ป้ายทึบ · รับส่วนที่เหลือ ⇒ PAID ค้าง 0", async () => {
    needDb();
    const b = await mkBooking();
    V(await pay(b, 400_000), "pay 1");
    let { row } = await lvRow(b);
    eq([row.status, row.money, row.paidSatang, row.outstandingSatang], ["PART_PAID", "PART_PAID", 400_000, b.payable - 400_000], "บางส่วน");
    V(await pay(b, b.payable - 400_000, { tender: "TRANSFER" }), "pay 2");
    ({ row } = await lvRow(b));
    eq([row.status, row.money, row.outstandingSatang, row.lastTender], ["PAID", "PAID", 0, "TRANSFER"], "ครบ");
  });
  await st("BT-10", "กดซ้ำพร้อมกัน: คีย์เดียวกัน (intentKey) × 6 พร้อมกัน ⇒ ไม่มี THROW · แถว RECEIVED ชุดเดียว · แถวรายการจ่าย = ยอดครั้งเดียว · คีย์ตรงรูป CC", async () => {
    needDb();
    const b = await mkBooking();
    const key = String(fn("intentKey")("pay", `s${hex(5)}`, [b.id, b.payable, "CASH", null]));
    ok(/^[A-Za-z0-9_-]{8,100}$/.test(key), `คีย์: ${key}`);
    const rs = await Promise.all(Array.from({ length: 6 }, () => pay(b, b.payable, { key })));
    ok(rs.every((r) => r.ok === true), `ผล: ${fmt(rs.filter((r) => r.ok !== true))}`);
    eq((await q(`SELECT 1 FROM "TripMoneyEvent" WHERE "bookingId" = $1 AND kind = 'RECEIVED'`, [b.id])).length, 1, "แถวเงิน");
    const { row } = await lvRow(b);
    eq([row.paidSatang, row.money], [b.payable, "PAID"], "แถวรายการ");
    eq(V(await pay(b, b.payable, { key }), "replay").replayed, true, "ส่งซ้ำ = replayed");
  });
  await st("BT-11", "ถือที่ (PAY_NOW ⇒ HOLD): ป้ายเส้นประ · hold { time = เวลาหมดตามเขตเวลาร้าน · expired false } · ชิป hold 1 · ปุ่ม: vc cancel · vp pay/qr · v ไม่มีอะไร", async () => {
    needDb();
    const b = await needB("hold", () => mkBooking({ pay: "PAY_NOW" }));
    eq(b.status, "HOLD", "สถานะ T0.6");
    const h = (await q<{ e: Date }>(`SELECT min("expiresAt") AS e FROM "TripHold" WHERE "bookingId" = $1 AND status = 'ACTIVE'`, [b.id]))[0]?.e;
    ok(h, "ไม่มี hold ACTIVE");
    const local = new Date(new Date(h as Date).getTime() + 7 * HOUR).toISOString();
    const { vm, row } = await lvRow(b);
    eq([row.badge, asRec(row.hold)?.time, asRec(row.hold)?.localDate, asRec(row.hold)?.expired, asRec(vm.chips)?.hold], [{ kind: "HOLD", shape: "dashed" }, local.slice(11, 16), local.slice(0, 10), false, 1], "ถือที่");
    eq([asRec(VM(await dv("vc", b.id), "vc").actions)?.cancel, asRec(VM(await dv("vp", b.id), "vp").actions)?.pay, asRec(VM(await dv("vp", b.id), "vp").actions)?.qr, asRec(VM(await dv("v", b.id), "v").actions)?.cancel], [true, true, true, false], "ปุ่ม");
  });
  await st("BT-12", "ถือที่หมดเวลา ณ now: hold.expired true · ปุ่ม pay false (ตรงด่าน HOLD_EXPIRED ของบริการ) · cancel ยังได้", async () => {
    needDb();
    const b = await needB("hold", () => mkBooking({ pay: "PAY_NOW" }));
    const late = new Date(Date.parse(NOW0) + 6 * HOUR).toISOString();
    const vmLate = VM(await call("loadBookingListVM", ctxOf("oa"), { unitId: uA, dep: b.dep, when: "all" }, { now: new Date(late) }), "late");
    eq(asRec(rowOf(vmLate, b.id)?.hold)?.expired, true, "expired");
    const a = asRec(VM(await dv("oa", b.id, { now: late }), "detail late").actions) ?? {};
    eq([a.pay, a.qr, a.cancel], [false, false, true], "ปุ่ม");
  });
  await st("BT-13", "ยกเลิก HOLD ผ่านบริการ (cancelTripBooking EXECUTE): แถว CANCELLED ป้าย muted · money NONE · ค้าง 0 · ชิป hold 0 · ที่นั่งถือคืน 0", async () => {
    needDb();
    const b = await mkBooking({ pay: "PAY_NOW" });
    V(await call("cancelTripBooking", staff(), { bookingId: b.id, mode: "EXECUTE", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: `c${hex(6)}` }, { refund: { canRequest: true, canDecide: true } }), "cancelTripBooking");
    const { vm, row } = await lvRow(b);
    eq([row.status, row.badge, row.money, row.outstandingSatang, row.hold, asRec(vm.chips)?.hold], ["CANCELLED", { kind: "CANCELLED", shape: "muted" }, "NONE", 0, null, 0], "หลังยกเลิก");
    eq(num((await q<{ h: number }>(`SELECT held AS h FROM "TripDeparture" WHERE id = $1`, [b.dep]))[0]?.h), 0, "held");
  });
  await st("BT-14", "PENDING (จำลองบนร้านชั่วคราว): ต้องทำ PENDING_APPROVAL · ป้าย alert · ชิป attention 1 · va approve/reject · vc cancel · vp pay false", async () => {
    needDb();
    const b = await mkBooking({ pay: "PAY_NOW" });
    await pool.query(`UPDATE "TripBooking" SET status = 'PENDING' WHERE id = $1`, [b.id]);
    const { vm, row } = await lvRow(b);
    eq([row.attention, row.badge, asRec(vm.chips)?.attention], [["PENDING_APPROVAL"], { kind: "PENDING_APPROVAL", shape: "alert" }, 1], "ต้องทำ");
    const aa = asRec(VM(await dv("va", b.id), "va").actions) ?? {};
    eq([aa.approve, aa.reject, asRec(VM(await dv("vc", b.id), "vc").actions)?.cancel, asRec(VM(await dv("vp", b.id), "vp").actions)?.pay], [true, true, true, false], "ปุ่ม");
    eq(rowsOf(VM(await lv("oa", { dep: b.dep, when: "all", chip: "attention" }), "chip")).map((r) => r.bookingId), [b.id], "chip=attention");
  });
  await st("BT-15", "คำขอคืนเงินเปิด (requestTripRefund หลังจ่ายครบ): แถว refund {QUOTED · ยอด} · ต้องทำ REFUND_OPEN ขึ้นป้าย · segments.refundsOpen ≥ 1 · รายละเอียด refunds 1 · pay false", async () => {
    needDb();
    const b = await mkBooking();
    V(await pay(b, b.payable), "pay");
    const v0 = num((await q<Rec>(`SELECT version FROM "TripBooking" WHERE id = $1`, [b.id]))[0]?.version);
    const rq = V(await call("requestTripRefund", staff(), { bookingId: b.id, expectedVersion: v0, reasonKind: "CUSTOMER", choice: "MONEY", reason: "ลูกค้าขอยกเลิก", idempotencyKey: `r${hex(6)}` }, { canDecide: true }), "requestTripRefund");
    const { vm, row } = await lvRow(b);
    eq([asRec(row.refund)?.requestId, asRec(row.refund)?.status, asRec(row.refund)?.amountSatang, (Array.isArray(row.attention) ? row.attention[0] : undefined) /* ORACLE-EDIT BT-15 (ผู้คุม 13 พ.ย.): asArr แปลงสตริงเป็น {} */, asRec(row.badge)?.kind], [rq.requestId, rq.status, rq.amountSatang, "REFUND_OPEN", "REFUND_OPEN"], "แถว");
    ok(num(asRec(vm.segments)?.refundsOpen) >= 1, `refundsOpen: ${fmt(vm.segments)}`);
    const d = VM(await dv("oa", b.id), "detail");
    eq([asArr(d.refunds).map((x) => [x.requestId, x.status]), asRec(d.actions)?.pay], [[[rq.requestId, rq.status]], false], "รายละเอียด");
  });
  await st("BT-16", "รอบถูกยกเลิก (จำลอง CANCELLED + เหตุ preset:WEATHER): ต้องทำ DEPARTURE_CANCELLED · departureCancelReason ดิบ preset:WEATHER (จอถอดเอง) · departureStatus CANCELLED", async () => {
    needDb();
    const b = await mkBooking();
    await pool.query(`UPDATE "TripDeparture" SET status = 'CANCELLED', "cancelReason" = 'preset:WEATHER' WHERE id = $1`, [b.dep]);
    const { row } = await lvRow(b);
    eq([row.attention, row.departureStatus, row.departureCancelReason], [["DEPARTURE_CANCELLED"], "CANCELLED", "preset:WEATHER"], "รอบยกเลิก");
  });
  await st("BT-17", "งวดเกินกำหนด (จำลอง OVERDUE): ต้องทำ OVERDUE · nextDue = งวดนั้น (localDate ตามเขตร้าน · ยอดค้าง)", async () => {
    needDb();
    const b = await mkBooking();
    const due = (await q<Rec>(`SELECT id, "dueAt", "amountSatang", "paidSatang" FROM "TripPaymentDue" WHERE "bookingId" = $1 ORDER BY seq LIMIT 1`, [b.id]))[0];
    ok(due, "การจองใหม่ไม่มีแถวงวด (T0.7a ensureTripDuesInTx)");
    await pool.query(`UPDATE "TripPaymentDue" SET status = 'OVERDUE' WHERE id = $1`, [due.id]);
    const { row } = await lvRow(b);
    const local = new Date(new Date(due.dueAt as Date).getTime() + 7 * HOUR).toISOString().slice(0, 10);
    eq([row.attention, asRec(row.nextDue)?.localDate, asRec(row.nextDue)?.amountSatang], [["OVERDUE"], local, num(due.amountSatang) - num(due.paidSatang)], "งวด");
  });
  await st("BT-18", "PII: รายละเอียดเบอร์ปิดบัง = maskPhone(เบอร์ผู้จอง) รูป 0xx-xxx-xxxx · แถวไม่มีคีย์เบอร์/อีเมล/token · ลบข้อมูลผู้จอง (piiPurgedAt) ⇒ bookerName null · bookerPurged true · customer.purged · pay false", async () => {
    needDb();
    const b = await mkBooking();
    const d = VM(await dv("oa", b.id), "detail");
    eq(asRec(d.customer)?.phoneMasked, fn("maskPhone")(b.phone), "เบอร์ปิดบัง");
    ok(/^0\d{2}-xxx-\d{4}$/.test(String(asRec(d.customer)?.phoneMasked)), `รูปเบอร์: ${fmt(d.customer)}`);
    const { row } = await lvRow(b);
    ok(!Object.keys(row).some((k) => /phone|email|token|contact/i.test(k)) && !JSON.stringify(row).includes(b.phone.slice(-7)), "แถวรั่วข้อมูลติดต่อ");
    await pool.query(`UPDATE "TripBooking" SET "piiPurgedAt" = now(), "bookerPartyId" = NULL WHERE id = $1`, [b.id]);
    const p = (await lvRow(b)).row;
    const pd = VM(await dv("oa", b.id), "purged");
    eq([p.bookerName, p.bookerPurged, asRec(pd.customer)?.purged, asRec(pd.customer)?.name, asRec(pd.customer)?.phoneMasked, asRec(pd.actions)?.pay], [null, true, true, null, null, false], "ลบแล้ว");
  });
  await st("BT-19", "ค้น: เลขจองตัวเล็กข้ามหน้าต่างวัน (when=today) ⇒ เจอ · เลขอ้างอิงเอเจนซี่ (agentRef) ตรงตัว ⇒ เจอ · ชื่อบางส่วน ⇒ เจอ · ผลค้นยังผูกหน่วย", async () => {
    needDb();
    const b = await mkBooking({ name: `คุณค้นหา${STAMP}` });
    eq(rowsOf(VM(await lv("oa", { q: b.code.toLowerCase(), when: "today" }), "code")).map((r) => r.bookingId), [b.id], "เลขจอง");
    const ref = `PTD-${hex(3)}`;
    await pool.query(`UPDATE "TripBooking" SET "agentRef" = $2 WHERE id = $1`, [b.id, ref]);
    eq(rowsOf(VM(await lv("oa", { q: ref }), "agentRef")).map((r) => r.bookingId), [b.id], "agentRef");
    eq(rowsOf(VM(await lv("oa", { q: `ค้นหา${STAMP}` }), "ชื่อบางส่วน")).map((r) => r.bookingId), [b.id], "ชื่อบางส่วน");
    eq(num(VM(await lv("a2", { q: b.code }, { unit: uA2 }), "หน่วยอื่น").total), 0, "หน่วยอื่นค้นเจอ");
  });
  await st("BT-20", "ชื่อที่ตรงเกิน 25 คน ⇒ search.nameCapped true (ไม่ไล่ทั้งร้าน) · ค้นเลขจอง ⇒ nameCapped false", async () => {
    needDb();
    for (let i = 0; i < 26; i++) await insertRow("Party", { id: rid("pty"), tenantId: tA, kind: "PERSON", name: `ซ้ำชื่อ${STAMP} ${i}`, updatedAt: new Date() });
    eq(asRec(VM(await lv("oa", { q: `ซ้ำชื่อ${STAMP}` }), "capped").search)?.nameCapped, true, "nameCapped");
    eq(asRec(VM(await lv("oa", { q: "TR-0000-0000" }), "code").search)?.nameCapped, false, "code");
  });
  await st("BT-21", "เพดาน: หน่วย uA2 มีการจอง CAP+3 ⇒ shown = CAP · total = CAP+3 · truncated · ชิป all = CAP+3 (นับแยก) · ยอดรวม = Σ ทั้งชุด", async () => {
    needDb();
    const cap = num(constOf("TRIPS_BOOKING_LIST_CAP"));
    const dep = await mkDep(TRAVEL, "C");
    const existing = await q<{ n: number; s: number }>(`SELECT count(*)::int AS n, coalesce(sum("grossSatang" - "discountSatang" - "agentDiscountSatang"), 0)::int AS s FROM "TripBooking" WHERE "tenantId" = $1 AND "unitId" = $2`, [tA, uA2]);
    let sum = num(existing[0]?.s);
    for (let i = 0; i < cap + 3; i++) {
      const g = 10_000 + i;
      sum += g;
      await insertRow("TripBooking", { id: rid("bk"), tenantId: tA, unitId: uA2, code: `QC-${STAMP.slice(0, 4).toUpperCase()}-${String(i).padStart(4, "0")}`, publicTokenHash: hex(16), status: "CONFIRMED", productId: PRD.C?.id, departureId: dep,
        travelDate: TRAVEL, channel: "COUNTER", collectMode: "SHOP", payMethod: "PAY_LATER", contactRoute: "DIRECT", currency: "THB", grossSatang: g, discountSatang: 0, agentDiscountSatang: 0, passThroughSatang: 0,
        vatSatang: 0, commissionSatang: 0, commissionVatSatang: 0, whtSatang: 0, netToShopSatang: g, accountingState: "NONE", policySnapshot: "{}", updatedAt: new Date() });
    }
    const total = num(existing[0]?.n) + cap + 3;
    const vm = VM(await lv("a2", { when: "all" }, { unit: uA2 }), "cap");
    eq([rowsOf(vm).length, vm.shown, vm.total, vm.truncated, asRec(vm.chips)?.all, vm.sumPayableSatang], [cap, cap, total, true, total, sum], "เพดาน");
  });
  await st("BT-22", "เขตเวลา Asia/Tokyo: unit.today ณ 2027-03-01T15:30Z = 2027-03-02 · timeText เริ่ม 10:00 (รอบ 08:00 เวลาไทย) · เงินสดของวัน 03-02 มีแถวที่รับตอนนั้น · วัน 03-01 ไม่มี", async () => {
    needDb();
    const late = "2027-03-01T15:30:00.000Z";
    const dep = await mkDep(TRAVEL, "T", 40, "08:00");
    const b = await mkBooking({ key: "T", dep });
    V(await pay(b, b.payable, { now: late }), "pay tokyo");
    const vm = VM(await lv("oa", { dep, when: "all" }, { unit: uT, now: late }), "tokyo");
    const r = rowOf(vm, b.id) ?? {};
    const startUtc = (await q<{ s: Date }>(`SELECT "startsAt" AS s FROM "TripDeparture" WHERE id = $1`, [dep]))[0]?.s as Date;
    const tok = new Date(new Date(startUtc).getTime() + 9 * HOUR).toISOString().slice(11, 16);
    eq([asRec(vm.unit)?.tz, asRec(vm.unit)?.today, String(r.timeText).slice(0, 5)], ["Asia/Tokyo", "2027-03-02", tok], "unit/เวลา");
    const c2 = VM(await call("loadCashDayVM", ctxOf("oa"), { unitId: uT, businessDate: "2027-03-02" }, { now: new Date(late) }), "cash 03-02");
    const c1 = VM(await call("loadCashDayVM", ctxOf("oa"), { unitId: uT, businessDate: "2027-03-01" }, { now: new Date(late) }), "cash 03-01");
    eq([asArr(c2.events).some((e) => e.bookingId === b.id), asArr(c1.events).some((e) => e.bookingId === b.id)], [true, false], "วันทำการ");
  });
  await st("BT-23", "หน้าต่างวันร้านชั่วคราว (now 1 มี.ค. 2570 · เดินทาง 10 เม.ย.): upcoming มี · next7 ไม่มี · past30 ไม่มี · date=วันเดินทาง มี", async () => {
    needDb();
    const b = await needB("conf", () => mkBooking());
    const has = async (i: Rec) => rowsOf(VM(await lv("oa", { dep: b.dep, ...i }), fmt(i))).some((r) => r.bookingId === b.id);
    eq([await has({ when: "upcoming" }), await has({ when: "next7" }), await has({ when: "past30" }), await has({ date: TRAVEL })], [true, false, false, true], "หน้าต่าง");
  });
  await st("BT-24", "พร้อมกัน: รายละเอียด × 8 ขณะรับเงิน 2 ครั้ง (คนละคีย์) ⇒ ตัวโหลดไม่ล้ม/ไม่ THROW · สุดท้าย paid = ผลรวม · events 2", async () => {
    needDb();
    const b = await mkBooking();
    const loads = Array.from({ length: 8 }, () => dv("oa", b.id));
    const pays = [pay(b, 300_000), pay(b, 200_000, { tender: "CARD" })];
    const out = await Promise.all([...loads, ...pays]);
    ok(out.every((r) => r.ok === true), `ล้ม: ${fmt(out.filter((r) => r.ok !== true))}`);
    const d = VM(await dv("oa", b.id), "final");
    eq([d.paidSatang, asArr(d.events).length], [500_000, 2], "สุดท้าย");
  });
  await st("BT-25", "ตัวโหลดไม่เขียนฐาน (ร้านชั่วคราว): จำนวน TripBooking/TripMoneyEvent/TripPaymentDue/AuditLog/OutboxEvent/TripHold เท่าเดิมหลังเรียกรายการ/รายละเอียด/เอกสาร/เงินสด หลายรอบ", async () => {
    needDb();
    const b = await needB("conf", () => mkBooking());
    const before = await tCounts();
    await Promise.all([lv("oa"), lv("oa", { q: b.code }), dv("oa", b.id), dv("vp", b.id), call("loadBookingDocsVM", ctxOf("oa"), { unitId: uA }, { now: new Date(NOW0) }), call("loadCashDayVM", ctxOf("oa"), { unitId: uA }, { now: new Date(NOW0) })]);
    eq(await tCounts(), before, "จำนวนแถว");
  });
  await st("BT-26", "ภาษาอังกฤษ: แถวมี productTitleEn \"Test A\" · pax labelEn Adult/Child · extras nameEn \"Waterproof camera\" · รายละเอียด labelEn ของค่าอุทยานประกอบจากรายการเสริม+ประเภทคน", async () => {
    needDb();
    const b = await needB("conf", () => mkBooking());
    const { row } = await lvRow(b);
    eq([row.productTitleEn, asArr(row.pax).map((p) => p.labelEn), asArr(row.extras).map((x) => x.nameEn)], ["Test A", ["Adult", "Child"], ["Waterproof camera"]], "อังกฤษ");
    const ls = asArr(VM(await dv("oa", b.id), "detail").lines);
    const park = ls.filter((l) => l.passThrough === true);
    ok(park.length > 0 && park.every((l) => typeof l.labelEn === "string" && /Marine park fee/.test(String(l.labelEn))), `labelEn ค่าอุทยาน: ${fmt(park)}`);
  });
  await st("BT-27", "รายละเอียดตรงบริการบนร้านชั่วคราว (หลังรับเงินบางส่วน): document/payable/paid/outstanding/งวด = tripMoneySummary · vatDiff = vat.receiptRoundingDiffSatang", async () => {
    needDb();
    const b = await mkBooking();
    V(await pay(b, 250_000), "pay");
    const s = V(await call("tripMoneySummary", staff(), { bookingId: b.id }), "summary");
    const d = VM(await dv("oa", b.id), "detail");
    const sd = asRec(s.document) ?? {};
    eq([d.payableSatang, d.paidSatang, d.outstandingSatang, asRec(d.document)?.vatSatang, asArr(d.dues).map((x) => [x.seq, x.outstandingSatang, x.status]), asRec(d.docs)?.vatDiffSatang],
      [s.payableSatang, s.paidSatang, s.outstandingSatang, sd.vatSatang, asArr(s.dues).map((x) => [x.seq, x.outstandingSatang, x.status]), asRec(s.vat)?.receiptRoundingDiffSatang], "ตรงบริการ");
  });
  await st("BT-28", "การจองเอเจนซี่ (จำลอง agentAccountId + AGENT): money AGENT_COLLECTS · pay false · ตัวกรองช่องทาง agent มี · direct ไม่มี", async () => {
    needDb();
    const b = await mkBooking();
    await pool.query(`UPDATE "TripBooking" SET "agentAccountId" = 'ag-qc', "collectMode" = 'AGENT' WHERE id = $1`, [b.id]);
    const { row } = await lvRow(b);
    eq([row.money, row.agentAccountId, asRec(VM(await dv("oa", b.id), "detail").actions)?.pay], ["AGENT_COLLECTS", "ag-qc", false], "เอเจนซี่");
    const has = async (channel: string) => rowsOf(VM(await lv("oa", { dep: b.dep, when: "all", channel }), channel)).some((r) => r.bookingId === b.id);
    eq([await has("agent"), await has("direct")], [true, false], "ช่องทาง");
  });
  await st("BT-29", "ตัวกรองรอบ/สินค้า: dep ของการจองนี้ ⇒ เฉพาะรอบนี้ · dep ของหน่วยอื่น ⇒ 0 · สินค้าอื่น (A9) ⇒ ไม่มีการจองนี้", async () => {
    needDb();
    const b = await mkBooking();
    const c = await needB("c", () => mkBooking({ key: "C" }));
    const vm = VM(await lv("oa", { dep: b.dep, when: "all" }), "dep");
    ok(rowsOf(vm).length >= 1 && rowsOf(vm).every((r) => r.departureId === b.dep), `dep: ${fmt(rowsOf(vm).map((r) => r.departureId))}`);
    eq(num(VM(await lv("oa", { dep: c.dep, when: "all" }), "dep อื่น").total), 0, "dep หน่วยอื่น");
    ok(!rowsOf(VM(await lv("oa", { product: PRD.A9?.id, when: "all" }), "A9")).some((r) => r.bookingId === b.id), "สินค้าอื่นมีการจองนี้");
  });
  await st("BT-30", "รับเงินเป็นพร้อมเพย์ (QR intent + record PROMPTPAY): intent ยอด = ยอดค้าง · หลังบันทึก lastTender PROMPTPAY · เงินสดของวันไม่เพิ่มจากรายการนี้ (byTender.PROMPTPAY)", async () => {
    needDb();
    const b = await mkBooking();
    const cash0 = num(VM(await call("loadCashDayVM", ctxOf("oa"), { unitId: uA }, { now: new Date(NOW0) }), "cash0").expectedSatang);
    const it = V(await call("tripPaymentIntent", staff(), { bookingId: b.id }), "intent");
    eq(it.amountSatang, b.payable, "ยอดล็อก");
    V(await pay(b, num(it.amountSatang), { tender: "PROMPTPAY" }), "pay promptpay");
    const { row } = await lvRow(b);
    const c = VM(await call("loadCashDayVM", ctxOf("oa"), { unitId: uA }, { now: new Date(NOW0) }), "cash1");
    eq([row.lastTender, row.money, c.expectedSatang, asArr(c.events).some((e) => e.bookingId === b.id && e.tender === "PROMPTPAY")], ["PROMPTPAY", "PAID", cash0, true], "พร้อมเพย์");
  });
  await st("BT-31", "รายละเอียด: id ร้านอื่น/หน่วยอื่น ⇒ NOT_FOUND · คีย์แปลก ⇒ INVALID_INPUT · ผู้ใช้ไม่มีสิทธิ์ ⇒ FORBIDDEN (ไม่บอกว่ามีอยู่)", async () => {
    needDb();
    const b = await needB("conf", () => mkBooking());
    codeR(await call("loadBookingDetailVM", ctxOf("oa"), { unitId: uA, bookingId: b.id, extra: 1 }, { now: new Date(NOW0) }), "INVALID_INPUT", "คีย์แปลก");
    codeR(await call("loadBookingDetailVM", ctxOf("ob"), { unitId: uA, bookingId: b.id }, { now: new Date(NOW0) }), ["NOT_FOUND", "FORBIDDEN"], "ร้าน B");
    codeR(await call("loadBookingDetailVM", ctxOf("none"), { unitId: uA, bookingId: "nope" }, { now: new Date(NOW0) }), "FORBIDDEN", "none + id ไม่มี");
  });
  groupLine("BT");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

console.log(`\nเหลือให้ด่านภาพ + การกดจริง (ผู้คุม · scripts/visual-trips.mts t1.3 + parity-trips.sh 18): ตารางเต็มกว้าง 1440 ไม่เลื่อน · ป้าย 3 รูปทรง · ชิปต้องทำกรอบแดง · ลิ้นชักหัว/ท้ายตรึง · ปุ่ม 2 คอลัมน์ · กล่องรับเงิน + แถบเงินสดแยก POS · 390 การ์ดไม่ล้น · ไม่มีรหัสดิบ · action รับเงิน/QR/ยกเลิก/อนุมัติ ผ่าน Next จริง`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T1.3a · การจองฝั่งร้าน · รายการ · รายละเอียด · รับเงิน · เอกสารเงินรอออก · เงินสด =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
