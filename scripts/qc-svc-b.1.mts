// QC — SVC B.1 · เวลาต่อช่าง + ช่าง↔บริการ · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.1.md (§3 สัญญา · §6 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว B.1
//        ledger/DESIGN-BOOKING-QUEUE.md R1 · BQ-1 · §9 BookingStaffService · ภาคผนวก ก #5–#11 #24 · ใบ B.0 §8 (_fallback = รุ่นแรก)
//
// กลุ่มข้อ:
//   P   staff-hours.ts (pure): ลำดับแหล่ง HR→ตารางสัปดาห์→เวลาร้าน · ลา · เพดานเวลาร้าน · พัก · ข้ามเที่ยงคืน · รวมช่วง · ไม่แก้ input · ความบริสุทธิ์
//       + TZ: รัน child ใน TZ +14 / −11 / New York ⇒ ผลเท่ากันทุกไบต์ (กับดัก getDay)
//   H   HR facade staffWindows() คืน [] (BQ-1)
//   FB  ร้านเดิม (_fallback) — getAvailableSlots เท่ารุ่นแรกทุกไบต์ (ตัวอ้างอิงรุ่นแรกในไฟล์นี้) แม้มี BookingStaffHours ค้าง · ไม่เรียก HR
//   T   แม่แบบตัดผม: ช่างพาร์ทไทม์ 13–20 ไม่มีช่องเช้า · HR ฉีด (กะ/พัก/วันหยุด) · ลาชนะกะ · ปิดร้าน/ปิดพิเศษ · ทับรายช่าง · ค่าตั้งต่อช่างใน profile · เวลาไทย
//   Z   TZ ระดับ DB (child process TZ +14/−11) เท่ากับ in-process
//   S   BookingStaffService: ไม่มีแถว = ทุกบริการ · มีแถว = เฉพาะแถว · ราคา/นาทีเฉพาะคน · ทำไม่ได้ ⇒ ไม่ได้ช่อง/จองไม่ได้ · ASSIGNED
//   X   ข้ามร้าน/ข้ามสาขา (X1) · แถวผูกบริการผิดร้าน = ไม่มีอยู่
//   ST  ไฟล์: แตะเฉพาะไฟล์ของใบ · HR เฉพาะ index.ts เพิ่มอย่างเดียว · ไม่มี getDay ดิบ · booking ใช้ HR ผ่าน facade
//   G   regression: qc-booking-* 4 · qc-hr-leave-booking · qc-svc-b.2 · qc-svc-smoke
//
// วันที่สัมพัทธ์ทั้งหมด (วันไทยถัดไป ≥ +5 วัน) · ทุกแถวอยู่ใต้ tenant ชั่วคราว slug `qc-svc-b1-*` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.1.mts
//      (ห้าม timeout ครอบ · SVC_B1_NO_REGRESSION=1 = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.1";
const BASE_SHA = "b505f61f"; // tip ของ session/svc ก่อน B.1 (หลัง B.0 · R0.7)
const PURE_REL = "src/lib/modules/booking/staff-hours.ts";
const SERVICE_REL = "src/lib/modules/booking/service.ts";
const HR_INDEX_REL = "src/lib/modules/hr/index.ts";

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc (ep-mute-scene) ⇒ exit 4 ก่อนแตะฐาน

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type HoursSource = "HR_SHIFT" | "STAFF_WEEKLY" | "UNIT_HOURS";
type MinWindow = { startMin: number; endMin: number };
type UnitHoursRow = { weekday: number; openMin: number; closeMin: number; closed: boolean };
type ClosureIn = { closed: boolean; openMin: number | null; closeMin: number | null } | null;
type StaffDayInput = {
  dateStr: string;
  order: readonly HoursSource[];
  hrShift: { windows: MinWindow[]; breaks: MinWindow[] } | null;
  weekly: { weekday: number; startMin: number; endMin: number }[];
  unitDay: MinWindow[];
  onLeave: boolean;
};
type StaffDayWindows = { source: HoursSource | null; windows: MinWindow[] };
type StaffServiceRow = { serviceId: string; durationMin: number | null; priceSatang: number | null };
type PureApi = {
  unitDayWindows: (i: { dateStr: string; hours: readonly UnitHoursRow[]; closure: ClosureIn }) => MinWindow[];
  staffDayWindows: (i: StaffDayInput) => StaffDayWindows;
  windowsToEpoch: (dateStr: string, w: readonly MinWindow[]) => { startAt: number; endAt: number }[];
  staffServiceTerms: (
    services: readonly StaffServiceRow[] | null,
    service: { id: string; durationMin: number; priceSatang: number },
  ) => { durationMin: number; priceSatang: number } | null;
};
type StaffWindowsRow = { employeeId: string; windows: MinWindow[]; breaks: MinWindow[] };
type StaffWindowsInput = { tenantId: string; unitId: string; date: string; employeeIds: string[] };
type StaffWindowsFn = (i: StaffWindowsInput) => Promise<StaffWindowsRow[]>;
type StaffDayProfile = {
  staffId: string; name: string; sortOrder: number; employeeId: string | null; dateStr: string;
  source: HoursSource | null; onLeave: boolean; windows: MinWindow[];
  services: StaffServiceRow[] | null;
  onlineSharePct: number; maxJobsPerDay: number | null; minBreakMin: number;
};
type Slot = { startMin: number; hhmm: string; staffId: string };
type BookingCtx = { tenantId: string; unitId: string };
type CreateInput = {
  tenantId: string; unitId: string; serviceId: string; staffId: string; dateStr: string; startMin: number;
  customerName: string; customerPhone: string; source?: "STAFF" | "ONLINE"; idempotencyKey?: string;
};
type BookingApi = {
  staffDayProfiles?: (ctx: BookingCtx, dateStr: string, opts?: { staffIds?: string[]; hrWindows?: StaffWindowsFn }) => Promise<StaffDayProfile[]>;
  getAvailableSlots: (tenantId: string, unitId: string, serviceId: string, staffId: string | null, dateStr: string) => Promise<Slot[]>;
  createAppointment: (i: CreateInput) => Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
};
type HrFacade = { staffWindows?: (i: StaffWindowsInput) => Promise<unknown> };
type HrService = { employeesUnavailable: (ctx: { tenantId: string; systemId: string }, ids: string[], date: Date) => Promise<Set<string>> };
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type SetRes = { ok: boolean; code?: string; issues?: unknown };
type SettingsApi = {
  setSettings: (actor: Actor, ctx: { tenantId: string }, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<SetRes>;
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<SetRes>;
};

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 200) ?? String(v); } catch { return String(v); } };
const ok = (cond: boolean, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => {
  if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`);
};
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
const W = (startMin: number, endMin: number): MinWindow => ({ startMin, endMin });
const wdOf = (ds: string): number => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const nextWd = (fromOffset: number, wd: number): string => { let d = addDays(bkkToday(), fromOffset); while (wdOf(d) !== wd) d = addDays(d, 1); return d; };
/** วันไทย + นาที → epoch ms (+07:00 คงที่) */
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * 60_000; };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === "object") { for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v); Object.freeze(o); }
  return o;
};
const sortSvc = (s: StaffServiceRow[] | null) => (s === null ? null : [...s].sort((a, b) => a.serviceId.localeCompare(b.serviceId)));

// ═══════════════ โหลดโมดูล ═══════════════
// QC_B1_PURE_PATH=<ไฟล์> ⇒ ทดสอบหมวด P กับไฟล์อื่น (ผู้คุมใช้ตรวจข้อสอบกับตัวอ้างอิงทิ้งได้) — ปกติไม่ต้องตั้ง
const PURE_PATH = process.env.QC_B1_PURE_PATH || join(ROOT, PURE_REL);
const pureLoad = existsSync(PURE_PATH)
  ? await tryImport<PureApi>(pathToFileURL(PURE_PATH).href)
  : { mod: null, err: `ยังไม่มี «${PURE_REL}»` };
const PURE = (): PureApi => {
  const m = pureLoad.mod;
  if (!m) throw new AssertFail(`โหลด staff-hours.ts ไม่ได้ (${pureLoad.err})`);
  for (const f of ["unitDayWindows", "staffDayWindows", "windowsToEpoch", "staffServiceTerms"] as const)
    if (typeof m[f] !== "function") throw new AssertFail(`staff-hours.ts ไม่มี export ${f}`);
  return m;
};
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const BK = (): BookingApi => { if (!bookingLoad.mod) throw new AssertFail(`โหลด booking/service ไม่ได้ (${bookingLoad.err})`); return bookingLoad.mod; };
const PROFILES = (): NonNullable<BookingApi["staffDayProfiles"]> => {
  const f = BK().staffDayProfiles;
  if (typeof f !== "function") throw new AssertFail("booking/service ยังไม่มี export staffDayProfiles");
  return f;
};

// ─────────── ชุดทดสอบ pure ที่ต้องได้ผลเท่ากันทุก TZ (ใช้ทั้ง parent และ child) ───────────
const PURE_DATES = ["2030-12-31", "2031-01-01", "2031-03-02", "2031-03-03", "2032-02-29", "2032-03-01", "2031-06-15"];
const onlyOpen = (wd: number): UnitHoursRow[] => Array.from({ length: 7 }, (_, w) => ({ weekday: w, openMin: 600, closeMin: 1200, closed: w !== wd }));
function pureBattery(api: PureApi) {
  return PURE_DATES.map((ds) => ({
    ds,
    unit: Array.from({ length: 7 }, (_, w) => api.unitDayWindows({ dateStr: ds, hours: onlyOpen(w), closure: null })),
    weekly: Array.from({ length: 7 }, (_, w) =>
      api.staffDayWindows({ dateStr: ds, order: ["STAFF_WEEKLY", "UNIT_HOURS"], hrShift: null, weekly: [{ weekday: w, startMin: 780, endMin: 1200 }, { weekday: (w + 3) % 7, startMin: 600, endMin: 700 }], unitDay: [W(0, 1440)], onLeave: false })),
    epoch: api.windowsToEpoch(ds, [W(600, 1200), W(1300, 1440)]),
  }));
}

// ═══════════════ โหมด probe (child process · TZ อื่น) ═══════════════
type DbProbe = { kind: "db"; tenantId: string; unitId: string; serviceId: string; staffId: string; dates: string[] };
type Probe = { kind: "pure" } | DbProbe;
async function dbProbe(p: DbProbe) {
  const out: { date: string; profiles: { staffId: string; source: HoursSource | null; windows: MinWindow[]; onLeave: boolean }[]; slotsStaff: Slot[]; slotsAny: Slot[] }[] = [];
  for (const date of p.dates) {
    const prof = await PROFILES()({ tenantId: p.tenantId, unitId: p.unitId }, date);
    out.push({
      date,
      profiles: prof.map((x) => ({ staffId: x.staffId, source: x.source, windows: x.windows, onLeave: x.onLeave })),
      slotsStaff: await BK().getAvailableSlots(p.tenantId, p.unitId, p.serviceId, p.staffId, date),
      slotsAny: await BK().getAvailableSlots(p.tenantId, p.unitId, p.serviceId, null, date),
    });
  }
  return out;
}
if (process.env.QC_B1_PROBE) {
  const p = JSON.parse(process.env.QC_B1_PROBE) as Probe;
  try {
    const res = p.kind === "pure" ? pureBattery(PURE()) : await dbProbe(p);
    console.log(`PROBE_JSON=${JSON.stringify(res)}`);
    process.exit(0);
  } catch (e) {
    console.error(`PROBE_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}
const TZS = ["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/New_York"];
function spawnProbe(tz: string, payload: Probe): unknown {
  const env: NodeJS.ProcessEnv = { ...process.env, TZ: tz, QC_B1_PROBE: JSON.stringify(payload) };
  const r = spawnSync(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
  const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("PROBE_JSON="));
  if (!line) throw new AssertFail(`probe TZ=${tz} exit=${r.status ?? r.signal} ${(r.stderr ?? "").split("\n").filter(Boolean).slice(-2).join(" ¦ ").slice(0, 200)}`);
  return JSON.parse(line.slice("PROBE_JSON=".length)) as unknown;
}

// ═══════════════ P. staff-hours.ts (pure) ═══════════════
console.log("\n── P: staff-hours.ts (pure · ใบสั่ง §3.1) ──");
const PD = "2031-01-15";
const PWD = wdOf(PD);
const base = (o: Partial<StaffDayInput> = {}): StaffDayInput => ({
  dateStr: PD, order: ["HR_SHIFT", "STAFF_WEEKLY", "UNIT_HOURS"], hrShift: null, weekly: [], unitDay: [W(600, 1200)], onLeave: false, ...o,
});
const SDW = (o: Partial<StaffDayInput> = {}) => PURE().staffDayWindows(deepFreeze(base(o)));
const wk = (startMin: number, endMin: number, weekday = PWD) => ({ weekday, startMin, endMin });

await st("P-1", "HR มีกะ ⇒ ใช้กะ (ตัดด้วยเวลาร้าน) · source HR_SHIFT", () => {
  eq(SDW({ hrShift: { windows: [W(540, 900)], breaks: [] }, weekly: [wk(780, 1200)] }), { source: "HR_SHIFT", windows: [W(600, 900)] }, "ผล");
});
await st("P-2", "ไม่มีกะ ⇒ ตารางสัปดาห์ (ช่างพาร์ทไทม์ 13:00–20:00 ไม่มีช่วงเช้า) · source STAFF_WEEKLY", () => {
  eq(SDW({ weekly: [wk(780, 1200), wk(600, 700, (PWD + 1) % 7)] }), { source: "STAFF_WEEKLY", windows: [W(780, 1200)] }, "ผล");
});
await st("P-3", "HR คืนแถวแต่ windows=[] (วันหยุดตามกะ) ⇒ [] ไม่ตกไปตารางสัปดาห์/เวลาร้าน", () => {
  eq(SDW({ hrShift: { windows: [], breaks: [] }, weekly: [wk(780, 1200)] }), { source: "HR_SHIFT", windows: [] }, "ผล");
});
await st("P-4", "มีตารางสัปดาห์แต่ไม่มีแถวของวันนี้ ⇒ [] (วันหยุดช่าง) · source STAFF_WEEKLY", () => {
  eq(SDW({ weekly: [wk(600, 1200, (PWD + 2) % 7)] }), { source: "STAFF_WEEKLY", windows: [] }, "ผล");
});
await st("P-5", "ไม่มีกะ ไม่มีตาราง ⇒ เวลาร้าน · source UNIT_HOURS", () => {
  eq(SDW(), { source: "UNIT_HOURS", windows: [W(600, 1200)] }, "ผล");
});
await st("P-6", "order [UNIT_HOURS] (_fallback ร้านเดิม) ⇒ ไม่สนกะ/ตารางสัปดาห์", () => {
  eq(SDW({ order: ["UNIT_HOURS"], hrShift: { windows: [W(700, 800)], breaks: [] }, weekly: [wk(780, 1200)] }), { source: "UNIT_HOURS", windows: [W(600, 1200)] }, "ผล");
});
await st("P-7", "ลำดับตาม order: [STAFF_WEEKLY, HR_SHIFT] ⇒ ตารางสัปดาห์ชนะกะ", () => {
  eq(SDW({ order: ["STAFF_WEEKLY", "HR_SHIFT", "UNIT_HOURS"], hrShift: { windows: [W(600, 700)], breaks: [] }, weekly: [wk(780, 1200)] }), { source: "STAFF_WEEKLY", windows: [W(780, 1200)] }, "ผล");
});
await st("P-8", "order [HR_SHIFT] แต่ไม่มีกะ ⇒ { source: null, windows: [] }", () => {
  eq(SDW({ order: ["HR_SHIFT"], weekly: [wk(780, 1200)] }), { source: null, windows: [] }, "ผล");
});
await st("P-9", "ลา (onLeave) ⇒ windows [] ทุกแหล่ง", () => {
  for (const o of [{ hrShift: { windows: [W(600, 900)], breaks: [] } }, { weekly: [wk(780, 1200)] }, {}] as Partial<StaffDayInput>[])
    eq(SDW({ ...o, onLeave: true }).windows, [], `ลา ${fmt(o)}`);
});
await st("P-10", "เพดานเวลาร้าน: ตาราง 08:00–22:00 ร้าน 10–20 ⇒ 10–20 · ร้านปิด (unitDay []) ⇒ [] แม้มีกะ", () => {
  eq(SDW({ weekly: [wk(480, 1320)] }).windows, [W(600, 1200)], "ตัดด้วยเวลาร้าน");
  eq(SDW({ unitDay: [], hrShift: { windows: [W(600, 900)], breaks: [] } }).windows, [], "ร้านปิด + กะ");
  eq(SDW({ unitDay: [W(840, 1020)], weekly: [wk(780, 1200)] }).windows, [W(840, 1020)], "ปิดพิเศษ 14–17");
});
await st("P-11", "กะ HR หักพัก: 09:00–15:00 พัก 12:00–13:00 (ร้าน 10–20) ⇒ 10–12 + 13–15", () => {
  eq(SDW({ hrShift: { windows: [W(540, 900)], breaks: [W(720, 780)] } }).windows, [W(600, 720), W(780, 900)], "ผล");
});
await st("P-12", "ข้ามเที่ยงคืน: ตาราง 20:00–26:00 ⇒ 20:00–24:00 · กะ 22:00–03:00 ⇒ 22:00–24:00 · แถวเมื่อวานไม่ยกมา", () => {
  eq(SDW({ unitDay: [W(0, 1440)], weekly: [wk(1200, 1560)] }).windows, [W(1200, 1440)], "ตาราง");
  eq(SDW({ unitDay: [W(0, 1440)], hrShift: { windows: [W(1320, 1620)], breaks: [] } }).windows, [W(1320, 1440)], "กะ");
  eq(SDW({ unitDay: [W(0, 1440)], weekly: [wk(1200, 1560, (PWD + 6) % 7), wk(600, 700, (PWD + 3) % 7)] }), { source: "STAFF_WEEKLY", windows: [] }, "แถวเมื่อวาน");
}, "MAJOR");
await st("P-13", "แถวหลายช่วง: ซ้อน/ชิด ⇒ รวม · เรียง · แถวผิด (start≥end · weekday 7) ทิ้ง · เหลือ 0 แถว = ไม่มีตารางสัปดาห์", () => {
  eq(SDW({ weekly: [wk(900, 1000), wk(600, 700), wk(650, 750), wk(750, 800), wk(1100, 1100), wk(1150, 1100)] }).windows, [W(600, 800), W(900, 1000)], "รวมช่วง");
  eq(SDW({ weekly: [wk(1100, 1100), { weekday: 7, startMin: 600, endMin: 700 }] }), { source: "UNIT_HOURS", windows: [W(600, 1200)] }, "แถวผิดทั้งหมด");
  eq(SDW({ hrShift: { windows: [W(800, 900), W(600, 700), W(700, 750)], breaks: [] } }).windows, [W(600, 750), W(800, 900)], "กะหลายช่วง");
});
await st("P-14", "ไม่แก้ input (deep-freeze) · เรียกซ้ำได้ผลเดิม · ไม่ขึ้นกับลำดับแถว", () => {
  const a = SDW({ weekly: [wk(900, 1000), wk(600, 700)] });
  const b = SDW({ weekly: [wk(600, 700), wk(900, 1000)] });
  eq(a, b, "สลับลำดับแถว");
  eq(SDW({ weekly: [wk(900, 1000), wk(600, 700)] }), a, "เรียกซ้ำ");
});
await st("P-15", "unitDayWindows = ตรรกะเวลาร้านรุ่นแรกทุกกรณี", () => {
  const P = PURE();
  const all = Array.from({ length: 7 }, (_, w) => ({ weekday: w, openMin: 600, closeMin: 1200, closed: false }));
  const closedWd = all.map((r) => (r.weekday === PWD ? { ...r, closed: true } : r));
  const call = (hours: UnitHoursRow[], closure: ClosureIn) => P.unitDayWindows(deepFreeze({ dateStr: PD, hours, closure }));
  eq(call(all, null), [W(600, 1200)], "วันเปิดปกติ");
  eq(call(closedWd, null), [], "weekday ปิด");
  eq(call(all, { closed: true, openMin: null, closeMin: null }), [], "closure ปิดทั้งวัน");
  eq(call(all, { closed: false, openMin: 840, closeMin: 1020 }), [W(840, 1020)], "closure เวลาพิเศษ");
  eq(call(closedWd, { closed: false, openMin: null, closeMin: null }), [W(600, 1200)], "closure เปิดบน weekday ปิด ไม่ใส่เวลา ⇒ เวลาของ weekday (รุ่นแรก)");
  eq(call(all, { closed: false, openMin: 900, closeMin: null }), [W(900, 1200)], "closure ใส่แค่เวลาเปิด");
  eq(call(all, { closed: false, openMin: 1000, closeMin: 900 }), [], "closure ปิด ≤ เปิด");
  eq(call(all.map((r) => ({ ...r, openMin: 700, closeMin: 700 })), null), [], "weekday ปิด = เปิด");
});
await st("P-16", "windowsToEpoch: เวลาไทย +07:00 (10:00 = 03:00Z · 24:00 = 17:00Z)", () => {
  eq(PURE().windowsToEpoch(PD, [W(600, 1200), W(1300, 1440)]), [{ startAt: bkkMs(PD, 600), endAt: bkkMs(PD, 1200) }, { startAt: bkkMs(PD, 1300), endAt: bkkMs(PD, 1440) }], "ผล");
  eq(PURE().windowsToEpoch(PD, [W(600, 1200)])[0].startAt, Date.UTC(2031, 0, 15, 3, 0), "10:00 ไทย");
});
await st("P-17", "staffServiceTerms: null=ทุกบริการ · ไม่มีแถวบริการนี้/[] ⇒ null · แถว null ⇒ ตามบริการ · ค่าเฉพาะคนชนะ", () => {
  const P = PURE();
  const svc = deepFreeze({ id: "s1", durationMin: 60, priceSatang: 30000 });
  eq(P.staffServiceTerms(null, svc), { durationMin: 60, priceSatang: 30000 }, "null");
  eq(P.staffServiceTerms(deepFreeze([]), svc), null, "[]");
  eq(P.staffServiceTerms(deepFreeze([{ serviceId: "s2", durationMin: 45, priceSatang: 1 }]), svc), null, "ไม่มีแถว s1");
  eq(P.staffServiceTerms(deepFreeze([{ serviceId: "s1", durationMin: null, priceSatang: null }]), svc), { durationMin: 60, priceSatang: 30000 }, "แถว null");
  eq(P.staffServiceTerms(deepFreeze([{ serviceId: "s1", durationMin: 45, priceSatang: null }]), svc), { durationMin: 45, priceSatang: 30000 }, "นาทีเฉพาะคน");
  eq(P.staffServiceTerms(deepFreeze([{ serviceId: "s1", durationMin: null, priceSatang: 0 }]), svc), { durationMin: 60, priceSatang: 0 }, "ราคา 0 เฉพาะคน (ไม่ใช่ falsy ⇒ ราคาบริการ)");
});
await st("P-18", "ความบริสุทธิ์: import เฉพาะ ./slots (+ import type) · ไม่มี prisma/db/next/server · ไม่มี Date.now / new Date() / Math.random", () => {
  const p = PURE_PATH;
  ok(existsSync(p), `ยังไม่มี «${PURE_REL}»`);
  const src = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const froms = [...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const bad = froms.filter((f) => f !== "./slots");
  ok(bad.length === 0, `import ที่ไม่อนุญาต: ${bad.join(", ")}`);
  ok(!/\bimport\s*\(/.test(src) && !/\brequire\s*\(/.test(src), "มี dynamic import/require");
  ok(!/["']use server["']/.test(src), "มี use server");
  ok(!/Date\.now\s*\(|new\s+Date\s*\(\s*\)|Math\.random/.test(src), "มี Date.now / new Date() / Math.random");
});
await st("P-TZ", "กับดัก getDay: ชุด pure (7 วันรวมข้ามปี/29 ก.พ. × 7 weekday) ใน TZ +14 · −11 · New York = in-process ทุกไบต์ และถูกวัน", () => {
  const mine = pureBattery(PURE());
  for (const b of mine) {
    const wd = wdOf(b.ds);
    eq(b.unit.map((x) => x.length), Array.from({ length: 7 }, (_, w) => (w === wd ? 1 : 0)), `unitDayWindows ${b.ds} (weekday ${wd})`);
    eq(b.weekly.map((x) => x.windows), Array.from({ length: 7 }, (_, w) => (w === wd ? [W(780, 1200)] : (w + 3) % 7 === wd ? [W(600, 700)] : [])), `staffDayWindows ${b.ds}`);
    eq(b.epoch[0].startAt, bkkMs(b.ds, 600), `windowsToEpoch ${b.ds}`);
  }
  for (const tz of TZS) eq(spawnProbe(tz, { kind: "pure" }), JSON.parse(JSON.stringify(mine)) as unknown, `TZ=${tz}`);
});

// ═══════════════ H. HR facade ═══════════════
console.log("\n── H: HR facade staffWindows (BQ-1) ──");
await st("H-1", "hr/index.ts export staffWindows(input) ⇒ Promise<[]> (ยังไม่มีกะบน main)", async () => {
  const h = await tryImport<HrFacade>("@/lib/modules/hr");
  ok(!!h.mod, `โหลด hr facade ไม่ได้ (${h.err})`);
  const f = h.mod?.staffWindows;
  ok(typeof f === "function", "ไม่มี export staffWindows");
  if (typeof f === "function") eq(await f({ tenantId: "t", unitId: "u", date: "2031-01-15", employeeIds: ["e1", "e2"] }), [], "ผล");
});
await st("H-2", "hr/index.ts ยังไม่เปิดทาง DB (ไม่ import @/lib/core/db / PrismaClient) · ไม่ลบบรรทัดเดิม", () => {
  const src = readFileSync(join(ROOT, HR_INDEX_REL), "utf8");
  ok(!/@\/lib\/core\/db|new PrismaClient/.test(src), "มี import db");
  const del = execFileSync("git", ["-C", ROOT, "diff", "-w", "--ignore-blank-lines", "-U0", BASE_SHA, "--", HR_INDEX_REL], { encoding: "utf8" })
    .split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
  ok(del.length === 0, `ลบ/แก้บรรทัดเดิม ${del.length}: ${del.slice(0, 2).join(" | ")}`);
}, "MAJOR");

// ═══════════════ ต่อฐาน ═══════════════
pg.defaults.parseInputDatesAsUTC = true; // Prisma เก็บ timestamp(3) without time zone เป็น UTC
pg.types.setTypeParser(1114, (s: string) => new Date(`${s.replace(" ", "T")}Z`));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb1_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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

const SLUG = "qc-svc-b1-";
const USER_MAIL = "qc-svc-b1-";
const tenantIds: string[] = [];
/** ลบทุกตารางที่มี tenantId ของร้านทดสอบ (วนหลายรอบจน FK ปล่อย) แล้วลบ Tenant */
async function cleanup(ids: string[]) {
  if (!ids.length) return;
  const tables = (await q<{ table_name: string }>(`SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.table_name);
  let pending = tables;
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) {
      try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [ids]); } catch { failed.push(t); }
    }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [ids]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}

// ─────────── ตัวอ้างอิงรุ่นแรก (getAvailableSlots ก่อน B.1 · อ่านฐานตรงด้วย pg) ───────────
const hrSvcLoad = await tryImport<HrService>("@/lib/modules/hr/service");
type SlotStaff = { id: string; windows: MinWindow[]; durationMin: number };
/** แกนคำนวณช่องแบบ slots.ts (ช่องละ 15 · ช่างแรกต่อเวลา) */
function coreSlots(ds: string, staff: SlotStaff[], busy: { staffId: string; startAt: Date; endAt: Date }[], bufferMin: number, nowMs: number): Slot[] {
  const byTime = new Map<number, string>();
  for (const s of staff) {
    const mine = busy.filter((b) => b.staffId === s.id);
    for (const w of s.windows) {
      for (let t = w.startMin; t + s.durationMin <= w.endMin; t += 15) {
        const a = bkkMs(ds, t);
        const z = bkkMs(ds, t + s.durationMin + bufferMin);
        if (a <= nowMs) continue;
        if (mine.some((b) => a < b.endAt.getTime() && z > b.startAt.getTime())) continue;
        if (!byTime.has(t)) byTime.set(t, s.id);
      }
    }
  }
  return [...byTime.entries()].sort((x, y) => x[0] - y[0]).map(([startMin, sid]) => ({ startMin, hhmm: hhmm(startMin), staffId: sid }));
}
async function activeStaff(tid: string, uid: string, staffId: string | null) {
  return q<{ id: string; employeeId: string | null }>(
    `SELECT id, "employeeId" FROM "BookingStaff" WHERE "tenantId" = $1 AND "unitId" = $2 AND active ${staffId ? `AND id = $3` : ""} ORDER BY "sortOrder", "createdAt", id`,
    staffId ? [tid, uid, staffId] : [tid, uid],
  );
}
async function busyOf(tid: string, uid: string, ids: string[], ds: string) {
  return q<{ staffId: string; startAt: Date; endAt: Date }>(
    `SELECT "staffId", "startAt", "endAt" FROM "Appointment" WHERE "tenantId" = $1 AND "unitId" = $2 AND "staffId" = ANY($3::text[]) AND "startAt" >= $4 AND "startAt" < $5 AND status NOT IN ('CANCELLED','NO_SHOW')`,
    [tid, uid, ids, new Date(bkkMs(ds, 0)), new Date(bkkMs(ds, 1440))],
  );
}
async function legacySlots(tid: string, uid: string, serviceId: string, staffId: string | null, ds: string): Promise<Slot[]> {
  const [svc] = await q<{ durationMin: number; bufferMin: number }>(`SELECT "durationMin", "bufferMin" FROM "BookingService" WHERE id = $1 AND "tenantId" = $2 AND "unitId" = $3 AND active AND bookable`, [serviceId, tid, uid]);
  if (!svc) return [];
  const wd = wdOf(ds);
  const hrows = await q<{ weekday: number; openMin: number; closeMin: number; closed: boolean }>(`SELECT weekday, "openMin", "closeMin", closed FROM "BookingHours" WHERE "tenantId" = $1 AND "unitId" = $2`, [tid, uid]);
  const day = hrows.find((h) => h.weekday === wd) ?? { weekday: wd, openMin: 600, closeMin: 1200, closed: false };
  const [closure] = await q<{ closed: boolean; openMin: number | null; closeMin: number | null }>(`SELECT closed, "openMin", "closeMin" FROM "BookingClosure" WHERE "tenantId" = $1 AND "unitId" = $2 AND date = $3`, [tid, uid, ds]);
  if (closure?.closed) return [];
  const openMin = closure && !closure.closed ? (closure.openMin ?? day.openMin) : day.openMin;
  const closeMin = closure && !closure.closed ? (closure.closeMin ?? day.closeMin) : day.closeMin;
  if (!closure && day.closed !== false) return [];
  if (closeMin <= openMin) return [];
  const all = await activeStaff(tid, uid, staffId);
  if (!all.length) return [];
  const linked = all.filter((s): s is { id: string; employeeId: string } => !!s.employeeId);
  const leaveEmp = new Set<string>();
  if (linked.length) {
    const hrS = hrSvcLoad.mod;
    if (!hrS) throw new AssertFail(`โหลด hr/service ไม่ได้ (${hrSvcLoad.err})`);
    const systems = await q<{ id: string }>(`SELECT id FROM "AppSystem" WHERE "tenantId" = $1 AND type = 'HR' AND active`, [tid]);
    for (const sy of systems) for (const e of await hrS.employeesUnavailable({ tenantId: tid, systemId: sy.id }, linked.map((s) => s.employeeId), new Date(`${ds}T00:00:00Z`))) leaveEmp.add(e);
  }
  const list = all.filter((s) => !(s.employeeId && leaveEmp.has(s.employeeId)));
  if (!list.length) return [];
  const busy = await busyOf(tid, uid, list.map((s) => s.id), ds);
  return coreSlots(ds, list.map((s) => ({ id: s.id, windows: [W(openMin, closeMin)], durationMin: svc.durationMin })), busy, svc.bufferMin, Date.now());
}

// ═══════════════ ฐานข้อมูล ═══════════════
const settingsLoad = await tryImport<SettingsApi>("@/lib/core/settings");
const SETTINGS = (): SettingsApi => { if (!settingsLoad.mod) throw new AssertFail(`โหลด core/settings ไม่ได้ (${settingsLoad.err})`); return settingsLoad.mod; };
const RUN = Date.now().toString(36);
const D_OPEN = nextWd(5, 3); // พุธ
const D_SUN = nextWd(5, 0);
const D_MON = nextWd(5, 1); // ร้านปิดทุกจันทร์
const D_LEAVE = nextWd(5, 2); // อังคาร — ช่างเอช ลา
const D_CL_CLOSED = nextWd(5, 4); // พฤหัส — ปิดพิเศษทั้งวัน
const D_CL_SPECIAL = nextWd(5, 5); // ศุกร์ — เปิด 14:00–17:00
const D_CL_OPENMON = nextWd(12, 1); // จันทร์ถัดไป — closure เปิดไม่ใส่เวลา (กรณีแปลกรุ่นแรก)
const DATES = [D_OPEN, D_SUN, D_MON, D_LEAVE, D_CL_CLOSED, D_CL_SPECIAL, D_CL_OPENMON];
console.log(`\n(วันที่ทดสอบ: พุธ ${D_OPEN} · อา ${D_SUN} · จ ${D_MON} · ลา ${D_LEAVE} · ปิด ${D_CL_CLOSED} · ปิดพิเศษ ${D_CL_SPECIAL} · จ เปิดพิเศษ ${D_CL_OPENMON})`);

const ids = {
  tA: `svcb1_tA_${RUN}`, tB: `svcb1_tB_${RUN}`, uA1: `svcb1_uA1_${RUN}`, uA2: `svcb1_uA2_${RUN}`, uB1: `svcb1_uB1_${RUN}`,
  hrSys: `svcb1_hr_${RUN}`, empH: `svcb1_empH_${RUN}`,
  S60: `svcb1_S60_${RUN}`, S30: `svcb1_S30_${RUN}`, SA2: `svcb1_SA2_${RUN}`, SB: `svcb1_SB_${RUN}`,
  stF: `svcb1_stF_${RUN}`, stP: `svcb1_stP_${RUN}`, stH: `svcb1_stH_${RUN}`, stS: `svcb1_stS_${RUN}`, stX: `svcb1_stX_${RUN}`, stR: `svcb1_stR_${RUN}`,
  stA2: `svcb1_stA2_${RUN}`, stB: `svcb1_stB_${RUN}`,
  owner: `svcb1_owner_${RUN}`,
};
const ctxA1: BookingCtx = { tenantId: ids.tA, unitId: ids.uA1 };
const STAFF_A1 = [ids.stF, ids.stP, ids.stH, ids.stS, ids.stX, ids.stR];
const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
let phone = 0;
const mkAppt = (o: Partial<CreateInput>): CreateInput => ({
  tenantId: ids.tA, unitId: ids.uA1, serviceId: ids.S60, staffId: ids.stF, dateStr: D_OPEN, startMin: 600,
  customerName: "ลูกค้า QC B1", customerPhone: `08${String(10_000_000 + ++phone).slice(-8)}`, source: "STAFF", idempotencyKey: rid("idem"), ...o,
});
const apptRow = async (id: string) => (await q<{ priceSatang: number; depositSatang: number; startAt: Date; endAt: Date; staffId: string }>(`SELECT "priceSatang", "depositSatang", "startAt", "endAt", "staffId" FROM "Appointment" WHERE id = $1`, [id]))[0];
const countAppts = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n;
const prof = async (ds: string, o?: { staffIds?: string[]; hrWindows?: StaffWindowsFn }, c: BookingCtx = ctxA1) => PROFILES()(c, ds, o);
const byStaff = (ps: StaffDayProfile[], id: string): StaffDayProfile => { const p = ps.find((x) => x.staffId === id); if (!p) throw new AssertFail(`ไม่มี profile ของ ${id}`); return p; };

let setupOk = false;
try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();

  // ── สร้างข้อมูล ──
  try {
    tenantIds.push(ids.tA, ids.tB);
    await insertRow("Tenant", { id: ids.tA, name: "QC B1 ร้าน A", slug: `${SLUG}a-${RUN}`, updatedAt: new Date() });
    await insertRow("Tenant", { id: ids.tB, name: "QC B1 ร้าน B", slug: `${SLUG}b-${RUN}`, updatedAt: new Date() });
    for (const [id, t, n] of [[ids.uA1, ids.tA, "a1"], [ids.uA2, ids.tA, "a2"], [ids.uB1, ids.tB, "b1"]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `สาขา ${n}`, slug: `b1-${n}-${RUN}`, updatedAt: new Date() });
    await insertRow("AppSystem", { id: ids.hrSys, tenantId: ids.tA, type: "HR", name: "ทีมงาน", updatedAt: new Date() });
    await insertRow("HrEmployee", { id: ids.empH, tenantId: ids.tA, systemId: ids.hrSys, name: "ช่างเอช", updatedAt: new Date() });
    // เวลาร้าน A1: 10:00–20:00 ทุกวัน ปิดวันจันทร์
    for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: ids.tA, unitId: ids.uA1, weekday: w, openMin: 600, closeMin: 1200, closed: w === 1, updatedAt: new Date() });
    const svc = async (id: string, t: string, u: string, name: string, durationMin: number, priceSatang: number, bufferMin: number, sortOrder: number) =>
      insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin, priceSatang, depositSatang: 5000, bufferMin, sortOrder, updatedAt: new Date() });
    await svc(ids.S60, ids.tA, ids.uA1, "ตัดผมชาย", 60, 30000, 0, 1);
    await svc(ids.S30, ids.tA, ids.uA1, "สระไดร์", 30, 15000, 5, 2);
    await svc(ids.SA2, ids.tA, ids.uA2, "ตัดผม (สาขา 2)", 60, 30000, 0, 1);
    await svc(ids.SB, ids.tB, ids.uB1, "ตัดผม (ร้าน B)", 60, 30000, 0, 1);
    let ord = 0;
    const staff = async (id: string, t: string, u: string, name: string, sortOrder: number, employeeId: string | null = null) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder, employeeId, createdAt: new Date(Date.now() - 60_000 + ++ord * 1000), updatedAt: new Date() });
    await staff(ids.stF, ids.tA, ids.uA1, "ช่างเต็ม", 1);
    await staff(ids.stP, ids.tA, ids.uA1, "ช่างพาร์ทไทม์", 2);
    await staff(ids.stH, ids.tA, ids.uA1, "ช่างเอช", 3, ids.empH);
    await staff(ids.stS, ids.tA, ids.uA1, "ช่างเฉพาะ", 4);
    await staff(ids.stX, ids.tA, ids.uA1, "ช่างเอ็กซ์", 5);
    await staff(ids.stR, ids.tA, ids.uA1, "ช่างอาร์", 9);
    await staff(ids.stA2, ids.tA, ids.uA2, "ช่างสาขา 2", 1);
    await staff(ids.stB, ids.tB, ids.uB1, "ช่างร้าน B", 1);
    // ช่างพาร์ทไทม์: ตารางสัปดาห์ จ–ส 13:00–20:00 (ไม่มีวันอาทิตย์) — ร้านเดิมถือเป็นแถวค้าง (รุ่นแรกไม่อ่าน)
    for (let w = 1; w <= 6; w++) await insertRow("BookingStaffHours", { id: rid("sh"), tenantId: ids.tA, unitId: ids.uA1, staffId: ids.stP, weekday: w, startMin: 780, endMin: 1200 });
    // นัดที่มีอยู่
    const ap = async (staffId: string, ds: string, a: number, z: number, status: string) =>
      insertRow("Appointment", { id: rid("ap"), tenantId: ids.tA, unitId: ids.uA1, staffId, serviceId: ids.S60, startAt: new Date(bkkMs(ds, a)), endAt: new Date(bkkMs(ds, z)), status, customerName: "นัดเดิม", customerPhone: "0800000000", updatedAt: new Date() });
    await ap(ids.stF, D_OPEN, 660, 720, "CONFIRMED");
    await ap(ids.stF, D_OPEN, 780, 840, "CANCELLED");
    await ap(ids.stP, D_OPEN, 900, 960, "PENDING");
    await ap(ids.stF, D_CL_SPECIAL, 840, 900, "CONFIRMED");
    // วันปิด/เปิดพิเศษ
    await insertRow("BookingClosure", { id: rid("cl"), tenantId: ids.tA, unitId: ids.uA1, date: D_CL_CLOSED, closed: true });
    await insertRow("BookingClosure", { id: rid("cl"), tenantId: ids.tA, unitId: ids.uA1, date: D_CL_SPECIAL, closed: false, openMin: 840, closeMin: 1020 });
    await insertRow("BookingClosure", { id: rid("cl"), tenantId: ids.tA, unitId: ids.uA1, date: D_CL_OPENMON, closed: false, openMin: null, closeMin: null });
    // ช่างเอช ลาอนุมัติแล้ว (C-2)
    await insertRow("HrLeave", { id: rid("lv"), tenantId: ids.tA, systemId: ids.hrSys, employeeId: ids.empH, type: "PERSONAL", fromDate: D_LEAVE, toDate: D_LEAVE, status: "APPROVED" });
    // เจ้าของ (applyTemplate / setSettings)
    await insertRow("User", { id: ids.owner, email: `${USER_MAIL}owner-${RUN}@qc.invalid`, name: "QC B1 owner", updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: ids.tA, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    setupOk = true;
  } catch (e) {
    console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`);
  }
  const need = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");

  // ═══════════════ FB. ร้านเดิม (_fallback) ═══════════════
  console.log("\n── FB: ร้านเดิม (ยังไม่เลือกแม่แบบ) = รุ่นแรก ──");
  await st("FB-1", "staffDayProfiles ร้านเดิม: ทุกช่าง source UNIT_HOURS 10–20 (ตารางสัปดาห์ค้างของช่างพาร์ทไทม์ไม่มีผล) · services null · ค่าตั้ง 100/null/0", async () => {
    need();
    const ps = await prof(D_OPEN);
    eq(ps.map((p) => p.staffId), STAFF_A1, "ช่างของสาขา (เรียง sortOrder)");
    for (const p of ps) {
      eq([p.source, p.windows, p.onLeave, p.services], ["UNIT_HOURS", [W(600, 1200)], false, null], `ช่าง ${p.name}`);
      eq([p.onlineSharePct, p.maxJobsPerDay, p.minBreakMin], [100, null, 0], `ค่าตั้ง ${p.name}`);
      eq([p.dateStr, p.name.length > 0, typeof p.sortOrder], [D_OPEN, true, "number"], `field ${p.staffId}`);
    }
    eq(byStaff(ps, ids.stH).employeeId, ids.empH, "employeeId ช่างเอช");
  });
  await st("FB-2", "ร้านเดิม (order [UNIT_HOURS]) ⇒ ไม่เรียก HR เลย", async () => {
    need();
    let calls = 0;
    await prof(D_OPEN, { hrWindows: async () => { calls++; return [{ employeeId: ids.empH, windows: [W(600, 700)], breaks: [] }]; } });
    eq(calls, 0, "จำนวนครั้งที่เรียก HR");
  });
  await st("FB-3", "getAvailableSlots ร้านเดิม = รุ่นแรกทุกไบต์ (7 วัน: ปกติ/อาทิตย์/จันทร์ปิด/ลา/ปิดพิเศษ/เปิดพิเศษ/จันทร์เปิดพิเศษ × ช่าง ใครก็ได้/เต็ม/พาร์ทไทม์/เอช × 2 บริการ)", async () => {
    need();
    const bad: string[] = [];
    let nonEmpty = 0;
    for (const ds of DATES) for (const sid of [null, ids.stF, ids.stP, ids.stH]) for (const sv of [ids.S60, ids.S30]) {
      const got = await BK().getAvailableSlots(ids.tA, ids.uA1, sv, sid, ds);
      const want = await legacySlots(ids.tA, ids.uA1, sv, sid, ds);
      if (want.length) nonEmpty++;
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${ds}/${sid?.split("_")[1] ?? "any"}/${sv.split("_")[1]}: ได้ ${got.length} ช่อง ${fmt(got.slice(0, 2))} ต้อง ${want.length} ${fmt(want.slice(0, 2))}`);
    }
    ok(nonEmpty >= 20, `ตัวอ้างอิงได้ช่องไม่ว่างแค่ ${nonEmpty} ชุด (ข้อมูลทดสอบผิด)`);
    ok(bad.length === 0, `${bad.length} ชุดไม่เท่ารุ่นแรก: ${bad.slice(0, 3).join(" · ")}`);
  });
  await st("FB-4", "ร้านเดิม: วันลา ⇒ ช่างเอช onLeave + windows [] (C-2 เดิม)", async () => {
    need();
    const p = byStaff(await prof(D_LEAVE), ids.stH);
    eq([p.onLeave, p.windows], [true, []], "ช่างเอช");
  });
  await st("FB-5", "createAppointment ร้านเดิม: ราคา/มัดจำ/endAt ตามบริการ (สระไดร์ 30+buffer 5) · จองนอกตารางสัปดาห์ค้างได้ (รุ่นแรกไม่ตรวจ)", async () => {
    need();
    const r = await BK().createAppointment(mkAppt({ serviceId: ids.S30, staffId: ids.stP, dateStr: D_SUN, startMin: 600 }));
    ok(r.ok, `จองไม่ได้: ${r.ok ? "" : r.reason}`);
    if (r.ok) {
      const a = await apptRow(r.id);
      eq([a.priceSatang, a.depositSatang, a.startAt.getTime(), a.endAt.getTime() - a.startAt.getTime()], [15000, 5000, bkkMs(D_SUN, 600), 35 * 60_000], "แถวนัด");
    }
  });

  // ═══════════════ T. แม่แบบตัดผม ═══════════════
  console.log("\n── T: แม่แบบตัดผม (กะ HR → ตารางสัปดาห์ → เวลาร้าน) ──");
  let tplOk = false;
  await st("T-0", "applyTemplate BARBER (สาขา A1) สำเร็จ", async () => {
    need();
    const a = await SETTINGS().applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: ids.uA1, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    ok(a.ok, `applyTemplate: ${a.code} ${fmt(a.issues)}`);
    tplOk = true;
  });
  const needTpl = () => { need(); ok(tplOk, "applyTemplate ไม่สำเร็จ (T-0)"); };
  type Exp = Record<string, [HoursSource, MinWindow[]]>;
  const FULL = [W(600, 1200)];
  const PART = [W(780, 1200)];
  const expTpl: Record<string, Exp> = {
    [D_OPEN]: { [ids.stF]: ["UNIT_HOURS", FULL], [ids.stP]: ["STAFF_WEEKLY", PART], [ids.stH]: ["UNIT_HOURS", FULL] },
    [D_SUN]: { [ids.stF]: ["UNIT_HOURS", FULL], [ids.stP]: ["STAFF_WEEKLY", []], [ids.stH]: ["UNIT_HOURS", FULL] },
    [D_MON]: { [ids.stF]: ["UNIT_HOURS", []], [ids.stP]: ["STAFF_WEEKLY", []], [ids.stH]: ["UNIT_HOURS", []] },
    [D_CL_CLOSED]: { [ids.stF]: ["UNIT_HOURS", []], [ids.stP]: ["STAFF_WEEKLY", []], [ids.stH]: ["UNIT_HOURS", []] },
    [D_CL_SPECIAL]: { [ids.stF]: ["UNIT_HOURS", [W(840, 1020)]], [ids.stP]: ["STAFF_WEEKLY", [W(840, 1020)]], [ids.stH]: ["UNIT_HOURS", [W(840, 1020)]] },
    [D_CL_OPENMON]: { [ids.stF]: ["UNIT_HOURS", FULL], [ids.stP]: ["STAFF_WEEKLY", PART], [ids.stH]: ["UNIT_HOURS", FULL] },
  };
  const checkExp = (ps: StaffDayProfile[], e: Exp, label: string) => {
    for (const [sid, [src, win]] of Object.entries(e)) { const p = byStaff(ps, sid); eq([p.source, p.windows], [src, win], `${label} ${p.name}`); }
  };
  await st("T-1", "ช่างพาร์ทไทม์ 13–20 (ตารางสัปดาห์) · ช่างไม่มีตาราง/ผูก HR แต่ HR ยังไม่มีกะ ⇒ เวลาร้าน", async () => {
    needTpl();
    checkExp(await prof(D_OPEN), expTpl[D_OPEN], "พุธ");
  });
  await st("T-2", "ช่างพาร์ทไทม์ไม่มีช่องเช้า: getAvailableSlots(ตัดผม 60, พาร์ทไทม์) เริ่ม 13:00 · ไม่ทับนัด 15–16 · ช่องสุดท้าย 19:00", async () => {
    needTpl();
    const s = await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S60, ids.stP, D_OPEN);
    ok(s.length > 0, "ไม่มีช่องเลย");
    eq([s[0].hhmm, s[s.length - 1].hhmm], ["13:00", "19:00"], "ช่องแรก/สุดท้าย");
    ok(s.every((x) => x.startMin >= 780 && x.staffId === ids.stP), `มีช่องก่อน 13:00 หรือช่างผิด: ${fmt(s.filter((x) => x.startMin < 780))}`);
    ok(!s.some((x) => x.startMin > 840 && x.startMin < 960), "ช่องทับนัด 15:00–16:00");
  });
  await st("T-3", "ใครก็ได้ (ตัดผม 60) = ช่องที่คำนวณจากหน้าต่างรายช่าง (ช่างพาร์ทไทม์ไม่ได้ช่องก่อน 13:00)", async () => {
    needTpl();
    const got = await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S60, null, D_OPEN);
    const order = await activeStaff(ids.tA, ids.uA1, null);
    const win = (id: string) => (id === ids.stP ? PART : FULL);
    const busy = await busyOf(ids.tA, ids.uA1, order.map((s) => s.id), D_OPEN);
    const want = coreSlots(D_OPEN, order.map((s) => ({ id: s.id, windows: win(s.id), durationMin: 60 })), busy, 0, Date.now());
    eq(got, want, "ช่องใครก็ได้");
  });
  await st("T-4", "ปฏิทินทั้งสัปดาห์: อาทิตย์ (พาร์ทไทม์ไม่มีแถว ⇒ []) · จันทร์ร้านปิด (เพดานเวลาร้าน) · ปิดพิเศษ · เปิด 14–17 · จันทร์เปิดพิเศษ", async () => {
    needTpl();
    for (const ds of [D_SUN, D_MON, D_CL_CLOSED, D_CL_SPECIAL, D_CL_OPENMON]) checkExp(await prof(ds), expTpl[ds], ds);
    eq(await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S60, ids.stP, D_SUN), [], "ช่องพาร์ทไทม์วันอาทิตย์");
    const sp = await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S60, null, D_CL_SPECIAL);
    ok(sp.length > 0 && sp.every((x) => x.startMin >= 840 && x.startMin + 60 <= 1020), `ช่องวันเปิดพิเศษหลุด 14–17: ${fmt(sp)}`);
  });
  await st("T-5", "HR ฉีดกะ 09:00–15:00 พัก 12–13 ⇒ ช่างเอช HR_SHIFT 10–12 + 13–15 · เรียก HR ครั้งเดียว ด้วยพนักงานที่ผูกในสาขาเท่านั้น · แถวคนอื่นถูกทิ้ง", async () => {
    needTpl();
    const calls: StaffWindowsInput[] = [];
    const ps = await prof(D_OPEN, {
      hrWindows: async (i) => { calls.push(i); return [{ employeeId: ids.empH, windows: [W(540, 900)], breaks: [W(720, 780)] }, { employeeId: "svcb1_ghost", windows: [W(0, 1440)], breaks: [] }]; },
    });
    eq(calls.length, 1, "จำนวนครั้งที่เรียก HR");
    eq([calls[0].tenantId, calls[0].unitId, calls[0].date, [...calls[0].employeeIds].sort()], [ids.tA, ids.uA1, D_OPEN, [ids.empH]], "อาร์กิวเมนต์ HR");
    const h = byStaff(ps, ids.stH);
    eq([h.source, h.windows], ["HR_SHIFT", [W(600, 720), W(780, 900)]], "ช่างเอช");
    checkExp(ps, { [ids.stF]: ["UNIT_HOURS", FULL], [ids.stP]: ["STAFF_WEEKLY", PART] }, "คนอื่นไม่เปลี่ยน");
  });
  await st("T-6", "HR คืนแถวช่างเอชแต่ไม่มีกะ (windows []) ⇒ [] ไม่ตกไปเวลาร้าน · HR คืน [] ⇒ ตกไปเวลาร้าน", async () => {
    needTpl();
    const a = byStaff(await prof(D_OPEN, { hrWindows: async () => [{ employeeId: ids.empH, windows: [], breaks: [] }] }), ids.stH);
    eq([a.source, a.windows], ["HR_SHIFT", []], "วันหยุดตามกะ");
    const b = byStaff(await prof(D_OPEN, { hrWindows: async () => [] }), ids.stH);
    eq([b.source, b.windows], ["UNIT_HOURS", FULL], "ไม่มีกะ");
  });
  await st("T-7", "ลาชนะกะ: วันลา HR ให้กะเต็มวัน ⇒ ช่างเอช onLeave + [] · ใครก็ได้ไม่มีช่างเอช", async () => {
    needTpl();
    const h = byStaff(await prof(D_LEAVE, { hrWindows: async () => [{ employeeId: ids.empH, windows: [W(600, 1200)], breaks: [] }] }), ids.stH);
    eq([h.onLeave, h.windows], [true, []], "ช่างเอชวันลา");
    eq(await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S60, ids.stH, D_LEAVE), [], "ช่องช่างเอชวันลา");
    ok(!(await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S60, null, D_LEAVE)).some((x) => x.staffId === ids.stH), "ใครก็ได้ยังมีช่างเอช");
  });
  await st("T-8", "ทับรายช่าง: hoursSource [UNIT_HOURS] ที่ช่างพาร์ทไทม์ ⇒ 10–20 · กลับเป็น [STAFF_WEEKLY, UNIT_HOURS] ⇒ 13–20", async () => {
    needTpl();
    const set = async (value: HoursSource[]) => {
      const r = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key: "booking.staff.hoursSource", scope: "STAFF", scopeId: ids.stP, value }]);
      ok(r.ok, `setSettings ${fmt(value)}: ${r.code} ${fmt(r.issues)}`);
    };
    await set(["UNIT_HOURS"]);
    const a = byStaff(await prof(D_OPEN), ids.stP);
    eq([a.source, a.windows], ["UNIT_HOURS", FULL], "ทับเป็นเวลาร้าน");
    await set(["STAFF_WEEKLY", "UNIT_HOURS"]);
    const b = byStaff(await prof(D_OPEN), ids.stP);
    eq([b.source, b.windows], ["STAFF_WEEKLY", PART], "กลับเป็นตาราง");
  });
  await st("T-9", "ค่าตั้งต่อช่างผ่าน resolver: แม่แบบตัดผม 60/null/0 · ทับสาขา minBreak 10 · ทับช่างเต็ม % 30 งานสูงสุด 4", async () => {
    needTpl();
    const p0 = byStaff(await prof(D_OPEN), ids.stF);
    eq([p0.onlineSharePct, p0.maxJobsPerDay, p0.minBreakMin], [60, null, 0], "แม่แบบตัดผม");
    const r = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [
      { key: "booking.staff.minBreakMin", scope: "UNIT", scopeId: ids.uA1, value: 10 },
      { key: "booking.booking.onlineSharePct", scope: "STAFF", scopeId: ids.stF, value: 30 },
      { key: "booking.staff.maxJobsPerDay", scope: "STAFF", scopeId: ids.stF, value: 4 },
    ]);
    ok(r.ok, `setSettings: ${r.code} ${fmt(r.issues)}`);
    const ps = await prof(D_OPEN);
    const f = byStaff(ps, ids.stF);
    const p = byStaff(ps, ids.stP);
    eq([f.onlineSharePct, f.maxJobsPerDay, f.minBreakMin], [30, 4, 10], "ช่างเต็ม");
    eq([p.onlineSharePct, p.maxJobsPerDay, p.minBreakMin], [60, null, 10], "ช่างพาร์ทไทม์");
  });
  await st("T-10", "เวลาไทย: จองช่างพาร์ทไทม์ 13:00 ⇒ startAt = 06:00Z ของวันนั้น · endAt +60", async () => {
    needTpl();
    const r = await BK().createAppointment(mkAppt({ staffId: ids.stP, dateStr: D_SAT(), startMin: 780 }));
    ok(r.ok, `จองไม่ได้: ${r.ok ? "" : r.reason}`);
    if (r.ok) {
      const a = await apptRow(r.id);
      eq([a.startAt.toISOString(), a.endAt.getTime() - a.startAt.getTime(), a.priceSatang], [new Date(bkkMs(D_SAT(), 780)).toISOString(), 60 * 60_000, 30000], "แถวนัด");
    }
  });
  await st("T-11", "dateStr ไม่ใช่วันจริง (2031-02-30 · abc) ⇒ staffDayProfiles = []", async () => {
    needTpl();
    eq(await prof("2031-02-30"), [], "2031-02-30");
    eq(await prof("abc"), [], "abc");
  }, "MAJOR");

  // ═══════════════ Z. TZ ระดับ DB ═══════════════
  console.log("\n── Z: เวลาไทยระดับ DB (child TZ +14 / −11) ──");
  await st("Z-1", "staffDayProfiles + getAvailableSlots (พาร์ทไทม์ · ใครก็ได้) 6 วัน ใน TZ +14 และ −11 = in-process ทุกไบต์", async () => {
    needTpl();
    const payload: DbProbe = { kind: "db", tenantId: ids.tA, unitId: ids.uA1, serviceId: ids.S60, staffId: ids.stP, dates: [D_OPEN, D_SUN, D_MON, D_CL_SPECIAL, D_CL_OPENMON, D_LEAVE] };
    const mine = JSON.parse(JSON.stringify(await dbProbe(payload))) as unknown;
    for (const tz of TZS.slice(0, 2)) eq(spawnProbe(tz, payload), mine, `TZ=${tz}`);
  });

  // ═══════════════ S. ช่าง↔บริการ ═══════════════
  console.log("\n── S: BookingStaffService (ไม่มีแถว = ทำทุกบริการ) ──");
  let svcRowsOk = false;
  try {
    if (setupOk) {
      await insertRow("BookingStaffService", { id: rid("ss"), tenantId: ids.tA, unitId: ids.uA1, staffId: ids.stS, serviceId: ids.S30, durationMin: 45, priceSatang: 20000, updatedAt: new Date() });
      await pool.query(`UPDATE "BookingStaff" SET "sortOrder" = 0 WHERE id = $1`, [ids.stS]); // ช่างเฉพาะขึ้นก่อนทุกคน ⇒ ถ้าไม่กรองจะได้ทุกช่อง
      svcRowsOk = true;
    }
  } catch (e) { console.log(`  ❌ สร้างแถวผูกบริการไม่ได้: ${errMsg(e)}`); }
  const needSvc = () => { needTpl(); ok(svcRowsOk, "สร้างแถว BookingStaffService ไม่ได้"); };
  await st("S-1", "profile.services: ช่างเฉพาะ = [สระไดร์ 45 นาที ฿200] · ช่างอื่น null (ทำทุกบริการ)", async () => {
    needSvc();
    const ps = await prof(D_OPEN);
    eq(sortSvc(byStaff(ps, ids.stS).services), [{ serviceId: ids.S30, durationMin: 45, priceSatang: 20000 }], "ช่างเฉพาะ");
    for (const id of [ids.stF, ids.stP, ids.stH, ids.stX]) eq(byStaff(ps, id).services, null, `ช่าง ${id}`);
  });
  await st("S-2", "ช่างทำบริการไม่ได้ ⇒ ไม่โผล่: ตัดผม 60 กับช่างเฉพาะ = [] · ใครก็ได้ไม่มีช่างเฉพาะ (ทั้งที่ sortOrder 0)", async () => {
    needSvc();
    eq(await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S60, ids.stS, D_OPEN), [], "ช่างเฉพาะ × ตัดผม");
    const any = await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S60, null, D_OPEN);
    ok(any.length > 0, "ใครก็ได้ไม่มีช่องเลย");
    ok(!any.some((x) => x.staffId === ids.stS), `ช่างเฉพาะโผล่ ${any.filter((x) => x.staffId === ids.stS).length} ช่อง`);
  });
  await st("S-3", "นาทีเฉพาะคน: สระไดร์กับช่างเฉพาะใช้ 45 นาที ⇒ ช่องสุดท้าย 19:15 (ไม่ใช่ 19:30) · ใครก็ได้ 19:30 ตกช่างอื่น", async () => {
    needSvc();
    const s = await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S30, ids.stS, D_OPEN);
    ok(s.length > 0, "ไม่มีช่อง");
    eq([s[0].hhmm, s[s.length - 1].hhmm], ["10:00", "19:15"], "ช่องแรก/สุดท้าย");
    const any = await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S30, null, D_OPEN);
    const at = (m: number) => any.find((x) => x.startMin === m);
    eq(at(600)?.staffId, ids.stS, "10:00 ได้ช่างเฉพาะ (sortOrder 0)");
    ok(!!at(1170) && at(1170)?.staffId !== ids.stS, `19:30 ต้องเป็นช่างอื่น: ${fmt(at(1170))}`);
  });
  await st("S-4", "ราคาเฉพาะคนถูกใช้: จองสระไดร์กับช่างเฉพาะ ⇒ priceSatang 20000 · endAt = 45 + buffer 5 · มัดจำตามบริการ", async () => {
    needSvc();
    const r = await BK().createAppointment(mkAppt({ serviceId: ids.S30, staffId: ids.stS, startMin: 600 }));
    ok(r.ok, `จองไม่ได้: ${r.ok ? "" : r.reason}`);
    if (r.ok) {
      const a = await apptRow(r.id);
      eq([a.priceSatang, a.depositSatang, a.endAt.getTime() - a.startAt.getTime()], [20000, 5000, 50 * 60_000], "แถวนัด");
    }
  });
  await st("S-5", "จองบริการที่ช่างทำไม่ได้ (ตัดผม × ช่างเฉพาะ) ⇒ ok:false เหตุผลไทย · ไม่สร้างแถว", async () => {
    needSvc();
    const before = await countAppts();
    const r = await BK().createAppointment(mkAppt({ serviceId: ids.S60, staffId: ids.stS, startMin: 720 }));
    ok(!r.ok, "จองผ่าน");
    if (!r.ok) ok(/[฀-๿]/.test(r.reason), `เหตุผลไม่ใช่ไทย: ${r.reason}`);
    eq(await countAppts(), before, "จำนวนนัด");
  });
  await st("S-6", "แถวผูกที่ค่า null ⇒ จำกัดบริการแต่ใช้นาที/ราคาของบริการ: ช่างเอ็กซ์ผูกตัดผม (null) ⇒ สระไดร์ไม่ได้ · ตัดผม ฿300 60 นาที", async () => {
    needSvc();
    await insertRow("BookingStaffService", { id: rid("ss"), tenantId: ids.tA, unitId: ids.uA1, staffId: ids.stX, serviceId: ids.S60, durationMin: null, priceSatang: null, updatedAt: new Date() });
    eq(sortSvc(byStaff(await prof(D_OPEN), ids.stX).services), [{ serviceId: ids.S60, durationMin: null, priceSatang: null }], "services");
    eq(await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S30, ids.stX, D_OPEN), [], "สระไดร์ × ช่างเอ็กซ์");
    const r = await BK().createAppointment(mkAppt({ serviceId: ids.S60, staffId: ids.stX, startMin: 900 }));
    ok(r.ok, `จองไม่ได้: ${r.ok ? "" : r.reason}`);
    if (r.ok) { const a = await apptRow(r.id); eq([a.priceSatang, a.endAt.getTime() - a.startAt.getTime()], [30000, 60 * 60_000], "แถวนัด"); }
  });
  await st("S-7", "servicesMode ASSIGNED (แบบคลินิก) ที่ช่างเต็ม ไม่มีแถว ⇒ services [] · ไม่มีช่อง · จองไม่ได้", async () => {
    needSvc();
    const r = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, [{ key: "booking.staff.servicesMode", scope: "STAFF", scopeId: ids.stF, value: "ASSIGNED" }]);
    ok(r.ok, `setSettings: ${r.code} ${fmt(r.issues)}`);
    eq(byStaff(await prof(D_OPEN), ids.stF).services, [], "services");
    eq(await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S60, ids.stF, D_OPEN), [], "ช่อง");
    const c = await BK().createAppointment(mkAppt({ serviceId: ids.S60, staffId: ids.stF, startMin: 1080 }));
    ok(!c.ok, "จองผ่าน");
  });

  // ═══════════════ X. ข้ามร้าน/ข้ามสาขา ═══════════════
  console.log("\n── X: ข้ามร้าน / ข้ามสาขา (X1) ──");
  await st("X-1", "staffDayProfiles: staffIds ของสาขาอื่น/ร้านอื่น ⇒ [] · สาขา A2 เห็นเฉพาะช่างของตัวเอง · ctx ร้าน B + สาขา A1 ⇒ []", async () => {
    needTpl();
    eq(await prof(D_OPEN, { staffIds: [ids.stA2, ids.stB] }), [], "staffIds ข้าม");
    eq((await prof(D_OPEN, undefined, { tenantId: ids.tA, unitId: ids.uA2 })).map((p) => p.staffId), [ids.stA2], "สาขา A2");
    eq(await prof(D_OPEN, undefined, { tenantId: ids.tB, unitId: ids.uA1 }), [], "ร้าน B ถามสาขา A1");
    eq((await prof(D_OPEN, { staffIds: [ids.stP, ids.stB] })).map((p) => p.staffId), [ids.stP], "ผสม");
  });
  await st("X-2", "getAvailableSlots ข้าม: บริการสาขา A2/ร้าน B ในสาขา A1 ⇒ [] · ช่างสาขา A2 ⇒ [] · ร้าน B ถามบริการร้าน A ⇒ []", async () => {
    needTpl();
    eq(await BK().getAvailableSlots(ids.tA, ids.uA1, ids.SA2, null, D_OPEN), [], "บริการ A2");
    eq(await BK().getAvailableSlots(ids.tA, ids.uA1, ids.SB, null, D_OPEN), [], "บริการร้าน B");
    eq(await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S30, ids.stA2, D_OPEN), [], "ช่าง A2");
    eq(await BK().getAvailableSlots(ids.tB, ids.uB1, ids.S30, null, D_OPEN), [], "ร้าน B × บริการ A");
    ok((await BK().getAvailableSlots(ids.tA, ids.uA2, ids.SA2, null, D_OPEN)).length > 0, "สาขา A2 ของตัวเองต้องมีช่อง (ตัวควบคุม)");
  });
  await st("X-3", "แถวผูกบริการผิดร้าน/ผิดสาขา (tenantId/unitId ไม่ตรงช่าง) ⇒ ถือว่าไม่มี: ช่างอาร์ยังทำทุกบริการ", async () => {
    needTpl();
    await insertRow("BookingStaffService", { id: rid("ss"), tenantId: ids.tB, unitId: ids.uB1, staffId: ids.stR, serviceId: ids.SB, durationMin: 5, priceSatang: 1, updatedAt: new Date() });
    await insertRow("BookingStaffService", { id: rid("ss"), tenantId: ids.tA, unitId: ids.uA2, staffId: ids.stR, serviceId: ids.SA2, durationMin: 5, priceSatang: 1, updatedAt: new Date() });
    eq(byStaff(await prof(D_OPEN), ids.stR).services, null, "services ช่างอาร์");
    ok((await BK().getAvailableSlots(ids.tA, ids.uA1, ids.S30, ids.stR, D_OPEN)).length > 0, "ช่างอาร์ต้องมีช่องสระไดร์");
  });
  await st("X-4", "createAppointment ช่างสาขาอื่น/ร้านอื่น ⇒ ok:false ไม่สร้างแถว", async () => {
    needTpl();
    const before = await countAppts();
    for (const sid of [ids.stA2, ids.stB]) { const r = await BK().createAppointment(mkAppt({ staffId: sid, startMin: 1140 })); ok(!r.ok, `จองช่าง ${sid} ผ่าน`); }
    eq(await countAppts(), before, "จำนวนนัด");
  });
} catch (e) {
  record("CRASH", "ข้อสอบหยุดกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n;
    console.log(`\n(ล้างแถวทดสอบ: tenant ค้าง ${left})`);
  } catch { /* ฐานหลุด */ }
  await pool.end();
}
function D_SAT(): string { return nextWd(5, 6); }

// ═══════════════ ST. ไฟล์ ═══════════════
console.log("\n── ST: ไฟล์ที่แตะ · เวลาไทย · facade ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
const changed = (paths: string[]) => [...new Set([
  ...git(["diff", "-w", "--ignore-blank-lines", "--name-only", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean),
  ...git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n").filter(Boolean),
])];
const OWN = new Set([PURE_REL, SERVICE_REL, "src/lib/modules/booking/slots.ts", "src/lib/modules/booking/index.ts", HR_INDEX_REL]);
// ORACLE-EDIT B.1-G1 (ผู้คุม 28 ต.ค.): ST-1 ตรวจเฉพาะตอนรับใบ — เมื่อ B.1 merge เข้า session/svc แล้ว (5947107e เป็นบรรพบุรุษ) ใบอื่นแตะไฟล์ได้ตามปกติ ⇒ SKIP
const b1Merged = (() => { try { execFileSync("git", ["merge-base", "--is-ancestor", "5947107e", "HEAD"], { cwd: ROOT }); return true; } catch { return false; } })();
await (b1Merged ? (async (id: string, name: string) => skip(id, name, "B.1 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ")) : st)("ST-1", "แตะเฉพาะไฟล์ของใบ (src/ · prisma/) · มี staff-hours.ts + hr/index.ts + service.ts ในชุดที่แก้", () => {
  const ch = changed(["src", "prisma"]);
  const outside = ch.filter((f) => !OWN.has(f));
  ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
  const miss = [PURE_REL, HR_INDEX_REL, SERVICE_REL].filter((f) => !ch.includes(f));
  ok(miss.length === 0, `ยังไม่แก้: ${miss.join(", ")}`);
});
await st("ST-2", "ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/.getMinutes/.getDate/.getMonth/.getFullYear/toLocaleDateString) ใน staff-hours.ts · service.ts", () => {
  const bad: string[] = [];
  for (const f of [PURE_REL, SERVICE_REL]) {
    if (!existsSync(join(ROOT, f))) { bad.push(`${f}: ไม่มีไฟล์`); continue; }
    readFileSync(join(ROOT, f), "utf8").split("\n").forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, "");
      if (/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)|toLocaleDateString/.test(code)) bad.push(`${f}:${i + 1}`);
    });
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
});
await st("ST-3", "booking เรียกกะผ่าน facade `@/lib/modules/hr` (staffWindows) ไม่ใช่ไฟล์ข้างใน HR", () => {
  const src = readFileSync(join(ROOT, SERVICE_REL), "utf8");
  ok(/from\s+["']@\/lib\/modules\/hr["']/.test(src), "ไม่มี import จาก @/lib/modules/hr");
  ok(/\bstaffWindows\b/.test(src), "service.ts ไม่อ้าง staffWindows");
}, "MAJOR");

// ═══════════════ G. regression ═══════════════
console.log("\n── G: regression booking + ตัววางคิว + smoke ──");
const REG_SUITES = ["qc-booking-deposit", "qc-booking-race", "qc-booking-edit-schedule", "qc-booking-hours-hr", "qc-hr-leave-booking", "qc-svc-b.2", "qc-svc-smoke"];
{
  const hasWork = !!pureLoad.mod && typeof bookingLoad.mod?.staffDayProfiles === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (staff-hours.ts / staffDayProfiles) — regression รันเมื่อมีงาน" : process.env.SVC_B1_NO_REGRESSION === "1" ? "ตั้ง SVC_B1_NO_REGRESSION=1" : "";
  for (const [i, s] of REG_SUITES.entries()) {
    const id = `G-${i + 1}`;
    const name = `${s} exit 0`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${s}.mts`], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const log = `/tmp/svc-b1-reg-${s}.log`;
    try { writeFileSync(log, `${r.stdout ?? ""}\n${r.stderr ?? ""}`); } catch { /* ไม่เป็นไร */ }
    const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.1 · เวลาต่อช่าง + ช่าง↔บริการ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ไม่นับว่าผ่าน)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
