// QC — TRIPS W1.3a · การจองของฉัน: ยืนยันเบอร์ผู้จอง (ลิงก์ + เบอร์ · OQ37) → grant 15 นาที → ยกเลิกก่อนจ่าย (ทันที) · ยื่นคำขอคืนเงินตาม snapshot (ร้านพิจารณา) · สถานะคำขอบนหน้า (ภาพ 01ง · 07 · 15)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/W1.3.md (W1.3a · มติ K1–K12) · สัญญา ledger/TRIPS-CORE-CONTRACT.md §G.1 §G.3 §J.3 · ภาพ ledger/design-trips/01-tour-customer.* (ง) · 07-states.* · 15-refund-flow.*
// ⚠️ ไม่มีเลื่อนรอบ/ขอลิงก์ใหม่ในใบนี้ (มติ K1) — ข้อเดิมของสองเรื่องนั้นอยู่ใน scripts/qc-trips-w1.3a2.draft.txt
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน · พิสูจน์ฟิกซ์เจอร์/ค่าคาดหวังด้วยบริการของโมดูลโดยตรง)
//   S ไฟล์/กติกาโค้ด   P ตัวช่วยบริสุทธิ์ (trips-self-core)   LG ภาษา   FN รั้วบริการ (เรียกบริการจริงด้วย PUBLIC + publicSelf · K2–K4)
//   V ยืนยันเบอร์ + grant   M ก้อนจัดการบนหน้าการจอง (K8 · K10)   CN ยกเลิก/คำขอคืนเงิน/สถานะคำขอ   RL ด่านอัตรา (K6 · ปิดเมื่อพัง)
//   X1 ข้ามร้าน/ข้ามการจอง · X3 ยิงพร้อมกัน ≥ 10 · X4 ส่งซ้ำ · X6 อินพุตอันตราย · PII
//
// 🔴 นาฬิกา: ทุกการเทียบเวลาใช้ "now ที่ข้อสอบส่ง" (NOW0 + ค่าชดเชย) เท่านั้น — ไม่เทียบกับ createdAt/updatedAt ที่ฐานเติม now() · ไม่กรองแถวด้วยช่วงเวลา
// 🔴 ค่าคาดหวังคิดเองจากฟิกซ์เจอร์ราชา (trips-fixture) + ตารางยกเลิกค่าเริ่ม (TRIPS-DEFAULTS T20: ≥30 วัน 100 · 15–29 วัน 50 · <15 วัน 0) — ไม่เรียกโค้ดที่ถูกทดสอบเพื่อหาคำตอบ
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-w13-*` (ไม่พึ่งร้าน seed) · ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน A ตั้ง trips.cancel.autoApproveUpTo สูง (K4: คำขอของลูกค้ายังต้อง QUOTED)
// 🔴 การจองทดสอบสร้างผ่านเส้นจริงของ W1.2a (startBookHold → confirmBookHold) + ร้านรับเงิน (recordTripPayment STAFF) · CONFIRMED ยังไม่จ่าย = bookTripsNow STAFF PAY_LATER
// 🔴 nonce ของใบนี้ผูก (ร้าน · วัตถุประสงค์ verify/cancel · token) · grant ผูกกุญแจเครื่อง (IP) — ข้อสอบใช้กุญแจเครื่องเดียวกันตลอดเส้นของการจองหนึ่ง
// 🔴 ยังไม่มีโมดูล/ฟังก์ชัน = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-w1.3.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน W1.3a: PC เขียว · S-8 (ฉากภาพ — ผู้ร่างเพิ่มแล้ว) เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks"; // ORACLE-EDIT P1 (ผู้คุม 19 พ.ย. รอบ 3): ขอบเขตคำขอของ Next สำหรับเรียก server action แบบ qc-crm-c1.11
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { createElement } from "react"; // ORACLE-EDIT L7 (ผู้คุม 19 พ.ย. รอบ 2): เรนเดอร์จอจริงแบบ qc-trips-t0.4d G4
import { renderToStaticMarkup } from "react-dom/server";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import { fromMainMerge } from "./trips-main-merge.mjs"; // ORACLE-EDIT (ผู้คุม 19 พ.ย.: รวม main) — commit ฝั่ง main ที่รวมเข้ามา อยู่ที่เดียว
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-w1.3";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-w1.2) ═══════════════
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
const rid = (p: string) => `w13qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SLUG = "trips-w13-";
const EMAIL_PREFIX = "trips-w13-";
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

// ═══════════════ สเปก (ใบสั่ง W1.3a · มติ K1–K12) ═══════════════
const BASE_SHA = "499a4be5e"; // wip/trips-w1.3 = session/trips ตอนเขียนใบสั่ง
const SCORE = "src/lib/platform/trips-self-core.ts";
const SSVC = "src/lib/platform/trips-self.ts";
const BSVC = "src/lib/platform/trips-book.ts";
const BCORE = "src/lib/platform/trips-book-core.ts";
const PUBMOD = "src/lib/modules/trips/public-booking.ts";
const FACADE = "src/lib/modules/trips/index.ts";
const BOOKING = "src/lib/modules/trips/booking.ts";
const REFUND = "src/lib/modules/trips/refund.ts";
const MONEY = "src/lib/modules/trips/money.ts";
const CAPACITY = "src/lib/modules/trips/capacity.ts"; // L5: แตะได้เฉพาะจุด audit ≤ +4/−1
const NEXT_CONFIG = "next.config.ts"; // L10: headers() ≤ +10/−0
const ACTIONS = "src/app/book/[shop]/my/actions.ts";
const PAGE_RES = "src/app/book/[shop]/my/[token]/page.tsx";
const COMP = "src/components/book";
const MSG_TH = "src/messages/th/book.json";
const MSG_EN = "src/messages/en/book.json";
const OWN = [SCORE, SSVC, ACTIONS, PAGE_RES];
const SCORE_NAMES = ["SELF_ERROR_CODES", "SELF_BLOCKS", "SELF_CANCEL_KINDS", "SELF_GRANT_TTL_SEC", "SELF_WRONG_PER_BOOKING", "SELF_WRONG_WINDOW_SEC", "SELF_GRANT_RE", "SELF_NONCE_PURPOSES", "selfManageOf", "selfPhoneMatches"];
const SSVC_FNS = ["issueSelfFormNonce", "verifyBookSelf", "quoteBookSelfCancel", "cancelBookSelf"];
const ACTION_NAMES = ["verifySelfAction", "cancelSelfAction"];
const ERROR_CODES = ["NOT_FOUND", "RATE_LIMITED", "INVALID", "VERIFY_FAILED", "VERIFY_REQUIRED", "NOT_ALLOWED", "ACCEPT_REQUIRED", "AMOUNT_CHANGED", "STATE_CHANGED", "TOO_FAST", "STALE_FORM", "DONE", "BUSY", "UNAVAILABLE"];
const BLOCKS = ["AGENT", "PENDING", "ENDED", "STARTED", "REFUND_IN_PROGRESS", "REFUND_REJECTED"];
const CANCEL_KINDS = ["UNPAID", "REFUND_REQUEST", "CANCEL_REQUEST"];
const GRANT_TTL_MIN = 15; // K7 ค่าคงที่ของหน้า (ไม่อ่าน X9)
const WRONG_LIMIT = 20; // K6 ผิดได้ 20 ครั้ง / 24 ชม. / การจอง
const PUBLIC_ACTOR_ID = "trips.public.self"; // K3
const INTERNAL_KEYS = ["id", "tenantId", "unitId", "productId", "slotId", "departureId", "optionId", "paxTypeId", "extraId", "zoneId", "pickupZoneId", "bookingId", "basketId", "holdId", "dueId", "partyId", "bookerPartyId",
  "agentAccountId", "clientKey", "itemRef", "priceSource", "priceTrace", "fingerprint", "warnings", "quoteId", "policySnapshot", "publicTokenHash", "requestId", "phone", "phoneNorm", "email", "version", "expectedVersion"];
const TESTIDS = ["book-manage", "book-manage-cancel", "book-manage-contact", "book-verify", "book-verify-phone", "book-verify-submit", "book-cancel-quote", "book-cancel-paid", "book-cancel-refund", "book-cancel-kept",
  "book-cancel-step", "book-cancel-paid-warning", "book-cancel-accept", "book-cancel-submit", "book-cancel-done", "book-refund-status", "book-self-locked", "book-self-error"];
const I18N_REQUIRED = [
  ...["title", "cancel", "cancelOnly", "contact", "agent"].map((k) => `self.manage.${k}`),
  ...["title", "phone", "submit", "help", "locked"].map((k) => `self.verify.${k}`),
  ...["title", "paid", "refund", "kept", "step", "accept", "submit", "done", "unpaidDone", "requested", "cancelRequested", "paidWarning"].map((k) => `self.cancel.${k}`),
  ...["QUOTED", "APPROVED", "REJECTED", "DONE", "byShop"].map((k) => `self.refund.${k}`),
  ...ERROR_CODES.filter((c) => c !== "DONE").map((c) => `self.err.${c}`),
  ...BLOCKS.map((b) => `self.block.${b}`),
  "page.titleManage",
  // ORACLE-EDIT LG-1 (ผู้คุม 19 พ.ย. รอบ 2 · มติ L3 L7): คีย์ใหม่จากรายการใน ledger/wo-notes/trips-W1.3a.md
  "self.cancel.passThrough", "self.cancel.today", "self.cancel.requestNote", "self.err.INVALID_PHONE", "self.refund.byShopRejected",
];
const FORBIDDEN_PATHS = ["prisma", "src/proxy.ts", "src/lib/core", "src/i18n", "src/lib/branding", "src/lib/payment", "src/app/api", "src/app/app", "src/app/b", "src/app/(store)", "src/lib/platform", "src/lib/modules",
  "src/messages/th/trips.json", "src/messages/en/trips.json", "src/components/trips", "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/trips-ui-inventory.json", "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts",
  ...["p0.1", "t0.1", "t0.2", "t0.3", "t0.4", "t0.5", "t0.6", "t0.7", "t0.8", "t1.1", "t1.2", "t1.3", "t1.4", "a1.1", "a1.2", "a1.3", "w1.1", "w1.2"].map((w) => `scripts/qc-trips-${w}.mts`),
  `:(exclude)${SCORE}`, `:(exclude)${SSVC}`, `:(exclude)${BSVC}`, `:(exclude)${BCORE}`, `:(exclude)${PUBMOD}`, `:(exclude)${FACADE}`, `:(exclude)${BOOKING}`, `:(exclude)${REFUND}`, `:(exclude)${MONEY}`, `:(exclude)${CAPACITY}` /* ORACLE-EDIT S-10 (มติ L5) */];
/** ไฟล์ที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด] — ใบสั่ง §2 + K3 (money.ts) */
const LIMITED: [string, number, number | null][] = [[BSVC, 10, 60], [BCORE, 0, 20], [PUBMOD, 0, 60], [FACADE, 0, 20], [BOOKING, 10, 84] /* ORACLE-EDIT S-10 (มติ L1 → P4): +84/−10 */, [REFUND, 4, 30], [MONEY, 2, 12], [CAPACITY, 1, 4] /* L5 */, [NEXT_CONFIG, 0, 10] /* L10 */, ["scripts/visual-trips.mts", 0, 10]];
const VISUAL_SCENES = ["self-manage", "self-manage-en", "self-verify", "self-cancel-quote", "self-cancel-requested", "self-unpaid-cancelled", "self-refund-rejected", "self-locked"];
// ราคาราชาจากฟิกซ์เจอร์ (ภาพ 01 · 15) — คิดเอง
const R = FX.PRODUCT_RACHA;
const AD = R.adultSatang, CH = R.childSatang, PA = R.parkAdultSatang, PC_ = R.parkChildSatang, CAM = R.extras.camera.satang;
const TOTAL = 2 * AD + CH + 2 * PA + PC_ + CAM; // ฿11,450.00
const PT = 2 * PA + PC_; // ค่าอุทยาน (เก็บแทน · ยังไม่จ่ายออก ⇒ คืนเต็ม) ฿1,500.00
const NONPT = 2 * AD + CH + CAM; // ค่าทริป + กล้อง ฿9,950.00
const halfUp = (x: number) => Math.floor((x * 5_000 + 5_000) / 10_000); // ×50% ปัดครึ่งขึ้นต่อบรรทัด (สัญญา G.3)
const KEPT50 = halfUp(2 * AD) + halfUp(CH) + halfUp(CAM); // ฿4,975.00 (ภาพ 15)
const REFUND50 = NONPT - KEPT50 + PT; // ฿6,475.00 (ภาพ 15)
const ONE = AD + PA; // ผู้ใหญ่ 1 คน + ค่าอุทยาน ฿4,100.00
const AUTO_APPROVE = 2_000_000; // ร้าน A อนุมัติคืนเงินอัตโนมัติได้ถึง ฿20,000 — K4: คำขอจาก publicSelf ต้อง QUOTED อยู่ดี
const X8_VERIFY = 5; // TRIPS-DEFAULTS X8 otpPer15Min
const NOW0 = new Date("2027-03-01T03:00:00.000Z"); // 10:00 น. 1 มี.ค. 2570 (เวลาร้าน)
const at = (ms: number) => ({ now: new Date(NOW0.getTime() + ms) });
const N0 = at(0);
const AFTER = at(20_000); // ร้านรับเงิน
const VMS = 60_000; // ยืนยันเบอร์
const VNOW = at(VMS);
const ACT = at(120_000); // ทำรายการหลังยืนยัน
const IP_PREFIX = "100.66.";
const RECEIVER_NAME = `ร้านทดสอบ W13 ${STAMP}`;
const SHOP_CONTACT = { phone: "076-000-313", line: "@w13qc", address: "13 ถนนทดสอบ ภูเก็ต" };
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
  const BSI = existsSync(join(ROOT, BSVC)) ? await tryImport("@/lib/platform/trips-book") : { mod: null, err: "ยังไม่มีไฟล์" };
  const SCI = existsSync(join(ROOT, SCORE)) ? await tryImport("@/lib/platform/trips-self-core") : { mod: null, err: "ยังไม่มีไฟล์" };
  const SSI = existsSync(join(ROOT, SSVC)) ? await tryImport("@/lib/platform/trips-self") : { mod: null, err: "ยังไม่มีไฟล์" };
  const SETI = await tryImport("@/lib/core/settings");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const tfn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ไม่มี ${name}`); return f as AnyFn; };
  const tcall = async (name: string, ...a: unknown[]): Promise<Rec> => { const f = tfn(name); try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  const bfn = (name: string): AnyFn => { const f = BSI.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`ไม่มี ${name} ของ W1.2a (${BSI.err.slice(0, 80)})`); return f as AnyFn; };
  const bcall = async (name: string, ...a: unknown[]): Promise<Rec> => { const f = bfn(name); try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  const coreV = (name: string): unknown => { const v = SCI.mod?.[name]; if (v === undefined) throw new AssertFail(`ยังไม่มี ${name} ใน trips-self-core (W1.3a ยังไม่สร้าง · ${SCI.err.slice(0, 80)})`); return v; };
  const P = (name: string): AnyFn => { const f = coreV(name); if (typeof f !== "function") throw new AssertFail(`${name} ไม่ใช่ฟังก์ชัน`); return f as AnyFn; };
  const sfn = (name: string): AnyFn => { const f = SSI.mod?.[name]; if (typeof f !== "function") throw new AssertFail(`ยังไม่มี ${name} ใน platform/trips-self (W1.3a ยังไม่สร้าง · ${SSI.err.slice(0, 80)})`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => { const f = sfn(name); try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; } };
  const bookClientKey = (ip: string): string => {
    const f = PUBI.mod?.bookClientKey;
    if (typeof f !== "function") throw new AssertFail(`ไม่มี bookClientKey ของ W1.1 (${PUBI.err.slice(0, 80)})`);
    const k = (f as AnyFn)(ip);
    if (typeof k !== "string") throw new AssertFail(`bookClientKey(${ip}) ไม่คืนสตริง: ${fmt(k)}`);
    usedClientKeys.push(k);
    return k;
  };
  let ipN = 0;
  const IP_OF = new Map<string, string>(); // ORACLE-EDIT P1: กุญแจเครื่อง → IP (หัว x-real-ip ของคำขอ action)
  const ck = () => { ipN++; const ip = `${IP_PREFIX}${(ipN >> 8) & 255}.${ipN & 255}`; const k = bookClientKey(ip); IP_OF.set(k, ip); return k; };
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
  const BLOCKED = (r: Rec, block: string, what: string) => { ok(r.ok === false && r.code === "NOT_ALLOWED" && r.block === block, `${what}: ต้องได้ NOT_ALLOWED{block:${block}} · ได้ ${fmt(r)}`); };

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB"), uA = rid("uA"), uB = rid("uB");
  const SA = `${SLUG}${STAMP}-a`, SB = `${SLUG}${STAMP}-b`;
  let setupErr = "", bookErr = "";
  type Prod = { id: string; slug: string; opt: string; unit: string; tenant: string; pt: Record<string, string>; cam: string };
  const PRD: Record<string, Prod> = {};
  const DEP: Record<string, string> = {};
  const allIds: string[] = [tA, tB, uA, uB];
  const OWNER: Record<string, Rec> = {};
  const STAFF: Record<string, string> = {};
  const setV = async (tenantId: string, changes: Rec[]) => {
    const f = SETI.mod?.setSettings;
    if (typeof f !== "function") throw new AssertFail(`ไม่มี setSettings (${SETI.err.slice(0, 80)})`);
    const r = asRec(await (f as AnyFn)(OWNER[tenantId], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    if (r.ok !== true) throw new AssertFail(`setSettings ${changes.map((c) => String(c.key)).join(",")}: ${fmt(r)}`);
  };
  const mkDep = async (tag: string, key: string, date: string, o: { capacity?: number; sold?: number; status?: string } = {}): Promise<string> => {
    const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const startsAt = BKK(date, "08:00"); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8.5 * HOUR),
      status: o.status ?? "OPEN", capacity: o.capacity ?? 30, sold: o.sold ?? 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    DEP[tag] = id; allIds.push(id);
    return id;
  };
  const mkProd = async (key: string, tenantId: string, unitId: string) => {
    const id = rid(`p${key}`), opt = rid(`o${key}`);
    const slug = `w13qc-${key.toLowerCase()}-${STAMP}`;
    await insertRow("TripProduct", { id, tenantId, unitId, slug, productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `${R.name} ${key}`, en: `Racha test ${key}` }),
      body: JSON.stringify({ summary: { th: `สรุป ${key}` } }), currency: "THB", deepDive: false, crossBorder: false, publishedAt: new Date("2027-01-01T00:00:00Z"), updatedAt: new Date() });
    await insertRow("TripOption", { id: opt, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 510, sortOrder: 1, active: true, updatedAt: new Date() });
    const pt: Record<string, string> = {};
    for (const [i, code] of ["ADULT", "CHILD", "INFANT"].entries()) pt[code] = await insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: code === "ADULT" ? "ผู้ใหญ่" : code === "CHILD" ? "เด็ก" : "ทารก", en: code === "ADULT" ? "Adult" : code === "CHILD" ? "Child" : "Infant" }),
      ageMin: code === "CHILD" ? R.childAge.min : code === "ADULT" ? 12 : null, ageMax: code === "CHILD" ? R.childAge.max : code === "INFANT" ? 3 : null, countsCapacity: code !== "INFANT", active: true, sortOrder: i, updatedAt: new Date() });
    const park = await insertRow("TripExtra", { id: rid("xpark"), tenantId, unitId, productId: id, kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: PA, currency: "THB", commissionable: false, discountable: false, passThrough: true, taxKind: "NONE",
      name: JSON.stringify({ th: "ค่าอุทยาน", en: "Marine park fee" }), paxPrices: JSON.stringify({ ADULT: PA, CHILD: PC_ }), active: true, sortOrder: 0, updatedAt: new Date() });
    const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: CAM, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
      name: JSON.stringify({ th: R.extras.camera.name, en: "Underwater camera rental" }), active: true, sortOrder: 1, updatedAt: new Date() });
    for (const [code, amount] of [["ADULT", AD], ["CHILD", CH], ["INFANT", 0]] as const) await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: pt[code], cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: amount, weekdayMask: null, priority: 0, updatedAt: new Date() });
    PRD[key] = { id, slug, opt, unit: unitId, tenant: tenantId, pt, cam };
    allIds.push(id, opt, park, cam, ...Object.values(pt));
  };
  try {
    for (const t of ["TripProduct", "TripOption", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "SellBasket", "TripHold", "TripBooking", "TripRefundRequest", "PaymentProfile", "ChatRateBucket", "Party", "AuditLog"]) await needTable(t);
    for (const [id, slug, tag] of [[tA, SA, "a"], [tB, SB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ W1.3 ${tag}`, slug, status: "ACTIVE", updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uB, tB, "b"]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", status: "ACTIVE", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({}), updatedAt: new Date() });
    for (const [t, tag] of [[tA, "a"], [tB, "b"]] as const) {
      const u = rid(`uo${tag}`);
      await insertRow("User", { id: u, email: `${EMAIL_PREFIX}o${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ o${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mbo${tag}`), userId: u, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
      OWNER[t] = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: u };
      STAFF[t] = u;
      await insertRow("PaymentProfile", { id: rid("pp"), tenantId: t, promptpayId: "0812345678", displayName: `${RECEIVER_NAME} ${tag}`, updatedAt: new Date() });
    }
    await mkProd("A", tA, uA); await mkProd("B", tB, uB);
    // รอบ (เวลาร้านกรุงเทพ · NOW0 = 1 มี.ค. 2570 10:00): 45 วัน (100%) · 19 วัน (50%) · 9 วัน (0%) · ที่ถือ (HOLD) แยกรอบต่อข้อ · gen = การจองผู้ใหญ่ 1 คน
    await mkDep("d45", "A", "2027-04-15"); await mkDep("d19", "A", "2027-03-20"); await mkDep("d9", "A", "2027-03-10");
    await mkDep("hold", "A", "2027-04-20"); await mkDep("hold2", "A", "2027-04-27"); await mkDep("hold3", "A", "2027-04-28"); await mkDep("race", "A", "2027-04-23");
    await mkDep("gen", "A", "2027-04-24", { capacity: 60 }); await mkDep("b1", "B", "2027-04-15");
    await setV(tA, [{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uA, value: true }, { key: "trips.public.shopContact", scope: "UNIT", scopeId: uA, value: SHOP_CONTACT },
      { key: "trips.cancel.autoApproveUpTo", scope: "UNIT", scopeId: uA, value: AUTO_APPROVE }]);
    await setV(tB, [{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uB, value: true }]);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const needFx = () => { ok(!setupErr && PRD.A && PRD.B, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); };

  // ── สร้างการจองผ่านเส้นจริงของ W1.2a ──
  let phoneN = 0;
  const freshPhone = () => { phoneN++; return `06${String((parseInt(hex(3), 16) * 100 + phoneN) % 100_000_000).padStart(8, "0")}`; };
  const shopOf = (tenant: string) => (tenant === tB ? SB : SA);
  type Pick = { adults?: number; children?: number; camera?: boolean };
  type Bk = { tag: string; token: string; id: string; phone: string; ck: string; shop: string; tenant: string; unit: string; dep: string; total: number; seats: number };
  const BK: Record<string, Bk> = {};
  const staffCtx = (tenant: string, when = AFTER) => ({ tenantId: tenant, unitId: tenant === tB ? uB : uA, channel: "COUNTER", actor: { kind: "STAFF", userId: STAFF[tenant] }, now: when.now });
  const mkBooking = async (tag: string, depTag: string, prodKey: string, pk: Pick, o: { pay?: boolean } = {}): Promise<Bk> => {
    const p = PRD[prodKey]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${prodKey}`);
    const shop = shopOf(p.tenant);
    const date = String((await q<{ d: string }>(`SELECT "localDate"::text AS d FROM "TripDeparture" WHERE id = $1`, [DEP[depTag]]))[0]?.d ?? "");
    const devH = ck();
    const nonce = (purpose: "hold" | "confirm") => {
      const r = bfn("issueBookFormNonce")({ now: new Date(NOW0.getTime() - 60_000), scope: { tenantId: p.tenant, purpose } });
      if (typeof r !== "string") throw new AssertFail(`issueBookFormNonce: ${fmt(r)}`);
      return r;
    };
    const o0 = await bcall("quoteBookSelection", { shop, productSlug: p.slug, query: { d: date }, acceptLanguage: "th", clientKey: devH }, N0);
    ok(o0.ok === true, `quoteBookSelection ${tag}: ${fmt(o0)}`);
    const opts = asRec(o0.options) ?? {};
    const sq: Rec = {};
    if (pk.adults) sq["n.ADULT"] = String(pk.adults);
    if (pk.children) sq["n.CHILD"] = String(pk.children);
    if (pk.camera) { const x = asArr(opts.extras).find((e) => /กล้อง|camera/i.test(String(asRec(e.name)?.text ?? e.name ?? ""))); ok(x?.ref, `ไม่พบรายการเสริมกล้อง ${tag}`); sq[`x.${String(x?.ref)}`] = "1"; }
    const s0 = await bcall("quoteBookSelection", { shop, productSlug: p.slug, query: { d: date, ...sq }, acceptLanguage: "th", clientKey: devH }, N0);
    const sum = asRec(s0.summary);
    ok(s0.ok === true && sum && typeof sum.slotToken === "string", `สรุปยอด ${tag}: ${fmt(s0)}`);
    const total = Number(sum?.totalSatang);
    const h = await bcall("startBookHold", { shop, productSlug: p.slug, form: { d: date, t: String(sum?.slotToken), ...sq, nonce: nonce("hold"), seen: String(total) }, acceptLanguage: "th", clientKey: devH }, N0);
    ok(h.ok === true, `startBookHold ${tag}: ${fmt(h)}`);
    const phone = freshPhone();
    const c = await bcall("confirmBookHold", { shop, basketToken: h.basketToken, sel: h.sel, form: { name: `ผู้จอง ${tag} ${STAMP}`, phone, email: "", accept: "on", nonce: nonce("confirm"), seen: String(total) }, clientKey: devH }, at(10_000));
    ok(c.ok === true && typeof c.token === "string", `confirmBookHold ${tag}: ${fmt(c)}`);
    const token = String(c.token);
    const id = String((await q<{ id: string }>(`SELECT id FROM "TripBooking" WHERE "publicTokenHash" = $1`, [sha256hex(token)]))[0]?.id ?? "");
    ok(id, `ไม่พบการจองของ ${tag}`);
    if (o.pay) {
      const pr = await tcall("recordTripPayment", staffCtx(p.tenant), { bookingId: id, amountSatang: total, tender: "PROMPTPAY", idempotencyKey: `w13pay_${hex(8)}` });
      ok(pr.ok === true, `recordTripPayment ${tag}: ${fmt(pr)}`);
    }
    const seats = (pk.adults ?? 0) + (pk.children ?? 0);
    const b: Bk = { tag, token, id, phone, ck: ck(), shop, tenant: p.tenant, unit: p.unit, dep: DEP[depTag] ?? "", total, seats };
    BK[tag] = b; allIds.push(id);
    return b;
  };
  /** K10: CONFIRMED ยังไม่จ่าย (ร้านจองให้ · จ่ายทีหลัง) — bookTripsNow STAFF PAY_LATER ผู้ใหญ่ 1 คน · token = publicToken ที่บริการคืน */
  const mkConfirmed = async (tag: string, depTag: string, bookerPhone?: string): Promise<Bk> => { // ORACLE-EDIT (มติ L4): bookerPhone = เบอร์ที่ร้านพิมพ์ตอนจอง (รูปใดก็ได้)
    const p = PRD.A as Prod;
    const line = { productKind: "TRIP", unitId: uA, productId: p.id, slotId: DEP[depTag], optionId: p.opt, pax: [{ paxTypeId: p.pt.ADULT, qty: 1 }] };
    const qt = await tcall("quoteTrips", staffCtx(tA), { lines: [line] });
    const qv = asRec(qt.value);
    ok(qt.ok === true && typeof qv?.quoteId === "string", `quoteTrips ${tag}: ${fmt(qt)}`);
    const phone = freshPhone();
    const r = await tcall("bookTripsNow", staffCtx(tA), { idempotencyKey: `w13now_${hex(8)}`, quoteId: qv?.quoteId, quoteExpiresAt: qv?.expiresAt, booker: { name: `ผู้จอง ${tag} ${STAMP}`, phone: bookerPhone ?? `+66${phone.slice(1)}` }, pay: { method: "PAY_LATER" }, quote: { lines: [line] } });
    const ref = asArr(r.value)[0];
    ok(r.ok === true && typeof ref?.publicToken === "string" && typeof ref?.bookingId === "string", `bookTripsNow ${tag}: ${fmt(r)}`);
    const b: Bk = { tag, token: String(ref?.publicToken), id: String(ref?.bookingId), phone, ck: ck(), shop: SA, tenant: tA, unit: uA, dep: DEP[depTag] ?? "", total: ONE, seats: 1 };
    BK[tag] = b; allIds.push(b.id);
    return b;
  };
  const FULL: Pick = { adults: 2, children: 1, camera: true };
  if (!setupErr) {
    try {
      await mkBooking("b45", "d45", "A", FULL, { pay: true });
      for (const t of ["b19", "b19r", "b19rep", "bRej", "bStaffReq"]) await mkBooking(t, "d19", "A", FULL, { pay: true });
      await mkBooking("b9", "d9", "A", FULL, { pay: true });
      await mkBooking("bHold", "hold", "A", FULL); await mkBooking("bHold2", "hold2", "A", FULL); await mkBooking("bRace", "race", "A", FULL); await mkBooking("bFnHold", "hold3", "A", { adults: 1 });
      for (const t of ["bExp", "bPend"]) await mkBooking(t, "gen", "A", { adults: 1 });
      for (const t of ["bAgent", "bChan", "bV", "bV2", "bNull", "bRL3", "bRL4", "bRL4b", "bRL5", "bX6", "bX1", "bFn1", "bFn2", "bFnOk", "bPcAuto"]) await mkBooking(t, "gen", "A", { adults: 1 }, { pay: true });
      await mkConfirmed("bConf", "gen");
      await mkBooking("bB", "b1", "B", { adults: 1 }, { pay: true });
      // K10: ลูกค้าเอเจนซี่ 2 แบบ (collectMode / channel AGENT_* — SELL_CHANNELS ไม่มี "AGENT") · ผู้จองไม่มีเบอร์ (V-5) · PENDING — ปรับฟิกซ์เจอร์ตรง ๆ หลังจอง (ทดสอบปฏิกิริยาของหน้า ไม่ใช่เส้นสร้าง)
      await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT' WHERE id = $1`, [BK.bAgent?.id]);
      await pool.query(`UPDATE "TripBooking" SET channel = 'AGENT_LINK' WHERE id = $1`, [BK.bChan?.id]);
      await pool.query(`UPDATE "TripBooking" SET status = 'PENDING' WHERE id = $1`, [BK.bPend?.id]);
      await pool.query(`UPDATE "Party" SET phone = NULL, "phoneNorm" = NULL WHERE id = (SELECT "bookerPartyId" FROM "TripBooking" WHERE id = $1)`, [BK.bNull?.id]);
    } catch (e) { bookErr = e instanceof AssertFail ? e.message : errMsg(e); console.log(`  ⚠️ สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`); }
  }
  const needBk = (...tags: string[]): Bk[] => { needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`); return tags.map((t) => { const b = BK[t]; ok(b, `ไม่มีการจอง ${t}`); return b as Bk; }); };
  const needSelf = () => { ok(SSI.mod, `ยังไม่มี platform/trips-self (W1.3a ยังไม่สร้าง · ${SSI.err.slice(0, 60)})`); };

  // ── ตัวช่วยของใบนี้ ──
  type Purpose = "verify" | "cancel";
  const snonce = (b: Bk, purpose: Purpose, ms: number): string => {
    const r = sfn("issueSelfFormNonce")({ now: new Date(NOW0.getTime() + ms), scope: { tenantId: b.tenant, purpose, token: b.token } });
    if (typeof r !== "string" || !r) throw new AssertFail(`issueSelfFormNonce ไม่คืนสตริง: ${fmt(r)}`);
    return r;
  };
  // ORACLE-EDIT X6 (ผู้คุม 19 พ.ย.): คีย์ที่ส่งมาแบบระบุ (รวม null/undefined) ต้องส่งตามนั้น — เดิม `o.phone ?? b.phone` / `o.nonce ?? snonce(…)` เปลี่ยน null เป็นค่าจริง
  //   ⇒ X6-1 (เบอร์ null) / X6-2 (nonce null) แดงด้วยเหตุผิด (ได้ grant/INVALID ของค่าจริง) · ตอนนี้ null/undefined ที่ระบุถูกส่งไปตรง ๆ และต้องถูกปฏิเสธ ไม่มี grant
  const pick = <K extends string, V>(o: Partial<Record<K, unknown>>, k: K, dflt: () => V): unknown => (k in o ? o[k] : dflt());
  const verify = (b: Bk, o: { phone?: unknown; clientKey?: string; when?: { now: Date }; nonce?: unknown; shop?: string; token?: string } = {}) => {
    const when = o.when ?? VNOW;
    return call("verifyBookSelf", { shop: pick(o, "shop", () => b.shop), token: pick(o, "token", () => b.token), form: { phone: pick(o, "phone", () => b.phone), nonce: pick(o, "nonce", () => snonce(b, "verify", when.now.getTime() - NOW0.getTime() - 60_000)) }, clientKey: pick(o, "clientKey", () => b.ck) }, when);
  };
  const grantOf = async (b: Bk, when = VNOW): Promise<string> => {
    const r = await verify(b, { when });
    ok(r.ok === true && typeof r.grant === "string", `verifyBookSelf ${b.tag}: ${fmt(r)}`);
    return String(r.grant);
  };
  // ORACLE-EDIT X6 (ผู้คุม 19 พ.ย.): แบบเดียวกับ verify — accept/nonce/clientKey/shop/token ที่ระบุ (แม้ undefined/null) ส่งตามนั้น · เดิม `o.accept === undefined ? "on"` ซ่อนกรณี accept ที่ไม่ส่ง
  const cancelQ = (b: Bk, grant: unknown, when = ACT, o: { clientKey?: string; shop?: string; token?: string } = {}) =>
    call("quoteBookSelfCancel", { shop: pick(o, "shop", () => b.shop), token: pick(o, "token", () => b.token), grant, clientKey: pick(o, "clientKey", () => b.ck) }, when);
  // ORACLE-EDIT L1 (ผู้คุม 19 พ.ย. รอบ 2): ฟอร์มยกเลิกที่ลูกค้าส่ง = ช่องที่หน้าได้จาก quote (vm.form · มติ L1 ให้ผูกชนิดที่เห็นใน nonce หรือ hidden ⇒ ข้อสอบส่งทุกช่องของ vm.form กลับไป)
  //   ไม่ระบุ form/nonce ⇒ quote ด้วย grant เดียวกันก่อนส่ง 30 วิ (quote ไม่ผ่าน เช่นไม่มี grant/ปุ่มปิด ⇒ nonce ที่ออกเองแบบเดิม) · ระบุ form ⇒ ใช้ตามนั้น (seen/accept ทับ)
  const qform = async (b: Bk, grant: unknown, when: { now: Date }): Promise<Rec | null> => {
    const r = await cancelQ(b, grant, when);
    const f = asRec(asRec(r.vm)?.form);
    return r.ok === true && f ? { ...f } : null;
  };
  const cancelX = async (b: Bk, grant: unknown, seen: unknown, o: { accept?: unknown; nonce?: unknown; form?: Rec; when?: { now: Date }; clientKey?: string } = {}) => {
    const when = o.when ?? ACT;
    const base: Rec = o.form ? { ...o.form } : "nonce" in o ? { nonce: o.nonce } : (await qform(b, grant, { now: new Date(when.now.getTime() - 30_000) })) ?? { nonce: snonce(b, "cancel", when.now.getTime() - NOW0.getTime() - 60_000) };
    return call("cancelBookSelf", { shop: b.shop, token: b.token, grant, form: { ...base, seen: typeof seen === "number" ? String(seen) : seen, accept: pick(o, "accept", () => "on") }, clientKey: pick(o, "clientKey", () => b.ck) }, when);
  };
  /** ฟอร์มจาก quote n ใบ (เวลา VMS+5วิ+i วิ · ใช้ส่งที่ ACT) */
  const qforms = async (b: Bk, g: string, n: number): Promise<Rec[]> => {
    const out: Rec[] = [];
    for (let i = 0; i < n; i++) { const f = await qform(b, g, at(VMS + 5_000 + i * 1_000)); ok(f, `quote ฟอร์มที่ ${i + 1} ไม่ผ่าน`); out.push(f as Rec); }
    return out;
  };
  const openRes = (b: Bk, when = ACT, token?: string) => bcall("openBookReservation", { shop: b.shop, token: token ?? b.token, lang: "th", acceptLanguage: "th", clientKey: ck() }, when);
  const manageOf = async (b: Bk, when = ACT): Promise<Rec> => {
    const r = await openRes(b, when);
    ok(r.ok === true, `openBookReservation ${b.tag}: ${fmt(r)}`);
    const m = asRec(asRec(r.vm)?.manage);
    ok(m, `vm.manage ไม่มี (${b.tag}) — W1.3a ยังไม่เพิ่มก้อนจัดการในหน้าการจอง: ${fmt(Object.keys(asRec(r.vm) ?? {}))}`);
    return m ?? {};
  };
  type BRow = { status: string; version: number; departureId: string; travelDate: string; paidSatang: number; grossSatang: number; publicTokenHash: string; code: string; policySnapshot: Rec };
  const bRow = async (id: string): Promise<BRow> => {
    const r = (await q<BRow>(`SELECT status, version, "departureId", "travelDate"::text AS "travelDate", "paidSatang", "grossSatang", "publicTokenHash", code, "policySnapshot" FROM "TripBooking" WHERE id = $1`, [id]))[0];
    ok(r, `ไม่พบแถวการจอง ${id}`);
    return r as BRow;
  };
  const depRow = async (id: string) => (await q<{ capacity: number; sold: number; held: number }>(`SELECT capacity, sold, held FROM "TripDeparture" WHERE id = $1`, [id]))[0] ?? { capacity: -1, sold: -1, held: -1 };
  type RRow = { id: string; status: string; amountSatang: number; reasonKind: string; choice: string; by: string };
  const refunds = async (bookingId: string) => q<RRow>(`SELECT id, status, "amountSatang", "reasonKind", choice, "by" FROM "TripRefundRequest" WHERE "bookingId" = $1 ORDER BY "createdAt"`, [bookingId]);
  const payableOfSnap = (s: Rec) => Number(asRec(s.totals)?.payableSatang);
  const G: Record<string, string> = {}; // grant ที่ข้อหลังใช้ต่อ (ภายในอายุ 15 นาที · เครื่องเดียวกัน)
  const pubCtx = (when = ACT) => ({ tenantId: tA, unitId: uA, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `pc_${"7".repeat(40)}` }, now: when.now });
  const selfReason = (): string => { const v = needTrips().TRIPS_PUBLIC_SELF_REASON; if (typeof v !== "string" || !v) throw new AssertFail("facade trips ไม่มี TRIPS_PUBLIC_SELF_REASON (K2 · เหตุผลค่าคงที่ของ PUBLIC)"); return v; };
  const publicSelfOf = (b: Bk, expectedVersion?: number) => ({ publicSelf: { bookingId: b.id, tokenHash: sha256hex(b.token), ...(expectedVersion === undefined ? {} : { expectedVersion }) } });
  // ORACLE-EDIT FN (ผู้คุม 19 พ.ย. รอบ 2 · มติ L1): publicSelf พก expectedVersion = รุ่นของการจองตอนนี้ (รุ่นเก่า ⇒ STATE_CONFLICT ตรวจใน L1-3)
  const psOf = async (b: Bk) => publicSelfOf(b, (await bRow(b.id)).version);
  type ARow = { action: string; actorType: string; actorId: string | null; after: Rec | null };
  const auditsOf = async (targetId: string) => q<ARow>(`SELECT action, "actorType"::text AS "actorType", "actorId", "after" FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2`, [tA, targetId]);
  const k3 = (rows: ARow[], action: string, what: string, b: Bk) => {
    const hit = rows.filter((r) => r.action === action);
    ok(hit.length >= 1, `${what}: ไม่มีแถว audit ${action} (${fmt(rows.map((r) => r.action))})`);
    for (const r of hit) {
      eq([r.actorType, r.actorId, asRec(r.after)?.by], ["SYSTEM", PUBLIC_ACTOR_ID, "PUBLIC"], `${what}: รูปแถว audit (K3)`);
      const s = JSON.stringify(r.after);
      ok(!s.includes(b.phone) && !s.includes(b.phone.slice(1)) && !s.includes(b.ck) && !s.includes(b.token), `${what}: audit มีเบอร์/กุญแจเครื่อง/token`);
    }
  };
  const lockKeyOf = (b: Bk) => `trips:verifyb:${b.tenant}:${sha256hex(sha256hex(b.token)).slice(0, 24)}`;

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม (บริการของโมดูลโดยตรง · เขียวก่อนมีงาน) ──");
  await st("PC-1", "การจองทดสอบเกิดผ่านเส้นจริงของ W1.2a + ร้านรับเงิน: PAID · ยอด ฿11,450.00 · token เปิดหน้าการจองเป็น VOUCHER · Party.phoneNorm ของผู้จอง = เบอร์ที่พิมพ์ (เงื่อนไขการยืนยันเบอร์) · HOLD ยังไม่จ่าย", async () => {
    const [b, h] = needBk("b45", "bHold");
    const r = await bRow(b.id);
    eq([r.status, r.paidSatang, payableOfSnap(r.policySnapshot), b.total], ["PAID", TOTAL, TOTAL, TOTAL], "สถานะ/ยอด");
    const o = await openRes(b, ACT);
    eq([o.ok, asRec(o.vm)?.state], [true, "VOUCHER"], "หน้าการจอง");
    const p = (await q<{ phoneNorm: string | null }>(`SELECT p."phoneNorm" FROM "Party" p JOIN "TripBooking" t ON t."bookerPartyId" = p.id WHERE t.id = $1`, [b.id]))[0];
    eq(p?.phoneNorm, b.phone, "Party.phoneNorm");
    eq((await bRow(h.id)).status, "HOLD", "การจองยังไม่จ่าย");
  });
  await st("PC-2", `ยอดคืนจาก snapshot ผ่านบริการ (STAFF · QUOTE) = ค่าที่คิดเอง: 45 วัน คืน ${TOTAL} · 19 วัน คืน ${REFUND50} เก็บ ${KEPT50} (ภาพ 15) · 9 วัน คืน ${PT} เก็บ ${NONPT}`, async () => {
    const [b45, b19, b9] = needBk("b45", "b19", "b9");
    for (const [b, refund, kept] of [[b45, TOTAL, 0], [b19, REFUND50, KEPT50], [b9, PT, NONPT]] as const) {
      const r = await tcall("cancelTripBooking", staffCtx(tA, ACT), { bookingId: b.id, mode: "QUOTE", reason: "pc", idempotencyKey: `w13pc_${hex(6)}` });
      const c = asRec(asRec(r.value)?.computed);
      eq([r.ok, c?.refundSatang, c?.feeSatang], [true, refund, kept], `QUOTE ${b.tag}`);
    }
  });
  await st("PC-3", "PUBLIC ที่ไม่มี opts.publicSelf ถูกปฏิเสธทุกทาง: cancel QUOTE ⇒ FORBIDDEN OTP_REQUIRED · requestTripRefund ⇒ FORBIDDEN · changeTripBooking ⇒ FORBIDDEN (ต้องยังเป็นแบบนี้หลังใบนี้)", async () => {
    const [b] = needBk("b19");
    const c = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "QUOTE", reason: "pc", idempotencyKey: `w13pc_${hex(6)}` });
    eq([c.ok, c.code, asRec(c.details)?.reason], [false, "FORBIDDEN", "OTP_REQUIRED"], "cancel PUBLIC");
    const rq = await tcall("requestTripRefund", pubCtx(), { bookingId: b.id, expectedVersion: 0, reasonKind: "CUSTOMER", choice: "MONEY", reason: "pc", idempotencyKey: `w13pc_${hex(6)}` });
    eq([rq.ok, rq.code], [false, "FORBIDDEN"], "requestTripRefund PUBLIC");
    const ch = await tcall("changeTripBooking", pubCtx(), { bookingId: b.id, expectedVersion: 0, line: { productKind: "TRIP", unitId: uA, productId: PRD.A?.id, slotId: DEP.d45, pax: [{ paxTypeId: PRD.A?.pt.ADULT, qty: 1 }] }, quoteId: "0".repeat(64), quoteExpiresAt: ACT.now.toISOString(), idempotencyKey: `w13pc_${hex(6)}` });
    eq([ch.ok, ch.code], [false, "FORBIDDEN"], "changeTripBooking PUBLIC");
    eq((await refunds(b.id)).length, 0, "ไม่มีคำขอคืนเงิน");
  });
  await st("PC-4", `ค่าตั้งอนุมัติอัตโนมัติของร้าน A (${AUTO_APPROVE}) มีผลจริงกับคำขอที่ร้านยื่น (STAFF · requestTripRefund) ⇒ APPROVED — ตัวควบคุมของ K4 (คำขอจากลูกค้าต้อง QUOTED แม้ค่านี้ > 0)`, async () => {
    const [b] = needBk("bPcAuto");
    const v = (await bRow(b.id)).version;
    const r = await tcall("requestTripRefund", staffCtx(tA, ACT), { bookingId: b.id, expectedVersion: v, reasonKind: "CUSTOMER", choice: "MONEY", reason: "pc auto", idempotencyKey: `w13pc_${hex(6)}` });
    eq([r.ok, asRec(r.value)?.status, asRec(r.value)?.amountSatang], [true, "APPROVED", ONE], "คำขอของร้าน (54 วัน คืนเต็ม)");
  });
  await st("PC-5", "ฟิกซ์เจอร์ K10: CONFIRMED ยังไม่จ่าย (bookTripsNow PAY_LATER) เปิดหน้าการจองได้ · collectMode AGENT · channel AGENT_LINK · PENDING · ผู้จองไม่มีเบอร์ — แถวตรงตามที่ตั้ง", async () => {
    const [c, a, ch, pe, nu] = needBk("bConf", "bAgent", "bChan", "bPend", "bNull");
    const rc = await bRow(c.id);
    eq([rc.status, rc.paidSatang, payableOfSnap(rc.policySnapshot)], ["CONFIRMED", 0, ONE], "CONFIRMED");
    eq((await openRes(c)).ok, true, "token ของ bookTripsNow เปิดหน้าได้");
    const rows = await q<{ id: string; status: string; channel: string; collectMode: string }>(`SELECT id, status, channel, "collectMode" FROM "TripBooking" WHERE id = ANY($1::text[]) ORDER BY id`, [[a.id, ch.id, pe.id]]);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    eq([by[a.id]?.collectMode, by[ch.id]?.channel, by[pe.id]?.status], ["AGENT", "AGENT_LINK", "PENDING"], "เอเจนซี่/PENDING");
    const pn = (await q<{ p: string | null }>(`SELECT p.phone AS p FROM "Party" p JOIN "TripBooking" t ON t."bookerPartyId" = p.id WHERE t.id = $1`, [nu.id]))[0];
    eq(pn?.p ?? null, null, "ผู้จองไม่มีเบอร์");
  });
  await st("PC-6", `ค่าตั้งที่ใบนี้อ่าน: X8 otpPer15Min ${X8_VERIFY} · X30 ช่องทางติดต่อร้าน (ข้อความล็อก K6) · autoApproveUpTo ${AUTO_APPROVE}`, async () => {
    needBk("b45");
    const rs = SETI.mod?.resolveSettings;
    ok(typeof rs === "function", "ไม่มี resolveSettings");
    const v = asRec(await (rs as AnyFn)({ tenantId: tA }, ["trips.public.rateLimits", "trips.public.shopContact", "trips.cancel.autoApproveUpTo"], { unitId: uA }, ACT.now)) ?? {};
    eq([asRec(asRec(v["trips.public.rateLimits"])?.value)?.otpPer15Min, asRec(v["trips.public.shopContact"])?.value, asRec(v["trips.cancel.autoApproveUpTo"])?.value], [X8_VERIFY, SHOP_CONTACT, AUTO_APPROVE], "ค่าตั้ง");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์/กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const compFiles = walk(COMP);
  const selfComp = compFiles.filter((f) => /BookSelf/.test(basename(f)));
  const uiSrc = [PAGE_RES, ACTIONS, ...compFiles].map((f) => stripComments(read(f))).join("\n");
  const needOwn = () => { const miss = OWN.filter((f) => !existsSync(join(ROOT, f))); ok(miss.length === 0, `ยังไม่มีไฟล์: ${miss.join(", ")}`); };
  await st("S-1", `ไฟล์ของใบมีครบ: ${OWN.map((f) => basename(f)).join(" · ")} + จอ BookSelf*.tsx ≥ 1`, () => { needOwn(); ok(selfComp.length >= 1, "ไม่มี src/components/book/BookSelf*.tsx"); });
  await st("S-2", `trips-self-core ส่งออก ${SCORE_NAMES.length} ชื่อ · trips-self ส่งออก ${SSVC_FNS.join(" · ")} · actions ส่งออก ${ACTION_NAMES.join(" · ")} เท่านั้น ('use server') · facade มี TRIPS_PUBLIC_SELF_REASON`, () => {
    for (const n of SCORE_NAMES) coreV(n);
    for (const n of SSVC_FNS) sfn(n);
    selfReason();
    const a = stripComments(read(ACTIONS));
    ok(/^\s*["']use server["']/.test(a), "actions ต้องขึ้นต้น 'use server'");
    const ex = [...a.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map((m) => m[1]).sort();
    eq(ex, [...ACTION_NAMES].sort(), "ชื่อ action ที่ส่งออก");
  });
  await st("S-3", "trips-self-core บริสุทธิ์: import type เท่านั้น · ไม่มี Date.now/new Date()/process.env/crypto/prisma/fetch", () => {
    const s = stripComments(read(SCORE));
    ok(s, "ยังไม่มีไฟล์");
    const imps = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*from\s+["'][^"']+["']/gm)].map((m) => m[0].trim());
    ok(imps.length === 0, `มี import ที่เป็นค่า: ${imps.slice(0, 3).join(" | ")}`);
    ok(!/Date\.now\(|new Date\(\s*\)|process\.env|node:crypto|createHmac|prisma|\bfetch\(/.test(s), "มีนาฬิกา/env/crypto/db/fetch");
  });
  await st("S-4", "trips-self.ts: ถังอัตราด้วย rateBucketCte (ห้าม checkRateLimitDb*) · ไม่มี raw unsafe · ไม่ส่ง partyId เข้าบริการ · ไม่ส่งข้อความ (SMS/อีเมล/LINE) · ไม่มีเลื่อน/ขอลิงก์ใหม่", () => {
    const s = stripComments(read(SSVC));
    ok(s, "ยังไม่มีไฟล์");
    ok(/rateBucketCte/.test(s), "ไม่ใช้ rateBucketCte");
    ok(!/checkRateLimitDb/.test(s), "ห้าม checkRateLimitDb* (เปิดเมื่อพัง)");
    ok(!/\$(queryRaw|executeRaw)Unsafe/.test(s), "ห้าม raw unsafe");
    ok(!/partyId\s*:/.test(s), "ห้ามส่ง partyId เข้าบริการ");
    ok(!/sendSms|sendEmail|notifyCustomer|pushLine/.test(s), "ใบนี้ไม่ส่งข้อความ");
    ok(!/changeTripBooking|rotate[A-Z]\w*Token|moveBookSelf/.test(s), "K1: ห้ามเลื่อน/ขอลิงก์ใหม่ในใบนี้");
  });
  await st("S-5", "รั้วบริการ (K1 K2 K5): booking.ts + refund.ts มี publicSelf + tokenHash ในบล็อก TRIPS W1.3 · ตัวช่วย selfReplayOf · ฟังก์ชัน changeImpl ไม่เปลี่ยนจาก BASE · ไม่มี rotateBookingPublicToken · บริการไม่อ่านคำขอ (FormData/headers)", () => {
    const b = read(BOOKING), r = read(REFUND);
    ok(/publicSelf/.test(b) && /publicSelf/.test(r) && /tokenHash/.test(b), "ไม่มี publicSelf/tokenHash ใน booking.ts/refund.ts");
    ok(/TRIPS W1\.3/.test(b) && /TRIPS W1\.3/.test(r), "การแก้บริการต้องอยู่ในบล็อกรั้ว // TRIPS W1.3 ▸ … ◂");
    ok(/selfReplayOf/.test(b + r), "ไม่มีตัวช่วย selfReplayOf (K5)");
    ok(!/rotateBookingPublicToken/.test(b), "K1: ห้ามมี rotateBookingPublicToken");
    const body = (src: string) => { const i = src.indexOf("async function changeImpl"); if (i < 0) return ""; const j = src.indexOf("\n// ═══", i); return src.slice(i, j < 0 ? undefined : j); };
    const base = git(["show", `${BASE_SHA}:${BOOKING}`]);
    ok(body(base) && body(b) === body(base), "K1: changeImpl ต้องไม่เปลี่ยนจาก BASE");
    ok(!/FormData|next\/headers/.test(stripComments(b) + stripComments(r)), "บริการห้ามอ่านคำขอ");
  });
  await st("S-6", "หน้า my/[token]: force-dynamic · noindex/nofollow · no-referrer (K7 หน้าที่มี g) · ไม่มีคุกกี้ใหม่ · ไม่มี dangerouslySetInnerHTML/fetch · ฟอร์มเป็น <form action={…}> · ไม่มี route/loading/error ใต้ /book", () => {
    needOwn();
    const s = stripComments(read(PAGE_RES));
    ok(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(s), "ต้อง force-dynamic");
    ok(/robots\s*:\s*\{\s*index\s*:\s*false\s*,\s*follow\s*:\s*false\s*\}/.test(s) && /referrer\s*:\s*["']no-referrer["']/.test(s), "ต้อง noindex + no-referrer");
    ok(!/cookies\(\)[\s\S]{0,40}\.set\(|Set-Cookie/.test(uiSrc), "ห้ามตั้งคุกกี้");
    ok(!/dangerouslySetInnerHTML/.test(uiSrc) && !/\bfetch\(/.test(uiSrc), "ห้าม dangerouslySetInnerHTML/fetch");
    ok(/<form[^>]*action=\{/.test(selfComp.map((f) => read(f)).join("\n") + read(PAGE_RES)), "ไม่มี <form action={serverAction}> ในจอของใบ");
    ok(!walk("src/app/book").some((f) => /\/(route|loading|error)\.tsx?$/.test(f)), "ห้าม route/loading/error ใต้ /book");
  });
  await st("S-7", `data-testid ของใบครบ ${TESTIDS.length} ตัว`, () => {
    needOwn();
    const miss = TESTIDS.filter((t) => !new RegExp(`["'\`]${t}["'\`]`).test(uiSrc));
    ok(miss.length === 0, `ไม่มี testid: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` (+${miss.length - 8})` : ""}`);
  });
  await st("S-8", `ฉากภาพ w1.3 ใน visual-trips.mts: ${VISUAL_SCENES.join(" · ")} · ทุกฉาก public · ไม่มีฉากเลื่อน (K1) · เตรียม/ล้างของตัวเอง (w13Prepare/w13Cleanup ใน finally)`, () => {
    const v = read("scripts/visual-trips.mts");
    ok(/["']w1\.3["']\s*:/.test(v), "ไม่มีสเปก w1.3");
    const block = v.slice(v.search(/["']w1\.3["']\s*:/));
    const blk = block.slice(0, block.search(/\n\};/));
    const miss = VISUAL_SCENES.filter((n) => !new RegExp(`name:\\s*["']${n}["']`).test(blk));
    ok(miss.length === 0, `ไม่มีฉาก: ${miss.join(", ")}`);
    ok(!/name:\s*["']self-move/.test(blk), "K1: ฉากเลื่อนต้องไม่อยู่ใน w1.3");
    ok(/w13Prepare/.test(v) && /w13Cleanup/.test(v), "ต้องมีตัวเตรียม (w13Prepare) + ตัวล้าง (w13Cleanup)");
    ok(/finally[\s\S]{0,400}w13Cleanup/.test(v), "ตัวล้างต้องวิ่งใน finally");
    ok(!/[A-Za-z0-9_-]{43}/.test(blk.replace(/name:\s*["'][^"']+["']/g, "")), "มี token ฝังในสเปก");
  });
  await st("S-9", "ไม่มี 'any' · ไม่มี @ts-ignore/@ts-expect-error/eslint-disable ในไฟล์ของใบ", () => {
    needOwn();
    for (const f of [...OWN, ...selfComp]) {
      const s = stripComments(read(f));
      ok(!/:\s*any\b|<any>|\bas any\b|any\[\]/.test(s), `${basename(f)} มี any`);
      ok(!/@ts-ignore|@ts-expect-error|eslint-disable/.test(read(f)), `${basename(f)} มีธงปิดตัวตรวจ`);
    }
  });
  await st("S-10", `ขอบเขต (เทียบ BASE ${BASE_SHA} · ไม่นับไฟล์ที่ตรงกับ session/trips · ไม่นับ scratchpad/): ไม่แตะ prisma/proxy/core/i18n/payment/api/(store) · modules/platform นอกไฟล์ของใบ · ข้อสอบเดิม · seed/fixture · ไฟล์จำกัดตามงบ (money.ts ≤ +12/−2 · K3) · ไม่มี migration`, () => {
    const tip = git(["rev-parse", "--verify", "-q", "session/trips"]).trim() || git(["rev-parse", "--verify", "-q", "origin/session/trips"]).trim();
    const same = (f: string) => !!tip && git(["ls-files", "--", f]).trim() !== "" && git(["diff", "--name-only", tip, "--", f]).trim() === "";
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...FORBIDDEN_PATHS]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...FORBIDDEN_PATHS]).split("\n")].filter(Boolean))]
      .filter((f) => !f.startsWith("scratchpad/"));
    const bad = changed.filter((f) => !same(f));
    ok(bad.length === 0, `แตะไฟล์นอกขอบเขต: ${bad.slice(0, 6).join(", ")}`);
    // ฉากภาพ w1.3 ผู้ร่างเพิ่มพร้อมข้อสอบ ⇒ งบของ visual-trips นับจาก commit ล่าสุดที่ลงข้อสอบนี้ (ยังไม่ commit = BASE)
    const oracleBase = git(["log", "-1", "--format=%H", "--", "scripts/qc-trips-w1.3.mts"]).trim() || BASE_SHA;
    for (const [f, maxDel, maxAdd] of LIMITED) {
      if (same(f)) continue;
      // ORACLE-EDIT S-10 (ผู้คุม 19 พ.ย. รอบ 2): งบนับจาก merge-base กับ session/trips (เลนรวม T0.4c/T0.4d/main เข้ามาแล้ว ⇒ นับเฉพาะการแก้ของใบนี้) · ไม่มี session/trips ⇒ BASE
      const limBase = git(["merge-base", "HEAD", "session/trips"]).trim() || BASE_SHA;
      const ns = git(["diff", "--numstat", f === "scripts/visual-trips.mts" ? oracleBase : limBase, "--", f]).trim().split(/\s+/);
      const add = Number(ns[0] || 0), del = Number(ns[1] || 0);
      ok(del <= maxDel && (maxAdd === null || add <= maxAdd), `${f}: +${add} −${del} (จำกัด −${maxDel}${maxAdd === null ? "" : ` +${maxAdd}`})`);
    }
    // ORACLE-EDIT S-10 (ผู้คุม 19 พ.ย.: รวม main — migration ของ main ไม่ใช่ของใบ): ไฟล์ใต้ prisma ที่ตรงกับ commit ฝั่ง main ที่รวมเข้ามา (fromMainMerge · scripts/trips-main-merge.mts) ไม่นับ · ฝั่ง TRIPS เพิ่ม/แก้ หรือ untracked ใต้ prisma ยังแดง
    const prismaNew = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", "prisma"]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", "prisma"]).split("\n")].filter(Boolean))].filter((f) => !fromMainMerge(ROOT, f));
    ok(prismaNew.length === 0, `ใบนี้ไม่มี migration: ${prismaNew.slice(0, 4).join(", ")}`);
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: trips-self-core ──");
  await st("P-1", `ค่าคงที่ตามใบสั่ง: รหัสผิด ${ERROR_CODES.length} · block ${BLOCKS.length} · ชนิดยกเลิก ${CANCEL_KINDS.join("/")} · grant ${GRANT_TTL_MIN} นาที (K7) · ผิดได้ ${WRONG_LIMIT} ครั้ง/24 ชม. (K6) · nonce verify/cancel · SELF_GRANT_RE`, () => {
    eq([...(coreV("SELF_ERROR_CODES") as string[])].sort(), [...ERROR_CODES].sort(), "SELF_ERROR_CODES");
    eq([...(coreV("SELF_BLOCKS") as string[])].sort(), [...BLOCKS].sort(), "SELF_BLOCKS");
    eq([...(coreV("SELF_CANCEL_KINDS") as string[])].sort(), [...CANCEL_KINDS].sort(), "SELF_CANCEL_KINDS");
    eq([coreV("SELF_GRANT_TTL_SEC"), coreV("SELF_WRONG_PER_BOOKING"), coreV("SELF_WRONG_WINDOW_SEC")], [GRANT_TTL_MIN * 60, WRONG_LIMIT, 86_400], "ค่าคงที่");
    eq([...(coreV("SELF_NONCE_PURPOSES") as string[])].sort(), ["cancel", "verify"], "วัตถุประสงค์ nonce (ไม่มี move/rotate · K1)");
    const re = coreV("SELF_GRANT_RE");
    ok(re instanceof RegExp && re.test(`g1.1700000000.${"A".repeat(22)}`) && !re.test(`g2.1.${"A".repeat(22)}`) && !re.test(`g1.1.${"A".repeat(21)}`), "SELF_GRANT_RE");
  });
  const MAN0 = { status: "PAID", agent: false, startsAt: "2027-04-15T01:00:00.000Z", now: "2027-03-01T03:00:00.000Z", holdExpiresAt: null, paidSatang: TOTAL, refund: null };
  const RQ = (status: string, mine = true) => ({ status, mine });
  await st("P-2", "selfManageOf ตามลำดับใบสั่ง: AGENT → PENDING → ENDED (จบ/HOLD หมดตามนาฬิกา) → STARTED → คำขอเปิด (REFUND_IN_PROGRESS) / ถูกปฏิเสธ (REFUND_REJECTED) → HOLD = UNPAID → ขายแล้ว: จ่ายแล้ว > 0 = REFUND_REQUEST · 0 = CANCEL_REQUEST (K10)", () => {
    const f = P("selfManageOf");
    const cases: [Rec, Rec][] = [
      [{}, { cancel: "REFUND_REQUEST", block: null }],
      [{ status: "PART_PAID", paidSatang: 100 }, { cancel: "REFUND_REQUEST", block: null }],
      [{ status: "CONFIRMED", paidSatang: 0 }, { cancel: "CANCEL_REQUEST", block: null }],
      [{ status: "CONFIRMED", paidSatang: 50 }, { cancel: "REFUND_REQUEST", block: null }],
      [{ status: "HOLD", paidSatang: 0, holdExpiresAt: "2027-03-01T03:15:00.000Z" }, { cancel: "UNPAID", block: null }],
      [{ status: "HOLD", paidSatang: 0, holdExpiresAt: "2027-03-01T03:00:00.000Z" }, { cancel: null, block: "ENDED" }],
      [{ status: "HOLD", paidSatang: 0, holdExpiresAt: null }, { cancel: null, block: "ENDED" }],
      [{ status: "PENDING", paidSatang: 0 }, { cancel: null, block: "PENDING" }],
      [{ agent: true }, { cancel: null, block: "AGENT" }],
      [{ agent: true, status: "PENDING" }, { cancel: null, block: "AGENT" }],
      [{ status: "CANCELLED" }, { cancel: null, block: "ENDED" }],
      [{ status: "EXPIRED" }, { cancel: null, block: "ENDED" }],
      [{ status: "TRAVELLED" }, { cancel: null, block: "ENDED" }],
      [{ status: "NO_SHOW" }, { cancel: null, block: "ENDED" }],
      [{ now: "2027-04-15T01:00:00.000Z" }, { cancel: null, block: "STARTED" }],
      [{ refund: RQ("QUOTED") }, { cancel: null, block: "REFUND_IN_PROGRESS" }],
      [{ refund: RQ("APPROVED", false) }, { cancel: null, block: "REFUND_IN_PROGRESS" }],
      [{ refund: RQ("EXECUTING") }, { cancel: null, block: "REFUND_IN_PROGRESS" }],
      [{ refund: RQ("FAILED") }, { cancel: null, block: "REFUND_IN_PROGRESS" }],
      [{ refund: RQ("REJECTED") }, { cancel: null, block: "REFUND_REJECTED" }],
      [{ refund: RQ("WITHDRAWN", false) }, { cancel: "REFUND_REQUEST", block: null }],
    ];
    for (const [patch, want] of cases) eq(f({ ...MAN0, ...patch }), want, `selfManageOf ${fmt(patch)}`);
  });
  await st("P-3", "selfManageOf อินพุตผิดรูป/สถานะไม่รู้จัก ⇒ {null, ENDED} ไม่ throw", () => {
    const f = P("selfManageOf");
    for (const bad of [null, undefined, 42, "x", [], { ...MAN0, status: "WHAT" }, { ...MAN0, now: "not-a-date" }, { ...MAN0, startsAt: null }, { ...MAN0, paidSatang: -1 }, { ...MAN0, paidSatang: "1" }]) {
      let r: unknown;
      try { r = f(bad); } catch (e) { throw new AssertFail(`throw กับ ${fmt(bad)}: ${errMsg(e)}`); }
      eq(r, { cancel: null, block: "ENDED" }, `ผิดรูป ${fmt(bad)}`);
    }
  });
  await st("P-4", "selfPhoneMatches: 0812345678 ตรงกับ 081-234-5678 · +66812345678 · 66812345678 · 0066812345678 · (081) 234 5678 · ไม่ตรงเลขอื่น/ว่าง/สั้น/ไม่ใช่สตริง", () => {
    const f = P("selfPhoneMatches");
    for (const v of ["0812345678", "081-234-5678", "+66812345678", "66812345678", "0066812345678", "(081) 234 5678", " 081 234 5678 "]) eq(f(v, "0812345678"), true, `ตรง ${v}`);
    for (const [v, n] of [["0812345679", "0812345678"], ["", ""], ["081234", "081234"], ["0812345678", ""], ["0812345678", null], [null, "0812345678"], [812345678, "0812345678"], ["+1 812345678", "0812345678"]] as const) eq(f(v, n), false, `ไม่ตรง ${fmt([v, n])}`);
  });
  groupLine("P");

  // ═══════════════ LG. ภาษา ═══════════════
  console.log("\n── LG: ภาษา ──");
  const th = flat(JSON.parse(read(MSG_TH) || "{}")), en = flat(JSON.parse(read(MSG_EN) || "{}"));
  await st("LG-1", `book.json ไทย/อังกฤษมีคีย์ของใบครบ ${I18N_REQUIRED.length} คีย์ · อังกฤษไม่มีอักษรไทย · ไม่มีรหัสดิบ/รหัสใบงาน · ไม่มีคีย์ self.move.* / self.link.* (K1)`, () => {
    const miss = I18N_REQUIRED.filter((k) => typeof th[k] !== "string" || !String(th[k]).trim() || typeof en[k] !== "string" || !String(en[k]).trim());
    ok(miss.length === 0, `คีย์ขาด: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` (+${miss.length - 8})` : ""}`);
    const thaiInEn = I18N_REQUIRED.filter((k) => /[ก-๙]/.test(String(en[k] ?? "")));
    ok(thaiInEn.length === 0, `อังกฤษมีอักษรไทย: ${thaiInEn.slice(0, 4).join(", ")}`);
    const raw = I18N_REQUIRED.flatMap((k) => [String(th[k] ?? ""), String(en[k] ?? "")]).filter((v) => /\b([WTAKLSX]\d\.\d+[abc]?|OQ\d+)\b|\b(VERIFY_FAILED|NOT_ALLOWED|REFUND_IN_PROGRESS|REFUND_REJECTED|QUOTED|EXECUTING|CANCEL_REQUEST)\b/.test(v));
    ok(raw.length === 0, `ค่ามีรหัส: ${raw.slice(0, 3).join(" | ")}`);
    ok(!Object.keys({ ...th, ...en }).some((k) => /^self\.(move|link)\./.test(k)), "K1: ไม่มีข้อความเลื่อน/ขอลิงก์ใหม่ในใบนี้");
  });
  await st("LG-2", "⚖️ ข้อความ self.* ไม่สัญญาสิ่งที่ระบบทำไม่ได้ (วันโอนคืน · อัตโนมัติ · SMS/OTP/รหัส/แจ้งเตือน · ร้านจะติดต่อ · ใบลดหนี้ · เลขบัญชี) · self.cancel.requested บอกว่าร้านพิจารณา + {contact} · K9 self.cancel.paidWarning บอก \"ถ้าโอนแล้ว อย่ายกเลิกที่นี่ ติดต่อร้าน\" + {contact} · K10 self.manage.cancelOnly/self.cancel.cancelRequested ไม่พูดถึงเงินคืน · K8 self.refund.byShop ไม่พูดว่า \"คุณยื่น\"", () => {
    const vals = Object.entries({ ...th, ...Object.fromEntries(Object.entries(en).map(([k, v]) => [`en:${k}`, v])) }).filter(([k]) => /(^|:)self\./.test(k)).map(([k, v]) => [k, String(v)] as const);
    ok(vals.length > 0, "ยังไม่มีคีย์ self.*");
    // ORACLE-EDIT LG-2 (ผู้คุม 19 พ.ย. · มติ L7 จ): ข้อความล็อก "ลองใหม่ได้ภายใน 24 ชั่วโมง" บอกอายุของการล็อก ไม่ใช่คำสัญญาเรื่องคืนเงิน/แจ้งเตือน ⇒ ยกเว้นเฉพาะคีย์ self.verify.locked*
    const bad = vals.filter(([k]) => !/(^|:)self\.verify\.locked(Bare)?$/.test(k)).filter(([, v]) => /ภายใน\s*\d+\s*(วัน|ชั่วโมง)|within\s+\d+\s+(business\s+)?(days?|hours?)|อัตโนมัติ|automatic|\bSMS\b|\bOTP\b|รหัส(ยืนยัน|ที่ส่ง)|code (we )?sent|ส่งรหัส|แจ้งเตือน|notif|ร้านจะติดต่อ|we will contact|will contact you|ใบลดหนี้|credit note|ใบเสร็จ.*ส่ง|บัญชีธนาคาร|เลขบัญชี|bank account/i.test(v));
    ok(bad.length === 0, `สัญญาที่ระบบทำไม่ได้: ${bad.slice(0, 3).map(([k, v]) => `${k}=${v}`).join(" | ")}`);
    const t = (k: string) => [String(th[k] ?? ""), String(en[k] ?? "")] as const;
    const [rqT, rqE] = t("self.cancel.requested");
    ok(/ร้าน/.test(rqT) && /\{contact\}/.test(rqT) && /shop/i.test(rqE) && /\{contact\}/.test(rqE), `self.cancel.requested ต้องบอกว่าร้านพิจารณา + {contact}: ${fmt([rqT, rqE])}`);
    const [wT, wE] = t("self.cancel.paidWarning");
    ok(/โอน/.test(wT) && /อย่า/.test(wT) && /ติดต่อร้าน/.test(wT) && /\{contact\}/.test(wT), `K9 ไทย: ${wT}`);
    ok(/(transfer|paid)/i.test(wE) && /(do not|don't)/i.test(wE) && /contact/i.test(wE) && /\{contact\}/.test(wE), `K9 อังกฤษ: ${wE}`);
    for (const k of ["self.manage.cancelOnly", "self.cancel.cancelRequested"]) for (const v of t(k)) ok(!/คืนเงิน|refund|฿|\{amount\}/i.test(v), `K10 ${k} ห้ามพูดถึงเงินคืน: ${v}`);
    for (const v of t("self.refund.byShop")) ok(!/คุณ(ได้)?ยื่น|you (have )?(submitted|requested)/i.test(v), `K8 self.refund.byShop: ${v}`);
  });
  groupLine("LG");

  // ═══════════════ FN. รั้วบริการ (K2–K4 · เรียกบริการจริง) ═══════════════
  console.log("\n── FN: รั้วบริการ PUBLIC + opts.publicSelf ──");
  const noWrite = async (b: Bk, v0: BRow, what: string) => { const v1 = await bRow(b.id); eq([v1.status, v1.version, (await refunds(b.id)).length], [v0.status, v0.version, 0], `${what}: ต้องไม่มีการเขียน`); };
  await st("FN-1", "publicSelf ไม่ตรง: bookingId ของการจองอื่น / tokenHash ของการจองอื่น / tokenHash ว่าง ⇒ FORBIDDEN ทั้ง QUOTE และ EXECUTE · ไม่มีคำขอ/สถานะไม่เปลี่ยน", async () => {
    const [b, o] = needBk("bFn1", "bFn2");
    const reason = selfReason();
    const v0 = await bRow(b.id);
    for (const [ps, what] of [[{ bookingId: o.id, tokenHash: sha256hex(o.token), expectedVersion: v0.version }, "bookingId อื่น"], [{ bookingId: b.id, tokenHash: sha256hex(o.token), expectedVersion: v0.version }, "tokenHash อื่น"], [{ bookingId: b.id, tokenHash: "", expectedVersion: v0.version }, "tokenHash ว่าง"]] /* ORACLE-EDIT FN-1 (มติ L1): ใส่รุ่นที่ถูก ⇒ ผิดเฉพาะช่องที่ตั้งใจ */ as const) {
      for (const mode of ["QUOTE", "EXECUTE"]) {
        const r = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode, reason, reasonKind: "CUSTOMER", choice: "MONEY", idempotencyKey: `w13fn_${hex(6)}` }, { publicSelf: ps });
        eq([r.ok, r.code], [false, "FORBIDDEN"], `${what} ${mode}`);
      }
    }
    await noWrite(b, v0, "FN-1");
  });
  await st("FN-2", "publicSelf ตรง แต่คำขอเกินสิทธิ์ ⇒ FORBIDDEN ไม่มีการเขียน: reasonKind EXTERNAL / SHOP_FAULT · reason ไม่ใช่ค่าคงที่ · requestTripRefund มี deductions · requestTripRefund choice CREDIT", async () => {
    const [b] = needBk("bFn1");
    const reason = selfReason();
    const v0 = await bRow(b.id);
    for (const [rk, rs] of [["EXTERNAL", reason], ["SHOP_FAULT", reason], ["CUSTOMER", `${reason} x`], ["CUSTOMER", "ยกเลิก"]] as const) {
      const r = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason: rs, reasonKind: rk, choice: "MONEY", idempotencyKey: `w13fn_${hex(6)}` }, await psOf(b));
      eq([r.ok, r.code], [false, "FORBIDDEN"], `cancel ${rk} "${rs.slice(0, 12)}"`);
    }
    const d = await tcall("requestTripRefund", pubCtx(), { bookingId: b.id, expectedVersion: v0.version, reasonKind: "CUSTOMER", choice: "MONEY", reason, deductions: [{ category: "OTHER_NECESSARY", amountSatang: 100, evidenceFileId: null }], idempotencyKey: `w13fn_${hex(6)}` }, await psOf(b));
    eq([d.ok, d.code], [false, "FORBIDDEN"], "requestTripRefund + deductions");
    const c = await tcall("requestTripRefund", pubCtx(), { bookingId: b.id, expectedVersion: v0.version, reasonKind: "CUSTOMER", choice: "CREDIT", reason, idempotencyKey: `w13fn_${hex(6)}` }, await psOf(b));
    ok(c.ok === false && ["FORBIDDEN", "VALIDATION"].includes(String(c.code)), `requestTripRefund CREDIT: ${fmt(c)}`);
    await noWrite(b, v0, "FN-2");
  });
  await st("FN-3", "K1: changeTripBooking ด้วย PUBLIC + publicSelf ที่ถูก ⇒ FORBIDDEN (ใบนี้ไม่เปิดเลื่อน) · ไม่เปลี่ยน", async () => {
    const [b] = needBk("bFn2");
    selfReason();
    const v0 = await bRow(b.id);
    const ch = await tcall("changeTripBooking", pubCtx(), { bookingId: b.id, expectedVersion: v0.version, line: { productKind: "TRIP", unitId: uA, productId: PRD.A?.id, slotId: DEP.d45, optionId: PRD.A?.opt, pax: [{ paxTypeId: PRD.A?.pt.ADULT, qty: 1 }] }, quoteId: "0".repeat(64), quoteExpiresAt: ACT.now.toISOString(), idempotencyKey: `w13fn_${hex(6)}` }, await psOf(b));
    eq([ch.ok, ch.code], [false, "FORBIDDEN"], "change PUBLIC");
    await noWrite(b, v0, "FN-3");
  });
  await st("FN-4", `publicSelf ถูก (บริการตรง): QUOTE ⇒ คืน ${ONE} · EXECUTE ⇒ คำขอ QUOTED แม้ร้านตั้งอนุมัติอัตโนมัติ ${AUTO_APPROVE} (K4) · by CUSTOMER · audit ของคำขอ actorType SYSTEM / actorId ${PUBLIC_ACTOR_ID} / after.by PUBLIC ไม่มีเบอร์ (K3) · ส่งซ้ำคีย์เดิม ⇒ ผลเดิม (K5)`, async () => {
    const [b] = needBk("bFnOk");
    const reason = selfReason();
    const qq = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "QUOTE", reason, reasonKind: "CUSTOMER", idempotencyKey: `w13fn_${hex(6)}` }, await psOf(b));
    eq([qq.ok, asRec(asRec(qq.value)?.computed)?.refundSatang], [true, ONE], "QUOTE");
    const key = `w13fn_${hex(6)}`;
    const x = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason, reasonKind: "CUSTOMER", choice: "MONEY", idempotencyKey: key }, await psOf(b));
    ok(x.ok === true, `EXECUTE: ${fmt(x)}`);
    const rr = await refunds(b.id);
    eq(rr.map((r) => [r.status, r.amountSatang, r.reasonKind, r.choice, r.by]), [["QUOTED", ONE, "CUSTOMER", "MONEY", "CUSTOMER"]], "คำขอ (K4 ไม่อนุมัติอัตโนมัติ)");
    k3(await auditsOf(rr[0]?.id ?? ""), "trips.refund.request", "audit คำขอ", b);
    const again = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason, reasonKind: "CUSTOMER", choice: "MONEY", idempotencyKey: key }, await psOf(b));
    ok(again.ok === true, `ส่งซ้ำคีย์เดิม: ${fmt(again)}`);
    eq((await refunds(b.id)).length, 1, "ยังมี 1 แถว");
  });
  await st("FN-5", "publicSelf ถูก (บริการตรง) ยกเลิก HOLD ⇒ CANCELLED · audit trips.booking.cancel รูป K3 (SYSTEM · trips.public.self · after.by PUBLIC) · ไม่มีคำขอคืนเงิน", async () => {
    const [b] = needBk("bFnHold");
    const x = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason: selfReason(), reasonKind: "CUSTOMER", idempotencyKey: `w13fn_${hex(6)}` }, await psOf(b));
    ok(x.ok === true, `EXECUTE: ${fmt(x)}`);
    eq([(await bRow(b.id)).status, (await refunds(b.id)).length], ["CANCELLED", 0], "สถานะ");
    k3(await auditsOf(b.id), "trips.booking.cancel", "audit ยกเลิก", b);
  });
  groupLine("FN");

  // ═══════════════ V. ยืนยันเบอร์ + grant ═══════════════
  console.log("\n── V: ยืนยันเบอร์ผู้จอง + สิทธิ์แก้ชั่วคราว (grant 15 นาที · K7) ──");
  await st("V-1", `เบอร์ถูก (รูปท้องถิ่น) ⇒ grant ตาม SELF_GRANT_RE · expiresAt = เวลายืนยัน + ${GRANT_TTL_MIN} นาทีพอดี (ค่าคงที่ · ไม่อ่าน X9) · ผลมีแค่ ok/grant/expiresAt/shopSlug`, async () => {
    needSelf(); const [b] = needBk("bV");
    const r = await verify(b);
    ok(r.ok === true && typeof r.grant === "string" && /^g1\.\d{1,12}\.[A-Za-z0-9_-]{22}$/.test(String(r.grant)), `verify: ${fmt(r)}`);
    eq(r.expiresAt, new Date(VNOW.now.getTime() + GRANT_TTL_MIN * MIN).toISOString(), "expiresAt");
    eq(Object.keys(r).sort(), ["expiresAt", "grant", "ok", "shopSlug"], "คีย์ผล");
    eq(r.shopSlug, SA, "shopSlug");
  });
  await st("V-2", "เบอร์รูปอื่นของเบอร์เดียวกัน (+66 · มีขีด) ⇒ ผ่าน", async () => {
    needSelf(); const [b] = needBk("bV");
    for (const p of [`+66${b.phone.slice(1)}`, `${b.phone.slice(0, 3)}-${b.phone.slice(3, 6)}-${b.phone.slice(6)}`]) {
      const r = await verify(b, { phone: p, clientKey: ck() });
      ok(r.ok === true && typeof r.grant === "string", `verify ${p}: ${fmt(r)}`);
    }
  });
  await st("V-3", "เบอร์ผิด ⇒ VERIFY_FAILED · ผลมีแค่ ok/code (+shopSlug/retryAfterSec) · ไม่สะท้อนเบอร์ที่พิมพ์/ไม่ใบ้เบอร์ผู้จอง", async () => {
    needSelf(); const [b] = needBk("bV");
    const wrong = "0899999999";
    const r = await verify(b, { phone: wrong, clientKey: ck() });
    ERR(r, "VERIFY_FAILED", "เบอร์ผิด");
    ok(Object.keys(r).every((k) => ["ok", "code", "shopSlug", "retryAfterSec"].includes(k)), `คีย์เกิน: ${Object.keys(r).join(",")}`);
    const s = JSON.stringify(r);
    ok(!s.includes(wrong) && !s.includes(b.phone) && !s.includes(b.phone.slice(-4)), "มีเบอร์ในผล");
  });
  await st("V-4", "เบอร์ของการจองอื่น (ร้านเดียวกัน) ⇒ VERIFY_FAILED", async () => {
    needSelf(); const [b, b2] = needBk("bV", "bV2");
    ERR(await verify(b, { phone: b2.phone, clientKey: ck() }), "VERIFY_FAILED", "เบอร์ของ bV2 กับ bV");
  });
  await st("V-5", "ผู้จองไม่มีเบอร์ (Party.phone ว่าง) ⇒ VERIFY_FAILED รูปเดียวกับเบอร์ผิด", async () => {
    needSelf(); const [b] = needBk("bNull");
    const a = await verify(b, { clientKey: ck() }), w = await verify(b, { phone: "0899999998", clientKey: ck() });
    ERR(a, "VERIFY_FAILED", "เบอร์เดิมของผู้จองที่ถูกลบ"); ERR(w, "VERIFY_FAILED", "เบอร์อื่น");
    eq(Object.keys(a).sort(), Object.keys(w).sort(), "รูปผลเท่ากัน");
  });
  await st("V-6", "nonce: ไม่มี ⇒ INVALID[nonce] · วัตถุประสงค์อื่น (cancel) ⇒ INVALID · ผูก token อื่น ⇒ INVALID · nonce ถือที่ของ W1.2 ⇒ INVALID · ออกพร้อมส่ง ⇒ TOO_FAST · เกิน 2 ชม. ⇒ STALE_FORM", async () => {
    needSelf(); const [b, b2] = needBk("bV", "bV2");
    const inv = async (nonce: unknown, what: string) => { const r = await verify(b, { nonce, clientKey: ck() }); ok(r.ok === false && r.code === "INVALID" && Array.isArray(r.fields) && (r.fields as unknown[]).includes("nonce"), `${what}: ${fmt(r)}`); };
    await inv("", "ไม่มี nonce");
    await inv(snonce(b, "cancel", 0), "nonce ของ cancel");
    await inv(snonce(b2, "verify", 0), "nonce ของการจองอื่น");
    await inv(bfn("issueBookFormNonce")({ now: N0.now, scope: { tenantId: tA, purpose: "hold" } }), "nonce ถือที่ W1.2");
    ERR(await verify(b, { nonce: snonce(b, "verify", VMS), clientKey: ck() }), "TOO_FAST", "ออกพร้อมส่ง");
    ERR(await verify(b, { nonce: snonce(b, "verify", VMS - 7_300_000), clientKey: ck() }), "STALE_FORM", "เกิน 2 ชม.");
  });
  await st("V-7", "เบอร์ผิดรูป (ตัวอักษร · สั้น · ยาวเกิน) ⇒ INVALID[phone] · ไม่สะท้อนค่า", async () => {
    needSelf(); const [b] = needBk("bV");
    for (const p of ["abc", "0812", "0".repeat(40)]) {
      const r = await verify(b, { phone: p, clientKey: ck() });
      ok(r.ok === false && r.code === "INVALID" && Array.isArray(r.fields) && (r.fields as unknown[]).includes("phone"), `${p}: ${fmt(r)}`);
      ok(!JSON.stringify(r).includes(p), "สะท้อนค่า");
    }
  });
  await st("V-8", `grant หมดอายุ ${GRANT_TTL_MIN} นาที: ใช้ที่ +${GRANT_TTL_MIN - 1} นาที ⇒ ผ่าน (quote ยกเลิก) · +${GRANT_TTL_MIN + 1} นาที ⇒ VERIFY_REQUIRED`, async () => {
    needSelf(); const [b] = needBk("bV");
    const g = await grantOf(b);
    const r1 = await cancelQ(b, g, at(VMS + (GRANT_TTL_MIN - 1) * MIN));
    ok(r1.ok === true, `ก่อนหมด: ${fmt(r1)}`);
    ERR(await cancelQ(b, g, at(VMS + (GRANT_TTL_MIN + 1) * MIN)), "VERIFY_REQUIRED", "หลังหมด");
  });
  await st("V-9", "grant ผูก IP (K7): เครื่อง/IP อื่นถือ grant เดียวกัน ⇒ VERIFY_REQUIRED", async () => {
    needSelf(); const [b] = needBk("bV");
    const g = await grantOf(b);
    ERR(await cancelQ(b, g, ACT, { clientKey: ck() }), "VERIFY_REQUIRED", "IP อื่น");
  });
  await st("V-10", "grant ปลอม (แก้ 1 ตัว · ขยายเวลาหมด · รูปผิด) ⇒ VERIFY_REQUIRED รูปเดียว", async () => {
    needSelf(); const [b] = needBk("bV");
    const g = await grantOf(b);
    const flip = g.slice(0, -1) + (g.endsWith("A") ? "B" : "A");
    const far = g.replace(/^g1\.(\d+)\./, (_m, s: string) => `g1.${Number(s) + 86_400}.`);
    for (const x of [flip, far, "g1", `g1.${Math.floor(ACT.now.getTime() / 1000) + 600}.${"A".repeat(22)}`]) ERR(await cancelQ(b, x, ACT), "VERIFY_REQUIRED", `grant ${x.slice(0, 20)}…`);
  });
  await st("V-11", "ผู้ถือลิงก์อย่างเดียว (ไม่มี grant) ⇒ VERIFY_REQUIRED ทั้ง quote และยกเลิก · ไม่มีการเขียน", async () => {
    needSelf(); const [b] = needBk("bV");
    const v0 = await bRow(b.id);
    ERR(await cancelQ(b, undefined), "VERIFY_REQUIRED", "quote ยกเลิก");
    ERR(await cancelX(b, undefined, ONE), "VERIFY_REQUIRED", "ยกเลิก");
    const v1 = await bRow(b.id);
    eq([v1.version, (await refunds(b.id)).length], [v0.version, 0], "ไม่เปลี่ยน");
  });
  groupLine("V");

  // ═══════════════ M. ก้อนจัดการบนหน้าการจอง ═══════════════
  console.log("\n── M: ก้อนจัดการบนหน้าการจอง (openBookReservation vm.manage · K8 · K10) ──");
  await st("M-1", "จ่ายแล้ว 45 วัน ⇒ manage {cancel:REFUND_REQUEST, block:null, refund:null}", async () => {
    const [b] = needBk("b45");
    eq(await manageOf(b), { cancel: "REFUND_REQUEST", block: null, refund: null }, "manage");
  });
  await st("M-2", "ยังไม่จ่าย (HOLD) ⇒ {cancel:UNPAID, block:null, refund:null}", async () => {
    const [b] = needBk("bHold");
    eq(await manageOf(b), { cancel: "UNPAID", block: null, refund: null }, "manage");
  });
  await st("M-3", "K10 เอเจนซี่ (collectMode AGENT · channel AGENT_LINK — ทะเบียนช่องทางไม่มีค่า AGENT ตรง ๆ) ⇒ {cancel:null, block:AGENT} · ยืนยันเบอร์ ⇒ NOT_ALLOWED{AGENT}", async () => {
    const [a, c] = needBk("bAgent", "bChan");
    for (const b of [a, c]) eq(await manageOf(b), { cancel: null, block: "AGENT", refund: null }, `manage ${b.tag}`);
    needSelf();
    for (const b of [a, c]) BLOCKED(await verify(b), "AGENT", `ยืนยันเบอร์ ${b.tag}`);
  });
  await st("M-4", "หลังรอบออกเดินทางแล้ว (นาฬิกา 10 มี.ค. 09:00) ⇒ {null, STARTED} · ยืนยันเบอร์ ⇒ NOT_ALLOWED{STARTED}", async () => {
    const [b] = needBk("b9");
    const T9 = { now: BKK("2027-03-10", "09:00") };
    eq(await manageOf(b, T9), { cancel: null, block: "STARTED", refund: null }, "manage");
    needSelf();
    BLOCKED(await verify(b, { when: T9 }), "STARTED", "ยืนยันเบอร์หลังออกเดินทาง");
  });
  await st("M-5", "K10 ที่ถือหมดตามนาฬิกา (ตัวกวาดยังไม่วิ่ง · +16 นาที) ⇒ หน้า EXPIRED · manage {null, ENDED} · ยืนยันเบอร์ ⇒ NOT_ALLOWED{ENDED}", async () => {
    const [b] = needBk("bExp");
    const T = at(16 * MIN);
    const r = await openRes(b, T);
    eq([r.ok, asRec(r.vm)?.state, asRec(r.vm)?.manage], [true, "EXPIRED", { cancel: null, block: "ENDED", refund: null }], "หน้า/manage");
    needSelf();
    BLOCKED(await verify(b, { when: T }), "ENDED", "ยืนยันเบอร์");
  });
  await st("M-6", "K10 PENDING ⇒ ไม่มีก้อนจัดการ (หน้า PENDING ของ W1.2 คงเดิม) · ยืนยันเบอร์ ⇒ NOT_ALLOWED{PENDING}", async () => {
    const [b] = needBk("bPend");
    const r = await openRes(b);
    ok(r.ok === false && r.code === "UNAVAILABLE" && r.reason === "PENDING" && !("manage" in r), `หน้า PENDING: ${fmt(r)}`);
    needSelf();
    BLOCKED(await verify(b), "PENDING", "ยืนยันเบอร์");
  });
  await st("M-7", "K10 CONFIRMED ยังไม่จ่าย ⇒ manage {cancel:CANCEL_REQUEST} · quote kind CANCEL_REQUEST จ่าย 0 คืน 0 · ยื่น ⇒ result CANCEL_REQUESTED คำขอ QUOTED ยอด 0", async () => {
    const [b] = needBk("bConf");
    eq(await manageOf(b), { cancel: "CANCEL_REQUEST", block: null, refund: null }, "manage");
    needSelf();
    const g = await grantOf(b);
    const vm = asRec((await cancelQ(b, g)).vm) ?? {};
    eq([vm.kind, vm.paidSatang, vm.refundSatang], ["CANCEL_REQUEST", 0, 0], "quote");
    const r = await cancelX(b, g, 0);
    eq([r.ok, r.result, r.refundSatang], [true, "CANCEL_REQUESTED", 0], "ผล");
    eq((await refunds(b.id)).map((x) => [x.status, x.amountSatang, x.by]), [["QUOTED", 0, "CUSTOMER"]], "คำขอ");
  });
  groupLine("M");

  // ═══════════════ CN. ยกเลิก/คำขอคืนเงิน ═══════════════
  console.log("\n── CN: ยกเลิก (ก่อนจ่าย = ทันที · จ่ายแล้ว = คำขอคืนเงินตาม snapshot) + สถานะคำขอ ──");
  await st("CN-1", `quote 19 วันก่อนเดินทาง: REFUND_REQUEST · จ่าย ${TOTAL} · คืน ${REFUND50} · เก็บ ${KEPT50} · 50% · daysBefore 19 · มี form.nonce · ไม่มีคีย์ภายใน`, async () => {
    needSelf(); const [b] = needBk("b19");
    const r = await cancelQ(b, await grantOf(b));
    ok(r.ok === true, `quote: ${fmt(r)}`);
    const vm = asRec(r.vm) ?? {};
    eq([vm.kind, vm.paidSatang, vm.refundSatang, vm.keptSatang, vm.refundPct, vm.daysBefore], ["REFUND_REQUEST", TOTAL, REFUND50, KEPT50, 50, 19], "vm");
    ok(typeof asRec(vm.form)?.nonce === "string", "ไม่มี form.nonce");
    noInternal(vm, [b.id, b.dep], "vm ยกเลิก", [b.phone]);
  });
  await st("CN-2", `quote 45 วัน: คืน ${TOTAL} เก็บ 0 (100%) · 9 วัน: คืน ${PT} (ค่าอุทยาน) เก็บ ${NONPT} (0%)`, async () => {
    needSelf(); const [b45, b9] = needBk("b45", "b9");
    const a = asRec((await cancelQ(b45, await grantOf(b45))).vm) ?? {};
    eq([a.kind, a.refundSatang, a.keptSatang, a.refundPct], ["REFUND_REQUEST", TOTAL, 0, 100], "45 วัน");
    const c = asRec((await cancelQ(b9, await grantOf(b9))).vm) ?? {};
    eq([c.kind, c.refundSatang, c.keptSatang, c.refundPct], ["REFUND_REQUEST", PT, NONPT, 0], "9 วัน");
  });
  await st("CN-3", "ยอดที่เห็นไม่ตรง (seen ต่าง 1 บาท) ⇒ AMOUNT_CHANGED{refundSatang = ยอดจริง} · ไม่ติ๊กยอมรับ ⇒ ACCEPT_REQUIRED · ไม่มีคำขอ", async () => {
    needSelf(); const [b] = needBk("b19");
    const g = await grantOf(b);
    const r = await cancelX(b, g, REFUND50 - 100);
    ok(r.ok === false && r.code === "AMOUNT_CHANGED" && r.refundSatang === REFUND50, `seen ผิด: ${fmt(r)}`);
    ERR(await cancelX(b, g, REFUND50, { accept: "" }), "ACCEPT_REQUIRED", "ไม่ยอมรับ");
    eq((await refunds(b.id)).length, 0, "ไม่มีคำขอ");
  });
  await st("CN-4", `ยื่นยกเลิกการจองที่จ่ายแล้ว (19 วัน · seen ${REFUND50}) ⇒ REFUND_REQUESTED · คำขอ 1 แถว QUOTED (K4 แม้ร้านตั้งอนุมัติอัตโนมัติ) · CUSTOMER · MONEY · by CUSTOMER · audit K3 · การจองยัง PAID · ที่นั่งไม่ปล่อย (OQ22)`, async () => {
    needSelf(); const [b] = needBk("b19");
    const d0 = await depRow(b.dep);
    G.b19 = await grantOf(b);
    const r = await cancelX(b, G.b19, REFUND50);
    eq([r.ok, r.result, r.refundSatang, r.replayed], [true, "REFUND_REQUESTED", REFUND50, false], "ผล");
    const rr = await refunds(b.id);
    eq(rr.map((x) => [x.status, x.amountSatang, x.reasonKind, x.choice, x.by]), [["QUOTED", REFUND50, "CUSTOMER", "MONEY", "CUSTOMER"]], "คำขอคืนเงิน");
    k3(await auditsOf(rr[0]?.id ?? ""), "trips.refund.request", "audit คำขอ", b);
    const row = await bRow(b.id), d1 = await depRow(b.dep);
    eq([row.status, row.paidSatang, d1.sold, d1.held], ["PAID", TOTAL, d0.sold, d0.held], "การจอง/ที่นั่ง");
  });
  await st("CN-5", "หลังยื่น: หน้าแสดง refund {QUOTED, ยอด, mine:true} + block REFUND_IN_PROGRESS · ยืนยันเบอร์ใหม่ ⇒ NOT_ALLOWED{REFUND_IN_PROGRESS} · grant เดิม + ฟอร์มใหม่ ⇒ DONE{refund} · ยังมี 1 แถว", async () => {
    needSelf(); const [b] = needBk("b19");
    eq(await manageOf(b), { cancel: null, block: "REFUND_IN_PROGRESS", refund: { status: "QUOTED", amountSatang: REFUND50, mine: true } }, "manage");
    BLOCKED(await verify(b, { clientKey: ck() }), "REFUND_IN_PROGRESS", "ยืนยันเบอร์ขณะคำขอเปิด");
    const g = G.b19 ?? "";
    ok(g, "ไม่มี grant จาก CN-4");
    const r = await cancelX(b, g, REFUND50);
    ok(r.ok === false && r.code === "DONE" && isDeepStrictEqual(r.refund, { status: "QUOTED", amountSatang: REFUND50, mine: true }), `ยื่นซ้ำ: ${fmt(r)}`);
    eq((await refunds(b.id)).length, 1, "คำขอยัง 1 แถว");
  });
  await st("CN-6", "ยกเลิกการจองที่ยังไม่จ่าย (HOLD): quote UNPAID คืน 0 · ยกเลิก (seen 0) ⇒ CANCELLED ทันที · ที่ถือคืนรอบ (held 0) · ไม่มีคำขอ · audit K3 · หน้า = CANCELLED · ยืนยันซ้ำ ⇒ NOT_ALLOWED{ENDED}", async () => {
    needSelf(); const [b] = needBk("bHold");
    const g = await grantOf(b);
    const qv = asRec((await cancelQ(b, g)).vm) ?? {};
    eq([qv.kind, qv.paidSatang, qv.refundSatang], ["UNPAID", 0, 0], "quote");
    eq((await depRow(b.dep)).held, b.seats, "ก่อนยกเลิก held = ที่นั่งของการจอง");
    const r = await cancelX(b, g, 0);
    eq([r.ok, r.result, r.refundSatang], [true, "CANCELLED", 0], "ผล");
    eq([(await bRow(b.id)).status, (await depRow(b.dep)).held, (await refunds(b.id)).length], ["CANCELLED", 0, 0], "หลังยกเลิก");
    k3(await auditsOf(b.id), "trips.booking.cancel", "audit ยกเลิก", b);
    eq(asRec((await openRes(b)).vm)?.state, "CANCELLED", "หน้าการจอง");
    BLOCKED(await verify(b, { clientKey: ck() }), "ENDED", "ยืนยันหลังยกเลิก");
  });
  await st("CN-7", "ร้านแก้ตารางยกเลิกหลังจอง (0% ทุกขั้น) ⇒ การจองเดิมยังคิดจาก snapshot: 45 วันคืนเต็ม (ข้อบังคับข้ามใบ ข)", async () => {
    needSelf(); const [b] = needBk("b45");
    await setV(tA, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: PRD.A?.id, value: [{ fromDaysBefore: 0, refundPct: 0 }] }]);
    const vm = asRec((await cancelQ(b, await grantOf(b))).vm) ?? {};
    eq([vm.refundSatang, vm.refundPct], [TOTAL, 100], "ยังคืนตาม snapshot");
  });
  await st("CN-8", "K8 ร้านปฏิเสธคำขอ (decideTripRefund REJECT) ⇒ หน้า refund {REJECTED, mine:true} + block REFUND_REJECTED · ยืนยันเบอร์ ⇒ NOT_ALLOWED{REFUND_REJECTED} · grant เดิม + ฟอร์มใหม่ ⇒ NOT_ALLOWED{REFUND_REJECTED} · ยื่นใหม่ไม่ได้ (ยัง 1 แถว)", async () => {
    needSelf(); const [b] = needBk("bRej");
    const g = await grantOf(b);
    const r = await cancelX(b, g, REFUND50);
    ok(r.ok === true, `ยื่น: ${fmt(r)}`);
    const rq = (await refunds(b.id))[0];
    const d = await tcall("decideTripRefund", staffCtx(tA, ACT), { requestId: rq?.id, decision: "REJECT", reason: "ร้านปฏิเสธ (ทดสอบ)", idempotencyKey: `w13rej_${hex(6)}` });
    ok(d.ok === true, `decideTripRefund REJECT: ${fmt(d)}`);
    eq(await manageOf(b), { cancel: null, block: "REFUND_REJECTED", refund: { status: "REJECTED", amountSatang: REFUND50, mine: true } }, "manage");
    BLOCKED(await verify(b, { clientKey: ck() }), "REFUND_REJECTED", "ยืนยันเบอร์หลังถูกปฏิเสธ");
    BLOCKED(await cancelX(b, g, REFUND50), "REFUND_REJECTED", "ยื่นใหม่ด้วย grant เดิม");
    eq((await refunds(b.id)).length, 1, "ยัง 1 แถว");
  });
  await st("CN-9", "K8 คำขอที่ร้านยื่นเอง (STAFF · อนุมัติอัตโนมัติ) ⇒ หน้า refund {APPROVED, mine:false} + block REFUND_IN_PROGRESS (ข้อความกลาง ไม่ใช่ \"คุณยื่นแล้ว\")", async () => {
    const [b] = needBk("bStaffReq");
    const v = (await bRow(b.id)).version;
    const r = await tcall("requestTripRefund", staffCtx(tA, ACT), { bookingId: b.id, expectedVersion: v, reasonKind: "CUSTOMER", choice: "MONEY", reason: "ลูกค้าโทรมาแจ้ง", idempotencyKey: `w13sr_${hex(6)}` });
    ok(r.ok === true, `requestTripRefund STAFF: ${fmt(r)}`);
    eq(await manageOf(b), { cancel: null, block: "REFUND_IN_PROGRESS", refund: { status: "APPROVED", amountSatang: REFUND50, mine: false } }, "manage");
  });
  groupLine("CN");

  // ═══════════════ RL. ด่านอัตรา ═══════════════
  console.log("\n── RL: ด่านอัตรา (คำสั่งเดียว · ปิดเมื่อพัง · K6) ──");
  await st("RL-1", "ด่านล่ม (deps.query โยน) ⇒ RATE_LIMITED LIMITER_DOWN ทุกฟังก์ชัน · ไม่มี grant/คำขอ/การเปลี่ยน", async () => {
    needSelf(); const [b] = needBk("bRL5");
    const down = { now: ACT.now, deps: { query: async () => { throw new Error("down"); } } };
    const v0 = await bRow(b.id);
    for (const [name, input] of [
      ["verifyBookSelf", { shop: b.shop, token: b.token, form: { phone: b.phone, nonce: snonce(b, "verify", 60_000) }, clientKey: b.ck }],
      ["quoteBookSelfCancel", { shop: b.shop, token: b.token, grant: "g1.1.x", clientKey: b.ck }],
      ["cancelBookSelf", { shop: b.shop, token: b.token, grant: "g1.1.x", form: { seen: String(ONE), accept: "on", nonce: snonce(b, "cancel", 60_000) }, clientKey: b.ck }],
    ] as const) {
      const r = await call(name, input, down);
      // ORACLE-EDIT RL-1 (มติ L9): ตัวนับล่ม ⇒ ให้ลองใหม่ พร้อม shopSlug (หน้า redirect กลับได้ · ไม่ใช่ 404)
      ok(r.ok === false && r.code === "RATE_LIMITED" && r.reason === "LIMITER_DOWN" && r.shopSlug === b.shop, `${name}: ${fmt(r)}`);
    }
    const v1 = await bRow(b.id);
    eq([v1.version, (await refunds(b.id)).length], [v0.version, 0], "ไม่เปลี่ยน");
  });
  await st("RL-2", "กุญแจเครื่องผิดรูป ⇒ RATE_LIMITED NO_CLIENT (ทุกฟังก์ชัน · ไม่ถามฐาน)", async () => {
    needSelf(); const [b] = needBk("bRL5");
    for (const name of SSVC_FNS.slice(1)) {
      const r = await call(name, { shop: b.shop, token: b.token, grant: "x", form: { phone: b.phone, nonce: "x", seen: "0", accept: "on" }, clientKey: "1.2.3.4" }, ACT);
      ok(r.ok === false && r.code === "RATE_LIMITED" && r.reason === "NO_CLIENT", `${name}: ${fmt(r)}`);
    }
  });
  await st("RL-3", `ถังเครื่อง X8 ${X8_VERIFY} ครั้ง/15 นาที: ลองผิด ${X8_VERIFY} ครั้งแล้วเบอร์ถูก (เครื่องเดิม) ⇒ RATE_LIMITED LIMIT · พ้น 15 นาที ⇒ ผ่าน`, async () => {
    needSelf(); const [b] = needBk("bRL3");
    for (let i = 0; i < X8_VERIFY; i++) ERR(await verify(b, { phone: "0899999990" }), "VERIFY_FAILED", `ลองผิดครั้งที่ ${i + 1}`);
    const r = await verify(b);
    ok(r.ok === false && r.code === "RATE_LIMITED" && r.reason === "LIMIT", `ครั้งที่ ${X8_VERIFY + 1}: ${fmt(r)}`);
    const later = await verify(b, { when: at(VMS + 16 * MIN) });
    ok(later.ok === true, `หลัง 16 นาที: ${fmt(later)}`);
  });
  await st("RL-4", `K6 ถังการจองนับเฉพาะครั้งที่ผิด: ${WRONG_LIMIT} เครื่องลองผิดคนละครั้ง ⇒ เครื่องที่ ${WRONG_LIMIT + 1} เบอร์ถูก ⇒ RATE_LIMITED LOCKED + ช่องทางติดต่อร้าน (X30) · พ้น 24 ชม. ⇒ ผ่าน · คีย์ถัง = trips:verifyb:<ร้าน>:<sha256(tokenHash) 24> ไม่มีเบอร์/token`, async () => {
    needSelf(); const [b] = needBk("bRL4");
    for (let i = 0; i < WRONG_LIMIT; i++) ERR(await verify(b, { phone: "0899999991", clientKey: ck() }), "VERIFY_FAILED", `เครื่อง ${i + 1}`);
    const r = await verify(b, { clientKey: ck() });
    ok(r.ok === false && r.code === "RATE_LIMITED" && r.reason === "LOCKED", `เครื่องที่ ${WRONG_LIMIT + 1}: ${fmt(r)}`);
    eq(asRec(r.contact), { phone: SHOP_CONTACT.phone, line: SHOP_CONTACT.line }, "ช่องทางติดต่อร้านในผลล็อก");
    ok(!JSON.stringify(r).includes(b.phone), "ผลล็อกมีเบอร์ผู้จอง");
    const later = await verify(b, { clientKey: ck(), when: at(VMS + 24 * HOUR + MIN) });
    ok(later.ok === true, `หลัง 24 ชม.: ${fmt(later)}`);
    const keys = (await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1 OR key LIKE $2`, [`trips:verify:${tA}:%`, `trips:verifyb:${tA}:%`])).map((x) => x.key);
    ok(keys.includes(lockKeyOf(b)), `ไม่พบถังการจองตามรูปคีย์ในใบสั่ง (${lockKeyOf(b).slice(0, 40)}…)`);
    const leak = keys.filter((k) => Object.values(BK).some((x) => k.includes(x.phone) || k.includes(x.phone.slice(1)) || k.includes(x.token) || k.includes(sha256hex(x.token))));
    ok(leak.length === 0, `คีย์ถังมีเบอร์/token: ${leak.slice(0, 2).join(" | ")}`);
  });
  await st("RL-5", "K6 ยืนยันถูกไม่กินถังการจอง: 30 เครื่องยืนยันถูกคนละครั้ง ⇒ ผ่านทั้ง 30 · จากนั้นเบอร์ผิด 1 ครั้ง ⇒ VERIFY_FAILED (ไม่ใช่ LOCKED) · เบอร์ผิดรูป (INVALID) 6 ครั้งจากเครื่องเดียวไม่กินโควตา", async () => {
    needSelf(); const [b, c] = needBk("bRL4b", "bRL5");
    for (let i = 0; i < 30; i++) { const r = await verify(b, { clientKey: ck() }); ok(r.ok === true, `ยืนยันถูกครั้งที่ ${i + 1}: ${fmt(r)}`); }
    ERR(await verify(b, { phone: "0899999992", clientKey: ck() }), "VERIFY_FAILED", "ผิดหลัง 30 ครั้งถูก");
    for (let i = 0; i < X8_VERIFY + 1; i++) { const r = await verify(c, { phone: "abc" }); ok(r.ok === false && r.code === "INVALID", `ผิดรูป ${i + 1}: ${fmt(r)}`); }
    ok((await verify(c)).ok === true, "เบอร์ถูกหลังผิดรูป");
  });
  groupLine("RL");

  // ═══════════════ X1. ข้ามร้าน/ข้ามการจอง ═══════════════
  console.log("\n── X1: ข้ามร้าน/ข้ามการจอง ──");
  await st("X1-1", "token ร้าน A ที่ URL ร้าน B ⇒ NOT_FOUND รูปเดียว (ยืนยัน/quote/ยกเลิก) · ไม่มีการเปลี่ยน", async () => {
    needSelf(); const [b] = needBk("bX1");
    const g = await grantOf(b);
    const v0 = await bRow(b.id);
    ERR(await verify(b, { shop: SB, clientKey: ck() }), "NOT_FOUND", "ยืนยัน");
    for (const [name, extra] of [["quoteBookSelfCancel", {}], ["cancelBookSelf", { form: { seen: String(ONE), accept: "on", nonce: snonce(b, "cancel", 60_000) } }]] as const) {
      const r = await call(name, { shop: SB, token: b.token, grant: g, clientKey: b.ck, ...extra }, ACT);
      eq([r.ok, r.code], [false, "NOT_FOUND"], name);
    }
    const v1 = await bRow(b.id);
    eq([v1.version, (await refunds(b.id)).length], [v0.version, 0], "ไม่เปลี่ยน");
  });
  await st("X1-2", "grant ของการจองหนึ่งใช้กับอีกการจอง (ร้านเดียวกัน IP เดียวกัน) ⇒ VERIFY_REQUIRED · grant ร้าน B ใช้กับการจองร้าน A ⇒ VERIFY_REQUIRED · ร้าน B ใช้ของตัวเองได้", async () => {
    needSelf(); const [a, a2, bb] = needBk("bX1", "bV2", "bB");
    const g = await grantOf(a);
    ERR(await cancelQ(a2, g, ACT, { clientKey: a.ck }), "VERIFY_REQUIRED", "grant ของ bX1 กับ bV2");
    const gb = await grantOf(bb);
    ERR(await cancelQ(a, gb, ACT, { clientKey: bb.ck }), "VERIFY_REQUIRED", "grant ร้าน B กับการจองร้าน A");
    const ok2 = await cancelQ(bb, gb);
    ok(ok2.ok === true && asRec(ok2.vm)?.refundSatang === ONE, `ร้าน B ของตัวเอง (45 วัน คืนเต็ม ${ONE}): ${fmt(ok2)}`);
  });
  groupLine("X1");

  // ═══════════════ X3. ยิงพร้อมกัน ═══════════════
  console.log("\n── X3: ยิงพร้อมกัน ≥ 10 ──");
  await st("X3-1", "ยกเลิกการจองที่จ่ายแล้ว 10 แท็บพร้อมกัน (nonce ต่างกัน) ⇒ คำขอคืนเงิน 1 แถวพอดี (ยอด ฿6,475.00) · ผลอื่น = DONE/STATE_CHANGED/BUSY ไม่มี THROW · การจองยัง PAID", async () => {
    needSelf(); const [b] = needBk("b19r");
    const g = await grantOf(b);
    const forms = await qforms(b, g, 10); // ORACLE-EDIT X3-1 (มติ L1): ฟอร์มจาก quote
    const rs = await Promise.all(forms.map((f) => cancelX(b, g, REFUND50, { form: f })));
    eq((await refunds(b.id)).map((x) => [x.status, x.amountSatang]), [["QUOTED", REFUND50]], "คำขอ 1 แถว");
    ok(rs.filter((r) => r.ok === true).length >= 1, `ไม่มีตัวที่สำเร็จ: ${fmt(rs.map((r) => r.code ?? r.ok))}`);
    const bad = rs.filter((r) => r.ok !== true && !["DONE", "STATE_CHANGED", "BUSY"].includes(String(r.code)));
    ok(bad.length === 0, `ผลไม่คาด: ${fmt(bad.slice(0, 2))}`);
    eq((await bRow(b.id)).status, "PAID", "การจองยัง PAID");
  });
  await st("X3-2", "ยกเลิก 10 ฟอร์ม (การจองยังไม่จ่าย) พร้อมกับร้านรับเงิน 1 ครั้ง ⇒ ไม่มีสภาพ CANCELLED ที่มีเงินเข้า · ที่นั่งรอบสอดคล้อง (PAID ⇒ sold 3 held 0 · CANCELLED ⇒ 0/0)", async () => {
    needSelf(); const [b] = needBk("bRace");
    const g = await grantOf(b);
    const forms = await qforms(b, g, 10); // ORACLE-EDIT X3-2 (มติ L1): ฟอร์มจาก quote (UNPAID ฿0)
    const [pay, ...rs] = await Promise.all([
      tcall("recordTripPayment", staffCtx(tA, ACT), { bookingId: b.id, amountSatang: TOTAL, tender: "PROMPTPAY", idempotencyKey: `w13race_${hex(8)}` }),
      ...forms.map((f) => cancelX(b, g, 0, { form: f })),
    ]);
    // ORACLE-EDIT X3-2 (มติ L1): ลูกค้าเห็น "ยกเลิกทันที ฿0" ⇒ ห้ามมีคำขอคืนเงินเกิด · ผลที่ ok ต้องเป็นยอดที่เห็น (0) และเป็นการยกเลิก
    eq((await refunds(b.id)).length, 0, "ไม่มีคำขอคืนเงินจากฟอร์ม UNPAID");
    ok(rs.filter((r) => r.ok === true).every((r) => r.refundSatang === 0 && r.result === "CANCELLED"), `ผล ok ที่ไม่ตรงสิ่งที่เห็น: ${fmt(rs.filter((r) => r.ok === true))}`);
    const row = await bRow(b.id), d = await depRow(b.dep);
    ok(!(row.status === "CANCELLED" && row.paidSatang > 0), `CANCELLED แต่มีเงิน ${row.paidSatang}`);
    ok(["CANCELLED", "PAID"].includes(row.status), `สถานะ ${row.status}`);
    if (row.status === "PAID") eq([d.sold, d.held, pay?.ok], [3, 0, true], "PAID");
    else eq([d.sold, d.held, pay?.ok], [0, 0, false], "CANCELLED");
    ok(rs.every((r) => r.ok === true || ["STATE_CHANGED", "NOT_ALLOWED", "BUSY", "DONE", "AMOUNT_CHANGED"].includes(String(r.code))), `ผลไม่คาด: ${fmt(rs.filter((r) => r.ok !== true).map((r) => r.code))}`);
  });
  groupLine("X3");

  // ═══════════════ X4. ส่งซ้ำ ═══════════════
  console.log("\n── X4: ส่งซ้ำ (ฟอร์มเดิม · K5) ──");
  await st("X4-1", "ส่งฟอร์มยกเลิกเดิมซ้ำ (การจองที่จ่ายแล้ว) ⇒ ครั้งที่ 2 ok replayed true ยอดเดิม (ไม่ติดด่าน REFUND_IN_PROGRESS) · คำขอ 1 แถว", async () => {
    needSelf(); const [b] = needBk("b19rep");
    const g = await grantOf(b);
    const [n] = await qforms(b, g, 1); // ORACLE-EDIT X4-1 (มติ L1): ฟอร์มเดียวกันจาก quote ส่งซ้ำ
    const r1 = await cancelX(b, g, REFUND50, { form: n }), r2 = await cancelX(b, g, REFUND50, { form: n });
    eq([r1.ok, r1.replayed, r2.ok, r2.replayed, r2.refundSatang, r2.result], [true, false, true, true, REFUND50, "REFUND_REQUESTED"], "ผล");
    eq((await refunds(b.id)).length, 1, "คำขอ 1 แถว");
  });
  await st("X4-2", "ส่งฟอร์มยกเลิกการจองยังไม่จ่ายซ้ำ ⇒ ครั้งที่ 2 ok replayed true (ไม่ติดด่าน ENDED) · CANCELLED ครั้งเดียว · held ไม่ติดลบ", async () => {
    needSelf(); const [b] = needBk("bHold2");
    const g = await grantOf(b);
    const [n] = await qforms(b, g, 1); // ORACLE-EDIT X4-2 (มติ L1)
    const r1 = await cancelX(b, g, 0, { form: n }), r2 = await cancelX(b, g, 0, { form: n });
    eq([r1.ok, r1.result, r2.ok, r2.replayed, r2.result], [true, "CANCELLED", true, true, "CANCELLED"], "ผล");
    const d = await depRow(b.dep);
    eq([(await bRow(b.id)).status, d.held, d.sold], ["CANCELLED", 0, 0], "รอบ");
  });
  groupLine("X4");

  // ═══════════════ X6. อินพุตอันตราย ═══════════════
  console.log("\n── X6: อินพุตอันตราย ──");
  await st("X6-1", "เบอร์อันตราย (อักขระควบคุม · SQL · ยาว 5,000 · อาร์เรย์/อ็อบเจกต์) ⇒ INVALID/VERIFY_FAILED ไม่ throw ไม่ผ่าน ไม่สะท้อน", async () => {
    needSelf(); const [b] = needBk("bX6");
    for (const p of [`${b.phone}\u0000`, "' OR 1=1 --", "x".repeat(5_000), [b.phone], { v: b.phone }, `${b.phone}‮`, null, 812345678]) {
      const r = await verify(b, { phone: p, clientKey: ck() });
      ok(r.ok === false && ["INVALID", "VERIFY_FAILED"].includes(String(r.code)), `${fmt(p).slice(0, 30)}: ${fmt(r)}`);
      ok(typeof p !== "string" || p.length < 6 || !JSON.stringify(r).includes(p.slice(0, 12)), "สะท้อนค่า");
    }
  });
  await st("X6-2", "grant/nonce อันตราย (ยาว 5,000 · null · ตัวเลข · อ็อบเจกต์ · unicode) ⇒ VERIFY_REQUIRED/INVALID ไม่ throw", async () => {
    needSelf(); const [b] = needBk("bX6");
    for (const g of ["g1." + "9".repeat(5_000), null, 12, { g: 1 }, "g1.१२३.AAAAAAAAAAAAAAAAAAAAAA"]) ERR(await cancelQ(b, g), "VERIFY_REQUIRED", `grant ${fmt(g).slice(0, 20)}`);
    for (const n of ["x".repeat(5_000), null, 1, ["a"]]) { const r = await verify(b, { nonce: n, clientKey: ck() }); ok(r.ok === false && r.code === "INVALID", `nonce ${fmt(n).slice(0, 20)}: ${fmt(r)}`); }
  });
  await st("X6-3", "seen ผิดรูป (-1 · 1e5 · 01 · 4100.00 · ช่องว่าง · ว่าง · 99999999999) ⇒ INVALID[seen] · ไม่มีคำขอ", async () => {
    needSelf(); const [b] = needBk("bX6");
    const g = await grantOf(b);
    for (const s of ["-1", "1e5", "01", "4100.00", " 410000", "", "99999999999"]) {
      const r = await cancelX(b, g, s);
      ok(r.ok === false && r.code === "INVALID" && Array.isArray(r.fields) && (r.fields as unknown[]).includes("seen"), `seen ${JSON.stringify(s)}: ${fmt(r)}`);
    }
    eq((await refunds(b.id)).length, 0, "ไม่มีคำขอ");
  });
  await st("X6-4", "token อันตราย (../ · unicode · 5,000 ตัว · ว่าง) ⇒ NOT_FOUND · form ไม่ใช่อ็อบเจกต์/มี __proto__ ⇒ INVALID ไม่ throw", async () => {
    needSelf(); const [b] = needBk("bX6");
    for (const t of ["../../etc", "ก".repeat(43), "A".repeat(5_000), ""]) ERR(await verify(b, { token: t, clientKey: ck() }), "NOT_FOUND", `token ${t.slice(0, 10)}`);
    for (const form of [null, "phone=1", [1], JSON.parse(`{"__proto__":{"phone":"${b.phone}"},"nonce":"x"}`)]) {
      const r = await call("verifyBookSelf", { shop: b.shop, token: b.token, form, clientKey: ck() }, VNOW);
      ok(r.ok === false && r.code === "INVALID", `form ${fmt(form)}: ${fmt(r)}`);
    }
  });
  groupLine("X6");

  // ═══════════════ ORACLE-EDIT DEV (ผู้คุม 19 พ.ย.): ข้อเพิ่มเพื่อพิสูจน์ส่วนที่ builder ทำต่างจากที่ใบเขียน (r1) — audit ผ่านผู้กระทำ SYSTEM job trips.public.self (K3) ·
  //   ปล่อยที่ถือของ HOLD ด้วยผู้กระทำ SYSTEM ของรั้ว · ตรวจ tokenHash ใต้ล็อกหลัง CAS · grant 15 นาทีพอดี (K7) · ฟอร์มที่เปิดตอน HOLD แต่การจองกลายเป็น CONFIRMED ยังไม่จ่าย · outbox ของเส้นลูกค้า
  console.log("\n── DEV: ส่วนที่ builder ทำต่างจากใบ (K3 · K7 · รั้วหลัง CAS · ฟอร์มค้าง) ──");
  type AFull = { id: string; action: string; actorType: string; actorId: string | null; targetId: string; after: Rec | null };
  const auditCount = async () => Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1`, [tA]))[0]?.n ?? 0);
  const auditIds = async () => new Set((await q<{ id: string }>(`SELECT id FROM "AuditLog" WHERE "tenantId" = $1`, [tA])).map((r) => r.id));
  const auditNew = async (before: Set<string>) => (await q<AFull>(`SELECT id, action, "actorType"::text AS "actorType", "actorId", "targetId", "after" FROM "AuditLog" WHERE "tenantId" = $1`, [tA])).filter((r) => !before.has(r.id));
  const outboxIds = async () => new Set((await q<{ id: string }>(`SELECT id FROM "OutboxEvent" WHERE "tenantId" = $1`, [tA])).map((r) => r.id));
  const outboxNew = async (before: Set<string>) => (await q<{ id: string; type: string; payload: unknown }>(`SELECT id, type, payload FROM "OutboxEvent" WHERE "tenantId" = $1`, [tA])).filter((r) => !before.has(r.id));
  const holdsOf = async (bookingId: string) => q<{ id: string; status: string; releasedReason: string | null; qty: number }>(`SELECT id, status, "releasedReason", ("qtyPublic" + "qtyAllot")::int AS qty FROM "TripHold" WHERE "bookingId" = $1 ORDER BY id`, [bookingId]);
  const OB: Record<string, string[]> = {};
  await st("DEV-1", "K3 (เส้น W1.2 ไม่เปลี่ยน): จองผ่านเว็บปกติ (startBookHold → confirmBookHold · PUBLIC) ไม่มีแถว audit ใหม่ที่เป็น SYSTEM / trips.public.self / after.by PUBLIC — ผู้กระทำ PUBLIC ไม่เขียน audit (เหมือน BASE)", async () => {
    needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const before = await auditIds(); const n0 = await auditCount();
    const b = await mkBooking("bDevWeb", "gen", "A", { adults: 1 });
    const rows = await auditNew(before);
    const bad = rows.filter((r) => r.actorType === "SYSTEM" || r.actorId === PUBLIC_ACTOR_ID || asRec(r.after)?.by === "PUBLIC");
    ok(bad.length === 0, `จองเว็บปกติเขียน audit ผู้กระทำระบบ/ลูกค้า: ${fmt(bad.map((r) => [r.action, r.actorType, r.actorId]))}`);
    eq([await auditCount() - n0, rows.length], [0, 0], `แถว audit ใหม่จากการจองเว็บ ${b.tag} (PUBLIC ไม่เขียน audit) ${fmt(rows.map((r) => r.action))}`);
  });
  await st("DEV-2", "ยกเลิก HOLD ผ่านหน้า (cancelBookSelf): ที่นั่งคืนพอดี (held −ที่นั่งของการจอง · sold ไม่เปลี่ยน) · hold ของการจองทุกแถว RELEASED เหตุ BOOKING_CANCELLED · การจอง CANCELLED", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("devh", "A", "2027-04-29");
    const b = await mkBooking("bDevHold", "devh", "A", FULL);
    const d0 = await depRow(b.dep);
    eq([d0.held, d0.sold], [b.seats, 0], "ก่อน");
    const h0 = await holdsOf(b.id);
    ok(h0.length >= 1 && h0.every((h) => h.status === "ACTIVE"), `hold ก่อนยกเลิก: ${fmt(h0)}`);
    const g = await grantOf(b);
    const aBefore = await auditIds(), oBefore = await outboxIds();
    const r = await cancelX(b, g, 0);
    eq([r.ok, r.result], [true, "CANCELLED"], `ผล ${fmt(r)}`);
    const d1 = await depRow(b.dep);
    eq([d0.held - d1.held, d1.sold], [b.seats, d0.sold], "ที่นั่งคืนพอดี");
    eq((await holdsOf(b.id)).map((h) => [h.status, h.releasedReason]), h0.map(() => ["RELEASED", "BOOKING_CANCELLED"]), "hold");
    eq((await bRow(b.id)).status, "CANCELLED", "การจอง");
    G.devHoldAudit = JSON.stringify((await auditNew(aBefore)).map((x) => ({ action: x.action, actorType: x.actorType, actorId: x.actorId, by: asRec(x.after)?.by ?? null, targetId: x.targetId })));
    OB.unpaidCancel = (await outboxNew(oBefore)).map((x) => x.type).sort();
    console.log(`     outbox ของการยกเลิก HOLD ผ่านหน้า: ${OB.unpaidCancel.join(", ") || "ไม่มี"}`);
  });
  await st("DEV-3", "K3 ทุกแถว audit ที่เส้นลูกค้าเขียน (ยกเลิก HOLD ของ DEV-2 · รวมการปล่อย hold) = actorType SYSTEM · actorId trips.public.self · after.by PUBLIC · ไม่มีเบอร์/กุญแจเครื่อง/token", async () => {
    const [b] = needBk("bDevHold");
    const rows = JSON.parse(G.devHoldAudit ?? "[]") as { action: string; actorType: string; actorId: string | null; by: unknown; targetId: string }[];
    ok(rows.length >= 1, "ไม่มีแถว audit จากการยกเลิก (DEV-2 ไม่ได้ทำ)");
    const bad = rows.filter((x) => x.actorType !== "SYSTEM" || x.actorId !== PUBLIC_ACTOR_ID || x.by !== "PUBLIC");
    ok(bad.length === 0, `แถวที่ไม่เป็นรูป K3: ${fmt(bad)}`);
    const blob = JSON.stringify((await q<{ a: unknown }>(`SELECT "after" AS a FROM "AuditLog" WHERE "tenantId" = $1 AND "actorId" = $2`, [tA, PUBLIC_ACTOR_ID])).map((x) => x.a));
    ok(!blob.includes(b.phone) && !blob.includes(b.ck) && !blob.includes(b.token), "audit มีเบอร์/กุญแจเครื่อง/token");
  });
  await st("DEV-4", "K2 รั้วหลัง CAS: ยกเลิก HOLD (บริการตรง · publicSelf ถูกตอนเริ่ม) ขณะที่ token ของแถวถูกเปลี่ยนก่อนธุรกรรมยกเลิกถึงแถว ⇒ FORBIDDEN · ไม่มีการเขียนเลย (hold ACTIVE · held เดิม · การจอง HOLD รุ่นเดิม · ไม่มี audit/outbox ยกเลิก)", async () => {
    needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("devr", "A", "2027-04-30");
    const b = await mkBooking("bDevRace", "devr", "A", { adults: 2 });
    const reason = selfReason();
    const v0 = await bRow(b.id), d0 = await depRow(b.dep), h0 = await holdsOf(b.id);
    const aBefore = await auditIds(), oBefore = await outboxIds();
    const lockC = await pool.connect();
    let r: Rec = {};
    let sawWait = false;
    try {
      await lockC.query("BEGIN");
      await lockC.query(`SELECT 1 FROM "TripBooking" WHERE id = $1 FOR UPDATE`, [b.id]);
      const p = tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason, reasonKind: "CUSTOMER", idempotencyKey: `w13dev_${hex(6)}` }, await psOf(b));
      for (let i = 0; i < 100 && !sawWait; i++) {
        await new Promise((res) => setTimeout(res, 150));
        sawWait = Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_locks l JOIN pg_class c ON c.oid = l.relation WHERE NOT l.granted AND c.relname = 'TripBooking'`))[0]?.n ?? 0) > 0
          || Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted AND locktype = 'transactionid'`))[0]?.n ?? 0) > 0;
      }
      await lockC.query(`UPDATE "TripBooking" SET "publicTokenHash" = $2 WHERE id = $1`, [b.id, sha256hex(`w13-other-${hex(4)}`)]);
      await lockC.query("COMMIT");
      r = await p;
    } finally {
      lockC.release();
      await pool.query(`UPDATE "TripBooking" SET "publicTokenHash" = $2 WHERE id = $1`, [b.id, sha256hex(b.token)]);
    }
    ok(sawWait, `ไม่เห็นธุรกรรมยกเลิกรอล็อกแถวการจอง (ทดสอบเส้นหลัง CAS ไม่ได้) · ผล ${fmt(r)}`);
    eq([r.ok, r.code], [false, "FORBIDDEN"], `ผล ${fmt(r)}`);
    const v1 = await bRow(b.id), d1 = await depRow(b.dep);
    eq([v1.status, v1.version, d1.held, d1.sold], [v0.status, v0.version, d0.held, d0.sold], "การจอง/รอบไม่เปลี่ยน");
    eq((await holdsOf(b.id)).map((h) => h.status), h0.map((h) => h.status), "hold ยัง ACTIVE");
    eq([(await auditNew(aBefore)).map((x) => x.action), (await outboxNew(oBefore)).map((x) => x.type)], [[], []], "ไม่มี audit/outbox ใหม่");
  });
  await st("DEV-5", "K7 grant 15 นาทีพอดี (นาฬิกาที่ส่ง): ใช้ที่ +14:59 ⇒ ผ่าน · +15:01 ⇒ VERIFY_REQUIRED · กุญแจเครื่องอื่นที่ +14:59 ⇒ VERIFY_REQUIRED", async () => {
    needSelf(); const [b] = needBk("bV");
    const g = await grantOf(b);
    const r1 = await cancelQ(b, g, at(VMS + GRANT_TTL_MIN * MIN - 1_000));
    ok(r1.ok === true, `+14:59: ${fmt(r1)}`);
    ERR(await cancelQ(b, g, at(VMS + GRANT_TTL_MIN * MIN + 1_000)), "VERIFY_REQUIRED", "+15:01");
    ERR(await cancelQ(b, g, at(VMS + GRANT_TTL_MIN * MIN - 1_000), { clientKey: ck() }), "VERIFY_REQUIRED", "กุญแจเครื่องอื่น +14:59");
  });
  await st("DEV-6", "ORACLE-EDIT DEV-6 (มติ L1 ง · แทนการรับสองทางเดิม): ฟอร์มที่เปิดตอน HOLD (UNPAID ฿0) แต่การจองกลายเป็น CONFIRMED ยังไม่จ่ายก่อนกด ⇒ ชนิดไม่ตรงที่เห็น ⇒ ปฏิเสธ (STATE_CHANGED/AMOUNT_CHANGED) · ไม่ยื่นคำขอ · ไม่ยกเลิก · การจองยัง CONFIRMED", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("devc", "A", "2027-05-01");
    const b = await mkBooking("bDevConf", "devc", "A", { adults: 1 });
    const g = await grantOf(b);
    const qv = await cancelQ(b, g);
    const vm = asRec(qv.vm) ?? {};
    eq([qv.ok, vm.kind, vm.refundSatang], [true, "UNPAID", 0], "ฟอร์มตอน HOLD");
    const form = { ...(asRec(vm.form) ?? {}) };
    // ฟิกซ์เจอร์: การจองกลายเป็น CONFIRMED ยังไม่จ่าย (hold แปลงเป็นที่ขาย) — ทดสอบปฏิกิริยาของหน้า ไม่ใช่เส้นเปลี่ยนสถานะ
    await pool.query(`UPDATE "TripHold" SET status = 'CONVERTED' WHERE "bookingId" = $1 AND status = 'ACTIVE'`, [b.id]);
    await pool.query(`UPDATE "TripDeparture" SET held = held - $2, sold = sold + $2 WHERE id = $1`, [b.dep, b.seats]);
    await pool.query(`UPDATE "TripBooking" SET status = 'CONFIRMED', version = version + 1 WHERE id = $1`, [b.id]);
    const r = await cancelX(b, g, 0, { form, when: at(240_000) });
    const row = await bRow(b.id), rq = await refunds(b.id);
    ok(r.ok === false && ["STATE_CHANGED", "AMOUNT_CHANGED"].includes(String(r.code)), `ชนิดที่เห็น (UNPAID) ≠ ตอนนี้ (CANCEL_REQUEST) ต้องปฏิเสธ: ${fmt(r)}`);
    eq([row.status, rq.length], ["CONFIRMED", 0], "ไม่ยกเลิก ไม่ยื่นคำขอ");
  });
  await st("DEV-7", "outbox ของเส้นลูกค้า: ยื่นคำขอคืนเงิน (จ่ายแล้ว) เขียน trips.refund.requested · payload ไม่มีเบอร์/token/กุญแจเครื่อง (รายการชนิดพิมพ์ไว้ให้ผู้คุม)", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bDevRq", "d45", "A", { adults: 1 }, { pay: true });
    const g = await grantOf(b);
    // ยอดที่เห็น = ยอดจาก quote ของหน้า (CN-7 ตั้งตารางยกเลิกของสินค้า A เป็น 0% ก่อนการจองนี้เกิด ⇒ snapshot ของการจองนี้คืนเฉพาะค่าอุทยาน) — ข้อนี้ตรวจ outbox ไม่ใช่ยอด
    const seen = Number(asRec((await cancelQ(b, g)).vm)?.refundSatang);
    ok(Number.isSafeInteger(seen) && seen > 0, `quote: ${seen}`);
    const oBefore = await outboxIds();
    const r = await cancelX(b, g, seen);
    eq([r.ok, r.result], [true, "REFUND_REQUESTED"], `ผล ${fmt(r)}`);
    const rows = await outboxNew(oBefore);
    OB.refundRequest = rows.map((x) => x.type).sort();
    console.log(`     outbox ของคำขอคืนเงินผ่านหน้า: ${OB.refundRequest.join(", ") || "ไม่มี"}`);
    ok(OB.refundRequest.includes("trips.refund.requested"), `ไม่มี trips.refund.requested: ${fmt(OB.refundRequest)}`);
    const blob = JSON.stringify(rows.map((x) => x.payload)) + JSON.stringify((await q<{ p: unknown }>(`SELECT payload AS p FROM "OutboxEvent" WHERE "tenantId" = $1`, [tA])).map((x) => x.p));
    const leak = Object.values(BK).filter((x) => blob.includes(x.phone) || blob.includes(x.token) || blob.includes(x.ck));
    ok(leak.length === 0, `payload มีเบอร์/token/กุญแจเครื่อง: ${leak.map((x) => x.tag).slice(0, 3).join(",")}`);
  });
  groupLine("DEV");

  // ═══════════════ L. มติผู้คุมรอบ 2 (L1–L10 · ledger/trips-briefs/W1.3.md ท้ายไฟล์ · ข้อความ ledger/wo-notes/trips-W1.3a.md) — ผู้เขียนข้อสอบ 19 พ.ย. ═══════════════
  //   ผลที่ถูกต้องก่อนงานรอบ 2 ของ builder: ข้อส่วนใหญ่แดงด้วยเหตุของมติ (ดูข้อความต่อข้อ)
  console.log("\n── L1: ผูกสิ่งที่ลูกค้าเห็นกับสิ่งที่ยื่น ──");
  const staffQuote = async (tenant: string, bookingId: string, when: { now: Date }) => {
    const r = await tcall("cancelTripBooking", staffCtx(tenant, when), { bookingId, mode: "QUOTE", reason: "oracle", idempotencyKey: `w13sq_${hex(6)}` });
    return Number(asRec(asRec(r.value)?.computed)?.refundSatang);
  };
  const quoteVm = async (b: Bk, g: string, when = ACT): Promise<Rec> => { const r = await cancelQ(b, g, when); ok(r.ok === true, `quote ${b.tag}: ${fmt(r)}`); return asRec(r.vm) ?? {}; };
  await st("L1-1", "เปิดฟอร์มตอน HOLD (UNPAID ฿0) → ร้านรับเงินเต็ม → ลูกค้ากดส่งฟอร์มเดิม ⇒ ปฏิเสธ (STATE_CHANGED/AMOUNT_CHANGED พร้อมยอดใหม่) · ไม่มีคำขอคืนเงิน · ไม่ยกเลิก", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("l1a", "A", "2027-05-02");
    const b = await mkBooking("bL1a", "l1a", "A", { adults: 1 });
    const g = await grantOf(b);
    const vm = await quoteVm(b, g);
    eq([vm.kind, vm.refundSatang], ["UNPAID", 0], "ฟอร์มตอน HOLD");
    const pay = await tcall("recordTripPayment", staffCtx(tA, at(180_000)), { bookingId: b.id, amountSatang: b.total, tender: "PROMPTPAY", idempotencyKey: `w13l1a_${hex(8)}` });
    ok(pay.ok === true, `ร้านรับเงิน: ${fmt(pay)}`);
    const r = await cancelX(b, g, 0, { form: asRec(vm.form) ?? {}, when: at(240_000) });
    const row = await bRow(b.id);
    ok(r.ok === false && ["STATE_CHANGED", "AMOUNT_CHANGED"].includes(String(r.code)), `ต้องปฏิเสธ: ${fmt(r)}`);
    if (r.code === "AMOUNT_CHANGED") eq(r.refundSatang, await staffQuote(tA, b.id, at(240_000)), "ยอดใหม่ใน AMOUNT_CHANGED = ยอด QUOTE ของบริการตอนนี้");
    eq([(await refunds(b.id)).length, row.status], [0, "PAID"], "ไม่มีคำขอ · ไม่ยกเลิก");
  });
  await st("L1-2", "PART_PAID เห็นยอดคืน X → ร้านรับเงินงวดเพิ่ม → ส่งฟอร์มเดิม ⇒ ไม่มีคำขอที่ยอด ≠ X (ปฏิเสธพร้อมยอดใหม่ หรือยื่นที่ X พอดี)", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("l1b", "B", "2027-04-16");
    const b = await mkBooking("bL1b", "l1b", "B", { adults: 2 });
    const part = Math.floor(b.total / 4);
    const p1 = await tcall("recordTripPayment", staffCtx(tB, AFTER), { bookingId: b.id, amountSatang: part, tender: "PROMPTPAY", idempotencyKey: `w13l1b_${hex(8)}` });
    ok(p1.ok === true && (await bRow(b.id)).status === "PART_PAID", `ฟิกซ์เจอร์ PART_PAID: ${fmt(p1)} · ${(await bRow(b.id)).status}`);
    const g = await grantOf(b);
    const vm = await quoteVm(b, g);
    const X = Number(vm.refundSatang);
    eq(vm.kind, "REFUND_REQUEST", "ชนิด");
    const p2 = await tcall("recordTripPayment", staffCtx(tB, at(180_000)), { bookingId: b.id, amountSatang: part, tender: "PROMPTPAY", idempotencyKey: `w13l1b_${hex(8)}` });
    ok(p2.ok === true, `งวดที่ 2: ${fmt(p2)}`);
    const r = await cancelX(b, g, X, { form: asRec(vm.form) ?? {}, when: at(240_000) });
    const rq = await refunds(b.id);
    ok(rq.every((x) => x.amountSatang === X), `มีคำขอยอด ≠ ที่เห็น (${X}): ${fmt(rq)}`);
    if (r.ok === true) eq([r.refundSatang, rq.length], [X, 1], "ยื่นที่ยอดที่เห็น");
    else { ok(["STATE_CHANGED", "AMOUNT_CHANGED"].includes(String(r.code)), `ผล: ${fmt(r)}`); eq(rq.length, 0, "ปฏิเสธ ⇒ ไม่มีคำขอ"); }
  });
  await st("L1-3", "บริการ: publicSelf.expectedVersion เก่า ⇒ STATE_CONFLICT ไม่มีการเขียน — ยกเลิก HOLD · ยื่นคำขอ (cancelTripBooking) · requestTripRefund", async () => {
    needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const reason = selfReason();
    await mkDep("l1c", "A", "2027-05-03");
    const bh = await mkBooking("bL1ch", "l1c", "A", { adults: 1 });
    const bp = await mkBooking("bL1cp", "gen", "A", { adults: 1 }, { pay: true });
    for (const b of [bh, bp]) {
      const v0 = await bRow(b.id), d0 = await depRow(b.dep), h0 = await holdsOf(b.id);
      const r = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason, reasonKind: "CUSTOMER", ...(b === bp ? { choice: "MONEY" } : {}), idempotencyKey: `w13l1c_${hex(6)}` }, publicSelfOf(b, v0.version - 1));
      eq([r.ok, r.code], [false, "STATE_CONFLICT"], `cancel ${b.tag} รุ่นเก่า (${fmt(r)})`);
      await noWrite(b, v0, `L1-3 ${b.tag}`);
      eq([(await depRow(b.dep)).held, (await holdsOf(b.id)).map((h) => h.status)], [d0.held, h0.map((h) => h.status)], `ที่ถือ ${b.tag}`);
    }
    const v = (await bRow(bp.id)).version;
    const rq = await tcall("requestTripRefund", pubCtx(), { bookingId: bp.id, expectedVersion: v, reasonKind: "CUSTOMER", choice: "MONEY", reason, idempotencyKey: `w13l1c_${hex(6)}` }, publicSelfOf(bp, v - 1));
    eq([rq.ok, rq.code], [false, "STATE_CONFLICT"], `requestTripRefund publicSelf รุ่นเก่า (${fmt(rq)})`);
    eq((await refunds(bp.id)).length, 0, "ไม่มีคำขอ");
  });
  groupLine("L1");

  console.log("\n── L2: เพดานลองผิดต่อการจอง atomic ──");
  const lockCount = async (b: Bk) => Number((await q<{ c: number }>(`SELECT "count" AS c FROM "ChatRateBucket" WHERE key = $1`, [lockKeyOf(b)]))[0]?.c ?? 0);
  await st("L2-1", `ยิงเบอร์ผิดพร้อมกัน 50 ทาง (กุญแจเครื่องต่างกัน) ⇒ เทียบเบอร์ไม่เกิน ${WRONG_LIMIT} ครั้ง (VERIFY_FAILED ≤ ${WRONG_LIMIT} · ที่เหลือ RATE_LIMITED LOCKED · ถังการจอง ≤ ${WRONG_LIMIT}) · จากนั้นเบอร์ถูก ⇒ LOCKED`, async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bL2", "gen", "A", { adults: 1 }, { pay: true });
    const rs = await Promise.all(Array.from({ length: 50 }, () => verify(b, { phone: "0899999993", clientKey: ck() })));
    const failed = rs.filter((r) => r.code === "VERIFY_FAILED").length, locked = rs.filter((r) => r.code === "RATE_LIMITED" && r.reason === "LOCKED").length;
    ok(failed <= WRONG_LIMIT, `เทียบเบอร์ ${failed} ครั้ง (> ${WRONG_LIMIT})`);
    eq(failed + locked, 50, `ผลอื่น: ${fmt(rs.filter((r) => r.code !== "VERIFY_FAILED" && !(r.code === "RATE_LIMITED" && r.reason === "LOCKED")).slice(0, 2))}`);
    const c = await lockCount(b);
    ok(c <= WRONG_LIMIT, `ถังการจอง ${c} (> ${WRONG_LIMIT})`);
    const r = await verify(b, { clientKey: ck() });
    ok(r.ok === false && r.code === "RATE_LIMITED" && r.reason === "LOCKED", `เบอร์ถูกหลังล็อก: ${fmt(r)}`);
  });
  await st("L2-2", "เบอร์ถูก 10 ∥ เบอร์ผิด 10 พร้อมกัน ⇒ เบอร์ถูกผ่านทั้งหมด · ถังการจอง = จำนวน VERIFY_FAILED พอดี (ไม่ติดลบ · เบอร์ถูกไม่กิน) · เบอร์ถูกอีก 25 ครั้งไม่ขยับถัง", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bL2b", "gen", "A", { adults: 1 }, { pay: true });
    const jobs: Promise<Rec>[] = [];
    for (let i = 0; i < 10; i++) { jobs.push(verify(b, { phone: "0899999994", clientKey: ck() })); jobs.push(verify(b, { clientKey: ck() })); }
    const rs = await Promise.all(jobs);
    const wrong = rs.filter((_, i) => i % 2 === 0), right = rs.filter((_, i) => i % 2 === 1);
    ok(right.every((r) => r.ok === true), `เบอร์ถูกไม่ผ่าน: ${fmt(right.filter((r) => r.ok !== true).slice(0, 2))}`);
    const failed = wrong.filter((r) => r.code === "VERIFY_FAILED").length;
    const c0 = await lockCount(b);
    eq([c0 >= 0, c0], [true, failed], "ถังการจอง = จำนวนครั้งที่ผิด");
    for (let i = 0; i < 25; i++) { const r = await verify(b, { clientKey: ck() }); ok(r.ok === true, `เบอร์ถูกครั้งที่ ${i + 1}: ${fmt(r)}`); }
    eq(await lockCount(b), c0, "เบอร์ถูกไม่กินถัง");
  });
  groupLine("L2");

  console.log("\n── L3: K8 ที่บริการ ──");
  const fileViaPage = async (b: Bk): Promise<Rec> => {
    const g = await grantOf(b);
    const vm = await quoteVm(b, g);
    const r = await cancelX(b, g, Number(vm.refundSatang), { form: asRec(vm.form) ?? {}, when: at(180_000) }); // ส่งหลัง quote (ACT) 1 นาที
    ok(r.ok === true, `ยื่นผ่านหน้า ${b.tag}: ${fmt(r)}`);
    return r;
  };
  const customerRows = async (bookingId: string) => (await refunds(bookingId)).filter((x) => x.by === "CUSTOMER");
  await st("L3-1", "คำขอล่าสุดของลูกค้าถูกร้านปฏิเสธ ⇒ บริการปฏิเสธ publicSelf เอง (เรียกตรง ข้ามด่านหน้า): cancelTripBooking EXECUTE และ requestTripRefund ⇒ FORBIDDEN · ยังมีคำขอ 1 แถว", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bL3", "gen", "A", { adults: 1 }, { pay: true });
    await fileViaPage(b);
    const rq = (await refunds(b.id))[0];
    const d = await tcall("decideTripRefund", staffCtx(tA, ACT), { requestId: rq?.id, decision: "REJECT", reason: "ร้านปฏิเสธ (ทดสอบ L3)", idempotencyKey: `w13l3_${hex(6)}` });
    ok(d.ok === true, `ร้านปฏิเสธ: ${fmt(d)}`);
    const reason = selfReason();
    const x = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason, reasonKind: "CUSTOMER", choice: "MONEY", idempotencyKey: `w13l3_${hex(6)}` }, await psOf(b));
    eq([x.ok, x.code], [false, "FORBIDDEN"], `cancel หลังถูกปฏิเสธ (${fmt(x)})`);
    const v = (await bRow(b.id)).version;
    const y = await tcall("requestTripRefund", pubCtx(), { bookingId: b.id, expectedVersion: v, reasonKind: "CUSTOMER", choice: "MONEY", reason, idempotencyKey: `w13l3_${hex(6)}` }, await psOf(b));
    eq([y.ok, y.code], [false, "FORBIDDEN"], `requestTripRefund หลังถูกปฏิเสธ (${fmt(y)})`);
    eq((await refunds(b.id)).length, 1, "ยัง 1 แถว");
  });
  await st("L3-2", "ร้านปฏิเสธคำขอของลูกค้า ∥ ลูกค้ายื่นซ้ำ 5 ทาง (บริการตรง · publicSelf) ⇒ คำขอของลูกค้ามี 1 แถวเสมอ (ไม่มีคำขอใหม่หลังถูกปฏิเสธ)", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bL3r", "gen", "A", { adults: 1 }, { pay: true });
    await fileViaPage(b);
    const rq = (await refunds(b.id))[0];
    const reason = selfReason();
    const ps = await psOf(b);
    const rs = await Promise.all([
      tcall("decideTripRefund", staffCtx(tA, ACT), { requestId: rq?.id, decision: "REJECT", reason: "ร้านปฏิเสธ (ทดสอบ L3 แข่ง)", idempotencyKey: `w13l3r_${hex(6)}` }),
      ...Array.from({ length: 5 }, () => tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason, reasonKind: "CUSTOMER", choice: "MONEY", idempotencyKey: `w13l3r_${hex(6)}` }, ps)),
    ]);
    ok(rs[0]?.ok === true, `ร้านปฏิเสธ: ${fmt(rs[0])}`);
    ok(rs.every((r) => r.ok !== "THROW"), `THROW: ${fmt(rs.filter((r) => r.ok === "THROW"))}`);
    eq((await customerRows(b.id)).length, 1, "คำขอของลูกค้า");
    const after = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason, reasonKind: "CUSTOMER", choice: "MONEY", idempotencyKey: `w13l3r_${hex(6)}` }, await psOf(b));
    eq([after.ok, after.code, (await customerRows(b.id)).length], [false, "FORBIDDEN", 1], "หลังแข่ง");
  });
  const BSC = await tryImport("@/components/book/BookSelf");
  const unent = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const html = (name: string, props: Rec): string => {
    const C = BSC.mod?.[name];
    ok(typeof C === "function", `โหลด ${name} จาก components/book/BookSelf ไม่ได้ (${BSC.err.slice(0, 80)})`);
    return renderToStaticMarkup(createElement(C as never, props as never));
  };
  const text = (name: string, props: Rec) => unent(html(name, props));
  const NOOP = async () => {};
  const tpl = (lang: "th" | "en", k: string, vars: Rec = {}) => String((lang === "th" ? th : en)[k] ?? "").replace(/\{(\w+)\}/g, (m, v: string) => (v in vars ? String(vars[v]) : m));
  const head = (v: string) => v.split("{")[0]?.trim() ?? "";
  await st("L3-3", "คำขอที่ร้านยื่นเองแล้วร้านปฏิเสธ (ร้าน B) ⇒ ไม่ปิดสิทธิ์ลูกค้า: manage {cancel REFUND_REQUEST · block null · refund REJECTED mine:false} · จอแสดง self.refund.byShopRejected (ไม่ใช่ self.refund.REJECTED) · ลูกค้ายื่นของตัวเองได้ (QUOTED by CUSTOMER)", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bL3s", "b1", "B", { adults: 1 }, { pay: true });
    const v = (await bRow(b.id)).version;
    const s1 = await tcall("requestTripRefund", staffCtx(tB, ACT), { bookingId: b.id, expectedVersion: v, reasonKind: "CUSTOMER", choice: "MONEY", reason: "ร้านยื่นแทนลูกค้า", idempotencyKey: `w13l3s_${hex(6)}` });
    ok(s1.ok === true && asRec(s1.value)?.status === "QUOTED", `ร้านยื่น: ${fmt(s1)}`);
    const d = await tcall("decideTripRefund", staffCtx(tB, ACT), { requestId: asRec(s1.value)?.id ?? (await refunds(b.id))[0]?.id, decision: "REJECT", reason: "ร้านปิดคำขอ", idempotencyKey: `w13l3s_${hex(6)}` });
    ok(d.ok === true, `ร้านปฏิเสธ: ${fmt(d)}`);
    const o = await openRes(b);
    const vm = asRec(o.vm) ?? {};
    const m = asRec(vm.manage) ?? {};
    eq([m.cancel, m.block, asRec(m.refund)?.status, asRec(m.refund)?.mine], ["REFUND_REQUEST", null, "REJECTED", false], "manage");
    const t = text("BookSelfManage", { manage: m, shop: vm.shop, code: vm.code, locale: "th", cancelHref: "#", done: null, state: vm.state });
    ok(head(String(th["self.refund.byShopRejected"] ?? "")) && t.includes(head(String(th["self.refund.byShopRejected"] ?? ""))), `จอไม่มีข้อความกลาง byShopRejected: ${t.slice(0, 200)}`);
    ok(!t.includes(head(String(th["self.refund.REJECTED"] ?? "∅"))), `จอใช้ข้อความ "ไม่อนุมัติคำขอของคุณ": ${t.slice(0, 200)}`);
    await fileViaPage(b);
    eq((await customerRows(b.id)).map((x) => x.status), ["QUOTED"], "ลูกค้ายื่นของตัวเองได้");
  });
  groupLine("L3");

  console.log("\n── L4: เทียบเบอร์ด้วยตัว normalise ของ Party ──");
  await st("L4-1", "ร้านพิมพ์เบอร์ผู้จอง 0066812345678 ⇒ ยืนยันด้วย 0812345678 · +66812345678 · 081-234-5678 ได้ · 0812345679 ⇒ VERIFY_FAILED", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkConfirmed("bL4", "gen", "0066812345678");
    for (const p of ["0812345678", "+66812345678", "081-234-5678"]) { const r = await verify(b, { phone: p, clientKey: ck() }); ok(r.ok === true && typeof r.grant === "string", `${p}: ${fmt(r)}`); }
    ERR(await verify(b, { phone: "0812345679", clientKey: ck() }), "VERIFY_FAILED", "เบอร์ไม่ตรง");
  });
  groupLine("L4");

  console.log("\n── L6: มติ X1 ของ W1.1 (หน้าไม่แก้ร้านเอง) ──");
  const NONCE_RE = /^[A-Za-z0-9_-]{22}\.\d{1,12}\.[A-Za-z0-9_-]{22}$/;
  const stringsDeep = (v: unknown, skip: unknown, out: string[] = []): string[] => {
    if (v === skip) return out;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const x of v) stringsDeep(x, skip, out);
    else if (v !== null && typeof v === "object") for (const x of Object.values(v as Rec)) stringsDeep(x, skip, out);
    return out;
  };
  await st("L6-1", "page.tsx ของ my/[token] ไม่เรียก resolveBookShop และไม่ออก nonce เอง (issueSelfFormNonce)", () => {
    const sp = stripComments(read(PAGE_RES));
    ok(sp, "ไม่มีไฟล์หน้า");
    ok(!/resolveBookShop/.test(sp), "หน้าเรียก resolveBookShop (มติ X1)");
    ok(!/issueSelfFormNonce\s*\(/.test(sp), "หน้าออก nonce เอง (ต้องมาจากผลของตัวเปิดหน้า)");
  });
  await st("L6-2", "ผลของ openBookReservation มี nonce ฟอร์มยืนยันเบอร์ (นอก vm.manage) ที่ใช้ยืนยันได้จริง · vm.manage มี 3 คีย์ (block cancel refund)", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bL6", "gen", "A", { adults: 1 }, { pay: true });
    const o = await bcall("openBookReservation", { shop: b.shop, token: b.token, lang: "th", acceptLanguage: "th", clientKey: b.ck }, ACT);
    ok(o.ok === true, `เปิดหน้า: ${fmt(o)}`);
    const m = asRec(asRec(o.vm)?.manage);
    eq(Object.keys(m ?? {}).sort(), ["block", "cancel", "refund"], "คีย์ vm.manage");
    const ns = stringsDeep(o, m).filter((x) => NONCE_RE.test(x));
    ok(ns.length >= 1, "ผลของตัวเปิดหน้าไม่มี nonce ฟอร์มยืนยันเบอร์");
    const r = await verify(b, { nonce: ns[0], when: at(180_000) });
    ok(r.ok === true, `ยืนยันด้วย nonce จากตัวเปิดหน้า: ${fmt(r)}`);
  });
  await st("L6-3", "หน้ายกเลิก (เปิดหน้า + quote ด้วยกุญแจเครื่องเดียวกัน) กินถังอ่านครั้งเดียว", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bL6r", "gen", "A", { adults: 1 }, { pay: true });
    const g = await grantOf(b);
    const T = at(VMS + 10 * MIN); // หน้าต่างถังอ่านใหม่ (60 วิ) · grant ยังไม่หมด
    const o = await bcall("openBookReservation", { shop: b.shop, token: b.token, lang: "th", acceptLanguage: "th", clientKey: b.ck }, T);
    const qq = await cancelQ(b, g, T);
    ok(o.ok === true && qq.ok === true, `เปิดหน้า/quote: ${fmt([o.ok, qq])}`);
    const c = Number((await q<{ c: number }>(`SELECT "count" AS c FROM "ChatRateBucket" WHERE key = $1`, [`trips:book:${tA}:${b.ck}`]))[0]?.c ?? -1);
    eq(c, 1, "ถังอ่านต่อการเปิดหน้ายกเลิก");
  });
  groupLine("L6");

  console.log("\n── L7: ตัวเลขและข้อความบนจอ (เรนเดอร์ BookSelf* จริง) ──");
  const EXACT: [string, "th" | "en", string][] = [
    ["self.cancel.step", "th", "ยกเลิกก่อนวันเดินทาง {days} วัน · ค่าทัวร์คืน {pct}% ตามเงื่อนไขตอนจอง"],
    ["self.cancel.passThrough", "th", "เงินที่ร้านเก็บแทน (เช่น ค่าอุทยาน) คืนเต็มจำนวน"],
    ["self.cancel.passThrough", "en", "Fees the shop collected on others' behalf (e.g. park fees) are refunded in full"],
    ["self.cancel.today", "th", "วันนี้เป็นวันเดินทาง"], ["self.cancel.today", "en", "Today is the travel date"],
    ["self.cancel.requestNote", "th", "นี่เป็นคำขอ ร้านเป็นผู้พิจารณา ระหว่างรอ การจองของคุณยังมีผลอยู่"],
    ["self.cancel.requestNote", "en", "This is a request. The shop will review it; until then your booking stays active."],
    ["self.cancel.unpaidDone", "th", "ยกเลิกการจองแล้ว ที่นั่งถูกปล่อยคืน กรุณาอย่าโอนเงินสำหรับการจองนี้"],
    ["self.cancel.unpaidDone", "en", "Your booking is cancelled and the seats have been released. Please don't send any payment for it."],
    ["self.cancel.done", "en", "All set"],
    ["self.cancel.kept", "th", "ส่วนที่ไม่คืนตามเงื่อนไข"], ["self.cancel.kept", "en", "Non-refundable under your terms"],
    ["self.cancel.refund", "en", "Refund due"],
    ["self.cancel.requested", "en", "Refund request sent. The amount follows your booking terms; the shop will review it and send the refund. Questions? Contact {contact} (booking code {code})"],
    ["self.verify.title", "en", "Verify it's your booking"],
    ["self.verify.help", "th", "กรอกเบอร์โทรที่ใช้ตอนจอง หลังยืนยันคุณมีเวลาทำรายการ 15 นาที ถ้าเปลี่ยนเครือข่ายอาจต้องยืนยันใหม่"],
    ["self.verify.help", "en", "Enter the phone number used for the booking. You'll then have 15 minutes to make changes; switching networks may ask you to verify again."],
    ["self.verify.locked", "th", "พิมพ์เบอร์ไม่ตรงหลายครั้ง ลองใหม่ได้ภายใน 24 ชั่วโมง หรือติดต่อร้าน {contact} พร้อมรหัสการจอง {code}"],
    ["self.verify.locked", "en", "Too many wrong numbers. You can try again within 24 hours, or contact {contact} (booking code {code})."],
    ["self.err.AMOUNT_CHANGED", "th", "ยอดคืนเปลี่ยนไป (เช่น เลยกำหนดของขั้นก่อนหน้า หรือมีการบันทึกการชำระเงิน) ยอดใหม่อยู่ด้านล่าง ตรวจแล้วกดยืนยันอีกครั้ง"],
    ["self.err.AMOUNT_CHANGED", "en", "The refund amount has changed (for example, a cancellation deadline passed or a payment was recorded). Check the new amount below and confirm again."],
    ["self.err.INVALID_PHONE", "th", "กรอกเบอร์โทรให้ถูกต้อง"], ["self.err.INVALID_PHONE", "en", "Please enter a valid phone number"],
    ["self.err.INVALID", "en", "Something went wrong with the form — reload the page and try again"],
    ["self.refund.DONE", "th", "ร้านบันทึกว่าคืนเงิน {amount} แล้ว หากยังไม่ได้รับเงิน ติดต่อร้าน {contact} พร้อมรหัสการจอง {code}"],
    ["self.refund.DONE", "en", "The shop has marked a refund of {amount} as sent. If you haven't received it, contact {contact} (booking code {code})."],
    ["self.refund.byShopRejected", "th", "คำขอคืนเงินของการจองนี้ถูกปิดโดยร้าน หากมีคำถาม ติดต่อร้าน {contact}"],
    ["self.refund.byShopRejected", "en", "The shop closed a refund request for this booking. Questions? Contact {contact}."],
  ];
  await st("L7-1", `ข้อความตามรายการ L7 ญ (${EXACT.length} ค่า · ตรงตัวอักษร) · en cancel.legal อ้าง "2020 refund notice of Thailand's Tourism Business and Guide Committee"`, () => {
    const bad = EXACT.filter(([k, lang, v]) => (lang === "th" ? th : en)[k] !== v).map(([k, lang, v]) => `${lang}.${k}: ได้ ${fmt((lang === "th" ? th : en)[k])} ต้องเป็น ${fmt(v)}`);
    ok(bad.length === 0, `${bad.length} ค่าไม่ตรง: ${bad.slice(0, 3).join(" | ")}`);
    ok(/Your minimum rights are set by the 2020 refund notice of Thailand's Tourism Business and Guide Committee/.test(String(en["self.cancel.legal"] ?? "")), `en cancel.legal: ${fmt(en["self.cancel.legal"])}`);
  });
  const SHOP_SET = { name: "ร้านทดสอบ W13", contact: { phone: SHOP_CONTACT.phone, line: SHOP_CONTACT.line } };
  const SHOP_NONE = { name: "ร้านไร้ช่องทาง W13", contact: {} };
  const cancelText = (vm: Rec, locale: "th" | "en", shop: Rec = SHOP_SET) => text("BookSelfCancel", { vm, action: NOOP, shop, code: "TR-0000-0001", locale, error: null });
  const L7: Record<string, Rec> = {};
  const l7vm = async (key: string, mk: () => Promise<Bk>, kind: string): Promise<Rec> => {
    if (!L7[key]) { needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`); const b = await mk(); const vm = await quoteVm(b, await grantOf(b)); L7[key] = { vm, b }; }
    const vm = asRec(L7[key]?.vm) ?? {};
    eq(vm.kind, kind, `ชนิดของฟิกซ์เจอร์ ${key}`);
    return vm;
  };
  const vmRefund = () => l7vm("refund", async () => { await mkDep("bd19", "B", "2027-03-20"); return mkBooking("bL7p", "bd19", "B", FULL, { pay: true }); }, "REFUND_REQUEST");
  const vmUnpaid = () => l7vm("unpaid", async () => { await mkDep("l7u", "A", "2027-05-04"); return mkBooking("bL7u", "l7u", "A", { adults: 1 }); }, "UNPAID");
  const vmCancelReq = () => l7vm("creq", () => mkConfirmed("bL7c", "gen"), "CANCEL_REQUEST");
  await st("L7-2", `จอยกเลิก (ร้าน B · 19 วัน · ฿11,450 จ่ายครบ): "ค่าทัวร์คืน 50%" (ไม่มี "คืน 50%" ลอย) · บรรทัดเงินเก็บแทนแยกพร้อมยอดจริง ${PT / 100} บาท · en "50% of the trip price"`, async () => {
    const vm = await vmRefund();
    eq([vm.refundSatang, vm.refundPct], [REFUND50, 50], "ฟิกซ์เจอร์");
    const t = cancelText(vm, "th"), e = cancelText(vm, "en");
    const ptTxt = (PT / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
    ok(t.includes("ค่าทัวร์คืน 50%") && !t.split("ค่าทัวร์คืน 50%").join(" ").includes("คืน 50%"), `th เปอร์เซ็นต์: ${t.slice(0, 300)}`);
    ok(t.includes(String(th["self.cancel.passThrough"] ?? "∅")) && t.includes(ptTxt), `th ไม่มีบรรทัดเงินเก็บแทน + ยอด ${ptTxt}: ${t.slice(0, 300)}`);
    ok(e.includes("50% of the trip price") && e.includes(String(en["self.cancel.passThrough"] ?? "∅")) && e.includes(ptTxt), `en: ${e.slice(0, 300)}`);
  });
  await st("L7-3", "เปอร์เซ็นต์ไม่ปัดทิ้ง (12.5 ⇒ 12.5%) · วันเดินทางวันนี้ ⇒ ข้อความเฉพาะ ไม่ใช่ \"0 วัน\"/\"0 days\" · en 1 day / 2 days", async () => {
    const vm = await vmRefund();
    const t125 = cancelText({ ...vm, refundPct: 12.5 }, "th");
    ok(t125.includes("12.5%"), `12.5%: ${t125.slice(0, 200)}`);
    const t0 = cancelText({ ...vm, daysBefore: 0 }, "th"), e0 = cancelText({ ...vm, daysBefore: 0 }, "en");
    ok(t0.includes("วันนี้เป็นวันเดินทาง") && !/(^|\D)0 วัน/.test(t0), `th วันเดินทาง: ${t0.slice(0, 200)}`);
    ok(e0.includes("Today is the travel date") && !/(^|\D)0 days?/.test(e0), `en วันเดินทาง: ${e0.slice(0, 200)}`);
    const e1 = cancelText({ ...vm, daysBefore: 1 }, "en"), e2 = cancelText({ ...vm, daysBefore: 2 }, "en");
    ok(/(^|\D)1 day\b/.test(e1) && !/(^|\D)1 days/.test(e1), `en 1 day: ${e1.slice(0, 200)}`);
    ok(/(^|\D)2 days\b/.test(e2), `en 2 days: ${e2.slice(0, 200)}`);
  });
  await st("L7-4", "จอคำขอ (REFUND_REQUEST · CANCEL_REQUEST) บอก requestNote ก่อนปุ่ม · ช่องติ๊ก \"ยื่นคำขอ\" (th/en ตามรายการ) · จอ UNPAID ช่องติ๊ก \"ย้อนกลับไม่ได้\"", async () => {
    const ACC_REQ = { th: "ฉันต้องการยื่นคำขอยกเลิก และเข้าใจเงื่อนไขข้างต้น", en: "I want to request cancellation and understand the terms above" };
    const ACC_UNPAID = { th: "ฉันต้องการยกเลิกการจองนี้ และเข้าใจว่ายกเลิกแล้วย้อนกลับไม่ได้", en: "I want to cancel this booking and understand it can't be undone" };
    const bad: string[] = [];
    for (const [nm, vm] of [["REFUND_REQUEST", await vmRefund()], ["CANCEL_REQUEST", await vmCancelReq()]] as const) for (const lang of ["th", "en"] as const) {
      const t = cancelText(vm, lang), note = String((lang === "th" ? th : en)["self.cancel.requestNote"] ?? "∅");
      const iN = t.indexOf(note), iA = t.indexOf(ACC_REQ[lang]);
      if (iN < 0 || iA < 0 || iN > iA) bad.push(`${nm}/${lang} note@${iN} accept@${iA}: ${t.slice(0, 160)}`);
      if (t.includes(ACC_UNPAID[lang])) bad.push(`${nm}/${lang} ใช้ช่องติ๊กของ UNPAID`);
    }
    const vu = await vmUnpaid();
    for (const lang of ["th", "en"] as const) { const t = cancelText(vu, lang); if (!t.includes(ACC_UNPAID[lang])) bad.push(`UNPAID/${lang}: ${t.slice(0, 160)}`); if (t.includes(String((lang === "th" ? th : en)["self.cancel.requestNote"] ?? "∅"))) bad.push(`UNPAID/${lang} มี requestNote`); }
    eq(bad, [], "จอ");
  });
  const manageText = async (b: Bk, done: string | null, locale: "th" | "en" = "th", shop?: Rec) => {
    const o = await openRes(b);
    const vm = asRec(o.vm) ?? {};
    ok(o.ok === true, `เปิดหน้า ${b.tag}: ${fmt(o)}`);
    return { h: html("BookSelfManage", { manage: vm.manage, shop: shop ?? vm.shop, code: vm.code, locale, cancelHref: "#", done, state: vm.state }), vm };
  };
  await st("L7-5", "แบนเนอร์ \"ทำรายการแล้ว\" ของคำขอยอด 0 (CANCEL_REQUESTED) ขึ้น · REJECTED / REFUND_IN_PROGRESS / ยกเลิกเองแล้ว แสดงช่องทางติดต่อร้านครั้งเดียว", async () => {
    await vmCancelReq();
    const bc = L7.creq?.b as Bk;
    const g = await grantOf(bc);
    const vq = await quoteVm(bc, g);
    const rr = await cancelX(bc, g, 0, { form: asRec(vq.form) ?? {}, when: at(180_000) });
    ok(rr.ok === true && rr.result === "CANCEL_REQUESTED", `ยื่นคำขอยอด 0: ${fmt(rr)}`);
    ok((await manageText(bc, "CANCEL_REQUESTED")).h.includes('data-testid="book-cancel-done"'), "ไม่มีแบนเนอร์ทำรายการแล้วของคำขอยอด 0");
    const [rej, prog, canc] = needBk("bRej", "b19", "bHold");
    const bad: string[] = [];
    for (const [b, done] of [[rej, null], [prog, null], [canc, "CANCELLED"]] as const) {
      const t = unent((await manageText(b, done)).h);
      const n = t.split(SHOP_CONTACT.phone).length - 1;
      if (n !== 1) bad.push(`${b.tag}: เบอร์ร้าน ${n} ครั้ง · ${t.slice(0, 200)}`);
    }
    eq(bad, [], "ช่องทางติดต่อครั้งเดียว");
  });
  await st("L7-6", "เบอร์ผิดรูป ⇒ self.err.INVALID_PHONE ผูกช่องด้วย aria-describedby · หน้าล็อกบอก 24 ชั่วโมง (th/en)", () => {
    const h = html("BookSelfVerify", { action: NOOP, nonce: "x", locale: "th", error: "INVALID_PHONE" });
    const inp = /<input[^>]*data-testid="book-verify-phone"[^>]*>/.exec(h)?.[0] ?? "";
    const id = /aria-describedby="([^"]+)"/.exec(inp)?.[1] ?? "";
    ok(id, `ช่องเบอร์ไม่มี aria-describedby: ${inp}`);
    const el = new RegExp(`<[^>]+id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([\\s\\S]*?)</`).exec(h)?.[1] ?? "";
    eq(unent(el), String(th["self.err.INVALID_PHONE"] ?? "∅"), "ข้อความที่ aria-describedby ชี้");
    ok(text("BookSelfLocked", { shop: SHOP_SET, code: "TR-0000-0001", locale: "th" }).includes("24 ชั่วโมง"), "th ล็อกไม่บอก 24 ชั่วโมง");
    ok(text("BookSelfLocked", { shop: SHOP_SET, code: "TR-0000-0001", locale: "en" }).includes("24 hours"), "en ล็อกไม่บอก 24 hours");
  });
  groupLine("L7");

  console.log("\n── L8: ร้านไม่มีเบอร์/LINE ──");
  await st("L8-1", "ร้านไม่มีเบอร์/LINE: ปุ่มยกเลิกยังอยู่ (ก้อนจัดการ + หน้ายกเลิก) · คำเตือน K9 (th/en) ไม่มีชื่อร้านลอย / ตัวแทน {contact} / วลีติดต่อค้างท้าย · th ยังบอก \"อย่ายกเลิกที่นี่\"", async () => {
    const vu = await vmUnpaid();
    const bad: string[] = [];
    const mh = html("BookSelfManage", { manage: { cancel: "UNPAID", block: null, refund: null }, shop: SHOP_NONE, code: "TR-0000-0001", locale: "th", cancelHref: "#", done: null, state: "PAY" });
    if (!mh.includes('data-testid="book-manage-cancel"')) bad.push("ไม่มีปุ่มยกเลิกในก้อนจัดการ");
    for (const lang of ["th", "en"] as const) {
      const h = html("BookSelfCancel", { vm: vu, action: NOOP, shop: SHOP_NONE, code: "TR-0000-0001", locale: lang, error: null });
      if (!h.includes('data-testid="book-cancel-submit"')) bad.push(`${lang} ไม่มีปุ่มยืนยัน`);
      const w = unent(/data-testid="book-cancel-paid-warning"[^>]*>([\s\S]*?)<\/p>/.exec(h)?.[1] ?? "");
      if (!w) { bad.push(`${lang} ไม่มีคำเตือน K9`); continue; }
      if (w.includes(SHOP_NONE.name) || /\{contact\}/.test(w) || /(ติดต่อร้าน|contact)\s*[·,.:]?\s*$/i.test(w) || /·\s*$/.test(w)) bad.push(`${lang} คำเตือนมีชื่อร้านลอย/ตัวแทน/วลีค้าง: ${w}`);
      if (lang === "th" && !/อย่ายกเลิกที่นี่/.test(w)) bad.push(`th: ${w}`);
      if (lang === "en" && !/(do not|don't)/i.test(w)) bad.push(`en: ${w}`);
    }
    eq(bad, [], "จอร้านไม่มีช่องทาง");
  });
  groupLine("L8");

  console.log("\n── L9: ข้อย่อย ──");
  await st("L9-1", "ที่ถือถูกตัวกวาดปิดไปแล้วระหว่างหน้ายกเลิก (TripHold EXPIRED · การจองยัง HOLD) ⇒ ไม่ใช่ BUSY (ยกเลิกได้ / STATE_CHANGED / NOT_ALLOWED ENDED) · ไม่ THROW", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("l9h", "A", "2027-05-05");
    const b = await mkBooking("bL9h", "l9h", "A", { adults: 1 });
    const g = await grantOf(b);
    const vm = await quoteVm(b, g);
    await pool.query(`UPDATE "TripHold" SET status = 'EXPIRED' WHERE "bookingId" = $1 AND status = 'ACTIVE'`, [b.id]);
    await pool.query(`UPDATE "TripDeparture" SET held = held - $2 WHERE id = $1`, [b.dep, b.seats]);
    const r = await cancelX(b, g, 0, { form: asRec(vm.form) ?? {}, when: at(180_000) });
    // ไม่บังคับทางเดียว: ยกเลิกได้ (ไม่มีที่ถือให้ปล่อย) · STATE_CHANGED · หรือ NOT_ALLOWED{ENDED} (หน้าเห็นว่าที่ถือหมดแล้ว) — ห้าม BUSY/THROW (มติ L9)
    ok((r.ok === true && r.result === "CANCELLED") || r.code === "STATE_CHANGED" || (r.code === "NOT_ALLOWED" && r.block === "ENDED"), `ผล: ${fmt(r)}`);
  });
  await st("L9-2", "ตัวนับล่มตอนเปิดหน้า (openBookReservation · deps.query โยน) ⇒ ให้ลองใหม่ (RATE_LIMITED) ไม่ใช่ NOT_FOUND", async () => {
    const [b] = needBk("bRL5");
    const r = await bcall("openBookReservation", { shop: b.shop, token: b.token, lang: "th", acceptLanguage: "th", clientKey: ck() }, { now: ACT.now, deps: { query: async () => { throw new Error("down"); } } });
    ok(r.ok === false && r.code === "RATE_LIMITED", `ผล: ${fmt(r)}`);
  });
  await st("L9-3", "ส่งฟอร์มคำขอยอด 0 ซ้ำหลังร้านรับเงิน ⇒ ผลเดิม CANCEL_REQUESTED ยอด 0 (เลือกจากยอดของคำขอเดิม ไม่ใช่ paidSatang ตอนนี้)", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkConfirmed("bL9r", "gen");
    const g = await grantOf(b);
    const [f] = await qforms(b, g, 1);
    const r1 = await cancelX(b, g, 0, { form: f });
    eq([r1.ok, r1.result], [true, "CANCEL_REQUESTED"], `ครั้งแรก ${fmt(r1)}`);
    // ฟิกซ์เจอร์: บริการไม่รับเงินขณะคำขอเปิด (REFUND_IN_PROGRESS) ⇒ ตั้ง paidSatang ตรง ๆ (ทดสอบว่าผลส่งซ้ำมาจากยอดของคำขอเดิม ไม่ใช่ paidSatang ตอนนี้)
    await pool.query(`UPDATE "TripBooking" SET "paidSatang" = $2 WHERE id = $1`, [b.id, ONE]);
    const r2 = await cancelX(b, g, 0, { form: f, when: at(180_000) });
    eq([r2.ok, r2.replayed, r2.result, r2.refundSatang], [true, true, "CANCEL_REQUESTED", 0], `ส่งซ้ำ ${fmt(r2)}`);
  });
  await st("L9-4", "รั้วบริการ: publicSelf บนการจอง PENDING / เอเจนซี่ (collectMode AGENT · channel AGENT_API) ⇒ FORBIDDEN ไม่มีการเขียน (ไม่พึ่งหน้า)", async () => {
    needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const reason = selfReason();
    const pe = await mkBooking("bL9p", "gen", "A", { adults: 1 });
    const ag = await mkBooking("bL9a", "gen", "A", { adults: 1 }, { pay: true });
    const ch = await mkBooking("bL9c", "gen", "A", { adults: 1 }, { pay: true });
    await pool.query(`UPDATE "TripBooking" SET status = 'PENDING' WHERE id = $1`, [pe.id]);
    await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT' WHERE id = $1`, [ag.id]);
    await pool.query(`UPDATE "TripBooking" SET channel = 'AGENT_API' WHERE id = $1`, [ch.id]);
    for (const b of [pe, ag, ch]) {
      const v0 = await bRow(b.id);
      const r = await tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "EXECUTE", reason, reasonKind: "CUSTOMER", ...(b === pe ? {} : { choice: "MONEY" }), idempotencyKey: `w13l9_${hex(6)}` }, await psOf(b));
      eq([r.ok, r.code], [false, "FORBIDDEN"], `cancel ${b.tag} (${fmt(r)})`);
      if (b !== pe) { const y = await tcall("requestTripRefund", pubCtx(), { bookingId: b.id, expectedVersion: v0.version, reasonKind: "CUSTOMER", choice: "MONEY", reason, idempotencyKey: `w13l9_${hex(6)}` }, await psOf(b)); eq([y.ok, y.code], [false, "FORBIDDEN"], `requestTripRefund ${b.tag} (${fmt(y)})`); }
      await noWrite(b, v0, `L9-4 ${b.tag}`);
    }
  });
  groupLine("L9");

  console.log("\n── L10: หัว HTTP ของ /book/:shop/my/* (next.config headers()) ──");
  // ORACLE-EDIT L10-1 (ผู้คุม 19 พ.ย. · มติ L10 แก้): proxy.ts ใส่ Referrer-Policy ให้ทุกคำตอบอยู่แล้ว (strict-origin-when-cross-origin ⇒ ข้ามโดเมนส่งแค่ origin ไม่มี path/query — token และ g ไม่รั่วออกนอกโดเมน) และจะทับค่าจาก next.config ⇒ ไม่แตะ next.config/proxy · หน้าต้องเป็น dynamic (no-store) · ผู้คุม curl จริงภายหลัง
  await st("L10-1", "proxy ใส่ Referrer-Policy ทุกคำตอบ (ข้ามโดเมนไม่ส่ง path/query) · หน้า my/[token] เป็น force-dynamic · ใบนี้ไม่แตะ next.config/proxy", () => {
    const px = stripComments(read("src/proxy.ts"));
    ok(/headers\.set\(\s*["']Referrer-Policy["']\s*,[^)]*(no-referrer|strict-origin-when-cross-origin)/.test(px), "proxy ไม่ตั้ง Referrer-Policy");
    const pg = read("src/app/book/[shop]/my/[token]/page.tsx");
    ok(/export const dynamic\s*=\s*["']force-dynamic["']/.test(pg), "หน้าไม่ใช่ force-dynamic");
    eq(git(["diff", "--name-only", "session/trips", "--", NEXT_CONFIG, "src/proxy.ts"]).trim(), "", "แตะ next.config/proxy");
  });
  groupLine("L10");

  // ═══════════════ P. มติผู้คุมรอบ 3 (P1–P4 · ท้าย ledger/trips-briefs/W1.3.md) — ผู้เขียนข้อสอบ 19 พ.ย. ═══════════════
  //   P1: เรียก server action จริง (src/app/book/[shop]/my/actions.ts) ในขอบเขตคำขอของ Next (workAsyncStorage + workUnitAsyncStorage แบบ qc-crm-c1.11)
  //       ด้วย FormData ที่ได้จากการเรนเดอร์ฟอร์มจริง (BookSelfVerify / BookSelfCancel) · นาฬิกาจริง (action ไม่ส่ง now) ⇒ quote/ยืนยันในข้อนี้ใช้นาฬิกาจริงทั้งเส้น
  console.log("\n── P1: ฟอร์มผ่าน server action + FormData จริง ──");
  (globalThis as Rec).AsyncLocalStorage ??= AsyncLocalStorage;
  const nWork = asRec(await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null));
  const nUnit = asRec(await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null));
  const nCookies = asRec(await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null));
  const ACTI = await tryImport("@/app/book/[shop]/my/actions");
  type Redir = { kind: "REDIRECT" | "NOT_FOUND" | "RETURN" | "THROW"; url: string; q: URLSearchParams; err: string };
  const runAction = async (name: string, ip: string, args: unknown[]): Promise<Redir> => {
    const fn = ACTI.mod?.[name];
    ok(typeof fn === "function", `โหลด ${name} จาก my/actions.ts ไม่ได้ (${ACTI.err.slice(0, 100)})`);
    const ws = asRec(nWork?.workAsyncStorage), us = asRec(nUnit?.workUnitAsyncStorage), RC = nCookies?.RequestCookies;
    ok(ws && us && typeof RC === "function", "หาขอบเขตคำขอของ Next ไม่ได้ (work-async-storage)");
    const req = new Request("http://qc.local/book/x/my/y", { method: "POST", headers: { "x-real-ip": ip, "accept-language": "th", "user-agent": "qc-w13-action", "content-type": "multipart/form-data; boundary=x", "next-action": "qc" } });
    const jar = new (RC as new (h: Headers) => unknown)(req.headers);
    const workStore = { route: "/book/[shop]/my/[token]", page: "/book/[shop]/my/[token]/page", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
    const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname: "/book/x/my/y", search: "" } };
    try {
      await (ws?.run as AnyFn).call(ws, workStore, () => (us?.run as AnyFn).call(us, unit, () => (fn as AnyFn)(...args)));
      return { kind: "RETURN", url: "", q: new URLSearchParams(), err: "" };
    } catch (e) {
      const d = String(asRec(e)?.digest ?? "");
      if (d.startsWith("NEXT_REDIRECT")) { const url = d.split(";")[2] ?? ""; return { kind: "REDIRECT", url, q: new URL(url, "http://x").searchParams, err: "" }; }
      if (/NEXT_HTTP_ERROR_FALLBACK;404/.test(d)) return { kind: "NOT_FOUND", url: "", q: new URLSearchParams(), err: "" };
      return { kind: "THROW", url: "", q: new URLSearchParams(), err: errMsg(e) };
    }
  };
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  /** ช่อง input ทุกตัวที่ฟอร์มเรนเดอร์ (hidden = ค่าที่ฝัง · checkbox = ผู้ใช้ติ๊ก · ช่องพิมพ์ = ค่าที่ให้) ⇒ FormData แบบที่เบราว์เซอร์ส่ง */
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
  /** ยืนยันเบอร์ผ่าน action (นาฬิกาจริง) — nonce จากผลของตัวเปิดหน้า (มติ L6) · คืน grant จาก Location */
  const verifyViaAction = async (b: Bk, phone = b.phone): Promise<Redir> => {
    const o = await bcall("openBookReservation", { shop: b.shop, token: b.token, lang: "th", acceptLanguage: "th", clientKey: b.ck });
    ok(o.ok === true, `เปิดหน้า (นาฬิกาจริง) ${b.tag}: ${fmt(o)}`);
    const nonce = stringsDeep(o, asRec(asRec(o.vm)?.manage)).find((x) => NONCE_RE.test(x));
    ok(nonce, "ผลของตัวเปิดหน้าไม่มี nonce ฟอร์มยืนยันเบอร์ (มติ L6)");
    const fd = formDataOf(html("BookSelfVerify", { action: NOOP, nonce, locale: "th", error: null }), { phone });
    await sleep(1_200);
    return runAction("verifySelfAction", IP_OF.get(b.ck) ?? "", [b.shop, b.token, fd]);
  };
  const grantViaAction = async (b: Bk): Promise<string> => {
    const r = await verifyViaAction(b);
    const g = r.q.get("g") ?? "";
    ok(r.kind === "REDIRECT" && /^g1\.\d{1,12}\.[A-Za-z0-9_-]{22}$/.test(g) && r.q.get("do") === "cancel", `ยืนยันผ่าน action ${b.tag}: ${fmt([r.kind, r.url, r.err])}`);
    return g;
  };
  /** หน้ายกเลิก (นาฬิกาจริง): quote → เรนเดอร์ BookSelfCancel → FormData (แก้ช่องได้) → cancelSelfAction */
  const cancelViaAction = async (b: Bk, g: string, tamper: (fd: FormData) => void = () => undefined): Promise<{ r: Redir; vm: Rec }> => {
    const qq = await call("quoteBookSelfCancel", { shop: b.shop, token: b.token, grant: g, clientKey: b.ck });
    ok(qq.ok === true, `quote (นาฬิกาจริง) ${b.tag}: ${fmt(qq)}`);
    const vm = asRec(qq.vm) ?? {};
    const fd = formDataOf(html("BookSelfCancel", { vm, action: NOOP, shop: SHOP_SET, code: "TR-0000-0001", locale: "th", error: null }));
    tamper(fd);
    await sleep(1_200);
    return { r: await runAction("cancelSelfAction", IP_OF.get(b.ck) ?? "", [b.shop, b.token, g, fd]), vm };
  };
  await st("P1-1", "ยืนยันเบอร์ผ่าน verifySelfAction (FormData จากฟอร์มจริง): เบอร์ถูก ⇒ redirect ?do=cancel&g=<grant> · เบอร์ผิด ⇒ redirect กลับพร้อม e=VERIFY_FAILED ไม่มี g", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("p1h", "A", "2027-05-06");
    const b = await mkBooking("bP1h", "p1h", "A", { adults: 2 });
    await grantViaAction(b);
    const w = await verifyViaAction(b, "0899999995");
    ok(w.kind === "REDIRECT" && w.q.get("e") === "VERIFY_FAILED" && !w.q.get("g"), `เบอร์ผิด: ${fmt([w.kind, w.url])}`);
  });
  await st("P1-2", "ยกเลิก HOLD ผ่าน cancelSelfAction (ทุกช่องของฟอร์มจริง) ⇒ redirect done=CANCELLED ไม่มี g · การจอง CANCELLED · ที่นั่งคืนพอดี", async () => {
    const [b] = needBk("bP1h");
    const d0 = await depRow(b.dep);
    const g = await grantViaAction(b);
    const { r, vm } = await cancelViaAction(b, g);
    eq(vm.kind, "UNPAID", "ชนิด");
    ok(r.kind === "REDIRECT" && r.q.get("done") === "CANCELLED" && !r.q.get("g"), `ผล: ${fmt([r.kind, r.url, r.err])}`);
    const d1 = await depRow(b.dep);
    eq([(await bRow(b.id)).status, d0.held - d1.held, (await refunds(b.id)).length], ["CANCELLED", b.seats, 0], "การจอง/ที่นั่ง");
  });
  await st("P1-3", "จ่ายแล้ว (ร้าน B · 100%) ผ่าน action ⇒ redirect done=REFUND_REQUESTED · คำขอ QUOTED 1 แถว by CUSTOMER ยอด = ที่เห็น", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("p1b", "B", "2027-04-17");
    const b = await mkBooking("bP1p", "p1b", "B", { adults: 1 }, { pay: true });
    const { r, vm } = await cancelViaAction(b, await grantViaAction(b));
    eq(vm.kind, "REFUND_REQUEST", "ชนิด");
    ok(r.kind === "REDIRECT" && r.q.get("done") === "REFUND_REQUESTED", `ผล: ${fmt([r.kind, r.url, r.err])}`);
    G.p1Untampered = "ok";
    eq((await refunds(b.id)).map((x) => [x.status, x.by, x.amountSatang]), [["QUOTED", "CUSTOMER", Number(vm.refundSatang)]], "คำขอ");
  });
  await st("P1-4", "CONFIRMED ยังไม่จ่าย ผ่าน action ⇒ redirect done=CANCEL_REQUESTED · คำขอ QUOTED ยอด 0 · การจองยัง CONFIRMED", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkConfirmed("bP1c", "gen");
    const { r, vm } = await cancelViaAction(b, await grantViaAction(b));
    eq(vm.kind, "CANCEL_REQUEST", "ชนิด");
    ok(r.kind === "REDIRECT" && r.q.get("done") === "CANCEL_REQUESTED", `ผล: ${fmt([r.kind, r.url, r.err])}`);
    eq([(await bRow(b.id)).status, (await refunds(b.id)).map((x) => [x.status, x.amountSatang])], ["CONFIRMED", [["QUOTED", 0]]], "การจอง/คำขอ");
  });
  await st("P1-5", "แก้ช่องซ่อนของฟอร์ม (kind · v · kv · seen) ทีละช่อง ⇒ redirect กลับหน้ายกเลิกพร้อม e= (ไม่มี done) · ไม่มีคำขอ · การจองยัง PAID", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    // ตัวควบคุม: ฟอร์มที่ไม่แก้ต้องผ่าน (P1-3) ไม่งั้นข้อนี้แยกไม่ออกว่าปฏิเสธเพราะแก้ช่อง หรือเพราะ action ทิ้งช่อง
    ok(G.p1Untampered === "ok", "P1-3 (ฟอร์มที่ไม่แก้) ยังไม่ผ่าน ⇒ ผลของการแก้ช่องสรุปไม่ได้");
    const b = await mkBooking("bP1t", "p1b", "B", { adults: 1 }, { pay: true });
    const g = await grantViaAction(b);
    const bad: string[] = [];
    const flip = (x: string) => (x ? x.slice(0, -1) + (x.endsWith("A") ? "B" : "A") : "x");
    for (const [field, change] of [["kind", () => "UNPAID"], ["v", (x: string) => String(Number(x) + 1)], ["kv", flip], ["seen", (x: string) => String(Math.max(0, Number(x) - 100))]] as const) {
      const { r } = await cancelViaAction(b, g, (fd) => { const cur = String(fd.get(field) ?? ""); if (!fd.has(field)) bad.push(`ฟอร์มไม่มีช่อง ${field}`); fd.set(field, (change as (x: string) => string)(cur)); });
      if (!(r.kind === "REDIRECT" && r.q.get("e") && !r.q.get("done"))) bad.push(`${field}: ${fmt([r.kind, r.url, r.err])}`);
    }
    eq(bad, [], "ผลเมื่อแก้ช่อง");
    eq([(await refunds(b.id)).length, (await bRow(b.id)).status], [0, "PAID"], "ไม่มีการเขียน");
  });
  groupLine("P1");

  console.log("\n── P2: ยอดต้องตรงใต้ล็อก (expectedRefundSatang) ──");
  await st("P2-1", "บริการ: publicSelf.expectedRefundSatang ≠ ยอดที่คิดใต้ล็อก ⇒ STATE_CONFLICT · ไม่มีคำขอ (cancelTripBooking EXECUTE และ requestTripRefund)", async () => {
    needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("p2a", "B", "2027-04-18");
    const b = await mkBooking("bP2a", "p2a", "B", { adults: 1 }, { pay: true });
    const reason = selfReason();
    const ctxB = { ...pubCtx(), tenantId: tB, unitId: uB };
    const real = await staffQuote(tB, b.id, ACT);
    const v = (await bRow(b.id)).version;
    const ps = { publicSelf: { bookingId: b.id, tokenHash: sha256hex(b.token), expectedVersion: v, expectedRefundSatang: real - 100 } };
    const x = await tcall("cancelTripBooking", ctxB, { bookingId: b.id, mode: "EXECUTE", reason, reasonKind: "CUSTOMER", choice: "MONEY", idempotencyKey: `w13p2_${hex(6)}` }, ps);
    eq([x.ok, x.code], [false, "STATE_CONFLICT"], `cancel ยอดไม่ตรง (${fmt(x)})`);
    const y = await tcall("requestTripRefund", ctxB, { bookingId: b.id, expectedVersion: v, reasonKind: "CUSTOMER", choice: "MONEY", reason, idempotencyKey: `w13p2_${hex(6)}` }, ps);
    eq([y.ok, y.code], [false, "STATE_CONFLICT"], `requestTripRefund ยอดไม่ตรง (${fmt(y)})`);
    eq((await refunds(b.id)).length, 0, "ไม่มีคำขอ");
  });
  await st("P2-2", "ลูกค้าเห็นยอด X (มีค่าอุทยานคืน) → ระหว่างส่ง ร้านบันทึกหลักฐานจ่ายค่าเก็บแทนระดับรอบ (TripPassThroughEvidence bookingId NULL) ขณะธุรกรรมของลูกค้ารอล็อกแถวการจอง ⇒ ไม่มีคำขอเกิด (ยอดใต้ล็อก ≠ X ⇒ ปฏิเสธ)", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("p2d", "B", "2027-04-19");
    const b = await mkBooking("bP2", "p2d", "B", FULL, { pay: true });
    const g = await grantOf(b);
    const vm = await quoteVm(b, g);
    const X = Number(vm.refundSatang);
    eq(X, TOTAL, "ยอดที่เห็น (45+ วัน คืนเต็ม รวมค่าอุทยาน)");
    const lockC = await pool.connect();
    let r: Rec = {};
    let sawWait = false;
    try {
      await lockC.query("BEGIN");
      await lockC.query(`SELECT 1 FROM "TripBooking" WHERE id = $1 FOR UPDATE`, [b.id]);
      const p = cancelX(b, g, X, { form: asRec(vm.form) ?? {}, when: at(180_000) });
      for (let i = 0; i < 100 && !sawWait; i++) {
        await new Promise((res) => setTimeout(res, 150));
        sawWait = Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted AND locktype IN ('transactionid', 'tuple')`))[0]?.n ?? 0) > 0;
      }
      await lockC.query(`INSERT INTO "TripPassThroughEvidence" (id, "tenantId", "unitId", "departureId", "bookingId", "extraKind", "paidToPayee", "amountSatang", "paidAt", "fileIds", "updatedAt") VALUES ($1, $2, $3, $4, NULL, 'PARK_FEE', 'อุทยานแห่งชาติ (ทดสอบ)', $5, now(), '{}', now())`, [rid("pte"), tB, uB, b.dep, PT]);
      await lockC.query("COMMIT");
      r = await p;
    } finally { lockC.release(); }
    ok(sawWait, `ไม่เห็นธุรกรรมของลูกค้ารอล็อกแถวการจอง (ทดสอบเส้นใต้ล็อกไม่ได้) · ผล ${fmt(r)}`);
    const rq = await refunds(b.id);
    eq(rq.map((x) => x.amountSatang), [], `ยื่นคำขอยอดที่ลูกค้าไม่เห็น (เห็น ${X}) · ผล ${fmt(r)}`);
    ok(r.ok === false && ["STATE_CHANGED", "AMOUNT_CHANGED"].includes(String(r.code)), `ผล: ${fmt(r)}`);
  });
  groupLine("P2");

  console.log("\n── P3: ข้อย่อย ──");
  const setRead = async (key: string, count: number, when: { now: Date }) => {
    await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = $1`, [key]);
    await insertRow("ChatRateBucket", { key, count, windowStart: when.now, updatedAt: new Date() });
  };
  await st("P3-1", `ถังอ่านที่เพดานพอดี (${119} แล้วเปิดอีก 1 = 120): หน้ายกเลิก (quote) กับหน้าการจองให้ผลเหมือนกัน — ครั้งที่ 120 ผ่าน · ครั้งที่ 121 RATE_LIMITED`, async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bP3r", "gen", "A", { adults: 1 }, { pay: true });
    const g = await grantOf(b);
    const T = at(VMS + 8 * MIN);
    const key = `trips:book:${tA}:${b.ck}`;
    const out: Record<string, [unknown, unknown]> = {};
    await setRead(key, 119, T);
    const q1 = await cancelQ(b, g, T), q2 = await cancelQ(b, g, T);
    out.cancel = [q1.ok, q2.ok === true ? true : q2.code];
    await setRead(key, 119, T);
    const o1 = await bcall("openBookReservation", { shop: b.shop, token: b.token, lang: "th", acceptLanguage: "th", clientKey: b.ck }, T), o2 = await bcall("openBookReservation", { shop: b.shop, token: b.token, lang: "th", acceptLanguage: "th", clientKey: b.ck }, T);
    out.page = [o1.ok, o2.ok === true ? true : o2.code];
    eq(out, { cancel: [true, "RATE_LIMITED"], page: [true, "RATE_LIMITED"] }, "ผลที่เพดาน");
  });
  await st("P3-2", "ตัวนับล่ม (LIMITER_DOWN) ⇒ รหัสหน้าแยกจากถี่เกิน (LIMIT) · ข้อความไทย \"ระบบไม่ว่าง ลองใหม่อีกครั้ง\" ไม่ใช่ข้อความลองหลายครั้ง", () => {
    const f = P("selfPageErrorOf");
    const down = f({ code: "RATE_LIMITED", reason: "LIMITER_DOWN" }), lim = f({ code: "RATE_LIMITED", reason: "LIMIT" });
    ok(typeof down === "string" && down !== lim, `รหัสหน้า: down ${fmt(down)} · limit ${fmt(lim)}`);
    const t = text("BookSelfError", { code: down, locale: "th" }), tl = text("BookSelfError", { code: lim, locale: "th" });
    ok(t.includes("ระบบไม่ว่าง ลองใหม่อีกครั้ง") && t !== tl, `ข้อความตัวนับล่ม: ${t} · ถี่เกิน: ${tl}`);
  });
  await st("P3-3", "K8 ไม่นับคำขอที่ถูกถอน: ลูกค้ายื่น → ร้านปฏิเสธ → ร้านยื่นเองแล้วถอน (WITHDRAWN) ⇒ ลูกค้ายังถูกปฏิเสธ (หน้า NOT_ALLOWED{REFUND_REJECTED} · บริการ FORBIDDEN · manage REFUND_REJECTED)", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    await mkDep("p3w", "B", "2027-04-20");
    const b = await mkBooking("bP3w", "p3w", "B", { adults: 1 }, { pay: true });
    await fileViaPage(b);
    const r0 = (await refunds(b.id))[0];
    const d = await tcall("decideTripRefund", staffCtx(tB, ACT), { requestId: r0?.id, decision: "REJECT", reason: "ร้านปฏิเสธ (P3)", idempotencyKey: `w13p3_${hex(6)}` });
    ok(d.ok === true, `ร้านปฏิเสธ: ${fmt(d)}`);
    // คำขอของร้านเกิดทีหลังคำขอของลูกค้า (ลูกค้ายื่นที่ +3 นาที) ⇒ ร้านยื่น/ถอนที่ +5 นาที ⇒ แถว WITHDRAWN เป็นแถวล่าสุดจริง
    const s1 = await tcall("requestTripRefund", staffCtx(tB, at(300_000)), { bookingId: b.id, expectedVersion: (await bRow(b.id)).version, reasonKind: "CUSTOMER", choice: "MONEY", reason: "ร้านยื่นแทน (P3)", idempotencyKey: `w13p3_${hex(6)}` });
    const sid = asRec(s1.value)?.id ?? asRec(s1.value)?.requestId ?? (await refunds(b.id)).find((x) => x.by !== "CUSTOMER")?.id;
    ok(s1.ok === true && sid, `ร้านยื่น: ${fmt(s1)}`);
    const w = await tcall("withdrawTripRefund", staffCtx(tB, at(310_000)), { requestId: sid, reason: "ถอน (P3)", idempotencyKey: `w13p3_${hex(6)}` });
    ok(w.ok === true, `ร้านถอน: ${fmt(w)}`);
    eq((await refunds(b.id)).map((x) => [x.by, x.status]), [["CUSTOMER", "REJECTED"], ["STAFF", "WITHDRAWN"]], "ฟิกซ์เจอร์ (เรียงตามเวลาสร้าง · แถวล่าสุด = ของร้านที่ถอน)");
    const T = at(320_000);
    const m = await manageOf(b, T);
    eq([m.cancel, m.block], [null, "REFUND_REJECTED"], "manage");
    BLOCKED(await verify(b, { clientKey: ck(), when: T }), "REFUND_REJECTED", "ยืนยันเบอร์");
    const x = await tcall("cancelTripBooking", { ...pubCtx(T), tenantId: tB, unitId: uB }, { bookingId: b.id, mode: "EXECUTE", reason: selfReason(), reasonKind: "CUSTOMER", choice: "MONEY", idempotencyKey: `w13p3_${hex(6)}` }, await psOf(b));
    eq([x.ok, x.code], [false, "FORBIDDEN"], `บริการ (${fmt(x)})`);
    eq((await customerRows(b.id)).length, 1, "คำขอของลูกค้า");
  });
  await st("P3-4", "เส้นอ่านนอกธุรกรรมไม่ล็อกแถว (ไม่มี FOR UPDATE นอกธุรกรรม): ขณะอีกธุรกรรมถือ FOR UPDATE แถวการจอง — QUOTE ของบริการ (publicSelf) · quoteBookSelfCancel · openBookReservation จบภายใน 4 วิ", async () => {
    needSelf(); needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`);
    const b = await mkBooking("bP3l", "gen", "A", { adults: 1 }, { pay: true });
    const g = await grantOf(b);
    const ps = await psOf(b);
    const lockC = await pool.connect();
    const done: string[] = [];
    try {
      await lockC.query("BEGIN");
      await lockC.query(`SELECT 1 FROM "TripBooking" WHERE id = $1 FOR UPDATE`, [b.id]);
      const timed = <T,>(name: string, p: Promise<T>) => Promise.race([p.then(() => { done.push(name); }), sleep(4_000)]);
      await Promise.all([
        timed("serviceQuote", tcall("cancelTripBooking", pubCtx(), { bookingId: b.id, mode: "QUOTE", reason: selfReason(), reasonKind: "CUSTOMER", idempotencyKey: `w13p3l_${hex(6)}` }, ps)),
        timed("quoteBookSelfCancel", cancelQ(b, g)),
        timed("openBookReservation", openRes(b)),
      ]);
    } finally { await lockC.query("COMMIT").catch(() => undefined); lockC.release(); }
    eq(done.sort(), ["openBookReservation", "quoteBookSelfCancel", "serviceQuote"], "จบโดยไม่รอล็อก");
  });
  groupLine("P3");

  // ═══════════════ PII ═══════════════
  console.log("\n── PII ──");
  await st("PII-1", "ผลของ verify/quote ยกเลิก และหน้าการจอง (vm.manage) ไม่มี id ภายใน/เบอร์/อีเมล/ชื่อผู้จอง/publicTokenHash", async () => {
    needSelf(); const [b] = needBk("bV2");
    const g = await grantOf(b);
    const name = String((await q<{ name: string }>(`SELECT p.name FROM "Party" p JOIN "TripBooking" t ON t."bookerPartyId" = p.id WHERE t.id = $1`, [b.id]))[0]?.name ?? "");
    const ids = [b.id, b.dep, sha256hex(b.token), ...Object.values(PRD).map((p) => p.id)];
    for (const [what, r] of [["quote ยกเลิก", await cancelQ(b, g)], ["หน้าการจอง", await openRes(b)]] as const) {
      ok(r.ok === true, `${what}: ${fmt(r)}`);
      noInternal(r.vm, ids, what, [b.phone, b.phone.slice(1), name]);
    }
  });
  await st("PII-2", "audit/คำขอคืนเงิน/ถังของร้านทดสอบไม่มีเบอร์ผู้จองหรือ token (ข้อความดิบ) · มีแถว audit จากเส้นลูกค้า (actorId trips.public.self) ให้ตรวจ", async () => {
    needSelf(); needBk("b19");
    const audits = await q<{ s: string; a: string | null }>(`SELECT coalesce("after"::text, '') || coalesce("before"::text, '') AS s, "actorId" AS a FROM "AuditLog" WHERE "tenantId" = $1`, [tA]);
    const reqs = await q<{ s: string }>(`SELECT computed::text || coalesce("idempotencyKey", '') AS s FROM "TripRefundRequest" WHERE "tenantId" = $1`, [tA]);
    const blob = [...audits, ...reqs].map((x) => x.s).join("\n");
    const leak = Object.values(BK).filter((x) => blob.includes(x.phone) || blob.includes(x.token));
    ok(leak.length === 0, `พบเบอร์/token ใน audit/คำขอ: ${leak.map((x) => x.tag).slice(0, 3).join(",")}`);
    ok(audits.some((x) => x.a === PUBLIC_ACTOR_ID), "ไม่มีแถว audit จากเส้นลูกค้า (ยังไม่มีงาน)");
  });
  groupLine("PII");
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

console.log(`\nเหลือให้ด่านภาพ + การเปิดจริง (ผู้คุม · scripts/visual-trips.mts w1.3 + parity 01ง/07ง): ฟอร์มส่งได้โดยไม่มี JS · grant ไม่อยู่ใน URL หลังทำสำเร็จ · หน้าที่มี g ส่ง Referrer-Policy no-referrer + Cache-Control no-store (K7 · curl -I) · ปุ่ม ≥ 44 px · 390 ไม่ล้น`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${(p0 ?? 0) + (c.res === "PASS" ? 1 : 0)}/${(t0 ?? 0) + 1}`; }
console.log(`\n===== QC TRIPS W1.3a · การจองของฉัน: ยืนยันเบอร์ → ยกเลิกก่อนจ่าย · คำขอคืนเงิน · สถานะคำขอ =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
const KNOWN_RED: string[] = []; // ยังไม่มีแดงที่รู้จัก — ผู้คุมเพิ่มด้วย ORACLE-EDIT เท่านั้น
const knownRed = failed.filter((c) => KNOWN_RED.includes(c.id)).map((c) => c.id), otherRed = failed.filter((c) => !KNOWN_RED.includes(c.id)).map((c) => c.id);
console.log(`แดงที่รู้จัก: ${knownRed.join(" ") || "ไม่มี"} · แดงอื่น: ${otherRed.join(" ") || "ไม่มี"}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), knownRed, otherRed, skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
