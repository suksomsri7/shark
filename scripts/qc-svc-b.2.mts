// qc-svc-b.2.mts — ข้อสอบ oracle ใบ B.2 ตัววางคิว `planDay` (pure · ไม่ต่อ DB)
// ใบสั่ง: ledger/svc-briefs/svc-brief-b.2.md · แบบ: DESIGN-BOOKING-QUEUE §4.2 + ภาพ design-booking/01-today-line.png
// รัน: bash scripts/iso.sh pnpm exec tsx scripts/qc-svc-b.2.mts
// ก่อนมี planner.ts ⇒ แดงทุกข้อด้วยเหตุ "หาโมดูลไม่เจอ" (ตั้งใจ)
// QC_B2_PLANNER_PATH=<ไฟล์> ⇒ ทดสอบไฟล์อื่นแทน (ผู้คุมใช้ตรวจข้อสอบกับตัวอ้างอิง) — ปกติไม่ต้องตั้ง
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

// ───────────────────────── สำเนาสัญญา (ใบสั่ง §3) ─────────────────────────
type PlanJobStatus = "PENDING" | "CONFIRMED" | "ARRIVED" | "QUEUED" | "IN_SERVICE" | "LATE" | "DONE" | "NO_SHOW" | "CANCELLED";
type PlanSettings = {
  queueOrder: "SINGLE_LINE" | "APPOINTMENT_FIRST";
  backfill: boolean;
  safetyBeforeBookingMin: number;
  graceMin: number;
  noShowAfterMin: number;
  lateAction: "RELEASE" | "HOLD";
  priorityEnabled: boolean;
  walkInMaxWaitMin: number;
  overrunExtendMin: number;
  minBreakMin: number;
  maxJobsPerDay: number | null;
};
type PlanStaff = {
  id: string; name: string; sortOrder: number;
  windows: { startAt: number; endAt: number }[];
  services: { serviceId: string; durationMin?: number }[] | null;
  minBreakMin?: number; maxJobsPerDay?: number | null;
};
type PlanService = { id: string; name: string; durationMin: number; bufferAfterMin: number };
type PlanJob = {
  id: string; label: string; kind: "BOOKED" | "WALKIN"; status: PlanJobStatus;
  serviceId: string; durationMin?: number;
  assignMode: "SPECIFIC" | "ANY";
  staffId: string | null; startAt: number | null; issuedAt: number;
  checkedInAt: number | null; startedAt: number | null; priority: boolean;
  policy?: { graceMin?: number; noShowAfterMin?: number; lateAction?: "RELEASE" | "HOLD" };
};
type PlanInput = { now: number; settings: PlanSettings; staff: PlanStaff[]; services: PlanService[]; jobs: PlanJob[] };
type PlanState = "IN_SERVICE" | "SCHEDULED" | "RELEASED_LATE" | "NO_SHOW_DUE" | "UNPLACED";
type PlanReason =
  | "IN_SERVICE" | "IN_SERVICE_OVERRUN"
  | "BOOKED_ON_TIME" | "BOOKED_DELAYED" | "BOOKED_MOVED_STAFF" | "BOOKED_EARLY" | "STAFF_UNAVAILABLE"
  | "WALKIN_EARLIEST" | "WALKIN_GAP_BEFORE_BOOKING" | "WALKIN_REQUESTED_STAFF" | "LATE_ARRIVAL_AS_WALKIN"
  | "LATE_RELEASED" | "NO_SHOW_DUE" | "NO_SLOT_TODAY"
  | "UNKNOWN_SERVICE"; // ORACLE-EDIT B.2-R3 (มติหลังผู้ตรวจ 27 ต.ค.)
type WhyCandidate = {
  staffId: string;
  verdict: "CHOSEN" | "LATER" | "NO_FIT" | "NOT_QUALIFIED" | "NOT_REQUESTED" | "MAX_JOBS";
  earliestFitAt: number | null;
  blockedGap: { freeAt: number; nextBookingAt: number } | null;
};
type WhyInfo = { candidates: WhyCandidate[]; text: string };
type PlannedJob = {
  jobId: string; kind: "BOOKED" | "WALKIN"; staffId: string | null;
  startAt: number | null; endAt: number | null; state: PlanState; reason: PlanReason;
  late: boolean; waitMin: number | null; etaPlusMinusMin: number; why: WhyInfo | null;
  overWindow: boolean; // ORACLE-EDIT B.2-R6
};
type Plan = { now: number; jobs: PlannedJob[]; line: string[] };
type Quote = { staffId: string | null; startAt: number | null; endAt: number | null; waitMin: number | null; closed: boolean; why: WhyInfo | null };
type PlannerModule = {
  planDay: (input: PlanInput) => Plan;
  quoteWalkIn: (input: PlanInput, req: { serviceId: string; staffId?: string | null; priority?: boolean }) => Quote;
};

// ───────────────────────── ตัวนับผล ─────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, name: string, ok: boolean, exp: string, act: string, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : `\n     คาด: ${exp}\n     ได้:  ${act}`}`);
};

// ───────────────────────── โหลดโมดูล ─────────────────────────
const SRC_DEFAULT = "src/lib/modules/booking/planner.ts";
const OVERRIDE = process.env.QC_B2_PLANNER_PATH;
const SRC = OVERRIDE ? resolve(OVERRIDE) : SRC_DEFAULT;
let M: PlannerModule | null = null;
let loadErr = "";
try {
  // path ไฟล์ตรง (alias "@/…" ใช้กับ import แบบตัวแปรไม่ได้ใน tsx) — planner.ts เองยัง import "@/lib/core/quiet-hours" ได้ตามปกติ
  const mod = (await import(pathToFileURL(resolve(SRC)).href as string)) as Partial<PlannerModule>;
  if (typeof mod.planDay !== "function" || typeof mod.quoteWalkIn !== "function") {
    loadErr = "โมดูลไม่ export planDay/quoteWalkIn";
  } else M = mod as PlannerModule;
} catch (e) {
  loadErr = `หาโมดูลไม่เจอ/โหลดไม่ได้ (${SRC}) — ${e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : String(e)}`;
}
if (!M) console.log(`🔴 ${loadErr}\n   (คาดไว้ก่อน builder ทำใบ B.2 — ทุกข้อจะแดงด้วยเหตุนี้)\n`);

const plan = (i: PlanInput): Plan => {
  if (!M) throw new Error(loadErr);
  return M.planDay(i);
};
const quote = (i: PlanInput, r: { serviceId: string; staffId?: string | null; priority?: boolean }): Quote => {
  if (!M) throw new Error(loadErr);
  return M.quoteWalkIn(i, r);
};
const test = (id: string, name: string, fn: () => { ok: boolean; exp: string; act: string }, sev: Sev = "CRITICAL") => {
  try {
    const r = fn();
    chk(id, name, r.ok, r.exp, r.act, sev);
  } catch (e) {
    chk(id, name, false, "ไม่ throw", e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : String(e), sev);
  }
};

// ───────────────────────── เวลา ─────────────────────────
const MIN = 60_000;
const DAY0 = Date.UTC(2026, 9, 31) - 7 * 60 * MIN; // ส. 31 ต.ค. 2569 00:00 เวลาไทย
const T = (hm: string): number => {
  const [h, m] = hm.split(":").map(Number);
  return DAY0 + (h * 60 + m) * MIN;
};
const HM = (ms: number | null | undefined): string =>
  ms == null ? "null" : new Date(ms + 7 * 60 * MIN).toISOString().slice(11, 16);

// ───────────────────────── ตัวสร้าง fixture ─────────────────────────
const BARBER: PlanSettings = {
  queueOrder: "SINGLE_LINE", backfill: true, safetyBeforeBookingMin: 5, graceMin: 10, noShowAfterMin: 30,
  lateAction: "RELEASE", priorityEnabled: false, walkInMaxWaitMin: 120, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null,
};
const CLINIC: PlanSettings = {
  ...BARBER, queueOrder: "APPOINTMENT_FIRST", backfill: false, safetyBeforeBookingMin: 0, graceMin: 15, noShowAfterMin: 60,
  lateAction: "HOLD", priorityEnabled: true, walkInMaxWaitMin: 180,
};
const SVC: PlanService[] = [
  { id: "CUT", name: "ตัดผมชาย", durationMin: 45, bufferAfterMin: 0 },
  { id: "CW", name: "ตัด+สระ", durationMin: 60, bufferAfterMin: 0 },
  { id: "KID", name: "ตัดผมเด็ก", durationMin: 30, bufferAfterMin: 0 },
  { id: "SHAVE", name: "โกน/แต่งหนวด", durationMin: 20, bufferAfterMin: 0 },
  { id: "COLOR", name: "ทำสีผม", durationMin: 90, bufferAfterMin: 0 },
  { id: "PERM", name: "ดัดผม", durationMin: 120, bufferAfterMin: 0 },
];
const ST = (id: string, sortOrder: number, o: Partial<PlanStaff> = {}): PlanStaff => ({
  id, name: o.name ?? id, sortOrder, windows: [{ startAt: T("10:00"), endAt: T("20:00") }], services: null, ...o,
});
const W = (a: string, b: string) => ({ startAt: T(a), endAt: T(b) });
const BK = (id: string, staffId: string, serviceId: string, start: string, o: Partial<PlanJob> = {}): PlanJob => ({
  id, label: id, kind: "BOOKED", status: "CONFIRMED", serviceId, assignMode: "SPECIFIC", staffId,
  startAt: T(start), issuedAt: T("08:00"), checkedInAt: null, startedAt: null, priority: false, ...o,
});
const WK = (id: string, serviceId: string, issued: string, o: Partial<PlanJob> = {}): PlanJob => ({
  id, label: id, kind: "WALKIN", status: "QUEUED", serviceId, assignMode: "ANY", staffId: null,
  startAt: null, issuedAt: T(issued), checkedInAt: null, startedAt: null, priority: false, ...o,
});
const INS = (id: string, staffId: string, serviceId: string, started: string, o: Partial<PlanJob> = {}): PlanJob => ({
  id, label: id, kind: "WALKIN", status: "IN_SERVICE", serviceId, assignMode: "SPECIFIC", staffId,
  startAt: null, issuedAt: T(started) - 5 * MIN, checkedInAt: null, startedAt: T(started), priority: false, ...o,
});
const IN = (now: string, staff: PlanStaff[], jobs: PlanJob[], s: Partial<PlanSettings> = {}, services: PlanService[] = SVC): PlanInput => ({
  now: T(now), settings: { ...BARBER, ...s }, staff, services, jobs,
});
const J = (p: Plan, id: string): PlannedJob => {
  const j = p.jobs.find((x) => x.jobId === id);
  if (!j) throw new Error(`ไม่มีงาน ${id} ในผล`);
  return j;
};
const fmt = (j: PlannedJob | undefined) =>
  j ? `${j.state}/${j.reason} ช่าง=${j.staffId} ${HM(j.startAt)}–${HM(j.endAt)} late=${j.late} wait=${j.waitMin} ±${j.etaPlusMinusMin}` : "ไม่มี";
/** ตรวจงานเดียว: staff · start · (end) · state · reason */
const expect = (p: Plan, id: string, e: { staff?: string | null; start?: string | null; end?: string; state?: PlanState; reason?: PlanReason; late?: boolean; wait?: number | null }) => {
  const j = p.jobs.find((x) => x.jobId === id);
  const exp = `${id}: ${e.state ?? "*"}/${e.reason ?? "*"} ช่าง=${e.staff === undefined ? "*" : e.staff} ${e.start === undefined ? "*" : e.start}${e.end ? `–${e.end}` : ""}${e.late === undefined ? "" : ` late=${e.late}`}${e.wait === undefined ? "" : ` wait=${e.wait}`}`;
  if (!j) return { ok: false, exp, act: `${id}: ไม่มีในผล` };
  const ok =
    (e.staff === undefined || j.staffId === e.staff) &&
    (e.start === undefined || (e.start === null ? j.startAt === null : j.startAt === T(e.start))) &&
    (e.end === undefined || j.endAt === T(e.end)) &&
    (e.state === undefined || j.state === e.state) &&
    (e.reason === undefined || j.reason === e.reason) &&
    (e.late === undefined || j.late === e.late) &&
    (e.wait === undefined || j.waitMin === e.wait);
  return { ok, exp, act: `${id}: ${fmt(j)}` };
};
const all = (...rs: { ok: boolean; exp: string; act: string }[]) => ({
  ok: rs.every((r) => r.ok), exp: rs.map((r) => r.exp).join(" | "), act: rs.map((r) => r.act).join(" | "),
});
const deepFreeze = <V,>(o: V): V => {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
};

// ═════════════════════════ ภาค 0 · ความบริสุทธิ์ (สแกนซอร์ส) ═════════════════════════
test("PURE-1", "planner.ts มีอยู่และไม่ import prisma/db/next/server-only", () => {
  if (!existsSync(SRC)) return { ok: false, exp: `มีไฟล์ ${SRC}`, act: "ไม่มีไฟล์" };
  const s = readFileSync(SRC, "utf8");
  const specs = [...s.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
  const bad = specs.filter((x) => !(x.startsWith("./planner") || x === "@/lib/core/quiet-hours"));
  const useServer = /^\s*["']use server["']/m.test(s);
  return { ok: bad.length === 0 && !useServer, exp: "import เฉพาะ ./planner-* หรือ @/lib/core/quiet-hours · ไม่มี use server", act: `import=${JSON.stringify(specs)} useServer=${useServer}` };
});
test("PURE-2", "ไม่อ่านนาฬิกา/สุ่มเอง (Date.now · new Date() · Math.random)", () => {
  if (!existsSync(SRC)) return { ok: false, exp: `มีไฟล์ ${SRC}`, act: "ไม่มีไฟล์" };
  const s = readFileSync(SRC, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const hits = [/Date\.now\s*\(/, /new\s+Date\s*\(\s*\)/, /Math\.random\s*\(/].filter((r) => r.test(s)).map(String);
  return { ok: hits.length === 0, exp: "ไม่มี", act: hits.length ? hits.join(",") : "ไม่มี" };
});

// ═════════════════════════ ภาค 1 · ฉากภาพ 01 (ส. 31 ต.ค. 14:20 · บาร์เบอร์ลุงหนวด อารีย์) ═════════════════════════
const IMG_STAFF: PlanStaff[] = [
  ST("EK", 1, { name: "ช่างเอก" }),
  ST("BOY", 2, { name: "ช่างบอย" }),
  ST("NUN", 3, { name: "ช่างนุ่น" }),
  ST("JACK", 4, { name: "ช่างแจ๊ค", windows: [W("13:00", "20:00")] }), // พาร์ทไทม์ 13–20 · walk-in เท่านั้น (0% ออนไลน์)
];
const imgJobs = (o: { tor?: Partial<PlanJob>; withA011?: boolean } = {}): PlanJob[] => {
  const jobs: PlanJob[] = [
    // ช่างเอก
    BK("P004", "EK", "COLOR", "13:30", { label: "P004 คุณธนา", status: "IN_SERVICE", checkedInAt: T("13:25"), startedAt: T("13:30") }),
    BK("BEAM", "EK", "CUT", "15:15", { label: "คุณบีม", assignMode: "ANY" }),
    BK("OAT", "EK", "CW", "16:30", { label: "คุณโอ๊ต" }),
    // ช่างบอย
    WK("A005", "CUT", "12:55", { status: "DONE", staffId: "BOY", startedAt: T("13:00") }),
    BK("TOR", "BOY", "CUT", "14:05", { label: "คุณต่อ", status: "LATE", ...o.tor }),
    INS("A007", "BOY", "SHAVE", "14:16"),
    BK("P006", "BOY", "CUT", "14:45", { label: "P006 คุณกอล์ฟ", status: "ARRIVED", checkedInAt: T("14:12") }),
    BK("BEER", "BOY", "CUT", "17:00", { label: "คุณเบียร์" }),
    // ช่างนุ่น
    BK("P003", "NUN", "CUT", "13:00", { status: "DONE", startedAt: T("13:00") }),
    BK("P005", "NUN", "CW", "14:00", { label: "P005 คุณมายด์", status: "IN_SERVICE", checkedInAt: T("13:55"), startedAt: T("14:00") }),
    BK("PRAEW", "NUN", "PERM", "15:30", { label: "คุณแพรว" }),
    // ช่างแจ๊ค
    WK("A006", "SHAVE", "13:10", { status: "DONE", staffId: "JACK", startedAt: T("13:15") }),
    INS("A008", "JACK", "KID", "14:10"),
    // แถวรอ walk-in
    WK("A009", "CUT", "13:58"),
    WK("A010", "SHAVE", "14:08"),
  ];
  if (o.withA011 !== false) jobs.push(WK("A011", "CW", "14:18"));
  return jobs;
};
const IMG = (o: { tor?: Partial<PlanJob>; withA011?: boolean; now?: string } = {}) => IN(o.now ?? "14:20", IMG_STAFF, imgJobs(o));

test("IMG-01", "A009 ตัดผมชาย ⇒ ช่างแจ๊ค 14:40 (อีก 20 นาที)", () =>
  expect(plan(IMG()), "A009", { staff: "JACK", start: "14:40", end: "15:25", state: "SCHEDULED", reason: "WALKIN_EARLIEST", wait: 20 }));
test("IMG-02", "A010 โกนหนวด ⇒ ช่างนุ่น 15:00 ช่องว่าง 20 นาทีก่อนนัดคุณแพรว (อีก 40 นาที)", () =>
  expect(plan(IMG()), "A010", { staff: "NUN", start: "15:00", end: "15:20", state: "SCHEDULED", reason: "WALKIN_GAP_BEFORE_BOOKING", wait: 40 }));
test("IMG-03", "A011 ตัด+สระ ⇒ ช่างแจ๊ค 15:25 (~65 นาที)", () =>
  expect(plan(IMG()), "A011", { staff: "JACK", start: "15:25", end: "16:25", state: "SCHEDULED", reason: "WALKIN_EARLIEST", wait: 65 }));
test("IMG-04", "กำลังทำ: P004 เอก จบ 15:00 · A007 บอย จบ 14:36 · P005 นุ่น จบ 15:00 · A008 แจ๊ค จบ 14:40", () => {
  const p = plan(IMG());
  return all(
    expect(p, "P004", { staff: "EK", end: "15:00", state: "IN_SERVICE", reason: "IN_SERVICE" }),
    expect(p, "A007", { staff: "BOY", end: "14:36", state: "IN_SERVICE", reason: "IN_SERVICE" }),
    expect(p, "P005", { staff: "NUN", end: "15:00", state: "IN_SERVICE", reason: "IN_SERVICE" }),
    expect(p, "A008", { staff: "JACK", end: "14:40", state: "IN_SERVICE", reason: "IN_SERVICE" }),
  );
});
test("IMG-05", "P006 คุณกอล์ฟ เช็กอิน 14:12 ⇒ ช่างบอย ตรงนัด 14:45 (แถวเดียวไม่ดึงนัดขึ้นเร็ว)", () => {
  const p = plan(IMG());
  const j = J(p, "P006");
  const r = expect(p, "P006", { staff: "BOY", start: "14:45", end: "15:30", state: "SCHEDULED", reason: "BOOKED_ON_TIME", wait: 25 });
  return { ok: r.ok && j.etaPlusMinusMin === 0, exp: r.exp + " ±0", act: r.act };
});
test("IMG-06", "คุณต่อ นัด 14:05 ไม่มาเกินผ่อนผัน ⇒ ปล่อยช่อง (RELEASED_LATE) ไม่อยู่ในแถว", () => {
  const p = plan(IMG());
  const r = expect(p, "TOR", { state: "RELEASED_LATE", reason: "LATE_RELEASED", late: true });
  return { ok: r.ok && !p.line.includes("TOR"), exp: r.exp + " · ไม่อยู่ใน line", act: `${r.act} · line=${p.line.join(",")}` };
});
test("IMG-07", "คุณต่อ สถานะยัง CONFIRMED (cron ยังไม่รัน) ⇒ planner คิดจากเวลาเอง ผลเดียวกัน", () =>
  expect(plan(IMG({ tor: { status: "CONFIRMED" } })), "TOR", { state: "RELEASED_LATE", reason: "LATE_RELEASED", late: true }));
test("IMG-08", "คุณบีม 15:15 แบบใครก็ได้ ⇒ ระบบวางช่างเอกไว้ (ไม่ย้ายเพราะเอกว่างตรงเวลา)", () =>
  expect(plan(IMG()), "BEAM", { staff: "EK", start: "15:15", end: "16:00", state: "SCHEDULED", reason: "BOOKED_ON_TIME", late: false }));
test("IMG-09", "คุณแพรว ดัด 2 ชม. ⇒ ช่างนุ่น 15:30–17:30 · โอ๊ต 16:30 · เบียร์ 17:00 ตรงนัด", () => {
  const p = plan(IMG());
  return all(
    expect(p, "PRAEW", { staff: "NUN", start: "15:30", end: "17:30", reason: "BOOKED_ON_TIME" }),
    expect(p, "OAT", { staff: "EK", start: "16:30", reason: "BOOKED_ON_TIME" }),
    expect(p, "BEER", { staff: "BOY", start: "17:00", reason: "BOOKED_ON_TIME" }),
  );
});
test("IMG-10", "แถวรอแถวเดียว 6 ช่องแรก = A009 · P006 · A010 · บีม · A011 · แพรว", () => {
  const p = plan(IMG());
  const want = ["A009", "P006", "A010", "BEAM", "A011", "PRAEW"];
  const got = p.line.slice(0, 6);
  return { ok: JSON.stringify(got) === JSON.stringify(want), exp: want.join(","), act: p.line.join(",") };
});
test("IMG-11", "งานจบแล้ว (A005 P003 A006) ไม่อยู่ในผล · งานกำลังทำไม่อยู่ใน line", () => {
  const p = plan(IMG());
  const ids = p.jobs.map((j) => j.jobId);
  const bad = ["A005", "P003", "A006"].filter((x) => ids.includes(x));
  const inLine = ["P004", "A007", "P005", "A008"].filter((x) => p.line.includes(x));
  return { ok: bad.length === 0 && inLine.length === 0, exp: "ไม่มี", act: `ในผล=${bad.join(",")} ใน line=${inLine.join(",")}` };
});
test("IMG-12", "ทำไม A011 ได้ช่างแจ๊ค 15:25 — ตัวเลือกต่อช่างตรงกล่องในภาพ", () => {
  const w = J(plan(IMG()), "A011").why;
  if (!w) return { ok: false, exp: "why ไม่ว่าง", act: "null" };
  const c = (id: string) => w.candidates.find((x) => x.staffId === id);
  const jack = c("JACK"), nun = c("NUN"), ek = c("EK"), boy = c("BOY");
  const ok =
    jack?.verdict === "CHOSEN" && jack.earliestFitAt === T("15:25") &&
    nun?.verdict === "LATER" && nun.blockedGap?.freeAt === T("15:20") && nun.blockedGap?.nextBookingAt === T("15:30") &&
    ek?.verdict === "LATER" && ek.blockedGap?.freeAt === T("15:00") && ek.blockedGap?.nextBookingAt === T("15:15") &&
    boy?.verdict === "LATER" && boy.earliestFitAt === T("15:30") && boy.blockedGap === null;
  const show = (x: WhyCandidate | undefined) => x ? `${x.staffId}:${x.verdict} fit=${HM(x.earliestFitAt)} gap=${x.blockedGap ? `${HM(x.blockedGap.freeAt)}/${HM(x.blockedGap.nextBookingAt)}` : "-"}` : "ไม่มี";
  return {
    ok,
    exp: "JACK:CHOSEN fit=15:25 · NUN:LATER gap=15:20/15:30 · EK:LATER gap=15:00/15:15 · BOY:LATER fit=15:30 gap=-",
    act: [jack, nun, ek, boy].map(show).join(" · "),
  };
});
test("IMG-13", "ข้อความ 'ทำไม' มีวลีตรงภาพ", () => {
  const w = J(plan(IMG()), "A011").why;
  const t = w?.text ?? "";
  const need = ["ช่างนุ่นว่าง 15:20 แต่มีนัด 15:30", "ช่างเอกว่าง 15:00 แต่มีนัด 15:15", "ช่างบอยว่าง 15:30", "ช่างแจ๊คเร็วสุด 15:25"];
  const miss = need.filter((x) => !t.includes(x));
  return { ok: miss.length === 0, exp: need.join(" / "), act: `${t} (ขาด: ${miss.join(" / ") || "-"})` };
});
test("IMG-14", "ETA ±: A011 ±10 (จอ 06) · A009 ±5 · กำลังทำ ±0", () => {
  const p = plan(IMG());
  const a = J(p, "A011").etaPlusMinusMin, b = J(p, "A009").etaPlusMinusMin, c = J(p, "A008").etaPlusMinusMin;
  return { ok: a === 10 && b === 5 && c === 0, exp: "10/5/0", act: `${a}/${b}/${c}` };
});
test("IMG-15", "ตู้ (จอ 04): ก่อนออก A011 ถามตัด+สระ 'ใครก็ได้' ⇒ ช่างแจ๊ค ~15:25 รอ 65", () => {
  const q = quote(IMG({ withA011: false }), { serviceId: "CW" });
  return { ok: q.staffId === "JACK" && q.startAt === T("15:25") && q.waitMin === 65 && !q.closed, exp: "JACK 15:25 wait 65 open", act: `${q.staffId} ${HM(q.startAt)} wait ${q.waitMin} closed=${q.closed}` };
});
test("IMG-16", "ตู้ (จอ 04): 'อยากได้ช่างบอย' ⇒ ~15:30 (กติกา 4 ขอช่างเฉพาะ)", () => {
  const q = quote(IMG({ withA011: false }), { serviceId: "CW", staffId: "BOY" });
  return { ok: q.staffId === "BOY" && q.startAt === T("15:30"), exp: "BOY 15:30", act: `${q.staffId} ${HM(q.startAt)}` };
});
test("IMG-17", "คุณต่อมาถึง 14:25 (ก่อน 14:35) ⇒ ต่อคิวท้ายแบบ walk-in ช่างบอย 15:30", () => {
  const i = IMG({ now: "14:25", tor: { status: "ARRIVED", checkedInAt: T("14:25") } });
  return expect(plan(i), "TOR", { staff: "BOY", start: "15:30", state: "SCHEDULED", reason: "LATE_ARRIVAL_AS_WALKIN" });
});
test("IMG-18", "14:35 คุณต่อยังไม่มา ⇒ NO_SHOW_DUE", () =>
  expect(plan(IMG({ now: "14:35", tor: { status: "LATE" } })), "TOR", { state: "NO_SHOW_DUE", reason: "NO_SHOW_DUE" }));
test("IMG-19", "ช่างแจ๊ค 0% ออนไลน์ (field เกิน onlineSharePct) ไม่มีผลต่อการวาง", () => {
  const staff = IMG_STAFF.map((s) => ({ ...s, onlineSharePct: s.id === "JACK" ? 0 : 60 })) as PlanStaff[];
  const p1 = plan(IMG()), p2 = plan({ ...IMG(), staff });
  const same = JSON.stringify(p1) === JSON.stringify(p2);
  return { ok: same, exp: "ผลเหมือนกันทุกไบต์", act: same ? "เหมือน" : "ต่าง" };
});

// ═════════════════════════ ภาค 2 · ฉากกติกา ═════════════════════════
const X = ST("X", 1), Y = ST("Y", 2), Z = ST("Z", 3);

test("S01", "งานยาวไม่ลงก่อนนัด: ตัด+สระ 60 ไม่ลง 10:00 เพราะมีนัด 10:40 ⇒ 11:25", () =>
  expect(plan(IN("10:00", [X], [BK("B1", "X", "CUT", "10:40"), WK("W1", "CW", "09:55")])), "W1", { staff: "X", start: "11:25", reason: "WALKIN_EARLIEST" }));
test("S02", "งานสั้นลงก่อนนัดได้: โกน 20 ⇒ 10:00 (10:20 ≤ 10:35)", () =>
  expect(plan(IN("10:00", [X], [BK("B1", "X", "CUT", "10:40"), WK("W1", "SHAVE", "09:55")])), "W1", { staff: "X", start: "10:00", end: "10:20", reason: "WALKIN_GAP_BEFORE_BOOKING" }));
test("S03", "ขอบเผื่อ 5 นาที: งาน 35 ลง 10:00 พอดี · งาน 36 ไม่ลง ⇒ 11:25", () => {
  const a = plan(IN("10:00", [X], [BK("B1", "X", "CUT", "10:40"), WK("W1", "SHAVE", "09:55", { durationMin: 35 })]));
  const b = plan(IN("10:00", [X], [BK("B1", "X", "CUT", "10:40"), WK("W1", "SHAVE", "09:55", { durationMin: 36 })]));
  return all(expect(a, "W1", { start: "10:00", end: "10:35" }), expect(b, "W1", { start: "11:25" }));
});
test("S04", "เผื่อ 0 นาที (ค่าตั้ง) ⇒ งาน 40 ลง 10:00 ได้", () =>
  expect(plan(IN("10:00", [X], [BK("B1", "X", "CUT", "10:40"), WK("W1", "SHAVE", "09:55", { durationMin: 40 })], { safetyBeforeBookingMin: 0 })), "W1", { start: "10:00" }));
test("S05", "buffer หลังบริการนับในกติกา: buffer 10 ลงได้ · buffer 16 ไม่ลง", () => {
  const s10 = SVC.map((s) => (s.id === "SHAVE" ? { ...s, bufferAfterMin: 10 } : s));
  const s16 = SVC.map((s) => (s.id === "SHAVE" ? { ...s, bufferAfterMin: 16 } : s));
  const jobs = [BK("B1", "X", "CUT", "10:40"), WK("W1", "SHAVE", "09:55")];
  return all(
    expect(plan(IN("10:00", [X], jobs, {}, s10)), "W1", { start: "10:00", end: "10:20" }),
    expect(plan(IN("10:00", [X], jobs, {}, s16)), "W1", { start: "11:25" }),
  );
});
test("S06", "พักขั้นต่ำรายช่าง 10 นาที ⇒ walk-in เริ่มหลังงานก่อน +10 · ไม่ตั้ง = ต่อทันที", () => {
  const jobs = [INS("I1", "X", "CUT", "09:30"), WK("W1", "SHAVE", "09:55")];
  return all(
    expect(plan(IN("10:00", [ST("X", 1, { minBreakMin: 10 })], jobs)), "W1", { start: "10:25" }),
    expect(plan(IN("10:00", [X], jobs)), "W1", { start: "10:15" }),
    expect(plan(IN("10:00", [X], jobs, { minBreakMin: 10 })), "W1", { start: "10:25" }),
  );
});
test("S07", "backfill เปิด: ใบหลังงานสั้นแทรกช่องก่อนนัดได้ และใบก่อนไม่ช้าลง", () => {
  const base = [BK("B1", "X", "CUT", "10:30"), WK("W1", "CW", "09:50")];
  const p0 = plan(IN("10:00", [X], base));
  const p1 = plan(IN("10:00", [X], [...base, WK("W2", "SHAVE", "09:55")]));
  return all(
    expect(p0, "W1", { start: "11:15" }),
    expect(p1, "W1", { start: "11:15" }),
    expect(p1, "W2", { staff: "X", start: "10:00", reason: "WALKIN_GAP_BEFORE_BOOKING" }),
  );
});
test("S08", "backfill ปิด: ใบหลังไม่เริ่มก่อนใบก่อน ⇒ W2 12:15", () =>
  expect(plan(IN("10:00", [X], [BK("B1", "X", "CUT", "10:30"), WK("W1", "CW", "09:50"), WK("W2", "SHAVE", "09:55")], { backfill: false })), "W2", { start: "12:15" }));
test("S09", "งานเลยเวลา ⇒ ยืดถึง now+5 · walk-in ต่อจากนั้น", () => {
  const p = plan(IN("10:00", [X], [INS("I1", "X", "CUT", "09:00"), WK("W1", "SHAVE", "09:55")]));
  return all(expect(p, "I1", { end: "10:05", state: "IN_SERVICE", reason: "IN_SERVICE_OVERRUN" }), expect(p, "W1", { start: "10:05" }));
});
test("S10", "งานยังไม่เลยเวลา ⇒ จบตามนาทีบริการ (ไม่ยืด)", () => {
  const p = plan(IN("10:00", [X], [INS("I1", "X", "CUT", "09:30"), WK("W1", "SHAVE", "09:55")]));
  return all(expect(p, "I1", { end: "10:15", reason: "IN_SERVICE" }), expect(p, "W1", { start: "10:15" }));
});
test("S11", "งานเลยเวลาดันนัดช่างเดียวกัน (SPECIFIC) ⇒ DELAYED ต่อกันเป็นทอด · input ไม่ถูกแก้", () => {
  const i = deepFreeze(IN("10:00", [X], [INS("I1", "X", "CUT", "09:00"), BK("B1", "X", "CUT", "10:00"), BK("B2", "X", "CUT", "10:45")]));
  const p = plan(i);
  const b1in = i.jobs.find((j) => j.id === "B1")?.startAt;
  const r = all(
    expect(p, "B1", { staff: "X", start: "10:05", end: "10:50", reason: "BOOKED_DELAYED" }),
    expect(p, "B2", { staff: "X", start: "10:50", reason: "BOOKED_DELAYED" }),
  );
  return { ok: r.ok && b1in === T("10:00"), exp: r.exp + " · input B1 ยัง 10:00", act: `${r.act} · input B1 ${HM(b1in)}` };
});
test("S12", "ใครก็ได้ (ยังไม่เช็กอิน) ช่างเดิมเลยเวลา ⇒ ย้ายช่างที่ว่าง เวลาไม่เปลี่ยน", () =>
  expect(plan(IN("10:00", [X, Y], [INS("I1", "X", "CUT", "09:00"), BK("B1", "X", "CUT", "10:00", { assignMode: "ANY" })])), "B1", { staff: "Y", start: "10:00", reason: "BOOKED_MOVED_STAFF" }));
test("S13", "ใครก็ได้ที่เช็กอินแล้ว ไม่ถูกย้าย ⇒ รอช่างเดิม (DELAYED)", () =>
  expect(plan(IN("10:00", [X, Y], [INS("I1", "X", "CUT", "09:00"), BK("B1", "X", "CUT", "10:00", { assignMode: "ANY", status: "ARRIVED", checkedInAt: T("09:50") })])), "B1", { staff: "X", start: "10:05", reason: "BOOKED_DELAYED" }));
test("S14", "ใครก็ได้ย้ายไปเฉพาะช่างที่ทำบริการนั้นได้ (Y โกนอย่างเดียว ⇒ Z)", () =>
  expect(plan(IN("10:00", [X, ST("Y", 2, { services: [{ serviceId: "SHAVE" }] }), Z], [INS("I1", "X", "CUT", "09:00"), BK("B1", "X", "CUT", "10:00", { assignMode: "ANY" })])), "B1", { staff: "Z", start: "10:00", reason: "BOOKED_MOVED_STAFF" }));
test("S15", "ใครก็ได้แต่ไม่มีช่างอื่นว่างทั้งช่วง ⇒ อยู่ช่างเดิม DELAYED (ไม่ย้ายไปชนนัดคนอื่น)", () => {
  const p = plan(IN("10:00", [X, Y], [INS("I1", "X", "CUT", "09:00"), BK("B1", "X", "CUT", "10:00", { assignMode: "ANY" }), BK("BY", "Y", "SHAVE", "10:30")]));
  return all(expect(p, "B1", { staff: "X", start: "10:05", reason: "BOOKED_DELAYED" }), expect(p, "BY", { staff: "Y", start: "10:30", reason: "BOOKED_ON_TIME" }));
});
test("S16", "เลยผ่อนผัน (10:11) ⇒ ปล่อยช่อง · walk-in ลงแทนได้ทันที", () => {
  const p = plan(IN("10:11", [X], [BK("B1", "X", "CUT", "10:00"), WK("W1", "SHAVE", "10:05")]));
  return all(expect(p, "B1", { state: "RELEASED_LATE", late: true }), expect(p, "W1", { staff: "X", start: "10:11" }));
});
// ORACLE-EDIT B.2-S17 (มติ R1): นัดที่ยังไม่เริ่ม start = max(startAt, now, จบก่อนหน้า+gap) — เดิมคาด 10:00 / W1 10:45
test("S17", "ภายในผ่อนผัน (10:09) ⇒ ยังถือช่อง เริ่มได้ไม่ก่อน now · walk-in ต่อหลังนัด", () => {
  const p = plan(IN("10:09", [X], [BK("B1", "X", "CUT", "10:00"), WK("W1", "SHAVE", "10:05")]));
  return all(expect(p, "B1", { state: "SCHEDULED", start: "10:09", end: "10:54", reason: "BOOKED_DELAYED", late: false }), expect(p, "W1", { start: "10:54" }));
});
test("S18", "ขอบผ่อนผันพอดี (now = นัด+10) ⇒ นับว่าสาย ปล่อยช่อง", () =>
  expect(plan(IN("10:10", [X], [BK("B1", "X", "CUT", "10:00")])), "B1", { state: "RELEASED_LATE", late: true }));
// ORACLE-EDIT B.2-S19 (มติ R1): เดิมคาด B1 10:00 / W1 10:45
test("S19", "โหมดรอต่อ (HOLD · คลินิก) ⇒ สายแต่ถือช่อง (เริ่ม ≥ now) walk-in ไม่ลงแทน", () => {
  const p = plan(IN("10:11", [X], [BK("B1", "X", "CUT", "10:00"), WK("W1", "SHAVE", "10:05")], { lateAction: "HOLD" }));
  return all(expect(p, "B1", { state: "SCHEDULED", start: "10:11", end: "10:56", late: true }), expect(p, "W1", { start: "10:56" }));
});
test("S20", "snapshot ชนะค่าตั้ง: นัดจองตอนผ่อนผัน 20 ⇒ 10:11 ยังไม่สาย · snapshot HOLD ชนะค่าตั้ง RELEASE", () => {
  const a = plan(IN("10:11", [X], [BK("B1", "X", "CUT", "10:00", { policy: { graceMin: 20 } })]));
  const b = plan(IN("10:11", [X], [BK("B1", "X", "CUT", "10:00", { policy: { lateAction: "HOLD" } })]));
  return all(expect(a, "B1", { state: "SCHEDULED", late: false }), expect(b, "B1", { state: "SCHEDULED", late: true }));
});
test("S21", "ครบ 30 นาทีไม่มา ⇒ NO_SHOW_DUE (ไม่กินเวลา) · snapshot ไม่มา 60 ⇒ ยังไม่ใช่", () => {
  const a = plan(IN("10:30", [X], [BK("B1", "X", "CUT", "10:00"), WK("W1", "SHAVE", "10:05")]));
  const b = plan(IN("10:30", [X], [BK("B1", "X", "CUT", "10:00", { policy: { noShowAfterMin: 60 } })]));
  return all(expect(a, "B1", { state: "NO_SHOW_DUE", reason: "NO_SHOW_DUE" }), expect(a, "W1", { start: "10:30" }), expect(b, "B1", { state: "RELEASED_LATE" }));
});
test("S22", "มาสายหลังผ่อนผัน ⇒ เข้าแถวแบบ walk-in ตามเวลาเช็กอิน (หลังใบที่ออกก่อน)", () => {
  const p = plan(IN("10:20", [X], [WK("W1", "CUT", "10:05"), BK("B1", "X", "CUT", "10:00", { status: "ARRIVED", checkedInAt: T("10:15") })]));
  return all(expect(p, "W1", { start: "10:20" }), expect(p, "B1", { staff: "X", start: "11:05", reason: "LATE_ARRIVAL_AS_WALKIN" }));
});
// ORACLE-EDIT B.2-S23 (มติ R1): เดิมคาด B1 10:00 BOOKED_ON_TIME / W1 10:45
test("S23", "มาภายในผ่อนผัน ⇒ ยังเป็นนัด (ไม่ใช่ walk-in) เริ่มที่ now · walk-in ต่อหลัง", () => {
  const p = plan(IN("10:09", [X], [WK("W1", "CUT", "10:05"), BK("B1", "X", "CUT", "10:00", { status: "ARRIVED", checkedInAt: T("10:08") })]));
  return all(expect(p, "B1", { staff: "X", start: "10:09", end: "10:54", reason: "BOOKED_DELAYED" }), expect(p, "W1", { start: "10:54" }));
});
test("S24", "walk-in ขอช่างเฉพาะ ⇒ รอช่างนั้นแม้ช่างอื่นว่างตอนนี้", () =>
  expect(plan(IN("10:00", [X, Y], [INS("I1", "X", "CUT", "09:45"), WK("W1", "SHAVE", "09:55", { assignMode: "SPECIFIC", staffId: "X" })])), "W1", { staff: "X", start: "10:30", reason: "WALKIN_REQUESTED_STAFF" }));
test("S25", "ใบที่ขอช่างเฉพาะไม่ขวางใบหลัง 'ใครก็ได้' แม้ปิด backfill", () => {
  const p = plan(IN("10:00", [X, Y], [INS("I1", "X", "CUT", "09:45"), WK("W1", "SHAVE", "09:50", { assignMode: "SPECIFIC", staffId: "X" }), WK("W2", "SHAVE", "09:55")], { backfill: false }));
  return all(expect(p, "W1", { staff: "X", start: "10:30" }), expect(p, "W2", { staff: "Y", start: "10:00" }));
});
test("S26", "ช่างที่ทำบริการไม่ได้ไม่ถูกเลือก (why = NOT_QUALIFIED)", () => {
  const p = plan(IN("10:00", [X, ST("Y", 2, { services: [{ serviceId: "CUT" }] })], [INS("I1", "X", "CUT", "09:45"), WK("W1", "SHAVE", "09:55")]));
  const v = J(p, "W1").why?.candidates.find((c) => c.staffId === "Y")?.verdict;
  const r = expect(p, "W1", { staff: "X", start: "10:30" });
  return { ok: r.ok && v === "NOT_QUALIFIED", exp: r.exp + " · Y=NOT_QUALIFIED", act: `${r.act} · Y=${v}` };
});
test("S27", "เวลาบริการเฉพาะช่าง (ช่างอาวุโส 60 นาทีสำหรับตัดผมชาย)", () =>
  expect(plan(IN("10:00", [ST("X", 1, { services: [{ serviceId: "CUT", durationMin: 60 }] })], [WK("W1", "CUT", "09:55")])), "W1", { staff: "X", start: "10:00", end: "11:00" }));
test("S28", "หน้าต่างเวลา: ช่างพาร์ทไทม์ 13:00 ไม่รับงานเช้า · งานต้องจบก่อนปิด ไม่งั้น UNPLACED", () => {
  const a = plan(IN("10:00", [ST("X", 1, { windows: [W("13:00", "20:00")] }), Y], [INS("I1", "Y", "CUT", "09:45"), WK("W1", "CUT", "09:55")]));
  const b = plan(IN("19:30", [X], [WK("W1", "CW", "19:20")]));
  return all(expect(a, "W1", { staff: "Y", start: "10:30" }), expect(b, "W1", { state: "UNPLACED", reason: "NO_SLOT_TODAY", start: null }));
});
test("S29", "หน้าต่างแยก (ลาช่วงเที่ยง) ⇒ งานไม่คร่อมช่วงลา", () =>
  expect(plan(IN("11:30", [ST("X", 1, { windows: [W("10:00", "12:00"), W("13:00", "20:00")] })], [WK("W1", "CUT", "11:20")])), "W1", { start: "13:00" }));
test("S30", "สิทธิ์คิวก่อน (เปิด) ⇒ ใบ priority ออกทีหลังได้ก่อน · ปิด ⇒ ไม่มีผล", () => {
  const jobs = [WK("W1", "CW", "09:50"), WK("W2", "CW", "09:55", { priority: true })];
  const on = plan(IN("10:00", [X], jobs, { priorityEnabled: true }));
  const off = plan(IN("10:00", [X], jobs));
  return all(expect(on, "W2", { start: "10:00" }), expect(on, "W1", { start: "11:00" }), expect(off, "W1", { start: "10:00" }), expect(off, "W2", { start: "11:00" }));
});
test("S31", "สิทธิ์คิวก่อนไม่แซงนัด (นัดไม่ขยับ)", () => {
  const p = plan(IN("10:00", [X], [BK("B1", "X", "CUT", "10:30"), WK("W2", "CW", "09:55", { priority: true })], { priorityEnabled: true }));
  return all(expect(p, "B1", { start: "10:30", reason: "BOOKED_ON_TIME" }), expect(p, "W2", { start: "11:15" }));
});
test("S32", "นัดก่อนเสมอ: คนนัดที่มาแล้วได้ทำก่อน walk-in ที่มาก่อน (ดึงขึ้นเร็วบนช่างเดิม)", () => {
  const jobs = [BK("B1", "X", "CUT", "10:30", { status: "ARRIVED", checkedInAt: T("09:55") }), WK("W1", "SHAVE", "09:50")];
  const p = plan(IN("10:00", [X], jobs, { queueOrder: "APPOINTMENT_FIRST" }));
  return all(expect(p, "B1", { staff: "X", start: "10:00", reason: "BOOKED_EARLY" }), expect(p, "W1", { start: "10:45" }));
});
test("S33", "แถวเดียว (ค่าเดียวกัน) ⇒ นัดรอเวลาเดิม · walk-in แทรกช่องก่อนนัด", () => {
  const jobs = [BK("B1", "X", "CUT", "10:30", { status: "ARRIVED", checkedInAt: T("09:55") }), WK("W1", "SHAVE", "09:50")];
  const p = plan(IN("10:00", [X], jobs));
  return all(expect(p, "B1", { start: "10:30", reason: "BOOKED_ON_TIME" }), expect(p, "W1", { start: "10:00" }));
});
test("S34", "นัดก่อนเสมอ: นัดที่ยังไม่มาไม่ถูกดึง", () =>
  expect(plan(IN("10:00", [X], [BK("B1", "X", "CUT", "10:30")], { queueOrder: "APPOINTMENT_FIRST" })), "B1", { start: "10:30", reason: "BOOKED_ON_TIME" }));
test("S35", "แม่แบบคลินิกทั้งชุด: นัดมาแล้วก่อน · walk-in สิทธิ์ก่อนนำ walk-in ปกติ · เผื่อ 0", () => {
  const jobs = [
    BK("B1", "X", "CUT", "10:30", { status: "ARRIVED", checkedInAt: T("09:58") }),
    WK("W1", "SHAVE", "09:50"),
    WK("W2", "SHAVE", "09:55", { priority: true }),
  ];
  const p = plan({ now: T("10:00"), settings: CLINIC, staff: [X], services: SVC, jobs });
  return all(expect(p, "B1", { start: "10:00" }), expect(p, "W2", { start: "10:45" }), expect(p, "W1", { start: "11:05" }));
});
test("S36", "งานสูงสุด/วัน: ช่างครบโควตา (นับงานที่เสร็จแล้ว) ไม่ได้ walk-in เพิ่ม", () => {
  const p = plan(IN("10:00", [ST("X", 1, { maxJobsPerDay: 2 }), Y], [
    BK("D1", "X", "SHAVE", "09:00", { status: "DONE" }), BK("D2", "X", "SHAVE", "09:30", { status: "DONE" }),
    INS("I1", "Y", "CUT", "09:45"), WK("W1", "SHAVE", "09:55"),
  ]));
  const v = J(p, "W1").why?.candidates.find((c) => c.staffId === "X")?.verdict;
  const r = expect(p, "W1", { staff: "Y", start: "10:30" });
  return { ok: r.ok && v === "MAX_JOBS", exp: r.exp + " · X=MAX_JOBS", act: `${r.act} · X=${v}` };
});
test("S37", "ยกเลิก/ไม่มา/เสร็จ ไม่กินเวลาช่าง และไม่อยู่ในผล", () => {
  const p = plan(IN("10:00", [X], [
    BK("C1", "X", "CUT", "10:00", { status: "CANCELLED" }), BK("N1", "X", "CUT", "10:00", { status: "NO_SHOW" }),
    BK("D1", "X", "CUT", "09:00", { status: "DONE" }), WK("W1", "CUT", "09:55"),
  ]));
  const extra = p.jobs.filter((j) => ["C1", "N1", "D1"].includes(j.jobId)).map((j) => j.jobId);
  const r = expect(p, "W1", { start: "10:00" });
  return { ok: r.ok && extra.length === 0, exp: r.exp + " · ไม่มี C1 N1 D1", act: `${r.act} · มี ${extra.join(",") || "-"}` };
});
test("S38", "quote ปิดรับเมื่อรอเกินเพดาน (เกินเท่านั้น · เท่ากับยังเปิด)", () => {
  const chain = [BK("B1", "X", "CW", "10:00"), BK("B2", "X", "CW", "11:00")];
  const q120 = quote(IN("10:00", [X], chain), { serviceId: "SHAVE" });
  const q180 = quote(IN("10:00", [X], [...chain, BK("B3", "X", "CW", "12:00")]), { serviceId: "SHAVE" });
  return {
    ok: q120.startAt === T("12:00") && q120.waitMin === 120 && !q120.closed && q180.startAt === T("13:00") && q180.closed,
    exp: "12:00 wait120 open · 13:00 closed",
    act: `${HM(q120.startAt)} wait${q120.waitMin} closed=${q120.closed} · ${HM(q180.startAt)} closed=${q180.closed}`,
  };
});
test("S39", "quote ไม่แตะผลของงานอื่น และเท่ากับการวางใบใหม่ต่อท้าย", () => {
  const i = IMG({ withA011: false });
  const before = JSON.stringify(plan(i));
  const q = quote(i, { serviceId: "CW" });
  const after = JSON.stringify(plan(i));
  const p2 = plan({ ...i, jobs: [...i.jobs, WK("QQ", "CW", "14:20")] });
  const j = J(p2, "QQ");
  return { ok: before === after && q.startAt === j.startAt && q.staffId === j.staffId, exp: "plan เดิมไม่เปลี่ยน · quote = วางต่อท้าย", act: `same=${before === after} quote=${q.staffId}@${HM(q.startAt)} append=${j.staffId}@${HM(j.startAt)}` };
});
test("S40", "เท่ากันเลือกตาม sortOrder (ไม่ใช่ลำดับ array)", () =>
  expect(plan(IN("10:00", [ST("X", 2), ST("Y", 1)], [WK("W1", "CUT", "09:55")])), "W1", { staff: "Y", start: "10:00" }));
test("S41", "walk-in ไม่เริ่มก่อน now แม้ช่างว่างมาตั้งแต่เช้า", () =>
  expect(plan(IN("10:07", [X], [WK("W1", "CUT", "09:55")])), "W1", { start: "10:07", wait: 0 }));
test("S42", "นัด SPECIFIC ที่ช่างไม่อยู่ในหน้าต่าง (ลา) ⇒ STAFF_UNAVAILABLE เวลาเดิม · ANY ⇒ ย้ายช่าง", () => {
  const xs = ST("X", 1, { windows: [W("13:00", "20:00")] });
  const p = plan(IN("09:30", [xs, Y], [BK("B1", "X", "CUT", "10:00"), BK("B2", "X", "SHAVE", "11:00", { assignMode: "ANY" })]));
  return all(expect(p, "B1", { staff: "X", start: "10:00", reason: "STAFF_UNAVAILABLE" }), expect(p, "B2", { staff: "Y", start: "11:00", reason: "BOOKED_MOVED_STAFF" }));
});
test("S43", "ผลไม่ขึ้นกับลำดับ array (สลับ jobs/staff) และ input ที่ freeze ไม่ throw", () => {
  const i = IMG();
  const a = plan(deepFreeze(structuredClone(i)));
  const b = plan({ ...i, staff: [...i.staff].reverse(), jobs: [...i.jobs].reverse() });
  const norm = (p: Plan) => JSON.stringify({ line: p.line, jobs: [...p.jobs].sort((x, y) => x.jobId.localeCompare(y.jobId)) });
  return { ok: norm(a) === norm(b), exp: "เหมือนกัน", act: norm(a) === norm(b) ? "เหมือน" : "ต่าง" };
});

// ═════════════════════════ ภาค 2b · มติหลังผู้ตรวจ 27 ต.ค. (ORACLE-EDIT B.2-R1…R6) ═════════════════════════
// R1 นัดที่ยังไม่เริ่มและไม่ถูกปล่อย ⇒ start = max(startAt, now, จบก่อนหน้า+gap) — ห้ามใช้เวลาในอดีต · walk-in ห้ามทับ
test("R1a", "นัดเช็กอินแล้ว เวลานัดผ่านไปทั้งช่วง (now 10:40) ⇒ 10:40–11:10 · walk-in ต่อหลัง", () => {
  const p = plan(IN("10:40", [X], [BK("B1", "X", "KID", "10:00", { status: "ARRIVED", checkedInAt: T("09:58") }), WK("W1", "SHAVE", "10:01")]));
  return all(expect(p, "B1", { staff: "X", start: "10:40", end: "11:10", state: "SCHEDULED", reason: "BOOKED_DELAYED" }), expect(p, "W1", { staff: "X", start: "11:10" }));
});
test("R1b", "ยังไม่มาแต่อยู่ในผ่อนผัน (grace 15 · now 10:12 · งาน 10 นาที) ⇒ ถือ 10:12–10:22 · walk-in ห้ามลงช่วงนั้น", () => {
  const p = plan(IN("10:12", [X], [BK("B1", "X", "SHAVE", "10:00", { durationMin: 10 }), WK("W1", "SHAVE", "10:01")], { graceMin: 15 }));
  return all(expect(p, "B1", { start: "10:12", end: "10:22", state: "SCHEDULED", late: false }), expect(p, "W1", { staff: "X", start: "10:22" }));
});
test("R1c", "HOLD สายยังไม่มา (now 10:20) ⇒ ถือ 10:20–10:50 · walk-in 10:50", () => {
  const p = plan(IN("10:20", [X], [BK("B1", "X", "KID", "10:00"), WK("W1", "SHAVE", "10:01")], { lateAction: "HOLD" }));
  return all(expect(p, "B1", { start: "10:20", end: "10:50", late: true }), expect(p, "W1", { start: "10:50" }));
});
test("R1d", "นัดก่อนเสมอ + นัดเช็กอินแล้วเวลาผ่านไปแล้ว ⇒ เริ่มที่ now ไม่ใช่อดีต", () => {
  const p = plan(IN("10:40", [X], [BK("B1", "X", "KID", "10:00", { status: "ARRIVED", checkedInAt: T("09:58") }), WK("W1", "SHAVE", "10:01")], { queueOrder: "APPOINTMENT_FIRST" }));
  return all(expect(p, "B1", { start: "10:40", end: "11:10" }), expect(p, "W1", { start: "11:10" }));
});
test("R1e", "ฉากผู้ตรวจ A#1: นัด 14:00 เช็กอินแล้ว now 14:20 ⇒ 14:20–15:05 · walk-in 15:05", () => {
  const p = plan(IN("14:20", [X], [BK("B1", "X", "CUT", "14:00", { status: "ARRIVED", checkedInAt: T("13:55") }), WK("W1", "CUT", "14:10")]));
  return all(expect(p, "B1", { start: "14:20", end: "15:05" }), expect(p, "W1", { start: "15:05" }));
});
test("R1f", "นัดต่อกันบนช่างเดียวเว้น gap ตามพักขั้นต่ำ (minBreak 10) ⇒ นัดหลังเริ่ม ≥ จบก่อนหน้า+10", () => {
  const p = plan(IN("09:50", [ST("X", 1, { minBreakMin: 10 })], [BK("B1", "X", "CUT", "10:00"), BK("B2", "X", "CUT", "10:50")]));
  return all(expect(p, "B1", { start: "10:00", reason: "BOOKED_ON_TIME" }), expect(p, "B2", { start: "10:55", reason: "BOOKED_DELAYED" }));
});
// R2 ANY ที่ระบบย้ายช่าง เคารพ gap ก่อน/หลัง + เผื่อก่อนนัดถัดไป + maxJobsPerDay
const SPA: PlanService[] = [...SVC, { id: "MASS", name: "นวด", durationMin: 60, bufferAfterMin: 10 }];
test("R2a", "ANY ไม่ย้ายไปช่างที่งานก่อนจบชิดเกิน (I2 จบ 13:30 + พัก 10 > 13:30) ⇒ อยู่ช่างเดิม", () => {
  const p = plan(IN("13:28", [ST("a", 1), ST("b", 2)], [INS("I1", "a", "MASS", "12:00"), INS("I2", "b", "MASS", "12:30"), BK("B2", "a", "MASS", "13:30", { assignMode: "ANY" })], { minBreakMin: 10, safetyBeforeBookingMin: 10 }, SPA));
  return expect(p, "B2", { staff: "a", start: "13:43", reason: "BOOKED_DELAYED" });
});
test("R2b", "ANY ไม่ย้ายไปช่างที่จะชนนัดถัดไป (จบ 14:30 + gap 10 > 14:30 − เผื่อ 10) ⇒ อยู่ช่างเดิม", () => {
  const p = plan(IN("13:28", [ST("a", 1), ST("b", 2)], [INS("I1", "a", "MASS", "12:00"), BK("B2", "a", "MASS", "13:30", { assignMode: "ANY" }), BK("Y1", "b", "MASS", "14:30")], { minBreakMin: 10, safetyBeforeBookingMin: 10 }, SPA));
  return all(expect(p, "B2", { staff: "a", start: "13:43", reason: "BOOKED_DELAYED" }), expect(p, "Y1", { staff: "b", start: "14:30", reason: "BOOKED_ON_TIME" }));
});
test("R2c", "ANY ย้ายได้เมื่อมีที่พอดีพร้อม gap+เผื่อ (นัดถัดไป 14:50) — ตัวคุมบวกของ R2b", () =>
  expect(plan(IN("13:28", [ST("a", 1), ST("b", 2)], [INS("I1", "a", "MASS", "12:00"), BK("B2", "a", "MASS", "13:30", { assignMode: "ANY" }), BK("Y1", "b", "MASS", "14:50")], { minBreakMin: 10, safetyBeforeBookingMin: 10 }, SPA)), "B2", { staff: "b", start: "13:30", reason: "BOOKED_MOVED_STAFF" }));
test("R2d", "ANY ไม่ย้ายไปช่างที่งานสูงสุด/วันเต็ม · โควตาเหลือ ⇒ ย้ายได้", () => {
  const jobs = () => [INS("I1", "a", "CW", "09:30"), BK("D", "b", "CUT", "09:00", { status: "DONE" }), BK("B1", "a", "CUT", "10:15", { assignMode: "ANY" })];
  const full = plan(IN("10:00", [ST("a", 1), ST("b", 2, { maxJobsPerDay: 1 })], jobs()));
  const ok = plan(IN("10:00", [ST("a", 1), ST("b", 2, { maxJobsPerDay: 2 })], jobs()));
  return all(expect(full, "B1", { staff: "a", start: "10:30", reason: "BOOKED_DELAYED" }), expect(ok, "B1", { staff: "b", start: "10:15", reason: "BOOKED_MOVED_STAFF" }));
});
// R3 บริการที่ไม่รู้จัก
test("R3", "serviceId ไม่อยู่ใน services ⇒ UNPLACED/UNKNOWN_SERVICE ไม่กินเวลาใคร ไม่อยู่ใน line", () => {
  const p = plan(IN("10:00", [X], [BK("B1", "X", "GONE", "10:00", { status: "ARRIVED", checkedInAt: T("09:55") }), WK("W0", "GONE", "09:40"), WK("W1", "CUT", "09:50")]));
  const r = all(expect(p, "B1", { state: "UNPLACED", reason: "UNKNOWN_SERVICE", start: null }), expect(p, "W0", { state: "UNPLACED", reason: "UNKNOWN_SERVICE", start: null }), expect(p, "W1", { staff: "X", start: "10:00" }));
  const inLine = p.line.filter((x) => x === "B1" || x === "W0");
  return { ok: r.ok && inLine.length === 0, exp: r.exp + " · ไม่อยู่ใน line", act: `${r.act} · line=${p.line.join(",")}` };
});
// R4 STAFF_UNAVAILABLE ใช้ startAt เดิมเสมอ
test("R4", "STAFF_UNAVAILABLE (ช่างทำบริการนี้ไม่ได้) ไม่ถูกงานเลยเวลาดัน ⇒ เวลาเดิม ช่างเดิม", () => {
  const p = plan(IN("10:05", [ST("X", 1, { windows: [W("09:00", "20:00")], services: [{ serviceId: "CUT" }] })], [INS("I1", "X", "KID", "09:30"), BK("B1", "X", "SHAVE", "10:00")]));
  return expect(p, "B1", { staff: "X", start: "10:00", reason: "STAFF_UNAVAILABLE" });
});
// R5 หน้าต่างไม่เรียง/ซ้อน/ชิด ⇒ planner เรียง+รวมเอง
test("R5a", "หน้าต่างชิดกัน [09–12][12–20] (ส่งกลับลำดับ) ⇒ งาน 60 นาทีตอน 11:30 ลงได้", () =>
  expect(plan(IN("11:30", [ST("X", 1, { windows: [W("12:00", "20:00"), W("09:00", "12:00")] })], [WK("W1", "CW", "11:20")])), "W1", { start: "11:30", end: "12:30" }));
test("R5b", "หน้าต่างซ้อนกัน [09–12:30][12–20] ⇒ เหมือนหน้าต่างเดียว", () =>
  expect(plan(IN("11:30", [ST("X", 1, { windows: [W("09:00", "12:30"), W("12:00", "20:00")] })], [WK("W1", "CW", "11:20")])), "W1", { start: "11:30" }));
test("R5c", "ภาพ 01 ช่างแจ๊คส่งหน้าต่างแตก+สลับ [16–20][13–16:30] ⇒ ผล (รวม why) เหมือนหน้าต่างเดียวทุกไบต์", () => {
  const a = plan(IMG());
  const staff = IMG_STAFF.map((s) => (s.id === "JACK" ? { ...s, windows: [W("16:00", "20:00"), W("13:00", "16:30")] } : s));
  const b = plan({ ...IMG(), staff });
  const same = JSON.stringify(a) === JSON.stringify(b);
  return { ok: same, exp: "เหมือนกันทุกไบต์", act: same ? "เหมือน" : `ต่าง: A011 ${fmt(J(a, "A011"))} / ${fmt(J(b, "A011"))}` };
});
// R6 ธงล้นหน้าต่าง
test("R6a", "นัดถูกดันจนล้นปิดร้าน ⇒ overWindow=true เฉพาะใบที่ล้น", () => {
  const p = plan(IN("18:30", [X], [INS("I1", "X", "CW", "17:00"), BK("B1", "X", "CUT", "18:30"), BK("B2", "X", "CUT", "19:15")]));
  const r = all(expect(p, "I1", { end: "18:35" }), expect(p, "B1", { start: "18:35", end: "19:20" }), expect(p, "B2", { start: "19:20", end: "20:05" }));
  const f = (id: string) => J(p, id).overWindow;
  return { ok: r.ok && f("B2") === true && f("B1") === false && f("I1") === false, exp: r.exp + " · overWindow B2=true B1=false I1=false", act: `${r.act} · B2=${f("B2")} B1=${f("B1")} I1=${f("I1")}` };
});
test("R6b", "ภาพ 01 ไม่มีงานไหนล้นหน้าต่าง (overWindow=false ทุกใบ)", () => {
  const bad = plan(IMG()).jobs.filter((j) => j.overWindow !== false).map((j) => `${j.jobId}=${String(j.overWindow)}`);
  return { ok: bad.length === 0, exp: "false ทุกใบ", act: bad.join(",") || "false ทุกใบ" };
});

// ═════════════════════════ ภาค 3 · property (สุ่ม seed คงที่) ═════════════════════════
const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
type Rng = () => number;
const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <V,>(r: Rng, xs: readonly V[]): V => xs[Math.floor(r() * xs.length)];

/** สร้างวันสุ่ม: นัดต่อช่างไม่ซ้อนกันเอง · งานที่กำลังทำ 1 งาน/ช่างไม่ซ้อนนัด · overrun = เปิดให้งานเลยเวลาได้ */
const genDay = (r: Rng, o: { staffN: number; bookings: number; walkins: number; overrun: boolean; settings?: Partial<PlanSettings>; now?: number; dense?: boolean; pastPending?: boolean }): PlanInput => {
  const now = o.now ?? T("10:00") + ri(r, 0, 480) * MIN;
  const staff: PlanStaff[] = [];
  for (let k = 0; k < o.staffN; k++) {
    const partTime = !o.dense && r() < 0.2;
    const split = !partTime && r() < 0.15;
    const windows = partTime ? [W("13:00", "20:00")] : split ? [W("10:00", "12:30"), W("13:30", "20:00")] : [W("10:00", "20:00")];
    const services = !o.dense && r() < 0.25 ? SVC.filter(() => r() < 0.7).map((s) => (r() < 0.3 ? { serviceId: s.id, durationMin: s.durationMin + 15 } : { serviceId: s.id })) : null;
    staff.push({ id: `S${String(k).padStart(2, "0")}`, name: `ช่าง${k}`, sortOrder: ri(r, 1, 5), windows, services, minBreakMin: r() < 0.2 ? 10 : undefined, maxJobsPerDay: r() < 0.1 ? ri(r, 3, 8) : undefined });
  }
  const can = (s: PlanStaff, sv: string) => s.services === null || s.services.some((x) => x.serviceId === sv);
  const durOf = (s: PlanStaff, sv: string) => s.services?.find((x) => x.serviceId === sv)?.durationMin ?? SVC.find((x) => x.id === sv)!.durationMin;
  const jobs: PlanJob[] = [];
  let n = 0;
  // นัด: เดินเส้นเวลาของแต่ละช่าง วางงานต่อกันมีช่องว่างสุ่ม
  const perStaff = Math.max(1, Math.ceil(o.bookings / o.staffN));
  let made = 0;
  for (const s of staff) {
    let t = s.windows[0].startAt + ri(r, 0, 6) * 5 * MIN;
    let inService = false;
    for (let k = 0; k < perStaff + 3 && made < o.bookings; k++) {
      const svs = SVC.filter((x) => can(s, x.id) && (!o.dense || x.durationMin <= 45));
      if (!svs.length) break;
      const sv = pick(r, svs).id;
      const d = durOf(s, sv) * MIN;
      const win = s.windows.find((w) => t >= w.startAt && t + d <= w.endAt) ?? s.windows.find((w) => w.startAt >= t && w.startAt + d <= w.endAt);
      if (!win) break;
      if (t < win.startAt) t = win.startAt;
      const id = `J${n++}`;
      const any = r() < 0.3;
      if (t + d <= now - 30 * MIN || (!o.overrun && t + d <= now)) {
        jobs.push(BK(id, s.id, sv, "00:00", { startAt: t, status: pick(r, ["DONE", "DONE", "NO_SHOW", "CANCELLED"] as const), startedAt: t }));
      } else if (t <= now && !inService && (o.pastPending === false || r() < 0.75)) {
        inService = true;
        const started = o.overrun && r() < 0.4 ? Math.min(t, now - d - ri(r, 0, 20) * MIN) : t;
        if (r() < 0.5) jobs.push(BK(id, s.id, sv, "00:00", { startAt: t, status: "IN_SERVICE", checkedInAt: t - 5 * MIN, startedAt: started }));
        else jobs.push(INS(id, s.id, sv, "00:00", { startedAt: started, issuedAt: t - 20 * MIN }));
      } else if (t + d > now - 30 * MIN && t < now) {
        // เริ่มไปแล้วแต่ยังไม่มีคนทำ: ลูกค้านัดยังไม่มา (อาจสาย/ไม่มา) หรือมาแล้วรอ
        const arrived = r() < 0.4;
        jobs.push(BK(id, s.id, sv, "00:00", { startAt: t, assignMode: any ? "ANY" : "SPECIFIC", status: arrived ? "ARRIVED" : pick(r, ["CONFIRMED", "LATE", "PENDING"] as const), checkedInAt: arrived ? t + ri(r, -20, 20) * MIN : null, policy: r() < 0.2 ? { graceMin: pick(r, [5, 10, 20]), lateAction: pick(r, ["RELEASE", "HOLD"] as const) } : undefined }));
        made++;
      } else {
        const arrived = t - now < 40 * MIN && r() < 0.4;
        jobs.push(BK(id, s.id, sv, "00:00", { startAt: t, assignMode: any ? "ANY" : "SPECIFIC", status: arrived ? "ARRIVED" : "CONFIRMED", checkedInAt: arrived ? now - ri(r, 0, 15) * MIN : null }));
        made++;
      }
      t += d + (s.minBreakMin ?? 0) * MIN + ri(r, 0, o.dense ? 2 : 8) * 5 * MIN; // นัดเว้น gap ตามกติกา (มติ R1)
    }
  }
  for (let k = 0; k < o.walkins; k++) {
    const sv = pick(r, SVC.filter((x) => x.durationMin <= 90)).id;
    const spec = r() < 0.2;
    const st = spec ? pick(r, staff.filter((s) => can(s, sv))) : undefined;
    jobs.push(WK(`W${n++}`, sv, "00:00", { issuedAt: now - ri(r, 0, 90) * MIN, assignMode: st ? "SPECIFIC" : "ANY", staffId: st ? st.id : null, priority: r() < 0.1 }));
  }
  const settings: PlanSettings = {
    ...BARBER,
    queueOrder: r() < 0.3 ? "APPOINTMENT_FIRST" : "SINGLE_LINE",
    backfill: r() < 0.7,
    safetyBeforeBookingMin: pick(r, [0, 5, 10]),
    lateAction: r() < 0.25 ? "HOLD" : "RELEASE",
    priorityEnabled: r() < 0.3,
    ...o.settings,
  };
  // สลับลำดับ jobs ให้ไม่เรียง
  for (let k = jobs.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [jobs[k], jobs[m]] = [jobs[m], jobs[k]]; }
  return { now, settings, staff, services: SVC, jobs };
};

const svcOf = (i: PlanInput, id: string) => i.services.find((s) => s.id === id)!;
const staffOf = (i: PlanInput, id: string) => i.staff.find((s) => s.id === id)!;
const gapOf = (i: PlanInput, j: PlanJob, s: PlanStaff) => Math.max(svcOf(i, j.serviceId).bufferAfterMin, s.minBreakMin ?? i.settings.minBreakMin) * MIN;
const isWalkinLike = (pj: PlannedJob) => pj.state === "SCHEDULED" && (pj.kind === "WALKIN" || pj.reason === "LATE_ARRIVAL_AS_WALKIN");
const orderKey = (i: PlanInput, j: PlanJob): [number, number, string] => [
  j.priority && i.settings.priorityEnabled ? 0 : 1, j.kind === "BOOKED" ? (j.checkedInAt ?? j.issuedAt) : j.issuedAt, j.id,
];
/** มาสายหลังผ่อนผัน (ตามกติกา 3 ของใบสั่ง) — ระบุจาก input ไม่ใช่จากผล (ใบที่วางไม่ได้ก็ยังเป็นใบมาสาย) */
const isLateArrival = (i: PlanInput, j: PlanJob) =>
  j.kind === "BOOKED" && j.startAt != null && j.checkedInAt != null && !["DONE", "NO_SHOW", "CANCELLED", "IN_SERVICE"].includes(j.status) &&
  j.checkedInAt >= j.startAt + (j.policy?.graceMin ?? i.settings.graceMin) * MIN && (j.policy?.lateAction ?? i.settings.lateAction) === "RELEASE";
const cmpKey = (a: [number, number, string], b: [number, number, string]) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);

const N_PROP = 3000;
const SEED = 20261031;
type Viol = { seed: number; msg: string } | null;
const propRun = (id: string, name: string, gen: (r: Rng) => PlanInput, check: (i: PlanInput, p: Plan, r: Rng) => string | null) => {
  test(id, `${name} (${N_PROP} ชุด · seed ${SEED})`, () => {
    let v: Viol = null;
    for (let k = 0; k < N_PROP && !v; k++) {
      const r = mulberry32(SEED + k * 7919 + id.length);
      const i = gen(r);
      const p = plan(i);
      const msg = check(i, p, r);
      if (msg) v = { seed: k, msg };
    }
    return { ok: !v, exp: "ไม่มีตัวอย่างค้าน", act: v ? `ชุดที่ ${v.seed}: ${v.msg}` : "ผ่าน" };
  });
};
const genStd = (r: Rng) => genDay(r, { staffN: ri(r, 1, 6), bookings: ri(r, 0, 30), walkins: ri(r, 0, 12), overrun: true });
const genNoOverrun = (r: Rng) => genDay(r, { staffN: ri(r, 1, 6), bookings: ri(r, 0, 30), walkins: ri(r, 0, 12), overrun: false, pastPending: false, settings: { queueOrder: "SINGLE_LINE" } });
/** รวมหน้าต่างที่ซ้อน/ชิดกัน (มติ R5) */
const mergeW = (ws: { startAt: number; endAt: number }[]) => {
  const xs = [...ws].sort((a, b) => a.startAt - b.startAt);
  const out: { startAt: number; endAt: number }[] = [];
  for (const w of xs) { const l = out[out.length - 1]; if (l && w.startAt <= l.endAt) l.endAt = Math.max(l.endAt, w.endAt); else out.push({ ...w }); }
  return out;
};
const inWin = (s: PlanStaff, a: number, b: number) => mergeW(s.windows).some((w) => a >= w.startAt && b <= w.endAt);

propRun("P1", "ไม่มีงานซ้อนบนช่างเดียว (กำลังทำ + ที่วาง)", genStd, (i, p) => {
  const by = new Map<string, PlannedJob[]>();
  for (const j of p.jobs) if ((j.state === "SCHEDULED" || j.state === "IN_SERVICE") && j.staffId && j.reason !== "STAFF_UNAVAILABLE") {
    if (j.startAt == null || j.endAt == null) return `${j.jobId} ไม่มีเวลา`;
    by.set(j.staffId, [...(by.get(j.staffId) ?? []), j]);
  }
  for (const [s, xs] of by) {
    xs.sort((a, b) => a.startAt! - b.startAt! || a.endAt! - b.endAt!);
    for (let k = 1; k < xs.length; k++) if (xs[k].startAt! < xs[k - 1].endAt!) return `ช่าง ${s}: ${xs[k - 1].jobId} ${HM(xs[k - 1].startAt)}–${HM(xs[k - 1].endAt)} ซ้อน ${xs[k].jobId} ${HM(xs[k].startAt)}`;
  }
  void i;
  return null;
});
propRun("P2", "นัดที่ยืนยันไม่ถูกขยับเวลา (ไม่มีงานเลยเวลา · ไม่มีนัดค้างในอดีต · แถวเดียว ⇒ ตรงเวลานัดทุกใบ)", genNoOverrun, (i, p) => {
  for (const j of i.jobs) {
    if (j.kind !== "BOOKED" || j.startAt == null) continue;
    const pj = p.jobs.find((x) => x.jobId === j.id);
    if (!pj || pj.state !== "SCHEDULED" || pj.reason === "LATE_ARRIVAL_AS_WALKIN") continue;
    if (pj.startAt !== j.startAt) return `${j.id} นัด ${HM(j.startAt)} ได้ ${HM(pj.startAt)} (${pj.reason})`;
    if (pj.reason === "BOOKED_MOVED_STAFF" && j.checkedInAt != null) return `${j.id} เช็กอินแล้วแต่ถูกย้ายช่าง`;
  }
  return null;
});
propRun("P3", "นัดไม่ขึ้นกับ walk-in: ผลของนัดทุกใบเหมือนเดิมเมื่อตัด walk-in ที่รอออกหมด", genStd, (i, p) => {
  const i2: PlanInput = { ...i, jobs: i.jobs.filter((j) => !(j.kind === "WALKIN" && (j.status === "QUEUED" || j.status === "ARRIVED"))) };
  const p2 = plan(i2);
  for (const pj of p.jobs) {
    if (pj.kind !== "BOOKED" || isLateArrival(i, i.jobs.find((j) => j.id === pj.jobId)!)) continue;
    const q = p2.jobs.find((x) => x.jobId === pj.jobId);
    if (!q || q.staffId !== pj.staffId || q.startAt !== pj.startAt || q.state !== pj.state) return `${pj.jobId} มี walk-in ${fmt(pj)} · ไม่มี ${fmt(q)}`;
  }
  return null;
});
propRun("P4", "นัดไม่เคยถูกเลื่อนให้ช้า/เร็วผิดกติกา (≥ เวลานัด · เร็วกว่าได้เฉพาะ BOOKED_EARLY ที่มาแล้ว · ANY ย้ายแล้วเวลาเดิม)", genStd, (i, p) => {
  for (const j of i.jobs) {
    if (j.kind !== "BOOKED" || j.startAt == null) continue;
    const pj = p.jobs.find((x) => x.jobId === j.id);
    if (!pj || pj.state !== "SCHEDULED" || pj.reason === "LATE_ARRIVAL_AS_WALKIN") continue;
    if (pj.startAt! < j.startAt) {
      const arrived = j.checkedInAt != null || j.status === "ARRIVED";
      if (!(pj.reason === "BOOKED_EARLY" && arrived && i.settings.queueOrder === "APPOINTMENT_FIRST" && pj.startAt! >= i.now)) return `${j.id} ถูกดึงเร็ว ${HM(j.startAt)}→${HM(pj.startAt)} (${pj.reason})`;
    }
    if (pj.reason === "BOOKED_MOVED_STAFF" && (pj.startAt !== j.startAt || j.assignMode !== "ANY" || pj.staffId === j.staffId)) return `${j.id} ย้ายช่างผิดกติกา ${fmt(pj)}`;
    if (pj.reason === "STAFF_UNAVAILABLE" && pj.startAt !== j.startAt) return `${j.id} STAFF_UNAVAILABLE แต่เวลาเปลี่ยน ${HM(j.startAt)}→${HM(pj.startAt)} (มติ R4)`;
    if (pj.reason !== "BOOKED_MOVED_STAFF" && pj.staffId !== j.staffId) return `${j.id} เปลี่ยนช่างโดยไม่ใช่ BOOKED_MOVED_STAFF`;
  }
  return null;
});
propRun("P5", "walk-in ทุกใบเคารพกติกา 2 (เผื่อก่อนนัด · gap · หน้าต่าง · ≥ now · ทำได้ · ช่างที่ขอ)", genStd, (i, p) => {
  const occ = (s: string) => p.jobs.filter((x) => x.staffId === s && (x.state === "SCHEDULED" || x.state === "IN_SERVICE")).sort((a, b) => a.startAt! - b.startAt!);
  for (const pj of p.jobs) {
    if (!isWalkinLike(pj)) continue;
    const j = i.jobs.find((x) => x.id === pj.jobId)!;
    const s = staffOf(i, pj.staffId!);
    const st = pj.startAt!, en = pj.endAt!;
    if (st < i.now) return `${j.id} เริ่ม ${HM(st)} ก่อน now ${HM(i.now)}`;
    if (!inWin(s, st, en)) return `${j.id} ${HM(st)}–${HM(en)} นอกหน้าต่าง ${s.id}`;
    if (!(s.services === null || s.services.some((x) => x.serviceId === j.serviceId))) return `${j.id} ช่าง ${s.id} ทำ ${j.serviceId} ไม่ได้`;
    if (j.assignMode === "SPECIFIC" && pj.staffId !== j.staffId) return `${j.id} ขอ ${j.staffId} ได้ ${pj.staffId}`;
    const g = gapOf(i, j, s);
    const xs = occ(s.id);
    const k = xs.findIndex((x) => x.jobId === pj.jobId);
    const prev = xs[k - 1], next = xs[k + 1];
    if (prev) {
      const pjob = i.jobs.find((x) => x.id === prev.jobId)!;
      if (st < prev.endAt! + gapOf(i, pjob, s)) return `${j.id} ${HM(st)} ชิดงานก่อน ${prev.jobId} จบ ${HM(prev.endAt)} (gap)`;
    }
    if (next) {
      const lim = next.kind === "BOOKED" && next.reason !== "LATE_ARRIVAL_AS_WALKIN" ? next.startAt! - i.settings.safetyBeforeBookingMin * MIN : next.startAt!;
      if (en + g > lim) return `${j.id} จบ ${HM(en)}+gap เกิน ${next.jobId} ${HM(next.startAt)} (เผื่อ ${i.settings.safetyBeforeBookingMin})`;
    }
  }
  return null;
});
propRun("P6", "ใบหลังไม่ทำให้ใบก่อนช้า: ตัด walk-in ใบท้ายสุดของลำดับ ⇒ ใบอื่นเหมือนเดิมทุกใบ", genStd, (i, p) => {
  const ws = i.jobs.filter((j) => (j.kind === "WALKIN" && (j.status === "QUEUED" || j.status === "ARRIVED")));
  if (ws.length < 2) return null;
  const last = [...ws].sort((a, b) => cmpKey(orderKey(i, b), orderKey(i, a)))[0];
  const lateArr = i.jobs.filter((j) => isLateArrival(i, j));
  if (lateArr.some((j) => cmpKey(orderKey(i, j), orderKey(i, last)) > 0)) return null; // ใบมาสายอยู่ท้ายกว่า — ข้ามชุดนี้
  const p2 = plan({ ...i, jobs: i.jobs.filter((j) => j.id !== last.id) });
  for (const pj of p2.jobs) {
    const a = p.jobs.find((x) => x.jobId === pj.jobId);
    if (!a || a.staffId !== pj.staffId || a.startAt !== pj.startAt) return `ตัด ${last.id} แล้ว ${pj.jobId} เปลี่ยน ${fmt(a)} → ${fmt(pj)}`;
  }
  return null;
});
propRun("P7", "backfill ปิด ⇒ walk-in 'ใครก็ได้' เริ่มไม่ก่อนใบที่อยู่ก่อนในลำดับ", (r) => genDay(r, { staffN: ri(r, 1, 5), bookings: ri(r, 0, 25), walkins: ri(r, 2, 12), overrun: true, settings: { backfill: false } }), (i, p) => {
  const ws = p.jobs.filter((x) => x.kind === "WALKIN" && x.state === "SCHEDULED").map((x) => ({ pj: x, j: i.jobs.find((y) => y.id === x.jobId)! })).filter((x) => x.j.assignMode === "ANY");
  ws.sort((a, b) => cmpKey(orderKey(i, a.j), orderKey(i, b.j)));
  for (let k = 1; k < ws.length; k++) if (ws[k].pj.startAt! < ws[k - 1].pj.startAt!) return `${ws[k].j.id} ${HM(ws[k].pj.startAt)} ก่อน ${ws[k - 1].j.id} ${HM(ws[k - 1].pj.startAt)}`;
  return null;
});
propRun("P8", "deterministic + ไม่ขึ้นกับลำดับ array (jobs/staff/windows) + ไม่แก้ input (freeze)", genStd, (i, p, r) => {
  const sh = <V,>(xs: V[]) => { const c = [...xs]; for (let k = c.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [c[k], c[m]] = [c[m], c[k]]; } return c; };
  const p2 = plan(deepFreeze(structuredClone({ ...i, jobs: sh(i.jobs), staff: sh(i.staff).map((s) => ({ ...s, windows: sh(s.windows) })) })));
  const norm = (x: Plan) => JSON.stringify({ line: x.line, jobs: [...x.jobs].sort((a, b) => a.jobId.localeCompare(b.jobId)) });
  return norm(p) === norm(p2) ? null : "ผลต่างเมื่อสลับลำดับ/freeze";
});
propRun("P9", "ทุกงานที่ยังไม่จบมีผลครบ 1 แถว · line = SCHEDULED เรียงเวลา · waitMin ถูก", genStd, (i, p) => {
  const live = i.jobs.filter((j) => !["DONE", "NO_SHOW", "CANCELLED"].includes(j.status)).map((j) => j.id).sort();
  const got = p.jobs.map((j) => j.jobId).sort();
  if (JSON.stringify(live) !== JSON.stringify(got)) return `งานในผลไม่ครบ/เกิน: คาด ${live.length} ได้ ${got.length}`;
  const sch = p.jobs.filter((j) => j.state === "SCHEDULED");
  if (p.line.length !== sch.length || sch.some((j) => !p.line.includes(j.jobId))) return "line ไม่เท่ากับชุด SCHEDULED";
  const st = (id: string) => p.jobs.find((j) => j.jobId === id)!.startAt!;
  for (let k = 1; k < p.line.length; k++) if (st(p.line[k]) < st(p.line[k - 1])) return `line ไม่เรียงเวลา ${p.line[k - 1]}→${p.line[k]}`;
  for (const j of sch) if (j.waitMin !== Math.max(0, Math.round((j.startAt! - i.now) / MIN))) return `${j.jobId} waitMin ${j.waitMin}`;
  return null;
});

propRun("P10", "ไม่มีงานที่วางใช้เวลาในอดีต: SCHEDULED เริ่ม ≥ now (ยกเว้น STAFF_UNAVAILABLE) (มติ R1)", genStd, (i, p) => {
  for (const j of p.jobs) if (j.state === "SCHEDULED" && j.reason !== "STAFF_UNAVAILABLE" && j.startAt! < i.now) return `${j.jobId} ${j.reason} เริ่ม ${HM(j.startAt)} < now ${HM(i.now)}`;
  return null;
});
propRun("P11", "overWindow = งานที่วาง/กำลังทำไม่อยู่ในหน้าต่าง (รวมแล้ว) ของช่าง · walk-in ไม่ล้นเลย (มติ R6)", genStd, (i, p) => {
  for (const j of p.jobs) {
    const placed = (j.state === "SCHEDULED" || j.state === "IN_SERVICE") && j.staffId != null && j.startAt != null && j.endAt != null;
    const want = placed ? !inWin(staffOf(i, j.staffId!), j.startAt!, j.endAt!) : false;
    if (j.overWindow !== want) return `${j.jobId} ${fmt(j)} overWindow=${String(j.overWindow)} คาด ${want}`;
    if (isWalkinLike(j) && j.overWindow) return `${j.jobId} walk-in ล้นหน้าต่าง`;
  }
  return null;
});

// ═════════════════════════ ภาค 4 · perf ═════════════════════════
test("PERF", "12 ช่าง · นัดรวม 120 · walk-in 40 ⇒ p95 < 50 ms (200 รอบหลังอุ่น 20)", () => {
  const r = mulberry32(SEED);
  const inputs: PlanInput[] = [];
  for (let k = 0; k < 10; k++) {
    inputs.push(genDay(r, { staffN: 12, bookings: 120, walkins: 40, overrun: true, settings: { backfill: true }, now: T("11:00") + k * 15 * MIN, dense: true }));
  }
  const nb = inputs[0].jobs.filter((j) => j.kind === "BOOKED").length, nw = inputs[0].jobs.filter((j) => j.kind === "WALKIN" && j.status === "QUEUED").length;
  for (let k = 0; k < 20; k++) plan(inputs[k % inputs.length]);
  const ts: number[] = [];
  for (let k = 0; k < 200; k++) {
    const t0 = performance.now();
    plan(inputs[k % inputs.length]);
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  const p95 = ts[Math.floor(ts.length * 0.95) - 1], p50 = ts[Math.floor(ts.length * 0.5)];
  console.log(`   ⏱  perf: p50 ${p50.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms · นัด ${nb} · walk-in รอ ${nw}`);
  const minB = Math.min(...inputs.map((x) => x.jobs.filter((j) => j.kind === "BOOKED").length)); // นัดทั้งวัน (รวมที่จบแล้ว)
  return { ok: p95 < 50 && minB >= 120, exp: "p95 < 50 ms · ทุกชุดมีนัด ≥ 120", act: `p50 ${p50.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms · (นัดน้อยสุด ${minB} · ชุดแรก นัด ${nb} · walk-in รอ ${nw})` };
});

// ───────────────────────── สรุป ─────────────────────────
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC SVC B.2 ตัววางคิว planDay =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id), moduleLoaded: M !== null })}`);
process.exit(f.length > 0 ? 1 : 0);
