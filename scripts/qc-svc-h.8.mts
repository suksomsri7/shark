// QC — SVC H.8 · จองออนไลน์ V2 (storefront โรงแรม): ค้นหา → ราคาตามคืนจริง + แผนราคา (visibility WEB) → HOLD 15 นาที + มัดจำพร้อมเพย์ (QR สถิต + สลิปกลาง HOTEL/HOTEL_DEPOSIT)
//      → CONFIRMED · โหมดยืนยัน 3 แบบ · หลายห้อง · คูปอง (snapshot · หักตอน settle) · ห้องเต็มบอกคืน · หน้าสถานะ + LINE OA · lookup code+email · self-cancel แสดงคืนเงิน · อีเมล 5 แบบ · TH/EN · rate limit/honeypot
//      oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes → ผู้คุม ORACLE-EDIT)
// สัญญา: ledger/svc-briefs/svc-brief-h.8.md (§0 หลัก · §1 ไฟล์ · §2 มติ · §3 สัญญา · §5 event · §6 ฉาก · §7 เกณฑ์ · **§9 ชนะ §0–§8 เมื่อขัดกัน**)
//        §9: โค้ดสาธารณะอยู่ชั้น platform «src/lib/platform/hotel-web.ts» + «src/lib/platform/hotel-mail.ts» · สลิป = payment/slip-verify domain HOTEL refType HOTEL_DEPOSIT
//        → consumer payment.slip.approved สาขา HOTEL → takeBookingDeposit · QR สถิต = promptpayQrFor · booking.ts เพิ่มอย่างเดียว (locale · coupon snapshot · cancel by GUEST)
//        ฟิกซ์เจอร์ scripts/svc-qc-data.mts บล็อก "SVC H.8" (SQC_HOTEL_WEB_SCENE · SQC_VISUAL_SPECS["h.8"]) + SQC_HOTEL_RATES/ROOMS/TYPES
//
// 🔴 สัญญาที่ข้อสอบยึด (ใบ §3 + สมมติฐานผู้เขียนข้อสอบ — ระบุในรายงานถึงผู้คุม):
//   • ทุกฟังก์ชัน public ของ hotel-web.ts รับ (input, opts) · opts = { clientKey: string; now?: Date; deps?: { put, del } } (แบบ dorm-portal.ts PortalOpts) ·
//     input มี tenantSlug + unitSlug เสมอ (X1 slug ซ้ำร้าน B) · ล้มทุกแบบ = { ok:false, code, reason } หรือ null ไม่ throw · เกินเพดาน = code RATE_LIMITED
//   • publicSearch({tenantSlug, unitSlug, checkIn, checkOut, adults, children, rooms}) → { ok:true, roomTypes:[{id,name,images,capacity,remaining,soldOutDates,plans:[{id,name,totalSatang,nights:[{date,priceSatang}],cancelSummaryTh,cancelSummaryEn,depositSatang}]}] }
//   • publicCreateHold({tenantSlug, unitSlug, checkIn, checkOut, adults, children, rooms:[{roomTypeId, qty, ratePlanId, adults, children}], guest:{name,phone,email}, couponCode?, locale, spam:{hp, st}, idempotencyKey})
//     → { ok:true, publicToken, code, status, holdExpiresAt, depositRequiredSatang, groupId?, intent:{ qrPayload, expiresAt, kind }|null }
//   • holdFormStart(unitId, now?) → ตั๋วเริ่มฟอร์ม (_sd_st) ที่หน้าเว็บฝัง (ห่อ issueFormStartToken ด้วย formId ของใบ) — ข้อสอบใช้ออกตั๋ว "เก่า 10 วิ" (ผ่าน) และ "สดใหม่" (ติดด่าน 3 วิ)
//   • publicStatus({tenantSlug, unitSlug, publicToken}) → StatusDto (ไม่มีเบอร์เต็ม · อีเมล mask · มียอดคืนถ้ายกเลิกตอนนี้) · publicLookup({…, code, email}) → { ok:true, publicToken } | ไม่พบ
//   • publicCancel({…, publicToken, email, confirmRefundSatang}) · publicAttachSlip({…, publicToken, file:{data,contentType}, idempotencyKey}) · publicPayDeposit({…, publicToken}) · publicQuote({…, rooms, couponCode}) · publicInfo({tenantSlug, unitSlug})
//   • notifyGuest(kind, reservationId, locale?, deps?: { fetch }) ใน hotel-mail.ts · kind ∈ hold|confirmed|reminder|cancelled|expired (หรือ export GUEST_MAIL_KINDS) · idempotencyKey hotel-mail-<kind>-<id>
//   • งานเตือน = registerMinuteJob({ name: "hotel-guest-reminder" }) — ข้อสอบเรียก run(now) ตรงจากทะเบียน (now = วันนี้ 10:30 ไทย)
// กลุ่มข้อ: PC ตัวควบคุม (เขียวก่อนมีงาน) · SR ค้นหา · HD สร้าง HOLD · PY มัดจำ/สลิป · ST สถานะ/lookup/ยกเลิก · NT แจ้งแขก · X ข้ามร้าน/ซ้ำ/race/rate limit/PII · U สถิต · F ไฟล์ · Z ล้าง · Q ฉาก svcqc · V ภาพ · G regression
// 🔴 ผลที่ถูกต้องก่อนมีงาน: PC เขียว · SR/HD/PY/ST/NT/X/U/F แดงเหตุผล "ยังไม่มี src/lib/platform/hotel-web.ts|hotel-mail.ts" · Q/V/G SKIP · ไม่มี throw ดิบ
// 🔴 ร้านชั่วคราว slug/email `svc-h8-*` ลบใน finally + กวาดค้างตอนเริ่ม · ถัง rate (ChatRateBucket) ที่เกิดในรอบลบตาม hash/คำนำหน้า · ตัวดักคิวรี = globalThis.prisma ก่อนโหลด @/lib/core/db (แบบ h.3)
// รัน: cd /root/projects/shark-svc-l1 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.8.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill · ห้าม export CI · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V · SVC_QC_CLOCK ข้อสอบตั้ง/ถอดเองต่อข้อ)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_OTHER, SQC_HOTEL_TYPES, SQC_HOTEL_ROOMS, SQC_HOTEL_RATES, SQC_HOTEL_WEB_SCENE, SQC_VISUAL_SPECS, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-h.8";
const SUITE = "qc-svc-h.8";
const BASE_SHA = "16dbc492e";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H8_NO_REGRESSION === "1";
const SLUG = "svc-h8-";
const MAIL = "svc-h8-";
const STORE = "src/app/(store)/s/[tenantSlug]/[unitSlug]/hotel";
const F = {
  web: "src/lib/platform/hotel-web.ts",
  mail: "src/lib/platform/hotel-mail.ts",
  booking: "src/lib/modules/hotel/booking.ts",
  index: "src/lib/modules/hotel/index.ts",
  service: "src/lib/modules/hotel/service.ts",
  pricing: "src/lib/modules/hotel/pricing.ts",
  avail: "src/lib/modules/hotel/availability.ts",
  rates: "src/lib/modules/hotel/rates.ts",
  hotelActions: "src/lib/modules/hotel/actions.ts",
  storeActions: `${STORE}/actions.ts`,
  pageSearch: `${STORE}/page.tsx`,
  pageBook: `${STORE}/book/page.tsx`,
  pagePay: `${STORE}/pay/[publicToken]/page.tsx`,
  pageStatus: `${STORE}/r/[publicToken]/page.tsx`,
  pageMy: `${STORE}/my/page.tsx`,
  routeSlip: `${STORE}/slip/[publicToken]/route.ts`,
  compDir: "src/components/store/hotel",
  reservationsPage: "src/app/app/u/[unitSlug]/hotel/reservations/page.tsx",
  dict: "src/lib/i18n/dict.ts",
  defs: "src/lib/core/settings/defs/rooms.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  whLabels: "src/lib/webhooks/labels.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  scene: "scripts/svc-qc-hotel-web-scene.mts",
  sceneH1: "scripts/svc-qc-hotel-rates-scene.mts",
  sceneH3: "scripts/svc-qc-hotel-booking-scene.mts",
  sceneH5: "scripts/svc-qc-hotel-folio-scene.mts",
  sceneH2: "scripts/svc-qc-hotel-tape-scene.mts",
  probe: "scripts/probe-h8-b.mts",
  sds: "docs/sds/modules/hotel.md",
  proxy: "src/proxy.ts",
  domain: "src/lib/domain/service.ts",
  email: "src/lib/core/email.ts",
  slipVerify: "src/lib/payment/slip-verify.ts",
  slipShared: "src/lib/payment/slip-shared.ts",
  receiver: "src/lib/payment/receiver.ts",
  rateLimit: "src/lib/core/rate-limit-db.ts",
  spam: "src/lib/modules/forms/spam-guard.ts",
  storefront: "src/lib/core/storefront.ts",
  perms: "src/lib/core/permissions.ts",
} as const;

loadSvcQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const RUN_START = new Date();

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
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (has(rel) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `ยังไม่มี ${rel} (${load.err})`);
  return f;
};
const codeOf = (r: Any) => (r === null || r === undefined ? "NULL" : r?.ok === true ? "ok" : r?.code ?? r?.error ?? J(r)?.slice(0, 80));
const failCode = (r: Any): string | null => (r && r.ok === false ? String(r.code ?? r.error ?? "") : null);
/** ผลสำเร็จของฟังก์ชัน public (ok ไม่ใช่ false และไม่ใช่ null) */
const okPub = (r: Any): boolean => !!r && typeof r === "object" && r.ok !== false;
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? r?.message ?? ""}`.trim()); return r; };
/** เรียกฟังก์ชันของใบ — throw ดิบ = บันทึกเป็น {ok:false, code:"THROW"} (ข้อสอบนับว่าผิดสัญญา "ไม่ throw") */
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const notFound = (r: Any) => r === null || r === undefined || (r?.ok === false && /NOT_FOUND/.test(String(r.code ?? r.error ?? "")));
const limited = (r: Any) => r?.ok === false && /RATE_LIMIT|REFUSED|TOO_MANY|429/i.test(String(r.code ?? r.error ?? ""));
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
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
/** ตั้ง/ถอดนาฬิกาฉากรอบคำสั่งเดียว */
const withClock = async <T,>(on: boolean, fn: () => Promise<T>): Promise<T> => {
  const prev = process.env.SVC_QC_CLOCK;
  if (on) process.env.SVC_QC_CLOCK = "1"; else delete process.env.SVC_QC_CLOCK;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.SVC_QC_CLOCK; else process.env.SVC_QC_CLOCK = prev; }
};
/** จับ console.log ระหว่างทำงาน (อีเมล dev = บรรทัด "[email:dev] rich …") */
const captureLogs = async (fn: () => Promise<unknown>): Promise<string[]> => {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { lines.push(a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")); };
  try { await fn(); } finally { console.log = orig; }
  return lines;
};
const mailLines = (lines: string[]) => lines.filter((l) => /\[email:dev\] rich/.test(l));
/** เดินทุกคีย์ของวัตถุ */
const walkKeys = (v: Any, keys = new Set<string>()): Set<string> => { if (v instanceof Set || v instanceof Date) return keys; if (Array.isArray(v)) v.forEach((x) => walkKeys(x, keys)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walkKeys(x, keys); } return keys; };
/** ค่าแรกที่คีย์ตรง regex (เดินลึก) */
const findVal = (v: Any, re: RegExp, pred: (x: unknown) => boolean = () => true, depth = 0): unknown => {
  if (depth > 6 || !v || typeof v !== "object" || v instanceof Date) return undefined;
  if (Array.isArray(v)) { for (const x of v) { const r = findVal(x, re, pred, depth + 1); if (r !== undefined) return r; } return undefined; }
  for (const [k, x] of Object.entries(v)) if (re.test(k) && pred(x)) return x;
  for (const x of Object.values(v)) { const r = findVal(x, re, pred, depth + 1); if (r !== undefined) return r; }
  return undefined;
};
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStrV = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const PII_KEY = /guest(Name|Phone|Email)|^phone$|^email$|idNumber|passport/i;

// ═══════════════ ตัวอ้างอิง (oracle ของ oracle · pure) ═══════════════
type Cell = { weekday: number; weekend: number };
const WEEKEND = [5, 6];
const refNightPrice = (cell: Cell, date: string, override?: number | null) => (override != null ? override : WEEKEND.includes(dowOf(date)) ? cell.weekend : cell.weekday);
const refStay = (cell: Cell, ci: string, co: string, overrides: Record<string, number> = {}) => nightsOf(ci, co).map((d) => ({ date: d, priceSatang: refNightPrice(cell, d, overrides[d]) }));
const refTotal = (cell: Cell, ci: string, co: string, overrides: Record<string, number> = {}) => sum(refStay(cell, ci, co, overrides).map((n) => n.priceSatang));
/** NONREF = มาตรฐาน −10% ปัดลงเป็นบาท ต่อคืน (ฟิกซ์เจอร์ SQC_HOTEL_RATES.nonrefDiscountBp) */
const floor90 = (x: number) => Math.floor((x * 9000) / 10_000 / 100) * 100;
type Rule = { daysBefore: number; refundBp: number };
const refRefund = (paid: number, checkIn: string, cancelAt: string, rules: Rule[]) => {
  const days = dayNo(checkIn) - dayNo(cancelAt);
  if (days < 0) return { refundSatang: 0, daysBefore: days, rule: null as Rule | null };
  const rule = [...rules].sort((a, b) => b.daysBefore - a.daysBefore).find((r) => days >= r.daysBefore) ?? null;
  return { refundSatang: rule ? Math.floor((paid * rule.refundBp) / 10_000) : 0, daysBefore: days, rule };
};
const Q2_RULES: Rule[] = [{ daysBefore: 7, refundBp: 10_000 }, { daysBefore: 3, refundBp: 5_000 }, { daysBefore: 0, refundBp: 0 }];
/** ศุกร์ถัดไป (ไทย) — วันนี้ศุกร์ = ศุกร์หน้า (ฟิกซ์เจอร์ anchor NEXT_FRIDAY) */
const nextFriday = (today: string) => addDays(today, ((5 - dowOf(today) + 7) % 7) || 7);
/** อ่าน TLV ชั้นบนของ EMV QR → Map tag→value · อ่านไม่ได้ = null */
const emvTlv = (payload: unknown): Map<string, string> | null => {
  if (typeof payload !== "string" || !payload) return null;
  const m = new Map<string, string>();
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2), len = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(len)) return null;
    const n = Number(len);
    if (i + 4 + n > payload.length) return null;
    m.set(tag, payload.slice(i + 4, i + 4 + n));
    i += 4 + n;
  }
  return m;
};
/** ยอด (สตางค์) ใน QR พร้อมเพย์ยอดล็อก (tag 54) · ไม่มี = null */
const emvAmount = (payload: unknown): number | null => { const m = emvTlv(payload); const v = m?.get("54"); return v && /^\d+(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : null; };
const qrOf = (r: Any): string | null => { const v = findVal(r, /^(qrPayload|payload|emv)$/, (x) => typeof x === "string" && x.startsWith("000201")); return typeof v === "string" ? v : null; };
const roomTypesOf = (r: Any): Any[] | null => (Array.isArray(r?.roomTypes) ? r.roomTypes : Array.isArray(r?.value?.roomTypes) ? r.value.roomTypes : Array.isArray(r?.result?.roomTypes) ? r.result.roomTypes : null);
const dtoOf = (r: Any): Any => (okPub(r) ? (isRec(r.value) ? r.value : isRec(r.dto) ? r.dto : isRec(r.status) && !isStrV(r.status) ? r.status : r) : null);

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
const bookL = await loadIf(F.booking);
const serviceL = await loadIf(F.service);
const webL = await loadIf(F.web);
const mailL = await loadIf(F.mail);
const slipL = await tryImport("@/lib/payment/slip-verify");
const sharedL = await tryImport("@/lib/payment/slip-shared");
const recvL = await tryImport("@/lib/payment/receiver");
const ppL = await tryImport("@/lib/payment/promptpay");
const rlL = await tryImport("@/lib/core/rate-limit-db");
const spamL = await tryImport("@/lib/modules/forms/spam-guard");
const couponL = await tryImport("@/lib/modules/coupon");
const sfL = await tryImport("@/lib/core/storefront");
const domL = await tryImport("@/lib/domain/service");
const emailL = await tryImport("@/lib/core/email");
const i18nL = await tryImport("@/lib/i18n");
const dictL = await tryImport("@/lib/i18n/dict");
const sysL = await tryImport("@/lib/modules/system/service");
const accSvcL = await tryImport("@/lib/modules/account/service");
const glL = await tryImport("@/lib/modules/account/gl");
const consumersL = await loadIf(F.consumers);
const autoL = await loadIf(F.autoLabels);
const whL = await loadIf(F.whLabels);
const minuteL = await loadIf(F.minute);
const RT = (name: string) => fnOf(ratesL, name, F.rates);
const BK = (name: string) => fnOf(bookL, name, F.booking);
const PUB = (name: string) => fnOf(webL, name, F.web);
const SV = (name: string) => fnOf(slipL, name, F.slipVerify);
const needWeb = () => { if (!webL.mod) throw new AssertFail(`ยังไม่มี ${F.web} (${webL.err})`); };
const needMail = () => { if (!mailL.mod) throw new AssertFail(`ยังไม่มี ${F.mail} (${mailL.err})`); };
const needBooking = () => { if (!bookL.mod?.createBooking) throw new AssertFail(`ยังไม่มี ${F.booking} (H.3 ยังไม่ merge: ${bookL.err})`); };
const sqlCount = (from: number) => SQL_LOG.slice(from).filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET |SAVEPOINT|RELEASE)/i.test(q) && !/ChatRateBucket/.test(q)).length;

// ═══════════════ ฐานข้อมูล: ตาราง H.0 · ล้าง ═══════════════
const H0_TABLES = ["HotelRatePlan", "HotelRate", "HotelRateOverride", "HotelCancelRule", "HotelBookingNight", "HotelFolio", "PaymentSlip", "ChatRateBucket"];
let H0_OK = false;
let H0_WHY = "";
try {
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, H0_TABLES);
  const have = new Set(rows.map((r) => r.t));
  const miss = H0_TABLES.filter((t) => !have.has(t));
  const col: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HotelReservation' AND column_name IN ('publicToken','guestEmail','policySnapshot','ratePlanId','groupId','holdExpiresAt','source')`);
  const colOk = Number(col[0]?.n ?? 0) === 7;
  H0_OK = miss.length === 0 && colOk && typeof prisma.paymentSlip?.findMany === "function";
  H0_WHY = miss.length ? `ยังไม่มีตาราง: ${miss.join(", ")}` : !colOk ? "HotelReservation ยังไม่มีคอลัมน์ publicToken/guestEmail/policySnapshot ครบ" : "Prisma client ยังไม่มี model PaymentSlip";
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
const CLIENT_KEYS: string[] = [];
let ipSeq = 0;
const newIp = () => { const k = `svc-h8-${RUN}-${++ipSeq}`; CLIENT_KEYS.push(k); return k; };
/** ถัง rate ที่อาจเกิดจากรอบนี้ — คีย์ดิบ · คีย์ที่มีคำว่า hotel/h8 เกิดหลังเริ่มรัน · hash ของ clientKey (เต็ม/40/32/16) */
async function cleanupBuckets() {
  try {
    const hashes = CLIENT_KEYS.flatMap((k) => { const h = sha256hex(k); return [h, h.slice(0, 40), h.slice(0, 32), h.slice(0, 16)]; });
    await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%svc-h8-%' OR (("createdAt" >= $1 OR "updatedAt" >= $1) AND (key ILIKE '%hotel%' OR key ILIKE '%h8%' OR key ILIKE '%hw:%'))`, RUN_START);
    for (let i = 0; i < hashes.length; i += 500) await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) h WHERE key LIKE '%' || h || '%')`, hashes.slice(i, i + 500));
  } catch (e) { console.log(`  ⚠️ ลบถัง rate: ${errMsg(e)}`); }
}
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: MAIL } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string; membershipId?: string };

// ═══════════════ ตัวช่วยสถิต (UI) ═══════════════
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
const SERVER_FILES = /^src\/lib\/modules\/hotel\/(rates|hotel-settings|service|booking|availability|folio|checkout|room-charge|tape)\.ts$|^src\/lib\/modules\/(rooms|pos|account|coupon)\/|^src\/lib\/platform\/hotel-(web|mail)\.ts$|^src\/lib\/payment\/(slip-verify|receiver)\.ts$/;
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
const compFiles = (): string[] => { try { return readdirSync(join(ROOT, F.compDir)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${F.compDir}/${f}`); } catch { return []; } };
const PAGES = [F.pageSearch, F.pageBook, F.pagePay, F.pageStatus, F.pageMy] as const;

console.log(`\n(ฐาน ${process.env.SVC_QC_HOST ?? "?"} · ตัวดักคิวรี ${spyInstalled ? "ติดตั้งแล้ว" : "ไม่ได้ติดตั้ง"} · ตาราง ${H0_OK ? "ครบ" : `ยังไม่ครบ (${H0_WHY})`} · booking.ts ${bookL.mod ? "โหลดได้" : "ยังไม่มี"} · hotel-web.ts ${webL.mod ? "โหลดได้" : "ยังไม่มี"} · hotel-mail.ts ${mailL.mod ? "โหลดได้" : "ยังไม่มี"})`);

// ═══════════════ ฟิกซ์เจอร์ฉาก → ตัวช่วย ═══════════════
const WS = SQC_HOTEL_WEB_SCENE;
const TYPE_NAME_TO_KEY: Record<string, keyof typeof SQC_HOTEL_TYPES> = { "ซูพีเรีย": "superior", "ดีลักซ์": "deluxe", "แฟมิลี": "family" };
const sceneSellable = (typeName: string) => SQC_HOTEL_ROOMS.filter((r) => r.typeId === SQC_HOTEL_TYPES[TYPE_NAME_TO_KEY[typeName]].id && r.rentMode !== "MONTHLY").length;
const ANCHOR = nextFriday(SQC_TODAY_BKK);
const ANCHOR_OUT = addDays(ANCHOR, WS.nights);
/** ราคาคืนของฉาก h.8 (ตาราง h.1 + override ฉาก) */
const scenePrice = (typeName: string, date: string, planKey: "standard" | "breakfast" | "nonref" = "standard"): number => {
  const cell = SQC_HOTEL_RATES.base[typeName];
  const ov = WS.override.roomType === typeName && date === addDays(ANCHOR, WS.override.anchorDayOffset) ? WS.override.priceSatang : null;
  const base = ov ?? (WEEKEND.includes(dowOf(date)) ? cell.weekend : cell.weekday);
  if (planKey === "breakfast") return base + SQC_HOTEL_RATES.breakfastPerPersonSatang * SQC_HOTEL_TYPES[TYPE_NAME_TO_KEY[typeName]].baseOccupancy;
  if (planKey === "nonref") return Math.floor((base * (10_000 - SQC_HOTEL_RATES.nonrefDiscountBp)) / 10_000 / 100) * 100;
  return base;
};
const sceneNights = (typeName: string, planKey: "standard" | "breakfast" | "nonref" = "standard") => nightsOf(ANCHOR, ANCHOR_OUT).map((d) => scenePrice(typeName, d, planKey));
/** ห้องที่ฉากใช้ต่อวันต่อประเภท (เคาน์เตอร์ + เว็บ · HOLD นับ) */
const sceneLoad = (typeName: string, date: string) => {
  let n = 0;
  for (const b of WS.counterBookings) if (b.roomType === typeName) for (let i = 0; i < b.nights; i++) if (addDays(ANCHOR, b.anchorDayOffset + i) === date) n += b.rooms;
  for (const b of WS.webBookings) if (b.roomType === typeName) for (let i = 0; i < b.nights; i++) if (addDays(ANCHOR, b.anchorDayOffset + i) === date) n += b.rooms;
  return n;
};
const sceneRemaining = (typeName: string) => Math.min(...nightsOf(ANCHOR, ANCHOR_OUT).map((d) => sceneSellable(typeName) - sceneLoad(typeName, d)));
const sceneSoldOutOffsets = (typeName: string) => nightsOf(ANCHOR, ANCHOR_OUT).map((d, i) => [d, i] as const).filter(([d]) => sceneSellable(typeName) - sceneLoad(typeName, d) <= 0).map(([, i]) => i);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ h.8 สอดคล้องกับ SQC_HOTEL_RATES/ROOMS: ดีลักซ์ ศ.+ส. = 149,000 (weekend) + 169,000 (override ฉาก) = 318,000 · BREAKFAST +20,000×2 คน×2 คืน = 398,000 · NONREF (−10% ปัดลงบาทต่อคืน) = 286,200 · ซูพีเรีย 99,000×2 = 198,000 · มัดจำ FIRST_NIGHT 149,000 · ชำระที่โรงแรม 169,000 · เหลือ ดีลักซ์ 7−3−1−1 = 2 · ซูพีเรีย 4−3 = 1 · แฟมิลี 0 เต็มคืนเสาร์ (offset 1) · HOLD/CONFIRMED เว็บ 1/1 · publicBase · mark · anchor = ศุกร์ · guest เว็บมีอีเมล (ไม่ใช่โดเมนจริง)", () => {
    eq([WS.mark, WS.unit, WS.anchor, WS.nights, WS.publicBase], ["SvcQcScene:h8", "hotel", "NEXT_FRIDAY", 2, `/s/${SQC_TENANT.slug}/${SQC_UNITS.hotel.slug}/hotel`], "ค่าคงที่");
    eq(dowOf(ANCHOR), 5, `anchor ${ANCHOR} ไม่ใช่ศุกร์`);
    ok(ANCHOR > SQC_TODAY_BKK, "anchor ต้องอยู่หลังวันนี้");
    eq(sceneNights("ดีลักซ์"), [...WS.expect.deluxe.nightPrices], "ราคาคืนดีลักซ์");
    eq([sum(sceneNights("ดีลักซ์")), sum(sceneNights("ดีลักซ์", "breakfast")), sum(sceneNights("ดีลักซ์", "nonref")), sum(sceneNights("ซูพีเรีย"))], [WS.expect.deluxe.standardTotal, WS.expect.deluxe.breakfastTotal, WS.expect.deluxe.nonrefTotal, WS.expect.superior.standardTotal], "ยอดรวมต่อแผน");
    eq([sceneNights("ดีลักซ์")[0], WS.expect.deluxe.standardTotal - sceneNights("ดีลักซ์")[0]], [WS.expect.deluxe.depositStandard, WS.expect.deluxe.payAtHotelStandard], "มัดจำ/ชำระที่โรงแรม");
    eq([sceneSellable("ดีลักซ์"), sceneSellable("ซูพีเรีย"), sceneSellable("แฟมิลี")], [7, 4, 2], "ห้องขายรายคืน");
    eq([sceneRemaining("ดีลักซ์"), sceneRemaining("ซูพีเรีย"), sceneRemaining("แฟมิลี")], [WS.expect.deluxe.remaining, WS.expect.superior.remaining, WS.expect.family.remaining], "เหลือ");
    eq(sceneSoldOutOffsets("แฟมิลี"), [...WS.expect.family.soldOutAnchorDayOffsets], "คืนที่เต็มของแฟมิลี");
    eq([sceneSoldOutOffsets("ดีลักซ์"), sceneSoldOutOffsets("ซูพีเรีย")], [[], []], "ดีลักซ์/ซูพีเรียต้องไม่เต็ม");
    const hold = WS.webBookings.find((b) => b.status === "HOLD")!, conf = WS.webBookings.find((b) => b.status === "CONFIRMED")!;
    eq([hold.deposit, hold.slip, conf.deposit, conf.slip, WS.webBookings.filter((b) => b.status === "HOLD").length, WS.webBookings.filter((b) => b.status === "CONFIRMED").length], ["PENDING", null, "PAID", "APPROVED", WS.expect.webHoldCountActive, WS.expect.webConfirmedCount], "เว็บ");
    eq([WS.expect.holdDepositSatang, WS.expect.confirmedDepositSatang], [scenePrice("ดีลักซ์", ANCHOR), scenePrice("ดีลักซ์", ANCHOR)], "มัดจำเว็บ = คืนแรกดีลักซ์");
    ok(WS.webBookings.every((b) => /@example\.com$/.test(b.guest.email) && /^0\d{9}$/.test(b.guest.phone) && b.guest.name), "guest เว็บ");
    const planKeys = new Set(SQC_HOTEL_RATES.plans.map((p) => p.key));
    ok([...WS.counterBookings, ...WS.webBookings].every((b) => planKeys.has(b.plan) && TYPE_NAME_TO_KEY[b.roomType] && b.rooms >= 1 && b.nights >= 1), "แผน/ประเภท");
    eq([WS.expectSettings.bookingMode, WS.expectSettings.holdMinutesOnline, WS.expectSettings.maxAdvanceBookingDays, WS.expectSettings.storefrontEnabled, WS.expectSettings.selfCancel, WS.expectSettings.maxRooms], ["DEPOSIT_REQUIRED", 15, 365, true, true, 5], "expectSettings");
    ok(typeof WS.settings["rooms.hotel.storefront.badgeTh"] === "string" && typeof WS.settings["rooms.hotel.storefront.badgeEn"] === "string", "badge");
    const web = SQC_HOTEL_RATES.plans.filter((p) => p.visibility.includes("WEB")).map((p) => p.code).sort();
    eq(web, ["BREAKFAST", "NONREF", "STANDARD"], "แผนที่ WEB เห็น");
  });
  await st("PC-2", "oracle ของ oracle: nextFriday (ศุกร์ ⇒ +7 · เสาร์ ⇒ +6 · พฤหัส ⇒ +1) · EMV TLV อ่าน tag 54 จาก promptpayPayload (149,000 ⇒ \"1490.00\" · ไม่มียอด ⇒ null · สตริงเพี้ยน ⇒ null) · floor90 (149,000 ⇒ 134,100 · 169,000 ⇒ 152,100) · refRefund Q2 · dow ไม่ใช้ getDay · ref ราคา weekend/override", () => {
    eq([nextFriday("2026-11-06"), nextFriday("2026-11-07"), nextFriday("2026-11-05"), nextFriday("2026-11-08")], ["2026-11-13", "2026-11-13", "2026-11-06", "2026-11-13"], "nextFriday");
    ok(ppL.mod?.promptpayPayload, `โหลด promptpay.ts ไม่ได้ ${ppL.err}`);
    const p = ppL.mod.promptpayPayload({ id: "0812345678", amountSatang: 149_000 });
    eq([emvAmount(p), emvTlv(p)?.get("01"), emvAmount(ppL.mod.promptpayPayload({ id: "0812345678" })), emvAmount("ผิด"), emvAmount(null)], [149_000, "12", null, null, null], "EMV");
    eq(qrOf({ intent: { qrPayload: p } }), p, "qrOf");
    eq([floor90(149_000), floor90(169_000), floor90(149_000) + floor90(169_000)], [134_100, 152_100, 286_200], "floor90");
    eq([refRefund(149_000, "2026-11-20", "2026-11-10", Q2_RULES).refundSatang, refRefund(149_000, "2026-11-20", "2026-11-15", Q2_RULES).refundSatang, refRefund(149_001, "2026-11-20", "2026-11-16", Q2_RULES).refundSatang, refRefund(149_000, "2026-11-20", "2026-11-19", Q2_RULES).refundSatang], [149_000, 74_500, 74_500, 0], "ขั้นบันได");
    eq([dowOf("2026-11-06"), dowOf("2026-11-07"), dowOf("2026-11-08")], [5, 6, 0], "dow");
    eq([refNightPrice({ weekday: 129_000, weekend: 149_000 }, "2026-11-06"), refNightPrice({ weekday: 129_000, weekend: 149_000 }, "2026-11-09"), refNightPrice({ weekday: 1, weekend: 2 }, "2026-11-07", 169_000)], [149_000, 129_000, 169_000], "ราคาอ้างอิง");
    eq(findVal({ a: { refundSatang: 5, x: [{ b: 1 }] } }, /refund/i, isNum), 5, "findVal");
  });
  await st("PC-3", "ฐาน QC ต่อได้ (SELECT 1 · host = ฐาน QC ของ SVC: ep-mute-scene/ep-royal-lake/ep-weathered-mode/ep-royal-bar) · ตัวดักคิวรีติดตั้งก่อน db · ตาราง H.0/PaymentSlip/ChatRateBucket + คอลัมน์ publicToken/guestEmail/policySnapshot ของ HotelReservation · SESSION_SECRET มี (spam-guard)", async () => {
    const r: { one: number }[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
    eq(r[0]?.one, 1, "SELECT 1");
    ok(/^(ep-mute-scene|ep-royal-lake|ep-weathered-mode|ep-royal-bar|ep-square-heart|ep-late-union)/.test(process.env.SVC_QC_HOST ?? ""), `host ${process.env.SVC_QC_HOST} ไม่ใช่ฐาน QC ของ SVC`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · lanes-l5-l6): ฐานเลน l5/l6 ใหม่ (แตกจาก wo-svc-qc)
    ok(spyInstalled, "ตัวดักคิวรีไม่ได้ติดตั้ง (SR นับคิวรีไม่ได้)");
    ok(H0_OK, H0_WHY);
    ok((process.env.SESSION_SECRET ?? "").length >= 32, "ไม่มี SESSION_SECRET ≥ 32 ตัวใน env QC (ตั๋วเริ่มฟอร์มออกไม่ได้)");
  });
  await st("PC-4", "ร้าน svcqc บนฐาน (seed แล้ว): ร้าน A slug svc-qc + หน่วย hotel slug bansuan-hotel · ร้านอื่น (SQC_OTHER) มีหน่วย HOTEL slug เดียวกัน bansuan-hotel (ฐาน X1 slug ซ้ำ) · ห้อง 14 (ดีลักซ์ขายรายคืน 7 · ซูพีเรีย 4 · แฟมิลี 2) · หน่วย hotel ผูก POS (มัดจำผ่าน POS) · มี PaymentProfile/ผู้รับพร้อมเพย์ของร้าน A (QR ฉาก)", async () => {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { slug: true } });
    if (!t) throw new AssertFail("ร้าน svcqc ยังไม่ seed บนฐานนี้ — ผู้คุมรัน seed ก่อน (Q/V ต้องใช้)");
    eq(t.slug, SQC_TENANT.slug, "slug ร้าน A");
    const u = await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.hotel.slug, type: "HOTEL" }, select: { id: true } });
    eq(u?.id, SQC_UNITS.hotel.id, "หน่วย hotel");
    const other = await prisma.businessUnit.findFirst({ where: { tenantId: SQC_OTHER.tenant.id, slug: SQC_OTHER.units.hotel.slug, type: "HOTEL" }, select: { id: true } });
    eq([SQC_OTHER.units.hotel.slug, other?.id], [SQC_UNITS.hotel.slug, SQC_OTHER.units.hotel.id], "ร้านอื่น slug ซ้ำ");
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, active: true }, select: { roomTypeId: true, rentMode: true } });
    eq([rooms.length, rooms.filter((r: Any) => r.roomTypeId === SQC_HOTEL_TYPES.deluxe.id && r.rentMode !== "MONTHLY").length, rooms.filter((r: Any) => r.roomTypeId === SQC_HOTEL_TYPES.superior.id).length, rooms.filter((r: Any) => r.roomTypeId === SQC_HOTEL_TYPES.family.id).length], [14, 7, 4, 2], "ห้องบนฐาน");
    ok(await prisma.appSystemUnit.findFirst({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, type: "POS" } }), "หน่วย hotel svcqc ไม่ผูก POS");
    const pp = await prisma.paymentProfile.findUnique({ where: { tenantId: SQC_TENANT.id }, select: { promptpayId: true } });
    ok(pp?.promptpayId, "ร้าน svcqc ไม่มี PaymentProfile.promptpayId — QR ของฉาก h.8 สร้างไม่ได้ (ถามผู้คุม: seed/ฉากตั้ง payments.receiver)");
  }, "MAJOR");
  await st("PC-5", "def ค่าตั้ง/ของที่ยืนบน: bookingMode เริ่ม DEPOSIT_REQUIRED · holdMinutesOnline 15 · maxAdvanceBookingDays 365 · notify.channel enum EMAIL/LINE/BOTH เริ่ม EMAIL · storefront.customDomain bool · สิทธิ์ payments.slip.review มีป้ายไทย · slip-shared มี HOTEL/HOTEL_DEPOSIT · SLIP_MAX_BYTES 5MB · SLIP_ACCEPT_TYPES · slip-verify submitSlip/decideSlip/slipQueue · receiver promptpayQrFor/receiverFor · checkRateLimitDb · spam-guard issue/read/consume · coupon.validate · storefront.resolvePublicUnit · domain.resolveTenantByHost · email.sendEmailRich · i18n makeT/DICT th+en · hotel facade createBooking/takeBookingDeposit/cancelBooking/refundPreview/sweepExpiredHolds/hotelAvailability/quoteStay/loadPricingContext · registerMinuteJob · outbox consumers มี payment.slip.approved + hotel.booking.* 4 ตัว", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k}`); return x; };
    eq([d("rooms.hotel.bookingMode").defaults._fallback, d("rooms.hotel.holdMinutesOnline").defaults._fallback, d("rooms.hotel.maxAdvanceBookingDays").defaults._fallback, d("rooms.hotel.notify.channel").defaults._fallback, d("rooms.hotel.storefront.customDomain").defaults._fallback], ["DEPOSIT_REQUIRED", 15, 365, "EMAIL", false], "defs");
    ok(["EMAIL", "LINE", "BOTH"].every((v) => d("rooms.hotel.notify.channel").schema.safeParse(v).success), "notify.channel enum");
    ok(/"payments\.slip\.review":\s*"[^"]*[฀-๿]/.test(read(F.perms)) && PERM, "สิทธิ์ payments.slip.review");
    ok(sharedL.mod, sharedL.err);
    eq([sharedL.mod.SLIP_DOMAIN_REF?.HOTEL, sharedL.mod.SLIP_MAX_BYTES, sharedL.mod.isSlipDomain?.("HOTEL"), Array.isArray(sharedL.mod.SLIP_ACCEPT_TYPES) && sharedL.mod.SLIP_ACCEPT_TYPES.includes("image/png")], ["HOTEL_DEPOSIT", 5 * 1024 * 1024, true, true], "slip-shared");
    ok(slipL.mod, slipL.err);
    eq(["submitSlip", "decideSlip", "slipQueue"].filter((n) => typeof slipL.mod[n] !== "function"), [], "slip-verify");
    ok(recvL.mod && typeof recvL.mod.promptpayQrFor === "function" && typeof recvL.mod.receiverFor === "function", `receiver ${recvL.err}`);
    ok(rlL.mod && typeof rlL.mod.checkRateLimitDb === "function", `rate-limit-db ${rlL.err}`);
    ok(spamL.mod && ["issueFormStartToken", "readFormStartToken", "consumeFormStartToken"].every((n) => typeof spamL.mod[n] === "function") && spamL.mod.FORM_HONEYPOT_FIELD === "_sd_hp" && spamL.mod.FORM_START_FIELD === "_sd_st", `spam-guard ${spamL.err}`);
    ok(couponL.mod && typeof couponL.mod.validate === "function" && typeof couponL.mod.createCoupon === "function", `coupon ${couponL.err}`);
    ok(sfL.mod && typeof sfL.mod.resolvePublicUnit === "function", `storefront ${sfL.err}`);
    ok(domL.mod && typeof domL.mod.resolveTenantByHost === "function", `domain ${domL.err}`);
    ok(emailL.mod && typeof emailL.mod.sendEmailRich === "function", `email ${emailL.err}`);
    ok(i18nL.mod && typeof i18nL.mod.makeT === "function" && dictL.mod?.DICT?.th && dictL.mod?.DICT?.en, `i18n ${i18nL.err}`);
    ok(hotelL.mod, hotelL.err);
    eq(["createBooking", "takeBookingDeposit", "cancelBooking", "refundPreview", "sweepExpiredHolds", "quoteStay", "loadPricingContext", "depositFor", "refundFor"].filter((n) => typeof hotelL.mod[n] !== "function"), [], "hotel facade");
    ok(typeof hotelL.mod.hotelAvailability?.get === "function", "hotelAvailability");
    ok(minuteL.mod && typeof minuteL.mod.registerMinuteJob === "function", `minute-jobs ${minuteL.err}`);
    const cons = consumersL.mod?.consumers;
    ok(cons && typeof cons === "object", `consumers ${consumersL.err}`);
    eq(["payment.slip.approved", "hotel.booking.created", "hotel.booking.confirmed", "hotel.booking.cancelled", "hotel.booking.hold_expired"].filter((e) => typeof cons[e] !== "function"), [], "consumer ขาด");
  });
  await st("PC-6", "ภาพ: SQC_VISUAL_SPECS[\"h.8\"] = 6 ใบ (search · search-en · pay · status · status-en · my) · path ใต้ publicBase /s/svc-qc/bansuan-hotel/hotel · en ใช้ ?lang=en · visual-svc h.8 --list พิมพ์ครบ", () => {
    const specs = SQC_VISUAL_SPECS["h.8"] ?? [];
    eq(specs.map((s) => s.name), ["hotel-web-search", "hotel-web-search-en", "hotel-web-pay", "hotel-web-status", "hotel-web-status-en", "hotel-web-my"], "ชื่อภาพ");
    ok(specs.every((s) => s.path.startsWith(WS.publicBase)), "path");
    ok(specs.filter((s) => s.name.endsWith("-en")).every((s) => /[?&]lang=en$/.test(s.path)), "lang=en");
    ok(specs.find((s) => s.name === "hotel-web-pay")!.path.includes("/pay/") && specs.find((s) => s.name === "hotel-web-status")!.path.includes("/r/") && specs.find((s) => s.name === "hotel-web-my")!.path.endsWith("/my"), "โครง path");
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.8", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "" }, encoding: "utf8" });
    ok(r.status === 0 && (r.stdout ?? "").includes("hotel-web-my") && (r.stdout ?? "").includes("/pay/"), `--list exit ${r.status}`);
  }, "MAJOR");
  await st("PC-7", "ของเดิมทำงานบนฐานนี้: checkRateLimitDb 3/นาที ⇒ ครั้งที่ 4 ล้ม · ข้ามหน้าต่าง (now ฉีด) ผ่าน · ตั๋วเริ่มฟอร์ม issue → read อายุถูก · ฟอร์มอื่น/ปลอม = null · consume ใช้ได้ครั้งเดียว · coupon.validate โค้ดมั่ว ⇒ NOT_FOUND (ไม่ throw)", async () => {
    const key = `svc-h8-pc7-${RUN}`;
    const t0 = Date.now();
    const rs: boolean[] = [];
    for (let i = 0; i < 4; i++) rs.push((await rlL.mod.checkRateLimitDb(key, { limit: 3, windowMs: 60_000 }, t0)).ok);
    eq(rs, [true, true, true, false], "เพดาน 3");
    eq((await rlL.mod.checkRateLimitDb(key, { limit: 3, windowMs: 60_000 }, t0 + 61_000)).ok, true, "หน้าต่างใหม่");
    const tok = spamL.mod.issueFormStartToken("svc-h8-form", new Date(Date.now() - 10_000));
    const rd = spamL.mod.readFormStartToken(tok, "svc-h8-form");
    ok(rd && rd.ageSec >= 9 && rd.ageSec <= 12 && isStrV(rd.nonce), `read ${J(rd)}`);
    eq([spamL.mod.readFormStartToken(tok, "ฟอร์มอื่น"), spamL.mod.readFormStartToken("1.2.3", "svc-h8-form")], [null, null], "ตั๋วปลอม");
    eq([await spamL.mod.consumeFormStartToken(rd.nonce), await spamL.mod.consumeFormStartToken(rd.nonce)], [true, false], "consume ครั้งเดียว");
    const v = await couponL.mod.validate({ code: `NOPE${RUN}`, tenantId: "svc-h8-none", systemId: "svc-h8-none", amountSatang: 1000 });
    eq(v, { ok: false, reason: "NOT_FOUND" }, "validate");
  });

  // ═══════════════ ร้านชั่วคราว svc-h8-* ═══════════════
  console.log("\n── ตั้งร้านชั่วคราว svc-h8-* ──");
  const slugA = `${SLUG}a-${RUN}`, slugB = `${SLUG}b-${RUN}`;
  const UNIT_SLUG = `h8-hotel-${RUN}`; // slug หน่วยซ้ำทั้งสองร้าน (X1)
  const mkTenant = async (name: string, slug: string) => { const r = await prisma.tenant.create({ data: { name, slug } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC H8 โรงแรม A", slugA);
  const tB = await mkTenant("QC H8 โรงแรม B", slugB);
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string, slug = `u-${uid()}`) => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug } })).id as string;
  const UH = await mkUnit(tA, "HOTEL", "บ้านริมน้ำ โฮเทล H8", UNIT_SLUG);
  const UHB = await mkUnit(tB, "HOTEL", "โรงแรมร้าน B H8", UNIT_SLUG);
  type TypeSpec = { name: string; base: number; cap: number; baseOcc: number; maxOcc: number | null };
  const mkType = async (tenantId: string, unitId: string, s: TypeSpec) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: s.name, rentMode: "NIGHTLY", baseRateSatang: s.base, capacity: s.cap, baseOccupancy: s.baseOcc, maxOccupancy: s.maxOcc, extraBedAllowed: false, extraBedPriceSatang: 0 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string) => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, hkStatus: "CLEAN" } })).id as string;
  const SPEC: Record<string, TypeSpec> = {
    dlx: { name: "ดีลักซ์", base: 129_000, cap: 3, baseOcc: 2, maxOcc: 3 },
    sup: { name: "ซูพีเรีย", base: 99_000, cap: 2, baseOcc: 2, maxOcc: 2 },
    one: { name: "ห้องเดียว", base: 100_000, cap: 2, baseOcc: 2, maxOcc: 2 },
    fam: { name: "แฟมิลี", base: 189_000, cap: 5, baseOcc: 4, maxOcc: 5 },
  };
  const CELL: Record<string, Cell> = { dlx: { weekday: 129_000, weekend: 149_000 }, sup: { weekday: 99_000, weekend: 99_000 }, one: { weekday: 100_000, weekend: 120_000 }, fam: { weekday: 189_000, weekend: 219_000 } };
  const RTA: Record<string, string> = {};
  for (const [k, s] of Object.entries(SPEC)) RTA[k] = await mkType(tA, UH, s);
  const ROOM: Record<string, string> = {};
  for (const [n, k] of [["DLX1", "dlx"], ["DLX2", "dlx"], ["DLX3", "dlx"], ["DLX4", "dlx"], ["SUP1", "sup"], ["SUP2", "sup"], ["ONE1", "one"], ["FAM1", "fam"]] as const) ROOM[n] = await mkRoom(tA, UH, n, RTA[k]);
  const RT_B = await mkType(tB, UHB, SPEC.dlx);
  await mkRoom(tB, UHB, "B-1", RT_B);
  // POS + บัญชี (จด VAT 7%) ของร้าน A — มัดจำผ่าน POS · GL 2110 (แบบ h.5) · ร้าน B มี POS ไม่เชื่อมบัญชี
  ok(sysL.mod && accSvcL.mod && glL.mod, `system/account ไม่พร้อม ${sysL.err} ${accSvcL.err} ${glL.err}`);
  const POS_A = (await sysL.mod.createSystem(tA, "POS", "POS ร้าน A H8")).id as string;
  await sysL.mod.linkUnit(tA, POS_A, UH);
  const ACC_A = (await sysL.mod.createSystem(tA, "ACCOUNT", "บัญชี A H8")).id as string;
  await accSvcL.mod.saveSettings(tA, ACC_A, { orgName: "โรงแรม H8 จำกัด", taxId: "0105561177639", vatRegistered: true, vatRateBp: 700 } as never);
  await glL.mod.ensureAccounting({ tenantId: tA, systemId: ACC_A });
  await prisma.accountSystemLink.create({ data: { tenantId: tA, systemId: ACC_A, linkedKind: "POS", linkedId: POS_A } });
  const POS_B = (await sysL.mod.createSystem(tB, "POS", "POS ร้าน B H8")).id as string;
  await sysL.mod.linkUnit(tB, POS_B, UHB);
  // ผู้รับพร้อมเพย์ของร้าน A (QR สถิต) · ร้าน B ไม่ตั้ง
  const RECV_ID = "0812345678";
  await prisma.paymentProfile.create({ data: { tenantId: tA, promptpayId: RECV_ID, displayName: "บ้านริมน้ำ โฮเทล" } });
  // ระบบคูปองผูกหน่วย A + คูปองลด 200 บาท
  const COUPON_SYS = (await sysL.mod.createSystem(tA, "COUPON", "คูปอง A H8")).id as string;
  await sysL.mod.linkUnit(tA, COUPON_SYS, UH);
  const COUPON_CODE = `H8OFF${RUN.toUpperCase()}`;
  const cc = await couponL.mod.createCoupon({ tenantId: tA, systemId: COUPON_SYS, code: COUPON_CODE, name: "ลด 200 ทดสอบ", type: "FIXED", valueSatang: 20_000 });
  ok(cc?.ok === true, `createCoupon ${J(cc)}`);
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-h8-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@shark.local`, name: `QC h8 ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const T0 = bkkToday();
  const W = (n: number) => addDays(T0, n);
  const ids: Record<string, string> = {};
  const rowsFor = (cells: Record<string, Cell>) => Object.entries(cells).map(([k, c]) => ({ roomTypeId: RTA[k], seasonId: null, priceWeekdaySatang: c.weekday, priceWeekendSatang: c.weekend, priceHolidaySatang: null }));
  let SETUP_OK = false;
  let SETUP_WHY = "";
  try {
    okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH }), "list");
    const std = await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "STANDARD" } });
    ok(std, "ไม่มีแผน STANDARD");
    ids.std = std.id;
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, id: ids.std, code: "STANDARD", name: "ราคามาตรฐาน", visibility: ["WEB", "LINE", "COUNTER", "OTA"] }), "STANDARD visibility");
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows: rowsFor(CELL) }), "saveRates STANDARD");
    okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: Q2_RULES }), "cancelRules");
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "NONREF", name: "จ่ายก่อน ไม่คืนเงิน", depositKind: "FULL", depositValue: 0, visibility: ["WEB"] }), "NONREF");
    ids.nr = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "NONREF" } }))!.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.nr, rows: rowsFor(Object.fromEntries(Object.entries(CELL).map(([k, c]) => [k, { weekday: floor90(c.weekday), weekend: floor90(c.weekend) }]))) }), "saveRates NONREF");
    okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.nr, rules: [{ daysBefore: 0, refundBp: 0 }] }), "cancelRules NONREF");
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "LINEONLY", name: "เฉพาะ LINE", depositKind: "FIRST_NIGHT", depositValue: 0, visibility: ["LINE"] }), "LINEONLY");
    ids.lineOnly = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "LINEONLY" } }))!.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.lineOnly, rows: rowsFor(CELL) }), "saveRates LINEONLY");
    okRes(await RT("listRatePlans")(OWNER_B, ctxB, { unitId: UHB }), "list B");
    ids.stdB = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tB, unitId: UHB, code: "STANDARD" } }))!.id;
    okRes(await RT("saveRates")(OWNER_B, ctxB, { unitId: UHB, ratePlanId: ids.stdB, rows: [{ roomTypeId: RT_B, seasonId: null, priceWeekdaySatang: 129_000, priceWeekendSatang: 149_000, priceHolidaySatang: null }] }), "saveRates B");
    SETUP_OK = true;
  } catch (e) { SETUP_WHY = `ตั้งร้านชั่วคราวไม่สำเร็จ (H.1): ${errMsg(e)}`; console.log(`  ❌ ${SETUP_WHY}`); }
  const needSetup = () => ok(SETUP_OK, SETUP_WHY);
  const setUnit = async (key: string, value: unknown, unitId = UH) => okRes(await SET.setSettings(OWNER, ctxA, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  const resetUnit = async (key: string, unitId = UH) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: unitId }); } catch { /* ไม่มีค่า */ } };
  const GUEST = { name: "ผู้เข้าพักทดสอบ h8", phone: "0891234588", email: `svc-h8-guest-${RUN}@qc.invalid` };
  const PII_TEXT = new RegExp(`ผู้เข้าพักทดสอบ|0891234588|svc-h8-guest-${RUN}`);
  const EMAIL_FULL = new RegExp(GUEST.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const baseA = { tenantSlug: slugA, unitSlug: UNIT_SLUG };
  const baseB = { tenantSlug: slugB, unitSlug: UNIT_SLUG };
  type Over = Record<string, unknown>;
  type Opts = Record<string, unknown>;
  /** ตั๋วเริ่มฟอร์มของใบ (สัญญา holdFormStart · ageMs = ออกตั๋วย้อนหลังกี่ ms) */
  const stTok = (ageMs = 10_000, unitId = UH) => PUB("holdFormStart")(unitId, new Date(Date.now() - ageMs));
  const spamOk = (unitId = UH) => ({ hp: "", st: stTok(10_000, unitId) });
  const search = (over: Over = {}, opts: Opts = {}) => call(() => PUB("publicSearch")({ ...baseA, checkIn: W(8), checkOut: W(10), adults: 2, children: 0, rooms: 1, ...over }, { clientKey: newIp(), ...opts }));
  const roomSpec = (roomTypeId: string, qty = 1, ratePlanId: string = ids.std) => ({ roomTypeId, qty, ratePlanId, adults: 2, children: 0 });
  const hold = (over: Over = {}, opts: Opts = {}) => call(() => PUB("publicCreateHold")({ ...baseA, checkIn: W(8), checkOut: W(10), adults: 2, children: 0, rooms: [roomSpec(RTA.dlx)], guest: GUEST, locale: "th", spam: spamOk(), idempotencyKey: `svc-h8-${uid()}`, ...over }, { clientKey: newIp(), ...opts }));
  const holdOk = async (over: Over = {}, opts: Opts = {}) => { const r = await hold(over, opts); ok(okPub(r) && isStrV(r.publicToken), `publicCreateHold: ${codeOf(r)} ${r?.reason ?? ""}`); return r; };
  const status = (publicToken: string, over: Over = {}, opts: Opts = {}) => call(() => PUB("publicStatus")({ ...baseA, publicToken, ...over }, { clientKey: newIp(), ...opts }));
  const lookup = (over: Over, opts: Opts = {}) => call(() => PUB("publicLookup")({ ...baseA, ...over }, { clientKey: newIp(), ...opts }));
  const cancelPub = (over: Over, opts: Opts = {}) => call(() => PUB("publicCancel")({ ...baseA, ...over }, { clientKey: newIp(), ...opts }));
  const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = (bytes = 96): Uint8Array => Uint8Array.from(Buffer.concat([PNG_SIG, randomBytes(bytes)]));
  const PUTS: string[] = [];
  const put = async (path: string, _data: Uint8Array, _ct: string): Promise<void> => { PUTS.push(path); void _data; void _ct; };
  const del = async (_path: string): Promise<number> => { void _path; return 200; };
  const attachSlip = (publicToken: string, over: Over = {}, opts: Opts = {}) => call(() => PUB("publicAttachSlip")({ ...baseA, publicToken, file: { data: png(), contentType: "image/png" }, idempotencyKey: `svc-h8-slip-${uid()}`, ...over }, { clientKey: newIp(), deps: { put, del }, ...opts }));
  const payDeposit = (publicToken: string, opts: Opts = {}) => call(() => PUB("publicPayDeposit")({ ...baseA, publicToken }, { clientKey: newIp(), ...opts }));
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const rvByToken = (publicToken: string) => prisma.hotelReservation.findUnique({ where: { publicToken } }) as Promise<Any>;
  const nightsOfRv = (id: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: id }, orderBy: { date: "asc" } }) as Promise<Any[]>;
  const occOfRv = (id: string, active?: boolean) => prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId: id, ...(active === undefined ? {} : { active }) } }) as Promise<Any[]>;
  const folioOf = (id: string) => prisma.hotelFolio.findUnique({ where: { reservationId: id } }) as Promise<Any>;
  const eventsOf = async (type: string, pred?: (p: Any, e: Any) => boolean, tid = tA) => ((await prisma.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => !pred || pred(e.payload ?? {}, e));
  const auditsOf = (action: string, tid = tA) => prisma.auditLog.findMany({ where: { tenantId: tid, action }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const rvCount = () => prisma.hotelReservation.count({ where: { tenantId: tA } }) as Promise<number>;
  const depositSalesOf = (id: string, tid = tA) => prisma.posSale.findMany({ where: { tenantId: tid, idempotencyKey: { startsWith: `hotel-deposit-${id}` } }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const refundSalesOf = (receiptSaleId: string) => prisma.posSale.findMany({ where: { tenantId: tA, docType: "REFUND", refSaleId: receiptSaleId } }) as Promise<Any[]>;
  const payOf = (saleId: string) => prisma.posPayment.findMany({ where: { saleId } }) as Promise<Any[]>;
  const slipsOf = (refId: string, tid = tA) => prisma.paymentSlip.findMany({ where: { tenantId: tid, refId }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const bucketCount = () => prisma.chatRateBucket.count() as Promise<number>;
  const drain = async () => { const w = consumersL.mod; ok(w?.drainAll, "ไม่มี drainAll"); for (let i = 0; i < 3; i++) await w.drainAll(); };
  const consumer = (type: string) => { const c = consumersL.mod?.consumers?.[type]; ok(typeof c === "function", `ไม่มี consumer ${type}`); return c as (e: Any) => Promise<void>; };
  type Line = { code: string; debit: number; credit: number; refId: string; entryId: string };
  const glLines = async (refIds: string[], systemId = ACC_A): Promise<Line[]> => {
    const es = (await prisma.accountJournalEntry.findMany({ where: { systemId, refType: "PosSale", refId: { in: refIds } }, include: { lines: { include: { account: { select: { code: true } } } } } })) as Any[];
    return es.flatMap((e) => e.lines.map((l: Any) => ({ code: l.account.code, debit: l.debit, credit: l.credit, refId: e.refId, entryId: e.id })));
  };
  const netCr = (ls: Line[], code: string) => sum(ls.filter((l) => l.code === code).map((l) => l.credit - l.debit));
  const balanced = (ls: Line[]) => ls.length > 0 && sum(ls.map((l) => l.debit)) === sum(ls.map((l) => l.credit));
  /** จองผ่านเคาน์เตอร์ (createBooking ของ H.3 · PHONE · CONFIRMED) — ใช้ทำห้องเต็ม/เช็กอิน */
  const counterBook = async (over: Over = {}) => okRes(await BK("createBooking")(OWNER, ctxA, { unitId: UH, rooms: [{ roomTypeId: RTA.dlx, adults: 2, children: 0 }], ratePlanId: ids.std, source: "PHONE", guest: { name: "เคาน์เตอร์ h8", phone: "0890000088" }, checkIn: W(8), checkOut: W(10), ...over }), "createBooking เคาน์เตอร์");
  /** อนุมัติสลิป (OWNER) แล้วให้ consumer payment.slip.approved ทำงาน + drain (pos.sale.paid → GL) */
  const approveSlip = async (slipId: string) => {
    const d = await SV("decideSlip")({ userId: OWNER.userId }, ctxA, slipId, { decision: "APPROVE", reason: "ตรวจกับแอปธนาคารแล้ว", transRef: `H8${uid()}`.toUpperCase() });
    okRes(d, "decideSlip");
    const ev = (await eventsOf("payment.slip.approved", (p) => p.slipId === slipId))[0];
    ok(ev, "ไม่มี event payment.slip.approved");
    await consumer("payment.slip.approved")({ id: ev.id, tenantId: ev.tenantId, type: ev.type, payload: ev.payload, unitId: ev.unitId ?? null, systemId: ev.systemId ?? null });
    await drain();
    return ev;
  };
  const noPii = (v: unknown, what: string) => { ok(!PII_TEXT.test(J(v)), `${what}: มี PII (ชื่อ/เบอร์/อีเมลแขก)`); ok(![...walkKeys(v)].some((k) => PII_KEY.test(k)), `${what}: คีย์ PII`); };

  // ═══════════════ SR publicSearch ═══════════════
  console.log("\n── SR publicSearch ──");
  const typeOf = (r: Any, id: string): Any => roomTypesOf(r)?.find((t) => t.id === id) ?? null;
  const planOf = (t: Any, id: string): Any => (Array.isArray(t?.plans) ? t.plans.find((p: Any) => p.id === id) : null) ?? null;
  await st("SR-1", "publicSearch(ศ.+ส. 2 คืน · 2 ผู้ใหญ่ · 1 ห้อง) ⇒ ok · roomTypes 4 ประเภทของหน่วย {id,name,capacity,remaining,soldOutDates[],plans[]} · remaining = ห้องว่างน้อยสุดตลอดช่วง (ดีลักซ์ 4 · ซูพีเรีย 2 · ห้องเดียว 1 · แฟมิลี 1) · soldOutDates ว่าง · แผน = เฉพาะ visibility มี WEB (STANDARD · NONREF · ไม่มี LINEONLY) · แผนมี {id,name,totalSatang,nights[{date,priceSatang}],depositSatang,cancelSummaryTh,cancelSummaryEn} · ไม่มี PII/โทเคน", async () => {
    needSetup(); needWeb();
    const r = await search();
    const types = roomTypesOf(r);
    ok(okPub(r) && types, `รูปผล ${J(r).slice(0, 200)}`);
    eq(types!.map((t) => t.id).sort(), Object.values(RTA).sort(), "ประเภทครบ");
    eq(Object.fromEntries(Object.entries(RTA).map(([k, id]) => [k, typeOf(r, id)?.remaining])), { dlx: 4, sup: 2, one: 1, fam: 1 }, "remaining");
    ok(types!.every((t) => Array.isArray(t.soldOutDates) && t.soldOutDates.length === 0 && isStrV(t.name) && isNum(t.capacity)), "soldOutDates/ชื่อ/ความจุ");
    const dlx = typeOf(r, RTA.dlx);
    eq((dlx.plans as Any[]).map((p) => p.id).sort(), [ids.std, ids.nr].sort(), "แผนที่ WEB เห็น");
    const p = planOf(dlx, ids.std);
    ok(isStrV(p.name) && isNum(p.totalSatang) && Array.isArray(p.nights) && p.nights.length === 2 && isNum(p.depositSatang) && isStrV(p.cancelSummaryTh) && isStrV(p.cancelSummaryEn), `รูปแผน ${J(p).slice(0, 200)}`);
    ok(THAI.test(p.cancelSummaryTh) && !THAI.test(p.cancelSummaryEn), "สรุปนโยบายยกเลิก TH/EN");
    ok(![...walkKeys(r)].some((k) => /publicToken|guest|phone|email|secret/i.test(k)), "คีย์ส่วนตัวใน DTO ค้นหา");
  });
  await st("SR-2", "ราคารายคืนตรง quoteStay: STANDARD ดีลักซ์ = ตาราง weekday/weekend ต่อคืน (ศ./ส. = 149,000) · totalSatang = Σ · depositSatang = คืนแรก (FIRST_NIGHT) · NONREF = ราคาตาราง NONREF (−10% ปัดลงบาท) · depositSatang NONREF = ทั้งหมด (FULL) · แก้มือ (setOverride ดีลักซ์ คืนที่สอง 169,000 ทุกแผน) ⇒ nights[1] = 169,000 ทั้ง STANDARD/NONREF · ล้างแก้มือ", async () => {
    needSetup(); needWeb();
    const ci = W(8), co = W(10);
    const r = await search();
    const dlx = typeOf(r, RTA.dlx);
    ok(dlx, "ไม่มีดีลักซ์");
    const std = planOf(dlx, ids.std), nr = planOf(dlx, ids.nr);
    eq(std.nights.map((n: Any) => [n.date, n.priceSatang]), refStay(CELL.dlx, ci, co).map((n) => [n.date, n.priceSatang]), "คืน STANDARD");
    eq([std.totalSatang, std.depositSatang], [refTotal(CELL.dlx, ci, co), refNightPrice(CELL.dlx, ci)], "รวม/มัดจำ STANDARD");
    const nrCell = { weekday: floor90(CELL.dlx.weekday), weekend: floor90(CELL.dlx.weekend) };
    eq([nr.nights.map((n: Any) => n.priceSatang), nr.totalSatang, nr.depositSatang], [refStay(nrCell, ci, co).map((n) => n.priceSatang), refTotal(nrCell, ci, co), refTotal(nrCell, ci, co)], "NONREF");
    okRes(await RT("setOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, date: W(9), priceSatang: 169_000, reason: "ข้อสอบ h8" }), "setOverride");
    try {
      const r2 = await search();
      const d2 = typeOf(r2, RTA.dlx);
      eq([planOf(d2, ids.std).nights[1].priceSatang, planOf(d2, ids.nr).nights[1].priceSatang, planOf(d2, ids.std).totalSatang], [169_000, 169_000, refNightPrice(CELL.dlx, ci) + 169_000], "แก้มือ");
    } finally { await RT("clearOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, date: W(9) }); }
  });
  await st("SR-3", "ห้องเต็มบอกคืน: จองแฟมิลี (1 ห้อง) ผ่านเคาน์เตอร์ W+20→21 แล้วค้นหา W+20→22 ⇒ แฟมิลี remaining 0 · soldOutDates [W+20] · ประเภทอื่น remaining เท่าเดิม · ตรง hotelAvailability.get · ป้าย «เหลือ N» เมื่อ ≤ 3 (ซูพีเรีย 2 ⇒ ธง true · ดีลักซ์ 4 ⇒ ไม่ติดธง — คีย์ /low|few|last|urgent|scarce/i · MINOR ใน SR-10)", async () => {
    needSetup(); needWeb(); needBooking();
    await counterBook({ rooms: [{ roomTypeId: RTA.fam, adults: 2, children: 0 }], checkIn: W(20), checkOut: W(21) });
    const r = await search({ checkIn: W(20), checkOut: W(22) });
    const fam = typeOf(r, RTA.fam);
    ok(fam, `ไม่มีแฟมิลี ${J(r).slice(0, 160)}`);
    eq([fam.remaining, fam.soldOutDates], [0, [W(20)]], "แฟมิลีเต็ม");
    const av = await hotelL.mod.hotelAvailability.get(ctxA, { unitId: UH, from: W(20), to: W(22) });
    for (const [k, id] of Object.entries(RTA)) {
      const exp = Math.min(...nightsOf(W(20), W(22)).map((d) => av.byDate[d][id].available));
      eq(typeOf(r, id)?.remaining, exp, `remaining ${k} ≠ availability`);
    }
  });
  await st("SR-4", "วันผิด ⇒ รหัสผิดพลาด (ไม่ throw · ไม่คืน roomTypes): เช็กอินเมื่อวาน ⇒ PAST_DATE · > maxAdvanceBookingDays (365) ⇒ TOO_FAR · เข้า ≥ ออก ⇒ INVALID_INPUT/INVALID_RANGE · รูปวันผิด ⇒ INVALID_INPUT · adults 0 / rooms 0 ⇒ INVALID_INPUT · ตั้ง maxAdvance 30 ⇒ W+31 TOO_FAR (อ่านค่าตั้ง) · คืนค่า", async () => {
    needSetup(); needWeb();
    const code = async (over: Over) => { const r = await search(over); ok(!roomTypesOf(r)?.length || r?.ok === false, `${J(over)} ยังคืนห้อง`); return failCode(r); };
    eq(await code({ checkIn: W(-1), checkOut: W(1) }), "PAST_DATE", "ย้อนหลัง");
    eq(await code({ checkIn: W(400), checkOut: W(401) }), "TOO_FAR", "ไกลเกิน");
    ok(/^(INVALID_INPUT|INVALID_RANGE)$/.test(String(await code({ checkIn: W(10), checkOut: W(10) }))), "เข้า = ออก");
    ok(/^(INVALID_INPUT|INVALID_RANGE)$/.test(String(await code({ checkIn: W(10), checkOut: W(8) }))), "เข้า > ออก");
    eq(await code({ checkIn: "2026-13-40", checkOut: W(8) }), "INVALID_INPUT", "รูปวันผิด");
    eq([await code({ adults: 0 }), await code({ rooms: 0 })], ["INVALID_INPUT", "INVALID_INPUT"], "ผู้ใหญ่/ห้อง 0");
    await setUnit("rooms.hotel.maxAdvanceBookingDays", 30);
    try { eq(await code({ checkIn: W(31), checkOut: W(32) }), "TOO_FAR", "maxAdvance 30"); ok(okPub(await search({ checkIn: W(28), checkOut: W(29) })), "W+28 ต้องได้"); }
    finally { await resetUnit("rooms.hotel.maxAdvanceBookingDays"); }
  });
  await st("SR-5", "X1: unitSlug เดียวกันในร้าน B ⇒ ได้ประเภทของร้าน B เท่านั้น (ไม่มี roomTypeId ของร้าน A) · tenantSlug มั่ว ⇒ NOT_FOUND · unitSlug มั่ว ⇒ NOT_FOUND · publicInfo ร้าน A ⇒ ชื่อหน่วย · ไม่มี id ร้านอื่น", async () => {
    needSetup(); needWeb();
    const b = await search({ ...baseB });
    const tb = roomTypesOf(b);
    ok(okPub(b) && tb && tb.length === 1 && tb[0].id === RT_B, `ร้าน B ${J(b).slice(0, 160)}`);
    ok(!J(b).includes(RTA.dlx) && !J(b).includes(UH), "รั่ว id ร้าน A");
    ok(notFound(await search({ tenantSlug: `${slugA}-x` })), "tenantSlug มั่ว");
    ok(notFound(await search({ unitSlug: `${UNIT_SLUG}-x` })), "unitSlug มั่ว");
    const info = await call(() => PUB("publicInfo")({ ...baseA }, { clientKey: newIp() }));
    ok(okPub(info) && J(info).includes("บ้านริมน้ำ โฮเทล H8"), `publicInfo ${J(info).slice(0, 160)}`);
    ok(!J(info).includes(UHB), "publicInfo รั่วร้าน B");
  });
  await st("SR-6", "PAUSED / ปิด storefront ⇒ ไม่รับจอง: หน่วย PAUSED ⇒ publicSearch ไม่คืนห้องว่าง (ok:false หรือ remaining 0 ทุกประเภท + ธงปิด) · publicCreateHold ⇒ ok:false ไม่สร้างแถว · publicStatus ของการจองเดิมยังดูได้ · คืน ACTIVE · rooms.hotel.storefront.enabled=false ⇒ เหมือนกัน · คืนค่า", async () => {
    needSetup(); needWeb();
    const h0 = await holdOk({ checkIn: W(60), checkOut: W(61) });
    ids.sr6 = (await rvByToken(h0.publicToken)).id;
    const closed = (r: Any) => !okPub(r) || (roomTypesOf(r) ?? []).every((t) => t.remaining === 0);
    const n0 = await rvCount();
    await prisma.businessUnit.update({ where: { id: UH }, data: { status: "PAUSED" } });
    try {
      ok(closed(await search()), "PAUSED ยังค้นหาได้");
      const h = await hold({ checkIn: W(62), checkOut: W(63) });
      ok(h?.ok === false && !isStrV(h?.publicToken), `PAUSED ยังจองได้ ${codeOf(h)}`);
      eq(await rvCount(), n0, "สร้างแถวตอน PAUSED");
      const s = await status(h0.publicToken);
      ok(okPub(s) && J(s).includes(h0.code), "การจองเดิมดูไม่ได้ตอน PAUSED");
    } finally { await prisma.businessUnit.update({ where: { id: UH }, data: { status: "ACTIVE" } }); }
    await setUnit("rooms.hotel.storefront.enabled", false);
    try {
      ok(closed(await search()), "storefront.enabled=false ยังค้นหาได้");
      const h = await hold({ checkIn: W(62), checkOut: W(63) });
      ok(h?.ok === false, `ปิด storefront ยังจองได้ ${codeOf(h)}`);
      eq(await rvCount(), n0, "สร้างแถวตอนปิด storefront");
    } finally { await resetUnit("rooms.hotel.storefront.enabled"); }
    ok(okPub(await search()), "เปิดคืนแล้วต้องค้นหาได้");
  });
  await st("SR-7", "X7 rate limit ค้นหา 60/นาที ต่อ IP+หน่วย (checkRateLimitDb · นับบนฐาน): IP เดียว 61 ครั้ง ⇒ 60 ครั้งแรก ok · ครั้งที่ 61 RATE_LIMITED · IP อื่น ⇒ ok · ChatRateBucket มีแถวเพิ่มจากก่อนเริ่ม (นับ DB ไม่ใช่หน่วยความจำ)", async () => {
    needSetup(); needWeb();
    const b0 = await bucketCount();
    const ip = newIp();
    let firstBad = -1;
    for (let i = 1; i <= 61; i++) { const r = await search({}, { clientKey: ip }); if (i <= 60 && !okPub(r)) { firstBad = i; ok(false, `ครั้งที่ ${i} ⇒ ${codeOf(r)}`); } if (i === 61) ok(limited(r), `ครั้งที่ 61 ⇒ ${codeOf(r)} (ต้อง RATE_LIMITED)`); }
    void firstBad;
    ok(okPub(await search({}, { clientKey: newIp() })), "IP อื่นต้องผ่าน");
    ok((await bucketCount()) > b0, "ChatRateBucket ไม่เพิ่ม (นับในหน่วยความจำ?)");
  });
  await st("SR-8", "publicInfo/ค้นหา: ป้าย «จองตรงถูกกว่า» จากค่าตั้ง rooms.hotel.storefront.badgeTh/badgeEn (ตั้งแล้วปรากฏ · ว่าง = ไม่มี) · images/amenities/bedType ของประเภท (H.0) อยู่ใน DTO (ว่าง = [] / null) · คืนค่า", async () => {
    needSetup(); needWeb();
    await setUnit("rooms.hotel.storefront.badgeTh", "จองตรงถูกกว่า");
    await setUnit("rooms.hotel.storefront.badgeEn", "Best rate direct");
    try {
      const info = await call(() => PUB("publicInfo")({ ...baseA }, { clientKey: newIp() }));
      ok(okPub(info) && J(info).includes("จองตรงถูกกว่า") && J(info).includes("Best rate direct"), `ป้าย ${J(info).slice(0, 200)}`);
    } finally { await resetUnit("rooms.hotel.storefront.badgeTh"); await resetUnit("rooms.hotel.storefront.badgeEn"); }
    const info2 = await call(() => PUB("publicInfo")({ ...baseA }, { clientKey: newIp() }));
    ok(okPub(info2) && !J(info2).includes("จองตรงถูกกว่า"), "ป้ายว่างยังแสดง");
    const t = typeOf(await search(), RTA.dlx);
    ok(t && "images" in t && Array.isArray(t.images), `images ${J(t).slice(0, 120)}`);
  }, "MAJOR");
  await st("SR-9", "ประสิทธิภาพ (CRITICAL ขั้นต่ำ): publicSearch 2 คืน ทั้งหน่วย ⇒ SQL ≤ 14 คำสั่ง (ไม่นับ rate limit · ไม่มี N+1 ต่อแผน/ประเภท — loadPricingContext 6 + availability 3 + หน่วย/ค่าตั้ง)", async () => {
    needSetup(); needWeb();
    await sleep(40); const i0 = SQL_LOG.length;
    const r = await search();
    await sleep(80); const n = sqlCount(i0);
    ok(okPub(r), codeOf(r));
    console.log(`     (publicSearch = ${n} คำสั่ง)`);
    ok(n > 0 && n <= 14, `SQL ${n} คำสั่ง (ต้อง ≤ 14)`);
  });
  await st("SR-10", "ใบ §2.1 (MINOR · ถามผู้คุม): SQL ≤ 6 คำสั่ง · < 400 ms (ดีที่สุดใน 3 รอบ) · ธง «เหลือ N» เมื่อ remaining ≤ 3 (ซูพีเรีย 2 ⇒ true · ดีลักซ์ 4 ⇒ ไม่ติด)", async () => {
    needSetup(); needWeb();
    let best = Number.POSITIVE_INFINITY, n = 0;
    for (let i = 0; i < 3; i++) { await sleep(40); const i0 = SQL_LOG.length; const t = Date.now(); await search(); best = Math.min(best, Date.now() - t); await sleep(60); n = sqlCount(i0); }
    console.log(`     (publicSearch ดีที่สุด ${best} ms · ${n} คำสั่ง)`);
    const r = await search();
    const lowSup = findVal(typeOf(r, RTA.sup), /low|few|last|urgent|scarce/i, (x) => typeof x === "boolean");
    const lowDlx = findVal(typeOf(r, RTA.dlx), /low|few|last|urgent|scarce/i, (x) => typeof x === "boolean");
    ok(lowSup === true && lowDlx !== true, `ธงเหลือน้อย sup=${String(lowSup)} dlx=${String(lowDlx)}`);
    ok(n <= 6, `SQL ${n} > 6`);
    ok(best < 400, `${best} ms ≥ 400`);
  }, "MINOR");

  // ═══════════════ HD publicCreateHold ═══════════════
  console.log("\n── HD publicCreateHold ──");
  const holdEvents = (id: string) => eventsOf("hotel.web.hold_created", (p) => p.reservationId === id || (Array.isArray(p.reservationIds) && p.reservationIds.includes(id)));
  await st("HD-1", "DEPOSIT_REQUIRED (ค่าเริ่ม): WEB ดีลักซ์ 2 คืน ⇒ {publicToken = แถว, code HR-, status HOLD, holdExpiresAt ≈ now+15 นาที, depositRequiredSatang = คืนแรก, intent {qrPayload EMV ยอดล็อก = มัดจำ · kind PROMPTPAY_STATIC · expiresAt = holdExpiresAt}} · แถว: source WEB · createdById null · ratePlanId STANDARD · policySnapshot.locale \"th\" · occupancy HOLD · ไม่มี folio · outbox hotel.web.hold_created + hotel.booking.created ไม่มี PII · AuditLog actorType SYSTEM", async () => {
    needSetup(); needWeb(); needBooking();
    const t0 = Date.now();
    const r = await holdOk();
    const rv = await rvByToken(r.publicToken);
    ok(rv, "ไม่พบแถวจาก publicToken");
    ids.hd1 = rv.id; ids.hd1tok = r.publicToken;
    const dep = refNightPrice(CELL.dlx, W(8));
    eq([r.status, r.code, r.depositRequiredSatang, rv.status, rv.source, rv.createdById, rv.ratePlanId, rv.depositSatang, rv.totalSatang, rv.unitId], ["HOLD", rv.code, dep, "HOLD", "WEB", null, ids.std, dep, refTotal(CELL.dlx, W(8), W(10)), UH], "ผล/แถว");
    ok(/^HR-/.test(rv.code), `code ${rv.code}`);
    ok(near(msOf(r.holdExpiresAt), t0 + 15 * 60_000, 90_000) && near(msOf(rv.holdExpiresAt), msOf(r.holdExpiresAt), 1000), `holdExpiresAt ${r.holdExpiresAt}`);
    const intent = r.intent ?? r.pay ?? null;
    ok(intent && typeof intent === "object", `ไม่มี intent ${J(r).slice(0, 200)}`);
    const qr = qrOf(intent);
    eq([emvAmount(qr), emvTlv(qr)?.get("01")], [dep, "12"], `QR ${qr?.slice(0, 40)}`);
    ok(/STATIC/i.test(String(intent.kind ?? intent.type ?? "")), `kind ${intent.kind}`);
    ok(near(msOf(intent.expiresAt), msOf(r.holdExpiresAt), 2000), `intent.expiresAt ${intent.expiresAt}`);
    eq(rv.policySnapshot?.locale, "th", "policySnapshot.locale");
    const occ = await occOfRv(rv.id, true);
    eq([occ.length, occ[0]?.kind, await folioOf(rv.id)], [1, "HOLD", null], "occupancy/folio");
    const ev = await holdEvents(rv.id);
    eq(ev.length, 1, "event hotel.web.hold_created");
    noPii(ev[0].payload, "hold_created payload");
    const created = await eventsOf("hotel.booking.created", (p) => p.reservationId === rv.id);
    eq(created.length, 1, "hotel.booking.created");
    noPii(created[0].payload, "created payload");
    const a = (await auditsOf("hotel.booking.created")).filter((x) => x.targetId === rv.id);
    eq([a.length, a[0]?.actorType], [1, "SYSTEM"], "AuditLog");
    noPii(a.map((x) => [x.before, x.after]), "AuditLog");
  });
  await st("HD-2", "AUTO_CONFIRM: WEB ⇒ CONFIRMED ทันที · holdExpiresAt null · intent null (ข้ามหน้าจ่าย) · folio OPEN · มัดจำ > 0 ยังจดบนแถว (จ่ายที่โรงแรม) · หน้าสถานะเสนอ QR มัดจำไม่บังคับ (DTO มี qr/pay ยอด = มัดจำ · สถานะยัง CONFIRMED) · คืนค่า", async () => {
    needSetup(); needWeb(); needBooking();
    await setUnit("rooms.hotel.bookingMode", "AUTO_CONFIRM");
    try {
      const r = await holdOk({ checkIn: W(12), checkOut: W(13) });
      const rv = await rvByToken(r.publicToken);
      ids.hd2tok = r.publicToken;
      eq([r.status, r.holdExpiresAt ?? null, r.intent ?? null, rv.status, rv.holdExpiresAt, (await folioOf(rv.id))?.status, rv.depositSatang], ["CONFIRMED", null, null, "CONFIRMED", null, "OPEN", refNightPrice(CELL.dlx, W(12))], "AUTO_CONFIRM");
      const s = await status(r.publicToken);
      ok(okPub(s), `status ${codeOf(s)}`);
      const qr = qrOf(s);
      ok(qr && emvAmount(qr) === rv.depositSatang, `หน้าสถานะไม่เสนอ QR มัดจำ (${qr?.slice(0, 30)})`);
      eq((await rvOf(rv.id)).status, "CONFIRMED", "สถานะหลังดูหน้าสถานะ");
    } finally { await resetUnit("rooms.hotel.bookingMode"); }
  });
  await st("HD-3", "MANUAL_APPROVE: WEB ⇒ HOLD รอโรงแรมยืนยัน · holdExpiresAt ไกล (≥ now+12 ชม. · ไม่ใช่ 15 นาที — H.3 มติ §11.4) · intent null · หน้าสถานะบอกรออนุมัติ (DTO มี MANUAL_APPROVE/APPROVAL/รอโรงแรม) · confirmBooking (manage) ⇒ CONFIRMED · คืนค่า", async () => {
    needSetup(); needWeb(); needBooking();
    await setUnit("rooms.hotel.bookingMode", "MANUAL_APPROVE");
    try {
      const r = await holdOk({ checkIn: W(14), checkOut: W(15) });
      const rv = await rvByToken(r.publicToken);
      eq([r.status, r.intent ?? null, rv.status], ["HOLD", null, "HOLD"], "MANUAL_APPROVE");
      ok(msOf(rv.holdExpiresAt) >= Date.now() + 12 * 3_600_000, `holdExpiresAt ${rv.holdExpiresAt} ต้องไกลกว่า 12 ชม.`);
      const s = await status(r.publicToken);
      ok(okPub(s) && /MANUAL_APPROVE|APPROVAL|รอโรงแรม|awaiting/i.test(J(s)), `หน้าสถานะไม่บอกรออนุมัติ ${J(s).slice(0, 200)}`);
      okRes(await BK("confirmBooking")(OWNER, ctxA, { unitId: UH, id: rv.id, reservationId: rv.id }), "confirm");
      eq((await rvOf(rv.id)).status, "CONFIRMED", "หลัง confirm");
    } finally { await resetUnit("rooms.hotel.bookingMode"); }
  });
  await st("HD-4", "หลายห้อง: ดีลักซ์ qty 2 ⇒ 2 แถว groupId เดียว · code ต่างกัน · depositRequiredSatang = Σ คืนแรก 2 ห้อง · มัดจำอยู่หัวกลุ่ม (แถวแรก) · publicToken = แถวหัวกลุ่ม · intent ยอด = มัดจำรวม · groupId ในผล", async () => {
    needSetup(); needWeb(); needBooking();
    const r = await holdOk({ checkIn: W(16), checkOut: W(18), rooms: [roomSpec(RTA.dlx, 2)] });
    const head = await rvByToken(r.publicToken);
    ok(head?.groupId, "ไม่มี groupId");
    const rows = (await prisma.hotelReservation.findMany({ where: { groupId: head.groupId }, orderBy: { createdAt: "asc" } })) as Any[];
    const dep = 2 * refNightPrice(CELL.dlx, W(16));
    eq([rows.length, new Set(rows.map((x) => x.code)).size, r.depositRequiredSatang, rows.filter((x) => x.depositSatang > 0).length, Math.max(...rows.map((x) => x.depositSatang)), r.groupId ?? head.groupId], [2, 2, dep, 1, dep, head.groupId], "กลุ่ม");
    eq(emvAmount(qrOf(r)), dep, "QR มัดจำรวม");
    ids.hd4tok = r.publicToken;
  });
  await st("HD-5", "เพดานห้อง: qty 6 (> storefront.maxRooms 5) ⇒ ok:false (ไม่สร้างแถว) · ตั้ง maxRooms 1 ⇒ qty 2 ถูกปฏิเสธ · qty 1 ผ่าน · คืนค่า · def rooms.hotel.storefront.maxRooms int เริ่ม 5", async () => {
    needSetup(); needWeb(); needBooking();
    const d = SET.getDef("rooms.hotel.storefront.maxRooms");
    ok(d && d.defaults?._fallback === 5, `def maxRooms ${J(d?.defaults)}`);
    const n0 = await rvCount();
    const r = await hold({ checkIn: W(16), checkOut: W(18), rooms: [roomSpec(RTA.dlx, 6)] });
    ok(r?.ok === false && r.code !== "THROW", `qty 6 ⇒ ${codeOf(r)}`);
    eq(await rvCount(), n0, "สร้างแถว");
    await setUnit("rooms.hotel.storefront.maxRooms", 1);
    try {
      const r2 = await hold({ checkIn: W(19), checkOut: W(20), rooms: [roomSpec(RTA.sup, 2)] });
      ok(r2?.ok === false && r2.code !== "THROW", `qty 2 (max 1) ⇒ ${codeOf(r2)}`);
      eq(await rvCount(), n0, "สร้างแถว (max 1)");
      await holdOk({ checkIn: W(19), checkOut: W(20), rooms: [roomSpec(RTA.sup, 1)] });
    } finally { await resetUnit("rooms.hotel.storefront.maxRooms"); }
  });
  await st("HD-6", "แผนไม่เปิดเว็บ: ratePlanId LINEONLY (visibility [LINE]) ⇒ PLAN_NOT_PUBLIC ไม่สร้างแถว · ratePlanId มั่ว ⇒ NOT_FOUND/INVALID_INPUT · ไม่ส่ง ratePlanId ⇒ แผนเริ่มต้น STANDARD", async () => {
    needSetup(); needWeb(); needBooking();
    const n0 = await rvCount();
    eq(failCode(await hold({ checkIn: W(22), checkOut: W(23), rooms: [roomSpec(RTA.dlx, 1, ids.lineOnly)] })), "PLAN_NOT_PUBLIC", "LINEONLY");
    ok(/^(NOT_FOUND|INVALID_INPUT|PLAN_NOT_PUBLIC)$/.test(String(failCode(await hold({ checkIn: W(22), checkOut: W(23), rooms: [roomSpec(RTA.dlx, 1, "svc-h8-no-plan")] })))), "แผนมั่ว");
    eq(await rvCount(), n0, "สร้างแถว");
    const r = await holdOk({ checkIn: W(22), checkOut: W(23), rooms: [{ roomTypeId: RTA.dlx, qty: 1, adults: 2, children: 0 }] });
    eq((await rvByToken(r.publicToken)).ratePlanId, ids.std, "แผนเริ่มต้น");
  });
  await st("HD-7", "ห้องเต็มระหว่างทาง: แฟมิลี (1 ห้อง) ถูกจองผ่านเคาน์เตอร์ W+24→25 แล้ว ⇒ publicCreateHold ⇒ AVAILABILITY_CHANGED + dates [W+24] (คืนที่เต็ม) ไม่สร้างแถว · ค้นหาคืนเดียวกัน ⇒ soldOutDates ตรงกัน", async () => {
    needSetup(); needWeb(); needBooking();
    await counterBook({ rooms: [{ roomTypeId: RTA.fam, adults: 2, children: 0 }], checkIn: W(24), checkOut: W(25) });
    const n0 = await rvCount();
    const r = await hold({ checkIn: W(24), checkOut: W(26), rooms: [roomSpec(RTA.fam)] });
    eq([failCode(r), r?.dates ?? r?.soldOutDates ?? null], ["AVAILABILITY_CHANGED", [W(24)]], `ผล ${J(r).slice(0, 160)}`);
    eq(await rvCount(), n0, "สร้างแถว");
    eq(typeOf(await search({ checkIn: W(24), checkOut: W(26) }), RTA.fam)?.soldOutDates, [W(24)], "ค้นหา soldOutDates");
  });
  await st("HD-8", "X3 double submit: idempotencyKey เดียว ยิงพร้อมกัน 2 ทาง (ซูพีเรีย W+26) ⇒ สำเร็จทั้งคู่ · publicToken เดียวกัน · แถว 1 · key เดิมยิงซ้ำภายหลัง ⇒ ใบเดิม (ไม่สร้างใหม่) · key เดิมแต่ข้อมูลต่าง (วันอื่น) ⇒ ใบเดิมหรือ ok:false (ไม่สร้างแถวที่สอง)", async () => {
    needSetup(); needWeb(); needBooking();
    const key = `svc-h8-idem-${uid()}`;
    const n0 = await rvCount();
    const [a, b] = await Promise.all([hold({ checkIn: W(26), checkOut: W(27), rooms: [roomSpec(RTA.sup)], idempotencyKey: key }), hold({ checkIn: W(26), checkOut: W(27), rooms: [roomSpec(RTA.sup)], idempotencyKey: key })]);
    ok(okPub(a) && okPub(b) && isStrV(a.publicToken) && a.publicToken === b.publicToken, `พร้อมกัน ${codeOf(a)}/${codeOf(b)} ${a?.publicToken === b?.publicToken}`);
    eq(await rvCount(), n0 + 1, "แถว");
    const c = await hold({ checkIn: W(26), checkOut: W(27), rooms: [roomSpec(RTA.sup)], idempotencyKey: key });
    ok(okPub(c) && c.publicToken === a.publicToken, `ยิงซ้ำ ${codeOf(c)}`);
    const d = await hold({ checkIn: W(27), checkOut: W(28), rooms: [roomSpec(RTA.sup)], idempotencyKey: key });
    ok(!okPub(d) || d.publicToken === a.publicToken, "key เดิมข้อมูลต่างสร้างใบใหม่");
    eq(await rvCount(), n0 + 1, "แถวหลังซ้ำ");
    ids.hd8tok = a.publicToken;
  });
  await st("HD-9", "กันสแปม (ปฏิเสธเงียบ · ไม่ throw · ไม่สร้างแถว): honeypot _sd_hp มีค่า · ตั๋วเริ่มฟอร์มสดใหม่ (< 3 วิ) · ไม่มีตั๋ว · ตั๋วปลอม · ตั๋วของหน่วยอื่น (UHB) ⇒ ทั้งหมด 0 แถว · ตั๋วอายุ 10 วิ ⇒ ผ่าน · ตั๋วใบเดียวใช้ซ้ำ ⇒ ใบที่สองไม่ผ่าน", async () => {
    needSetup(); needWeb(); needBooking();
    const n0 = await rvCount();
    const cases: [string, Over][] = [
      ["honeypot", { spam: { hp: "http://spam.example", st: stTok() } }],
      ["สดใหม่", { spam: { hp: "", st: stTok(0) } }],
      ["ไม่มีตั๋ว", { spam: { hp: "", st: "" } }],
      ["ตั๋วปลอม", { spam: { hp: "", st: "1.2.3" } }],
      ["ตั๋วหน่วยอื่น", { spam: { hp: "", st: stTok(10_000, UHB) } }],
    ];
    for (const [n, over] of cases) {
      const r = await hold({ checkIn: W(28), checkOut: W(29), ...over });
      ok(r?.code !== "THROW", `${n}: throw ${r?.reason}`);
      ok(!isStrV(r?.publicToken) || !(await rvByToken(r.publicToken)), `${n}: ได้ publicToken ที่มีแถวจริง`);
      eq(await rvCount(), n0, `${n}: สร้างแถว`);
    }
    const st1 = stTok(10_000);
    const ok1 = await holdOk({ checkIn: W(28), checkOut: W(29), spam: { hp: "", st: st1 } });
    ok(await rvByToken(ok1.publicToken), "ตั๋วดีต้องสร้างแถว");
    const again = await hold({ checkIn: W(28), checkOut: W(29), rooms: [roomSpec(RTA.sup)], spam: { hp: "", st: st1 } });
    eq(await rvCount(), n0 + 1, `ตั๋วใบเดียวใช้ซ้ำสร้างแถวที่สอง (${codeOf(again)})`);
  });
  await st("HD-10", "locale: en ⇒ policySnapshot.locale \"en\" · ไม่ส่ง ⇒ \"th\" · ค่าแปลก (\"jp\") ⇒ th หรือ INVALID_INPUT · guestEmail เก็บบนแถว (ไม่ใช่ใน note)", async () => {
    needSetup(); needWeb(); needBooking();
    const en = await holdOk({ checkIn: W(30), checkOut: W(31), rooms: [roomSpec(RTA.sup)], locale: "en" });
    const rvEn = await rvByToken(en.publicToken);
    eq([rvEn.policySnapshot?.locale, rvEn.guestEmail, rvEn.note ?? null], ["en", GUEST.email, null], "en");
    ids.hd10tok = en.publicToken;
    const th = await holdOk({ checkIn: W(30), checkOut: W(31), rooms: [roomSpec(RTA.sup)], locale: undefined });
    eq((await rvByToken(th.publicToken)).policySnapshot?.locale, "th", "ค่าเริ่ม th");
    const jp = await hold({ checkIn: W(31), checkOut: W(32), rooms: [roomSpec(RTA.sup)], locale: "jp" });
    ok((okPub(jp) && (await rvByToken(jp.publicToken))?.policySnapshot?.locale === "th") || failCode(jp) === "INVALID_INPUT", `locale แปลก ${codeOf(jp)}`);
  });
  await st("HD-11", "คูปอง (ชั้น platform เรียก coupon.validate · systemId จาก systemForUnit COUPON): couponCode ถูก ⇒ จองได้ · policySnapshot.coupon = {code, systemId, discountSatang 20,000} · depositRequiredSatang ไม่ลด (คิดจากราคาเต็ม) · totalSatang ของแถวไม่ลด (หักตอน settle) · ผลตอบมีส่วนลด 20,000 · publicQuote ให้ discount เดียวกัน · โค้ดผิด ⇒ จองต่อได้ ไม่มี coupon ใน snapshot + มีเหตุผล NOT_FOUND ในผล", async () => {
    needSetup(); needWeb(); needBooking();
    const dep = refNightPrice(CELL.dlx, W(32));
    const q = await call(() => PUB("publicQuote")({ ...baseA, checkIn: W(32), checkOut: W(34), adults: 2, children: 0, rooms: [roomSpec(RTA.dlx)], couponCode: COUPON_CODE }, { clientKey: newIp() }));
    ok(okPub(q), `publicQuote ${codeOf(q)}`);
    eq([findVal(q, /discount/i, isNum), findVal(q, /deposit/i, isNum)], [20_000, dep], `quote ${J(q).slice(0, 200)}`);
    const good = await holdOk({ checkIn: W(32), checkOut: W(34), couponCode: COUPON_CODE });
    const rv = await rvByToken(good.publicToken);
    eq([rv.policySnapshot?.coupon?.code, rv.policySnapshot?.coupon?.systemId, rv.policySnapshot?.coupon?.discountSatang, good.depositRequiredSatang, rv.depositSatang, rv.totalSatang], [COUPON_CODE, COUPON_SYS, 20_000, dep, dep, refTotal(CELL.dlx, W(32), W(34))], "คูปองถูก");
    eq(findVal(good, /discount/i, isNum), 20_000, "ส่วนลดในผล");
    const bad = await holdOk({ checkIn: W(32), checkOut: W(34), couponCode: `NOPE${RUN}` });
    const rv2 = await rvByToken(bad.publicToken);
    ok(!rv2.policySnapshot?.coupon, `โค้ดผิดยังมี coupon ใน snapshot ${J(rv2.policySnapshot?.coupon)}`);
    ok(/NOT_FOUND/.test(J(bad)), `ผลไม่มีเหตุผลคูปอง ${J(bad).slice(0, 200)}`);
  });
  await st("HD-12", "X7 rate limit สร้าง HOLD 5/10 นาที ต่อ IP+หน่วย: IP เดียว 6 ครั้ง (คนละคืน · ดีลักซ์) ⇒ 5 แรก ok · ครั้งที่ 6 RATE_LIMITED ไม่สร้างแถว · IP อื่นผ่าน · hotel.web.hold_created ทุกแถวไม่มี PII · ChatRateBucket เพิ่ม", async () => {
    needSetup(); needWeb(); needBooking();
    const ip = newIp();
    const b0 = await bucketCount();
    for (let i = 0; i < 5; i++) { const r = await hold({ checkIn: W(36 + 2 * i), checkOut: W(37 + 2 * i) }, { clientKey: ip }); ok(okPub(r), `ครั้งที่ ${i + 1} ⇒ ${codeOf(r)}`); }
    const n0 = await rvCount();
    const r6 = await hold({ checkIn: W(46), checkOut: W(47) }, { clientKey: ip });
    ok(limited(r6), `ครั้งที่ 6 ⇒ ${codeOf(r6)}`);
    eq(await rvCount(), n0, "สร้างแถวตอนติดเพดาน");
    ok(okPub(await hold({ checkIn: W(46), checkOut: W(47), rooms: [roomSpec(RTA.sup)] })), "IP อื่น");
    const evs = await eventsOf("hotel.web.hold_created");
    ok(evs.length >= 6, `event hold_created ${evs.length}`);
    for (const e of evs) noPii(e.payload, "hold_created");
    ok((await bucketCount()) > b0, "ChatRateBucket ไม่เพิ่ม");
  });

  // ═══════════════ PY มัดจำ · สลิปกลาง · consumer ═══════════════
  console.log("\n── PY มัดจำ/สลิป (ระบบสลิปกลาง HOTEL/HOTEL_DEPOSIT → consumer → takeBookingDeposit) ──");
  await st("PY-1", "publicAttachSlip(HOLD HD-1 · PNG) ⇒ ok {slipId, status NEEDS_REVIEW} (ไม่มีตัวต่อ = ตรวจมือ) · แถว PaymentSlip domain HOTEL · refType HOTEL_DEPOSIT · refId = reservationId · expectedSatang = มัดจำ (คิดฝั่งเซิร์ฟเวอร์) · unitId UH · ผลไม่มี URL/path ไฟล์ · outbox hotel.web.slip_attached ไม่มี PII · แนบซ้ำ key เดิม ⇒ replay (แถวยัง 1) · หน้าสถานะบอก «สลิปรอตรวจ»", async () => {
    needSetup(); needWeb(); ok(ids.hd1tok, "ไม่มี HD-1");
    const key = `svc-h8-slip-${uid()}`;
    const r = await attachSlip(ids.hd1tok, { idempotencyKey: key });
    ok(okPub(r) && isStrV(r.slipId), `attach ${codeOf(r)} ${r?.reason ?? ""}`);
    ok(/NEEDS_REVIEW|PENDING/.test(String(r.status)), `status ${r.status}`);
    ok(!/https?:\/\/|\/api\/|\.png/.test(J(r)), "ผลมี URL/path ไฟล์");
    const slips = await slipsOf(ids.hd1);
    eq(slips.map((s) => [s.domain, s.refType, s.refId, s.expectedSatang, s.unitId, s.status]), [["HOTEL", "HOTEL_DEPOSIT", ids.hd1, refNightPrice(CELL.dlx, W(8)), UH, r.status]], "แถวสลิป");
    ids.hd1slip = slips[0].id;
    const ev = await eventsOf("hotel.web.slip_attached", (p) => p.reservationId === ids.hd1 || p.slipId === ids.hd1slip);
    eq(ev.length, 1, "event slip_attached");
    noPii(ev[0].payload, "slip_attached payload");
    const again = await attachSlip(ids.hd1tok, { idempotencyKey: key });
    ok(okPub(again) && again.slipId === r.slipId, `replay ${codeOf(again)}`);
    eq((await slipsOf(ids.hd1)).length, 1, "แถวสลิปหลัง replay");
    const s = await status(ids.hd1tok);
    ok(okPub(s) && /NEEDS_REVIEW|PENDING|รอตรวจ|review/i.test(J(s)), `หน้าสถานะไม่บอกสลิปรอตรวจ ${J(s).slice(0, 200)}`);
  });
  await st("PY-2", "X6 ไฟล์: > 5 MB ⇒ ปฏิเสธ (VALIDATION/BAD_FILE) · image/gif ⇒ ปฏิเสธ · ชนิด png แต่ไบต์ไม่ใช่รูป ⇒ ปฏิเสธ · ไฟล์ว่าง ⇒ ปฏิเสธ · token มั่ว ⇒ NOT_FOUND · ทั้งหมดไม่เพิ่มแถว PaymentSlip · rate limit แนบสลิป (IP เดียว 11 ครั้ง ⇒ มี RATE_LIMITED ภายใน 11 ครั้ง)", async () => {
    needSetup(); needWeb(); ok(ids.hd1tok, "ไม่มี HD-1");
    const n0 = await prisma.paymentSlip.count({ where: { tenantId: tA } });
    const bad = async (what: string, over: Over) => { const r = await attachSlip(ids.hd1tok, over); ok(r?.ok === false && r.code !== "THROW", `${what}: ${codeOf(r)} ${r?.reason ?? ""}`); };
    await bad("> 5MB", { file: { data: png(5 * 1024 * 1024 + 10), contentType: "image/png" } });
    await bad("gif", { file: { data: png(), contentType: "image/gif" } });
    await bad("ไม่ใช่รูป", { file: { data: Uint8Array.from(randomBytes(64)), contentType: "image/png" } });
    await bad("ว่าง", { file: { data: new Uint8Array(0), contentType: "image/png" } });
    const nf = await attachSlip(`svc-h8-no-token-${RUN}`);
    ok(notFound(nf), `token มั่ว ${codeOf(nf)}`);
    eq(await prisma.paymentSlip.count({ where: { tenantId: tA } }), n0, "แถวเพิ่ม");
    const ip = newIp();
    let lim = false;
    for (let i = 0; i < 11 && !lim; i++) lim = limited(await attachSlip(ids.hd1tok, { file: { data: png(), contentType: "image/gif" } }, { clientKey: ip }));
    ok(lim, "แนบสลิป 11 ครั้ง IP เดียวไม่ติดเพดาน");
  });
  await st("PY-3", "decideSlip APPROVE (owner) ⇒ outbox payment.slip.approved ⇒ consumer สาขา HOTEL ⇒ takeBookingDeposit(SYSTEM) ⇒ HD-1: CONFIRMED · depositPaidAt/depositSaleId · holdExpiresAt null · ใบรับ PosSale hotel-deposit-<id> PAID · PosPayment PROMPTPAY ยอด = มัดจำ · PosDeposit OPEN · folio OPEN + item DEPOSIT · occupancy STAY · outbox hotel.booking.confirmed + hotel.web.deposit_paid (ไม่มี PII) · GL (drain): Cr 2110 + Cr 2200 = มัดจำ · Dr 1010 · สมดุล · หน้าสถานะ: มัดจำ ✓ · ชำระที่โรงแรม = รวม − มัดจำ", async () => {
    needSetup(); needWeb(); needBooking(); ok(ids.hd1slip, "ไม่มีสลิป PY-1");
    await approveSlip(ids.hd1slip);
    const rv = await rvOf(ids.hd1);
    const dep = refNightPrice(CELL.dlx, W(8));
    eq([rv.status, !!rv.depositPaidAt, !!rv.depositSaleId, rv.holdExpiresAt, rv.depositSatang], ["CONFIRMED", true, true, null, dep], "แถวหลังอนุมัติ");
    const sales = await depositSalesOf(ids.hd1);
    eq([sales.length, sales[0]?.status, sales[0]?.sourceModule, sales[0]?.grandTotalSatang, sales[0]?.id === rv.depositSaleId], [1, "PAID", "POS_DEPOSIT", dep, true], "ใบรับ");
    const pays = await payOf(sales[0].id);
    eq(pays.map((p) => [p.type, p.amountSatang]), [["PROMPTPAY", dep]], "PosPayment");
    eq((await prisma.posDeposit.findUnique({ where: { receiptSaleId: sales[0].id } }))?.status, "OPEN", "PosDeposit");
    eq((await folioOf(ids.hd1))?.status, "OPEN", "folio");
    ok((await prisma.hotelFolioItem.count({ where: { folio: { reservationId: ids.hd1 }, type: "DEPOSIT" } })) === 1, "folio item DEPOSIT");
    eq((await occOfRv(ids.hd1, true)).map((o) => o.kind), ["STAY"], "occupancy");
    eq((await eventsOf("hotel.booking.confirmed", (p) => p.reservationId === ids.hd1)).length, 1, "hotel.booking.confirmed");
    const paid = await eventsOf("hotel.web.deposit_paid", (p) => p.reservationId === ids.hd1);
    eq(paid.length, 1, "hotel.web.deposit_paid");
    noPii(paid[0].payload, "deposit_paid payload");
    const ls = await glLines([sales[0].id]);
    ok(balanced(ls), `GL ไม่สมดุล/ไม่มี (${ls.length} บรรทัด)`);
    eq(netCr(ls, "2110") + netCr(ls, "2200"), dep, "Cr 2110 + Cr 2200");
    ok(netCr(ls, "2110") > 0 && -netCr(ls, "1010") === dep, `Dr 1010 ${-netCr(ls, "1010")} · Cr 2110 ${netCr(ls, "2110")}`);
    const s = await status(ids.hd1tok);
    ok(okPub(s), `status ${codeOf(s)}`);
    ok(findVal(s, /payAtHotel|balance|remaining(Satang)?$|dueAtHotel/i, (x) => x === refTotal(CELL.dlx, W(8), W(10)) - dep) !== undefined, `ชำระที่โรงแรม ${J(s).slice(0, 240)}`);
    ok(/paid|PAID|ตรวจแล้ว|✓/.test(J(s)), "มัดจำ ✓");
  });
  await st("PY-4", "idempotent (X3/X4): consumer payment.slip.approved รับ event เดิมอีก 2 รอบ (รวมพร้อมกัน) ⇒ ใบรับยัง 1 · depositSaleId เดิม · decideSlip ซ้ำ ⇒ INVALID_STATE · payload ปลอม (slipId มั่ว · refId ของร้าน B) ⇒ ไม่ทำอะไร ไม่ throw", async () => {
    needSetup(); needWeb(); needBooking(); ok(ids.hd1slip, "ไม่มีสลิป");
    const ev = (await eventsOf("payment.slip.approved", (p) => p.slipId === ids.hd1slip))[0];
    const evt = { id: ev.id, tenantId: ev.tenantId, type: ev.type, payload: ev.payload, unitId: ev.unitId ?? null, systemId: null };
    const h = consumer("payment.slip.approved");
    await Promise.all([h(evt), h(evt)]);
    await h(evt);
    const rv = await rvOf(ids.hd1);
    eq([(await depositSalesOf(ids.hd1)).length, rv.depositSaleId], [1, (await depositSalesOf(ids.hd1))[0].id], "ใบรับซ้ำ");
    const again = await SV("decideSlip")({ userId: OWNER.userId }, ctxA, ids.hd1slip, { decision: "APPROVE", reason: "ซ้ำ", transRef: `H8${uid()}`.toUpperCase() });
    eq(failCode(again), "INVALID_STATE", "decide ซ้ำ");
    await h({ ...evt, payload: { ...ev.payload, slipId: `svc-h8-fake-${RUN}` } });
    await h({ ...evt, tenantId: tB, payload: { ...ev.payload, refId: ids.hd1 } });
    eq((await depositSalesOf(ids.hd1)).length + (await prisma.posSale.count({ where: { tenantId: tB } })), 1, "payload ปลอมสร้างใบ");
  });
  await st("PY-5", "publicPayDeposit(HOLD ใหม่): คืน intent {qrPayload ยอด = มัดจำ · expiresAt = holdExpiresAt} · เรียกซ้ำ ⇒ ยอด/ผู้รับเดิม ไม่สร้าง PosSale/แถวใด · หลังจ่ายแล้ว (HD-1 CONFIRMED) ⇒ ไม่มี QR ใหม่ (intent null หรือ paid:true) · ร้าน B ไม่มีผู้รับพร้อมเพย์ ⇒ จองได้ (HOLD) แต่ intent null/NO_RECEIVER (ไม่ล้มการจอง)", async () => {
    needSetup(); needWeb(); needBooking();
    const h = await holdOk({ checkIn: W(52), checkOut: W(53) });
    ids.py5tok = h.publicToken;
    const dep = refNightPrice(CELL.dlx, W(52));
    const n0 = await prisma.posSale.count({ where: { tenantId: tA } });
    const p1 = await payDeposit(h.publicToken);
    ok(okPub(p1), `pay ${codeOf(p1)}`);
    eq(emvAmount(qrOf(p1)), dep, "QR ยอด");
    const exp = findVal(p1, /expiresAt/i, isStrV);
    ok(exp && near(msOf(exp), msOf(h.holdExpiresAt), 2000), `expiresAt ${String(exp)}`);
    const p2 = await payDeposit(h.publicToken);
    eq([qrOf(p2), await prisma.posSale.count({ where: { tenantId: tA } })], [qrOf(p1), n0], "ซ้ำ");
    const paid = await payDeposit(ids.hd1tok);
    ok(qrOf(paid) === null || /paid|PAID|ALREADY/i.test(J(paid)), `จ่ายแล้วยังให้ QR ${J(paid).slice(0, 160)}`);
    const hb = await call(() => PUB("publicCreateHold")({ ...baseB, checkIn: W(52), checkOut: W(53), adults: 2, children: 0, rooms: [{ roomTypeId: RT_B, qty: 1, ratePlanId: ids.stdB, adults: 2, children: 0 }], guest: GUEST, locale: "th", spam: { hp: "", st: stTok(10_000, UHB) }, idempotencyKey: `svc-h8-${uid()}` }, { clientKey: newIp() }));
    ok(okPub(hb) && isStrV(hb.publicToken), `ร้าน B จองไม่ได้ ${codeOf(hb)} ${hb?.reason ?? ""}`);
    ids.bTok = hb.publicToken;
    ok(qrOf(hb) === null, "ร้าน B ไม่มีผู้รับแต่ได้ QR");
    eq((await rvByToken(hb.publicToken))?.status, "HOLD", "ร้าน B HOLD");
  });
  await st("PY-6", "จ่ายช้า · ห้องยังว่าง (H.3 ข้อ 2): holdMinutesOnline=1 · HOLD ซูพีเรีย W+48 · แนบสลิป · sweepExpiredHolds({now:+3 นาที} ใต้ SVC_QC_CLOCK) ⇒ CANCELLED HOLD_EXPIRED · hotel.booking.hold_expired 1 · อนุมัติสลิป ⇒ consumer ⇒ re-book: CONFIRMED · nights counted · occupancy STAY · ใบรับ 1 · คืนค่า", async () => {
    needSetup(); needWeb(); needBooking();
    await setUnit("rooms.hotel.holdMinutesOnline", 1);
    try {
      const h = await holdOk({ checkIn: W(48), checkOut: W(49), rooms: [roomSpec(RTA.sup)] });
      ids.py6tok = h.publicToken;
      const rv0 = await rvByToken(h.publicToken); ids.py6 = rv0.id;
      ok(near(msOf(rv0.holdExpiresAt), Date.now() + 60_000, 90_000), `holdExpiresAt ${rv0.holdExpiresAt} (ต้อง ≈ +1 นาที · อ่านค่าตั้ง)`);
      const sl = await attachSlip(h.publicToken);
      ok(okPub(sl) && isStrV(sl.slipId), `attach ${codeOf(sl)}`);
      const sw = await withClock(true, async () => BK("sweepExpiredHolds")({ now: new Date(Date.now() + 3 * 60_000) }));
      ok(sw?.expired >= 1, `sweep ${J(sw)}`);
      eq([(await rvOf(ids.py6)).status, (await rvOf(ids.py6)).cancelReason, (await eventsOf("hotel.booking.hold_expired", (p) => p.reservationId === ids.py6)).length], ["CANCELLED", "HOLD_EXPIRED", 1], "หลัง sweep");
      await approveSlip(sl.slipId);
      const rv = await rvOf(ids.py6);
      eq([rv.status, !!rv.depositPaidAt, (await nightsOfRv(ids.py6)).every((n) => n.counted), (await occOfRv(ids.py6, true)).map((o) => o.kind), (await depositSalesOf(ids.py6)).length], ["CONFIRMED", true, true, ["STAY"], 1], "re-book");
    } finally { await resetUnit("rooms.hotel.holdMinutesOnline"); }
  });
  await st("PY-7", "จ่ายช้า · ห้องไม่ว่างแล้ว: holdMinutesOnline=1 · HOLD «ห้องเดียว» W+50 · แนบสลิป · sweep(+3 นาที) ⇒ CANCELLED · เคาน์เตอร์จองคืนนั้น ⇒ CONFIRMED · อนุมัติสลิป ⇒ consumer ไม่ throw · ใบของแขกคง CANCELLED · ใบรับถูกคืนอัตโนมัติ (REFUND เต็ม · PosDeposit ไม่ OPEN) · outbox hotel.booking.deposit_after_expiry · การจองเคาน์เตอร์ไม่กระทบ · หน้าสถานะบอกหมดเวลา/จองใหม่ · คืนค่า", async () => {
    needSetup(); needWeb(); needBooking();
    await setUnit("rooms.hotel.holdMinutesOnline", 1);
    try {
      const h = await holdOk({ checkIn: W(50), checkOut: W(51), rooms: [roomSpec(RTA.one)] });
      ids.py7tok = h.publicToken;
      const id = (await rvByToken(h.publicToken)).id; ids.py7 = id;
      const sl = await attachSlip(h.publicToken);
      ok(okPub(sl) && isStrV(sl.slipId), `attach ${codeOf(sl)}`);
      await withClock(true, async () => BK("sweepExpiredHolds")({ now: new Date(Date.now() + 3 * 60_000) }));
      eq((await rvOf(id)).status, "CANCELLED", "หลัง sweep");
      const other = await counterBook({ rooms: [{ roomTypeId: RTA.one, adults: 2, children: 0 }], checkIn: W(50), checkOut: W(51) });
      await approveSlip(sl.slipId);
      const rv = await rvOf(id);
      eq([rv.status, (await nightsOfRv(id)).every((n) => !n.counted)], ["CANCELLED", true], "คง CANCELLED");
      const receipts = await depositSalesOf(id);
      ok(receipts.length >= 1, "ไม่มีใบรับ (เงินเข้าแล้วต้องมีใบรับก่อนคืน)");
      const refunds = await refundSalesOf(receipts[0].id);
      eq([refunds.length, refunds[0]?.grandTotalSatang], [1, receipts[0].grandTotalSatang], "คืนอัตโนมัติ");
      ok((await prisma.posDeposit.findUnique({ where: { receiptSaleId: receipts[0].id } }))?.status !== "OPEN", "PosDeposit ยัง OPEN");
      eq((await eventsOf("hotel.booking.deposit_after_expiry", (p) => p.reservationId === id)).length, 1, "event deposit_after_expiry");
      eq((await rvOf(other.reservations[0].id)).status, "CONFIRMED", "เคาน์เตอร์กระทบ");
      const s = await status(h.publicToken);
      ok(okPub(s) && /HOLD_EXPIRED|EXPIRED|หมดเวลา|จองใหม่/i.test(J(s)), `หน้าสถานะไม่บอกหมดเวลา ${J(s).slice(0, 200)}`);
    } finally { await resetUnit("rooms.hotel.holdMinutesOnline"); }
  });

  // ═══════════════ ST หน้าสถานะ · lookup · ยกเลิกเอง ═══════════════
  console.log("\n── ST publicStatus · publicLookup · publicCancel ──");
  const maskedEmail = (s: string) => { const j = J(s); return !EMAIL_FULL.test(j) && /\*|…|\.\.\./.test(j); };
  await st("ST-1", "publicStatus(HOLD PY-5) DTO §2.4: code · ชื่อประเภทห้อง · checkIn/checkOut · nights 1 · adults 2 · status HOLD · holdExpiresAt (นับถอยหลัง) · มัดจำ {ต้องจ่าย = คืนแรก · ยังไม่จ่าย} · ชำระที่โรงแรม = รวม − มัดจำ · เวลาเช็กอิน/เอาต์ 14:00/12:00 (ค่าตั้ง) · QR มัดจำ · ไม่มีเบอร์เต็ม · อีเมล mask · ไม่มี publicToken/guestName เต็ม/id ภายในเกินจำเป็น · token มั่ว ⇒ NOT_FOUND (ไม่ throw)", async () => {
    needSetup(); needWeb(); ok(ids.py5tok, "ไม่มี PY-5");
    const r = await status(ids.py5tok);
    ok(okPub(r), `status ${codeOf(r)}`);
    const rv = await rvByToken(ids.py5tok);
    const s = J(r);
    ok(s.includes(rv.code) && s.includes("ดีลักซ์") && s.includes(W(52)) && s.includes(W(53)), "code/ประเภท/วัน");
    ok(/"HOLD"/.test(s), "status HOLD");
    ok(findVal(r, /holdExpiresAt|expiresAt/i, isStrV) !== undefined, "holdExpiresAt");
    const dep = refNightPrice(CELL.dlx, W(52));
    ok(findVal(r, /deposit/i, (x) => x === dep || (isRec(x) && (x.requiredSatang === dep || x.amountSatang === dep || x.satang === dep))) !== undefined, `มัดจำ ${dep} ไม่อยู่ใน DTO`);
    ok(findVal(r, /payAtHotel|balance|remaining(Satang)?$|dueAtHotel/i, (x) => x === refTotal(CELL.dlx, W(52), W(53)) - dep) !== undefined, "ชำระที่โรงแรม");
    ok(s.includes("14:00") && s.includes("12:00"), "เวลาเช็กอิน/เอาต์");
    ok(emvAmount(qrOf(r)) === dep, "QR มัดจำบนหน้าสถานะ HOLD");
    ok(!s.includes(GUEST.phone), "เบอร์เต็มหลุด");
    ok(maskedEmail(r), `อีเมลไม่ mask ${s.slice(0, 200)}`);
    ok(![...walkKeys(r)].some((k) => /publicToken|secret|policySnapshot|createdById|partyId/i.test(k)), "คีย์ภายในหลุด");
    ok(notFound(await status(`svc-h8-none-${RUN}`)), "token มั่ว");
  });
  await st("ST-2", "สถานะ CONFIRMED (HD-1 จ่ายแล้ว): มัดจำ ✓ (paid true/สลิปตรวจแล้ว) · ไม่มี QR มัดจำ · ปุ่ม LINE: ไม่มี OA ⇒ ไม่มีลิงก์ line.me · ตั้ง ChatChannelConnection LINE (meta.basicId @h8oa) + messaging.lineConnectionId + notify.channel BOTH ⇒ DTO มี https://line.me/R/ti/p/@h8oa · notify.channel EMAIL ⇒ ไม่มีลิงก์ · คืนค่า", async () => {
    needSetup(); needWeb(); ok(ids.hd1tok, "ไม่มี HD-1");
    const r0 = await status(ids.hd1tok);
    ok(okPub(r0) && /"CONFIRMED"/.test(J(r0)) && /paid|PAID|ตรวจแล้ว/.test(J(r0)), `CONFIRMED ${J(r0).slice(0, 160)}`);
    ok(!/line\.me/.test(J(r0)), "ไม่มี OA แต่มีลิงก์ LINE");
    const chatSys = await prisma.appSystem.create({ data: { tenantId: tA, type: "CHAT", name: "แชท A H8" } });
    const conn = await prisma.chatChannelConnection.create({ data: { tenantId: tA, systemId: chatSys.id, type: "LINE", displayName: "OA H8", externalAccountId: `U${RUN}`, credentials: {}, meta: { basicId: "@h8oa" } } });
    await setUnit("messaging.lineConnectionId", conn.id);
    await setUnit("rooms.hotel.notify.channel", "BOTH");
    try {
      const r1 = await status(ids.hd1tok);
      ok(okPub(r1) && J(r1).includes("https://line.me/R/ti/p/@h8oa"), `ไม่มีลิงก์เพิ่มเพื่อน ${J(r1).slice(0, 200)}`);
      await setUnit("rooms.hotel.notify.channel", "EMAIL");
      ok(!/line\.me/.test(J(await status(ids.hd1tok))), "EMAIL อย่างเดียวยังมีลิงก์ LINE");
    } finally { await resetUnit("rooms.hotel.notify.channel"); await resetUnit("messaging.lineConnectionId"); }
  });
  await st("ST-3", "publicLookup: code+email ตรง ⇒ {publicToken} ของ HD-1 · code ตัวเล็ก/มีช่องว่าง + อีเมลตัวใหญ่/ช่องว่าง ⇒ เจอ (lower/trim) · อีเมลผิด ⇒ ไม่พบ · code ผิด ⇒ ไม่พบ คำตอบเดียวกันทุกไบต์ · ไม่มีช่องค้นชื่อ (input name ⇒ ไม่พบ/เพิกเฉย) · outbox hotel.web.lookup_failed ไม่มี PII (ไม่มีอีเมล/code ที่กรอก)", async () => {
    needSetup(); needWeb(); ok(ids.hd1tok, "ไม่มี HD-1");
    const rv = await rvOf(ids.hd1);
    const a = await lookup({ code: rv.code, email: GUEST.email });
    ok(okPub(a) && a.publicToken === ids.hd1tok, `ตรง ${J(a).slice(0, 120)}`);
    const b = await lookup({ code: ` ${rv.code.toLowerCase()} `, email: ` ${GUEST.email.toUpperCase()} ` });
    ok(okPub(b) && b.publicToken === ids.hd1tok, `lower/trim ${J(b).slice(0, 120)}`);
    const n0 = (await eventsOf("hotel.web.lookup_failed")).length;
    const wrongMail = await lookup({ code: rv.code, email: `x-${GUEST.email}` });
    const wrongCode = await lookup({ code: `${rv.code}9`, email: GUEST.email });
    ok(notFound(wrongMail) && notFound(wrongCode), `ผิด ${J(wrongMail)} / ${J(wrongCode)}`);
    eq(J(wrongMail), J(wrongCode), "คำตอบต้องเหมือนกันทุกไบต์");
    ok(!J(wrongMail).includes(ids.hd1tok), "รั่ว token");
    const byName = await lookup({ name: GUEST.name, email: GUEST.email });
    ok(notFound(byName) || !okPub(byName), "ค้นด้วยชื่อได้");
    const evs = await eventsOf("hotel.web.lookup_failed");
    ok(evs.length >= n0 + 2, `event lookup_failed ${evs.length - n0}`);
    for (const e of evs) { noPii(e.payload, "lookup_failed"); ok(!J(e.payload).includes(rv.code), "payload มี code ที่กรอก"); }
  });
  await st("ST-4", "เวลาตอบ lookup ไม่พบ (X7 · ป้องกันเดา code): มัธยฐาน 7 รอบ «code ถูก/อีเมลผิด» กับ «code ผิด» ต่างกันไม่เกิน 2 เท่า (และไม่เกิน 150 ms สัมบูรณ์)", async () => {
    needSetup(); needWeb(); ok(ids.hd1, "ไม่มี HD-1");
    const rv = await rvOf(ids.hd1);
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const t = async (over: Over) => { const s = Date.now(); await lookup(over); return Date.now() - s; };
    const a: number[] = [], b: number[] = [];
    for (let i = 0; i < 7; i++) { a.push(await t({ code: rv.code, email: `x${i}-${GUEST.email}` })); b.push(await t({ code: `${rv.code}${i}X`, email: GUEST.email })); }
    const ma = med(a), mb = med(b);
    console.log(`     (lookup ไม่พบ: อีเมลผิด ${ma} ms · code ผิด ${mb} ms)`);
    ok(Math.max(ma, mb) <= 2 * Math.max(1, Math.min(ma, mb)) || Math.abs(ma - mb) <= 150, `ต่าง ${ma} vs ${mb} ms`);
  }, "MINOR");
  await st("ST-5", "X1 ข้ามร้าน: token ร้าน B (PY-5) บนหน้า A ⇒ ไม่พบ (คำตอบเดียวกับ token มั่ว) · token ร้าน A บน B ⇒ ไม่พบ · lookup code+อีเมลของ A บนร้าน B ⇒ ไม่พบ · publicCancel token B บน A ⇒ ไม่พบ ไม่เปลี่ยนแถว · ร้าน B ดู token ตัวเองได้", async () => {
    needSetup(); needWeb(); ok(ids.bTok && ids.hd1tok, "ไม่มี token");
    const rnd = await status(`svc-h8-none-${RUN}`);
    const xb = await status(ids.bTok);
    ok(notFound(xb), `token B บน A ${codeOf(xb)}`);
    eq(J(xb), J(rnd), "คำตอบ token ร้านอื่น ≠ token มั่ว");
    ok(notFound(await status(ids.hd1tok, { ...baseB })), "token A บน B");
    const rv = await rvOf(ids.hd1);
    ok(notFound(await lookup({ ...baseB, code: rv.code, email: GUEST.email })), "lookup ข้ามร้าน");
    const bRow0 = J(await rvByToken(ids.bTok));
    ok(notFound(await cancelPub({ publicToken: ids.bTok, email: GUEST.email, confirmRefundSatang: 0 })), "cancel ข้ามร้าน");
    eq(J(await rvByToken(ids.bTok)), bRow0, "แถวร้าน B เปลี่ยน");
    ok(okPub(await status(ids.bTok, { ...baseB })), "ร้าน B ดูของตัวเอง");
  });
  await st("ST-6", "self-cancel 100% (HD-1 CONFIRMED จ่ายแล้ว · เข้า +8 · กฎ 7 วัน): หน้าสถานะแสดงยอดคืน = มัดจำเต็ม + ยกเลิกได้ · publicCancel confirmRefundSatang ผิด ⇒ REFUND_CHANGED ไม่เปลี่ยน · อีเมลผิด ⇒ ไม่พบ/ปฏิเสธ · ถูกต้อง ⇒ ok CANCELLED cancelReason มี · PosSale REFUND อ้างใบรับ ยอดเต็ม · PosDeposit REFUNDED · nights false · occupancy inactive · AuditLog hotel.booking.cancelled actorType SYSTEM + by GUEST · outbox hotel.booking.cancelled + hotel.web.cancelled_by_guest ไม่มี PII · ยกเลิกซ้ำ ⇒ ok:false (ใบคืนยัง 1) · หน้าสถานะ CANCELLED + ยอดคืน", async () => {
    needSetup(); needWeb(); needBooking(); ok(ids.hd1tok, "ไม่มี HD-1");
    const rv0 = await rvOf(ids.hd1);
    eq(rv0.status, "CONFIRMED", "ต้อง CONFIRMED ก่อน");
    const paid = rv0.depositSatang as number;
    const exp = refRefund(paid, W(8), T0, Q2_RULES).refundSatang;
    eq(exp, paid, "oracle: ต้องคืน 100%");
    const s0 = await status(ids.hd1tok);
    ok(findVal(s0, /refund/i, (x) => x === exp) !== undefined, `หน้าสถานะไม่แสดงยอดคืน ${exp} (${J(s0).slice(0, 200)})`);
    ok(findVal(s0, /canCancel|cancellable|selfCancel/i, (x) => x === true) !== undefined, "ไม่มีธงยกเลิกได้");
    const wrongAmt = await cancelPub({ publicToken: ids.hd1tok, email: GUEST.email, confirmRefundSatang: exp - 100 });
    eq([failCode(wrongAmt), (await rvOf(ids.hd1)).status], ["REFUND_CHANGED", "CONFIRMED"], "ยอดไม่ตรง");
    const wrongMail = await cancelPub({ publicToken: ids.hd1tok, email: `x-${GUEST.email}`, confirmRefundSatang: exp });
    ok(wrongMail?.ok === false && wrongMail.code !== "THROW" && (await rvOf(ids.hd1)).status === "CONFIRMED", `อีเมลผิด ${codeOf(wrongMail)}`);
    const r = await cancelPub({ publicToken: ids.hd1tok, email: GUEST.email, confirmRefundSatang: exp });
    ok(okPub(r), `cancel ${codeOf(r)} ${r?.reason ?? ""}`);
    const rv = await rvOf(ids.hd1);
    eq([rv.status, !!rv.cancelledAt, isStrV(rv.cancelReason)], ["CANCELLED", true, true], "แถว");
    const refunds = await refundSalesOf(rv0.depositSaleId);
    eq([refunds.length, refunds[0]?.grandTotalSatang, (await prisma.posDeposit.findUnique({ where: { receiptSaleId: rv0.depositSaleId } }))?.status], [1, paid, "REFUNDED"], "คืนเงิน");
    ok((await nightsOfRv(ids.hd1)).every((n) => !n.counted) && (await occOfRv(ids.hd1, true)).length === 0, "nights/occupancy");
    const a = (await auditsOf("hotel.booking.cancelled")).filter((x) => x.targetId === ids.hd1);
    ok(a.length >= 1 && a[0].actorType === "SYSTEM" && /GUEST/.test(J(a[0].after)), `AuditLog ${J(a.map((x) => [x.actorType, x.after])).slice(0, 200)}`);
    noPii(a.map((x) => [x.before, x.after]), "AuditLog cancel");
    const ev = await eventsOf("hotel.booking.cancelled", (p) => p.reservationId === ids.hd1);
    eq(ev.length, 1, "hotel.booking.cancelled");
    noPii(ev[0].payload, "cancelled payload");
    const g = await eventsOf("hotel.web.cancelled_by_guest", (p) => p.reservationId === ids.hd1);
    eq(g.length, 1, "hotel.web.cancelled_by_guest");
    noPii(g[0].payload, "cancelled_by_guest payload");
    const again = await cancelPub({ publicToken: ids.hd1tok, email: GUEST.email, confirmRefundSatang: 0 });
    ok(again?.ok === false && again.code !== "THROW", `ยกเลิกซ้ำ ${codeOf(again)}`);
    eq((await refundSalesOf(rv0.depositSaleId)).length, 1, "ใบคืนเบิ้ล");
    const s1 = await status(ids.hd1tok);
    ok(okPub(s1) && /"CANCELLED"/.test(J(s1)) && J(s1).includes(String(exp)), `หน้าสถานะหลังยกเลิก ${J(s1).slice(0, 200)}`);
  });
  await st("ST-7", "ปิด selfCancel / สถานะผิด: rooms.hotel.storefront.selfCancel=false ⇒ publicCancel (HOLD PY-5) FORBIDDEN ไม่เปลี่ยน + หน้าสถานะธงยกเลิกได้ = false · คืนค่า · CHECKED_IN (เคาน์เตอร์จอง W+0 มัดจำ · checkIn เดิม) ⇒ publicCancel ok:false (INVALID_STATUS) สถานะคง · def selfCancel bool เริ่ม true", async () => {
    needSetup(); needWeb(); needBooking(); ok(ids.py5tok, "ไม่มี PY-5");
    const d = SET.getDef("rooms.hotel.storefront.selfCancel");
    ok(d && d.defaults?._fallback === true, `def selfCancel ${J(d?.defaults)}`);
    await setUnit("rooms.hotel.storefront.selfCancel", false);
    try {
      const r = await cancelPub({ publicToken: ids.py5tok, email: GUEST.email, confirmRefundSatang: 0 });
      eq([failCode(r), (await rvByToken(ids.py5tok)).status], ["FORBIDDEN", "HOLD"], "ปิด selfCancel");
      ok(findVal(await status(ids.py5tok), /canCancel|cancellable|selfCancel/i, (x) => typeof x === "boolean") !== true, "ธงยกเลิกได้ยัง true");
    } finally { await resetUnit("rooms.hotel.storefront.selfCancel"); }
    const c = await counterBook({ checkIn: W(0), checkOut: W(1) });
    const cid = c.reservations[0].id;
    okRes(await BK("takeBookingDeposit")(OWNER, ctxA, { unitId: UH, reservationId: cid, payType: "CASH" }), "มัดจำเคาน์เตอร์");
    const rvc = await rvOf(cid);
    const roomId = rvc.roomId ?? (await occOfRv(cid, true))[0]?.roomId;
    ok(roomId, "ไม่มีห้องให้เช็กอิน");
    try { await setUnit("rooms.hotel.guest.requireRegistration", false); } catch { /* ยังไม่มีคีย์ */ }
    okRes(await fnOf(serviceL, "checkIn", F.service)(tA, UH, cid, roomId), "checkIn");
    eq((await rvOf(cid)).status, "CHECKED_IN", "เช็กอิน");
    const r2 = await cancelPub({ publicToken: rvc.publicToken, email: "", confirmRefundSatang: 0 });
    ok(r2?.ok === false && r2.code !== "THROW" && (await rvOf(cid)).status === "CHECKED_IN", `CHECKED_IN ยกเลิกได้ ${codeOf(r2)}`);
  });
  await st("ST-8", "self-cancel 50% (เข้า +5 · กฎ 3 วัน 50%): HOLD ดีลักซ์ W+5 → สลิป → อนุมัติ → CONFIRMED · หน้าสถานะยอดคืน = floor(มัดจำ/2) · ยกเลิก ⇒ REFUND = ครึ่ง · ค่าธรรมเนียม (บิลริบ dep-forfeit) = ครึ่ง · คืน+ริบ = มัดจำ · PosDeposit ไม่ OPEN · เงินทุกบาทผ่าน POS", async () => {
    needSetup(); needWeb(); needBooking();
    const h = await holdOk({ checkIn: W(5), checkOut: W(6) });
    const id = (await rvByToken(h.publicToken)).id;
    const sl = await attachSlip(h.publicToken);
    ok(okPub(sl), `attach ${codeOf(sl)}`);
    await approveSlip(sl.slipId);
    const rv = await rvOf(id);
    eq(rv.status, "CONFIRMED", "CONFIRMED");
    const paid = rv.depositSatang as number;
    const exp = refRefund(paid, W(5), T0, Q2_RULES).refundSatang;
    eq(exp, Math.floor(paid / 2), "oracle 50%");
    ok(findVal(await status(h.publicToken), /refund/i, (x) => x === exp) !== undefined, `ยอดคืน ${exp} ไม่อยู่ในหน้าสถานะ`);
    okRes(await cancelPub({ publicToken: h.publicToken, email: GUEST.email, confirmRefundSatang: exp }), "cancel");
    const refunds = await refundSalesOf(rv.depositSaleId);
    const dep = await prisma.posDeposit.findUnique({ where: { receiptSaleId: rv.depositSaleId } });
    const forfeits = dep ? ((await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `dep-forfeit:${dep.id}` }, status: "PAID" } })) as Any[]) : [];
    eq([refunds.length, refunds[0]?.grandTotalSatang, sum(forfeits.map((s) => s.grandTotalSatang)), dep?.status !== "OPEN"], [1, exp, paid - exp, true], "คืน/ริบ");
    eq((await rvOf(id)).status, "CANCELLED", "สถานะ");
  });
  await st("ST-9", "X7 rate limit ยกเลิก 3/ชม. ต่อ IP (นับทุกครั้งที่ยิง): IP เดียวยิง publicCancel ยอดผิด 3 ครั้ง (REFUND_CHANGED) · ครั้งที่ 4 ⇒ RATE_LIMITED · IP อื่น ⇒ REFUND_CHANGED · การจอง (PY-6 CONFIRMED) ไม่เปลี่ยน", async () => {
    needSetup(); needWeb(); ok(ids.py6tok, "ไม่มี PY-6");
    const ip = newIp();
    const codes: (string | null)[] = [];
    for (let i = 0; i < 4; i++) codes.push(failCode(await cancelPub({ publicToken: ids.py6tok, email: GUEST.email, confirmRefundSatang: 1 }, { clientKey: ip })));
    eq(codes.slice(0, 3), ["REFUND_CHANGED", "REFUND_CHANGED", "REFUND_CHANGED"], "3 ครั้งแรก");
    ok(/RATE_LIMIT|REFUSED/.test(String(codes[3])), `ครั้งที่ 4 ⇒ ${codes[3]}`);
    eq(failCode(await cancelPub({ publicToken: ids.py6tok, email: GUEST.email, confirmRefundSatang: 1 })), "REFUND_CHANGED", "IP อื่น");
    eq((await rvOf(ids.py6)).status, "CONFIRMED", "การจองเปลี่ยน");
  });

  // ═══════════════ NT แจ้งแขก (อีเมล 5 แบบ · sendEmailRich) ═══════════════
  console.log("\n── NT แจ้งแขก (hotel-mail.ts · notifyGuest · consumer · งานเตือน) ──");
  type Sent = { url: string; headers: Record<string, string>; body: Any };
  const fakeFetch = (box: Sent[]): typeof fetch => (async (url: Any, init: Any) => { box.push({ url: String(url), headers: Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])), body: JSON.parse(String(init?.body ?? "{}")) }); return new Response(JSON.stringify({ id: `fake_${uid()}` }), { status: 200, headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;
  const MAIL_KINDS: string[] = Array.isArray(mailL.mod?.GUEST_MAIL_KINDS) ? mailL.mod.GUEST_MAIL_KINDS : ["hold", "confirmed", "reminder", "cancelled", "expired"];
  const notify = async (kind: string, reservationId: string, locale: string | undefined, box: Sent[]) => call(() => fnOf(mailL, "notifyGuest", F.mail)(kind, reservationId, locale, { fetch: fakeFetch(box) }));
  await st("NT-1", "notifyGuest 5 แบบ (hold · confirmed · reminder · cancelled · expired · deps.fetch ฉีด) บน HD-1 ⇒ ok ทุกแบบ · ยิง 1 ครั้ง/แบบ · to = guestEmail · fromName = ชื่อโรงแรม · Idempotency-Key = hotel-mail-<kind>-<reservationId> · subject ไทย · html มี code · ไม่มีเลขบัตร/พาสปอร์ต · confirmed มีไฟล์แนบ .ics", async () => {
    needMail(); ok(ids.hd1, "ไม่มี HD-1");
    const bad: string[] = [];
    for (const k of MAIL_KINDS) {
      const box: Sent[] = [];
      const r = await notify(k, ids.hd1, "th", box);
      if (!okPub(r)) { bad.push(`${k}: ${codeOf(r)} ${r?.reason ?? ""}`); continue; }
      if (box.length !== 1) { bad.push(`${k}: fetch ${box.length} ครั้ง`); continue; }
      const m = box[0];
      const to = Array.isArray(m.body.to) ? m.body.to : [m.body.to];
      if (!to.includes(GUEST.email)) bad.push(`${k}: to ${J(to)}`);
      if (!/บ้านริมน้ำ โฮเทล H8/.test(String(m.body.from))) bad.push(`${k}: from ${m.body.from}`);
      if (m.headers["idempotency-key"] !== `hotel-mail-${k}-${ids.hd1}`) bad.push(`${k}: Idempotency-Key ${m.headers["idempotency-key"]}`);
      if (!THAI.test(String(m.body.subject))) bad.push(`${k}: subject ไม่ไทย`);
      const rv = await rvOf(ids.hd1);
      if (!String(m.body.html).includes(rv.code)) bad.push(`${k}: html ไม่มี code`);
      if (/idNumber|passport|เลขบัตร\s*\d|\d{13}/.test(String(m.body.html))) bad.push(`${k}: เลขบัตรใน html`);
      if (k === "confirmed" && !(Array.isArray(m.body.attachments) && m.body.attachments.some((a: Any) => /\.ics$/.test(String(a.filename))))) bad.push("confirmed: ไม่มี .ics");
    }
    eq(bad, [], "อีเมล");
  });
  await st("NT-2", "ภาษาตาม locale: notifyGuest(confirmed · en) ⇒ subject/html ไม่มีอักษรไทย (ยกเว้นชื่อร้าน/ชื่อแขก) · th ⇒ มีไทย · ไม่ส่ง locale ⇒ ใช้ policySnapshot.locale ของแถว (HD-10 en ⇒ อังกฤษ) · kind แปลก ⇒ ok:false ไม่ throw ไม่ยิง", async () => {
    needMail(); ok(ids.hd1 && ids.hd10tok, "ไม่มี HD-1/HD-10");
    const strip = (s: string) => s.replace(/บ้านริมน้ำ โฮเทล H8|ผู้เข้าพักทดสอบ h8/g, "");
    const en: Sent[] = [];
    okRes(await notify("confirmed", ids.hd1, "en", en), "en");
    ok(en.length === 1 && !THAI.test(strip(String(en[0].body.subject))) && !THAI.test(strip(String(en[0].body.html).replace(/<[^>]+>/g, ""))), `en ยังมีไทย ${String(en[0]?.body.subject)}`);
    const th: Sent[] = [];
    okRes(await notify("confirmed", ids.hd1, "th", th), "th");
    ok(th.length === 1 && THAI.test(String(th[0].body.subject)), "th ไม่มีไทย");
    const auto: Sent[] = [];
    const rvEn = await rvByToken(ids.hd10tok);
    okRes(await notify("hold", rvEn.id, undefined, auto), "locale จากแถว");
    ok(auto.length === 1 && !THAI.test(strip(String(auto[0].body.subject))), `locale จาก snapshot (en) แต่ subject ${String(auto[0]?.body.subject)}`);
    const odd: Sent[] = [];
    const r = await notify("party", ids.hd1, "th", odd);
    ok(r?.ok === false && r.code !== "THROW" && odd.length === 0, `kind แปลก ${codeOf(r)} ยิง ${odd.length}`);
  });
  await st("NT-3", "ไม่มี guestEmail ⇒ ไม่ส่ง: HOLD ใหม่ไม่ใส่อีเมล ⇒ notifyGuest(hold) ⇒ ok:false/skipped (code NO_EMAIL หรือ sent:false) · fetch 0 ครั้ง · reservationId มั่ว ⇒ NOT_FOUND ไม่ throw · ร้าน B id บน A ⇒ ไม่ส่ง", async () => {
    needMail(); needWeb(); needBooking();
    const h = await holdOk({ checkIn: W(56), checkOut: W(57), rooms: [roomSpec(RTA.sup)], guest: { name: GUEST.name, phone: GUEST.phone } });
    const id = (await rvByToken(h.publicToken)).id;
    const box: Sent[] = [];
    const r = await notify("hold", id, "th", box);
    ok(box.length === 0 && (r?.ok === false || r?.sent === false || r?.skipped === true), `ไม่มีอีเมลแต่ ${J(r).slice(0, 120)} ยิง ${box.length}`);
    const nf = await notify("hold", `svc-h8-none-${RUN}`, "th", box);
    ok(nf?.ok === false && nf.code !== "THROW" && box.length === 0, `id มั่ว ${codeOf(nf)}`);
  });
  await st("NT-4", "consumer ของ event H.3 ส่งอีเมล (outbox-consumers → lazy import platform/hotel-mail): consumers[\"hotel.booking.created\"](event HOLD PY-5 ที่มีอีเมล) ⇒ บรรทัด \"[email:dev] rich\" ≥ 1 (ไม่มี RESEND key = log) · ไม่ throw · hotel.booking.confirmed (PY-6) ⇒ ส่ง · event ของการจองไม่มีอีเมล (NT-3) ⇒ 0 บรรทัด · consumer ซ้ำ event เดิม ⇒ ไม่ throw", async () => {
    needMail(); ok(ids.py5tok && ids.py6, "ไม่มี PY-5/PY-6");
    ok(!process.env.RESEND_API_KEY, "env QC มี RESEND_API_KEY — ข้อนี้ต้องรันโดยไม่มีกุญแจจริง");
    const rv5 = await rvByToken(ids.py5tok);
    const evC = (await eventsOf("hotel.booking.created", (p) => p.reservationId === rv5.id))[0];
    ok(evC, "ไม่มี event created ของ PY-5");
    const asEvt = (e: Any) => ({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, unitId: e.unitId ?? null, systemId: null });
    const l1 = mailLines(await captureLogs(() => consumer("hotel.booking.created")(asEvt(evC))));
    ok(l1.length >= 1, `created ไม่ส่งอีเมล (${l1.length})`);
    const evF = (await eventsOf("hotel.booking.confirmed", (p) => p.reservationId === ids.py6))[0];
    ok(evF, "ไม่มี event confirmed ของ PY-6");
    const l2 = mailLines(await captureLogs(() => consumer("hotel.booking.confirmed")(asEvt(evF))));
    ok(l2.length >= 1, `confirmed ไม่ส่งอีเมล (${l2.length})`);
    const noMail = (await prisma.hotelReservation.findFirst({ where: { tenantId: tA, unitId: UH, guestEmail: null, source: "WEB" }, orderBy: { createdAt: "desc" } })) as Any;
    ok(noMail, "ไม่มีการจองไร้อีเมล (NT-3)");
    const evN = (await eventsOf("hotel.booking.created", (p) => p.reservationId === noMail.id))[0];
    const l3 = mailLines(await captureLogs(() => consumer("hotel.booking.created")(asEvt(evN))));
    eq(l3.length, 0, "ไม่มีอีเมลแต่ส่ง");
    await consumer("hotel.booking.created")(asEvt(evC));
  });
  await st("NT-5", "งานเตือนก่อนเข้า 1 วัน: ทะเบียน minute-jobs มี \"hotel-guest-reminder\" (cadence daily) · CONFIRMED เข้าพรุ่งนี้ (เคาน์เตอร์ W+1 · มีอีเมล) · run(วันนี้ 10:30 ไทย) ⇒ อีเมล ≥ 1 · run ซ้ำ ⇒ 0 (ไม่ส่งซ้ำ) · def rooms.hotel.storefront.reminderHour time เริ่ม \"10:00\"", async () => {
    needMail(); needBooking();
    const d = SET.getDef("rooms.hotel.storefront.reminderHour");
    ok(d && d.defaults?._fallback === "10:00", `def reminderHour ${J(d?.defaults)}`);
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const job = reg?.get("hotel-guest-reminder");
    ok(job && typeof job.run === "function", `ไม่มี minute job hotel-guest-reminder (มี: ${[...(reg?.keys() ?? [])].filter((k) => /hotel/.test(k)).join(",") || "-"})`);
    ok(job.cadence === "daily" || job.everyMinutes >= 60, `cadence ${job.cadence}/${job.everyMinutes}`);
    await counterBook({ rooms: [{ roomTypeId: RTA.sup, adults: 2, children: 0 }], checkIn: W(1), checkOut: W(2), guest: GUEST });
    const now = new Date(`${T0}T10:30:00+07:00`);
    const ctl = () => ({ signal: new AbortController().signal, deadline: Date.now() + 20_000 });
    const l1 = mailLines(await captureLogs(() => job.run(now, 20_000, ctl())));
    ok(l1.length >= 1, `รอบแรกไม่ส่ง (${l1.length})`);
    const l2 = mailLines(await captureLogs(() => job.run(now, 20_000, ctl())));
    eq(l2.length, 0, "รอบสองส่งซ้ำ");
  });
  await st("NT-6", "HOLD หมดอายุ/ยกเลิก: consumer hotel.booking.hold_expired (event PY-6) ⇒ อีเมล expired ≥ 1 · consumer hotel.booking.cancelled (event ST-6) ⇒ อีเมล cancelled ≥ 1 · notifyGuest(expired) ตรง ⇒ Idempotency-Key hotel-mail-expired-<id> · ส่งล้ม (fetch โยน) ⇒ ok:false ไม่ throw", async () => {
    needMail(); ok(ids.py6 && ids.hd1, "ไม่มี PY-6/HD-1");
    const asEvt = (e: Any) => ({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, unitId: e.unitId ?? null, systemId: null });
    const evX = (await eventsOf("hotel.booking.hold_expired", (p) => p.reservationId === ids.py6))[0];
    ok(evX, "ไม่มี event hold_expired");
    ok(mailLines(await captureLogs(() => consumer("hotel.booking.hold_expired")(asEvt(evX)))).length >= 1, "hold_expired ไม่ส่ง");
    const evC = (await eventsOf("hotel.booking.cancelled", (p) => p.reservationId === ids.hd1))[0];
    ok(evC, "ไม่มี event cancelled");
    ok(mailLines(await captureLogs(() => consumer("hotel.booking.cancelled")(asEvt(evC)))).length >= 1, "cancelled ไม่ส่ง");
    const box: Sent[] = [];
    okRes(await notify("expired", ids.py6, "th", box), "expired");
    eq(box[0]?.headers["idempotency-key"], `hotel-mail-expired-${ids.py6}`, "key");
    const boom = await call(() => fnOf(mailL, "notifyGuest", F.mail)("confirmed", ids.py6, "th", { fetch: (async () => { throw new Error("boom"); }) as unknown as typeof fetch }));
    ok(boom?.ok === false && boom.code !== "THROW", `ส่งล้มต้อง ok:false ไม่ throw ${J(boom).slice(0, 120)}`);
  });

  // ═══════════════ X ข้ามร้าน · ซ้ำ · race · rate limit · PII ═══════════════
  console.log("\n── X ความปลอดภัยสาธารณะ ──");
  await st("X-1", "X4 race ห้องสุดท้าย: «ห้องเดียว» W+54 (ว่าง 1) · publicCreateHold 20 ทางพร้อมกัน (คนละ IP · คนละ key) ⇒ สำเร็จ 1 · ที่เหลือ AVAILABILITY_CHANGED/BUSY (ไม่ throw) · แถว active 1 · nights counted 1", async () => {
    needSetup(); needWeb(); needBooking();
    const rs = await Promise.all(Array.from({ length: 20 }, () => hold({ checkIn: W(54), checkOut: W(55), rooms: [roomSpec(RTA.one)] })));
    const oks = rs.filter((r) => okPub(r) && isStrV(r.publicToken));
    const bad = rs.filter((r) => !okPub(r)).map((r) => failCode(r));
    eq([oks.length, bad.every((c) => c === "AVAILABILITY_CHANGED" || c === "BUSY" || c === "STATE_CHANGED")], [1, true], `ok ${oks.length} · codes ${J([...new Set(bad)])}`);
    eq(await prisma.hotelReservation.count({ where: { tenantId: tA, roomTypeId: RTA.one, checkInDate: dbDate(W(54)), status: { in: ["HOLD", "CONFIRMED"] } } }), 1, "แถว active");
    eq(await prisma.hotelBookingNight.count({ where: { tenantId: tA, roomTypeId: RTA.one, date: dbDate(W(54)), counted: true } }), 1, "nights");
  });
  await st("X-2", "X7 token: publicToken ≥ 128 บิต (cuid ≥ 24 ตัว · ไม่ซ้ำ · ไม่เรียงต่อกัน) ทุกการจองเว็บของร้าน A · token ผิด/ร้านอื่น/ไม่มี = คำตอบเดียวกัน (ST-5) · DTO สถานะไม่มี publicToken ของใบอื่น", async () => {
    needSetup(); needWeb();
    const rows = (await prisma.hotelReservation.findMany({ where: { tenantId: tA, source: "WEB" }, select: { publicToken: true } })) as Any[];
    ok(rows.length >= 10, `แถวเว็บ ${rows.length}`);
    const toks = rows.map((r) => String(r.publicToken ?? ""));
    ok(toks.every((t) => t.length >= 24 && /^[a-z0-9_-]+$/i.test(t)), `token สั้น ${J(toks.filter((t) => t.length < 24).slice(0, 3))}`);
    eq(new Set(toks).size, toks.length, "token ซ้ำ");
    const sorted = [...toks].sort();
    ok(!sorted.every((t, i) => i === 0 || t.slice(0, -4) === sorted[i - 1].slice(0, -4)), "token เรียงต่อกัน (เดาได้)");
  });
  await st("X-3", "X8/X10 ไม่มี PII: outbox hotel.web.* ทุกแถว + hotel.booking.* ของร้าน A ไม่มีชื่อ/เบอร์/อีเมล · AuditLog hotel.* ไม่มี PII · path ภาพ/URL ของใบไม่มีอีเมล/เบอร์ (publicToken เท่านั้น) · OpsEvent ของรอบนี้ไม่มีอีเมลแขก · ChatRateBucket ไม่มีอีเมลแขก", async () => {
    needSetup(); needWeb();
    const evs = (await prisma.outboxEvent.findMany({ where: { tenantId: tA, type: { startsWith: "hotel." } } })) as Any[];
    ok(evs.length >= 10, `event ${evs.length}`);
    const badEv = evs.filter((e) => PII_TEXT.test(J(e.payload)) || [...walkKeys(e.payload)].some((k) => PII_KEY.test(k))).map((e) => e.type);
    eq([...new Set(badEv)], [], "event มี PII");
    const au = (await prisma.auditLog.findMany({ where: { tenantId: tA, action: { startsWith: "hotel." } } })) as Any[];
    eq([...new Set(au.filter((a) => PII_TEXT.test(J([a.before, a.after]))).map((a) => a.action))], [], "AuditLog มี PII");
    ok((SQC_VISUAL_SPECS["h.8"] ?? []).every((s) => !/@|\d{9,}/.test(s.path.replace(/TOKEN/g, ""))), "path ภาพมี PII");
    const ops = (await prisma.opsEvent.findMany({ where: { createdAt: { gte: RUN_START } }, select: { message: true, detail: true } }).catch(() => [])) as Any[];
    ok(!ops.some((o) => EMAIL_FULL.test(J(o))), "OpsEvent มีอีเมลแขก");
    const bk = (await prisma.chatRateBucket.findMany({ where: { createdAt: { gte: RUN_START } }, select: { key: true } })) as Any[];
    ok(!bk.some((b) => EMAIL_FULL.test(b.key) || b.key.includes(GUEST.phone)), "คีย์ถัง rate มีอีเมล/เบอร์แขก");
  });
  await st("X-4", "X7 rate limit lookup 10/10 นาที ต่อ IP: IP เดียว 11 ครั้ง (code ผิด) ⇒ 10 ครั้ง «ไม่พบ» · ครั้งที่ 11 RATE_LIMITED · IP อื่น ⇒ ไม่พบ · hotel.web.lookup_failed นับเฉพาะครั้งที่ตรวจจริง (≤ 10 เพิ่ม) · publicStatus ก็มีเพดาน (IP เดียว 200 ครั้ง ⇒ มี RATE_LIMITED อย่างน้อย 1)", async () => {
    needSetup(); needWeb();
    const ip = newIp();
    const n0 = (await eventsOf("hotel.web.lookup_failed")).length;
    const codes: Any[] = [];
    for (let i = 0; i < 11; i++) codes.push(await lookup({ code: `HR-0000-${String(i).padStart(4, "0")}`, email: GUEST.email }, { clientKey: ip }));
    ok(codes.slice(0, 10).every(notFound), `10 แรก ${J(codes.slice(0, 10).map(codeOf))}`);
    ok(limited(codes[10]), `ครั้งที่ 11 ⇒ ${codeOf(codes[10])}`);
    ok(notFound(await lookup({ code: "HR-0000-9999", email: GUEST.email })), "IP อื่น");
    const n1 = (await eventsOf("hotel.web.lookup_failed")).length;
    ok(n1 - n0 >= 10 && n1 - n0 <= 11, `lookup_failed เพิ่ม ${n1 - n0}`);
    const ip2 = newIp();
    let lim = false;
    for (let i = 0; i < 200 && !lim; i++) lim = limited(await status(ids.py5tok, {}, { clientKey: ip2 }));
    ok(lim, "publicStatus 200 ครั้ง IP เดียวไม่ติดเพดาน");
  });

  // ═══════════════ U สถิต ═══════════════
  console.log("\n── U UI/โค้ดสถิต ──");
  await st("U-1", "ไฟล์ของใบครบ (§1/§9): platform/hotel-web.ts · platform/hotel-mail.ts · หน้า store hotel/{page, book, pay/[publicToken], r/[publicToken], my}.tsx + actions.ts + slip/[publicToken]/route.ts · คอมโพเนนต์ src/components/store/hotel/*.tsx (≥ 6 รวม SearchBar/RoomTypeCard/BookingForm/DepositPay/HoldCountdown/StatusCard/LookupForm/CancelDialog) · ฉาก svc-qc-hotel-web-scene.mts · sds §storefront", () => {
    const miss = [F.web, F.mail, F.storeActions, ...PAGES, F.routeSlip, F.scene].filter((f) => !has(f));
    eq(miss, [], "ไฟล์ขาด");
    const comps = compFiles().map((f) => f.split("/").pop() ?? "");
    const need = ["SearchBar", "RoomTypeCard", "BookingForm", "DepositPay", "HoldCountdown", "StatusCard", "LookupForm", "CancelDialog"];
    eq(need.filter((n) => !comps.some((c) => c.toLowerCase().startsWith(n.toLowerCase()))), [], `คอมโพเนนต์ขาด (มี ${comps.join(",")})`);
    ok(/storefront|จองออนไลน์|hotel-web/i.test(read(F.sds)), "sds ไม่มี §storefront");
  });
  await st("U-2", "หน้า public 5 หน้า + route สลิป: ไม่ import prisma/@/lib/core/db ตรง · ไม่ import booking.ts/service.ts/availability.ts ตรง (ผ่าน platform/hotel-web หรือ facade) · อ่าน headers().get(\"host\") + resolveTenantByHost (§9.5 โดเมนร้าน) อย่างน้อยในหน้าแรก/ตัวช่วยร่วม · ใช้ getLocaleFromCookie/makeT · lang=en รองรับ", () => {
    const bad: string[] = [];
    for (const f of [...PAGES, F.routeSlip]) {
      const s = stripComments(read(f));
      if (!s) { bad.push(`${f} ยังไม่มี`); continue; }
      if (/@\/lib\/core\/db["']|@prisma\/client["']/.test(s)) bad.push(`${f}: prisma ตรง`);
      if (/@\/lib\/modules\/hotel\/(booking|service|availability|rates)["']/.test(s)) bad.push(`${f}: import ไฟล์ server ตรง`);
    }
    const all = [...PAGES, F.storeActions, F.web].map((f) => stripComments(read(f))).join("\n");
    if (!/resolveTenantByHost/.test(all) || !/get\(\s*["']host["']\s*\)|x-shark-host/.test(all)) bad.push("ไม่มีเส้นโดเมนร้าน (headers host → resolveTenantByHost)");
    if (!/makeT|getLocaleFromCookie|resolveLocale/.test(all)) bad.push("ไม่ใช้ i18n");
    if (!/lang/.test(all)) bad.push("ไม่รองรับ ?lang=");
    eq(bad, [], "หน้า");
  });
  await st("U-3", "'use client' ไม่ลาก prisma: คอมโพเนนต์ store/hotel ที่มี 'use client' กราฟ import (ค่า) ไม่ถึง @/lib/core/db · @prisma/client · hotel-web/hotel-mail · booking/service/slip-verify/receiver (หยุดที่ขอบ \"use server\")", () => {
    const comps = compFiles();
    ok(comps.length > 0, `ยังไม่มี ${F.compDir}`);
    const bad: string[] = [];
    for (const f of comps) if (/^\s*["']use client["']/m.test(read(f))) bad.push(...clientReach(f));
    eq(bad.slice(0, 6), [], "ลาก server");
    ok(comps.some((f) => /^\s*["']use client["']/m.test(read(f))), "ไม่มีคอมโพเนนต์ client เลย (นับถอยหลัง/คัดลอก QR ต้องเป็น client)");
  });
  await st("U-4", "\"use server\" actions ของ store (§3): export เฉพาะ async function (ไม่ export type/const/class) · มี publicCreateHoldAction · publicAttachSlipAction · publicCancelAction · publicLookupAction · ทุกตัวเรียกผ่าน platform/hotel-web (ไม่เรียก booking.ts/service.ts ตรง) · ไม่มี checkRateLimit ในหน่วยความจำ (ใช้เส้น hotel-web ที่มี checkRateLimitDb) · ส่ง clientKey จาก headers", () => {
    const s = stripComments(read(F.storeActions));
    ok(/^\s*["']use server["']/m.test(s), `ไม่มี "use server" ใน ${F.storeActions}`);
    const bad = [...s.matchAll(/^export\s+(?!async\s+function)(\w+)/gm)].map((m) => m[0]).filter((x) => !/^export\s+async\s+function/.test(x));
    eq(bad, [], "export ที่ไม่ใช่ async function");
    eq(["publicCreateHoldAction", "publicAttachSlipAction", "publicCancelAction", "publicLookupAction"].filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(s)), [], "action ขาด");
    ok(/@\/lib\/platform\/hotel-web["']/.test(s), "ไม่ import platform/hotel-web");
    ok(!/@\/lib\/modules\/hotel\/(booking|service)["']/.test(s), "เรียก booking.ts/service.ts ตรง");
    ok(!/\bcheckRateLimit\s*\(/.test(s), "ยังใช้ checkRateLimit ในหน่วยความจำ");
    ok(/headers\(\)/.test(s) && /clientKey|x-forwarded-for|x-real-ip/.test(s), "ไม่ส่ง clientKey จาก headers");
  });
  await st("U-5", "hotel-web.ts (platform): ใช้ checkRateLimitDb (ไม่มี Map/ checkRateLimit เดิม) · issue/readFormStartToken + FORM_HONEYPOT_FIELD/_sd_hp · coupon.validate ผ่าน facade @/lib/modules/coupon + systemForUnit COUPON · createBooking/cancelBooking/refundPreview/takeBookingDeposit ผ่าน facade @/lib/modules/hotel (ไม่ import booking.ts ตรง) · submitSlip จาก payment/slip-verify + domain HOTEL · promptpayQrFor จาก payment/receiver (ไม่ใช้ PaymentProfile ตรง) · resolvePublicUnit · ไม่ import @/lib/core/db ดิบ · emitOutbox event hotel.web.* 5 ชนิด · ไม่ log token/อีเมล (ไม่มี console.log ที่มี guest/email/token)", () => {
    const s = stripComments(read(F.web));
    ok(s, `ยังไม่มี ${F.web}`);
    const bad: string[] = [];
    if (!/checkRateLimitDb/.test(s)) bad.push("ไม่ใช้ checkRateLimitDb");
    if (/\bcheckRateLimit\s*\(|new\s+Map\s*<[^>]*number/.test(s)) bad.push("rate limit ในหน่วยความจำ");
    if (!/readFormStartToken/.test(s) || !/issueFormStartToken/.test(s)) bad.push("ไม่ใช้ตั๋วเริ่มฟอร์ม");
    if (!/FORM_HONEYPOT_FIELD|_sd_hp|\bhp\b/.test(s)) bad.push("ไม่มี honeypot");
    if (!/@\/lib\/modules\/coupon["']/.test(s) || !/validate\s*\(/.test(s)) bad.push("ไม่เรียก coupon.validate ผ่าน facade");
    if (!/systemForUnit/.test(s) || !/["']COUPON["']/.test(s)) bad.push("ไม่หา systemId จาก systemForUnit COUPON");
    if (!/@\/lib\/modules\/hotel["']/.test(s)) bad.push("ไม่ import facade hotel");
    if (/@\/lib\/modules\/hotel\/(booking|service|availability|rates)["']/.test(s)) bad.push("import ไฟล์ server ของ hotel ตรง");
    if (!/submitSlip/.test(s) || !/["']HOTEL["']/.test(s)) bad.push("ไม่ใช้ submitSlip domain HOTEL");
    if (!/promptpayQrFor/.test(s)) bad.push("ไม่ใช้ promptpayQrFor");
    if (/paymentProfile\./.test(s)) bad.push("อ่าน PaymentProfile ตรง");
    if (!/resolvePublicUnit|resolveHotelUnit/.test(s)) bad.push("ไม่ resolve หน่วยจาก slug");
    if (/@\/lib\/core\/db["']/.test(s) && /\bprisma\.|tenantDb\(/.test(s)) bad.push("ใช้ prisma ดิบ (ผ่าน facade/booking เท่านั้น)");
    for (const ev of ["hotel.web.hold_created", "hotel.web.deposit_paid", "hotel.web.slip_attached", "hotel.web.cancelled_by_guest", "hotel.web.lookup_failed"]) if (!s.includes(ev)) bad.push(`ไม่มี event ${ev}`);
    if (/console\.(log|info)\([^)]*(guest|email|publicToken|token)/i.test(s)) bad.push("log token/อีเมล");
    eq(bad, [], "hotel-web.ts");
  });
  await st("U-6", "dict.ts: คีย์ hotel.web.* ครบคู่ th/en (ชุดเดียวกัน · ≥ 30 คีย์) · ค่า th มีอักษรไทย · ค่า en ไม่มีอักษรไทย · ไม่มีคีย์ว่าง · คีย์เดิม hotel.* ยังครบคู่", () => {
    const D = dictL.mod?.DICT;
    ok(D?.th && D?.en, "โหลด DICT ไม่ได้");
    const th = Object.keys(D.th).filter((k) => k.startsWith("hotel.web.")), en = Object.keys(D.en).filter((k) => k.startsWith("hotel.web."));
    ok(th.length >= 30, `คีย์ hotel.web.* th ${th.length} (ต้อง ≥ 30)`);
    eq([th.filter((k) => !en.includes(k)), en.filter((k) => !th.includes(k))], [[], []], "คู่ไม่ครบ");
    eq(th.filter((k) => !THAI.test(String(D.th[k])) || !String(D.th[k]).trim()), [], "th ไม่ไทย/ว่าง");
    eq(en.filter((k) => THAI.test(String(D.en[k])) || !String(D.en[k]).trim()), [], "en มีไทย/ว่าง");
    const allTh = Object.keys(D.th), allEn = Object.keys(D.en);
    eq(allTh.filter((k) => !allEn.includes(k)).length + allEn.filter((k) => !allTh.includes(k)).length, 0, "parity ทั้งพจนานุกรม");
  });
  await st("U-7", "ค่าตั้งใหม่ (§1 defs/rooms.ts เพิ่มคีย์อย่างเดียว): storefront.enabled bool true · maxRooms int 1–10 เริ่ม 5 · selfCancel bool true · badgeTh/badgeEn text · customDomainUnitId text · heroImages json · description.th/en text · reminderHour time \"10:00\" · ทุกคีย์ unitTypes มี HOTEL · คีย์เดิม (customDomain · notify.channel · bookingMode) ไม่เปลี่ยน", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k}`); return x; };
    const P = "rooms.hotel.storefront.";
    eq([d(`${P}enabled`).defaults._fallback, d(`${P}maxRooms`).defaults._fallback, d(`${P}selfCancel`).defaults._fallback, d(`${P}reminderHour`).defaults._fallback], [true, 5, true, "10:00"], "ค่าเริ่ม");
    ok(d(`${P}maxRooms`).schema.safeParse(10).success && !d(`${P}maxRooms`).schema.safeParse(11).success && !d(`${P}maxRooms`).schema.safeParse(0).success, "maxRooms 1–10");
    for (const k of ["badgeTh", "badgeEn", "customDomainUnitId", "heroImages", "description.th", "description.en"]) d(`${P}${k}`);
    for (const k of ["enabled", "maxRooms", "selfCancel", "badgeTh", "reminderHour"]) { const x = d(`${P}${k}`); ok((x.unitTypes ?? x.scopeUnitTypes ?? ["HOTEL"]).includes("HOTEL"), `${k} ไม่ผูก HOTEL`); }
    eq([d("rooms.hotel.storefront.customDomain").defaults._fallback, d("rooms.hotel.notify.channel").defaults._fallback, d("rooms.hotel.bookingMode").defaults._fallback], [false, "EMAIL", "DEPOSIT_REQUIRED"], "คีย์เดิม");
  });
  await st("U-8", "event ใหม่ 5 ตัว ลง 3 ทะเบียน (กติกาเหล็ก 15): outbox-consumers มี consumer hotel.web.* ทั้ง 5 · AUTOMATION_EVENTS ป้ายไทยครบ · WEBHOOK_EVENTS ครบผ่าน spread (ไม่ประกาศซ้ำใน webhooks/labels.ts) · consumer payment.slip.approved มีสาขา HOTEL (platform/hotel-web หรือ modules/hotel onDepositSlipApproved) · consumer hotel.booking.created/confirmed/cancelled/hold_expired เรียก hotel-mail (lazy import)", () => {
    const EV = ["hotel.web.hold_created", "hotel.web.deposit_paid", "hotel.web.slip_attached", "hotel.web.cancelled_by_guest", "hotel.web.lookup_failed"];
    const cons = consumersL.mod?.consumers;
    ok(cons, `โหลด consumers ไม่ได้ ${consumersL.err}`);
    eq(EV.filter((e) => typeof cons[e] !== "function"), [], "consumer ขาด");
    const auto = (autoL.mod?.AUTOMATION_EVENTS ?? []) as Any[];
    eq(EV.filter((e) => !auto.some((x) => x.value === e && THAI.test(x.label ?? ""))), [], "automation label");
    const wh = (whL.mod?.WEBHOOK_EVENTS ?? []) as Any[];
    eq(EV.filter((e) => wh.filter((x) => x.value === e).length !== 1), [], "webhook");
    ok(!EV.some((e) => stripComments(read(F.whLabels)).includes(`"${e}"`)), "ประกาศซ้ำใน webhooks/labels.ts");
    const src = stripComments(read(F.consumers));
    const slipLine = src.split("\n").filter((l) => /payment\.slip\.approved/.test(l) || /onDepositSlipApproved|hotel.*[Ss]lip/.test(l)).join("\n");
    ok(/onDepositSlipApproved|hotel/.test(slipLine) && /platform\/hotel-web|modules\/hotel/.test(src.slice(src.indexOf("payment.slip.approved") - 400, src.indexOf("payment.slip.approved") + 600)), "consumer payment.slip.approved ไม่มีสาขา HOTEL");
    for (const e of ["hotel.booking.created", "hotel.booking.confirmed", "hotel.booking.cancelled", "hotel.booking.hold_expired"]) { const i = src.indexOf(`"${e}"`); ok(i >= 0 && /hotel-mail/.test(src.slice(i, i + 400)), `${e} ไม่เรียก hotel-mail`); }
  });
  await st("U-9", "booking.ts เพิ่มอย่างเดียว (§9.1 · เทียบฐาน 16dbc492e): diff ไม่มีบรรทัดลบ (ยกเว้นบรรทัดว่าง) · export เดิมครบ · มี locale ใน input + policySnapshot · รับ by \"GUEST\" · facade index.ts ยังมี export ของ H.3/H.5/H.2 · service.ts ทางเดิม P1 ยังอยู่ (resolveHotelUnit · listPublicAvailability · getPublicReservation · promptpayForDeposit · recordDeposit · createReservation)", () => {
    needWeb();
    const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const diff = git(["diff", "-U0", BASE_SHA, "--", F.booking]).split("\n");
    const removed = diff.filter((l) => /^-(?!-)/.test(l) && l.slice(1).trim() !== "");
    eq(removed.slice(0, 5), [], `booking.ts ลบ ${removed.length} บรรทัด`);
    const b = stripComments(read(F.booking));
    ok(/locale/.test(b) && /GUEST/.test(b), "booking.ts ยังไม่มี locale/by GUEST");
    ok(["createBooking", "takeBookingDeposit", "cancelBooking", "refundPreview", "sweepExpiredHolds", "confirmBooking", "listBookings", "getBooking"].every((n) => typeof hotelL.mod?.[n] === "function"), "facade ขาด export เดิม");
    ok(["getFolio", "settleAndCheckOut", "tapeChart", "blockRoom"].every((n) => typeof hotelL.mod?.[n] === "function"), "facade H.5/H.2 หาย");
    ok(["resolveHotelUnit", "listPublicAvailability", "getPublicReservation", "promptpayForDeposit", "recordDeposit", "createReservation"].every((n) => typeof serviceL.mod?.[n] === "function"), "service.ts ทางเดิม P1 หาย");
  });
  await st("U-10", "หน้าเคาน์เตอร์/ข้อความ: หน้า reservations มีลิงก์/แถบ «สลิปรอตรวจ» ไปคิวสลิปกลาง (§9.3 ไม่สร้างคิวใหม่) · hotel-mail.ts เทมเพลต 5 แบบ TH+EN (มีคำ hold/confirmed/reminder/cancelled/expired + sendEmailRich + .ics + ไม่มี idNumber) · minute-jobs/ที่ลงทะเบียน มี hotel-guest-reminder · ไม่เพิ่ม vercel.json · ข้อความ TH ไม่โทษผู้ใช้ (ไม่มี «คุณกรอกผิด»)", () => {
    const rp = stripComments(read(F.reservationsPage));
    ok(rp && /สลิปรอตรวจ/.test(rp), "หน้า reservations ไม่มี «สลิปรอตรวจ»");
    ok(!/slipQueue\s*=|new\s+Map|PendingSlipQueue/.test(rp), "สร้างคิวใหม่ในหน้า");
    const m = stripComments(read(F.mail));
    ok(m, `ยังไม่มี ${F.mail}`);
    eq(["hold", "confirmed", "reminder", "cancelled", "expired"].filter((k) => !new RegExp(`\\b${k}\\b`).test(m)), [], "เทมเพลตขาด");
    ok(/sendEmailRich/.test(m) && /\.ics|text\/calendar/.test(m) && !/idNumber|passport/.test(m), "sendEmailRich/.ics/idNumber");
    const all = [F.minute, F.mail, F.web, "src/lib/platform/cron.ts"].map((f) => stripComments(read(f))).join("\n");
    ok(/hotel-guest-reminder/.test(all) && /registerMinuteJob/.test(all), "ไม่ลงทะเบียน hotel-guest-reminder");
    ok(!/hotel/i.test(read("vercel.json")), "แก้ vercel.json");
    const texts = [F.web, F.mail, F.dict].map((f) => read(f)).join("\n");
    ok(!/คุณกรอกผิด|คุณทำผิด|ผู้ใช้ผิด/.test(texts), "ข้อความโทษผู้ใช้");
  }, "MAJOR");

  // ═══════════════ F ไฟล์ที่แตะ (git · ตอนรับใบ) ═══════════════
  console.log("\n── F ไฟล์ที่แตะ (git) ──");
  const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const OWN_RE = new RegExp(`^(${[F.web, F.mail, F.booking, F.index, F.service, F.hotelActions, F.storeActions, ...PAGES, F.routeSlip, F.reservationsPage, F.dict, F.defs, F.consumers, F.autoLabels, F.whLabels, F.minute, F.scene, F.probe, F.sds, "scripts/qc-svc-h.8.mts", "src/lib/modules/hotel/deposit-intent.ts", "src/lib/modules/hotel/guest-notify.ts", "src/lib/modules/hotel/storefront.ts", "ledger/wo-notes/svc-h.8.md"].map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|${F.compDir.replace(/[/]/g, "\\/")}\\/.+|${STORE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/.+)$`);
  {
    const ch = dirty(["src", "prisma", "public", "scripts", "docs", "vercel.json"]).filter((f) => f !== "scripts/qc-svc-h.8.mts" && f !== F.probe);
    const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.web}`]); return true; } catch { return false; } })();
    if (ch.length === 0 && headHas) skip("F-1", "แตะเฉพาะไฟล์ของใบ (§1/§9)", "H.8 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
    else await st("F-1", "แตะเฉพาะไฟล์ของใบ (§1/§9 · git status ตอนรับใบ): platform/hotel-web+hotel-mail · booking/index/service/actions ของ hotel · หน้า store hotel/** + components/store/hotel/** · reservations/page · dict · defs/rooms · 3 ทะเบียน event · minute-jobs · ฉาก · sds — ไม่แตะอื่น", () => {
      ok(ch.length > 0, `ยังไม่มีงาน (git status ว่าง) — ยังไม่มี ${F.web}`);
      eq(ch.filter((f) => !OWN_RE.test(f)).slice(0, 10), [], "ไฟล์นอกใบ");
    });
  }
  await st("F-2", "ไม่แตะชิ้นต้องห้าม (§1): prisma/** · modules/pos/** · modules/coupon/** · domain/** · core/email.ts · proxy.ts · payment/** · forms/spam-guard.ts · rates.ts/pricing.ts/availability.ts · svc-qc-data.mts · ข้อสอบอื่น · src/lib/core (ยกเว้น settings/defs/rooms.ts) — ตรวจเมื่อมีงาน (hotel-web.ts)", () => {
    ok(has(F.web), `ยังไม่มี ${F.web} — ตรวจตอนรับใบ`);
    const banned = dirty(["prisma", "src/lib/modules/pos", "src/lib/modules/coupon", "src/lib/domain", F.email, F.proxy, "src/lib/payment", F.spam, F.rates, F.pricing, F.avail, "scripts/svc-qc-data.mts", "scripts/qc-svc-h.3.mts", "scripts/qc-svc-h.1.mts", "scripts/qc-svc-h.5.mts", "scripts/qc-hotel-public.mts", "src/lib/core"]).filter((f) => f !== F.defs);
    eq(banned, [], "ไฟล์ต้องห้าม");
  });
  await st("F-3", "เพิ่มอย่างเดียว (เทียบฐาน 16dbc492e): booking.ts (U-9) · index.ts/actions.ts ของ hotel · defs/rooms.ts · 3 ทะเบียน event · service.ts ฟังก์ชันเดิม createReservation/recordDeposit/getPublicReservation เนื้อเท่าฐาน (ห่อได้เฉพาะ listPublicAvailability/promptpayForDeposit ตามใบ §1) · dict.ts ไม่ลบคีย์เดิม", () => {
    ok(has(F.web), `ยังไม่มี ${F.web} — ตรวจตอนรับใบ`);
    const rm = (f: string) => git(["diff", "-U0", BASE_SHA, "--", f]).split("\n").filter((l) => /^-(?!-)/.test(l) && l.slice(1).trim() !== "").length;
    const bad: string[] = [];
    for (const f of [F.booking, F.index, F.hotelActions, F.defs, F.consumers, F.autoLabels, F.whLabels, F.minute]) if (rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
    eq(bad, [], "ลบบรรทัด");
    const fnBody = (src: string, name: string) => { const m = new RegExp(`export async function ${name}\\(([\\s\\S]*?)\\n\\}\\n`).exec(src); return m ? m[0] : ""; };
    const base = (() => { try { return git(["show", `${BASE_SHA}:${F.service}`]); } catch { return ""; } })();
    const cur = read(F.service);
    ok(cur && base, "อ่าน service.ts ไม่ได้");
    for (const n of ["createReservation", "recordDeposit", "getPublicReservation", "checkOut", "refundStay"]) eq(fnBody(cur, n), fnBody(base, n), `${n} เปลี่ยน`);
    const dictBase = (() => { try { return git(["show", `${BASE_SHA}:${F.dict}`]); } catch { return ""; } })();
    const keysOf = (s: string) => new Set([...s.matchAll(/^\s*"([a-z][\w.]*)":/gm)].map((m) => m[1]));
    const lost = [...keysOf(dictBase)].filter((k) => !keysOf(read(F.dict)).has(k));
    eq(lost.slice(0, 5), [], "dict ลบคีย์เดิม");
  }, "MAJOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  delete process.env.SVC_QC_CLOCK;
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await cleanupBuckets();
  await st("Z-1", "หลังล้าง: tenant `svc-h8-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (รวม Hotel*/RoomOccupancy/PosSale/PosDeposit/PaymentSlip/OutboxEvent/AuditLog/ChatChannelConnection/Coupon) · ผู้ใช้ทดสอบ 0 · ถัง rate คีย์ดิบ svc-h8 0 · ไม่มี SVC_QC_CLOCK ค้าง", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: MAIL } } }), 0, "user");
    eq(await prisma.chatRateBucket.count({ where: { key: { contains: "svc-h8-" } } }), 0, "ถัง rate คีย์ดิบ");
    eq(process.env.SVC_QC_CLOCK ?? null, null, "SVC_QC_CLOCK ค้าง");
  }, "MAJOR");
}

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc (svc-qc-hotel-web-scene) ──");
{
  let why = "";
  let unitId = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.hotel.slug, type: "HOTEL" }, select: { id: true } }) : null;
    const nt = u ? await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id } }) : 0;
    if (!t || !u || nt < 3) why = "ร้าน svcqc/หน่วย hotel ยังไม่ seed บนฐานนี้ (scripts/seed-svc-qc.mts)";
    else if (!H0_OK) why = H0_WHY;
    else if (!bookL.mod) why = `ยังไม่มี ${F.booking}`;
    else if (!webL.mod) why = `ยังไม่มี ${F.web}`;
    else if (!has(F.sceneH1)) why = `ยังไม่มี ${F.sceneH1}`;
    else if (!has(F.scene)) why = `ยังไม่มี ${F.scene}`;
    else unitId = u.id;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScript = (rel: string, args: string[] = [], env: Record<string, string> = {}) => spawnSync("pnpm", ["exec", "tsx", rel, ...args], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string): Any => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const MARK = WS.mark;
  const webMails = WS.webBookings.map((b) => b.guest.email);
  const counterRows = () => prisma.hotelReservation.findMany({ where: { tenantId: SQC_TENANT.id, unitId, note: { contains: MARK } } }) as Promise<Any[]>;
  const webRows = () => prisma.hotelReservation.findMany({ where: { tenantId: SQC_TENANT.id, unitId, source: "WEB", guestEmail: { in: webMails } } }) as Promise<Any[]>;
  const overrideRows = () => prisma.hotelRateOverride.findMany({ where: { tenantId: SQC_TENANT.id, unitId, roomTypeId: SQC_HOTEL_TYPES.deluxe.id, date: dbDate(addDays(ANCHOR, WS.override.anchorDayOffset)) } }) as Promise<Any[]>;
  const otherSig = async () => J([await prisma.hotelReservation.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelReservation.count({ where: { tenantId: SQC_TENANT.id, NOT: { OR: [{ note: { contains: MARK } }, { guestEmail: { in: webMails } }] } } }), await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } }), await prisma.hotelRatePlan.count({ where: { tenantId: SQC_TENANT.id, unitId } })]);
  const sceneBase = { tenantSlug: SQC_TENANT.slug, unitSlug: SQC_UNITS.hotel.slug };
  const n1 = `ฉาก ${F.scene}: (ฉาก h.1 ก่อน · --clear h.5/h.3/h.2 ถ้ามี · h.8 --clear) รัน exit 0 · SCENE_SUMMARY {created,updated,removed} + holdToken/confToken/qs (ภาพ) · เคาน์เตอร์ 8 แถว CONFIRMED WALK_IN mark ${MARK} จ่ายมัดจำแล้ว · เว็บ 2 แถว (HOLD มัดจำ 149,000 ยังไม่จ่าย + สลิป? · CONFIRMED มัดจำจ่าย + PaymentSlip HOTEL APPROVED) · override ดีลักซ์วันเสาร์ 169,000 mark h8 · ร้านอื่น/แถวนอก mark ไม่เปลี่ยน`;
  const n2 = `publicSearch(anchor ${ANCHOR} → ${ANCHOR_OUT} · 2 ผู้ใหญ่ · 1 ห้อง) หลังฉาก ⇒ ดีลักซ์ remaining 2 · คืน [149,000, 169,000] · STANDARD 318,000 มัดจำ 149,000 · BREAKFAST 398,000 · NONREF 286,200 · ซูพีเรีย remaining 1 · 198,000 · แฟมิลี remaining 0 soldOutDates [เสาร์] · publicStatus ของ HOLD/CONFIRMED เว็บเปิดได้`;
  const n3 = "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0 · แถว/สถานะเท่าเดิม";
  const n4 = "--clear ลบเฉพาะของฉาก (แถวเคาน์เตอร์+เว็บ 0 · nights/occupancy ไม่ active · override ฉากหาย · สลิปของฉากหาย) · แถวนอก mark/ห้อง/แผน/ร้านอื่น คงเดิม · รันคืน";
  if (why) { for (const [id, n] of [["Q-1", n1], ["Q-2", n2], ["Q-3", n3], ["Q-4", n4]]) skip(id, n, why, "MAJOR"); }
  else {
    await st("Q-1", n1, async () => {
      ok(runScript(F.sceneH1).status === 0, "ฉาก h.1 ล้ม");
      for (const s of [F.sceneH5, F.sceneH3, F.sceneH2]) if (has(s)) runScript(s, ["--clear"]);
      runScript(F.scene, ["--clear"]);
      const o0 = await otherSig();
      const a = runScript(F.scene);
      const sum = summary(`${a.stdout}`);
      ok(a.status === 0 && sum && ["created", "updated", "removed"].every((k) => typeof sum[k] === "number"), `exit=${a.status} ${sum ? fmt(sum) : `${a.stdout}${a.stderr}`.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
      const cr = await counterRows();
      eq([cr.length, cr.every((r) => r.status === "CONFIRMED" && r.source === "WALK_IN" && r.depositPaidAt)], [sum0(WS.counterBookings), true], "แถวเคาน์เตอร์");
      const wr = await webRows();
      const hold = wr.find((r) => r.status === "HOLD"), conf = wr.find((r) => r.status === "CONFIRMED");
      ok(wr.length === 2 && hold && conf, `แถวเว็บ ${J(wr.map((r) => [r.status, r.guestEmail]))}`);
      eq([hold.depositSatang, hold.depositPaidAt, conf.depositSatang, !!conf.depositPaidAt, hold.policySnapshot?.locale, conf.policySnapshot?.locale], [WS.expect.holdDepositSatang, null, WS.expect.confirmedDepositSatang, true, "th", "th"], "มัดจำเว็บ");
      ok(hold.holdExpiresAt && msOf(hold.holdExpiresAt) > Date.now(), "HOLD เว็บหมดอายุแล้ว (ฉากต้องสร้างสด)");
      const slips = (await prisma.paymentSlip.findMany({ where: { tenantId: SQC_TENANT.id, refId: conf.id } })) as Any[];
      ok(slips.length >= 1 && slips.some((s) => s.domain === "HOTEL" && s.refType === "HOTEL_DEPOSIT" && /APPROVED/.test(s.status)), `สลิป CONFIRMED ${J(slips.map((s) => [s.domain, s.status]))}`);
      const ov = await overrideRows();
      ok(ov.length >= 1 && ov.every((o) => o.priceSatang === WS.override.priceSatang) && ov.some((o) => /h8/i.test(String(o.reason ?? ""))), `override ${J(ov.map((o) => [o.priceSatang, o.reason]))}`);
      ok(J(sum).includes(hold.publicToken) && J(sum).includes(conf.publicToken) && /checkIn=/.test(J(sum)), "SCENE_SUMMARY ไม่มี token/qs สำหรับภาพ");
      eq(await otherSig(), o0, "ร้านอื่น/แถวนอก mark เปลี่ยน");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const r = await call(() => PUB("publicSearch")({ ...sceneBase, checkIn: ANCHOR, checkOut: ANCHOR_OUT, adults: 2, children: 0, rooms: 1 }, { clientKey: newIp() }));
      const types = roomTypesOf(r);
      ok(okPub(r) && types, `search ${codeOf(r)}`);
      const T = (id: string) => types!.find((t) => t.id === id);
      const dlx = T(SQC_HOTEL_TYPES.deluxe.id), sup = T(SQC_HOTEL_TYPES.superior.id), fam = T(SQC_HOTEL_TYPES.family.id);
      ok(dlx && sup && fam, "ประเภทไม่ครบ");
      const planBy = (t: Any, code: string) => (t.plans as Any[]).find((p) => String(p.code ?? p.name ?? "").toUpperCase() === code || p.name === SQC_HOTEL_RATES.plans.find((x) => x.code === code)?.name);
      const std = planBy(dlx, "STANDARD"), bf = planBy(dlx, "BREAKFAST"), nr = planBy(dlx, "NONREF");
      ok(std && bf && nr, `แผนดีลักซ์ ${J((dlx.plans as Any[]).map((p) => [p.code, p.name]))}`);
      eq([dlx.remaining, std.nights.map((n: Any) => n.priceSatang), std.totalSatang, std.depositSatang, bf.totalSatang, nr.totalSatang], [WS.expect.deluxe.remaining, [...WS.expect.deluxe.nightPrices], WS.expect.deluxe.standardTotal, WS.expect.deluxe.depositStandard, WS.expect.deluxe.breakfastTotal, WS.expect.deluxe.nonrefTotal], "ดีลักซ์");
      eq([sup.remaining, planBy(sup, "STANDARD").totalSatang], [WS.expect.superior.remaining, WS.expect.superior.standardTotal], "ซูพีเรีย");
      eq([fam.remaining, fam.soldOutDates], [WS.expect.family.remaining, WS.expect.family.soldOutAnchorDayOffsets.map((o) => addDays(ANCHOR, o))], "แฟมิลี");
      ok((dlx.plans as Any[]).length === 3 && !(dlx.plans as Any[]).some((p) => /LINE|COUNTER/.test(String(p.code ?? ""))), "แผนที่เห็นต้อง 3 (WEB)");
      const wr = await webRows();
      for (const row of wr) { const s = await call(() => PUB("publicStatus")({ ...sceneBase, publicToken: row.publicToken }, { clientKey: newIp() })); ok(okPub(s) && J(s).includes(row.code), `status ${row.status} ${codeOf(s)}`); }
    }, "MAJOR");
    await st("Q-3", n3, async () => {
      const s0 = J((await counterRows()).map((r) => [r.id, r.status]).sort()) + J((await webRows()).map((r) => [r.id, r.status]).sort());
      const b = runScript(F.scene);
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      eq(J((await counterRows()).map((r) => [r.id, r.status]).sort()) + J((await webRows()).map((r) => [r.id, r.status]).sort()), s0, "เปลี่ยน");
    }, "MAJOR");
    await st("Q-4", n4, async () => {
      const o0 = await otherSig();
      const idsBefore = [...(await counterRows()), ...(await webRows())].map((r) => r.id);
      const cl = runScript(F.scene, ["--clear"]);
      ok(cl.status === 0, `--clear exit=${cl.status}`);
      eq([(await counterRows()).length, (await webRows()).length, (await overrideRows()).length], [0, 0, 0], "ของฉากค้าง");
      eq(await prisma.hotelBookingNight.count({ where: { reservationId: { in: idsBefore } } }), 0, "nights ค้าง");
      eq(await prisma.roomOccupancy.count({ where: { refType: "HotelReservation", refId: { in: idsBefore }, active: true } }), 0, "occupancy ค้าง");
      eq(await prisma.paymentSlip.count({ where: { tenantId: SQC_TENANT.id, refId: { in: idsBefore } } }), 0, "สลิปค้าง");
      eq(await otherSig(), o0, "ลบเกิน");
      const back = runScript(F.scene);
      ok(back.status === 0 && (await counterRows()).length === sum0(WS.counterBookings) && (await webRows()).length === 2, "รันคืน");
    }, "MAJOR");
  }
}
function sum0(bs: readonly { rooms: number }[]): number { return bs.reduce((a, b) => a + b.rooms, 0); }

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const name = "visual-svc h.8 (owner · หน้าสาธารณะไม่ต้องล็อกอิน) · 6 ใบ (search th/en · pay HOLD · status th/en CONFIRMED · my) × 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน — ผู้คุมตรวจ PARITY ภาพ 16 ก/ข/ค";
  if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก h.1 + h.8 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port> (SVC_VIS_H8_QS/HOLD_TOKEN/CONF_TOKEN จาก SCENE_SUMMARY)", "MAJOR");
  else {
    const bad: string[] = [];
    let env: Record<string, string> = {};
    try {
      const hold = await prisma.hotelReservation.findFirst({ where: { tenantId: SQC_TENANT.id, source: "WEB", status: "HOLD", guestEmail: { in: WS.webBookings.map((b) => b.guest.email) } }, select: { publicToken: true } });
      const conf = await prisma.hotelReservation.findFirst({ where: { tenantId: SQC_TENANT.id, source: "WEB", status: "CONFIRMED", guestEmail: { in: WS.webBookings.map((b) => b.guest.email) } }, select: { publicToken: true } });
      env = { SVC_VIS_H8_QS: `checkIn=${ANCHOR}&checkOut=${ANCHOR_OUT}&adults=2&rooms=1`, ...(hold?.publicToken ? { SVC_VIS_H8_HOLD_TOKEN: hold.publicToken } : {}), ...(conf?.publicToken ? { SVC_VIS_H8_CONF_TOKEN: conf.publicToken } : {}) };
    } catch { /* ไม่มีฉาก */ }
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.8", "--user", "owner", "--base", base], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) bad.push(`exit=${r.status} ${`${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`);
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
  { s: "qc-svc-h.3", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (booking.ts เพิ่มอย่างเดียว)" },
  { s: "qc-svc-h.1", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-h.2", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-h.5", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.8", judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-hotel-public", note: "เส้น P1 เดิมต้องผ่านเท่าเดิม (ORACLE-EDIT ผู้คุมถ้าลายเปลี่ยน)" },
  { s: "qc-svc-b.7", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (จองออนไลน์คิว · rate limit/spam-guard ร่วม)" },
  { s: "qc-svc-b.8", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (สลิปกลาง consumer payment.slip.approved ร่วม)" },
  { s: "qc-svc-smoke" },
  { s: "qc-svc-b.0", judge: judgeNoFail, note: "ทะเบียน event ไม่มี FAIL" },
];
{
  const hasWork = typeof webL.mod?.publicSearch === "function" && typeof webL.mod?.publicCreateHold === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (platform/hotel-web.ts publicSearch/publicCreateHold) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_H8_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-h8-reg-${g.s}.log`;
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
console.log(`\n===== QC SVC H.8 · จองออนไลน์ V2 (storefront โรงแรม) =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`กลุ่ม: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.passed}/${v.total}${v.skipped ? ` (skip ${v.skipped})` : ""}`).join(" · ")}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id), byGroup })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed/ยังไม่มีฉาก · F-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
