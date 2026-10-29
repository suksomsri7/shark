// QC — SVC B.5 · จอคิววันนี้แถวเดียว (ภาพ จอง 01) · มือถือช่าง "ของฉัน" · ปฏิทินรายวันตามคน · ข้าม/เรียกคืน/ย้ายช่าง · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.5.md (§3 สัญญา · §4 DOM · §6 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว B.5
//        ledger/DESIGN-BOOKING-QUEUE.md R5 R6(ย่อ) §7 (ช่างเห็นงานตัวเอง+แถวรวม) · ภาคผนวก ก #43 · ภาพ ledger/design-booking/01-today-line.png (+ README ฉาก 14:20)
//        ใบ B.4 §7 (หนี้ส่งต่อ) · /root/svc-runs/fix/b4.md (ถอย ARRIVED · นัด manualHold ข้ามเที่ยงคืน)
//
// กลุ่มข้อ:
//   T   แม่แบบ BARBER · F ฉากภาพ 01 ทั้งวันผ่าน facade ของ B.3/B.4 (ตาราง SQC_TODAY_LINE_SCENE · now ฉีด)
//   C0  ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ฉากสร้างได้ · เลขบัตร P001–P006/A001–A011 · runPlanner 14:20 ให้ตัวเลขตามภาพ · คุณต่อ LATE
//   P   สิทธิ์: คีย์ใหม่ใน core/permissions.ts + ป้ายไทย · lineAccess (pure) ตามบทบาท
//   L   ตัวโหลดจอ loadTodayLine / loadDayCalendar (ข้อมูลภาพ 01: ตารางช่าง · เส้นตอนนี้ · กรอบฟ้า · แถวรอ · ทำไม · ต้องจัดการ · ตัวเลขบน)
//   A   ปุ่มต่อบทบาท (เจ้าของ · ช่างแจ๊ค job.run · แคชเชียร์ · ไม่มีสิทธิ์) · ไม่มีเบอร์เต็มในข้อมูลของพนักงาน · authorizeLineOp · myStaffIds
//   U   คอมโพเนนต์ (renderToStaticMarkup) TodayLine · MyQueue · DayCalendar ตามสัญญา DOM §4
//   H   server จริง (QC_BASE): หน้าตามบทบาท · ไม่มีเบอร์ใน HTML/RSC · /queue ของหน่วย BOOKING ⇒ /booking · E ปุ่มทุกปุ่มเปลี่ยนสถานะจริง (puppeteer)
//   O   งานใหม่: ข้าม/เรียกคืน (#43) + ข้ามเองหลังเรียกแล้วไม่มา (tick) · ย้ายช่าง · หนี้ B.4 (ถอย ARRIVED · นัด manualHold หลังเที่ยงคืน) · X1
//   S   ไฟล์/สัญญาโค้ด (action มีด่านสิทธิ์+เจ้าของงาน · หน้าเดิมของร้านที่ไม่เปิดแถวเดียว · WARN ริบมัดจำ · action คิวเดิม)
//   Q   ฉากภาพบนร้าน svcqc (scripts/svc-qc-today-line-scene.mts) · V ภาพ (QC_BASE) · G regression · Z ล้างข้อมูล
//
// เวลา: วันฉาก = sqcLineSceneDate(วันนี้ไทย) (เสาร์ ≥ วันนี้+3) · now ฉีดเข้าทุกฟังก์ชัน · tick ส่ง tenantIds เสมอ (ห้ามแตะ seed)
// ร้านทดสอบ slug `qc-svc-b5-*` · ผู้ใช้ `qc-svc-b5-*@qc.invalid` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.5.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้อาร์กิวเมนต์ · QC_BASE=http://127.0.0.1:<port> เปิดหมวด H/E/V)
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import {
  SQC, SQC_TODAY_LINE_SCENE as SCENE, SQC_VISUAL_SPECS, sqcLineSceneDate,
  type SqcLineStaffKey,
} from "./svc-qc-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-b.5";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B5_NO_REGRESSION === "1";
const F = {
  today: "src/lib/modules/booking/today-line.ts",
  access: "src/lib/modules/booking/line-access.ts",
  ops: "src/lib/modules/booking/line-ops.ts",
  line: "src/lib/modules/booking/queue-line.ts",
  run: "src/lib/modules/booking/planner-run.ts",
  service: "src/lib/modules/booking/service.ts",
  index: "src/lib/modules/booking/index.ts",
  planner: "src/lib/modules/booking/planner.ts",
  queue: "src/lib/modules/queue/service.ts",
  queueActions: "src/lib/modules/queue/actions.ts",
  actions: "src/lib/actions/booking-line.ts",
  bookingActions: "src/lib/actions/booking.ts",
  perms: "src/lib/core/permissions.ts",
  page: "src/app/app/u/[unitSlug]/booking/page.tsx",
  layout: "src/app/app/u/[unitSlug]/booking/layout.tsx",
  dayPage: "src/app/app/u/[unitSlug]/booking/day/page.tsx",
  minePage: "src/app/app/u/[unitSlug]/booking/mine/page.tsx",
  queuePage: "src/app/app/u/[unitSlug]/queue/page.tsx",
  compLine: "src/components/booking/TodayLine.tsx",
  compMine: "src/components/booking/MyQueue.tsx",
  compDay: "src/components/booking/DayCalendar.tsx",
  scene: "scripts/svc-qc-today-line-scene.mts",
} as const;
const NEW_KEYS = ["booking.queue.operate", "booking.checkin", "booking.walkin.create", "booking.job.run", "booking.job.runAny"] as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc (ep-mute-scene) ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type LineAction = "call" | "recall" | "skip" | "start" | "done" | "move" | "checkin" | "noshow" | "cancel";
type LineAccess = { view: boolean; operate: boolean; checkIn: boolean; walkIn: boolean; runOwn: boolean; runAny: boolean; fullPhone: boolean };
type LineMember = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
type LineViewer = { userId: string; access: LineAccess };
type LineJob = {
  appointmentId: string; kind: "BOOKED" | "WALKIN"; status: string; assignMode: "SPECIFIC" | "ANY";
  ticketNumber: string | null; ticketStatus: string | null; label: string; serviceName: string;
  staffId: string | null; staffName: string | null; bookedStartMs: number | null; plannedStartMs: number | null; plannedEndMs: number | null;
  waitMin: number | null; waitedMin: number | null; whyText: string | null; phoneMasked: string | null; phone: string | null; mine: boolean; actions: LineAction[];
};
type LineBlock = { appointmentId: string; staffId: string; look: "now" | "arrived" | "booked" | "placed" | "noshow" | "done"; startMs: number; endMs: number; ticketNumber: string | null; label: string };
type LineTodo = { appointmentId: string; kind: "LATE" | "SOON" | "STALE"; title: string; detail: string; actions: LineAction[]; phone: string | null };
type Kpi = { booked: number; arrived: number; absent: number; upcoming: number; walkIns: number; walkInsLeft: number; waiting: number; longestWaitMin: number | null; longestWaitTicket: string | null; done: number };
type TodayLineView = {
  unitId: string; dayStr: string; nowMs: number; openMin: number | null; closeMin: number | null; axisStartMs: number; axisEndMs: number;
  kpi: Kpi; staff: { staffId: string; name: string; seat: number; mine: boolean; blocks: LineBlock[] }[];
  waiting: LineJob[]; inService: LineJob[]; skipped: LineJob[]; todo: LineTodo[];
  why: { appointmentId: string; ticketNumber: string | null; staffName: string | null; startMs: number | null; text: string } | null;
  access: LineAccess; myStaffIds: string[];
  walkInForm: { services: { id: string; name: string; durationMin: number }[]; staff: { id: string; name: string }[] } | null;
};
type CalBlock = { appointmentId: string; startMs: number; endMs: number; status: string; label: string; ticketNumber: string | null };
type DayCalendarView = { unitId: string; dateStr: string; prevDateStr: string; nextDateStr: string; openMin: number | null; closeMin: number | null; staff: { staffId: string; name: string; blocks: CalBlock[] }[] };
type AuthRes = { ok: true } | { ok: false; code: "FORBIDDEN" | "NOT_FOUND"; reason: string };
type NowOpt = { now?: Date };
type TodayApi = {
  loadTodayLine?: (ctx: Ctx, viewer: LineViewer, opts?: NowOpt) => Promise<TodayLineView | null>;
  loadDayCalendar?: (ctx: Ctx, viewer: LineViewer, opts: { dateStr: string; now?: Date }) => Promise<DayCalendarView | null>;
  authorizeLineOp?: (ctx: Ctx, viewer: LineViewer, op: LineAction | "walkin", appointmentId: string | null, opts?: NowOpt) => Promise<AuthRes>;
  myStaffIds?: (ctx: Ctx, userId: string) => Promise<string[]>;
};
type AccessApi = { lineAccess?: (m: LineMember | null, unitId: string) => LineAccess };
type JobFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE" | "BUSY" | "CLASH";
type JobResult = { ok: true } | { ok: false; code: JobFail; reason: string };
type MoveFail = JobFail | "FULL" | "ON_LEAVE" | "NOT_QUALIFIED" | "BAD_INPUT";
type MoveResult = { ok: true } | { ok: false; code: MoveFail; reason: string };
type OpsApi = {
  skipJob?: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  recallJob?: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  moveJobStaff?: (ctx: Ctx, id: string, toStaffId: string, opts?: NowOpt) => Promise<MoveResult>;
};
// ของ B.3/B.4 (มีแล้ว)
type CheckInResult = { ok: true; appointmentId: string; ticketId: string; ticketNumber: string; already: boolean; asWalkIn: boolean } | { ok: false; code: string; reason: string };
type WalkInResult = { ok: true; appointmentId: string; ticketId: string; ticketNumber: string; staffId: string | null; plannedStartAt: Date | null; waitMin: number | null } | { ok: false; code: string; reason: string };
type LineApi = {
  checkIn: (ctx: Ctx, by: { appointmentId: string }, opts: { via: "STAFF"; now?: Date }) => Promise<CheckInResult>;
  createWalkIn: (ctx: Ctx, i: { serviceId: string; staffId: string | null; channel: "STAFF" }, opts?: NowOpt) => Promise<WalkInResult>;
  callJob: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  startJob: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  completeJob: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  cancelByShop: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
};
type RunApi = {
  runPlanner: (ctx: { tenantId: string; unitId: string }, opts?: NowOpt) => Promise<{ ran: boolean; planned: number }>;
  runLineTick: (now: Date, opts?: { tenantIds?: string[] }) => Promise<{ late: number; noShow: number; endOfDay: number; units: number; skipped?: number }>;
};
type BookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: "STAFF"; customerName: string; customerPhone: string; idempotencyKey?: string };
type BookingApi = {
  bookAppointment: (ctx: Ctx, i: BookInput) => Promise<{ ok: true; id: string; staffId: string; status: "PENDING" | "CONFIRMED" } | { ok: false; code: string; reason: string }>;
  setAppointmentStatus: (tenantId: string, unitId: string, id: string, status: "PENDING" | "CONFIRMED" | "ARRIVED" | "DONE" | "NO_SHOW" | "CANCELLED") => Promise<{ ok: boolean; reason?: string }>;
};
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type SettingsApi = {
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<{ ok: boolean; code?: string; issues?: unknown }>;
};
type PermApi = { isPermissionKey?: (k: string) => boolean; permissionLabel?: (k: string) => string };

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
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * 60_000; };
const hm = (s: string): number => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const at = (ds: string, s: string | number): Date => new Date(bkkMs(ds, typeof s === "number" ? s : hm(s)));
const hhmm = (ms: number | null | undefined) => (ms == null ? "null" : new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");

// ═══════════════ โหลดโมดูล ═══════════════
const loadIf = async <T,>(rel: string) => (existsSync(join(ROOT, rel)) ? tryImport<T>(pathToFileURL(join(ROOT, rel)).href) : { mod: null as T | null, err: `ยังไม่มีไฟล์ «${rel}»` });
const todayLoad = await loadIf<TodayApi>(F.today);
const accessLoad = await loadIf<AccessApi>(F.access);
const opsLoad = await loadIf<OpsApi>(F.ops);
const lineLoad = await tryImport<LineApi>("@/lib/modules/booking/queue-line");
const runLoad = await tryImport<RunApi>("@/lib/modules/booking/planner-run");
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const settingsLoad = await tryImport<SettingsApi>("@/lib/core/settings");
const permLoad = await tryImport<PermApi>("@/lib/core/permissions");
const fnOf = <Fn,>(load: { mod: unknown; err: string }, name: string, rel: string): Fn => {
  const f = (load.mod as Record<string, unknown> | null)?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as Fn;
};
const TL = {
  load: () => fnOf<NonNullable<TodayApi["loadTodayLine"]>>(todayLoad, "loadTodayLine", F.today),
  cal: () => fnOf<NonNullable<TodayApi["loadDayCalendar"]>>(todayLoad, "loadDayCalendar", F.today),
  auth: () => fnOf<NonNullable<TodayApi["authorizeLineOp"]>>(todayLoad, "authorizeLineOp", F.today),
  mine: () => fnOf<NonNullable<TodayApi["myStaffIds"]>>(todayLoad, "myStaffIds", F.today),
  access: () => fnOf<NonNullable<AccessApi["lineAccess"]>>(accessLoad, "lineAccess", F.access),
  skip: () => fnOf<NonNullable<OpsApi["skipJob"]>>(opsLoad, "skipJob", F.ops),
  recall: () => fnOf<NonNullable<OpsApi["recallJob"]>>(opsLoad, "recallJob", F.ops),
  move: () => fnOf<NonNullable<OpsApi["moveJobStaff"]>>(opsLoad, "moveJobStaff", F.ops),
};
const LN = (): LineApi => { if (!lineLoad.mod) throw new AssertFail(`โหลด queue-line ไม่ได้ (${lineLoad.err})`); return lineLoad.mod; };
const RN = (): RunApi => { if (!runLoad.mod) throw new AssertFail(`โหลด planner-run ไม่ได้ (${runLoad.err})`); return runLoad.mod; };
const BK = (): BookingApi => { if (!bookingLoad.mod) throw new AssertFail(`โหลด booking/service ไม่ได้ (${bookingLoad.err})`); return bookingLoad.mod; };
const SETTINGS = (): SettingsApi => { if (!settingsLoad.mod) throw new AssertFail(`โหลด core/settings ไม่ได้ (${settingsLoad.err})`); return settingsLoad.mod; };

// คอมโพเนนต์ (renderToStaticMarkup)
type Comp = (props: Record<string, unknown>) => unknown;
const compOf = async (rel: string, name: string): Promise<{ c: Comp | null; why: string }> => {
  if (!existsSync(join(ROOT, rel))) return { c: null, why: `ยังไม่มี ${rel}` };
  const r = await tryImport<Record<string, unknown>>(pathToFileURL(join(ROOT, rel)).href);
  if (!r.mod) return { c: null, why: `import ${rel} ล้ม: ${r.err}` };
  const c = typeof r.mod.default === "function" ? r.mod.default : typeof r.mod[name] === "function" ? r.mod[name] : null;
  return c ? { c: c as Comp, why: "" } : { c: null, why: `${rel} ไม่มี default export ที่เป็นคอมโพเนนต์` };
};
const LineC = await compOf(F.compLine, "TodayLine");
const MineC = await compOf(F.compMine, "MyQueue");
const DayC = await compOf(F.compDay, "DayCalendar");
type ReactLike = { createElement: (c: Comp, p: Record<string, unknown>) => unknown };
type RdsLike = { renderToStaticMarkup: (el: unknown) => string };
const React = (await import("react" as string)) as unknown as ReactLike;
const RDS = (await import("react-dom/server" as string)) as unknown as RdsLike;
const noopAction = async (_fd: FormData) => { void _fd; };
const ACTIONS: Record<string, (fd: FormData) => Promise<void>> = Object.fromEntries(
  ["call", "recall", "skip", "start", "done", "move", "checkin", "noshow", "cancel", "walkin"].map((k) => [k, noopAction]),
);
const render = (c: { c: Comp | null; why: string }, props: Record<string, unknown>): string => {
  if (!c.c) throw new AssertFail(c.why);
  return String(RDS.renderToStaticMarkup(React.createElement(c.c, { unitSlug: "qc-b5", actions: ACTIONS, ...props }))).replace(/<!-- -->/g, "");
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
/** ปุ่มงาน: [data-line-action] ทุกตัว + ฟอร์มที่ครอบ (มี input appointmentId ตรง id) */
function actionButtons(html: string): { action: string; id: string; inForm: boolean; form: string }[] {
  const forms = boxes(html, "action").filter((b) => /^<form\b/.test(b.html));
  const formSpans = [...new Map(forms.map((f) => [f.at, f])).values()].map((f) => ({ s: f.at, e: f.at + f.html.length, html: f.html }));
  return boxes(html, "data-line-action").map((b) => {
    const id = b.attrs["data-appointment-id"] ?? "";
    const f = formSpans.filter((x) => x.s <= b.at && b.at < x.e).sort((a, c) => c.s - a.s)[0];
    const inForm = !!f && new RegExp(`name="appointmentId"[^>]*value="${id}"|value="${id}"[^>]*name="appointmentId"`).test(f.html);
    return { action: b.attrs["data-line-action"] ?? "", id, inForm, form: f?.html ?? "" };
  });
}
const digitsIn = (s: string) => (s.match(/\d/g) ?? []).length;

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb5_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const SLUG = "qc-svc-b5-";
const USER_MAIL = "qc-svc-b5-";
const UA = "qc-svc-b5";
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
async function cleanupUsers() {
  try {
    await pool.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}

// ═══════════════ ข้อมูลทดสอบ ═══════════════
const RUN = Date.now().toString(36);
const TODAY = bkkToday();
const D = sqcLineSceneDate(TODAY);          // วันฉาก (เสาร์ ≥ วันนี้+3)
const DH = addDays(D, 7);                   // หน่วย manualHold (นัด 23:00 · เช็กอินหลังเที่ยงคืน)
const DR = addDays(D, 14);                  // หน่วยถอย ARRIVED
const NOW = at(D, SCENE.now);
const T = (k: string) => `svcb5_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tB: T("tB"),
  uS: T("uS"), uR: T("uR"), uH: T("uH"), uLeg: T("uLeg"), uB: T("uB"),
  hr: T("hr"), emp: T("emp"),
  R1: T("R1"), RS: T("RS"), H1: T("H1"), H2: T("H2"), HS: T("HS"), L1: T("L1"), LS: T("LS"), B1: T("B1"), BS: T("BS"),
  uOwner: T("owner"), uJack: T("jack"), uCash: T("cash"), uPlain: T("plain"), uLead: T("lead"), uNobody: T("nobody"), uMgrR: T("mgrR"), uOwnerB: T("ownerB"),
};
const STAFF: Record<SqcLineStaffKey, string> = { ek: T("ek"), boy: T("boy"), nun: T("nun"), jack: T("jack") };
const STAFF_NAME: Record<SqcLineStaffKey, string> = { ek: "ช่างเอก", boy: "ช่างบอย", nun: "ช่างนุ่น", jack: "ช่างแจ๊ค" };
const SVC: Record<string, string> = Object.fromEntries(SQC.barber.services.map((s) => [s.sku, T(s.sku.replace(/\W/g, ""))]));
const cS: Ctx = { tenantId: ids.tA, unitId: ids.uS };
const cR: Ctx = { tenantId: ids.tA, unitId: ids.uR };
const cH: Ctx = { tenantId: ids.tA, unitId: ids.uH };
const cLeg: Ctx = { tenantId: ids.tA, unitId: ids.uLeg };
const cBwithS: Ctx = { tenantId: ids.tB, unitId: ids.uS }; // X1: ร้าน B อ้างหน่วยของร้าน A
const OWNER_ACTOR: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.uOwner };
const SLUGS: Record<string, string> = {};

/** สิทธิ์ที่คาด (ใบสั่ง §3.1) — ใช้เป็น viewer ของตัวโหลด (ไม่พึ่ง lineAccess · ให้ L/A แดงเพราะตัวโหลดเอง) */
const ACC = {
  owner: { view: true, operate: true, checkIn: true, walkIn: true, runOwn: true, runAny: true, fullPhone: true },
  jack: { view: true, operate: false, checkIn: false, walkIn: false, runOwn: true, runAny: false, fullPhone: false },
  cashier: { view: true, operate: false, checkIn: true, walkIn: true, runOwn: false, runAny: false, fullPhone: false },
  lead: { view: true, operate: true, checkIn: false, walkIn: false, runOwn: false, runAny: false, fullPhone: false },
  nobody: { view: false, operate: false, checkIn: false, walkIn: false, runOwn: false, runAny: false, fullPhone: false },
} satisfies Record<string, LineAccess>;
const V = {
  owner: { userId: ids.uOwner, access: ACC.owner },
  jack: { userId: ids.uJack, access: ACC.jack },
  plain: { userId: ids.uPlain, access: ACC.jack }, // job.run แต่ไม่ผูกช่าง
  cashier: { userId: ids.uCash, access: ACC.cashier },
  lead: { userId: ids.uLead, access: ACC.lead },
  nobody: { userId: ids.uNobody, access: ACC.nobody },
} satisfies Record<string, LineViewer>;
const PHONES = SCENE.bookings.map((b) => b.phone);
const dashed = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
const phoneLeak = (s: string): string[] => PHONES.filter((p) => s.includes(p) || s.includes(dashed(p)) || s.includes(`+66${p.slice(1)}`));

const fx: Record<string, string> = {};       // คีย์ฉาก (P001 · A009 · BEAM …) → appointmentId
const keyOf = (id: string) => Object.entries(fx).find(([, v]) => v === id)?.[0] ?? id;
let setupOk = false;
let tplOk = false;
let sceneOk = false;
const views: Partial<Record<"owner" | "jack" | "cashier", TodayLineView>> = {};

console.log(`\n(วันนี้ไทย ${TODAY} · วันฉาก ${D} ${SCENE.now} · หน่วย manualHold ${DH} · ถอย ARRIVED ${DR})`);

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();

  // ── สร้างข้อมูล ──
  try {
    for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) {
      SLUGS[id] = `${SLUG}${n}-${RUN}`;
      await insertRow("Tenant", { id, name: `QC B5 ร้าน ${n}`, slug: SLUGS[id], updatedAt: new Date() });
    }
    const units: [string, string, string, number, number][] = [
      [ids.uS, ids.tA, "scene", 600, 1200], [ids.uR, ids.tA, "revert", 600, 1200], [ids.uH, ids.tA, "hold", 0, 1440], [ids.uLeg, ids.tA, "legacy", 600, 1200], [ids.uB, ids.tB, "b", 600, 1200],
    ];
    for (const [id, t, n, o, c] of units) {
      SLUGS[id] = `b5-${n}-${RUN}`;
      await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `สาขา ${n}`, slug: SLUGS[id], updatedAt: new Date() });
      for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: o, closeMin: c, closed: false, updatedAt: new Date() });
    }
    for (const s of SQC.barber.services) {
      await insertRow("BookingService", { id: SVC[s.sku], tenantId: ids.tA, unitId: ids.uS, name: s.name, durationMin: s.durationMin, priceSatang: s.priceSatang, bufferMin: s.bufferMin, depositSatang: s.depositSatang, bookable: true, sortOrder: 0, updatedAt: new Date() });
    }
    for (const [id, t, u] of [[ids.RS, ids.tA, ids.uR], [ids.HS, ids.tA, ids.uH], [ids.LS, ids.tA, ids.uLeg], [ids.BS, ids.tB, ids.uB]] as const) {
      await insertRow("BookingService", { id, tenantId: t, unitId: u, name: "ตัดผมชาย", durationMin: 45, priceSatang: 25000, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    }
    let ord = 0;
    const staff = async (id: string, t: string, u: string, name: string, sortOrder: number) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    for (const [i, k] of (["ek", "boy", "nun", "jack"] as SqcLineStaffKey[]).entries()) await staff(STAFF[k], ids.tA, ids.uS, STAFF_NAME[k], i + 1);
    for (let w = 0; w < 7; w++) await insertRow("BookingStaffHours", { id: rid("sh"), tenantId: ids.tA, unitId: ids.uS, staffId: STAFF.jack, weekday: w, startMin: 780, endMin: 1200 });
    await staff(ids.R1, ids.tA, ids.uR, "ช่างอาร์", 1);
    await staff(ids.H1, ids.tA, ids.uH, "ช่างเอช 1", 1);
    await staff(ids.H2, ids.tA, ids.uH, "ช่างเอช 2", 2);
    await staff(ids.L1, ids.tA, ids.uLeg, "ช่างร้านเดิม", 1);
    await staff(ids.B1, ids.tB, ids.uB, "ช่างร้าน B", 1);
    // HR: ผู้ใช้ "ช่างแจ๊ค" ผูกพนักงาน → BookingStaff ช่างแจ๊ค (ของฉัน · เจ้าของงาน)
    await insertRow("AppSystem", { id: ids.hr, tenantId: ids.tA, type: "HR", name: "ทีมงาน QC B5", updatedAt: new Date() });
    await insertRow("HrEmployee", { id: ids.emp, tenantId: ids.tA, systemId: ids.hr, name: "ช่างแจ๊ค", linkedUserId: ids.uJack, updatedAt: new Date() });
    await q(`UPDATE "BookingStaff" SET "employeeId" = $2 WHERE id = $1`, [STAFF.jack, ids.emp]);
    // ผู้ใช้ + membership (หมวด H/E ใช้ session จริง)
    const users: [string, string, string, string, string[], Record<string, boolean>][] = [
      [ids.uOwner, "owner", ids.tA, "OWNER", ["*"], {}],
      [ids.uJack, "jack", ids.tA, "STAFF", [ids.uS], { "booking.job.run": true }],
      [ids.uCash, "cash", ids.tA, "STAFF", [ids.uS], { "booking.checkin": true, "booking.walkin.create": true }],
      [ids.uLead, "lead", ids.tA, "STAFF", [ids.uS], { "booking.queue.operate": true }],
      [ids.uPlain, "plain", ids.tA, "STAFF", [ids.uS], { "booking.job.run": true }],
      [ids.uNobody, "nobody", ids.tA, "STAFF", [ids.uS], {}],
      [ids.uMgrR, "mgrr", ids.tA, "MANAGER", [ids.uR], {}],
      [ids.uOwnerB, "ownerb", ids.tB, "OWNER", ["*"], {}],
    ];
    for (const [uid, k, t, role, ua, perms] of users) {
      await insertRow("User", { id: uid, email: `${USER_MAIL}${k}-${RUN}@qc.invalid`, name: `QC B5 ${k}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid("mb"), userId: uid, tenantId: t, role, unitAccess: JSON.stringify(ua), permissions: JSON.stringify(perms), acceptedAt: new Date(), updatedAt: new Date() });
    }
    setupOk = true;
  } catch (e) {
    console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`);
  }
  const need = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");

  console.log("\n── T/F: แม่แบบ + ฉากภาพ 01 ──");
  await st("T-0", "applyTemplate BARBER (แถวเดียว · ผ่อนผัน 10 · ไม่มา 30 · ข้ามหลังเรียก 10) ที่หน่วยฉาก/ถอย/manualHold/ร้าน B · หน่วย legacy ไม่เลือกแม่แบบ", async () => {
    need();
    for (const [t, u] of [[ids.tA, ids.uS], [ids.tA, ids.uR], [ids.tA, ids.uH], [ids.tB, ids.uB]] as const) {
      const actor = t === ids.tB ? { ...OWNER_ACTOR, userId: ids.uOwnerB } : OWNER_ACTOR;
      const a = await SETTINGS().applyTemplate(actor, { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
      ok(a.ok, `applyTemplate ${u}: ${a.code} ${fmt(a.issues)}`);
    }
    tplOk = true;
  });
  const needTpl = () => { need(); ok(tplOk, "ตั้งแม่แบบไม่สำเร็จ (T-0)"); };

  /** ฉากภาพ 01 ทั้งวัน (ตาราง SQC_TODAY_LINE_SCENE) ผ่าน facade ของ B.3/B.4 — ตัวเดียวกับที่ scripts/svc-qc-today-line-scene.mts ต้องทำบนร้าน svcqc */
  await st("F-0", `ฉากภาพ 01 วัน ${D}: นัด 14 (bookAppointment STAFF) + เหตุการณ์ ${SCENE.events.length} ขั้นตามเวลา (เช็กอิน · walk-in · เริ่ม · เสร็จ · ลุกกลับ · tick) → runPlanner ${SCENE.now}`, async () => {
    needTpl();
    for (const b of SCENE.bookings) {
      const r = await BK().bookAppointment(cS, {
        serviceId: SVC[b.sku], staffId: b.staff ? STAFF[b.staff] : null, dateStr: D, startMin: hm(b.start), channel: "STAFF",
        customerName: b.name, customerPhone: b.phone, idempotencyKey: `${RUN}-${b.key}`,
      });
      if (!r.ok) throw new AssertFail(`จอง ${b.key} ${b.start} ล้ม ${r.code} ${r.reason}`);
      fx[b.key] = r.id;
      if (r.status === "PENDING") {
        const c = await BK().setAppointmentStatus(cS.tenantId, cS.unitId, r.id, "CONFIRMED");
        ok(c.ok, `ยืนยัน ${b.key}: ${c.reason}`);
      }
    }
    for (const ev of SCENE.events) {
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
        : await LN().cancelByShop(cS, id, { now });
      if (!r.ok) throw new AssertFail(`${where}: ${r.code} ${r.reason}`);
    }
    await RN().runPlanner(cS, { now: NOW });
    sceneOk = true;
  });
  const needScene = () => { needTpl(); ok(sceneOk, "สร้างฉากภาพ 01 ไม่สำเร็จ (F-0)"); };

  // ═══════════════ C0 ตัวควบคุม ═══════════════
  console.log("\n── C0: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  type ApRow = { id: string; status: string; kind: string; assignMode: string; staffId: string; startAt: Date; endAt: Date; checkedInAt: Date | null; plannedStaffId: string | null; plannedStartAt: Date | null; queueTicketId: string | null; customerPhone: string; policySnapshot: unknown };
  const apRow = async (id: string): Promise<ApRow> => {
    const [r] = await q<ApRow>(`SELECT id, status::text AS status, kind, "assignMode", "staffId", "startAt", "endAt", "checkedInAt", "plannedStaffId", "plannedStartAt", "queueTicketId", "customerPhone", "policySnapshot" FROM "Appointment" WHERE id = $1`, [id]);
    if (!r) throw new AssertFail(`ไม่พบนัด ${id}`);
    return r;
  };
  type TkRow = { id: string; status: string; number: string; callCount: number; calledAt: Date | null; skippedAt: Date | null; cancelReason: string | null };
  const tkRow = async (id: string | null): Promise<TkRow> => {
    ok(!!id, "ไม่มีบัตร");
    const [r] = await q<TkRow>(`SELECT id, status::text AS status, number, "callCount", "calledAt", "skippedAt", "cancelReason" FROM "QueueTicket" WHERE id = $1`, [id]);
    if (!r) throw new AssertFail(`ไม่พบบัตร ${id}`);
    return r;
  };
  const tkOf = async (key: string) => tkRow((await apRow(fx[key])).queueTicketId);
  const planOf = async (key: string) => { const r = await apRow(fx[key]); return { staff: r.plannedStaffId, start: r.plannedStartAt ? r.plannedStartAt.getTime() : null }; };
  const overlapIn = async (staffId: string): Promise<string[]> => {
    const rows = await q<{ id: string; s: Date; e: Date }>(`SELECT id, "startAt" AS s, "endAt" AS e FROM "Appointment" WHERE "staffId" = $1 AND status NOT IN ('CANCELLED','NO_SHOW','DONE','LATE') ORDER BY "startAt", id`, [staffId]); // LATE = ตัววางคิวปล่อยช่องแล้ว (B.4 startJob ไม่นับ)
    const bad: string[] = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (rows[j].s.getTime() < rows[i].e.getTime() && rows[i].s.getTime() < rows[j].e.getTime()) bad.push(`${keyOf(rows[i].id)}×${keyOf(rows[j].id)}`);
    return bad;
  };

  await st("C0-1", "เลขบัตรตามภาพ: P001–P006 (เช็กอินตามลำดับ) · A001–A011 (walk-in ตามลำดับ) · A003 ลุกกลับ (CANCELLED)", async () => {
    needScene();
    const bad: string[] = [];
    for (const k of ["P001", "P002", "P003", "P004", "P005", "P006", ...Array.from({ length: 11 }, (_, i) => `A${String(i + 1).padStart(3, "0")}`)]) {
      const t = await tkOf(k);
      if (t.number !== k) bad.push(`${k}=${t.number}`);
    }
    ok(bad.length === 0, bad.join(" "));
    eq((await apRow(fx.A003)).status, "CANCELLED", "A003");
  });
  await st("C0-2", `runPlanner ${SCENE.now} ตรงภาพ: A009 แจ๊ค 14:40 · A010 นุ่น 15:00 · A011 แจ๊ค 15:25 · P006 บอย 14:45 · คุณต่อ LATE · กำลังทำ P004 P005 A007 A008 · ไม่มีแถวถือช่องซ้อน`, async () => {
    needScene();
    for (const [k, e] of Object.entries(SCENE.expect.plan)) {
      const p = await planOf(k);
      eq([p.staff, hhmm(p.start)], [STAFF[e.staff], e.start], `แผน ${k}`);
    }
    eq((await apRow(fx.TOR)).status, "LATE", "คุณต่อ");
    for (const k of ["P004", "P005", "A007", "A008"]) eq((await apRow(fx[k])).status, "IN_SERVICE", k);
    eq((await apRow(fx.P006)).status, "ARRIVED", "P006");
    eq((await apRow(fx.BEAM)).staffId, STAFF.ek, "คุณบีม (ใครก็ได้) วางที่ช่างเอก");
    for (const k of Object.keys(STAFF) as SqcLineStaffKey[]) eq(await overlapIn(STAFF[k]), [], `ซ้อน ${k}`);
  });

  await st("C0-3", "ตัวช่วยตรวจของข้อสอบเอง (กันข้อ U/A ผ่านลม ๆ): อ่านปุ่ม [data-line-action] ในฟอร์มที่มี appointmentId จาก renderToStaticMarkup ได้ · ปุ่มนอกฟอร์มถูกจับ · phoneLeak จับ 0810000006 / 081-000-0006 / +66810000006", () => {
    const h = (...c: unknown[]) => (React as unknown as { createElement: (t: string, p: Record<string, unknown> | null, ...c: unknown[]) => unknown }).createElement(...(c as [string, Record<string, unknown> | null, ...unknown[]]));
    const el = h("div", null,
      h("form", { action: noopAction }, h("input", { type: "hidden", name: "appointmentId", value: "X1" }), h("button", { "data-line-action": "call", "data-appointment-id": "X1" }, "เรียก")),
      h("button", { "data-line-action": "start", "data-appointment-id": "X2" }, "เริ่ม"));
    const html = String(RDS.renderToStaticMarkup(el));
    eq(actionButtons(html).map((b) => [b.action, b.id, b.inForm]), [["call", "X1", true], ["start", "X2", false]], "actionButtons");
    eq([phoneLeak("โทร 0810000006").length, phoneLeak("081-000-0006").length, phoneLeak("+66810000006").length, phoneLeak("•••-•••-0006").length], [1, 1, 1, 0], "phoneLeak");
  }, "MAJOR");

  // ═══════════════ P สิทธิ์ ═══════════════
  console.log("\n── P: สิทธิ์ (คีย์ใหม่ + lineAccess) ──");
  await st("P-1", `คีย์ใหม่ใน core/permissions.ts (${NEW_KEYS.join(" · ")}) — isPermissionKey + ป้ายไทย (มีอักษรไทย ≠ ตัวคีย์)`, () => {
    const pm = permLoad.mod;
    ok(!!pm && typeof pm.isPermissionKey === "function" && typeof pm.permissionLabel === "function", `โหลด permissions ไม่ได้ ${permLoad.err}`);
    const bad = NEW_KEYS.filter((k) => !pm!.isPermissionKey!(k) || !/[\u0E00-\u0E7F]/.test(pm!.permissionLabel!(k)) || pm!.permissionLabel!(k) === k);
    ok(bad.length === 0, `ขาด/ไม่มีป้ายไทย: ${bad.join(", ")}`);
  });
  await st("P-2", "lineAccess (pure) ตามบทบาท: เจ้าของ/ผู้จัดการ (มีสาขา) = ทุกข้อ + เบอร์เต็ม · ผู้จัดการไม่มีสาขา = ไม่มีอะไร · ช่าง job.run · แคชเชียร์ (checkin+walkin) · หัวหน้า queue.operate · runAny · booking.* · phoneFull (B.11) · setStatus อย่างเดียว · ไม่มีสิทธิ์", () => {
    const f = TL.access();
    const U = ids.uS;
    const S = (p: Record<string, boolean>): LineMember => ({ role: "STAFF", unitAccess: [U], permissions: p });
    const cases: [string, LineMember | null, LineAccess][] = [
      ["owner", { role: "OWNER", unitAccess: [], permissions: {} }, ACC.owner],
      ["manager", { role: "MANAGER", unitAccess: [U], permissions: {} }, ACC.owner],
      ["manager-other-unit", { role: "MANAGER", unitAccess: ["x"], permissions: {} }, ACC.nobody],
      ["jack", S({ "booking.job.run": true }), ACC.jack],
      ["cashier", S({ "booking.checkin": true, "booking.walkin.create": true }), ACC.cashier],
      ["cashier+phoneFull", S({ "booking.checkin": true, "booking.walkin.create": true, "booking.customer.phoneFull": true }), { ...ACC.cashier, fullPhone: true }],
      ["lead", S({ "booking.queue.operate": true }), ACC.lead],
      ["phoneFull-only", S({ "booking.customer.phoneFull": true }), { ...ACC.nobody, fullPhone: true }],
      ["runAny", S({ "booking.job.runAny": true }), { ...ACC.nobody, view: true, runOwn: true, runAny: true }],
      ["wildcard", S({ "booking.*": true }), ACC.owner],
      ["setStatus", S({ "booking.appointment.setStatus": true }), { ...ACC.nobody, view: true }],
      ["staff-other-unit", { role: "STAFF", unitAccess: ["x"], permissions: { "booking.job.run": true } }, ACC.nobody],
      ["nobody", S({}), ACC.nobody],
      ["null", null, ACC.nobody],
    ];
    const bad = cases.filter(([, m, exp]) => !isDeepStrictEqual(f(m, U), exp)).map(([n, m]) => `${n}=${fmt(f(m, U))}`);
    ok(bad.length === 0, bad.join(" · "));
  });

  // ═══════════════ L ตัวโหลด ═══════════════
  console.log("\n── L: ตัวโหลดจอ (loadTodayLine · loadDayCalendar) ──");
  const loadAs = async (who: "owner" | "jack" | "cashier"): Promise<TodayLineView> => {
    const v = await TL.load()(cS, V[who], { now: NOW });
    ok(!!v, `loadTodayLine(${who}) คืน null`);
    views[who] = v!;
    return v!;
  };
  const viewOf = async (who: "owner" | "jack" | "cashier") => views[who] ?? loadAs(who);
  const allJobs = (v: TodayLineView) => [...v.waiting, ...v.inService, ...v.skipped];
  const jobIn = (v: TodayLineView, key: string): LineJob | undefined => allJobs(v).find((j) => j.appointmentId === fx[key]);
  const actsOf = (v: TodayLineView, key: string): LineAction[] => {
    const j = jobIn(v, key);
    const t = v.todo.filter((x) => x.appointmentId === fx[key]).flatMap((x) => x.actions);
    return [...new Set([...(j?.actions ?? []), ...t])].sort();
  };

  await st("L-0", "ร้านที่ไม่เปิดแถวเดียว (หน่วย legacy) ⇒ null (หน้าใช้จอเดิม) · ร้าน B อ้างหน่วยร้าน A ⇒ null (X1) · viewer ไม่มีสิทธิ์ดู ⇒ null", async () => {
    needScene();
    eq(await TL.load()(cLeg, V.owner, { now: NOW }), null, "legacy");
    eq(await TL.load()(cBwithS, V.owner, { now: NOW }), null, "ข้ามร้าน");
    eq(await TL.load()(cS, V.nobody, { now: NOW }), null, "ไม่มีสิทธิ์");
  });
  await st("L-1", `หัวจอ: dayStr ${D} · nowMs = ${SCENE.now} · เวลาร้าน 10:00–20:00 · แกนเวลามีเส้นตอนนี้ (axisStart ≤ now ≤ axisEnd) อยู่ในเวลาร้าน · ช่าง 4 แถวตามเก้าอี้ (เอก บอย นุ่น แจ๊ค)`, async () => {
    needScene();
    const v = await loadAs("owner");
    eq([v.unitId, v.dayStr, v.nowMs, v.openMin, v.closeMin], [ids.uS, D, NOW.getTime(), 600, 1200], "หัวจอ");
    ok(v.axisStartMs <= v.nowMs && v.nowMs <= v.axisEndMs && v.axisStartMs >= bkkMs(D, 600) && v.axisEndMs <= bkkMs(D, 1200) && v.axisEndMs - v.axisStartMs >= 3 * 3_600_000,
      `แกน ${hhmm(v.axisStartMs)}–${hhmm(v.axisEndMs)} (ต้องคร่อม now · ในเวลาร้าน · ≥ 3 ชม.)`);
    eq(v.staff.map((s) => [s.staffId, s.name, s.seat]), (["ek", "boy", "nun", "jack"] as SqcLineStaffKey[]).map((k, i) => [STAFF[k], STAFF_NAME[k], i + 1]), "แถวช่าง");
  });
  await st("L-2", "บล็อกในตารางช่าง: งานทุกชิ้นของวัน (ยกเว้นยกเลิก) อยู่แถวช่างตามแผน 1 ครั้ง · look: กำลังทำ=now · เสร็จ=done · นัดมาแล้ว=arrived · นัดยังไม่มา=booked · walk-in ระบบวาง=placed (ช่าง/เวลาตามแผน) · คุณต่อ (ปล่อยช่อง)=noshow", async () => {
    needScene();
    const v = await viewOf("owner");
    const where = new Map<string, { staff: string; b: LineBlock }[]>();
    for (const s of v.staff) for (const b of s.blocks) where.set(b.appointmentId, [...(where.get(b.appointmentId) ?? []), { staff: s.staffId, b }]);
    const want: Record<string, { staff: SqcLineStaffKey; look: LineBlock["look"]; start?: string }> = {
      P001: { staff: "ek", look: "done" }, A004: { staff: "ek", look: "done" }, P004: { staff: "ek", look: "now" }, BEAM: { staff: "ek", look: "booked", start: "15:15" }, OAT: { staff: "ek", look: "booked" }, NEW: { staff: "ek", look: "booked" },
      A001: { staff: "boy", look: "done" }, P002: { staff: "boy", look: "done" }, A005: { staff: "boy", look: "done" }, TOR: { staff: "boy", look: "noshow" }, A007: { staff: "boy", look: "now" }, P006: { staff: "boy", look: "arrived", start: "14:45" }, BEER: { staff: "boy", look: "booked" },
      A002: { staff: "nun", look: "done" }, P003: { staff: "nun", look: "done" }, P005: { staff: "nun", look: "now" }, A010: { staff: "nun", look: "placed", start: "15:00" }, PRAEW: { staff: "nun", look: "booked", start: "15:30" }, PALM: { staff: "nun", look: "booked" },
      A006: { staff: "jack", look: "done" }, A008: { staff: "jack", look: "now" }, A009: { staff: "jack", look: "placed", start: "14:40" }, A011: { staff: "jack", look: "placed", start: "15:25" },
    };
    const bad: string[] = [];
    for (const [k, w] of Object.entries(want)) {
      const hits = where.get(fx[k]) ?? [];
      if (hits.length !== 1) { bad.push(`${k}×${hits.length}`); continue; }
      const h = hits[0];
      if (h.staff !== STAFF[w.staff] || h.b.look !== w.look || (w.start && hhmm(h.b.startMs) !== w.start)) bad.push(`${k}=${keyOf(h.staff)}/${h.b.look}/${hhmm(h.b.startMs)}`);
    }
    ok(!where.has(fx.A003), "A003 (ลุกกลับ) ต้องไม่อยู่ในตาราง");
    const jay = where.get(fx.JAY) ?? [];
    ok(jay.length === 1 && jay[0].b.look === "booked", `JAY ${fmt(jay.map((x) => x.b.look))}`);
    const tickets = Object.fromEntries([...where.values()].flat().map((x) => [keyOf(x.b.appointmentId), x.b.ticketNumber]));
    for (const k of ["P004", "P006", "A009", "A011"]) if (tickets[k] !== k) bad.push(`เลขบัตร ${k}=${tickets[k]}`);
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("L-3", `แถวรอแถวเดียว (เรียงตามเวลาที่จะได้ทำ): 6 ช่องแรก = ${SCENE.expect.waitingFirst6.join(" · ")} · กำลังทำ = P004 P005 A007 A008 (ไม่อยู่ในแถวรอ) · ข้ามแล้ว = ว่าง · คุณต่อ/งานจบ ไม่อยู่ในแถว`, async () => {
    needScene();
    const v = await viewOf("owner");
    eq(v.waiting.slice(0, 6).map((j) => keyOf(j.appointmentId)), [...SCENE.expect.waitingFirst6], "แถวรอ");
    eq(v.inService.map((j) => keyOf(j.appointmentId)).sort(), ["A007", "A008", "P004", "P005"], "กำลังทำ");
    eq(v.skipped, [], "ข้ามแล้ว");
    const bad = v.waiting.map((j) => keyOf(j.appointmentId)).filter((k) => ["TOR", "A003", "P001", "A001", "P004"].includes(k));
    eq(bad, [], "งานที่ไม่ควรอยู่ในแถว");
  });
  await st("L-4", "แถวรอ ข้อมูลต่อแถว: A009 (A009 · ตัดผมชาย · แจ๊ค · 14:40 · อีก 20 · รอแล้ว 22) · P006 (นัด 14:45 · ตรงนัด · รอแล้ว 8 · ชื่อคุณกอล์ฟ) · คุณบีม (ยังไม่มา · ไม่มีบัตร · CONFIRMED)", async () => {
    needScene();
    const v = await viewOf("owner");
    const a9 = jobIn(v, "A009"), p6 = jobIn(v, "P006"), bm = jobIn(v, "BEAM");
    ok(!!a9 && !!p6 && !!bm, "ไม่พบงานในแถว");
    eq([a9!.kind, a9!.ticketNumber, a9!.ticketStatus, a9!.serviceName, a9!.staffId, a9!.staffName, hhmm(a9!.plannedStartMs), a9!.waitMin, a9!.waitedMin, a9!.bookedStartMs],
      ["WALKIN", "A009", "WAITING", "ตัดผมชาย", STAFF.jack, "ช่างแจ๊ค", "14:40", 20, 22, null], "A009");
    eq([p6!.kind, p6!.ticketNumber, p6!.label, hhmm(p6!.bookedStartMs), hhmm(p6!.plannedStartMs), p6!.waitMin, p6!.waitedMin, p6!.staffId], ["BOOKED", "P006", "คุณกอล์ฟ", "14:45", "14:45", 25, 8, STAFF.boy], "P006");
    eq([bm!.status, bm!.ticketNumber, bm!.label, bm!.assignMode, hhmm(bm!.bookedStartMs)], ["CONFIRMED", null, "คุณบีม", "ANY", "15:15"], "คุณบีม");
  });
  await st("L-5", `กล่อง "ทำไม": ของ walk-in ล่าสุดที่รอ (A011) · ช่างแจ๊ค 15:25 · ข้อความครบ 4 ท่อนตามภาพ`, async () => {
    needScene();
    const v = await viewOf("owner");
    ok(!!v.why, "why = null");
    eq([keyOf(v.why!.appointmentId), v.why!.ticketNumber, v.why!.staffName, hhmm(v.why!.startMs)], [SCENE.expect.whyOf, "A011", "ช่างแจ๊ค", "15:25"], "why");
    const miss = SCENE.expect.whyParts.filter((p) => !v.why!.text.includes(p));
    ok(miss.length === 0, `ข้อความขาด: ${miss.join(" | ")} (ได้ "${v.why!.text}")`);
    ok((jobIn(v, "A011")?.whyText ?? "").includes("ช่างแจ๊คเร็วสุด 15:25"), "A011.whyText");
  });
  await st("L-6", `"ต้องจัดการ": LATE = คุณต่อ (เลยผ่อนผัน ปล่อยช่องแล้ว) · SOON = คุณบีม (นัดใน 60 นาที ยังไม่เช็กอิน) · คุณแพรว 15:30 (70 นาที) ไม่อยู่ · ข้อความไม่มีเบอร์`, async () => {
    needScene();
    const v = await viewOf("owner");
    const by = (k: string) => v.todo.filter((t) => t.kind === k).map((t) => keyOf(t.appointmentId)).sort();
    eq({ LATE: by("LATE"), SOON: by("SOON"), STALE: by("STALE") }, { LATE: [...SCENE.expect.todo.LATE], SOON: [...SCENE.expect.todo.SOON], STALE: [] }, "todo");
    for (const t of v.todo) ok(t.title.trim().length > 0 && t.detail.trim().length > 0 && phoneLeak(t.title + t.detail).length === 0, `todo ${keyOf(t.appointmentId)} ข้อความว่าง/มีเบอร์`);
  });
  await st("L-7", `ตัวเลขบน (การ์ด 4 ใบ) = ${fmt(SCENE.expect.kpi)}`, async () => {
    needScene();
    eq((await viewOf("owner")).kpi, { ...SCENE.expect.kpi }, "kpi");
  });
  await st("L-8", "ปฏิทินรายวันตามคน (loadDayCalendar): วันฉาก = ช่าง 4 คอลัมน์ · บล็อก 24 (นัด 14 + walk-in 10 · ไม่รวมยกเลิก) ตรงช่างตามแผน · prev/next · วันถัดไป = 0 บล็อก · หน่วย legacy/ข้ามร้าน/ไม่มีสิทธิ์ ⇒ null", async () => {
    needScene();
    const c = await TL.cal()(cS, V.owner, { dateStr: D, now: NOW });
    ok(!!c, "null");
    eq([c!.dateStr, c!.prevDateStr, c!.nextDateStr, c!.openMin, c!.closeMin, c!.staff.map((s) => s.staffId)], [D, addDays(D, -1), addDays(D, 1), 600, 1200, (["ek", "boy", "nun", "jack"] as SqcLineStaffKey[]).map((k) => STAFF[k])], "หัว");
    const all = c!.staff.flatMap((s) => s.blocks.map((b) => ({ s: s.staffId, b })));
    eq(all.length, 24, "จำนวนบล็อก");
    ok(!all.some((x) => x.b.appointmentId === fx.A003), "มี A003");
    const p6 = all.find((x) => x.b.appointmentId === fx.P006), a11 = all.find((x) => x.b.appointmentId === fx.A011);
    eq([p6?.s, hhmm(p6?.b.startMs), a11?.s, hhmm(a11?.b.startMs)], [STAFF.boy, "14:45", STAFF.jack, "15:25"], "ตำแหน่ง P006/A011");
    const next = await TL.cal()(cS, V.owner, { dateStr: addDays(D, 1), now: NOW });
    eq(next?.staff.flatMap((s) => s.blocks).length, 0, "วันถัดไป");
    eq(await TL.cal()(cLeg, V.owner, { dateStr: D, now: NOW }), null, "legacy");
    eq(await TL.cal()(cBwithS, V.owner, { dateStr: D, now: NOW }), null, "ข้ามร้าน");
    eq(await TL.cal()(cS, V.nobody, { dateStr: D, now: NOW }), null, "ไม่มีสิทธิ์");
  }, "MAJOR");

  // ═══════════════ A ปุ่มต่อบทบาท · เบอร์ · ด่านสิทธิ์ ═══════════════
  console.log("\n── A: ปุ่มต่อบทบาท · เบอร์ · authorizeLineOp · myStaffIds ──");
  const hasAll = (got: LineAction[], want: LineAction[], what: string) => { const miss = want.filter((a) => !got.includes(a)); ok(miss.length === 0, `${what} ขาด ${miss.join(",")} (ได้ ${got.join(",")})`); };
  const hasNone = (got: LineAction[], bad: LineAction[], what: string) => { const x = bad.filter((a) => got.includes(a)); ok(x.length === 0, `${what} ไม่ควรมี ${x.join(",")} (ได้ ${got.join(",")})`); };
  await st("A-1", "myStaffIds: ผู้ใช้ช่างแจ๊ค (ผูก HR) = [ช่างแจ๊ค] · ผู้ใช้ job.run ที่ไม่ผูก = [] · ร้าน B = []", async () => {
    needScene();
    eq(await TL.mine()(cS, ids.uJack), [STAFF.jack], "แจ๊ค");
    eq(await TL.mine()(cS, ids.uPlain), [], "ไม่ผูก");
    eq(await TL.mine()({ tenantId: ids.tB, unitId: ids.uB }, ids.uJack), [], "ร้าน B");
  });
  await st("A-2", "เจ้าของ: A009 ⊇ call·start·move (ไม่มี skip — ยังไม่เรียก) · A008/P004 ⊇ done · P006 ⊇ call·start ไม่มี move (ระบุช่าง) · คุณบีม ⊇ checkin·move ไม่มี start · คุณต่อ ⊇ checkin·noshow · คุณโอ๊ต ไม่มี move · access = ทุกข้อ", async () => {
    needScene();
    const v = await viewOf("owner");
    eq(v.access, ACC.owner, "access");
    hasAll(actsOf(v, "A009"), ["call", "start", "move"], "A009"); hasNone(actsOf(v, "A009"), ["skip", "recall", "done"], "A009");
    hasAll(actsOf(v, "A008"), ["done"], "A008"); hasAll(actsOf(v, "P004"), ["done"], "P004");
    hasAll(actsOf(v, "P006"), ["call", "start"], "P006"); hasNone(actsOf(v, "P006"), ["move", "checkin"], "P006");
    hasAll(actsOf(v, "BEAM"), ["checkin", "move"], "คุณบีม"); hasNone(actsOf(v, "BEAM"), ["start", "done", "call"], "คุณบีม");
    hasAll(actsOf(v, "TOR"), ["checkin", "noshow"], "คุณต่อ");
    hasNone(actsOf(v, "OAT"), ["move", "start"], "คุณโอ๊ต");
  });
  await st("A-3", "ช่างแจ๊ค (job.run · ของฉัน = แจ๊ค): A009/A011 mine ⊇ call·start ไม่มี move · A008 ⊇ done · งานช่างอื่น (P006 · A010 · P004) ไม่มี call/start/done/skip · ไม่มี checkin/noshow/move/cancel ที่ไหนเลย · ไม่มีฟอร์ม walk-in", async () => {
    needScene();
    const v = await loadAs("jack");
    eq([v.access, v.myStaffIds], [ACC.jack, [STAFF.jack]], "access/myStaffIds");
    for (const k of ["A009", "A011"]) { ok(jobIn(v, k)?.mine === true, `${k}.mine`); hasAll(actsOf(v, k), ["call", "start"], k); hasNone(actsOf(v, k), ["move"], k); }
    hasAll(actsOf(v, "A008"), ["done"], "A008");
    for (const k of ["P006", "A010", "P004", "P005", "A007"]) hasNone(actsOf(v, k), ["call", "start", "done", "skip", "recall"], k);
    const every = [...allJobs(v).flatMap((j) => j.actions), ...v.todo.flatMap((t) => t.actions)];
    hasNone(every, ["checkin", "noshow", "move", "cancel"], "ทั้งจอ");
    eq(v.walkInForm, null, "walkInForm");
    ok(v.staff.find((s) => s.staffId === STAFF.jack)?.mine === true && v.staff.filter((s) => s.mine).length === 1, "แถวช่าง mine");
  });
  await st("A-4", "แคชเชียร์ (checkin · walkin): ไม่มี call/start/done/skip/move/noshow ที่ไหนเลย · คุณบีม ⊇ checkin · คุณต่อ ⊇ checkin · ฟอร์ม walk-in = บริการ 6 · ช่าง 4", async () => {
    needScene();
    const v = await loadAs("cashier");
    eq(v.access, ACC.cashier, "access");
    const every = [...allJobs(v).flatMap((j) => j.actions), ...v.todo.flatMap((t) => t.actions)];
    hasNone(every, ["call", "start", "done", "skip", "recall", "move", "noshow"], "ทั้งจอ");
    hasAll(actsOf(v, "BEAM"), ["checkin"], "คุณบีม");
    hasAll(actsOf(v, "TOR"), ["checkin"], "คุณต่อ");
    eq([v.walkInForm?.services.length, v.walkInForm?.staff.length], [6, 4], "walkInForm");
  });
  await st("A-4b", "หัวหน้าร้าน (queue.operate อย่างเดียว): A009 ⊇ call·move ไม่มี start/done · P004 ไม่มี done · คุณต่อ ⊇ noshow ไม่มี checkin · ไม่มีฟอร์ม walk-in", async () => {
    needScene();
    const v = await TL.load()(cS, V.lead, { now: NOW });
    ok(!!v, "null");
    hasAll(actsOf(v!, "A009"), ["call", "move"], "A009"); hasNone(actsOf(v!, "A009"), ["start", "done"], "A009");
    hasNone(actsOf(v!, "P004"), ["done"], "P004");
    hasAll(actsOf(v!, "TOR"), ["noshow"], "คุณต่อ"); hasNone(actsOf(v!, "TOR"), ["checkin"], "คุณต่อ");
    eq(v!.walkInForm, null, "walkInForm");
  }, "MAJOR");
  await st("A-5", "เบอร์ (X8): ข้อมูลจอของช่าง/แคชเชียร์ (JSON ทั้งก้อน) ไม่มีเบอร์เต็มของใคร (ทั้ง 0812… · 081-…· +66…) · phoneMasked มีเลข 4 ตัว = 4 ตัวท้าย · เจ้าของเห็น phone เต็ม (คุณบีม) + todo คุณต่อมีเบอร์ (ปุ่มโทรหา) · แคชเชียร์ todo phone = null", async () => {
    needScene();
    for (const who of ["jack", "cashier"] as const) {
      const v = await viewOf(who);
      eq(phoneLeak(JSON.stringify(v)), [], `${who} รั่ว`);
      for (const j of allJobs(v).filter((x) => x.kind === "BOOKED")) {
        const ph = SCENE.bookings.find((b) => fx[b.key] === j.appointmentId)?.phone ?? "";
        ok(j.phone === null && !!j.phoneMasked && digitsIn(j.phoneMasked) === 4 && j.phoneMasked.replace(/\D/g, "") === ph.slice(-4), `${who} ${keyOf(j.appointmentId)} masked=${j.phoneMasked} phone=${j.phone}`);
      }
      ok(v.todo.every((t) => t.phone === null), `${who} todo.phone`);
    }
    const o = await viewOf("owner");
    eq(jobIn(o, "BEAM")?.phone, "0810000009", "เจ้าของ phone คุณบีม");
    eq(o.todo.find((t) => t.appointmentId === fx.TOR)?.phone, "0810000006", "เจ้าของ todo คุณต่อ");
  });
  await st("A-6", "authorizeLineOp = ด่านเดียวกับปุ่ม: แจ๊ค start A009 ✓ · start P006 ✗ · done A008 ✓ · done P004 ✗ · walkin ✗ · แคชเชียร์ start/call A009 ✗ · done P004 ✗ · checkin คุณบีม ✓ · walkin (ไม่มี id) ✓ · หัวหน้า call ✓ move ✓ start ✗ · job.run ไม่ผูกช่าง start A009 ✗ · เจ้าของ start A009 ✓ · ไม่มีสิทธิ์ call ✗ · ข้ามร้าน/ไม่มีนัด ⇒ NOT_FOUND", async () => {
    needScene();
    const a = TL.auth();
    const o = { now: NOW };
    const cases: [string, Ctx, LineViewer, LineAction | "walkin", string | null, "OK" | "FORBIDDEN" | "NOT_FOUND"][] = [
      ["jack start A009", cS, V.jack, "start", fx.A009, "OK"], ["jack start P006", cS, V.jack, "start", fx.P006, "FORBIDDEN"],
      ["jack done A008", cS, V.jack, "done", fx.A008, "OK"], ["jack done P004", cS, V.jack, "done", fx.P004, "FORBIDDEN"],
      ["jack walkin", cS, V.jack, "walkin", null, "FORBIDDEN"],
      ["cash start A009", cS, V.cashier, "start", fx.A009, "FORBIDDEN"], ["cash done P004", cS, V.cashier, "done", fx.P004, "FORBIDDEN"],
      ["cash checkin BEAM", cS, V.cashier, "checkin", fx.BEAM, "OK"], ["cash walkin", cS, V.cashier, "walkin", null, "OK"], ["cash call A009", cS, V.cashier, "call", fx.A009, "FORBIDDEN"],
      ["lead call A009", cS, V.lead, "call", fx.A009, "OK"], ["lead move BEAM", cS, V.lead, "move", fx.BEAM, "OK"], ["lead start A009", cS, V.lead, "start", fx.A009, "FORBIDDEN"],
      ["plain start A009", cS, V.plain, "start", fx.A009, "FORBIDDEN"], ["owner start A009", cS, V.owner, "start", fx.A009, "OK"],
      ["nobody call A009", cS, V.nobody, "call", fx.A009, "FORBIDDEN"],
      ["ข้ามร้าน", cBwithS, V.owner, "call", fx.A009, "NOT_FOUND"], ["ไม่มีนัด", cS, V.owner, "call", "svcb5-nope", "NOT_FOUND"],
    ];
    const bad: string[] = [];
    for (const [n, c, vw, op, id, exp] of cases) {
      const r = await a(c, vw, op, id, o);
      const got = r.ok ? "OK" : r.code;
      if (got !== exp || (!r.ok && !(r.reason ?? "").trim())) bad.push(`${n}=${got}`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });

  // ═══════════════ U คอมโพเนนต์ ═══════════════
  console.log("\n── U: คอมโพเนนต์ (renderToStaticMarkup · สัญญา DOM §4) ──");
  const domIds = (html: string, attr: string) => boxes(html, attr).map((b) => b.attrs[attr]);
  await st("U-0", "คอมโพเนนต์ 3 ไฟล์ไม่ลาก server: import เฉพาะ react/next/@/components/@/lib/ui (+ `import type` จาก booking) · ไม่มี prisma/@/lib/core/db/@/lib/modules (ค่า)", () => {
    const bad: string[] = [];
    for (const f of [F.compLine, F.compMine, F.compDay]) {
      const s = src(f);
      if (!s) { bad.push(`ไม่มี ${f}`); continue; }
      const code = stripComments(s);
      for (const m of code.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
        const typeOnly = !!m[1], spec = m[2];
        if (typeOnly) continue;
        if (!/^(react|react-dom|next\/|@\/components\/|@\/lib\/ui\/|\.\/|\.\.\/)/.test(spec)) bad.push(`${f}: ${spec}`);
      }
      if (/@\/lib\/core\/db|from\s+["']@prisma\/client["']/.test(code)) bad.push(`${f}: prisma`);
    }
    ok(bad.length === 0, bad.slice(0, 6).join(" · "));
  });
  await st("U-1", "TodayLine (เจ้าของ): ราก [data-today-line][data-booking-wide] · แถวช่าง [data-line-staff] 4 ตามลำดับ · บล็อก [data-line-block]+[data-look] ตามข้อมูล · [data-now-line] · แถวรอ [data-line-wait] ตามลำดับ · [data-line-why]=A011 · การ์ด [data-line-kpi] 4 · [data-line-todo] ตาม todo", async () => {
    needScene();
    const v = await viewOf("owner");
    const html = render(LineC, { view: v });
    ok(boxes(html, "data-today-line").length === 1 && boxes(html, "data-booking-wide").length >= 1, "ราก");
    eq(domIds(html, "data-line-staff"), v.staff.map((s) => s.staffId), "แถวช่าง");
    const blocks = boxes(html, "data-line-block").map((b) => [b.attrs["data-line-block"], b.attrs["data-look"]]);
    eq(blocks.sort(), v.staff.flatMap((s) => s.blocks.map((b) => [b.appointmentId, b.look])).sort(), "บล็อก");
    ok(boxes(html, "data-now-line").length >= 1, "เส้นตอนนี้");
    eq(domIds(html, "data-line-wait"), v.waiting.map((j) => j.appointmentId), "แถวรอ");
    eq(domIds(html, "data-line-why"), [fx.A011], "ทำไม");
    eq(domIds(html, "data-line-kpi").sort(), ["booked", "done", "waiting", "walkin"], "kpi");
    eq(domIds(html, "data-line-todo").sort(), v.todo.map((t) => t.appointmentId).sort(), "todo");
    ok(html.includes("ช่างแจ๊คเร็วสุด 15:25"), "ข้อความทำไม");
  });
  const btnCheck = (v: TodayLineView, html: string, who: string) => {
    const btns = actionButtons(html);
    const bad: string[] = [];
    const sources = [...allJobs(v).map((j) => ({ id: j.appointmentId, acts: j.actions })), ...v.todo.map((t) => ({ id: t.appointmentId, acts: t.actions }))];
    for (const s of sources) for (const a of s.acts) {
      if (a === "noshow" || a === "cancel") { if (!html.includes(`data-testid="line-${a}-${s.id}-trigger"`)) bad.push(`ไม่มีปุ่ม ${a} ${keyOf(s.id)}`); continue; }
      if (!btns.some((b) => b.action === a && b.id === s.id && b.inForm)) bad.push(`ไม่มีปุ่ม ${a} ${keyOf(s.id)} (ในฟอร์มที่มี appointmentId)`);
    }
    for (const b of btns) {
      if (b.action === "walkin") continue;
      const allowed = sources.filter((s) => s.id === b.id).flatMap((s) => s.acts);
      if (!allowed.includes(b.action as LineAction)) bad.push(`ปุ่มเกิน ${b.action} ${keyOf(b.id)}`);
    }
    ok(bad.length === 0, `${who}: ${bad.slice(0, 6).join(" · ")}`);
  };
  await st("U-2", "ปุ่ม ⇔ actions (เจ้าของ): ทุก action ของทุกงาน/todo มีปุ่ม [data-line-action][data-appointment-id] ในฟอร์มที่มี input appointmentId (noshow/cancel = ConfirmDialog testId line-<a>-<id>) · ไม่มีปุ่มเกินจาก actions", async () => {
    needScene();
    const v = await viewOf("owner");
    btnCheck(v, render(LineC, { view: v }), "owner");
  });
  await st("U-3", "TodayLine (แคชเชียร์): ไม่มีปุ่ม call/start/done · ปุ่มตรง actions · มีฟอร์ม walk-in [data-line-walkin-form] (select serviceId 6 + staffId มี ใครก็ได้) · HTML ไม่มีเบอร์ · (เจ้าของ) มี tel: ของคุณต่อ", async () => {
    needScene();
    const v = await viewOf("cashier");
    const html = render(LineC, { view: v });
    const btns = actionButtons(html);
    eq(btns.filter((b) => ["call", "start", "done"].includes(b.action)), [], "call/start/done");
    btnCheck(v, html, "cashier");
    const form = boxes(html, "data-line-walkin-form");
    ok(form.length === 1 && /<select[^>]*name="serviceId"/.test(form[0].html) && /<select[^>]*name="staffId"/.test(form[0].html), "ฟอร์ม walk-in");
    eq((form[0].html.match(/<option\b/g) ?? []).length >= 6 + 5, true, "ตัวเลือก (บริการ 6 + ช่าง 4 + ใครก็ได้)");
    eq(phoneLeak(html), [], "เบอร์");
    const oHtml = render(LineC, { view: await viewOf("owner") });
    ok(oHtml.includes('href="tel:0810000006"'), "เจ้าของ: tel ของคุณต่อ");
  });
  await st("U-4", "MyQueue (ช่างแจ๊ค · มือถือ): [data-my-queue] · [data-my-current] มี A008 + ปุ่ม done · [data-my-next] = A009, A011 ตามลำดับ + ปุ่ม start · [data-my-line] = แถวรอทั้งร้านตามลำดับ (ไม่มีปุ่มของคนอื่น) · ไม่มีเบอร์", async () => {
    needScene();
    const v = await viewOf("jack");
    const html = render(MineC, { view: v });
    ok(boxes(html, "data-my-queue").length === 1, "ราก");
    const cur = boxes(html, "data-my-current");
    ok(cur.length === 1 && cur[0].html.includes(fx.A008) && actionButtons(cur[0].html).some((b) => b.action === "done" && b.id === fx.A008), "งานตอนนี้ A008 + done");
    const next = boxes(html, "data-my-next");
    ok(next.length === 1, "ไม่มี data-my-next");
    eq(domIds(next[0].html, "data-line-wait"), [fx.A009, fx.A011], "ถัดไปของฉัน");
    ok(actionButtons(next[0].html).filter((b) => b.action === "start").map((b) => b.id).sort().join() === [fx.A009, fx.A011].sort().join(), "ปุ่ม start ของฉัน");
    const line = boxes(html, "data-my-line");
    ok(line.length === 1, "ไม่มี data-my-line");
    eq(domIds(line[0].html, "data-line-wait"), v.waiting.map((j) => j.appointmentId), "แถวรวม");
    btnCheck(v, html, "jack");
    eq(phoneLeak(html), [], "เบอร์");
  });
  await st("U-5", "DayCalendar: [data-day-calendar] · [data-cal-staff] 4 ตามลำดับ · [data-cal-block] = 24 ตามข้อมูล · ลิงก์ [data-cal-prev]/[data-cal-next] มี date=วันก่อน/วันถัดไป", async () => {
    needScene();
    const c = await TL.cal()(cS, V.owner, { dateStr: D, now: NOW });
    ok(!!c, "null");
    const html = render(DayC, { view: c });
    ok(boxes(html, "data-day-calendar").length === 1, "ราก");
    eq(domIds(html, "data-cal-staff"), c!.staff.map((s) => s.staffId), "คอลัมน์");
    eq(domIds(html, "data-cal-block").sort(), c!.staff.flatMap((s) => s.blocks.map((b) => b.appointmentId)).sort(), "บล็อก");
    const prev = boxes(html, "data-cal-prev")[0]?.attrs.href ?? "", nxt = boxes(html, "data-cal-next")[0]?.attrs.href ?? "";
    ok(prev.includes(`date=${addDays(D, -1)}`) && nxt.includes(`date=${addDays(D, 1)}`), `ลิงก์ ${prev} | ${nxt}`);
  }, "MAJOR");
  await st("U-6", "นาฬิกา QC: ส่ง prop `at` ⇒ ทุกฟอร์มของปุ่มมี input hidden name=at ค่าเดียวกัน · ไม่ส่ง ⇒ ไม่มี input at เลย", async () => {
    needScene();
    const v = await viewOf("owner");
    const iso = NOW.toISOString();
    const withAt = render(LineC, { view: v, at: iso });
    const btns = actionButtons(withAt);
    const hasAt = (f: string) => new RegExp(`name="at"[^>]*value="${iso.replace(/[.]/g, "\\.")}"|value="${iso.replace(/[.]/g, "\\.")}"[^>]*name="at"`).test(f);
    const miss = btns.filter((b) => !hasAt(b.form)).map((b) => `${b.action}:${keyOf(b.id)}`);
    ok(btns.length > 0 && miss.length === 0, `ฟอร์มที่ไม่มี input at: ${miss.slice(0, 5).join(" ")} (ปุ่ม ${btns.length})`);
    ok(hasAt(boxes(withAt, "data-line-walkin-form")[0]?.html ?? ""), "ฟอร์ม walk-in ไม่มี input at");
    ok(!/name="at"/.test(render(LineC, { view: v })), "ไม่ส่ง at แต่มี input at");
  }, "MAJOR");

  // ═══════════════ H/E server จริง ═══════════════
  console.log("\n── H/E: server จริง (QC_BASE) ──");
  const BASE = (process.env.QC_BASE ?? "").replace(/\/+$/, "");
  const sessions: string[] = [];
  const mint = async (userId: string, tenantId: string): Promise<string> => {
    const token = `b5${randomBytes(24).toString("base64url")}`;
    const id = rid("sess");
    const ttl = new Date(Date.now() + 3_600_000);
    await insertRow("Session", { id, userId, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl });
    sessions.push(id);
    const name = BASE.startsWith("https:") ? "__Host-shark_session" : "shark_session";
    return `${name}=${token}; shark_tenant=${tenantId}`;
  };
  const pagePath = (p: string, extra = "") => `/app/u/${SLUGS[ids.uS]}/booking${p}?at=${encodeURIComponent(NOW.toISOString())}${extra}`;
  const get = async (cookie: string, path: string) => {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
    return { status: r.status, loc: r.headers.get("location") ?? "", html: r.status < 300 ? await r.text() : "" };
  };
  const H_IDS = ["H-1", "H-2", "H-3", "H-4", "H-5", "H-6"] as const;
  const H_NAMES: Record<(typeof H_IDS)[number], string> = {
    "H-1": "เจ้าของ GET /booking?at= ⇒ 200 · มี data-today-line · บล็อก A011 · data-line-why · data-line-action=start (A009)",
    "H-2": "แคชเชียร์ GET /booking ⇒ 200 · ไม่มีปุ่ม start/done · มีฟอร์ม walk-in · HTML+RSC ไม่มีเบอร์เต็ม",
    "H-3": "ช่างแจ๊ค GET /booking/mine ⇒ 200 · data-my-current A008 · ปุ่ม start A009 · และ /booking (แถวรวม A009 · P006) · ไม่มีเบอร์เต็ม",
    "H-4": "ไม่มีสิทธิ์ GET /booking ⇒ 404 · เจ้าของร้าน B ใช้ slug หน่วยร้าน A ⇒ 404 (X1)",
    "H-5": "หน่วย BOOKING แถวเดียว GET /queue ⇒ redirect ไป /booking",
    "H-6": "GET /booking/day?date= ⇒ 200 · data-day-calendar · data-cal-staff 4",
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
    const ckOwner = await mint(ids.uOwner, ids.tA), ckCash = await mint(ids.uCash, ids.tA), ckJack = await mint(ids.uJack, ids.tA), ckNobody = await mint(ids.uNobody, ids.tA), ckB = await mint(ids.uOwnerB, ids.tB);
    await st("H-1", H_NAMES["H-1"], async () => {
      const r = await get(ckOwner, pagePath(""));
      eq(r.status, 200, "HTTP");
      ok(r.html.includes("data-today-line"), "ไม่มี data-today-line (server ตั้ง SVC_QC_CLOCK=1 หรือยัง?)");
      ok(r.html.includes(`data-line-block="${fx.A011}"`) && r.html.includes(`data-line-why="${fx.A011}"`), "ไม่เห็นงานฉาก ณ ?at=");
      ok(actionButtons(r.html).some((b) => b.action === "start" && b.id === fx.A009), "ปุ่ม start A009");
    }, "MAJOR");
    await st("H-2", H_NAMES["H-2"], async () => {
      const r = await get(ckCash, pagePath(""));
      eq(r.status, 200, "HTTP");
      eq(actionButtons(r.html).filter((b) => b.action === "start" || b.action === "done").length, 0, "start/done");
      ok(r.html.includes("data-line-walkin-form"), "ฟอร์ม walk-in");
      eq(phoneLeak(r.html), [], "เบอร์ใน HTML/RSC");
    }, "MAJOR");
    await st("H-3", H_NAMES["H-3"], async () => {
      const m = await get(ckJack, pagePath("/mine"));
      eq(m.status, 200, "HTTP mine");
      ok(boxes(m.html, "data-my-current")[0]?.html.includes(fx.A008) ?? false, "งานตอนนี้ A008");
      ok(actionButtons(m.html).some((b) => b.action === "start" && b.id === fx.A009), "start A009");
      eq(phoneLeak(m.html), [], "เบอร์ mine");
      const l = await get(ckJack, pagePath(""));
      eq(l.status, 200, "HTTP /booking");
      ok(l.html.includes(`data-line-wait="${fx.A009}"`) && l.html.includes(`data-line-wait="${fx.P006}"`), "แถวรวม");
      eq(phoneLeak(l.html), [], "เบอร์ /booking");
    }, "MAJOR");
    await st("H-4", H_NAMES["H-4"], async () => {
      eq((await get(ckNobody, pagePath(""))).status, 404, "ไม่มีสิทธิ์");
      eq((await get(ckB, pagePath(""))).status, 404, "ร้าน B");
    }, "MAJOR");
    await st("H-5", H_NAMES["H-5"], async () => {
      const r = await get(ckOwner, `/app/u/${SLUGS[ids.uS]}/queue`);
      ok([302, 303, 307, 308].includes(r.status) && r.loc.includes(`/app/u/${SLUGS[ids.uS]}/booking`), `HTTP ${r.status} → ${r.loc}`);
    }, "MAJOR");
    await st("H-6", H_NAMES["H-6"], async () => {
      const r = await get(ckOwner, `/app/u/${SLUGS[ids.uS]}/booking/day?date=${D}&at=${encodeURIComponent(NOW.toISOString())}`);
      eq(r.status, 200, "HTTP");
      ok(r.html.includes("data-day-calendar") && boxes(r.html, "data-cal-staff").length === 4, "ปฏิทิน");
    }, "MAJOR");
  }

  // ═══════════════ O งานใหม่ ═══════════════
  console.log("\n── O: ข้าม/เรียกคืน · ข้ามเอง (tick) · ย้ายช่าง · หนี้ B.4 · X1 ──");
  const okJob = (r: { ok: boolean; code?: string; reason?: string }, what: string) => ok(r.ok, `${what}: ล้ม ${r.code} ${r.reason}`);
  const failCode = (r: { ok: boolean; code?: string; reason?: string }, code: string, what: string) => {
    ok(!r.ok, `${what}: ต้องล้ม ${code} แต่สำเร็จ`);
    eq(r.code, code, `${what} code`);
    ok(typeof r.reason === "string" && r.reason.trim().length > 0, `${what}: reason ว่าง`);
  };
  const evCount = async (ticketId: string, action: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "QueueTicketEvent" WHERE "ticketId" = $1 AND action::text = $2`, [ticketId, action]))[0].n;
  const obCount = async (type: string, apptId: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2 AND payload->>'appointmentId' = $3`, [ids.tA, type, apptId]))[0].n;
  let skipOk = false;
  await st("O-1", "ข้าม (skipJob 14:21): A009 ยังไม่เรียก ⇒ BAD_STATE · เรียกแล้ว ⇒ บัตร SKIPPED (skippedAt · QueueTicketEvent SKIPPED 1) · งานยัง QUEUED · ไปท้ายแถว walk-in: A009 วางหลัง A011 · A011 เร็วขึ้นกว่า 15:25 · ไม่มีแถวถือช่องซ้อน · อยู่ใน view.skipped ไม่อยู่ใน waiting · ปุ่ม recall", async () => {
    needScene();
    const t = at(D, "14:21");
    failCode(await TL.skip()(cS, fx.A009, { now: t }), "BAD_STATE", "ข้ามก่อนเรียก");
    okJob(await LN().callJob(cS, fx.A009, { now: t }), "เรียก A009");
    okJob(await TL.skip()(cS, fx.A009, { now: t }), "ข้าม A009");
    const tk = await tkOf("A009");
    eq([tk.status, tk.skippedAt?.getTime() ?? null, await evCount(tk.id, "SKIPPED")], ["SKIPPED", t.getTime(), 1], "บัตร");
    eq((await apRow(fx.A009)).status, "QUEUED", "งาน");
    const a9 = await planOf("A009"), a11 = await planOf("A011");
    ok(a9.start !== null && a11.start !== null && a9.start > a11.start && a11.start < bkkMs(D, hm("15:25")), `A009 ${hhmm(a9.start)} · A011 ${hhmm(a11.start)}`);
    for (const k of Object.keys(STAFF) as SqcLineStaffKey[]) eq(await overlapIn(STAFF[k]), [], `ซ้อน ${k}`);
    const v = await TL.load()(cS, V.owner, { now: t });
    ok(!!v && v.skipped.map((j) => j.appointmentId).includes(fx.A009) && !v.waiting.some((j) => j.appointmentId === fx.A009), "view.skipped");
    hasAll(v!.skipped.find((j) => j.appointmentId === fx.A009)!.actions, ["recall"], "ปุ่ม recall");
    skipOk = true;
  });
  await st("O-2", "เรียกคืน (recallJob 14:22): บัตร SKIPPED ⇒ CALLED (callCount 2 · calledAt 14:22) · event queue.ticket.called 2 · กลับลำดับเดิม: A009 แจ๊ค 14:40 · A011 แจ๊ค 15:25 · recall งานที่ไม่ได้ข้าม ⇒ BAD_STATE · skip งานกำลังทำ ⇒ BAD_STATE", async () => {
    needScene();
    ok(skipOk, "O-1 ไม่ผ่าน");
    const t = at(D, "14:22");
    okJob(await TL.recall()(cS, fx.A009, { now: t }), "เรียกคืน A009");
    const tk = await tkOf("A009");
    eq([tk.status, tk.callCount, tk.calledAt?.getTime() ?? null], ["CALLED", 2, t.getTime()], "บัตร");
    eq(await obCount("queue.ticket.called", fx.A009), 2, "event called");
    const a9 = await planOf("A009"), a11 = await planOf("A011");
    eq([a9.staff, hhmm(a9.start), a11.staff, hhmm(a11.start)], [STAFF.jack, "14:40", STAFF.jack, "15:25"], "แผนหลังเรียกคืน");
    failCode(await TL.recall()(cS, fx.A011, { now: t }), "BAD_STATE", "recall A011 (ไม่ได้ข้าม)");
    failCode(await TL.skip()(cS, fx.P004, { now: t }), "BAD_STATE", "skip P004 (กำลังทำ)");
  });
  await st("O-3", "ข้ามเอง #43 (runLineTick · skipAfterMin 10): เรียก A010 14:23 · tick 14:32 ⇒ skipped 1 (A009 ที่เรียกคืน 14:22) · A010 ยัง CALLED · tick 14:33 ×2 พร้อมกัน ⇒ รวม skipped 1 (A010) · QueueTicketEvent SKIPPED ของ A010 = 1 (actor SYSTEM) · คุณต่อยังไม่ NO_SHOW", async () => {
    needScene();
    ok(skipOk, "O-1 ไม่ผ่าน");
    okJob(await LN().callJob(cS, fx.A010, { now: at(D, "14:23") }), "เรียก A010");
    const r1 = await RN().runLineTick(at(D, "14:32"), { tenantIds: [ids.tA] });
    eq(r1.skipped, 1, "tick 14:32 skipped");
    eq([(await tkOf("A009")).status, (await tkOf("A010")).status], ["SKIPPED", "CALLED"], "บัตร 14:32");
    const [x, y] = await Promise.all([RN().runLineTick(at(D, "14:33"), { tenantIds: [ids.tA] }), RN().runLineTick(at(D, "14:33"), { tenantIds: [ids.tA] })]);
    eq((x.skipped ?? 0) + (y.skipped ?? 0), 1, "tick ซ้อน skipped รวม");
    const t10 = await tkOf("A010");
    eq(t10.status, "SKIPPED", "A010");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "QueueTicketEvent" WHERE "ticketId" = $1 AND action::text = 'SKIPPED' AND "actorType"::text = 'SYSTEM'`, [t10.id]))[0].n, 1, "event SKIPPED SYSTEM");
    eq((await apRow(fx.TOR)).status, "LATE", "คุณต่อ");
  });
  await st("O-4", "ย้ายช่าง (moveJobStaff 14:34): นัดใครก็ได้ JAY 18:00 → ช่างอีกคนที่ว่าง ⇒ staffId ใหม่ · assignMode SPECIFIC · เวลาเดิม · booking.rescheduled 1 · → ช่างนุ่น (ชนคุณปาล์ม) ⇒ FULL ไม่เปลี่ยน · walk-in A011 → ช่างเอก ⇒ staffId/plannedStaffId เอก + SPECIFIC · นัดระบุช่าง (คุณโอ๊ต) / มาแล้ว (P006) ⇒ BAD_STATE · ช่างของสาขาอื่น ⇒ NOT_FOUND · ไม่มีแถวซ้อน", async () => {
    needScene();
    const t = at(D, "14:34");
    const j0 = await apRow(fx.JAY);
    const target = j0.staffId === STAFF.jack ? STAFF.boy : STAFF.jack;
    failCode(await TL.move()(cS, fx.JAY, STAFF.nun, { now: t }), "FULL", "JAY → นุ่น");
    eq((await apRow(fx.JAY)).staffId, j0.staffId, "JAY หลัง FULL");
    okJob(await TL.move()(cS, fx.JAY, target, { now: t }), `JAY → ${keyOf(target)}`);
    const j1 = await apRow(fx.JAY);
    eq([j1.staffId, j1.assignMode, j1.startAt.getTime(), j1.status], [target, "SPECIFIC", j0.startAt.getTime(), "CONFIRMED"], "JAY");
    eq(await obCount("booking.rescheduled", fx.JAY), 1, "event");
    okJob(await TL.move()(cS, fx.A011, STAFF.ek, { now: t }), "A011 → เอก");
    const a = await apRow(fx.A011);
    eq([a.staffId, a.plannedStaffId, a.assignMode, a.status], [STAFF.ek, STAFF.ek, "SPECIFIC", "QUEUED"], "A011");
    failCode(await TL.move()(cS, fx.OAT, STAFF.jack, { now: t }), "BAD_STATE", "คุณโอ๊ต (ระบุช่าง)");
    failCode(await TL.move()(cS, fx.P006, STAFF.jack, { now: t }), "BAD_STATE", "P006 (มาแล้ว)");
    failCode(await TL.move()(cS, fx.BEAM, ids.R1, { now: t }), "NOT_FOUND", "ช่างสาขาอื่น");
    for (const k of Object.keys(STAFF) as SqcLineStaffKey[]) eq(await overlapIn(STAFF[k]), [], `ซ้อน ${k}`);
  });
  await st("O-5", "X1: skip/recall/move ด้วย ctx ร้าน B (อ้างหน่วยร้าน A) ⇒ NOT_FOUND ทุกตัว · ไม่มีอะไรเปลี่ยน", async () => {
    needScene();
    const t = at(D, "14:34");
    const before = await apRow(fx.BEAM);
    failCode(await TL.skip()(cBwithS, fx.A010, { now: t }), "NOT_FOUND", "skip");
    failCode(await TL.recall()(cBwithS, fx.A010, { now: t }), "NOT_FOUND", "recall");
    failCode(await TL.move()(cBwithS, fx.BEAM, STAFF.jack, { now: t }), "NOT_FOUND", "move");
    eq((await apRow(fx.BEAM)).staffId, before.staffId, "คุณบีม");
    eq((await tkOf("A010")).status, "SKIPPED", "A010");
  }, "MAJOR");
  await st("O-6", "หนี้ B.4 ถอย ARRIVED: เช็กอินแล้วร้านถอยเป็น CONFIRMED (setAppointmentStatus) ⇒ checkedInAt = null · queueTicketId = null · บัตรเดิม CANCELLED ใน tx เดียว · เช็กอินใหม่ได้บัตรใหม่ · บัตร active ของนัด = 1", async () => {
    needTpl();
    const b = await BK().bookAppointment(cR, { serviceId: ids.RS, staffId: ids.R1, dateStr: DR, startMin: hm("15:00"), channel: "STAFF", customerName: "คุณถอย", customerPhone: "0819990001", idempotencyKey: `${RUN}-rev` });
    ok(b.ok, `จอง ${fmt(b)}`);
    const id = (b as { id: string }).id;
    const c1 = await LN().checkIn(cR, { appointmentId: id }, { via: "STAFF", now: at(DR, "14:00") });
    ok(c1.ok, `เช็กอิน ${fmt(c1)}`);
    const t1 = (c1 as { ticketId: string }).ticketId;
    const s = await BK().setAppointmentStatus(cR.tenantId, cR.unitId, id, "CONFIRMED");
    ok(s.ok, `ถอย ${s.reason}`);
    const r = await apRow(id);
    eq([r.status, r.checkedInAt, r.queueTicketId, (await tkRow(t1)).status], ["CONFIRMED", null, null, "CANCELLED"], "หลังถอย");
    const c2 = await LN().checkIn(cR, { appointmentId: id }, { via: "STAFF", now: at(DR, "14:05") });
    ok(c2.ok && (c2 as { ticketId: string }).ticketId !== t1 && (c2 as { already: boolean }).already === false, `เช็กอินใหม่ ${fmt(c2)}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "QueueTicket" WHERE "refType" = 'APPOINTMENT' AND "refId" = $1 AND status::text IN ('WAITING','CALLED','SERVING','SKIPPED')`, [id]))[0].n, 1, "บัตร active");
  });
  await st("O-7", "หนี้ B.4 นัด manualHold ข้ามเที่ยงคืน: นัด 23:00 · tick 23:31 ⇒ NO_SHOW · ร้านถอยเป็น CONFIRMED (manualHold) · เช็กอิน 00:30 วันถัดไป ⇒ ok (ARRIVED) · ตัวควบคุม: นัด 22:30 ไม่ถอย เช็กอิน 00:30 ⇒ TOO_LATE", async () => {
    needTpl();
    const b = await BK().bookAppointment(cH, { serviceId: ids.HS, staffId: ids.H1, dateStr: DH, startMin: hm("23:00"), channel: "STAFF", customerName: "คุณดึก", customerPhone: "0819990002", idempotencyKey: `${RUN}-hold` });
    ok(b.ok, `จอง ${fmt(b)}`);
    const id = (b as { id: string }).id;
    await RN().runLineTick(at(DH, "23:31"), { tenantIds: [ids.tA] });
    eq((await apRow(id)).status, "NO_SHOW", "หลัง tick");
    const s = await BK().setAppointmentStatus(cH.tenantId, cH.unitId, id, "CONFIRMED");
    ok(s.ok, `ถอย ${s.reason}`);
    const c = await LN().checkIn(cH, { appointmentId: id }, { via: "STAFF", now: at(addDays(DH, 1), "00:30") });
    ok(c.ok, `เช็กอิน 00:30: ${fmt(c)}`);
    eq((await apRow(id)).status, "ARRIVED", "สถานะ");
  });
  await st("O-7c", "ตัวควบคุมของ O-7 (เขียวตั้งแต่ก่อนมีงาน): นัด 22:30 (ไม่ถอย) เช็กอิน 00:30 วันถัดไป ⇒ TOO_LATE", async () => {
    needTpl();
    const b = await BK().bookAppointment(cH, { serviceId: ids.HS, staffId: ids.H2, dateStr: DH, startMin: hm("22:30"), channel: "STAFF", customerName: "คุณดึก 2", customerPhone: "0819990003", idempotencyKey: `${RUN}-hold2` });
    ok(b.ok, `จอง ${fmt(b)}`);
    const c = await LN().checkIn(cH, { appointmentId: (b as { id: string }).id }, { via: "STAFF", now: at(addDays(DH, 1), "00:30") });
    ok(!c.ok && c.code === "TOO_LATE", `ได้ ${fmt(c)}`);
  }, "MAJOR");

  // ═══════════════ E ปุ่มทุกปุ่มเปลี่ยนสถานะจริง (browser) ═══════════════
  const E_NAME = "เจ้าของ (browser · /booking?at=14:40): กด call → skip → recall → checkin → start → done → move → noshow (ConfirmDialog) → รับ walk-in ⇒ ฐานเปลี่ยนตามทุกปุ่ม (poll ≤ 15 วิ)";
  if (hReady) skip("E-1", E_NAME, hReady, "MAJOR");
  else {
    await st("E-1", E_NAME, async () => {
      type Pg = { setCookie(...c: object[]): Promise<void>; goto(u: string, o: object): Promise<unknown>; evaluate<R, A>(f: (a: A) => R, a: A): Promise<R>; select(s: string, v: string): Promise<string[]>; close(): Promise<void> };
      type Br = { newPage(): Promise<Pg>; close(): Promise<void> };
      const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as { default: { launch(o: object): Promise<Br> } };
      const profile = `/tmp/chr-svc-b5-${process.pid}`;
      const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${profile}`] });
      const T40 = at(D, "14:40");
      const url = `${BASE}/app/u/${SLUGS[ids.uS]}/booking?at=${encodeURIComponent(T40.toISOString())}`;
      const token = (await mint(ids.uOwner, ids.tA)).split(";")[0].split("=")[1];
      const host = new URL(BASE).hostname;
      const done: string[] = [];
      try {
        const page = await browser.newPage();
        await page.setCookie({ name: BASE.startsWith("https:") ? "__Host-shark_session" : "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: ids.tA, domain: host, path: "/" });
        const open = async () => { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }); await sleep(1500); };
        const click = async (sel: string) => {
          const hit = await page.evaluate((s: string) => {
            const el = document.querySelector(s) as HTMLElement | null;
            if (!el) return false;
            let p: HTMLElement | null = el;
            while (p) { if (p.tagName === "DETAILS") p.setAttribute("open", ""); p = p.parentElement; }
            el.click();
            return true;
          }, sel);
          ok(hit, `ไม่พบ ${sel}`);
        };
        const pollUntil = async (what: string, f: () => Promise<boolean>) => { const t0 = Date.now(); while (Date.now() - t0 < 15_000) { if (await f()) return; await sleep(400); } throw new AssertFail(`${what}: ฐานไม่เปลี่ยนใน 15 วิ (ทำแล้ว: ${done.join(" → ")})`); };
        const pick = async (a: LineAction): Promise<string> => {
          const v = await TL.load()(cS, V.owner, { now: T40 });
          const cand = [...(v ? allJobs(v) : []).map((j) => ({ id: j.appointmentId, acts: j.actions })), ...(v?.todo ?? []).map((t) => ({ id: t.appointmentId, acts: t.actions }))].find((x) => x.acts.includes(a));
          ok(!!cand, `ไม่มีงานที่มีปุ่ม ${a} ณ 14:40`);
          return cand!.id;
        };
        const btn = (a: string, id: string) => `[data-line-action="${a}"][data-appointment-id="${id}"]`;
        // call → skip → recall บนงานเดียวกัน
        await open();
        const c = await pick("call");
        const tk0 = (await apRow(c)).queueTicketId;
        const cc0 = (await tkRow(tk0)).callCount;
        await click(btn("call", c));
        await pollUntil("call", async () => (await tkRow(tk0)).callCount === cc0 + 1); done.push("call");
        await open(); await click(btn("skip", c));
        await pollUntil("skip", async () => (await tkRow(tk0)).status === "SKIPPED"); done.push("skip");
        await open(); await click(btn("recall", c));
        await pollUntil("recall", async () => (await tkRow(tk0)).status === "CALLED"); done.push("recall");
        await open();
        const ci = await pick("checkin");
        await click(btn("checkin", ci));
        await pollUntil("checkin", async () => (await apRow(ci)).status === "ARRIVED"); done.push("checkin");
        await open();
        const s = await pick("start");
        await click(btn("start", s));
        await pollUntil("start", async () => (await apRow(s)).status === "IN_SERVICE"); done.push("start");
        await open();
        const d = await pick("done");
        await click(btn("done", d));
        await pollUntil("done", async () => (await apRow(d)).status === "DONE"); done.push("done");
        await open();
        const m = await pick("move");
        const m0 = (await apRow(m)).staffId;
        const options = await page.evaluate((id: string) => [...document.querySelectorAll(`[data-line-move="${id}"] select[name="toStaffId"] option`)].map((o) => (o as HTMLOptionElement).value).filter(Boolean), m);
        ok(options.length > 0, "ไม่มีตัวเลือกช่างในฟอร์มย้าย");
        let moved = false;
        for (const opt of options.filter((o) => o !== m0)) {
          await page.evaluate((a: { id: string; v: string }) => { const s2 = document.querySelector(`[data-line-move="${a.id}"] select[name="toStaffId"]`) as HTMLSelectElement | null; if (s2) s2.value = a.v; }, { id: m, v: opt });
          await click(btn("move", m));
          const t0 = Date.now();
          while (Date.now() - t0 < 8_000 && !moved) { moved = (await apRow(m)).staffId !== m0; if (!moved) await sleep(400); }
          if (moved) break;
          await open();
        }
        ok(moved, "ย้ายช่างไม่เปลี่ยน staffId (ลองทุกตัวเลือก)"); done.push("move");
        await open();
        const n = await pick("noshow");
        await click(`[data-testid="line-noshow-${n}-trigger"]`);
        await sleep(500);
        await click(`[data-testid="line-noshow-${n}-sheet"] button[type="submit"]`);
        await pollUntil("noshow", async () => (await apRow(n)).status === "NO_SHOW"); done.push("noshow");
        await open();
        const w0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1 AND kind = 'WALKIN'`, [ids.uS]))[0].n;
        await click("[data-line-walkin-form] button[type=\"submit\"]");
        await pollUntil("walkin", async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1 AND kind = 'WALKIN'`, [ids.uS]))[0].n === w0 + 1); done.push("walkin");
        await page.close();
      } finally {
        await browser.close();
        for (const p of [profile, `/tmp/snap-private-tmp/snap.chromium${profile}`]) { try { rmSync(p, { recursive: true, force: true }); } catch { /* ไม่มี */ } }
      }
    }, "MAJOR");
  }

  // ═══════════════ Q ฉาก svcqc ═══════════════
  console.log("\n── Q: ฉากภาพบนร้าน svcqc (scripts/svc-qc-today-line-scene.mts) ──");
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
    await st("Q-1", `ฉาก svcqc รันได้ (exit 0) · พิมพ์ SCENE_SUMMARY {created,updated,removed} · วันฉาก ${D}`, () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const r = runTsx(F.scene);
      ok(r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof (r.sum as Record<string, unknown>)[k] === "number"), `exit=${r.status} ${r.sum ? fmt(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`);
    }, "MAJOR");
    await st("Q-2", "loadTodayLine บน svcqc (เจ้าของ ณ วันฉาก 14:20): A011 แจ๊ค 15:25 · แถวรอ 6 ช่องแรกตามภาพ · เลขบัตร A009/P006 · ตัวเลขบน · myStaffIds(ek) = [ช่างเอก] (ฉากผูก HR)", async () => {
      const ctx = { tenantId: SQC.tenant.id, unitId: SQC.units.barber.id };
      const owner = SQC.users.find((u) => u.key === "owner")!;
      const ek = SQC.users.find((u) => u.key === "ek")!;
      const v = await TL.load()(ctx, { userId: owner.userId, access: ACC.owner }, { now: NOW });
      ok(!!v, "null (ฉากเปิดแถวเดียวหรือยัง?)");
      const a11 = allJobs(v!).find((j) => j.ticketNumber === "A011");
      eq([a11?.staffId, hhmm(a11?.plannedStartMs)], [SCENE.staffIds.jack, "15:25"], "A011");
      eq(v!.waiting.slice(0, 6).map((j) => j.ticketNumber ?? j.label), ["A009", "P006", "A010", "คุณบีม", "A011", "คุณแพรว"], "แถวรอ");
      eq(v!.kpi, { ...SCENE.expect.kpi }, "kpi");
      eq(await TL.mine()(ctx, ek.userId), [SCENE.staffIds.ek], "myStaffIds ek");
    }, "MAJOR");
    await st("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const r = runTsx(F.scene);
      ok(r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${fmt(r.sum)}`);
    }, "MAJOR");
  }

  // ═══════════════ V ภาพ ═══════════════
  console.log("\n── V: ภาพ (จอง 01 · ของฉัน · ปฏิทินรายวัน) ──");
  {
    const specs = SQC_VISUAL_SPECS["b.5"];
    const base = process.env.QC_BASE ?? "";
    for (const [id, user] of [["V-1", "owner"], ["V-2", "ek"], ["V-3", "cashier"]] as const) {
      const name = `ภาพ b.5 (booking-today-line · booking-mine · booking-day) 1440 + 390 ด้วยผู้ใช้ ${user} · HTTP < 400 · ไม่ล้นแนวนอน · ไม่มี page error`;
      if (!Array.isArray(specs) || specs.length !== 3) record(id, name, "FAIL", `SQC_VISUAL_SPECS b.5 ${fmt(specs)}`, "MAJOR");
      else if (!base) skip(id, name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + รันฉาก + เปิด server ด้วย SVC_QC_CLOCK=1 แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
      else {
        const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "b.5", "--user", user, "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
        if (r.status === 0) record(id, `${name} (ภาพ .qc-shots/svc/b.5 — ผู้คุมเทียบ PARITY กับ ledger/design-booking/01-today-line.png)`, "PASS", "", "MAJOR");
        else record(id, name, "FAIL", `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
      }
    }
  }
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup([ids.tA, ids.tB]); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupUsers();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b5-*` 0 · นัด/บัตร/outbox/ค่าตั้ง/HR ของร้านทดสอบ 0 · ผู้ใช้/session ทดสอบ 0 (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย scripts/svc-qc-today-line-scene.mts --clear)", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "QueueTicket", "QueueType", "OutboxEvent", "SettingValue", "BookingStaff", "HrEmployee", "AppSystem"]) {
      if (!(await cols(t)).length) continue;
      eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n, 0, t);
    }
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]))[0].n, 0, "user");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Session" WHERE "userAgent" = $1`, [UA]))[0].n, 0, "session");
  }, "MAJOR");
  await pool.end();
}

// ═══════════════ S. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── S: ไฟล์ · สัญญาโค้ด ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const OWN = new Set<string>([F.today, F.access, F.ops, F.line, F.run, F.service, F.index, F.queue, F.queueActions, F.actions, F.bookingActions, F.perms, F.page, F.layout, F.dayPage, F.minePage, F.queuePage]);
{
  const ch = dirty(["src", "prisma"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.today}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ", "B.5 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1 · คอมโพเนนต์ใหม่ใต้ src/components/booking/ ได้) · มีไฟล์ใหม่ today-line/line-access/line-ops/booking-line/คอมโพเนนต์ 3/หน้า day+mine", () => {
    const outside = ch.filter((f) => !OWN.has(f) && !f.startsWith("src/components/booking/"));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = [F.today, F.access, F.ops, F.actions, F.compLine, F.compMine, F.compDay, F.dayPage, F.minePage].filter((f) => !ch.includes(f) && !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("S-2", "ไม่มี migration/แก้ schema · ตัววางคิว planner.ts (B.2) ไม่ถูกแตะ", () => { eq(dirty(["prisma", F.planner]), [], "ไฟล์"); });
await st("S-3", `action «${F.actions}»: "use server" · export async function เท่านั้น · ทุกตัวเรียก requireUnit → authorizeLineOp ก่อน facade · ส่ง actorUserId · อ่าน at เฉพาะใต้ SVC_QC_CLOCK`, () => {
  const s = src(F.actions);
  ok(!!s, `ยังไม่มี ${F.actions}`);
  ok(/^\s*["']use server["']/.test(s), "ไม่มี use server บรรทัดแรก");
  const code = stripComments(s);
  ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(code.replace(/export\s+async\s+function/g, "")), "export อื่นที่ไม่ใช่ async function");
  const fns = [...code.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1], at: m.index ?? 0 }));
  ok(fns.length >= 9, `action ${fns.length} ตัว (ต้อง ≥ 9: call recall skip start done move checkin noshow walkin)`);
  const FACADE = /\b(callJob|recallJob|skipJob|startJob|completeJob|moveJobStaff|checkIn|createWalkIn|setAppointmentStatus|cancelByShop)\s*\(/;
  const bad: string[] = [];
  fns.forEach((f, i) => {
    const body = code.slice(f.at, fns[i + 1]?.at ?? code.length);
    const iReq = body.search(/requireUnit\s*\(/), iAuth = body.search(/authorizeLineOp\s*\(/), iFac = body.search(FACADE);
    if (iReq < 0 || iAuth < 0 || iFac < 0 || !(iReq < iAuth && iAuth < iFac)) bad.push(`${f.name}(req ${iReq} auth ${iAuth} facade ${iFac})`);
    if (!/actorUserId/.test(body) && !/actorUserId/.test(code.slice(0, fns[0].at))) bad.push(`${f.name}: ไม่ส่ง actorUserId`);
  });
  ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  if (/["']at["']/.test(code)) ok(/SVC_QC_CLOCK/.test(code), "อ่าน at โดยไม่มีด่าน SVC_QC_CLOCK");
}, "CRITICAL");
await st("S-4", "หน้า /booking: ใช้ loadTodayLine + lineAccess · ร้านไม่เปิดแถวเดียว ⇒ จอเดิม (ยังมี 'รายการนัด') · ไม่มีสิทธิ์ดู ⇒ notFound · AutoRefresh เดิม · ?at= อ่านเฉพาะใต้ SVC_QC_CLOCK · หน้า /booking/mine + /booking/day มีอยู่ (loadTodayLine/loadDayCalendar · notFound เมื่อ null)", () => {
  const p = stripComments(src(F.page));
  ok(/loadTodayLine/.test(p) && /lineAccess/.test(p), "page ไม่เรียก loadTodayLine/lineAccess");
  ok(p.includes("รายการนัด"), "จอเดิมของร้านที่ไม่เปิดแถวเดียวหาย");
  ok(/notFound\s*\(/.test(p) && /AutoRefresh/.test(p) && /queue-auto-refresh/.test(p), "notFound/AutoRefresh");
  if (/\bat\b/.test(p.replace(/\bat:/g, ""))) ok(/SVC_QC_CLOCK/.test(p), "อ่าน ?at= โดยไม่มีด่าน SVC_QC_CLOCK");
  const m = stripComments(src(F.minePage)), d = stripComments(src(F.dayPage));
  ok(!!m && /loadTodayLine/.test(m) && /notFound\s*\(/.test(m) && /AutoRefresh/.test(m), "mine/page.tsx");
  ok(!!d && /loadDayCalendar/.test(d) && /notFound\s*\(/.test(d), "day/page.tsx");
}, "MAJOR");
await st("S-5", "หน้า /queue: หน่วย BOOKING ที่เปิดแถวเดียว ⇒ redirect ไป /booking (หน่วย QUEUE เดิมเหมือนเดิม) · action คิวเดิมที่แตะบัตร (issue · callNext · recall · skip · serve · done · cancel · recallSkipped · transfer) ผ่าน ticketCtxOf ที่ปฏิเสธหน่วยที่ไม่ใช่ QUEUE", () => {
  const p = stripComments(src(F.queuePage));
  ok(/redirect\s*\(/.test(p) && /\/booking/.test(p) && /BOOKING/.test(p), "queue/page.tsx ไม่ redirect หน่วย BOOKING");
  const a = stripComments(src(F.queueActions));
  ok(/function\s+ticketCtxOf/.test(a) && /type\s*!==\s*["']QUEUE["']|type\s*===\s*["']QUEUE["']/.test(a), "ไม่มี ticketCtxOf ที่ตรวจ QUEUE");
  const bodyOf = (re: RegExp) => { const i = a.search(re); if (i < 0) return null; const j = a.slice(i + 10).search(/\n(export\s|async\s+function\s|function\s)/); return a.slice(i, j < 0 ? a.length : i + 10 + j); };
  const opById = bodyOf(/async\s+function\s+opById\b/);
  const opByIdOk = !!opById && /ticketCtxOf\s*\(/.test(opById) && !/\bctxOf\s*\(/.test(opById.replace(/ticketCtxOf/g, ""));
  const bad: string[] = [];
  for (const n of ["issueTicketAction", "callNextAction", "recallAction", "skipAction", "serveAction", "doneAction", "cancelAction", "recallSkippedAction", "transferAction"]) {
    const body = bodyOf(new RegExp(`export\\s+async\\s+function\\s+${n}\\b`));
    if (!body) { bad.push(`${n} หาย`); continue; }
    const direct = /ticketCtxOf\s*\(/.test(body) && !/\bctxOf\s*\(/.test(body.replace(/ticketCtxOf/g, ""));
    const viaOp = /\bopById\s*\(/.test(body) && opByIdOk && !/\bctxOf\s*\(/.test(body.replace(/ticketCtxOf/g, ""));
    if (!direct && !viaOp) bad.push(n);
  }
  ok(bad.length === 0, `ไม่ผ่าน ticketCtxOf: ${bad.join(", ")}`);
}, "MAJOR");
await st("S-6", `หนี้ B.3: ${F.bookingActions} WARN "pos.deposit.forfeit_failed" ยิงเฉพาะเมื่อริบมัดจำล้มจริง (ผลมี forfeit) — ไม่ใช่ทุกความล้มเหลว (LOST_RACE/ปลุกนัดชน/ไม่พบนัด)`, () => {
  const s = stripComments(src(F.bookingActions));
  const i = s.indexOf("pos.deposit.forfeit_failed");
  ok(i > 0, "ไม่พบ logOps forfeit_failed");
  const pre = s.slice(Math.max(0, i - 260), i);
  ok(/["']forfeit["']\s+in\s+st/.test(pre) && !/!\s*\(\s*["']unforfeit["']\s+in\s+st\s*\)/.test(pre), `เงื่อนไขก่อน WARN: …${pre.slice(-160).replace(/\s+/g, " ")}`);
}, "MINOR");
await st("S-7", "ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/.getMinutes/.getDate/.getMonth/.getFullYear) ใน today-line · line-access · line-ops · คอมโพเนนต์ 3", () => {
  const bad: string[] = [];
  const files = [F.today, F.access, F.ops, F.compLine, F.compMine, F.compDay];
  const miss = files.filter((f) => !existsSync(join(ROOT, f)));
  ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  for (const f of files) src(f).split("\n").forEach((l, i) => { if (/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)/.test(l.replace(/\/\/.*$/, ""))) bad.push(`${f}:${i + 1}`); });
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
}, "MAJOR");
await st("S-8", "line-access.ts pure (import ได้แค่ @/lib/core/rbac + type) · วินัย CAS ใน line-ops.ts (ไม่มี .appointment.update( / .queueTicket.update( · ไม่มีตัวกันในหน่วยความจำ)", () => {
  const a = stripComments(src(F.access));
  ok(!!a, `ยังไม่มี ${F.access}`);
  const specs = [...a.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
  ok(specs.every((x) => x === "@/lib/core/rbac"), `import ${specs.join(",")}`);
  const o = stripComments(src(F.ops));
  ok(!!o, `ยังไม่มี ${F.ops}`);
  ok(!/\.(appointment|queueTicket)\.update\s*\(/.test(o), "line-ops มี .update( แบบไม่ CAS");
  ok(!/new\s+Mutex|async-mutex|new\s+Map<[^>]*Promise/.test(o), "ตัวกันในหน่วยความจำ");
}, "MAJOR");
await st("S-9", "ไม่มี event ใหม่ (ข้าม = QueueTicketEvent · เรียกคืน = queue.ticket.called เดิม · ย้ายช่าง = booking.rescheduled เดิม) ⇒ 3 ทะเบียน event ไม่ถูกแตะ", () => {
  eq(dirty(["src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts"]), [], "ทะเบียน event");
}, "MINOR");

// ═══════════════ G. regression ═══════════════
console.log("\n── G: regression จองคิว + คิว + smoke ──");
const judgeSvc = (allowSkip: (id: string) => boolean) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed: string[]; skipped?: string[] };
  return j.failed.length === 0 && (j.skipped ?? []).every(allowSkip);
};
const REG: { s: string; args?: string[]; env?: Record<string, string>; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1"), note: "ไม่มี FAIL · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.3", env: { SVC_B3_NO_REGRESSION: "1" }, judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1"), note: "ไม่มี FAIL · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.2" },
  { s: "qc-booking-race" }, { s: "qc-booking-deposit" }, { s: "qc-booking-edit-schedule" },
  { s: "qc-queue-public" },
  { s: "qc-systems", judge: (out) => /✅ Queue:/.test(out) && !/❌ Queue/.test(out), note: "บรรทัด Queue ✅" },
  { s: "qc-svc-r0.2", judge: judgeSvc((x) => x.startsWith("V-")), note: "ไม่มี FAIL (สิทธิ์ ek/cashier ใหม่ · ต้อง reseed ก่อน)" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof (todayLoad.mod as TodayApi | null)?.loadTodayLine === "function" && typeof (opsLoad.mod as OpsApi | null)?.skipJob === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (today-line.loadTodayLine / line-ops.skipJob) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B5_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b5-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.5 · จอคิววันนี้แถวเดียว =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: H-*/E-1/V-* ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed · G-* เมื่อ --no-regression — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
