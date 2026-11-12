// HR H2.6 ▸ กติกาล้วนของคำขอแก้เวลา (ไม่มี DB · ไม่มี "เวลาปัจจุบัน" — ผู้เรียกส่ง now เอง) — brief hr-brief-H2.6 R3 · §3
//
//   • ลำดับรอบ (state machine): ปิด → เข้างาน · เปิด → เริ่มพัก | ออกงาน · พัก → กลับจากพัก | ออกงาน ·
//     เข้างานซ้อนตอนเปิด/พักได้เฉพาะเมื่อห่างจากเข้างานของรอบนั้นเกิน 960 นาที (รอบเดิมถือว่าค้าง — เพดานเดียวกับ H2.5)
//   • ตรวจเฉพาะรอยต่อที่ถูกแก้ (ก่อนหน้า → แถวใหม่ → ถัดไป · ยกเลิก = ก่อนหน้า → ถัดไป) — ประวัติเดิมที่ยุ่งอยู่แล้วไม่ทำให้คำขออื่นถูกปฏิเสธ
//   • ลำดับรหัส: TARGET → SAME → DUP → ORDER → TOO_LONG · ความละเอียดระดับนาที (Q17)
import { bkkDayKey } from "./time-rules";

export const CORRECTION_RULES = { BACK_DAYS: 35, MAX_PENDING: 5, REPEAT_AT: 3, REASON_MIN: 3, REASON_MAX: 200, DEDUPE_SEC: 60 } as const;

/** เพดานความยาวรอบ (นาที) — เท่ากับ OPEN_SESSION_CAP_MIN ของ H2.5 */
export const CORRECTION_SESSION_CAP_MIN = 960;

/** ข้อความคงที่ (ไทยทุกไบต์ — ห้ามต่อชื่อ/id/เวลา) */
export const CORRECTION_TEXT = {
  reason: "ใส่เหตุผลที่ขอแก้เวลา (3–200 ตัวอักษร)",
  badInput: "ข้อมูลคำขอแก้เวลาไม่ครบ — เลือกชนิดและเวลาอีกครั้ง",
  empNf: "ไม่พบพนักงานคนนี้ หรือคุณไม่มีสิทธิ์ยื่นแทน",
  targetNf: "ไม่พบการลงเวลานี้ หรือถูกแก้ไปแล้ว — กรุณารีเฟรช",
  future: "เวลาที่ขอต้องไม่เกินเวลาปัจจุบัน",
  tooOld: "ขอแก้เวลาย้อนหลังได้ไม่เกิน 35 วัน — ติดต่อผู้จัดการ",
  outOfEmployment: "วันที่ขอแก้อยู่นอกช่วงการจ้างงาน",
  paid: "เดือนนี้อนุมัติเงินเดือนแล้ว — แก้เวลาย้อนหลังไม่ได้",
  dupPending: "มีคำขอแก้เวลารายการนี้รออนุมัติอยู่แล้ว — ยกเลิกคำขอเดิมก่อน",
  tooMany: "มีคำขอแก้เวลารออนุมัติครบ 5 รายการแล้ว — รอผลก่อนยื่นเพิ่ม",
  order: "ลำดับเข้า–พัก–ออกงานไม่ถูกต้องหลังแก้ — ตรวจชนิดและเวลาอีกครั้ง",
  tooLong: "ช่วงเข้างานถึงออกงานยาวเกิน 16 ชั่วโมง — ตรวจเวลาอีกครั้ง",
  dup: "มีการลงเวลาในนาทีเดียวกันอยู่แล้ว",
  same: "เวลาที่ขอเท่ากับเวลาเดิม",
  noPerm: "คุณไม่มีสิทธิ์ตัดสินคำขอแก้เวลา",
  stale: "คำขอนี้ถูกตัดสินหรือยกเลิกไปแล้ว — กรุณารีเฟรช",
  inChain: "คำขอนี้อยู่ในสายอนุมัติ — ตัดสินที่หน้าอนุมัติ",
  notOwn: "ยกเลิกได้เฉพาะคำขอที่คุณยื่นหรือคำขอของคุณเอง",
  detailNo: "ไม่พบคำขอแก้เวลานี้ หรือคุณไม่มีสิทธิ์ดู",
  recomputeReason: "แก้เวลาตามคำขอที่อนุมัติ",
  nPending: "คำขอแก้เวลารออนุมัติ",
  nApproved: "คำขอแก้เวลาได้รับอนุมัติ",
  nRejected: "คำขอแก้เวลาไม่ได้รับอนุมัติ",
  nCancelled: "คำขอแก้เวลาถูกยกเลิก — ข้อมูลการลงเวลาเปลี่ยนไป",
} as const;

export type CorrectionAction = "ADD" | "CHANGE" | "VOID";
export type PunchKind = "IN" | "OUT" | "BREAK_START" | "BREAK_END";
export const CORRECTION_ACTIONS: readonly CorrectionAction[] = ["ADD", "CHANGE", "VOID"];
export const PUNCH_KINDS: readonly PunchKind[] = ["IN", "OUT", "BREAK_START", "BREAK_END"];
/** รหัสที่ตรวจลำดับได้ (ทั้งตอนยื่นและตอนใช้ผล) */
export type SequenceCode = "TARGET" | "SAME" | "DUP" | "ORDER" | "TOO_LONG";
/** รหัสที่ใช้ผลไม่ได้ (บันทึกใน audit hr.correction.apply_refused) */
export type ApplyCode = SequenceCode | "PAID" | "EMPLOYMENT" | "PERIOD";

/** ข้อความของรหัสใช้ผลไม่ได้ */
export function applyCodeText(code: ApplyCode): string {
  const T = CORRECTION_TEXT;
  return code === "TARGET" ? T.targetNf : code === "SAME" ? T.same : code === "DUP" ? T.dup : code === "ORDER" ? T.order : code === "TOO_LONG" ? T.tooLong : code === "PAID" ? T.paid : code === "PERIOD" ? T.targetNf : T.outOfEmployment;
}

/** เหตุผล: ตัดช่องว่างหัวท้าย · 3–200 ตัวอักษร (นับ code point) · อย่างอื่น = null */
export function cleanCorrectionReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const n = Array.from(s).length;
  return n >= CORRECTION_RULES.REASON_MIN && n <= CORRECTION_RULES.REASON_MAX ? s : null;
}

export type LivePunch = { id: string; kind: string; at: Date };
export type CorrectionOp = { action: CorrectionAction | string; kind?: string | null; at?: Date | null; attendanceId?: string | null };
export type CheckResult = { ok: true } | { ok: false; code: SequenceCode };

const MIN_MS = 60_000;
const minuteOf = (d: Date) => Math.floor(d.getTime() / MIN_MS);
const sortRows = <T extends { at: Date; id: string }>(xs: readonly T[]): T[] => [...xs].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

type St = "CLOSED" | "OPEN" | "BREAK";
const stateAfter = (k: string | null): St => (k === "IN" || k === "BREAK_END" ? "OPEN" : k === "BREAK_START" ? "BREAK" : "CLOSED");

/** เข้างานของรอบที่แถว index i อยู่ (IN ล่าสุดที่ ≤ i โดยไม่มีออกงานคั่น) */
function sessionInBefore(seq: readonly LivePunch[], i: number): LivePunch | null {
  for (let j = i; j >= 0; j--) {
    const r = seq[j]!;
    if (r.kind === "IN") return r;
    if (r.kind === "OUT") return null;
  }
  return null;
}

/** ก้าว prev → next ถูกลำดับไหม (prev = แถวที่ index pi ของ seq หรือไม่มี) */
function stepOk(seq: readonly LivePunch[], pi: number, next: LivePunch): boolean {
  const prev = pi >= 0 ? seq[pi]! : null;
  const st = stateAfter(prev?.kind ?? null);
  if (st === "CLOSED") return next.kind === "IN";
  if (next.kind === "OUT") return true;
  if (st === "OPEN" && next.kind === "BREAK_START") return true;
  if (st === "BREAK" && next.kind === "BREAK_END") return true;
  if (next.kind === "IN") {
    const sIn = sessionInBefore(seq, pi);
    return !!sIn && next.at.getTime() - sIn.at.getTime() > CORRECTION_SESSION_CAP_MIN * MIN_MS;
  }
  return false;
}

/** รอบที่ตำแหน่ง p อยู่ยาวเกินเพดานไหม: เข้างานของรอบ (≤ p) → ออกงานแรก (≥ p) ที่ไม่มีเข้างานคั่น */
function tooLongAt(seq: readonly LivePunch[], p: number, inFrom: number): boolean {
  const sIn = inFrom >= 0 ? sessionInBefore(seq, inFrom) : null;
  if (!sIn) return false;
  for (let j = Math.max(p, inFrom + 1); j < seq.length; j++) {
    const r = seq[j]!;
    if (r.kind === "IN" && r !== sIn) return false;
    if (r.kind === "OUT") return r.at.getTime() - sIn.at.getTime() > CORRECTION_SESSION_CAP_MIN * MIN_MS;
  }
  return false;
}

/**
 * ตรวจคำขอกับการลงเวลาที่ยังมีผล (live) ของพนักงานคนนั้น — ใช้ทั้งตอนยื่นและตอนใช้ผล (ใต้ล็อก hr:clock)
 * ADD = แถวใหม่ชนิด op.kind ณ op.at · CHANGE = แถวเป้าหมายย้ายไป op.at (ชนิดเดิม) · VOID = ตัดแถวเป้าหมาย
 */
export function checkCorrection(live: readonly LivePunch[], op: CorrectionOp): CheckResult {
  const rows = sortRows(live);
  const action = op.action;
  let target: LivePunch | null = null;
  if (action === "CHANGE" || action === "VOID") {
    target = rows.find((r) => r.id === op.attendanceId) ?? null;
    if (!target) return { ok: false, code: "TARGET" };
  }
  const rest = target ? rows.filter((r) => r !== target) : rows;
  if (action === "VOID") {
    const ti = rows.indexOf(target!);
    const seq = rest;
    const prevIdx = ti - 1; // ตำแหน่งในลำดับใหม่ (ตัดเป้าหมายแล้ว) ของแถวก่อนหน้า = ti − 1
    const next = seq[ti] ?? null;
    if (next && !stepOk(seq, prevIdx, next)) return { ok: false, code: "ORDER" };
    if (tooLongAt(seq, ti, prevIdx)) return { ok: false, code: "TOO_LONG" };
    return { ok: true };
  }
  const at = op.at;
  const kind = action === "CHANGE" ? target!.kind : op.kind;
  if (!(at instanceof Date) || !Number.isFinite(at.getTime()) || typeof kind !== "string") return { ok: false, code: "ORDER" };
  if (target && minuteOf(target.at) === minuteOf(at)) return { ok: false, code: "SAME" };
  if (rest.some((r) => Math.abs(r.at.getTime() - at.getTime()) < CORRECTION_RULES.DEDUPE_SEC * 1000)) return { ok: false, code: "DUP" };
  const mine: LivePunch = { id: "\u0000new", kind, at };
  const seq = sortRows([...rest, mine]);
  const p = seq.indexOf(mine);
  if (!stepOk(seq, p - 1, mine)) return { ok: false, code: "ORDER" };
  const next = seq[p + 1] ?? null;
  if (next && !stepOk(seq, p, next)) return { ok: false, code: "ORDER" };
  if (tooLongAt(seq, p, kind === "OUT" ? p - 1 : p)) return { ok: false, code: "TOO_LONG" };
  return { ok: true };
}

/**
 * วันของรอบ (วันไทย) ที่การลงเวลาชนิด kind ณ at สังกัด — IN = วันของมันเอง · อื่น ๆ = วันของเข้างานล่าสุดที่ ≤ at ภายใน 960 นาที
 * โดยไม่มีออกงานคั่น · ไม่งั้นวันของ at เอง (กติกาเดียวกับ H2.5: รอบเป็นของวันที่เข้างาน)
 */
export function sessionDayOf(live: readonly LivePunch[], at: Date, kind: string): string {
  if (kind === "IN") return bkkDayKey(at);
  const t = at.getTime();
  const rows = sortRows(live).filter((r) => r.at.getTime() <= t);
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.kind === "OUT" && r.at.getTime() < t) break;
    if (r.kind === "IN") return t - r.at.getTime() <= CORRECTION_SESSION_CAP_MIN * MIN_MS ? bkkDayKey(r.at) : bkkDayKey(at);
  }
  return bkkDayKey(at);
}

/**
 * r2 ▸ วันเจ้าของรอบ (วันไทยของเข้างานที่เปิดรอบ — กติกา H2.5) ที่คำขอนี้กระทบ คิดจากการลงเวลาที่ยังมีผล "ตอนนี้":
 * วันเจ้าของของแถวเป้าหมายก่อนแก้ · ของแถวใหม่หลังแก้ · และของทุกแถวที่วันเจ้าของเปลี่ยนเพราะการแก้ (เช่น ย้ายเข้างานข้ามเที่ยงคืน ⇒ ออกงานย้ายวันตาม)
 */
export function ownerDaysOf(live: readonly LivePunch[], op: CorrectionOp): string[] {
  const rows = sortRows(live);
  const target = op.attendanceId ? (rows.find((r) => r.id === op.attendanceId) ?? null) : null;
  const rest = target ? rows.filter((r) => r !== target) : rows;
  const kind = op.action === "CHANGE" ? (target?.kind ?? null) : op.kind;
  const mine: LivePunch | null = op.action !== "VOID" && op.at instanceof Date && typeof kind === "string" ? { id: "\u0000new", kind, at: op.at } : null;
  const after = mine ? sortRows([...rest, mine]) : rest;
  const ownerMap = (seq: readonly LivePunch[]) => new Map(seq.map((r) => [r.id, sessionDayOf(seq, r.at, r.kind)]));
  const b = ownerMap(rows);
  const a = ownerMap(after);
  const out = new Set<string>();
  if (target) out.add(b.get(target.id)!);
  if (mine) out.add(a.get(mine.id)!);
  for (const r of rest) if (b.get(r.id) !== a.get(r.id)) for (const d of [b.get(r.id)!, a.get(r.id)!]) out.add(d);
  return [...out].sort();
}

/** r2 ▸ งวดที่ต้องถือล็อก (เซตครอบเผื่อ): เดือนไทยของแต่ละเวลา และของเวลานั้น − 960 นาที (เข้างานของรอบอยู่ได้ไกลสุดเท่านั้น) — เรียงจากน้อยไปมาก */
export function lockMonthsOf(times: readonly (Date | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of times) {
    if (!(t instanceof Date) || !Number.isFinite(t.getTime())) continue;
    out.add(bkkDayKey(t).slice(0, 7));
    out.add(bkkDayKey(new Date(t.getTime() - CORRECTION_SESSION_CAP_MIN * MIN_MS)).slice(0, 7));
  }
  return [...out].sort();
}

/** เดือนของวัน (YYYY-MM) */
export const monthOfDay = (day: string): string => day.slice(0, 7);
