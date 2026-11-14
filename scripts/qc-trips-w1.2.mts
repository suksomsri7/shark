// QC — TRIPS W1.2a · ทัวร์ 4 ขั้นฝั่งลูกค้า: เลือกวัน/รอบ → คน·รับส่ง·รายการเสริม (ยอดจากบริการราคา) → ถือที่ + ผู้จอง → จ่าย (QR พร้อมเพย์ยอดล็อก) → วอเชอร์ QR + สิ่งที่ต้องทำ (ภาพ 01 · 19)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/W1.2.md (ส่วน a) · สัญญา ledger/TRIPS-CORE-CONTRACT.md §C §D §G.1 §H §J.3 · ภาพ ledger/design-trips/01-tour-customer.* · 19-customer-desktop-en.* · 07-states.* (W1.4)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน · พิสูจน์ฟิกซ์เจอร์ด้วยบริการของโมดูลโดยตรง = positive control)
//   S ไฟล์/กติกาโค้ด (static)   P ตัวช่วยบริสุทธิ์ (trips-book-core)   LG ภาษา
//   Q เลือกคน/รับส่ง/เสริม + ยอดจากบริการราคา   H ถือที่   C หน้ายืนยัน + ยืนยันการจอง   R หน้าการจอง (จ่าย/วอเชอร์/สิ่งที่ต้องทำ)
//   RL ด่านอัตรา (ปิดเมื่อพัง)   X กลุ่มบังคับ: X1 ข้ามร้าน/ข้ามการจอง · X3 ยิงพร้อมกัน · X4 ส่งซ้ำ · X6 อินพุตอันตราย · PII
//
// 🔴 นาฬิกา: ทุกการเทียบเวลาใช้ "now ที่ข้อสอบส่ง" (NOW0) เท่านั้น — ไม่เทียบกับ createdAt/updatedAt ที่ฐานเติมด้วย NOW() (บทเรียน w1.1 XR-11) · ไม่กรองแถวด้วยช่วงเวลา (ใช้ tenantId/รหัสเฉพาะ)
// 🔴 ค่าคาดหวังมาจากฟิกซ์เจอร์ (ราคาราชาของ trips-fixture) + คิดเองในข้อสอบ — ไม่เรียกโค้ดที่ถูกทดสอบเพื่อหาคำตอบ
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-w12-*` + ถัง ChatRateBucket ของร้าน/กุญแจเครื่องที่ข้อสอบใช้ — ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน seed ไม่แตะ
// 🔴 ยังไม่มีโมดูล/ฟังก์ชัน = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน
// 🔴 รอบ 2 (มติ R6–R14): ทุกข้อหลังยืนยันใช้นาฬิกา AFTER = at(20_000) (ยืนยันที่ at(10_000)) · ร้านทดสอบเปิด trips.public.bookingEnabled เอง (ค่าเริ่ม = ปิด · R7)
//    ร้าน C = ราคาไม่รวม VAT (R12) · ร้าน D = ไม่ตั้งค่าเปิดปุ่มจอง (R7) · ทุกการยืนยันใหม่ใช้เบอร์ใหม่ (เพดาน X10 = 3 ต่อเบอร์)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-w1.2.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน W1.2a: PC เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-w1.2";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-w1.1) ═══════════════
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
const rid = (p: string) => `w12qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SLUG = "trips-w12-";
const EMAIL_PREFIX = "trips-w12-";
const HOUR = 3_600_000;
const MIN = 60_000;
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

// ═══════════════ สเปก (ใบสั่ง W1.2 · ส่วน a) ═══════════════
const BASE_SHA = "234d84eb9"; // wip/trips-w1.2 = session/trips ตอนเขียนใบสั่ง (ปลาย T1.4a)
const BCORE = "src/lib/platform/trips-book-core.ts";
const BSVC = "src/lib/platform/trips-book.ts";
const PUBMOD = "src/lib/modules/trips/public-booking.ts";
const FACADE = "src/lib/modules/trips/index.ts";
const APP = "src/app/book";
const ACTIONS = `${APP}/[shop]/actions.ts`;
const PAGE_CHECKOUT = `${APP}/[shop]/c/[basket]/page.tsx`;
const PAGE_RES = `${APP}/[shop]/my/[token]/page.tsx`;
const PAGE_PRODUCT = `${APP}/[shop]/t/[productSlug]/page.tsx`;
const COMP = "src/components/book";
const MSG_TH = "src/messages/th/book.json";
const MSG_EN = "src/messages/en/book.json";
const OWN = [BCORE, BSVC, PUBMOD, ACTIONS, PAGE_CHECKOUT, PAGE_RES];
const BCORE_NAMES = ["BOOK_MAX_SEATS", "BOOK_ERROR_CODES", "BOOK_RES_STATES", "BOOK_TODO_KEYS", "BOOK_PAX_CODE_RE", "BOOK_REF_RE", "BOOK_BASKET_TOKEN_RE", "BOOK_FORM_MIN_SEC", "BOOK_FORM_MAX_SEC",
  "BOOK_PAY_MARGIN_SEC", "BOOK_SLOT_HOLD_PER_HOUR", "BOOK_CONFIRM_PER_HOUR", "BOOK_TERMS_VERSION",
  "parseBookSelection", "selectionSeatsOk", "cancelDeadlinesOf", "reservationStateOf", "bookTodoOf"];
const BSVC_FNS = ["issueBookFormNonce", "quoteBookSelection", "startBookHold", "loadBookCheckout", "confirmBookHold", "openBookReservation", "bookVoucherQrPayload", "verifyBookVoucherQr"];
const ERROR_CODES = ["NOT_FOUND", "RATE_LIMITED", "INVALID", "PRICE_CHANGED", "SOLD_OUT", "CUTOFF_PASSED", "SLOT_CLOSED", "HOLD_LIMIT", "HOLD_EXPIRED", "STALE_FORM", "TOO_FAST", "ACCEPT_REQUIRED", "DONE", "BUSY", "UNAVAILABLE"];
const RES_STATES = ["PAY", "VOUCHER", "EXPIRED", "CANCELLED", "ENDED"]; // R8: AWAIT_SHOP ย้ายไป W1.2b
const K_ON = "trips.public.bookingEnabled"; // R7 คีย์ใหม่ (ค่าเริ่ม false ทุกแม่แบบ) — ใบสั่ง §3.3
const K_CONTACT = "trips.public.shopContact"; // R13 คีย์ใหม่ { phone, line, address } ว่างทั้งหมด — ใบสั่ง §3.3
const SHOP_CONTACT = { phone: "076-000-123", line: "@w12qc", address: "1 ถนนทดสอบ ตำบลวิชิต ภูเก็ต" };
const INTERNAL_KEYS = ["id", "tenantId", "unitId", "productId", "slotId", "departureId", "optionId", "paxTypeId", "extraId", "zoneId", "pickupZoneId", "bookingId", "basketId", "holdId", "holdIds", "dueId", "partyId", "bookerPartyId",
  "agentAccountId", "linkId", "clientKey", "itemRef", "priceSource", "priceTrace", "fingerprint", "warnings", "quoteId", "policySnapshot", "publicTokenHash", "capKey", "payload", "phone", "email"];
const TESTIDS_W12 = ["book-steps", "book-select", "book-zones", "book-summary", "book-total", "book-hold-note", "book-continue", "book-error", "book-checkout", "book-hold-until", "book-booker-name", "book-booker-phone",
  "book-booker-email", "book-accept", "book-pay-submit", "book-legal", "book-privacy", "book-res", "book-res-code", "book-pay", "book-pay-qr", "book-pay-amount", "book-pay-unavailable", "book-voucher", "book-voucher-qr",
  "book-todo", "book-res-expired", "book-res-cancelled", "book-res-ended", "book-cancel-until",
  "book-res-total", "book-pay-by", "book-pay-too-late", "book-expired-contact", "book-shop", "book-terms-version", "book-price-changed", "book-rehold", "book-closed"];
const TESTID_PATTERNS_W12 = ["book-pax-", "book-zone-", "book-extra-pick-", "book-summary-line-", "book-todo-"];
const I18N_REQUIRED = [
  ...["title", "pax", "pickup", "extras", "update", "continue", "maxSeats", "minus", "plus", "free", "closed"].map((k) => `select.${k}`),
  ...["title", "total", "passThrough", "holdNote", "noFeesLater", "vat"].map((k) => `summary.${k}`),
  ...["title", "holdUntil", "name", "phone", "email", "accept", "pay", "privacy", "license", "noAccount", "receiptNote", "termsVersion"].map((k) => `checkout.${k}`),
  "res.code", "res.total", ...["title", "amount", "amountNow", "note", "unavailable", "tooLate", "payBy", "holdUntil"].map((k) => `res.pay.${k}`), ...["title", "qrNote"].map((k) => `res.voucher.${k}`),
  "res.expired", "res.expiredPaid", "res.cancelled", "res.ended", "todo.title", "todo.PAY", "todo.PASSENGERS", "todo.WAIVER", "cancel.until", "steps.label",
  ...["title", "phone", "line", "address"].map((k) => `shop.${k}`), ...["title", "old", "new", "rehold"].map((k) => `priceChanged.${k}`), "page.titleCheckout", "page.titleReservation",
  ...ERROR_CODES.filter((c) => c !== "DONE").map((c) => `err.${c}`),
];
const VISUAL_SCENES = ["book-select", "book-select-en", "book-checkout", "book-pay", "book-voucher", "book-expired"];
const FORBIDDEN_PATHS = ["prisma", "src/proxy.ts", "src/lib/core", "src/i18n", "src/lib/branding", "src/lib/payment", "src/app/api", "src/app/app", "src/app/b", "src/app/(store)", "src/lib/platform", "src/lib/modules",
  "src/messages/th/trips.json", "src/messages/en/trips.json", "src/components/trips", "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts", "scripts/trips-ui-inventory.json",
  ...["p0.1", "t0.1", "t0.2", "t0.3", "t0.4", "t0.5", "t0.6", "t0.7", "t0.8", "t1.1", "t1.2", "t1.3", "t1.4", "a1.1", "a1.2"].map((w) => `scripts/qc-trips-${w}.mts`),
  `:(exclude)${BCORE}`, `:(exclude)${BSVC}`, `:(exclude)${PUBMOD}`, `:(exclude)${FACADE}`, ":(exclude)src/lib/platform/trips-public.ts", ":(exclude)src/lib/platform/trips-public-core.ts", ":(exclude)src/lib/modules/trips/public-catalog.ts",
  ":(exclude)src/lib/core/settings/defs/trips.ts"];
const DEFS_TRIPS = "src/lib/core/settings/defs/trips.ts";
/** ไฟล์ของใบก่อนที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด (null = ไม่จำกัด)] · defs/trips = เพิ่ม 2 คีย์ของ R7/R13 เท่านั้น (§3.3) */
const LIMITED: [string, number, number | null][] = [[FACADE, 0, 30], ["src/lib/platform/trips-public-core.ts", 10, null], ["src/lib/platform/trips-public.ts", 40, null], ["src/lib/modules/trips/public-catalog.ts", 30, null], ["scripts/visual-trips.mts", 12, null],
  [DEFS_TRIPS, 0, 24]];
// ราคาราชาจากฟิกซ์เจอร์ (ภาพ 01 · 19) — คิดเอง
const R = FX.PRODUCT_RACHA;
const AD = R.adultSatang, CH = R.childSatang, PA = R.parkAdultSatang, PC_ = R.parkChildSatang, CAM = R.extras.camera.satang, OUTZ = R.extras.outOfZonePickup.satang;
const TOTAL_2A1C_CAM = 2 * AD + CH + 2 * PA + PC_ + CAM; // = ฿11,450.00 (BOOKING_TR_0142)
const HOLD_MIN = R.holdMinutes; // 15 (TRIPS-DEFAULTS T5)
const X8 = { holdPerHourPerDevice: 10, tokenMissPerHour: 30 }; // TRIPS-DEFAULTS X8 ค่าเริ่ม (ถือที่ 10/ชม. · token 30/ชม.)
// ร้านชั่วคราว
const NOW0 = new Date("2027-03-01T03:00:00.000Z"); // 10:00 น. 1 มี.ค. 2570 (เวลาร้าน)
const N0 = { now: NOW0 };
const at = (ms: number) => ({ now: new Date(NOW0.getTime() + ms) });
const AFTER = at(20_000); // m6: ทุกการอ่าน/รับเงินหลังยืนยัน (ยืนยันที่ at(10_000)) — ไม่ย้อนเวลาไปก่อนการจองเกิด
const PAY_MARGIN_SEC = 180; // R8: เหลือ < 3 นาที ไม่ออก QR · "โอนภายใน" = ถือถึง − 3 นาที (10:15 ⇒ 10:12)
const DEPOSIT_PCT = 30; // R12: สินค้ามัดจำ 30% ฐานเฉพาะค่าทริป (TRIP_ONLY ค่าเริ่ม) · งวดสอง 3 วันก่อนเดินทาง
const IP_PREFIX = "100.65.";
const RECEIVER_NAME = `ร้านทดสอบ W12 ${STAMP}`;

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
    for (const t of tids) for (const p of ["book", "hold", "slot", "token", "confirm", "pub"]) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:${p}:${t}:%`]);
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
  const BCI = existsSync(join(ROOT, BCORE)) ? await tryImport("@/lib/platform/trips-book-core") : { mod: null, err: "ยังไม่มีไฟล์" };
  const BSI = existsSync(join(ROOT, BSVC)) ? await tryImport("@/lib/platform/trips-book") : { mod: null, err: "ยังไม่มีไฟล์" };
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const tfn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ไม่มี ${name}`); return f as AnyFn; };
  const tcall = async (name: string, ...a: unknown[]): Promise<Rec> => { const f = tfn(name); try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  const coreV = (name: string): unknown => { const v = BCI.mod?.[name]; if (v === undefined) throw new AssertFail(`ยังไม่มี ${name} ใน trips-book-core (W1.2a ยังไม่สร้าง · ${BCI.err.slice(0, 80)})`); return v; };
  const P = (name: string): AnyFn => { const f = coreV(name); if (typeof f !== "function") throw new AssertFail(`${name} ไม่ใช่ฟังก์ชัน`); return f as AnyFn; };
  const sfn = (name: string): AnyFn => { const f = BSI.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`ยังไม่มี ${name} ใน platform/trips-book (W1.2a ยังไม่สร้าง · ${BSI.err.slice(0, 80)})`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = sfn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  const bookClientKey = (ip: string): string => {
    const f = PUBI.mod?.bookClientKey;
    if (typeof f !== "function") throw new AssertFail(`ไม่มี bookClientKey ของ W1.1 (${PUBI.err.slice(0, 80)})`);
    const k = (f as AnyFn)(ip);
    if (typeof k !== "string") throw new AssertFail(`bookClientKey(${ip}) ไม่คืนสตริง: ${fmt(k)}`);
    usedClientKeys.push(k);
    return k;
  };
  let ipN = 0;
  const ck = () => { ipN++; return bookClientKey(`${IP_PREFIX}${(ipN >> 8) & 255}.${ipN & 255}`); };
  /** ของภายใน — ยกเว้นก้อน `shop` ระดับบนของ VM (ข้อมูลร้านที่ร้านตั้งให้แสดง · R13) */
  const noInternal = (vm0: unknown, ids: string[], what: string, extraStrings: string[] = []) => {
    const r0 = asRec(vm0);
    const vm = r0 && "shop" in r0 ? Object.fromEntries(Object.entries(r0).filter(([k]) => k !== "shop")) : vm0;
    const bad = INTERNAL_KEYS.filter((k) => keysDeep(vm).has(k));
    ok(bad.length === 0, `${what}: มีคีย์ภายใน ${bad.join(", ")}`);
    const s = JSON.stringify(vm);
    const leak = [...ids, ...extraStrings].filter((i) => i && s.includes(i));
    ok(leak.length === 0, `${what}: มีค่าภายใน/ข้อมูลบุคคล ${leak.slice(0, 3).join(", ")}`);
  };
  const ERR = (r: Rec, code: string, what: string) => { ok(r.ok === false && r.code === code, `${what}: ต้องได้ ${code} · ได้ ${fmt(r)}`); };

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB"), tC = rid("tC"), tD = rid("tD");
  const uA = rid("uA"), uB = rid("uB"), uC = rid("uC"), uD = rid("uD");
  const SA = `${SLUG}${STAMP}-a`, SB = `${SLUG}${STAMP}-b`, SC = `${SLUG}${STAMP}-c`, SD = `${SLUG}${STAMP}-d`;
  const NAME = { a: "ทดสอบ W1.2 a", b: "ทดสอบ W1.2 b", c: "ทดสอบ W1.2 c", d: "ทดสอบ W1.2 d" };
  let setupErr = "", onErr = "", contactErr = "";
  type Prod = { id: string; slug: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; cam: string; park: string; dive: string };
  const PRD: Record<string, Prod> = {};
  const DEP: Record<string, string> = {};
  const ZONE: Record<string, string> = {};
  const allIds: string[] = [tA, tB, tC, tD, uA, uB, uC, uD];
  let staffA = "";
  const OWNER: Record<string, Rec> = {};
  const SETI = await tryImport("@/lib/core/settings");
  const setV = async (tenantId: string, changes: Rec[]) => {
    const f = SETI.mod?.setSettings;
    if (typeof f !== "function") throw new AssertFail(`ไม่มี setSettings (${SETI.err.slice(0, 80)})`);
    const r = asRec(await (f as AnyFn)(OWNER[tenantId], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    if (r.ok !== true) throw new AssertFail(`setSettings ${changes.map((c) => String(c.key)).join(",")}: ${fmt(r)}`);
  };
  const mkDep = async (tag: string, key: string, date: string, o: { capacity?: number; sold?: number; status?: string; hm?: string; cutoffAt?: Date } = {}): Promise<string> => {
    const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const startsAt = BKK(date, o.hm ?? "08:00"); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8.5 * HOUR),
      status: o.status ?? "OPEN", capacity: o.capacity ?? 24, sold: o.sold ?? 0, held: 0, reserved: 0, minPax: null, cutoffAt: o.cutoffAt ?? startsAt, version: 0, updatedAt: new Date() });
    DEP[tag] = id; allIds.push(id);
    return id;
  };
  const mkProd = async (key: string, tenantId: string, unitId: string, o: { status?: string; type?: string; slug?: string } = {}) => {
    const id = rid(`p${key}`), opt = rid(`o${key}`);
    const slug = o.slug ?? `w12qc-${key.toLowerCase()}-${STAMP}`;
    await insertRow("TripProduct", { id, tenantId, unitId, slug, productType: o.type ?? "TOUR", sourceKind: "OWN", status: o.status ?? "ACTIVE", title: JSON.stringify({ th: `${R.name} ${key}`, en: `Racha test ${key}` }),
      body: JSON.stringify({ summary: { th: `สรุป ${key}` } }), currency: "THB", deepDive: false, crossBorder: false, publishedAt: new Date("2027-01-01T00:00:00Z"), updatedAt: new Date() });
    await insertRow("TripOption", { id: opt, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 510, sortOrder: 1, active: true, updatedAt: new Date() });
    const pt: Record<string, string> = {};
    for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code === "ADULT" ? "Adult" : code === "CHILD" ? "Child" : "Infant" }),
      ageMin: code === "CHILD" ? R.childAge.min : code === "ADULT" ? 12 : null, ageMax: code === "CHILD" ? R.childAge.max : code === "INFANT" ? 3 : null, countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
    const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: PA, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
      name: JSON.stringify({ th: "ค่าอุทยาน", en: "Marine park fee" }), paxPrices: JSON.stringify({ ADULT: PA, CHILD: PC_ }), active: true, sortOrder: 0, updatedAt: new Date() });
    const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: CAM, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
      name: JSON.stringify({ th: R.extras.camera.name, en: "Underwater camera rental" }), active: true, sortOrder: 1, updatedAt: new Date() });
    const dive = await insertRow("TripExtra", { id: rid("xdive"), tenantId, unitId, productId: id, kind: "COURSE", basis: "PER_PAX", mandatory: false, priceMinor: R.extras.introDive.satang, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
      name: JSON.stringify({ th: R.extras.introDive.name, en: "Try scuba diving, 1 dive" }), active: true, sortOrder: 2, updatedAt: new Date() });
    for (const [code, amount] of [["ADULT", AD], ["CHILD", CH], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
    PRD[key] = { id, slug, opt, unit: unitId, tenant: tenantId, pt, cam, park, dive };
    allIds.push(id, opt, park, cam, dive, ...Object.values(pt));
  };
  const mkZone = async (tag: string, tenantId: string, unitId: string, o: { kind: "ZONE" | "SELF"; th: string; en: string; surcharge: number; active?: boolean; sort: number }) => {
    const id = rid(`z${tag}`);
    await insertRow("TripPickupZone", { id, tenantId, unitId, name: o.th, nameEn: o.en, pickupOffsetMin: o.kind === "SELF" ? 0 : 75, surchargeSatang: o.surcharge, polygon: null, sortOrder: o.sort, kind: o.kind,
      areas: JSON.stringify({ th: `พื้นที่ ${tag}`, en: `Area ${tag}` }), windowMin: o.kind === "SELF" ? 0 : 30, active: o.active ?? true, basis: "PER_BOOKING", updatedAt: new Date() });
    ZONE[tag] = id; allIds.push(id);
  };
  const SHARED = `w12qc-racha-${STAMP}`;
  try {
    for (const t of ["TripProduct", "TripOption", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripPickupZone", "SellBasket", "TripHold", "TripBooking", "PaymentProfile", "ChatRateBucket"]) await needTable(t);
    for (const [id, slug, tag] of [[tA, SA, "a"], [tB, SB, "b"], [tC, SC, "c"], [tD, SD, "d"]] as const) { await insertRow("Tenant", { id, name: NAME[tag], slug, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uB, tB, "b"], [uC, tC, "c"], [uD, tD, "d"]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", status: "ACTIVE", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({}), updatedAt: new Date() });
    for (const [t, tag] of [[tA, "a"], [tB, "b"], [tC, "c"], [tD, "d"]] as const) {
      const u = rid(`uo${tag}`);
      await insertRow("User", { id: u, email: `${EMAIL_PREFIX}o${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ o${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mbo${tag}`), userId: u, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      OWNER[t] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: u };
      if (t === tA) staffA = u;
    }
    await insertRow("PaymentProfile", { id: rid("pp"), tenantId: tA, promptpayId: "0812345678", displayName: RECEIVER_NAME, updatedAt: new Date() }); // ร้าน B ไม่ตั้งผู้รับเงิน (NO_RECEIVER)
    await mkProd("A", tA, uA, { slug: SHARED }); await mkProd("LB", tA, uA, { type: "LIVEABOARD" }); await mkProd("DRAFT", tA, uA, { status: "DRAFT" }); await mkProd("B", tB, uB, { slug: SHARED });
    await mkProd("DEP", tA, uA); await mkProd("SC", tA, uA); await mkProd("C", tC, uC); await mkProd("D", tD, uD);
    await mkZone("in", tA, uA, { kind: "ZONE", th: "รับที่โรงแรมในโซน", en: "Hotel pickup", surcharge: 0, sort: 0 });
    await mkZone("out", tA, uA, { kind: "ZONE", th: "นอกโซน", en: "Outside zone", surcharge: OUTZ, sort: 1 });
    await mkZone("self", tA, uA, { kind: "SELF", th: "มาเองที่ท่าเรือ", en: "Meet at the pier", surcharge: 0, sort: 2 });
    await mkZone("off", tA, uA, { kind: "ZONE", th: "โซนปิด", en: "Closed zone", surcharge: 0, active: false, sort: 3 });
    await mkZone("late", tA, uA, { kind: "ZONE", th: "โซนที่จะปิด", en: "Zone to close", surcharge: 0, sort: 4 });
    await mkZone("b", tB, uB, { kind: "ZONE", th: "โซนร้าน B", en: "Shop B zone", surcharge: 0, sort: 0 });
    // รอบ (เวลาร้านกรุงเทพ): main 10 มี.ค. 24 ที่ · race 11 มี.ค. 12 ที่ (X3) · rl 12 มี.ค. 40 ที่ (ด่านอัตรา/ส่งซ้ำ) · full 13 มี.ค. เต็ม · canc 14 มี.ค. ยกเลิก · cut 1 มี.ค. 15:00 (ปิดรับแล้ว) · exp 15 มี.ค. · B 10 มี.ค.
    await mkDep("main", "A", "2027-03-10"); await mkDep("race", "A", "2027-03-11", { capacity: 12 }); await mkDep("rl", "A", "2027-03-12", { capacity: 40 }); await mkDep("full", "A", "2027-03-13", { capacity: 10, sold: 10 });
    await mkDep("canc", "A", "2027-03-14", { status: "CANCELLED" }); await mkDep("cut", "A", "2027-03-01", { hm: "15:00" }); await mkDep("exp", "A", "2027-03-15", { capacity: 30 }); await mkDep("snap", "A", "2027-03-16", { capacity: 30 });
    await mkDep("lb", "LB", "2027-03-10"); await mkDep("draft", "DRAFT", "2027-03-10"); await mkDep("b", "B", "2027-03-10");
    // รอบ 2: c14 ปิดหลังถือ · c15 ปิดรับ 1 มี.ค. 10:05 (ค่าตั้งระดับรอบ) · slot/slot2 ถังต่อรอบ · pc ราคาเปลี่ยน/ยอดจอ · nm ผู้จอง · p6 p9a p9b ตัวควบคุม · rl1–6 RL-1 (เดือน เม.ย.)
    await mkDep("c14", "A", "2027-03-17"); await mkDep("c15", "A", "2027-03-02", { hm: "18:00", cutoffAt: BKK("2027-03-01", "10:05") }); await mkDep("slot", "A", "2027-03-19"); await mkDep("slot2", "A", "2027-03-21");
    await mkDep("pc", "A", "2027-03-22", { capacity: 30 }); await mkDep("p6", "A", "2027-03-23"); await mkDep("p9a", "A", "2027-03-24"); await mkDep("p9b", "A", "2027-03-03", { hm: "18:00", cutoffAt: BKK("2027-03-01", "10:05") });
    await mkDep("nm", "A", "2027-03-25", { capacity: 30 });
    for (let i = 1; i <= 6; i++) await mkDep(`rl${i}`, "A", `2027-04-0${i}`);
    await mkDep("dep", "DEP", "2027-03-10"); await mkDep("sc", "SC", "2027-03-10"); await mkDep("vat", "C", "2027-03-10"); await mkDep("d", "D", "2027-03-10");
    // ค่าตั้งที่มีอยู่แล้ว (ต้องผ่านตั้งแต่ก่อนมีงาน — ตัวควบคุมใช้)
    const cutoff1005 = (daysBefore: number) => ({ daysBefore, atMin: 10 * 60 + 5 });
    await setV(tA, [{ key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: PRD.DEP?.id, value: DEPOSIT_PCT }, { key: "trips.pay.balanceDueDaysBefore", scope: "PRODUCT", scopeId: PRD.DEP?.id, value: 3 },
      { key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: PRD.SC?.id, value: "SHOP_CONFIRMS" },
      { key: "trips.sell.cutoff", scope: "DEPARTURE", scopeId: DEP.c15, value: cutoff1005(1) }, { key: "trips.sell.cutoff", scope: "DEPARTURE", scopeId: DEP.p9b, value: cutoff1005(2) }]);
    await setV(tC, [{ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: uC, value: { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 } }, { key: "trips.tax.priceIncludesVat", scope: "UNIT", scopeId: uC, value: false }]);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  // ค่าตั้งใหม่ของใบนี้ (R7 · R13) — ยังไม่ลงทะเบียน = ข้อที่ต้องใช้แดงพร้อมเหตุผล (ร้าน D ไม่ตั้ง = ค่าเริ่ม "ปิด")
  if (!setupErr) {
    try { for (const [t, u] of [[tA, uA], [tB, uB], [tC, uC]] as const) await setV(t, [{ key: K_ON, scope: "UNIT", scopeId: u, value: true }]); } catch (e) { onErr = errMsg(e); }
    try { await setV(tA, [{ key: K_CONTACT, scope: "UNIT", scopeId: uA, value: SHOP_CONTACT }]); } catch (e) { contactErr = errMsg(e); }
  }
  const needFx = () => { ok(!setupErr && PRD.A && PRD.B, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); };
  const needDb = () => {
    needFx();
    ok(BSI.mod, `ยังไม่มี platform/trips-book (W1.2a ยังไม่สร้าง · ${BSI.err.slice(0, 60)})`);
    ok(!onErr, `เปิดปุ่มจองของร้านทดสอบไม่ได้ — ยังไม่มีคีย์ ${K_ON} (R7 · ใบสั่ง §3.3): ${onErr.slice(0, 120)}`);
  };
  const needContact = () => { needDb(); ok(!contactErr, `ตั้งช่องทางติดต่อร้านไม่ได้ — ยังไม่มีคีย์ ${K_CONTACT} (R13 · ใบสั่ง §3.3): ${contactErr.slice(0, 120)}`); };
  const A = () => PRD.A as Prod;
  let phoneN = 0;
  const freshPhone = () => { phoneN++; return `06${String((parseInt(hex(3), 16) * 100 + phoneN) % 100_000_000).padStart(8, "0")}`; };

  // ── ตัวช่วยเรียก platform ──
  const nonceAt = (ms = -60_000): string => { const r = sfn("issueBookFormNonce")({ now: new Date(NOW0.getTime() + ms) }); if (typeof r !== "string" || !r) throw new AssertFail(`issueBookFormNonce ไม่คืนสตริง: ${fmt(r)}`); return r; };
  const optsOf = async (shop: string, productSlug: string, date: string, clientKey: string, lang = "th"): Promise<Rec> => {
    const r = await call("quoteBookSelection", { shop, productSlug, query: { d: date, lang }, acceptLanguage: lang, clientKey }, N0);
    ok(r.ok === true, `quoteBookSelection (ไม่มีคน) ${date}: ${fmt(r)}`);
    return asRec(r.options) ?? {};
  };
  type Pick = { adults?: number; children?: number; infants?: number; camera?: boolean; dive?: number; zone?: "in" | "out" | "self" | null };
  const refOf = (o: Rec, kind: "extra" | "zone", match: RegExp): string => {
    const list = kind === "extra" ? asArr(o.extras) : asArr(o.zones);
    const hit = list.find((x) => match.test(String(asRec(x.name)?.text ?? x.name ?? "")));
    if (!hit || typeof hit.ref !== "string") throw new AssertFail(`ไม่พบ ${kind} ${match} ใน options: ${fmt(list.map((x) => asRec(x.name)?.text))}`);
    return hit.ref;
  };
  const selQuery = (o: Rec, pk: Pick): Rec => {
    const s: Rec = {};
    if (pk.adults) s["n.ADULT"] = String(pk.adults);
    if (pk.children) s["n.CHILD"] = String(pk.children);
    if (pk.infants) s["n.INFANT"] = String(pk.infants);
    if (pk.camera) s[`x.${refOf(o, "extra", /กล้อง|camera/i)}`] = "1";
    if (pk.dive) s[`x.${refOf(o, "extra", /ดำน้ำลึก|scuba/i)}`] = String(pk.dive);
    if (pk.zone) s.z = refOf(o, "zone", pk.zone === "in" ? /ในโซน|Hotel pickup/ : pk.zone === "out" ? /นอกโซน|Outside/ : /มาเอง|pier/i);
    return s;
  };
  const summaryOf = async (date: string, pk: Pick, clientKey: string, o?: Rec): Promise<Rec> => {
    const opts = o ?? (await optsOf(SA, A().slug, date, clientKey));
    const r = await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: date, ...selQuery(opts, pk) }, acceptLanguage: "th", clientKey }, N0);
    ok(r.ok === true && asRec(r.summary), `quoteBookSelection ${fmt(pk)}: ${fmt(r)}`);
    return asRec(r.summary) ?? {};
  };
  type Held = { basketToken: string; sel: string; expiresAt: string; clientKey: string; total: number; shopSlug?: string };
  const hold = async (date: string, pk: Pick, o: { clientKey?: string; nonce?: string; opts?: Rec; seen?: number; when?: { now: Date }; shop?: string; slug?: string } = {}): Promise<Rec> => {
    const clientKey = o.clientKey ?? ck();
    const opts = o.opts ?? (await optsOf(SA, A().slug, date, clientKey));
    const seen = o.seen ?? Number((await summaryOf(date, pk, clientKey, opts)).totalSatang);
    return call("startBookHold", { shop: o.shop ?? SA, productSlug: o.slug ?? A().slug, form: { d: date, ...selQuery(opts, pk), nonce: o.nonce ?? nonceAt(), seen: String(seen) }, acceptLanguage: "th", clientKey }, o.when ?? N0);
  };
  const holdOk = async (date: string, pk: Pick, o: Parameters<typeof hold>[2] = {}): Promise<Held> => {
    const clientKey = o.clientKey ?? ck();
    const opts = o.opts ?? (await optsOf(o.shop ?? SA, o.slug ?? A().slug, date, clientKey));
    const seen = o.seen ?? Number((await summaryOf(date, pk, clientKey, opts)).totalSatang);
    const r = await hold(date, pk, { ...o, clientKey, opts, seen });
    ok(r.ok === true && typeof r.basketToken === "string" && typeof r.sel === "string", `startBookHold: ${fmt(r)}`);
    return { basketToken: String(r.basketToken), sel: String(r.sel), expiresAt: String(r.expiresAt), clientKey, total: seen, shopSlug: String(r.shopSlug) };
  };
  const checkout = (h: Held, when = N0, shop = SA) => call("loadBookCheckout", { shop, basketToken: h.basketToken, sel: h.sel, lang: "th", acceptLanguage: "th", clientKey: h.clientKey }, when);
  const BOOKER = { name: `ภัทรา ทดสอบ ${STAMP}`, phone: `08${String(10_000_000 + (parseInt(STAMP.slice(-4), 36) % 89_999_999)).padStart(8, "0")}`, email: `pattra.${STAMP}@example.com` };
  /** ยืนยัน: nonce ของหน้ายืนยัน (ออกตอนเปิดหน้า ณ NOW0) · ส่งหลังจากนั้น 10 วิ (พ้น BOOK_FORM_MIN_SEC) · seen = ยอดที่จอแสดงตอนถือ (R6) — ทุกเวลาเป็นนาฬิกาที่ข้อสอบส่ง */
  const confirm = async (h: Held, o: { form?: Rec; when?: { now: Date }; shop?: string; nonce?: string } = {}) => {
    let nonce = o.nonce;
    if (!nonce) { const c = await checkout(h, N0, o.shop ?? SA); nonce = String(asRec(asRec(c.vm)?.form)?.nonce ?? nonceAt()); }
    return call("confirmBookHold", { shop: o.shop ?? SA, basketToken: h.basketToken, sel: h.sel, form: { name: BOOKER.name, phone: BOOKER.phone, email: BOOKER.email, accept: "on", nonce, seen: String(h.total), ...(o.form ?? {}) }, clientKey: h.clientKey }, o.when ?? at(10_000));
  };
  /** ยืนยันด้วยเบอร์ใหม่ (ไม่ชนเพดาน X10 ของ BOOKER) ⇒ token */
  const confirmNew = async (h: Held, o: Parameters<typeof confirm>[1] = {}): Promise<string> => {
    const r = await confirm(h, { ...o, form: { phone: freshPhone(), email: "", ...(o.form ?? {}) } });
    ok(r.ok === true && typeof r.token === "string", `confirmBookHold: ${fmt(r)}`);
    return String(r.token);
  };
  const reservation = (token: string, clientKey: string, when = AFTER, shop = SA, lang = "th") => call("openBookReservation", { shop, token, lang, acceptLanguage: lang, clientKey }, when);
  const pubCtx = (tenantId: string, unitId: string, when = AFTER) => ({ tenantId, unitId, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `pc_${"9".repeat(40)}` }, now: when.now });
  const bookingsOn = async (dep: string) => (await q(`SELECT id FROM "TripBooking" WHERE "departureId" = $1`, [dep])).length;
  const partiesOf = async (t: string) => Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Party" WHERE "tenantId" = $1`, [t]))[0]?.n ?? -1);
  const withPrice = async <T,>(productId: string, ptId: string, base: number, delta: number, fn: () => Promise<T>): Promise<T> => {
    await pool.query(`UPDATE "TripPrice" SET "amountMinor" = $1 WHERE "productId" = $2 AND "paxTypeId" = $3 AND "departureId" IS NULL`, [base + delta, productId, ptId]);
    try { return await fn(); } finally { await pool.query(`UPDATE "TripPrice" SET "amountMinor" = $1 WHERE "productId" = $2 AND "paxTypeId" = $3 AND "departureId" IS NULL`, [base, productId, ptId]); }
  };
  /** sel = v1.<base64url(JSON)>.<MAC 22 ตัว> (R9) ⇒ payload ที่ถอดแล้ว หรือ null */
  const selParts = (sel: string): { payload: Rec | null; mac: string; raw: string } => {
    const [v, raw = "", mac = ""] = sel.split(".");
    if (v !== "v1") return { payload: null, mac, raw };
    try { return { payload: asRec(JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))), mac, raw }; } catch { return { payload: null, mac, raw }; }
  };
  const bookingOfToken = async (token: string) => (await q<{ id: string; status: string; code: string; channel: string; payMethod: string; bookerPartyId: string | null; tenantId: string; departureId: string; grossSatang: number; paidSatang: number }>(
    `SELECT id, status, code, channel, "payMethod", "bookerPartyId", "tenantId", "departureId", "grossSatang", "paidSatang" FROM "TripBooking" WHERE "publicTokenHash" = $1`, [sha256hex(token)]))[0] ?? null;
  const depRow = async (id: string) => (await q<{ sold: number; held: number; capacity: number }>(`SELECT sold, held, capacity FROM "TripDeparture" WHERE id = $1`, [id]))[0] ?? { sold: -1, held: -1, capacity: -1 };
  const staffCtx = (when = N0) => ({ tenantId: tA, unitId: uA, channel: "COUNTER", actor: { kind: "STAFF", userId: staffA }, now: when.now });

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม (positive control ผ่านบริการของโมดูลโดยตรง) ──");
  await st("PC-1", "ฟิกซ์เจอร์: ราชา 3,500 / 2,450 · อุทยาน 600 / 300 · กล้อง 500 · นอกโซน 600 · ถือที่ 15 นาที · 2 ผู้ใหญ่ 1 เด็ก + กล้อง = ฿11,450.00 (BOOKING_TR_0142)", () => {
    eq([AD, CH, PA, PC_, CAM, OUTZ, HOLD_MIN, TOTAL_2A1C_CAM], [350_000, 245_000, 60_000, 30_000, 50_000, 60_000, 15, 1_145_000], "ฟิกซ์เจอร์");
    eq(FX.BOOKING_TR_0142.totalSatang, TOTAL_2A1C_CAM, "ยอด TR-6911-0142");
  });
  await st("PC-2", "บริการที่ใบนี้ต่อสายมีใน facade (quoteTrips · holdTrips · confirmTrips · tripPaymentIntent · recordTripPayment · bookingPublicToken) + W1.1 (resolveBookShop · bookClientKey · openBookProduct) · SESSION_SECRET ≥ 32", () => {
    for (const n of ["quoteTrips", "holdTrips", "confirmTrips", "tripPaymentIntent", "recordTripPayment", "bookingPublicToken", "listAvailability"]) tfn(n);
    for (const n of ["resolveBookShop", "bookClientKey", "openBookProduct", "bookRequestFromHeaders"]) ok(typeof PUBI.mod?.[n] === "function", `W1.1 ไม่มี ${n}`);
    ok((process.env.SESSION_SECRET ?? "").length >= 32, "SESSION_SECRET ของ .env.qc-trips สั้น/ไม่มี");
  });
  let pcToken = "";
  await st("PC-3", "positive control: ร้านชั่วคราว — โมดูลตรง PUBLIC: quote → hold (basketToken) → confirm ⇒ การจอง HOLD · tripPaymentIntent ด้วย token = ฿11,450.00 · QR ยอดล็อก (EMV 54 = 11450.00) ผู้รับ = PaymentProfile ของร้าน", async () => {
    needFx();
    const ctx = { tenantId: tA, unitId: uA, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `pc_${"0".repeat(40)}` }, now: NOW0 };
    const line = { productKind: "TRIP", unitId: uA, productId: A().id, slotId: DEP.snap, optionId: A().opt, pax: [{ paxTypeId: A().pt.ADULT, qty: 2 }, { paxTypeId: A().pt.CHILD, qty: 1 }], extras: [{ extraId: A().cam, qty: 1 }], pickupZoneId: ZONE.in };
    const qt = await tcall("quoteTrips", ctx, { lines: [line] });
    ok(qt.ok === true, `quoteTrips: ${fmt(qt)}`);
    const qv = asRec(qt.value) ?? {};
    eq([asRec(asRec(qv.totals)?.payable)?.satang, qv.holdMinutes], [TOTAL_2A1C_CAM, HOLD_MIN], "ยอด/เวลาถือของบริการราคา");
    const bt = randomBytes(32).toString("base64url");
    const h = await tcall("holdTrips", ctx, { quote: { lines: [line] }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `pcqc_${hex(6)}`, basketToken: bt });
    ok(h.ok === true, `holdTrips: ${fmt(h)}`);
    const hv = asRec(h.value) ?? {};
    eq(hv.expiresAt, new Date(NOW0.getTime() + HOLD_MIN * MIN).toISOString(), "เวลาหมดถือ = now + 15 นาที");
    const c = await tcall("confirmTrips", ctx, { holdIds: hv.holdIds, basketId: hv.basketId, basketToken: bt, quote: { lines: [line] }, quoteId: qv.quoteId, idempotencyKey: `pcqcc_${hex(6)}`,
      booker: { name: `PC ${STAMP}`, phone: "0899999999" }, pay: { method: "PAY_NOW" } });
    ok(c.ok === true, `confirmTrips: ${fmt(c)}`);
    const ref = asArr(c.value)[0] ?? {};
    eq(ref.status, "HOLD", "สถานะแรกของการจองสาธารณะจ่ายเต็ม");
    pcToken = String(ref.publicToken);
    const pi = await tcall("tripPaymentIntent", ctx, { publicToken: pcToken });
    ok(pi.ok === true, `tripPaymentIntent: ${fmt(pi)}`);
    const pv = asRec(pi.value) ?? {};
    eq([pv.amountSatang, pv.displayName], [TOTAL_2A1C_CAM, RECEIVER_NAME], "QR");
    ok(String(pv.payload).includes(`5408${(TOTAL_2A1C_CAM / 100).toFixed(2)}`), `payload ไม่มี EMV 54 ของยอด: ${String(pv.payload).slice(0, 80)}`);
  });
  await st("PC-4", "positive control: เวลาเกิน 15 นาที ⇒ tripPaymentIntent HOLD_EXPIRED · รอบปิดรับแล้ว (1 มี.ค. 15:00) ⇒ quote ได้แต่ holdTrips CUTOFF_PASSED · รอบเต็ม ⇒ SOLD_OUT", async () => {
    needFx(); ok(pcToken, "PC-3 ไม่ผ่าน");
    const ctx = (ms = 0) => ({ tenantId: tA, unitId: uA, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `pc_${"1".repeat(40)}` }, now: new Date(NOW0.getTime() + ms) });
    const pi = await tcall("tripPaymentIntent", ctx(16 * MIN), { publicToken: pcToken });
    eq([pi.ok, pi.code], [false, "HOLD_EXPIRED"], "intent หลังหมดเวลา");
    for (const [tag, code] of [["cut", "CUTOFF_PASSED"], ["full", "SOLD_OUT"]] as const) {
      const line = { productKind: "TRIP", unitId: uA, productId: A().id, slotId: DEP[tag], optionId: A().opt, pax: [{ paxTypeId: A().pt.ADULT, qty: 1 }] };
      const qt = await tcall("quoteTrips", ctx(), { lines: [line] });
      ok(qt.ok === true, `quote ${tag}: ${fmt(qt)}`);
      const qv = asRec(qt.value) ?? {};
      const h = await tcall("holdTrips", ctx(), { quote: { lines: [line] }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `pcqx_${hex(6)}`, basketToken: randomBytes(32).toString("base64url") });
      eq([h.ok, h.code], [false, code], `hold ${tag}`);
    }
  });
  await st("PC-5", "positive control: เพดานถือที่ต่อผู้ติดต่อ (X10 ค่าเริ่ม 3) — ยืนยันด้วยเบอร์เดียวกัน 4 ตะกร้า ⇒ 3 ใบแรก ok · ใบที่ 4 HOLD_LIMIT (นับตอน rekey ใน confirmTrips)", async () => {
    needFx();
    const phone = `09${String(parseInt(hex(4), 16) % 100_000_000).padStart(8, "0")}`;
    const ctx = { tenantId: tA, unitId: uA, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `pc_${"2".repeat(40)}` }, now: NOW0 };
    const line = { productKind: "TRIP", unitId: uA, productId: A().id, slotId: DEP.snap, optionId: A().opt, pax: [{ paxTypeId: A().pt.ADULT, qty: 1 }] };
    const codes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const qv = asRec((await tcall("quoteTrips", ctx, { lines: [line] })).value) ?? {};
      const bt = randomBytes(32).toString("base64url");
      const hv = asRec((await tcall("holdTrips", ctx, { quote: { lines: [line] }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `pcq5_${hex(6)}`, basketToken: bt })).value) ?? {};
      const c = await tcall("confirmTrips", ctx, { holdIds: hv.holdIds, basketId: hv.basketId, basketToken: bt, quote: { lines: [line] }, quoteId: qv.quoteId, idempotencyKey: `pcq5c_${hex(6)}`, booker: { name: `PC5 ${STAMP}`, phone }, pay: { method: "PAY_NOW" } });
      codes.push(c.ok === true ? "OK" : String(c.code));
    }
    eq(codes, ["OK", "OK", "OK", "HOLD_LIMIT"], "ผลต่อตะกร้า");
  });
  const lineOf = (P: Prod, unitId: string, dep: string, adults = 1, extras: Rec[] = []) => ({ productKind: "TRIP", unitId, productId: P.id, slotId: dep, optionId: P.opt, pax: [{ paxTypeId: P.pt.ADULT, qty: adults }], ...(extras.length ? { extras } : {}) });
  /** ถือผ่านโมดูลตรง (PUBLIC) ⇒ { line, qv, hv, bt } */
  const modHold = async (tenantId: string, unitId: string, line: Rec, when = N0) => {
    const ctx = pubCtx(tenantId, unitId, when);
    const qt = await tcall("quoteTrips", ctx, { lines: [line] });
    ok(qt.ok === true, `quoteTrips: ${fmt(qt)}`);
    const qv = asRec(qt.value) ?? {};
    const bt = randomBytes(32).toString("base64url");
    const h = await tcall("holdTrips", ctx, { quote: { lines: [line] }, quoteId: qv.quoteId, quoteExpiresAt: qv.expiresAt, idempotencyKey: `pcqh_${hex(6)}`, basketToken: bt });
    ok(h.ok === true, `holdTrips: ${fmt(h)}`);
    return { qv, hv: asRec(h.value) ?? {}, bt };
  };
  const modConfirm = (tenantId: string, unitId: string, line: Rec, m: { qv: Rec; hv: Rec; bt: string }, when: { now: Date }, quoteId?: unknown) =>
    tcall("confirmTrips", pubCtx(tenantId, unitId, when), { holdIds: m.hv.holdIds, basketId: m.hv.basketId, basketToken: m.bt, quote: { lines: [line] }, quoteId: quoteId ?? m.qv.quoteId, idempotencyKey: `pcqc_${hex(6)}`,
      booker: { name: `PC ${STAMP}`, phone: freshPhone() }, pay: { method: "PAY_NOW" } });
  await st("PC-6", "R6 ตัวควบคุม (บริการตรง): ร้านขึ้นราคาผู้ใหญ่ +฿100 หลังถือ ⇒ quoteId ใหม่ ≠ เดิม · payable +฿100 · confirmTrips ด้วย quoteId ของตอนถือ ⇒ PRICE_CHANGED (details.quote.quoteId = ใหม่) · ไม่มีการจอง", async () => {
    needFx();
    const line = lineOf(A(), uA, DEP.p6);
    const m = await modHold(tA, uA, line);
    const [q2, c] = await withPrice(A().id, A().pt.ADULT, AD, 10_000, async () => {
      const q = asRec((await tcall("quoteTrips", pubCtx(tA, uA, at(10_000)), { lines: [line] })).value) ?? {};
      return [q, await modConfirm(tA, uA, line, m, at(10_000))] as const;
    });
    const pay = (x: Rec) => Number(asRec(asRec(x.totals)?.payable)?.satang);
    eq([typeof m.qv.quoteId === "string" && m.qv.quoteId !== q2.quoteId, pay(q2) - pay(m.qv)], [true, 10_000], "ใบเสนอราคาหลังขึ้นราคา");
    eq([c.ok, c.code, asRec(asRec(c.details)?.quote)?.quoteId], [false, "PRICE_CHANGED", q2.quoteId], "ยืนยันด้วยราคาตอนถือ");
    eq(await bookingsOn(DEP.p6), 0, "การจอง");
  });
  await st("PC-7", `R12 ตัวควบคุม (บริการตรง): สินค้ามัดจำ ${DEPOSIT_PCT}% ฐานค่าทริป งวดสอง 3 วันก่อนเดินทาง — 1 ผู้ใหญ่ ⇒ payable ฿4,100 · งวดแรก DEPOSIT ฿1,050 (${DEPOSIT_PCT}% ของ ฿3,500 ไม่รวมค่าอุทยาน) · ยืนยัน ⇒ HOLD · tripPaymentIntent = ฿1,050`, async () => {
    needFx();
    const P = PRD.DEP as Prod;
    const line = lineOf(P, uA, DEP.dep);
    const m = await modHold(tA, uA, line);
    const first = asArr(m.qv.paymentSchedule)[0] ?? {};
    const dep = (AD * DEPOSIT_PCT) / 100;
    eq([asRec(asRec(m.qv.totals)?.payable)?.satang, first.kind, asRec(first.amount)?.satang], [AD + PA, "DEPOSIT", dep], "ใบเสนอราคา");
    const c = await modConfirm(tA, uA, line, m, at(10_000));
    ok(c.ok === true, `confirmTrips: ${fmt(c)}`);
    const ref = asArr(c.value)[0] ?? {};
    const pi = await tcall("tripPaymentIntent", pubCtx(tA, uA), { publicToken: ref.publicToken });
    eq([ref.status, pi.ok, asRec(pi.value)?.amountSatang], ["HOLD", true, dep], "งวดแรก");
  });
  await st("PC-8", "R12 ตัวควบคุม (บริการตรง): ร้าน C ราคาไม่รวม VAT (จด VAT) — 1 ผู้ใหญ่ + กล้อง ⇒ บรรทัด ฿3,500 + ค่าอุทยาน ฿600 + ฿500 · VAT 7% ของ ฿4,000 = ฿280 · payable ฿4,880 = Σ บรรทัด + VAT (ใบเสนอราคาไม่มีบรรทัด VAT — แพลตฟอร์มต้องแสดงเอง §7)", async () => {
    needFx();
    const P = PRD.C as Prod;
    const qt = await tcall("quoteTrips", pubCtx(tC, uC, N0), { lines: [lineOf(P, uC, DEP.vat, 1, [{ extraId: P.cam, qty: 1 }])] });
    ok(qt.ok === true, `quoteTrips: ${fmt(qt)}`);
    const qv = asRec(qt.value) ?? {};
    let items = 0;
    for (const l of asArr(qv.lines)) for (const it of asArr(l.items)) items += Number(asRec(it.amount)?.satang);
    const vat = Math.round(((AD + CAM) * 7) / 100);
    eq([items, asRec(asRec(qv.totals)?.payable)?.satang, vat], [AD + PA + CAM, AD + PA + CAM + vat, 28_000], "ยอด");
  });
  await st("PC-9", "R14 m7 ตัวควบคุม (บริการตรง · ฐานของด่านก่อนยืนยัน §4 ข้อ 8): ถือ 10:00 ได้ทั้งสองรอบ · ร้านปิดรอบ (setDepartureStatus CLOSED) ⇒ getAvailability WEB saleBlock STATUS · รอบปิดรับ 10:05 (ค่าตั้งระดับรอบ) ⇒ 10:00 saleBlock null · 10:06 saleBlock CUTOFF", async () => {
    needFx();
    const sb = async (dep: string, when: { now: Date }) => { const r = await tcall("getAvailability", pubCtx(tA, uA, when), { departureId: dep }); ok(r.ok === true, `getAvailability: ${fmt(r)}`); return asRec(r.value)?.saleBlock ?? null; };
    const run = async (tag: string, mutate: () => Promise<void>, when: { now: Date }) => {
      const line = lineOf(A(), uA, DEP[tag] ?? "");
      const m = await modHold(tA, uA, line);
      const before = await sb(DEP[tag] ?? "", N0);
      await mutate();
      const after = await sb(DEP[tag] ?? "", when);
      // ⚠️ หนี้บริการ (ใบสั่ง §12): confirmTrips ของการจองสาธารณะ HOLD/KEEP ไม่ตรวจสถานะรอบ/เวลาปิดรับ — แสดงผลจริงไว้ ไม่ใช่ข้อตัดสิน
      const c = await modConfirm(tA, uA, line, m, when);
      console.log(`     ℹ️ PC-9 ${tag}: confirmTrips ตรงหลังปิด/เลยเวลา = ${c.ok === true ? `ok ${String(asArr(c.value)[0]?.status)} (บริการไม่ตรวจ ⇒ แพลตฟอร์มต้องตรวจก่อน · C-14 C-15)` : String(c.code)}`);
      return [before, after];
    };
    const closed = await run("p9a", async () => {
      const r = asRec(await tfn("setDepartureStatus")({ tenantId: tA, actorUserId: staffA }, { unitId: uA, departureId: DEP.p9a, status: "CLOSED" }, { now: at(MIN).now })) ?? {};
      ok(r.ok === true, `ปิดรอบ: ${fmt(r)}`);
    }, at(2 * MIN));
    const cut = await run("p9b", async () => undefined, at(6 * MIN));
    eq([closed, cut], [[null, "STATUS"], [null, "CUTOFF"]], "saleBlock ก่อน/หลัง");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์และกติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด (static) ──");
  const compFiles = walk(COMP);
  const appFiles = walk(APP);
  const uiSrc = [...compFiles, ...appFiles].map((f) => stripComments(read(f))).join("\n");
  const needOwn = () => { const miss = OWN.filter((f) => !existsSync(join(ROOT, f))); ok(miss.length === 0, `ไฟล์ของใบยังไม่ครบ: ${miss.join(", ")}`); };
  await st("S-1", "ไฟล์เจ้าของครบ: trips-book-core · trips-book · modules/trips/public-booking · app/book/[shop]/actions.ts · c/[basket]/page.tsx · my/[token]/page.tsx · ไม่มี loading/route/error ใต้ app/book", () => {
    needOwn();
    const extra = (existsSync(join(ROOT, APP)) ? readdirSync(join(ROOT, APP), { recursive: true }).map(String) : []).filter((f) => /(^|\/)(loading|route|error)\.(tsx|ts)$/.test(f));
    ok(extra.length === 0, `ห้ามมี loading/route/error ใต้ app/book: ${extra.join(", ")}`);
  });
  await st("S-2", `ชื่อที่ส่งออกครบ: core ${BCORE_NAMES.length} ชื่อ · platform ${BSVC_FNS.length} ฟังก์ชัน · facade บล็อก "// TRIPS W1.2 ▸" ไม่มี export * · BOOK_ERROR_CODES / BOOK_RES_STATES ตรงใบสั่ง`, () => {
    for (const n of BCORE_NAMES) coreV(n);
    for (const n of BSVC_FNS) sfn(n);
    const src = read(FACADE);
    ok(/\/\/ TRIPS W1\.2 ▸/.test(src), "facade ไม่มีบล็อก // TRIPS W1.2 ▸");
    ok(!/export \* from/.test(src), "facade มี export *");
    eq([...(coreV("BOOK_ERROR_CODES") as string[])].sort(), [...ERROR_CODES].sort(), "BOOK_ERROR_CODES");
    eq([...(coreV("BOOK_RES_STATES") as string[])], RES_STATES, "BOOK_RES_STATES");
    eq([...(coreV("BOOK_TODO_KEYS") as string[])], ["PAY", "PASSENGERS", "WAIVER"], "BOOK_TODO_KEYS");
  });
  await st("S-3", "trips-book-core เป็น pure: import ได้เฉพาะ import type · ไม่มี process.env / Date.now / new Date() ไม่มีอาร์กิวเมนต์ / getDay…getFullYear / fetch / prisma / crypto", () => {
    needOwn();
    const s = stripComments(read(BCORE));
    const imps = [...s.matchAll(/^import\s+(?!type\b)[^;]*;/gm)].map((m) => m[0].slice(0, 60));
    ok(imps.length === 0, `มี import ค่า: ${imps.join(" | ")}`);
    for (const [re, what] of [[/process\.env/, "process.env"], [/Date\.now\(/, "Date.now"], [/new Date\(\s*\)/, "new Date()"], [/\.get(Day|Date|Hours|Month|FullYear|Minutes)\(/, "getDay…"], [/\bfetch\(/, "fetch"], [/prisma/, "prisma"], [/node:crypto|createHmac/, "crypto"]] as const) ok(!re.test(s), `core มี ${what}`);
  });
  await st("S-4", "app/book + components/book (ทุกไฟล์ · m7) import เฉพาะ next/react/platform trips-public(-core)/trips-book(-core)/components/book (+ จอ: trips-shared · branding/public · messages book) · 'use server' มีเฉพาะ actions.ts (บนสุดของไฟล์) · actions.ts เรียก platform เท่านั้น ไม่อ่าน/ส่งเวลา/deps · redirect ไม่ใช้ค่าจาก FormData (R14) · query ของ redirect มีแค่ e f sel (R11)", () => {
    needOwn();
    const PLAT = ["@/lib/platform/trips-public", "@/lib/platform/trips-public-core", "@/lib/platform/trips-book", "@/lib/platform/trips-book-core"];
    const UI_EXTRA = ["@/components/trips/trips-shared", "@/lib/branding/public", "@/messages/th/book.json", "@/messages/en/book.json"];
    const allow = (s: string, ui: boolean) => s === "react" || s === "next" || s.startsWith("next/") || PLAT.includes(s) || (ui && UI_EXTRA.includes(s)) || s.startsWith("@/components/book/") || s.startsWith("./") || s.startsWith("../");
    const bad: string[] = [];
    for (const [files, ui] of [[appFiles, false], [compFiles, true]] as const)
      for (const f of files) for (const m of stripComments(read(f)).matchAll(/from\s+["']([^"']+)["']/g)) if (!allow(m[1] ?? "", ui)) bad.push(`${basename(dirname(f))}/${basename(f)} ← ${m[1]}`);
    ok(bad.length === 0, `import ต้องห้ามใน app/book · components/book: ${bad.slice(0, 5).join(" · ")}`);
    const us = [...appFiles, ...compFiles].filter((f) => /["']use server["']/.test(read(f)));
    eq(us, [ACTIONS], "ไฟล์ที่มี 'use server'");
    const ac = stripComments(read(ACTIONS));
    const redirects = [...ac.matchAll(/redirect\(([^;]*)\)/g)].map((m) => m[1] ?? "");
    ok(redirects.length >= 1 && redirects.every((r) => !/\.get\(|formData|FormData|fd\b/.test(r)), `redirect ต้องสร้างจากผลของ platform (shopSlug/path) ไม่ใช่ FormData: ${redirects.slice(0, 2).join(" | ")}`);
    const qkeys = [...new Set([...ac.matchAll(/[?&]([A-Za-z_.]+)=/g)].map((m) => m[1] ?? ""))];
    ok(qkeys.every((k) => ["e", "f", "sel"].includes(k)), `query ใน actions.ts มีได้แค่ e f sel (ห้ามค่าที่ผู้จองกรอก): ${qkeys.join(", ")}`);
    const a = stripComments(read(ACTIONS));
    ok(/^\s*["']use server["'];?/.test(read(ACTIONS)), "actions.ts ต้องขึ้นต้นด้วย 'use server'");
    for (const [re, what] of [[/\bnow\s*:/, "now:"], [/\bdeps\s*:/, "deps:"], [/new Date\(/, "new Date("], [/Date\.now\(/, "Date.now"], [/x-forwarded-for|x-real-ip/i, "ชื่อหัว IP (ต้องผ่าน bookRequestFromHeaders)"], [/clientIpFromHeaders\(|bookClientKey\(/, "ทำกุญแจเครื่องเอง"]] as const) ok(!re.test(a), `actions.ts มี ${what}`);
    ok(/bookRequestFromHeaders\(/.test(a), "actions.ts ต้องหา clientKey ด้วย bookRequestFromHeaders");
    for (const n of ["startBookHold", "confirmBookHold"]) ok(new RegExp(`\\b${n}\\(`).test(a), `actions.ts ไม่เรียก ${n}`);
    ok(!/export\s+(const|let|function\s)/.test(a.replace(/export\s+async\s+function/g, "")), "actions.ts ส่งออกได้เฉพาะ async function");
  });
  await st("S-5", "ไฟล์ฐานของใบ: ไม่มี $transaction · ไม่มี checkRateLimitDb( / checkRateLimitDbMany( · ไม่มี console.* · ไม่มีถัง \"unknown\" · ไม่อ่าน/เขียนตาราง Agent* · trips-book ใช้ rateBucketCte (ด่านคำสั่งเดียว) · public-booking ไม่มีคำสั่งเขียน", () => {
    needOwn();
    for (const f of [BSVC, PUBMOD, BCORE]) {
      const s = stripComments(read(f));
      for (const [re, what] of [[/\$transaction/, "$transaction"], [/checkRateLimitDb(Many)?\(/, "checkRateLimitDb"], [/console\.(log|info|warn|error|debug)\(/, "console.*"], [/["'`]unknown["'`]/, "\"unknown\""], [/"Agent[A-Z]\w*"|agentLink\.|agentAccount\./, "ตาราง Agent*"]] as const) ok(!re.test(s), `${basename(f)} มี ${what}`);
    }
    ok(/rateBucketCte\(/.test(stripComments(read(BSVC))), "trips-book ไม่ใช้ rateBucketCte");
    ok(!/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|INSERT INTO|UPDATE\s+"|DELETE FROM/.test(stripComments(read(PUBMOD))), "public-booking มีคำสั่งเขียน (การเขียนต้องผ่าน holdTrips/confirmTrips เท่านั้น)");
    ok(!/from\s+["']@\/lib\/core\/db["']/.test(stripComments(read(PUBMOD))), "public-booking import prisma ตรง");
  });
  await st("S-6", "จอไม่คิดเงิน/ไม่จัดรูปเงินเอง (toFixed · toLocaleString · parseFloat · Intl.NumberFormat · Satang [*/+-] · reduce( กับเงิน) · ไม่มี dangerouslySetInnerHTML · ไม่มี new Date( / Date.now ในจอและหน้า", () => {
    needOwn();
    for (const [re, what] of [[/\.toFixed\(/, "toFixed"], [/\.toLocaleString\(/, "toLocaleString"], [/parseFloat\(/, "parseFloat"], [/Intl\.NumberFormat/, "Intl.NumberFormat"], [/Satang\s*[/*+-]\s*[\w(]|[\w)]\s*[*+-]\s*\w*Satang\b/, "คิดเลขกับ Satang"],
      [/\.reduce\(/, "reduce("], [/dangerouslySetInnerHTML/, "dangerouslySetInnerHTML"], [/new Date\(/, "new Date("], [/Date\.now\(/, "Date.now"]] as const) ok(!re.test(uiSrc), `จอ/หน้า มี ${what}`);
    ok(/formatBaht\(/.test(uiSrc), "จอไม่ใช้ formatBaht");
  });
  await st("S-7", `data-testid ของใบครบ ${TESTIDS_W12.length} ตัว + แพตเทิร์น ${TESTID_PATTERNS_W12.join(" ")} · ฟอร์มยืนยัน/ถือที่เป็น <form action={…}> (ไม่มี fetch/onClick ส่งเอง) · หน้า my/c ตั้ง referrer no-referrer + robots noindex`, () => {
    needOwn();
    const miss = TESTIDS_W12.filter((t) => !new RegExp(`["'\`]${t}["'\`]`).test(uiSrc));
    ok(miss.length === 0, `ไม่มี testid: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` (+${miss.length - 8})` : ""}`);
    const missP = TESTID_PATTERNS_W12.filter((t) => !uiSrc.includes(`\`${t}\${`));
    ok(missP.length === 0, `ไม่มีแพตเทิร์น testid: ${missP.join(", ")}`);
    ok(/<form[^>]*action=\{/.test(uiSrc), "ไม่มี <form action={serverAction}>");
    ok(!/\bfetch\(/.test(uiSrc), "จอมี fetch(");
    for (const f of [PAGE_CHECKOUT, PAGE_RES]) {
      const s = stripComments(read(f));
      ok(/referrer\s*:\s*["']no-referrer["']/.test(s), `${f}: ต้องตั้ง metadata referrer: "no-referrer" (token อยู่ใน URL)`);
      ok(/robots\s*:\s*\{\s*index\s*:\s*false\s*,\s*follow\s*:\s*false\s*\}/.test(s), `${f}: ต้อง robots noindex/nofollow`);
      // R14: dynamic (Next ส่ง Cache-Control: private, no-cache, no-store ให้หน้า dynamic) · ไม่มี og:* · <title> ทั่วไป (ไม่มีรหัส/สินค้า/วันที่)
      ok(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(s), `${f}: ต้อง export const dynamic = "force-dynamic" (R14 no-store)`);
      ok(!/export\s+const\s+revalidate|["']use cache["']|generateStaticParams|cacheLife\(/.test(s), `${f}: ห้ามแคช/สร้างล่วงหน้า`);
      ok(!/openGraph|og:|twitter\s*:/.test(s), `${f}: ห้าม og:* / twitter`);
      const mi = s.search(/generateMetadata|export\s+const\s+metadata/);
      const mEnd = mi < 0 ? -1 : s.indexOf("\n}", mi);
      const meta = mi < 0 ? "" : s.slice(mi, mEnd > mi ? mEnd : mi + 1500);
      const titles = [...meta.matchAll(/title\s*:\s*([^,}\n]+)/g)].map((m) => m[1] ?? "");
      ok(titles.length >= 1 && titles.every((t) => !/vm\b|\.code\b|product|\.date\b|params|token|basket/.test(t)), `${f}: <title> ต้องเป็นข้อความทั่วไป (page.titleCheckout / page.titleReservation): ${titles.join(" | ")}`);
    }
  });
  await st("S-8", `ฉากภาพ w1.2 ใน scripts/visual-trips.mts: ${VISUAL_SCENES.join(" · ")} · ทุกฉาก public · ฉากวอเชอร์ใช้ token ของการจอง seed (ไม่ฝัง token)`, () => {
    const v = read("scripts/visual-trips.mts");
    ok(/["']w1\.2["']\s*:/.test(v), "ไม่มีสเปก w1.2");
    const block = v.slice(v.search(/["']w1\.2["']\s*:/));
    const miss = VISUAL_SCENES.filter((n) => !new RegExp(`name:\\s*["']${n}["']`).test(block));
    ok(miss.length === 0, `ไม่มีฉาก: ${miss.join(", ")}`);
    ok(/bookingPublicToken/.test(v), "ฉากวอเชอร์ต้องหา token ด้วย bookingPublicToken ของการจอง seed");
    ok(!/[A-Za-z0-9_-]{43}/.test(block.slice(0, 2_000).replace(/name:\s*["'][^"']+["']/g, "")), "มี token ฝังในสเปก");
  });
  await st("S-9", "ไม่มี 'any' · ไม่มี @ts-ignore/@ts-expect-error/eslint-disable ในไฟล์ของใบ", () => {
    needOwn();
    for (const f of [...OWN, ...compFiles]) {
      const s = stripComments(read(f));
      ok(!/:\s*any\b|<any>|\bas any\b|any\[\]/.test(s), `${basename(f)} มี any`);
      ok(!/@ts-ignore|@ts-expect-error|eslint-disable/.test(read(f)), `${basename(f)} มีธงปิดตัวตรวจ`);
    }
  });
  await st("S-10", `ขอบเขต (เทียบ BASE ${BASE_SHA} · ไม่นับไฟล์ที่ตรงกับ session/trips): ไม่แตะ prisma/proxy/core/i18n/branding/payment/api/app/b/(store) · platform/modules นอกไฟล์ของใบ · ข้อสอบเดิม · seed · ไฟล์จำกัด: facade เพิ่ม ≤ 30 ไม่ลบ`, () => {
    const tip = git(["rev-parse", "--verify", "-q", "session/trips"]).trim() || git(["rev-parse", "--verify", "-q", "origin/session/trips"]).trim();
    const same = (f: string) => !!tip && git(["ls-files", "--", f]).trim() !== "" && git(["diff", "--name-only", tip, "--", f]).trim() === "";
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...FORBIDDEN_PATHS]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...FORBIDDEN_PATHS]).split("\n")].filter(Boolean))];
    const bad = changed.filter((f) => !same(f));
    ok(bad.length === 0, `แตะไฟล์นอกขอบเขต: ${bad.slice(0, 6).join(", ")}`);
    for (const [f, maxDel, maxAdd] of LIMITED) {
      const ns = git(["diff", "--numstat", BASE_SHA, "--", f]).trim().split(/\s+/);
      const add = Number(ns[0] ?? 0), del = Number(ns[1] ?? 0);
      if (same(f)) continue;
      ok(del <= maxDel && (maxAdd === null || add <= maxAdd), `${f}: +${add} −${del} (จำกัด −${maxDel}${maxAdd === null ? "" : ` +${maxAdd}`})`);
    }
    ok(!git(["diff", "--name-only", BASE_SHA, "--", "prisma"]).trim(), "ใบนี้ไม่มี migration");
  });
  groupLine("S");

  // ═══════════════ LG. ภาษา ═══════════════
  console.log("\n── LG: ภาษา ──");
  await st("LG-1", `book.json ไทย/อังกฤษ มีคีย์ของใบครบ ${I18N_REQUIRED.length} คีย์ ทั้งสองภาษา · ค่าอังกฤษไม่มีอักษรไทย · ไม่มีรหัสใบงาน/รหัสดิบในค่า · ไม่มี "ยืนยันเองภายใน 1 นาที" / "48" / "中文"`, () => {
    const th = flat(JSON.parse(read(MSG_TH) || "{}")), en = flat(JSON.parse(read(MSG_EN) || "{}"));
    const miss = I18N_REQUIRED.filter((k) => typeof th[k] !== "string" || !String(th[k]).trim() || typeof en[k] !== "string" || !String(en[k]).trim());
    ok(miss.length === 0, `คีย์ขาด: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` (+${miss.length - 8})` : ""}`);
    const thaiInEn = I18N_REQUIRED.filter((k) => /[ก-๙]/.test(String(en[k] ?? "")));
    ok(thaiInEn.length === 0, `อังกฤษมีอักษรไทย: ${thaiInEn.slice(0, 4).join(", ")}`);
    const vals = I18N_REQUIRED.flatMap((k) => [String(th[k] ?? ""), String(en[k] ?? "")]);
    const raw = vals.filter((v) => /\b([WTAKLSX]\d\.\d+[abc]?|OQ\d+)\b|\b(PRICE_CHANGED|HOLD_EXPIRED|SOLD_OUT|RATE_LIMITED|NOT_FOUND|PASSENGERS|AWAIT_SHOP)\b/.test(v));
    ok(raw.length === 0, `ค่ามีรหัส: ${raw.slice(0, 3).join(" | ")}`);
    const prom = vals.filter((v) => /1 นาที|within 1 minute|48 ชม|48 h|中文|ยืนยันเอง|auto-?confirm/i.test(v));
    ok(prom.length === 0, `สัญญาที่ระบบทำไม่ได้/ขัดมติ (OQ2 · ไม่มีตัวยืนยันอัตโนมัติ): ${prom.slice(0, 3).join(" | ")}`);
    // R14: PDPA ระบุ ร้าน = ผู้ควบคุม · SHARK = ผู้ประมวลผล · ไม่ถามความยินยอมการตลาด
    const pth = String(th["checkout.privacy"] ?? ""), pen = String(en["checkout.privacy"] ?? "");
    ok(/ผู้ควบคุม/.test(pth) && /ผู้ประมวลผล/.test(pth) && /SHARK/.test(pth) && /controller/i.test(pen) && /processor/i.test(pen) && /SHARK/.test(pen), `checkout.privacy ต้องระบุร้าน = ผู้ควบคุม · SHARK = ผู้ประมวลผล (ไทย/อังกฤษ)`);
    ok(!vals.some((v) => /การตลาด|marketing/i.test(v)), "ห้ามถามความยินยอมการตลาด (ไม่มีที่เก็บ)");
    ok(!Object.keys(th).some((k) => /^res\.await/.test(k)), "AWAIT_SHOP ย้ายไป W1.2b (R8) — ไม่มีคีย์ res.await ใน a");
  });
  groupLine("LG");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (trips-book-core) ──");
  await st("P-1", "ค่าคงที่: BOOK_MAX_SEATS 2..10 (R7) · BOOK_FORM_MIN_SEC 1..5 · BOOK_FORM_MAX_SEC 1800..86400 · BOOK_PAY_MARGIN_SEC 180 (R8) · BOOK_SLOT_HOLD_PER_HOUR 2 (R7) · BOOK_CONFIRM_PER_HOUR 20 (R10) · BOOK_TERMS_VERSION สตริงสั้น (R14) · BOOK_REF_RE = 12 ตัว a-z0-9 · BOOK_BASKET_TOKEN_RE = 43 ตัว base64url · BOOK_PAX_CODE_RE รับ ADULT ไม่รับ adult/<x>", () => {
    const m = Number(coreV("BOOK_MAX_SEATS")), a = Number(coreV("BOOK_FORM_MIN_SEC")), b = Number(coreV("BOOK_FORM_MAX_SEC"));
    ok(Number.isInteger(m) && m >= 2 && m <= 10, `BOOK_MAX_SEATS ${m} (R7: ≤ 10)`);
    eq([coreV("BOOK_PAY_MARGIN_SEC"), coreV("BOOK_SLOT_HOLD_PER_HOUR"), coreV("BOOK_CONFIRM_PER_HOUR")], [PAY_MARGIN_SEC, 2, 20], "เพดาน/ระยะ");
    const tv = coreV("BOOK_TERMS_VERSION");
    ok(typeof tv === "string" && /^[0-9A-Za-z.-]{1,20}$/.test(tv), `BOOK_TERMS_VERSION ${fmt(tv)}`);
    ok(Number.isInteger(a) && a >= 1 && a <= 5 && Number.isInteger(b) && b >= 1800 && b <= 86_400, `อายุฟอร์ม ${a}..${b}`);
    const ref = coreV("BOOK_REF_RE") as RegExp, bt = coreV("BOOK_BASKET_TOKEN_RE") as RegExp, pc = coreV("BOOK_PAX_CODE_RE") as RegExp;
    eq([ref.test("abc123def456"), ref.test("ABC123DEF456"), ref.test("abc123def45"), ref.test("abc123def4567")], [true, false, false, false], "BOOK_REF_RE");
    eq([bt.test(randomBytes(32).toString("base64url")), bt.test("a".repeat(42)), bt.test(`${"a".repeat(42)}=`)], [true, false, false], "BOOK_BASKET_TOKEN_RE");
    eq([pc.test("ADULT"), pc.test("CHILD_2"), pc.test("adult"), pc.test("<x>"), pc.test("")], [true, true, false, false, false], "BOOK_PAX_CODE_RE");
  });
  await st("P-2", "parseBookSelection: n.<CODE> / x.<ref> / z — เรียง code/ref · จำนวน 0 ถูกทิ้ง · คีย์อื่นถูกทิ้ง · ผิดรูป (ลบ · ทศนิยม · 1e3 · 01 · เกินเพดาน · code ตัวเล็ก/สคริปต์ · array · z ผิดรูป) ⇒ null ทั้งก้อน · ไม่ throw", () => {
    const f = P("parseBookSelection");
    const max = Number(coreV("BOOK_MAX_SEATS"));
    eq(f({ "n.CHILD": "1", "n.ADULT": "2", "n.INFANT": "0", "x.zzzzzzzzzzz1": "1", "x.aaaaaaaaaaa1": "2", z: "0123456789ab", d: "2027-03-10", lang: "th", foo: "bar" }),
      { pax: [{ code: "ADULT", qty: 2 }, { code: "CHILD", qty: 1 }], extras: [{ ref: "aaaaaaaaaaa1", qty: 2 }, { ref: "zzzzzzzzzzz1", qty: 1 }], zone: "0123456789ab" }, "แยกส่วน");
    eq(f({}), { pax: [], extras: [], zone: null }, "ว่าง");
    for (const bad of [{ "n.ADULT": "-1" }, { "n.ADULT": "1.5" }, { "n.ADULT": "1e3" }, { "n.ADULT": "01" }, { "n.ADULT": String(max + 1) }, { "n.adult": "1" }, { "n.<script>": "1" }, { "n.ADULT": ["1", "2"] },
      { "x.ABCDEFABCDEF": "1" }, { "x.short": "1" }, { z: "../../etc" }, { z: ["0123456789ab"] }, { "n.ADULT": 2 }]) eq(f(bad), null, fmt(bad));
    for (const junk of [null, undefined, "n.ADULT=2", 5, [], new Proxy({}, { get() { throw new Error("x"); }, ownKeys() { throw new Error("x"); } })]) {
      let r: unknown = "THREW";
      try { r = f(junk); } catch { /* ข้อสอบ */ }
      eq(r, null, `ขยะ ${typeof junk}`);
    }
  });
  await st("P-3", "selectionSeatsOk(selection, seatCodes, max): ต้องมีที่นั่ง ≥ 1 และรวมคนทุกประเภท ≤ max · ทารกล้วน ⇒ false", () => {
    const f = P("selectionSeatsOk");
    const seat = ["ADULT", "CHILD"];
    eq([f({ pax: [{ code: "ADULT", qty: 2 }, { code: "CHILD", qty: 1 }], extras: [], zone: null }, seat, 20), f({ pax: [{ code: "INFANT", qty: 1 }], extras: [], zone: null }, seat, 20),
      f({ pax: [], extras: [], zone: null }, seat, 20), f({ pax: [{ code: "ADULT", qty: 20 }, { code: "INFANT", qty: 1 }], extras: [], zone: null }, seat, 20), f({ pax: [{ code: "ADULT", qty: 20 }], extras: [], zone: null }, seat, 20)],
      [true, false, false, false, true], "ผล");
  });
  await st("P-4", "cancelDeadlinesOf(ladder, travelDate, today): วันสุดท้ายของแต่ละขั้น = วันเดินทาง − daysBefore (ปฏิทิน · ข้ามเดือน/ปีอธิกสุรทิน) · ขั้นที่เลยวันนี้แล้วไม่แสดง · ขั้น 0 วันไม่แสดง", () => {
    const f = P("cancelDeadlinesOf");
    const L = [{ daysBefore: 30, refundBp: 10_000 }, { daysBefore: 15, refundBp: 5_000 }, { daysBefore: 0, refundBp: 0 }];
    eq(f(L, "2027-04-20", "2027-03-01"), [{ date: "2027-03-21", pct: 100 }, { date: "2027-04-05", pct: 50 }], "สองขั้น");
    eq(f(L, "2027-04-20", "2027-03-25"), [{ date: "2027-04-05", pct: 50 }], "เลยขั้นแรก");
    eq(f(L, "2027-04-20", "2027-04-05"), [{ date: "2027-04-05", pct: 50 }], "วันสุดท้ายพอดี");
    eq(f(L, "2027-03-10", "2027-03-01"), [], "เลยทุกขั้น");
    eq(f([{ daysBefore: 1, refundBp: 10_000 }], "2028-03-01", "2028-01-01"), [{ date: "2028-02-29", pct: 100 }], "อธิกสุรทิน");
    eq(f([], "2027-04-20", "2027-03-01"), [], "บันไดว่าง");
  });
  await st("P-5", "reservationStateOf({ status, holdExpiresAt, now }): HOLD ยังไม่หมด ⇒ PAY · HOLD หมด/ไม่มีเวลา ⇒ EXPIRED · PENDING ⇒ null (AWAIT_SHOP = W1.2b · R8) · CONFIRMED/PART_PAID/PAID ⇒ VOUCHER · CANCELLED · TRAVELLED/NO_SHOW ⇒ ENDED · ไม่รู้จัก ⇒ null", () => {
    const f = P("reservationStateOf");
    const now = "2027-03-01T03:00:00.000Z", later = "2027-03-01T03:15:00.000Z";
    const r = (status: string, exp: string | null) => f({ status, holdExpiresAt: exp, now });
    eq([r("HOLD", later), r("HOLD", now), r("HOLD", null), r("PENDING", null), r("CONFIRMED", null), r("PART_PAID", null), r("PAID", null), r("EXPIRED", null), r("CANCELLED", null), r("TRAVELLED", null), r("NO_SHOW", null), r("WHAT", null)],
      ["PAY", "EXPIRED", "EXPIRED", null, "VOUCHER", "VOUCHER", "VOUCHER", "EXPIRED", "CANCELLED", "ENDED", "ENDED", null], "สถานะ");
  });
  await st("P-6", "bookTodoOf: PAY (ครบเมื่อยอดค้าง 0 และสถานะขายแล้ว) · PASSENGERS (ชื่อครบทุกคน รวมทารก) · WAIVER เฉพาะสินค้าที่ต้องเซ็น · ลำดับ PAY → PASSENGERS → WAIVER", () => {
    const f = P("bookTodoOf");
    eq(f({ status: "HOLD", outstandingSatang: 1_145_000, people: 3, named: 0, waiverRequired: false, waiversSigned: 0 }),
      [{ key: "PAY", done: false }, { key: "PASSENGERS", done: false, count: 0, total: 3 }], "ก่อนจ่าย");
    eq(f({ status: "PAID", outstandingSatang: 0, people: 3, named: 3, waiverRequired: true, waiversSigned: 1 }),
      [{ key: "PAY", done: true }, { key: "PASSENGERS", done: true, count: 3, total: 3 }, { key: "WAIVER", done: false, count: 1, total: 3 }], "จ่ายแล้ว");
    eq(asArr(f({ status: "CONFIRMED", outstandingSatang: 0, people: 2, named: 2, waiverRequired: false, waiversSigned: 0 }))[0], { key: "PAY", done: true }, "ยืนยันแบบไม่มียอดค้าง");
  });
  groupLine("P");

  // ═══════════════ Q. เลือกคน · รับส่ง · เสริม + ยอดจากบริการราคา ═══════════════
  console.log("\n── Q: เลือกคน/รับส่ง/เสริม + ยอด (ร้านชั่วคราว) ──");
  await st("Q-1", "options ของรอบ 10 มี.ค.: ประเภทคน ADULT/CHILD/INFANT (ราคาคนเดียว 3,500 / 2,450 / 0 · ทารกไม่มีที่นั่ง) · รายการเสริมไม่บังคับ 2 (กล้อง · ดำน้ำลึก — ไม่มีค่าอุทยานที่บังคับ) · โซนรับส่งที่เปิด 4 (ไม่มีโซนปิด · ไม่มีโซนร้าน B) เรียงตาม sortOrder · ref ตรง BOOK_REF_RE · ที่ว่าง 24", async () => {
    needDb();
    const o = await optsOf(SA, A().slug, "2027-03-10", ck());
    eq(asArr(o.pax).map((p) => [p.code, p.unitSatang, p.seat]), [["ADULT", AD, true], ["CHILD", CH, true], ["INFANT", 0, false]], "ประเภทคน");
    eq(asArr(o.extras).map((x) => asRec(x.name)?.text), [R.extras.camera.name, R.extras.introDive.name], "รายการเสริม");
    eq(asArr(o.zones).map((z) => [asRec(z.name)?.text, z.surchargeSatang, z.kind]), [["รับที่โรงแรมในโซน", 0, "ZONE"], ["นอกโซน", OUTZ, "ZONE"], ["มาเองที่ท่าเรือ", 0, "SELF"], ["โซนที่จะปิด", 0, "ZONE"]], "โซน");
    const re = coreV("BOOK_REF_RE") as RegExp;
    ok([...asArr(o.extras), ...asArr(o.zones)].every((x) => typeof x.ref === "string" && re.test(x.ref)), "ref ผิดรูป");
    eq([o.left, o.maxSeats], [24, coreV("BOOK_MAX_SEATS")], "ที่ว่าง/เพดาน");
  });
  await st("Q-2", `ยอดภาพ 01ข/19: 2 ผู้ใหญ่ 1 เด็ก + กล้อง + รับในโซน ⇒ รวม ฿${(TOTAL_2A1C_CAM / 100).toLocaleString("en")}.00 · เก็บแทน ฿1,500 · ทุกบรรทัด amount = qty × unit · ผลรวมบรรทัด = รวม · ที่นั่ง 3 · ถือ 15 นาที`, async () => {
    needDb();
    const s = await summaryOf("2027-03-10", { adults: 2, children: 1, camera: true, zone: "in" }, ck());
    const lines = asArr(s.lines);
    eq([s.totalSatang, s.passThroughSatang, s.seats, s.holdMinutes], [TOTAL_2A1C_CAM, 2 * PA + PC_, 3, HOLD_MIN], "ยอด");
    ok(lines.every((l) => Number(l.amountSatang) === Number(l.qty) * Number(l.unitSatang) && Number.isInteger(l.amountSatang)), `บรรทัดคูณไม่ตรง: ${fmt(lines.map((l) => [l.qty, l.unitSatang, l.amountSatang]))}`);
    let sum = 0; for (const l of lines) sum += Number(l.amountSatang);
    eq(sum, TOTAL_2A1C_CAM, "ผลรวมบรรทัด");
    eq(lines.filter((l) => l.kind === "SEAT").map((l) => Number(l.amountSatang)).sort((a, b) => b - a), [2 * AD, CH], "บรรทัดที่นั่ง");
    eq(lines.filter((l) => l.passThrough === true).reduce((a, l) => a + Number(l.amountSatang), 0), 2 * PA + PC_, "บรรทัดเก็บแทน");
    ok(lines.some((l) => l.kind === "EXTRA" && Number(l.amountSatang) === CAM && l.passThrough === false), "ไม่มีบรรทัดกล้อง 500");
    ok(!lines.some((l) => l.kind === "PICKUP"), "รับในโซนฟรีต้องไม่มีบรรทัดรับส่ง");
    ok(!lines.some((l) => l.kind === "VAT"), "ร้าน A ราคารวม VAT แล้ว — ต้องไม่มีบรรทัด VAT บวกเพิ่ม (R12)");
  });
  await st("Q-3", "นอกโซน ⇒ บรรทัด PICKUP +฿600 ⇒ รวม ฿12,050.00 · ดำน้ำลึก 2 คน ⇒ +฿3,800 · ทารก 1 คน ⇒ ที่นั่งไม่เพิ่ม ยอดไม่เพิ่ม", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-10", c);
    const out = await summaryOf("2027-03-10", { adults: 2, children: 1, camera: true, zone: "out" }, c, o);
    eq([out.totalSatang, asArr(out.lines).filter((l) => l.kind === "PICKUP").map((l) => l.amountSatang)], [TOTAL_2A1C_CAM + OUTZ, [OUTZ]], "นอกโซน");
    const dive = await summaryOf("2027-03-10", { adults: 2, dive: 2 }, c, o);
    eq(dive.totalSatang, 2 * AD + 2 * PA + 2 * R.extras.introDive.satang, "ดำน้ำลึก 2");
    const inf = await summaryOf("2027-03-10", { adults: 2, infants: 1 }, c, o);
    eq([inf.totalSatang, inf.seats], [2 * AD + 2 * PA, 2], "ทารก");
  });
  await st("Q-4", "VM ไม่มีของภายใน: options/summary ไม่มีคีย์ id/quoteId/priceSource/warnings/fingerprint/itemRef ไม่มีค่า id ของสินค้า/รอบ/ประเภทคน/รายการเสริม/โซน", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-10", c);
    const s = await summaryOf("2027-03-10", { adults: 2, children: 1, camera: true, zone: "out" }, c, o);
    noInternal({ o, s }, [...allIds], "เลือก/สรุป");
  });
  await st("Q-5", "เลือกผิด ⇒ INVALID พร้อม fields ไม่สะท้อนค่า: ไม่มีที่นั่ง (ทารกล้วน/ว่าง) ⇒ pax · เกิน BOOK_MAX_SEATS ⇒ pax · ref รายการเสริม/โซนที่ไม่มี ⇒ extras/zone · โซนร้าน B ⇒ zone · วันไม่มีรอบ ⇒ d", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-10", c);
    const max = Number(coreV("BOOK_MAX_SEATS"));
    const qs = (query: Rec) => call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-10", ...query }, acceptLanguage: "th", clientKey: c }, N0);
    const fieldsOf = (r: Rec): unknown => (r.ok === false && r.code === "INVALID" && Array.isArray(r.fields) ? [...(r.fields as string[])].sort() : `ได้ ${fmt(r)}`);
    eq(fieldsOf(await qs({ "n.INFANT": "1" })), ["pax"], "ทารกล้วน");
    eq(fieldsOf(await qs({ "n.ADULT": String(max), "n.CHILD": "1" })), ["pax"], "เกินเพดาน");
    eq(fieldsOf(await qs({ "n.ADULT": "1", "x.qqqqqqqqqqqq": "1" })), ["extras"], "ref เสริมไม่มี");
    eq(fieldsOf(await qs({ "n.ADULT": "1", z: "qqqqqqqqqqqq" })), ["zone"], "ref โซนไม่มี");
    const ob = await optsOf(SB, PRD.B?.slug ?? "", "2027-03-10", ck());
    eq(fieldsOf(await qs({ "n.ADULT": "1", z: String(asArr(ob.zones)[0]?.ref) })), ["zone"], "โซนของร้าน B");
    const r = await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-20", "n.ADULT": "1" }, acceptLanguage: "th", clientKey: c }, N0);
    ok(r.ok === false && (r.code === "INVALID" || r.code === "UNAVAILABLE"), `วันไม่มีรอบ: ${fmt(r)}`);
    ok(!JSON.stringify(await qs({ "n.<img src=x onerror=alert(1)>": "1" })).includes("onerror"), "ผลสะท้อนอินพุต");
    void o;
  });
  await st("Q-6", "โซน/รายการเสริมที่ปิดหลังเปิดหน้า: ref เดิม ⇒ INVALID (zone/extras) ไม่คิดราคาโซนปิด (หนี้ pricing.ts:184) · สินค้า Liveaboard/ร่าง/ร้านอื่นไม่มีสินค้านี้ ⇒ NOT_FOUND รูปเดียวกัน", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-10", c);
    const zLate = refOf(o, "zone", /โซนที่จะปิด/);
    const dRef = refOf(o, "extra", /ดำน้ำลึก/);
    await pool.query(`UPDATE "TripPickupZone" SET active = false WHERE id = $1`, [ZONE.late]);
    await pool.query(`UPDATE "TripExtra" SET active = false WHERE id = $1`, [A().dive]);
    try {
      const qs = (query: Rec) => call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-10", "n.ADULT": "1", ...query }, acceptLanguage: "th", clientKey: c }, N0);
      const z = await qs({ z: zLate }), x = await qs({ [`x.${dRef}`]: "1" });
      eq([z.code, z.fields, x.code, x.fields], ["INVALID", ["zone"], "INVALID", ["extras"]], "ปิดแล้ว");
    } finally {
      await pool.query(`UPDATE "TripPickupZone" SET active = true WHERE id = $1`, [ZONE.late]);
      await pool.query(`UPDATE "TripExtra" SET active = true WHERE id = $1`, [A().dive]);
    }
    const nf = [];
    for (const [shop, slug] of [[SA, PRD.LB?.slug], [SA, PRD.DRAFT?.slug], [SA, "no-such-trip"], ["no-such-shop", A().slug]] as const)
      nf.push(await call("quoteBookSelection", { shop, productSlug: slug, query: { d: "2027-03-10", "n.ADULT": "1" }, acceptLanguage: "th", clientKey: c }, N0));
    eq(nf, nf.map(() => ({ ok: false, code: "NOT_FOUND" })), "ไม่พบ");
  });
  await st("Q-7", "หน้าสินค้า (W1.1 openBookProduct) เปิดปุ่มหลักเมื่อวันที่เลือกขายได้: 10 มี.ค. ⇒ cta.enabled true · วันเต็ม/ไม่มีรอบ ⇒ selected null หรือ cta.enabled false · VM ยังไม่มี id ภายใน", async () => {
    needDb();
    const op = async (d: string) => { const f = PUBI.mod?.openBookProduct; ok(typeof f === "function", "ไม่มี openBookProduct"); return asRec(await (f as AnyFn)({ shop: SA, productSlug: A().slug, query: { d, m: d.slice(0, 7) }, acceptLanguage: "th", clientKey: ck() }, N0)) ?? {}; };
    const a = await op("2027-03-10"), b = await op("2027-03-13");
    ok(a.ok === true && b.ok === true, `openBookProduct: ${fmt(a).slice(0, 120)}`);
    eq(asRec(asRec(a.vm)?.cta)?.enabled, true, "วันขายได้");
    const sb = asRec(b.vm);
    ok(asRec(sb?.selected)?.date !== "2027-03-13" || asRec(sb?.cta)?.enabled === false, `วันเต็ม: ${fmt(sb?.cta)}`);
    noInternal(a.vm, allIds, "หน้าสินค้า");
  });
  await st("Q-8", "R8 สินค้าที่ร้านต้องยืนยันก่อน (trips.sell.confirmMode = SHOP_CONFIRMS ระดับสินค้า) ⇒ ปุ่มจองสาธารณะปิดใน a: หน้าสินค้า cta.enabled false · quoteBookSelection / startBookHold ⇒ UNAVAILABLE reason SHOP_CONFIRMS · ไม่มีที่ถือ/การจอง", async () => {
    needDb();
    const P = PRD.SC as Prod; const c = ck();
    const f = PUBI.mod?.openBookProduct; ok(typeof f === "function", "ไม่มี openBookProduct");
    const op = asRec(await (f as AnyFn)({ shop: SA, productSlug: P.slug, query: { d: "2027-03-10", m: "2027-03" }, acceptLanguage: "th", clientKey: c }, N0)) ?? {};
    const qv = await call("quoteBookSelection", { shop: SA, productSlug: P.slug, query: { d: "2027-03-10", "n.ADULT": "1" }, acceptLanguage: "th", clientKey: c }, N0);
    const hv = await call("startBookHold", { shop: SA, productSlug: P.slug, form: { d: "2027-03-10", "n.ADULT": "1", nonce: nonceAt(), seen: String(AD + PA) }, acceptLanguage: "th", clientKey: c }, N0);
    eq([op.ok, asRec(asRec(op.vm)?.cta)?.enabled, qv.ok, qv.code, qv.reason, hv.ok, hv.code, hv.reason], [true, false, false, "UNAVAILABLE", "SHOP_CONFIRMS", false, "UNAVAILABLE", "SHOP_CONFIRMS"], "ผล");
    eq([(await depRow(DEP.sc)).held, await bookingsOn(DEP.sc)], [0, 0], "ที่ถือ/การจอง");
  });
  await st("Q-9", "R12 ยอดจอ = payable ของบริการ: ร้าน C ราคาไม่รวม VAT — 1 ผู้ใหญ่ + กล้อง ⇒ summary มีบรรทัด VAT ฿280 (ไม่ใช่เก็บแทน) · Σ บรรทัด = totalSatang = ฿4,880 (= payable ใน PC-8) · หน้ายืนยันหลังถือยอดเดียวกัน", async () => {
    needDb();
    const P = PRD.C as Prod; const c = ck();
    const o = await optsOf(SC, P.slug, "2027-03-10", c);
    const query = { d: "2027-03-10", "n.ADULT": "1", [`x.${refOf(o, "extra", /กล้อง|camera/i)}`]: "1" };
    const r = await call("quoteBookSelection", { shop: SC, productSlug: P.slug, query, acceptLanguage: "th", clientKey: c }, N0);
    ok(r.ok === true, `quoteBookSelection: ${fmt(r)}`);
    const s = asRec(r.summary) ?? {}; const lines = asArr(s.lines);
    let sum = 0; for (const l of lines) sum += Number(l.amountSatang);
    const total = AD + PA + CAM + 28_000;
    eq([s.totalSatang, sum, lines.filter((l) => l.kind === "VAT").map((l) => [l.amountSatang, l.passThrough])], [total, total, [[28_000, false]]], "สรุป");
    const hb = await call("startBookHold", { shop: SC, productSlug: P.slug, form: { ...query, nonce: nonceAt(), seen: String(total) }, acceptLanguage: "th", clientKey: c }, N0);
    ok(hb.ok === true, `startBookHold ร้าน C: ${fmt(hb)}`);
    const cv = asRec((await call("loadBookCheckout", { shop: SC, basketToken: hb.basketToken, sel: hb.sel, lang: "th", acceptLanguage: "th", clientKey: c }, N0)).vm) ?? {};
    eq(asRec(cv.summary)?.totalSatang, total, "หน้ายืนยัน");
  });
  await st("Q-10", "R14 `a=` (รหัสลิงก์เอเจนซี่) ไม่เปลี่ยนราคา/ช่องทางใน a: summary เมื่อมี a = summary เมื่อไม่มี a ทุกช่อง · ถือที่ที่ส่ง a ⇒ ตะกร้าช่องทาง WEB · ไม่มีสถิติลิงก์ของร้าน", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-25", c);
    const base = { d: "2027-03-25", ...selQuery(o, { adults: 2, camera: true }) };
    const q1 = await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: base, acceptLanguage: "th", clientKey: c }, N0);
    const q2 = await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { ...base, a: "AGENT01" }, acceptLanguage: "th", clientKey: c }, N0);
    ok(q1.ok === true && q2.ok === true, `quote: ${fmt(q2)}`);
    eq(q2.summary, q1.summary, "summary เมื่อมี a");
    const h = await call("startBookHold", { shop: SA, productSlug: A().slug, form: { ...base, a: "AGENT01", nonce: nonceAt(), seen: String(asRec(q1.summary)?.totalSatang) }, acceptLanguage: "th", clientKey: ck() }, N0);
    ok(h.ok === true, `startBookHold: ${fmt(h)}`);
    eq((await q<{ channel: string }>(`SELECT channel FROM "SellBasket" WHERE "publicTokenHash" = $1`, [sha256hex(String(h.basketToken))])).map((x) => x.channel), ["WEB"], "ช่องทางตะกร้า");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripLinkStat" WHERE "tenantId" = $1 AND "linkId" IS NOT NULL`, [tA]))[0]?.n, 0, "สถิติลิงก์");
  });
  groupLine("Q");

  // ═══════════════ H. ถือที่ ═══════════════
  console.log("\n── H: ถือที่ (startBookHold) ──");
  let H1: Held | null = null;
  await st("H-1", "ถือที่สำเร็จ (URL ร้านตัวใหญ่ ⇒ shopSlug ตัวเล็กของจริง · R14): basketToken ตรง BOOK_BASKET_TOKEN_RE · expiresAt = now + 15 นาที · รอบ held +3 sold 0 · ตะกร้า 1 ใบช่องทาง WEB · TripHold ACTIVE จำนวน 3 · ฐานไม่มีชื่อ/เบอร์ (ยังไม่ถามผู้จอง)", async () => {
    needDb();
    const before = await depRow(DEP.main);
    H1 = await holdOk("2027-03-10", { adults: 2, children: 1, camera: true, zone: "in" }, { shop: SA.toUpperCase() });
    ok((coreV("BOOK_BASKET_TOKEN_RE") as RegExp).test(H1.basketToken), `basketToken ผิดรูป: ${H1.basketToken}`);
    eq(H1.shopSlug, SA, "shopSlug ที่ platform คืน (R14: action redirect จากค่านี้ ไม่ใช่จาก FormData)");
    eq(H1.expiresAt, new Date(NOW0.getTime() + HOLD_MIN * MIN).toISOString(), "หมดเวลาถือ");
    const after = await depRow(DEP.main);
    eq([after.held - before.held, after.sold - before.sold], [3, 0], "ตัวนับรอบ");
    const b = await q<{ channel: string; status: string; n: number }>(`SELECT b.channel, b.status, (SELECT COALESCE(sum("qtyPublic"), 0)::int FROM "TripHold" h WHERE h."basketId" = b.id AND h.status = 'ACTIVE') AS n FROM "SellBasket" b WHERE b."publicTokenHash" = $1 AND b."tenantId" = $2`, [sha256hex(H1.basketToken), tA]);
    eq(b, [{ channel: "WEB", status: "OPEN", n: 3 }], "ตะกร้า/ที่ถือ");
  });
  await st("H-2", "ยอดที่ลูกค้าเห็นต่างจากบริการราคา (ร้านขึ้นราคาระหว่างนั้น) ⇒ PRICE_CHANGED + totalSatang ใหม่ (2 ผู้ใหญ่ +฿100 ⇒ ฿11,650) · ไม่มีที่ถือเพิ่ม", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-10", c);
    const old = Number((await summaryOf("2027-03-10", { adults: 2, children: 1, camera: true }, c, o)).totalSatang);
    const before = await depRow(DEP.main);
    await pool.query(`UPDATE "TripPrice" SET "amountMinor" = $1 WHERE "paxTypeId" = $2 AND "departureId" IS NULL`, [AD + 10_000, A().pt.ADULT]);
    let r: Rec;
    try { r = await hold("2027-03-10", { adults: 2, children: 1, camera: true }, { clientKey: c, opts: o, seen: old }); }
    finally { await pool.query(`UPDATE "TripPrice" SET "amountMinor" = $1 WHERE "paxTypeId" = $2 AND "departureId" IS NULL`, [AD, A().pt.ADULT]); }
    eq([r.ok, r.code, r.totalSatang], [false, "PRICE_CHANGED", TOTAL_2A1C_CAM + 20_000], "ผล");
    eq((await depRow(DEP.main)).held, before.held, "ที่ถือ");
  });
  await st("H-3", "รอบเต็ม ⇒ SOLD_OUT · ปิดรับแล้ว ⇒ CUTOFF_PASSED · รอบยกเลิก ⇒ SLOT_CLOSED หรือ INVALID(d) · ทุกกรณีไม่มีตะกร้า/ที่ถือใหม่", async () => {
    needDb();
    const baskets = async () => Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SellBasket" WHERE "tenantId" = $1`, [tA]))[0]?.n ?? -1);
    const n0 = await baskets();
    const c = ck();
    const opts = await optsOf(SA, A().slug, "2027-03-10", c);
    const r1 = await hold("2027-03-13", { adults: 1 }, { clientKey: c, opts, seen: AD + PA });
    const r2 = await hold("2027-03-01", { adults: 1 }, { clientKey: c, opts, seen: AD + PA });
    const r3 = await hold("2027-03-14", { adults: 1 }, { clientKey: c, opts, seen: AD + PA });
    eq([r1.code, r2.code], ["SOLD_OUT", "CUTOFF_PASSED"], "เต็ม/ปิดรับ");
    ok(r3.ok === false && (r3.code === "SLOT_CLOSED" || (r3.code === "INVALID" && isDeepStrictEqual(r3.fields, ["d"]))), `ยกเลิก: ${fmt(r3)}`);
    eq(await baskets(), n0, "ตะกร้าใหม่");
  });
  await st("H-4", "ฟอร์ม: ไม่มี nonce/nonce ปลอม ⇒ INVALID(nonce) · ส่งเร็วกว่า BOOK_FORM_MIN_SEC ⇒ TOO_FAST · nonce เก่ากว่า BOOK_FORM_MAX_SEC ⇒ STALE_FORM · ไม่มี seen ⇒ INVALID(seen) · ไม่มีอะไรถูกถือ", async () => {
    needDb();
    const before = await depRow(DEP.rl);
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-12", c);
    const base = { d: "2027-03-12", ...selQuery(o, { adults: 1 }), seen: String(AD + PA) };
    const go = (form: Rec) => call("startBookHold", { shop: SA, productSlug: A().slug, form, acceptLanguage: "th", clientKey: c }, N0);
    const r1 = await go({ ...base }), r2 = await go({ ...base, nonce: "x.y.z" }), r3 = await go({ ...base, nonce: nonceAt(0) });
    const r4 = await go({ ...base, nonce: nonceAt(-(Number(coreV("BOOK_FORM_MAX_SEC")) + 60) * 1000) });
    const r5 = await go({ d: "2027-03-12", ...selQuery(o, { adults: 1 }), nonce: nonceAt() });
    eq([r1.code, r1.fields, r2.code, r2.fields, r3.code, r4.code, r5.code, r5.fields], ["INVALID", ["nonce"], "INVALID", ["nonce"], "TOO_FAST", "STALE_FORM", "INVALID", ["seen"]], "ผล");
    eq((await depRow(DEP.rl)).held, before.held, "ที่ถือ");
  });
  await st("H-5", "ไม่พบแบบเดียวกัน: สินค้า Liveaboard · สินค้าร่าง · slug ร้าน B ใต้ร้าน A ที่ไม่มีในร้าน A · ร้านไม่มี ⇒ { ok:false, code:NOT_FOUND } เท่ากันทุกตัว · ไม่มีตะกร้าใหม่", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-10", c);
    const out: Rec[] = [];
    for (const [shop, slug] of [[SA, PRD.LB?.slug], [SA, PRD.DRAFT?.slug], [SA, "w12qc-b-only"], ["no-such-shop-w12", A().slug]] as const)
      out.push(await call("startBookHold", { shop, productSlug: slug, form: { d: "2027-03-10", ...selQuery(o, { adults: 1 }), nonce: nonceAt(), seen: String(AD + PA) }, acceptLanguage: "th", clientKey: c }, N0));
    eq(out, out.map(() => ({ ok: false, code: "NOT_FOUND" })), "ไม่พบ");
  });
  groupLine("H");

  // ═══════════════ C. หน้ายืนยัน + ยืนยันการจอง ═══════════════
  console.log("\n── C: หน้ายืนยัน + ยืนยันการจอง ──");
  let T1 = "";
  await st("C-1", "loadBookCheckout: สรุปเดิม (รวม ฿11,450.00 · เก็บแทน ฿1,500) · ถือถึง 10:15 (เวลาร้าน) · ตารางยกเลิกขั้นบันได + บรรทัดสุดท้าย · ข้อกฎหมาย (เลขใบอนุญาต null เมื่อร้านไม่กรอก — ไม่บล็อก · termsVersion) · nonce ของฟอร์ม · ไม่มีของภายใน · vm.shop = ชื่อ/เบอร์/LINE/ที่อยู่จากค่าตั้งร้าน (R13)", async () => {
    needDb(); ok(H1, "H-1 ไม่ผ่าน");
    const r = await checkout(H1 as Held);
    ok(r.ok === true, `checkout: ${fmt(r)}`);
    const vm = asRec(r.vm) ?? {};
    const s = asRec(vm.summary) ?? {};
    eq([s.totalSatang, s.passThroughSatang, vm.holdUntil, vm.holdUntilLocal, vm.date], [TOTAL_2A1C_CAM, 2 * PA + PC_, new Date(NOW0.getTime() + HOLD_MIN * MIN).toISOString(), "10:15", "2027-03-10"], "สรุป/เวลา");
    eq(vm.cancelRows, [{ kind: "FROM_DAYS", days: 30, pct: 100 }, { kind: "FROM_DAYS", days: 15, pct: 50 }, { kind: "LATER_NONE" }], "ตารางยกเลิก");
    eq([asRec(vm.legal)?.licenseNo, asRec(vm.legal)?.termsVersion], [null, coreV("BOOK_TERMS_VERSION")], "เลขใบอนุญาต (ร้านไม่กรอก) · รุ่นเงื่อนไข (R14)");
    ok(typeof asRec(vm.form)?.nonce === "string", "ไม่มี nonce");
    needContact();
    eq(vm.shop, { name: NAME.a, contact: { phone: SHOP_CONTACT.phone, line: SHOP_CONTACT.line }, address: SHOP_CONTACT.address }, "ผู้ขาย (R13 · จากค่าตั้งร้าน)");
    noInternal(vm, allIds, "หน้ายืนยัน", [(H1 as Held).basketToken]);
  });
  await st("C-2", "ยืนยันไม่ผ่านด่านฟอร์ม ⇒ ไม่มีการจอง: ไม่ติ๊กยอมรับ ⇒ ACCEPT_REQUIRED · ชื่อว่าง ⇒ INVALID(name) · เบอร์ผิด ⇒ INVALID(phone) · อีเมลผิด ⇒ INVALID(email) · ผลไม่สะท้อนค่าที่ส่ง · ไม่มี Party ใหม่ (R10)", async () => {
    needDb(); ok(H1, "H-1 ไม่ผ่าน");
    const h = H1 as Held;
    const evil = `<script>w12${STAMP}</script>`;
    const p0 = await partiesOf(tA);
    const r1 = await confirm(h, { form: { accept: "" } });
    const r2 = await confirm(h, { form: { name: "   " } });
    const r3 = await confirm(h, { form: { phone: `abc${evil}` } });
    const r4 = await confirm(h, { form: { email: `x@${evil}` } });
    eq([r1.code, r2.code, r2.fields, r3.code, r3.fields, r4.code, r4.fields], ["ACCEPT_REQUIRED", "INVALID", ["name"], "INVALID", ["phone"], "INVALID", ["email"]], "ผล");
    ok(![r1, r2, r3, r4].some((r) => JSON.stringify(r).includes(`w12${STAMP}`)), "ผลสะท้อนอินพุต");
    eq((await q(`SELECT id FROM "TripBooking" WHERE "basketId" IN (SELECT id FROM "SellBasket" WHERE "publicTokenHash" = $1)`, [sha256hex(h.basketToken)])).length, 0, "การจอง");
    eq(await partiesOf(tA), p0, "Party ใหม่ (R10: ฟอร์มผิดไม่ถึงบริการ)");
  });
  await st("C-3", "ยืนยันสำเร็จ ⇒ { ok, token } · การจอง HOLD ช่องทาง WEB · PAY_NOW · รหัส TR-YYMM-NNNN · publicTokenHash = sha256(token) · ผู้จอง = Party ของร้าน A ชื่อ/เบอร์ตามฟอร์ม · ตะกร้า CHECKED_OUT", async () => {
    needDb(); ok(H1, "H-1 ไม่ผ่าน");
    const r = await confirm(H1 as Held);
    ok(r.ok === true && typeof r.token === "string", `confirm: ${fmt(r)}`);
    T1 = String(r.token);
    const b = await bookingOfToken(T1);
    ok(b, "หาการจองจาก sha256(token) ไม่เจอ");
    eq([b?.status, b?.channel, b?.payMethod, b?.tenantId, /^TR-\d{4}-\d{4,}$/.test(String(b?.code)), b?.departureId], ["HOLD", "WEB", "PAY_NOW", tA, true, DEP.main], "การจอง");
    const party = (await q<{ name: string; phone: string | null; tenantId: string }>(`SELECT name, phone, "tenantId" FROM "Party" WHERE id = $1`, [b?.bookerPartyId]))[0];
    eq([party?.name, party?.tenantId, String(party?.phone ?? "").replace(/\D/g, "").slice(-8)], [BOOKER.name, tA, BOOKER.phone.slice(-8)], "ผู้จอง");
    eq((await q<{ status: string }>(`SELECT status FROM "SellBasket" WHERE "publicTokenHash" = $1`, [sha256hex((H1 as Held).basketToken)]))[0]?.status, "CHECKED_OUT", "ตะกร้า");
  });
  await st("C-4", "ส่งซ้ำ (X4): ยืนยันซ้ำด้วย nonce เดิม ⇒ ok token เดิม · nonce ใหม่ ⇒ DONE + token เดิม · เปิดหน้ายืนยันหลังเสร็จ ⇒ DONE + token เดิม · การจองของตะกร้ายังมี 1", async () => {
    needDb(); ok(T1 && H1, "C-3 ไม่ผ่าน");
    const h = H1 as Held;
    const n = nonceAt();
    const a1 = await confirm(h, { nonce: n }), a2 = await confirm(h, { nonce: n });
    const c2 = await checkout(h);
    ok((a1.ok === true && a1.token === T1) || (a1.ok === false && a1.code === "DONE" && a1.token === T1), `ครั้งที่ 2: ${fmt(a1)}`);
    ok((a2.ok === true && a2.token === T1) || (a2.ok === false && a2.code === "DONE" && a2.token === T1), `ครั้งที่ 3: ${fmt(a2)}`);
    eq([c2.ok, c2.code, c2.token], [false, "DONE", T1], "หน้ายืนยัน");
    eq((await q(`SELECT id FROM "TripBooking" WHERE "basketId" IN (SELECT id FROM "SellBasket" WHERE "publicTokenHash" = $1)`, [sha256hex(h.basketToken)])).length, 1, "จำนวนการจอง");
  });
  await st("C-5", "ถือหมดเวลาก่อนยืนยัน (now + 16 นาที) ⇒ หน้ายืนยันและยืนยันได้รหัสเดียว HOLD_EXPIRED (R9) · ไม่มีการจอง", async () => {
    needDb();
    const h = await holdOk("2027-03-15", { adults: 1 });
    const late = at(16 * MIN);
    const c = await checkout(h, late);
    const r = await call("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, form: { name: BOOKER.name, phone: freshPhone(), accept: "on", nonce: nonceAt(15 * MIN), seen: String(h.total) }, clientKey: h.clientKey }, late); // nonce อายุ 60 วิ ณ เวลานั้น
    eq([c.ok, c.code, r.ok, r.code], [false, "HOLD_EXPIRED", false, "HOLD_EXPIRED"], "ผล");
    eq((await q(`SELECT id FROM "TripBooking" WHERE "departureId" = $1`, [DEP.exp])).length, 0, "การจอง");
  });
  await st("C-6", "ตัวอ้างผิด ⇒ NOT_FOUND รูปเดียวกัน (R9): basketToken สุ่ม · MAC ของ sel ถูกแก้ · sel ของตะกร้าอื่น · ตะกร้าร้าน A ผ่าน URL ร้าน B (X1) · แก้จำนวนคนใน payload คง MAC · sel = v1.<base64url JSON>.<MAC 22 ตัว> ยาว ≤ 1,024 · payload ไม่มี id ภายใน/token/ร้าน/หน่วย", async () => {
    needDb();
    const h = await holdOk("2027-03-15", { adults: 1 });
    const h2 = await holdOk("2027-03-15", { adults: 2 });
    const sp = selParts(h.sel);
    ok(h.sel.length <= 1024 && sp.payload && /^[A-Za-z0-9_-]{22}$/.test(sp.mac), `รูป sel: ยาว ${h.sel.length} · ${h.sel.slice(0, 40)}…`);
    const P0 = sp.payload ?? {};
    const forbid = INTERNAL_KEYS.filter((k) => k !== "quoteId" && keysDeep(P0).has(k));
    const js = JSON.stringify(P0);
    const leak = [...allIds, h.basketToken, sha256hex(h.basketToken), tA, uA].filter((x) => x && js.includes(x));
    ok(forbid.length === 0 && leak.length === 0, `payload ของ sel มีของภายใน: ${[...forbid, ...leak.map((x) => x.slice(0, 8))].join(", ")}`);
    eq([P0.n, P0.t, typeof P0.q === "string" && /^[0-9a-f]{64}$/.test(String(P0.q))], [[["ADULT", 1]], AD + PA, true], "payload (n · t · q ตามใบสั่ง §3.2)");
    const forged = `v1.${Buffer.from(JSON.stringify({ ...P0, n: [["ADULT", 2]] })).toString("base64url")}.${sp.mac}`;
    const tweak = h.sel.slice(0, -2) + (h.sel.endsWith("AA") ? "BB" : "AA");
    const out = [
      await checkout({ ...h, basketToken: randomBytes(32).toString("base64url") }),
      await checkout({ ...h, sel: tweak }),
      await checkout({ ...h, sel: h2.sel }),
      await checkout({ ...h, sel: forged }),
      await checkout(h, N0, SB),
      await call("confirmBookHold", { shop: SB, basketToken: h.basketToken, sel: h.sel, form: { name: BOOKER.name, phone: freshPhone(), accept: "on", nonce: nonceAt(), seen: String(h.total) }, clientKey: h.clientKey }, at(10_000)),
      await call("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: forged, form: { name: BOOKER.name, phone: freshPhone(), accept: "on", nonce: nonceAt(), seen: String(h.total) }, clientKey: h.clientKey }, at(10_000)),
    ];
    eq(out, out.map(() => ({ ok: false, code: "NOT_FOUND" })), "ไม่พบ");
  });
  await st("C-7", "เพดานผู้ติดต่อผ่านหน้าจอง: เบอร์เดียวกันยืนยัน 4 ตะกร้า (คนละเครื่อง) ⇒ ใบที่ 4 HOLD_LIMIT · ที่ถือของตะกร้าที่ 4 ยังอยู่จนหมดเวลา (ไม่สร้างการจอง)", async () => {
    needDb();
    const phone = `09${String(parseInt(hex(4), 16) % 100_000_000).padStart(8, "0")}`;
    const out: string[] = [];
    for (let i = 0; i < 4; i++) {
      const h = await holdOk("2027-03-15", { adults: 1 });
      const r = await confirm(h, { form: { phone, email: "" } });
      out.push(r.ok === true ? "OK" : String(r.code));
    }
    eq(out, ["OK", "OK", "OK", "HOLD_LIMIT"], "ผล");
  });
  const C_ONE = AD + PA; // 1 ผู้ใหญ่ = ฿4,100 · ขึ้นราคาผู้ใหญ่ +฿100 ⇒ ฿4,200
  await st("C-8", "R6 หน้ายืนยันเมื่อร้านขึ้นราคาหลังถือ ⇒ { ok:false, PRICE_CHANGED, heldTotalSatang ยอดเดิม ฿4,100 · totalSatang ยอดใหม่ ฿4,200 · rehold { productSlug, query } } (ไม่แสดงยอดใหม่เงียบ ๆ) · rehold ไม่มีของภายใน · ที่ถือเดิมไม่หาย · ไม่มีการจอง", async () => {
    needDb();
    const h = await holdOk("2027-03-22", { adults: 1 });
    const held0 = (await depRow(DEP.pc)).held;
    const r = await withPrice(A().id, A().pt.ADULT, AD, 10_000, () => checkout(h));
    eq([r.ok, r.code, r.heldTotalSatang, r.totalSatang, asRec(r.rehold)?.productSlug, String(asRec(asRec(r.rehold)?.query)?.["n.ADULT"] ?? "")], [false, "PRICE_CHANGED", C_ONE, C_ONE + 10_000, A().slug, "1"], "ผล");
    noInternal(r, allIds, "ผลราคาเปลี่ยน", [h.basketToken]);
    eq([(await depRow(DEP.pc)).held, await bookingsOn(DEP.pc)], [held0, 0], "ที่ถือ/การจอง");
  });
  await st("C-9", "R6 ยืนยันเมื่อร้านขึ้นราคาหลังถือ (quote ใหม่ ≠ sel.quoteId) ⇒ PRICE_CHANGED + heldTotalSatang ฿4,100 + totalSatang ฿4,200 · ไม่มีการจอง · ไม่มี Party ใหม่", async () => {
    needDb();
    const h = await holdOk("2027-03-22", { adults: 1 });
    const nonce = String(asRec(asRec((await checkout(h)).vm)?.form)?.nonce ?? nonceAt());
    const p0 = await partiesOf(tA);
    const r = await withPrice(A().id, A().pt.ADULT, AD, 10_000, () => confirm(h, { nonce, form: { phone: freshPhone() } }));
    eq([r.ok, r.code, r.heldTotalSatang, r.totalSatang], [false, "PRICE_CHANGED", C_ONE, C_ONE + 10_000], "ผล");
    eq([await bookingsOn(DEP.pc), await partiesOf(tA)], [0, p0], "การจอง/Party");
  });
  await st("C-10", "R6 ยอดที่จอแสดง (seen) ในฟอร์มยืนยัน ≠ ยอดตอนถือใน sel ⇒ PRICE_CHANGED (ไม่มีการจอง) · ไม่มี seen ⇒ INVALID(seen) · seen ถูก ⇒ ok", async () => {
    needDb();
    const h = await holdOk("2027-03-22", { adults: 1 });
    eq(h.total, C_ONE, "ยอดตอนถือ");
    const phone = freshPhone();
    const r1 = await confirm(h, { form: { phone, seen: String(C_ONE - 100) } });
    const r2 = await confirm(h, { form: { phone, seen: "" } });
    eq([r1.ok, r1.code, r2.ok, r2.code, r2.fields, await bookingsOn(DEP.pc)], [false, "PRICE_CHANGED", false, "INVALID", ["seen"], 0], "seen ผิด/ไม่มี");
    const r3 = await confirm(h, { form: { phone } });
    ok(r3.ok === true && typeof r3.token === "string", `seen ถูก: ${fmt(r3)}`);
  });
  await st("C-11", "R11 ชื่อผู้จอง: trim + NFC (e+◌́ ⇒ é) เก็บเป็น Party.name · ว่าง · 101 ตัว · C0 (\\u0007) · C1 (\\u0085) · U+200B · U+202E · U+2066 ⇒ INVALID(name) ไม่สะท้อนค่า · ไม่มีการจอง", async () => {
    needDb();
    const h = await holdOk("2027-03-25", { adults: 1 });
    const mk = `nm${STAMP}`;
    const bad = ["   ", "ก".repeat(101), `a\u0007${mk}`, `a\u0085${mk}`, `a​${mk}`, `a‮${mk}`, `a⁦${mk}`];
    const rs: Rec[] = [];
    for (const name of bad) rs.push(await confirm(h, { form: { name, phone: freshPhone() } }));
    eq(rs.map((r) => [r.code, r.fields]), bad.map(() => ["INVALID", ["name"]]), "ชื่อผิด");
    ok(!rs.some((r) => JSON.stringify(r).includes(mk)), "ผลสะท้อนอินพุต");
    eq(await bookingsOn(DEP.nm), 0, "การจอง");
    const good = await confirm(h, { form: { name: `  Amélie ${mk}  `, phone: freshPhone() } });
    ok(good.ok === true, `ชื่อ NFC: ${fmt(good)}`);
    const b = await bookingOfToken(String(good.token));
    eq((await q<{ name: string }>(`SELECT name FROM "Party" WHERE id = $1`, [b?.bookerPartyId]))[0]?.name, `Amélie ${mk}`, "Party.name (NFC · trim)");
  });
  await st("C-12", "R11 เบอร์: ตัดช่องว่าง/ขีด/วงเล็บ แล้ว 0 + 9–10 หลัก (ไทย) หรือ + 8–15 หลัก ⇒ ส่งบริการเป็น E.164 รูปเดียว (Party.phone = +66…) · 081-xxx กับ +66 81 xxx = ผู้จองคนเดียวกัน · รูปผิด (สั้น · ไม่ขึ้นต้น 0/+ · ยาวเกิน · มีตัวอักษร) ⇒ INVALID(phone)", async () => {
    needDb();
    const h1 = await holdOk("2027-03-25", { adults: 1 });
    const bad = ["0812", "812345678", "+1234567", "+1234567890123456", "08123456789", "08-1234-567a", "abc0812345678"];
    const rs: Rec[] = [];
    for (const phone of bad) rs.push(await confirm(h1, { form: { phone } }));
    eq(rs.map((r) => [r.code, r.fields]), bad.map(() => ["INVALID", ["phone"]]), "เบอร์ผิด");
    const p = freshPhone();
    const local = `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`, intl = `+66 ${p.slice(1, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
    const a = await confirm(h1, { form: { phone: local } });
    const h2 = await holdOk("2027-03-25", { adults: 1 });
    const b = await confirm(h2, { form: { phone: intl } });
    ok(a.ok === true && b.ok === true, `ยืนยัน: ${fmt(a)} · ${fmt(b)}`);
    const ba = await bookingOfToken(String(a.token)), bb = await bookingOfToken(String(b.token));
    const party = (await q<{ phone: string | null }>(`SELECT phone FROM "Party" WHERE id = $1`, [ba?.bookerPartyId]))[0];
    eq([party?.phone, ba?.bookerPartyId === bb?.bookerPartyId], [`+66${p.slice(1)}`, true], "E.164 · ผู้จองคนเดียวกัน");
  });
  await st("C-13", "R11 อีเมล: trim + ตัวเล็ก ≤ 200 รูปพื้นฐาน (Party.email ตัวเล็ก) · ว่าง = ไม่มีอีเมล · 201 ตัว / ไม่มี @ / ไม่มีโดเมนจุด / มีช่องว่างกลาง ⇒ INVALID(email) · ไม่มีการจอง", async () => {
    needDb();
    const h = await holdOk("2027-03-25", { adults: 1 });
    const n0 = await bookingsOn(DEP.nm);
    const bad = [`${"a".repeat(190)}@example.com`, "no-at.example.com", "a@b", "a b@example.com"];
    const rs: Rec[] = [];
    for (const email of bad) rs.push(await confirm(h, { form: { email, phone: freshPhone() } }));
    eq(rs.map((r) => [r.code, r.fields]), bad.map(() => ["INVALID", ["email"]]), "อีเมลผิด");
    eq(await bookingsOn(DEP.nm), n0, "การจอง");
    const mail = `  Pattra.${STAMP}@Example.COM `;
    const good = await confirm(h, { form: { email: mail, phone: freshPhone() } });
    ok(good.ok === true, `อีเมลถูก: ${fmt(good)}`);
    const b = await bookingOfToken(String(good.token));
    eq((await q<{ email: string | null }>(`SELECT email FROM "Party" WHERE id = $1`, [b?.bookerPartyId]))[0]?.email, mail.trim().toLowerCase(), "Party.email");
  });
  await st("C-14", "m7 ร้านปิดรอบหลังลูกค้าถือ (setDepartureStatus CLOSED · ยกเลิกรอบที่มีที่ถือทำไม่ได้ HAS_BOOKINGS) ⇒ ยืนยัน SLOT_CLOSED · ไม่มีการจอง (บริการไม่ตรวจ — PC-9 · แพลตฟอร์มตรวจด้วย getAvailability ก่อนเรียก)", async () => {
    needDb();
    const h = await holdOk("2027-03-17", { adults: 1 });
    const nonce = String(asRec(asRec((await checkout(h)).vm)?.form)?.nonce ?? nonceAt());
    const r0 = asRec(await tfn("setDepartureStatus")({ tenantId: tA, actorUserId: staffA }, { unitId: uA, departureId: DEP.c14, status: "CLOSED" }, { now: at(5_000).now })) ?? {};
    ok(r0.ok === true, `ปิดรอบ: ${fmt(r0)}`);
    const r = await confirm(h, { nonce, form: { phone: freshPhone() } });
    eq([r.ok, r.code, await bookingsOn(DEP.c14)], [false, "SLOT_CLOSED", 0], "ผล");
  });
  await st("C-15", "m7 เลยเวลาปิดรับระหว่างถือ (10:00) กับยืนยัน (10:06 · ปิดรับ 10:05) ⇒ CUTOFF_PASSED · ไม่มีการจอง · ไม่มี Party ใหม่", async () => {
    needDb();
    const h = await holdOk("2027-03-02", { adults: 1 });
    const nonce = String(asRec(asRec((await checkout(h)).vm)?.form)?.nonce ?? nonceAt());
    const p0 = await partiesOf(tA);
    const r = await confirm(h, { nonce, form: { phone: freshPhone() }, when: at(6 * MIN) });
    eq([r.ok, r.code, await bookingsOn(DEP.c15), await partiesOf(tA)], [false, "CUTOFF_PASSED", 0, p0], "ผล");
  });
  groupLine("C");

  // ═══════════════ R. หน้าการจอง (จ่าย · วอเชอร์ · สิ่งที่ต้องทำ) ═══════════════
  console.log("\n── R: หน้าการจอง /book/[shop]/my/[token] ──");
  const RC = ck();
  await st("R-1", "สถานะ PAY: QR พร้อมเพย์ยอดล็อก ฿11,450.00 (svg data URL) ผู้รับ = ชื่อในโปรไฟล์ร้าน · ยอดค้าง 11,450 จ่ายแล้ว 0 · ถือถึง 10:15 · โอนภายใน 10:12 (R8) · QR = tripPaymentIntent ทุกไบต์ (R12) · สินค้า/วัน/เวลา 08:00–16:30 · บรรทัดจาก snapshot · ไม่มีของภายใน/เบอร์/อีเมล/ชื่อผู้จอง/token", async () => {
    needDb(); ok(T1, "C-3 ไม่ผ่าน");
    const r = await reservation(T1, RC);
    ok(r.ok === true, `reservation: ${fmt(r)}`);
    const vm = asRec(r.vm) ?? {};
    const pay = asRec(vm.pay) ?? {};
    eq([vm.state, pay.amountSatang, pay.receiverName, String(pay.qrSvgDataUrl ?? "").startsWith("data:image/svg+xml;base64,"), vm.totalSatang, vm.outstandingSatang, vm.paidSatang, vm.holdUntilLocal, vm.date, vm.timeText, vm.voucher],
      ["PAY", TOTAL_2A1C_CAM, RECEIVER_NAME, true, TOTAL_2A1C_CAM, TOTAL_2A1C_CAM, 0, "10:15", "2027-03-10", `${R.time.start}–${R.time.end}`, null], "จ่าย");
    let sum = 0; for (const l of asArr(vm.lines)) sum += Number(l.amountSatang);
    eq(sum, TOTAL_2A1C_CAM, "ผลรวมบรรทัด");
    eq([vm.payByLocal, asRec(vm.shop)?.name], ["10:12", NAME.a], "โอนภายใน (ถือถึง − 3 นาที · R8) · ชื่อร้าน (R13)");
    // R12: QR ของหน้า = QR ของบริการ ทุกไบต์ (นาฬิกาเดียวกัน)
    const pi = await tcall("tripPaymentIntent", pubCtx(tA, uA, AFTER), { publicToken: T1 });
    ok(pi.ok === true, `tripPaymentIntent: ${fmt(pi)}`);
    eq([pay.qrSvgDataUrl === asRec(pi.value)?.svgDataUrl, pay.amountSatang], [true, asRec(pi.value)?.amountSatang], "QR หน้า = QR บริการ");
    noInternal(vm, allIds, "หน้าการจอง", [T1, BOOKER.phone, BOOKER.email, BOOKER.name]);
  });
  await st("R-2", "สิ่งที่ต้องทำก่อนจ่าย: PAY ยังไม่ครบ · PASSENGERS 0/3 · ตารางยกเลิกจาก snapshot · cancelUntil = [] (จองวันที่ 1 เดินทาง 10 มี.ค. — เลยทุกขั้น)", async () => {
    needDb(); ok(T1, "C-3 ไม่ผ่าน");
    const vm = asRec((await reservation(T1, RC)).vm) ?? {};
    eq(asArr(vm.todo).slice(0, 2), [{ key: "PAY", done: false }, { key: "PASSENGERS", done: false, count: 0, total: 3 }], "สิ่งที่ต้องทำ");
    eq([vm.cancelRows, vm.cancelUntil], [[{ kind: "FROM_DAYS", days: 30, pct: 100 }, { kind: "FROM_DAYS", days: 15, pct: 50 }, { kind: "LATER_NONE" }], []], "ยกเลิก");
  });
  await st("R-3", "ร้านขึ้นราคาหลังจอง (ข้อบังคับ MP §5 ข) ⇒ หน้าการจองยังเป็นยอดเดิม ฿11,450.00 ทุกบรรทัด", async () => {
    needDb(); ok(T1, "C-3 ไม่ผ่าน");
    const before = asRec((await reservation(T1, RC)).vm) ?? {};
    await pool.query(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" + 50000 WHERE "productId" = $1`, [A().id]);
    await pool.query(`UPDATE "TripExtra" SET "priceMinor" = "priceMinor" + 10000 WHERE id = $1`, [A().cam]);
    let after: Rec = {};
    try { after = asRec((await reservation(T1, RC)).vm) ?? {}; }
    finally {
      await pool.query(`UPDATE "TripPrice" SET "amountMinor" = "amountMinor" - 50000 WHERE "productId" = $1`, [A().id]);
      await pool.query(`UPDATE "TripExtra" SET "priceMinor" = "priceMinor" - 10000 WHERE id = $1`, [A().cam]);
    }
    eq([after.totalSatang, after.lines, asRec(after.pay)?.amountSatang], [TOTAL_2A1C_CAM, before.lines, TOTAL_2A1C_CAM], "ยอดหลังร้านแก้ราคา");
  });
  await st("R-4", "เกินเวลาถือ (now + 16 นาที · ตัวกวาดยังไม่วิ่ง) ⇒ state EXPIRED · pay null · ไม่ออก QR", async () => {
    needDb(); ok(T1, "C-3 ไม่ผ่าน");
    const vm = asRec((await reservation(T1, RC, at(16 * MIN))).vm) ?? {};
    eq([vm.state, vm.pay, vm.voucher], ["EXPIRED", null, null], "หมดเวลา");
  });
  await st("R-9", "R8 จ่ายแล้วหมดเวลา: ถือถึง 10:15 ⇒ payByLocal 10:12 · 10:11 (เหลือ 4 นาที) ยังมี QR · 10:12:30 (เหลือ 2.5 นาที < 3) ⇒ state PAY แต่ pay = { unavailable: \"TOO_LATE\" } ไม่มี QR (ตัดสินในตัวโหลด) · 10:16 ⇒ EXPIRED", async () => {
    needDb();
    const h = await holdOk("2027-03-22", { adults: 1 });
    const tok = await confirmNew(h);
    const c = ck();
    const v1 = asRec((await reservation(tok, c, at(11 * MIN))).vm) ?? {};
    const v2 = asRec((await reservation(tok, c, at(12 * MIN + 30_000))).vm) ?? {};
    const v3 = asRec((await reservation(tok, c, at(16 * MIN))).vm) ?? {};
    eq([v1.state, v1.payByLocal, String(asRec(v1.pay)?.qrSvgDataUrl ?? "").startsWith("data:image/svg+xml;base64,")], ["PAY", "10:12", true], "เหลือ 4 นาที");
    eq([v2.state, v2.payByLocal, v2.pay], ["PAY", "10:12", { unavailable: "TOO_LATE" }], "เหลือ 2.5 นาที");
    eq([v3.state, v3.pay], ["EXPIRED", null], "หมดเวลา");
  });
  await st("R-10", "R8 + R13 หน้า EXPIRED บอกทางติดต่อ: state EXPIRED · รหัสการจองบนหน้า (ให้ลูกค้าแจ้งร้าน) · vm.shop = { name, contact { phone, line }, address } จากค่าตั้งร้าน · ไม่มี QR", async () => {
    needContact(); ok(T1, "C-3 ไม่ผ่าน");
    const b = await bookingOfToken(T1);
    const vm = asRec((await reservation(T1, ck(), at(16 * MIN))).vm) ?? {};
    eq([vm.state, vm.code, vm.pay], ["EXPIRED", b?.code, null], "หมดเวลา");
    eq(vm.shop, { name: NAME.a, contact: { phone: SHOP_CONTACT.phone, line: SHOP_CONTACT.line }, address: SHOP_CONTACT.address }, "ช่องทางติดต่อร้าน");
  });
  let T1code = "";
  await st("R-5", "ร้านรับเงินผ่านบริการ T0.7 (STAFF · PROMPTPAY ฿11,450 · นาฬิกา AFTER หลังการจองเกิด · m6) ⇒ รอบ sold +3 held −3 · หน้าการจอง VOUCHER: วอเชอร์ QR (svg) · pay null · ยอดค้าง 0 · todo PAY ครบ · รหัสบนหน้า = รหัสการจอง", async () => {
    needDb(); ok(T1, "C-3 ไม่ผ่าน");
    const b = await bookingOfToken(T1);
    const d0 = await depRow(DEP.main);
    const p = await tcall("recordTripPayment", staffCtx(AFTER), { bookingId: b?.id, amountSatang: TOTAL_2A1C_CAM, tender: "PROMPTPAY", idempotencyKey: `w12pay_${hex(6)}` });
    ok(p.ok === true, `recordTripPayment: ${fmt(p)}`);
    const d1 = await depRow(DEP.main);
    eq([d1.sold - d0.sold, d1.held - d0.held], [3, -3], "ตัวนับรอบหลังรับเงิน (ที่ถือ ⇒ ขายแล้ว · m7)");
    const vm = asRec((await reservation(T1, RC)).vm) ?? {};
    T1code = String(b?.code);
    eq([vm.state, vm.code, vm.pay, vm.outstandingSatang, vm.paidSatang, String(asRec(vm.voucher)?.qrSvgDataUrl ?? "").startsWith("data:image/svg+xml;base64,"), asArr(vm.todo)[0]], ["VOUCHER", T1code, null, 0, TOTAL_2A1C_CAM, true, { key: "PAY", done: true }], "วอเชอร์");
  });
  await st("R-6", "QR วอเชอร์: bookVoucherQrPayload(tenantId, code) มีรหัสการจอง · ไม่มี token/id/ชื่อ/เบอร์ · ตรวจกลับได้เฉพาะร้านเดียวกัน · แก้ 1 ตัวอักษร ⇒ null · ค่าเดิมทุกครั้ง", async () => {
    needDb(); ok(T1code, "R-5 ไม่ผ่าน");
    const mk = sfn("bookVoucherQrPayload"), vf = sfn("verifyBookVoucherQr");
    const p1 = mk(tA, T1code), p2 = mk(tA, T1code);
    ok(typeof p1 === "string" && p1 === p2 && p1.includes(T1code), `payload: ${fmt(p1)}`);
    const s = String(p1);
    const leaks = [T1, tA, uA, BOOKER.phone, BOOKER.name, ...allIds].filter((x) => x && s.includes(x));
    eq(leaks, [], "ของที่ไม่ควรอยู่ใน QR");
    const flip = s.slice(0, -1) + (s.endsWith("A") ? "B" : "A");
    eq([vf(tA, s), vf(tB, s), vf(tA, flip), vf(tA, "junk"), vf(tA, null)], [T1code, null, null, null, null], "ตรวจกลับ");
  });
  await st("R-7", "ร้านไม่มีผู้รับเงินพร้อมเพย์ (ร้าน B) ⇒ state PAY · pay = { unavailable: \"NO_RECEIVER\" } (ไม่ล้ม · ไม่มี QR) · vm.shop ชื่อร้านอย่างเดียว (R13)", async () => {
    needDb();
    const cB = ck();
    const ob = await optsOf(SB, PRD.B?.slug ?? "", "2027-03-10", cB);
    const sumB = await call("quoteBookSelection", { shop: SB, productSlug: PRD.B?.slug, query: { d: "2027-03-10", ...selQuery(ob, { adults: 1 }) }, acceptLanguage: "th", clientKey: cB }, N0);
    const hb = await call("startBookHold", { shop: SB, productSlug: PRD.B?.slug, form: { d: "2027-03-10", ...selQuery(ob, { adults: 1 }), nonce: nonceAt(), seen: String(asRec(sumB.summary)?.totalSatang) }, acceptLanguage: "th", clientKey: cB }, N0);
    ok(hb.ok === true, `hold B: ${fmt(hb)}`);
    const h: Held = { basketToken: String(hb.basketToken), sel: String(hb.sel), expiresAt: String(hb.expiresAt), clientKey: cB, total: Number(asRec(sumB.summary)?.totalSatang) };
    const cr = await confirm(h, { shop: SB });
    ok(cr.ok === true, `confirm B: ${fmt(cr)}`);
    const vm = asRec((await reservation(String(cr.token), cB, N0, SB)).vm) ?? {};
    eq([vm.state, vm.pay], ["PAY", { unavailable: "NO_RECEIVER" }], "ร้าน B");
    const shop = asRec(vm.shop) ?? {};
    eq([shop.name, asRec(shop.contact)?.phone ?? null, asRec(shop.contact)?.line ?? null, shop.address ?? null], [NAME.b, null, null, null], "ร้าน B ไม่ตั้งช่องทางติดต่อ ⇒ ไม่แสดง ไม่ล้ม (R13)");
  });
  await st("R-8", "ภาษาอังกฤษ: lang=en ⇒ locale en · ชื่อสินค้าอังกฤษ · ป้ายบรรทัดอังกฤษ (ไม่มีอักษรไทยในป้ายที่ร้านแปลแล้ว) · ตัวเลขเงินเท่ากับภาษาไทย", async () => {
    needDb(); ok(T1, "C-3 ไม่ผ่าน");
    const th = asRec((await reservation(T1, RC)).vm) ?? {};
    const en = asRec((await reservation(T1, RC, N0, SA, "en")).vm) ?? {};
    eq([en.locale, asRec(asRec(en.product)?.title)?.text, en.totalSatang, asArr(en.lines).map((l) => l.amountSatang)], ["en", "Racha test A", th.totalSatang, asArr(th.lines).map((l) => l.amountSatang)], "อังกฤษ");
    const thaiLabels = asArr(en.lines).filter((l) => asRec(l.label)?.fallback !== true && /[ก-๙]/.test(String(asRec(l.label)?.text ?? "")));
    eq(thaiLabels.length, 0, `ป้ายไทยในหน้าอังกฤษ: ${fmt(thaiLabels.map((l) => asRec(l.label)?.text))}`);
  });
  await st("R-11", `R12 สินค้ามัดจำ ${DEPOSIT_PCT}%: หน้าการจอง PAY แยก "ยอดที่ต้องโอนตอนนี้" pay.amountSatang = งวดแรก ฿1,050 (= tripPaymentIntent · PC-7) ออกจากยอดรวม totalSatang ฿4,100 · ยอดค้างรวม ฿4,100 · QR ทุกไบต์ = บริการ`, async () => {
    needDb();
    const P = PRD.DEP as Prod;
    const c = ck();
    const o = await optsOf(SA, P.slug, "2027-03-10", c);
    const query = { d: "2027-03-10", ...selQuery(o, { adults: 1 }) };
    const sq = await call("quoteBookSelection", { shop: SA, productSlug: P.slug, query, acceptLanguage: "th", clientKey: c }, N0);
    ok(sq.ok === true, `quote มัดจำ: ${fmt(sq)}`);
    const hb = await call("startBookHold", { shop: SA, productSlug: P.slug, form: { ...query, nonce: nonceAt(), seen: String(asRec(sq.summary)?.totalSatang) }, acceptLanguage: "th", clientKey: c }, N0);
    ok(hb.ok === true, `hold มัดจำ: ${fmt(hb)}`);
    const tok = await confirmNew({ basketToken: String(hb.basketToken), sel: String(hb.sel), expiresAt: String(hb.expiresAt), clientKey: c, total: Number(asRec(sq.summary)?.totalSatang) });
    const vm = asRec((await reservation(tok, ck())).vm) ?? {};
    const pi = await tcall("tripPaymentIntent", pubCtx(tA, uA, AFTER), { publicToken: tok });
    const dep = (AD * DEPOSIT_PCT) / 100;
    eq([vm.state, vm.totalSatang, vm.outstandingSatang, asRec(vm.pay)?.amountSatang, asRec(pi.value)?.amountSatang, asRec(vm.pay)?.qrSvgDataUrl === asRec(pi.value)?.svgDataUrl], ["PAY", AD + PA, AD + PA, dep, dep, true], "มัดจำ");
  });
  groupLine("R");

  // ═══════════════ RL. ด่านอัตรา (ปิดเมื่อพัง) ═══════════════
  console.log("\n── RL: ด่านอัตรา ──");
  await st("RL-1", `ถือที่ต่อเครื่อง: เพดาน X8 = ${X8.holdPerHourPerDevice} ครั้ง/ชม. (กระจาย 6 รอบ ไม่เกิน 2 ครั้ง/รอบ — ไม่ชนถังต่อรอบ R7) — ครั้งที่ ${X8.holdPerHourPerDevice + 1} ⇒ RATE_LIMITED LIMIT (retryAfterSec 1..3600) · เครื่องอื่นยังถือได้ · ถังชื่อ trips:hold:<ร้าน>:<กุญแจเครื่อง> ไม่มี IP ดิบ`, async () => {
    needDb();
    const c = ck();
    const dates = ["2027-04-01", "2027-04-02", "2027-04-03", "2027-04-04", "2027-04-05", "2027-04-06"];
    const opt: Record<string, Rec> = {};
    for (const d of dates) opt[d] = await optsOf(SA, A().slug, d, c);
    const res: Rec[] = [];
    for (let i = 0; i <= X8.holdPerHourPerDevice; i++) { const d = dates[Math.floor(i / 2)] ?? "2027-04-06"; res.push(await hold(d, { adults: 1 }, { clientKey: c, opts: opt[d], seen: AD + PA })); }
    eq(res.slice(0, X8.holdPerHourPerDevice).map((r) => r.ok), Array(X8.holdPerHourPerDevice).fill(true), "ภายในเพดาน");
    const last = res[X8.holdPerHourPerDevice] ?? {};
    ok(last.ok === false && last.code === "RATE_LIMITED" && last.reason === "LIMIT" && Number(last.retryAfterSec) >= 1 && Number(last.retryAfterSec) <= 3600, `เกินเพดาน: ${fmt(last)}`);
    eq((await hold("2027-04-06", { adults: 1 }, { opts: opt["2027-04-06"], seen: AD + PA })).ok, true, "เครื่องอื่น");
    const keys = (await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:hold:${tA}:%`])).map((r) => r.key);
    ok(keys.includes(`trips:hold:${tA}:${c}`) && !keys.some((k) => /\d+\.\d+\.\d+\.\d+|unknown/.test(k)), `ถัง: ${fmt(keys.slice(0, 3))}`);
  });
  await st("RL-2", "ปิดเมื่อพัง (R10 ครบทุกฟังก์ชัน): deps.query โยน ⇒ quoteBookSelection · startBookHold · loadBookCheckout · confirmBookHold · openBookReservation = RATE_LIMITED LIMITER_DOWN · ยืนยันตอนด่านล่ม ⇒ ไม่มี TripBooking ไม่มี Party ใหม่ · ถือตอนด่านล่ม ⇒ ไม่มีที่ถือ · clientKey null/ผิดรูป ⇒ RATE_LIMITED NO_CLIENT ทุกฟังก์ชัน (ไม่ถามฐาน)", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-12", c);
    const h = await holdOk("2027-03-22", { adults: 1 });
    const nonce = String(asRec(asRec((await checkout(h)).vm)?.form)?.nonce ?? nonceAt());
    const n0 = (await depRow(DEP.rl)).held, b0 = await bookingsOn(DEP.pc), p0 = await partiesOf(tA);
    let calls = 0;
    const down = (when = N0) => ({ now: when.now, deps: { query: async () => { calls++; throw new Error("db down"); } } });
    const form = { name: BOOKER.name, phone: freshPhone(), accept: "on", nonce, seen: String(h.total) };
    const rs = [
      await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-12" }, acceptLanguage: "th", clientKey: c }, down()),
      await call("startBookHold", { shop: SA, productSlug: A().slug, form: { d: "2027-03-12", ...selQuery(o, { adults: 1 }), nonce: nonceAt(), seen: String(AD + PA) }, acceptLanguage: "th", clientKey: c }, down()),
      await call("loadBookCheckout", { shop: SA, basketToken: h.basketToken, sel: h.sel, lang: "th", acceptLanguage: "th", clientKey: h.clientKey }, down()),
      await call("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, form, clientKey: h.clientKey }, down(at(10_000))),
      await call("openBookReservation", { shop: SA, token: T1 || randomBytes(32).toString("base64url"), lang: "th", acceptLanguage: "th", clientKey: c }, down(AFTER)),
    ];
    eq(rs.map((r) => [r.ok, r.code, r.reason]), rs.map(() => [false, "RATE_LIMITED", "LIMITER_DOWN"]), "ด่านล่ม");
    eq([calls >= 5, (await depRow(DEP.rl)).held - n0, await bookingsOn(DEP.pc) - b0, await partiesOf(tA) - p0], [true, 0, 0, 0], "ไม่มีงานเขียน");
    const nc: Rec[] = [];
    for (const k of [null, "", "pc_short", "10.0.0.1"]) {
      nc.push(await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-12" }, acceptLanguage: "th", clientKey: k }, N0));
      nc.push(await call("startBookHold", { shop: SA, productSlug: A().slug, form: { d: "2027-03-12", nonce: nonceAt(), seen: "1" }, acceptLanguage: "th", clientKey: k }, N0));
      nc.push(await call("loadBookCheckout", { shop: SA, basketToken: h.basketToken, sel: h.sel, lang: "th", acceptLanguage: "th", clientKey: k }, N0));
      nc.push(await call("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, form, clientKey: k }, at(10_000)));
      nc.push(await call("openBookReservation", { shop: SA, token: T1 || "x", lang: "th", clientKey: k }, AFTER));
    }
    ok(nc.every((x) => x.ok === false && x.code === "RATE_LIMITED" && x.reason === "NO_CLIENT"), `ไม่มีกุญแจเครื่อง: ${fmt(nc.find((x) => x.reason !== "NO_CLIENT"))}`);
    eq(await bookingsOn(DEP.pc) - b0, 0, "การจองหลัง NO_CLIENT");
  });
  await st("RL-3", `เดา token: เครื่องเดียวเปิด token สุ่ม ${X8.tokenMissPerHour} ครั้ง ⇒ NOT_FOUND ทุกครั้ง · ครั้งถัดไป (แม้ token จริง) ⇒ RATE_LIMITED · เครื่องอื่นเปิด token จริงได้ · ถังไม่มี token ดิบ`, async () => {
    needDb(); ok(T1, "C-3 ไม่ผ่าน");
    const c = ck();
    const miss: Rec[] = [];
    for (let i = 0; i < X8.tokenMissPerHour; i++) miss.push(await reservation(randomBytes(32).toString("base64url"), c));
    ok(miss.every((x) => x.ok === false && x.code === "NOT_FOUND"), `ภายในเพดาน: ${fmt(miss.find((x) => x.code !== "NOT_FOUND"))}`);
    const blocked = await reservation(T1, c);
    eq([blocked.ok, blocked.code], [false, "RATE_LIMITED"], "เกินเพดาน");
    eq((await reservation(T1, ck())).ok, true, "เครื่องอื่น");
    const keys = (await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:token:${tA}:%`])).map((r) => r.key);
    ok(keys.length >= 1 && !keys.some((k) => k.includes(T1)), `ถัง token: ${fmt(keys.slice(0, 2))}`);
  });
  await st("RL-4", "R7 กั๊กที่: ถังต่อรอบต่อเครื่อง 2 ครั้ง/ชม. — เครื่องเดียวถือรอบเดียว 3 ครั้ง ⇒ ok ok RATE_LIMITED LIMIT (ที่ถือเพิ่มแค่ 2 ครั้ง) · รอบอื่นเครื่องเดิมยังถือได้ · ถัง trips:slot:<ร้าน>:<รอบ>:<เครื่อง> · ถือ 6+5 = 11 คน ⇒ INVALID(pax) · ค่าเริ่มปุ่มจอง = ปิด: คีย์ trips.public.bookingEnabled ชนิด bool ค่าเริ่ม false ทุกแม่แบบ · ร้าน D (ไม่ตั้ง) ⇒ หน้าสินค้า cta ปิด · quote/ถือ UNAVAILABLE BOOKING_OFF", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-19", c);
    const before = await depRow(DEP.slot);
    const rs: Rec[] = [];
    for (let i = 0; i < 3; i++) rs.push(await hold("2027-03-19", { adults: 1 }, { clientKey: c, opts: o, seen: AD + PA }));
    eq([rs.map((r) => r.ok), rs[2]?.code, rs[2]?.reason, (await depRow(DEP.slot)).held - before.held], [[true, true, false], "RATE_LIMITED", "LIMIT", 2], "ถังต่อรอบ");
    eq((await hold("2027-03-21", { adults: 1 }, { clientKey: c, seen: AD + PA })).ok, true, "รอบอื่น เครื่องเดิม");
    const keys = (await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:slot:${tA}:%`])).map((r) => r.key);
    ok(keys.some((k) => k === `trips:slot:${tA}:${DEP.slot}:${c}`), `ถังต่อรอบ: ${fmt(keys.slice(0, 2))}`);
    const big = await hold("2027-03-19", { adults: 6, children: 5 }, { opts: o, seen: 6 * (AD + PA) + 5 * (CH + PC_) });
    eq([big.code, big.fields], ["INVALID", ["pax"]], "เกิน 10 ที่ต่อการถือ");
    // ค่าเริ่ม = ปิด
    const lst = SETI.mod?.listDefs;
    ok(typeof lst === "function", "settings ไม่มี listDefs");
    const def = asArr((lst as AnyFn)("trips")).find((d) => d.key === K_ON);
    ok(def, `ไม่มีคีย์ ${K_ON} ในทะเบียน trips`);
    const dv = Object.values(asRec(def?.defaults) ?? {});
    eq([def?.type, dv.length > 0 && dv.every((v) => v === false)], ["bool", true], "ชนิด/ค่าเริ่ม");
    const P = PRD.D as Prod; const cd = ck();
    const f = PUBI.mod?.openBookProduct; ok(typeof f === "function", "ไม่มี openBookProduct");
    const op = asRec(await (f as AnyFn)({ shop: SD, productSlug: P.slug, query: { d: "2027-03-10", m: "2027-03" }, acceptLanguage: "th", clientKey: cd }, N0)) ?? {};
    const qv = await call("quoteBookSelection", { shop: SD, productSlug: P.slug, query: { d: "2027-03-10", "n.ADULT": "1" }, acceptLanguage: "th", clientKey: cd }, N0);
    const hv = await call("startBookHold", { shop: SD, productSlug: P.slug, form: { d: "2027-03-10", "n.ADULT": "1", nonce: nonceAt(), seen: String(AD + PA) }, acceptLanguage: "th", clientKey: cd }, N0);
    eq([op.ok, asRec(asRec(op.vm)?.cta)?.enabled, qv.code, qv.reason, hv.code, hv.reason, (await depRow(DEP.d)).held], [true, false, "UNAVAILABLE", "BOOKING_OFF", "UNAVAILABLE", "BOOKING_OFF", 0], "ร้าน D");
  });
  groupLine("RL");

  // ═══════════════ X. ข้ามร้าน · พร้อมกัน · ส่งซ้ำ · อินพุตอันตราย · PII ═══════════════
  console.log("\n── X: ข้ามร้าน · ยิงพร้อมกัน · ส่งซ้ำ · อินพุตอันตราย · ข้อมูลบุคคล ──");
  await st("X-1", "X1 ข้ามร้าน/ข้ามการจอง: token การจองร้าน A ผ่าน URL ร้าน B · token ร้าน B ผ่าน URL ร้าน A · token สุ่ม ⇒ NOT_FOUND รูปเดียวกัน (ไม่บอกว่ามีอยู่ที่ร้านอื่น)", async () => {
    needDb(); ok(T1, "C-3 ไม่ผ่าน");
    const tokB = (await q<{ id: string }>(`SELECT id FROM "TripBooking" WHERE "tenantId" = $1 LIMIT 1`, [tB]))[0]?.id;
    ok(tokB, "ร้าน B ยังไม่มีการจอง (R-7)");
    const tokenB = String(tfn("bookingPublicToken")(tokB));
    const out = [await reservation(T1, ck(), N0, SB), await reservation(tokenB, ck(), N0, SA), await reservation(randomBytes(32).toString("base64url"), ck(), N0, SA)];
    eq(out, out.map(() => ({ ok: false, code: "NOT_FOUND" })), "ไม่พบ");
  });
  await st("X-2", "X3 ขายเกินไม่ได้ (MP §5 ก): 50 เครื่องถือพร้อมกันคนละ 1 ที่ บนรอบ 12 ที่ ⇒ สำเร็จ 12 พอดี ที่เหลือ SOLD_OUT · รอบ held = 12 sold = 0 · ไม่มีผลอื่น (BUSY/throw)", async () => {
    needDb();
    const c0 = ck(); const o = await optsOf(SA, A().slug, "2027-03-11", c0);
    const nonces = Array.from({ length: 50 }, () => nonceAt());
    const keys = Array.from({ length: 50 }, () => ck());
    const sel = selQuery(o, { adults: 1 });
    const rs = await Promise.all(keys.map((k, i) => call("startBookHold", { shop: SA, productSlug: A().slug, form: { d: "2027-03-11", ...sel, nonce: nonces[i], seen: String(AD + PA) }, acceptLanguage: "th", clientKey: k }, N0)));
    const okN = rs.filter((r) => r.ok === true).length, sold = rs.filter((r) => r.ok === false && r.code === "SOLD_OUT").length;
    eq([okN, sold], [12, 38], `ผล (อื่น: ${fmt(rs.filter((r) => r.ok !== true && r.code !== "SOLD_OUT").slice(0, 2))})`);
    const d = await depRow(DEP.race);
    eq([d.held, d.sold, d.capacity], [12, 0, 12], "ตัวนับรอบ");
  });
  await st("X-3", "X3/X4 ถือซ้ำ: 10 คำขอพร้อมกัน nonce เดียวกัน เครื่องเดียวกัน ⇒ ผลมีแค่ ok (basketToken เดียวกันทุกตัว · อย่างน้อย 1) หรือ RATE_LIMITED (ถังต่อรอบ 2/ชม. · R7) · ตะกร้า 1 ใบ · ที่ถือเพิ่ม 2 ครั้งเดียว · nonce เดิมแต่จำนวนคนต่างจากเครื่องใหม่ (ไม่ติดถัง · R9) ⇒ STALE_FORM", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-16", c);
    const n = nonceAt();
    const before = await depRow(DEP.snap);
    const form = { d: "2027-03-16", ...selQuery(o, { adults: 2 }), nonce: n, seen: String(2 * AD + 2 * PA) };
    const rs = await Promise.all(Array.from({ length: 10 }, () => call("startBookHold", { shop: SA, productSlug: A().slug, form, acceptLanguage: "th", clientKey: c }, N0)));
    const oks = rs.filter((r) => r.ok === true);
    const other = rs.filter((r) => r.ok !== true && !(r.code === "RATE_LIMITED" && r.reason === "LIMIT"));
    const toks = [...new Set(oks.map((r) => String(r.basketToken)))];
    ok(oks.length >= 1 && toks.length === 1 && other.length === 0, `ผล: ok ${oks.length} · token ${toks.length} · อื่น ${fmt(other.slice(0, 2))}`);
    eq((await depRow(DEP.snap)).held - before.held, 2, "ที่ถือเพิ่ม");
    eq((await q(`SELECT id FROM "SellBasket" WHERE "publicTokenHash" = $1`, [sha256hex(String(toks[0]))])).length, 1, "ตะกร้า");
    const diff = await call("startBookHold", { shop: SA, productSlug: A().slug, form: { ...form, ...selQuery(o, { adults: 3 }), seen: String(3 * AD + 3 * PA) }, acceptLanguage: "th", clientKey: ck() }, N0);
    eq([diff.ok, diff.code], [false, "STALE_FORM"], "nonce เดิมคำขอต่าง (เครื่องใหม่)");
  });
  await st("X-4", "X3 ยืนยันซ้ำพร้อมกัน: 10 คำขอ (nonce ต่างกัน) บนตะกร้าเดียว ⇒ การจอง 1 ใบ · ทุกผล ok หรือ DONE ด้วย token เดียวกัน", async () => {
    needDb();
    const h = await holdOk("2027-03-16", { adults: 1 });
    const ns = Array.from({ length: 10 }, () => nonceAt());
    const rs = await Promise.all(ns.map((n) => call("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, form: { name: BOOKER.name, phone: BOOKER.phone, accept: "on", nonce: n, seen: String(h.total) }, clientKey: h.clientKey }, at(10_000))));
    const toks = [...new Set(rs.map((r) => (r.ok === true || r.code === "DONE" ? String(r.token) : `ERR:${String(r.code)}`)))];
    ok(toks.length === 1 && !toks[0]?.startsWith("ERR"), `ผล ${fmt(toks)}`);
    eq((await q(`SELECT id FROM "TripBooking" WHERE "basketId" IN (SELECT id FROM "SellBasket" WHERE "publicTokenHash" = $1)`, [sha256hex(h.basketToken)])).length, 1, "จำนวนการจอง");
  });
  await st("X-5", "X3 จ่ายซ้ำ: ร้านกดรับเงิน 10 ครั้งพร้อมกันคีย์เดียวกันบนการจองสาธารณะ (นาฬิกา AFTER · m6) ⇒ รอบ sold +2 held −2 ครั้งเดียว · เงินเข้า 1 ชุด · paidSatang = ยอดเดียว · หน้าการจอง VOUCHER ยอดค้าง 0", async () => {
    needDb();
    const h = await holdOk("2027-03-16", { adults: 1, children: 1 });
    const cr = await confirm(h);
    ok(cr.ok === true, `confirm: ${fmt(cr)}`);
    const b = await bookingOfToken(String(cr.token));
    const due = AD + CH + PA + PC_;
    const key = `w12x5_${hex(6)}`;
    const d0 = await depRow(DEP.snap);
    const rs = await Promise.all(Array.from({ length: 10 }, () => tcall("recordTripPayment", staffCtx(AFTER), { bookingId: b?.id, amountSatang: due, tender: "PROMPTPAY", idempotencyKey: key })));
    const d1 = await depRow(DEP.snap);
    eq([d1.sold - d0.sold, d1.held - d0.held], [2, -2], "ตัวนับรอบ (แปลงครั้งเดียว · m7)");
    ok(rs.every((r) => r.ok === true), `รับเงิน: ${fmt(rs.find((r) => r.ok !== true))}`);
    const paid = (await q<{ paid: number; n: number }>(`SELECT b."paidSatang" AS paid, (SELECT count(DISTINCT "idempotencyKey")::int FROM "TripMoneyEvent" m WHERE m."bookingId" = b.id AND m.kind = 'RECEIVED') AS n FROM "TripBooking" b WHERE b.id = $1`, [b?.id]))[0];
    ok(paid?.paid === due && (paid?.n ?? 0) >= 1, `เงิน: ${fmt(paid)}`);
    const vm = asRec((await reservation(String(cr.token), ck())).vm) ?? {};
    eq([vm.state, vm.outstandingSatang, vm.paidSatang], ["VOUCHER", 0, due], "หน้าการจอง");
  });
  await st("X-6", "X6 อินพุตอันตราย: ฟอร์มถือที่/ยืนยัน/token ขยะ (ยาว 10k · อักขระควบคุม · array · object · SQL · %00 · ตัวเลขยักษ์) ⇒ ok:false รหัสในรายการ BOOK_ERROR_CODES ไม่ throw ไม่สะท้อนค่า · ไม่มีที่ถือเพิ่ม", async () => {
    needDb();
    const c = ck();
    const before = await depRow(DEP.rl);
    const marker = `zz${STAMP}zz`;
    const junk: unknown[] = [`${marker}${"x".repeat(10_000)}`, `${marker}\u0000‮`, [marker], { $ne: marker }, `'; DROP TABLE "TripBooking"; --${marker}`, `%00${marker}`, 1e308, -1, null];
    const outs: Rec[] = [];
    for (const j of junk) {
      outs.push(await call("startBookHold", { shop: SA, productSlug: A().slug, form: { d: j, "n.ADULT": j, z: j, nonce: j, seen: j }, acceptLanguage: j, clientKey: c }, N0));
      outs.push(await call("confirmBookHold", { shop: SA, basketToken: j, sel: j, form: { name: j, phone: j, email: j, accept: j, nonce: j, seen: j }, clientKey: c }, N0));
      outs.push(await call("openBookReservation", { shop: j, token: j, lang: j, acceptLanguage: j, clientKey: c }, N0));
    }
    const bad = outs.filter((r) => r.ok !== false || !ERROR_CODES.includes(String(r.code)));
    ok(bad.length === 0, `ผลผิดรูป/throw: ${fmt(bad.slice(0, 2))}`);
    ok(!outs.some((r) => JSON.stringify(r).includes(marker)), "ผลสะท้อนอินพุต");
    eq((await depRow(DEP.rl)).held, before.held, "ที่ถือ");
  });
  await st("X-7", "PII: หลังการจองสาธารณะทุกข้อ — AuditLog/OutboxEvent ของร้าน A/B · OpsEvent ทั้งตาราง (ค้นด้วยค่าเฉพาะ ไม่กรองเวลา) · คีย์ถัง ChatRateBucket · TripLinkStat ไม่มีชื่อ/เบอร์/อีเมลของผู้จอง และไม่มี token การจอง/ตะกร้า", async () => {
    needDb(); ok(T1, "C-3 ไม่ผ่าน");
    const needles = [BOOKER.phone, BOOKER.phone.slice(1), BOOKER.email, BOOKER.name, T1, (H1 as Held | null)?.basketToken ?? "zz-none"];
    const hits: string[] = [];
    for (const [tbl, where, params] of [["AuditLog", `"tenantId" = ANY($1::text[])`, [[tA, tB]]], ["OutboxEvent", `"tenantId" = ANY($1::text[])`, [[tA, tB]]], ["TripLinkStat", `"tenantId" = ANY($1::text[])`, [[tA, tB]]]] as const) {
      const rows = await q<{ t: string }>(`SELECT row_to_json(x)::text AS t FROM "${tbl}" x WHERE ${where}`, [...params]).catch(() => []);
      for (const r of rows) for (const n of needles) if (n && r.t.includes(n)) hits.push(`${tbl}:${n.slice(0, 6)}…`);
    }
    for (const n of needles) {
      const ops = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE message LIKE $1 OR COALESCE(detail, '') LIKE $1`, [`%${n}%`]);
      if ((ops[0]?.n ?? 0) > 0) hits.push(`OpsEvent:${n.slice(0, 6)}…`);
      const rb = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, [`%${n}%`]);
      if ((rb[0]?.n ?? 0) > 0) hits.push(`ChatRateBucket:${n.slice(0, 6)}…`);
    }
    eq([...new Set(hits)], [], "ข้อมูลบุคคล/token หลุด");
  });
  await st("X-8", "ไม่บล็อกเพราะใบอนุญาต (MP §5 จ): ร้านที่ไม่กรอก trips.license.* ขายผ่านหน้าจองได้ครบ (ข้อ C-3 · R-5) · ฟังก์ชันบริการ T0.6/T0.7 ไม่นับข้อผิดพลาดที่ไม่คาดคิดระหว่างข้อสอบ (tripsUnexpectedCount = 0)", () => {
    ok(T1 && T1code, "C-3/R-5 ไม่ผ่าน");
    eq(tfn("tripsUnexpectedCount")(), 0, "tripsUnexpectedCount");
  });
  groupLine("X");

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

console.log(`\nเหลือให้ด่านภาพ + การเปิดจริง (ผู้คุม · scripts/visual-trips.mts w1.2 + parity 01/19): ฟอร์มส่งได้โดยไม่มี JS · ปุ่ม − + ≥ 44 px · แถบล่างยอดรวม 390 · แผงสรุปติดจอ 1440 · หน้า c/ และ my/ ไม่ติดดัชนี + no-referrer · ปุ่มย้อนกลับของเบราว์เซอร์หลังยืนยันไม่สร้างการจองซ้ำ`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${(p0 ?? 0) + (c.res === "PASS" ? 1 : 0)}/${(t0 ?? 0) + 1}`; }
console.log(`\n===== QC TRIPS W1.2a · ทัวร์ 4 ขั้นฝั่งลูกค้า: เลือก → ถือที่ → ยืนยัน → จ่าย/วอเชอร์ =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
