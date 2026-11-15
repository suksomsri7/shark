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
// 🔴 รอบ r1 (มติผู้คุมหลังตรวจรอบ 1 W1–W7 · ผู้เขียนข้อสอบแยก): ทุกจุดที่แก้มีคอมเมนต์ ORACLE-EDIT · ข้อเพิ่มกลุ่ม WR · C-12 คงไว้ = แดงที่รู้จัก (มติ W3)
//    nonce ของข้อสอบผูกโดเมน ถือ/ยืนยัน + ร้าน (ตรงของจริงหลัง 1dd97156b) · ค่าคาดหวังคิดจากฟิกซ์เจอร์/มติ ไม่ลอกจากโค้ด
// 🔴 รอบ r2 (มติผู้คุมหลังตรวจรอบ 2 Y1–Y7 · ผู้เขียนข้อสอบแยกรอบ 2): จุดที่แก้มีคอมเมนต์ ORACLE-EDIT · ข้อเพิ่มกลุ่ม YR · ทุกการถือ (POST) ส่ง `t` ของรอบที่ตั้งใจถือ
//    อ่านจากผลของ quoteBookSelection (summary.slotToken / options.slot.token) หรือ openBookProduct (selected.slots[].token) ของวันนั้น — ข้อสอบไม่ปั้นตัวอ้างรอบเอง (Y2)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, randomBytes } from "node:crypto";
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
// ORACLE-EDIT S-2 (มติ W2 · ผู้ตรวจรอบ 2): releaseBookHold (ปุ่ม "ถือใหม่" ปล่อยที่ถือเดิม) เป็นฟังก์ชันบริการของใบ — อยู่ในรายการ
const BSVC_FNS = ["issueBookFormNonce", "quoteBookSelection", "startBookHold", "loadBookCheckout", "confirmBookHold", "releaseBookHold", "openBookReservation", "bookVoucherQrPayload", "verifyBookVoucherQr"];
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
  // ORACLE-EDIT LG-1 (มติ W4): ตัด summary.noFeesLater (สัญญา "ไม่มีค่าใช้จ่ายเพิ่มภายหลัง" ที่ระบบรับรองไม่ได้)
  ...["title", "total", "passThrough", "holdNote", "vat"].map((k) => `summary.${k}`),
  ...["title", "holdUntil", "name", "phone", "email", "accept", "pay", "privacy", "license", "noAccount", "receiptNote", "termsVersion"].map((k) => `checkout.${k}`),
  "res.code", "res.total", ...["title", "amount", "amountNow", "note", "unavailable", "tooLate", "payBy", "holdUntil"].map((k) => `res.pay.${k}`), ...["title", "qrNote"].map((k) => `res.voucher.${k}`),
  "res.expired", "res.expiredPaid", "res.cancelled", "res.ended", "todo.title", "todo.PAY", "todo.PASSENGERS", "todo.WAIVER", "cancel.until", "steps.label",
  ...["title", "phone", "line", "address"].map((k) => `shop.${k}`), ...["title", "old", "new", "rehold"].map((k) => `priceChanged.${k}`), "page.titleCheckout", "page.titleReservation",
  ...ERROR_CODES.filter((c) => c !== "DONE").map((c) => `err.${c}`),
];
const VISUAL_SCENES = ["book-select", "book-select-en", "book-checkout", "book-pay", "book-voucher", "book-expired"];
const FORBIDDEN_PATHS = ["prisma", "src/proxy.ts", "src/lib/core", "src/i18n", "src/lib/branding", "src/lib/payment", "src/app/api", "src/app/app", "src/app/b", "src/app/(store)", "src/lib/platform", "src/lib/modules",
  "src/messages/th/trips.json", "src/messages/en/trips.json", "src/components/trips", "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/trips-ui-inventory.json", // ORACLE-EDIT S-10 (มติ R17 · W6): seed/fixture ย้ายไป LIMITED
  // ORACLE-EDIT S-10 (มติ R15 · W1.2 §0): t0.1 ได้ ORACLE-EDIT R-1 R-2 (คีย์ X29 X30) ⇒ ย้ายไป LIMITED (เพิ่ม ≤ 3 ลบ 0)
  ...["p0.1", "t0.2", "t0.3", "t0.4", "t0.5", "t0.6", "t0.7", "t0.8", "t1.1", "t1.2", "t1.3", "t1.4", "a1.1", "a1.2"].map((w) => `scripts/qc-trips-${w}.mts`),
  `:(exclude)${BCORE}`, `:(exclude)${BSVC}`, `:(exclude)${PUBMOD}`, `:(exclude)${FACADE}`, ":(exclude)src/lib/platform/trips-public.ts", ":(exclude)src/lib/platform/trips-public-core.ts", ":(exclude)src/lib/modules/trips/public-catalog.ts",
  ":(exclude)src/lib/core/settings/defs/trips.ts"];
const DEFS_TRIPS = "src/lib/core/settings/defs/trips.ts";
/** ไฟล์ของใบก่อนที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด (null = ไม่จำกัด)] · defs/trips = เพิ่ม 2 คีย์ของ R7/R13 เท่านั้น (§3.3) */
const LIMITED: [string, number, number | null][] = [[FACADE, 0, 30], ["src/lib/platform/trips-public-core.ts", 10, null], ["src/lib/platform/trips-public.ts", 40, null], ["src/lib/modules/trips/public-catalog.ts", 30, null], ["scripts/visual-trips.mts", 12, null],
  [DEFS_TRIPS, 0, 24],
  // ORACLE-EDIT S-10 (มติ R17 · W6): seed ตั้ง X29 ของร้าน seed + ผู้รับเงินพร้อมเพย์ทดสอบ · fixture ค่าคงที่ผู้รับเงิน — เพิ่มอย่างเดียว (จำกัดบรรทัด · ลบ 0)
  ["scripts/seed-trips-qc.mts", 0, 12], ["scripts/trips-fixture.mts", 0, 4], ["scripts/qc-trips-t0.1.mts", 0, 3]];
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
  let setupErr = "", onErr = "", contactErr = "", y1Err = "";
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
  const mkDep = async (tag: string, key: string, date: string, o: { capacity?: number; sold?: number; status?: string; hm?: string; cutoffAt?: Date; opt?: string } = {}): Promise<string> => {
    const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const startsAt = BKK(date, o.hm ?? "08:00"); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: o.opt ?? p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8.5 * HOUR),
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
  const OPT2 = { id: "", y3: "" };
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
    // ORACLE-EDIT ฟิกซ์เจอร์รอบ r1 (มติ W1 W2 W5 W7): w1 (W1) · w2 (W2 ถือใหม่) · w5 (เบอร์/ภาษา/TOO_FAST/QR) · w7a/w7b (ลบรอบหลังเปิดหน้า) · w7c/w7d (ปิดรอบหลังเปิดหน้า) — วันของสินค้า A ที่ไม่ชนข้ออื่น
    await mkDep("w1", "A", "2027-03-26", { capacity: 30 }); await mkDep("w2", "A", "2027-03-27", { capacity: 30 }); await mkDep("w5", "A", "2027-03-28", { capacity: 40 });
    await mkDep("w7a", "A", "2027-03-29", { hm: "08:00" }); await mkDep("w7b", "A", "2027-03-29", { hm: "13:00" }); await mkDep("w7c", "A", "2027-03-30", { hm: "08:00" }); await mkDep("w7d", "A", "2027-03-30", { hm: "13:00" });
    // สินค้า TC (ร้านแก้ตารางยกเลิกหลังถือ · W5) · W5 สองตัวเลือกเวลาเดียวกัน (ตัวอ้างรอบ · W5)
    await mkProd("TC", tA, uA); await mkDep("tc", "TC", "2027-03-10");
    await mkProd("W5", tA, uA);
    const opt2 = await insertRow("TripOption", { id: rid("oW5b"), tenantId: tA, unitId: uA, productId: PRD.W5?.id, name: JSON.stringify({ th: "ส่วนตัว", en: "Private" }), durationMin: 510, sortOrder: 2, active: true, updatedAt: new Date() });
    allIds.push(opt2); OPT2.id = opt2;
    await mkDep("w5a", "W5", "2027-03-10", { hm: "08:00" }); await mkDep("w5b", "W5", "2027-03-10", { hm: "08:00", opt: opt2 }); await mkDep("w5c", "W5", "2027-03-11", { hm: "08:00" });
    for (let i = 1; i <= 6; i++) await mkDep(`rl${i}`, "A", `2027-04-0${i}`);
    // ORACLE-EDIT ฟิกซ์เจอร์รอบ r2 (มติ Y1–Y7): วันของสินค้า A ที่ไม่ชนข้ออื่น (20 มี.ค. = วันไม่มีรอบของ Q-5 — ห้ามใช้)
    //   y2 (Y2 ไม่มี t) · y4 (Y4 ราคาเปลี่ยนไม่กินโควตา) · y5 (Y5 ถังต่อรอบเต็ม) · y7 (Y7 ฟอร์มถือเดิมหลังปล่อย) · rel/relx (ปล่อยซ้ำ/พร้อมกัน · ปล่อยหลังหมดเวลา)
    await mkDep("y2", "A", "2027-04-10"); await mkDep("y4", "A", "2027-03-18", { capacity: 30 }); await mkDep("y5", "A", "2027-03-31", { capacity: 30 });
    await mkDep("y7", "A", "2027-04-07"); await mkDep("rel", "A", "2027-04-08", { capacity: 30 }); await mkDep("relx", "A", "2027-04-09");
    //   Y1: สินค้าเวลาถือ WEB 5 / 9 / 10 นาที (ค่าตั้งระดับสินค้า · ตั้งหลังจากนี้) · Y3: สินค้าสองตัวเลือก — 11 มี.ค. 08:00 คนละตัวเลือก · 12 มี.ค. 08:00 ตัวเลือกเดียวกันสองรอบ (+ 13:00 ตัวควบคุม)
    for (const k of ["Y1A", "Y1B", "Y1C"]) { await mkProd(k, tA, uA); await mkDep(k.toLowerCase(), k, "2027-03-10"); }
    await mkProd("Y3", tA, uA);
    const y3opt2 = await insertRow("TripOption", { id: rid("oY3b"), tenantId: tA, unitId: uA, productId: PRD.Y3?.id, name: JSON.stringify({ th: "เรือเร็วส่วนตัว", en: "Private speedboat" }), durationMin: 510, sortOrder: 2, active: true, updatedAt: new Date() });
    allIds.push(y3opt2); OPT2.y3 = y3opt2;
    await mkDep("y3o1", "Y3", "2027-03-11", { hm: "08:00" }); await mkDep("y3o2", "Y3", "2027-03-11", { hm: "08:00", opt: y3opt2 }); await mkDep("y3pm", "Y3", "2027-03-12", { hm: "13:00" });
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
    // ORACLE-EDIT ฟิกซ์เจอร์ (มติ Y1): เวลาถือ WEB ของสินค้า Y1A = 5 · Y1B = 9 · Y1C = 10 นาที (ค่าตั้ง trips.sell.holdMinutes ระดับสินค้า · เส้นเดียวกับที่บริการใช้ถือ)
    try { await setV(tA, ([["Y1A", 5], ["Y1B", 9], ["Y1C", 10]] as const).map(([k, v]) => ({ key: "trips.sell.holdMinutes", scope: "PRODUCT", scopeId: PRD[k]?.id, value: v }))); } catch (e) { y1Err = errMsg(e); }
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
  // ORACLE-EDIT nonceAt (มติ W5 · ผู้คุมปิดรูปไม่ผูก 1dd97156b): nonce ของฟอร์มผูกโดเมน ถือ/ยืนยัน + ร้าน — ตัวช่วยส่ง scope ตรงของจริง (หน้าสินค้า = hold · หน้ายืนยัน = confirm · tenantId ของร้านใน URL)
  type Purpose = "hold" | "confirm";
  const nonceAt = (ms = -60_000, purpose: Purpose = "hold", tenantId: string = tA): string => { const r = sfn("issueBookFormNonce")({ now: new Date(NOW0.getTime() + ms), scope: { tenantId, purpose } }); if (typeof r !== "string" || !r) throw new AssertFail(`issueBookFormNonce ไม่คืนสตริง: ${fmt(r)}`); return r; };
  /** slug ร้านใน URL (ไม่สนตัวพิมพ์) ⇒ tenantId ของร้านทดสอบ · ไม่รู้จัก ⇒ ร้าน A */
  const tenantOf = (shop: string): string => ({ [SA]: tA, [SB]: tB, [SC]: tC, [SD]: tD } as Record<string, string>)[shop.toLowerCase()] ?? tA;
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
  // ORACLE-EDIT ตัวช่วยถือ (มติ Y2 · ปิด W7): ฟอร์มถือ (POST) ต้องมี `t` ของรอบที่ตั้งใจถือ — ข้อสอบอ่านตัวอ้างรอบจากผลของระบบของวันนั้น ไม่ปั้นเอง
  //   (1) สรุปยอดของ quoteBookSelection ของวัน/การเลือกนั้น ⇒ summary.slotToken (= รอบที่ราคาถูกคิด) · (2) ไม่มีสรุป ⇒ quoteBookSelection ของวันนั้น options.slot.token
  //   (3) quote ใช้ไม่ได้ (รอบเต็ม/ปิดรับ) ⇒ openBookProduct ของวันนั้น selected.slots[] (รอบแรกที่เลือกได้ · ไม่งั้นรอบแรกที่มีตัวอ้าง) · ไม่มีรอบเลย ⇒ null (ผู้เรียกตัดสินเอง)
  //   summaryOf/hold เดิมใช้ร้าน A ตายตัวแม้ผู้เรียกส่ง shop/slug อื่น — ORACLE-EDIT: ใช้ร้าน/สินค้าที่ผู้เรียกส่ง
  const summaryOf = async (date: string, pk: Pick, clientKey: string, o?: Rec, shop: string = SA, slug: string = A().slug, t?: string): Promise<Rec> => {
    const opts = o ?? (await optsOf(shop, slug, date, clientKey));
    const r = await call("quoteBookSelection", { shop, productSlug: slug, query: { d: date, ...(t ? { t } : {}), ...selQuery(opts, pk) }, acceptLanguage: "th", clientKey }, N0);
    ok(r.ok === true && asRec(r.summary), `quoteBookSelection ${fmt(pk)}: ${fmt(r)}`);
    return asRec(r.summary) ?? {};
  };
  /** ตัวอ้างรอบจากหน้าสินค้าของวันนั้น (openBookProduct · เครื่องใหม่ ไม่กินถังอ่านของผู้เรียก) — `pick` เลือกแถวเอง */
  const productSlots = async (shop: string, slug: string, date: string): Promise<Rec[]> => {
    const f = PUBI.mod?.openBookProduct;
    if (typeof f !== "function") return [];
    const r = asRec(await (f as AnyFn)({ shop, productSlug: slug, query: { d: date, m: date.slice(0, 7) }, acceptLanguage: "th", clientKey: ck() }, N0)) ?? {};
    const sel = asRec(asRec(r.vm)?.selected);
    return sel && sel.date === date ? asArr(sel.slots) : [];
  };
  const slotTokenOf = async (shop: string, slug: string, date: string): Promise<string | null> => {
    const q0 = await call("quoteBookSelection", { shop, productSlug: slug, query: { d: date }, acceptLanguage: "th", clientKey: ck() }, N0);
    const qt = asRec(asRec(q0.options)?.slot)?.token;
    if (q0.ok === true && typeof qt === "string" && qt) return qt;
    const slots = await productSlots(shop, slug, date);
    const s = slots.find((x) => x.selectable === true && typeof x.token === "string" && x.token) ?? slots.find((x) => typeof x.token === "string" && x.token);
    return s ? String(s.token) : null;
  };
  type Held = { basketToken: string; sel: string; expiresAt: string; clientKey: string; total: number; shopSlug?: string };
  type HoldOpts = { clientKey?: string; nonce?: string; opts?: Rec; seen?: number; when?: { now: Date }; shop?: string; slug?: string; t?: string };
  const hold = async (date: string, pk: Pick, o: HoldOpts = {}): Promise<Rec> => {
    const shop = o.shop ?? SA, slug = o.slug ?? A().slug;
    const clientKey = o.clientKey ?? ck();
    const opts = o.opts ?? (await optsOf(shop, slug, date, clientKey));
    let seen = o.seen, t = o.t;
    if (seen === undefined) {
      const s = await summaryOf(date, pk, clientKey, opts, shop, slug, t);
      seen = Number(s.totalSatang);
      if (t === undefined && typeof s.slotToken === "string" && s.slotToken) t = s.slotToken;
    }
    if (t === undefined) t = (await slotTokenOf(shop, slug, date)) ?? undefined;
    ok(typeof t === "string" && t, `ตัวช่วยถือ: หาตัวอ้างรอบของ ${date} จากผลของระบบไม่ได้ (Y2: ฟอร์มถือต้องมี t)`);
    return call("startBookHold", { shop, productSlug: slug, form: { d: date, t, ...selQuery(opts, pk), nonce: o.nonce ?? nonceAt(-60_000, "hold", tenantOf(shop)), seen: String(seen) }, acceptLanguage: "th", clientKey }, o.when ?? N0);
  };
  const holdOk = async (date: string, pk: Pick, o: HoldOpts = {}): Promise<Held> => {
    const shop = o.shop ?? SA, slug = o.slug ?? A().slug;
    const clientKey = o.clientKey ?? ck();
    const opts = o.opts ?? (await optsOf(shop, slug, date, clientKey));
    let seen = o.seen, t = o.t;
    if (seen === undefined) {
      const s = await summaryOf(date, pk, clientKey, opts, shop, slug, t);
      seen = Number(s.totalSatang);
      if (t === undefined && typeof s.slotToken === "string" && s.slotToken) t = s.slotToken;
    }
    const r = await hold(date, pk, { ...o, clientKey, opts, seen, ...(t ? { t } : {}) });
    ok(r.ok === true && typeof r.basketToken === "string" && typeof r.sel === "string", `startBookHold: ${fmt(r)}`);
    return { basketToken: String(r.basketToken), sel: String(r.sel), expiresAt: String(r.expiresAt), clientKey, total: seen, shopSlug: String(r.shopSlug) };
  };
  /** ฟอร์มถือแบบยิงตรง (ข้อที่ต้องคุมทุกช่องเอง) — `t` ต้องมาจากผลของระบบ (tOf) */
  const tOf = async (date: string, shop: string = SA, slug: string = A().slug): Promise<string> => {
    const t = await slotTokenOf(shop, slug, date);
    ok(t, `หาตัวอ้างรอบของ ${shop}/${slug} ${date} จากผลของระบบไม่ได้`);
    return String(t);
  };
  const checkout = (h: Held, when = N0, shop = SA) => call("loadBookCheckout", { shop, basketToken: h.basketToken, sel: h.sel, lang: "th", acceptLanguage: "th", clientKey: h.clientKey }, when);
  const BOOKER = { name: `ภัทรา ทดสอบ ${STAMP}`, phone: `08${String(10_000_000 + (parseInt(STAMP.slice(-4), 36) % 89_999_999)).padStart(8, "0")}`, email: `pattra.${STAMP}@example.com` };
  /** ยืนยัน: nonce ของหน้ายืนยัน (ออกตอนเปิดหน้า ณ NOW0) · ส่งหลังจากนั้น 10 วิ (พ้น BOOK_FORM_MIN_SEC) · seen = ยอดที่จอแสดงตอนถือ (R6) — ทุกเวลาเป็นนาฬิกาที่ข้อสอบส่ง */
  const confirm = async (h: Held, o: { form?: Rec; when?: { now: Date }; shop?: string; nonce?: string } = {}) => {
    let nonce = o.nonce;
    if (!nonce) { const c = await checkout(h, N0, o.shop ?? SA); nonce = String(asRec(asRec(c.vm)?.form)?.nonce ?? nonceAt(-60_000, "confirm", tenantOf(o.shop ?? SA))); }
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
  /** ORACLE-EDIT (ผู้ตรวจรอบ 2): ผลรวมที่ถือ ACTIVE จริงของรอบ (ตัวเทียบของตัวนับ held) */
  const activeHeldOf = async (dep: string) => Number((await q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic"), 0)::int AS n FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [dep]))[0]?.n ?? -1);
  /** ถังถือ/ถังต่อรอบของเครื่อง (ทุกรอบ) ของร้าน A — ค่า count รวม (ไม่มีแถว = 0) */
  const holdBuckets = async (clientKey: string, tenantId: string = tA) => {
    const rows = await q<{ key: string; count: number }>(`SELECT key, "count" FROM "ChatRateBucket" WHERE key = $1 OR (key LIKE $2 AND key LIKE $3)`, [`trips:hold:${tenantId}:${clientKey}`, `trips:slot:${tenantId}:%`, `%:${clientKey}`]);
    return { hold: rows.filter((r) => r.key.startsWith("trips:hold:")).reduce((a, r) => a + Number(r.count), 0), slot: rows.filter((r) => r.key.startsWith("trips:slot:")).reduce((a, r) => a + Number(r.count), 0) };
  };
  const basketsOf = async (tenantId: string = tA) => Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SellBasket" WHERE "tenantId" = $1`, [tenantId]))[0]?.n ?? -1);
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
    // ORACLE-EDIT S-4 (มติ W5): พา lang ที่ platform ตรวจแล้วข้าม redirect ได้ (ไม่ขัด R11 — ไม่ใช่ค่าที่ผู้จองกรอก)
    ok(qkeys.every((k) => ["e", "f", "sel", "lang"].includes(k)), `query ใน actions.ts มีได้แค่ e f sel lang (ห้ามค่าที่ผู้จองกรอก): ${qkeys.join(", ")}`);
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
    // ORACLE-EDIT LG-1 (มติ W4 ⚖️) — ตรวจทุกค่าในไฟล์ภาษา (ไม่ใช่แค่คีย์ที่บังคับ)
    ok(!("summary.noFeesLater" in th) && !("summary.noFeesLater" in en), "W4: ตัด summary.noFeesLater แล้ว (ทั้งสองภาษา)");
    const allV = [...Object.entries(th), ...Object.entries(en)].map(([k, v]) => [k, String(v)] as const);
    const vatFixed = allV.filter(([k, v]) => (/(^|\.)vat\b/i.test(k) || /VAT|ภาษีมูลค่าเพิ่ม/.test(v)) && /\d+(\.\d+)?\s*%|ร้อยละ\s*\d/.test(v));
    ok(vatFixed.length === 0, `W4: บรรทัด/ข้อความ VAT ห้ามอัตราตายตัว: ${vatFixed.slice(0, 3).map(([k, v]) => `${k}=${v}`).join(" | ")}`);
    const taxInv = allV.filter(([, v]) => (/ใบกำกับภาษี/.test(v) && !/(เมื่อ|ถ้า|หาก)[^"]{0,20}จดทะเบียน/.test(v)) || (/tax invoice/i.test(v) && !/\b(if|when)\b[^.]{0,40}(VAT-?registered|registered for VAT)/i.test(v)));
    ok(taxInv.length === 0, `W4: ใบกำกับภาษีต้องมีเงื่อนไข "เมื่อร้านจดทะเบียนภาษีมูลค่าเพิ่ม": ${taxInv.slice(0, 2).map(([k, v]) => `${k}=${v}`).join(" | ")}`);
    const rn = [String(th["checkout.receiptNote"] ?? ""), String(en["checkout.receiptNote"] ?? "")];
    ok(/หลัง[^"]{0,10}ได้รับเงิน/.test(rn[0] ?? "") && /after[^.]{0,30}(payment|paid)/i.test(rn[1] ?? ""), `W4: ใบเสร็จ "ร้านจะออกให้หลังได้รับเงิน": ${fmt(rn)}`);
    const banned = allV.filter(([, v]) => /1 นาที|within 1 minute|48\s*(ชม|ชั่วโมง|h)|中文|ยืนยันเอง|ยืนยันอัตโนมัติ|auto-?confirm|confirm(ed|s)? automatically|automatically confirm|ยกเลิกฟรี|free cancell?ation/i.test(v)
      || /ส่ง[^"]{0,40}(ทาง|ผ่าน|ไปที่|ไปยัง)\s*(อีเมล|LINE|ไลน์)|(ทาง|ผ่าน)\s*(อีเมล|LINE|ไลน์)[^"]{0,20}ส่ง/.test(v) || /\b(send|sent|email)\b[^.]{0,40}\b(by|via|to your)\s*(e-?mail|LINE|inbox)\b|\bwe(?:'ll| will) (e-?mail|LINE) you/i.test(v));
    ok(banned.length === 0, `W4: คำสัญญาต้องห้าม (ยืนยันอัตโนมัติ · ยกเลิกฟรี 48 ชม. · ส่งทางอีเมล/LINE): ${banned.slice(0, 3).map(([k, v]) => `${k}=${v}`).join(" | ")}`);
    ok(/ร้านกำหนด/.test(pth) && /กฎหมาย/.test(pth) && /shop sets|set by the shop/i.test(pen) && /\blaw\b/i.test(pen), `W4: ระยะเก็บข้อมูล "ตามระยะที่ร้านกำหนดภายใต้กฎหมาย": ${fmt([pth.slice(-80), pen.slice(-80)])}`);
    const pb = [String(th["res.pay.payBy"] ?? ""), String(en["res.pay.payBy"] ?? "")];
    ok(pb.every((v) => v.includes("{date}") && v.includes("{time}")), `W4: "โอนภายใน" แสดงวันที่ + เวลา ({date} {time}): ${fmt(pb)}`);
  });
  groupLine("LG");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (trips-book-core) ──");
  // ORACLE-EDIT P-1 (มติ W2: เพดานถือต่อรอบต่อเครื่อง 3/ชม. · มติ W5: TOO_FAST = 1 วิ)
  await st("P-1", "ค่าคงที่: BOOK_MAX_SEATS 2..10 (R7) · BOOK_FORM_MIN_SEC = 1 (W5) · BOOK_FORM_MAX_SEC 1800..86400 · BOOK_PAY_MARGIN_SEC 180 (R8) · BOOK_SLOT_HOLD_PER_HOUR 3 (W2) · BOOK_CONFIRM_PER_HOUR 20 (R10) · BOOK_TERMS_VERSION สตริงสั้น (R14) · BOOK_REF_RE = 12 ตัว a-z0-9 · BOOK_BASKET_TOKEN_RE = 43 ตัว base64url · BOOK_PAX_CODE_RE รับ ADULT ไม่รับ adult/<x>", () => {
    const m = Number(coreV("BOOK_MAX_SEATS")), a = Number(coreV("BOOK_FORM_MIN_SEC")), b = Number(coreV("BOOK_FORM_MAX_SEC"));
    ok(Number.isInteger(m) && m >= 2 && m <= 10, `BOOK_MAX_SEATS ${m} (R7: ≤ 10)`);
    eq([coreV("BOOK_PAY_MARGIN_SEC"), coreV("BOOK_SLOT_HOLD_PER_HOUR"), coreV("BOOK_CONFIRM_PER_HOUR")], [PAY_MARGIN_SEC, 3, 20], "เพดาน/ระยะ");
    const tv = coreV("BOOK_TERMS_VERSION");
    ok(typeof tv === "string" && /^[0-9A-Za-z.-]{1,20}$/.test(tv), `BOOK_TERMS_VERSION ${fmt(tv)}`);
    ok(a === 1 && Number.isInteger(b) && b >= 1800 && b <= 86_400, `อายุฟอร์ม ${a}..${b} (W5: ต่ำสุด 1 วิ)`);
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
    // ORACLE-EDIT Q-8 (มติ Y2): ฟอร์มถือส่ง t ของรอบจากหน้าสินค้า (ถ้าหน้ามีตัวอ้าง) — ด่านเปิดปุ่มตัดสินก่อนฟอร์มอยู่แล้ว
    const tSc = await slotTokenOf(SA, P.slug, "2027-03-10");
    const hv = await call("startBookHold", { shop: SA, productSlug: P.slug, form: { d: "2027-03-10", ...(tSc ? { t: tSc } : {}), "n.ADULT": "1", nonce: nonceAt(), seen: String(AD + PA) }, acceptLanguage: "th", clientKey: c }, N0);
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
    // ORACLE-EDIT Q-9 (มติ Y2): t = รอบที่สรุปยอดนี้คิดราคา (summary.slotToken)
    ok(typeof s.slotToken === "string" && s.slotToken, `สรุปยอดไม่มีตัวอ้างรอบ: ${fmt(s.slotToken)}`);
    const hb = await call("startBookHold", { shop: SC, productSlug: P.slug, form: { ...query, t: s.slotToken, nonce: nonceAt(-60_000, "hold", tC), seen: String(total) }, acceptLanguage: "th", clientKey: c }, N0);
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
    // ORACLE-EDIT Q-10 (มติ Y2): t = summary.slotToken ของสรุปยอดเดียวกัน
    const h = await call("startBookHold", { shop: SA, productSlug: A().slug, form: { ...base, t: asRec(q1.summary)?.slotToken, a: "AGENT01", nonce: nonceAt(), seen: String(asRec(q1.summary)?.totalSatang) }, acceptLanguage: "th", clientKey: ck() }, N0);
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
    // ORACLE-EDIT H-3 (มติ Y2): t ของรอบเต็ม/ปิดรับจากผลของระบบของวันนั้น · วันที่รอบถูกยกเลิก (หน้าสินค้าไม่มีรอบ) ⇒ ฟอร์มค้างที่ถือ t ของรอบที่ไม่ใช่ของวันนั้น (ตัวอ้างจริงของ 10 มี.ค.) ⇒ SLOT_CLOSED
    const t14 = (await slotTokenOf(SA, A().slug, "2027-03-14")) ?? (await tOf("2027-03-10"));
    const r1 = await hold("2027-03-13", { adults: 1 }, { clientKey: c, opts, seen: AD + PA });
    const r2 = await hold("2027-03-01", { adults: 1 }, { clientKey: c, opts, seen: AD + PA });
    const r3 = await hold("2027-03-14", { adults: 1 }, { clientKey: c, opts, seen: AD + PA, t: t14 });
    eq([r1.code, r2.code], ["SOLD_OUT", "CUTOFF_PASSED"], "เต็ม/ปิดรับ");
    ok(r3.ok === false && (r3.code === "SLOT_CLOSED" || (r3.code === "INVALID" && isDeepStrictEqual(r3.fields, ["d"]))), `ยกเลิก: ${fmt(r3)}`);
    eq(await baskets(), n0, "ตะกร้าใหม่");
  });
  await st("H-4", "ฟอร์ม: ไม่มี nonce/nonce ปลอม ⇒ INVALID(nonce) · ส่งเร็วกว่า BOOK_FORM_MIN_SEC ⇒ TOO_FAST · nonce เก่ากว่า BOOK_FORM_MAX_SEC ⇒ STALE_FORM · ไม่มี seen ⇒ INVALID(seen) · ไม่มีอะไรถูกถือ", async () => {
    needDb();
    const before = await depRow(DEP.rl);
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-12", c);
    // ORACLE-EDIT H-4 (มติ Y2): ฟอร์มมี t ของรอบจริง — ข้อนี้ตรึงด่าน nonce/seen ไม่ใช่ด่าน t
    const t12 = await tOf("2027-03-12");
    const base = { d: "2027-03-12", t: t12, ...selQuery(o, { adults: 1 }), seen: String(AD + PA) };
    const go = (form: Rec) => call("startBookHold", { shop: SA, productSlug: A().slug, form, acceptLanguage: "th", clientKey: c }, N0);
    const r1 = await go({ ...base }), r2 = await go({ ...base, nonce: "x.y.z" }), r3 = await go({ ...base, nonce: nonceAt(0) });
    const r4 = await go({ ...base, nonce: nonceAt(-(Number(coreV("BOOK_FORM_MAX_SEC")) + 60) * 1000) });
    const r5 = await go({ d: "2027-03-12", t: t12, ...selQuery(o, { adults: 1 }), nonce: nonceAt() });
    eq([r1.code, r1.fields, r2.code, r2.fields, r3.code, r4.code, r5.code, r5.fields], ["INVALID", ["nonce"], "INVALID", ["nonce"], "TOO_FAST", "STALE_FORM", "INVALID", ["seen"]], "ผล");
    eq((await depRow(DEP.rl)).held, before.held, "ที่ถือ");
  });
  await st("H-5", "ไม่พบแบบเดียวกัน: สินค้า Liveaboard · สินค้าร่าง · slug ร้าน B ใต้ร้าน A ที่ไม่มีในร้าน A · ร้านไม่มี ⇒ { ok:false, code:NOT_FOUND } เท่ากันทุกตัว · ไม่มีตะกร้าใหม่", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-10", c);
    const out: Rec[] = [];
    const t10 = await tOf("2027-03-10"); // ORACLE-EDIT H-5 (มติ Y2): ฟอร์มครบรูป (มี t) — ไม่พบต้องตัดสินก่อนฟอร์ม
    for (const [shop, slug] of [[SA, PRD.LB?.slug], [SA, PRD.DRAFT?.slug], [SA, "w12qc-b-only"], ["no-such-shop-w12", A().slug]] as const)
      out.push(await call("startBookHold", { shop, productSlug: slug, form: { d: "2027-03-10", t: t10, ...selQuery(o, { adults: 1 }), nonce: nonceAt(), seen: String(AD + PA) }, acceptLanguage: "th", clientKey: c }, N0));
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
    const n = nonceAt(-60_000, "confirm");
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
    const r = await call("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, form: { name: BOOKER.name, phone: freshPhone(), accept: "on", nonce: nonceAt(15 * MIN, "confirm"), seen: String(h.total) }, clientKey: h.clientKey }, late); // nonce อายุ 60 วิ ณ เวลานั้น
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
      await call("confirmBookHold", { shop: SB, basketToken: h.basketToken, sel: h.sel, form: { name: BOOKER.name, phone: freshPhone(), accept: "on", nonce: nonceAt(-60_000, "confirm"), seen: String(h.total) }, clientKey: h.clientKey }, at(10_000)),
      await call("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: forged, form: { name: BOOKER.name, phone: freshPhone(), accept: "on", nonce: nonceAt(-60_000, "confirm"), seen: String(h.total) }, clientKey: h.clientKey }, at(10_000)),
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
    const nonce = String(asRec(asRec((await checkout(h)).vm)?.form)?.nonce ?? nonceAt(-60_000, "confirm"));
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
    const nonce = String(asRec(asRec((await checkout(h)).vm)?.form)?.nonce ?? nonceAt(-60_000, "confirm"));
    const r0 = asRec(await tfn("setDepartureStatus")({ tenantId: tA, actorUserId: staffA }, { unitId: uA, departureId: DEP.c14, status: "CLOSED" }, { now: at(5_000).now })) ?? {};
    ok(r0.ok === true, `ปิดรอบ: ${fmt(r0)}`);
    const r = await confirm(h, { nonce, form: { phone: freshPhone() } });
    eq([r.ok, r.code, await bookingsOn(DEP.c14)], [false, "SLOT_CLOSED", 0], "ผล");
  });
  await st("C-15", "m7 เลยเวลาปิดรับระหว่างถือ (10:00) กับยืนยัน (10:06 · ปิดรับ 10:05) ⇒ CUTOFF_PASSED · ไม่มีการจอง · ไม่มี Party ใหม่", async () => {
    needDb();
    const h = await holdOk("2027-03-02", { adults: 1 });
    const nonce = String(asRec(asRec((await checkout(h)).vm)?.form)?.nonce ?? nonceAt(-60_000, "confirm"));
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
    // ORACLE-EDIT R-7 (มติ Y2): t = summary.slotToken ของสรุปยอดร้าน B
    const hb = await call("startBookHold", { shop: SB, productSlug: PRD.B?.slug, form: { d: "2027-03-10", t: asRec(sumB.summary)?.slotToken, ...selQuery(ob, { adults: 1 }), nonce: nonceAt(-60_000, "hold", tB), seen: String(asRec(sumB.summary)?.totalSatang) }, acceptLanguage: "th", clientKey: cB }, N0);
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
    // ORACLE-EDIT R-11 (มติ Y2): t = summary.slotToken
    const hb = await call("startBookHold", { shop: SA, productSlug: P.slug, form: { ...query, t: asRec(sq.summary)?.slotToken, nonce: nonceAt(), seen: String(asRec(sq.summary)?.totalSatang) }, acceptLanguage: "th", clientKey: c }, N0);
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
    const nonce = String(asRec(asRec((await checkout(h)).vm)?.form)?.nonce ?? nonceAt(-60_000, "confirm"));
    const n0 = (await depRow(DEP.rl)).held, b0 = await bookingsOn(DEP.pc), p0 = await partiesOf(tA);
    let calls = 0;
    const down = (when = N0) => ({ now: when.now, deps: { query: async () => { calls++; throw new Error("db down"); } } });
    const form = { name: BOOKER.name, phone: freshPhone(), accept: "on", nonce, seen: String(h.total) };
    // ORACLE-EDIT RL-2 (มติ Y2 · ผู้ตรวจรอบ 2): ฟอร์มถือมี t · releaseBookHold อยู่ในด่านเดียวกัน (ด่านล่ม ⇒ LIMITER_DOWN ไม่ปล่อย · ไม่มีกุญแจเครื่อง ⇒ NO_CLIENT)
    const t12 = await tOf("2027-03-12");
    const pcActive0 = await activeHeldOf(DEP.pc);
    const rs = [
      await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-12" }, acceptLanguage: "th", clientKey: c }, down()),
      await call("startBookHold", { shop: SA, productSlug: A().slug, form: { d: "2027-03-12", t: t12, ...selQuery(o, { adults: 1 }), nonce: nonceAt(), seen: String(AD + PA) }, acceptLanguage: "th", clientKey: c }, down()),
      await call("loadBookCheckout", { shop: SA, basketToken: h.basketToken, sel: h.sel, lang: "th", acceptLanguage: "th", clientKey: h.clientKey }, down()),
      await call("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, form, clientKey: h.clientKey }, down(at(10_000))),
      await call("openBookReservation", { shop: SA, token: T1 || randomBytes(32).toString("base64url"), lang: "th", acceptLanguage: "th", clientKey: c }, down(AFTER)),
      await call("releaseBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, lang: "th", clientKey: h.clientKey }, down()),
    ];
    eq(rs.map((r) => [r.ok, r.code, r.reason, r.holdLimited ?? null]), rs.map(() => [false, "RATE_LIMITED", "LIMITER_DOWN", null]), "ด่านล่ม (Y5: ไม่มี holdLimited)");
    eq([calls >= 6, (await depRow(DEP.rl)).held - n0, await bookingsOn(DEP.pc) - b0, await partiesOf(tA) - p0, await activeHeldOf(DEP.pc) - pcActive0], [true, 0, 0, 0, 0], "ไม่มีงานเขียน (ปล่อยตอนด่านล่ม ⇒ ที่ถือยังอยู่)");
    const nc: Rec[] = [];
    for (const k of [null, "", "pc_short", "10.0.0.1"]) {
      nc.push(await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-12" }, acceptLanguage: "th", clientKey: k }, N0));
      nc.push(await call("startBookHold", { shop: SA, productSlug: A().slug, form: { d: "2027-03-12", t: t12, nonce: nonceAt(), seen: "1" }, acceptLanguage: "th", clientKey: k }, N0));
      nc.push(await call("loadBookCheckout", { shop: SA, basketToken: h.basketToken, sel: h.sel, lang: "th", acceptLanguage: "th", clientKey: k }, N0));
      nc.push(await call("confirmBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, form, clientKey: k }, at(10_000)));
      nc.push(await call("openBookReservation", { shop: SA, token: T1 || "x", lang: "th", clientKey: k }, AFTER));
      nc.push(await call("releaseBookHold", { shop: SA, basketToken: h.basketToken, sel: h.sel, lang: "th", clientKey: k }, N0));
    }
    ok(nc.every((x) => x.ok === false && x.code === "RATE_LIMITED" && x.reason === "NO_CLIENT"), `ไม่มีกุญแจเครื่อง: ${fmt(nc.find((x) => x.reason !== "NO_CLIENT"))}`);
    eq([await bookingsOn(DEP.pc) - b0, await activeHeldOf(DEP.pc) - pcActive0], [0, 0], "การจอง/ที่ถือหลัง NO_CLIENT (ไม่ปล่อย)");
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
  // ORACLE-EDIT RL-4 (มติ W2 · แก้ R7): เพดานถือต่อรอบต่อเครื่อง 3/ชม. นับเฉพาะตะกร้าใหม่ — ส่งซ้ำ nonce เดิม (ตะกร้าเดิม) ไม่นับทั้งถังต่อรอบและถังถือ · ข้อความถือถี่เกินมีทางติดต่อร้าน
  await st("RL-4", "R7+W2 กั๊กที่: ถังต่อรอบต่อเครื่อง 3 ครั้ง/ชม. นับเฉพาะตะกร้าใหม่ — ถือครั้งแรก แล้วส่งซ้ำ nonce เดิม 5 ครั้ง (ผลเดิม · ตะกร้าเดิม · ถังถือ/ถังต่อรอบไม่ขยับ · ที่ถือไม่เพิ่ม) · ถือใหม่อีก 3 ครั้ง ⇒ ok ok RATE_LIMITED LIMIT (ที่ถือเพิ่ม 3 ครั้ง) · รอบอื่นเครื่องเดิมยังถือได้ · ถัง trips:slot:<ร้าน>:<รอบ>:<เครื่อง> · ข้อความถือถี่เกิน: ลองใหม่ภายหลัง + ทางติดต่อร้าน (ไม่ใช่ \"รอสักครู่\") · ถือ 6+5 = 11 คน ⇒ INVALID(pax) · ค่าเริ่มปุ่มจอง = ปิด: คีย์ trips.public.bookingEnabled ชนิด bool ค่าเริ่ม false ทุกแม่แบบ · ร้าน D (ไม่ตั้ง) ⇒ หน้าสินค้า cta ปิด · quote/ถือ UNAVAILABLE BOOKING_OFF", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-19", c);
    const before = await depRow(DEP.slot);
    const kHold = `trips:hold:${tA}:${c}`, kSlot = `trips:slot:${tA}:${DEP.slot}:${c}`;
    const counts = async () => { const rows = await q<{ key: string; count: number }>(`SELECT key, "count" FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [[kHold, kSlot]]); return [kHold, kSlot].map((k) => Number(rows.find((r) => r.key === k)?.count ?? 0)); };
    const n1 = nonceAt();
    const r1 = await hold("2027-03-19", { adults: 1 }, { clientKey: c, opts: o, seen: AD + PA, nonce: n1 });
    ok(r1.ok === true, `ถือครั้งแรก: ${fmt(r1)}`);
    const c1 = await counts();
    const again: Rec[] = [];
    for (let i = 0; i < 5; i++) again.push(await hold("2027-03-19", { adults: 1 }, { clientKey: c, opts: o, seen: AD + PA, nonce: n1 }));
    eq([again.map((r) => [r.ok, r.basketToken]), await counts(), (await depRow(DEP.slot)).held - before.held], [again.map(() => [true, r1.basketToken]), c1, 1], "ส่งซ้ำ nonce เดิม 5 ครั้ง: ผลเดิม · ถังไม่ขยับ · ที่ถือไม่เพิ่ม");
    const rs: Rec[] = [];
    for (let i = 0; i < 3; i++) rs.push(await hold("2027-03-19", { adults: 1 }, { clientKey: c, opts: o, seen: AD + PA }));
    // ORACLE-EDIT RL-4 (มติ Y5): ถังต่อรอบเต็มจริง ⇒ ผลมี holdLimited (action พาไป e=HOLD_LIMITED)
    eq([rs.map((r) => r.ok), rs[2]?.code, rs[2]?.reason, rs[2]?.holdLimited, (await depRow(DEP.slot)).held - before.held], [[true, true, false], "RATE_LIMITED", "LIMIT", true, 3], "ถังต่อรอบ (3 ตะกร้าใหม่ แล้วถูกจำกัด)");
    eq((await hold("2027-03-21", { adults: 1 }, { clientKey: c, seen: AD + PA })).ok, true, "รอบอื่น เครื่องเดิม");
    const keys = (await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:slot:${tA}:%`])).map((r) => r.key);
    ok(keys.some((k) => k === kSlot), `ถังต่อรอบ: ${fmt(keys.slice(0, 2))}`);
    // ข้อความของการถือถี่เกิน (มติ W2): ลองใหม่ภายหลัง + ติดต่อร้าน · ไม่ใช่ข้อความทั่วไป "รอสักครู่"
    const th = flat(JSON.parse(read(MSG_TH) || "{}")), en = flat(JSON.parse(read(MSG_EN) || "{}"));
    const hk = Object.keys(th).filter((k) => k.startsWith("select.") && /ติดต่อร้าน/.test(String(th[k])) && /ภายหลัง|ลองใหม่/.test(String(th[k])) && !/รอสักครู่/.test(String(th[k])));
    ok(hk.length >= 1 && hk.every((k) => /contact the shop/i.test(String(en[k] ?? "")) && /later/i.test(String(en[k] ?? ""))), `ไม่มีข้อความถือถี่เกินที่บอก "ลองใหม่ภายหลัง หรือติดต่อร้าน" (select.* ไทย/อังกฤษ): ${fmt(hk)}`);
    const selSrc = stripComments(read(`${COMP}/BookSelect.tsx`)) + stripComments(read(PAGE_PRODUCT));
    ok(hk.some((k) => new RegExp(`RATE_LIMITED[\\s\\S]{0,400}["']${k.replace(/\./g, "\\.")}["']|["']${k.replace(/\./g, "\\.")}["'][\\s\\S]{0,400}RATE_LIMITED`).test(selSrc)), `หน้าสินค้าต้องใช้ข้อความ ${hk.join("/")} เมื่อถือได้ RATE_LIMITED`);
    needContact();
    const qc = await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-19" }, acceptLanguage: "th", clientKey: ck() }, N0);
    const shopTxt = JSON.stringify(qc);
    ok(shopTxt.includes(SHOP_CONTACT.phone) && shopTxt.includes(SHOP_CONTACT.line), `หน้าสินค้ามีช่องทางติดต่อร้านให้ข้อความถือถี่เกิน (ผลของ quoteBookSelection): ${shopTxt.slice(0, 160)}`);
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
    const tD10 = await slotTokenOf(SD, P.slug, "2027-03-10"); // ORACLE-EDIT RL-4 (มติ Y2): t จากหน้าสินค้าของร้าน D ถ้ามี (ด่านเปิดปุ่มตัดสินก่อนฟอร์ม)
    const hv = await call("startBookHold", { shop: SD, productSlug: P.slug, form: { d: "2027-03-10", ...(tD10 ? { t: tD10 } : {}), "n.ADULT": "1", nonce: nonceAt(-60_000, "hold", tD), seen: String(AD + PA) }, acceptLanguage: "th", clientKey: cd }, N0);
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
    const t11 = String(asRec(o.slot)?.token ?? ""); // ORACLE-EDIT X-2 (มติ Y2): t = options.slot.token ของวันนั้น
    ok(t11, `options ไม่มีตัวอ้างรอบ: ${fmt(o.slot)}`);
    const rs = await Promise.all(keys.map((k, i) => call("startBookHold", { shop: SA, productSlug: A().slug, form: { d: "2027-03-11", t: t11, ...sel, nonce: nonces[i], seen: String(AD + PA) }, acceptLanguage: "th", clientKey: k }, N0)));
    const okN = rs.filter((r) => r.ok === true).length, sold = rs.filter((r) => r.ok === false && r.code === "SOLD_OUT").length;
    eq([okN, sold], [12, 38], `ผล (อื่น: ${fmt(rs.filter((r) => r.ok !== true && r.code !== "SOLD_OUT").slice(0, 2))})`);
    const d = await depRow(DEP.race);
    eq([d.held, d.sold, d.capacity], [12, 0, 12], "ตัวนับรอบ");
  });
  await st("X-3", "X3/X4 ถือซ้ำ: 10 คำขอพร้อมกัน nonce เดียวกัน เครื่องเดียวกัน ⇒ ผลมีแค่ ok (basketToken เดียวกันทุกตัว · อย่างน้อย 1) หรือ RATE_LIMITED (ถังต่อรอบ 3/ชม. · R7 แก้โดย W2 — ORACLE-EDIT ข้อความเท่านั้น) · ตะกร้า 1 ใบ · ที่ถือเพิ่ม 2 ครั้งเดียว · nonce เดิมแต่จำนวนคนต่างจากเครื่องใหม่ (ไม่ติดถัง · R9) ⇒ STALE_FORM", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-16", c);
    const n = nonceAt();
    const before = await depRow(DEP.snap);
    const form = { d: "2027-03-16", t: String(asRec(o.slot)?.token ?? ""), ...selQuery(o, { adults: 2 }), nonce: n, seen: String(2 * AD + 2 * PA) }; // ORACLE-EDIT X-3 (มติ Y2): t ของวันนั้น
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
    const ns = Array.from({ length: 10 }, () => nonceAt(-60_000, "confirm"));
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
      outs.push(await call("startBookHold", { shop: SA, productSlug: A().slug, form: { d: j, t: j, "n.ADULT": j, z: j, nonce: j, seen: j }, acceptLanguage: j, clientKey: c }, N0)); // ORACLE-EDIT X-6 (มติ Y2): t เป็นขยะด้วย
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

  // ═══════════════ WR. มติผู้คุมหลังตรวจรอบ 1 (W1 W2 W5 W7) + nonce ผูกโดเมน — ข้อเพิ่มของผู้เขียนข้อสอบแยก (ORACLE-EDIT r1) ═══════════════
  console.log("\n── WR: มติ W1 W2 W5 W7 · nonce ผูกโดเมน (ข้อเพิ่มรอบ r1) ──");
  const REF_T = /^[a-z2-7]{12}$/;
  const USABLE_SEC = PAY_MARGIN_SEC + 120; // มติ W1: เวลาถือที่ใช้ยืนยันได้ต้องเหลือ ≥ ระยะ "อย่าโอน" (180) + 120 วิ
  const holdRaw = (shop: string, slug: string, form: Rec, clientKey: string, when = N0) => call("startBookHold", { shop, productSlug: slug, form, acceptLanguage: "th", clientKey }, when);
  const basketOf = async (bt: string) => (await q<{ id: string; status: string }>(`SELECT id, status FROM "SellBasket" WHERE "publicTokenHash" = $1`, [sha256hex(bt)]))[0] ?? null;
  const activeHeld = async (dep: string) => Number((await q<{ n: number }>(`SELECT COALESCE(sum("qtyPublic"), 0)::int AS n FROM "TripHold" WHERE "departureId" = $1 AND status = 'ACTIVE'`, [dep]))[0]?.n ?? -1);
  const holdDeps = async (bt: string) => (await q<{ d: string }>(`SELECT h."departureId" AS d FROM "TripHold" h JOIN "SellBasket" b ON b.id = h."basketId" WHERE b."publicTokenHash" = $1`, [sha256hex(bt)])).map((r) => r.d);
  const msgs = () => ({ th: flat(JSON.parse(read(MSG_TH) || "{}")), en: flat(JSON.parse(read(MSG_EN) || "{}")) });
  /** คีย์ข้อความที่จอใช้หลังเงื่อนไข `<cond>` (ภายใน 400 ตัวอักษร) */
  // ORACLE-EDIT WR-10 (มติ Y7): ตัวตรวจซอร์สของบรรทัด redirect — ช่องที่ตัวทำลิงก์ใช้ (ร้าน/ตะกร้า/sel/token) ต้องเป็นค่าเดียวกับที่ส่งให้ bookRedirectOk
  const splitTop = (s: string): string[] => {
    const out: string[] = []; let d = 0, cur = ""; let qch: string | null = null;
    for (const ch of s) {
      if (qch) { cur += ch; if (ch === qch) qch = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { qch = ch; cur += ch; continue; }
      if ("([{".includes(ch)) d++;
      if (")]}".includes(ch)) d--;
      if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const callArgs = (s: string, from: number): { name: string; args: string[] } | null => {
    const m = /^([A-Za-z_$][\w$]*)\(/.exec(s.slice(from));
    if (!m || !m[1]) return null;
    let d = 0, i = from + m[1].length; const start = i + 1; let qch: string | null = null;
    for (; i < s.length; i++) {
      const ch = s[i] ?? "";
      if (qch) { if (ch === qch) qch = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { qch = ch; continue; }
      if (ch === "(") d++;
      else if (ch === ")") { d--; if (d === 0) break; }
    }
    return { name: m[1], args: splitTop(s.slice(start, i)) };
  };
  const normArg = (a: string) => a.replace(/\s+/g, "").replace(/\?\?""$/, "").replace(/^String\((.*)\)$/, "$1");
  const HREF_FIELDS: Record<string, string[]> = { bookReservationHref: ["shopSlug", "token"], bookCheckoutHref: ["shopSlug", "basketToken", "sel"], bookSelectHref: ["shopSlug"] };
  const redirectLineIssues = (line: string): string[] => {
    const okAt = line.indexOf("bookRedirectOk(");
    if (okAt < 0) return [`ไม่ผ่าน bookRedirectOk: ${line.trim().slice(0, 100)}`];
    const obj = callArgs(line, okAt)?.args[0] ?? "";
    if (!/^\{[\s\S]*\}$/.test(obj)) return ["bookRedirectOk ไม่ได้รับ object literal"];
    const checked = new Map<string, string>();
    for (const p of splitTop(obj.slice(1, -1))) { const i = p.indexOf(":"); checked.set((i < 0 ? p : p.slice(0, i)).trim(), normArg(i < 0 ? p : p.slice(i + 1))); }
    const issues: string[] = [];
    const rAt = line.search(/\bredirect\(/);
    if (rAt < okAt) issues.push("redirect อยู่ก่อนตัวตรวจ");
    const inner = callArgs(line, rAt)?.args[0] ?? "";
    const hc = callArgs(inner, 0);
    const fields = hc ? HREF_FIELDS[hc.name] : undefined;
    if (!hc || !fields) return [...issues, `redirect ไม่ได้ใช้ตัวทำลิงก์ของ core: ${inner.slice(0, 60)}`];
    fields.forEach((k, i) => { const a = normArg(hc.args[i] ?? ""); const c = checked.get(k); if (c === undefined) issues.push(`${hc.name}: ช่อง ${k} ไม่ถูกตรวจ`); else if (c !== a) issues.push(`${hc.name}: ตรวจ ${k}=${c} แต่ redirect ด้วย ${a}`); });
    return issues;
  };
  const keyAfter = (src: string, cond: RegExp): string | null => { const m = cond.exec(src); if (!m) return null; return /\bt\(\s*["']([\w.]+)["']/.exec(src.slice(m.index, m.index + 400))?.[1] ?? /bookT\([^)]*\)\(\s*["']([\w.]+)["']/.exec(src.slice(m.index, m.index + 400))?.[1] ?? null; };

  await st("WR-1", `มติ W1 (ไม่สร้างการจองที่จ่ายไม่ทัน): ถือ 10:00 หมด 10:15 · เปิดหน้ายืนยัน/ยืนยันตอนเหลือ ${USABLE_SEC - 1} วิ (< ${PAY_MARGIN_SEC} + 120) ⇒ HOLD_EXPIRED + ทางถือใหม่ (rehold) ทั้งสองทาง · ไม่มี TripBooking ไม่มี Party ใหม่ · เหลือ ${USABLE_SEC + 1} วิ ⇒ หน้ายืนยันเปิดได้ ยืนยันได้ และหน้า my/ (นาฬิกาเดียวกัน) เป็น PAY มี QR (ไม่ใช่ TOO_LATE ตั้งแต่ต้น)`, async () => {
    needDb();
    const exp = NOW0.getTime() + HOLD_MIN * MIN;
    const late = { now: new Date(exp - (USABLE_SEC - 1) * 1000) }, fine = { now: new Date(exp - (USABLE_SEC + 1) * 1000) };
    const h = await holdOk("2027-03-26", { adults: 1 });
    eq(h.expiresAt, new Date(exp).toISOString(), "หมดเวลาถือ");
    const p0 = await partiesOf(tA);
    const c = await checkout(h, late);
    const nonce = nonceAt(-60_000, "confirm");
    const r = await confirm(h, { nonce, when: late, form: { phone: freshPhone(), email: "" } });
    eq([c.ok, c.code, typeof asRec(c.rehold)?.productSlug, r.ok, r.code, typeof asRec(r.rehold)?.productSlug], [false, "HOLD_EXPIRED", "string", false, "HOLD_EXPIRED", "string"], `เหลือ ${USABLE_SEC - 1} วิ`);
    eq(String(asRec(asRec(c.rehold)?.query)?.["n.ADULT"] ?? ""), "1", "ทางถือใหม่พาการเลือกเดิม");
    eq([await bookingsOn(DEP.w1 ?? ""), await partiesOf(tA) - p0], [0, 0], "ไม่มีการจอง/Party ใหม่");
    const c2 = await checkout(h, fine);
    ok(c2.ok === true, `เหลือ ${USABLE_SEC + 1} วิ หน้ายืนยันต้องเปิดได้: ${fmt(c2)}`);
    const r2 = await confirm(h, { nonce, when: fine, form: { phone: freshPhone(), email: "" } });
    ok(r2.ok === true && typeof r2.token === "string", `เหลือ ${USABLE_SEC + 1} วิ ยืนยันต้องได้: ${fmt(r2)}`);
    const vm = asRec((await reservation(String(r2.token), ck(), fine)).vm) ?? {};
    eq([vm.state, String(asRec(vm.pay)?.qrSvgDataUrl ?? "").startsWith("data:image/svg+xml;base64,"), asRec(vm.pay)?.unavailable ?? null], ["PAY", true, null], "หน้า my/ ทันทีหลังยืนยัน: มี QR (ไม่ใช่ TOO_LATE)");
  });

  await st("WR-2", "มติ W2 (ถือใหม่ปล่อยที่ถือเดิม): ร้านขึ้นราคาหลังถือ 2 ที่ ⇒ หน้ายืนยัน PRICE_CHANGED · releaseBookHold (token ตะกร้า + sel ของตะกร้านั้น) ⇒ ok + หน้าสินค้าพร้อมการเลือกเดิม · ที่ถือของตะกร้าเดิมไม่ ACTIVE · ถือใหม่แล้ว held ของรอบ = ที่ถือใหม่เท่านั้น · token ตะกร้าของคนอื่น (sel ไม่ตรง) / ผ่าน URL ร้านอื่น ⇒ NOT_FOUND ไม่ปล่อย · ตะกร้าที่ยืนยันแล้ว ⇒ DONE ไม่ปล่อย", async () => {
    needDb();
    const rel = (h: Held, shop = SA) => call("releaseBookHold", { shop, basketToken: h.basketToken, sel: h.sel, lang: "th", clientKey: h.clientKey }, N0);
    const d = DEP.w2 ?? "";
    const h = await holdOk("2027-03-27", { adults: 2 });
    const pc = await withPrice(A().id, A().pt.ADULT, AD, 10_000, () => checkout(h));
    eq([pc.ok, pc.code], [false, "PRICE_CHANGED"], "หน้ายืนยันหลังขึ้นราคา");
    eq([await activeHeld(d), (await depRow(d)).held], [2, 2], "ก่อนถือใหม่");
    const r = await rel(h);
    eq([r.ok, asRec(r.back)?.productSlug, String(asRec(asRec(r.back)?.query)?.["n.ADULT"] ?? "")], [true, A().slug, "2"], `releaseBookHold: ${fmt(r)}`);
    const st0 = (await q<{ status: string }>(`SELECT h.status FROM "TripHold" h JOIN "SellBasket" b ON b.id = h."basketId" WHERE b."publicTokenHash" = $1`, [sha256hex(h.basketToken)])).map((x) => x.status);
    ok(st0.length >= 1 && st0.every((x) => x !== "ACTIVE"), `ที่ถือของตะกร้าเดิมยัง ACTIVE: ${fmt(st0)}`);
    const h2 = await holdOk("2027-03-27", { adults: 2 });
    eq([await activeHeld(d), (await depRow(d)).held], [2, 2], "หลังถือใหม่: held = ที่ถือใหม่เท่านั้น");
    // ปล่อยไม่ได้: token ตะกร้าของคนอื่นกับ sel ที่ไม่ใช่ของตะกร้านั้น · ผ่าน URL ร้าน B
    const h3 = await holdOk("2027-03-27", { adults: 1 });
    const bad = [await rel({ ...h2, sel: h3.sel, clientKey: h3.clientKey }), await rel(h2, SB), await call("releaseBookHold", { shop: SA, basketToken: randomBytes(32).toString("base64url"), sel: h2.sel, lang: "th", clientKey: ck() }, N0)];
    eq(bad.map((x) => [x.ok, x.code]), bad.map(() => [false, "NOT_FOUND"]), "ปล่อยไม่ได้");
    eq([await activeHeld(d), (await depRow(d)).held], [3, 3], "ที่ถือของ h2/h3 ยังอยู่");
    const tok = await confirmNew(h3);
    const done = await rel(h3);
    eq([done.ok, done.code, done.token], [false, "DONE", tok], "ตะกร้าที่ยืนยันแล้ว");
    eq([await activeHeld(d), (await depRow(d)).held], [3, 3], "ยืนยันแล้วปล่อยไม่ได้");
  });

  await st("WR-3", "มติ W5 (PRICE_CHANGED ยอดเท่าเดิม): ร้านแก้ตารางยกเลิกของสินค้าหลังถือ (ยอดไม่เปลี่ยน) ⇒ หน้ายืนยัน/ยืนยัน PRICE_CHANGED heldTotalSatang = totalSatang · ไม่มีการจอง · จอแสดงแบบ \"เงื่อนไขการจองเปลี่ยน\" (ข้อความ priceChanged.* ที่พูดถึงเงื่อนไข) ไม่โชว์ยอดเดิม/ใหม่เมื่อเท่ากัน", async () => {
    needDb();
    const P = PRD.TC as Prod;
    const c = ck();
    const o = await optsOf(SA, P.slug, "2027-03-10", c);
    const r0 = await holdRaw(SA, P.slug, { d: "2027-03-10", t: String(asRec(o.slot)?.token ?? ""), ...selQuery(o, { adults: 1 }), nonce: nonceAt(), seen: String(AD + PA) }, c); // ORACLE-EDIT WR-3 (มติ Y2): t ของวันนั้น
    ok(r0.ok === true, `ถือ: ${fmt(r0)}`);
    const h: Held = { basketToken: String(r0.basketToken), sel: String(r0.sel), expiresAt: String(r0.expiresAt), clientKey: c, total: AD + PA };
    await setV(tA, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: P.id, value: [{ fromDaysBefore: 7, refundPct: 100 }, { fromDaysBefore: 0, refundPct: 0 }] }]);
    const cv = await checkout(h);
    const cr = await confirm(h, { form: { phone: freshPhone(), email: "" } });
    eq([cv.ok, cv.code, cv.heldTotalSatang, cv.totalSatang], [false, "PRICE_CHANGED", AD + PA, AD + PA], "หน้ายืนยัน (ยอดเท่าเดิม · เงื่อนไขเปลี่ยน)");
    // ORACLE-EDIT WR-3 (ผู้ตรวจรอบ 2 · ห้ามค่าสำรอง): ผลยืนยันต้องมี heldTotalSatang และ totalSatang จริง (ตารางสัญญา §3.2) และเท่ากัน — ไม่มีช่อง = แดง
    eq([cr.ok, cr.code, "heldTotalSatang" in cr, "totalSatang" in cr, cr.heldTotalSatang, cr.totalSatang, await bookingsOn(DEP.tc ?? "")], [false, "PRICE_CHANGED", true, true, AD + PA, AD + PA, 0], "ยืนยัน");
    const { th, en } = msgs();
    const termKeys = Object.keys(th).filter((k) => k.startsWith("priceChanged.") && /เงื่อนไข/.test(String(th[k])) && /terms|conditions/i.test(String(en[k] ?? "")));
    ok(termKeys.length >= 1, `ไม่มีข้อความ priceChanged.* แบบ "เงื่อนไขการจองเปลี่ยน" (ไทย/อังกฤษ)`);
    const src = stripComments(read(`${COMP}/BookCheckout.tsx`));
    ok(termKeys.some((k) => src.includes(`"${k}"`) || src.includes(`'${k}'`)), `BookCheckout ไม่ใช้ข้อความเงื่อนไขเปลี่ยน (${termKeys.join(", ")})`);
    ok(/heldTotalSatang\s*!==\s*totalSatang|totalSatang\s*!==\s*heldTotalSatang|heldTotalSatang\s*===\s*totalSatang|totalSatang\s*===\s*heldTotalSatang/.test(src), "BookCheckout ต้องแยกกรณียอดเท่าเดิม (ไม่โชว์ยอดเดิม/ใหม่ที่เท่ากัน)");
  });

  await st("WR-4", "มติ W5 เบอร์: \"+66 0812345679\" (ใส่ 0 หลังรหัสประเทศ) ⇒ ยืนยันได้ · Party.phone = +66812345679 (ตัด 0) · \"+660 81-…\" รูปเดียวกัน", async () => {
    needDb();
    const p = freshPhone(); // 06xxxxxxxx
    const h = await holdOk("2027-03-28", { adults: 1 });
    const r = await confirm(h, { form: { phone: `+66 0${p.slice(1)}`, email: "", name: `W5 เบอร์ ${STAMP}` } });
    ok(r.ok === true, `ยืนยัน: ${fmt(r)}`);
    const b = await bookingOfToken(String(r.token));
    eq((await q<{ phone: string | null }>(`SELECT phone FROM "Party" WHERE id = $1`, [b?.bookerPartyId]))[0]?.phone, `+66${p.slice(1)}`, "Party.phone");
    const P = coreV("bookerPhoneOf");
    if (typeof P === "function") eq([(P as AnyFn)(`+660${p.slice(1, 3)}-${p.slice(3, 6)}-${p.slice(6)}`), (P as AnyFn)(`+66 0${p.slice(1)}`)], [`+66${p.slice(1)}`, `+66${p.slice(1)}`], "ตัวตรวจเบอร์ (pure)");
  });

  await st("WR-5", "มติ W5 ตัวอ้างรอบ `t`: รูป /^[a-z2-7]{12}$/ · ต่างกันต่อรอบ (สองรอบ 08:00 วันเดียวกันคนละตัวเลือก + รอบวันอื่น) · คงที่ข้ามคำขอ · ไม่มี id ภายใน · `t` ของรอบ \"ส่วนตัว\" ถือลงรอบตัวเลือก \"ส่วนตัว\" จริง · ร้านลบอีกรอบแล้ว `t` เดิมยังชี้รอบเดิม (หน้าสินค้า/เลือก/ถือ)", async () => {
    needDb();
    const P = PRD.W5 as Prod;
    const f = PUBI.mod?.openBookProduct; ok(typeof f === "function", "ไม่มี openBookProduct");
    const open = async (d: string) => asRec(await (f as AnyFn)({ shop: SA, productSlug: P.slug, query: { d, m: d.slice(0, 7) }, acceptLanguage: "th", clientKey: ck() }, N0)) ?? {};
    const slotsOf = (r: Rec) => asArr(asRec(asRec(r.vm)?.selected)?.slots);
    const a = await open("2027-03-10"), a2 = await open("2027-03-10"), b = await open("2027-03-11");
    const sl = slotsOf(a);
    const tk = sl.map((x) => String(x.token)), tk11 = String(slotsOf(b)[0]?.token);
    eq([sl.length, tk.every((t) => REF_T.test(t)), new Set(tk).size, REF_T.test(tk11), tk.includes(tk11)], [2, true, 2, true, false], `ตัวอ้างรอบ: ${fmt([...tk, tk11])}`);
    eq(slotsOf(a2).map((x) => x.token), tk, "คงที่ข้ามคำขอ");
    noInternal(a.vm, allIds, "หน้าสินค้า W5");
    const priv = sl.findIndex((x) => /ส่วนตัว|Private/.test(String(asRec(x.optionName)?.text ?? "")));
    ok(priv >= 0, `ไม่พบรอบตัวเลือก "ส่วนตัว": ${fmt(sl.map((x) => asRec(x.optionName)?.text))}`);
    const tPriv = tk[priv] ?? "", other = DEP.w5a; // w5a = ตัวเลือก "ร่วมกลุ่ม" (ไม่ใช่รอบที่ลูกค้าเลือก)
    const o = await call("quoteBookSelection", { shop: SA, productSlug: P.slug, query: { d: "2027-03-10", t: tPriv }, acceptLanguage: "th", clientKey: ck() }, N0);
    eq(asRec(asRec(o.options)?.slot)?.token, tPriv, "เลือกด้วย t ⇒ ตัวเลือกของรอบนั้น");
    const hp = async () => { const c = ck(); const r = await holdRaw(SA, P.slug, { d: "2027-03-10", t: tPriv, "n.ADULT": "1", nonce: nonceAt(), seen: String(AD + PA) }, c); ok(r.ok === true, `ถือด้วย t: ${fmt(r)}`); return holdDeps(String(r.basketToken)); };
    eq(await hp(), [DEP.w5b], "t ของรอบ \"ส่วนตัว\" ⇒ ถือลงรอบตัวเลือก \"ส่วนตัว\" (w5b)");
    await pool.query(`DELETE FROM "TripDeparture" WHERE id = $1`, [other]); // ร้านลบอีกรอบ (ไม่มีที่ถือ) — ตำแหน่งในวันเปลี่ยน
    const after = slotsOf(await open("2027-03-10"));
    eq(after.map((x) => x.token), [tPriv], "หน้าสินค้าหลังลบอีกรอบ: ตัวอ้างเดิม");
    eq(await hp(), [DEP.w5b], "ถือด้วย t เดิมหลังลบอีกรอบ ⇒ ยังรอบเดิม");
  });

  await st("WR-6", "มติ W5 QR เฉพาะร้านเก็บเงิน: การจองที่เอเจนซี่เก็บเงินเอง (collectMode ≠ SHOP · ปลูกด้วย SQL) ⇒ หน้า my/ PAY ไม่มี QR (pay ไม่มี qrSvgDataUrl · เหตุไม่ใช่ NO_RECEIVER/TOO_LATE) · จอมีข้อความของตัวเอง (ไม่ใช่ \"ร้านยังไม่ได้ตั้งบัญชีรับเงิน\")", async () => {
    needDb();
    const h = await holdOk("2027-03-28", { adults: 1 });
    const tok = await confirmNew(h);
    await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT' WHERE "publicTokenHash" = $1`, [sha256hex(tok)]);
    const vm = asRec((await reservation(tok, ck())).vm) ?? {};
    const pay = asRec(vm.pay) ?? {};
    // ORACLE-EDIT WR-6 (มติ Y7): collectMode AGENT ⇒ เหตุ AGENT_COLLECTS (ตรึงค่าเดียว)
    eq([vm.state, "qrSvgDataUrl" in pay, pay.unavailable], ["PAY", false, "AGENT_COLLECTS"], `pay: ${fmt(vm.pay)}`);
    const { th, en } = msgs();
    const k = keyAfter(stripComments(read(`${COMP}/BookReservation.tsx`)), new RegExp(`unavailable\\s*===\\s*["']${String(pay.unavailable)}["']`));
    ok(k && String(th[k] ?? "").trim() && String(en[k] ?? "").trim() && th[k] !== th["res.pay.unavailable"] && th[k] !== th["err.UNAVAILABLE"], `ข้อความของเหตุ ${String(pay.unavailable)}: คีย์ ${k}`);
  });

  await st("WR-7", "มติ W5 NOTHING_DUE / PENDING: การจอง HOLD ที่ร้านยกงวดแล้ว (งวด WAIVED · ปลูกด้วย SQL — ไม่มียอดต้องโอน) ⇒ my/ PAY ไม่มี QR เหตุของตัวเอง (ไม่ใช่ NO_RECEIVER) · การจองสถานะ PENDING (ปลูกด้วย SQL) ⇒ ผลมีเหตุของตัวเอง (ไม่ใช่ BOOKING_OFF/SHOP_CONFIRMS) · ทั้งสองมีข้อความของตัวเอง (ไม่ใช่ \"ร้านยังไม่ได้ตั้งบัญชีรับเงิน\" / \"ยังจองออนไลน์ไม่ได้\")", async () => {
    needDb();
    const { th, en } = msgs();
    const distinct = (k: string | null) => !!k && !!String(th[k] ?? "").trim() && !!String(en[k] ?? "").trim() && ![th["res.pay.unavailable"], th["err.UNAVAILABLE"], th["select.closed"]].includes(th[k]);
    // PENDING
    const h = await holdOk("2027-03-28", { adults: 1 });
    const tok = await confirmNew(h);
    await pool.query(`UPDATE "TripBooking" SET status = 'PENDING' WHERE "publicTokenHash" = $1`, [sha256hex(tok)]);
    const rp = await reservation(tok, ck());
    // ORACLE-EDIT WR-7 (ผู้ตรวจรอบ 2 · มติ W5 Y6): PENDING ตรึงผลเดียว — { ok:false, code:UNAVAILABLE, reason:"PENDING", pending:{ bookingCode = รหัสการจอง, shop = ผู้ขายจากค่าตั้งร้าน (R13) } }
    //   (มติ W5: เหตุของตัวเอง ไม่ใช่ BOOKING_OFF/SHOP_CONFIRMS · มติ Y6: หน้าแสดงรหัสการจอง + ทางติดต่อร้าน) · ไม่มีข้อมูลผู้จอง/id ภายใน/token
    const bp = await bookingOfToken(tok);
    const pend = asRec(rp.pending) ?? {};
    eq([rp.ok, rp.code, rp.reason, pend.bookingCode, pend.shop], [false, "UNAVAILABLE", "PENDING", bp?.code, { name: NAME.a, contact: { phone: SHOP_CONTACT.phone, line: SHOP_CONTACT.line }, address: SHOP_CONTACT.address }], `PENDING: ${fmt(rp)}`);
    ok(Object.keys(rp).every((k) => ["ok", "code", "reason", "pending", "shopSlug", "lang"].includes(k)) && Object.keys(pend).every((k) => ["bookingCode", "shop"].includes(k)), `คีย์ของผล PENDING: ${fmt(Object.keys(rp))} · ${fmt(Object.keys(pend))}`);
    noInternal({ ...rp, pending: { bookingCode: pend.bookingCode } }, allIds, "ผล PENDING", [tok, BOOKER.phone, BOOKER.email, BOOKER.name, bp?.id ?? "zz-none"]);
    const reason = "PENDING";
    // ข้อความ (ไม่นับบรรทัดรหัสการจอง res.code ที่มติ Y6 ให้แสดงคู่กัน)
    const kp = keyAfter((stripComments(read(PAGE_RES)) + stripComments(read(`${COMP}/BookReservation.tsx`))).replace(/\bt\(\s*["']res\.code["']/g, "x("), new RegExp(`["']${reason}["']`));
    ok(distinct(kp), `ข้อความของการจอง PENDING (${reason}): คีย์ ${kp}`);
    // NOTHING_DUE: การจอง HOLD ปกติ แล้วงวดทุกงวดถูกยก (WAIVED) ⇒ บริการไม่มียอดต้องโอน (การจองยอด 0 ได้ VOUCHER ทันที — ปลูกแบบนั้นไม่ได้)
    const h0 = await holdOk("2027-03-28", { adults: 1 });
    const t0 = await confirmNew(h0);
    const waived = await pool.query(`UPDATE "TripPaymentDue" SET status = 'WAIVED' WHERE "bookingId" = (SELECT id FROM "TripBooking" WHERE "publicTokenHash" = $1) AND status <> 'CANCELLED'`, [sha256hex(t0)]);
    ok((waived.rowCount ?? 0) >= 1, "ปลูก NOTHING_DUE ไม่ได้: การจองไม่มีแถวงวด (TripPaymentDue)");
    const vm = asRec((await reservation(t0, ck())).vm) ?? {};
    const pay = asRec(vm.pay) ?? {};
    // ORACLE-EDIT WR-7 (ผู้ตรวจรอบ 2): ไม่มียอดต้องโอน ⇒ เหตุ NOTHING_DUE (ตรึงค่าเดียว)
    eq([vm.state, "qrSvgDataUrl" in pay, pay.unavailable], ["PAY", false, "NOTHING_DUE"], `ไม่มียอดต้องโอน: ${fmt(vm.pay)}`);
    const kn = keyAfter(stripComments(read(`${COMP}/BookReservation.tsx`)), new RegExp(`unavailable\\s*===\\s*["']${String(pay.unavailable)}["']`));
    ok(distinct(kn), `ข้อความของเหตุ ${String(pay.unavailable)}: คีย์ ${kn}`);
  });

  await st("WR-8", "มติ W5 ภาษาข้าม redirect: ฟอร์มถือ/ยืนยันส่ง lang=en ⇒ ผลมี lang \"en\" (ทั้ง ok และไม่ ok) · lang ผิดรูป ⇒ null (ไม่สะท้อน) · actions.ts ส่ง lang ของผล platform เข้าตัวทำลิงก์ (ไม่ใช่จาก FormData)", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-28", c);
    const form = { d: "2027-03-28", t: String(asRec(o.slot)?.token ?? ""), ...selQuery(o, { adults: 1 }), seen: String(AD + PA) }; // ORACLE-EDIT (มติ Y2): t ของวันนั้น
    const ok1 = await holdRaw(SA, A().slug, { ...form, lang: "en", nonce: nonceAt() }, c);
    const bad1 = await holdRaw(SA, A().slug, { ...form, lang: "en", nonce: nonceAt(0) }, c); // TOO_FAST
    const junk = await holdRaw(SA, A().slug, { ...form, lang: "xx<script>", nonce: nonceAt() }, ck());
    eq([ok1.ok, ok1.lang, bad1.code, bad1.lang, junk.ok, junk.lang ?? null], [true, "en", "TOO_FAST", "en", true, null], "ถือ");
    const h: Held = { basketToken: String(ok1.basketToken), sel: String(ok1.sel), expiresAt: String(ok1.expiresAt), clientKey: c, total: AD + PA };
    const cbad = await confirm(h, { form: { lang: "en", accept: "" } });
    const cok = await confirm(h, { form: { lang: "en", phone: freshPhone(), email: "" } });
    eq([cbad.code, cbad.lang, cok.ok, cok.lang], ["ACCEPT_REQUIRED", "en", true, "en"], "ยืนยัน");
    const ac = stripComments(read(ACTIONS));
    const hrefs = [...ac.matchAll(/(bookCheckoutHref|bookReservationHref)\(([^;]*)\)\s*\)/g)].map((m) => m[2] ?? "");
    ok(hrefs.length >= 2 && hrefs.every((x) => /\br\.lang\b/.test(x)), `actions.ts ต้องส่ง r.lang (ของ platform) เข้า href: ${hrefs.slice(0, 2).join(" | ")}`);
  });

  await st("WR-9", "มติ W5 TOO_FAST = 1 วิ: nonce ออก 10:00:00 · ส่งที่ +0.999 วิ ⇒ TOO_FAST (ถือ/ยืนยัน) · +1.000 วิ ⇒ ผ่านด่าน nonce (ถือได้ · ยืนยันไปถึงด่านถัดไป ACCEPT_REQUIRED) · ไม่มีที่ถือจากครั้งที่ TOO_FAST", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-28", c);
    const n = nonceAt(0);
    const form = { d: "2027-03-28", t: String(asRec(o.slot)?.token ?? ""), ...selQuery(o, { adults: 1 }), nonce: n, seen: String(AD + PA) }; // ORACLE-EDIT WR-9 (มติ Y2): t ของวันนั้น
    const before = await activeHeld(DEP.w5 ?? "");
    const f1 = await holdRaw(SA, A().slug, form, c, at(999));
    const mid = await activeHeld(DEP.w5 ?? "");
    const f2 = await holdRaw(SA, A().slug, form, c, at(1000));
    eq([f1.code, mid - before, f2.ok], ["TOO_FAST", 0, true], "ถือ");
    const h: Held = { basketToken: String(f2.basketToken), sel: String(f2.sel), expiresAt: String(f2.expiresAt), clientKey: c, total: AD + PA };
    const cn = nonceAt(5_000, "confirm");
    const g1 = await confirm(h, { nonce: cn, when: at(5_999), form: { accept: "" } });
    const g2 = await confirm(h, { nonce: cn, when: at(6_000), form: { accept: "" } });
    eq([g1.code, g2.code], ["TOO_FAST", "ACCEPT_REQUIRED"], "ยืนยัน");
  });

  await st("WR-10", "มติ W5 redirect ตรวจรูปก่อนใส่ Location: ตัวตรวจ (bookRedirectOk) รับ slug/token ตะกร้า 43 ตัว/sel v1 ≤ 1,024/token การจอง 43 ตัว · ปฏิเสธ slug มี / . ตัวใหญ่ ว่าง · token 42/44 ตัว หรือมี ?/%/ขึ้นบรรทัด · sel ยาว 1,025+ หรือผิดรูป · ทุก redirect( ใน actions.ts และหน้า c/ (Y7) ผ่านตัวตรวจในบรรทัดเดียวกัน และค่าที่ตรวจ = ค่าที่ redirect", () => {
    const f = BCI.mod?.bookRedirectOk;
    ok(typeof f === "function", "ไม่มีตัวตรวจ redirect (bookRedirectOk) ใน trips-book-core (มติ W5)");
    const g = f as AnyFn;
    const T43 = randomBytes(32).toString("base64url"), SEL = `v1.${"A".repeat(40)}.${"B".repeat(22)}`;
    eq([g({ shopSlug: "andaman-dive" }), g({ shopSlug: "s1", basketToken: T43, sel: SEL }), g({ shopSlug: "s1", token: T43 }), g({ shopSlug: "s1", sel: `v1.${"A".repeat(998)}.${"B".repeat(22)}` })], [true, true, true, true], "รูปถูก (sel ยาว 1,024 พอดี)");
    const bad = [{ shopSlug: "a/b" }, { shopSlug: "../x" }, { shopSlug: "" }, { shopSlug: "Shop" }, { shopSlug: 5 }, { shopSlug: "s1", basketToken: T43.slice(1) }, { shopSlug: "s1", basketToken: `${T43}A` }, { shopSlug: "s1", basketToken: `${T43.slice(1)}?` },
      { shopSlug: "s1", sel: `v1.${"A".repeat(999)}.${"B".repeat(22)}` }, { shopSlug: "s1", sel: `v1.A\nB.${"B".repeat(22)}` }, { shopSlug: "s1", sel: "v1.%0d%0a.x" }, { shopSlug: "s1", sel: null }, { shopSlug: "s1", token: `${T43.slice(2)}%0` }, { shopSlug: "s1", token: T43.slice(1) }];
    eq(bad.map((x) => g(x)), bad.map(() => false), "รูปผิด");
    const lines = read(ACTIONS).split("\n").filter((l) => /\bredirect\(/.test(l) && !/^\s*(import|\/\/|\*)/.test(l));
    ok(lines.length >= 3 && lines.every((l) => /bookRedirectOk\(/.test(l)), `redirect ที่ไม่ผ่านตัวตรวจ: ${lines.filter((l) => !/bookRedirectOk\(/.test(l)).slice(0, 2).join(" | ")}`);
    // ORACLE-EDIT WR-10 (มติ Y7 · ผู้ตรวจรอบ 2): ครอบหน้า c/ ด้วย · และ "ค่าที่ถูกตรวจ = ค่าที่ถูก redirect" (ตรวจจากซอร์ส: อาร์กิวเมนต์ของตัวทำลิงก์ตรงกับช่องที่ส่งให้ bookRedirectOk)
    const issues: string[] = [];
    for (const f of [ACTIONS, PAGE_CHECKOUT]) {
      const ls = stripComments(read(f)).split("\n").filter((l) => /\bredirect\(/.test(l) && !/^\s*import\b/.test(l));
      if (f === PAGE_CHECKOUT && ls.length < 1) issues.push(`${basename(dirname(f))}: ไม่พบ redirect( (DONE ⇒ หน้าการจอง)`);
      for (const l of ls) issues.push(...redirectLineIssues(l).map((x) => `${f === ACTIONS ? "actions" : "c/"}: ${x}`));
    }
    ok(issues.length === 0, `redirect ที่ค่าไม่ตรงกับค่าที่ตรวจ: ${issues.slice(0, 3).join(" | ")}`);
    // positive control ของตัวตรวจซอร์ส: บรรทัดที่ตรวจค่าหนึ่งแต่ redirect อีกค่า ต้องถูกจับ · บรรทัดที่ตรงกันต้องผ่าน
    const ctlBad = [
      `if (bookRedirectOk({ shopSlug: r.shopSlug, token: r.token })) redirect(bookReservationHref(slugFromForm, r.token));`,
      `if (bookRedirectOk({ shopSlug: r.shopSlug, token: r.token })) redirect(bookReservationHref(r.shopSlug ?? "", other ?? ""));`,
      `if (bookRedirectOk({ shopSlug: r.shopSlug })) redirect(bookCheckoutHref(r.shopSlug, basketToken, sel));`,
      `if (ok) redirect(bookSelectHref(r.shopSlug, r.back));`,
      `if (bookRedirectOk({ shopSlug: r.shopSlug })) redirect(\`/book/\${shop}\`);`,
    ];
    const ctlGood = [`if (r.code === "DONE" && bookRedirectOk({ shopSlug: r.shopSlug, token: r.token })) redirect(bookReservationHref(r.shopSlug ?? "", r.token ?? "", lang));`,
      `if (bookRedirectOk({ shopSlug: r.shopSlug, basketToken, sel })) redirect(bookCheckoutHref(r.shopSlug ?? "", String(basketToken), String(sel), { e: r.code }, r.lang));`];
    eq([ctlBad.map((l) => redirectLineIssues(l).length > 0), ctlGood.map((l) => redirectLineIssues(l).length)], [ctlBad.map(() => true), ctlGood.map(() => 0)], "positive control ของตัวตรวจ redirect");
  });

  await st("WR-11", "มติ W7: เปิดหน้า (GET) ได้ตัวอ้างรอบ 08:00 · ร้านลบรอบ 08:00 ⇒ ถือ (POST) ด้วย t นั้น SLOT_CLOSED ไม่ถือรอบ 13:00 แทน · t รูปเดิม HHMM (\"0800\") ⇒ SLOT_CLOSED · ร้านปิดรอบ (CLOSED) หลังเปิดหน้า ⇒ SLOT_CLOSED · ไม่มีตะกร้า/ที่ถือใหม่ · เปิดหน้า (GET) ด้วย t ที่ไม่พบ ⇒ ok เลือกรอบแรกที่ขายได้ (13:00)", async () => {
    needDb();
    const f = PUBI.mod?.openBookProduct; ok(typeof f === "function", "ไม่มี openBookProduct");
    const tokensOf = async (d: string) => asArr(asRec(asRec((asRec(await (f as AnyFn)({ shop: SA, productSlug: A().slug, query: { d, m: d.slice(0, 7) }, acceptLanguage: "th", clientKey: ck() }, N0)) ?? {}).vm)?.selected)?.slots).map((x) => [String(x.timeText).slice(0, 5), String(x.token)] as const);
    const day29 = await tokensOf("2027-03-29"), day30 = await tokensOf("2027-03-30");
    const t8 = day29.find(([hm]) => hm === "08:00")?.[1] ?? "", t13 = day29.find(([hm]) => hm === "13:00")?.[1] ?? "", c8 = day30.find(([hm]) => hm === "08:00")?.[1] ?? "";
    ok(REF_T.test(t8) && REF_T.test(t13) && REF_T.test(c8), `ตัวอ้างรอบจากหน้าสินค้า: ${fmt([day29, day30])}`);
    const nb = async () => Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SellBasket" WHERE "tenantId" = $1`, [tA]))[0]?.n ?? -1);
    const b0 = await nb();
    await pool.query(`DELETE FROM "TripDeparture" WHERE id = $1`, [DEP.w7a]); // ร้านลบรอบ 08:00 หลังลูกค้าเปิดหน้า
    const r0 = asRec(await tfn("setDepartureStatus")({ tenantId: tA, actorUserId: staffA }, { unitId: uA, departureId: DEP.w7c, status: "CLOSED" }, { now: at(1_000).now })) ?? {};
    ok(r0.ok === true, `ปิดรอบ: ${fmt(r0)}`);
    const go = (d: string, t: string) => holdRaw(SA, A().slug, { d, t, "n.ADULT": "1", nonce: nonceAt(), seen: String(AD + PA) }, ck());
    const rs = [await go("2027-03-29", t8), await go("2027-03-29", "0800"), await go("2027-03-30", c8)];
    eq(rs.map((r) => [r.ok, r.code]), rs.map(() => [false, "SLOT_CLOSED"]), "ถือด้วยตัวอ้างรอบที่หาย/รูปเดิม/รอบปิด");
    eq([await activeHeld(DEP.w7b ?? ""), await activeHeld(DEP.w7d ?? ""), await nb() - b0], [0, 0, 0], "ไม่ถือรอบอื่นแทน · ไม่มีตะกร้าใหม่");
    const g = await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-29", t: t8 }, acceptLanguage: "th", clientKey: ck() }, N0);
    const g2 = await call("quoteBookSelection", { shop: SA, productSlug: A().slug, query: { d: "2027-03-29", t: "0800" }, acceptLanguage: "th", clientKey: ck() }, N0);
    eq([g.ok, asRec(asRec(g.options)?.slot)?.token, g2.ok, asRec(asRec(g2.options)?.slot)?.token], [true, t13, true, t13], "GET ด้วย t ที่ไม่พบ ⇒ รอบแรกที่ขายได้");
  });

  await st("WR-12", "มติ W5 + ผู้คุม 1dd97156b — nonce ผูกโดเมน ถือ/ยืนยัน + ร้าน: nonce ของฟอร์มถือใช้ยืนยันไม่ได้ · nonce ของฟอร์มยืนยันใช้ถือไม่ได้ · nonce ของร้าน A ใช้ถือที่ร้าน B ไม่ได้ · issueBookFormNonce ไม่มี scope/scope ผิดรูป ⇒ null (Y7) · nonce รูปเก่าไม่ผูก (ข้อสอบปั้นด้วย HMAC สูตรรุ่น 1 + ตัวควบคุมสูตรเดียวกันที่ผูกโดเมน) ⇒ INVALID(nonce) ทั้งถือและยืนยัน · ทุกกรณีไม่มีตะกร้า/ที่ถือ/การจองใหม่", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-28", c);
    const form = { d: "2027-03-28", t: String(asRec(o.slot)?.token ?? ""), ...selQuery(o, { adults: 1 }), seen: String(AD + PA) }; // ORACLE-EDIT (มติ Y2): t ของวันนั้น
    // ORACLE-EDIT WR-12 (มติ Y7): ทางออก nonce ไม่มี scope ถูกลบ ⇒ issueBookFormNonce ไม่มี scope / scope ผิดรูป ⇒ null
    //   nonce รูปเก่า (รุ่น 1 ไม่ผูกร้าน/ฟอร์ม) ข้อสอบปั้นเองด้วย HMAC สูตรรุ่นก่อน (`trips.public.nonce.v1:<สุ่ม>.<วินาที>` · กุญแจ SESSION_SECRET ของ .env.qc-trips) ⇒ ด่านถือ/ยืนยันต้องปฏิเสธ INVALID(nonce)
    const iss = sfn("issueBookFormNonce");
    const at60 = new Date(NOW0.getTime() - 60_000);
    eq([iss({ now: at60 }), iss({ now: at60, scope: { tenantId: "", purpose: "hold" } }), iss({ now: at60, scope: { tenantId: tA, purpose: "other" } }), iss({ now: at60, scope: null }), iss()], [null, null, null, null, null], "ไม่มี scope / scope ผิดรูป ⇒ null");
    const secret = process.env.SESSION_SECRET ?? "";
    const craft = (msg: (rand: string, sec: string) => string): string => { const rand = randomBytes(16).toString("base64url"), sec = String(Math.floor(at60.getTime() / 1000)); return `${rand}.${sec}.${createHmac("sha256", secret).update(msg(rand, sec)).digest("base64url").slice(0, 22)}`; };
    const unbound = craft((r, s) => `trips.public.nonce.v1:${r}.${s}`);
    const held0 = await activeHeld(DEP.w5 ?? ""), heldB0 = await activeHeld(DEP.b ?? "");
    const b0 = await basketsOf(tA);
    const hs = [await holdRaw(SA, A().slug, { ...form, nonce: nonceAt(-60_000, "confirm") }, c), await holdRaw(SA, A().slug, { ...form, nonce: unbound }, c),
      await holdRaw(SB, PRD.B?.slug ?? "", { d: "2027-03-10", t: await tOf("2027-03-10", SB, PRD.B?.slug ?? ""), "n.ADULT": "1", seen: String(AD + PA), nonce: nonceAt(-60_000, "hold", tA) }, ck())];
    eq(hs.map((r) => [r.code, r.fields]), hs.map(() => ["INVALID", ["nonce"]]), "ถือ: nonce ของยืนยัน / ไม่ผูก / ร้านอื่น");
    eq([await activeHeld(DEP.w5 ?? "") - held0, await activeHeld(DEP.b ?? "") - heldB0, await basketsOf(tA) - b0], [0, 0, 0], "ไม่มีที่ถือ/ตะกร้าใหม่");
    // positive control ของตัวปั้น: สูตรเดียวกันแต่ผูกโดเมนถือของร้าน A (รูปที่ระบบออกให้หน้าสินค้า) ⇒ ผ่านด่าน nonce — ยืนยันว่าการปฏิเสธรุ่น 1 ไม่ได้มาจากตัวปั้นผิด
    const ctl = await holdRaw(SA, A().slug, { ...form, nonce: craft((r, s) => `trips.public.nonce.v2:hold:${tA}:${r}.${s}`) }, ck());
    ok(ctl.ok === true || (ctl.code !== "INVALID" && ctl.code !== "TOO_FAST" && ctl.code !== "STALE_FORM"), `ตัวควบคุมของตัวปั้น nonce (ผูกโดเมนถือร้าน A) ต้องผ่านด่าน nonce: ${fmt(ctl)} — ถ้าแดงที่นี่ = ตัวปั้นไม่ตรงสูตร ไม่ใช่หลักฐานว่าโค้ดผิด`);
    const h = await holdOk("2027-03-28", { adults: 1 });
    const cs = [await confirm(h, { nonce: nonceAt(-60_000, "hold"), form: { phone: freshPhone(), email: "" } }), await confirm(h, { nonce: craft((r, s) => `trips.public.nonce.v1:${r}.${s}`), form: { phone: freshPhone(), email: "" } }),
      await confirm(h, { nonce: nonceAt(-60_000, "confirm", tB), form: { phone: freshPhone(), email: "" } })];
    eq(cs.map((r) => [r.code, r.fields]), cs.map(() => ["INVALID", ["nonce"]]), "ยืนยัน: nonce ของถือ / ไม่ผูก / ร้านอื่น");
    eq((await q(`SELECT id FROM "TripBooking" WHERE "basketId" IN (SELECT id FROM "SellBasket" WHERE "publicTokenHash" = $1)`, [sha256hex(h.basketToken)])).length, 0, "ไม่มีการจอง");
    const okc = await confirm(h, { form: { phone: freshPhone(), email: "" } });
    ok(okc.ok === true, `ตัวควบคุม: nonce ของหน้ายืนยันร้านนี้ยืนยันได้: ${fmt(okc)}`);
  });
  groupLine("WR");

  // ═══════════════ YR. มติผู้คุมหลังตรวจรอบ 2 (Y1–Y7) + จุดหลวมที่ผู้ตรวจรอบ 2 ชี้ — ข้อเพิ่มของผู้เขียนข้อสอบแยกรอบ 2 (ORACLE-EDIT r2) ═══════════════
  console.log("\n── YR: มติ Y1–Y7 · releaseBookHold (ข้อเพิ่มรอบ r2) ──");
  const bkkHm = (ms: number) => new Date(ms + 7 * HOUR).toISOString().slice(11, 16); // เวลาร้าน (กรุงเทพ ไม่มีเวลาออมแสง) — คิดเองจากนาฬิกาของข้อสอบ
  type Pick2 = { basketToken: string; sel: string; clientKey: string };
  const rel = (h: Pick2, when = N0, shop = SA) => call("releaseBookHold", { shop, basketToken: h.basketToken, sel: h.sel, lang: "th", clientKey: h.clientKey }, when);

  await st("YR-1", "มติ Y2 (ปิด W7): ฟอร์มถือ (POST) ไม่มี `t` / `t` ว่าง ⇒ INVALID fields [\"t\"] + กลับหน้าสินค้า (back · shopSlug) · ไม่มีที่ถือ · ไม่มีตะกร้า · ถังถือ/ถังต่อรอบของเครื่องไม่ขยับ · ตัวควบคุม: ฟอร์มเดียวกันที่มี t ของรอบ (จาก options.slot.token) ⇒ ถือได้", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-04-10", c);
    const tok = String(asRec(o.slot)?.token ?? "");
    ok(REF_T.test(tok), `options.slot.token ของวันนั้น: ${fmt(o.slot)}`);
    const base = { d: "2027-04-10", ...selQuery(o, { adults: 1 }), seen: String(AD + PA) };
    const b0 = await basketsOf(), h0 = await activeHeldOf(DEP.y2 ?? ""), k0 = await holdBuckets(c);
    const r1 = await holdRaw(SA, A().slug, { ...base, nonce: nonceAt() }, c);
    const r2 = await holdRaw(SA, A().slug, { ...base, t: "", nonce: nonceAt() }, c);
    eq([r1.ok, r1.code, r1.fields, r2.ok, r2.code, r2.fields], [false, "INVALID", ["t"], false, "INVALID", ["t"]], "ไม่มี t / t ว่าง");
    eq([asRec(r1.back)?.productSlug, r1.shopSlug, asRec(r2.back)?.productSlug], [A().slug, SA, A().slug], "กลับหน้าสินค้า (ไม่ถอยไปถือรอบแรกที่ขายได้)");
    eq([await basketsOf() - b0, await activeHeldOf(DEP.y2 ?? "") - h0, await holdBuckets(c)], [0, 0, k0], "ไม่มีตะกร้า/ที่ถือ · ถังถือ/ถังต่อรอบไม่ขยับ");
    const r3 = await holdRaw(SA, A().slug, { ...base, t: tok, nonce: nonceAt() }, c);
    ok(r3.ok === true, `ตัวควบคุม (มี t): ${fmt(r3)}`);
    eq([await activeHeldOf(DEP.y2 ?? "") - h0, await holdDeps(String(r3.basketToken))], [1, [DEP.y2]], "ตัวควบคุม: ถือรอบของ t");
  });

  await st("YR-2", "มติ Y1 (ร้านเวลาถือสั้น): เวลาถือ WEB 5 / 9 นาที ⇒ quoteBookSelection ปิดจองเหตุ HOLD_TOO_SHORT ไม่ออก nonce · startBookHold (ฟอร์มครบ) ⇒ UNAVAILABLE เหตุ HOLD_TOO_SHORT ก่อนถัง (ถังไม่ขยับ) ไม่มีตะกร้า/ที่ถือ · 10 นาทีพอดี ⇒ ถือได้ (หมด 10:10) · หน้ายืนยัน confirmByLocal = หมดถือ − (180+120) วิ = 10:05 (สินค้า 15 นาที ⇒ 10:10) · fillMinutes = นาทีที่กรอกได้จริง (10 ⇒ 5 · 15 ⇒ 10) · หน้าสินค้าใช้ fillMinutes ในข้อความถือที่ · หน้าสินค้าจัดการ HOLD_TOO_SHORT", async () => {
    needDb();
    ok(!y1Err, `ตั้งเวลาถือของสินค้าทดสอบไม่ได้: ${y1Err.slice(0, 160)}`);
    const USABLE_MS = (PAY_MARGIN_SEC + 120) * 1000; // มติ W1/Y1
    for (const [k, min] of [["Y1A", 5], ["Y1B", 9]] as const) {
      const P = PRD[k] as Prod; const dep = DEP[k.toLowerCase()] ?? "";
      const c = ck();
      const qv = await call("quoteBookSelection", { shop: SA, productSlug: P.slug, query: { d: "2027-03-10", "n.ADULT": "1" }, acceptLanguage: "th", clientKey: c }, N0);
      eq([qv.ok, qv.code, qv.reason, qv.nonce ?? null], [false, "UNAVAILABLE", "HOLD_TOO_SHORT", null], `${min} นาที: quote`);
      const t = await slotTokenOf(SA, P.slug, "2027-03-10");
      const k0 = await holdBuckets(c), b0 = await basketsOf();
      const hv = await call("startBookHold", { shop: SA, productSlug: P.slug, form: { d: "2027-03-10", ...(t ? { t } : {}), "n.ADULT": "1", nonce: nonceAt(), seen: String(AD + PA) }, acceptLanguage: "th", clientKey: c }, N0);
      eq([hv.ok, hv.code, hv.reason], [false, "UNAVAILABLE", "HOLD_TOO_SHORT"], `${min} นาที: ถือ (t=${t ? "มี" : "ไม่มีตัวอ้างจากหน้าสินค้า"})`);
      eq([await holdBuckets(c), await basketsOf() - b0, await activeHeldOf(dep), (await q(`SELECT id FROM "TripHold" WHERE "departureId" = $1`, [dep])).length], [k0, 0, 0, 0], `${min} นาที: ถังไม่ขยับ · ไม่มีตะกร้า/ที่ถือ`);
    }
    const P = PRD.Y1C as Prod; const c = ck();
    const o = await optsOf(SA, P.slug, "2027-03-10", c);
    const qv = await call("quoteBookSelection", { shop: SA, productSlug: P.slug, query: { d: "2027-03-10", ...selQuery(o, { adults: 1 }) }, acceptLanguage: "th", clientKey: c }, N0);
    const s10 = asRec(qv.summary) ?? {};
    eq([qv.ok, typeof qv.nonce === "string" && !!qv.nonce, s10.holdMinutes, s10.fillMinutes], [true, true, 10, 10 - USABLE_MS / MIN], "10 นาที: quote เปิด · nonce · fillMinutes");
    const h = await holdOk("2027-03-10", { adults: 1 }, { slug: P.slug, clientKey: c, opts: o });
    const exp10 = NOW0.getTime() + 10 * MIN;
    eq(h.expiresAt, new Date(exp10).toISOString(), "10 นาที: หมดถือ");
    const cv = asRec((await checkout(h)).vm) ?? {};
    eq([cv.holdUntilLocal, cv.confirmByLocal], [bkkHm(exp10), bkkHm(exp10 - USABLE_MS)], "10 นาที: หน้ายืนยัน ถือถึง/กรอกและยืนยันภายใน");
    eq(bkkHm(exp10 - USABLE_MS), "10:05", "ค่าคาด (คิดเอง)");
    const s15 = await summaryOf("2027-03-31", { adults: 1 }, ck());
    eq([s15.holdMinutes, s15.fillMinutes], [HOLD_MIN, HOLD_MIN - USABLE_MS / MIN], "15 นาที: fillMinutes");
    const h15 = await holdOk("2027-03-31", { adults: 1 });
    const exp15 = NOW0.getTime() + HOLD_MIN * MIN;
    eq(asRec((await checkout(h15)).vm)?.confirmByLocal, bkkHm(exp15 - USABLE_MS), "15 นาที: กรอกและยืนยันภายใน 10:10");
    const selSrc = stripComments(read(`${COMP}/BookSelect.tsx`));
    ok(/["']summary\.holdNote["'][^)]{0,120}fillMinutes/.test(selSrc) && !/["']summary\.holdNote["'][^)]{0,120}holdMinutes/.test(selSrc), "ข้อความ \"ระบบจะถือที่ให้ N นาที\" ต้องใช้ fillMinutes (เวลาที่กรอกได้จริง) ไม่ใช่ holdMinutes");
    const ckSrc = stripComments(read(`${COMP}/BookCheckout.tsx`));
    ok(/confirmByLocal/.test(ckSrc), "หน้ายืนยันต้องแสดง confirmByLocal (เวลาที่ยืนยันได้จริง)");
    ok(/HOLD_TOO_SHORT/.test(stripComments(read(PAGE_PRODUCT))), "หน้าสินค้าต้องจัดการ HOLD_TOO_SHORT (แบบปิดจอง)");
  });

  await st("YR-3", "มติ Y3 (ตัวอ้างรอบ): สองรอบ 08:00 วันเดียวกันคนละตัวเลือก ⇒ ตัวอ้างต่างกัน รูป a-z2-7 12 ตัว · ชื่อตัวเลือกของแถวที่แสดง = ตัวเลือกของรอบที่ถือได้จริงด้วยตัวอ้างนั้น · สองรอบ 08:00 ตัวเลือกเดียวกัน (ฐานกัน unique ⇒ พิสูจน์ด้วยการพยายามสร้าง แล้วใช้คู่ตัวเลือกคนละแถวชื่อเดียวกันแทน) ⇒ ตัวอ้างเป็น null ทั้งคู่ เลือกด้วยลิงก์ไม่ได้ · quote (GET ไม่มี t) ไม่คืนตัวอ้างของคู่ที่แยกไม่ได้ (ต้องเป็นตัวที่หน้าแสดง หรือ null) · รอบ 13:00 วันเดียวกันยังมีตัวอ้าง (ตัวควบคุม)", async () => {
    needDb();
    const P = PRD.Y3 as Prod;
    const s11 = await productSlots(SA, P.slug, "2027-03-11");
    const tk = s11.map((x) => String(x.token));
    eq([s11.length, tk.every((t) => REF_T.test(t)), new Set(tk).size], [2, true, 2], `สองตัวเลือก 08:00: ${fmt(s11.map((x) => [x.timeText, asRec(x.optionName)?.text, x.token]))}`);
    const optNameOfDep = async (dep: string) => String(asRec(JSON.parse(String((await q<{ name: string }>(`SELECT o.name::text AS name FROM "TripDeparture" d JOIN "TripOption" o ON o.id = d."optionId" WHERE d.id = $1`, [dep]))[0]?.name ?? "{}")))?.th ?? "");
    const heldDeps: string[] = [];
    for (const row of s11) {
      const r = await holdRaw(SA, P.slug, { d: "2027-03-11", t: String(row.token), "n.ADULT": "1", nonce: nonceAt(), seen: String(AD + PA) }, ck());
      ok(r.ok === true, `ถือด้วย t ของแถว ${fmt(asRec(row.optionName)?.text)}: ${fmt(r)}`);
      const deps = await holdDeps(String(r.basketToken));
      eq(deps.length, 1, "ที่ถือ 1 รอบ");
      heldDeps.push(deps[0] ?? "");
      eq(String(asRec(row.optionName)?.text ?? ""), await optNameOfDep(deps[0] ?? ""), "ชื่อตัวเลือกของแถว = ตัวเลือกของรอบที่ถือได้");
    }
    eq([...heldDeps].sort(), [DEP.y3o1, DEP.y3o2].sort(), "สองแถวถือคนละรอบ ครบทั้งสอง");
    // ตัวเลือกเดียวกัน เวลาเดียวกัน
    const d1 = rid("d"), d2 = rid("d");
    const dupRow = (id: string) => insertRow("TripDeparture", { id, tenantId: tA, unitId: uA, productId: P.id, optionId: P.opt, scheduleId: null, localDate: "2027-03-12", startsAt: BKK("2027-03-12", "08:00"), endsAt: BKK("2027-03-12", "16:30"), status: "OPEN", capacity: 24, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: BKK("2027-03-12", "08:00"), version: 0, updatedAt: new Date() });
    await dupRow(d1); allIds.push(d1);
    let dupErr = "";
    try { await dupRow(d2); allIds.push(d2); } catch (e) { dupErr = errMsg(e); }
    const s12 = await productSlots(SA, P.slug, "2027-03-12");
    const pm = s12.find((x) => String(x.timeText).startsWith("13:00"));
    ok(pm && REF_T.test(String(pm.token)), `ตัวควบคุม: รอบ 13:00 ต้องมีตัวอ้าง: ${fmt(s12.map((x) => [x.timeText, x.token]))}`);
    let s12b = s12;
    if (dupErr) {
      ok(/unique|duplicate/i.test(dupErr), `สร้างรอบซ้ำไม่ได้ด้วยเหตุอื่น (ไม่ใช่ข้อจำกัดเฉพาะ): ${dupErr}`);
      console.log(`     ℹ️ YR-3: ฐานไม่ยอมให้มีรอบเวลาเดียวกันตัวเลือกเดียวกัน (${dupErr.slice(0, 120)}) ⇒ คู่ id ตัวเลือกเดียวกันเกิดไม่ได้ · ทดสอบคู่ที่ลูกค้าแยกไม่ได้จริงแทน: ตัวเลือกคนละ id ชื่อเดียวกัน เวลาเดียวกัน`);
      // คู่ที่แยกไม่ได้บนหน้า: ตัวเลือกคนละแถวแต่ชื่อเดียวกัน (ร้านสร้างตัวเลือกชื่อซ้ำได้) — เวลาออก · ช่วงเวลา · ชื่อตัวเลือก ตรงกันทุกอย่าง
      const opt3 = await insertRow("TripOption", { id: rid("oY3c"), tenantId: tA, unitId: uA, productId: P.id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 510, sortOrder: 3, active: true, updatedAt: new Date() });
      allIds.push(opt3);
      await insertRow("TripDeparture", { id: d2, tenantId: tA, unitId: uA, productId: P.id, optionId: opt3, scheduleId: null, localDate: "2027-03-12", startsAt: BKK("2027-03-12", "08:00"), endsAt: BKK("2027-03-12", "16:30"), status: "OPEN", capacity: 24, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: BKK("2027-03-12", "08:00"), version: 0, updatedAt: new Date() });
      allIds.push(d2);
      s12b = await productSlots(SA, P.slug, "2027-03-12");
    }
    const am = s12b.filter((x) => String(x.timeText).startsWith("08:00"));
    eq([am.length, am.map((x) => x.token ?? null), am.some((x) => x.selectable === true)], [2, [null, null], false], `คู่ 08:00 ที่แยกไม่ได้ (ตัวเลือกเดียวกัน/ชื่อเดียวกัน): ${fmt(am.map((x) => [x.timeText, x.token, x.selectable]))}`);
    const visible: unknown[] = s12b.map((x) => x.token).filter((t) => typeof t === "string");
    const g = await call("quoteBookSelection", { shop: SA, productSlug: P.slug, query: { d: "2027-03-12" }, acceptLanguage: "th", clientKey: ck() }, N0);
    const gt = asRec(asRec(g.options)?.slot)?.token ?? null;
    ok(g.ok !== true || gt === null || visible.includes(gt), `quote (GET ไม่มี t) คืนตัวอ้างที่หน้าสินค้าไม่แสดง (ตัวอ้างของคู่ซ้ำต้องเป็น null · Y3): ${fmt(gt)} · หน้าแสดง ${fmt(visible)}`);
    const g13 = await call("quoteBookSelection", { shop: SA, productSlug: P.slug, query: { d: "2027-03-12", t: String(pm?.token) }, acceptLanguage: "th", clientKey: ck() }, N0);
    eq(asRec(asRec(g13.options)?.slot)?.token, pm?.token, "เลือก 13:00 ด้วยลิงก์ได้");
  });

  await st("YR-4", "มติ Y4: ยอดที่เห็นไม่ตรง quote ⇒ PRICE_CHANGED (totalSatang = ยอดจริง ฿4,100) ×5 ครั้ง เครื่องเดียว รอบเดียว ⇒ ถังถือ/ถังต่อรอบไม่ขยับ ไม่มีที่ถือ · หลังจากนั้นยังถือได้ครบโควตา 3 (ครั้งที่ 4 ⇒ RATE_LIMITED LIMIT + holdLimited)", async () => {
    needDb();
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-03-18", c);
    const t = String(asRec(o.slot)?.token ?? "");
    const k0 = await holdBuckets(c), h0 = await activeHeldOf(DEP.y4 ?? "");
    const pcs: Rec[] = [];
    for (let i = 0; i < 5; i++) pcs.push(await hold("2027-03-18", { adults: 1 }, { clientKey: c, opts: o, seen: AD + PA - 100, t }));
    eq(pcs.map((r) => [r.ok, r.code, r.totalSatang]), pcs.map(() => [false, "PRICE_CHANGED", AD + PA]), "ราคาเปลี่ยน ×5");
    eq([await holdBuckets(c), await activeHeldOf(DEP.y4 ?? "") - h0], [k0, 0], "ถังไม่ขยับ · ไม่มีที่ถือ");
    const rs: Rec[] = [];
    for (let i = 0; i < 4; i++) rs.push(await hold("2027-03-18", { adults: 1 }, { clientKey: c, opts: o, seen: AD + PA, t }));
    eq([rs.map((r) => r.ok), rs[3]?.code, rs[3]?.reason, rs[3]?.holdLimited, await activeHeldOf(DEP.y4 ?? "") - h0], [[true, true, true, false], "RATE_LIMITED", "LIMIT", true, 3], "ถือครบโควตา 3 แล้วถูกจำกัด");
  });

  await st("YR-5", "มติ Y5: ถังต่อรอบเต็ม ⇒ holdLimited ⇒ ลิงก์กลับหน้าสินค้า e=HOLD_LIMITED (ตัวทำลิงก์ของ core) · ค่า e นอกรายการถูกทิ้ง · bookErrorParam(HOLD_LIMITED) = RATE_LIMITED + holdLimited · actions.ts เลือก e จาก holdLimited ของผล · ถังอ่านเต็ม ⇒ RATE_LIMITED LIMIT ไม่มี holdLimited (ถังถือไม่ขยับ) · ข้อความ select.holdLimited ≠ select.holdUnavailable ทั้งสองภาษา ทั้งคู่มีทางติดต่อร้าน {contact} ไม่มี \"รอสักครู่\" · จอเลือกข้อความตาม holdLimited", async () => {
    needDb();
    const hl = coreV("BOOK_HOLD_LIMITED");
    eq(hl, "HOLD_LIMITED", "BOOK_HOLD_LIMITED");
    const href = P("bookSelectHref"), ep = P("bookErrorParam");
    const back = { productSlug: A().slug, query: { d: "2027-03-31", t: "abcdefghijk2" } };
    const hLim = String(href(SA, back, hl)), hRate = String(href(SA, back, "RATE_LIMITED")), hBad = String(href(SA, back, "EVIL<x>"));
    eq([/[?&]e=HOLD_LIMITED(&|$)/.test(hLim), /[?&]e=RATE_LIMITED(&|$)/.test(hRate), /[?&]e=/.test(hBad), hBad.includes("EVIL")], [true, true, false, false], `ลิงก์: ${fmt([hLim, hRate, hBad])}`);
    eq([ep({ e: "HOLD_LIMITED" }), asRec(ep({ e: "RATE_LIMITED" }))?.holdLimited ?? null, ep({ e: "HOLD_LIMITEDX" }), ep({ e: "<script>" })], [{ code: "RATE_LIMITED", fields: [], holdLimited: true }, null, null, null], "bookErrorParam");
    const ac = stripComments(read(ACTIONS));
    ok(/bookSelectHref\([^;]*holdLimited\s*\?\s*BOOK_HOLD_LIMITED\s*:\s*r\.code/.test(ac), "actions.ts: ถือไม่สำเร็จต้องส่ง e=HOLD_LIMITED เมื่อผลมี holdLimited (ไม่ใช่ค่าจากคำขอ)");
    // ถังอ่านเต็ม (ปลูกแถวถังด้วย SQL ณ นาฬิกาข้อสอบ) ⇒ RATE_LIMITED แบบไม่มี holdLimited · ถังถือไม่ขยับ
    const c = ck();
    const t = await tOf("2027-03-31");
    await pool.query(`INSERT INTO "ChatRateBucket" ("id", "key", "count", "windowStart", "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, $1, 100000, $2, NOW(), NOW())`, [`trips:book:${tA}:${c}`, NOW0]);
    const k0 = await holdBuckets(c);
    const r = await holdRaw(SA, A().slug, { d: "2027-03-31", t, "n.ADULT": "1", nonce: nonceAt(), seen: String(AD + PA) }, c);
    eq([r.ok, r.code, r.reason, r.holdLimited ?? null, await holdBuckets(c)], [false, "RATE_LIMITED", "LIMIT", null, k0], "ถังอ่านเต็ม");
    // ข้อความ
    const { th, en } = msgs();
    const keys = ["select.holdLimited", "select.holdUnavailable"];
    for (const [lang, m] of [["th", th], ["en", en]] as const) {
      const [a, b] = keys.map((k) => String(m[k] ?? ""));
      ok(a.trim() && b.trim() && a !== b, `${lang}: ${keys.join(" / ")} ต้องมีทั้งคู่และต่างกัน: ${fmt([a, b])}`);
      ok([a, b].every((v) => v.includes("{contact}")), `${lang}: ทั้งคู่ต้องมีทางติดต่อร้าน {contact}: ${fmt([a, b])}`);
      ok([a, b].every((v) => (lang === "th" ? /ติดต่อร้าน/.test(v) && !/รอสักครู่/.test(v) : /contact the shop/i.test(v) && !/(wait a moment|a moment)/i.test(v))), `${lang}: ข้อความต้องบอกติดต่อร้าน ไม่ใช่ "รอสักครู่": ${fmt([a, b])}`);
    }
    ok(/holdLimited\s*\?\s*["']select\.holdLimited["']\s*:\s*["']select\.holdUnavailable["']/.test(stripComments(read(`${COMP}/BookSelect.tsx`))), "BookSelect: ถือถี่เกิน (holdLimited) ⇒ select.holdLimited · อื่น ⇒ select.holdUnavailable");
  });

  await st("YR-6", "มติ Y6 ⚖️: res.pending / res.pay.nothingDue มี {contact} {code} ไม่สัญญาว่าร้านจะติดต่อ · priceChanged.termsBody ไม่ระบุว่าร้านเป็นผู้เปลี่ยน · หน้า PENDING แสดงรหัสการจอง (book-res-code) + ข้อความ res.pending · BOOK_TERMS_VERSION ขยับจากรอบก่อน (020fa639a)", () => {
    const { th, en } = msgs();
    for (const k of ["res.pending", "res.pay.nothingDue"]) {
      const a = String(th[k] ?? ""), b = String(en[k] ?? "");
      ok(a.includes("{contact}") && a.includes("{code}") && b.includes("{contact}") && b.includes("{code}"), `${k}: ต้องมี {contact} และ {code} ทั้งสองภาษา: ${fmt([a, b])}`);
      ok(!/ร้านจะ\s*(ติดต่อ|โทร|แจ้ง|ส่ง)/.test(a) && !/\b(shop|we|they)\s*(will|'ll)\s*(contact|call|get in touch|reach|message)/i.test(b), `${k}: ห้ามสัญญาว่าร้านจะติดต่อ: ${fmt([a, b])}`);
    }
    const tb = [String(th["priceChanged.termsBody"] ?? ""), String(en["priceChanged.termsBody"] ?? "")];
    ok(tb[0] && tb[1] && !/ร้าน\s*(ได้)?\s*(ปรับ|เปลี่ยน|แก้)/.test(tb[0]) && !/\bshop\s*(has\s*)?(changed|updated|adjusted|modified|revised)/i.test(tb[1]), `priceChanged.termsBody ไม่ระบุว่าร้านเป็นผู้เปลี่ยน: ${fmt(tb)}`);
    const pr = stripComments(read(PAGE_RES));
    ok(/["']PENDING["'][\s\S]{0,700}book-res-code[\s\S]{0,500}["']res\.pending["']/.test(pr), "หน้า my/ ของการจอง PENDING ต้องแสดง book-res-code แล้วข้อความ res.pending");
    const prev = /BOOK_TERMS_VERSION\s*=\s*["']([^"']+)["']/.exec(git(["show", "020fa639a:src/lib/platform/trips-book-core.ts"]))?.[1] ?? "";
    ok(prev, "อ่าน BOOK_TERMS_VERSION ของรอบก่อน (020fa639a) ไม่ได้");
    ok(coreV("BOOK_TERMS_VERSION") !== prev, `ข้อความเงื่อนไขเปลี่ยน (Y6) ⇒ BOOK_TERMS_VERSION ต้องขยับ: ยังเป็น ${prev}`);
  });

  await st("YR-7", "มติ Y7: collectMode อื่นที่ไม่ใช่ SHOP/AGENT ⇒ ไม่มี QR + เหตุกลาง NOT_SHOP (ฐานกันด้วย CHECK ⇒ พิสูจน์ด้วยการพยายามปลูก แล้วตรวจลำดับในซอร์ส) + ข้อความกลางมีทางติดต่อร้าน · ฟอร์มถือเดิม (nonce เดิม) ส่งซ้ำหลังตะกร้าถูกปล่อย (releaseBookHold) ⇒ STALE_FORM กลับหน้าสินค้า ไม่มีที่ถือ/ตะกร้าใหม่", async () => {
    needDb();
    // (ก) collectMode ค่าอื่น
    const h = await holdOk("2027-03-28", { adults: 1 });
    const tok = await confirmNew(h);
    let plantErr = "";
    try { await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'XYZ' WHERE "publicTokenHash" = $1`, [sha256hex(tok)]); } catch (e) { plantErr = errMsg(e); }
    if (!plantErr) {
      try {
        const vm = asRec((await reservation(tok, ck())).vm) ?? {};
        const pay = asRec(vm.pay) ?? {};
        eq([vm.state, "qrSvgDataUrl" in pay, pay.unavailable], ["PAY", false, "NOT_SHOP"], `collectMode XYZ: ${fmt(vm.pay)}`);
      } finally { await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'SHOP' WHERE "publicTokenHash" = $1`, [sha256hex(tok)]); }
    } else {
      ok(/check|constraint|violat/i.test(plantErr), `ปลูก collectMode XYZ ไม่ได้ด้วยเหตุอื่น: ${plantErr}`);
      console.log(`     ℹ️ YR-7: ฐานกัน collectMode นอก SHOP/AGENT (${plantErr.slice(0, 100)}) ⇒ ตรวจลำดับในซอร์สแทน`);
      const s = stripComments(read(BSVC));
      const fn = s.slice(s.indexOf("export async function openBookReservation"));
      const iAgent = fn.search(/collectMode\s*===\s*["']AGENT["'][\s\S]{0,80}AGENT_COLLECTS/), iOther = fn.search(/collectMode\s*!==\s*["']SHOP["'][\s\S]{0,80}NOT_SHOP/), iIntent = fn.search(/tripPaymentIntent\(/);
      ok(iAgent >= 0 && iOther > iAgent && iIntent > iOther, `openBookReservation: AGENT ⇒ AGENT_COLLECTS · ไม่ใช่ SHOP ⇒ NOT_SHOP ก่อนเรียก tripPaymentIntent (ลำดับ ${fmt([iAgent, iOther, iIntent])})`);
    }
    const { th, en } = msgs();
    const rs = stripComments(read(`${COMP}/BookReservation.tsx`));
    const kN = keyAfter(rs, /unavailable\s*===\s*["']NOT_SHOP["']/), kA = keyAfter(rs, /unavailable\s*===\s*["']AGENT_COLLECTS["']/);
    ok(kN && String(th[kN] ?? "").includes("{contact}") && String(en[kN] ?? "").includes("{contact}") && th[kN] !== th[kA ?? ""] && th[kN] !== th["res.pay.unavailable"], `ข้อความกลางของ NOT_SHOP (คีย์ ${kN}) ต้องมีทางติดต่อร้าน และไม่ใช่ข้อความเอเจนซี่/ไม่มีผู้รับเงิน`);
    // (ข) ฟอร์มถือเดิมหลังปล่อย
    const c = ck(); const o = await optsOf(SA, A().slug, "2027-04-07", c);
    const t = String(asRec(o.slot)?.token ?? ""); const n = nonceAt();
    const r1 = await hold("2027-04-07", { adults: 1 }, { clientKey: c, opts: o, seen: AD + PA, t, nonce: n });
    ok(r1.ok === true, `ถือครั้งแรก: ${fmt(r1)}`);
    const rr = await rel({ basketToken: String(r1.basketToken), sel: String(r1.sel), clientKey: c });
    ok(rr.ok === true, `releaseBookHold: ${fmt(rr)}`);
    const h0 = await activeHeldOf(DEP.y7 ?? ""), b0 = await basketsOf();
    const r2 = await hold("2027-04-07", { adults: 1 }, { clientKey: c, opts: o, seen: AD + PA, t, nonce: n });
    eq([r2.ok, r2.code, asRec(r2.back)?.productSlug, r2.shopSlug], [false, "STALE_FORM", A().slug, SA], "ส่งฟอร์มถือเดิมซ้ำหลังปล่อย");
    eq([h0, await activeHeldOf(DEP.y7 ?? ""), await basketsOf() - b0, (await depRow(DEP.y7 ?? "")).held], [0, 0, 0, 0], "ไม่มีที่ถือ/ตะกร้าใหม่");
  });

  await st("YR-8", "releaseBookHold (ผู้ตรวจรอบ 2): ปล่อยพร้อมกัน 10 ทาง + ปล่อยซ้ำ ⇒ ตัวนับ held ของรอบ = ผลรวมที่ถือ ACTIVE จริง (เหลือเฉพาะที่ถือของลูกค้าอื่น) ไม่ติดลบ · ผลมีแค่ ok หรือ BUSY · ปล่อยซ้ำทีหลัง ⇒ ok · คีย์ของผลไม่มี id ภายใน/token · ปล่อยตะกร้าที่ที่ถือหมดเวลาแล้ว (now + 16 นาที · ตัวกวาดยังไม่วิ่ง) ⇒ ok ไม่ผิดพลาด · ตัวนับ = ผลรวม ACTIVE", async () => {
    needDb();
    const d = DEP.rel ?? "";
    const other = await holdOk("2027-04-08", { adults: 1 });
    const h = await holdOk("2027-04-08", { adults: 2 });
    eq([(await depRow(d)).held, await activeHeldOf(d)], [3, 3], "ก่อนปล่อย");
    const rs = await Promise.all(Array.from({ length: 10 }, () => rel(h)));
    const bad = rs.filter((r) => r.ok !== true && !(r.ok === false && r.code === "BUSY"));
    ok(rs.some((r) => r.ok === true) && bad.length === 0, `ผลปล่อยพร้อมกัน: ${fmt(bad.slice(0, 2))}`);
    const again = await rel(h);
    ok(again.ok === true, `ปล่อยซ้ำ: ${fmt(again)}`);
    const dr = await depRow(d);
    eq([dr.held, await activeHeldOf(d), dr.held >= 0], [1, 1, true], "held = ผลรวม ACTIVE (เหลือของลูกค้าอื่น 1) · ไม่ติดลบ");
    eq((await q<{ status: string }>(`SELECT h.status FROM "TripHold" h JOIN "SellBasket" b ON b.id = h."basketId" WHERE b."publicTokenHash" = $1`, [sha256hex(other.basketToken)])).map((x) => x.status), ["ACTIVE"], "ที่ถือของลูกค้าอื่นไม่ถูกแตะ");
    const okR = rs.find((r) => r.ok === true) ?? again;
    ok(Object.keys(okR).every((k) => ["ok", "shopSlug", "back", "lang"].includes(k)), `คีย์ของผลปล่อย: ${fmt(Object.keys(okR))}`);
    noInternal(okR, allIds, "ผลปล่อย", [h.basketToken, sha256hex(h.basketToken), h.sel]);
    // ที่ถือหมดเวลาแล้ว
    const dx = DEP.relx ?? "";
    const hx = await holdOk("2027-04-09", { adults: 1 });
    const late = at(16 * MIN);
    const rx = await rel(hx, late);
    ok(rx.ok === true, `ปล่อยตะกร้าที่ที่ถือหมดเวลาแล้ว: ${fmt(rx)}`);
    const rx2 = await rel(hx, late);
    const drx = await depRow(dx);
    eq([rx2.ok, drx.held, drx.held >= 0], [true, await activeHeldOf(dx), true], "ปล่อยซ้ำหลังหมดเวลา · held = ผลรวม ACTIVE");
  });
  groupLine("YR");

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
// ORACLE-EDIT สรุป (มติ W3): C-12 คงไว้ไม่แก้ = แดงที่รู้จัก (ชื่อ+อีเมลตรง Party เดิม ⇒ เบอร์ใหม่ที่พิมพ์ถูกทิ้ง · หนี้ W1.2b) — แยกจากแดงอื่น ไม่เปลี่ยนเนื้อข้อ/รหัสออก
const KNOWN_RED = ["C-12"];
const knownRed = failed.filter((c) => KNOWN_RED.includes(c.id)).map((c) => c.id), otherRed = failed.filter((c) => !KNOWN_RED.includes(c.id)).map((c) => c.id);
console.log(`แดงที่รู้จัก (มติ W3): ${knownRed.join(" ") || "ไม่มี"} · แดงอื่น: ${otherRed.join(" ") || "ไม่มี"}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), knownRed, otherRed, skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
