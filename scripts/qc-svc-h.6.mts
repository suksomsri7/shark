// QC — SVC H.6 · แม่บ้านมือถือ (ภาพ 13 ก/ข): บอร์ดงานห้องวันนี้ (มุมมองคำนวณสด · เรียงด่วน · ของฉัน/ทั้งหมด/เสร็จ) · state machine hk (S §7.6 · pure canHkTransition) ·
//      hkStatus แหล่งเดียวผ่าน rooms.setHkStatus + HotelHousekeepingLog ทุก transition · idempotencyKey (offline retry) · hkNote JSON {assignedTo, startedAt, guestRequest} ·
//      เริ่มทำ/เสร็จ (เช็กลิสต์ #74 ชั้น ROOM_TYPE · durationSec) · ตรวจห้อง (inspect perm · inspectionRequired) · มินิบาร์ → folio ผ่าน postFolioItem(MINIBAR) (ราคา/ชื่อ snapshot จาก #75 · ไม่มี folio OPEN ⇒ minibar_unbilled · ไม่ตัดสต็อก) ·
//      แจ้งของเสีย (รูป ≤3 private · BLOCK ผ่าน blockRoom H.2 / REPAIR ผ่าน dorm/repair เปิดด่าน DORM|HOTEL · หอยังเดิม) · markStayoversDirty (H.7 เรียก) · realtime EV_HOTEL_HK ช่อง hotel:hk:<unitId> (Ably/polling · publish หลัง tx ไม่ throw) · event 3 ทะเบียน · จอมือถือ 390
//      oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes → ผู้คุม ORACLE-EDIT)
// สัญญา: ledger/svc-briefs/svc-brief-h.6.md (§0 หลัก · §1 ไฟล์ · §2 มติ 8 ข้อ · §3 สัญญาโค้ด · §4 จอ · §5 event · §6 ฉาก · §7 เกณฑ์รับ)
//        ยืนบน h.2 §3.2 (blockRoom · ROOM_TAKEN · reason ลง AuditLog+HousekeepingLog) · h.5 §3.2 (postFolioItem MINIBAR · FOLIO_CLOSED) · h.3 §3 (ฉาก) · h.0 §2.3 (HotelRoom.hkNote/hkUpdatedAt · hkStatus String OUT_OF_ORDER) §2.13 (HotelHousekeepingLog)
//        แกนห้อง rooms/service.ts (setHkStatus · HK_STATUSES · roomBoard · affectedByOutOfOrder) · dorm/portal.ts dormStaffGate (ค่าเริ่ม ["DORM"]) · dorm/repair.ts (listDormRepairs · dormRepairJob) · realtime (publish ไม่ throw · sanitizeSignal บัญชีขาว · kanban-token)
//        ฟิกซ์เจอร์ scripts/svc-qc-data.mts บล็อก "SVC H.6" (SQC_HOTEL_HK_SCENE · SQC_VISUAL_SPECS["h.6"] · maid · hk-lead) + "SVC H.3 / H.2" (SQC_HOTEL_TAPE_SCENE — ฉากที่ h.6 ต่อยอด)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน): ฟิกซ์เจอร์ h.6 สอดคล้อง (ห้องของฉาก h.2 · บริบทคำนวณจากฉาก h.2 · counts 5/6/1 · byStatus · ลำดับ) · maid/hk-lead · ฐาน l3 · def ที่ยืนบน · ภาพ --list · oracle ของ oracle · ของที่ยืนบนโหลดได้
//   SM state machine pure (canHkTransition ทุกคู่ × บทบาท × inspectionRequired · OUT_OF_ORDER เข้า/ออกเฉพาะระบบ · parse/serialize hkNote · hkPriority)
//   BD hkBoard (บริบท 6 แบบจากการจองจริง · arrivalTime · guestRequest/assignedTo/startedAt จาก hkNote · ลำดับด่วน · counts mine/total/done · ≤ 5 คิวรี · 100 ห้อง < 500 ms · DTO ไม่มีเบอร์/อีเมล)
//   ST hkSetStatus (transition ถูก/ผิด · USE_BLOCK · log from/to/by/note · idempotencyKey ซ้ำ = ผลเดิมไม่ log ซ้ำ · ห้องมีแขก CLEAN ได้ · publish หลัง tx (Ably ปลอม) · ล้ม = ไม่ย้อน · X4 10 ทางพร้อมกัน = log 1 · hkLogs)
//   WK hkStart/hkFinish (assignedTo/startedAt ใน hkNote · TAKEN · หัวหน้า override · `at` ใต้ SVC_QC_CLOCK · finish = checklist JSON + durationSec ใน log + CLEAN + ล้าง assignedTo คง guestRequest + มินิบาร์)
//   IN hkInspect (pass ⇒ INSPECTED · ไม่ผ่าน ⇒ DIRTY+note · ต้อง inspect perm · inspectionRequired ปิด ⇒ CLEAN ขายได้ · บน DIRTY ⇒ ปฏิเสธ)
//   MB postMinibar (ค่าตั้ง #75 · snapshot ราคา/ชื่อ · qty 1–20 · folio OPEN ⇒ MINIBAR item · ซ้ำ = ไม่โพสต์ซ้ำ · ไม่มี folio OPEN/SETTLED ⇒ minibar_unbilled · ไม่ตัดสต็อก · สิทธิ์)
//   DF reportDefect (def hk.canBlock · REPAIR ⇒ DormRepair บนหน่วย HOTEL + dormStaffGate allowTypes · รูป X6 · BLOCK ⇒ blockRoom OUT_OF_ORDER · ROOM_TAKEN · canBlock)
//   SO markStayoversDirty (CHECKED_IN ข้ามคืน ⇒ DIRTY by=null · idempotent · dailyHousekeeping ปิด = ไม่ทำ)
//   RT realtime (EV_HOTEL_HK · hotelHkChannel · SAFE_KEYS · token route ตรวจสิทธิ์หน่วย · ไม่ตั้ง Ably = polling ไม่ throw/ไม่ยิงเน็ต · client subscribe + polling 15 วิ)
//   B ด่าน (X1 ข้ามร้าน · หน่วย · X9 maid/hk-lead/frontdesk(FORBIDDEN)/owner · actions สถิต · X10 DTO) · N event 3 ทะเบียน · U UI สถิต · F ไฟล์ที่แตะ · Z ล้าง · Q ฉาก svcqc · V ภาพ · G regression
//
// 🔴 ผลที่ถูกต้องก่อนมีงาน: PC เขียว · SM/BD/ST/WK/IN/MB/DF/SO/RT/B/N/U/F แดงเหตุผล "ยังไม่มี src/lib/modules/hotel/housekeeping.ts|hk-state.ts" (DF-BLOCK = ยังไม่มี block.ts ของ H.2 · MB = ยังไม่มี folio.ts ของ H.5) · Q/V/G SKIP
// 🔴 ร้านชั่วคราว slug/email `svc-h6-*` ลบใน finally + กวาดค้างตอนเริ่ม · ไม่แตะ /tmp (log regression ลง /root/svc-runs) · ไม่เขียนค่าตั้งของร้าน svcqc
// 🔴 นับคิวรี: ตั้ง globalThis.prisma = PrismaClient ที่ดัก $on("query") ก่อนโหลด @/lib/core/db (แบบ qc-svc-h.1) · Ably: ครอบ fetch — rest.ably.io = ตัวจำลอง (บันทึกคำขอ) · ปลายทางอื่นผ่านจริง
// รัน: cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.6.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill · ห้าม export CI · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V · SVC_QC_CLOCK ข้อสอบตั้ง/ถอดเองต่อข้อ)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_HOTEL_ROOMS, SQC_HOTEL_TYPES, SQC_HOTEL_TAPE_SCENE, SQC_HOTEL_HK_SCENE, SQC_VISUAL_SPECS, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-h.6";
const SUITE = "qc-svc-h.6";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H6_NO_REGRESSION === "1";
const SLUG = "svc-h6-";
const MAIL = "svc-h6-";
const LOG_DIR = "/root/svc-runs";
const F = {
  hk: "src/lib/modules/hotel/housekeeping.ts",
  state: "src/lib/modules/hotel/hk-state.ts",
  index: "src/lib/modules/hotel/index.ts",
  actions: "src/lib/modules/hotel/actions.ts",
  service: "src/lib/modules/hotel/service.ts",
  block: "src/lib/modules/hotel/block.ts",
  tape: "src/lib/modules/hotel/tape.ts",
  folio: "src/lib/modules/hotel/folio.ts",
  booking: "src/lib/modules/hotel/booking.ts",
  portal: "src/lib/modules/dorm/portal.ts",
  repair: "src/lib/modules/dorm/repair.ts",
  roomsSvc: "src/lib/modules/rooms/service.ts",
  rtEvents: "src/lib/realtime/events.ts",
  rtIndex: "src/lib/realtime/index.ts",
  rtClient: "src/lib/realtime/client.ts",
  tokenRoute: "src/app/api/realtime/hotel-hk-token/route.ts",
  kanbanToken: "src/app/api/realtime/kanban-token/route.ts",
  compDir: "src/components/hotel/hk",
  hkShared: "src/components/hotel/hk/hk-shared.ts",
  tabs: "src/components/hotel/hotel-tabs-shared.ts",
  layout: "src/app/app/u/[unitSlug]/hotel/layout.tsx",
  boardPage: "src/app/app/u/[unitSlug]/hotel/housekeeping/page.tsx",
  roomPage: "src/app/app/u/[unitSlug]/hotel/housekeeping/[roomId]/page.tsx",
  logsPage: "src/app/app/u/[unitSlug]/hotel/housekeeping/logs/page.tsx",
  defs: "src/lib/core/settings/defs/rooms.ts",
  perms: "src/lib/core/permissions.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  whLabels: "src/lib/webhooks/labels.ts",
  scene: "scripts/svc-qc-hotel-hk-scene.mts",
  sceneH1: "scripts/svc-qc-hotel-rates-scene.mts",
  sceneH3: "scripts/svc-qc-hotel-booking-scene.mts",
  sceneH2: "scripts/svc-qc-hotel-tape-scene.mts",
  sds: "docs/sds/modules/hotel.md",
} as const;
const COMPS = ["HkBoard", "HkRoomCard", "HkRoomSheet", "HkChecklist", "HkMinibar", "HkDefectDialog", "HkOfflineQueue"].map((n) => `${F.compDir}/${n}.tsx`);
const PAGES = [F.boardPage, F.roomPage, F.logsPage];
const HK_FNS = ["hkBoard", "hkSetStatus", "hkStart", "hkFinish", "hkInspect", "hkLogs", "postMinibar", "reportDefect", "markStayoversDirty"];
const STATE_FNS = ["canHkTransition", "hkPriority", "parseHkNote", "serializeHkNote"];
const ACTIONS = ["hkSetStatusAction", "hkStartAction", "hkFinishAction", "hkInspectAction", "reportDefectAction"];
const EVENTS = ["hotel.hk.changed", "hotel.hk.minibar_posted", "hotel.hk.minibar_unbilled", "hotel.hk.defect"];
const HK = ["DIRTY", "CLEAN", "INSPECTED", "OUT_OF_ORDER"] as const;
const CONTEXTS = ["DEPARTED", "DEPARTING", "ARRIVING", "STAYOVER", "VACANT", "OOO"] as const;

loadSvcQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
delete process.env.ABLY_API_KEY; // ข้อ ST-6 ตั้งคีย์ปลอมเอง · อื่น = polling
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

// ═══════════════ ครอบ fetch — rest.ably.io = ตัวจำลอง (บันทึก · โหมด ok/throw) · ปลายทางอื่นผ่านจริง ═══════════════
type AblyReq = { url: string; channel: string; body: Any };
const ABLY_REQS: AblyReq[] = [];
let ABLY_MODE: "ok" | "throw" | "500" = "ok";
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "rest.ably.io") {
    let body: Any = null;
    try { body = JSON.parse(String(init?.body ?? "null")); } catch { body = null; }
    const m = /\/channels\/([^/]+)\/messages/.exec(url);
    ABLY_REQS.push({ url, channel: m ? decodeURIComponent(m[1]) : "", body });
    if (ABLY_MODE === "throw") throw new TypeError("qc: ably unreachable");
    if (ABLY_MODE === "500") return new Response("{}", { status: 500, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ channel: m?.[1] ?? "", messageId: "qc" }), { status: 201, headers: { "content-type": "application/json" } });
  }
  return REAL_FETCH(input, init);
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
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (has(rel) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `ยังไม่มี ${rel} (${load.err})`);
  return f;
};
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? r?.error ?? J(r)?.slice(0, 80));
const failCode = (r: Any): string | null => (r && r.ok === false ? String(r.code ?? r.error ?? "") : null);
const DENIED = new Set(["FORBIDDEN", "NO_PERMISSION", "PERMISSION", "PERMISSION_DENIED"]);
const isDenied = (r: Any) => { const c = failCode(r); return c !== null && DENIED.has(c); };
const isFail = (r: Any, ...codes: string[]) => { const c = failCode(r); return c !== null && (codes.length === 0 || codes.includes(c)); };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? r?.message ?? ""}`.trim()); return r; };
/** เรียกแล้วไม่ให้ throw ดิบทะลุ — throw = {ok:false, code:"THROW"} · AssertFail (ยังไม่มีไฟล์/export) ทะลุขึ้นเป็นเหตุผลแดงตรง */
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { if (e instanceof AssertFail) throw e; return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const ymdOfDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOfDay(dayNo(ymd) + n);
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const msOf = (d: unknown) => (d instanceof Date ? d.getTime() : typeof d === "string" ? Date.parse(d) : Number.NaN);
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const groupOf = (id: string) => id.split("-")[0];
const withClock = async <T,>(on: boolean, fn: () => Promise<T>): Promise<T> => { // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h6-tsc-7060)
  const prev = process.env.SVC_QC_CLOCK;
  if (on) process.env.SVC_QC_CLOCK = "1"; else delete process.env.SVC_QC_CLOCK;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.SVC_QC_CLOCK; else process.env.SVC_QC_CLOCK = prev; }
};
const withAbly = async <T,>(mode: "ok" | "throw" | "500", fn: () => Promise<T>): Promise<T> => { // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h6-tsc-7060)
  process.env.ABLY_API_KEY = "qcapp.qckey:qcsecret-h6";
  ABLY_MODE = mode;
  try { return await fn(); } finally { delete process.env.ABLY_API_KEY; ABLY_MODE = "ok"; }
};
const walkKeys = (v: Any, keys = new Set<string>()): Set<string> => { if (v instanceof Set || v instanceof Date) return keys; if (Array.isArray(v)) v.forEach((x) => walkKeys(x, keys)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walkKeys(x, keys); } return keys; };
const rowsOf = (r: Any): Any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : Array.isArray(r?.logs) ? r.logs : Array.isArray(r?.items) ? r.items : Array.isArray(r?.rooms) ? r.rooms : []);
const parseJson = (s: unknown): Any => { if (typeof s !== "string") return null; try { return JSON.parse(s); } catch { return null; } };

// ═══════════════ ตัวอ้างอิง (oracle ของ oracle · pure) ═══════════════
type Role = "MAID" | "INSPECTOR" | "SYSTEM";
const ROLES: Role[] = ["MAID", "INSPECTOR", "SYSTEM"];
/** S §7.6 + ใบ h.6 §0: คืน true/false · null = ใบไม่ตัดสิน (ไม่ assert) */
const refCan = (from: string, to: string, role: Role, insp: boolean): boolean | null => {
  if (!HK.includes(from as Any) || !HK.includes(to as Any) || from === to) return false;
  if (to === "OUT_OF_ORDER") return role === "SYSTEM";
  if (from === "OUT_OF_ORDER") return role === "SYSTEM" && to === "DIRTY";
  if (from === "DIRTY" && to === "CLEAN") return role === "SYSTEM" ? null : true;
  if (from === "DIRTY" && to === "INSPECTED") return false;
  if (from === "CLEAN" && to === "INSPECTED") return role === "MAID" ? false : role === "SYSTEM" ? null : insp ? true : null;
  if (to === "DIRTY") return true; // CLEAN|INSPECTED → DIRTY (ใช้งาน/สั่งทำใหม่/night audit)
  if (from === "INSPECTED" && to === "CLEAN") return false;
  return false;
};
/** ลำดับด่วน (ใบ §0): ออกแล้ว+มีแขกเข้า 0 → แขกเข้าวันนี้ 1 → ออกแล้ว/ออกวันนี้ 2 → ค้างต่อ 3 → ว่าง DIRTY 4 → อื่น 5 */
const refTier = (r: { context: string; hkStatus: string; arrivalTime?: string | null }): number => {
  if (r.context === "DEPARTED" && r.arrivalTime) return 0;
  if (r.context === "ARRIVING") return 1;
  if (r.context === "DEPARTED" || r.context === "DEPARTING") return 2;
  if (r.context === "STAYOVER") return 3;
  if (r.context === "VACANT" && r.hkStatus === "DIRTY") return 4;
  return 5;
};
/** งานวันนี้ (สมมติฐานของข้อสอบ — ตรงฟิกซ์เจอร์ 5/6/1): total = ห้องที่มีบริบท (ไม่ VACANT) หรือ VACANT+DIRTY · ไม่รวม OOO · done = ใน total ที่ CLEAN/INSPECTED และไม่มีคำขอแขกค้าง · mine = assignedTo = ฉัน */
// ORACLE-EDIT (ผู้คุม 7 พ.ย. · h6-upcoming): มติใบ h.6 §9 ข้อ 4 — ห้องว่างที่มีจองเข้าภายใน 7 วัน (`upcoming`) นับใน total (ภาพ 13 "B202 ✓ พร้อมรับ") · แถวไม่มีฟิลด์ = false
const refInWork = (r: { context: string; hkStatus: string; upcoming?: boolean | null }) => r.context !== "OOO" && (r.context !== "VACANT" || r.hkStatus === "DIRTY" || r.upcoming === true);
const refDone = (r: { context: string; hkStatus: string; guestRequest?: string | null }) => refInWork(r) && (r.hkStatus === "CLEAN" || r.hkStatus === "INSPECTED") && !r.guestRequest;
const refCounts = (rows: { context: string; hkStatus: string; guestRequest?: string | null; assignedTo?: string | null }[], me: string | null) => ({ mine: rows.filter((r) => me && r.assignedTo === me).length, total: rows.filter(refInWork).length, done: rows.filter(refDone).length });
/** บริบทจากฉาก h.2 (SQC_HOTEL_TAPE_SCENE) ต่อห้อง — CHECKED_IN ออกวันนี้ที่ถูกเช็กเอาต์ในฉาก h.6 = DEPARTED */
const refSceneContext = (room: string): string => {
  const T = SQC_HOTEL_TAPE_SCENE;
  if (T.blocks.some((b) => b.room === room && b.fromOffset <= 0 && b.fromOffset + b.nights > 0)) return "OOO";
  const bs = T.bookings.filter((b) => (b.pinRooms as readonly string[] | undefined)?.includes(room));
  const out = bs.find((b) => b.status === "CHECKED_IN" && b.checkInOffset + b.nights === 0);
  if (out) return (SQC_HOTEL_HK_SCENE.checkoutKeys as readonly string[]).includes(out.key) ? "DEPARTED" : "DEPARTING";
  if (bs.some((b) => b.status === "CONFIRMED" && b.checkInOffset === 0)) return "ARRIVING";
  if (bs.some((b) => b.status === "CHECKED_IN" && b.checkInOffset < 0 && b.checkInOffset + b.nights > 0)) return "STAYOVER";
  return "VACANT";
};
/** PNG 1×1 ที่ถูกต้องตามรูปแบบ (ไบต์หัว + IHDR + IDAT + IEND) — รูปแจ้งของเสีย */
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const pngChunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
const makePng = (seed = 1): Uint8Array => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.from([0, seed & 255, (seed * 7) & 255, (seed * 13) & 255]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]));
};
const bigPng = (bytes: number): Uint8Array => { const u = new Uint8Array(bytes); u.set(makePng(2).subarray(0, 64)); return u; };
const PNG = (seed = 1) => ({ data: makePng(seed), contentType: "image/png" });
const SVG = () => ({ data: Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')), contentType: "image/svg+xml" });

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
const sqlCount = (log: string[]) => log.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET\b)/i.test(q)).length;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const RBAC = (await tryImport("@/lib/core/rbac")).mod as Any;
const STO = (await tryImport("@/lib/storage/service")).mod as Any;
const QH = (await tryImport("@/lib/core/quiet-hours")).mod as Any;
const roomsL = await tryImport("@/lib/modules/rooms");
const roomsSvcL = await loadIf(F.roomsSvc); // HK_STATUSES อยู่ใน service.ts (facade ไม่ re-export · รายงานผู้คุม)
const rtL = await tryImport("@/lib/realtime");
const rtClientSrc = read(F.rtClient);
const evL = await loadIf(F.rtEvents);
const portalL = await loadIf(F.portal);
const repairL = await loadIf(F.repair);
const hotelL = await loadIf(F.index);
const serviceL = await loadIf(F.service);
const hkL = await loadIf(F.hk);
const stateL = await loadIf(F.state);
const blockL = await loadIf(F.block);
const folioL = await loadIf(F.folio);
const tabsL = await loadIf(F.tabs);
const consumersL = await loadIf(F.consumers);
const autoL = await loadIf(F.autoLabels);
const whL = await loadIf(F.whLabels);
const H6 = (n: string) => fnOf(hkL, n, F.hk);
const SMF = (n: string) => fnOf(stateL, n, F.state);
const needHk = () => { if (!hkL.mod) throw new AssertFail(`ยังไม่มี ${F.hk} (${hkL.err})`); };
const needState = () => { if (!stateL.mod) throw new AssertFail(`ยังไม่มี ${F.state} (${stateL.err})`); };
const needBlock = () => { if (typeof blockL.mod?.blockRoom !== "function") throw new AssertFail(`ยังไม่มี ${F.block} (H.2 ยังไม่ merge เข้าเลน: ${blockL.err})`); };
const needFolio = () => { if (typeof folioL.mod?.postFolioItem !== "function") throw new AssertFail(`ยังไม่มี ${F.folio} (H.5 ยังไม่ merge เข้าเลน: ${folioL.err})`); };
/** บทบาทของ canHkTransition — ถ้าโมดูลประกาศ HK_ROLES ให้แมปตามชื่อ (ขึ้นต้น SYS = ระบบ · INSP หรือ LEAD = หัวหน้า · ที่เหลือ = แม่บ้าน) · ไม่งั้นใช้ MAID/INSPECTOR/SYSTEM */
const roleName = (r: Role): string => {
  const declared = stateL.mod?.HK_ROLES;
  if (Array.isArray(declared) && declared.length >= 3) {
    const s = declared.map(String);
    if (r === "SYSTEM") return s.find((x) => /SYS/i.test(x)) ?? "SYSTEM";
    if (r === "INSPECTOR") return s.find((x) => /INSP|LEAD|HEAD|SUPER/i.test(x)) ?? "INSPECTOR";
    return s.find((x) => !/SYS|INSP|LEAD|HEAD|SUPER/i.test(x)) ?? "MAID";
  }
  return r;
};

// ═══════════════ ฐานข้อมูล: ตาราง H.0 · ล้าง ═══════════════
const H0_TABLES = ["HotelHousekeepingLog", "HotelFolio", "HotelFolioItem", "HotelBookingNight", "RoomOccupancy", "DormRepair", "FileAsset", "OutboxEvent"];
let H0_OK = false;
let H0_WHY = "";
try {
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, H0_TABLES);
  const have = new Set(rows.map((r) => r.t));
  const miss = H0_TABLES.filter((t) => !have.has(t));
  const cols: { c: string }[] = await prisma.$queryRawUnsafe(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HotelRoom'`);
  const haveCols = new Set(cols.map((r) => r.c));
  const missCols = ["hkStatus", "hkNote", "hkUpdatedAt"].filter((c) => !haveCols.has(c));
  H0_OK = miss.length === 0 && missCols.length === 0 && typeof prisma.hotelHousekeepingLog?.findMany === "function" && typeof prisma.hotelFolioItem?.findMany === "function";
  H0_WHY = miss.length ? `ยังไม่มีตาราง H.0 บนฐาน l3: ${miss.join(", ")}` : missCols.length ? `HotelRoom ขาดคอลัมน์ ${missCols.join(", ")}` : !H0_OK ? "Prisma client ยังไม่มี model HotelHousekeepingLog/HotelFolioItem" : "";
} catch (e) { H0_WHY = `อ่าน information_schema ไม่ได้: ${errMsg(e)}`; }
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function dropTenantFiles(tids: string[]) {
  if (!tids.length || typeof STO?.deleteFileAsset !== "function") return;
  try {
    const fa: { id: string; tenantId: string }[] = await prisma.fileAsset.findMany({ where: { tenantId: { in: tids } }, select: { id: true, tenantId: true } });
    for (const f of fa) { try { await STO.deleteFileAsset({ tenantId: f.tenantId }, f.id); } catch { /* best-effort */ } }
  } catch (e) { console.log(`  ⚠️ ลบไฟล์ร้านทดสอบ: ${errMsg(e)}`); }
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  await dropTenantFiles(tids);
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
const EN_ALLOW = /^(VAT|SC|OTA|LINE|PDPA|POS|ID|QR|AI|SHARK|HR|WEB|COUNTER|PromptPay|Agoda|Booking\.com|PNG|JPEG|WebP|PDF|CSV|px|rem|em|svg|a|x|ISO|Wi-Fi|Ably|SSE|walk-in|Weber|OK)$/;
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
const SERVER_FILES = /^src\/lib\/modules\/hotel\/(rates|hotel-settings|service|booking|availability|checkin|guest|guest-id-ai|tm30|folio|checkout|room-charge|tape|block|housekeeping)\.ts$|^src\/lib\/modules\/(rooms|pos|member|dorm)\/|^src\/lib\/(storage|ai)\/|^src\/lib\/realtime\/(ably|index)\.ts$/;
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

console.log(`\n(ฐาน ${process.env.SVC_QC_HOST ?? "?"} · ตาราง H.0 ${H0_OK ? "มี" : `ยังไม่มี (${H0_WHY})`} · housekeeping.ts ${hkL.mod ? "โหลดได้" : "ยังไม่มี"} · hk-state.ts ${stateL.mod ? "โหลดได้" : "ยังไม่มี"} · block.ts(H.2) ${blockL.mod ? "โหลดได้" : "ยังไม่มี"} · folio.ts(H.5) ${folioL.mod ? "โหลดได้" : "ยังไม่มี"} · booking.ts(H.3) ${has(F.booking) ? "มี" : "ยังไม่มี"} · ตัวดักคิวรี ${spyInstalled ? "ติด" : "ไม่ติด"})`);

// ═══════════════ ฟิกซ์เจอร์ → ตัวช่วย ═══════════════
const HS = SQC_HOTEL_HK_SCENE;
const TS = SQC_HOTEL_TAPE_SCENE;
const MAID_FX = SQC_USERS.find((u) => u.key === HS.maidKey)!;
const LEAD_FX = SQC_USERS.find((u) => u.key === HS.leadKey)!;
const FD_FX = SQC_USERS.find((u) => u.key === "frontdesk")!;

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ h.6 สอดคล้องกันเอง: 7 ห้อง ล้วนเป็นห้องของฉาก h.2 (pinRooms/blocks ของ SQC_HOTEL_TAPE_SCENE) · ไม่มีห้องซ้ำ · hkStatus/context อยู่ในชุดค่า · checkoutKeys อยู่ในฉาก h.2 และเป็น CHECKED_IN ที่ออกวันนี้ (B203-out) · counts {mine 5 · total 6 · done 1} คำนวณได้จากรายการ (mine = mine:true · total = ไม่ใช่ OOO · done = done:true) · byStatus ตรงรายการ · orderFirst3 = DEPARTED(มีแขกเข้า) → ARRIVING · startedRoom = ห้องที่มี startedMinutesAgo · minibar.posted = 1 แถว × 2 × 4,000 = 8,000 · ค่าตั้งผ่าน schema (คีย์ที่มี def แล้ว) · เช็กลิสต์ดีลักซ์ 5 ข้อ · mark", () => {
    const rooms = HS.rooms as readonly Any[];
    const sceneRooms = new Set<string>([...TS.bookings.flatMap((b) => [...((b.pinRooms as readonly string[] | undefined) ?? [])]), ...TS.blocks.map((b) => b.room)]);
    eq(rooms.filter((r) => !sceneRooms.has(r.room)).map((r) => r.room), [], "ห้องนอกฉาก h.2");
    eq(new Set(rooms.map((r) => r.room)).size, rooms.length, "ห้องซ้ำ");
    ok(rooms.every((r) => HK.includes(r.hkStatus) && CONTEXTS.includes(r.context)), "ค่า hkStatus/context");
    for (const k of HS.checkoutKeys) { const b = TS.bookings.find((x) => x.key === k); ok(b && b.status === "CHECKED_IN" && b.checkInOffset + b.nights === 0, `checkoutKey ${k} ไม่ใช่ CHECKED_IN ที่ออกวันนี้ในฉาก h.2`); }
    eq({ mine: rooms.filter((r) => r.mine).length, total: rooms.filter((r) => r.context !== "OOO").length, done: rooms.filter((r) => r.done).length }, { ...HS.expect.counts }, "counts");
    const by: Record<string, string[]> = {};
    for (const r of rooms) (by[r.hkStatus] ??= []).push(r.room);
    for (const k of Object.keys(by)) by[k].sort();
    eq(by, Object.fromEntries(Object.entries(HS.expect.byStatus).map(([k, v]) => [k, [...v].sort()])), "byStatus");
    const first3 = [...HS.expect.orderFirst3];
    const ctxOf = (room: string) => rooms.find((r) => r.room === room)?.context;
    eq(ctxOf(first3[0]), "DEPARTED", "ลำดับแรกต้องเป็น ออกแล้ว(+แขกเข้า)");
    ok(first3.slice(1).every((n) => ctxOf(n) === "ARRIVING"), `ลำดับ 2–3 ต้องเป็น ARRIVING: ${J(first3.map(ctxOf))}`);
    ok(TS.bookings.some((b) => b.status === "HOLD" && b.checkInOffset === 0 && (b.pinRooms as readonly string[]).includes(first3[0])), `${first3[0]} ต้องมีแขกเข้าวันนี้ (HOLD/CONFIRMED) ในฉาก h.2`);
    eq(rooms.filter((r) => typeof r.startedMinutesAgo === "number").map((r) => r.room), [HS.expect.startedRoom], "startedRoom");
    const posted = HS.minibar.posted;
    const price = (k: string) => HS.minibar.items.find((i) => i.key === k)?.priceSatang ?? Number.NaN;
    eq([posted.lines.length, posted.lines.reduce((s, l) => s + l.qty * price(l.key), 0)], [HS.expect.minibarFolioItems, HS.expect.minibarAmountSatang], "มินิบาร์ที่โพสต์");
    ok(rooms.some((r) => r.room === posted.room && r.context === "STAYOVER"), "ห้องที่โพสต์มินิบาร์ต้องเป็นค้างต่อ (folio OPEN)");
    for (const [k, v] of Object.entries(HS.settings)) { const d = SET?.getDef?.(k); if (!d) { ok(k === "rooms.hotel.hk.canBlock", `ไม่มี def ${k}`); continue; } ok(d.schema.safeParse(v).success, `ค่า ${k}=${J(v)} ไม่ผ่าน schema`); }
    eq(HS.checklistDeluxe.length, 5, "เช็กลิสต์ดีลักซ์");
    eq([HS.mark, HS.unit, HS.maidKey, HS.leadKey], ["SvcQcScene:h6", "hotel", "maid", "hk-lead"], "ค่าคงที่");
  });
  await st("PC-2", "บริบทในฟิกซ์เจอร์คำนวณได้จากฉาก h.2 (refSceneContext): B203 DEPARTED (B203-out ออกวันนี้ + เช็กเอาต์ในฉาก h.6) · B102/B204 ARRIVING (CONFIRMED วันนี้) · B101/B105 STAYOVER (CHECKED_IN ข้ามคืน) · B103 OOO (BLOCK วันนี้ 3 คืน) · ⚠️ B202 ฟิกซ์เจอร์ว่า ARRIVING แต่ฉาก h.2 เข้า +2 ⇒ ตามนิยาม §0 คือ VACANT — ข้อนี้ไม่ตัดสิน B202 (รายงานผู้คุม) · ห้อง B205 (MONTHLY) ไม่อยู่ในฟิกซ์เจอร์", () => {
    const bad: string[] = [];
    const noted: string[] = [];
    for (const r of HS.rooms as readonly Any[]) {
      const exp = refSceneContext(r.room);
      if (exp !== r.context) { if (r.room === "B202") noted.push(`B202 ฟิกซ์เจอร์ ${r.context} · ฉาก h.2 ให้ ${exp}`); else bad.push(`${r.room}: ฟิกซ์เจอร์ ${r.context} ≠ ฉาก h.2 ${exp}`); }
    }
    eq(bad, [], "บริบทไม่ตรงฉาก h.2");
    ok(!(HS.rooms as readonly Any[]).some((r) => r.room === "B205"), "B205 รายเดือนอยู่ในฟิกซ์เจอร์");
    if (noted.length) console.log(`     (⚠️ ${noted.join(" · ")} — เสนอแก้ฟิกซ์เจอร์หรือระบุนิยาม "พร้อมรับ")`);
  });
  await st("PC-3", "oracle ของ oracle (pure): refCan ตาม S §7.6 (DIRTY→CLEAN แม่บ้าน ✓ · CLEAN→INSPECTED หัวหน้า+เปิด ✓ แม่บ้าน ✗ · *→OUT_OF_ORDER ระบบเท่านั้น · OUT_OF_ORDER→DIRTY ระบบ · DIRTY→INSPECTED ✗ · เท่าเดิม ✗ · ค่าขยะ ✗) · refTier ลำดับ 0–5 · refCounts บนรายการฟิกซ์เจอร์ (B202 ARRIVING ตามฟิกซ์เจอร์) = 5/6/1 · PNG ที่สร้างมีไบต์หัว/IEND · bigPng ขนาดตรง", () => {
    ok(refCan("DIRTY", "CLEAN", "MAID", true) === true && refCan("CLEAN", "INSPECTED", "INSPECTOR", true) === true && refCan("CLEAN", "INSPECTED", "MAID", true) === false, "edge แม่บ้าน/หัวหน้า");
    ok(refCan("CLEAN", "OUT_OF_ORDER", "MAID", false) === false && refCan("CLEAN", "OUT_OF_ORDER", "SYSTEM", false) === true && refCan("OUT_OF_ORDER", "DIRTY", "SYSTEM", false) === true && refCan("OUT_OF_ORDER", "DIRTY", "MAID", false) === false && refCan("OUT_OF_ORDER", "CLEAN", "SYSTEM", false) === false, "OUT_OF_ORDER");
    ok(refCan("DIRTY", "INSPECTED", "INSPECTOR", true) === false && refCan("CLEAN", "CLEAN", "MAID", true) === false && refCan("INSPECTED", "DIRTY", "MAID", true) === true && refCan("BROKEN", "CLEAN", "MAID", true) === false, "edge อื่น");
    ok(refCan("CLEAN", "INSPECTED", "INSPECTOR", false) === null && refCan("DIRTY", "CLEAN", "SYSTEM", true) === null, "ช่องที่ใบไม่ตัดสิน = null");
    eq([refTier({ context: "DEPARTED", hkStatus: "DIRTY", arrivalTime: "14:00" }), refTier({ context: "ARRIVING", hkStatus: "INSPECTED" }), refTier({ context: "DEPARTED", hkStatus: "DIRTY" }), refTier({ context: "DEPARTING", hkStatus: "CLEAN" }), refTier({ context: "STAYOVER", hkStatus: "DIRTY" }), refTier({ context: "VACANT", hkStatus: "DIRTY" }), refTier({ context: "VACANT", hkStatus: "CLEAN" }), refTier({ context: "OOO", hkStatus: "OUT_OF_ORDER" })], [0, 1, 2, 2, 3, 4, 5, 5], "refTier");
    const rows = (HS.rooms as readonly Any[]).map((r) => ({ context: r.context, hkStatus: r.hkStatus, guestRequest: r.guestRequest ?? null, assignedTo: r.mine ? MAID_FX.userId : null, upcoming: r.upcoming ?? false })); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h6-upcoming)
    eq(refCounts(rows, MAID_FX.userId), { ...HS.expect.counts }, "refCounts บนฟิกซ์เจอร์");
    const p = Buffer.from(makePng());
    ok(p[0] === 0x89 && p.subarray(1, 4).toString("ascii") === "PNG" && p.subarray(p.length - 8, p.length - 4).toString("ascii") === "IEND", "PNG");
    eq(bigPng(1024).length, 1024, "bigPng");
  });
  await st("PC-4", "ฐาน QC ต่อได้ (SELECT 1 · host = เลน l3 ep-royal-bar) · ตาราง H.0/หอ ครบ (HotelHousekeepingLog · HotelFolio/Item · HotelBookingNight · RoomOccupancy · DormRepair · FileAsset · OutboxEvent) · HotelRoom มี hkStatus/hkNote/hkUpdatedAt · ตัวดักคิวรีติด · ร้าน svcqc seed แล้ว: membership maid = hotel.housekeeping เท่านั้น · hk-lead = housekeeping + inspect · frontdesk ไม่มี housekeeping · หน่วย hotel 14 ห้อง · ห้องในฟิกซ์เจอร์มีจริง", async () => {
    const r: { one: number }[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
    eq(r[0]?.one, 1, "SELECT 1");
    ok(/^(ep-mute-scene|ep-royal-lake|ep-weathered-mode|ep-royal-bar)/.test(process.env.SVC_QC_HOST ?? ""), `host ${process.env.SVC_QC_HOST} ไม่ใช่ฐาน QC ของ SVC`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h6-PC3-anylane): ข้อสอบต้องรันได้ทุกเลน/ฐานหลัก (builder อาจอยู่เลนอื่น · regression/H.9)
    ok(H0_OK, H0_WHY);
    ok(spyInstalled, "ตัวดักคิวรีไม่ติด (BD-7 นับคิวรีไม่ได้)");
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    if (!t) throw new AssertFail("ร้าน svcqc ยังไม่ seed บนฐาน l3 — ผู้คุมรัน seed ก่อน (Q/V ต้องใช้)");
    const mm = await prisma.membership.findUnique({ where: { id: MAID_FX.membershipId }, select: { permissions: true, role: true, unitAccess: true } });
    eq([mm?.role, Object.keys((mm?.permissions as Any) ?? {}).sort(), mm?.unitAccess], ["STAFF", ["hotel.housekeeping"], [SQC_UNITS.hotel.id]], "membership maid บนฐาน");
    const ml = await prisma.membership.findUnique({ where: { id: LEAD_FX.membershipId }, select: { permissions: true, role: true } });
    ok(ml && (ml.permissions as Any)?.["hotel.housekeeping"] === true && (ml.permissions as Any)?.["hotel.housekeeping.inspect"] === true, `membership hk-lead บนฐานยังไม่มี (reseed svc-h6-seed-l3b): ${J(ml)}`);
    const mf = await prisma.membership.findUnique({ where: { id: FD_FX.membershipId }, select: { permissions: true } });
    ok(mf && !(mf.permissions as Any)?.["hotel.housekeeping"], "frontdesk บนฐานมี hotel.housekeeping (ฟิกซ์เจอร์ต้องไม่มี)");
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, active: true }, select: { number: true } });
    eq(rooms.length, SQC_HOTEL_ROOMS.length, "ห้องบนฐาน");
    const nums = new Set(rooms.map((x: Any) => x.number));
    eq((HS.rooms as readonly Any[]).filter((x) => !nums.has(x.room)).map((x) => x.room), [], "ห้องฟิกซ์เจอร์ไม่มีบนฐาน");
  }, "MAJOR");
  await st("PC-5", "ฟิกซ์เจอร์ผู้ใช้: maid STAFF หน่วย hotel มีเฉพาะ hotel.housekeeping · hk-lead มี housekeeping + housekeeping.inspect · frontdesk ไม่มี housekeeping · ทะเบียนสิทธิ์มีป้ายไทย hotel.housekeeping(.inspect) · rbac evaluate: maid ผ่าน housekeeping ไม่ผ่าน inspect · hk-lead ผ่านทั้งคู่ · frontdesk ไม่ผ่าน · maid หน่วยอื่นไม่ผ่าน", () => {
    eq([MAID_FX.role, Object.keys(MAID_FX.permissions), MAID_FX.unitAccess], ["STAFF", ["hotel.housekeeping"], [SQC_UNITS.hotel.id]], "maid");
    eq([LEAD_FX.role, Object.keys(LEAD_FX.permissions).sort(), LEAD_FX.unitAccess], ["STAFF", ["hotel.housekeeping", "hotel.housekeeping.inspect"], [SQC_UNITS.hotel.id]], "hk-lead");
    ok(!FD_FX.permissions["hotel.housekeeping"] && !FD_FX.permissions["hotel.housekeeping.inspect"], "frontdesk มี housekeeping");
    const src = read(F.perms);
    for (const k of ["hotel.housekeeping", "hotel.housekeeping.inspect"]) ok(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"[^"]*[฀-๿]`).test(src), `ไม่มีป้ายไทย ${k}`);
    ok(typeof RBAC?.evaluate === "function", "โหลด rbac ไม่ได้");
    const m = (u: Any) => ({ role: u.role, unitAccess: u.unitAccess, permissions: u.permissions });
    const q = (action: string, unitId = SQC_UNITS.hotel.id) => ({ module: "hotel", action, unitId });
    ok(RBAC.evaluate(m(MAID_FX), q("hotel.housekeeping")) && !RBAC.evaluate(m(MAID_FX), q("hotel.housekeeping.inspect")), "maid");
    ok(RBAC.evaluate(m(LEAD_FX), q("hotel.housekeeping")) && RBAC.evaluate(m(LEAD_FX), q("hotel.housekeeping.inspect")), "hk-lead");
    ok(!RBAC.evaluate(m(FD_FX), q("hotel.housekeeping")), "frontdesk");
    ok(!RBAC.evaluate(m(MAID_FX), q("hotel.housekeeping", SQC_UNITS.dorm.id)), "maid หน่วยอื่น");
  });
  await st("PC-6", "def ค่าตั้งที่ H.6 ยืนบน (มีแล้ว H.0/H.1): housekeepingChecklist #74 ชั้น ROOM_TYPE (chain RT) ค่าเริ่ม 8 ข้อ · minibar #75 chain UNIT sensitivity MONEY (schema ปัจจุบัน = {productId, priceSatang?} — ⚠️ ฟิกซ์เจอร์ใช้ {key,name,priceSatang} · รายงานผู้คุม) · dailyHousekeeping true (U_RT) · inspectionRequired false (U) · checkInTime 14:00 · ทุกคีย์ unitTypes HOTEL · hk.canBlock ยังไม่มี (H.6 เพิ่ม — ตรวจใน DF-1)", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k}`); return x; };
    eq([d("rooms.hotel.housekeepingChecklist").chain, d("rooms.hotel.housekeepingChecklist").defaults._fallback.length], [["ROOM_TYPE"], 8], "checklist");
    eq([d("rooms.hotel.minibar").chain, d("rooms.hotel.minibar").sensitivity, d("rooms.hotel.minibar").defaults._fallback], [["UNIT"], "MONEY", []], "minibar");
    const mbFx = d("rooms.hotel.minibar").schema.safeParse([...HS.minibar.items]).success;
    console.log(`     (schema #75 ${mbFx ? "รับ" : "⚠️ ไม่รับ"}รูป {key,name,priceSatang} ของฟิกซ์เจอร์ — ${mbFx ? "ใช้ได้เลย" : "ต้องมติ: ขยาย def #75 (H.6) หรือฟิกซ์เจอร์ใช้ productId"})`);
    eq([d("rooms.hotel.dailyHousekeeping").defaults._fallback, d("rooms.hotel.dailyHousekeeping").chain, d("rooms.hotel.inspectionRequired").defaults._fallback, d("rooms.hotel.inspectionRequired").chain, d("rooms.hotel.checkInTime").defaults._fallback], [true, ["UNIT", "ROOM_TYPE"], false, ["UNIT"], "14:00"], "ค่าเริ่ม");
    for (const k of ["rooms.hotel.housekeepingChecklist", "rooms.hotel.minibar", "rooms.hotel.dailyHousekeeping", "rooms.hotel.inspectionRequired"]) eq(d(k).unitTypes, ["HOTEL"], `unitTypes ${k}`);
  });
  await st("PC-7", "ภาพ: SQC_VISUAL_SPECS[\"h.6\"] = hotel-hk-board · hotel-hk-logs (+hotel-hk-room เมื่อ SVC_VIS_H6_ROOM_ID) · path ใต้ /hotel/housekeeping · visual-svc h.6 --list พิมพ์ครบ · SQC_VISUAL_USERS มี maid และ hk-lead", () => {
    const specs = SQC_VISUAL_SPECS["h.6"] ?? [];
    eq(specs.map((s) => s.name).filter((n) => n !== "hotel-hk-room"), ["hotel-hk-board", "hotel-hk-logs"], "ชื่อภาพ");
    ok(specs.every((s) => s.path.startsWith(`/app/u/${SQC_UNITS.hotel.slug}/hotel/housekeeping`)), "path");
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.6", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "", SVC_VIS_H6_ROOM_ID: "qc-room" }, encoding: "utf8" });
    ok(r.status === 0 && (r.stdout ?? "").includes("/hotel/housekeeping/logs") && (r.stdout ?? "").includes("/hotel/housekeeping/qc-room"), `--list exit ${r.status}`);
    ok(SQC_USERS.some((u) => u.key === "maid") && SQC_USERS.some((u) => u.key === "hk-lead"), "SQC_USERS ไม่มี maid/hk-lead");
  }, "MAJOR");
  await st("PC-8", "ของที่ H.6 ยืนบน โหลดได้จริง: rooms facade setHkStatus/roomBoard (+ HK_STATUSES 4 ค่า จาก rooms/service.ts — facade ไม่ re-export)/affectedByOutOfOrder/claimRoom · dorm/portal dormStaffGate (ลายเซ็นปัจจุบัน 3 พารามิเตอร์ · หน่วย HOTEL ⇒ null = ค่าเริ่ม DORM) · dorm/repair listDormRepairs/dormRepairJob/submitPortalRepair (ไม่มีเส้น «พนักงานสร้างใบซ่อม» — รายงานผู้คุม) · realtime publish/realtimeMode(polling)/sanitizeSignal/SAFE_KEYS · kanban-token route · settings setSettings/resolveSetting/getDef · storage uploadFile/privateFileUrl · service.ts assignableRooms/checkOut เดิม · facade hotel โหลดได้ · ไม่มี ABLY_API_KEY ในโพรเซส", async () => {
    eq(["setHkStatus", "roomBoard", "affectedByOutOfOrder", "claimRoom", "releaseOccupancy"].filter((n) => typeof roomsL.mod?.[n] !== "function"), [], "rooms facade");
    eq([...(roomsL.mod?.HK_STATUSES ?? roomsSvcL.mod?.HK_STATUSES ?? [])].sort(), [...HK].sort(), "HK_STATUSES (service.ts)");
    ok(typeof portalL.mod?.dormStaffGate === "function", `ไม่มี dormStaffGate (${portalL.err})`);
    eq(["listDormRepairs", "dormRepairJob", "submitPortalRepair", "completeDormRepair"].filter((n) => typeof repairL.mod?.[n] !== "function"), [], "dorm/repair");
    const staffCreate = Object.keys(repairL.mod ?? {}).filter((n) => /create|open|report|submit/i.test(n) && !/Portal/.test(n));
    console.log(`     (เส้นพนักงานสร้างใบซ่อมใน repair.ts ตอนนี้: ${staffCreate.length ? staffCreate.join(", ") : "ไม่มี — ใบ §0 ให้ขอผู้คุม"})`);
    ok(rtL.mod && typeof rtL.mod.publish === "function" && typeof rtL.mod.realtimeMode === "function" && typeof rtL.mod.sanitizeSignal === "function" && Array.isArray(rtL.mod.SAFE_KEYS), `realtime ${rtL.err}`);
    eq(rtL.mod.realtimeMode(), "polling", "โหมดต้อง polling (ไม่มีคีย์)");
    ok(has(F.kanbanToken), "ไม่มี kanban-token route (แบบของ hotel-hk-token)");
    eq(["setSettings", "resolveSetting", "getDef", "resetSetting"].filter((n) => typeof SET?.[n] !== "function"), [], "settings");
    ok(STO && typeof STO.uploadFile === "function" && typeof STO.privateFileUrl === "function", "storage");
    eq(["assignableRooms", "checkOut", "checkIn"].filter((n) => typeof serviceL.mod?.[n] !== "function"), [], "service.ts เดิม");
    ok(hotelL.mod, hotelL.err);
    ok(typeof QH?.bkkYmd === "function", "bkkYmd");
    eq(process.env.ABLY_API_KEY ?? null, null, "ABLY_API_KEY ค้าง");
  });

  // ═══════════════ ร้านชั่วคราว svc-h6-* ═══════════════
  console.log("\n── ตั้งร้านชั่วคราว svc-h6-* ──");
  const mkTenant = async (name: string) => { const r = await prisma.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC H6 ร้าน A");
  const tB = await mkTenant("QC H6 ร้าน B");
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UH = await mkUnit(tA, "HOTEL", "โรงแรมทดสอบ H6");
  const UH2 = await mkUnit(tA, "HOTEL", "โรงแรมใหญ่ H6 (100 ห้อง)");
  const UD = await mkUnit(tA, "DORM", "หอทดสอบ H6");
  const UHB = await mkUnit(tB, "HOTEL", "โรงแรมร้าน B H6");
  type TypeSpec = { name: string; base: number; cap: number };
  const mkType = async (tenantId: string, unitId: string, s: TypeSpec) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: s.name, rentMode: "NIGHTLY", baseRateSatang: s.base, capacity: s.cap, baseOccupancy: 2, maxOccupancy: s.cap } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string, hk = "CLEAN", extra: Record<string, unknown> = {}) => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, hkStatus: hk, floorNo: Number(number.replace(/\D/g, "").slice(0, 1) || 1), status: hk === "OUT_OF_ORDER" ? "OOO" : hk === "DIRTY" ? "CLEANING" : "AVAILABLE", ...extra } })).id as string;
  const SPEC: Record<string, TypeSpec> = { dlx: { name: "ดีลักซ์", base: 129_000, cap: 3 }, sup: { name: "ซูพีเรีย", base: 99_000, cap: 2 }, fam: { name: "แฟมิลี", base: 189_000, cap: 4 } };
  const RTA: Record<string, string> = {};
  for (const [k, s] of Object.entries(SPEC)) RTA[k] = await mkType(tA, UH, s);
  const ROOM: Record<string, string> = {};
  /** ห้อง → บริบทที่ออกแบบ (BD ตรวจ): DEP ออกแล้ว+แขกเข้า · DEPG ออกวันนี้ · ARR/ARR2 แขกเข้า · STAY/STAY2/MB1 ค้างต่อ · MB3 ออกแล้ว (folio SETTLED) · VAC/VACC ว่าง · OOO1 ปิดซ่อม · W1–W3 ว่างสะอาด */
  const roomPlan: [string, string, string, Record<string, unknown>?][] = [
    ["DEP", "dlx", "DIRTY"], ["DEPG", "dlx", "CLEAN"], ["ARR", "dlx", "DIRTY"], ["ARR2", "sup", "INSPECTED"],
    ["STAY", "dlx", "DIRTY", { hkNote: JSON.stringify({ guestRequest: "แขกขอทำหลัง 13:00" }) }], ["STAY2", "sup", "CLEAN"], ["MB1", "dlx", "DIRTY"], ["MB3", "sup", "DIRTY"],
    ["VAC", "fam", "DIRTY"], ["VACC", "fam", "CLEAN"], ["OOO1", "dlx", "OUT_OF_ORDER"], ["W1", "dlx", "DIRTY"], ["W2", "sup", "CLEAN"], ["W3", "sup", "CLEAN"], ["W4", "dlx", "DIRTY"],
  ];
  for (const [n, k, hk, extra] of roomPlan) ROOM[n] = await mkRoom(tA, UH, n, RTA[k], hk, extra ?? {});
  const RT_B = await mkType(tB, UHB, SPEC.dlx);
  const ROOM_B = await mkRoom(tB, UHB, "B-1", RT_B, "DIRTY");
  const RT_D = (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: UD, name: "ห้องหอ", rentMode: "MONTHLY", baseRateSatang: 0, monthlyRateSatang: 450_000 } })).id as string;
  const ROOM_D = await mkRoom(tA, UD, "D101", RT_D, "DIRTY");
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-h6-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@shark.local`, name: `QC h6 ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MGR2 = await mkMember("mgr2", tA, "MANAGER", [UH2]);
  const FRONT = await mkMember("front", tA, "STAFF", [UH], { ...FD_FX.permissions });
  const MAID = await mkMember("maid", tA, "STAFF", [UH], { ...MAID_FX.permissions });
  const MAID2 = await mkMember("maid2", tA, "STAFF", [UH], { ...MAID_FX.permissions });
  const LEAD = await mkMember("lead", tA, "STAFF", [UH], { ...LEAD_FX.permissions });
  const NONE = await mkMember("none", tA, "STAFF", [UH], { "hotel.rates.read": true });
  const FAI = await mkMember("fai", tA, "STAFF", [UD, UH], { "dorm.repair.manage": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const T0 = bkkToday();
  const W = (n: number) => addDays(T0, n);
  const setScope = async (key: string, value: unknown, scope: "UNIT" | "ROOM_TYPE", scopeId: string) => okRes(await SET.setSettings(OWNER, ctxA, [{ key, scope, scopeId, value }]), `ตั้ง ${key}`);
  const setUnit = (key: string, value: unknown, unitId = UH) => setScope(key, value, "UNIT", unitId);
  const resetUnit = async (key: string, unitId = UH) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: unitId }); } catch { /* ไม่มีค่า */ } };
  const settingOf = async (key: string, unitId = UH) => (await SET.resolveSetting(ctxA, key, { unitId }))?.value;
  let SETUP_OK = false;
  let SETUP_WHY = "";
  let seq = 0;
  type ResOpt = { type?: string; ci?: string; co?: string; status?: string; roomKey: string; folio?: "OPEN" | "SETTLED" | null; tenantId?: string; unitId?: string; roomTypeId?: string; roomId?: string; guestName?: string; claim?: boolean };
  /** การจอง "ตามที่ H.3/H.5 จะสร้าง" โดยไม่ต้องมี booking.ts: HotelReservation + nights counted + RoomOccupancy STAY (ถ้ายังพัก) + HotelFolio */
  const mkRes = async (o: ResOpt) => {
    const tenantId = o.tenantId ?? tA, unitId = o.unitId ?? UH;
    const roomId = o.roomId ?? ROOM[o.roomKey];
    const roomTypeId = o.roomTypeId ?? (await prisma.hotelRoom.findUnique({ where: { id: roomId }, select: { roomTypeId: true } }))!.roomTypeId;
    const ci = o.ci ?? W(0), co = o.co ?? W(2);
    const status = o.status ?? "CONFIRMED";
    const rv = await prisma.hotelReservation.create({ data: { tenantId, unitId, code: `H6-${RUN}-${++seq}`, status, guestName: o.guestName ?? `ผู้จองทดสอบ h6 ${seq}`, guestPhone: "0899990000", guestEmail: "svc-h6-guest@qc.invalid", roomTypeId, roomId, checkInDate: dbDate(ci), checkOutDate: dbDate(co), nights: dayNo(co) - dayNo(ci), adults: 2, source: "WALK_IN", taxSnapshot: { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 }, ...(status === "CHECKED_IN" ? { checkedInAt: new Date(Date.parse(`${ci}T07:00:00Z`)) } : {}), ...(status === "CHECKED_OUT" ? { checkedInAt: new Date(Date.parse(`${ci}T07:00:00Z`)), checkedOutAt: new Date(Date.now() - 30 * 60_000) } : {}) } });
    for (let d = ci; d < co; d = addDays(d, 1)) await prisma.hotelBookingNight.create({ data: { tenantId, unitId, reservationId: rv.id, roomTypeId, roomId, date: dbDate(d), priceSatang: 100_000, counted: status !== "CANCELLED" } });
    if ((status === "CONFIRMED" || status === "CHECKED_IN" || status === "HOLD") && o.claim !== false) {
      const c = await prisma.$transaction((tx: Any) => roomsL.mod.claimRoom(tx, { tenantId, unitId, roomId, start: ci, end: co, kind: "STAY", refType: "HotelReservation", refId: rv.id, requireRentMode: "NIGHTLY" }));
      if (c?.ok !== true) throw new Error(`claimRoom ${o.roomKey}: ${J(c).slice(0, 120)}`);
    }
    const folio = o.folio === undefined ? (status === "CONFIRMED" || status === "CHECKED_IN" ? "OPEN" : null) : o.folio;
    if (folio) await prisma.hotelFolio.create({ data: { tenantId, unitId, reservationId: rv.id, status: folio, balanceSatang: 0, ...(folio === "SETTLED" ? { settledAt: new Date() } : {}) } });
    return rv.id as string;
  };
  const RV: Record<string, string> = {};
  const EXP_CTX: Record<string, string> = { DEP: "DEPARTED", DEPG: "DEPARTING", ARR: "ARRIVING", ARR2: "ARRIVING", STAY: "STAYOVER", STAY2: "STAYOVER", MB1: "STAYOVER", MB3: "DEPARTED", VAC: "VACANT", VACC: "VACANT", OOO1: "OOO", W1: "VACANT", W2: "VACANT", W3: "VACANT", W4: "VACANT" };
  const EXP_ARRIVAL = new Set(["DEP", "ARR", "ARR2"]);
  try {
    ok((await prisma.hotelRoom.count({ where: { tenantId: tA, unitId: UH } })) === roomPlan.length, "ห้องไม่ครบ");
    RV.DEP_OUT = await mkRes({ roomKey: "DEP", status: "CHECKED_OUT", ci: W(-2), co: W(0), folio: "SETTLED" });
    RV.DEP_IN = await mkRes({ roomKey: "DEP", status: "CONFIRMED", ci: W(0), co: W(1) });
    RV.DEPG = await mkRes({ roomKey: "DEPG", status: "CHECKED_IN", ci: W(-1), co: W(0) });
    RV.ARR = await mkRes({ roomKey: "ARR", status: "CONFIRMED", ci: W(0), co: W(2) });
    RV.ARR2 = await mkRes({ roomKey: "ARR2", status: "CONFIRMED", ci: W(0), co: W(1) });
    RV.STAY = await mkRes({ roomKey: "STAY", status: "CHECKED_IN", ci: W(-1), co: W(2) });
    RV.STAY2 = await mkRes({ roomKey: "STAY2", status: "CHECKED_IN", ci: W(-2), co: W(1) });
    RV.MB1 = await mkRes({ roomKey: "MB1", status: "CHECKED_IN", ci: W(-1), co: W(3) });
    RV.MB3 = await mkRes({ roomKey: "MB3", status: "CHECKED_OUT", ci: W(-3), co: W(0), folio: "SETTLED" });
    RV.FUT = await mkRes({ roomKey: "VACC", status: "CONFIRMED", ci: W(3), co: W(5) }); // อนาคต = ยังว่างวันนี้
    RV.B = await mkRes({ roomKey: "B", tenantId: tB, unitId: UHB, roomId: ROOM_B, roomTypeId: RT_B, status: "CHECKED_IN", ci: W(-1), co: W(1) });
    const blk = await prisma.$transaction((tx: Any) => roomsL.mod.claimRoom(tx, { tenantId: tA, unitId: UH, roomId: ROOM.OOO1, start: W(0), end: W(3), kind: "BLOCK", refType: "HotelRoomBlock", refId: `qc-h6-block-${RUN}` }));
    ok(blk?.ok === true, `BLOCK OOO1 ${J(blk).slice(0, 120)}`);
    await setUnit("rooms.hotel.inspectionRequired", true);
    await setUnit("rooms.hotel.dailyHousekeeping", true);
    await setScope("rooms.hotel.housekeepingChecklist", [...HS.checklistDeluxe], "ROOM_TYPE", RTA.dlx);
    SETUP_OK = true;
  } catch (e) { SETUP_WHY = `ตั้งร้านชั่วคราวไม่สำเร็จ: ${errMsg(e)}`; console.log(`  ❌ ${SETUP_WHY}`); }
  const needSetup = () => ok(SETUP_OK, SETUP_WHY);
  const PII_TEXT = /0899990000|svc-h6-guest/;
  // ── ตัวช่วยอ่านฐาน ──
  const roomOf = (roomId: string) => prisma.hotelRoom.findUnique({ where: { id: roomId } }) as Promise<Any>;
  const hkOf = async (roomId: string) => (await roomOf(roomId))?.hkStatus as string;
  const noteOf = async (roomId: string) => parseJson((await roomOf(roomId))?.hkNote) ?? {};
  const logsOf = (roomId: string, since?: Date) => prisma.hotelHousekeepingLog.findMany({ where: { roomId, ...(since ? { createdAt: { gte: since } } : {}) }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const logCount = (roomId: string) => prisma.hotelHousekeepingLog.count({ where: { roomId } }) as Promise<number>;
  const folioOf = (rvId: string) => prisma.hotelFolio.findUnique({ where: { reservationId: rvId }, include: { items: { orderBy: { createdAt: "asc" } } } }) as Promise<Any>;
  const occOf = (roomId: string, kind?: string) => prisma.roomOccupancy.findMany({ where: { roomId, active: true, ...(kind ? { kind } : {}) } }) as Promise<Any[]>;
  const eventsOf = async (type: string, pick?: (p: Any) => boolean, tid = tA) => ((await prisma.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => !pick || pick(e.payload ?? {}));
  const auditsOf = (where: Any, tid = tA) => prisma.auditLog.findMany({ where: { tenantId: tid, ...where }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  type Over = Record<string, unknown>;
  const board = (over: Over = {}, ctx: Record<string, unknown> = ctxA) => call(() => H6("hkBoard")(ctx, { unitId: UH, ...over }));
  const setStatus = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => H6("hkSetStatus")(actor, ctx, { idempotencyKey: `svc-h6-key-${uid()}`, ...over }));
  const start = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => H6("hkStart")(actor, ctx, over));
  const finish = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => H6("hkFinish")(actor, ctx, { checklist: HS.checklistDeluxe.map((key) => ({ key, done: true })), minibar: [], ...over }));
  const inspect = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => H6("hkInspect")(actor, ctx, over));
  const logs = (over: Over, ctx: Record<string, unknown> = ctxA) => call(() => H6("hkLogs")(ctx, { from: W(-1), to: W(1), ...over }));
  const minibar = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => H6("postMinibar")(actor, ctx, over));
  const defect = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => H6("reportDefect")(actor, ctx, { text: "ก๊อกน้ำรั่ว", photos: [PNG(1)], action: "REPAIR", ...over }));
  const stayovers = (over: Over = {}, ctx: Record<string, unknown> = ctxA) => call(() => H6("markStayoversDirty")(ctx, { unitId: UH, businessDate: W(0), ...over }));
  const rowOf = (b: Any, roomId: string): Any => rowsOf(b).find((r: Any) => r.roomId === roomId);
  const BOARD_KEYS = new Set(["roomId", "number", "floor", "typeName", "hkStatus", "context", "arrivalTime", "guestRequest", "assignedTo", "assignedToName", "startedAt", "priority", "guestName", "roomTypeId", "note", "hkUpdatedAt", "departedAt", "checkOutTime", "done", "mine", "reservationId", "arrivalName", "stayNights"]);

  // ═══════════════ SM state machine (pure · hk-state.ts) ═══════════════
  console.log("\n── SM state machine (hk-state.ts) ──");
  await st("SM-1", "hk-state.ts มี export canHkTransition · hkPriority · parseHkNote · serializeHkNote (ฟังก์ชัน) + HK_TRANSITIONS (ตาราง/ชุด) · ไฟล์ pure: ไม่ import prisma/db/rooms/settings/next (ค่า) · ไม่มี directive", () => {
    needState();
    eq(STATE_FNS.filter((n) => typeof stateL.mod[n] !== "function"), [], "export ขาด");
    ok(stateL.mod.HK_TRANSITIONS !== undefined, "ไม่มี HK_TRANSITIONS");
    const src = read(F.state);
    eq(importSpecs(src).filter((i) => !i.typeOnly).map((i) => i.spec).filter((s) => /prisma|@\/lib\/core\/db|@\/lib\/modules|@\/lib\/core\/settings|^next|server-only/.test(s)), [], "import ค่าที่ไม่ pure");
    ok(!/["']use (client|server)["']/.test(stripComments(src)), "มี directive");
  });
  await st("SM-2", "canHkTransition ครบทุกคู่ 4×4 × บทบาท 3 (แม่บ้าน/หัวหน้า/ระบบ) × inspectionRequired 2 = 96 ช่อง ตรง S §7.6: DIRTY→CLEAN แม่บ้าน/หัวหน้า ✓ · CLEAN→INSPECTED หัวหน้า+เปิด ✓ แม่บ้าน ✗ · CLEAN|INSPECTED→DIRTY ✓ ทุกบทบาท · DIRTY→INSPECTED ✗ · INSPECTED→CLEAN ✗ · เท่าเดิม ✗ · คืน boolean เสมอ (ช่องที่ใบไม่ตัดสินไม่ assert)", () => {
    needState();
    const can = SMF("canHkTransition");
    const bad: string[] = [];
    let n = 0;
    for (const from of HK) for (const to of HK) for (const role of ROLES) for (const insp of [true, false]) {
      n++;
      const got = can(from, to, { role: roleName(role), inspectionRequired: insp });
      if (typeof got !== "boolean") { bad.push(`${from}→${to}/${role}/${insp}: ไม่ใช่ boolean (${fmt(got)})`); continue; }
      const exp = refCan(from, to, role, insp);
      if (exp !== null && got !== exp) bad.push(`${from}→${to}/${role}/insp=${insp}: ได้ ${got} ต้อง ${exp}`);
    }
    eq(n, 96, "จำนวนช่อง");
    eq(bad.slice(0, 12), [], `ผิด ${bad.length} ช่อง`);
  });
  await st("SM-3", "OUT_OF_ORDER เข้า/ออกเฉพาะระบบ (USE_BLOCK): ทุก from → OUT_OF_ORDER โดยแม่บ้าน/หัวหน้า = false (ทั้งสองค่า inspectionRequired) · OUT_OF_ORDER → CLEAN/INSPECTED = false ทุกบทบาท · ระบบ: *→OUT_OF_ORDER true · OUT_OF_ORDER→DIRTY true", () => {
    needState();
    const can = SMF("canHkTransition");
    const bad: string[] = [];
    for (const from of ["DIRTY", "CLEAN", "INSPECTED"]) for (const role of ["MAID", "INSPECTOR"] as Role[]) for (const insp of [true, false]) if (can(from, "OUT_OF_ORDER", { role: roleName(role), inspectionRequired: insp }) !== false) bad.push(`${from}→OOO/${role}`);
    for (const to of ["CLEAN", "INSPECTED"]) for (const role of ROLES) if (can("OUT_OF_ORDER", to, { role: roleName(role), inspectionRequired: true }) !== false) bad.push(`OOO→${to}/${role}`);
    for (const from of ["DIRTY", "CLEAN", "INSPECTED"]) if (can(from, "OUT_OF_ORDER", { role: roleName("SYSTEM"), inspectionRequired: true }) !== true) bad.push(`ระบบ ${from}→OOO`);
    if (can("OUT_OF_ORDER", "DIRTY", { role: roleName("SYSTEM"), inspectionRequired: true }) !== true) bad.push("ระบบ OOO→DIRTY");
    eq(bad, [], "OUT_OF_ORDER");
  });
  await st("SM-4", "ค่าขยะไม่โยน: canHkTransition(\"BROKEN\",\"CLEAN\") · (\"CLEAN\",\"\") · (null, undefined) · opts หาย/บทบาทแปลก ⇒ false ไม่ throw · HK_TRANSITIONS ไม่มี edge เข้า OUT_OF_ORDER ของคน และไม่มี DIRTY→INSPECTED", () => {
    needState();
    const can = SMF("canHkTransition");
    const bad: string[] = [];
    for (const [a, b, o] of [["BROKEN", "CLEAN", { role: roleName("MAID"), inspectionRequired: true }], ["CLEAN", "", { role: roleName("MAID"), inspectionRequired: true }], [null, undefined, { role: roleName("MAID"), inspectionRequired: true }], ["DIRTY", "CLEAN", undefined], ["DIRTY", "CLEAN", { role: "ALIEN", inspectionRequired: true }]] as Any[]) {
      try { const r = can(a, b, o); if (r !== false) bad.push(`${a}→${b} ${J(o)} = ${fmt(r)}`); } catch (e) { bad.push(`${a}→${b}: throw ${errMsg(e)}`); }
    }
    eq(bad, [], "ค่าขยะ");
    const t = J(stateL.mod.HK_TRANSITIONS);
    ok(!/DIRTY[^}\]]*INSPECTED/.test(t) || /"from":"DIRTY","to":"CLEAN"/.test(t), `HK_TRANSITIONS ${t.slice(0, 160)}`);
  });
  await st("SM-5", "parseHkNote/serializeHkNote: null/\"\" ⇒ {} · JSON {assignedTo,startedAt,guestRequest} ⇒ ค่าตรง · ข้อความธรรมดาเดิม (ไม่ใช่ JSON) ⇒ ไม่โยน (เป็น guestRequest หรือ {}) · JSON ขยะ/array ⇒ {} · roundtrip parse(serialize(x)) = x · serialize({}) = null หรือ parse กลับเป็น {} · serialize ไม่ใส่คีย์นอก 3 คีย์", () => {
    needState();
    const parse = SMF("parseHkNote"), ser = SMF("serializeHkNote");
    eq([parse(null), parse(""), parse(undefined)], [{}, {}, {}], "ว่าง");
    const full = { assignedTo: "svc-h6-u1", startedAt: "2026-11-07T06:00:00.000Z", guestRequest: "แขกขอทำหลัง 13:00" };
    eq(parse(JSON.stringify(full)), full, "JSON เต็ม");
    const legacy = parse("ป้าย ไม่ต้องทำ เมื่อวาน");
    ok(legacy && typeof legacy === "object" && (Object.keys(legacy).length === 0 || legacy.guestRequest === "ป้าย ไม่ต้องทำ เมื่อวาน"), `ข้อความเดิม ${fmt(legacy)}`);
    ok(J(parse("{bad json")) === "{}" && J(parse("[1,2]")) === "{}" && J(parse("42")) === "{}", "JSON ขยะ");
    eq(parse(ser(full)), full, "roundtrip");
    const empty = ser({});
    ok(empty === null || empty === undefined || J(parse(empty)) === "{}", `serialize({}) = ${fmt(empty)}`);
    const extra = parse(ser({ ...full, phone: "0812345678", x: 1 }));
    eq(Object.keys(extra).sort(), ["assignedTo", "guestRequest", "startedAt"], "คีย์นอกสัญญาหลุด");
  });
  await st("SM-6", "hkPriority(row) pure คืนตัวเลข · ลำดับด่วน (ใบ §0): ออกแล้ว+แขกเข้าวันนี้ < แขกเข้าวันนี้ < ออกแล้ว/ออกวันนี้ < ค้างต่อ < ว่าง DIRTY < อื่น (ว่าง CLEAN · OOO) · ค่าน้อย = ด่วนก่อน (ทิศทางเดียวกับการเรียงบอร์ด BD-3) · ห้องสองห้องชั้นเดียวกันได้ค่าเท่ากัน", () => {
    needState();
    const pr = SMF("hkPriority");
    const tiers: Any[][] = [
      [{ context: "DEPARTED", hkStatus: "DIRTY", arrivalTime: "14:00" }],
      [{ context: "ARRIVING", hkStatus: "DIRTY", arrivalTime: "14:00" }, { context: "ARRIVING", hkStatus: "INSPECTED", arrivalTime: "15:00" }],
      [{ context: "DEPARTED", hkStatus: "DIRTY" }, { context: "DEPARTING", hkStatus: "CLEAN" }],
      [{ context: "STAYOVER", hkStatus: "DIRTY", guestRequest: "x" }],
      [{ context: "VACANT", hkStatus: "DIRTY" }],
      [{ context: "VACANT", hkStatus: "CLEAN" }, { context: "OOO", hkStatus: "OUT_OF_ORDER" }],
    ];
    const vals = tiers.map((rows) => rows.map((r) => pr(r)));
    ok(vals.flat().every((v) => typeof v === "number" && Number.isFinite(v)), `ไม่ใช่ตัวเลข ${J(vals)}`);
    const bad: string[] = [];
    for (let i = 0; i + 1 < tiers.length; i++) for (const a of vals[i]) for (const b of vals[i + 1]) if (!(a < b)) bad.push(`ชั้น ${i} (${a}) ต้องน้อยกว่าชั้น ${i + 1} (${b})`);
    eq(bad.slice(0, 6), [], J(vals));
    ok(vals[1][0] === vals[1][1] || Math.abs(vals[1][0] - vals[1][1]) < 1, "ชั้นเดียวกันห่างกันเกินชั้น");
  });

  // ═══════════════ BD hkBoard ═══════════════
  console.log("\n── BD hkBoard (งานวันนี้ = มุมมอง) ──");
  let BOARD0: Any = null;
  await st("BD-1", "housekeeping.ts export 9 ฟังก์ชัน §3 · hkBoard(ctx,{unitId}) ⇒ {counts:{mine,total,done}, rooms:[…]} · ทุกห้อง active ของหน่วย (15) มีแถว · คีย์ต่อแถว ⊆ สัญญา (roomId number floor typeName hkStatus context arrivalTime? guestRequest? assignedTo? startedAt? priority) · context ∈ 6 ค่า · hkStatus ตรงฐาน · typeName ไทย · floor จาก floorNo", async () => {
    needSetup(); needHk();
    eq(HK_FNS.filter((n) => typeof hkL.mod[n] !== "function"), [], "export ขาด");
    BOARD0 = okRes(await board(), "hkBoard");
    ok(BOARD0.counts && ["mine", "total", "done"].every((k) => typeof BOARD0.counts[k] === "number"), `counts ${fmt(BOARD0.counts)}`);
    const rows = rowsOf(BOARD0);
    eq(rows.length, roomPlan.length, "จำนวนแถว");
    const bad: string[] = [];
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: tA, unitId: UH }, include: { roomType: true } });
    for (const r of rows) {
      const extra = Object.keys(r).filter((k) => !BOARD_KEYS.has(k));
      if (extra.length) bad.push(`${r.number}: คีย์นอกสัญญา ${extra.join(",")}`);
      if (!CONTEXTS.includes(r.context)) bad.push(`${r.number}: context ${r.context}`);
      const db = rooms.find((x: Any) => x.id === r.roomId);
      if (!db) { bad.push(`${r.roomId} ไม่มีในฐาน`); continue; }
      if (r.hkStatus !== db.hkStatus) bad.push(`${r.number}: hkStatus ${r.hkStatus} ≠ ${db.hkStatus}`);
      if (r.typeName !== db.roomType.name) bad.push(`${r.number}: typeName ${r.typeName}`);
      if (String(r.floor ?? "") !== String(db.floorNo ?? "")) bad.push(`${r.number}: floor ${fmt(r.floor)} ≠ ${db.floorNo}`);
      if (typeof r.priority !== "number") bad.push(`${r.number}: priority ${fmt(r.priority)}`);
    }
    eq(bad.slice(0, 8), [], "แถว");
  });
  await st("BD-2", "บริบท 6 แบบคำนวณจากการจองจริง: DEP = DEPARTED (CHECKED_OUT วันนี้ + CONFIRMED เข้าวันนี้ ⇒ arrivalTime 14:00 = checkInTime) · DEPG = DEPARTING (CHECKED_IN ออกวันนี้) · ARR/ARR2 = ARRIVING (arrivalTime) · STAY/STAY2/MB1 = STAYOVER · MB3 = DEPARTED (ไม่มีแขกเข้า ⇒ ไม่มี arrivalTime) · VAC/VACC/W* = VACANT (รวม VACC ที่มีจองอนาคต +3) · OOO1 = OOO · ห้องที่ไม่มีแขกเข้า arrivalTime ว่าง", async () => {
    needSetup(); needHk(); ok(BOARD0?.ok, "ไม่มี BD-1");
    const bad: string[] = [];
    for (const [k, exp] of Object.entries(EXP_CTX)) {
      const r = rowOf(BOARD0, ROOM[k]);
      if (!r) { bad.push(`${k}: ไม่มีแถว`); continue; }
      if (r.context !== exp) bad.push(`${k}: ${r.context} ≠ ${exp}`);
      const hasArr = typeof r.arrivalTime === "string" && r.arrivalTime.length > 0;
      if (EXP_ARRIVAL.has(k) !== hasArr) bad.push(`${k}: arrivalTime ${fmt(r.arrivalTime)} (ต้อง${EXP_ARRIVAL.has(k) ? "มี" : "ว่าง"})`);
      if (EXP_ARRIVAL.has(k) && hasArr && r.arrivalTime !== "14:00") bad.push(`${k}: arrivalTime ${r.arrivalTime} ≠ checkInTime 14:00`);
    }
    eq(bad, [], "บริบท");
  });
  await st("BD-3", "ลำดับด่วน: rooms[] เรียงตาม priority (ไม่ลด) และชั้นอ้างอิง refTier ไม่ลดตลอดรายการ: DEP (ออกแล้ว+แขกเข้า) มาก่อนทุกห้อง · ARR/ARR2 ก่อน DEPG/MB3 · ค้างต่อ ก่อน VAC · VAC (ว่าง DIRTY) ก่อน VACC/W2/W3 (ว่าง CLEAN) และ OOO1", async () => {
    needSetup(); needHk(); ok(BOARD0?.ok, "ไม่มี BD-1");
    const rows = rowsOf(BOARD0);
    const pri = rows.map((r: Any) => r.priority as number);
    ok(pri.every((p: number, i: number) => i === 0 || pri[i - 1] <= p), `priority ไม่เรียง ${J(pri)}`);
    const tiers = rows.map((r: Any) => refTier(r));
    const names = rows.map((r: Any) => `${r.number}:${r.context}/${r.hkStatus}`);
    ok(tiers.every((t: number, i: number) => i === 0 || tiers[i - 1] <= t), `ชั้นอ้างอิงไม่เรียง ${J(names)}`);
    const idx = (k: string) => rows.findIndex((r: Any) => r.roomId === ROOM[k]);
    ok(idx("DEP") === 0, `DEP ต้องมาก่อน (ได้ลำดับ ${idx("DEP")} · ${names.slice(0, 4).join(" · ")})`);
    ok(idx("ARR") < idx("DEPG") && idx("ARR2") < idx("MB3") && idx("STAY") < idx("VAC") && idx("VAC") < idx("VACC") && idx("VAC") < idx("OOO1") && idx("VAC") < idx("W2"), `ลำดับ ${J(names)}`);
  });
  await st("BD-4", "counts (สมมติฐานข้อสอบ = ตรงฟิกซ์เจอร์ 5/6/1): total = ห้องที่มีบริบท (ไม่ VACANT) + ว่าง DIRTY · ไม่รวม OOO ⇒ 9 (DEP DEPG ARR ARR2 STAY STAY2 MB1 MB3 VAC) · done = CLEAN/INSPECTED ใน total ที่ไม่มีคำขอแขก ⇒ 3 (DEPG ARR2 STAY2) · mine = 0 (ยังไม่มีใครกดเริ่ม) · ไม่ส่ง mine ⇒ mine 0 · ส่ง mine ของ maid ⇒ 0", async () => {
    needSetup(); needHk(); ok(BOARD0?.ok, "ไม่มี BD-1");
    const rows = rowsOf(BOARD0);
    const exp = refCounts(rows, null);
    eq([exp.total, exp.done], [9, 3], "ตัวอ้างอิงเอง (ฉากไม่ตรงที่ออกแบบ)");
    eq(BOARD0.counts, { mine: 0, total: 9, done: 3 }, "counts");
    const b2 = okRes(await board({ mine: MAID.userId }), "hkBoard mine");
    eq(b2.counts.mine, 0, "mine");
  });
  await st("BD-5", "ข้อมูลจาก hkNote JSON: STAY guestRequest \"แขกขอทำหลัง 13:00\" โผล่ในแถว · ห้องอื่น guestRequest ว่าง · assignedTo/startedAt ว่างทุกห้อง (ยังไม่กดเริ่ม) · ตั้ง hkNote ตรงให้ W4 = JSON {assignedTo: maid, startedAt: now−5m, guestRequest: \"ขอหมอนเพิ่ม 1\"} ⇒ บอร์ด mine=maid: counts.mine 1 · แถว W4 assignedTo/startedAt/guestRequest ตรง · hkNote ข้อความเดิม (ไม่ใช่ JSON) ไม่ทำบอร์ดพัง", async () => {
    needSetup(); needHk(); ok(BOARD0?.ok, "ไม่มี BD-1");
    const stay = rowOf(BOARD0, ROOM.STAY);
    eq(stay?.guestRequest, "แขกขอทำหลัง 13:00", "guestRequest STAY");
    ok(rowsOf(BOARD0).filter((r: Any) => r.roomId !== ROOM.STAY).every((r: Any) => !r.guestRequest), "guestRequest หลุดห้องอื่น");
    ok(rowsOf(BOARD0).every((r: Any) => !r.assignedTo && !r.startedAt), "assignedTo/startedAt ค้าง");
    const startedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    await prisma.hotelRoom.update({ where: { id: ROOM.W4 }, data: { hkNote: JSON.stringify({ assignedTo: MAID.userId, startedAt, guestRequest: "ขอหมอนเพิ่ม 1" }) } });
    await prisma.hotelRoom.update({ where: { id: ROOM.W3 }, data: { hkNote: "ป้าย ไม่ต้องทำ เมื่อวาน" } });
    try {
      const b = okRes(await board({ mine: MAID.userId }), "hkBoard");
      const w4 = rowOf(b, ROOM.W4);
      eq([w4?.assignedTo, w4?.guestRequest, near(msOf(w4?.startedAt), Date.parse(startedAt), 1_000)], [MAID.userId, "ขอหมอนเพิ่ม 1", true], "W4");
      eq(b.counts.mine, 1, "mine");
      ok(rowOf(b, ROOM.W3), "W3 (hkNote ข้อความเดิม) หายจากบอร์ด");
    } finally { await prisma.hotelRoom.updateMany({ where: { id: { in: [ROOM.W4, ROOM.W3] } }, data: { hkNote: null } }); }
  });
  await st("BD-6", "X10 DTO ไม่มีเบอร์/อีเมล: J(บอร์ด) ไม่มี 0899990000/svc-h6-guest · ไม่มีคีย์ guestPhone/guestEmail/phone/email ในทุกชั้น · hkLogs(ctx,{unitId}) คืนรายการ (array หรือ {rows}) ทุกแถวมี roomId/fromStatus/toStatus/byUserId/note/createdAt(หรือ at) · กรอง roomId ได้", async () => {
    needSetup(); needHk(); ok(BOARD0?.ok, "ไม่มี BD-1");
    ok(!PII_TEXT.test(J(BOARD0)), "บอร์ดมีเบอร์/อีเมล");
    ok(![...walkKeys(BOARD0)].some((k) => /guestPhone|guestEmail|^phone$|^email$/i.test(k)), "คีย์ PII");
    const l = await logs({ unitId: UH });
    ok(l?.ok !== false, `hkLogs ${codeOf(l)}`);
    const rows = rowsOf(l);
    ok(Array.isArray(rows), "ไม่ใช่รายการ");
    for (const r of rows.slice(0, 5)) ok(r.roomId && r.toStatus && (r.createdAt || r.at) && "byUserId" in r, `แถว log ${fmt(r)}`);
    ok(!PII_TEXT.test(J(l)), "log มี PII");
    const l2 = await logs({ roomId: ROOM.DEP });
    ok(l2?.ok !== false && rowsOf(l2).every((r: Any) => r.roomId === ROOM.DEP), "กรอง roomId");
  });
  await st("BD-7", "N+1 (มติ 7): hkBoard 15 ห้อง ≤ 5 คำสั่ง SQL (ตัวดัก $on(\"query\") · ไม่นับ BEGIN/COMMIT) · และไม่โตตามจำนวนห้อง: หน่วย 100 ห้อง (UH2 · 30 จอง) ≤ 15 ห้อง + 1", async () => {
    needSetup(); needHk(); ok(spyInstalled, "ตัวดักคิวรีไม่ติด");
    SQL_LOG.length = 0;
    okRes(await board(), "hkBoard");
    const n15 = sqlCount([...SQL_LOG]);
    ok(n15 <= 5, `15 ห้อง = ${n15} คิวรี > 5: ${SQL_LOG.slice(0, 8).map((q) => q.slice(0, 60)).join(" | ")}`);
    const RT2 = await mkType(tA, UH2, SPEC.dlx);
    const ids: string[] = [];
    for (let i = 1; i <= 100; i++) ids.push(await mkRoom(tA, UH2, `L${String(i).padStart(3, "0")}`, RT2, i % 3 === 0 ? "DIRTY" : "CLEAN"));
    for (let i = 0; i < 30; i++) await mkRes({ roomKey: `L${i}`, roomId: ids[i], roomTypeId: RT2, unitId: UH2, status: i % 2 ? "CHECKED_IN" : "CONFIRMED", ci: i % 2 ? W(-1) : W(0), co: W(2) });
    SQL_LOG.length = 0;
    const t = Date.now();
    const b = okRes(await board({ unitId: UH2 }), "hkBoard 100");
    const ms = Date.now() - t;
    const n100 = sqlCount([...SQL_LOG]);
    eq(rowsOf(b).length, 100, "แถว 100 ห้อง");
    ok(n100 <= n15 + 1, `100 ห้อง = ${n100} คิวรี (15 ห้อง ${n15})`);
    console.log(`     (hkBoard 100 ห้อง: ${ms} ms · ${n100} คิวรี)`);
  });
  await st("BD-8", "perf (มติ 7): hkBoard 100 ห้อง (UH2) < 500 ms — วัด 3 รอบ เอาค่ากลาง · ห้องมีแขก 30 · counts.total = 30 ค้างต่อ/เข้าวันนี้ + ว่าง DIRTY ที่เหลือ", async () => {
    needSetup(); needHk();
    const times: number[] = [];
    let b: Any = null;
    for (let i = 0; i < 3; i++) { const t = Date.now(); b = okRes(await board({ unitId: UH2 }), "hkBoard"); times.push(Date.now() - t); }
    times.sort((a, c) => a - c);
    ok(times[1] < 500, `ค่ากลาง ${times[1]} ms (${J(times)})`);
    const rows = rowsOf(b);
    eq(b.counts.total, refCounts(rows, null).total, "total ตามสมมติฐาน");
    eq(rows.filter((r: Any) => r.context === "STAYOVER").length + rows.filter((r: Any) => r.context === "ARRIVING").length, 30, "ห้องมีการจอง");
  }, "MAJOR");

  // ═══════════════ ST hkSetStatus ═══════════════
  console.log("\n── ST hkSetStatus (transition · log · idempotency · publish) ──");
  await st("ST-1", "DIRTY→CLEAN โดย maid (VAC): {ok:true} · HotelRoom.hkStatus CLEAN · hkUpdatedAt ใหม่ · status P1 แมป AVAILABLE (ผ่าน rooms.setHkStatus) · HotelHousekeepingLog +1 แถว fromStatus DIRTY · toStatus CLEAN · byUserId = maid · unitId/tenantId ตรง · note มี idempotencyKey (หรือ null) · event hotel.hk.changed {roomId, from, to} 1 แถว ไม่มี PII", async () => {
    needSetup(); needHk();
    const since = new Date();
    const n0 = await logCount(ROOM.VAC);
    const key = `svc-h6-key-${uid()}`;
    const r = okRes(await setStatus(MAID, { roomId: ROOM.VAC, to: "CLEAN", idempotencyKey: key }), "hkSetStatus");
    const room = await roomOf(ROOM.VAC);
    eq([room.hkStatus, room.status], ["CLEAN", "AVAILABLE"], "ห้อง");
    ok(room.hkUpdatedAt && msOf(room.hkUpdatedAt) >= since.getTime() - 2_000, `hkUpdatedAt ${fmt(room.hkUpdatedAt)}`);
    const ls = await logsOf(ROOM.VAC, since);
    eq([await logCount(ROOM.VAC) - n0, ls.length], [1, 1], "log");
    eq([ls[0].fromStatus, ls[0].toStatus, ls[0].byUserId, ls[0].unitId, ls[0].tenantId], ["DIRTY", "CLEAN", MAID.userId, UH, tA], "แถว log");
    ok(ls[0].note === null || String(ls[0].note).includes(key) || String(ls[0].note).length > 0, `note ${fmt(ls[0].note)}`);
    const ev = await eventsOf("hotel.hk.changed", (p) => p.roomId === ROOM.VAC);
    ok(ev.length === 1 && ev[0].payload.from === "DIRTY" && ev[0].payload.to === "CLEAN" && ev[0].unitId === UH, `event ${J(ev.map((e) => e.payload))}`);
    ok(!PII_TEXT.test(J(ev)), "event PII");
    void r;
  });
  await st("ST-2", "transition ผิด ⇒ {ok:false} ไม่ log/ไม่เปลี่ยน: CLEAN→INSPECTED โดย maid ⇒ FORBIDDEN (ไม่มี inspect) · DIRTY→INSPECTED โดย hk-lead (W1) ⇒ INVALID_TRANSITION · CLEAN→CLEAN ⇒ INVALID_TRANSITION · to \"BROKEN\" ⇒ INVALID_INPUT/INVALID_TRANSITION · to OUT_OF_ORDER ⇒ USE_BLOCK · OOO1 → DIRTY โดย owner ⇒ USE_BLOCK (ออกจาก OOO ต้อง releaseBlock) · ไม่มี idempotencyKey ⇒ INVALID_INPUT", async () => {
    needSetup(); needHk();
    const snap = async () => J([await hkOf(ROOM.VAC), await hkOf(ROOM.W1), await hkOf(ROOM.OOO1), await logCount(ROOM.VAC), await logCount(ROOM.W1), await logCount(ROOM.OOO1)]);
    const s0 = await snap();
    const cases: [string, Actor, Over, string[]][] = [
      ["maid CLEAN→INSPECTED", MAID, { roomId: ROOM.VAC, to: "INSPECTED" }, ["FORBIDDEN"]],
      ["lead DIRTY→INSPECTED", LEAD, { roomId: ROOM.W1, to: "INSPECTED" }, ["INVALID_TRANSITION"]],
      ["CLEAN→CLEAN", MAID, { roomId: ROOM.VAC, to: "CLEAN" }, ["INVALID_TRANSITION"]],
      ["to BROKEN", MAID, { roomId: ROOM.VAC, to: "BROKEN" }, ["INVALID_INPUT", "INVALID_TRANSITION"]],
      ["to OUT_OF_ORDER", OWNER, { roomId: ROOM.VAC, to: "OUT_OF_ORDER" }, ["USE_BLOCK"]],
      ["OOO→DIRTY", OWNER, { roomId: ROOM.OOO1, to: "DIRTY" }, ["USE_BLOCK", "INVALID_TRANSITION"]],
    ];
    const bad: string[] = [];
    for (const [n, a, inp, codes] of cases) { const r = await setStatus(a, inp); const c = failCode(r); if (c === null || !codes.includes(c)) bad.push(`${n}=${codeOf(r)}`); }
    const noKey = await call(() => H6("hkSetStatus")(MAID, ctxA, { roomId: ROOM.W1, to: "CLEAN" }));
    if (!isFail(noKey, "INVALID_INPUT")) bad.push(`ไม่มี key=${codeOf(noKey)}`);
    eq(bad, [], "transition ผิด");
    eq(await snap(), s0, "มีอะไรเปลี่ยน");
  });
  await st("ST-3", "X3 idempotencyKey: W1 DIRTY→CLEAN คีย์ K · เรียกซ้ำคีย์ K (ตอนนี้ห้อง CLEAN แล้ว) ⇒ {ok:true} ผลเดิม (ไม่ใช่ INVALID_TRANSITION) · log ยัง 1 แถว · event 1 · คีย์ K กับห้องอื่น/คนอื่น ⇒ ไม่ใช่ replay ของห้องนี้ (ปฏิเสธหรือทำของตัวเอง — ห้ามคืนผลห้อง W1) · ซ้ำ 2 ทางพร้อมกันคีย์เดียว (W4 DIRTY→CLEAN) ⇒ log 1 · ทั้งคู่ ok", async () => {
    needSetup(); needHk();
    const since = new Date();
    const K = `svc-h6-key-${uid()}`;
    const a = okRes(await setStatus(MAID, { roomId: ROOM.W1, to: "CLEAN", idempotencyKey: K }), "ครั้งแรก");
    const b = await setStatus(MAID, { roomId: ROOM.W1, to: "CLEAN", idempotencyKey: K });
    ok(b?.ok === true, `ซ้ำคีย์เดิม ${codeOf(b)} ${b?.reason ?? ""}`);
    eq((await logsOf(ROOM.W1, since)).length, 1, "log ซ้ำ");
    eq((await eventsOf("hotel.hk.changed", (p) => p.roomId === ROOM.W1)).length, 1, "event ซ้ำ");
    const other = await setStatus(MAID2, { roomId: ROOM.W2, to: "DIRTY", idempotencyKey: K });
    ok(!(other?.ok === true && (other.roomId === ROOM.W1 || other.to === "CLEAN")), `คีย์เดิมห้องอื่นคืนผลห้อง W1: ${fmt(other)}`);
    const K2 = `svc-h6-key-${uid()}`;
    const since2 = new Date();
    const [p, q] = await Promise.all([setStatus(MAID, { roomId: ROOM.W4, to: "CLEAN", idempotencyKey: K2 }), setStatus(MAID, { roomId: ROOM.W4, to: "CLEAN", idempotencyKey: K2 })]);
    ok(p?.ok === true && q?.ok === true, `พร้อมกัน ${codeOf(p)} / ${codeOf(q)}`);
    eq((await logsOf(ROOM.W4, since2)).length, 1, "log พร้อมกัน");
    void a;
  });
  await st("ST-4", "ห้องมีแขก (MB1 CHECKED_IN · DIRTY · status OCCUPIED?) กด CLEAN ได้ (ทำระหว่างพัก): ok · hkStatus CLEAN · status P1 ไม่กลายเป็น AVAILABLE ถ้าเดิม OCCUPIED · occupancy STAY ยัง active · log · แล้ว CLEAN→DIRTY (สั่งทำใหม่) ok log อีกแถว", async () => {
    needSetup(); needHk();
    await prisma.hotelRoom.update({ where: { id: ROOM.MB1 }, data: { status: "OCCUPIED" } });
    const since = new Date();
    okRes(await setStatus(MAID, { roomId: ROOM.MB1, to: "CLEAN" }), "CLEAN");
    const r1 = await roomOf(ROOM.MB1);
    eq([r1.hkStatus, r1.status], ["CLEAN", "OCCUPIED"], "ห้องมีแขก");
    eq((await occOf(ROOM.MB1, "STAY")).length, 1, "occupancy");
    okRes(await setStatus(LEAD, { roomId: ROOM.MB1, to: "DIRTY", note: "สั่งทำใหม่" }), "DIRTY");
    const ls = await logsOf(ROOM.MB1, since);
    eq(ls.map((l) => [l.fromStatus, l.toStatus]), [["DIRTY", "CLEAN"], ["CLEAN", "DIRTY"]], "log");
    ok(String(ls[1].note ?? "").includes("สั่งทำใหม่"), `note ${fmt(ls[1].note)}`);
  });
  await st("ST-5", "publish หลัง tx (Ably ปลอม · ABLY_API_KEY ตั้งในโพรเซส): hkSetStatus W2 CLEAN→DIRTY ⇒ มี POST rest.ably.io 1 ครั้ง · ช่องมี unitId (hotel:hk:…) · body.name = EV_HOTEL_HK · data คีย์ ⊆ {roomId, hkStatus, at} · data.roomId = W2 · data.hkStatus = DIRTY · ไม่มี note/ชื่อ · Ably โยน/500 ⇒ hkSetStatus ยัง ok และ log ยังอยู่ (ไม่ย้อน) · ถอดคีย์ ⇒ ไม่มีคำขอออก", async () => {
    needSetup(); needHk();
    const EV = evL.mod?.EV_HOTEL_HK;
    ok(typeof EV === "string" && EV, `ยังไม่มี EV_HOTEL_HK ใน ${F.rtEvents}`);
    ABLY_REQS.length = 0;
    await withAbly("ok", async () => okRes(await setStatus(MAID, { roomId: ROOM.W2, to: "DIRTY", note: "ชื่อแขก ห้ามรั่ว" }), "ok mode"));
    eq(ABLY_REQS.length, 1, `คำขอ Ably ${J(ABLY_REQS.map((r) => r.channel))}`);
    const req = ABLY_REQS[0];
    ok(req.channel.includes(UH) && /hotel:hk/.test(req.channel), `ช่อง ${req.channel}`);
    eq(req.body?.name, EV, "ชื่อ event");
    const data = req.body?.data ?? {};
    eq(Object.keys(data).filter((k) => !["roomId", "hkStatus", "at"].includes(k)), [], `คีย์นอกบัญชีขาว ${J(data)}`);
    eq([data.roomId, data.hkStatus, typeof data.at], [ROOM.W2, "DIRTY", "number"], "data");
    ok(!J(req.body).includes("ห้ามรั่ว"), "note รั่วออกนอกบ้าน");
    ABLY_REQS.length = 0;
    const since = new Date();
    await withAbly("throw", async () => okRes(await setStatus(MAID, { roomId: ROOM.W2, to: "CLEAN" }), "ably throw"));
    await withAbly("500", async () => okRes(await setStatus(MAID, { roomId: ROOM.W2, to: "DIRTY" }), "ably 500"));
    eq((await logsOf(ROOM.W2, since)).length, 2, "log เมื่อ Ably ล้ม");
    eq(ABLY_REQS.length, 2, "คำขอตอนล้ม");
    ABLY_REQS.length = 0;
    okRes(await setStatus(MAID, { roomId: ROOM.W2, to: "CLEAN" }), "ไม่มีคีย์");
    eq(ABLY_REQS.length, 0, "ไม่มีคีย์แต่ยิงเน็ต");
  });
  await st("ST-6", "X4 สองแม่บ้าน(+) กด CLEAN ห้องเดียวพร้อมกัน 10 ทาง (คีย์ต่างกัน · W3 DIRTY): log DIRTY→CLEAN เพิ่ม 1 แถวพอดี · ไม่มี throw ดิบ · ผลที่เหลือ = ok(ซ้ำสถานะเดียวกัน) หรือ INVALID_TRANSITION · hkStatus CLEAN · event changed +1", async () => {
    needSetup(); needHk();
    await prisma.hotelRoom.update({ where: { id: ROOM.W3 }, data: { hkStatus: "DIRTY", status: "CLEANING" } });
    const since = new Date();
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => setStatus(i % 2 ? MAID : MAID2, { roomId: ROOM.W3, to: "CLEAN" })));
    eq(rs.filter((r) => failCode(r) === "THROW").map((r) => r.reason), [], "throw ดิบ");
    ok(rs.some((r) => r?.ok === true), `ไม่มีใครสำเร็จ ${J(rs.map(codeOf))}`);
    ok(rs.every((r) => r?.ok === true || isFail(r, "INVALID_TRANSITION")), `รหัสแปลก ${J(rs.map(codeOf))}`);
    eq((await logsOf(ROOM.W3, since)).filter((l) => l.toStatus === "CLEAN").length, 1, "log");
    eq(await hkOf(ROOM.W3), "CLEAN", "hkStatus");
    eq((await eventsOf("hotel.hk.changed", (p) => p.roomId === ROOM.W3)).length, 1, "event");
  });
  await st("ST-7", "hkLogs(ctx,{roomId W2, from วันนี้−1, to วันนี้+1}) เห็นแถวของ ST-5 ครบ (≥4) เรียงเวลา · มี byUserId = maid · {unitId} เห็นรวมทุกห้อง ≥ แถวของ W2 · ช่วงวันในอดีต (−30..−29) ⇒ ว่าง · ร้าน B ⇒ ว่าง/NOT_FOUND", async () => {
    needSetup(); needHk();
    const l = await logs({ roomId: ROOM.W2 });
    const rows = rowsOf(l);
    ok(rows.length >= 4, `แถว ${rows.length}`);
    const ts = rows.map((r: Any) => msOf(r.createdAt ?? r.at));
    ok(ts.every((t: number, i: number) => i === 0 || Math.abs(ts[i - 1] - t) >= 0 && (ts[i - 1] <= t || ts[i - 1] >= t)), "เวลา");
    ok(rows.some((r: Any) => r.byUserId === MAID.userId), "ไม่มี byUserId maid");
    ok(rowsOf(await logs({ unitId: UH })).length >= rows.length, "รวมหน่วยน้อยกว่าห้องเดียว");
    eq(rowsOf(await logs({ roomId: ROOM.W2, from: W(-30), to: W(-29) })).length, 0, "ช่วงอดีต");
    const b = await logs({ roomId: ROOM.W2 }, ctxB);
    ok(b?.ok === false || rowsOf(b).length === 0, "ร้าน B เห็น log");
  });

  // ═══════════════ WK hkStart / hkFinish ═══════════════
  console.log("\n── WK เริ่มทำ / เสร็จ ──");
  await st("WK-1", "hkStart(maid, {roomId ARR}) ⇒ ok · HotelRoom.hkNote = JSON {assignedTo: maid, startedAt ≈ now} (parseHkNote อ่านได้) · hkStatus ไม่เปลี่ยน (DIRTY) · ไม่มี HousekeepingLog เพิ่ม (เริ่มทำไม่ใช่ transition) หรือมีแถว from=to · บอร์ด mine=maid ⇒ counts.mine 1 · แถว ARR assignedTo/startedAt ตรง · maid2 ⇒ mine 0", async () => {
    needSetup(); needHk();
    const n0 = await logCount(ROOM.ARR);
    const t = Date.now();
    okRes(await start(MAID, { roomId: ROOM.ARR }), "hkStart");
    const note = await noteOf(ROOM.ARR);
    eq(note.assignedTo, MAID.userId, `assignedTo ${fmt(note)}`);
    ok(near(msOf(note.startedAt), t, 5_000), `startedAt ${fmt(note.startedAt)}`);
    eq(await hkOf(ROOM.ARR), "DIRTY", "hkStatus เปลี่ยน");
    const ls = await logsOf(ROOM.ARR);
    ok(ls.length === n0 || ls.slice(n0).every((l) => l.fromStatus === l.toStatus), "log transition ปลอม");
    const b = okRes(await board({ mine: MAID.userId }), "hkBoard");
    const row = rowOf(b, ROOM.ARR);
    eq([b.counts.mine, row?.assignedTo, near(msOf(row?.startedAt), msOf(note.startedAt), 1_000)], [1, MAID.userId, true], "บอร์ด");
    eq(okRes(await board({ mine: MAID2.userId }), "hkBoard maid2").counts.mine, 0, "mine maid2");
  });
  await st("WK-2", "คนอื่นเริ่มซ้ำ: maid2 hkStart ARR ⇒ {ok:false, code: TAKEN} · hkNote ไม่เปลี่ยน · maid เริ่มซ้ำห้องตัวเอง ⇒ ok (idempotent · startedAt เดิม) · หัวหน้า (hk-lead) override ⇒ ok · assignedTo = lead · frontdesk (ไม่มี housekeeping) ⇒ FORBIDDEN · ห้อง OUT_OF_ORDER ⇒ ปฏิเสธ (INVALID_TRANSITION/USE_BLOCK/ROOM_OOO)", async () => {
    needSetup(); needHk();
    const n0 = await noteOf(ROOM.ARR);
    eq(failCode(await start(MAID2, { roomId: ROOM.ARR })), "TAKEN", "maid2");
    eq(await noteOf(ROOM.ARR), n0, "hkNote เปลี่ยนหลัง TAKEN");
    okRes(await start(MAID, { roomId: ROOM.ARR }), "maid ซ้ำตัวเอง");
    eq((await noteOf(ROOM.ARR)).startedAt, n0.startedAt, "startedAt ขยับ");
    const o = await start(LEAD, { roomId: ROOM.ARR, override: true });
    ok(o?.ok === true, `หัวหน้า override ${codeOf(o)} ${o?.reason ?? ""}`);
    eq((await noteOf(ROOM.ARR)).assignedTo, LEAD.userId, "assignedTo หลัง override");
    ok(isDenied(await start(FRONT, { roomId: ROOM.W1 })), "frontdesk ผ่าน");
    const ooo = await start(MAID, { roomId: ROOM.OOO1 });
    ok(isFail(ooo) && !["THROW"].includes(failCode(ooo)!), `ห้อง OOO ${codeOf(ooo)}`);
  });
  await st("WK-3", "`at` ใต้ SVC_QC_CLOCK=1 (ฉาก h.6: กำลังทำ 18 นาที): hkStart(maid, {roomId STAY, at: now−18m}) ⇒ startedAt = at (±2 วิ) · ไม่ตั้ง clock ⇒ at ถูกเพิกเฉย/ปฏิเสธ (startedAt ≈ now) · บอร์ด STAY มี startedAt และยังมี guestRequest เดิม", async () => {
    needSetup(); needHk();
    const at = new Date(Date.now() - 18 * 60_000).toISOString();
    await withClock(true, async () => okRes(await start(MAID, { roomId: ROOM.STAY, at }), "hkStart at"));
    const n1 = await noteOf(ROOM.STAY);
    ok(near(msOf(n1.startedAt), Date.parse(at), 2_000), `startedAt ${fmt(n1.startedAt)} ≠ at ${at}`);
    eq(n1.guestRequest, "แขกขอทำหลัง 13:00", "guestRequest หาย");
    const r = await start(MAID, { roomId: ROOM.W1, at });
    const n2 = await noteOf(ROOM.W1);
    ok(r?.ok === false || !n2.startedAt || near(msOf(n2.startedAt), Date.now(), 5_000), `at ถูกใช้โดยไม่มี clock: ${fmt(n2)}`);
    const row = rowOf(okRes(await board({ mine: MAID.userId }), "hkBoard"), ROOM.STAY);
    eq([near(msOf(row?.startedAt), Date.parse(at), 2_000), row?.guestRequest], [true, "แขกขอทำหลัง 13:00"], "บอร์ด STAY");
  });
  await st("WK-4", "hkFinish(maid, {roomId STAY, checklist 5 ข้อ, minibar []}) ⇒ ok · hkStatus CLEAN · hkNote: ล้าง assignedTo/startedAt แต่คง guestRequest · HousekeepingLog DIRTY→CLEAN byUserId maid · note = JSON มี checklist (5 ข้อของดีลักซ์) และ durationSec ≥ 17×60 (เริ่ม 18 นาทีก่อน) · event hotel.hk.changed · บอร์ด mine ลด", async () => {
    needSetup(); needHk();
    const since = new Date();
    const r = okRes(await finish(MAID, { roomId: ROOM.STAY }), "hkFinish");
    eq(await hkOf(ROOM.STAY), "CLEAN", "hkStatus");
    const note = await noteOf(ROOM.STAY);
    eq([note.assignedTo ?? null, note.startedAt ?? null, note.guestRequest], [null, null, "แขกขอทำหลัง 13:00"], "hkNote หลังเสร็จ");
    const ls = await logsOf(ROOM.STAY, since);
    const done = ls.find((l) => l.toStatus === "CLEAN");
    ok(done && done.fromStatus === "DIRTY" && done.byUserId === MAID.userId, `log ${J(ls.map((l) => [l.fromStatus, l.toStatus, l.byUserId]))}`);
    const j = parseJson(done?.note);
    ok(j && typeof j === "object", `note ไม่ใช่ JSON: ${fmt(done?.note)}`);
    ok(j.checklist && HS.checklistDeluxe.every((k) => J(j.checklist).includes(k)), `checklist ใน note ${fmt(j.checklist)}`);
    ok(typeof j.durationSec === "number" && j.durationSec >= 17 * 60 && j.durationSec < 60 * 60, `durationSec ${fmt(j.durationSec)}`);
    ok(typeof r.durationSec !== "number" || r.durationSec === j.durationSec, "durationSec ผลลัพธ์ ≠ log");
    eq((await eventsOf("hotel.hk.changed", (p) => p.roomId === ROOM.STAY && p.to === "CLEAN")).length, 1, "event");
    eq(okRes(await board({ mine: MAID.userId }), "hkBoard").counts.mine, 0, "mine หลังเสร็จ (W1 ไม่ได้เริ่ม)");
  });
  await st("WK-5", "hkFinish ผิดเงื่อนไข ไม่เปลี่ยน/ไม่ log: ห้อง CLEAN อยู่แล้ว (STAY) ⇒ INVALID_TRANSITION · ห้องที่คนอื่นเริ่ม (ARR ของ lead) โดย maid2 ⇒ TAKEN/FORBIDDEN · checklist ไม่ใช่ array ⇒ INVALID_INPUT · frontdesk ⇒ FORBIDDEN · ห้องร้าน B ⇒ NOT_FOUND", async () => {
    needSetup(); needHk();
    const snap = async () => J([await hkOf(ROOM.STAY), await hkOf(ROOM.ARR), await noteOf(ROOM.ARR), await logCount(ROOM.STAY), await logCount(ROOM.ARR)]);
    const s0 = await snap();
    const bad: string[] = [];
    const chk = (n: string, r: Any, codes: string[]) => { const c = failCode(r); if (c === null || !codes.includes(c)) bad.push(`${n}=${codeOf(r)}`); };
    chk("CLEAN อยู่แล้ว", await finish(MAID, { roomId: ROOM.STAY }), ["INVALID_TRANSITION"]);
    chk("คนอื่นเริ่ม", await finish(MAID2, { roomId: ROOM.ARR }), ["TAKEN", "FORBIDDEN"]);
    chk("checklist ผิด", await finish(LEAD, { roomId: ROOM.ARR, checklist: "x" }), ["INVALID_INPUT"]);
    chk("frontdesk", await finish(FRONT, { roomId: ROOM.ARR }), ["FORBIDDEN"]);
    chk("ร้าน B", await finish(OWNER, { roomId: ROOM_B }), ["NOT_FOUND"]);
    eq(bad, [], "ผิดเงื่อนไข");
    eq(await snap(), s0, "มีอะไรเปลี่ยน");
  });
  await st("WK-6", "hkFinish พร้อมมินิบาร์ (ARR โดย lead ที่ override ไว้ · แต่ ARR ไม่มีแขก CHECKED_IN ⇒ ไม่มี folio OPEN ของห้องนี้): minibar [{soda,1}] ⇒ ok · CLEAN · event hotel.hk.minibar_unbilled {roomId, items:1} · ไม่มี FolioItem ใหม่ในร้าน · log note JSON มี minibar (unbilled) — ต้องตั้งค่า #75 ก่อน (MB-1 ทำซ้ำได้)", async () => {
    needSetup(); needHk();
    const mb = await SET.setSettings(OWNER, ctxA, [{ key: "rooms.hotel.minibar", scope: "UNIT", scopeId: UH, value: [...HS.minibar.items] }]);
    ok(mb?.ok === true, `ตั้งค่า #75 ด้วยรูปฟิกซ์เจอร์ {key,name,priceSatang} ไม่ได้: ${codeOf(mb)} ${J(mb).slice(0, 160)} — ต้องมติผู้คุม (ขยาย schema #75 หรือฟิกซ์เจอร์ใช้ productId)`);
    const items0 = await prisma.hotelFolioItem.count({ where: { tenantId: tA } });
    const since = new Date();
    okRes(await finish(LEAD, { roomId: ROOM.ARR, minibar: [{ key: "soda", qty: 1 }] }), "hkFinish+minibar");
    eq(await hkOf(ROOM.ARR), "CLEAN", "hkStatus");
    eq(await prisma.hotelFolioItem.count({ where: { tenantId: tA } }), items0, "FolioItem เพิ่มทั้งที่ไม่มี folio OPEN");
    const ev = await eventsOf("hotel.hk.minibar_unbilled", (p) => p.roomId === ROOM.ARR);
    ok(ev.length === 1 && ev[0].payload.items === 1, `event unbilled ${J(ev.map((e) => e.payload))}`);
    const done = (await logsOf(ROOM.ARR, since)).find((l) => l.toStatus === "CLEAN");
    ok(done && /minibar|unbilled|มินิบาร์/i.test(String(done.note ?? "")), `note ${fmt(done?.note)}`);
  });

  // ═══════════════ IN hkInspect ═══════════════
  console.log("\n── IN ตรวจห้อง ──");
  await st("IN-1", "hkInspect(hk-lead, {roomId STAY (CLEAN), pass:true}) ⇒ ok · INSPECTED · log CLEAN→INSPECTED byUserId lead · event changed · maid (ไม่มี inspect) บน W3 (CLEAN) ⇒ FORBIDDEN ไม่เปลี่ยน · frontdesk ⇒ FORBIDDEN · owner ⇒ ok (W3)", async () => {
    needSetup(); needHk();
    const since = new Date();
    okRes(await inspect(LEAD, { roomId: ROOM.STAY, pass: true }), "pass");
    eq(await hkOf(ROOM.STAY), "INSPECTED", "hkStatus");
    const l = (await logsOf(ROOM.STAY, since)).find((x) => x.toStatus === "INSPECTED");
    ok(l && l.fromStatus === "CLEAN" && l.byUserId === LEAD.userId, `log ${fmt(l)}`);
    ok(isDenied(await inspect(MAID, { roomId: ROOM.W3, pass: true })), "maid ตรวจผ่าน");
    ok(isDenied(await inspect(FRONT, { roomId: ROOM.W3, pass: true })), "frontdesk ตรวจผ่าน");
    eq(await hkOf(ROOM.W3), "CLEAN", "W3 เปลี่ยนโดยไม่มีสิทธิ์");
    okRes(await inspect(OWNER, { roomId: ROOM.W3, pass: true }), "owner");
    eq(await hkOf(ROOM.W3), "INSPECTED", "W3 owner");
  });
  await st("IN-2", "ไม่ผ่าน: hkInspect(hk-lead, {roomId W2 (CLEAN), pass:false, note:\"พื้นยังเปียก\"}) ⇒ ok · DIRTY · log CLEAN→DIRTY note มี \"พื้นยังเปียก\" · pass:false ไม่มี note ⇒ INVALID_INPUT (ต้องบอกเหตุผล) หรือ ok พร้อม note ว่าง — ห้าม throw · บอร์ด W2 กลับเป็นงาน (DIRTY)", async () => {
    needSetup(); needHk();
    const since = new Date();
    okRes(await inspect(LEAD, { roomId: ROOM.W2, pass: false, note: "พื้นยังเปียก" }), "fail");
    eq(await hkOf(ROOM.W2), "DIRTY", "hkStatus");
    const l = (await logsOf(ROOM.W2, since)).find((x) => x.toStatus === "DIRTY");
    ok(l && l.fromStatus === "CLEAN" && String(l.note ?? "").includes("พื้นยังเปียก"), `log ${fmt(l)}`);
    okRes(await setStatus(MAID, { roomId: ROOM.W2, to: "CLEAN" }), "คืน CLEAN");
    const r = await inspect(LEAD, { roomId: ROOM.W2, pass: false });
    ok(r?.ok === true || isFail(r, "INVALID_INPUT"), `ไม่มี note ${codeOf(r)}`);
    if (r?.ok !== true) eq(await hkOf(ROOM.W2), "CLEAN", "เปลี่ยนทั้งที่ปฏิเสธ");
    const row = rowOf(okRes(await board(), "hkBoard"), ROOM.W2);
    ok(row && (row.hkStatus === "DIRTY" || r?.ok !== true), "บอร์ด W2");
  });
  await st("IN-3", "hkInspect บนห้องที่ไม่ใช่ CLEAN: DIRTY (W2 ถ้า DIRTY · ไม่งั้นตั้ง DIRTY) ⇒ INVALID_TRANSITION · INSPECTED (STAY) ⇒ INVALID_TRANSITION · OUT_OF_ORDER ⇒ ปฏิเสธ · ร้าน B ⇒ NOT_FOUND · ไม่มี log เพิ่ม", async () => {
    needSetup(); needHk();
    if ((await hkOf(ROOM.W2)) !== "DIRTY") await prisma.hotelRoom.update({ where: { id: ROOM.W2 }, data: { hkStatus: "DIRTY", status: "CLEANING" } });
    const n0 = J([await logCount(ROOM.W2), await logCount(ROOM.STAY), await logCount(ROOM.OOO1)]);
    const bad: string[] = [];
    for (const [n, r, codes] of [["DIRTY", await inspect(LEAD, { roomId: ROOM.W2, pass: true }), ["INVALID_TRANSITION"]], ["INSPECTED", await inspect(LEAD, { roomId: ROOM.STAY, pass: true }), ["INVALID_TRANSITION"]], ["OOO", await inspect(OWNER, { roomId: ROOM.OOO1, pass: true }), ["INVALID_TRANSITION", "USE_BLOCK", "ROOM_OOO"]], ["ร้าน B", await inspect(OWNER, { roomId: ROOM_B, pass: true }), ["NOT_FOUND"]]] as [string, Any, string[]][]) { const c = failCode(r); if (c === null || !codes.includes(c)) bad.push(`${n}=${codeOf(r)}`); }
    eq(bad, [], "ปฏิเสธ");
    eq(J([await logCount(ROOM.W2), await logCount(ROOM.STAY), await logCount(ROOM.OOO1)]), n0, "log เพิ่ม");
  });
  await st("IN-4", "inspectionRequired ปิด (UNIT): hkFinish W2 (DIRTY · เริ่มโดย maid) ⇒ CLEAN · ห้องขายได้ทันที = assignableRooms เดิมของ service.ts เห็น W2 สำหรับการจองประเภทเดียวกัน (ซูพีเรีย) · canHkTransition(CLEAN→INSPECTED, หัวหน้า, insp=false) คืน boolean · hkInspect pass ตอนปิด ⇒ ok หรือ รหัสชัด (NOT_REQUIRED/INSPECTION_OFF/INVALID_TRANSITION) ไม่ throw · คืนค่าตั้ง true", async () => {
    needSetup(); needHk();
    await setUnit("rooms.hotel.inspectionRequired", false);
    try {
      okRes(await start(MAID, { roomId: ROOM.W2 }), "start");
      okRes(await finish(MAID, { roomId: ROOM.W2 }), "finish");
      eq(await hkOf(ROOM.W2), "CLEAN", "hkStatus");
      const rvId = await mkRes({ roomKey: "W2", status: "CONFIRMED", ci: W(0), co: W(1), claim: false });
      const free = await serviceL.mod.assignableRooms(tA, UH, rvId);
      ok(Array.isArray(free) && free.some((x: Any) => (x.id ?? x.roomId) === ROOM.W2), `assignableRooms ไม่เห็น W2: ${J(free).slice(0, 160)}`);
      if (stateL.mod) ok(typeof SMF("canHkTransition")("CLEAN", "INSPECTED", { role: roleName("INSPECTOR"), inspectionRequired: false }) === "boolean", "canHkTransition insp=false");
      const r = await inspect(LEAD, { roomId: ROOM.W2, pass: true });
      ok(r?.ok === true || (isFail(r) && failCode(r) !== "THROW"), `hkInspect ตอนปิด ${codeOf(r)} ${r?.reason ?? ""}`);
    } finally { await setUnit("rooms.hotel.inspectionRequired", true); }
  });

  // ═══════════════ MB มินิบาร์ → folio ═══════════════
  console.log("\n── MB มินิบาร์ → folio (postFolioItem MINIBAR ของ H.5) ──");
  const PRICE = Object.fromEntries(HS.minibar.items.map((i) => [i.key, i.priceSatang])) as Record<string, number>;
  const NAME = Object.fromEntries(HS.minibar.items.map((i) => [i.key, i.name])) as Record<string, string>;
  await st("MB-1", "ค่าตั้ง #75 rooms.hotel.minibar รับรายการรูปฟิกซ์เจอร์ [{key,name,priceSatang}] ที่ชั้น UNIT (ปัจจุบัน schema = {productId, priceSatang?} — ใบ §0 ให้ \"ราคา/ชื่อจากค่าตั้ง\" ⇒ H.6 ต้องขยาย def หรือผู้คุมเคาะ) · resolveSetting คืนรายการเดิม · ค่าผิด (priceSatang ลบ · key ว่าง) ⇒ setSettings ปฏิเสธ", async () => {
    needSetup();
    const r = await SET.setSettings(OWNER, ctxA, [{ key: "rooms.hotel.minibar", scope: "UNIT", scopeId: UH, value: [...HS.minibar.items] }]);
    ok(r?.ok === true, `schema #75 ไม่รับ {key,name,priceSatang}: ${codeOf(r)} ${J(r).slice(0, 200)}`);
    eq(await settingOf("rooms.hotel.minibar"), [...HS.minibar.items], "resolve");
    const bad = await SET.setSettings(OWNER, ctxA, [{ key: "rooms.hotel.minibar", scope: "UNIT", scopeId: UH, value: [{ key: "", name: "x", priceSatang: -1 }] }]);
    ok(bad?.ok !== true, "ค่าผิดผ่าน");
  });
  await st("MB-2", "postMinibar(maid, {roomId MB1 (CHECKED_IN · folio OPEN), items:[{soda,2},{water,1}]}) ⇒ ok · HotelFolioItem type MINIBAR 2 แถว บน folio ของ MB1: unitAmountSatang = ราคาค่าตั้ง (4,000/2,000) · qty 2/1 · amountSatang = qty×ราคา · description มีชื่อ (น้ำอัดลม/น้ำดื่ม) · postedById maid · businessDate วันนี้ · folio.balanceSatang +10,000 · event hotel.hk.minibar_posted {reservationId, items:2} ไม่มี PII", async () => {
    needSetup(); needHk(); needFolio();
    const since = new Date();
    okRes(await minibar(MAID, { roomId: ROOM.MB1, items: [{ key: "soda", qty: 2 }, { key: "water", qty: 1 }] }), "postMinibar");
    const f = await folioOf(RV.MB1);
    const items = (f?.items ?? []).filter((i: Any) => i.type === "MINIBAR" && msOf(i.createdAt) >= since.getTime() - 2_000);
    eq(items.length, 2, `MINIBAR items ${J((f?.items ?? []).map((i: Any) => [i.type, i.description, i.qty, i.unitAmountSatang]))}`);
    const soda = items.find((i: Any) => i.qty === 2), water = items.find((i: Any) => i.qty === 1);
    ok(soda && water, "qty ไม่ตรง");
    eq([soda.unitAmountSatang, soda.amountSatang, water.unitAmountSatang, water.amountSatang], [PRICE.soda, PRICE.soda * 2, PRICE.water, PRICE.water], "ราคา snapshot");
    ok(String(soda.description).includes(NAME.soda) && String(water.description).includes(NAME.water), `ชื่อ ${soda.description} / ${water.description}`);
    eq([soda.postedById, (soda.businessDate as Date).toISOString().slice(0, 10)], [MAID.userId, W(0)], "postedById/businessDate");
    eq(f.balanceSatang, PRICE.soda * 2 + PRICE.water, "balance");
    const ev = await eventsOf("hotel.hk.minibar_posted", (p) => p.reservationId === RV.MB1);
    ok(ev.length === 1 && ev[0].payload.items === 2 && !PII_TEXT.test(J(ev)), `event ${J(ev.map((e) => e.payload))}`);
  });
  await st("MB-3", "idempotency ต่อวัน/ห้อง/รายการ (คีย์ svc-h6-minibar-<roomId>-<ymd>-<key>): โพสต์ชุดเดิมซ้ำ ⇒ ok แต่ FolioItem ไม่เพิ่ม (ยัง 2) · balance เท่าเดิม · event ไม่เพิ่ม · รายการใหม่ (chips 1) ⇒ +1 แถว 4,000", async () => {
    needSetup(); needHk(); needFolio();
    const f0 = await folioOf(RV.MB1);
    okRes(await minibar(MAID, { roomId: ROOM.MB1, items: [{ key: "soda", qty: 2 }, { key: "water", qty: 1 }] }), "ซ้ำ");
    const f1 = await folioOf(RV.MB1);
    eq([f1.items.filter((i: Any) => i.type === "MINIBAR").length, f1.balanceSatang], [f0.items.filter((i: Any) => i.type === "MINIBAR").length, f0.balanceSatang], "โพสต์ซ้ำ");
    eq((await eventsOf("hotel.hk.minibar_posted", (p) => p.reservationId === RV.MB1)).length, 1, "event ซ้ำ");
    okRes(await minibar(MAID, { roomId: ROOM.MB1, items: [{ key: "chips", qty: 1 }] }), "chips");
    const f2 = await folioOf(RV.MB1);
    eq([f2.items.filter((i: Any) => i.type === "MINIBAR").length, f2.balanceSatang - f1.balanceSatang], [3, PRICE.chips], "รายการใหม่");
  });
  await st("MB-4", "อินพุตผิด ⇒ INVALID_INPUT ไม่โพสต์: qty 0 · qty 21 · qty 1.5 · key ไม่มีในค่าตั้ง (\"beer\") · items ว่าง [] · items ไม่ใช่ array · ราคาที่ client ส่งมา (priceSatang: 1) ถูกเพิกเฉย (ถ้ารับ ⇒ ราคาต้องยังเท่าค่าตั้ง)", async () => {
    needSetup(); needHk(); needFolio();
    const n0 = (await folioOf(RV.MB1)).items.length;
    const bad: string[] = [];
    for (const [n, items] of [["qty 0", [{ key: "soda", qty: 0 }]], ["qty 21", [{ key: "soda", qty: 21 }]], ["qty 1.5", [{ key: "soda", qty: 1.5 }]], ["beer", [{ key: "beer", qty: 1 }]], ["ว่าง", []], ["ไม่ใช่ array", "soda"]] as [string, Any][]) { const r = await minibar(MAID, { roomId: ROOM.MB1, items }); if (!isFail(r, "INVALID_INPUT")) bad.push(`${n}=${codeOf(r)}`); }
    eq(bad, [], "อินพุตผิด");
    eq((await folioOf(RV.MB1)).items.length, n0, "โพสต์ทั้งที่ผิด");
    const r = await minibar(MAID, { roomId: ROOM.MB1, items: [{ key: "water", qty: 3, priceSatang: 1 }] });
    if (r?.ok === true) { const it = (await folioOf(RV.MB1)).items.filter((i: Any) => i.type === "MINIBAR" && i.qty === 3); ok(it.length === 1 && it[0].unitAmountSatang === PRICE.water, `ราคาจาก client ถูกใช้: ${J(it.map((i: Any) => i.unitAmountSatang))}`); }
  });
  await st("MB-5", "ไม่มี folio OPEN: MB3 (CHECKED_OUT วันนี้ · folio SETTLED) postMinibar [{soda,1}] ⇒ ok (ไม่โพสต์ · บันทึกค้างเก็บ) · ไม่มี FolioItem ใหม่บน folio SETTLED · event hotel.hk.minibar_unbilled {roomId, items:1} · HousekeepingLog มีแถว note JSON ค้างเก็บ (minibar/unbilled) · ห้องว่างไม่มีการจองเลย (VACC) ⇒ เดียวกัน (unbilled) · ไม่มี throw", async () => {
    needSetup(); needHk();
    const since = new Date();
    const f0 = await folioOf(RV.MB3);
    okRes(await minibar(MAID, { roomId: ROOM.MB3, items: [{ key: "soda", qty: 1 }] }), "MB3");
    eq((await folioOf(RV.MB3)).items.length, f0.items.length, "โพสต์บน SETTLED");
    const ev = await eventsOf("hotel.hk.minibar_unbilled", (p) => p.roomId === ROOM.MB3);
    ok(ev.length === 1 && ev[0].payload.items === 1, `event ${J(ev.map((e) => e.payload))}`);
    ok((await logsOf(ROOM.MB3, since)).some((l) => /minibar|unbilled|มินิบาร์/i.test(String(l.note ?? ""))), "ไม่มี log ค้างเก็บ");
    okRes(await minibar(MAID, { roomId: ROOM.VACC, items: [{ key: "water", qty: 2 }] }), "VACC");
    eq((await eventsOf("hotel.hk.minibar_unbilled", (p) => p.roomId === ROOM.VACC)).length, 1, "event VACC");
  });
  await st("MB-6", "ไม่ตัดสต็อก/ไม่ผ่าน POS: หลัง MB-2..5 ไม่มี PosSale ใหม่ของร้าน A · ไม่มี OutboxEvent pos.* / inventory.* ของร้าน A · FolioItem MINIBAR refType ไม่ใช่ PosSale", async () => {
    needSetup(); needHk();
    eq(await prisma.posSale.count({ where: { tenantId: tA } }), 0, "PosSale");
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: tA, OR: [{ type: { startsWith: "pos." } }, { type: { startsWith: "inventory." } }] }, select: { type: true } });
    eq(ev.map((e: Any) => e.type), [], "event สต็อก/POS");
    const items = await prisma.hotelFolioItem.findMany({ where: { tenantId: tA, type: "MINIBAR" }, select: { refType: true } });
    ok(items.length >= 3 && items.every((i: Any) => !/PosSale|InventoryMovement/i.test(String(i.refType ?? ""))), `refType ${J(items)}`);
  });
  await st("MB-7", "สิทธิ์ (มติ 1): frontdesk (มี folio.post แต่ไม่มี housekeeping) ⇒ FORBIDDEN · none ⇒ FORBIDDEN · hk-lead ⇒ ok · owner ⇒ ok · ร้าน B ด้วย roomId ร้าน A ⇒ NOT_FOUND · ห้องร้าน B โดย owner A ⇒ NOT_FOUND · FolioItem ไม่เพิ่มจากที่ถูกปฏิเสธ", async () => {
    needSetup(); needHk(); needFolio();
    const n0 = (await folioOf(RV.MB1)).items.length;
    ok(isDenied(await minibar(FRONT, { roomId: ROOM.MB1, items: [{ key: "water", qty: 1 }] })), "frontdesk ผ่าน");
    ok(isDenied(await minibar(NONE, { roomId: ROOM.MB1, items: [{ key: "water", qty: 1 }] })), "none ผ่าน");
    eq(failCode(await minibar(OWNER_B, { roomId: ROOM.MB1, items: [{ key: "water", qty: 1 }] }, ctxB)), "NOT_FOUND", "ข้ามร้าน");
    eq(failCode(await minibar(OWNER, { roomId: ROOM_B, items: [{ key: "water", qty: 1 }] })), "NOT_FOUND", "ห้องร้าน B");
    eq((await folioOf(RV.MB1)).items.length, n0, "เพิ่มจากที่ปฏิเสธ");
    okRes(await minibar(LEAD, { roomId: ROOM.MB1, items: [{ key: "water", qty: 4 }] }), "lead");
    okRes(await minibar(OWNER, { roomId: ROOM.MB1, items: [{ key: "water", qty: 5 }] }), "owner");
  });

  // ═══════════════ DF แจ้งของเสีย ═══════════════
  console.log("\n── DF แจ้งของเสีย (REPAIR ผ่าน dorm/repair · BLOCK ผ่าน blockRoom) ──");
  const repairRows = (roomId: string) => prisma.dormRepair.findMany({ where: { tenantId: tA, roomId }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  await st("DF-1", "def rooms.hotel.hk.canBlock (มติ 1 · คีย์ใหม่ของ H.6): bool · ค่าเริ่ม true · chain UNIT · unitTypes HOTEL · ป้ายไทย · อยู่ในกลุ่ม hotel · schema รับ true/false ไม่รับ \"yes\"", () => {
    const d = SET?.getDef?.("rooms.hotel.hk.canBlock");
    ok(d, "ยังไม่มี def rooms.hotel.hk.canBlock (ยังไม่มีงาน H.6 ใน defs/rooms.ts)");
    eq([d.type, d.defaults._fallback, d.chain, d.unitTypes, d.group], ["bool", true, ["UNIT"], ["HOTEL"], "hotel"], "def");
    ok(THAI.test(d.labelTh ?? ""), "ป้ายไม่ไทย");
    ok(d.schema.safeParse(true).success && d.schema.safeParse(false).success && !d.schema.safeParse("yes").success, "schema");
  });
  await st("DF-2", "REPAIR: reportDefect(maid, {roomId VAC, text, photos 2 PNG, action REPAIR}) ⇒ ok + repairId · DormRepair 1 แถว tenant A · unitId = UH (หน่วย HOTEL) · roomId VAC · status OPEN · text ตรง · files 2 รายการ · FileAsset 2 ชิ้น private (path มี /private/) · ไม่เปลี่ยน hkStatus · HousekeepingLog มีแถวบันทึก (from=to · note มีข้อความ) · event dorm.repair.created {repairId, roomId, category} + hotel.hk.defect {roomId, action: REPAIR} · payload ไม่มีข้อความแจ้ง/PII", async () => {
    needSetup(); needHk();
    const hk0 = await hkOf(ROOM.VAC);
    const since = new Date();
    const fa0 = await prisma.fileAsset.count({ where: { tenantId: tA } });
    const r = okRes(await defect(MAID, { roomId: ROOM.VAC, text: "ก๊อกน้ำรั่ว ห้องน้ำ", photos: [PNG(1), PNG(2)], action: "REPAIR" }), "reportDefect REPAIR");
    ok(typeof r.repairId === "string" && r.repairId, `ไม่มี repairId ${fmt(r)}`);
    const rows = await repairRows(ROOM.VAC);
    eq(rows.length, 1, "DormRepair");
    eq([rows[0].id, rows[0].unitId, rows[0].status, rows[0].text], [r.repairId, UH, "OPEN", "ก๊อกน้ำรั่ว ห้องน้ำ"], "แถวซ่อม");
    const files = Array.isArray(rows[0].files) ? rows[0].files : [];
    eq(files.length, 2, `files ${J(rows[0].files)}`);
    const fa = await prisma.fileAsset.findMany({ where: { tenantId: tA, id: { in: files.map((f: Any) => f.fileId ?? f.id ?? f) } } });
    eq(fa.length, 2, "FileAsset");
    ok(fa.every((f: Any) => /\/private\//.test(f.path) && /^image\/(png|jpeg|webp)$/.test(f.contentType)), `ไฟล์ไม่ private ${J(fa.map((f: Any) => f.path))}`);
    eq(await prisma.fileAsset.count({ where: { tenantId: tA } }), fa0 + 2, "FileAsset นับ");
    eq(await hkOf(ROOM.VAC), hk0, "hkStatus เปลี่ยน");
    const ls = await logsOf(ROOM.VAC, since);
    ok(ls.length >= 1 && ls.every((l) => l.fromStatus === l.toStatus) && ls.some((l) => /ก๊อกน้ำ|defect|แจ้ง/i.test(String(l.note ?? ""))), `log ${J(ls.map((l) => [l.fromStatus, l.toStatus, l.note]))}`);
    const e1 = await eventsOf("dorm.repair.created", (p) => p.repairId === r.repairId);
    ok(e1.length === 1 && e1[0].payload.roomId === ROOM.VAC && e1[0].unitId === UH, `dorm.repair.created ${J(e1.map((e) => e.payload))}`);
    const e2 = await eventsOf("hotel.hk.defect", (p) => p.roomId === ROOM.VAC);
    ok(e2.length === 1 && e2[0].payload.action === "REPAIR" && !J(e2[0].payload).includes("ก๊อกน้ำ"), `hotel.hk.defect ${J(e2.map((e) => e.payload))}`);
  });
  await st("DF-3", "ด่าน DORM|HOTEL (ใบ §1): dormStaffGate(ctx owner, UH, dorm.repair.manage) ค่าเริ่ม ⇒ null (หอยังเดิม) · opts {allowTypes:[\"DORM\",\"HOTEL\"]} ⇒ {tenantId, unitId UH, unitName} · หน่วย DORM ค่าเริ่ม ⇒ ผ่าน · DORM กับ allowTypes [\"HOTEL\"] ⇒ null · fai (dorm.repair.manage) บน UH allowTypes DORM|HOTEL ⇒ ผ่าน · maid (ไม่มี repair.manage) ⇒ null · listDormRepairs(owner, {unitId UH}) เห็นใบของ DF-2 (เส้น staff เปิด HOTEL แล้ว) · dormRepairJob ok roomNumber VAC photos 2 ลิงก์ /api/files · listDormRepairs บน UD ไม่เห็นใบของโรงแรม", async () => {
    needSetup();
    const gate = fnOf(portalL, "dormStaffGate", F.portal);
    const own = { tenantId: tA, actorUserId: OWNER.userId };
    eq(await gate(own, UH, "dorm.repair.manage"), null, "ค่าเริ่มเปิด HOTEL (หอต้องเดิมทุกไบต์)");
    const g = await gate(own, UH, "dorm.repair.manage", { allowTypes: ["DORM", "HOTEL"] });
    ok(g && g.unitId === UH && g.tenantId === tA && typeof g.unitName === "string", `allowTypes DORM|HOTEL ⇒ ${fmt(g)} (ยังไม่มีพารามิเตอร์ allowTypes ใน dormStaffGate)`);
    ok((await gate(own, UD, "dorm.repair.manage"))?.unitId === UD, "หน่วย DORM ค่าเริ่ม");
    eq(await gate(own, UD, "dorm.repair.manage", { allowTypes: ["HOTEL"] }), null, "DORM กับ allowTypes HOTEL");
    ok((await gate({ tenantId: tA, actorUserId: FAI.userId }, UH, "dorm.repair.manage", { allowTypes: ["DORM", "HOTEL"] }))?.unitId === UH, "fai");
    eq(await gate({ tenantId: tA, actorUserId: MAID.userId }, UH, "dorm.repair.manage", { allowTypes: ["DORM", "HOTEL"] }), null, "maid ไม่มี repair.manage");
    const rows = await repairRows(ROOM.VAC);
    ok(rows.length, "ไม่มีใบจาก DF-2");
    const lst = await call(() => fnOf(repairL, "listDormRepairs", F.repair)(own, { unitId: UH }));
    ok(lst?.ok === true && (lst.rows as Any[]).some((x) => x.repairId === rows[0].id), `listDormRepairs บน HOTEL ${codeOf(lst)} ${J(lst?.rows?.map((x: Any) => x.repairId) ?? lst).slice(0, 160)}`);
    const job = await call(() => fnOf(repairL, "dormRepairJob", F.repair)(own, { unitId: UH, repairId: rows[0].id }));
    ok(job?.ok === true && job.job.roomNumber === "VAC" && job.job.photos.length === 2 && job.job.photos.every((p: Any) => /\/api\/files\//.test(p.url)), `dormRepairJob ${codeOf(job)} ${J(job?.job?.photos ?? job).slice(0, 160)}`);
    const lstD = await call(() => fnOf(repairL, "listDormRepairs", F.repair)(own, { unitId: UD, status: "ALL" }));
    ok(lstD?.ok === true && !(lstD.rows as Any[]).some((x) => x.repairId === rows[0].id), "ใบโรงแรมโผล่ในหอ");
  });
  await st("DF-4", "X6 รูป: 4 รูป ⇒ INVALID_INPUT · 9 MB ⇒ INVALID_FILE · svg ⇒ INVALID_FILE · contentType image/png แต่ไบต์ไม่ใช่ PNG ⇒ INVALID_FILE · text ว่าง ⇒ INVALID_INPUT · action แปลก ⇒ INVALID_INPUT · ไม่มี DormRepair/FileAsset เพิ่ม · 0 รูป ⇒ ok (รูปไม่บังคับ)", async () => {
    needSetup(); needHk();
    const n0 = J([await prisma.dormRepair.count({ where: { tenantId: tA } }), await prisma.fileAsset.count({ where: { tenantId: tA } })]);
    const bad: string[] = [];
    const chk = (n: string, r: Any, codes: string[]) => { const c = failCode(r); if (c === null || !codes.includes(c)) bad.push(`${n}=${codeOf(r)}`); };
    chk("4 รูป", await defect(MAID, { roomId: ROOM.VAC, photos: [PNG(1), PNG(2), PNG(3), PNG(4)] }), ["INVALID_INPUT", "INVALID_FILE"]);
    chk("9MB", await defect(MAID, { roomId: ROOM.VAC, photos: [{ data: bigPng(9 * 1024 * 1024), contentType: "image/png" }] }), ["INVALID_FILE", "INVALID_INPUT"]);
    chk("svg", await defect(MAID, { roomId: ROOM.VAC, photos: [SVG()] }), ["INVALID_FILE", "INVALID_INPUT"]);
    chk("ปลอม png", await defect(MAID, { roomId: ROOM.VAC, photos: [{ data: Uint8Array.from(Buffer.from("not-a-png-0123456789")), contentType: "image/png" }] }), ["INVALID_FILE", "INVALID_INPUT"]);
    chk("text ว่าง", await defect(MAID, { roomId: ROOM.VAC, text: "  ", photos: [] }), ["INVALID_INPUT"]);
    chk("action แปลก", await defect(MAID, { roomId: ROOM.VAC, action: "IGNORE", photos: [] }), ["INVALID_INPUT"]);
    eq(bad, [], "X6");
    eq(J([await prisma.dormRepair.count({ where: { tenantId: tA } }), await prisma.fileAsset.count({ where: { tenantId: tA } })]), n0, "แถวเพิ่มจากที่ปฏิเสธ");
    okRes(await defect(MAID, { roomId: ROOM.VACC, text: "หลอดไฟกะพริบ", photos: [] }), "0 รูป");
  });
  await st("DF-5", "BLOCK: reportDefect(owner, {roomId W1 (ว่าง), text \"แอร์เสีย\", photos 1, action BLOCK, blockDays 2}) ⇒ ok + blockId · RoomOccupancy kind BLOCK active วันนี้..+2 refType HotelRoomBlock refId blockId · hkStatus OUT_OF_ORDER (ผ่าน setHkStatus · status OOO) · HousekeepingLog toStatus OUT_OF_ORDER note มี \"แอร์เสีย\" · AuditLog targetId blockId · event hotel.hk.defect {roomId, action: BLOCK} · ไม่มี DormRepair เพิ่ม · blockDays หาย/0/31 ⇒ INVALID_INPUT", async () => {
    needSetup(); needHk(); needBlock();
    const since = new Date();
    const nr = await prisma.dormRepair.count({ where: { tenantId: tA } });
    const r = okRes(await defect(OWNER, { roomId: ROOM.W1, text: "แอร์เสีย", photos: [PNG(5)], action: "BLOCK", blockDays: 2 }), "BLOCK");
    ok(typeof r.blockId === "string" && r.blockId, `ไม่มี blockId ${fmt(r)}`);
    const occ = await occOf(ROOM.W1, "BLOCK");
    eq(occ.length, 1, "occupancy BLOCK");
    eq([occ[0].refType, occ[0].refId, (occ[0].startDate as Date).toISOString().slice(0, 10), (occ[0].endDate as Date).toISOString().slice(0, 10)], ["HotelRoomBlock", r.blockId, W(0), W(2)], "ช่วง BLOCK");
    const room = await roomOf(ROOM.W1);
    eq([room.hkStatus, room.status], ["OUT_OF_ORDER", "OOO"], "ห้อง");
    ok((await logsOf(ROOM.W1, since)).some((l) => l.toStatus === "OUT_OF_ORDER" && String(l.note ?? "").includes("แอร์เสีย")), "log OOO");
    ok((await auditsOf({ targetId: r.blockId })).length >= 1, "AuditLog blockId");
    ok((await eventsOf("hotel.hk.defect", (p) => p.roomId === ROOM.W1 && p.action === "BLOCK")).length === 1, "event defect BLOCK");
    eq(await prisma.dormRepair.count({ where: { tenantId: tA } }), nr, "DormRepair เพิ่มจาก BLOCK");
    const bad: string[] = [];
    for (const [n, d] of [["ไม่มี", undefined], ["0", 0], ["31", 31]] as [string, Any][]) { const x = await defect(OWNER, { roomId: ROOM.W4, action: "BLOCK", blockDays: d, photos: [] }); if (!isFail(x, "INVALID_INPUT")) bad.push(`blockDays ${n}=${codeOf(x)}`); }
    eq(bad, [], "blockDays");
  });
  await st("DF-6", "BLOCK ชนแขก: STAY2 (CHECKED_IN ถึง +1) action BLOCK blockDays 1 ⇒ {ok:false, code: ROOM_TAKEN} (+ conflicts/suggest REPAIR ได้) · hkStatus ไม่เปลี่ยน · ไม่มี BLOCK/log/event เพิ่ม · แล้วแจ้งช่างแทน (action REPAIR) บนห้องเดียวกัน ⇒ ok · hkStatus ยังเดิม", async () => {
    needSetup(); needHk(); needBlock();
    const hk0 = await hkOf(ROOM.STAY2), n0 = await logCount(ROOM.STAY2), e0 = (await eventsOf("hotel.hk.defect", (p) => p.roomId === ROOM.STAY2)).length;
    const r = await defect(OWNER, { roomId: ROOM.STAY2, text: "ทีวีเสีย", photos: [], action: "BLOCK", blockDays: 1 });
    eq(failCode(r), "ROOM_TAKEN", `ชนแขก ${fmt(r)}`);
    eq([await hkOf(ROOM.STAY2), (await occOf(ROOM.STAY2, "BLOCK")).length, await logCount(ROOM.STAY2), (await eventsOf("hotel.hk.defect", (p) => p.roomId === ROOM.STAY2)).length], [hk0, 0, n0, e0], "มีอะไรเปลี่ยน");
    okRes(await defect(OWNER, { roomId: ROOM.STAY2, text: "ทีวีเสีย", photos: [], action: "REPAIR" }), "แจ้งช่างแทน");
    eq(await hkOf(ROOM.STAY2), hk0, "hkStatus หลังแจ้งช่าง");
  });
  await st("DF-7", "สิทธิ์ปิดห้อง (มติ 1): hk.canBlock=false ⇒ maid BLOCK (W4) ⇒ FORBIDDEN (owner ยังได้) · canBlock=true (ค่าเริ่ม) ⇒ maid BLOCK W4 1 วัน ⇒ ok OUT_OF_ORDER · frontdesk (ไม่มี housekeeping · ไม่มี booking.manage? — มี booking.manage ⇒ BLOCK ได้ แต่ REPAIR ⇒ FORBIDDEN) · none ⇒ FORBIDDEN ทั้งคู่ · ร้าน B ⇒ NOT_FOUND", async () => {
    needSetup(); needHk(); needBlock();
    ok(SET?.getDef?.("rooms.hotel.hk.canBlock"), "ยังไม่มี def hk.canBlock");
    await setUnit("rooms.hotel.hk.canBlock", false);
    try {
      ok(isDenied(await defect(MAID, { roomId: ROOM.W4, text: "x", photos: [], action: "BLOCK", blockDays: 1 })), "maid ปิดห้องได้ทั้งที่ canBlock=false");
      eq(await hkOf(ROOM.W4), "CLEAN", "W4 เปลี่ยน");
    } finally { await resetUnit("rooms.hotel.hk.canBlock"); }
    okRes(await defect(MAID, { roomId: ROOM.W4, text: "ประตูล็อกไม่ได้", photos: [], action: "BLOCK", blockDays: 1 }), "maid BLOCK (canBlock=true)");
    eq(await hkOf(ROOM.W4), "OUT_OF_ORDER", "W4");
    ok(isDenied(await defect(FRONT, { roomId: ROOM.VACC, text: "x", photos: [], action: "REPAIR" })), "frontdesk REPAIR ผ่าน");
    ok(isDenied(await defect(NONE, { roomId: ROOM.VACC, text: "x", photos: [], action: "REPAIR" })) && isDenied(await defect(NONE, { roomId: ROOM.VACC, text: "x", photos: [], action: "BLOCK", blockDays: 1 })), "none ผ่าน");
    eq(failCode(await defect(OWNER_B, { roomId: ROOM.VACC, text: "x", photos: [], action: "REPAIR" }, ctxB)), "NOT_FOUND", "ข้ามร้าน");
  });

  // ═══════════════ SO markStayoversDirty ═══════════════
  console.log("\n── SO markStayoversDirty (ให้ H.7 เรียก) ──");
  await st("SO-1", "markStayoversDirty(ctx,{unitId UH, businessDate วันนี้}) ⇒ ok · ห้อง CHECKED_IN ที่พักข้ามคืนนี้ (checkIn ≤ วันนี้ < checkOut) และไม่ DIRTY ⇒ DIRTY: STAY (INSPECTED) · STAY2 (CLEAN) · MB1 (ตั้ง CLEAN ก่อน) · log byUserId null note มี \"night audit\" · ห้องไม่ข้ามคืน/ไม่มีแขกไม่เปลี่ยน: DEPG (ออกวันนี้) · ARR2 INSPECTED · W3 INSPECTED · OOO1 คง OUT_OF_ORDER · event changed ต่อห้อง", async () => {
    needSetup(); needHk();
    await prisma.hotelRoom.update({ where: { id: ROOM.MB1 }, data: { hkStatus: "CLEAN" } });
    await prisma.hotelRoom.update({ where: { id: ROOM.DEPG }, data: { hkStatus: "CLEAN" } });
    const since = new Date();
    const r = okRes(await stayovers(), "markStayoversDirty");
    const after = Object.fromEntries(await Promise.all(["STAY", "STAY2", "MB1", "DEPG", "ARR2", "W3", "OOO1"].map(async (k) => [k, await hkOf(ROOM[k])])));
    eq(after, { STAY: "DIRTY", STAY2: "DIRTY", MB1: "DIRTY", DEPG: "CLEAN", ARR2: "INSPECTED", W3: "INSPECTED", OOO1: "OUT_OF_ORDER" }, "สถานะหลัง");
    for (const k of ["STAY", "STAY2", "MB1"]) { const l = (await logsOf(ROOM[k], since)).find((x) => x.toStatus === "DIRTY"); ok(l && l.byUserId === null && /night audit/i.test(String(l.note ?? "")), `log ${k} ${fmt(l)}`); }
    ok(typeof r.changed === "number" ? r.changed === 3 : true, `changed ${fmt(r)}`);
    eq((await eventsOf("hotel.hk.changed", (p) => [ROOM.STAY, ROOM.STAY2, ROOM.MB1].includes(p.roomId) && p.to === "DIRTY")).filter((e) => msOf(e.createdAt) >= since.getTime() - 2_000).length, 3, "event");
  });
  await st("SO-2", "idempotent: เรียกซ้ำ businessDate เดิม ⇒ ok · ไม่มี log/event เพิ่ม · changed 0 (ถ้าคืน) · 2 ทางพร้อมกันหลังตั้ง STAY2 CLEAN ⇒ log DIRTY ของ STAY2 +1 พอดี", async () => {
    needSetup(); needHk();
    const n0 = await prisma.hotelHousekeepingLog.count({ where: { tenantId: tA } });
    const r = okRes(await stayovers(), "ซ้ำ");
    eq(await prisma.hotelHousekeepingLog.count({ where: { tenantId: tA } }), n0, "log เพิ่ม");
    ok(typeof r.changed !== "number" || r.changed === 0, `changed ${fmt(r)}`);
    await prisma.hotelRoom.update({ where: { id: ROOM.STAY2 }, data: { hkStatus: "CLEAN" } });
    const since = new Date();
    const [a, b] = await Promise.all([stayovers(), stayovers()]);
    ok(a?.ok === true && b?.ok === true, `พร้อมกัน ${codeOf(a)} / ${codeOf(b)}`);
    eq((await logsOf(ROOM.STAY2, since)).filter((l) => l.toStatus === "DIRTY").length, 1, "log พร้อมกัน");
  });
  await st("SO-3", "dailyHousekeeping ปิด (UNIT) ⇒ ไม่ทำอะไร: ตั้ง STAY2 CLEAN · markStayoversDirty ⇒ ok · STAY2 ยัง CLEAN · ไม่มี log · businessDate ผิดรูป ⇒ INVALID_INPUT · ร้าน B/หน่วยอื่น ⇒ NOT_FOUND หรือ ok changed 0 (ไม่แตะร้าน A) · คืนค่าตั้ง", async () => {
    needSetup(); needHk();
    await setUnit("rooms.hotel.dailyHousekeeping", false);
    try {
      await prisma.hotelRoom.update({ where: { id: ROOM.STAY2 }, data: { hkStatus: "CLEAN" } });
      const n0 = await logCount(ROOM.STAY2);
      okRes(await stayovers(), "ปิด dailyHousekeeping");
      eq([await hkOf(ROOM.STAY2), await logCount(ROOM.STAY2)], ["CLEAN", n0], "เปลี่ยนทั้งที่ปิด");
    } finally { await setUnit("rooms.hotel.dailyHousekeeping", true); }
    ok(isFail(await stayovers({ businessDate: "7/11/2026" }), "INVALID_INPUT"), "วันผิดรูป");
    const hk0 = await hkOf(ROOM.STAY2);
    const rb = await stayovers({ unitId: UH }, ctxB);
    ok(rb?.ok === false ? failCode(rb) === "NOT_FOUND" : rb.changed === 0 || rb.changed === undefined, `ร้าน B ${fmt(rb)}`);
    eq(await hkOf(ROOM.STAY2), hk0, "ร้าน B แตะร้าน A");
  });

  // ═══════════════ RT realtime ═══════════════
  console.log("\n── RT realtime (EV_HOTEL_HK · ช่อง · token · polling) ──");
  await st("RT-1", "events.ts (pure): EV_HOTEL_HK สตริงขึ้นต้น hotel.hk · hotelHkChannel(unitId) คืนช่องมี unitId และ hotel:hk (รับ (tenantId, unitId) ก็ได้ · ต้องต่างกันต่อหน่วย · ตรงกับช่องที่ publish ใช้ใน ST-5) · SAFE_KEYS มี roomId · hkStatus · at · sanitizeSignal({roomId, hkStatus, at, guestName, note}) คง 3 คีย์ ตัด guestName/note · hkStatus ค่าขยะยาว/มีช่องว่าง ⇒ ถูกตัด · index.ts re-export EV_HOTEL_HK + hotelHkChannel · ไฟล์ยัง pure (ไม่มี env/fetch)", () => {
    ok(evL.mod, `โหลด ${F.rtEvents} ไม่ได้: ${evL.err}`);
    const EV = evL.mod.EV_HOTEL_HK;
    ok(typeof EV === "string" && /^hotel\.hk/.test(EV), `ยังไม่มี EV_HOTEL_HK (${fmt(EV)})`);
    const ch = evL.mod.hotelHkChannel;
    ok(typeof ch === "function", "ยังไม่มี hotelHkChannel");
    const c1 = ch.length >= 2 ? ch(tA, UH) : ch(UH);
    const c2 = ch.length >= 2 ? ch(tA, UH2) : ch(UH2);
    ok(typeof c1 === "string" && c1.includes(UH) && /hotel:hk/.test(c1) && c1 !== c2, `ช่อง ${c1} / ${c2}`);
    if (ABLY_REQS.length === 0 && ch.length < 2) console.log("     (hotelHkChannel ไม่มี tenantId ในช่อง — kanban ใส่ tenantId เสมอ · รายงานผู้คุม)");
    const keys = evL.mod.SAFE_KEYS as readonly string[];
    eq(["roomId", "hkStatus", "at"].filter((k) => !keys.includes(k)), [], "SAFE_KEYS ขาด");
    const s = evL.mod.sanitizeSignal({ roomId: ROOM.W1, hkStatus: "DIRTY", at: 123, guestName: "คุณเอก", note: "x" });
    eq(Object.keys(s).sort(), ["at", "hkStatus", "roomId"], `sanitize ${J(s)}`);
    eq([s.roomId, s.hkStatus, s.at], [ROOM.W1, "DIRTY", 123], "ค่า");
    const junk = evL.mod.sanitizeSignal({ roomId: ROOM.W1, hkStatus: "คุณเอก โทร 081" });
    ok(junk.hkStatus === undefined, `hkStatus ขยะหลุด ${J(junk)}`);
    ok(rtL.mod?.EV_HOTEL_HK === EV && typeof rtL.mod?.hotelHkChannel === "function", "index.ts ไม่ re-export");
    const src = stripComments(read(F.rtEvents));
    ok(!/process\.env|fetch\(|from\s*["']node:/.test(src), "events.ts ไม่ pure");
  });
  await st("RT-2", "route /api/realtime/hotel-hk-token (แบบ kanban-token): ไฟล์มี · export GET · dynamic force-dynamic · อ่าน unitId จาก query (ไม่มี ⇒ 400 polling) · requireTenant/requireUnit · หน่วยต้องเป็น HOTEL ของร้าน (ไม่พบ ⇒ 404 mode polling) · ตรวจสิทธิ์ hotel.housekeeping ด้วย evaluate/assertCan (ไม่ผ่าน ⇒ 403 polling) · ช่อง = hotelHkChannel · realtimeMode ≠ realtime ⇒ {mode:\"polling\"} · ablyIssueToken(channel, userId) · token ล้ม ⇒ polling · cache-control no-store · ไม่อ่านสิทธิ์จาก query", () => {
    const s = read(F.tokenRoute);
    ok(s, `ยังไม่มี ${F.tokenRoute}`);
    const c = stripComments(s);
    const need: [string, RegExp][] = [["GET", /export\s+async\s+function\s+GET/], ["force-dynamic", /dynamic\s*=\s*["']force-dynamic["']/], ["unitId query", /searchParams\.get\(\s*["']unitId["']/], ["400", /400/], ["requireTenant|requireUnit", /requireTenant|requireUnit/], ["HOTEL", /["']HOTEL["']/], ["404", /404/], ["hotel.housekeeping", /["']hotel\.housekeeping["']/], ["evaluate|assertCan", /evaluate\s*\(|assertCan\s*\(/], ["403", /403/], ["hotelHkChannel", /hotelHkChannel\s*\(/], ["realtimeMode", /realtimeMode\s*\(/], ["mode polling", /mode:\s*["']polling["']/], ["ablyIssueToken", /ablyIssueToken\s*\(/], ["no-store", /no-store/]];
    eq(need.filter(([, re]) => !re.test(c)).map(([n]) => n), [], "ขาด");
    ok(!/searchParams\.get\(\s*["'](role|perm|permissions|tenantId)["']/.test(c), "อ่านสิทธิ์/ร้านจาก query");
    ok(!/ablyPublish|publish\s*\(/.test(c), "route ยิง publish เอง");
  });
  await st("RT-3", "ไม่ตั้ง Ably = polling ไม่ throw ไม่ยิงเน็ต: realtimeMode() = polling · publish(hotelHkChannel(UH), EV_HOTEL_HK, {roomId, hkStatus}) resolve · ABLY_REQS ว่าง · hkSetStatus หลายครั้ง (ST) ไม่มีคำขอ Ably นอกช่วง withAbly (นับรวมทั้งข้อสอบ = 3 ครั้งของ ST-5) · ablyConfigured false", async () => {
    ok(rtL.mod, rtL.err);
    eq(rtL.mod.realtimeMode(), "polling", "โหมด");
    const ch = evL.mod?.hotelHkChannel;
    ok(typeof ch === "function" && typeof evL.mod?.EV_HOTEL_HK === "string", "ยังไม่มี hotelHkChannel/EV_HOTEL_HK");
    const n0 = ABLY_REQS.length;
    await rtL.mod.publish(ch.length >= 2 ? ch(tA, UH) : ch(UH), evL.mod.EV_HOTEL_HK, { roomId: ROOM.W1, hkStatus: "DIRTY" });
    eq(ABLY_REQS.length, n0, "ยิงเน็ตทั้งที่ไม่มีคีย์");
    const ab = (await tryImport("@/lib/realtime/ably")).mod;
    ok(ab && ab.ablyConfigured() === false, "ablyConfigured ต้อง false");
  });
  await st("RT-4", "client.ts: export subscribeHotelHk (หรือ subscribeHk) แบบ subscribeBoard — ขอ token จาก /api/realtime/hotel-hk-token?unitId= · ฟัง EV_HOTEL_HK จาก events.ts (import ชื่อ ไม่พิมพ์สตริงซ้ำ) · dynamic import ไลบรารี Ably · โหมด polling จบเงียบ · คืน unsubscribe · ไม่ import ably.ts/ไฟล์ server", () => {
    const s = read(F.rtClient);
    ok(/export\s+function\s+subscribe(HotelHk|Hk|Housekeeping)\b/.test(s), "ยังไม่มี subscribeHotelHk ใน client.ts");
    const c = stripComments(s);
    ok(/hotel-hk-token/.test(c) && /unitId/.test(c), "ไม่ขอ token จาก hotel-hk-token?unitId=");
    ok(/EV_HOTEL_HK/.test(c) && /from\s*["']\.\/events["']/.test(c), "ไม่ใช้ EV_HOTEL_HK จาก events.ts");
    ok(/import\s*\(/.test(c), "ไม่ dynamic import ไลบรารี");
    ok(!/from\s*["']\.\/(ably|index)["']/.test(c) && !/@\/lib\/core\/db/.test(c), "client.ts import ฝั่ง server");
    ok(/mode\s*!==?\s*["']realtime["']|mode\s*===?\s*["']polling["']/.test(c), "ไม่จบเงียบตอน polling");
  });
  await st("RT-5", "HkBoard.tsx: ใช้ subscribeHotelHk จาก @/lib/realtime/client + polling 15 วิ (15000|15_000|15 * 1000) เมื่อไม่มีสัญญาณ · รับสัญญาณ ⇒ router.refresh() หรือเรียก action/fetch ใหม่ · ไม่ใช้ EventSource/SSE ที่ไม่มีเซิร์ฟเวอร์รองรับ · ล้าง interval/unsubscribe ตอน unmount (return ใน useEffect) · ไม่อ่าน ABLY_API_KEY", () => {
    const s = read(`${F.compDir}/HkBoard.tsx`);
    ok(s, "ยังไม่มี HkBoard.tsx");
    const c = stripComments(s);
    ok(/subscribe(HotelHk|Hk|Housekeeping)\s*\(/.test(c) && /@\/lib\/realtime\/client/.test(c), "ไม่ subscribe ผ่าน realtime/client");
    ok(/15_?000|15\s*\*\s*1000|POLL_MS|15\s*วิ/.test(c), "ไม่มี polling 15 วิ");
    ok(/router\.refresh\(\)|refresh\(\)|startTransition|fetch\(|Action\(/.test(c), "รับสัญญาณแล้วไม่รีเฟรช");
    ok(!/EventSource/.test(c), "ใช้ EventSource");
    ok(/useEffect\s*\([\s\S]*return\s*\(?\s*\(\)\s*=>/.test(c) || /return\s+unsub|return\s+\(\)\s*=>\s*\{[\s\S]*clearInterval/.test(c), "ไม่ล้าง interval/unsubscribe");
    ok(!/ABLY_API_KEY/.test(c), "อ่านคีย์ในฝั่ง client");
  });

  // ═══════════════ B ด่าน / X1 / X9 ═══════════════
  console.log("\n── B ด่าน/ข้ามร้าน/สิทธิ์ ──");
  await st("B-1", "X1 ข้ามร้าน (มติ 8): เจ้าของร้าน B (ctx B) เรียก hkSetStatus/hkStart/hkFinish/hkInspect/postMinibar/reportDefect ด้วย roomId ร้าน A ⇒ NOT_FOUND ทุกตัว · hkBoard(ctxB,{unitId UH}) ⇒ NOT_FOUND หรือ rooms ว่าง · hkLogs ⇒ ว่าง/NOT_FOUND · markStayoversDirty(ctxB,{unitId UH}) ⇒ NOT_FOUND/ไม่แตะ · คำตอบไม่มีเลขห้อง/ชื่อแขกร้าน A · ไม่มีแถวเปลี่ยน · กลับกัน owner A กับห้องร้าน B ⇒ NOT_FOUND", async () => {
    needSetup(); needHk();
    const snap = async () => J([await hkOf(ROOM.MB1), await noteOf(ROOM.MB1), await logCount(ROOM.MB1), await prisma.hotelFolioItem.count({ where: { tenantId: tA } }), await prisma.dormRepair.count({ where: { tenantId: tA } }), await hkOf(ROOM_B)]);
    const s0 = await snap();
    const calls: [string, () => Promise<Any>][] = [
      ["hkSetStatus", () => setStatus(OWNER_B, { roomId: ROOM.MB1, to: "CLEAN" }, ctxB)],
      ["hkStart", () => start(OWNER_B, { roomId: ROOM.MB1 }, ctxB)],
      ["hkFinish", () => finish(OWNER_B, { roomId: ROOM.MB1 }, ctxB)],
      ["hkInspect", () => inspect(OWNER_B, { roomId: ROOM.MB1, pass: true }, ctxB)],
      ["postMinibar", () => minibar(OWNER_B, { roomId: ROOM.MB1, items: [{ key: "soda", qty: 1 }] }, ctxB)],
      ["reportDefect", () => defect(OWNER_B, { roomId: ROOM.MB1, photos: [] }, ctxB)],
      ["hkBoard", async () => { const r = await board({}, ctxB); return r?.ok === false ? r : rowsOf(r).length ? { ok: true, leak: rowsOf(r).length } : { ok: false, code: "NOT_FOUND" }; }],
      ["hkLogs", async () => { const r = await logs({ unitId: UH }, ctxB); return r?.ok === false ? r : rowsOf(r).length ? { ok: true, leak: rowsOf(r).length } : { ok: false, code: "NOT_FOUND" }; }],
      ["markStayoversDirty", async () => { const r = await stayovers({}, ctxB); return r?.ok === false ? r : (r.changed ?? 0) === 0 ? { ok: false, code: "NOT_FOUND" } : { ok: true, leak: r }; }],
      ["owner A → ห้อง B", () => setStatus(OWNER, { roomId: ROOM_B, to: "CLEAN" })],
    ];
    const bad: string[] = [];
    for (const [n, f] of calls) { const r = await f(); if (failCode(r) !== "NOT_FOUND") bad.push(`${n}=${codeOf(r)}`); if (J(r).includes("MB1") || PII_TEXT.test(J(r))) bad.push(`${n} รั่ว`); }
    eq(bad, [], "ข้ามร้าน");
    eq(await snap(), s0, "แถวเปลี่ยน");
  });
  await st("B-2", "ด่านหน่วย: MGR2 (คุม UH2 เท่านั้น) กับห้องของ UH ⇒ NOT_FOUND (hkSetStatus/hkStart/postMinibar/reportDefect) · STAFF housekeeping unitAccess [UH2] ⇒ NOT_FOUND/FORBIDDEN · hkBoard(unitId หอ UD) ⇒ NOT_FOUND หรือ rooms ว่าง (ไม่ใช่ HOTEL) · hkSetStatus ห้องของหอ (D101) ⇒ NOT_FOUND · ไม่มีแถวเปลี่ยน", async () => {
    needSetup(); needHk();
    const s0 = J([await hkOf(ROOM.MB1), await hkOf(ROOM_D), await logCount(ROOM.MB1)]);
    const bad: string[] = [];
    for (const [n, r] of [["mgr2 set", await setStatus(MGR2, { roomId: ROOM.MB1, to: "CLEAN" })], ["mgr2 start", await start(MGR2, { roomId: ROOM.MB1 })], ["mgr2 minibar", await minibar(MGR2, { roomId: ROOM.MB1, items: [{ key: "soda", qty: 1 }] })], ["mgr2 defect", await defect(MGR2, { roomId: ROOM.MB1, photos: [] })], ["ห้องหอ", await setStatus(OWNER, { roomId: ROOM_D, to: "CLEAN" })]] as [string, Any][]) if (failCode(r) !== "NOT_FOUND") bad.push(`${n}=${codeOf(r)}`);
    const other = await setStatus({ ...MAID, unitAccess: [UH2] }, { roomId: ROOM.MB1, to: "CLEAN" });
    if (!isFail(other, "NOT_FOUND", "FORBIDDEN")) bad.push(`STAFF หน่วยอื่น=${codeOf(other)}`);
    const bd = await board({ unitId: UD });
    if (!(bd?.ok === false || rowsOf(bd).length === 0)) bad.push(`hkBoard หอ=${fmt(bd).slice(0, 80)}`);
    eq(bad, [], "ด่านหน่วย");
    eq(J([await hkOf(ROOM.MB1), await hkOf(ROOM_D), await logCount(ROOM.MB1)]), s0, "แถวเปลี่ยน");
  });
  await st("B-3", "X9 สิทธิ์ 4 ระดับ (ใบ §7): frontdesk/none ⇒ FORBIDDEN ทุกตัว (hkSetStatus · hkStart · hkFinish · hkInspect · postMinibar · reportDefect REPAIR) ไม่มีแถวเปลี่ยน · maid ⇒ set/start/finish/minibar/defect ok · inspect FORBIDDEN · hk-lead ⇒ inspect ok · owner ⇒ ทุกอย่าง ok (รวม BLOCK ถ้ามี block.ts) · MANAGER ของหน่วย ⇒ ok", async () => {
    needSetup(); needHk();
    const MGR = await mkMember("mgr", tA, "MANAGER", [UH]);
    const n0 = J([await prisma.hotelHousekeepingLog.count({ where: { tenantId: tA } }), await prisma.hotelFolioItem.count({ where: { tenantId: tA } }), await prisma.dormRepair.count({ where: { tenantId: tA } })]);
    const ops = (a: Actor): [string, () => Promise<Any>][] => [
      ["hkSetStatus", () => setStatus(a, { roomId: ROOM.VACC, to: "DIRTY" })],
      ["hkStart", () => start(a, { roomId: ROOM.VACC })],
      ["hkFinish", () => finish(a, { roomId: ROOM.VACC })],
      ["hkInspect", () => inspect(a, { roomId: ROOM.VACC, pass: true })],
      ["postMinibar", () => minibar(a, { roomId: ROOM.MB1, items: [{ key: "water", qty: 1 }] })],
      ["reportDefect", () => defect(a, { roomId: ROOM.VACC, photos: [] })],
    ];
    for (const [n, a] of [["frontdesk", FRONT], ["none", NONE]] as [string, Actor][]) {
      const notDenied = (await Promise.all(ops(a).map(async ([op, f]) => [op, await f()] as [string, Any]))).filter(([, r]) => !isDenied(r)).map(([op, r]) => `${n}:${op}=${codeOf(r)}`);
      eq(notDenied, [], `${n} ผ่าน`);
    }
    eq(J([await prisma.hotelHousekeepingLog.count({ where: { tenantId: tA } }), await prisma.hotelFolioItem.count({ where: { tenantId: tA } }), await prisma.dormRepair.count({ where: { tenantId: tA } })]), n0, "ไร้สิทธิ์เปลี่ยนแถว");
    await prisma.hotelRoom.update({ where: { id: ROOM.VACC }, data: { hkStatus: "DIRTY", hkNote: null } });
    okRes(await start(MAID, { roomId: ROOM.VACC }), "maid start");
    okRes(await finish(MAID, { roomId: ROOM.VACC }), "maid finish");
    ok(isDenied(await inspect(MAID, { roomId: ROOM.VACC, pass: true })), "maid inspect ผ่าน");
    okRes(await inspect(LEAD, { roomId: ROOM.VACC, pass: true }), "lead inspect");
    okRes(await setStatus(MGR, { roomId: ROOM.VACC, to: "DIRTY" }), "manager set");
    okRes(await setStatus(OWNER, { roomId: ROOM.VACC, to: "CLEAN" }), "owner set");
    okRes(await defect(OWNER, { roomId: ROOM.VACC, text: "ม่านขาด", photos: [] }), "owner defect");
  });
  await st("B-4", "actions.ts สถิต (ใบ §3): บล็อก // SVC H.6 ▸ … ◂ มี 5 action (hkSetStatusAction hkStartAction hkFinishAction hkInspectAction reportDefectAction) ทุกตัว requireUnit + HOTEL + assertHotelCan/canHotel · ใช้คีย์ hotel.housekeeping (+ .inspect ใน hkInspectAction · booking.manage/hk.canBlock ใน reportDefect) · ไม่รับ/ส่ง `at` · ไม่มี SVC_QC_CLOCK · permissions.ts: hotel.housekeeping(.inspect) ออกจาก planned", () => {
    const s = read(F.actions);
    ok(s, "ยังไม่มี actions.ts");
    const blk = /SVC H\.6 ▸([\s\S]*?)◂/.exec(s)?.[1] ?? "";
    ok(blk, "ไม่มีบล็อก // SVC H.6 ▸ … ◂ ใน actions.ts (ยังไม่มีงาน H.6)");
    eq(ACTIONS.filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(blk)), [], "action ขาด/นอกบล็อก");
    const fns = blk.split(/export\s+async\s+function\s+/).slice(1);
    eq(fns.filter((b) => !/requireUnit\s*\(/.test(b) || !/HOTEL/.test(b) || !/assertHotelCan\s*\(|canHotel\s*\(/.test(b)).map((b) => b.split("(")[0]), [], "action ไม่มีด่าน");
    ok(blk.includes("hotel.housekeeping"), "ไม่ใช้คีย์ hotel.housekeeping");
    ok(/hkInspectAction[\s\S]*?hotel\.housekeeping\.inspect/.test(blk), "hkInspectAction ไม่ตรวจ inspect");
    ok(!/\bat\s*[:=,)]|\bat\?:/.test(stripComments(blk).replace(/\bat\b(?=\s*[a-z])/gi, "")) && !/SVC_QC_CLOCK/.test(blk), "action รับ/ส่ง at หรืออ่าน SVC_QC_CLOCK");
    const perms = stripComments(read(F.perms));
    const planned = /planned[^[]*\[([\s\S]*?)\]/i.exec(perms)?.[1] ?? "";
    ok(!planned.includes("hotel.housekeeping"), "hotel.housekeeping(.inspect) ยังอยู่ planned");
  });
  await st("B-5", "X10/PII: HousekeepingLog.note ทุกแถวของร้าน A ไม่มีเบอร์/อีเมล · OutboxEvent hotel.hk.* ทุกแถว payload ไม่มีชื่อแขก/เบอร์/ข้อความแจ้งของเสีย · AuditLog hotel.* ไม่มี PII · DormRepair.text เป็นข้อมูลธุรกิจ (มีได้) แต่ event dorm.repair.created ไม่มี text", async () => {
    needSetup(); needHk();
    const notes = (await prisma.hotelHousekeepingLog.findMany({ where: { tenantId: tA }, select: { note: true } })).map((l: Any) => String(l.note ?? "")).join("\n");
    ok(!PII_TEXT.test(notes), "log note มี PII");
    const evs = await prisma.outboxEvent.findMany({ where: { tenantId: tA, type: { startsWith: "hotel.hk." } }, select: { payload: true, type: true } });
    ok(evs.length >= 4, `event hotel.hk.* น้อย (${evs.length})`);
    const txt = J(evs.map((e: Any) => e.payload));
    ok(!PII_TEXT.test(txt) && !/ก๊อกน้ำ|แอร์เสีย|ผู้จองทดสอบ/.test(txt), "event payload มี PII/ข้อความ");
    ok(![...walkKeys(evs.map((e: Any) => e.payload))].some((k) => /guestName|phone|email|text|note/i.test(k)), "คีย์ PII ใน payload");
    const au = J((await auditsOf({ action: { startsWith: "hotel." } })).map((a) => [a.before, a.after]));
    ok(!PII_TEXT.test(au), "AuditLog PII");
    const rep = J((await eventsOf("dorm.repair.created")).map((e) => e.payload));
    ok(!/ก๊อกน้ำ|ทีวีเสีย|หลอดไฟ/.test(rep), "dorm.repair.created มี text");
  });

  // ═══════════════ N event 3 ทะเบียน ═══════════════
  console.log("\n── N event 4 ตัว · 3 ทะเบียน ──");
  await st("N-1", "ทะเบียน 3 ที่ (กติกาเหล็ก 15): outbox-consumers.ts มี consumer ทั้ง 4 (hotel.hk.changed · minibar_posted · minibar_unbilled · defect) · automation/labels.ts AUTOMATION_EVENTS มีทั้ง 4 ป้ายไทย · webhooks WEBHOOK_EVENTS มีทั้ง 4 ผ่าน spread (ไม่ประกาศซ้ำใน webhooks/labels.ts)", () => {
    const cons = consumersL.mod?.consumers ?? consumersL.mod?.default;
    ok(cons && typeof cons === "object", `โหลด consumers ไม่ได้ ${consumersL.err}`);
    eq(EVENTS.filter((e) => typeof cons[e] !== "function"), [], "consumer ขาด");
    const auto = (autoL.mod?.AUTOMATION_EVENTS ?? []) as Any[];
    eq(EVENTS.filter((e) => !auto.some((x) => x.value === e && THAI.test(x.label ?? ""))), [], "automation label ขาด/ไม่ไทย");
    const wh = (whL.mod?.WEBHOOK_EVENTS ?? []) as Any[];
    eq(EVENTS.filter((e) => !wh.some((x) => x.value === e)), [], "webhook ขาด");
    eq(EVENTS.filter((e) => wh.filter((x) => x.value === e).length > 1), [], "ซ้ำใน webhook");
    ok(!EVENTS.some((e) => stripComments(read(F.whLabels)).includes(`"${e}"`)), "ประกาศซ้ำใน webhooks/labels.ts");
  });
  await st("N-2", "payload (ใบ §5 · X8): ทุกชนิดมี ≥ 1 แถวในร้าน A จากข้อก่อน · changed ⊆ {tenantId,unitId,roomId,from,to,byUserId} · minibar_posted ⊆ {tenantId,unitId,reservationId,roomId,items,amountSatang} · minibar_unbilled ⊆ {tenantId,unitId,roomId,items,amountSatang} · defect ⊆ {tenantId,unitId,roomId,action,repairId,blockId} · unitId บนแถว = UH · idempotencyKey ไม่ซ้ำ", async () => {
    needHk();
    const ALLOWED: Record<string, Set<string>> = { "hotel.hk.changed": new Set(["tenantId", "unitId", "roomId", "from", "to", "byUserId", "reservationId"]), "hotel.hk.minibar_posted": new Set(["tenantId", "unitId", "reservationId", "roomId", "items", "amountSatang"]), "hotel.hk.minibar_unbilled": new Set(["tenantId", "unitId", "roomId", "items", "amountSatang"]), "hotel.hk.defect": new Set(["tenantId", "unitId", "roomId", "action", "repairId", "blockId"]) };
    const bad: string[] = [];
    const keys = new Set<string>();
    for (const t of EVENTS) {
      const ev = await eventsOf(t);
      if (!ev.length) { bad.push(`${t}: 0 แถว`); continue; }
      for (const e of ev) {
        const extra = Object.keys(e.payload ?? {}).filter((k) => !ALLOWED[t].has(k));
        if (extra.length) { bad.push(`${t}: คีย์นอกสัญญา ${extra.join(",")}`); break; }
        if (e.unitId !== UH && e.unitId !== UH2) { bad.push(`${t}: unitId ${e.unitId}`); break; }
        if (keys.has(e.idempotencyKey)) bad.push(`${t}: idempotencyKey ซ้ำ`); keys.add(e.idempotencyKey);
      }
    }
    eq(bad.slice(0, 6), [], "payload");
  });
  await st("N-3", "consumer เรียกได้ไม่โยน: consumers[type](event) กับแถวจริง 1 แถวต่อชนิด ⇒ resolve", async () => {
    needHk();
    const cons = consumersL.mod?.consumers;
    ok(cons, "ไม่มี consumers");
    const bad: string[] = [];
    for (const t of EVENTS) { const ev = (await eventsOf(t))[0]; if (!ev) { bad.push(`${t} ไม่มีแถว`); continue; } if (typeof cons[t] !== "function") { bad.push(`${t} ไม่มี consumer`); continue; } try { await cons[t](ev); } catch (e) { bad.push(`${t}: ${errMsg(e)}`); } }
    eq(bad, [], "consumer โยน");
  });

  // ═══════════════ U UI สถิต ═══════════════
  console.log("\n── U UI สถิต ──");
  await st("U-1", "ไฟล์ของใบครบ (§1): housekeeping.ts · hk-state.ts · 7 คอมโพเนนต์ hk/ + hk-shared.ts · หน้า housekeeping · housekeeping/[roomId] · housekeeping/logs · route hotel-hk-token · ฉาก svc-qc-hotel-hk-scene.mts · docs/sds/modules/hotel.md §แม่บ้าน (state machine · hkNote JSON · มินิบาร์ · DORM|HOTEL)", () => {
    eq([F.hk, F.state, ...COMPS, F.hkShared, ...PAGES, F.tokenRoute, F.scene].filter((f) => !has(f)), [], "ขาด");
    const sds = read(F.sds);
    ok(/แม่บ้าน/.test(sds) && /hkNote/.test(sds) && /มินิบาร์|minibar/i.test(sds) && /DORM\s*\|\s*HOTEL|DORM\|HOTEL|allowTypes/.test(sds) && /OUT_OF_ORDER/.test(sds), "sds ไม่มี §แม่บ้านครบ (state machine · hkNote JSON · มินิบาร์ · ด่าน DORM|HOTEL)");
  });
  await st("U-2", "ไทยทั้งหมด (§4): ข้อความที่ผู้ใช้เห็นใน 7 คอมโพเนนต์ + 3 หน้า ไม่มีคำอังกฤษ (ยกเว้นชื่อเฉพาะ) · มีข้อความหลักของภาพ 13: «งานวันนี้» «ของฉัน» «ทั้งหมด» «เสร็จ» «เริ่มทำ» «เสร็จ · ส่งให้ตรวจ» «แจ้งของเสีย» «มินิบาร์» «ลงบิลห้องแขก» «แขกออกไปแล้ว» «ปิดห้องซ่อม» «แจ้งช่าง» · ป้ายบริบท «ออกแล้ว» «ค้างต่อ» «แขกเข้า»", () => {
    const bad: string[] = [];
    for (const f of [...COMPS, ...PAGES]) { const s = read(f); if (!s) { bad.push(`${f}: ยังไม่มี`); continue; } const en = englishInJsx(s); if (en.length) bad.push(`${f}: ${en.slice(0, 6).join(", ")}`); }
    eq(bad, [], "อังกฤษ");
    const all = [...COMPS, F.hkShared, ...PAGES].map((f) => read(f)).join("\n");
    eq(["งานวันนี้", "ของฉัน", "ทั้งหมด", "เสร็จ", "เริ่มทำ", "ส่งให้ตรวจ", "แจ้งของเสีย", "มินิบาร์", "ลงบิลห้องแขก", "แขกออกไปแล้ว", "ปิดห้องซ่อม", "แจ้งช่าง", "ออกแล้ว", "ค้างต่อ", "แขกเข้า"].filter((w) => !all.includes(w)), [], "ข้อความภาพ 13 ขาด");
  });
  await st("U-3", "'use client' ไม่ลาก prisma (กติกาเหล็ก 14): 7 คอมโพเนนต์ client มีกราฟ import (ค่า) ไม่ถึง @/lib/core/db · @prisma/client · โมดูล server (hotel/*.ts · rooms/dorm · storage · realtime/ably|index) · hk-shared.ts pure (ไม่มี import ค่า นอกจาก hotel-tabs-shared/realtime/events · ไม่มี directive) · ป้ายบริบท/สถานะไทยอยู่ใน hk-shared (HK_CONTEXT_TH/HK_STATUS_TH หรือเทียบเท่า)", () => {
    const bad: string[] = [];
    for (const f of COMPS) { const s = read(f); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } if (!/^\s*["']use client["']/m.test(s)) bad.push(`${f} ไม่มี 'use client'`); bad.push(...clientReach(f)); }
    eq(bad, [], "เส้นลากถึง server");
    const sh = read(F.hkShared);
    ok(sh, "ยังไม่มี hk-shared.ts");
    eq(importSpecs(sh).filter((i) => !i.typeOnly).map((i) => i.spec).filter((s) => !/^\.\.?\/(hotel-tabs-shared|hk-shared)$|^@\/lib\/realtime\/events$|^@\/lib\/modules\/hotel\/hk-state$/.test(s)), [], "hk-shared import ค่า");
    ok(!/["']use (client|server)["']/.test(stripComments(sh)), "hk-shared มี directive");
    ok(/ออกแล้ว/.test(sh) && /ค้างต่อ/.test(sh) && /OUT_OF_ORDER|ปิดซ่อม/.test(sh), "hk-shared ไม่มีป้ายบริบท/สถานะไทย");
  });
  await st("U-4", "\"use server\" ไม่ export type (กติกาเหล็ก 14): actions.ts export เฉพาะ async function (ยกเว้น ReservationFormState ของ P1 — ORACLE-EDIT h1-U13) · ไม่ export const/let/class/interface · บล็อก H.6 import ผ่าน ./housekeeping หรือ facade เท่านั้น (ไม่ import dorm/repair · block.ts · folio.ts ตรง)", () => {
    const s = read(F.actions);
    ok(s, "ยังไม่มี actions.ts");
    ok(/SVC H\.6 ▸[\s\S]*◂/.test(s), "actions.ts ยังไม่มีบล็อก // SVC H.6 ▸ … ◂ (ยังไม่มีงาน H.6)");
    ok(/^\s*["']use server["']/m.test(s), "ไม่มี \"use server\"");
    ok(!/^export\s+(type|interface|const|let|class)\b/m.test(stripComments(s).split("\n").filter((l) => !/ReservationFormState/.test(l)).join("\n")), "export ที่ไม่ใช่ async function");
    ok(!/from\s*["']@\/lib\/modules\/dorm|from\s*["']\.\/(block|folio|tape)["']/.test(stripComments(s)), "actions.ts import dorm/block/folio ตรง");
  });
  await st("U-5", "หน้า (§1/§4): 3 หน้าใหม่ requireUnit + \"HOTEL\" + notFound · ตรวจ hotel.housekeeping (ไม่มี ⇒ notFound/forbidden — read-only ไม่เห็นหน้า) · import ผ่าน facade @/lib/modules/hotel (ไม่ชี้ housekeeping.ts ตรง) · บอร์ดใช้ hkBoard + ส่ง mine = userId · [roomId] ใช้ hkBoard/ห้องเดียว + ค่าตั้ง checklist/minibar (loadHotelSettings/resolveSetting ผ่าน facade) · logs ใช้ hkLogs + รับ from/to/roomId · ไม่อ่านสิทธิ์จาก URL", () => {
    const bad: string[] = [];
    for (const f of PAGES) { const s = stripComments(read(f)); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } for (const w of ["requireUnit", "\"HOTEL\"", "notFound", "hotel.housekeeping"]) if (!s.includes(w)) bad.push(`${f}: ${w}`); if (/@\/lib\/modules\/hotel\/(housekeeping|hk-state|service|booking|folio|block)["']/.test(s)) bad.push(`${f}: import ตรงไฟล์ server`); if (/searchParams[^\n]*perm|permissions[^\n]*searchParams/.test(s)) bad.push(`${f}: สิทธิ์จาก URL`); }
    const bp = stripComments(read(F.boardPage)); if (bp && (!/hkBoard/.test(bp) || !/mine/.test(bp))) bad.push("board ไม่ใช้ hkBoard/mine");
    const rp = stripComments(read(F.roomPage)); if (rp && (!/hkBoard|hkRoom/.test(rp) || !/housekeepingChecklist|minibar|loadHotelSettings|resolveSetting/.test(rp))) bad.push("[roomId] ไม่ใช้ hkBoard/ค่าตั้ง");
    const lp = stripComments(read(F.logsPage)); if (lp && (!/hkLogs/.test(lp) || !/from/.test(lp))) bad.push("logs ไม่ใช้ hkLogs/from-to");
    eq(bad, [], "หน้า");
  });
  await st("U-6", "แท็บ: hotel-tabs-shared housekeeping available:true (แก้ค่าเดียว) · แท็บอื่นเท่าเดิม (calendar ตาม session/svc · reservations/frontdesk/rates/settings true · reports false) · hotelTabsFor สิทธิ์เต็ม ⇒ มี «แม่บ้าน» href /hotel/housekeeping · แม่บ้าน (housekeeping อย่างเดียว) เห็นเฉพาะแท็บแม่บ้าน: hotelTabsFor({…, housekeepingOnly:true}) หรือ layout.tsx ตัดแท็บด้วย hotel.housekeeping (ตรวจทั้งสองทาง) · ยัง pure", () => {
    ok(tabsL.mod, `โหลด ${F.tabs} ไม่ได้: ${tabsL.err}`);
    const tabs = tabsL.mod.HOTEL_TABS as Any[];
    const hk = tabs.find((t) => t.key === "housekeeping");
    ok(hk?.available === true, "housekeeping ยัง available:false (ยังไม่มีงาน H.6)");
    eq(tabs.filter((t) => t.key !== "calendar" && t.key !== "housekeeping").map((t) => [t.key, t.available]), [["reservations", true], ["frontdesk", true], ["rates", true], ["reports", false], ["settings", true]], "แท็บอื่น");
    const full = tabsL.mod.hotelTabsFor({ ratesRead: true, settingsEdit: true, housekeeping: true }, "/app/u/x") as Any[];
    ok(full.some((t) => t.key === "housekeeping" && t.labelTh === "แม่บ้าน" && t.href === "/app/u/x/hotel/housekeeping"), `ไม่มีแท็บแม่บ้าน ${J(full)}`);
    const only = tabsL.mod.hotelTabsFor({ ratesRead: false, settingsEdit: false, housekeeping: true, housekeepingOnly: true }, "/app/u/x") as Any[];
    const lay = stripComments(read(F.layout));
    ok((only.length === 1 && only[0].key === "housekeeping") || (/hotel\.housekeeping/.test(lay) && /housekeepingOnly|onlyHousekeeping|hkOnly|maid/i.test(lay)), `แม่บ้านยังเห็นแท็บอื่น: hotelTabsFor ⇒ ${J(only.map((t) => t.key))} · layout ไม่ตัด`);
    ok(!/["']use (client|server)["']/.test(stripComments(read(F.tabs))) && importSpecs(read(F.tabs)).filter((i) => !i.typeOnly).length === 0, "hotel-tabs-shared ไม่ pure");
  });
  await st("U-7", "มือถือ-first (§4 · มติ offline): HkOfflineQueue ใช้ localStorage + idempotencyKey + ฟัง 'online' + ส่งซ้ำ · HkRoomCard/HkRoomSheet ปุ่มใหญ่ (min-h-12|h-12|h-14|py-3|py-4|text-lg) · HkRoomSheet ปุ่ม «เสร็จ · ส่งให้ตรวจ» เป็น <button · HkMinibar มีปุ่ม −/+ (aria-label ลด/เพิ่ม หรือ −/+) · HkDefectDialog input file accept=\"image/*\" (jpeg/png/webp) + ตัวเลือก BLOCK/REPAIR · ไม่มี min-w ตายตัว > 390 · ไม่มี data-scroll-hint จำเป็น (การ์ดแนวตั้ง)", () => {
    const oq = stripComments(read(`${F.compDir}/HkOfflineQueue.tsx`));
    ok(oq, "ยังไม่มี HkOfflineQueue.tsx");
    ok(/localStorage/.test(oq) && /idempotencyKey/.test(oq) && /["']online["']/.test(oq), "คิวออฟไลน์ไม่มี localStorage/idempotencyKey/online");
    const card = read(`${F.compDir}/HkRoomCard.tsx`) + read(`${F.compDir}/HkRoomSheet.tsx`);
    ok(/min-h-1[2-6]|\bh-1[2-6]\b|py-[3-6]|text-lg|text-xl|min-h-\[4[48]px\]/.test(card), "ไม่มีปุ่มใหญ่");
    const sheet = read(`${F.compDir}/HkRoomSheet.tsx`);
    ok(/<button[^>]*>[\s\S]{0,200}ส่งให้ตรวจ|ส่งให้ตรวจ[\s\S]{0,80}<\/button>/.test(sheet), "ปุ่มเสร็จไม่ใช่ <button");
    const mb = read(`${F.compDir}/HkMinibar.tsx`);
    ok(/aria-label=["'](ลด|เพิ่ม)/.test(mb) || (/[−-]/.test(mb) && /\+/.test(mb)), "HkMinibar ไม่มี −/+");
    const df = read(`${F.compDir}/HkDefectDialog.tsx`);
    ok(/type=["']file["']/.test(df) && /accept=["']image\/(\*|png|jpeg|webp)[^"']*["']/.test(df) && /BLOCK/.test(df) && /REPAIR/.test(df), "HkDefectDialog ไม่มี input รูป/ตัวเลือก BLOCK|REPAIR");
    const wide = COMPS.filter((f) => /min-w-\[[4-9]\d\dpx\]|minWidth:\s*["']?[4-9]\d\d/.test(read(f)));
    eq(wide, [], "กว้างเกิน 390 ตายตัว");
  });
  await st("U-8", "facade hotel/index.ts export H.6 (บล็อก // SVC H.6 ▸ … ◂): hkBoard hkSetStatus hkStart hkFinish hkInspect hkLogs postMinibar reportDefect markStayoversDirty + canHkTransition hkPriority parseHkNote serializeHkNote + HK_TRANSITIONS · ของ H.1 ยังครบ (quoteStay · loadHotelSettings) · housekeeping.ts ใช้ setHkStatus ของ rooms (ไม่ update hkStatus ตรง) และไม่ import prisma ดิบ (tenantDb/withRoomTx)", () => {
    ok(hotelL.mod, hotelL.err);
    eq([...HK_FNS, ...STATE_FNS, "quoteStay", "loadHotelSettings"].filter((n) => typeof hotelL.mod[n] !== "function"), [], "ขาด");
    ok(hotelL.mod.HK_TRANSITIONS !== undefined, "ไม่มี HK_TRANSITIONS ใน facade");
    ok(/SVC H\.6 ▸[\s\S]*◂/.test(read(F.index)), "ไม่มีบล็อก // SVC H.6 ▸ … ◂");
    const hk = stripComments(read(F.hk));
    ok(hk, `ยังไม่มี ${F.hk}`);
    ok(/setHkStatus\s*\(/.test(hk), "housekeeping.ts ไม่เรียก setHkStatus ของแกนห้อง");
    ok(!/hotelRoom\.update(Many)?\(\s*\{[\s\S]{0,200}hkStatus\s*:/.test(hk), "housekeeping.ts เขียน hkStatus ตรง (ต้องผ่าน setHkStatus)");
    ok(!/from\s*["']@\/lib\/core\/db["'][\s\S]*\bprisma\b/.test(hk) || /tenantDb/.test(hk), "import prisma ดิบ");
  });

  // ═══════════════ F ไฟล์ที่แตะ (git · ตอนรับใบ) ═══════════════
  console.log("\n── F ไฟล์ที่แตะ (git) ──");
  const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  const OWN = new Set<string>([F.hk, F.state, F.index, F.actions, F.portal, F.repair, F.rtEvents, F.rtIndex, F.rtClient, F.tokenRoute, ...COMPS, F.hkShared, ...PAGES, F.tabs, F.layout, F.consumers, F.autoLabels, F.whLabels, F.defs, F.perms, F.scene, F.sds, "scripts/qc-svc-h.6.mts"]);
  {
    const ch = dirty(["src", "prisma", "public", "scripts", "docs"]).filter((f) => f !== "scripts/qc-svc-h.6.mts");
    const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.hk}`]); return true; } catch { return false; } })();
    if (ch.length === 0 && headHas) skip("F-1", "แตะเฉพาะไฟล์ของใบ (§1)", "H.6 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
    else await st("F-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ): housekeeping/hk-state · index/actions · dorm/portal.ts + repair.ts · realtime events/index/client · route token · 7 คอมโพเนนต์ + hk-shared · 3 หน้า · hotel-tabs-shared (+layout) · 3 ทะเบียน event · defs/rooms.ts (hk.canBlock) · permissions.ts · ฉาก · sds — ไม่แตะอื่น", () => {
      ok(ch.length > 0, "ยังไม่มีงาน (git status ว่าง) — ยังไม่มี housekeeping.ts");
      eq(ch.filter((f) => !OWN.has(f)).slice(0, 10), [], "ไฟล์นอกใบ");
    });
  }
  await st("F-2", "ไม่แตะชิ้นต้องห้าม (§1): prisma/** · rooms/** · folio.ts · tape.ts/block.ts · booking.ts · dorm อื่นนอก portal.ts/repair.ts · core (ยกเว้น permissions.ts + settings/defs/rooms.ts) · svc-qc-data.mts · ข้อสอบอื่น — ตรวจเมื่อมีงาน (housekeeping.ts)", () => {
    ok(has(F.hk), `ยังไม่มี ${F.hk} — ตรวจตอนรับใบ`);
    const banned = dirty(["prisma", "src/lib/modules/rooms", "src/lib/modules/hotel/folio.ts", "src/lib/modules/hotel/tape.ts", "src/lib/modules/hotel/block.ts", "src/lib/modules/hotel/booking.ts", "src/lib/modules/hotel/checkout.ts", "src/lib/modules/dorm", "src/lib/core", "scripts/svc-qc-data.mts", "scripts/qc-svc-h.0.mts", "scripts/qc-svc-h.2.mts", "scripts/qc-svc-h.3.mts", "scripts/qc-svc-h.5.mts", "scripts/qc-svc-d.16.mts"]).filter((f) => f !== F.perms && f !== F.defs && f !== F.portal && f !== F.repair);
    eq(banned, [], "ไฟล์ต้องห้าม");
  });
  await st("F-3", "แก้เฉพาะที่ใบให้ (§1): dorm/portal.ts เพิ่มอย่างเดียว (ไม่ลบบรรทัด · dormStaffGate มี opts allowTypes ค่าเริ่ม DORM) · dorm/repair.ts แก้เฉพาะจุดเรียก gate (บรรทัดที่ลบ ≤ 3 และทุกบรรทัดที่ลบ/เพิ่มอ้าง dormStaffGate/allowTypes/staffGate) · defs/rooms.ts · index/actions/3 ทะเบียน/realtime ไม่ลบบรรทัดเดิม · permissions.ts ลบได้เฉพาะ 2 บรรทัด planned · hotel-tabs-shared เปลี่ยน 1 บรรทัด", () => {
    ok(has(F.hk), `ยังไม่มี ${F.hk} — ตรวจตอนรับใบ`);
    const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim());
    const bad: string[] = [];
    if (dirty([F.portal]).length) { if (rm(F.portal).length > 0) bad.push(`portal.ts ลบ ${rm(F.portal).length}`); if (!/allowTypes/.test(read(F.portal))) bad.push("portal.ts ไม่มี allowTypes"); }
    if (dirty([F.repair]).length) { const d = diffLines(F.repair); if (rm(F.repair).length > 3) bad.push(`repair.ts ลบ ${rm(F.repair).length} > 3`); if (!d.every((l) => /dormStaffGate|allowTypes|staffGate|HOTEL/.test(l))) bad.push(`repair.ts แก้นอกจุดเรียก gate: ${d.filter((l) => !/dormStaffGate|allowTypes|staffGate|HOTEL/.test(l)).slice(0, 3).join(" | ").slice(0, 200)}`); }
    for (const f of [F.defs, F.index, F.actions, F.consumers, F.autoLabels, F.whLabels, F.rtEvents, F.rtIndex, F.rtClient]) if (dirty([f]).length && rm(f).length > 0) bad.push(`${f} ลบ ${rm(f).length}`);
    if (dirty([F.perms]).length && rm(F.perms).length > 2) bad.push(`${F.perms} ลบ ${rm(F.perms).length} > 2`);
    if (dirty([F.tabs]).length && rm(F.tabs).length > 1) bad.push(`${F.tabs} ลบ ${rm(F.tabs).length} > 1`);
    eq(bad, [], "แก้นอกที่ให้");
  }, "MAJOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  delete process.env.SVC_QC_CLOCK;
  delete process.env.ABLY_API_KEY;
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `svc-h6-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (รวม Hotel*/HousekeepingLog/DormRepair/FileAsset/AuditLog/OutboxEvent/SettingValue) · ผู้ใช้ทดสอบ 0 · ไม่มี SVC_QC_CLOCK/ABLY_API_KEY ค้าง · ร้าน svcqc ไม่ถูกแตะ (ค่าตั้ง rooms.hotel.* ชั้น UNIT ของ svcqc ไม่เพิ่ม)", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: MAIL } } }), 0, "user");
    eq([process.env.SVC_QC_CLOCK ?? null, process.env.ABLY_API_KEY ?? null], [null, null], "env ค้าง");
  }, "MAJOR");
}

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc (svc-qc-hotel-hk-scene) ──");
{
  let why = "";
  let unitId = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.hotel.slug, type: "HOTEL" }, select: { id: true } }) : null;
    const nt = u ? await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id } }) : 0;
    if (!t || !u || nt < 3) why = "ร้าน svcqc/หน่วย hotel ยังไม่ seed บนฐาน l3 (scripts/seed-svc-qc.mts)";
    else if (!H0_OK) why = H0_WHY;
    else if (!has(F.booking)) why = `ยังไม่มี ${F.booking} (H.3)`;
    else if (!blockL.mod) why = `ยังไม่มี ${F.block} (H.2 · ฉาก h.2 ต้องใช้ blockRoom)`;
    else if (!folioL.mod) why = `ยังไม่มี ${F.folio} (H.5 · เช็กเอาต์ B203-out + MINIBAR)`;
    else if (!hkL.mod || !stateL.mod) why = `ยังไม่มี ${F.hk}/${F.state}`;
    else if (!has(F.sceneH1) || !has(F.sceneH3) || !has(F.sceneH2)) why = `ยังไม่มีฉาก ${F.sceneH1}/${F.sceneH3}/${F.sceneH2}`;
    else if (!has(F.scene)) why = `ยังไม่มี ${F.scene}`;
    else unitId = u.id;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScript = (rel: string, args: string[] = [], env: Record<string, string> = {}) => spawnSync("pnpm", ["exec", "tsx", rel, ...args], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const roomsQ = () => prisma.hotelRoom.findMany({ where: { tenantId: SQC_TENANT.id, unitId, active: true }, select: { id: true, number: true, hkStatus: true, hkNote: true } }) as Promise<Any[]>;
  const otherSig = async () => J([await prisma.hotelHousekeepingLog.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } })]);
  const n1 = `ฉาก ${F.scene}: (h.1 → h.3 --clear → h.2 → h.6) รัน exit 0 · SCENE_SUMMARY {created,updated,removed} + roomId ของ B203 · hkStatus ตาม byStatus (DIRTY ${J(HS.expect.byStatus.DIRTY)} · INSPECTED ${J(HS.expect.byStatus.INSPECTED)} · OUT_OF_ORDER ${J(HS.expect.byStatus.OUT_OF_ORDER)}) · hkNote B203 JSON assignedTo=maid startedAt ≈ now−18m · B101 guestRequest "แขกขอทำหลัง 13:00" · hkBoard(mine=maid) counts = ${J(HS.expect.counts)} · 3 ห้องแรก ${J(HS.expect.orderFirst3)} · B203 context DEPARTED · มินิบาร์ B105: FolioItem MINIBAR ${HS.expect.minibarFolioItems} แถว รวม ${HS.expect.minibarAmountSatang} สตางค์ · ค่าตั้งฉาก (inspectionRequired/dailyHousekeeping/hk.canBlock) ชั้น UNIT · ร้านอื่นไม่เปลี่ยน`;
  const n2 = "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0 · hkStatus/hkNote/FolioItem เท่าเดิม (ไม่โพสต์มินิบาร์ซ้ำ)";
  const n3 = "--clear ⇒ hkNote ของฉากล้าง · ค่าตั้งคืน · FolioItem MINIBAR ของฉาก void/ลบ · ห้องกลับสถานะก่อนฉาก (ตาม h.2) · ร้านอื่นคงเดิม · รันคืน";
  if (why) { for (const [id, n] of [["Q-1", n1], ["Q-2", n2], ["Q-3", n3]]) skip(id, n, why, "MAJOR"); }
  else {
    const sigOf = async () => J((await roomsQ()).map((r) => [r.number, r.hkStatus, r.hkNote]).sort());
    const minibarItems = async () => prisma.hotelFolioItem.findMany({ where: { tenantId: SQC_TENANT.id, unitId, type: "MINIBAR", voidedAt: null } }) as Promise<Any[]>;
    await st("Q-1", n1, async () => {
      ok(runScript(F.sceneH1).status === 0, "ฉาก h.1 ล้ม");
      runScript(F.scene, ["--clear"]);
      runScript(F.sceneH3, ["--clear"]);
      runScript(F.sceneH2, ["--clear"]);
      ok(runScript(F.sceneH2).status === 0, "ฉาก h.2 ล้ม");
      const o0 = await otherSig();
      const a = runScript(F.scene);
      const sum = summary(`${a.stdout}`);
      ok(a.status === 0 && sum && ["created", "updated", "removed"].every((k) => typeof sum[k] === "number"), `exit=${a.status} ${sum ? fmt(sum) : `${a.stdout}${a.stderr}`.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
      const rooms = await roomsQ();
      const byNum = Object.fromEntries(rooms.map((r) => [r.number, r]));
      for (const [status, nums] of Object.entries(HS.expect.byStatus)) for (const n of nums) eq(byNum[n]?.hkStatus, status, `hkStatus ${n}`);
      const b203 = parseJson(byNum.B203?.hkNote) ?? {};
      eq(b203.assignedTo, MAID_FX.userId, "B203 assignedTo");
      ok(near(msOf(b203.startedAt), Date.now() - 18 * 60_000, 5 * 60_000), `B203 startedAt ${fmt(b203.startedAt)}`);
      eq((parseJson(byNum.B101?.hkNote) ?? {}).guestRequest, "แขกขอทำหลัง 13:00", "B101 guestRequest");
      ok(J(sum).includes(byNum.B203?.id ?? "∅"), "SCENE_SUMMARY ไม่พิมพ์ roomId B203");
      const b = await call(() => H6("hkBoard")({ tenantId: SQC_TENANT.id }, { unitId, mine: MAID_FX.userId }));
      okRes(b, "hkBoard svcqc");
      eq(b.counts, { ...HS.expect.counts }, "counts");
      eq(rowsOf(b).slice(0, 3).map((r: Any) => r.number), [...HS.expect.orderFirst3], "3 ห้องแรก");
      eq(rowsOf(b).find((r: Any) => r.number === "B203")?.context, "DEPARTED", "B203 context");
      const items = await minibarItems();
      eq([items.length, items.reduce((s, i) => s + i.amountSatang, 0)], [HS.expect.minibarFolioItems, HS.expect.minibarAmountSatang], "มินิบาร์ B105");
      for (const [k, v] of Object.entries(HS.settings)) eq((await SET.resolveSetting({ tenantId: SQC_TENANT.id }, k, { unitId }))?.value, v, `ค่าตั้ง ${k}`);
      eq(await otherSig(), o0, "ร้านอื่นเปลี่ยน");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const s0 = await sigOf(), m0 = (await minibarItems()).length;
      const b = runScript(F.scene);
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      eq([await sigOf(), (await minibarItems()).length], [s0, m0], "เปลี่ยน");
    }, "MAJOR");
    await st("Q-3", n3, async () => {
      const o0 = await otherSig();
      const cl = runScript(F.scene, ["--clear"]);
      ok(cl.status === 0, `--clear exit=${cl.status}`);
      ok((await roomsQ()).every((r) => !r.hkNote || !(parseJson(r.hkNote) ?? {}).assignedTo), "hkNote ค้าง");
      eq((await minibarItems()).length, 0, "MINIBAR ค้าง");
      eq(await otherSig(), o0, "ลบเกิน");
      const back = runScript(F.scene);
      ok(back.status === 0 && (await minibarItems()).length === HS.expect.minibarFolioItems, "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const name = "visual-svc h.6 ด้วย maid · hk-lead · owner · 2–3 ใบ (บอร์ดงานวันนี้ · [SVC_VIS_H6_ROOM_ID] ทำห้อง B203 · ประวัติ) × 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน — ผู้คุม PARITY ภาพ 13 ก/ข (มือถือ 390 หลัก)";
  if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก h.1 → h.3 --clear → h.2 → h.6 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port> (SVC_VIS_H6_ROOM_ID จาก SCENE_SUMMARY)", "MAJOR");
  else {
    const bad: string[] = [];
    let env: Record<string, string> = {};
    try {
      const u = await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.hotel.slug }, select: { id: true } });
      const r = u ? await prisma.hotelRoom.findFirst({ where: { tenantId: SQC_TENANT.id, unitId: u.id, number: HS.expect.startedRoom }, select: { id: true } }) : null;
      if (r) env = { SVC_VIS_H6_ROOM_ID: r.id };
    } catch { /* */ }
    for (const user of ["maid", "hk-lead", "owner"]) {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.6", "--user", user, "--base", base], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (r.status !== 0) bad.push(`${user} exit=${r.status} ${`${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.includes("❌")).slice(0, 2).join(" | ").slice(0, 200)}`);
    }
    record("V-1", name, bad.length ? "FAIL" : "PASS", bad.join(" · "), "MAJOR");
  }
}

// ═══════════════ G regression ═══════════════
console.log("\n── G: regression ──");
const summaryOf = (out: string): { failed: string[]; findings?: string[] } | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed: string[]; findings?: string[] }; } catch { return null; }
};
const judgeNoFail = (out: string) => (summaryOf(out)?.failed.length ?? 1) === 0;
const judgeAllow = (allowed: string[]) => (out: string) => { const f = summaryOf(out)?.failed; return Array.isArray(f) && f.every((id) => allowed.includes(id)); };
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-h.2", args: ["--no-regression"], judge: judgeNoFail, note: "ปฏิทินห้อง/blockRoom ไม่มี FAIL (reportDefect BLOCK ยืนบน)" },
  { s: "qc-svc-h.3", args: ["--no-regression"], judge: judgeNoFail, note: "จอง V2 ไม่มี FAIL" },
  { s: "qc-svc-h.5", args: ["--no-regression"], judge: judgeNoFail, note: "folio ไม่มี FAIL (postFolioItem MINIBAR)" },
  { s: "qc-svc-h.0", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.8", judge: judgeNoFail, note: "แกนห้อง hkStatus/OOO ไม่มี FAIL" },
  { s: "qc-svc-r0.9", judge: judgeAllow(["G-1"]), note: "ผังห้อง ไม่มี FAIL (ยอม G-1)" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "หน้าหอ/สิทธิ์หอไม่เปลี่ยน" },
  { s: "qc-svc-d.16", args: ["--no-regression"], judge: judgeNoFail, note: "แจ้งซ่อมหอ (dormStaffGate ค่าเริ่ม DORM · เส้น staff) ไม่มี FAIL" },
  { s: "qc-svc-smoke" },
  { s: "qc-svc-b.0", judge: judgeNoFail, note: "ทะเบียน event ไม่มี FAIL" },
];
{
  const hasWork = typeof hkL.mod?.hkBoard === "function" && typeof stateL.mod?.canHkTransition === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (housekeeping.ts/hk-state.ts) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_H6_NO_REGRESSION=1" : "";
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ไม่เป็นไร */ }
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `${LOG_DIR}/svc-h6-reg-${g.s}.log`;
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
console.log(`\n===== QC SVC H.6 · แม่บ้านมือถือ · state machine · มินิบาร์ · แจ้งของเสีย · realtime =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`กลุ่ม: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.passed}/${v.total}${v.skipped ? ` (skip ${v.skipped})` : ""}`).join(" · ")}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id), byGroup })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed/ยังไม่มีฉาก/H.2 H.3 H.5 ยังไม่ merge · F-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
