// SVC D.6 ▸ มิเตอร์หอ + จดมือถือ — สัญญา ledger/svc-briefs/svc-brief-d.6.md §2–§4
//   • ทางเดียวที่เขียนแถว PERIOD = submitReadings (หน้าจด · คิวออฟไลน์ · ฉาก · D.4 นำเข้า)
//   • idempotent ต่อ มิเตอร์ × งวด — advisory lock ต่อ (มิเตอร์,งวด) ใน tx + ดัชนี unique ของ D.0 เป็นตัวตัดสินชั้นสุดท้าย
//   • ขอบเขต (X1): อ่าน/เขียนผ่าน tenantDb({tenantId, unitId}) เท่านั้น (ไม่ import prisma ดิบ) · หน่วยต้องเป็น DORM ของร้านนี้
//   • ห้องว่างอ่านผ่าน facade `@/lib/modules/rooms` · การ์ดบอร์ดงานผ่าน `kanban/links.createCardFromExternal` (ประตูเดียว)
//   • event `dorm.meter.flagged` ใน tx เดียวกับแถวเลข · payload id ล้วน (ไม่มีชื่อ/เบอร์/เงิน)
//   • ไม่คิดเงิน/อัตรา (D.7) · ไม่แตะบิล (D.8 อ่าน heldRooms แล้วพักบิลเอง)
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSetting } from "@/lib/core/settings";
import { uploadFile } from "@/lib/storage/service";
import { createCardFromExternal } from "@/lib/modules/kanban/links";
import { listBuildings, occupancyRange, roomBoard } from "@/lib/modules/rooms";
import { meterUnits, type MeterSegment } from "./calc";

// ───────────────────────── ชนิด (สัญญา §3) ─────────────────────────
export type MeterCtx = { tenantId: string; actorUserId?: string | null };
export type MeterFlag = "HIGH" | "LOW" | "BACKWARDS" | "VACANT_USAGE";
type MeterKind = "ELEC" | "WATER";
type MeterRole = "ROOM" | "MAIN";
type Fail = { ok: false; code: string; reason: string };

export type SubmitItemResult = {
  meterId: string;
  status: "CREATED" | "UPDATED" | "UNCHANGED" | "LOCKED" | "REJECTED" | "CONFLICT"; // SVC D.4 ▸ CONFLICT = ifAbsent พบแถวค่าอื่น ◂
  readingId: string | null;
  flag: MeterFlag | null;
  held: boolean;
  units: number | null;
  code?: string;
  cardId?: string | null;
};
export type SubmitReadingsResult = { ok: true; results: SubmitItemResult[] } | Fail;
export type SubmitItem = {
  meterId: string;
  value: number;
  readAt?: string;
  clientKey?: string;
  photo?: { data: Uint8Array; contentType: string } | null;
  // SVC D.14 ▸ บันทึกจากข้อเสนอของระบบอ่านเลข (คนยืนยัน) — ledger/svc-briefs/svc-brief-d.14.md §4 · ไม่ส่ง = D.6 เดิม ◂
  aiProposalId?: string | null;
  ackLowConfidence?: boolean;
};
export type SubmitDeps = {
  put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>;
  now?: Date;
  /** SVC D.4 ▸ ที่มาของแถวที่สร้างใหม่ (ไม่ส่ง = MANUAL เดิม) — นำเข้าจากไฟล์ = IMPORT ◂ */
  source?: "MANUAL" | "IMPORT";
  /** SVC D.4 (X10) ▸ เขียนเฉพาะเมื่อยังไม่มีแถวงวดนี้ (มีแล้ว ⇒ CONFLICT ไม่ UPDATE · ตัดสินใต้ล็อกเดียวกัน) ◂ */
  ifAbsent?: boolean;
  /** SVC D.4 (X5) ▸ งานนำเข้าต้องถือ claim ของชุดอยู่จริง (ตรวจใต้ล็อก dorm.import:<unitId> ใน tx เดียวกัน) ◂ */
  importGuard?: ImportGuard;
};
/** SVC D.4 (X5) ▸ เครื่องหมายงานนำเข้า (ชุด + claimToken) ◂ */
export type ImportGuard = { batchId: string; claimToken: string };
/** SVC D.4 (X5) ▸ คำสั่งแรกของ tx: ล็อกหน่วยนำเข้า + ตรวจ claim (ไม่ใช่ CREATING / token ไม่ตรง ⇒ false) · ผ่าน ⇒ ต่ออายุ claimUntil ◂ */
async function importClaimOk(tx: Tx, tenantId: string, unitId: string, guard: ImportGuard): Promise<boolean> {
  await advisoryLock(tx, `dorm.import:${unitId}`);
  const r = await tx.dormImportBatch.updateMany({
    where: { id: guard.batchId, tenantId, unitId, status: "CREATING", claimToken: guard.claimToken },
    data: { claimUntil: new Date(Date.now() + 120_000) },
  });
  return r.count === 1;
}

export type MeterWalkMeter = {
  meterId: string;
  kind: MeterKind;
  prevValue: number | null;
  value: number | null;
  readingId: string | null;
  units: number | null;
  flag: MeterFlag | null;
  held: boolean;
  photo: boolean;
};
export type MeterWalkRoom = { roomId: string; number: string; vacant: boolean; done: boolean; flag: MeterFlag | null; meters: MeterWalkMeter[] };
export type MeterWalkFloor = { key: string; label: string; buildingId: string | null; floorNo: number | null; rooms: MeterWalkRoom[] };
export type MeterWalkMain = { meterId: string; kind: MeterKind; buildingId: string | null; prevValue: number | null; value: number | null; readingId: string | null; units: number | null; flag: MeterFlag | null };
export type MeterWalk = { periodKey: string; floors: MeterWalkFloor[]; main: MeterWalkMain[]; progress: { rooms: number; done: number; flagged: number } };
export type MeterFlagRow = {
  readingId: string;
  meterId: string;
  roomId: string | null;
  roomNumber: string | null;
  kind: MeterKind;
  flag: MeterFlag;
  value: number;
  prevValue: number | null;
  units: number | null;
  avg3: number | null;
};
export type PeriodUsageRow = {
  meterId: string;
  roomId: string | null;
  role: MeterRole;
  kind: MeterKind;
  prevValue: number | null;
  value: number | null;
  units: number | null;
  flag: MeterFlag | null;
  held: boolean;
  segments: { start: number; end: number }[];
};

// ───────────────────────── ค่าคงที่ · ตัวช่วยเล็ก ─────────────────────────
const EVENT = "dorm.meter.flagged";
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** คอลัมน์ value/startReading เป็น INTEGER (int4) ของฐาน — เกินนี้ฐานปฏิเสธ จึงปฏิเสธที่ชั้นบริการเป็น INVALID_VALUE ก่อน */
const MAX_READING = 2_147_483_647;
const MAX_ITEMS = 200;
const DAY_MS = 86_400_000;
const FLAG_ORDER: MeterFlag[] = ["BACKWARDS", "VACANT_USAGE", "HIGH", "LOW"];
const DEFAULT_CFG = { pctFromAvg3: 50, vacantMaxUnits: 5, flagBackwards: true } as const;

type Tx = Prisma.TransactionClient;
type Cfg = { pctFromAvg3: number; vacantMaxUnits: number; flagBackwards: boolean };

const fail = (code: string, reason: string): Fail => ({ ok: false, code, reason });
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isReading = (v: unknown): v is number => isInt(v) && v >= 0 && v <= MAX_READING;
const isKind = (v: unknown): v is MeterKind => v === "ELEC" || v === "WATER";
const isFlag = (v: unknown): v is MeterFlag => v === "HIGH" || v === "LOW" || v === "BACKWARDS" || v === "VACANT_USAGE";
const periodOk = (v: unknown): v is string => typeof v === "string" && PERIOD_RE.test(v);

/** client ผูกขอบเขต — runtime คือ tenantDb (ฉีด tenantId+unitId ทุกคำสั่ง) · ชนิดใช้ TransactionClient ให้ emitOutbox รับได้ (แบบเดียวกับ pos) */
function scoped(tenantId: string, unitId: string): Tx {
  return tenantDb({ tenantId, unitId }) as unknown as Tx;
}
function runTx<T>(tenantId: string, unitId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return tenantDb({ tenantId, unitId }).$transaction((tx) => fn(tx as unknown as Tx), { maxWait: 10_000, timeout: 20_000 });
}

/** หน่วยเป็น DORM ของร้านนี้ไหม (ไม่ใช่ ⇒ ผู้เรียกตอบ NOT_FOUND/ผลว่าง — ไม่บอกว่ามีอยู่) */
async function dormUnitOk(tenantId: unknown, unitId: unknown): Promise<boolean> {
  if (!isStr(tenantId) || !isStr(unitId)) return false;
  const u = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "DORM" }, select: { id: true } });
  return !!u;
}

function periodAdd(p: string, k: number): string {
  const y = Number(p.slice(0, 4));
  const m = Number(p.slice(5, 7)) - 1 + k;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy).padStart(4, "0")}-${String(mm + 1).padStart(2, "0")}`;
}
const ymdMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const ymdAdd = (ymd: string, n: number) => new Date(ymdMs(ymd) + n * DAY_MS).toISOString().slice(0, 10);
const periodOfDate = (d: Date) => bkkYmd(d).slice(0, 7);

/** ผิดเพราะแถวซ้ำ (unique) — เดินสาย error ของ Prisma → driver adapter → pg */
function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "P2002" || o.code === "23505" || o.originalCode === "23505") return true;
    if (typeof o.message === "string" && /unique constraint|duplicate key|23505|UniqueConstraintViolation/i.test(o.message)) return true;
    const meta = isRec(o.meta) ? o.meta : null;
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return false;
}

async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
const meterLockKey = (meterId: string, periodKey: string) => `dorm.meter:${meterId}:${periodKey}`;

async function anomalyCfg(tenantId: string, unitId: string): Promise<Cfg> {
  const r = await resolveSetting({ tenantId }, "rooms.meter.anomaly", { unitId });
  const v = r.value;
  if (!isRec(v)) return { ...DEFAULT_CFG };
  return {
    pctFromAvg3: isInt(v.pctFromAvg3) && v.pctFromAvg3 >= 1 ? v.pctFromAvg3 : DEFAULT_CFG.pctFromAvg3,
    vacantMaxUnits: isInt(v.vacantMaxUnits) && v.vacantMaxUnits >= 0 ? v.vacantMaxUnits : DEFAULT_CFG.vacantMaxUnits,
    flagBackwards: typeof v.flagBackwards === "boolean" ? v.flagBackwards : DEFAULT_CFG.flagBackwards,
  };
}

// ───────────────────────── สมุดเลข (ในหน่วยความจำ) — คำนวณหน่วย/เลขก่อนหน้า/เฉลี่ย ─────────────────────────
type MeterRow = {
  id: string;
  roomId: string | null;
  buildingId: string | null;
  kind: MeterKind;
  role: MeterRole;
  serial: string | null;
  digits: number | null;
  startReading: number;
  removedAt: Date | null;
  replacedById: string | null;
};
type ReadRow = {
  id: string;
  meterId: string;
  periodKey: string;
  kind: string;
  value: number;
  readAt: Date;
  flag: string | null;
  confirmedAt: Date | null;
  photoFileId: string | null;
};
type Ledger = {
  meters: Map<string, MeterRow>;
  period: Map<string, ReadRow>;
  replace: Map<string, ReadRow>;
  byMeter: Map<string, ReadRow[]>;
  preds: Map<string, string[]>;
};
const rk = (meterId: string, periodKey: string) => `${meterId}|${periodKey}`;

const METER_SELECT = { id: true, roomId: true, buildingId: true, kind: true, role: true, serial: true, digits: true, startReading: true, removedAt: true, replacedById: true } as const;
const READ_SELECT = { id: true, meterId: true, periodKey: true, kind: true, value: true, readAt: true, flag: true, confirmedAt: true, photoFileId: true } as const;

function toMeter(m: { id: string; roomId: string | null; buildingId: string | null; kind: string; role: string; serial: string | null; digits: number | null; startReading: number; removedAt: Date | null; replacedById: string | null }): MeterRow {
  return { ...m, kind: m.kind === "WATER" ? "WATER" : "ELEC", role: m.role === "MAIN" ? "MAIN" : "ROOM" };
}

/** โหลดมิเตอร์ + แถว PERIOD/REPLACE ถึงงวด P · scopeIds ส่งมา = เฉพาะมิเตอร์เหล่านั้น + ตัวเก่าที่ถูกแทนที่ด้วยมัน */
async function loadLedger(db: Tx, tenantId: string, unitId: string, P: string, scopeIds?: string[]): Promise<Ledger> {
  const mrows = await db.dormMeter.findMany({
    where: { tenantId, unitId, ...(scopeIds ? { OR: [{ id: { in: scopeIds } }, { replacedById: { in: scopeIds } }] } : {}) },
    select: METER_SELECT,
  });
  const meters = new Map(mrows.map((m) => [m.id, toMeter(m)]));
  const preds = new Map<string, string[]>();
  for (const m of meters.values()) if (m.replacedById) preds.set(m.replacedById, [...(preds.get(m.replacedById) ?? []), m.id]);
  const rows = meters.size
    ? await db.dormMeterReading.findMany({
        where: { tenantId, unitId, meterId: { in: [...meters.keys()] }, periodKey: { lte: P }, kind: { in: ["PERIOD", "REPLACE"] } },
        select: READ_SELECT,
        orderBy: [{ periodKey: "asc" }, { createdAt: "asc" }],
      })
    : [];
  const period = new Map<string, ReadRow>();
  const replace = new Map<string, ReadRow>();
  const byMeter = new Map<string, ReadRow[]>();
  for (const r of rows) {
    if (r.kind === "PERIOD") {
      period.set(rk(r.meterId, r.periodKey), r);
      byMeter.set(r.meterId, [...(byMeter.get(r.meterId) ?? []), r]);
    } else replace.set(rk(r.meterId, r.periodKey), r);
  }
  return { meters, period, replace, byMeter, preds };
}

/** เลขก่อนหน้าของมิเตอร์ในงวด Q = แถว PERIOD ล่าสุดที่ periodKey < Q · ไม่มี ⇒ startReading */
function prevOf(L: Ledger, meterId: string, Q: string): { value: number; row: ReadRow | null } {
  const list = L.byMeter.get(meterId) ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].periodKey < Q) return { value: list[i].value, row: list[i] };
  return { value: L.meters.get(meterId)?.startReading ?? 0, row: null };
}

type Usage = { prevValue: number; segments: MeterSegment[]; units: number | null; backwards: boolean };
/** หน่วยของงวด Q ถ้าเลขที่จดคือ value — เปลี่ยนมิเตอร์ในงวด = 2 ช่วง · ถอยหลังที่ยังไม่แก้ ⇒ units null (ไม่ติดลบ ไม่ใช่ 0) */
function usageOf(L: Ledger, m: MeterRow, Q: string, value: number): Usage {
  const prevValue = prevOf(L, m.id, Q).value;
  let segments: MeterSegment[] = [{ start: prevValue, end: value }];
  for (const oldId of L.preds.get(m.id) ?? []) {
    const rep = L.replace.get(rk(oldId, Q));
    const old = L.meters.get(oldId);
    if (rep && old) {
      segments = [
        { start: prevOf(L, oldId, Q).value, end: rep.value },
        { start: m.startReading, end: value },
      ];
      break;
    }
  }
  const backwards = segments.some((s) => s.end < s.start);
  let units: number | null = null;
  if (!backwards) {
    try {
      units = meterUnits(segments);
    } catch {
      units = null;
    }
  }
  return { prevValue, segments, units, backwards };
}

/** เฉลี่ยหน่วยงวด P−1..P−3 เท่าที่คำนวณได้ (≥ 1 งวด) · เฉพาะแถวของมิเตอร์ตัวนี้ */
function avg3Of(L: Ledger, m: MeterRow, P: string): { sum: number; n: number } | null {
  let sum = 0;
  let n = 0;
  for (let k = 1; k <= 3; k++) {
    const Q = periodAdd(P, -k);
    const row = L.period.get(rk(m.id, Q));
    if (!row) continue;
    const u = usageOf(L, m, Q, row.value).units;
    if (u !== null) {
      sum += u;
      n += 1;
    }
  }
  return n > 0 ? { sum, n } : null;
}

/** ป้ายผิดปกติ — ลำดับตามสัญญา §2.1 (ตัวแรกที่เข้าเงื่อนไข) */
function judge(cfg: Cfg, role: MeterRole, vacant: boolean, usage: Usage, avg: { sum: number; n: number } | null): MeterFlag | null {
  if (usage.backwards) return cfg.flagBackwards ? "BACKWARDS" : null;
  const units = usage.units;
  if (units === null) return null;
  if (role === "ROOM" && vacant) return units > cfg.vacantMaxUnits ? "VACANT_USAGE" : null;
  if (!avg || avg.sum <= 0) return null;
  if (units * 100 * avg.n > avg.sum * (100 + cfg.pctFromAvg3)) return "HIGH";
  if (cfg.pctFromAvg3 < 100 && units * 100 * avg.n < avg.sum * (100 - cfg.pctFromAvg3)) return "LOW";
  return null;
}

/** ห้องว่างในช่วงจด = ไม่มี occupancy active ชนิด LEASE/STAY ซ้อนช่วง [วันจดครั้งก่อน (ไม่มี ⇒ วันที่ 1 ของงวด), วันจด+1) */
async function roomVacant(tenantId: string, unitId: string, roomId: string, P: string, prevReadAt: Date | null, readAt: Date): Promise<boolean> {
  const end = ymdAdd(bkkYmd(readAt), 1);
  let start = prevReadAt ? bkkYmd(prevReadAt) : `${P}-01`;
  if (start >= end) start = ymdAdd(end, -1);
  if ((ymdMs(end) - ymdMs(start)) / DAY_MS > 399) start = ymdAdd(end, -399);
  const occ = await occupancyRange({ tenantId }, { unitId, start, end, roomId });
  return !occ.some((o) => o.kind === "LEASE" || o.kind === "STAY");
}

type Evaluated = { flag: MeterFlag | null; usage: Usage; vacant: boolean };
async function evaluateValue(tenantId: string, unitId: string, cfg: Cfg, L: Ledger, m: MeterRow, P: string, value: number, readAt: Date): Promise<Evaluated> {
  const usage = usageOf(L, m, P, value);
  let vacant = false;
  if (m.role === "ROOM" && m.roomId && !usage.backwards && usage.units !== null) {
    vacant = await roomVacant(tenantId, unitId, m.roomId, P, prevOf(L, m.id, P).row?.readAt ?? null, readAt);
  }
  return { flag: judge(cfg, m.role, vacant, usage, avg3Of(L, m, P)), usage, vacant };
}

// ───────────────────────── 3.1 มิเตอร์ ─────────────────────────
export async function createMeter(
  ctx: MeterCtx,
  input: { unitId: string; kind: "ELEC" | "WATER"; role?: "ROOM" | "MAIN"; roomId?: string | null; buildingId?: string | null; serial?: string | null; digits?: number | null; startReading?: number; note?: string | null },
  guard?: ImportGuard, // SVC D.4 (X5) ▸ ไม่ส่ง = พฤติกรรมเดิม ◂
): Promise<{ ok: true; meterId: string } | Fail> {
  const tenantId = ctx?.tenantId;
  const unitId = input?.unitId;
  if (!(await dormUnitOk(tenantId, unitId))) return fail("NOT_FOUND", "ไม่พบหอพักนี้");
  const role: MeterRole = input.role === undefined ? "ROOM" : (input.role as MeterRole);
  if (!isKind(input.kind)) return fail("INVALID_INPUT", "ชนิดมิเตอร์ต้องเป็นไฟฟ้า (ELEC) หรือน้ำ (WATER)");
  if (role !== "ROOM" && role !== "MAIN") return fail("INVALID_INPUT", "บทบาทมิเตอร์ต้องเป็นรายห้อง (ROOM) หรือมิเตอร์หลัก (MAIN)");
  const start = input.startReading === undefined ? 0 : input.startReading;
  if (!isReading(start)) return fail("INVALID_INPUT", "เลขเริ่มต้นต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  const digits = input.digits ?? null;
  if (digits !== null && !(isInt(digits) && digits >= 1 && digits <= 12)) return fail("INVALID_INPUT", "จำนวนหลักของหน้าปัดต้องอยู่ระหว่าง 1–12");
  const roomId = input.roomId ?? null;
  const buildingId = input.buildingId ?? null;
  if (role === "ROOM" && !roomId) return fail("INVALID_INPUT", "มิเตอร์รายห้องต้องระบุห้อง");
  if (role === "MAIN" && roomId) return fail("INVALID_INPUT", "มิเตอร์หลักไม่ผูกกับห้อง — เลือกอาคารแทน");
  if (roomId !== null && !isStr(roomId)) return fail("INVALID_INPUT", "รหัสห้องไม่ถูกต้อง");
  if (buildingId !== null && !isStr(buildingId)) return fail("INVALID_INPUT", "รหัสอาคารไม่ถูกต้อง");

  const db = scoped(tenantId, unitId);
  if (roomId) {
    const room = await db.hotelRoom.findFirst({ where: { id: roomId, tenantId, unitId }, select: { id: true } });
    if (!room) return fail("NOT_FOUND", "ไม่พบห้องนี้ในหอพัก");
  }
  if (buildingId) {
    const b = await db.roomBuilding.findFirst({ where: { id: buildingId, tenantId, unitId }, select: { id: true } });
    if (!b) return fail("NOT_FOUND", "ไม่พบอาคารนี้ในหอพัก");
  }
  const dupMsg = fail("DUPLICATE", "ห้องนี้มีมิเตอร์ชนิดนี้ใช้งานอยู่แล้ว — ถ้าเปลี่ยนตัวใหม่ให้ใช้ “เปลี่ยนมิเตอร์”");
  if (roomId) {
    const dup = await db.dormMeter.findFirst({ where: { tenantId, unitId, roomId, kind: input.kind, removedAt: null }, select: { id: true } });
    if (dup) return dupMsg;
  }
  try {
    const data = {
        tenantId,
        unitId,
        roomId,
        buildingId,
        kind: input.kind,
        role,
        serial: typeof input.serial === "string" && input.serial.trim() ? input.serial.trim().slice(0, 80) : null,
        digits,
        startReading: start,
        note: typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 500) : null,
      };
    if (guard) {
      // SVC D.4 (X5) ▸ ทางนำเข้า: สร้างใต้ล็อก + claim ใน tx เดียว ◂
      const out = await runTx(tenantId, unitId, async (tx) => {
        if (!(await importClaimOk(tx, tenantId, unitId, guard))) return null;
        const dup = await tx.dormMeter.findFirst({ where: { tenantId, unitId, roomId, kind: input.kind, removedAt: null }, select: { id: true } });
        if (dup) return "DUP" as const;
        return (await tx.dormMeter.create({ data, select: { id: true } })).id;
      });
      if (out === null) return fail("BUSY", "งานนำเข้านี้ไม่ได้ถือสิทธิ์ทำต่อแล้ว — ไม่มีอะไรเปลี่ยน");
      if (out === "DUP") return dupMsg;
      return { ok: true, meterId: out };
    }
    const row = await db.dormMeter.create({ data, select: { id: true } });
    return { ok: true, meterId: row.id };
  } catch (e) {
    if (isUniqueViolation(e)) return dupMsg;
    throw e;
  }
}

export async function listMeters(
  ctx: MeterCtx,
  input: { unitId: string },
): Promise<{ meterId: string; roomId: string | null; buildingId: string | null; kind: MeterKind; role: MeterRole; serial: string | null; digits: number | null; startReading: number }[]> {
  const tenantId = ctx?.tenantId;
  const unitId = input?.unitId;
  if (!(await dormUnitOk(tenantId, unitId))) return [];
  const rows = await scoped(tenantId, unitId).dormMeter.findMany({
    where: { tenantId, unitId, removedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: METER_SELECT,
  });
  return rows.map((r) => {
    const m = toMeter(r);
    return { meterId: m.id, roomId: m.roomId, buildingId: m.buildingId, kind: m.kind, role: m.role, serial: m.serial, digits: m.digits, startReading: m.startReading };
  });
}

// ───────────────────────── event · การ์ดห้องว่าง ─────────────────────────
async function emitFlagged(tx: Tx, tenantId: string, unitId: string, m: MeterRow, P: string, readingId: string, flag: MeterFlag): Promise<void> {
  await emitOutbox(tx, {
    tenantId,
    unitId,
    type: EVENT,
    idempotencyKey: `${EVENT}:${readingId}:${flag}`,
    payload: { unitId, meterId: m.id, roomId: m.roomId, readingId, periodKey: P, flag },
  });
}

type RoomInfo = Map<string, { number: string; vacantToday: boolean; buildingId: string | null; floorNo: number | null }>;
async function roomInfo(tenantId: string, unitId: string): Promise<RoomInfo> {
  const cells = await roomBoard({ tenantId }, { unitId, date: bkkYmd(new Date()) });
  return new Map(cells.map((c) => [c.roomId, { number: c.number, vacantToday: c.use !== "LEASED" && c.use !== "GUEST", buildingId: c.buildingId, floorNo: c.floorNo }]));
}

/** บอร์ดปลายทางการ์ดห้องว่าง: ชื่อบอร์ดตามค่าตั้งหมวดซ่อม → บอร์ด ACTIVE ชื่อตรง (เก่าสุด) → บอร์ด ACTIVE เก่าสุดของร้าน → ไม่มี */
async function pickBoard(tenantId: string, unitId: string, kind: MeterKind): Promise<{ systemId: string; boardId: string } | null> {
  const cats = await resolveSetting({ tenantId }, "rooms.repair.categories", { unitId });
  const code = kind === "ELEC" ? "ELECTRIC" : "PLUMBING";
  let wanted = "";
  if (Array.isArray(cats.value)) {
    const hit = cats.value.find((c) => isRec(c) && c.code === code);
    if (isRec(hit) && typeof hit.board === "string") wanted = hit.board;
  }
  const systems = await tenantDb({ tenantId }).appSystem.findMany({ where: { type: "KANBAN", active: true }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const boards: { systemId: string; boardId: string; name: string; createdAt: Date }[] = [];
  for (const s of systems) {
    const rows = await tenantDb({ tenantId, systemId: s.id }).kanbanBoard.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const b of rows) boards.push({ systemId: s.id, boardId: b.id, name: b.name, createdAt: b.createdAt });
  }
  boards.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const pick = (wanted ? boards.find((b) => b.name === wanted) : undefined) ?? boards[0];
  return pick ? { systemId: pick.systemId, boardId: pick.boardId } : null;
}

/** การ์ดตรวจห้องว่างใช้น้ำไฟ — 1 ใบต่อ มิเตอร์×งวด (sourceKey) · ไม่มีบอร์ด/ล้ม ⇒ null (แถว+ป้ายอยู่แล้ว ไม่ throw) */
async function ensureVacantCard(tenantId: string, unitId: string, m: MeterRow, P: string, roomNumber: string | null, units: number | null): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const board = await pickBoard(tenantId, unitId, m.kind);
      if (!board) return null;
      const what = m.kind === "ELEC" ? "ไฟ" : "น้ำ";
      const hint = m.kind === "ELEC" ? "เช็กตู้เย็น/ปลั๊ก" : "เช็กท่อรั่ว/ก๊อกน้ำ";
      const title = `ห้อง ${roomNumber ?? "-"} ห้องว่างใช้${what} ${units ?? "-"} หน่วย — ${hint}`;
      const r = await createCardFromExternal(
        { tenantId, systemId: board.systemId, actorUserId: null },
        {
          boardId: board.boardId,
          title,
          description: `เลขมิเตอร์${what}ของห้องที่ไม่มีผู้เช่าเพิ่มขึ้นผิดปกติ (งวด ${P}) — ตรวจว่ามีการใช้งานจริงหรือไม่ · บิลของห้องนี้พักไว้รอตรวจ`,
          sourceType: "AUTOMATION",
          sourceKey: `dorm.meter.vacant:${m.id}:${P}`,
        },
      );
      return r.cardId;
    } catch (e) {
      if (attempt === 1) {
        await logOps("WARN", "dorm.meter", "สร้างการ์ดห้องว่างใช้น้ำไฟไม่สำเร็จ", { tenantId, detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
      }
    }
  }
  return null;
}

// ───────────────────────── 3.2 ส่งเลข ─────────────────────────
const asDate = (v: unknown): Date | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
};

type ItemOutcome = SubmitItemResult & { _meter?: MeterRow; _units?: number | null };

export async function submitReadings(
  ctx: MeterCtx,
  input: { unitId: string; periodKey: string; items: SubmitItem[] },
  deps?: SubmitDeps,
): Promise<SubmitReadingsResult> {
  const tenantId = ctx?.tenantId;
  const unitId = input?.unitId;
  if (!(await dormUnitOk(tenantId, unitId))) return fail("NOT_FOUND", "ไม่พบหอพักนี้");
  const P = input.periodKey;
  if (!periodOk(P)) return fail("INVALID_INPUT", "งวดต้องอยู่ในรูป ปปปป-ดด เช่น 2026-10");
  const items = input.items;
  if (!Array.isArray(items) || items.length === 0) return fail("INVALID_INPUT", "ไม่มีรายการเลขมิเตอร์ที่จะส่ง");
  if (items.length > MAX_ITEMS) return fail("TOO_MANY", `ส่งได้ครั้งละไม่เกิน ${MAX_ITEMS} รายการ — แบ่งส่งเป็นหลายชุด`);
  if (!items.every((it) => isRec(it) && isStr(it.meterId))) return fail("INVALID_INPUT", "รูปแบบรายการเลขมิเตอร์ไม่ถูกต้อง");

  const now = deps?.now instanceof Date ? deps.now : new Date();
  const cfg = await anomalyCfg(tenantId, unitId);
  const db = scoped(tenantId, unitId);
  const ids = [...new Set(items.map((it) => it.meterId))];
  const L = await loadLedger(db, tenantId, unitId, P, ids);
  let rooms: RoomInfo | null = null;

  const results: SubmitItemResult[] = [];
  for (const it of items) {
    const r = await submitOne({ tenantId, unitId, actor: ctx.actorUserId ?? null, P, cfg, L, now, deps }, it, async () => (rooms ??= await roomInfo(tenantId, unitId)));
    results.push(r);
  }
  return { ok: true, results };
}

type OneCtx = { tenantId: string; unitId: string; actor: string | null; P: string; cfg: Cfg; L: Ledger; now: Date; deps?: SubmitDeps };

async function submitOne(c: OneCtx, it: SubmitItem, getRooms: () => Promise<RoomInfo>): Promise<SubmitItemResult> {
  const { tenantId, unitId, P, L } = c;
  const rej = (code: string): SubmitItemResult => ({ meterId: it.meterId, status: "REJECTED", readingId: null, flag: null, held: false, units: null, code });
  const m = L.meters.get(it.meterId);
  if (!m || m.id !== it.meterId) return rej("NOT_FOUND");
  if (m.removedAt) return rej("METER_REMOVED");
  if (!isReading(it.value)) return rej("INVALID_VALUE");
  let readAt = c.now;
  if (it.readAt !== undefined && it.readAt !== null) {
    const d = asDate(it.readAt);
    if (!d) return rej("INVALID_VALUE");
    readAt = d;
  }

  // SVC D.14 ▸ ข้อเสนอต้องเป็นของ ร้าน+หน่วย+มิเตอร์+งวด เดียวกัน (ไม่ใช่ ⇒ NOT_FOUND) · มั่นใจต่ำ + ค่าเท่าที่เสนอ ⇒ ต้องติ๊กยืนยัน ◂
  let ai: MeterAiProposalRec | null = null;
  if (it.aiProposalId !== undefined && it.aiProposalId !== null) {
    ai = await meterAiProposalById(tenantId, unitId, m.id, P, it.aiProposalId);
    if (!ai) return rej("NOT_FOUND");
    if (ai.source === "AI" && ai.value === it.value && ai.lowConfidence && it.ackLowConfidence !== true) return rej("AI_NEEDS_CONFIRM");
  }
  const aiCols = ai ? { source: ai.source === "AI" && ai.value === it.value ? "AI" : "MANUAL", aiValue: ai.source === "AI" ? ai.value : null } : null;
  const aiPhoto = ai && ai.fileId && !(it.photo && it.photo.data instanceof Uint8Array && it.photo.data.length > 0) ? ai.fileId : null;

  const ev = await evaluateValue(tenantId, unitId, c.cfg, L, m, P, it.value, readAt);
  const value = it.value;

  type TxOut = { status: "CREATED" | "UPDATED" | "UNCHANGED" | "LOCKED" | "METER_REMOVED" | "CONFLICT" | "BUSY"; id: string | null; flag: MeterFlag | null; confirmed: boolean; existingValue: number | null };
  let out: TxOut | null = null;
  for (let attempt = 0; attempt < 2 && !out; attempt++) {
    try {
      out = await runTx(tenantId, unitId, async (tx): Promise<TxOut> => {
        // SVC D.4 (X5) ▸ ทางนำเข้า: ล็อกหน่วยนำเข้า + claim ก่อนล็อกมิเตอร์ (ลำดับ import → meter) ◂
        if (c.deps?.importGuard && !(await importClaimOk(tx, tenantId, unitId, c.deps.importGuard))) return { status: "BUSY", id: null, flag: null, confirmed: false, existingValue: null };
        await advisoryLock(tx, meterLockKey(m.id, P));
        // ถอดมิเตอร์ระหว่างรอคิว (replaceMeter) ⇒ ปฏิเสธ
        const live = await tx.dormMeter.findFirst({ where: { id: m.id, tenantId, unitId, removedAt: null }, select: { id: true } });
        if (!live) return { status: "METER_REMOVED", id: null, flag: null, confirmed: false, existingValue: null };
        const cur = await tx.dormMeterReading.findFirst({ where: { tenantId, unitId, meterId: m.id, periodKey: P, kind: "PERIOD" }, select: { id: true, value: true, flag: true, confirmedAt: true, source: true } });
        if (!cur) {
          const row = await tx.dormMeterReading.create({
            data: { tenantId, unitId, meterId: m.id, periodKey: P, kind: "PERIOD", value, readAt, readById: c.actor, source: c.deps?.source === "IMPORT" ? "IMPORT" : "MANUAL", flag: ev.flag, ...(aiCols ?? {}), ...(aiPhoto ? { photoFileId: aiPhoto } : {}) }, // SVC D.14 ◂
            select: { id: true },
          });
          if (ev.flag) await emitFlagged(tx, tenantId, unitId, m, P, row.id, ev.flag);
          return { status: "CREATED", id: row.id, flag: ev.flag, confirmed: false, existingValue: null };
        }
        const curFlag = isFlag(cur.flag) ? cur.flag : null;
        if (c.deps?.ifAbsent) return { status: cur.value === value ? "UNCHANGED" : "CONFLICT", id: cur.id, flag: curFlag, confirmed: !!cur.confirmedAt, existingValue: cur.value }; // SVC D.4 (X10) ◂
        if (cur.value === value) return { status: "UNCHANGED", id: cur.id, flag: curFlag, confirmed: !!cur.confirmedAt, existingValue: cur.value };
        if (cur.confirmedAt) return { status: "LOCKED", id: cur.id, flag: curFlag, confirmed: true, existingValue: cur.value };
        // SVC D.14 ▸ จากข้อเสนอ ⇒ source/aiValue/รูปของข้อเสนอ · ไม่มีข้อเสนอบนแถว AI ⇒ MANUAL + aiValue null (§4 ข้อ 6) ◂
        const aiUpd = aiCols ? { ...aiCols, ...(aiPhoto ? { photoFileId: aiPhoto } : {}) } : cur.source === "AI" ? { source: "MANUAL", aiValue: null } : {};
        await tx.dormMeterReading.update({ where: { id: cur.id, tenantId, unitId }, data: { value, readAt, readById: c.actor, flag: ev.flag, flagNote: null, ...aiUpd } });
        if (ev.flag && ev.flag !== curFlag) await emitFlagged(tx, tenantId, unitId, m, P, cur.id, ev.flag);
        return { status: "UPDATED", id: cur.id, flag: ev.flag, confirmed: false, existingValue: cur.value };
      });
    } catch (e) {
      // แถวชนจากทางที่ไม่ผ่านล็อก (เช่น นำเข้าตรง) — รอบสองจะเห็นแถวผู้ชนะแล้วเข้าทาง UNCHANGED/UPDATED
      if (attempt === 0 && isUniqueViolation(e)) continue;
      throw e;
    }
  }
  if (!out) return rej("ERROR");
  if (out.status === "METER_REMOVED") return rej("METER_REMOVED");
  if (out.status === "BUSY") return rej("BUSY"); // SVC D.4 (X5) ◂
  if (out.status === "CONFLICT") return { meterId: m.id, status: "CONFLICT", readingId: out.id, flag: out.flag, held: false, units: null, code: "METER_CONFLICT" }; // SVC D.4 (X10) ◂

  // หน่วยที่คืน = ของค่าที่อยู่ในฐานจริงหลังรอบนี้
  const shownValue = out.status === "CREATED" || out.status === "UPDATED" ? value : (out.existingValue ?? value);
  const units = usageOf(L, m, P, shownValue).units;
  const held = out.flag !== null && !out.confirmed;
  const res: SubmitItemResult = { meterId: m.id, status: out.status, readingId: out.id, flag: out.flag, held, units };

  // รูป — เฉพาะ CREATED/UPDATED (ซ้ำ/ล็อก = ไม่อัป) · อัปไม่สำเร็จ = เก็บเลขต่อ ไม่ปฏิเสธรายการ
  if ((out.status === "CREATED" || out.status === "UPDATED") && it.photo && out.id && it.photo.data instanceof Uint8Array && it.photo.data.length > 0) {
    try {
      const up = await uploadFile(
        { tenantId },
        { kind: "ATTACHMENT", filename: "meter.jpg", contentType: it.photo.contentType, data: it.photo.data, visibility: "private" },
        c.deps?.put ? { put: c.deps.put } : undefined,
      );
      if (up.ok) await scoped(tenantId, unitId).dormMeterReading.update({ where: { id: out.id, tenantId, unitId }, data: { photoFileId: up.assetId } });
    } catch (e) {
      await logOps("WARN", "dorm.meter", "อัปรูปมิเตอร์ไม่สำเร็จ (เก็บเลขต่อ)", { tenantId, detail: e instanceof Error ? e.name : "error" });
    }
  }

  if (out.flag === "VACANT_USAGE" && held) {
    const rooms = await getRooms();
    res.cardId = await ensureVacantCard(tenantId, unitId, m, P, m.roomId ? (rooms.get(m.roomId)?.number ?? null) : null, units);
  }
  return res;
}

// ───────────────────────── 3.3 ตรวจ · ยืนยัน · เปลี่ยนมิเตอร์ ─────────────────────────
export async function confirmReading(
  ctx: MeterCtx,
  input: { unitId: string; readingId: string; action: "ACCEPT" | "REREAD"; value?: number; note?: string | null },
): Promise<{ ok: true; flag: MeterFlag | null; held: boolean; units: number | null } | Fail> {
  const tenantId = ctx?.tenantId;
  const unitId = input?.unitId;
  if (!(await dormUnitOk(tenantId, unitId))) return fail("NOT_FOUND", "ไม่พบหอพักนี้");
  if (input.action !== "ACCEPT" && input.action !== "REREAD") return fail("INVALID_INPUT", "การกระทำต้องเป็นยืนยัน (ACCEPT) หรือจดใหม่ (REREAD)");
  if (!isStr(input.readingId)) return fail("NOT_FOUND", "ไม่พบเลขมิเตอร์รายการนี้");
  const db = scoped(tenantId, unitId);
  const row = await db.dormMeterReading.findFirst({ where: { id: input.readingId, tenantId, unitId, kind: "PERIOD" }, select: { ...READ_SELECT, flagNote: true } });
  if (!row) return fail("NOT_FOUND", "ไม่พบเลขมิเตอร์รายการนี้");
  const P = row.periodKey;
  const L = await loadLedger(db, tenantId, unitId, P, [row.meterId]);
  const m = L.meters.get(row.meterId);
  if (!m) return fail("NOT_FOUND", "ไม่พบมิเตอร์ของรายการนี้");
  const actor = ctx.actorUserId ?? null;

  if (input.action === "ACCEPT") {
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 500) : null;
    const done = await runTx(tenantId, unitId, async (tx) => {
      await advisoryLock(tx, meterLockKey(m.id, P));
      const cur = await tx.dormMeterReading.findFirst({ where: { id: row.id, tenantId, unitId, kind: "PERIOD" }, select: { value: true, flag: true, confirmedAt: true } });
      if (!cur) return { code: "NOT_FOUND" as const };
      const flag = isFlag(cur.flag) ? cur.flag : null;
      if (cur.confirmedAt || !flag) return { code: "OK" as const, flag, held: false, value: cur.value };
      if (flag === "BACKWARDS") return { code: "BACKWARDS_NEEDS_REPLACE" as const };
      await tx.dormMeterReading.update({ where: { id: row.id, tenantId, unitId }, data: { confirmedAt: new Date(), confirmedById: actor, flagNote: note } });
      return { code: "OK" as const, flag, held: false, value: cur.value };
    });
    if (done.code === "NOT_FOUND") return fail("NOT_FOUND", "ไม่พบเลขมิเตอร์รายการนี้");
    if (done.code === "BACKWARDS_NEEDS_REPLACE") return fail("BACKWARDS_NEEDS_REPLACE", "เลขถอยหลังยืนยันเฉย ๆ ไม่ได้ — ถ้าเปลี่ยนมิเตอร์ให้กด “เปลี่ยนมิเตอร์” ถ้าจดผิดให้จดใหม่");
    return { ok: true, flag: done.flag, held: done.held, units: usageOf(L, m, P, done.value).units };
  }

  // REREAD
  if (m.removedAt) return fail("METER_REMOVED", "มิเตอร์ตัวนี้ถูกเปลี่ยนไปแล้ว — จดที่มิเตอร์ตัวใหม่");
  if (row.confirmedAt) return fail("LOCKED", "เลขนี้ยืนยันแล้ว แก้ไม่ได้");
  if (!isReading(input.value)) return fail("INVALID_INPUT", "ต้องใส่เลขมิเตอร์ใหม่เป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  const value = input.value;
  const cfg = await anomalyCfg(tenantId, unitId);
  const readAt = new Date();
  const ev = await evaluateValue(tenantId, unitId, cfg, L, m, P, value, readAt);
  const out = await runTx(tenantId, unitId, async (tx) => {
    await advisoryLock(tx, meterLockKey(m.id, P));
    const cur = await tx.dormMeterReading.findFirst({ where: { id: row.id, tenantId, unitId, kind: "PERIOD" }, select: { flag: true, confirmedAt: true } });
    if (!cur) return "NOT_FOUND" as const;
    if (cur.confirmedAt) return "LOCKED" as const;
    const live = await tx.dormMeter.findFirst({ where: { id: m.id, tenantId, unitId, removedAt: null }, select: { id: true } });
    if (!live) return "METER_REMOVED" as const;
    const curFlag = isFlag(cur.flag) ? cur.flag : null;
    await tx.dormMeterReading.update({ where: { id: row.id, tenantId, unitId }, data: { value, readAt, readById: actor, flag: ev.flag, flagNote: null } });
    if (ev.flag && ev.flag !== curFlag) await emitFlagged(tx, tenantId, unitId, m, P, row.id, ev.flag);
    return "OK" as const;
  });
  if (out === "NOT_FOUND") return fail("NOT_FOUND", "ไม่พบเลขมิเตอร์รายการนี้");
  if (out === "LOCKED") return fail("LOCKED", "เลขนี้ยืนยันแล้ว แก้ไม่ได้");
  if (out === "METER_REMOVED") return fail("METER_REMOVED", "มิเตอร์ตัวนี้ถูกเปลี่ยนไปแล้ว — จดที่มิเตอร์ตัวใหม่");
  if (ev.flag === "VACANT_USAGE") {
    const rooms = await roomInfo(tenantId, unitId);
    await ensureVacantCard(tenantId, unitId, m, P, m.roomId ? (rooms.get(m.roomId)?.number ?? null) : null, ev.usage.units);
  }
  return { ok: true, flag: ev.flag, held: ev.flag !== null, units: ev.usage.units };
}

export async function replaceMeter(
  ctx: MeterCtx,
  input: { unitId: string; meterId: string; oldFinalReading: number; newStartReading: number; readingId?: string | null; serial?: string | null; digits?: number | null; readAt?: string },
): Promise<{ ok: true; oldMeterId: string; newMeterId: string; units: number | null } | Fail> {
  const tenantId = ctx?.tenantId;
  const unitId = input?.unitId;
  if (!(await dormUnitOk(tenantId, unitId))) return fail("NOT_FOUND", "ไม่พบหอพักนี้");
  if (!isStr(input.meterId)) return fail("NOT_FOUND", "ไม่พบมิเตอร์นี้");
  const db = scoped(tenantId, unitId);
  const oldRow = await db.dormMeter.findFirst({ where: { id: input.meterId, tenantId, unitId }, select: METER_SELECT });
  if (!oldRow) return fail("NOT_FOUND", "ไม่พบมิเตอร์นี้");
  if (oldRow.removedAt) return fail("METER_REMOVED", "มิเตอร์ตัวนี้ถูกเปลี่ยนออกไปแล้ว");
  if (!isReading(input.oldFinalReading) || !isReading(input.newStartReading)) return fail("INVALID_INPUT", "เลขมิเตอร์ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  const digits = input.digits ?? null;
  if (digits !== null && !(isInt(digits) && digits >= 1 && digits <= 12)) return fail("INVALID_INPUT", "จำนวนหลักของหน้าปัดต้องอยู่ระหว่าง 1–12");
  let readAt = new Date();
  if (input.readAt !== undefined && input.readAt !== null) {
    const d = asDate(input.readAt);
    if (!d) return fail("INVALID_INPUT", "เวลาจดไม่ถูกต้อง");
    readAt = d;
  }
  const old = toMeter(oldRow);

  // แถวที่จะย้ายไปตัวใหม่ (ถ้าส่ง) — ต้องเป็นแถว PERIOD ของตัวเก่า
  let reading: { id: string; periodKey: string; value: number; confirmedAt: Date | null; flag: string | null } | null = null;
  if (input.readingId !== undefined && input.readingId !== null) {
    if (!isStr(input.readingId)) return fail("INVALID_INPUT", "รหัสเลขมิเตอร์ไม่ถูกต้อง");
    reading = await db.dormMeterReading.findFirst({ where: { id: input.readingId, tenantId, unitId, meterId: old.id, kind: "PERIOD" }, select: { id: true, periodKey: true, value: true, confirmedAt: true, flag: true } });
    if (!reading) return fail("NOT_FOUND", "ไม่พบเลขมิเตอร์ของมิเตอร์ตัวนี้");
  }
  const P = reading ? reading.periodKey : periodOfDate(readAt);
  const L = await loadLedger(db, tenantId, unitId, P, [old.id]);
  const prev = prevOf(L, old.id, P).value;
  if (input.oldFinalReading < prev) return fail("INVALID_INPUT", `เลขตอนถอดมิเตอร์เก่า (${input.oldFinalReading}) ต้องไม่ต่ำกว่าเลขครั้งก่อน (${prev})`);
  if (reading && input.newStartReading > reading.value) return fail("INVALID_INPUT", `เลขเริ่มของมิเตอร์ใหม่ (${input.newStartReading}) ต้องไม่เกินเลขที่จดไว้ (${reading.value})`);
  if (reading?.confirmedAt) return fail("LOCKED", "เลขนี้ยืนยันแล้ว แก้ไม่ได้");

  const newId = randomUUID();
  const actor = ctx.actorUserId ?? null;
  const cfg = await anomalyCfg(tenantId, unitId);
  // ตัวใหม่ (ยังไม่อยู่ในฐาน) — ประเมินด้วยสมุดชั่วคราว: ตัวใหม่ + แถว REPLACE ของตัวเก่า
  const newMeter: MeterRow = { id: newId, roomId: old.roomId, buildingId: old.buildingId, kind: old.kind, role: old.role, serial: typeof input.serial === "string" && input.serial.trim() ? input.serial.trim().slice(0, 80) : null, digits, startReading: input.newStartReading, removedAt: null, replacedById: null };
  const L2: Ledger = {
    meters: new Map([...L.meters, [newId, newMeter]]),
    period: L.period,
    replace: new Map([...L.replace, [rk(old.id, P), { id: "pending", meterId: old.id, periodKey: P, kind: "REPLACE", value: input.oldFinalReading, readAt, flag: null, confirmedAt: null, photoFileId: null }]]),
    byMeter: L.byMeter,
    preds: new Map([...L.preds, [newId, [old.id]]]),
  };
  const ev = reading ? await evaluateValue(tenantId, unitId, cfg, L2, newMeter, P, reading.value, readAt) : null;
  const units = ev ? ev.usage.units : input.oldFinalReading - prev;

  try {
    const res = await runTx(tenantId, unitId, async (tx) => {
      await advisoryLock(tx, meterLockKey(old.id, P));
      const live = await tx.dormMeter.findFirst({ where: { id: old.id, tenantId, unitId, removedAt: null }, select: { id: true } });
      if (!live) return "METER_REMOVED" as const;
      if (reading) {
        const cur = await tx.dormMeterReading.findFirst({ where: { id: reading.id, tenantId, unitId, meterId: old.id, kind: "PERIOD" }, select: { confirmedAt: true, flag: true } });
        if (!cur) return "NOT_FOUND" as const;
        if (cur.confirmedAt) return "LOCKED" as const;
      }
      await tx.dormMeter.update({ where: { id: old.id, tenantId, unitId }, data: { removedAt: readAt, replacedById: newId } });
      await tx.dormMeter.create({
        data: { id: newId, tenantId, unitId, roomId: old.roomId, buildingId: old.buildingId, kind: old.kind, role: old.role, serial: newMeter.serial, digits, startReading: input.newStartReading },
      });
      await tx.dormMeterReading.create({
        data: { tenantId, unitId, meterId: old.id, periodKey: P, kind: "REPLACE", value: input.oldFinalReading, readAt, readById: actor, source: "MANUAL" },
      });
      if (reading && ev) {
        const oldFlag = isFlag(reading.flag) ? reading.flag : null;
        await tx.dormMeterReading.update({ where: { id: reading.id, tenantId, unitId }, data: { meterId: newId, flag: ev.flag, flagNote: null } });
        if (ev.flag && ev.flag !== oldFlag) await emitFlagged(tx, tenantId, unitId, newMeter, P, reading.id, ev.flag);
      }
      return "OK" as const;
    });
    if (res === "METER_REMOVED") return fail("METER_REMOVED", "มิเตอร์ตัวนี้ถูกเปลี่ยนออกไปแล้ว");
    if (res === "NOT_FOUND") return fail("NOT_FOUND", "ไม่พบเลขมิเตอร์ของมิเตอร์ตัวนี้");
    if (res === "LOCKED") return fail("LOCKED", "เลขนี้ยืนยันแล้ว แก้ไม่ได้");
  } catch (e) {
    if (isUniqueViolation(e)) return fail("DUPLICATE", "มิเตอร์ตัวนี้ถูกเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง");
    throw e;
  }
  if (ev?.flag === "VACANT_USAGE") {
    const rooms = await roomInfo(tenantId, unitId);
    await ensureVacantCard(tenantId, unitId, newMeter, P, newMeter.roomId ? (rooms.get(newMeter.roomId)?.number ?? null) : null, ev.usage.units);
  }
  return { ok: true, oldMeterId: old.id, newMeterId: newId, units };
}

// ───────────────────────── 3.4 อ่าน ─────────────────────────
const emptyWalk = (periodKey: string): MeterWalk => ({ periodKey, floors: [], main: [], progress: { rooms: 0, done: 0, flagged: 0 } });
const numericCmp = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });

type ReadView = { row: ReadRow | null; prevValue: number; units: number | null; flag: MeterFlag | null; held: boolean; segments: MeterSegment[] };
function viewOf(L: Ledger, m: MeterRow, P: string): ReadView {
  const row = L.period.get(rk(m.id, P)) ?? null;
  const prevValue = prevOf(L, m.id, P).value;
  if (!row) return { row: null, prevValue, units: null, flag: null, held: false, segments: [] };
  const u = usageOf(L, m, P, row.value);
  const flag = isFlag(row.flag) ? row.flag : null;
  return { row, prevValue, units: u.units, flag, held: flag !== null && !row.confirmedAt, segments: u.segments };
}

async function ledgerFor(ctx: MeterCtx, input: { unitId: string; periodKey: string }): Promise<{ tenantId: string; unitId: string; P: string; L: Ledger } | null> {
  const tenantId = ctx?.tenantId;
  const unitId = input?.unitId;
  if (!(await dormUnitOk(tenantId, unitId)) || !periodOk(input.periodKey)) return null;
  const L = await loadLedger(scoped(tenantId, unitId), tenantId, unitId, input.periodKey);
  return { tenantId, unitId, P: input.periodKey, L };
}
const activeMeters = (L: Ledger) => [...L.meters.values()].filter((m) => !m.removedAt);

export async function meterWalk(ctx: MeterCtx, input: { unitId: string; periodKey: string }): Promise<MeterWalk> {
  const g = await ledgerFor(ctx, input);
  if (!g) return emptyWalk(typeof input?.periodKey === "string" ? input.periodKey : "");
  const { tenantId, unitId, P, L } = g;
  const [rooms, buildings] = await Promise.all([roomInfo(tenantId, unitId), listBuildings({ tenantId }, { unitId })]);
  const meters = activeMeters(L);
  const byRoom = new Map<string, MeterRow[]>();
  for (const m of meters) if (m.role === "ROOM" && m.roomId && rooms.has(m.roomId)) byRoom.set(m.roomId, [...(byRoom.get(m.roomId) ?? []), m]);

  const walkRooms: { floorKey: string; room: MeterWalkRoom; buildingId: string | null; floorNo: number | null }[] = [];
  for (const [roomId, ms] of byRoom) {
    const info = rooms.get(roomId);
    if (!info) continue;
    ms.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "ELEC" ? -1 : 1));
    const mviews = ms.map((m) => ({ m, v: viewOf(L, m, P) }));
    const held = mviews.filter((x) => x.v.held && x.v.flag).map((x) => x.v.flag as MeterFlag);
    walkRooms.push({
      floorKey: `${info.buildingId ?? "-"}:${info.floorNo ?? "-"}`,
      buildingId: info.buildingId,
      floorNo: info.floorNo,
      room: {
        roomId,
        number: info.number,
        vacant: info.vacantToday,
        done: mviews.every((x) => x.v.row !== null),
        flag: FLAG_ORDER.find((f) => held.includes(f)) ?? null,
        meters: mviews.map(({ m, v }) => ({
          meterId: m.id,
          kind: m.kind,
          prevValue: v.prevValue,
          value: v.row ? v.row.value : null,
          readingId: v.row ? v.row.id : null,
          units: v.units,
          flag: v.flag,
          held: v.held,
          photo: !!v.row?.photoFileId,
        })),
      },
    });
  }

  const bIndex = new Map(buildings.map((b, i) => [b.id, i]));
  const bName = new Map(buildings.map((b) => [b.id, b.name]));
  const multi = new Set(walkRooms.map((w) => w.buildingId).filter((x): x is string => !!x)).size > 1;
  const groups = new Map<string, MeterWalkFloor>();
  for (const w of walkRooms) {
    let f = groups.get(w.floorKey);
    if (!f) {
      const floor = w.floorNo === null ? "ไม่ระบุชั้น" : `ชั้น ${w.floorNo}`;
      const bn = w.buildingId ? (bName.get(w.buildingId) ?? "อาคาร") : "";
      f = { key: w.floorKey, label: multi && bn ? `${bn} · ${floor}` : floor, buildingId: w.buildingId, floorNo: w.floorNo, rooms: [] };
      groups.set(w.floorKey, f);
    }
    f.rooms.push(w.room);
  }
  const floors = [...groups.values()];
  for (const f of floors) f.rooms.sort((a, b) => numericCmp(a.number, b.number));
  const BIG = Number.MAX_SAFE_INTEGER;
  const rank = (f: MeterWalkFloor) => [f.buildingId ? (bIndex.get(f.buildingId) ?? buildings.length) : BIG, f.floorNo ?? BIG] as const;
  floors.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] !== rb[0] ? ra[0] - rb[0] : ra[1] - rb[1];
  });

  const main: MeterWalkMain[] = meters
    .filter((m) => m.role === "MAIN")
    .sort((a, b) => numericCmp(`${a.buildingId ?? ""}${a.kind}${a.id}`, `${b.buildingId ?? ""}${b.kind}${b.id}`))
    .map((m) => {
      const v = viewOf(L, m, P);
      return { meterId: m.id, kind: m.kind, buildingId: m.buildingId, prevValue: v.prevValue, value: v.row ? v.row.value : null, readingId: v.row ? v.row.id : null, units: v.units, flag: v.flag };
    });

  const all = floors.flatMap((f) => f.rooms);
  return { periodKey: P, floors, main, progress: { rooms: all.length, done: all.filter((r) => r.done).length, flagged: all.filter((r) => r.flag !== null).length } };
}

export async function meterFlags(ctx: MeterCtx, input: { unitId: string; periodKey: string }): Promise<MeterFlagRow[]> {
  const g = await ledgerFor(ctx, input);
  if (!g) return [];
  const { tenantId, unitId, P, L } = g;
  const held: { m: MeterRow; v: ReadView; flag: MeterFlag }[] = [];
  for (const m of activeMeters(L)) {
    const v = viewOf(L, m, P);
    if (v.held && v.flag && v.row) held.push({ m, v, flag: v.flag });
  }
  if (!held.length) return [];
  const rooms = await roomInfo(tenantId, unitId);
  const rows = held.map(({ m, v, flag }): MeterFlagRow => {
    const a = avg3Of(L, m, P);
    return {
      readingId: (v.row as ReadRow).id,
      meterId: m.id,
      roomId: m.roomId,
      roomNumber: m.roomId ? (rooms.get(m.roomId)?.number ?? null) : null,
      kind: m.kind,
      flag,
      value: (v.row as ReadRow).value,
      prevValue: v.prevValue,
      units: v.units,
      avg3: a ? Math.round((a.sum / a.n) * 100) / 100 : null,
    };
  });
  rows.sort((a, b) => FLAG_ORDER.indexOf(a.flag) - FLAG_ORDER.indexOf(b.flag) || numericCmp(a.roomNumber ?? "~", b.roomNumber ?? "~") || numericCmp(a.kind, b.kind));
  return rows;
}

export async function heldRooms(ctx: MeterCtx, input: { unitId: string; periodKey: string }): Promise<string[]> {
  const g = await ledgerFor(ctx, input);
  if (!g) return [];
  const out = new Set<string>();
  for (const m of activeMeters(g.L)) {
    if (m.role !== "ROOM" || !m.roomId) continue;
    if (viewOf(g.L, m, g.P).held) out.add(m.roomId);
  }
  return [...out];
}

export async function periodUsage(ctx: MeterCtx, input: { unitId: string; periodKey: string }): Promise<PeriodUsageRow[]> {
  const g = await ledgerFor(ctx, input);
  if (!g) return [];
  return activeMeters(g.L)
    .sort((a, b) => numericCmp(`${a.role}${a.kind}${a.roomId ?? ""}${a.id}`, `${b.role}${b.kind}${b.roomId ?? ""}${b.id}`))
    .map((m): PeriodUsageRow => {
      const v = viewOf(g.L, m, g.P);
      return {
        meterId: m.id,
        roomId: m.roomId,
        role: m.role,
        kind: m.kind,
        prevValue: v.prevValue,
        value: v.row ? v.row.value : null,
        units: v.units,
        flag: v.flag,
        held: v.held,
        segments: v.segments.map((s) => ({ start: s.start, end: s.end })),
      };
    });
}

// ───────────────────────── SVC D.14 ▸ ข้อเสนอของระบบอ่านเลข + ตัวอย่างล่วงหน้า (ledger/svc-briefs/svc-brief-d.14.md §2 ข้อ 3 · §3.5 · §4) ─────────────────────────
//   ข้อเสนอเก็บเป็น AuditLog (ไม่มี migration · ไม่ใช่แถว DormMeterReading) — meter-ai.ts เขียน · ที่นี่อ่านตอนบันทึก (ร้าน+หน่วย+มิเตอร์+งวด ต้องตรง)
export const METER_AI_ACTION = "dorm.meter.ai.proposed";
export type MeterAiProposalRec = {
  id: string;
  meterId: string;
  periodKey: string;
  photoSha: string;
  fileId: string | null;
  source: "AI" | "MANUAL";
  manualReason: string | null;
  value: number | null;
  confidence: number | null;
  lowConfidence: boolean;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  ref: string;
  charged: boolean;
  createdAt: Date;
};
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
/** แถว AuditLog → ข้อเสนอ (รูปไม่ครบ ⇒ null) */
export function meterAiRecOf(row: { id: string; targetId: string | null; after: unknown; createdAt: Date }): MeterAiProposalRec | null {
  const a = row.after;
  if (!isRec(a) || !isStr(row.targetId) || !periodOk(a.periodKey) || !isStr(a.photoSha) || !isStr(a.ref)) return null;
  const source = a.source === "AI" ? "AI" : "MANUAL";
  return {
    id: row.id,
    meterId: row.targetId,
    periodKey: a.periodKey,
    photoSha: a.photoSha,
    fileId: strOrNull(a.fileId),
    source,
    manualReason: source === "AI" ? null : strOrNull(a.manualReason),
    value: source === "AI" && isInt(a.value) ? a.value : null,
    confidence: source === "AI" ? numOrNull(a.confidence) : null,
    lowConfidence: source === "AI" && a.lowConfidence === true,
    model: strOrNull(a.model),
    tokensIn: isInt(a.tokensIn) ? a.tokensIn : 0,
    tokensOut: isInt(a.tokensOut) ? a.tokensOut : 0,
    ref: a.ref,
    charged: a.charged === true,
    createdAt: row.createdAt,
  };
}
const AI_REC_SELECT = { id: true, targetId: true, after: true, createdAt: true } as const;
async function meterAiProposalById(tenantId: string, unitId: string, meterId: string, P: string, id: unknown): Promise<MeterAiProposalRec | null> {
  if (!isStr(id) || id.length > 64) return null;
  const row = await tenantDb({ tenantId }).auditLog.findFirst({ where: { id, tenantId, unitId, action: METER_AI_ACTION, targetType: "DormMeter", targetId: meterId }, select: AI_REC_SELECT });
  const rec = row ? meterAiRecOf(row) : null;
  return rec && rec.periodKey === P ? rec : null;
}

export type MeterPreview = { prevValue: number | null; units: number | null; flag: MeterFlag | null };
/**
 * ตัวอย่างล่วงหน้าหลายมิเตอร์ (ไม่เขียน · ผู้เรียกตรวจขอบเขตแล้ว) — กติกาเดียวกับ submitReadings (evaluateValue)
 *   value null ⇒ แค่เลขก่อนหน้า (units/flag null) · มิเตอร์ไม่อยู่ในหน่วย ⇒ ไม่มีในผล
 */
export async function meterPreviewMany(tenantId: string, unitId: string, P: string, list: { meterId: string; value: number | null }[], readAt: Date): Promise<Map<string, MeterPreview>> {
  const out = new Map<string, MeterPreview>();
  if (!list.length || !periodOk(P)) return out;
  const L = await loadLedger(scoped(tenantId, unitId), tenantId, unitId, P, [...new Set(list.map((x) => x.meterId))]);
  let cfg: Cfg | null = null;
  for (const x of list) {
    const m = L.meters.get(x.meterId);
    if (!m) continue;
    if (x.value === null || !isReading(x.value)) {
      out.set(x.meterId, { prevValue: prevOf(L, m.id, P).value, units: null, flag: null });
      continue;
    }
    cfg ??= await anomalyCfg(tenantId, unitId);
    const ev = await evaluateValue(tenantId, unitId, cfg, L, m, P, x.value, readAt);
    out.set(x.meterId, { prevValue: ev.usage.prevValue, units: ev.usage.units, flag: ev.flag });
  }
  return out;
}

/** §3.5 ▸ ผลเท่ากับที่ submitReadings จะได้ถ้าส่งค่านี้ — ไม่เขียนอะไร · ขอบเขตร้าน/หน่วยแบบ D.6 */
export async function previewReading(
  ctx: MeterCtx,
  input: { unitId: string; meterId: string; periodKey: string; value: number; readAt?: string },
): Promise<({ ok: true } & MeterPreview) | Fail> {
  const tenantId = ctx?.tenantId;
  const unitId = input?.unitId;
  if (!(await dormUnitOk(tenantId, unitId))) return fail("NOT_FOUND", "ไม่พบหอพักนี้");
  if (!isStr(input.meterId)) return fail("NOT_FOUND", "ไม่พบมิเตอร์นี้");
  if (!periodOk(input.periodKey)) return fail("INVALID_INPUT", "งวดต้องอยู่ในรูป ปปปป-ดด เช่น 2026-10");
  if (!isReading(input.value)) return fail("INVALID_INPUT", "เลขมิเตอร์ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  let readAt = new Date();
  if (input.readAt !== undefined && input.readAt !== null) {
    const d = asDate(input.readAt);
    if (!d) return fail("INVALID_INPUT", "เวลาจดไม่ถูกต้อง");
    readAt = d;
  }
  const pv = (await meterPreviewMany(tenantId, unitId, input.periodKey, [{ meterId: input.meterId, value: input.value }], readAt)).get(input.meterId);
  if (!pv) return fail("NOT_FOUND", "ไม่พบมิเตอร์นี้");
  return { ok: true, ...pv };
}
// ◂ SVC D.14
