// HR VIS-5b ▸ ตัวเลขของหน้าภาพรวมทีม (ภาพ 01) จาก DTO ของบอร์ดวันนี้ (judge.ts loadAttendanceBoard) — ฟังก์ชันล้วน ไม่มี IO ไม่อ่านนาฬิกา ·
//   นับเป็น "คน" (แถวของบอร์ด) ไม่ใช่ช่องกะ · กติกาสถานะ = ผลตัดสินของ judge (ไม่คิดใหม่) · ยังไม่มา = เงื่อนไขเดียวกับแถบเตือนของหน้าลงเวลา (attendance-ui) ◂
import type { AttendanceBoardDto, AttendanceRowDto, AttendanceSlotDto } from "./judge-rules";

type Rows = readonly AttendanceRowDto[];
type BoardLike = Pick<AttendanceBoardDto, "rows"> | null | undefined;

const OFF = new Set(["LEAVE", "DAY_OFF", "NO_SCHEDULE"]);
/** ช่องที่มีกะจริง (ไม่ใช่หยุด/ไม่มีตาราง) — ลาที่มีกะยังนับเป็นแถวบนบอร์ด */
export const hasShift = (s: AttendanceSlotDto): boolean => !!s.shift && s.status !== "DAY_OFF" && s.status !== "NO_SCHEDULE";
/** อยู่กะ = มีกะ และไม่ใช่ลา/หยุด/ไม่มีตาราง */
export const onShiftSlot = (s: AttendanceSlotDto): boolean => !!s.shift && !OFF.has(s.status);
/** ยังไม่มา = ยังไม่ปิดผล และ (เลยเวลาเข้ากะแล้วยังไม่ลงเวลา หรือ ขาดโดยไม่มีเวลาเข้า) — attendance-ui แถบเตือน */
export const notInSlot = (s: AttendanceSlotDto): boolean => !s.final && (s.phase === "NOT_IN" || (s.status === "ABSENT" && !s.inAt));

export type HubKpis = { onShift: number; arrived: number; late: number; notIn: number; leave: number; people: number; dayOff: number };

const rowsOf = (b: BoardLike | Rows): Rows => (Array.isArray(b) ? (b as Rows) : ((b as Pick<AttendanceBoardDto, "rows"> | null | undefined)?.rows ?? []));

/** 5 ช่องตัวเลข (อยู่กะ · มาแล้ว · สาย · ยังไม่มา · ลา) + จำนวนคนบนบอร์ด + คนที่หยุดทั้งวัน — รับบอร์ดหรือแถวของบอร์ด */
export function kpisOf(board: BoardLike | Rows): HubKpis {
  const rows = rowsOf(board);
  const has = (f: (s: AttendanceSlotDto) => boolean) => rows.filter((r) => r.slots.some(f)).length;
  return {
    onShift: has(onShiftSlot),
    arrived: has((s) => !!s.inAt),
    late: has((s) => s.status === "LATE"),
    notIn: has(notInSlot),
    leave: has((s) => s.status === "LEAVE"),
    people: rows.length,
    dayOff: rows.filter((r) => r.slots.length > 0 && r.slots.every((s) => s.status === "DAY_OFF")).length,
  };
}

const endOf = (sh: NonNullable<AttendanceSlotDto["shift"]>) => (sh.crossesMidnight || sh.endMin <= sh.startMin ? sh.endMin + 1440 : sh.endMin);

/** แถวที่ขึ้นบนเส้นเวลา (มีกะ) · ชื่อคนที่หยุดวันนี้ */
export function boardRowsOf(board: BoardLike): { rows: AttendanceRowDto[]; off: string[] } {
  const rows = rowsOf(board);
  return {
    rows: rows.filter((r) => r.slots.some(hasShift)),
    off: rows.filter((r) => r.slots.length > 0 && r.slots.every((s) => s.status === "DAY_OFF")).map((r) => r.name),
  };
}

/** แกนชั่วโมงของเส้นเวลา: ปัดลง/ขึ้นเป็นชั่วโมง · อย่างน้อย 8 ชม. · ขีดทุก 2 ชม. (ช่วง ≤ 12 ชม.) หรือ 4 ชม. */
export function axisOf(board: BoardLike): { start: number; end: number; ticks: number[] } | null {
  const shifts = rowsOf(board).flatMap((r) => r.slots.filter(hasShift).map((s) => s.shift!));
  if (!shifts.length) return null;
  let start = Math.floor(Math.min(...shifts.map((s) => s.startMin)) / 60) * 60;
  let end = Math.ceil(Math.max(...shifts.map(endOf)) / 60) * 60;
  if (end - start < 480) end = start + 480;
  if (end > 2880) end = 2880;
  if (start < 0) start = 0;
  const step = end - start > 720 ? 240 : 120;
  const ticks: number[] = [];
  for (let m = start; m < end; m += step) ticks.push(m);
  return { start, end, ticks };
}
/** ตำแหน่ง (ร้อยละ 0–100) ของนาทีบนแกน */
export const pctOf = (min: number, axis: { start: number; end: number }): number => Math.max(0, Math.min(100, ((min - axis.start) / (axis.end - axis.start)) * 100));
/** ช่วงของแท่งกะบนแกน (left · width เป็นร้อยละ) */
export function barOf(sh: NonNullable<AttendanceSlotDto["shift"]>, axis: { start: number; end: number }): { left: number; width: number } {
  const l = pctOf(sh.startMin, axis);
  return { left: l, width: Math.max(2, pctOf(endOf(sh), axis) - l) };
}
/** นาทีของกะ (เวลาเริ่ม–เลิกตามตาราง รวมเวลาพัก — DTO ของบอร์ดไม่มีเวลาพักของกะ) */
export const shiftSpanMin = (sh: NonNullable<AttendanceSlotDto["shift"]>): number => endOf(sh) - sh.startMin;

export type HubBoardFacts = {
  plannedMin: number;
  plannedPeople: number;
  workedMin: number;
  thinnest: { from: number; to: number; n: number } | null;
  methods: { method: string; n: number }[];
  arrivedByShift: { name: string; n: number }[];
  lateWho: { name: string; lateMin: number; inAt: string | null }[];
  notInWho: { employeeId: string; name: string; startMin: number | null }[];
  leaveWho: { name: string; label: string | null }[];
};
/** ข้อเท็จจริงของการ์ดบอร์ด (ท้ายการ์ด + บรรทัดรองของช่องตัวเลข) — จาก DTO เท่านั้น */
export function boardFactsOf(board: (Pick<AttendanceBoardDto, "rows"> & { totals?: AttendanceBoardDto["totals"] }) | null | undefined): HubBoardFacts {
  const rows = rowsOf(board);
  const working = rows.flatMap((r) => r.slots.filter(onShiftSlot).map((s) => ({ r, s })));
  const plannedMin = working.reduce((a, { s }) => a + shiftSpanMin(s.shift!), 0);
  // ช่วงคนน้อยสุด: ทุกชั่วโมงระหว่างกะแรกถึงกะสุดท้าย — นับคนที่กะคลุมทั้งชั่วโมงนั้น (ไม่นับลา) · ช่วงต่อเนื่องแรกที่จำนวนต่ำสุด
  let thinnest: HubBoardFacts["thinnest"] = null;
  if (working.length) {
    const lo = Math.floor(Math.min(...working.map(({ s }) => s.shift!.startMin)) / 60) * 60;
    const hi = Math.ceil(Math.max(...working.map(({ s }) => endOf(s.shift!))) / 60) * 60;
    const per: { h: number; n: number }[] = [];
    for (let h = lo; h < hi; h += 60) per.push({ h, n: new Set(working.filter(({ s }) => s.shift!.startMin <= h && endOf(s.shift!) >= h + 60).map(({ r }) => r.employeeId)).size });
    const min = Math.min(...per.map((p) => p.n));
    const i = per.findIndex((p) => p.n === min);
    let j = i;
    while (j + 1 < per.length && per[j + 1]!.n === min) j++;
    thinnest = { from: per[i]!.h, to: per[j]!.h + 60, n: min };
  }
  const count = <K extends string>(xs: K[]) => [...xs.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<K, number>())].map(([k, n]) => ({ k, n }));
  const firstIn = rows.map((r) => r.slots.find((s) => !!s.inAt)).filter((s): s is AttendanceSlotDto => !!s);
  return {
    plannedMin,
    plannedPeople: new Set(working.map(({ r }) => r.employeeId)).size,
    workedMin: board?.totals?.workedMin ?? rows.reduce((a, r) => a + r.slots.reduce((b, s) => b + s.workedMin, 0), 0),
    thinnest,
    methods: count(firstIn.map((s) => s.method).filter((m): m is string => !!m)).map(({ k, n }) => ({ method: k, n })),
    arrivedByShift: count(firstIn.map((s) => s.shift?.name ?? "")).filter(({ k }) => !!k).map(({ k, n }) => ({ name: k, n })),
    lateWho: rows.flatMap((r) => r.slots.filter((s) => s.status === "LATE").slice(0, 1).map((s) => ({ name: r.name, lateMin: s.lateMin, inAt: s.inAt }))),
    notInWho: rows.flatMap((r) => r.slots.filter(notInSlot).slice(0, 1).map((s) => ({ employeeId: r.employeeId, name: r.name, startMin: s.shift?.startMin ?? null }))),
    leaveWho: rows.flatMap((r) => r.slots.filter((s) => s.status === "LEAVE").slice(0, 1).map((s) => ({ name: r.name, label: s.leave?.label ?? null }))),
  };
}

/** ใกล้ครบกำหนด: เรียงตามวันที่ (ไม่มีวันที่ไว้ท้าย) · 3 รายการแรก + จำนวนที่เหลือ */
export function dueStripOf<T extends { date: string | null }>(items: readonly T[], take = 3): { shown: T[]; more: number } {
  const sorted = items.slice().sort((a, b) => String(a.date ?? "9999").localeCompare(String(b.date ?? "9999")));
  return { shown: sorted.slice(0, take), more: Math.max(0, sorted.length - take) };
}
/** จำนวนวันจาก today ถึง day (YYYY-MM-DD ทั้งคู่) */
export function daysBetween(today: string, day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
// ◂ HR VIS-5b
