// QC — SVC B.14 · ปฏิทินนัด วัน/สัปดาห์ ตามคน/ตามห้อง · ลากย้าย · คลิกช่องว่างจองให้ลูกค้า · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.14.md (§2 หลัก · §3 สัญญา · §4 จอ · §9 ค่าที่เลือก) · MASTER-PLAN แถว B.14 · DESIGN-BOOKING-QUEUE R6
//        ภาพ ledger/design-booking/02-calendar-resources.png · ด่านคน J5 (B.3/B.4) · ด่านทรัพยากร B.13 (§4.6 + มติ Q1–Q19 /root/svc-runs/fix/b13.md)
//
// กลุ่มข้อ:
//   C   loadCalendar: วัน·คน · วัน·ห้อง (ทรัพยากร B.13 = คอลัมน์ "ตามห้อง") · สัปดาห์ · ลาปิดคอลัมน์ · ปิดซ่อม · สรุป · ตอนนี้ (walk-in/ห้อง) · null/404 · X10
//   M   moveAppointment (ลากย้าย = rescheduleByShop ด่านเดียวกับจอง): สำเร็จ · ชนคน · ชน J5 · ชนห้อง · ห้องที่ระบุ · ลา/ทำไม่ได้/นอกเวลา/อดีต · สถานะ · จอเก่า · event ไป-กลับ · ล้มไม่เขียน
//   P   สิทธิ์ (booking.appointment.reschedule / .create) · X1 ข้ามร้าน/หน่วย ⇒ NOT_FOUND/null · K จองจากปฏิทิน (bookForCustomer)
//   XC  ยิงพร้อมกัน 5 โพรเซส ≥ 10 ทาง: ช่องคนเดียว ⇒ 1 · ห้องเดียว ⇒ 1 · จอเก่า 10 ทาง ⇒ 1 · ลาก ∥ จอง ⇒ 1 · ลาก ∥ ปิดซ่อม ⇒ ไม่ซ้อน · deadlock 0
//   U   คอมโพเนนต์ (renderToStaticMarkup) + หน้า/action/แท็บ · Q ฉาก svcqc · V ภาพ จอง 02 · A แก้เวลามาถึง (รอเจ้าของ — SKIP จนส่ง --arrival)
//   SF  ไฟล์ (accept-time) · G regression · Z ล้าง
//
// เวลา: วันทดสอบอนาคตคงที่ (วันไทย +5…+14) · now จริง (moveAppointment ไม่ฉีด now ยกเว้นที่ระบุ) · ร้านทดสอบ slug `qc-svc-b14-*` ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.14.mts [--no-regression] [--arrival]
//      (ห้าม timeout ครอบ · `--no-regression` = ข้าม G เป็น SKIP · `--arrival` = เปิดหมวด A หลังเจ้าของตอบ "เอา" (ใบสั่ง §9 ข้อ 1) · QC_BASE=http://127.0.0.1:<port> เปิด V-1)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_CALENDAR_SCENE, SQC_VISUAL_SPECS } from "./svc-qc-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.14";
const F = {
  cal: "src/lib/modules/booking/calendar.ts",
  line: "src/lib/modules/booking/queue-line.ts",
  service: "src/lib/modules/booking/service.ts",
  access: "src/lib/modules/booking/access.ts",
  index: "src/lib/modules/booking/index.ts",
  actions: "src/lib/actions/booking-calendar.ts",
  page: "src/app/app/u/[unitSlug]/booking/calendar/page.tsx",
  layout: "src/app/app/u/[unitSlug]/booking/layout.tsx",
  comp: "src/components/booking/CalendarBoard.tsx",
  scene: "scripts/svc-qc-calendar-scene.mts",
};
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B14_NO_REGRESSION === "1";
const ARRIVAL = process.argv.includes("--arrival");
const BASE = process.env.QC_BASE ?? "";

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type CalMode = "STAFF" | "RESOURCE";
type CalRange = "DAY" | "WEEK";
type CalBlock = {
  appointmentId: string; kind: "BOOKED" | "WALKIN"; status: string; startMs: number; endMs: number; holdEndMs: number; label: string; serviceName: string;
  staffId: string | null; staffName: string | null; resourceIds: string[]; resourceNames: string[]; ticketNumber: string | null; movable: boolean;
};
type ClosedCode = "LEAVE" | "OFF" | "SHOP_CLOSED" | "MAINTENANCE";
type CalColumn = {
  key: string; kind: "STAFF" | "RESOURCE" | "UNASSIGNED"; id: string | null; name: string; sub: string; dateStr: string;
  closed: null | { code: ClosedCode; reasonTh: string }; maintenance: { startMs: number; endMs: number }[]; blocks: CalBlock[];
};
type LimitedBy = "NONE" | "STAFF" | "RESOURCE" | "BOTH";
type WalkInNowRow = { serviceId: string; serviceName: string; closed: boolean; startAt: Date | null; staffId: string | null; resourceIds: string[]; limitedBy: LimitedBy; reasonTh: string };
type ResNow = { id: string; name: string; kind: string; state: "BUSY" | "NEXT" | "FREE" | "MAINT"; nextStartMs: number | null };
type CalendarView = {
  unitId: string; mode: CalMode; range: CalRange; dateStr: string; days: string[]; prevDateStr: string; nextDateStr: string; todayStr: string; nowMs: number;
  openMin: number | null; closeMin: number | null; providerLabel: string; focusId: string | null; focusOptions: { id: string; name: string }[];
  columns: CalColumn[]; access: { move: boolean; book: boolean };
  summary: { staffWorking: number; staffOnLeave: number; resources: { kind: string; labelTh: string; count: number }[] };
  walkInNow: WalkInNowRow[] | null; resourcesNow: ResNow[] | null;
};
type CalMoveTo = { dateStr: string; startMin: number; staffId?: string; resourceId?: string };
type CalMoveResult = { ok: true; appointmentId: string; startAt: Date; staffId: string; resourceIds: string[] } | { ok: false; code: string; reason: string };
type BookResult = { ok: true; id: string; staffId: string; status: "PENDING" | "CONFIRMED"; holdUntil: Date | null } | { ok: false; code: string; reason: string };
type BookForInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; customerName: string; customerPhone: string; note?: string; idempotencyKey: string };
type CalApi = {
  loadCalendar?: (ctx: Ctx, actor: Actor, opts: { dateStr: string; range?: CalRange; mode?: CalMode; focusId?: string; now?: Date }) => Promise<CalendarView | null>;
  moveAppointment?: (actor: Actor, ctx: Ctx, id: string, to: CalMoveTo, opts: { expect: { startAt: string; staffId: string }; now?: Date }) => Promise<CalMoveResult>;
  bookForCustomer?: (actor: Actor, ctx: Ctx, i: BookForInput) => Promise<BookResult>;
  correctArrivalTime?: (actor: Actor, ctx: Ctx, id: string, arrivedAtIso: string, opts?: { now?: Date }) => Promise<{ ok: boolean; code?: string; reason?: string }>;
};
type BookingApi = { bookAppointment: (ctx: Ctx, i: { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: "STAFF" | "ONLINE"; customerName: string; customerPhone: string; idempotencyKey?: string }) => Promise<BookResult> };
type ResApi = {
  walkInNowByService?: (ctx: Ctx, opts?: { now?: Date }) => Promise<WalkInNowRow[]>;
  setResourceMaintenance?: (actor: Actor, ctx: Ctx, id: string, windows: { startAt: string; endAt: string | null; note?: string }[], opts?: { now?: Date }) => Promise<{ ok: boolean; code?: string }>;
};
type AccessApi = { BOOKING_ACTIONS?: Record<string, readonly string[]>; canBookingAction?: (m: { role: string; unitAccess: string[]; permissions: Record<string, unknown> } | null, unitId: string, action: string) => boolean };
type SettingsApi = {
  setSettings: (actor: Actor, ctx: { tenantId: string }, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<{ ok: boolean; code?: string; issues?: unknown }>;
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<{ ok: boolean; code?: string; issues?: unknown }>;
  resolveSettings: (ctx: { tenantId: string }, keys: string[], refs: Record<string, string>) => Promise<Record<string, { value: unknown }>>;
};

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 260) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
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
const MIN = 60_000;
const THAI = /[฀-๿]/;
const isThai = (s: unknown) => typeof s === "string" && THAI.test(s);
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const at = (ds: string, min: number): Date => new Date(bkkMs(ds, min));
const bkkDay = (ms: number): string => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
const HM = (ms: number | null | undefined): string => (ms == null ? "null" : new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16));
/** จันทร์ของสัปดาห์ที่มีวันนี้ (ISO · คิดจากวันที่ปฏิทินล้วน) */
const mondayOf = (ds: string): string => { const [y, m, d] = ds.split("-").map(Number); const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return addDays(ds, -((wd + 6) % 7)); };
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");

// ═══════════════ โหลดโมดูล ═══════════════
const loadIf = async <T,>(rel: string, spec: string) => (existsSync(join(ROOT, rel)) ? tryImport<T>(spec) : { mod: null as T | null, err: `ยังไม่มีไฟล์ «${rel}»` });
const calLoad = await loadIf<CalApi>(F.cal, "@/lib/modules/booking/calendar");
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const resLoad = await tryImport<ResApi>("@/lib/modules/booking/resources");
const accessLoad = await tryImport<AccessApi>("@/lib/modules/booking/access");
// ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock) ▸ ฉากแข่ง "เลื่อน ∥ ปิดซ่อม/ลดความจุ" ทั้งสองเส้น (rescheduleByShop · rescheduleBySelf) ◂
type ReschedOut = { ok: boolean; code?: string; reason?: string };
type LockApi = {
  rescheduleByShop?: (ctx: Ctx, id: string, to: { dateStr: string; startMin: number; staffId?: string }, opts?: { now?: Date }) => Promise<ReschedOut>;
  rescheduleBySelf?: (ctx: Ctx, id: string, to: { dateStr: string; startMin: number; staffId: string | null }, opts?: { now?: Date }) => Promise<ReschedOut>;
  updateResource?: (actor: Actor, ctx: Ctx, id: string, patch: { capacity?: number }, opts?: { now?: Date }) => Promise<{ ok: boolean; code?: string }>;
};
const lineLoadB14 = await tryImport<LockApi>("@/lib/modules/booking/queue-line");
const fnOf = <Fn,>(load: { mod: unknown; err: string }, name: string, rel: string): Fn => {
  const f = (load.mod as Record<string, unknown> | null)?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as Fn;
};
const CAL = {
  load: () => fnOf<NonNullable<CalApi["loadCalendar"]>>(calLoad, "loadCalendar", F.cal),
  move: () => fnOf<NonNullable<CalApi["moveAppointment"]>>(calLoad, "moveAppointment", F.cal),
  book: () => fnOf<NonNullable<CalApi["bookForCustomer"]>>(calLoad, "bookForCustomer", F.cal),
  arrival: () => fnOf<NonNullable<CalApi["correctArrivalTime"]>>(calLoad, "correctArrivalTime", F.cal),
};
const BK = (): BookingApi => { if (!bookingLoad.mod) throw new AssertFail(`โหลด booking/service ไม่ได้ (${bookingLoad.err})`); return bookingLoad.mod; };
const RSX = {
  now: () => fnOf<NonNullable<ResApi["walkInNowByService"]>>(resLoad, "walkInNowByService", "resources.ts"),
  maint: () => fnOf<NonNullable<ResApi["setResourceMaintenance"]>>(resLoad, "setResourceMaintenance", "resources.ts"),
};
const hasCal = typeof calLoad.mod?.loadCalendar === "function" && typeof calLoad.mod?.moveAppointment === "function";

// ═══════════════ โหมดลูกโพรเซส (ยิงพร้อมกัน) ═══════════════
type CallSpec =
  | { fn: "move"; actor: Actor; ctx: Ctx; id: string; to: CalMoveTo; expect: { startAt: string; staffId: string } }
  | { fn: "book"; actor: Actor; ctx: Ctx; input: BookForInput }
  | { fn: "maint"; actor: Actor; ctx: Ctx; id: string; windows: { startAt: string; endAt: string | null; note?: string }[] }
  | { fn: "shop"; ctx: Ctx; id: string; to: { dateStr: string; startMin: number; staffId: string } } // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock)
  | { fn: "self"; ctx: Ctx; id: string; to: { dateStr: string; startMin: number; staffId: string } } // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock)
  | { fn: "cap"; actor: Actor; ctx: Ctx; id: string; capacity: number }; // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock)
type CallOut = { fn: CallSpec["fn"]; ok: boolean; code: string | null; id: string | null; threw: string | null };
type ChildSpec = { run: string; idx: number; scenarios: { key: string; calls: CallSpec[] }[] };
type Scenario = { key: string; perChild: CallSpec[][] };
const RUN = Date.now().toString(36);
const goFile = (run: string, key: string) => `/tmp/svc-b14-go-${run}-${key}`;
async function runCall(c: CallSpec): Promise<CallOut> {
  const o: CallOut = { fn: c.fn, ok: false, code: null, id: null, threw: null };
  try {
    if (c.fn === "move") { const r = await CAL.move()(c.actor, c.ctx, c.id, c.to, { expect: c.expect }); return r.ok ? { ...o, ok: true, id: c.id } : { ...o, id: c.id, code: r.code }; }
    if (c.fn === "book") { const r = await CAL.book()(c.actor, c.ctx, c.input); return r.ok ? { ...o, ok: true, id: r.id } : { ...o, code: r.code }; }
    // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock)
    if (c.fn === "shop" || c.fn === "self") {
      const f = c.fn === "shop" ? lineLoadB14.mod?.rescheduleByShop : (bookingLoad.mod as unknown as LockApi | null)?.rescheduleBySelf;
      if (typeof f !== "function") throw new Error(`ไม่มี ${c.fn === "shop" ? "rescheduleByShop" : "rescheduleBySelf"}`);
      const r = await f(c.ctx, c.id, c.to);
      return r.ok ? { ...o, ok: true, id: c.id } : { ...o, id: c.id, code: r.code ?? "FAIL" };
    }
    if (c.fn === "cap") {
      const f = (resLoad.mod as unknown as LockApi | null)?.updateResource;
      if (typeof f !== "function") throw new Error("ไม่มี updateResource");
      const r = await f(c.actor, c.ctx, c.id, { capacity: c.capacity });
      return r.ok ? { ...o, ok: true, id: c.id } : { ...o, code: r.code ?? "FAIL" };
    }
    const r = await RSX.maint()(c.actor, c.ctx, c.id, c.windows);
    return r.ok ? { ...o, ok: true, id: c.id } : { ...o, code: r.code ?? "FAIL" };
  } catch (e) {
    return { ...o, threw: errMsg(e).slice(0, 160) };
  }
}
if (process.env.QC_B14_CHILD) {
  const spec = JSON.parse(process.env.QC_B14_CHILD) as ChildSpec;
  try {
    const dbm = (await import("@/lib/core/db")) as unknown as { prisma: { $queryRawUnsafe: (q: string) => Promise<unknown>; $disconnect: () => Promise<void> } };
    await dbm.prisma.$queryRawUnsafe("SELECT 1");
    for (const sc of spec.scenarios) {
      console.log(`READY ${sc.key}`);
      const t0 = Date.now();
      while (!existsSync(goFile(spec.run, sc.key))) { if (Date.now() - t0 > 300_000) { console.log("ABORT"); process.exit(5); } await sleep(10); }
      const outs = await Promise.all(sc.calls.map(runCall));
      console.log(`RES ${sc.key} ${JSON.stringify(outs)}`);
    }
    await dbm.prisma.$disconnect();
    process.exit(0);
  } catch (e) { console.log(`CHILD_ERR ${errMsg(e)}`); process.exit(3); }
}

const settingsLoad = await tryImport<SettingsApi>("@/lib/core/settings");
const SETTINGS = (): SettingsApi => { if (!settingsLoad.mod) throw new AssertFail(`โหลด core/settings ไม่ได้ (${settingsLoad.err})`); return settingsLoad.mod; };

// ── คอมโพเนนต์ (renderToStaticMarkup) ──
type Comp = (p: Record<string, unknown>) => unknown;
const compLoad = existsSync(join(ROOT, F.comp)) ? await tryImport<Record<string, unknown>>(pathToFileURL(join(ROOT, F.comp)).href) : { mod: null, err: `ยังไม่มี ${F.comp}` };
const Board: { c: Comp | null; why: string } = !compLoad.mod ? { c: null, why: compLoad.err }
  : typeof compLoad.mod.default === "function" ? { c: compLoad.mod.default as Comp, why: "" } : { c: null, why: `${F.comp} ไม่มี default export` };
type ReactLike = { createElement: (c: Comp, p: Record<string, unknown>) => unknown };
type RdsLike = { renderToStaticMarkup: (el: unknown) => string };
const React = (await import("react" as string)) as unknown as ReactLike;
const RDS = (await import("react-dom/server" as string)) as unknown as RdsLike;
const noopAction = async (_fd: FormData) => { void _fd; };
const ACTIONS: Record<string, (fd: FormData) => Promise<void>> = Object.fromEntries(["move", "book", "start"].map((k) => [k, noopAction]));
const render = (props: Record<string, unknown>): string => {
  if (!Board.c) throw new AssertFail(Board.why);
  return String(RDS.renderToStaticMarkup(React.createElement(Board.c, { unitSlug: "qc-b14", actions: ACTIONS, ...props }))).replace(/<!-- -->/g, "");
};
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attrsOf = (openTag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const tagName = openTag.slice(1).split(/[\s>/]/)[0];
  for (const m of openTag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) if (m[1] !== tagName) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
};
/** กล่องทุกตัวที่มี attr ชื่อนี้ (แท็กสมดุล) → { attrs, html } ตามลำดับในเอกสาร */
function boxes(html: string, attr: string, val?: string): { attrs: Record<string, string>; html: string }[] {
  const out: { attrs: Record<string, string>; html: string }[] = [];
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
    const attrs = attrsOf(openTag);
    if (val === undefined || attrs[attr] === val) out.push({ attrs, html: html.slice(open, end) });
  }
  return out;
}

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <R extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<R>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb14_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: Record<string, unknown>): Promise<void> {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const SLUG = "qc-svc-b14-";
const USER_MAIL = "qc-svc-b14-";
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
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}

const TODAY = bkkToday();
const dd = (k: number) => addDays(TODAY, 5 + k);
const D = { C: dd(0), M: dd(2), J: dd(3), R: dd(4), K: dd(6), X: dd(8), X2: dd(9) };
const D6 = dd(7); // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock) ▸ วันปลายทางของ XC6/XC7 (ในกรอบจองล่วงหน้าของแม่แบบ SPA)
const TID = (k: string) => `svcb14_${k}_${RUN}`;
const ids = {
  tA: TID("tA"), tB: TID("tB"), owner: TID("owner"), uRunUser: TID("uRunUser"), hrSys: TID("hrSys"), empS1: TID("empS1"), empS4: TID("empS4"),
  uM: TID("uM"), uM2: TID("uM2"), uT: TID("uT"), uF: TID("uF"), uB: TID("uB"), uA: TID("uA"),
  // uM
  OIL: TID("OIL"), THAI: TID("THAI"), HOT: TID("HOT"), PLAIN: TID("PLAIN"),
  rA: TID("rA"), rB: TID("rB"), bed1: TID("bed1"), bed2: TID("bed2"), eq: TID("eq"), rOld: TID("rOld"), bed3: TID("bed3"),
  // uM2 · uB · uF · uT · uA
  M2SVC: TID("M2SVC"), m2s: TID("m2s"), m2r: TID("m2r"), BSVC: TID("BSVC"), bs: TID("bs"), br: TID("br"), FSVC: TID("FSVC"), fs: TID("fs"),
  TOIL: TID("TOIL"), TTHAI: TID("TTHAI"), t1: TID("t1"), t2: TID("t2"), tRA: TID("tRA"), tRB: TID("tRB"), tBed: TID("tBed"), tBed2: TID("tBed2"),
  ASVC: TID("ASVC"), as1: TID("as1"),
};
const sM = [TID("s1"), TID("s2"), TID("s3"), TID("s4")];
const XU = [TID("uX1"), TID("uX2"), TID("uX3"), TID("uX4"), TID("uX5")];
const XL = [TID("uX6"), TID("uX7")]; // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock)
const xStaff = (u: string) => Array.from({ length: 11 }, (_, i) => `${u}_s${i}`);
const xSvc = (u: string, k: "PLAIN" | "OIL30") => `${u}_${k}`;
const xRoom = (u: string) => `${u}_room`;
const cM: Ctx = { tenantId: ids.tA, unitId: ids.uM };
const cM2: Ctx = { tenantId: ids.tA, unitId: ids.uM2 };
const cT: Ctx = { tenantId: ids.tA, unitId: ids.uT };
const cF: Ctx = { tenantId: ids.tA, unitId: ids.uF };
const cA: Ctx = { tenantId: ids.tA, unitId: ids.uA };
const cB: Ctx = { tenantId: ids.tB, unitId: ids.uB };
const cX = (u: string): Ctx => ({ tenantId: ids.tA, unitId: u });
const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
const MGR_M: Actor = { role: "MANAGER", unitAccess: [ids.uM], permissions: {}, userId: TID("mgrM") };
const MGR_OTHER: Actor = { role: "MANAGER", unitAccess: [ids.uM2], permissions: {}, userId: TID("mgrO") };
const ST_RES: Actor = { role: "STAFF", unitAccess: ["*"], permissions: { "booking.appointment.reschedule": true }, userId: TID("stRes") };
const ST_RUN: Actor = { role: "STAFF", unitAccess: ["*"], permissions: { "booking.job.run": true, "booking.appointment.setStatus": true }, userId: ids.uRunUser };
const ST_CREATE: Actor = { role: "STAFF", unitAccess: ["*"], permissions: { "booking.appointment.create": true, "booking.checkin": true }, userId: TID("stCreate") };
const ST_OPER: Actor = { role: "STAFF", unitAccess: ["*"], permissions: { "booking.queue.operate": true, "booking.job.runAny": true }, userId: TID("stOper") };
const ST_NONE: Actor = { role: "STAFF", unitAccess: ["*"], permissions: {}, userId: TID("stNone") };
let phoneN = 0;
const PHONES: string[] = [];
const newPhone = () => { const p = `08${String(71_000_000 + ++phoneN).slice(-8)}`; PHONES.push(p); return p; };
const NAME = "ลูกค้า QC B14";
const bookOk = async (ctx: Ctx, serviceId: string, staffId: string | null, ds: string, min: number, what: string): Promise<string> => {
  const r = await BK().bookAppointment(ctx, { serviceId, staffId, dateStr: ds, startMin: min, channel: "STAFF", customerName: NAME, customerPhone: newPhone(), idempotencyKey: rid("idem") });
  if (!r.ok) throw new AssertFail(`${what}: จอง ${ds} ${HM(bkkMs(ds, min))} ล้ม ${r.code} ${r.reason}`);
  return r.id;
};
type ApRow = {
  id: string; kind: string; status: string; staffId: string; plannedStaffId: string | null; serviceId: string; startAt: Date; endAt: Date; plannedStartAt: Date | null; startedAt: Date | null;
  resourceId: string | null; customerName: string; queueTicketId: string | null; assignMode: string; lateAt: Date | null; rescheduleCount: number; policySnapshot: { job?: { durationMin?: number; bufferMin?: number; resourceIds?: unknown } } | null;
};
const AP_SQL = `SELECT id, kind::text AS kind, status::text AS status, "staffId", "plannedStaffId", "serviceId", "startAt", "endAt", "plannedStartAt", "startedAt", "resourceId", "customerName", "queueTicketId", "assignMode"::text AS "assignMode", "lateAt", "rescheduleCount", "policySnapshot" FROM "Appointment"`;
const apRow = async (id: string): Promise<ApRow> => { const [r] = await q<ApRow>(`${AP_SQL} WHERE id = $1`, [id]); if (!r) throw new AssertFail(`ไม่พบนัด ${id}`); return r; };
/** แถวทั้งแถว (ทุกคอลัมน์) — ใช้พิสูจน์ "ล้ม = ไม่เขียน" */
const fullRow = async (id: string): Promise<string> => JSON.stringify((await q(`SELECT * FROM "Appointment" WHERE id = $1`, [id]))[0] ?? null);
const resIdsOf = (a: { resourceId: string | null; policySnapshot: ApRow["policySnapshot"] }): string[] => {
  const j = a.policySnapshot?.job?.resourceIds;
  if (Array.isArray(j) && j.every((x) => typeof x === "string")) return j as string[];
  return a.resourceId ? [a.resourceId] : [];
};
const obKeys = async (apptId: string): Promise<string[]> =>
  (await q<{ k: string }>(`SELECT "idempotencyKey" AS k FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type = 'booking.rescheduled' AND payload->>'appointmentId' = $2 ORDER BY "createdAt", id`, [[ids.tA, ids.tB], apptId])).map((r) => r.k);
const obAll = async (apptId: string): Promise<number> =>
  (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND payload->>'appointmentId' = $2`, [[ids.tA, ids.tB], apptId]))[0].n;
/** พิสูจน์ "ล้ม = ไม่เขียน": แถวทุกคอลัมน์ + จำนวน event ของนัดเท่าเดิม */
async function noWrite(id: string, fn: () => Promise<{ ok: boolean; code?: string; reason?: string }>, code: string, what: string): Promise<string> {
  const before = await fullRow(id);
  const ev0 = await obAll(id);
  const r = await fn();
  ok(!r.ok, `${what}: ต้องล้ม ${code} แต่สำเร็จ`);
  eq(r.code, code, `${what}: รหัส (${r.reason ?? ""})`);
  ok(isThai(r.reason), `${what}: reason ไม่ใช่ไทย ${fmt(r.reason)}`);
  eq(await fullRow(id), before, `${what}: แถวนัดเปลี่ยน`);
  eq(await obAll(id), ev0, `${what}: มี event ใหม่`);
  return r.reason ?? "";
}
const expOf = async (id: string) => { const a = await apRow(id); return { startAt: a.startAt.toISOString(), staffId: a.staffId }; };
const mv = async (actor: Actor, ctx: Ctx, id: string, to: CalMoveTo, expect?: { startAt: string; staffId: string }) =>
  CAL.move()(actor, ctx, id, to, { expect: expect ?? (await expOf(id)) });
const okMove = async (actor: Actor, ctx: Ctx, id: string, to: CalMoveTo, what: string) => {
  const r = await mv(actor, ctx, id, to);
  if (!r.ok) throw new AssertFail(`${what}: ล้ม ${r.code} ${r.reason}`);
  return r;
};

type Occ = { s: number; e: number };
const overlaps = (a: Occ, b: Occ) => a.s < b.e && b.s < a.e;
/** ตัวตรวจทรัพยากรในฐาน (ชุดเดียวกับ qc-svc-b.13 resViolations · §4.6 ตามมติ Q1/Q2) */
async function resViolations(unitId: string, maint?: Map<string, Occ[]>): Promise<string[]> {
  const res = await q<{ id: string; capacity: number; cleanupMin: number }>(`SELECT id, capacity, "cleanupMin" FROM "SvcResource" WHERE "unitId" = $1`, [unitId]);
  const rows = await q<ApRow & { bufferMin: number }>(`SELECT a.id, a.status::text AS status, a."startAt", a."endAt", a."resourceId", a."plannedStartAt", a."startedAt", a."policySnapshot", s."bufferMin"
    FROM "Appointment" a JOIN "BookingService" s ON s.id = a."serviceId" WHERE a."unitId" = $1 AND a.status::text NOT IN ('CANCELLED','NO_SHOW','DONE')`, [unitId]);
  const occ = new Map<string, Occ[]>(res.map((r) => [r.id, []]));
  for (const a of rows) {
    const s0 = a.startAt.getTime();
    const durMs = typeof a.policySnapshot?.job?.durationMin === "number" ? a.policySnapshot.job.durationMin * MIN : a.endAt.getTime() - s0 - (a.policySnapshot?.job?.bufferMin ?? a.bufferMin) * MIN;
    const s = a.status === "IN_SERVICE" ? (a.startedAt ?? a.plannedStartAt ?? a.startAt).getTime() : (a.plannedStartAt ?? a.startAt).getTime();
    for (const id of resIdsOf(a)) { const r = res.find((x) => x.id === id); if (r) occ.get(id)!.push({ s, e: s + durMs + r.cleanupMin * MIN }); }
  }
  const bad: string[] = [];
  for (const r of res) {
    const xs = occ.get(r.id)!;
    for (const x of xs) {
      const n = xs.filter((u) => u.s <= x.s && u.e > x.s).length;
      if (n > r.capacity) { bad.push(`${r.id.slice(-8)} ซ้อน ${n} > ${r.capacity} ที่ ${HM(x.s)}`); break; }
      if ((maint?.get(r.id) ?? []).some((m) => overlaps(m, x))) { bad.push(`${r.id.slice(-8)} ใช้ช่วงปิดซ่อม ${HM(x.s)}`); break; }
    }
  }
  return bad;
}
const staffOverlap = async (unitId: string): Promise<string[]> => {
  const rows = await q<{ staffId: string; s: Date; e: Date }>(`SELECT "staffId", "startAt" AS s, "endAt" AS e FROM "Appointment" WHERE "unitId" = $1 AND status::text NOT IN ('CANCELLED','NO_SHOW','DONE') ORDER BY "staffId", "startAt"`, [unitId]);
  const bad: string[] = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].staffId === rows[i - 1].staffId && rows[i].s.getTime() < rows[i - 1].e.getTime()) bad.push(`${rows[i].staffId.slice(-6)} ${HM(rows[i].s.getTime())}`);
  return bad;
};
const maintOf = async (unitId: string): Promise<Map<string, Occ[]>> => {
  const rows = await q<{ resourceId: string; startAt: Date; endAt: Date | null }>(`SELECT "resourceId", "startAt", "endAt" FROM "SvcResourceBlock" WHERE "unitId" = $1`, [unitId]);
  const m = new Map<string, Occ[]>();
  for (const r of rows) { const xs = m.get(r.resourceId) ?? []; xs.push({ s: r.startAt.getTime(), e: r.endAt ? r.endAt.getTime() : 8_640_000_000_000_000 }); m.set(r.resourceId, xs); }
  return m;
};
const setS = async (tenantId: string, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => {
  const r = await SETTINGS().setSettings(OWNER, { tenantId }, changes);
  ok(r.ok, `setSettings ${fmt(changes.map((c) => `${c.key}@${c.scope}`))}: ${r.code} ${fmt(r.issues)}`);
};

// ── ตัวอ้างอิงของข้อสอบ (ใบสั่ง §3.1) — คำนวณ view ที่ "ควรเป็น" จากฐานตรง ๆ ──
type RefRow = ApRow & { bufferMin: number; svcName: string };
const refRows = async (unitId: string): Promise<RefRow[]> =>
  q<RefRow>(`SELECT a.id, a.kind::text AS kind, a.status::text AS status, a."staffId", a."plannedStaffId", a."serviceId", a."startAt", a."endAt", a."plannedStartAt", a."startedAt", a."resourceId", a."customerName", a."queueTicketId",
      a."assignMode"::text AS "assignMode", a."lateAt", a."rescheduleCount", a."policySnapshot", s."bufferMin", s.name AS "svcName"
    FROM "Appointment" a JOIN "BookingService" s ON s.id = a."serviceId" WHERE a."unitId" = $1 AND a.status::text <> 'CANCELLED'`, [unitId]);
const dispStart = (a: RefRow): number =>
  a.status === "IN_SERVICE" ? (a.startedAt ?? a.startAt).getTime() : (a.status === "QUEUED" || a.status === "ARRIVED") && a.plannedStartAt ? a.plannedStartAt.getTime() : a.startAt.getTime();
const durMsOf = (a: RefRow): number => typeof a.policySnapshot?.job?.durationMin === "number"
  ? a.policySnapshot.job.durationMin * MIN : a.endAt.getTime() - a.startAt.getTime() - (a.policySnapshot?.job?.bufferMin ?? a.bufferMin) * MIN;
const onDay = (a: RefRow, ds: string) => bkkDay(dispStart(a)) === ds;
/** บล็อกที่ควรอยู่ในคอลัมน์ (เรียง startMs, id) — STAFF: plannedStaffId ?? staffId · RESOURCE: ถือชิ้นนี้ · UNASSIGNED: บริการประกาศชนิดแต่ไม่ถือ */
function refBlocks(rows: RefRow[], ds: string, kind: "STAFF" | "RESOURCE" | "UNASSIGNED", id: string | null, kindsOf: Map<string, string[]>, cleanup: number): { id: string; s: number; e: number; h: number; res: string[] }[] {
  return rows.filter((a) => onDay(a, ds)).filter((a) => {
    if (kind === "STAFF") return (a.plannedStaffId ?? a.staffId) === id;
    if (kind === "RESOURCE") return resIdsOf(a).includes(id ?? "");
    return (kindsOf.get(a.serviceId)?.length ?? 0) > 0 && resIdsOf(a).length === 0;
  }).map((a) => {
    const s = dispStart(a);
    const e = s + durMsOf(a);
    return { id: a.id, s, e, h: kind === "STAFF" ? s + (a.endAt.getTime() - a.startAt.getTime()) : e + cleanup * MIN, res: resIdsOf(a) };
  }).sort((x, y) => x.s - y.s || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
const colBlocks = (c: CalColumn) => c.blocks.map((b) => ({ id: b.appointmentId, s: b.startMs, e: b.endMs, h: b.holdEndMs, res: b.resourceIds }));
const piiLeak = (s: string): string[] => [
  ...PHONES.filter((p) => s.includes(p) || s.includes(p.slice(-4) + '"') || s.includes(`${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`) || s.includes(`+66${p.slice(1)}`)),
  ...(/@qc\.invalid|@[a-z0-9-]+\.[a-z]{2,}/i.test(s) ? ["อีเมล"] : []),
  ...[...s.matchAll(/"(\w*(?:[Pp]hone|[Ee]mail|[Tt]oken|policySnapshot|idempotencyKey|partyId|customerId|manageToken)\w*)"\s*:/g)].map((m) => `คีย์ ${m[1]}`),
];

const goFiles: string[] = [];
let setupOk = false;
let tplOk = false;
const need = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");
const needTpl = () => { need(); ok(tplOk, "ตั้งแม่แบบ/ค่าตั้งไม่สำเร็จ (ดู SETUP)"); };
const ALL_TENANTS = [ids.tA, ids.tB];
const fx: Record<string, string> = {};
const KEY_KINDS = "booking.service.resourceKinds";
const kindsM = new Map<string, string[]>([[ids.OIL, ["ROOM"]], [ids.THAI, ["BED"]], [ids.HOT, ["ROOM", "EQUIPMENT"]], [ids.PLAIN, []]]);
console.log(`\n(วันนี้ไทย ${TODAY} · วันทดสอบ ${D.C} … ${D.X2})`);

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();

  // ═══════════════ สร้างข้อมูล ═══════════════
  try {
    for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) await insertRow("Tenant", { id, name: `QC B14 ร้าน ${n}`, slug: `${SLUG}${n}-${RUN}`, updatedAt: new Date() });
    const units: [string, string, string][] = [[ids.uM, ids.tA, "m"], [ids.uM2, ids.tA, "m2"], [ids.uT, ids.tA, "t"], [ids.uF, ids.tA, "f"], [ids.uA, ids.tA, "ar"], [ids.uB, ids.tB, "b"], ...XU.map((u, i) => [u, ids.tA, `x${i + 1}`] as [string, string, string])];
    for (const [id, t, n] of units) {
      await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `สาขา ${n}`, slug: `b14-${n}-${RUN}`, updatedAt: new Date() });
      for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: new Date() });
    }
    const svc = (id: string, t: string, u: string, name: string, durationMin: number, bufferMin = 0) =>
      insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin, priceSatang: 50000, bufferMin, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    let ord = 0;
    const staff = (id: string, t: string, u: string, name: string, sortOrder: number, employeeId: string | null = null) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder, employeeId, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    const res = (id: string, t: string, u: string, name: string, kind: string, sortOrder: number, cleanupMin: number, active = true) =>
      insertRow("SvcResource", { id, tenantId: t, unitId: u, kind, name, capacity: 1, cleanupMin, active, sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    const block = (t: string, u: string, resourceId: string, s: Date, e: Date | null) =>
      insertRow("SvcResourceBlock", { id: rid("blk"), tenantId: t, unitId: u, resourceId, startAt: s, endAt: e, reason: "ปิดซ่อม QC", updatedAt: new Date() });
    // ผู้ใช้ + HR (ลาของหมอ 4 · ช่าง 1 ผูกผู้ใช้ ST_RUN)
    await insertRow("User", { id: ids.owner, email: `${USER_MAIL}owner-${RUN}@qc.invalid`, name: "QC B14 owner", updatedAt: new Date() });
    await insertRow("User", { id: ids.uRunUser, email: `${USER_MAIL}run-${RUN}@qc.invalid`, name: "QC B14 หมอ 1", updatedAt: new Date() });
    for (const t of ALL_TENANTS) await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    await insertRow("AppSystem", { id: ids.hrSys, tenantId: ids.tA, type: "HR", name: "ทีมงาน", updatedAt: new Date() });
    await insertRow("HrEmployee", { id: ids.empS1, tenantId: ids.tA, systemId: ids.hrSys, name: "หมอ 1", linkedUserId: ids.uRunUser, updatedAt: new Date() });
    await insertRow("HrEmployee", { id: ids.empS4, tenantId: ids.tA, systemId: ids.hrSys, name: "หมอ 4", updatedAt: new Date() });
    await insertRow("HrLeave", { id: rid("lv"), tenantId: ids.tA, systemId: ids.hrSys, employeeId: ids.empS4, type: "VACATION", fromDate: D.C, toDate: D.C, status: "APPROVED" });
    // uM — ร้านนวดหลัก
    await svc(ids.OIL, ids.tA, ids.uM, "น้ำมัน 60", 60); await svc(ids.THAI, ids.tA, ids.uM, "นวดไทย 60", 60, 5); await svc(ids.HOT, ids.tA, ids.uM, "หินร้อน 60", 60); await svc(ids.PLAIN, ids.tA, ids.uM, "นวดคอ 60", 60);
    for (const [i, id] of sM.entries()) await staff(id, ids.tA, ids.uM, `หมอ ${i + 1}`, i + 1, i === 0 ? ids.empS1 : i === 3 ? ids.empS4 : null);
    await insertRow("BookingStaffService", { id: rid("bss"), tenantId: ids.tA, unitId: ids.uM, staffId: sM[2], serviceId: ids.THAI }); // หมอ 3 ทำได้แค่นวดไทย
    await res(ids.rA, ids.tA, ids.uM, "ห้องน้ำมัน A", "ROOM", 1, 15); await res(ids.rB, ids.tA, ids.uM, "ห้องน้ำมัน B", "ROOM", 2, 15);
    await res(ids.bed1, ids.tA, ids.uM, "เตียง 1", "BED", 3, 5); await res(ids.bed2, ids.tA, ids.uM, "เตียง 2", "BED", 4, 5);
    await res(ids.eq, ids.tA, ids.uM, "ชุดหินร้อน", "EQUIPMENT", 5, 10); await res(ids.rOld, ids.tA, ids.uM, "ห้องเก่า", "ROOM", 6, 0, false);
    await res(ids.bed3, ids.tA, ids.uM, "เตียง 3", "BED", 7, 5);
    await block(ids.tA, ids.uM, ids.bed2, at(D.C, 780), at(D.C, 960)); // เตียง 2 ปิดซ่อม 13:00–16:00 วัน C
    await block(ids.tA, ids.uM, ids.bed3, at(D.C, 0), at(addDays(D.C, 1), 0)); // เตียง 3 ปิดซ่อมทั้งวัน C
    await block(ids.tA, ids.uM, ids.rB, at(D.R, 750), at(D.R, 810)); // ห้อง B ปิดซ่อม 12:30–13:30 วัน R (M-7)
    // uM2 (หน่วยอื่นร้านเดียวกัน) · uB (ร้านอื่น) · uF (ร้านเดิม ไม่เปิดแถวเดียว) · uA (หมวด A)
    await svc(ids.M2SVC, ids.tA, ids.uM2, "บริการ M2", 60); await staff(ids.m2s, ids.tA, ids.uM2, "หมอ M2", 1); await res(ids.m2r, ids.tA, ids.uM2, "ห้อง M2", "ROOM", 1, 0);
    await svc(ids.BSVC, ids.tB, ids.uB, "บริการ B", 60); await staff(ids.bs, ids.tB, ids.uB, "หมอร้าน B", 1); await res(ids.br, ids.tB, ids.uB, "ห้องร้าน B", "ROOM", 1, 0);
    await svc(ids.FSVC, ids.tA, ids.uF, "ตัดผม F", 45); await staff(ids.fs, ids.tA, ids.uF, "ช่าง F", 1);
    await svc(ids.ASVC, ids.tA, ids.uA, "นวดคอ A", 60); await staff(ids.as1, ids.tA, ids.uA, "หมอ A", 1);
    // uT (วันนี้ · "ตอนนี้")
    await svc(ids.TOIL, ids.tA, ids.uT, "น้ำมัน T", 60); await svc(ids.TTHAI, ids.tA, ids.uT, "นวดไทย T", 60);
    await staff(ids.t1, ids.tA, ids.uT, "หมอ T1", 1); await staff(ids.t2, ids.tA, ids.uT, "หมอ T2", 2);
    await res(ids.tRA, ids.tA, ids.uT, "ห้อง T-A", "ROOM", 1, 15); await res(ids.tRB, ids.tA, ids.uT, "ห้อง T-B", "ROOM", 2, 15);
    await res(ids.tBed, ids.tA, ids.uT, "เตียง T1", "BED", 3, 0); await res(ids.tBed2, ids.tA, ids.uT, "เตียง T2", "BED", 4, 0);
    await block(ids.tA, ids.uT, ids.tBed2, at(TODAY, 0), at(addDays(TODAY, 1), 0));
    // XC — หน่วยแข่ง (11 หมอ · บริการธรรมดา 60 + น้ำมัน 30 ใช้ห้องเดียว ไม่มีเวลาเก็บ)
    for (const u of XU) {
      for (const [i, id] of xStaff(u).entries()) await staff(id, ids.tA, u, `หมอแข่ง ${i}`, i + 1);
      await svc(xSvc(u, "PLAIN"), ids.tA, u, "ธรรมดาแข่ง 60", 60); await svc(xSvc(u, "OIL30"), ids.tA, u, "น้ำมันแข่ง 30", 30);
      await res(xRoom(u), ids.tA, u, "ห้องเดียว", "ROOM", 1, 0);
    }
    // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock) ▸ หน่วยแข่ง XC6 (ลูกค้าเลื่อนเอง ∥ ปิดซ่อม) · XC7 (ร้านเลื่อน ∥ ลดความจุ 2 → 1)
    for (const [i, u] of XL.entries()) {
      await insertRow("BusinessUnit", { id: u, tenantId: ids.tA, type: "BOOKING", name: `สาขา xl${i + 1}`, slug: `b14-xl${i + 1}-${RUN}`, updatedAt: new Date() });
      for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: ids.tA, unitId: u, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: new Date() });
      for (const [k, id] of xStaff(u).entries()) await staff(id, ids.tA, u, `หมอแข่ง ${k}`, k + 1);
      await svc(xSvc(u, "OIL30"), ids.tA, u, "น้ำมันแข่ง 30", 30);
      await insertRow("SvcResource", { id: xRoom(u), tenantId: ids.tA, unitId: u, kind: "ROOM", name: "ห้องแข่ง", capacity: i === 1 ? 2 : 1, cleanupMin: 0, active: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() });
    }
    setupOk = true;
  } catch (e) { console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`); }

  // ── แม่แบบ SPA (แถวเดียว) + ประกาศชนิด + นัดตั้งต้นวัน C ──
  console.log("\n── SETUP: แม่แบบ + ค่าตั้ง + นัดตั้งต้น ──");
  await st("SETUP", "แม่แบบ SPA ทุกหน่วยนวด (โหมดแถวเดียว) · พักขั้นต่ำ 0 · เผื่อ 0 · ประกาศชนิดบริการ (ทาง setSettings) · นัดตั้งต้นวัน C (ด่าน first-fit ของ B.13)", async () => {
    need();
    const spa = [ids.uM, ids.uM2, ids.uT, ids.uA, ...XU];
    for (const u of spa) {
      const a = await SETTINGS().applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: u, domain: "booking", templateKey: "SPA", overwrite: "RESET_ALL" });
      ok(a.ok, `applyTemplate SPA ${u}: ${a.code} ${fmt(a.issues)}`);
    }
    const b = await SETTINGS().applyTemplate(OWNER, { tenantId: ids.tB }, { unitId: ids.uB, domain: "booking", templateKey: "SPA", overwrite: "RESET_ALL" });
    ok(b.ok, `applyTemplate SPA uB: ${b.code}`);
    await setS(ids.tA, spa.flatMap((u) => [
      { key: "booking.staff.minBreakMin", scope: "UNIT", scopeId: u, value: 0 },
      { key: "booking.queue.safetyMin", scope: "UNIT", scopeId: u, value: 0 },
      { key: "booking.staff.maxJobsPerDay", scope: "UNIT", scopeId: u, value: null },
    ]));
    await setS(ids.tA, [
      ...[...kindsM.entries()].filter(([, k]) => k.length).map(([sid, k]) => ({ key: KEY_KINDS, scope: "SERVICE", scopeId: sid, value: k })),
      { key: KEY_KINDS, scope: "SERVICE", scopeId: ids.M2SVC, value: ["ROOM"] },
      { key: KEY_KINDS, scope: "SERVICE", scopeId: ids.TOIL, value: ["ROOM"] }, { key: KEY_KINDS, scope: "SERVICE", scopeId: ids.TTHAI, value: ["BED"] },
      ...XU.map((u) => ({ key: KEY_KINDS, scope: "SERVICE", scopeId: xSvc(u, "OIL30"), value: ["ROOM"] })),
    ]);
    await setS(ids.tB, [{ key: KEY_KINDS, scope: "SERVICE", scopeId: ids.BSVC, value: ["ROOM"] }]);
    // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock)
    for (const u of XL) {
      const a = await SETTINGS().applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: u, domain: "booking", templateKey: "SPA", overwrite: "RESET_ALL" });
      ok(a.ok, `applyTemplate SPA ${u}: ${a.code} ${fmt(a.issues)}`);
    }
    await setS(ids.tA, XL.flatMap((u) => [
      { key: "booking.staff.minBreakMin", scope: "UNIT", scopeId: u, value: 0 },
      { key: "booking.queue.safetyMin", scope: "UNIT", scopeId: u, value: 0 },
      { key: "booking.staff.maxJobsPerDay", scope: "UNIT", scopeId: u, value: null },
      { key: KEY_KINDS, scope: "SERVICE", scopeId: xSvc(u, "OIL30"), value: ["ROOM"] },
    ]));
    // วัน C (ภาพรวม view) — ลำดับจองกำหนดห้องที่ด่านเลือก
    fx.c1 = await bookOk(cM, ids.OIL, sM[0], D.C, 600, "c1 น้ำมัน หมอ1 10:00"); // ห้อง A
    fx.c2 = await bookOk(cM, ids.HOT, sM[1], D.C, 600, "c2 หินร้อน หมอ2 10:00"); // ห้อง B + ชุดหินร้อน
    fx.c3 = await bookOk(cM, ids.THAI, sM[2], D.C, 600, "c3 นวดไทย หมอ3 10:00"); // เตียง 1
    fx.c4 = await bookOk(cM, ids.PLAIN, sM[0], D.C, 720, "c4 นวดคอ หมอ1 12:00"); // ไม่ใช้ห้อง
    fx.c5 = await bookOk(cM, ids.OIL, sM[1], D.C, 720, "c5 น้ำมัน หมอ2 12:00"); // ห้อง A (ว่างหลัง 11:15)
    const raw = async (k: string, o: Record<string, unknown>) => {
      fx[k] = rid(k);
      await insertRow("Appointment", { id: fx[k], tenantId: ids.tA, unitId: ids.uM, customerName: `${NAME} ${k}`, customerPhone: newPhone(), updatedAt: new Date(), ...o });
    };
    await raw("cDone", { staffId: sM[2], serviceId: ids.THAI, startAt: at(D.C, 720), endAt: at(D.C, 785), status: "DONE", resourceId: ids.bed1, policySnapshot: JSON.stringify({ job: { durationMin: 60, bufferMin: 5, resourceIds: [ids.bed1] } }) });
    await raw("cCan", { staffId: sM[0], serviceId: ids.PLAIN, startAt: at(D.C, 840), endAt: at(D.C, 900), status: "CANCELLED" });
    await raw("cIn", { staffId: sM[2], serviceId: ids.THAI, startAt: at(D.C, 840), endAt: at(D.C, 905), startedAt: at(D.C, 850), status: "IN_SERVICE", resourceId: ids.bed1, policySnapshot: JSON.stringify({ job: { durationMin: 60, bufferMin: 5, resourceIds: [ids.bed1] } }) });
    await raw("cArr", { staffId: sM[1], serviceId: ids.OIL, startAt: at(D.C, 900), endAt: at(D.C, 960), plannedStartAt: at(D.C, 920), checkedInAt: at(D.C, 890), status: "ARRIVED", resourceId: ids.rB, policySnapshot: JSON.stringify({ job: { durationMin: 60, bufferMin: 0, resourceIds: [ids.rB] } }) });
    await raw("cLv", { staffId: sM[3], serviceId: ids.PLAIN, startAt: at(D.C, 660), endAt: at(D.C, 720), status: "CONFIRMED" });
    await raw("cW", { kind: "WALKIN", staffId: sM[0], plannedStaffId: sM[1], serviceId: ids.PLAIN, startAt: at(D.C, 960), endAt: at(D.C, 1020), plannedStartAt: at(D.C, 1020), status: "QUEUED" });
    await raw("cShort", { staffId: sM[0], serviceId: ids.OIL, startAt: at(D.C, 1080), endAt: at(D.C, 1140), status: "CONFIRMED" });
    eq([(await apRow(fx.c1)).resourceId, resIdsOf(await apRow(fx.c2)), (await apRow(fx.c3)).resourceId, (await apRow(fx.c5)).resourceId],
      [ids.rA, [ids.rB, ids.eq], ids.bed1, ids.rA], "ห้องที่ด่านเลือก (ตั้งต้น)");
    // uT — วันนี้ 14:20: ห้อง T-A กำลังใช้ (14:00–15:00) · ห้อง T-B นัดถัดไป 14:50 · เตียง T2 ปิดซ่อมทั้งวัน
    fx.tIn = rid("tIn"); fx.tNext = rid("tNext");
    await insertRow("Appointment", { id: fx.tIn, tenantId: ids.tA, unitId: ids.uT, staffId: ids.t1, serviceId: ids.TOIL, startAt: at(TODAY, 840), endAt: at(TODAY, 900), startedAt: at(TODAY, 840), checkedInAt: at(TODAY, 835), status: "IN_SERVICE", resourceId: ids.tRA, policySnapshot: JSON.stringify({ job: { durationMin: 60, bufferMin: 0, resourceIds: [ids.tRA] } }), customerName: `${NAME} tIn`, customerPhone: newPhone(), updatedAt: new Date() });
    await insertRow("Appointment", { id: fx.tNext, tenantId: ids.tA, unitId: ids.uT, staffId: ids.t2, serviceId: ids.TOIL, startAt: at(TODAY, 890), endAt: at(TODAY, 950), status: "CONFIRMED", resourceId: ids.tRB, policySnapshot: JSON.stringify({ job: { durationMin: 60, bufferMin: 0, resourceIds: [ids.tRB] } }), customerName: `${NAME} tNext`, customerPhone: newPhone(), updatedAt: new Date() });
    tplOk = true;
  });

  const L = (actor: Actor, ctx: Ctx, opts: { dateStr: string; range?: CalRange; mode?: CalMode; focusId?: string; now?: Date }) => CAL.load()(ctx, actor, opts);
  const mustView = async (actor: Actor, ctx: Ctx, opts: { dateStr: string; range?: CalRange; mode?: CalMode; focusId?: string; now?: Date }): Promise<CalendarView> => {
    const v = await L(actor, ctx, opts);
    ok(!!v, `loadCalendar ${fmt(opts)} ได้ null`);
    return v!;
  };
  const colOf = (v: CalendarView, key: string): CalColumn => { const c = v.columns.find((x) => x.key === key); if (!c) throw new AssertFail(`ไม่มีคอลัมน์ ${key} (มี ${fmt(v.columns.map((x) => x.key))})`); return c; };
  const cleanupOf = new Map<string, number>([[ids.rA, 15], [ids.rB, 15], [ids.bed1, 5], [ids.bed2, 5], [ids.eq, 10], [ids.bed3, 5]]);

  // ═══════════════ C · loadCalendar ═══════════════
  console.log("\n── C: loadCalendar (วัน/สัปดาห์ × คน/ห้อง) ──");
  let vStaff: CalendarView | null = null;
  let vRes: CalendarView | null = null;
  await st("C-1", "วัน·คน (วัน C): คอลัมน์ = หมอ 4 คนตามลำดับ · บล็อกต่อคอลัมน์ตรงฐาน (ไม่รวมยกเลิก · walk-in รออยู่คอลัมน์แผน · IN_SERVICE เริ่มจริง · ARRIVED แผน) · startMs/endMs/holdEndMs/resourceIds · ชื่อทรัพยากรบนบล็อก · ป้าย/บริการ", async () => {
    needTpl();
    const v = vStaff = await mustView(OWNER, cM, { dateStr: D.C, range: "DAY", mode: "STAFF" });
    eq([v.unitId, v.mode, v.range, v.dateStr, v.days, v.prevDateStr, v.nextDateStr, v.focusId], [ids.uM, "STAFF", "DAY", D.C, [D.C], addDays(D.C, -1), addDays(D.C, 1), null], "หัว view");
    eq(v.columns.map((c) => [c.key, c.kind, c.id, c.name, c.dateStr]), sM.map((s, i) => [s, "STAFF", s, `หมอ ${i + 1}`, D.C]), "คอลัมน์");
    eq([v.openMin, v.closeMin], [600, 1200], "เวลาร้าน");
    const rows = await refRows(ids.uM);
    for (const c of v.columns) eq(colBlocks(c), refBlocks(rows, D.C, "STAFF", c.id, kindsM, 0), `บล็อกคอลัมน์ ${c.name}`);
    eq(colOf(v, sM[0]).blocks.map((b) => b.appointmentId), [fx.c1, fx.c4, fx.cShort], "หมอ 1 (ยกเลิกไม่ขึ้น · walk-in ย้ายไปคอลัมน์แผน)");
    eq(colOf(v, sM[1]).blocks.map((b) => b.appointmentId), [fx.c2, fx.c5, fx.cArr, fx.cW], "หมอ 2");
    const all = v.columns.flatMap((c) => c.blocks);
    const by = (id: string) => all.find((b) => b.appointmentId === id)!;
    eq([by(fx.cIn).startMs, by(fx.cIn).endMs], [bkkMs(D.C, 850), bkkMs(D.C, 910)], "IN_SERVICE เริ่มจริง 14:10 + 60");
    eq([by(fx.cArr).startMs, by(fx.cW).startMs], [bkkMs(D.C, 920), bkkMs(D.C, 1020)], "ARRIVED/QUEUED ใช้แผน");
    eq([by(fx.c3).endMs, by(fx.c3).holdEndMs], [bkkMs(D.C, 660), bkkMs(D.C, 665)], "นวดไทย end ไม่รวมเผื่อ · hold (มุมคน) รวมเผื่อ 5");
    eq([by(fx.c2).resourceNames, by(fx.c1).resourceNames, by(fx.c4).resourceNames], [["ห้องน้ำมัน B", "ชุดหินร้อน"], ["ห้องน้ำมัน A"], []], "ชิปทรัพยากร");
    eq([by(fx.c1).label, by(fx.c1).serviceName, by(fx.c1).kind, by(fx.cW).kind, by(fx.c1).staffName], [NAME, "น้ำมัน 60", "BOOKED", "WALKIN", "หมอ 1"], "ป้าย");
    ok(by(fx.cW).label.includes("walk-in"), `ป้าย walk-in ${fmt(by(fx.cW).label)}`);
  });
  await st("C-2", "หมอลา (ใบลาอนุมัติในระบบพนักงาน) ⇒ คอลัมน์ปิด LEAVE + เหตุผลไทยมีคำว่า \"ลา\" · ยังแสดงนัดค้างของคนลา · คนอื่นไม่ปิด · สรุป: มา 3 ลา 1 · providerLabel จากค่าตั้ง", async () => {
    needTpl();
    const v = vStaff ?? await mustView(OWNER, cM, { dateStr: D.C, range: "DAY", mode: "STAFF" });
    const lv = colOf(v, sM[3]);
    eq(lv.closed?.code, "LEAVE", "หมอ 4 closed");
    ok(isThai(lv.closed?.reasonTh) && lv.closed!.reasonTh.includes("ลา"), `เหตุผล ${fmt(lv.closed)}`);
    eq(lv.blocks.map((b) => b.appointmentId), [fx.cLv], "นัดค้างของคนลา");
    eq(sM.slice(0, 3).map((s) => colOf(v, s).closed), [null, null, null], "คนอื่น");
    eq([v.summary.staffWorking, v.summary.staffOnLeave], [3, 1], "สรุปคน");
    const pl = await SETTINGS().resolveSettings({ tenantId: ids.tA }, ["booking.general.providerLabel"], { unitId: ids.uM });
    eq(v.providerLabel, String(pl["booking.general.providerLabel"]?.value ?? ""), "providerLabel");
    ok(isThai(v.providerLabel), "providerLabel ว่าง");
  });
  await st("C-3", "วัน·ห้อง (มติ: ทรัพยากร B.13 = คอลัมน์ \"ตามห้อง\"): คอลัมน์ = ทรัพยากร active เรียง sortOrder (ห้องเก่าปิดใช้ไม่ขึ้น) + \"ยังไม่ได้ห้อง\" · ป้ายชนิดไทย · บล็อกตามที่ถือ (หินร้อนขึ้น 2 คอลัมน์) · holdEndMs รวมเวลาเก็บ · ปิดซ่อมบางช่วง/ทั้งวัน", async () => {
    needTpl();
    const v = vRes = await mustView(OWNER, cM, { dateStr: D.C, range: "DAY", mode: "RESOURCE" });
    eq(v.columns.map((c) => [c.key, c.kind, c.id, c.name]), [
      [ids.rA, "RESOURCE", ids.rA, "ห้องน้ำมัน A"], [ids.rB, "RESOURCE", ids.rB, "ห้องน้ำมัน B"], [ids.bed1, "RESOURCE", ids.bed1, "เตียง 1"],
      [ids.bed2, "RESOURCE", ids.bed2, "เตียง 2"], [ids.eq, "RESOURCE", ids.eq, "ชุดหินร้อน"], [ids.bed3, "RESOURCE", ids.bed3, "เตียง 3"],
      ["UNASSIGNED", "UNASSIGNED", null, "ยังไม่ได้ห้อง"],
    ], "คอลัมน์");
    eq([colOf(v, ids.rA).sub, colOf(v, ids.bed1).sub, colOf(v, ids.eq).sub], ["ห้อง", "เตียง", "อุปกรณ์"], "ป้ายชนิด (RESOURCE_KIND_LABELS_TH)");
    const rows = await refRows(ids.uM);
    for (const c of v.columns) eq(colBlocks(c), refBlocks(rows, D.C, c.kind, c.id, kindsM, c.id ? cleanupOf.get(c.id) ?? 0 : 0), `บล็อก ${c.name}`);
    eq([colOf(v, ids.rB).blocks.map((b) => b.appointmentId), colOf(v, ids.eq).blocks.map((b) => b.appointmentId)], [[fx.c2, fx.cArr], [fx.c2]], "หินร้อน 2 คอลัมน์");
    eq(colOf(v, "UNASSIGNED").blocks.map((b) => b.appointmentId), [fx.cShort], "น้ำมันที่ยังไม่ได้ห้อง");
    ok(!v.columns.flatMap((c) => c.blocks).some((b) => b.appointmentId === fx.c4 || b.appointmentId === fx.cLv), "บริการไม่ใช้ห้องต้องไม่ขึ้นในมุมห้อง");
    eq([colOf(v, ids.bed2).closed, colOf(v, ids.bed2).maintenance], [null, [{ startMs: bkkMs(D.C, 780), endMs: bkkMs(D.C, 960) }]], "เตียง 2 ปิดซ่อมบางช่วง");
    eq(colOf(v, ids.bed3).closed?.code, "MAINTENANCE", "เตียง 3 ปิดซ่อมทั้งวัน");
    ok(isThai(colOf(v, ids.bed3).closed?.reasonTh), "เหตุผลปิดซ่อมไทย");
    const cnt = Object.fromEntries(v.summary.resources.map((r) => [r.kind, r.count]));
    eq(cnt, { BED: 2, ROOM: 2, EQUIPMENT: 1 }, "สรุปทรัพยากร (ปิดใช้/ปิดซ่อมทั้งวันไม่นับ)");
    ok(v.summary.resources.every((r) => isThai(r.labelTh)), "ป้ายชนิดในสรุป");
  });
  await st("C-4", "สัปดาห์·คน (focus หมอ 4): 7 วัน จันทร์–อาทิตย์ที่มีวัน C · คอลัมน์ key = วัน · วัน C ปิด LEAVE (วันอื่นไม่ปิด) · บล็อกต่อวันตรงฐาน · prev/next ±7 · focusOptions = หมอ 4 คน", async () => {
    needTpl();
    const v = await mustView(OWNER, cM, { dateStr: D.C, range: "WEEK", mode: "STAFF", focusId: sM[3] });
    const mon = mondayOf(D.C);
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    eq([v.range, v.days, v.focusId, v.prevDateStr, v.nextDateStr], ["WEEK", days, sM[3], addDays(D.C, -7), addDays(D.C, 7)], "หัว");
    eq(v.columns.map((c) => [c.key, c.kind, c.id, c.dateStr]), days.map((d) => [d, "STAFF", sM[3], d]), "คอลัมน์วัน");
    eq(v.columns.map((c) => c.closed?.code ?? null), days.map((d) => (d === D.C ? "LEAVE" : null)), "ปิดเฉพาะวันลา");
    const rows = await refRows(ids.uM);
    for (const c of v.columns) eq(colBlocks(c), refBlocks(rows, c.dateStr, "STAFF", sM[3], kindsM, 0), `วัน ${c.dateStr}`);
    eq(v.focusOptions.map((o) => o.id), sM, "focusOptions");
  });
  await st("C-5", "สัปดาห์·ห้อง (focus ห้อง A) · focusId ไม่ใช่ของหน่วย (หมอหน่วยอื่น/ห้องร้านอื่น) ⇒ ใช้ตัวแรก + ไม่มี id นั้นใน view (X1)", async () => {
    needTpl();
    const v = await mustView(OWNER, cM, { dateStr: D.C, range: "WEEK", mode: "RESOURCE", focusId: ids.rA });
    const rows = await refRows(ids.uM);
    eq(v.focusId, ids.rA, "focus");
    for (const c of v.columns) eq(colBlocks(c), refBlocks(rows, c.dateStr, "RESOURCE", ids.rA, kindsM, 15), `ห้อง A วัน ${c.dateStr}`);
    eq(colOf(v, D.C).blocks.map((b) => b.appointmentId), [fx.c1, fx.c5], "ห้อง A วัน C");
    for (const [mode, foreign, first] of [["STAFF", ids.m2s, sM[0]], ["RESOURCE", ids.br, ids.rA]] as const) {
      const w = await mustView(OWNER, cM, { dateStr: D.C, range: "WEEK", mode, focusId: foreign });
      eq(w.focusId, first, `${mode} focus แปลกปลอม ⇒ ตัวแรก`);
      ok(!JSON.stringify(w).includes(foreign), `${mode}: id หน่วยอื่นหลุดใน view`);
    }
  });
  await st("C-6", "movable/access ตามผู้ดู: เจ้าของ ⇒ นัด BOOKED ที่ยังไม่เริ่ม (CONFIRMED/LATE อนาคต) movable · DONE/IN_SERVICE/ARRIVED/walk-in ไม่ movable · ผู้ดูที่มีแค่ booking.job.run ⇒ view ได้ แต่ access.move=false และไม่มีบล็อก movable", async () => {
    needTpl();
    const v = vStaff ?? await mustView(OWNER, cM, { dateStr: D.C, range: "DAY", mode: "STAFF" });
    const all = v.columns.flatMap((c) => c.blocks);
    const mv0 = (id: string) => all.find((b) => b.appointmentId === id)?.movable;
    eq([fx.c1, fx.c2, fx.c3, fx.c4, fx.c5, fx.cLv, fx.cShort].map(mv0), [true, true, true, true, true, true, true], "movable");
    eq([fx.cDone, fx.cIn, fx.cArr, fx.cW].map(mv0), [false, false, false, false], "ไม่ movable");
    eq(v.access, { move: true, book: true }, "access เจ้าของ");
    const r = await mustView(ST_RUN, cM, { dateStr: D.C, range: "DAY", mode: "STAFF" });
    eq(r.access, { move: false, book: false }, "access ช่าง (job.run)");
    eq(r.columns.flatMap((c) => c.blocks).filter((b) => b.movable).length, 0, "บล็อก movable ของช่าง");
    const c = await mustView(ST_CREATE, cM, { dateStr: D.C, range: "DAY", mode: "STAFF" });
    eq(c.access, { move: false, book: true }, "access หน้าเคาน์เตอร์ (create)");
  });
  await st("C-7", "null (หน้า ⇒ 404): ร้านเดิมไม่เปิดแถวเดียว · ผู้ดูไม่มีสิทธิ์ดู · วันที่ไม่จริง · ctx ข้ามร้าน (tenant B + หน่วย A / tenant A + หน่วยร้าน B) · หน่วยไม่มีจริง", async () => {
    needTpl();
    eq(await L(OWNER, cF, { dateStr: D.C }), null, "ร้านเดิม");
    eq(await L(ST_NONE, cM, { dateStr: D.C }), null, "ไม่มีสิทธิ์ดู");
    eq(await L(OWNER, cM, { dateStr: "2031-02-30" }), null, "วันไม่จริง");
    eq(await L(OWNER, { tenantId: ids.tB, unitId: ids.uM }, { dateStr: D.C }), null, "tenant B + หน่วย A");
    eq(await L(OWNER, { tenantId: ids.tA, unitId: ids.uB }, { dateStr: D.C }), null, "tenant A + หน่วยร้าน B");
    eq(await L(OWNER, { tenantId: ids.tA, unitId: "svcb14_nope" }, { dateStr: D.C }), null, "หน่วยไม่มีจริง");
  });
  await st("C-8", "X10: view (คน/ห้อง/สัปดาห์ · เจ้าของ = สิทธิ์เต็ม) ไม่มีเบอร์ (เต็ม/ท้าย 4/ขีด/+66) · อีเมล · คีย์ phone/email/token/policySnapshot/idempotencyKey/partyId/customerId", async () => {
    needTpl();
    const vs = [vStaff ?? await mustView(OWNER, cM, { dateStr: D.C, mode: "STAFF" }), vRes ?? await mustView(OWNER, cM, { dateStr: D.C, mode: "RESOURCE" }), await mustView(OWNER, cM, { dateStr: D.C, range: "WEEK", focusId: sM[1] })];
    for (const v of vs) eq(piiLeak(JSON.stringify(v)), [], `PII ${v.mode}/${v.range}`);
  }, "CRITICAL");
  await st("C-9", "วันนี้ (now ฉีด 14:20): walkInNow = walkInNowByService (B.13) · resourcesNow: ห้อง T-A BUSY · ห้อง T-B NEXT 14:50 · เตียง T1 FREE · เตียง T2 MAINT · วันอื่น ⇒ null ทั้งคู่", async () => {
    needTpl();
    const now = at(TODAY, 860);
    const v = await mustView(OWNER, cT, { dateStr: TODAY, mode: "RESOURCE", now });
    eq([v.todayStr, v.nowMs], [TODAY, now.getTime()], "todayStr/nowMs");
    ok(Array.isArray(v.walkInNow), "walkInNow ต้องเป็นอาร์เรย์ในวันนี้");
    const ref = await RSX.now()(cT, { now });
    eq(v.walkInNow!.map((r) => [r.serviceId, r.closed, r.limitedBy, r.startAt ? new Date(r.startAt).getTime() : null]), ref.map((r) => [r.serviceId, r.closed, r.limitedBy, r.startAt ? new Date(r.startAt).getTime() : null]), "walkInNow");
    ok(Array.isArray(v.resourcesNow), "resourcesNow ต้องเป็นอาร์เรย์ในวันนี้");
    eq(v.resourcesNow!.map((r) => [r.id, r.state, r.nextStartMs]), [[ids.tRA, "BUSY", null], [ids.tRB, "NEXT", bkkMs(TODAY, 890)], [ids.tBed, "FREE", null], [ids.tBed2, "MAINT", null]], "resourcesNow");
    const o = await mustView(OWNER, cT, { dateStr: addDays(TODAY, 1), mode: "RESOURCE", now });
    eq([o.walkInNow, o.resourcesNow], [null, null], "วันอื่น");
  }, "MAJOR");

  // ═══════════════ M · ลากย้าย ═══════════════
  console.log("\n── M: moveAppointment (ลากย้าย = ด่านเดียวกับการจอง) ──");
  let mOk = false;
  await st("M-0", "ข้อมูลตั้งต้นวัน M/J/R (จองผ่าน bookAppointment ช่อง STAFF)", async () => {
    needTpl();
    fx.m1 = await bookOk(cM, ids.PLAIN, sM[0], D.M, 600, "m1");
    fx.m2 = await bookOk(cM, ids.PLAIN, sM[1], D.M, 660, "m2");
    fx.m3 = await bookOk(cM, ids.OIL, sM[0], D.M, 780, "m3");
    fx.mLate = rid("mLate");
    await insertRow("Appointment", { id: fx.mLate, tenantId: ids.tA, unitId: ids.uM, staffId: sM[1], serviceId: ids.PLAIN, startAt: at(D.M, 900), endAt: at(D.M, 960), status: "LATE", lateAt: at(D.M, 905), customerName: `${NAME} late`, customerPhone: newPhone(), updatedAt: new Date() });
    // J5: หมอ 2 กำลังทำ (IN_SERVICE) นัด 10:00–11:00 เริ่มจริง 10:40 ⇒ ถือถึง 11:40
    fx.jIn = rid("jIn");
    await insertRow("Appointment", { id: fx.jIn, tenantId: ids.tA, unitId: ids.uM, staffId: sM[1], serviceId: ids.PLAIN, startAt: at(D.J, 600), endAt: at(D.J, 660), startedAt: at(D.J, 640), checkedInAt: at(D.J, 600), status: "IN_SERVICE", customerName: `${NAME} jIn`, customerPhone: newPhone(), updatedAt: new Date() });
    fx.j1 = await bookOk(cM, ids.PLAIN, sM[0], D.J, 780, "j1");
    // R: r1 ห้อง A 10:00 · r2 ห้อง B 10:00 · r4 ห้อง A 14:00 · h1 หินร้อน 16:00 (A+ชุด) · h2 หินร้อน 18:00 (A+ชุด) · r3 หมอ 4 12:00 (ห้อง A)
    fx.r1 = await bookOk(cM, ids.OIL, sM[0], D.R, 600, "r1");
    fx.r2 = await bookOk(cM, ids.OIL, sM[1], D.R, 600, "r2");
    fx.r4 = await bookOk(cM, ids.OIL, sM[0], D.R, 840, "r4");
    fx.h1 = await bookOk(cM, ids.HOT, sM[0], D.R, 960, "h1");
    fx.h2 = await bookOk(cM, ids.HOT, sM[1], D.R, 1080, "h2");
    fx.r3 = await bookOk(cM, ids.OIL, sM[3], D.R, 720, "r3");
    eq([fx.r1, fx.r2, fx.r4, fx.r3].length, 4, "");
    eq([(await apRow(fx.r1)).resourceId, (await apRow(fx.r2)).resourceId, (await apRow(fx.r4)).resourceId, resIdsOf(await apRow(fx.h1)), resIdsOf(await apRow(fx.h2)), (await apRow(fx.r3)).resourceId],
      [ids.rA, ids.rB, ids.rA, [ids.rA, ids.eq], [ids.rA, ids.eq], ids.rA], "ห้องตั้งต้น");
    mOk = true;
  });
  const needM = () => { needTpl(); ok(mOk, "ข้อมูลตั้งต้น M-0 ไม่ครบ"); };
  await st("M-1", "ลากไปช่องว่าง (คนเดิม 10:00 → 12:00) ⇒ ok · startAt/endAt ใหม่ · คนเดิม · ผลคืน appointmentId/startAt/staffId/resourceIds · event booking.rescheduled 1 (by SHOP · from/to · ไม่มี PII) · rescheduleCount ไม่นับ", async () => {
    needM();
    const r = await okMove(OWNER, cM, fx.m1, { dateStr: D.M, startMin: 720 }, "m1 → 12:00");
    eq([r.appointmentId, new Date(r.startAt).getTime(), r.staffId, r.resourceIds], [fx.m1, bkkMs(D.M, 720), sM[0], []], "ผลคืน");
    const a = await apRow(fx.m1);
    eq([a.startAt.getTime(), a.endAt.getTime(), a.staffId, a.status, a.rescheduleCount], [bkkMs(D.M, 720), bkkMs(D.M, 780), sM[0], "CONFIRMED", 0], "แถว");
    const ev = await q<{ payload: Record<string, unknown> }>(`SELECT payload FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'booking.rescheduled' AND payload->>'appointmentId' = $2`, [ids.tA, fx.m1]);
    eq(ev.length, 1, "event");
    eq([ev[0].payload.by, ev[0].payload.fromStartAt, ev[0].payload.startAt], ["SHOP", at(D.M, 600).toISOString(), at(D.M, 720).toISOString()], "payload");
    eq(piiLeak(JSON.stringify(ev[0].payload)), [], "PII ใน payload");
  });
  await st("M-2", "ลากข้ามคอลัมน์คน (หมอ 2 → หมอ 1 · 16:00) ⇒ ok · staffId ใหม่ · assignMode SPECIFIC · แผนล้าง", async () => {
    needM();
    await okMove(OWNER, cM, fx.m2, { dateStr: D.M, startMin: 960, staffId: sM[0] }, "m2 → หมอ 1 16:00");
    const a = await apRow(fx.m2);
    eq([a.staffId, a.startAt.getTime(), a.assignMode, a.plannedStaffId, a.plannedStartAt], [sM[0], bkkMs(D.M, 960), "SPECIFIC", null, null], "แถว");
  });
  await st("M-3", "ลากทับนัดอื่นของคนเดียวกัน (m1 12:00 → 12:30 ทับ m3 13:00) ⇒ FULL · ข้อความไทย · แถวไม่เปลี่ยนทุกคอลัมน์ · ไม่มี event", async () => {
    needM();
    await noWrite(fx.m1, () => mv(OWNER, cM, fx.m1, { dateStr: D.M, startMin: 750 }), "FULL", "ทับ m3");
  });
  await st("M-4", "ด่านคน J5 (เดียวกับ bookAppointment): หมอ 2 กำลังทำ เริ่มจริง 10:40 (ถือถึง 11:40) ⇒ ลาก j1 ไปหมอ 2 11:15 = FULL (ไม่เขียน) · ตัวควบคุม 11:45 = ok", async () => {
    needM();
    await noWrite(fx.j1, () => mv(OWNER, cM, fx.j1, { dateStr: D.J, startMin: 675, staffId: sM[1] }), "FULL", "ทับงานที่เลยเวลา (J5)");
    await okMove(OWNER, cM, fx.j1, { dateStr: D.J, startMin: 705, staffId: sM[1] }, "11:45 (ตัวควบคุม)");
  });
  await st("M-5", "ชนห้อง: หมอว่างแต่ห้องน้ำมันทั้ง 2 ไม่ว่าง (r3 หมอ 4 → 10:00) ⇒ FULL + ข้อความบอกห้อง/เตียง · ไม่เขียน · ตัวควบคุม 11:15 (หลังเวลาเก็บ) ⇒ ok คงห้อง A", async () => {
    needM();
    const why = await noWrite(fx.r3, () => mv(OWNER, cM, fx.r3, { dateStr: D.R, startMin: 600 }), "FULL", "ห้องเต็ม");
    ok(/ห้อง|เตียง/.test(why), `ข้อความต้องบอกห้อง/เตียง: ${why}`);
    const r = await okMove(OWNER, cM, fx.r3, { dateStr: D.R, startMin: 675 }, "11:15");
    eq([r.resourceIds, (await apRow(fx.r3)).resourceId], [[ids.rA], ids.rA], "คงห้องเดิม");
  });
  await st("M-6", "มุมห้อง: ปล่อยบนห้องที่ระบุ (resourceId) ⇒ ต้องเป็นห้องนั้น: เวลาเดิมย้ายไปห้อง B (ว่าง 11:15) ⇒ ok · ห้อง A ที่ 14:00 ไม่ว่าง (r4) ⇒ FULL ทั้งที่ห้อง B ว่าง (ห้ามสลับเงียบ) · ไม่ระบุห้อง 14:00 ⇒ ok ห้อง B (ชิ้นเดิมก่อน)", async () => {
    needM();
    const r = await okMove(OWNER, cM, fx.r3, { dateStr: D.R, startMin: 675, resourceId: ids.rB }, "ระบุห้อง B");
    eq([r.resourceIds, (await apRow(fx.r3)).resourceId, (await apRow(fx.r3)).startAt.getTime()], [[ids.rB], ids.rB, bkkMs(D.R, 675)], "ห้อง B เวลาเดิม");
    await noWrite(fx.r3, () => mv(OWNER, cM, fx.r3, { dateStr: D.R, startMin: 840, resourceId: ids.rA }), "FULL", "ระบุห้อง A ที่ไม่ว่าง");
    const r2 = await okMove(OWNER, cM, fx.r3, { dateStr: D.R, startMin: 840 }, "14:00 ไม่ระบุห้อง");
    eq(r2.resourceIds, [ids.rB], "ชิ้นเดิม (ห้อง B)");
  });
  await st("M-7", "ห้องที่ระบุผิด: ชนิดที่บริการไม่ใช้ (เตียง) ⇒ BAD_INPUT · ห้องหน่วยอื่น/ร้านอื่น/ปิดใช้ ⇒ NOT_FOUND · ห้อง B ปิดซ่อม 12:30–13:30 ระบุห้อง B ⇒ FULL · ไม่ระบุ ⇒ ok ได้ห้อง A (ชิ้นเดิมปิดซ่อม ⇒ เลือกชนิดเดียวกัน)", async () => {
    needM();
    await noWrite(fx.r3, () => mv(OWNER, cM, fx.r3, { dateStr: D.R, startMin: 840, resourceId: ids.bed1 }), "BAD_INPUT", "ระบุเตียงให้บริการน้ำมัน");
    for (const [rid0, what] of [[ids.m2r, "ห้องหน่วยอื่น"], [ids.br, "ห้องร้านอื่น"], [ids.rOld, "ห้องปิดใช้"]] as const) {
      await noWrite(fx.r3, () => mv(OWNER, cM, fx.r3, { dateStr: D.R, startMin: 840, resourceId: rid0 }), "NOT_FOUND", what);
    }
    await noWrite(fx.r3, () => mv(OWNER, cM, fx.r3, { dateStr: D.R, startMin: 750, resourceId: ids.rB }), "FULL", "ห้อง B ปิดซ่อม");
    const r = await okMove(OWNER, cM, fx.r3, { dateStr: D.R, startMin: 750 }, "12:30 ไม่ระบุห้อง");
    eq(r.resourceIds, [ids.rA], "ได้ห้อง A");
    eq(await resViolations(ids.uM, await maintOf(ids.uM)), [], "ฐานทรัพยากร");
  });
  await st("M-8", "คอลัมน์ปิด/ด่านคน: ลากไปหมอที่ลา ⇒ ON_LEAVE · หมอที่ทำบริการไม่ได้ ⇒ NOT_QUALIFIED · ออกนอกกรอบเวลา (19:30+60 > 20:00) ⇒ OUTSIDE_HOURS · ไปเมื่อวาน ⇒ PAST · ทั้งหมดไม่เขียน", async () => {
    needM();
    await noWrite(fx.c4, () => mv(OWNER, cM, fx.c4, { dateStr: D.C, startMin: 780, staffId: sM[3] }), "ON_LEAVE", "หมอ 4 ลา");
    await noWrite(fx.c1, () => mv(OWNER, cM, fx.c1, { dateStr: D.C, startMin: 960, staffId: sM[2] }), "NOT_QUALIFIED", "หมอ 3 ทำน้ำมันไม่ได้");
    await noWrite(fx.c4, () => mv(OWNER, cM, fx.c4, { dateStr: D.C, startMin: 1170 }), "OUTSIDE_HOURS", "เลยเวลาปิด");
    await noWrite(fx.c4, () => mv(OWNER, cM, fx.c4, { dateStr: addDays(TODAY, -1), startMin: 600 }), "PAST", "อดีต");
  });
  await st("M-9", "สถานะที่ลากไม่ได้ (ใบสั่ง §9 ข้อ 3): DONE · IN_SERVICE · ARRIVED · walk-in QUEUED · CANCELLED ⇒ BAD_STATE ไม่เขียน", async () => {
    needM();
    for (const k of ["cDone", "cIn", "cArr", "cW", "cCan"]) await noWrite(fx[k], () => mv(OWNER, cM, fx[k], { dateStr: D.C, startMin: 1140 }), "BAD_STATE", k);
  });
  await st("M-10", "จอเก่า (expect ไม่ตรงแถว · ใต้ล็อก): เวลาเดิมที่ส่งผิด / คนเดิมผิด ⇒ LOST_RACE ข้อความไทย ไม่เขียน", async () => {
    needM();
    const a = await apRow(fx.m3);
    await noWrite(fx.m3, () => CAL.move()(OWNER, cM, fx.m3, { dateStr: D.M, startMin: 1080 }, { expect: { startAt: at(D.M, 720).toISOString(), staffId: a.staffId } }), "LOST_RACE", "เวลาเก่า");
    await noWrite(fx.m3, () => CAL.move()(OWNER, cM, fx.m3, { dateStr: D.M, startMin: 1080 }, { expect: { startAt: a.startAt.toISOString(), staffId: sM[1] } }), "LOST_RACE", "คนเก่า");
  });
  await st("M-11", "event ทุกการย้าย: m2 ไป-กลับ 3 ครั้ง (17:00 → 16:00 → 17:00) ⇒ booking.rescheduled เพิ่ม 3 (คีย์ไม่ซ้ำ — ไม่ถูกกลืนด้วย idempotencyKey เดิม)", async () => {
    needM();
    const k0 = await obKeys(fx.m2);
    for (const m of [1020, 960, 1020]) await okMove(OWNER, cM, fx.m2, { dateStr: D.M, startMin: m }, `m2 → ${m}`);
    const k1 = await obKeys(fx.m2);
    eq(k1.length - k0.length, 3, `event ใหม่ (${fmt(k1)})`);
    eq(new Set(k1).size, k1.length, "คีย์ซ้ำ");
  }, "MAJOR");
  await st("M-12", "หลายชนิด (หินร้อน = ห้อง + ชุดหินร้อน): h2 → 16:30 ชุดหินร้อนไม่ว่าง (h1 ถึง 17:10) ⇒ FULL แม้ห้อง B ว่าง · → 17:15 ⇒ ok ถือ [ห้อง, ชุดหินร้อน] ตามลำดับชนิด", async () => {
    needM();
    await noWrite(fx.h2, () => mv(OWNER, cM, fx.h2, { dateStr: D.R, startMin: 990 }), "FULL", "ชุดหินร้อนไม่ว่าง");
    const r = await okMove(OWNER, cM, fx.h2, { dateStr: D.R, startMin: 1035 }, "17:15");
    const a = await apRow(fx.h2);
    eq([r.resourceIds.length, resIdsOf(a)[1], a.resourceId === resIdsOf(a)[0]], [2, ids.eq, true], "ถือครบ 2 ชนิด");
    eq(await resViolations(ids.uM, await maintOf(ids.uM)), [], "ฐานทรัพยากร");
  });
  await st("M-13", "LATE ⇒ CONFIRMED + lateAt null · ลูกค้า/เบอร์/มัดจำ/ช่องทาง/rescheduleCount ไม่แตะ", async () => {
    needM();
    const keep = `SELECT "customerName", "customerPhone", "depositSatang", channel::text AS channel, "rescheduleCount", "partyId" FROM "Appointment" WHERE id = $1`;
    const before = JSON.stringify(await q(keep, [fx.mLate]));
    await okMove(OWNER, cM, fx.mLate, { dateStr: D.M, startMin: 1080 }, "LATE → 18:00");
    const a = await apRow(fx.mLate);
    eq([a.status, a.lateAt, a.startAt.getTime()], ["CONFIRMED", null, bkkMs(D.M, 1080)], "แถว");
    eq(JSON.stringify(await q(keep, [fx.mLate])), before, "คอลัมน์อื่น");
  });
  await st("M-14", "ข้อมูลเสีย ⇒ BAD_INPUT/NOT_FOUND ไม่ throw ไม่เขียน: to null/{} · startMin −1/1440/1.5 · วันที่ไม่จริง · staffId ว่าง · resourceId ว่าง · expect ไม่มี/ผิดรูป · id ว่าง ⇒ NOT_FOUND", async () => {
    needM();
    const bad: [unknown, unknown, string][] = [
      [null, undefined, "to null"], [{}, undefined, "to {}"], [{ dateStr: D.M, startMin: -1 }, undefined, "−1"], [{ dateStr: D.M, startMin: 1440 }, undefined, "1440"], [{ dateStr: D.M, startMin: 1.5 }, undefined, "1.5"],
      [{ dateStr: "2031-02-30", startMin: 600 }, undefined, "วันไม่จริง"], [{ dateStr: D.M, startMin: 600, staffId: "" }, undefined, "staffId ว่าง"], [{ dateStr: D.M, startMin: 600, resourceId: "" }, undefined, "resourceId ว่าง"],
      [{ dateStr: D.M, startMin: 1140 }, null, "ไม่มี expect"], [{ dateStr: D.M, startMin: 1140 }, { startAt: "เมื่อวาน", staffId: 5 }, "expect ผิดรูป"],
    ];
    const mvRaw = CAL.move() as unknown as (a: Actor, c: Ctx, id: string, to: unknown, o: unknown) => Promise<CalMoveResult>;
    for (const [to, exp, what] of bad) {
      const e = exp === undefined ? await expOf(fx.m3) : exp;
      await noWrite(fx.m3, () => mvRaw(OWNER, cM, fx.m3, to, { expect: e }), "BAD_INPUT", what);
    }
    const r = await mvRaw(OWNER, cM, "", { dateStr: D.M, startMin: 600 }, { expect: await expOf(fx.m3) });
    eq([r.ok, (r as { code?: string }).code], [false, "NOT_FOUND"], "id ว่าง");
  }, "MAJOR");

  // ═══════════════ P · สิทธิ์ ═══════════════
  console.log("\n── P: สิทธิ์ (ใบสั่ง §9 ข้อ 2) ──");
  await st("P-1", "access.ts: BOOKING_ACTIONS.moveAppointmentAction = [booking.appointment.reschedule] · bookForCustomerAction = [booking.appointment.create] · canBookingAction ตามผู้ดู", () => {
    const A = accessLoad.mod;
    ok(!!A?.BOOKING_ACTIONS && typeof A.canBookingAction === "function", `โหลด access.ts ไม่ได้ ${accessLoad.err}`);
    eq([A!.BOOKING_ACTIONS!.moveAppointmentAction, A!.BOOKING_ACTIONS!.bookForCustomerAction], [["booking.appointment.reschedule"], ["booking.appointment.create"]], "คีย์");
    const can = (a: Actor, act: string) => A!.canBookingAction!(a, ids.uM, act);
    eq([OWNER, MGR_M, MGR_OTHER, ST_RES, ST_RUN, ST_OPER, ST_CREATE, ST_NONE].map((a) => can(a, "moveAppointmentAction")), [true, true, false, true, false, false, false, false], "ย้าย");
    eq([OWNER, ST_RES, ST_CREATE, ST_NONE].map((a) => can(a, "bookForCustomerAction")), [true, false, true, false], "จอง");
  });
  await st("P-2", "ไม่มีสิทธิ์ ⇒ FORBIDDEN ไม่เขียน: ช่าง (job.run) ย้ายนัดของตัวเอง/คนอื่น · จัดคิว (queue.operate+runAny) · หน้าเคาน์เตอร์ (create) · ผู้จัดการสาขาอื่น · FORBIDDEN มาก่อน NOT_FOUND (id มั่ว ⇒ FORBIDDEN)", async () => {
    needM();
    fx.p1 = await bookOk(cM, ids.PLAIN, sM[0], D.K, 1140, "p1 ของหมอ 1 (ผูกผู้ใช้ช่าง)");
    for (const [a, what] of [[ST_RUN, "ช่างย้ายนัดตัวเอง"], [ST_OPER, "จัดคิว"], [ST_CREATE, "หน้าเคาน์เตอร์"], [MGR_OTHER, "ผู้จัดการสาขาอื่น"], [ST_NONE, "ไม่มีคีย์"]] as const) {
      await noWrite(fx.p1, () => mv(a, cM, fx.p1, { dateStr: D.K, startMin: 1080 }), "FORBIDDEN", what);
    }
    await noWrite(fx.m3, () => mv(ST_RUN, cM, fx.m3, { dateStr: D.M, startMin: 1140 }), "FORBIDDEN", "ช่างย้ายนัดคนอื่น");
    const r = await CAL.move()(ST_NONE, cM, "svcb14_nope", { dateStr: D.K, startMin: 600 }, { expect: { startAt: at(D.K, 600).toISOString(), staffId: sM[0] } });
    eq([r.ok, (r as { code?: string }).code], [false, "FORBIDDEN"], "id มั่ว + ไม่มีสิทธิ์");
  });
  await st("P-3", "มีสิทธิ์ ⇒ ok: ผู้จัดการสาขานี้ · พนักงานที่มี booking.appointment.reschedule", async () => {
    needM();
    await okMove(MGR_M, cM, fx.p1, { dateStr: D.K, startMin: 1080 }, "ผู้จัดการ");
    await okMove(ST_RES, cM, fx.p1, { dateStr: D.K, startMin: 1140 }, "พนักงานเลื่อนนัด");
  });

  // ═══════════════ X1 · ข้ามร้าน/หน่วย ═══════════════
  console.log("\n── X1: ข้ามร้าน/หน่วย ⇒ ไม่พบ (ข้อความเดียวกับ id ที่ไม่มี) ──");
  await st("X1-1", "ย้ายนัดร้าน A ด้วย ctx ร้าน B · ctx หน่วยอื่นร้านเดียวกัน ⇒ NOT_FOUND เหตุผลเท่ากับ id ที่ไม่มีจริง · แถวไม่เปลี่ยน", async () => {
    needM();
    const nope = await CAL.move()(OWNER, cM, "svcb14_nope", { dateStr: D.M, startMin: 1140 }, { expect: { startAt: at(D.M, 600).toISOString(), staffId: sM[0] } });
    ok(!nope.ok, "id ไม่มีจริงต้องล้ม");
    const why0 = (nope as { reason: string }).reason;
    eq((nope as { code: string }).code, "NOT_FOUND", "id ไม่มีจริง");
    const w1 = await noWrite(fx.m3, () => mv(OWNER, cB, fx.m3, { dateStr: D.M, startMin: 1140 }), "NOT_FOUND", "ctx ร้าน B");
    const w2 = await noWrite(fx.m3, () => mv(OWNER, cM2, fx.m3, { dateStr: D.M, startMin: 1140 }), "NOT_FOUND", "ctx หน่วย M2");
    eq([w1, w2], [why0, why0], "ข้อความเดียวกัน");
  }, "CRITICAL");
  await st("X1-2", "ปลายทางนอกหน่วย: staffId ของหน่วย M2 / ของร้าน B ⇒ NOT_FOUND ไม่เขียน", async () => {
    needM();
    await noWrite(fx.m3, () => mv(OWNER, cM, fx.m3, { dateStr: D.M, startMin: 1140, staffId: ids.m2s }), "NOT_FOUND", "หมอหน่วย M2");
    await noWrite(fx.m3, () => mv(OWNER, cM, fx.m3, { dateStr: D.M, startMin: 1140, staffId: ids.bs }), "NOT_FOUND", "หมอร้าน B");
  }, "CRITICAL");
  await st("X1-3", "bookForCustomer: บริการ/หมอของหน่วยอื่น ⇒ NOT_FOUND ไม่สร้างแถว", async () => {
    needTpl();
    const n0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1`, [ids.uM]))[0].n;
    const a = await CAL.book()(OWNER, cM, { serviceId: ids.M2SVC, staffId: null, dateStr: D.K, startMin: 600, customerName: NAME, customerPhone: newPhone(), idempotencyKey: rid("k") });
    const b = await CAL.book()(OWNER, cM, { serviceId: ids.PLAIN, staffId: ids.bs, dateStr: D.K, startMin: 600, customerName: NAME, customerPhone: newPhone(), idempotencyKey: rid("k") });
    eq([a.ok ? "OK" : a.code, b.ok ? "OK" : b.code], ["NOT_FOUND", "NOT_FOUND"], "รหัส");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1`, [ids.uM]))[0].n, n0, "แถว");
  }, "CRITICAL");

  // ═══════════════ K · จองจากปฏิทิน ═══════════════
  console.log("\n── K: คลิกช่องว่าง → bookForCustomer (= bookAppointment ช่อง STAFF) ──");
  await st("K-1", "คลิกช่องว่างคอลัมน์หมอ 1 10:00 ⇒ ok ช่อง STAFF · ขึ้นในปฏิทินคอลัมน์นั้น · ส่งซ้ำ key เดิม ⇒ ได้นัดเดิม (แถวเดียว)", async () => {
    needTpl();
    const key = rid("k1");
    const inp: BookForInput = { serviceId: ids.PLAIN, staffId: sM[0], dateStr: D.K, startMin: 600, customerName: NAME, customerPhone: newPhone(), idempotencyKey: key };
    const r = await CAL.book()(OWNER, cM, inp);
    ok(r.ok, `จอง: ${fmt(r)}`);
    fx.k1 = (r as { id: string }).id;
    const [row] = await q<{ channel: string; staffId: string; status: string }>(`SELECT channel::text AS channel, "staffId", status::text AS status FROM "Appointment" WHERE id = $1`, [fx.k1]);
    eq([row.channel, row.staffId, ["CONFIRMED", "PENDING"].includes(row.status)], ["STAFF", sM[0], true], "แถว");
    const v = await mustView(OWNER, cM, { dateStr: D.K, mode: "STAFF" });
    ok(colOf(v, sM[0]).blocks.some((b) => b.appointmentId === fx.k1), "ไม่ขึ้นในปฏิทิน");
    const r2 = await CAL.book()(OWNER, cM, inp);
    eq([r2.ok, (r2 as { id?: string }).id], [true, fx.k1], "ส่งซ้ำ");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "idempotencyKey" = $1`, [key]))[0].n, 1, "แถวเดียว");
  });
  await st("K-2", "ช่องไม่ว่าง ⇒ FULL · คอลัมน์คนลา (วัน C หมอ 4) ⇒ ON_LEAVE · น้ำมันเมื่อห้องเต็ม (หมอว่าง) ⇒ FULL ข้อความห้อง/เตียง · ไม่มีสิทธิ์ (พนักงานเลื่อนนัดอย่างเดียว) ⇒ FORBIDDEN · ไม่สร้างแถว", async () => {
    needTpl();
    const n0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1`, [ids.uM]))[0].n;
    const B = (a: Actor, serviceId: string, staffId: string | null, ds: string, min: number) => CAL.book()(a, cM, { serviceId, staffId, dateStr: ds, startMin: min, customerName: NAME, customerPhone: newPhone(), idempotencyKey: rid("k") });
    eq((await B(OWNER, ids.PLAIN, sM[0], D.K, 630) as { code?: string }).code, "FULL", "ทับ k1");
    eq((await B(OWNER, ids.PLAIN, sM[3], D.C, 900) as { code?: string }).code, "ON_LEAVE", "หมอลา");
    await bookOk(cM, ids.OIL, sM[0], D.K, 780, "K ห้อง A"); await bookOk(cM, ids.OIL, sM[1], D.K, 780, "K ห้อง B");
    const full = await B(OWNER, ids.OIL, sM[3], D.K, 780) as { ok: boolean; code?: string; reason?: string };
    eq(full.code, "FULL", "ห้องเต็ม");
    ok(/ห้อง|เตียง/.test(full.reason ?? ""), `ข้อความห้อง ${full.reason}`);
    eq((await B(ST_RES, ids.PLAIN, sM[2], D.K, 900) as { code?: string }).code, "FORBIDDEN", "ไม่มีสิทธิ์จอง");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1`, [ids.uM]))[0].n, n0 + 2, "แถว (เฉพาะ 2 นัดตั้งฉาก)");
  });
  await st("K-3", "คลิกช่องในมุมห้อง (ใบสั่ง §9 ข้อ 5): staffId null = ใครก็ได้ + ห้องเลือกโดยด่าน ⇒ ok ได้ห้องชนิดที่บริการใช้", async () => {
    needTpl();
    const r = await CAL.book()(OWNER, cM, { serviceId: ids.OIL, staffId: null, dateStr: D.K, startMin: 960, customerName: NAME, customerPhone: newPhone(), idempotencyKey: rid("k3") });
    ok(r.ok, `จอง ${fmt(r)}`);
    const a = await apRow((r as { id: string }).id);
    ok([ids.rA, ids.rB].includes(a.resourceId ?? ""), `ห้อง ${a.resourceId}`);
  });

  // ═══════════════ XC · ยิงพร้อมกัน ═══════════════
  console.log("\n── XC: ยิงพร้อมกัน 5 โพรเซส (กันจองซ้อน — ห้ามตัด) ──");
  const readDeadlocks = async () => Number((await q<{ n: string }>(`SELECT deadlocks::text AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? NaN);
  const spread = (calls: CallSpec[], n = 5): CallSpec[][] => Array.from({ length: n }, (_, i) => calls.filter((_, k) => k % n === i));
  const xa: Record<string, string[]> = {};
  const xExp: Record<string, { startAt: string; staffId: string }> = {};
  const xPre = await (async () => {
    try {
      needTpl();
      if (!hasCal) return false;
      const [u1, u2, u3, u4, u5] = XU;
      xa.x1 = []; for (let k = 1; k <= 10; k++) xa.x1.push(await bookOk(cX(u1), xSvc(u1, "PLAIN"), xStaff(u1)[k], D.X, 600, `XC1 ${k}`));
      xa.x2 = []; for (let k = 0; k < 10; k++) xa.x2.push(await bookOk(cX(u2), xSvc(u2, "OIL30"), xStaff(u2)[k], D.X, 600 + 30 * k, `XC2 ${k}`));
      xa.x3 = [await bookOk(cX(u3), xSvc(u3, "PLAIN"), xStaff(u3)[0], D.X, 600, "XC3")];
      xa.x4 = []; for (let k = 0; k < 5; k++) xa.x4.push(await bookOk(cX(u4), xSvc(u4, "OIL30"), xStaff(u4)[k], D.X, 600 + 30 * k, `XC4 ${k}`));
      xa.x5 = []; for (let k = 0; k < 9; k++) xa.x5.push(await bookOk(cX(u5), xSvc(u5, "OIL30"), xStaff(u5)[k], D.X, 600 + 30 * k, `XC5 ${k}`));
      // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock) ▸ XC6: 9 นัด (ห้องเดียว) · XC7: 9 นัด + 1 นัดถือห้อง (ความจุ 2) ที่เวลาปลายทาง D6 14:00
      xa.x6 = []; for (let k = 0; k < 9; k++) xa.x6.push(await bookOk(cX(XL[0]), xSvc(XL[0], "OIL30"), xStaff(XL[0])[k], D.X, 600 + 30 * k, `XC6 ${k}`));
      xa.x7 = []; for (let k = 0; k < 9; k++) xa.x7.push(await bookOk(cX(XL[1]), xSvc(XL[1], "OIL30"), xStaff(XL[1])[k], D.X, 600 + 30 * k, `XC7 ${k}`));
      xa.x7pre = [await bookOk(cX(XL[1]), xSvc(XL[1], "OIL30"), xStaff(XL[1])[9], D6, 840, "XC7 ถือห้องที่ปลายทาง")];
      for (const id of Object.values(xa).flat()) xExp[id] = await expOf(id);
      return true;
    } catch (e) { console.log(`  ⚠️ ข้อมูลตั้งต้น XC: ${errMsg(e)}`); return false; }
  })();
  const [u1, u2, u3, u4, u5] = XU;
  const mvCall = (u: string, id: string, to: CalMoveTo): CallSpec => ({ fn: "move", actor: OWNER, ctx: cX(u), id, to, expect: xExp[id] ?? { startAt: "", staffId: "" } });
  const scenarios: Scenario[] = xPre ? [
    { key: "XC1", perChild: spread(xa.x1.map((id) => mvCall(u1, id, { dateStr: D.X, startMin: 900, staffId: xStaff(u1)[0] }))) },
    { key: "XC2", perChild: spread(xa.x2.map((id) => mvCall(u2, id, { dateStr: D.X, startMin: 1080 }))) },
    { key: "XC3", perChild: spread(Array.from({ length: 10 }, (_, k) => mvCall(u3, xa.x3[0], { dateStr: D.X, startMin: 660 + 30 * k }))) },
    { key: "XC4", perChild: spread([
      ...xa.x4.map((id) => mvCall(u4, id, { dateStr: D.X, startMin: 1080 })),
      ...[5, 6, 7, 8, 9].map((k): CallSpec => ({ fn: "book", actor: OWNER, ctx: cX(u4), input: { serviceId: xSvc(u4, "OIL30"), staffId: xStaff(u4)[k], dateStr: D.X, startMin: 1080, customerName: NAME, customerPhone: newPhone(), idempotencyKey: rid("xc4") } })),
    ]) },
    { key: "XC5", perChild: spread([
      { fn: "maint", actor: OWNER, ctx: cX(u5), id: xRoom(u5), windows: [{ startAt: at(D.X2, 780).toISOString(), endAt: at(D.X2, 960).toISOString(), note: "ปิดซ่อม XC5" }] },
      ...xa.x5.map((id) => mvCall(u5, id, { dateStr: D.X2, startMin: 840 })),
    ]) },
    // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock)
    { key: "XC6", perChild: spread([
      { fn: "maint", actor: OWNER, ctx: cX(XL[0]), id: xRoom(XL[0]), windows: [{ startAt: at(D6, 780).toISOString(), endAt: at(D6, 960).toISOString(), note: "ปิดซ่อม XC6" }] },
      ...xa.x6.map((id, k): CallSpec => ({ fn: "self", ctx: cX(XL[0]), id, to: { dateStr: D6, startMin: 840, staffId: xStaff(XL[0])[k] } })),
    ]) },
    { key: "XC7", perChild: spread([
      { fn: "cap", actor: OWNER, ctx: cX(XL[1]), id: xRoom(XL[1]), capacity: 1 },
      ...xa.x7.map((id, k): CallSpec => ({ fn: "shop", ctx: cX(XL[1]), id, to: { dateStr: D6, startMin: 840, staffId: xStaff(XL[1])[k] } })),
    ]) },
  ] : [];
  let xOut: Map<string, CallOut[]> | null = null;
  let xErr = !hasCal ? `ยังไม่มีงานของใบ (${F.cal} loadCalendar/moveAppointment)` : !xPre ? "ข้อมูลตั้งต้น XC ไม่ครบ" : "";
  const dl0 = await readDeadlocks();
  if (!xErr) { try { xOut = await runHarness(scenarios, 5); } catch (e) { xErr = errMsg(e); } }
  const outsOf = (k: string): CallOut[] => { if (!xOut) throw new AssertFail(`สายยิงพร้อมกันไม่ทำงาน: ${xErr}`); return xOut.get(k) ?? []; };
  const noThrow = (os: CallOut[]) => { const t = os.filter((o) => o.threw); ok(t.length === 0, `throw ${t.length}: ${t[0]?.threw}`); };
  const okN = (os: CallOut[], fn?: CallSpec["fn"]) => os.filter((o) => o.ok && (!fn || o.fn === fn)).length;
  await st("XC-1", "ช่องคนเดียว: 10 นัด (คนละหมอ) ลากพร้อมกันไปหมอ 0 เวลาเดียวกัน ⇒ ได้ 1 พอดี · ที่เหลือ FULL/BUSY · หมอไม่ซ้อนในฐาน", async () => {
    const os = outsOf("XC1"); noThrow(os);
    eq(okN(os), 1, `ok (${fmt(os.map((o) => o.code ?? "OK"))})`);
    ok(os.filter((o) => !o.ok).every((o) => o.code === "FULL" || o.code === "BUSY"), `รหัส ${fmt(os.map((o) => o.code))}`);
    eq(await staffOverlap(u1), [], "หมอซ้อน");
  });
  await st("XC-2", "ห้องเดียว: 10 นัดน้ำมัน (คนละหมอ) ลากพร้อมกันไป 18:00 หมอเดิม ⇒ ได้ 1 พอดี · ฐานห้องไม่เกินความจุ", async () => {
    const os = outsOf("XC2"); noThrow(os);
    eq(okN(os), 1, `ok (${fmt(os.map((o) => o.code ?? "OK"))})`);
    eq(await resViolations(u2), [], "ฐาน");
  });
  await st("XC-3", "จอเก่า 10 ทาง: นัดเดียวลากพร้อมกันไป 10 ช่องว่างต่างกัน (expect เดียวกัน) ⇒ สำเร็จ 1 · ที่เหลือ LOST_RACE/BUSY · event 1 · แถวอยู่ช่องของผู้ชนะ", async () => {
    const os = outsOf("XC3"); noThrow(os);
    eq(okN(os), 1, `ok (${fmt(os.map((o) => o.code ?? "OK"))})`);
    ok(os.filter((o) => !o.ok).every((o) => o.code === "LOST_RACE" || o.code === "BUSY"), `รหัส ${fmt(os.map((o) => o.code))}`);
    eq((await obKeys(xa.x3[0])).length, 1, "event");
    const a = await apRow(xa.x3[0]);
    ok(a.startAt.getTime() !== bkkMs(D.X, 600), "แถวไม่ขยับ");
  });
  await st("XC-4", "ลาก 5 ∥ จองจากปฏิทิน 5 ไปห้องเดียวเวลาเดียวกัน ⇒ สำเร็จรวม 1 พอดี · ฐานไม่ซ้อน", async () => {
    const os = outsOf("XC4"); noThrow(os);
    eq(okN(os), 1, `ok (${fmt(os.map((o) => `${o.fn}:${o.code ?? "OK"}`))})`);
    eq(await resViolations(u4), [], "ฐาน");
  });
  await st("XC-5", "ลาก 9 ∥ ปิดซ่อมห้อง 13:00–16:00 (ลากไป 14:00) ⇒ ปิดซ่อมสำเร็จ ⇒ ลากได้ 0 · ลากได้ ⇒ ปิดซ่อม IN_USE · ลากได้ ≤ 1 · ฐานไม่มีนัดในช่วงปิดซ่อม (ลำดับล็อก §2: SvcResource ก่อนแถวนัด)", async () => {
    const os = outsOf("XC5"); noThrow(os);
    const m = os.find((o) => o.fn === "maint")!;
    const moves = okN(os, "move");
    ok(moves <= 1, `ลากได้ ${moves}`);
    if (m.ok) eq(moves, 0, "ปิดซ่อมสำเร็จแต่ยังลากเข้า");
    else { ok(m.code === "IN_USE" || m.code === "BUSY", `รหัสปิดซ่อม ${m.code}`); if (m.code === "IN_USE") eq(moves, 1, "IN_USE ต้องมีนัดที่ลากเข้าแล้ว"); }
    eq(await resViolations(u5, await maintOf(u5)), [], "ฐาน");
  });
  // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B14-lock)
  await st("XC-6", "ลูกค้าเลื่อนเอง (rescheduleBySelf) 9 ∥ ปิดซ่อมห้อง 13:00–16:00 (เลื่อนไป 14:00) ⇒ ปิดซ่อมสำเร็จ ⇒ เลื่อนได้ 0 · IN_USE ⇒ เลื่อนได้ 1 · ≤ 1 · ฐานไม่มีนัดในช่วงปิดซ่อม (ลำดับล็อก: SvcResource ก่อนแถวนัด)", async () => {
    const os = outsOf("XC6"); noThrow(os);
    const m = os.find((o) => o.fn === "maint")!;
    const moves = okN(os, "self");
    ok(moves <= 1, `เลื่อนได้ ${moves} (${fmt(os.map((o) => `${o.fn}:${o.code ?? "OK"}`))})`);
    if (m.ok) eq(moves, 0, "ปิดซ่อมสำเร็จแต่ยังเลื่อนเข้า");
    else { ok(m.code === "IN_USE" || m.code === "BUSY", `รหัสปิดซ่อม ${m.code}`); if (m.code === "IN_USE") eq(moves, 1, "IN_USE ต้องมีนัดที่เลื่อนเข้าแล้ว"); }
    eq(await resViolations(XL[0], await maintOf(XL[0])), [], "ฐาน");
  });
  await st("XC-7", "ร้านเลื่อน (rescheduleByShop) 9 ∥ ลดความจุห้อง 2 → 1 (มีนัดถือห้องที่ปลายทางแล้ว 1) ⇒ ลดสำเร็จ ⇒ เลื่อนได้ 0 · IN_USE ⇒ เลื่อนได้ 1 · ≤ 1 · ฐานไม่เกินความจุ", async () => {
    const os = outsOf("XC7"); noThrow(os);
    const c = os.find((o) => o.fn === "cap")!;
    const moves = okN(os, "shop");
    ok(moves <= 1, `เลื่อนได้ ${moves} (${fmt(os.map((o) => `${o.fn}:${o.code ?? "OK"}`))})`);
    if (c.ok) eq(moves, 0, "ลดความจุสำเร็จแต่ยังเลื่อนเข้า");
    else { ok(c.code === "IN_USE" || c.code === "BUSY", `รหัสลดความจุ ${c.code}`); if (c.code === "IN_USE") eq(moves, 1, "IN_USE ต้องมีนัดที่เลื่อนเข้าแล้ว"); }
    eq(await resViolations(XL[1]), [], "ฐาน");
  });
  await st("XC-9", "deadlock ของฐาน (pg_stat_database.deadlocks) ไม่ขยับตลอดฉาก XC (ลำดับล็อก: สาขา → ช่าง → SvcResource ORDER BY id → แถวนัด)", async () => {
    ok(!!xOut, `สายยิงพร้อมกันไม่ทำงาน: ${xErr}`);
    await sleep(12_000);
    const dl1 = await readDeadlocks();
    ok(Number.isFinite(dl0) && Number.isFinite(dl1), "อ่านตัวนับไม่ได้");
    eq(dl1 - dl0, 0, "deadlock เพิ่ม");
  }, "MAJOR");

  // ═══════════════ U · จอ ═══════════════
  console.log("\n── U: คอมโพเนนต์ + หน้า + action ──");
  await st("U-1", "CalendarBoard (วัน·คน · เจ้าของ): [data-bq-calendar] · [data-cal-col] ตามลำดับ columns · บล็อกในคอลัมน์ตรง view · คอลัมน์ลา data-closed=LEAVE + ข้อความลา · movable ⇒ draggable=\"true\" · ไม่ movable ⇒ ไม่ draggable · สลับ [data-cal-range] DAY/WEEK · [data-cal-mode] STAFF/RESOURCE · [data-cal-book] · ‹ ›", async () => {
    needTpl();
    const v = await mustView(OWNER, cM, { dateStr: D.C, mode: "STAFF" });
    const html = render({ view: v });
    eq(boxes(html, "data-bq-calendar").length, 1, "ราก");
    const colsH = boxes(html, "data-cal-col");
    eq(colsH.map((c) => c.attrs["data-cal-col"]), v.columns.map((c) => c.key), "คอลัมน์");
    for (const c of v.columns) {
      const box = colsH.find((x) => x.attrs["data-cal-col"] === c.key)!;
      eq(boxes(box.html, "data-cal-block").map((b) => b.attrs["data-cal-block"]).sort(), c.blocks.map((b) => b.appointmentId).sort(), `บล็อก ${c.name}`);
      if (c.closed) { eq(box.attrs["data-closed"], c.closed.code, `data-closed ${c.name}`); ok(textOf(box.html).includes(c.closed.reasonTh), `ข้อความปิด ${c.name}`); }
    }
    for (const b of v.columns.flatMap((c) => c.blocks)) {
      const bx = boxes(html, "data-cal-block", b.appointmentId)[0];
      ok(!!bx, `ไม่มีบล็อก ${b.appointmentId}`);
      eq(bx.attrs.draggable === "true", b.movable, `draggable ${b.label} ${b.status}`);
    }
    eq(boxes(html, "data-cal-range").map((b) => b.attrs["data-cal-range"]).sort(), ["DAY", "WEEK"], "สลับวัน/สัปดาห์");
    eq(boxes(html, "data-cal-mode").map((b) => b.attrs["data-cal-mode"]).sort(), ["RESOURCE", "STAFF"], "สลับคน/ห้อง");
    ok(boxes(html, "data-cal-mode", "STAFF")[0] && textOf(boxes(html, "data-cal-mode", "STAFF")[0].html).includes(v.providerLabel), "ป้าย \"ตาม<คำเรียก>\"");
    ok(boxes(html, "data-cal-mode", "RESOURCE")[0] && textOf(boxes(html, "data-cal-mode", "RESOURCE")[0].html).includes("ห้อง"), "ป้าย \"ตามห้อง/เตียง\"");
    eq(boxes(html, "data-cal-book").length >= 1, true, "ปุ่มจองให้ลูกค้า");
    ok(boxes(html, "data-cal-prev").length === 1 && boxes(html, "data-cal-next").length === 1, "‹ ›");
    eq(piiLeak(html), [], "PII ใน HTML");
  }, "MAJOR");
  await st("U-2", "CalendarBoard มุมห้อง + ผู้ดูช่าง: คอลัมน์ห้องมีชื่อ/ชนิด · \"ยังไม่ได้ห้อง\" · ปิดซ่อมทั้งวัน data-closed=MAINTENANCE · ผู้ดูไม่มีสิทธิ์ย้าย/จอง ⇒ ไม่มี draggable=\"true\" และไม่มี [data-cal-book]", async () => {
    needTpl();
    const v = await mustView(OWNER, cM, { dateStr: D.C, mode: "RESOURCE" });
    const html = render({ view: v });
    eq(boxes(html, "data-cal-col").map((c) => c.attrs["data-cal-col"]), v.columns.map((c) => c.key), "คอลัมน์ห้อง");
    ok(textOf(boxes(html, "data-cal-col", ids.rA)[0]?.html ?? "").includes("ห้องน้ำมัน A"), "ชื่อห้อง");
    ok(textOf(boxes(html, "data-cal-col", "UNASSIGNED")[0]?.html ?? "").includes("ยังไม่ได้ห้อง"), "ยังไม่ได้ห้อง");
    eq(boxes(html, "data-cal-col", ids.bed3)[0]?.attrs["data-closed"], "MAINTENANCE", "ปิดซ่อมทั้งวัน");
    const r = await mustView(ST_RUN, cM, { dateStr: D.C, mode: "STAFF" });
    const h2 = render({ view: r });
    ok(!/draggable="true"/.test(h2), "ช่างต้องลากไม่ได้");
    eq(boxes(h2, "data-cal-book").length, 0, "ช่างไม่มีปุ่มจอง");
  }, "MAJOR");
  await st("U-3", "วันนี้: กล่อง [data-bq-walkin-now] + [data-bq-res-now] (ชิ้นละ [data-res-now=<id>] data-state ตาม resourcesNow) · วันอื่นไม่มีกล่อง", async () => {
    needTpl();
    const now = at(TODAY, 860);
    const v = await mustView(OWNER, cT, { dateStr: TODAY, mode: "STAFF", now });
    const html = render({ view: v });
    eq(boxes(html, "data-bq-walkin-now").length, 1, "กล่อง walk-in");
    eq(boxes(html, "data-bq-res-now").length, 1, "กล่องห้องตอนนี้");
    eq(boxes(html, "data-res-now").map((b) => [b.attrs["data-res-now"], b.attrs["data-state"]]), (v.resourcesNow ?? []).map((r) => [r.id, r.state]), "สถานะห้อง");
    const o = render({ view: await mustView(OWNER, cT, { dateStr: addDays(TODAY, 1), mode: "STAFF", now }) });
    eq([boxes(o, "data-bq-walkin-now").length, boxes(o, "data-bq-res-now").length], [0, 0], "วันอื่น");
  }, "MAJOR");
  await st("U-4", `«${F.comp}»: 'use client' · ไม่ import ค่าจาก @/lib/modules/* (ยกเว้น resource-kinds) · @/lib/actions/* · @/lib/core/db · @prisma/client (actions มาทาง props)`, () => {
    const s = src(F.comp);
    ok(!!s, `ยังไม่มี ${F.comp}`);
    ok(/^\s*["']use client["']/.test(s), "ไม่มี 'use client'");
    const valueImports = [...stripComments(s).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    const bad = valueImports.filter((x) => (x.startsWith("@/lib/modules") && x !== "@/lib/modules/booking/resource-kinds") || x.startsWith("@/lib/actions") || x === "@/lib/core/db" || x === "@prisma/client");
    eq(bad, [], "import ต้องห้าม");
  }, "MAJOR");
  await st("U-5", `หน้า «${F.page}»: requireUnit · loadCalendar · null ⇒ notFound() · force-dynamic · ?at= ใต้ SVC_QC_CLOCK · แท็บ layout "ปฏิทินนัด" → /calendar (ก่อนแท็บคำเรียกผู้ให้บริการ) · /booking/day คงไว้`, () => {
    const p = stripComments(src(F.page));
    ok(!!p, `ยังไม่มี ${F.page}`);
    ok(/requireUnit\s*\(/.test(p) && /loadCalendar\s*\(/.test(p) && /notFound\s*\(/.test(p), "requireUnit/loadCalendar/notFound");
    ok(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(p), "force-dynamic");
    ok(!/[?&]at=|searchParams/.test(p) || /SVC_QC_CLOCK/.test(p), "?at= ต้องอยู่ใต้ SVC_QC_CLOCK");
    const l = stripComments(src(F.layout));
    const iCal = l.indexOf("/calendar"), iLabel = l.indexOf("ปฏิทินนัด"), iStaff = l.indexOf("/staff");
    ok(iCal >= 0 && iLabel >= 0 && iCal < iStaff, `แท็บ /calendar (${iCal}) ก่อน /staff (${iStaff})`);
    ok(existsSync(join(ROOT, "src/app/app/u/[unitSlug]/booking/day/page.tsx")), "/booking/day ถูกลบ");
  }, "MAJOR");
  await st("U-6", `action «${F.actions}»: "use server" · export async function เท่านั้น · moveAppointmentAction/bookForCustomerAction เรียก assertBookingActionAllowed ก่อน facade · ส่ง expect (expectStartAt/expectStaffId) · scheduleDrain + revalidatePath · ?err= · นาฬิกา QC ใต้ SVC_QC_CLOCK`, () => {
    const a = src(F.actions);
    ok(!!a, `ยังไม่มี ${F.actions}`);
    ok(/^\s*["']use server["']/.test(a), "ไม่มี use server");
    const s = stripComments(a);
    const exps = [...s.matchAll(/^\s*export\s+(?!async\s+function)(\w+)/gm)].map((m) => m[1]);
    eq(exps, [], "export ที่ไม่ใช่ async function");
    for (const [n, f] of [["moveAppointmentAction", "moveAppointment"], ["bookForCustomerAction", "bookForCustomer"]] as const) {
      const i = s.search(new RegExp(`export\\s+async\\s+function\\s+${n}\\b`));
      ok(i >= 0, `ไม่มี ${n}`);
      const body = s.slice(i, i + 2500);
      const g = body.search(/assertBookingActionAllowed\s*\(/), c = body.search(new RegExp(`\\b${f}\\s*\\(`));
      ok(g >= 0 && c > g, `${n}: ต้องตรวจสิทธิ์ก่อนเรียก ${f}`);
    }
    ok(/expectStartAt/.test(s) && /expectStaffId/.test(s), "ไม่ส่ง expect");
    ok(/scheduleDrain\s*\(/.test(s) && /revalidatePath\s*\(/.test(s), "scheduleDrain/revalidatePath");
    ok(/err/.test(s) && /SVC_QC_CLOCK/.test(s), "?err= / SVC_QC_CLOCK");
  }, "MAJOR");

  // ═══════════════ A · แก้เวลามาถึงจริง (รอเจ้าของ) ═══════════════
  console.log("\n── A: แก้เวลามาถึงจริง (ใบสั่ง §9 ข้อ 1 · รอเจ้าของ) ──");
  if (!ARRIVAL) {
    for (const [id, n] of [["A-1", "ARRIVED มาสาย 10:20 → แก้เป็น 10:00 ⇒ ok · checkedInAt ใหม่ · ล้างเครื่องหมาย unplaced · audit"], ["A-2", "เวลาใหม่หลังเดิม/อนาคต/ก่อนนัด > 60 นาที ⇒ BAD_INPUT · ไม่ใช่ ARRIVED ⇒ BAD_STATE · ไม่เขียน"], ["A-3", "สิทธิ์ booking.checkin · ข้ามร้าน ⇒ NOT_FOUND"]]) {
      skip(id, n, "รอเจ้าของตอบ (SVC-OWNER-QUESTIONS B.13 'แก้เวลามาถึง') — เปิดด้วย --arrival หลังตอบ \"เอา\"", "MAJOR");
    }
  } else {
    const ST_CHECKIN: Actor = { role: "STAFF", unitAccess: ["*"], permissions: { "booking.checkin": true }, userId: TID("stCheckin") };
    const now = at(TODAY, 640);
    const mk = async (k: string, status: string, checkedInMin: number | null) => {
      fx[k] = rid(k);
      await insertRow("Appointment", { id: fx[k], tenantId: ids.tA, unitId: ids.uA, staffId: ids.as1, serviceId: ids.ASVC, startAt: at(TODAY, 600), endAt: at(TODAY, 660), status,
        checkedInAt: checkedInMin === null ? null : at(TODAY, checkedInMin), policySnapshot: JSON.stringify({ job: { durationMin: 60, bufferMin: 0, unplacedAt: at(TODAY, 621).toISOString(), unplacedFor: checkedInMin === null ? null : at(TODAY, checkedInMin).toISOString() } }),
        customerName: `${NAME} ${k}`, customerPhone: newPhone(), updatedAt: new Date() });
    };
    await st("A-1", "ARRIVED มาสาย 10:20 → แก้เป็น 10:00 ⇒ ok · checkedInAt = 10:00 · job.unplacedAt/unplacedFor หาย · AuditLog 1 แถว (before/after)", async () => {
      needTpl();
      await mk("a1", "ARRIVED", 620);
      const r = await CAL.arrival()(OWNER, cA, fx.a1, at(TODAY, 600).toISOString(), { now });
      ok(r.ok, `แก้เวลา ${fmt(r)}`);
      const [row] = await q<{ checkedInAt: Date; policySnapshot: { job?: Record<string, unknown> } }>(`SELECT "checkedInAt", "policySnapshot" FROM "Appointment" WHERE id = $1`, [fx.a1]);
      eq(row.checkedInAt.getTime(), bkkMs(TODAY, 600), "checkedInAt");
      ok(!("unplacedAt" in (row.policySnapshot?.job ?? {})) && !("unplacedFor" in (row.policySnapshot?.job ?? {})), "เครื่องหมายยังอยู่");
      ok((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2`, [ids.tA, fx.a1]))[0].n >= 1, "ไม่มี audit");
    }, "MAJOR");
    await st("A-2", "เวลาใหม่หลังเวลาเดิม/อนาคต/ก่อนนัด > 60 นาที ⇒ BAD_INPUT · ไม่ใช่ ARRIVED ⇒ BAD_STATE · ไม่เขียน", async () => {
      needTpl();
      await mk("a2", "ARRIVED", 620); await mk("a3", "CONFIRMED", null);
      for (const [t, what] of [[625, "หลังเดิม"], [700, "อนาคต"], [530, "ก่อนนัดเกิน 60"]] as const) {
        await noWrite(fx.a2, () => CAL.arrival()(OWNER, cA, fx.a2, at(TODAY, t).toISOString(), { now }), "BAD_INPUT", what);
      }
      await noWrite(fx.a3, () => CAL.arrival()(OWNER, cA, fx.a3, at(TODAY, 600).toISOString(), { now }), "BAD_STATE", "ยังไม่มาถึง");
    }, "MAJOR");
    await st("A-3", "สิทธิ์ booking.checkin (ไม่มี ⇒ FORBIDDEN · มี ⇒ ok) · ctx ร้านอื่น ⇒ NOT_FOUND", async () => {
      needTpl();
      await mk("a4", "ARRIVED", 620);
      await noWrite(fx.a4, () => CAL.arrival()(ST_NONE, cA, fx.a4, at(TODAY, 600).toISOString(), { now }), "FORBIDDEN", "ไม่มีสิทธิ์");
      await noWrite(fx.a4, () => CAL.arrival()(OWNER, cB, fx.a4, at(TODAY, 600).toISOString(), { now }), "NOT_FOUND", "ข้ามร้าน");
      const r = await CAL.arrival()(ST_CHECKIN, cA, fx.a4, at(TODAY, 600).toISOString(), { now });
      ok(r.ok, `หน้าเคาน์เตอร์ ${fmt(r)}`);
    }, "MAJOR");
  }

  // ═══════════════ Q · ฉาก svcqc ═══════════════
  console.log("\n── Q: ฉาก svcqc (scripts/svc-qc-calendar-scene.mts) ──");
  {
    const UM = SQC.units.massage.id;
    const svcStaff = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "BookingStaff" WHERE "tenantId" = $1 AND "unitId" = $2 AND active`, [SQC.tenant.id, UM]))[0]?.n ?? 0;
    const svcRes = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SvcResource" WHERE "tenantId" = $1 AND "unitId" = $2 AND id LIKE 'svcqc-res-%'`, [SQC.tenant.id, UM]))[0]?.n ?? 0;
    const runTsx = (file: string, args: string[] = []) => {
      const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
      let sum: { created?: number; updated?: number; removed?: number } | null = null;
      try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
      return { status: r.status, out, sum };
    };
    const shopRows = async () => JSON.stringify(await q(`SELECT key, scope, "scopeId", value::text AS v, "effectiveFrom" FROM "SettingValue" WHERE "tenantId" = $1 AND scope IN ('TENANT','UNIT') ORDER BY key, scope, "scopeId", "effectiveFrom"`, [SQC.tenant.id]));
    if (svcStaff !== SQC.massage.staff.length || svcRes < 12) {
      for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "ปฏิทินวันฉากตรงภาพ 02"], ["Q-3", "รันซ้ำไม่เขียน"], ["Q-4", "ไม่แตะค่าตั้งชั้นร้าน/สาขา"]]) {
        skip(id, n, `ร้าน svcqc หน่วยนวด: หมอ ${svcStaff}/${SQC.massage.staff.length} · ทรัพยากรฉาก B.13 ${svcRes}/12 — รัน seed → ฉาก B.11 → ฉาก B.13 ก่อน`, "MAJOR");
      }
    } else {
      const before = await shopRows();
      await st("Q-1", "ฉาก svcqc รันได้ (exit 0) · SCENE_SUMMARY {created,updated,removed}", () => {
        ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
        const r = runTsx(F.scene);
        ok(r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof (r.sum as Record<string, unknown>)[k] === "number"), `exit=${r.status} ${r.sum ? fmt(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`);
      }, "MAJOR");
      await st("Q-2", "ปฏิทินวันฉาก (เจ้าของ svcqc · มุมคน · 14:20): คอลัมน์ = หมอ 6 คนตามลำดับ · พี่ศรี LEAVE · จำนวนบล็อกต่อคน · คุณอรห้อง B · คุณจอย/คุณนิดห้อง A (ภาพ 02)", async () => {
        const SC = SQC_CALENDAR_SCENE;
        const owner: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: "svcqc-owner" };
        const v = await mustView(owner, { tenantId: SQC.tenant.id, unitId: UM }, { dateStr: SC.day, mode: "STAFF", now: new Date(bkkMs(SC.day, 860)) });
        eq(v.columns.map((c) => c.id), SC.expect.columns.map((k) => SC.staffIds[k]), "คอลัมน์");
        eq(v.columns.map((c) => c.closed?.code ?? null), SC.expect.columns.map((k) => SC.expect.closed[k] ?? null), "ปิด");
        eq(v.columns.map((c) => c.blocks.length), SC.expect.columns.map((k) => SC.expect.blocks[k]), "บล็อกต่อคน");
        const all = v.columns.flatMap((c) => c.blocks);
        for (const [key, resId] of Object.entries(SC.expect.resources)) {
          const bk = SC.bookings.find((b) => b.key === key)!;
          const b = all.find((x) => x.label === bk.name);
          ok(!!b, `ไม่พบบล็อก ${bk.name}`);
          ok(b!.resourceIds.includes(resId), `${bk.name} ได้ ${fmt(b!.resourceIds)} ต้องมี ${resId}`);
        }
      }, "MAJOR");
      await st("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", () => {
        ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
        const r = runTsx(F.scene);
        ok(r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${fmt(r.sum)}`);
      }, "MAJOR");
      await st("Q-4", "ฉากไม่แตะค่าตั้งชั้น TENANT/UNIT ของ svcqc (แถวก่อน = หลัง)", async () => { ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`); eq(await shopRows(), before, "SettingValue ชั้นร้าน/สาขา"); }, "MAJOR");
    }
  }

  // ═══════════════ V · ภาพ ═══════════════
  console.log("\n── V: ภาพ (จอง 02) ──");
  {
    const specs = SQC_VISUAL_SPECS["b.14"];
    const name = "ภาพ b.14 (booking-calendar · ร้านนวดวันฉาก 14:20) 1440 · HTTP < 400 · ไม่ล้นแนวนอน · ไม่มี page error";
    if (!Array.isArray(specs) || specs.length !== 1) record("V-1", name, "FAIL", `SQC_VISUAL_SPECS b.14 ${fmt(specs)}`, "MAJOR");
    else if (!BASE) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC (SVC_QC_CLOCK=1) + reseed + ฉาก B.11 → B.13 → B.14 แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "b.14", "--user", "owner", "--base", BASE], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) record("V-1", `${name} (ภาพ .qc-shots/svc/b.14 — ผู้คุมเทียบ PARITY กับจอง 02)`, "PASS", "", "MAJOR");
      else record("V-1", name, "FAIL", `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  for (const f of goFiles) { try { writeFileSync(f, ""); } catch { /* ไม่เป็นไร */ } }
  try { await cleanup(ALL_TENANTS); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupUsers();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b14-*` 0 · นัด/ทรัพยากร/ค่าตั้ง/HR/audit/outbox ของร้านทดสอบ 0 · ผู้ใช้ทดสอบ 0 (ฉาก svcqc คงไว้ให้ถ่ายภาพ)", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "SvcResource", "SvcResourceBlock", "SettingValue", "AuditLog", "OutboxEvent", "BookingStaff", "HrLeave", "HrEmployee"]) {
      if (!(await cols(t)).length) continue;
      eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [ALL_TENANTS]))[0].n, 0, t);
    }
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]))[0].n, 0, "user");
  }, "MAJOR");
  await pool.end();
}

// ═══════════════ สายยิงพร้อมกัน (parent) ═══════════════
async function runHarness(scs: Scenario[], n: number): Promise<Map<string, CallOut[]>> {
  const out = new Map<string, CallOut[]>();
  const ready = new Map<string, Set<number>>();
  const res = new Map<string, Map<number, CallOut[]>>();
  const dead = new Set<number>();
  const errs: string[] = [];
  const kids = Array.from({ length: n }, (_, idx) => {
    const spec: ChildSpec = { run: RUN, idx, scenarios: scs.map((s) => ({ key: s.key, calls: s.perChild[idx] ?? [] })) };
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, QC_B14_CHILD: JSON.stringify(spec) }, stdio: ["ignore", "pipe", "pipe"] });
    createInterface({ input: ch.stdout }).on("line", (l) => {
      const m = /^(READY|RES) (\S+)(?: (.*))?$/.exec(l);
      if (m?.[1] === "READY") { if (!ready.has(m[2])) ready.set(m[2], new Set()); ready.get(m[2])!.add(idx); }
      else if (m?.[1] === "RES") { if (!res.has(m[2])) res.set(m[2], new Map()); res.get(m[2])!.set(idx, JSON.parse(m[3] ?? "[]") as CallOut[]); }
      else if (l.startsWith("CHILD_ERR")) errs.push(`#${idx} ${l}`);
    });
    let tail = "";
    ch.stderr.on("data", (b: Buffer) => { tail = (tail + b.toString()).slice(-400); });
    ch.on("exit", (code) => { dead.add(idx); if (code !== 0) errs.push(`#${idx} exit ${code} ${tail.split("\n").filter(Boolean).slice(-1)[0] ?? ""}`); });
    return ch;
  });
  const waitFor = async (cond: () => boolean, ms: number) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) return false; await sleep(20); } return true; };
  try {
    for (const [si, sc] of scs.entries()) {
      const alive = () => [...Array(n).keys()].filter((i) => !dead.has(i));
      const allReady = await waitFor(() => alive().every((i) => ready.get(sc.key)?.has(i)) && alive().length > 0, si === 0 ? 240_000 : 90_000);
      if (!allReady || alive().length < n) throw new Error(`ลูกโพรเซสไม่พร้อมที่ ${sc.key} (พร้อม ${ready.get(sc.key)?.size ?? 0}/${n}) ${errs.slice(0, 2).join(" · ")}`);
      const f = goFile(RUN, sc.key);
      writeFileSync(f, "go");
      goFiles.push(f);
      await waitFor(() => [...Array(n).keys()].every((i) => res.get(sc.key)?.has(i) || dead.has(i)), 180_000);
      out.set(sc.key, [...Array(n).keys()].flatMap((i) => res.get(sc.key)?.get(i) ?? []));
    }
  } finally {
    await waitFor(() => dead.size === n, 30_000);
    for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL");
  }
  return out;
}

// ═══════════════ SF. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── SF: ไฟล์ · สัญญาโค้ด ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const diffLines = (rel: string) => (spawnSync("git", ["diff", "-U0", "HEAD", "--", rel], { cwd: ROOT, encoding: "utf8" }).stdout ?? "").split("\n").filter((l) => /^[+-](?![+-])/.test(l));
const OWN = new Set<string>([F.cal, F.line, F.service, F.access, F.index, F.actions, F.page, F.layout, F.comp, F.scene]);
{
  const ch = dirty(["src", "prisma", "scripts"]).filter((f) => !f.startsWith("scripts/") || f === F.scene);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.cal}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("SF-1", "แตะเฉพาะไฟล์ของใบ", "B.14 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (accept-time)");
  else await st("SF-1", "แตะเฉพาะไฟล์ของใบ (ใบสั่ง §1 · ไฟล์ใหม่ใต้ src/components/booking/calendar/ ได้) · ไฟล์ใหม่ครบ (calendar · action · หน้า · CalendarBoard · ฉาก)", () => {
    const outside = ch.filter((f) => !OWN.has(f) && !/^src\/components\/booking\/calendar\/[A-Za-z0-9_.-]+\.tsx?$/.test(f) && !f.startsWith("src/app/app/u/[unitSlug]/booking/calendar/"));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = [F.cal, F.actions, F.page, F.comp, F.scene].filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("SF-2", "ไม่มี migration/แก้ schema (prisma/ สะอาด) — ใบสั่ง §10", () => { eq(dirty(["prisma"]), [], "prisma/"); });
await st("SF-3", "ไฟล์ต้องห้ามไม่ถูกแตะ: resources.ts · planner*.ts · planner-run · today-line · line-ops · line-access · DayCalendar + /booking/day · online/deposit/finish/public-line · core/** · 3 ทะเบียน event · POS/HR", () => {
  const frozen = [
    "src/lib/modules/booking/resources.ts", "src/lib/modules/booking/planner.ts", "src/lib/modules/booking/planner-run.ts", "src/lib/modules/booking/planner-resources.ts",
    "src/lib/modules/booking/today-line.ts", "src/lib/modules/booking/line-ops.ts", "src/lib/modules/booking/line-access.ts",
    "src/components/booking/DayCalendar.tsx", "src/app/app/u/[unitSlug]/booking/day/page.tsx",
    "src/lib/modules/booking/online.ts", "src/lib/modules/booking/deposit.ts", "src/lib/modules/booking/finish.ts", "src/lib/modules/booking/public-line.ts",
    "src/lib/core", "src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts", "src/lib/modules/pos", "src/lib/modules/hr",
  ];
  const bad = dirty(frozen).concat(dirty(["src/lib/modules/booking"]).filter((f) => /\/planner-[a-z0-9-]+\.ts$/.test(f)));
  eq(bad, [], "ไฟล์ต้องห้าม");
}, "MAJOR");
await st("SF-4", "service.ts: เพิ่มบรรทัดเท่านั้น (ลบ/แก้ ≤ 3 บรรทัด — export ตัวช่วยด่านคน)", () => {
  const removed = diffLines(F.service).filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
  ok(removed.length <= 3, `ลบ/แก้ ${removed.length} บรรทัด: ${removed.slice(0, 2).join(" | ").slice(0, 160)}`);
}, "MAJOR");
await st("SF-5", "calendar.ts: ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/…) · ไม่มี any · ไม่มีตัวกันในหน่วยความจำ · ไม่เขียนฐานตรง (ย้ายผ่าน rescheduleByShop · จองผ่าน bookAppointment)", () => {
  const s = stripComments(src(F.cal));
  ok(!!s, `ยังไม่มี ${F.cal}`);
  ok(!/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)|toLocaleDateString/.test(s), "เวลาเครื่องดิบ");
  ok(!/:\s*any\b|as\s+any\b|<any>/.test(s), "มี any");
  ok(!/new\s+Mutex|async-mutex|new\s+Map<[^>]*Promise/.test(s), "ตัวกันในหน่วยความจำ");
  ok(!/\.appointment\.(update|updateMany|create|upsert|delete)\s*\(|UPDATE\s+"Appointment"|INSERT\s+INTO\s+"Appointment"/.test(s), "calendar.ts เขียนแถวนัดเอง");
  ok(/rescheduleByShop\s*\(/.test(s) && /bookAppointment\s*\(/.test(s), "ต้องเรียก rescheduleByShop + bookAppointment");
}, "MAJOR");
await st("SF-6", "rescheduleByShop ลำดับล็อก (ใบสั่ง §2 · B.13 §5): lockUnitTx → ล็อก SvcResource (loadGate lock:true) → lockAppt · ไม่มี loadGate lock:false หลัง lockAppt · CAS (ไม่มี .appointment.update()", () => {
  const s = stripComments(src(F.line));
  const i = s.search(/export\s+async\s+function\s+rescheduleByShop\b/);
  ok(i >= 0, "ไม่มี rescheduleByShop");
  const rest = s.slice(i + 10);
  const j = rest.search(/\nexport\s+(async\s+)?function\s/);
  const body = j >= 0 ? rest.slice(0, j) : rest;
  const iUnit = body.search(/lockUnitTx\s*\(/), iAppt = body.search(/lockAppt\s*\(/);
  const gates = [...body.matchAll(/loadGate\s*\(/g)].map((m) => ({ i: m.index ?? 0, lock: /lock:\s*(true|false)/.exec(body.slice(m.index ?? 0, (m.index ?? 0) + 400))?.[1] ?? "" }));
  const lockedAt = [...gates.filter((g) => g.lock === "true").map((g) => g.i), ...[...body.matchAll(/lockUnitResourcesTx\s*\(/g)].map((m) => m.index ?? 0)].sort((a, b) => a - b);
  const iRes = lockedAt.find((x) => x > iUnit) ?? -1;
  ok(iUnit >= 0 && iAppt > iUnit, "lockUnitTx ต้องมาก่อน lockAppt");
  ok(iRes > iUnit && iRes < iAppt, `ต้องล็อก SvcResource ระหว่าง lockUnitTx (${iUnit}) กับ lockAppt (${iAppt}) — พบที่ ${iRes}`);
  ok(!gates.some((g) => g.lock === "false" && g.i > iAppt), "ยังอ่านทรัพยากรแบบไม่ล็อกหลัง lockAppt");
  ok(!/\.appointment\.update\s*\(/.test(body), "เขียนแถวนัดแบบไม่ CAS");
}, "MAJOR");

// ═══════════════ G. regression ═══════════════
console.log("\n── G: regression (b.2 · b.13 · b.3 · b.4 · b.5 · b.7 · smoke) ──");
const judgeSvc = (allowSkip: (id: string) => boolean, allowFail: (id: string) => boolean = () => false) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed?: string[]; skipped?: string[] };
  return (j.failed ?? []).every(allowFail) && (j.skipped ?? []).every(allowSkip);
};
const lateNight = Number(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(11, 13)) >= 22; // หนี้ b.3 S-9 (SVC-RUN §3.2) — ช่องแรกเลย 24:00 เมื่อรันดึก
// ข้อ "ไฟล์ของใบ" ของชุดเก่า = accept-time ของใบนั้น — แดงได้ระหว่างไฟล์ B.14 ยังไม่ commit (ใบสั่ง §6)
const REG: { s: string; args?: string[]; env?: Record<string, string>; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.2", judge: (out) => { const l = out.split("\n").reverse().find((x) => x.startsWith("JSON_SUMMARY ")); return !!l && (JSON.parse(l.slice(13)) as { findings: string[] }).findings.length === 0; }, note: "findings ว่าง" },
  { s: "qc-svc-b.13", args: ["--no-regression"], judge: judgeSvc((x) => /^(Q|G)-/.test(x) || x === "V-1" || x === "SF-1", (x) => x === "SF-1"), note: "ไม่มี FAIL ยกเว้น SF-1 · SKIP เฉพาะ V-1/Q/G/SF-1" },
  { s: "qc-svc-b.3", env: { SVC_B3_NO_REGRESSION: "1" }, judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1" || (lateNight && x === "S-9")), note: "ไม่มี FAIL ยกเว้น ST-1 (+S-9 หลัง 22:00) · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1"), note: "ไม่มี FAIL ยกเว้น ST-1 · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.5", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|E|V|Q|G)-/.test(x) || x === "S-1", (x) => x === "S-1"), note: "ไม่มี FAIL ยกเว้น S-1 · SKIP เฉพาะ H/E/V/Q/G/S-1" },
  { s: "qc-svc-b.7", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|V|Q|G)-/.test(x) || x === "S-1", (x) => ["S-1", "S-2", "S-3"].includes(x)), note: "ไม่มี FAIL ยกเว้น S-1/S-2/S-3 · SKIP เฉพาะ H/V/Q/G/S-1" },
  { s: "qc-svc-smoke" },
];
{
  const why = !hasCal ? `ยังไม่มีงานของใบ (${F.cal} loadCalendar/moveAppointment) — regression รันเมื่อมีงาน` : NO_REG ? "--no-regression / SVC_B14_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b14-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error|perf/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groups: Record<string, number> = {};
for (const c of cks) { const g = c.id.replace(/-.*$/, ""); groups[g] = (groups[g] ?? 0) + 1; }
console.log(`\n===== QC SVC B.14 · ปฏิทินนัด (ลากย้าย · คน/ห้อง) =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""} · กลุ่ม ${fmt(groups)}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed · G-* เมื่อ --no-regression · SF-1 หลัง merge · A-* จนเจ้าของตอบ)
process.exit(failed.length > 0 ? 1 : 0);
