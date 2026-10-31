// QC — SVC B.13 · ทรัพยากร (ร้านนวด) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.13.md (§3 สัญญา · §4 กติกา · §5 ล็อก · §9 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว B.13
//        ledger/DESIGN-BOOKING-QUEUE.md R7 · §4.2 · §4.4 · ภาคผนวก ก #3 #13 #14 · ภาพ design-booking/12 (ส่วนทรัพยากร) · 02 (กล่อง "รับ walk-in ตอนนี้ได้ไหม") · 11 (คอลัมน์ "ต้องใช้")
//        CC K12 (SvcResource ≠ RoomOccupancy) · ใบ B.2 §3–§8 (planDay/quoteWalkIn + perf) · ใบ B.3 §2–§3 · ใบ B.4 §3.8 J1–J5 · /root/svc-runs/fix/b3.md · b4.md
//
// กลุ่มข้อ:
//   T   ทะเบียน: ค่าตั้ง booking.service.resourceKinds (ป้ายไทย · ค่าเริ่ม [] ทุกแม่แบบ) · ชนิดทรัพยากร+ป้ายไทย (pure) · ชั้น RESOURCE ในเครื่องยนต์ค่าตั้ง
//   PL  ตัววางคิว pure (planDay/quoteWalkIn + ทรัพยากร): ห้องไม่ว่าง ⇒ รอ · เก็บห้อง · ความจุ 2 · ปิดซ่อม · หลายชนิด · limitedBy คน/ห้อง/ทั้งคู่ · ตัวควบคุมไม่มีทรัพยากร
//   FZ  fuzz (ค่าเริ่ม 4 000 ชุด × 6 สมบัติ ≈ 28k planDay) · PERF (ซ้ำเกณฑ์ B.2: p95 < 50 ms · มีทรัพยากร 16 ชิ้น)
//   R   CRUD ทรัพยากร (resources.ts) · BAD_INPUT/DUPLICATE · IN_USE (ปิด/ลดความจุ/เพิ่มเวลาเก็บ/ปิดซ่อมทับนัด) · X1 NOT_FOUND เดียวกันทุกกรณี · FORBIDDEN
//   S   หาเวลา/จอง (findSlots · bookAppointment · createAppointment · rescheduleByShop/BySelf · ปลุกนัด) ต้องว่างทั้งคนและทรัพยากร
//   W   แถวเดียว: walk-in รอห้อง · "รับ walk-in ตอนนี้ได้ไหม" แยกเหตุผลคน/ห้อง · startJob ชนห้อง ⇒ CLASH · ปิดรับเมื่อห้องปิดซ่อม · มาสายเข้าแถวยังถือห้อง
//   E   _fallback: ไม่มีทรัพยากร/บริการไม่ประกาศชนิด ⇒ พฤติกรรม B1 (ร้านตัดผมไม่เปลี่ยน)
//   X   ยิงพร้อมกันจาก 5 โพรเซส (≥10 คำขอ/ฉาก): ห้องเดียว ⇒ 1 · ความจุ 3 ⇒ 3 · ผสมจอง/walk-in/เช็กอิน/วางคิว · เลื่อน · ลดความจุ · ทางเดิม+ใหม่ · ปิดซ่อม ∥ จอง · deadlock ของฐาน = 0
//   Q   ฉาก svcqc (scripts/svc-qc-resource-scene.mts) — ไม่แตะค่าตั้งชั้นร้าน/สาขา · V ภาพ จอง 12/11 · SF ไฟล์ (accept-time) · G regression · Z ล้าง
//
// เวลา: ฉาก DB ใช้วันอนาคตคงที่ (วันไทย +5…+20) + `now` ฉีดเข้า (ทางที่รับ now) · ร้านทดสอบ slug `qc-svc-b13-*` ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.13.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน · QC_BASE=http://127.0.0.1:<port> เปิด V · QC_B13_FUZZ_N=<n> เปลี่ยนจำนวนชุด fuzz — รับใบใช้ค่าเริ่ม)
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_RESOURCE_SCENE, SQC_VISUAL_SPECS } from "./svc-qc-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.13";
const F = {
  res: "src/lib/modules/booking/resources.ts",
  kinds: "src/lib/modules/booking/resource-kinds.ts",
  planner: "src/lib/modules/booking/planner.ts",
  service: "src/lib/modules/booking/service.ts",
  line: "src/lib/modules/booking/queue-line.ts",
  run: "src/lib/modules/booking/planner-run.ts",
  index: "src/lib/modules/booking/index.ts",
  model: "src/lib/modules/booking/settings-model.ts",
  access: "src/lib/modules/booking/access.ts",
  settingsSvc: "src/lib/core/settings/service.ts",
  defs: "src/lib/core/settings/defs/booking.ts",
  actions: "src/lib/actions/booking-settings.ts",
  pageStaff: "src/app/app/u/[unitSlug]/booking/staff/page.tsx",
  shared: "src/components/booking/settings/booking-settings-shared.ts",
  comp: "src/components/booking/settings/BookingResources.tsx",
  compServices: "src/components/booking/settings/BookingServicesSettings.tsx",
  scene: "scripts/svc-qc-resource-scene.mts",
};
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B13_NO_REGRESSION === "1";
const FUZZ_N = Math.max(50, Number(process.env.QC_B13_FUZZ_N ?? 4000) || 4000);
const BASE = process.env.QC_BASE ?? "";

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type ResourceKind = "CHAIR" | "BED" | "SOFA" | "ROOM" | "COUPLE_ROOM" | "EQUIPMENT" | "EXAM_ROOM";
type MaintWin = { startAt: string; endAt: string | null; note?: string };
type ResourceRow = { id: string; kind: string; name: string; capacity: number; cleanupMin: number; active: boolean; sortOrder: number; maintenance: MaintWin[]; underMaintenanceNow: boolean };
type ResFail = "NOT_FOUND" | "BAD_INPUT" | "DUPLICATE" | "IN_USE" | "FORBIDDEN" | "BUSY";
type ResResult = { ok: true; resource: ResourceRow } | { ok: false; code: ResFail; reason: string };
type ResInput = { kind: string; name: string; capacity?: number; cleanupMin?: number; sortOrder?: number };
type ResPatch = Partial<{ kind: string; name: string; capacity: number; cleanupMin: number; sortOrder: number; active: boolean }>;
type LimitedBy = "NONE" | "STAFF" | "RESOURCE" | "BOTH";
type WalkInNowRow = { serviceId: string; serviceName: string; closed: boolean; startAt: Date | null; staffId: string | null; resourceIds: string[]; limitedBy: LimitedBy; reasonTh: string };
type ResApi = {
  listResources?: (ctx: Ctx, opts?: { now?: Date }) => Promise<ResourceRow[]>;
  createResource?: (actor: Actor, ctx: Ctx, i: ResInput) => Promise<ResResult>;
  updateResource?: (actor: Actor, ctx: Ctx, id: string, patch: ResPatch, opts?: { now?: Date }) => Promise<ResResult>;
  setResourceMaintenance?: (actor: Actor, ctx: Ctx, id: string, windows: MaintWin[], opts?: { now?: Date }) => Promise<ResResult>;
  walkInNowByService?: (ctx: Ctx, opts?: { now?: Date }) => Promise<WalkInNowRow[]>;
};
type KindsApi = { RESOURCE_KINDS?: readonly string[]; RESOURCE_KIND_LABELS_TH?: Record<string, string> };
// ของ B.3/B.4/B.7 (มีแล้ว)
type BookingChannel = "ONLINE" | "LINE" | "STAFF" | "PHONE";
type BookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: BookingChannel; customerName: string; customerPhone: string; note?: string; idempotencyKey?: string };
type BookResult = { ok: true; id: string; staffId: string; status: "PENDING" | "CONFIRMED"; holdUntil: Date | null } | { ok: false; code: string; reason: string };
type CreateInput = { tenantId: string; unitId: string; serviceId: string; staffId: string; dateStr: string; startMin: number; customerName: string; customerPhone: string; source?: "STAFF" | "ONLINE" };
type SlotOpt = { startMin: number; hhmm: string; staffId: string };
type BookingApi = {
  bookAppointment: (ctx: Ctx, i: BookInput) => Promise<BookResult>;
  findSlots: (ctx: Ctx, q: { serviceId: string; staffId: string | null; dateStr: string; channel: BookingChannel }) => Promise<SlotOpt[]>;
  createAppointment: (i: CreateInput) => Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
  setAppointmentStatus: (tenantId: string, unitId: string, id: string, status: "PENDING" | "CONFIRMED" | "ARRIVED" | "DONE" | "NO_SHOW" | "CANCELLED") => Promise<{ ok: boolean; reason?: string }>;
  rescheduleBySelf: (ctx: Ctx, id: string, to: { dateStr: string; startMin: number; staffId: string | null }, opts?: { now?: Date }) => Promise<{ ok: true; startAt: Date } | { ok: false; code: string; reason: string }>;
};
type WalkInResult = { ok: true; appointmentId: string; ticketId: string; ticketNumber: string; staffId: string | null; plannedStartAt: Date | null; waitMin: number | null } | { ok: false; code: string; reason: string };
type JobResult = { ok: true } | { ok: false; code: string; reason: string };
type LineApi = {
  createWalkIn: (ctx: Ctx, i: { serviceId: string; staffId: string | null; channel: "KIOSK" | "STAFF" | "REMOTE" }, opts?: { now?: Date }) => Promise<WalkInResult>;
  checkIn: (ctx: Ctx, by: { appointmentId: string }, opts: { via: "STAFF"; now?: Date }) => Promise<{ ok: true; asWalkIn: boolean; ticketId: string } | { ok: false; code: string; reason: string }>;
  startJob: (ctx: Ctx, id: string, opts?: { now?: Date }) => Promise<JobResult>;
  rescheduleByShop: (ctx: Ctx, id: string, to: { dateStr: string; startMin: number; staffId?: string }, opts?: { now?: Date }) => Promise<JobResult>;
};
type RunApi = { runPlanner: (ctx: { tenantId: string; unitId: string }, opts?: { now?: Date }) => Promise<{ ran: boolean; planned: number }> };
type SetRes = { ok: boolean; code?: string; issues?: unknown };
type SettingDefLite = { key: string; chain: readonly string[]; labelTh: string; defaults: Record<string, unknown>; schema: { safeParse: (v: unknown) => { success: boolean } }; group: string };
type SettingsApi = {
  setSettings: (actor: Actor, ctx: { tenantId: string }, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<SetRes>;
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<SetRes>;
  getDef: (key: string) => SettingDefLite | undefined;
  groupLabelTh: (domain: string, group: string) => string | undefined;
  resolveSettings: (ctx: { tenantId: string }, keys: string[], refs: Record<string, string>) => Promise<Record<string, { value: unknown }>>;
};

// ── ตัววางคิว (B.2 + ส่วนขยาย B.13 §3.1) ──
type PlanSettings = {
  queueOrder: "SINGLE_LINE" | "APPOINTMENT_FIRST"; backfill: boolean; safetyBeforeBookingMin: number; graceMin: number; noShowAfterMin: number;
  lateAction: "RELEASE" | "HOLD"; priorityEnabled: boolean; walkInMaxWaitMin: number; overrunExtendMin: number; minBreakMin: number; maxJobsPerDay: number | null;
};
type PlanStaff = { id: string; name: string; sortOrder: number; windows: { startAt: number; endAt: number }[]; services: { serviceId: string; durationMin?: number }[] | null; minBreakMin?: number; maxJobsPerDay?: number | null };
type PlanService = { id: string; name: string; durationMin: number; bufferAfterMin: number; resourceKinds?: string[] };
type PlanResource = { id: string; kind: string; name: string; sortOrder: number; capacity: number; cleanupMin: number; blocks: { startAt: number; endAt: number }[] };
type PlanJob = {
  id: string; label: string; kind: "BOOKED" | "WALKIN"; status: string; serviceId: string; durationMin?: number; assignMode: "SPECIFIC" | "ANY"; staffId: string | null;
  startAt: number | null; issuedAt: number; checkedInAt: number | null; startedAt: number | null; priority: boolean; resourceIds?: string[];
};
type PlanInput = { now: number; settings: PlanSettings; staff: PlanStaff[]; services: PlanService[]; jobs: PlanJob[]; resources?: PlanResource[] };
type PlannedJob = { jobId: string; kind: "BOOKED" | "WALKIN"; staffId: string | null; startAt: number | null; endAt: number | null; state: string; reason: string; resourceIds?: string[]; resourceShort?: boolean };
type Plan = { now: number; jobs: PlannedJob[]; line: string[] };
type Quote = { staffId: string | null; startAt: number | null; endAt: number | null; waitMin: number | null; closed: boolean; resourceIds?: string[]; limitedBy?: LimitedBy };
type PlannerApi = { planDay: (i: PlanInput) => Plan; quoteWalkIn: (i: PlanInput, r: { serviceId: string; staffId?: string | null }) => Quote };

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
const MIN = 60_000;
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const at = (ds: string, min: number): Date => new Date(bkkMs(ds, min));
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const HM = (ms: number | null | undefined): string => (ms == null ? "null" : new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");

// ═══════════════ โหลดโมดูล ═══════════════
const loadIf = async <T,>(rel: string, spec: string) => (existsSync(join(ROOT, rel)) ? tryImport<T>(spec) : { mod: null as T | null, err: `ยังไม่มีไฟล์ «${rel}»` });
const resLoad = await loadIf<ResApi>(F.res, "@/lib/modules/booking/resources");
const kindsLoad = await loadIf<KindsApi>(F.kinds, "@/lib/modules/booking/resource-kinds");
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const lineLoad = await tryImport<LineApi>("@/lib/modules/booking/queue-line");
const runLoad = await tryImport<RunApi>("@/lib/modules/booking/planner-run");
const plannerLoad = await tryImport<PlannerApi>("@/lib/modules/booking/planner");
const fnOf = <Fn,>(load: { mod: unknown; err: string }, name: string, rel: string): Fn => {
  const f = (load.mod as Record<string, unknown> | null)?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as Fn;
};
const RS = {
  list: () => fnOf<NonNullable<ResApi["listResources"]>>(resLoad, "listResources", F.res),
  create: () => fnOf<NonNullable<ResApi["createResource"]>>(resLoad, "createResource", F.res),
  update: () => fnOf<NonNullable<ResApi["updateResource"]>>(resLoad, "updateResource", F.res),
  maint: () => fnOf<NonNullable<ResApi["setResourceMaintenance"]>>(resLoad, "setResourceMaintenance", F.res),
  now: () => fnOf<NonNullable<ResApi["walkInNowByService"]>>(resLoad, "walkInNowByService", F.res),
};
const BK = (): BookingApi => { if (!bookingLoad.mod) throw new AssertFail(`โหลด booking/service ไม่ได้ (${bookingLoad.err})`); return bookingLoad.mod; };
const LN = (): LineApi => { if (!lineLoad.mod) throw new AssertFail(`โหลด queue-line ไม่ได้ (${lineLoad.err})`); return lineLoad.mod; };
const RN = (): RunApi => { if (!runLoad.mod) throw new AssertFail(`โหลด planner-run ไม่ได้ (${runLoad.err})`); return runLoad.mod; };
const PLN = (): PlannerApi => { if (!plannerLoad.mod) throw new AssertFail(`โหลด planner ไม่ได้ (${plannerLoad.err})`); return plannerLoad.mod; };

// ═══════════════ โหมดลูกโพรเซส (ยิงพร้อมกัน) ═══════════════
type CallSpec =
  | { fn: "book"; ctx: Ctx; input: BookInput }
  | { fn: "create"; input: CreateInput }
  | { fn: "walkIn"; ctx: Ctx; serviceId: string; now: string }
  | { fn: "checkIn"; ctx: Ctx; id: string; now: string }
  | { fn: "planLoop"; ctx: Ctx; now: string; times: number }
  | { fn: "resched"; ctx: Ctx; id: string; dateStr: string; startMin: number; now: string }
  | { fn: "resUpdate"; actor: Actor; ctx: Ctx; id: string; patch: ResPatch }
  | { fn: "resMaint"; actor: Actor; ctx: Ctx; id: string; windows: MaintWin[] };
type CallOut = { fn: CallSpec["fn"]; ok: boolean; code: string | null; id: string | null; threw: string | null };
type ChildSpec = { run: string; idx: number; scenarios: { key: string; calls: CallSpec[] }[] };
type Scenario = { key: string; perChild: CallSpec[][] };
const RUN = Date.now().toString(36);
const goFile = (run: string, key: string) => `/tmp/svc-b13-go-${run}-${key}`;
async function runCall(c: CallSpec): Promise<CallOut> {
  const o: CallOut = { fn: c.fn, ok: false, code: null, id: null, threw: null };
  try {
    if (c.fn === "book") { const r = await BK().bookAppointment(c.ctx, c.input); return r.ok ? { ...o, ok: true, id: r.id } : { ...o, code: r.code }; }
    if (c.fn === "create") { const r = await BK().createAppointment(c.input); return r.ok ? { ...o, ok: true, id: r.id } : { ...o, code: "LEGACY_FAIL" }; }
    if (c.fn === "walkIn") { const r = await LN().createWalkIn(c.ctx, { serviceId: c.serviceId, staffId: null, channel: "STAFF" }, { now: new Date(c.now) }); return r.ok ? { ...o, ok: true, id: r.appointmentId } : { ...o, code: r.code }; }
    if (c.fn === "checkIn") { const r = await LN().checkIn(c.ctx, { appointmentId: c.id }, { via: "STAFF", now: new Date(c.now) }); return r.ok ? { ...o, ok: true, id: c.id } : { ...o, id: c.id, code: r.code }; }
    if (c.fn === "planLoop") { for (let k = 0; k < c.times; k++) await RN().runPlanner(c.ctx, { now: new Date(c.now) }); return { ...o, ok: true }; }
    if (c.fn === "resched") { const r = await LN().rescheduleByShop(c.ctx, c.id, { dateStr: c.dateStr, startMin: c.startMin }, { now: new Date(c.now) }); return r.ok ? { ...o, ok: true, id: c.id } : { ...o, id: c.id, code: r.code }; }
    if (c.fn === "resUpdate") { const r = await RS.update()(c.actor, c.ctx, c.id, c.patch); return r.ok ? { ...o, ok: true, id: c.id } : { ...o, code: r.code }; }
    const r = await RS.maint()(c.actor, c.ctx, c.id, c.windows);
    return r.ok ? { ...o, ok: true, id: c.id } : { ...o, code: r.code };
  } catch (e) {
    return { ...o, threw: errMsg(e).slice(0, 160) };
  }
}
if (process.env.QC_B13_CHILD) {
  const spec = JSON.parse(process.env.QC_B13_CHILD) as ChildSpec;
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

// ═════════════════════════════════════════════════════════════════════════════
// ภาค 1 · PURE — ทะเบียนชนิด + ตัววางคิว (ไม่ต่อฐาน)
// ═════════════════════════════════════════════════════════════════════════════
const KINDS7 = ["CHAIR", "BED", "SOFA", "ROOM", "COUPLE_ROOM", "EQUIPMENT", "EXAM_ROOM"];
const THAI = /[฀-๿]/;
console.log("\n── T (pure): ทะเบียนชนิดทรัพยากร ──");
await st("T-1", `«${F.kinds}» pure: RESOURCE_KINDS = 7 ชนิด (${KINDS7.join(" ")}) · ป้ายไทยครบทุกชนิด · import ได้เฉพาะ type (ไม่มี prisma/next/@/lib)`, () => {
  ok(!!kindsLoad.mod, kindsLoad.err);
  eq([...(kindsLoad.mod!.RESOURCE_KINDS ?? [])], KINDS7, "RESOURCE_KINDS");
  const L = kindsLoad.mod!.RESOURCE_KIND_LABELS_TH ?? {};
  eq(Object.keys(L).sort(), [...KINDS7].sort(), "คีย์ป้าย");
  ok(KINDS7.every((k) => typeof L[k] === "string" && THAI.test(L[k])), `ป้ายไม่ใช่ไทย ${fmt(L)}`);
  ok(L.ROOM.includes("ห้อง") && L.BED.includes("เตียง"), `ป้าย ROOM/BED ${fmt(L)}`);
  const s = stripComments(src(F.kinds));
  ok(!/^\s*import\s+(?!type\b)/m.test(s), "มี import ค่า (ต้อง pure ไม่มี import หรือ import type เท่านั้น)");
}, "MAJOR");

// ── ตัวช่วยตัววางคิว ──
const DAY0 = Date.UTC(2026, 9, 31) - 7 * 60 * MIN; // ส. 31 ต.ค. 2569 00:00 ไทย (วันภาพ)
const T = (hm: string): number => { const [h, m] = hm.split(":").map(Number); return DAY0 + (h * 60 + m) * MIN; };
const SET0: PlanSettings = { queueOrder: "SINGLE_LINE", backfill: true, safetyBeforeBookingMin: 0, graceMin: 15, noShowAfterMin: 30, lateAction: "RELEASE", priorityEnabled: false, walkInMaxWaitMin: 600, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null };
const stf = (id: string, sortOrder: number, from = "10:00", to = "21:00"): PlanStaff => ({ id, name: `หมอ${id}`, sortOrder, windows: [{ startAt: T(from), endAt: T(to) }], services: null });
const sv = (id: string, durationMin: number, kinds?: string[], bufferAfterMin = 0): PlanService => ({ id, name: id, durationMin, bufferAfterMin, ...(kinds ? { resourceKinds: kinds } : {}) });
const rs = (id: string, kind: string, sortOrder: number, cleanupMin: number, capacity = 1, blocks: { startAt: number; endAt: number }[] = []): PlanResource => ({ id, kind, name: id, sortOrder, capacity, cleanupMin, blocks });
const booked = (id: string, serviceId: string, staffId: string, start: string, resourceIds?: string[], o: Partial<PlanJob> = {}): PlanJob => ({
  id, label: id, kind: "BOOKED", status: "CONFIRMED", serviceId, assignMode: "SPECIFIC", staffId, startAt: T(start), issuedAt: T("08:00"), checkedInAt: null, startedAt: null, priority: false,
  ...(resourceIds ? { resourceIds } : {}), ...o,
});
const inService = (id: string, serviceId: string, staffId: string, started: string, resourceIds: string[], o: Partial<PlanJob> = {}): PlanJob => ({
  id, label: id, kind: "BOOKED", status: "IN_SERVICE", serviceId, assignMode: "SPECIFIC", staffId, startAt: T(started), issuedAt: T("08:00"), checkedInAt: T(started), startedAt: T(started), priority: false, resourceIds, ...o,
});
const walk = (id: string, serviceId: string, issued: string, staffId: string | null = null): PlanJob => ({
  id, label: id, kind: "WALKIN", status: "QUEUED", serviceId, assignMode: staffId ? "SPECIFIC" : "ANY", staffId, startAt: null, issuedAt: T(issued), checkedInAt: T(issued), startedAt: null, priority: false,
});
const inp = (now: string, staff: PlanStaff[], services: PlanService[], jobs: PlanJob[], resources?: PlanResource[], settings: Partial<PlanSettings> = {}): PlanInput => ({
  now: T(now), settings: { ...SET0, ...settings }, staff, services, jobs, ...(resources ? { resources } : {}),
});
const pj = (p: Plan, id: string): PlannedJob => { const x = p.jobs.find((j) => j.jobId === id); if (!x) throw new AssertFail(`ไม่มี ${id} ในผล`); return x; };
const qv = (q: Quote) => ({ start: HM(q.startAt), staff: q.staffId, res: q.resourceIds ?? "(ไม่มี resourceIds)", limitedBy: q.limitedBy ?? "(ไม่มี limitedBy)", closed: q.closed });
const pv = (j: PlannedJob) => ({ start: HM(j.startAt), staff: j.staffId, res: j.resourceIds ?? "(ไม่มี resourceIds)", state: j.state, reason: j.reason });

console.log("\n── PL: ตัววางคิว pure + ทรัพยากร (ฉากภาพ 02 · 14:20) ──");
// ฉากภาพ 02 "น้ำมันอโรมา 90 → 17:45 ห้อง B": ห้อง A มีคุณนิด 14:30 + คุณจอย 17:00 · ห้อง B มีคุณอร 16:00 · เก็บห้อง 15
const OIL90 = sv("OIL90", 90, ["ROOM"]);
const RA = rs("rA", "ROOM", 1, 15), RB = rs("rB", "ROOM", 2, 15);
const scene02 = (withRes: boolean) => inp("14:20", [stf("S1", 1), stf("S2", 2), stf("S3", 3)], [withRes ? OIL90 : sv("OIL90", 90)],
  [booked("NID", "OIL90", "S2", "14:30", withRes ? ["rA"] : undefined), booked("JOY", "OIL90", "S2", "17:00", withRes ? ["rA"] : undefined), booked("ORN", "OIL90", "S3", "16:00", withRes ? ["rB"] : undefined)],
  withRes ? [RA, RB] : undefined);
await st("PL-0", "ตัวควบคุม (ต้องเขียวทั้งก่อน/หลังใบ): ฉากเดียวกันแต่ไม่มีทรัพยากร ⇒ quote น้ำมัน 90 = 14:20 หมอ S1 (เหมือน B.2)", () => {
  const q = PLN().quoteWalkIn(scene02(false), { serviceId: "OIL90" });
  eq([HM(q.startAt), q.staffId, q.closed], ["14:20", "S1", false], "quote");
});
await st("PL-1", "ภาพ 02: หมอว่างแต่ห้องน้ำมันไม่ว่าง ⇒ quote 17:45 ห้อง B · limitedBy RESOURCE (ห้อง A ช่อง 16:15–17:00 สั้นไป · ห้อง B ก่อน 16:00 ไม่พอ 90+15)", () => {
  const q = PLN().quoteWalkIn(scene02(true), { serviceId: "OIL90" });
  eq(qv(q), { start: "17:45", staff: "S1", res: ["rB"], limitedBy: "RESOURCE", closed: false }, "quote");
});
await st("PL-2", "หมอไม่ว่าง ห้องว่าง ⇒ limitedBy STAFF (หมอคนเดียวทำงานถึง 15:10)", () => {
  const i = inp("14:20", [stf("S1", 1)], [sv("THAI60", 60, ["BED"])], [inService("IS", "THAI60", "S1", "14:10", ["b1"])], [rs("b1", "BED", 1, 0), rs("b2", "BED", 2, 0)]);
  const q = PLN().quoteWalkIn(i, { serviceId: "THAI60" });
  eq([HM(q.startAt), q.limitedBy ?? null, q.resourceIds?.length ?? null], ["15:10", "STAFF", 1], "quote");
});
await st("PL-3", "ว่างทั้งคนและโซฟา ⇒ ได้ทันที limitedBy NONE + โซฟาตัวแรก (ภาพ 02 นวดเท้า 30)", () => {
  const i = inp("14:20", [stf("S1", 1)], [sv("FOOT30", 30, ["SOFA"])], [], [rs("so1", "SOFA", 1, 0), rs("so2", "SOFA", 2, 0)]);
  eq(qv(PLN().quoteWalkIn(i, { serviceId: "FOOT30" })), { start: "14:20", staff: "S1", res: ["so1"], limitedBy: "NONE", closed: false }, "quote");
});
await st("PL-4", "คนว่าง 15:00/15:15 · ห้องเดียวว่าง 15:30 ⇒ 15:30 limitedBy BOTH", () => {
  const i = inp("14:20", [stf("S1", 1), stf("S2", 2)], [sv("PLAIN60", 60), sv("OIL60", 60, ["ROOM"])],
    [inService("I1", "PLAIN60", "S1", "14:00", []), inService("I2", "OIL60", "S2", "14:00", ["rA"], { durationMin: 75 })], [RA]);
  eq(qv(PLN().quoteWalkIn(i, { serviceId: "OIL60" })), { start: "15:30", staff: "S1", res: ["rA"], limitedBy: "BOTH", closed: false }, "quote");
});
await st("PL-5", "ความจุ 2 (ห้องคู่ VIP เก็บ 20): walk-in 3 ใบ ⇒ W1 W2 14:20 ห้องเดียวกัน · W3 16:10 (90+20)", () => {
  const i = inp("14:20", [stf("S1", 1), stf("S2", 2), stf("S3", 3), stf("S4", 4)], [sv("CPL90", 90, ["COUPLE_ROOM"])],
    [walk("W1", "CPL90", "14:00"), walk("W2", "CPL90", "14:01"), walk("W3", "CPL90", "14:02")], [rs("vip", "COUPLE_ROOM", 1, 20, 2)]);
  const p = PLN().planDay(i);
  eq([pv(pj(p, "W1")).start, pv(pj(p, "W2")).start, pv(pj(p, "W3")).start], ["14:20", "14:20", "16:10"], "เวลา");
  eq([pj(p, "W1").resourceIds, pj(p, "W2").resourceIds, pj(p, "W3").resourceIds], [["vip"], ["vip"], ["vip"]], "ห้อง");
});
await st("PL-6", "เก็บห้อง 15 นาทีมีผล: ห้องเดียว 2 walk-in (หมอว่าง 2 คน) ⇒ W2 = 14:20+60+15 = 15:35", () => {
  const i = inp("14:20", [stf("S1", 1), stf("S2", 2)], [sv("OIL60", 60, ["ROOM"])], [walk("W1", "OIL60", "14:00"), walk("W2", "OIL60", "14:01")], [RA]);
  const p = PLN().planDay(i);
  eq([pv(pj(p, "W1")), pv(pj(p, "W2"))].map((x) => [x.start, x.res]), [["14:20", ["rA"]], ["15:35", ["rA"]]], "ผล");
});
await st("PL-7", "ปิดซ่อม: เตียง 1 ปิด 14:00–18:00 ⇒ walk-in ใช้เตียง 2 (14:20 · 15:20) ไม่แตะเตียง 1", () => {
  const i = inp("14:20", [stf("S1", 1), stf("S2", 2)], [sv("THAI60", 60, ["BED"])], [walk("W1", "THAI60", "14:00"), walk("W2", "THAI60", "14:01")],
    [rs("b1", "BED", 1, 0, 1, [{ startAt: T("14:00"), endAt: T("18:00") }]), rs("b2", "BED", 2, 0)]);
  const p = PLN().planDay(i);
  eq([pv(pj(p, "W1")), pv(pj(p, "W2"))].map((x) => [x.start, x.res]), [["14:20", ["b2"]], ["15:20", ["b2"]]], "ผล");
});
await st("PL-8", "หลายชนิด (หินร้อน = ห้อง + ชุดหินร้อน): ห้อง B ว่างแต่ชุดหินร้อนว่าง 15:10 ⇒ 15:10 [rB, eq] หมอ S1 (เสมอ ⇒ sortOrder) limitedBy RESOURCE · ลำดับ id ตามลำดับชนิดที่ประกาศ", () => {
  const HOT = sv("HOT60", 60, ["ROOM", "EQUIPMENT"]);
  const i = inp("14:20", [stf("S1", 1), stf("S2", 2)], [HOT], [inService("I1", "HOT60", "S1", "14:00", ["rA", "eq"])], [RA, RB, rs("eq", "EQUIPMENT", 3, 10)]);
  eq(qv(PLN().quoteWalkIn(i, { serviceId: "HOT60" })), { start: "15:10", staff: "S1", res: ["rB", "eq"], limitedBy: "RESOURCE", closed: false }, "quote");
});
await st("PL-9", "บริการต้องใช้ชนิดที่ไม่มีทรัพยากรเลย ⇒ walk-in UNPLACED/NO_RESOURCE · quote closed + limitedBy RESOURCE", () => {
  const i = inp("14:20", [stf("S1", 1)], [sv("EXAM30", 30, ["EXAM_ROOM"])], [walk("W1", "EXAM30", "14:00")], [RA]);
  const w = pj(PLN().planDay(i), "W1");
  eq([w.state, w.reason, w.startAt], ["UNPLACED", "NO_RESOURCE", null], "W1");
  const q = PLN().quoteWalkIn(i, { serviceId: "EXAM30" });
  eq([q.closed, q.startAt, q.limitedBy ?? null], [true, null, "RESOURCE"], "quote");
});
await st("PL-10", "นัดที่ยังไม่มี resourceIds ⇒ ตัววางคิวผูกให้ (ตามลำดับ) ก่อนวาง walk-in · walk-in ไม่ลงทับ (W1 = 15:45) · นัดที่ห้องเต็มแล้ว ⇒ resourceShort true (เวลาไม่ขยับ)", () => {
  const i = inp("14:20", [stf("S1", 1), stf("S2", 2), stf("S3", 3)], [sv("OIL60", 60, ["ROOM"])], [booked("B1", "OIL60", "S1", "14:30"), walk("W1", "OIL60", "14:00")], [RA]);
  const p = PLN().planDay(i);
  eq([pj(p, "B1").resourceIds, pj(p, "B1").resourceShort ?? null, HM(pj(p, "W1").startAt), pj(p, "W1").resourceIds], [["rA"], false, "15:45", ["rA"]], "B1/W1");
  const p2 = PLN().planDay({ ...i, jobs: [booked("B1", "OIL60", "S1", "14:30"), booked("B2", "OIL60", "S2", "14:45")] });
  eq([pj(p2, "B2").resourceShort ?? null, pj(p2, "B2").resourceIds, HM(pj(p2, "B2").startAt), pj(p2, "B2").state], [true, [], "14:45", "SCHEDULED"], "B2");
});
await st("PL-11", "งานกำลังทำเลยเวลา (ยืดถึง now+5 = 14:25) ยังถือห้อง + เก็บ 15 ⇒ walk-in ห้องเดียว = 14:40", () => {
  const i = inp("14:20", [stf("S1", 1), stf("S2", 2)], [sv("OIL60", 60, ["ROOM"])], [inService("I1", "OIL60", "S1", "13:00", ["rA"]), walk("W1", "OIL60", "14:00")], [RA]);
  eq(pv(pj(PLN().planDay(i), "W1")).start, "14:40", "W1");
});
await st("PL-12", "นัดที่ระบุห้องแล้วคงห้องเดิม (ไม่ย้ายไปห้องลำดับแรก) · walk-in ได้ห้อง A ทันที", () => {
  const i = inp("14:20", [stf("S1", 1), stf("S2", 2)], [sv("OIL60", 60, ["ROOM"])], [booked("B1", "OIL60", "S1", "15:00", ["rB"]), walk("W1", "OIL60", "14:00")], [RA, RB]);
  const p = PLN().planDay(i);
  eq([pj(p, "B1").resourceIds, pv(pj(p, "W1")).start, pj(p, "W1").resourceIds], [["rB"], "14:20", ["rA"]], "ผล");
});
await st("PL-13", "ไม่มีทรัพยากร (ไม่ส่ง resources) ⇒ ทุกงานได้ resourceIds [] + resourceShort false · quote limitedBy ∈ {NONE, STAFF}", () => {
  const p = PLN().planDay(scene02(false));
  ok(p.jobs.every((j) => isDeepStrictEqual(j.resourceIds, []) && j.resourceShort === false), `ผล ${fmt(p.jobs.map((j) => [j.jobId, j.resourceIds, j.resourceShort]))}`);
  const q = PLN().quoteWalkIn(inp("14:20", [stf("S1", 1, "15:00")], [sv("X", 30)], []), { serviceId: "X" });
  eq([HM(q.startAt), q.limitedBy ?? null], ["15:00", "STAFF"], "quote หมอเข้างาน 15:00");
}, "MAJOR");
await st("PL-14", "ความบริสุทธิ์: planner.ts + planner-*.ts import ได้เฉพาะ ./planner-* / @/lib/core/quiet-hours / import type · ไม่มี Date.now / new Date() / Math.random", () => {
  const dir = join(ROOT, "src/lib/modules/booking");
  const files = readdirSync(dir).filter((f) => /^planner(-[a-z0-9-]+)?\.ts$/.test(f) && f !== "planner-run.ts");
  const bad: string[] = [];
  for (const f of files) {
    const s = stripComments(readFileSync(join(dir, f), "utf8"));
    for (const m of s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)) if (!/^\.\/planner-[a-z0-9-]+$|^@\/lib\/core\/quiet-hours$/.test(m[1])) bad.push(`${f}: ${m[1]}`);
    if (/Date\.now\s*\(|new Date\(\s*\)|Math\.random/.test(s)) bad.push(`${f}: นาฬิกา/สุ่ม`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
});

// ── fuzz ──
type Rng = () => number;
const mulberry32 = (a: number): Rng => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <V,>(r: Rng, xs: readonly V[]): V => xs[Math.floor(r() * xs.length)];
const deepFreeze = <V,>(o: V): V => { if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v); } return o; };
type Occ = { s: number; e: number };
const overlaps = (a: Occ, b: Occ) => a.s < b.e && b.s < a.e;
/** ทรัพยากร r ว่างให้ช่วง x ไหม เมื่อมีช่วงที่ใช้แล้ว used (ไม่รวม cleanup ของ x — ผู้เรียกใส่เอง) */
const resFree = (r: PlanResource, used: Occ[], x: Occ): boolean => {
  if (r.blocks.some((b) => overlaps({ s: b.startAt, e: b.endAt }, x))) return false;
  // ความจุ: จำนวนที่ซ้อนพร้อมกันสูงสุดภายใน x (จุดสูงสุดเกิดที่ x.s หรือจุดเริ่มของช่วงที่ใช้แล้วภายใน x) ต้อง < capacity
  const pts = [x.s, ...used.map((u) => u.s).filter((t) => t > x.s && t < x.e)];
  return pts.every((t) => used.filter((u) => u.s <= t && u.e > t).length < r.capacity);
};
const KIND_SETS: (string[] | undefined)[] = [undefined, [], ["BED"], ["ROOM"], ["SOFA"], ["ROOM", "EQUIPMENT"], ["BED"], ["ROOM"]];
function genRes(r: Rng, o: { staffN: number; bookings: number; walkins: number; perKind?: [number, number]; dense?: boolean; now?: number; forceCount?: boolean; wideDay?: boolean }): PlanInput {
  const now = o.now ?? T("11:00");
  const minBreak = pick(r, [0, 0, 5, 10]);
  const staff: PlanStaff[] = Array.from({ length: o.staffN }, (_, k) => ({ id: `s${k}`, name: `s${k}`, sortOrder: ri(r, 1, 3), windows: [{ startAt: T("10:00"), endAt: o.wideDay ? T("23:30") : T(pick(r, ["19:00", "20:00", "21:00"])) }], services: null }));
  const services: PlanService[] = [30, 45, 60, 90].map((d, k) => ({ id: `v${k}`, name: `v${k}`, durationMin: d, bufferAfterMin: pick(r, [0, 0, 5, 10]), ...(() => { const ks = pick(r, KIND_SETS); return ks ? { resourceKinds: ks } : {}; })() }));
  services.push({ id: "vplain", name: "vplain", durationMin: 45, bufferAfterMin: 0 });
  const resources: PlanResource[] = [];
  for (const kind of ["BED", "ROOM", "SOFA", "EQUIPMENT"]) {
    const n = ri(r, o.perKind?.[0] ?? 0, o.perKind?.[1] ?? 3);
    for (let k = 0; k < n; k++) {
      const blocks = r() < 0.2 ? (() => { const s = T("10:00") + ri(r, 0, 40) * 15 * MIN; return [{ startAt: s, endAt: s + ri(r, 4, 12) * 15 * MIN }]; })() : [];
      resources.push({ id: `${kind.toLowerCase()}${k}`, kind, name: `${kind}${k}`, sortOrder: ri(r, 1, 4), capacity: r() < 0.15 ? ri(r, 2, 3) : 1, cleanupMin: pick(r, [0, 5, 10, 15]), blocks });
    }
  }
  const used = new Map<string, Occ[]>(resources.map((x) => [x.id, []]));
  const svcOf = (id: string) => services.find((s) => s.id === id)!;
  const pickRes = (svc: PlanService, s: number): string[] | null => {
    const out: string[] = [];
    for (const kind of svc.resourceKinds ?? []) {
      const c = resources.filter((x) => x.kind === kind && !out.includes(x.id)).find((x) => resFree(x, used.get(x.id)!, { s, e: s + svc.durationMin * MIN + x.cleanupMin * MIN }));
      if (!c) return null;
      out.push(c.id);
    }
    return out;
  };
  const jobs: PlanJob[] = [];
  let n = 0;
  for (let b = 0; b < o.bookings; b++) {
    const st = staff[b % staff.length];
    const prev = jobs.filter((j) => j.staffId === st.id && j.kind === "BOOKED");
    const last = prev[prev.length - 1];
    const lastSvc = last ? svcOf(last.serviceId) : null;
    const earliest = last ? last.startAt! + (last.durationMin ?? lastSvc!.durationMin) * MIN + Math.max(lastSvc!.bufferAfterMin, minBreak) * MIN : now + ri(r, 0, 4) * 15 * MIN;
    const s = earliest + (o.dense ? ri(r, 0, 1) * 5 : ri(r, 0, 6) * 10) * MIN;
    let svc = pick(r, services);
    if (s + svc.durationMin * MIN > st.windows[0].endAt) continue;
    let ids = pickRes(svc, s);
    if (!ids) { if (!o.forceCount) continue; svc = svcOf("vplain"); ids = []; }
    for (const id of ids) used.get(id)!.push({ s, e: s + svc.durationMin * MIN + resources.find((x) => x.id === id)!.cleanupMin * MIN });
    jobs.push({ id: `B${n++}`, label: "b", kind: "BOOKED", status: "CONFIRMED", serviceId: svc.id, assignMode: r() < 0.2 ? "ANY" : "SPECIFIC", staffId: st.id, startAt: s, issuedAt: now - 86_400_000, checkedInAt: null, startedAt: null, priority: false, ...(svc.resourceKinds?.length ? { resourceIds: ids } : {}) });
  }
  for (let w = 0; w < o.walkins; w++) {
    const req = r() < 0.2 ? pick(r, staff).id : null;
    jobs.push({ id: `W${n++}`, label: "w", kind: "WALKIN", status: "QUEUED", serviceId: pick(r, services).id, assignMode: req ? "SPECIFIC" : "ANY", staffId: req, startAt: null, issuedAt: now - ri(r, 0, 60) * MIN, checkedInAt: now - ri(r, 0, 60) * MIN, startedAt: null, priority: false });
  }
  for (let k = jobs.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [jobs[k], jobs[m]] = [jobs[m], jobs[k]]; }
  return { now, settings: { ...SET0, minBreakMin: minBreak, safetyBeforeBookingMin: pick(r, [0, 5, 10]), backfill: r() < 0.7 }, staff, services, jobs, resources };
}
const genStd = (r: Rng) => genRes(r, { staffN: ri(r, 1, 5), bookings: ri(r, 0, 25), walkins: ri(r, 0, 10) });
const kindsOf = (i: PlanInput, serviceId: string) => i.services.find((s) => s.id === serviceId)?.resourceKinds ?? [];
const resOf = (i: PlanInput, id: string) => (i.resources ?? []).find((x) => x.id === id);
const occOf = (i: PlanInput, p: Plan): Map<string, Occ[]> => {
  const m = new Map<string, Occ[]>();
  for (const j of p.jobs) {
    if (!(j.state === "SCHEDULED" || j.state === "IN_SERVICE") || j.startAt == null || j.endAt == null) continue;
    for (const id of j.resourceIds ?? []) { const r = resOf(i, id); if (!r) continue; m.set(id, [...(m.get(id) ?? []), { s: j.startAt, e: j.endAt + r.cleanupMin * MIN }]); }
  }
  return m;
};
const propRun = async (id: string, name: string, gen: (r: Rng) => PlanInput, check: (i: PlanInput, p: Plan, r: Rng) => string | null) => {
  await st(id, `${name} (${FUZZ_N} ชุด · seed คงที่)`, () => {
    for (let k = 0; k < FUZZ_N; k++) {
      const r = mulberry32(20261113 + k * 7919 + id.length * 31);
      const i = gen(r);
      const msg = check(i, PLN().planDay(i), r);
      if (msg) throw new AssertFail(`ชุดที่ ${k}: ${msg}`);
    }
  });
};
console.log("\n── FZ: fuzz ตัววางคิว + ทรัพยากร ──");
await propRun("FZ-1", "ไม่มีทรัพยากรใดเกินความจุ ณ จุดใด (รวมเวลาเก็บ) · ไม่มีงานทับช่วงปิดซ่อม · งานที่วางของบริการที่ประกาศชนิดต้องมี resourceIds (ไม่ผ่านแบบว่างเปล่า)", genStd, (i, p) => {
  for (const j of p.jobs) if ((j.state === "SCHEDULED" || j.state === "IN_SERVICE") && kindsOf(i, i.jobs.find((x) => x.id === j.jobId)!.serviceId).length && !Array.isArray(j.resourceIds)) return `${j.jobId} ไม่มี resourceIds — ตรวจความจุไม่ได้`;
  for (const [id, occ] of occOf(i, p)) {
    const r = resOf(i, id)!;
    for (const x of occ) { if (r.blocks.some((b) => overlaps({ s: b.startAt, e: b.endAt }, x))) return `${id} ${HM(x.s)}–${HM(x.e)} ทับปิดซ่อม`; if (occ.filter((u) => u.s <= x.s && u.e > x.s).length > r.capacity) return `${id} เกินความจุ ${r.capacity} ที่ ${HM(x.s)}`; }
  }
  return null;
});
await propRun("FZ-2", "ทุกงานที่วางได้ถือทรัพยากรครบ 1 ชิ้น/ชนิดตามลำดับที่ประกาศ (ชนิดตรง · id มีจริง) · นัดคง resourceIds เดิม · บริการไม่ประกาศชนิด ⇒ []", genStd, (i, p) => {
  for (const j of p.jobs) {
    if (j.state !== "SCHEDULED") continue;
    const job = i.jobs.find((x) => x.id === j.jobId)!;
    const ks = kindsOf(i, job.serviceId);
    if (!Array.isArray(j.resourceIds)) return `${j.jobId} ไม่มี resourceIds`;
    if (job.kind === "BOOKED" && job.resourceIds && !isDeepStrictEqual(j.resourceIds, job.resourceIds)) return `${j.jobId} นัดถูกย้ายห้อง ${fmt(job.resourceIds)}→${fmt(j.resourceIds)}`;
    if (j.resourceShort) return `${j.jobId} resourceShort ทั้งที่ตัวสร้างรับประกันห้อง`;
    if (j.resourceIds.length !== ks.length || j.resourceIds.some((id, k) => resOf(i, id)?.kind !== ks[k])) return `${j.jobId} ชนิด ${fmt(ks)} ได้ ${fmt(j.resourceIds)}`;
  }
  return null;
});
await propRun("FZ-3", "ไม่มีงานซ้อนบนหมอคนเดียว (สมบัติ P1 ของ B.2 ยังจริงเมื่อมีทรัพยากร)", genStd, (_i, p) => {
  const by = new Map<string, PlannedJob[]>();
  for (const j of p.jobs) if ((j.state === "SCHEDULED" || j.state === "IN_SERVICE") && j.staffId && j.reason !== "STAFF_UNAVAILABLE") by.set(j.staffId, [...(by.get(j.staffId) ?? []), j]);
  for (const [s, xs] of by) { xs.sort((a, b) => a.startAt! - b.startAt!); for (let k = 1; k < xs.length; k++) if (xs[k].startAt! < xs[k - 1].endAt!) return `หมอ ${s}: ${xs[k - 1].jobId} ซ้อน ${xs[k].jobId}`; }
  return null;
});
const stripKinds = (i: PlanInput): PlanInput => ({ ...i, services: i.services.map(({ resourceKinds: _k, ...s }) => { void _k; return s; }), jobs: i.jobs.map(({ resourceIds: _r, ...j }) => { void _r; return j; }) });
await propRun("FZ-4", "_fallback: มีทรัพยากรแต่ไม่มีบริการไหนประกาศชนิด ⇒ ผลเท่ากับไม่ส่ง resources เลยทุกไบต์ (B1 ไม่เปลี่ยน)", genStd, (i) => {
  const a = stripKinds(i);
  const { resources: _r, ...b } = a; void _r;
  return isDeepStrictEqual(PLN().planDay(a), PLN().planDay(b)) ? null : "ผลต่างเมื่อมี resources ที่ไม่มีใครใช้";
});
await propRun("FZ-5", "deterministic + ไม่ขึ้นกับลำดับ resources/blocks/jobs + ไม่แก้ input (deep-freeze)", genStd, (i, p, r) => {
  const sh = <V,>(xs: V[]) => { const c = [...xs]; for (let k = c.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [c[k], c[m]] = [c[m], c[k]]; } return c; };
  const p2 = PLN().planDay(deepFreeze(structuredClone({ ...i, jobs: sh(i.jobs), resources: sh(i.resources ?? []).map((x) => ({ ...x, blocks: sh(x.blocks) })) })));
  const norm = (x: Plan) => JSON.stringify({ line: x.line, jobs: [...x.jobs].sort((a, b) => a.jobId.localeCompare(b.jobId)) });
  return norm(p) === norm(p2) ? null : "ผลต่างเมื่อสลับลำดับ/freeze";
});
await propRun("FZ-6", "quoteWalkIn: เริ่ม ≥ now · ถือห้องว่างจริงตามแผน · limitedBy สอดคล้อง (ได้ทันที ⇒ NONE · หมอว่างทันทีแต่ไม่ได้ทันที ⇒ RESOURCE · หมอไม่ว่างทันที ⇒ STAFF/BOTH)", genStd, (i, p, r) => {
  const svc = pick(r, i.services);
  const q = PLN().quoteWalkIn(i, { serviceId: svc.id });
  if (q.limitedBy === undefined) return "ไม่มี limitedBy";
  if (q.startAt == null) return q.closed ? null : "startAt null แต่ไม่ closed";
  if (q.startAt < i.now) return `เริ่ม ${HM(q.startAt)} ก่อน now`;
  const ks = kindsOf(i, svc.id);
  if ((q.resourceIds ?? []).length !== ks.length) return `resourceIds ${fmt(q.resourceIds)} ไม่ครบชนิด ${fmt(ks)}`;
  const occ = occOf(i, p);
  for (const id of q.resourceIds ?? []) {
    const rr = resOf(i, id);
    if (!rr) return `ไม่มีทรัพยากร ${id}`;
    if (!resFree(rr, occ.get(id) ?? [], { s: q.startAt, e: q.startAt + svc.durationMin * MIN + rr.cleanupMin * MIN })) return `${id} ไม่ว่างที่ ${HM(q.startAt)}`;
  }
  // อ้างอิง "ไม่สนห้อง" = บริการโคลนเดียวกันแต่ไม่ประกาศชนิด (งานอื่นในแผนไม่เปลี่ยน)
  const qs = PLN().quoteWalkIn({ ...i, services: [...i.services, { ...svc, id: "__qs_clone", resourceKinds: [] }] }, { serviceId: "__qs_clone" });
  const want = q.startAt === i.now ? "NONE" : qs.startAt === i.now ? "RESOURCE" : null;
  if (want && q.limitedBy !== want) return `limitedBy ${q.limitedBy} ต้องเป็น ${want} (เริ่ม ${HM(q.startAt)} · ถ้าไม่สนห้อง ${HM(qs.startAt)})`;
  if (!want && !["STAFF", "BOTH"].includes(q.limitedBy)) return `limitedBy ${q.limitedBy} ทั้งที่หมอไม่ว่างทันที`;
  return null;
});
await st("PERF", "12 หมอ · นัดรวม ≥ 120 · walk-in 40 · ทรัพยากร 16 ชิ้น (4 ชนิด) ⇒ p95 < 50 ms (200 รอบหลังอุ่น 20 · เกณฑ์เดียวกับ B.2)", () => {
  const r = mulberry32(20261031);
  const inputs: PlanInput[] = [];
  for (let k = 0; k < 10; k++) inputs.push(genRes(r, { staffN: 12, bookings: 144, walkins: 40, perKind: [4, 4], dense: true, now: T("10:00") + k * 15 * MIN, forceCount: true, wideDay: true }));
  const minB = Math.min(...inputs.map((x) => x.jobs.filter((j) => j.kind === "BOOKED").length));
  const nRes = inputs[0].resources?.length ?? 0;
  const withKinds = inputs[0].jobs.filter((j) => (j.resourceIds ?? []).length > 0).length;
  for (let k = 0; k < 20; k++) PLN().planDay(inputs[k % inputs.length]);
  const ts: number[] = [];
  for (let k = 0; k < 200; k++) { const t0 = performance.now(); PLN().planDay(inputs[k % inputs.length]); ts.push(performance.now() - t0); }
  ts.sort((a, b) => a - b);
  const p95 = ts[Math.floor(ts.length * 0.95) - 1], p50 = ts[Math.floor(ts.length * 0.5)], worst = ts[ts.length - 1];
  console.log(`   ⏱  perf B.13: p50 ${p50.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms · สูงสุด ${worst.toFixed(2)} ms · นัดน้อยสุด ${minB} · นัดที่ถือห้อง ${withKinds} · ทรัพยากร ${nRes}`);
  ok(minB >= 120 && nRes === 16 && withKinds >= 20, `ชุดทดสอบไม่ถึงเกณฑ์ (นัด ${minB} · ทรัพยากร ${nRes} · นัดถือห้อง ${withKinds})`);
  ok(p95 < 50, `p95 ${p95.toFixed(2)} ms`);
}, "MAJOR");

// ═════════════════════════════════════════════════════════════════════════════
// ภาค 2 · ฐานข้อมูล
// ═════════════════════════════════════════════════════════════════════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <R extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<R>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb13_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const SLUG = "qc-svc-b13-";
const USER_MAIL = "qc-svc-b13-";
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
const D = { S1: dd(0), S2: dd(1), S3: dd(2), S4: dd(3), S8: dd(4), S5: dd(5), S9: dd(6), S10: dd(7), S11: dd(8), R: dd(9), W: dd(10), W3: dd(11), W4: dd(12), E: dd(13), X: dd(15) };
const TID = (k: string) => `svcb13_${k}_${RUN}`;
const ids = {
  tA: TID("tA"), tB: TID("tB"), owner: TID("owner"), clerk: TID("clerk"),
  uS: TID("uS"), uW: TID("uW"), uF: TID("uF"), uF2: TID("uF2"), uF3: TID("uF3"), uC: TID("uC"), uA2: TID("uA2"), uB: TID("uB"),
  uX0: TID("uX0"), uX1: TID("uX1"), uX2: TID("uX2"), uX3: TID("uX3"), uX4: TID("uX4"), uX5: TID("uX5"), uX6: TID("uX6"), uX7: TID("uX7"),
  // uS
  OIL: TID("OIL"), THAI: TID("THAI"), HOT: TID("HOT"), PLAIN: TID("PLAIN"), CPL: TID("CPL"),
  rA: TID("rA"), rB: TID("rB"), bed1: TID("bed1"), bed2: TID("bed2"), eq: TID("eq"), vip: TID("vip"),
  // uW
  w1: TID("w1"), WTHAI: TID("WTHAI"), WPLAIN: TID("WPLAIN"), wbed1: TID("wbed1"), wbed2: TID("wbed2"),
  // E
  FPLAIN: TID("FPLAIN"), F2PLAIN: TID("F2PLAIN"), F3CUT: TID("F3CUT"), fR: TID("fR"), ch1: TID("ch1"), ch2: TID("ch2"),
  // อื่น
  rA2: TID("rA2"), rBx: TID("rBx"), A2SVC: TID("A2SVC"), BSVC: TID("BSVC"),
};
const sS = Array.from({ length: 6 }, (_, i) => TID(`s${i + 1}`));
const fS = [TID("f1"), TID("f2")], f2S = [TID("g1"), TID("g2")], f3S = [TID("h1"), TID("h2"), TID("h3")];
const XU = [ids.uX0, ids.uX1, ids.uX2, ids.uX3, ids.uX4, ids.uX5, ids.uX6, ids.uX7];
const xStaff = (u: string) => Array.from({ length: 10 }, (_, i) => `${u}_s${i + 1}`);
const xSvc = (u: string, k: "OIL" | "PLAIN") => `${u}_${k}`;
const xRes = (u: string, k: number) => `${u}_r${k}`;
const SLUGS: Record<string, string> = {};
const cS: Ctx = { tenantId: ids.tA, unitId: ids.uS };
const cW: Ctx = { tenantId: ids.tA, unitId: ids.uW };
const cF: Ctx = { tenantId: ids.tA, unitId: ids.uF };
const cF2: Ctx = { tenantId: ids.tA, unitId: ids.uF2 };
const cF3: Ctx = { tenantId: ids.tA, unitId: ids.uF3 };
const cC: Ctx = { tenantId: ids.tA, unitId: ids.uC };
const cA2: Ctx = { tenantId: ids.tA, unitId: ids.uA2 };
const cB: Ctx = { tenantId: ids.tB, unitId: ids.uB };
const cX = (u: string): Ctx => ({ tenantId: ids.tA, unitId: u });
const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
const OWNER_B: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
const CLERK: Actor = { role: "STAFF", unitAccess: ["*"], permissions: { "booking.checkin": true }, userId: ids.clerk };
let phoneN = 0;
const newPhone = () => `08${String(70_000_000 + ++phoneN).slice(-8)}`;
const bk = (o: Partial<BookInput> & { serviceId: string; staffId: string | null; dateStr: string; startMin: number }): BookInput =>
  ({ channel: "STAFF", customerName: "ลูกค้า QC B13", customerPhone: newPhone(), idempotencyKey: rid("idem"), ...o });
const book = async (ctx: Ctx, serviceId: string, staffId: string | null, ds: string, min: number, channel: BookingChannel = "STAFF") => BK().bookAppointment(ctx, bk({ serviceId, staffId, dateStr: ds, startMin: min, channel }));
const bookOk = async (ctx: Ctx, serviceId: string, staffId: string | null, ds: string, min: number, what: string, channel: BookingChannel = "STAFF"): Promise<string> => {
  const r = await book(ctx, serviceId, staffId, ds, min, channel);
  if (!r.ok) throw new AssertFail(`${what}: จอง ${ds} ${hhmm(min)} ล้ม ${r.code} ${r.reason}`);
  return r.id;
};
const codeOf = (r: { ok: boolean; code?: string }) => (r.ok ? "OK" : r.code ?? "FAIL");
type ApRow = { id: string; status: string; staffId: string; serviceId: string; startAt: Date; endAt: Date; resourceId: string | null; plannedStartAt: Date | null; startedAt: Date | null; policySnapshot: { job?: { durationMin?: number; bufferMin?: number; resourceIds?: unknown } } | null };
const AP_SQL = `SELECT id, status::text AS status, "staffId", "serviceId", "startAt", "endAt", "resourceId", "plannedStartAt", "startedAt", "policySnapshot" FROM "Appointment"`;
const apRow = async (id: string): Promise<ApRow> => { const [r] = await q<ApRow>(`${AP_SQL} WHERE id = $1`, [id]); if (!r) throw new AssertFail(`ไม่พบนัด ${id}`); return r; };
const resIdsOf = (a: ApRow): string[] => {
  const j = a.policySnapshot?.job?.resourceIds;
  if (Array.isArray(j) && j.every((x) => typeof x === "string")) return j as string[];
  return a.resourceId ? [a.resourceId] : [];
};
/** ตัวตรวจในฐาน (ใบสั่ง §4.6): แถวถือช่อง (ไม่ใช่ CANCELLED/NO_SHOW/DONE) ของหน่วย ⇒ ช่วงที่ถือทรัพยากร = [startAt, ปลายบริการ + cleanup ของทรัพยากร)
 *  ปลายบริการ = startAt + นาทีบริการ (snapshot job.durationMin ?? endAt−startAt−buffer) · ARRIVED ยืดตาม plannedStartAt · IN_SERVICE ยืดตาม startedAt (J5)
 *  คืนรายการละเมิด: เกินความจุ · ทับช่วงปิดซ่อม (ถ้าส่ง maint มา) · แถวบริการที่ประกาศชนิดแต่ถือไม่ครบ (ถ้าส่ง needKinds) */
async function resViolations(unitId: string, opts: { maint?: Map<string, Occ[]>; needKinds?: Map<string, string[]> } = {}): Promise<string[]> {
  const res = await q<{ id: string; capacity: number; cleanupMin: number; kind: string }>(`SELECT id, capacity, "cleanupMin", kind FROM "SvcResource" WHERE "unitId" = $1`, [unitId]);
  const rows = await q<ApRow & { bufferMin: number; status: string }>(`SELECT a.id, a.status::text AS status, a."staffId", a."serviceId", a."startAt", a."endAt", a."resourceId", a."plannedStartAt", a."startedAt", a."policySnapshot", s."bufferMin"
    FROM "Appointment" a JOIN "BookingService" s ON s.id = a."serviceId" WHERE a."unitId" = $1 AND a.status::text NOT IN ('CANCELLED','NO_SHOW','DONE')`, [unitId]);
  const occ = new Map<string, Occ[]>(res.map((r) => [r.id, []]));
  const bad: string[] = [];
  for (const a of rows) {
    // ORACLE-EDIT (ผู้คุม 31 ต.ค. · b13-Q1) — §4.6 ตามมติ Q1/Q2: ช่วงถือนับจากแผนของตัววางคิว (นิยามเดียวกันทั้งตัววางคิวและฐาน)
    //   เริ่ม = IN_SERVICE: startedAt · อื่น: plannedStartAt ?? startAt · ปลาย = เริ่ม + นาที (ไม่ยืดถึง now) ·
    //   แถวที่เข้าแถวใหม่ (มาสาย/ถูกข้าม) ไม่ผูกห้องเดิม — ถือชิ้นที่ตัววางคิวเขียนลงฐานตามช่วงแผน
    const s0 = a.startAt.getTime();
    const durMs = typeof a.policySnapshot?.job?.durationMin === "number" ? a.policySnapshot.job.durationMin * MIN : a.endAt.getTime() - s0 - (a.policySnapshot?.job?.bufferMin ?? a.bufferMin) * MIN;
    const s = a.status === "IN_SERVICE" ? (a.startedAt ?? a.plannedStartAt ?? a.startAt).getTime() : (a.plannedStartAt ?? a.startAt).getTime();
    const end = s + durMs;
    const rids = resIdsOf(a);
    const need = opts.needKinds?.get(a.serviceId);
    if (need && need.length && (rids.length !== need.length || rids.some((id, k) => res.find((x) => x.id === id)?.kind !== need[k]))) bad.push(`${a.id.slice(-6)} ถือ ${fmt(rids)} ไม่ตรงชนิด ${fmt(need)}`);
    for (const id of rids) {
      const r = res.find((x) => x.id === id);
      if (!r) { bad.push(`${a.id.slice(-6)} ถือทรัพยากรที่ไม่ใช่ของหน่วย ${id}`); continue; }
      occ.get(id)!.push({ s, e: end + r.cleanupMin * MIN });
    }
  }
  for (const r of res) {
    const xs = occ.get(r.id)!;
    for (const x of xs) {
      const n = xs.filter((u) => u.s <= x.s && u.e > x.s).length;
      if (n > r.capacity) { bad.push(`${r.id.slice(-8)} ซ้อน ${n} > ความจุ ${r.capacity} ที่ ${HM(x.s)}`); break; }
      const mw = opts.maint?.get(r.id) ?? [];
      if (mw.some((m) => overlaps(m, x))) { bad.push(`${r.id.slice(-8)} ใช้ช่วงปิดซ่อม ${HM(x.s)}`); break; }
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
const setS = async (tenantId: string, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => {
  const r = await SETTINGS().setSettings(OWNER, { tenantId }, changes);
  ok(r.ok, `setSettings ${fmt(changes.map((c) => `${c.key}@${c.scope}`))}: ${r.code} ${fmt(r.issues)}`);
};
const KEY_KINDS = "booking.service.resourceKinds";
let kindsViaEngine = false;
/** ประกาศชนิดของบริการ — ทางเครื่องยนต์ค่าตั้ง · ถ้าคีย์ยังไม่ลงทะเบียน (ก่อนใบ) ⇒ เขียน SettingValue ดิบให้ฉากเดินต่อ (โค้ดเดิมไม่อ่านคีย์นี้ ⇒ ข้อ S/W/X แดงด้วยเหตุ "ไม่สนทรัพยากร") — T-0/T-3 แดงแยก */
const setKinds = async (tenantId: string, rows: [string, string[]][]) => {
  const r = await SETTINGS().setSettings(OWNER, { tenantId }, rows.map(([sid, k]) => ({ key: KEY_KINDS, scope: "SERVICE", scopeId: sid, value: k })));
  if (r.ok) { kindsViaEngine = true; return; }
  for (const [sid, k] of rows) await insertRow("SettingValue", { id: rid("sv"), tenantId, key: KEY_KINDS, scope: "SERVICE", scopeId: sid, value: JSON.stringify(k), updatedAt: new Date() });
};
const okRes = (r: ResResult, what: string): ResourceRow => { if (!r.ok) throw new AssertFail(`${what}: ล้ม ${r.code} ${r.reason}`); return r.resource; };
const failRes = (r: ResResult, code: ResFail, what: string): string => { if (r.ok) throw new AssertFail(`${what}: ต้องล้ม ${code} แต่สำเร็จ`); eq(r.code, code, what); return r.reason; };
const winDay = (ds: string, a: number, b: number): MaintWin => ({ startAt: at(ds, a).toISOString(), endAt: at(ds, b).toISOString(), note: "ปิดซ่อม QC" });

const goFiles: string[] = [];
let setupOk = false;
let tplOk = false;
const need = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");
const needTpl = () => { need(); ok(tplOk, "ตั้งแม่แบบ/ค่าตั้งไม่สำเร็จ (T-3)"); };
const ALL_TENANTS = [ids.tA, ids.tB];
console.log(`\n(วันนี้ไทย ${TODAY} · วันทดสอบ ${D.S1} … ${D.X})`);

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();

  // ── สร้างข้อมูล ──
  try {
    for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) { SLUGS[id] = `${SLUG}${n}-${RUN}`; await insertRow("Tenant", { id, name: `QC B13 ร้าน ${n}`, slug: SLUGS[id], updatedAt: new Date() }); }
    const units: [string, string, string][] = [
      [ids.uS, ids.tA, "s"], [ids.uW, ids.tA, "w"], [ids.uF, ids.tA, "f"], [ids.uF2, ids.tA, "f2"], [ids.uF3, ids.tA, "f3"], [ids.uC, ids.tA, "c"], [ids.uA2, ids.tA, "a2"], [ids.uB, ids.tB, "b"],
      ...XU.map((u, i) => [u, ids.tA, `x${i}`] as [string, string, string]),
    ];
    for (const [id, t, n] of units) {
      SLUGS[id] = `b13-${n}-${RUN}`;
      await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `สาขา ${n}`, slug: SLUGS[id], updatedAt: new Date() });
      for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: new Date() });
    }
    const svc = (id: string, t: string, u: string, name: string, durationMin: number, bufferMin = 0) =>
      insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin, priceSatang: 50000, bufferMin, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    let ord = 0;
    const staff = (id: string, t: string, u: string, name: string, sortOrder: number) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    const res = (id: string, t: string, u: string, name: string, kind: string, sortOrder: number, cleanupMin: number, capacity = 1) =>
      insertRow("SvcResource", { id, tenantId: t, unitId: u, kind, name, capacity, cleanupMin, active: true, sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    // uS — ร้านนวดหลัก
    await svc(ids.OIL, ids.tA, ids.uS, "น้ำมัน 60", 60); await svc(ids.THAI, ids.tA, ids.uS, "นวดไทย 60", 60); await svc(ids.HOT, ids.tA, ids.uS, "หินร้อน 60", 60);
    await svc(ids.PLAIN, ids.tA, ids.uS, "นวดคอบ่าไหล่ 60 (ไม่ใช้ห้อง)", 60); await svc(ids.CPL, ids.tA, ids.uS, "คู่รัก 60", 60);
    for (const [i, id] of sS.entries()) await staff(id, ids.tA, ids.uS, `หมอ ${i + 1}`, i + 1);
    await res(ids.rA, ids.tA, ids.uS, "ห้องน้ำมัน A", "ROOM", 1, 15); await res(ids.rB, ids.tA, ids.uS, "ห้องน้ำมัน B", "ROOM", 2, 15);
    await res(ids.bed1, ids.tA, ids.uS, "เตียง 1", "BED", 3, 5); await res(ids.bed2, ids.tA, ids.uS, "เตียง 2", "BED", 4, 5);
    await res(ids.eq, ids.tA, ids.uS, "ชุดหินร้อน", "EQUIPMENT", 5, 10); await res(ids.vip, ids.tA, ids.uS, "ห้องคู่ VIP", "COUPLE_ROOM", 6, 20, 2);
    // uW — หมอคนเดียว
    await staff(ids.w1, ids.tA, ids.uW, "หมอเดี่ยว", 1);
    await svc(ids.WTHAI, ids.tA, ids.uW, "นวดไทย W", 60); await svc(ids.WPLAIN, ids.tA, ids.uW, "นวดคอ W", 60);
    await res(ids.wbed1, ids.tA, ids.uW, "เตียง W1", "BED", 1, 0); await res(ids.wbed2, ids.tA, ids.uW, "เตียง W2", "BED", 2, 0);
    // E — ร้านเดิม (_fallback) มี/ไม่มีทรัพยากร · ร้านตัดผมแม่แบบ BARBER มีเก้าอี้
    for (const [i, id] of fS.entries()) await staff(id, ids.tA, ids.uF, `ช่างเอฟ ${i + 1}`, i + 1);
    for (const [i, id] of f2S.entries()) await staff(id, ids.tA, ids.uF2, `ช่างจี ${i + 1}`, i + 1);
    for (const [i, id] of f3S.entries()) await staff(id, ids.tA, ids.uF3, `ช่างเอช ${i + 1}`, i + 1);
    await svc(ids.FPLAIN, ids.tA, ids.uF, "ตัดผม F", 45); await svc(ids.F2PLAIN, ids.tA, ids.uF2, "ตัดผม F", 45); await svc(ids.F3CUT, ids.tA, ids.uF3, "ตัดผม H", 45);
    await res(ids.fR, ids.tA, ids.uF, "ห้องเก่า", "ROOM", 1, 15);
    await res(ids.ch1, ids.tA, ids.uF3, "เก้าอี้ 1", "CHAIR", 1, 0); await res(ids.ch2, ids.tA, ids.uF3, "เก้าอี้ 2", "CHAIR", 2, 0);
    // X1 — หน่วยอื่นร้านเดียวกัน · ร้านอื่น
    await svc(ids.A2SVC, ids.tA, ids.uA2, "บริการ A2", 60); await res(ids.rA2, ids.tA, ids.uA2, "ห้อง A2", "ROOM", 1, 0);
    await svc(ids.BSVC, ids.tB, ids.uB, "บริการ B", 60); await res(ids.rBx, ids.tB, ids.uB, "ห้องร้าน B", "ROOM", 1, 0);
    // X — หน่วยแข่ง (10 หมอ · บริการน้ำมัน 60 + ธรรมดา 60 · ห้อง)
    for (const u of XU) {
      for (const [i, id] of xStaff(u).entries()) await staff(id, ids.tA, u, `หมอแข่ง ${i + 1}`, i + 1);
      await svc(xSvc(u, "OIL"), ids.tA, u, "น้ำมันแข่ง 60", 60); await svc(xSvc(u, "PLAIN"), ids.tA, u, "ธรรมดาแข่ง 60", 60);
    }
    await res(xRes(ids.uX1, 1), ids.tA, ids.uX1, "ห้องเดียว", "ROOM", 1, 15);
    await res(xRes(ids.uX2, 1), ids.tA, ids.uX2, "ห้องจุ 3", "ROOM", 1, 15, 3);
    await res(xRes(ids.uX3, 1), ids.tA, ids.uX3, "ห้อง X3-A", "ROOM", 1, 15); await res(xRes(ids.uX3, 2), ids.tA, ids.uX3, "ห้อง X3-B", "ROOM", 2, 15);
    await res(xRes(ids.uX4, 1), ids.tA, ids.uX4, "ห้องเดียว", "ROOM", 1, 15);
    await res(xRes(ids.uX5, 1), ids.tA, ids.uX5, "ห้องจุ 2", "ROOM", 1, 15, 2);
    await res(xRes(ids.uX6, 1), ids.tA, ids.uX6, "ห้องเดียว", "ROOM", 1, 15);
    await res(xRes(ids.uX7, 1), ids.tA, ids.uX7, "ห้องเดียว", "ROOM", 1, 15);
    await insertRow("User", { id: ids.owner, email: `${USER_MAIL}owner-${RUN}@qc.invalid`, name: "QC B13 owner", updatedAt: new Date() });
    await insertRow("User", { id: ids.clerk, email: `${USER_MAIL}clerk-${RUN}@qc.invalid`, name: "QC B13 clerk", updatedAt: new Date() });
    for (const t of ALL_TENANTS) await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mb"), userId: ids.clerk, tenantId: ids.tA, role: "STAFF", unitAccess: JSON.stringify(["*"]), permissions: JSON.stringify({ "booking.checkin": true }), acceptedAt: new Date(), updatedAt: new Date() });
    setupOk = true;
  } catch (e) { console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`); }

  // ═══════════════ T ทะเบียน + แม่แบบ ═══════════════
  console.log("\n── T: ทะเบียนค่าตั้ง + ชั้น RESOURCE + แม่แบบ ──");
  await st("T-0", `ค่าตั้ง «${KEY_KINDS}»: ชั้น SERVICE · ป้ายไทย · ค่าเริ่ม [] ทุกแม่แบบ + _fallback · รับ ["ROOM","EQUIPMENT"] · ปฏิเสธชนิดแปลก/ซ้ำ/เกิน 3 · ตัวเลือกตรง RESOURCE_KINDS`, () => {
    const d = SETTINGS().getDef(KEY_KINDS);
    ok(!!d, `ยังไม่ลงทะเบียน ${KEY_KINDS}`);
    ok(d!.chain.includes("SERVICE") && !d!.chain.includes("TENANT"), `chain ${fmt(d!.chain)}`);
    ok(THAI.test(d!.labelTh), `labelTh ${d!.labelTh}`);
    for (const k of ["BARBER", "SPA", "CLINIC", "_fallback"]) eq(d!.defaults[k], [], `ค่าเริ่ม ${k}`);
    ok(d!.schema.safeParse(["ROOM", "EQUIPMENT"]).success && d!.schema.safeParse([]).success, "รับค่าถูกไม่ได้");
    for (const bad of [["XYZ"], ["ROOM", "ROOM"], ["BED", "ROOM", "SOFA", "EQUIPMENT"], "ROOM"]) ok(!d!.schema.safeParse(bad).success, `รับ ${fmt(bad)}`);
    for (const k of KINDS7) ok(d!.schema.safeParse([k]).success, `ไม่รับ ${k}`);
  });
  await st("T-2", "ชั้น RESOURCE ในเครื่องยนต์ค่าตั้ง (core-fix): setSettings booking.service.cleanupMin ชั้น RESOURCE ของทรัพยากรตัวเอง ⇒ ok · ของร้านอื่น ⇒ NOT_FOUND · ของหน่วยอื่นร้านเดียวกัน (actor เข้าได้) ⇒ ok", async () => {
    need();
    const a = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key: "booking.service.cleanupMin", scope: "RESOURCE", scopeId: ids.bed2, value: 5 }]);
    ok(a.ok, `ทรัพยากรตัวเอง: ${a.code} ${fmt(a.issues)}`);
    const b = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key: "booking.service.cleanupMin", scope: "RESOURCE", scopeId: ids.rBx, value: 5 }]);
    eq([b.ok, b.code], [false, "NOT_FOUND"], "ทรัพยากรร้านอื่น");
    const v = await SETTINGS().resolveSettings({ tenantId: ids.tA }, ["booking.service.cleanupMin"], { unitId: ids.uS, resourceId: ids.bed2 });
    eq(v["booking.service.cleanupMin"]?.value, 5, "resolve ชั้น RESOURCE");
  });
  await st("T-3", "แม่แบบ SPA (หน่วยนวด/แข่ง/CRUD) + BARBER (uF3) · ทับชั้นสาขาของร้านทดสอบ: พักขั้นต่ำ 0 · เผื่อ 0 · งาน/วันไม่จำกัด · ปิดรับ walk-in เมื่อรอ > 600 · ประกาศชนิดของบริการผ่านเครื่องยนต์", async () => {
    need();
    const spa = [ids.uS, ids.uW, ids.uC, ids.uA2, ...XU];
    for (const u of spa) {
      const a = await SETTINGS().applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: u, domain: "booking", templateKey: "SPA", overwrite: "RESET_ALL" });
      ok(a.ok, `applyTemplate SPA ${u}: ${a.code} ${fmt(a.issues)}`);
    }
    const b = await SETTINGS().applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: ids.uF3, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    ok(b.ok, `applyTemplate BARBER: ${b.code}`);
    await setS(ids.tA, spa.flatMap((u) => [
      { key: "booking.staff.minBreakMin", scope: "UNIT", scopeId: u, value: 0 },
      { key: "booking.queue.safetyMin", scope: "UNIT", scopeId: u, value: 0 },
      { key: "booking.staff.maxJobsPerDay", scope: "UNIT", scopeId: u, value: null },
      { key: "booking.queue.walkInCloseWaitMin", scope: "UNIT", scopeId: u, value: 600 },
    ]));
    await setKinds(ids.tA, [[ids.OIL, ["ROOM"]], [ids.THAI, ["BED"]], [ids.HOT, ["ROOM", "EQUIPMENT"]], [ids.CPL, ["COUPLE_ROOM"]], [ids.WTHAI, ["BED"]], [ids.A2SVC, ["ROOM"]],
      ...XU.map((u) => [xSvc(u, "OIL"), ["ROOM"]] as [string, string[]])]);
    tplOk = true;
    ok(kindsViaEngine, `ประกาศชนิดผ่าน setSettings ไม่ได้ (คีย์ ${KEY_KINDS} ยังไม่ลงทะเบียน) — เขียนแถวดิบแทนเพื่อให้ฉากเดินต่อ`);
  });
  const needKinds = new Map<string, string[]>([[ids.OIL, ["ROOM"]], [ids.THAI, ["BED"]], [ids.HOT, ["ROOM", "EQUIPMENT"]], [ids.CPL, ["COUPLE_ROOM"]]]);

  // ═══════════════ R CRUD ═══════════════
  console.log("\n── R: CRUD ทรัพยากร (resources.ts) ──");
  let rC1 = "";
  await st("R-1", "createResource (เตียง · ความจุ 1 · เก็บ 5) ⇒ แถวในฐาน + listResources ของหน่วยเรียง sortOrder มี maintenance [] · underMaintenanceNow false", async () => {
    needTpl();
    const r = okRes(await RS.create()(OWNER, cC, { kind: "BED", name: "เตียงทดสอบ 1", capacity: 1, cleanupMin: 5, sortOrder: 2 }), "สร้าง");
    rC1 = r.id;
    okRes(await RS.create()(OWNER, cC, { kind: "ROOM", name: "ห้องทดสอบ", capacity: 2, cleanupMin: 15, sortOrder: 1 }), "สร้างห้อง");
    const [row] = await q<{ kind: string; capacity: number; cleanupMin: number; active: boolean; tenantId: string; unitId: string }>(`SELECT kind, capacity, "cleanupMin", active, "tenantId", "unitId" FROM "SvcResource" WHERE id = $1`, [r.id]);
    eq(row, { kind: "BED", capacity: 1, cleanupMin: 5, active: true, tenantId: ids.tA, unitId: ids.uC }, "แถว");
    const L = await RS.list()(cC);
    eq(L.map((x) => x.name), ["ห้องทดสอบ", "เตียงทดสอบ 1"], "list เรียง sortOrder");
    eq([L[1].maintenance, L[1].underMaintenanceNow], [[], false], "ปิดซ่อม");
  });
  await st("R-2", "BAD_INPUT (ชนิดแปลก · ชื่อว่าง/ยาว > 60 · ความจุ 0/21/1.5 · เก็บ −1/241) · DUPLICATE ชื่อซ้ำในหน่วย (ไม่ throw) · ชื่อเดียวกันอีกหน่วย ⇒ ok", async () => {
    needTpl();
    const bads: ResInput[] = [{ kind: "XYZ", name: "x1" }, { kind: "BED", name: "   " }, { kind: "BED", name: "ก".repeat(61) }, { kind: "BED", name: "x2", capacity: 0 },
      { kind: "BED", name: "x3", capacity: 21 }, { kind: "BED", name: "x4", capacity: 1.5 }, { kind: "BED", name: "x5", cleanupMin: -1 }, { kind: "BED", name: "x6", cleanupMin: 241 }];
    for (const b of bads) failRes(await RS.create()(OWNER, cC, b), "BAD_INPUT", `สร้าง ${fmt(b)}`);
    failRes(await RS.create()(OWNER, cC, { kind: "BED", name: "เตียงทดสอบ 1" }), "DUPLICATE", "ชื่อซ้ำ");
    okRes(await RS.create()(OWNER, cA2, { kind: "BED", name: "เตียงทดสอบ 1" }), "ชื่อเดียวกันหน่วยอื่น");
  });
  await st("R-3", "X1: update/setMaintenance ทรัพยากรร้านอื่น · หน่วยอื่นร้านเดียวกัน (ctx คนละหน่วย) · id ที่ไม่มี ⇒ NOT_FOUND ข้อความเดียวกันทุกกรณี · แถวไม่เปลี่ยน · listResources ไม่หลุดข้ามหน่วย/ร้าน", async () => {
    needTpl();
    const reasons = [
      failRes(await RS.update()(OWNER_B, cC, ids.rBx, { name: "ขโมย" }), "NOT_FOUND", "ร้านอื่น"),
      failRes(await RS.update()(OWNER, cC, ids.rA2, { name: "ขโมย" }), "NOT_FOUND", "หน่วยอื่น"),
      failRes(await RS.update()(OWNER, cC, "svcb13_nope", { name: "ขโมย" }), "NOT_FOUND", "ไม่มี"),
      failRes(await RS.maint()(OWNER, cC, ids.rBx, [winDay(D.R, 600, 700)]), "NOT_FOUND", "ปิดซ่อมร้านอื่น"),
    ];
    eq(new Set(reasons).size, 1, `ข้อความ NOT_FOUND ต่างกัน ${fmt(reasons)}`);
    eq((await q<{ name: string }>(`SELECT name FROM "SvcResource" WHERE id = ANY($1::text[]) ORDER BY id`, [[ids.rBx, ids.rA2]])).map((r) => r.name).sort(), ["ห้อง A2", "ห้องร้าน B"], "แถวเปลี่ยน");
    const L = await RS.list()(cC);
    ok(!L.some((x) => x.id === ids.rA2 || x.id === ids.rBx), "list หลุดข้ามหน่วย/ร้าน");
    eq(await RS.list()({ tenantId: ids.tB, unitId: ids.uC }), [], "list ร้าน B + หน่วยร้าน A");
  });
  await st("R-4", "IN_USE (ทรัพยากรมีนัดอนาคตถือ): ปิดใช้ · ลดความจุ 2→1 ที่มี 2 นัดซ้อน · เพิ่มเวลาเก็บจนซ้อน · เปลี่ยนชนิด ⇒ IN_USE แถวไม่เปลี่ยน · ยกเลิกนัดแล้ว ⇒ ok (ตัวควบคุม)", async () => {
    needTpl();
    // ใช้ vip (COUPLE_ROOM ความจุ 2 · เก็บ 20) ของ uS วัน R: 2 นัดพร้อมกัน 10:00 + นัด 11:25 (เก็บ 20 ⇒ ว่าง 11:20)
    const a = await bookOk(cS, ids.CPL, sS[0], D.R, 600, "vip 1");
    const b = await bookOk(cS, ids.CPL, sS[1], D.R, 600, "vip 2");
    const c = await bookOk(cS, ids.CPL, sS[2], D.R, 685, "vip 3");
    failRes(await RS.update()(OWNER, cS, ids.vip, { active: false }), "IN_USE", "ปิดใช้");
    failRes(await RS.update()(OWNER, cS, ids.vip, { capacity: 1 }), "IN_USE", "ลดความจุ");
    failRes(await RS.update()(OWNER, cS, ids.vip, { cleanupMin: 30 }), "IN_USE", "เพิ่มเวลาเก็บ"); // 10:00+60+30 = 11:30 > 11:25 ⇒ 3 ซ้อน
    failRes(await RS.update()(OWNER, cS, ids.vip, { kind: "ROOM" }), "IN_USE", "เปลี่ยนชนิด");
    const [row] = await q<{ capacity: number; cleanupMin: number; active: boolean; kind: string }>(`SELECT capacity, "cleanupMin", active, kind FROM "SvcResource" WHERE id = $1`, [ids.vip]);
    eq(row, { capacity: 2, cleanupMin: 20, active: true, kind: "COUPLE_ROOM" }, "แถว vip");
    for (const id of [a, b, c]) eq((await BK().setAppointmentStatus(ids.tA, ids.uS, id, "CANCELLED")).ok, true, "ยกเลิก");
    okRes(await RS.update()(OWNER, cS, ids.vip, { cleanupMin: 25 }), "เพิ่มเวลาเก็บหลังยกเลิก");
    okRes(await RS.update()(OWNER, cS, ids.vip, { cleanupMin: 20 }), "คืนค่า");
  });
  await st("R-5", "ปิดซ่อม: ช่วงทับนัด ⇒ IN_USE · ช่วงว่าง ⇒ ok + listResources แสดงช่วง + underMaintenanceNow (now ฉีดในช่วง) · BAD_INPUT (ปลาย ≤ ต้น · ISO ผิด · 21 ช่วง) · [] = ล้าง", async () => {
    needTpl();
    const held = await bookOk(cS, ids.THAI, sS[3], D.R, 780, "เตียงบ่าย"); // 13:00–14:00 + เก็บ 5 = 14:05
    const holder = (await apRow(held)).resourceId;
    ok(holder === ids.bed1, `นัดเตียงบ่ายควรถือเตียง 1 (ลำดับแรก) ได้ ${holder}`);
    failRes(await RS.maint()(OWNER, cS, ids.bed1, [winDay(D.R, 800, 900)]), "IN_USE", "ทับนัด 13:00–14:05");
    failRes(await RS.maint()(OWNER, cS, ids.bed1, [winDay(D.R, 842, 900)]), "IN_USE", "ทับเวลาเก็บ 14:00–14:05 (ปิดซ่อมเริ่ม 14:02)");
    okRes(await RS.maint()(OWNER, cS, ids.bed1, [winDay(D.R, 850, 960)]), "ช่วงว่าง 14:10–16:00");
    const L = await RS.list()(cS, { now: at(D.R, 870) });
    const b1 = L.find((x) => x.id === ids.bed1);
    ok(!!b1 && b1.maintenance.length === 1 && Date.parse(b1.maintenance[0].startAt) === bkkMs(D.R, 850) && b1.underMaintenanceNow === true, `list ${fmt(b1)}`);
    eq((await RS.list()(cS, { now: at(D.R, 1000) })).find((x) => x.id === ids.bed1)?.underMaintenanceNow, false, "นอกช่วง");
    failRes(await RS.maint()(OWNER, cS, ids.bed1, [winDay(D.R, 900, 900)]), "BAD_INPUT", "ปลาย = ต้น");
    failRes(await RS.maint()(OWNER, cS, ids.bed1, [{ startAt: "พรุ่งนี้", endAt: null }]), "BAD_INPUT", "ISO ผิด");
    failRes(await RS.maint()(OWNER, cS, ids.bed1, Array.from({ length: 21 }, (_, k) => winDay(D.R, 1000 + k, 1000 + k + 1))), "BAD_INPUT", "21 ช่วง");
    okRes(await RS.maint()(OWNER, cS, ids.bed1, []), "ล้าง");
    eq((await RS.list()(cS)).find((x) => x.id === ids.bed1)?.maintenance, [], "หลังล้าง");
  });
  await st("R-6", "สิทธิ์: พนักงานที่ไม่มี booking.settings.edit ⇒ FORBIDDEN (สร้าง/แก้/ปิดซ่อม) ไม่เขียนอะไร", async () => {
    needTpl();
    failRes(await RS.create()(CLERK, cC, { kind: "BED", name: "พนักงานสร้าง" }), "FORBIDDEN", "สร้าง");
    failRes(await RS.update()(CLERK, cC, rC1 || ids.rA, { name: "พนักงานแก้" }), "FORBIDDEN", "แก้");
    failRes(await RS.maint()(CLERK, cC, rC1 || ids.rA, [winDay(D.R, 600, 700)]), "FORBIDDEN", "ปิดซ่อม");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SvcResource" WHERE name LIKE 'พนักงาน%'`))[0].n, 0, "แถวพนักงาน");
  }, "MAJOR");

  // ═══════════════ S หาเวลา/จอง ═══════════════
  console.log("\n── S: หาเวลา/จอง ต้องว่างทั้งคนและทรัพยากร ──");
  await st("S-1", "หมอว่างแต่ห้องไม่ว่าง ⇒ ไม่ได้: ห้อง A/B ถูกใช้ 10:00 ⇒ น้ำมันหมอ 3 10:00 = FULL · findSlots (STAFF) หมอ 3 ไม่มี 10:00 แต่มี 11:30 · ตัวควบคุม: บริการไม่ใช้ห้อง หมอ 3 10:00 ได้", async () => {
    needTpl();
    await bookOk(cS, ids.OIL, sS[0], D.S1, 600, "ห้อง 1"); await bookOk(cS, ids.OIL, sS[1], D.S1, 600, "ห้อง 2");
    const slots = (await BK().findSlots(cS, { serviceId: ids.OIL, staffId: sS[2], dateStr: D.S1, channel: "STAFF" })).map((x) => x.startMin);
    eq(codeOf(await book(cS, ids.OIL, sS[2], D.S1, 600)), "FULL", "จองน้ำมันหมอ 3 10:00");
    ok(!slots.includes(600) && slots.includes(690), `findSlots หมอ 3: ${fmt(slots.slice(0, 8))}`);
    eq(codeOf(await book(cS, ids.PLAIN, sS[2], D.S1, 600)), "OK", "ตัวควบคุม: ไม่ใช้ห้อง");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("S-2", "เก็บห้อง 15 นาทีมีผล: ห้อง A/B ใช้ 10:00–11:00 ⇒ 11:00 FULL · 11:14 FULL · 11:15 ได้ (ช่องทางร้านจองนาทีใดก็ได้)", async () => {
    needTpl();
    await bookOk(cS, ids.OIL, sS[0], D.S2, 600, "A"); await bookOk(cS, ids.OIL, sS[1], D.S2, 600, "B");
    eq([codeOf(await book(cS, ids.OIL, sS[2], D.S2, 660)), codeOf(await book(cS, ids.OIL, sS[3], D.S2, 674)), codeOf(await book(cS, ids.OIL, sS[4], D.S2, 675))], ["FULL", "FULL", "OK"], "11:00/11:14/11:15");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("S-3", "ความจุ 2 ตรงเป๊ะ (ห้องคู่ VIP): 2 นัดพร้อมกันได้ · คนที่ 3 FULL · ยกเลิก 1 ⇒ คนที่ 3 ได้", async () => {
    needTpl();
    const a = await bookOk(cS, ids.CPL, sS[0], D.S3, 780, "คู่ 1"); await bookOk(cS, ids.CPL, sS[1], D.S3, 780, "คู่ 2");
    eq(codeOf(await book(cS, ids.CPL, sS[2], D.S3, 780)), "FULL", "คู่ 3");
    eq((await BK().setAppointmentStatus(ids.tA, ids.uS, a, "CANCELLED")).ok, true, "ยกเลิกคู่ 1");
    eq(codeOf(await book(cS, ids.CPL, sS[2], D.S3, 780)), "OK", "คู่ 3 หลังยกเลิก");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("S-4", "ปิดซ่อม + ปิดใช้มีผล: ห้อง A ปิดซ่อม 09:00–20:00 ⇒ ห้อง B ถูกใช้ 10:00 แล้วน้ำมัน 10:00 FULL · 12:00 ได้ห้อง B · เตียง 2 ปิดใช้ ⇒ นวดไทยคนที่ 2 พร้อมกัน FULL (คืนค่าหลังข้อ)", async () => {
    needTpl();
    okRes(await RS.maint()(OWNER, cS, ids.rA, [winDay(D.S4, 540, 1200)]), "ปิดซ่อม A");
    try {
      await bookOk(cS, ids.OIL, sS[0], D.S4, 600, "B 10:00");
      eq(codeOf(await book(cS, ids.OIL, sS[1], D.S4, 600)), "FULL", "10:00 หมอ 2");
      const id = await bookOk(cS, ids.OIL, sS[1], D.S4, 720, "12:00");
      eq(resIdsOf(await apRow(id)), [ids.rB], "12:00 ได้ห้อง B ไม่ใช่ A");
      await q(`UPDATE "SvcResource" SET active = false WHERE id = $1`, [ids.bed2]);
      try {
        await bookOk(cS, ids.THAI, sS[2], D.S4, 900, "ไทย 1");
        eq(codeOf(await book(cS, ids.THAI, sS[3], D.S4, 900)), "FULL", "ไทย 2 (เตียง 2 ปิดใช้)");
      } finally { await q(`UPDATE "SvcResource" SET active = true WHERE id = $1`, [ids.bed2]); }
      eq(await resViolations(ids.uS, { needKinds, maint: new Map([[ids.rA, [{ s: bkkMs(D.S4, 540), e: bkkMs(D.S4, 1200) }]]]) }), [], "ฐาน");
    } finally { await RS.maint()(OWNER, cS, ids.rA, []).catch(() => undefined); }
  });
  await st("S-5", "หลายชนิด (หินร้อน = ห้อง + ชุดหินร้อน): ชุดหินร้อนไม่ว่าง ⇒ FULL แม้ห้องว่าง · ชุดว่าง 11:10 ⇒ ได้ [ห้อง B, ชุด] · แถว resourceId = ห้อง (ชนิดแรก) · policySnapshot.job.resourceIds = [ห้อง, ชุด]", async () => {
    needTpl();
    const first = await bookOk(cS, ids.HOT, sS[0], D.S5, 600, "หินร้อน 1"); // ห้อง A + ชุด ⇒ ชุดว่าง 11:10 (เก็บ 10) · ห้อง A ว่าง 11:15
    eq(resIdsOf(await apRow(first)), [ids.rA, ids.eq], "หินร้อน 1");
    eq(codeOf(await book(cS, ids.HOT, sS[1], D.S5, 600)), "FULL", "10:00 (ห้อง B ว่างแต่ชุดไม่ว่าง)");
    eq(codeOf(await book(cS, ids.HOT, sS[1], D.S5, 669)), "FULL", "11:09");
    const id = await bookOk(cS, ids.HOT, sS[1], D.S5, 670, "11:10");
    const a = await apRow(id);
    eq([a.resourceId, resIdsOf(a)], [ids.rB, [ids.rB, ids.eq]], "แถว 11:10");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("S-6", "ใครก็ได้ (findSlots ANY · STAFF): น้ำมันไม่มี 10:00 ในวัน S-1 (ห้องเต็ม) · บริการไม่ใช้ห้องมี 10:00 (ตัวควบคุม)", async () => {
    needTpl();
    const oil = (await BK().findSlots(cS, { serviceId: ids.OIL, staffId: null, dateStr: D.S1, channel: "STAFF" })).map((x) => x.startMin);
    const plain = (await BK().findSlots(cS, { serviceId: ids.PLAIN, staffId: null, dateStr: D.S1, channel: "STAFF" })).map((x) => x.startMin);
    ok(plain.includes(600), `ตัวควบคุม PLAIN ANY ไม่มี 10:00 ${fmt(plain.slice(0, 6))}`);
    ok(!oil.includes(600) && oil.includes(690), `OIL ANY ${fmt(oil.slice(0, 6))}`);
  });
  await st("S-7", "แถวที่เขียน: บริการไม่ใช้ห้อง ⇒ resourceId null + job.resourceIds ไม่มี/[] · บริการใช้ห้อง ⇒ resourceId = id ห้อง + job.resourceIds = [id]", async () => {
    needTpl();
    const p = await apRow(await bookOk(cS, ids.PLAIN, sS[5], D.S3, 600, "ธรรมดา"));
    ok(p.resourceId === null && (p.policySnapshot?.job?.resourceIds === undefined || isDeepStrictEqual(p.policySnapshot?.job?.resourceIds, [])), `ธรรมดา ${fmt([p.resourceId, p.policySnapshot?.job])}`);
    const o = await apRow(await bookOk(cS, ids.OIL, sS[5], D.S3, 900, "น้ำมัน"));
    ok(o.resourceId === ids.rA && isDeepStrictEqual(o.policySnapshot?.job?.resourceIds, [ids.rA]), `น้ำมัน ${fmt([o.resourceId, o.policySnapshot?.job])}`);
  });
  await st("S-8", "ลูกค้าจองเอง (ONLINE) เห็นแค่ \"เต็ม\": ห้องเต็ม กับ หมอไม่ว่าง ⇒ FULL ข้อความเดียวกัน · findSlots ONLINE ไม่มีเวลานั้น", async () => {
    needTpl();
    await bookOk(cS, ids.PLAIN, sS[0], D.S8, 660, "หมอ 1 ไม่ว่าง");
    const r1 = await book(cS, ids.PLAIN, sS[0], D.S8, 660, "ONLINE");
    await bookOk(cS, ids.OIL, sS[1], D.S8, 660, "ห้อง A"); await bookOk(cS, ids.OIL, sS[2], D.S8, 660, "ห้อง B");
    const r2 = await book(cS, ids.OIL, sS[3], D.S8, 660, "ONLINE");
    ok(!r1.ok && r1.code === "FULL", `หมอไม่ว่าง ${fmt(r1)}`);
    ok(!r2.ok && r2.code === "FULL", `ห้องเต็ม ${fmt(r2)}`);
    eq((r2 as { reason: string }).reason, (r1 as { reason: string }).reason, "ข้อความ");
    const sl = (await BK().findSlots(cS, { serviceId: ids.OIL, staffId: sS[3], dateStr: D.S8, channel: "ONLINE" })).map((x) => x.startMin);
    ok(!sl.includes(660), `findSlots ONLINE ${fmt(sl.slice(0, 8))}`);
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("S-9", "เลื่อนนัด: ร้านเลื่อน (rescheduleByShop) ไปเวลาที่ห้องเต็ม ⇒ FULL · ไปเวลาว่าง ⇒ ได้และถือห้องที่ว่าง · ลูกค้าเลื่อนเอง (rescheduleBySelf) เหมือนกัน · ไม่นับตัวเอง (เลื่อน 15 นาทีในห้องเดิม ⇒ ได้)", async () => {
    needTpl();
    await bookOk(cS, ids.OIL, sS[0], D.S9, 600, "A"); await bookOk(cS, ids.OIL, sS[1], D.S9, 600, "B");
    const m = await bookOk(cS, ids.OIL, sS[2], D.S9, 840, "ย้ายร้าน");
    eq(codeOf(await LN().rescheduleByShop(cS, m, { dateStr: D.S9, startMin: 630 })), "FULL", "ร้านเลื่อนไป 10:30");
    eq(codeOf(await LN().rescheduleByShop(cS, m, { dateStr: D.S9, startMin: 855 })), "OK", "ร้านเลื่อน 14:15 (ทับตัวเอง)");
    const o = await bookOk(cS, ids.OIL, sS[3], D.S9, 900, "ออนไลน์", "ONLINE");
    eq(codeOf(await BK().rescheduleBySelf(cS, o, { dateStr: D.S9, startMin: 630, staffId: sS[3] })), "FULL", "ลูกค้าเลื่อนไป 10:30");
    eq(codeOf(await BK().rescheduleBySelf(cS, o, { dateStr: D.S9, startMin: 720, staffId: sS[3] })), "OK", "ลูกค้าเลื่อนไป 12:00");
    eq(resIdsOf(await apRow(o)).length, 1, "ออนไลน์ถือห้อง 1 ห้อง");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("S-10", "ปลุกนัดที่ยกเลิก (setAppointmentStatus → CONFIRMED) ขณะห้องถูกจองครบ ⇒ ไม่ได้ (แถวคง CANCELLED) · ยกเลิกอีกนัดแล้วปลุก ⇒ ได้และถือห้องที่ว่าง", async () => {
    needTpl();
    const x = await bookOk(cS, ids.OIL, sS[0], D.S10, 600, "เดิม");
    eq((await BK().setAppointmentStatus(ids.tA, ids.uS, x, "CANCELLED")).ok, true, "ยกเลิก");
    await bookOk(cS, ids.OIL, sS[1], D.S10, 600, "A"); const y = await bookOk(cS, ids.OIL, sS[2], D.S10, 600, "B");
    eq((await BK().setAppointmentStatus(ids.tA, ids.uS, x, "CONFIRMED")).ok, false, "ปลุกขณะห้องเต็ม");
    eq((await apRow(x)).status, "CANCELLED", "สถานะ");
    eq((await BK().setAppointmentStatus(ids.tA, ids.uS, y, "CANCELLED")).ok, true, "ยกเลิก B");
    eq((await BK().setAppointmentStatus(ids.tA, ids.uS, x, "CONFIRMED")).ok, true, "ปลุกหลังห้องว่าง");
    eq(resIdsOf(await apRow(x)), [ids.rB], "ถือห้อง B");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("S-11", "ทางเดิม createAppointment: บริการใช้ห้อง + ห้องเต็ม ⇒ ok:false (ไม่ throw) · บริการไม่ใช้ห้อง ⇒ ได้ (ตัวควบคุม)", async () => {
    needTpl();
    await bookOk(cS, ids.OIL, sS[0], D.S11, 600, "A"); await bookOk(cS, ids.OIL, sS[1], D.S11, 600, "B");
    const base = { tenantId: ids.tA, unitId: ids.uS, staffId: sS[2], dateStr: D.S11, startMin: 600, customerName: "ลูกค้าเดิม", customerPhone: newPhone() };
    eq((await BK().createAppointment({ ...base, serviceId: ids.OIL })).ok, false, "ทางเดิม น้ำมัน");
    eq((await BK().createAppointment({ ...base, serviceId: ids.PLAIN, customerPhone: newPhone() })).ok, true, "ทางเดิม ไม่ใช้ห้อง");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });

  // ═══════════════ W แถวเดียว ═══════════════
  console.log("\n── W: walk-in · รับ walk-in ตอนนี้ได้ไหม · เริ่มงาน · มาสาย ──");
  const nowW = at(D.W, 600);
  let wOil = "";
  await st("W-1", "รับ walk-in ตอนนี้ได้ไหม (10:00 · ห้อง A 10:30 · ห้อง B 10:20): น้ำมัน ⇒ 11:35 ห้อง B limitedBy RESOURCE เหตุผลพูดถึง \"ห้อง\" · นวดไทย ⇒ ทันที NONE · ไม่มีชื่อ/เบอร์ลูกค้า", async () => {
    needTpl();
    await bookOk(cS, ids.OIL, sS[0], D.W, 630, "A 10:30"); await bookOk(cS, ids.OIL, sS[1], D.W, 620, "B 10:20");
    const rows = await RS.now()(cS, { now: nowW });
    const oil = rows.find((r) => r.serviceId === ids.OIL), thai = rows.find((r) => r.serviceId === ids.THAI);
    ok(!!oil && !!thai, `ไม่มีแถวบริการ ${fmt(rows.map((r) => r.serviceName))}`);
    eq([oil!.closed, tms(oil!.startAt), oil!.resourceIds, oil!.limitedBy], [false, bkkMs(D.W, 695), [ids.rB], "RESOURCE"], "น้ำมัน");
    ok(oil!.reasonTh.includes("ห้อง"), `เหตุผลน้ำมัน "${oil!.reasonTh}"`);
    eq([tms(thai!.startAt), thai!.limitedBy, thai!.resourceIds], [bkkMs(D.W, 600), "NONE", [ids.bed1]], "นวดไทย");
    ok(!JSON.stringify(rows).includes("ลูกค้า QC B13"), "มีชื่อลูกค้า");
  });
  await st("W-2", "walk-in น้ำมัน 10:00 ขอหมอ 6 (ว่างทั้งวัน) ⇒ วางรอห้อง 11:35 (ห้อง B) · แถว QUEUED ถือห้อง B · ฐานไม่เกินความจุ", async () => {
    needTpl();
    const r = await LN().createWalkIn(cS, { serviceId: ids.OIL, staffId: sS[5], channel: "STAFF" }, { now: nowW }); // ขอหมอ 6 (ว่างทั้งวัน) ⇒ เหตุที่รอ = ห้องเท่านั้น
    if (!r.ok) throw new AssertFail(`walk-in ล้ม ${r.code} ${r.reason}`);
    wOil = r.appointmentId;
    eq(tms(r.plannedStartAt), bkkMs(D.W, 695), "plannedStartAt");
    const a = await apRow(wOil);
    eq([a.status, tms(a.startAt), resIdsOf(a)], ["QUEUED", bkkMs(D.W, 695), [ids.rB]], "แถว");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("W-3", "หมอไม่ว่าง (หมอเดี่ยวมีนัด 10:00–11:00) ⇒ นวดไทย limitedBy STAFF 11:00 เหตุผลพูดถึง \"หมอนวด\" (คำเรียกผู้ให้บริการของสาขา) · ต่างจากเหตุผลห้อง", async () => {
    needTpl();
    await bookOk(cW, ids.WPLAIN, ids.w1, D.W, 600, "หมอเดี่ยว");
    const rows = await RS.now()(cW, { now: nowW });
    const th = rows.find((r) => r.serviceId === ids.WTHAI);
    ok(!!th, "ไม่มีแถว");
    eq([th!.limitedBy, tms(th!.startAt)], ["STAFF", bkkMs(D.W, 660)], "นวดไทย");
    ok(th!.reasonTh.includes("หมอนวด") && !th!.reasonTh.includes("ห้อง"), `เหตุผล "${th!.reasonTh}"`);
  });
  await st("W-4", "startJob walk-in ที่วางรอห้อง (หมอ 6 ว่าง) มาเริ่มตอนนี้ (10:05) ⇒ CLASH (ห้องชนนัด — ไม่ใช่หมอชน) ไม่เขียนอะไร · ตัวควบคุม: walk-in นวดไทยเริ่มได้", async () => {
    needTpl();
    ok(!!wOil, "ไม่มี walk-in จาก W-2");
    const before = await apRow(wOil);
    eq(codeOf(await LN().startJob(cS, wOil, { now: at(D.W, 605) })), "CLASH", "เริ่มน้ำมัน");
    const after = await apRow(wOil);
    eq([after.status, tms(after.startAt), resIdsOf(after)], [before.status, tms(before.startAt), resIdsOf(before)], "แถวเปลี่ยน");
    const t = await LN().createWalkIn(cS, { serviceId: ids.THAI, staffId: null, channel: "STAFF" }, { now: at(D.W, 605) });
    if (!t.ok) throw new AssertFail(`walk-in ไทย ${t.code}`);
    eq(codeOf(await LN().startJob(cS, t.appointmentId, { now: at(D.W, 605) })), "OK", "เริ่มนวดไทย");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("W-5", "ห้องน้ำมันทั้ง 2 ปิดซ่อมทั้งวัน ⇒ walk-in น้ำมัน WALKIN_CLOSED · walk-in นวดไทยได้ (ตัวควบคุม) · ปลดปิดซ่อม", async () => {
    needTpl();
    okRes(await RS.maint()(OWNER, cS, ids.rA, [winDay(D.W3, 0, 1440)]), "A"); okRes(await RS.maint()(OWNER, cS, ids.rB, [winDay(D.W3, 0, 1440)]), "B");
    try {
      eq(codeOf(await LN().createWalkIn(cS, { serviceId: ids.OIL, staffId: null, channel: "STAFF" }, { now: at(D.W3, 600) })), "WALKIN_CLOSED", "น้ำมัน");
      eq(codeOf(await LN().createWalkIn(cS, { serviceId: ids.THAI, staffId: null, channel: "STAFF" }, { now: at(D.W3, 600) })), "OK", "นวดไทย");
    } finally { await RS.maint()(OWNER, cS, ids.rA, []).catch(() => undefined); await RS.maint()(OWNER, cS, ids.rB, []).catch(() => undefined); }
  });
  await st("W-6", "มาสายเข้าแถวแบบ walk-in ยังถือห้อง: นัด 10:00 (ห้อง A) เช็กอิน 10:20 (asWalkIn) → runPlanner ⇒ จองน้ำมัน 11:00 FULL (ห้อง A ถึง 11:35 · ห้อง B 10:40–11:55) · 12:00 ได้", async () => {
    needTpl();
    const late = await bookOk(cS, ids.OIL, sS[0], D.W4, 600, "สาย");
    await bookOk(cS, ids.OIL, sS[1], D.W4, 640, "B 10:40");
    const c = await LN().checkIn(cS, { appointmentId: late }, { via: "STAFF", now: at(D.W4, 620) });
    if (!c.ok) throw new AssertFail(`เช็กอิน ${c.code} ${c.reason}`);
    eq(c.asWalkIn, true, "asWalkIn");
    await RN().runPlanner(cS, { now: at(D.W4, 620) });
    eq(codeOf(await book(cS, ids.OIL, sS[2], D.W4, 660)), "FULL", "11:00");
    eq(codeOf(await book(cS, ids.OIL, sS[2], D.W4, 720)), "OK", "12:00");
    eq(await resViolations(ids.uS, { needKinds }), [], "ฐาน");
  });
  await st("W-7", "หลัง runPlanner ทุกวันที่ทดสอบ (W · W3 · W4): ฐานไม่มีทรัพยากรเกินความจุ · ไม่มีหมอซ้อน · walk-in ที่ใช้ห้องถือห้องครบชนิด", async () => {
    needTpl();
    for (const ds of [D.W, D.W3, D.W4]) await RN().runPlanner(cS, { now: at(ds, 630) });
    eq(await resViolations(ids.uS, { needKinds }), [], "ทรัพยากร");
    eq(await staffOverlap(ids.uS), [], "หมอ");
  });
  await st("W-8", "X1: walkInNowByService ด้วย ctx ร้านอื่น/หน่วยไม่ตรงร้าน ⇒ [] · createWalkIn บริการของหน่วยอื่น ⇒ NOT_FOUND", async () => {
    needTpl();
    eq(await RS.now()({ tenantId: ids.tB, unitId: ids.uS }, { now: nowW }), [], "ร้าน B + หน่วย uS");
    eq(await RS.now()({ tenantId: ids.tA, unitId: ids.uB }, { now: nowW }), [], "ร้าน A + หน่วยร้าน B");
    eq(codeOf(await LN().createWalkIn(cA2, { serviceId: ids.OIL, staffId: null, channel: "STAFF" }, { now: nowW })), "NOT_FOUND", "บริการหน่วยอื่น");
  }, "MAJOR");
  // ORACLE-EDIT (ผู้คุม 31 ต.ค. · b13-Q1) — ข้อเพิ่ม: walk-in ออกบัตรก่อน → นัดมาสายเข้าแถวบนห้องเดียว ⇒ ฐานไม่ล้น (§4.6 ใหม่) ·
  //   startJob ของงานที่ตัววางคิวสั่งเริ่มตอนนี้ไม่ได้ CLASH_RES (ด่านฐาน = ด่านตัววางคิว) · ใช้หน่วย uX1 (ห้องเดียว · เก็บ 15) วัน dd(16) ไม่ชนฉาก X
  await st("W-9", "Q1: walk-in ออกบัตรก่อน (10:16) → นัดห้องเดียว 10:00 มาสายเช็กอิน 10:20 (asWalkIn) → runPlanner ⇒ ฐานไม่ล้น · งานที่แผนให้เริ่มตอนนี้ startJob ได้ (ไม่ CLASH)", async () => {
    needTpl();
    const u = ids.uX1, ds = dd(16), c = cX(u);
    const late = await bookOk(c, xSvc(u, "OIL"), xStaff(u)[0], ds, 600, "นัดห้องเดียว 10:00");
    // walk-in ขอหมอคนที่ 2 (คนละคนกับนัด) ⇒ ตัวแปรเดียวที่แข่งกันคือห้อง (ฝั่งหมอของนัดมาสาย = กติกา B.4 เดิม)
    const w = await LN().createWalkIn(c, { serviceId: xSvc(u, "OIL"), staffId: xStaff(u)[1], channel: "STAFF" }, { now: at(ds, 616) });
    if (!w.ok) throw new AssertFail(`walk-in ${w.code} ${w.reason}`);
    eq(await resViolations(u), [], "ฐานหลัง walk-in");
    const ci = await LN().checkIn(c, { appointmentId: late }, { via: "STAFF", now: at(ds, 620) });
    if (!ci.ok) throw new AssertFail(`เช็กอิน ${ci.code} ${ci.reason}`);
    eq(ci.asWalkIn, true, "asWalkIn");
    await RN().runPlanner(c, { now: at(ds, 620) });
    eq(await resViolations(u), [], "ฐานหลังวางคิว");
    const rows = await q<{ id: string; plannedStartAt: Date | null }>(`SELECT id, "plannedStartAt" FROM "Appointment" WHERE "unitId" = $1 AND id = ANY($2::text[])`, [u, [late, w.appointmentId]]);
    const first = rows.find((r) => r.plannedStartAt && r.plannedStartAt.getTime() === bkkMs(ds, 620));
    ok(!!first, `ไม่มีงานที่แผนให้เริ่ม 10:20 ${fmt(rows.map((r) => [r.id.slice(-6), HM(tms(r.plannedStartAt))]))}`);
    eq(codeOf(await LN().startJob(c, first!.id, { now: at(ds, 620) })), "OK", "startJob งานที่แผนให้เริ่มตอนนี้");
    await RN().runPlanner(c, { now: at(ds, 620) });
    eq(await resViolations(u), [], "ฐานหลังเริ่มงาน");
    eq(await staffOverlap(u), [], "หมอ");
  });
  // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B13-PB-11) — ข้อเพิ่ม (เพิ่มอย่างเดียว · มติ Q16): แถว ARRIVED ที่ตัววางคิวยังไม่ได้ประเมิน
  //   (ช่วง checkIn commit → replan · หรือ replan ล้มแล้วกลืน error) ต้องยังถือห้อง ⇒ จองห้องเดียวกันทับไม่ได้ ·
  //   ฐานข้ามเฉพาะแถวที่มีเครื่องหมาย job.unplacedAt (ตัววางคิวเขียนเมื่อประเมินแล้วว่าวางไม่ได้) · หน่วย uX7 (ห้องเดียว) วัน dd(17) ไม่ชนฉาก X
  await st("W-10", "Q16: เช็กอินสาย 5 นาที (ในผ่อนผัน) แล้วแผนหาย (จำลอง replan ล้ม) ⇒ จองห้องเดียวกันทับ 10:40 = FULL · runPlanner แล้วฐานไม่ล้น · ไม่มีเครื่องหมาย unplacedAt บนแถวที่วางได้", async () => {
    needTpl();
    const u = ids.uX7, ds = dd(17), c = cX(u);
    const a = await bookOk(c, xSvc(u, "OIL"), xStaff(u)[0], ds, 600, "นัดห้องเดียว 10:00");
    const ci = await LN().checkIn(c, { appointmentId: a }, { via: "STAFF", now: at(ds, 605) });
    if (!ci.ok) throw new AssertFail(`เช็กอิน ${ci.code} ${ci.reason}`);
    await q(`UPDATE "Appointment" SET "plannedStartAt" = NULL, "plannedStaffId" = NULL WHERE id = $1`, [a]); // แผนยังไม่ถูกเขียน/หาย
    eq(codeOf(await book(c, xSvc(u, "OIL"), xStaff(u)[1], ds, 640)), "FULL", "จองห้องเดียวกันทับลูกค้าที่มาถึงแล้ว");
    eq(await resViolations(u), [], "ฐานช่วงก่อนวางคิว");
    await RN().runPlanner(c, { now: at(ds, 606) });
    const row = await apRow(a);
    ok(row.plannedStartAt !== null, "หลังวางคิวต้องมีแผน");
    ok((row.policySnapshot?.job as Record<string, unknown> | undefined)?.unplacedAt === undefined, `แถวที่วางได้ยังมีเครื่องหมาย ${fmt(row.policySnapshot?.job)}`);
    eq(await resViolations(u), [], "ฐานหลังวางคิว");
  });
  // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B13-PB-12) — ข้อเพิ่ม (เพิ่มอย่างเดียว · มติ Q17): เครื่องหมาย unplacedAt ที่ค้างจากการเช็กอินครั้งก่อน
  //   (มาสายวางไม่ได้ → ถอยเป็น CONFIRMED → ร้านเลื่อนวัน → เช็กอินวันใหม่ ก่อน/ไม่มี replan) ต้องไม่ทำให้ฐานข้ามแถว ·
  //   หน่วย uX6 (ห้องเดียว) วัน dd(18)/dd(19) ไม่ชนฉาก X
  await st("W-11", "Q17: เครื่องหมายวางไม่ได้ของวันก่อนค้างบนแถว → เช็กอินวันใหม่ (แผนหาย) ⇒ จองห้องเดียวกันทับ = FULL · ทางถอยสถานะ/เลื่อนล้างเครื่องหมาย", async () => {
    needTpl();
    const u = ids.uX6, d1 = dd(18), d2 = dd(19), c = cX(u);
    const a = await bookOk(c, xSvc(u, "OIL"), xStaff(u)[0], d1, 1125, "นัด 18:45");
    const ci = await LN().checkIn(c, { appointmentId: a }, { via: "STAFF", now: at(d1, 1150) });
    if (!ci.ok) throw new AssertFail(`เช็กอิน 1 ${ci.code} ${ci.reason}`);
    await RN().runPlanner(c, { now: at(d1, 1150) });
    const m1 = (await apRow(a)).policySnapshot?.job as Record<string, unknown> | undefined;
    ok(typeof m1?.unplacedAt === "string", `ไม่มีเครื่องหมายหลังวางไม่ได้ ${fmt(m1)}`);
    eq((await BK().setAppointmentStatus(ids.tA, u, a, "CONFIRMED")).ok, true, "ถอยเป็น CONFIRMED");
    const m2 = (await apRow(a)).policySnapshot?.job as Record<string, unknown> | undefined;
    ok(m2?.unplacedAt === undefined, `ถอยสถานะต้องล้างเครื่องหมาย ${fmt(m2)}`);
    eq(codeOf(await LN().rescheduleByShop(c, a, { dateStr: d2, startMin: 600 }, { now: at(d1, 1152) })), "OK", "ร้านเลื่อนไปวันถัดไป");
    const ci2 = await LN().checkIn(c, { appointmentId: a }, { via: "STAFF", now: at(d2, 605) });
    if (!ci2.ok) throw new AssertFail(`เช็กอิน 2 ${ci2.code} ${ci2.reason}`);
    // จำลองสถานะค้าง: replan หลัง commit ล้ม + เครื่องหมายเก่าของเมื่อวานยังอยู่ (เส้นที่ลืมล้าง)
    await q(`UPDATE "Appointment" SET "plannedStartAt" = NULL, "plannedStaffId" = NULL, "policySnapshot" = jsonb_set("policySnapshot", '{job,unplacedAt}', to_jsonb($2::text)) WHERE id = $1`, [a, at(d1, 1150).toISOString()]);
    eq(codeOf(await book(c, xSvc(u, "OIL"), xStaff(u)[1], d2, 640)), "FULL", "จองห้องเดียวกันทับลูกค้าที่มาถึงวันใหม่");
    eq(await resViolations(u), [], "ฐาน");
  });
  // ORACLE-EDIT (ผู้คุม 31 ต.ค. · B13-PB-13) — ข้อเพิ่ม (เพิ่มอย่างเดียว · มติ Q18 "ยุคการมาถึง"): แถวกลับเข้า ARRIVED ทางที่ไม่ใช่ checkIn
  //   (ยกเลิกโดยร้าน → ปลุกตรง / ผ่าน CONFIRMED) ต้องเริ่มยุคใหม่ (checkedInAt ใหม่ · ไม่มีเครื่องหมายเก่า) ⇒ จองห้องทับไม่ได้ ·
  //   หน่วย uX4 (ห้องเดียว) วัน dd(20)/dd(21) ไม่ชนฉาก X
  await st("W-12", "Q18: มาสายวางไม่ได้ (เครื่องหมาย) → cancelByShop → ช่องหมอว่าง → ปลุกกลับ ARRIVED (ตรง/ผ่าน CONFIRMED) ⇒ ไม่มีเครื่องหมายเก่า · จองห้องเดียวกันทับ 10:30 = FULL · ฐานไม่ล้น", async () => {
    needTpl();
    const u = ids.uX4, c = cX(u);
    for (const [ds, via] of [[dd(20), "direct"], [dd(21), "viaConfirmed"]] as const) {
      const a = await bookOk(c, xSvc(u, "OIL"), xStaff(u)[0], ds, 600, `${via} นัดห้อง 10:00`);
      const plain: string[] = [];
      for (let h = 0; h < 9; h++) plain.push(await bookOk(c, xSvc(u, "PLAIN"), xStaff(u)[0], ds, 660 + h * 60, `${via} หมอเต็ม ${h}`));
      const ci = await LN().checkIn(c, { appointmentId: a }, { via: "STAFF", now: at(ds, 620) });
      if (!ci.ok) throw new AssertFail(`${via} เช็กอิน ${ci.code} ${ci.reason}`);
      await RN().runPlanner(c, { now: at(ds, 620) });
      const cancelByShop = (LN() as LineApi & { cancelByShop: (ctx: Ctx, id: string, opts?: { now?: Date }) => Promise<JobResult> }).cancelByShop;
      eq(codeOf(await cancelByShop(c, a, { now: at(ds, 621) })), "OK", `${via} ยกเลิกโดยร้าน`);
      const m0 = (await apRow(a)).policySnapshot?.job as Record<string, unknown> | undefined;
      ok(m0?.unplacedAt === undefined && m0?.unplacedFor === undefined, `${via} ยกเลิกต้องล้างเครื่องหมาย ${fmt(m0)}`);
      eq((await BK().setAppointmentStatus(ids.tA, u, plain[0], "CANCELLED")).ok, true, `${via} ช่องหมอว่าง`);
      if (via === "viaConfirmed") eq((await BK().setAppointmentStatus(ids.tA, u, a, "CONFIRMED")).ok, true, "ปลุกเป็น CONFIRMED");
      const y = await BK().setAppointmentStatus(ids.tA, u, a, "ARRIVED");
      if (!y.ok) continue; // ปลุกไม่ได้ = ไม่มีลูกค้าถือห้อง (ตัวควบคุมแบบ P23)
      const m1 = (await apRow(a)).policySnapshot?.job as Record<string, unknown> | undefined;
      ok(m1?.unplacedAt === undefined && m1?.unplacedFor === undefined, `${via} กลับเข้า ARRIVED ต้องไม่มีเครื่องหมายเก่า ${fmt(m1)}`);
      eq(codeOf(await book(c, xSvc(u, "OIL"), xStaff(u)[1], ds, 630)), "FULL", `${via} จองห้องเดียวกันทับลูกค้าหน้าร้าน`);
      await RN().runPlanner(c, { now: at(ds, 622) });
      eq(await resViolations(u), [], `${via} ฐาน`);
    }
  });

  // ═══════════════ E _fallback ═══════════════
  console.log("\n── E: _fallback = พฤติกรรม B1 (ไม่มีทรัพยากร/ไม่ประกาศชนิด) ──");
  await st("E-1", "ร้านเดิม (_fallback) มีแถวทรัพยากรแต่บริการไม่ประกาศชนิด ⇒ findSlots เท่ากับร้านที่ไม่มีทรัพยากรทุกช่อง · 2 นัดเวลาเดียวกันต่างช่างได้ · resourceId null", async () => {
    needTpl();
    const a = await BK().findSlots(cF, { serviceId: ids.FPLAIN, staffId: fS[0], dateStr: D.E, channel: "STAFF" });
    const b = await BK().findSlots(cF2, { serviceId: ids.F2PLAIN, staffId: f2S[0], dateStr: D.E, channel: "STAFF" });
    eq(a.map((x) => x.startMin), b.map((x) => x.startMin), "ช่อง");
    const x = await bookOk(cF, ids.FPLAIN, fS[0], D.E, 600, "เอฟ 1"); const y = await bookOk(cF, ids.FPLAIN, fS[1], D.E, 600, "เอฟ 2");
    eq([(await apRow(x)).resourceId, (await apRow(y)).resourceId], [null, null], "resourceId");
  });
  await st("E-2", "ร้านตัดผม (BARBER · เก้าอี้ 2 ตัว · บริการไม่ประกาศชนิด) ⇒ 3 นัดพร้อมกันได้ (เก้าอี้ไม่จองแยก) · walk-in ได้ · runPlanner ไม่เขียน resourceId", async () => {
    needTpl();
    for (const s of f3S) await bookOk(cF3, ids.F3CUT, s, D.E, 660, "ตัด");
    const w = await LN().createWalkIn(cF3, { serviceId: ids.F3CUT, staffId: null, channel: "STAFF" }, { now: at(D.E, 600) });
    eq(codeOf(w), "OK", "walk-in");
    await RN().runPlanner(cF3, { now: at(D.E, 600) });
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1 AND "resourceId" IS NOT NULL`, [ids.uF3]))[0].n, 0, "แถวมี resourceId");
  });

  // ═══════════════ X ยิงพร้อมกัน ═══════════════
  console.log("\n── X: ยิงพร้อมกันข้ามโพรเซส (5 โพรเซส) ──");
  const readDeadlocks = async () => Number((await q<{ n: string }>(`SELECT deadlocks::text AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? NaN);
  let dlBase = NaN;
  await st("X-dc", "ตัวควบคุม: ตัวนับ deadlock ของฐานเห็นวงรอที่จงใจสร้าง (2 session ล็อกไขว้ SvcResource) — ไม่งั้น X-9 ว่างเปล่า", async () => {
    need();
    const c0 = await readDeadlocks();
    const A = await pool.connect(); const B2 = await pool.connect();
    let codes: string[] = [];
    try {
      await A.query("BEGIN"); await B2.query("BEGIN");
      await A.query(`SELECT id FROM "SvcResource" WHERE id = $1 FOR UPDATE`, [xRes(ids.uX3, 1)]);
      await B2.query(`SELECT id FROM "SvcResource" WHERE id = $1 FOR UPDATE`, [xRes(ids.uX3, 2)]);
      const pa = A.query(`SELECT id FROM "SvcResource" WHERE id = $1 FOR UPDATE`, [xRes(ids.uX3, 2)]).then(() => "ok", (e: { code?: string }) => String(e.code));
      await sleep(300);
      const pb = B2.query(`SELECT id FROM "SvcResource" WHERE id = $1 FOR UPDATE`, [xRes(ids.uX3, 1)]).then(() => "ok", (e: { code?: string }) => String(e.code));
      codes = await Promise.all([pa, pb]);
    } finally { await A.query("ROLLBACK").catch(() => undefined); await B2.query("ROLLBACK").catch(() => undefined); A.release(); B2.release(); }
    ok(codes.includes("40P01"), `ไม่เกิด deadlock ที่จงใจสร้าง ${fmt(codes)}`);
    await sleep(12_000);
    const c1 = await readDeadlocks();
    ok(Number.isFinite(c0) && c1 > c0, `ตัวนับไม่ขยับ ${c0} → ${c1}`);
    dlBase = c1;
  }, "MAJOR");

  const NOW_X = at(D.X, 600).toISOString();
  const bookCall = (u: string, svcKey: "OIL" | "PLAIN", staffIdx: number, min: number, channel: BookingChannel = "STAFF"): CallSpec =>
    ({ fn: "book", ctx: cX(u), input: bk({ serviceId: xSvc(u, svcKey), staffId: xStaff(u)[staffIdx], dateStr: D.X, startMin: min, channel }) });
  const spread = (calls: CallSpec[], n = 5): CallSpec[][] => Array.from({ length: n }, (_, i) => calls.filter((_, k) => k % n === i));
  // ข้อมูลตั้งต้นของ X3/X4 (ก่อนยิง)
  const pre: Record<string, string> = {};
  const preOk = await (async () => {
    try {
      needTpl();
      pre.x3a = await bookOk(cX(ids.uX3), xSvc(ids.uX3, "OIL"), xStaff(ids.uX3)[0], D.X, 600, "X3 นัด 10:00");
      pre.x3b = await bookOk(cX(ids.uX3), xSvc(ids.uX3, "OIL"), xStaff(ids.uX3)[1], D.X, 720, "X3 นัด 12:00");
      // X4: นัดน้ำมัน 5 นัดคนละเวลา (10:00 · 11:30 · 13:00 · 14:30 · 16:00 — ห้องเดียวพอดีรวมเวลาเก็บ) แล้วยิงเลื่อนไป 18:00 พร้อมจองใหม่
      for (let k = 0; k < 5; k++) pre[`x4_${k}`] = await bookOk(cX(ids.uX4), xSvc(ids.uX4, "OIL"), xStaff(ids.uX4)[k], D.X, 600 + k * 90, `X4 ตั้งต้น ${k}`);
      return true;
    } catch (e) { console.log(`  ⚠️ ข้อมูลตั้งต้น X: ${errMsg(e)}`); return false; }
  })();
  const scenarios: Scenario[] = [
    { key: "X0", perChild: spread(Array.from({ length: 10 }, (_, k) => bookCall(ids.uX0, "PLAIN", k, 840))) },
    { key: "X1", perChild: spread(Array.from({ length: 10 }, (_, k) => bookCall(ids.uX1, "OIL", k, 840, k % 2 ? "ONLINE" : "STAFF"))) },
    { key: "X2", perChild: spread(Array.from({ length: 10 }, (_, k) => bookCall(ids.uX2, "OIL", k, 840))) },
    { key: "X3", perChild: spread([
      ...[2, 3, 4, 5].map((k) => bookCall(ids.uX3, "OIL", k, 630)),
      ...[0, 1, 2].map((): CallSpec => ({ fn: "walkIn", ctx: cX(ids.uX3), serviceId: xSvc(ids.uX3, "OIL"), now: NOW_X })),
      { fn: "checkIn", ctx: cX(ids.uX3), id: pre.x3a ?? "", now: NOW_X }, { fn: "checkIn", ctx: cX(ids.uX3), id: pre.x3b ?? "", now: NOW_X },
      { fn: "planLoop", ctx: cX(ids.uX3), now: NOW_X, times: 5 },
    ]) },
    { key: "X4", perChild: spread([
      ...[0, 1, 2, 3, 4].map((k): CallSpec => ({ fn: "resched", ctx: cX(ids.uX4), id: pre[`x4_${k}`] ?? "", dateStr: D.X, startMin: 1080, now: NOW_X })),
      ...[5, 6, 7, 8, 9].map((k) => bookCall(ids.uX4, "OIL", k, 1080)),
    ]) },
    { key: "X5", perChild: spread([{ fn: "resUpdate", actor: OWNER, ctx: cX(ids.uX5), id: xRes(ids.uX5, 1), patch: { capacity: 1 } }, ...Array.from({ length: 9 }, (_, k) => bookCall(ids.uX5, "OIL", k, 840))]) },
    { key: "X6", perChild: spread([
      ...[0, 1, 2, 3, 4].map((k): CallSpec => ({ fn: "create", input: { tenantId: ids.tA, unitId: ids.uX6, serviceId: xSvc(ids.uX6, "OIL"), staffId: xStaff(ids.uX6)[k], dateStr: D.X, startMin: 840, customerName: "ทางเดิม", customerPhone: newPhone() } })),
      ...[5, 6, 7, 8, 9].map((k) => bookCall(ids.uX6, "OIL", k, 840)),
    ]) },
    { key: "X7", perChild: spread([{ fn: "resMaint", actor: OWNER, ctx: cX(ids.uX7), id: xRes(ids.uX7, 1), windows: [winDay(D.X, 780, 960)] }, ...Array.from({ length: 9 }, (_, k) => bookCall(ids.uX7, "OIL", k, 840))]) },
  ];
  let xOut: Map<string, CallOut[]> | null = null;
  let xErr = "";
  if (setupOk && tplOk && preOk) { try { xOut = await runHarness(scenarios, 5); } catch (e) { xErr = errMsg(e); } } else xErr = "ข้อมูลตั้งต้นไม่ครบ (T-3/ข้อมูล X)";
  const outsOf = (k: string): CallOut[] => { if (!xOut) throw new AssertFail(`สายยิงพร้อมกันไม่ทำงาน: ${xErr}`); return xOut.get(k) ?? []; };
  const noThrow = (os: CallOut[]) => { const t = os.filter((o) => o.threw); ok(t.length === 0, `throw ${t.length}: ${t[0]?.threw}`); };
  const okN = (os: CallOut[], fn?: CallSpec["fn"]) => os.filter((o) => o.ok && (!fn || o.fn === fn)).length;
  await st("X-0", "ตัวควบคุม (เขียวทั้งก่อน/หลังใบ): 10 คำขอ 5 โพรเซส บริการไม่ใช้ห้อง ต่างหมอ เวลาเดียวกัน ⇒ ได้ 10 · ไม่มี throw", () => { const os = outsOf("X0"); noThrow(os); eq(okN(os), 10, "ok"); });
  await st("X-1", "ห้องเดียว 10 คำขอ (ต่างหมอ · STAFF+ONLINE · 5 โพรเซส) ⇒ ได้ 1 พอดี · ที่เหลือ FULL · ฐานไม่ซ้อน", async () => {
    const os = outsOf("X1"); noThrow(os);
    eq(okN(os), 1, `ok (${fmt(os.map((o) => o.code ?? "OK"))})`);
    ok(os.filter((o) => !o.ok).every((o) => o.code === "FULL" || o.code === "BUSY"), `รหัส ${fmt(os.map((o) => o.code))}`);
    eq(await resViolations(ids.uX1), [], "ฐาน");
  });
  await st("X-2", "ความจุ 3 · 10 คำขอพร้อมกัน ⇒ ได้ 3 พอดี · ฐานไม่เกินความจุ", async () => {
    const os = outsOf("X2"); noThrow(os); eq(okN(os), 3, `ok (${fmt(os.map((o) => o.code ?? "OK"))})`); eq(await resViolations(ids.uX2), [], "ฐาน");
  });
  await st("X-3", "ผสม 10 ทาง (จอง 4 · walk-in 3 · เช็กอิน 2 · runPlanner วน 5) บนหน่วยแถวเดียว 2 ห้อง ⇒ ไม่มี throw · เช็กอินได้ทั้ง 2 · walk-in ได้ทั้ง 3 · จอง 10:30 ได้ ≤ 1 · หลัง runPlanner อีกรอบ ฐานไม่เกินความจุ/หมอไม่ซ้อน", async () => {
    const os = outsOf("X3"); noThrow(os);
    eq(okN(os, "checkIn"), 2, `เช็กอิน ${fmt(os.filter((o) => o.fn === "checkIn"))}`);
    eq(okN(os, "walkIn"), 3, `walk-in ${fmt(os.filter((o) => o.fn === "walkIn").map((o) => o.code ?? "OK"))}`);
    ok(okN(os, "book") <= 1, `จอง ${okN(os, "book")}`);
    eq(await resViolations(ids.uX3), [], "ฐานหลังยิง");
    await RN().runPlanner(cX(ids.uX3), { now: new Date(NOW_X) });
    eq(await resViolations(ids.uX3), [], "ฐานหลัง runPlanner");
    eq(await staffOverlap(ids.uX3), [], "หมอ");
  });
  await st("X-4", "ร้านเลื่อน 5 นัด ∥ จองใหม่ 5 ไปห้องเดียวเวลาเดียวกัน (18:00) ⇒ สำเร็จรวม 1 พอดี · ฐานไม่ซ้อน", async () => {
    const os = outsOf("X4"); noThrow(os); eq(okN(os), 1, `ok (${fmt(os.map((o) => `${o.fn}:${o.code ?? "OK"}`))})`); eq(await resViolations(ids.uX4), [], "ฐาน");
  });
  await st("X-5", "ลดความจุ 2→1 ∥ จอง 9 ทาง ⇒ ความจุสุดท้ายไม่ถูกละเมิด: ลดสำเร็จ ⇒ จองได้ 1 · ลดไม่ได้ (IN_USE) ⇒ จองได้ 2", async () => {
    const os = outsOf("X5"); noThrow(os);
    const up = os.find((o) => o.fn === "resUpdate")!;
    const books = okN(os, "book");
    if (up.ok) eq(books, 1, "ลดสำเร็จ"); else { eq(up.code, "IN_USE", "รหัสลด"); eq(books, 2, "ลดไม่สำเร็จ"); }
    eq(await resViolations(ids.uX5), [], "ฐาน");
  });
  await st("X-6", "ทางเดิม createAppointment 5 ∥ bookAppointment 5 ห้องเดียวเวลาเดียวกัน ⇒ ได้รวม 1 พอดี · ฐานไม่ซ้อน", async () => {
    const os = outsOf("X6"); noThrow(os); eq(okN(os), 1, `ok (${fmt(os.map((o) => `${o.fn}:${o.ok ? "OK" : o.code}`))})`); eq(await resViolations(ids.uX6), [], "ฐาน");
  });
  await st("X-7", "ปิดซ่อม 13:00–16:00 ∥ จอง 9 ทาง 14:00 ⇒ ปิดซ่อมสำเร็จ ⇒ ไม่มีนัดในช่วง · ปิดซ่อมไม่ได้ (IN_USE) ⇒ มีนัด 1 พอดี", async () => {
    const os = outsOf("X7"); noThrow(os);
    const m = os.find((o) => o.fn === "resMaint")!;
    const books = okN(os, "book");
    if (m.ok) eq(books, 0, "ปิดซ่อมสำเร็จแต่มีนัดในช่วง"); else { eq(m.code, "IN_USE", "รหัส"); eq(books, 1, "จอง"); }
    eq(await resViolations(ids.uX7), [], "ฐาน");
  });
  await st("X-8", "ทุกฉาก X: หมอไม่ซ้อนในฐาน · รหัสล้มอยู่ในชุดที่สัญญาระบุ (FULL · BUSY · IN_USE · CLASH · WALKIN_CLOSED · LEGACY_FAIL)", async () => {
    for (const u of XU) eq(await staffOverlap(u), [], `หมอ ${u.slice(-8)}`);
    const codes = [...(xOut?.values() ?? [])].flat().filter((o) => !o.ok).map((o) => o.code ?? "THREW");
    ok(xOut !== null, `สายยิงพร้อมกันไม่ทำงาน: ${xErr}`);
    const badC = codes.filter((c) => !["FULL", "BUSY", "IN_USE", "CLASH", "WALKIN_CLOSED", "LEGACY_FAIL"].includes(c));
    ok(badC.length === 0, `รหัสนอกสัญญา ${fmt(badC)}`);
  }, "MAJOR");
  await st("X-9", "deadlock ของฐาน (pg_stat_database.deadlocks) ไม่ขยับตลอดฉาก X (ลำดับล็อก §5 · ลองใหม่ภายในไม่นับเป็นข้อแก้ตัว)", async () => {
    ok(Number.isFinite(dlBase), "ตัวควบคุม X-dc ไม่ผ่าน — วัดไม่ได้");
    ok(xOut !== null, `สายยิงพร้อมกันไม่ทำงาน: ${xErr}`);
    await sleep(12_000);
    const c = await readDeadlocks();
    eq(c - dlBase, 0, "deadlock เพิ่ม");
  });

  // ═══════════════ Q ฉาก svcqc ═══════════════
  console.log("\n── Q: ฉากร้าน svcqc (scripts/svc-qc-resource-scene.mts) ──");
  const UM = SQC.units.massage.id;
  const svcStaff = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "BookingStaff" WHERE "tenantId" = $1 AND "unitId" = $2 AND active`, [SQC.tenant.id, UM]))[0].n;
  const runTsx = (file: string, args: string[] = []) => {
    const r = spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
    let sum: { created?: number; updated?: number; removed?: number } | null = null;
    try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
    return { status: r.status, out, sum };
  };
  const shopRows = async () => JSON.stringify(await q(`SELECT key, scope, "scopeId", value::text AS v, "effectiveFrom" FROM "SettingValue" WHERE "tenantId" = $1 AND scope IN ('TENANT','UNIT') ORDER BY key, scope, "scopeId", "effectiveFrom"`, [SQC.tenant.id]));
  if (svcStaff !== SQC.massage.staff.length) {
    for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "ทรัพยากรบน svcqc ตรงภาพ 12"], ["Q-3", "รันซ้ำไม่เขียน"], ["Q-4", "ไม่แตะค่าตั้งชั้นร้าน/สาขา"]]) skip(id, n, `ร้าน svcqc หน่วยนวดมีหมอ ${svcStaff} (ต้อง ${SQC.massage.staff.length}) — รัน scripts/seed-svc-qc.mts ก่อน`, "MAJOR");
  } else {
    const before = await shopRows();
    await st("Q-1", "ฉาก svcqc รันได้ (exit 0) · SCENE_SUMMARY {created,updated,removed}", () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const r = runTsx(F.scene);
      ok(r.status === 0 && !!r.sum && ["created", "updated", "removed"].every((k) => typeof (r.sum as Record<string, unknown>)[k] === "number"), `exit=${r.status} ${r.sum ? fmt(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`);
    }, "MAJOR");
    await st("Q-2", `svcqc หน่วยนวด: ทรัพยากร ${SQC_RESOURCE_SCENE.expect.total} ชิ้นตาม SQC_RESOURCE_SCENE (ชนิด/ความจุ/เวลาเก็บ) · เตียง 5 ปิดซ่อมตอนนี้ · บริการประกาศชนิดตามภาพ 11`, async () => {
      const L = await RS.list()({ tenantId: SQC.tenant.id, unitId: UM });
      const want = SQC_RESOURCE_SCENE.resources.map((r) => [r.id, r.name, r.kind, r.capacity, r.cleanupMin]).sort();
      eq(L.map((r) => [r.id, r.name, r.kind, r.capacity, r.cleanupMin]).sort(), want, "ทรัพยากร");
      eq(L.filter((r) => r.underMaintenanceNow).map((r) => r.id), [SQC_RESOURCE_SCENE.maintenance[0].resourceId], "ปิดซ่อมตอนนี้");
      const svc = await q<{ id: string; name: string }>(`SELECT id, name FROM "BookingService" WHERE "tenantId" = $1 AND "unitId" = $2 AND active`, [SQC.tenant.id, UM]);
      for (const [name, kinds] of Object.entries(SQC_RESOURCE_SCENE.serviceKinds)) {
        const s = svc.find((x) => x.name === name);
        ok(!!s, `ไม่มีบริการ ${name}`);
        const v = await SETTINGS().resolveSettings({ tenantId: SQC.tenant.id }, [KEY_KINDS], { unitId: UM, serviceId: s!.id });
        eq(v[KEY_KINDS]?.value, kinds, `ชนิดของ ${name}`);
      }
    }, "MAJOR");
    await st("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const r = runTsx(F.scene);
      ok(r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${fmt(r.sum)}`);
    }, "MAJOR");
    await st("Q-4", "ฉากไม่แตะค่าตั้งชั้น TENANT/UNIT ของ svcqc (แถวก่อน = หลัง) — อยู่ร่วมกับฉากอื่นได้", async () => { ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`); eq(await shopRows(), before, "SettingValue ชั้นร้าน/สาขา"); }, "MAJOR");
  }

  // ═══════════════ V ภาพ ═══════════════
  console.log("\n── V: ภาพ (จอง 12 ส่วนทรัพยากร · 11 คอลัมน์ต้องใช้) ──");
  {
    const specs = SQC_VISUAL_SPECS["b.13"];
    const name = "ภาพ b.13 (booking-staff-resources · booking-services-resources) 1440 · HTTP < 400 · ไม่ล้นแนวนอน · ไม่มี page error";
    if (!Array.isArray(specs) || specs.length !== 2) record("V-1", name, "FAIL", `SQC_VISUAL_SPECS b.13 ${fmt(specs)}`, "MAJOR");
    else if (!BASE) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC + reseed + ฉาก B.11 + ฉาก B.13 แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "b.13", "--user", "owner", "--base", BASE], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) record("V-1", `${name} (ภาพ .qc-shots/svc/b.13 — ผู้คุมเทียบ PARITY กับจอง 12/11)`, "PASS", "", "MAJOR");
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
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b13-*` 0 · นัด/บัตร/ทรัพยากร/ค่าตั้ง/audit/outbox ของร้านทดสอบ 0 · ผู้ใช้ทดสอบ 0 (ฉาก svcqc คงไว้ให้ถ่ายภาพ)", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "QueueTicket", "SvcResource", "SettingValue", "AuditLog", "OutboxEvent", "BookingStaff"]) {
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
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, QC_B13_CHILD: JSON.stringify(spec) }, stdio: ["ignore", "pipe", "pipe"] });
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
function tms(d: Date | null | undefined): number | null { return d ? new Date(d).getTime() : null; }

// ═══════════════ SF. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── SF: ไฟล์ · สัญญาโค้ด ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const diffLines = (rel: string) => (spawnSync("git", ["diff", "-U0", "HEAD", "--", rel], { cwd: ROOT, encoding: "utf8" }).stdout ?? "").split("\n").filter((l) => /^[+-](?![+-])/.test(l));
const OWN = new Set<string>([F.res, F.kinds, F.planner, F.service, F.line, F.run, F.index, F.model, F.access, F.settingsSvc, F.defs, F.actions, F.pageStaff, F.shared, F.comp, F.compServices, F.scene,
  "src/components/booking/settings/BookingStaffSettings.tsx", "src/app/app/u/[unitSlug]/booking/services/page.tsx",
  /* ORACLE-EDIT (ผู้คุม 31 ต.ค. · b13-SF1) มติ R1 migration + scope ลงทะเบียน model ใหม่ */ "prisma/schema/booking.prisma", "prisma/migrations/20261225000000_svc_b13/migration.sql", "src/lib/core/scope.ts"]);
{
  const ch = dirty(["src", "prisma", "scripts"]).filter((f) => !f.startsWith("scripts/") || f === F.scene);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.res}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("SF-1", "แตะเฉพาะไฟล์ของใบ", "B.13 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (accept-time)");
  else await st("SF-1", "แตะเฉพาะไฟล์ของใบ (ใบสั่ง §1 · planner-*.ts ใหม่ได้) · ไฟล์ใหม่ครบ (resources · resource-kinds · BookingResources · ฉาก)", () => {
    const outside = ch.filter((f) => !OWN.has(f) && !/^src\/lib\/modules\/booking\/planner-[a-z0-9-]+\.ts$/.test(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = [F.res, F.kinds, F.comp, F.scene].filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
// ORACLE-EDIT (ผู้คุม 31 ต.ค. · b13-R1) — มติ R1 ทาง A: migration เพิ่มอย่างเดียว svc_b13 (ตาราง SvcResourceBlock) + schema booking.prisma เท่านั้น ·
//   prisma/ แตะได้เฉพาะ 2 ไฟล์นี้ · migration ต้องไม่มี DROP/RENAME/ALTER ตารางเดิม · สร้างตาราง SvcResourceBlock · schema แก้แบบเพิ่มบรรทัดเท่านั้น
const B13_MIG = "prisma/migrations/20261225000000_svc_b13/migration.sql";
await st("SF-2", "prisma/ แตะเฉพาะ migration svc_b13 (เพิ่มอย่างเดียว · SvcResourceBlock) + booking.prisma (เพิ่มบรรทัดเท่านั้น) — มติ R1 ทาง A", () => {
  const touched = dirty(["prisma"]);
  const outside = touched.filter((f) => f !== B13_MIG && f !== "prisma/schema/booking.prisma" && f !== "prisma/migrations/20261225000000_svc_b13/");
  eq(outside, [], "prisma/ นอกมติ R1");
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${B13_MIG}`]); return true; } catch { return false; } })();
  const sql = stripComments(src(B13_MIG)).replace(/--.*$/gm, "");
  ok(headHas || /CREATE TABLE "SvcResourceBlock"/.test(sql), `ไม่มี migration svc_b13 (${B13_MIG})`);
  ok(!/\bDROP\b|\bRENAME\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/i.test(sql), "migration มีคำสั่งทำลาย/แก้ข้อมูล");
  const alters = [...sql.matchAll(/ALTER\s+TABLE\s+"([^"]+)"/gi)].map((m) => m[1]);
  ok(alters.every((t) => t === "SvcResourceBlock"), `ALTER ตารางเดิม ${fmt(alters)}`);
  const removed = diffLines("prisma/schema/booking.prisma").filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
  eq(removed, [], "booking.prisma ลบ/แก้บรรทัดเดิม");
});
await st("SF-3", "core-fix settings/service.ts: เพิ่มบรรทัดเท่านั้น (≤ 3 บรรทัดแก้ เช่น SUPPORTED_SCOPES) · บรรทัดเพิ่มเกี่ยว RESOURCE/svcResource/resourceId · ไม่แตะ actions/template/form/types/registry", () => {
  eq(dirty(["src/lib/core/settings/actions.ts", "src/lib/core/settings/template.ts", "src/lib/core/settings/form.ts", "src/lib/core/settings/types.ts", "src/lib/core/settings/registry.ts"]), [], "ไฟล์เครื่องยนต์อื่น");
  const lines = diffLines(F.settingsSvc);
  if (lines.length === 0) { ok(/SUPPORTED_SCOPES[^\n]*RESOURCE/.test(src(F.settingsSvc)), "ยังไม่มี core-fix (SUPPORTED_SCOPES ไม่มี RESOURCE)"); return; }
  const removed = lines.filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
  ok(removed.length <= 3 && removed.every((l) => /SUPPORTED_SCOPES|Promise\.all|const \[|ชั้นที่มีตาราง/.test(l)), `ลบ/แก้ ${removed.length} บรรทัด: ${removed[0]?.slice(0, 100)}`);
  const off = lines.filter((l) => l.startsWith("+")).map((l) => l.slice(1).trim()).filter((l) => l && !/^(\/\/|\*|\/\*)/.test(l) && !/^[{}()[\];,.]+$/.test(l) && !/RESOURCE|svcResource|resourceId|\bres\b|resources?\b|jobs\.push\(|Promise\.all|^const \[/i.test(l));
  ok(off.length === 0, `บรรทัดเพิ่มที่ไม่เกี่ยว RESOURCE: ${off.slice(0, 2).join(" | ").slice(0, 160)}`);
}, "CRITICAL");
await st("SF-4", "defs/booking.ts: เพิ่มอย่างเดียว (คีย์ resourceKinds + ป้าย/กลุ่ม) · ไม่ลบ/แก้ def เดิม (ยกเว้นบรรทัดคอมเมนต์เรื่องชั้น RESOURCE)", () => {
  const removed = diffLines(F.defs).filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
  ok(removed.every((l) => /^-\s*\/\/.*(RESOURCE|ทรัพยากร|SUPPORTED_SCOPES|B\.13)/.test(l)), `ลบ/แก้: ${removed.slice(0, 2).join(" | ").slice(0, 160)}`);
}, "MAJOR");
await st("SF-5", "resources.ts: ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/…) · ไม่มีตัวกันในหน่วยความจำ · ล็อก SvcResource เรียง id ทุกจุด (Q7) (resources/service/queue-line/planner-run) · checkIn (queue-line) ไม่ล็อก SvcResource/BookingStaff หลังแถวนัด", () => {
  const r = stripComments(src(F.res));
  ok(!!r, `ยังไม่มี ${F.res}`);
  ok(!/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)/.test(r), "เวลาเครื่องดิบ");
  ok(!/new\s+Mutex|async-mutex|new\s+Map<[^>]*Promise/.test(r), "ตัวกันในหน่วยความจำ");
  const bad: string[] = [];
  let any = false;
  for (const f of [F.res, F.service, F.line, F.run]) {
    const s = stripComments(src(f)).replace(/\s+/g, " ");
    for (const m of s.matchAll(/FROM "SvcResource"[^`]*?FOR UPDATE/g)) {
      any = true;
      // ORACLE-EDIT (ผู้คุม 31 ต.ค. · b13-Q7) — มติ Q7: ล็อก SvcResource เรียงตาม id (คงที่แม้แก้ sortOrder ระหว่างจอง · probe P7-flip)
      const ordered = /ORDER BY id FOR UPDATE/.test(m[0]);
      const single = f === F.res && /\bid = \$\{/.test(m[0]); // CRUD ล็อกแถวเดียว (ไม่ถือล็อกช่าง/ทรัพยากรอื่น)
      if (!ordered && !single) bad.push(`${f}: ${m[0].slice(0, 90)}`);
    }
  }
  ok(any, "ไม่พบการล็อก SvcResource … FOR UPDATE เลย");
  ok(bad.length === 0, bad.slice(0, 3).join(" · "));
}, "MAJOR");
await st("SF-6", "ทางจอ: actions (booking-settings.ts) createResourceAction/updateResourceAction/setResourceMaintenanceAction ผ่าน assertBookingActionAllowed · access.ts ผูก booking.settings.edit · หน้า staff เรียก listResources + data-bq-resources · คอมโพเนนต์ client ไม่ import @/lib/modules ค่า/prisma", () => {
  const a = stripComments(src(F.actions));
  for (const n of ["createResourceAction", "updateResourceAction", "setResourceMaintenanceAction"]) {
    const i = a.search(new RegExp(`export\\s+async\\s+function\\s+${n}\\b`));
    ok(i >= 0, `ไม่มี ${n}`);
    ok(/assertBookingActionAllowed|assertBookingAction/.test(a.slice(i, i + 1200)), `${n} ไม่ตรวจสิทธิ์`);
    ok(new RegExp(`${n}\\s*:\\s*\\[\\s*["']booking\\.settings\\.edit["']`).test(src(F.access)), `access.ts ไม่มี ${n}`);
  }
  const p = stripComments(src(F.pageStaff));
  ok(/listResources\s*\(/.test(p), "หน้า staff ไม่เรียก listResources");
  ok(/data-bq-resources/.test(src(F.comp)) || /data-bq-resources/.test(p), "ไม่มี data-bq-resources");
  const c = stripComments(src(F.comp));
  ok(!!c, `ยังไม่มี ${F.comp}`);
  const valueImports = [...c.matchAll(/^\s*import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  ok(!valueImports.some((x) => (x.startsWith("@/lib/modules") && x !== "@/lib/modules/booking/resource-kinds") || x === "@/lib/core/db" || x === "@prisma/client"), `import ${fmt(valueImports)}`);
}, "MAJOR");

// ═══════════════ G. regression ═══════════════
console.log("\n── G: regression (b.2 · b.3 · b.4 · b.5 · b.7 · b.8 · smoke) ──");
const judgeSvc = (allowSkip: (id: string) => boolean, allowFail: (id: string) => boolean = () => false) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed?: string[]; skipped?: string[] };
  return (j.failed ?? []).every(allowFail) && (j.skipped ?? []).every(allowSkip);
};
// ข้อ "ไฟล์ของใบ/ไฟล์ที่ห้ามแตะ" ของชุดเก่า = accept-time ของใบนั้น — แดงได้ระหว่างไฟล์ B.13 ยังไม่ commit (ใบสั่ง §7)
const REG: { s: string; args?: string[]; env?: Record<string, string>; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.2", judge: (out) => { const l = out.split("\n").reverse().find((x) => x.startsWith("JSON_SUMMARY ")); return !!l && (JSON.parse(l.slice(13)) as { findings: string[] }).findings.length === 0; }, note: "93/93 รวม PERF p95 < 50 ms" },
  { s: "qc-svc-b.3", env: { SVC_B3_NO_REGRESSION: "1" }, judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1" || x === "ST-4" /* ORACLE-EDIT (ผู้คุม 31 ต.ค. · b13-G2) ST-4 prisma/ สะอาด = accept-time ขัดมติ R1 */), note: "ไม่มี FAIL ยกเว้น ST-1/ST-4 · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1" || x === "ST-4" || x === "ST-3" /* ORACLE-EDIT (ผู้คุม 31 ต.ค. · b13-G3) ST-3 prisma/ = accept-time ขัดมติ R1 */), note: "ไม่มี FAIL ยกเว้น ST-1/ST-3/ST-4 (planner.ts ถูกแตะโดยใบนี้) · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.5", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|E|V|Q|G)-/.test(x) || x === "S-1", (x) => x === "S-1" || x === "S-2"), note: "ไม่มี FAIL ยกเว้น S-1/S-2 · SKIP เฉพาะ H/E/V/Q/G/S-1" },
  { s: "qc-svc-b.7", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|V|Q|G)-/.test(x) || x === "S-1", (x) => ["S-1", "S-2", "S-3"].includes(x)), note: "ไม่มี FAIL ยกเว้น S-1/S-2/S-3 · SKIP เฉพาะ H/V/Q/G/S-1" },
  { s: "qc-svc-b.8", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|V|Q|G)-/.test(x) || x === "S-1", (x) => ["S-1", "S-2", "S-4"].includes(x)), note: "ไม่มี FAIL ยกเว้น S-1/S-2/S-4 · SKIP เฉพาะ H/V/Q/G/S-1" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof resLoad.mod?.createResource === "function" && typeof resLoad.mod?.walkInNowByService === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (resources.createResource / walkInNowByService) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B13_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b13-reg-${g.s}.log`;
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
console.log(`\n===== QC SVC B.13 · ทรัพยากร (ร้านนวด) =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""} · กลุ่ม ${fmt(groups)}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed · G-* เมื่อ --no-regression · SF-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
