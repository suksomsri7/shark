// Day planner — วางคิวทั้งวันของสาขา (pure · ไม่อ่าน DB/นาฬิกา/ค่าตั้งเอง) · ใบ B.2
// แบบ: ledger/DESIGN-BOOKING-QUEUE.md §4.2 · สัญญา+กติกา: ledger/svc-briefs/svc-brief-b.2.md §3–§4
// เวลาทั้งหมดเป็น epoch ms · ไม่ปัดเวลา (UI ปัดเอง) · ตัวห่อที่อ่าน DB/เขียนแคช = planner-run.ts (ใบ B.4)
// SVC B.13 ▸ ทรัพยากร (ห้อง/เตียง/อุปกรณ์) แบบ optional — ไม่ส่ง resources / บริการไม่ประกาศชนิด ⇒ ผลเดิมของ B.2 ทุกไบต์ (FZ-4)
//   ด่าน "ว่างไหม" = planner-resources.ts (สูตรเดียวกับทางจองในฐาน) ◂
import { factsByKind, ResBook, uniqKinds, type GateResource } from "./planner-resources";

// ───────────────────────── สัญญา ─────────────────────────

export type PlanJobStatus =
  | "PENDING" | "CONFIRMED" | "ARRIVED" | "QUEUED" | "IN_SERVICE" | "LATE" | "DONE" | "NO_SHOW" | "CANCELLED";

export type PlanSettings = {
  queueOrder: "SINGLE_LINE" | "APPOINTMENT_FIRST"; // #38 แถวเดียวตามเวลา | นัดก่อนเสมอ
  backfill: boolean; // #39 walk-in แทรกช่องเล็ก
  safetyBeforeBookingMin: number; // #40 เผื่อก่อนนัดถัดไป
  graceMin: number; // #27
  noShowAfterMin: number; // #29
  lateAction: "RELEASE" | "HOLD"; // #28
  priorityEnabled: boolean; // #45
  walkInMaxWaitMin: number; // #41 ใช้ใน quoteWalkIn เท่านั้น
  overrunExtendMin: number; // §4.2 งานเลยเวลา = ยืดถึง now + ค่านี้
  minBreakMin: number; // #9 ระดับสาขา
  maxJobsPerDay: number | null; // #8 ระดับสาขา · null = ไม่จำกัด
};

export type PlanStaff = {
  id: string;
  name: string;
  sortOrder: number;
  windows: { startAt: number; endAt: number }[]; // หน้าต่างทำงานวันนี้ (หักลา/ปิดแล้ว) · [] = ไม่ทำงาน
  services: { serviceId: string; durationMin?: number }[] | null; // null = ทำทุกบริการ
  minBreakMin?: number;
  maxJobsPerDay?: number | null;
};

export type PlanService = {
  id: string;
  name: string;
  durationMin: number;
  bufferAfterMin: number;
  resourceKinds?: string[]; // SVC B.13 ▸ ชนิดที่ต้องใช้ (ไม่ส่ง/[] = ไม่ใช้ทรัพยากร) ◂
};

/** SVC B.13 ▸ ทรัพยากรของสาขา (active เท่านั้น · blocks = ช่วงปิดซ่อมที่ตัดเฉพาะวันนั้น) · rank = ลำดับจากฐาน (sortOrder, createdAt, id) ถ้ามี ◂ */
export type PlanResource = {
  id: string;
  kind: string;
  name: string;
  sortOrder: number;
  capacity: number; // ≥ 1
  cleanupMin: number; // เก็บห้องหลังจบบริการ — กินทรัพยากร ไม่กินหมอ
  blocks: { startAt: number; endAt: number }[];
  rank?: number;
};

export type PlanJob = {
  id: string;
  label: string;
  kind: "BOOKED" | "WALKIN";
  status: PlanJobStatus;
  serviceId: string;
  durationMin?: number; // ระบุ = ชนะทุกชั้น
  assignMode: "SPECIFIC" | "ANY";
  staffId: string | null;
  startAt: number | null; // BOOKED = เวลานัด · WALKIN = null
  issuedAt: number;
  checkedInAt: number | null;
  startedAt: number | null;
  priority: boolean;
  policy?: { graceMin?: number; noShowAfterMin?: number; lateAction?: "RELEASE" | "HOLD" }; // snapshot ชนะ settings
  resourceIds?: string[]; // SVC B.13 ▸ นัด = ที่ถืออยู่ในฐาน (ข้อเท็จจริง) · walk-in = ไม่ผูกมัด ◂
};

export type PlanInput = { now: number; settings: PlanSettings; staff: PlanStaff[]; services: PlanService[]; jobs: PlanJob[]; resources?: PlanResource[] };

export type PlanState = "IN_SERVICE" | "SCHEDULED" | "RELEASED_LATE" | "NO_SHOW_DUE" | "UNPLACED";
export type PlanReason =
  | "IN_SERVICE" | "IN_SERVICE_OVERRUN"
  | "BOOKED_ON_TIME" | "BOOKED_DELAYED" | "BOOKED_MOVED_STAFF" | "BOOKED_EARLY" | "STAFF_UNAVAILABLE"
  | "WALKIN_EARLIEST" | "WALKIN_GAP_BEFORE_BOOKING" | "WALKIN_REQUESTED_STAFF" | "LATE_ARRIVAL_AS_WALKIN"
  | "LATE_RELEASED" | "NO_SHOW_DUE" | "NO_SLOT_TODAY" | "UNKNOWN_SERVICE"
  | "NO_RESOURCE"; // SVC B.13 ▸ บริการต้องใช้ชนิดที่สาขาไม่มีชิ้นเลย ◂

export type WhyCandidate = {
  staffId: string;
  verdict: "CHOSEN" | "LATER" | "NO_FIT" | "NOT_QUALIFIED" | "NOT_REQUESTED" | "MAX_JOBS";
  earliestFitAt: number | null;
  blockedGap: { freeAt: number; nextBookingAt: number } | null;
};
export type WhyInfo = { candidates: WhyCandidate[]; text: string };

export type PlannedJob = {
  jobId: string;
  kind: "BOOKED" | "WALKIN";
  staffId: string | null;
  startAt: number | null;
  endAt: number | null;
  state: PlanState;
  reason: PlanReason;
  late: boolean;
  waitMin: number | null;
  etaPlusMinusMin: number;
  why: WhyInfo | null;
  overWindow: boolean; // ไม่อยู่ในหน้าต่างทำงานทั้งช่วง (นัดถูกดันเลยปิด · งานกำลังทำที่ยืด · STAFF_UNAVAILABLE)
  resourceIds: string[]; // SVC B.13 ▸ ชิ้นที่ถือ ตามลำดับชนิด ([] = ไม่ใช้) ◂
  resourceShort: boolean; // SVC B.13 ▸ นัดที่ผูกทรัพยากรไม่ได้ (เวลาไม่ขยับ · ร้านเห็นบนจอ B.14) ◂
};
export type Plan = { now: number; jobs: PlannedJob[]; line: string[] };

export type WalkInQuote = {
  staffId: string | null;
  startAt: number | null;
  endAt: number | null;
  waitMin: number | null;
  closed: boolean;
  why: WhyInfo | null;
  resourceIds: string[]; // SVC B.13
  limitedBy: "NONE" | "STAFF" | "RESOURCE" | "BOTH"; // SVC B.13 ▸ §4.7 ◂
};

// ───────────────────────── ค่าคงที่ ─────────────────────────

const MIN = 60_000;
const BKK_OFFSET_MS = 7 * 60 * MIN; // ไทยไม่มี DST
const GAP_WORTH_MENTION_MS = 10 * MIN; // ช่องสั้นกว่านี้ไม่นับว่า "ว่าง" ในกล่องทำไม (§7 ข้อ 3)
const QUOTE_JOB_ID = "\u0000quote"; // งานสมมติของ quoteWalkIn — id ชนกับงานจริงไม่ได้

// ───────────────────────── ชนิดภายใน ─────────────────────────

/** ช่วงที่ช่างไม่ว่าง · booking = นับเป็นนัดในกติกาเผื่อ (นัดล็อก/BOOKED_EARLY ใช่ · walk-in/มาสาย/กำลังทำ ไม่ใช่) */
type Slot = { jobId: string; startAt: number; endAt: number; gapAfter: number; booking: boolean };

type Ctx = {
  now: number;
  settings: PlanSettings;
  staff: PlanStaff[]; // เรียง sortOrder แล้ว id
  staffById: Map<string, PlanStaff>;
  svcById: Map<string, PlanService>;
  timeline: Map<string, Slot[]>; // ต่อช่าง เรียง startAt เสมอ
  doneCount: Map<string, number>;
  kindsBy: Map<string, string[]>; // SVC B.13 ▸ ชนิดที่บริการต้องใช้ ◂
  book: ResBook | null; // SVC B.13 ▸ null = ไม่มีบริการไหนประกาศชนิด (ทาง B.2 เดิมทุกไบต์) ◂
};

/** SVC B.13 ▸ ข้อมูลประกอบ limitedBy ของงานสมมติ (quoteWalkIn) ◂ */
type QuoteInfo = { staffNow: boolean; resNow: boolean; missingKind: boolean };

type QueueItem = { job: PlanJob; lateArrival: boolean; requested: string | null; key: [number, number, number, string] };

// ───────────────────────── ตัวช่วย ─────────────────────────

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** HH:MM เวลากรุงเทพ จาก epoch ms */
function hhmm(ms: number): string {
  const m = (((Math.floor((ms + BKK_OFFSET_MS) / MIN)) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** เรียง+รวมหน้าต่างที่ซ้อน/ต่อกันพอดี · ตัดช่วงว่างเปล่า — ผลไม่ขึ้นกับลำดับที่ส่งมา */
function mergeWindows(windows: PlanStaff["windows"]): PlanStaff["windows"] {
  const sorted = windows.filter((w) => w.endAt > w.startAt).sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt);
  const out: PlanStaff["windows"] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.startAt <= last.endAt) last.endAt = Math.max(last.endAt, w.endAt);
    else out.push({ startAt: w.startAt, endAt: w.endAt });
  }
  return out;
}

function canDo(staff: PlanStaff, serviceId: string): boolean {
  return staff.services === null || staff.services.some((s) => s.serviceId === serviceId);
}

/** นาทีบริการ: งานระบุเอง > เวลาเฉพาะช่าง > เวลาบริการ */
function durMs(ctx: Ctx, job: PlanJob, staff: PlanStaff | undefined): number {
  const perStaff = staff?.services?.find((s) => s.serviceId === job.serviceId)?.durationMin;
  return (job.durationMin ?? perStaff ?? ctx.svcById.get(job.serviceId)?.durationMin ?? 0) * MIN;
}

/** ช่องหลังงาน = max(buffer หลังบริการ, พักขั้นต่ำ) — ไม่บวกกัน (§7 ข้อ 4) */
function gapMs(ctx: Ctx, job: PlanJob, staff: PlanStaff): number {
  const buffer = ctx.svcById.get(job.serviceId)?.bufferAfterMin ?? 0;
  return Math.max(buffer, staff.minBreakMin ?? ctx.settings.minBreakMin) * MIN;
}

/** ค่าตั้งที่ใช้กับงานนี้ — snapshot ตอนจองชนะค่าตั้งปัจจุบัน */
function policyOf(settings: PlanSettings, job: PlanJob) {
  return {
    graceMs: (job.policy?.graceMin ?? settings.graceMin) * MIN,
    noShowMs: (job.policy?.noShowAfterMin ?? settings.noShowAfterMin) * MIN,
    lateAction: job.policy?.lateAction ?? settings.lateAction,
  };
}

function inWindow(staff: PlanStaff, start: number, end: number): boolean {
  return staff.windows.some((w) => start >= w.startAt && end <= w.endAt);
}

function slotsOf(ctx: Ctx, staffId: string): Slot[] {
  let xs = ctx.timeline.get(staffId);
  if (!xs) {
    xs = [];
    ctx.timeline.set(staffId, xs);
  }
  return xs;
}

function occupy(ctx: Ctx, staffId: string, slot: Slot): void {
  const xs = slotsOf(ctx, staffId);
  let k = xs.length;
  while (k > 0 && (xs[k - 1].startAt > slot.startAt || (xs[k - 1].startAt === slot.startAt && cmpStr(xs[k - 1].jobId, slot.jobId) > 0))) k--;
  xs.splice(k, 0, slot);
}

function release(ctx: Ctx, staffId: string, jobId: string): void {
  const xs = slotsOf(ctx, staffId);
  const k = xs.findIndex((x) => x.jobId === jobId);
  if (k >= 0) xs.splice(k, 1);
}

function atMaxJobs(ctx: Ctx, staff: PlanStaff): boolean {
  const max = staff.maxJobsPerDay !== undefined ? staff.maxJobsPerDay : ctx.settings.maxJobsPerDay;
  if (max === null) return false;
  return (ctx.doneCount.get(staff.id) ?? 0) + slotsOf(ctx, staff.id).length >= max;
}

/** ลงงานยาว d (ช่องหลัง g) ที่ t บนช่างนี้ได้ไหม — กติกาเดียวกับ walk-in (ใบสั่ง §4 ข้อ 4) */
function fitsAt(ctx: Ctx, staff: PlanStaff, slots: Slot[], t: number, d: number, g: number): boolean {
  if (!inWindow(staff, t, t + d)) return false;
  const safety = ctx.settings.safetyBeforeBookingMin * MIN;
  for (const x of slots) {
    if (x.startAt <= t) {
      if (x.endAt + x.gapAfter > t) return false; // ยังไม่พ้นงานก่อนหน้า + ช่องหลังงาน
    } else if (t + d + g > x.startAt - (x.booking ? safety : 0)) return false; // ชนงานถัดไป (นัด = เผื่อเพิ่ม)
  }
  return true;
}

/** เวลาเริ่มจริงของนัดบนช่าง: ≥ from และพ้นงานที่ค้างอยู่ + ช่องหลังงานนั้น · ไม่ทับงานที่เริ่มทีหลัง */
function startAfterBusy(ctx: Ctx, staff: PlanStaff, from: number, d: number): number {
  const slots = slotsOf(ctx, staff.id);
  let start = from;
  for (let moved = true; moved; ) {
    moved = false;
    for (const x of slots) {
      const blocks = x.startAt <= start ? x.endAt + x.gapAfter > start : start + d > x.startAt;
      if (blocks) {
        start = x.endAt + x.gapAfter;
        moved = true;
      }
    }
  }
  return start;
}

/** จุดลงเร็วสุด ≥ lower (ค้นต่อเนื่อง ไม่ปัด 15 นาที) · จุดที่เป็นไปได้มีแค่ lower · ต้นหน้าต่าง · จบงาน+ช่อง */
function earliestFit(ctx: Ctx, staff: PlanStaff, d: number, g: number, lower: number): number | null {
  const slots = slotsOf(ctx, staff.id);
  const points = [lower];
  for (const w of staff.windows) if (w.startAt > lower) points.push(w.startAt);
  for (const x of slots) if (x.endAt + x.gapAfter > lower) points.push(x.endAt + x.gapAfter);
  points.sort((a, b) => a - b);
  for (const t of points) if (fitsAt(ctx, staff, slots, t, d, g)) return t;
  return null;
}

// ───────────────────────── SVC B.13 ▸ ทรัพยากร ─────────────────────────

/** ชนิดที่งานนี้ต้องใช้ (ไม่มีสมุด = ไม่ใช้) */
function kindsOfJob(ctx: Ctx, job: PlanJob): string[] {
  return ctx.book ? (ctx.kindsBy.get(job.serviceId) ?? []) : [];
}

/**
 * ช่วงที่งานที่วางแล้วถือทรัพยากร (ก่อนบวกเวลาเก็บ) — ต้องครอบช่วงที่ฐานนับ (§4.6) เสมอ:
 * นัด = ตั้งแต่ min(เวลานัด, เริ่มตามแผน) ถึง max(ปลายตามแผน, เวลานัด + นาที) ⇒ walk-in ที่วางไม่ทับแถวนัดในฐาน
 */
function holdOf(ctx: Ctx, job: PlanJob, pj: PlannedJob): { s: number; e: number } | null {
  if (pj.startAt === null || pj.endAt === null) return null;
  let s = pj.startAt;
  let e = pj.endAt;
  if (job.kind === "BOOKED" && job.startAt !== null) {
    const st = pj.staffId ? ctx.staffById.get(pj.staffId) : undefined;
    s = Math.min(s, job.startAt);
    e = Math.max(e, job.startAt + durMs(ctx, job, st));
  }
  return { s, e };
}

/**
 * จุดลงเร็วสุด ≥ lower ที่ผ่านทั้งกติกาหมอ (fitsAt) และทรัพยากรครบชนิด (§4 ข้อ 5ค) —
 * จุดผู้สมัคร = จุดของหมอ (lower · ต้นหน้าต่าง · จบงาน+ช่อง) ∪ จุดที่ทรัพยากรเพิ่งว่าง (resPts ≥ lower)
 */
function earliestFitRes(
  ctx: Ctx, staff: PlanStaff, d: number, g: number, lower: number,
  kinds: readonly string[], fixed: ReadonlyMap<string, string>, resPts: readonly number[],
): { t: number; ids: string[] } | null {
  const book = ctx.book!;
  const slots = slotsOf(ctx, staff.id);
  const points = [lower];
  for (const w of staff.windows) if (w.startAt > lower) points.push(w.startAt);
  for (const x of slots) if (x.endAt + x.gapAfter > lower) points.push(x.endAt + x.gapAfter);
  for (const t of resPts) if (t > lower) points.push(t);
  points.sort((a, b) => a - b);
  let prev = Number.NaN;
  for (const t of points) {
    if (t === prev) continue;
    prev = t;
    if (!fitsAt(ctx, staff, slots, t, d, g)) continue;
    const ids = book.pick(kinds, t, t + d, { fixed });
    if (ids) return { t, ids };
  }
  return null;
}

/** ช่องแรก (≥ now · ยาว ≥ 10 นาที · ก่อนจุดลงได้) ที่ลงไม่ได้เพราะติดนัดถัดไป — ไว้อธิบายในกล่อง "ทำไม" */
function blockedGapOf(ctx: Ctx, staff: PlanStaff, d: number, g: number, fitAt: number | null): WhyCandidate["blockedGap"] {
  const slots = slotsOf(ctx, staff.id);
  const safety = ctx.settings.safetyBeforeBookingMin * MIN;
  for (const n of slots) {
    if (!n.booking || n.startAt <= ctx.now) continue;
    const win = staff.windows.find((w) => n.startAt >= w.startAt && n.startAt < w.endAt);
    if (!win) continue;
    let freeAt = Math.max(ctx.now, win.startAt);
    for (const x of slots) if (x !== n && x.startAt < n.startAt) freeAt = Math.max(freeAt, x.endAt + x.gapAfter);
    if (n.startAt - freeAt < GAP_WORTH_MENTION_MS) continue;
    if (fitAt !== null && freeAt >= fitAt) return null;
    if (freeAt + d + g > n.startAt - safety) return { freeAt, nextBookingAt: n.startAt };
  }
  return null;
}

/** ช่วงความคลาดเคลื่อน ETA ± นาที = min(30, max(5, ceil(0.15·รอ/5)·5)) · คิดเลขจำนวนเต็มกันทศนิยมเพี้ยน */
function etaSpread(waitMin: number): number {
  return Math.min(30, Math.max(5, Math.ceil((3 * waitMin) / 100) * 5));
}

function waitOf(ctx: Ctx, start: number): number {
  return Math.max(0, Math.round((start - ctx.now) / MIN));
}

// ───────────────────────── แกนวางคิว ─────────────────────────

function run(input: PlanInput, quoteJobId: string | null, quoteInfo?: QuoteInfo): Plan {
  const { now, settings } = input;
  // SVC B.13 ▸ สมุดทรัพยากรเฉพาะเมื่อมีบริการประกาศชนิด (ไม่มี ⇒ ทาง B.2 เดิมทุกไบต์ · FZ-4) ◂
  const kindsBy = new Map(input.services.map((s) => [s.id, uniqKinds(s.resourceKinds)]));
  const useRes = [...kindsBy.values()].some((k) => k.length > 0);
  const resIn: GateResource[] = useRes ? (input.resources ?? []).map((r) => ({ ...r, blocks: r.blocks })) : [];
  const staff = input.staff
    .map((s) => ({ ...s, windows: mergeWindows(s.windows) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || cmpStr(a.id, b.id));
  const ctx: Ctx = {
    now,
    settings,
    staff,
    staffById: new Map(staff.map((s) => [s.id, s])),
    svcById: new Map(input.services.map((s) => [s.id, s])),
    timeline: new Map(),
    doneCount: new Map(),
    kindsBy,
    book: useRes ? new ResBook(resIn) : null,
  };
  const jobs = [...input.jobs].sort((a, b) => cmpStr(a.id, b.id));
  const out = new Map<string, PlannedJob>();
  const base = (job: PlanJob): PlannedJob => ({
    jobId: job.id, kind: job.kind, staffId: job.staffId, startAt: null, endAt: null,
    state: "UNPLACED", reason: "NO_SLOT_TODAY", late: false, waitMin: null, etaPlusMinusMin: 0, why: null, overWindow: false,
    resourceIds: [], resourceShort: false,
  });

  // 1–3) แยกงาน: จบแล้ว · กำลังทำ · นัดล็อก · คิว walk-in
  const locked: { job: PlanJob; late: boolean }[] = [];
  const queue: QueueItem[] = [];
  const enqueue = (job: PlanJob, lateArrival: boolean) => {
    const requested = job.assignMode === "SPECIFIC" ? job.staffId : null;
    const time = job.kind === "BOOKED" ? (job.checkedInAt ?? job.issuedAt) : job.issuedAt;
    const prio = job.priority && settings.priorityEnabled ? 0 : 1;
    queue.push({ job, lateArrival, requested, key: [prio, job.id === quoteJobId ? 1 : 0, time, job.id] });
  };

  for (const job of jobs) {
    if (job.status === "DONE") {
      if (job.staffId) ctx.doneCount.set(job.staffId, (ctx.doneCount.get(job.staffId) ?? 0) + 1);
      continue;
    }
    if (job.status === "NO_SHOW" || job.status === "CANCELLED") continue;

    if (job.status === "IN_SERVICE") {
      // กำลังทำ: จบตามนาทีบริการ · เลยแล้ว ⇒ ยืดถึง now + overrunExtendMin
      const s = job.staffId ? ctx.staffById.get(job.staffId) : undefined;
      const startedAt = job.startedAt ?? job.startAt ?? now;
      let endAt = startedAt + durMs(ctx, job, s);
      const overrun = endAt <= now;
      if (overrun) endAt = now + settings.overrunExtendMin * MIN;
      if (s) occupy(ctx, s.id, { jobId: job.id, startAt: startedAt, endAt, gapAfter: gapMs(ctx, job, s), booking: false });
      out.set(job.id, { ...base(job), startAt: startedAt, endAt, state: "IN_SERVICE", reason: overrun ? "IN_SERVICE_OVERRUN" : "IN_SERVICE" });
      continue;
    }

    if (!ctx.svcById.has(job.serviceId)) {
      // บริการถูกลบ/ไม่รู้จัก — ไม่รู้เวลา จึงไม่วางและไม่กินเวลาช่าง
      out.set(job.id, { ...base(job), reason: "UNKNOWN_SERVICE" });
      continue;
    }

    if (job.kind === "BOOKED" && job.startAt !== null) {
      const pol = policyOf(settings, job);
      const arrived = job.checkedInAt !== null || job.status === "ARRIVED";
      if (!arrived && now >= job.startAt + pol.noShowMs) {
        out.set(job.id, { ...base(job), state: "NO_SHOW_DUE", reason: "NO_SHOW_DUE", late: true });
      } else if (!arrived && (job.status === "LATE" || now >= job.startAt + pol.graceMs)) {
        if (pol.lateAction === "RELEASE") out.set(job.id, { ...base(job), state: "RELEASED_LATE", reason: "LATE_RELEASED", late: true });
        else locked.push({ job, late: true }); // HOLD = ถือช่องเดิมต่อ
      } else if (job.checkedInAt !== null && job.checkedInAt >= job.startAt + pol.graceMs) {
        if (pol.lateAction === "RELEASE") enqueue(job, true); // มาสายเกินผ่อนผัน ⇒ ต่อคิวแบบ walk-in
        else locked.push({ job, late: true });
      } else locked.push({ job, late: false });
      continue;
    }

    enqueue(job, false); // walk-in (และนัดที่ไม่มีเวลา)
  }

  // 3) นัดล็อกเวลา — เรียงตามเวลานัด · walk-in ห้ามทำให้นัดเปลี่ยน จึงวางก่อนทั้งหมด
  locked.sort((a, b) => a.job.startAt! - b.job.startAt! || cmpStr(a.job.id, b.job.id));
  const pendingOn = (staffId: string, from: number) =>
    locked.slice(from).filter((x) => x.job.staffId === staffId);

  const placeLocked = (fixed: Set<string>) => locked.forEach(({ job, late }, idx) => {
    if (fixed.has(job.id)) return;
    const startAt = job.startAt!;
    const s0 = job.staffId ? ctx.staffById.get(job.staffId) : undefined;
    const arrived = job.checkedInAt !== null || job.status === "ARRIVED";
    const placeOn = (s: PlanStaff, start: number, reason: PlanReason) => {
      const endAt = start + durMs(ctx, job, s);
      occupy(ctx, s.id, { jobId: job.id, startAt: start, endAt, gapAfter: gapMs(ctx, job, s), booking: true });
      out.set(job.id, { ...base(job), staffId: s.id, startAt: start, endAt, state: "SCHEDULED", reason, late });
    };

    // เริ่มจริงบนช่างเดิม = max(เวลานัด, now, จบงานก่อนหน้า + ช่องหลังงาน) · ช่างเดิมไม่มีหน้าต่าง/ทำไม่ได้ = คงเวลานัด
    const d0 = durMs(ctx, job, s0);
    const available = !!s0 && canDo(s0, job.serviceId) && inWindow(s0, startAt, startAt + d0);
    const start = s0 && available ? startAfterBusy(ctx, s0, Math.max(startAt, now), d0) : startAt;
    const onTime = available && start === startAt;

    // กติกา 1: ใครก็ได้ที่ยังไม่เช็กอิน + ช่างเดิมทำตรงเวลาไม่ได้ ⇒ ย้ายช่างที่รับได้ตรงเวลา · เวลาไม่เปลี่ยน
    // ช่างใหม่ต้องผ่านกติกาเดียวกับ walk-in (หน้าต่าง · ช่องหลังงานก่อน/หลัง · เผื่อก่อนนัด · โควตา/วัน) รวมนัดของเขาที่ยังไม่วาง
    if (!onTime && job.assignMode === "ANY" && !arrived && startAt >= now) {
      const safety = settings.safetyBeforeBookingMin * MIN;
      for (const s of ctx.staff) {
        if (s === s0 || !canDo(s, job.serviceId) || atMaxJobs(ctx, s)) continue;
        const d = durMs(ctx, job, s), g = gapMs(ctx, job, s);
        if (!fitsAt(ctx, s, slotsOf(ctx, s.id), startAt, d, g)) continue;
        if (pendingOn(s.id, idx + 1).some((x) => startAt + d + g > x.job.startAt! - safety)) continue;
        placeOn(s, startAt, "BOOKED_MOVED_STAFF");
        return;
      }
    }

    if (!s0) {
      // ช่างไม่อยู่ในรายชื่อวันนี้ — คงเวลานัดไว้ ไม่กินเวลาใคร
      out.set(job.id, { ...base(job), startAt, endAt: startAt + d0, state: "SCHEDULED", reason: "STAFF_UNAVAILABLE", late });
      return;
    }
    placeOn(s0, start, !available ? "STAFF_UNAVAILABLE" : start > startAt ? "BOOKED_DELAYED" : "BOOKED_ON_TIME");
  });
  placeLocked(new Set());

  // SVC B.13 ▸ 3.5) ทรัพยากรของงานที่วางแล้ว (กำลังทำ + นัดล็อก) — ข้อเท็จจริงก่อน (ชิ้นที่ถืออยู่ · ล้นได้) แล้วผูกนัดที่ยังไม่มี
  //   ตามลำดับ (เริ่ม, id) · ผูกไม่ได้ ⇒ resourceShort (เวลาไม่ขยับ) · pinned = นัดที่ถูกดึงขึ้นเร็ว (ใช้ชิ้นที่เลือกแล้ว) ◂
  const resOf = new Map<string, string[]>();
  const shortOf = new Set<string>();
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const bookFixed = (pinned: ReadonlyMap<string, string[]>) => {
    if (!ctx.book) return;
    ctx.book = new ResBook(resIn);
    resOf.clear();
    shortOf.clear();
    const placed: { job: PlanJob; pj: PlannedJob; hold: { s: number; e: number } }[] = [];
    for (const pj of out.values()) {
      if (pj.state !== "SCHEDULED" && pj.state !== "IN_SERVICE") continue;
      const job = jobById.get(pj.jobId);
      const hold = job ? holdOf(ctx, job, pj) : null;
      if (job && hold) placed.push({ job, pj, hold });
    }
    // นัดที่ตัววางคิวปล่อยช่อง (สาย/ถึงเวลาไม่มา) ยังถือชิ้นในฐานจนกว่าจะ NO_SHOW/ยกเลิก (§4.6) ⇒ walk-in ห้ามลงทับชิ้นนั้น
    for (const pj of out.values()) {
      if (pj.state !== "RELEASED_LATE" && pj.state !== "NO_SHOW_DUE") continue;
      const job = jobById.get(pj.jobId);
      if (!job || job.startAt === null || !job.resourceIds?.length) continue;
      const st = job.staffId ? ctx.staffById.get(job.staffId) : undefined;
      const e = job.startAt + durMs(ctx, job, st);
      for (const id of new Set(job.resourceIds)) if (ctx.book.get(id)) ctx.book.add(id, job.id, job.startAt, e);
    }
    placed.sort((a, b) => a.hold.s - b.hold.s || cmpStr(a.job.id, b.job.id));
    const need: typeof placed = [];
    for (const x of placed) {
      const kinds = kindsOfJob(ctx, x.job);
      const given = pinned.get(x.job.id) ?? x.job.resourceIds;
      if (!kinds.length) {
        // บริการไม่ประกาศชนิดแต่แถวยังถือชิ้นอยู่ (ประกาศทีหลัง/ถอนทีหลัง) ⇒ นับเป็นข้อเท็จจริง · ผลยังเป็น [] (§4.8)
        for (const id of given ?? []) if (ctx.book.get(id)) ctx.book.add(id, x.job.id, x.hold.s, x.hold.e);
        continue;
      }
      const facts = factsByKind(ctx.book, kinds, given);
      for (const id of facts.values()) ctx.book.add(id, x.job.id, x.hold.s, x.hold.e);
      resOf.set(x.job.id, kinds.flatMap((k) => (facts.has(k) ? [facts.get(k)!] : [])));
      if (facts.size < kinds.length) need.push(x);
    }
    for (const x of need) {
      const kinds = kindsOfJob(ctx, x.job);
      const facts = factsByKind(ctx.book, kinds, pinned.get(x.job.id) ?? x.job.resourceIds);
      const missing = kinds.filter((k) => !facts.has(k));
      const got = ctx.book.pick(missing, x.hold.s, x.hold.e, { prefer: [] });
      if (!got) {
        shortOf.add(x.job.id);
        continue;
      }
      missing.forEach((k, i) => facts.set(k, got[i]));
      for (const id of got) ctx.book.add(id, x.job.id, x.hold.s, x.hold.e);
      resOf.set(x.job.id, kinds.map((k) => facts.get(k)!));
    }
  };
  bookFixed(new Map());

  // 3) นัดก่อนเสมอ: นัดที่มาแล้วดึงขึ้นเร็วได้บนช่างเดิม (ก่อนวาง walk-in ทุกใบ)
  if (settings.queueOrder === "APPOINTMENT_FIRST") {
    const early = new Set<string>();
    for (const { job } of locked) {
      const arrived = job.checkedInAt !== null || job.status === "ARRIVED";
      const pj = out.get(job.id);
      if (!arrived || !pj || pj.startAt === null || pj.staffId === null || pj.reason === "STAFF_UNAVAILABLE") continue;
      const s = ctx.staffById.get(pj.staffId);
      if (!s) continue;
      release(ctx, s.id, job.id);
      const d = durMs(ctx, job, s), g = gapMs(ctx, job, s);
      // SVC B.13 ▸ ดึงขึ้นเร็วได้เมื่อชิ้นที่ถือ (หรือผูกไว้) ว่างที่เวลาใหม่ด้วย · ผูกไม่ได้ (resourceShort) ⇒ ไม่ดึง ◂
      const kinds = kindsOfJob(ctx, job);
      let t: number | null;
      if (kinds.length && ctx.book) {
        if (shortOf.has(job.id)) t = null;
        else {
          const fixed = factsByKind(ctx.book, kinds, resOf.get(job.id));
          ctx.book.remove(job.id);
          const r = earliestFitRes(ctx, s, d, g, now, kinds, fixed, ctx.book.releasePoints(kinds, now));
          t = r ? r.t : null;
        }
      } else t = earliestFit(ctx, s, d, g, now);
      const pulled = t !== null && t < Math.min(job.startAt!, pj.startAt);
      const start = pulled ? t! : pj.startAt;
      occupy(ctx, s.id, { jobId: job.id, startAt: start, endAt: start + d, gapAfter: g, booking: true });
      if (pulled) {
        early.add(job.id);
        out.set(job.id, { ...pj, startAt: start, endAt: start + d, reason: "BOOKED_EARLY" });
      }
      if (kinds.length && ctx.book && !shortOf.has(job.id)) {
        const hold = holdOf(ctx, job, out.get(job.id)!);
        if (hold) for (const id of resOf.get(job.id) ?? []) ctx.book.add(id, job.id, hold.s, hold.e);
      }
    }
    // ช่องเดิมของนัดที่ถูกดึงว่างแล้ว ⇒ วางนัดที่เหลือใหม่ (นัดที่ถูกดันเพราะช่องนั้นจะได้กลับมาตรงเวลา)
    if (early.size > 0) {
      for (const { job } of locked) {
        if (early.has(job.id)) continue;
        const sid = out.get(job.id)?.staffId;
        if (sid) release(ctx, sid, job.id);
      }
      placeLocked(early);
    }
    if (early.size > 0) bookFixed(new Map([...early].map((id) => [id, resOf.get(id) ?? []])));
  }

  // 4) walk-in ทีละใบตามลำดับ · ใบก่อนวางก่อนแล้วไม่ถูกขยับ
  queue.sort((a, b) =>
    a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || cmpStr(a.key[3], b.key[3]));
  let boundAny = -Infinity; // backfill ปิด: ห้ามเริ่มก่อนใบก่อนที่เป็น "ใครก็ได้"
  const boundByStaff = new Map<string, number>(); // …หรือที่ขอช่างคนเดียวกัน

  for (const item of queue) {
    const { job, lateArrival, requested } = item;
    const candidates: WhyCandidate[] = [];
    let chosen: { s: PlanStaff; t: number; d: number; g: number; cand: WhyCandidate; ids: string[] } | null = null;
    // SVC B.13 ▸ ต้องว่างทั้งหมอและทรัพยากร · นัดที่เข้าแถว (มาสาย) ใช้ชิ้นที่ถืออยู่ (ข้อเท็จจริง) · walk-in เลือกใหม่ได้ ◂
    const kinds = kindsOfJob(ctx, job);
    const book = kinds.length ? ctx.book : null;
    const missingKind = !!book && kinds.some((k) => !book.hasKind(k));
    const fixed = book && job.kind === "BOOKED" ? factsByKind(book, kinds, job.resourceIds) : new Map<string, string>();
    const resPts = book && !missingKind ? book.releasePoints(kinds, now) : [];
    if (job.id === quoteJobId && quoteInfo) {
      quoteInfo.missingKind = missingKind;
      const sd = (ctx.svcById.get(job.serviceId)?.durationMin ?? 0) * MIN;
      quoteInfo.resNow = !book || (!missingKind && book.pick(kinds, now, now + sd) !== null);
      quoteInfo.staffNow = !!book && ctx.staff.some((s) =>
        (requested === null || s.id === requested) && canDo(s, job.serviceId) && !atMaxJobs(ctx, s)
        && (settings.backfill ? now : Math.max(now, boundAny, boundByStaff.get(s.id) ?? -Infinity)) === now
        && fitsAt(ctx, s, slotsOf(ctx, s.id), now, durMs(ctx, job, s), gapMs(ctx, job, s)));
    }
    if (missingKind) {
      out.set(job.id, { ...base(job), staffId: requested, late: lateArrival, reason: "NO_RESOURCE" });
      continue;
    }

    for (const s of ctx.staff) {
      const cand: WhyCandidate = { staffId: s.id, verdict: "NO_FIT", earliestFitAt: null, blockedGap: null };
      candidates.push(cand);
      if (requested !== null && s.id !== requested) cand.verdict = "NOT_REQUESTED";
      else if (!canDo(s, job.serviceId)) cand.verdict = "NOT_QUALIFIED";
      else if (atMaxJobs(ctx, s)) cand.verdict = "MAX_JOBS";
      else {
        const d = durMs(ctx, job, s), g = gapMs(ctx, job, s);
        const lower = settings.backfill ? now : Math.max(now, boundAny, boundByStaff.get(s.id) ?? -Infinity);
        let t: number | null;
        let ids: string[] = [];
        if (book) {
          const r = earliestFitRes(ctx, s, d, g, lower, kinds, fixed, resPts);
          t = r ? r.t : null;
          ids = r ? r.ids : [];
        } else t = earliestFit(ctx, s, d, g, lower);
        cand.earliestFitAt = t;
        cand.blockedGap = blockedGapOf(ctx, s, d, g, t);
        if (t !== null) {
          cand.verdict = "LATER";
          if (!chosen || t < chosen.t) chosen = { s, t, d, g, cand, ids }; // เท่ากัน = คนแรกตาม sortOrder/id
        }
      }
    }

    if (!chosen) {
      out.set(job.id, { ...base(job), staffId: requested, late: lateArrival });
      continue;
    }
    chosen.cand.verdict = "CHOSEN";
    const { s, t, d, g } = chosen;
    const next = slotsOf(ctx, s.id).find((x) => x.startAt > t);
    occupy(ctx, s.id, { jobId: job.id, startAt: t, endAt: t + d, gapAfter: g, booking: false });
    if (book) {
      for (const id of chosen.ids) book.add(id, job.id, t, t + d);
      resOf.set(job.id, chosen.ids);
    }
    if (requested === null) boundAny = Math.max(boundAny, t);
    else boundByStaff.set(requested, Math.max(boundByStaff.get(requested) ?? -Infinity, t));

    const reason: PlanReason = lateArrival ? "LATE_ARRIVAL_AS_WALKIN"
      : requested !== null ? "WALKIN_REQUESTED_STAFF"
      : next?.booking ? "WALKIN_GAP_BEFORE_BOOKING"
      : "WALKIN_EARLIEST";
    out.set(job.id, {
      ...base(job), staffId: s.id, startAt: t, endAt: t + d, state: "SCHEDULED", reason, late: lateArrival,
      why: { candidates, text: whyText(ctx, candidates) },
    });
  }

  // SVC B.13 ▸ ผลทรัพยากรต่องาน ◂
  for (const pj of out.values()) {
    if (pj.state !== "SCHEDULED" && pj.state !== "IN_SERVICE") continue;
    const ids = resOf.get(pj.jobId);
    if (ids) pj.resourceIds = [...ids];
    if (shortOf.has(pj.jobId)) pj.resourceShort = true;
  }

  // 6) ETA · 7) line
  for (const pj of out.values()) {
    const s = pj.staffId ? ctx.staffById.get(pj.staffId) : undefined;
    if (s && pj.startAt !== null && pj.endAt !== null && (pj.state === "SCHEDULED" || pj.state === "IN_SERVICE")) {
      pj.overWindow = !inWindow(s, pj.startAt, pj.endAt);
    }
    if (pj.state !== "SCHEDULED" || pj.startAt === null) continue;
    pj.waitMin = waitOf(ctx, pj.startAt);
    const fuzzy = pj.kind === "WALKIN" || pj.reason === "LATE_ARRIVAL_AS_WALKIN" || pj.reason === "BOOKED_DELAYED";
    pj.etaPlusMinusMin = fuzzy ? etaSpread(pj.waitMin) : 0;
  }
  const issuedOf = new Map(jobs.map((j) => [j.id, j.issuedAt]));
  const planned = [...out.values()].sort((a, b) => cmpStr(a.jobId, b.jobId));
  const line = planned
    .filter((pj) => pj.state === "SCHEDULED")
    .sort((a, b) =>
      a.startAt! - b.startAt! ||
      (a.kind === b.kind ? 0 : a.kind === "BOOKED" ? -1 : 1) ||
      issuedOf.get(a.jobId)! - issuedOf.get(b.jobId)! ||
      cmpStr(a.jobId, b.jobId))
    .map((pj) => pj.jobId);

  return { now, jobs: planned, line };
}

/** ข้อความกล่อง "ทำไม" — ข้ามช่างที่ไม่เข้าเกณฑ์ (ทำไม่ได้/ไม่ได้ขอ/เต็มโควตา) */
function whyText(ctx: Ctx, candidates: WhyCandidate[]): string {
  const parts: string[] = [];
  for (const c of candidates) {
    const name = ctx.staffById.get(c.staffId)?.name ?? c.staffId;
    if (c.verdict === "CHOSEN") parts.push(`${name}เร็วสุด ${hhmm(c.earliestFitAt!)}`);
    else if (c.verdict === "LATER" || c.verdict === "NO_FIT") {
      if (c.blockedGap) parts.push(`${name}ว่าง ${hhmm(c.blockedGap.freeAt)} แต่มีนัด ${hhmm(c.blockedGap.nextBookingAt)}`);
      else if (c.earliestFitAt !== null) parts.push(`${name}ว่าง ${hhmm(c.earliestFitAt)}`);
      else parts.push(`${name}ไม่ว่างวันนี้`);
    }
  }
  return parts.join(" · ");
}

// ───────────────────────── ทางเข้า ─────────────────────────

/** วางคิวทั้งวัน: งานกำลังทำ · นัด · walk-in → ช่าง/เวลา/เหตุผล/ETA + แถวรอ */
export function planDay(input: PlanInput): Plan {
  return run(input, null);
}

/** ถามราคาเวลารอ (ตู้/พนักงาน): วาง walk-in สมมติต่อท้ายลำดับ (เว้นแต่สิทธิ์ก่อน) โดยไม่แตะงานอื่น */
export function quoteWalkIn(
  input: PlanInput,
  req: { serviceId: string; staffId?: string | null; priority?: boolean },
): WalkInQuote {
  const requested = req.staffId ?? null;
  const ghost: PlanJob = {
    id: QUOTE_JOB_ID, label: "", kind: "WALKIN", status: "QUEUED", serviceId: req.serviceId,
    assignMode: requested ? "SPECIFIC" : "ANY", staffId: requested, startAt: null, issuedAt: input.now,
    checkedInAt: null, startedAt: null, priority: req.priority ?? false,
  };
  const info: QuoteInfo = { staffNow: false, resNow: true, missingKind: false };
  const pj = run({ ...input, jobs: [...input.jobs, ghost] }, QUOTE_JOB_ID, info).jobs.find((j) => j.jobId === QUOTE_JOB_ID);
  const startAt = pj?.startAt ?? null;
  const waitMin = pj?.waitMin ?? null;
  // SVC B.13 ▸ §4.7: ได้ทันที ⇒ NONE · ชนิดไม่มีชิ้นเลย ⇒ RESOURCE · หมอว่างทันทีแต่ไม่ได้ทันที ⇒ RESOURCE · หมอไม่ว่าง ⇒ STAFF (ห้องว่าง) / BOTH ◂
  const limitedBy: WalkInQuote["limitedBy"] =
    startAt !== null && startAt === input.now ? "NONE"
      : info.missingKind ? "RESOURCE"
        : info.staffNow ? "RESOURCE"
          : info.resNow ? "STAFF" : "BOTH";
  return {
    staffId: startAt === null ? requested : (pj?.staffId ?? null),
    startAt,
    endAt: pj?.endAt ?? null,
    waitMin,
    closed: startAt === null || (waitMin !== null && waitMin > input.settings.walkInMaxWaitMin),
    why: pj?.why ?? null,
    resourceIds: startAt === null ? [] : [...(pj?.resourceIds ?? [])],
    limitedBy,
  };
}
