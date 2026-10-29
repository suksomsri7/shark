// QC — SVC B.6 · ตู้ · ทีวี · หน้าบัตร (ภาพ จอง 04 · 05 · 06ก) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.6.md (§3 สัญญา · §4 DOM · §7 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว B.6
//        ledger/DESIGN-BOOKING-QUEUE.md R4 · §7 · ภาคผนวก ก #44 #52–58 · ภาพ ledger/design-booking/04-kiosk.png 05-tv-display.png 06-customer-line.png (ก)
//
// กลุ่มข้อ:
//   T/F แม่แบบ BARBER + ฉากภาพ 01 ทั้งวัน (SQC_TODAY_LINE_SCENE) ต่อด้วย SQC_DEVICE_SCENE.extraEvents ⇒ สภาพ 14:40 ของภาพ 05
//   PC  ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ฉาก 14:40 ด้วยตัวโหลดของ B.5 · อ่านค่าตั้งชั้น DEVICE ได้ · issueLinkCode · checkInToken · rate limit · ตัวช่วยตรวจ PII
//   D   core-fix: ชั้น DEVICE ในเครื่องยนต์ค่าตั้ง (เขียน · X1 · ฟอร์ม)
//   M   อุปกรณ์ (devices.ts): สร้าง/รายการ/เปลี่ยน token/ถอน · เก็บเป็น sha256 · audit · X1
//   TV  ตัวโหลดทีวี (เลขอย่างเดียว · ค่าตั้งรายเครื่อง · X7 · X8)
//   K   ตู้: หน้าแรก · บริการ/ช่าง/เบอร์/พิมพ์/ล็อก ตามค่าตั้งรายเครื่อง · เช็กอิน (เบอร์ · QR) · walk-in · QR LINE · X7 · rate limit
//   C   หน้าบัตรลูกค้า: token HMAC · มุมมอง · ขอเลื่อนไปคิวหลัง · ยกเลิก · อายุ · X7 · rate limit
//   L   ปิดทางสาธารณะเดิม (getTicketStatus/getDisplaySnapshot) ของหน่วยแถวเดียว · U DOM (renderToStaticMarkup)
//   H   server จริง (QC_BASE) · S ไฟล์/สัญญาโค้ด · Q ฉาก svcqc · V ภาพ · G regression (หลังล้าง) · Z ล้างข้อมูล
//
// เวลา: วันฉาก = sqcLineSceneDate(วันนี้ไทย) (เสาร์ ≥ วันนี้+3) · now ฉีดเข้าทุกฟังก์ชัน · tick ส่ง tenantIds เสมอ
// ร้านทดสอบ slug `qc-svc-b6-*` · ผู้ใช้ `qc-svc-b6-*@qc.invalid` · id ขึ้นต้น `svcb6_` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.6.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้อาร์กิวเมนต์ · QC_BASE=http://127.0.0.1:<port> เปิดหมวด H/V)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import {
  SQC, SQC_TODAY_LINE_SCENE as SCENE, SQC_DEVICE_SCENE as DSC, SQC_VISUAL_SPECS, sqcLineSceneDate, sqcDeviceSceneDay, sqcTicketToken,
  type SqcLineStaffKey, type SqcDeviceEvent,
} from "./svc-qc-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-b.6";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B6_NO_REGRESSION === "1";
const F = {
  pub: "src/lib/modules/booking/public-line.ts",
  dev: "src/lib/modules/booking/devices.ts",
  index: "src/lib/modules/booking/index.ts",
  settingsSvc: "src/lib/core/settings/service.ts",
  queue: "src/lib/modules/queue/service.ts",
  queueActions: "src/lib/modules/queue/actions.ts",
  actPub: "src/app/(store)/bq/actions.ts", // ORACLE-EDIT (ผู้คุม 29 ต.ค.): action สาธารณะ (token ไม่ใช่ล็อกอิน) อยู่ใต้ app/(store) ตามแบบ q/ · r/[token]/ · f/[token]/ (fitness F6 สแกน src/lib/actions)
  actDev: "src/lib/actions/booking-devices.ts",
  pageTv: "src/app/(store)/bq/tv/[token]/page.tsx",
  pageKiosk: "src/app/(store)/bq/kiosk/[token]/page.tsx",
  pageTicket: "src/app/(store)/bq/t/[token]/page.tsx",
  pageDevices: "src/app/app/u/[unitSlug]/booking/devices/page.tsx",
  compTv: "src/components/booking/public/TvBoard.tsx",
  compKiosk: "src/components/booking/public/Kiosk.tsx",
  compTicket: "src/components/booking/public/TicketCard.tsx",
  compDevices: "src/components/booking/DevicesPanel.tsx",
  todayLine: "src/components/booking/TodayLine.tsx",
  scene: "scripts/svc-qc-device-scene.mts",
} as const;
const FROZEN = [
  "src/lib/modules/booking/planner.ts", "src/lib/modules/booking/planner-run.ts", "src/lib/modules/booking/queue-line.ts",
  "src/lib/modules/booking/today-line.ts", "src/lib/modules/booking/line-ops.ts", "src/lib/core/permissions.ts",
  "src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts", "src/lib/modules/booking/settings-model.ts",
];

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc (ep-mute-scene) ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type NowOpt = { now?: Date };
type DeviceKind = "TV" | "KIOSK";
type BookingDevice = { id: string; unitId: string; kind: DeviceKind; name: string; createdAt: Date };
type DevFail = { ok: false; code: string; reason: string };
type DevApi = {
  createDevice?: (ctx: Ctx, i: { kind: string; name: string }) => Promise<{ ok: true; device: BookingDevice; token: string } | DevFail>;
  listDevices?: (ctx: Ctx) => Promise<BookingDevice[]>;
  rotateDeviceToken?: (ctx: Ctx, id: string) => Promise<{ ok: true; token: string } | DevFail>;
  revokeDevice?: (ctx: Ctx, id: string) => Promise<{ ok: true } | DevFail>;
  deviceByToken?: (token: unknown, kind: DeviceKind) => Promise<{ tenantId: string; unitId: string; deviceId: string; name: string } | null>;
};
type TvChair = { seat: number; staffName: string | null; state: "BUSY" | "CALLING" | "FREE"; ticketNumber: string | null; nextTicketNumber: string | null };
type TvNext = { ticketNumber: string; startMs: number | null; seat: number | null; staffName: string | null; booked: boolean };
type TvView = {
  unitName: string; dayStr: string; nowMs: number;
  calling: { ticketNumber: string; seat: number | null; staffName: string | null; serviceName: string } | null;
  chairs: TvChair[]; next: TvNext[]; walkInWaitMin: number | null; voice: string[];
};
type KioskService = { id: string; name: string; durationMin: number; priceSatang: number; walkIn: boolean };
type KioskView = {
  unitName: string; dayStr: string; nowMs: number; busyCount: number; seatCount: number; waitingCount: number; nextTicketNumber: string | null; walkInWaitMin: number | null;
  services: KioskService[]; staff: { id: string; name: string }[] | null; phone: "OPTIONAL" | "REQUIRED"; paperTicket: boolean; pinLock: boolean;
};
type KioskTicket = { ticketNumber: string; serviceName: string; staffName: string | null; seat: number | null; plannedStartMs: number | null; waitMin: number | null; aheadCount: number; ticketUrl: string; lineLink: string | null };
type KioskCheckedIn = KioskTicket & { bookedStartMs: number };
type Fail = { ok: false; code: string; reason: string; candidates?: unknown };
type TicketAhead = { kind: "NOW" | "WAIT" | "BOOKED" | "ME"; ticketNumber: string | null; startMs: number | null; seat: number | null };
type TicketView = {
  unitName: string; ticketNumber: string; status: string; kind: "BOOKED" | "WALKIN"; serviceName: string; staffName: string | null; seat: number | null;
  issuedAtMs: number; bookedStartMs: number | null; plannedStartMs: number | null; returnByMs: number | null; aheadCount: number | null; ahead: TicketAhead[]; canDefer: boolean; canCancel: boolean;
};
type PubApi = {
  loadTvView?: (token: unknown, opts?: NowOpt) => Promise<TvView | null>;
  loadKioskView?: (token: unknown, opts?: NowOpt) => Promise<KioskView | null>;
  kioskCheckIn?: (token: unknown, by: { phone: string } | { qr: string }, opts?: NowOpt) => Promise<{ ok: true; ticket: KioskCheckedIn } | Fail>;
  kioskWalkIn?: (token: unknown, i: { serviceId: string; staffId: string | null; phone?: string }, opts?: NowOpt) => Promise<{ ok: true; ticket: KioskTicket } | Fail>;
  ticketToken?: (t: { tenantId: string; unitId: string; businessDate: string; number: string }) => string;
  ticketTokenFor?: (ctx: Ctx, ticketId: string) => Promise<string | null>;
  loadTicketView?: (token: unknown, opts?: NowOpt) => Promise<TicketView | null>;
  deferTicket?: (token: unknown, opts?: NowOpt) => Promise<{ ok: true } | Fail>;
  cancelTicket?: (token: unknown, opts?: NowOpt) => Promise<{ ok: true } | Fail>;
  KIOSK_RATE?: { checkIn: { limit: number; windowMs: number }; walkIn: { limit: number; windowMs: number } };
  TICKET_RATE?: { limit: number; windowMs: number };
};
// ของเดิม (มีแล้ว)
type JobResult = { ok: true } | { ok: false; code: string; reason: string };
type LineApi = {
  checkIn: (ctx: Ctx, by: { appointmentId: string }, opts: { via: "STAFF"; now?: Date }) => Promise<{ ok: boolean; code?: string; reason?: string }>;
  checkInToken: (ctx: Ctx, appointmentId: string) => Promise<string | null>;
  createWalkIn: (ctx: Ctx, i: { serviceId: string; staffId: string | null; channel: "STAFF" }, opts?: NowOpt) => Promise<{ ok: true; appointmentId: string } | { ok: false; code: string; reason: string }>;
  callJob: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  startJob: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  completeJob: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  cancelByShop: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
};
type RunApi = {
  runPlanner: (ctx: { tenantId: string; unitId: string }, opts?: NowOpt) => Promise<unknown>;
  runLineTick: (now: Date, opts?: { tenantIds?: string[] }) => Promise<unknown>;
};
type BookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: "STAFF"; customerName: string; customerPhone: string; idempotencyKey?: string };
type BookingApi = {
  bookAppointment: (ctx: Ctx, i: BookInput) => Promise<{ ok: true; id: string; staffId: string; status: "PENDING" | "CONFIRMED" } | { ok: false; code: string; reason: string }>;
  setAppointmentStatus: (tenantId: string, unitId: string, id: string, status: "CONFIRMED") => Promise<{ ok: boolean; reason?: string }>;
};
type LineJobLite = { appointmentId: string; ticketNumber: string | null; plannedStartMs: number | null; staffId: string | null };
type TodayLite = { waiting: LineJobLite[]; inService: LineJobLite[]; kpi: { waiting: number } };
type TodayApi = { loadTodayLine: (ctx: Ctx, viewer: { userId: string; access: Record<string, boolean> }, opts?: NowOpt) => Promise<TodayLite | null> };
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type SetRes = { ok: boolean; code?: string; issues?: unknown };
type Resolved = { value: unknown; source: string };
type FormModel = { groups: { fields: { key: string; editable: boolean }[] }[] } | null;
type SettingsApi = {
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<SetRes>;
  setSettings: (actor: Actor, ctx: { tenantId: string }, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<SetRes>;
  resetSetting: (actor: Actor, ctx: { tenantId: string }, t: { key: string; scope: string; scopeId: string }) => Promise<SetRes>;
  resolveSettings: (ctx: { tenantId: string }, keys: string[], refs: Record<string, string>, at?: Date) => Promise<Record<string, Resolved>>;
  loadSettingsForm: (actor: Actor, ctx: { tenantId: string }, q: { domains: string[]; unitId: string; scope?: string; scopeId?: string }) => Promise<FormModel>;
};
type QueueApi = {
  getTicketStatus: (unitId: string, publicToken: string) => Promise<unknown>;
  getDisplaySnapshot: (unitId: string, displayToken: string) => Promise<unknown>;
};
type ChatApi = { issueLinkCode: (ctx: { tenantId: string }, i: { purpose: string; refId: string; ttlMin: number; connectionId?: string | null }) => Promise<{ ok: true; code: string; deepLink: string | null } | { ok: false; error: string }> };
type RateApi = { checkRateLimitDb: (key: string, o: { limit: number; windowMs: number }, now?: number) => Promise<{ ok: boolean }> };
type LinkApi = { verifyLink: (t: unknown, purpose: string) => { tenantId: string; subjectId: string } | null };

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 260) ?? String(v); } catch { return String(v); } };
const ok = (cond: boolean, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", errMsg(e), sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const tryImport = async <T,>(spec: string): Promise<{ mod: T | null; err: string }> => {
  try { return { mod: (await import(spec)) as T, err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * 60_000; };
const hm = (s: string): number => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const at = (ds: string, s: string | number): Date => new Date(bkkMs(ds, typeof s === "number" ? s : hm(s)));
const hhmm = (ms: number | null | undefined) => (ms == null ? "null" : new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const SECRET = process.env.SESSION_SECRET ?? "";
/** token หน้าบัตรตามสูตรของใบสั่ง §3.4 (ตัวเดียวกับ sqcTicketToken ของฉากภาพ) */
const tkToken = (tenantId: string, unitId: string, businessDate: string, number: string) => sqcTicketToken(SECRET, { tenantId, unitId, businessDate, number });

// ═══════════════ โหลดโมดูล ═══════════════
const loadIf = async <T,>(rel: string) => (existsSync(join(ROOT, rel)) ? tryImport<T>(pathToFileURL(join(ROOT, rel)).href) : { mod: null as T | null, err: `ยังไม่มีไฟล์ «${rel}»` });
const pubLoad = await loadIf<PubApi>(F.pub);
const devLoad = await loadIf<DevApi>(F.dev);
const lineLoad = await tryImport<LineApi>("@/lib/modules/booking/queue-line");
const runLoad = await tryImport<RunApi>("@/lib/modules/booking/planner-run");
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const todayLoad = await tryImport<TodayApi>("@/lib/modules/booking/today-line");
const settingsLoad = await tryImport<SettingsApi>("@/lib/core/settings");
const queueLoad = await tryImport<QueueApi>("@/lib/modules/queue/service");
const chatLoad = await tryImport<ChatApi>("@/lib/modules/chat/link-code");
const rateLoad = await tryImport<RateApi>("@/lib/core/rate-limit-db");
const linkLoad = await tryImport<LinkApi>("@/lib/core/signed-link");
const fnOf = <Fn,>(load: { mod: unknown; err: string }, name: string, rel: string): Fn => {
  const f = (load.mod as Record<string, unknown> | null)?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as Fn;
};
const PUB = {
  tv: () => fnOf<NonNullable<PubApi["loadTvView"]>>(pubLoad, "loadTvView", F.pub),
  kiosk: () => fnOf<NonNullable<PubApi["loadKioskView"]>>(pubLoad, "loadKioskView", F.pub),
  checkIn: () => fnOf<NonNullable<PubApi["kioskCheckIn"]>>(pubLoad, "kioskCheckIn", F.pub),
  walkIn: () => fnOf<NonNullable<PubApi["kioskWalkIn"]>>(pubLoad, "kioskWalkIn", F.pub),
  token: () => fnOf<NonNullable<PubApi["ticketToken"]>>(pubLoad, "ticketToken", F.pub),
  tokenFor: () => fnOf<NonNullable<PubApi["ticketTokenFor"]>>(pubLoad, "ticketTokenFor", F.pub),
  ticket: () => fnOf<NonNullable<PubApi["loadTicketView"]>>(pubLoad, "loadTicketView", F.pub),
  defer: () => fnOf<NonNullable<PubApi["deferTicket"]>>(pubLoad, "deferTicket", F.pub),
  cancel: () => fnOf<NonNullable<PubApi["cancelTicket"]>>(pubLoad, "cancelTicket", F.pub),
};
const DEV = {
  create: () => fnOf<NonNullable<DevApi["createDevice"]>>(devLoad, "createDevice", F.dev),
  list: () => fnOf<NonNullable<DevApi["listDevices"]>>(devLoad, "listDevices", F.dev),
  rotate: () => fnOf<NonNullable<DevApi["rotateDeviceToken"]>>(devLoad, "rotateDeviceToken", F.dev),
  revoke: () => fnOf<NonNullable<DevApi["revokeDevice"]>>(devLoad, "revokeDevice", F.dev),
  byToken: () => fnOf<NonNullable<DevApi["deviceByToken"]>>(devLoad, "deviceByToken", F.dev),
};
const must = <T,>(l: { mod: T | null; err: string }, what: string): T => { if (!l.mod) throw new AssertFail(`โหลด ${what} ไม่ได้ (${l.err})`); return l.mod; };
const LN = () => must(lineLoad, "queue-line");
const RN = () => must(runLoad, "planner-run");
const BK = () => must(bookingLoad, "booking/service");
const TD = () => must(todayLoad, "today-line (B.5)");
const SETTINGS = () => must(settingsLoad, "core/settings");
const QS = () => must(queueLoad, "queue/service");
const CHAT = () => must(chatLoad, "chat/link-code");
const RATE = () => must(rateLoad, "core/rate-limit-db");

// คอมโพเนนต์ (renderToStaticMarkup)
type Comp = (props: Record<string, unknown>) => unknown;
const compOf = async (rel: string): Promise<{ c: Comp | null; why: string }> => {
  if (!existsSync(join(ROOT, rel))) return { c: null, why: `ยังไม่มี ${rel}` };
  const r = await tryImport<Record<string, unknown>>(pathToFileURL(join(ROOT, rel)).href);
  if (!r.mod) return { c: null, why: `import ${rel} ล้ม: ${r.err}` };
  return typeof r.mod.default === "function" ? { c: r.mod.default as Comp, why: "" } : { c: null, why: `${rel} ไม่มี default export ที่เป็นคอมโพเนนต์` };
};
const TvC = await compOf(F.compTv);
const KioskC = await compOf(F.compKiosk);
const TicketC = await compOf(F.compTicket);
const DevicesC = await compOf(F.compDevices);
type ReactLike = { createElement: (c: Comp | string, p: Record<string, unknown> | null, ...ch: unknown[]) => unknown };
type RdsLike = { renderToStaticMarkup: (el: unknown) => string };
const React = (await import("react" as string)) as unknown as ReactLike;
const RDS = (await import("react-dom/server" as string)) as unknown as RdsLike;
const noop2 = async (_p: unknown, _fd: FormData) => { void _p; void _fd; return null; };
const noop1 = async (_fd: FormData) => { void _fd; };
const render = (c: { c: Comp | null; why: string }, props: Record<string, unknown>): string => {
  if (!c.c) throw new AssertFail(c.why);
  return String(RDS.renderToStaticMarkup(React.createElement(c.c, props))).replace(/<!-- -->/g, "");
};
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const attrsOf = (openTag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const tagName = openTag.slice(1).split(/[\s>/]/)[0];
  for (const m of openTag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) if (m[1] !== tagName) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
};
/** กล่องทุกตัวที่มี attr ชื่อนี้ (แท็กสมดุล) → { attrs, html } ตามลำดับในเอกสาร */
function boxes(html: string, attr: string): { attrs: Record<string, string>; html: string; at: number }[] {
  const out: { attrs: Record<string, string>; html: string; at: number }[] = [];
  const re = new RegExp(`\\s${attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:="|[\\s/>])`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const open = html.lastIndexOf("<", m.index);
    const openEnd = html.indexOf(">", m.index);
    const openTag = html.slice(open, openEnd + 1);
    const tag = /^<([a-zA-Z0-9-]+)/.exec(openTag)?.[1] ?? "div";
    let end = openEnd + 1;
    if (!openTag.endsWith("/>") && !["input", "img", "br", "hr"].includes(tag)) {
      const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
      tagRe.lastIndex = open;
      let depth = 0;
      let mm: RegExpExecArray | null;
      while ((mm = tagRe.exec(html))) {
        if (mm[2] === "/") { if (depth === 0) { end = tagRe.lastIndex; break; } continue; }
        depth += mm[1] === "/" ? -1 : 1;
        if (depth === 0) { end = tagRe.lastIndex; break; }
      }
    }
    out.push({ attrs: attrsOf(openTag), html: html.slice(open, end), at: open });
  }
  return out;
}
const inputsOf = (html: string) => [...html.matchAll(/<input\b[^>]*>/g)].map((m) => attrsOf(m[0]));
const formsOf = (html: string) => boxes(html, "action").filter((b) => /^<form\b/.test(b.html));

// ชื่อ/เบอร์ลูกค้าของฉาก (X8) — ตัวตรวจ PII
const PHONES = [...SCENE.bookings.map((b) => b.phone), "0899000001", "0899000002", "0899000003"];
const NAMES = SCENE.bookings.map((b) => b.name);
const dashed = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
const piiLeak = (s: string): string[] => [
  ...PHONES.filter((p) => s.includes(p) || s.includes(dashed(p)) || s.includes(`+66${p.slice(1)}`) || s.includes(`66${p.slice(1)}`)),
  ...NAMES.filter((n) => s.includes(n)),
];

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb6_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: Record<string, unknown>): Promise<void> {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const SLUG = "qc-svc-b6-";
const USER_MAIL = "qc-svc-b6-";
const UA = "qc-svc-b6";
async function cleanup(idsToDel: string[]) {
  if (!idsToDel.length) return;
  const tables = (await q<{ table_name: string }>(`SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.table_name);
  let pending = tables;
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [idsToDel]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [idsToDel]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupGlobal() {
  try {
    await pool.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%svcb6\\_%'`); // ถังของตู้/บัตรทดสอบ (คีย์มี id ทดสอบ)
  } catch (e) { console.log(`  ⚠️ ลบ user/ถัง rate: ${errMsg(e)}`); }
}

// ═══════════════ ข้อมูลทดสอบ ═══════════════
const RUN = Date.now().toString(36);
const TODAY = bkkToday();
const D = sqcLineSceneDate(TODAY);          // วันฉาก (เสาร์ ≥ วันนี้+3)
const NOW = at(D, DSC.at);                   // 14:40 (ภาพ 05)
const KNOW = at(D, "11:00");                 // หน่วยตู้เบ็ดเตล็ด
const T = (k: string) => `svcb6_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"),
  uS: T("uS"), uK: T("uK"), uLeg: T("uLeg"), uQ: T("uQ"), uB: T("uB"),
  K1s: T("K1s"), K2s: T("K2s"), KCUT: T("KCUT"), KCOLOR: T("KCOLOR"), LS: T("LS"), B1: T("B1"), BS: T("BS"),
  chatSys: T("chatsys"), conn: T("conn"), qType: T("qtype"), qTicket: T("qticket"),
  uOwner: T("owner"), uCash: T("cash"), uOwnerB: T("ownerB"),
};
const STAFF: Record<SqcLineStaffKey, string> = { ek: T("ek"), boy: T("boy"), nun: T("nun"), jack: T("jack") };
const STAFF_NAME: Record<SqcLineStaffKey, string> = { ek: "ช่างเอก", boy: "ช่างบอย", nun: "ช่างนุ่น", jack: "ช่างแจ๊ค" };
const SVC: Record<string, string> = Object.fromEntries(SQC.barber.services.map((s) => [s.sku, T(s.sku.replace(/\W/g, ""))]));
const cS: Ctx = { tenantId: ids.tA, unitId: ids.uS };
const cK: Ctx = { tenantId: ids.tA, unitId: ids.uK };
const cLeg: Ctx = { tenantId: ids.tA, unitId: ids.uLeg };
const cBwithS: Ctx = { tenantId: ids.tB, unitId: ids.uS }; // X1: ร้าน B อ้างหน่วยของร้าน A
const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.uOwner };
const OWNER_B: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.uOwnerB };
const MGR_K: Actor = { role: "MANAGER", unitAccess: [ids.uK], permissions: {}, userId: T("mgrK") };
const SLUGS: Record<string, string> = {};
const OWNER_VIEW = { userId: ids.uOwner, access: { view: true, operate: true, checkIn: true, walkIn: true, runOwn: true, runAny: true, fullPhone: true } };

/** อุปกรณ์ทดสอบ — สร้างตรงตามการเก็บของใบสั่ง §3.1 (ไม่พึ่ง devices.ts ⇒ หมวด TV/K/C แดงเพราะ public-line เอง) */
type Dev = { id: string; tenantId: string; unitId: string; kind: DeviceKind; token: string; revoked?: boolean };
const DV: Record<string, Dev> = {
  TV1: { id: T("TV1"), tenantId: ids.tA, unitId: ids.uS, kind: "TV", token: newToken() },
  TV2: { id: T("TV2"), tenantId: ids.tA, unitId: ids.uS, kind: "TV", token: newToken() },        // nextCount 1 · label RESOURCE
  TVR: { id: T("TVR"), tenantId: ids.tA, unitId: ids.uS, kind: "TV", token: newToken(), revoked: true },
  TVD: { id: T("TVD"), tenantId: ids.tA, unitId: ids.uS, kind: "TV", token: newToken() },        // หมวด D (core-fix)
  TVLeg: { id: T("TVLeg"), tenantId: ids.tA, unitId: ids.uLeg, kind: "TV", token: newToken() },  // หน่วยไม่เปิดแถวเดียว
  K1: { id: T("K1"), tenantId: ids.tA, unitId: ids.uS, kind: "KIOSK", token: newToken() },       // ค่าแม่แบบ
  K2: { id: T("K2"), tenantId: ids.tA, unitId: ids.uS, kind: "KIOSK", token: newToken() },       // ALL · พิมพ์ · ไม่ล็อก
  KA: { id: T("KA"), tenantId: ids.tA, unitId: ids.uK, kind: "KIOSK", token: newToken() },       // หน่วยเบ็ดเตล็ด ค่าแม่แบบ
  KQ: { id: T("KQ"), tenantId: ids.tA, unitId: ids.uK, kind: "KIOSK", token: newToken() },       // เบอร์บังคับ · ไม่ให้เลือกช่าง
  KR: { id: T("KR"), tenantId: ids.tA, unitId: ids.uK, kind: "KIOSK", token: newToken() },       // rate limit
  KR2: { id: T("KR2"), tenantId: ids.tA, unitId: ids.uK, kind: "KIOSK", token: newToken() },
  KB: { id: T("KB"), tenantId: ids.tB, unitId: ids.uB, kind: "KIOSK", token: newToken() },       // ร้าน B
};
const DEVICE_SV: [string, string, unknown][] = [
  ["TV2", "booking.display.nextCount", 1], ["TV2", "booking.display.tvShow", { label: "RESOURCE", showCustomerName: true }],
  ["K2", "booking.kiosk.services", "ALL"], ["K2", "booking.kiosk.paperTicket", true], ["K2", "booking.kiosk.pinLock", false],
  ["KQ", "booking.kiosk.phone", "REQUIRED"], ["KQ", "booking.queue.walkInPickStaff", false],
];
const BAD_TOKENS = (): [string, unknown][] => [
  ["สุ่ม 43 ตัว", newToken()], ["สตริงสั้น", "abc"], ["ว่าง", ""], ["ไม่ใช่สตริง", 12345],
  ["ถอนแล้ว (TVR)", DV.TVR.token], ["hash ที่เก็บ", `sha256:${sha256hex(DV.TV1.token)}`],
];

const fx: Record<string, string> = {};       // คีย์ฉาก → appointmentId
let setupOk = false;
let tplOk = false;
let sceneOk = false;

console.log(`\n(วันนี้ไทย ${TODAY} · วันฉาก ${D} ${DSC.at} · SESSION_SECRET ${SECRET.length >= 32 ? "มี" : "ไม่มี ⚠️"})`);

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupGlobal();

  // ── สร้างข้อมูล ──
  try {
    for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) {
      SLUGS[id] = `${SLUG}${n}-${RUN}`;
      await insertRow("Tenant", { id, name: `QC B6 ร้าน ${n}`, slug: SLUGS[id], updatedAt: new Date() });
    }
    const units: [string, string, string, string, number, number][] = [
      [ids.uS, ids.tA, "scene", "BOOKING", 600, 1200], [ids.uK, ids.tA, "kiosk", "BOOKING", 0, 1440], [ids.uLeg, ids.tA, "legacy", "BOOKING", 600, 1200],
      [ids.uQ, ids.tA, "queue", "QUEUE", 0, 0], [ids.uB, ids.tB, "b", "BOOKING", 0, 1440],
    ];
    for (const [id, t, n, type, o, c] of units) {
      SLUGS[id] = `b6-${n}-${RUN}`;
      await insertRow("BusinessUnit", { id, tenantId: t, type, name: `สาขา ${n}`, slug: SLUGS[id], updatedAt: new Date() });
      if (type === "BOOKING") for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: o, closeMin: c, closed: false, updatedAt: new Date() });
    }
    for (const [i, s] of SQC.barber.services.entries()) {
      await insertRow("BookingService", { id: SVC[s.sku], tenantId: ids.tA, unitId: ids.uS, name: s.name, durationMin: s.durationMin, priceSatang: s.priceSatang, bufferMin: s.bufferMin, depositSatang: s.depositSatang, bookable: true, sortOrder: i + 1, updatedAt: new Date() });
    }
    await insertRow("BookingService", { id: ids.KCUT, tenantId: ids.tA, unitId: ids.uK, name: "ตัดผมชาย", durationMin: 45, priceSatang: 25000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 1, updatedAt: new Date() });
    await insertRow("BookingService", { id: ids.KCOLOR, tenantId: ids.tA, unitId: ids.uK, name: "ทำสีผม", durationMin: 90, priceSatang: 90000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 2, updatedAt: new Date() });
    await insertRow("BookingService", { id: ids.LS, tenantId: ids.tA, unitId: ids.uLeg, name: "ตัดผมชาย", durationMin: 45, priceSatang: 25000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 1, updatedAt: new Date() });
    await insertRow("BookingService", { id: ids.BS, tenantId: ids.tB, unitId: ids.uB, name: "ตัดผมชาย", durationMin: 45, priceSatang: 25000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 1, updatedAt: new Date() });
    let ord = 0;
    const staff = async (id: string, t: string, u: string, name: string, sortOrder: number) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    for (const [i, k] of (["ek", "boy", "nun", "jack"] as SqcLineStaffKey[]).entries()) await staff(STAFF[k], ids.tA, ids.uS, STAFF_NAME[k], i + 1);
    for (let w = 0; w < 7; w++) await insertRow("BookingStaffHours", { id: rid("sh"), tenantId: ids.tA, unitId: ids.uS, staffId: STAFF.jack, weekday: w, startMin: 780, endMin: 1200 });
    await staff(ids.K1s, ids.tA, ids.uK, "ช่างเคหนึ่ง", 1);
    await staff(ids.K2s, ids.tA, ids.uK, "ช่างเคสอง", 2);
    await staff(T("L1"), ids.tA, ids.uLeg, "ช่างร้านเดิม", 1);
    await staff(ids.B1, ids.tB, ids.uB, "ช่างร้าน B", 1);
    // LINE OA ของร้าน A (QR ตู้ = ลิงก์เปิดแชทพร้อมรหัส)
    await insertRow("AppSystem", { id: ids.chatSys, tenantId: ids.tA, type: "CHAT", name: "แชท QC B6", updatedAt: new Date() });
    await insertRow("ChatChannelConnection", { id: ids.conn, tenantId: ids.tA, systemId: ids.chatSys, type: "LINE", displayName: "QC B6 OA", externalAccountId: `Uqcb6${RUN}`, credentials: "{}", meta: JSON.stringify({ basicId: "@qcb6" }), updatedAt: new Date() });
    // หน่วย QUEUE เดิม (ตัวควบคุมของ L-1): ประเภท + บัตร 1 ใบ
    await insertRow("QueueType", { id: ids.qType, tenantId: ids.tA, unitId: ids.uQ, code: "GENERAL", name: "ทั่วไป", prefix: "Q", updatedAt: new Date() });
    await insertRow("QueueTicket", { id: ids.qTicket, tenantId: ids.tA, unitId: ids.uQ, typeId: ids.qType, businessDate: D, seq: 1, number: "Q001", priority: 0, channel: "ONLINE", publicToken: `svcb6pub${RUN}`, updatedAt: new Date() });
    // อุปกรณ์ (การเก็บตามใบสั่ง §3.1)
    for (const d of Object.values(DV)) {
      await insertRow("QueueDisplay", { id: d.id, tenantId: d.tenantId, unitId: d.unitId, name: `${d.kind} ${d.id}`, displayToken: `sha256:${sha256hex(d.token)}`, settings: JSON.stringify({ kind: d.kind }), revokedAt: d.revoked ? new Date() : null, updatedAt: new Date() });
    }
    // ค่าตั้งชั้น DEVICE (เขียนตรงลงตาราง — ทางอ่านมีแล้วก่อน B.6 · PC-3 พิสูจน์) ⇒ หมวด TV/K ไม่พึ่ง core-fix
    for (const [dk, key, value] of DEVICE_SV) {
      await insertRow("SettingValue", { id: rid("sv"), tenantId: DV[dk].tenantId, key, scope: "DEVICE", scopeId: DV[dk].id, value: JSON.stringify(value), effectiveFrom: new Date(0), updatedAt: new Date() });
    }
    // ผู้ใช้ (หมวด H)
    const users: [string, string, string, string, string[], Record<string, boolean>][] = [
      [ids.uOwner, "owner", ids.tA, "OWNER", ["*"], {}],
      [ids.uCash, "cash", ids.tA, "STAFF", [ids.uS], { "booking.checkin": true, "booking.walkin.create": true }],
      [ids.uOwnerB, "ownerb", ids.tB, "OWNER", ["*"], {}],
    ];
    for (const [uid, k, t, role, ua, perms] of users) {
      await insertRow("User", { id: uid, email: `${USER_MAIL}${k}-${RUN}@qc.invalid`, name: `QC B6 ${k}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid("mb"), userId: uid, tenantId: t, role, unitAccess: JSON.stringify(ua), permissions: JSON.stringify(perms), acceptedAt: new Date(), updatedAt: new Date() });
    }
    setupOk = true;
  } catch (e) {
    console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`);
  }
  const need = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");

  console.log("\n── T/F: แม่แบบ + ฉาก 14:40 ──");
  await st("T-0", "applyTemplate BARBER ที่หน่วยฉาก/ตู้เบ็ดเตล็ด/ร้าน B (หน่วย legacy ไม่เลือกแม่แบบ) · สาขาฉากตั้ง messaging.lineConnectionId = OA ของร้าน", async () => {
    need();
    for (const [actor, t, u] of [[OWNER, ids.tA, ids.uS], [OWNER, ids.tA, ids.uK], [OWNER_B, ids.tB, ids.uB]] as const) {
      const a = await SETTINGS().applyTemplate(actor, { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
      ok(a.ok, `applyTemplate ${u}: ${a.code} ${fmt(a.issues)}`);
    }
    const l = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key: "messaging.lineConnectionId", scope: "UNIT", scopeId: ids.uS, value: ids.conn }]);
    ok(l.ok, `lineConnectionId: ${l.code} ${fmt(l.issues)}`);
    tplOk = true;
  });
  const needTpl = () => { need(); ok(tplOk, "ตั้งแม่แบบไม่สำเร็จ (T-0)"); };

  await st("F-0", `ฉากภาพ 01 วัน ${D} (นัด 14 + เหตุการณ์ ${SCENE.events.length}) ต่อด้วย extraEvents ${DSC.extraEvents.length} ขั้น (A007/A008 เสร็จ · tick · เรียก A009) → runPlanner ${DSC.at} · นัดเบอร์ซ้ำ 2 นัดที่หน่วยตู้ · นัดร้าน B`, async () => {
    needTpl();
    for (const b of SCENE.bookings) {
      const r = await BK().bookAppointment(cS, {
        serviceId: SVC[b.sku], staffId: b.staff ? STAFF[b.staff] : null, dateStr: D, startMin: hm(b.start), channel: "STAFF",
        customerName: b.name, customerPhone: b.phone, idempotencyKey: `${RUN}-${b.key}`,
      });
      if (!r.ok) throw new AssertFail(`จอง ${b.key} ${b.start} ล้ม ${r.code} ${r.reason}`);
      fx[b.key] = r.id;
      if (r.status === "PENDING") ok((await BK().setAppointmentStatus(cS.tenantId, cS.unitId, r.id, "CONFIRMED")).ok, `ยืนยัน ${b.key}`);
    }
    const events: SqcDeviceEvent[] = [...SCENE.events, ...DSC.extraEvents];
    for (const ev of events) {
      const now = at(D, ev.at);
      const where = `${ev.at} ${ev.op}${"key" in ev ? ` ${ev.key}` : ""}`;
      if (ev.op === "tick") { await RN().runLineTick(now, { tenantIds: [ids.tA] }); continue; }
      if (ev.op === "walkIn") {
        const r = await LN().createWalkIn(cS, { serviceId: SVC[ev.sku], staffId: ev.staff ? STAFF[ev.staff] : null, channel: "STAFF" }, { now });
        if (!r.ok) throw new AssertFail(`${where}: ${r.code} ${r.reason}`);
        fx[ev.key] = r.appointmentId;
        continue;
      }
      const id = fx[ev.key];
      ok(!!id, `${where}: ไม่รู้จักคีย์`);
      const r = ev.op === "checkIn" ? await LN().checkIn(cS, { appointmentId: id }, { via: "STAFF", now })
        : ev.op === "start" ? await LN().startJob(cS, id, { now })
        : ev.op === "done" ? await LN().completeJob(cS, id, { now })
        : ev.op === "call" ? await LN().callJob(cS, id, { now })
        : await LN().cancelByShop(cS, id, { now });
      if (!r.ok) throw new AssertFail(`${where}: ${r.code} ${r.reason}`);
    }
    await RN().runPlanner(cS, { now: NOW });
    // หน่วยตู้: เบอร์เดียว 2 นัดวันเดียวกัน (AMBIGUOUS) · ร้าน B: นัดของเบอร์ 0899000002 (X1)
    for (const [ctx, svc, stf, start, phone, key] of [
      [cK, ids.KCUT, ids.K1s, "15:00", "0899000001", "AMB1"], [cK, ids.KCUT, ids.K1s, "16:00", "0899000001", "AMB2"],
      [{ tenantId: ids.tB, unitId: ids.uB }, ids.BS, ids.B1, "15:00", "0899000002", "BB"],
    ] as const) {
      const r = await BK().bookAppointment(ctx, { serviceId: svc, staffId: stf, dateStr: D, startMin: hm(start), channel: "STAFF", customerName: "คุณซ้ำ", customerPhone: phone, idempotencyKey: `${RUN}-${key}` });
      if (!r.ok) throw new AssertFail(`จอง ${key}: ${r.code} ${r.reason}`);
      fx[key] = r.id;
      if (r.status === "PENDING") ok((await BK().setAppointmentStatus(ctx.tenantId, ctx.unitId, r.id, "CONFIRMED")).ok, `ยืนยัน ${key}`);
    }
    sceneOk = true;
  });
  const needScene = () => { needTpl(); ok(sceneOk, "สร้างฉากไม่สำเร็จ (F-0)"); };

  // ── ตัวช่วยอ่านฐาน ──
  type ApRow = { id: string; status: string; kind: string; assignMode: string; staffId: string; channel: string | null; checkedInAt: Date | null; queueTicketId: string | null; plannedStartAt: Date | null };
  const apRow = async (id: string): Promise<ApRow> => {
    const [r] = await q<ApRow>(`SELECT id, status::text AS status, kind, "assignMode", "staffId", channel, "checkedInAt", "queueTicketId", "plannedStartAt" FROM "Appointment" WHERE id = $1`, [id]);
    if (!r) throw new AssertFail(`ไม่พบนัด ${id}`);
    return r;
  };
  type TkRow = { id: string; status: string; number: string; refId: string | null; publicToken: string; cancelReason: string | null; channel: string };
  const tkByNumber = async (unitId: string, number: string): Promise<TkRow> => {
    const [r] = await q<TkRow>(`SELECT id, status::text AS status, number, "refId", "publicToken", "cancelReason", channel::text AS channel FROM "QueueTicket" WHERE "unitId" = $1 AND "businessDate" = $2 AND number = $3`, [unitId, D, number]);
    if (!r) throw new AssertFail(`ไม่พบบัตร ${number}`);
    return r;
  };
  const tokS = (n: string) => tkToken(ids.tA, ids.uS, D, n);
  const failCode = (r: { ok: boolean; code?: string; reason?: string }, code: string, what: string) => {
    ok(!r.ok, `${what}: ต้องล้ม ${code} แต่สำเร็จ`);
    eq(r.code, code, `${what} code`);
    ok(typeof r.reason === "string" && r.reason.trim().length > 0, `${what}: reason ว่าง`);
  };

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("PC-1", "สภาพฉาก 14:40: A007 A008 DONE · บัตร A009 CALLED · P004 P005 IN_SERVICE · P006 ARRIVED (บัตร WAITING) · A010 A011 QUEUED · คุณบีม/คุณแพรว CONFIRMED", async () => {
    needScene();
    for (const k of ["A007", "A008"]) eq((await apRow(fx[k])).status, "DONE", k);
    for (const k of ["P004", "P005"]) eq((await apRow(fx[k])).status, "IN_SERVICE", k);
    eq((await apRow(fx.P006)).status, "ARRIVED", "P006");
    for (const k of ["A009", "A010", "A011"]) eq((await apRow(fx[k])).status, "QUEUED", k);
    for (const k of ["BEAM", "PRAEW"]) eq((await apRow(fx[k])).status, "CONFIRMED", k);
    eq((await tkByNumber(ids.uS, "A009")).status, "CALLED", "บัตร A009");
    eq((await tkByNumber(ids.uS, "P006")).status, "WAITING", "บัตร P006");
  });
  await st("PC-2", "แผนสดของ B.5 (loadTodayLine เจ้าของ ณ 14:40) = ตัวเลขภาพ 05: P006 บอย 14:45 · A010 นุ่น 15:00 · A011 แจ๊ค 15:25 · A009 แจ๊ค · แถวรอ 5 ช่องแรก A009 P006 A010 คุณบีม A011 · รอในร้าน 4", async () => {
    needScene();
    const v = await TD().loadTodayLine(cS, OWNER_VIEW, { now: NOW });
    ok(!!v, "loadTodayLine null");
    const byNum = (n: string) => v!.waiting.find((j) => j.ticketNumber === n);
    for (const [n, start, seat] of DSC.expect.next) {
      const j = byNum(n);
      const sk = (["ek", "boy", "nun", "jack"] as SqcLineStaffKey[])[seat - 1];
      eq([j?.staffId, hhmm(j?.plannedStartMs)], [STAFF[sk], start], `แผน ${n}`);
    }
    eq(byNum("A009")?.staffId, STAFF.jack, "A009");
    eq(v!.waiting.slice(0, 5).map((j) => j.ticketNumber ?? (j.appointmentId === fx.BEAM ? "BEAM" : j.appointmentId)), ["A009", "P006", "A010", "BEAM", "A011"], "แถวรอ");
    eq(v!.kpi.waiting, DSC.expect.kiosk.waitingCount, "รอในร้าน");
    eq(v!.inService.map((j) => j.ticketNumber).sort(), ["P004", "P005"], "กำลังทำ");
  });
  await st("PC-3", "ทางอ่านค่าตั้งชั้น DEVICE มีแล้ว (resolveSettings + deviceId): TV2 nextCount 1 / label RESOURCE · TV1 = แม่แบบ 3 / PROVIDER · KQ เบอร์ REQUIRED + walkInPickStaff false", async () => {
    needTpl();
    const r = (dev: string, keys: string[]) => SETTINGS().resolveSettings({ tenantId: ids.tA }, keys, { unitId: DV[dev].unitId, deviceId: DV[dev].id }, NOW);
    const k2 = ["booking.display.nextCount", "booking.display.tvShow"];
    const a = await r("TV2", k2), b = await r("TV1", k2);
    eq([a[k2[0]].value, (a[k2[1]].value as { label: string }).label, a[k2[0]].source], [1, "RESOURCE", "DEVICE"], "TV2");
    eq([b[k2[0]].value, (b[k2[1]].value as { label: string }).label], [3, "PROVIDER"], "TV1");
    const kq = await r("KQ", ["booking.kiosk.phone", "booking.queue.walkInPickStaff"]);
    eq([kq["booking.kiosk.phone"].value, kq["booking.queue.walkInPickStaff"].value], ["REQUIRED", false], "KQ");
  });
  await st("PC-4", "issueLinkCode QUEUE_TICKET + OA ที่มี basicId ⇒ deepLink https://line.me/R/oaMessage/%40qcb6/?<รหัส> (ตัวที่ตู้ต้องใช้)", async () => {
    needTpl();
    const r = await CHAT().issueLinkCode({ tenantId: ids.tA }, { purpose: "QUEUE_TICKET", refId: "svcb6-probe", ttlMin: 10, connectionId: ids.conn });
    ok(r.ok, `issueLinkCode ${fmt(r)}`);
    if (r.ok) ok(r.deepLink === `https://line.me/R/oaMessage/%40qcb6/?${r.code}`, `deepLink ${r.deepLink}`);
  }, "MAJOR");
  await st("PC-5", "checkInToken ของ B.4 ให้ token ของคุณแพรว (QR บนใบนัด) · checkRateLimitDb นับจริง (เพดาน 1 ⇒ ครั้งที่ 2 ไม่ผ่าน) · SESSION_SECRET มี (สูตร token หน้าบัตร)", async () => {
    needScene();
    const t = await LN().checkInToken(cS, fx.PRAEW);
    ok(typeof t === "string" && t.length > 20, "checkInToken");
    ok(linkLoad.mod?.verifyLink(t, "booking.checkin")?.subjectId === fx.PRAEW, "verifyLink");
    const key = `qc:svcb6_probe_${RUN}`;
    const a = await RATE().checkRateLimitDb(key, { limit: 1, windowMs: 60_000 }), b = await RATE().checkRateLimitDb(key, { limit: 1, windowMs: 60_000 });
    eq([a.ok, b.ok], [true, false], "rate");
    ok(SECRET.length >= 32, "ไม่มี SESSION_SECRET ใน env QC");
  }, "MAJOR");
  await st("PC-6", "ตัวช่วยตรวจของข้อสอบเอง: piiLeak จับชื่อ/เบอร์ของฉาก (0810000009 · 081-000-0009 · +66810000009 · คุณบีม) และไม่จับเลขบัตร/เวลา · boxes/inputsOf อ่าน DOM ได้", () => {
    eq([piiLeak("โทร 0810000009").length, piiLeak("081-000-0009").length, piiLeak("+66810000009").length, piiLeak("คุณบีม").length, piiLeak("A011 ~15:25 เก้าอี้ 4").length], [1, 1, 1, 1, 0], "piiLeak");
    const html = String(RDS.renderToStaticMarkup(React.createElement("div", { "data-x": "1" }, React.createElement("form", { action: noop1 }, React.createElement("input", { type: "hidden", name: "at", value: "z" })))));
    eq([boxes(html, "data-x").length, formsOf(html).length, inputsOf(html).map((i) => i.name)], [1, 1, ["at"]], "DOM");
  }, "MAJOR");

  // ═══════════════ D core-fix ═══════════════
  console.log("\n── D: ชั้น DEVICE ในเครื่องยนต์ค่าตั้ง (core-fix §3.6) ──");
  await st("D-1", "setSettings เจ้าของ ชั้น DEVICE (TVD nextCount 2) ⇒ ok · resolveSettings(deviceId) = 2 source DEVICE · resetSetting ⇒ กลับเป็นแม่แบบ 3", async () => {
    needTpl();
    const s = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key: "booking.display.nextCount", scope: "DEVICE", scopeId: DV.TVD.id, value: 2 }]);
    ok(s.ok, `setSettings DEVICE: ${s.code} ${fmt(s.issues)}`);
    const r = await SETTINGS().resolveSettings({ tenantId: ids.tA }, ["booking.display.nextCount"], { unitId: ids.uS, deviceId: DV.TVD.id });
    eq([r["booking.display.nextCount"].value, r["booking.display.nextCount"].source], [2, "DEVICE"], "resolve");
    const x = await SETTINGS().resetSetting(OWNER, { tenantId: ids.tA }, { key: "booking.display.nextCount", scope: "DEVICE", scopeId: DV.TVD.id });
    ok(x.ok, `resetSetting: ${x.code} ${fmt(x.issues)}`);
    const r2 = await SETTINGS().resolveSettings({ tenantId: ids.tA }, ["booking.display.nextCount"], { unitId: ids.uS, deviceId: DV.TVD.id });
    eq(r2["booking.display.nextCount"].value, 3, "หลังคืนค่า");
  });
  await st("D-2", "X1 ชั้น DEVICE: เจ้าของร้าน B ตั้งอุปกรณ์ร้าน A ⇒ NOT_FOUND · เจ้าของร้าน A ตั้งอุปกรณ์ร้าน B ⇒ NOT_FOUND · ผู้จัดการสาขาตู้ตั้งอุปกรณ์สาขาฉาก ⇒ NOT_FOUND · ไม่มีแถวรั่ว", async () => {
    needTpl();
    const row = (scopeId: string) => [{ key: "booking.display.nextCount", scope: "DEVICE", scopeId, value: 4 }];
    for (const [what, actor, tenantId, scopeId] of [
      ["B → A", OWNER_B, ids.tB, DV.TVD.id], ["A → B", OWNER, ids.tA, DV.KB.id], ["ผู้จัดการ uK → uS", MGR_K, ids.tA, DV.TVD.id],
    ] as const) {
      const r = await SETTINGS().setSettings(actor, { tenantId }, row(scopeId));
      eq([r.ok, r.code], [false, "NOT_FOUND"], what);
    }
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SettingValue" WHERE scope = 'DEVICE' AND key = 'booking.display.nextCount' AND value = '4'::jsonb AND "scopeId" = ANY($1::text[])`, [[DV.TVD.id, DV.KB.id]]))[0].n;
    eq(n, 0, "แถวรั่ว");
  });
  await st("D-3", "loadSettingsForm ชั้น DEVICE (TVD) ⇒ ฟอร์มมีช่อง booking.display.* · booking.kiosk.* · booking.queue.walkInPickStaff (เจ้าของแก้ได้) · อุปกรณ์ร้าน B ⇒ null", async () => {
    needTpl();
    const f = await SETTINGS().loadSettingsForm(OWNER, { tenantId: ids.tA }, { domains: ["booking"], unitId: ids.uS, scope: "DEVICE", scopeId: DV.TVD.id });
    ok(!!f, "ฟอร์ม null (ชั้น DEVICE ยังไม่รองรับ)");
    const fields = f!.groups.flatMap((g) => g.fields);
    const want = ["booking.display.tvShow", "booking.display.voice", "booking.display.nextCount", "booking.kiosk.services", "booking.kiosk.phone", "booking.kiosk.paperTicket", "booking.kiosk.pinLock", "booking.queue.walkInPickStaff"];
    const miss = want.filter((k) => !fields.some((x) => x.key === k && x.editable));
    ok(miss.length === 0, `ช่องที่ขาด/แก้ไม่ได้: ${miss.join(", ")}`);
    eq(await SETTINGS().loadSettingsForm(OWNER, { tenantId: ids.tA }, { domains: ["booking"], unitId: ids.uS, scope: "DEVICE", scopeId: DV.KB.id }), null, "อุปกรณ์ร้าน B");
  }, "MAJOR");

  // ═══════════════ M อุปกรณ์ ═══════════════
  console.log("\n── M: อุปกรณ์ (devices.ts) ──");
  let mDev: { id: string; token: string } | null = null;
  await st("M-1", "createDevice TV ⇒ token 43 ตัว base64url · ฐานเก็บ displayToken = sha256:<hex> + settings {kind:TV} · ผลไม่มี hash · audit booking.device.created (ไม่มี token/hash) · deviceByToken คืนอุปกรณ์", async () => {
    needTpl();
    const r = await DEV.create()({ ...cS, actorUserId: ids.uOwner }, { kind: "TV", name: "จอหน้าร้าน M" });
    ok(r.ok, `createDevice ${fmt(r)}`);
    if (!r.ok) return;
    ok(/^[A-Za-z0-9_-]{43}$/.test(r.token), `token ${r.token.length} ตัว`);
    ok(!JSON.stringify(r.device).includes("sha256") && !JSON.stringify(r.device).includes(r.token), "device มี token/hash");
    const [row] = await q<{ displayToken: string; settings: { kind?: string }; tenantId: string; unitId: string }>(`SELECT "displayToken", settings, "tenantId", "unitId" FROM "QueueDisplay" WHERE id = $1`, [r.device.id]);
    eq([row?.displayToken, row?.settings?.kind, row?.tenantId, row?.unitId], [`sha256:${sha256hex(r.token)}`, "TV", ids.tA, ids.uS], "แถว");
    const au = await q<{ after: unknown; actorId: string | null }>(`SELECT after, "actorId" FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'booking.device.created' AND "targetId" = $2`, [ids.tA, r.device.id]);
    ok(au.length === 1 && !JSON.stringify(au[0].after).includes(r.token) && !JSON.stringify(au[0].after).includes("sha256"), `audit ${fmt(au)}`);
    eq(au[0].actorId, ids.uOwner, "audit actor");
    const by = await DEV.byToken()(r.token, "TV");
    eq([by?.deviceId, by?.tenantId, by?.unitId], [r.device.id, ids.tA, ids.uS], "deviceByToken");
    eq(await DEV.byToken()(r.token, "KIOSK"), null, "ผิดชนิด");
    mDev = { id: r.device.id, token: r.token };
  });
  await st("M-2", "listDevices: มีอุปกรณ์ที่ใช้อยู่ของหน่วย (ไม่รวมที่ถอน/หน่วยอื่น/ร้านอื่น) · ไม่มี token/hash · ctx ร้าน B อ้างหน่วย A ⇒ []", async () => {
    needTpl();
    const l = await DEV.list()(cS);
    const got = new Set(l.map((d) => d.id));
    ok([DV.TV1.id, DV.TV2.id, DV.K1.id, DV.K2.id].every((x) => got.has(x)), "ขาดอุปกรณ์ของหน่วย");
    ok(!got.has(DV.TVR.id) && !got.has(DV.KA.id) && !got.has(DV.KB.id), "มีที่ถอน/หน่วยอื่น");
    ok(l.every((d) => (d.kind === "TV" || d.kind === "KIOSK") && d.unitId === ids.uS), "kind/unitId");
    const s = JSON.stringify(l);
    ok(!s.includes("sha256") && !Object.values(DV).some((d) => s.includes(d.token)), "มี token/hash");
    eq(await DEV.list()(cBwithS), [], "X1");
  });
  await st("M-3", "createDevice ล้มถูกรหัส: ชื่อซ้ำ ⇒ DUPLICATE · kind ผิด/ชื่อว่าง ⇒ BAD_INPUT · หน่วยไม่เปิดแถวเดียว ⇒ NOT_SINGLE_LINE · ร้าน B อ้างหน่วย A ⇒ NOT_FOUND", async () => {
    needTpl();
    failCode(await DEV.create()(cS, { kind: "TV", name: `TV ${DV.TV1.id}` }), "DUPLICATE", "ชื่อซ้ำ");
    failCode(await DEV.create()(cS, { kind: "PRINTER", name: "x" }), "BAD_INPUT", "kind");
    failCode(await DEV.create()(cS, { kind: "KIOSK", name: "  " }), "BAD_INPUT", "ชื่อว่าง");
    failCode(await DEV.create()(cLeg, { kind: "TV", name: "legacy" }), "NOT_SINGLE_LINE", "legacy");
    failCode(await DEV.create()(cBwithS, { kind: "TV", name: "ข้ามร้าน" }), "NOT_FOUND", "X1");
  });
  await st("M-4", "rotateDeviceToken: token เดิมใช้ไม่ได้ทันที · token ใหม่ใช้ได้ · audit rotated · ร้าน B ⇒ NOT_FOUND · แถว QueueDisplay ไม่มี kind ⇒ NOT_FOUND", async () => {
    ok(!!mDev, "M-1 ไม่สำเร็จ");
    failCode(await DEV.rotate()(cBwithS, mDev!.id), "NOT_FOUND", "X1");
    const r = await DEV.rotate()({ ...cS, actorUserId: ids.uOwner }, mDev!.id);
    ok(r.ok, `rotate ${fmt(r)}`);
    if (!r.ok) return;
    ok(r.token !== mDev!.token && /^[A-Za-z0-9_-]{43}$/.test(r.token), "token ใหม่");
    eq(await DEV.byToken()(mDev!.token, "TV"), null, "token เดิม");
    eq((await DEV.byToken()(r.token, "TV"))?.deviceId, mDev!.id, "token ใหม่");
    eq((await q(`SELECT 1 FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'booking.device.rotated' AND "targetId" = $2`, [ids.tA, mDev!.id])).length, 1, "audit");
    const legacyId = rid("qd");
    await insertRow("QueueDisplay", { id: legacyId, tenantId: ids.tA, unitId: ids.uS, name: `legacy ${legacyId}`, updatedAt: new Date() });
    failCode(await DEV.rotate()(cS, legacyId), "NOT_FOUND", "แถวคิวเดิม");
    mDev = { id: mDev!.id, token: r.token };
  });
  await st("M-5", "revokeDevice: ร้าน B ⇒ NOT_FOUND (ยังใช้ได้) · เจ้าของ ⇒ ok · token ใช้ไม่ได้ · ถอนซ้ำ ⇒ NOT_FOUND · audit revoked", async () => {
    ok(!!mDev, "M-1 ไม่สำเร็จ");
    failCode(await DEV.revoke()(cBwithS, mDev!.id), "NOT_FOUND", "X1");
    ok(!!(await DEV.byToken()(mDev!.token, "TV")), "ถูกถอนโดยร้าน B");
    const r = await DEV.revoke()({ ...cS, actorUserId: ids.uOwner }, mDev!.id);
    ok(r.ok, `revoke ${fmt(r)}`);
    eq(await DEV.byToken()(mDev!.token, "TV"), null, "หลังถอน");
    failCode(await DEV.revoke()(cS, mDev!.id), "NOT_FOUND", "ถอนซ้ำ");
    eq((await q(`SELECT 1 FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'booking.device.revoked' AND "targetId" = $2`, [ids.tA, mDev!.id])).length, 1, "audit");
  });

  // ═══════════════ TV ═══════════════
  console.log("\n── TV: จอทีวี (ภาพ 05 · 14:40) ──");
  let tv1: TvView | null = null;
  await st("TV-1", "loadTvView(TV1, 14:40) = ภาพ 05: เชิญ A009 เก้าอี้ 4 ช่างแจ๊ค ตัดผมชาย · เก้าอี้ 1 P004 ทำ · 2 ว่าง เตรียมรับ P006 · 3 P005 ทำ · 4 A009 เรียก · ถัดไป P006 ~14:45 (นัด) · A010 ~15:00 · A011 ~15:25", async () => {
    needScene();
    tv1 = await PUB.tv()(DV.TV1.token, { now: NOW });
    ok(!!tv1, "null");
    const v = tv1!;
    eq([v.dayStr, v.nowMs, v.unitName], [D, NOW.getTime(), "สาขา scene"], "หัวจอ");
    eq(v.calling, { ...DSC.expect.calling }, "กำลังเรียก");
    eq(v.chairs.map((c) => ({ seat: c.seat, staffName: c.staffName, state: c.state, ticketNumber: c.ticketNumber })), DSC.expect.chairs.map((c) => ({ ...c })), "เก้าอี้");
    eq(v.chairs.find((c) => c.seat === DSC.expect.freeNext.seat)?.nextTicketNumber, DSC.expect.freeNext.ticketNumber, "เตรียมรับ");
    eq(v.next.map((n) => [n.ticketNumber, hhmm(n.startMs), n.seat, n.booked]), DSC.expect.next.map((x) => [...x]), "คิวถัดไป");
    ok(v.next.every((n) => n.staffName !== null), "ชื่อช่างในคิวถัดไป (PROVIDER)");
    eq(v.voice, ["th", "en"], "voice (#53 BARBER)");
    ok(typeof v.walkInWaitMin === "number" && v.walkInWaitMin >= 0, `walkInWaitMin ${v.walkInWaitMin}`);
  });
  await st("TV-2", "X8: ข้อมูลทีวีไม่มีชื่อ/เบอร์ลูกค้า (ทั้ง TV1 และ TV2 ที่ตั้ง showCustomerName = true) · ไม่มีคีย์ customer*/phone", async () => {
    needScene();
    for (const d of ["TV1", "TV2"]) {
      const v = await PUB.tv()(DV[d].token, { now: NOW });
      ok(!!v, `${d} null`);
      const s = JSON.stringify(v);
      eq(piiLeak(s), [], `PII ${d}`);
      ok(!/customer|phone/i.test(s), `คีย์ customer/phone ใน ${d}`);
    }
  });
  await st("TV-3", "ค่าตั้งรายเครื่องมีผล: TV2 (nextCount 1 · label RESOURCE) ⇒ คิวถัดไป 1 ใบ (P006) · ไม่มีชื่อช่างที่ใดเลย · TV1 ยัง 3 ใบ", async () => {
    needScene();
    const v = await PUB.tv()(DV.TV2.token, { now: NOW });
    ok(!!v, "null");
    eq(v!.next.map((n) => n.ticketNumber), ["P006"], "next");
    ok(v!.chairs.every((c) => c.staffName === null) && v!.next.every((n) => n.staffName === null) && v!.calling?.staffName === null, "ยังมีชื่อช่าง");
    eq(v!.calling?.ticketNumber, "A009", "calling");
    eq((await PUB.tv()(DV.TV1.token, { now: NOW }))?.next.length, 3, "TV1");
  });
  await st("TV-4", "X7: token ใช้ไม่ได้ทุกแบบ ⇒ null (สุ่ม · สั้น · ว่าง · ไม่ใช่สตริง · ถอนแล้ว · hash ที่เก็บ · token ตู้ · หน่วยไม่เปิดแถวเดียว)", async () => {
    needScene();
    const bad: string[] = [];
    for (const [what, t] of [...BAD_TOKENS(), ["token ตู้ K1", DV.K1.token], ["หน่วย legacy", DV.TVLeg.token]] as [string, unknown][]) {
      if ((await PUB.tv()(t, { now: NOW })) !== null) bad.push(what);
    }
    ok(bad.length === 0, `ได้ข้อมูล: ${bad.join(", ")}`);
  });

  // ═══════════════ K ตู้ ═══════════════
  console.log("\n── K: ตู้ (ภาพ 04) ──");
  const WALKIN_SKUS = ["SVCQC-BB-01", "SVCQC-BB-02", "SVCQC-BB-03", "SVCQC-BB-04"];
  await st("K-1", "loadKioskView(K1 ค่าแม่แบบ, 14:40) หน้าแรก: ทำอยู่ 2/4 เก้าอี้ · รอในร้าน 4 · ถัดไป A009 · บริการ = 4 ที่รับ walk-in (ทำสี/ดัดปิดตาม closeAtOrAboveMin 90) · ช่าง 4 · เบอร์ไม่บังคับ · ไม่พิมพ์ · ล็อก PIN", async () => {
    needScene();
    const v = await PUB.kiosk()(DV.K1.token, { now: NOW });
    ok(!!v, "null");
    eq({ busyCount: v!.busyCount, seatCount: v!.seatCount, waitingCount: v!.waitingCount, nextTicketNumber: v!.nextTicketNumber }, { ...DSC.expect.kiosk }, "สถานะ");
    eq(v!.services.map((s) => [s.id, s.walkIn]), WALKIN_SKUS.map((k) => [SVC[k], true]), "บริการ");
    eq(v!.staff?.map((s) => s.id), [STAFF.ek, STAFF.boy, STAFF.nun, STAFF.jack], "ช่าง");
    eq([v!.phone, v!.paperTicket, v!.pinLock], ["OPTIONAL", false, true], "ค่าตั้ง");
    ok(typeof v!.walkInWaitMin === "number", "walkInWaitMin");
    eq(piiLeak(JSON.stringify(v)), [], "PII");
  });
  await st("K-2", "ค่าตั้งรายเครื่องมีผล: K2 (services ALL · พิมพ์ · ไม่ล็อก) ⇒ บริการ 6 ตามลำดับ ทำสี/ดัด walkIn:false · paperTicket true · pinLock false · KQ (หน่วยตู้) ⇒ เบอร์ REQUIRED · staff null · KA ⇒ OPTIONAL + ช่าง 2", async () => {
    needScene();
    const v = await PUB.kiosk()(DV.K2.token, { now: NOW });
    ok(!!v, "K2 null");
    eq(v!.services.map((s) => [s.id, s.walkIn]), SQC.barber.services.map((s) => [SVC[s.sku], WALKIN_SKUS.includes(s.sku)]), "บริการ K2");
    eq([v!.paperTicket, v!.pinLock], [true, false], "K2");
    const kq = await PUB.kiosk()(DV.KQ.token, { now: KNOW });
    eq([kq?.phone, kq?.staff], ["REQUIRED", null], "KQ");
    const ka = await PUB.kiosk()(DV.KA.token, { now: KNOW });
    eq([ka?.phone, ka?.staff?.length, ka?.services.map((s) => s.id)], ["OPTIONAL", 2, [ids.KCUT]], "KA");
  });
  const kioskNF = async () => PUB.walkIn()(newToken(), { serviceId: SVC["SVCQC-BB-01"], staffId: null }, { now: NOW });
  await st("K-3", "X7 ตู้: loadKioskView ⇒ null ทุก token ที่ใช้ไม่ได้ (+ token ทีวี) · kioskCheckIn/kioskWalkIn ⇒ NOT_FOUND ผลเดียวกันทุกไบต์ (สุ่ม · ถอน · ทีวี · ไม่ใช่สตริง)", async () => {
    needScene();
    const bad: string[] = [];
    for (const [what, t] of [...BAD_TOKENS(), ["token ทีวี TV1", DV.TV1.token]] as [string, unknown][]) if ((await PUB.kiosk()(t, { now: NOW })) !== null) bad.push(what);
    ok(bad.length === 0, `ได้ข้อมูล: ${bad.join(", ")}`);
    const base = await kioskNF();
    failCode(base, "NOT_FOUND", "walkIn สุ่ม");
    for (const t of [DV.TVR.token, DV.TV1.token, 42, ""]) {
      eq(await PUB.walkIn()(t, { serviceId: SVC["SVCQC-BB-01"], staffId: null }, { now: NOW }), base, `walkIn ${String(t).slice(0, 8)}`);
      eq(await PUB.checkIn()(t, { phone: "0810000009" }, { now: NOW }), base, `checkIn ${String(t).slice(0, 8)}`);
    }
  });
  await st("K-4", "kioskCheckIn เบอร์ X7: เบอร์ไม่มีนัด · เบอร์ที่มีนัดในร้าน B ⇒ NOT_FOUND ผลเดียวกันทุกไบต์ (= token ใช้ไม่ได้) · เบอร์ 2 นัดวันเดียว ⇒ AMBIGUOUS ไม่มี candidates · ไม่มีชื่อ/เวลานัดใน reason", async () => {
    needScene();
    const base = await kioskNF();
    eq(await PUB.checkIn()(DV.KA.token, { phone: "0899000999" }, { now: KNOW }), base, "เบอร์ไม่มีนัด");
    eq(await PUB.checkIn()(DV.KA.token, { phone: "0899000002" }, { now: KNOW }), base, "เบอร์ร้าน B");
    const amb = await PUB.checkIn()(DV.KA.token, { phone: "0899000001" }, { now: KNOW });
    failCode(amb, "AMBIGUOUS", "เบอร์ซ้ำ");
    ok(!("candidates" in amb), "มี candidates");
    ok(!/15:00|16:00|คุณซ้ำ/.test(JSON.stringify(amb)), "บอกเวลา/ชื่อ");
    eq((await apRow(fx.AMB1)).status, "CONFIRMED", "ไม่เช็กอินมั่ว");
  });
  // ═══════════════ C หน้าบัตร ═══════════════
  console.log("\n── C: หน้าบัตรลูกค้า (ภาพ 06ก) ──");
  await st("C-1", "ticketToken = สูตร HMAC ของใบสั่ง §3.4 (ตรงกับ sqcTicketToken ของฉากภาพ) · ticketTokenFor(บัตร A011) = ตัวเดียวกัน · บัตรร้านอื่น/หน่วย QUEUE ⇒ null", async () => {
    needScene();
    eq(PUB.token()({ tenantId: ids.tA, unitId: ids.uS, businessDate: D, number: "A011" }), tokS("A011"), "ticketToken");
    const tk = await tkByNumber(ids.uS, "A011");
    eq(await PUB.tokenFor()(cS, tk.id), tokS("A011"), "ticketTokenFor");
    eq(await PUB.tokenFor()(cBwithS, tk.id), null, "X1");
    eq(await PUB.tokenFor()({ tenantId: ids.tA, unitId: ids.uQ }, ids.qTicket), null, "หน่วย QUEUE");
  });
  await st("C-2", `loadTicketView(A011, 14:40): ตัด + สระ · ช่างแจ๊ค เก้าอี้ 4 · ~15:25 · กลับก่อน 15:20 · ข้างหน้า ${DSC.expect.ticketA011.aheadCount} (A009 · P006 · A010 · คิวนัดหมาย · คุณ) · ยกเลิกได้ · เลื่อนไม่ได้ (walk-in คนสุดท้าย ณ ตอนนั้น)`, async () => {
    needScene();
    // ข้อนี้รันก่อนเช็กอิน/ออกบัตรที่ตู้ (K-5…) ⇒ แถวยังเป็นสภาพ 14:40 ของฉาก
    const v = await PUB.ticket()(tokS("A011"), { now: NOW });
    ok(!!v, "null");
    const e = DSC.expect.ticketA011;
    eq([v!.ticketNumber, v!.status, v!.kind, v!.serviceName, v!.staffName, v!.seat], ["A011", "WAITING", "WALKIN", "ตัด + สระ", e.staffName, e.seat], "บัตร");
    eq([hhmm(v!.plannedStartMs), hhmm(v!.returnByMs), v!.bookedStartMs], [e.plannedStart, e.returnBy, null], "เวลา");
    eq(hhmm(v!.issuedAtMs), "14:18", "ออกบัตร");
    eq(v!.ahead.map((a) => [a.kind, a.ticketNumber]), e.ahead.map((x) => [...x]), "ข้างหน้า");
    eq(v!.aheadCount, e.aheadCount, "aheadCount");
    eq([v!.canCancel, v!.canDefer], [true, false], "ปุ่ม (A011 = walk-in คนสุดท้าย ณ ตอนนี้)");
    eq(piiLeak(JSON.stringify(v)), [], "PII");
  });
  await st("C-3", "X7 หน้าบัตร: null เหมือนกันทุกกรณี — ว่าง/สุ่ม · ลายเซ็นแก้ 1 ตัว · payload สลับหน่วยเป็นร้าน B · secret ผิด · เลขบัตรไม่มีจริง · token บัตรหน่วย QUEUE · หมดอายุ (วันฉาก+2) — แต่วันฉาก+1 ยังเปิดได้", async () => {
    needScene();
    const good = tokS("A011");
    const [p, s] = good.split(".");
    const flip = `${p}.${s.slice(0, -1)}${s.slice(-1) === "A" ? "B" : "A"}`;
    const wrongSecret = `${p}.${createHmac("sha256", "booking-ticket:v1:not-the-secret-0123456789abcdef").update(p).digest("base64url")}`;
    const bad: string[] = [];
    for (const [what, t, now] of [
      ["ว่าง", "", NOW], ["สุ่ม", newToken(), NOW], ["ลายเซ็นแก้", flip, NOW], ["หน่วยร้าน B", tkToken(ids.tB, ids.uB, D, "A011"), NOW], ["secret ผิด", wrongSecret, NOW],
      ["เลขไม่มี", tokS("A999"), NOW], ["หน่วย QUEUE", tkToken(ids.tA, ids.uQ, D, "Q001"), NOW], ["หมดอายุ", good, at(addDays(D, 2), "09:00")],
    ] as [string, string, Date][]) if ((await PUB.ticket()(t, { now })) !== null) bad.push(what);
    ok(bad.length === 0, `ได้ข้อมูล: ${bad.join(", ")}`);
    ok((await PUB.ticket()(good, { now: at(addDays(D, 1), "09:00") })) !== null, "วันถัดไปต้องยังเปิดได้");
  });
  console.log("\n── K (ต่อ): เช็กอิน · walk-in · rate limit ──");
  await st("K-5", "kioskCheckIn เบอร์คุณบีม (14:40) ⇒ บัตร P007 · ช่างเอก เก้าอี้ 1 · นัด 15:15 · ticketUrl = /bq/t/<สูตร> · ไม่มีชื่อ/เบอร์ · นัด ARRIVED · event booking.checked_in via PHONE", async () => {
    needScene();
    const r = await PUB.checkIn()(DV.K1.token, { phone: "081-000-0009" }, { now: NOW });
    ok(r.ok, `checkIn ${fmt(r)}`);
    if (!r.ok) return;
    eq([r.ticket.ticketNumber, r.ticket.staffName, r.ticket.seat, hhmm(r.ticket.bookedStartMs)], ["P007", "ช่างเอก", 1, "15:15"], "บัตร");
    eq(r.ticket.ticketUrl, `/bq/t/${tokS("P007")}`, "ticketUrl");
    eq(piiLeak(JSON.stringify(r)), [], "PII");
    eq((await apRow(fx.BEAM)).status, "ARRIVED", "นัด");
    const ev = await q<{ payload: { via?: string } }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'booking.checked_in' AND payload->>'appointmentId' = $2`, [ids.tA, fx.BEAM]);
    eq(ev.map((e) => e.payload.via), ["PHONE"], "event via");
  });
  await st("K-6", "kioskCheckIn QR: token จาก checkInToken (ห่อใน URL ?t=) ของคุณแพรว ⇒ บัตร P008 · event via QR · token ใบนัดของร้าน B/สุ่ม ⇒ NOT_FOUND", async () => {
    needScene();
    const tok = await LN().checkInToken(cS, fx.PRAEW);
    ok(!!tok, "checkInToken");
    const r = await PUB.checkIn()(DV.K1.token, { qr: `https://shark.example/c?t=${encodeURIComponent(tok!)}` }, { now: NOW });
    ok(r.ok, `QR ${fmt(r)}`);
    if (!r.ok) return;
    eq([r.ticket.ticketNumber, r.ticket.staffName, hhmm(r.ticket.bookedStartMs)], ["P008", "ช่างนุ่น", "15:30"], "บัตร");
    const ev = await q<{ payload: { via?: string } }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'booking.checked_in' AND payload->>'appointmentId' = $2`, [ids.tA, fx.PRAEW]);
    eq(ev.map((e) => e.payload.via), ["QR"], "event via");
    const tb = await LN().checkInToken({ tenantId: ids.tB, unitId: ids.uB }, fx.BB);
    eq(await PUB.checkIn()(DV.K1.token, { qr: tb ?? "x" }, { now: NOW }), await kioskNF(), "QR ร้าน B");
  });
  let a12: string | null = null;
  await st("K-7", "kioskWalkIn K1 ตัดผมชาย ใครก็ได้ (14:40) ⇒ บัตร A012 · waitMin ≈ walkInWaitMin ของตู้ ณ เวลาเดียวกัน (±5) · aheadCount ≥ 1 · ticketUrl สูตร · lineLink = OA @qcb6 + ChatLinkCode QUEUE_TICKET ของบัตรนี้ · งาน/บัตรช่อง KIOSK · ไม่มี PII", async () => {
    needScene();
    const v = await PUB.kiosk()(DV.K1.token, { now: NOW });
    ok(!!v && typeof v.walkInWaitMin === "number", "kiosk view");
    const r = await PUB.walkIn()(DV.K1.token, { serviceId: SVC["SVCQC-BB-01"], staffId: null }, { now: NOW });
    ok(r.ok, `walkIn ${fmt(r)}`);
    if (!r.ok) return;
    eq(r.ticket.ticketNumber, "A012", "เลขบัตร");
    ok(typeof r.ticket.waitMin === "number" && Math.abs(r.ticket.waitMin - (v!.walkInWaitMin as number)) <= 5, `waitMin ${r.ticket.waitMin} vs ${v!.walkInWaitMin}`);
    ok(r.ticket.aheadCount >= 1, `aheadCount ${r.ticket.aheadCount}`);
    eq(r.ticket.ticketUrl, `/bq/t/${tokS("A012")}`, "ticketUrl");
    const tk = await tkByNumber(ids.uS, "A012");
    a12 = tk.refId;
    const code = /^https:\/\/line\.me\/R\/oaMessage\/%40qcb6\/\?([A-Z0-9]{8})$/.exec(r.ticket.lineLink ?? "");
    ok(!!code, `lineLink ${r.ticket.lineLink}`);
    const lc = await q<{ codeLast4: string; connectionId: string }>(`SELECT "codeLast4", "connectionId" FROM "ChatLinkCode" WHERE "tenantId" = $1 AND purpose = 'QUEUE_TICKET' AND "refId" = $2`, [ids.tA, tk.id]);
    eq(lc.map((x) => [x.codeLast4, x.connectionId]), [[code![1].slice(-4), ids.conn]], "ChatLinkCode");
    eq([(await apRow(tk.refId!)).channel, tk.channel], ["KIOSK", "KIOSK"], "ช่อง");
    eq(piiLeak(JSON.stringify(r)), [], "PII");
  });
  await st("K-8", "kioskWalkIn ล้มถูกรหัส: ทำสี (ปิด walk-in) ผ่าน K2 ALL ⇒ WALKIN_DISABLED · บริการร้าน B ⇒ NOT_FOUND · KQ ไม่ใส่เบอร์ ⇒ PHONE_REQUIRED · KQ ใส่เบอร์ + ส่งช่าง ⇒ ok แต่ใครก็ได้ (walkInPickStaff=false)", async () => {
    needScene();
    failCode(await PUB.walkIn()(DV.K2.token, { serviceId: SVC["SVCQC-BB-05"], staffId: null }, { now: NOW }), "WALKIN_DISABLED", "ทำสี");
    failCode(await PUB.walkIn()(DV.K1.token, { serviceId: ids.BS, staffId: null }, { now: NOW }), "NOT_FOUND", "บริการร้าน B");
    failCode(await PUB.walkIn()(DV.KQ.token, { serviceId: ids.KCUT, staffId: ids.K2s }, { now: KNOW }), "PHONE_REQUIRED", "ไม่ใส่เบอร์");
    const r = await PUB.walkIn()(DV.KQ.token, { serviceId: ids.KCUT, staffId: ids.K2s, phone: "0899000003" }, { now: KNOW });
    ok(r.ok, `KQ ${fmt(r)}`);
    if (!r.ok) return;
    const tk = await tkByNumber(ids.uK, r.ticket.ticketNumber);
    eq((await apRow(tk.refId!)).assignMode, "ANY", "assignMode");
    eq(r.ticket.lineLink, null, "หน่วยไม่ตั้ง LINE ⇒ lineLink null");
    ok(r.ticket.ticketUrl === `/bq/t/${tkToken(ids.tA, ids.uK, D, r.ticket.ticketNumber)}`, "ticketUrl");
  });
  await st("K-9", "rate limit ตู้ (checkRateLimitDb ต่อเครื่อง): KR เช็กอินเบอร์ 20 ครั้ง ⇒ NOT_FOUND · ครั้งที่ 21 ⇒ RATE_LIMITED · KR2 เครื่องอื่นยังได้ NOT_FOUND · KIOSK_RATE ตามใบสั่ง", async () => {
    needScene();
    eq(pubLoad.mod?.KIOSK_RATE, { checkIn: { limit: 20, windowMs: 300_000 }, walkIn: { limit: 30, windowMs: 600_000 } }, "KIOSK_RATE");
    const codes: string[] = [];
    for (let i = 0; i < 21; i++) { const r = await PUB.checkIn()(DV.KR.token, { phone: "0899000999" }, { now: KNOW }); codes.push(r.ok ? "OK" : r.code); }
    eq([codes.slice(0, 20).every((c) => c === "NOT_FOUND"), codes[20]], [true, "RATE_LIMITED"], `ผล ${codes.join(",")}`);
    const r2 = await PUB.checkIn()(DV.KR2.token, { phone: "0899000999" }, { now: KNOW });
    eq(r2.ok ? "OK" : r2.code, "NOT_FOUND", "KR2");
  });

  console.log("\n── C (ต่อ): ปุ่มหน้าบัตร ──");
  await st("C-4", "บัตรนัด P006: kind BOOKED · นัด 14:45 · เลื่อน/ยกเลิกไม่ได้ (canDefer/canCancel false) · deferTicket/cancelTicket ⇒ BAD_STATE · token ใช้ไม่ได้ ⇒ NOT_FOUND ผลเดียวกัน", async () => {
    needScene();
    const v = await PUB.ticket()(tokS("P006"), { now: NOW });
    ok(!!v, "null");
    eq([v!.kind, hhmm(v!.bookedStartMs), v!.canDefer, v!.canCancel], ["BOOKED", "14:45", false, false], "P006");
    failCode(await PUB.defer()(tokS("P006"), { now: NOW }), "BAD_STATE", "defer P006");
    failCode(await PUB.cancel()(tokS("P006"), { now: NOW }), "BAD_STATE", "cancel P006");
    const nf = await PUB.defer()(newToken(), { now: NOW });
    failCode(nf, "NOT_FOUND", "defer สุ่ม");
    eq(await PUB.cancel()(`${tokS("A011").split(".")[0]}.x`, { now: NOW }), nf, "cancel ลายเซ็นเสีย");
    eq(await PUB.defer()(tokS("A011"), { now: at(addDays(D, 2), "09:00") }), nf, "defer หมดอายุ");
  });
  await st("C-5", "ขอเลื่อนไปคิวหลัง A010 (ถอย 1 คิว): ครั้งแรกสลับกับ A011 (checkedInAt = A011 + 1 ms) · ครั้งที่สองสลับกับ A012 · QueueTicketEvent DEFERRED actor CUSTOMER 2 แถว · แผนถูกคิดใหม่ · ไม่มีงานถือช่องซ้อน", async () => {
    needScene();
    ok(!!a12, "K-7 ไม่สำเร็จ (ไม่มี A012)");
    const ca = async (k: string) => (await apRow(k)).checkedInAt?.getTime() ?? NaN;
    ok((await PUB.ticket()(tokS("A010"), { now: NOW }))?.canDefer === true, "A010 canDefer");
    const r1 = await PUB.defer()(tokS("A010"), { now: at(D, "14:41") });
    ok(r1.ok, `defer 1 ${fmt(r1)}`);
    eq(await ca(fx.A010), (await ca(fx.A011)) + 1, "หลังครั้งแรก");
    const r2 = await PUB.defer()(tokS("A010"), { now: at(D, "14:42") });
    ok(r2.ok, `defer 2 ${fmt(r2)}`);
    eq(await ca(fx.A010), (await ca(a12!)) + 1, "หลังครั้งที่สอง");
    const t10 = await tkByNumber(ids.uS, "A010");
    const evs = await q<{ actorType: string }>(`SELECT "actorType" FROM "QueueTicketEvent" WHERE "ticketId" = $1 AND action = 'DEFERRED'`, [t10.id]);
    eq(evs.map((e) => e.actorType), ["CUSTOMER", "CUSTOMER"], "event");
    ok((await apRow(fx.A010)).plannedStartAt !== null, "แผน A010");
    const rows = await q<{ id: string; staffId: string; s: Date; e: Date }>(`SELECT id, "staffId", "startAt" AS s, "endAt" AS e FROM "Appointment" WHERE "unitId" = $1 AND status IN ('QUEUED','ARRIVED','IN_SERVICE','CONFIRMED') ORDER BY "staffId", "startAt"`, [ids.uS]);
    const clash: string[] = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].staffId === rows[i - 1].staffId && rows[i].s.getTime() < rows[i - 1].e.getTime()) clash.push(`${rows[i - 1].id}×${rows[i].id}`);
    eq(clash, [], "ซ้อน");
  });
  await st("C-6", "ยกเลิกบัตร A012 (ลูกค้า): งาน CANCELLED · บัตร CANCELLED cancelReason CUSTOMER · outbox booking.cancelled reason CUSTOMER ไม่มี PII · ยกเลิกซ้ำ ⇒ BAD_STATE · หน้าบัตรแสดง CANCELLED (ไม่มีปุ่ม)", async () => {
    needScene();
    ok(!!a12, "K-7 ไม่สำเร็จ");
    const r = await PUB.cancel()(tokS("A012"), { now: at(D, "14:43") });
    ok(r.ok, `cancel ${fmt(r)}`);
    eq((await apRow(a12!)).status, "CANCELLED", "งาน");
    const tk = await tkByNumber(ids.uS, "A012");
    eq([tk.status, tk.cancelReason], ["CANCELLED", "CUSTOMER"], "บัตร");
    const ev = await q<{ payload: Record<string, unknown> }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'booking.cancelled' AND payload->>'appointmentId' = $2`, [ids.tA, a12]);
    eq(ev.map((e) => e.payload.reason), ["CUSTOMER"], "outbox");
    eq(piiLeak(JSON.stringify(ev)), [], "PII payload");
    failCode(await PUB.cancel()(tokS("A012"), { now: at(D, "14:44") }), "BAD_STATE", "ยกเลิกซ้ำ");
    const v = await PUB.ticket()(tokS("A012"), { now: at(D, "14:44") });
    eq([v?.status, v?.canCancel, v?.canDefer, v?.aheadCount], ["CANCELLED", false, false, null], "หน้าบัตร");
  });
  await st("C-7", "A010 เป็น walk-in คนสุดท้ายแล้ว ⇒ canDefer false · deferTicket ⇒ BAD_STATE (ไม่ขยับ checkedInAt)", async () => {
    needScene();
    const before = (await apRow(fx.A010)).checkedInAt?.getTime();
    eq((await PUB.ticket()(tokS("A010"), { now: at(D, "14:45") }))?.canDefer, false, "canDefer");
    failCode(await PUB.defer()(tokS("A010"), { now: at(D, "14:45") }), "BAD_STATE", "defer");
    eq((await apRow(fx.A010)).checkedInAt?.getTime(), before, "checkedInAt");
  });
  await st("C-8", "rate limit ปุ่มหน้าบัตร (ต่อบัตร · TICKET_RATE 10/10 นาที): บัตร P007 กดยกเลิก 10 ครั้ง ⇒ BAD_STATE · ครั้งที่ 11 ⇒ RATE_LIMITED · บัตรอื่นไม่โดน", async () => {
    needScene();
    eq(pubLoad.mod?.TICKET_RATE, { limit: 10, windowMs: 600_000 }, "TICKET_RATE");
    const codes: string[] = [];
    for (let i = 0; i < 11; i++) { const r = await PUB.cancel()(tokS("P007"), { now: at(D, "14:46") }); codes.push(r.ok ? "OK" : r.code); }
    eq([codes.slice(0, 10).every((c) => c === "BAD_STATE"), codes[10]], [true, "RATE_LIMITED"], codes.join(","));
    const o = await PUB.cancel()(tokS("P008"), { now: at(D, "14:46") });
    eq(o.ok ? "OK" : o.code, "BAD_STATE", "P008");
  });

  // ═══════════════ L ทางเดิม ═══════════════
  console.log("\n── L: ทางสาธารณะเดิมของคิว (§3.7) ──");
  await st("L-1", "getTicketStatus: บัตรหน่วย QUEUE เดิม ⇒ ได้ผล (ตัวควบคุม) · บัตรแถวเดียว (A011 · publicToken เดิม) ⇒ null", async () => {
    needScene();
    ok((await QS().getTicketStatus(ids.uQ, `svcb6pub${RUN}`)) !== null, "ตัวควบคุมหน่วย QUEUE ได้ null (fixture เสีย)");
    eq(await QS().getTicketStatus(ids.uS, (await tkByNumber(ids.uS, "A011")).publicToken), null, "บัตรแถวเดียว");
  });
  await st("L-2", "getDisplaySnapshot: ส่ง hash ที่เก็บของอุปกรณ์ B.6 (sha256:…) เป็น token ⇒ null", async () => {
    needScene();
    eq(await QS().getDisplaySnapshot(ids.uS, `sha256:${sha256hex(DV.TV1.token)}`), null, "snapshot");
  });

  // ═══════════════ U DOM ═══════════════
  console.log("\n── U: คอมโพเนนต์ (renderToStaticMarkup · สัญญา DOM §4) ──");
  const AT = NOW.toISOString();
  const tvV: TvView = {
    unitName: "บาร์เบอร์ลุงหนวด · อารีย์", dayStr: D, nowMs: NOW.getTime(),
    calling: { ticketNumber: "A009", seat: 4, staffName: "ช่างแจ๊ค", serviceName: "ตัดผมชาย" },
    chairs: [
      { seat: 1, staffName: "ช่างเอก", state: "BUSY", ticketNumber: "P004", nextTicketNumber: null },
      { seat: 2, staffName: "ช่างบอย", state: "FREE", ticketNumber: null, nextTicketNumber: "P006" },
      { seat: 3, staffName: "ช่างนุ่น", state: "BUSY", ticketNumber: "P005", nextTicketNumber: "A010" },
      { seat: 4, staffName: "ช่างแจ๊ค", state: "CALLING", ticketNumber: "A009", nextTicketNumber: "A011" },
    ],
    next: [
      { ticketNumber: "P006", startMs: at(D, "14:45").getTime(), seat: 2, staffName: "ช่างบอย", booked: true },
      { ticketNumber: "A010", startMs: at(D, "15:00").getTime(), seat: 3, staffName: "ช่างนุ่น", booked: false },
      { ticketNumber: "A011", startMs: at(D, "15:25").getTime(), seat: 4, staffName: "ช่างแจ๊ค", booked: false },
    ],
    walkInWaitMin: 50, voice: ["th", "en"],
  };
  const kV = (o: Partial<KioskView> = {}): KioskView => ({
    unitName: "บาร์เบอร์ลุงหนวด · อารีย์", dayStr: D, nowMs: NOW.getTime(), busyCount: 4, seatCount: 4, waitingCount: 2, nextTicketNumber: "A009", walkInWaitMin: 60,
    services: [
      { id: "s1", name: "ตัดผมชาย", durationMin: 45, priceSatang: 25000, walkIn: true }, { id: "s2", name: "ตัด + สระ", durationMin: 60, priceSatang: 35000, walkIn: true },
      { id: "s5", name: "ทำสีผม", durationMin: 90, priceSatang: 90000, walkIn: false },
    ],
    staff: [{ id: "st1", name: "ช่างเอก" }, { id: "st2", name: "ช่างบอย" }], phone: "OPTIONAL", paperTicket: false, pinLock: true, ...o,
  });
  const kTicket: KioskTicket = { ticketNumber: "A011", serviceName: "ตัด + สระ", staffName: "ช่างแจ๊ค", seat: 4, plannedStartMs: at(D, "15:25").getTime(), waitMin: 65, aheadCount: 3, ticketUrl: "/bq/t/tok-a011", lineLink: "https://line.me/R/oaMessage/%40qcb6/?AB12CD34" };
  const KACT = { checkIn: noop2, walkIn: noop2 };
  const kRender = (view: KioskView, extra: Record<string, unknown> = {}) => render(KioskC, { view, actions: KACT, ...extra });
  const tV = (o: Partial<TicketView> = {}): TicketView => ({
    unitName: "บาร์เบอร์ลุงหนวด · อารีย์", ticketNumber: "A011", status: "WAITING", kind: "WALKIN", serviceName: "ตัด + สระ", staffName: "ช่างแจ๊ค", seat: 4,
    issuedAtMs: at(D, "14:18").getTime(), bookedStartMs: null, plannedStartMs: at(D, "15:25").getTime(), returnByMs: at(D, "15:20").getTime(), aheadCount: 2,
    ahead: [
      { kind: "NOW", ticketNumber: "A009", startMs: null, seat: 4 }, { kind: "WAIT", ticketNumber: "A010", startMs: at(D, "15:00").getTime(), seat: 3 },
      { kind: "BOOKED", ticketNumber: null, startMs: at(D, "15:15").getTime(), seat: 1 }, { kind: "ME", ticketNumber: "A011", startMs: at(D, "15:25").getTime(), seat: 4 },
    ],
    canDefer: true, canCancel: true, ...o,
  });
  const TACT = { defer: noop1, cancel: noop1 };
  await st("U-0", "คอมโพเนนต์ 4 ตัวมีอยู่ (default export) · ไม่ import ค่าจาก @/lib/modules/** · @/lib/core/db · @prisma/client (import type ได้) · Kiosk เป็น 'use client'", () => {
    const bad: string[] = [];
    for (const f of [F.compTv, F.compKiosk, F.compTicket, F.compDevices]) {
      const s = src(f);
      if (!s) { bad.push(`ไม่มี ${f}`); continue; }
      for (const m of stripComments(s).matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
        if (m[1]) continue;
        if (/^@\/lib\/modules\/|^@\/lib\/core\/db|^@prisma\/client/.test(m[2])) bad.push(`${f}: ${m[2]}`);
      }
    }
    ok(/^\s*["']use client["']/.test(src(F.compKiosk)), "Kiosk ไม่ใช่ 'use client'");
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  }, "MAJOR");
  await st("U-1", "TvBoard: data-tv-board · data-tv-calling data-ticket=A009 · เก้าอี้ 4 ช่องตามลำดับ + data-state · data-tv-next ตามลำดับ · data-tv-wait มี 50 · ไม่มีฟอร์ม/ปุ่ม · calling null ⇒ ไม่มี data-tv-calling", () => {
    const h = render(TvC, { view: tvV });
    ok(boxes(h, "data-tv-board").length === 1, "ราก");
    eq(boxes(h, "data-tv-calling").map((b) => b.attrs["data-ticket"]), ["A009"], "calling");
    eq(boxes(h, "data-tv-chair").map((b) => [b.attrs["data-tv-chair"], b.attrs["data-state"]]), [["1", "BUSY"], ["2", "FREE"], ["3", "BUSY"], ["4", "CALLING"]], "เก้าอี้");
    eq(boxes(h, "data-tv-next").map((b) => b.attrs["data-tv-next"]), ["P006", "A010", "A011"], "next");
    ok(/50/.test(boxes(h, "data-tv-wait")[0]?.html ?? ""), "เวลารอ");
    ok(!/<form\b|<button\b/.test(h), "มีฟอร์ม/ปุ่ม");
    ok(!render(TvC, { view: { ...tvV, calling: null } }).includes("data-tv-calling"), "calling null");
  }, "MAJOR");
  await st("U-2", "Kiosk home: data-kiosk + data-kiosk-home + ปุ่ม data-kiosk-go checkin/walkin · pinLock true ⇒ ไม่มี data-kiosk-exit · pinLock false ⇒ มี", () => {
    const h = kRender(kV());
    ok(boxes(h, "data-kiosk").length >= 1 && boxes(h, "data-kiosk-home").length === 1, "ราก/home");
    eq(boxes(h, "data-kiosk-go").map((b) => b.attrs["data-kiosk-go"]).sort(), ["checkin", "walkin"], "ปุ่ม");
    ok(!h.includes("data-kiosk-exit"), "ล็อกแล้วยังมีทางออก");
    ok(kRender(kV({ pinLock: false })).includes("data-kiosk-exit"), "ไม่ล็อกแต่ไม่มีทางออก");
  }, "MAJOR");
  await st("U-3", "Kiosk walkin: ฟอร์ม data-kiosk-walkin-form · radio serviceId เฉพาะ walkIn:true · ทำสี = data-kiosk-bookonly ไม่มี input · staffId มีตัวเลือก \"\" · staff null ⇒ ไม่มี staffId · phone required เฉพาะ REQUIRED · checkin form มี phone+qr", () => {
    const h = kRender(kV(), { initial: { screen: "walkin" } });
    const f = boxes(h, "data-kiosk-walkin-form")[0];
    ok(!!f && /^<form\b/.test(f.html), "ไม่มีฟอร์ม walk-in");
    const ins = inputsOf(f.html);
    eq(ins.filter((i) => i.name === "serviceId").map((i) => i.value).sort(), ["s1", "s2"], "บริการ");
    eq(boxes(h, "data-kiosk-bookonly").map((b) => b.attrs["data-kiosk-bookonly"]), ["s5"], "จองล่วงหน้า");
    const staffVals = [...ins.filter((i) => i.name === "staffId").map((i) => i.value), ...[...f.html.matchAll(/<select\b[^>]*name="staffId"[\s\S]*?<\/select>/g)].flatMap((m) => [...m[0].matchAll(/<option\b[^>]*value="([^"]*)"/g)].map((o) => o[1]))];
    ok(staffVals.includes("") && staffVals.includes("st1"), `staffId ${fmt(staffVals)}`);
    const ph = ins.find((i) => i.name === "phone");
    ok(!!ph && !("required" in ph), "phone OPTIONAL");
    const h2 = kRender(kV({ staff: null, phone: "REQUIRED" }), { initial: { screen: "walkin" } });
    const f2 = boxes(h2, "data-kiosk-walkin-form")[0]?.html ?? "";
    ok(!/name="staffId"/.test(f2), "staff null แต่มี staffId");
    ok("required" in (inputsOf(f2).find((i) => i.name === "phone") ?? {}), "phone REQUIRED ไม่มี required");
    const c = boxes(kRender(kV(), { initial: { screen: "checkin" } }), "data-kiosk-checkin-form")[0]?.html ?? "";
    eq(inputsOf(c).map((i) => i.name).filter((n) => n === "phone" || n === "qr").sort(), ["phone", "qr"], "checkin");
  }, "MAJOR");
  await st("U-4", "Kiosk ticket: data-kiosk-ticket=A011 · data-kiosk-qr data-href = lineLink (ไม่มี ⇒ ticketUrl) · data-kiosk-print เฉพาะ paperTicket · checkedIn: data-kiosk-checkedin=P006", () => {
    const h = kRender(kV(), { initial: { screen: "ticket", ticket: kTicket } });
    eq(boxes(h, "data-kiosk-ticket").map((b) => b.attrs["data-kiosk-ticket"]), ["A011"], "ticket");
    eq(boxes(h, "data-kiosk-qr").map((b) => b.attrs["data-href"]), [kTicket.lineLink], "qr");
    ok(!h.includes("data-kiosk-print"), "paperTicket false แต่มีปุ่มพิมพ์");
    const h2 = kRender(kV({ paperTicket: true }), { initial: { screen: "ticket", ticket: { ...kTicket, lineLink: null } } });
    eq(boxes(h2, "data-kiosk-qr").map((b) => b.attrs["data-href"]), [kTicket.ticketUrl], "qr ไม่มี LINE");
    ok(h2.includes("data-kiosk-print"), "ไม่มีปุ่มพิมพ์");
    const h3 = kRender(kV(), { initial: { screen: "checkedIn", ticket: { ...kTicket, ticketNumber: "P006", bookedStartMs: at(D, "14:45").getTime() } } });
    eq(boxes(h3, "data-kiosk-checkedin").map((b) => b.attrs["data-kiosk-checkedin"]), ["P006"], "checkedIn");
  }, "MAJOR");
  await st("U-5", "นาฬิกา QC: at ⇒ ทุกฟอร์ม (ตู้ checkin/walkin · หน้าบัตร) มี hidden at · ไม่ส่ง ⇒ ไม่มี input at เลย", () => {
    const bad: string[] = [];
    for (const [what, h] of [
      ["kiosk checkin", kRender(kV(), { initial: { screen: "checkin" }, at: AT })], ["kiosk walkin", kRender(kV(), { initial: { screen: "walkin" }, at: AT })],
      ["ticket", render(TicketC, { view: tV(), token: "tok", actions: TACT, at: AT })],
    ] as [string, string][]) {
      const fs = [...h.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]);
      if (!fs.length) bad.push(`${what}: ไม่มีฟอร์ม`);
      for (const f of fs) if (!inputsOf(f).some((i) => i.name === "at" && i.type === "hidden" && i.value === AT)) bad.push(`${what}: ฟอร์มไม่มี at`);
    }
    for (const [what, h] of [["kiosk walkin", kRender(kV(), { initial: { screen: "walkin" } })], ["ticket", render(TicketC, { view: tV(), token: "tok", actions: TACT })]] as [string, string][]) {
      if (inputsOf(h).some((i) => i.name === "at")) bad.push(`${what}: มี at ทั้งที่ไม่ส่ง`);
    }
    ok(bad.length === 0, bad.join(" · "));
  }, "MAJOR");
  await st("U-6", "TicketCard: data-ticket-card data-ticket=A011 · data-ticket-ahead ตามลำดับ NOW WAIT BOOKED ME · ปุ่ม data-ticket-defer/data-ticket-cancel อยู่ในฟอร์มเฉพาะเมื่อ can* · ไม่มี PII", () => {
    const h = render(TicketC, { view: tV(), token: "tok", actions: TACT });
    eq(boxes(h, "data-ticket-card").map((b) => b.attrs["data-ticket"]), ["A011"], "ราก");
    eq(boxes(h, "data-ticket-ahead").map((b) => b.attrs["data-ticket-ahead"]), ["NOW", "WAIT", "BOOKED", "ME"], "ข้างหน้า");
    const fs = [...h.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]);
    ok(fs.some((f) => f.includes("data-ticket-defer")), "ปุ่มเลื่อนไม่อยู่ในฟอร์ม");
    ok(h.includes("data-ticket-cancel"), "ไม่มีปุ่มยกเลิก");
    const h2 = render(TicketC, { view: tV({ canDefer: false, canCancel: false }), token: "tok", actions: TACT });
    ok(!h2.includes("data-ticket-defer") && !h2.includes("data-ticket-cancel"), "ปุ่มที่ไม่ควรมี");
    eq(piiLeak(h), [], "PII");
  }, "MAJOR");
  await st("U-7", "DevicesPanel: data-bq-devices · แถว data-bq-device + data-kind · ฟอร์มสร้าง (select kind TV/KIOSK + input name) · ปุ่มถอนมี hidden deviceId · ไม่มี token/sha256", () => {
    const devs: BookingDevice[] = [{ id: "d1", unitId: "u", kind: "TV", name: "จอหน้าร้าน", createdAt: NOW }, { id: "d2", unitId: "u", kind: "KIOSK", name: "ตู้", createdAt: NOW }];
    const h = render(DevicesC, { unitSlug: "b6", devices: devs, actions: { create: noop2, rotate: noop2, revoke: noop1 } });
    ok(boxes(h, "data-bq-devices").length === 1, "ราก");
    eq(boxes(h, "data-bq-device").map((b) => [b.attrs["data-bq-device"], b.attrs["data-kind"]]), [["d1", "TV"], ["d2", "KIOSK"]], "แถว");
    const c = boxes(h, "data-bq-device-create")[0]?.html ?? "";
    ok(/name="kind"/.test(c) && /value="TV"/.test(c) && /value="KIOSK"/.test(c) && inputsOf(c).some((i) => i.name === "name"), "ฟอร์มสร้าง");
    const rv = boxes(h, "data-bq-device-revoke");
    ok(rv.length >= 1, "ไม่มีปุ่มถอน");
    ok(rv.every((b) => { const id = b.attrs["data-bq-device-revoke"]; const f = [...h.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]).find((x) => x.includes(`data-bq-device-revoke="${id}"`)); return !!f && inputsOf(f).some((i) => i.name === "deviceId" && i.value === id); }), "ถอนไม่มี deviceId");
    ok(!/sha256/.test(h), "มี sha256");
  }, "MAJOR");

  // ═══════════════ H server จริง ═══════════════
  console.log("\n── H: server จริง (QC_BASE) ──");
  const BASE = (process.env.QC_BASE ?? "").replace(/\/+$/, "");
  const H_IDS = ["H-1", "H-2", "H-3", "H-4"] as const;
  const H_NAMES: Record<(typeof H_IDS)[number], string> = {
    "H-1": "GET /bq/tv/<TV1>?at=14:40 ⇒ 200 · data-tv-board · calling A009 · ไม่มี PII ใน HTML/RSC · meta robots noindex + referrer no-referrer",
    "H-2": "X7 หน้า: token สุ่ม / ถอนแล้ว / token ตู้ที่ /bq/tv / บัตรหมดอายุ ⇒ สถานะเดียวกัน (404) · ไม่มีชื่อสาขาใน body",
    "H-3": "GET /bq/kiosk/<K1> ⇒ 200 data-kiosk-home · GET /bq/t/<A011> ⇒ 200 data-ticket-card · ไม่มี PII · ไม่มี token อุปกรณ์อื่น",
    "H-4": "GET /app/u/<slug>/booking/devices: เจ้าของ ⇒ 200 data-bq-devices (ไม่มี token/sha256) · แคชเชียร์ (ไม่มี devices.manage) ⇒ 404 · เจ้าของร้าน B ⇒ 404",
  };
  let hReady = "";
  if (!BASE) hReady = "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + เปิด server ด้วย SVC_QC_CLOCK=1 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>";
  else if (!sceneOk) hReady = "ฉาก F-0 ไม่สำเร็จ";
  else {
    const ping = await fetch(`${BASE}/`, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
    if (ping instanceof Error) hReady = `ต่อ ${BASE} ไม่ได้ (${ping.message.slice(0, 80)})`;
  }
  if (hReady) for (const id of H_IDS) skip(id, H_NAMES[id], hReady, "MAJOR");
  else {
    const mint = async (userId: string, tenantId: string): Promise<string> => {
      const token = `b6${randomBytes(24).toString("base64url")}`;
      const ttl = new Date(Date.now() + 3_600_000);
      await insertRow("Session", { id: rid("sess"), userId, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl });
      return `${BASE.startsWith("https:") ? "__Host-shark_session" : "shark_session"}=${token}; shark_tenant=${tenantId}`;
    };
    const atq = `at=${encodeURIComponent(NOW.toISOString())}`;
    const get = async (path: string, cookie = "") => {
      const r = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual", signal: AbortSignal.timeout(60_000) });
      return { status: r.status, html: await r.text() };
    };
    await st("H-1", H_NAMES["H-1"], async () => {
      const r = await get(`/bq/tv/${DV.TV1.token}?${atq}`);
      eq(r.status, 200, "HTTP");
      ok(r.html.includes("data-tv-board"), "ไม่มี data-tv-board (server ตั้ง SVC_QC_CLOCK=1 หรือยัง?)");
      ok(/data-tv-calling[^>]*data-ticket="A009"|data-ticket="A009"[^>]*data-tv-calling/.test(r.html), "calling A009");
      eq(piiLeak(r.html), [], "PII");
      ok(/<meta[^>]+name="robots"[^>]+noindex/.test(r.html) && /<meta[^>]+name="referrer"[^>]+no-referrer/.test(r.html), "meta robots/referrer");
    }, "MAJOR");
    await st("H-2", H_NAMES["H-2"], async () => {
      const rs = [
        await get(`/bq/tv/${newToken()}?${atq}`), await get(`/bq/tv/${DV.TVR.token}?${atq}`), await get(`/bq/tv/${DV.K1.token}?${atq}`),
        await get(`/bq/kiosk/${newToken()}?${atq}`), await get(`/bq/t/${tokS("A011")}?at=${encodeURIComponent(at(addDays(D, 2), "09:00").toISOString())}`),
      ];
      eq(rs.map((r) => r.status), [404, 404, 404, 404, 404], "สถานะ");
      ok(rs.every((r) => !r.html.includes("สาขา scene")), "ชื่อสาขาหลุด");
    }, "MAJOR");
    await st("H-3", H_NAMES["H-3"], async () => {
      const k = await get(`/bq/kiosk/${DV.K1.token}?${atq}`);
      eq(k.status, 200, "kiosk HTTP");
      ok(k.html.includes("data-kiosk-home"), "kiosk home");
      const t = await get(`/bq/t/${tokS("A011")}?${atq}`);
      eq(t.status, 200, "ticket HTTP");
      ok(t.html.includes("data-ticket-card"), "ticket card");
      for (const h of [k.html, t.html]) { eq(piiLeak(h), [], "PII"); ok(!Object.values(DV).some((d) => d.id !== DV.K1.id && h.includes(d.token)), "token อุปกรณ์อื่น"); }
    }, "MAJOR");
    await st("H-4", H_NAMES["H-4"], async () => {
      const path = `/app/u/${SLUGS[ids.uS]}/booking/devices`;
      const o = await get(path, await mint(ids.uOwner, ids.tA));
      eq(o.status, 200, "เจ้าของ");
      ok(o.html.includes("data-bq-devices"), "data-bq-devices");
      ok(!o.html.includes("sha256:") && !Object.values(DV).some((d) => o.html.includes(d.token)), "token/hash ใน HTML");
      eq((await get(path, await mint(ids.uCash, ids.tA))).status, 404, "แคชเชียร์");
      eq((await get(path, await mint(ids.uOwnerB, ids.tB))).status, 404, "ร้าน B");
    }, "MAJOR");
  }

  // ═══════════════ Q ฉาก svcqc ═══════════════
  console.log("\n── Q: ฉากภาพบนร้าน svcqc (scripts/svc-qc-device-scene.mts) ──");
  const DD = sqcDeviceSceneDay(TODAY);
  const svcStaff = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "BookingStaff" WHERE "tenantId" = $1 AND "unitId" = $2 AND active`, [SQC.tenant.id, SQC.units.barber.id]))[0].n;
  const runTsx = (file: string, args: string[] = []) => {
    const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
    let sum: { created?: number; updated?: number; removed?: number } | null = null;
    try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
    return { status: r.status, out, sum };
  };
  if (svcStaff !== 4) {
    for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "ตัวโหลดบน svcqc ตรงภาพ"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, `ร้าน svcqc บาร์เบอร์มีช่าง ${svcStaff} (ต้อง 4) — รัน scripts/seed-svc-qc.mts ก่อน`, "MAJOR");
  } else {
    await st("Q-1", `ฉาก svcqc รันได้ (exit 0) · SCENE_SUMMARY {created,updated,removed} · วันฉาก ${DD} ${DSC.at}`, () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const r = runTsx(F.scene);
      ok(r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof (r.sum as Record<string, unknown>)[k] === "number"), `exit=${r.status} ${r.sum ? fmt(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`);
    }, "MAJOR");
    await st("Q-2", "บน svcqc ณ วันฉาก 14:40: ทีวีฉาก = ภาพ 05 (เรียก A009 · เก้าอี้ · ถัดไป 3) · ตู้ฉาก = ทุกบริการ 6 + ปุ่มพิมพ์ · หน้าบัตร A011 (token สูตรเดียวกับ visual) เปิดได้ ข้างหน้า 4", async () => {
      const now = at(DD, DSC.at);
      const tv = await PUB.tv()(DSC.devices.tv.token, { now });
      ok(!!tv, "ทีวีฉาก null");
      eq(tv!.calling?.ticketNumber, DSC.expect.calling.ticketNumber, "calling");
      eq(tv!.chairs.map((c) => [c.seat, c.state, c.ticketNumber]), DSC.expect.chairs.map((c) => [c.seat, c.state, c.ticketNumber]), "เก้าอี้");
      eq(tv!.next.map((n) => [n.ticketNumber, hhmm(n.startMs)]), DSC.expect.next.map((x) => [x[0], x[1]]), "ถัดไป");
      const k = await PUB.kiosk()(DSC.devices.kiosk.token, { now });
      eq([k?.services.length, k?.paperTicket], [6, true], "ตู้ฉาก");
      const tv2 = await PUB.ticket()(tkToken(SQC.tenant.id, SQC.units.barber.id, DD, "A011"), { now });
      eq([tv2?.ticketNumber, tv2?.aheadCount], ["A011", DSC.expect.ticketA011.aheadCount], "หน้าบัตร");
    }, "MAJOR");
    await st("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const r = runTsx(F.scene);
      ok(r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${fmt(r.sum)}`);
    }, "MAJOR");
  }

  // ═══════════════ V ภาพ ═══════════════
  console.log("\n── V: ภาพ (จอง 04 ก · 05 · 06 ก) ──");
  {
    const specs = SQC_VISUAL_SPECS["b.6"];
    const name = "ภาพ b.6 (kiosk-home · tv-display · ticket-card) 1440 + 390 · HTTP < 400 · ไม่ล้นแนวนอน · ไม่มี page error";
    if (!Array.isArray(specs) || specs.length !== 3) record("V-1", name, "FAIL", `SQC_VISUAL_SPECS b.6 ${fmt(specs)}`, "MAJOR");
    else if (!BASE) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC + reseed + ฉาก + server SVC_QC_CLOCK=1 แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "b.6", "--user", "owner", "--base", BASE], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) record("V-1", `${name} (ภาพ .qc-shots/svc/b.6 — ผู้คุมเทียบ PARITY 04/05/06ก)`, "PASS", "", "MAJOR");
      else record("V-1", name, "FAIL", `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup([ids.tA, ids.tB]); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupGlobal();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b6-*` 0 · นัด/บัตร/อุปกรณ์/ค่าตั้ง/รหัสผูก/audit/outbox ของร้านทดสอบ 0 · ผู้ใช้/session ทดสอบ 0 · ถัง rate ของทดสอบ 0 (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-device-scene.mts --clear)", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "QueueTicket", "QueueDisplay", "SettingValue", "ChatLinkCode", "AuditLog", "OutboxEvent", "BookingStaff"]) {
      if (!(await cols(t)).length) continue;
      eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n, 0, t);
    }
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]))[0].n, 0, "user");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Session" WHERE "userAgent" = $1`, [UA]))[0].n, 0, "session");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE '%svcb6\\_%'`))[0].n, 0, "ถัง rate");
  }, "MAJOR");
  await pool.end();
}

// ═══════════════ S. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── S: ไฟล์ · สัญญาโค้ด ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const OWN = new Set<string>([F.pub, F.dev, F.index, F.settingsSvc, F.queue, F.queueActions, F.actPub, F.actDev, F.pageTv, F.pageKiosk, F.pageTicket, F.pageDevices, F.compDevices, F.todayLine]);
const NEW_FILES = [F.pub, F.dev, F.actPub, F.actDev, F.pageTv, F.pageKiosk, F.pageTicket, F.pageDevices, F.compTv, F.compKiosk, F.compTicket, F.compDevices];
{
  const ch = dirty(["src", "prisma"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.pub}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ", "B.6 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · ไฟล์ย่อยใต้ src/components/booking/public/ ได้) · ไฟล์ใหม่ครบ (public-line · devices · actions 2 · หน้า 4 · คอมโพเนนต์ 4)", () => {
    // ORACLE-EDIT (ผู้คุม 29 ต.ค. · fix K4): queue-line.ts แตะได้เพื่อเพิ่ม opt deviceId ของ createWalkIn (walkInPickStaff ชั้น DEVICE)
    const outside = ch.filter((f) => !OWN.has(f) && !f.startsWith("src/components/booking/public/") && f !== "src/lib/modules/booking/queue-line.ts");
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
// ORACLE-EDIT (ผู้คุม 29 ต.ค. · fix K4): queue-line.ts แตะได้เฉพาะเพิ่ม opt deviceId — ตรวจว่าไม่มีบรรทัดถูกลบนอกจาก signature/การอ่าน walkInPickStaff
await st("S-2", "ไม่มี migration/แก้ schema · ไม่แตะตัววางคิว/today-line/line-ops/permissions/settings-model/3 ทะเบียน event · queue-line.ts เพิ่ม opt deviceId เท่านั้น", () => {
  eq(dirty(["prisma", ...FROZEN.filter((f) => f !== "src/lib/modules/booking/queue-line.ts")]), [], "ไฟล์");
  const d = spawnSync("git", ["diff", "-U0", "HEAD", "--", "src/lib/modules/booking/queue-line.ts"], { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
  const del = d.split("\n").filter((l) => /^-(?!-)/.test(l) && l.slice(1).trim() !== "");
  ok(del.length <= 4 && del.every((l) => /createWalkIn|walkInPickStaff|now|opts?\b|\{/.test(l)), `queue-line.ts ลบ ${del.length} บรรทัด: ${del.slice(0, 2).join(" | ").slice(0, 160)}`);
});
await st("S-3", `action สาธารณะ «${F.actPub}»: "use server" · export async function เท่านั้น · ≥ 4 ตัว (kioskCheckIn · kioskWalkIn · deferTicket · cancelTicket) · ไม่มี requireUnit/session · ทุกตัวเรียก facade ของ public-line · อ่าน at เฉพาะใต้ SVC_QC_CLOCK`, () => {
  const s = src(F.actPub);
  ok(!!s, `ยังไม่มี ${F.actPub}`);
  ok(/^\s*["']use server["']/.test(s), "ไม่มี use server บรรทัดแรก");
  const code = stripComments(s);
  ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(code.replace(/export\s+async\s+function/g, "")), "export อื่นที่ไม่ใช่ async function");
  const fns = [...code.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1], at: m.index ?? 0 }));
  ok(fns.length >= 4, `action ${fns.length} ตัว`);
  const bad: string[] = [];
  fns.forEach((f, i) => {
    const body = code.slice(f.at, fns[i + 1]?.at ?? code.length);
    if (!/\b(kioskCheckIn|kioskWalkIn|deferTicket|cancelTicket)\s*\(/.test(body)) bad.push(`${f.name}: ไม่เรียก facade`);
  });
  ok(bad.length === 0, bad.join(" · "));
  ok(!/requireUnit|requireAuth|getSession/.test(code), "action สาธารณะใช้ session");
  if (/["']at["']/.test(code)) ok(/SVC_QC_CLOCK/.test(code), "อ่าน at โดยไม่มีด่าน SVC_QC_CLOCK");
}, "CRITICAL");
await st("S-4", `action อุปกรณ์ «${F.actDev}»: "use server" · ≥ 3 ตัว · ทุกตัว requireUnit → (assertCan|evaluate) booking.devices.manage → facade (createDevice|rotateDeviceToken|revokeDevice) · ส่ง actorUserId`, () => {
  const s = src(F.actDev);
  ok(!!s, `ยังไม่มี ${F.actDev}`);
  ok(/^\s*["']use server["']/.test(s), "ไม่มี use server");
  const code = stripComments(s);
  ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(code.replace(/export\s+async\s+function/g, "")), "export อื่น");
  const fns = [...code.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1], at: m.index ?? 0 }));
  ok(fns.length >= 3, `action ${fns.length} ตัว`);
  ok(/booking\.devices\.manage/.test(code), "ไม่มีคีย์ booking.devices.manage");
  const bad: string[] = [];
  fns.forEach((f, i) => {
    const body = code.slice(f.at, fns[i + 1]?.at ?? code.length);
    const pre = code.slice(0, fns[0].at);
    const iReq = body.search(/requireUnit\s*\(/), iCan = body.search(/assertCan\s*\(|evaluate\s*\(|\bguard\w*\s*\(/), iFac = body.search(/\b(createDevice|rotateDeviceToken|revokeDevice)\s*\(/);
    const viaHelper = iReq < 0 && /requireUnit\s*\(/.test(pre) && /assertCan\s*\(|evaluate\s*\(/.test(pre);
    if (!(viaHelper ? iFac >= 0 : iReq >= 0 && iCan > iReq && iFac > iCan)) bad.push(`${f.name}(req ${iReq} can ${iCan} facade ${iFac})`);
  });
  ok(bad.length === 0, bad.join(" · "));
  ok(/actorUserId/.test(code), "ไม่ส่ง actorUserId");
}, "CRITICAL");
await st("S-5", "หน้า: 3 หน้าสาธารณะ notFound + force-dynamic + metadata robots index false + referrer no-referrer · ?at= อ่านเฉพาะใต้ SVC_QC_CLOCK · หน้า devices ใช้ booking.devices.manage + notFound + listDevices + loadSettingsForm ชั้น DEVICE + SettingsForm", () => {
  const bad: string[] = [];
  for (const [f, loader] of [[F.pageTv, "loadTvView"], [F.pageKiosk, "loadKioskView"], [F.pageTicket, "loadTicketView"]] as const) {
    const p = stripComments(src(f));
    if (!p) { bad.push(`ไม่มี ${f}`); continue; }
    if (!new RegExp(`${loader}\\s*\\(`).test(p)) bad.push(`${f}: ไม่เรียก ${loader}`);
    if (!/notFound\s*\(/.test(p)) bad.push(`${f}: notFound`);
    if (!/dynamic\s*=\s*["']force-dynamic["']/.test(p)) bad.push(`${f}: force-dynamic`);
    if (!/robots[\s\S]{0,80}index\s*:\s*false/.test(p) || !/referrer\s*:\s*["']no-referrer["']/.test(p)) bad.push(`${f}: metadata`);
    if (/searchParams/.test(p) && /\bat\b/.test(p.replace(/\bat:/g, "")) && !/SVC_QC_CLOCK/.test(p)) bad.push(`${f}: ?at= ไม่มีด่าน`);
  }
  const d = stripComments(src(F.pageDevices));
  if (!d) bad.push(`ไม่มี ${F.pageDevices}`);
  else if (!(/booking\.devices\.manage/.test(d) && /notFound\s*\(/.test(d) && /listDevices\s*\(/.test(d) && /loadSettingsForm\s*\(/.test(d) && /["']DEVICE["']/.test(d) && /SettingsForm/.test(d))) bad.push("หน้า devices ไม่ครบ");
  ok(bad.length === 0, bad.slice(0, 5).join(" · "));
}, "MAJOR");
await st("S-6", "คอมโพเนนต์สาธารณะไม่อ้างชื่อ/เบอร์ลูกค้า (customerName/customerPhone/showCustomerName) · ไม่ฮาร์ดโค้ดคีย์ค่าตั้ง booking.* ใน tsx ใหม่", () => {
  const bad: string[] = [];
  for (const f of [F.compTv, F.compKiosk, F.compTicket, F.pageTv, F.pageKiosk, F.pageTicket]) {
    const s = stripComments(src(f));
    if (!s) { bad.push(`ไม่มี ${f}`); continue; }
    if (/customerName|customerPhone|showCustomerName/.test(s)) bad.push(`${f}: อ้าง PII`);
    if (/["']booking\.(display|kiosk|queue)\./.test(s)) bad.push(`${f}: คีย์ค่าตั้ง`);
  }
  ok(bad.length === 0, bad.join(" · "));
}, "MAJOR");
await st("S-7", "ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/.getMinutes/.getDate/.getMonth/.getFullYear) ในไฟล์ใหม่", () => {
  const files = [F.pub, F.dev, F.actPub, F.compTv, F.compKiosk, F.compTicket, F.compDevices];
  const miss = files.filter((f) => !existsSync(join(ROOT, f)));
  ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  const bad: string[] = [];
  for (const f of files) src(f).split("\n").forEach((l, i) => { if (/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)/.test(l.replace(/\/\/.*$/, ""))) bad.push(`${f}:${i + 1}`); });
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
}, "MAJOR");
await st("S-8", "public-line.ts: CAS (ไม่มี .appointment.update( / .queueTicket.update() · rate limit ด้วย checkRateLimitDb (ไม่มี Map ในหน่วยความจำ) · HMAC timing-safe · devices.ts: randomBytes(32) + \"sha256:\" · ไม่ log token", () => {
  const p = stripComments(src(F.pub));
  ok(!!p, `ยังไม่มี ${F.pub}`);
  ok(!/\.(appointment|queueTicket)\.update\s*\(/.test(p), "มี .update( แบบไม่ CAS");
  ok(/checkRateLimitDb/.test(p) && !/new\s+Map\s*<[^>]*number/.test(p), "rate limit");
  ok(/timingSafeEqual/.test(p) && /createHmac/.test(p), "HMAC timing-safe");
  const d = stripComments(src(F.dev));
  ok(!!d, `ยังไม่มี ${F.dev}`);
  ok(/randomBytes\s*\(\s*32\s*\)/.test(d) && /["'`]sha256:/.test(d), "token/การเก็บ");
  for (const s of [p, d]) ok(!/console\.(log|info|warn|error)\([^)]*token/i.test(s), "log token");
}, "MAJOR");
await st("S-9", "core-fix settings/service.ts: เพิ่มบรรทัดเท่านั้น · บรรทัดเพิ่มทุกบรรทัดเกี่ยว DEVICE/queueDisplay/deviceId (หรือวงเล็บ) · ไม่แตะ actions/template/form/types/registry", () => {
  eq(dirty(["src/lib/core/settings/actions.ts", "src/lib/core/settings/template.ts", "src/lib/core/settings/form.ts", "src/lib/core/settings/types.ts", "src/lib/core/settings/registry.ts", "src/lib/core/settings/defs"]), [], "ไฟล์เครื่องยนต์อื่น");
  const d = spawnSync("git", ["diff", "-U0", "HEAD", "--", F.settingsSvc], { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
  const lines = d.split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  ok(lines.length > 0, "ยังไม่มี core-fix (service.ts ไม่ถูกแก้)");
  const removed = lines.filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
  const badRemoved = removed.filter((l) => !/SUPPORTED_SCOPES|Promise\.all|const \[/.test(l));
  ok(removed.length <= 3 && badRemoved.length === 0, `ลบ/แก้ ${removed.length} บรรทัด: ${(badRemoved[0] ?? removed[0])?.slice(0, 80)}`);
  const off = lines.filter((l) => l.startsWith("+")).map((l) => l.slice(1).trim()).filter((l) => l && !/^(\/\/|\*|\/\*)/.test(l) && !/^[{}()[\];,.]+$/.test(l) && !/DEVICE|queueDisplay|deviceId|\bdv\b|devices?\b|jobs\.push\(|Promise\.all|^const \[/i.test(l));
  ok(off.length === 0, `บรรทัดเพิ่มที่ไม่เกี่ยว DEVICE: ${off.slice(0, 2).join(" | ").slice(0, 160)}`);
}, "CRITICAL");
await st("S-10", "TodayLine.tsx: ปุ่ม \"จอทีวี\" เป็นลิงก์ /booking/devices (ไม่ disabled แล้ว) · แก้ไม่เกิน 8 บรรทัด", () => {
  const s = src(F.todayLine);
  ok(!/disabled[^>]*จอทีวีเปิดใช้ในขั้นถัดไป|จอทีวีเปิดใช้ในขั้นถัดไป[^>]*disabled/.test(s), "ปุ่มยัง disabled");
  ok(/\/booking\/devices/.test(s), "ไม่มีลิงก์ /booking/devices");
  const d = spawnSync("git", ["diff", "-U0", "HEAD", "--", F.todayLine], { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
  const n = d.split("\n").filter((l) => /^[+-](?![+-])/.test(l)).length;
  ok(n <= 8, `แก้ ${n} บรรทัด`);
}, "MINOR");
await st("S-11", "queue/actions.ts: createDisplayAction + revokeDisplayAction ผ่าน ticketCtxOf (หน่วย QUEUE เท่านั้น) · queue/service.ts getTicketStatus/getDisplaySnapshot ปิดแถวเดียว (refType APPOINTMENT · settings.kind)", () => {
  const a = stripComments(src(F.queueActions));
  const bodyOf = (re: RegExp) => { const i = a.search(re); if (i < 0) return null; const j = a.slice(i + 10).search(/\nexport\s/); return a.slice(i, j < 0 ? a.length : i + 10 + j); };
  for (const n of ["createDisplayAction", "revokeDisplayAction"]) {
    const b = bodyOf(new RegExp(`export\\s+async\\s+function\\s+${n}\\b`));
    ok(!!b && /ticketCtxOf\s*\(/.test(b) && !/\bctxOf\s*\(/.test(b.replace(/ticketCtxOf/g, "")), `${n} ไม่ผ่าน ticketCtxOf`);
  }
  const sq = stripComments(src(F.queue));
  const fnBody = (name: string) => { const i = sq.search(new RegExp(`export\\s+async\\s+function\\s+${name}\\b`)); return i < 0 ? "" : sq.slice(i, i + 1600); };
  ok(/APPOINTMENT/.test(fnBody("getTicketStatus")), "getTicketStatus ไม่กันบัตรแถวเดียว");
  ok(/kind/.test(fnBody("getDisplaySnapshot")), "getDisplaySnapshot ไม่กันอุปกรณ์ B.6");
}, "MAJOR");

// ═══════════════ G. regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression (b.5 · b.4 · b.11 · คิวสาธารณะ · smoke) ──");
const judgeSvc = (allowSkip: (id: string) => boolean, allowFail: (id: string) => boolean = () => false) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed: string[]; skipped?: string[] };
  return j.failed.every(allowFail) && (j.skipped ?? []).every(allowSkip);
};
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.5", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|E|V|Q|G)-/.test(x) || x === "S-1"), note: "ไม่มี FAIL · SKIP เฉพาะ H/E/V/Q/G/S-1" },
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1"), note: "ไม่มี FAIL · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.11", args: ["--no-regression"], judge: judgeSvc((x) => /^(V|Q|G)-/.test(x), (x) => x === "S-8"), note: "ไม่มี FAIL ยกเว้น S-8 (core-fix service.ts ยังไม่ commit — Q1) · SKIP เฉพาะ V/Q/G" },
  { s: "qc-queue-public" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof pubLoad.mod?.loadTvView === "function" && typeof devLoad.mod?.createDevice === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (public-line.loadTvView / devices.createDevice) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B6_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b6-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.6 · ตู้ · ทีวี · หน้าบัตร =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: H-* / V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
