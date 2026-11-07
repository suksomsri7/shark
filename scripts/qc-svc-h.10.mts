// QC — SVC H.10 · โครงช่องทาง OTA (channel manager): แม็ปห้อง/แผนราคา (+markup) · ARI ขาออก (outbox channel.ari.dirty → ChannelAriJob → pushAri)
//      · ขาเข้า idempotent (ChannelReservationInbox · externalId+version) → การจอง+occupancy ใน tx เดียว (createBooking internal.channel) · คิว "ต้องจัดห้อง"
//      · gross/commission/net · prepaid · buffer · ตัวต่อ FAKE มีพฤติกรรม
//      oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes → ผู้คุม ORACLE-EDIT)
// สัญญา: ledger/svc-briefs/svc-brief-h.10.md (§0 หลัก · §1 ไฟล์ · §2 มติ · §3 สัญญา · §5 event · §6 ฉาก · §7 เกณฑ์ · **§9 ชนะ §0–§8 เมื่อขัดกัน**)
//        ฟิกซ์เจอร์ scripts/svc-qc-data.mts บล็อก "SVC H.10" (SQC_HOTEL_OTA_SCENE · SQC_VISUAL_SPECS["h.10"]) + SQC_HOTEL_RATES/TYPES/ROOMS
//        ฐานเทียบ "เพิ่มอย่างเดียว" = BASE_SHA (HEAD ของ session/svc ตอนเขียนข้อสอบ · มีฟิกซ์เจอร์ H.10 + ข้อสอบ h.8)
//
// 🔴 สัญญาที่ข้อสอบยึด (ใบ §3 ระบุแค่ชื่อ — รูป input/ผลเป็นสมมติฐานผู้เขียนข้อสอบ · ระบุในรายงานถึงผู้คุม):
//   • facade = «src/lib/modules/hotel/channel/index.ts» (และ re-export ผ่าน hotel/index.ts) · ฟังก์ชันที่มี actor รับ (actor, ctx {tenantId}, input) แบบ hotel/*:
//       listChannelConnections(actor, ctx, {unitId}) → {ok:true, connections:[{id, label, provider, status, …}]}
//       saveRoomMap(actor, ctx, {unitId, connectionId, roomTypeId, externalRoomId})   — externalRoomId ""/null = เลิกแม็ป (ลบแถวหรือ active=false)
//       saveRateMap(actor, ctx, {unitId, connectionId, ratePlanId, externalRateId, markupBp})   — markupBp null ⇒ formula null (ใช้ค่าตั้ง ota.markupBp)
//       saveBuffer(actor, ctx, {unitId, connectionId, roomTypeId, rooms})
//       retryInbound(actor, ctx, {unitId, inboxId}) · rejectInbound(actor, ctx, {unitId, inboxId, reason}) · listNeedsRoom(actor, ctx, {unitId}) → {ok:true, items:[…]}
//       ล้ม = {ok:false, code, reason} ไม่ throw · ข้ามร้าน/หน่วยนอก unitIds ของตัวต่อ = NOT_FOUND · ไม่มีสิทธิ์ hotel.channel.manage = FORBIDDEN (หรือ NOT_FOUND)
//   • ภายใน (ไม่มี actor): channelMappingFor(connectionId) · buildAri(connectionId, from, to) — ช่วง **รวมทั้งสองวัน** (วันนี้ → +6 = 7 วัน) ·
//       คืน AriPayload {byDate} (หรือห่อ {payload|ari: AriPayload}) · pushAriJobs(now, budgetMs) · pullAll(now, budgetMs) ·
//       ingestInbound(connectionId, rows: InboundReservation[]) · applyInbound(inboxId) · fakeEnqueueInbound(connectionId, rows) (เฉพาะ provider FAKE)
//   • pullAll = pullReservations ของตัวต่อ CONNECTED/ERROR ทุกตัว → ingest (unique ฐาน) → applyInbound แถว RECEIVED ของตัวต่อนั้นตามลำดับ version (เส้น retry ของแถวที่ล้มกลางทาง)
//   • outbox channel.ari.dirty payload {unitId, roomTypeIds, from, to} (วันไทย · รวมทั้งสองวัน) · consumer รวมชุดต่อตัวต่อที่ครอบหน่วย ⇒ PENDING 1 แถวต่อช่วงที่ทับกัน
//       (dateFrom = min(from) ตัดที่วันนี้ · dateTo = max(to) ตัดที่วันนี้+ariHorizonDays) · แถวเก่าของช่วงเดียวกันที่ยัง PENDING = SUPERSEDED
//   • IntegrationCallLog.op ของตัวต่อ: ส่ง ARI /push/i · ดึง /pull/i · ตอบรับ /ack/i (ผ่าน callIntegration เสมอ)
//   • การจองจากช่องทาง: ราคาคืน = quoteStay ของแผนที่แม็ป (ราคาโรงแรม ไม่ใช่ราคา markup) · NO_RATE ⇒ gross/คืน · gross/commission/net = ค่าจากช่องทางตรงตัว ·
//       prepaid ⇒ depositSatang 0 · ไม่ prepaid ⇒ มัดจำตามแผน (STANDARD FIRST_NIGHT) แต่ยัง CONFIRMED · ackReservation ล้ม ≠ ย้อนการจอง (แถวคง APPLIED)
//   • inbox.error = รหัสเหตุผล (UNMAPPED_ROOM · UNMAPPED_RATE · STALE · …) · event channel.reservation.* มี inboxId (ข้อสอบจับด้วยสตริง id)
// กลุ่มข้อ: PC ตัวควบคุม (เขียวก่อนมีงาน) · MP แม็ป · AR ARI ขาออก · IN ขาเข้า · MN เงิน · PL ดึง/งานรายนาที · X ข้ามร้าน/ซ้ำ/race/สิทธิ์/PII · U สถิต · F ไฟล์ · Z ล้าง · Q ฉาก svcqc · V ภาพ · G regression
// 🔴 ผลที่ถูกต้องก่อนมีงาน: PC เขียว · MP/AR/IN/MN/PL/X/U/F แดงเหตุผล "ยังไม่มี src/lib/modules/hotel/channel/*" · Q/V/G SKIP · ไม่มี throw ดิบ
// 🔴 ร้านชั่วคราว slug/email `svc-h10-*` ลบใน finally + กวาดค้างตอนเริ่ม (Channel*/TenantIntegration/IntegrationCallLog/RoomOccupancy ไปกับ tenantId) · ตัวดักคิวรี = globalThis.prisma ก่อนโหลด @/lib/core/db
// 🔴 INTEGRATIONS_FAKE=1 ตั้งในโพรเซสนี้ก่อน import (qc-svc.sh ไม่ตั้ง) · INTEGRATIONS_CREDENTIALS_KEY ใช้ของ .env.qc-svc (ไม่มี/สั้น = สุ่มในโพรเซส) · ครอบ fetch (นอกเครื่อง = บล็อก + นับ)
// รัน: cd /root/projects/shark-svc-l1 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.10.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill · ห้าม export CI · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_HOTEL_TYPES, SQC_HOTEL_ROOMS, SQC_HOTEL_RATES, SQC_HOTEL_OTA_SCENE, SQC_VISUAL_SPECS, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-h.10";
const SUITE = "qc-svc-h.10";
const BASE_SHA = "034d4de8a";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H10_NO_REGRESSION === "1";
const SLUG = "svc-h10-";
const MAIL = "svc-h10-";
const CH_DIR = "src/lib/modules/hotel/channel";
const PAGES_DIR = "src/app/app/u/[unitSlug]/hotel/channels";
const F = {
  chTypes: `${CH_DIR}/types.ts`,
  chMapping: `${CH_DIR}/mapping.ts`,
  chAri: `${CH_DIR}/ari.ts`,
  chInbound: `${CH_DIR}/inbound.ts`,
  chIndex: `${CH_DIR}/index.ts`,
  booking: "src/lib/modules/hotel/booking.ts",
  index: "src/lib/modules/hotel/index.ts",
  rates: "src/lib/modules/hotel/rates.ts",
  block: "src/lib/modules/hotel/block.ts",
  pricing: "src/lib/modules/hotel/pricing.ts",
  avail: "src/lib/modules/hotel/availability.ts",
  hotelActions: "src/lib/modules/hotel/actions.ts",
  intTypes: "src/lib/core/integrations/types.ts",
  intFake: "src/lib/core/integrations/providers/fake.ts",
  intRegistry: "src/lib/core/integrations/registry.ts",
  intIndex: "src/lib/core/integrations/index.ts",
  intService: "src/lib/core/integrations/service.ts",
  intHealth: "src/lib/core/integrations/health.ts",
  intPage: "src/app/app/settings/integrations",
  defs: "src/lib/core/settings/defs/rooms.ts",
  perms: "src/lib/core/permissions.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  whLabels: "src/lib/webhooks/labels.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  compDir: "src/components/hotel/channel",
  pageList: `${PAGES_DIR}/page.tsx`,
  pageConn: `${PAGES_DIR}/[connectionId]/page.tsx`,
  pageInbox: `${PAGES_DIR}/inbox/page.tsx`,
  scene: "scripts/svc-qc-hotel-ota-scene.mts",
  sceneH1: "scripts/svc-qc-hotel-rates-scene.mts",
  sceneH3: "scripts/svc-qc-hotel-booking-scene.mts",
  sceneH5: "scripts/svc-qc-hotel-folio-scene.mts",
  sceneH2: "scripts/svc-qc-hotel-tape-scene.mts",
  sceneH8: "scripts/svc-qc-hotel-web-scene.mts",
  probe: "scripts/probe-h10-b.mts",
  sds: "docs/sds/modules/hotel.md",
  reports: "src/lib/modules/hotel/reports.ts",
} as const;
const COMPONENTS = ["ChannelCard", "RoomMapEditor", "RateMapEditor", "BufferEditor", "AriPreview", "InboxList", "NeedsRoomQueue"] as const;
const CH_EVENTS = ["channel.ari.dirty", "channel.ari.pushed", "channel.ari.failed", "channel.reservation.received", "channel.reservation.applied", "channel.reservation.needs_room", "channel.reservation.rejected", "channel.reservation.cancelled"] as const;

loadSvcQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
// ── ศูนย์เชื่อมต่อ: FAKE + กุญแจกล่อง (โพรเซสลูก Q/G ได้ค่าเดียวกัน) ──
process.env.INTEGRATIONS_FAKE = "1";
const KEY_SOURCE = (process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").length >= 32 ? "env QC" : "สุ่มในโพรเซส";
if (KEY_SOURCE !== "env QC") process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const RUN_START = new Date();

// ── ครอบ fetch: ไม่มีเน็ตจริง (FAKE เท่านั้น) ──
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;

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
const codeOf = (r: Any) => (r === null || r === undefined ? "NULL" : r?.ok === true ? "ok" : r?.code ?? r?.error ?? J(r)?.slice(0, 80));
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? r?.message ?? ""}`.trim()); return r; };
/** เรียกฟังก์ชันของใบ — throw ดิบ = {ok:false, code:"THROW"} (ผิดสัญญา "ไม่ throw") */
const call = async (f: () => Promise<Any> | Any): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const notOk = (r: Any) => r === null || r === undefined || (r?.ok === false && r?.code !== "THROW");
const notFound = (r: Any) => r === null || r === undefined || (r?.ok === false && /NOT_FOUND/.test(String(r.code ?? r.error ?? "")));
const denied = (r: Any) => r?.ok === false && /FORBIDDEN|NOT_FOUND|PERMISSION/.test(String(r.code ?? r.error ?? ""));
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const ymdOfDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOfDay(dayNo(ymd) + n);
const dowOf = (ymd: string) => (((dayNo(ymd) + 4) % 7) + 7) % 7;
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const ymdOfDb = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
const datesIncl = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const nightsOf = (ci: string, co: string) => { const out: string[] = []; for (let d = ci; d < co; d = addDays(d, 1)) out.push(d); return out; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const groupOf = (id: string) => id.split("-")[0];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const walkKeys = (v: Any, keys = new Set<string>()): Set<string> => { if (v instanceof Set || v instanceof Date) return keys; if (Array.isArray(v)) v.forEach((x) => walkKeys(x, keys)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walkKeys(x, keys); } return keys; };
const captureLogs = async (fn: () => Promise<unknown>): Promise<string[]> => {
  const lines: string[] = [];
  const o = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const grab = (...a: unknown[]) => { lines.push(a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")); };
  console.log = grab; console.info = grab; console.warn = grab; console.error = grab;
  try { await fn(); } finally { console.log = o.log; console.info = o.info; console.warn = o.warn; console.error = o.error; }
  return lines;
};

// ═══════════════ ตัวอ้างอิง (oracle ของ oracle · pure) ═══════════════
type Cell = { weekday: number; weekend: number };
const WEEKEND = [5, 6];
const refNightPrice = (cell: Cell, date: string) => (WEEKEND.includes(dowOf(date)) ? cell.weekend : cell.weekday);
/** ปัด num/den ตาม rooms.money.rounding (เขียนใหม่อิสระจาก pricing.roundFraction — PC-2 เทียบกัน) */
const refRound = (num: number, den: number, mode: string): number => {
  const n = Math.max(0, Math.trunc(num));
  const unit = mode === "BAHT_DOWN" || mode === "BAHT_HALF_UP" ? 100 * den : den;
  const q = Math.floor(n / unit), r = n - q * unit;
  const up = mode === "BAHT_DOWN" ? 0 : 2 * r >= unit ? 1 : 0;
  return (q + up) * (unit === den ? 1 : 100);
};
/** ราคาส่งช่องทาง = ราคาแผน × (1 + markupBp/10000) ปัดตามโหมด */
const refMarkup = (priceSatang: number, markupBp: number, mode = "SATANG") => refRound(priceSatang * (10_000 + markupBp), 10_000, mode);
/** ค่าคอมฯ ช่องทาง = gross × bp / 10000 ปัดครึ่งขึ้น (แบบ pos/channel-shared channelCommission ไม่มี fixed/VAT) */
const refCommission = (gross: number, bp: number) => Math.floor((gross * bp) / 10_000 + 0.5);

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
const intL = await tryImport("@/lib/core/integrations");
const INT = intL.mod as Any;
const regL = await loadIf(F.intRegistry);
const fakeL = await loadIf(F.intFake);
const hotelL = await loadIf(F.index);
const ratesL = await loadIf(F.rates);
const bookL = await loadIf(F.booking);
const blockL = await loadIf(F.block);
const pricingL = await loadIf(F.pricing);
const chL = await loadIf(F.chIndex);
const chTypesL = await loadIf(F.chTypes);
const chShared = await tryImport("@/lib/modules/pos/channel-shared");
const consumersL = await loadIf(F.consumers);
const autoL = await loadIf(F.autoLabels);
const whL = await loadIf(F.whLabels);
const minuteL = await loadIf(F.minute);
const permL = await tryImport("@/lib/core/permissions");
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `ยังไม่มี ${rel} (${load.err})`);
  return f;
};
const RT = (name: string) => fnOf(ratesL, name, F.rates);
const BK = (name: string) => fnOf(bookL, name, F.booking);
const BLK = (name: string) => fnOf(blockL, name, F.block);
const CH = (name: string) => fnOf(chL, name, F.chIndex);
const needCh = () => { if (!chL.mod) throw new AssertFail(`ยังไม่มี ${CH_DIR}/* (${chL.err})`); };
const sqlCount = (from: number) => SQL_LOG.slice(from).filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET |SAVEPOINT|RELEASE)/i.test(q)).length;
/** AriPayload จากผล buildAri (ตรง หรือห่อ payload/ari) */
const ariOf = (r: Any): Any => (isRec(r?.byDate) ? r : isRec(r?.payload?.byDate) ? r.payload : isRec(r?.ari?.byDate) ? r.ari : null);

// ═══════════════ ฐานข้อมูล: ตาราง H.0 (OTA) · ล้าง ═══════════════
const CH_TABLES = ["ChannelRoomMap", "ChannelRateMap", "ChannelAriJob", "ChannelReservationInbox", "ChannelInventoryBuffer", "TenantIntegration", "IntegrationCallLog"];
let H0_OK = false;
let H0_WHY = "";
try {
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, CH_TABLES);
  const have = new Set(rows.map((r) => r.t));
  const miss = CH_TABLES.filter((t) => !have.has(t));
  const col: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HotelReservation' AND column_name IN ('channelRef','channelConnectionId','grossSatang','commissionSatang','netSatang','prepaidByChannel','source')`);
  const colOk = Number(col[0]?.n ?? 0) === 7;
  H0_OK = miss.length === 0 && colOk && typeof prisma.channelReservationInbox?.findMany === "function";
  H0_WHY = miss.length ? `ยังไม่มีตาราง: ${miss.join(", ")}` : !colOk ? "HotelReservation ยังไม่มีคอลัมน์ OTA ครบ" : "Prisma client ยังไม่มี model ChannelReservationInbox";
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
/** ลบทุกตารางที่มี tenantId (วนหลายรอบตาม FK) — RoomOccupancy/Channel* ก่อน HotelRoom/HotelRoomType/HotelRatePlan ด้วยลำดับลอง-ซ้ำ */
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  for (const t of ["RoomOccupancy", "HotelBookingNight", "ChannelRoomMap", "ChannelRateMap", "ChannelInventoryBuffer", "ChannelAriJob", "ChannelReservationInbox", "IntegrationCallLog", "TenantIntegration"]) {
    try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { /* ลำดับ FK — รอบใหญ่ด้านล่าง */ }
  }
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
  for (const c of [`${base}.ts`, `${base}.tsx`, `${base}.mts`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c)) return c.slice(ROOT.length + 1);
  return null;
};
const SERVER_FILES = /^src\/lib\/modules\/hotel\/(rates|hotel-settings|service|booking|availability|folio|checkout|room-charge|tape|block|index)\.ts$|^src\/lib\/modules\/hotel\/channel\/(mapping|ari|inbound|index)\.ts$|^src\/lib\/core\/integrations\/(service|health|secret-box|index)\.ts$|^src\/lib\/modules\/(rooms|pos|account)\//;
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
const intPageFiles = (): string[] => { try { return readdirSync(join(ROOT, F.intPage)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${F.intPage}/${f}`); } catch { return []; } };
const gitX = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const removedLines = (rel: string): string[] => { try { return gitX(["diff", "-U0", BASE_SHA, "--", rel]).split("\n").filter((l) => /^-(?!--)/.test(l) && l.slice(1).trim() !== ""); } catch { return ["(git diff ล้ม)"]; } };
const addedLines = (rel: string): string[] => { try { return gitX(["diff", "-U0", BASE_SHA, "--", rel]).split("\n").filter((l) => /^\+(?!\+\+)/.test(l) && l.slice(1).trim() !== "").map((l) => l.slice(1)); } catch { return []; } };

console.log(`\n(ฐาน ${process.env.SVC_QC_HOST ?? "?"} · ตัวดักคิวรี ${spyInstalled ? "ติดตั้งแล้ว" : "ไม่ได้ติดตั้ง"} · ตาราง OTA ${H0_OK ? "ครบ" : `ยังไม่ครบ (${H0_WHY})`} · กุญแจตัวต่อ ${KEY_SOURCE} · hotel/channel ${chL.mod ? "โหลดได้" : "ยังไม่มี"})`);

// ═══════════════ ฟิกซ์เจอร์ฉาก → ตัวช่วย ═══════════════
const OS = SQC_HOTEL_OTA_SCENE;
const TYPE_NAME_TO_KEY: Record<string, keyof typeof SQC_HOTEL_TYPES> = { "ซูพีเรีย": "superior", "ดีลักซ์": "deluxe", "แฟมิลี": "family" };
const sceneSellable = (typeName: string) => SQC_HOTEL_ROOMS.filter((r) => r.typeId === SQC_HOTEL_TYPES[TYPE_NAME_TO_KEY[typeName]].id && r.rentMode !== "MONTHLY").length;
const EXT_TO_TYPE: Record<string, string> = Object.fromEntries(OS.roomMaps.map((m) => [m.externalRoomId, m.roomType]));
/** gross ของแถว inbound ฉาก = Σ ราคา STANDARD ฉาก h.1 × (1+markup) ต่อคืน (เฉพาะห้องที่แม็ป) */
const sceneGross = (row: (typeof OS.inbound)[number]): number | null => {
  const tn = EXT_TO_TYPE[row.externalRoomId];
  if (!tn) return null;
  const cell = SQC_HOTEL_RATES.base[tn];
  const ci = sqcAddDays(SQC_TODAY_BKK, row.checkInOffset);
  return sum(nightsOf(ci, sqcAddDays(ci, row.nights)).map((d) => refMarkup(refNightPrice(cell, d), OS.rateMaps[0].markupBp)));
};

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ h.10 สอดคล้องกัน: ตัวต่อ FAKE CHANNEL_MANAGER mode OK หน่วย hotel · แม็ป ดีลักซ์→DLX ซูพีเรีย→SUP (แฟมิลีไม่แม็ป) · STANDARD→STD markup 1,500 bp · buffer ดีลักซ์ 1 · ห้องขาย 7/4/2 · เคาน์เตอร์ซูพีเรีย 4 ห้อง offset 5 = เต็มพอดี · inbound 4 แถว (OTA-1001 v1 APPLIED · OTA-1002 FAM REJECTED UNMAPPED_ROOM · OTA-1003 SUP offset 5 NEEDS_ROOM · OTA-1001 v2 MODIFIED เลื่อน +1 วัน APPLIED) · expect นับตรงแถว · ดีลักซ์ ARI วัน 0 = 7−1 · STANDARD เห็น OTA · ARI 7 วัน DLX/SUP · ภาพ h.10 3 ใบ", () => {
    eq([OS.mark, OS.unit, OS.connector.kind, OS.connector.provider, OS.connector.fields.mode], ["SvcQcScene:h10", "hotel", "CHANNEL_MANAGER", "FAKE", "OK"], "ค่าคงที่/ตัวต่อ");
    eq(OS.roomMaps.map((m) => [m.roomType, m.externalRoomId]), [["ดีลักซ์", "DLX"], ["ซูพีเรีย", "SUP"]], "แม็ปห้อง");
    eq(OS.rateMaps.map((r) => [r.plan, r.externalRateId, r.markupBp]), [["standard", "STD", 1_500]], "แม็ปแผน");
    eq(OS.buffers.map((b) => [b.roomType, b.rooms]), [["ดีลักซ์", 1]], "buffer");
    eq([sceneSellable("ดีลักซ์"), sceneSellable("ซูพีเรีย"), sceneSellable("แฟมิลี")], [7, 4, 2], "ห้องขายรายคืน");
    const cnt = OS.counterBookings[0];
    eq([cnt.roomType, cnt.rooms, cnt.checkInOffset, cnt.nights, cnt.rooms === sceneSellable("ซูพีเรีย"), OS.expect.superiorFullOffset], ["ซูพีเรีย", 4, 5, 1, true, 5], "เคาน์เตอร์ทำซูพีเรียเต็ม");
    eq(OS.inbound.map((r) => [r.externalId, r.version, r.status, r.externalRoomId, r.expect]), [["OTA-1001", 1, "NEW", "DLX", "APPLIED"], ["OTA-1002", 1, "NEW", "FAM", "REJECTED"], ["OTA-1003", 1, "NEW", "SUP", "NEEDS_ROOM"], ["OTA-1001", 2, "MODIFIED", "DLX", "APPLIED"]], "inbound");
    const [v1, rej, need, v2] = OS.inbound;
    eq([v2.checkInOffset - v1.checkInOffset, v2.nights, v1.prepaid, v2.prepaid, need.prepaid, need.checkInOffset, "reject" in rej ? rej.reject : null, EXT_TO_TYPE[rej.externalRoomId] ?? null], [1, v1.nights, true, true, false, OS.expect.superiorFullOffset, "UNMAPPED_ROOM", null], "แถว inbound");
    ok(OS.inbound.every((r) => r.commissionBp === 1_500 && /@example\.com$/.test(r.guest.email) && r.guest.name), "commission/guest");
    const by = (s: string) => OS.inbound.filter((r) => r.expect === s).length;
    eq([OS.expect.inboxApplied, OS.expect.inboxRejected, OS.expect.inboxNeedsRoom, OS.expect.reservationsFromOta, OS.expect.activeOtaReservations], [by("APPLIED"), by("REJECTED"), by("NEEDS_ROOM"), by("APPLIED"), 1], "expect");
    eq(OS.expect.deluxeAriAvailableOffset0, sceneSellable("ดีลักซ์") - OS.buffers[0].rooms, "ดีลักซ์ ARI วัน 0");
    eq([OS.ari.days, OS.ari.expectJobs, [...OS.ari.mappedTypes]], [7, 1, ["DLX", "SUP"]], "ARI");
    eq([OS.settings["rooms.hotel.ota.enabled"], OS.settings["rooms.hotel.ota.roomScope"], OS.settings["rooms.hotel.ota.ariHorizonDays"]], [true, "SELECTED", 365], "settings");
    ok(SQC_HOTEL_RATES.plans.find((p) => p.key === "standard")!.visibility.includes("OTA"), "STANDARD ต้องเห็น OTA");
    const specs = SQC_VISUAL_SPECS["h.10"] ?? [];
    eq(specs.map((s) => s.name), ["hotel-channels", "hotel-channels-inbox", "integrations-ota"], "ภาพ h.10");
    ok(specs[0].path.endsWith(`/hotel/${"channels"}`) && specs[1].path.endsWith("/channels/inbox") && specs[2].path === "/app/settings/integrations", "path ภาพ");
  });
  await st("PC-2", "oracle ของ oracle: refRound ตรง pricing.roundFraction (SATANG/BAHT_HALF_UP/BAHT_DOWN) · markup 15%: 129,000→148,350 (ครึ่งขึ้นบาท 148,400 · ตัด 148,300) · 149,000→171,350/171,400/171,300 · 99,000→113,850/113,900/113,800 · −10% 129,000→116,100 · ค่าคอมฯ 15% ตรง channelCommission (ปัดครึ่งขึ้น) · gross ฉาก OTA-1001 v1 (2 คืน ดีลักซ์) = Σ ×1.15 · dow ไม่ใช้ getDay", () => {
    const rf = pricingL.mod?.roundFraction;
    ok(typeof rf === "function", `โหลด pricing.ts ไม่ได้ ${pricingL.err}`);
    for (const [n, d] of [[1_483_500_000, 10_000], [1_713_500_000, 10_000], [1_138_500_000, 10_000], [1_234_567, 100], [5, 2], [7, 2]] as const) for (const m of ["SATANG", "BAHT_HALF_UP", "BAHT_DOWN"]) eq(refRound(n, d, m), rf(n, d, m), `refRound(${n},${d},${m})`);
    eq([refMarkup(129_000, 1_500), refMarkup(129_000, 1_500, "BAHT_HALF_UP"), refMarkup(129_000, 1_500, "BAHT_DOWN")], [148_350, 148_400, 148_300], "ดีลักซ์ธรรมดา");
    eq([refMarkup(149_000, 1_500), refMarkup(149_000, 1_500, "BAHT_HALF_UP"), refMarkup(149_000, 1_500, "BAHT_DOWN")], [171_350, 171_400, 171_300], "ดีลักซ์สุดสัปดาห์");
    eq([refMarkup(99_000, 1_500), refMarkup(99_000, 1_500, "BAHT_HALF_UP"), refMarkup(99_000, 1_500, "BAHT_DOWN"), refMarkup(129_000, -1_000), refMarkup(129_000, 2_000)], [113_850, 113_900, 113_800, 116_100, 154_800], "ซูพีเรีย/ลด/2000");
    const cc = chShared.mod?.channelCommission;
    ok(typeof cc === "function", `channel-shared ${chShared.err}`);
    for (const g of [296_700, 342_700, 113_850, 1, 3, 7, 1_000_001]) eq(refCommission(g, 1_500), cc(g, { commissionBp: 1_500, commissionFixedSatang: 0, commissionVatBp: 0 }).commissionSatang, `commission ${g}`);
    const v1 = OS.inbound[0];
    const ci = sqcAddDays(SQC_TODAY_BKK, v1.checkInOffset);
    eq(sceneGross(v1), sum(nightsOf(ci, sqcAddDays(ci, 2)).map((d) => refMarkup(refNightPrice({ weekday: 129_000, weekend: 149_000 }, d), 1_500))), "gross ฉาก");
    eq([dowOf("2026-11-06"), dowOf("2026-11-07"), dowOf("2026-11-08"), datesIncl("2026-11-07", "2026-11-13").length, nightsOf("2026-11-07", "2026-11-09")], [5, 6, 0, 7, ["2026-11-07", "2026-11-08"]], "วัน");
  });
  await st("PC-3", "ฐาน QC (SELECT 1 · host SVC) · ตัวดักคิวรีก่อน db · ตาราง Channel* 5 + TenantIntegration/IntegrationCallLog · คอลัมน์ OTA 6 ตัวบน HotelReservation · unique inbox (connectionId, externalId, version) · unique map (connectionId, roomTypeId)/(connectionId, externalRoomId)/(connectionId, ratePlanId) · CHECK สถานะ job/inbox + buffer ≥ 0", async () => {
    const r: { one: number }[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
    eq(r[0]?.one, 1, "SELECT 1");
    ok(/^(ep-mute-scene|ep-royal-lake|ep-weathered-mode|ep-royal-bar|ep-square-heart|ep-late-union)/.test(process.env.SVC_QC_HOST ?? ""), `host ${process.env.SVC_QC_HOST} ไม่ใช่ฐาน QC ของ SVC`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · lanes-l5-l6): ฐานเลน l5/l6 ใหม่ (แตกจาก wo-svc-qc)
    ok(spyInstalled, "ตัวดักคิวรีไม่ได้ติดตั้ง (AR นับคิวรีไม่ได้)");
    ok(H0_OK, H0_WHY);
    const idx: { t: string; def: string }[] = await prisma.$queryRawUnsafe(`SELECT tablename AS t, indexdef AS def FROM pg_indexes WHERE schemaname = current_schema() AND tablename LIKE 'Channel%'`);
    const uniq = (t: string, cols: string[]) => idx.some((i) => i.t === t && /UNIQUE/i.test(i.def) && new RegExp(`\\(${cols.map((c) => `"?${c}"?`).join(",\\s*")}\\)`).test(i.def));
    eq([uniq("ChannelReservationInbox", ["connectionId", "externalId", "version"]), uniq("ChannelRoomMap", ["connectionId", "roomTypeId"]), uniq("ChannelRoomMap", ["connectionId", "externalRoomId"]), uniq("ChannelRateMap", ["connectionId", "ratePlanId"]), uniq("ChannelInventoryBuffer", ["connectionId", "roomTypeId"])], [true, true, true, true, true], "unique");
    const cons: { n: string; def: string }[] = await prisma.$queryRawUnsafe(`SELECT conname AS n, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype = 'c' AND conrelid::regclass::text IN ('"ChannelAriJob"','"ChannelReservationInbox"','"ChannelInventoryBuffer"')`);
    const chk = (re: RegExp) => cons.some((c) => re.test(`${c.n} ${c.def}`));
    eq([chk(/ChannelAriJob_status_check.*SUPERSEDED/), chk(/ChannelReservationInbox_status_check.*NEEDS_ROOM/), chk(/ChannelInventoryBuffer_rooms_check.*>=\s*0/)], [true, true, true], `CHECK ${J(cons.map((c) => c.n))}`);
  });
  await st("PC-4", "ของที่ยืนบน: ศูนย์เชื่อมต่อ facade (save/test/disable/list/getIntegration/callIntegration) + providerDef(CHANNEL_MANAGER, FAKE) เปิด (INTEGRATIONS_FAKE=1) · hotel facade createBooking/cancelBooking/hotelAvailability/loadPricingContext/quoteStay/roundFraction/blockRoom/releaseBlock/saveRates/setOverride/clearOverride · consumers hotel.booking.* · registerMinuteJob · channelCommission · defs ota.enabled/roomScope/buffer/markupBp (เริ่ม 1,500)/onConflict (QUEUE_REASSIGN_NOTIFY) · rooms.money.rounding เริ่ม SATANG · rooms.hotel.minNights · สิทธิ์ hotel.channel.manage มีป้ายไทย", () => {
    ok(INT, `โหลด @/lib/core/integrations ไม่ได้ ${intL.err}`);
    eq(["saveIntegration", "testIntegration", "disableIntegration", "listIntegrations", "getIntegration", "callIntegration", "providerDef"].filter((n) => typeof INT[n] !== "function"), [], "integrations facade");
    ok(INT.providerDef("CHANNEL_MANAGER", "FAKE"), "FAKE ไม่เปิดสำหรับ CHANNEL_MANAGER (INTEGRATIONS_FAKE=1)");
    ok(hotelL.mod, hotelL.err);
    eq(["createBooking", "cancelBooking", "loadPricingContext", "quoteStay", "roundFraction", "blockRoom", "releaseBlock", "saveRates", "setOverride", "clearOverride", "listRatePlans", "saveRatePlan"].filter((n) => typeof hotelL.mod[n] !== "function"), [], "hotel facade");
    ok(typeof hotelL.mod.hotelAvailability?.get === "function", "hotelAvailability");
    const cons = consumersL.mod?.consumers;
    ok(cons && ["hotel.booking.created", "hotel.booking.cancelled", "hotel.booking.changed"].every((e) => typeof cons[e] === "function") && typeof consumersL.mod?.drainAll === "function", `consumers ${consumersL.err}`);
    ok(typeof minuteL.mod?.registerMinuteJob === "function", `minute-jobs ${minuteL.err}`);
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k}`); return x; };
    eq([d("rooms.hotel.ota.enabled").defaults._fallback, d("rooms.hotel.ota.roomScope").defaults._fallback, d("rooms.hotel.ota.buffer").defaults._fallback, d("rooms.hotel.ota.markupBp").defaults._fallback, d("rooms.hotel.ota.onConflict").defaults._fallback, d("rooms.money.rounding").defaults._fallback], [false, "ALL_NIGHTLY", 0, 1_500, "QUEUE_REASSIGN_NOTIFY", "SATANG"], "defs");
    d("rooms.hotel.minNights");
    ok(/"hotel\.channel\.manage":\s*"[^"]*[฀-๿]/.test(read(F.perms)) && permL.mod, "สิทธิ์ hotel.channel.manage");
  });
  await st("PC-5", "ร้าน svcqc บนฐาน (seed แล้ว): หน่วย hotel · ห้องขายรายคืน ดีลักซ์ 7 · ซูพีเรีย 4 · แฟมิลี 2 (B205 รายเดือนไม่นับ) — ฐานของฉาก Q", async () => {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { slug: true } });
    if (!t) throw new AssertFail("ร้าน svcqc ยังไม่ seed บนฐานนี้ — ผู้คุมรัน seed ก่อน (Q/V ต้องใช้)");
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, active: true }, select: { roomTypeId: true, rentMode: true } });
    const n = (id: string) => rooms.filter((r: Any) => r.roomTypeId === id && r.rentMode !== "MONTHLY").length;
    eq([n(SQC_HOTEL_TYPES.deluxe.id), n(SQC_HOTEL_TYPES.superior.id), n(SQC_HOTEL_TYPES.family.id)], [7, 4, 2], "ห้องบนฐาน");
  }, "MAJOR");

  // ═══════════════ ร้านชั่วคราว svc-h10-* ═══════════════
  console.log("\n── ตั้งร้านชั่วคราว svc-h10-* ──");
  const mkTenant = async (name: string, slug: string) => { const r = await prisma.tenant.create({ data: { name, slug } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC H10 โรงแรม A", `${SLUG}a-${RUN}`);
  const tB = await mkTenant("QC H10 โรงแรม B", `${SLUG}b-${RUN}`);
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "HOTEL", name, slug: `h10-${uid()}` } })).id as string;
  const UH = await mkUnit(tA, "บ้านริมน้ำ โฮเทล H10");
  const UH2 = await mkUnit(tA, "สาขาสอง H10");
  const UHB = await mkUnit(tB, "โรงแรมร้าน B H10");
  type TypeSpec = { name: string; base: number; cap: number; baseOcc: number; maxOcc: number | null };
  const mkType = async (tenantId: string, unitId: string, s: TypeSpec) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: s.name, rentMode: "NIGHTLY", baseRateSatang: s.base, capacity: s.cap, baseOccupancy: s.baseOcc, maxOccupancy: s.maxOcc, extraBedAllowed: false, extraBedPriceSatang: 0 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string) => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, hkStatus: "CLEAN" } })).id as string;
  const SPEC: Record<string, TypeSpec> = {
    dlx: { name: "ดีลักซ์", base: 129_000, cap: 3, baseOcc: 2, maxOcc: 3 },
    sup: { name: "ซูพีเรีย", base: 99_000, cap: 2, baseOcc: 2, maxOcc: 2 },
    fam: { name: "แฟมิลี", base: 189_000, cap: 5, baseOcc: 4, maxOcc: 5 },
    one: { name: "ห้องเดี่ยว", base: 100_000, cap: 2, baseOcc: 2, maxOcc: 2 },
    ste: { name: "สวีท (ยังไม่ตั้งราคา)", base: 250_000, cap: 2, baseOcc: 2, maxOcc: 2 },
  };
  /** ราคา STANDARD ของร้านชั่วคราว (ste ไม่มีแถวราคา ⇒ NO_RATE) */
  const CELL: Record<string, Cell> = { dlx: { weekday: 129_000, weekend: 149_000 }, sup: { weekday: 99_000, weekend: 99_000 }, fam: { weekday: 189_000, weekend: 219_000 }, one: { weekday: 100_000, weekend: 120_000 } };
  const RTA: Record<string, string> = {};
  for (const [k, s] of Object.entries(SPEC)) RTA[k] = await mkType(tA, UH, s);
  const ROOM: Record<string, string> = {};
  for (const [n, k] of [["DLX1", "dlx"], ["DLX2", "dlx"], ["DLX3", "dlx"], ["SUP1", "sup"], ["SUP2", "sup"], ["FAM1", "fam"], ["ONE1", "one"], ["STE1", "ste"]] as const) ROOM[n] = await mkRoom(tA, UH, n, RTA[k]);
  const RT2 = await mkType(tA, UH2, SPEC.dlx);
  await mkRoom(tA, UH2, "S2-1", RT2);
  const RTB = await mkType(tB, UHB, SPEC.dlx);
  await mkRoom(tB, UHB, "B-1", RTB);
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-h10-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@shark.local`, name: `QC h10 ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MANAGER = await mkMember("manager", tA, "MANAGER", [UH]);
  const FRONT = await mkMember("front", tA, "STAFF", [UH], { "hotel.booking.manage": true, "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.rates.read": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const T0 = bkkToday();
  const W = (n: number) => addDays(T0, n);
  const ids: Record<string, string> = {};
  let SETUP_OK = false;
  let SETUP_WHY = "";
  const rowsFor = (unitTypes: Record<string, string>, cells: Record<string, Cell>) => Object.entries(cells).filter(([k]) => unitTypes[k]).map(([k, c]) => ({ roomTypeId: unitTypes[k], seasonId: null, priceWeekdaySatang: c.weekday, priceWeekendSatang: c.weekend, priceHolidaySatang: null }));
  try {
    okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH }), "list");
    ids.std = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "STANDARD" } }))!.id;
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, id: ids.std, code: "STANDARD", name: "ราคามาตรฐาน", visibility: ["WEB", "LINE", "COUNTER", "OTA"] }), "STANDARD visibility");
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows: rowsFor(RTA, CELL) }), "saveRates STANDARD");
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "NONREF", name: "จ่ายก่อน ไม่คืนเงิน", depositKind: "FULL", depositValue: 0, visibility: ["WEB", "OTA"] }), "NONREF");
    ids.nr = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "NONREF" } }))!.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.nr, rows: rowsFor(RTA, { dlx: { weekday: 116_100, weekend: 134_100 } }) }), "saveRates NONREF");
    okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH2 }), "list UH2");
    ids.std2 = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH2, code: "STANDARD" } }))!.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH2, ratePlanId: ids.std2, rows: rowsFor({ dlx: RT2 }, { dlx: CELL.dlx }) }), "saveRates UH2");
    okRes(await RT("listRatePlans")(OWNER_B, ctxB, { unitId: UHB }), "list B");
    ids.stdB = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tB, unitId: UHB, code: "STANDARD" } }))!.id;
    okRes(await RT("saveRates")(OWNER_B, ctxB, { unitId: UHB, ratePlanId: ids.stdB, rows: rowsFor({ dlx: RTB }, { dlx: CELL.dlx }) }), "saveRates B");
    SETUP_OK = true;
  } catch (e) { SETUP_WHY = `ตั้งร้านชั่วคราวไม่สำเร็จ (H.1): ${errMsg(e)}`; console.log(`  ❌ ${SETUP_WHY}`); }
  const needSetup = () => ok(SETUP_OK, SETUP_WHY);
  const setUnit = async (key: string, value: unknown, unitId = UH) => okRes(await SET.setSettings(OWNER, ctxA, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  const resetUnit = async (key: string, unitId = UH) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: unitId }); } catch { /* ไม่มีค่า */ } };
  // ── ตัวต่อ FAKE (ศูนย์เชื่อมต่อ R0.5 · ทางจริง save → test ⇒ CONNECTED) ──
  const CONN: Record<string, string> = {};
  let CONN_OK = false;
  let CONN_WHY = "";
  const saveConn = async (ctx: { tenantId: string }, actor: Actor, label: string, unitIds: string[]) => {
    const r = await INT.saveIntegration(ctx, actor, { create: true, kind: "CHANNEL_MANAGER", provider: "FAKE", label, unitIds, fields: { apiKey: `svc-h10-key-${RUN}`, accountId: `svc-h10-acc-${label}`, mode: "OK" } });
    okRes(r, `saveIntegration ${label}`);
    okRes(await INT.testIntegration(ctx, actor, { id: r.integration.id }), `testIntegration ${label}`);
    return r.integration.id as string;
  };
  const setMode = async (key: "A" | "A2" | "B", mode: string) => {
    const [ctx, actor] = key === "B" ? [ctxB, OWNER_B] : [ctxA, OWNER];
    okRes(await INT.saveIntegration(ctx, actor, { id: CONN[key], kind: "CHANNEL_MANAGER", provider: "FAKE", fields: { mode } }), `โหมด ${key} ${mode}`);
  };
  try {
    CONN.A = await saveConn(ctxA, OWNER, "OTA A", [UH]);
    CONN.A2 = await saveConn(ctxA, OWNER, "OTA A2", [UH2]);
    CONN.B = await saveConn(ctxB, OWNER_B, "OTA B", [UHB]);
    CONN_OK = true;
  } catch (e) { CONN_WHY = `ตั้งตัวต่อ FAKE ไม่สำเร็จ: ${errMsg(e)}`; console.log(`  ❌ ${CONN_WHY}`); }
  const needConn = () => ok(CONN_OK, CONN_WHY);
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const rvsOfRef = (ref: string, connectionId = CONN.A) => prisma.hotelReservation.findMany({ where: { tenantId: tA, channelRef: ref, channelConnectionId: connectionId }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const nightsOfRv = (id: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: id }, orderBy: { date: "asc" } }) as Promise<Any[]>;
  const occOfRv = (id: string, active?: boolean) => prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId: id, ...(active === undefined ? {} : { active }) } }) as Promise<Any[]>;
  const folioOf = (id: string) => prisma.hotelFolio.findUnique({ where: { reservationId: id } }) as Promise<Any>;
  const eventsOf = async (type: string, pred?: (p: Any, e: Any) => boolean, tid = tA) => ((await prisma.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => !pred || pred(e.payload ?? {}, e));
  const auditsOf = (action: string, tid = tA) => prisma.auditLog.findMany({ where: { tenantId: tid, action }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const inboxOf = (ext: string, ver: number, connectionId = CONN.A) => prisma.channelReservationInbox.findFirst({ where: { connectionId, externalId: ext, version: ver } }) as Promise<Any>;
  const inboxCount = (connectionId = CONN.A) => prisma.channelReservationInbox.count({ where: { connectionId } }) as Promise<number>;
  const jobsOf = (connectionId = CONN.A, status?: string) => prisma.channelAriJob.findMany({ where: { connectionId, ...(status ? { status } : {}) }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const callLogs = async (connectionId: string, re: RegExp) => ((await prisma.integrationCallLog.findMany({ where: { integrationId: connectionId }, orderBy: { at: "asc" } })) as Any[]).filter((l) => re.test(String(l.op)));
  const consumer = (type: string) => { const c = consumersL.mod?.consumers?.[type]; ok(typeof c === "function", `ไม่มี consumer ${type}`); return c as (e: Any) => Promise<void>; };
  const asEvt = (e: Any) => ({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, unitId: e.unitId ?? null, systemId: e.systemId ?? null });
  /** event channel.ari.dirty สังเคราะห์ ส่งเข้า consumer ตรง (ไม่ระบายคิวทั้งฐาน) */
  const dirty = async (unitId: string, roomTypeIds: string[], from: string, to: string, tenantId = tA) => consumer("channel.ari.dirty")({ id: `svc-h10-evt-${uid()}`, tenantId, type: "channel.ari.dirty", payload: { unitId, roomTypeIds, from, to }, unitId, systemId: null });
  const counterBook = async (roomTypeKey: string, checkIn: string, checkOut: string, rooms = 1) => okRes(await BK("createBooking")(OWNER, ctxA, { unitId: UH, rooms: Array.from({ length: rooms }, () => ({ roomTypeId: RTA[roomTypeKey], adults: 2, children: 0 })), ratePlanId: ids.std, source: "PHONE", guest: { name: "เคาน์เตอร์ h10", phone: "0890000010" }, checkIn, checkOut }), "createBooking เคาน์เตอร์");
  const avail = async (from: string, toExcl: string) => { const r = await hotelL.mod.hotelAvailability.get(ctxA, { unitId: UH, from, to: toExcl }); ok(r?.ok, `hotelAvailability ${codeOf(r)}`); return r.byDate as Record<string, Record<string, { available: number }>>; };
  /** แถว inbound ตามสัญญา InboundReservation · ราคา gross = Σ ราคาช่องทาง (STANDARD × 1.15) ต่อคืน · commission 15% */
  const GUEST_MAIL = (ext: string) => `svc-h10-guest-${RUN}-${ext.toLowerCase()}@qc.invalid`;
  const PII_TEXT = new RegExp(`svc-h10-guest-${RUN}|0891234510|สมชาย ทดสอบเอช`);
  type InOpt = { ext: string; ver?: number; status?: "NEW" | "MODIFIED" | "CANCELLED"; room: string; rate?: string | null; ci: string; nights: number; prepaid?: boolean; gross?: number; priceKey?: string; adults?: number };
  const inb = (o: InOpt): Any => {
    const co = addDays(o.ci, o.nights);
    const gross = o.gross ?? (o.priceKey && CELL[o.priceKey] ? sum(nightsOf(o.ci, co).map((d) => refMarkup(refNightPrice(CELL[o.priceKey!], d), 1_500))) : 300_000);
    const commission = refCommission(gross, 1_500);
    const guest = { name: `สมชาย ทดสอบเอช ${o.ext}`, phone: "0891234510", email: GUEST_MAIL(o.ext) };
    const row: Any = { externalId: o.ext, version: o.ver ?? 1, status: o.status ?? "NEW", externalRoomId: o.room, checkIn: o.ci, checkOut: co, rooms: 1, adults: o.adults ?? 2, children: 0, guest, grossSatang: gross, commissionSatang: commission, netSatang: gross - commission, prepaid: o.prepaid ?? true };
    if (o.rate !== null) row.externalRateId = o.rate ?? "STD";
    row.raw = { source: "FAKE-OTA", bookingRef: o.ext, rev: o.ver ?? 1, guest: { ...guest }, price: { gross, commission } };
    return row;
  };
  const ingest = (rows: Any[], connectionId = CONN.A) => call(() => CH("ingestInbound")(connectionId, rows));
  const apply = async (ext: string, ver: number, connectionId = CONN.A) => { const row = await inboxOf(ext, ver, connectionId); ok(row, `ไม่มีแถว inbox ${ext} v${ver}`); return { row, r: await call(() => CH("applyInbound")(row.id)) }; };
  const noPii = (v: unknown, what: string) => { ok(!PII_TEXT.test(J(v)), `${what}: มี PII (ชื่อ/เบอร์/อีเมลแขก)`); ok(![...walkKeys(v)].some((k) => /guest(Name|Phone|Email)|^phone$|^email$|^raw$/i.test(k)), `${what}: คีย์ PII/raw`); };
  const waitFor = async (cond: () => Promise<boolean>, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await sleep(150); } return cond(); };

  await st("PC-6", "ตัวต่อ FAKE ของร้านชั่วคราว (ทางจริง R0.5): saveIntegration CHANNEL_MANAGER/FAKE ×3 (A หน่วย UH · A2 หน่วย UH2 · B ร้าน B) → testIntegration ⇒ CONNECTED · getIntegration({tenantId A, unitId UH}) = ตัวต่อ A · (UH2) = A2 · callIntegration pullReservations ⇒ ok (array) + IntegrationCallLog 1 แถว · ร้าน B มองไม่เห็นตัวต่อ A", async () => {
    needConn();
    const rows = (await prisma.tenantIntegration.findMany({ where: { id: { in: Object.values(CONN) } } })) as Any[];
    eq(rows.map((r) => [r.kind, r.provider, r.status]).sort(), [["CHANNEL_MANAGER", "FAKE", "CONNECTED"], ["CHANNEL_MANAGER", "FAKE", "CONNECTED"], ["CHANNEL_MANAGER", "FAKE", "CONNECTED"]], "แถว");
    const h = await INT.getIntegration({ tenantId: tA, unitId: UH }, "CHANNEL_MANAGER");
    const h2 = await INT.getIntegration({ tenantId: tA, unitId: UH2 }, "CHANNEL_MANAGER");
    eq([h?.integrationId, h2?.integrationId, (await INT.getIntegration({ tenantId: tB, unitId: UH }, "CHANNEL_MANAGER"))?.integrationId ?? null], [CONN.A, CONN.A2, null], "getIntegration");
    const n0 = (await callLogs(CONN.A, /pull/i)).length;
    const r = await INT.callIntegration(h, "pullReservations", (a: Any, ctl: Any) => a.pullReservations(new Date(Date.now() - DAY), ctl));
    ok(r?.ok === true && Array.isArray(r.value), `callIntegration ${J(r)}`);
    eq((await callLogs(CONN.A, /pull/i)).length, n0 + 1, "call log");
  });
  await st("PC-7", "ฐานบังคับเอง (ร้านชั่วคราว): inbox (connectionId, externalId, version) ซ้ำ ⇒ P2002 · สถานะ inbox/job แปลก ⇒ ถูก CHECK ปฏิเสธ · buffer −1 ⇒ ถูก CHECK ปฏิเสธ (ลบแถวทดลองทิ้ง)", async () => {
    needConn();
    const base = { tenantId: tA, unitId: UH, connectionId: CONN.A, externalId: `PC7-${RUN}`, version: 1, raw: {} };
    const a = await prisma.channelReservationInbox.create({ data: base });
    const errOf = async (f: () => Promise<unknown>) => { try { await f(); return "ไม่ล้ม"; } catch (e) { return String((e as Any)?.code ?? errMsg(e)); } };
    try {
      eq(await errOf(() => prisma.channelReservationInbox.create({ data: base })), "P2002", "inbox ซ้ำ");
      ok((await errOf(() => prisma.channelReservationInbox.create({ data: { ...base, version: 2, status: "BOGUS" } }))) !== "ไม่ล้ม", "inbox status BOGUS ผ่าน CHECK");
      ok((await errOf(() => prisma.channelAriJob.create({ data: { tenantId: tA, unitId: UH, connectionId: CONN.A, dateFrom: new Date(`${T0}T00:00:00Z`), dateTo: new Date(`${T0}T00:00:00Z`), payloadHash: "x", status: "BOGUS" } }))) !== "ไม่ล้ม", "job status BOGUS ผ่าน CHECK");
      ok((await errOf(() => prisma.channelInventoryBuffer.create({ data: { tenantId: tA, unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, rooms: -1 } }))) !== "ไม่ล้ม", "buffer −1 ผ่าน CHECK");
    } finally {
      await prisma.channelReservationInbox.deleteMany({ where: { tenantId: tA, externalId: `PC7-${RUN}` } });
      await prisma.channelAriJob.deleteMany({ where: { tenantId: tA, payloadHash: "x" } });
      await prisma.channelInventoryBuffer.deleteMany({ where: { tenantId: tA } });
    }
    void a;
  });
  await st("PC-8", "ร้านชั่วคราวใช้ได้ (H.1/H.3): quoteStay STANDARD ดีลักซ์ 2 คืน = ตาราง ref · สวีท ⇒ NO_RATE · createBooking เคาน์เตอร์ ดีลักซ์ ⇒ CONFIRMED (แล้วยกเลิก) · hotelAvailability ดีลักซ์ 3 · ห้องเดี่ยว 1", async () => {
    needSetup();
    const pc = await hotelL.mod.loadPricingContext(ctxA, UH, { from: W(1), to: W(40) });
    ok(pc, "loadPricingContext");
    const lim = { minNights: null, maxNights: null, closedToArrival: false, maxAdvanceBookingDays: 365 };
    const q = hotelL.mod.quoteStay({ ...pc, today: T0 }, { roomTypeId: RTA.dlx, ratePlanId: ids.std, checkIn: W(2), checkOut: W(4), limits: lim });
    eq([q.ok, q.nights?.map((n: Any) => n.priceSatang)], [true, nightsOf(W(2), W(4)).map((d) => refNightPrice(CELL.dlx, d))], "quote ดีลักซ์");
    const q2 = hotelL.mod.quoteStay({ ...pc, today: T0 }, { roomTypeId: RTA.ste, ratePlanId: ids.std, checkIn: W(2), checkOut: W(3), limits: lim });
    eq([q2.ok, q2.error], [false, "NO_RATE"], "สวีท NO_RATE");
    const b = await counterBook("dlx", W(90), W(91));
    eq(b.reservations[0].status, "CONFIRMED", "เคาน์เตอร์");
    okRes(await BK("cancelBooking")(OWNER, ctxA, { unitId: UH, reservationId: b.reservations[0].id, reason: "ทดสอบ PC-8" }), "ยกเลิก");
    const av = await avail(W(1), W(2));
    eq([av[W(1)][RTA.dlx].available, av[W(1)][RTA.one].available, av[W(1)][RTA.ste].available], [3, 1, 1], "availability");
  });

  // ═══════════════ MP แม็ป ═══════════════
  console.log("\n── MP แม็ปห้อง/แผนราคา/buffer ──");
  const saveRoomMap = (input: Any, actor: Actor = OWNER, ctx: Any = ctxA) => call(() => CH("saveRoomMap")(actor, ctx, input));
  const saveRateMap = (input: Any, actor: Actor = OWNER, ctx: Any = ctxA) => call(() => CH("saveRateMap")(actor, ctx, input));
  const saveBuffer = (input: Any, actor: Actor = OWNER, ctx: Any = ctxA) => call(() => CH("saveBuffer")(actor, ctx, input));
  const roomMapsOf = (connectionId = CONN.A) => prisma.channelRoomMap.findMany({ where: { connectionId }, orderBy: { externalRoomId: "asc" } }) as Promise<Any[]>;
  const activeMap = (rows: Any[]) => rows.filter((r) => r.active !== false).map((r) => [r.roomTypeId, r.externalRoomId]);
  await st("MP-1", "saveRoomMap (owner): ดีลักซ์→DLX ⇒ ok · แถว ChannelRoomMap {tenantId A, unitId UH, connectionId A, roomTypeId, externalRoomId, active true} · บันทึกซ้ำค่าเดิม ⇒ ยัง 1 แถว · เปลี่ยนเป็น DLX-X แล้วกลับ DLX ⇒ แถวเดิม (id เดิม) · ซูพีเรีย→SUP · ห้องเดี่ยว→ONE · สวีท→STE", async () => {
    needSetup(); needConn(); needCh();
    okRes(await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, externalRoomId: "DLX" }), "DLX");
    const r1 = await roomMapsOf();
    eq(r1.map((r) => [r.tenantId, r.unitId, r.connectionId, r.roomTypeId, r.externalRoomId, r.active]), [[tA, UH, CONN.A, RTA.dlx, "DLX", true]], "แถว");
    okRes(await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, externalRoomId: "DLX" }), "ซ้ำ");
    okRes(await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, externalRoomId: "DLX-X" }), "เปลี่ยน");
    okRes(await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, externalRoomId: "DLX" }), "กลับ");
    const r2 = await roomMapsOf();
    eq([r2.length, r2[0].id, r2[0].externalRoomId], [1, r1[0].id, "DLX"], "แถวเดิม");
    for (const [k, ext] of [["sup", "SUP"], ["one", "ONE"], ["ste", "STE"]] as const) okRes(await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA[k], externalRoomId: ext }), ext);
    eq(activeMap(await roomMapsOf()).sort(), [[RTA.dlx, "DLX"], [RTA.one, "ONE"], [RTA.ste, "STE"], [RTA.sup, "SUP"]].sort(), "แม็ปครบ");
  });
  await st("MP-2", "unique ต่อตัวต่อ: แฟมิลี→DLX (ชนดีลักซ์ในตัวต่อ A) ⇒ ok:false ไม่ throw ไม่แตะแถวเดิม · ตัวต่อ A2 ใช้ DLX ซ้ำกับ A ได้ (คนละตัวต่อ · หน่วย UH2)", async () => {
    needSetup(); needConn(); needCh();
    const r = await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.fam, externalRoomId: "DLX" });
    ok(notOk(r), `ชน ⇒ ${codeOf(r)}`);
    eq(activeMap(await roomMapsOf()).filter(([, e]) => e === "DLX"), [[RTA.dlx, "DLX"]], "แถวเดิม");
    okRes(await saveRoomMap({ unitId: UH2, connectionId: CONN.A2, roomTypeId: RT2, externalRoomId: "DLX" }), "A2 DLX");
  });
  await st("MP-3", "X1 แม็ป: ประเภทห้องของหน่วยอื่น (UH2) ใต้ unitId UH ⇒ NOT_FOUND · unitId UH2 กับตัวต่อ A (unitIds ไม่ครอบ) ⇒ NOT_FOUND · ตัวต่อของร้าน B ⇒ NOT_FOUND · ตัวต่อมั่ว ⇒ NOT_FOUND · แผนราคาของหน่วยอื่น/ร้าน B ⇒ NOT_FOUND · owner ร้าน B ใช้ตัวต่อ A ⇒ NOT_FOUND · ไม่มีแถวใหม่", async () => {
    needSetup(); needConn(); needCh();
    const n0 = await prisma.channelRoomMap.count({ where: { tenantId: { in: [tA, tB] } } });
    const m0 = await prisma.channelRateMap.count({ where: { tenantId: { in: [tA, tB] } } });
    const cases: [string, Any][] = [
      ["ประเภทหน่วยอื่น", await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RT2, externalRoomId: "X1A" })],
      ["หน่วยนอกตัวต่อ", await saveRoomMap({ unitId: UH2, connectionId: CONN.A, roomTypeId: RT2, externalRoomId: "X1B" })],
      ["ตัวต่อร้าน B", await saveRoomMap({ unitId: UH, connectionId: CONN.B, roomTypeId: RTA.fam, externalRoomId: "X1C" })],
      ["ตัวต่อมั่ว", await saveRoomMap({ unitId: UH, connectionId: `svc-h10-none-${RUN}`, roomTypeId: RTA.fam, externalRoomId: "X1D" })],
      ["แผนหน่วยอื่น", await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.std2, externalRateId: "X1E", markupBp: 1_500 })],
      ["แผนร้าน B", await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.stdB, externalRateId: "X1F", markupBp: 1_500 })],
      ["ร้าน B ใช้ตัวต่อ A", await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.fam, externalRoomId: "X1G" }, OWNER_B, ctxB)],
      ["buffer ประเภทหน่วยอื่น", await saveBuffer({ unitId: UH, connectionId: CONN.A, roomTypeId: RT2, rooms: 1 })],
    ];
    eq(cases.filter(([, r]) => !notFound(r)).map(([n, r]) => `${n}=${codeOf(r)}`), [], "ต้อง NOT_FOUND");
    eq([await prisma.channelRoomMap.count({ where: { tenantId: { in: [tA, tB] } } }), await prisma.channelRateMap.count({ where: { tenantId: { in: [tA, tB] } } })], [n0, m0], "ไม่มีแถวใหม่");
  });
  await st("MP-4", "saveRateMap: STANDARD→STD markupBp 1,500 ⇒ formula {markupBp:1500} · markupBp null ⇒ formula null · กลับ 1,500 · unique (ตัวต่อ, แผน) = แถวเดียว · NONREF→NRF markup 1,000", async () => {
    needSetup(); needConn(); needCh();
    const rows = () => prisma.channelRateMap.findMany({ where: { connectionId: CONN.A }, orderBy: { externalRateId: "asc" } }) as Promise<Any[]>;
    okRes(await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.std, externalRateId: "STD", markupBp: 1_500 }), "STD");
    eq((await rows()).map((r) => [r.ratePlanId, r.externalRateId, r.formula?.markupBp ?? null, r.unitId, r.tenantId]), [[ids.std, "STD", 1_500, UH, tA]], "STD");
    okRes(await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.std, externalRateId: "STD", markupBp: null }), "null");
    const r2 = await rows();
    eq([r2.length, r2[0].formula ?? null], [1, null], "formula null");
    okRes(await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.std, externalRateId: "STD", markupBp: 1_500 }), "กลับ");
    okRes(await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.nr, externalRateId: "NRF", markupBp: 1_000 }), "NRF");
    eq((await rows()).map((r) => [r.externalRateId, r.formula?.markupBp]), [["NRF", 1_000], ["STD", 1_500]], "สองแผน");
  });
  await st("MP-5", "saveBuffer: ดีลักซ์ 1 ⇒ แถว rooms 1 · บันทึกซ้ำ 2 แล้ว 1 ⇒ แถวเดียว · rooms −1 ⇒ ok:false (ไม่ throw) แถวคง 1", async () => {
    needSetup(); needConn(); needCh();
    const rows = () => prisma.channelInventoryBuffer.findMany({ where: { connectionId: CONN.A } }) as Promise<Any[]>;
    okRes(await saveBuffer({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, rooms: 2 }), "2");
    okRes(await saveBuffer({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, rooms: 1 }), "1");
    eq((await rows()).map((r) => [r.roomTypeId, r.rooms, r.unitId]), [[RTA.dlx, 1, UH]], "แถว");
    ok(notOk(await saveBuffer({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, rooms: -1 })), "−1 ผ่าน");
    eq((await rows()).map((r) => r.rooms), [1], "คงเดิม");
  });
  await st("MP-6", "listChannelConnections(owner, {unitId UH}) ⇒ ตัวต่อ A เท่านั้น (ไม่มี A2/B) · (UH2) ⇒ A2 · DTO ไม่มีค่าลับ (apiKey/secretBox/secretNames/accountId ของคีย์) · channelMappingFor(A) มี DLX/SUP/ONE/STE + STD/NRF + buffer ดีลักซ์ 1", async () => {
    needSetup(); needConn(); needCh();
    const r = okRes(await call(() => CH("listChannelConnections")(OWNER, ctxA, { unitId: UH })), "list");
    const ids1 = (r.connections ?? r.items ?? []).map((c: Any) => c.id);
    eq(ids1, [CONN.A], "UH");
    const r2 = okRes(await call(() => CH("listChannelConnections")(OWNER, ctxA, { unitId: UH2 })), "list UH2");
    eq((r2.connections ?? r2.items ?? []).map((c: Any) => c.id), [CONN.A2], "UH2");
    ok(!/apiKey|secretBox|secretNames|svc-h10-key-/.test(J(r)), "DTO มีค่าลับ");
    const m = await call(() => CH("channelMappingFor")(CONN.A));
    const s = J(m);
    ok(m && m.code !== "THROW" && ["DLX", "SUP", "ONE", "STE", "STD", "NRF"].every((x) => s.includes(`"${x}"`)) && s.includes(RTA.dlx), `channelMappingFor ${s.slice(0, 200)}`);
  });
  await st("MP-7", "X9 สิทธิ์ hotel.channel.manage: หน้าเคาน์เตอร์ (STAFF ไม่มีสิทธิ์) saveRoomMap/saveRateMap/saveBuffer/listChannelConnections ⇒ FORBIDDEN/NOT_FOUND ไม่แตะแถว · ผู้จัดการ (MANAGER หน่วย UH) ⇒ ok · ผู้จัดการใช้กับ UH2 (นอกหน่วย) ⇒ NOT_FOUND", async () => {
    needSetup(); needConn(); needCh();
    const before = J(await roomMapsOf());
    const rs: [string, Any][] = [
      ["roomMap", await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.fam, externalRoomId: "FAMX" }, FRONT)],
      ["rateMap", await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.std, externalRateId: "STDX", markupBp: 0 }, FRONT)],
      ["buffer", await saveBuffer({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, rooms: 3 }, FRONT)],
      ["list", await call(() => CH("listChannelConnections")(FRONT, ctxA, { unitId: UH }))],
    ];
    eq(rs.filter(([, r]) => !denied(r)).map(([n, r]) => `${n}=${codeOf(r)}`), [], "หน้าเคาน์เตอร์");
    eq(J(await roomMapsOf()), before, "แถวเปลี่ยน");
    eq((await prisma.channelInventoryBuffer.findFirst({ where: { connectionId: CONN.A, roomTypeId: RTA.dlx } }))?.rooms, 1, "buffer เปลี่ยน");
    okRes(await saveBuffer({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, rooms: 1 }, MANAGER), "ผู้จัดการ");
    ok(notFound(await saveRoomMap({ unitId: UH2, connectionId: CONN.A2, roomTypeId: RT2, externalRoomId: "DLX" }, MANAGER)), "ผู้จัดการนอกหน่วย");
  });
  // ── ตั้งแม็ปมาตรฐานของ AR/IN (idempotent · ไม่นับเป็นข้อ) ──
  let MAPS_OK = false;
  let MAPS_WHY = "ยังไม่มี hotel/channel/*";
  if (chL.mod && SETUP_OK && CONN_OK) {
    try {
      for (const [k, ext] of [["dlx", "DLX"], ["sup", "SUP"], ["one", "ONE"], ["ste", "STE"]] as const) okRes(await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA[k], externalRoomId: ext }), `map ${ext}`);
      okRes(await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.std, externalRateId: "STD", markupBp: 1_500 }), "map STD");
      okRes(await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.nr, externalRateId: "NRF", markupBp: 1_000 }), "map NRF");
      okRes(await saveBuffer({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.dlx, rooms: 1 }), "buffer DLX");
      okRes(await saveRoomMap({ unitId: UH2, connectionId: CONN.A2, roomTypeId: RT2, externalRoomId: "DLX" }), "map A2");
      okRes(await saveRateMap({ unitId: UH2, connectionId: CONN.A2, ratePlanId: ids.std2, externalRateId: "STD", markupBp: 1_500 }), "map A2 STD");
      okRes(await saveRoomMap({ unitId: UHB, connectionId: CONN.B, roomTypeId: RTB, externalRoomId: "DLX" }, OWNER_B, ctxB), "map B");
      okRes(await saveRateMap({ unitId: UHB, connectionId: CONN.B, ratePlanId: ids.stdB, externalRateId: "STD", markupBp: 1_500 }, OWNER_B, ctxB), "map B STD");
      MAPS_OK = true;
    } catch (e) { MAPS_WHY = `ตั้งแม็ปมาตรฐานไม่สำเร็จ: ${errMsg(e)}`; console.log(`  ❌ ${MAPS_WHY}`); }
  }
  const needMaps = () => { needSetup(); needConn(); needCh(); ok(MAPS_OK, MAPS_WHY); };

  // ═══════════════ AR ARI ขาออก ═══════════════
  console.log("\n── AR ARI ขาออก ──");
  const buildAri = async (from: string, to: string, connectionId = CONN.A) => { const r = await call(() => CH("buildAri")(connectionId, from, to)); const a = ariOf(r); ok(a, `buildAri ${codeOf(r)} ${r?.reason ?? ""}`); return a; };
  const push = (now = new Date()) => call(() => CH("pushAriJobs")(now, 20_000));
  /** เทียบ ARI กับความจริง: available = max(0, availability − buffer) · price = STANDARD × (1+markup) ปัดตามโหมด · stopSell = available 0 หรือไม่มีราคา */
  const checkAri = async (a: Any, from: string, to: string, o: { markupBp?: number; mode?: string; buffers?: Record<string, number> } = {}) => {
    const markupBp = o.markupBp ?? 1_500, mode = o.mode ?? "SATANG", buffers = o.buffers ?? { dlx: 1 };
    const av = await avail(from, addDays(to, 1));
    const days = datesIncl(from, to);
    eq(Object.keys(a.byDate).sort(), days, "วันของ payload");
    const bad: string[] = [];
    for (const d of days) {
      const day = a.byDate[d];
      const keys = Object.keys(day ?? {}).sort();
      if (J(keys) !== J(["DLX", "ONE", "STE", "SUP"])) { bad.push(`${d} ห้อง ${J(keys)}`); continue; }
      for (const [ext, k] of [["DLX", "dlx"], ["SUP", "sup"], ["ONE", "one"]] as const) {
        const cell = day[ext];
        const expAv = Math.max(0, av[d][RTA[k]].available - (buffers[k] ?? 0));
        const expPrice = refMarkup(refNightPrice(CELL[k], d), markupBp, mode);
        const std = cell?.rates?.STD;
        if (cell?.available !== expAv) bad.push(`${d} ${ext} available ${cell?.available}≠${expAv}`);
        if (std?.priceSatang !== expPrice) bad.push(`${d} ${ext} price ${std?.priceSatang}≠${expPrice}`);
        if (cell?.stopSell !== (expAv === 0)) bad.push(`${d} ${ext} stopSell ${cell?.stopSell}`);
        if (!(std && (std.minNights === null || Number.isInteger(std.minNights)) && typeof std.closedToArrival === "boolean")) bad.push(`${d} ${ext} minNights/closedToArrival`);
      }
      if (day.STE?.stopSell !== true) bad.push(`${d} STE (NO_RATE) stopSell ${day.STE?.stopSell}`);
    }
    eq(bad.slice(0, 6), [], `ARI ผิด ${bad.length} ช่อง`);
  };
  await st("AR-1", "buildAri(ตัวต่อ A, วันนี้, +6) = 7 วัน (รวมทั้งสองวัน) · ทุกวันมีเฉพาะห้องที่แม็ป DLX/SUP/ONE/STE (แฟมิลีไม่แม็ป = ไม่ส่ง) · available = max(0, hotelAvailability − buffer) (ดีลักซ์ −1 · เคาน์เตอร์จองดีลักซ์ W+2→4 1 ห้อง) · rates.STD.priceSatang = STANDARD × 1.15 ปัด SATANG · minNights/closedToArrival มี · stopSell = available 0 · สวีท (NO_RATE) stopSell true · ไม่มีชื่อ/เบอร์แขก", async () => {
    needMaps();
    await counterBook("dlx", W(2), W(4));
    const a = await buildAri(T0, W(6));
    await checkAri(a, T0, W(6));
    ok(!/เคาน์เตอร์ h10|0890000010/.test(J(a)), "payload มีข้อมูลแขก");
  });
  await st("AR-2", "ปัดตาม rooms.money.rounding ของหน่วย: BAHT_HALF_UP ⇒ 148,400/171,400/113,900 · BAHT_DOWN ⇒ 148,300/171,300/113,800 · คืนค่า ⇒ SATANG", async () => {
    needMaps();
    for (const mode of ["BAHT_HALF_UP", "BAHT_DOWN"]) {
      await setUnit("rooms.money.rounding", mode);
      try { await checkAri(await buildAri(T0, W(6)), T0, W(6), { mode }); } finally { await resetUnit("rooms.money.rounding"); }
    }
    await checkAri(await buildAri(T0, W(2)), T0, W(2));
  });
  await st("AR-3", "markup: ChannelRateMap.formula.markupBp ชนะค่าตั้ง (2,000 ⇒ ×1.20) · formula null ⇒ ค่าตั้ง rooms.hotel.ota.markupBp (เริ่ม 1,500) · คืน 1,500", async () => {
    needMaps();
    okRes(await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.std, externalRateId: "STD", markupBp: 2_000 }), "2000");
    try {
      await checkAri(await buildAri(T0, W(3)), T0, W(3), { markupBp: 2_000 });
      okRes(await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.std, externalRateId: "STD", markupBp: null }), "null");
      await checkAri(await buildAri(T0, W(3)), T0, W(3), { markupBp: 1_500 });
    } finally { await saveRateMap({ unitId: UH, connectionId: CONN.A, ratePlanId: ids.std, externalRateId: "STD", markupBp: 1_500 }); }
  });
  await st("AR-4", "buffer: ChannelInventoryBuffer ชนะ — ซูพีเรีย 99 ⇒ SUP available 0 + stopSell ทุกวัน (ไม่ติดลบ) · ซูพีเรีย 0 ⇒ เท่า availability · ไม่แตะ availability จริง (hotelAvailability เท่าเดิม)", async () => {
    needMaps();
    const av0 = J(await avail(T0, W(4)));
    okRes(await saveBuffer({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.sup, rooms: 99 }), "99");
    try {
      await checkAri(await buildAri(T0, W(3)), T0, W(3), { buffers: { dlx: 1, sup: 99 } });
      eq(J(await avail(T0, W(4))), av0, "availability จริงเปลี่ยน");
    } finally { okRes(await saveBuffer({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.sup, rooms: 0 }), "0"); }
    await checkAri(await buildAri(T0, W(3)), T0, W(3), { buffers: { dlx: 1, sup: 0 } });
  });
  await st("AR-5", "เลิกแม็ป: ห้องเดี่ยว externalRoomId \"\" ⇒ ONE หายจาก payload (แถวลบหรือ active false) · แม็ปคืน ⇒ กลับมา · roomScope SELECTED (หน่วย) ⇒ ห้องที่ไม่แม็ปยังไม่ส่ง", async () => {
    needMaps();
    okRes(await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.one, externalRoomId: "" }), "เลิก ONE");
    try {
      const a = await buildAri(T0, W(1));
      eq(Object.keys(a.byDate[T0]).sort(), ["DLX", "STE", "SUP"], "ไม่มี ONE");
      eq(activeMap(await roomMapsOf()).filter(([t]) => t === RTA.one), [], "แถว ONE ยัง active");
    } finally { okRes(await saveRoomMap({ unitId: UH, connectionId: CONN.A, roomTypeId: RTA.one, externalRoomId: "ONE" }), "คืน ONE"); }
    await setUnit("rooms.hotel.ota.roomScope", "SELECTED");
    try { eq(Object.keys((await buildAri(T0, W(1))).byDate[T0]).sort(), ["DLX", "ONE", "STE", "SUP"], "SELECTED"); }
    finally { await resetUnit("rooms.hotel.ota.roomScope"); }
  }, "MAJOR");
  await st("AR-6", "consumer channel.ari.dirty รวมชุด: 3 event ทับกัน (W0→3 · W2→6 · ซ้ำ W2→6 สองรอบ = X4 ส่งซ้ำ) ⇒ ตัวต่อ A มี PENDING 1 แถว dateFrom W0 dateTo W6 (ตัวเก่าที่ถูกแทน = SUPERSEDED) · unitId UH · ตัวต่อ A2/B ไม่มีงานจาก event ของ UH · event ของ UH2 ⇒ งานของ A2 เท่านั้น", async () => {
    needMaps();
    await push(); await push(); // ล้างงานค้างจากการตั้งแม็ป
    const a2n = (await jobsOf(CONN.A2)).length, bn = (await jobsOf(CONN.B)).length;
    await dirty(UH, [RTA.dlx], T0, W(3));
    await dirty(UH, [RTA.sup], W(2), W(6));
    await dirty(UH, [RTA.sup], W(2), W(6));
    const pend = await jobsOf(CONN.A, "PENDING");
    eq(pend.map((j) => [ymdOfDb(j.dateFrom), ymdOfDb(j.dateTo), j.unitId, j.tenantId]), [[T0, W(6), UH, tA]], "PENDING");
    eq([(await jobsOf(CONN.A2)).length, (await jobsOf(CONN.B)).length], [a2n, bn], "ตัวต่ออื่น");
    await dirty(UH2, [RT2], W(1), W(2));
    eq((await jobsOf(CONN.A2, "PENDING")).map((j) => [ymdOfDb(j.dateFrom), ymdOfDb(j.dateTo)]), [[W(1), W(2)]], "A2");
    eq((await jobsOf(CONN.A, "PENDING")).length, 1, "A ยัง 1");
  });
  await st("AR-7", "pushAriJobs(now) ⇒ งาน A: SENT + sentAt + attempts ≤ 1 + payloadHash = ariHash(buildAri ช่วงเดียวกัน) · IntegrationCallLog op ส่ง ARI ok +1 · outbox channel.ari.pushed {connectionId, jobId, days = 7} ไม่มี PII · งาน A2 ก็ SENT", async () => {
    needMaps();
    const job = (await jobsOf(CONN.A, "PENDING"))[0];
    ok(job, "ไม่มีงาน PENDING (AR-6)");
    const n0 = (await callLogs(CONN.A, /push/i)).length;
    const r = await push();
    ok(r?.code !== "THROW", `pushAriJobs ${r?.reason}`);
    const j = await prisma.channelAriJob.findUnique({ where: { id: job.id } });
    eq([j.status, !!j.sentAt, j.attempts <= 1], ["SENT", true, true], "งาน");
    const hash = chTypesL.mod?.ariHash ?? chL.mod?.ariHash;
    ok(typeof hash === "function", "ไม่มี ariHash");
    eq(j.payloadHash, hash(await buildAri(ymdOfDb(j.dateFrom)!, ymdOfDb(j.dateTo)!)), "payloadHash");
    const logs = (await callLogs(CONN.A, /push/i)).slice(n0);
    eq(logs.map((l) => l.ok), [true], "call log");
    const ev = await eventsOf("channel.ari.pushed", (p) => p.jobId === job.id);
    eq([ev.length, ev[0]?.payload?.connectionId, Array.isArray(ev[0]?.payload?.days) ? ev[0].payload.days.length : ev[0]?.payload?.days], [1, CONN.A, 7], "event pushed");
    noPii(ev[0].payload, "pushed");
    eq((await jobsOf(CONN.A2, "SENT")).length >= 1, true, "A2 SENT");
  });
  await st("AR-8", "X3 hash ซ้ำ: dirty ช่วงเดิม (ข้อมูลไม่เปลี่ยน) ⇒ งานใหม่ · pushAriJobs ⇒ ไม่เรียกตัวต่อซ้ำ (call log ส่ง ARI +0) · งานนั้นไม่ค้าง PENDING (SUPERSEDED/SENT)", async () => {
    needMaps();
    const n0 = (await callLogs(CONN.A, /push/i)).length;
    await dirty(UH, [RTA.dlx], T0, W(6));
    const pend = await jobsOf(CONN.A, "PENDING");
    ok(pend.length === 1, `PENDING ${pend.length}`);
    await push();
    eq((await callLogs(CONN.A, /push/i)).length, n0, "ส่งซ้ำ hash เดิม");
    ok(["SUPERSEDED", "SENT"].includes((await prisma.channelAriJob.findUnique({ where: { id: pend[0].id } })).status), "งานค้าง PENDING");
  });
  await st("AR-9", "ตัวต่อล้ม (FAKE mode FAIL): งานช่วงใหม่ W+1 ⇒ push ⇒ attempts 1 · PENDING · lastError ไม่มี apiKey/ข้อความดิบผู้ให้บริการ · push ซ้ำ now+20 วิ ⇒ ไม่ลอง (backoff) · now+1/2/3/4 ชม. ⇒ attempts 5 · FAILED · outbox channel.ari.failed 1 (ไม่มี PII) · คืนโหมด OK", async () => {
    needMaps();
    await push();
    await setMode("A", "FAIL");
    try {
      await dirty(UH, [RTA.dlx], W(1), W(1));
      const job = (await jobsOf(CONN.A, "PENDING"))[0];
      ok(job, "ไม่มีงาน");
      const t0 = Date.now();
      await push(new Date(t0));
      let j = await prisma.channelAriJob.findUnique({ where: { id: job.id } });
      eq([j.status, j.attempts], ["PENDING", 1], "ครั้งแรก");
      ok(!/svc-h10-key-|apiKey|fake provider/i.test(String(j.lastError ?? "")), `lastError รั่ว ${j.lastError}`);
      await push(new Date(t0 + 20_000));
      eq((await prisma.channelAriJob.findUnique({ where: { id: job.id } })).attempts, 1, "backoff");
      for (let h = 1; h <= 4; h++) await push(new Date(t0 + h * 3_600_000));
      j = await prisma.channelAriJob.findUnique({ where: { id: job.id } });
      eq([j.status, j.attempts], ["FAILED", 5], "ครบ 5");
      const ev = await eventsOf("channel.ari.failed", (p) => p.jobId === job.id);
      eq(ev.length, 1, "event failed");
      noPii(ev[0].payload, "failed");
      ok(!/svc-h10-key-|apiKey/.test(J(ev[0].payload)), "failed payload มีคีย์");
    } finally { await setMode("A", "OK"); }
  });
  await st("AR-10", "hook หลัง commit (§9.10): saveRates · setOverride · clearOverride (rates.ts) · blockRoom · releaseBlock (block.ts) ⇒ outbox channel.ari.dirty ของร้าน A +1 ต่อครั้ง · payload {unitId UH, roomTypeIds มีประเภทที่แตะ, from ≤ วันที่แตะ ≤ to} · ไม่มี PII · การเขียนยังสำเร็จ", async () => {
    needMaps();
    const cnt = async () => (await eventsOf("channel.ari.dirty")).length;
    const last = async () => (await eventsOf("channel.ari.dirty")).at(-1)?.payload ?? {};
    const covers = (p: Any, typeId: string, d: string) => p.unitId === UH && Array.isArray(p.roomTypeIds) && p.roomTypeIds.includes(typeId) && String(p.from) <= d && d <= String(p.to);
    const step = async (what: string, f: () => Promise<Any>, typeId: string, d: string) => {
      const n0 = await cnt();
      okRes(await f(), what);
      ok(await waitFor(async () => (await cnt()) > n0), `${what} ไม่มี channel.ari.dirty`);
      const p = await last();
      ok(covers(p, typeId, d), `${what} payload ${J(p)}`);
      noPii(p, what);
    };
    await step("setOverride", () => RT("setOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, date: W(5), priceSatang: 155_000, reason: "ข้อสอบ h10" }), RTA.dlx, W(5));
    await step("clearOverride", () => RT("clearOverride")(OWNER, ctxA, { unitId: UH, roomTypeId: RTA.dlx, date: W(5) }), RTA.dlx, W(5));
    await step("saveRates", () => RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows: rowsFor({ sup: RTA.sup }, { sup: CELL.sup }) }), RTA.sup, W(1));
    let blockId = "";
    await step("blockRoom", async () => { const r = await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: ROOM.FAM1, from: W(30), to: W(31), reason: "ซ่อมแอร์ h10" }); blockId = r?.blockId ?? ""; return r; }, RTA.fam, W(30));
    await step("releaseBlock", () => BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId }), RTA.fam, W(30));
  });
  await st("AR-11", "booking ⇒ dirty (consumer ของ hotel.booking.created · ไม่แก้ booking.ts): จองเคาน์เตอร์ซูพีเรีย W+8→9 แล้วส่ง event created เข้า consumer ⇒ ตัวต่อ A มีงาน PENDING ครอบ W+8 หรือ channel.ari.dirty ใหม่ครอบ W+8", async () => {
    needMaps();
    await push();
    const d0 = (await eventsOf("channel.ari.dirty")).length;
    const b = await counterBook("sup", W(8), W(9));
    const ev = (await eventsOf("hotel.booking.created", (p) => p.reservationId === b.reservations[0].id))[0];
    ok(ev, "ไม่มี hotel.booking.created");
    await consumer("hotel.booking.created")(asEvt(ev));
    const ok1 = await waitFor(async () => (await jobsOf(CONN.A, "PENDING")).some((j) => ymdOfDb(j.dateFrom)! <= W(8) && W(8) <= ymdOfDb(j.dateTo)!) || (await eventsOf("channel.ari.dirty")).slice(d0).some((e) => e.payload?.unitId === UH && String(e.payload?.from) <= W(8) && W(8) <= String(e.payload?.to)));
    ok(ok1, "จองแล้วไม่มีงาน/event ARI");
  });
  await st("AR-12", "ประสิทธิภาพ buildAri: ช่วง 60 วัน ใช้คิวรี ≤ ช่วง 7 วัน + 1 (ไม่มี N+1 ต่อวัน/ประเภท) และ ≤ 20", async () => {
    needMaps();
    const count = async (to: string) => { await sleep(40); const i0 = SQL_LOG.length; await buildAri(T0, to); await sleep(80); return sqlCount(i0); };
    const n7 = await count(W(6)), n60 = await count(W(59));
    console.log(`     (buildAri 7 วัน = ${n7} · 60 วัน = ${n60} คำสั่ง)`);
    ok(n7 > 0 && n60 <= n7 + 1 && n60 <= 20, `คิวรี 7 วัน ${n7} · 60 วัน ${n60}`);
  });
  await st("AR-13", "ใบ §1 (MINOR · ถามผู้คุม): buildAri ≤ 6 คิวรี", async () => {
    needMaps();
    await sleep(40); const i0 = SQL_LOG.length; await buildAri(T0, W(6)); await sleep(80);
    const n = sqlCount(i0);
    ok(n <= 6, `${n} คิวรี > 6`);
  }, "MINOR");
  await st("AR-14", "ช่วงงานตัดตามขอบ (§2 ข้อ 3 · §9.4): def rooms.hotel.ota.ariHorizonDays int 7–400 เริ่ม 365 · ตั้งหน่วย 30 ⇒ dirty W−5→W+100 ⇒ งาน dateFrom = วันนี้ · dateTo = W+30 · คืนค่า", async () => {
    needMaps();
    const d = SET?.getDef?.("rooms.hotel.ota.ariHorizonDays");
    ok(d && d.defaults?._fallback === 365 && d.schema.safeParse(7).success && d.schema.safeParse(400).success && !d.schema.safeParse(6).success && !d.schema.safeParse(401).success, `def ${J(d?.defaults)}`);
    await push();
    await setUnit("rooms.hotel.ota.ariHorizonDays", 30);
    try {
      await dirty(UH, [RTA.dlx], W(-5), W(100));
      eq((await jobsOf(CONN.A, "PENDING")).map((j) => [ymdOfDb(j.dateFrom), ymdOfDb(j.dateTo)]), [[T0, W(30)]], "ช่วงงาน");
    } finally { await resetUnit("rooms.hotel.ota.ariHorizonDays"); await push(); }
  }, "MAJOR");

  // ═══════════════ IN ขาเข้า ═══════════════
  console.log("\n── IN ขาเข้า (inbox → applyInbound) ──");
  const [S1, S2, S3, S4] = OS.inbound;
  const R1 = inb({ ext: S1.externalId, ver: 1, room: "DLX", ci: W(S1.checkInOffset), nights: S1.nights, priceKey: "dlx", prepaid: true });
  const R2 = inb({ ext: S2.externalId, ver: 1, room: "FAM", ci: W(S2.checkInOffset), nights: S2.nights, gross: 250_000, prepaid: true, adults: 3 });
  const R3 = inb({ ext: S3.externalId, ver: 1, room: "SUP", ci: W(S3.checkInOffset), nights: S3.nights, priceKey: "sup", prepaid: false });
  const R4 = inb({ ext: S4.externalId, ver: 2, status: "MODIFIED", room: "DLX", ci: W(S4.checkInOffset), nights: S4.nights, priceKey: "dlx", prepaid: true });
  const ackN = async () => (await callLogs(CONN.A, /ack/i)).length;
  await st("IN-1", "ingestInbound(A, 4 แถวตามฟิกซ์เจอร์) ⇒ inbox 4 แถว RECEIVED (tenantId A · unitId UH · raw เก็บหลักฐานครบ) · ingest ซ้ำ ⇒ ยัง 4 (unique ฐาน · ไม่ throw) · outbox channel.reservation.received 4 ไม่มี PII · ยังไม่มีการจอง", async () => {
    needMaps();
    // ซูพีเรียเต็มคืน W+5 (2 ห้องในร้านชั่วคราว) ก่อนแถว OTA-1003
    ids.supFull1 = (await counterBook("sup", W(5), W(6))).reservations[0].id;
    ids.supFull2 = (await counterBook("sup", W(5), W(6))).reservations[0].id;
    const n0 = await inboxCount();
    ok((await ingest([R1, R2, R3, R4]))?.code !== "THROW", "ingest throw");
    const rows = (await prisma.channelReservationInbox.findMany({ where: { connectionId: CONN.A, externalId: { in: ["OTA-1001", "OTA-1002", "OTA-1003"] } }, orderBy: [{ externalId: "asc" }, { version: "asc" }] })) as Any[];
    eq(rows.map((r) => [r.externalId, r.version, r.status, r.tenantId, r.unitId, r.reservationId]), [["OTA-1001", 1, "RECEIVED", tA, UH, null], ["OTA-1001", 2, "RECEIVED", tA, UH, null], ["OTA-1002", 1, "RECEIVED", tA, UH, null], ["OTA-1003", 1, "RECEIVED", tA, UH, null]], "inbox");
    ok(rows.every((r) => J(r.raw).includes(GUEST_MAIL(r.externalId))), "raw ไม่เก็บหลักฐานจากช่องทาง");
    ok((await ingest([R1, R2, R3, R4]))?.code !== "THROW", "ingest ซ้ำ throw");
    eq(await inboxCount(), n0 + 4, "ซ้ำเพิ่มแถว");
    const ev = await eventsOf("channel.reservation.received", (p) => rows.some((r) => J(p).includes(r.id)));
    eq(ev.length, 4, "event received");
    for (const e of ev) noPii(e.payload, "received");
    eq((await rvsOfRef("OTA-1001")).length, 0, "มีการจองก่อน apply");
  });
  await st("IN-2", "applyInbound(OTA-1001 v1) ⇒ inbox APPLIED + reservationId · การจอง: source OTA · CONFIRMED · channelRef OTA-1001 · channelConnectionId A · gross/commission/net = ค่าช่องทาง · prepaidByChannel true · ratePlanId STANDARD · W+3→5 · nights 2 counted (ราคาโรงแรม STANDARD) · totalSatang = Σ ราคาโรงแรม · ห้องจริง + occupancy STAY active · folio OPEN · createdById null · AuditLog hotel.booking.created actorType SYSTEM · hotel.booking.created source OTA · channel.reservation.applied {reservationId} ไม่มี PII · ackReservation +1", async () => {
    needMaps();
    const a0 = await ackN();
    const { row, r } = await apply("OTA-1001", 1);
    ok(r?.code !== "THROW", `apply throw ${r?.reason}`);
    const ib = await inboxOf("OTA-1001", 1);
    eq([ib.status, typeof ib.reservationId], ["APPLIED", "string"], `inbox ${ib.error ?? ""}`);
    ids.v1 = ib.reservationId;
    const rv = await rvOf(ids.v1);
    eq([rv.source, rv.status, rv.channelRef, rv.channelConnectionId, rv.grossSatang, rv.commissionSatang, rv.netSatang, rv.prepaidByChannel, rv.ratePlanId, ymdOfDb(rv.checkInDate), ymdOfDb(rv.checkOutDate), rv.roomTypeId, rv.createdById, rv.unitId, rv.tenantId],
      ["OTA", "CONFIRMED", "OTA-1001", CONN.A, R1.grossSatang, R1.commissionSatang, R1.netSatang, true, ids.std, W(3), W(5), RTA.dlx, null, UH, tA], "การจอง");
    const ns = await nightsOfRv(ids.v1);
    eq(ns.map((n) => [ymdOfDb(n.date), n.priceSatang, n.counted]), nightsOf(W(3), W(5)).map((d) => [d, refNightPrice(CELL.dlx, d), true]), "nights");
    eq(rv.totalSatang, sum(nightsOf(W(3), W(5)).map((d) => refNightPrice(CELL.dlx, d))), "totalSatang");
    const occ = await occOfRv(ids.v1, true);
    eq([occ.length, occ[0]?.kind, !!rv.roomId, (await folioOf(ids.v1))?.status], [1, "STAY", true, "OPEN"], "ห้อง/folio");
    const au = (await auditsOf("hotel.booking.created")).filter((x) => x.targetId === ids.v1);
    eq([au.length, au[0]?.actorType], [1, "SYSTEM"], "AuditLog");
    noPii(au.map((x) => x.after), "AuditLog");
    const cr = await eventsOf("hotel.booking.created", (p) => p.reservationId === ids.v1);
    eq([cr.length, cr[0]?.payload?.source], [1, "OTA"], "hotel.booking.created");
    const ap = await eventsOf("channel.reservation.applied", (p) => J(p).includes(row.id));
    eq([ap.length, ap[0]?.payload?.reservationId], [1, ids.v1], "channel.reservation.applied");
    noPii(ap[0].payload, "applied");
    eq(await ackN(), a0 + 1, "ackReservation");
  });
  await st("IN-3", "X3 apply ซ้ำ (APPLIED แล้ว) ⇒ no-op คืน reservationId เดิม · การจอง channelRef OTA-1001 ยัง 1 · nights/occupancy ไม่เพิ่ม · ไม่มี event applied ใหม่", async () => {
    needMaps(); ok(ids.v1, "ไม่มี IN-2");
    const ap0 = (await eventsOf("channel.reservation.applied")).length;
    const { r } = await apply("OTA-1001", 1);
    ok(r?.code !== "THROW" && J(r).includes(ids.v1), `ผล ${J(r).slice(0, 160)}`);
    eq([(await rvsOfRef("OTA-1001")).length, (await nightsOfRv(ids.v1)).length, (await occOfRv(ids.v1, true)).length, (await eventsOf("channel.reservation.applied")).length], [1, 2, 1, ap0], "ไม่ซ้ำ");
  });
  await st("IN-4", "OTA-1002 (FAM ไม่แม็ป) ⇒ REJECTED · error มี UNMAPPED_ROOM · ไม่มีการจอง · outbox channel.reservation.rejected {reason} ไม่มี PII · ackReservation +1 (§2: ack เฉพาะ APPLIED/REJECTED)", async () => {
    needMaps();
    const a0 = await ackN();
    const n0 = await prisma.hotelReservation.count({ where: { tenantId: tA } });
    const { row, r } = await apply("OTA-1002", 1);
    ok(r?.code !== "THROW", `throw ${r?.reason}`);
    const ib = await inboxOf("OTA-1002", 1);
    eq([ib.status, ib.reservationId, /UNMAPPED_ROOM/.test(String(ib.error ?? ""))], ["REJECTED", null, true], `inbox ${ib.error}`);
    eq(await prisma.hotelReservation.count({ where: { tenantId: tA } }), n0, "สร้างการจอง");
    const ev = await eventsOf("channel.reservation.rejected", (p) => J(p).includes(row.id));
    ok(ev.length === 1 && /UNMAPPED_ROOM/.test(J(ev[0].payload)), `event rejected ${J(ev.map((e) => e.payload))}`);
    noPii(ev[0].payload, "rejected");
    eq(await ackN(), a0 + 1, "ack");
  });
  await st("IN-5", "OTA-1003 (ซูพีเรีย W+5 เต็ม: เคาน์เตอร์ 2 ห้อง) ⇒ NEEDS_ROOM · ไม่มีการจอง · ไม่ทับใคร (การจองเคาน์เตอร์ 2 แถว CONFIRMED · nights/occupancy เดิม) · outbox channel.reservation.needs_room ไม่มี PII · ackReservation +0 · listNeedsRoom(owner, UH) มีแถวนี้ (ไม่มี raw/อีเมล/เบอร์)", async () => {
    needMaps();
    const a0 = await ackN();
    const occ0 = J([...(await occOfRv(ids.supFull1, true)), ...(await occOfRv(ids.supFull2, true))].map((o) => [o.roomId, o.kind]));
    const { row, r } = await apply("OTA-1003", 1);
    ok(r?.code !== "THROW", `throw ${r?.reason}`);
    const ib = await inboxOf("OTA-1003", 1);
    eq([ib.status, ib.reservationId], ["NEEDS_ROOM", null], `inbox ${ib.error}`);
    eq((await rvsOfRef("OTA-1003")).length, 0, "สร้างการจอง");
    eq([(await rvOf(ids.supFull1)).status, (await rvOf(ids.supFull2)).status, J([...(await occOfRv(ids.supFull1, true)), ...(await occOfRv(ids.supFull2, true))].map((o) => [o.roomId, o.kind]))], ["CONFIRMED", "CONFIRMED", occ0], "การจองเดิม");
    const ev = await eventsOf("channel.reservation.needs_room", (p) => J(p).includes(row.id));
    eq(ev.length, 1, "event needs_room");
    noPii(ev[0].payload, "needs_room");
    eq(await ackN(), a0, "ack ตอน NEEDS_ROOM");
    const l = okRes(await call(() => CH("listNeedsRoom")(OWNER, ctxA, { unitId: UH })), "listNeedsRoom");
    const items = (l.items ?? l.rows ?? []) as Any[];
    ok(items.some((x) => J(x).includes(row.id)), `ไม่มีในคิว ${J(items).slice(0, 160)}`);
    ok(!new RegExp(`svc-h10-guest-${RUN}|0891234510`).test(J(l)) && ![...walkKeys(l)].includes("raw"), "คิวมี raw/อีเมล/เบอร์");
  });
  await st("IN-6", "OTA-1001 v2 MODIFIED (เลื่อน +1 วัน · W+4→6) ⇒ APPLIED · การจอง v1 CANCELLED (cancelReason มี CHANNEL · nights counted false · occupancy ไม่ active) + การจองใหม่ CONFIRMED W+4→6 channelRef OTA-1001 prepaid ใน tx เดียว · ไม่มีบิลคืนเงิน POS ของ v1 · inbox v1 คง APPLIED · hotel.booking.cancelled ของ v1 · applied ของ v2", async () => {
    needMaps(); ok(ids.v1, "ไม่มี IN-2");
    const { row, r } = await apply("OTA-1001", 2);
    ok(r?.code !== "THROW", `throw ${r?.reason}`);
    const ib = await inboxOf("OTA-1001", 2);
    eq(ib.status, "APPLIED", `inbox ${ib.error}`);
    ids.v2 = ib.reservationId;
    ok(ids.v2 && ids.v2 !== ids.v1, "ไม่มีการจองใหม่");
    const old = await rvOf(ids.v1), nu = await rvOf(ids.v2);
    eq([old.status, /CHANNEL/.test(String(old.cancelReason ?? "")), (await nightsOfRv(ids.v1)).filter((n) => n.counted).length, (await occOfRv(ids.v1, true)).length], ["CANCELLED", true, 0, 0], "v1");
    eq([nu.status, nu.source, nu.channelRef, nu.channelConnectionId, ymdOfDb(nu.checkInDate), ymdOfDb(nu.checkOutDate), nu.prepaidByChannel, nu.grossSatang, nu.depositSatang], ["CONFIRMED", "OTA", "OTA-1001", CONN.A, W(4), W(6), true, R4.grossSatang, 0], "v2");
    eq((await inboxOf("OTA-1001", 1)).status, "APPLIED", "inbox v1");
    eq(await prisma.posSale.count({ where: { tenantId: tA, sourceId: ids.v1 } }), 0, "บิล POS ของ v1");
    eq((await eventsOf("hotel.booking.cancelled", (p) => p.reservationId === ids.v1)).length, 1, "cancelled v1");
    eq((await eventsOf("channel.reservation.applied", (p) => J(p).includes(row.id))).length, 1, "applied v2");
  });
  await st("IN-7", "แก้ไขชนห้อง = atomic (§0 · ล้ม = การจองเดิมคง): ดีลักซ์ W+20 เต็ม (เคาน์เตอร์ 3 ห้อง) · OTA-1001 v3 MODIFIED ไป W+20 ⇒ NEEDS_ROOM · การจอง v2 ยัง CONFIRMED (nights/occupancy เดิม) · ไม่มีการจองใหม่ · ไม่มีการจองที่ CANCELLED เพิ่ม", async () => {
    needMaps(); ok(ids.v2, "ไม่มี IN-6");
    ids.dlxFull = (await counterBook("dlx", W(20), W(21), 3)).reservations.map((x: Any) => x.id).join(",");
    const before = J({ n: (await nightsOfRv(ids.v2)).map((n) => [ymdOfDb(n.date), n.counted]), o: (await occOfRv(ids.v2, true)).map((o) => o.roomId) });
    const c0 = await prisma.hotelReservation.count({ where: { tenantId: tA, status: "CANCELLED" } });
    ok((await ingest([inb({ ext: "OTA-1001", ver: 3, status: "MODIFIED", room: "DLX", ci: W(20), nights: 1, priceKey: "dlx" })]))?.code !== "THROW", "ingest");
    const { r } = await apply("OTA-1001", 3);
    ok(r?.code !== "THROW", `throw ${r?.reason}`);
    eq((await inboxOf("OTA-1001", 3)).status, "NEEDS_ROOM", "inbox v3");
    eq([(await rvOf(ids.v2)).status, J({ n: (await nightsOfRv(ids.v2)).map((n) => [ymdOfDb(n.date), n.counted]), o: (await occOfRv(ids.v2, true)).map((o) => o.roomId) }), (await rvsOfRef("OTA-1001")).length, await prisma.hotelReservation.count({ where: { tenantId: tA, status: "CANCELLED" } })], ["CONFIRMED", before, 2, c0], "การจองเดิมคง");
  });
  await st("IN-8", "CANCELLED จากช่องทาง (OTA-1001 v4) ⇒ APPLIED · การจอง v2 CANCELLED โดย cancelBooking by CHANNEL (cancelReason มี CHANNEL_CANCELLED) · ไม่มีบิล POS คืนเงิน (prepaid) · outbox channel.reservation.cancelled ไม่มี PII · แล้ว retryInbound(v3 NEEDS_ROOM) ⇒ REJECTED STALE (version ต่ำกว่าที่ APPLIED) ไม่สร้างการจอง", async () => {
    needMaps(); ok(ids.v2, "ไม่มี IN-6");
    ok((await ingest([inb({ ext: "OTA-1001", ver: 4, status: "CANCELLED", room: "DLX", ci: W(4), nights: 2, priceKey: "dlx" })]))?.code !== "THROW", "ingest");
    const { row, r } = await apply("OTA-1001", 4);
    ok(r?.code !== "THROW", `throw ${r?.reason}`);
    eq((await inboxOf("OTA-1001", 4)).status, "APPLIED", "inbox v4");
    const rv = await rvOf(ids.v2);
    eq([rv.status, /CHANNEL_CANCELLED/.test(String(rv.cancelReason ?? ""))], ["CANCELLED", true], `v2 ${rv.cancelReason}`);
    eq(await prisma.posSale.count({ where: { tenantId: tA, sourceId: ids.v2 } }), 0, "บิล POS");
    const ev = await eventsOf("channel.reservation.cancelled", (p) => J(p).includes(row.id) || p.reservationId === ids.v2);
    eq(ev.length, 1, "event cancelled");
    noPii(ev[0].payload, "cancelled");
    const v3 = await inboxOf("OTA-1001", 3);
    const rr = await call(() => CH("retryInbound")(OWNER, ctxA, { unitId: UH, inboxId: v3.id }));
    ok(rr?.code !== "THROW", `retry throw ${rr?.reason}`);
    const v3b = await inboxOf("OTA-1001", 3);
    eq([v3b.status, /STALE/.test(String(v3b.error ?? "")), (await rvsOfRef("OTA-1001")).filter((x) => x.status !== "CANCELLED").length], ["REJECTED", true, 0], `v3 ${v3b.error}`);
  });
  await st("IN-9", "STALE ตามลำดับ version (§2 ข้อ 1): OTA-2001 v2 มาก่อน ⇒ APPLIED · v1 มาทีหลัง ⇒ REJECTED STALE · การจอง OTA-2001 = 1 (ของ v2)", async () => {
    needMaps();
    ok((await ingest([inb({ ext: "OTA-2001", ver: 2, room: "SUP", ci: W(12), nights: 1, priceKey: "sup" })]))?.code !== "THROW", "ingest v2");
    await apply("OTA-2001", 2);
    eq((await inboxOf("OTA-2001", 2)).status, "APPLIED", "v2");
    ok((await ingest([inb({ ext: "OTA-2001", ver: 1, room: "SUP", ci: W(13), nights: 1, priceKey: "sup" })]))?.code !== "THROW", "ingest v1");
    await apply("OTA-2001", 1);
    const v1 = await inboxOf("OTA-2001", 1);
    eq([v1.status, /STALE/.test(String(v1.error ?? "")), (await rvsOfRef("OTA-2001")).length], ["REJECTED", true, 1], `v1 ${v1.error}`);
  });
  await st("IN-10", "คิวต้องจัดห้อง → ลองอีกครั้ง: ยกเลิกเคาน์เตอร์ซูพีเรีย W+5 1 ห้อง ⇒ retryInbound(owner, OTA-1003) ⇒ APPLIED · การจอง CONFIRMED ไม่ prepaid · ack +1 · ไม่อยู่ใน listNeedsRoom แล้ว", async () => {
    needMaps();
    okRes(await BK("cancelBooking")(OWNER, ctxA, { unitId: UH, reservationId: ids.supFull2, reason: "ย้ายแขกให้ OTA" }), "ปล่อยห้อง");
    const a0 = await ackN();
    const ib0 = await inboxOf("OTA-1003", 1);
    const r = await call(() => CH("retryInbound")(OWNER, ctxA, { unitId: UH, inboxId: ib0.id }));
    ok(r?.code !== "THROW", `retry throw ${r?.reason}`);
    const ib = await inboxOf("OTA-1003", 1);
    eq(ib.status, "APPLIED", `inbox ${ib.error}`);
    ids.r3 = ib.reservationId;
    const rv = await rvOf(ids.r3);
    eq([rv.status, rv.prepaidByChannel, rv.channelRef, ymdOfDb(rv.checkInDate)], ["CONFIRMED", false, "OTA-1003", W(5)], "การจอง");
    eq(await ackN(), a0 + 1, "ack");
    const l = await call(() => CH("listNeedsRoom")(OWNER, ctxA, { unitId: UH }));
    ok(!J(l).includes(ib.id), "ยังอยู่ในคิว");
  });
  await st("IN-11", "ปฏิเสธจากคิว: แถว NEEDS_ROOM ใหม่ (ดีลักซ์ W+20 เต็ม) · rejectInbound หน้าเคาน์เตอร์ ⇒ FORBIDDEN/NOT_FOUND (แถวคง NEEDS_ROOM) · retryInbound หน้าเคาน์เตอร์ ⇒ ปฏิเสธ · owner rejectInbound(reason) ⇒ REJECTED + event rejected · ack +1", async () => {
    needMaps();
    ok((await ingest([inb({ ext: "OTA-3001", room: "DLX", ci: W(20), nights: 1, priceKey: "dlx" })]))?.code !== "THROW", "ingest");
    await apply("OTA-3001", 1);
    const ib = await inboxOf("OTA-3001", 1);
    eq(ib.status, "NEEDS_ROOM", "NEEDS_ROOM");
    ok(denied(await call(() => CH("rejectInbound")(FRONT, ctxA, { unitId: UH, inboxId: ib.id, reason: "ห้องเต็ม" }))), "หน้าเคาน์เตอร์ปฏิเสธได้");
    ok(denied(await call(() => CH("retryInbound")(FRONT, ctxA, { unitId: UH, inboxId: ib.id }))), "หน้าเคาน์เตอร์ลองใหม่ได้");
    eq((await inboxOf("OTA-3001", 1)).status, "NEEDS_ROOM", "แถวเปลี่ยน");
    const a0 = await ackN();
    okRes(await call(() => CH("rejectInbound")(OWNER, ctxA, { unitId: UH, inboxId: ib.id, reason: "ห้องเต็มทั้งคืน" })), "reject");
    eq((await inboxOf("OTA-3001", 1)).status, "REJECTED", "REJECTED");
    eq((await eventsOf("channel.reservation.rejected", (p) => J(p).includes(ib.id))).length, 1, "event");
    eq(await ackN(), a0 + 1, "ack");
  });
  await st("IN-12", "แผนไม่แม็ป / ไม่ส่งแผน: externalRateId \"XYZ\" ⇒ REJECTED (error UNMAPPED_RATE) · ไม่มี externalRateId ⇒ แผนเริ่มต้น (STANDARD) APPLIED · NRF ⇒ ratePlanId NONREF", async () => {
    needMaps();
    ok((await ingest([inb({ ext: "OTA-4001", room: "DLX", rate: "XYZ", ci: W(14), nights: 1, priceKey: "dlx" }), inb({ ext: "OTA-4002", room: "DLX", rate: null, ci: W(15), nights: 1, priceKey: "dlx" }), inb({ ext: "OTA-4003", room: "DLX", rate: "NRF", ci: W(16), nights: 1, priceKey: "dlx" })]))?.code !== "THROW", "ingest");
    for (const e of ["OTA-4001", "OTA-4002", "OTA-4003"]) await apply(e, 1);
    const a = await inboxOf("OTA-4001", 1), b = await inboxOf("OTA-4002", 1), c = await inboxOf("OTA-4003", 1);
    eq([a.status, /UNMAPPED_RATE/.test(String(a.error ?? "")), b.status, c.status], ["REJECTED", true, "APPLIED", "APPLIED"], `สถานะ ${a.error} ${b.error} ${c.error}`);
    eq([(await rvOf(b.reservationId)).ratePlanId, (await rvOf(c.reservationId)).ratePlanId], [ids.std, ids.nr], "แผน");
  }, "MAJOR");
  await st("IN-13", "§9.6 ช่องทางข้ามข้อจำกัดแผนแต่ไม่ข้ามด่านห้อง: ตั้งหน่วย bookingMode MANUAL_APPROVE + minNights 3 ⇒ inbound 2 คืน ⇒ APPLIED CONFIRMED (ไม่ HOLD · ไม่ MIN_NIGHTS) · คืนค่า", async () => {
    needMaps();
    await setUnit("rooms.hotel.bookingMode", "MANUAL_APPROVE");
    await setUnit("rooms.hotel.minNights", 3);
    try {
      ok((await ingest([inb({ ext: "OTA-5001", room: "DLX", ci: W(24), nights: 2, priceKey: "dlx" })]))?.code !== "THROW", "ingest");
      await apply("OTA-5001", 1);
      const ib = await inboxOf("OTA-5001", 1);
      eq(ib.status, "APPLIED", `inbox ${ib.error}`);
      eq([(await rvOf(ib.reservationId)).status, (await rvOf(ib.reservationId)).holdExpiresAt], ["CONFIRMED", null], "สถานะ");
    } finally { await resetUnit("rooms.hotel.bookingMode"); await resetUnit("rooms.hotel.minNights"); }
  });
  await st("IN-14", "ack ล้มหลัง commit (FAKE mode FAIL) ⇒ การจองไม่ถูกย้อน: OTA-6001 ⇒ inbox APPLIED + การจอง CONFIRMED · call log ack ok=false · คืนโหมด OK", async () => {
    needMaps();
    ok((await ingest([inb({ ext: "OTA-6001", room: "SUP", ci: W(26), nights: 1, priceKey: "sup" })]))?.code !== "THROW", "ingest");
    await setMode("A", "FAIL");
    try {
      const a0 = (await callLogs(CONN.A, /ack/i)).length;
      await apply("OTA-6001", 1);
      const ib = await inboxOf("OTA-6001", 1);
      eq([ib.status, (await rvsOfRef("OTA-6001")).map((x) => x.status)], ["APPLIED", ["CONFIRMED"]], `inbox ${ib.error}`);
      const logs = (await callLogs(CONN.A, /ack/i)).slice(a0);
      ok(logs.length >= 1 && logs.every((l) => l.ok === false), `ack log ${J(logs.map((l) => l.ok))}`);
    } finally { await setMode("A", "OK"); }
  }, "MAJOR");

  // ═══════════════ MN เงิน ═══════════════
  console.log("\n── MN เงิน OTA ──");
  await st("MN-1", "gross/commission/net (การจอง v2 + OTA-1003): เก็บตรงค่าช่องทางทุกสตางค์ · commission = 15% ของ gross ตาม channelCommission · net = gross − commission · ฟิกซ์เจอร์ฉาก: gross = Σ STANDARD×1.15 ตรง ref", async () => {
    needMaps(); ok(ids.v2 && ids.r3, "ไม่มี IN-6/IN-10");
    const cc = chShared.mod.channelCommission;
    for (const [id, row] of [[ids.v2, R4], [ids.r3, R3]] as const) {
      const rv = await rvOf(id);
      eq([rv.grossSatang, rv.commissionSatang, rv.netSatang], [row.grossSatang, row.commissionSatang, row.netSatang], `${row.externalId} คอลัมน์`);
      eq([rv.commissionSatang, rv.netSatang], [cc(rv.grossSatang, { commissionBp: 1_500, commissionFixedSatang: 0, commissionVatBp: 0 }).commissionSatang, rv.grossSatang - rv.commissionSatang], `${row.externalId} 15%`);
    }
  });
  await st("MN-2", "prepaid ⇒ ไม่ต้องมัดจำ: การจอง v2 depositSatang 0 · depositPaidAt/depositSaleId null · ไม่มี PosSale/PosDeposit อ้างการจอง · ไม่ prepaid (OTA-1003) ⇒ มัดจำตามแผน STANDARD (FIRST_NIGHT = 99,000) แต่ยัง CONFIRMED · ไม่มีบิลมัดจำ (ยังไม่จ่าย)", async () => {
    needMaps(); ok(ids.v2 && ids.r3, "ไม่มี IN-6/IN-10");
    const a = await rvOf(ids.v2), b = await rvOf(ids.r3);
    eq([a.depositSatang, a.depositPaidAt, a.depositSaleId, b.depositSatang, b.status, b.depositPaidAt], [0, null, null, refNightPrice(CELL.sup, W(5)), "CONFIRMED", null], "มัดจำ");
    eq([await prisma.posSale.count({ where: { tenantId: tA, sourceId: { in: [ids.v2, ids.r3] } } }), await prisma.posSale.count({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-deposit-${ids.r3}` } } })], [0, 0], "บิล POS");
  });
  await st("MN-3", "§9.6 NO_RATE ⇒ ราคาจากช่องทาง: สวีท (ไม่มีราคา) 2 คืน gross 300,000 ⇒ APPLIED · nights 150,000 × 2 (gross/คืน) · totalSatang 300,000", async () => {
    needMaps();
    ok((await ingest([inb({ ext: "OTA-7001", room: "STE", ci: W(18), nights: 2, gross: 300_000 })]))?.code !== "THROW", "ingest");
    await apply("OTA-7001", 1);
    const ib = await inboxOf("OTA-7001", 1);
    eq(ib.status, "APPLIED", `inbox ${ib.error}`);
    eq([(await nightsOfRv(ib.reservationId)).map((n) => n.priceSatang), (await rvOf(ib.reservationId)).totalSatang], [[150_000, 150_000], 300_000], "ราคา");
  }, "MAJOR");
  if (!has(F.reports)) skip("MN-4", "รายงาน H.7 ไม่พังกับการจอง OTA (แยก source OTA · commission)", `ยังไม่มี ${F.reports} (H.7 ยังไม่ merge) — ผู้คุมรันซ้ำเมื่อ H.7 อยู่ในทรี`, "MAJOR");
  else await st("MN-4", "รายงาน H.7 ไม่พังกับการจอง OTA: ทุก export async ของ reports.ts ที่รับ (actor, ctx, {unitId, from, to}) ไม่ throw · ผลที่มีคำว่า OTA ไม่มี PII", async () => {
    needMaps();
    const rp = await loadIf(F.reports);
    ok(rp.mod, rp.err);
    const fns = Object.entries(rp.mod).filter(([, f]) => typeof f === "function") as [string, (...a: Any[]) => Any][];
    const bad: string[] = [];
    for (const [n, f] of fns) { const r = await call(() => f(OWNER, ctxA, { unitId: UH, from: T0, to: W(30) })); if (r?.code === "THROW") bad.push(`${n}: ${r.reason}`); else if (/OTA/.test(J(r)) && PII_TEXT.test(J(r))) bad.push(`${n} PII`); }
    eq(bad.slice(0, 4), [], "รายงาน");
  }, "MAJOR");

  // ═══════════════ PL ดึง · งานรายนาที ═══════════════
  console.log("\n── PL ดึงจากตัวต่อ · งานรายนาที ──");
  await st("PL-1", "fakeEnqueueInbound(A, 2 แถว) → pullAll(now) ⇒ inbox 2 แถว (raw มีหลักฐาน) + apply ⇒ APPLIED + การจอง 2 · IntegrationCallLog ดึง ok ≥ 1 ของ A · pullAll ซ้ำ ⇒ ไม่เพิ่มแถว/การจอง", async () => {
    needMaps();
    okRes(await call(() => CH("fakeEnqueueInbound")(CONN.A, [inb({ ext: "PULL-1", room: "DLX", ci: W(50), nights: 1, priceKey: "dlx" }), inb({ ext: "PULL-2", room: "SUP", ci: W(50), nights: 1, priceKey: "sup" })])), "enqueue");
    const p0 = (await callLogs(CONN.A, /pull/i)).length;
    ok((await call(() => CH("pullAll")(new Date(), 20_000)))?.code !== "THROW", "pullAll throw");
    const rows = (await prisma.channelReservationInbox.findMany({ where: { connectionId: CONN.A, externalId: { in: ["PULL-1", "PULL-2"] } } })) as Any[];
    eq(rows.map((r) => [r.externalId, r.status]).sort(), [["PULL-1", "APPLIED"], ["PULL-2", "APPLIED"]], `inbox ${J(rows.map((r) => r.error))}`);
    ok(rows.every((r) => J(r.raw).includes(GUEST_MAIL(r.externalId))), "raw");
    ok((await callLogs(CONN.A, /pull/i)).slice(p0).some((l) => l.ok), "ไม่มี call log ดึง");
    const n0 = await inboxCount(), r0 = await prisma.hotelReservation.count({ where: { tenantId: tA } });
    await call(() => CH("pullAll")(new Date(), 20_000));
    eq([await inboxCount(), await prisma.hotelReservation.count({ where: { tenantId: tA } })], [n0, r0], "ซ้ำ");
  });
  await st("PL-2", "งานรายนาที (§1 · §9): ทะเบียน minute-jobs มี channel-ari-push (ทุก 1 นาที) · channel-pull (ทุก 5 นาที) · run(now, budget, ctl) ของทั้งคู่ไม่ throw · ไม่เพิ่ม vercel.json", async () => {
    needCh();
    const reg = (globalThis as Any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, Any> | undefined;
    const a = reg?.get("channel-ari-push"), p = reg?.get("channel-pull");
    ok(a && p, `ไม่มีงาน (มี: ${[...(reg?.keys() ?? [])].filter((k) => /channel|ota/i.test(k)).join(",") || "-"})`);
    eq([a.everyMinutes, p.everyMinutes], [1, 5], "จังหวะ");
    for (const j of [a, p]) { const ac = new AbortController(); const r = await call(() => j.run(new Date(), 20_000, { signal: ac.signal, deadline: Date.now() + 20_000 })); ok(r?.code !== "THROW", `${j.name} throw ${r?.reason}`); }
    ok(!/channel/i.test(read("vercel.json")), "แก้ vercel.json");
  });
  await st("PL-3", "§2 ข้อ 5 ตัวต่อ DISABLED ⇒ หยุด pull/push · แม็ปคง: งาน PENDING ของ A2 (dirty UH2) → disableIntegration(A2) → pushAriJobs ⇒ งาน A2 ไม่ SENT · call log ส่ง ARI ของ A2 +0 · enqueue A2 + pullAll ⇒ inbox A2 0 แถว · call log ดึงของ A2 +0 · ChannelRoomMap ของ A2 ยังอยู่", async () => {
    needMaps();
    await push();
    await dirty(UH2, [RT2], W(3), W(4));
    const job = (await jobsOf(CONN.A2, "PENDING"))[0];
    ok(job, "ไม่มีงาน A2");
    okRes(await INT.disableIntegration(ctxA, OWNER, { id: CONN.A2 }), "disable");
    const s0 = (await callLogs(CONN.A2, /push/i)).length, p0 = (await callLogs(CONN.A2, /pull/i)).length;
    await push();
    ok((await prisma.channelAriJob.findUnique({ where: { id: job.id } })).status !== "SENT", "งาน A2 ยังส่ง");
    await call(() => CH("fakeEnqueueInbound")(CONN.A2, [inb({ ext: "PULL-A2", room: "DLX", ci: W(5), nights: 1, priceKey: "dlx" })]));
    await call(() => CH("pullAll")(new Date(), 20_000));
    eq([(await callLogs(CONN.A2, /push/i)).length, (await callLogs(CONN.A2, /pull/i)).length, await inboxCount(CONN.A2)], [s0, p0, 0], "หยุด");
    eq((await roomMapsOf(CONN.A2)).length, 1, "แม็ป A2 หาย");
  }, "MAJOR");

  // ═══════════════ X ข้ามร้าน · ซ้ำ · race · สิทธิ์ · PII ═══════════════
  console.log("\n── X ข้ามร้าน/ซ้ำ/race/สิทธิ์/PII ──");
  await st("X-1", "X1 ขาเข้า: แม็ปที่ชี้ประเภทห้องของหน่วยอื่น (แทรกตรงฐาน · ตัวต่อ A externalRoomId X2 → ประเภท UH2) ⇒ inbound X2 ⇒ REJECTED ไม่สร้างการจองในหน่วยใด · retry/reject/listNeedsRoom ของร้าน B กับ inbox ร้าน A ⇒ NOT_FOUND · buildAri ตัวต่อ B ไม่มี id ของร้าน A", async () => {
    needMaps();
    await prisma.channelRoomMap.create({ data: { tenantId: tA, unitId: UH, connectionId: CONN.A, roomTypeId: RT2, externalRoomId: "X2" } });
    ok((await ingest([inb({ ext: "OTA-X1", room: "X2", ci: W(7), nights: 1, priceKey: "dlx" })]))?.code !== "THROW", "ingest");
    await apply("OTA-X1", 1);
    const ib = await inboxOf("OTA-X1", 1);
    eq([ib.status, ib.reservationId, await prisma.hotelReservation.count({ where: { channelRef: "OTA-X1" } })], ["REJECTED", null, 0], `inbox ${ib.error}`);
    const v3 = await inboxOf("OTA-1001", 3);
    ok(notFound(await call(() => CH("retryInbound")(OWNER_B, ctxB, { unitId: UH, inboxId: v3.id }))) && notFound(await call(() => CH("rejectInbound")(OWNER_B, ctxB, { unitId: UHB, inboxId: v3.id, reason: "x" }))), "ร้าน B แตะ inbox ร้าน A");
    const lb = await call(() => CH("listNeedsRoom")(OWNER_B, ctxB, { unitId: UH }));
    ok(notFound(lb) || !J(lb).includes(v3.id), "ร้าน B เห็นคิวร้าน A");
    const b = await buildAri(T0, W(2), CONN.B);
    ok(!J(b).includes(RTA.dlx) && !J(b).includes(UH) && Object.keys(b.byDate[T0]).join() === "DLX", `ARI ร้าน B ${J(b.byDate[T0])}`);
  });
  await st("X-2", "X3 ingest/apply ซ้อน: ingest แถวเดียวกัน 2 ทางพร้อมกัน ⇒ inbox 1 แถว · applyInbound แถวเดียว 5 ทางพร้อมกัน ⇒ การจอง 1 · inbox APPLIED · ไม่มี throw", async () => {
    needMaps();
    const row = inb({ ext: "DUP-1", room: "DLX", ci: W(40), nights: 1, priceKey: "dlx" });
    const rs = await Promise.all([ingest([row]), ingest([row])]);
    ok(rs.every((r) => r?.code !== "THROW"), `ingest ${J(rs.map(codeOf))}`);
    eq(await prisma.channelReservationInbox.count({ where: { connectionId: CONN.A, externalId: "DUP-1" } }), 1, "inbox");
    const ib = await inboxOf("DUP-1", 1);
    const ap = await Promise.all(Array.from({ length: 5 }, () => call(() => CH("applyInbound")(ib.id))));
    ok(ap.every((r) => r?.code !== "THROW"), `apply throw ${J(ap.map(codeOf))}`);
    eq([(await inboxOf("DUP-1", 1)).status, (await rvsOfRef("DUP-1")).length], ["APPLIED", 1], "ครั้งเดียว");
  });
  await st("X-3", "X4 race ห้องสุดท้าย: ห้องเดี่ยว (1 ห้อง) W+10 · inbound 10 แถว (คนละ externalId) apply พร้อมกัน ⇒ APPLIED 1 + NEEDS_ROOM 9 · การจองห้องเดี่ยว W+10 active 1 · nights คืนนั้น 1 · ไม่มี throw/deadlock", async () => {
    needMaps();
    const rows = Array.from({ length: 10 }, (_, i) => inb({ ext: `RACE-${String(i).padStart(2, "0")}`, room: "ONE", ci: W(10), nights: 1, priceKey: "one" }));
    ok((await ingest(rows))?.code !== "THROW", "ingest");
    const ibs = await Promise.all(rows.map((r) => inboxOf(r.externalId, 1)));
    const ap = await Promise.all(ibs.map((ib) => call(() => CH("applyInbound")(ib.id))));
    ok(ap.every((r) => r?.code !== "THROW"), `throw ${J(ap.filter((r) => r?.code === "THROW").map((r) => r.reason)).slice(0, 200)}`);
    const st2 = (await Promise.all(rows.map((r) => inboxOf(r.externalId, 1)))).map((x) => x.status).sort();
    eq(st2, ["APPLIED", ...Array(9).fill("NEEDS_ROOM")], "สถานะ");
    eq([await prisma.hotelReservation.count({ where: { tenantId: tA, roomTypeId: RTA.one, status: { in: ["CONFIRMED", "HOLD"] }, checkInDate: new Date(`${W(10)}T00:00:00Z`) } }), await prisma.hotelBookingNight.count({ where: { tenantId: tA, roomTypeId: RTA.one, counted: true, date: new Date(`${W(10)}T00:00:00Z`) } })], [1, 1], "การจอง/คืน");
  });
  await st("X-4", "X5 งานตามเวลาซ้อน: enqueue PULL-3 แล้ว pullAll ×2 พร้อมกัน ⇒ inbox 1 · การจอง 1 · งาน ARI PENDING 1 แล้ว pushAriJobs ×2 พร้อมกัน ⇒ call log ส่ง ARI +1 · งาน SENT", async () => {
    needMaps();
    okRes(await call(() => CH("fakeEnqueueInbound")(CONN.A, [inb({ ext: "PULL-3", room: "DLX", ci: W(52), nights: 1, priceKey: "dlx" })])), "enqueue");
    const pr = await Promise.all([call(() => CH("pullAll")(new Date(), 20_000)), call(() => CH("pullAll")(new Date(), 20_000))]);
    ok(pr.every((r) => r?.code !== "THROW"), "pullAll throw");
    eq([await prisma.channelReservationInbox.count({ where: { connectionId: CONN.A, externalId: "PULL-3" } }), (await rvsOfRef("PULL-3")).length], [1, 1], "pull");
    await push();
    await dirty(UH, [RTA.dlx], W(60), W(61));
    const job = (await jobsOf(CONN.A, "PENDING"))[0];
    ok(job, "ไม่มีงาน");
    const n0 = (await callLogs(CONN.A, /push/i)).length;
    const ps = await Promise.all([push(), push()]);
    ok(ps.every((r) => r?.code !== "THROW"), "push throw");
    eq([(await callLogs(CONN.A, /push/i)).length - n0, (await prisma.channelAriJob.findUnique({ where: { id: job.id } })).status], [1, "SENT"], "push");
  });
  await st("X-5", "X10 PII: inbox.raw เก็บอีเมลแขกได้ (หลักฐาน) แต่ event channel.* ทั้งหมดของร้าน A · AuditLog hotel.*/channel.*/integration ของร้าน A · log ระหว่าง apply/pull ไม่มีอีเมล/เบอร์/ชื่อแขก · listChannelConnections/listNeedsRoom ไม่มี raw", async () => {
    needMaps();
    const evs = (await prisma.outboxEvent.findMany({ where: { tenantId: tA, type: { startsWith: "channel." } } })) as Any[];
    ok(evs.length >= 8, `event channel.* ${evs.length}`);
    for (const e of evs) noPii(e.payload, e.type);
    const au = ((await prisma.auditLog.findMany({ where: { tenantId: tA } })) as Any[]).filter((a) => /^(hotel|channel|settings\.integration)/.test(String(a.action)));
    ok(!au.some((a) => new RegExp(`svc-h10-guest-${RUN}|0891234510`).test(J([a.before, a.after]))), "AuditLog มีอีเมล/เบอร์แขก");
    ok((await prisma.channelReservationInbox.findMany({ where: { connectionId: CONN.A } })).some((r: Any) => J(r.raw).includes(`svc-h10-guest-${RUN}`)), "raw ไม่เก็บหลักฐาน");
    const lines = await captureLogs(async () => {
      await ingest([inb({ ext: "PII-1", room: "SUP", ci: W(44), nights: 1, priceKey: "sup" })]);
      await apply("PII-1", 1);
      await call(() => CH("fakeEnqueueInbound")(CONN.A, [inb({ ext: "PII-2", room: "SUP", ci: W(45), nights: 1, priceKey: "sup" })]));
      await call(() => CH("pullAll")(new Date(), 20_000));
    });
    ok(!lines.some((l) => PII_TEXT.test(l)), `log มี PII: ${lines.find((l) => PII_TEXT.test(l))?.slice(0, 160)}`);
    for (const r of [await call(() => CH("listChannelConnections")(OWNER, ctxA, { unitId: UH })), await call(() => CH("listNeedsRoom")(OWNER, ctxA, { unitId: UH }))]) ok(![...walkKeys(r)].includes("raw") && !new RegExp(`svc-h10-guest-${RUN}`).test(J(r)), "DTO มี raw/อีเมล");
  });
  await st("X-6", "ไม่มีเน็ตจริง (FAKE เท่านั้น): fetch ออกนอกเครื่องระหว่างข้อสอบ = 0", () => {
    needCh();
    eq([...new Set(BLOCKED)], [], "fetch นอกเครื่อง");
  });

  // ═══════════════ U สถิต ═══════════════
  console.log("\n── U สถิต ──");
  await st("U-1", "ไฟล์ §1: hotel/channel/{types,mapping,ari,inbound,index}.ts มีครบ · types.ts pure (ไม่ import prisma/db/server-only · import type ได้) · facade channel ส่งออกครบ 14 ชื่อ · hotel/index.ts re-export (บล็อก SVC H.10)", () => {
    const miss = [F.chTypes, F.chMapping, F.chAri, F.chInbound, F.chIndex].filter((f) => !has(f));
    eq(miss, [], "ไฟล์ขาด");
    const bad = importSpecs(read(F.chTypes)).filter((s) => !s.typeOnly && (/prisma|core\/db|server-only/.test(s.spec) || /^\.\/(mapping|ari|inbound|index)$/.test(s.spec)));
    eq(bad.map((s) => s.spec), [], "types.ts ไม่ pure");
    const NAMES = ["listChannelConnections", "saveRoomMap", "saveRateMap", "saveBuffer", "channelMappingFor", "buildAri", "pushAriJobs", "pullAll", "ingestInbound", "applyInbound", "retryInbound", "rejectInbound", "listNeedsRoom", "fakeEnqueueInbound"];
    eq(NAMES.filter((n) => typeof chL.mod?.[n] !== "function"), [], "channel facade");
    eq(NAMES.filter((n) => n !== "fakeEnqueueInbound" && typeof hotelL.mod?.[n] !== "function"), [], "hotel/index.ts re-export");
    ok(/SVC H\.10/.test(read(F.index)), "hotel/index.ts ไม่มีบล็อก SVC H.10");
  });
  await st("U-2", "types.ts: markupPrice(129,000, {markupBp:1500}) = 148,350 · {0} = 129,000 · {−1000} = 116,100 · {2000} = 154,800 · ariHash คงที่ (เท่ากันเมื่อโคลน · ต่างเมื่อราคาเปลี่ยน 1 สตางค์) · ariHash ไม่ขึ้นกับลำดับคีย์ (MINOR ในข้อนี้รวม)", () => {
    const T = chTypesL.mod;
    ok(T && typeof T.markupPrice === "function" && typeof T.ariHash === "function", `types.ts ${chTypesL.err}`);
    eq([T.markupPrice(129_000, { markupBp: 1_500 }), T.markupPrice(129_000, { markupBp: 0 }), T.markupPrice(129_000, { markupBp: -1_000 }), T.markupPrice(129_000, { markupBp: 2_000 })], [148_350, 129_000, 116_100, 154_800], "markupPrice");
    const p = { byDate: { "2026-11-10": { DLX: { available: 2, stopSell: false, rates: { STD: { priceSatang: 148_350, minNights: null, closedToArrival: false } } } } } };
    const q = JSON.parse(JSON.stringify(p));
    const r = JSON.parse(JSON.stringify(p)); r.byDate["2026-11-10"].DLX.rates.STD.priceSatang = 148_351;
    const reordered = { byDate: { "2026-11-10": { DLX: { rates: { STD: { closedToArrival: false, minNights: null, priceSatang: 148_350 } }, stopSell: false, available: 2 } } } };
    const h = T.ariHash(p);
    ok(typeof h === "string" && h.length >= 16, `hash ${h}`);
    eq([T.ariHash(q) === h, T.ariHash(r) !== h, T.ariHash(reordered) === h], [true, true, true], "ariHash");
  });
  await st("U-3", "ศูนย์เชื่อมต่อ (§1 · §9.11): types.ts ChannelManagerAdapter ไม่มี unknown · import type จาก hotel/channel/types เท่านั้น · registry export readyFor(kind, provider): CHANNEL_MANAGER+FAKE = true · CHANNEL_MANAGER+AGODA = false · fake.ts CHANNEL_MANAGER ไม่ใช่ return [] ล้วน · ไม่เขียน settings/คอลัมน์ใหม่ · integrations/index.ts เพิ่มอย่างเดียว", () => {
    const t = stripComments(read(F.intTypes));
    const block = t.slice(t.indexOf("interface ChannelManagerAdapter"), t.indexOf("}", t.indexOf("interface ChannelManagerAdapter")) + 1);
    ok(block && !/\bunknown\b/.test(block), `ChannelManagerAdapter ยังมี unknown: ${block.replace(/\s+/g, " ").slice(0, 200)}`);
    const imp = importSpecs(t).filter((s) => /hotel/.test(s.spec));
    ok(imp.length >= 1 && imp.every((s) => s.typeOnly && /hotel\/channel\/types$/.test(s.spec)), `import ${J(imp)}`);
    const readyFor = regL.mod?.readyFor;
    ok(typeof readyFor === "function", "registry ยังไม่มี readyFor");
    eq([readyFor("CHANNEL_MANAGER", "FAKE"), readyFor("CHANNEL_MANAGER", "AGODA")], [true, false], "readyFor");
    const fk = stripComments(read(F.intFake));
    const cm = fk.slice(fk.indexOf("CHANNEL_MANAGER: {"), fk.indexOf("METER: {"));
    ok(/pullReservations/.test(cm) && !/pullReservations:\s*async\s*\([^)]*\)\s*=>\s*\{\s*await gate\(opts\);\s*return \[\];\s*\}/.test(cm), "fake pullReservations ยังคืน [] ล้วน");
    ok(!/settings\.fake|fakeLastAri.*settings|publicFields\s*:\s*\{[^}]*fake/.test(fk), "fake เขียน settings");
    eq(removedLines(F.intIndex), [], "integrations/index.ts ลบบรรทัด");
  });
  await st("U-4", "event ใหม่ 8 ตัว ลง 3 ทะเบียน (กติกาเหล็ก 15): consumers มีครบ · AUTOMATION_EVENTS ป้ายไทย · WEBHOOK_EVENTS ครั้งเดียวผ่าน spread (ไม่ประกาศซ้ำใน webhooks/labels.ts) · consumer channel.ari.dirty เรียก onAriDirty (lazy import) · consumer hotel.booking.* ส่ง dirty", () => {
    const cons = consumersL.mod?.consumers;
    ok(cons, `consumers ${consumersL.err}`);
    eq(CH_EVENTS.filter((e) => typeof cons[e] !== "function"), [], "consumer ขาด");
    const auto = (autoL.mod?.AUTOMATION_EVENTS ?? []) as Any[];
    eq(CH_EVENTS.filter((e) => !auto.some((x) => x.value === e && THAI.test(x.label ?? ""))), [], "automation label");
    const wh = (whL.mod?.WEBHOOK_EVENTS ?? []) as Any[];
    eq(CH_EVENTS.filter((e) => wh.filter((x) => x.value === e).length !== 1), [], "webhook");
    ok(!CH_EVENTS.some((e) => stripComments(read(F.whLabels)).includes(`"${e}"`)), "ประกาศซ้ำใน webhooks/labels.ts");
    const src = stripComments(read(F.consumers));
    const i = src.indexOf('"channel.ari.dirty"');
    ok(i >= 0 && /onAriDirty/.test(src.slice(i, i + 500)) && /hotel(\/channel)?["']/.test(src.slice(i, i + 500)), "consumer channel.ari.dirty ไม่เรียก onAriDirty");
    ok(/hotel\.booking\.[\s\S]{0,600}(onAriDirty|emitAriDirty|ariDirty)|(onAriDirty|emitAriDirty|ariDirty)[\s\S]{0,600}hotel\.booking\./.test(src), "hotel.booking.* ไม่ส่ง dirty");
  });
  await st("U-5", "สิทธิ์/actions (§1 · X9): hotel.channel.manage ออกจาก planned · actions.ts \"use server\" มี saveRoomMapAction saveRateMapAction saveBufferAction previewAriAction pullNowAction retryInboundAction rejectInboundAction (export async function) + ตรวจ hotel.channel.manage", () => {
    const src = read(F.perms);
    const hotelBlock = src.slice(src.indexOf('module: "hotel"'), src.indexOf('module: "dorm"'));
    const planned = hotelBlock.slice(hotelBlock.indexOf("planned:"));
    ok(hotelBlock && !/"hotel\.channel\.manage"/.test(planned), "hotel.channel.manage ยังอยู่ใน planned");
    const a = read(F.hotelActions);
    ok(/^\s*["']use server["']/m.test(a), "actions ไม่มี use server");
    const NAMES = ["saveRoomMapAction", "saveRateMapAction", "saveBufferAction", "previewAriAction", "pullNowAction", "retryInboundAction", "rejectInboundAction"];
    eq(NAMES.filter((n) => !new RegExp(`export async function ${n}\\b`).test(a)), [], "actions ขาด");
    ok(/hotel\.channel\.manage/.test(stripComments(a)), "actions ไม่ตรวจ hotel.channel.manage");
  });
  await st("U-6", "จอ §4: หน้า channels · [connectionId] · inbox มี · ตรวจ hotel.channel.manage · คอมโพเนนต์ 7 ตัวใน components/hotel/channel · ข้อความไทย (ต้องจัดห้อง · ลองอีกครั้ง · ปฏิเสธ · ทดสอบส่ง ARI) · data-scroll-hint · 'use client' ไม่ลากถึง prisma/ฝั่งเซิร์ฟเวอร์ · การ์ด OTA ศูนย์เชื่อมต่อมีลิงก์ \"ตั้งค่าแม็ปห้อง/ราคา\" → /hotel/channels", () => {
    eq([F.pageList, F.pageConn, F.pageInbox].filter((f) => !has(f)), [], "หน้า");
    ok([F.pageList, F.pageConn, F.pageInbox].every((f) => /hotel\.channel\.manage|requireChannel|canManageChannel/.test(read(f))), "หน้าไม่ตรวจสิทธิ์");
    const comps = compFiles();
    eq(COMPONENTS.filter((c) => !comps.some((f) => f.endsWith(`/${c}.tsx`))), [], "คอมโพเนนต์");
    const all = [...comps, F.pageList, F.pageConn, F.pageInbox].map(read).join("\n");
    eq(["ต้องจัดห้อง", "ลองอีกครั้ง", "ปฏิเสธ", "ทดสอบส่ง ARI"].filter((w) => !all.includes(w)), [], "ข้อความ");
    ok(/data-scroll-hint/.test(all), "ไม่มี data-scroll-hint");
    const leaks = comps.filter((f) => /^\s*["']use client["']/m.test(read(f))).flatMap((f) => clientReach(f));
    eq(leaks.slice(0, 3), [], "client ลากถึงเซิร์ฟเวอร์");
    const ip = intPageFiles().map(read).join("\n");
    ok(/ตั้งค่าแม็ปห้อง/.test(ip) && /\/hotel\/channels/.test(ip), "การ์ด OTA ไม่มีลิงก์ตั้งค่าแม็ป");
  }, "MAJOR");
  await st("U-7", "เส้นเดียวกันทั้งระบบ (กันจองซ้อน): inbound.ts สร้าง/ยกเลิกผ่าน createBooking/cancelBooking ของ facade (ไม่มี hotelReservation.create/hotelBookingNight.create/claimRoom เอง) · ari.ts ใช้ hotelAvailability (สูตรเดียว) + loadPricingContext/quoteStay (ไม่คิดราคาเอง) · ผ่าน callIntegration (ไม่เรียก adapter ตรง)", () => {
    const ib = stripComments(read(F.chInbound)), ar = stripComments(read(F.chAri));
    ok(ib && ar, "ยังไม่มี inbound.ts/ari.ts");
    const bad: string[] = [];
    if (!/createBooking/.test(ib) || !/cancelBooking/.test(ib)) bad.push("inbound ไม่ใช้ createBooking/cancelBooking");
    if (/hotelReservation\.(create|createMany|update|updateMany)\(|hotelBookingNight\.(create|createMany)\(|claimRoom\(|roomOccupancy\.(create|update)/.test(ib)) bad.push("inbound เขียนการจอง/ห้องเอง");
    if (!/hotelAvailability|availabilityInTx/.test(ar)) bad.push("ari ไม่ใช้ hotelAvailability");
    if (!/quoteStay|resolveNightPrice/.test(ar) || !/loadPricingContext/.test(ar)) bad.push("ari ไม่ใช้ loadPricingContext/quoteStay");
    if (!/callIntegration/.test(ar) || !/callIntegration/.test(ib)) bad.push("ไม่ผ่าน callIntegration");
    if (/\bgetDay\(\)/.test(ar + ib)) bad.push("getDay ดิบ");
    eq(bad, [], "โครง");
  });
  await st("U-8", "§9.6 booking.ts เพิ่มอย่างเดียว (เทียบฐาน BASE_SHA): ไม่มีบรรทัดลบ · มี internal.channel {connectionId, grossSatang, commissionSatang, netSatang, prepaidByChannel} · cancelBooking รับ by CHANNEL + CHANNEL_CANCELLED · export เดิมครบ", () => {
    needCh();
    eq(removedLines(F.booking).slice(0, 5), [], "booking.ts ลบบรรทัด");
    const b = stripComments(read(F.booking));
    ok(/channel\??\s*:\s*\{[\s\S]{0,400}connectionId[\s\S]{0,400}prepaidByChannel/.test(b), "ไม่มี internal.channel");
    ok(/["']CHANNEL["']/.test(b) && /CHANNEL_CANCELLED/.test(b), "ไม่มี by CHANNEL / CHANNEL_CANCELLED");
    eq(["createBooking", "cancelBooking", "confirmBooking", "takeBookingDeposit", "assignRoom", "sweepExpiredHolds", "listBookings", "getBooking"].filter((n) => typeof bookL.mod?.[n] !== "function"), [], "export เดิม");
  });
  await st("U-9", "§9.10 hook ARI: rates.ts/block.ts เพิ่มอย่างเดียว · บรรทัดเพิ่มทุกบรรทัดเกี่ยวกับ emitAriDirty (หรือวงเล็บปิด/คอมเมนต์) · emitAriDirty ใน rates.ts ≥ 9 จุด (saveRates/setOverride/clearOverride/saveRatePlan/archiveRatePlan/saveSeason/archiveSeason/saveHolidays/removeHoliday) · block.ts ≥ 2 จุด", () => {
    needCh();
    const bad: string[] = [];
    for (const [f, min] of [[F.rates, 9], [F.block, 2]] as const) {
      const rm = removedLines(f);
      if (rm.length) bad.push(`${f} ลบ ${rm.length}`);
      const extra = addedLines(f).filter((l) => !/emitAriDirty|ariDirty|SVC H\.10|^\s*\/\/|^\s*[)}\]];?,?\s*$|^\s*\.catch\(/.test(l));
      if (extra.length) bad.push(`${f} เพิ่มนอก hook: ${extra[0].trim().slice(0, 80)}`);
      const n = (stripComments(read(f)).match(/emitAriDirty\s*\(/g) ?? []).length;
      if (n < min) bad.push(`${f} emitAriDirty ${n} จุด (< ${min})`);
    }
    eq(bad, [], "hook");
  });
  await st("U-10", "ค่าตั้ง/ทะเบียนเพิ่มอย่างเดียว: defs/rooms.ts (ariHorizonDays ท้าย · ไม่ลบ) · minute-jobs.ts · outbox-consumers.ts · automation/webhooks labels · hotel/index.ts · actions.ts · registry.ts — ไม่มีบรรทัดลบ · permissions.ts ลบได้เฉพาะ \"hotel.channel.manage\" ใน planned · integrations/types.ts ลบได้เฉพาะใน ChannelManagerAdapter · fake.ts ลบได้เฉพาะบล็อก CHANNEL_MANAGER", () => {
    needCh();
    const bad: string[] = [];
    for (const f of [F.defs, F.minute, F.consumers, F.autoLabels, F.whLabels, F.index, F.hotelActions, F.intRegistry]) { const n = removedLines(f).length; if (n) bad.push(`${f} ลบ ${n}`); }
    const pr = removedLines(F.perms).filter((l) => !/^\-\s*"hotel\.channel\.manage",?\s*$/.test(l));
    if (pr.length) bad.push(`permissions ลบนอกใบ: ${pr[0].slice(0, 80)}`);
    const tr = removedLines(F.intTypes).filter((l) => !/pushAri|pullReservations|ackReservation|^\-\s*test\(opts\?: CallOpts\)/.test(l));
    if (tr.length) bad.push(`integrations/types.ts ลบนอก adapter: ${tr[0].slice(0, 80)}`);
    const fr = removedLines(F.intFake).filter((l) => !/pushAri|pullReservations|ackReservation|_m, _d, _a|_since|_id, opts|await gate\(opts\);|return \[\];|^\-\s*\},?\s*$/.test(l));
    if (fr.length) bad.push(`fake.ts ลบนอกบล็อก: ${fr[0].slice(0, 80)}`);
    eq(bad, [], "ลบบรรทัด");
  });
  await st("U-11", "เอกสาร sds hotel.md มีหัวข้อ OTA (ARI pipeline · inbound state machine RECEIVED/APPLIED/NEEDS_ROOM/REJECTED · prepaid/PLATFORM ส่งต่อ H.5b) · ฉาก svc-qc-hotel-ota-scene.mts มี (SCENE_SUMMARY · --clear · อ่าน SQC_HOTEL_OTA_SCENE)", () => {
    const d = read(F.sds);
    ok(/OTA/.test(d) && /ARI/.test(d) && /NEEDS_ROOM/.test(d) && /prepaid|PLATFORM/i.test(d), "sds ไม่มี §OTA");
    const s = read(F.scene);
    ok(s && /SCENE_SUMMARY/.test(s) && /--clear/.test(s) && /SQC_HOTEL_OTA_SCENE/.test(s), `ฉาก ${F.scene}`);
  }, "MAJOR");

  // ═══════════════ F ไฟล์ที่แตะ (git · ตอนรับใบ) ═══════════════
  console.log("\n── F ไฟล์ที่แตะ (git) ──");
  const dirtyFiles = (paths: string[]) => gitX(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const OWN_RE = new RegExp(`^(${[F.booking, F.index, F.rates, F.block, F.hotelActions, F.intTypes, F.intFake, F.intRegistry, F.intIndex, F.defs, F.perms, F.consumers, F.autoLabels, F.whLabels, F.minute, F.scene, F.probe, F.sds, "scripts/qc-svc-h.10.mts", "ledger/wo-notes/svc-h.10.md"].map(esc).join("|")}|${esc(CH_DIR)}/.+|${esc(F.compDir)}/.+|${esc(PAGES_DIR)}/.+|${esc(F.intPage)}/[^/]+)$`);
  {
    const ch = dirtyFiles(["src", "prisma", "public", "scripts", "docs", "vercel.json"]).filter((f) => f !== "scripts/qc-svc-h.10.mts" && f !== F.probe);
    const headHas = (() => { try { gitX(["cat-file", "-e", `HEAD:${F.chIndex}`]); return true; } catch { return false; } })();
    if (ch.length === 0 && headHas) skip("F-1", "แตะเฉพาะไฟล์ของใบ (§1/§9)", "H.10 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
    else await st("F-1", "แตะเฉพาะไฟล์ของใบ (§1/§9 · git status ตอนรับใบ): hotel/channel/** · booking/index/rates/block/actions ของ hotel · core/integrations types/fake/registry/index · defs/rooms · permissions · 3 ทะเบียน event · minute-jobs · components/hotel/channel/** · หน้า hotel/channels/** · settings/integrations (ลิงก์) · ฉาก · probe · sds — ไม่แตะอื่น", () => {
      ok(ch.length > 0, `ยังไม่มีงาน (git status ว่าง) — ยังไม่มี ${CH_DIR}/*`);
      eq(ch.filter((f) => !OWN_RE.test(f)).slice(0, 10), [], "ไฟล์นอกใบ");
    });
  }
  await st("F-2", "ไม่แตะชิ้นต้องห้าม (§1): prisma/** · modules/pos/** · availability.ts · pricing.ts · core/integrations service/health/secret-box · svc-qc-data.mts · ข้อสอบอื่น — ตรวจเมื่อมีงาน", () => {
    ok(has(F.chIndex), `ยังไม่มี ${F.chIndex} — ตรวจตอนรับใบ`);
    const banned = dirtyFiles(["prisma", "src/lib/modules/pos", F.avail, F.pricing, F.intService, F.intHealth, "src/lib/core/integrations/secret-box.ts", "scripts/svc-qc-data.mts", "scripts/qc-svc-h.3.mts", "scripts/qc-svc-h.1.mts", "scripts/qc-svc-h.8.mts", "scripts/qc-svc-c.3.mts", "scripts/qc-svc-r0.5.mts", "scripts/qc-svc-r0.6.mts"]);
    eq(banned, [], "ไฟล์ต้องห้าม");
    for (const f of [F.avail, F.pricing, F.intService]) { let d = ""; try { d = gitX(["diff", "--stat", BASE_SHA, "--", f]); } catch { /* */ } ok(!d.trim(), `${f} ต่างจากฐาน`); }
  });
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  delete process.env.SVC_QC_CLOCK;
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `svc-h10-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (รวม Channel* 5 · TenantIntegration · IntegrationCallLog · RoomOccupancy · Hotel* · OutboxEvent · AuditLog) · ผู้ใช้ทดสอบ 0 · ไม่มี SVC_QC_CLOCK ค้าง", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: MAIL } } }), 0, "user");
    eq(process.env.SVC_QC_CLOCK ?? null, null, "SVC_QC_CLOCK ค้าง");
  }, "MAJOR");
}

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc (svc-qc-hotel-ota-scene) ──");
{
  let why = "";
  const unitId = SQC_UNITS.hotel.id;
  const CID = OS.connector.id;
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, id: unitId, type: "HOTEL" }, select: { id: true } }) : null;
    if (!t || !u) why = "ร้าน svcqc/หน่วย hotel ยังไม่ seed บนฐานนี้ (scripts/seed-svc-qc.mts)";
    else if (!H0_OK) why = H0_WHY;
    else if (!chL.mod) why = `ยังไม่มี ${CH_DIR}/*`;
    else if (!has(F.sceneH1)) why = `ยังไม่มี ${F.sceneH1}`;
    else if (!has(F.scene)) why = `ยังไม่มี ${F.scene}`;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScript = (rel: string, args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", rel, ...args], { cwd: ROOT, env: { ...process.env, INTEGRATIONS_FAKE: "1" }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string): Any => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const TD = SQC_TODAY_BKK;
  /** ราคา STANDARD ของฉาก h.1 ต่อคืน (ฤดู/วันหยุด/แก้มือวันที่ 14 รวม) — อ่านผ่าน loadPricingContext/quoteStay ของ H.1 (ตัวคิดราคาอิสระทดสอบแล้วในหมวด AR) */
  const scenePrices = async (typeId: string, from: string, toIncl: string): Promise<Record<string, number>> => {
    const plan = await prisma.hotelRatePlan.findFirst({ where: { tenantId: SQC_TENANT.id, unitId, code: "STANDARD" }, select: { id: true } });
    ok(plan, "ฉาก h.1 ไม่มีแผน STANDARD");
    const pc = await hotelL.mod.loadPricingContext({ tenantId: SQC_TENANT.id }, unitId, { from, to: toIncl });
    const q = hotelL.mod.quoteStay({ ...pc, today: TD }, { roomTypeId: typeId, ratePlanId: plan.id, checkIn: from, checkOut: addDays(toIncl, 1), limits: { minNights: null, maxNights: null, closedToArrival: false, maxAdvanceBookingDays: 400 } });
    ok(q?.ok, `quote ฉาก ${q?.error}`);
    return Object.fromEntries(q.nights.map((n: Any) => [n.date, n.priceSatang]));
  };
  const otaRows = () => prisma.hotelReservation.findMany({ where: { tenantId: SQC_TENANT.id, unitId, channelConnectionId: CID }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const counterRows = () => prisma.hotelReservation.findMany({ where: { tenantId: SQC_TENANT.id, unitId, note: { contains: OS.mark } } }) as Promise<Any[]>;
  const otherSig = async () => J([await prisma.hotelReservation.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelReservation.count({ where: { tenantId: SQC_TENANT.id, NOT: { OR: [{ note: { contains: OS.mark } }, { channelConnectionId: CID }] } } }), await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } }), await prisma.hotelRatePlan.count({ where: { tenantId: SQC_TENANT.id, unitId } }), await prisma.tenantIntegration.count({ where: { tenantId: SQC_TENANT.id, NOT: { id: CID } } })]);
  const n1 = `ฉาก ${F.scene}: (ฉาก h.1 ก่อน · --clear h.8/h.5/h.3/h.2 ถ้ามี · h.10 --clear) รัน exit 0 · SCENE_SUMMARY · ตัวต่อ ${CID} CHANNEL_MANAGER/FAKE CONNECTED หน่วย hotel · แม็ป DLX/SUP · STD markup 1,500 · buffer ดีลักซ์ 1 · inbox APPLIED 2 REJECTED 1 NEEDS_ROOM 1 · การจอง OTA 2 (active 1 = OTA-1001 W+4 prepaid gross/comm/net) · เคาน์เตอร์ซูพีเรีย 4 ห้อง W+5 (mark) · งาน ARI ≥ 1 ครอบวันนี้→+6 · ร้านอื่น/แถวนอกฉากไม่เปลี่ยน`;
  const n2 = "buildAri(ตัวต่อฉาก, วันนี้, +6) หลังฉาก ⇒ ห้อง DLX/SUP เท่านั้น · DLX วัน 0 available 6 (7 − buffer 1) · ราคา STD = STANDARD ฉาก h.1 (quoteStay · ฤดู/แก้มือรวม) × 1.15 · SUP วัน +5 available 0 stopSell";
  const n3 = "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0 · แถว/สถานะเท่าเดิม";
  const n4 = "--clear ลบเฉพาะของฉาก (ตัวต่อฉาก + Channel* ของตัวต่อ + inbox + การจอง OTA ของตัวต่อ + เคาน์เตอร์ mark · occupancy ไม่ active) · ร้านอื่น/ห้อง/แผน/ตัวต่ออื่นคงเดิม · รันคืน";
  if (why) { for (const [id, n] of [["Q-1", n1], ["Q-2", n2], ["Q-3", n3], ["Q-4", n4]]) skip(id, n, why, "MAJOR"); }
  else {
    await st("Q-1", n1, async () => {
      ok(runScript(F.sceneH1).status === 0, "ฉาก h.1 ล้ม");
      for (const s of [F.sceneH8, F.sceneH5, F.sceneH3, F.sceneH2]) if (has(s)) runScript(s, ["--clear"]);
      runScript(F.scene, ["--clear"]);
      const o0 = await otherSig();
      const a = runScript(F.scene);
      const sm = summary(`${a.stdout}`);
      ok(a.status === 0 && sm && ["created", "updated", "removed"].every((k) => typeof sm[k] === "number"), `exit=${a.status} ${sm ? fmt(sm) : `${a.stdout}${a.stderr}`.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
      const c = await prisma.tenantIntegration.findUnique({ where: { id: CID } });
      eq([c?.kind, c?.provider, c?.status, J(c?.unitIds)], ["CHANNEL_MANAGER", "FAKE", "CONNECTED", J([unitId])], "ตัวต่อ");
      const maps = (await prisma.channelRoomMap.findMany({ where: { connectionId: CID, active: true } })) as Any[];
      eq(maps.map((m) => [m.roomTypeId, m.externalRoomId]).sort(), [[SQC_HOTEL_TYPES.deluxe.id, "DLX"], [SQC_HOTEL_TYPES.superior.id, "SUP"]].sort(), "แม็ปห้อง");
      const rm = (await prisma.channelRateMap.findMany({ where: { connectionId: CID }, include: { ratePlan: { select: { code: true } } } })) as Any[];
      eq(rm.map((r) => [r.ratePlan.code, r.externalRateId, r.formula?.markupBp]), [["STANDARD", "STD", 1_500]], "แม็ปแผน");
      eq(((await prisma.channelInventoryBuffer.findMany({ where: { connectionId: CID } })) as Any[]).filter((b) => b.rooms > 0).map((b) => [b.roomTypeId, b.rooms]), [[SQC_HOTEL_TYPES.deluxe.id, 1]], "buffer");
      const ib = (await prisma.channelReservationInbox.findMany({ where: { connectionId: CID } })) as Any[];
      const by = (s: string) => ib.filter((x) => x.status === s).length;
      eq([ib.length, by("APPLIED"), by("REJECTED"), by("NEEDS_ROOM")], [4, OS.expect.inboxApplied, OS.expect.inboxRejected, OS.expect.inboxNeedsRoom], "inbox");
      const ota = await otaRows();
      const act = ota.filter((r) => r.status === "CONFIRMED");
      const v2 = OS.inbound[3];
      const pr = await scenePrices(SQC_HOTEL_TYPES.deluxe.id, sqcAddDays(TD, v2.checkInOffset), sqcAddDays(TD, v2.checkInOffset + v2.nights - 1));
      const gross = sum(Object.values(pr).map((p) => refMarkup(p, 1_500)));
      eq([ota.length, act.length, act[0]?.channelRef, ymdOfDb(act[0]?.checkInDate), act[0]?.prepaidByChannel, act[0]?.grossSatang, act[0]?.commissionSatang, act[0]?.netSatang], [OS.expect.reservationsFromOta, OS.expect.activeOtaReservations, "OTA-1001", sqcAddDays(TD, 4), true, gross, refCommission(gross, 1_500), gross - refCommission(gross, 1_500)], "การจอง OTA (gross = Σ STANDARD ฉาก × 1.15)");
      const cr = await counterRows();
      eq([cr.length, cr.every((r) => r.roomTypeId === SQC_HOTEL_TYPES.superior.id && ymdOfDb(r.checkInDate) === sqcAddDays(TD, 5) && r.status === "CONFIRMED")], [4, true], "เคาน์เตอร์");
      const jobs = (await prisma.channelAriJob.findMany({ where: { connectionId: CID } })) as Any[];
      ok(jobs.length >= OS.ari.expectJobs && jobs.some((j) => ymdOfDb(j.dateFrom)! <= TD && sqcAddDays(TD, 6) <= ymdOfDb(j.dateTo)!), `งาน ARI ${J(jobs.map((j) => [ymdOfDb(j.dateFrom), ymdOfDb(j.dateTo), j.status]))}`);
      eq(await otherSig(), o0, "ร้านอื่น/แถวนอกฉากเปลี่ยน");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const a = ariOf(await call(() => chL.mod.buildAri(CID, TD, sqcAddDays(TD, 6))));
      ok(a, "buildAri ฉาก");
      eq(Object.keys(a.byDate).length, OS.ari.days, "วัน");
      ok(Object.values(a.byDate).every((d: Any) => J(Object.keys(d).sort()) === J([...OS.ari.mappedTypes])), "ห้องที่ส่ง");
      eq(a.byDate[TD].DLX.available, OS.expect.deluxeAriAvailableOffset0, "DLX วัน 0");
      const P = { DLX: await scenePrices(SQC_HOTEL_TYPES.deluxe.id, TD, sqcAddDays(TD, 6)), SUP: await scenePrices(SQC_HOTEL_TYPES.superior.id, TD, sqcAddDays(TD, 6)) } as Record<string, Record<string, number>>;
      const bad = datesIncl(TD, sqcAddDays(TD, 6)).flatMap((d) => ["DLX", "SUP"].filter((e) => a.byDate[d][e].rates?.STD?.priceSatang !== refMarkup(P[e][d], 1_500)).map((e) => `${d} ${e} ${a.byDate[d][e].rates?.STD?.priceSatang}≠${refMarkup(P[e][d], 1_500)}`));
      eq(bad.slice(0, 4), [], "ราคา STD = STANDARD ฉาก × 1.15");
      eq([a.byDate[sqcAddDays(TD, 5)].SUP.available, a.byDate[sqcAddDays(TD, 5)].SUP.stopSell], [0, true], "SUP วัน +5");
    }, "MAJOR");
    await st("Q-3", n3, async () => {
      const s0 = J((await otaRows()).map((r) => [r.id, r.status])) + J((await counterRows()).map((r) => [r.id, r.status]).sort());
      const b = runScript(F.scene);
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      eq(J((await otaRows()).map((r) => [r.id, r.status])) + J((await counterRows()).map((r) => [r.id, r.status]).sort()), s0, "เปลี่ยน");
    }, "MAJOR");
    await st("Q-4", n4, async () => {
      const o0 = await otherSig();
      const idsBefore = [...(await otaRows()), ...(await counterRows())].map((r) => r.id);
      const cl = runScript(F.scene, ["--clear"]);
      ok(cl.status === 0, `--clear exit=${cl.status}`);
      eq([(await otaRows()).length, (await counterRows()).length, await prisma.channelRoomMap.count({ where: { connectionId: CID } }), await prisma.channelReservationInbox.count({ where: { connectionId: CID } }), await prisma.channelAriJob.count({ where: { connectionId: CID } }), await prisma.tenantIntegration.count({ where: { id: CID } })], [0, 0, 0, 0, 0, 0], "ของฉากค้าง");
      eq(await prisma.roomOccupancy.count({ where: { refType: "HotelReservation", refId: { in: idsBefore }, active: true } }), 0, "occupancy ค้าง");
      eq(await otherSig(), o0, "ลบเกิน");
      const back = runScript(F.scene);
      ok(back.status === 0 && (await otaRows()).length === OS.expect.reservationsFromOta, "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  for (const [id, user] of [["V-1", "owner"], ["V-2", "manager"]] as const) {
    const name = `visual-svc h.10 --user ${user} · 3 ใบ (hotel-channels · hotel-channels-inbox · integrations-ota) × 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน — ผู้คุมตรวจ PARITY ภาพ 11 การ์ด OTA`;
    if (!base) { skip(id, name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก h.1 + h.10 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR"); continue; }
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.10", "--user", user, "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const bad = r.status !== 0 ? `exit=${r.status} ${`${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}` : "";
    record(id, name, bad ? "FAIL" : "PASS", bad, "MAJOR");
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
  { s: "qc-svc-h.3", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (booking.ts เพิ่ม internal.channel/by CHANNEL อย่างเดียว)" },
  { s: "qc-svc-h.1", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (hook emitAriDirty ใน rates.ts)" },
  { s: "qc-svc-h.0", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (defs ariHorizonDays)" },
  { s: "qc-svc-h.2", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (hook ใน block.ts)" },
  { s: "qc-svc-h.5", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.5", judge: judgeNoFail, note: "ศูนย์เชื่อมต่อ · FAKE ยังผ่าน" },
  { s: "qc-svc-r0.6", judge: judgeNoFail, note: "ศูนย์เชื่อมต่อ · FAKE ยังผ่าน" },
  { s: "qc-svc-r0.8", judge: judgeNoFail, note: "แกนห้อง" },
  { s: "qc-svc-r0.4", judge: judgeNoFail, note: "ค่าตั้ง (คีย์ใหม่)" },
  { s: "qc-svc-c.3", args: ["--no-regression"], judge: judgeNoFail, note: "สุขภาพตัวต่อ · call log ร่วม" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "สิทธิ์ (planned)" },
  { s: "qc-svc-smoke" },
  { s: "qc-svc-b.0", judge: judgeNoFail, note: "ทะเบียน event ไม่มี FAIL" },
];
{
  const hasWork = typeof chL.mod?.applyInbound === "function" && typeof chL.mod?.buildAri === "function";
  const why = !hasWork ? `ยังไม่มีงานของใบ (${CH_DIR} applyInbound/buildAri) — regression รันเมื่อมีงาน` : NO_REG ? "--no-regression / SVC_H10_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-h10-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

globalThis.fetch = REAL_FETCH;
try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const byGroup: Record<string, { total: number; passed: number; failed: number; skipped: number }> = {};
for (const c of cks) { const g = (byGroup[groupOf(c.id)] ??= { total: 0, passed: 0, failed: 0, skipped: 0 }); g.total++; if (c.res === "PASS") g.passed++; else if (c.res === "FAIL") g.failed++; else g.skipped++; }
console.log(`\n===== QC SVC H.10 · โครงช่องทาง OTA (channel manager) =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`กลุ่ม: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.passed}/${v.total}${v.skipped ? ` (skip ${v.skipped})` : ""}`).join(" · ")}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id), byGroup })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-* ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed/ยังไม่มีฉาก · MN-4 ไม่มี reports.ts (H.7) · F-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
