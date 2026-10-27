// Day planner — วางคิวทั้งวันของสาขา (pure · ไม่อ่าน DB/นาฬิกา/ค่าตั้งเอง) · ใบ B.2
// แบบ: ledger/DESIGN-BOOKING-QUEUE.md §4.2 · สัญญา+กติกา: ledger/svc-briefs/svc-brief-b.2.md §3–§4
// เวลาทั้งหมดเป็น epoch ms · ไม่ปัดเวลา (UI ปัดเอง) · ตัวห่อที่อ่าน DB/เขียนแคช = planner-run.ts (ใบ B.4)

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

export type PlanService = { id: string; name: string; durationMin: number; bufferAfterMin: number };

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
};

export type PlanInput = { now: number; settings: PlanSettings; staff: PlanStaff[]; services: PlanService[]; jobs: PlanJob[] };

export type PlanState = "IN_SERVICE" | "SCHEDULED" | "RELEASED_LATE" | "NO_SHOW_DUE" | "UNPLACED";
export type PlanReason =
  | "IN_SERVICE" | "IN_SERVICE_OVERRUN"
  | "BOOKED_ON_TIME" | "BOOKED_DELAYED" | "BOOKED_MOVED_STAFF" | "BOOKED_EARLY" | "STAFF_UNAVAILABLE"
  | "WALKIN_EARLIEST" | "WALKIN_GAP_BEFORE_BOOKING" | "WALKIN_REQUESTED_STAFF" | "LATE_ARRIVAL_AS_WALKIN"
  | "LATE_RELEASED" | "NO_SHOW_DUE" | "NO_SLOT_TODAY" | "UNKNOWN_SERVICE";

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
};
export type Plan = { now: number; jobs: PlannedJob[]; line: string[] };

export type WalkInQuote = {
  staffId: string | null;
  startAt: number | null;
  endAt: number | null;
  waitMin: number | null;
  closed: boolean;
  why: WhyInfo | null;
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
};

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

function run(input: PlanInput, quoteJobId: string | null): Plan {
  const { now, settings } = input;
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
  };
  const jobs = [...input.jobs].sort((a, b) => cmpStr(a.id, b.id));
  const out = new Map<string, PlannedJob>();
  const base = (job: PlanJob): PlannedJob => ({
    jobId: job.id, kind: job.kind, staffId: job.staffId, startAt: null, endAt: null,
    state: "UNPLACED", reason: "NO_SLOT_TODAY", late: false, waitMin: null, etaPlusMinusMin: 0, why: null, overWindow: false,
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
      const t = earliestFit(ctx, s, d, g, now);
      const pulled = t !== null && t < Math.min(job.startAt!, pj.startAt);
      const start = pulled ? t : pj.startAt;
      occupy(ctx, s.id, { jobId: job.id, startAt: start, endAt: start + d, gapAfter: g, booking: true });
      if (pulled) {
        early.add(job.id);
        out.set(job.id, { ...pj, startAt: start, endAt: start + d, reason: "BOOKED_EARLY" });
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
  }

  // 4) walk-in ทีละใบตามลำดับ · ใบก่อนวางก่อนแล้วไม่ถูกขยับ
  queue.sort((a, b) =>
    a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || cmpStr(a.key[3], b.key[3]));
  let boundAny = -Infinity; // backfill ปิด: ห้ามเริ่มก่อนใบก่อนที่เป็น "ใครก็ได้"
  const boundByStaff = new Map<string, number>(); // …หรือที่ขอช่างคนเดียวกัน

  for (const item of queue) {
    const { job, lateArrival, requested } = item;
    const candidates: WhyCandidate[] = [];
    let chosen: { s: PlanStaff; t: number; d: number; g: number; cand: WhyCandidate } | null = null;

    for (const s of ctx.staff) {
      const cand: WhyCandidate = { staffId: s.id, verdict: "NO_FIT", earliestFitAt: null, blockedGap: null };
      candidates.push(cand);
      if (requested !== null && s.id !== requested) cand.verdict = "NOT_REQUESTED";
      else if (!canDo(s, job.serviceId)) cand.verdict = "NOT_QUALIFIED";
      else if (atMaxJobs(ctx, s)) cand.verdict = "MAX_JOBS";
      else {
        const d = durMs(ctx, job, s), g = gapMs(ctx, job, s);
        const lower = settings.backfill ? now : Math.max(now, boundAny, boundByStaff.get(s.id) ?? -Infinity);
        const t = earliestFit(ctx, s, d, g, lower);
        cand.earliestFitAt = t;
        cand.blockedGap = blockedGapOf(ctx, s, d, g, t);
        if (t !== null) {
          cand.verdict = "LATER";
          if (!chosen || t < chosen.t) chosen = { s, t, d, g, cand }; // เท่ากัน = คนแรกตาม sortOrder/id
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
  const pj = run({ ...input, jobs: [...input.jobs, ghost] }, QUOTE_JOB_ID).jobs.find((j) => j.jobId === QUOTE_JOB_ID);
  const startAt = pj?.startAt ?? null;
  const waitMin = pj?.waitMin ?? null;
  return {
    staffId: startAt === null ? requested : (pj?.staffId ?? null),
    startAt,
    endAt: pj?.endAt ?? null,
    waitMin,
    closed: startAt === null || (waitMin !== null && waitMin > input.settings.walkInMaxWaitMin),
    why: pj?.why ?? null,
  };
}
