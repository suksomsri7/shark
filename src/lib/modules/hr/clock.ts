// HR H2.4 ▸ ลงเวลา v2 — ย้ายตัวลงเวลาจาก service.ts มาที่นี่ (service.ts re-export ชื่อเดิม: ผู้เรียกเดิม · pos-seam.ts · ข้อสอบ ไม่ต้องแก้)
//
// กติกา (brief hr-brief-H2.4 R1–R12 · มติผู้คุม Q1–Q11):
//   • รอบการทำงาน (session) แทน "วันตามปฏิทิน" (D13b): สถานะจากแถวล่าสุด — IN/BREAK_END = เปิด · BREAK_START = พัก · OUT/ไม่มี = ปิด ·
//     รอบที่ผูกกะปิดเองเมื่อเลยเลิกกะ + closeGraceMin · รอบที่ไม่ผูกกะ = กติกาเดิม (วันไทยเดียวกัน — คนที่ยังไม่มีตารางกะ, Q3)
//   • เข้างานผูกกะที่ประกาศแล้ว (publishedAt ไม่ว่าง) ของวัน D−1..D+1 ที่ start − earlyInMin ≤ now < end (clock-rules.pickRosterEntry) ·
//     ผูกแล้วตัดสินสาย/ตรงเวลาเทียบกะ + HrShift.graceMin · ไม่ผูก = ตารางประจำสัปดาห์ (HrWorkSchedule) แบบเดิม ·
//     ออกงาน/พัก สืบ rosterEntryId จากเข้างานของรอบ
//   • ค่า earlyInMin / closeGraceMin = ค่าตั้งของระบบ HR (AppSystem.settings.hrClock · ค่าตั้งต้น 120/240 — มติ Q1) อ่านใน tx เดียวกัน
//   • กันแตะซ้ำ: NEXT = แถวล่าสุดอายุ < CLOCK_DEDUPE_SEC (ชนิดใดก็ได้) คืนแถวนั้น · ชนิดตรง = ชนิดเดียวกัน < 60 วิ ·
//     เข้างาน (IN) ซ้ำนับเฉพาะในรอบเดียวกัน (กะเดียวกัน หรือไม่ผูกกะทั้งคู่และวันไทยเดียวกัน — MINOR-3)
//   • ล็อก `hr:clock:<employeeId>` ใน tx เดียว · ทุกคำสั่งใน tx ใช้ tx (COMMON §C.8) · ไม่แตะล็อกตารางกะ (hr:roster:*)
//   • เวลา `opts.now` = ใช้ในข้อสอบ/ฝั่งเซิร์ฟเวอร์เท่านั้น — action/หน้า/cron/pos-seam ไม่ส่ง (S11.1)
//   • ข้อมูลอ่อนไหว (lat/lng/accuracyM/photoKey/deviceId) ไม่ออกจากไฟล์นี้ในผลลัพธ์ใด ๆ — ผลคืนเฉพาะระยะห่าง (distanceM) ◂
import type { HrAttendanceKind, HrClockSource, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { bkkParts, clockInDetail, employeeOfUser, type AttendanceJudgement, type ClockInDetail, type Ctx, type HrTx } from "./service";
import { verifyPin, verifyPinForEmployee } from "./pin";
import { unitOfDay } from "./roster";
import { addDays, bkkDayKey, shiftWindow, type Window } from "./time-rules";
import { CLOCK_RULES, clockPolicyOf, distanceM, nextKindOf, pickRosterEntry, sessionState, type ClockPolicy, type ClockSessionState } from "./clock-rules";

// HR H0.3 ▸ หน้าต่างกันแตะซ้ำ (วินาที) ต่อพนักงาน — ดู clock() ◂
export const CLOCK_DEDUPE_SEC = 60;

/** ข้อความปฏิเสธของการลงเวลา (ไทยคงที่ทุกไบต์ — ห้ามต่อชื่อ/id/พิกัด) · ผู้อ่าน = คนที่กำลังลงเวลา (มือถือ/จอหน้าร้าน) */
export const CLOCK_TEXT = {
  noEmployee: "ไม่พบพนักงาน",
  mNoEmp: "บัญชีของคุณยังไม่ได้ผูกกับรายชื่อพนักงาน — ลงเวลาที่เครื่องหน้าร้าน หรือขอให้ผู้ดูแลผูกบัญชี",
  mInactive: "สถานะพนักงานของคุณปิดอยู่ — ติดต่อผู้จัดการ",
  mOff: "สาขานี้ยังไม่เปิดให้ลงเวลาด้วยมือถือ — ลงเวลาที่เครื่องหน้าร้าน",
  mNoGps: "เปิดตำแหน่ง (GPS) ของมือถือก่อน แล้วลองใหม่",
  mBadGps: "อ่านตำแหน่งไม่ได้ — ลองใหม่อีกครั้ง",
  mWeak: "สัญญาณ GPS ยังไม่แม่นพอ — ออกไปที่โล่งแล้วลองใหม่",
  mOutside: "คุณอยู่นอกรัศมีของร้าน — เข้าใกล้ร้านแล้วลองใหม่",
  bNotIn: "ยังไม่ได้ลงเวลาเข้างาน — เริ่มพักไม่ได้",
  bOnBreak: 'กำลังพักอยู่ — กด "กลับจากพัก" เมื่อพร้อม',
  bNotOn: "ยังไม่ได้เริ่มพัก",
} as const;
export type ClockText = (typeof CLOCK_TEXT)[keyof typeof CLOCK_TEXT];

/** ปฏิเสธการลงเวลา — ข้อความไทยคงที่ (action ส่งต่อให้ผู้ใช้ได้โดยไม่ต้องอ่าน e.message ของระบบอื่น) */
export class ClockRefusedError extends Error {
  constructor(readonly reason: ClockText) {
    super(reason);
    this.name = "ClockRefusedError";
  }
}

export type ClockOutcome = {
  id: string;
  kind: HrAttendanceKind;
  at: Date;
  judgement: AttendanceJudgement | null;
  lateMin: number | null;
  /** true = แตะซ้ำภายใน CLOCK_DEDUPE_SEC ⇒ ไม่เพิ่มแถว · id/kind/at คือของแถวล่าสุดที่มีอยู่แล้ว */
  deduped: boolean;
  employeeName: string;
  /** HR H2.4 ▸ กะที่แถวนี้ผูก (null = ไม่ผูก) ◂ */
  rosterEntryId: string | null;
};

/** ผลตรวจตำแหน่งที่จะเก็บติดแถว (เฉพาะมือถือที่สาขาบังคับ GPS) */
type GeoStamp = { lat: number; lng: number; accuracyM: number; distanceM: number; inRadius: boolean };
export type ClockInput = {
  employeeId: string;
  kind: HrAttendanceKind | "NEXT";
  note?: string | null;
  requireActive?: boolean;
  /** HR H2.4 ▸ R7 ที่มา: KIOSK · MOBILE · MANAGER (ไม่ส่ง = null — ทาง POS seam, มติ Q2) ◂ */
  source?: HrClockSource | null;
  deviceId?: string | null;
  /** ภายในไฟล์นี้เท่านั้น (mobileClock) */
  geo?: GeoStamp | null;
};
export type ClockOpts = { tx?: HrTx; now?: Date };

const dbDate = (day: string) => new Date(`${day}T00:00:00Z`); // รูปเดียวกับคอลัมน์ @db.Date
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const MIN_MS = 60_000;
const nowOf = (opts: { now?: Date } | undefined): Date => (opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? new Date(opts.now.getTime()) : new Date());
const cleanDevice = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null);

// ── อ่านสถานะรอบ (ใช้ทั้งใน tx ของ clock และนอก tx ของ nextClockKind / myClockState) ──
type Db = Prisma.TransactionClient;
type EntryRow = { id: string; date: Date; startMin: number; endMin: number; crossesMidnight: boolean; shift: { graceMin: number; name: string } };
const ENTRY_SELECT = { id: true, date: true, startMin: true, endMin: true, crossesMidnight: true, shift: { select: { graceMin: true, name: true } } } as const;
const windowOf = (e: Pick<EntryRow, "date" | "startMin" | "endMin" | "crossesMidnight">): Window | null => {
  try {
    return shiftWindow(dayOf(e.date), { startMin: e.startMin, endMin: e.endMin, crossesMidnight: e.crossesMidnight });
  } catch {
    return null; // แถวเวลาเสีย (ก่อนกติกา H1.2) ⇒ ไม่ใช้ผูก
  }
};

/** ค่าตั้งการลงเวลาของระบบ HR นี้ (AppSystem.settings.hrClock) — อ่านผ่าน client ที่ได้มา (tx หรือ tenantDb) */
async function policyOf(db: Db, ctx: Ctx): Promise<ClockPolicy> {
  const s = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } });
  const raw = s?.settings && typeof s.settings === "object" ? (s.settings as Record<string, unknown>).hrClock : null;
  return clockPolicyOf(raw);
}

type LastRow = { id: string; kind: HrAttendanceKind; at: Date; judgement: AttendanceJudgement | null; lateMin: number | null; rosterEntryId: string | null };
type Session = { last: LastRow | null; state: ClockSessionState; entry: EntryRow | null; window: Window | null };
async function sessionOf(db: Db, ctx: Ctx, employeeId: string, now: Date, policy: ClockPolicy): Promise<Session> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const last = await db.hrAttendance.findFirst({
    where: { ...scope, employeeId },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    select: { id: true, kind: true, at: true, judgement: true, lateMin: true, rosterEntryId: true },
  });
  const entry = last?.rosterEntryId ? ((await db.hrRosterEntry.findFirst({ where: { ...scope, id: last.rosterEntryId }, select: ENTRY_SELECT })) as EntryRow | null) : null;
  const window = entry ? windowOf(entry) : null;
  const state = sessionState(last ? { kind: last.kind, at: last.at, rosterEntryId: window ? last.rosterEntryId : null } : null, window, now, { closeGraceMin: policy.closeGraceMin });
  return { last, state, entry, window };
}

/** กะที่ประกาศแล้วของพนักงาน วัน D−1..D+1 (วันไทยของ now) ที่เข้างาน ณ now ผูกได้ */
async function rosterPick(db: Db, ctx: Ctx, employeeId: string, now: Date, policy: ClockPolicy): Promise<{ entry: EntryRow; window: Window } | null> {
  const d = bkkDayKey(now);
  const rows = (await db.hrRosterEntry.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, publishedAt: { not: null }, date: { gte: dbDate(addDays(d, -1)), lte: dbDate(addDays(d, 1)) } },
    select: ENTRY_SELECT,
    orderBy: { id: "asc" },
    take: 50,
  })) as EntryRow[];
  const cands = rows.flatMap((e) => {
    const w = windowOf(e);
    return w ? [{ id: e.id, start: w.start, end: w.end, e }] : [];
  });
  const p = pickRosterEntry("IN", now, cands, { earlyMin: policy.earlyInMin });
  return p ? { entry: p.e, window: { start: p.start, end: p.end } } : null;
}

/** ตัดสินเข้างานที่ผูกกะ: สาย = เลยเวลาเริ่มเกิน graceMin ของกะ · lateMin = นาทีหลังเวลาเริ่ม (ตรงเวลา = 0) */
function rosterInDetail(at: Date, entry: EntryRow, w: Window): ClockInDetail {
  const after = Math.floor((at.getTime() - w.start.getTime()) / MIN_MS);
  const late = after > entry.shift.graceMin;
  return { judgement: late ? "LATE" : "ON_TIME", dueMin: entry.startMin, lateMin: late ? after : 0 };
}

// ── ลงเวลา (IN/OUT/พัก) ──
// เข้างาน = ตัดสินทันที แล้ว **เก็บคำตัดสินติดแถวไว้** (snapshot) — ตารางแก้ทีหลังไม่ย้อนเปลี่ยนคำตัดสินของวันที่ผ่านแล้ว
// ปฏิเสธ (ไม่พบพนักงาน / พ้นสภาพเมื่อ requireActive / พักไม่ได้ในสถานะนี้) = throw ClockRefusedError ข้อความไทยคงที่ ⇒ ไม่มีแถว
export async function clock(ctx: Ctx, input: ClockInput, opts: ClockOpts = {}): Promise<ClockOutcome> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const at = nowOf(opts);
  // HR SYNC ▸ ตัวงานเดียว รันใน tx ที่ได้มา (ของผู้เรียก — POS — หรือของ HR เอง) · ทุกคำสั่งระบุ tenantId/systemId เอง ◂
  const run = async (tx: Prisma.TransactionClient): Promise<ClockOutcome> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr:clock:${input.employeeId}`}, 0))`;
    const emp = await tx.hrEmployee.findFirst({
      where: { ...scope, id: input.employeeId, ...(input.requireActive ? { active: true } : {}) },
      select: { id: true, name: true },
    });
    if (!emp) throw new ClockRefusedError(CLOCK_TEXT.noEmployee);
    const policy = await policyOf(tx, ctx);
    const ses = await sessionOf(tx, ctx, emp.id, at, policy);
    const last = ses.last;
    const fresh = !!last && Math.abs(at.getTime() - last.at.getTime()) < CLOCK_DEDUPE_SEC * 1000;
    const dedupedOf = (l: LastRow): ClockOutcome => ({ id: l.id, kind: l.kind, at: l.at, judgement: l.judgement, lateMin: l.lateMin, deduped: true, employeeName: emp.name, rosterEntryId: l.rosterEntryId });
    if (last && fresh && input.kind === "NEXT") return dedupedOf(last);

    // ชนิดที่จะบันทึก
    let kind: HrAttendanceKind;
    if (input.kind === "NEXT") kind = nextKindOf(ses.state);
    else if (input.kind === "BREAK_START") {
      if (!(last && fresh && last.kind === "BREAK_START") && ses.state !== "OPEN") throw new ClockRefusedError(ses.state === "ON_BREAK" ? CLOCK_TEXT.bOnBreak : CLOCK_TEXT.bNotIn);
      kind = "BREAK_START";
    } else if (input.kind === "BREAK_END") {
      if (!(last && fresh && last.kind === "BREAK_END") && ses.state !== "ON_BREAK") throw new ClockRefusedError(CLOCK_TEXT.bNotOn);
      kind = "BREAK_END";
    } else kind = input.kind; // IN/OUT ทางตรง (ผู้จัดการแก้ · POS) — บันทึกได้ทุกสถานะ (ออกระหว่างพัก = พักจบตอนออก)

    // กะที่ผูก: เข้างานเลือกใหม่ · อื่น ๆ สืบจากรอบที่เปิดอยู่
    const pick = kind === "IN" ? await rosterPick(tx, ctx, emp.id, at, policy) : null;
    const rosterEntryId = kind === "IN" ? (pick?.entry.id ?? null) : ses.state !== "CLOSED" ? (ses.window ? (last?.rosterEntryId ?? null) : null) : null;

    // กันแตะซ้ำชนิดเดียวกัน (D13a) — เข้างานนับเฉพาะรอบเดียวกัน (MINOR-3: เข้า 23:59:40 แล้วเข้า 00:00:10 ไม่ใช่การแตะซ้ำ)
    if (last && fresh && input.kind === last.kind) {
      const sameSession =
        kind !== "IN" ||
        (last.rosterEntryId ? rosterEntryId === last.rosterEntryId : !rosterEntryId && bkkDayKey(last.at) === bkkDayKey(at));
      if (sameSession) return dedupedOf(last);
    }

    let detail: ClockInDetail | null = null;
    if (kind === "IN") {
      if (pick) detail = rosterInDetail(at, pick.entry, pick.window);
      else {
        const w = bkkParts(at).weekday;
        const r = await tx.hrWorkSchedule.findFirst({
          where: { ...scope, employeeId: emp.id, weekday: w },
          select: { weekday: true, dayOff: true, startMin: true, endMin: true, graceMin: true },
        });
        detail = clockInDetail(at, r ?? null);
      }
    }
    const g = input.geo ?? null;
    const a = await tx.hrAttendance.create({
      data: {
        ...scope,
        employeeId: emp.id,
        kind,
        at,
        note: input.note?.trim() || null,
        judgement: detail?.judgement ?? null,
        dueMin: detail?.dueMin ?? null,
        lateMin: detail?.lateMin ?? null,
        rosterEntryId,
        source: input.source ?? null,
        deviceId: cleanDevice(input.deviceId),
        ...(g ? { lat: g.lat, lng: g.lng, accuracyM: g.accuracyM, distanceM: g.distanceM, inRadius: g.inRadius } : {}),
      },
      select: { id: true },
    });
    return { id: a.id, kind, at, judgement: detail?.judgement ?? null, lateMin: detail?.lateMin ?? null, deduped: false, employeeName: emp.name, rosterEntryId };
  };
  if (opts.tx) return run(opts.tx);
  // maxWait 15 วิ: แตะพร้อมกันหลายจุด (kiosk ∥ มือถือ ∥ POS) ต่อคิวบนล็อกเดียว — คิวที่รอ connection ว่างต้องไม่ล้มก่อนถึงตา (S9.1) ·
  //   ต่ำกว่า maxDuration ของ route/action ที่เรียก (COMMON §F.5)
  return tenantDb(ctx).$transaction((t) => run(t as unknown as Prisma.TransactionClient), { maxWait: 15_000, timeout: 20_000 });
}

/** ครั้งถัดไปของปุ่มเดียว (เข้า / ออก / กลับจากพัก) — ใช้แสดงผล · การลงเวลาจริงตัดสินซ้ำใต้ล็อกใน clock(kind "NEXT") ด้วยกติกาเดียวกัน */
export async function nextClockKind(ctx: Ctx, employeeId: string, opts: ClockOpts = {}): Promise<HrAttendanceKind> {
  const db = (opts.tx ?? tenantDb(ctx)) as unknown as Prisma.TransactionClient; // HR SYNC ▸ ชนิดเดียว (union ลึกเกิน TS2589) ◂
  const now = nowOf(opts);
  const policy = await policyOf(db, ctx);
  return nextKindOf((await sessionOf(db, ctx, employeeId, now, policy)).state);
}

// ─────────────────── จอหน้าร้าน (kiosk) ───────────────────
export type KioskClockResult =
  | {
      ok: true;
      employeeName: string;
      kind: HrAttendanceKind;
      at: Date;
      judgement: AttendanceJudgement | null;
      lateMin: number | null;
      /** HR H0.3 ▸ แตะซ้ำภายใน CLOCK_DEDUPE_SEC — ไม่มีแถวใหม่ kind/at = ของแถวที่ลงไว้แล้ว ◂ */
      deduped: boolean;
    }
  | { ok: false; reason: string };

const kioskOk = (r: ClockOutcome): KioskClockResult => ({ ok: true, employeeName: r.employeeName, kind: r.kind, at: r.at, judgement: r.judgement, lateMin: r.lateMin, deduped: r.deduped });

/** ทางเดิม (เลือกชื่อ + PIN) — คงไว้ให้ข้อสอบรุ่นเก่า · จอ kiosk v2 ใช้ kioskClock (PIN อย่างเดียว) */
export async function clockWithPin(ctx: Ctx, employeeId: string, pin: string): Promise<KioskClockResult> {
  const emp = await verifyPinForEmployee(ctx, employeeId, pin);
  if (!emp.ok) return { ok: false, reason: emp.reason };
  try {
    return kioskOk(await clock(ctx, { employeeId: emp.employeeId, kind: "NEXT", requireActive: true, source: "KIOSK" }));
  } catch (e) {
    if (e instanceof ClockRefusedError) return { ok: false, reason: e.reason };
    throw e;
  }
}

/**
 * HR H2.4 ▸ R9 จอหน้าร้าน v2: PIN อย่างเดียว (ไม่มีรายชื่อ — PIN ไม่ซ้ำทั้งร้าน H0.5 บอกได้ว่าเป็นใคร · Q8)
 *   verifyPin (ถังจำกัดของ H0.5 เท่านั้น — ไม่มีตัวจำกัดชุดที่สอง) → clock(source KIOSK) · callerKey มาจากเซิร์ฟเวอร์ (kiosk:<userId>) ·
 *   unitId = สาขาของเครื่อง (พนักงานต่างสาขา = "PIN ไม่ถูกต้อง") · kind: NEXT (ค่าปริยาย) หรือ BREAK_START
 */
export async function kioskClock(ctx: Ctx, input: { pin: string; callerKey: string; unitId?: string | null; kind?: "NEXT" | "BREAK_START" }, opts: { now?: Date } = {}): Promise<KioskClockResult> {
  const v = await verifyPin({ tenantId: ctx.tenantId, pin: String(input?.pin ?? ""), callerKey: String(input?.callerKey ?? ""), unitId: input?.unitId ?? null, systemId: ctx.systemId });
  if (!v.ok) return { ok: false, reason: v.reason };
  try {
    return kioskOk(await clock(ctx, { employeeId: v.employeeId, kind: input?.kind === "BREAK_START" ? "BREAK_START" : "NEXT", requireActive: true, source: "KIOSK" }, { now: opts.now }));
  } catch (e) {
    if (e instanceof ClockRefusedError) return { ok: false, reason: e.reason };
    throw e;
  }
}

// ─────────────────── ลงเวลาด้วยมือถือ (R8) ───────────────────
export type MobileClockKind = "NEXT" | "BREAK_START" | "BREAK_END";
export type MobileClockInput = { kind?: MobileClockKind; latitude?: unknown; longitude?: unknown; accuracyM?: unknown; deviceId?: unknown };
export type MobileClockResult =
  | { ok: true; kind: HrAttendanceKind; at: Date; judgement: AttendanceJudgement | null; lateMin: number | null; deduped: boolean; distanceM: number | null }
  | { ok: false; reason: string; distanceM?: number };
type MobileCode = "NO_EMPLOYEE" | "INACTIVE" | "OFF" | "NO_GPS" | "BAD_GPS" | "WEAK" | "OUTSIDE" | "BREAK_NOT_IN" | "BREAK_ON" | "BREAK_NOT_ON";
const CODE_OF_TEXT: Partial<Record<string, MobileCode>> = { [CLOCK_TEXT.bNotIn]: "BREAK_NOT_IN", [CLOCK_TEXT.bOnBreak]: "BREAK_ON", [CLOCK_TEXT.bNotOn]: "BREAK_NOT_ON", [CLOCK_TEXT.noEmployee]: "INACTIVE" };

type SiteRow = { id: string; unitId: string | null; mobileEnabled: boolean; gpsRequired: boolean; centerLat: Prisma.Decimal | null; centerLng: Prisma.Decimal | null; radiusM: number; minAccuracyM: number };
const SITE_SELECT = { id: true, unitId: true, mobileEnabled: true, gpsRequired: true, centerLat: true, centerLng: true, radiusM: true, minAccuracyM: true } as const;

/** พนักงานของผู้ใช้ + สาขาของวันนี้ (ยืมตัวที่ครอบวันนี้ ไม่งั้นสาขาประจำ — H1.1/H2.1 R3) */
async function selfOf(actor: { tenantId: string; userId: string }, now: Date) {
  const link = await employeeOfUser(actor?.tenantId ?? "", actor?.userId ?? "");
  if (!link) return null;
  const ctx: Ctx = { tenantId: actor.tenantId, systemId: link.systemId };
  const e = await tenantDb(ctx).hrEmployee.findFirst({
    where: { id: link.employeeId },
    select: { id: true, active: true, employmentStatus: true, unitId: true, units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 } },
  });
  if (!e) return null;
  return { ctx, employeeId: e.id, active: e.active && e.employmentStatus !== "ENDED", unitId: unitOfDay(e, bkkDayKey(now)) };
}
/** จุดลงเวลาของสาขา (มีแถวของสาขา = ใช้แถวนั้นแม้ปิดอยู่) ไม่งั้นแถวทั้งร้าน */
async function siteOf(ctx: Ctx, unitId: string | null): Promise<SiteRow | null> {
  const db = tenantDb(ctx);
  if (unitId) {
    const own = (await db.hrClockSite.findFirst({ where: { unitId }, select: SITE_SELECT })) as SiteRow | null;
    if (own) return own;
  }
  return (await db.hrClockSite.findFirst({ where: { unitId: null }, select: SITE_SELECT })) as SiteRow | null;
}
const usable = (s: SiteRow | null): s is SiteRow => !!s && s.mobileEnabled && (!s.gpsRequired || (s.centerLat !== null && s.centerLng !== null));
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * พนักงานลงเวลาเองด้วยมือถือ — ไม่รับ id พนักงานจากผู้เรียก (COMMON §C.7) · ผู้ใช้ → พนักงาน (employeeOfUser) → สาขาของวันนี้ → จุดลงเวลา →
 * ตรวจ GPS (มี · รูปแบบ · ความแม่นยำ · รัศมี) → clock(source MOBILE) · ปฏิเสธ = ไม่มีแถว + audit hr.clock.mobile_refused { code } (ไม่มีพิกัด)
 * จุดที่ไม่บังคับ GPS ⇒ ไม่อ่านและไม่เก็บพิกัด · ข้อจำกัดที่ยอมรับ (Q7): พิกัดปลอมที่ดูสมจริงตรวจไม่ได้
 */
export async function mobileClock(actor: { tenantId: string; userId: string }, input: MobileClockInput, opts: { now?: Date } = {}): Promise<MobileClockResult> {
  const now = nowOf(opts);
  const me = await selfOf(actor, now);
  const refuse = async (code: MobileCode, reason: string, extra: { distanceM?: number } = {}): Promise<MobileClockResult> => {
    await writeAudit({
      tenantId: actor.tenantId,
      actorType: "USER",
      actorId: actor.userId,
      action: "hr.clock.mobile_refused",
      targetType: "HrEmployee",
      ...(me ? { targetId: me.employeeId } : {}),
      after: me ? { code, employeeId: me.employeeId, systemId: me.ctx.systemId, unitId: me.unitId } : { code },
    });
    return { ok: false, reason, ...extra };
  };
  if (!me) return refuse("NO_EMPLOYEE", CLOCK_TEXT.mNoEmp);
  if (!me.active) return refuse("INACTIVE", CLOCK_TEXT.mInactive);
  const site = await siteOf(me.ctx, me.unitId);
  if (!usable(site)) return refuse("OFF", CLOCK_TEXT.mOff);
  let geo: GeoStamp | null = null;
  let dist: number | null = null;
  if (site.gpsRequired) {
    const { latitude, longitude, accuracyM } = input ?? {};
    if ((latitude === undefined || latitude === null) && (longitude === undefined || longitude === null)) return refuse("NO_GPS", CLOCK_TEXT.mNoGps);
    if (!finite(latitude) || !finite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return refuse("BAD_GPS", CLOCK_TEXT.mBadGps);
    if (accuracyM !== undefined && accuracyM !== null && (!finite(accuracyM) || accuracyM < 0)) return refuse("BAD_GPS", CLOCK_TEXT.mBadGps);
    if (!finite(accuracyM) || accuracyM > site.minAccuracyM) return refuse("WEAK", CLOCK_TEXT.mWeak);
    dist = distanceM({ lat: Number(site.centerLat), lng: Number(site.centerLng) }, { lat: latitude, lng: longitude });
    if (dist > site.radiusM) return refuse("OUTSIDE", CLOCK_TEXT.mOutside, { distanceM: dist });
    geo = { lat: round6(latitude), lng: round6(longitude), accuracyM: Math.round(accuracyM), distanceM: dist, inRadius: true };
  }
  const kind = input?.kind === "BREAK_START" || input?.kind === "BREAK_END" ? input.kind : "NEXT";
  try {
    const r = await clock(me.ctx, { employeeId: me.employeeId, kind, requireActive: true, source: "MOBILE", deviceId: cleanDevice(input?.deviceId), geo }, { now });
    return { ok: true, kind: r.kind, at: r.at, judgement: r.judgement, lateMin: r.lateMin, deduped: r.deduped, distanceM: dist };
  } catch (e) {
    if (e instanceof ClockRefusedError) return refuse(CODE_OF_TEXT[e.reason] ?? "INACTIVE", e.reason === CLOCK_TEXT.noEmployee ? CLOCK_TEXT.mInactive : e.reason);
    throw e;
  }
}

export type MyClockState =
  | {
      ok: true;
      state: ClockSessionState;
      next: "IN" | "OUT" | "BREAK_END";
      canBreak: boolean;
      entry: { date: string; startMin: number; endMin: number; crossesMidnight: boolean; shiftName: string } | null;
      site: { gpsRequired: boolean; radiusM: number } | null;
    }
  | { ok: false; reason: string };

/** สถานะการลงเวลาของตัวเอง (การ์ดมือถือ) — กะของรอบที่เปิดอยู่ หรือกะที่เข้างานตอนนี้จะผูก · จุดลงเวลา (ไม่มีพิกัดร้าน) */
export async function myClockState(actor: { tenantId: string; userId: string }, opts: { now?: Date } = {}): Promise<MyClockState> {
  const now = nowOf(opts);
  const me = await selfOf(actor, now);
  if (!me) return { ok: false, reason: CLOCK_TEXT.mNoEmp };
  if (!me.active) return { ok: false, reason: CLOCK_TEXT.mInactive };
  const db = tenantDb(me.ctx) as unknown as Prisma.TransactionClient;
  const policy = await policyOf(db, me.ctx);
  const ses = await sessionOf(db, me.ctx, me.employeeId, now, policy);
  const e = ses.state !== "CLOSED" && ses.window ? ses.entry : ses.state === "CLOSED" ? ((await rosterPick(db, me.ctx, me.employeeId, now, policy))?.entry ?? null) : null;
  const site = await siteOf(me.ctx, me.unitId);
  return {
    ok: true,
    state: ses.state,
    next: nextKindOf(ses.state),
    canBreak: ses.state === "OPEN",
    entry: e ? { date: dayOf(e.date), startMin: e.startMin, endMin: e.endMin, crossesMidnight: e.crossesMidnight, shiftName: e.shift.name } : null,
    site: usable(site) ? { gpsRequired: site.gpsRequired, radiusM: site.radiusM } : null,
  };
}

// ─────────────────── ล้างพิกัด/รูปตามกำหนด (R11 · HQ27) ───────────────────
const PURGE_BATCH = 1_000;
/**
 * แถวที่เก่ากว่า GEO_KEEP_DAYS ⇒ lat/lng/accuracyM = null (คง distanceM/inRadius) · เก่ากว่า PHOTO_KEEP_DAYS ⇒ photoKey = null ·
 * ครั้งละ ≤ 1 000 แถวต่อคำสั่ง วนจนหมด · รันซ้ำได้ (ครั้งที่สอง = 0) · ไม่ส่ง tenantId = ทุกร้านที่มีระบบ HR (cron รายชั่วโมง)
 * SQL ดิบผ่าน tenantDb(...).$executeRaw (ไม่ลาก prisma ดิบเข้าโมดูล — F5.1) · ทุกคำสั่งผูก "tenantId" เอง
 */
export async function purgeClockPrivacy(input: { now: Date; tenantId?: string | null }): Promise<{ ok: true; geo: number; photo: number }> {
  const now = input?.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now : nowOf(undefined);
  const geoCut = new Date(now.getTime() - CLOCK_RULES.GEO_KEEP_DAYS * 86_400_000);
  const photoCut = new Date(now.getTime() - CLOCK_RULES.PHOTO_KEEP_DAYS * 86_400_000);
  const tenants = input?.tenantId
    ? [input.tenantId]
    : (await tenantDb({ tenantId: "" }).$queryRaw<{ tenantId: string }[]>`SELECT DISTINCT "tenantId" FROM "AppSystem" WHERE "type"::text = 'HR'`).map((r) => r.tenantId);
  let geo = 0;
  let photo = 0;
  for (const tenantId of tenants) {
    const db = tenantDb({ tenantId });
    for (;;) {
      const n = await db.$executeRaw`
        UPDATE "HrAttendance" SET "lat" = NULL, "lng" = NULL, "accuracyM" = NULL
        WHERE "id" IN (SELECT "id" FROM "HrAttendance" WHERE "tenantId" = ${tenantId} AND "at" < ${geoCut}
          AND ("lat" IS NOT NULL OR "lng" IS NOT NULL OR "accuracyM" IS NOT NULL) LIMIT ${PURGE_BATCH})`;
      geo += n;
      if (n < PURGE_BATCH) break;
    }
    for (;;) {
      const n = await db.$executeRaw`
        UPDATE "HrAttendance" SET "photoKey" = NULL
        WHERE "id" IN (SELECT "id" FROM "HrAttendance" WHERE "tenantId" = ${tenantId} AND "at" < ${photoCut} AND "photoKey" IS NOT NULL LIMIT ${PURGE_BATCH})`;
      photo += n;
      if (n < PURGE_BATCH) break;
    }
  }
  return { ok: true, geo, photo };
}
