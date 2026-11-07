// QC — SVC H.3 · จอง V2 โรงแรม: availability สูตรเดียว · createBooking (tx เดียว · advisory lock · nights/occupancy · snapshot) · HOLD/มัดจำ/ยกเลิก/ริบ ผ่าน POS ·
//      state machine · ต่อ/ย่น/assignRoom/no-show/undo · sweeper · ด่าน/สิทธิ์ · นาฬิกาฉาก `at` · event 3 ทะเบียน · legacy · จอรายการ/รายละเอียด/วิซาร์ด
//      oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes → ผู้คุม ORACLE-EDIT)
// สัญญา: ledger/svc-briefs/svc-brief-h.3.md (§0 หลัก · §1 ไฟล์ · §2 มติ 13 ข้อ · §3 สัญญาโค้ด · §4 จอ · §5 event · §6 ฉาก · §7 เกณฑ์รับ)
//        ยืนบน H.0 (ตาราง) · H.1 (pricing/rates · ข้อสอบ h.1 ผ่านแล้ว ⇒ ใช้ resolveNightPrice ของ H.1 เป็นตัวช่วย แต่ตัวเลขหลักคิดจากตัวอ้างอิงในไฟล์นี้)
//        ฟิกซ์เจอร์ scripts/svc-qc-data.mts บล็อก "SVC H.3 / H.2" (SQC_HOTEL_BOOKING_SCENE · SQC_VISUAL_SPECS["h.3"] · frontdesk/maid) + "SVC H.0 / H.1" (SQC_HOTEL_RATES)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน): ฟิกซ์เจอร์ฉากสอดคล้องกันเอง · oracle ของ oracle (ตัวอ้างอิง availability/มัดจำ/คืนเงิน) · ฐานเลน l2 · frontdesk/maid · def ค่าตั้ง/สิทธิ์ · ภาพ --list · ของที่ H.3 ยืนบน
//   A  hotelAvailability.get (รูป · สูตร §4.2 เทียบตัวอ้างอิง · fuzz · X1 · ≤ 4 คิวรี · ratePreview ใช้ตัวเดียวกัน)
//   K  createBooking (แถว/nights/occupancy/folio · เงิน+snapshot · audit+outbox · HOLD ออนไลน์/เคาน์เตอร์ · bookingMode · กลุ่ม · input ผิด · quote ล้ม · AVAILABILITY_CHANGED · ไม่มีห้องเดียวแต่คืนพอ · code prefix · tx ล้มทั้งชุด · load 20 · probe · OTA/public)
//   D  มัดจำ/ยกเลิก/ริบ ผ่าน POS (ใบรับ · idempotent · payType · จ่ายหลังหมดอายุ re-book/คืนอัตโนมัติ · ขั้นบันได 100/50/0 · snapshot · ซ้ำ · กลุ่ม/หัวกลุ่ม · HOLD ไร้มัดจำ)
//   T  booking-state.ts pure (ทุกคู่ 8×8 · NO_SHOW→CONFIRMED guard · nightsOf/holdDeadline · pure)
//   E  ต่อ/ย่น/assignRoom/no-show 3 นโยบาย/undo · W sweep (หมดอายุ · null ไม่แตะ · ข้ามร้าน · idempotent · ก้อน · X5 · minute-job)
//   B  ด่าน (X1 ข้ามร้าน/หน่วย · DORM · สิทธิ์ 3 ระดับ · X10 DTO · X9 audit · actions สถิต · listBookings กรอง)
//   C  นาฬิกา `at` (มี SVC_QC_CLOCK ⇒ รับ · ไม่มี ⇒ เพิกเฉย · ส่งผลถึงขั้นบันได/sweep · actions ไม่รับ at)
//   N  event 7 ตัว 3 ทะเบียน · payload ไม่มี PII · consumer ไม่โยน
//   L  legacy (createReservation เดิม → nights/occupancy · ไม่มี path สร้าง reservation ไร้ nights · ไม่เขียน BOOKED · stayLoad ไม่นับการจองไร้ occupancy)
//   U  UI สถิต · F ไฟล์ที่แตะ (accept-time) · Q ฉาก svcqc · V ภาพ · Z ล้าง · G regression (--no-regression = SKIP)
//
// 🔴 ผลที่ถูกต้องก่อนมีงาน: PC เขียว · A/K/D/T/E/W/B/C/N/L/U/F แดงเหตุผล "ยังไม่มี src/lib/modules/hotel/booking.ts|availability.ts|booking-state.ts" · Q/V/G SKIP
// 🔴 ร้านชั่วคราว slug/email `svc-h3-*` ลบใน finally + กวาดค้างตอนเริ่ม · ตัวดักคิวรี = globalThis.prisma ก่อนโหลด @/lib/core/db (แบบ h.1)
// รัน: cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.3.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill · ห้าม export CI · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V · SVC_QC_CLOCK ข้อสอบตั้ง/ถอดเองต่อข้อ)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_HOTEL_TYPES, SQC_HOTEL_ROOMS, SQC_HOTEL_RATES, SQC_HOTEL_BOOKING_SCENE, SQC_VISUAL_SPECS, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-h.3";
const SUITE = "qc-svc-h.3";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H3_NO_REGRESSION === "1";
const SLUG = "svc-h3-";
const MAIL = "svc-h3-";
const F = {
  avail: "src/lib/modules/hotel/availability.ts",
  booking: "src/lib/modules/hotel/booking.ts",
  state: "src/lib/modules/hotel/booking-state.ts",
  service: "src/lib/modules/hotel/service.ts",
  index: "src/lib/modules/hotel/index.ts",
  actions: "src/lib/modules/hotel/actions.ts",
  pricing: "src/lib/modules/hotel/pricing.ts",
  rates: "src/lib/modules/hotel/rates.ts",
  list: "src/components/hotel/BookingList.tsx",
  detail: "src/components/hotel/BookingDetail.tsx",
  wizard: "src/components/hotel/BookingWizard.tsx",
  depositDlg: "src/components/hotel/BookingDepositDialog.tsx",
  shared: "src/components/hotel/booking-shared.ts",
  listPage: "src/app/app/u/[unitSlug]/hotel/reservations/page.tsx",
  detailPage: "src/app/app/u/[unitSlug]/hotel/reservations/[id]/page.tsx",
  newPage: "src/app/app/u/[unitSlug]/hotel/reservations/new/page.tsx",
  cron: "src/lib/platform/cron.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  whLabels: "src/lib/webhooks/labels.ts",
  perms: "src/lib/core/permissions.ts",
  scene: "scripts/svc-qc-hotel-booking-scene.mts",
  sceneH1: "scripts/svc-qc-hotel-rates-scene.mts",
  probe: "scripts/probe-h3-load.mts",
  sds: "docs/sds/modules/hotel.md",
  posDeposit: "src/lib/modules/pos/deposit.ts",
} as const;

loadSvcQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
delete process.env.SVC_QC_CLOCK; // ข้อสอบ C ตั้งเองต่อข้อ · นอกนั้นต้องไม่มี
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

// ═══════════════ harness ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 300) ?? String(v); } catch { return String(v); } };
const J = (v: unknown): string => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`, sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const has = (rel: string) => existsSync(join(ROOT, rel));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (has(rel) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f;
};
const valOf = (load: { mod: Any; err: string }, name: string, rel: string): Any => {
  const v = load.mod?.[name];
  if (v === undefined) throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return v;
};
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? r?.error ?? J(r)?.slice(0, 80));
const failCode = (r: Any): string | null => (r && r.ok === false ? String(r.code ?? r.error ?? "") : null);
const DENIED = new Set(["FORBIDDEN", "NO_PERMISSION", "PERMISSION", "PERMISSION_DENIED"]);
const isDenied = (r: Any) => { const c = failCode(r); return c !== null && DENIED.has(c); };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? r?.message ?? ""}`.trim()); return r; };
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const ymdOfDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOfDay(dayNo(ymd) + n);
const dowOf = (ymd: string) => (((dayNo(ymd) + 4) % 7) + 7) % 7;
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOfDb = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
const nightsOf = (ci: string, co: string) => { const out: string[] = []; for (let d = ci; d < co; d = addDays(d, 1)) out.push(d); return out; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const groupOf = (id: string) => id.split("-")[0];
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const msOf = (d: unknown) => (d instanceof Date ? d.getTime() : typeof d === "string" ? Date.parse(d) : Number.NaN);
/** ตั้ง/ถอดนาฬิกาฉากรอบคำสั่งเดียว (ข้อ C · ฉาก) */
const withClock = async <T,>(on: boolean, fn: () => Promise<T>): Promise<T> => { // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h3-tsc-7060): .mts ต้องมี trailing comma ใน generic arrow (tsc) · tsx รันผ่านอยู่แล้ว
  const prev = process.env.SVC_QC_CLOCK;
  if (on) process.env.SVC_QC_CLOCK = "1"; else delete process.env.SVC_QC_CLOCK;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.SVC_QC_CLOCK; else process.env.SVC_QC_CLOCK = prev; }
};

// ═══════════════ ตัวอ้างอิง (oracle ของ oracle · pure) ═══════════════
type RefRoom = { id: string; roomTypeId: string; active: boolean; hkStatus: string; status: string; rentMode: string | null; typeRentMode: string };
type RefOcc = { roomId: string; kind: string; active: boolean; startDate: string; endDate: string; holdExpiresAt: string | null };
type RefNight = { roomTypeId: string; date: string; counted: boolean };
/** สูตร availability §4.2 (ใบ §0): total = ห้องขายรายคืนได้ · blocked/leased = ห้องของประเภทที่มี occupancy BLOCK/LEASE active ครอบคืน · counted = nights.counted · available = total − blocked − leased − counted */
const refAvailability = (rooms: RefRoom[], occ: RefOcc[], nights: RefNight[], from: string, to: string, roomTypeId?: string) => {
  const sellable = rooms.filter((r) => r.active && r.hkStatus !== "OUT_OF_ORDER" && r.status !== "OOO" && ["NIGHTLY", "BOTH"].includes(r.rentMode ?? r.typeRentMode) && (!roomTypeId || r.roomTypeId === roomTypeId));
  const types = [...new Set(sellable.map((r) => r.roomTypeId))];
  const typeOf = new Map(sellable.map((r) => [r.id, r.roomTypeId]));
  const byDate: Record<string, Record<string, { total: number; blocked: number; leased: number; counted: number; available: number }>> = {};
  for (const d of nightsOf(from, to)) {
    byDate[d] = {};
    for (const t of types) {
      const total = sellable.filter((r) => r.roomTypeId === t).length;
      const on = (kind: string) => new Set(occ.filter((o) => o.active && o.kind === kind && typeOf.get(o.roomId) === t && o.startDate <= d && d < o.endDate).map((o) => o.roomId)).size;
      const blocked = on("BLOCK"), leased = on("LEASE");
      const counted = nights.filter((n) => n.roomTypeId === t && n.date === d && n.counted).length;
      byDate[d][t] = { total, blocked, leased, counted, available: total - blocked - leased - counted };
    }
  }
  return byDate;
};
type Cell = { weekday: number; weekend: number };
const WEEKEND = [5, 6];
/** ราคา 1 คืนของร้านชั่วคราว (ไม่มีฤดู/วันหยุด · แก้มือส่งมาเอง) */
const refNightPrice = (cell: Cell, date: string, override?: number | null) => (override != null ? override : WEEKEND.includes(dowOf(date)) ? cell.weekend : cell.weekday);
const refStay = (cell: Cell, ci: string, co: string, overrides: Record<string, number> = {}) => nightsOf(ci, co).map((d) => ({ date: d, priceSatang: refNightPrice(cell, d, overrides[d]) }));
const refTotal = (cell: Cell, ci: string, co: string, overrides: Record<string, number> = {}) => refStay(cell, ci, co, overrides).reduce((a, n) => a + n.priceSatang, 0);
/** มัดจำ (ใบ §2 ข้อ 2 · S:218): FIRST_NIGHT = Σ คืนแรกทุกห้อง · FULL = Σ ยอด · PERCENT = floor(Σ×bp/10000) · FIXED · NONE */
const refDeposit = (stays: { priceSatang: number }[][], policy: { kind: string; percentBp?: number; amountSatang?: number }) => {
  const total = stays.reduce((a, s) => a + s.reduce((x, n) => x + n.priceSatang, 0), 0);
  switch (policy.kind) {
    case "FIRST_NIGHT": return stays.reduce((a, s) => a + (s[0]?.priceSatang ?? 0), 0);
    case "FULL": return total;
    case "PERCENT": return Math.floor((total * (policy.percentBp ?? 0)) / 10_000);
    case "FIXED_AMOUNT": return policy.amountSatang ?? 0;
    default: return 0;
  }
};
type Rule = { daysBefore: number; refundBp: number };
/** ขั้นบันไดคืนเงิน (h.1 P-30): daysBefore = วันเข้า − วันยกเลิก · กฎที่ใช้ = daysBefore สูงสุดที่ ≤ ค่านั้น · ไม่มีกฎเข้า/หลังวันเข้า ⇒ 0 · ปัดลง */
const refRefund = (paid: number, checkIn: string, cancelAt: string, rules: Rule[]) => {
  const days = dayNo(checkIn) - dayNo(cancelAt);
  if (days < 0) return { refundSatang: 0, daysBefore: days, rule: null as Rule | null };
  const rule = [...rules].sort((a, b) => b.daysBefore - a.daysBefore).find((r) => days >= r.daysBefore) ?? null;
  return { refundSatang: rule ? Math.floor((paid * rule.refundBp) / 10_000) : 0, daysBefore: days, rule };
};
const Q2_RULES: Rule[] = [{ daysBefore: 7, refundBp: 10_000 }, { daysBefore: 3, refundBp: 5_000 }, { daysBefore: 0, refundBp: 0 }];
const STATUSES = ["HOLD", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW", "BOOKED", "REFUNDED"] as const;
/** state machine ใบ §0 (S §7.8): HOLD→CONFIRMED/CANCELLED · CONFIRMED→CHECKED_IN/CANCELLED/NO_SHOW · CHECKED_IN→CHECKED_OUT · NO_SHOW→CONFIRMED (MANAGER/OWNER + sameDay) */
const refCan = (from: string, to: string, o: { role: string; sameDay: boolean }) => {
  const base: Record<string, string[]> = { HOLD: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"], CHECKED_IN: ["CHECKED_OUT"] };
  if (from === "NO_SHOW" && to === "CONFIRMED") return (o.role === "MANAGER" || o.role === "OWNER") && o.sameDay === true;
  return (base[from] ?? []).includes(to);
};
const PII_KEY = /guest(Name|Phone|Email)|^phone$|^email$|^name$|idNumber|passport/i;
const walkKeys = (v: Any, keys = new Set<string>()): Set<string> => { if (v instanceof Set || v instanceof Date) return keys; if (Array.isArray(v)) v.forEach((x) => walkKeys(x, keys)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walkKeys(x, keys); } return keys; };

// ═══════════════ โหลดโมดูล (หลัง env) — ตัวดักคิวรีก่อน db ═══════════════
const SQL_LOG: string[] = [];
let spyInstalled = false;
{
  const pc = await tryImport("@prisma/client");
  const ad = await tryImport("@prisma/adapter-pg");
  if (pc.mod?.PrismaClient && ad.mod?.PrismaPg && !(globalThis as Any).prisma) {
    try {
      const spy = new pc.mod.PrismaClient({ adapter: new ad.mod.PrismaPg({ connectionString: process.env.DATABASE_URL }), transactionOptions: { timeout: 30_000, maxWait: 10_000 }, log: [{ emit: "event", level: "query" }] });
      spy.$on("query", (e: Any) => SQL_LOG.push(String(e?.query ?? "")));
      (globalThis as Any).prisma = spy;
      spyInstalled = true;
    } catch (e) { console.log(`  ⚠️ ติดตั้งตัวดักคิวรีไม่ได้: ${errMsg(e)}`); }
  }
}
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
if (spyInstalled && prisma !== (globalThis as Any).prisma) spyInstalled = false;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const PERM = (await tryImport("@/lib/core/permissions")).mod as Any;
const hotelL = await loadIf(F.index);
const ratesL = await loadIf(F.rates);
const pricingL = await loadIf(F.pricing);
const serviceL = await loadIf(F.service);
const availL = await loadIf(F.avail);
const bookL = await loadIf(F.booking);
const stateL = await loadIf(F.state);
const sharedL = await loadIf(F.shared);
const roomsL = await tryImport("@/lib/modules/rooms");
const posDepL = await tryImport("@/lib/modules/pos/deposit");
const consumersL = await loadIf(F.consumers);
const autoL = await loadIf(F.autoLabels);
const whL = await loadIf(F.whLabels);
const RT = (name: string) => fnOf(ratesL, name, F.rates);
const BK = (name: string) => fnOf(bookL, name, F.booking);
const AV = () => { const a = valOf(availL, "hotelAvailability", F.avail); ok(typeof a?.get === "function", `«${F.avail}» hotelAvailability ไม่มีเมธอด get`); return a.get as (...a: Any[]) => Any; };
const needBooking = () => { if (!bookL.mod) throw new AssertFail(`ยังไม่มี ${F.booking} (${bookL.err})`); };
const sqlCount = (from: number) => SQL_LOG.slice(from).filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET |SAVEPOINT|RELEASE)/i.test(q)).length;

// ═══════════════ ฐานข้อมูล: ตาราง H.0 · ล้าง ═══════════════
const H0_TABLES = ["HotelRatePlan", "HotelSeason", "HotelHoliday", "HotelRate", "HotelRateOverride", "HotelCancelRule", "HotelBookingNight", "HotelFolio"];
let H0_OK = false;
let H0_WHY = "";
try {
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, H0_TABLES);
  const have = new Set(rows.map((r) => r.t));
  const miss = H0_TABLES.filter((t) => !have.has(t));
  const col: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HotelReservation' AND column_name IN ('taxSnapshot','policySnapshot','ratePlanId','groupId','holdExpiresAt','source','noShowAt')`);
  const colOk = Number(col[0]?.n ?? 0) === 7;
  H0_OK = miss.length === 0 && colOk && typeof prisma.hotelBookingNight?.findMany === "function";
  H0_WHY = miss.length ? `ยังไม่มีตาราง H.0 บนฐาน l2: ${miss.join(", ")}` : !colOk ? "HotelReservation ยังไม่มีคอลัมน์ H.0 ครบ" : typeof prisma.hotelBookingNight?.findMany !== "function" ? "Prisma client ยังไม่มี model HotelBookingNight" : "";
} catch (e) { H0_WHY = `อ่าน information_schema ไม่ได้: ${errMsg(e)}`; }
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: MAIL } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string; membershipId?: string };

// ═══════════════ ตัวช่วยสถิต (UI) ═══════════════
const EN_ALLOW = /^(VAT|SC|OTA|LINE|PDPA|POS|ID|QR|AI|SHARK|HR|STANDARD|BREAKFAST|NONREF|WEB|COUNTER|TM|RR|px|rem|em|svg|a|x|PromptPay|Agoda|Booking\.com)$/;
const englishInJsx = (src: string): string[] => {
  const s = stripComments(src);
  const texts: string[] = [];
  for (const m of s.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) texts.push(m[1]);
  for (const m of s.matchAll(/(?:placeholder|title|aria-label|alt)=["']([^"']*)["']/g)) texts.push(m[1]);
  const bad: string[] = [];
  for (const t of texts) for (const w of t.match(/[A-Za-z][A-Za-z.'-]{1,}/g) ?? []) if (!EN_ALLOW.test(w) && !/^[A-Z]{2,5}$/.test(w)) bad.push(w);
  return [...new Set(bad)];
};
const importSpecs = (src: string): { spec: string; typeOnly: boolean }[] => {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const m of stripComments(src).matchAll(/import\s+(type\s+)?[^'";]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|export\s+(type\s+)?[^'";]*?from\s*["']([^"']+)["']/g)) {
    const spec = m[2] ?? m[3] ?? m[5];
    if (spec) out.push({ spec, typeOnly: !!(m[1] || m[4]) });
  }
  return out;
};
const resolveSpec = (fromRel: string, spec: string): string | null => {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolvePath(join(ROOT, dirname(fromRel)), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && !c.endsWith("/")) { try { if (readFileSync(c, "utf8") !== undefined) return c.slice(ROOT.length + 1); } catch { /* โฟลเดอร์ */ } }
  return null;
};
const SERVER_FILES = /^src\/lib\/modules\/hotel\/(rates|hotel-settings|service|booking|availability)\.ts$|^src\/lib\/modules\/(rooms|pos)\//;
const clientReach = (startRel: string): string[] => {
  const seen = new Set<string>();
  const bad: string[] = [];
  const walk = (rel: string, path: string[]) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = read(rel);
    if (!src) return;
    if (rel !== startRel && /^\s*["']use server["']/m.test(src)) return;
    for (const { spec, typeOnly } of importSpecs(src)) {
      if (typeOnly) continue;
      if (spec === "@prisma/client" || spec === "server-only" || spec === "@/lib/core/db" || /^@prisma\//.test(spec)) { bad.push([...path, rel, spec].join(" → ")); continue; }
      const r = resolveSpec(rel, spec);
      if (!r) continue;
      if (SERVER_FILES.test(r) || r === "src/lib/core/db.ts") { bad.push([...path, rel, r].join(" → ")); continue; }
      walk(r, [...path, rel]);
    }
  };
  walk(startRel, []);
  return bad;
};
const nearWrite = (src: string, literal: string, guard: RegExp) => { const i = src.indexOf(literal); if (i < 0) return false; return guard.test(src.slice(Math.max(0, i - 800), i)); };

console.log(`\n(ฐาน ${process.env.SVC_QC_HOST ?? "?"} · ตัวดักคิวรี ${spyInstalled ? "ติดตั้งแล้ว" : "ไม่ได้ติดตั้ง"} · ตาราง H.0 ${H0_OK ? "มี" : `ยังไม่มี (${H0_WHY})`} · booking.ts ${bookL.mod ? "โหลดได้" : `ยังไม่มี`} · availability.ts ${availL.mod ? "โหลดได้" : "ยังไม่มี"} · booking-state.ts ${stateL.mod ? "โหลดได้" : "ยังไม่มี"})`);

// ═══════════════ ฟิกซ์เจอร์ฉาก → ตัวช่วย ═══════════════
const SC = SQC_HOTEL_BOOKING_SCENE;
const TYPE_NAME_TO_KEY: Record<string, keyof typeof SQC_HOTEL_TYPES> = { "ซูพีเรีย": "superior", "ดีลักซ์": "deluxe", "แฟมิลี": "family" };
const sceneRows = () => SC.bookings.flatMap((b) => Array.from({ length: b.rooms }, () => b));
const sceneNightsCounted = (afterSweep: boolean) => SC.bookings.reduce((a, b) => {
  if (b.status === "NO_SHOW" || b.status === "CANCELLED") return a;
  if (afterSweep && b.status === "HOLD" && (b.holdAgeMinutes ?? 0) > SQC_HOTEL_RATES.expectSettings.holdMinutesOnline) return a;
  return a + b.rooms * b.nights;
}, 0);
/** ห้องขายรายคืนต่อประเภทในฟิกซ์เจอร์ (B205 MONTHLY ไม่นับ) */
const sceneSellable = (typeName: string) => SQC_HOTEL_ROOMS.filter((r) => r.typeId === SQC_HOTEL_TYPES[TYPE_NAME_TO_KEY[typeName]].id && r.rentMode !== "MONTHLY").length;
const sceneLoadByDay = () => {
  const load: Record<string, Record<string, number>> = {};
  for (const b of SC.bookings) {
    if (b.status === "NO_SHOW" || b.status === "CANCELLED") continue;
    for (let i = 0; i < b.nights; i++) { const d = sqcAddDays(SQC_TODAY_BKK, b.checkInOffset + i); (load[d] ??= {})[b.roomType] = (load[d][b.roomType] ?? 0) + b.rooms; }
  }
  return load;
};

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ฉาก h.3 สอดคล้องกันเอง: 10 รายการ · แถว 12 (กลุ่ม 3) · rowsByStatus ตรงนับจากรายการ · groups/groupRows · countedNights 21→20 ตรงสูตร (ไม่นับ NO_SHOW/CANCELLED · HOLD หมดอายุปลดหลัง sweep) · afterSweep HOLD 1/CANCELLED 2 · sources 5 ครบ · OTA มี channelRef · holdAgeMinutes > holdMinutesOnline · แผน/ประเภทมีในฟิกซ์เจอร์ราคา · ไม่เกินห้องขายรายคืนในวันใด · mark SvcQcScene:h3", () => {
    eq(SC.bookings.length, 10, "รายการ");
    const rows = sceneRows();
    eq(rows.length, 12, "แถว");
    const by: Record<string, number> = {};
    for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
    eq(by, { ...SC.expect.rowsByStatus }, "rowsByStatus");
    const groups = SC.bookings.filter((b) => b.rooms > 1);
    eq([groups.length, groups.reduce((a, b) => a + b.rooms, 0)], [SC.expect.groups, SC.expect.groupRows], "กลุ่ม");
    eq([sceneNightsCounted(false), sceneNightsCounted(true)], [SC.expect.countedNightsBeforeSweep, SC.expect.countedNightsAfterSweep], "counted nights");
    const expired = SC.bookings.filter((b) => b.status === "HOLD" && (b.holdAgeMinutes ?? 0) > SQC_HOTEL_RATES.expectSettings.holdMinutesOnline);
    eq([SC.expect.rowsByStatus.HOLD - expired.length, SC.expect.rowsByStatus.CANCELLED + expired.length, SC.expect.afterSweep.holdExpiredReason], [SC.expect.afterSweep.HOLD, SC.expect.afterSweep.CANCELLED, "HOLD_EXPIRED"], "afterSweep");
    eq([...new Set(SC.bookings.map((b) => b.source))].sort(), [...SC.expect.sources].sort(), "sources");
    ok(SC.bookings.filter((b) => b.source === "OTA").every((b) => typeof b.channelRef === "string" && b.channelRef) && SC.bookings.filter((b) => b.source !== "OTA").every((b) => !b.channelRef), "channelRef เฉพาะ OTA");
    const planKeys = new Set(SQC_HOTEL_RATES.plans.map((p) => p.key));
    ok(SC.bookings.every((b) => planKeys.has(b.plan) && TYPE_NAME_TO_KEY[b.roomType]), "แผน/ประเภทไม่มีในฟิกซ์เจอร์ราคา");
    ok(SC.bookings.every((b) => b.nights >= 1 && b.rooms >= 1 && b.adults >= 1 && b.key && b.guest), "ค่าต่อรายการ");
    const over: string[] = [];
    for (const [d, m] of Object.entries(sceneLoadByDay())) for (const [t, n] of Object.entries(m)) if (n > sceneSellable(t)) over.push(`${d} ${t} ${n}>${sceneSellable(t)}`);
    eq(over, [], "เกินห้องขายรายคืน");
    eq([SC.mark, SC.unit, SC.depositPayType, SC.expect.noShowPolicy, SC.expect.cancelledRefundBp], ["SvcQcScene:h3", "hotel", "PROMPTPAY", "FORFEIT_RELEASE_AFTER_AUDIT", 10_000], "ค่าคงที่");
    // cancelled = STANDARD ยกเลิกวันนี้ · เข้า +5 ⇒ daysBefore 5 ≥ 3 ⇒ 100%
    const c = SC.bookings.find((b) => b.key === "cancelled")!;
    const std = SQC_HOTEL_RATES.plans.find((p) => p.key === c.plan)!;
    eq(refRefund(100, sqcAddDays(SQC_TODAY_BKK, c.checkInOffset), SQC_TODAY_BKK, [...std.cancelRules]).rule?.refundBp ?? null, SC.expect.cancelledRefundBp, "กฎยกเลิกของฉาก");
  });
  await st("PC-2", "oracle ของ oracle: refAvailability (ห้อง OUT_OF_ORDER/MONTHLY/inactive ไม่นับ · BLOCK/LEASE นับห้องไม่ซ้ำ · counted=false ไม่นับ · ต่างประเภทไม่ปน) · refDeposit 5 kind · refRefund ขั้นบันได Q2 (10/7/5/3/2/0 วัน) · refCan ตรง S §7.8 (7 ทางอนุญาต + NO_SHOW→CONFIRMED เงื่อนไข) · dow ไม่ใช้ getDay", () => {
    const rooms: RefRoom[] = [
      { id: "r1", roomTypeId: "A", active: true, hkStatus: "CLEAN", status: "AVAILABLE", rentMode: null, typeRentMode: "NIGHTLY" },
      { id: "r2", roomTypeId: "A", active: true, hkStatus: "OUT_OF_ORDER", status: "AVAILABLE", rentMode: null, typeRentMode: "NIGHTLY" },
      { id: "r3", roomTypeId: "A", active: true, hkStatus: "CLEAN", status: "AVAILABLE", rentMode: "MONTHLY", typeRentMode: "NIGHTLY" },
      { id: "r4", roomTypeId: "A", active: false, hkStatus: "CLEAN", status: "AVAILABLE", rentMode: null, typeRentMode: "NIGHTLY" },
      { id: "r5", roomTypeId: "A", active: true, hkStatus: "CLEAN", status: "AVAILABLE", rentMode: null, typeRentMode: "BOTH" },
      { id: "r6", roomTypeId: "B", active: true, hkStatus: "CLEAN", status: "AVAILABLE", rentMode: null, typeRentMode: "NIGHTLY" },
    ];
    const occ: RefOcc[] = [
      { roomId: "r1", kind: "BLOCK", active: true, startDate: "2026-11-10", endDate: "2026-11-12", holdExpiresAt: null },
      { roomId: "r1", kind: "BLOCK", active: true, startDate: "2026-11-11", endDate: "2026-11-12", holdExpiresAt: null },
      { roomId: "r5", kind: "LEASE", active: true, startDate: "2026-11-11", endDate: "2026-11-13", holdExpiresAt: null },
      { roomId: "r5", kind: "STAY", active: true, startDate: "2026-11-10", endDate: "2026-11-11", holdExpiresAt: null },
      { roomId: "r6", kind: "BLOCK", active: false, startDate: "2026-11-10", endDate: "2026-11-13", holdExpiresAt: null },
    ];
    const nights: RefNight[] = [{ roomTypeId: "A", date: "2026-11-10", counted: true }, { roomTypeId: "A", date: "2026-11-10", counted: false }, { roomTypeId: "B", date: "2026-11-12", counted: true }];
    const r = refAvailability(rooms, occ, nights, "2026-11-10", "2026-11-13");
    eq(r["2026-11-10"].A, { total: 2, blocked: 1, leased: 0, counted: 1, available: 0 }, "A 10");
    eq(r["2026-11-11"].A, { total: 2, blocked: 1, leased: 1, counted: 0, available: 0 }, "A 11");
    eq(r["2026-11-12"].A, { total: 2, blocked: 0, leased: 1, counted: 0, available: 1 }, "A 12");
    eq([r["2026-11-10"].B, r["2026-11-12"].B], [{ total: 1, blocked: 0, leased: 0, counted: 0, available: 1 }, { total: 1, blocked: 0, leased: 0, counted: 1, available: 0 }], "B");
    eq(Object.keys(refAvailability(rooms, occ, nights, "2026-11-10", "2026-11-11", "B")["2026-11-10"]), ["B"], "กรองประเภท");
    const s1 = [{ priceSatang: 149_000 }, { priceSatang: 149_000 }], s2 = [{ priceSatang: 219_000 }, { priceSatang: 189_000 }];
    eq([refDeposit([s1], { kind: "FIRST_NIGHT" }), refDeposit([s1, s2], { kind: "FIRST_NIGHT" }), refDeposit([s1, s2], { kind: "FULL" }), refDeposit([s1], { kind: "PERCENT", percentBp: 5000 }), refDeposit([s1], { kind: "FIXED_AMOUNT", amountSatang: 50_000 }), refDeposit([s1], { kind: "NONE" })], [149_000, 368_000, 706_000, 149_000, 50_000, 0], "มัดจำ");
    eq([["2026-11-10", 149_000], ["2026-11-13", 149_000], ["2026-11-15", 74_500], ["2026-11-17", 74_500], ["2026-11-18", 0], ["2026-11-20", 0], ["2026-11-22", 0]].map(([at]) => refRefund(149_000, "2026-11-20", at as string, Q2_RULES).refundSatang), [149_000, 149_000, 74_500, 74_500, 0, 0, 0], "ขั้นบันได");
    eq(refRefund(100_001, "2026-11-20", "2026-11-15", Q2_RULES).refundSatang, 50_000, "ปัดลง");
    const allowed = STATUSES.flatMap((a) => STATUSES.filter((b) => refCan(a, b, { role: "OWNER", sameDay: true })).map((b) => `${a}>${b}`)).sort();
    eq(allowed, ["CHECKED_IN>CHECKED_OUT", "CONFIRMED>CANCELLED", "CONFIRMED>CHECKED_IN", "CONFIRMED>NO_SHOW", "HOLD>CANCELLED", "HOLD>CONFIRMED", "NO_SHOW>CONFIRMED"], "ทางอนุญาต");
    eq([refCan("NO_SHOW", "CONFIRMED", { role: "STAFF", sameDay: true }), refCan("NO_SHOW", "CONFIRMED", { role: "MANAGER", sameDay: false }), refCan("NO_SHOW", "CONFIRMED", { role: "MANAGER", sameDay: true })], [false, false, true], "undo guard");
    eq([dowOf("2026-11-06"), dowOf("2026-11-07"), dowOf("2026-11-08")], [5, 6, 0], "dow");
  });
  await st("PC-3", "ฐาน QC ต่อได้ (SELECT 1 · host = เลน l2 ep-weathered-mode) · ตัวดักคิวรีติดตั้งก่อน db · ตาราง H.0 + คอลัมน์ H.0 ของ HotelReservation มีบนฐาน", async () => {
    const r: { one: number }[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
    eq(r[0]?.one, 1, "SELECT 1");
    ok(/^(ep-mute-scene|ep-royal-lake|ep-weathered-mode|ep-royal-bar|ep-square-heart|ep-late-union)/.test(process.env.SVC_QC_HOST ?? ""), `host ${process.env.SVC_QC_HOST} ไม่ใช่ฐาน QC ของ SVC`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h3-PC3-anylane): ข้อสอบต้องรันได้ทุกเลน/ฐานหลักตอน regression+H.9
    ok(spyInstalled, "ตัวดักคิวรีไม่ได้ติดตั้ง (A-5 นับไม่ได้)");
    ok(H0_OK, H0_WHY);
  });
  await st("PC-4", "ฟิกซ์เจอร์ผู้ใช้: frontdesk STAFF หน่วย hotel มี hotel.booking.manage + reservation.create/cancel + checkIn + rates.read · ไม่มี rates.write/settings.edit · maid มีเฉพาะ hotel.housekeeping · บนฐาน (seed แล้ว) membership ตรง · หน่วย hotel ฟิกซ์เจอร์ 14 ห้อง (ดีลักซ์ขายรายคืน 7 · ซูพีเรีย 4 · แฟมิลี 2) ตรงฐาน", async () => {
    const fd = SQC_USERS.find((u) => u.key === "frontdesk")!, md = SQC_USERS.find((u) => u.key === "maid")!;
    ok(["hotel.booking.manage", "hotel.reservation.create", "hotel.reservation.cancel", "hotel.reservation.checkIn", "hotel.rates.read"].every((p) => fd.permissions[p] === true) && !fd.permissions["hotel.rates.write"] && !fd.permissions["hotel.settings.edit"] && fd.role === "STAFF" && fd.unitAccess.includes(SQC_UNITS.hotel.id), `frontdesk ${J(fd)}`);
    eq([md.role, Object.keys(md.permissions), md.unitAccess], ["STAFF", ["hotel.housekeeping"], [SQC_UNITS.hotel.id]], "maid");
    eq([sceneSellable("ดีลักซ์"), sceneSellable("ซูพีเรีย"), sceneSellable("แฟมิลี"), SQC_HOTEL_ROOMS.length], [7, 4, 2, 14], "ห้องฟิกซ์เจอร์");
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    if (!t) throw new AssertFail("ร้าน svcqc ยังไม่ seed บนฐาน l2 — ผู้คุมรัน seed ก่อน (Q/V ต้องใช้)");
    const mb = await prisma.membership.findUnique({ where: { id: fd.membershipId }, select: { permissions: true } });
    ok(mb && ["hotel.booking.manage", "hotel.reservation.create", "hotel.reservation.cancel"].every((p) => (mb.permissions as Any)?.[p] === true), `membership frontdesk บนฐานยังไม่มีสิทธิ์ H.3 (reseed): ${J(mb)}`);
    const mm = await prisma.membership.findUnique({ where: { id: md.membershipId }, select: { permissions: true } });
    ok(mm && (mm.permissions as Any)?.["hotel.housekeeping"] === true, "membership maid บนฐานยังไม่มี (reseed)");
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, active: true }, select: { roomTypeId: true, rentMode: true } });
    eq([rooms.length, rooms.filter((r: Any) => r.roomTypeId === SQC_HOTEL_TYPES.deluxe.id && r.rentMode !== "MONTHLY").length], [14, 7], "ห้องบนฐาน");
  }, "MAJOR");
  await st("PC-5", "def ค่าตั้งที่ H.3 พึ่ง: bookingMode enum 3 ค่า ค่าเริ่ม DEPOSIT_REQUIRED · holdMinutesOnline 15 · holdMinutesCounter 1440 · noShow 3 ค่า ค่าเริ่ม FORFEIT_RELEASE_AFTER_AUDIT · codePrefix HR · maxAdvanceBookingDays 365 · deposit FIRST_NIGHT · cancelPolicy Q2 · ทะเบียนสิทธิ์มี hotel.booking.manage/reservation.create/reservation.cancel ป้ายไทย", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k}`); return x; };
    eq(d("rooms.hotel.bookingMode").defaults._fallback, "DEPOSIT_REQUIRED", "bookingMode");
    ok(["AUTO_CONFIRM", "DEPOSIT_REQUIRED", "MANUAL_APPROVE"].every((v) => d("rooms.hotel.bookingMode").schema.safeParse(v).success), "bookingMode enum");
    eq([d("rooms.hotel.holdMinutesOnline").defaults._fallback, d("rooms.hotel.holdMinutesCounter").defaults._fallback], [15, 1440], "hold");
    eq(d("rooms.hotel.noShow").defaults._fallback, "FORFEIT_RELEASE_AFTER_AUDIT", "noShow");
    ok(["FORFEIT_RELEASE_AFTER_AUDIT", "FORFEIT_HOLD_STAY", "REFUND_RELEASE"].every((v) => d("rooms.hotel.noShow").schema.safeParse(v).success), "noShow enum");
    eq([d("rooms.hotel.codePrefix").defaults._fallback, d("rooms.hotel.maxAdvanceBookingDays").defaults._fallback], ["HR", 365], "code/advance");
    eq([d("rooms.hotel.deposit").defaults._fallback, d("rooms.hotel.cancelPolicy").defaults._fallback], [{ kind: "FIRST_NIGHT" }, Q2_RULES], "deposit/cancel");
    const src = read(F.perms);
    for (const k of ["hotel.booking.manage", "hotel.reservation.create", "hotel.reservation.cancel"]) ok(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"[^"]*[฀-๿]`).test(src), `ไม่มีป้ายไทย ${k}`);
    ok(PERM, "โหลด permissions.ts ไม่ได้");
  });
  await st("PC-6", "ภาพ: SQC_VISUAL_SPECS[\"h.3\"] = 4 ใบ (+1 เมื่อ SVC_VIS_H3_GROUP_ID): รายการ · ?status=HOLD · new · new?…&step=3 (query prefill checkIn/checkOut/roomTypeId/rooms/step) · path ใต้ /hotel/reservations · visual-svc h.3 --list พิมพ์ครบ", () => {
    const specs = SQC_VISUAL_SPECS["h.3"] ?? [];
    const names = specs.map((s) => s.name);
    eq(names.filter((n) => n !== "hotel-booking-group"), ["hotel-bookings", "hotel-bookings-hold", "hotel-booking-new-1", "hotel-booking-new-3"], "ชื่อภาพ");
    ok(specs.every((s) => s.path.startsWith(`/app/u/${SQC_UNITS.hotel.slug}/hotel/reservations`)), "path");
    const q = new URL(`http://x${specs.find((s) => s.name === "hotel-booking-new-3")!.path}`).searchParams;
    eq([q.get("checkIn"), q.get("checkOut"), q.get("roomTypeId"), q.get("rooms"), q.get("step")], [sqcAddDays(SQC_TODAY_BKK, 2), sqcAddDays(SQC_TODAY_BKK, 4), SQC_HOTEL_TYPES.deluxe.id, "1", "3"], "query prefill");
    ok(specs.find((s) => s.name === "hotel-bookings-hold")!.path.endsWith("?status=HOLD"), "กรอง HOLD");
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.3", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "" }, encoding: "utf8" });
    ok(r.status === 0 && (r.stdout ?? "").includes("/hotel/reservations/new") && (r.stdout ?? "").includes("status=HOLD"), `--list exit ${r.status}`);
  }, "MAJOR");
  await st("PC-7", "ของที่ H.3 ยืนบน โหลดได้จริง: facade hotel มี quoteStay/depositFor/depositPolicyOf/refundFor/taxLines/loadPricingContext/ratePreview · rooms facade มี claimRoom/moveOccupancy/resizeOccupancy/releaseOccupancy/expireHolds/occupancyRange · pos/deposit มี moduleTakeDeposit/moduleRefundDeposit/moduleForfeitDeposit · settings มี snapshotPolicy/fromSnapshot + SNAPSHOT_KEYS.reservation", () => {
    ok(hotelL.mod, hotelL.err);
    eq(["quoteStay", "depositFor", "depositPolicyOf", "refundFor", "taxLines", "loadPricingContext", "ratePreview"].filter((n) => typeof hotelL.mod[n] !== "function"), [], "hotel facade");
    ok(roomsL.mod, roomsL.err);
    eq(["claimRoom", "moveOccupancy", "resizeOccupancy", "releaseOccupancy", "expireHolds", "occupancyRange"].filter((n) => typeof roomsL.mod[n] !== "function"), [], "rooms facade");
    ok(posDepL.mod, posDepL.err);
    eq(["moduleTakeDeposit", "moduleRefundDeposit", "moduleForfeitDeposit"].filter((n) => typeof posDepL.mod[n] !== "function"), [], "pos deposit");
    ok(typeof SET?.snapshotPolicy === "function" && typeof SET?.fromSnapshot === "function", "settings snapshot");
    const keys = SET?.SNAPSHOT_KEYS?.reservation ?? [];
    ok(["rooms.hotel.deposit", "rooms.hotel.cancelPolicy", "rooms.hotel.tax.mode", "rooms.hotel.noShow"].every((k) => keys.includes(k)) || ["rooms.hotel.deposit", "rooms.hotel.cancelPolicy", "rooms.hotel.tax.mode"].every((k) => keys.includes(k)), `SNAPSHOT_KEYS.reservation ${J(keys)}`);
  });

  // ═══════════════ ร้านชั่วคราว ═══════════════
  console.log("\n── ตั้งร้านชั่วคราว svc-h3-* ──");
  const mkTenant = async (name: string) => { const r = await prisma.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC H3 ร้าน A");
  const tB = await mkTenant("QC H3 ร้าน B");
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UH = await mkUnit(tA, "HOTEL", "โรงแรมทดสอบ H3");
  const UH2 = await mkUnit(tA, "HOTEL", "โรงแรมที่สอง H3");
  const UD = await mkUnit(tA, "DORM", "หอทดสอบ H3");
  const UHB = await mkUnit(tB, "HOTEL", "โรงแรมร้าน B H3");
  type TypeSpec = { name: string; base: number; cap: number; baseOcc: number; maxOcc: number | null; bed: boolean; bedPrice: number };
  const mkType = async (tenantId: string, unitId: string, s: TypeSpec) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: s.name, rentMode: "NIGHTLY", baseRateSatang: s.base, capacity: s.cap, baseOccupancy: s.baseOcc, maxOccupancy: s.maxOcc, extraBedAllowed: s.bed, extraBedPriceSatang: s.bedPrice } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string, hk = "CLEAN") => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, hkStatus: hk } })).id as string;
  const SPEC: Record<string, TypeSpec> = {
    dlx: { name: "ดีลักซ์", base: 129_000, cap: 3, baseOcc: 2, maxOcc: 3, bed: true, bedPrice: 30_000 },
    sup: { name: "ซูพีเรีย", base: 99_000, cap: 2, baseOcc: 2, maxOcc: 2, bed: false, bedPrice: 0 },
    fam: { name: "แฟมิลี", base: 189_000, cap: 5, baseOcc: 4, maxOcc: 5, bed: true, bedPrice: 30_000 },
    one: { name: "ห้องเดียว", base: 100_000, cap: 2, baseOcc: 2, maxOcc: 2, bed: false, bedPrice: 0 },
    fix: { name: "ห้องซ่อม", base: 50_000, cap: 2, baseOcc: 2, maxOcc: 2, bed: false, bedPrice: 0 },
    av: { name: "ห้องทดสอบว่าง", base: 80_000, cap: 2, baseOcc: 2, maxOcc: 2, bed: false, bedPrice: 0 },
    norate: { name: "ไม่มีราคา", base: 0, cap: 2, baseOcc: 2, maxOcc: 2, bed: false, bedPrice: 0 },
  };
  const CELL: Record<string, Cell> = { dlx: { weekday: 129_000, weekend: 149_000 }, sup: { weekday: 99_000, weekend: 99_000 }, fam: { weekday: 189_000, weekend: 219_000 }, one: { weekday: 100_000, weekend: 120_000 }, fix: { weekday: 50_000, weekend: 50_000 }, av: { weekday: 80_000, weekend: 80_000 } };
  const RTA: Record<string, string> = {};
  for (const [k, s] of Object.entries(SPEC)) RTA[k] = await mkType(tA, UH, s);
  const ROOM: Record<string, string> = {};
  const roomPlan: [string, string, string?][] = [["DLX1", "dlx"], ["DLX2", "dlx"], ["DLX3", "dlx"], ["SUP1", "sup"], ["SUP2", "sup"], ["FAM1", "fam"], ["ONE1", "one"], ["FIX1", "fix"], ["FIX2", "fix", "OUT_OF_ORDER"], ["AV1", "av"], ["AV2", "av"], ["AV3", "av"], ["NR1", "norate"]];
  for (const [n, k, hk] of roomPlan) ROOM[n] = await mkRoom(tA, UH, n, RTA[k], hk ?? "CLEAN");
  const RT_U2 = await mkType(tA, UH2, SPEC.dlx);
  await mkRoom(tA, UH2, "U2-1", RT_U2);
  const RT_B = await mkType(tB, UHB, SPEC.dlx);
  const ROOM_B = await mkRoom(tB, UHB, "B-1", RT_B);
  // POS ผูกหน่วยโรงแรม (เงินทุกบาทผ่าน POS · ใบ §0) — แบบ b.10/qc-hotel-money (กะไม่บังคับโดยปริยาย)
  const mkPos = async (tenantId: string, unitId: string) => { const s = await prisma.appSystem.create({ data: { tenantId, type: "POS", name: "ขายหน้าร้าน QC H3" } }); await prisma.appSystemUnit.create({ data: { tenantId, systemId: s.id, unitId, type: "POS" } }); return s.id as string; };
  const POS_A = await mkPos(tA, UH);
  await mkPos(tB, UHB);
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-h3-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@shark.local`, name: `QC h3 ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MGR = await mkMember("mgr", tA, "MANAGER", [UH]);
  const MGR2 = await mkMember("mgr2", tA, "MANAGER", [UH2]);
  const FRONT = await mkMember("front", tA, "STAFF", [UH], { "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.booking.manage": true, "hotel.reservation.checkIn": true, "hotel.rates.read": true });
  const CREATOR = await mkMember("creator", tA, "STAFF", [UH], { "hotel.reservation.create": true });
  const CANCELER = await mkMember("canceler", tA, "STAFF", [UH], { "hotel.reservation.create": true, "hotel.reservation.cancel": true });
  const NONE = await mkMember("none", tA, "STAFF", [UH], { "hotel.rates.read": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const T0 = bkkToday();
  const W = (n: number) => addDays(T0, n);
  const ids: Record<string, string> = {};
  const rowsFor = (cells: Record<string, Cell>, f: (c: Cell) => Cell = (c) => c) => Object.entries(cells).map(([k, c]) => { const x = f(c); return { roomTypeId: RTA[k], seasonId: null, priceWeekdaySatang: x.weekday, priceWeekendSatang: x.weekend, priceHolidaySatang: null }; });
  const floor90 = (x: number) => Math.floor((x * 9000) / 10_000 / 100) * 100;
  let SETUP_OK = false;
  let SETUP_WHY = "";
  try {
    okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH }), "list");
    const std = await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "STANDARD" } });
    ok(std, "ไม่มีแผน STANDARD");
    ids.std = std.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows: rowsFor(CELL) }), "saveRates STANDARD");
    okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: Q2_RULES }), "cancelRules");
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "NONREF", name: "จ่ายก่อน ไม่คืนเงิน", depositKind: "FULL", depositValue: 0, visibility: ["WEB", "COUNTER"] }), "NONREF");
    ids.nr = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "NONREF" } }))!.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.nr, rows: rowsFor(CELL, (c) => ({ weekday: floor90(c.weekday), weekend: floor90(c.weekend) })) }), "saveRates NONREF");
    okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.nr, rules: [{ daysBefore: 0, refundBp: 0 }] }), "cancelRules NONREF");
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "MIN2", name: "ขั้นต่ำ 2 คืน", minNights: 2, depositKind: "FIRST_NIGHT", depositValue: 0, visibility: ["WEB", "COUNTER"] }), "MIN2");
    ids.min2 = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "MIN2" } }))!.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.min2, rows: rowsFor(CELL) }), "saveRates MIN2");
    okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.min2, rules: Q2_RULES }), "cancelRules MIN2");
    // ร้าน B: แผน default + ราคา
    okRes(await RT("listRatePlans")(OWNER_B, ctxB, { unitId: UHB }), "list B");
    ids.stdB = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tB, unitId: UHB, code: "STANDARD" } }))!.id;
    okRes(await RT("saveRates")(OWNER_B, ctxB, { unitId: UHB, ratePlanId: ids.stdB, rows: [{ roomTypeId: RT_B, seasonId: null, priceWeekdaySatang: 129_000, priceWeekendSatang: 149_000, priceHolidaySatang: null }] }), "saveRates B");
    SETUP_OK = true;
  } catch (e) { SETUP_WHY = `ตั้งร้านชั่วคราวไม่สำเร็จ (H.1): ${errMsg(e)}`; console.log(`  ❌ ${SETUP_WHY}`); }
  const needSetup = () => ok(SETUP_OK, SETUP_WHY);
  const setUnit = async (key: string, value: unknown, unitId = UH) => okRes(await SET.setSettings(OWNER, ctxA, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  const resetUnit = async (key: string, unitId = UH) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: unitId }); } catch { /* ไม่มีค่า */ } };
  const GUEST = { name: "ผู้เข้าพักทดสอบ h3", phone: "0891234567", email: "svc-h3-guest@qc.invalid" };
  const PII_TEXT = /ผู้เข้าพักทดสอบ|0891234567|svc-h3-guest/;
  type BookOver = Record<string, unknown>;
  /** createBooking ด้วยค่าปริยาย (PHONE · ดีลักซ์ 1 ห้อง · STANDARD) */
  const book = (actor: Actor | null, over: BookOver) => BK("createBooking")(actor, ctxA, { unitId: UH, rooms: [{ roomTypeId: RTA.dlx, adults: 2, children: 0 }], ratePlanId: ids.std, source: "PHONE", guest: GUEST, ...over });
  const bookOk = async (actor: Actor | null, over: BookOver) => okRes(await book(actor, over), "createBooking");
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const nightsOfRv = (id: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: id }, orderBy: { date: "asc" } }) as Promise<Any[]>;
  const occOfRv = (id: string, active?: boolean) => prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId: id, ...(active === undefined ? {} : { active }) } }) as Promise<Any[]>;
  const folioOf = (id: string) => prisma.hotelFolio.findUnique({ where: { reservationId: id } }) as Promise<Any>;
  const eventsOf = async (type: string, reservationId?: string, tid = tA) => ((await prisma.outboxEvent.findMany({ where: { tenantId: tid, type } })) as Any[]).filter((e) => !reservationId || e.payload?.reservationId === reservationId);
  const auditsOf = (action: string, tid = tA) => prisma.auditLog.findMany({ where: { tenantId: tid, action }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const rvCount = () => prisma.hotelReservation.count({ where: { tenantId: tA } }) as Promise<number>;
  const depositSales = (tid = tA) => prisma.posSale.findMany({ where: { tenantId: tid, idempotencyKey: { startsWith: "hotel-deposit-" } }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const refundSalesOf = (receiptSaleId: string) => prisma.posSale.findMany({ where: { tenantId: tA, docType: "REFUND", refSaleId: receiptSaleId } }) as Promise<Any[]>;
  const forfeitSalesOf = async (receiptSaleId: string) => { const d = await prisma.posDeposit.findUnique({ where: { receiptSaleId } }); return d ? ((await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `dep-forfeit:${d.id}` }, status: "PAID" } })) as Any[]) : []; };
  const payOf = (saleId: string) => prisma.posPayment.findMany({ where: { tenantId: tA, saleId } }) as Promise<Any[]>;
  const takeDeposit = (actor: Actor, over: Record<string, unknown>) => BK("takeBookingDeposit")(actor, ctxA, { unitId: UH, payType: "PROMPTPAY", ...over });
  const cancel = (actor: Actor, over: Record<string, unknown>) => BK("cancelBooking")(actor, ctxA, { unitId: UH, reason: "ลูกค้าขอยกเลิก", by: "STAFF", ...over });
  const claim = (input: Record<string, unknown>) => prisma.$transaction((tx: Any) => roomsL.mod.claimRoom(tx, { tenantId: tA, unitId: UH, ...input }));

  // ═══════════════ A availability ═══════════════
  console.log("\n── A hotelAvailability.get ──");
  const avA = (input: Record<string, unknown>, ctx: Record<string, unknown> = ctxA) => AV()(ctx, { unitId: UH, ...input });
  const refFromDb = async (unitId: string, from: string, to: string, roomTypeId?: string) => {
    const rooms = (await prisma.hotelRoom.findMany({ where: { tenantId: tA, unitId }, include: { roomType: { select: { rentMode: true } } } })) as Any[];
    const occ = (await prisma.roomOccupancy.findMany({ where: { tenantId: tA, unitId, active: true } })) as Any[];
    const nights = (await prisma.hotelBookingNight.findMany({ where: { tenantId: tA, unitId } })) as Any[];
    return refAvailability(
      rooms.map((r) => ({ id: r.id, roomTypeId: r.roomTypeId, active: r.active, hkStatus: r.hkStatus, status: r.status, rentMode: r.rentMode, typeRentMode: r.roomType.rentMode })),
      occ.map((o) => ({ roomId: o.roomId, kind: o.kind, active: o.active, startDate: ymdOfDb(o.startDate)!, endDate: ymdOfDb(o.endDate)!, holdExpiresAt: o.holdExpiresAt ? String(o.holdExpiresAt) : null })),
      nights.map((n) => ({ roomTypeId: n.roomTypeId, date: ymdOfDb(n.date)!, counted: n.counted })),
      from, to, roomTypeId,
    );
  };
  const cellsOnly = (byDate: Any, type: string) => Object.fromEntries(Object.entries(byDate ?? {}).map(([d, m]: [string, Any]) => [d, m?.[type] ? { total: m[type].total, blocked: m[type].blocked, leased: m[type].leased, counted: m[type].counted, available: m[type].available } : null]));
  await st("A-1", "hotelAvailability.get(ctx,{unitId,from,to}) → {byDate[ymd][roomTypeId] = {total,blocked,leased,counted,available}} · 3 คืน · ทุกประเภทของหน่วย (7) · total = ห้องขายรายคืน (FIX2 OUT_OF_ORDER ไม่นับ ⇒ ซ่อม 1 · ดีลักซ์ 3 · ซูพีเรีย 2) · ว่างหมดตอนเริ่ม · SQL ≤ 4 คำสั่ง", async () => {
    needSetup();
    await sleep(30); const i0 = SQL_LOG.length;
    const r = await avA({ from: W(60), to: W(63) });
    await sleep(60); const n = sqlCount(i0);
    const byDate = r?.byDate ?? r?.value?.byDate;
    ok(byDate && typeof byDate === "object", `รูปผล ${J(r).slice(0, 160)}`);
    eq(Object.keys(byDate).sort(), nightsOf(W(60), W(63)), "วัน");
    const d0 = byDate[W(60)];
    eq(Object.keys(d0).sort(), Object.values(RTA).sort(), "ประเภทครบ");
    eq([d0[RTA.fix], d0[RTA.dlx], d0[RTA.sup]], [{ total: 1, blocked: 0, leased: 0, counted: 0, available: 1 }, { total: 3, blocked: 0, leased: 0, counted: 0, available: 3 }, { total: 2, blocked: 0, leased: 0, counted: 0, available: 2 }], "ช่อง");
    console.log(`     (availability 3 คืน = ${n} คำสั่ง)`);
    ok(n > 0 && n <= 4, `SQL ${n} คำสั่ง (ต้อง ≤ 4)`);
  });
  await st("A-2", "สูตร §4.2 เทียบตัวอ้างอิง: BLOCK AV1 (60–62) · LEASE AV2 (61–63) · การจอง CONFIRMED (แถวดิบ) คืน 60,61 counted + คืน 62 counted=false ⇒ ว่าง 60: 3−1−0−1=1 · 61: 3−1−1−1=0 · 62: 3−0−1−0=2 · ประเภทอื่นไม่กระทบ · roomTypeId กรองได้", async () => {
    needSetup();
    okRes(await claim({ roomId: ROOM.AV1, start: W(60), end: W(62), kind: "BLOCK", refType: "QcBlock", refId: `blk-${RUN}` }), "BLOCK");
    okRes(await claim({ roomId: ROOM.AV2, start: W(61), end: W(63), kind: "LEASE", refType: "QcLease", refId: `lease-${RUN}` }), "LEASE");
    const rv = await prisma.hotelReservation.create({ data: { tenantId: tA, unitId: UH, code: `QC-AV-${RUN}`, status: "CONFIRMED", guestName: "แถวดิบ", roomTypeId: RTA.av, checkInDate: dbDate(W(60)), checkOutDate: dbDate(W(63)), nights: 3, source: "WALK_IN" } });
    ids.avRv = rv.id;
    for (const [d, counted] of [[W(60), true], [W(61), true], [W(62), false]] as [string, boolean][]) await prisma.hotelBookingNight.create({ data: { tenantId: tA, unitId: UH, reservationId: rv.id, roomTypeId: RTA.av, date: dbDate(d), priceSatang: 80_000, counted } });
    const got = await avA({ from: W(60), to: W(63) });
    const exp = await refFromDb(UH, W(60), W(63));
    eq(cellsOnly(got.byDate, RTA.av), cellsOnly(exp, RTA.av), "ห้องทดสอบว่าง");
    eq([got.byDate[W(60)][RTA.av].available, got.byDate[W(61)][RTA.av].available, got.byDate[W(62)][RTA.av].available], [1, 0, 2], "ตัวเลขคาด");
    eq(cellsOnly(got.byDate, RTA.dlx), cellsOnly(exp, RTA.dlx), "ดีลักซ์ไม่กระทบ");
    const only = await avA({ roomTypeId: RTA.av, from: W(60), to: W(61) });
    eq(Object.keys(only.byDate[W(60)]), [RTA.av], "กรองประเภท");
  });
  await st("A-3", "X1/ด่าน: ctx ร้าน B ขอหน่วย UH ⇒ NOT_FOUND หรือ byDate ว่าง (ไม่มีตัวเลขหลุด) · หน่วย DORM ⇒ NOT_FOUND/ว่าง · ช่วงผิด (to ≤ from · วันผิดรูป · > 400 วัน) ⇒ ok:false/ว่าง ไม่ throw", async () => {
    needSetup();
    const empty = (r: Any) => r?.ok === false || !r?.byDate || Object.values(r.byDate).every((m: Any) => !m || !Object.keys(m).length);
    const b = await avA({ from: W(60), to: W(62) }, ctxB);
    ok(empty(b), `ร้าน B เห็น ${J(b).slice(0, 120)}`);
    ok(!J(b).includes(RTA.av), "รั่ว roomTypeId");
    ok(empty(await avA({ unitId: UD, from: W(60), to: W(62) })), "หอ");
    for (const i of [{ from: W(62), to: W(60) }, { from: "ผิด", to: W(62) }, { from: W(0), to: W(500) }]) { const r = await avA(i); ok(empty(r), `ช่วงผิด ${J(i)} ⇒ ${J(r).slice(0, 80)}`); }
  });
  await st("A-4", "fuzz 40 แถวสุ่ม (BLOCK/LEASE/HOLD หมดอายุ บน AV1–3 ช่วง 70–82 · nights counted สุ่ม 2 แถวดิบ) ⇒ ทุกช่อง 12 คืน × ประเภท av ตรงตัวอ้างอิงที่คิดจากแถวในฐาน · HOLD occupancy ไม่นับเป็น blocked/leased (ชั้นประเภทห้องมาจาก nights)", async () => {
    needSetup();
    let seed = 20261107;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const rooms = [ROOM.AV1, ROOM.AV2, ROOM.AV3];
    for (let i = 0; i < 24; i++) {
      const s = 70 + rnd(10), len = 1 + rnd(3), kind = ["BLOCK", "LEASE", "HOLD"][rnd(3)];
      await claim({ roomId: rooms[rnd(3)], start: W(s), end: W(s + len), kind, refType: `QcFuzz${kind}`, refId: `fz-${i}-${RUN}`, ...(kind === "HOLD" ? { holdExpiresAt: new Date(Date.now() - 60_000) } : {}) }); // ชน EXCLUDE ⇒ ok:false ข้าม
    }
    for (let k = 0; k < 2; k++) {
      const rv = await prisma.hotelReservation.create({ data: { tenantId: tA, unitId: UH, code: `QC-FZ${k}-${RUN}`, status: "CONFIRMED", guestName: "แถวดิบ", roomTypeId: RTA.av, checkInDate: dbDate(W(70)), checkOutDate: dbDate(W(82)), nights: 12, source: "WALK_IN" } });
      for (let d = 70; d < 82; d++) if (rnd(3) > 0) await prisma.hotelBookingNight.create({ data: { tenantId: tA, unitId: UH, reservationId: rv.id, roomTypeId: RTA.av, date: dbDate(W(d)), priceSatang: 80_000, counted: rnd(4) > 0 } });
    }
    const got = await avA({ from: W(70), to: W(82) });
    const exp = await refFromDb(UH, W(70), W(82));
    const diffs = Object.keys(exp).filter((d) => !isDeepStrictEqual(cellsOnly({ [d]: got.byDate?.[d] }, RTA.av), cellsOnly({ [d]: exp[d] }, RTA.av)));
    ok(!diffs.length, `${diffs.length} วันต่าง: ${diffs.slice(0, 3).map((d) => `${d} ได้ ${J(got.byDate?.[d]?.[RTA.av])} ต้อง ${J(exp[d][RTA.av])}`).join(" | ")}`);
  });
  await st("A-5", "สูตรเดียวทุกที่ (ใบ §0): ratePreview ของ H.1 ให้ remaining = available ของ hotelAvailability ทุกวัน/ประเภทในช่วง 60–63 (รวมแถวดิบ/BLOCK/LEASE ของ A-2) · rates.ts import ./availability (ไม่คิดเองซ้ำ)", async () => {
    needSetup();
    const pv = await RT("ratePreview")(ctxA, UH, { from: W(60), to: W(62) });
    const days = (pv?.days ?? []) as Any[];
    ok(days.length === 3, `days ${days.length}`);
    const av = await avA({ from: W(60), to: W(63) });
    const bad: string[] = [];
    for (const d of days) for (const k of Object.keys(RTA)) { const a = av.byDate?.[d.date]?.[RTA[k]]?.available; const r = d.byType?.[RTA[k]]?.remaining; if (a !== r) bad.push(`${d.date} ${k}: preview ${r} ≠ availability ${a}`); }
    eq(bad, [], "ไม่ตรง");
    ok(/from\s*["']\.\/availability["']/.test(stripComments(read(F.rates))), "rates.ts ไม่ได้ import ./availability");
  });

  // ═══════════════ K createBooking ═══════════════
  console.log("\n── K createBooking (tx + guard) ──");
  const ALLOWED_PAYLOAD = new Set(["tenantId", "unitId", "reservationId", "groupId", "code", "status", "source", "reservationIds", "reason"]);
  const checkPayload = (ev: Any, what: string) => {
    const keys = Object.keys(ev?.payload ?? {});
    const extra = keys.filter((k) => !ALLOWED_PAYLOAD.has(k));
    eq(extra, [], `${what}: คีย์ payload นอกสัญญา §5`);
    ok(!PII_TEXT.test(J(ev.payload)) && ![...walkKeys(ev.payload)].some((k) => PII_KEY.test(k)), `${what}: PII ใน payload`);
  };
  await st("K-1", "PHONE 2 คืน ดีลักซ์ STANDARD ⇒ ok · groupId null · reservations[0] {id,code,roomTypeId,status CONFIRMED,holdExpiresAt null,nights 2,totalSatang=Σ ราคาคืนตามตาราง (ศ./ส. ราคาสุดสัปดาห์)} · depositRequiredSatang = คืนแรก (FIRST_NIGHT) · quote มี · แถว HotelReservation: status/source/ratePlanId/nights/total/deposit/วัน/แขก/code HR-/createdById · taxSnapshot {INCLUSIVE,700,0} · policySnapshot จด rooms.hotel.noShow + กฎยกเลิกของแผน", async () => {
    needSetup(); needBooking();
    const ci = W(8), co = W(10);
    const r = await bookOk(FRONT, { checkIn: ci, checkOut: co });
    eq([r.groupId ?? null, r.reservations?.length], [null, 1], "รูปผล");
    const x = r.reservations[0];
    ids.k1 = x.id;
    const total = refTotal(CELL.dlx, ci, co);
    eq([x.status, x.holdExpiresAt ?? null, x.nights, x.totalSatang, x.roomTypeId], ["CONFIRMED", null, 2, total, RTA.dlx], "reservations[0]");
    eq(r.depositRequiredSatang, refDeposit([refStay(CELL.dlx, ci, co)], { kind: "FIRST_NIGHT" }), "มัดจำที่ต้องจ่าย");
    ok(r.quote, "ไม่มี quote");
    const rv = await rvOf(x.id);
    eq([rv.status, rv.source, rv.ratePlanId, rv.nights, rv.totalSatang, rv.depositSatang, ymdOfDb(rv.checkInDate), ymdOfDb(rv.checkOutDate), rv.guestName, rv.groupId ?? null, rv.holdExpiresAt ?? null, rv.createdById, rv.unitId], ["CONFIRMED", "PHONE", ids.std, 2, total, r.depositRequiredSatang, ci, co, GUEST.name, null, null, FRONT.userId, UH], "แถว");
    ok(/^HR-/.test(rv.code) && rv.code === x.code, `code ${rv.code}`);
    eq(rv.taxSnapshot, { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 }, "taxSnapshot");
    const ps = J(rv.policySnapshot);
    ok(rv.policySnapshot && ps.includes("rooms.hotel.noShow") && ps.includes("rooms.hotel.cancelPolicy") && ps.includes("rooms.hotel.deposit"), `policySnapshot ${ps.slice(0, 200)}`);
    ok(/"daysBefore":\s*7/.test(ps) && /"refundBp":\s*5000/.test(ps), "policySnapshot ไม่มีกฎยกเลิกของแผน (7/3/0)");
    ok(!PII_TEXT.test(ps), "PII ใน policySnapshot");
  });
  await st("K-2", "ชั้นประเภทห้อง + ห้องจริงใน tx เดียว: HotelBookingNight 2 แถว (วันครบ · counted true · priceSatang ตามคืน · priceSource RATE · ratePlanId · roomTypeId · roomId = ห้องที่ถือ) · RoomOccupancy 1 แถว active kind STAY refType HotelReservation [ci,co) · HotelFolio OPEN balance 0 (เปิดเมื่อ CONFIRMED)", async () => {
    needBooking(); ok(ids.k1, "ไม่มีการจอง K-1");
    const ci = W(8), co = W(10);
    const ns = await nightsOfRv(ids.k1);
    eq(ns.map((n) => [ymdOfDb(n.date), n.counted, n.priceSatang, n.priceSource, n.ratePlanId, n.roomTypeId]), refStay(CELL.dlx, ci, co).map((n) => [n.date, true, n.priceSatang, "RATE", ids.std, RTA.dlx]), "nights");
    const occ = await occOfRv(ids.k1, true);
    eq(occ.length, 1, "occupancy active");
    eq([occ[0].kind, ymdOfDb(occ[0].startDate), ymdOfDb(occ[0].endDate), occ[0].unitId], ["STAY", ci, co, UH], "occupancy");
    ok(ns.every((n) => n.roomId === occ[0].roomId), `nights.roomId ${J(ns.map((n) => n.roomId))} ≠ occupancy ${occ[0].roomId}`);
    const f = await folioOf(ids.k1);
    eq([f?.status, f?.balanceSatang], ["OPEN", 0], "folio");
  });
  await st("K-3", "AuditLog hotel.booking.created (targetId = id · after ไม่มี PII) · outbox hotel.booking.created 1 แถว payload ⊆ {tenantId,unitId,reservationId,groupId,code,status,source} ไม่มีชื่อ/เบอร์/อีเมล · idempotencyKey ไม่ซ้ำ", async () => {
    needBooking(); ok(ids.k1, "ไม่มีการจอง K-1");
    const a = (await auditsOf("hotel.booking.created")).filter((x) => x.targetId === ids.k1);
    ok(a.length >= 1 && (a[0].after !== null || a[0].before !== null), `AuditLog ${a.length} แถว`);
    ok(!PII_TEXT.test(J(a.map((x) => [x.before, x.after]))), "PII ใน AuditLog");
    const ev = await eventsOf("hotel.booking.created", ids.k1);
    eq(ev.length, 1, "event");
    checkPayload(ev[0], "created");
    eq([ev[0].payload.reservationId, ev[0].payload.status, ev[0].payload.source, ev[0].unitId ?? ev[0].payload.unitId], [ids.k1, "CONFIRMED", "PHONE", UH], "payload");
    const all = await prisma.outboxEvent.findMany({ where: { tenantId: tA }, select: { idempotencyKey: true } });
    eq(new Set(all.map((e: Any) => e.idempotencyKey)).size, all.length, "idempotencyKey ซ้ำ");
  });
  await st("K-4", "WEB hold ONLINE (DEPOSIT_REQUIRED ค่าเริ่ม) ⇒ HOLD · holdExpiresAt ≈ now + holdMinutesOnline 15 (±90 วิ) · occupancy kind HOLD holdExpiresAt เท่ากัน · nights counted true · ยังไม่มี folio · depositRequired = คืนแรก", async () => {
    needSetup(); needBooking();
    const t0 = Date.now();
    const r = await bookOk(FRONT, { source: "WEB", hold: "ONLINE", checkIn: W(12), checkOut: W(13) });
    const x = r.reservations[0]; ids.k4 = x.id;
    eq(x.status, "HOLD", "status");
    ok(near(msOf(x.holdExpiresAt), t0 + 15 * 60_000, 90_000), `holdExpiresAt ${x.holdExpiresAt}`);
    const rv = await rvOf(x.id);
    eq([rv.status, rv.source], ["HOLD", "WEB"], "แถว");
    const occ = await occOfRv(x.id, true);
    eq([occ.length, occ[0]?.kind], [1, "HOLD"], "occupancy HOLD");
    ok(near(msOf(occ[0].holdExpiresAt), msOf(rv.holdExpiresAt), 1000), "occupancy.holdExpiresAt ≠ แถว");
    ok((await nightsOfRv(x.id)).every((n) => n.counted), "nights counted");
    eq(await folioOf(x.id), null, "folio ต้องยังไม่เปิด");
    eq(r.depositRequiredSatang, refNightPrice(CELL.dlx, W(12)), "มัดจำ");
  });
  await st("K-5", "เคาน์เตอร์ «รอโอน» (PHONE hold COUNTER) ⇒ HOLD holdExpiresAt ≈ now + holdMinutesCounter 1440 นาที · ตั้ง holdMinutesCounter 60 ที่หน่วย ⇒ ≈ now + 60 นาที (อ่านค่าตั้ง ไม่ฝัง) · คืนค่า", async () => {
    needSetup(); needBooking();
    const t0 = Date.now();
    const r = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 2, children: 0 }], hold: "COUNTER", checkIn: W(12), checkOut: W(13) });
    ids.k5 = r.reservations[0].id;
    ok(near(msOf(r.reservations[0].holdExpiresAt), t0 + 1440 * 60_000, 120_000), `1440: ${r.reservations[0].holdExpiresAt}`);
    await setUnit("rooms.hotel.holdMinutesCounter", 60);
    try {
      const r2 = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], hold: "COUNTER", checkIn: W(13), checkOut: W(14) });
      ids.k5b = r2.reservations[0].id;
      ok(near(msOf(r2.reservations[0].holdExpiresAt), Date.now() + 60 * 60_000, 120_000), `60: ${r2.reservations[0].holdExpiresAt}`);
    } finally { await resetUnit("rooms.hotel.holdMinutesCounter"); }
  });
  await st("K-6", "bookingMode: AUTO_CONFIRM ⇒ WEB ONLINE เป็น CONFIRMED (holdExpiresAt null · folio OPEN) · MANUAL_APPROVE ⇒ HOLD holdExpiresAt = วันเข้า 14:00 ไทย (มติ §11 ข้อ 4 · ORACLE-EDIT ผู้คุม 7 พ.ย. h3-K6-manual-expiry) ทั้ง WEB และ PHONE · occupancy ถืออยู่ · confirmBooking (manage) ⇒ CONFIRMED + folio + outbox hotel.booking.confirmed · confirm ซ้ำ ⇒ ok:false ไม่ throw · คืนค่า", async () => {
    needSetup(); needBooking();
    await setUnit("rooms.hotel.bookingMode", "AUTO_CONFIRM");
    try {
      const a = await bookOk(FRONT, { source: "WEB", hold: "ONLINE", checkIn: W(14), checkOut: W(15) });
      eq([a.reservations[0].status, a.reservations[0].holdExpiresAt ?? null, (await folioOf(a.reservations[0].id))?.status], ["CONFIRMED", null, "OPEN"], "AUTO_CONFIRM");
      ids.k6a = a.reservations[0].id;
    } finally { await resetUnit("rooms.hotel.bookingMode"); }
    await setUnit("rooms.hotel.bookingMode", "MANUAL_APPROVE");
    try {
      const m = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 2, children: 0 }], checkIn: W(14), checkOut: W(15) });
      const w = await bookOk(FRONT, { source: "WEB", hold: "ONLINE", checkIn: W(15), checkOut: W(16) });
      ids.k6m = m.reservations[0].id; ids.k6w = w.reservations[0].id;
      // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h3-K6-manual-expiry): เดิมคาด null · มติ §11 ข้อ 4 = วันเข้า เวลา checkInTime (14:00 ไทย)
      eq([m.reservations[0].status, msOf(m.reservations[0].holdExpiresAt), w.reservations[0].status, msOf(w.reservations[0].holdExpiresAt)], ["HOLD", Date.parse(`${W(14)}T14:00:00+07:00`), "HOLD", Date.parse(`${W(15)}T14:00:00+07:00`)], "MANUAL_APPROVE");
      ok((await occOfRv(ids.k6m, true)).length === 1, "occupancy ถืออยู่");
      eq(await folioOf(ids.k6m), null, "folio ก่อน confirm");
      okRes(await BK("confirmBooking")(FRONT, ctxA, { unitId: UH, id: ids.k6m, reservationId: ids.k6m }), "confirm");
      eq([(await rvOf(ids.k6m)).status, (await folioOf(ids.k6m))?.status, (await eventsOf("hotel.booking.confirmed", ids.k6m)).length], ["CONFIRMED", "OPEN", 1], "หลัง confirm");
      const again = await BK("confirmBooking")(FRONT, ctxA, { unitId: UH, id: ids.k6m, reservationId: ids.k6m });
      ok(again && again.ok === false, `confirm ซ้ำ ${J(again).slice(0, 80)}`);
    } finally { await resetUnit("rooms.hotel.bookingMode"); }
  });
  await st("K-7", "กลุ่ม 3 ห้องดีลักซ์ 2 คืน ⇒ 3 แถว groupId เดียว (สตริง) · code ต่างกัน · depositRequired = Σ คืนแรก 3 ห้อง · มัดจำอยู่หัวกลุ่ม (แถวแรก depositSatang = ทั้งหมด · แถวอื่น 0) · totalSatang ต่อแถว = ราคา 2 คืน · nights 6 · occupancy 3 ห้องไม่ซ้ำ · folio 3 ใบ · outbox created ต่อแถวหรือต่อกลุ่ม (≥ 1 มี groupId)", async () => {
    needSetup(); needBooking();
    const ci = W(16), co = W(18);
    const r = await bookOk(FRONT, { rooms: [1, 2, 3].map(() => ({ roomTypeId: RTA.dlx, adults: 2, children: 0 })), checkIn: ci, checkOut: co });
    eq(r.reservations.length, 3, "3 แถว");
    ok(typeof r.groupId === "string" && r.groupId, "groupId");
    ids.g = r.groupId; ids.gHead = r.reservations[0].id;
    const rows = (await prisma.hotelReservation.findMany({ where: { tenantId: tA, groupId: r.groupId }, orderBy: { createdAt: "asc" } })) as Any[];
    eq(rows.length, 3, "แถวในฐาน");
    eq(new Set(rows.map((x) => x.code)).size, 3, "code ซ้ำ");
    const stay = refStay(CELL.dlx, ci, co);
    const dep = refDeposit([stay, stay, stay], { kind: "FIRST_NIGHT" });
    eq(r.depositRequiredSatang, dep, "มัดจำกลุ่ม");
    eq(rows.map((x) => x.depositSatang).sort((a, b) => b - a), [dep, 0, 0], "มัดจำหัวกลุ่ม");
    ok(rows.every((x) => x.totalSatang === refTotal(CELL.dlx, ci, co) && x.status === "CONFIRMED"), "total/สถานะต่อแถว");
    eq(await prisma.hotelBookingNight.count({ where: { reservationId: { in: rows.map((x) => x.id) } } }), 6, "nights");
    const occ = (await prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId: { in: rows.map((x) => x.id) }, active: true } })) as Any[];
    eq([occ.length, new Set(occ.map((o) => o.roomId)).size], [3, 3], "occupancy 3 ห้อง");
    eq(await prisma.hotelFolio.count({ where: { reservationId: { in: rows.map((x) => x.id) } } }), 3, "folio");
    const ev = (await eventsOf("hotel.booking.created")).filter((e) => e.payload?.groupId === r.groupId);
    ok(ev.length >= 1, "outbox กลุ่ม");
  });
  await st("K-8", "input ผิด ⇒ ok:false โค้ดตรง §3.2 · เหตุผลไทย · ไม่สร้างแถว: PAST_DATE (เมื่อวาน) · INVALID_INPUT (checkOut ≤ checkIn · rooms [] · 11 ห้อง · source นอกชุด · ไม่มีชื่อแขก) · TOO_FAR (maxAdvanceBookingDays 30 · เข้า +31) · OVER_OCCUPANCY (ดีลักซ์ 4 คน > max 3) · EXTRA_BED_NOT_ALLOWED (ซูพีเรีย extraBeds 1)", async () => {
    needSetup(); needBooking();
    const n0 = await rvCount();
    const cases: [string, BookOver][] = [
      ["PAST_DATE", { checkIn: W(-1), checkOut: W(1) }],
      ["INVALID_INPUT", { checkIn: W(20), checkOut: W(20) }],
      ["INVALID_INPUT", { checkIn: W(20), checkOut: W(19) }],
      ["INVALID_INPUT", { rooms: [], checkIn: W(20), checkOut: W(21) }],
      ["INVALID_INPUT", { rooms: Array.from({ length: 11 }, () => ({ roomTypeId: RTA.dlx, adults: 1, children: 0 })), checkIn: W(20), checkOut: W(21) }],
      ["INVALID_INPUT", { source: "TIKTOK", checkIn: W(20), checkOut: W(21) }],
      ["INVALID_INPUT", { guest: { name: "" }, checkIn: W(20), checkOut: W(21) }],
      ["OVER_OCCUPANCY", { rooms: [{ roomTypeId: RTA.dlx, adults: 4, children: 0 }], checkIn: W(20), checkOut: W(21) }],
      ["EXTRA_BED_NOT_ALLOWED", { rooms: [{ roomTypeId: RTA.sup, adults: 2, children: 0, extraBeds: 1 }], checkIn: W(20), checkOut: W(21) }],
    ];
    const bad: string[] = [];
    for (const [code, over] of cases) { const r = await book(FRONT, over); if (failCode(r) !== code) bad.push(`${code}: ได้ ${codeOf(r)}`); else if (!THAI.test(String(r.reason ?? ""))) bad.push(`${code}: เหตุผลไม่ไทย`); }
    await setUnit("rooms.hotel.maxAdvanceBookingDays", 30);
    try { const r = await book(FRONT, { checkIn: W(31), checkOut: W(32) }); if (failCode(r) !== "TOO_FAR") bad.push(`TOO_FAR: ได้ ${codeOf(r)}`); } finally { await resetUnit("rooms.hotel.maxAdvanceBookingDays"); }
    eq(bad, [], "โค้ด");
    eq(await rvCount(), n0, "สร้างแถว");
  });
  await st("K-9", "quote ล้ม/แผน: ประเภทไม่มีราคา ⇒ NO_RATE + dates · แผน MIN2 1 คืน ⇒ MIN_NIGHTS · 2 คืนผ่าน · ratePlanId ของหน่วยอื่น/ร้านอื่น ⇒ NOT_FOUND · roomTypeId หน่วยอื่น ⇒ NOT_FOUND · ไม่ส่ง ratePlanId ⇒ ใช้แผนเริ่มต้น (ratePlanId = STANDARD) · NONREF depositRequired = FULL", async () => {
    needSetup(); needBooking();
    const nr = await book(FRONT, { rooms: [{ roomTypeId: RTA.norate, adults: 1, children: 0 }], checkIn: W(20), checkOut: W(22) });
    eq([failCode(nr), [...(nr.dates ?? [])].sort()], ["NO_RATE", [W(20), W(21)]], "NO_RATE");
    eq(failCode(await book(FRONT, { ratePlanId: ids.min2, checkIn: W(20), checkOut: W(21) })), "MIN_NIGHTS", "MIN_NIGHTS");
    const m2 = await bookOk(FRONT, { ratePlanId: ids.min2, checkIn: W(20), checkOut: W(22) }); ids.k9 = m2.reservations[0].id;
    const u2plan = await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH2 } });
    if (u2plan) eq(failCode(await book(FRONT, { ratePlanId: u2plan.id, checkIn: W(20), checkOut: W(21) })), "NOT_FOUND", "แผนหน่วยอื่น");
    eq(failCode(await book(FRONT, { ratePlanId: ids.stdB, checkIn: W(20), checkOut: W(21) })), "NOT_FOUND", "แผนร้าน B");
    eq(failCode(await book(FRONT, { rooms: [{ roomTypeId: RT_U2, adults: 1, children: 0 }], checkIn: W(20), checkOut: W(21) })), "NOT_FOUND", "ประเภทหน่วยอื่น");
    const d = await bookOk(FRONT, { ratePlanId: undefined, checkIn: W(22), checkOut: W(23) }); ids.k9d = d.reservations[0].id;
    eq((await rvOf(d.reservations[0].id)).ratePlanId, ids.std, "แผนเริ่มต้น");
    const nrf = await bookOk(FRONT, { ratePlanId: ids.nr, checkIn: W(23), checkOut: W(25) }); ids.k9n = nrf.reservations[0].id;
    eq(nrf.depositRequiredSatang, refTotal({ weekday: floor90(CELL.dlx.weekday), weekend: floor90(CELL.dlx.weekend) }, W(23), W(25)), "NONREF FULL");
  });
  await st("K-10", "AVAILABILITY_CHANGED: ประเภท «ห้องเดียว» (1 ห้อง) จอง 20–22 สำเร็จ · จอง 21–23 ⇒ AVAILABILITY_CHANGED dates=[21] (เฉพาะคืนที่เต็ม) · ขอ 2 ห้องประเภทนี้ ⇒ AVAILABILITY_CHANGED · ไม่มีแถว/nights เพิ่ม · เหตุผลไทย", async () => {
    needSetup(); needBooking();
    const a = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.one, adults: 2, children: 0 }], checkIn: W(20), checkOut: W(22) }); ids.k10 = a.reservations[0].id;
    const n0 = await rvCount(), nn0 = await prisma.hotelBookingNight.count({ where: { tenantId: tA } });
    const b = await book(FRONT, { rooms: [{ roomTypeId: RTA.one, adults: 2, children: 0 }], checkIn: W(21), checkOut: W(23) });
    eq([failCode(b), [...(b.dates ?? [])]], ["AVAILABILITY_CHANGED", [W(21)]], "ชนคืนเดียว");
    ok(THAI.test(String(b.reason ?? "")), "เหตุผลไทย");
    eq(failCode(await book(FRONT, { rooms: [1, 2].map(() => ({ roomTypeId: RTA.one, adults: 1, children: 0 })), checkIn: W(26), checkOut: W(27) })), "AVAILABILITY_CHANGED", "2 ห้องเกินจำนวน");
    eq([await rvCount(), await prisma.hotelBookingNight.count({ where: { tenantId: tA } })], [n0, nn0], "แถวเพิ่ม");
  });
  await st("K-11", "nights พอแต่ไม่มีห้องเดียวตลอดช่วง (ใบ §2 ข้อ 1 «ไม่ได้ห้อง = ไม่ล้ม»): ซูพีเรีย 2 ห้อง · BLOCK SUP1 40–41 · BLOCK SUP2 41–42 ⇒ จอง 40–42 ok CONFIRMED · occupancy 0 · nights 2 counted roomId null · availability ซูพีเรีย 40/41 = 0 หลังจอง", async () => {
    needSetup(); needBooking();
    okRes(await claim({ roomId: ROOM.SUP1, start: W(40), end: W(41), kind: "BLOCK", refType: "QcBlock", refId: `k11a-${RUN}` }), "BLOCK 1");
    okRes(await claim({ roomId: ROOM.SUP2, start: W(41), end: W(42), kind: "BLOCK", refType: "QcBlock", refId: `k11b-${RUN}` }), "BLOCK 2");
    const r = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 2, children: 0 }], checkIn: W(40), checkOut: W(42) });
    ids.k11 = r.reservations[0].id;
    eq(r.reservations[0].status, "CONFIRMED", "status");
    eq((await occOfRv(ids.k11, true)).length, 0, "ต้องไม่มี occupancy");
    const ns = await nightsOfRv(ids.k11);
    eq(ns.map((n) => [ymdOfDb(n.date), n.counted, n.roomId ?? null]), [[W(40), true, null], [W(41), true, null]], "nights");
    const av = await avA({ roomTypeId: RTA.sup, from: W(40), to: W(42) });
    eq([av.byDate[W(40)][RTA.sup].available, av.byDate[W(41)][RTA.sup].available], [0, 0], "ว่าง 0");
  });
  await st("K-12", "code running ต่อหน่วย prefix จากค่าตั้ง rooms.hotel.codePrefix: ตั้ง «BS» ⇒ code ขึ้นต้น BS- · 2 ใบติดกันเลขไม่ซ้ำและเพิ่มขึ้น · unique (unitId, code) · คืนค่า ⇒ HR-", async () => {
    needSetup(); needBooking();
    await setUnit("rooms.hotel.codePrefix", "BS");
    let a: Any, b: Any;
    try {
      a = await bookOk(FRONT, { checkIn: W(26), checkOut: W(27) });
      b = await bookOk(FRONT, { checkIn: W(27), checkOut: W(28) });
    } finally { await resetUnit("rooms.hotel.codePrefix"); }
    ids.k12a = a.reservations[0].id; ids.k12b = b.reservations[0].id;
    ok(/^BS-/.test(a.reservations[0].code) && /^BS-/.test(b.reservations[0].code), `prefix ${a.reservations[0].code} ${b.reservations[0].code}`);
    const num = (c: string) => Number((c.match(/(\d+)$/) ?? [])[1] ?? NaN);
    ok(num(b.reservations[0].code) > num(a.reservations[0].code), `running ${a.reservations[0].code} → ${b.reservations[0].code}`);
    const c = await bookOk(FRONT, { checkIn: W(28), checkOut: W(29) }); ids.k12c = c.reservations[0].id;
    ok(/^HR-/.test(c.reservations[0].code), `คืนค่า ${c.reservations[0].code}`);
  });
  await st("K-13", "tx ล้มทั้งชุด: rooms [ดีลักซ์ (ถูก), ประเภทร้าน B] ⇒ NOT_FOUND · ไม่มีแถว/nights/occupancy ของดีลักซ์คืน 24 · ไม่รั่ว id ร้าน B ในคำตอบ", async () => {
    needSetup(); needBooking();
    const n0 = await rvCount();
    const nn0 = await prisma.hotelBookingNight.count({ where: { tenantId: tA, roomTypeId: RTA.dlx, date: dbDate(W(24)) } }); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h3-K13-isolation): K-9 จองคืนนี้ไว้ก่อน ⇒ เทียบก่อน/หลังแทนคาด 0
    const r = await book(FRONT, { rooms: [{ roomTypeId: RTA.dlx, adults: 2, children: 0 }, { roomTypeId: RT_B, adults: 2, children: 0 }], checkIn: W(24), checkOut: W(25) });
    eq(failCode(r), "NOT_FOUND", `ได้ ${codeOf(r)}`);
    eq(await rvCount(), n0, "แถวเพิ่ม");
    eq(await prisma.hotelBookingNight.count({ where: { tenantId: tA, roomTypeId: RTA.dlx, date: dbDate(W(24)) } }), nn0, "nights ค้าง");
    ok(!J(r).includes(RT_B), "รั่ว id ร้าน B");
  });
  await st("K-14", "load ในตัว (X3/X4 · ใบ §2 ข้อ 10): 20 createBooking พร้อมกันบน «ห้องเดียว» คืน 30 ⇒ สำเร็จ 1 · AVAILABILITY_CHANGED 19 · ไม่มี throw/40P01/deadlock · nights คืนนั้น 1 แถว · occupancy 1 · แล้วลำดับล็อกสลับ: 10 คำขอ [ดีลักซ์,แฟมิลี] + 10 [แฟมิลี,ดีลักซ์] คืน 32 (แฟมิลี 1 ห้อง) ⇒ สำเร็จ 1 · ไม่มี 40P01", async () => {
    needSetup(); needBooking();
    const run = async (mk: (i: number) => BookOver) => {
      const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => book(FRONT, mk(i)).then((r: Any) => ({ r }), (e: unknown) => ({ threw: errMsg(e) }))));
      const threw = rs.filter((x: Any) => x.threw).map((x: Any) => x.threw);
      const okN = rs.filter((x: Any) => x.r?.ok === true).length;
      const changed = rs.filter((x: Any) => failCode(x.r) === "AVAILABILITY_CHANGED").length;
      const other = rs.filter((x: Any) => x.r && x.r.ok === false && failCode(x.r) !== "AVAILABILITY_CHANGED").map((x: Any) => `${codeOf(x.r)}:${x.r.reason ?? ""}`);
      const txt = J(rs);
      return { okN, changed, other, threw, dead: /40P01|deadlock/i.test(txt) };
    };
    const a = await run(() => ({ rooms: [{ roomTypeId: RTA.one, adults: 1, children: 0 }], checkIn: W(30), checkOut: W(31) }));
    console.log(`     (load A: ok ${a.okN} · changed ${a.changed} · other ${a.other.length} · threw ${a.threw.length})`);
    eq([a.okN, a.changed, a.other.slice(0, 2), a.threw.slice(0, 2), a.dead], [1, 19, [], [], false], "รอบ A");
    eq(await prisma.hotelBookingNight.count({ where: { tenantId: tA, roomTypeId: RTA.one, date: dbDate(W(30)) } }), 1, "nights ส่วนเกิน");
    eq(await prisma.roomOccupancy.count({ where: { tenantId: tA, roomId: ROOM.ONE1, active: true, startDate: { lte: dbDate(W(30)) }, endDate: { gt: dbDate(W(30)) } } }), 1, "occupancy ส่วนเกิน");
    const b = await run((i) => ({ rooms: i % 2 ? [{ roomTypeId: RTA.dlx, adults: 1, children: 0 }, { roomTypeId: RTA.fam, adults: 2, children: 0 }] : [{ roomTypeId: RTA.fam, adults: 2, children: 0 }, { roomTypeId: RTA.dlx, adults: 1, children: 0 }], checkIn: W(32), checkOut: W(33) }));
    console.log(`     (load B: ok ${b.okN} · changed ${b.changed} · other ${b.other.length} · threw ${b.threw.length})`);
    eq([b.okN, b.other.slice(0, 2), b.threw.slice(0, 2), b.dead], [1, [], [], false], "รอบ B (ลำดับล็อก)");
    eq(await prisma.hotelBookingNight.count({ where: { tenantId: tA, roomTypeId: RTA.fam, date: dbDate(W(32)) } }), 1, "nights แฟมิลี");
  });
  await st("K-15", `probe «${F.probe}» (ร้านชั่วคราวของมันเอง · 20 คำขอ × 3 รอบ + สลับลำดับ) exit 0 · JSON_SUMMARY passed:true · ทุกรอบ ok 1 · ไม่มี 40P01`, async () => {
    needBooking();
    ok(has(F.probe), `ไม่มี ${F.probe}`);
    const r = spawnSync("pnpm", ["exec", "tsx", F.probe], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
    let sum: Any = null; try { sum = line ? JSON.parse(line.slice(13)) : null; } catch { /* */ }
    ok(r.status === 0 && sum?.passed === true, `exit=${r.status} · ${sum ? J(sum).slice(0, 300) : out.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
    ok(Array.isArray(sum.rounds) && sum.rounds.length >= 3 && sum.rounds.every((x: Any) => x.ok === 1 && x.changed === x.total - 1 && !x.deadlock), `rounds ${J(sum.rounds)}`);
  });
  await st("K-16", "ช่องทาง/public: createBooking(null, …, {source WEB, hold ONLINE}) ⇒ ok HOLD createdById null (ทางของ H.8) · null actor + WALK_IN ⇒ ok:false (ไม่ throw · ไม่สร้าง) · OTA + channelRef «AGD-1» ⇒ เก็บ source/channelRef · LINE ONLINE ⇒ HOLD 15 นาที · source ทุกตัวใน {WEB,WALK_IN,PHONE,LINE,OTA} สร้างได้", async () => {
    needSetup(); needBooking();
    const p = await bookOk(null, { source: "WEB", hold: "ONLINE", checkIn: W(34), checkOut: W(35) }); ids.k16 = p.reservations[0].id;
    eq([p.reservations[0].status, (await rvOf(ids.k16)).createdById ?? null], ["HOLD", null], "public");
    const n0 = await rvCount();
    const w = await book(null, { source: "WALK_IN", checkIn: W(34), checkOut: W(35) });
    ok(w && w.ok === false, `null actor WALK_IN ${J(w).slice(0, 80)}`);
    eq(await rvCount(), n0, "สร้างแถว");
    const o = await bookOk(FRONT, { source: "OTA", channelRef: "AGD-1", rooms: [{ roomTypeId: RTA.fam, adults: 2, children: 0 }], checkIn: W(34), checkOut: W(35) }); ids.k16o = o.reservations[0].id;
    eq([(await rvOf(ids.k16o)).source, (await rvOf(ids.k16o)).channelRef], ["OTA", "AGD-1"], "OTA");
    const l = await bookOk(FRONT, { source: "LINE", hold: "ONLINE", rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(34), checkOut: W(35) }); ids.k16l = l.reservations[0].id;
    ok(l.reservations[0].status === "HOLD" && near(msOf(l.reservations[0].holdExpiresAt), Date.now() + 15 * 60_000, 90_000), "LINE HOLD");
    const wi = await bookOk(FRONT, { source: "WALK_IN", checkIn: W(35), checkOut: W(36) }); ids.k16w = wi.reservations[0].id;
    eq((await rvOf(ids.k16w)).source, "WALK_IN", "WALK_IN");
  });
  await st("K-17", "booking.ts สถิต (ใบ §2 ข้อ 1 · §0): pg_advisory_xact_lock(hashtext(unitId||':'||roomTypeId)) + เรียง roomTypeId · tenantDb · $transaction · writeAudit/auditLog · emitOutbox · retry code ชน unique (3) · ไม่เขียน BOOKED · ใช้ quoteStay/depositFor/depositPolicyOf จาก ./pricing · claimRoom/releaseOccupancy/moveOccupancy/resizeOccupancy ผ่าน facade @/lib/modules/rooms (ไม่ล้วง subpath) · moduleTakeDeposit/moduleRefundDeposit/moduleForfeitDeposit จาก pos/deposit · ไม่ import prisma ดิบ", () => {
    const s = stripComments(read(F.booking));
    ok(s, `ยังไม่มี ${F.booking}`);
    const bad: string[] = [];
    if (!/pg_advisory_xact_lock/.test(s) || !/hashtext/.test(s)) bad.push("ไม่มี advisory lock");
    if (!/\.sort\(/.test(s)) bad.push("ไม่เรียง roomTypeId ก่อนล็อก");
    if (!/tenantDb\s*\(/.test(s)) bad.push("ไม่ใช้ tenantDb");
    if (!/\$transaction\s*\(/.test(s)) bad.push("ไม่มี $transaction");
    if (!/writeAudit\s*\(|auditLog\.create\s*\(/.test(s)) bad.push("ไม่มี AuditLog");
    if (!/emitOutbox(Many)?\s*\(/.test(s)) bad.push("ไม่มี emitOutbox");
    if (/status:\s*["']BOOKED["']/.test(s)) bad.push("เขียน BOOKED");
    for (const w of ["quoteStay", "depositFor", "depositPolicyOf", "refundFor"]) if (!s.includes(w)) bad.push(`ไม่ใช้ ${w}`);
    if (!/from\s*["']@\/lib\/modules\/rooms["']/.test(s)) bad.push("ไม่ import rooms facade");
    if (/@\/lib\/modules\/rooms\/[a-z]/.test(s)) bad.push("ล้วง subpath rooms");
    for (const w of ["claimRoom", "releaseOccupancy", "moveOccupancy", "resizeOccupancy"]) if (!s.includes(w)) bad.push(`ไม่ใช้ ${w}`);
    for (const w of ["moduleTakeDeposit", "moduleRefundDeposit", "moduleForfeitDeposit"]) if (!s.includes(w)) bad.push(`ไม่ใช้ ${w}`);
    if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(s) && !/\$transaction/.test(s)) bad.push("import prisma ดิบ");
    if (!/SVC_QC_CLOCK/.test(s)) bad.push("ไม่มีด่าน SVC_QC_CLOCK");
    eq(bad, [], "สถิต");
  });

  // ═══════════════ D มัดจำ / ยกเลิก / ริบ (ผ่าน POS) ═══════════════
  console.log("\n── D มัดจำ/ยกเลิก/ริบ ผ่าน POS ──");
  const receiptOf = async (id: string) => { const rv = await rvOf(id); ok(rv?.depositSaleId, `แถว ${id} ไม่มี depositSaleId`); return prisma.posSale.findUnique({ where: { id: rv.depositSaleId } }) as Promise<Any>; };
  await st("D-1", "takeBookingDeposit (HOLD K-4 · PROMPTPAY) ⇒ ok · ใบรับ PosSale idempotencyKey hotel-deposit-<id> sourceModule POS_DEPOSIT status PAID grandTotal = depositSatang · PosPayment PROMPTPAY ยอดเดียวกัน · PosDeposit OPEN ผูกใบรับ · แถว depositPaidAt/depositSaleId · HOLD→CONFIRMED · folio OPEN · outbox hotel.booking.confirmed · AuditLog · ไม่มีการเขียนบัญชีตรงจากโมดูลโรงแรม (ไม่มี import account ใน booking.ts)", async () => {
    needSetup(); needBooking(); ok(ids.k4, "ไม่มี K-4");
    const rv0 = await rvOf(ids.k4);
    eq(rv0.status, "HOLD", "สถานะก่อน");
    const r = okRes(await takeDeposit(FRONT, { reservationId: ids.k4 }), "take");
    const rv = await rvOf(ids.k4);
    ok(rv.depositPaidAt && rv.depositSaleId, `แถวไม่บันทึกมัดจำ ${J({ paidAt: rv.depositPaidAt, saleId: rv.depositSaleId })}`);
    eq(rv.status, "CONFIRMED", "สถานะหลังจ่าย");
    const sale = await prisma.posSale.findUnique({ where: { id: rv.depositSaleId } });
    ok(sale, "ไม่มี PosSale");
    eq([sale.idempotencyKey, sale.sourceModule, sale.status, sale.grandTotalSatang, sale.unitId], [`hotel-deposit-${ids.k4}`, "POS_DEPOSIT", "PAID", rv.depositSatang, UH], "ใบรับ");
    eq((await payOf(sale.id)).map((p: Any) => [p.type, p.amountSatang]), [["PROMPTPAY", rv.depositSatang]], "PosPayment");
    const dep = await prisma.posDeposit.findUnique({ where: { receiptSaleId: sale.id } });
    eq([dep?.status, dep?.amountSatang, dep?.unitId], ["OPEN", rv.depositSatang, UH], "PosDeposit");
    eq((await folioOf(ids.k4))?.status, "OPEN", "folio");
    eq((await eventsOf("hotel.booking.confirmed", ids.k4)).length, 1, "outbox confirmed");
    ok((await auditsOf("hotel.booking.deposit")).some((a) => a.targetId === ids.k4) || (await auditsOf("hotel.booking.confirmed")).some((a) => a.targetId === ids.k4), "AuditLog มัดจำ/ยืนยัน");
    ok(!/@\/lib\/modules\/account/.test(stripComments(read(F.booking))), "booking.ts import account ตรง");
    void r;
  });
  await st("D-2", "มัดจำซ้ำ (X3): takeBookingDeposit ซ้ำใบเดิม ⇒ ok (duplicated) · PosSale hotel-deposit-* ของแถวยัง 1 ใบ · depositSaleId ไม่เปลี่ยน · จ่ายบน CANCELLED ปกติ (ไม่ใช่ HOLD_EXPIRED) ⇒ ok:false ไม่สร้างใบ", async () => {
    needBooking(); ok(ids.k4, "ไม่มี K-4");
    const before = (await rvOf(ids.k4)).depositSaleId;
    const r = await takeDeposit(FRONT, { reservationId: ids.k4 });
    ok(r?.ok === true, `ซ้ำ ${J(r).slice(0, 80)}`);
    eq((await rvOf(ids.k4)).depositSaleId, before, "depositSaleId เปลี่ยน");
    eq((await prisma.posSale.count({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-deposit-${ids.k4}` } } })), 1, "ใบรับซ้อน");
    const c = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(44), checkOut: W(45) });
    okRes(await cancel(FRONT, { reservationId: c.reservations[0].id }), "ยกเลิกก่อน");
    const n0 = await prisma.posSale.count({ where: { tenantId: tA } });
    const x = await takeDeposit(FRONT, { reservationId: c.reservations[0].id });
    ok(x && x.ok === false, `จ่ายบน CANCELLED ${J(x).slice(0, 80)}`);
    eq(await prisma.posSale.count({ where: { tenantId: tA } }), n0, "สร้างใบ");
  });
  await st("D-3", "payType จาก UI (มติ §2 ข้อ 8): CASH/PROMPTPAY/TRANSFER/CARD ยอมรับ (PosPayment ตรงที่ส่ง · ไม่ใช่ TRANSFER ตายตัว) · payType นอกชุด ⇒ INVALID_INPUT ไม่สร้างใบ · reservationId มั่ว ⇒ NOT_FOUND", async () => {
    needSetup(); needBooking();
    const n0 = await prisma.posSale.count({ where: { tenantId: tA } });
    const bad = await takeDeposit(FRONT, { reservationId: ids.k6a, payType: "BITCOIN" });
    eq(failCode(bad), "INVALID_INPUT", `payType ผิด ${J(bad).slice(0, 80)}`);
    eq(await prisma.posSale.count({ where: { tenantId: tA } }), n0, "สร้างใบ");
    eq(failCode(await takeDeposit(FRONT, { reservationId: "ไม่มี-id" })), "NOT_FOUND", "id มั่ว");
    okRes(await takeDeposit(FRONT, { reservationId: ids.k6a, payType: "CASH" }), "CASH");
    eq((await payOf((await rvOf(ids.k6a)).depositSaleId)).map((p: Any) => p.type), ["CASH"], "PosPayment CASH");
    okRes(await takeDeposit(FRONT, { reservationId: ids.k9d, payType: "CARD", reference: "AUTH-1" }), "CARD");
    eq((await payOf((await rvOf(ids.k9d)).depositSaleId)).map((p: Any) => p.type), ["CARD"], "PosPayment CARD");
  });
  await st("D-4", "จ่ายหลัง HOLD หมดอายุ · ห้องยังว่าง (ใบ §2 ข้อ 2 · S §7.3): HOLD WEB ด้วย at = now−40 นาที (SVC_QC_CLOCK) ⇒ sweep ⇒ CANCELLED HOLD_EXPIRED nights false · takeBookingDeposit ⇒ re-book ใน guard tx: CONFIRMED · nights counted true · occupancy active 1 · ใบรับ PosSale · folio OPEN", async () => {
    needSetup(); needBooking();
    const at = new Date(Date.now() - 40 * 60_000).toISOString();
    const r = await withClock(true, async () => bookOk(FRONT, { source: "WEB", hold: "ONLINE", checkIn: W(50), checkOut: W(51), at }));
    ids.d4 = r.reservations[0].id;
    ok(msOf(r.reservations[0].holdExpiresAt) < Date.now(), `holdExpiresAt ต้องเป็นอดีต (${r.reservations[0].holdExpiresAt})`);
    const sw = await BK("sweepExpiredHolds")({});
    ok(typeof sw?.expired === "number" && sw.expired >= 1, `sweep ${J(sw)}`);
    const rv1 = await rvOf(ids.d4);
    eq([rv1.status, rv1.cancelReason], ["CANCELLED", "HOLD_EXPIRED"], "หลัง sweep");
    ok((await nightsOfRv(ids.d4)).every((n) => !n.counted), "nights ยัง counted");
    okRes(await takeDeposit(FRONT, { reservationId: ids.d4 }), "จ่ายหลังหมดอายุ");
    const rv2 = await rvOf(ids.d4);
    eq([rv2.status, !!rv2.depositPaidAt, !!rv2.depositSaleId], ["CONFIRMED", true, true], "re-book");
    const ns = await nightsOfRv(ids.d4);
    ok(ns.length === 1 && ns.every((n) => n.counted), `nights ${J(ns.map((n) => [ymdOfDb(n.date), n.counted]))}`);
    eq((await occOfRv(ids.d4, true)).length, 1, "occupancy");
    eq((await folioOf(ids.d4))?.status, "OPEN", "folio");
  });
  await st("D-5", "จ่ายหลังหมดอายุ · ห้องไม่ว่างแล้ว: HOLD «ห้องเดียว» หมดอายุ → sweep → คนอื่นจองคืนนั้นสำเร็จ → takeBookingDeposit ⇒ สถานะคง CANCELLED · ใบรับถูกคืนอัตโนมัติ (PosSale REFUND อ้างใบรับ ยอดเต็ม · PosDeposit ไม่ OPEN) · outbox hotel.booking.deposit_after_expiry · การจองคนอื่นไม่กระทบ · nights คง counted=false", async () => {
    needSetup(); needBooking();
    const at = new Date(Date.now() - 40 * 60_000).toISOString();
    const a = await withClock(true, async () => bookOk(FRONT, { source: "WEB", hold: "ONLINE", rooms: [{ roomTypeId: RTA.one, adults: 1, children: 0 }], checkIn: W(52), checkOut: W(53), at }));
    ids.d5 = a.reservations[0].id;
    await BK("sweepExpiredHolds")({});
    eq((await rvOf(ids.d5)).status, "CANCELLED", "หลัง sweep");
    const b = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.one, adults: 1, children: 0 }], checkIn: W(52), checkOut: W(53) });
    ids.d5b = b.reservations[0].id;
    const r = await takeDeposit(FRONT, { reservationId: ids.d5 });
    ok(r && typeof r.ok === "boolean", "throw");
    const rv = await rvOf(ids.d5);
    eq(rv.status, "CANCELLED", "สถานะต้องคง CANCELLED");
    ok((await nightsOfRv(ids.d5)).every((n) => !n.counted), "nights กลับมานับ");
    const receipts = (await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-deposit-${ids.d5}` } } })) as Any[];
    ok(receipts.length >= 1, "ไม่มีใบรับ (เงินลูกค้าเข้าแล้วต้องมีใบรับก่อนคืน)");
    const refunds = await refundSalesOf(receipts[0].id);
    eq([refunds.length, refunds[0]?.grandTotalSatang], [1, receipts[0].grandTotalSatang], "คืนอัตโนมัติ");
    ok((await prisma.posDeposit.findUnique({ where: { receiptSaleId: receipts[0].id } }))?.status !== "OPEN", "PosDeposit ยัง OPEN");
    eq((await eventsOf("hotel.booking.deposit_after_expiry", ids.d5)).length, 1, "outbox");
    eq((await rvOf(ids.d5b)).status, "CONFIRMED", "การจองคนอื่น");
  });
  const paidDeposit = async (id: string) => { okRes(await takeDeposit(FRONT, { reservationId: id }), "จ่ายมัดจำ"); const rv = await rvOf(id); return { paid: rv.depositSatang as number, receipt: rv.depositSaleId as string, rv }; };
  await st("D-6", "ยกเลิก 100% (K-1 เข้า +8 · กฎ 7 วัน): จ่ายมัดจำ → cancelBooking(manage · reason) ⇒ CANCELLED cancelledAt cancelReason · PosSale REFUND อ้างใบรับ ยอด = refundFor = เต็ม · PosDeposit REFUNDED · ไม่มีบิลริบ · nights counted false · occupancy inactive · folio ไม่ OPEN · outbox hotel.booking.cancelled payload ไม่มี PII · AuditLog hotel.booking.cancelled มี reason", async () => {
    needSetup(); needBooking(); ok(ids.k1, "ไม่มี K-1");
    const { paid, receipt } = await paidDeposit(ids.k1);
    const exp = refRefund(paid, W(8), T0, Q2_RULES);
    eq(exp.refundSatang, paid, "ตัวอ้างอิง 100%");
    okRes(await cancel(FRONT, { reservationId: ids.k1, reason: "ลูกค้าเปลี่ยนแผน" }), "cancel");
    const rv = await rvOf(ids.k1);
    eq([rv.status, !!rv.cancelledAt, rv.cancelReason], ["CANCELLED", true, "ลูกค้าเปลี่ยนแผน"], "แถว");
    const refunds = await refundSalesOf(receipt);
    eq([refunds.length, refunds[0]?.grandTotalSatang, refunds[0]?.status], [1, exp.refundSatang, "PAID"], "ใบคืน");
    eq((await prisma.posDeposit.findUnique({ where: { receiptSaleId: receipt } }))?.status, "REFUNDED", "PosDeposit");
    eq((await forfeitSalesOf(receipt)).length, 0, "บิลริบ");
    ok((await nightsOfRv(ids.k1)).every((n) => !n.counted), "nights");
    eq((await occOfRv(ids.k1, true)).length, 0, "occupancy");
    ok((await folioOf(ids.k1))?.status !== "OPEN", "folio ยัง OPEN");
    const ev = await eventsOf("hotel.booking.cancelled", ids.k1);
    eq(ev.length, 1, "outbox");
    checkPayload(ev[0], "cancelled");
    const a = (await auditsOf("hotel.booking.cancelled")).filter((x) => x.targetId === ids.k1);
    ok(a.length >= 1 && J([a[0].before, a[0].after]).includes("ลูกค้าเปลี่ยนแผน"), "AuditLog ไม่มี reason");
    ok(!PII_TEXT.test(J(a.map((x) => [x.before, x.after]))), "PII ใน AuditLog");
  });
  await st("D-7", "ยกเลิก 50% (เข้า +5 · กฎ 3 วัน 50%): refund = floor(paid×5000/10000) ผ่าน moduleRefundDeposit · ส่วนที่เหลือ = บิลริบ (dep-forfeit:) · refund + ริบ = paid · PosDeposit ไม่ OPEN · เงินทุกบาทผ่าน POS (ไม่มีแถว account ตรง)", async () => {
    needSetup(); needBooking();
    const r = await bookOk(FRONT, { checkIn: W(5), checkOut: W(6) }); ids.d7 = r.reservations[0].id;
    const { paid, receipt } = await paidDeposit(ids.d7);
    const exp = refRefund(paid, W(5), T0, Q2_RULES);
    eq(exp.rule?.refundBp, 5000, "ตัวอ้างอิง 50%");
    okRes(await cancel(FRONT, { reservationId: ids.d7 }), "cancel");
    eq((await rvOf(ids.d7)).status, "CANCELLED", "สถานะ");
    const refunds = await refundSalesOf(receipt), forfeits = await forfeitSalesOf(receipt);
    eq([refunds.reduce((a, s) => a + s.grandTotalSatang, 0), forfeits.reduce((a, s) => a + s.grandTotalSatang, 0)], [exp.refundSatang, paid - exp.refundSatang], "คืน/ริบ");
    ok((await prisma.posDeposit.findUnique({ where: { receiptSaleId: receipt } }))?.status !== "OPEN", "PosDeposit ยัง OPEN");
  });
  await st("D-8", "ยกเลิก 0% (เข้า +1 · กฎ 0 วัน): ไม่มีใบคืน · บิลริบ = paid ทั้งก้อน · PosDeposit ไม่ OPEN · แถว CANCELLED · nights false", async () => {
    needSetup(); needBooking();
    const r = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(1), checkOut: W(2) }); ids.d8 = r.reservations[0].id;
    const { paid, receipt } = await paidDeposit(ids.d8);
    eq(refRefund(paid, W(1), T0, Q2_RULES).refundSatang, 0, "ตัวอ้างอิง 0%");
    okRes(await cancel(FRONT, { reservationId: ids.d8 }), "cancel");
    eq([(await refundSalesOf(receipt)).length, (await forfeitSalesOf(receipt)).reduce((a, s) => a + s.grandTotalSatang, 0)], [0, paid], "คืน/ริบ");
    ok((await prisma.posDeposit.findUnique({ where: { receiptSaleId: receipt } }))?.status !== "OPEN", "PosDeposit ยัง OPEN");
    eq((await rvOf(ids.d8)).status, "CANCELLED", "สถานะ");
  });
  await st("D-9", "snapshot ชนะค่าสด (ใบ §0): จองดีลักซ์ เข้า +9 · จ่ายมัดจำ · แก้กฎยกเลิกของแผนเป็น [0:0%] · ยกเลิก ⇒ ยังคืน 100% ตาม policySnapshot · คืนกฎ Q2", async () => {
    needSetup(); needBooking();
    const r = await bookOk(FRONT, { checkIn: W(9), checkOut: W(10) }); ids.d9 = r.reservations[0].id;
    const { paid, receipt } = await paidDeposit(ids.d9);
    okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: [{ daysBefore: 0, refundBp: 0 }] }), "แก้กฎ");
    try {
      okRes(await cancel(FRONT, { reservationId: ids.d9 }), "cancel");
      const refunds = await refundSalesOf(receipt);
      eq([refunds.length, refunds[0]?.grandTotalSatang], [1, paid], "ต้องคืน 100% ตาม snapshot");
    } finally { okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: Q2_RULES }), "คืนกฎ"); }
  });
  await st("D-10", "ยกเลิกซ้ำ/สถานะผิด (X3): cancel K-1 ซ้ำ ⇒ ok:false ไม่ throw · ใบคืนยัง 1 · ไม่มีบิลริบ · เช็กอิน (checkIn เดิมบน CONFIRMED) แล้ว cancel ⇒ ok:false สถานะคง CHECKED_IN", async () => {
    needSetup(); needBooking(); ok(ids.k1 && ids.k12a, "ไม่มี K-1/K-12");
    const receipt = (await rvOf(ids.k1)).depositSaleId;
    const again = await cancel(FRONT, { reservationId: ids.k1 });
    ok(again && again.ok === false, `ซ้ำ ${J(again).slice(0, 80)}`);
    eq([(await refundSalesOf(receipt)).length, (await forfeitSalesOf(receipt)).length], [1, 0], "เงินซ้ำ");
    const occ = await occOfRv(ids.k12a, true);
    ok(occ.length === 1, "K-12a ไม่มี occupancy");
    okRes(await fnOf(serviceL, "checkIn", F.service)(tA, UH, ids.k12a, occ[0].roomId), "checkIn เดิม");
    eq((await rvOf(ids.k12a)).status, "CHECKED_IN", "เช็กอิน");
    const c = await cancel(FRONT, { reservationId: ids.k12a });
    ok(c && c.ok === false, `cancel CHECKED_IN ${J(c).slice(0, 80)}`);
    eq((await rvOf(ids.k12a)).status, "CHECKED_IN", "สถานะคง");
  });
  await st("D-11", "กลุ่ม (ใบ §2 ข้อ 4): จ่ายมัดจำหัวกลุ่ม (keyBase hotel-deposit-<groupId>) ⇒ ทุกแถว CONFIRMED · ยกเลิกแถวที่ไม่ใช่หัว ⇒ แถวนั้น CANCELLED · ไม่คืนเงิน · หัวคงเดิม · ยกเลิกหัว ⇒ หัวย้ายไปแถวถัดไป (depositSatang/depositPaidAt/depositSaleId) · ไม่คืนเงิน · ยกเลิกทั้งกลุ่ม (groupId) ⇒ แถวที่เหลือ CANCELLED + คืนเงินครั้งเดียว 100% (เข้า +16)", async () => {
    needSetup(); needBooking(); ok(ids.g, "ไม่มีกลุ่ม K-7");
    const rows = async () => (await prisma.hotelReservation.findMany({ where: { tenantId: tA, groupId: ids.g }, orderBy: { createdAt: "asc" } })) as Any[];
    okRes(await takeDeposit(FRONT, { reservationId: ids.gHead }), "จ่ายหัวกลุ่ม");
    let rs = await rows();
    const head = rs.find((x) => x.id === ids.gHead);
    ok(head.depositPaidAt && head.depositSaleId && rs.every((x) => x.status === "CONFIRMED"), "หัวกลุ่มหลังจ่าย");
    ok(String((await prisma.posSale.findUnique({ where: { id: head.depositSaleId } }))?.idempotencyKey).startsWith(`hotel-deposit-${ids.g}`), "keyBase ต้องเป็น hotel-deposit-<groupId>");
    const receipt = head.depositSaleId, paid = head.depositSatang;
    const other = rs.find((x) => x.id !== ids.gHead)!;
    okRes(await cancel(FRONT, { reservationId: other.id }), "ยกเลิกแถวรอง");
    rs = await rows();
    eq([rs.find((x) => x.id === other.id).status, rs.find((x) => x.id === ids.gHead).status, rs.find((x) => x.id === ids.gHead).depositSaleId, (await refundSalesOf(receipt)).length], ["CANCELLED", "CONFIRMED", receipt, 0], "แถวรอง");
    okRes(await cancel(FRONT, { reservationId: ids.gHead }), "ยกเลิกหัว");
    rs = await rows();
    const left = rs.filter((x) => x.status === "CONFIRMED");
    eq(left.length, 1, "เหลือ 1 แถว");
    eq([left[0].depositSatang, left[0].depositSaleId, !!left[0].depositPaidAt, (await refundSalesOf(receipt)).length], [paid, receipt, true, 0], "หัวกลุ่มย้าย");
    okRes(await cancel(FRONT, { groupId: ids.g }), "ยกเลิกทั้งกลุ่ม");
    rs = await rows();
    ok(rs.every((x) => x.status === "CANCELLED"), "ทั้งกลุ่ม");
    const refunds = await refundSalesOf(receipt);
    eq([refunds.length, refunds[0]?.grandTotalSatang], [1, paid], "คืนครั้งเดียว 100%");
    eq(await prisma.hotelBookingNight.count({ where: { reservationId: { in: rs.map((x) => x.id) }, counted: true } }), 0, "nights");
  });
  await st("D-12", "HOLD ไร้มัดจำ ยกเลิก (K-5 รอโอน): STAFF มี reservation.cancel (ไม่มี manage) ยกเลิกได้เมื่อมัดจำจ่าย = 0 · ไม่มี PosSale · nights false · occupancy inactive · outbox cancelled", async () => {
    needSetup(); needBooking(); ok(ids.k5, "ไม่มี K-5");
    const n0 = await prisma.posSale.count({ where: { tenantId: tA } });
    okRes(await cancel(CANCELER, { reservationId: ids.k5 }), "cancel");
    eq([(await rvOf(ids.k5)).status, await prisma.posSale.count({ where: { tenantId: tA } })], ["CANCELLED", n0], "แถว/POS");
    ok((await nightsOfRv(ids.k5)).every((n) => !n.counted) && (await occOfRv(ids.k5, true)).length === 0, "nights/occupancy");
    eq((await eventsOf("hotel.booking.cancelled", ids.k5)).length, 1, "outbox");
  });
  await st("D-13", "X9 สิทธิ์เงิน: STAFF มีแค่ reservation.cancel ยกเลิกใบที่จ่ายมัดจำแล้ว ⇒ FORBIDDEN (สถานะ/เงินไม่เปลี่ยน) · MANAGER ⇒ ok คืนตามขั้นบันได · STAFF ไร้สิทธิ์ ⇒ FORBIDDEN", async () => {
    needSetup(); needBooking(); ok(ids.k9, "ไม่มี K-9");
    const { receipt } = await paidDeposit(ids.k9);
    const r = await cancel(CANCELER, { reservationId: ids.k9 });
    ok(isDenied(r), `STAFF ไม่มี manage ยกเลิกได้ ${J(r).slice(0, 80)}`);
    eq([(await rvOf(ids.k9)).status, (await refundSalesOf(receipt)).length], ["CONFIRMED", 0], "เปลี่ยนสถานะ/เงิน");
    ok(isDenied(await cancel(NONE, { reservationId: ids.k9 })), "ไร้สิทธิ์");
    okRes(await cancel(MGR, { reservationId: ids.k9 }), "MANAGER");
    eq([(await rvOf(ids.k9)).status, (await refundSalesOf(receipt)).length], ["CANCELLED", 1], "MANAGER คืนเงิน");
  });

  // ═══════════════ T state machine (pure) ═══════════════
  console.log("\n── T booking-state.ts (pure) ──");
  await st("T-1", "booking-state.ts export: TRANSITIONS (ตารางคงที่) · canTransition · nightsOf · holdDeadline — เป็น pure (ไม่มี 'use server' · import เฉพาะ type · ไม่ใช้ Date.now/new Date())", () => {
    ok(stateL.mod, stateL.err);
    eq(["canTransition", "nightsOf", "holdDeadline"].filter((n) => typeof stateL.mod[n] !== "function"), [], "ฟังก์ชันขาด");
    ok(stateL.mod.TRANSITIONS && typeof stateL.mod.TRANSITIONS === "object", "ไม่มี TRANSITIONS");
    const s = stripComments(read(F.state));
    ok(!/["']use (server|client)["']/.test(s), "มี directive");
    eq(importSpecs(read(F.state)).filter((i) => !i.typeOnly).map((i) => i.spec), [], "import ค่า");
    ok(!/Date\.now\s*\(|new\s+Date\s*\(\s*\)/.test(s), "อ่านนาฬิกาเครื่อง");
  });
  const can = (a: string, b: string, o?: Any) => fnOf(stateL, "canTransition", F.state)(a, b, o);
  await st("T-2", "ทุกคู่ 8×8 (HOLD CONFIRMED CHECKED_IN CHECKED_OUT CANCELLED NO_SHOW BOOKED REFUNDED · role OWNER sameDay) ตรงตาราง §0: อนุญาต 7 ทาง · BOOKED/REFUNDED ไม่เป็นต้นทาง/ปลายทางใด · ไม่ถอยหลัง/ข้ามขั้น", () => {
    const diffs: string[] = [];
    for (const a of STATUSES) for (const b of STATUSES) { const got = !!can(a, b, { role: "OWNER", sameDay: true }); const exp = refCan(a, b, { role: "OWNER", sameDay: true }); if (got !== exp) diffs.push(`${a}→${b}: ได้ ${got} ต้อง ${exp}`); }
    eq(diffs, [], "คู่ต่าง");
  });
  await st("T-3", "NO_SHOW→CONFIRMED guard: STAFF (แม้ sameDay) false · MANAGER ข้ามวัน false · MANAGER/OWNER sameDay true · ไม่ส่ง opts ⇒ false · สถานะไม่รู้จัก ⇒ false ไม่ throw", () => {
    eq([can("NO_SHOW", "CONFIRMED", { role: "STAFF", sameDay: true }), can("NO_SHOW", "CONFIRMED", { role: "MANAGER", sameDay: false }), can("NO_SHOW", "CONFIRMED", { role: "MANAGER", sameDay: true }), can("NO_SHOW", "CONFIRMED", { role: "OWNER", sameDay: true }), !!can("NO_SHOW", "CONFIRMED")], [false, false, true, true, false], "guard");
    eq([!!can("UNKNOWN", "CONFIRMED", { role: "OWNER", sameDay: true }), !!can("HOLD", "UNKNOWN", { role: "OWNER", sameDay: true })], [false, false], "ไม่รู้จัก");
  });
  await st("T-4", "nightsOf(checkIn, checkOut) = รายวัน [ci, co) · 1 คืน · ข้ามเดือน/ปี · ช่วงผิด ⇒ [] · holdDeadline(now, 15) = now+15 นาที · holdDeadline(now, null) = null (MANUAL_APPROVE) · ไม่กลายพันธุ์ now", () => {
    const n = fnOf(stateL, "nightsOf", F.state), h = fnOf(stateL, "holdDeadline", F.state);
    eq(n("2026-12-30", "2027-01-02"), ["2026-12-30", "2026-12-31", "2027-01-01"], "ข้ามปี");
    eq(n("2026-11-07", "2026-11-08"), ["2026-11-07"], "1 คืน");
    eq([n("2026-11-08", "2026-11-08"), n("2026-11-09", "2026-11-08"), n("ผิด", "2026-11-08")], [[], [], []], "ช่วงผิด");
    const now = new Date("2026-11-07T10:00:00.000Z");
    eq([msOf(h(now, 15)), h(now, null) ?? null, msOf(h(now, 1440))], [now.getTime() + 15 * 60_000, null, now.getTime() + 1440 * 60_000], "deadline");
    eq(now.toISOString(), "2026-11-07T10:00:00.000Z", "now ถูกแก้");
  });
  await st("T-5", "TRANSITIONS สอดคล้อง canTransition: ทุกคู่ที่ตารางบอกว่าไปได้ canTransition (OWNER sameDay) = true และกลับกัน · ตารางครอบ 6 สถานะ V2 (ไม่มี BOOKED เป็นต้นทาง)", () => {
    const T = valOf(stateL, "TRANSITIONS", F.state);
    const pairs = new Set<string>();
    if (Array.isArray(T)) for (const p of T) pairs.add(`${p.from ?? p[0]}→${p.to ?? p[1]}`);
    else for (const [from, tos] of Object.entries(T)) for (const to of (Array.isArray(tos) ? tos : Object.keys(tos as object))) pairs.add(`${from}→${typeof to === "string" ? to : (to as Any).to}`);
    const diffs: string[] = [];
    for (const a of STATUSES) for (const b of STATUSES) { const inT = pairs.has(`${a}→${b}`); const c = !!can(a, b, { role: "OWNER", sameDay: true }); if (inT !== c) diffs.push(`${a}→${b} ตาราง ${inT} ฟังก์ชัน ${c}`); }
    eq(diffs, [], "ตาราง≠ฟังก์ชัน");
    ok(![...pairs].some((p) => p.startsWith("BOOKED→") || p.endsWith("→BOOKED")), "ตารางมี BOOKED");
  });

  // ═══════════════ E ต่อ/ย่น/assignRoom/no-show/undo ═══════════════
  console.log("\n── E ต่อคืน/ย่นคืน/กำหนดห้อง/ไม่มา/ย้อน ──");
  const idOf = (over: Record<string, unknown>) => { const { reservationId, ...rest } = over; return reservationId !== undefined ? { id: reservationId, ...rest } : rest; };
  const extend = (actor: Actor, over: Record<string, unknown>) => BK("extendBooking")(actor, ctxA, { unitId: UH, ...idOf(over) });
  const shorten = (actor: Actor, over: Record<string, unknown>) => BK("shortenBooking")(actor, ctxA, { unitId: UH, ...idOf(over) });
  const assign = (actor: Actor, over: Record<string, unknown>) => BK("assignRoom")(actor, ctxA, { unitId: UH, ...idOf(over) });
  const noShow = (actor: Actor, over: Record<string, unknown>) => BK("markNoShow")(actor, ctxA, { unitId: UH, ...idOf(over) });
  const undo = (actor: Actor, over: Record<string, unknown>) => BK("undoNoShow")(actor, ctxA, { unitId: UH, ...idOf(over) });
  const resched = (actor: Actor, over: Record<string, unknown>) => BK("rescheduleBooking")(actor, ctxA, { unitId: UH, ...idOf(over) });
  const bookPast = (over: BookOver, dayOffset: number) => withClock(true, async () => bookOk(FRONT, { at: `${W(dayOffset)}T03:00:00.000Z`, ...over }));
  await st("E-1", "extendBooking +1 คืน (ดีลักซ์ 60–61 → 62) · ราคาคืนใหม่ = quote ณ ปัจจุบัน (แก้มือคืน 61 = 200,000 ⇒ OVERRIDE) · nights +1 counted · totalSatang อัป = Σ nights · checkOutDate/nights อัป · occupancy end ขยาย · outbox hotel.booking.changed · ล้างแก้มือ", async () => {
    needSetup(); needBooking();
    const r = await bookOk(FRONT, { checkIn: W(60), checkOut: W(61) }); ids.e1 = r.reservations[0].id;
    const total0 = r.reservations[0].totalSatang;
    okRes(await RT("setOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: null, date: W(61), priceSatang: 200_000, reason: "ทดสอบต่อคืน" }), "override");
    try {
      okRes(await extend(FRONT, { reservationId: ids.e1, newCheckOut: W(62) }), "extend");
      const rv = await rvOf(ids.e1), ns = await nightsOfRv(ids.e1), occ = await occOfRv(ids.e1, true);
      eq(ns.map((n) => [ymdOfDb(n.date), n.counted, n.priceSatang, n.priceSource]), [[W(60), true, refNightPrice(CELL.dlx, W(60)), "RATE"], [W(61), true, 200_000, "OVERRIDE"]], "nights");
      eq([ymdOfDb(rv.checkOutDate), rv.nights, rv.totalSatang], [W(62), 2, total0 + 200_000], "แถว");
      eq([occ.length, ymdOfDb(occ[0]?.endDate)], [1, W(62)], "occupancy");
      eq((await eventsOf("hotel.booking.changed", ids.e1)).length, 1, "outbox changed");
    } finally { await RT("clearOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, ratePlanId: null, date: W(61) }); }
  });
  await st("E-2", "extend ชน: ห้องเดิมไม่ว่างคืนใหม่ (อีกใบถูก assignRoom มาห้องเดียวกัน) แต่ประเภทยังพอ ⇒ ROOM_BUSY + suggest (ย้ายห้อง) ไม่เปลี่ยนแถว · ประเภทเต็ม («ห้องเดียว») ⇒ AVAILABILITY_CHANGED · newCheckOut ≤ เดิม ⇒ INVALID_INPUT · บน CANCELLED ⇒ ok:false", async () => {
    needSetup(); needBooking();
    const a = await bookOk(FRONT, { checkIn: W(64), checkOut: W(65) }); ids.e2a = a.reservations[0].id;
    const b = await bookOk(FRONT, { checkIn: W(65), checkOut: W(66) }); ids.e2b = b.reservations[0].id;
    const roomA = (await occOfRv(ids.e2a, true))[0]?.roomId;
    ok(roomA, "A ไม่มีห้อง");
    okRes(await assign(FRONT, { reservationId: ids.e2b, roomId: roomA }), "ย้าย B มาห้อง A");
    const r = await extend(FRONT, { reservationId: ids.e2a, newCheckOut: W(66) });
    eq(failCode(r), "ROOM_BUSY", `ได้ ${codeOf(r)}`);
    ok(r.suggest !== undefined, "ไม่มี suggest");
    eq([ymdOfDb((await rvOf(ids.e2a)).checkOutDate), (await nightsOfRv(ids.e2a)).length], [W(65), 1], "แถว A เปลี่ยน");
    const o1 = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.one, adults: 1, children: 0 }], checkIn: W(64), checkOut: W(65) }); ids.e2o = o1.reservations[0].id;
    const o2 = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.one, adults: 1, children: 0 }], checkIn: W(65), checkOut: W(66) }); ids.e2o2 = o2.reservations[0].id;
    eq(failCode(await extend(FRONT, { reservationId: ids.e2o, newCheckOut: W(66) })), "AVAILABILITY_CHANGED", "ประเภทเต็ม");
    eq(failCode(await extend(FRONT, { reservationId: ids.e2a, newCheckOut: W(65) })), "INVALID_INPUT", "newCheckOut = เดิม");
    const c = await extend(FRONT, { reservationId: ids.k1, newCheckOut: W(11) });
    ok(c && c.ok === false, "บน CANCELLED");
  });
  await st("E-3", "shortenBooking 66–69 → 68: คืน 68 counted=false (แถวคงอยู่) · checkOutDate/nights อัป · totalSatang = Σ คืนที่ยังนับ · occupancy end ย่น · ไม่คืนเงินอัตโนมัติ (ไม่มี PosSale REFUND) · outbox changed · คืนที่ postedAuditId แล้ว (67) ไม่ถูกถอน (ยัง counted)", async () => {
    needSetup(); needBooking();
    const r = await bookOk(FRONT, { checkIn: W(66), checkOut: W(69) }); ids.e3 = r.reservations[0].id;
    const { receipt } = await paidDeposit(ids.e3);
    okRes(await shorten(FRONT, { reservationId: ids.e3, newCheckOut: W(68) }), "shorten");
    const rv = await rvOf(ids.e3), ns = await nightsOfRv(ids.e3), occ = await occOfRv(ids.e3, true);
    eq(ns.map((n) => [ymdOfDb(n.date), n.counted]), [[W(66), true], [W(67), true], [W(68), false]], "nights");
    eq([ymdOfDb(rv.checkOutDate), rv.nights, rv.totalSatang], [W(68), 2, ns.filter((n) => n.counted).reduce((a, n) => a + n.priceSatang, 0)], "แถว");
    eq([occ.length, ymdOfDb(occ[0]?.endDate)], [1, W(68)], "occupancy");
    eq((await refundSalesOf(receipt)).length, 0, "คืนเงินอัตโนมัติ");
    ok((await eventsOf("hotel.booking.changed", ids.e3)).length >= 1, "outbox changed");
    await prisma.hotelBookingNight.updateMany({ where: { reservationId: ids.e3, date: dbDate(W(67)) }, data: { postedAuditId: `audit-${RUN}` } });
    const s2 = await shorten(FRONT, { reservationId: ids.e3, newCheckOut: W(67) });
    ok(s2 && typeof s2.ok === "boolean", "throw");
    eq((await prisma.hotelBookingNight.findFirst({ where: { reservationId: ids.e3, date: dbDate(W(67)) } }))?.counted, true, "คืนที่ post แล้วถูกถอน");
  });
  await st("E-4", "shorten/extend input ผิด ⇒ INVALID_INPUT ไม่เปลี่ยน: newCheckOut ≤ checkIn · newCheckOut ≥ เดิม (shorten) · วันผิดรูป · reservationId ของร้าน B ⇒ NOT_FOUND · STAFF ไม่มี manage ⇒ FORBIDDEN", async () => {
    needSetup(); needBooking();
    const r = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(70), checkOut: W(72) }); ids.e4 = r.reservations[0].id;
    const bad: string[] = [];
    for (const [n, f, exp] of [["≤ checkIn", () => shorten(FRONT, { reservationId: ids.e4, newCheckOut: W(70) }), "INVALID_INPUT"], ["≥ เดิม", () => shorten(FRONT, { reservationId: ids.e4, newCheckOut: W(72) }), "INVALID_INPUT"], ["ผิดรูป", () => extend(FRONT, { reservationId: ids.e4, newCheckOut: "x" }), "INVALID_INPUT"], ["ร้าน B", () => BK("extendBooking")(OWNER_B, ctxB, { unitId: UH, id: ids.e4, newCheckOut: W(73) }), "NOT_FOUND"], ["ไร้สิทธิ์ extend", () => extend(CREATOR, { reservationId: ids.e4, newCheckOut: W(73) }), "FORBIDDEN"], ["ไร้สิทธิ์ shorten", () => shorten(CREATOR, { reservationId: ids.e4, newCheckOut: W(71) }), "FORBIDDEN"]] as [string, () => Promise<Any>, string][]) {
      const x = await f(); if (exp === "FORBIDDEN" ? !isDenied(x) : failCode(x) !== exp) bad.push(`${n}: ${codeOf(x)}`);
    }
    eq(bad, [], "โค้ด");
    eq([ymdOfDb((await rvOf(ids.e4)).checkOutDate), (await nightsOfRv(ids.e4)).length], [W(72), 2], "เปลี่ยนแถว");
  });
  await st("E-5", "assignRoom: ย้ายห้องประเภทเดียวกัน ⇒ moveOccupancy (occupancy id เดิม roomId ใหม่ · nights.roomId ทุกคืน · reservation.roomId) · ห้องเดิม ⇒ ok ไม่เปลี่ยน · ห้อง OUT_OF_ORDER ⇒ ROOM_INACTIVE · ห้องที่ใบอื่นถือ ⇒ ROOM_BUSY · ห้องหน่วยอื่น ⇒ NOT_FOUND · ต่างประเภท: STAFF ไม่มี manage ⇒ FORBIDDEN · มี manage ⇒ ok ไม่คิดส่วนต่าง (totalSatang เดิม) · outbox changed", async () => {
    needSetup(); needBooking();
    const r = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(74), checkOut: W(76) }); ids.e5 = r.reservations[0].id;
    const occ0 = (await occOfRv(ids.e5, true))[0];
    ok(occ0, "ไม่มี occupancy");
    const other = occ0.roomId === ROOM.SUP1 ? ROOM.SUP2 : ROOM.SUP1;
    okRes(await assign(FRONT, { reservationId: ids.e5, roomId: other }), "ย้าย");
    const occ1 = await occOfRv(ids.e5, true);
    eq([occ1.length, occ1[0].id, occ1[0].roomId], [1, occ0.id, other], "moveOccupancy");
    ok((await nightsOfRv(ids.e5)).every((n) => n.roomId === other), "nights.roomId");
    eq((await rvOf(ids.e5)).roomId, other, "reservation.roomId");
    okRes(await assign(FRONT, { reservationId: ids.e5, roomId: other }), "ห้องเดิม");
    eq(failCode(await assign(FRONT, { reservationId: ids.e5, roomId: ROOM.FIX2 })), "ROOM_INACTIVE", "OUT_OF_ORDER");
    const o = await bookOk(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(75), checkOut: W(76) }); ids.e5b = o.reservations[0].id;
    const busy = await assign(FRONT, { reservationId: ids.e5b, roomId: other });
    ok(["ROOM_BUSY", "ROOM_TAKEN"].includes(failCode(busy) ?? ""), `ห้องที่ใบอื่นถือ ${codeOf(busy)}`);
    const u2room = await prisma.hotelRoom.findFirst({ where: { tenantId: tA, unitId: UH2 } });
    eq(failCode(await assign(FRONT, { reservationId: ids.e5, roomId: u2room.id })), "NOT_FOUND", "ห้องหน่วยอื่น");
    const creatorA = { ...CREATOR, permissions: { ...CREATOR.permissions, "hotel.reservation.cancel": true } };
    ok(isDenied(await assign(creatorA, { reservationId: ids.e5, roomId: ROOM.DLX3 })) , "ต่างประเภทโดยไม่มี manage");
    const total0 = (await rvOf(ids.e5)).totalSatang;
    okRes(await assign(FRONT, { reservationId: ids.e5, roomId: ROOM.DLX3 }), "ต่างประเภท (manage)");
    eq([(await rvOf(ids.e5)).totalSatang, (await occOfRv(ids.e5, true))[0]?.roomId], [total0, ROOM.DLX3], "ไม่คิดส่วนต่าง");
    ok((await eventsOf("hotel.booking.changed", ids.e5)).length >= 1, "outbox changed");
  });
  await st("E-6", "assignRoom ให้ใบที่ยังไม่มีห้อง (K-11): ปลด BLOCK แล้วกำหนด SUP1 ⇒ claimRoom STAY ใหม่ · nights.roomId ทุกคืน · ห้องถูกถือจริง (occupancy active 1 · kind STAY) · กำหนดซ้ำห้องเดิม ⇒ ok", async () => {
    needSetup(); needBooking(); ok(ids.k11, "ไม่มี K-11");
    await prisma.roomOccupancy.updateMany({ where: { tenantId: tA, refType: "QcBlock", refId: { in: [`k11a-${RUN}`, `k11b-${RUN}`] } }, data: { active: false } });
    okRes(await assign(FRONT, { reservationId: ids.k11, roomId: ROOM.SUP1 }), "assign");
    const occ = await occOfRv(ids.k11, true);
    eq([occ.length, occ[0]?.kind, occ[0]?.roomId, ymdOfDb(occ[0]?.startDate), ymdOfDb(occ[0]?.endDate)], [1, "STAY", ROOM.SUP1, W(40), W(42)], "occupancy");
    ok((await nightsOfRv(ids.k11)).every((n) => n.roomId === ROOM.SUP1), "nights.roomId");
    okRes(await assign(FRONT, { reservationId: ids.k11, roomId: ROOM.SUP1 }), "ซ้ำ");
  });
  await st("E-7", "markNoShow (ค่าเริ่ม FORFEIT_RELEASE_AFTER_AUDIT · ใบ §2 ข้อ 6): CONFIRMED เข้าเมื่อวาน (จองด้วย at) + มัดจำจ่าย ⇒ NO_SHOW noShowAt · บิลริบ = มัดจำ (dep-forfeit:) · nights counted false · occupancy inactive · outbox hotel.booking.no_show · เข้าอนาคต ⇒ ok:false · HOLD ⇒ ok:false · STAFF ไม่มี manage ⇒ FORBIDDEN", async () => {
    needSetup(); needBooking();
    const r = await bookPast({ checkIn: W(-1), checkOut: W(1) }, -1); ids.e7 = r.reservations[0].id;
    eq(r.reservations[0].status, "CONFIRMED", "สร้างย้อนหลัง");
    const { paid, receipt } = await paidDeposit(ids.e7);
    ok(isDenied(await noShow(CREATOR, { reservationId: ids.e7 })), "ไร้สิทธิ์");
    okRes(await noShow(FRONT, { reservationId: ids.e7 }), "noShow");
    const rv = await rvOf(ids.e7);
    eq([rv.status, !!rv.noShowAt], ["NO_SHOW", true], "แถว");
    eq((await forfeitSalesOf(receipt)).reduce((a, s) => a + s.grandTotalSatang, 0), paid, "บิลริบ");
    ok((await nightsOfRv(ids.e7)).every((n) => !n.counted) && (await occOfRv(ids.e7, true)).length === 0, "ปล่อยห้อง/nights");
    eq((await eventsOf("hotel.booking.no_show", ids.e7)).length, 1, "outbox");
    ok((await noShow(FRONT, { reservationId: ids.k12c }))?.ok === false, "เข้าอนาคต");
    ok((await noShow(FRONT, { reservationId: ids.k16 }))?.ok === false, "HOLD");
  });
  await st("E-8", "นโยบาย no-show จาก snapshot (ตั้งค่าตอนจอง · เปลี่ยนค่าสดก่อนกด): FORFEIT_HOLD_STAY ⇒ ริบแต่ nights ยัง counted + occupancy active · REFUND_RELEASE ⇒ คืนมัดจำเต็ม (PosSale REFUND) ไม่มีบิลริบ + ปล่อยห้อง · ค่าสดถูกตั้งกลับค่าเริ่มก่อน markNoShow ทั้งสองใบ", async () => {
    needSetup(); needBooking();
    await setUnit("rooms.hotel.noShow", "FORFEIT_HOLD_STAY");
    const a = await bookPast({ rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(-1), checkOut: W(1) }, -1); ids.e8a = a.reservations[0].id;
    await setUnit("rooms.hotel.noShow", "REFUND_RELEASE");
    const b = await bookPast({ rooms: [{ roomTypeId: RTA.fam, adults: 2, children: 0 }], checkIn: W(-1), checkOut: W(0) }, -1); ids.e8b = b.reservations[0].id;
    await resetUnit("rooms.hotel.noShow");
    const pa = await paidDeposit(ids.e8a), pb = await paidDeposit(ids.e8b);
    okRes(await noShow(FRONT, { reservationId: ids.e8a }), "noShow a");
    eq([(await rvOf(ids.e8a)).status, (await forfeitSalesOf(pa.receipt)).reduce((x, s) => x + s.grandTotalSatang, 0), (await nightsOfRv(ids.e8a)).every((n) => n.counted), (await occOfRv(ids.e8a, true)).length], ["NO_SHOW", pa.paid, true, 1], "FORFEIT_HOLD_STAY");
    okRes(await noShow(FRONT, { reservationId: ids.e8b }), "noShow b");
    const rf = await refundSalesOf(pb.receipt);
    eq([(await rvOf(ids.e8b)).status, rf.length, rf[0]?.grandTotalSatang, (await forfeitSalesOf(pb.receipt)).length, (await nightsOfRv(ids.e8b)).every((n) => !n.counted), (await occOfRv(ids.e8b, true)).length], ["NO_SHOW", 1, pb.paid, 0, true, 0], "REFUND_RELEASE");
  });
  await st("E-9", "undoNoShow: STAFF (แม้มี manage) ⇒ FORBIDDEN · MANAGER วันเดียวกัน ⇒ CONFIRMED + nights counted true + occupancy active (guard tx) · ข้ามวัน (at = พรุ่งนี้ ใต้ SVC_QC_CLOCK) ⇒ ok:false · ห้องเต็มแล้ว (แฟมิลี 1 ห้องถูกจองทับ) ⇒ AVAILABILITY_CHANGED คง NO_SHOW", async () => {
    needSetup(); needBooking(); ok(ids.e7 && ids.e8a && ids.e8b, "ไม่มีใบ E-7/E-8");
    ok(isDenied(await undo(FRONT, { reservationId: ids.e7 })), "STAFF undo ได้");
    okRes(await undo(MGR, { reservationId: ids.e7 }), "MANAGER undo");
    eq([(await rvOf(ids.e7)).status, (await nightsOfRv(ids.e7)).every((n) => n.counted), (await occOfRv(ids.e7, true)).length], ["CONFIRMED", true, 1], "หลัง undo");
    const late = await withClock(true, async () => undo(MGR, { reservationId: ids.e8a, at: `${W(1)}T03:00:00.000Z` }));
    ok(late && late.ok === false, `ข้ามวันต้องไม่ผ่าน ${J(late).slice(0, 80)}`);
    eq((await rvOf(ids.e8a)).status, "NO_SHOW", "สถานะคง");
    const taker = await bookPast({ rooms: [{ roomTypeId: RTA.fam, adults: 2, children: 0 }], checkIn: W(-1), checkOut: W(0) }, -1); ids.e9t = taker.reservations[0].id;
    const full = await undo(MGR, { reservationId: ids.e8b });
    eq([failCode(full), (await rvOf(ids.e8b)).status], ["AVAILABILITY_CHANGED", "NO_SHOW"], "ห้องเต็ม");
  });

  await st("E-10", "rescheduleBooking (มติผู้คุม 7 พ.ย. · ฐานการลาก H.2): CONFIRMED ดีลักซ์ 100–102 → {roomId: DLX3, checkIn 101, checkOut 103} ใน guard tx เดียว ⇒ nights counted = [101,102] ราคา = quote ปัจจุบัน · คืน 100 ไม่นับ · occupancy active 1 แถว [101,103) ห้อง DLX3 · checkIn/checkOut/nights/totalSatang อัป · outbox changed · HOLD เลื่อนวันเข้าได้ (คง HOLD)", async () => {
    needSetup(); needBooking();
    const r = await bookOk(FRONT, { checkIn: W(100), checkOut: W(102) }); ids.e10 = r.reservations[0].id;
    okRes(await resched(FRONT, { id: ids.e10, roomId: ROOM.DLX3, checkIn: W(101), checkOut: W(103) }), "reschedule");
    const rv = await rvOf(ids.e10), ns = (await nightsOfRv(ids.e10)).filter((n) => n.counted), occ = await occOfRv(ids.e10, true);
    eq(ns.map((n) => [ymdOfDb(n.date), n.priceSatang, n.roomId]), refStay(CELL.dlx, W(101), W(103)).map((n) => [n.date, n.priceSatang, ROOM.DLX3]), "nights ใหม่");
    eq([ymdOfDb(rv.checkInDate), ymdOfDb(rv.checkOutDate), rv.nights, rv.totalSatang, rv.status], [W(101), W(103), 2, refTotal(CELL.dlx, W(101), W(103)), "CONFIRMED"], "แถว");
    eq([occ.length, occ[0]?.roomId, ymdOfDb(occ[0]?.startDate), ymdOfDb(occ[0]?.endDate)], [1, ROOM.DLX3, W(101), W(103)], "occupancy");
    ok((await eventsOf("hotel.booking.changed", ids.e10)).length >= 1, "outbox changed");
    okRes(await resched(FRONT, { id: ids.k16, checkIn: W(36), checkOut: W(37) }), "HOLD เลื่อนวันเข้า");
    eq([(await rvOf(ids.k16)).status, ymdOfDb((await rvOf(ids.k16)).checkInDate)], ["HOLD", W(36)], "HOLD");
  });
  await st("E-11", "reschedule ล้ม = ไม่เปลี่ยนอะไร: เลื่อนไปช่วงที่ประเภทเต็ม («ห้องเดียว» คืน 30 ถูกใช้) ⇒ AVAILABILITY_CHANGED/ROOM_BUSY แถว/nights/occupancy เท่าเดิม · CHECKED_IN (D-10) เลื่อนวันเข้า ⇒ ok:false · เลื่อนวันออกได้ (checkOut 27→28) nights 2 occupancy ขยาย · STAFF ไม่มี manage ⇒ FORBIDDEN · checkOut ≤ checkIn ⇒ INVALID_INPUT", async () => {
    needSetup(); needBooking(); ok(ids.e2o && ids.k12a, "ไม่มีใบ E-2/K-12");
    const snap = async (id: string) => J([await rvOf(id), (await nightsOfRv(id)).map((n) => [ymdOfDb(n.date), n.counted, n.roomId]), (await occOfRv(id, true)).map((o) => [o.roomId, ymdOfDb(o.startDate), ymdOfDb(o.endDate)])]);
    const s0 = await snap(ids.e2o);
    const full = await resched(FRONT, { id: ids.e2o, checkIn: W(30), checkOut: W(31) });
    ok(["AVAILABILITY_CHANGED", "ROOM_BUSY"].includes(failCode(full) ?? ""), `เต็ม ${codeOf(full)}`);
    eq(await snap(ids.e2o), s0, "เปลี่ยนทั้งที่ล้ม");
    const ci = await resched(FRONT, { id: ids.k12a, checkIn: W(25) });
    ok(ci && ci.ok === false, `CHECKED_IN เลื่อนวันเข้าได้ ${J(ci).slice(0, 80)}`);
    okRes(await resched(FRONT, { id: ids.k12a, checkOut: W(28) }), "CHECKED_IN เลื่อนวันออก");
    eq([(await nightsOfRv(ids.k12a)).filter((n) => n.counted).length, ymdOfDb((await occOfRv(ids.k12a, true))[0]?.endDate)], [2, W(28)], "หลังเลื่อนวันออก");
    ok(isDenied(await resched(CREATOR, { id: ids.e10, checkOut: W(104) })), "ไร้สิทธิ์");
    eq(failCode(await resched(FRONT, { id: ids.e10, checkIn: W(103), checkOut: W(103) })), "INVALID_INPUT", "ช่วงผิด");
  });

  // ═══════════════ W sweepExpiredHolds ═══════════════
  console.log("\n── W sweepExpiredHolds ──");
  await st("W-1", "sweep: HOLD หมดอายุ 3 ใบ (at −40 นาที) + HOLD สด 1 + HOLD MANUAL (null) 1 + HOLD ร้าน B หมดอายุ 1 ⇒ sweep({limit:2}) expired 2 · sweep() เก็บที่เหลือ (รวมร้าน B · ข้ามร้าน) · ใบที่หมด: CANCELLED HOLD_EXPIRED nights false occupancy inactive folio ไม่ OPEN outbox hold_expired 1/ใบ · HOLD สด/MANUAL ไม่แตะ · sweep ซ้ำ ⇒ 0", async () => {
    needSetup(); needBooking();
    const at = new Date(Date.now() - 40 * 60_000).toISOString();
    const exp: string[] = [];
    for (let i = 0; i < 3; i++) { const r = await withClock(true, async () => bookOk(FRONT, { source: "WEB", hold: "ONLINE", checkIn: W(80 + i), checkOut: W(81 + i), at })); exp.push(r.reservations[0].id); }
    const fresh = (await bookOk(FRONT, { source: "WEB", hold: "ONLINE", checkIn: W(84), checkOut: W(85) })).reservations[0].id; ids.wFresh = fresh;
    const bRes = await withClock(true, async () => okRes(await BK("createBooking")(OWNER_B, ctxB, { unitId: UHB, rooms: [{ roomTypeId: RT_B, adults: 1, children: 0 }], ratePlanId: ids.stdB, source: "WEB", hold: "ONLINE", guest: GUEST, checkIn: W(80), checkOut: W(81), at }), "ร้าน B"));
    const bId = bRes.reservations[0].id;
    ok(ids.k6w && (await rvOf(ids.k6w)).status === "HOLD" && msOf((await rvOf(ids.k6w)).holdExpiresAt) > Date.now(), "ไม่มี HOLD MANUAL (K-6) · ต้องยังไม่หมดอายุ"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h3-W1-manual-expiry): เดิมคาด null
    const s1 = await BK("sweepExpiredHolds")({ limit: 2 });
    eq(s1?.expired, 2, `limit 2 ⇒ ${J(s1)}`);
    const s2 = await BK("sweepExpiredHolds")({});
    ok(typeof s2?.expired === "number" && s2.expired >= 2, `รอบสอง ${J(s2)}`);
    for (const id of exp) {
      const rv = await rvOf(id);
      eq([rv.status, rv.cancelReason], ["CANCELLED", "HOLD_EXPIRED"], `ใบ ${id}`);
      ok((await nightsOfRv(id)).every((n) => !n.counted) && (await occOfRv(id, true)).length === 0, `nights/occupancy ${id}`);
      ok(((await folioOf(id))?.status ?? "VOID") !== "OPEN", "folio OPEN");
      eq((await eventsOf("hotel.booking.hold_expired", id)).length, 1, `outbox ${id}`);
    }
    eq((await prisma.hotelReservation.findUnique({ where: { id: bId } }))?.status, "CANCELLED", "ร้าน B");
    eq([(await rvOf(fresh)).status, (await rvOf(ids.k6w)).status], ["HOLD", "HOLD"], "HOLD สด/MANUAL ถูกแตะ");
    eq((await BK("sweepExpiredHolds")({}))?.expired, 0, "ซ้ำ");
  });
  await st("W-2", "X5 sweep ซ้อน: HOLD หมดอายุ 4 ใบ ⇒ Promise.all(sweep, sweep) รวม expired = 4 · outbox hold_expired 1 แถว/ใบ · ไม่มี throw", async () => {
    needSetup(); needBooking();
    const at = new Date(Date.now() - 40 * 60_000).toISOString();
    const made: string[] = [];
    for (let i = 0; i < 4; i++) { const r = await withClock(true, async () => bookOk(FRONT, { source: "WEB", hold: "ONLINE", rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(86 + i), checkOut: W(87 + i), at })); made.push(r.reservations[0].id); }
    const [a, b] = await Promise.all([BK("sweepExpiredHolds")({}), BK("sweepExpiredHolds")({})]);
    eq((a?.expired ?? 0) + (b?.expired ?? 0), 4, `รวม ${J([a, b])}`);
    for (const id of made) { eq((await rvOf(id)).status, "CANCELLED", id); eq((await eventsOf("hotel.booking.hold_expired", id)).length, 1, `event ${id}`); }
  });
  await st("W-3", "ลงตารางเวลา (ใบ §1 cron.ts / minute-jobs.ts): มี job เรียก sweepExpiredHolds ผ่าน facade @/lib/modules/hotel (lazy import) ต่อจาก rooms.expireHolds · ไม่เพิ่ม vercel.json · facade index export sweepExpiredHolds", () => {
    const s = stripComments(read(F.cron)) + stripComments(read(F.minute));
    ok(/sweepExpiredHolds/.test(s), "ไม่มีการเรียก sweepExpiredHolds ใน cron.ts/minute-jobs.ts");
    ok(/@\/lib\/modules\/hotel["']\s*\)\s*\)?\.?sweepExpiredHolds|import\(\s*["']@\/lib\/modules\/hotel["']\s*\)/.test(s) || /from\s*["']@\/lib\/modules\/hotel["']/.test(s), "ไม่ได้เรียกผ่าน facade @/lib/modules/hotel");
    const m = read(F.minute);
    const iExpire = m.indexOf("rooms.expireHolds"), iSweep = m.indexOf("sweepExpiredHolds");
    if (iExpire >= 0 && iSweep >= 0) ok(iSweep > iExpire, "sweepExpiredHolds ต้องมาหลัง rooms.expireHolds");
    ok(typeof hotelL.mod?.sweepExpiredHolds === "function", "facade ไม่ export sweepExpiredHolds");
    ok(!/hotel|sweep/i.test(read("vercel.json")), "แก้ vercel.json");
  });

  // ═══════════════ B ด่าน / X1 / X9 / X10 ═══════════════
  console.log("\n── B ด่าน/ข้ามร้าน/สิทธิ์ ──");
  const list = (actor: Actor, over: Record<string, unknown> = {}) => BK("listBookings")(actor, ctxA, { unitId: UH, ...over });
  const get = (actor: Actor, id: string, ctx: Record<string, unknown> = ctxA) => BK("getBooking")(actor, ctx, { unitId: UH, id });
  await st("B-1", "X1 ข้ามร้าน: เจ้าของร้าน B เรียก getBooking/listBookings/cancel/extend/shorten/assignRoom/markNoShow/undoNoShow/takeBookingDeposit/confirmBooking ด้วย id/หน่วยของร้าน A ⇒ NOT_FOUND ทุกตัว · คำตอบไม่มีชื่อ/เบอร์แขก · ไม่มีแถวเปลี่ยน", async () => {
    needSetup(); needBooking(); ok(ids.k16w, "ไม่มี K-16");
    const snap = async () => J(await rvOf(ids.k16w));
    const s0 = await snap();
    const calls: [string, () => Promise<Any>][] = [
      ["getBooking", () => get(OWNER_B, ids.k16w, ctxB)],
      ["listBookings", () => BK("listBookings")(OWNER_B, ctxB, { unitId: UH })],
      ["cancel", () => BK("cancelBooking")(OWNER_B, ctxB, { unitId: UH, reservationId: ids.k16w, reason: "x" })],
      ["extend", () => BK("extendBooking")(OWNER_B, ctxB, { unitId: UH, id: ids.k16w, newCheckOut: W(37) })],
      ["shorten", () => BK("shortenBooking")(OWNER_B, ctxB, { unitId: UH, id: ids.e4, newCheckOut: W(71) })],
      ["assignRoom", () => BK("assignRoom")(OWNER_B, ctxB, { unitId: UH, id: ids.k16w, roomId: ROOM.DLX1 })],
      ["markNoShow", () => BK("markNoShow")(OWNER_B, ctxB, { unitId: UH, id: ids.k16w })],
      ["undoNoShow", () => BK("undoNoShow")(OWNER_B, ctxB, { unitId: UH, id: ids.e8a })],
      ["rescheduleBooking", () => BK("rescheduleBooking")(OWNER_B, ctxB, { unitId: UH, id: ids.k16w, checkOut: W(37) })],
      ["takeBookingDeposit", () => BK("takeBookingDeposit")(OWNER_B, ctxB, { unitId: UH, reservationId: ids.k16w, payType: "CASH" })],
      ["confirmBooking", () => BK("confirmBooking")(OWNER_B, ctxB, { unitId: UH, id: ids.k16, reservationId: ids.k16 })],
    ];
    const bad: string[] = [];
    for (const [n, f] of calls) { const r = await f(); if (failCode(r) !== "NOT_FOUND") bad.push(`${n}=${codeOf(r)}`); if (PII_TEXT.test(J(r))) bad.push(`${n} รั่ว PII`); }
    eq(bad, [], "ข้ามร้าน");
    eq(await snap(), s0, "แถวเปลี่ยน");
  });
  await st("B-2", "ด่าน HOTEL/หน่วย: หน่วย DORM ⇒ createBooking/listBookings NOT_FOUND · MANAGER ของหน่วยอื่น (UH2) เรียกบน UH ⇒ NOT_FOUND · STAFF unitAccess [UH2] ⇒ NOT_FOUND/ปฏิเสธ · roomTypeId/ratePlanId/roomId ข้ามหน่วยถูกปฏิเสธแล้ว (K-9/E-5) · ไม่สร้างแถว", async () => {
    needSetup(); needBooking();
    const n0 = await rvCount();
    eq(failCode(await book(OWNER, { unitId: UD, checkIn: W(40), checkOut: W(41) })), "NOT_FOUND", "หอ create");
    eq(failCode(await list(OWNER, { unitId: UD })), "NOT_FOUND", "หอ list");
    eq(failCode(await book(MGR2, { checkIn: W(40), checkOut: W(41) })), "NOT_FOUND", "MANAGER หน่วยอื่น");
    const r = await book({ ...FRONT, unitAccess: [UH2] }, { checkIn: W(40), checkOut: W(41) });
    ok(r?.ok === false, "STAFF หน่วยอื่นสร้างได้");
    eq(await rvCount(), n0, "แถวเพิ่ม");
  });
  await st("B-3", "X9 สิทธิ์ 3 ระดับ: STAFF ไร้สิทธิ์ ⇒ FORBIDDEN ทุกตัว (create/cancel/extend/shorten/assign/noShow/undo/takeDeposit/confirm) ไม่สร้าง/ไม่เปลี่ยน · STAFF reservation.create อย่างเดียว ⇒ create ได้ · cancel/extend/assign/takeDeposit/confirm FORBIDDEN · frontdesk (create+cancel+manage) ⇒ ได้ครบ (ดู K/D/E) · MANAGER/OWNER ⇒ ได้", async () => {
    needSetup(); needBooking();
    const n0 = await rvCount();
    const target = ids.k16w;
    const ops = (a: Actor): [string, () => Promise<Any>][] => [
      ["create", () => book(a, { checkIn: W(41), checkOut: W(42) })],
      ["cancel", () => cancel(a, { reservationId: target })],
      ["extend", () => extend(a, { reservationId: target, newCheckOut: W(37) })],
      ["shorten", () => shorten(a, { reservationId: ids.e4, newCheckOut: W(71) })],
      ["assign", () => assign(a, { reservationId: target, roomId: ROOM.DLX1 })],
      ["noShow", () => noShow(a, { reservationId: target })],
      ["undo", () => undo(a, { reservationId: ids.e8a })],
      ["takeDeposit", () => takeDeposit(a, { reservationId: target })],
      ["confirm", () => BK("confirmBooking")(a, ctxA, { unitId: UH, id: ids.k16, reservationId: ids.k16 })],
      ["reschedule", () => resched(a, { id: target, checkOut: W(37) })],
    ];
    const notDenied = (await Promise.all(ops(NONE).map(async ([n, f]) => [n, await f()] as [string, Any]))).filter(([, r]) => !isDenied(r)).map(([n, r]) => `${n}=${codeOf(r)}`);
    eq(notDenied, [], "ไร้สิทธิ์ผ่าน");
    eq(await rvCount(), n0, "ไร้สิทธิ์สร้างแถว");
    const c = await book(CREATOR, { checkIn: W(41), checkOut: W(42) });
    ok(c?.ok === true, `creator สร้างไม่ได้ ${codeOf(c)}`); ids.b3 = c.reservations?.[0]?.id;
    const cd = (await Promise.all(ops(CREATOR).slice(1).map(async ([n, f]) => [n, await f()] as [string, Any]))).filter(([, r]) => !isDenied(r)).map(([n, r]) => `${n}=${codeOf(r)}`);
    eq(cd, [], "creator ทำเกินสิทธิ์");
    okRes(await assign(MGR, { reservationId: ids.b3, roomId: ROOM.DLX1 }), "MANAGER assign");
    okRes(await assign(OWNER, { reservationId: ids.b3, roomId: ROOM.DLX2 }), "OWNER assign");
  });
  await st("B-4", "X10 DTO: listBookings(frontdesk) {ok, rows[], total/page} แถวมี id/code/guestName/status/source/checkIn/checkOut/nights/roomTypeName/totalSatang/depositSatang · ไม่มีคีย์ลับ (publicToken/token/secret/idNumber) · getBooking รวม nights · occupancy · folio · snapshot · ประวัติ AuditLog (history) · ร้านไม่เห็นข้ามหน่วย (UH2 ว่าง)", async () => {
    needSetup(); needBooking();
    const l = okRes(await list(FRONT, {}), "list");
    const rows = (l.rows ?? l.items ?? l.bookings) as Any[];
    ok(Array.isArray(rows) && rows.length >= 10, `rows ${rows?.length}`);
    const need = ["id", "code", "guestName", "status", "source", "checkIn", "checkOut", "nights", "totalSatang", "depositSatang"];
    const miss = need.filter((k) => !(k in rows[0]) && !(k === "checkIn" && "checkInDate" in rows[0]) && !(k === "checkOut" && "checkOutDate" in rows[0]));
    eq(miss, [], `ฟิลด์ขาด (มี ${Object.keys(rows[0]).join(",")})`);
    const secret = [...walkKeys(l)].filter((k) => /publicToken|token|secret|password|idNumber/i.test(k));
    eq(secret, [], "คีย์ลับใน DTO");
    ok(typeof (l.total ?? l.count ?? rows.length) === "number", "ไม่มี total");
    const g = okRes(await get(FRONT, ids.gHead ?? ids.e1), "get");
    const d = g.booking ?? g;
    ok(Array.isArray(d.nights) && d.nights.length >= 1, "ไม่มี nights");
    ok("occupancy" in d || "occupancies" in d || "roomId" in d, "ไม่มี occupancy");
    ok("folio" in d, "ไม่มี folio");
    ok(d.policySnapshot || d.snapshot, "ไม่มี snapshot");
    ok(Array.isArray(d.history ?? d.audit ?? d.auditLog), "ไม่มีประวัติ AuditLog");
    const u2 = await list(OWNER, { unitId: UH2 });
    eq(((u2?.rows ?? u2?.items ?? []) as Any[]).length, 0, "UH2 ต้องว่าง");
  });
  await st("B-5", "listBookings กรอง (ใบ §4): status=HOLD · source=WEB · from/to ครอบวัน · q=code · q=เบอร์ · q=ชื่อ · page/pageSize — ตัวเลขตรงฐาน (นับจาก HotelReservation ของหน่วย)", async () => {
    needSetup(); needBooking();
    const rowsOf = (l: Any) => ((l?.rows ?? l?.items ?? l?.bookings ?? []) as Any[]);
    const dbCount = (where: Any) => prisma.hotelReservation.count({ where: { tenantId: tA, unitId: UH, ...where } }) as Promise<number>;
    const hold = okRes(await list(FRONT, { status: "HOLD", pageSize: 200 }), "HOLD");
    ok(rowsOf(hold).every((r) => r.status === "HOLD"), "แถวไม่ใช่ HOLD");
    eq(hold.total ?? rowsOf(hold).length, await dbCount({ status: "HOLD" }), "HOLD count");
    const web = okRes(await list(FRONT, { source: "WEB", pageSize: 200 }), "WEB");
    eq(web.total ?? rowsOf(web).length, await dbCount({ source: "WEB" }), "WEB count");
    const code = (await rvOf(ids.e1)).code;
    const byCode = okRes(await list(FRONT, { q: code }), "q code");
    ok(rowsOf(byCode).some((r) => r.id === ids.e1) && rowsOf(byCode).every((r) => r.code === code), "ค้นรหัส");
    const byPhone = okRes(await list(FRONT, { q: GUEST.phone, pageSize: 500 }), "q phone");
    ok(rowsOf(byPhone).length >= 5, `ค้นเบอร์ ${rowsOf(byPhone).length}`);
    const byName = okRes(await list(FRONT, { q: "ผู้เข้าพักทดสอบ", pageSize: 500 }), "q name");
    ok(rowsOf(byName).length >= 5, "ค้นชื่อ");
    const range = okRes(await list(FRONT, { from: W(60), to: W(63), pageSize: 200 }), "ช่วง");
    ok(rowsOf(range).some((r) => r.id === ids.e1) && !rowsOf(range).some((r) => r.id === ids.k16w), "ช่วงวัน");
    const p1 = okRes(await list(FRONT, { page: 1, pageSize: 3 }), "page");
    eq(rowsOf(p1).length, 3, "pageSize");
  });
  await st("B-6", "actions.ts สถิต (ใบ §3.5): บล็อก // SVC H.3 ▸ … ◂ มี 9 action (create/takeDeposit/confirm/cancel/extend/shorten/assignRoom/markNoShow/undoNoShow) ทุกตัว requireUnit + ด่าน HOTEL + assertHotelCan/canHotel ด้วยคีย์ hotel.reservation.create / hotel.reservation.cancel / hotel.booking.manage · ไม่รับ/ส่ง `at` · permissions.ts: hotel.booking.manage ออกจากรายการ planned", () => {
    const s = read(F.actions);
    ok(s, "ยังไม่มี actions.ts");
    const blk = /SVC H\.3 ▸([\s\S]*?)◂/.exec(s)?.[1] ?? "";
    ok(blk, "ไม่มีบล็อก // SVC H.3 ▸ … ◂");
    const names = ["createBookingAction", "takeBookingDepositAction", "confirmBookingAction", "cancelBookingAction", "extendBookingAction", "shortenBookingAction", "assignRoomAction", "markNoShowAction", "undoNoShowAction"];
    eq(names.filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(blk)), [], "action ขาด/นอกบล็อก");
    const fns = blk.split(/export\s+async\s+function\s+/).slice(1);
    eq(fns.filter((b) => !/requireUnit\s*\(/.test(b) || !/HOTEL/.test(b) || !/assertHotelCan\s*\(|canHotel\s*\(/.test(b)).map((b) => b.split("(")[0]), [], "action ไม่มีด่าน");
    for (const k of ["hotel.reservation.create", "hotel.reservation.cancel", "hotel.booking.manage"]) ok(blk.includes(k), `ไม่ใช้คีย์ ${k}`);
    ok(!/\bat\s*[:=,)]|\bat\?:/.test(stripComments(blk).replace(/\bat\b(?=\s*[a-z])/gi, "")), "action รับ/ส่ง at");
    const perms = stripComments(read(F.perms));
    const planned = /planned[^[]*\[([\s\S]*?)\]/i.exec(perms)?.[1] ?? "";
    ok(!planned.includes("hotel.booking.manage"), "hotel.booking.manage ยังอยู่ planned");
  });
  await st("B-7", "X9 การกระทำอันตรายมี AuditLog before/after (ไม่มี PII): cancelled · no_show · undo · changed (ต่อ/ย่น/ย้ายห้อง) · hold_expired/sweep · deposit — แต่ละ action ≥ 1 แถวในร้าน A", async () => {
    needBooking();
    const rows = (await prisma.auditLog.findMany({ where: { tenantId: tA, action: { startsWith: "hotel.booking" } } })) as Any[];
    const acts = new Set(rows.map((r) => r.action));
    const want = ["created", "cancelled", "no_show"];
    const miss = want.filter((w) => ![...acts].some((a) => a.includes(w)));
    eq(miss, [], `action ขาด (มี ${[...acts].join(", ")})`);
    ok([...acts].some((a) => /undo|un_no_show|noshow_undo/i.test(a)) || rows.some((r) => J(r.after).includes("\"CONFIRMED\"") && J(r.before).includes("\"NO_SHOW\"")), "ไม่มี audit ของ undoNoShow");
    ok([...acts].some((a) => /extend|shorten|assign|changed|moved/i.test(a)), "ไม่มี audit ของ ต่อ/ย่น/ย้ายห้อง");
    ok(rows.every((r) => r.before !== null || r.after !== null), "แถวไม่มี before/after");
    ok(!PII_TEXT.test(J(rows.map((r) => [r.before, r.after]))), "PII ใน AuditLog");
  });

  // ═══════════════ C นาฬิกาฉาก at ═══════════════
  console.log("\n── C นาฬิกาฉาก `at` (SVC_QC_CLOCK) ──");
  await st("C-1", "มี SVC_QC_CLOCK=1: createBooking WEB ONLINE at = X (2 ชม.ก่อน) ⇒ holdExpiresAt = X + holdMinutesOnline พอดี (±5 วิ) · checkIn เมื่อวาน + at เมื่อวาน ⇒ ok (ไม่ PAST_DATE)", async () => {
    needSetup(); needBooking();
    const X = Date.now() - 2 * 3_600_000;
    const r = await withClock(true, async () => bookOk(FRONT, { source: "WEB", hold: "ONLINE", rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(90), checkOut: W(91), at: new Date(X).toISOString() }));
    ids.c1 = r.reservations[0].id;
    ok(near(msOf(r.reservations[0].holdExpiresAt), X + 15 * 60_000, 5_000), `holdExpiresAt ${r.reservations[0].holdExpiresAt} ≠ X+15`);
    const p = await withClock(true, async () => book(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(-1), checkOut: W(0), at: `${W(-1)}T03:00:00.000Z` }));
    ok(p?.ok === true, `ย้อนหลังใต้นาฬิกาฉาก ${codeOf(p)}`); ids.c1p = p.reservations?.[0]?.id;
  });
  await st("C-2", "ไม่มี SVC_QC_CLOCK: `at` ถูกเพิกเฉย — checkIn เมื่อวาน + at ⇒ PAST_DATE · WEB ONLINE + at 2 ชม.ก่อน ⇒ holdExpiresAt ≈ now+15 (ไม่ใช่ X+15) · อ่าน env ตอนเรียก (ไม่ cache ตอน import)", async () => {
    needSetup(); needBooking();
    const X = Date.now() - 2 * 3_600_000;
    const p = await withClock(false, async () => book(FRONT, { rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(-1), checkOut: W(0), at: `${W(-1)}T03:00:00.000Z` }));
    eq(failCode(p), "PAST_DATE", `ไม่มีนาฬิกาฉาก ${codeOf(p)}`);
    const r = await withClock(false, async () => bookOk(FRONT, { source: "WEB", hold: "ONLINE", rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(91), checkOut: W(92), at: new Date(X).toISOString() }));
    ids.c2 = r.reservations[0].id;
    ok(near(msOf(r.reservations[0].holdExpiresAt), Date.now() + 15 * 60_000, 90_000), `holdExpiresAt ${r.reservations[0].holdExpiresAt} ต้อง ≈ now+15`);
  });
  await st("C-3", "at ส่งผลถึงขั้นบันได: จองดีลักซ์ เข้า +93 จ่ายมัดจำ · ยกเลิกใต้นาฬิกาฉาก at = +92 (1 วันก่อน ⇒ 0%) ⇒ ริบทั้งก้อน ไม่มีใบคืน · อีกใบ เข้า +95 ยกเลิกโดยไม่มีนาฬิกาฉาก at = +94 ⇒ at ถูกเพิกเฉย ⇒ 100% (95 วัน)", async () => {
    needSetup(); needBooking();
    const a = await bookOk(FRONT, { checkIn: W(93), checkOut: W(94) }); ids.c3a = a.reservations[0].id;
    const pa = await paidDeposit(ids.c3a);
    okRes(await withClock(true, async () => cancel(FRONT, { reservationId: ids.c3a, at: `${W(92)}T03:00:00.000Z` })), "cancel at");
    eq([(await refundSalesOf(pa.receipt)).length, (await forfeitSalesOf(pa.receipt)).reduce((x, s) => x + s.grandTotalSatang, 0)], [0, pa.paid], "0% ตาม at");
    const b = await bookOk(FRONT, { checkIn: W(95), checkOut: W(96) }); ids.c3b = b.reservations[0].id;
    const pb = await paidDeposit(ids.c3b);
    okRes(await withClock(false, async () => cancel(FRONT, { reservationId: ids.c3b, at: `${W(94)}T03:00:00.000Z` })), "cancel ไม่มีนาฬิกา");
    eq([(await refundSalesOf(pb.receipt)).length, (await refundSalesOf(pb.receipt))[0]?.grandTotalSatang], [1, pb.paid], "100% เพิกเฉย at");
  });
  await st("C-4", "sweepExpiredHolds({now}) ใต้นาฬิกาฉาก: HOLD สด (W-1) + now = +1 ชม. ⇒ ถูกเก็บ · โดยไม่มีนาฬิกาฉาก now อนาคต ⇒ HOLD สดอีกใบ (C-2) ไม่ถูกแตะ", async () => {
    needSetup(); needBooking(); ok(ids.wFresh && ids.c2, "ไม่มี HOLD สด");
    eq((await rvOf(ids.wFresh)).status, "HOLD", "ก่อน");
    const s = await withClock(true, async () => BK("sweepExpiredHolds")({ now: new Date(Date.now() + 3_600_000) }));
    ok(s?.expired >= 1 && (await rvOf(ids.wFresh)).status === "CANCELLED", `now ใต้นาฬิกาฉากไม่ทำงาน ${J(s)}`);
    // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h3-C4-fresh-hold): c2 หมดอายุใน 15 นาทีเช่นกัน จึงถูกเก็บในรอบนาฬิกาฉากข้างบน ⇒ ใช้ HOLD ใบใหม่พิสูจน์ว่า now อนาคตถูกเพิกเฉยเมื่อไม่มีนาฬิกาฉาก
    const c4b = (await bookOk(FRONT, { source: "WEB", hold: "ONLINE", rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: W(140), checkOut: W(141) })).reservations[0].id;
    await withClock(false, async () => BK("sweepExpiredHolds")({ now: new Date(Date.now() + 3_600_000) }));
    eq((await rvOf(c4b)).status, "HOLD", "ไม่มีนาฬิกาฉาก now ต้องถูกเพิกเฉย");
  });
  await st("C-5", "สถิต: booking.ts อ่าน process.env.SVC_QC_CLOCK === \"1\" ภายในฟังก์ชัน (ไม่ใช่ค่าคงที่ตอน import) · actions.ts ไม่มีคำว่า SVC_QC_CLOCK และไม่ส่ง at · ฉาก (ถ้ามี) ตั้ง SVC_QC_CLOCK=1 เอง", () => {
    const b = stripComments(read(F.booking));
    ok(b, `ยังไม่มี ${F.booking}`);
    ok(/process\.env\.SVC_QC_CLOCK\s*===\s*["']1["']/.test(b), "ไม่มีด่าน SVC_QC_CLOCK === \"1\"");
    ok(!/^const\s+\w+\s*=\s*process\.env\.SVC_QC_CLOCK/m.test(b), "cache ค่า SVC_QC_CLOCK ตอน import");
    const a = stripComments(read(F.actions));
    ok(!/SVC_QC_CLOCK/.test(a), "actions.ts อ่าน SVC_QC_CLOCK");
    if (has(F.scene)) ok(/SVC_QC_CLOCK/.test(read(F.scene)), "ฉากไม่ตั้ง SVC_QC_CLOCK");
  });

  // ═══════════════ N event 3 ทะเบียน ═══════════════
  console.log("\n── N event 7 ตัว · 3 ทะเบียน ──");
  const EVENTS = ["hotel.booking.created", "hotel.booking.confirmed", "hotel.booking.cancelled", "hotel.booking.hold_expired", "hotel.booking.no_show", "hotel.booking.changed", "hotel.booking.deposit_after_expiry"];
  await st("N-1", "ทะเบียน 3 ที่ (CC §7 · กติกาเหล็ก 15): outbox-consumers.ts มี consumer ทั้ง 7 · automation/labels.ts AUTOMATION_EVENTS มีทั้ง 7 ป้ายไทย · webhooks WEBHOOK_EVENTS มีทั้ง 7 ผ่าน spread (ไม่ประกาศซ้ำใน webhooks/labels.ts)", () => {
    const cons = consumersL.mod?.consumers ?? consumersL.mod?.default;
    ok(cons && typeof cons === "object", `โหลด consumers ไม่ได้ ${consumersL.err}`);
    eq(EVENTS.filter((e) => typeof cons[e] !== "function"), [], "consumer ขาด");
    const auto = (autoL.mod?.AUTOMATION_EVENTS ?? []) as Any[];
    const missA = EVENTS.filter((e) => !auto.some((x) => x.value === e && THAI.test(x.label ?? "")));
    eq(missA, [], "automation label ขาด/ไม่ไทย");
    const wh = (whL.mod?.WEBHOOK_EVENTS ?? []) as Any[];
    eq(EVENTS.filter((e) => !wh.some((x) => x.value === e)), [], "webhook ขาด");
    eq(EVENTS.filter((e) => wh.filter((x) => x.value === e).length > 1), [], "ซ้ำใน webhook");
    ok(!EVENTS.some((e) => stripComments(read(F.whLabels)).includes(`"${e}"`)), "ประกาศซ้ำใน webhooks/labels.ts");
  });
  await st("N-2", "payload (X8/X10): ทุกชนิดมี ≥ 1 แถวในร้าน A จากข้อก่อน · payload ⊆ {tenantId,unitId,reservationId,groupId,code,status,source} ไม่มีชื่อ/เบอร์/อีเมล · unitId บนแถว · idempotencyKey ไม่ซ้ำ", async () => {
    needBooking();
    const bad: string[] = [];
    for (const t of EVENTS) {
      const ev = await eventsOf(t);
      if (!ev.length) { bad.push(`${t}: 0 แถว`); continue; }
      for (const e of ev) { try { checkPayload(e, t); } catch (x) { bad.push(errMsg(x)); break; } if ((e.unitId ?? e.payload?.unitId) !== UH && (e.unitId ?? e.payload?.unitId) !== UHB) { bad.push(`${t}: unitId ${e.unitId}`); break; } }
    }
    eq(bad.slice(0, 6), [], "payload");
  });
  await st("N-3", "consumer เรียกได้ไม่โยน: consumers[type](event) กับแถวจริง 1 แถวต่อชนิด ⇒ resolve (event ไม่ค้าง PENDING ตลอดกาล)", async () => {
    needBooking();
    const cons = consumersL.mod?.consumers;
    ok(cons, "ไม่มี consumers");
    const bad: string[] = [];
    for (const t of EVENTS) { const ev = (await eventsOf(t))[0]; if (!ev) { bad.push(`${t} ไม่มีแถว`); continue; } try { await cons[t](ev); } catch (e) { bad.push(`${t}: ${errMsg(e)}`); } }
    eq(bad, [], "consumer โยน");
  });

  // ═══════════════ L legacy ═══════════════
  console.log("\n── L เลิกเส้น legacy ──");
  await st("L-1", "createReservation เดิม (P1 signature) → createBooking: ok · แถว CONFIRMED (ไม่ใช่ BOOKED) · nights ครบ counted · occupancy STAY 1 · cancelReservation เดิม ⇒ cancelBooking (nights false · occupancy inactive) · checkIn เดิมรับ CONFIRMED (D-10)", async () => {
    needSetup(); needBooking();
    const f = fnOf(serviceL, "createReservation", F.service);
    const r = okRes(await f({ tenantId: tA, unitId: UH, roomTypeId: RTA.dlx, checkInDate: W(97), checkOutDate: W(99), guestName: "แขก P1", guestPhone: "0811111111", adults: 2, createdById: FRONT.userId }), "createReservation");
    ids.l1 = r.id;
    const rv = await rvOf(r.id);
    eq([rv.status, rv.nights], ["CONFIRMED", 2], "แถว");
    const ns = await nightsOfRv(r.id);
    eq(ns.map((n) => [ymdOfDb(n.date), n.counted]), [[W(97), true], [W(98), true]], "nights");
    eq((await occOfRv(r.id, true)).map((o) => o.kind), ["STAY"], "occupancy");
    okRes(await fnOf(serviceL, "cancelReservation", F.service)(tA, UH, r.id, "ทดสอบ"), "cancelReservation");
    eq((await rvOf(r.id)).status, "CANCELLED", "ยกเลิก");
    ok((await nightsOfRv(r.id)).every((n) => !n.counted) && (await occOfRv(r.id, true)).length === 0, "nights/occupancy หลังยกเลิก");
  });
  await st("L-2", "ไม่มี path สร้าง reservation โดยไม่มี nights (ใบ §2 ข้อ 11): การจอง active (HOLD/CONFIRMED/CHECKED_IN) ของร้าน A ทุกแถวที่ไม่ใช่แถวดิบ QC-* มี nights ≥ 1 · ทั้งฐานเลน (ข้ามร้าน · ไม่นับแถวดิบของข้อสอบนี้) การจอง active ไร้ nights = 0 (backfill svc-h0 แล้ว)", async () => {
    needBooking();
    const miss: { id: string; code: string; tenantId: string }[] = await prisma.$queryRawUnsafe(`SELECT r."id", r."code", r."tenantId" FROM "HotelReservation" r LEFT JOIN "HotelBookingNight" n ON n."reservationId" = r."id" WHERE r."status" IN ('HOLD','CONFIRMED','CHECKED_IN') AND r."code" NOT LIKE 'QC-%' GROUP BY r."id" HAVING count(n."id") = 0`);
    eq(miss.filter((m) => m.tenantId === tA).map((m) => m.code), [], "ร้าน A");
    eq(miss.map((m) => `${m.tenantId}:${m.code}`).slice(0, 5), [], "ทั้งฐาน (backfill ค้าง)");
  }, "MAJOR");
  await st("L-3", "stayLoad legacy ไม่นับการจองไร้ occupancy/nights: แถวดิบ CONFIRMED ไม่มี nights/occupancy บน «ห้องซ่อม» 95–96 ⇒ hotelAvailability available = 1 (ไม่ลด) · availability เดิม (service.availability) free = 1 · ratePreview remaining = 1 · สถิต: service.ts ไม่มี roomless/legacyRoomIds · โมดูล hotel ไม่เขียน status BOOKED · createReservation เรียก createBooking", async () => {
    needSetup(); needBooking();
    await prisma.hotelReservation.create({ data: { tenantId: tA, unitId: UH, code: `QC-LEG-${RUN}`, status: "CONFIRMED", guestName: "legacy", roomTypeId: RTA.fix, checkInDate: dbDate(W(95)), checkOutDate: dbDate(W(96)), nights: 1, source: "WALK_IN" } });
    const av = await avA({ roomTypeId: RTA.fix, from: W(95), to: W(96) });
    eq(av.byDate[W(95)][RTA.fix].available, 1, "hotelAvailability");
    const old = await fnOf(serviceL, "availability", F.service)(tA, UH, W(95), W(96));
    const fx = (old as Any[]).find((t) => t.roomTypeId === RTA.fix);
    eq(fx?.days?.[0]?.free, 1, `availability เดิม ${J(fx)}`);
    const pv = await RT("ratePreview")(ctxA, UH, { from: W(95), to: W(95) });
    eq(pv?.days?.[0]?.byType?.[RTA.fix]?.remaining, 1, "ratePreview");
    const s = stripComments(read(F.service));
    ok(!/roomless|legacyRoomIds/.test(s), "service.ts ยังมีเส้น legacy (roomless/legacyRoomIds)");
    ok(!/status:\s*["']BOOKED["']/.test(s + stripComments(read(F.booking))), "ยังเขียน BOOKED");
    ok(/createBooking\s*\(/.test(s), "createReservation ไม่เรียก createBooking");
  });

  // ═══════════════ U UI สถิต ═══════════════
  console.log("\n── U UI สถิต ──");
  const COMPS = [F.list, F.detail, F.wizard, F.depositDlg];
  const PAGES = [F.listPage, F.detailPage, F.newPage];
  await st("U-1", "ไฟล์ของใบครบ (§1): availability.ts · booking.ts · booking-state.ts · BookingList/BookingDetail/BookingWizard/BookingDepositDialog.tsx · booking-shared.ts · หน้า reservations (รายการ/[id]/new) · ฉาก svc-qc-hotel-booking-scene.mts · docs/sds/modules/hotel.md §การจอง", () => {
    eq([F.avail, F.booking, F.state, ...COMPS, F.shared, ...PAGES, F.scene, F.sds].filter((f) => !has(f)), [], "ขาด");
    ok(/การจอง|HOLD/.test(read(F.sds)), "sds ไม่มี §การจอง");
  });
  await st("U-2", "ไทยทั้งหมด (§4): ข้อความที่ผู้ใช้เห็นใน 4 คอมโพเนนต์ + 3 หน้า ไม่มีคำอังกฤษ (ยกเว้นชื่อเฉพาะ OTA/LINE/POS/QR/PromptPay)", () => {
    const bad: string[] = [];
    for (const f of [...COMPS, ...PAGES]) { const s = read(f); if (!s) { bad.push(`${f}: ยังไม่มี`); continue; } const en = englishInJsx(s); if (en.length) bad.push(`${f}: ${en.slice(0, 6).join(", ")}`); }
    eq(bad, [], "อังกฤษ");
  });
  await st("U-3", "read-only ไม่ render ปุ่ม (§4): BookingList ปุ่ม «จองใหม่» · BookingDetail ปุ่ม ยืนยัน/รับมัดจำ/กำหนดห้อง/ต่อคืน/ย่นคืน/ไม่มา/ยกเลิก/ยกเลิกทั้งกลุ่ม อยู่ใต้เงื่อนไข prop สิทธิ์ (canManage/canCancel/canCreate/readOnly) · prop ใช้เป็นเงื่อนไข render จริง", () => {
    const guard = /canManage|canCancel|canCreate|canEdit|readOnly|writable|can\.[a-z]+/;
    const l = stripComments(read(F.list)), d = stripComments(read(F.detail));
    ok(l && d, "ยังไม่มี BookingList/BookingDetail");
    ok(guard.test(l) && guard.test(d), "ไม่มี prop สิทธิ์");
    const bad: string[] = [];
    if (!nearWrite(l, "จองใหม่", guard)) bad.push("BookingList: จองใหม่");
    for (const lit of ["รับมัดจำ", "กำหนดห้อง", "ต่อคืน", "ย่นคืน", "ไม่มา", "ยกเลิก"]) if (!nearWrite(d, lit, guard)) bad.push(`BookingDetail: ${lit}`);
    ok(d.includes("ยกเลิกทั้งกลุ่ม"), "ไม่มีปุ่ม ยกเลิกทั้งกลุ่ม");
    eq(bad, [], "ปุ่มเขียนไม่มีเงื่อนไขสิทธิ์ใกล้เคียง (800 ตัวอักษร)");
    ok(/(canManage|canCancel|canCreate|readOnly|writable)\s*[?&]|!readOnly/.test(l + d), "ไม่มีการใช้ prop เป็นเงื่อนไข render");
  });
  await st("U-4", "มือถือ 390 (§4 · §11 #9): ตารางรายการอยู่ในกรอบ overflow-x-auto + attribute `data-scroll-hint` ชื่อตายตัว (BookingList · และตารางคืนใน BookingDetail)", () => {
    const l = read(F.list), d = read(F.detail);
    ok(l && d, "ยังไม่มี BookingList/BookingDetail");
    ok(/overflow-x-auto/.test(l) && /data-scroll-hint/.test(l), "BookingList ไม่มี overflow-x-auto/data-scroll-hint");
    ok(/data-scroll-hint/.test(d), "BookingDetail ไม่มี data-scroll-hint (ตารางคืน)");
  });
  await st("U-5", "'use client' ไม่ลาก prisma: 4 คอมโพเนนต์มี 'use client' และกราฟ import (ค่า) ไม่ถึง @/lib/core/db · @prisma/client · booking.ts/availability.ts/service.ts/rates.ts · rooms/pos (หยุดที่ขอบ \"use server\") · booking-shared pure (ไม่มี import ค่า · ไม่มี directive)", () => {
    const bad: string[] = [];
    for (const f of COMPS) { const s = read(f); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } if (!/^\s*["']use client["']/m.test(s)) bad.push(`${f} ไม่มี 'use client'`); bad.push(...clientReach(f)); }
    eq(bad, [], "เส้นลากถึง server");
    const sh = read(F.shared);
    ok(sh, "ยังไม่มี booking-shared.ts");
    eq(importSpecs(sh).filter((i) => !i.typeOnly).map((i) => i.spec), [], "booking-shared import ค่า");
    ok(!/["']use (client|server)["']/.test(stripComments(sh)), "booking-shared มี directive");
  });
  await st("U-6", "\"use server\" ไม่ export type: actions.ts export เฉพาะ async function (ยกเว้น ReservationFormState ของ P1 — ORACLE-EDIT h1-U13) · ไม่ export const/let/class", () => {
    const s = read(F.actions);
    ok(s, "ยังไม่มี actions.ts");
    ok(/SVC H\.3 ▸[\s\S]*◂/.test(s), "actions.ts ยังไม่มีบล็อก // SVC H.3 ▸ … ◂ (ยังไม่มีงาน H.3)");
    ok(/^\s*["']use server["']/m.test(s), "ไม่มี \"use server\"");
    ok(!/^export\s+(type|interface|const|let|class)\b/m.test(stripComments(s).split("\n").filter((l) => !/ReservationFormState/.test(l)).join("\n")), "export ที่ไม่ใช่ async function");
  });
  await st("U-7", "ไม่มี ModuleTabs ซ้อน HotelTabs (§4 · หนี้ H.1): หน้า reservations ทั้ง 3 และคอมโพเนนต์ไม่ import/ใช้ ModuleTabs · ไม่ render HotelTabs ซ้ำ (layout ทำแล้ว) · หน้า /hotel (หน้าเคาน์เตอร์) ไม่มี ModuleTabs แล้ว", () => {
    const bad: string[] = [];
    for (const f of [...PAGES, ...COMPS]) { const s = stripComments(read(f)); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } if (/ModuleTabs/.test(s)) bad.push(`${f}: ModuleTabs`); if (/<HotelTabs/.test(s)) bad.push(`${f}: HotelTabs ซ้ำ`); }
    if (/ModuleTabs/.test(stripComments(read("src/app/app/u/[unitSlug]/hotel/page.tsx")))) bad.push("hotel/page.tsx ยังมี ModuleTabs ซ้อน HotelTabs");
    eq(bad, [], "แท็บซ้อน");
  }, "MAJOR");
  await st("U-8", "หน้า 3 หน้า: requireUnit · \"HOTEL\" · notFound · import ผ่าน facade @/lib/modules/hotel (ไม่ชี้ booking.ts/service.ts/availability.ts ตรง) · รายการใช้ listBookings · รายละเอียดใช้ getBooking · วิซาร์ดอ่าน searchParams checkIn/checkOut/roomTypeId/rooms/step เพื่อเติมฟอร์มเท่านั้น + แสดงห้องเหลือ (hotelAvailability) · ไม่อ่านสิทธิ์จาก URL", () => {
    const bad: string[] = [];
    const srcs = PAGES.map((f) => [f, stripComments(read(f))] as [string, string]);
    for (const [f, s] of srcs) { if (!s) { bad.push(`${f} ยังไม่มี`); continue; } for (const w of ["requireUnit", "\"HOTEL\"", "notFound"]) if (!s.includes(w)) bad.push(`${f}: ${w}`); if (/@\/lib\/modules\/hotel\/(booking|service|availability|rates)["']/.test(s)) bad.push(`${f}: import ตรงไฟล์ server`); if (/searchParams[^\n]*perm|permissions[^\n]*searchParams/.test(s)) bad.push(`${f}: สิทธิ์จาก URL`); }
    if (!/listBookings/.test(srcs[0][1])) bad.push("รายการไม่ใช้ listBookings");
    if (!/getBooking/.test(srcs[1][1])) bad.push("รายละเอียดไม่ใช้ getBooking");
    const n = srcs[2][1];
    for (const q of ["checkIn", "checkOut", "roomTypeId", "rooms", "step"]) if (!n.includes(q)) bad.push(`new: ไม่อ่าน ${q}`);
    if (!/hotelAvailability|availability/.test(n + stripComments(read(F.wizard)))) bad.push("วิซาร์ดไม่แสดงห้องเหลือ");
    eq(bad, [], "หน้า");
  });
  await st("U-9", "ป้ายไทย (§4) ใน booking-shared/คอมโพเนนต์: สถานะ 6 ป้าย (ถือไว้รอมัดจำ · ยืนยัน · เข้าพัก · ออกแล้ว · ไม่มา · ยกเลิก) · แหล่ง 5 ป้ายไทย (WEB/WALK_IN/PHONE/LINE/OTA) · วิซาร์ด 3 ขั้น · «รอโอน» · นับถอยหลัง HOLD · «กลุ่ม» N ห้อง", () => {
    const sh = read(F.shared), all = sh + COMPS.map((f) => read(f)).join("\n");
    ok(sh, "ยังไม่มี booking-shared.ts");
    const miss = ["ถือไว้รอมัดจำ", "ยืนยัน", "เข้าพัก", "ออกแล้ว", "ไม่มา", "ยกเลิก", "รอโอน", "กลุ่ม"].filter((w) => !all.includes(w));
    eq(miss, [], "ข้อความขาด");
    for (const s of ["WEB", "WALK_IN", "PHONE", "LINE", "OTA"]) ok(new RegExp(`${s}["']?\\s*:\\s*["'][^"']*[฀-๿]`).test(all), `ไม่มีป้ายไทยของแหล่ง ${s}`);
    for (const s of ["HOLD", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW", "CANCELLED"]) ok(new RegExp(`${s}["']?\\s*:\\s*["'][^"']*[฀-๿]`).test(all), `ไม่มีป้ายไทยของสถานะ ${s}`);
    ok(/holdExpiresAt|นับถอยหลัง|เหลืออีก/.test(all), "ไม่มีนับถอยหลัง HOLD");
    ok(/step\s*(===?|:)\s*[123]|\[1,\s*2,\s*3\]|ขั้นที่?\s*[123]|ขั้น\s*[123]/.test(read(F.wizard)), "วิซาร์ดไม่มี 3 ขั้น");
  });
  await st("U-10", "facade hotel/index.ts export H.3: hotelAvailability · createBooking · confirmBooking · cancelBooking · extendBooking · shortenBooking · assignRoom · markNoShow · undoNoShow · takeBookingDeposit · listBookings · getBooking · sweepExpiredHolds · canTransition · TRANSITIONS · nightsOf · holdDeadline (บล็อก // SVC H.3 ▸ … ◂ · ของ H.1 ยังครบ)", () => {
    ok(hotelL.mod, hotelL.err);
    const names = ["createBooking", "confirmBooking", "cancelBooking", "extendBooking", "shortenBooking", "rescheduleBooking", "assignRoom", "markNoShow", "undoNoShow", "takeBookingDeposit", "listBookings", "getBooking", "sweepExpiredHolds", "canTransition", "nightsOf", "holdDeadline", "quoteStay", "loadPricingContext", "loadHotelSettings"];
    eq(names.filter((n) => typeof hotelL.mod[n] !== "function"), [], "ขาด");
    ok(hotelL.mod.hotelAvailability && typeof hotelL.mod.hotelAvailability.get === "function", "ไม่มี hotelAvailability");
    ok(hotelL.mod.TRANSITIONS, "ไม่มี TRANSITIONS");
    ok(/SVC H\.3 ▸[\s\S]*◂/.test(read(F.index)), "ไม่มีบล็อก // SVC H.3 ▸ … ◂");
  });
  await st("U-11", "docs/sds/modules/hotel.md §การจอง: state machine (HOLD/CONFIRMED/NO_SHOW) · guard (pg_advisory_xact_lock · AVAILABILITY_CHANGED) · สูตร availability · มัดจำ/คืนเงิน (moduleTakeDeposit · refundFor · HOLD_EXPIRED)", () => {
    const s = read(F.sds);
    ok(s, "ยังไม่มี sds");
    eq(["HOLD", "CONFIRMED", "NO_SHOW", "AVAILABILITY_CHANGED", "pg_advisory_xact_lock", "HOLD_EXPIRED", "moduleTakeDeposit", "refundFor"].filter((w) => !s.includes(w)), [], "ขาด");
  }, "MINOR");
  await st("U-12", "วิซาร์ดขั้น 3 (§4): ผู้เข้าพักเริ่มว่าง ⇒ ปุ่มยืนยัน disabled จนกรอก (disabled ผูกกับชื่อแขก) · เลือกวิธีรับมัดจำ 4 แบบ (เงินสด/QR·พร้อมเพย์/โอน/บัตร) + «รอโอน» · BookingDepositDialog มี payType 4 ค่า · step จาก query ต้องเป็น 1|2|3 เท่านั้น", () => {
    const w = stripComments(read(F.wizard)), d = stripComments(read(F.depositDlg));
    ok(w && d, "ยังไม่มี BookingWizard/BookingDepositDialog");
    ok(/disabled\s*=\s*\{[^}]*(guest|name|ชื่อ)[^}]*\}/.test(w), "ปุ่มยืนยันไม่ผูก disabled กับชื่อแขก");
    for (const k of ["CASH", "PROMPTPAY", "TRANSFER", "CARD"]) ok((w + d).includes(k), `ไม่มีวิธีรับ ${k}`);
    ok(/รอโอน/.test(w), "ไม่มี รอโอน");
    ok(/["']?step["']?[^\n]*(\[\s*["']?1["']?\s*,\s*["']?2["']?\s*,\s*["']?3["']?\s*\]|[123]\s*\|\s*[123]\s*\|\s*[123]|Math\.(min|max))/.test(w + stripComments(read(F.newPage))), "step ไม่ถูกจำกัด 1|2|3");
  });

  // ═══════════════ F ไฟล์ที่แตะ (git · ตอนรับใบ) ═══════════════
  console.log("\n── F ไฟล์ที่แตะ (git) ──");
  const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  const OWN = new Set<string>([F.avail, F.booking, F.state, F.service, F.index, F.actions, F.pricing, ...COMPS, F.shared, ...PAGES, F.cron, F.minute, F.consumers, F.autoLabels, F.whLabels, F.perms, F.scene, F.sds, F.probe, "scripts/qc-svc-h.3.mts", "src/app/app/u/[unitSlug]/hotel/page.tsx"]);
  {
    const ch = dirty(["src", "prisma", "public", "scripts", "docs"]).filter((f) => f !== "scripts/qc-svc-h.3.mts" && f !== F.probe);
    const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.booking}`]); return true; } catch { return false; } })();
    if (ch.length === 0 && headHas) skip("F-1", "แตะเฉพาะไฟล์ของใบ (§1)", "H.3 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
    else await st("F-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ): availability/booking/booking-state/service/index/actions/pricing · 4 คอมโพเนนต์ + shared · 3 หน้า · cron/minute-jobs · 3 ทะเบียน event · permissions.ts · ฉาก · sds — ไม่แตะอื่น", () => {
      ok(ch.length > 0, "ยังไม่มีงาน (git status ว่าง) — ยังไม่มี booking.ts");
      eq(ch.filter((f) => !OWN.has(f)).slice(0, 10), [], "ไฟล์นอกใบ");
    });
  }
  await st("F-2", "ไม่แตะชิ้นต้องห้าม (§1): prisma/** · modules/rooms/** · modules/pos/** · rates.ts · hotel-settings.ts · storefront (store) · svc-qc-data.mts · ข้อสอบอื่น · src/lib/core (ยกเว้น permissions.ts) — ตรวจเมื่อมีงาน (booking.ts)", () => {
    ok(has(F.booking), `ยังไม่มี ${F.booking} — ตรวจตอนรับใบ`);
    const banned = dirty(["prisma", "src/lib/modules/rooms", "src/lib/modules/pos", F.rates, "src/lib/modules/hotel/hotel-settings.ts", "src/app/(store)", "scripts/svc-qc-data.mts", "scripts/qc-svc-h.0.mts", "scripts/qc-svc-h.1.mts", "src/lib/core"]).filter((f) => f !== F.perms);
    eq(banned, [], "ไฟล์ต้องห้าม");
  });
  await st("F-3", "แก้ service.ts เฉพาะที่ใบให้ (§1): checkOut/refundStay ไม่เปลี่ยน (เนื้อฟังก์ชันเท่า HEAD) · pricing.ts เพิ่มอย่างเดียว (ไม่ลบบรรทัด) · actions.ts/index.ts ไม่ลบบรรทัดเดิม · 3 ทะเบียน event ไม่ลบบรรทัด", () => {
    ok(has(F.booking), `ยังไม่มี ${F.booking} — ตรวจตอนรับใบ`);
    const fnBody = (src: string, name: string) => { const m = new RegExp(`export async function ${name}\\(([\\s\\S]*?)\\n\\}\\n`).exec(src); return m ? m[0] : ""; };
    const headSvc = (() => { try { return git(["show", `HEAD:${F.service}`]); } catch { return ""; } })();
    const cur = read(F.service);
    ok(cur && headSvc, "อ่าน service.ts ไม่ได้");
    for (const n of ["checkOut", "refundStay"]) eq(fnBody(cur, n), fnBody(headSvc, n), `${n} เปลี่ยน`);
    const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
    const bad: string[] = [];
    for (const f of [F.pricing, F.actions, F.index, F.consumers, F.autoLabels, F.whLabels]) if (dirty([f]).length && rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
    eq(bad, [], "ลบบรรทัด");
  }, "MAJOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  delete process.env.SVC_QC_CLOCK;
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `svc-h3-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (รวม Hotel*/RoomOccupancy/PosSale/PosDeposit/OutboxEvent/AuditLog) · ผู้ใช้ทดสอบ 0 · ไม่มี SVC_QC_CLOCK ค้างใน env", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: MAIL } } }), 0, "user");
    eq(process.env.SVC_QC_CLOCK ?? null, null, "SVC_QC_CLOCK ค้าง");
  }, "MAJOR");
}

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc (svc-qc-hotel-booking-scene) ──");
{
  let why = "";
  let unitId = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.hotel.slug, type: "HOTEL" }, select: { id: true } }) : null;
    const nt = u ? await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id } }) : 0;
    if (!t || !u || nt < 3) why = "ร้าน svcqc/หน่วย hotel ยังไม่ seed บนฐาน l2 (scripts/seed-svc-qc.mts)";
    else if (!H0_OK) why = H0_WHY;
    else if (!bookL.mod) why = `ยังไม่มี ${F.booking}`;
    else if (!has(F.sceneH1)) why = `ยังไม่มี ${F.sceneH1}`;
    else if (!has(F.scene)) why = `ยังไม่มี ${F.scene}`;
    else unitId = u.id;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScript = (rel: string, args: string[] = [], env: Record<string, string> = {}) => spawnSync("pnpm", ["exec", "tsx", rel, ...args], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const MARK = SC.mark;
  const sceneRowsDb = () => prisma.hotelReservation.findMany({ where: { tenantId: SQC_TENANT.id, unitId, note: { contains: MARK } } }) as Promise<Any[]>;
  const otherSig = async () => J([await prisma.hotelReservation.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelReservation.count({ where: { tenantId: SQC_TENANT.id, NOT: { note: { contains: MARK } } } }), await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } }), await prisma.hotelRatePlan.count({ where: { tenantId: SQC_TENANT.id, unitId } })]);
  const n1 = `ฉาก ${F.scene}: (ฉาก h.1 ก่อน · h.2 --clear ถ้ามี · h.3 --clear) รัน exit 0 · SCENE_SUMMARY {created,updated,removed} + groupId · แถว mark ${MARK} ตาม expect: rowsByStatus · groups 1/3 แถว · counted nights 21 · sources 5 · OTA channelRef · PAID มี depositPaidAt+ใบรับ POS (หน่วย hotel ต้องผูก POS) · noshow ริบ · cancelled คืน 100% · ร้านอื่น/แถวนอก mark ไม่เปลี่ยน`;
  const n2 = "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0 · แถว/สถานะเท่าเดิม";
  const n3 = "sweepExpiredHolds บนฉาก ⇒ afterSweep: HOLD 1 · CANCELLED 2 (HOLD_EXPIRED) · counted nights 20 · ใบอื่นไม่เปลี่ยน";
  const n4 = "--clear ลบเฉพาะแถว mark (HotelReservation 0 · nights/folio ตาม Cascade 0 · occupancy ของฉากไม่ active) · แถวนอก mark/ห้อง/แผน/ร้านอื่น คงเดิม · รันคืน";
  if (why) { for (const [id, n] of [["Q-1", n1], ["Q-2", n2], ["Q-3", n3], ["Q-4", n4]]) skip(id, n, why, "MAJOR"); }
  else {
    const countedNights = async () => prisma.hotelBookingNight.count({ where: { tenantId: SQC_TENANT.id, unitId, counted: true, reservation: { note: { contains: MARK } } } });
    const byStatus = async () => { const rows = await sceneRowsDb(); const by: Record<string, number> = {}; for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1; return by; };
    await st("Q-1", n1, async () => {
      ok(runScript(F.sceneH1).status === 0, "ฉาก h.1 ล้ม");
      if (has("scripts/svc-qc-hotel-tape-scene.mts")) runScript("scripts/svc-qc-hotel-tape-scene.mts", ["--clear"]);
      runScript(F.scene, ["--clear"]);
      const o0 = await otherSig();
      const a = runScript(F.scene);
      const sum = summary(`${a.stdout}`);
      ok(a.status === 0 && sum && ["created", "updated", "removed"].every((k) => typeof sum[k] === "number"), `exit=${a.status} ${sum ? fmt(sum) : `${a.stdout}${a.stderr}`.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
      eq(await byStatus(), { ...SC.expect.rowsByStatus }, "rowsByStatus");
      const rows = await sceneRowsDb();
      const groups = new Map<string, number>();
      for (const r of rows) if (r.groupId) groups.set(r.groupId, (groups.get(r.groupId) ?? 0) + 1);
      eq([groups.size, [...groups.values()]], [SC.expect.groups, [SC.expect.groupRows]], "กลุ่ม");
      const gid = [...groups.keys()][0];
      ok(gid && J(sum).includes(gid), "SCENE_SUMMARY ไม่พิมพ์ groupId ของกลุ่ม");
      eq(await countedNights(), SC.expect.countedNightsBeforeSweep, "counted nights");
      eq([...new Set(rows.map((r) => r.source))].sort(), [...SC.expect.sources].sort(), "sources");
      ok(rows.filter((r) => r.source === "OTA").every((r) => r.channelRef === SC.bookings.find((b) => b.source === "OTA")!.channelRef), "channelRef OTA");
      const pos = await prisma.appSystemUnit.findFirst({ where: { tenantId: SQC_TENANT.id, unitId, type: "POS" } });
      ok(pos, "หน่วย hotel svcqc ไม่ผูก POS — มัดจำผ่าน POS ไม่ได้ (เสนอแก้ฟิกซ์เจอร์ SQC_SYSTEM_UNITS)");
      const paidKeys = new Set(SC.bookings.filter((b) => b.deposit === "PAID").map((b) => b.key));
      const paidRows = rows.filter((r) => r.depositPaidAt);
      ok(paidRows.length >= paidKeys.size, `แถวจ่ายมัดจำ ${paidRows.length} < ${paidKeys.size}`);
      ok(paidRows.every((r) => r.depositSaleId), "PAID ไม่มี depositSaleId");
      const sales = await prisma.posSale.findMany({ where: { tenantId: SQC_TENANT.id, id: { in: paidRows.map((r) => r.depositSaleId) } } });
      eq(sales.length, paidRows.length, "ใบรับ POS");
      const ns = rows.find((r) => r.status === "NO_SHOW");
      ok(ns?.depositSaleId && (await prisma.posSale.count({ where: { tenantId: SQC_TENANT.id, idempotencyKey: { startsWith: "dep-forfeit:" }, sourceModule: { not: "POS" } } })) >= 1, "no-show ไม่มีบิลริบ");
      const cn = rows.find((r) => r.status === "CANCELLED");
      ok(cn?.depositSaleId && (await prisma.posSale.count({ where: { tenantId: SQC_TENANT.id, docType: "REFUND", refSaleId: cn.depositSaleId } })) === 1, "cancelled ไม่มีใบคืน 100%");
      eq(await otherSig(), o0, "ร้านอื่น/แถวนอก mark เปลี่ยน");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const s0 = J(await byStatus()), n0 = await countedNights();
      const b = runScript(F.scene);
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      eq([J(await byStatus()), await countedNights()], [s0, n0], "เปลี่ยน");
    }, "MAJOR");
    await st("Q-3", n3, async () => {
      const r = await BK("sweepExpiredHolds")({});
      ok(typeof r?.expired === "number", `sweep ${J(r)}`);
      const by = await byStatus();
      eq([by.HOLD, by.CANCELLED], [SC.expect.afterSweep.HOLD, SC.expect.afterSweep.CANCELLED], "afterSweep");
      eq((await sceneRowsDb()).filter((x) => x.cancelReason === SC.expect.afterSweep.holdExpiredReason).length, 1, "HOLD_EXPIRED");
      eq(await countedNights(), SC.expect.countedNightsAfterSweep, "counted หลัง sweep");
    }, "MAJOR");
    await st("Q-4", n4, async () => {
      const o0 = await otherSig();
      const idsBefore = (await sceneRowsDb()).map((r) => r.id);
      const cl = runScript(F.scene, ["--clear"]);
      ok(cl.status === 0, `--clear exit=${cl.status}`);
      eq((await sceneRowsDb()).length, 0, "แถวค้าง");
      eq(await prisma.hotelBookingNight.count({ where: { reservationId: { in: idsBefore } } }), 0, "nights ค้าง");
      eq(await prisma.roomOccupancy.count({ where: { refType: "HotelReservation", refId: { in: idsBefore }, active: true } }), 0, "occupancy ค้าง");
      eq(await otherSig(), o0, "ลบเกิน");
      const back = runScript(F.scene);
      ok(back.status === 0 && (await sceneRowsDb()).length === sceneRows().length, "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const name = "visual-svc h.3 ด้วย owner และ frontdesk · 4–5 ใบ (รายการ · HOLD · รายละเอียดกลุ่ม [SVC_VIS_H3_GROUP_ID] · วิซาร์ด 1/3) × 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน — ผู้คุมตรวจโครง/ไทย/read-only (PARITY)";
  if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก h.1 + h.3 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port> (SVC_VIS_H3_GROUP_ID จาก SCENE_SUMMARY)", "MAJOR");
  else {
    const bad: string[] = [];
    let groupEnv: Record<string, string> = {};
    try { const head = await prisma.hotelReservation.findFirst({ where: { tenantId: SQC_TENANT.id, note: { contains: SC.mark }, groupId: { not: null }, depositSatang: { gt: 0 } }, select: { id: true } }); if (head) groupEnv = { SVC_VIS_H3_GROUP_ID: head.id }; } catch { /* */ }
    for (const user of ["owner", "frontdesk"]) {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.3", "--user", user, "--base", base], { cwd: ROOT, env: { ...process.env, ...groupEnv }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (r.status !== 0) bad.push(`${user} exit=${r.status} ${`${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.includes("❌")).slice(0, 2).join(" | ").slice(0, 200)}`);
    }
    record("V-1", name, bad.length ? "FAIL" : "PASS", bad.join(" · "), "MAJOR");
  }
}

// ═══════════════ G regression ═══════════════
console.log("\n── G: regression ──");
const summaryOf = (out: string): { failed: string[] } | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed: string[] }; } catch { return null; }
};
const judgeNoFail = (out: string) => (summaryOf(out)?.failed.length ?? 1) === 0;
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-h.0", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-h.1", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-hotel-money", note: "เส้น P1 createReservation → nights/occupancy ครบ" },
  { s: "qc-hotel-public" },
  { s: "qc-hotel-refund" },
  { s: "qc-svc-r0.8", judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.9", judge: (out) => { const f = summaryOf(out)?.failed; return Array.isArray(f) && f.every((x) => x === "G-1"); }, note: "ยอม G-1 (หนี้เดิม r0.9 ตั้งแต่ G2)" },
  { s: "qc-svc-smoke" },
  { s: "qc-svc-b.0", judge: judgeNoFail, note: "ทะเบียน event ไม่มี FAIL" },
];
{
  const hasWork = typeof bookL.mod?.createBooking === "function" && typeof bookL.mod?.sweepExpiredHolds === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (booking.ts createBooking/sweepExpiredHolds) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_H3_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-h3-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const byGroup: Record<string, { total: number; passed: number; failed: number; skipped: number }> = {};
for (const c of cks) { const g = (byGroup[groupOf(c.id)] ??= { total: 0, passed: 0, failed: 0, skipped: 0 }); g.total++; if (c.res === "PASS") g.passed++; else if (c.res === "FAIL") g.failed++; else g.skipped++; }
console.log(`\n===== QC SVC H.3 · จอง V2 โรงแรม =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`กลุ่ม: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.passed}/${v.total}${v.skipped ? ` (skip ${v.skipped})` : ""}`).join(" · ")}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id), byGroup })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed/ยังไม่มีฉาก · F-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
