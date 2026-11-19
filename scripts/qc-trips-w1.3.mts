// QC — TRIPS W1.3a · การจองของฉัน: ยืนยันเบอร์ผู้จอง → ยกเลิกเอง (ก่อนจ่าย = ยกเลิกทันที · จ่ายแล้ว = คำขอคืนเงินตาม snapshot) · เลื่อนรอบเอง (ยอดเท่าเดิม) · ขอลิงก์ใหม่ (ภาพ 01ง · 07ง · 15)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/W1.3.md (ส่วน a) · สัญญา ledger/TRIPS-CORE-CONTRACT.md §G.1 §G.3 §J.3 · ภาพ ledger/design-trips/01-tour-customer.* (ง) · 07-states.* (ง) · 15-refund-flow.*
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน · พิสูจน์ฟิกซ์เจอร์/ค่าคาดหวังด้วยบริการของโมดูลโดยตรง)
//   S ไฟล์/กติกาโค้ด   P ตัวช่วยบริสุทธิ์ (trips-self-core)   LG ภาษา   V ยืนยันเบอร์ + สิทธิ์แก้ชั่วคราว (grant)   M ก้อนจัดการบนหน้าการจอง
//   CN ยกเลิก (ก่อนจ่าย/คำขอคืนเงิน)   MV เลื่อนรอบ   TK ขอลิงก์ใหม่ (เพิกถอน token)   RL ด่านอัตรา (ปิดเมื่อพัง)
//   X1 ข้ามร้าน/ข้ามการจอง · X3 ยิงพร้อมกัน ≥ 10 · X4 ส่งซ้ำ · X6 อินพุตอันตราย · PII
//
// 🔴 นาฬิกา: ทุกการเทียบเวลาใช้ "now ที่ข้อสอบส่ง" (NOW0 + ค่าชดเชย) เท่านั้น — ไม่เทียบกับ createdAt/updatedAt ที่ฐานเติม now() · ไม่กรองแถวด้วยช่วงเวลา
// 🔴 ค่าคาดหวังคิดเองจากฟิกซ์เจอร์ราชา (trips-fixture) + ตารางยกเลิกค่าเริ่ม (TRIPS-DEFAULTS T20: ≥30 วัน 100 · 15–29 วัน 50 · <15 วัน 0) — ไม่เรียกโค้ดที่ถูกทดสอบเพื่อหาคำตอบ
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-w13-*` (ไม่พึ่งร้าน seed — ร้าน seed ของเลน l1 มีของค้างจาก W1.2) · ลบใน finally + กวาดค้างตอนเริ่ม
// 🔴 การจองทดสอบสร้างผ่านเส้นจองจริงของ W1.2a (startBookHold → confirmBookHold) แล้วร้านรับเงินผ่าน recordTripPayment (STAFF) — nonce ของ W1.2 ผูกโดเมนถือ/ยืนยัน + ร้าน · ทุกการถือส่ง `t` จากผลของระบบ
// 🔴 ตัวช่วยยืนยัน/ฟอร์มของใบนี้ส่ง nonce ผูก (ร้าน · วัตถุประสงค์ verify/cancel/move/rotate · token) ตามใบสั่ง §3.2 · grant ผูกเครื่อง (ข้อสอบใช้กุญแจเครื่องเดียวกันตลอดเส้นของการจองหนึ่ง)
// 🔴 ยังไม่มีโมดูล/ฟังก์ชัน = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-w1.3.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน W1.3a: PC เขียว · S-8 (ฉากภาพ — ผู้ร่างเพิ่มแล้ว) เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
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

// ═══════════════ สเปก (ใบสั่ง W1.3 · ส่วน a) ═══════════════
const BASE_SHA = "499a4be5e"; // wip/trips-w1.3 = session/trips ตอนเขียนใบสั่ง
const SCORE = "src/lib/platform/trips-self-core.ts";
const SSVC = "src/lib/platform/trips-self.ts";
const BSVC = "src/lib/platform/trips-book.ts";
const BCORE = "src/lib/platform/trips-book-core.ts";
const PUBMOD = "src/lib/modules/trips/public-booking.ts";
const FACADE = "src/lib/modules/trips/index.ts";
const BOOKING = "src/lib/modules/trips/booking.ts";
const REFUND = "src/lib/modules/trips/refund.ts";
const ACTIONS = "src/app/book/[shop]/my/actions.ts";
const PAGE_RES = "src/app/book/[shop]/my/[token]/page.tsx";
const COMP = "src/components/book";
const MSG_TH = "src/messages/th/book.json";
const MSG_EN = "src/messages/en/book.json";
const OWN = [SCORE, SSVC, ACTIONS, PAGE_RES];
const SCORE_NAMES = ["SELF_ERROR_CODES", "SELF_BLOCKS", "SELF_MOVES_MAX", "SELF_VERIFY_PER_BOOKING_PER_HOUR", "SELF_GRANT_RE", "SELF_NONCE_PURPOSES", "selfManageOf", "selfPhoneMatches"];
const SSVC_FNS = ["issueSelfFormNonce", "verifyBookSelf", "quoteBookSelfCancel", "cancelBookSelf", "quoteBookSelfMove", "moveBookSelf", "rotateBookToken"];
const ACTION_NAMES = ["verifySelfAction", "cancelSelfAction", "moveSelfAction", "rotateLinkAction"];
const ERROR_CODES = ["NOT_FOUND", "RATE_LIMITED", "INVALID", "VERIFY_FAILED", "VERIFY_REQUIRED", "NOT_ALLOWED", "ACCEPT_REQUIRED", "AMOUNT_CHANGED", "STATE_CHANGED", "SOLD_OUT", "SLOT_CLOSED", "CUTOFF_PASSED", "TOO_FAST", "STALE_FORM", "DONE", "BUSY", "UNAVAILABLE"];
const BLOCKS = ["AGENT", "ENDED", "STARTED", "REFUND_IN_PROGRESS", "FEE", "MOVE_LIMIT", "PRICE_DIFFERS", "WINDOW", "NOT_SOLD"];
const INTERNAL_KEYS = ["id", "tenantId", "unitId", "productId", "slotId", "departureId", "optionId", "paxTypeId", "extraId", "zoneId", "pickupZoneId", "bookingId", "basketId", "holdId", "dueId", "partyId", "bookerPartyId",
  "agentAccountId", "clientKey", "itemRef", "priceSource", "priceTrace", "fingerprint", "warnings", "quoteId", "policySnapshot", "publicTokenHash", "requestId", "phone", "phoneNorm", "email", "version", "expectedVersion"];
const TESTIDS = ["book-manage", "book-manage-cancel", "book-manage-move", "book-manage-contact", "book-verify", "book-verify-phone", "book-verify-submit", "book-cancel-quote", "book-cancel-paid", "book-cancel-refund", "book-cancel-kept",
  "book-cancel-step", "book-cancel-accept", "book-cancel-submit", "book-cancel-done", "book-refund-status", "book-move", "book-move-summary", "book-move-submit", "book-move-done", "book-link-rotate", "book-link-new", "book-self-error"];
const TESTID_PATTERNS = ["book-move-day-"];
const I18N_REQUIRED = [
  ...["title", "cancel", "move", "link", "contact", "agent"].map((k) => `self.manage.${k}`),
  ...["title", "phone", "submit", "help"].map((k) => `self.verify.${k}`),
  ...["title", "paid", "refund", "kept", "step", "accept", "submit", "done", "unpaidDone", "requested"].map((k) => `self.cancel.${k}`),
  ...["title", "pick", "same", "differs", "submit", "done", "full", "left"].map((k) => `self.move.${k}`),
  ...["title", "submit", "done", "oldDead"].map((k) => `self.link.${k}`),
  ...["status", "QUOTED", "APPROVED", "EXECUTING", "DONE", "REJECTED"].map((k) => `self.refund.${k}`),
  ...ERROR_CODES.filter((c) => c !== "DONE").map((c) => `self.err.${c}`),
  ...BLOCKS.map((b) => `self.block.${b}`),
  "page.titleManage",
];
const FORBIDDEN_PATHS = ["prisma", "src/proxy.ts", "src/lib/core", "src/i18n", "src/lib/branding", "src/lib/payment", "src/app/api", "src/app/app", "src/app/b", "src/app/(store)", "src/lib/platform", "src/lib/modules",
  "src/messages/th/trips.json", "src/messages/en/trips.json", "src/components/trips", "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/trips-ui-inventory.json", "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts",
  ...["p0.1", "t0.1", "t0.2", "t0.3", "t0.4", "t0.5", "t0.6", "t0.7", "t0.8", "t1.1", "t1.2", "t1.3", "t1.4", "a1.1", "a1.2", "a1.3", "w1.1", "w1.2"].map((w) => `scripts/qc-trips-${w}.mts`),
  `:(exclude)${SCORE}`, `:(exclude)${SSVC}`, `:(exclude)${BSVC}`, `:(exclude)${BCORE}`, `:(exclude)${PUBMOD}`, `:(exclude)${FACADE}`, `:(exclude)${BOOKING}`, `:(exclude)${REFUND}`];
/** ไฟล์ที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด] — ใบสั่ง §2 */
const LIMITED: [string, number, number | null][] = [[BSVC, 10, 60], [BCORE, 0, 20], [PUBMOD, 0, 60], [FACADE, 0, 20], [BOOKING, 8, 70], [REFUND, 4, 30], ["scripts/visual-trips.mts", 0, 10]];
const VISUAL_SCENES = ["self-manage", "self-verify", "self-cancel-quote", "self-cancel-requested", "self-unpaid-cancelled", "self-move-pick", "self-move-done", "self-manage-en"];
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
const PX_DELTA = 50_000; // ราคาผู้ใหญ่ของรอบ px แพงกว่า ฿500
const FEE = 20_000; // ค่าเปลี่ยนวันของสินค้า F (T26) — ฿200
const X9_MIN = 30, X8_VERIFY = 5, X16_DAYS = 90; // TRIPS-DEFAULTS ค่าเริ่ม
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
  const ck = () => { ipN++; return bookClientKey(`${IP_PREFIX}${(ipN >> 8) & 255}.${ipN & 255}`); };
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
    await mkProd("A", tA, uA); await mkProd("F", tA, uA); await mkProd("B", tB, uB);
    // รอบ (เวลาร้านกรุงเทพ · NOW0 = 1 มี.ค. 2570 10:00): 45 วัน (100%) · 19 วัน (50%) · 9 วัน (0%) · ปลายทางเลื่อน · ราคาเฉพาะรอบ · เต็ม · ยกเลิก · นอกหน้าต่าง X16
    await mkDep("d45", "A", "2027-04-15"); await mkDep("d45b", "A", "2027-04-16"); await mkDep("px", "A", "2027-04-17"); await mkDep("closed", "A", "2027-04-18", { status: "CANCELLED" });
    await mkDep("fullApr", "A", "2027-04-19", { capacity: 10, sold: 10 }); await mkDep("hold", "A", "2027-04-20"); await mkDep("src", "A", "2027-04-21"); await mkDep("last", "A", "2027-04-22", { capacity: 12, sold: 11 });
    await mkDep("race", "A", "2027-04-23"); await mkDep("gen", "A", "2027-04-24", { capacity: 40 }); await mkDep("pc1", "A", "2027-04-25"); await mkDep("pc2", "A", "2027-04-26"); await mkDep("hold2", "A", "2027-04-27");
    await mkDep("far", "A", "2027-07-20"); await mkDep("d19", "A", "2027-03-20"); await mkDep("d9", "A", "2027-03-10");
    await mkDep("f1", "F", "2027-04-15"); await mkDep("f2", "F", "2027-04-16"); await mkDep("b1", "B", "2027-04-15");
    await insertRow("TripPrice", { id: rid("prpx"), tenantId: tA, unitId: uA, productId: PRD.A?.id, optionId: null, paxTypeId: PRD.A?.pt.ADULT, cabinTypeId: null, seasonId: null, departureId: DEP.px, currency: "THB", amountMinor: AD + PX_DELTA, weekdayMask: null, priority: 0, updatedAt: new Date() });
    // ราคาเฉพาะรอบของเด็กปักเท่าเดิม (ไม่ปักแล้วบริการคิดเด็กจากราคาผู้ใหญ่ของรอบ — ข้อสอบไม่ผูกกติกานั้น)
    await insertRow("TripPrice", { id: rid("prpxc"), tenantId: tA, unitId: uA, productId: PRD.A?.id, optionId: null, paxTypeId: PRD.A?.pt.CHILD, cabinTypeId: null, seasonId: null, departureId: DEP.px, currency: "THB", amountMinor: CH, weekdayMask: null, priority: 0, updatedAt: new Date() });
    await setV(tA, [{ key: "trips.public.bookingEnabled", scope: "UNIT", scopeId: uA, value: true }, { key: "trips.public.shopContact", scope: "UNIT", scopeId: uA, value: SHOP_CONTACT },
      { key: "trips.cancel.changeDateFee", scope: "PRODUCT", scopeId: PRD.F?.id, value: FEE }]);
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
  const FULL: Pick = { adults: 2, children: 1, camera: true };
  if (!setupErr) {
    try {
      await mkBooking("b45", "d45", "A", FULL, { pay: true }); await mkBooking("b45x", "d45", "A", FULL, { pay: true }); await mkBooking("bPx", "d45", "A", FULL, { pay: true });
      await mkBooking("b19", "d19", "A", FULL, { pay: true }); await mkBooking("b19r", "d19", "A", FULL, { pay: true }); await mkBooking("b19rep", "d19", "A", FULL, { pay: true });
      await mkBooking("b9", "d9", "A", FULL, { pay: true });
      await mkBooking("bHold", "hold", "A", FULL); await mkBooking("bHold2", "hold2", "A", FULL); await mkBooking("bRace", "race", "A", FULL);
      for (const t of ["bAgent", "bV", "bV2", "bNull", "bRL3", "bRL4", "bRL5", "bTk", "bX6", "bX1"]) await mkBooking(t, "gen", "A", { adults: 1 }, { pay: true });
      await mkBooking("bFee", "f1", "F", { adults: 1 }, { pay: true });
      await mkBooking("bPc", "pc1", "A", { adults: 1 }, { pay: true });
      await mkBooking("bB", "b1", "B", { adults: 1 }, { pay: true });
      for (let i = 0; i < 10; i++) await mkBooking(`r${i}`, "src", "A", { adults: 1 }, { pay: true });
      // ลูกค้าเอเจนซี่ (R4) · ผู้จองไม่มีเบอร์ (V-5) — ปรับฟิกซ์เจอร์ตรง ๆ หลังจอง
      await pool.query(`UPDATE "TripBooking" SET "collectMode" = 'AGENT' WHERE id = $1`, [BK.bAgent?.id]);
      await pool.query(`UPDATE "Party" SET phone = NULL, "phoneNorm" = NULL WHERE id = (SELECT "bookerPartyId" FROM "TripBooking" WHERE id = $1)`, [BK.bNull?.id]);
    } catch (e) { bookErr = e instanceof AssertFail ? e.message : errMsg(e); console.log(`  ⚠️ สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`); }
  }
  const needBk = (...tags: string[]): Bk[] => { needFx(); ok(!bookErr, `สร้างการจองทดสอบไม่สำเร็จ: ${bookErr}`); return tags.map((t) => { const b = BK[t]; ok(b, `ไม่มีการจอง ${t}`); return b as Bk; }); };
  const needSelf = () => { ok(SSI.mod, `ยังไม่มี platform/trips-self (W1.3a ยังไม่สร้าง · ${SSI.err.slice(0, 60)})`); };

  // ── ตัวช่วยของใบนี้ ──
  type Purpose = "verify" | "cancel" | "move" | "rotate";
  const snonce = (b: Bk, purpose: Purpose, ms: number): string => {
    const r = sfn("issueSelfFormNonce")({ now: new Date(NOW0.getTime() + ms), scope: { tenantId: b.tenant, purpose, token: b.token } });
    if (typeof r !== "string" || !r) throw new AssertFail(`issueSelfFormNonce ไม่คืนสตริง: ${fmt(r)}`);
    return r;
  };
  const verify = (b: Bk, o: { phone?: unknown; clientKey?: string; when?: { now: Date }; nonce?: unknown; shop?: string; token?: string } = {}) => {
    const when = o.when ?? VNOW;
    return call("verifyBookSelf", { shop: o.shop ?? b.shop, token: o.token ?? b.token, form: { phone: o.phone ?? b.phone, nonce: o.nonce ?? snonce(b, "verify", when.now.getTime() - NOW0.getTime() - 60_000) }, clientKey: o.clientKey ?? b.ck }, when);
  };
  const grantOf = async (b: Bk, when = VNOW): Promise<string> => {
    const r = await verify(b, { when });
    ok(r.ok === true && typeof r.grant === "string", `verifyBookSelf ${b.tag}: ${fmt(r)}`);
    return String(r.grant);
  };
  const cancelQ = (b: Bk, grant: unknown, when = ACT, o: { clientKey?: string; shop?: string; token?: string } = {}) =>
    call("quoteBookSelfCancel", { shop: o.shop ?? b.shop, token: o.token ?? b.token, grant, clientKey: o.clientKey ?? b.ck }, when);
  const cancelX = (b: Bk, grant: unknown, seen: unknown, o: { accept?: unknown; nonce?: string; when?: { now: Date }; clientKey?: string } = {}) => {
    const when = o.when ?? ACT;
    return call("cancelBookSelf", { shop: b.shop, token: b.token, grant, form: { seen: typeof seen === "number" ? String(seen) : seen, accept: o.accept === undefined ? "on" : o.accept, nonce: o.nonce ?? snonce(b, "cancel", when.now.getTime() - NOW0.getTime() - 60_000) }, clientKey: o.clientKey ?? b.ck }, when);
  };
  const moveQ = (b: Bk, grant: unknown, query: Rec, when = ACT) => call("quoteBookSelfMove", { shop: b.shop, token: b.token, grant, query, clientKey: b.ck }, when);
  const moveX = (b: Bk, grant: unknown, form: Rec, o: { nonce?: string; when?: { now: Date } } = {}) => {
    const when = o.when ?? ACT;
    return call("moveBookSelf", { shop: b.shop, token: b.token, grant, form: { nonce: o.nonce ?? snonce(b, "move", when.now.getTime() - NOW0.getTime() - 60_000), ...form }, clientKey: b.ck }, when);
  };
  const rotate = (b: Bk, grant: unknown, o: { nonce?: string; when?: { now: Date }; token?: string } = {}) => {
    const when = o.when ?? ACT;
    return call("rotateBookToken", { shop: b.shop, token: o.token ?? b.token, grant, form: { nonce: o.nonce ?? snonce(b, "rotate", when.now.getTime() - NOW0.getTime() - 60_000) }, clientKey: b.ck }, when);
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
  const moveTokenOf = async (b: Bk, grant: string, date: string, when = ACT): Promise<string> => {
    const r = await moveQ(b, grant, { d: date, m: date.slice(0, 7) }, when);
    const t = asRec(asRec(r.vm)?.selected)?.token;
    ok(r.ok === true && typeof t === "string" && t, `quoteBookSelfMove ${b.tag} ${date}: ไม่มี selected.token · ${fmt(r)}`);
    return String(t);
  };
  const payableOfSnap = (s: Rec) => Number(asRec(s.totals)?.payableSatang);
  const G: Record<string, string> = {}; // grant ที่ข้อหลังใช้ต่อ (ภายในอายุ X9 · เครื่องเดียวกัน)

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม (บริการของโมดูลโดยตรง · เขียวก่อนมีงาน) ──");
  await st("PC-1", "การจองทดสอบเกิดผ่านเส้นจริงของ W1.2a + ร้านรับเงิน: PAID · ยอด ฿11,450.00 · token เปิดหน้าการจองเป็น VOUCHER · Party.phoneNorm ของผู้จอง = เบอร์ที่พิมพ์ (เงื่อนไขการยืนยันเบอร์)", async () => {
    const [b] = needBk("b45");
    const r = await bRow(b.id);
    eq([r.status, r.paidSatang, payableOfSnap(r.policySnapshot), b.total], ["PAID", TOTAL, TOTAL, TOTAL], "สถานะ/ยอด");
    const o = await openRes(b, ACT);
    eq([o.ok, asRec(o.vm)?.state], [true, "VOUCHER"], "หน้าการจอง");
    const p = (await q<{ phoneNorm: string | null }>(`SELECT p."phoneNorm" FROM "Party" p JOIN "TripBooking" t ON t."bookerPartyId" = p.id WHERE t.id = $1`, [b.id]))[0];
    eq(p?.phoneNorm, b.phone, "Party.phoneNorm");
    const h = await bRow(needBk("bHold")[0].id);
    eq(h.status, "HOLD", "การจองยังไม่จ่าย");
  });
  await st("PC-2", `ยอดคืนจาก snapshot ผ่านบริการ (STAFF · QUOTE) = ค่าที่คิดเอง: 45 วัน คืน ${TOTAL} · 19 วัน คืน ${REFUND50} เก็บ ${KEPT50} (ภาพ 15) · 9 วัน คืน ${PT} เก็บ ${NONPT}`, async () => {
    const [b45, b19, b9] = needBk("b45", "b19", "b9");
    for (const [b, refund, kept] of [[b45, TOTAL, 0], [b19, REFUND50, KEPT50], [b9, PT, NONPT]] as const) {
      const r = await tcall("cancelTripBooking", staffCtx(tA, ACT), { bookingId: b.id, mode: "QUOTE", reason: "pc", idempotencyKey: `w13pc_${hex(6)}` });
      const c = asRec(asRec(r.value)?.computed);
      eq([r.ok, c?.refundSatang, c?.feeSatang], [true, refund, kept], `QUOTE ${b.tag}`);
    }
  });
  await st("PC-3", "วันนี้ PUBLIC (ไม่มี opts.publicSelf) ถูกปฏิเสธทุกทาง: cancel QUOTE ⇒ FORBIDDEN OTP_REQUIRED · requestTripRefund ⇒ FORBIDDEN · changeTripBooking ⇒ FORBIDDEN (ต้องยังเป็นแบบนี้หลังใบนี้)", async () => {
    const [b] = needBk("b19");
    const pub = { tenantId: tA, unitId: uA, channel: "WEB", actor: { kind: "PUBLIC", clientKey: `pc_${"7".repeat(40)}` }, now: ACT.now };
    const c = await tcall("cancelTripBooking", pub, { bookingId: b.id, mode: "QUOTE", reason: "pc", idempotencyKey: `w13pc_${hex(6)}` });
    eq([c.ok, c.code, asRec(c.details)?.reason], [false, "FORBIDDEN", "OTP_REQUIRED"], "cancel PUBLIC");
    const rq = await tcall("requestTripRefund", pub, { bookingId: b.id, expectedVersion: 0, reasonKind: "CUSTOMER", choice: "MONEY", reason: "pc", idempotencyKey: `w13pc_${hex(6)}` });
    eq([rq.ok, rq.code], [false, "FORBIDDEN"], "requestTripRefund PUBLIC");
    const ch = await tcall("changeTripBooking", pub, { bookingId: b.id, expectedVersion: 0, line: { productKind: "TRIP", unitId: uA, productId: PRD.A?.id, slotId: DEP.d45b, pax: [{ paxTypeId: PRD.A?.pt.ADULT, qty: 1 }] }, quoteId: "0".repeat(64), quoteExpiresAt: ACT.now.toISOString(), idempotencyKey: `w13pc_${hex(6)}` });
    eq([ch.ok, ch.code], [false, "FORBIDDEN"], "changeTripBooking PUBLIC");
    eq((await refunds(b.id)).length, 0, "ไม่มีคำขอคืนเงิน");
  });
  await st("PC-4", "เลื่อนรอบยอดเท่าเดิมทำได้จริงด้วยบริการ (STAFF · quoteTrips + changeTripBooking) บนการจองที่จ่ายแล้ว: ย้ายที่นั่ง pc1 → pc2 · ยอด/เงินที่จ่ายเท่าเดิม · รหัสเดิม", async () => {
    const [b] = needBk("bPc");
    const before = await bRow(b.id);
    const line = { productKind: "TRIP", unitId: uA, productId: PRD.A?.id, slotId: DEP.pc2, optionId: PRD.A?.opt, pax: [{ paxTypeId: PRD.A?.pt.ADULT, qty: 1 }] };
    const qt = await tcall("quoteTrips", staffCtx(tA, ACT), { lines: [line] });
    const qv = asRec(qt.value);
    ok(qt.ok === true && typeof qv?.quoteId === "string", `quoteTrips: ${fmt(qt)}`);
    const ch = await tcall("changeTripBooking", staffCtx(tA, ACT), { bookingId: b.id, expectedVersion: before.version, line, quoteId: qv?.quoteId, quoteExpiresAt: qv?.expiresAt, idempotencyKey: `w13pc_${hex(6)}` });
    ok(ch.ok === true, `changeTripBooking: ${fmt(ch)}`);
    const after = await bRow(b.id);
    eq([after.departureId, after.paidSatang, payableOfSnap(after.policySnapshot), after.code, after.status], [DEP.pc2, ONE, ONE, before.code, "PAID"], "หลังเลื่อน");
    eq([(await depRow(DEP.pc1 ?? "")).sold, (await depRow(DEP.pc2 ?? "")).sold], [0, 1], "ที่นั่งย้าย");
  });
  await st("PC-5", `ราคาเฉพาะรอบ px แพงกว่า: quoteTrips 2 ผู้ใหญ่ 1 เด็ก + กล้อง ที่รอบ px = ${TOTAL + 2 * PX_DELTA} (≠ ${TOTAL}) — ฟิกซ์เจอร์ของ PRICE_DIFFERS`, async () => {
    needBk("b45");
    const line = { productKind: "TRIP", unitId: uA, productId: PRD.A?.id, slotId: DEP.px, optionId: PRD.A?.opt, pax: [{ paxTypeId: PRD.A?.pt.ADULT, qty: 2 }, { paxTypeId: PRD.A?.pt.CHILD, qty: 1 }], extras: [{ extraId: PRD.A?.cam, qty: 1 }] };
    const qt = await tcall("quoteTrips", staffCtx(tA, ACT), { lines: [line] });
    eq([qt.ok, asRec(asRec(asRec(qt.value)?.totals)?.payable)?.satang], [true, TOTAL + 2 * PX_DELTA], "payable รอบ px");
  });
  await st("PC-6", `ค่าตั้งที่ใบนี้อ่าน มีค่าเริ่มตาม TRIPS-DEFAULTS: X9 otpValidMinutes ${X9_MIN} · X8 otpPer15Min ${X8_VERIFY} · X16 moveFreeWithinDays ${X16_DAYS} · snapshot ของสินค้า F จด changeDateFee ${FEE} · สินค้า A = null`, async () => {
    const [b, f] = needBk("b45", "bFee");
    const rs = SETI.mod?.resolveSettings;
    ok(typeof rs === "function", "ไม่มี resolveSettings");
    const v = asRec(await (rs as AnyFn)({ tenantId: tA }, ["trips.public.otpValidMinutes", "trips.public.rateLimits", "trips.cancel.moveFreeWithinDays"], { unitId: uA, productId: PRD.A?.id }, ACT.now)) ?? {};
    eq([asRec(v["trips.public.otpValidMinutes"])?.value, asRec(asRec(v["trips.public.rateLimits"])?.value)?.otpPer15Min, asRec(v["trips.cancel.moveFreeWithinDays"])?.value], [X9_MIN, X8_VERIFY, X16_DAYS], "ค่าตั้ง");
    eq([(await bRow(f.id)).policySnapshot.changeDateFee, (await bRow(b.id)).policySnapshot.changeDateFee], [FEE, null], "snapshot changeDateFee");
  });
  await st("PC-7", "รอบ last เหลือ 1 ที่ (12 − 11) · รอบ fullApr เต็ม · รอบ src มีการจอง 10 ราย (ผู้ใหญ่ 1 คน/ราย) — ฟิกซ์เจอร์ของ X3 เลื่อนชนที่นั่งสุดท้าย", async () => {
    needBk("r0", "r9");
    const l = await depRow(DEP.last ?? ""), f = await depRow(DEP.fullApr ?? ""), s = await depRow(DEP.src ?? "");
    eq([l.capacity - l.sold - l.held, f.capacity - f.sold - f.held, s.sold], [1, 0, 10], "ที่ว่าง");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์/กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const compFiles = walk(COMP);
  const selfComp = compFiles.filter((f) => /BookSelf/.test(basename(f)));
  const uiSrc = [PAGE_RES, ACTIONS, ...compFiles].map((f) => stripComments(read(f))).join("\n");
  const needOwn = () => { const miss = OWN.filter((f) => !existsSync(join(ROOT, f))); ok(miss.length === 0, `ยังไม่มีไฟล์: ${miss.join(", ")}`); };
  await st("S-1", `ไฟล์ของใบมีครบ: ${OWN.map((f) => basename(f)).join(" · ")} + จอ BookSelf*.tsx ≥ 1`, () => { needOwn(); ok(selfComp.length >= 1, "ไม่มี src/components/book/BookSelf*.tsx"); });
  await st("S-2", `trips-self-core ส่งออก ${SCORE_NAMES.length} ชื่อ · trips-self ส่งออก ${SSVC_FNS.join(" · ")} · actions ส่งออก ${ACTION_NAMES.join(" · ")} เท่านั้น ('use server')`, () => {
    for (const n of SCORE_NAMES) coreV(n);
    for (const n of SSVC_FNS) sfn(n);
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
  await st("S-4", "trips-self.ts: ถังอัตราด้วย rateBucketCte (ห้าม checkRateLimitDb*) · ไม่มี $queryRawUnsafe/$executeRawUnsafe · ไม่ส่ง partyId/phone เข้าบริการ · ไม่ต่อ SMS/อีเมล/LINE", () => {
    const s = stripComments(read(SSVC));
    ok(s, "ยังไม่มีไฟล์");
    ok(/rateBucketCte/.test(s), "ไม่ใช้ rateBucketCte");
    ok(!/checkRateLimitDb/.test(s), "ห้าม checkRateLimitDb* (เปิดเมื่อพัง)");
    ok(!/\$(queryRaw|executeRaw)Unsafe/.test(s), "ห้าม raw unsafe");
    ok(!/partyId\s*:/.test(s), "ห้ามส่ง partyId เข้าบริการ");
    ok(!/sendSms|sendEmail|notifyCustomer|pushLine/.test(s), "ใบนี้ไม่ส่งข้อความ (ห้ามสัญญาแจ้งเตือน)");
  });
  await st("S-5", "บริการ T0.6/T0.7 รับ PUBLIC ผ่าน opts.publicSelf เท่านั้น: booking.ts + refund.ts มี publicSelf ในบล็อก TRIPS W1.3 · ไม่อ่านค่าจากคำขอ (ไม่มี FormData/headers ในบริการ)", () => {
    const b = read(BOOKING), r = read(REFUND);
    ok(/publicSelf/.test(b) && /publicSelf/.test(r), "ไม่มี publicSelf ใน booking.ts/refund.ts");
    ok(/TRIPS W1\.3/.test(b) && /TRIPS W1\.3/.test(r), "การแก้บริการต้องอยู่ในบล็อกรั้ว // TRIPS W1.3 ▸ … ◂");
    ok(!/FormData|next\/headers/.test(stripComments(b) + stripComments(r)), "บริการห้ามอ่านคำขอ");
  });
  await st("S-6", "หน้า my/[token]: force-dynamic · noindex/nofollow · no-referrer · ไม่มีคุกกี้ใหม่ (cookies().set) · ไม่มี dangerouslySetInnerHTML/fetch/onClick ส่งฟอร์มเอง · ฟอร์มเป็น <form action={…}>", () => {
    needOwn();
    const s = stripComments(read(PAGE_RES));
    ok(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(s), "ต้อง force-dynamic");
    ok(/robots\s*:\s*\{\s*index\s*:\s*false\s*,\s*follow\s*:\s*false\s*\}/.test(s) && /referrer\s*:\s*["']no-referrer["']/.test(s), "ต้อง noindex + no-referrer");
    ok(!/cookies\(\)[\s\S]{0,40}\.set\(|Set-Cookie/.test(uiSrc), "ห้ามตั้งคุกกี้");
    ok(!/dangerouslySetInnerHTML/.test(uiSrc) && !/\bfetch\(/.test(uiSrc), "ห้าม dangerouslySetInnerHTML/fetch");
    ok(/<form[^>]*action=\{/.test(selfComp.map((f) => read(f)).join("\n") + read(PAGE_RES)), "ไม่มี <form action={serverAction}> ในจอของใบ");
    ok(!walk("src/app/book").some((f) => /\/(route|loading|error)\.tsx?$/.test(f)), "ห้าม route/loading/error ใต้ /book");
  });
  await st("S-7", `data-testid ของใบครบ ${TESTIDS.length} ตัว + แพตเทิร์น ${TESTID_PATTERNS.join(" ")}`, () => {
    needOwn();
    const miss = TESTIDS.filter((t) => !new RegExp(`["'\`]${t}["'\`]`).test(uiSrc));
    ok(miss.length === 0, `ไม่มี testid: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` (+${miss.length - 8})` : ""}`);
    const missP = TESTID_PATTERNS.filter((t) => !uiSrc.includes(`\`${t}\${`));
    ok(missP.length === 0, `ไม่มีแพตเทิร์น: ${missP.join(", ")}`);
  });
  await st("S-8", `ฉากภาพ w1.3 ใน visual-trips.mts: ${VISUAL_SCENES.join(" · ")} · ทุกฉาก public · เตรียมการจองบนรอบชั่วคราวของตัวเองและลบของตัวเองหลังถ่าย (ไม่ทิ้งที่ถือ/การจองบนรอบของ seed)`, () => {
    const v = read("scripts/visual-trips.mts");
    ok(/["']w1\.3["']\s*:/.test(v), "ไม่มีสเปก w1.3");
    const block = v.slice(v.search(/["']w1\.3["']\s*:/));
    const miss = VISUAL_SCENES.filter((n) => !new RegExp(`name:\\s*["']${n}["']`).test(block));
    ok(miss.length === 0, `ไม่มีฉาก: ${miss.join(", ")}`);
    ok(/w13Prepare/.test(v) && /w13Cleanup/.test(v), "ต้องมีตัวเตรียม (w13Prepare) + ตัวล้าง (w13Cleanup) ของฉาก w1.3");
    ok(/finally[\s\S]{0,400}w13Cleanup/.test(v), "ตัวล้างต้องวิ่งใน finally");
    ok(!/[A-Za-z0-9_-]{43}/.test(block.slice(0, 3_000).replace(/name:\s*["'][^"']+["']/g, "")), "มี token ฝังในสเปก");
  });
  await st("S-9", "ไม่มี 'any' · ไม่มี @ts-ignore/@ts-expect-error/eslint-disable ในไฟล์ของใบ", () => {
    needOwn();
    for (const f of [...OWN, ...selfComp]) {
      const s = stripComments(read(f));
      ok(!/:\s*any\b|<any>|\bas any\b|any\[\]/.test(s), `${basename(f)} มี any`);
      ok(!/@ts-ignore|@ts-expect-error|eslint-disable/.test(read(f)), `${basename(f)} มีธงปิดตัวตรวจ`);
    }
  });
  await st("S-10", `ขอบเขต (เทียบ BASE ${BASE_SHA} · ไม่นับไฟล์ที่ตรงกับ session/trips · ไม่นับ scratchpad/): ไม่แตะ prisma/proxy/core/i18n/payment/api/(store) · modules/platform นอกไฟล์ของใบ · ข้อสอบเดิม · seed/fixture · ไฟล์จำกัดตามงบ · ไม่มี migration`, () => {
    const tip = git(["rev-parse", "--verify", "-q", "session/trips"]).trim() || git(["rev-parse", "--verify", "-q", "origin/session/trips"]).trim();
    const same = (f: string) => !!tip && git(["ls-files", "--", f]).trim() !== "" && git(["diff", "--name-only", tip, "--", f]).trim() === "";
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...FORBIDDEN_PATHS]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...FORBIDDEN_PATHS]).split("\n")].filter(Boolean))]
      .filter((f) => !f.startsWith("scratchpad/"));
    const bad = changed.filter((f) => !same(f));
    ok(bad.length === 0, `แตะไฟล์นอกขอบเขต: ${bad.slice(0, 6).join(", ")}`);
    // ฉากภาพ w1.3 ผู้ร่างเพิ่มพร้อมข้อสอบ ⇒ งบของ visual-trips นับจาก commit ที่ลงข้อสอบนี้ (ยังไม่ commit = BASE)
    const oracleBase = git(["log", "-1", "--format=%H", "--", "scripts/qc-trips-w1.3.mts"]).trim() || BASE_SHA;
    for (const [f, maxDel, maxAdd] of LIMITED) {
      if (same(f)) continue;
      const ns = git(["diff", "--numstat", f === "scripts/visual-trips.mts" ? oracleBase : BASE_SHA, "--", f]).trim().split(/\s+/);
      const add = Number(ns[0] || 0), del = Number(ns[1] || 0);
      ok(del <= maxDel && (maxAdd === null || add <= maxAdd), `${f}: +${add} −${del} (จำกัด −${maxDel}${maxAdd === null ? "" : ` +${maxAdd}`})`);
    }
    ok(!git(["diff", "--name-only", BASE_SHA, "--", "prisma"]).trim(), "ใบนี้ไม่มี migration");
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: trips-self-core ──");
  await st("P-1", "ค่าคงที่ตามใบสั่ง §3.1: รหัสผิด 17 · block 9 · SELF_MOVES_MAX 1 · SELF_VERIFY_PER_BOOKING_PER_HOUR 10 · SELF_NONCE_PURPOSES · SELF_GRANT_RE", () => {
    eq([...(coreV("SELF_ERROR_CODES") as string[])].sort(), [...ERROR_CODES].sort(), "SELF_ERROR_CODES");
    eq([...(coreV("SELF_BLOCKS") as string[])].sort(), [...BLOCKS].sort(), "SELF_BLOCKS");
    eq([coreV("SELF_MOVES_MAX"), coreV("SELF_VERIFY_PER_BOOKING_PER_HOUR")], [1, 10], "เพดาน");
    eq([...(coreV("SELF_NONCE_PURPOSES") as string[])].sort(), ["cancel", "move", "rotate", "verify"], "วัตถุประสงค์ nonce");
    const re = coreV("SELF_GRANT_RE");
    ok(re instanceof RegExp && re.test(`g1.1700000000.${"A".repeat(22)}`) && !re.test(`g2.1.${"A".repeat(22)}`) && !re.test(`g1.1.${"A".repeat(21)}`), "SELF_GRANT_RE");
  });
  const MAN0 = { status: "PAID", agent: false, startsAt: "2027-04-15T01:00:00.000Z", now: "2027-03-01T03:00:00.000Z", changeDateFee: null, openRefund: false, selfMoves: 0 };
  await st("P-2", "selfManageOf ตามลำดับใบสั่ง: AGENT → ENDED → STARTED → REFUND_IN_PROGRESS → ยังไม่จ่าย (UNPAID · NOT_SOLD) → ขายแล้ว (REFUND_REQUEST + move ถ้าไม่มีค่าเปลี่ยนวันและยังไม่เลื่อนครบ)", () => {
    const f = P("selfManageOf");
    const cases: [Rec, Rec][] = [
      [{}, { cancel: "REFUND_REQUEST", move: true, block: null }],
      [{ status: "PART_PAID" }, { cancel: "REFUND_REQUEST", move: true, block: null }],
      [{ status: "CONFIRMED" }, { cancel: "REFUND_REQUEST", move: true, block: null }],
      [{ status: "HOLD" }, { cancel: "UNPAID", move: false, block: "NOT_SOLD" }],
      [{ status: "PENDING" }, { cancel: "UNPAID", move: false, block: "NOT_SOLD" }],
      [{ agent: true }, { cancel: null, move: false, block: "AGENT" }],
      [{ agent: true, status: "CANCELLED" }, { cancel: null, move: false, block: "AGENT" }],
      [{ status: "CANCELLED" }, { cancel: null, move: false, block: "ENDED" }],
      [{ status: "EXPIRED" }, { cancel: null, move: false, block: "ENDED" }],
      [{ status: "TRAVELLED" }, { cancel: null, move: false, block: "ENDED" }],
      [{ now: "2027-04-15T01:00:00.000Z" }, { cancel: null, move: false, block: "STARTED" }],
      [{ status: "HOLD", now: "2027-04-15T02:00:00.000Z" }, { cancel: null, move: false, block: "STARTED" }],
      [{ openRefund: true }, { cancel: null, move: false, block: "REFUND_IN_PROGRESS" }],
      [{ changeDateFee: 20_000 }, { cancel: "REFUND_REQUEST", move: false, block: "FEE" }],
      [{ changeDateFee: 0 }, { cancel: "REFUND_REQUEST", move: true, block: null }],
      [{ selfMoves: 1 }, { cancel: "REFUND_REQUEST", move: false, block: "MOVE_LIMIT" }],
    ];
    for (const [patch, want] of cases) eq(f({ ...MAN0, ...patch }), want, `selfManageOf ${fmt(patch)}`);
  });
  await st("P-3", "selfManageOf อินพุตผิดรูป/สถานะไม่รู้จัก ⇒ {null,false,ENDED} ไม่ throw", () => {
    const f = P("selfManageOf");
    for (const bad of [null, undefined, 42, "x", [], { ...MAN0, status: "WHAT" }, { ...MAN0, now: "not-a-date" }, { ...MAN0, startsAt: null }]) {
      let r: unknown;
      try { r = f(bad); } catch (e) { throw new AssertFail(`throw กับ ${fmt(bad)}: ${errMsg(e)}`); }
      eq(r, { cancel: null, move: false, block: "ENDED" }, `ผิดรูป ${fmt(bad)}`);
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
  await st("LG-1", `book.json ไทย/อังกฤษมีคีย์ของใบครบ ${I18N_REQUIRED.length} คีย์ · อังกฤษไม่มีอักษรไทย · ไม่มีรหัสดิบ/รหัสใบงาน`, () => {
    const miss = I18N_REQUIRED.filter((k) => typeof th[k] !== "string" || !String(th[k]).trim() || typeof en[k] !== "string" || !String(en[k]).trim());
    ok(miss.length === 0, `คีย์ขาด: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` (+${miss.length - 8})` : ""}`);
    const thaiInEn = I18N_REQUIRED.filter((k) => /[ก-๙]/.test(String(en[k] ?? "")));
    ok(thaiInEn.length === 0, `อังกฤษมีอักษรไทย: ${thaiInEn.slice(0, 4).join(", ")}`);
    const raw = I18N_REQUIRED.flatMap((k) => [String(th[k] ?? ""), String(en[k] ?? "")]).filter((v) => /\b([WTAKLSX]\d\.\d+[abc]?|OQ\d+)\b|\b(VERIFY_FAILED|NOT_ALLOWED|REFUND_IN_PROGRESS|MOVE_LIMIT|PRICE_DIFFERS|QUOTED|EXECUTING)\b/.test(v));
    ok(raw.length === 0, `ค่ามีรหัส: ${raw.slice(0, 3).join(" | ")}`);
  });
  await st("LG-2", "⚖️ ข้อความ self.* ไม่สัญญาสิ่งที่ระบบทำไม่ได้: วันโอนคืน (ภายใน N วัน) · คืนอัตโนมัติ · ส่ง SMS/OTP/รหัส/อีเมล/แจ้งเตือน · ร้านจะติดต่อ · ใบลดหนี้ · ข้อความยื่นคำขอบอกว่าร้านเป็นผู้พิจารณา + มีช่องทางติดต่อ {contact}", () => {
    const vals = Object.entries({ ...th, ...Object.fromEntries(Object.entries(en).map(([k, v]) => [`en:${k}`, v])) }).filter(([k]) => /(^|:)self\./.test(k)).map(([k, v]) => [k, String(v)] as const);
    ok(vals.length > 0, "ยังไม่มีคีย์ self.*");
    const bad = vals.filter(([, v]) => /ภายใน\s*\d+\s*(วัน|ชั่วโมง)|within\s+\d+\s+(business\s+)?(days?|hours?)|อัตโนมัติ|automatic|\bSMS\b|\bOTP\b|รหัส(ยืนยัน|ที่ส่ง)|code (we )?sent|ส่งรหัส|แจ้งเตือน|notif|ร้านจะติดต่อ|we will contact|will contact you|ใบลดหนี้|credit note|ใบเสร็จ.*ส่ง/i.test(v));
    ok(bad.length === 0, `สัญญาที่ระบบทำไม่ได้: ${bad.slice(0, 3).map(([k, v]) => `${k}=${v}`).join(" | ")}`);
    const req = [String(th["self.cancel.requested"] ?? ""), String(en["self.cancel.requested"] ?? "")];
    ok(/ร้าน/.test(req[0] ?? "") && /\{contact\}/.test(req[0] ?? "") && /shop/i.test(req[1] ?? "") && /\{contact\}/.test(req[1] ?? ""), `self.cancel.requested ต้องบอกว่าร้านพิจารณา + {contact}: ${fmt(req)}`);
    ok(!vals.some(([, v]) => /บัญชีธนาคาร|เลขบัญชี|bank account/i.test(v)), "ห้ามขอเลขบัญชีธนาคารผ่านหน้านี้");
  });
  groupLine("LG");

  // ═══════════════ V. ยืนยันเบอร์ + grant ═══════════════
  console.log("\n── V: ยืนยันเบอร์ผู้จอง + สิทธิ์แก้ชั่วคราว ──");
  await st("V-1", `เบอร์ถูก (รูปท้องถิ่น) ⇒ grant ตาม SELF_GRANT_RE · expiresAt = เวลายืนยัน + X9 (${X9_MIN} นาที) พอดี · ผลมีแค่ ok/grant/expiresAt/shopSlug`, async () => {
    needSelf(); const [b] = needBk("bV");
    const r = await verify(b);
    ok(r.ok === true && typeof r.grant === "string" && /^g1\.\d{1,12}\.[A-Za-z0-9_-]{22}$/.test(String(r.grant)), `verify: ${fmt(r)}`);
    eq(r.expiresAt, new Date(VNOW.now.getTime() + X9_MIN * MIN).toISOString(), "expiresAt");
    eq(Object.keys(r).sort(), ["expiresAt", "grant", "ok", "shopSlug"], "คีย์ผล");
    eq(r.shopSlug, SA, "shopSlug");
  });
  await st("V-2", "เบอร์รูปอื่นของเบอร์เดียวกัน (+66 · มีขีด/ช่องว่าง) ⇒ ผ่าน", async () => {
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
  await st("V-5", "ผู้จองไม่มีเบอร์ (Party.phone ว่าง) ⇒ VERIFY_FAILED รูปเดียวกับเบอร์ผิด (ไม่บอกว่า \"ไม่มีเบอร์\")", async () => {
    needSelf(); const [b] = needBk("bNull");
    const a = await verify(b, { clientKey: ck() }), w = await verify(b, { phone: "0899999998", clientKey: ck() });
    ERR(a, "VERIFY_FAILED", "เบอร์เดิมของผู้จองที่ถูกลบ"); ERR(w, "VERIFY_FAILED", "เบอร์อื่น");
    eq(Object.keys(a).sort(), Object.keys(w).sort(), "รูปผลเท่ากัน");
  });
  await st("V-6", "nonce: ไม่มี ⇒ INVALID[nonce] · วัตถุประสงค์อื่น (cancel) ⇒ INVALID · ผูก token อื่น ⇒ INVALID · nonce ถือที่ของ W1.2 ⇒ INVALID · ออกพร้อมส่ง ⇒ TOO_FAST · เกิน 2 ชม. ⇒ STALE_FORM — ไม่มี grant", async () => {
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
  await st("V-8", `grant หมดอายุตาม X9: ใช้ที่ +${X9_MIN - 1} นาที ⇒ ผ่าน (quote ยกเลิก) · ที่ +${X9_MIN + 1} นาที ⇒ VERIFY_REQUIRED`, async () => {
    needSelf(); const [b] = needBk("bV");
    const g = await grantOf(b);
    const r1 = await cancelQ(b, g, at(VMS + (X9_MIN - 1) * MIN));
    ok(r1.ok === true, `ก่อนหมด: ${fmt(r1)}`);
    ERR(await cancelQ(b, g, at(VMS + (X9_MIN + 1) * MIN)), "VERIFY_REQUIRED", "หลังหมด");
  });
  await st("V-9", "grant ผูกเครื่อง: เครื่องอื่นถือ grant เดียวกัน ⇒ VERIFY_REQUIRED (Q3)", async () => {
    needSelf(); const [b] = needBk("bV");
    const g = await grantOf(b);
    ERR(await cancelQ(b, g, ACT, { clientKey: ck() }), "VERIFY_REQUIRED", "เครื่องอื่น");
  });
  await st("V-10", "grant ปลอม (แก้ 1 ตัว · หมดอายุไกล · รูปผิด) ⇒ VERIFY_REQUIRED รูปเดียว", async () => {
    needSelf(); const [b] = needBk("bV");
    const g = await grantOf(b);
    const flip = g.slice(0, -1) + (g.endsWith("A") ? "B" : "A");
    const far = g.replace(/^g1\.(\d+)\./, (_m, s: string) => `g1.${Number(s) + 86_400}.`);
    for (const x of [flip, far, "g1", `g1.${Math.floor(ACT.now.getTime() / 1000) + 600}.${"A".repeat(22)}`]) ERR(await cancelQ(b, x, ACT), "VERIFY_REQUIRED", `grant ${x.slice(0, 20)}…`);
  });
  await st("V-11", "ผู้ถือลิงก์อย่างเดียว (ไม่มี grant) ⇒ VERIFY_REQUIRED ทุกทางแก้ (quote/ยกเลิก/เลื่อน/ขอลิงก์ใหม่) · ไม่มีการเขียนฐาน", async () => {
    needSelf(); const [b] = needBk("bV");
    const v0 = await bRow(b.id);
    ERR(await cancelQ(b, undefined), "VERIFY_REQUIRED", "quote ยกเลิก");
    ERR(await cancelX(b, undefined, ONE), "VERIFY_REQUIRED", "ยกเลิก");
    ERR(await moveQ(b, undefined, { m: "2027-04" }), "VERIFY_REQUIRED", "quote เลื่อน");
    ERR(await moveX(b, undefined, { d: "2027-04-16", t: "x", seen: String(ONE) }), "VERIFY_REQUIRED", "เลื่อน");
    ERR(await rotate(b, undefined), "VERIFY_REQUIRED", "ขอลิงก์ใหม่");
    const v1 = await bRow(b.id);
    eq([v1.version, v1.publicTokenHash, (await refunds(b.id)).length], [v0.version, v0.publicTokenHash, 0], "ไม่เปลี่ยน");
  });
  groupLine("V");

  // ═══════════════ M. ก้อนจัดการบนหน้าการจอง ═══════════════
  console.log("\n── M: ก้อนจัดการบนหน้าการจอง (openBookReservation vm.manage) ──");
  await st("M-1", "จ่ายแล้ว 45 วัน ⇒ manage {cancel:REFUND_REQUEST, move:true, block:null, refund:null}", async () => {
    const [b] = needBk("b45x");
    eq(await manageOf(b), { cancel: "REFUND_REQUEST", move: true, block: null, refund: null }, "manage");
  });
  await st("M-2", "ยังไม่จ่าย (HOLD) ⇒ {cancel:UNPAID, move:false, block:NOT_SOLD, refund:null}", async () => {
    const [b] = needBk("bHold");
    eq(await manageOf(b), { cancel: "UNPAID", move: false, block: "NOT_SOLD", refund: null }, "manage");
  });
  await st("M-3", "การจองเอเจนซี่ (R4) ⇒ {cancel:null, move:false, block:AGENT} · ยืนยันเบอร์ ⇒ NOT_ALLOWED{AGENT} ไม่มี grant", async () => {
    const [b] = needBk("bAgent");
    eq(await manageOf(b), { cancel: null, move: false, block: "AGENT", refund: null }, "manage");
    needSelf();
    BLOCKED(await verify(b), "AGENT", "ยืนยันเบอร์");
  });
  await st("M-4", "สินค้ามีค่าเปลี่ยนวันใน snapshot ⇒ เลื่อนไม่ได้ (block FEE) แต่ยกเลิกได้", async () => {
    const [b] = needBk("bFee");
    eq(await manageOf(b), { cancel: "REFUND_REQUEST", move: false, block: "FEE", refund: null }, "manage");
  });
  await st("M-5", "หลังรอบออกเดินทางแล้ว (9 มี.ค. → นาฬิกา 10 มี.ค. 09:00) ⇒ {null,false,STARTED} · ยืนยันเบอร์ ⇒ NOT_ALLOWED{STARTED}", async () => {
    const [b] = needBk("b9");
    const T9 = { now: BKK("2027-03-10", "09:00") };
    eq(await manageOf(b, T9), { cancel: null, move: false, block: "STARTED", refund: null }, "manage");
    needSelf();
    BLOCKED(await verify(b, { when: T9 }), "STARTED", "ยืนยันเบอร์หลังออกเดินทาง");
  });
  groupLine("M");

  // ═══════════════ CN. ยกเลิก ═══════════════
  console.log("\n── CN: ยกเลิก (ก่อนจ่าย = ทันที · จ่ายแล้ว = คำขอคืนเงินตาม snapshot) ──");
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
    needSelf(); const [b45, b9] = needBk("b45x", "b9");
    const a = asRec((await cancelQ(b45, await grantOf(b45))).vm) ?? {};
    eq([a.kind, a.refundSatang, a.keptSatang, a.refundPct], ["REFUND_REQUEST", TOTAL, 0, 100], "45 วัน");
    const c = asRec((await cancelQ(b9, await grantOf(b9))).vm) ?? {};
    eq([c.kind, c.refundSatang, c.keptSatang, c.refundPct], ["REFUND_REQUEST", PT, NONPT, 0], "9 วัน");
  });
  await st("CN-3", "ยอดที่เห็นไม่ตรง (seen ต่าง 1 บาท) ⇒ AMOUNT_CHANGED{refundSatang = ยอดจริง} · ไม่มีคำขอ · ไม่ติ๊กยอมรับ ⇒ ACCEPT_REQUIRED · ไม่มีคำขอ", async () => {
    needSelf(); const [b] = needBk("b19");
    const g = await grantOf(b);
    const r = await cancelX(b, g, REFUND50 - 100);
    ok(r.ok === false && r.code === "AMOUNT_CHANGED" && r.refundSatang === REFUND50, `seen ผิด: ${fmt(r)}`);
    ERR(await cancelX(b, g, REFUND50, { accept: "" }), "ACCEPT_REQUIRED", "ไม่ยอมรับ");
    eq((await refunds(b.id)).length, 0, "ไม่มีคำขอ");
  });
  await st("CN-4", `ยื่นยกเลิกการจองที่จ่ายแล้ว (19 วัน · seen ${REFUND50}) ⇒ REFUND_REQUESTED · คำขอ 1 แถว QUOTED ยอด ${REFUND50} · CUSTOMER · MONEY · by CUSTOMER · การจองยัง PAID · ที่นั่งไม่ปล่อย (OQ22) · เงินที่รับไม่เปลี่ยน`, async () => {
    needSelf(); const [b] = needBk("b19");
    const d0 = await depRow(b.dep);
    G.b19 = await grantOf(b);
    const r = await cancelX(b, G.b19, REFUND50);
    eq([r.ok, r.result, r.refundSatang, r.replayed], [true, "REFUND_REQUESTED", REFUND50, false], "ผล");
    const rr = await refunds(b.id);
    eq(rr.map((x) => [x.status, x.amountSatang, x.reasonKind, x.choice, x.by]), [["QUOTED", REFUND50, "CUSTOMER", "MONEY", "CUSTOMER"]], "คำขอคืนเงิน");
    const row = await bRow(b.id), d1 = await depRow(b.dep);
    eq([row.status, row.paidSatang, d1.sold, d1.held], ["PAID", TOTAL, d0.sold, d0.held], "การจอง/ที่นั่ง");
  });
  await st("CN-5", "หลังยื่น: หน้าการจองแสดง refund {QUOTED, ยอด} + block REFUND_IN_PROGRESS · ยืนยันเบอร์ใหม่ ⇒ NOT_ALLOWED{REFUND_IN_PROGRESS} · grant เดิม + ฟอร์มยกเลิกใหม่ ⇒ DONE{refund} ยังมี 1 แถว · เลื่อน ⇒ NOT_ALLOWED{REFUND_IN_PROGRESS}", async () => {
    needSelf(); const [b] = needBk("b19");
    eq(await manageOf(b), { cancel: null, move: false, block: "REFUND_IN_PROGRESS", refund: { status: "QUOTED", amountSatang: REFUND50 } }, "manage");
    BLOCKED(await verify(b, { clientKey: ck() }), "REFUND_IN_PROGRESS", "ยืนยันเบอร์ขณะคำขอเปิด");
    const g = G.b19 ?? "";
    ok(g, "ไม่มี grant จาก CN-4");
    const r = await cancelX(b, g, REFUND50);
    ok(r.ok === false && r.code === "DONE" && isDeepStrictEqual(r.refund, { status: "QUOTED", amountSatang: REFUND50 }), `ยื่นซ้ำ: ${fmt(r)}`);
    eq((await refunds(b.id)).length, 1, "คำขอยัง 1 แถว");
    BLOCKED(await moveX(b, g, { d: "2027-03-21", t: "x", seen: String(TOTAL) }), "REFUND_IN_PROGRESS", "เลื่อนระหว่างคำขอเปิด");
  });
  await st("CN-6", "ยกเลิกการจองที่ยังไม่จ่าย (HOLD): quote UNPAID คืน 0 · ยกเลิก (seen 0) ⇒ CANCELLED ทันที · ที่ถือคืนรอบ (held 0) · ไม่มีคำขอคืนเงิน · หน้าการจอง = CANCELLED · ยืนยันซ้ำ ⇒ NOT_ALLOWED{ENDED}", async () => {
    needSelf(); const [b] = needBk("bHold");
    const g = await grantOf(b);
    const qv = asRec((await cancelQ(b, g)).vm) ?? {};
    eq([qv.kind, qv.paidSatang, qv.refundSatang], ["UNPAID", 0, 0], "quote");
    eq((await depRow(b.dep)).held, b.seats, "ก่อนยกเลิก held = ที่นั่งของการจอง");
    const r = await cancelX(b, g, 0);
    eq([r.ok, r.result, r.refundSatang], [true, "CANCELLED", 0], "ผล");
    eq([(await bRow(b.id)).status, (await depRow(b.dep)).held, (await refunds(b.id)).length], ["CANCELLED", 0, 0], "หลังยกเลิก");
    eq(asRec((await openRes(b)).vm)?.state, "CANCELLED", "หน้าการจอง");
    BLOCKED(await verify(b, { clientKey: ck() }), "ENDED", "ยืนยันหลังยกเลิก");
  });
  await st("CN-7", "ร้านแก้ตารางยกเลิกหลังจอง (0% ทุกขั้น) ⇒ การจองเดิมยังคิดจาก snapshot: 45 วันคืนเต็ม (ข้อบังคับข้ามใบ ข)", async () => {
    needSelf(); const [b] = needBk("bPx");
    await setV(tA, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: PRD.A?.id, value: [{ fromDaysBefore: 0, refundPct: 0 }] }]);
    const vm = asRec((await cancelQ(b, await grantOf(b))).vm) ?? {};
    eq([vm.refundSatang, vm.refundPct], [TOTAL, 100], "ยังคืนตาม snapshot");
  });
  groupLine("CN");

  // ═══════════════ MV. เลื่อนรอบ ═══════════════
  console.log("\n── MV: เลื่อนรอบ (สินค้าเดิม · ยอดเท่าเดิม · 1 ครั้ง) ──");
  await st("MV-1", "quote เดือน เม.ย.: 16 เม.ย. เลือกได้ (left ≥ 3) · 19 เม.ย. (เต็ม) เลือกไม่ได้ · 18 เม.ย. (รอบยกเลิก) ไม่มีหรือเลือกไม่ได้ · ก.ค. 20 (เกิน X16 90 วัน) เลือกไม่ได้ · ไม่มีคีย์ภายใน", async () => {
    needSelf(); const [b] = needBk("b45");
    const g = await grantOf(b);
    const r = await moveQ(b, g, { m: "2027-04" });
    ok(r.ok === true, `quote: ${fmt(r)}`);
    const days = asArr(asRec(r.vm)?.days);
    const day = (d: string) => days.find((x) => x.date === d);
    ok(day("2027-04-16")?.selectable === true && Number(day("2027-04-16")?.left) >= 3, `16 เม.ย.: ${fmt(day("2027-04-16"))}`);
    ok(day("2027-04-19")?.selectable === false, `19 เม.ย. เต็ม: ${fmt(day("2027-04-19"))}`);
    ok(!day("2027-04-18") || day("2027-04-18")?.selectable === false, `18 เม.ย. ยกเลิก: ${fmt(day("2027-04-18"))}`);
    const j = await moveQ(b, g, { m: "2027-07" });
    const jd = asArr(asRec(j.vm)?.days).find((x) => x.date === "2027-07-20");
    ok(j.ok === true && (!jd || jd.selectable === false), `20 ก.ค. นอกหน้าต่าง: ${fmt(jd)}`);
    noInternal(r.vm, [b.id, ...Object.values(DEP)], "vm เลื่อน", [b.phone]);
  });
  await st("MV-2", `quote วัน 16 เม.ย. ⇒ selected (token) · summary {totalSatang ${TOTAL}, sameTotal true} · form.nonce`, async () => {
    needSelf(); const [b] = needBk("b45");
    const r = await moveQ(b, await grantOf(b), { d: "2027-04-16", m: "2027-04" });
    const vm = asRec(r.vm) ?? {};
    ok(r.ok === true && typeof asRec(vm.selected)?.token === "string", `selected: ${fmt(r)}`);
    eq(vm.summary, { totalSatang: TOTAL, sameTotal: true }, "summary");
    ok(typeof asRec(vm.form)?.nonce === "string", "ไม่มี form.nonce");
  });
  await st("MV-3", "เลื่อน 15 → 16 เม.ย. ⇒ ok · การจองย้ายรอบ (departureId · travelDate) · version +1 · ยอด/เงินที่จ่าย/รหัสเท่าเดิม · ตารางยกเลิกใน snapshot เดิม · ที่นั่ง d45 −3 · d45b +3 · token เดิมเปิดหน้าเห็นวันใหม่", async () => {
    needSelf(); const [b] = needBk("b45");
    const g = await grantOf(b);
    const before = await bRow(b.id), s45 = await depRow(DEP.d45 ?? ""), s45b = await depRow(DEP.d45b ?? "");
    const t = await moveTokenOf(b, g, "2027-04-16");
    const r = await moveX(b, g, { d: "2027-04-16", t, seen: String(TOTAL) });
    eq([r.ok, r.date, r.replayed], [true, "2027-04-16", false], `ผล ${fmt(r)}`);
    const after = await bRow(b.id);
    eq([after.departureId, after.travelDate, after.version, after.paidSatang, payableOfSnap(after.policySnapshot), after.code, after.status],
      [DEP.d45b, "2027-04-16", before.version + 1, TOTAL, TOTAL, before.code, "PAID"], "การจอง");
    eq(after.policySnapshot.cancelLadder, before.policySnapshot.cancelLadder, "ตารางยกเลิกคงเดิม");
    eq([(await depRow(DEP.d45 ?? "")).sold, (await depRow(DEP.d45b ?? "")).sold], [s45.sold - 3, s45b.sold + 3], "ที่นั่ง");
    eq(asRec((await openRes(b)).vm)?.date, "2027-04-16", "หน้าการจอง");
  });
  await st("MV-4", "เลื่อนครบ 1 ครั้งแล้ว ⇒ manage.move false (MOVE_LIMIT) · เลื่อนอีก ⇒ NOT_ALLOWED{MOVE_LIMIT} ไม่เปลี่ยน", async () => {
    needSelf(); const [b] = needBk("b45");
    eq(await manageOf(b), { cancel: "REFUND_REQUEST", move: false, block: "MOVE_LIMIT", refund: null }, "manage");
    const v = (await bRow(b.id)).version;
    BLOCKED(await moveX(b, await grantOf(b), { d: "2027-04-15", t: "x", seen: String(TOTAL) }), "MOVE_LIMIT", "เลื่อนครั้งที่ 2");
    eq((await bRow(b.id)).version, v, "version ไม่เปลี่ยน");
  });
  await st("MV-5", `วันที่ราคาต่าง (px +฿${PX_DELTA / 100}/ผู้ใหญ่) ⇒ quote sameTotal false · form null · ยิงเลื่อนตรง ⇒ NOT_ALLOWED{PRICE_DIFFERS} การจองไม่เปลี่ยน (b = จ่ายส่วนต่าง)`, async () => {
    needSelf(); const [b] = needBk("bPx");
    const g = await grantOf(b);
    const r = await moveQ(b, g, { d: "2027-04-17", m: "2027-04" });
    const vm = asRec(r.vm) ?? {};
    ok(r.ok === true && asRec(vm.summary)?.sameTotal === false && Number(asRec(vm.summary)?.totalSatang) === TOTAL + 2 * PX_DELTA && vm.form === null, `quote px: ${fmt(r)}`);
    const t = String(asRec(vm.selected)?.token ?? "");
    const v = await bRow(b.id);
    BLOCKED(await moveX(b, g, { d: "2027-04-17", t, seen: String(TOTAL) }), "PRICE_DIFFERS", "เลื่อนไปวันราคาต่าง");
    eq([(await bRow(b.id)).version, (await bRow(b.id)).departureId], [v.version, v.departureId], "ไม่เปลี่ยน");
  });
  await st("MV-6", "ตัวอ้างรอบไม่ใช่ของวันที่ส่ง / รอบยกเลิก ⇒ SLOT_CLOSED (ไม่ถอยไปรอบอื่น · W7) · วันนอกหน้าต่าง X16 ⇒ NOT_ALLOWED{WINDOW}", async () => {
    needSelf(); const [b] = needBk("bPx");
    const g = await grantOf(b);
    const t16 = await moveTokenOf(b, g, "2027-04-16");
    const v = await bRow(b.id);
    ERR(await moveX(b, g, { d: "2027-04-18", t: t16, seen: String(TOTAL) }), "SLOT_CLOSED", "t ของวันอื่น");
    const jr = await moveQ(b, g, { d: "2027-07-20", m: "2027-07" });
    const tj = String(asRec(asRec(jr.vm)?.selected)?.token ?? "");
    BLOCKED(await moveX(b, g, { d: "2027-07-20", t: tj, seen: String(TOTAL) }), "WINDOW", "นอกหน้าต่าง");
    eq((await bRow(b.id)).version, v.version, "ไม่เปลี่ยน");
  });
  await st("MV-7", "เลื่อนไม่ได้: ยังไม่จ่าย ⇒ NOT_ALLOWED{NOT_SOLD} · สินค้ามีค่าเปลี่ยนวัน ⇒ NOT_ALLOWED{FEE} · ยอดที่เห็นไม่ตรง ⇒ AMOUNT_CHANGED", async () => {
    needSelf(); const [h, f, x] = needBk("bHold2", "bFee", "b45x");
    BLOCKED(await moveX(h, await grantOf(h), { d: "2027-04-28", t: "x", seen: String(TOTAL) }), "NOT_SOLD", "HOLD");
    BLOCKED(await moveX(f, await grantOf(f), { d: "2027-04-16", t: "x", seen: String(ONE) }), "FEE", "ค่าเปลี่ยนวัน");
    const g = await grantOf(x);
    const t = await moveTokenOf(x, g, "2027-04-16");
    const r = await moveX(x, g, { d: "2027-04-16", t, seen: String(TOTAL - 100) });
    ok(r.ok === false && r.code === "AMOUNT_CHANGED", `seen ผิด: ${fmt(r)}`);
    eq((await bRow(x.id)).departureId, DEP.d45, "ไม่ย้าย");
  });
  groupLine("MV");

  // ═══════════════ TK. ขอลิงก์ใหม่ ═══════════════
  console.log("\n── TK: ขอลิงก์ใหม่ (เพิกถอน token โดยไม่ต้อง migration) ──");
  await st("TK-1", "ขอลิงก์ใหม่ ⇒ token ใหม่ 43 ตัว ≠ เดิม · publicTokenHash = sha256(ใหม่) · token เดิมเปิดหน้า ⇒ NOT_FOUND · token ใหม่เปิดได้ รหัสเดิม · token ที่คำนวณจากสูตรเดิม (bookingPublicToken) ⇒ NOT_FOUND", async () => {
    needSelf(); const [b] = needBk("bTk");
    const code = (await bRow(b.id)).code;
    const g = await grantOf(b);
    const r = await rotate(b, g);
    ok(r.ok === true && typeof r.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(String(r.token)) && r.token !== b.token, `rotate: ${fmt(r)}`);
    const nt = String(r.token);
    eq((await bRow(b.id)).publicTokenHash, sha256hex(nt), "hash ใหม่");
    ERR(await openRes(b, ACT), "NOT_FOUND", "token เดิม");
    const o2 = await openRes(b, ACT, nt);
    eq([o2.ok, asRec(o2.vm)?.code], [true, code], "token ใหม่");
    const hm = tfn("bookingPublicToken")(b.id);
    if (typeof hm === "string") ERR(await openRes(b, ACT, hm), "NOT_FOUND", "token จากสูตร HMAC เดิม");
    const old = { ...b }; BK.bTkOld = old; b.token = nt;
  });
  await st("TK-2", "หลังขอลิงก์ใหม่: grant เดิมกับ token ใหม่ ⇒ VERIFY_REQUIRED · ส่งฟอร์มขอลิงก์เดิมซ้ำ (token เดิม) ⇒ NOT_FOUND · hash เปลี่ยนครั้งเดียว", async () => {
    needSelf(); const [b, old] = needBk("bTk", "bTkOld");
    const h0 = (await bRow(b.id)).publicTokenHash;
    const gOld = await (async () => { const r = await verify(b, { clientKey: b.ck }); return String(r.grant ?? ""); })();
    ok(gOld, "ยืนยันด้วย token ใหม่ไม่ได้");
    ERR(await rotate(old, gOld), "NOT_FOUND", "ขอซ้ำด้วย token เดิม");
    eq((await bRow(b.id)).publicTokenHash, h0, "hash ไม่เปลี่ยนอีก");
    const g2 = await grantOf(b);
    const r = await rotate(b, g2);
    ok(r.ok === true, `ขอใหม่อีกรอบ: ${fmt(r)}`);
    ERR(await cancelQ(b, g2, ACT, { token: String(r.token) }), "VERIFY_REQUIRED", "grant ของ token ก่อนหน้า");
    b.token = String(r.token);
  });
  groupLine("TK");

  // ═══════════════ RL. ด่านอัตรา ═══════════════
  console.log("\n── RL: ด่านอัตรา (คำสั่งเดียว · ปิดเมื่อพัง) ──");
  await st("RL-1", "ด่านล่ม (deps.query โยน) ⇒ RATE_LIMITED LIMITER_DOWN ทุกฟังก์ชัน · ไม่มี grant/คำขอ/การเปลี่ยน", async () => {
    needSelf(); const [b] = needBk("bRL5");
    const down = { now: ACT.now, deps: { query: async () => { throw new Error("down"); } } };
    const v0 = await bRow(b.id);
    for (const [name, input] of [
      ["verifyBookSelf", { shop: b.shop, token: b.token, form: { phone: b.phone, nonce: snonce(b, "verify", 60_000) }, clientKey: b.ck }],
      ["quoteBookSelfCancel", { shop: b.shop, token: b.token, grant: "g1.1.x", clientKey: b.ck }],
      ["cancelBookSelf", { shop: b.shop, token: b.token, grant: "g1.1.x", form: { seen: String(ONE), accept: "on", nonce: snonce(b, "cancel", 60_000) }, clientKey: b.ck }],
      ["quoteBookSelfMove", { shop: b.shop, token: b.token, grant: "g1.1.x", query: { m: "2027-04" }, clientKey: b.ck }],
      ["moveBookSelf", { shop: b.shop, token: b.token, grant: "g1.1.x", form: { d: "2027-04-16", t: "x", seen: String(ONE), nonce: snonce(b, "move", 60_000) }, clientKey: b.ck }],
      ["rotateBookToken", { shop: b.shop, token: b.token, grant: "g1.1.x", form: { nonce: snonce(b, "rotate", 60_000) }, clientKey: b.ck }],
    ] as const) {
      const r = await call(name, input, down);
      ok(r.ok === false && r.code === "RATE_LIMITED" && r.reason === "LIMITER_DOWN", `${name}: ${fmt(r)}`);
    }
    const v1 = await bRow(b.id);
    eq([v1.version, v1.publicTokenHash, (await refunds(b.id)).length], [v0.version, v0.publicTokenHash, 0], "ไม่เปลี่ยน");
  });
  await st("RL-2", "กุญแจเครื่องผิดรูป ⇒ RATE_LIMITED NO_CLIENT (ทุกฟังก์ชัน · ไม่ถามฐาน)", async () => {
    needSelf(); const [b] = needBk("bRL5");
    for (const name of SSVC_FNS.slice(1)) {
      const r = await call(name, { shop: b.shop, token: b.token, grant: "x", form: { phone: b.phone, nonce: "x", seen: "0", accept: "on", d: "2027-04-16", t: "x" }, query: {}, clientKey: "1.2.3.4" }, ACT);
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
  await st("RL-4", "ถังการจอง 10/ชม.: 10 เครื่องลองผิดคนละครั้ง ⇒ เครื่องที่ 11 เบอร์ถูก ⇒ RATE_LIMITED LIMIT · ไม่มีเบอร์/token ในคีย์ถังของใบนี้", async () => {
    needSelf(); const [b] = needBk("bRL4");
    for (let i = 0; i < 10; i++) ERR(await verify(b, { phone: "0899999991", clientKey: ck() }), "VERIFY_FAILED", `เครื่อง ${i + 1}`);
    const r = await verify(b, { clientKey: ck() });
    ok(r.ok === false && r.code === "RATE_LIMITED" && r.reason === "LIMIT", `เครื่องที่ 11: ${fmt(r)}`);
    const keys = (await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1 OR key LIKE $2`, [`trips:verify:${tA}:%`, `trips:verifyb:${tA}:%`])).map((x) => x.key);
    ok(keys.length >= 2, `ไม่พบถัง trips:verify / trips:verifyb ของร้าน: ${fmt(keys.slice(0, 3))}`);
    const leak = keys.filter((k) => Object.values(BK).some((x) => k.includes(x.phone) || k.includes(x.phone.slice(1)) || k.includes(x.token) || k.includes(sha256hex(x.token))));
    ok(leak.length === 0, `คีย์ถังมีเบอร์/token: ${leak.slice(0, 2).join(" | ")}`);
  });
  await st("RL-5", "เบอร์ผิดรูป (INVALID) ไม่กินโควตาลอง: 6 ครั้งผิดรูปแล้วเบอร์ถูก (เครื่องเดิม) ⇒ ผ่าน", async () => {
    needSelf(); const [b] = needBk("bRL5");
    for (let i = 0; i < X8_VERIFY + 1; i++) { const r = await verify(b, { phone: "abc" }); ok(r.ok === false && r.code === "INVALID", `ผิดรูป ${i + 1}: ${fmt(r)}`); }
    const r = await verify(b);
    ok(r.ok === true, `เบอร์ถูกหลังผิดรูป: ${fmt(r)}`);
  });
  groupLine("RL");

  // ═══════════════ X1. ข้ามร้าน/ข้ามการจอง ═══════════════
  console.log("\n── X1: ข้ามร้าน/ข้ามการจอง ──");
  await st("X1-1", "token ร้าน A ที่ URL ร้าน B ⇒ NOT_FOUND รูปเดียวทุกฟังก์ชัน (ยืนยัน/quote/ยกเลิก/เลื่อน/ลิงก์ใหม่) · ไม่มีการเปลี่ยน", async () => {
    needSelf(); const [b] = needBk("bX1");
    const g = await grantOf(b);
    const v0 = await bRow(b.id);
    ERR(await verify(b, { shop: SB, clientKey: ck() }), "NOT_FOUND", "ยืนยัน");
    for (const [name, extra] of [["quoteBookSelfCancel", {}], ["cancelBookSelf", { form: { seen: String(REFUND50), accept: "on", nonce: snonce(b, "cancel", 60_000) } }], ["quoteBookSelfMove", { query: { m: "2027-04" } }],
      ["moveBookSelf", { form: { d: "2027-04-16", t: "x", seen: String(ONE), nonce: snonce(b, "move", 60_000) } }], ["rotateBookToken", { form: { nonce: snonce(b, "rotate", 60_000) } }]] as const) {
      const r = await call(name, { shop: SB, token: b.token, grant: g, clientKey: b.ck, ...extra }, ACT);
      eq([r.ok, r.code], [false, "NOT_FOUND"], name);
    }
    const v1 = await bRow(b.id);
    eq([v1.version, v1.publicTokenHash, (await refunds(b.id)).length], [v0.version, v0.publicTokenHash, 0], "ไม่เปลี่ยน");
  });
  await st("X1-2", "grant ของการจองหนึ่งใช้กับอีกการจอง (ร้านเดียวกัน เครื่องเดียวกัน) ⇒ VERIFY_REQUIRED · grant ร้าน B ใช้กับการจองร้าน A ⇒ VERIFY_REQUIRED", async () => {
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
  await st("X3-1", "ยกเลิกการจองที่จ่ายแล้ว 10 ฟอร์มพร้อมกัน (nonce ต่างกัน) ⇒ คำขอคืนเงิน 1 แถวพอดี (ยอด ฿6,475.00) · ผลอื่น = DONE/STATE_CHANGED ไม่มี THROW", async () => {
    needSelf(); const [b] = needBk("b19r");
    const g = await grantOf(b);
    const nonces = Array.from({ length: 10 }, (_, i) => snonce(b, "cancel", 60_000 - i * 1_000));
    const rs = await Promise.all(nonces.map((n) => cancelX(b, g, REFUND50, { nonce: n })));
    const rr = await refunds(b.id);
    eq(rr.map((x) => [x.status, x.amountSatang]), [["QUOTED", REFUND50]], "คำขอ 1 แถว");
    ok(rs.filter((r) => r.ok === true).length >= 1, `ไม่มีตัวที่สำเร็จ: ${fmt(rs.map((r) => r.code ?? r.ok))}`);
    const bad = rs.filter((r) => r.ok !== true && !["DONE", "STATE_CHANGED", "BUSY"].includes(String(r.code)));
    ok(bad.length === 0, `ผลไม่คาด: ${fmt(bad.slice(0, 2))}`);
    eq((await bRow(b.id)).status, "PAID", "การจองยัง PAID");
  });
  await st("X3-2", "10 การจองเลื่อนไปรอบที่เหลือ 1 ที่พร้อมกัน ⇒ สำเร็จ 1 พอดี · ที่เหลือ SOLD_OUT · รอบปลายทาง sold = capacity (ไม่ขายเกิน) · รอบต้นทาง sold 9", async () => {
    needSelf(); const bs = needBk(...Array.from({ length: 10 }, (_, i) => `r${i}`));
    const prep = await Promise.all(bs.map(async (b) => { const g = await grantOf(b); return { b, g, t: await moveTokenOf(b, g, "2027-04-22") }; }));
    const rs = await Promise.all(prep.map(({ b, g, t }) => moveX(b, g, { d: "2027-04-22", t, seen: String(ONE) })));
    eq(rs.filter((r) => r.ok === true).length, 1, `สำเร็จ ${fmt(rs.map((r) => r.code ?? r.ok))}`);
    ok(rs.filter((r) => r.ok !== true).every((r) => r.code === "SOLD_OUT"), `ผลที่ไม่สำเร็จต้อง SOLD_OUT: ${fmt(rs.map((r) => r.code ?? r.ok))}`);
    const l = await depRow(DEP.last ?? ""), s = await depRow(DEP.src ?? "");
    eq([l.sold, l.held, l.sold + l.held <= l.capacity, s.sold], [12, 0, true, 9], "ที่นั่ง");
  });
  await st("X3-3", "ยกเลิก 10 ฟอร์ม (การจองยังไม่จ่าย) พร้อมกับร้านรับเงิน 1 ครั้ง ⇒ ไม่มีสภาพ CANCELLED ที่มีเงินเข้า · ที่นั่งรอบสอดคล้อง (PAID ⇒ sold 3 held 0 · CANCELLED ⇒ 0/0)", async () => {
    needSelf(); const [b] = needBk("bRace");
    const g = await grantOf(b);
    const nonces = Array.from({ length: 10 }, (_, i) => snonce(b, "cancel", 60_000 - i * 1_000));
    const [pay, ...rs] = await Promise.all([
      tcall("recordTripPayment", staffCtx(tA, ACT), { bookingId: b.id, amountSatang: TOTAL, tender: "PROMPTPAY", idempotencyKey: `w13race_${hex(8)}` }),
      ...nonces.map((n) => cancelX(b, g, 0, { nonce: n })),
    ]);
    const row = await bRow(b.id), d = await depRow(b.dep);
    ok(!(row.status === "CANCELLED" && row.paidSatang > 0), `CANCELLED แต่มีเงิน ${row.paidSatang}`);
    ok(["CANCELLED", "PAID"].includes(row.status), `สถานะ ${row.status}`);
    if (row.status === "PAID") eq([d.sold, d.held, pay?.ok], [3, 0, true], "PAID");
    else eq([d.sold, d.held, pay?.ok], [0, 0, false], "CANCELLED");
    ok(rs.every((r) => r.ok === true || ["STATE_CHANGED", "NOT_ALLOWED", "BUSY", "DONE", "AMOUNT_CHANGED"].includes(String(r.code))), `ผลไม่คาด: ${fmt(rs.filter((r) => r.ok !== true).map((r) => r.code))}`);
  });
  groupLine("X3");

  // ═══════════════ X4. ส่งซ้ำ ═══════════════
  console.log("\n── X4: ส่งซ้ำ (ฟอร์มเดิม) ──");
  await st("X4-1", "ส่งฟอร์มยกเลิกเดิมซ้ำ (การจองที่จ่ายแล้ว) ⇒ ครั้งที่ 2 ok replayed true ยอดเดิม · คำขอ 1 แถว", async () => {
    needSelf(); const [b] = needBk("b19rep");
    const g = await grantOf(b);
    const n = snonce(b, "cancel", 60_000);
    const r1 = await cancelX(b, g, REFUND50, { nonce: n }), r2 = await cancelX(b, g, REFUND50, { nonce: n });
    eq([r1.ok, r1.replayed, r2.ok, r2.replayed, r2.refundSatang, r2.result], [true, false, true, true, REFUND50, "REFUND_REQUESTED"], "ผล");
    eq((await refunds(b.id)).length, 1, "คำขอ 1 แถว");
  });
  await st("X4-2", "ส่งฟอร์มเลื่อนเดิมซ้ำ ⇒ ครั้งที่ 2 ok replayed true (ไม่ติด MOVE_LIMIT) · version +1 ครั้งเดียว · ที่นั่งย้ายครั้งเดียว", async () => {
    needSelf(); const [b] = needBk("b45x");
    const g = await grantOf(b);
    const t = await moveTokenOf(b, g, "2027-04-16");
    const v0 = (await bRow(b.id)).version, s0 = (await depRow(DEP.d45b ?? "")).sold;
    const n = snonce(b, "move", 60_000);
    const r1 = await moveX(b, g, { d: "2027-04-16", t, seen: String(TOTAL) }, { nonce: n });
    const r2 = await moveX(b, g, { d: "2027-04-16", t, seen: String(TOTAL) }, { nonce: n });
    eq([r1.ok, r1.replayed, r2.ok, r2.replayed, r2.date], [true, false, true, true, "2027-04-16"], "ผล");
    eq([(await bRow(b.id)).version, (await depRow(DEP.d45b ?? "")).sold], [v0 + 1, s0 + 3], "ครั้งเดียว");
  });
  await st("X4-3", "ส่งฟอร์มยกเลิกการจองยังไม่จ่ายซ้ำ ⇒ ครั้งที่ 2 ok replayed true · CANCELLED ครั้งเดียว · held ไม่ติดลบ", async () => {
    needSelf(); const [b] = needBk("bHold2");
    const g = await grantOf(b);
    const n = snonce(b, "cancel", 60_000);
    const r1 = await cancelX(b, g, 0, { nonce: n }), r2 = await cancelX(b, g, 0, { nonce: n });
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
  await st("X6-3", "seen ผิดรูป (-1 · 1e5 · 01 · 6475.00 · ช่องว่าง · ว่าง · 99999999999) ⇒ INVALID[seen] · ไม่มีคำขอ · d ผิดรูป (2027-02-30 · ../ · 2027-4-16) ⇒ INVALID[d] ไม่เปลี่ยน", async () => {
    needSelf(); const [b] = needBk("bX6");
    const g = await grantOf(b);
    for (const s of ["-1", "1e5", "01", "6475.00", " 410000", "", "99999999999"]) {
      const r = await cancelX(b, g, s);
      ok(r.ok === false && r.code === "INVALID" && Array.isArray(r.fields) && (r.fields as unknown[]).includes("seen"), `seen ${JSON.stringify(s)}: ${fmt(r)}`);
    }
    eq((await refunds(b.id)).length, 0, "ไม่มีคำขอ");
    const v = (await bRow(b.id)).version;
    for (const d of ["2027-02-30", "../", "2027-4-16"]) {
      const r = await moveX(b, g, { d, t: "x", seen: String(ONE) });
      ok(r.ok === false && r.code === "INVALID" && Array.isArray(r.fields) && (r.fields as unknown[]).includes("d"), `d ${d}: ${fmt(r)}`);
    }
    eq((await bRow(b.id)).version, v, "ไม่เปลี่ยน");
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

  // ═══════════════ PII ═══════════════
  console.log("\n── PII ──");
  await st("PII-1", "ผลของ verify/quote/cancel/move/rotate และหน้าการจอง (vm.manage) ไม่มี id ภายใน/เบอร์/อีเมล/ชื่อผู้จอง/publicTokenHash", async () => {
    needSelf(); const [b] = needBk("bV2");
    const g = await grantOf(b);
    const name = String((await q<{ name: string }>(`SELECT p.name FROM "Party" p JOIN "TripBooking" t ON t."bookerPartyId" = p.id WHERE t.id = $1`, [b.id]))[0]?.name ?? "");
    const ids = [b.id, b.dep, sha256hex(b.token), ...Object.values(PRD).map((p) => p.id)];
    for (const [what, r] of [["quote ยกเลิก", await cancelQ(b, g)], ["quote เลื่อน", await moveQ(b, g, { m: "2027-04", d: "2027-04-25" })], ["หน้าการจอง", await openRes(b)]] as const) {
      ok(r.ok === true, `${what}: ${fmt(r)}`);
      noInternal(r.vm, ids, what, [b.phone, b.phone.slice(1), name]);
    }
  });
  await st("PII-2", "audit/คำขอคืนเงิน/ถังของร้านทดสอบไม่มีเบอร์ผู้จองหรือ token (ข้อความดิบ)", async () => {
    needSelf(); needBk("b19");
    const audits = await q<{ s: string }>(`SELECT coalesce("after"::text, '') || coalesce("before"::text, '') AS s FROM "AuditLog" WHERE "tenantId" = $1`, [tA]);
    const reqs = await q<{ s: string }>(`SELECT computed::text || coalesce("idempotencyKey", '') AS s FROM "TripRefundRequest" WHERE "tenantId" = $1`, [tA]);
    const blob = [...audits, ...reqs].map((x) => x.s).join("\n");
    const leak = Object.values(BK).filter((x) => blob.includes(x.phone) || blob.includes(x.token));
    ok(leak.length === 0, `พบเบอร์/token ใน audit/คำขอ: ${leak.map((x) => x.tag).slice(0, 3).join(",")}`);
    ok(audits.length > 0 && reqs.length > 0, "ไม่มีแถว audit/คำขอให้ตรวจ (ยังไม่มีงาน)");
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

console.log(`\nเหลือให้ด่านภาพ + การเปิดจริง (ผู้คุม · scripts/visual-trips.mts w1.3 + parity 01ง/07ง): ฟอร์มส่งได้โดยไม่มี JS · grant ไม่อยู่ใน URL หลังทำสำเร็จ · ลิงก์เดิม 404 หลังขอลิงก์ใหม่ · ปุ่ม ≥ 44 px · 390 ไม่ล้น`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${(p0 ?? 0) + (c.res === "PASS" ? 1 : 0)}/${(t0 ?? 0) + 1}`; }
console.log(`\n===== QC TRIPS W1.3a · การจองของฉัน: ยืนยันเบอร์ → ยกเลิก/คำขอคืนเงิน · เลื่อนรอบ · ขอลิงก์ใหม่ =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
const KNOWN_RED: string[] = []; // ยังไม่มีแดงที่รู้จัก — ผู้คุมเพิ่มด้วย ORACLE-EDIT เท่านั้น
const knownRed = failed.filter((c) => KNOWN_RED.includes(c.id)).map((c) => c.id), otherRed = failed.filter((c) => !KNOWN_RED.includes(c.id)).map((c) => c.id);
console.log(`แดงที่รู้จัก: ${knownRed.join(" ") || "ไม่มี"} · แดงอื่น: ${otherRed.join(" ") || "ไม่มี"}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), knownRed, otherRed, skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
