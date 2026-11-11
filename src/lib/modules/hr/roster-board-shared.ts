// HR H2.2 ▸ บอร์ดตารางกะ — ส่วนกลางที่ใช้ได้ทั้ง server / client / ข้อสอบ (ไม่มี import ที่ทำงานตอนรัน · ไม่อ่านนาฬิกา · ไม่ใช้ Intl)
//   • ชนิด DTO ของบอร์ด (ช่องที่ส่งถึง client ได้ — whitelist · ไม่มีเงิน/ชนิดค่าจ้าง/เหตุผลลา/หมายเหตุ/ข้อมูลติดต่อ/PIN)
//   • ตารางรหัสผล ROSTER_MSG (รหัส → ข้อความไทยคงที่ = ข้อความของเครื่องยนต์ H2.1 ทุกไบต์) + ROSTER_MSG_CODE_OF (ข้อความ → รหัส)
//   • ตัวช่วยสัปดาห์แบบวันที่ล้วน "YYYY-MM-DD" (ปฏิทินไทย — คำนวณบนวันที่ ไม่มีเวลา ⇒ ไม่ขึ้นกับโซนของเครื่อง)
//   • ตัวลดสถานะแบบ optimistic (applyOp / rollback / confirmOp) + canDrop + keyTarget สำหรับลากวาง/คีย์บอร์ด ◂

// ═════════════════════════ ชนิด DTO ═════════════════════════
export type ShiftKind = "m" | "a" | "c" | "x";
export type CellState = "work" | "off" | "out" | "past";
export type RosterEntryDto = {
  id: string;
  shiftId: string;
  label: string;
  kind: ShiftKind;
  start: string; // "HH:MM" (สำเนาเวลาในแถว — เวลาที่ระบุเองแสดงเวลาของมันเอง)
  end: string;
  overnight: boolean;
  paidMin: number;
  published: boolean;
  source: string;
};
export type RosterLeaveDto = { status: "APPROVED" | "PENDING"; label: string };
export type RosterCellDto = {
  day: string;
  state: CellState;
  entries: RosterEntryDto[];
  leave?: RosterLeaveDto;
  /** สาขาของวันนั้น (เฉพาะช่องที่อยู่ในมุมมอง — ใช้กรองกะในตัวเลือก) · null = ไม่ระบุสาขา */
  unit?: string | null;
};
export type RosterRowDto = {
  employeeId: string;
  name: string;
  initial: string;
  position: string | null;
  probation: boolean;
  borrowed: boolean;
  homeUnitName: string | null;
  ended: boolean;
  cells: RosterCellDto[];
  weekMin: number;
  shiftCount: number;
  leaveDays: number;
  warn: boolean;
  /** ชม./สัปดาห์ของคำเตือน MAX_WEEK (นับทุกสาขา — เครื่องยนต์) · null = ไม่เกิน */
  weekWarnMin: number | null;
  weekLimitMin: number | null;
};
export type RosterDayDto = { key: string; dow: number; label: string; weekend: boolean; past: boolean; headcount: number; holiday?: { name: string; shopOpen: boolean } };
export type RosterShiftDto = { id: string; label: string; kind: ShiftKind; startMin: number; endMin: number; crossesMidnight: boolean; unitId: string | null; range: string };
export type RosterRuleKey = "MAX_DAY" | "REST" | "DAY_OFF" | "MAX_WEEK" | "OVERLAP";
export type RosterRuleRow = { rule: RosterRuleKey; label: string; limit: number | null; ok: boolean; names: string[]; unnamed: number; hours: number | null; entryIds: string[] };
export type RosterInfoRow = { rule: "HOLIDAY_WORK" | "ON_LEAVE"; text: string; count: number };
export type RosterWarnDto = { rule: string; employeeId: string; day?: string; weekStart?: string; valueMin?: number; limitMin?: number; entryIds: string[] };
export type RosterHolidayLine = { day: string; label: string; name: string; shopOpen: boolean };
export type RosterOpState = { op: RosterOp; realId: string | null };
export type RosterBoardDto = {
  monday: string;
  prevMonday: string;
  nextMonday: string;
  todayKey: string;
  thisMonday: string;
  allPast: boolean;
  unitSel: string; // "all" | unitId
  unitName: string;
  units: { id: string; name: string }[];
  allBranches: boolean;
  canWrite: boolean;
  canPublish: boolean;
  unpublishedCount: number;
  loadFailed: boolean;
  warnings: RosterWarnDto[];
  totalMin: number;
  notes: RosterHolidayLine[];
  title: string;
  rangeLabel: string;
  borrowedCount: number;
  days: RosterDayDto[];
  rows: RosterRowDto[];
  shifts: RosterShiftDto[];
  rulePanel: { rows: RosterRuleRow[]; info: RosterInfoRow[] };
  /** ตัวลดสถานะฝั่ง client เท่านั้น (ไม่มีจาก server) */
  pending?: { base: RosterRowDto[]; ops: RosterOpState[] };
};

// ═════════════════════════ รหัสผล (R12 · R13 — allowlist) ═════════════════════════
/** รหัส → ข้อความไทย (= ข้อความคงที่ของเครื่องยนต์ H2.1 ทุกไบต์ · noSystem/failed = ของบอร์ด · failed = ข้อผิดพลาดที่ไม่รู้จักเท่านั้น) */
export const ROSTER_MSG = {
  noPerm: "คุณไม่มีสิทธิ์จัดตารางกะ",
  ended: "พนักงานคนนี้พ้นสภาพแล้ว — จัดกะไม่ได้",
  outEmploy: "วันนี้อยู่นอกช่วงการจ้างของพนักงานคนนี้",
  shiftOff: "กะนี้ปิดใช้แล้ว — เลือกกะอื่น",
  shiftNotFound: "ไม่พบกะนี้ — กรุณารีเฟรช",
  shiftOther: "กะนี้เป็นของสาขาอื่น — เลือกกะของสาขานี้หรือกะที่ใช้ทั้งร้าน",
  dup: "พนักงานคนนี้มีกะนี้ในวันนั้นแล้ว",
  past: "จัดกะย้อนหลังไม่ได้ — ใช้คำขอแก้เวลาแทน",
  sameWeek: "สัปดาห์ต้นทางกับปลายทางต้องไม่ใช่สัปดาห์เดียวกัน",
  publishRace: "ตารางกะมีการแก้ไขระหว่างเผยแพร่ — กรุณากดเผยแพร่อีกครั้ง",
  otherBranch: "พนักงานคนนี้อยู่สาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ",
  unassigned: "พนักงานคนนี้ยังไม่ระบุสาขาประจำ — ผู้ดูแลทุกสาขาเป็นผู้จัดการ",
  otherUnit: "รายการนี้เป็นของสาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ",
  shiftEqual: "เวลาเริ่มกับเวลาเลิกกะต้องไม่เท่ากัน",
  // r2 (มติ Q-1): ข้อความปฏิเสธที่เหลือของเครื่องยนต์ (roster.ts ROSTER_TEXT — พิมพ์ซ้ำเพราะไฟล์นี้ import ได้แค่ type · ข้อสอบ S2.2 ตรวจทุกไบต์)
  entryNotFound: "ไม่พบกะนี้ในตาราง — กรุณารีเฟรช",
  entryChanged: "กะนี้เพิ่งถูกแก้ไข — กรุณารีเฟรชแล้วลองใหม่",
  employeeNotFound: "ไม่พบพนักงานคนนี้ — กรุณารีเฟรช",
  range: "เลือกช่วงวันได้ไม่เกิน 31 วัน",
  rangeOrder: "วันเริ่มต้องไม่หลังวันสิ้นสุด",
  date: "วันที่ไม่ถูกต้อง",
  note: "หมายเหตุยาวเกินไป (ไม่เกิน 200 ตัวอักษร)",
  tooMany: "รายการมากเกินไปสำหรับการเผยแพร่ครั้งเดียว — กรุณาเลือกช่วงวันให้สั้นลง",
  noSystem: "ไม่พบระบบพนักงานนี้",
  failed: "บันทึกตารางกะไม่สำเร็จ — กรุณาลองใหม่",
} as const;
export type RosterMsgCode = keyof typeof ROSTER_MSG;
/** ข้อความของเครื่องยนต์ → รหัส (ไม่อยู่ในตาราง ⇒ ผู้เรียกใช้ "failed") */
export const ROSTER_MSG_CODE_OF: ReadonlyMap<string, RosterMsgCode> = new Map(Object.entries(ROSTER_MSG).map(([k, v]) => [v, k as RosterMsgCode]));
export const isRosterMsgCode = (c: unknown): c is RosterMsgCode => typeof c === "string" && Object.prototype.hasOwnProperty.call(ROSTER_MSG, c);

/** r2 m3: id ชั่วคราวของชิปคัดลอกที่ยังรอ server (tmp-<opId>) — ลาก/เปิด/ลบไม่ได้จนกว่า confirm สลับเป็น id จริง */
export const TEMP_ID_PREFIX = "tmp-";
export const isTempEntryId = (id: string): boolean => id.startsWith(TEMP_ID_PREFIX);

// ═════════════════════════ ผลของ action ═════════════════════════
export type RosterSkipCounts = Partial<Record<"EXISTS" | "NO_SHIFT" | "HOLIDAY" | "SHIFT_ARCHIVED" | "OTHER", number>>;
export type RosterOpResult =
  | { ok: true; id?: string; created?: number; skipped?: number; skippedBy?: RosterSkipCounts; warnings?: number; published?: number }
  | { ok: false; code: RosterMsgCode };

// ═════════════════════════ วันที่ (ปฏิทินล้วน) ═════════════════════════
export const DOW_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."] as const;
export const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;
export type DateNames = { dow: readonly string[]; month: readonly string[]; yearOffset: number };
export const DATE_NAMES_TH: DateNames = { dow: DOW_TH, month: MONTH_TH, yearOffset: 543 };
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
/** "YYYY-MM-DD" ที่เป็นวันจริง ⇒ เวลา UTC เที่ยงคืน (ms) · ไม่ใช่ ⇒ null */
function msOf(day: unknown): number | null {
  if (typeof day !== "string") return null;
  const m = DAY_RE.exec(day.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? ms : null;
}
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const isDayKey = (day: unknown): day is string => msOf(day) !== null;
export function addDaysKey(day: string, n: number): string {
  const ms = msOf(day);
  return ms === null ? day : keyOf(ms + n * DAY_MS);
}
/** วันจันทร์ของสัปดาห์ที่มีวันนั้น (จันทร์–อาทิตย์) · วันไม่ถูกต้อง ⇒ null */
export function mondayOf(day: unknown): string | null {
  const ms = msOf(day);
  if (ms === null) return null;
  const dow = new Date(ms).getUTCDay(); // 0 = อาทิตย์
  return keyOf(ms - ((dow + 6) % 7) * DAY_MS);
}
export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));
const partsOf = (day: string) => ({ y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)), d: Number(day.slice(8, 10)), dow: new Date(msOf(day) ?? 0).getUTCDay() });
/** "จ. 4" */
export function dayLabel(day: string, n: DateNames = DATE_NAMES_TH): string {
  const p = partsOf(day);
  return `${n.dow[p.dow]} ${p.d}`;
}
/** ป้ายสัปดาห์: "จ. 4 – อา. 10 มี.ค." · ข้ามเดือน "จ. 29 เม.ย. – อา. 5 พ.ค." */
export function weekLabel(monday: string, n: DateNames = DATE_NAMES_TH): string {
  const a = partsOf(monday);
  const b = partsOf(addDaysKey(monday, 6));
  return a.m === b.m ? `${n.dow[1]} ${a.d} – ${n.dow[0]} ${b.d} ${n.month[b.m - 1]}` : `${n.dow[1]} ${a.d} ${n.month[a.m - 1]} – ${n.dow[0]} ${b.d} ${n.month[b.m - 1]}`;
}
/** ช่วงวันของหัวเรื่อง: "4–10 มี.ค. 2573" · ข้ามเดือน "29 เม.ย.–5 พ.ค. 2573" · ข้ามปี "30 ธ.ค. 2573–5 ม.ค. 2574" */
export function rangeLabel(monday: string, n: DateNames = DATE_NAMES_TH): string {
  const a = partsOf(monday);
  const b = partsOf(addDaysKey(monday, 6));
  if (a.y !== b.y) return `${a.d} ${n.month[a.m - 1]} ${a.y + n.yearOffset}–${b.d} ${n.month[b.m - 1]} ${b.y + n.yearOffset}`;
  if (a.m !== b.m) return `${a.d} ${n.month[a.m - 1]}–${b.d} ${n.month[b.m - 1]} ${b.y + n.yearOffset}`;
  return `${a.d}–${b.d} ${n.month[b.m - 1]} ${b.y + n.yearOffset}`;
}
/** หัวเรื่อง: "ตารางกะ · 4–10 มี.ค. 2573 · สาขาหัวหิน" (พ.ศ. = ค.ศ. + 543) */
export function rosterTitle(monday: string, unitName: string, n: DateNames = DATE_NAMES_TH, word = "ตารางกะ"): string {
  return `${word} · ${rangeLabel(monday, n)} · ${unitName}`;
}

// ═════════════════════════ กะ: ชนิด · ป้าย · เวลา ═════════════════════════
/** สีกะ (shift-1…12 จาก HrShift.colour) → แบบชิป: shift-1 เช้า (เส้นหมึก) · shift-2 บ่าย (พื้นเส้น) · shift-3 ปิดร้าน (พื้นหมึก) · อื่น ๆ เส้นประ */
export function shiftKind(colour: unknown): ShiftKind {
  return colour === "shift-1" ? "m" : colour === "shift-2" ? "a" : colour === "shift-3" ? "c" : "x";
}
/** ชื่อกะบนชิป: ตัด "กะ" นำหน้า 1 ครั้ง ("กะเช้า" → "เช้า") */
export function shiftLabel(name: unknown): string {
  const s = typeof name === "string" ? name.trim() : "";
  const cut = s.startsWith("กะ") ? s.slice(2).trim() : s;
  return cut || s;
}
const pad = (n: number) => String(n).padStart(2, "0");
/** นาทีของวัน → "HH:MM" (1440 = "24:00") */
export const hhmm = (min: number): string => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
/** ช่วงเวลาบนชิป: ชั่วโมงเต็ม = "HH" ไม่งั้น "HH:MM" — "07–15" · "07:30–15" · ข้ามคืน "22–06" */
export function timeRange(startMin: number, endMin: number): string {
  const h = (m: number) => (m % 60 === 0 ? pad(Math.floor(m / 60)) : hhmm(m));
  return `${h(startMin)}–${h(endMin)}`;
}
/** "HH:MM" → นาที · ผิดรูป ⇒ null */
export function minOf(t: unknown): number | null {
  const m = typeof t === "string" ? /^(\d{1,2}):(\d{2})$/.exec(t.trim()) : null;
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) <= 24 && Number(m[2]) < 60 && v <= 1440 ? v : null;
}
/** ป้ายชิปจาก "HH:MM" สองค่า */
export const chipRange = (e: Pick<RosterEntryDto, "start" | "end">): string => timeRange(minOf(e.start) ?? 0, minOf(e.end) ?? 0);

// ═════════════════════════ ตัวลดสถานะ (optimistic · ลากวาง/คีย์บอร์ด) ═════════════════════════
export type RosterTarget = { employeeId: string; day: string };
export type RosterOp = { id: string; kind: "move" | "copy"; entryId: string; to: RosterTarget };
type Loc = { r: number; c: number; e: number };
function locate(rows: readonly RosterRowDto[], entryId: string): Loc | null {
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].cells;
    for (let c = 0; c < cells.length; c++) {
      const e = cells[c].entries.findIndex((x) => x.id === entryId);
      if (e >= 0) return { r, c, e };
    }
  }
  return null;
}
function targetOf(rows: readonly RosterRowDto[], to: RosterTarget): { r: number; c: number } | null {
  const r = rows.findIndex((x) => x.employeeId === to?.employeeId);
  if (r < 0) return null;
  const c = rows[r].cells.findIndex((x) => x.day === to.day);
  return c < 0 ? null : { r, c };
}
const sumRow = (row: RosterRowDto): RosterRowDto => {
  const all = row.cells.flatMap((c) => c.entries);
  return { ...row, weekMin: all.reduce((a, e) => a + (Number(e.paidMin) || 0), 0), shiftCount: all.length };
};
/** ใช้ op 1 ตัวกับแถว (คืนแถวชุดใหม่ · ของเดิมไม่ถูกแก้) */
function applyOne(rows: readonly RosterRowDto[], s: RosterOpState): RosterRowDto[] {
  const { op } = s;
  const src = locate(rows, op.entryId);
  const dst = targetOf(rows, op.to);
  if (!src || !dst || (src.r === dst.r && src.c === dst.c)) return rows.slice();
  const chip = rows[src.r].cells[src.c].entries[src.e];
  const out = rows.slice();
  const setCell = (r: number, c: number, f: (cell: RosterCellDto) => RosterCellDto) => {
    const row = out[r];
    out[r] = sumRow({ ...row, cells: row.cells.map((x, i) => (i === c ? f(x) : x)) });
  };
  if (op.kind === "move") {
    setCell(src.r, src.c, (cell) => {
      const entries = cell.entries.filter((x) => x.id !== chip.id);
      return { ...cell, entries, state: entries.length === 0 && cell.state === "work" ? "off" : cell.state };
    });
    setCell(dst.r, dst.c, (cell) => ({ ...cell, state: cell.state === "past" ? "past" : "work", entries: [...cell.entries, { ...chip, id: s.realId ?? chip.id, published: false }] }));
  } else {
    const copy: RosterEntryDto = { ...chip, id: s.realId ?? `${TEMP_ID_PREFIX}${op.id}`, published: false, source: "MANUAL" };
    setCell(dst.r, dst.c, (cell) => ({ ...cell, state: cell.state === "past" ? "past" : "work", entries: [...cell.entries, copy] }));
  }
  return out;
}
const replay = (base: readonly RosterRowDto[], ops: readonly RosterOpState[]): RosterRowDto[] => ops.reduce<RosterRowDto[]>((rows, s) => applyOne(rows, s), base.slice());
function withOps(board: RosterBoardDto, base: RosterRowDto[], ops: RosterOpState[]): RosterBoardDto {
  const rows = replay(base, ops);
  const next: RosterBoardDto = { ...board, rows, totalMin: rows.reduce((a, r) => a + r.weekMin, 0) };
  if (ops.length) next.pending = { base, ops };
  else delete next.pending;
  return next;
}
/** ใช้ op ทันที (ย้าย = ชิปไปช่องใหม่ + ทำเครื่องหมายแก้แล้ว · คัดลอก = ชิปชั่วคราว tmp-<opId>) — บอร์ดเดิมไม่ถูกแก้ */
export function applyOp(board: RosterBoardDto, op: RosterOp): RosterBoardDto {
  const base = board.pending?.base ?? board.rows;
  return withOps(board, base, [...(board.pending?.ops ?? []), { op, realId: null }]);
}
/** ถอน op ที่ server ปฏิเสธ — คำนวณใหม่จากฐาน + op ที่เหลือ (op อื่นในคิวยังอยู่) */
export function rollback(board: RosterBoardDto, opId: string): RosterBoardDto {
  const base = board.pending?.base ?? board.rows;
  return withOps(board, base, (board.pending?.ops ?? []).filter((s) => s.op.id !== opId));
}
/** server ยืนยัน op (realId = id จริงของแถวที่คัดลอก) — op ที่ยืนยันแล้วหัวคิวถูกรวมเข้าฐาน */
export function confirmOp(board: RosterBoardDto, opId: string, realId?: string | null): RosterBoardDto {
  let base = board.pending?.base ?? board.rows;
  const ops = (board.pending?.ops ?? []).map((s) => (s.op.id === opId ? { ...s, realId: realId ?? s.op.entryId } : s));
  while (ops.length && ops[0].realId !== null) base = applyOne(base, ops.shift()!);
  return withOps(board, base, ops);
}
export const confirm = confirmOp;
/** วางได้ไหม: เขียนได้ · ต้นทาง/ปลายทางไม่ใช่วันที่ผ่านมาแล้ว · ไม่ใช่ช่องเดิม · แถวปลายทางยังทำงาน */
export function canDrop(board: RosterBoardDto, entryId: string, to: RosterTarget): boolean {
  if (!board?.canWrite) return false;
  const src = locate(board.rows, entryId);
  const dst = targetOf(board.rows, to);
  if (!src || !dst) return false;
  if (src.r === dst.r && src.c === dst.c) return false;
  const pastOf = (day: string) => board.days.find((d) => d.key === day)?.past !== false;
  if (pastOf(board.rows[src.r].cells[src.c].day) || pastOf(to.day)) return false;
  return !board.rows[dst.r].ended;
}
/** Shift + ลูกศร: ช่องถัดไป 1 ขั้น (ซ้าย/ขวา = วัน · ขึ้น/ลง = แถว) · ขอบ / วันที่ผ่านมาแล้ว ⇒ null */
export function keyTarget(board: RosterBoardDto, entryId: string, key: string): RosterTarget | null {
  if (!board?.canWrite) return null;
  const src = locate(board.rows, entryId);
  if (!src) return null;
  const dr = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
  const dc = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
  if (!dr && !dc) return null;
  const r = src.r + dr;
  const c = src.c + dc;
  if (r < 0 || r >= board.rows.length || c < 0 || c >= board.rows[r].cells.length) return null;
  const day = board.rows[r].cells[c].day;
  if (board.days.find((d) => d.key === day)?.past !== false) return null;
  return { employeeId: board.rows[r].employeeId, day };
}
// ◂ HR H2.2
