// POS P1.9 ▸ กะ · ลิ้นชักเงินสด · รายงาน X/Z · บังคับปิดกะค้าง · เงินสดนอกกะ (มติ S1–S16 · ledger/pos-briefs/pos-brief-P1.9.md) ◂
// สัญญา = scripts/qc-pos-p1.9.mts · โน้ต ledger/wo-notes/pos-P1.9.md
// 🔴 ผู้เขียนเดียวของ PosShift / PosCashMovement / PosShiftCounter (การผูกบิลกับกะอยู่ที่ service.ts createSale/voidSale — อ่าน/ล็อกอย่างเดียว)
// 🔴 ทุกฟังก์ชันที่รับ (ctx, actor) "คืน" คำปฏิเสธ {ok:false, code, message} ไม่ throw (แบบเดียวกับหน้าขาย) · ctx = RegisterCtx
//    ขอบเขตผิด (ร้าน/ระบบ/สาขา · กะของสาขาอื่น/ร้านอื่น) = NOT_FOUND (404 ไม่ใช่ 403)
// 🔴 Z แช่แข็ง: zReport เขียนครั้งเดียวในtx ที่ปิดกะ · zReport() คืน JSON ที่เก็บไว้ตรง ๆ ไม่คำนวณใหม่ · ไม่มีโค้ดใดเขียนแถวที่ปิดแล้ว
// 🔴 ล็อก: ปิดกะ/เงินเข้าออก = แถวกะ FOR UPDATE · บิล (createSale) = FOR SHARE ⇒ ปิดกะรอบิลที่กำลังบันทึก · ทุกบิลที่ commit แล้วอยู่ใน Z
// 🔴 ไม่มี PIN ที่นี่ — PIN เป็นของ HR (verifyPin · P1.15/P3.5) · ผู้ทำรายการ = ผู้ใช้ของ session
import { randomUUID } from "node:crypto";
import { Prisma, type PosShift, type PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { posRegisterV2On, type RegisterActor, type RegisterCtx } from "./register-shared";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

// ═══════════ ค่าคงที่ + ค่าตั้ง ═══════════
/** ธนบัตร/เหรียญที่นับได้ (สตางค์) */
export const SHIFT_DENOMS = [100000, 50000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 25] as const;
export const SHIFT_FLOAT_MAX = 100_000_000;
const COUNT_MAX = 2_000_000_000; // เพดาน int4
const MOVE_MAX = 100_000_000;
const REASON_MAX = 200;
const NOTE_MAX = 200;
const LABEL_MAX = 40;
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const OTHER_METHODS = ["CARD", "PROMPTPAY", "TRANSFER"] as const;
const METHOD_ORDER = ["CASH", "CARD", "PROMPTPAY", "TRANSFER", "DEPOSIT", "ROOM_CHARGE"];
const HOUR_MS = 3_600_000;
/** R2 F1: บิลของกะสร้างหลังเปิดกะเสมอ · เผื่อนาฬิกาเครื่องแอปเหลื่อมกัน 5 นาที (กรอง shiftId อยู่แล้ว เผื่อมากไม่ทำให้ผิด) */
const SALE_CLOCK_SLACK_MS = 5 * 60_000;

export const isShiftDeviceId = (v: unknown): v is string => typeof v === "string" && DEVICE_RE.test(v);

export type PosShiftSettings = {
  requiredRegister: boolean;
  requiredOtherSources: boolean;
  blindClose: boolean;
  overShortReasonSatang: number;
  forceCloseAfterHours: number;
};
/** `AppSystem(POS).settings.pos.shift` (S6/S9/S10/S12) — ไม่ตั้ง/ค่าแปลก = ค่าปริยาย · required.register ปริยาย = ธงหน้าขายใหม่ */
export function parseShiftSettings(settings: unknown): PosShiftSettings {
  const s = (settings && typeof settings === "object" ? settings : {}) as { pos?: { shift?: unknown } | null };
  const sh = (s.pos && typeof s.pos.shift === "object" && s.pos.shift ? s.pos.shift : {}) as Record<string, unknown>;
  const req = (sh.required && typeof sh.required === "object" ? sh.required : {}) as Record<string, unknown>;
  const reason = sh.overShortReasonSatang;
  const hours = sh.forceCloseAfterHours;
  return {
    requiredRegister: typeof req.register === "boolean" ? req.register : posRegisterV2On(settings),
    requiredOtherSources: req.otherSources === true,
    blindClose: sh.blindClose === true,
    overShortReasonSatang: typeof reason === "number" && Number.isInteger(reason) && reason >= 0 ? reason : 10_000,
    forceCloseAfterHours: typeof hours === "number" && Number.isInteger(hours) && hours >= 1 && hours <= 72 ? hours : 24,
  };
}

// ═══════════ ชนิดข้อมูล ═══════════
export type ShiftRefusalCode =
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "VALIDATION"
  | "SHIFT_REQUIRED"
  | "SHIFT_ALREADY_OPEN"
  | "SHIFT_CLOSED"
  | "REASON_REQUIRED"
  | "DRAWER_INSUFFICIENT"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL";
export type ShiftRefusal = { ok: false; code: ShiftRefusalCode; message: string; shiftId?: string };

export type ShiftView = {
  id: string;
  shiftNo: number;
  status: string;
  unitId: string;
  deviceId: string;
  deviceLabel: string | null;
  openedByUserId: string;
  openedAt: string;
  floatSatang: number;
  closedByUserId: string | null;
  closedAt: string | null;
  zNumber: number | null;
  expectedCashSatang: number | null;
  countedCashSatang: number | null;
  overShortSatang: number | null;
};
export type ShiftMethodLine = { type: string; count: number; amountSatang: number; countedSatang?: number; diffSatang?: number };
export type ShiftReport = {
  shiftId: string;
  shiftNo: number;
  zNumber: number | null;
  status: string;
  unitId: string;
  deviceId: string;
  deviceLabel: string | null;
  openedByUserId: string;
  openedAt: string;
  floatSatang: number;
  billCount: number;
  salesTotalSatang: number;
  voidCount: number;
  voidTotalSatang: number;
  byMethod: ShiftMethodLine[];
  cashSalesSatang: number;
  cashTenderedSatang: number;
  changeSatang: number;
  tipSatang: number;
  cashInSatang: number;
  cashOutSatang: number;
  cashRefundsSatang: number;
  expectedCashSatang: number | null;
  // เฉพาะ Z
  countedCashSatang?: number | null;
  overShortSatang?: number | null;
  countDetail?: Record<string, number> | null;
  countedByMethod?: Record<string, number> | null;
  note?: string | null;
  closedByUserId?: string | null;
  closedAt?: string | null;
  forced?: boolean;
};

const MSG: Record<ShiftRefusalCode, string> = {
  NOT_FOUND: "ไม่พบกะนี้ หรือบัญชีนี้ใช้สาขานี้ไม่ได้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์จัดการกะ — ขอสิทธิ์จากเจ้าของร้าน",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  SHIFT_REQUIRED: "เปิดกะก่อนเริ่มขาย",
  SHIFT_ALREADY_OPEN: "เครื่องนี้มีกะที่เปิดอยู่แล้ว",
  SHIFT_CLOSED: "กะนี้ปิดแล้ว — แก้ไขไม่ได้",
  REASON_REQUIRED: "เงินขาด/เกินเกินเกณฑ์ — ใส่เหตุผลก่อนปิดกะ",
  DRAWER_INSUFFICIENT: "เงินในลิ้นชักไม่พอสำหรับยอดที่จะนำออก",
  IDEMPOTENCY_CONFLICT: "มีรายการของรหัสนี้อยู่แล้วแต่ข้อมูลไม่ตรงกัน",
  INTERNAL: "ระบบกะขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: ShiftRefusalCode, message?: string, extra?: { shiftId?: string }): ShiftRefusal => ({ ok: false, code, message: message ?? MSG[code], ...(extra ?? {}) });
const isRefusal = (v: unknown): v is ShiftRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | ShiftRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/shift] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

// ═══════════ ตัวตรวจ ═══════════
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));
const optText = (v: unknown, max: number): string | null | false => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || v.includes("\u0000")) return false;
  const t = v.trim();
  if (t.length > max) return false;
  return t.length ? t : null;
};
/** { "<ธนบัตรสตางค์>": จำนวน } — ธนบัตรที่รู้จัก · จำนวนเต็ม ≥ 0 · Σ = total · ไม่ส่ง = null · ผิด = false */
function denomDetail(v: unknown, total: number): Record<string, number> | null | false {
  if (v === undefined || v === null) return null;
  if (!isRecord(v)) return false;
  let sum = 0;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    if (!SHIFT_DENOMS.some((d) => String(d) === k)) return false;
    if (!isInt(n, 0, 10_000_000)) return false;
    sum += Number(k) * n;
    out[k] = n;
  }
  return sum === total ? out : false;
}
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

// ═══════════ ขอบเขต + สิทธิ์ ═══════════
type Scope = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor; settings: PosShiftSettings; operate: boolean; manage: boolean };

async function scopeOf(db: Db, ctx: unknown, actorRaw: unknown): Promise<Scope | ShiftRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
  const { tenantId, systemId, unitId } = ctx as RegisterCtx;
  const actor = actorOf(actorRaw);
  if (!actor) return refuse("PERMISSION_DENIED");
  const [sys, link, unit] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { settings: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
  ]);
  if (!sys || !link || link.systemId !== systemId || !unit) return refuse("NOT_FOUND");
  if (!canAccessUnit(actor, unitId)) return refuse("NOT_FOUND");
  const operate = evaluate(actor, { module: "pos", action: "pos.shift.operate", unitId });
  const manage = evaluate(actor, { module: "pos", action: "pos.shift.manage", unitId });
  return { tenantId, systemId, unitId, actor, settings: parseShiftSettings(sys.settings), operate, manage };
}

/** กะของขอบเขตนี้ (ร้าน + ระบบ + สาขา) — อื่น = null (NOT_FOUND) */
async function shiftInScope(db: Db | Tx, s: Scope, shiftId: unknown): Promise<PosShift | null> {
  if (!isId(shiftId)) return null;
  return db.posShift.findFirst({ where: { id: shiftId, tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId } });
}

/** ล็อกแถวกะ FOR UPDATE ในtx (ขอบเขตเดียวกัน) แล้วอ่านแถวล่าสุด */
async function lockShift(tx: Tx, s: { tenantId: string; unitId: string; systemId: string }, shiftId: string): Promise<PosShift | null> {
  const got = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "PosShift" WHERE id = ${shiftId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "systemId" = ${s.systemId} FOR UPDATE`;
  if (!got.length) return null;
  return tx.posShift.findUnique({ where: { id: shiftId } });
}

function viewOf(r: PosShift): ShiftView {
  return {
    id: r.id,
    shiftNo: r.shiftNo,
    status: r.status,
    unitId: r.unitId,
    deviceId: r.deviceId,
    deviceLabel: r.deviceLabel,
    openedByUserId: r.openedByUserId,
    openedAt: r.openedAt.toISOString(),
    floatSatang: r.floatSatang,
    closedByUserId: r.closedByUserId,
    closedAt: iso(r.closedAt),
    zNumber: r.zNumber,
    expectedCashSatang: r.expectedCashSatang,
    countedCashSatang: r.countedCashSatang,
    overShortSatang: r.overShortSatang,
  };
}

const isStale = (r: Pick<PosShift, "status" | "openedAt">, hours: number, now: Date) => r.status === "OPEN" && r.openedAt.getTime() + hours * HOUR_MS < now.getTime();

const isUniqueViolation = (e: unknown): boolean => {
  const o = e as { code?: unknown; message?: unknown } | null;
  return o?.code === "P2002" || /\b23505\b|Unique constraint|one_open_shift_per_device/i.test(String(o?.message ?? ""));
};

function runTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction((tx) => fn(tx), { timeout: 20_000, maxWait: 10_000 });
}

/** ตัวนับต่อสาขา (upsert อะตอมมิกในtx · rollback = ไม่ขยับ) */
async function bumpCounter(tx: Tx, tenantId: string, unitId: string, field: "shiftSeq" | "zSeq"): Promise<number> {
  const rows =
    field === "shiftSeq"
      ? await tx.$queryRaw<{ v: number }[]>`
          INSERT INTO "PosShiftCounter" ("id", "tenantId", "unitId", "shiftSeq", "zSeq") VALUES (${randomUUID()}, ${tenantId}, ${unitId}, 1, 0)
          ON CONFLICT ("unitId") DO UPDATE SET "shiftSeq" = "PosShiftCounter"."shiftSeq" + 1 RETURNING "shiftSeq" AS v`
      : await tx.$queryRaw<{ v: number }[]>`
          INSERT INTO "PosShiftCounter" ("id", "tenantId", "unitId", "shiftSeq", "zSeq") VALUES (${randomUUID()}, ${tenantId}, ${unitId}, 0, 1)
          ON CONFLICT ("unitId") DO UPDATE SET "zSeq" = "PosShiftCounter"."zSeq" + 1 RETURNING "zSeq" AS v`;
  return Number(rows[0]!.v);
}

// ═══════════ รายงาน (S7/S9) — คำนวณสด อ่านอย่างเดียว ═══════════
async function computeReport(db: Db | Tx, r: PosShift): Promise<ShiftReport> {
  const sales = await db.posSale.findMany({
    // R2 F1: createdAt >= openedAt ⇒ ใช้ดัชนี (tenantId, unitId, createdAt) ขณะถือล็อกแถวกะ (ไม่สแกนทั้งสาขา)
    where: { tenantId: r.tenantId, unitId: r.unitId, createdAt: { gte: new Date(r.openedAt.getTime() - SALE_CLOCK_SLACK_MS) }, shiftId: r.id },
    select: { id: true, status: true, grandTotalSatang: true, tipSatang: true },
    orderBy: { id: "asc" },
  });
  // P1.8 (ใบคืนเงิน) ยังไม่มี docType ⇒ cashRefunds = 0 · P1.8 ต้องผูกใบคืนกับกะของเครื่องที่คืน แล้วหักที่นี่
  const live = sales.filter((x) => x.status !== "VOIDED");
  const voided = sales.filter((x) => x.status === "VOIDED");
  const pays = live.length
    ? await db.posPayment.findMany({
        where: { tenantId: r.tenantId, saleId: { in: live.map((x) => x.id) } },
        select: { type: true, amountSatang: true, tenderedSatang: true, changeSatang: true },
      })
    : [];
  const moves = await db.posCashMovement.findMany({ where: { tenantId: r.tenantId, shiftId: r.id }, select: { kind: true, amountSatang: true } });
  const by = new Map<string, { count: number; amount: number }>();
  let cashSales = 0;
  let tendered = 0;
  let change = 0;
  for (const p of pays) {
    const b = by.get(p.type) ?? { count: 0, amount: 0 };
    b.count += 1;
    b.amount += p.amountSatang;
    by.set(p.type, b);
    if (p.type === "CASH") {
      cashSales += p.amountSatang;
      tendered += p.tenderedSatang ?? p.amountSatang;
      change += p.changeSatang ?? 0;
    }
  }
  const cashIn = moves.filter((m) => m.kind === "IN").reduce((t, m) => t + m.amountSatang, 0);
  const cashOut = moves.filter((m) => m.kind === "OUT").reduce((t, m) => t + m.amountSatang, 0);
  const refunds = 0;
  const types = [...by.keys()].sort((a, b) => (METHOD_ORDER.indexOf(a) + 1 || 99) - (METHOD_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
  return {
    shiftId: r.id,
    shiftNo: r.shiftNo,
    zNumber: r.zNumber,
    status: r.status,
    unitId: r.unitId,
    deviceId: r.deviceId,
    deviceLabel: r.deviceLabel,
    openedByUserId: r.openedByUserId,
    openedAt: r.openedAt.toISOString(),
    floatSatang: r.floatSatang,
    billCount: live.length,
    salesTotalSatang: live.reduce((t, x) => t + x.grandTotalSatang, 0),
    voidCount: voided.length,
    voidTotalSatang: voided.reduce((t, x) => t + x.grandTotalSatang, 0),
    byMethod: types.map((t) => ({ type: t, count: by.get(t)!.count, amountSatang: by.get(t)!.amount })),
    cashSalesSatang: cashSales,
    cashTenderedSatang: tendered,
    changeSatang: change,
    tipSatang: live.reduce((t, x) => t + (x.tipSatang ?? 0), 0),
    cashInSatang: cashIn,
    cashOutSatang: cashOut,
    cashRefundsSatang: refunds,
    // S7: float + รับ − ทอน + เข้า − ออก − คืน (= float + ขายเงินสด + เข้า − ออก − คืน)
    expectedCashSatang: r.floatSatang + tendered - change + cashIn - cashOut - refunds,
  };
}

/** ปิดกะในtx ที่ล็อกแถวแล้ว — เขียน Z แช่แข็ง + event (S10/S12) · คืนแถวหลังปิด */
async function finalizeClose(
  tx: Tx,
  r: PosShift,
  c: { forced: boolean; counted: number | null; countDetail: Record<string, number> | null; countedOther: Record<string, number> | null; note: string | null; byUserId: string | null; closeKey: string | null; now: Date },
): Promise<PosShift> {
  const rep = await computeReport(tx, r);
  const expected = rep.expectedCashSatang!;
  const overShort = c.counted === null ? null : c.counted - expected;
  const zNumber = await bumpCounter(tx, r.tenantId, r.unitId, "zSeq");
  const byMethod = rep.byMethod.map((m) => ({ ...m }));
  if (c.countedOther) {
    for (const [t, v] of Object.entries(c.countedOther)) {
      let m = byMethod.find((x) => x.type === t);
      if (!m) {
        m = { type: t, count: 0, amountSatang: 0 };
        byMethod.push(m);
      }
      m.countedSatang = v;
      m.diffSatang = v - m.amountSatang;
    }
  }
  const status = c.forced ? "FORCE_CLOSED" : "CLOSED";
  const z: ShiftReport = {
    ...rep,
    byMethod,
    zNumber,
    status,
    countedCashSatang: c.counted,
    overShortSatang: overShort,
    countDetail: c.countDetail,
    countedByMethod: c.countedOther,
    note: c.note,
    closedByUserId: c.byUserId,
    closedAt: c.now.toISOString(),
    forced: c.forced,
  };
  const row = await tx.posShift.update({
    where: { id: r.id },
    data: {
      status,
      closedByUserId: c.byUserId,
      closedAt: c.now,
      expectedCashSatang: expected,
      countedCashSatang: c.counted,
      overShortSatang: overShort,
      countDetail: c.countDetail ?? Prisma.DbNull,
      countedByMethod: c.countedOther ?? Prisma.DbNull,
      closeNote: c.note,
      closeKey: c.closeKey,
      zNumber,
      zReport: z as unknown as Prisma.InputJsonValue,
    },
  });
  await emitOutbox(tx, {
    tenantId: r.tenantId,
    type: "pos.shift.closed",
    idempotencyKey: `PosShift#${r.id}#CLOSED`,
    payload: { shiftId: r.id, unitId: r.unitId, deviceId: r.deviceId, zNumber, expectedCashSatang: expected, countedCashSatang: c.counted, overShortSatang: overShort, forced: c.forced },
    systemId: r.systemId,
    unitId: r.unitId,
  });
  return row;
}

/** บังคับปิดกะเดียว (S12) — ล็อกแล้วตรวจซ้ำ: ไม่ OPEN หรือยังไม่เกินเวลา = null */
async function forceCloseOne(db: Db, shiftId: string, hours: number, now: Date): Promise<string | null> {
  const done = await runTx(db, async (tx) => {
    const got = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PosShift" WHERE id = ${shiftId} FOR UPDATE`;
    if (!got.length) return null;
    const r = await tx.posShift.findUnique({ where: { id: shiftId } });
    if (!r || !isStale(r, hours, now)) return null;
    await finalizeClose(tx, r, { forced: true, counted: null, countDetail: null, countedOther: null, note: null, byUserId: null, closeKey: null, now });
    return r.id;
  });
  if (done) scheduleDrain();
  return done;
}

/** กะ OPEN ของ (สาขา, เครื่อง) — เกินเวลา = บังคับปิดก่อน (S12 ขี้เกียจ) */
async function openShiftOfDevice(db: Db, s: { tenantId: string; unitId: string; systemId: string }, deviceId: string, hours: number, now = new Date()): Promise<{ shift: PosShift | null; forcedId: string | null }> {
  const r = await db.posShift.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, deviceId, status: "OPEN" } });
  if (!r) return { shift: null, forcedId: null };
  if (isStale(r, hours, now)) {
    const forcedId = await forceCloseOne(db, r.id, hours, now);
    const again = await db.posShift.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, deviceId, status: "OPEN" } });
    return { shift: again && !isStale(again, hours, now) ? again : null, forcedId };
  }
  return { shift: r.systemId === s.systemId ? r : null, forcedId: null };
}

// ═══════════ API ═══════════
export type OpenShiftInput = { deviceId: string; deviceLabel?: string | null; floatSatang: number; floatDetail?: Record<string, number> | null };
export type OpenShiftResult = { ok: true; shift: ShiftView; forceClosedShiftId?: string } | ShiftRefusal;

/** เปิดกะ (S4) — เครื่องมีกะ OPEN แล้ว = SHIFT_ALREADY_OPEN + shiftId (จอรับกะนั้นต่อ · ไม่มีคีย์กันซ้ำ) */
export async function openShift(ctx: RegisterCtx, actor: RegisterActor, input: OpenShiftInput, client?: Db): Promise<OpenShiftResult> {
  return guard("openShift", async (): Promise<OpenShiftResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!s.operate && !s.manage) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["deviceId", "deviceLabel", "floatSatang", "floatDetail"])) return refuse("VALIDATION");
    if (!isShiftDeviceId(input.deviceId)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    const label = optText(input.deviceLabel, LABEL_MAX);
    if (label === false) return refuse("VALIDATION", `ชื่อเครื่องยาวได้ไม่เกิน ${LABEL_MAX} ตัวอักษร`);
    if (!isInt(input.floatSatang, 0, SHIFT_FLOAT_MAX)) return refuse("VALIDATION", "เงินทอนตั้งต้นต้องเป็นจำนวนเต็มสตางค์ 0 – 1,000,000 บาท");
    const detail = denomDetail(input.floatDetail, input.floatSatang);
    if (detail === false) return refuse("VALIDATION", "จำนวนธนบัตร/เหรียญรวมไม่เท่าเงินทอนตั้งต้น");
    const deviceId = input.deviceId;

    const cur = await openShiftOfDevice(db, s, deviceId, s.settings.forceCloseAfterHours);
    if (cur.shift) return refuse("SHIFT_ALREADY_OPEN", undefined, { shiftId: cur.shift.id });
    let created: PosShift;
    try {
      created = await runTx(db, async (tx) => {
        const shiftNo = await bumpCounter(tx, s.tenantId, s.unitId, "shiftSeq");
        const row = await tx.posShift.create({
          data: {
            tenantId: s.tenantId,
            unitId: s.unitId,
            systemId: s.systemId,
            deviceId,
            deviceLabel: label,
            shiftNo,
            status: "OPEN",
            openedByUserId: s.actor.userId,
            floatSatang: input.floatSatang,
            floatDetail: detail ?? Prisma.DbNull,
          },
        });
        await emitOutbox(tx, {
          tenantId: s.tenantId,
          type: "pos.shift.opened",
          idempotencyKey: `PosShift#${row.id}#OPENED`,
          payload: { shiftId: row.id, unitId: s.unitId, deviceId, shiftNo, floatSatang: input.floatSatang },
          systemId: s.systemId,
          unitId: s.unitId,
        });
        return row;
      });
    } catch (e) {
      // แข่งเปิดบนเครื่องเดียวกัน: partial unique one_open_shift_per_device ตัดสิน — ผู้แพ้ rollback (ตัวนับไม่ขยับ)
      if (!isUniqueViolation(e)) throw e;
      const w = await db.posShift.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, deviceId, status: "OPEN" }, select: { id: true } });
      return refuse("SHIFT_ALREADY_OPEN", undefined, w ? { shiftId: w.id } : undefined);
    }
    scheduleDrain();
    return { ok: true, shift: viewOf(created), ...(cur.forcedId ? { forceClosedShiftId: cur.forcedId } : {}) };
  });
}

export type CurrentShiftResult = { ok: true; shift: ShiftView | null; forceClosedShiftId?: string } | ShiftRefusal;
/** กะ OPEN ของเครื่องนี้ (null = ยังไม่เปิด) — กะค้างเกินเวลาถูกบังคับปิดที่นี่ (S12) */
export async function currentShift(ctx: RegisterCtx, actor: RegisterActor, input: { deviceId: string }, client?: Db): Promise<CurrentShiftResult> {
  return guard("currentShift", async (): Promise<CurrentShiftResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    const canSell = evaluate(s.actor, { module: "pos", action: "pos.sale.create", unitId: s.unitId });
    if (!s.operate && !s.manage && !canSell) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !isShiftDeviceId(input.deviceId)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    const cur = await openShiftOfDevice(db, s, input.deviceId, s.settings.forceCloseAfterHours);
    return { ok: true, shift: cur.shift ? viewOf(cur.shift) : null, ...(cur.forcedId ? { forceClosedShiftId: cur.forcedId } : {}) };
  });
}

export type ShiftReportResult = { ok: true; report: ShiftReport } | ShiftRefusal;
/** รายงาน X (S9) — คำนวณสด ไม่เขียนอะไร · กะที่ปิดแล้ว = Z ที่เก็บไว้ · blindClose: ไม่มี manage ไม่เห็นยอดที่ควรมีระหว่างกะเปิด */
export async function xReport(ctx: RegisterCtx, actor: RegisterActor, input: { shiftId: string }, client?: Db): Promise<ShiftReportResult> {
  return guard("xReport", async (): Promise<ShiftReportResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!s.operate && !s.manage) return refuse("PERMISSION_DENIED");
    const r = await shiftInScope(db, s, isRecord(input) ? input.shiftId : undefined);
    if (!r) return refuse("NOT_FOUND");
    if (r.status !== "OPEN" && r.zReport) return { ok: true, report: r.zReport as unknown as ShiftReport };
    const rep = await computeReport(db, r);
    if (s.settings.blindClose && !s.manage && r.status === "OPEN") rep.expectedCashSatang = null;
    return { ok: true, report: rep };
  });
}

/** รายงาน Z (S10) — JSON ที่แช่แข็งตอนปิดตรง ๆ ไม่คำนวณใหม่ · operate = ของตัวเอง · manage = ทุกกะของสาขา */
export async function zReport(ctx: RegisterCtx, actor: RegisterActor, input: { shiftId: string }, client?: Db): Promise<ShiftReportResult> {
  return guard("zReport", async (): Promise<ShiftReportResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!s.operate && !s.manage) return refuse("PERMISSION_DENIED");
    const r = await shiftInScope(db, s, isRecord(input) ? input.shiftId : undefined);
    if (!r) return refuse("NOT_FOUND");
    if (!s.manage && r.openedByUserId !== s.actor.userId) return refuse("PERMISSION_DENIED");
    if (r.status === "OPEN" || !r.zReport) return refuse("VALIDATION", "กะนี้ยังไม่ปิด — ดูรายงาน X แทน");
    return { ok: true, report: r.zReport as unknown as ShiftReport };
  });
}

export type CloseShiftInput = {
  shiftId: string;
  countedCashSatang: number;
  countDetail?: Record<string, number> | null;
  countedOther?: Partial<Record<(typeof OTHER_METHODS)[number], number>> | null;
  note?: string | null;
  idempotencyKey: string;
};
export type CloseShiftResult = { ok: true; shift: ShiftView; report: ShiftReport; duplicated?: boolean } | ShiftRefusal;

/** ปิดกะ + Z (S10) — ล็อก FOR UPDATE · คีย์เดิมของผู้ชนะ = Z เดิม duplicated · แข่งปิด = ผู้ชนะคนเดียว ที่เหลือ SHIFT_CLOSED */
export async function closeShift(ctx: RegisterCtx, actor: RegisterActor, input: CloseShiftInput, client?: Db): Promise<CloseShiftResult> {
  return guard("closeShift", async (): Promise<CloseShiftResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!s.operate && !s.manage) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["shiftId", "countedCashSatang", "countDetail", "countedOther", "note", "idempotencyKey"])) return refuse("VALIDATION");
    if (!isId(input.shiftId)) return refuse("NOT_FOUND");
    if (!isId(input.idempotencyKey)) return refuse("VALIDATION", "ไม่มีรหัสรายการ");
    if (!isInt(input.countedCashSatang, 0, COUNT_MAX)) return refuse("VALIDATION", "ยอดนับต้องเป็นจำนวนเต็มสตางค์ ไม่ติดลบ");
    const counted = input.countedCashSatang;
    const detail = denomDetail(input.countDetail, counted);
    if (detail === false) return refuse("VALIDATION", "จำนวนธนบัตร/เหรียญรวมไม่เท่ายอดนับ");
    let other: Record<string, number> | null = null;
    if (input.countedOther !== undefined && input.countedOther !== null) {
      if (!isRecord(input.countedOther)) return refuse("VALIDATION");
      other = {};
      for (const [k, v] of Object.entries(input.countedOther)) {
        if (!(OTHER_METHODS as readonly string[]).includes(k) || !isInt(v, 0, COUNT_MAX)) return refuse("VALIDATION", "ยอดนับของวิธีชำระอื่นไม่ถูกต้อง");
        other[k] = v;
      }
    }
    const note = optText(input.note, NOTE_MAX);
    if (note === false) return refuse("VALIDATION", `เหตุผลยาวได้ไม่เกิน ${NOTE_MAX} ตัวอักษร`);
    const key = input.idempotencyKey;
    const shiftId = input.shiftId;

    const out = await runTx(db, async (tx): Promise<CloseShiftResult> => {
      const r = await lockShift(tx, s, shiftId);
      if (!r) return refuse("NOT_FOUND");
      if (r.status !== "OPEN") {
        if (r.closeKey === key && r.zReport) return { ok: true, shift: viewOf(r), report: r.zReport as unknown as ShiftReport, duplicated: true };
        return refuse("SHIFT_CLOSED");
      }
      if (r.openedByUserId !== s.actor.userId && !s.manage) return refuse("PERMISSION_DENIED", "ปิดกะของคนอื่นต้องมีสิทธิ์จัดการกะ");
      const rep = await computeReport(tx, r);
      const os = counted - rep.expectedCashSatang!;
      if (Math.abs(os) > s.settings.overShortReasonSatang && !note) return refuse("REASON_REQUIRED");
      const row = await finalizeClose(tx, r, { forced: false, counted, countDetail: detail, countedOther: other, note, byUserId: s.actor.userId, closeKey: key, now: new Date() });
      return { ok: true, shift: viewOf(row), report: row.zReport as unknown as ShiftReport };
    });
    if (out.ok && !out.duplicated) scheduleDrain();
    return out;
  });
}

export type CashMovementInput = { shiftId: string; kind: "IN" | "OUT"; amountSatang: number; reason: string; idempotencyKey: string };
export type CashMovementView = { id: string; shiftId: string; kind: string; amountSatang: number; reason: string; byUserId: string; createdAt: string };
export type CashMovementResult = { ok: true; movement: CashMovementView; duplicated?: boolean } | ShiftRefusal;
const moveView = (m: { id: string; shiftId: string; kind: string; amountSatang: number; reason: string; byUserId: string; createdAt: Date }): CashMovementView => ({
  id: m.id,
  shiftId: m.shiftId,
  kind: m.kind,
  amountSatang: m.amountSatang,
  reason: m.reason,
  byUserId: m.byUserId,
  createdAt: m.createdAt.toISOString(),
});

/** เงินเข้า/ออกลิ้นชัก (S8) — กะต้อง OPEN · OUT เกินเงินที่ควรมี = DRAWER_INSUFFICIENT · คีย์ซ้ำ payload เดิม = แถวเดิม */
export async function recordCashMovement(ctx: RegisterCtx, actor: RegisterActor, input: CashMovementInput, client?: Db): Promise<CashMovementResult> {
  return guard("recordCashMovement", async (): Promise<CashMovementResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!s.operate && !s.manage) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !onlyKeys(input, ["shiftId", "kind", "amountSatang", "reason", "idempotencyKey"])) return refuse("VALIDATION");
    if (input.kind !== "IN" && input.kind !== "OUT") return refuse("VALIDATION", "ชนิดรายการต้องเป็นเงินเข้าหรือเงินออก");
    if (!isInt(input.amountSatang, 1, MOVE_MAX)) return refuse("VALIDATION", "จำนวนเงินต้องเป็นจำนวนเต็มสตางค์มากกว่า 0");
    const reason = optText(input.reason, REASON_MAX);
    if (!reason) return refuse("VALIDATION", `ใส่เหตุผล 1–${REASON_MAX} ตัวอักษร`);
    if (!isId(input.idempotencyKey)) return refuse("VALIDATION", "ไม่มีรหัสรายการ");
    if (!isId(input.shiftId)) return refuse("NOT_FOUND");
    const { kind, amountSatang, idempotencyKey, shiftId } = input;

    const same = (m: { unitId: string; shiftId: string; kind: string; amountSatang: number; reason: string }) =>
      m.unitId === s.unitId && m.shiftId === shiftId && m.kind === kind && m.amountSatang === amountSatang && m.reason === reason;
    const prior = async (): Promise<CashMovementResult | null> => {
      const m = await db.posCashMovement.findUnique({ where: { tenantId_idempotencyKey: { tenantId: s.tenantId, idempotencyKey } } });
      if (!m) return null;
      return same(m) ? { ok: true, movement: moveView(m), duplicated: true } : refuse("IDEMPOTENCY_CONFLICT");
    };
    const p0 = await prior();
    if (p0) return p0;
    try {
      return await runTx(db, async (tx): Promise<CashMovementResult> => {
        const r = await lockShift(tx, s, shiftId);
        if (!r) return refuse("NOT_FOUND");
        if (r.status !== "OPEN") return refuse("SHIFT_CLOSED");
        if (r.openedByUserId !== s.actor.userId && !s.manage) return refuse("PERMISSION_DENIED", "ทำรายการในกะของคนอื่นต้องมีสิทธิ์จัดการกะ");
        if (kind === "OUT") {
          const rep = await computeReport(tx, r);
          if (amountSatang > rep.expectedCashSatang!) return refuse("DRAWER_INSUFFICIENT");
        }
        const m = await tx.posCashMovement.create({
          data: { tenantId: s.tenantId, unitId: s.unitId, shiftId, kind, amountSatang, reason, byUserId: s.actor.userId, idempotencyKey },
        });
        return { ok: true, movement: moveView(m) };
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      return (await prior()) ?? refuse("IDEMPOTENCY_CONFLICT");
    }
  });
}

export type ListShiftsResult = { ok: true; items: ShiftView[] } | ShiftRefusal;
/** ประวัติกะของสาขา (ใหม่ก่อน) — manage = ทุกกะ · operate = ของตัวเอง */
export async function listShifts(ctx: RegisterCtx, actor: RegisterActor, input: { limit?: number } = {}, client?: Db): Promise<ListShiftsResult> {
  return guard("listShifts", async (): Promise<ListShiftsResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!s.operate && !s.manage) return refuse("PERMISSION_DENIED");
    const lim = isRecord(input) && input.limit !== undefined ? input.limit : 50;
    if (!isInt(lim, 1, 200)) return refuse("VALIDATION");
    const rows = await db.posShift.findMany({
      where: { tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId, ...(s.manage ? {} : { openedByUserId: s.actor.userId }) },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      take: lim,
    });
    return { ok: true, items: rows.map(viewOf) };
  });
}

export type OffShiftBill = { saleId: string; receiptNo: string | null; sourceModule: string; cashSatang: number; createdAt: string };
export type OffShiftCashResult = { ok: true; businessDate: string; totalSatang: number; bills: OffShiftBill[] } | ShiftRefusal;
/** เงินสดนอกกะ (S16 · D17) — ส่วน CASH ของบิลที่ไม่ VOIDED และไม่ผูกกะของสาขา ในวันทำการ (เวลาไทย) · ต้องมี manage */
export async function offShiftCash(ctx: RegisterCtx, actor: RegisterActor, input: { businessDate?: string } = {}, client?: Db): Promise<OffShiftCashResult> {
  return guard("offShiftCash", async (): Promise<OffShiftCashResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor);
    if (isRefusal(s)) return s;
    if (!s.manage) return refuse("PERMISSION_DENIED");
    const bd = isRecord(input) && input.businessDate !== undefined ? input.businessDate : new Date(Date.now() + 7 * HOUR_MS).toISOString().slice(0, 10);
    if (typeof bd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bd) || Number.isNaN(Date.parse(`${bd}T00:00:00Z`))) return refuse("VALIDATION", "วันที่ไม่ถูกต้อง");
    const start = new Date(Date.parse(`${bd}T00:00:00Z`) - 7 * HOUR_MS);
    const end = new Date(start.getTime() + 24 * HOUR_MS);
    const sales = await db.posSale.findMany({
      where: { tenantId: s.tenantId, unitId: s.unitId, shiftId: null, status: { not: "VOIDED" }, createdAt: { gte: start, lt: end } },
      select: { id: true, receiptNo: true, sourceModule: true, createdAt: true, payments: { where: { type: "CASH" }, select: { amountSatang: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const bills = sales
      .map((x) => ({ saleId: x.id, receiptNo: x.receiptNo, sourceModule: x.sourceModule, cashSatang: x.payments.reduce((t, p) => t + p.amountSatang, 0), createdAt: x.createdAt.toISOString() }))
      .filter((b) => b.cashSatang !== 0);
    return { ok: true, businessDate: bd, totalSatang: bills.reduce((t, b) => t + b.cashSatang, 0), bills };
  });
}

/**
 * ระดับระบบ (S12): บังคับปิดกะ OPEN ที่เกิน `forceCloseAfterHours` ของระบบตัวเอง — /api/cron/hourly เรียกทุกชั่วโมง (best-effort)
 * ล้มรายกะ = ข้าม (รอบหน้าลองใหม่) · คืน id ที่ปิดในรอบนี้
 */
export async function forceCloseStaleShifts(opts: { now?: Date; tenantId?: string } = {}, client?: Db): Promise<{ closed: string[] }> {
  const db = client ?? prisma;
  const now = opts.now ?? new Date();
  const cands = await db.posShift.findMany({
    where: { status: "OPEN", openedAt: { lt: new Date(now.getTime() - HOUR_MS) }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
    select: { id: true, systemId: true, openedAt: true, status: true },
    orderBy: { openedAt: "asc" },
    take: 500,
  });
  if (!cands.length) return { closed: [] };
  const systems = await db.appSystem.findMany({ where: { id: { in: [...new Set(cands.map((c) => c.systemId))] } }, select: { id: true, settings: true } });
  const hoursOf = new Map(systems.map((x) => [x.id, parseShiftSettings(x.settings).forceCloseAfterHours]));
  const closed: string[] = [];
  for (const c of cands) {
    const h = hoursOf.get(c.systemId) ?? 24;
    if (!isStale(c, h, now)) continue;
    try {
      const id = await forceCloseOne(db, c.id, h, now);
      if (id) closed.push(id);
    } catch (e) {
      console.error(`[pos/shift] forceCloseStaleShifts ${c.id}`, e);
    }
  }
  return { closed };
}

// ═══════════ ตะเข็บหน้าขาย (register.ts) ═══════════
export type RegisterShiftView = { id: string; shiftNo: number; openedAt: string; openedByName: string; deviceLabel: string | null };

/**
 * กะของบิลจากหน้าขาย (S5/S6) — ok = shiftId ที่จะส่งเข้า createSale (null = นอกกะ) · บังคับมีกะแต่ไม่มี = SHIFT_REQUIRED
 * กะค้างเกินเวลาถูกบังคับปิดก่อน (S12) แล้วตัดสินตามค่าตั้ง
 */
export async function resolveRegisterShift(
  db: Db,
  s: { tenantId: string; systemId: string; unitId: string },
  deviceId: string | undefined,
): Promise<{ ok: true; shiftId: string | null } | ShiftRefusal> {
  const sys = await db.appSystem.findFirst({ where: { id: s.systemId, tenantId: s.tenantId }, select: { settings: true } });
  const st = parseShiftSettings(sys?.settings);
  const cur = deviceId ? await openShiftOfDevice(db, s, deviceId, st.forceCloseAfterHours) : { shift: null };
  if (cur.shift) return { ok: true, shiftId: cur.shift.id };
  return st.requiredRegister ? refuse("SHIFT_REQUIRED") : { ok: true, shiftId: null };
}

/** แถบสถานะหน้าขาย (S15) — อ่านอย่างเดียว (ไม่บังคับปิด) · กะค้างเกินเวลา = แสดงเป็นไม่มีกะ */
export async function registerShiftStatus(
  db: Db,
  s: { tenantId: string; systemId: string; unitId: string },
  deviceId: string | undefined,
): Promise<{ shift: RegisterShiftView | null; required: boolean }> {
  const sys = await db.appSystem.findFirst({ where: { id: s.systemId, tenantId: s.tenantId }, select: { settings: true } });
  const st = parseShiftSettings(sys?.settings);
  if (!deviceId) return { shift: null, required: st.requiredRegister };
  const r = await db.posShift.findFirst({ where: { tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId, deviceId, status: "OPEN" } });
  if (!r || isStale(r, st.forceCloseAfterHours, new Date())) return { shift: null, required: st.requiredRegister };
  const u = await db.user.findUnique({ where: { id: r.openedByUserId }, select: { name: true, email: true } });
  return {
    shift: { id: r.id, shiftNo: r.shiftNo, openedAt: r.openedAt.toISOString(), openedByName: u?.name?.trim() || u?.email || "-", deviceLabel: r.deviceLabel },
    required: st.requiredRegister,
  };
}
