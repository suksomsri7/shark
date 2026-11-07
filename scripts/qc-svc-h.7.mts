// QC — SVC H.7 · night audit 6 ขั้น (no-show ริบมัดจำผ่าน POS · post ค่าห้อง · ห้องค้างต่อ DIRTY · freeze KPI · แจ้ง · reopen) · business date ต่อ timezone (pure) ·
//      cron `hotel-night-audit` ทุก 15 นาที · รายงาน Occ/ADR/RevPAR/รายได้ตามแหล่ง/แผน/ประเภท · funnel · forecast 30 · แม่บ้าน · มัดจำ · CSV (csvRow+BOM) · getUnitKpi
//      oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes → ผู้คุม ORACLE-EDIT)
// สัญญา: ledger/svc-briefs/svc-brief-h.7.md (§0 หลัก 6 ขั้น · §1 ไฟล์ · §2 มติ 8 ข้อ · §3 สัญญาโค้ด · §4 จอ · §5 event · §6 ฉาก · §7 เกณฑ์รับ/regression/X)
//        ยืนบน H.3 booking.ts (createBooking · takeBookingDeposit · markNoShow) · H.5 folio.ts (postRoomNights(auditId)) · H.1 pricing/rates · H.2 block.ts (BLOCK ⇒ OOO) · rooms/occupancy (toYmd/ymdToDb) ·
//        platform/minute-jobs.ts (registerMinuteJob/runMinuteJobs) · prisma HotelNightAudit (unique unitId+businessDate) · defs rooms.ts (noShow · dailyHousekeeping · nightAuditTime #76 · มติ §9.7)
//        ฟิกซ์เจอร์ scripts/svc-qc-data.mts บล็อก "SVC H.7" (SQC_HOTEL_AUDIT_SCENE · SQC_VISUAL_SPECS["h.7"] · manager +hotel.audit.run/reports.read) + "SVC H.3" (SQC_HOTEL_BOOKING_SCENE) + SQC_HOTEL_RATES
//
// 🔴 ORACLE-EDIT ที่ใบนี้คาด (จดตามพรอมป์ผู้คุม): hotel-tabs-shared.ts แท็บ reports `available: true` — ข้อสอบ h.1 U-3/U-4 (แท็บเดิม) ต้องแก้ตามตอนรับใบ
// 🔴 H.6 (housekeeping.ts · markStayoversDirty) ยังคนละเลน — ข้อที่พึ่ง H.6 = SKIP เมื่อยังไม่มี export นั้น (ไม่ใช่แดง): NA-9 · Q-3 (ส่วน stayoversDirty)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน): ฐาน QC ต่อได้ทุกเลน · ตัวดักคิวรี · ตาราง HotelNightAudit · ฟิกซ์เจอร์ h.7 สอดคล้องฉาก h.3 (occupied 2 · available 13 · noShows 1) · manager สิทธิ์ · ของที่ยืนบนโหลดได้ · oracle ของ oracle (ปัด/VAT/tz/ราคา)
//   BD business-date.ts (pure): Bangkok = bkkYmd · Tokyo/New_York ผ่าน Intl (รวม DST) · nextBusinessDate · isAuditDue ก่อน/หลัง nightAuditTime · ไม่ import prisma
//   NA ปิดวัน 6 ขั้น (ร้านชั่วคราว svc-h7-*): preview · close (no-show ริบผ่าน POS · folio VOID ตาม H.3 · มติ §9.1 · post ROOM เฉพาะ CHECKED_IN คืน D · ไม่โพสต์ซ้ำ/คืนที่ void · KPI ทุกตัวคำนวณมือ · AuditLog · event) · GL เข้ม · ALREADY_CLOSED · TOO_EARLY · PREVIOUS_OPEN · timezone ≠ Bangkok · reopen (MANAGER · เหตุผล · วันล่าสุด) → ปิดใหม่ไม่ซ้ำ · tx ล้มกลางคัน (trigger จำลอง) = rollback ขั้น 2–5 · stayover DIRTY (SKIP H.6)
//   CR cron: ทะเบียน hotel-night-audit 15 นาที · runDueAudits ปิดเฉพาะหน่วยที่ถึงเวลา/autoClose · 2 รอบซ้อน = ครั้งเดียว · budget 0 = ไม่ปิด · หน่วย timezone ต่างกัน · หน่วยล้ม = errors ไม่บล็อกหน่วยอื่น
//   RP รายงาน: occupancyReport day/month (วันปิดแล้วอ่าน audit · วันยังไม่ปิดคำนวณสด) · revenueReport source/ratePlan/roomType net void · bookingFunnel · forecast30 (= hotelAvailability) · housekeepingReport · depositsReport · exportCsv (BOM · csvRow) · ≤ 8 คิวรี · INVALID_RANGE > 366 · getUnitKpi
//   X ด่าน (X1 ข้ามร้าน/หน่วย NOT_FOUND · X3 ปิดซ้ำ · X9 สิทธิ์ 4 ระดับ · X10 DTO/payload/AuditLog ไม่มี PII) · N event 3 ทะเบียน + consumer อีเมล idempotencyKey hotel-audit-<auditId>
//   U สถิต (ไฟล์ §1 · "use server" · แท็บ reports · ไม่มี vercel.json cron · ไม่มีไลบรารีกราฟ · ไทย · defs 3 คีย์ · permissions ออกจาก planned · service.ts ใช้ business-date) · F ไฟล์ที่แตะ · Q ฉาก svcqc · V ภาพ · Z ล้าง · G regression
//
// 🔴 ผลที่ถูกต้องก่อนมีงาน: PC เขียว · BD/NA/CR/RP/X/N/U/F แดงเหตุผล "ยังไม่มี src/lib/modules/hotel/business-date.ts|night-audit.ts|reports.ts" · Q/V/G SKIP · ไม่มี throw ดิบ
// 🔴 ร้านชั่วคราว slug/email `svc-h7-*` (POS + บัญชี ของตัวเอง · หน่วย timezone Asia/Bangkok · America/New_York) ลบใน finally + กวาดค้างตอนเริ่ม · trigger จำลองความล้ม qc_h7_fail ลบใน finally · ไม่แตะ /tmp (log regression ลง /root/svc-runs)
// 🔴 ระหว่าง CR ตั้ง rooms.hotel.audit.autoClose=false ให้หน่วยโรงแรม svcqc/ร้านอื่น (cron กวาดทุกร้าน) แล้วคืนค่าใน finally — ฉาก h.7/h.5 ของ svcqc ต้องไม่ถูก cron ปิดวันก่อน
// รัน: cd /root/projects/shark-svc-l1 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.7.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill · ห้าม export CI · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_OTHER, SQC_HOTEL_ROOMS, SQC_HOTEL_RATES, SQC_HOTEL_BOOKING_SCENE, SQC_HOTEL_AUDIT_SCENE, SQC_VISUAL_SPECS, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-h.7";
const SUITE = "qc-svc-h.7";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H7_NO_REGRESSION === "1";
const SLUG = "svc-h7-";
const MAIL = "svc-h7-";
const LOG_DIR = "/root/svc-runs";
const TRIGGER = "qc_h7_fail";
const F = {
  bd: "src/lib/modules/hotel/business-date.ts",
  na: "src/lib/modules/hotel/night-audit.ts",
  rp: "src/lib/modules/hotel/reports.ts",
  service: "src/lib/modules/hotel/service.ts",
  index: "src/lib/modules/hotel/index.ts",
  actions: "src/lib/modules/hotel/actions.ts",
  booking: "src/lib/modules/hotel/booking.ts",
  folio: "src/lib/modules/hotel/folio.ts",
  checkout: "src/lib/modules/hotel/checkout.ts",
  hk: "src/lib/modules/hotel/housekeeping.ts",
  block: "src/lib/modules/hotel/block.ts",
  avail: "src/lib/modules/hotel/availability.ts",
  pricing: "src/lib/modules/hotel/pricing.ts",
  rates: "src/lib/modules/hotel/rates.ts",
  occupancy: "src/lib/modules/rooms/occupancy.ts",
  minuteJobs: "src/lib/platform/minute-jobs.ts",
  roomsDefs: "src/lib/core/settings/defs/rooms.ts",
  perms: "src/lib/core/permissions.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  whLabels: "src/lib/webhooks/labels.ts",
  csv: "src/lib/core/csv.ts",
  tabsShared: "src/components/hotel/hotel-tabs-shared.ts",
  panel: "src/components/hotel/NightAuditPanel.tsx",
  history: "src/components/hotel/AuditHistory.tsx",
  screen: "src/components/hotel/ReportsScreen.tsx",
  table: "src/components/hotel/ReportTable.tsx",
  kpi: "src/components/hotel/KpiCards.tsx",
  chart: "src/components/hotel/ForecastChart.tsx",
  shared: "src/components/hotel/reports-shared.ts",
  reportsPage: "src/app/app/u/[unitSlug]/hotel/reports/page.tsx",
  auditPage: "src/app/app/u/[unitSlug]/hotel/reports/audit/page.tsx",
  exportRoute: "src/app/app/u/[unitSlug]/hotel/reports/export/route.ts",
  hotelPage: "src/app/app/u/[unitSlug]/hotel/page.tsx",
  scene: "scripts/svc-qc-hotel-audit-scene.mts",
  sceneH1: "scripts/svc-qc-hotel-rates-scene.mts",
  sceneH3: "scripts/svc-qc-hotel-booking-scene.mts",
  sceneH2: "scripts/svc-qc-hotel-tape-scene.mts",
  sceneH5: "scripts/svc-qc-hotel-folio-scene.mts",
  sceneH6: "scripts/svc-qc-hotel-hk-scene.mts",
  sds: "docs/sds/modules/hotel.md",
  vercel: "vercel.json",
} as const;

loadSvcQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
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
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? r?.error ?? J(r)?.slice(0, 80));
const failCode = (r: Any): string | null => (r && r.ok === false ? String(r.code ?? r.error ?? "") : null);
const DENIED = new Set(["FORBIDDEN", "NO_PERMISSION", "PERMISSION", "PERMISSION_DENIED"]);
const isDenied = (r: Any) => { const c = failCode(r); return c !== null && DENIED.has(c); };
const isFail = (r: Any, ...codes: string[]) => { const c = failCode(r); return c !== null && c !== "THROW" && (codes.length === 0 || codes.includes(c)); };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? r?.message ?? ""}`.trim()); return r; };
/** เรียกฟังก์ชันของใบ — throw ดิบ = {ok:false, code:"THROW"} (ผิดสัญญา "0 throw ดิบ") */
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const ymdOfDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOfDay(dayNo(ymd) + n);
const dowOf = (ymd: string) => (((dayNo(ymd) + 4) % 7) + 7) % 7;
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const ymdOfDb = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const nightsOf = (ci: string, co: string) => { const out: string[] = []; for (let d = ci; d < co; d = addDays(d, 1)) out.push(d); return out; };
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const groupOf = (id: string) => id.split("-")[0];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** หยิบค่าตัวแรกที่มีจากชื่อคีย์หลายแบบ (DTO ใบนี้ระบุชื่อไม่ครบทุกช่อง — ข้อสอบรับหลายชื่อที่สมเหตุผล · จดเป็นคำถามผู้คุม) */
const pick = (o: Any, ...names: string[]): unknown => { if (!o || typeof o !== "object") return undefined; for (const n of names) if (o[n] !== undefined) return o[n]; return undefined; };
const rowsOf = (r: Any): Any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : Array.isArray(r?.items) ? r.items : Array.isArray(r?.days) ? r.days : []);

// ═══════════════ ตัวอ้างอิง (oracle ของ oracle · pure) ═══════════════
type Cell = { weekday: number; weekend: number };
const WEEKEND = [5, 6];
const refNightPrice = (cell: Cell, date: string) => (WEEKEND.includes(dowOf(date)) ? cell.weekend : cell.weekday);
/** ปัดเศษแบบ SATANG ของ pricing.roundFraction (ครึ่งขึ้น · den 0 ⇒ 0) — PC-7 ตรวจว่าตรงของจริง */
const roundRef = (n: number, d: number) => (d > 0 ? Math.floor((2 * Math.max(0, Math.trunc(n)) + d) / (2 * d)) : 0);
const bpsRef = (occ: number, avail: number) => (avail > 0 ? Math.floor((occ * 10_000) / avail) : 0);
/** VAT ในราคา (สูตรเดียวกับ splitIncludedVat) */
const refVat = (gross: number, bp = 700) => { if (!(bp > 0)) return { base: gross, vat: 0 }; const den = 10_000 + bp; const base = Math.floor((2 * gross * 10_000 + den) / (2 * den)); return { base, vat: gross - base }; };
/** วันที่ (YYYY-MM-DD) ของ `d` ใน timezone — ตัวอ้างอิงอิสระผ่าน Intl en-CA */
const refTzYmd = (tz: string, d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
/** ราคาคืนของฉาก svcqc จาก SQC_HOTEL_RATES (STANDARD) — เหมือน qc-svc-h.5 refScenePrice */
const refScenePrice = (typeName: string, ymd: string): number => {
  const R = SQC_HOTEL_RATES;
  const base = R.base[typeName];
  const mmdd = ymd.slice(5);
  const d = Number(ymd.slice(8, 10));
  if (typeName === R.override.roomType && d === R.override.dayOfMonth) return R.override.priceSatang;
  const inRange = (s: string, e: string) => (s <= e ? mmdd >= s && mmdd <= e : mmdd >= s || mmdd <= e);
  const seasons = [...R.seasons].filter((s) => inRange(s.start, s.end)).sort((a, b) => b.priority - a.priority);
  const s = seasons[0];
  const isHoliday = R.holidays.some((h) => h.date === mmdd);
  if (s?.fixed) { const f = s.fixed[typeName]; return isHoliday && f.holiday != null ? f.holiday : WEEKEND.includes(dowOf(ymd)) ? f.weekend : f.weekday; }
  const bucket = isHoliday && base.holiday != null ? base.holiday : WEEKEND.includes(dowOf(ymd)) ? base.weekend : base.weekday;
  const adj = s?.adjustBp ?? 0;
  return Math.round((bucket * (10_000 + adj)) / 10_000);
};
const PII_KEY = /guest(Name|Phone|Email)|^phone$|^email$|idNumber|passport|publicToken/i;
const walkKeys = (v: Any, keys = new Set<string>()): Set<string> => { if (v instanceof Set || v instanceof Date) return keys; if (Array.isArray(v)) v.forEach((x) => walkKeys(x, keys)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walkKeys(x, keys); } return keys; };

// ═══════════════ ตัวดักคิวรี (แบบ h.2) ก่อนโหลด db ═══════════════
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
const sqlCount = (from: number) => SQL_LOG.slice(from).filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET |SAVEPOINT|RELEASE)/i.test(q)).length;

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
if (spyInstalled && prisma !== (globalThis as Any).prisma) spyInstalled = false;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const PERM = (await tryImport("@/lib/core/permissions")).mod as Any;
const quietL = await tryImport("@/lib/core/quiet-hours");
const vatL = await tryImport("@/lib/money/vat");
const csvL = await loadIf(F.csv);
const hotelL = await loadIf(F.index);
const bookL = await loadIf(F.booking);
const folioL = await loadIf(F.folio);
const serviceL = await loadIf(F.service);
const ratesL = await loadIf(F.rates);
const pricingL = await loadIf(F.pricing);
const blockL = await loadIf(F.block);
const availL = await loadIf(F.avail);
const occL = await loadIf(F.occupancy);
const hkL = await loadIf(F.hk);
const bdL = await loadIf(F.bd);
const naL = await loadIf(F.na);
const rpL = await loadIf(F.rp);
const mjL = await loadIf(F.minuteJobs);
const consumersL = await loadIf(F.consumers);
const autoL = await loadIf(F.autoLabels);
const whL = await loadIf(F.whLabels);
const tabsL = await loadIf(F.tabsShared);
const sysL = await tryImport("@/lib/modules/system/service");
const posL = await tryImport("@/lib/modules/pos/service");
const accSvcL = await tryImport("@/lib/modules/account/service");
const glL = await tryImport("@/lib/modules/account/gl");
const RT_ = (name: string) => fnOf(ratesL, name, F.rates);
const BK = (name: string) => fnOf(bookL, name, F.booking);
const FO = (name: string) => fnOf(folioL, name, F.folio);
const BD = (name: string) => fnOf(bdL, name, F.bd);
const NA = (name: string) => fnOf(naL, name, F.na);
const RP = (name: string) => fnOf(rpL, name, F.rp);
const needBd = () => { if (!bdL.mod) throw new AssertFail(`ยังไม่มี ${F.bd} (${bdL.err})`); };
const needNa = () => { if (!naL.mod) throw new AssertFail(`ยังไม่มี ${F.na} (${naL.err})`); };
const needRp = () => { if (!rpL.mod) throw new AssertFail(`ยังไม่มี ${F.rp} (${rpL.err})`); };
const HK_SKIP = typeof hkL.mod?.markStayoversDirty === "function" ? "" : `H.6 ยังไม่ merge — ${F.hk} ไม่มี export markStayoversDirty`;

// ═══════════════ ฐานข้อมูล: ตาราง HotelNightAudit · ล้าง ═══════════════
const NA_COLS = ["id", "tenantId", "unitId", "businessDate", "status", "roomsTotal", "roomsOOO", "roomsAvailable", "roomsOccupied", "occupancyBps", "roomRevenueSatang", "adrSatang", "revparSatang", "arrivals", "departures", "noShowCount", "cancelledCount", "snapshot", "closedById", "reopenedAt", "reopenedById"];
let H0_OK = false;
let H0_WHY = "";
try {
  const rows: { c: string }[] = await prisma.$queryRawUnsafe(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HotelNightAudit'`);
  const have = new Set(rows.map((r) => r.c));
  const miss = NA_COLS.filter((c) => !have.has(c));
  const uq: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'HotelNightAudit' AND indexdef ILIKE '%UNIQUE%' AND indexdef LIKE '%unitId%' AND indexdef LIKE '%businessDate%'`);
  const other = ["HotelBookingNight", "HotelFolio", "HotelFolioItem", "HotelHousekeepingLog", "RoomOccupancy"];
  const t: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, other);
  const missT = other.filter((x) => !t.some((r) => r.t === x));
  H0_OK = rows.length > 0 && miss.length === 0 && Number(uq[0]?.n ?? 0) >= 1 && missT.length === 0 && typeof prisma.hotelNightAudit?.findMany === "function";
  H0_WHY = rows.length === 0 ? "ยังไม่มีตาราง HotelNightAudit บนฐาน" : miss.length ? `HotelNightAudit ขาดคอลัมน์ ${miss.join(", ")}` : Number(uq[0]?.n ?? 0) < 1 ? "ไม่มี unique(unitId, businessDate)" : missT.length ? `ยังไม่มีตาราง ${missT.join(", ")}` : typeof prisma.hotelNightAudit?.findMany !== "function" ? "Prisma client ยังไม่มี model HotelNightAudit" : "";
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
  try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON "HotelNightAudit"`); await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIGGER}_fn()`); } catch (e) { console.log(`  ⚠️ ลบ trigger: ${errMsg(e)}`); }
  try { await prisma.opsAlertState.deleteMany({ where: { source: { in: ["minute-job:lease:hotel-night-audit", "minute-job:run:hotel-night-audit", "minute-job:ok:hotel-night-audit"] } } }); } catch { /* ไม่มีแถว */ }
}
/** trigger จำลอง tx ล้มกลางคัน: insert HotelNightAudit ของหน่วย `unitId` ⇒ RAISE (ขั้น 4 KPI freeze ล้ม ⇒ ทั้ง tx ย้อน) */
async function installFailTrigger(unitId: string) {
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${TRIGGER}_fn() RETURNS trigger AS $$ BEGIN IF NEW."unitId" = '${unitId.replace(/'/g, "")}' THEN RAISE EXCEPTION 'qc-h7: simulated failure in night audit tx'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON "HotelNightAudit"`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER ${TRIGGER} BEFORE INSERT OR UPDATE ON "HotelNightAudit" FOR EACH ROW EXECUTE FUNCTION ${TRIGGER}_fn()`);
}
async function dropFailTrigger() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON "HotelNightAudit"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIGGER}_fn()`);
}
const tenantIds: string[] = [];
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string; membershipId?: string };
/** autoClose ของหน่วยโรงแรม svcqc ที่ข้อสอบปิดชั่วคราวระหว่าง CR (คืนค่าใน finally) */
const AUTO_CLOSE_UNITS: { tenantId: string; unitId: string; had: boolean }[] = [];
const sqcOwnerU = SQC_USERS.find((u) => u.key === "owner")!;
const SQC_OWNER: Actor = { role: sqcOwnerU.role as Actor["role"], unitAccess: [...sqcOwnerU.unitAccess], permissions: { ...sqcOwnerU.permissions }, userId: sqcOwnerU.userId };
async function guardSvcqcAutoClose() {
  if (!SET?.setSettings) return;
  for (const [tid, uid2] of [[SQC_TENANT.id, SQC_UNITS.hotel.id], [SQC_OTHER.tenant.id, SQC_OTHER.units.hotel.id]] as [string, string][]) {
    try {
      const u = await prisma.businessUnit.findFirst({ where: { id: uid2, tenantId: tid }, select: { id: true } });
      if (!u) continue;
      const had = (await prisma.settingValue.count({ where: { tenantId: tid, key: "rooms.hotel.audit.autoClose", scope: "UNIT", scopeId: uid2 } })) > 0;
      const r = await SET.setSettings({ ...SQC_OWNER, unitAccess: ["*"] }, { tenantId: tid }, [{ key: "rooms.hotel.audit.autoClose", scope: "UNIT", scopeId: uid2, value: false }]);
      if (r?.ok) AUTO_CLOSE_UNITS.push({ tenantId: tid, unitId: uid2, had });
    } catch { /* ยังไม่มี def (ก่อนมีงาน) */ }
  }
}
async function restoreSvcqcAutoClose() {
  for (const x of AUTO_CLOSE_UNITS) {
    try {
      if (x.had) await SET.setSettings({ ...SQC_OWNER, unitAccess: ["*"] }, { tenantId: x.tenantId }, [{ key: "rooms.hotel.audit.autoClose", scope: "UNIT", scopeId: x.unitId, value: true }]);
      else await SET.resetSetting({ ...SQC_OWNER, unitAccess: ["*"] }, { tenantId: x.tenantId }, { key: "rooms.hotel.audit.autoClose", scope: "UNIT", scopeId: x.unitId });
    } catch (e) { console.log(`  ⚠️ คืน autoClose ${x.unitId}: ${errMsg(e)}`); }
  }
  AUTO_CLOSE_UNITS.length = 0;
}

// ═══════════════ ตัวช่วยสถิต (UI) ═══════════════
const EN_ALLOW = /^(VAT|SC|OTA|LINE|PDPA|POS|ID|QR|AI|SHARK|HR|EDC|WEB|px|rem|em|svg|a|x|PromptPay|ADR|RevPAR|Occ|CSV|KPI|OOO|night|audit|bp|bps)$/;
const englishInJsx = (src: string): string[] => {
  const s = stripComments(src);
  const texts: string[] = [];
  for (const m of s.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) texts.push(m[1]);
  for (const m of s.matchAll(/(?:placeholder|title|aria-label|alt)=["']([^"']*)["']/g)) texts.push(m[1]);
  const bad: string[] = [];
  for (const t of texts) for (const w of t.match(/[A-Za-z][A-Za-z.'-]{1,}/g) ?? []) if (!EN_ALLOW.test(w) && !/^[A-Z]{2,6}$/.test(w)) bad.push(w);
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
const CHART_LIBS = /["'](recharts|chart\.js|react-chartjs-2|d3|@nivo\/[^"']+|victory|echarts|apexcharts|plotly\.js|@visx\/[^"']+)["']/;

console.log(`\n(ฐาน ${process.env.SVC_QC_HOST ?? "?"} · ตัวดักคิวรี ${spyInstalled ? "ติดตั้งแล้ว" : "ไม่ได้ติดตั้ง"} · HotelNightAudit ${H0_OK ? "มี" : `ยังไม่มี (${H0_WHY})`} · business-date.ts ${bdL.mod ? "โหลดได้" : "ยังไม่มี"} · night-audit.ts ${naL.mod ? "โหลดได้" : "ยังไม่มี"} · reports.ts ${rpL.mod ? "โหลดได้" : "ยังไม่มี"} · housekeeping.ts ${hkL.mod ? "มี" : "ยังไม่มี (H.6)"})`);

// ═══════════════ ฟิกซ์เจอร์ → ตัวช่วย ═══════════════
const AS = SQC_HOTEL_AUDIT_SCENE;
const BS = SQC_HOTEL_BOOKING_SCENE;
const T0 = bkkToday();
const W = (n: number) => addDays(T0, n);
const D = W(-1); // businessDate ที่ปิด (เมื่อวาน ไทย)
const kpiOfRow = (row: Any) => ({ roomsTotal: row.roomsTotal, roomsOOO: row.roomsOOO, roomsAvailable: row.roomsAvailable, roomsOccupied: row.roomsOccupied, occupancyBps: row.occupancyBps, roomRevenueSatang: row.roomRevenueSatang, adrSatang: row.adrSatang, revparSatang: row.revparSatang });
const eventsOfTenant = async (tid: string, type: string, pred?: (p: Any) => boolean) => ((await prisma.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => !pred || pred(e.payload ?? {}));

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฐาน QC ต่อได้ (SELECT 1 · host = ฐาน SVC เลนใดก็ได้ ep-mute-scene/ep-royal-lake/ep-weathered-mode/ep-royal-bar) · ตัวดักคิวรีติดตั้งก่อน db · ตาราง HotelNightAudit ครบคอลัมน์ H.0 §2.13 + unique(unitId, businessDate) · ตาราง H.0 อื่น · Prisma client มี hotelNightAudit", async () => {
    const r: { one: number }[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
    eq(r[0]?.one, 1, "SELECT 1");
    ok(/^(ep-mute-scene|ep-royal-lake|ep-weathered-mode|ep-royal-bar)/.test(process.env.SVC_QC_HOST ?? ""), `host ${process.env.SVC_QC_HOST} ไม่ใช่ฐาน QC ของ SVC`);
    ok(spyInstalled, "ตัวดักคิวรีไม่ได้ติดตั้ง (RP นับคิวรีไม่ได้)");
    ok(H0_OK, H0_WHY);
  });
  await st("PC-2", "ฟิกซ์เจอร์ h.7 สอดคล้องกันเอง + ฉาก h.3: businessDateOffset −1 · extraBookings = audit-noshow 1 ตัว (CONFIRMED · เข้า −1 · 1 คืน · มัดจำ PAID · ไม่เช็กอิน) ⇒ expect.noShows 1 · roomNightsPosted 2 = CHECKED_IN ของ h.3 ที่มีคืน −1 (inhouse-web · inhouse-ota) · roomsTotal 13 = ห้องโรงแรม svcqc ที่ไม่ใช่ MONTHLY · OOO 0 · available 13 · occupied 2 · occupancyBps 1538 = floor(2×10000÷13) · stayoversDirty 2 · closeTwice/closeToday/reopenThenClose/history · settings 4 คีย์ · ซูพีเรียพอ (4 ห้อง) · mark", () => {
    eq(AS.businessDateOffset, -1, "businessDateOffset");
    const ex = AS.extraBookings;
    eq(ex.length, 1, "extraBookings");
    eq([ex[0].key, ex[0].status, ex[0].checkInOffset, ex[0].nights, ex[0].deposit, ex[0].roomType], ["audit-noshow", "CONFIRMED", AS.businessDateOffset, 1, "PAID", "ซูพีเรีย"], "audit-noshow");
    eq(AS.expect.noShows, ex.filter((b) => b.status === "CONFIRMED" && b.checkInOffset === AS.businessDateOffset && b.deposit === "PAID").length, "noShows");
    const inhouse = BS.bookings.filter((b) => b.status === "CHECKED_IN" && b.checkInOffset <= AS.businessDateOffset && b.checkInOffset + b.nights > AS.businessDateOffset);
    eq(inhouse.map((b) => b.key).sort(), ["inhouse-ota", "inhouse-web"], "CHECKED_IN ที่มีคืน −1");
    eq([AS.expect.roomNightsPosted, AS.expect.roomsOccupied, AS.expect.stayoversDirty], [inhouse.length, inhouse.length, inhouse.length], "posted/occupied/stayovers");
    const total = SQC_HOTEL_ROOMS.filter((r) => r.rentMode !== "MONTHLY").length;
    eq([AS.expect.roomsTotal, AS.expect.roomsOOO, AS.expect.roomsAvailable], [total, 0, total], "ห้อง");
    eq(AS.expect.occupancyBps, bpsRef(AS.expect.roomsOccupied, AS.expect.roomsAvailable), "bps");
    eq([AS.expect.closeTwice, AS.expect.closeToday, AS.expect.reopenThenClose.auditStatus, AS.expect.reopenThenClose.roomNightsPostedAfter, AS.expect.history], ["ALREADY_CLOSED", "TOO_EARLY", "CLOSED", 2, 1], "ค่าคงที่");
    eq(Object.keys(AS.settings).sort(), ["rooms.hotel.audit.autoClose", "rooms.hotel.dailyHousekeeping", "rooms.hotel.nightAuditTime", "rooms.hotel.noShow"], "settings");
    eq([AS.settings["rooms.hotel.noShow"], AS.settings["rooms.hotel.nightAuditTime"], AS.settings["rooms.hotel.audit.autoClose"]], ["FORFEIT_RELEASE_AFTER_AUDIT", "03:00", true], "ค่าตั้ง");
    const sup = SQC_HOTEL_ROOMS.filter((r) => r.typeId.endsWith("superior")).length;
    const supOnD = BS.bookings.filter((b) => b.roomType === "ซูพีเรีย" && b.status !== "CANCELLED" && b.status !== "NO_SHOW" && b.checkInOffset <= -1 && b.checkInOffset + b.nights > -1).reduce((a, b) => a + b.rooms, 0) + ex.length;
    ok(supOnD <= sup, `ซูพีเรียคืน −1 ใช้ ${supOnD} > ${sup}`);
    eq([AS.mark, AS.unit], ["SvcQcScene:h7", "hotel"], "mark");
    const inPlan = SQC_HOTEL_RATES.plans.find((p) => p.key === "standard");
    ok(inPlan?.depositKind === "FIRST_NIGHT", "แผน standard ไม่ใช่ FIRST_NIGHT (บิลริบ = มัดจำคืนแรก)");
  });
  await st("PC-3", "ฟิกซ์เจอร์ผู้ใช้: manager MANAGER หน่วย hotel มี hotel.audit.run + hotel.reports.read + hotel.booking.manage · frontdesk/maid ไม่มี audit.run/reports.read · บนฐาน (seed แล้ว): membership manager ตรง · หน่วย hotel svcqc ผูก POS", async () => {
    const mg = SQC_USERS.find((u) => u.key === "manager")!, fd = SQC_USERS.find((u) => u.key === "frontdesk")!, md = SQC_USERS.find((u) => u.key === "maid")!;
    ok(mg.role === "MANAGER" && mg.unitAccess.includes(SQC_UNITS.hotel.id) && ["hotel.audit.run", "hotel.reports.read", "hotel.booking.manage"].every((p) => mg.permissions[p] === true), `manager ${J(mg)}`);
    ok(!fd.permissions["hotel.audit.run"] && !fd.permissions["hotel.reports.read"] && !md.permissions["hotel.audit.run"] && !md.permissions["hotel.reports.read"], "frontdesk/maid มีสิทธิ์ audit/reports");
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    if (!t) throw new AssertFail("ร้าน svcqc ยังไม่ seed บนฐานนี้ — ผู้คุมรัน seed ก่อน");
    const mb = await prisma.membership.findUnique({ where: { id: mg.membershipId }, select: { permissions: true, role: true } });
    ok(mb && mb.role === "MANAGER" && (mb.permissions as Any)?.["hotel.audit.run"] === true && (mb.permissions as Any)?.["hotel.reports.read"] === true, `membership manager บนฐานยังไม่ตรง H.7 (reseed): ${J(mb)}`);
    ok(await prisma.appSystemUnit.findFirst({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, type: "POS" } }), "หน่วย hotel svcqc ไม่ผูก POS บนฐาน (reseed)");
  }, "MAJOR");
  await st("PC-4", "def/สิทธิ์เดิมที่ H.7 พึ่ง: rooms.hotel.noShow enum ค่าเริ่ม FORFEIT_RELEASE_AFTER_AUDIT · rooms.hotel.dailyHousekeeping bool true · rooms.money.rounding SATANG · rooms.hotel.weekendDays [5,6] · ทะเบียนสิทธิ์มี hotel.audit.run / hotel.reports.read ป้ายไทย", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k}`); return x; };
    eq([d("rooms.hotel.noShow").defaults._fallback, d("rooms.hotel.dailyHousekeeping").defaults._fallback, d("rooms.money.rounding").defaults._fallback, d("rooms.hotel.weekendDays").defaults._fallback], ["FORFEIT_RELEASE_AFTER_AUDIT", true, "SATANG", [5, 6]], "ค่าเริ่ม");
    const src = read(F.perms);
    for (const k of ["hotel.audit.run", "hotel.reports.read"]) ok(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"[^"]*[฀-๿]`).test(src), `ไม่มีป้ายไทย ${k}`);
    ok(PERM, "โหลด permissions.ts ไม่ได้");
  });
  await st("PC-5", "ภาพ: SQC_VISUAL_SPECS[\"h.7\"] = hotel-reports · hotel-reports-revenue (?tab=revenue&groupBy=source) · hotel-audit (/hotel/reports/audit) · path ใต้ /hotel/reports · visual-svc h.7 --list พิมพ์ครบ · SQC_VISUAL_USERS มี manager/frontdesk", () => {
    const specs = SQC_VISUAL_SPECS["h.7"] ?? [];
    eq(specs.map((s) => s.name), ["hotel-reports", "hotel-reports-revenue", "hotel-audit"], "ชื่อ");
    ok(specs.every((s) => s.path.startsWith(`/app/u/${SQC_UNITS.hotel.slug}/hotel/reports`)), "path");
    ok(specs[1].path.includes("tab=revenue") && specs[1].path.includes("groupBy=source") && specs[2].path.endsWith("/hotel/reports/audit"), "query/audit");
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.7", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "" }, encoding: "utf8" });
    const out = r.stdout ?? "";
    ok(r.status === 0 && out.includes("/hotel/reports/audit") && out.includes("groupBy=source"), `--list exit ${r.status}: ${out.slice(0, 200)}`);
    ok(SQC_USERS.some((u) => u.key === "manager") && SQC_USERS.some((u) => u.key === "frontdesk"), "ผู้ใช้ภาพ");
  }, "MAJOR");
  await st("PC-6", "ของที่ H.7 ยืนบน โหลดได้จริง: booking.ts createBooking/takeBookingDeposit/markNoShow/undoNoShow/cancelBooking · folio.ts postRoomNights/postRoomNightsTx · checkout.ts settleAndCheckOut · pricing roundFraction/quoteStay · rates saveRates/listRatePlans · block.ts blockRoom · availability hotelAvailability.get · rooms/occupancy toYmd/ymdToDb · minute-jobs registerMinuteJob/runMinuteJobs/minuteJobDue · quiet-hours bkkYmd · core/csv csvRow · settings setSettings/resetSetting · system createSystem/linkUnit · pos createSale · consumers drainAll · HotelReservationStatus มี NO_SHOW/CONFIRMED", () => {
    ok(bookL.mod, bookL.err);
    eq(["createBooking", "takeBookingDeposit", "markNoShow", "undoNoShow", "cancelBooking"].filter((n) => typeof bookL.mod[n] !== "function"), [], "booking.ts");
    ok(folioL.mod && ["postRoomNights", "postRoomNightsTx"].every((n) => typeof folioL.mod[n] === "function"), `folio.ts ${folioL.err}`);
    ok(pricingL.mod && ["roundFraction", "quoteStay", "nightDates"].every((n) => typeof pricingL.mod[n] === "function"), "pricing");
    ok(ratesL.mod && ["saveRates", "listRatePlans", "saveRatePlan"].every((n) => typeof ratesL.mod[n] === "function"), "rates");
    ok(blockL.mod && typeof blockL.mod.blockRoom === "function", `block.ts ${blockL.err}`);
    ok(availL.mod && typeof availL.mod.hotelAvailability?.get === "function", `availability ${availL.err}`);
    ok(occL.mod && typeof occL.mod.toYmd === "function" && typeof occL.mod.ymdToDb === "function", `occupancy ${occL.err}`);
    ok(mjL.mod && ["registerMinuteJob", "runMinuteJobs", "minuteJobDue"].every((n) => typeof mjL.mod[n] === "function"), `minute-jobs ${mjL.err}`);
    ok(quietL.mod && typeof quietL.mod.bkkYmd === "function", "bkkYmd");
    ok(csvL.mod && typeof csvL.mod.csvRow === "function", "csvRow");
    ok(SET && typeof SET.setSettings === "function" && typeof SET.resetSetting === "function" && typeof SET.getDef === "function", "settings");
    ok(sysL.mod && ["createSystem", "linkUnit", "systemForUnit"].every((n) => typeof sysL.mod[n] === "function"), "system/service");
    ok(posL.mod && typeof posL.mod.createSale === "function", "pos createSale");
    ok(consumersL.mod?.consumers && typeof consumersL.mod.drainAll === "function", "consumers");
    ok(glL.mod && typeof glL.mod.ensureAccounting === "function" && accSvcL.mod && typeof accSvcL.mod.saveSettings === "function", "บัญชี");
    const sch = read("prisma/schema/hotel.prisma");
    ok(/enum HotelReservationStatus\s*\{[\s\S]*NO_SHOW[\s\S]*\}/.test(sch) && /model HotelNightAudit\s*\{[\s\S]*@@unique\(\[unitId, businessDate\]\)/.test(sch), "schema");
    ok(typeof serviceL.mod?.checkIn === "function" && typeof serviceL.mod?.todayBkk === "function", "service.ts checkIn/todayBkk");
  });
  await st("PC-7", "oracle ของ oracle: roundRef = pricing.roundFraction(SATANG) (0/1/3/7 ÷ 2 · 100,001 ÷ 13 · den 0 ⇒ 0) · bpsRef ปัดลง (2/13 ⇒ 1538) · refVat ตรง splitIncludedVat · refTzYmd: Bangkok ตรง bkkYmd 4 จุด (รวม 16:59Z/17:00Z) · Tokyo 14:59Z/15:00Z · New_York EST (04:59Z/05:00Z 7 พ.ย.) + EDT (03:59Z/04:00Z 1 ก.ค.) · dowOf ไม่ใช้ getDay · refScenePrice ตรง expect h.1 (+ซูพีเรีย 5 ธ.ค. ไฮซีซัน 118,800)", () => {
    const rf = pricingL.mod.roundFraction;
    for (const [n, d] of [[0, 2], [1, 2], [3, 2], [7, 2], [100_001, 13], [298_000, 3], [5, 0]] as [number, number][]) eq(roundRef(n, d), rf(n, d, "SATANG"), `round ${n}/${d}`);
    eq([bpsRef(2, 13), bpsRef(0, 13), bpsRef(3, 0), bpsRef(7, 7)], [1538, 0, 0, 10_000], "bps");
    ok(vatL.mod?.splitIncludedVat, "โหลด @/lib/money/vat ไม่ได้");
    for (const g of [0, 1, 99_000, 129_000, 149_000]) { const real = vatL.mod.splitIncludedVat(g, 700); eq([refVat(g).base, refVat(g).vat], [real.baseSatang, real.vatSatang], `vat ${g}`); }
    const bkk = quietL.mod.bkkYmd;
    for (const iso of ["2026-11-07T16:59:00Z", "2026-11-07T17:00:00Z", "2026-02-28T17:30:00Z", "2026-12-31T16:30:00Z"]) eq(refTzYmd("Asia/Bangkok", new Date(iso)), bkk(new Date(iso)), `bkk ${iso}`);
    eq([refTzYmd("Asia/Tokyo", new Date("2026-11-07T14:59:00Z")), refTzYmd("Asia/Tokyo", new Date("2026-11-07T15:00:00Z"))], ["2026-11-07", "2026-11-08"], "Tokyo");
    eq([refTzYmd("America/New_York", new Date("2026-11-07T04:59:00Z")), refTzYmd("America/New_York", new Date("2026-11-07T05:00:00Z"))], ["2026-11-06", "2026-11-07"], "New York EST");
    eq([refTzYmd("America/New_York", new Date("2026-07-01T03:59:00Z")), refTzYmd("America/New_York", new Date("2026-07-01T04:00:00Z"))], ["2026-06-30", "2026-07-01"], "New York EDT");
    eq([dowOf("2026-11-06"), dowOf("2026-11-07"), dowOf("2026-11-08")], [5, 6, 0], "dow");
    eq([refScenePrice("ดีลักซ์", "2026-11-14"), refScenePrice("ดีลักซ์", "2026-12-31"), refScenePrice("ดีลักซ์", "2026-11-09"), refScenePrice("ดีลักซ์", "2026-11-07"), refScenePrice("ซูพีเรีย", "2026-12-05")], [169_000, 199_000, 129_000, 149_000, 118_800], "scene price"); // 5 ธ.ค. = วันหยุดในไฮซีซัน +20% (ฟิกซ์เจอร์ h.1)
    eq(nightsOf("2026-12-30", "2027-01-02"), ["2026-12-30", "2026-12-31", "2027-01-01"], "nightsOf");
    eq(D, sqcAddDays(SQC_TODAY_BKK, -1), "D = วันนี้ไทย −1 ของฟิกซ์เจอร์");
  });

  // ═══════════════ ร้านชั่วคราว (POS + บัญชี · หน่วยหลาย timezone) ═══════════════
  console.log("\n── ตั้งร้านชั่วคราว svc-h7-* ──");
  const mkTenant = async (name: string) => { const r = await prisma.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC H7 ร้าน A");
  const tB = await mkTenant("QC H7 ร้าน B");
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, name: string, settings: Record<string, unknown> = {}) => (await prisma.businessUnit.create({ data: { tenantId, type: "HOTEL", name, slug: `u-${uid()}`, settings } })).id as string;
  const UH = await mkUnit(tA, "โรงแรมทดสอบ H7 (กรุงเทพ)");
  const UNY = await mkUnit(tA, "โรงแรม H7 นิวยอร์ก", { timezone: "America/New_York" });
  const UC = await mkUnit(tA, "โรงแรม H7 ไล่ปิดหลายวัน");
  const UCR1 = await mkUnit(tA, "โรงแรม H7 cron กรุงเทพ");
  const UCR2 = await mkUnit(tA, "โรงแรม H7 cron นิวยอร์ก", { timezone: "America/New_York" });
  const UFL = await mkUnit(tA, "โรงแรม H7 tx ล้ม");
  const UHB = await mkUnit(tB, "โรงแรมร้าน B H7");
  const ALL_A = [UH, UNY, UC, UCR1, UCR2, UFL];
  type TypeSpec = { name: string; base: number; cap: number };
  const SPEC: Record<string, TypeSpec> = { dlx: { name: "ดีลักซ์", base: 129_000, cap: 3 }, sup: { name: "ซูพีเรีย", base: 99_000, cap: 2 } };
  const CELL: Record<string, Cell> = { dlx: { weekday: 129_000, weekend: 149_000 }, sup: { weekday: 99_000, weekend: 99_000 } };
  const mkType = async (tenantId: string, unitId: string, s: TypeSpec) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: s.name, rentMode: "NIGHTLY", baseRateSatang: s.base, capacity: s.cap, baseOccupancy: 2, maxOccupancy: s.cap } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string, extra: Record<string, unknown> = {}) => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, hkStatus: "CLEAN", ...extra } })).id as string;
  const RTA: Record<string, string> = {};
  for (const [k, s] of Object.entries(SPEC)) RTA[k] = await mkType(tA, UH, s);
  const ROOM: Record<string, string> = {};
  for (let i = 1; i <= 6; i++) { const n = `DLX${String(i).padStart(2, "0")}`; ROOM[n] = await mkRoom(tA, UH, n, RTA.dlx); }
  for (const n of ["SUP01", "SUP02"]) ROOM[n] = await mkRoom(tA, UH, n, RTA.sup);
  ROOM.MON01 = await mkRoom(tA, UH, "MON01", RTA.dlx, { rentMode: "MONTHLY" }); // รายเดือน — ไม่นับ roomsTotal
  ROOM.OLD01 = await mkRoom(tA, UH, "OLD01", RTA.dlx, { active: false }); // ปิดใช้ — ไม่นับ
  const TOTAL_UH = 8;
  const RT: Record<string, string> = {}; // ประเภทดีลักซ์ของหน่วยอื่น
  for (const u of [UNY, UC, UCR1, UCR2, UFL]) { RT[u] = await mkType(tA, u, SPEC.dlx); await mkRoom(tA, u, "E01", RT[u]); await mkRoom(tA, u, "E02", RT[u]); }
  RT[UHB] = await mkType(tB, UHB, SPEC.dlx);
  await mkRoom(tB, UHB, "B01", RT[UHB]);
  // POS ระบบเดียวของร้าน A ผูกทุกหน่วย · บัญชีผูก POS (VAT 7%) — เงินริบมัดจำต้องลง GL
  const POS_A = (await sysL.mod.createSystem(tA, "POS", "POS ร้าน A H7")).id as string;
  for (const u of ALL_A) await sysL.mod.linkUnit(tA, POS_A, u);
  const ACC_A = (await sysL.mod.createSystem(tA, "ACCOUNT", "บัญชี A H7")).id as string;
  await accSvcL.mod.saveSettings(tA, ACC_A, { orgName: "โรงแรม H7 จำกัด", taxId: "0105561177639", vatRegistered: true, vatRateBp: 700 } as never);
  await glL.mod.ensureAccounting({ tenantId: tA, systemId: ACC_A });
  await prisma.accountSystemLink.create({ data: { tenantId: tA, systemId: ACC_A, linkedKind: "POS", linkedId: POS_A } });
  const POS_B = (await sysL.mod.createSystem(tB, "POS", "POS ร้าน B H7")).id as string;
  await sysL.mod.linkUnit(tB, POS_B, UHB);
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-h7-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@shark.local`, name: `QC h7 ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MGR = await mkMember("mgr", tA, "MANAGER", ALL_A, { "hotel.audit.run": true, "hotel.reports.read": true });
  const FD_PERMS = { "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.booking.manage": true, "hotel.reservation.checkIn": true, "hotel.rates.read": true, "hotel.folio.post": true, "hotel.reservation.checkOut": true, "hotel.guest.register": true }; // = ฟิกซ์เจอร์ frontdesk (ไม่มี audit.run/reports.read)
  const FRONT = await mkMember("front", tA, "STAFF", ALL_A, FD_PERMS);
  const MAID = await mkMember("maid", tA, "STAFF", ALL_A, { "hotel.housekeeping": true });
  const NONE = await mkMember("none", tA, "STAFF", ALL_A, { "hotel.rates.read": true });
  const AUDITOR = await mkMember("auditor", tA, "STAFF", ALL_A, { "hotel.audit.run": true });
  const READER = await mkMember("reader", tA, "STAFF", ALL_A, { "hotel.reports.read": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const ids: Record<string, string> = {};
  const rowsFor = (cells: Record<string, Cell>, rt: Record<string, string>) => Object.entries(cells).map(([k, c]) => ({ roomTypeId: rt[k], seasonId: null, priceWeekdaySatang: c.weekday, priceWeekendSatang: c.weekend, priceHolidaySatang: null }));
  let SETUP_OK = false;
  let SETUP_WHY = "";
  const setUnit = async (key: string, value: unknown, unitId = UH, actor: Actor = OWNER, ctx: Record<string, unknown> = ctxA) => okRes(await SET.setSettings(actor, ctx, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  const trySet = async (key: string, value: unknown, unitId = UH) => { try { await setUnit(key, value, unitId); return true; } catch { return false; } };
  const resetUnit = async (key: string, unitId = UH) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: unitId }); } catch { /* ไม่มีค่า */ } };
  try {
    for (const u of ALL_A) {
      okRes(await RT_("listRatePlans")(OWNER, ctxA, { unitId: u }), `list ${u}`);
      const std = await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: u, code: "STANDARD" } });
      ok(std, `ไม่มีแผน STANDARD ${u}`);
      ids[`std:${u}`] = std.id;
      okRes(await RT_("saveRates")(OWNER, ctxA, { unitId: u, ratePlanId: std.id, rows: u === UH ? rowsFor(CELL, RTA) : [{ roomTypeId: RT[u], seasonId: null, priceWeekdaySatang: CELL.dlx.weekday, priceWeekendSatang: CELL.dlx.weekend, priceHolidaySatang: null }] }), `saveRates ${u}`);
    }
    ids.std = ids[`std:${UH}`];
    okRes(await RT_("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "BIGDEP", name: "มัดจำก้อนใหญ่", depositKind: "FIXED_AMOUNT", depositValue: 300_000, visibility: ["COUNTER", "OTA"] }), "BIGDEP");
    ids.bigdep = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "BIGDEP" } }))!.id;
    okRes(await RT_("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.bigdep, rows: rowsFor(CELL, RTA) }), "saveRates BIGDEP");
    okRes(await RT_("listRatePlans")(OWNER_B, ctxB, { unitId: UHB }), "list B");
    ids.stdB = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tB, unitId: UHB, code: "STANDARD" } }))!.id;
    okRes(await RT_("saveRates")(OWNER_B, ctxB, { unitId: UHB, ratePlanId: ids.stdB, rows: [{ roomTypeId: RT[UHB], seasonId: null, priceWeekdaySatang: 129_000, priceWeekendSatang: 149_000, priceHolidaySatang: null }] }), "saveRates B");
    // H.4 (ถ้า merge): checkIn เดิมต้องมีผู้พักเมื่อ requireRegistration เปิด — ปิดที่หน่วยทดสอบ (ไม่มีคีย์ = ข้าม)
    for (const u of ALL_A) await trySet("rooms.hotel.guest.requireRegistration", false, u);
    SETUP_OK = true;
  } catch (e) { SETUP_WHY = `ตั้งร้านชั่วคราวไม่สำเร็จ (H.1): ${errMsg(e)}`; console.log(`  ❌ ${SETUP_WHY}`); }
  const needSetup = () => ok(SETUP_OK, SETUP_WHY);
  const GUEST = { name: "ผู้เข้าพักทดสอบ h7", phone: "0891234567", email: "svc-h7-guest@qc.invalid" };
  const PII_TEXT = /ผู้เข้าพักทดสอบ|0891234567|svc-h7-guest/;

  // ── ตัวช่วยอ่านฐาน ──
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const nightsOfRv = (id: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: id }, orderBy: { date: "asc" } }) as Promise<Any[]>;
  const folioOf = (id: string) => prisma.hotelFolio.findUnique({ where: { reservationId: id } }) as Promise<Any>;
  const itemsOf = async (id: string, type?: string) => (await prisma.hotelFolioItem.findMany({ where: { folio: { reservationId: id }, ...(type ? { type } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[];
  const liveItems = (items: Any[]) => items.filter((i) => !i.voidedAt);
  const roomItemsOn = (unitId: string, ymd: string) => prisma.hotelFolioItem.findMany({ where: { tenantId: tA, unitId, type: "ROOM", businessDate: dbDate(ymd) } }) as Promise<Any[]>;
  const auditRow = (unitId: string, ymd: string) => prisma.hotelNightAudit.findFirst({ where: { unitId, businessDate: dbDate(ymd) } }) as Promise<Any>;
  const auditRows = (unitId: string) => prisma.hotelNightAudit.findMany({ where: { unitId }, orderBy: { businessDate: "asc" } }) as Promise<Any[]>;
  const eventsOf = async (type: string, pred?: (p: Any) => boolean, tid = tA) => ((await prisma.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => !pred || pred(e.payload ?? {}));
  const auditsOf = (pattern: RegExp, tid = tA) => prisma.auditLog.findMany({ where: { tenantId: tid }, orderBy: { createdAt: "asc" } }).then((rows: Any[]) => rows.filter((r) => pattern.test(String(r.action))));
  const depositOfRv = async (rv: Any) => (rv?.depositSaleId ? prisma.posDeposit.findUnique({ where: { receiptSaleId: rv.depositSaleId } }) : null) as Promise<Any>;
  const forfeitSalesOf = async (rv: Any) => { const d = await depositOfRv(rv); return d ? ((await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `dep-forfeit:${d.id}` }, status: "PAID" } })) as Any[]) : []; };
  const drain = async () => { const w = consumersL.mod; ok(w?.drainAll, "ไม่มี drainAll"); for (let i = 0; i < 3; i++) await w.drainAll(); };
  type Line = { code: string; debit: number; credit: number; refId: string; entryId: string };
  const glLines = async (refIds?: string[], systemId = ACC_A): Promise<Line[]> => {
    const es = (await prisma.accountJournalEntry.findMany({ where: { systemId, refType: "PosSale", ...(refIds ? { refId: { in: refIds } } : {}) }, include: { lines: { include: { account: { select: { code: true } } } } } })) as Any[];
    return es.flatMap((e) => e.lines.map((l: Any) => ({ code: l.account.code, debit: l.debit, credit: l.credit, refId: e.refId, entryId: e.id })));
  };
  const net = (ls: Line[], code: string) => sum(ls.filter((l) => l.code === code).map((l) => l.credit - l.debit));
  const dr = (ls: Line[], code: string) => sum(ls.filter((l) => l.code === code).map((l) => l.debit));
  const balanced = (ls: Line[]) => sum(ls.map((l) => l.debit)) === sum(ls.map((l) => l.credit)) && ls.length > 0;
  /** KPI อ้างอิง (ใบ §2.1) คำนวณจากแถวฐานของหน่วย ณ วัน ymd */
  const refKpi = async (unitId: string, ymd: string) => {
    const rooms = (await prisma.hotelRoom.findMany({ where: { tenantId: tA, unitId, active: true }, include: { roomType: { select: { rentMode: true } } } })) as Any[];
    const sellable = rooms.filter((r) => ["NIGHTLY", "BOTH"].includes(r.rentMode ?? r.roomType.rentMode));
    const blocks = (await prisma.roomOccupancy.findMany({ where: { tenantId: tA, unitId, kind: "BLOCK", active: true, startDate: { lte: dbDate(ymd) }, endDate: { gt: dbDate(ymd) } }, select: { roomId: true } })) as Any[];
    const ooo = new Set(blocks.map((b) => b.roomId).filter((id) => sellable.some((r) => r.id === id))).size;
    const nights = (await prisma.hotelBookingNight.findMany({ where: { tenantId: tA, unitId, date: dbDate(ymd), counted: true }, include: { reservation: { select: { status: true } } } })) as Any[];
    const occNights = nights.filter((n) => ["CHECKED_IN", "CHECKED_OUT"].includes(n.reservation.status));
    const occupied = new Set(occNights.map((n) => n.roomId ?? n.id)).size;
    const roomItems = liveItems(await roomItemsOn(unitId, ymd));
    const revenue = sum(roomItems.map((i) => i.amountSatang));
    const total = sellable.length, available = total - ooo;
    const rvs = (await prisma.hotelReservation.findMany({ where: { tenantId: tA, unitId } })) as Any[];
    const arrivals = rvs.filter((r) => ymdOfDb(r.checkInDate) === ymd && ["CHECKED_IN", "CHECKED_OUT"].includes(r.status)).length;
    const departures = rvs.filter((r) => ymdOfDb(r.checkOutDate) === ymd && r.status === "CHECKED_OUT").length;
    const noShowCount = rvs.filter((r) => ymdOfDb(r.checkInDate) === ymd && r.status === "NO_SHOW").length;
    const cancelledCount = rvs.filter((r) => r.status === "CANCELLED" && r.cancelledAt && refTzYmd("Asia/Bangkok", r.cancelledAt) === ymd).length;
    return { roomsTotal: total, roomsOOO: ooo, roomsAvailable: available, roomsOccupied: occupied, occupancyBps: bpsRef(occupied, available), roomRevenueSatang: revenue, adrSatang: roundRef(revenue, occupied), revparSatang: roundRef(revenue, available), arrivals, departures, noShowCount, cancelledCount };
  };
  const kpiCore = (k: Any) => ({ roomsTotal: k.roomsTotal, roomsOOO: k.roomsOOO, roomsAvailable: k.roomsAvailable, roomsOccupied: k.roomsOccupied, occupancyBps: k.occupancyBps, roomRevenueSatang: k.roomRevenueSatang, adrSatang: k.adrSatang, revparSatang: k.revparSatang });

  // ── ตัวช่วยเรียกใบ ──
  type Over = Record<string, unknown>;
  const withClock = async <T,>(fn: () => Promise<T>): Promise<T> => { const prev = process.env.SVC_QC_CLOCK; process.env.SVC_QC_CLOCK = "1"; try { return await fn(); } finally { if (prev === undefined) delete process.env.SVC_QC_CLOCK; else process.env.SVC_QC_CLOCK = prev; } };
  const book = (actor: Actor | null, over: Over, unitId = UH, ctx: Record<string, unknown> = ctxA) => BK("createBooking")(actor, ctx, { unitId, rooms: [{ roomTypeId: unitId === UH ? RTA.dlx : RT[unitId], adults: 2, children: 0 }], ratePlanId: ids[`std:${unitId}`] ?? ids.stdB, source: "PHONE", guest: GUEST, checkIn: W(0), checkOut: W(2), ...over });
  /** จองย้อนหลังด้วย `at` (SVC_QC_CLOCK) = วันเช็กอิน 03:00Z (10:00 ไทย) */
  const bookAt = async (over: Over & { checkIn: string }, unitId = UH, actor: Actor = FRONT) => withClock(async () => okRes(await book(actor, { at: `${over.checkIn}T03:00:00.000Z`, ...over }, unitId), `createBooking ${over.checkIn}`));
  const deposit = async (id: string, unitId = UH) => okRes(await BK("takeBookingDeposit")(FRONT, ctxA, { unitId, reservationId: id, payType: "PROMPTPAY" }), "takeBookingDeposit");
  const checkInSvc = async (unitId: string, id: string) => {
    const occ = await prisma.roomOccupancy.findFirst({ where: { tenantId: tA, unitId, refType: "HotelReservation", refId: id, active: true }, select: { roomId: true } });
    const roomId = (await rvOf(id))?.roomId ?? occ?.roomId;
    ok(roomId, "การจองไม่มีห้องให้เช็กอิน");
    okRes(await fnOf(serviceL, "checkIn", F.service)(tA, unitId, id, roomId), "checkIn");
    return roomId as string;
  };
  /** จอง (at = วันเข้า) → มัดจำ (ถ้าขอ) → เช็กอิน ⇒ CHECKED_IN */
  const inhouse = async (o: { checkIn: string; nights: number; unitId?: string; typeKey?: "dlx" | "sup"; deposit?: boolean; source?: string; plan?: string; channelRef?: string }) => {
    needSetup();
    const unitId = o.unitId ?? UH;
    const r = await bookAt({ checkIn: o.checkIn, checkOut: addDays(o.checkIn, o.nights), rooms: [{ roomTypeId: unitId === UH ? RTA[o.typeKey ?? "dlx"] : RT[unitId], adults: 2, children: 0 }], source: o.source ?? "PHONE", ...(o.plan ? { ratePlanId: o.plan } : {}), ...(o.channelRef ? { channelRef: o.channelRef } : {}) }, unitId);
    const id = r.reservations[0].id as string;
    if (o.deposit) await deposit(id, unitId);
    const roomId = await checkInSvc(unitId, id);
    return { id, code: r.reservations[0].code as string, roomId };
  };
  const preview = (actor: Actor | null, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => NA("auditPreview")(actor, ctx, { unitId: UH, ...over }));
  const close = (actor: Actor | null, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => NA("closeNightAudit")(actor, ctx, { unitId: UH, businessDate: D, ...over }));
  const reopen = (actor: Actor | null, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => NA("reopenNightAudit")(actor, ctx, { reason: "ตรวจพบรายการค้าง", ...over }));
  const history = (over: Over, ctx: Record<string, unknown> = ctxA) => call(() => NA("auditHistory")(ctx, { unitId: UH, from: W(-10), to: W(1), ...over }));
  const rctx = (a: Actor, tid = tA) => ({ tenantId: tid, actorUserId: a.userId });
  const report = (name: string, actor: Actor, over: Over, tid = tA) => call(() => RP(name)(rctx(actor, tid), { unitId: UH, from: W(-1), to: W(0), ...over }));
  const PRICE = { dlx: (d: string) => refNightPrice(CELL.dlx, d), sup: (d: string) => refNightPrice(CELL.sup, d) };

  // ═══════════════ ฉากร้านชั่วคราว (UH · D = เมื่อวาน) ═══════════════
  console.log("\n── ฉากร้านชั่วคราว (UH) ──");
  const S: Record<string, { id: string; code: string; roomId: string }> = {};
  let SCENE_OK = false;
  let SCENE_WHY = "";
  try {
    needSetup();
    // BLOCK DLX06 [D, T0+2) ก่อนจอง ⇒ OOO บน D และวันนี้ = 1
    okRes(await fnOf(blockL, "blockRoom", F.block)(OWNER, ctxA, { unitId: UH, roomId: ROOM.DLX06, from: D, to: W(2), reason: "ทาสีห้อง (QC h7)" }), "blockRoom");
    S.A = await inhouse({ checkIn: W(-2), nights: 3, deposit: true, source: "PHONE" }); // ดีลักซ์ D−1..D+1 · พักต่อข้าม D
    S.B = await inhouse({ checkIn: D, nights: 2, deposit: true, typeKey: "sup", source: "WALK_IN" }); // ซูพีเรีย D..D+1
    S.H = await inhouse({ checkIn: W(-2), nights: 2, deposit: false, source: "OTA", channelRef: "QC-H7-OTA", plan: ids.bigdep }); // ดีลักซ์ D−1..D · ออกวันนี้
    // H: โพสต์ค่าห้องล่วงหน้าถึงวันนี้ (คืน D−1 และ D) แล้ว void คืน D ⇒ audit ต้องไม่โพสต์ซ้ำ · รายได้ D ไม่นับ H
    const p = okRes(await call(() => FO("postRoomNights")(ctxA, { reservationId: S.H.id, upToDate: T0 })), "postRoomNights H");
    eq(p.posted, 2, "H posted 2");
    const hRoomD = (await itemsOf(S.H.id, "ROOM")).find((i) => ymdOfDb(i.businessDate) === D);
    ok(hRoomD, "ไม่มี ROOM คืน D ของ H");
    okRes(await call(() => FO("voidFolioItem")(MGR, ctxA, { itemId: hRoomD.id, reason: "ลดราคาให้แขก (QC h7)" })), "void ROOM H");
    const c = await bookAt({ checkIn: D, checkOut: W(0) }); S.C = { id: c.reservations[0].id, code: c.reservations[0].code, roomId: "" }; await deposit(S.C.id); // no-show มีมัดจำ
    const e = await bookAt({ checkIn: D, checkOut: W(0), rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }] }); S.E = { id: e.reservations[0].id, code: e.reservations[0].code, roomId: "" }; // no-show ไม่มีมัดจำ
    const g = await withClock(async () => okRes(await book(FRONT, { checkIn: D, checkOut: W(0), hold: "COUNTER", at: `${D}T16:30:00.000Z` }), "HOLD COUNTER")); S.G = { id: g.reservations[0].id, code: g.reservations[0].code, roomId: "" };
    eq(g.reservations[0].status, "HOLD", "G ต้องเป็น HOLD");
    const f = okRes(await book(FRONT, { checkIn: W(5), checkOut: W(7) }), "F อนาคต"); S.F = { id: f.reservations[0].id, code: f.reservations[0].code, roomId: "" }; // CONFIRMED มัดจำค้าง
    const f2 = okRes(await book(FRONT, { checkIn: W(10), checkOut: W(11), rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }] }), "F2"); S.F2 = { id: f2.reservations[0].id, code: f2.reservations[0].code, roomId: "" };
    okRes(await BK("cancelBooking")(FRONT, ctxA, { unitId: UH, reservationId: S.F2.id, reason: "ลูกค้าขอยกเลิก" }), "cancel F2");
    const i = okRes(await book(FRONT, { checkIn: W(0), checkOut: W(1) }), "I วันนี้"); S.I = { id: i.reservations[0].id, code: i.reservations[0].code, roomId: "" }; await deposit(S.I.id); // arrivalsToday 1
    // หน่วยอื่น
    S.NY = await inhouse({ checkIn: W(-2), nights: 2, unitId: UNY }); // คืน D−1, D
    const ca = await bookAt({ checkIn: W(-3), checkOut: W(-2) }, UC); S.CA = { id: ca.reservations[0].id, code: ca.reservations[0].code, roomId: "" }; await deposit(S.CA.id, UC); // no-show D−2 ในหน่วยไล่ปิด
    S.CR1 = await inhouse({ checkIn: D, nights: 1, unitId: UCR1 });
    S.CR2 = await inhouse({ checkIn: W(-2), nights: 2, unitId: UCR2 });
    S.FL1 = await inhouse({ checkIn: D, nights: 1, unitId: UFL });
    const fl2 = await bookAt({ checkIn: D, checkOut: W(0) }, UFL); S.FL2 = { id: fl2.reservations[0].id, code: fl2.reservations[0].code, roomId: "" }; await deposit(S.FL2.id, UFL);
    // ค่าตั้งหน่วย cron (ไม่มี def = ข้าม — U-9 จับ)
    await trySet("rooms.hotel.nightAuditTime", "03:00", UCR1); await trySet("rooms.hotel.audit.autoClose", true, UCR1);
    await trySet("rooms.hotel.nightAuditTime", "23:00", UCR2); await trySet("rooms.hotel.audit.autoClose", true, UCR2);
    await trySet("rooms.hotel.audit.autoClose", false, UH); await trySet("rooms.hotel.audit.autoClose", false, UNY); await trySet("rooms.hotel.audit.autoClose", false, UC); await trySet("rooms.hotel.audit.autoClose", false, UFL);
    // log แม่บ้าน (รายงาน): D 2 ห้องโดย MAID · D−1 1 ห้องโดย OWNER
    for (const [room, by, day] of [[ROOM.DLX01, MAID.userId, D], [ROOM.DLX02, MAID.userId, D], [ROOM.DLX03, OWNER.userId, W(-2)]] as [string, string, string][]) await prisma.hotelHousekeepingLog.create({ data: { tenantId: tA, unitId: UH, roomId: room, fromStatus: "DIRTY", toStatus: "CLEAN", byUserId: by, createdAt: new Date(`${day}T04:00:00.000Z`) } });
    SCENE_OK = true;
    console.log(`  (ฉาก: A ${S.A.code} · B ${S.B.code} · H ${S.H.code} void คืน D · C ${S.C.code} · E ${S.E.code} · G HOLD · F · F2 ยกเลิก · I วันนี้ · UNY/UC/UCR1/UCR2/UFL)`);
  } catch (e) { SCENE_WHY = `สร้างฉากร้านชั่วคราวไม่สำเร็จ: ${e instanceof AssertFail ? e.message : errMsg(e)}`; console.log(`  ❌ ${SCENE_WHY}`); }
  const needScene = () => ok(SCENE_OK, SCENE_WHY);
  const EXP = { revD: PRICE.dlx(D) + PRICE.sup(D), occD: 3, availD: TOTAL_UH - 1 };

  // ═══════════════ BD business-date.ts (pure) ═══════════════
  console.log("\n── BD business date (pure · timezone) ──");
  await st("BD-1", "businessDateOf(unitTz, now): Asia/Bangkok = bkkYmd ทุกจุด (16:59Z/17:00Z ข้ามวัน · ปลายเดือน/ปี) · tz ว่าง/undefined ⇒ Bangkok · now ไม่ส่ง ⇒ วันนี้ไทย", () => {
    needBd();
    const f = BD("businessDateOf");
    for (const iso of ["2026-11-07T16:59:00Z", "2026-11-07T17:00:00Z", "2026-02-28T17:30:00Z", "2026-12-31T16:30:00Z", "2026-12-31T17:00:00Z"]) eq(f("Asia/Bangkok", new Date(iso)), refTzYmd("Asia/Bangkok", new Date(iso)), `bkk ${iso}`);
    eq([f(undefined, new Date("2026-11-07T17:00:00Z")), f("", new Date("2026-11-07T17:00:00Z")), f(null, new Date("2026-11-07T17:00:00Z"))], ["2026-11-08", "2026-11-08", "2026-11-08"], "tz ว่าง = Bangkok");
    eq(f("Asia/Bangkok"), T0, "ไม่ส่ง now");
  });
  await st("BD-2", "timezone อื่นผ่าน Intl: Asia/Tokyo 14:59Z/15:00Z · America/New_York EST 04:59Z/05:00Z (7 พ.ย. 2026) · EDT 03:59Z/04:00Z (1 ก.ค. 2026) · Pacific/Auckland · tz ผิด (\"Mars/Olympus\") ⇒ ไม่ throw (ถอยเป็น Bangkok)", () => {
    needBd();
    const f = BD("businessDateOf");
    const cases: [string, string][] = [["Asia/Tokyo", "2026-11-07T14:59:00Z"], ["Asia/Tokyo", "2026-11-07T15:00:00Z"], ["America/New_York", "2026-11-07T04:59:00Z"], ["America/New_York", "2026-11-07T05:00:00Z"], ["America/New_York", "2026-07-01T03:59:00Z"], ["America/New_York", "2026-07-01T04:00:00Z"], ["Pacific/Auckland", "2026-11-07T10:59:00Z"], ["Pacific/Auckland", "2026-11-07T11:00:00Z"]];
    for (const [tz, iso] of cases) eq(f(tz, new Date(iso)), refTzYmd(tz, new Date(iso)), `${tz} ${iso}`);
    let bad: string | null = null;
    try { bad = f("Mars/Olympus", new Date("2026-11-07T17:00:00Z")); } catch (e) { throw new AssertFail(`tz ผิด throw: ${errMsg(e)}`); }
    eq(bad, "2026-11-08", "tz ผิดถอยเป็น Bangkok");
  }, "MAJOR");
  await st("BD-3", "nextBusinessDate(lastClosed): 2026-02-28 → 03-01 · 2026-12-31 → 2027-01-01 · 2028-02-28 → 02-29 (อธิกสุรทิน) · รับ Date จาก @db.Date ได้ (เที่ยงคืน UTC) · pure ไม่ใช้ getDate/getDay ดิบ", () => {
    needBd();
    const f = BD("nextBusinessDate");
    eq([f("2026-02-28"), f("2026-12-31"), f("2028-02-28"), f("2026-11-06")], ["2026-03-01", "2027-01-01", "2028-02-29", "2026-11-07"], "ymd");
    eq(f(new Date("2026-12-31T00:00:00.000Z")), "2027-01-01", "Date");
    const src = stripComments(read(F.bd));
    ok(!/\.getDay\(\)|\.getDate\(\)|\.getMonth\(\)|\.getFullYear\(\)/.test(src), "ใช้ getDay/getDate/getMonth/getFullYear ดิบ (ต้อง Intl/UTC)");
    ok(/Intl\.DateTimeFormat|formatToParts/.test(src), "ไม่ใช้ Intl");
  });
  await st("BD-4", "isAuditDue(unitTz, auditTime, now, lastClosed): Bangkok \"03:00\" lastClosed D−2 ⇒ now วันนี้ 02:59 ไทย false · 03:00 true · 03:00 เมื่อวาน (วัน D ยังไม่ถึงเวลาปิด แต่ D−1 ค้าง) true · lastClosed D (เมื่อวาน) ⇒ now วันนี้ 03:30 false (วันถัดไป = วันนี้ ปิดไม่ได้) · lastClosed null (ไม่เคยปิด) ⇒ หลัง 03:00 true · ก่อน 03:00 false · auditTime \"23:30\" ⇒ 23:29 false 23:30 true", () => {
    needBd();
    const f = BD("isAuditDue");
    const at = (ymd: string, hm: string, offsetH = 7) => { const [h, m] = hm.split(":").map(Number); return new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), h - offsetH, m)); };
    eq([f("Asia/Bangkok", "03:00", at(T0, "02:59"), W(-2)), f("Asia/Bangkok", "03:00", at(T0, "03:00"), W(-2)), f("Asia/Bangkok", "03:00", at(D, "03:00"), W(-2))], [false, true, true], "D−2");
    eq([f("Asia/Bangkok", "03:00", at(T0, "03:30"), D), f("Asia/Bangkok", "03:00", at(T0, "23:59"), D)], [false, false], "ปิดแล้วถึงเมื่อวาน");
    eq([f("Asia/Bangkok", "03:00", at(T0, "03:00"), null), f("Asia/Bangkok", "03:00", at(T0, "02:59"), null)], [true, false], "ไม่เคยปิด");
    eq([f("Asia/Bangkok", "23:30", at(T0, "23:29"), W(-2)), f("Asia/Bangkok", "23:30", at(T0, "23:30"), W(-2))], [false, true], "23:30");
  });
  await st("BD-5", "isAuditDue ต่าง timezone: Tokyo \"03:00\" lastClosed 2026-11-05 ⇒ now 2026-11-06T17:59Z (02:59 JST 7 พ.ย.) false · 18:00Z (03:00 JST) true · lastClosed 2026-11-06 + 03:00 JST 7 พ.ย. false (7 พ.ย. = วันนี้ JST) · New_York \"03:00\" lastClosed 2026-11-05 ⇒ 2026-11-07T07:59Z (02:59 EST) false · 08:00Z true · lastClosed 2026-11-06 + 08:00Z false", () => {
    needBd();
    const f = BD("isAuditDue");
    eq([f("Asia/Tokyo", "03:00", new Date("2026-11-06T17:59:00Z"), "2026-11-05"), f("Asia/Tokyo", "03:00", new Date("2026-11-06T18:00:00Z"), "2026-11-05"), f("Asia/Tokyo", "03:00", new Date("2026-11-06T18:00:00Z"), "2026-11-06")], [false, true, false], "Tokyo");
    eq([f("America/New_York", "03:00", new Date("2026-11-07T07:59:00Z"), "2026-11-05"), f("America/New_York", "03:00", new Date("2026-11-07T08:00:00Z"), "2026-11-05"), f("America/New_York", "03:00", new Date("2026-11-07T08:00:00Z"), "2026-11-06")], [false, true, false], "New York");
  });
  await st("BD-6", "business-date.ts pure (§1): ไม่ import prisma/@/lib/core/db/@prisma · ไม่มี \"use server\" · import ได้เฉพาะ pure (rooms/occupancy toYmd/ymdToDb · pricing · quiet-hours) · export ครบ businessDateOf/nextBusinessDate/isAuditDue · service.ts todayBkk/parseDate เรียก business-date (import ./business-date) และพฤติกรรม Bangkok เดิม (todayBkk() = วันนี้ไทย · parseDate(\"2026-11-07\") = เที่ยงคืน UTC)", () => {
    needBd();
    const src = read(F.bd);
    const specs = importSpecs(src).filter((i) => !i.typeOnly).map((i) => i.spec);
    eq(specs.filter((sp) => /prisma|core\/db|@\/lib\/modules\/(hotel\/(booking|folio|service|rates|night-audit|reports)|pos|account)/.test(sp)), [], "import ไม่ pure");
    ok(!/["']use (server|client)["']/.test(stripComments(src)), "มี directive");
    eq(["businessDateOf", "nextBusinessDate", "isAuditDue"].filter((n) => typeof bdL.mod[n] !== "function"), [], "export ขาด");
    const svc = stripComments(read(F.service));
    ok(/from\s*["']\.\/business-date["']|from\s*["']@\/lib\/modules\/hotel\/business-date["']/.test(svc), "service.ts ไม่ import business-date");
    eq(serviceL.mod.todayBkk(), T0, "todayBkk");
    eq(serviceL.mod.parseDate("2026-11-07").toISOString(), "2026-11-07T00:00:00.000Z", "parseDate");
  });

  // ═══════════════ NA ปิดวัน 6 ขั้น ═══════════════
  console.log("\n── NA ปิดวัน (closeNightAudit · ร้านชั่วคราว UH · D = เมื่อวาน) ──");
  const CLOSED = { auditId: "", kpi: null as Any };
  await st("NA-1", "auditPreview(manager, {unitId UH}) ไม่ส่ง businessDate ⇒ businessDate = D (ไม่เคยปิด = เมื่อวาน) · noShows = [C (มีมัดจำ depositSatang = ราคาคืน D ดีลักซ์ · policy FORFEIT_RELEASE_AFTER_AUDIT), E (มัดจำ 0)] มี reservationId/code ไม่มีชื่อ/เบอร์ · ไม่รวม G (HOLD) · roomNightsToPost 2 (A · B — ไม่นับ H ที่โพสต์แล้ว/void · ไม่นับ CONFIRMED) · revenueSatang = ราคาคืน D ดีลักซ์+ซูพีเรีย · kpi.roomsTotal 8 · OOO 1 · available 7 · occupied 3 · stayoversToDirty number · warnings [] · ไม่เขียนฐาน (ROOM/audit/สถานะเท่าเดิม)", async () => {
    needNa(); needScene();
    const n0 = [await prisma.hotelFolioItem.count({ where: { unitId: UH } }), await prisma.hotelNightAudit.count({ where: { unitId: UH } }), (await rvOf(S.C.id)).status];
    const r = okRes(await preview(MGR, {}), "auditPreview");
    eq(r.businessDate, D, "businessDate");
    ok(Array.isArray(r.noShows), "noShows ไม่ใช่ array");
    const ns = [...r.noShows].sort((a: Any, b: Any) => String(a.reservationId).localeCompare(String(b.reservationId)));
    eq(ns.map((x: Any) => x.reservationId).sort(), [S.C.id, S.E.id].sort(), "noShows id");
    const c = ns.find((x: Any) => x.reservationId === S.C.id), e = ns.find((x: Any) => x.reservationId === S.E.id);
    eq([c.code, c.depositSatang, c.policy, e.depositSatang], [S.C.code, PRICE.dlx(D), "FORFEIT_RELEASE_AFTER_AUDIT", 0], "no-show DTO");
    eq([r.roomNightsToPost, r.revenueSatang], [2, EXP.revD], "post/revenue");
    eq(kpiCore(r.kpi), { roomsTotal: TOTAL_UH, roomsOOO: 1, roomsAvailable: EXP.availD, roomsOccupied: EXP.occD, occupancyBps: bpsRef(EXP.occD, EXP.availD), roomRevenueSatang: EXP.revD, adrSatang: roundRef(EXP.revD, EXP.occD), revparSatang: roundRef(EXP.revD, EXP.availD) }, "kpi");
    ok(typeof r.stayoversToDirty === "number" && Array.isArray(r.warnings), "stayoversToDirty/warnings");
    ok(!PII_TEXT.test(J(r)) && ![...walkKeys(r)].some((k) => PII_KEY.test(k)), "PII ใน preview");
    eq([await prisma.hotelFolioItem.count({ where: { unitId: UH } }), await prisma.hotelNightAudit.count({ where: { unitId: UH } }), (await rvOf(S.C.id)).status], n0, "preview เขียนฐาน");
  });
  await st("NA-2", "closeNightAudit(manager, {UH, D}) ⇒ {ok, auditId, kpi, warnings} · แถว HotelNightAudit status CLOSED closedById = manager · KPI ทุกตัวตรงคำนวณมือจากแถว (total 8 · OOO 1 · available 7 · occupied 3 [A B H] · bps 4285 · revenue = A(D)+B(D) net void · ADR = revenue÷3 · RevPAR = revenue÷7 ปัด SATANG) · arrivals 1 (B) · departures 0 · noShowCount 2 · cancelledCount 0 · snapshot {bySource, byRoomType, warnings[], version 1} · kpi ที่คืน = แถว", async () => {
    needNa(); needScene();
    const r = okRes(await close(MGR, {}), "closeNightAudit");
    ok(typeof r.auditId === "string" && r.auditId, "auditId");
    CLOSED.auditId = r.auditId; CLOSED.kpi = r.kpi;
    const row = await auditRow(UH, D);
    ok(row && row.id === r.auditId, "ไม่มีแถว HotelNightAudit ของ D / id ไม่ตรง");
    eq([row.status, row.closedById, row.tenantId], ["CLOSED", MGR.userId, tA], "แถว");
    const ref = await refKpi(UH, D);
    eq(kpiOfRow(row), kpiCore(ref), "KPI");
    eq(kpiOfRow(row), { roomsTotal: TOTAL_UH, roomsOOO: 1, roomsAvailable: EXP.availD, roomsOccupied: EXP.occD, occupancyBps: 4285, roomRevenueSatang: EXP.revD, adrSatang: roundRef(EXP.revD, 3), revparSatang: roundRef(EXP.revD, 7) }, "KPI ตัวเลขคาด");
    eq([row.noShowCount, row.departures, row.cancelledCount], [2, 0, 0], "no-show/departures/cancelled");
    eq(row.arrivals, ref.arrivals, "arrivals (= เข้าพักจริงวัน D)");
    const snap = row.snapshot ?? {};
    ok(snap && typeof snap.bySource === "object" && typeof snap.byRoomType === "object" && Array.isArray(snap.warnings) && snap.version === 1, `snapshot ${J(snap).slice(0, 200)}`);
    ok(Array.isArray(r.warnings), "warnings");
    eq(kpiCore(r.kpi), kpiOfRow(row), "kpi ที่คืน");
  });
  await st("NA-3", "ขั้น 1 no-show (H.3 markNoShow + เงินผ่าน POS): C ⇒ NO_SHOW noShowAt · nights counted false · occupancy inactive · บิลริบ dep-forfeit: PAID = มัดจำ (1 ใบ · sourceModule HOTEL) · folio C = VOID ตาม H.3 releaseStayTx (มติ §9.1 · ไม่แทรก PENALTY · ไม่ SETTLED) · DEPOSIT −มัดจำ คงอยู่ · ไม่มี PENALTY/ROOM บน folio C · E (ไม่มีมัดจำ) ⇒ NO_SHOW ไม่มีบิลริบ · folio E ไม่บังคับสถานะ · G HOLD คง HOLD · F คง CONFIRMED · AuditLog hotel.booking.no_show 2 แถว", async () => {
    needNa(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const c = await rvOf(S.C.id), e = await rvOf(S.E.id);
    eq([c.status, !!c.noShowAt, e.status, !!e.noShowAt], ["NO_SHOW", true, "NO_SHOW", true], "สถานะ");
    ok((await nightsOfRv(S.C.id)).every((n) => !n.counted) && (await prisma.roomOccupancy.count({ where: { refType: "HotelReservation", refId: S.C.id, active: true } })) === 0, "C ไม่ปล่อยห้อง/nights");
    const dep = PRICE.dlx(D);
    const ff = await forfeitSalesOf(c);
    eq(ff.map((s) => s.grandTotalSatang), [dep], "บิลริบ");
    const items = await itemsOf(S.C.id);
    const live = liveItems(items);
    eq([ff[0].sourceModule, ff[0].sourceId], ["HOTEL", S.C.id], "บิลริบ source");
    eq(live.map((i) => i.type), ["DEPOSIT"], "folio C มีรายการนอก DEPOSIT (ห้ามแทรก PENALTY/ROOM)");
    eq(live.filter((i) => i.type === "DEPOSIT").map((i) => i.amountSatang), [-dep], "DEPOSIT");
    const f = await folioOf(S.C.id);
    eq(f.status, "VOID", "folio C ต้อง VOID ตาม H.3");
    eq([(await forfeitSalesOf(e)).length, (await itemsOf(S.E.id, "PENALTY")).length], [0, 0], "E ไม่มีเงิน");
    eq([(await rvOf(S.G.id)).status, (await rvOf(S.F.id)).status, (await rvOf(S.I.id)).status], ["HOLD", "CONFIRMED", "CONFIRMED"], "G/F/I");
    const a = (await auditsOf(/^hotel\.booking\.no_show$/)).filter((x: Any) => [S.C.id, S.E.id].includes(x.targetId));
    eq(a.length, 2, "AuditLog no_show");
  });
  await st("NA-4", "GL เข้ม (บิลริบ C ผ่าน POS → บัญชี ACC_A): drain ⇒ JV ของบิลริบ: Dr 2110 = มัดจำ − VAT(มัดจำ) · Cr 4000(+4030) = ฐาน(มัดจำ) · ไม่มี Cr 2200 เพิ่ม (VAT ออกตอนรับมัดจำ) · ใบรับมัดจำ Cr 2110 = ฐาน(มัดจำ) ⇒ 2110 สุทธิของ C = 0 · Σdr = Σcr ทั้งสมุด · บิลริบ sourceModule HOTEL sourceId = C", async () => {
    needNa(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    await drain();
    const c = await rvOf(S.C.id);
    const ff = await forfeitSalesOf(c);
    ok(ff.length === 1, "ไม่มีบิลริบ");
    eq([ff[0].sourceModule, ff[0].sourceId], ["HOTEL", S.C.id], "บิลริบ source");
    const dep = PRICE.dlx(D);
    const all = await glLines();
    ok(balanced(all), `Σdr ${sum(all.map((l) => l.debit))} ≠ Σcr ${sum(all.map((l) => l.credit))}`);
    const lf = await glLines([ff[0].id]);
    ok(lf.length >= 2, "ไม่มี JV บิลริบ");
    eq([dr(lf, "2110"), net(lf, "4000") + net(lf, "4030"), net(lf, "2200")], [dep - refVat(dep).vat, refVat(dep).base, 0], "JV บิลริบ");
    const lr = await glLines([c.depositSaleId]);
    eq([net(lr, "2110"), net(lr, "2200")], [refVat(dep).base, refVat(dep).vat], "JV ใบรับมัดจำ");
    eq(net(await glLines([c.depositSaleId, ff[0].id]), "2110"), 0, "2110 สุทธิ");
  });
  await st("NA-5", "ขั้น 2 post ROOM เฉพาะ CHECKED_IN คืน D: ROOM businessDate D ของหน่วย = A(D) + B(D) + H(D เดิมที่ void) = 3 แถว live 2 · amount ตรง nights.priceSatang · night A/B วัน D postedAuditId = auditId · folioItemId ตั้ง · night H วัน D ไม่โพสต์ซ้ำ (folioItemId เดิม · ROOM ของ H 2 แถว) · คืน D−1 ของ A ไม่ถูกโพสต์ (ไม่ใช่ businessDate) · C/E/G/F ไม่มี ROOM · balance cache A/B = Σ · ค่าห้อง A/B ไม่เปลี่ยนสถานะการจอง", async () => {
    needNa(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const items = await roomItemsOn(UH, D);
    eq([items.length, liveItems(items).length], [3, 2], "ROOM วัน D");
    for (const k of ["A", "B"] as const) {
      const n = (await nightsOfRv(S[k].id)).find((x) => ymdOfDb(x.date) === D);
      ok(n, `ไม่มีคืน D ของ ${k}`);
      const it = items.find((i) => i.refId === n.id);
      ok(it && it.refType === "HotelBookingNight" && it.amountSatang === n.priceSatang && !it.voidedAt, `ROOM ${k} ${J(it)}`);
      eq([n.postedAuditId, n.folioItemId], [CLOSED.auditId, it.id], `night ${k}`);
      const f = await folioOf(S[k].id);
      eq(f.balanceSatang, sum(liveItems(await itemsOf(S[k].id)).map((i) => i.amountSatang)), `cache ${k}`);
      eq((await rvOf(S[k].id)).status, "CHECKED_IN", `สถานะ ${k}`);
    }
    eq((await itemsOf(S.H.id, "ROOM")).length, 2, "H โพสต์ซ้ำ");
    const aPrev = (await nightsOfRv(S.A.id)).find((x) => ymdOfDb(x.date) === W(-2));
    eq(aPrev?.folioItemId ?? null, null, "คืน D−1 ของ A ถูกโพสต์");
    for (const k of ["C", "E", "G", "F"] as const) eq((await itemsOf(S[k].id, "ROOM")).length, 0, `ROOM ${k}`);
  });
  await st("NA-6", "ขั้น 5 บันทึก/แจ้ง: AuditLog action ~ hotel.audit.closed targetId = auditId มี after (kpi) ไม่มี PII · outbox hotel.audit.closed 1 แถว payload {unitId, auditId, businessDate, kpi:{occupancyBps, roomRevenueSatang, noShows}} ตรงแถว · ไม่มี PII/คีย์นอกสัญญา · unitId บนแถว event", async () => {
    needNa(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const a = (await auditsOf(/hotel\.audit\.close|night_audit\.close|hotel\.night_audit/)).filter((x: Any) => x.targetId === CLOSED.auditId || J(x.after).includes(CLOSED.auditId));
    ok(a.length >= 1 && !PII_TEXT.test(J(a)), `AuditLog ${a.length}`);
    const ev = await eventsOf("hotel.audit.closed", (p) => p.auditId === CLOSED.auditId);
    eq(ev.length, 1, "event");
    const p = ev[0].payload;
    const row = await auditRow(UH, D);
    eq([p.unitId, p.businessDate, p.kpi?.occupancyBps, p.kpi?.roomRevenueSatang], [UH, D, row.occupancyBps, row.roomRevenueSatang], "payload");
    ok(typeof p.kpi?.noShows === "number" && p.kpi.noShows >= 1, "kpi.noShows");
    eq(Object.keys(p).filter((k) => !["unitId", "auditId", "businessDate", "kpi", "tenantId"].includes(k)), [], "คีย์นอกสัญญา");
    ok(!PII_TEXT.test(J(p)) && ![...walkKeys(p)].some((k) => PII_KEY.test(k)) && ev[0].unitId === UH, "PII/unitId");
  });
  await st("NA-7", "ปิดซ้ำ/ปิดวันนี้ (X3 · §0): closeNightAudit(UH, D) อีกครั้ง ⇒ ALREADY_CLOSED · ไม่มีแถว/ROOM/บิลริบ/รายการ folio เพิ่ม · (UH, วันนี้) ⇒ TOO_EARLY · (UH, พรุ่งนี้) ⇒ TOO_EARLY · businessDate ผิดรูป ⇒ ok:false ไม่ throw · unitId มั่ว ⇒ NOT_FOUND · preview หลังปิด ⇒ businessDate = วันนี้ (วันถัดไป)", async () => {
    needNa(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const sig = async () => J([await prisma.hotelNightAudit.count({ where: { unitId: UH } }), (await roomItemsOn(UH, D)).length, (await forfeitSalesOf(await rvOf(S.C.id))).length, (await itemsOf(S.C.id)).length]);
    const s0 = await sig();
    eq(failCode(await close(MGR, {})), "ALREADY_CLOSED", "ปิดซ้ำ");
    eq(failCode(await close(MGR, { businessDate: T0 })), "TOO_EARLY", "วันนี้");
    eq(failCode(await close(MGR, { businessDate: W(1) })), "TOO_EARLY", "พรุ่งนี้");
    ok(isFail(await close(MGR, { businessDate: "ผิด" })), "วันผิดรูป");
    eq(failCode(await close(MGR, { unitId: "ไม่มี-unit" })), "NOT_FOUND", "unit มั่ว");
    eq(await sig(), s0, "มีแถวเพิ่ม");
    eq((await preview(MGR, {}))?.businessDate, T0, "preview หลังปิด");
  });
  await st("NA-8", "reopen (§0 · MANAGER · เหตุผล · วันล่าสุด): frontdesk ⇒ FORBIDDEN · manager ไม่มีเหตุผล ⇒ ok:false · auditId มั่ว ⇒ NOT_FOUND · manager + เหตุผล ⇒ ok · แถว REOPENED reopenedById/reopenedAt · ROOM A/B ยังอยู่ (ไม่ถอน) · AuditLog ~reopen · outbox hotel.audit.reopened {auditId, byUserId} · ปิดใหม่ ⇒ ok auditId เดิม · status CLOSED · KPI เท่าเดิมทุกตัว · ROOM live วัน D ยัง 2 · บิลริบยัง 1 (ไม่ริบซ้ำ) · folio C ยัง VOID · no-show ไม่ซ้ำ · event closed 2 แถว (key ต่างกัน) · ประวัติ 1 แถว", async () => {
    needNa(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const before = kpiOfRow(await auditRow(UH, D));
    ok(isDenied(await reopen(FRONT, { auditId: CLOSED.auditId })), "frontdesk reopen ได้");
    ok(isFail(await reopen(MGR, { auditId: CLOSED.auditId, reason: "" })), "ไม่มีเหตุผลผ่าน");
    eq(failCode(await reopen(MGR, { auditId: "ไม่มี-audit" })), "NOT_FOUND", "auditId มั่ว");
    okRes(await reopen(MGR, { auditId: CLOSED.auditId }), "reopen");
    const ro = await auditRow(UH, D);
    eq([ro.status, ro.reopenedById, !!ro.reopenedAt], ["REOPENED", MGR.userId, true], "แถว REOPENED");
    eq(liveItems(await roomItemsOn(UH, D)).length, 2, "ROOM ถูกถอน");
    ok((await auditsOf(/reopen/i)).some((x: Any) => x.targetId === CLOSED.auditId || J(x.after).includes(CLOSED.auditId)), "AuditLog reopen");
    const ev = await eventsOf("hotel.audit.reopened", (p) => p.auditId === CLOSED.auditId);
    eq([ev.length, ev[0]?.payload?.byUserId], [1, MGR.userId], "event reopened");
    const again = okRes(await close(MGR, {}), "ปิดใหม่");
    eq(again.auditId, CLOSED.auditId, "auditId เดิม");
    const rc = await auditRow(UH, D);
    eq([rc.status, kpiOfRow(rc)], ["CLOSED", before], "KPI หลังปิดใหม่");
    eq([liveItems(await roomItemsOn(UH, D)).length, (await roomItemsOn(UH, D)).length], [2, 3], "ROOM ซ้ำ");
    eq([(await forfeitSalesOf(await rvOf(S.C.id))).length, (await folioOf(S.C.id)).status, (await auditsOf(/^hotel\.booking\.no_show$/)).filter((x: Any) => x.targetId === S.C.id).length], [1, "VOID", 1], "ริบซ้ำ");
    eq((await eventsOf("hotel.audit.closed", (p) => p.auditId === CLOSED.auditId)).length, 2, "event closed 2");
    const h = okRes(await history({}), "auditHistory");
    const hr = rowsOf(h);
    eq(hr.length, 1, "ประวัติ");
    ok(hr[0].auditId === CLOSED.auditId || hr[0].id === CLOSED.auditId, "ประวัติไม่มี auditId");
    eq([hr[0].businessDate, hr[0].status], [D, "CLOSED"], "ประวัติแถว");
  });
  {
    const n9 = "ขั้น 3 stayover DIRTY (H.6 markStayoversDirty · dailyHousekeeping เปิด): ห้องของ A และ B (พักต่อข้ามคืน D) hkStatus DIRTY + HotelHousekeepingLog →DIRTY อ้าง reservationId · ห้อง DLX06 (BLOCK) ไม่แตะ";
    if (HK_SKIP) skip("NA-9", n9, HK_SKIP);
    else await st("NA-9", n9, async () => {
      needNa(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
      for (const k of ["A", "B"] as const) {
        const room = await prisma.hotelRoom.findUnique({ where: { id: S[k].roomId } });
        eq(room.hkStatus, "DIRTY", `ห้อง ${k}`);
        ok((await prisma.hotelHousekeepingLog.count({ where: { roomId: S[k].roomId, toStatus: "DIRTY", reservationId: S[k].id } })) >= 1, `log ${k}`);
      }
      eq((await prisma.hotelRoom.findUnique({ where: { id: ROOM.DLX06 } })).hkStatus, "OUT_OF_ORDER", "ห้อง BLOCK ถูกแตะ");
    });
  }
  await st("NA-10", "หน่วย timezone America/New_York (UNY · §0 business date ต่อหน่วย): วันนี้ของร้าน = refTzYmd(NY) · closeNightAudit(UNY, วันนี้NY) ⇒ TOO_EARLY (แม้ว่าวันไทยอาจเลยแล้ว) · preview.businessDate = วันนี้NY −1 · close(วันนี้NY −1) ⇒ ok · แถว businessDate ตรง · ROOM ของ NY คืนนั้น = คืน CHECKED_IN ที่มีจริง (0/1) · reopen ครั้งที่สองโดย OWNER ⇒ ok แล้วปิดคืน", async () => {
    needNa(); needScene();
    const nyToday = refTzYmd("America/New_York", new Date());
    const nyD = addDays(nyToday, -1);
    eq(failCode(await close(MGR, { unitId: UNY, businessDate: nyToday })), "TOO_EARLY", `วันนี้ NY ${nyToday}`);
    eq((await preview(MGR, { unitId: UNY }))?.businessDate, nyD, "preview NY");
    okRes(await close(MGR, { unitId: UNY, businessDate: nyD }), `close NY ${nyD}`);
    const row = await auditRow(UNY, nyD);
    ok(row && row.status === "CLOSED", "ไม่มีแถว NY");
    const nights = (await nightsOfRv(S.NY.id)).filter((n) => ymdOfDb(n.date) === nyD);
    eq([liveItems(await roomItemsOn(UNY, nyD)).length, row.roomsOccupied, row.roomsAvailable], [nights.length, nights.length, 2], "ROOM/KPI NY");
    okRes(await reopen(OWNER, { auditId: row.id, reason: "ทดสอบเจ้าของ" }), "reopen owner");
    okRes(await close(OWNER, { unitId: UNY, businessDate: nyD }), "ปิดคืน");
  });
  await st("NA-11", "ลำดับวัน (§0 ขั้น 6 · UC ไม่เคยปิด): auditor (STAFF hotel.audit.run) ปิด D−2 (วันเริ่มใช้) ⇒ ok · CA (CONFIRMED เข้า D−2 มัดจำจ่าย) ⇒ NO_SHOW + บิลริบ (folio VOID) · ปิด D (ข้าม D−1) ⇒ PREVIOUS_OPEN · frontdesk ปิด D−1 ⇒ FORBIDDEN · owner ปิด D−1 ⇒ ok (ว่าง: occupied 0 revenue 0 ADR 0 RevPAR 0 bps 0) · manager ปิด D ⇒ ok · auditHistory(UC, D−3..วันนี้) 3 แถวเรียงวัน · reopen D−1 (ไม่ใช่วันล่าสุด) ⇒ ok:false · reopen D ⇒ ok", async () => {
    needNa(); needScene();
    okRes(await close(AUDITOR, { unitId: UC, businessDate: W(-3) }), "auditor ปิด D−2");
    const ca = await rvOf(S.CA.id);
    eq([ca.status, (await forfeitSalesOf(ca)).length, (await folioOf(S.CA.id)).status], ["NO_SHOW", 1, "VOID"], "CA");
    eq(failCode(await close(MGR, { unitId: UC, businessDate: D })), "PREVIOUS_OPEN", "ข้ามวัน");
    ok(isDenied(await close(FRONT, { unitId: UC, businessDate: W(-2) })), "frontdesk ปิดได้");
    okRes(await close(OWNER, { unitId: UC, businessDate: W(-2) }), "owner ปิด D−1");
    const empty = await auditRow(UC, W(-2));
    eq([empty.roomsOccupied, empty.roomRevenueSatang, empty.adrSatang, empty.revparSatang, empty.occupancyBps, empty.roomsAvailable], [0, 0, 0, 0, 0, 2], "วันว่าง");
    okRes(await close(MGR, { unitId: UC, businessDate: D }), "manager ปิด D");
    const h = rowsOf(okRes(await history({ unitId: UC, from: W(-4), to: W(0) }), "history"));
    eq(h.map((x: Any) => x.businessDate), [W(-3), W(-2), D], "ประวัติ 3 แถว");
    const mid = await auditRow(UC, W(-2)), last = await auditRow(UC, D);
    ok(isFail(await reopen(MGR, { auditId: mid.id })), "reopen วันกลางได้");
    okRes(await reopen(MGR, { auditId: last.id }), "reopen วันล่าสุด");
    okRes(await close(MGR, { unitId: UC, businessDate: D }), "ปิดคืน");
  });
  await st("NA-12", "tx ล้มกลางคัน (§2.6 · trigger จำลองบน HotelNightAudit ของ UFL): closeNightAudit(UFL, D) ⇒ ok:false (ไม่ throw ดิบ) · rollback ขั้น 2–5: ไม่มีแถว audit · ROOM คืน D ของ FL1 = 0 · night.postedAuditId null · ไม่มี event hotel.audit.closed · ขั้น 1 (เงินนอก tx) ทำแล้ว: FL2 NO_SHOW + บิลริบ 1 · ถอด trigger แล้วปิดใหม่ ⇒ ok · บิลริบ FL2 ยัง 1 (idempotent · folio VOID) · ROOM FL1 1 · KPI occupied 1 revenue = ราคาคืน D", async () => {
    needNa(); needScene();
    await installFailTrigger(UFL);
    let r: Any;
    try { r = await close(MGR, { unitId: UFL, businessDate: D }); } finally { await dropFailTrigger(); }
    ok(r?.ok === false, `ปิดสำเร็จทั้งที่ tx ต้องล้ม ${J(r)}`);
    ok(r.code !== "THROW", `throw ดิบ: ${r.reason}`);
    eq([await prisma.hotelNightAudit.count({ where: { unitId: UFL } }), (await roomItemsOn(UFL, D)).length, (await eventsOf("hotel.audit.closed", (p) => p.unitId === UFL)).length], [0, 0, 0], "rollback");
    eq((await nightsOfRv(S.FL1.id)).map((n) => n.postedAuditId ?? null), [null], "postedAuditId");
    const fl2 = await rvOf(S.FL2.id);
    eq([fl2.status, (await forfeitSalesOf(fl2)).length], ["NO_SHOW", 1], "ขั้น 1 นอก tx");
    okRes(await close(MGR, { unitId: UFL, businessDate: D }), "ปิดใหม่");
    const row = await auditRow(UFL, D);
    eq([(await forfeitSalesOf(await rvOf(S.FL2.id))).length, (await folioOf(S.FL2.id)).status, liveItems(await roomItemsOn(UFL, D)).length, row.roomsOccupied, row.roomRevenueSatang], [1, "VOID", 1, 1, PRICE.dlx(D)], "หลังปิดใหม่");
  });

  // ═══════════════ CR cron hotel-night-audit ═══════════════
  console.log("\n── CR cron (runDueAudits · ทะเบียน minute job) ──");
  const REGISTRY_KEY = Symbol.for("shark.platform.minute-jobs.registry");
  const registry = () => ((globalThis as Any)[REGISTRY_KEY] as Map<string, Any> | undefined) ?? new Map<string, Any>();
  const runDue = (now: Date, budgetMs = 20_000) => call(() => NA("runDueAudits")(now, budgetMs, { signal: new AbortController().signal, deadline: Date.now() + budgetMs }));
  const otherAuditCount = () => prisma.hotelNightAudit.count({ where: { tenantId: { notIn: tenantIds } } }) as Promise<number>;
  const NOW1 = new Date(`${D}T20:30:00.000Z`); // วันนี้ 03:30 ไทย = D 15:30 นิวยอร์ก (EST)
  const NOW2 = new Date(`${T0}T04:30:00.000Z`); // วันนี้ 11:30 ไทย = D 23:30 นิวยอร์ก
  await guardSvcqcAutoClose();
  await st("CR-1", "ทะเบียน (§0 cron · แบบ dorm ใน platform/minute-jobs.ts): หลัง import minute-jobs + facade hotel มีงาน `hotel-night-audit` everyMinutes 15 cadence minute ไม่ vpsOnly · run เป็นฟังก์ชัน · minute-jobs.ts มี registerMinuteJob({ name: \"hotel-night-audit\" …}) แบบสถิต · โหลด hotel แบบ lazy (import() ใน run) · ไม่มีใน vercel.json", () => {
    needNa();
    const job = registry().get("hotel-night-audit");
    ok(job, `ทะเบียน minute job ไม่มี hotel-night-audit (มี: ${[...registry().keys()].join(", ")})`);
    eq([job.everyMinutes, job.cadence ?? "minute", job.vpsOnly ?? false, typeof job.run], [15, "minute", false, "function"], "งาน");
    const src = stripComments(read(F.minuteJobs));
    ok(/registerMinuteJob\(\s*\{[^}]*name:\s*["']hotel-night-audit["']/.test(src.replace(/\n/g, " ")), "minute-jobs.ts ไม่มี registerMinuteJob hotel-night-audit");
    ok(/import\(\s*["']@\/lib\/modules\/hotel["']\s*\)/.test(src) || /import\(\s*["']@\/lib\/modules\/hotel\/night-audit["']\s*\)/.test(src), "ไม่ lazy import hotel");
    ok(!/hotel|audit/i.test(read(F.vercel)), "vercel.json มี cron ของโรงแรม");
  });
  await st("CR-2", "runDueAudits(now = วันนี้ 03:30 ไทย, 20s) ⇒ {closed, skipped, errors} · ปิด UCR1 (กรุงเทพ · nightAuditTime 03:00 · autoClose) วัน D: แถว CLOSED closedById null (cron) · ROOM CR1 1 · occupied 1 · ไม่ปิด UCR2 (นิวยอร์ก 23:00 ยังไม่ถึง) · ไม่ปิด UH/UNY/UC/UFL (autoClose false หรือปิดแล้ว) · ไม่แตะหน่วยนอกร้านทดสอบ (svcqc autoClose ปิดไว้) · errors 0 · รันซ้ำ now เดิม ⇒ closed 0", async () => {
    needNa(); needScene();
    const o0 = await otherAuditCount();
    const r = okRes(await runDue(NOW1), "runDueAudits");
    ok(typeof r.closed === "number" && typeof r.skipped === "number" && typeof r.errors === "number", `รูปผล ${J(r)}`);
    eq([r.closed, r.errors], [1, 0], "closed/errors");
    const row = await auditRow(UCR1, D);
    ok(row && row.status === "CLOSED" && row.closedById === null, `UCR1 ${J(row)}`);
    eq([liveItems(await roomItemsOn(UCR1, D)).length, row.roomsOccupied, row.roomRevenueSatang], [1, 1, PRICE.dlx(D)], "UCR1 KPI");
    eq(await prisma.hotelNightAudit.count({ where: { unitId: UCR2 } }), 0, "UCR2 ถูกปิด");
    eq(await otherAuditCount(), o0, "แตะหน่วยนอกร้านทดสอบ");
    eq((await runDue(NOW1))?.closed, 0, "รอบซ้ำ");
  });
  await st("CR-3", "X5 สองรอบซ้อน + timezone: Promise.all(runDueAudits(now = วันนี้ 11:30 ไทย) ×2) ⇒ Σclosed = 1 (UCR2 ถึง 23:00 นิวยอร์ก ⇒ ปิด business date ของร้าน = D−1 ไม่ใช่ D) · แถว UCR2 businessDate D−1 · ROOM CR2 คืน D−1 1 แถว · UCR1 ไม่ปิดซ้ำ (D ปิดแล้ว · วันนี้ปิดไม่ได้) · errors 0 · ไม่แตะหน่วยนอก", async () => {
    needNa(); needScene();
    const o0 = await otherAuditCount();
    const [a, b] = await Promise.all([runDue(NOW2), runDue(NOW2)]);
    okRes(a, "รอบ A"); okRes(b, "รอบ B");
    eq([a.closed + b.closed, a.errors + b.errors], [1, 0], "closed รวม");
    const rows = await auditRows(UCR2);
    eq(rows.map((x) => [ymdOfDb(x.businessDate), x.status]), [[W(-2), "CLOSED"]], "UCR2 businessDate ตาม timezone");
    eq(liveItems(await roomItemsOn(UCR2, W(-2))).length, 1, "ROOM CR2");
    eq(await prisma.hotelNightAudit.count({ where: { unitId: UCR1 } }), 1, "UCR1 ซ้ำ");
    eq(await otherAuditCount(), o0, "แตะหน่วยนอก");
  });
  await st("CR-4", "งบเวลา/ความล้ม: runDueAudits(now, 0) ⇒ closed 0 ไม่ throw (ไม่เริ่มงานเมื่องบหมด) · UFL reopen แล้วติด trigger ⇒ runDueAudits(autoClose UFL เปิด) ⇒ errors 1 · UFL ยัง REOPENED (ไม่มีแถวครึ่ง) · งานอื่นไม่ถูกบล็อก (ไม่ throw) · ถอด trigger ⇒ รอบถัดไปปิด UFL ได้ closed 1 · errors 0", async () => {
    needNa(); needScene();
    const z = await runDue(NOW2, 0);
    ok(z?.ok !== false && z?.closed === 0, `งบ 0 ${J(z)}`);
    const row = await auditRow(UFL, D);
    ok(row, "ไม่มี NA-12");
    okRes(await reopen(MGR, { auditId: row.id, reason: "ทดสอบ cron ล้ม" }), "reopen UFL");
    await setUnit("rooms.hotel.audit.autoClose", true, UFL);
    await installFailTrigger(UFL);
    let r: Any;
    try { r = await runDue(NOW2); } finally { await dropFailTrigger(); }
    ok(r?.ok !== false, `runDueAudits throw ${J(r)}`);
    eq(r.errors, 1, "errors");
    eq((await auditRow(UFL, D)).status, "REOPENED", "UFL เปลี่ยนสถานะทั้งที่ล้ม");
    const r2 = okRes(await runDue(NOW2), "รอบถัดไป");
    eq([r2.closed, r2.errors, (await auditRow(UFL, D)).status], [1, 0, "CLOSED"], "ปิดได้หลังถอด trigger");
  });
  await st("CR-5", "runMinuteJobs จริง (platform): runMinuteJobs(NOW2 + 20 นาที, {cadence:\"minute\"}) ⇒ results มี hotel-night-audit outcome ok (ไม่ failed/busy) · ไม่สร้างแถวเพิ่มในร้านทดสอบ (ทุกวันปิดแล้ว) · ไม่แตะหน่วยนอก", async () => {
    needNa(); needScene();
    const o0 = await otherAuditCount();
    const n0 = await prisma.hotelNightAudit.count({ where: { tenantId: tA } });
    const now = new Date(Math.max(NOW2.getTime() + 20 * 60_000, Date.now() - 60_000));
    const s0 = await mjL.mod.runMinuteJobs(now, { cadence: "minute", entry: "vps" });
    const me = (s0.results as Any[]).find((x) => x.name === "hotel-night-audit");
    ok(me, `ไม่มี hotel-night-audit ใน results (${J(s0.results?.map((x: Any) => x.name))})`);
    ok(["ok", "not-due"].includes(me.outcome), `outcome ${me.outcome}`);
    eq([await prisma.hotelNightAudit.count({ where: { tenantId: tA } }), await otherAuditCount()], [n0, o0], "แถวเพิ่ม");
  }, "MAJOR");
  await restoreSvcqcAutoClose();

  // ═══════════════ RP รายงาน ═══════════════
  console.log("\n── RP รายงาน (reports.ts · UH · D ปิดแล้ว · D−1/วันนี้ สด) ──");
  const occRow = (r: Any, period: string) => rowsOf(r).find((x: Any) => x.period === period || x.date === period);
  const refLive = async (ymd: string) => { const k = await refKpi(UH, ymd); const nightsSum = sum(((await prisma.hotelBookingNight.findMany({ where: { tenantId: tA, unitId: UH, date: dbDate(ymd), counted: true }, include: { reservation: { select: { status: true } } } })) as Any[]).filter((n) => ["CHECKED_IN", "CHECKED_OUT"].includes(n.reservation.status)).map((n) => n.priceSatang)); return { ...k, nightsSum }; };
  await st("RP-1", "occupancyReport(ctx{tenantId, actorUserId reader}, {UH, from D−1, to วันนี้, groupBy day}) ⇒ rows 3 แถว period = วัน · วัน D (ปิดแล้ว) = แถว audit ทุกช่อง (occupancyBps/adrSatang/revparSatang/occupied/available/revenueSatang) · วัน D−1 และวันนี้ (ยังไม่ปิด) คำนวณสด: occupied/available ตรงคำนวณมือ (D−1: A H = 2/8 · วันนี้: A B I? ตาม CHECKED_IN = 2/7) · revenue สด = Σ nights.priceSatang (counted) ของ CHECKED_IN/CHECKED_OUT (มติ §9.4) · เงิน Int สตางค์ · % bp", async () => {
    needRp(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const r = okRes(await report("occupancyReport", READER, { groupBy: "day" }), "occupancyReport");
    const rows = rowsOf(r);
    eq(rows.map((x: Any) => x.period ?? x.date), [W(-2), D, T0], "period");
    const a = await auditRow(UH, D);
    const d = occRow(r, D);
    eq([d.occupancyBps, d.adrSatang, d.revparSatang, d.occupied, d.available, d.revenueSatang], [a.occupancyBps, a.adrSatang, a.revparSatang, a.roomsOccupied, a.roomsAvailable, a.roomRevenueSatang], "วัน D จาก audit");
    for (const ymd of [W(-2), T0]) {
      const ref = await refLive(ymd);
      const row = occRow(r, ymd);
      eq([row.occupied, row.available, row.occupancyBps], [ref.roomsOccupied, ref.roomsAvailable, ref.occupancyBps], `สด ${ymd}`);
      eq([row.revenueSatang, row.adrSatang, row.revparSatang], [ref.nightsSum, roundRef(ref.nightsSum, ref.roomsOccupied), roundRef(ref.nightsSum, ref.roomsAvailable)], `revenue/ADR/RevPAR สด ${ymd} (Σ nights.priceSatang)`);
    }
    eq([occRow(r, W(-2)).occupied, occRow(r, W(-2)).available], [2, TOTAL_UH], "D−1 = A H · ไม่มี BLOCK");
    ok(rows.every((x: Any) => [x.occupancyBps, x.adrSatang, x.revparSatang, x.occupied, x.available, x.revenueSatang].every((v) => Number.isInteger(v))), "ไม่ใช่ Int");
  });
  await st("RP-2", "occupancyReport groupBy month: รวมวันในช่วงเป็นแถวต่อเดือน · occupied = Σ วัน · available = Σ วัน · occupancyBps = floor(Σocc×10000÷Σavail) · revenue = Σ · ADR = Σrevenue÷Σoccupied · RevPAR = Σrevenue÷Σavailable (ยึดค่าจากรายวันของระบบเอง) · ช่วง > 366 วัน ⇒ INVALID_RANGE · to < from ⇒ ok:false ไม่ throw · groupBy อื่น ⇒ ok:false · unitId หน่วยหอ/มั่ว ⇒ NOT_FOUND", async () => {
    needRp(); needScene();
    const day = rowsOf(okRes(await report("occupancyReport", READER, { groupBy: "day" }), "day"));
    const m = okRes(await report("occupancyReport", READER, { groupBy: "month" }), "month");
    const byM: Record<string, { occ: number; av: number; rev: number }> = {};
    for (const x of day) { const k = String(x.period ?? x.date).slice(0, 7); const g = (byM[k] ??= { occ: 0, av: 0, rev: 0 }); g.occ += x.occupied; g.av += x.available; g.rev += x.revenueSatang; }
    const want = Object.entries(byM).map(([k, g]) => ({ period: k, occupied: g.occ, available: g.av, occupancyBps: bpsRef(g.occ, g.av), revenueSatang: g.rev, adrSatang: roundRef(g.rev, g.occ), revparSatang: roundRef(g.rev, g.av) }));
    eq(rowsOf(m).map((x: Any) => ({ period: x.period ?? x.month, occupied: x.occupied, available: x.available, occupancyBps: x.occupancyBps, revenueSatang: x.revenueSatang, adrSatang: x.adrSatang, revparSatang: x.revparSatang })), want, "เดือน");
    eq(failCode(await report("occupancyReport", READER, { from: W(-400), to: W(0), groupBy: "day" })), "INVALID_RANGE", "> 366");
    ok(isFail(await report("occupancyReport", READER, { from: W(0), to: W(-3), groupBy: "day" })), "to < from");
    ok(isFail(await report("occupancyReport", READER, { groupBy: "week" })), "groupBy ผิด");
    eq(failCode(await report("occupancyReport", READER, { unitId: "ไม่มี-unit", groupBy: "day" })), "NOT_FOUND", "unit มั่ว");
  });
  const revField = (row: Any) => num(pick(row, "roomRevenueSatang"));
  const keyField = (row: Any) => String(pick(row, "key") ?? "");
  await st("RP-3", "revenueReport groupBy source/ratePlan/roomType (รายได้ห้อง = Σ ROOM live ตาม businessDate ในช่วง D−1..วันนี้ · net void): Σ ทุกแถว = Σ ROOM live ของหน่วยในช่วง (ไม่นับคืน D ของ H ที่ void) · source: PHONE = A(D) · WALK_IN = B(D) · OTA = H(D−1) · roomType: ดีลักซ์ = A(D)+H(D−1) · ซูพีเรีย = B(D) · ratePlan: STANDARD = A+B · BIGDEP = H(D−1) · แถว {key, label, roomRevenueSatang, otherRevenueSatang, totalSatang} (§9.3) · otherRevenue = Σ SERVICE+POS_CHARGE+MINIBAR (ฉากนี้ 0) · total = room + other · ไม่มี PII", async () => {
    needRp(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const live = liveItems((await prisma.hotelFolioItem.findMany({ where: { tenantId: tA, unitId: UH, type: "ROOM", businessDate: { gte: dbDate(W(-2)), lte: dbDate(T0) } } })) as Any[]);
    const total = sum(live.map((i) => i.amountSatang));
    eq(total, PRICE.dlx(D) + PRICE.sup(D) + PRICE.dlx(W(-2)), "Σ ROOM live ในช่วง (ตัวควบคุม)");
    const exp: Record<string, Record<string, number>> = {
      source: { PHONE: PRICE.dlx(D), WALK_IN: PRICE.sup(D), OTA: PRICE.dlx(W(-2)) },
      roomType: { "ดีลักซ์": PRICE.dlx(D) + PRICE.dlx(W(-2)), "ซูพีเรีย": PRICE.sup(D) },
      ratePlan: { STANDARD: PRICE.dlx(D) + PRICE.sup(D), BIGDEP: PRICE.dlx(W(-2)) },
    };
    for (const g of ["source", "roomType", "ratePlan"]) {
      const r = okRes(await report("revenueReport", READER, { groupBy: g }), `revenueReport ${g}`);
      const rows = rowsOf(r).filter((x: Any) => (revField(x) ?? 0) !== 0);
      eq(sum(rows.map((x: Any) => revField(x) ?? 0)), total, `Σ ${g}`);
      const got: Record<string, number> = {};
      for (const x of rows) { const k = keyField(x); got[k] = (got[k] ?? 0) + (revField(x) ?? 0); }
      const want = exp[g];
      for (const [k, v] of Object.entries(want)) { const hit = Object.entries(got).find(([kk]) => kk === k || kk.includes(k) || k.includes(kk)); ok(hit && hit[1] === v, `${g} ${k}: ได้ ${J(got)} ต้อง ${v}`); }
      for (const x of rows) { for (const kk of ["key", "label", "roomRevenueSatang", "otherRevenueSatang", "totalSatang"]) ok(kk in x, `${g} แถวไม่มี ${kk}`); eq(x.totalSatang, x.roomRevenueSatang + x.otherRevenueSatang, `${g} total`); eq(x.otherRevenueSatang, 0, `${g} otherRevenue`); }
      ok(!PII_TEXT.test(J(r)), `PII ${g}`);
    }
  });
  await st("RP-4", "bookingFunnel(UH, D−1..วันนี้) ต่อ source: Σ จอง = จำนวนแถว HotelReservation ที่ createdAt ในช่วง (ทุกสถานะ) · no-show รวม 2 (C E · PHONE) · ยกเลิก 1 (F2 · WEB? = source ของ F2) พร้อมเหตุผล \"ลูกค้าขอยกเลิก\" · confirmRateBps/cancelRateBps เป็น bp (0..10000) · leadTimeDaysAvg ≥ 0 · alosNights > 0 (ชื่อช่องล็อก §9.3) · ไม่มี PII", async () => {
    needRp(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const r = okRes(await report("bookingFunnel", READER, {}), "bookingFunnel");
    const rows = rowsOf(r).length ? rowsOf(r) : Array.isArray(r.bySource) ? r.bySource : Object.entries(r.bySource ?? {}).map(([k, v]: [string, Any]) => ({ source: k, ...v }));
    ok(rows.length >= 1, `ไม่มีแถว funnel ${J(r).slice(0, 200)}`);
    const rvs = (await prisma.hotelReservation.findMany({ where: { tenantId: tA, unitId: UH } })) as Any[];
    for (const x of rows) for (const kk of ["created", "confirmed", "cancelled", "noShow", "confirmRateBps", "cancelRateBps"]) ok(kk in x, `แถว funnel ไม่มี ${kk}`);
    const booked = sum(rows.map((x: Any) => num(x.created) ?? 0));
    eq(booked, rvs.length, "Σ จอง");
    eq(sum(rows.map((x: Any) => num(x.noShow) ?? 0)), rvs.filter((x) => x.status === "NO_SHOW").length, "no-show");
    eq(sum(rows.map((x: Any) => num(x.cancelled) ?? 0)), rvs.filter((x) => x.status === "CANCELLED").length, "ยกเลิก");
    ok(J(r).includes("ลูกค้าขอยกเลิก"), "ไม่มีเหตุผลยกเลิก");
    const bps = rows.flatMap((x: Any) => [num(x.confirmRateBps), num(x.cancelRateBps)]).filter((v: Any): v is number => v !== null);
    ok(bps.length >= 1 && bps.every((v: number) => Number.isInteger(v) && v >= 0 && v <= 10_000), `rate bp ${J(bps)}`);
    const lead = num(r.leadTimeDaysAvg) ?? num(rows[0]?.leadTimeDaysAvg);
    const alos = num(r.alosNights) ?? num(rows[0]?.alosNights);
    ok(lead !== null && lead >= 0 && alos !== null && alos > 0, `leadTimeDaysAvg/alosNights ${J([lead, alos])}`);
    ok(!PII_TEXT.test(J(r)) && ![...walkKeys(r)].some((k) => PII_KEY.test(k)), "PII");
  }, "MAJOR");
  await st("RP-5", "forecast30(UH) on-the-books 30 วันจากวันนี้ (ใช้ hotelAvailability H.3): 30 แถว {date, onBooks, available, occupancyBps} (§9.3) เรียงจากวันนี้ · ต่อวัน onBooks = Σcounted · available = Σtotal−blocked−leased · occupancyBps = Σcounted×10000 ÷ (Σtotal − Σblocked − Σleased) จาก hotelAvailability.get · วันนี้: counted รวม I/A/B · วัน +5 นับ F (CONFIRMED) · DLX06 BLOCK ลด available วันนี้/พรุ่งนี้", async () => {
    needRp(); needScene();
    const r = okRes(await report("forecast30", READER, {}), "forecast30");
    const rows = rowsOf(r);
    eq(rows.length, 30, "30 แถว");
    eq([rows[0].date ?? rows[0].period, rows[29].date ?? rows[29].period], [T0, W(29)], "วัน");
    const av = await availL.mod.hotelAvailability.get(ctxA, { unitId: UH, from: T0, to: W(30) });
    okRes(av, "hotelAvailability");
    const bad: string[] = [];
    for (const x of rows) {
      const d = String(x.date ?? x.period);
      const cells = Object.values(av.byDate[d] ?? {}) as Any[];
      const counted = sum(cells.map((c) => c.counted)), sell = sum(cells.map((c) => c.total - c.blocked - c.leased));
      const bps = num(x.occupancyBps) ?? -1;
      if (!("onBooks" in x && "available" in x) || x.onBooks !== counted || x.available !== sell) bad.push(`${d}: onBooks/available ${J([x.onBooks, x.available])} ≠ ${J([counted, sell])}`);
      if (bps !== bpsRef(counted, sell)) bad.push(`${d}: ${bps} ≠ ${bpsRef(counted, sell)} (${counted}/${sell})`);
    }
    eq(bad.slice(0, 5), [], "bps");
    const today = Object.values(av.byDate[T0] ?? {}) as Any[];
    ok(sum(today.map((c) => c.counted)) >= 3 && sum(today.map((c) => c.blocked)) === 1, `ตัวควบคุม availability วันนี้ ${J(today)}`);
  });
  await st("RP-6", "housekeepingReport(UH, D−1..วันนี้) จาก HotelHousekeepingLog DIRTY→CLEAN · DTO {byDay:[{date, cleaned}], byUser:[{userId, cleaned}], oooOutstanding} (§9.3): ต่อวัน D = 2 · D−1 = 1 · ต่อคน MAID 2 · OWNER 1 · OOO ค้าง ≥ 1 (DLX06 BLOCK ครอบวันนี้) · ไม่มี PII (ชื่อผู้ใช้ไม่ใช่ PII แขก)", async () => {
    needRp(); needScene();
    const r = okRes(await report("housekeepingReport", READER, {}), "housekeepingReport");
    const byDay = rowsOf(r.byDay);
    const dayVal = (ymd: string) => num((byDay.find((x: Any) => x.date === ymd) ?? {}).cleaned);
    eq([dayVal(D), dayVal(W(-2))], [2, 1], "ต่อวัน");
    const byUser = rowsOf(r.byUser);
    const userVal = (uid2: string) => num((byUser.find((x: Any) => x.userId === uid2) ?? {}).cleaned);
    eq([userVal(MAID.userId), userVal(OWNER.userId)], [2, 1], "ต่อคน");
    const ooo = num(r.oooOutstanding) ?? -1;
    ok(ooo >= 1, `OOO ค้าง ${J(ooo)}`);
    ok(!PII_TEXT.test(J(r)), "PII");
  }, "MAJOR");
  await st("RP-7", "depositsReport(UH, D−1..วันนี้): DTO {holdActive, depositPendingSatang, forfeitedSatang, refundedSatang} (§9.3): holdActive 1 (G) · depositPendingSatang = มัดจำ F ที่ยังไม่จ่าย (CONFIRMED · depositSatang > 0 · depositPaidAt null) · forfeitedSatang = บิลริบ C (ราคาคืน D ดีลักซ์) · refundedSatang = 0 (F2 ยกเลิกไม่มีมัดจำ) · Int สตางค์ · ไม่มี PII", async () => {
    needRp(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const r = okRes(await report("depositsReport", READER, {}), "depositsReport");
    for (const kk of ["holdActive", "depositPendingSatang", "forfeitedSatang", "refundedSatang"]) ok(kk in r, `DTO ไม่มี ${kk}`);
    eq(r.holdActive, 1, "HOLD active");
    const pendingRef = sum(((await prisma.hotelReservation.findMany({ where: { tenantId: tA, unitId: UH, status: "CONFIRMED", depositPaidAt: null, depositSatang: { gt: 0 } } })) as Any[]).map((x) => x.depositSatang));
    ok(pendingRef > 0, "ตัวควบคุม: ไม่มีมัดจำค้างในฉาก");
    eq(r.depositPendingSatang, pendingRef, "มัดจำค้าง");
    eq([r.forfeitedSatang, r.refundedSatang], [PRICE.dlx(D), 0], "ริบ/คืน");
    ok([r.holdActive, r.depositPendingSatang, r.forfeitedSatang, r.refundedSatang].every((v) => Number.isInteger(v)), "ไม่ใช่ Int");
    ok(!PII_TEXT.test(J(r)), "PII");
  }, "MAJOR");
  await st("RP-8", "exportCsv(kind, rows) → string (§0 CSV ทุกตาราง · X6): ขึ้นต้น BOM \\uFEFF · บรรทัดแรก = หัวตารางไทย · จำนวนบรรทัดข้อมูล = rows · ค่าอันตราย (=HYPERLINK · +66 · @SUM · -2+3) ถูก csvRow ทำให้เป็นข้อความ (ขึ้นต้น ') · reports.ts import csvRow จาก @/lib/core/csv · kind ไม่รู้จัก ⇒ ไม่ throw (ว่าง/ok:false)", async () => {
    needRp(); needScene();
    const occ = rowsOf(okRes(await report("occupancyReport", READER, { groupBy: "day" }), "occ"));
    const csv = RP("exportCsv")("occupancy", occ);
    ok(typeof csv === "string" && csv.startsWith("﻿"), "ไม่มี BOM/ไม่ใช่ string");
    const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l: string) => l.length);
    eq(lines.length, occ.length + 1, "จำนวนบรรทัด");
    ok(THAI.test(lines[0]), "หัวตารางไม่ไทย");
    const evil = RP("exportCsv")("revenue", [{ key: "=HYPERLINK(\"x\")", label: "+66ส่วนลด", source: "@SUM(A1)", roomRevenueSatang: 100, revenueSatang: 100, name: "-2+3" }]);
    const row2 = String(evil).replace(/^﻿/, "").split(/\r?\n/)[1] ?? "";
    ok(!/(^|,)"?[=+@]/.test(row2) || /'=HYPERLINK|'\+66|'@SUM/.test(row2), `สูตรไม่ถูกกัน: ${row2.slice(0, 120)}`);
    ok(/from\s*["']@\/lib\/core\/csv["']/.test(read(F.rp)) && /csvRow\s*\(/.test(stripComments(read(F.rp))), "reports.ts ไม่ใช้ csvRow");
    let unk: unknown;
    try { unk = RP("exportCsv")("ไม่รู้จัก", []); } catch (e) { throw new AssertFail(`kind ไม่รู้จัก throw: ${errMsg(e)}`); }
    ok(typeof unk === "string" || (unk as Any)?.ok === false, "kind ไม่รู้จัก");
  });
  await st("RP-9", "≤ 8 คิวรีต่อรายงาน (§2.7 · ตัวดักคิวรี): occupancyReport day 31 วัน · month 12 เดือน · revenueReport source · bookingFunnel · forecast30 · housekeepingReport · depositsReport — แต่ละตัว ≤ 8 (นับ SQL ที่ไม่ใช่ BEGIN/COMMIT)", async () => {
    needRp(); needScene();
    ok(spyInstalled, "ตัวดักคิวรีไม่ได้ติดตั้ง");
    const bad: string[] = [];
    const probe = async (label: string, f: () => Promise<Any>) => { const a = SQL_LOG.length; const r = await f(); const n = sqlCount(a); if (r?.ok === false) bad.push(`${label}: ${codeOf(r)}`); else if (n > 8) bad.push(`${label}: ${n} คิวรี`); console.log(`     (${label}: ${n} คิวรี)`); };
    await probe("occ day 31", () => report("occupancyReport", READER, { from: W(-30), to: W(0), groupBy: "day" }));
    await probe("occ month 12", () => report("occupancyReport", READER, { from: W(-365), to: W(0), groupBy: "month" }));
    await probe("revenue source", () => report("revenueReport", READER, { from: W(-30), to: W(0), groupBy: "source" }));
    await probe("funnel", () => report("bookingFunnel", READER, { from: W(-30), to: W(0) }));
    await probe("forecast30", () => report("forecast30", READER, {}));
    await probe("housekeeping", () => report("housekeepingReport", READER, { from: W(-30), to: W(0) }));
    await probe("deposits", () => report("depositsReport", READER, { from: W(-30), to: W(0) }));
    eq(bad, [], "เกินงบ/ล้ม");
  });
  await st("RP-10", "getUnitKpi(unitId) (§0 · Overview): UH ⇒ {occupancyTodayBps, arrivalsToday 1 (I เข้าวันนี้), roomRevenueYesterdaySatang = audit D} · occupancyTodayBps = on-the-books (CHECKED_IN คืนนี้ A B + CONFIRMED เข้าวันนี้ I = 3/7 = 4285 · มติ §9.6) · UNY (เมื่อวานปิดแล้ว/ยังไม่ปิดตาม tz) ⇒ ตัวเลข Int · unitId มั่ว ⇒ null · หน่วยหอ/ไม่ใช่โรงแรม ⇒ null · facade hotel/index.ts export getUnitKpi · ไม่มี PII", async () => {
    needRp(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const k = await call(() => RP("getUnitKpi")(UH));
    ok(k && k.ok !== false, `getUnitKpi ${J(k)}`);
    eq(Object.keys(k).sort(), ["arrivalsToday", "occupancyTodayBps", "roomRevenueYesterdaySatang"], "คีย์");
    eq([k.arrivalsToday, k.roomRevenueYesterdaySatang], [1, (await auditRow(UH, D)).roomRevenueSatang], "arrivals/เมื่อวาน");
    eq(k.occupancyTodayBps, bpsRef(3, EXP.availD), "occupancyTodayBps (on-the-books)");
    const ny = await call(() => RP("getUnitKpi")(UNY));
    ok(ny && Number.isInteger(ny.roomRevenueYesterdaySatang) && Number.isInteger(ny.occupancyTodayBps), `UNY ${J(ny)}`);
    eq(await call(() => RP("getUnitKpi")("ไม่มี-unit")), null, "unit มั่ว");
    const dorm = await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, type: "DORM" }, select: { id: true } });
    if (dorm) eq(await call(() => RP("getUnitKpi")(dorm.id)), null, "หน่วยหอ");
    ok(typeof hotelL.mod?.getUnitKpi === "function", "facade ไม่ export getUnitKpi");
  });

  // ═══════════════ X ด่าน ═══════════════
  console.log("\n── X ด่าน (X1 · X9 · X10) ──");
  await st("X-1", "X1 ข้ามร้าน/หน่วย (§2.8): เจ้าของร้าน B (ctx tB) เรียก auditPreview/closeNightAudit/auditHistory ด้วย unitId UH ⇒ NOT_FOUND · reopenNightAudit ด้วย auditId ของ UH ⇒ NOT_FOUND · occupancyReport/revenueReport/bookingFunnel/forecast30/housekeepingReport/depositsReport (ctx tB · UH) ⇒ NOT_FOUND · manager ร้าน A แต่ unitAccess ไม่มี UHB ⇒ NOT_FOUND บน UHB · คำตอบไม่มีข้อมูลหลุด (ไม่มี auditId/ตัวเลข) · ไม่มีแถวเปลี่ยน", async () => {
    needNa(); needRp(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const n0 = await prisma.hotelNightAudit.count({ where: { tenantId: tA } });
    const bad: string[] = [];
    const chk = (label: string, r: Any) => { if (failCode(r) !== "NOT_FOUND") bad.push(`${label}=${codeOf(r)}`); if (r && (r.auditId || (Array.isArray(r.rows) && r.rows.length))) bad.push(`${label} หลุดข้อมูล`); };
    chk("preview", await preview(OWNER_B, { unitId: UH }, ctxB));
    chk("close", await close(OWNER_B, { unitId: UH, businessDate: W(-2) }, ctxB));
    chk("history", await history({ unitId: UH }, ctxB));
    chk("reopen", await reopen(OWNER_B, { auditId: CLOSED.auditId }, ctxB));
    for (const n of ["occupancyReport", "revenueReport", "bookingFunnel", "forecast30", "housekeepingReport", "depositsReport"]) chk(n, await report(n, OWNER_B, { groupBy: n === "revenueReport" ? "source" : "day" }, tB));
    chk("manager A บน UHB", await preview(MGR, { unitId: UHB }));
    chk("close UHB", await close(MGR, { unitId: UHB, businessDate: D }));
    eq(bad, [], "ด่านรั่ว");
    eq(await prisma.hotelNightAudit.count({ where: { tenantId: tA } }), n0, "แถวเปลี่ยน");
  });
  await st("X-2", "X9 สิทธิ์ (§7 · ใบ §1 permissions): ปิดวัน — owner/manager/auditor (STAFF hotel.audit.run) ได้ · frontdesk/maid/none/reader (reports.read อย่างเดียว) ⇒ FORBIDDEN · preview ด่านเดียวกับปิดวัน · reopen frontdesk/auditor(STAFF) ⇒ FORBIDDEN (MANAGER เท่านั้น) · รายงาน — reader/manager/owner ได้ · frontdesk/maid/none/auditor ⇒ FORBIDDEN (หรือ NOT_FOUND แบบรายงานหอ) · actor null ที่ไม่ใช่ cron ⇒ FORBIDDEN/NOT_FOUND", async () => {
    needNa(); needRp(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const bad: string[] = [];
    // ใช้วันที่ปิดแล้ว (D) ⇒ ผู้มีสิทธิ์ได้ ALREADY_CLOSED · ไม่มีสิทธิ์ต้องตก FORBIDDEN ก่อนถึงสถานะ
    for (const [n, a] of [["frontdesk", FRONT], ["maid", MAID], ["none", NONE], ["reader", READER]] as [string, Actor][]) {
      const r = await close(a, {}); if (!isDenied(r)) bad.push(`close ${n}=${codeOf(r)}`);
      const p = await preview(a, {}); if (!isDenied(p)) bad.push(`preview ${n}=${codeOf(p)}`);
    }
    for (const [n, a] of [["owner", OWNER], ["manager", MGR], ["auditor", AUDITOR]] as [string, Actor][]) { const r = await close(a, {}); if (failCode(r) !== "ALREADY_CLOSED") bad.push(`close ${n}=${codeOf(r)} (ต้อง ALREADY_CLOSED)`); const p = await preview(a, {}); if (p?.ok !== true) bad.push(`preview ${n}=${codeOf(p)}`); }
    for (const [n, a] of [["frontdesk", FRONT], ["auditor", AUDITOR], ["reader", READER]] as [string, Actor][]) { const r = await reopen(a, { auditId: CLOSED.auditId }); if (!isDenied(r)) bad.push(`reopen ${n}=${codeOf(r)}`); }
    for (const [n, a] of [["reader", READER], ["manager", MGR], ["owner", OWNER]] as [string, Actor][]) { const r = await report("occupancyReport", a, { groupBy: "day" }); if (r?.ok !== true) bad.push(`report ${n}=${codeOf(r)}`); }
    for (const [n, a] of [["frontdesk", FRONT], ["maid", MAID], ["none", NONE], ["auditor", AUDITOR]] as [string, Actor][]) { const r = await report("occupancyReport", a, { groupBy: "day" }); if (!(isDenied(r) || failCode(r) === "NOT_FOUND")) bad.push(`report ${n}=${codeOf(r)}`); }
    const anon = await call(() => NA("reopenNightAudit")(null, ctxA, { auditId: CLOSED.auditId, reason: "x" }));
    if (!(isDenied(anon) || failCode(anon) === "NOT_FOUND")) bad.push(`reopen null=${codeOf(anon)}`);
    eq(bad, [], "สิทธิ์");
    eq((await auditRow(UH, D)).status, "CLOSED", "สถานะเปลี่ยน");
  });
  await st("X-3", "X10 DTO/payload/ประวัติ ไม่มี PII: auditPreview · auditHistory · รายงานทุกตัว · event hotel.audit.* · AuditLog ของ audit (before/after) ไม่มีชื่อ/เบอร์/อีเมลแขก/publicToken · snapshot ในแถว audit ไม่มี PII · noShows ใน preview มี code ไม่มี guestName", async () => {
    needNa(); needRp(); needScene(); ok(CLOSED.auditId, "ไม่มี NA-2");
    const outs: Any[] = [await preview(MGR, { unitId: UNY }), await history({}), ...(await Promise.all(["occupancyReport", "revenueReport", "bookingFunnel", "forecast30", "housekeepingReport", "depositsReport"].map((n) => report(n, READER, { groupBy: n === "revenueReport" ? "source" : "day" }))))];
    const bad: string[] = [];
    outs.forEach((o, i) => { if (PII_TEXT.test(J(o)) || [...walkKeys(o)].some((k) => PII_KEY.test(k))) bad.push(`DTO#${i}`); });
    const evs = await prisma.outboxEvent.findMany({ where: { tenantId: tA, type: { startsWith: "hotel.audit." } } });
    if (PII_TEXT.test(J(evs.map((e: Any) => e.payload))) || evs.some((e: Any) => [...walkKeys(e.payload)].some((k) => PII_KEY.test(k)))) bad.push("event");
    const logs = await auditsOf(/hotel\.audit|night_audit/);
    ok(logs.length >= 2, "AuditLog ของ audit น้อยกว่า 2");
    if (PII_TEXT.test(J(logs.map((l: Any) => [l.before, l.after])))) bad.push("AuditLog");
    if (PII_TEXT.test(J((await auditRow(UH, D)).snapshot))) bad.push("snapshot");
    eq(bad, [], "PII");
  });

  // ═══════════════ N event 3 ทะเบียน + consumer ═══════════════
  console.log("\n── N event 3 ทะเบียน ──");
  const EVENTS = ["hotel.audit.closed", "hotel.audit.reopened"];
  await st("N-1", "ทะเบียน 3 ที่ (กติกาเหล็ก 15): outbox-consumers.ts มี consumer hotel.audit.closed/reopened · automation/labels.ts AUTOMATION_EVENTS มีทั้ง 2 ป้ายไทย · webhooks WEBHOOK_EVENTS มีทั้ง 2 ผ่าน spread (ไม่ประกาศซ้ำ) · consumer closed อ้าง sendEmailRich + idempotencyKey `hotel-audit-<auditId>` (สถิต) · event เดิม hotel.folio.* ยังอยู่", () => {
    const cons = consumersL.mod?.consumers;
    ok(cons && typeof cons === "object", `โหลด consumers ไม่ได้ ${consumersL.err}`);
    eq(EVENTS.filter((e) => typeof cons[e] !== "function"), [], "consumer ขาด");
    const auto = (autoL.mod?.AUTOMATION_EVENTS ?? []) as Any[];
    eq(EVENTS.filter((e) => !auto.some((x) => x.value === e && THAI.test(x.label ?? ""))), [], "automation label ขาด/ไม่ไทย");
    const wh = (whL.mod?.WEBHOOK_EVENTS ?? []) as Any[];
    eq(EVENTS.filter((e) => !wh.some((x) => x.value === e)), [], "webhook ขาด");
    eq(EVENTS.filter((e) => wh.filter((x) => x.value === e).length > 1), [], "ซ้ำใน webhook");
    const src = stripComments(read(F.consumers));
    ok(/sendEmailRich/.test(src) && /hotel-audit-\$\{/.test(src), "consumer ไม่ส่งอีเมลผ่าน sendEmailRich / idempotencyKey hotel-audit-<auditId>");
    ok(typeof cons["hotel.folio.posted"] === "function" && typeof cons["hotel.booking.no_show"] === "function", "consumer เดิมหาย");
  });
  await st("N-2", "payload/การส่ง: ทุกชนิดมี ≥ 1 แถวในร้าน A · unitId บนแถว · idempotencyKey ไม่ซ้ำทั้งร้าน · consumers[type](event) เรียกกับแถวจริง ⇒ resolve ไม่โยน (อีเมลสรุป idempotent — เรียกซ้ำไม่โยน) · drain แล้ว event hotel.audit.* ไม่ค้าง PENDING/FAILED", async () => {
    needNa(); needScene();
    const cons = consumersL.mod?.consumers;
    ok(cons, "ไม่มี consumers");
    const bad: string[] = [];
    for (const t of EVENTS) {
      const evs = await eventsOf(t);
      if (!evs.length) { bad.push(`${t} ไม่มีแถว`); continue; }
      if (evs.some((e) => !e.unitId)) bad.push(`${t}: ไม่มี unitId บนแถว`);
      try { await cons[t](evs[0]); await cons[t](evs[0]); } catch (e) { bad.push(`${t}: ${errMsg(e)}`); }
    }
    eq(bad, [], "event");
    const all = await prisma.outboxEvent.findMany({ where: { tenantId: tA }, select: { idempotencyKey: true } });
    eq(new Set(all.map((e: Any) => e.idempotencyKey)).size, all.length, "idempotencyKey ซ้ำ");
    await drain();
    eq(await prisma.outboxEvent.count({ where: { tenantId: tA, type: { startsWith: "hotel.audit." }, status: { not: "DONE" } } }), 0, "event ค้าง");
  });

  // ═══════════════ U UI/โค้ดสถิต ═══════════════
  console.log("\n── U สถิต ──");
  const COMPS: string[] = [F.panel, F.history, F.screen, F.table, F.kpi, F.chart];
  const PAGES: string[] = [F.reportsPage, F.auditPage];
  await st("U-1", "ไฟล์ของใบครบ (§1): business-date.ts · night-audit.ts · reports.ts · 6 คอมโพเนนต์ + reports-shared.ts · หน้า reports · reports/audit · reports/export/route.ts · ฉาก svc-qc-hotel-audit-scene.mts · docs/sds/modules/hotel.md มี §night audit/รายงาน (สูตร · business date · idempotent)", () => {
    eq([F.bd, F.na, F.rp, ...COMPS, F.shared, ...PAGES, F.exportRoute, F.scene].filter((f) => !has(f)), [], "ขาด");
    const sds = read(F.sds);
    ok(/night audit|ปิดวัน/i.test(sds) && /RevPAR/.test(sds) && /business ?date|วันทางธุรกิจ|timezone/i.test(sds) && /idempoten/i.test(sds), "sds ไม่มี §night audit/รายงาน");
  });
  await st("U-2", "actions.ts (§3.4): บล็อก // SVC H.7 ▸ … ◂ มี closeNightAuditAction + reopenNightAuditAction · requireUnit + ด่าน HOTEL + สิทธิ์ hotel.audit.run · \"use server\" ไม่ export type/const ใหม่ในบล็อก · ไม่มี action รายงาน (RSC อ่านตรง) · actions ไม่รับ at/SVC_QC_CLOCK", () => {
    const a = read(F.actions);
    const blk = /SVC H\.7 ▸([\s\S]*?)◂(?![\s\S]*SVC H\.7 ▸)/.exec(a)?.[1] ?? "";
    ok(blk, "ไม่มีบล็อก // SVC H.7 ▸ … ◂ ใน actions.ts");
    ok(/closeNightAuditAction/.test(blk) && /reopenNightAuditAction/.test(blk), "ไม่มี action ปิดวัน/reopen");
    ok(/requireUnit/.test(blk) && /"HOTEL"/.test(blk) && /hotel\.audit\.run/.test(blk), "ไม่มี requireUnit/HOTEL/audit.run ในบล็อก");
    ok(!/^\s*export\s+(type|interface|const)\s/m.test(stripComments(blk)), "บล็อก export type/const (ห้ามใน \"use server\")");
    ok(!/Report(Action)?\b.*=\s*async|export async function \w*[Rr]eport\w*Action/.test(blk), "มี action รายงาน");
    ok(!/SVC_QC_CLOCK/.test(a), "actions อ่าน SVC_QC_CLOCK");
  });
  await st("U-3", "แท็บ reports เปิด (§1 ORACLE-EDIT h.1): HOTEL_TABS reports available true path /hotel/reports · hotelTabsFor ซ่อนแท็บรายงานเมื่อไม่มี hotel.reports.read (พารามิเตอร์ reportsRead) หรือหน้า/layout ตรวจสิทธิ์เอง · frontdesk (ฟิกซ์เจอร์ไม่มี reports.read) ไม่เห็นแท็บ", () => {
    const tabs = tabsL.mod?.HOTEL_TABS as Any[];
    ok(Array.isArray(tabs), "โหลด hotel-tabs-shared ไม่ได้");
    const rep = tabs.find((t) => t.key === "reports");
    eq([rep?.available, rep?.path], [true, "/hotel/reports"], "reports tab");
    const f = tabsL.mod.hotelTabsFor;
    const withR = f({ ratesRead: true, settingsEdit: true, reportsRead: true }, "/app/u/x").some((t: Any) => t.key === "reports");
    const withoutR = f({ ratesRead: true, settingsEdit: true, reportsRead: false }, "/app/u/x").some((t: Any) => t.key === "reports");
    const layout = stripComments(read("src/app/app/u/[unitSlug]/hotel/layout.tsx"));
    const gated = withR && !withoutR && /reportsRead/.test(layout) && /hotel\.reports\.read/.test(layout);
    const pageGate = /hotel\.reports\.read/.test(stripComments(read(F.reportsPage))) && /notFound\(\)/.test(read(F.reportsPage));
    ok(gated || (withR && pageGate), `แท็บรายงานไม่ถูกคุมสิทธิ์ (hotelTabsFor ${J([withR, withoutR])} · layout reportsRead ${/reportsRead/.test(layout)} · page gate ${pageGate})`);
    ok(pageGate, "หน้า reports ไม่ตรวจ hotel.reports.read + notFound");
  });
  await st("U-4", "หน้า (§4): reports/page.tsx + audit/page.tsx requireUnit + \"HOTEL\" + notFound · reports อ่าน searchParams tab/groupBy/from/to · audit ตรวจ hotel.audit.run · export/route.ts ตรวจสิทธิ์เดียวกับหน้า (hotel.reports.read) + Content-Disposition ชื่อไฟล์ไม่มีชื่อร้าน (ใช้ unitId/id · ไม่มี unit.name/tenant.name) + text/csv · ไม่มีหน้าใด import ไฟล์ server ของ hotel ตรง (night-audit/reports/booking/folio/service) — ผ่าน facade @/lib/modules/hotel", () => {
    const rp = stripComments(read(F.reportsPage)), ap = stripComments(read(F.auditPage)), ex = stripComments(read(F.exportRoute));
    ok(rp && ap && ex, "ยังไม่มีหน้า/route");
    const bad: string[] = [];
    for (const [n, sx] of [["reports", rp], ["audit", ap]] as [string, string][]) for (const w of ["requireUnit", "\"HOTEL\"", "notFound"]) if (!sx.includes(w)) bad.push(`${n}: ${w}`);
    if (!/searchParams/.test(rp) || !/tab/.test(rp) || !/groupBy/.test(rp)) bad.push("reports ไม่อ่าน ?tab/?groupBy");
    if (!/hotel\.audit\.run/.test(ap)) bad.push("audit ไม่ตรวจ hotel.audit.run");
    if (!/hotel\.reports\.read/.test(ex)) bad.push("export ไม่ตรวจ hotel.reports.read");
    if (!/Content-Disposition/i.test(ex) || !/text\/csv/i.test(ex)) bad.push("export ไม่มี Content-Disposition/text/csv");
    const fnLine = ex.split("\n").find((l) => /filename/i.test(l)) ?? "";
    if (!fnLine) bad.push("export ไม่ตั้ง filename");
    if (/unit\.name|tenant\.name|\.name\b/.test(fnLine)) bad.push(`filename มีชื่อร้าน: ${fnLine.trim().slice(0, 100)}`);
    for (const [n, sx] of [["reports", rp], ["audit", ap], ["export", ex]] as [string, string][]) if (/@\/lib\/modules\/hotel\/(night-audit|reports|booking|folio|service|checkout|business-date)["']/.test(sx)) bad.push(`${n}: import ไฟล์ server ตรง`);
    eq(bad, [], "หน้า");
  });
  await st("U-5", "ไทย + ป้ายสำคัญ (§4): 6 คอมโพเนนต์ + 2 หน้า ไม่มีคำอังกฤษ (ยกเว้น ADR/RevPAR/CSV/KPI/POS) · มีป้าย: อัตราเข้าพัก · รายได้ห้อง · ปิดวัน · ไม่มา · ปิดอัตโนมัติ · ส่งออก CSV · ล่วงหน้า 30 วัน · แม่บ้าน · มัดจำ · เหตุผล (reopen) · กราฟเป็น SVG เอง (มี <svg หรือ <path/<rect/<polyline) ไม่มีไลบรารีกราฟ · data-scroll-hint + overflow-x-auto บนตาราง", () => {
    const bad: string[] = [];
    for (const f of [...COMPS, ...PAGES]) { const sx = read(f); if (!sx) { bad.push(`${f}: ยังไม่มี`); continue; } const en = englishInJsx(sx); if (en.length) bad.push(`${f}: ${en.slice(0, 6).join(", ")}`); }
    eq(bad, [], "อังกฤษ");
    const all = [...COMPS, ...PAGES, F.shared].map((f) => read(f)).join("\n");
    eq(["อัตราเข้าพัก", "รายได้ห้อง", "ปิดวัน", "ไม่มา", "ปิดอัตโนมัติ", "CSV", "30 วัน", "แม่บ้าน", "มัดจำ", "เหตุผล"].filter((w) => !all.includes(w)), [], "ป้ายขาด");
    const chart = read(F.chart);
    ok(/<svg/.test(chart) && /<(path|rect|polyline|line|circle)\b/.test(chart), "ForecastChart ไม่ใช่ SVG เอง");
    eq([...COMPS, ...PAGES].filter((f) => CHART_LIBS.test(read(f))), [], "ไลบรารีกราฟ");
    ok(/data-scroll-hint/.test(read(F.table)) && /overflow-x-auto/.test(read(F.table)), "ReportTable ไม่มี data-scroll-hint/overflow-x-auto");
    ok(/data-scroll-hint/.test(read(F.history) + read(F.panel)), "AuditHistory/NightAuditPanel ไม่มี data-scroll-hint");
  });
  await st("U-6", "เงิน/เปอร์เซ็นต์บนจอ (§2.7): reports-shared/คอมโพเนนต์ แสดง ฿ ทศนิยม 2 (minimumFractionDigits: 2 / toFixed(2)) จากสตางค์ ÷ 100 · % 1 ตำแหน่งจาก bp (÷ 100 · toFixed(1)/maximumFractionDigits: 1) · reports-shared pure (ไม่มี import ค่า · ไม่มี directive) · ปุ่มปิดวันใต้ canRun/canClose · reopen ใต้ canReopen/MANAGER · อ่านอย่างเดียวไม่มีปุ่ม", () => {
    ok(has(F.shared) && COMPS.every((f) => has(f)), "ยังไม่มีคอมโพเนนต์/reports-shared.ts");
    const all = COMPS.concat([F.shared]).map((f) => stripComments(read(f))).join("\n");
    ok(/minimumFractionDigits:\s*2|toFixed\(2\)/.test(all) && /\/\s*100/.test(all), "ไม่มีการจัดรูป ฿ ทศนิยม 2");
    ok(/toFixed\(1\)|maximumFractionDigits:\s*1|minimumFractionDigits:\s*1/.test(all), "ไม่มี % 1 ตำแหน่ง");
    const sh = read(F.shared);
    eq(importSpecs(sh).filter((i) => !i.typeOnly).map((i) => i.spec), [], "reports-shared import ค่า");
    ok(!/["']use (client|server)["']/.test(stripComments(sh)), "reports-shared มี directive");
    const panel = stripComments(read(F.panel)), hist = stripComments(read(F.history));
    ok(/canRun|canClose|canAudit|readOnly/.test(panel), "NightAuditPanel ไม่มี prop สิทธิ์");
    ok(/canReopen|canManage|isManager|readOnly/.test(hist + panel), "reopen ไม่อยู่ใต้ prop สิทธิ์");
  });
  await st("U-7", "'use client' ไม่ลาก server (กติกา 14): คอมโพเนนต์ที่มี 'use client' กราฟ import (ค่า) ไม่ถึง @/lib/core/db · @prisma/client · hotel/(night-audit|reports|booking|folio|service|business-date) · rooms/pos/account · หน้า hotel/page.tsx มีป้าย \"ยังไม่ปิดวัน\" + ลิงก์ /hotel/reports/audit", () => {
    const resolveSpec = (fromRel: string, spec: string): string | null => {
      let base: string;
      if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2)); else if (spec.startsWith(".")) base = join(ROOT, dirname(fromRel), spec); else return null;
      for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && !c.endsWith("/")) { try { readFileSync(c, "utf8"); return c.slice(ROOT.length + 1); } catch { /* โฟลเดอร์ */ } }
      return null;
    };
    const SERVER = /^src\/lib\/modules\/hotel\/(night-audit|reports|booking|folio|service|business-date|checkout|rates)\.ts$|^src\/lib\/modules\/(rooms|pos|account)\//;
    const reach = (startRel: string): string[] => { const seen = new Set<string>(); const bad: string[] = []; const walk = (rel: string, path: string[]) => { if (seen.has(rel)) return; seen.add(rel); const src = read(rel); if (!src) return; if (rel !== startRel && /^\s*["']use server["']/m.test(src)) return; for (const { spec, typeOnly } of importSpecs(src)) { if (typeOnly) continue; if (spec === "@prisma/client" || spec === "server-only" || spec === "@/lib/core/db" || /^@prisma\//.test(spec)) { bad.push([...path, rel, spec].join(" → ")); continue; } const r = resolveSpec(rel, spec); if (!r) continue; if (SERVER.test(r) || r === "src/lib/core/db.ts") { bad.push([...path, rel, r].join(" → ")); continue; } walk(r, [...path, rel]); } }; walk(startRel, []); return bad; };
    const bad: string[] = [];
    let clientCount = 0;
    for (const f of COMPS) { const sx = read(f); if (!sx) { bad.push(`${f} ยังไม่มี`); continue; } if (/^\s*["']use client["']/m.test(sx)) { clientCount++; bad.push(...reach(f)); } }
    ok(clientCount >= 2, "คอมโพเนนต์ที่เป็น client น้อยกว่า 2 (ปุ่มปิดวัน/ตัวกรองต้องเป็น client)");
    eq(bad, [], "เส้นลากถึง server");
    const hp = read(F.hotelPage);
    ok(/ยังไม่ปิดวัน/.test(hp) && /\/hotel\/reports\/audit/.test(hp), "หน้าเคาน์เตอร์ไม่มีป้าย ยังไม่ปิดวัน/ลิงก์ audit");
  });
  await st("U-8", "facade hotel/index.ts (§1 บล็อก // SVC H.7 ▸ … ◂): export auditPreview · closeNightAudit · reopenNightAudit · auditHistory · runDueAudits · computeKpi · occupancyReport · revenueReport · bookingFunnel · forecast30 · housekeepingReport · depositsReport · exportCsv · getUnitKpi · businessDateOf · nextBusinessDate · isAuditDue · ของเดิม (createBooking · postRoomNights · blockRoom) ครบ · night-audit.ts export computeKpi (pure รับแถว)", () => {
    ok(hotelL.mod, hotelL.err);
    const names = ["auditPreview", "closeNightAudit", "reopenNightAudit", "auditHistory", "runDueAudits", "computeKpi", "occupancyReport", "revenueReport", "bookingFunnel", "forecast30", "housekeepingReport", "depositsReport", "exportCsv", "getUnitKpi", "businessDateOf", "nextBusinessDate", "isAuditDue", "createBooking", "postRoomNights", "blockRoom"];
    eq(names.filter((n) => typeof hotelL.mod[n] !== "function"), [], "ขาด");
    ok(/SVC H\.7 ▸[\s\S]*◂/.test(read(F.index)), "ไม่มีบล็อก // SVC H.7 ▸ … ◂");
    ok(typeof naL.mod?.computeKpi === "function", "night-audit.ts ไม่ export computeKpi");
  });
  await st("U-9", "ค่าตั้งใหม่ (§1 defs/rooms.ts เพิ่มคีย์อย่างเดียว): ใช้ rooms.hotel.nightAuditTime (#76 เดิม · 03:00) ไม่เพิ่ม rooms.hotel.auditAutoTime (มติ §9.7) · rooms.hotel.audit.autoClose bool true · rooms.hotel.audit.notifyRoles enum[] ค่าเริ่ม [OWNER, MANAGER] (รับ OWNER/MANAGER/STAFF? อย่างน้อย OWNER,MANAGER) · ป้ายไทย · def โรงแรม (hotel(...)) · def เดิมไม่หาย (noShow · dailyHousekeeping · nightAuditTime) · permissions.ts: hotel.audit.run/hotel.reports.read ออกจาก planned", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k} (ยังไม่มีงาน H.7)`); return x; };
    const t = d("rooms.hotel.nightAuditTime"), c = d("rooms.hotel.audit.autoClose"), n = d("rooms.hotel.audit.notifyRoles");
    ok(!SET.getDef("rooms.hotel.auditAutoTime"), "เพิ่ม rooms.hotel.auditAutoTime ทั้งที่มติ §9.7 ให้ใช้ nightAuditTime");
    eq([t.defaults._fallback, c.defaults._fallback, n.defaults._fallback], ["03:00", true, ["OWNER", "MANAGER"]], "ค่าเริ่ม");
    ok(t.schema.safeParse("23:30").success && !t.schema.safeParse("25:00").success && c.schema.safeParse(false).success && n.schema.safeParse(["OWNER"]).success && !n.schema.safeParse(["ALIEN"]).success, "schema");
    ok([t, c, n].every((x) => THAI.test(x.labelTh ?? "")), "ป้ายไทย");
    const src = stripComments(read(F.roomsDefs)).replace(/\n/g, " ");
    for (const k of ["rooms.hotel.nightAuditTime", "rooms.hotel.audit.autoClose", "rooms.hotel.audit.notifyRoles"]) ok(new RegExp(`hotel\\(\\s*\\{[^}]*key:\\s*"${k.replace(/\./g, "\\.")}"`).test(src), `${k} ไม่ใช่ def โรงแรม (hotel(...))`);
    ok(SET.getDef("rooms.hotel.noShow") && SET.getDef("rooms.hotel.dailyHousekeeping") && SET.getDef("rooms.hotel.nightAuditTime"), "def เดิมหาย");
    const planned = /planned:\s*\[([\s\S]*?)\]/.exec(read(F.perms).split('module: "hotel"')[1] ?? "")?.[1] ?? "";
    ok(!/hotel\.audit\.run|hotel\.reports\.read/.test(planned), "hotel.audit.run/hotel.reports.read ยังอยู่ใน planned");
  });
  await st("U-10", "night-audit.ts/reports.ts (§0 · §1 ห้ามแตะ): night-audit ใช้ markNoShow ของ booking.ts (ไม่เขียน status NO_SHOW ตรง · ไม่ import pos/deposit ตรง) · ใช้ postRoomNights/postRoomNightsTx ของ folio.ts · มี ALREADY_CLOSED/TOO_EARLY/PREVIOUS_OPEN/NOT_FOUND/FORBIDDEN · เรียก markStayoversDirty เฉพาะเมื่อ housekeeping.ts มี (import แบบ try/dynamic หรือมีไฟล์) · reports.ts มี INVALID_RANGE · 366 · ไม่ใช้ getDay/getDate ดิบ · ทั้งสองไม่มี \"use server\" (actions.ts เป็นคนมี)", () => {
    const na = stripComments(read(F.na)), rp = stripComments(read(F.rp));
    ok(na && rp, "ยังไม่มี night-audit.ts/reports.ts");
    ok(/markNoShow/.test(na), "ไม่ใช้ markNoShow");
    ok(!/status:\s*["']NO_SHOW["']/.test(na), "เขียน NO_SHOW ตรง");
    ok(!/@\/lib\/modules\/pos/.test(na), "night-audit import pos ตรง");
    ok(/postRoomNights(Tx)?\s*\(/.test(na), "ไม่ใช้ postRoomNights");
    for (const c of ["ALREADY_CLOSED", "TOO_EARLY", "PREVIOUS_OPEN", "NOT_FOUND", "FORBIDDEN"]) ok(na.includes(c), `ไม่มีรหัส ${c}`);
    if (!HK_SKIP) ok(/markStayoversDirty/.test(na), "ไม่เรียก markStayoversDirty (H.6 มีแล้ว)");
    ok(/INVALID_RANGE/.test(rp) && /366/.test(rp), "reports ไม่มี INVALID_RANGE/366");
    ok(!/\.getDay\(\)|\.getDate\(\)/.test(na + rp), "ใช้ getDay/getDate ดิบ");
    ok(!/["']use server["']/.test(na + rp), "night-audit/reports มี use server");
  });

  // ═══════════════ F ไฟล์ที่แตะ (git · ตอนรับใบ) ═══════════════
  console.log("\n── F ไฟล์ที่แตะ (git) ──");
  const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const OWN = new Set<string>([F.bd, F.na, F.rp, F.service, F.index, F.actions, F.minuteJobs, F.roomsDefs, F.perms, F.consumers, F.autoLabels, F.whLabels, ...COMPS, F.shared, ...PAGES, F.exportRoute, F.hotelPage, F.tabsShared, F.scene, F.sds, "scripts/qc-svc-h.7.mts", "scripts/probe-h7-b.mts"]);
  {
    const ch = dirty(["src", "prisma", "public", "scripts", "docs", "vercel.json"]).filter((f) => f !== "scripts/qc-svc-h.7.mts" && f !== "scripts/probe-h7-b.mts");
    const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.na}`]); return true; } catch { return false; } })();
    if (ch.length === 0 && headHas) skip("F-1", "แตะเฉพาะไฟล์ของใบ (§1)", "H.7 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
    else await st("F-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ): business-date/night-audit/reports/service/index/actions · minute-jobs.ts · defs/rooms.ts · permissions.ts · 3 ทะเบียน event · 6 คอมโพเนนต์ + reports-shared · หน้า reports/audit/export · hotel/page.tsx · hotel-tabs-shared.ts · ฉาก · sds — ไม่แตะอื่น", () => {
      ok(ch.length > 0, "ยังไม่มีงาน (git status ว่าง) — ยังไม่มี night-audit.ts");
      eq(ch.filter((f) => !OWN.has(f)).slice(0, 10), [], "ไฟล์นอกใบ");
    });
  }
  await st("F-2", "ไม่แตะชิ้นต้องห้าม (§1): prisma/** · booking.ts · folio.ts · housekeeping.ts · checkout.ts · rooms/** · pos/** · vercel.json · svc-qc-data.mts · ข้อสอบอื่น (qc-svc-h.0–h.6) · src/lib/core (ยกเว้น permissions.ts · settings/defs/rooms.ts) · hotel-tabs-shared.ts แก้ค่าเดียว (diff เทียบ HEAD เปลี่ยน ≤ 1 บรรทัด available) — ตรวจเมื่อมีงาน", () => {
    ok(has(F.na), `ยังไม่มี ${F.na} — ตรวจตอนรับใบ`);
    const banned = dirty(["prisma", F.booking, F.folio, F.hk, F.checkout, "src/lib/modules/rooms", "src/lib/modules/pos", F.vercel, "scripts/svc-qc-data.mts", "scripts/qc-svc-h.0.mts", "scripts/qc-svc-h.1.mts", "scripts/qc-svc-h.2.mts", "scripts/qc-svc-h.3.mts", "scripts/qc-svc-h.4.mts", "scripts/qc-svc-h.5.mts", "scripts/qc-svc-h.6.mts", "src/lib/core"]).filter((f) => f !== F.perms && f !== F.roomsDefs);
    eq(banned, [], "ไฟล์ต้องห้าม");
    if (dirty([F.tabsShared]).length) {
      const changed = git(["diff", "-U0", "HEAD", "--", F.tabsShared]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
      const minus = changed.filter((l) => l.startsWith("-")), plus = changed.filter((l) => l.startsWith("+"));
      ok(minus.length <= 1 && plus.length <= 1 && plus.every((l) => /reports/.test(l) && /available:\s*true/.test(l)), `hotel-tabs-shared แก้เกินค่าเดียว: ${J(changed).slice(0, 200)}`);
    }
  });
  await st("F-3", "ไม่ลบของเดิม (§1 เพิ่มอย่างเดียว): defs/rooms.ts · permissions.ts (ยกเว้น 2 บรรทัดใน planned) · minute-jobs.ts · index.ts · actions.ts · 3 ทะเบียน event ไม่มีบรรทัดถูกลบเทียบ HEAD (ที่ไม่ว่าง) · service.ts ลบได้เฉพาะ todayBkk/parseDate", () => {
    ok(has(F.na), `ยังไม่มี ${F.na} — ตรวจตอนรับใบ`);
    const rm = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && l.slice(1).trim());
    const bad: string[] = [];
    for (const f of [F.roomsDefs, F.minuteJobs, F.index, F.actions, F.consumers, F.autoLabels, F.whLabels]) if (dirty([f]).length && rm(f).length > 0) bad.push(`${f} ลบ ${rm(f).length}`);
    const permRm = rm(F.perms).filter((l) => !/hotel\.audit\.run|hotel\.reports\.read/.test(l));
    if (permRm.length) bad.push(`${F.perms} ลบ ${permRm.length} นอก planned`);
    const svcRm = rm(F.service).filter((l) => !/todayBkk|parseDate|bkkYmd|toISOString|return |^-\s*\}?\s*$/.test(l));
    if (svcRm.length > 2) bad.push(`${F.service} ลบ ${svcRm.length} นอก todayBkk/parseDate`);
    eq(bad, [], "ลบบรรทัด");
  }, "MAJOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  await restoreSvcqcAutoClose();
  try { await dropFailTrigger(); } catch { /* ไม่มี */ }
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  delete process.env.SVC_QC_CLOCK;
  await st("Z-1", "หลังล้าง: tenant `svc-h7-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (รวม HotelNightAudit/Hotel*/PosSale/PosDeposit/AccountJournal*/OutboxEvent/AuditLog/SettingValue) · ผู้ใช้ทดสอบ 0 · ไม่มี trigger/ฟังก์ชัน qc_h7_fail · ไม่มี SVC_QC_CLOCK ค้าง · autoClose ของ svcqc คืนค่าแล้ว", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: MAIL } } }), 0, "user");
    const trg: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM pg_trigger WHERE tgname = '${TRIGGER}'`);
    eq(Number(trg[0]?.n ?? 0), 0, "trigger ค้าง");
    ok(!process.env.SVC_QC_CLOCK, "SVC_QC_CLOCK ค้าง");
    eq(AUTO_CLOSE_UNITS.length, 0, "autoClose ยังไม่คืน");
  }, "MAJOR");
}

// ═══════════════ Q ฉาก svcqc (svc-qc-hotel-audit-scene) ═══════════════
console.log("\n── Q ฉาก svcqc (svc-qc-hotel-audit-scene · ยืนบน h.1 → h.3) ──");
{
  let why = "";
  let unitId = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.hotel.slug, type: "HOTEL" }, select: { id: true } }) : null;
    const nt = u ? await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id } }) : 0;
    if (!t || !u || nt < 3) why = "ร้าน svcqc/หน่วย hotel ยังไม่ seed บนฐานนี้ (scripts/seed-svc-qc.mts)";
    else if (!H0_OK) why = H0_WHY;
    else if (!bookL.mod || !folioL.mod) why = `ยังไม่มี ${F.booking}/${F.folio}`;
    else if (!naL.mod || !rpL.mod) why = `ยังไม่มี ${F.na}/${F.rp}`;
    else if (!has(F.sceneH1) || !has(F.sceneH3)) why = `ยังไม่มีฉาก ${F.sceneH1}/${F.sceneH3}`;
    else if (!has(F.scene)) why = `ยังไม่มี ${F.scene}`;
    else unitId = u.id;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScript = (rel: string, args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", rel, ...args], { cwd: ROOT, env: { ...process.env }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const sctx = { tenantId: SQC_TENANT.id };
  const sceneRv = (key: string, mark: string) => prisma.hotelReservation.findFirst({ where: { tenantId: SQC_TENANT.id, unitId, note: { contains: `${mark} #${key}#` } } }) as Promise<Any>;
  const sAudit = (ymd: string) => prisma.hotelNightAudit.findFirst({ where: { unitId, businessDate: dbDate(ymd) } }) as Promise<Any>;
  const sRoomItems = (ymd: string) => prisma.hotelFolioItem.findMany({ where: { tenantId: SQC_TENANT.id, unitId, type: "ROOM", businessDate: dbDate(ymd) } }) as Promise<Any[]>;
  const sNightsOn = (rid: string, ymd: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: rid, date: dbDate(ymd) } }) as Promise<Any[]>;
  const settingRows = () => prisma.settingValue.findMany({ where: { tenantId: SQC_TENANT.id, scope: "UNIT", scopeId: unitId, key: { in: Object.keys(AS.settings) } } }) as Promise<Any[]>;
  const otherSig = async () => J([await prisma.hotelReservation.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelNightAudit.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelFolioItem.count({ where: { NOT: { tenantId: SQC_TENANT.id } } })]);
  const SD = sqcAddDays(SQC_TODAY_BKK, AS.businessDateOffset);
  const REV = refScenePrice("ดีลักซ์", SD) + refScenePrice("ซูพีเรีย", SD);
  const n1 = `ฉาก ${F.scene}: (h.1 → --clear h.2/h.5/h.6 ถ้ามี → h.3 --clear → h.3 → h.7) exit 0 · SCENE_SUMMARY {created,updated,removed} · audit-noshow CONFIRMED มัดจำจ่าย ไม่เช็กอิน (note มี mark) · ค่าตั้ง UNIT ตาม AS.settings · ยังไม่ปิดวัน (HotelNightAudit 0 · ให้หน้า audit แสดง preview) · ร้านอื่นไม่เปลี่ยน`;
  const n2 = `closeNightAudit(owner svcqc, D = ${SD}) ⇒ แถว audit: roomsTotal 13 · OOO 0 · available 13 · occupied 2 · bps 1538 · revenue = ราคาคืน D ดีลักซ์ + ซูพีเรีย (pricing ref) · ADR = revenue÷2 · RevPAR = revenue÷13 · audit-noshow ⇒ NO_SHOW + บิลริบ PAID + folio VOID (มติ §9.1) · ROOM วัน D 2 แถว (inhouse-web · inhouse-ota) postedAuditId = auditId · event closed kpi.noShows ≥ 1 · stayovers DIRTY 2 (${HK_SKIP ? "ข้าม — H.6" : "ตรวจ"})`;
  const n3 = "ปิดซ้ำ ⇒ ALREADY_CLOSED · ปิดวันนี้ ⇒ TOO_EARLY · reopen (manager svcqc · เหตุผล) → ปิดใหม่ ⇒ CLOSED · ROOM วัน D ยัง 2 (ไม่โพสต์ซ้ำ) · KPI เท่าเดิม · บิลริบ 1 · history 1";
  const n4 = "--clear ⇒ audit-noshow หาย · HotelNightAudit ของหน่วย 0 · ROOM วัน D ที่ audit โพสต์หาย + nights.postedAuditId/folioItemId คืน null (ฉาก h.5 ยังคาด ROOM 1/inhouse-ota DEPOSIT อย่างเดียว) · ค่าตั้ง UNIT ของฉากถูกถอด · แถวนอก mark คงเดิม · รันคืน ⇒ สถานะก่อนปิดวัน";
  if (why) { for (const [id, n] of [["Q-1", n1], ["Q-2", n2], ["Q-3", n3], ["Q-4", n4]]) skip(id, n, why, "MAJOR"); }
  else {
    const sqcMgrU = SQC_USERS.find((u) => u.key === "manager")!;
    const SQC_MGR: Actor = { role: sqcMgrU.role as Actor["role"], unitAccess: [...sqcMgrU.unitAccess], permissions: { ...sqcMgrU.permissions }, userId: sqcMgrU.userId };
    let AUD: Any = null;
    await st("Q-1", n1, async () => {
      ok(runScript(F.sceneH1).status === 0, "ฉาก h.1 ล้ม");
      for (const sc of [F.sceneH6, F.sceneH5, F.sceneH2]) if (has(sc)) runScript(sc, ["--clear"]);
      runScript(F.scene, ["--clear"]);
      runScript(F.sceneH3, ["--clear"]);
      ok(runScript(F.sceneH3).status === 0, "ฉาก h.3 ล้ม");
      const o0 = await otherSig();
      const a = runScript(F.scene);
      const sum0 = summary(`${a.stdout}`);
      ok(a.status === 0 && sum0 && ["created", "updated", "removed"].every((k) => typeof sum0[k] === "number"), `exit=${a.status} ${sum0 ? fmt(sum0) : `${a.stdout}${a.stderr}`.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
      const ns = await sceneRv("audit-noshow", AS.mark);
      ok(ns, "ไม่มี audit-noshow");
      eq([ns.status, !!ns.depositPaidAt, !!ns.depositSaleId, ymdOfDb(ns.checkInDate), ns.checkedInAt ?? null, ns.source], ["CONFIRMED", true, true, SD, null, "PHONE"], "audit-noshow");
      const rows = await settingRows();
      const got = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      eq(got, { ...AS.settings }, "ค่าตั้ง UNIT");
      eq(await prisma.hotelNightAudit.count({ where: { unitId } }), 0, "ปิดวันไปแล้ว");
      eq(await otherSig(), o0, "ร้านอื่นเปลี่ยน");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const web = await sceneRv("inhouse-web", BS.mark), ota = await sceneRv("inhouse-ota", BS.mark), ns = await sceneRv("audit-noshow", AS.mark);
      ok(web && ota && ns, "ไม่มีแถวฉาก h.3/h.7");
      const r = okRes(await call(() => NA("closeNightAudit")(SQC_OWNER, sctx, { unitId, businessDate: SD })), "closeNightAudit");
      AUD = await sAudit(SD);
      ok(AUD && AUD.id === r.auditId && AUD.status === "CLOSED", "ไม่มีแถว audit");
      eq(kpiOfRow(AUD), { roomsTotal: AS.expect.roomsTotal, roomsOOO: AS.expect.roomsOOO, roomsAvailable: AS.expect.roomsAvailable, roomsOccupied: AS.expect.roomsOccupied, occupancyBps: AS.expect.occupancyBps, roomRevenueSatang: REV, adrSatang: roundRef(REV, AS.expect.roomsOccupied), revparSatang: roundRef(REV, AS.expect.roomsAvailable) }, "KPI ฉาก");
      const ns2 = await prisma.hotelReservation.findUnique({ where: { id: ns.id } });
      eq(ns2.status, "NO_SHOW", "audit-noshow ไม่เป็น NO_SHOW");
      const dep = await prisma.posDeposit.findUnique({ where: { receiptSaleId: ns.depositSaleId } });
      ok(dep && (await prisma.posSale.count({ where: { tenantId: SQC_TENANT.id, idempotencyKey: { startsWith: `dep-forfeit:${dep.id}` }, status: "PAID" } })) === 1, "ไม่มีบิลริบ");
      const items = (await prisma.hotelFolioItem.findMany({ where: { folio: { reservationId: ns.id } } })) as Any[];
      const live = items.filter((i) => !i.voidedAt);
      eq(live.map((i) => i.type), ["DEPOSIT"], "folio audit-noshow มีรายการนอก DEPOSIT");
      const f = await prisma.hotelFolio.findUnique({ where: { reservationId: ns.id } });
      eq(f.status, "VOID", "folio audit-noshow ต้อง VOID ตาม H.3");
      const ri = await sRoomItems(SD);
      eq(ri.filter((i) => !i.voidedAt).length, AS.expect.roomNightsPosted, "ROOM วัน D");
      for (const rv of [web, ota]) { const n = (await sNightsOn(rv.id, SD))[0]; ok(n && n.postedAuditId === AUD.id && n.folioItemId, `night ${rv.code}`); }
      const ev = await eventsOfTenant(SQC_TENANT.id, "hotel.audit.closed", (p: Any) => p.auditId === AUD.id);
      ok(ev.length === 1 && ev[0].payload?.kpi?.noShows >= 1, "event closed");
      if (!HK_SKIP) for (const rv of [web, ota]) eq((await prisma.hotelRoom.findUnique({ where: { id: rv.roomId } })).hkStatus, "DIRTY", `stayover ${rv.code}`);
    }, "MAJOR");
    await st("Q-3", n3, async () => {
      ok(AUD, "ไม่มี Q-2");
      eq(failCode(await call(() => NA("closeNightAudit")(SQC_OWNER, sctx, { unitId, businessDate: SD }))), AS.expect.closeTwice, "ปิดซ้ำ");
      eq(failCode(await call(() => NA("closeNightAudit")(SQC_OWNER, sctx, { unitId, businessDate: SQC_TODAY_BKK }))), AS.expect.closeToday, "ปิดวันนี้");
      const before = kpiOfRow(await sAudit(SD));
      okRes(await call(() => NA("reopenNightAudit")(SQC_MGR, sctx, { auditId: AUD.id, reason: "ทดสอบฉาก h.7" })), "reopen");
      okRes(await call(() => NA("closeNightAudit")(SQC_MGR, sctx, { unitId, businessDate: SD })), "ปิดใหม่");
      const after = await sAudit(SD);
      eq([after.status, kpiOfRow(after), (await sRoomItems(SD)).filter((i) => !i.voidedAt).length], [AS.expect.reopenThenClose.auditStatus, before, AS.expect.reopenThenClose.roomNightsPostedAfter], "หลังปิดใหม่");
      eq(await prisma.posSale.count({ where: { tenantId: SQC_TENANT.id, idempotencyKey: { startsWith: "dep-forfeit:" }, sourceModule: "HOTEL", sourceId: (await sceneRv("audit-noshow", AS.mark)).id } }), 1, "ริบซ้ำ");
      const h = rowsOf(okRes(await call(() => NA("auditHistory")(sctx, { unitId, from: sqcAddDays(SQC_TODAY_BKK, -7), to: SQC_TODAY_BKK })), "history"));
      eq(h.length, AS.expect.history, "history");
    }, "MAJOR");
    await st("Q-4", n4, async () => {
      const o0 = await otherSig();
      const web = await sceneRv("inhouse-web", BS.mark), ota = await sceneRv("inhouse-ota", BS.mark);
      const cl = runScript(F.scene, ["--clear"]);
      ok(cl.status === 0, `--clear exit=${cl.status}`);
      eq(await sceneRv("audit-noshow", AS.mark), null, "audit-noshow ค้าง");
      eq(await prisma.hotelNightAudit.count({ where: { unitId } }), 0, "audit ค้าง");
      eq((await sRoomItems(SD)).length, 0, "ROOM ของ audit ค้าง");
      for (const rv of [web, ota].filter(Boolean)) { const n = (await sNightsOn(rv.id, SD))[0]; ok(n && !n.postedAuditId && !n.folioItemId, `night ${rv.code} ไม่คืน`); }
      eq((await settingRows()).length, 0, "ค่าตั้งค้าง");
      eq(await otherSig(), o0, "ลบเกิน");
      const back = runScript(F.scene);
      ok(back.status === 0, "รันคืน");
      ok((await sceneRv("audit-noshow", AS.mark))?.status === "CONFIRMED" && (await prisma.hotelNightAudit.count({ where: { unitId } })) === 0, "คืนแล้วไม่ตรงสถานะก่อนปิดวัน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const name = "visual-svc h.7 ด้วย owner · manager (audit.run+reports.read) · frontdesk (ไม่มีสิทธิ์ ⇒ ไม่เห็นแท็บ/404) · hotel-reports · hotel-reports-revenue · hotel-audit × 1440/390 · HTTP < 400 (frontdesk ยอม 404) · ไม่ล้นแนวนอน — ผู้คุมตรวจ PARITY โครงกับรายงานหอ";
  if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก h.1/h.3/h.7 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
  else {
    const bad: string[] = [];
    for (const user of ["owner", "manager", "frontdesk"]) {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.7", "--user", user, "--base", base], { cwd: ROOT, env: { ...process.env }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status !== 0 && !(user === "frontdesk" && /404/.test(out))) bad.push(`${user} exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 2).join(" | ").slice(0, 200)}`);
    }
    record("V-1", name, bad.length ? "FAIL" : "PASS", bad.join(" · "), "MAJOR");
  }
}

// ═══════════════ G regression (§7) ═══════════════
console.log("\n── G: regression ──");
const summaryOf = (out: string): Any | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)); } catch { return null; }
};
const judgeNoFail = (out: string) => { const s = summaryOf(out); return !!s && Array.isArray(s.failed) && s.failed.length === 0; };
const judgeOnly = (allowed: string[]) => (out: string) => { const s = summaryOf(out); return !!s && Array.isArray(s.failed) && s.failed.every((x: string) => allowed.includes(x)); };
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-h.3", args: ["--no-regression"], judge: judgeNoFail, note: "จอง V2 (markNoShow) ไม่มี FAIL" },
  { s: "qc-svc-h.5", args: ["--no-regression"], judge: judgeNoFail, note: "folio (postRoomNights) ไม่มี FAIL" },
  { s: "qc-svc-h.6", args: ["--no-regression"], judge: judgeNoFail, note: "แม่บ้าน (markStayoversDirty) ไม่มี FAIL" },
  { s: "qc-svc-h.1", args: ["--no-regression"], judge: judgeNoFail, note: "ราคา ไม่มี FAIL" },
  { s: "qc-svc-h.0", args: ["--no-regression"], judge: judgeNoFail, note: "ตาราง/defs ไม่มี FAIL" },
  { s: "qc-svc-r0.8", judge: judgeNoFail, note: "แกนห้อง ไม่มี FAIL" },
  { s: "qc-svc-r0.9", judge: judgeOnly(["G-1"]), note: "ผังห้องร่วม (ยอม G-1)" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.19", args: ["--no-regression"], judge: judgeNoFail, note: "รายงานหอไม่เปลี่ยน" },
  { s: "qc-svc-smoke" },
  { s: "qc-svc-b.0", judge: judgeNoFail, note: "ทะเบียน event ไม่มี FAIL" },
];
{
  const hasWork = typeof naL.mod?.closeNightAudit === "function" && typeof rpL.mod?.occupancyReport === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (night-audit.ts/reports.ts) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_H7_NO_REGRESSION=1" : "";
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ไม่เป็นไร */ }
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `${LOG_DIR}/svc-h7-reg-${g.s}.log`;
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
console.log(`\n===== QC SVC H.7 · night audit · cron · รายงาน Occ/ADR/RevPAR · CSV · getUnitKpi =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`กลุ่ม: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.passed}/${v.total}${v.skipped ? ` (skip ${v.skipped})` : ""}`).join(" · ")}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id), byGroup })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed/ยังไม่มีฉาก · F-1 หลัง merge · NA-9 เมื่อ H.6 ยังไม่ merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
